/**
 * Gemini 图片生成 Adapter
 * 认证: 同时兼容两种方式
 * 1. URL Query 参数 ?key=
 * 2. Header 认证（x-goog-api-key / Authorization: Bearer）
 * 请求: Google REST 风格的 contents[].parts[] 结构
 * 响应: base64 编码在 inlineData.data 中，无 URL
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

function is4022Gateway(baseUrl: string) {
  const base = String(baseUrl || '').toLowerCase()
  return base.includes('4022543') || base.includes('4022')
}

function normalizeGeminiModelId(model: string): string {
  const raw = String(model || '').trim()
  return raw.startsWith('models/') ? raw.slice('models/'.length) : raw
}

function buildGeminiGenerateUrl(config: AIConfig, model: string): string {
  const modelPath = `/models/${normalizeGeminiModelId(model)}:generateContent`
  // 4022 与文本 Gemini 相同：/v1beta/models/{model}:generateContent（非 /gemini/v1beta）
  return joinProviderUrl(config.baseUrl, '/v1beta', modelPath)
}

function buildGeminiParts(record: ImageGenerationRecord): any[] {
  const parts: any[] = []
  if (record.referenceImages) {
    try {
      const refs = JSON.parse(record.referenceImages)
      for (const ref of refs) {
        const parsed = parseDataUrl(String(ref || ''))
        if (parsed) {
          parts.push({
            inline_data: {
              mime_type: parsed.mimeType,
              data: parsed.data,
            },
          })
        }
      }
    } catch {}
  }
  parts.push({ text: record.prompt || 'Generate an image' })
  return parts
}

function buildOpenAIChatContent(record: ImageGenerationRecord): any[] | string {
  const items: any[] = [{ type: 'text', text: record.prompt || 'Generate an image' }]
  if (record.referenceImages) {
    try {
      const refs = JSON.parse(record.referenceImages)
      for (const ref of refs) {
        const value = String(ref || '').trim()
        if (!value) continue
        if (value.startsWith('data:image/')) {
          items.push({ type: 'image_url', image_url: { url: value } })
        }
      }
    } catch {}
  }
  return items.length === 1 ? items[0].text : items
}

export class GeminiImageAdapter implements ImageProviderAdapter {
  provider = 'gemini'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const modelName = record.model || config.model || 'gemini-3.1-flash-image-preview'
    const model = modelName.startsWith('models/') ? modelName : `models/${modelName}`
    const parts = buildGeminiParts(record)

    const body = {
      contents: [{
        parts,
      }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: this.parseAspectRatio(record.size),
          imageSize: this.parseImageSize(record.size),
        },
      },
    }

    const url = new URL(buildGeminiGenerateUrl(config, model))
    if (!is4022Gateway(config.baseUrl)) {
      url.searchParams.set('key', config.apiKey)
    }

    return {
      url: url.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  /** 4022 网关：native 失败时尝试 OpenAI chat/completions */
  buildGenerateRequestVariants(config: AIConfig, record: ImageGenerationRecord): ProviderRequest[] {
    const native = this.buildGenerateRequest(config, record)
    if (!is4022Gateway(config.baseUrl)) return [native]

    const modelName = normalizeGeminiModelId(record.model || config.model || 'gemini-3.1-flash-image-preview')
    const chat: ProviderRequest = {
      url: joinProviderUrl(config.baseUrl, '/v1', '/chat/completions'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: {
        model: modelName,
        messages: [{ role: 'user', content: buildOpenAIChatContent(record) }],
      },
    }
    return [native, chat]
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const firstCandidate = result?.candidates?.[0]
    const finishReason = firstCandidate?.finishReason || firstCandidate?.finish_reason
    const finishMessage = firstCandidate?.finishMessage || firstCandidate?.finish_message

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(finishMessage || `Gemini generation stopped: ${finishReason}`)
    }

    if (this.extractImageUrl(result)) {
      return { isAsync: false, imageUrl: this.extractImageUrl(result) || undefined }
    }

    if (this.extractImageBase64(result)) {
      return { isAsync: false, imageUrl: undefined }
    }

    if (result.task_id || result.id) {
      return { isAsync: true, taskId: result.task_id || result.id }
    }

    if (result.error) {
      throw new Error(result.error.message || 'Gemini generation failed')
    }
    throw new Error('No image data in Gemini response')
  }

  parsePollResponse(result: any): ImagePollResponse {
    // Gemini 是同步的，通常不会走到这里
    return { status: 'completed' }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    // Gemini 不需要轮询，但实现接口以保持一致
    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/${taskId}`))
    url.searchParams.set('key', config.apiKey)
    return {
      url: url.toString(),
      method: 'GET',
      headers: {
        'x-goog-api-key': config.apiKey,
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  extractImageUrl(result: any): string | null {
    return result?.data?.[0]?.url
      || result?.image_url
      || result?.url
      || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result?.data?.[0]?.b64_json
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }

    const parts = result.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData || part.inline_data) {
        const inline = part.inlineData || part.inline_data
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || 'image/png',
        }
      }
    }

    const message = result?.choices?.[0]?.message
    const content = message?.content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'image_url' && part.image_url?.url?.startsWith('data:image/')) {
          const parsed = parseDataUrl(part.image_url.url)
          if (parsed) return { data: parsed.data, mimeType: parsed.mimeType }
        }
        if (part?.inline_data?.data || part?.inlineData?.data) {
          const inline = part.inline_data || part.inlineData
          return {
            data: inline.data,
            mimeType: inline.mime_type || inline.mimeType || 'image/png',
          }
        }
      }
    }
    return null
  }

  private parseAspectRatio(size?: string | null): string {
    if (!size) return '16:9'
    const [w, h] = size.split('x').map(Number)
    if (!w || !h) return '16:9'
    const gcd = this.gcd(w, h)
    return `${w / gcd}:${h / gcd}`
  }

  private parseImageSize(size?: string | null): string {
    if (!size) return '1K'
    const [w] = size.split('x').map(Number)
    if (!w) return '1K'
    if (w >= 2048) return '4K'
    if (w >= 1024) return '2K'
    if (w >= 512) return '1K'
    return '512'
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b)
  }
}
