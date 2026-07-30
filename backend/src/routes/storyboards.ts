import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateTTS, probeStoredAudioDuration } from '../services/tts-generation.js'
import { findReusableTtsByText, narrationShotNeedsOwnTts, parseDialogueForTTS, resolveNarrationVoiceId, resolveStoryboardTtsSource } from '../services/narration-tts.js'
import { isNarrationStoryboard, isStoryboardTitleShot, parseNarrationImageMeta, buildNarrationImageMeta } from '../services/narration-image.js'
import { buildComposeUnitMergedTtsText, findComposeUnitMembers, propagateComposeUnitTts } from '../services/ffmpeg-compose.js'
import { formatCharacterDisplayName, resolveStoryboardCharacterIdsForShot } from '../services/narration-characters.js'
import { DEFAULT_CLONED_TTS_VOICE, DEFAULT_LOCAL_TTS_ENGINE } from '../constants/local-comic.js'
import { DEFAULT_EDGE_VOICE, resolveEdgeVoice } from '../services/edge-tts-local.js'
import { findCharacterVoiceMeta, isEdgeVoiceId, mapLocalVoiceToEdge, resolveStoryboardLocalTtsInput, type LocalTtsEngine } from '../services/local-tts-resolve.js'
import { checkGptSovitsHealth } from '../services/gpt-sovits-tts.js'
import { checkIndexTtsHealth } from '../services/index-tts-tts.js'
import { checkVoiceboxHealth, listVoiceboxProfiles, resolveVoiceboxProfileId, isChineseCapableKokoroPreset, isChineseCapableVoiceboxVoice, parseVoiceboxPresetRef, textPrefersChineseTtsLanguage } from '../services/voicebox-tts.js'
import { applyUploadedTtsToStoryboard } from '../services/narration-audio-split.js'
import {
  purgeStoryboardShotVideo,
  purgeStoryboardTtsBeforeRegenerate,
  replaceStoryboardAssetOnUpdate,
} from '../services/storyboard-asset-replace.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { resolveTtsSpeed } from '../utils/tts-speed.js'
import { resolveVoiceboxInstruct } from '../utils/voicebox-instruct.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'
import { scanNarrationStoryboardImage } from '../services/narration-image-scan.js'
import { translateStoryboardFluxPrompt, mergeStoryboardFluxPromptMeta, clearStoryboardFluxPromptMeta } from '../services/flux-storyboard-translate.js'

const app = new Hono()

async function generateStoryboardTtsAudio(
  params: Parameters<typeof generateTTS>[0],
  options?: { edgeFallbackVoice?: string | null },
) {
  try {
    return await generateTTS(params)
  } catch (err: any) {
    if (!params.localTts || (params.localTtsEngine !== 'voicebox' && params.localTtsEngine !== 'gptsovits' && params.localTtsEngine !== 'indextts')) throw err
    const fallbackVoice = resolveEdgeVoice(
      options?.edgeFallbackVoice && isEdgeVoiceId(options.edgeFallbackVoice)
        ? options.edgeFallbackVoice
        : DEFAULT_EDGE_VOICE,
    )
    logTaskWarn('StoryboardAPI', 'local-tts-fallback-edge', {
      engine: params.localTtsEngine,
      requestedVoice: params.voice,
      error: err.message,
      fallbackVoice,
    })
    return generateTTS({
      ...params,
      voice: fallbackVoice,
      localTtsEngine: 'edge',
      voiceboxInstruct: undefined,
      voiceboxModelSize: undefined,
    })
  }
}

function normalizeStoryboardImagePrompt(prompt: unknown): string {
  return String(prompt || '').trim()
}

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
    imagePrompt: body.image_prompt ? normalizeStoryboardImagePrompt(body.image_prompt) : body.image_prompt,
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
    video_url: 'videoUrl',
    bgm_audio_url: 'bgmAudioUrl', bgm_generation_id: 'bgmGenerationId',
  }

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) {
      if (camelKey === 'videoUrl' && (body[snakeKey] == null || body[snakeKey] === '')) {
        purgeStoryboardShotVideo(id, storyboard)
        // purge already cleared DB videoUrl; skip setting again unless we keep other fields
        continue
      }
      if (camelKey === 'composedImage' || camelKey === 'ttsAudioUrl' || camelKey === 'videoUrl') {
        replaceStoryboardAssetOnUpdate(storyboard, camelKey, body[snakeKey])
      }
      updates[camelKey] = body[snakeKey]
    }
  }

  if ('dialogue' in body) {
    const nextDialogue = typeof body.dialogue === 'string' ? body.dialogue : String(body.dialogue ?? '')
    if (nextDialogue !== (storyboard.dialogue || '')) {
      purgeStoryboardTtsBeforeRegenerate(id, storyboard)
      updates.ttsAudioUrl = null
      updates.subtitleUrl = null
      updates.composedVideoUrl = null
      updates.status = 'pending'
    }
  }

  if ('image_prompt' in body) {
    updates.imagePrompt = normalizeStoryboardImagePrompt(body.image_prompt)
    const nextPrompt = updates.imagePrompt
    const prevPrompt = String(storyboard.imagePrompt || '').trim()
    if (nextPrompt !== prevPrompt) {
      const meta = parseNarrationImageMeta(storyboard.referenceImages)
      const { flux_prompt_en: _fp, flux_prompt_en_at: _fpa, ...restMeta } = meta
      const extra: Record<string, unknown> = { ...restMeta }
      if (nextPrompt && meta.narration_image_mode === 'new') {
        extra.image_prompt_source = 'manual'
      }
      updates.referenceImages = buildNarrationImageMeta(meta.narration_image_mode, extra)
    }
  }

  if ('flux_prompt_en' in body) {
    const en = String(body.flux_prompt_en ?? '').trim()
    updates.referenceImages = en
      ? mergeStoryboardFluxPromptMeta(storyboard.referenceImages, en)
      : (clearStoryboardFluxPromptMeta(storyboard.referenceImages) ?? storyboard.referenceImages)
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
  const localTtsEngineRaw = String(body?.local_tts_engine || body?.localTtsEngine || DEFAULT_LOCAL_TTS_ENGINE).trim().toLowerCase()
  const localTtsEngine: LocalTtsEngine =
    localTtsEngineRaw === 'gptsovits' ? 'gptsovits'
      : localTtsEngineRaw === 'voicebox' ? 'voicebox'
        : localTtsEngineRaw === 'indextts' ? 'indextts'
          : localTtsEngineRaw === 'edge' ? 'edge'
            : DEFAULT_LOCAL_TTS_ENGINE
  const ttsSpeed = resolveTtsSpeed(body?.tts_speed ?? body?.ttsSpeed)
  const emotionInstruct = (localTtsEngine === 'voicebox' || localTtsEngine === 'indextts')
    ? resolveVoiceboxInstruct(body?.voicebox_instruct ?? body?.voiceboxInstruct ?? body?.tts_instruct ?? body?.ttsInstruct)
    : undefined
  const voiceboxInstruct = localTtsEngine === 'voicebox' ? emotionInstruct : undefined
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
  const isTitleShot = isStoryboardTitleShot(sb)

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  let chars: Array<{ name: string; voiceStyle?: string | null; voiceProvider?: string | null }> = []
  if (ep) {
    chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId)).all()
    voiceId = resolveNarrationVoiceId(speaker, chars, { isTitleShot: !!isTitleShot })
  }

  const pureDialogueFromDialogue = parsedDialogue.pureText
  if (!pureDialogueFromDialogue && !(body?.tts_text ?? body?.ttsText)) return badRequest(c, '未提取到可合成的文本')

  const episodeStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
    .filter(row => !row.deletedAt)

  const unitTts = (body?.unit_tts === true || body?.unitTts === true)
    && isNarrationStoryboard(sb)
    && !isTitleShot
  let pureDialogue = String(body?.tts_text ?? body?.ttsText ?? '').trim()
    || pureDialogueFromDialogue
  if (unitTts) {
    const merged = buildComposeUnitMergedTtsText(id, episodeStoryboards)
    if (merged) pureDialogue = merged
  }
  if (!pureDialogue) return badRequest(c, '未提取到可合成的文本')

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

  const reusablePath = !force && !isNarrationStoryboard(sb) && !isTitleShot
    ? findReusableTtsByText(episodeStoryboards, pureDialogue, id)
    : null
  if (reusablePath) {
    db.update(schema.storyboards)
      .set({ ttsAudioUrl: reusablePath, updatedAt: now() })
      .where(eq(schema.storyboards.id, id))
      .run()
    if (unitTts && findComposeUnitMembers(id, episodeStoryboards).length > 1) {
      propagateComposeUnitTts(id, episodeStoryboards, reusablePath)
    }
    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: id,
      reused: true,
      reusedFromText: true,
      path: reusablePath,
    })
    return success(c, { tts_audio_url: reusablePath, reused: true, reused_from_text: true, text: pureDialogue })
  }

  try {
    purgeStoryboardTtsBeforeRegenerate(id, sb)
    const requestedEngine: LocalTtsEngine = localTtsEngine
    let voiceboxHealthy = requestedEngine === 'voicebox'
    let gptsovitsHealthy = requestedEngine === 'gptsovits'
    let indexttsHealthy = requestedEngine === 'indextts'
    if (voiceboxHealthy) {
      const health = await checkVoiceboxHealth()
      voiceboxHealthy = !!health.ok
      if (!voiceboxHealthy) {
        logTaskWarn('StoryboardAPI', 'voicebox-unavailable', {
          storyboardId: id,
          error: health.error,
        })
      }
    }
    if (gptsovitsHealthy) {
      const health = await checkGptSovitsHealth()
      gptsovitsHealthy = !!health.ok
      if (!gptsovitsHealthy) {
        logTaskWarn('StoryboardAPI', 'gptsovits-unavailable', {
          storyboardId: id,
          error: health.error,
        })
      }
    }
    if (indexttsHealthy) {
      const health = await checkIndexTtsHealth()
      indexttsHealthy = !!health.ok
      if (!indexttsHealthy) {
        logTaskWarn('StoryboardAPI', 'indextts-unavailable', {
          storyboardId: id,
          error: health.error,
        })
      }
    }

    let ttsEngine = requestedEngine
    let ttsVoice = voiceId
    let ttsSpeakerName = speaker
    let usedCharacterVoice = false
    let edgeFallbackVoice: string | null = null
    if (localTts) {
      const preferSpeakerVoice = body?.use_speaker_voice === true || body?.useSpeakerVoice === true
      const fallbackVoice = String(body?.local_voice ?? body?.localVoice ?? '').trim() || undefined
      const localInput = resolveStoryboardLocalTtsInput(speaker, chars, {
        isTitleShot: !!isTitleShot,
        fallbackEngine: requestedEngine,
        fallbackVoice,
        preferSpeakerVoice,
        forceEngine: requestedEngine,
        allowVoicebox: voiceboxHealthy,
        allowGptsovits: gptsovitsHealthy,
        allowIndextts: indexttsHealthy,
      })
      ttsEngine = localInput.engine
      ttsSpeakerName = localInput.speakerName
      usedCharacterVoice = localInput.usedCharacterVoice
      const charMeta = findCharacterVoiceMeta(speaker, chars, { isTitleShot: !!isTitleShot })
      edgeFallbackVoice = mapLocalVoiceToEdge(charMeta, fallbackVoice)
      if (localInput.engine === 'edge' || isEdgeVoiceId(localInput.voiceInput)) {
        edgeFallbackVoice = localInput.voiceInput
      } else if (fallbackVoice && isEdgeVoiceId(fallbackVoice)) {
        edgeFallbackVoice = fallbackVoice
      }
      ttsVoice = ttsEngine === 'voicebox'
        ? await (async () => {
          const voiceInput = localInput.voiceInput
          const presetRef = parseVoiceboxPresetRef(voiceInput)
          let capable = true
          if (presetRef?.engine === 'kokoro') {
            capable = isChineseCapableKokoroPreset(presetRef.presetVoiceId)
          } else if (/^[0-9a-f-]{36}$/i.test(voiceInput)) {
            const profiles = await listVoiceboxProfiles()
            const meta = profiles.find(p => p.id === voiceInput)
            capable = isChineseCapableVoiceboxVoice(voiceInput, meta)
          }
          if (!capable && textPrefersChineseTtsLanguage(pureDialogue)) {
            ttsEngine = 'edge'
            edgeFallbackVoice = edgeFallbackVoice || mapLocalVoiceToEdge(
              findCharacterVoiceMeta(speaker, chars, { isTitleShot: !!isTitleShot }),
              fallbackVoice,
            )
            logTaskWarn('StoryboardAPI', 'voicebox-non-chinese-fallback-edge', {
              storyboardId: id,
              voiceInput,
              fallbackVoice: edgeFallbackVoice,
            })
            return edgeFallbackVoice
          }
          return resolveVoiceboxProfileId(voiceInput)
        })()
        : ttsEngine === 'gptsovits' || ttsEngine === 'indextts'
          ? localInput.voiceInput
          : localInput.voiceInput
    }

    const unitMemberIds = unitTts ? findComposeUnitMembers(id, episodeStoryboards).map(m => m.id) : undefined
    const useAsync = localTts ? false : body?.async === true

    const runGeneration = async () => {
      const audioPath = await generateStoryboardTtsAudio({
        text: pureDialogue,
        voice: ttsVoice,
        speed: ttsSpeed,
        configId: localTts ? null : (ep?.audioConfigId || null),
        localTts,
        localTtsEngine: localTts ? (ttsEngine as LocalTtsEngine) : undefined,
        voiceboxInstruct: localTts && (ttsEngine === 'voicebox' || ttsEngine === 'indextts')
          ? emotionInstruct
          : undefined,
        voiceboxModelSize: localTts && ttsEngine === 'voicebox'
          ? voiceboxModelSize
          : undefined,
      }, { edgeFallbackVoice })
      const duration = await probeStoredAudioDuration(audioPath)
      db.update(schema.storyboards)
        .set({
          ttsAudioUrl: audioPath,
          ...(duration ? { duration } : {}),
          updatedAt: now(),
        })
        .where(eq(schema.storyboards.id, id))
        .run()

      if (unitTts && unitMemberIds && unitMemberIds.length > 1) {
        propagateComposeUnitTts(id, episodeStoryboards, audioPath)
      }

      logTaskSuccess('StoryboardAPI', 'generate-tts', {
        storyboardId: id,
        voiceId: ttsVoice,
        speaker: ttsSpeakerName,
        usedCharacterVoice,
        path: audioPath,
        textLength: pureDialogue.length,
        duration,
        localTts,
        async: useAsync,
      })
      return { audioPath, duration }
    }

    if (useAsync) {
      void runGeneration().catch((err: any) => {
        logTaskError('StoryboardAPI', 'generate-tts', { storyboardId: id, voiceId: ttsVoice, error: err.message, async: true })
      })
      return success(c, {
        status: 'processing',
        storyboard_id: id,
        voice_id: ttsVoice,
        speaker: ttsSpeakerName,
        used_character_voice: usedCharacterVoice,
        text: pureDialogue,
        unit_tts: unitTts,
        unit_member_ids: unitMemberIds,
        local_tts: localTts,
        local_tts_engine: localTts ? ttsEngine : undefined,
        tts_speed: ttsSpeed,
        voicebox_instruct: voiceboxInstruct,
        voicebox_model_size: voiceboxModelSize,
        provider: localTts ? ttsEngine : undefined,
      })
    }

    const { audioPath, duration } = await runGeneration()
    return success(c, {
      tts_audio_url: audioPath,
      voice_id: ttsVoice,
      speaker: ttsSpeakerName,
      used_character_voice: usedCharacterVoice,
      text: pureDialogue,
      duration,
      unit_tts: unitTts,
      unit_member_ids: unitMemberIds,
      local_tts: localTts,
      local_tts_engine: localTts ? ttsEngine : undefined,
      tts_speed: ttsSpeed,
      voicebox_instruct: voiceboxInstruct,
      voicebox_model_size: voiceboxModelSize,
      provider: localTts ? ttsEngine : undefined,
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

// POST /storyboards/:id/translate-flux-prompt — 规则/有道将中文配图文案译为 Flux 英文（写入 meta，不覆盖中文）
app.post('/:id/translate-flux-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const holdOllama = !!(body.hold_ollama ?? body.holdOllama)
  try {
    const result = await translateStoryboardFluxPrompt(id, { holdOllama })
    return success(c, result)
  } catch (err: any) {
    logTaskError('StoryboardAPI', 'translate-flux-prompt', { storyboardId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /storyboards/:id/scan-narration-image — MiniCPM-V 等校验配图是否合适
app.post('/:id/scan-narration-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await scanNarrationStoryboardImage(id, {
      textModel: body.text_model || body.textModel,
      visionModel: body.vision_model || body.visionModel,
      textThinking: body.text_thinking ?? body.textThinking,
    })
    return success(c, { ...result, generated_at: now() })
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
