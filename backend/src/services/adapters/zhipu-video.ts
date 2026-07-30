/**
 * 智谱 CogVideoX 视频生成 Adapter（异步）
 * @see https://docs.bigmodel.cn/cn/guide/models/free/cogvideox-flash
 * POST /paas/v4/videos/generations → GET /paas/v4/async-result/{id}
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'
import { ZHIPU_OPENAI_BASE_URL } from '../../constants/local-comic.js'

export const ZHIPU_DEFAULT_VIDEO_MODEL = 'cogvideox-flash'

function zhipuBase(config: AIConfig): string {
  return (config.baseUrl || ZHIPU_OPENAI_BASE_URL).replace(/\/+$/, '')
}

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export function isZhipuVideoModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('cogvideox') || m === 'cogvideox-flash'
}

function normalizeVideoSize(aspectRatio?: string | null): string {
  const ratio = String(aspectRatio || '16:9').trim()
  if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3') return '720x1440'
  if (ratio === '1:1') return '1024x1024'
  if (ratio === '4:3' || ratio === '3:2') return '1152x864'
  return '1344x768'
}

function firstImageUrl(record: VideoGenerationRecord): string {
  return String(
    record.imageUrl
    || record.firstFrameUrl
    || ''
  ).trim()
}

export class ZhipuVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'zhipu'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = String(record.model || config.model || ZHIPU_DEFAULT_VIDEO_MODEL).trim()
      || ZHIPU_DEFAULT_VIDEO_MODEL
    const prompt = String(record.prompt || '').trim().slice(0, 512)
    const imageUrl = firstImageUrl(record)

    const body: Record<string, unknown> = {
      model,
      size: normalizeVideoSize(record.aspectRatio),
      fps: 30,
    }
    if (prompt) body.prompt = prompt
    if (imageUrl) body.image_url = imageUrl
    if (!prompt && !imageUrl) {
      body.prompt = 'cinematic motion, subtle camera move'
    }

    return {
      url: joinProviderUrl(zhipuBase(config), '', '/videos/generations'),
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const taskId = result?.id || result?.task_id || result?.request_id
    if (taskId) return { isAsync: true, taskId: String(taskId) }

    const url = result?.video_result?.[0]?.url || result?.video_url
    if (url) return { isAsync: false, videoUrl: String(url) }

    throw new Error(`Unexpected Zhipu video response: ${JSON.stringify(result).slice(0, 240)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(zhipuBase(config), '', `/async-result/${encodeURIComponent(taskId)}`),
      method: 'GET',
      headers: authHeaders(config.apiKey),
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = String(result?.task_status || result?.status || '').toUpperCase()
    if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED') {
      const videoUrl = result?.video_result?.[0]?.url || result?.video_url
      if (videoUrl) return { status: 'completed', videoUrl: String(videoUrl) }
      return { status: 'failed', error: 'Zhipu video completed without URL' }
    }
    if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
      return {
        status: 'failed',
        error: result?.error?.message || result?.message || 'Zhipu video failed',
      }
    }
    if (status === 'PROCESSING' || status === 'PENDING' || status === 'RUNNING') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractVideoUrl(result: any): string | null {
    return result?.video_result?.[0]?.url || result?.video_url || null
  }
}
