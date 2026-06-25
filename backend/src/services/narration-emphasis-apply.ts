import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { limitEmphasisMarkers, validateEmphasisMarkedSentence } from '../utils/subtitle-emphasis.js'
import { patchNarrationImageMeta } from './narration-image.js'
import type { NarrationParagraph } from './narration-paragraph.js'

export function normalizeParagraphSubtitleLines(
  lines: unknown,
  ttsSentences: string[],
): string[] | undefined {
  if (!Array.isArray(lines) || lines.length !== ttsSentences.length) return undefined
  return lines.map((line, i) => {
    const original = ttsSentences[i] || ''
    const marked = limitEmphasisMarkers(
      validateEmphasisMarkedSentence(original, String(line ?? '').trim() || original),
      1,
    )
    return marked
  })
}

/** 将配图分镜 LLM 返回的 subtitle_lines 写入各镜 meta.subtitle_narration */
export function applySubtitleLinesToStoryboards(
  orderedStoryboards: Array<{ id: number; referenceImages?: string | null }>,
  paragraphs: NarrationParagraph[],
  subtitleLinesByStartIndex: Map<number, string[]>,
) {
  if (!subtitleLinesByStartIndex.size) return

  const ts = now()
  for (const [startIndex, lines] of subtitleLinesByStartIndex) {
    const para = paragraphs.find(p => p.startIndex === startIndex)
    if (!para || !lines.length) continue

    for (let offset = 0; offset <= para.endIndex - para.startIndex; offset++) {
      const sb = orderedStoryboards[para.startIndex + offset]
      if (!sb) continue
      const subtitleNarration = lines[offset]
      if (!subtitleNarration) continue

      db.update(schema.storyboards)
        .set({
          referenceImages: patchNarrationImageMeta(sb.referenceImages, {
            subtitle_narration: subtitleNarration,
          }),
          updatedAt: ts,
        })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
    }
  }
}
