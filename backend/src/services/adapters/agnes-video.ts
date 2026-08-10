/**
 * Agnes Video Adapter（图生视频）
 * 对照 Toonflow-app data/vendor/agnes.ts：
 * - POST {base}/videos
 * - GET {hubOrigin}/agnesapi?video_id=&model_name=
 * 单图：mode=ti2vid；首尾帧：extra_body.mode=keyframes
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { AGNES_OPENAI_BASE_URL } from './agnes-image.js'

export const AGNES_DEFAULT_VIDEO_MODEL = 'agnes-video-v2.0'

export function isAgnesVideoModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('agnes-video')
}

export function resolveAgnesVideoModel(model?: string | null): string {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return AGNES_DEFAULT_VIDEO_MODEL
  if (m.startsWith('agnes-video')) return m
  return AGNES_DEFAULT_VIDEO_MODEL
}

function agnesBase(config: AIConfig): string {
  return (config.baseUrl || AGNES_OPENAI_BASE_URL).replace(/\/+$/, '')
}

function hubOrigin(config: AIConfig): string {
  return agnesBase(config).replace(/\/v1\/?$/, '')
}

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

function resolveVideoSize(aspectRatio?: string | null): { width: number; height: number } {
  const ar = String(aspectRatio || '16:9').trim()
  const portrait = ar === '9:16' || ar.startsWith('9:')
  // 默认 720p（与 Toonflow 一致）
  return portrait ? { width: 720, height: 1280 } : { width: 1280, height: 720 }
}

/** num_frames 须 ≤441 且满足 8n+1 */
export function agnesDurationToFrames(durationSec?: number | null, fps = 24): { num_frames: number; frame_rate: number } {
  const sec = Math.max(1, Math.min(18, Number(durationSec) || 5))
  let frames = Math.round(sec * fps)
  frames = Math.floor((frames - 1) / 8) * 8 + 1
  if (frames < 9) frames = 9
  if (frames > 441) frames = 441
  return { num_frames: frames, frame_rate: fps }
}

function collectRefs(record: VideoGenerationRecord): string[] {
  const mode = String(record.referenceMode || '').toLowerCase()
  const refs: string[] = []
  if (mode === 'first_last' || mode === 'startendrequired' || mode === 'keyframes') {
    const a = String(record.firstFrameUrl || record.imageUrl || '').trim()
    const b = String(record.lastFrameUrl || '').trim()
    if (a) refs.push(a)
    if (b && b !== a) refs.push(b)
  } else {
    const single = String(record.imageUrl || record.firstFrameUrl || '').trim()
    if (single) refs.push(single)
    if (record.referenceImageUrls) {
      try {
        const arr = JSON.parse(record.referenceImageUrls)
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const u = String(item || '').trim()
            if (u && !refs.includes(u)) refs.push(u)
          }
        }
      } catch { /* ignore */ }
    }
  }
  return refs.slice(0, 2)
}

export class AgnesVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'agnes'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const modelName = resolveAgnesVideoModel(record.model || config.model)
    const refs = collectRefs(record)
    const { width, height } = resolveVideoSize(record.aspectRatio)
    const { num_frames, frame_rate } = agnesDurationToFrames(record.duration)
    const prompt = String(record.prompt || '').trim() || 'cinematic motion, natural movement'

    const body: Record<string, unknown> = {
      model: modelName,
      prompt,
      width,
      height,
      num_frames,
      frame_rate,
    }

    const mode = String(record.referenceMode || '').toLowerCase()
    const useKeyframes = mode === 'first_last'
      || mode === 'startendrequired'
      || mode === 'keyframes'
      || (refs.length >= 2)

    if (useKeyframes && refs.length >= 1) {
      body.extra_body = {
        image: refs.slice(0, 2),
        mode: 'keyframes',
      }
    } else if (refs.length >= 1) {
      body.image = refs[0]
      body.mode = 'ti2vid'
    }

    return {
      url: `${agnesBase(config)}/videos`,
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const videoId = result?.video_id || result?.id || result?.task_id
    if (videoId) return { isAsync: true, taskId: String(videoId) }

    const videoUrl = result?.metadata?.url || result?.url || result?.data?.url || result?.video_url
    if (videoUrl) return { isAsync: false, videoUrl: String(videoUrl) }

    throw new Error(`Unexpected Agnes video response: ${JSON.stringify(result).slice(0, 240)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    const modelName = resolveAgnesVideoModel(config.model)
    const url = `${hubOrigin(config)}/agnesapi?video_id=${encodeURIComponent(String(taskId))}&model_name=${encodeURIComponent(modelName)}`
    return {
      url,
      method: 'GET',
      headers: authHeaders(config.apiKey),
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = String(result?.status || '').toLowerCase()
    if (status === 'completed' || status === 'success') {
      const videoUrl = result?.metadata?.url || result?.url || result?.data?.url || result?.video_url
      if (!videoUrl) return { status: 'failed', error: '视频完成但未返回 URL' }
      return { status: 'completed', videoUrl: String(videoUrl) }
    }
    if (status === 'failed' || status === 'error') {
      const err = result?.error?.message || result?.message || 'Agnes 视频生成失败'
      return { status: 'failed', error: String(err) }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result?.metadata?.url || result?.url || result?.data?.url || result?.video_url || null
  }
}
