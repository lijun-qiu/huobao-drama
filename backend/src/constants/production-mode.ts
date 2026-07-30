/** 生产模式：解说 / 漫画解说 / 小说漫画讲解 / 本地漫画 / 对话立绘 / 完整漫剧 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { LOCAL_COMIC_PRODUCTION_MODE } from './local-comic.js'

export type ProductionMode =
  | 'narration'
  | 'motion_comic'
  | 'novel_comic'
  | 'local_comic'
  | 'dialogue_portrait'
  | 'drama'

export const PRODUCTION_MODE_MOTION_COMIC = 'motion_comic' as const
export const PRODUCTION_MODE_NOVEL_COMIC = 'novel_comic' as const
export const PRODUCTION_MODE_DIALOGUE_PORTRAIT = 'dialogue_portrait' as const

export function parseProductionMode(metadata?: string | Record<string, unknown> | null): ProductionMode {
  let meta = metadata
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) as Record<string, unknown> } catch { meta = null }
  }
  const mode = String((meta as Record<string, unknown> | null)?.production_mode || '').trim()
  if (mode === 'narration') return 'narration'
  if (mode === 'motion_comic') return 'motion_comic'
  if (mode === PRODUCTION_MODE_NOVEL_COMIC) return PRODUCTION_MODE_NOVEL_COMIC
  if (mode === LOCAL_COMIC_PRODUCTION_MODE) return LOCAL_COMIC_PRODUCTION_MODE
  if (mode === PRODUCTION_MODE_DIALOGUE_PORTRAIT) return PRODUCTION_MODE_DIALOGUE_PORTRAIT
  return 'drama'
}

export function isNarrationLikeMode(mode?: ProductionMode | string | null): boolean {
  return mode === 'narration'
    || mode === 'motion_comic'
    || mode === PRODUCTION_MODE_NOVEL_COMIC
    || mode === PRODUCTION_MODE_DIALOGUE_PORTRAIT
}

export function isDramaLikeMode(mode?: ProductionMode | string | null): boolean {
  return mode === 'drama' || mode === LOCAL_COMIC_PRODUCTION_MODE
}

export function isMotionComicMode(mode?: ProductionMode | string | null): boolean {
  return mode === 'motion_comic'
}

export function isNovelComicMode(mode?: ProductionMode | string | null): boolean {
  return mode === PRODUCTION_MODE_NOVEL_COMIC
}

export function isDialoguePortraitMode(mode?: ProductionMode | string | null): boolean {
  return mode === PRODUCTION_MODE_DIALOGUE_PORTRAIT
}

/** 分镜/旁白稿拆镜规则与漫画解说一致（不含小说漫画讲解：后者走解说句拆） */
export function usesMotionComicStoryboardRules(mode?: ProductionMode | string | null): boolean {
  return mode === 'motion_comic'
}

/** 配图检测/文案/运镜合成与漫画解说一致 */
export function usesMotionComicVisuals(mode?: ProductionMode | string | null): boolean {
  return mode === 'motion_comic' || mode === PRODUCTION_MODE_NOVEL_COMIC
}

export function isLocalComicMode(mode?: ProductionMode | string | null): boolean {
  return mode === LOCAL_COMIC_PRODUCTION_MODE
}

/** 解说 / 漫画解说 / 小说漫画讲解 / 本地短剧 / 对话立绘：管线模型（文本默认智谱免费 GLM） */
export function usesLocalModelPipeline(mode?: ProductionMode | string | null): boolean {
  return mode === 'narration'
    || mode === 'motion_comic'
    || mode === PRODUCTION_MODE_NOVEL_COMIC
    || mode === LOCAL_COMIC_PRODUCTION_MODE
    || mode === PRODUCTION_MODE_DIALOGUE_PORTRAIT
}

export function productionModeLabel(mode?: ProductionMode | string | null): string {
  if (mode === 'narration') return '解说'
  if (mode === 'motion_comic') return '漫画解说'
  if (mode === PRODUCTION_MODE_NOVEL_COMIC) return '小说漫画讲解'
  if (mode === LOCAL_COMIC_PRODUCTION_MODE) return '本地短剧'
  if (mode === PRODUCTION_MODE_DIALOGUE_PORTRAIT) return '对话立绘'
  return ''
}

export function resolveEpisodeProductionMode(episodeId: number): ProductionMode {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return 'drama'
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return parseProductionMode(drama?.metadata)
}
