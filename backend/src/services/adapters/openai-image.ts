/**
 * OpenAI DALL-E / Qwen / GPT-Image 图片生成 Adapter
 * 端点: /v1/images/generations | /v1/images/edits
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

export const GPT_IMAGE_DEFAULT_MODEL = 'gpt-image-2-all'

function isQwenImageModel(model?: string | null) {
  return String(model || '').toLowerCase().startsWith('qwen-image')
}

export function isGptImageModel(model?: string | null) {
  return String(model || '').toLowerCase().startsWith('gpt-image')
}

function resolveGptImageModel(model?: string | null) {
  const picked = String(model || GPT_IMAGE_DEFAULT_MODEL).trim()
  return picked || GPT_IMAGE_DEFAULT_MODEL
}

function qwenImageMaxRefs(_model?: string | null) {
  return 3
}

function parseReferenceImages(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const refs = JSON.parse(raw)
    if (!Array.isArray(refs)) return []
    return refs.map(item => String(item || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function normalizeQwenGatewaySize(size?: string | null): string {
  const [w, h] = String(size || '1664x928').split(/[x*]/).map(Number)
  if (!w || !h) return '1664*928'
  const aspect = w / h
  if (aspect > 1.7) return '1664*928'
  if (aspect < 0.8) return '928*1664'
  return '1328*1328'
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null
  const buffer = Buffer.from(parsed.data, 'base64')
  return new Blob([buffer], { type: parsed.mimeType || 'image/jpeg' })
}

function strengthenGptImagePrompt(prompt: string): string {
  return [
    '【画风强制】中国短剧二维动漫定妆，赛璐璐平涂、干净细线稿、纯色灰背景。',
    '【禁止】像素风、复古滤镜、噪点抖动、海报场景、景深背景、怀旧颗粒。',
    prompt,
    '【再次强调】二维动漫角色设定图，不要像素不要复古滤镜。',
  ].join(' ')
}

function buildGptImageEditForm(record: ImageGenerationRecord, model: string): FormData {
  const form = new FormData()
  form.append('model', resolveGptImageModel(model))
  const refs = parseReferenceImages(record.referenceImages)
  const refPrefix = refs.length
    ? 'Use image1 as the character reference for face identity and art style consistency. '
    : ''
  form.append('prompt', strengthenGptImagePrompt(`${refPrefix}${record.prompt || ''}`.trim()))
  form.append('response_format', 'url')
  for (const ref of refs.slice(0, 4)) {
    const blob = dataUrlToBlob(ref)
    if (blob) form.append('image', blob, 'reference.jpg')
  }
  return form
}

export class OpenAIImageAdapter implements ImageProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'dall-e-3'
    const gptImage = isGptImageModel(model)
    const qwen = isQwenImageModel(model)
    const refs = parseReferenceImages(record.referenceImages)

    if (gptImage && refs.length) {
      return {
        url: joinProviderUrl(config.baseUrl, '/v1', '/images/edits'),
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: buildGptImageEditForm(record, model),
        bodyFormat: 'form-data',
      }
    }

    const size = qwen ? normalizeQwenGatewaySize(record.size) : (record.size || '1024x1024')

    const body: any = {
      model: gptImage ? resolveGptImageModel(model) : model,
      prompt: gptImage ? strengthenGptImagePrompt(record.prompt || '') : record.prompt,
      size,
      n: 1,
      response_format: 'url',
    }

    if (gptImage) {
      delete body.size
    }

    if (qwen) {
      body.watermark = false
      body.prompt_extend = !String(model || '').toLowerCase().includes('edit')
        && !/character reference portrait|character concept art/i.test(record.prompt || '')
    }

    if (refs.length) {
      const picked = refs.slice(0, qwen ? qwenImageMaxRefs(model) : 6)
      body.reference_images = picked
      if (qwen) {
        body.image_urls = picked
      }
      if (picked.length === 1) {
        body.image = picked[0]
        body.image_url = picked[0]
      }
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    if (result.task_id || result.id) {
      return { isAsync: true, taskId: result.task_id || result.id }
    }
    const imageUrl = result.data?.[0]?.url || result.url
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    const b64 = result.data?.[0]?.b64_json
    if (b64) {
      return { isAsync: false, imageUrl: undefined }
    }
    throw new Error('No image URL in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/images/task/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    if (result.status === 'completed') {
      return {
        status: 'completed',
        imageUrl: result.image_url || result.data?.[0]?.url || null,
      }
    }
    if (result.status === 'failed') {
      return { status: 'failed', error: result.error?.message || 'Generation failed' }
    }
    return { status: result.status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.[0]?.url || result.image_url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const raw = result.data?.[0]?.b64_json
    if (!raw) return null
    if (String(raw).startsWith('data:')) {
      const parsed = parseDataUrl(String(raw))
      if (parsed) return { data: parsed.data, mimeType: parsed.mimeType }
    }
    return { data: String(raw), mimeType: 'image/png' }
  }
}
