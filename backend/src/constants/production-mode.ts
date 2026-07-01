/** 生产模式：解说 / 漫画解说 / 完整漫剧 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

export type ProductionMode = 'narration' | 'motion_comic' | 'drama'

export const PRODUCTION_MODE_MOTION_COMIC = 'motion_comic' as const

export function parseProductionMode(metadata?: string | Record<string, unknown> | null): ProductionMode {
  let meta = metadata
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) as Record<string, unknown> } catch { meta = null }
  }
  const mode = String((meta as Record<string, unknown> | null)?.production_mode || '').trim()
  if (mode === 'narration') return 'narration'
  if (mode === 'motion_comic') return 'motion_comic'
  return 'drama'
}

export function isNarrationLikeMode(mode?: ProductionMode | string | null): boolean {
  return mode === 'narration' || mode === 'motion_comic'
}

export function isMotionComicMode(mode?: ProductionMode | string | null): boolean {
  return mode === 'motion_comic'
}

export function productionModeLabel(mode?: ProductionMode | string | null): string {
  if (mode === 'narration') return '解说'
  if (mode === 'motion_comic') return '漫画解说'
  return ''
}

export function resolveEpisodeProductionMode(episodeId: number): ProductionMode {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return 'drama'
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return parseProductionMode(drama?.metadata)
}
