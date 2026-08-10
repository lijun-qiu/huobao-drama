import type {
  ImageDetectSource,
  NarrationSentenceItem,
  ImageDetectMode,
  DetectImageNeedsOptions,
} from './narration-scene-detect.js'
import {
  buildSceneSegments,
  detectImageNeedsBalanced,
  detectImageNeedsConservative,
  resolveImageNeeds,
} from './narration-scene-detect.js'
import { isNovelComicSketchStyle } from '../constants/novel-comic.js'

export type ParagraphLayout = 'single' | 'diptych' | 'quad'

export type NarrationParagraph = {
  index: number
  startIndex: number
  endIndex: number
  sentences: string[]
  layout: ParagraphLayout
  /** 第一步 LLM 检测输出的综合画面描述 */
  sceneDescription?: string
}

export type BuildNarrationParagraphsOptions = {
  imageDetectMode?: ImageDetectMode
  textModel?: string | null
  textThinking?: boolean
  style?: string
  fullNarrationLines?: string[]
  previousEpisodeNarration?: string[]
  panelBeats?: string[]
  detectBatchThreshold?: number
  detectBatchSize?: number
  onDetectProgress?: DetectImageNeedsOptions['onProgress']
}

function mapSegmentsToParagraphs(
  items: NarrationSentenceItem[],
  needs: boolean[],
  segmentDescriptions?: Map<number, string>,
  style?: string | null,
): NarrationParagraph[] {
  const segments = buildSceneSegments(items, needs)
  return segments.map((seg, index) => ({
    index,
    startIndex: seg.anchorIndex,
    endIndex: seg.endIndex,
    sentences: seg.sentences,
    layout: decideParagraphLayout(seg.sentences, style),
    sceneDescription: segmentDescriptions?.get(seg.anchorIndex),
  }))
}

/** 规则兜底：按场景切换切分配图段 */
export function buildNarrationParagraphs(
  items: NarrationSentenceItem[],
  imageDetectMode: ImageDetectMode = 'paragraph',
  style?: string | null,
): NarrationParagraph[] {
  if (!items.length) return []

  const needs = imageDetectMode === 'conservative'
    ? detectImageNeedsConservative(items)
    : detectImageNeedsBalanced(items)
  return mapSegmentsToParagraphs(items, needs, undefined, style)
}

/** LLM 直接判定 needs_image，失败则抛错 */
export async function buildNarrationParagraphsAsync(
  items: NarrationSentenceItem[],
  options?: BuildNarrationParagraphsOptions,
): Promise<{ paragraphs: NarrationParagraph[]; detectSource: ImageDetectSource }> {
  if (!items.length) return { paragraphs: [], detectSource: 'llm' }

  const mode = options?.imageDetectMode || 'paragraph'
  const resolved = await resolveImageNeeds(items, {
    mode,
    textModel: options?.textModel,
    textThinking: options?.textThinking,
    style: options?.style,
    fullNarrationLines: options?.fullNarrationLines ?? items.map(item => item.sentence),
    previousEpisodeNarration: options?.previousEpisodeNarration,
    panelBeats: options?.panelBeats,
    batchThreshold: options?.detectBatchThreshold,
    batchSize: options?.detectBatchSize,
    onProgress: options?.onDetectProgress,
  })

  return {
    paragraphs: mapSegmentsToParagraphs(
      items,
      resolved.needs,
      resolved.segmentDescriptions,
      options?.style,
    ),
    detectSource: resolved.source,
  }
}

/** 默认完整单图；小说漫画默认四格页；两宫格由用户在配图页手动开启 */
export function decideParagraphLayout(_sentences: string[], style?: string | null): ParagraphLayout {
  if (isNovelComicSketchStyle(style)) return 'quad'
  return 'single'
}
