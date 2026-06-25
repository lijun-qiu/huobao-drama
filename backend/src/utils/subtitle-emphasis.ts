/** 旁白字幕强调：分镜 dialogue 中用 **词** 标记，合成时黄色并加大字号 */

export const NARRATION_SUBTITLE_FONT_SIZE = 20
export const NARRATION_EMPHASIS_FONT_DELTA = 6
export const NARRATION_EMPHASIS_FONT_SIZE = NARRATION_SUBTITLE_FONT_SIZE + NARRATION_EMPHASIS_FONT_DELTA

const SUBTITLE_PUNCT_RE = /[，。！？；：、,.!?;:'"''""（）()\[\]《》【】「」『』…—·\-~～]/g
const EMPHASIS_MARKER_RE = /\*\*(.+?)\*\*/g

export function stripEmphasisMarkers(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1')
}

export function hasEmphasisMarkers(text: string): boolean {
  return /\*\*.+?\*\*/.test(text)
}

type EmphasisRange = { start: number; end: number; priority: number }

const EMPHASIS_HINT_WORD_RE = /终于|竟然|居然|原来|其实|从此|一辈子|一生|命运|人生|幸福|真相|秘密|关键|改变|觉醒|崩溃|爆发|第一次|最后一次/g
const EMPHASIS_NUMBER_RE = /\d+(?:\.\d+)?%?|[零一二三四五六七八九十百千万亿两]+(?:[零一二三四五六七八九十百千万亿点分之]|%)?/g

function pickEmphasisRanges(sentence: string, maxMarks = 1): Array<{ start: number; end: number }> {
  const cands: EmphasisRange[] = []

  for (const m of sentence.matchAll(EMPHASIS_NUMBER_RE)) {
    if (m.index != null && m[0].length >= 1) {
      cands.push({ start: m.index, end: m.index + m[0].length, priority: 0 })
    }
  }
  for (const m of sentence.matchAll(EMPHASIS_HINT_WORD_RE)) {
    cands.push({ start: m.index!, end: m.index! + m[0].length, priority: 1 })
  }
  for (const m of sentence.matchAll(/「([^」]{1,10})」/g)) {
    if (m.index != null) {
      cands.push({ start: m.index, end: m.index + m[0].length, priority: 2 })
    }
  }

  cands.sort((a, b) => a.priority - b.priority || a.start - b.start)
  const picked: Array<{ start: number; end: number }> = []
  for (const c of cands) {
    if (picked.length >= maxMarks) break
    if (picked.some(p => c.start < p.end && c.end > p.start)) continue
    picked.push({ start: c.start, end: c.end })
  }
  return picked
}

/** 本地规则自动加 **强调**（数字、转折词、书名号等），无需 LLM；每句最多 1 处，也可不标 */
export function markEmphasisHeuristic(sentence: string, maxMarks = 1): string {
  if (!sentence.trim() || hasEmphasisMarkers(sentence)) return sentence
  const ranges = pickEmphasisRanges(sentence, maxMarks)
  if (!ranges.length) return sentence
  let out = sentence
  for (const { start, end } of [...ranges].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, start)}**${out.slice(start, end)}**${out.slice(end)}`
  }
  return out
}

export function markSentencesEmphasisHeuristic(sentences: string[]): string[] {
  return sentences.map(s => markEmphasisHeuristic(s))
}

/** 每镜最多保留 maxMarks 处 **强调**，其余去掉标记保留原文 */
export function limitEmphasisMarkers(text: string, maxMarks = 1): string {
  if (maxMarks <= 0) return stripEmphasisMarkers(text)
  let count = 0
  return text.replace(/\*\*(.+?)\*\*/g, (full, inner: string) => {
    count += 1
    return count <= maxMarks ? full : inner
  })
}

/** LLM 返回句须与原文一致（仅允许加 **），否则丢弃标记 */
export function validateEmphasisMarkedSentence(original: string, marked: string): string {
  const clean = String(marked ?? '').trim()
  if (!clean) return original
  if (stripEmphasisMarkers(clean).replace(/\s/g, '') !== original.replace(/\s/g, '')) {
    return original
  }
  return limitEmphasisMarkers(clean, 1)
}

function stripPunctSegment(text: string): string {
  return text.replace(SUBTITLE_PUNCT_RE, '').replace(/\s+/g, ' ')
}

/** 去标点但保留 **强调** 标记位置 */
export function stripSubtitlePunctuationPreservingEmphasis(text: string): string {
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(EMPHASIS_MARKER_RE.source, 'g')
  while ((match = re.exec(text))) {
    parts.push(stripPunctSegment(text.slice(lastIndex, match.index)))
    const inner = stripPunctSegment(match[1]).trim()
    if (inner) parts.push(`**${inner}**`)
    lastIndex = match.index + match[0].length
  }
  parts.push(stripPunctSegment(text.slice(lastIndex)))
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function formatAssTimestamp(seconds: number) {
  const totalCs = Math.max(0, Math.round(seconds * 100))
  const h = Math.floor(totalCs / 360000)
  const m = Math.floor((totalCs % 360000) / 6000)
  const s = Math.floor((totalCs % 6000) / 100)
  const cs = totalCs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function escapeAssChar(ch: string) {
  if (ch === '\n') return '\\N'
  if (ch === '{') return '('
  if (ch === '}') return ')'
  return ch
}

function escapeAssText(text: string) {
  return [...text.replace(/\r/g, '')].map(escapeAssChar).join('')
}

function convertEmphasisToAssInline(text: string) {
  const baseFs = NARRATION_SUBTITLE_FONT_SIZE
  const emphasisFs = NARRATION_EMPHASIS_FONT_SIZE
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(EMPHASIS_MARKER_RE.source, 'g')
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(escapeAssText(text.slice(lastIndex, match.index)))
    }
    parts.push(
      `{\\fs${emphasisFs}\\c&H0000FFFF&}${escapeAssText(match[1])}{\\fs${baseFs}\\c&HFFFFFF&}`,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(escapeAssText(text.slice(lastIndex)))
  }
  return parts.join('')
}

export function buildNarrationEmphasisAssHeader(fontName = 'Arial') {
  const fs = NARRATION_SUBTITLE_FONT_SIZE
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, ${fontName}, ${fs}, &HFFFFFF&, &H00000000&, &H00000000&, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 0, 2, 10, 10, 24, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}

export function buildNarrationPlainAssDialogueLine(text: string, startSec: number, endSec: number) {
  const line = escapeAssText(text.replace(/\r/g, '').replace(/\n/g, ' ').trim())
  const start = formatAssTimestamp(startSec)
  const end = formatAssTimestamp(endSec)
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,${line}`
}

export function buildNarrationEmphasisAssDialogueLine(text: string, startSec: number, endSec: number) {
  const line = convertEmphasisToAssInline(text.replace(/\r/g, '').replace(/\n/g, ' ').trim())
  const start = formatAssTimestamp(startSec)
  const end = formatAssTimestamp(endSec)
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,${line}`
}

export function buildNarrationEmphasisAssContent(text: string, durationSec: number) {
  const endAt = Math.max(durationSec, 0.05)
  return `${buildNarrationEmphasisAssHeader()}${buildNarrationEmphasisAssDialogueLine(text, 0, endAt)}\n`
}

/** 合并片头 Title 样式与旁白 Default 样式（同配图多句混排） */
export function buildCombinedAssHeader(options: {
  includeTitleStyles?: boolean
  includeNarrationStyles?: boolean
  titleFontName?: string
  narrationFontName?: string
}) {
  const {
    includeTitleStyles = false,
    includeNarrationStyles = true,
    titleFontName = '华文行楷',
    narrationFontName = 'Arial',
  } = options
  const styleLines: string[] = []
  if (includeTitleStyles) {
    const titleWhiteFs = 84
    const titleFs = 74
    styleLines.push(
      `Style: TitleWhite, ${titleFontName}, ${titleWhiteFs}, &HFFFFFF&, &HFF000000&, &H00000000&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1`,
      `Style: Title, ${titleFontName}, ${titleFs}, &H0014F0&, &HFF000000&, &H00FFFFFF&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1`,
    )
  }
  if (includeNarrationStyles) {
    const fs = NARRATION_SUBTITLE_FONT_SIZE
    styleLines.push(
      `Style: Default, ${narrationFontName}, ${fs}, &HFFFFFF&, &H00000000&, &H00000000&, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 0, 2, 10, 10, 24, 1`,
    )
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLines.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}
