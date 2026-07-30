import { getKlingModelMeta } from './kling-image-models.js'
import { usesLocalModelPipeline } from './production-mode.js'

export const GPT_IMAGE_DEFAULT_MODEL = 'gpt-image-2'
export const DEFAULT_IMAGE_MODEL = GPT_IMAGE_DEFAULT_MODEL
/** 管线默认：Agnes Image（定妆参考图 / 图生图） */
export const DEFAULT_LOCAL_IMAGE_MODEL = 'agnes-image-2.0-flash'
export const LOCAL_IMAGE_MODEL_OPTIONS = [
  'agnes-image-2.0-flash',
  'agnes-image-2.0',
  'cogview-3-flash',
  'qwen_image_edit_q3',
  'qwen_image_edit_q4',
  /** @deprecated 等同 qwen_image_edit_q3，兼容旧分集配置 */
  'qwen_image_edit',
  'kolors',
] as const

export const QWEN_EDIT_UNET_Q3 = 'qwen-image-edit-2511-Q3_K_M.gguf'
export const QWEN_EDIT_UNET_Q4 = 'qwen-image-edit-2511-Q4_K_M.gguf'

/** 按生图模型 id 选择 Qwen Edit GGUF 文件名 */
export function qwenEditUnetForModel(model?: string | null): string {
  const m = String(model || '').trim().toLowerCase()
  if (m === 'qwen_image_edit_q4' || m.endsWith('_q4')) return QWEN_EDIT_UNET_Q4
  if (m === 'qwen_image_edit_q3' || m.endsWith('_q3') || m === 'qwen_image_edit' || m === 'qwen-image-edit') {
    return QWEN_EDIT_UNET_Q3
  }
  return QWEN_EDIT_UNET_Q3
}

/** 历史默认模型，启动时迁移到 DEFAULT_IMAGE_MODEL */
export const LEGACY_DEFAULT_IMAGE_MODELS = [
  'doubao-seedream-3-0-t2i-250415',
  'doubao-seedream-4-0-250828',
  'doubao-seedream-5-0-260128',
  'doubao-seedream-4-5-251128',
  'doubao-seedream-5-0-lite',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'qwen-image-edit-2509',
  'qwen-image-2.0-2026-03-03',
  'qwen-image-max',
  'kling-v1',
  'kling-v1-5',
  'kling-v2',
  'kling-v2-1',
  'kling-v2-new',
  'kling-v3',
] as const

export function isGptImageModel(model?: string | null): boolean {
  return String(model || '').toLowerCase().startsWith('gpt-image')
}

function isCloudImageModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return false
  if (m.startsWith('cogview') || m.startsWith('agnes-image')) return true
  if (
    m.startsWith('sdxl_')
    || m.startsWith('wan_')
    || m.startsWith('flux')
    || m === 'kolors'
    || m === 'qwen_image_edit'
    || m.startsWith('qwen_image_edit')
    || m.startsWith('qwen_image')
  ) return false
  return true
}

export function resolveLocalEpisodeImageModel(
  episode?: { imageModel?: string | null } | null,
  bodyModel?: string | null,
) {
  let picked = String(bodyModel || episode?.imageModel || '').trim()
  if (picked === 'qwen_image_edit') picked = 'qwen_image_edit_q3'
  // 已卸载 Flux/SDXL/InstantID 权重：旧分集配置回落到 Agnes 定妆生图
  if (
    picked === 'flux_dev_fp8'
    || picked.startsWith('flux')
    || picked.startsWith('sdxl_')
  ) {
    picked = DEFAULT_LOCAL_IMAGE_MODEL
  }
  if (picked && LOCAL_IMAGE_MODEL_OPTIONS.includes(picked as typeof LOCAL_IMAGE_MODEL_OPTIONS[number])) return picked
  if (picked && picked.startsWith('cogview')) return picked
  if (picked && picked.startsWith('agnes-image')) return picked === 'agnes-image-2.0' ? 'agnes-image-2.0-flash' : picked
  if (picked && !isCloudImageModel(picked)) return picked
  return DEFAULT_LOCAL_IMAGE_MODEL
}

export function resolveEpisodeImageModel(
  episode?: { imageModel?: string | null } | null,
  bodyModel?: string | null,
  productionMode?: string | null,
) {
  if (usesLocalModelPipeline(productionMode)) {
    return resolveLocalEpisodeImageModel(episode, bodyModel)
  }
  const picked = String(bodyModel || episode?.imageModel || '').trim()
  return picked || DEFAULT_IMAGE_MODEL
}

/** 分镜配图：保留 InstantID/Flux/Kolors；定妆三视图模型不可用于分镜 */
export function resolveStoryboardImageModel(
  episode?: { imageModel?: string | null } | null,
  bodyModel?: string | null,
  productionMode?: string | null,
) {
  const picked = resolveEpisodeImageModel(episode, bodyModel, productionMode)
  if (usesLocalModelPipeline(productionMode) && picked === 'sdxl_portrait') return DEFAULT_LOCAL_IMAGE_MODEL
  return picked
}

/** 场景背景：必须文生图；Qwen-Edit / InstantID 会锁脸或改图出人物，统一降级智谱/Kolors */
export function resolveSceneImageModel(
  episode?: { imageModel?: string | null } | null,
  bodyModel?: string | null,
  productionMode?: string | null,
) {
  const picked = resolveEpisodeImageModel(episode, bodyModel, productionMode)
  if (!usesLocalModelPipeline(productionMode)) return picked
  const m = String(picked || '').trim().toLowerCase()
  if (m.startsWith('cogview')) return picked
  if (
    m === 'sdxl_portrait'
    || m === 'sdxl_instantid'
    || m === 'sdxl_anime'
    || m === 'qwen_image_edit'
    || m.startsWith('qwen_image_edit')
    || m.startsWith('qwen_image')
  ) {
    return DEFAULT_LOCAL_IMAGE_MODEL
  }
  return picked
}

export function imageModelSupportsReferenceImages(model?: string | null): boolean {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
  if (m === 'flux_dev_fp8' || (m.startsWith('flux') && !m.includes('redux'))) return true
  if (m === 'sdxl_instantid') return true
  if (m === 'qwen_image_edit' || m.startsWith('qwen_image')) return true
  if (m.startsWith('agnes-image')) return true
  if (isGptImageModel(m)) return true
  if (m.startsWith('kling-')) {
    const meta = getKlingModelMeta(m)
    return meta ? (meta.supportsI2i || meta.supportsMulti) : true
  }
  if (m.startsWith('qwen-image')) return true
  if (m.includes('gemini') && m.includes('image')) return true
  return false
}

export function imageModelMaxReferenceImages(model?: string | null): number {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
  if (m === 'flux_dev_fp8' || (m.startsWith('flux') && !m.includes('redux'))) return 1
  if (m === 'sdxl_instantid') return 1
  if (m === 'qwen_image_edit' || m.startsWith('qwen_image')) return 3
  if (m.startsWith('agnes-image')) return 4
  if (isGptImageModel(m)) return 4
  if (m.startsWith('kling-')) return 1
  if (m.startsWith('qwen-image')) return 3
  return 4
}
