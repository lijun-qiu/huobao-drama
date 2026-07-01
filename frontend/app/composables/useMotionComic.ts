/** 漫画解说 — 前端生产模式辅助（与 backend motion-comic.ts 对齐） */
export const MOTION_COMIC_PRODUCTION_MODE = 'motion_comic'

export function buildDramaMetadata(productionMode: string) {
  if (productionMode === MOTION_COMIC_PRODUCTION_MODE) {
    return JSON.stringify({
      production_mode: MOTION_COMIC_PRODUCTION_MODE,
      motion_comic: {
        motion_preset: 'standard',
        camera: { zoom_step: 0.035, enable_pan: true, pan_alternate: true },
        motion_budget: { max_action_shots: 8 },
      },
    })
  }
  return JSON.stringify({ production_mode: productionMode || 'drama' })
}

export function productionModeLabel(mode?: string | null) {
  if (mode === 'narration') return '解说'
  if (mode === MOTION_COMIC_PRODUCTION_MODE) return '漫画解说'
  return ''
}
