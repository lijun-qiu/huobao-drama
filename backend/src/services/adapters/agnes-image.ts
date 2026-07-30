/**
 * Agnes Image Adapter（定妆 / 文生图 / 图生图）
 * @see https://wiki.agnes-ai.com/en/docs/agnes-image-20-flash
 * POST https://apihub.agnes-ai.com/v1/images/generations
 *
 * 图生图参考图放在 extra_body.image（URL 或 Data URI）；
 * response_format 必须放在 extra_body，不可顶层。
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
import { convertPortraitRefWhiteBgToAgnesDark } from '../../utils/portrait-ref-preprocess.js'

export { convertPortraitRefWhiteBgToAgnesDark }

export const AGNES_OPENAI_BASE_URL = 'https://apihub.agnes-ai.com/v1'
/** 用户口中的 agnes-image-2.0 → 官方 API 模型名 */
export const AGNES_DEFAULT_IMAGE_MODEL = 'agnes-image-2.0-flash'
export const AGNES_IMAGE_MODEL_ALIASES = ['agnes-image-2.0', 'agnes-image-2.0-flash'] as const

export function isAgnesImageModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('agnes-image')
}

export function resolveAgnesImageModel(model?: string | null): string {
  const m = String(model || '').trim().toLowerCase()
  if (!m || m === 'agnes-image-2.0' || m === 'agnes-image-2.0-flash') {
    return AGNES_DEFAULT_IMAGE_MODEL
  }
  if (m.startsWith('agnes-image')) return m
  return AGNES_DEFAULT_IMAGE_MODEL
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

function agnesBase(config: AIConfig): string {
  return (config.baseUrl || AGNES_OPENAI_BASE_URL).replace(/\/+$/, '')
}

/** Agnes 常用尺寸 */
export function normalizeAgnesImageSize(size?: string | null): string {
  const raw = String(size || '1024x1024').toLowerCase().replace('*', 'x')
  const [w, h] = raw.split(/[x×]/).map(Number)
  if (!w || !h) return '1024x1024'
  const aspect = w / h
  if (aspect > 1.2) return '1024x768'
  if (aspect < 0.85) return '768x1024'
  return '1024x1024'
}

/** Agnes 定妆生图英文锚点（深色身份锁脸，非白棚） */
export const AGNES_PORTRAIT_IDENTITY_PREFIX =
  'vertical chest-up character IDENTITY LOCK reference, single person, neutral face, deep navy dark background #0f172a, sharp anime cel shading, clear face and hair, NOT pure white background, NOT character sheet, NOT lineup'

/** 从中文分镜提示抽出短场景锚点，供 Agnes 多图合成英文前缀使用 */
function extractAgnesSceneAnchorCn(prompt: string): string {
  const s = String(prompt || '')
  const place = s.match(/(?:深夜|白天|清晨|黄昏)?[^，；]{0,8}(?:卤肉店|堂屋|走廊|玄关|巷口|街道|病房|客厅|厨房|天台|仓库)[^，；]{0,12}/)?.[0]
  if (place) return place.trim()
  const loc = s.match(/位于([^，；]{2,24})以/)?.[1]
  if (loc) return loc.trim()
  return 'cinematic drama scene with environment'
}

/**
 * Agnes 官方多图合成句式（Combine characters into ONE scene）。
 * 定妆白底参考图若只用「锁脸」中文，易塌成角色设定拼贴；须显式要求合成进有环境的单帧剧情。
 */
export function buildAgnesMultiRefCombinePrefix(options: {
  refCount: number
  portraitLabels?: string[]
  sceneAnchor?: string
}): string {
  const n = Math.max(1, options.refCount || 0)
  const labels = (options.portraitLabels || []).map(x => String(x || '').trim()).filter(Boolean)
  const mapping = Array.from({ length: n }, (_, i) => {
    const name = labels[i] || `character ${i + 1}`
    return `image ${i + 1} = face/hair identity of「${name}」only`
  }).join('; ')
  const scene = String(options.sceneAnchor || 'cinematic drama scene').trim()
  return [
    `Combine the ${n} reference character images into ONE single cinematic storyboard frame: ${scene}.`,
    `Identity map: ${mapping}. Keep each face distinct; do not clone faces.`,
    'Place all characters INTO the described environment with props and depth; FULL BODY or medium-wide with feet visible when standing.',
    'Characters look at each other or props, NOT at camera.',
    'NEVER output a white-background character sheet, portrait lineup, multi-head collage, or turnaround sheet.',
  ].join(' ')
}

export class AgnesImageAdapter implements ImageProviderAdapter {
  readonly provider = 'agnes'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = resolveAgnesImageModel(record.model || config.model)
    // 官方支持多图合成（Combine characters）；保留全部定妆参考（最多 4）
    const refs = parseReferenceImages(record.referenceImages).slice(0, 4)
    let prompt = String(record.prompt || '').trim()
      || AGNES_PORTRAIT_IDENTITY_PREFIX
    const orderMatch = prompt.match(/【定妆参考顺序：([^】]+)】/)
    const alignedLabels = orderMatch
      ? orderMatch[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean)
      : []
    const promptLabels = [...prompt.matchAll(/对照定妆「([^」]+)」/g)].map(m => m[1].trim()).filter(Boolean)
    // identity map 必须与实际传入的 refs 顺序对齐（优先【定妆参考顺序】）
    const labels = (alignedLabels.length ? alignedLabels : promptLabels).slice(0, refs.length)
    const portraitLabelCount = Math.max(alignedLabels.length, promptLabels.length, labels.length)
    const isStoryboardScene = /对照定妆「|16:9横屏短剧解说|单帧剧情场景|锋利细线稿硬边赛璐璐|【定妆参考顺序：/.test(prompt)
    const isPortraitGen = !isStoryboardScene && (
      /竖幅正面半身|身份锁脸|定妆|chest-up|IDENTITY LOCK|character reference portrait|半身身份锁脸/i.test(prompt)
      || String(record.frameType || '').includes('portrait')
    )

    const chunks: string[] = []
    if (isStoryboardScene && refs.length >= 2) {
      if (!/Combine the \d+ reference character images into ONE/i.test(prompt)) {
        chunks.push(buildAgnesMultiRefCombinePrefix({
          refCount: refs.length,
          portraitLabels: labels,
          sceneAnchor: extractAgnesSceneAnchorCn(prompt),
        }))
      }
    } else if (isStoryboardScene) {
      if (!/FULL BODY|head-to-toe|feet visible/i.test(prompt)) {
        chunks.push(
          '16:9 cinematic anime still of a real scene with environment; FULL BODY head-to-toe framing with feet/shoes visible; characters look at each other or props, NOT at camera; NOT waist-up bust crop; NOT white background; NOT character reference sheet.',
        )
      }
    } else if (isPortraitGen) {
      if (!/IDENTITY LOCK|deep navy|禁止纯白|#0f172a/i.test(prompt)) {
        chunks.push(AGNES_PORTRAIT_IDENTITY_PREFIX)
      }
      // 去掉易诱发白棚设定表的残留
      prompt = prompt
        .replace(/\bpure white background\b/gi, 'deep navy dark background')
        .replace(/\bwhite background\b/gi, 'deep navy dark background')
        .replace(/\bwhite studio\b/gi, 'deep navy dark studio')
        .replace(/narrow side margins/gi, 'tight framing')
        .replace(/纯白色?背景/g, '深藏青冷调背景')
        .replace(/白底均匀柔光/g, '冷蓝戏剧侧光')
        .replace(/左右只留窄白边|窄白边/g, '左右边距尽量窄')
    }

    const multiIdentity = refs.length >= 2 || portraitLabelCount >= 2
    if (multiIdentity) {
      const similarBlueJackets = /#(?:2563eb|1e40af|1d4ed8|3b82f6).{0,16}夹克/.test(prompt)
        && (prompt.match(/夹克/g) || []).length >= 2
      if (refs.length < 2 && !/Strict multi-character identity lock/i.test(prompt)) {
        chunks.push(
          `Strict multi-character identity lock: ${Math.max(portraitLabelCount, 2)} different people = different faces and hair; no cloned faces, no twin duplicates.`,
        )
      }
      if (similarBlueJackets && !/two male characters wear similar blue jackets/i.test(prompt)) {
        chunks.push(
          'CRITICAL: two male characters wear similar blue jackets — differentiate by face shape and hair ONLY; never copy the left male face onto the right male.',
        )
      }
    }
    if (chunks.length) prompt = `${chunks.join('\n')}\n${prompt}`

    const body: Record<string, unknown> = {
      model,
      prompt,
      size: normalizeAgnesImageSize(record.size),
      extra_body: {
        response_format: 'url',
      } as Record<string, unknown>,
    }

    if (refs.length) {
      ;(body.extra_body as Record<string, unknown>).image = refs
    }

    return {
      url: joinProviderUrl(agnesBase(config), '', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const url = result?.data?.[0]?.url
    if (url) return { isAsync: false, imageUrl: String(url) }
    const b64 = result?.data?.[0]?.b64_json
    if (b64) {
      // 同步 base64：由 extractImageBase64 处理
      return { isAsync: false }
    }
    const taskId = result?.id || result?.task_id
    if (taskId) return { isAsync: true, taskId: String(taskId) }
    throw new Error(`Unexpected Agnes image response: ${JSON.stringify(result).slice(0, 240)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(agnesBase(config), '', `/images/generations/${encodeURIComponent(taskId)}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    const url = result?.data?.[0]?.url
    if (url) return { status: 'completed', imageUrl: String(url) }
    const status = String(result?.status || result?.task_status || '').toLowerCase()
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: result?.error?.message || result?.message || 'Agnes image failed' }
    }
    if (status === 'processing' || status === 'pending' || status === 'running') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractImageUrl(result: any): string | null {
    return result?.data?.[0]?.url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result?.data?.[0]?.b64_json
    if (!b64) return null
    return { data: String(b64), mimeType: 'image/png' }
  }
}
