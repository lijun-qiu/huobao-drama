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

export const GPT_IMAGE_DEFAULT_MODEL = 'gpt-image-2'

function isQwenImageModel(model?: string | null) {
  return String(model || '').toLowerCase().startsWith('qwen-image')
}

export function isGptImageModel(model?: string | null) {
  return String(model || '').toLowerCase().startsWith('gpt-image')
}

export function isSeedreamImageModel(model?: string | null) {
  const m = String(model || '').toLowerCase()
  return m.startsWith('doubao-seedream') || m.startsWith('seedream')
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
  const p = prompt || ''
  const isPortrait = /character reference portrait|character design sheet|定妆|turnaround view|三视图/i.test(p)
  const isThreeViewPortrait = isPortrait && /modern Chinese webtoon comic|manhua illustration|16:9 widescreen character|现代国漫条漫|现代高质量 2D 动漫|动漫三视图|素体小人三视图|白色素体|极简素体|three views front side back|turnaround design sheet/i.test(p)
  const isTitle = /opening background|title overlay|片头|reserved for dynamic title/i.test(p)

  if (isThreeViewPortrait) {
    const isMotionComic = /现代国漫条漫|webtoon comic|粗黑线描|manhua illustration/i.test(p)
    const isMinimal = /素体小人|白色素体|极简素体|stick figure/i.test(p)
    const styleLine = isMotionComic
      ? '现代国漫条漫二维动漫定妆，粗黑线描、平涂赛璐璐、正常头身比、英俊帅气动漫脸型、纯白色背景'
      : isMinimal
        ? '极简素体小人定妆，白色简笔轮廓、正常卡通脸圆眼带高光、纯白色背景'
        : '现代高质量二维动漫定妆，清晰线稿、赛璐璐平涂、正常头身比、英俊帅气动漫脸型、纯白色背景'
    const faceHint = isMinimal ? '清晰展示正常卡通脸与体型比例' : '清晰展示脸型五官与全身服装'
    return [
      `【画风强制】${styleLine}。`,
      `【构图强制】16:9横屏三视图定妆参考图（正面+侧面+背面同屏），${faceHint}，禁止单角度半身或灰底。`,
      '【禁止】像素风、复古滤镜、Q版三头身、3D渲染、厚涂肌理、海报场景、景深背景、仅大头特写、手持道具、拿物品。',
      p,
      `【再次强调】白底三视图${isMinimal ? '素体小人' : '动漫'}角色设定图，${isMinimal ? '正常卡通脸清晰' : '脸型清晰英俊'}，双手自然下垂不拿道具，不要单视角不要灰底不要像素不要复古滤镜。`,
    ].join(' ')
  }

  if (isPortrait) {
    return [
      '【画风强制】中国短剧二维动漫定妆，赛璐璐平涂、干净细线稿、纯色灰背景。',
      '【禁止】像素风、复古滤镜、噪点抖动、海报场景、景深背景、怀旧颗粒。',
      p,
      '【再次强调】二维动漫角色设定图，不要像素不要复古滤镜。',
    ].join(' ')
  }

  if (isTitle) {
    return [
      '【画风强制】中国短剧二维动漫片头背景，赛璐璐平涂、干净细线稿，与抖音解说短剧一致。',
      '【禁止】浪漫时钟玫瑰、梦幻虚焦、像素风、复古滤镜、怀旧颗粒、恋爱情侣剪影。',
      p,
      '【再次强调】解说片头场景背景，短剧动漫画风，不要浪漫抽象装饰。',
    ].join(' ')
  }

  return [
    '【画风强制】中国短剧二维动漫场景插画，赛璐璐平涂、干净细线稿、正常头身比，与参考图线稿完全一致。',
    '【禁止】半写实、厚涂、概念插画风、manhua、渐变厚涂、恋爱情侣、浪漫时钟玫瑰、像素风、复古滤镜、怀旧颗粒。',
    p,
    '【再次强调】抖音短剧解说二维动漫，赛璐璐平涂，不要半写实不要厚涂不要概念插画风。',
  ].join(' ')
}

function buildGptImageReferencePrefix(prompt: string, refCount: number): string {
  if (!refCount) return ''
  const isPortrait = /character reference portrait|character design sheet|定妆|turnaround view/i.test(prompt)
  const isStyleOnly = /art style, line weight, flat cel shading, and color technique ONLY/i.test(prompt)
  const isIdentity = /same person as reference image/i.test(prompt)
  if (isPortrait && isStyleOnly && !isIdentity) {
    return 'Use image1 ONLY for art style, line weight, and flat cel shading. Do NOT copy face, hair, or outfit from reference. '
  }
  if (isPortrait) {
    return 'Use image1 as the character reference for face identity and art style consistency. '
  }
  return [
    'Use reference image(s) for BOTH character identity AND exact art style.',
    'Match reference line weight, flat cel shading, and color palette exactly.',
    'Do NOT shift to semi-realistic or painterly rendering.',
  ].join(' ') + ' '
}

function buildGptImageEditForm(record: ImageGenerationRecord, model: string): FormData {
  const form = new FormData()
  form.append('model', resolveGptImageModel(model))
  const refs = parseReferenceImages(record.referenceImages)
  const refPrefix = buildGptImageReferencePrefix(record.prompt || '', refs.length)
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
    const seedream = isSeedreamImageModel(model)
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

    if (seedream) {
      body.watermark = false
      if (record.negativePrompt) {
        body.negative_prompt = record.negativePrompt
      }
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
