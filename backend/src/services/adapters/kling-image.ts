/**
 * 可灵 Kling 图片生成 Adapter
 * - 文生图: POST /kling/v1/images/generations
 * - 多图参考: POST /kling/v1/images/multi-image2image
 * - 轮询: GET /kling/v1/images/generations/{task_id}
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'

const KLING_PREFIX = '/kling/v1'
const DEFAULT_MODEL = 'kling-v2-1'
/** 1k 约 ¥0.04/张；2k 约 ¥0.17/张（平台按清晰度计费） */
const DEFAULT_RESOLUTION = '1k'

function sizeToAspectRatio(size?: string | null): string {
  if (!size) return '16:9'
  const [w, h] = size.split(/[x*]/).map(Number)
  if (!w || !h) return '16:9'
  const ratio = w / h
  if (ratio > 1.7) return '16:9'
  if (ratio < 0.7) return '9:16'
  if (ratio > 1.2) return '4:3'
  if (ratio < 0.85) return '3:4'
  return '1:1'
}

function parseReferenceImages(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const refs = JSON.parse(raw)
    if (!Array.isArray(refs)) return []
    return refs.map((item) => String(item || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function resolveModelName(record: ImageGenerationRecord, config: AIConfig): string {
  const model = String(record.model || config.model || DEFAULT_MODEL).trim()
  if (model.startsWith('kling-')) return model
  return DEFAULT_MODEL
}

function unwrapData(result: any) {
  return result?.data ?? result
}

export class KlingImageAdapter implements ImageProviderAdapter {
  provider = 'kling'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const modelName = resolveModelName(record, config)
    const refs = parseReferenceImages(record.referenceImages)
    const aspectRatio = sizeToAspectRatio(record.size)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    }

    if (refs.length >= 2) {
      const body: Record<string, unknown> = {
        model_name: modelName,
        prompt: record.prompt || '',
        subject_image_list: refs.slice(0, 4).map((subject_image) => ({ subject_image })),
        n: 1,
        aspect_ratio: aspectRatio,
        resolution: DEFAULT_RESOLUTION,
      }
      return {
        url: joinProviderUrl(config.baseUrl, KLING_PREFIX, '/images/multi-image2image'),
        method: 'POST',
        headers,
        body,
      }
    }

    const body: Record<string, unknown> = {
      model_name: modelName,
      prompt: record.prompt || '',
      n: 1,
      aspect_ratio: aspectRatio,
      resolution: DEFAULT_RESOLUTION,
    }

    if (refs.length === 1) {
      body.image = refs[0]
      if (modelName === 'kling-v1-5') {
        body.image_reference = 'subject'
        body.image_fidelity = 0.7
      }
    }

    return {
      url: joinProviderUrl(config.baseUrl, KLING_PREFIX, '/images/generations'),
      method: 'POST',
      headers,
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const code = result?.code
    if (code !== undefined && code !== 0 && code !== 'success') {
      throw new Error(result?.message || `Kling API error: ${code}`)
    }

    const data = unwrapData(result)
    if (data?.task_id) {
      return { isAsync: true, taskId: String(data.task_id) }
    }

    const imageUrl = this.extractImageUrl(data)
    if (imageUrl) return { isAsync: false, imageUrl }
    throw new Error('No task_id or image URL in Kling response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, KLING_PREFIX, `/images/generations/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    const code = result?.code
    if (code !== undefined && code !== 0 && code !== 'success') {
      return { status: 'failed', error: result?.message || `Kling poll error: ${code}` }
    }

    const data = unwrapData(result)
    const status = String(data?.task_status || data?.status || '').toLowerCase()

    if (status === 'succeed' || status === 'succeeded' || status === 'success') {
      return { status: 'completed', imageUrl: this.extractImageUrl(data) || undefined }
    }
    if (status === 'failed' || status === 'error') {
      return {
        status: 'failed',
        error: data?.task_status_msg || data?.error || result?.message || 'Generation failed',
      }
    }
    if (status === 'submitted' || status === 'processing' || status === 'running' || status === 'pending') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractImageUrl(result: any): string | null {
    const data = unwrapData(result)
    const fromTask = data?.task_result?.images?.[0]?.url
    if (fromTask) return fromTask
    if (data?.url) return data.url
    if (result?.url) return result.url
    return null
  }

  extractImageBase64(): { data: string; mimeType: string } | null {
    return null
  }
}
