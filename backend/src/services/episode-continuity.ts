import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveStoryboardNarrationText } from '../constants/motion-comic.js'
import { parseNarrationImageMeta } from './narration-image.js'

export type EpisodeContinuityContext = {
  enabled: boolean
  previousEpisodeNumber: number | null
  previousEpisodeNarration: string[]
}

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  return resolveStoryboardNarrationText(sb)
}

/** 读取上集正文旁白句（不含片头标题镜），供本集 LLM 连贯上下文 */
export function loadPreviousEpisodeBodySentences(episodeId: number): string[] {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep?.referPreviousEpisode || ep.episodeNumber <= 1) return []

  const [prevEp] = db.select().from(schema.episodes)
    .where(and(
      eq(schema.episodes.dramaId, ep.dramaId),
      eq(schema.episodes.episodeNumber, ep.episodeNumber - 1),
    ))
    .all()
  if (!prevEp) return []

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, prevEp.id))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
    .filter(row => !row.deletedAt)

  return storyboards
    .filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_shot_type !== 'title')
    .map(storyboardNarrationSentence)
    .filter(Boolean)
}

/** 本集是否开启「参照上集」及上集旁白 */
export function loadEpisodeContinuityContext(episodeId: number): EpisodeContinuityContext {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep?.referPreviousEpisode || ep.episodeNumber <= 1) {
    return { enabled: false, previousEpisodeNumber: null, previousEpisodeNarration: [] }
  }

  const previousEpisodeNarration = loadPreviousEpisodeBodySentences(episodeId)
  return {
    enabled: previousEpisodeNarration.length > 0,
    previousEpisodeNumber: ep.episodeNumber - 1,
    previousEpisodeNarration,
  }
}

/** 拼接 prior_narration：上集全文 + 本集锚点之前 */
export function buildPriorNarrationLines(
  previousEpisodeNarration: string[],
  currentBodyLines: string[],
  startIndex: number,
): string[] {
  const priorInEpisode = currentBodyLines.slice(0, Math.max(0, startIndex))
  if (!previousEpisodeNarration.length) return priorInEpisode
  return [...previousEpisodeNarration, ...priorInEpisode]
}
