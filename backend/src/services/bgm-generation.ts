import { eq } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { getActiveConfig, getConfigById, type AIConfig } from './ai.js'
import { buildBgmPrompt } from './bgm-prompt.js'
import {
  buildSunoPollRequest,
  buildSunoSubmitRequest,
  parseSunoPollResponse,
  parseSunoSubmitResponse,
  SUNO_DEFAULT_MODEL,
  type SunoTrack,
} from './adapters/suno-music.js'
import {
  buildPixverseHeaders,
  buildPixversePollUrl,
  buildPixverseSubmitBody,
  buildPixverseSubmitUrl,
  buildPixverseUploadUrl,
  is4022Gateway,
  isPixverseSoundModel,
  parsePixversePollResponse,
  parsePixverseSubmitResponse,
  PIXVERSE_SOUND_MODEL,
} from './adapters/pixverse-sound.js'
import { saveRemoteMediaAsBgmAudio } from './bgm-audio.js'
import { now } from '../utils/response.js'
import { downloadFile, getAbsolutePath } from '../utils/storage.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'

const activeBgmTaskIds = new Set<string>()
const activeBgmTaskStartedAt = new Map<string, number>()
const BGM_TASK_STALE_MS = 3 * 60_000
const SUNO_POLL_TIMEOUT_MS = 20_000
const AUDIO_DOWNLOAD_TIMEOUT_MS = 45_000

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function tryBeginBgmTask(taskId: string, force = false): boolean {
  const key = String(taskId)
  if (activeBgmTaskIds.has(key)) {
    const started = activeBgmTaskStartedAt.get(key) || 0
    if (!force && Date.now() - started < BGM_TASK_STALE_MS) return false
    logTaskWarn('BgmTask', 'force-unlock-stale-task', { taskId: key, ageMs: Date.now() - started })
    endBgmTask(key)
  }
  activeBgmTaskIds.add(key)
  activeBgmTaskStartedAt.set(key, Date.now())
  return true
}

function endBgmTask(taskId: string) {
  const key = String(taskId)
  activeBgmTaskIds.delete(key)
  activeBgmTaskStartedAt.delete(key)
}

function markBgmTaskFailed(leadId: number, taskId: string | null | undefined, error: string) {
  db.update(schema.musicGenerations)
    .set({ status: 'failed', errorMsg: error, updatedAt: now() })
    .where(eq(schema.musicGenerations.id, leadId))
    .run()

  if (!taskId) return
  const siblings = db.select().from(schema.musicGenerations).all()
    .filter(r => r.taskId === taskId && r.id !== leadId && r.status === 'processing')
  for (const row of siblings) {
    db.update(schema.musicGenerations)
      .set({ status: 'deleted', errorMsg: error, updatedAt: now() })
      .where(eq(schema.musicGenerations.id, row.id))
      .run()
  }
}

export function getMusicConfig(configId?: number): AIConfig {
  if (configId) {
    const config = getConfigById(configId)
    if (config) return config
  }
  const music = getActiveConfig('music')
  if (music) return music
  const image = getActiveConfig('image')
  if (image) return { ...image, model: image.model || SUNO_DEFAULT_MODEL }
  throw new Error('No active music AI config — 请在设置中添加 music 服务或使用 4022 图片配置')
}

export function resolveStoryboardVideoPath(storyboard?: typeof schema.storyboards.$inferSelect | null): string | undefined {
  if (!storyboard) return undefined
  const sbAny = storyboard as Record<string, unknown>
  return storyboard.composedVideoUrl || storyboard.videoUrl
    || (typeof sbAny.composed_video_url === 'string' ? sbAny.composed_video_url : undefined)
    || (typeof sbAny.video_url === 'string' ? sbAny.video_url : undefined)
}

export function assertPixverseVideoAvailable(storyboard?: typeof schema.storyboards.$inferSelect | null) {
  if (!resolveStoryboardVideoPath(storyboard)) {
    throw new Error('PixVerse 音效需要关联已合成/有视频的镜头（4022 网关要求上传 video_media_id），请先在「合成」生成镜头视频，或改用 Suno')
  }
}

export function resolveBgmProvider(model: string) {
  return isPixverseSoundModel(model) ? 'pixverse' : 'suno'
}

interface GenerateBgmParams {
  dramaId?: number
  episodeId?: number
  storyboardId?: number
  description?: string
  prompt?: string
  content?: string
  configId?: number
  model?: string
  autoApply?: boolean
}

export async function generateBgm(params: GenerateBgmParams): Promise<number[]> {
  const ts = now()
  const config = getMusicConfig(params.configId)
  const model = params.model || config.model || SUNO_DEFAULT_MODEL
  const provider = resolveBgmProvider(model)

  let storyboard: typeof schema.storyboards.$inferSelect | undefined
  if (params.storyboardId) {
    const [row] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, params.storyboardId)).all()
    storyboard = row
  }

  let episodeId = params.episodeId ?? storyboard?.episodeId
  let dramaId = params.dramaId
  if (!dramaId && episodeId) {
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    dramaId = ep?.dramaId
  }

  const prompt = params.prompt?.trim() || buildBgmPrompt({
    description: params.description,
    content: params.content,
    storyboard,
  })

  if (provider === 'pixverse') {
    if (!params.storyboardId) {
      throw new Error('PixVerse 音效生成必须关联镜头，请选择含合成/视频的镜头')
    }
    assertPixverseVideoAvailable(storyboard)
  }

  const placeholder = db.insert(schema.musicGenerations).values({
    dramaId,
    episodeId,
    storyboardId: params.storyboardId,
    provider: provider === 'pixverse' ? 'pixverse' : (config.provider || 'chatfire'),
    model,
    prompt,
    description: params.description || storyboard?.bgmPrompt || null,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const leadId = Number(placeholder.lastInsertRowid)
  const batchId = uuid()

  logTaskStart('BgmTask', 'enqueue', {
    id: leadId,
    episodeId,
    storyboardId: params.storyboardId,
    model,
    provider,
  })

  const processArgs = {
    leadId,
    batchId,
    config,
    model,
    prompt,
    dramaId,
    episodeId,
    storyboardId: params.storyboardId,
    storyboard,
    description: params.description || storyboard?.bgmPrompt || null,
    autoApply: params.autoApply,
  }

  const runner = provider === 'pixverse' ? processPixverseBgm : processSunoBgm
  runner(processArgs).catch(err => {
    logTaskError('BgmTask', 'process', { id: leadId, error: err.message })
    db.update(schema.musicGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.musicGenerations.id, leadId))
      .run()
  })

  return [leadId]
}

async function processSunoBgm(args: {
  leadId: number
  batchId: string
  config: AIConfig
  model: string
  prompt: string
  dramaId?: number
  episodeId?: number
  storyboardId?: number
  description?: string | null
  autoApply?: boolean
}) {
  const { leadId, batchId, config, model, prompt } = args
  const submit = buildSunoSubmitRequest(config, {
    model,
    gpt_description_prompt: prompt,
    make_instrumental: true,
  })

  logTaskProgress('BgmTask', 'suno-submit', { id: leadId, url: redactUrl(submit.url), model })
  const submitResp = await fetch(submit.url, {
    method: submit.method,
    headers: submit.headers,
    body: JSON.stringify(submit.body),
    signal: AbortSignal.timeout(120_000),
  })
  if (!submitResp.ok) {
    throw new Error(`Suno submit failed ${submitResp.status}: ${(await submitResp.text()).slice(0, 300)}`)
  }

  const submitJson = await submitResp.json()
  const taskId = parseSunoSubmitResponse(submitJson)
  db.update(schema.musicGenerations)
    .set({ taskId, batchId, status: 'processing', updatedAt: now() })
    .where(eq(schema.musicGenerations.id, leadId))
    .run()

  await completeSunoBgmTask(args, batchId, taskId, leadId)
}

async function completeSunoBgmTask(
  args: {
    leadId: number
    batchId: string
    config: AIConfig
    model: string
    prompt: string
    dramaId?: number
    episodeId?: number
    storyboardId?: number
    description?: string | null
    autoApply?: boolean
  },
  batchId: string,
  taskId: string,
  leadId: number,
  options?: { force?: boolean },
) {
  if (!tryBeginBgmTask(taskId, options?.force)) {
    logTaskWarn('BgmTask', 'skip-duplicate-task', { id: leadId, taskId })
    return
  }

  try {
    const tracks = await pollSunoTask(args.config, taskId, leadId)
    if (!tracks.length) throw new Error('Suno completed but returned no audio tracks')

    await finalizeBgmTracks(args, batchId, taskId, tracks.map(track => ({
      title: track.title,
      audioUrl: track.audioUrl!,
      coverUrl: track.imageUrl,
      duration: track.duration,
    })))
    reconcileOrphanBgmRecords(args.episodeId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logTaskError('BgmTask', 'complete-failed', { id: leadId, taskId, error: message })
    markBgmTaskFailed(leadId, taskId, message)
    throw err
  } finally {
    endBgmTask(taskId)
  }
}

async function processPixverseBgm(args: {
  leadId: number
  batchId: string
  config: AIConfig
  model: string
  prompt: string
  dramaId?: number
  episodeId?: number
  storyboardId?: number
  storyboard?: typeof schema.storyboards.$inferSelect
  description?: string | null
  autoApply?: boolean
}) {
  const { leadId, batchId, config, model, prompt, storyboard } = args
  const traceId = uuid()
  const headers = buildPixverseHeaders(config, traceId)

  const videoPath = resolveStoryboardVideoPath(storyboard)
  if (!videoPath) {
    throw new Error('PixVerse 缺少镜头视频路径')
  }
  const videoMediaId = await uploadLocalMediaToPixverse(config, videoPath, traceId)
  logTaskProgress('BgmTask', 'pixverse-uploaded', { id: leadId, videoMediaId })

  const submitUrl = buildPixverseSubmitUrl(config)
  const body = buildPixverseSubmitBody(model || PIXVERSE_SOUND_MODEL, prompt, { videoMediaId })

  logTaskProgress('BgmTask', 'pixverse-submit', { id: leadId, url: redactUrl(submitUrl), model, videoMediaId })
  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  const submitText = await submitResp.text()
  let submitJson: unknown
  try {
    submitJson = JSON.parse(submitText)
  } catch {
    if (!submitResp.ok) {
      throw new Error(`PixVerse submit failed ${submitResp.status}: ${submitText.slice(0, 300)}`)
    }
    throw new Error(`PixVerse submit invalid JSON: ${submitText.slice(0, 200)}`)
  }
  if (!submitResp.ok) {
    const errMsg = (submitJson as Record<string, unknown>)?.ErrMsg
    throw new Error(String(errMsg || `PixVerse submit failed ${submitResp.status}: ${submitText.slice(0, 300)}`))
  }

  const videoId = parsePixverseSubmitResponse(submitJson)
  db.update(schema.musicGenerations)
    .set({ taskId: videoId, batchId, status: 'processing', updatedAt: now() })
    .where(eq(schema.musicGenerations.id, leadId))
    .run()

  const mediaUrl = await pollPixverseTask(config, videoId, leadId, traceId)
  const localPath = await saveRemoteMediaAsBgmAudio(mediaUrl)

  db.update(schema.musicGenerations)
    .set({
      title: `PixVerse BGM ${leadId}`,
      audioUrl: mediaUrl,
      localPath,
      status: 'completed',
      completedAt: now(),
      updatedAt: now(),
    })
    .where(eq(schema.musicGenerations.id, leadId))
    .run()
  logTaskSuccess('BgmTask', 'pixverse-downloaded', { id: leadId, localPath })

  if (args.autoApply && args.storyboardId) {
    applyBgmToStoryboard(args.storyboardId, leadId)
  }
}

async function uploadLocalMediaToPixverse(config: AIConfig, relativePath: string, traceId: string): Promise<number> {
  const absPath = getAbsolutePath(relativePath.startsWith('static/') ? relativePath : `static/${relativePath}`)
  if (!fs.existsSync(absPath)) throw new Error(`Media file missing: ${relativePath}`)

  const uploadUrl = buildPixverseUploadUrl(config)
  const form = new FormData()
  const buffer = fs.readFileSync(absPath)
  const ext = path.extname(absPath).toLowerCase()
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'video/mp4'
  form.append('file', new Blob([buffer], { type: mime }), path.basename(absPath))

  const headers: Record<string, string> = is4022Gateway(config.baseUrl)
    ? { Authorization: `Bearer ${config.apiKey}`, 'Ai-Trace-Id': traceId }
    : { 'API-KEY': config.apiKey, 'Ai-Trace-Id': traceId }

  const resp = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(120_000),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`PixVerse upload failed ${resp.status}: ${text.slice(0, 300)}`)

  const json = JSON.parse(text) as Record<string, unknown>
  if (json.ErrCode !== undefined && Number(json.ErrCode) !== 0) {
    throw new Error(String(json.ErrMsg || `PixVerse upload error ${json.ErrCode}`))
  }
  const respData = (json.Resp ?? json.data ?? json) as Record<string, unknown>
  const mediaId = Number(respData.media_id ?? respData.mediaId)
  if (!mediaId) throw new Error('PixVerse upload missing media_id')
  return mediaId
}

async function pollPixverseTask(config: AIConfig, videoId: string, leadId: number, traceId: string) {
  const startedAt = Date.now()
  const maxDurationMs = 600_000
  const pollUrl = buildPixversePollUrl(config, videoId)
  const headers = buildPixverseHeaders(config, traceId)

  for (let i = 0; i < 80; i++) {
    if (Date.now() - startedAt >= maxDurationMs) throw new Error('PixVerse polling timeout')
    await new Promise(r => setTimeout(r, 5000))

    logTaskProgress('BgmTask', 'pixverse-poll', { id: leadId, videoId, attempt: i + 1, url: redactUrl(pollUrl) })
    const resp = await fetch(pollUrl, { method: 'GET', headers, signal: AbortSignal.timeout(60_000) })
    if (!resp.ok) continue

    const json = await resp.json()
    const parsed = parsePixversePollResponse(json)
    if (parsed.status === 'failed') throw new Error(parsed.error || 'PixVerse generation failed')
    if (parsed.status === 'completed' && parsed.mediaUrl) return parsed.mediaUrl
  }

  throw new Error('PixVerse polling timeout')
}

async function finalizeBgmTracks(
  args: {
    leadId: number
    batchId: string
    config: AIConfig
    model: string
    prompt: string
    dramaId?: number
    episodeId?: number
    storyboardId?: number
    description?: string | null
    autoApply?: boolean
  },
  batchId: string,
  taskId: string,
  tracks: Array<{ title?: string; audioUrl: string; coverUrl?: string; duration?: number }>,
) {
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const recordId = i === 0
      ? args.leadId
      : findSiblingRecordId(args, batchId, taskId, i) ?? insertSiblingRecord(args, batchId, taskId)
    const localPath = await downloadAudioFile(track.audioUrl)
    db.update(schema.musicGenerations)
      .set({
        title: track.title || `BGM ${recordId}`,
        coverUrl: track.coverUrl || null,
        audioUrl: track.audioUrl,
        localPath,
        duration: track.duration || null,
        status: 'completed',
        completedAt: now(),
        updatedAt: now(),
      })
      .where(eq(schema.musicGenerations.id, recordId))
      .run()
    logTaskSuccess('BgmTask', 'downloaded', { id: recordId, localPath, title: track.title })
  }

  if (args.autoApply && args.storyboardId) {
    applyBgmToStoryboard(args.storyboardId, args.leadId)
  }
}

function findSiblingRecordId(
  args: { leadId: number },
  batchId: string,
  taskId: string,
  trackIndex: number,
) {
  const siblings = db.select().from(schema.musicGenerations).all()
    .filter(r => r.taskId === taskId && r.batchId === batchId && r.id !== args.leadId && r.status !== 'deleted')
    .sort((a, b) => a.id - b.id)
  return siblings[trackIndex - 1]?.id
}

async function downloadAudioFile(url: string): Promise<string> {
  return downloadFile(url, 'audio', {
    timeoutMs: AUDIO_DOWNLOAD_TIMEOUT_MS,
    defaultExt: '.mp3',
  })
}

function insertSiblingRecord(
  args: {
    dramaId?: number
    episodeId?: number
    storyboardId?: number
    description?: string | null
    config: AIConfig
    model: string
    prompt: string
  },
  batchId: string,
  taskId: string,
) {
  const ts = now()
  const res = db.insert(schema.musicGenerations).values({
    dramaId: args.dramaId,
    episodeId: args.episodeId,
    storyboardId: args.storyboardId,
    provider: args.config.provider || 'chatfire',
    model: args.model,
    prompt: args.prompt,
    description: args.description || null,
    batchId,
    taskId,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  return Number(res.lastInsertRowid)
}

async function pollSunoTask(config: AIConfig, taskId: string, leadId: number): Promise<SunoTrack[]> {
  const startedAt = Date.now()
  const maxDurationMs = 600_000

  for (let i = 0; i < 80; i++) {
    if (Date.now() - startedAt >= maxDurationMs) {
      throw new Error('Suno polling timeout (10 minutes)')
    }
    if (i > 0) await new Promise(r => setTimeout(r, 6000))

    const poll = buildSunoPollRequest(config, taskId)
    logTaskProgress('BgmTask', 'suno-poll', { id: leadId, taskId, attempt: i + 1, url: redactUrl(poll.url) })
    let resp: Response
    try {
      resp = await fetchWithTimeout(poll.url, {
        method: poll.method,
        headers: poll.headers,
      }, SUNO_POLL_TIMEOUT_MS)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logTaskWarn('BgmTask', 'poll-timeout', { id: leadId, taskId, attempt: i + 1, error: message })
      continue
    }
    if (!resp.ok) {
      logTaskWarn('BgmTask', 'poll-http-error', { id: leadId, status: resp.status })
      continue
    }

    const json = await resp.json()
    const parsed = parseSunoPollResponse(json)
    if (parsed.status === 'failed') throw new Error(parsed.error || 'Suno generation failed')
    if (parsed.tracks.length) return parsed.tracks
  }

  throw new Error('Suno polling timeout')
}

function resolveReadyBgmMusic(musicGenerationId: number) {
  const [music] = db.select().from(schema.musicGenerations)
    .where(eq(schema.musicGenerations.id, musicGenerationId)).all()
  if (!music || music.status !== 'completed' || !music.localPath) {
    throw new Error('BGM record not ready')
  }
  return music
}

export function applyBgmToStoryboard(storyboardId: number, musicGenerationId: number) {
  const music = resolveReadyBgmMusic(musicGenerationId)

  db.update(schema.storyboards)
    .set({
      bgmAudioUrl: music.localPath,
      bgmGenerationId: musicGenerationId,
      bgmPrompt: music.description || music.prompt,
      updatedAt: now(),
    })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  if (!music.storyboardId) {
    db.update(schema.musicGenerations)
      .set({ storyboardId, updatedAt: now() })
      .where(eq(schema.musicGenerations.id, musicGenerationId))
      .run()
  }
}

export function applyBgmToEpisodeStoryboards(episodeId: number, musicGenerationId: number): number {
  const music = resolveReadyBgmMusic(musicGenerationId)
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter(sb => !sb.deletedAt)

  if (!storyboards.length) throw new Error('该集暂无镜头')

  const ts = now()
  for (const sb of storyboards) {
    db.update(schema.storyboards)
      .set({
        bgmAudioUrl: music.localPath,
        bgmGenerationId: musicGenerationId,
        bgmPrompt: music.description || music.prompt,
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
  }

  return storyboards.length
}

export function listMusicGenerations(filters: { episodeId?: number; dramaId?: number; storyboardId?: number }) {
  reconcileOrphanBgmRecords(filters.episodeId)
  let rows = db.select().from(schema.musicGenerations).all()
    .filter(r => r.status !== 'deleted')
  if (filters.episodeId) rows = rows.filter(r => r.episodeId === filters.episodeId)
  if (filters.dramaId) rows = rows.filter(r => r.dramaId === filters.dramaId)
  if (filters.storyboardId) rows = rows.filter(r => r.storyboardId === filters.storyboardId)
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

/** 清理同一 taskId 下已完成但仍显示 processing 的孤儿记录 */
export function reconcileOrphanBgmRecords(episodeId?: number): number {
  const allRows = db.select().from(schema.musicGenerations).all()
  const scoped = episodeId ? allRows.filter(r => r.episodeId === episodeId) : allRows
  const completedTaskIds = new Set(
    scoped.filter(r => r.status === 'completed' && r.taskId).map(r => String(r.taskId)),
  )

  let cleaned = 0
  for (const row of scoped) {
    if (row.status !== 'processing' || !row.taskId) continue
    if (!completedTaskIds.has(String(row.taskId))) continue
    db.update(schema.musicGenerations)
      .set({ status: 'deleted', updatedAt: now() })
      .where(eq(schema.musicGenerations.id, row.id))
      .run()
    cleaned++
  }
  return cleaned
}

type MusicGenerationRow = typeof schema.musicGenerations.$inferSelect

function buildResumeArgs(row: MusicGenerationRow) {
  const config = getMusicConfig()
  const model = row.model || config.model || SUNO_DEFAULT_MODEL
  return {
    leadId: row.id,
    batchId: row.batchId || uuid(),
    config,
    model,
    prompt: row.prompt,
    dramaId: row.dramaId ?? undefined,
    episodeId: row.episodeId ?? undefined,
    storyboardId: row.storyboardId ?? undefined,
    description: row.description,
    autoApply: false as const,
  }
}

async function resumeSunoBgmTask(row: MusicGenerationRow) {
  const taskId = String(row.taskId || '')
  if (!taskId) return

  const args = buildResumeArgs(row)
  logTaskStart('BgmTask', 'resume-suno', { id: row.id, taskId })
  await completeSunoBgmTask(args, args.batchId, taskId, row.id, { force: true })
}

async function resumePixverseBgmTask(row: MusicGenerationRow) {
  const videoId = String(row.taskId || '')
  if (!videoId) return

  const args = buildResumeArgs(row)
  let storyboard: typeof schema.storyboards.$inferSelect | undefined
  if (row.storyboardId) {
    const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, row.storyboardId)).all()
    storyboard = sb
  }

  const traceId = uuid()
  logTaskStart('BgmTask', 'resume-pixverse', { id: row.id, videoId })
  const mediaUrl = await pollPixverseTask(args.config, videoId, row.id, traceId)
  const localPath = await saveRemoteMediaAsBgmAudio(mediaUrl)

  db.update(schema.musicGenerations)
    .set({
      title: row.title || `PixVerse BGM ${row.id}`,
      audioUrl: mediaUrl,
      localPath,
      status: 'completed',
      completedAt: now(),
      updatedAt: now(),
    })
    .where(eq(schema.musicGenerations.id, row.id))
    .run()
  logTaskSuccess('BgmTask', 'pixverse-resumed', { id: row.id, localPath, storyboardId: storyboard?.id })
}

async function resumeBgmTask(row: MusicGenerationRow) {
  const provider = resolveBgmProvider(row.model || SUNO_DEFAULT_MODEL)
  if (provider === 'pixverse') {
    await resumePixverseBgmTask(row)
  } else {
    await resumeSunoBgmTask(row)
  }
}

export async function syncBgmRecord(recordId: number) {
  const [row] = db.select().from(schema.musicGenerations).where(eq(schema.musicGenerations.id, recordId)).all()
  if (!row) throw new Error('BGM record not found')
  if (row.status === 'completed' && row.localPath) return row
  if (!row.taskId) throw new Error('BGM record missing task_id')

  const args = buildResumeArgs(row)
  await completeSunoBgmTask(args, args.batchId, String(row.taskId), row.id, { force: true })
  const [updated] = db.select().from(schema.musicGenerations).where(eq(schema.musicGenerations.id, recordId)).all()
  return updated
}

/** 服务启动或前端轮询时恢复因重启中断的 BGM 异步任务 */
export function resumePendingBgmTasks(options?: { episodeId?: number }): number {
  reconcileOrphanBgmRecords(options?.episodeId)
  const allRows = db.select().from(schema.musicGenerations).all()
  const completedTaskIds = new Set(
    allRows.filter(r => r.status === 'completed' && r.taskId).map(r => String(r.taskId)),
  )

  let rows = allRows.filter(r => r.status === 'processing' && r.taskId && !completedTaskIds.has(String(r.taskId)))
  if (options?.episodeId) rows = rows.filter(r => r.episodeId === options.episodeId)

  const leadByTask = new Map<string, MusicGenerationRow>()
  for (const row of rows) {
    const key = String(row.taskId)
    const existing = leadByTask.get(key)
    if (!existing || row.id < existing.id) leadByTask.set(key, row)
  }

  if (!leadByTask.size) return 0

  logTaskStart('BgmTask', 'resume-pending', { count: leadByTask.size, episodeId: options?.episodeId })
  for (const row of leadByTask.values()) {
    resumeBgmTask(row).catch(err => {
      logTaskError('BgmTask', 'resume-failed', { id: row.id, taskId: row.taskId, error: err.message })
      markBgmTaskFailed(row.id, row.taskId, err.message)
    })
  }
  return leadByTask.size
}
