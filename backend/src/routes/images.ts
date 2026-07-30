import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { generateImage, reconcileStaleProcessingImageGenerations } from '../services/image-generation.js'
import {
  resolveEpisodeImageModel,
  resolveSceneImageModel,
  resolveStoryboardImageModel,
  imageModelMaxReferenceImages,
  imageModelSupportsReferenceImages,
} from '../constants/image-models.js'
import { resolveEpisodeProductionMode, usesLocalModelPipeline } from '../constants/production-mode.js'
import { compileNarrationImageGenerationBundle, isNarrationStructuredStyle, normalizeArtStyle, resolveEpisodeVisualStyle } from '../constants/art-styles.js'
import { isFluxImageModel, isKolorsImageModel, isQwenImageEditModel, isSdxlInstantIdImageModel } from '../services/comfyui-client.js'
import { ensureMultiPortraitDistinctCuesInPrompt } from '../constants/portrait-appearance-spec.js'
import { extractPortraitDistinctCueCn } from '../constants/portrait-reference.js'
import { isMotionComicStyle, repairMotionComicContinuousImagePrompt } from '../constants/motion-comic.js'
import {
  collectCharacterReferenceImages,
  collectCharacterReferenceImagesByPortraitLabels,
  enrichImagePromptWithCharacters,
  formatCharacterDisplayName,
  getEpisodeVisualCharacters,
  prependMultiPortraitReferenceHint,
  resolveStoryboardCharacterIdsForShot,
} from '../services/narration-characters.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { resolveCharacterGenderLabelCn } from '../services/comfyui-client.js'

const app = new Hono()

// POST /images — Generate image
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.prompt) return badRequest(c, 'prompt is required')

  try {
    let configId: number | undefined = body.config_id
    let episode: { imageConfigId?: number | null; imageModel?: string | null; dramaId?: number } | null = null
    let prompt = String(body.prompt || '')
    let referenceImages: string[] | Array<{ url?: string }> | undefined = body.reference_images
    let dramaStyle: string | null = null
    let imageStyle: string | null = body.image_style ?? body.imageStyle ?? null

    if (body.storyboard_id) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        episode = ep || null
        if (ep?.imageConfigId != null) configId = ep.imageConfigId

        const productionMode = resolveEpisodeProductionMode(ep.id)
        const useLocalPipeline = usesLocalModelPipeline(productionMode)
        const resolved = resolveStoryboardCharacterIdsForShot(sb.id, { sync: true })
        const model = resolveStoryboardImageModel(ep, body.model, productionMode)
        const allChars = getEpisodeVisualCharacters(sb.episodeId, ep!.dramaId)
        const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, ep!.dramaId)).all()
        dramaStyle = drama?.style ?? null
        if (!imageStyle) imageStyle = resolveEpisodeVisualStyle(ep.id, { dramaStyle })
        let portraitLabelsForRefs: string[] = []
        if (imageModelSupportsReferenceImages(model)) {
          const maxRefs = imageModelMaxReferenceImages(model)
          const byLabels = collectCharacterReferenceImagesByPortraitLabels(prompt, allChars, maxRefs)
          const charRefs = byLabels.refs.length
            ? byLabels.refs
            : (resolved.characterIds.length
              ? collectCharacterReferenceImages(allChars, resolved.characterIds, maxRefs)
              : [])
          const bodyRefs = Array.isArray(referenceImages)
            ? referenceImages.map(item => (typeof item === 'string' ? item : item?.url || '')).filter(Boolean)
            : []
          const finalRefs = charRefs.length ? charRefs : bodyRefs
          referenceImages = finalRefs
          portraitLabelsForRefs = byLabels.names.length
            ? byLabels.names
            : (byLabels.allLabels.length ? byLabels.allLabels.slice(0, finalRefs.length) : [])
          // 生图前补辨识差：LLM 常只写表情，同框两名男角（尤其同色夹克）易撞脸
          if (byLabels.allLabels.length >= 2 || byLabels.characterIds.length >= 2) {
            prompt = ensureMultiPortraitDistinctCuesInPrompt(prompt, allChars)
          }
          // 漫画解说整段文案：纠正半身/正面/视线/多人挤脸
          if (isMotionComicStyle(imageStyle || dramaStyle)) {
            prompt = repairMotionComicContinuousImagePrompt(prompt)
          }
          if (byLabels.names.length >= 2 || (byLabels.names.length >= 1 && byLabels.missingLabels.length >= 1)) {
            const genders = byLabels.characterIds.map((id) => {
              const ch = allChars.find(c => c.id === id)
              return resolveCharacterGenderLabelCn(ch?.name, ch?.role, ch?.appearance) || null
            })
            const cues = byLabels.characterIds.map((id) => {
              const ch = allChars.find(c => c.id === id)
              return extractPortraitDistinctCueCn(ch?.appearance) || null
            })
            const uniqueLabelCount = new Set(byLabels.allLabels).size
            prompt = prependMultiPortraitReferenceHint(prompt, byLabels.names, {
              genders,
              cues,
              totalCount: uniqueLabelCount,
              missingLabels: byLabels.missingLabels,
            })
            if (byLabels.missingLabels.length || byLabels.refs.length < uniqueLabelCount) {
              logTaskStart('ImageAPI', 'same-frame-face-collision-risk', {
                storyboardId: sb.id,
                labels: byLabels.allLabels,
                refCount: finalRefs.length,
                missingLabels: byLabels.missingLabels,
                hint: '定妆参考图数量少于对照定妆人数，同框易撞脸',
              })
            }
          }
          // 同步绑定：把文案点名的定妆角色也写进 characterIds（含「我」）
          if (byLabels.characterIds.length > resolved.characterIds.length) {
            logTaskStart('ImageAPI', 'portrait-label-refs', {
              storyboardId: sb.id,
              labels: byLabels.names,
              characterIds: byLabels.characterIds,
            })
          }
        }
        if (resolved.characterIds.length && !useLocalPipeline) {
          prompt = enrichImagePromptWithCharacters(prompt, allChars, resolved.characterIds, imageStyle || dramaStyle)
        }
        if (resolved.characterIds.length || portraitLabelsForRefs.length) {
          logTaskStart('ImageAPI', 'resolve-characters', {
            storyboardId: sb.id,
            characterIds: resolved.characterIds,
            portraitLabels: portraitLabelsForRefs,
            labels: resolved.characters.map(ch => formatCharacterDisplayName(ch)),
          })
        }
        // 与参考图顺序对齐的标签写入 prompt，供 Agnes 多图 identity map（避免缺图时索引错位）
        if (
          portraitLabelsForRefs.length
          && Array.isArray(referenceImages)
          && referenceImages.length
          && !/【定妆参考顺序：/.test(prompt)
        ) {
          prompt = `【定妆参考顺序：${portraitLabelsForRefs.join('、')}】${prompt}`
        }
      }
    } else if (body.drama_id) {
      const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, Number(body.drama_id))).all()
      dramaStyle = drama?.style ?? null
      if (!imageStyle) imageStyle = normalizeArtStyle(dramaStyle)
    }

    let negativePrompt: string | undefined
    const localPipeline = episode?.id ? usesLocalModelPipeline(resolveEpisodeProductionMode(episode.id)) : false
    const productionMode = episode?.id ? resolveEpisodeProductionMode(episode.id) : undefined
    const resolvedModel = body.character_id
      ? resolveEpisodeImageModel(episode, body.model, productionMode)
      : body.storyboard_id
        ? resolveStoryboardImageModel(episode, body.model, productionMode)
        : resolveSceneImageModel(episode, body.model, productionMode)

    if (isNarrationStructuredStyle(imageStyle || dramaStyle) && !isFluxImageModel(resolvedModel) && !isKolorsImageModel(resolvedModel) && !isSdxlInstantIdImageModel(resolvedModel) && !isQwenImageEditModel(resolvedModel)) {
      const compiled = compileNarrationImageGenerationBundle(prompt, imageStyle || dramaStyle)
      prompt = compiled.prompt
      negativePrompt = compiled.negativePrompt
    }

    if (body.storyboard_id && localPipeline && (isFluxImageModel(resolvedModel) || isKolorsImageModel(resolvedModel) || isSdxlInstantIdImageModel(resolvedModel))) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb?.imagePrompt?.trim()) {
        prompt = String(sb.imagePrompt).trim()
      }
    }

    if (isMotionComicStyle(imageStyle || dramaStyle)) {
      prompt = repairMotionComicContinuousImagePrompt(prompt)
    }

    if (body.storyboard_id && localPipeline && !isFluxImageModel(resolvedModel) && !isKolorsImageModel(resolvedModel) && !isSdxlInstantIdImageModel(resolvedModel)) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        const resolved = resolveStoryboardCharacterIdsForShot(sb.id, { sync: true })
        if (resolved.characterIds.length && ep) {
          const allChars = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
          if (!imageStyle) imageStyle = resolveEpisodeVisualStyle(ep.id, { dramaStyle })
          prompt = enrichImagePromptWithCharacters(prompt, allChars, resolved.characterIds, imageStyle || dramaStyle)
        }
      }
    }

    const model = resolvedModel

    logTaskStart('ImageAPI', 'generate', {
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
      frameType: body.frame_type,
    })
    logTaskPayload('ImageAPI', 'request body', body)
    const id = await generateImage({
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      prompt,
      negativePrompt,
      model,
      style: imageStyle || dramaStyle || undefined,
      size: body.size,
      referenceImages: Array.isArray(referenceImages) ? referenceImages as string[] : undefined,
      frameType: body.frame_type,
      configId,
    })

    const [record] = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, id)).all()
    logTaskSuccess('ImageAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record ? toSnakeCase(record) : null)
  } catch (err: any) {
    logTaskError('ImageAPI', 'generate', { error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /images/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  // 轮询单条时也清超时僵尸，避免前端一直「生图中」
  const [probe] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  if (probe?.dramaId != null) reconcileStaleProcessingImageGenerations(probe.dramaId)
  const [row] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  return success(c, row ? toSnakeCase(row) : null)
})

// GET /images — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')
  const gridOnly = c.req.query('grid_only') === '1' || c.req.query('grid_only') === 'true'

  let rows: typeof schema.imageGenerations.$inferSelect[] = []
  if (storyboardId) {
    rows = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.storyboardId, Number(storyboardId)))
      .all()
  } else if (dramaId) {
    reconcileStaleProcessingImageGenerations(Number(dramaId))
    rows = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.dramaId, Number(dramaId)))
      .all()
  } else {
    rows = db.select().from(schema.imageGenerations).all()
  }

  if (gridOnly) {
    rows = rows.filter(r =>
      r.status === 'completed'
      && String(r.frameType || '').startsWith('grid_')
      && !!(r.localPath?.trim()),
    )
  }

  return success(c, toSnakeCaseArray(rows))
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
  return success(c)
})

export default app
