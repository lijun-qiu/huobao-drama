import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateVoiceSample } from '../services/tts-generation.js'
import { generateImage } from '../services/image-generation.js'
import { generateCharacterAppearance, resolveCharacterPortraitGeneration, resolvePortraitImageModel, resolvePortraitImageSize, variantNeedsYouthPortraitReference, variantPortraitSortOrder, getVariantAgeGroup, finalizeCharacterAppearance } from '../services/narration-characters.js'
import { sanitizePortraitAppearanceForGeneration } from '../constants/portrait-reference.js'
import { buildCharacterAppearanceContext } from '../services/ai-description-context.js'
import { recognizePortraitImage } from '../services/kling-image-recognize.js'
import { validateCharacterPortraitStyle } from '../services/portrait-style-validate.js'
import { resolveEpisodeTextModel, resolveEpisodeTextThinking, DEFAULT_LOCAL_VISION_MODEL } from '../constants/text-models.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { resolveEpisodeImageModel, imageModelSupportsReferenceImages } from '../constants/image-models.js'
import { resolveEpisodeProductionMode, isLocalComicMode, usesLocalModelPipeline, parseProductionMode, isDialoguePortraitMode } from '../constants/production-mode.js'
import { normalizeArtStyle, sanitizeCharacterAppearance, isNarrationMinimalStyle, resolveEpisodeVisualStyle, resolveNarrationImageStyle } from '../constants/art-styles.js'
import { isMotionComicStyle } from '../constants/motion-comic.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'
import { logTaskError, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

const app = new Hono()

function parseUseReference(body: Record<string, unknown>): boolean {
  if (body.use_reference === false || body.useReference === false) return false
  return true
}

function resolvePortraitStyleFromRequest(
  episodeId: number,
  drama: typeof schema.dramas.$inferSelect | undefined,
  source?: { imageStyle?: unknown; image_style?: unknown; style?: unknown },
): string {
  const imageStyle = source?.imageStyle ?? source?.image_style ?? source?.style
  return resolveEpisodeVisualStyle(episodeId, {
    imageStyle: imageStyle ? String(imageStyle) : undefined,
    dramaStyle: drama?.style,
  })
}

function resolvePortraitReferenceImages(
  resolved: ReturnType<typeof resolveCharacterPortraitGeneration>,
  model: string,
  useReference: boolean,
) {
  if (!useReference) return undefined
  if (!imageModelSupportsReferenceImages(model)) return undefined
  return resolved.referenceImages
}

async function waitForCharacterImage(characterId: number, timeoutMs = 180_000, intervalMs = 2500): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
    if (char?.imageUrl?.trim()) return true
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return false
}

async function submitCharacterPortrait(
  char: typeof schema.characters.$inferSelect,
  ep: typeof schema.episodes.$inferSelect,
  style: string,
  useReference = true,
  textModel?: string | null,
) {
  const model = resolvePortraitImageModel(resolveEpisodeImageModel(ep, undefined, resolveEpisodeProductionMode(ep.id)), char.variantLabel)
  let appearance = char.appearance || ''
  const cleanedAppearance = sanitizePortraitAppearanceForGeneration(
    await finalizeCharacterAppearance(appearance || char.description || '', {
      name: char.name,
      role: char.role,
      minimal: isNarrationMinimalStyle(style),
      motionComic: isMotionComicStyle(style),
      textModel,
      // 生图阶段禁止拉 LLM：否则会 unload Comfy 并导致 execution_interrupted
      allowLlmEnrichment: false,
    }),
  )
  if (cleanedAppearance && cleanedAppearance !== appearance) {
    appearance = cleanedAppearance
    db.update(schema.characters).set({ appearance, updatedAt: now() }).where(eq(schema.characters.id, char.id)).run()
  } else if (cleanedAppearance) {
    appearance = cleanedAppearance
  }
  const resolved = resolveCharacterPortraitGeneration({
    id: char.id,
    name: char.name,
    dramaId: char.dramaId,
    appearance,
    description: char.description,
    personality: char.personality,
    role: char.role,
    variantLabel: char.variantLabel,
    imageUrl: char.imageUrl,
  }, style, { useReference })

  if (useReference && resolved.referenceCharacterId) {
    logTaskStart('CharacterImage', 'portrait-reference', {
      characterId: char.id,
      referenceCharacterId: resolved.referenceCharacterId,
      referenceVariant: resolved.referenceCharacterVariant,
    })
  } else if (useReference && imageModelSupportsReferenceImages(model)) {
    logTaskWarn('CharacterImage', 'no-portrait-reference', {
      characterId: char.id,
      name: char.name,
      variantLabel: char.variantLabel,
    })
  }

  const referenceImages = resolvePortraitReferenceImages(resolved, model, useReference)

  return generateImage({
    characterId: char.id,
    dramaId: char.dramaId,
    prompt: resolved.prompt,
    model,
    style,
    size: resolvePortraitImageSize(style),
    configId: ep.imageConfigId ?? undefined,
    referenceImages,
  })
}

function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const existing = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
    .find(row => row.characterId === characterId)
  if (!existing) {
    db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: now() }).run()
  }
}

function findDramaNarrator(dramaId: number) {
  return db.select().from(schema.characters).all()
    .find(c => c.dramaId === dramaId && !c.deletedAt && (c.name === '旁白' || c.role === '旁白'))
}

// POST /characters
app.post('/', async (c) => {
  const body = await c.req.json()
  const dramaId = Number(body.drama_id || body.dramaId)
  const name = String(body.name || '').trim()
  if (!dramaId || !name) return badRequest(c, 'drama_id and name are required')

  const ts = now()
  const episodeId = Number(body.episode_id || body.episodeId || 0)

  if (name === '旁白') {
    const existing = findDramaNarrator(dramaId)
    if (existing) {
      const updates: Record<string, any> = { updatedAt: ts }
      const voiceStyle = body.voice_style || body.voiceStyle
      const voiceProvider = body.voice_provider || body.voiceProvider
      if (voiceStyle) updates.voiceStyle = voiceStyle
      if (voiceProvider) updates.voiceProvider = voiceProvider
      if (Object.keys(updates).length > 1) {
        db.update(schema.characters).set(updates).where(eq(schema.characters.id, existing.id)).run()
      }
      if (episodeId) linkCharacterToEpisode(episodeId, existing.id)
      const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, existing.id)).all()
      return success(c, toSnakeCase(row))
    }
  }

  const res = db.insert(schema.characters).values({
    dramaId,
    name,
    role: body.role || '旁白',
    description: body.description || '',
    appearance: body.appearance || '',
    personality: body.personality || '',
    voiceStyle: body.voice_style || body.voiceStyle || null,
    voiceProvider: body.voice_provider || body.voiceProvider || null,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const characterId = Number(res.lastInsertRowid)
  if (episodeId) linkCharacterToEpisode(episodeId, characterId)

  const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  return success(c, toSnakeCase(row))
})

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!existing || existing.deletedAt) return badRequest(c, '角色不存在')
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'variantLabel', 'personality', 'voiceStyle', 'voiceProvider', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  if ('voice_style' in body || 'voiceStyle' in body) {
    updates.voiceSampleUrl = null
  }
  if (updates.appearance != null) {
    updates.appearance = sanitizeCharacterAppearance(String(updates.appearance))
  }
  db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
  const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  return success(c, toSnakeCase(row))
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// POST /characters/:id/generate-voice-sample — 生成角色音色试听
app.post('/:id/generate-voice-sample', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!char.voiceStyle) return badRequest(c, '请先分配音色')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    logTaskStart('VoiceSample', 'generate', { characterId: id, characterName: char.name, episodeId: ep.id, voice: char.voiceStyle })
    const mode = resolveEpisodeProductionMode(ep.id)
    const voiceProvider = usesLocalModelPipeline(mode)
      ? (/^(zh|en|ja|ko)-/i.test(String(char.voiceStyle || '')) || String(char.voiceProvider || '').toLowerCase() === 'edge'
        ? 'edge'
        : (String(char.voiceProvider || '').toLowerCase() === 'indextts' ? 'indextts' : 'gptsovits'))
      : char.voiceProvider
    const result = await generateVoiceSample(
      char.name,
      char.voiceStyle,
      ep.audioConfigId ?? undefined,
      voiceProvider,
      { role: char.role, appearance: char.appearance, description: char.description },
      resolveVoiceboxModelSize(body?.voicebox_model_size ?? body?.voiceboxModelSize),
    )
    db.update(schema.characters)
      .set({ voiceSampleUrl: result.path, updatedAt: now() })
      .where(eq(schema.characters.id, id)).run()
    logTaskSuccess('VoiceSample', 'generate', { characterId: id, path: result.path, engine: result.engine })
    return success(c, {
      voice_sample_url: result.path,
      preview_engine: result.engine,
      voicebox_fallback: result.engine === 'edge' && char.voiceProvider === 'voicebox',
    })
  } catch (err: any) {
    logTaskError('VoiceSample', 'generate', { characterId: id, error: err.message })
    return badRequest(c, `TTS 生成失败: ${err.message}`)
  }
})

// POST /characters/:id/generate-appearance — AI 生成外貌描述
app.post('/:id/generate-appearance', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')

  let script = String(body.script || body.content || '').trim()
  let style = 'comic'
  let textModel: string | null = null
  let textThinking = true
  const episodeId = body.episode_id ? Number(body.episode_id) : undefined
  let ep: typeof schema.episodes.$inferSelect | undefined
  let drama: typeof schema.dramas.$inferSelect | undefined
  if (episodeId) {
    ep = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()[0]
    if (ep) {
      script = script || String(ep.scriptContent || ep.content || '').trim()
      drama = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()[0]
      style = resolvePortraitStyleFromRequest(ep.id, drama, body)
      textModel = resolveEpisodeTextModel(ep, body.text_model, resolveEpisodeProductionMode(ep.id))
      textThinking = resolveEpisodeTextThinking(ep, body.text_thinking)
    }
  }
  if (!script) {
    drama = drama || db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all()[0]
    style = ep ? style : resolveNarrationImageStyle(drama?.style)
  }

  const contentCtx = buildCharacterAppearanceContext({
    characterId: id,
    characterName: char.name,
    characterVariantLabel: char.variantLabel,
    characterRole: char.role,
    episodeId,
    dramaId: char.dramaId,
    script,
  })
  if (!contentCtx.hasScript && !contentCtx.storyboardSnippets.length) {
    return badRequest(c, '缺少解说稿或分镜内容，请先填写文案或完成分镜拆解')
  }

  try {
    logTaskStart('CharacterAppearance', 'generate', { characterId: id, name: char.name })
    const appearance = await generateCharacterAppearance({
      character: char,
      script,
      style,
      contentContext: contentCtx,
      textModel,
      textThinking,
      productionMode: ep
        ? resolveEpisodeProductionMode(ep.id)
        : parseProductionMode(drama?.metadata),
    })
    db.update(schema.characters)
      .set({ appearance, updatedAt: now() })
      .where(eq(schema.characters.id, id))
      .run()
    const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
    logTaskSuccess('CharacterAppearance', 'generate', { characterId: id, length: appearance.length })
    return success(c, { appearance, character: toSnakeCase(row), generated_at: now() })
  } catch (err: any) {
    logTaskError('CharacterAppearance', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/validate-portrait-style — 本地 MiniCPM-V 校验定妆画风是否不标准
app.post('/:id/validate-portrait-style', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  try {
    logTaskStart('CharacterPortraitValidate', 'style', { characterId: id })
    const result = await validateCharacterPortraitStyle(id, {
      visionModel: String(body.vision_model || body.visionModel || LOCAL_COMIC_ENV.ollamaVisionModel || DEFAULT_LOCAL_VISION_MODEL),
      imageUrl: body.image_url != null ? String(body.image_url) : (body.imageUrl != null ? String(body.imageUrl) : null),
    })
    logTaskSuccess('CharacterPortraitValidate', 'style', {
      characterId: id,
      isStandard: result.is_standard,
      score: result.score,
    })
    return success(c, { ...result, generated_at: now() })
  } catch (err: any) {
    logTaskError('CharacterPortraitValidate', 'style', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/recognize-portrait — 可灵识图，从定妆图补全外貌描述
app.post('/:id/recognize-portrait', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')

  const imagePath = String(body.image_url || body.imageUrl || char.imageUrl || '').trim()
  if (!imagePath) return badRequest(c, '请先生成或上传定妆图')

  let episodeConfigId: number | undefined
  let portraitStyle: string | undefined
  let textModel: string | null = null
  if (body.episode_id) {
    const episodeId = Number(body.episode_id)
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    episodeConfigId = ep?.imageConfigId ?? undefined
    if (ep) {
      textModel = resolveEpisodeTextModel(ep, body.text_model ?? body.textModel, resolveEpisodeProductionMode(ep.id))
      const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
      portraitStyle = resolvePortraitStyleFromRequest(episodeId, drama, body)
    }
  }

  try {
    logTaskStart('CharacterRecognize', 'portrait', { characterId: id, imagePath })
    const description = await recognizePortraitImage(imagePath, episodeConfigId)
    if (!description) return badRequest(c, '识图未返回有效描述')

    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all()
    const merged = await finalizeCharacterAppearance(
      [char.appearance?.trim(), description.trim()].filter(Boolean).join('; '),
      {
        name: char.name,
        role: char.role,
        minimal: isNarrationMinimalStyle(portraitStyle || drama?.style),
        motionComic: isMotionComicStyle(portraitStyle || drama?.style),
        textModel,
      },
    )
    db.update(schema.characters)
      .set({ appearance: merged, updatedAt: now() })
      .where(eq(schema.characters.id, id))
      .run()
    const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
    logTaskSuccess('CharacterRecognize', 'portrait', { characterId: id, length: description.length })
    return success(c, { appearance: merged, recognition: description, character: toSnakeCase(row), generated_at: now() })
  } catch (err: any) {
    logTaskError('CharacterRecognize', 'portrait', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /characters/:id/portrait-prompt — 预览定妆生图完整描述词
app.get('/:id/portrait-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const episodeId = Number(c.req.query('episode_id') || 0)
  if (!episodeId) return badRequest(c, 'episode_id is required')

  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all()
  const style = resolvePortraitStyleFromRequest(episodeId, drama, {
    imageStyle: c.req.query('image_style') ?? c.req.query('imageStyle'),
  })
  const useReference = c.req.query('use_reference') !== 'false'
  const textModel = resolveEpisodeTextModel(ep, undefined, resolveEpisodeProductionMode(ep.id))

  let appearance = char.appearance || ''
  const cleanedAppearance = await finalizeCharacterAppearance(appearance || char.description || '', {
    name: char.name,
    role: char.role,
    minimal: isNarrationMinimalStyle(style),
    motionComic: isMotionComicStyle(style),
    textModel,
    allowLlmEnrichment: false,
  })
  if (cleanedAppearance) appearance = cleanedAppearance

  const resolved = resolveCharacterPortraitGeneration({
    id: char.id,
    name: char.name,
    dramaId: char.dramaId,
    appearance,
    description: char.description,
    personality: char.personality,
    role: char.role,
    variantLabel: char.variantLabel,
    imageUrl: char.imageUrl,
  }, style, { useReference })

  return success(c, {
    prompt: resolved.prompt,
    appearance,
    use_reference: useReference,
    reference_character_id: resolved.referenceCharacterId || null,
    style_anchor_character_id: resolved.styleAnchorCharacterId || null,
  })
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  const useReference = parseUseReference(body)

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all()
  const style = resolvePortraitStyleFromRequest(Number(body.episode_id), drama, body)
  const model = resolvePortraitImageModel(resolveEpisodeImageModel(ep, undefined, resolveEpisodeProductionMode(ep.id)), char.variantLabel)
  const textModel = resolveEpisodeTextModel(ep, body.text_model ?? body.textModel, resolveEpisodeProductionMode(ep.id))

  let appearance = char.appearance || ''
  let appearanceAutoEnriched = false
  const cleanedAppearance = await finalizeCharacterAppearance(appearance || char.description || '', {
    name: char.name,
    role: char.role,
    minimal: isNarrationMinimalStyle(style),
    motionComic: isMotionComicStyle(style),
    textModel,
    allowLlmEnrichment: false,
  })
  if (cleanedAppearance && cleanedAppearance !== appearance) {
    appearance = cleanedAppearance
    db.update(schema.characters).set({ appearance, updatedAt: now() }).where(eq(schema.characters.id, id)).run()
    appearanceAutoEnriched = true
  } else if (cleanedAppearance) {
    appearance = cleanedAppearance
  }

  const resolved = resolveCharacterPortraitGeneration({
    id: char.id,
    name: char.name,
    dramaId: char.dramaId,
    appearance,
    description: char.description,
    personality: char.personality,
    role: char.role,
    variantLabel: char.variantLabel,
    imageUrl: char.imageUrl,
  }, style, { useReference })

  const referenceImages = resolvePortraitReferenceImages(resolved, model, useReference)

  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId, model, useReference })
    const genId = await generateImage({
      characterId: id,
      dramaId: char.dramaId,
      prompt: resolved.prompt,
      model,
      style,
      size: resolvePortraitImageSize(style),
      configId: ep.imageConfigId ?? undefined,
      referenceImages,
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, {
      image_generation_id: genId,
      model,
      use_reference: useReference,
      reference_images: referenceImages || [],
      used_portrait_reference: !!(useReference && resolved.referenceCharacterId && referenceImages?.length),
      reference_character_id: resolved.referenceCharacterId || null,
      reference_character_variant: resolved.referenceCharacterVariant || null,
      used_style_anchor: !!(useReference && resolved.styleAnchorCharacterId && referenceImages?.length),
      style_anchor_character_id: resolved.styleAnchorCharacterId || null,
      used_youth_reference: !!(useReference && getVariantAgeGroup(resolved.referenceCharacterVariant) === 'youth' && referenceImages?.length),
      youth_character_id: getVariantAgeGroup(resolved.referenceCharacterVariant) === 'youth' ? resolved.referenceCharacterId : null,
      appearance_auto_enriched: appearanceAutoEnriched,
      appearance: appearanceAutoEnriched ? appearance : undefined,
    })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/batch-dialogue-expressions — 批量表情包（须在 /:id 路由之前）
app.post('/batch-dialogue-expressions', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ids: number[] = body.character_ids || body.characterIds || []
  if (!ids.length) return badRequest(c, 'character_ids is required')
  const episodeId = Number(body.episode_id || body.episodeId || 0)
  if (episodeId && !isDialoguePortraitMode(resolveEpisodeProductionMode(episodeId))) {
    return badRequest(c, '仅对话立绘模式可生成表情包')
  }
  try {
    const { batchGenerateDialoguePortraitExpressions } = await import('../services/dialogue-portrait-assets.js')
    const result = await batchGenerateDialoguePortraitExpressions(ids, {
      force: body.force === true,
      episodeId: episodeId || undefined,
      imageStyle: body.image_style ?? body.imageStyle,
      tryAiEdit: body.try_ai_edit !== false && body.tryAiEdit !== false,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/dialogue-expressions — 对话立绘表情包 idle/talk/react
app.post('/:id/dialogue-expressions', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char || char.deletedAt) return badRequest(c, 'Character not found')

  const episodeId = Number(body.episode_id || body.episodeId || 0)
  if (episodeId) {
    const mode = resolveEpisodeProductionMode(episodeId)
    if (!isDialoguePortraitMode(mode)) {
      return badRequest(c, '仅对话立绘模式可生成表情包')
    }
  }

  try {
    const { generateDialoguePortraitExpressions } = await import('../services/dialogue-portrait-assets.js')
    logTaskStart('CharacterImage', 'dialogue-expressions', { characterId: id, episodeId: episodeId || undefined })
    const result = await generateDialoguePortraitExpressions(id, {
      force: body.force === true,
      episodeId: episodeId || undefined,
      imageStyle: body.image_style ?? body.imageStyle,
      tryAiEdit: body.try_ai_edit !== false && body.tryAiEdit !== false,
    })
    logTaskSuccess('CharacterImage', 'dialogue-expressions', {
      characterId: id,
      fallback: result.fallback,
    })
    return success(c, result)
  } catch (err: any) {
    logTaskError('CharacterImage', 'dialogue-expressions', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const style = resolvePortraitStyleFromRequest(ep.id, drama, body)
  const textModel = resolveEpisodeTextModel(ep, body.text_model ?? body.textModel, resolveEpisodeProductionMode(ep.id))

  const chars = ids
    .map(cid => db.select().from(schema.characters).where(eq(schema.characters.id, cid)).all()[0])
    .filter(Boolean)
    .sort((a, b) => {
      const byStage = variantPortraitSortOrder(a.variantLabel) - variantPortraitSortOrder(b.variantLabel)
      if (byStage !== 0) return byStage
      return a.name.localeCompare(b.name, 'zh-CN')
    })

  const useReference = parseUseReference(body)

  const laterNames = new Set(
    chars
      .filter(ch => {
        const others = chars.filter(other => other.name.trim() === ch.name.trim() && other.id !== ch.id)
        return others.some(other => {
          const resolved = resolveCharacterPortraitGeneration({
            id: other.id,
            name: other.name,
            dramaId: other.dramaId,
            appearance: other.appearance,
            description: other.description,
            personality: other.personality,
            role: other.role,
            variantLabel: other.variantLabel,
            imageUrl: other.imageUrl,
          }, style, { useReference })
          return resolved.referenceCharacterId === ch.id
        })
      })
      .map(ch => ch.name.trim()),
  )

  const results: number[] = []
  for (const char of chars) {
    try {
      if (useReference) {
        const resolved = resolveCharacterPortraitGeneration({
          id: char.id,
          name: char.name,
          dramaId: char.dramaId,
          appearance: char.appearance,
          description: char.description,
          personality: char.personality,
          role: char.role,
          variantLabel: char.variantLabel,
          imageUrl: char.imageUrl,
        }, style, { useReference })

        if (resolved.styleAnchorCharacterId) {
          const anchor = chars.find(item => item.id === resolved.styleAnchorCharacterId)
          if (anchor && !anchor.imageUrl?.trim()) {
            await waitForCharacterImage(resolved.styleAnchorCharacterId)
          }
        }
      }

      const genId = await submitCharacterPortrait(char, ep, style, useReference, textModel)
      results.push(genId)

      if (useReference && laterNames.has(char.name.trim())) {
        await waitForCharacterImage(char.id)
      }
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app
