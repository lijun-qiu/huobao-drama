/** 4022 网关默认视频模型（Seedance 未上架时用 Vidu） */
export const DEFAULT_VIDEO_MODEL = 'viduq3-turbo'
export const DEFAULT_VIDEO_PROVIDER = 'vidu'

/** 管线默认：智谱免费视频 */
export const DEFAULT_LOCAL_VIDEO_MODEL = 'cogvideox-flash'

export const LOCAL_VIDEO_MODEL_OPTIONS = [
  'cogvideox-flash',
  'wan_i2v_fusionx',
  'wan_i2v',
  'wan_flf2v',
  'glide',
  'kenburns',
] as const

export function isZhipuVideoModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('cogvideox') || m === 'cogvideox-flash'
}

export const LEGACY_DEFAULT_VIDEO_MODELS = [
  'doubao-seedance-1-5-pro-251215',
] as const
