/**
 * 智谱 CogView 文生图 Adapter
 * @see https://docs.bigmodel.cn/cn/guide/models/free/cogview-3-flash
 * POST /paas/v4/images/generations（同步，返回 data[0].url）
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
import { ZHIPU_OPENAI_BASE_URL } from '../../constants/local-comic.js'

export const ZHIPU_DEFAULT_IMAGE_MODEL = 'cogview-3-flash'

const COGVIEW_SIZES = [
  '1024x1024',
  '768x1344',
  '864x1152',
  '1344x768',
  '1152x864',
  '1440x720',
  '720x1440',
] as const

function zhipuBase(config: AIConfig): string {
  return (config.baseUrl || ZHIPU_OPENAI_BASE_URL).replace(/\/+$/, '')
}

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

/** 将任意 WxH 映射到 CogView 推荐尺寸 */
export function normalizeCogViewSize(size?: string | null): string {
  const raw = String(size || '1344x768').toLowerCase().replace('*', 'x')
  if ((COGVIEW_SIZES as readonly string[]).includes(raw)) return raw
  const [w, h] = raw.split(/[x×]/).map(Number)
  if (!w || !h) return '1344x768'
  const aspect = w / h
  if (aspect > 1.7) return '1440x720'
  if (aspect > 1.3) return '1344x768'
  if (aspect > 1.1) return '1152x864'
  if (aspect > 0.9) return '1024x1024'
  if (aspect > 0.7) return '864x1152'
  if (aspect > 0.55) return '768x1344'
  return '720x1440'
}

export function isZhipuImageModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('cogview') || m === 'cogview-3-flash'
}

export class ZhipuImageAdapter implements ImageProviderAdapter {
  readonly provider = 'zhipu'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = String(record.model || config.model || ZHIPU_DEFAULT_IMAGE_MODEL).trim()
      || ZHIPU_DEFAULT_IMAGE_MODEL
    return {
      url: joinProviderUrl(zhipuBase(config), '', '/images/generations'),
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body: {
        model,
        prompt: String(record.prompt || '').trim() || 'anime illustration',
        size: normalizeCogViewSize(record.size),
      },
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const url = result?.data?.[0]?.url
    if (url) return { isAsync: false, imageUrl: String(url) }
    // 少数异步形态
    const taskId = result?.id || result?.task_id
    if (taskId && (result?.task_status || result?.status)) {
      return { isAsync: true, taskId: String(taskId) }
    }
    throw new Error(`Unexpected Zhipu image response: ${JSON.stringify(result).slice(0, 240)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(zhipuBase(config), '', `/async-result/${encodeURIComponent(taskId)}`),
      method: 'GET',
      headers: authHeaders(config.apiKey),
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    const status = String(result?.task_status || result?.status || '').toUpperCase()
    if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED') {
      const url = result?.data?.[0]?.url
        || result?.image_result?.[0]?.url
        || result?.data?.[0]?.image_url
      if (url) return { status: 'completed', imageUrl: String(url) }
      return { status: 'failed', error: 'Zhipu image completed without URL' }
    }
    if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
      return { status: 'failed', error: result?.error?.message || result?.message || 'Zhipu image failed' }
    }
    if (status === 'PROCESSING' || status === 'PENDING' || status === 'RUNNING') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractImageUrl(result: any): string | null {
    return result?.data?.[0]?.url || result?.image_result?.[0]?.url || null
  }

  extractImageBase64(): null {
    return null
  }
}
