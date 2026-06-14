import type { NarrationSentenceItem } from './narration-scene-detect.js'

const STRONG_SCENE_SHIFT_RE = /来到|走(进|向|出|到)|跑进|冲进|踏入|进入|离开|走出|返回|回到|抵达|赶到|第二天|翌日|次日|多年后|数年后|几年后|几小时后|清晨|黎明|黄昏|傍晚|夜里|深夜|天亮|小时候|闪回|回忆|镜头一转|画面一转|另一边|另一处|转场|切换|与此同时/
const SCENE_SHIFT_RE = /路过|推开|打开|转入|不久后|片刻后|随即|来到|走(进|向|出|到)|进入|离开|返回|回到|抵达|第二天|翌日|清晨|黄昏|夜里|闪回|转场|切换/
const PARAGRAPH_CONTRAST_RE = /然而|但是|可是|与此同时|另一边|同时|接着|随后|就在这时|不料|突然|转眼/

export type ParagraphLayout = 'single' | 'diptych'

export type NarrationParagraph = {
  index: number
  startIndex: number
  endIndex: number
  sentences: string[]
  layout: ParagraphLayout
}

const MAX_SENTENCES_PER_PARAGRAPH = 8

function shouldBreakParagraph(items: NarrationSentenceItem[], start: number, nextIndex: number): boolean {
  if (nextIndex >= items.length) return true
  if (nextIndex - start >= MAX_SENTENCES_PER_PARAGRAPH) return true

  const curr = items[nextIndex]
  const prev = items[nextIndex - 1]
  if (curr.paragraphIndex !== prev.paragraphIndex) return true
  if (STRONG_SCENE_SHIFT_RE.test(curr.sentence)) return true
  if (SCENE_SHIFT_RE.test(curr.sentence)) return true
  return false
}

/** 内容段落：空行分段、场景切换、超长句群切分；每段对应一张配图 */
export function buildNarrationParagraphs(items: NarrationSentenceItem[]): NarrationParagraph[] {
  if (!items.length) return []

  const paragraphs: NarrationParagraph[] = []
  let start = 0

  for (let i = 1; i <= items.length; i++) {
    if (!shouldBreakParagraph(items, start, i)) continue
    const slice = items.slice(start, i)
    const sentences = slice.map(item => item.sentence)
    paragraphs.push({
      index: paragraphs.length,
      startIndex: start,
      endIndex: i - 1,
      sentences,
      layout: decideParagraphLayout(sentences),
    })
    start = i
  }

  return paragraphs
}

/** 单图能概括则单图；内容多或双节拍则用横向两宫格 */
export function decideParagraphLayout(sentences: string[]): ParagraphLayout {
  const text = sentences.join('')
  const chars = text.replace(/\s/g, '').length
  if (sentences.length >= 6) return 'diptych'
  if (chars >= 96) return 'diptych'
  if (sentences.length >= 4 && PARAGRAPH_CONTRAST_RE.test(text)) return 'diptych'
  if (sentences.length >= 5 && chars >= 72) return 'diptych'
  return 'single'
}
