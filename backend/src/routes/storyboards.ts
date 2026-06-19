import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateTTS } from '../services/tts-generation.js'
import { findReusableTtsByText, narrationShotNeedsOwnTts, parseDialogueForTTS, resolveNarrationVoiceId, resolveStoryboardTtsSource } from '../services/narration-tts.js'
import { isNarrationStoryboard, parseNarrationImageMeta } from '../services/narration-image.js'
import { formatCharacterDisplayName, resolveStoryboardCharacterIdsForShot } from '../services/narration-characters.js'
import { resolveEdgeVoice } from '../services/edge-tts-local.js'
import { applyUploadedTtsToStoryboard } from '../services/narration-audio-split.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { resolveTtsSpeed } from '../utils/tts-speed.js'
import { resolveVoiceboxInstruct } from '../utils/voicebox-instruct.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'

const app = new Hono()

function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  for (const characterId of uniqueIds) {
    db.insert(schema.storyboardCharacters).values({
      storyboardId,
      characterId,
    }).run()
  }
}

function getStoryboardCharacterIds(storyboardId: number) {
  return db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
    .map(link => link.characterId)
}

function validateStoryboardBindings(episodeId: number, sceneId: number | null | undefined, characterIds: number[] | undefined) {
  const episodeSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
      .map(link => link.sceneId),
  )
  const episodeCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
      .map(link => link.characterId),
  )

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id 必须来自当前集已关联场景')
  }

  const invalidCharacterIds = (characterIds || []).filter(id => !episodeCharacterIds.has(id))
  if (invalidCharacterIds.length) {
    throw new Error('character_ids 必须来自当前集已关联角色')
  }
}

// POST /storyboards
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  logTaskStart('StoryboardAPI', 'create', {
    episodeId: body.episode_id,
    shotNumber: body.storyboard_number || 1,
    sceneId: body.scene_id,
    characterIds: body.character_ids,
  })
  logTaskPayload('StoryboardAPI', 'create body', body)
  validateStoryboardBindings(body.episode_id, body.scene_id, body.character_ids)
  const res = db.insert(schema.storyboards).values({
    episodeId: body.episode_id,
    storyboardNumber: body.storyboard_number || 1,
    title: body.title,
    description: body.description,
    action: body.action,
    dialogue: body.dialogue,
    sceneId: body.scene_id,
    shotType: body.shot_type,
    angle: body.angle,
    movement: body.movement,
    imagePrompt: body.image_prompt,
    referenceImages: body.reference_images,
    duration: body.duration || 10,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  syncStoryboardCharacters(Number(res.lastInsertRowid), body.character_ids || [])
  const [result] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, Number(res.lastInsertRowid))).all()
  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
  })
  return created(c, {
    ...toSnakeCase(result),
    character_ids: getStoryboardCharacterIds(result.id),
  })
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!storyboard) return badRequest(c, '镜头不存在')
  logTaskStart('StoryboardAPI', 'update', {
    storyboardId: id,
    episodeId: storyboard.episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', shot_type: 'shotType',
    angle: 'angle', movement: 'movement', action: 'action',
    dialogue: 'dialogue', duration: 'duration', video_prompt: 'videoPrompt',
    image_prompt: 'imagePrompt', scene_id: 'sceneId', location: 'location',
    time: 'time', atmosphere: 'atmosphere', result: 'result',
    bgm_prompt: 'bgmPrompt', sound_effect: 'soundEffect',
    composed_image: 'composedImage', reference_images: 'referenceImages',
    tts_audio_url: 'ttsAudioUrl',
    bgm_audio_url: 'bgmAudioUrl', bgm_generation_id: 'bgmGenerationId',
  }

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) updates[camelKey] = body[snakeKey]
  }

  if ('dialogue' in body) {
    const nextDialogue = typeof body.dialogue === 'string' ? body.dialogue : String(body.dialogue ?? '')
    if (nextDialogue !== (storyboard.dialogue || '')) {
      updates.ttsAudioUrl = null
      updates.subtitleUrl = null
      updates.composedVideoUrl = null
      updates.status = 'pending'
    }
  }

  validateStoryboardBindings(
    storyboard.episodeId,
    'scene_id' in body ? body.scene_id : storyboard.sceneId,
    'character_ids' in body ? body.character_ids : getStoryboardCharacterIds(id),
  )

  db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
  if ('character_ids' in body) syncStoryboardCharacters(id, body.character_ids || [])
  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId: id,
    updatedFields: Object.keys(updates),
    characterIds: body.character_ids,
  })
  return success(c)
})

// POST /storyboards/:id/resolve-characters — 按镜头内容解析应使用的定妆形态
app.post('/:id/resolve-characters', async (c) => {
  const id = Number(c.req.param('id'))
  try {
    const resolved = resolveStoryboardCharacterIdsForShot(id, { sync: true })
    return success(c, {
      storyboard_id: resolved.storyboardId,
      character_ids: resolved.characterIds,
      characters: resolved.characters.map(ch => ({
        id: ch.id,
        name: ch.name,
        variant_label: ch.variantLabel || '',
        display_name: formatCharacterDisplayName(ch),
        image_url: ch.imageUrl,
      })),
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /storyboards/:id/generate-tts
app.post('/:id/generate-tts', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const force = body?.force === true
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!sb) return badRequest(c, '镜头不存在')
  // 解说镜默认本地 TTS；仅显式传 local_tts: false 时才走付费 API
  const localTts = body?.local_tts === false ? false : (body?.local_tts === true || isNarrationStoryboard(sb))
  const localTtsEngine = body?.local_tts_engine === 'voicebox' ? 'voicebox' : 'edge'
  const ttsSpeed = resolveTtsSpeed(body?.tts_speed ?? body?.ttsSpeed)
  const voiceboxInstruct = localTtsEngine === 'voicebox'
    ? resolveVoiceboxInstruct(body?.voicebox_instruct ?? body?.voiceboxInstruct ?? body?.tts_instruct ?? body?.ttsInstruct)
    : undefined
  const voiceboxModelSize = localTtsEngine === 'voicebox'
    ? resolveVoiceboxModelSize(body?.voicebox_model_size ?? body?.voiceboxModelSize)
    : undefined
  const parsedDialogue = parseDialogueForTTS(sb.dialogue)
  if (parsedDialogue.ignorable) return badRequest(c, '该镜头没有可生成的对白或旁白')
  logTaskStart('StoryboardAPI', 'generate-tts', {
    storyboardId: id,
    episodeId: sb.episodeId,
    dialoguePreview: (sb.dialogue || '').slice(0, 40),
    force,
    localTts,
  })
  logTaskPayload('StoryboardAPI', 'generate-tts input', {
    storyboardId: id,
    episodeId: sb.episodeId,
    dialogue: sb.dialogue,
    force,
  })

  if (!force && sb.ttsAudioUrl) {
    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: id,
      reused: true,
      path: sb.ttsAudioUrl,
    })
    return success(c, { tts_audio_url: sb.ttsAudioUrl, reused: true })
  }

  let voiceId = 'alloy'
  const speaker = parsedDialogue.speaker
  const titleMeta = isNarrationStoryboard(sb) ? parseNarrationImageMeta(sb.referenceImages) : null
  const isTitleShot = titleMeta?.narration_shot_type === 'title'

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  if (ep) {
    const chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId)).all()
    voiceId = resolveNarrationVoiceId(speaker, chars, { isTitleShot: !!isTitleShot })
  }

  const pureDialogue = parsedDialogue.pureText
  if (!pureDialogue) return badRequest(c, '未提取到可合成的文本')

  const episodeStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
    .filter(row => !row.deletedAt)

  if (!force && !isNarrationStoryboard(sb) && !narrationShotNeedsOwnTts(sb)) {
    const inherited = resolveStoryboardTtsSource(episodeStoryboards, id)
    if (inherited?.path) {
      db.update(schema.storyboards)
        .set({ ttsAudioUrl: inherited.path, updatedAt: now() })
        .where(eq(schema.storyboards.id, id))
        .run()
      logTaskSuccess('StoryboardAPI', 'generate-tts', {
        storyboardId: id,
        reused: true,
        inherited: true,
        sourceId: inherited.sourceId,
        path: inherited.path,
      })
      return success(c, {
        tts_audio_url: inherited.path,
        reused: true,
        inherited: true,
        inherited_from: inherited.sourceId,
      })
    }
    return badRequest(c, '该镜头沿用前镜配音，请先生成前序需配音的镜头')
  }

  const reusablePath = !force && !isNarrationStoryboard(sb) ? findReusableTtsByText(episodeStoryboards, pureDialogue, id) : null
  if (reusablePath) {
    db.update(schema.storyboards)
      .set({ ttsAudioUrl: reusablePath, updatedAt: now() })
      .where(eq(schema.storyboards.id, id))
      .run()
    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: id,
      reused: true,
      reusedFromText: true,
      path: reusablePath,
    })
    return success(c, { tts_audio_url: reusablePath, reused: true, reused_from_text: true, text: pureDialogue })
  }

  try {
    const ttsVoice = localTts
      ? (localTtsEngine === 'voicebox'
        ? String(body?.local_voice || voiceId)
        : resolveEdgeVoice(body?.local_voice ? String(body.local_voice) : voiceId))
      : voiceId
    const audioPath = await generateTTS({
      text: pureDialogue,
      voice: ttsVoice,
      speed: ttsSpeed,
      configId: localTts ? null : (ep?.audioConfigId || null),
      localTts,
      localTtsEngine: localTts ? localTtsEngine : undefined,
      voiceboxInstruct,
      voiceboxModelSize,
    })
  db.update(schema.storyboards)
    .set({ ttsAudioUrl: audioPath, updatedAt: now() })
    .where(eq(schema.storyboards.id, id))
    .run()

    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: id,
      voiceId: ttsVoice,
      path: audioPath,
      textLength: pureDialogue.length,
      localTts,
    })
    return success(c, {
      tts_audio_url: audioPath,
      voice_id: ttsVoice,
      text: pureDialogue,
      local_tts: localTts,
      local_tts_engine: localTts ? localTtsEngine : undefined,
      tts_speed: ttsSpeed,
      voicebox_instruct: voiceboxInstruct,
      voicebox_model_size: voiceboxModelSize,
      provider: localTts ? localTtsEngine : undefined,
    })
  } catch (err: any) {
    logTaskError('StoryboardAPI', 'generate-tts', { storyboardId: id, voiceId, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /storyboards/:id/upload-tts — 上传单镜配音 mp3
app.post('/:id/upload-tts', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const audioPath = String(body.audio_path || body.audioPath || '').trim()
  if (!audioPath) return badRequest(c, '请提供 audio_path')

  try {
    const result = await applyUploadedTtsToStoryboard(id, audioPath)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// DELETE /storyboards/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  logTaskStart('StoryboardAPI', 'delete', { storyboardId: id })
  db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id)).run()
  db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId: id })
  return success(c)
})

export default app
