import type { NarrationSentenceItem } from './narration-scene-detect.js'
import {
  buildSceneSegments,
  detectImageNeedsHeuristic,
  ensureMaxNarrationGap,
} from './narration-scene-detect.js'

export type ParagraphLayout = 'single' | 'diptych'

export type NarrationParagraph = {
  index: number
  startIndex: number
  endIndex: number
  sentences: string[]
  layout: ParagraphLayout
}

/** 同图最多连续沿用 1 句，第 2 句无场景切换也强制换新配图 */
const MAX_INHERIT_GAP = 2

/** 按场景切换 + 最长沿用链切分；每段首镜配图，减少长段共用一张 */
export function buildNarrationParagraphs(items: NarrationSentenceItem[]): NarrationParagraph[] {
  if (!items.length) return []

  const needs = ensureMaxNarrationGap(items, detectImageNeedsHeuristic(items), MAX_INHERIT_GAP)
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
