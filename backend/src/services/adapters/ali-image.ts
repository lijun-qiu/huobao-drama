/**
 * 阿里云百炼（万相 / Qwen-Image）图片生成 Adapter
 * - wan 系列: /services/aigc/image-generation/generation (异步)
 * - qwen-image 系列: /services/aigc/multimodal-generation/generation (同步)
 */
import type { ImageProviderAdapter, ImageGenerationRecord } from './types'
import { joinProviderUrl } from './url'

function isQwenImageModel(model?: string | null) {
  return String(model || '').toLowerCase().startsWith('qwen-image')
}

function isQwenImageEditModel(model?: string | null) {
  const m = String(model || '').toLowerCase()
  return m.startsWith('qwen-image-edit')
}

function qwenImageMaxRefs(model?: string | null) {
  return isQwenImageModel(model) ? 3 : 6
}

function isImageReferenceValue(value: string) {
  return value.startsWith('http://')
    || value.startsWith('https://')
    || value.startsWith('data:image/')
}

export class AliImageAdapter implements ImageProviderAdapter {
  readonly provider = 'ali'

  buildGenerateRequest(config: any, record: ImageGenerationRecord): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    const model = record.model || config.model || 'wan2.6-t2i'
    const qwen = isQwenImageModel(model)

    const path = qwen
      ? '/services/aigc/multimodal-generation/generation'
      : '/services/aigc/image-generation/generation'
    const url = joinProviderUrl(baseUrl, '/api/v1', path)

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (!qwen) headers['X-DashScope-Async'] = 'enable'

    const size = this.normalizeSize(record.size || '1920x1080', model)
    const content = this.buildContent(record, qwen, model)

    const body: any = {
      model,
      input: {
        messages: [{ role: 'user', content }],
      },
      parameters: {
        size,
        n: 1,
        negative_prompt: qwen ? 'low quality, blurry, watermark' : '',
        prompt_extend: true,
        watermark: false,
      },
    }

    if (!qwen && !record.referenceImages) {
      body.parameters.seed = Math.floor(Math.random() * 2147483647)
    }

    return { url, method: 'POST', headers, body }
  }

  private buildContent(record: ImageGenerationRecord, qwen: boolean, model?: string | null) {
    const content: Array<Record<string, string>> = []
    const qwenEdit = isQwenImageEditModel(model)

    if (qwen && record.referenceImages) {
      try {
        const refs = JSON.parse(record.referenceImages)
        const maxRefs = qwenImageMaxRefs(model)
        for (const ref of refs.slice(0, maxRefs)) {
          const value = String(ref || '').trim()
          if (!value) continue
          if (isImageReferenceValue(value)) {
            content.push({ image: value })
          }
        }
      } catch {}
    }

    content.push({ text: record.prompt || (qwenEdit ? 'Generate an image based on reference' : 'Generate an image') })
    return content
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
  } {
    const imageUrl = this.extractImageUrl(result)
    if (imageUrl) return { isAsync: false, imageUrl }

    if (result.output?.task_status === 'PENDING' && result.output?.task_id) {
      return { isAsync: true, taskId: result.output.task_id }
    }

    throw new Error(`Unexpected Ali image response: ${JSON.stringify(result).slice(0, 200)}`)
  }

  buildPollRequest(config: any, taskId: string): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    return {
      url: joinProviderUrl(baseUrl, '/api/v1', `/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    error?: string
  } {
    const status = result.output?.task_status

    if (status === 'SUCCEEDED') {
      const imageUrl = this.extractImageUrl(result)
      return { status: 'completed', imageUrl: imageUrl || undefined }
    }

    if (status === 'FAILED') {
      return { status: 'failed', error: result.message || 'Generation failed' }
    }

    if (status === 'PENDING' || status === 'RUNNING') {
      return { status: 'processing' }
    }

    return { status: 'pending' }
  }

  extractImageBase64(_result: any): { data: string; mimeType: string } | null {
    return null
  }

  extractImageUrl(result: any): string | null {
    const parts = result.output?.choices?.[0]?.message?.content || []
    for (const part of parts) {
      if (part?.image) return part.image
    }
    return null
  }

  private normalizeSize(size: string, model?: string | null): string {
    const qwen = isQwenImageModel(model)
    const [w, h] = size.split(/[x*]/).map(Number)
    if (w && h) {
      const aspect = w / h
      if (aspect > 1.7) return qwen ? '1664*928' : '1696*960'
      if (aspect < 0.8) return qwen ? '928*1664' : '960*1696'
      return qwen ? '1328*1328' : '1280*1280'
    }
    return qwen ? '1664*928' : '1280*1280'
  }
}
