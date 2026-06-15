import type { AIConfig } from '../ai.js'

export const SUNO_DEFAULT_MODEL = 'suno_music_open'

export interface SunoSubmitBody {
  mv?: string
  model?: string
  gpt_description_prompt: string
  make_instrumental?: boolean
  prompt?: string
}

export interface SunoTrack {
  id?: string
  title?: string
  audioUrl?: string
  imageUrl?: string
  duration?: number
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

export function buildSunoSubmitRequest(config: AIConfig, body: SunoSubmitBody) {
  const base = normalizeBaseUrl(config.baseUrl)
  const model = body.model || config.model || SUNO_DEFAULT_MODEL
  const payload: Record<string, unknown> = {
    gpt_description_prompt: body.gpt_description_prompt,
    make_instrumental: body.make_instrumental ?? true,
  }
  if (model.startsWith('chirp')) {
    payload.mv = model
  } else {
    payload.model = model
    payload.mv = 'chirp-v3-5'
  }
  if (body.prompt) payload.prompt = body.prompt

  return {
    url: `${base}/suno/submit/music`,
    method: 'POST' as const,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  }
}

export function buildSunoPollRequest(config: AIConfig, taskId: string) {
  const base = normalizeBaseUrl(config.baseUrl)
  return {
    url: `${base}/suno/fetch/${taskId}`,
    method: 'GET' as const,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  }
}

export function parseSunoSubmitResponse(result: unknown): string {
  const json = result as Record<string, unknown>
  const raw = json?.data ?? json
  if (typeof raw === 'string' && raw.trim()) return raw.trim()

  const data = raw as Record<string, unknown>
  let taskId = data?.task_id || data?.taskId || data?.job_id || data?.jobId || json?.task_id || json?.taskId
  if (typeof taskId === 'object' && taskId) {
    const nested = taskId as Record<string, unknown>
    taskId = nested.task_id || nested.taskId || nested.jobId
  }
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new Error('Suno submit response missing task_id')
  }
  return taskId.trim()
}

function pickAudioUrl(item: Record<string, unknown>): string | null {
  const candidates = [
    item.audio_url,
    item.audioUrl,
    item.stream_audio_url,
    item.streamAudioUrl,
    item.source_audio_url,
    item.sourceAudioUrl,
    item.source_stream_audio_url,
    item.sourceStreamAudioUrl,
    item.cdn_url,
    item.cdnUrl,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.startsWith('http')) return value
  }
  return null
}

function findAudioUrlDeep(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null
  if (typeof value === 'string') {
    if (value.startsWith('http') && /(\.mp3|\.m4a|\.wav|audio|cdn|suno)/i.test(value)) return value
    return null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrlDeep(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    const direct = pickAudioUrl(row)
    if (direct) return direct
    for (const nested of Object.values(row)) {
      const found = findAudioUrlDeep(nested, depth + 1)
      if (found) return found
    }
  }
  return null
}

function normalizeTrack(item: unknown): SunoTrack | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const audioUrl = pickAudioUrl(row) || findAudioUrlDeep(row)
  if (!audioUrl) return null
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    title: typeof row.title === 'string' ? row.title : undefined,
    audioUrl,
    imageUrl: typeof row.image_url === 'string'
      ? row.image_url
      : typeof row.imageUrl === 'string'
        ? row.imageUrl
        : typeof row.image_large_url === 'string'
          ? row.image_large_url
          : undefined,
    duration: typeof row.duration === 'number' ? row.duration : undefined,
  }
}

function collectTracks(payload: unknown): SunoTrack[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const data = (root.data ?? root) as Record<string, unknown>

  const buckets: unknown[] = []
  if (Array.isArray(data.items)) buckets.push(...data.items)
  if (Array.isArray(data.songs)) buckets.push(...data.songs)
  if (Array.isArray(data.clips)) buckets.push(...data.clips)
  const nested = (data.data ?? data.result ?? data.output ?? data) as unknown
  if (Array.isArray(nested)) buckets.push(...nested)
  if (Array.isArray(data.data)) buckets.push(...data.data)
  if (typeof nested === 'object' && nested && !Array.isArray(nested)) {
    const obj = nested as Record<string, unknown>
    if (Array.isArray(obj.items)) buckets.push(...obj.items)
    if (Array.isArray(obj.songs)) buckets.push(...obj.songs)
    if (Array.isArray(obj.clips)) buckets.push(...obj.clips)
  }

  const tracks: SunoTrack[] = []
  for (const item of buckets) {
    const track = normalizeTrack(item)
    if (track) tracks.push(track)
  }
  return tracks
}

export function parseSunoPollResponse(result: unknown): {
  status: 'pending' | 'completed' | 'failed'
  tracks: SunoTrack[]
  error?: string
} {
  const root = result as Record<string, unknown>
  const data = (root?.data ?? root) as Record<string, unknown>
  const statusRaw = String(data?.taskStatus || data?.status || data?.task_status || data?.state || '').toUpperCase()

  if (['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(statusRaw)) {
    const error = String(data?.fail_reason || data?.error || data?.message || 'Suno generation failed')
    return { status: 'failed', tracks: [], error }
  }

  const tracks = collectTracks(result)
  const isFinished = ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'DONE', 'FINISHED'].includes(statusRaw)

  if (tracks.length > 0) {
    return { status: 'completed', tracks }
  }

  if (isFinished) {
    return { status: 'pending', tracks: [] }
  }

  return { status: 'pending', tracks: [] }
}
