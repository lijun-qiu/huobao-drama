/**
 * ???? / ???? ? ?????????? + ????/?????
 */
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { usesMotionComicVisuals, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import { resolveStoryboardNarrationText } from '../constants/motion-comic.js'
import { parseNarrationImageMeta } from './narration-image.js'

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  return resolveStoryboardNarrationText(sb)
}

export type NarrationImageChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export function sanitizeImageChatTurns(messages: NarrationImageChatTurn[]): NarrationImageChatTurn[] {
  return (messages || [])
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m.content || '').trim(),
    }))
    .filter(m => m.content)
    .slice(-24)
}

export function loadNarrationImageChatStoryboards(episodeId: number) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('????')

  const orderedStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
  if (!orderedStoryboards.length) {
    const motionComic = usesMotionComicVisuals(resolveEpisodeProductionMode(episodeId))
    throw new Error(motionComic ? '????????' : '????????')
  }

  return { ep, orderedStoryboards }
}

export function buildDetectChatContextBlock(episodeId: number): string {
  const { ep, orderedStoryboards } = loadNarrationImageChatStoryboards(episodeId)
  const lines: string[] = [
    ep.title ? `???${ep.title}` : '',
    `? ${orderedStoryboards.length} ?`,
    '',
    '??????',
  ].filter(Boolean)

  orderedStoryboards.forEach((sb, index) => {
    const num = sb.storyboardNumber ?? index + 1
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const text = storyboardNarrationSentence(sb).slice(0, 120)
    const flags: string[] = []
    if (meta.narration_shot_type === 'title') flags.push('??')
    if (meta.narration_image_mode === 'new') {
      flags.push(`???#${meta.paragraph_index ?? '?'}`)
      if (meta.paragraph_layout === 'diptych') flags.push('???')
    } else if (meta.narration_image_mode === 'inherit') {
      flags.push('????')
    }
    const flagStr = flags.length ? ` [${flags.join(' � ')}]` : ''
    lines.push(`#${String(num).padStart(2, '0')} ${text}${flagStr}`)
  })

  const anchorCount = orderedStoryboards.filter(
    sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new',
  ).length
  lines.push('', `???????????? ${anchorCount} ?`)
  return lines.join('\n')
}

export function buildPromptChatContextBlock(episodeId: number): string {
  const { ep, orderedStoryboards } = loadNarrationImageChatStoryboards(episodeId)
  const anchors = orderedStoryboards
    .map((sb, index) => ({ sb, index, meta: parseNarrationImageMeta(sb.referenceImages) }))
    .filter(({ meta }) => meta.narration_image_mode === 'new')

  if (!anchors.length) {
    return [
      ep.title ? `???${ep.title}` : '',
      '??????????????????????',
    ].filter(Boolean).join('\n')
  }

  const lines: string[] = [
    ep.title ? `???${ep.title}` : '',
    `??? ${anchors.length} ?`,
    '',
    '?????????',
  ].filter(Boolean)

  anchors.forEach(({ sb, meta }) => {
    const num = sb.storyboardNumber ?? 0
    const scene = String(meta.scene_content || '').slice(0, 80)
    const prompt = String(sb.imagePrompt || meta.image_prompt_llm_raw || '').trim()
    const promptPreview = prompt ? prompt.slice(0, 160) + (prompt.length > 160 ? '?' : '') : '?????'
    lines.push(
      `#${String(num).padStart(2, '0')} ?${meta.paragraph_index ?? '?'}${meta.paragraph_layout === 'diptych' ? '�???' : ''}`,
      `  ???${scene || '?'}`,
      `  ???${promptPreview}`,
    )
  })

  const readyCount = anchors.filter(({ sb, meta }) =>
    String(sb.imagePrompt || meta.image_prompt_llm_raw || '').trim(),
  ).length
  lines.push('', `?????????? ${readyCount}/${anchors.length} ????`)
  return lines.join('\n')
}
