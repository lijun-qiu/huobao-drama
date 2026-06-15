import { v4 as uuid } from 'uuid'
import type { AIConfig } from '../ai.js'

export const PIXVERSE_SOUND_MODEL = 'pixverse-sound-effect'

export function isPixverseSoundModel(model?: string | null) {
  const m = String(model || '').toLowerCase()
  return m === PIXVERSE_SOUND_MODEL || m.includes('pixverse-sound')
}

export function is4022Gateway(baseUrl: string) {
  const base = String(baseUrl || '').toLowerCase()
  return base.includes('4022543') || base.includes('4022')
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

export function buildPixverseHeaders(config: AIConfig, traceId = uuid()): Record<string, string> {
  if (is4022Gateway(config.baseUrl)) {
    return {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Ai-Trace-Id': traceId,
    }
  }
  return {
    'API-KEY': config.apiKey,
    'Ai-Trace-Id': traceId,
    'Content-Type': 'application/json',
  }
}

export function buildPixverseSubmitUrl(config: AIConfig) {
  const base = normalizeBaseUrl(config.baseUrl)
  return `${base}/openapi/v2/video/sound_effect/generate`
}

export function buildPixversePollUrl(config: AIConfig, videoId: string | number) {
  const base = normalizeBaseUrl(config.baseUrl)
  return `${base}/openapi/v2/video/result/${videoId}`
}

export function buildPixverseUploadUrl(config: AIConfig) {
  const base = normalizeBaseUrl(config.baseUrl)
  return `${base}/openapi/v2/media/upload`
}

export interface PixverseSubmitBody {
  model?: string
  sound_effect_content: string
  original_sound_switch?: boolean
  source_video_id?: number
  video_media_id?: number
  prompt?: string
}

export function buildPixverseSubmitBody(model: string, prompt: string, options?: {
  videoMediaId?: number
  sourceVideoId?: number
}) {
  const body: PixverseSubmitBody = {
    model: model || PIXVERSE_SOUND_MODEL,
    sound_effect_content: prompt,
    original_sound_switch: false,
  }
  if (options?.videoMediaId) body.video_media_id = options.videoMediaId
  if (options?.sourceVideoId) body.source_video_id = options.sourceVideoId
  return body
}

export function parsePixverseSubmitResponse(result: unknown): string {
  const root = result as Record<string, unknown>
  if (root.ErrCode !== undefined && Number(root.ErrCode) !== 0) {
    throw new Error(String(root.ErrMsg || `PixVerse error ${root.ErrCode}`))
  }

  const resp = (root.Resp ?? root.data ?? root) as Record<string, unknown>
  const raw = resp?.video_id ?? resp?.videoId ?? resp?.id ?? root?.video_id ?? root?.task_id ?? root?.taskId
  if (typeof raw === 'number') return String(raw)
  if (typeof raw === 'string' && raw.trim()) return raw.trim()

  const rawData = root.data
  if (typeof rawData === 'string' && rawData.trim()) return rawData.trim()
  const data = rawData as Record<string, unknown> | undefined
  if (data?.video_id != null) return String(data.video_id)
  if (data?.task_id != null) return String(data.task_id)

  throw new Error('PixVerse submit response missing video_id')
}

export function parsePixversePollResponse(result: unknown): {
  status: 'pending' | 'completed' | 'failed'
  mediaUrl?: string
  error?: string
} {
  const root = result as Record<string, unknown>
  if (root.ErrCode !== undefined && Number(root.ErrCode) !== 0) {
    return { status: 'failed', error: String(root.ErrMsg || `PixVerse error ${root.ErrCode}`) }
  }

  const resp = (root.Resp ?? root.data ?? root) as Record<string, unknown>
  const statusCode = Number(resp?.status ?? resp?.task_status ?? -1)
  const statusRaw = String(resp?.status ?? resp?.task_status ?? resp?.taskStatus ?? '').toLowerCase()

  if (statusCode === 7 || statusCode === 8) {
    return { status: 'failed', error: String(resp?.message || root.ErrMsg || 'PixVerse generation failed') }
  }
  if (['failed', 'error', 'failure'].includes(statusRaw)) {
    return { status: 'failed', error: String(resp?.message || root.ErrMsg || 'PixVerse generation failed') }
  }

  const mediaUrl = pickMediaUrl(resp) || pickMediaUrl(root)
  if (statusCode === 1 || ['success', 'succeeded', 'completed', 'done'].includes(statusRaw)) {
    if (mediaUrl) return { status: 'completed', mediaUrl }
    return { status: 'pending' }
  }
  if (mediaUrl) return { status: 'completed', mediaUrl }

  return { status: 'pending' }
}

function pickMediaUrl(obj: Record<string, unknown> | null | undefined): string | undefined {
  if (!obj) return undefined
  const candidates = [obj.url, obj.audio_url, obj.audioUrl, obj.video_url, obj.videoUrl, obj.media_url]
  for (const value of candidates) {
    if (typeof value === 'string' && value.startsWith('http')) return value
  }
  return undefined
}
