/** 漫画解说 / 小说漫画讲解 / 本地漫剧 / 对话立绘 — 前端生产模式辅助 */
export const MOTION_COMIC_PRODUCTION_MODE = 'motion_comic'
export const NOVEL_COMIC_PRODUCTION_MODE = 'novel_comic'
export const LOCAL_COMIC_PRODUCTION_MODE = 'local_comic'
export const DIALOGUE_PORTRAIT_PRODUCTION_MODE = 'dialogue_portrait'

export function buildDramaMetadata(productionMode: string) {
  if (productionMode === LOCAL_COMIC_PRODUCTION_MODE) {
    return JSON.stringify({
      production_mode: LOCAL_COMIC_PRODUCTION_MODE,
      local_comic: {
        model_stages: ['llm', 'image', 'video', 'audio'],
      },
    })
  }
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
  if (productionMode === NOVEL_COMIC_PRODUCTION_MODE) {
    return JSON.stringify({
      production_mode: NOVEL_COMIC_PRODUCTION_MODE,
      novel_comic: {
        source_novel: '',
        chapter_outline: [],
        outline_confirmed_at: null,
      },
      // 小说漫画：静图翻页，关闭运镜
      motion_comic: {
        motion_preset: 'static',
        camera: { zoom_step: 0, enable_pan: false, pan_alternate: false },
        motion_budget: { max_action_shots: 0 },
      },
    })
  }
  if (productionMode === DIALOGUE_PORTRAIT_PRODUCTION_MODE) {
    return JSON.stringify({
      production_mode: DIALOGUE_PORTRAIT_PRODUCTION_MODE,
      dialogue_portrait: {
        layout: 'auto',
        expressions: ['idle', 'talk', 'react'],
        camera: 'none',
      },
    })
  }
  return JSON.stringify({ production_mode: productionMode || 'drama' })
}

export function productionModeLabel(mode?: string | null) {
  if (mode === 'narration') return '解说'
  if (mode === MOTION_COMIC_PRODUCTION_MODE) return '漫画解说'
  if (mode === NOVEL_COMIC_PRODUCTION_MODE) return '小说漫画讲解'
  if (mode === LOCAL_COMIC_PRODUCTION_MODE) return '本地短剧'
  if (mode === DIALOGUE_PORTRAIT_PRODUCTION_MODE) return '对话立绘'
  return ''
}
