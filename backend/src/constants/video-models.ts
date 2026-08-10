/** 4022 网关默认视频模型（Seedance 未上架时用 Vidu） */
export const DEFAULT_VIDEO_MODEL = 'viduq3-turbo'
export const DEFAULT_VIDEO_PROVIDER = 'vidu'

/** 管线默认：智谱免费视频（漫剧等）；解说默认见 DEFAULT_NARRATION_HIGHLIGHT_VIDEO_MODEL */
export const DEFAULT_LOCAL_VIDEO_MODEL = 'cogvideox-flash'

/** 解说每镜图生视频默认：Agnes Video V2.0 */
export const DEFAULT_NARRATION_HIGHLIGHT_VIDEO_MODEL = 'agnes-video-v2.0'

export const LOCAL_VIDEO_MODEL_OPTIONS = [
  'agnes-video-v2.0',
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

export function isAgnesVideoModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('agnes-video')
}

export const LEGACY_DEFAULT_VIDEO_MODELS = [
  'doubao-seedance-1-5-pro-251215',
] as const
