import type { ImageDetectSource, NarrationSentenceItem, ImageDetectMode } from './narration-scene-detect.js'
import {
  buildSceneSegments,
  detectImageNeedsBalanced,
  detectImageNeedsConservative,
  resolveImageNeeds,
} from './narration-scene-detect.js'

export type ParagraphLayout = 'single' | 'diptych'

export type NarrationParagraph = {
  index: number
  startIndex: number
  endIndex: number
  sentences: string[]
  layout: ParagraphLayout
}

export type BuildNarrationParagraphsOptions = {
  imageDetectMode?: ImageDetectMode
  textModel?: string | null
  textThinking?: boolean
  style?: string
  fullNarrationLines?: string[]
}

function mapSegmentsToParagraphs(
  items: NarrationSentenceItem[],
  needs: boolean[],
): NarrationParagraph[] {
  const segments = buildSceneSegments(items, needs)
  return segments.map((seg, index) => ({
    index,
    startIndex: seg.anchorIndex,
    endIndex: seg.endIndex,
    sentences: seg.sentences,
    layout: decideParagraphLayout(seg.sentences),
  }))
}

/** 规则兜底：按场景切换切分配图段 */
export function buildNarrationParagraphs(
  items: NarrationSentenceItem[],
  imageDetectMode: ImageDetectMode = 'paragraph',
): NarrationParagraph[] {
  if (!items.length) return []

  const needs = imageDetectMode === 'conservative'
    ? detectImageNeedsConservative(items)
    : detectImageNeedsBalanced(items)
  return mapSegmentsToParagraphs(items, needs)
}

/** 优先 LLM 判定换镜点（万能模板语境），失败则回退规则 */
export async function buildNarrationParagraphsAsync(
  items: NarrationSentenceItem[],
  options?: BuildNarrationParagraphsOptions,
): Promise<{ paragraphs: NarrationParagraph[]; detectSource: ImageDetectSource }> {
  if (!items.length) return { paragraphs: [], detectSource: 'balanced' }

  const mode = options?.imageDetectMode || 'paragraph'
  const resolved = await resolveImageNeeds(items, {
    mode,
    textModel: options?.textModel,
    textThinking: options?.textThinking,
    style: options?.style,
    fullNarrationLines: options?.fullNarrationLines ?? items.map(item => item.sentence),
  })

  return {
    paragraphs: mapSegmentsToParagraphs(items, resolved.needs),
    detectSource: resolved.source,
  }
}

/** 默认完整单图；两宫格由用户在配图页手动开启 */
export function decideParagraphLayout(_sentences: string[]): ParagraphLayout {
  return 'single'
}
