import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, badRequest, now } from '../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../utils/transform.js'
import { breakdownNarrationStoryboards } from '../services/narration-breakdown.js'
import { breakdownNarrationImages } from '../services/narration-image-breakdown.js'
import { sortStoryboardsByOrder } from '../services/narration-image.js'
import { extractNarrationCharacters, linkAllNarrationStoryboardCharacters } from '../services/narration-characters.js'
import { DEFAULT_IMAGE_MODEL } from '../constants/image-models.js'
import { DEFAULT_TEXT_MODEL, resolveEpisodeTextModel } from '../constants/text-models.js'
import { isOpeningVideoProcessing, resolveOpeningSubtitleText, startOpeningVideoGeneration } from '../services/ffmpeg-opening.js'
import { splitNarrationAudioForEpisode, transcribeNarrationAudioFiles } from '../services/narration-audio-split.js'

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

  const res = db.insert(schema.episodes).values({
    dramaId: body.drama_id,
    episodeNumber: nextNum,
    title: body.title || `第${nextNum}集`,
    imageConfigId: body.image_config_id,
    imageModel: body.image_model || DEFAULT_IMAGE_MODEL,
    textModel: body.text_model || DEFAULT_TEXT_MODEL,
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

  const allowed = ['content', 'script_content', 'title', 'description', 'status', 'image_model', 'text_model', 'watermark_text']
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
  if ('watermark_text' in updates) drizzleUpdates.watermarkText = updates.watermark_text

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
  const allChars = db.select().from(schema.characters).all()
  const result = allChars.filter(ch => charIds.includes(ch.id) && !ch.deletedAt)
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:id/scenes — scenes linked to this episode
app.get('/:id/scenes', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
  const sceneIds = links.map(l => l.sceneId)
  if (!sceneIds.length) return success(c, [])
  const allScenes = db.select().from(schema.scenes).all()
  const result = allScenes.filter(sc => sceneIds.includes(sc.id) && !sc.deletedAt)
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
  const links = db.select().from(schema.storyboardCharacters).all()
  const charIdsByStoryboard = new Map<number, number[]>()
  for (const link of links) {
    const arr = charIdsByStoryboard.get(link.storyboardId) || []
    arr.push(link.characterId)
    charIdsByStoryboard.set(link.storyboardId, arr)
  }

  const episodeCharIds = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
    .map(link => link.characterId)
  const allChars = db.select().from(schema.characters).all()
    .filter(ch => episodeCharIds.includes(ch.id) && !ch.deletedAt)

  return success(c, rows.map((row) => ({
    ...toSnakeCase(row),
    character_ids: charIdsByStoryboard.get(row.id) || [],
    characters: allChars
      .filter(ch => (charIdsByStoryboard.get(row.id) || []).includes(ch.id))
      .map(ch => toSnakeCase(ch)),
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

  let style = String(body.style || '').trim()
  if (!style) {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
    style = drama?.style || 'comic'
  }

  const script = String(body.script || ep.scriptContent || ep.content || '').trim()
  if (!script) return badRequest(c, '请先填写解说文案')

  try {
    const result = await extractNarrationCharacters(
      episodeId,
      ep.dramaId,
      script,
      style,
      resolveEpisodeTextModel(ep, body.text_model),
    )
    return success(c, {
      created: result.created,
      updated: result.updated,
      archived: result.archived ?? 0,
      characters: toSnakeCaseArray(result.characters),
      linked_storyboard_count: result.linked.linkedStoryboardCount,
      storyboard_count: result.linked.storyboardCount,
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

  const linked = linkAllNarrationStoryboardCharacters(episodeId, ep.dramaId)
  return success(c, {
    linked_storyboard_count: linked.linkedStoryboardCount,
    storyboard_count: linked.storyboardCount,
    character_count: linked.characterCount,
  })
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

// POST /episodes/:id/narration-storyboard-breakdown — 旁白分镜（TTS 粒度，不含配图）
app.post('/:id/narration-storyboard-breakdown', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)

  try {
    const script = String(body.script || '').trim()
    const result = await breakdownNarrationStoryboards(episodeId, script || undefined)
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
    const result = await breakdownNarrationImages(episodeId, style, mode)
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
    const result = await breakdownNarrationStoryboards(episodeId, script || undefined)
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

// POST /episodes/:id/generate-opening-video — 开幕视频（翻页片头 + 可选上传配音/字幕）
app.post('/:id/generate-opening-video', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return notFound(c)
  if (isOpeningVideoProcessing(episodeId)) {
    return badRequest(c, '开幕视频正在生成中，请稍候')
  }

  startOpeningVideoGeneration(episodeId)
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
  })
})

export default app
