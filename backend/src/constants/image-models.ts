import { getKlingModelMeta } from './kling-image-models.js'

export const GPT_IMAGE_DEFAULT_MODEL = 'gpt-image-2-all'
export const DEFAULT_IMAGE_MODEL = GPT_IMAGE_DEFAULT_MODEL

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

export function resolveEpisodeImageModel(
  episode?: { imageModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = String(bodyModel || episode?.imageModel || '').trim()
  return picked || DEFAULT_IMAGE_MODEL
}

export function imageModelSupportsReferenceImages(model?: string | null): boolean {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
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
  if (isGptImageModel(m)) return 4
  if (m.startsWith('kling-')) return 1
  if (m.startsWith('qwen-image')) return 3
  return 4
}
