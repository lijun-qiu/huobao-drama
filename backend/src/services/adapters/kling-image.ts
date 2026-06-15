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
import { parseDataUrl } from '../../utils/storage.js'
import { getKlingModelMeta, klingModelRequiresReference, klingModelSupportsSingleReference } from '../../constants/kling-image-models.js'

const KLING_PREFIX = '/kling/v1'
const DEFAULT_MODEL = 'kling-v1-5'
/** 1k 约 ¥0.04/张；2k 约 ¥0.17/张（平台按清晰度计费） */
const DEFAULT_RESOLUTION = '1k'

function unwrapData(result: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return (result?.data ?? result ?? {}) as Record<string, unknown>
}

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
    return refs.map((item) => normalizeKlingImageRef(String(item || '').trim())).filter(Boolean)
  } catch {
    return []
  }
}

/** 4022/Kling 图生图 image 字段需要纯 base64 或公网 URL，不能传 data: 前缀 */
function normalizeKlingImageRef(value: string): string {
  if (!value) return ''
  if (value.startsWith('data:')) {
    const parsed = parseDataUrl(value)
    return parsed?.data || ''
  }
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('static/') || value.startsWith('/static/')) {
    throw new Error(`Kling 参考图路径未转换：${value}，请使用可访问 URL 或 base64`)
  }
  return value
}

function resolveModelName(record: ImageGenerationRecord, config: AIConfig): string {
  const model = String(record.model || config.model || DEFAULT_MODEL).trim()
  if (model.startsWith('kling-')) return model
  return DEFAULT_MODEL
}

function klingModelUsesImageReferenceParam(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (m === 'kling-v1') return false
  if (m === 'kling-v1-5') return true
  if (m.startsWith('kling-v2')) return true
  if (m === 'kling-v3') return true
  return false
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

    if (klingModelRequiresReference(modelName) && refs.length === 0) {
      throw new Error(`${modelName} 在 4022 仅支持图生图，请提供参考图或改用 kling-v1`)
    }

    if (refs.length >= 2) {
      const meta = getKlingModelMeta(modelName)
      if (meta && !meta.supportsMulti) {
        throw new Error(`${modelName} 不支持多图参考，请改用 kling-v2 / kling-v2-1，或单图时用 kling-v1`)
      }
      const body: Record<string, unknown> = {
        model_name: modelName,
        prompt: record.prompt || '',
        subject_image_list: refs.slice(0, 4).map((ref) => ({ subject_image: ref })),
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
      if (!klingModelSupportsSingleReference(modelName)) {
        throw new Error(`${modelName} 在 4022 不支持单图参考生图，请改用 kling-v1 / kling-v2，或去掉参考图`)
      }
      body.image = refs[0]
      if (klingModelUsesImageReferenceParam(modelName)) {
        body.image_reference = 'subject'
        const aging = /naturally aged|aged to elderly|aged to middle/i.test(record.prompt || '')
        body.image_fidelity = aging ? 0.45 : 0.72
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
      const msg = result?.message || result?.error?.message || `Kling API error: ${code}`
      if (/无可用渠道|distributor/i.test(msg)) {
        throw new Error(`4022 当前分组未开通该 Kling 模型渠道，请改用 kling-v1 或联系平台开通「特价kling」分组：${msg}`)
      }
      throw new Error(msg)
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
