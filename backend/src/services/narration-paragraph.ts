import type { NarrationSentenceItem, ImageDetectMode } from './narration-scene-detect.js'
import {
  buildSceneSegments,
  detectImageNeedsBalanced,
  detectImageNeedsConservative,
} from './narration-scene-detect.js'

export type ParagraphLayout = 'single' | 'diptych'

export type NarrationParagraph = {
  index: number
  startIndex: number
  endIndex: number
  sentences: string[]
  layout: ParagraphLayout
}

/** 按场景切换切分配图段；同场景根据内容适当沿用，约每 2–3 句一图 */
export function buildNarrationParagraphs(
  items: NarrationSentenceItem[],
  imageDetectMode: ImageDetectMode = 'paragraph',
): NarrationParagraph[] {
  if (!items.length) return []

  const needs = imageDetectMode === 'conservative'
    ? detectImageNeedsConservative(items)
    : detectImageNeedsBalanced(items)
  const segments = buildSceneSegments(items, needs)

  return segments.map((seg, index) => ({
    index,
    startIndex: seg.anchorIndex,
    endIndex: seg.endIndex,
    sentences: seg.sentences,
    layout: decideParagraphLayout(seg.sentences),
  }))
}

/** 默认完整单图；两宫格由用户在配图页手动开启 */
export function decideParagraphLayout(_sentences: string[]): ParagraphLayout {
  return 'single'
}
