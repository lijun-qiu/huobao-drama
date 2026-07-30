import { Hono } from 'hono'
import { eq, inArray, and, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, badRequest, now } from '../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../utils/transform.js'
import { breakdownNarrationStoryboards } from '../services/narration-breakdown.js'
import { breakdownNarrationImages, detectNarrationImageAnchors, generateNarrationImagePromptsOnly, retryMissingNarrationImagePrompts } from '../services/narration-image-breakdown.js'
import {
  auditEpisodeNarrationImagePrompts,
  optimizeEpisodeNarrationImagePrompts,
  restoreEpisodeNarrationImagePrompts,
} from '../services/narration-image-prompt-audit.js'
import { unifyEpisodeParagraphOutfits } from '../services/narration-outfit-continuity.js'
import { getNarrationImageBreakdownProgress, acquireNarrationImageBreakdownJob, releaseNarrationImageBreakdownJob, requestNarrationImageBreakdownCancel } from '../services/narration-image-breakdown-progress.js'
import { sortStoryboardsByOrder } from '../services/narration-image.js'
import { translateEpisodeFluxPrompts, clearEpisodeFluxPrompts, getEpisodeFluxTranslateProgress, beginFluxTranslateOllamaBatch, endFluxTranslateOllamaBatch, repairEpisodeFluxPromptArtifacts } from '../services/flux-storyboard-translate.js'
import { cropEpisodeNarrationImageWatermarks, restoreEpisodeNarrationImageWatermarks } from '../services/narration-image-crop.js'
import {
  clearEpisodeComposedVideos,
  clearEpisodeNarrationImages,
  clearEpisodeNarrationImageDetect,
  clearEpisodeNarrationImagePrompts,
  clearEpisodeNarrationTts,
  clearEpisodeStoryboards,
} from '../services/episode-asset-clear.js'
import { extractNarrationCharacters, linkAllNarrationStoryboardCharacters, syncMotionComicCharactersFromSpeakers } from '../services/narration-characters.js'
import { extractDramaEpisodeAssets } from '../services/drama-extract.js'
import { breakdownDramaEpisodeStoryboards } from '../services/drama-storyboard-breakdown.js'
import { DEFAULT_IMAGE_MODEL, DEFAULT_LOCAL_IMAGE_MODEL, resolveEpisodeImageModel } from '../constants/image-models.js'
import { DEFAULT_TEXT_MODEL, DEFAULT_LOCAL_TEXT_MODEL, resolveEpisodeTextModel, resolveEpisodeTextThinking, resolveNarrationScriptChatTextModel } from '../constants/text-models.js'
import { parseProductionMode, isMotionComicMode, usesMotionComicStoryboardRules, resolveEpisodeProductionMode, usesLocalModelPipeline } from '../constants/production-mode.js'
import { DEFAULT_CLONED_TTS_VOICE, DEFAULT_LOCAL_TTS_ENGINE } from '../constants/local-comic.js'
import { resolveEpisodeVisualStyle, resolveNarrationImageStyle } from '../constants/art-styles.js'
import { isOpeningVideoProcessing, resolveOpeningSubtitleText, startOpeningVideoGeneration, parseOpeningPickedImages, buildOpeningPickedImagesZip, pickAndSaveOpeningImages } from '../services/ffmpeg-opening.js'
import fs from 'fs'
import { isTitleVideoProcessing, startTitleSegmentVideoGeneration } from '../services/ffmpeg-title-segment.js'
import { resolveEdgeVoice } from '../services/edge-tts-local.js'
import { resolveVoiceboxProfileId } from '../services/voicebox-tts.js'
import { generateTTS } from '../services/tts-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { resolveTtsSpeed } from '../utils/tts-speed.js'
import { resolveVoiceboxInstruct } from '../utils/voicebox-instruct.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'
import { splitNarrationAudioForEpisode, transcribeNarrationAudioFiles } from '../services/narration-audio-split.js'
import { importNarrationImageDesc, importNarrationStoryboardDesc } from '../services/storyboard-desc-import.js'
import { chatNarrationScript, emphasizeNarrationScriptDraft, streamChatNarrationScript } from '../services/narration-script-chat.js'
import { streamNarrationImageDetectChat } from '../services/narration-image-detect-chat.js'
import { streamNarrationImagePromptChat } from '../services/narration-image-prompt-chat.js'
import { streamNarrationStoryboardChat } from '../services/narration-storyboard-chat.js'
import { assignLocalVoicesToDrama, listLocalCastVoiceCandidates } from '../services/local-voice-assign.js'

const app = new Hono()

// POST /episodes — Create a new episode
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id required')
  if (!body.image_config_id || !body.video_config_id || !body.audio_config_id) {
    return badRequest(c, 'image_config_id, video_config_id and audio_config_id are required')
  }
  const ts = now()

  // Get next episode number
  const existing = db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, body.drama_id))
    .orderBy(schema.episodes.episodeNumber).all()
  const nextNum = existing.length ? Math.max(...existing.map(e => e.episodeNumber)) + 1 : 1

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, body.drama_id)).all()
  const productionMode = parseProductionMode(drama?.metadata)

  const res = db.insert(schema.episodes).values({
    dramaId: body.drama_id,
    episodeNumber: nextNum,
    title: body.title || `第${nextNum}集`,
    imageConfigId: body.image_config_id,
    imageModel: body.image_model || (usesLocalModelPipeline(productionMode) ? DEFAULT_LOCAL_IMAGE_MODEL : DEFAULT_IMAGE_MODEL),
    textModel: body.text_model || (usesLocalModelPipeline(productionMode) ? DEFAULT_LOCAL_TEXT_MODEL : DEFAULT_TEXT_MODEL),
    textThinking: resolveEpisodeTextThinking(undefined, body.text_thinking),
    videoConfigId: body.video_config_id,
    audioConfigId: body.audio_config_id,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const [ep] = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, Number(res.lastInsertRowid))).all()
  return success(c, {
    id: ep.id,
    episode_number: ep.episodeNumber,
    title: ep.title,
    image_config_id: ep.imageConfigId,
    image_model: ep.imageModel || DEFAULT_IMAGE_MODEL,
    text_model: ep.textModel || DEFAULT_TEXT_MODEL,
    video_config_id: ep.videoConfigId,
    audio_config_id: ep.audioConfigId,
  })
})

// PUT /episodes/:id - Update episode fields
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  const allowed = ['content', 'script_content', 'title', 'description', 'status', 'image_model', 'text_model', 'text_thinking', 'watermark_text', 'watermark_animated', 'refer_previous_episode', 'video_config_id', 'audio_config_id']
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) return badRequest(c, 'no valid fields')

  // Map snake_case to camelCase for drizzle
  const drizzleUpdates: Record<string, any> = { updatedAt: now() }
  if ('content' in updates) drizzleUpdates.content = updates.content
  if ('script_content' in updates) drizzleUpdates.scriptContent = updates.script_content
  if ('title' in updates) drizzleUpdates.title = updates.title
  if ('description' in updates) drizzleUpdates.description = updates.description
  if ('status' in updates) drizzleUpdates.status = updates.status
  if ('image_model' in updates) drizzleUpdates.imageModel = updates.image_model
  if ('text_model' in updates) drizzleUpdates.textModel = updates.text_model
  if ('text_thinking' in updates) {
    drizzleUpdates.textThinking = resolveEpisodeTextThinking(undefined, updates.text_thinking)
  }
  if ('watermark_text' in updates) drizzleUpdates.watermarkText = updates.watermark_text
  if ('watermark_animated' in updates) {
    drizzleUpdates.watermarkAnimated = updates.watermark_animated === true
      || updates.watermark_animated === 1
      || updates.watermark_animated === '1'
  }
  if ('refer_previous_episode' in updates) {
    drizzleUpdates.referPreviousEpisode = updates.refer_previous_episode === true
      || updates.refer_previous_episode === 1
      || updates.refer_previous_episode === '1'
  }
  if ('video_config_id' in updates) drizzleUpdates.videoConfigId = Number(updates.video_config_id) || null
  if ('audio_config_id' in updates) drizzleUpdates.audioConfigId = Number(updates.audio_config_id) || null

  await db.update(schema.episodes).set(drizzleUpdates).where(eq(schema.episodes.id, id))
  return success(c)
})

// GET /episodes/:id/characters — characters linked to this episode
app.get('/:id/characters', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
  const charIds = links.map(l => l.characterId)
  if (!charIds.length) return success(c, [])
  const result = db.select().from(schema.characters)
    .where(and(inArray(schema.characters.id, charIds), isNull(schema.characters.deletedAt)))
    .all()
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:id/scenes — scenes linked to this episode
app.get('/:id/scenes', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
  const sceneIds = links.map(l => l.sceneId)
  if (!sceneIds.length) return success(c, [])
  const result = db.select().from(schema.scenes)
    .where(and(inArray(schema.scenes.id, sceneIds), isNull(schema.scenes.deletedAt)))
    .all()
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:episode_id/storyboards
app.get('/:episode_id/storyboards', async (c) => {
  const episodeId = Number(c.req.param('episode_id'))
  const rows = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(row => !row.deletedAt),
  )
  const storyboardIds = rows.map(row => row.id)
  const links = storyboardIds.length
    ? db.select().from(schema.storyboardCharacters)
      .where(inArray(schema.storyboardCharacters.storyboardId, storyboardIds))
      .all()
    : []
  const charIdsByStoryboard = new Map<number, number[]>()
  for (const link of links) {
    const arr = charIdsByStoryboard.get(link.storyboardId) || []
    arr.push(link.characterId)
    charIdsByStoryboard.set(link.storyboardId, arr)
  }

  const linkedCharIdSet = new Set<number>()
  for (const ids of charIdsByStoryboard.values()) {
    for (const id of ids) linkedCharIdSet.add(id)
  }
  const linkedCharIds = [...linkedCharIdSet]
  const allChars = linkedCharIds.length
    ? db.select().from(schema.characters)
      .where(and(inArray(schema.characters.id, linkedCharIds), isNull(schema.characters.deletedAt)))
      .all()
    : []
  const charById = new Map(allChars.map(ch => [ch.id, ch]))

  return success(c, rows.map((row) => ({
    ...toSnakeCase(row),
    character_ids: charIdsByStoryboard.get(row.id) || [],
    characters: (charIdsByStoryboard.get(row.id) || [])
      .map(id => charById.get(id))
      .filter(Boolean)
      .map(ch => toSnakeCase(ch!)),
  })))
})

// GET /episodes/:id/pipeline-status — 流水线进度
app.get('/:id/pipeline-status', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c, 'Episode not found')

  const chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId)).all()
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, ep.dramaId)).all()
  const sbs = db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
  const merges = db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId)).all()

  const charsWithVoice = chars.filter(c => c.voiceStyle)
  const charsWithSample = chars.filter(c => c.voiceSampleUrl)
  const sbsWithImage = sbs.filter(s => s.composedImage)
  const sbsWithVideo = sbs.filter(s => s.videoUrl)
  const sbsComposed = sbs.filter(s => s.composedVideoUrl)
  const latestMerge = merges[merges.length - 1]

  function stepStatus(done: boolean, partial?: boolean) {
    if (done) return 'done'
    if (partial) return 'partial'
    return 'pending'
  }

  return success(c, {
    episode_id: episodeId,
    steps: {
      script_rewrite: { status: ep.scriptContent ? 'done' : (ep.content ? 'ready' : 'pending') },
      extract_characters: { status: stepStatus(chars.length > 0), count: chars.length },
      extract_scenes: { status: stepStatus(scenes.length > 0), count: scenes.length },
      assign_voices: { status: stepStatus(charsWithVoice.length === chars.length && chars.length > 0, charsWithVoice.length > 0), assigned: charsWithVoice.length, total: chars.length },
      generate_voice_samples: { status: stepStatus(charsWithSample.length === charsWithVoice.length && charsWithVoice.length > 0, charsWithSample.length > 0), completed: charsWithSample.length, total: charsWithVoice.length },
      extract_storyboards: { status: stepStatus(sbs.length > 0), count: sbs.length },
      generate_images: { status: stepStatus(sbsWithImage.length === sbs.length && sbs.length > 0, sbsWithImage.length > 0), completed: sbsWithImage.length, total: sbs.length },
      generate_videos: { status: stepStatus(sbsWithVideo.length === sbs.length && sbs.length > 0, sbsWithVideo.length > 0), completed: sbsWithVideo.length, total: sbs.length },
      compose_shots: { status: stepStatus(sbsComposed.length === sbs.length && sbs.length > 0, sbsComposed.length > 0), completed: sbsComposed.length, total: sbs.length },
      merge_episode: { status: latestMerge?.status === 'completed' ? 'done' : (latestMerge ? latestMerge.status : 'pending'), merged_url: latestMerge?.mergedUrl },
    },
  })
})

// POST /episodes/:id/extract-narration-characters — 从解说文案提取角色并关联分镜
app.post('/:id/extract-narration-characters', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const style = resolveNarrationImageStyle(
    body.style || body.image_style || body.imageStyle
      || resolveEpisodeVisualStyle(episodeId, { dramaStyle: drama?.style }),
  )

  const script = String(body.script || ep.scriptContent || ep.content || '').trim()
  if (!script) {
    const motionComic = isMotionComicMode(resolveEpisodeProductionMode(episodeId))
    return badRequest(c, motionComic ? '请先填写漫剧旁白稿' : '请先填写解说文案')
  }

  try {
    const productionMode = resolveEpisodeProductionMode(episodeId)
    // 本地流水线角色提取默认开思考（Qwen 3.5）；显式传 false 才关闭
    const textThinking = body.text_thinking === false || body.textThinking === false
      ? false
      : (usesLocalModelPipeline(productionMode)
        ? true
        : resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking))

    const result = await extractNarrationCharacters(
      episodeId,
      ep.dramaId,
      script,
      style,
      resolveEpisodeTextModel(ep, body.text_model, productionMode),
      textThinking,
    )
    return success(c, {
      created: result.created,
      updated: result.updated,
      archived: result.archived ?? 0,
      characters: toSnakeCaseArray(result.characters),
      linked_storyboard_count: result.linked.linkedStoryboardCount,
      storyboard_count: result.linked.storyboardCount,
      generated_at: result.generated_at,
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/extract — 本地漫剧/短剧：LLM 结构化提取角色与场景（不依赖 Agent 工具）
app.post('/:id/extract', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await extractDramaEpisodeAssets({
      episodeId,
      dramaId: ep.dramaId,
      script: typeof body.script === 'string' ? body.script : undefined,
      textModel: body.text_model ?? body.textModel,
      textThinking: resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking),
    })
    return success(c, {
      characters: result.characters,
      scenes: result.scenes,
      extracted_characters: result.extracted_characters,
      extracted_scenes: result.extracted_scenes,
      model: result.model,
      generated_at: now(),
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/storyboard-breakdown — 本地短剧：LLM 结构化分镜拆解（不依赖 Agent 工具）
app.post('/:id/storyboard-breakdown', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await breakdownDramaEpisodeStoryboards({
      episodeId,
      dramaId: ep.dramaId,
      script: typeof body.script === 'string' ? body.script : undefined,
      textModel: body.text_model ?? body.textModel,
      videoModelLabel: body.video_model_label ?? body.videoModelLabel,
    })
    return success(c, {
      count: result.count,
      total_duration: result.total_duration,
      model: result.model,
      generated_at: now(),
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/link-narration-characters — 按文案重新关联分镜角色
app.post('/:id/link-narration-characters', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  let speakerSync: ReturnType<typeof syncMotionComicCharactersFromSpeakers> | null = null
  if (usesMotionComicStoryboardRules(resolveEpisodeProductionMode(episodeId))) {
    speakerSync = syncMotionComicCharactersFromSpeakers(episodeId, ep.dramaId)
  }
  const linked = linkAllNarrationStoryboardCharacters(episodeId, ep.dramaId)
  return success(c, {
    linked_storyboard_count: linked.linkedStoryboardCount,
    storyboard_count: linked.storyboardCount,
    character_count: linked.characterCount,
    speaker_sync: speakerSync
      ? {
        created: speakerSync.created,
        linked: speakerSync.linked,
        unlinked: speakerSync.unlinked,
        speakers: speakerSync.speakers,
      }
      : null,
  })
})

// POST /episodes/:id/assign-local-voices — Kokoro 优先、Edge 补位的本地多角色音色分配
app.post('/:id/assign-local-voices', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    if (isMotionComicMode(resolveEpisodeProductionMode(episodeId))) {
      syncMotionComicCharactersFromSpeakers(episodeId, ep.dramaId)
    }
    const result = await assignLocalVoicesToDrama({
      dramaId: ep.dramaId,
      episodeId,
      modelSize: resolveVoiceboxModelSize(body?.voicebox_model_size ?? body?.voiceboxModelSize),
      overwrite: body?.overwrite === true,
    })
    return success(c, {
      assigned: result.assigned,
      skipped: result.skipped,
      kokoro_available: result.kokoro_available,
      edge_available: result.edge_available,
      characters: toSnakeCaseArray(result.characters),
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/split-narration-audio — Whisper 转 SRT 后按分镜文案对齐裁剪配音
app.post('/:id/split-narration-audio', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const audioPaths = Array.isArray(body.audio_paths)
    ? body.audio_paths.map((p: unknown) => String(p || '').trim()).filter(Boolean)
    : [String(body.audio_path || body.audioPath || '').trim()].filter(Boolean)
  if (!audioPaths.length) return badRequest(c, '请提供 audio_path 或 audio_paths')

  try {
    const result = await splitNarrationAudioForEpisode(episodeId, audioPaths)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/transcribe-narration-audio — 仅转写 SRT，不裁剪分配
app.post('/:id/transcribe-narration-audio', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const audioPaths = Array.isArray(body.audio_paths)
    ? body.audio_paths.map((p: unknown) => String(p || '').trim()).filter(Boolean)
    : [String(body.audio_path || body.audioPath || '').trim()].filter(Boolean)
  if (!audioPaths.length) return badRequest(c, '请提供 audio_path 或 audio_paths')

  try {
    const result = await transcribeNarrationAudioFiles(audioPaths, episodeId)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-script-chat — 体验人生解说稿聊天生成（默认 SSE 流式）
app.post('/:id/narration-script-chat', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const messages = rawMessages
    .map((m: { role?: string; content?: string }) => ({
      role: m?.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m?.content || ''),
    }))
    .filter((m: { content: string }) => m.content.trim())

  const chatParams = {
    episodeId,
    messages,
    textModel: body.text_model ?? body.textModel,
    textThinking: resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking),
    script: typeof body.script === 'string' ? body.script : undefined,
  }

  const accept = String(c.req.header('accept') || '').toLowerCase()
  const wantsStream = body.stream !== false && accept.includes('text/event-stream')

  if (!wantsStream) {
    try {
      const result = await chatNarrationScript(chatParams)
      return success(c, { ...result, generated_at: now() })
    } catch (err: any) {
      return badRequest(c, err.message)
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const result = await streamChatNarrationScript(
          chatParams,
          (_delta, full) => send({ type: 'delta', content: full }),
          c.req.raw.signal,
          {
            onThinkingDelta: (_delta, full) => send({ type: 'thinking', content: full }),
            onStatus: message => send({ type: 'status', message }),
          },
        )
        send({
          type: 'done',
          generated_at: now(),
          reply: result.reply,
          model: result.model,
          text_thinking: result.text_thinking,
          char_count: result.char_count,
          min_chars: result.min_chars,
          max_chars: result.max_chars,
          target_chars: result.target_chars,
          user_length_specified: result.user_length_specified,
          below_min: result.below_min,
          auto_expanded: result.auto_expanded,
          expand_rounds: result.expand_rounds,
          narration_lines: result.narration_lines,
          dialogue_lines: result.dialogue_lines,
          narration_ratio: result.narration_ratio,
          dialogue_ratio: result.dialogue_ratio,
          dialogue_ratio_repaired: result.dialogue_ratio_repaired,
        })
        controller.close()
      } catch (err: any) {
        send({ type: 'error', message: String(err?.message || err || '生成失败') })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

// POST /episodes/:id/narration-script-emphasis — 手动为解说稿标注字幕 ** 强调
app.post('/:id/narration-script-emphasis', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const script = String(body.script || body.content || '').trim()
  if (!script) return badRequest(c, '请提供解说稿正文')

  try {
    const marked = await emphasizeNarrationScriptDraft(script, {
      textModel: body.text_model ?? body.textModel,
      textThinking: resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking),
    })
    return success(c, {
      script: marked,
      model: resolveNarrationScriptChatTextModel(body.text_model ?? body.textModel, resolveEpisodeProductionMode(episodeId), ep),
      generated_at: now(),
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-storyboard-breakdown — 旁白分镜（整稿 LLM 拆镜 + ** 标注）
app.post('/:id/narration-storyboard-breakdown', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const script = String(body.script || '').trim()
    const result = await breakdownNarrationStoryboards(episodeId, script || undefined, {
      textModel: body.text_model ?? body.textModel,
      textThinking: body.text_thinking ?? body.textThinking,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-storyboard-chat — 旁白分镜多轮对话（SSE）
app.post('/:id/narration-storyboard-chat', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const messages = parseImageChatMessages(body)
  const chatParams = {
    episodeId,
    messages,
    textModel: body.text_model ?? body.textModel,
    textThinking: resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking),
    action: body.action === 'run' ? 'run' as const : null,
    script: typeof body.script === 'string' ? body.script : undefined,
  }

  return imageChatSseResponse(send =>
    streamNarrationStoryboardChat(chatParams, send, c.req.raw.signal),
  )
})

// POST /episodes/:id/import-narration-storyboard-desc — 上传旁白分镜描述
app.post('/:id/import-narration-storyboard-desc', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const text = String(body.text || body.content || '').trim()
  if (!text) return badRequest(c, '请提供分镜描述文本')

  try {
    const result = await importNarrationStoryboardDesc(episodeId, text)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/import-narration-image-desc — 上传配图分镜描述
app.post('/:id/import-narration-image-desc', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const text = String(body.text || body.content || '').trim()
  if (!text) return badRequest(c, '请提供配图描述文本')

  try {
    const result = await importNarrationImageDesc(episodeId, text)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// GET /episodes/:id/narration-image-breakdown-status — 配图分镜进度（轮询）
app.get('/:id/narration-image-breakdown-status', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const progress = getNarrationImageBreakdownProgress(episodeId)
  if (!progress) {
    return success(c, {
      status: 'idle',
      phase: null,
      message: '',
      percent: 0,
    })
  }
  return success(c, progress)
})

// POST /episodes/:id/narration-image-breakdown/cancel — 取消进行中的配图分镜任务
app.post('/:id/narration-image-breakdown/cancel', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const cancelled = requestNarrationImageBreakdownCancel(episodeId)
  if (!cancelled) {
    return badRequest(c, '当前没有进行中的配图任务')
  }
  return success(c, { cancelled: true })
})

// POST /episodes/:id/narration-image-detect — ① LLM 检测需配图镜头
app.post('/:id/narration-image-detect', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  let style = resolveNarrationImageStyle(body.style)
  if (!String(body.style || '').trim()) {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
    if (drama?.style === 'narration-anime' || drama?.style === 'narration-minimal') {
      style = resolveNarrationImageStyle(drama.style)
    }
  }

  try {
    const mode = body.image_detect_mode === 'conservative' ? 'conservative' : 'paragraph'
    const batchThreshold = typeof body.detect_batch_threshold === 'number'
      ? body.detect_batch_threshold
      : undefined
    const batchSize = typeof body.detect_batch_size === 'number'
      ? body.detect_batch_size
      : undefined

    if (!acquireNarrationImageBreakdownJob(episodeId)) {
      return badRequest(c, '配图任务进行中，请稍候')
    }

    void detectNarrationImageAnchors(episodeId, style, mode, {
      batchThreshold,
      batchSize,
      textModel: body.text_model ?? body.textModel,
      textThinking: body.text_thinking ?? body.textThinking,
    }).catch(() => {}).finally(() => {
      releaseNarrationImageBreakdownJob(episodeId)
    })

    return success(c, { started: true, step: 'detect' })
  } catch (err: any) {
    releaseNarrationImageBreakdownJob(episodeId)
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-image-prompts — ② 纯 LLM 生成六维配图文案
app.post('/:id/narration-image-prompts', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  let style = resolveNarrationImageStyle(body.style)
  if (!String(body.style || '').trim()) {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
    if (drama?.style === 'narration-anime' || drama?.style === 'narration-minimal') {
      style = resolveNarrationImageStyle(drama.style)
    }
  }

  try {
    const retryMissing = body.retry_missing_prompts === true
    const promptBatchSize = typeof body.prompt_batch_size === 'number'
      ? body.prompt_batch_size
      : undefined
    const testBatchIndex = typeof body.test_batch_index === 'number'
      ? body.test_batch_index
      : undefined
    const promptOptions = {
      ...(promptBatchSize != null ? { batchSize: promptBatchSize } : {}),
      ...(testBatchIndex != null ? { testBatchIndex } : {}),
      textModel: body.text_model ?? body.textModel,
      textThinking: body.text_thinking ?? body.textThinking,
    }

    if (!acquireNarrationImageBreakdownJob(episodeId)) {
      return badRequest(c, '配图任务进行中，请稍候')
    }

    const job = retryMissing
      ? retryMissingNarrationImagePrompts(episodeId, style, promptOptions)
      : generateNarrationImagePromptsOnly(episodeId, style, promptOptions)

    void job.catch(() => {}).finally(() => {
      releaseNarrationImageBreakdownJob(episodeId)
    })

    return success(c, { started: true, step: 'prompts', retry_missing: retryMissing })
  } catch (err: any) {
    releaseNarrationImageBreakdownJob(episodeId)
    return badRequest(c, err.message)
  }
})

function parseImageChatMessages(body: Record<string, unknown>) {
  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  return rawMessages
    .map((m: { role?: string; content?: string }) => ({
      role: m?.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m?.content || ''),
    }))
    .filter((m: { content: string }) => m.content.trim())
}

function imageChatSseResponse(handler: (send: (payload: Record<string, unknown>) => void) => Promise<Record<string, unknown>>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }
      try {
        const result = await handler(send)
        send({ type: 'done', generated_at: now(), ...result })
        controller.close()
      } catch (err: any) {
        send({ type: 'error', message: String(err?.message || err || '生成失败') })
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// POST /episodes/:id/narration-image-detect-chat — 配图换镜检测多轮对话（SSE）
app.post('/:id/narration-image-detect-chat', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const messages = parseImageChatMessages(body)
  const chatParams = {
    episodeId,
    messages,
    textModel: body.text_model ?? body.textModel,
    textThinking: resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking),
    action: body.action === 'run' ? 'run' as const : null,
    style: body.style,
    imageDetectMode: body.image_detect_mode === 'conservative' ? 'conservative' as const : 'paragraph' as const,
    detectBatchThreshold: typeof body.detect_batch_threshold === 'number' ? body.detect_batch_threshold : undefined,
    detectBatchSize: typeof body.detect_batch_size === 'number' ? body.detect_batch_size : undefined,
  }

  return imageChatSseResponse(send =>
    streamNarrationImageDetectChat(chatParams, send, c.req.raw.signal),
  )
})

// POST /episodes/:id/narration-image-prompt-chat — 配图文案多轮对话（SSE）
app.post('/:id/narration-image-prompt-chat', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const messages = parseImageChatMessages(body)
  const action = body.action === 'retry_missing'
    ? 'retry_missing' as const
    : body.action === 'run'
      ? 'run' as const
      : null

  const chatParams = {
    episodeId,
    messages,
    textModel: body.text_model ?? body.textModel,
    textThinking: resolveEpisodeTextThinking(ep, body.text_thinking ?? body.textThinking),
    action,
    style: body.style,
    promptBatchSize: typeof body.prompt_batch_size === 'number' ? body.prompt_batch_size : undefined,
  }

  return imageChatSseResponse(send =>
    streamNarrationImagePromptChat(chatParams, send, c.req.raw.signal),
  )
})

// GET /episodes/:id/narration-image-audit — ③ 扫描配图文案问题（不修改）
app.get('/:id/narration-image-audit', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const style = drama?.style || 'comic'

  try {
    const result = auditEpisodeNarrationImagePrompts(episodeId, style)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-image-optimize — ③ 对指定镜头应用本地规则优化
app.post('/:id/narration-image-optimize', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const style = drama?.style || 'comic'
  const rawIds = body?.storyboard_ids ?? body?.storyboardIds
  const storyboardIds = Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => Number(id)).filter(id => Number.isFinite(id) && id > 0)
    : undefined

  try {
    const result = optimizeEpisodeNarrationImagePrompts(episodeId, style, storyboardIds)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-image-unify-outfits — 统一配图段内/跨段主人公服装
app.post('/:id/narration-image-unify-outfits', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const rawIds = body?.storyboard_ids ?? body?.storyboardIds
  const storyboardIds = Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => Number(id)).filter(id => Number.isFinite(id) && id > 0)
    : undefined

  try {
    const result = unifyEpisodeParagraphOutfits(episodeId, storyboardIds)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-image-restore — 还原第三步优化前的 LLM 原文
app.post('/:id/narration-image-restore', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const rawIds = body?.storyboard_ids ?? body?.storyboardIds
  const storyboardIds = Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => Number(id)).filter(id => Number.isFinite(id) && id > 0)
    : undefined

  try {
    const result = restoreEpisodeNarrationImagePrompts(episodeId, storyboardIds)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-image-breakdown — 配图分镜（场景换图 + 配图文案）
app.post('/:id/narration-image-breakdown', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  let style = String(body.style || '').trim()
  if (!style) {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
    style = drama?.style || 'comic'
  }

  try {
    const mode = body.image_detect_mode === 'conservative'
      ? 'conservative'
      : body.image_detect_mode === 'balanced'
        ? 'balanced'
        : 'paragraph'
    const retryMissing = body.retry_missing_prompts === true
    const result = await breakdownNarrationImages(episodeId, style, mode, {
      retryMissingPrompts: retryMissing,
      textModel: body.text_model ?? body.textModel,
      textThinking: body.text_thinking ?? body.textThinking,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/crop-narration-images — 去除配图右下角水印区（宽 1/8 × 高 1/18）
app.post('/:id/crop-narration-images', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await cropEpisodeNarrationImageWatermarks(episodeId)
    if (!result.cropped && !result.skipped) {
      return badRequest(c, result.errors[0] || '未能裁剪任何配图')
    }
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/restore-narration-images — 恢复去水印前原图（同名原图或配图生成记录）
app.post('/:id/restore-narration-images', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await restoreEpisodeNarrationImageWatermarks(episodeId)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/flux-translate-session/start — 逐镜翻译前预加载 Ollama（整批只加载一次）
app.post('/:id/flux-translate-session/start', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  try {
    await beginFluxTranslateOllamaBatch()
    return success(c, { started: true })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/flux-translate-session/end — 逐镜翻译结束后释放 Ollama
app.post('/:id/flux-translate-session/end', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  try {
    await endFluxTranslateOllamaBatch()
    return success(c, { ended: true })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// GET /episodes/:id/flux-translate-progress — 批量 Flux 英文翻译进度（轮询）
app.get('/:id/flux-translate-progress', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  return success(c, getEpisodeFluxTranslateProgress(episodeId))
})

// POST /episodes/:id/translate-flux-prompts — 批量规则/有道翻译配图文案为 Flux 英文
app.post('/:id/translate-flux-prompts', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const ids = Array.isArray(body.storyboard_ids) ? body.storyboard_ids.map(Number).filter(Boolean) : undefined
    const result = await translateEpisodeFluxPrompts(episodeId, ids)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/repair-flux-prompts — 修复已译英文误译（如 Contrasting makeup）
app.post('/:id/repair-flux-prompts', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    return success(c, repairEpisodeFluxPromptArtifacts(episodeId))
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-flux-prompts — 清除本集 Flux 英文（保留中文配图文案）
app.post('/:id/clear-flux-prompts', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = clearEpisodeFluxPrompts(episodeId)
    if (!result.cleared) return badRequest(c, '本集暂无 Flux 英文可清除')
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-narration-images — 清除本集配图（可按 character_ids / storyboard_ids 过滤）
app.post('/:id/clear-narration-images', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const body = await c.req.json().catch(() => ({})) as {
      character_ids?: number[]
      characterIds?: number[]
      storyboard_ids?: number[]
      storyboardIds?: number[]
    }
    const characterIds = body.character_ids || body.characterIds
    const storyboardIds = body.storyboard_ids || body.storyboardIds
    const result = await clearEpisodeNarrationImages(episodeId, { characterIds, storyboardIds })
    if (!result.cleared) {
      return badRequest(
        c,
        (characterIds?.length || storyboardIds?.length)
          ? '所选范围内暂无配图可清除'
          : '本集暂无配图可清除',
      )
    }
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-narration-image-detect — 清除本集全部配图换镜检测结果
app.post('/:id/clear-narration-image-detect', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await clearEpisodeNarrationImageDetect(episodeId)
    if (!result.cleared) return badRequest(c, '本集暂无配图换镜检测分镜可清除')
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-narration-image-prompts — 清除本集全部配图文案（保留检测分段）
app.post('/:id/clear-narration-image-prompts', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await clearEpisodeNarrationImagePrompts(episodeId)
    if (!result.cleared) return badRequest(c, '本集暂无配图文案可清除')
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-narration-tts — 清除本集全部镜头配音并删文件
app.post('/:id/clear-narration-tts', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await clearEpisodeNarrationTts(episodeId)
    if (!result.cleared) return badRequest(c, '本集暂无配音可清除')
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-storyboards — 清除本集全部分镜（含关联资源）
app.post('/:id/clear-storyboards', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await clearEpisodeStoryboards(episodeId)
    if (!result.cleared) return badRequest(c, '本集暂无分镜可清除')
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/clear-composed-videos — 清除本集镜头合成视频与导出记录
app.post('/:id/clear-composed-videos', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const result = await clearEpisodeComposedVideos(episodeId)
    if (!result.cleared && !result.merges_cleared) {
      return badRequest(c, '本集暂无合成视频可清除')
    }
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/narration-breakdown — 兼容旧接口，等同旁白分镜
app.post('/:id/narration-breakdown', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const script = String(body.script || '').trim()
    const result = await breakdownNarrationStoryboards(episodeId, script || undefined, {
      textModel: body.text_model ?? body.textModel,
      textThinking: body.text_thinking ?? body.textThinking,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/opening-audio — 上传开幕配音 MP3 并可选保存字幕文案
app.post('/:id/opening-audio', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const audioPath = String(body.audio_path || body.audioPath || '').trim()
  if (!audioPath) return badRequest(c, '请提供 audio_path')

  const subtitleText = body.subtitle_text ?? body.subtitleText
  const updates: Record<string, unknown> = {
    openingAudioUrl: audioPath.replace(/^\//, ''),
    updatedAt: now(),
  }
  if (subtitleText !== undefined) {
    updates.openingSubtitleText = resolveOpeningSubtitleText(String(subtitleText)) || null
  } else if (!ep.openingSubtitleText?.trim() || ep.openingSubtitleText.trim() === '今天要体验的人生是') {
    updates.openingSubtitleText = resolveOpeningSubtitleText(null)
  }

  db.update(schema.episodes).set(updates).where(eq(schema.episodes.id, episodeId)).run()
  const [updated] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  return success(c, {
    opening_audio_url: updated.openingAudioUrl,
    opening_subtitle_text: resolveOpeningSubtitleText(updated.openingSubtitleText),
  })
})

// POST /episodes/:id/generate-opening-audio — Voicebox / Edge 本地生成开幕配音
app.post('/:id/generate-opening-audio', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const subtitleText = resolveOpeningSubtitleText(
    body.subtitle_text ?? body.subtitleText ?? ep.openingSubtitleText,
  )
  if (!subtitleText) return badRequest(c, '请填写字幕文案')

  const localTtsEngineRaw = String(body?.local_tts_engine || body?.localTtsEngine || DEFAULT_LOCAL_TTS_ENGINE).trim().toLowerCase()
  const localTtsEngine: 'edge' | 'voicebox' | 'gptsovits' | 'indextts' =
    localTtsEngineRaw === 'indextts' ? 'indextts'
      : localTtsEngineRaw === 'gptsovits' ? 'gptsovits'
        : localTtsEngineRaw === 'voicebox' ? 'voicebox'
          : 'edge'
  const localVoiceRaw = String(body?.local_voice || body?.localVoice || '').trim()
  const localVoice = localVoiceRaw
    || ((localTtsEngine === 'gptsovits' || localTtsEngine === 'indextts') ? DEFAULT_CLONED_TTS_VOICE : '')
  const ttsSpeed = resolveTtsSpeed(body?.tts_speed ?? body?.ttsSpeed)
  const voiceboxInstruct = (localTtsEngine === 'voicebox' || localTtsEngine === 'indextts')
    ? resolveVoiceboxInstruct(body?.voicebox_instruct ?? body?.voiceboxInstruct ?? body?.tts_instruct ?? body?.ttsInstruct)
    : undefined
  const voiceboxModelSize = localTtsEngine === 'voicebox'
    ? resolveVoiceboxModelSize(body?.voicebox_model_size ?? body?.voiceboxModelSize)
    : undefined
  const ttsVoice = localTtsEngine === 'voicebox'
    ? await resolveVoiceboxProfileId(localVoice)
    : (localTtsEngine === 'gptsovits' || localTtsEngine === 'indextts')
      ? localVoice
      : resolveEdgeVoice(localVoice)

  logTaskStart('EpisodeAPI', 'generate-opening-audio', {
    episodeId,
    engine: localTtsEngine,
    voice: ttsVoice,
    speed: ttsSpeed,
    textPreview: subtitleText.slice(0, 40),
  })

  try {
    const audioPath = await generateTTS({
      text: subtitleText,
      voice: ttsVoice,
      speed: ttsSpeed,
      localTts: true,
      localTtsEngine,
      voiceboxInstruct,
      voiceboxModelSize,
    })

    db.update(schema.episodes)
      .set({
        openingAudioUrl: audioPath.replace(/^\//, ''),
        openingSubtitleText: subtitleText,
        updatedAt: now(),
      })
      .where(eq(schema.episodes.id, episodeId))
      .run()

    logTaskSuccess('EpisodeAPI', 'generate-opening-audio', {
      episodeId,
      engine: localTtsEngine,
      path: audioPath,
    })

    return success(c, {
      opening_audio_url: audioPath,
      opening_subtitle_text: subtitleText,
      local_tts_engine: localTtsEngine,
      tts_speed: ttsSpeed,
      voicebox_instruct: voiceboxInstruct,
      voicebox_model_size: voiceboxModelSize,
    })
  } catch (err: any) {
    logTaskError('EpisodeAPI', 'generate-opening-audio', { episodeId, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/generate-opening-video — 开幕视频（翻页片头 + 可选上传配音/字幕）
app.post('/:id/generate-opening-video', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  if (isOpeningVideoProcessing(episodeId)) {
    return badRequest(c, '开幕视频正在生成中，请稍候')
  }

  const body = await c.req.json().catch(() => ({}))
  const count = body?.count ?? body?.image_count ?? body?.imageCount

  startOpeningVideoGeneration(episodeId, count)
  return success(c, { status: 'processing' })
})

// GET /episodes/:id/opening-video — 查询开幕视频状态
app.get('/:id/opening-video', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  return success(c, {
    status: isOpeningVideoProcessing(episodeId)
      ? 'processing'
      : ep.openingVideoError
        ? 'failed'
        : ep.openingVideoUrl
          ? 'completed'
          : 'idle',
    opening_video_url: ep.openingVideoUrl,
    opening_video_error: ep.openingVideoError,
    opening_audio_url: ep.openingAudioUrl,
    opening_subtitle_text: resolveOpeningSubtitleText(ep.openingSubtitleText),
    opening_picked_images: parseOpeningPickedImages(ep.openingPickedImages),
  })
})

// GET /episodes/:id/opening-picked-images.zip — 下载已选开幕配图（zip）
app.get('/:id/opening-picked-images.zip', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const images = parseOpeningPickedImages(ep.openingPickedImages)
  if (!images.length) return badRequest(c, '暂无开幕配图记录，请先导出配图')

  let tempDir = ''
  try {
    const { zipPath, tempDir: dir } = buildOpeningPickedImagesZip(images)
    tempDir = dir
    const buf = fs.readFileSync(zipPath)
    const filename = `opening-images-ep${episodeId}.zip`
    return c.body(buf, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    })
  } catch (err: any) {
    return badRequest(c, err.message || '打包失败')
  } finally {
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
  }
})

// POST /episodes/:id/opening-picked-images/export — 随机选 N 张（首尾固定）并下载 zip
app.post('/:id/opening-picked-images/export', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  const body = await c.req.json().catch(() => ({}))
  const count = body?.count ?? body?.image_count ?? body?.imageCount

  let tempDir = ''
  try {
    const picked = pickAndSaveOpeningImages(episodeId, count)
    const { zipPath, tempDir: dir } = buildOpeningPickedImagesZip(picked)
    tempDir = dir
    const buf = fs.readFileSync(zipPath)
    const filename = `opening-images-ep${episodeId}.zip`
    return c.body(buf, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    })
  } catch (err: any) {
    return badRequest(c, err.message || '导出失败')
  } finally {
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
  }
})

// POST /episodes/:id/generate-title-video — 片头视频（剧中红字片头镜拼接）
app.post('/:id/generate-title-video', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  if (isTitleVideoProcessing(episodeId)) {
    return badRequest(c, '片头视频正在生成中，请稍候')
  }

  startTitleSegmentVideoGeneration(episodeId)
  return success(c, { status: 'processing' })
})

// GET /episodes/:id/title-video — 查询片头视频状态
app.get('/:id/title-video', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  return success(c, {
    status: isTitleVideoProcessing(episodeId)
      ? 'processing'
      : ep.titleVideoError
        ? 'failed'
        : ep.titleVideoUrl
          ? 'completed'
          : 'idle',
    title_video_url: ep.titleVideoUrl,
    title_video_error: ep.titleVideoError,
  })
})

export default app
