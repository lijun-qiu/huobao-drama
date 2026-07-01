export function resolveNarrationEmphasisMode(): 'off' | 'rules' | 'llm' | 'script' {
  const mode = String(process.env.NARRATION_EMPHASIS_MODE || 'llm').trim().toLowerCase()
  if (['off', '0', 'false', 'none'].includes(mode)) return 'off'
  if (['rules', 'rule'].includes(mode)) return 'rules'
  if (['llm'].includes(mode)) return 'llm'
  return 'script'
}

export function narrationEmphasisEnabled(): boolean {
  return resolveNarrationEmphasisMode() !== 'off'
}

export function narrationEmphasisUsesLlm(): boolean {
  return resolveNarrationEmphasisMode() === 'llm'
}

/** 强调词由解说稿/分镜 ** 提供，配图 LLM 不再标注 */
export function narrationEmphasisFromScript(): boolean {
  return resolveNarrationEmphasisMode() === 'script'
}

/** 从分镜句提取烧录字幕（含 ** 时写入 meta.subtitle_narration） */
export function ensureSentenceEmphasisMark(sentence: string): string {
  const text = String(sentence || '').trim()
  if (!text || !narrationEmphasisEnabled()) return text
  if (hasEmphasisMarkers(text)) {
    return limitEmphasisMarkers(stripBannedEmphasisMarkers(stripNumericEmphasisMarkers(text)), 1)
  }
  const mode = resolveNarrationEmphasisMode()
  if (mode === 'off' || mode === 'llm') return text
  return limitEmphasisMarkers(markEmphasisHeuristic(text, 1), 1)
}

/** 为解说稿正文逐句补 ** 强调（跳过片头 hook，由调用方只传 body） */
export function ensureScriptEmphasisInBody(body: string): string {
  if (!body.trim() || !narrationEmphasisEnabled()) return body
  const mode = resolveNarrationEmphasisMode()
  if (mode === 'off' || mode === 'llm') return body

  const paragraphs = body.replace(/\r\n/g, '\n').trim().split(/\n\s*\n+/)
  const sentenceRe = /[^。！？!?\n]+[。！？!?]?/g
  const originals: string[] = []

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue
    for (const segment of trimmed.matchAll(sentenceRe)) {
      const core = segment[0].trim()
      if (core.length >= 3) originals.push(core)
    }
  }

  if (!originals.length) return body

  const marked = normalizeEmphasisAcrossSentences(
    originals,
    originals.map(sentence => ensureSentenceEmphasisMark(sentence)),
  )

  let idx = 0
  return paragraphs.map((paragraph) => {
    const trimmed = paragraph.trim()
    if (!trimmed) return paragraph
    return trimmed.replace(sentenceRe, (segment) => {
      const core = segment.trim()
      if (!core || core.length < 3) return segment
      const next = marked[idx] ?? core
      idx += 1
      return segment.replace(core, next)
    })
  }).join('\n\n')
}

export function resolveSubtitleNarrationFromSentence(sentence: string): string | undefined {
  const marked = ensureSentenceEmphasisMark(sentence)
  if (!hasEmphasisMarkers(marked)) return undefined
  return marked
}

/** 旁白字幕强调：分镜 dialogue 中用 **词** 标记，合成时黄色并加大字号 */

export const NARRATION_SUBTITLE_FONT_SIZE = 50
export const NARRATION_EMPHASIS_FONT_DELTA = 5
export const NARRATION_EMPHASIS_FONT_SIZE = NARRATION_SUBTITLE_FONT_SIZE + NARRATION_EMPHASIS_FONT_DELTA
export const NARRATION_SUBTITLE_PLAY_RES_X = 1280
export const NARRATION_SUBTITLE_PLAY_RES_Y = 720
export const NARRATION_SUBTITLE_MARGIN_V = 24
export const NARRATION_SUBTITLE_MARGIN_LR = 10
export const NARRATION_SUBTITLE_POS_X = NARRATION_SUBTITLE_PLAY_RES_X / 2
export const NARRATION_SUBTITLE_POS_Y = NARRATION_SUBTITLE_PLAY_RES_Y - NARRATION_SUBTITLE_MARGIN_V

const NARRATION_EMPHASIS_FONT_SCALE = Math.round(
  (NARRATION_EMPHASIS_FONT_SIZE / NARRATION_SUBTITLE_FONT_SIZE) * 100,
)
/** 底栏居中固定锚点，避免混字号/滤镜差异导致上下漂移 */
const NARRATION_ASS_LAYOUT_TAG = `{\\an2\\pos(${NARRATION_SUBTITLE_POS_X},${NARRATION_SUBTITLE_POS_Y})}`
const NARRATION_ASS_WHITE_TAG = `{\\fs${NARRATION_SUBTITLE_FONT_SIZE}\\fscx100\\fscy100\\c&HFFFFFF&}`
/** 布局仍按正文字号，仅 fscx/fscy 放大黄字，避免 \\fs 更大撑高整行 */
const NARRATION_ASS_EMPHASIS_TAG = `{\\fs${NARRATION_SUBTITLE_FONT_SIZE}\\fscx${NARRATION_EMPHASIS_FONT_SCALE}\\fscy${NARRATION_EMPHASIS_FONT_SCALE}\\c&H0000FFFF&}`

const SUBTITLE_PUNCT_RE = /[，。！？；：、,.!?;:'"''""（）()\[\]《》【】「」『』…—·\-~～]/g
const EMPHASIS_MARKER_RE = /\*\*(.+?)\*\*/g

export function stripEmphasisMarkers(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1')
}

export function hasEmphasisMarkers(text: string): boolean {
  return /\*\*.+?\*\*/.test(text)
}

type EmphasisRange = { start: number; end: number; priority: number }

/** 规则兜底：关键情感（最高优先） */
const EMPHASIS_EMOTION_RE = /犹豫|后悔|心动|不安|迷茫|孤独|震惊|愣住|崩溃|觉醒|触动|失望|害怕|委屈|期待|死心|放手|心酸|无奈|绝望|兴奋|紧张|松了口气|一怔|发呆/g
/** 规则兜底：具象物件 */
const EMPHASIS_OBJECT_RE = /花衬衫|喇叭裤|煤油灯|独轮车|手推车|二八杠|摊位|账本|彩电|固定电话|门面|供销社|杂货铺|皮鞋|箱包|蒲扇|小凳|货架|柜台|自行车|板车|婚礼|牢房|公堂/g
/** 规则兜底：关键动作 / 动宾 */
const EMPHASIS_ACTION_RE = /辞职|摆摊|摆地摊|批发|开店|租了|整理货物|扇蒲扇|押解|候审|推车|挑选|喝茶|干活|逃跑|提亲|娶了|雇了|进货|卖光|串门|看电视|乘凉|议论/g
/** 规则兜底：命运转折词组 */
const EMPHASIS_TURNING_RE = /铁饭碗|万元户|离婚|下岗|破产|发财|亏本|风光|落魄|逆袭|终于|竟然|居然|原来|其实|从此|一辈子|一生|命运|人生|幸福|真相|秘密|关键|改变|爆发|第一次|最后一次/g
const EMPHASIS_NUMERIC_ONLY_RE = /^(?:\d+(?:\.\d+)?%?|[零一二三四五六七八九十百千万亿两]+(?:[零一二三四五六七八九十百千万亿点分之]|%)?)$/
/** 禁止作为字幕强调的空泛词 */
const EMPHASIS_BANNED_WORD_RE = /^(很好|非常|特别|其实|然后|就是|已经|真的|有点|有些|一些|这样|那样|什么|怎么|为什么|因为|所以|但是|不过|而且|还有|只是|当然|可能|应该|可以|不能|不会|没有|不是|这个|那个|他们|我们|你们|自己|大家|时候|东西|事情|问题|情况|地方|感觉|知道|觉得|认为|开始|结束|继续|一直|一下|一点|一种|一个|一位|一次)$/

export type EmphasisGlobalNormalizeOptions = {
  minRatio?: number
  maxRatio?: number
  maxWordRepeat?: number
  shortSentenceMaxChars?: number
  shortEmphasisMaxChars?: number
}

export function resolveEmphasisGlobalNormalizeOptions(): Required<EmphasisGlobalNormalizeOptions> {
  const ratio = (key: string, fallback: number) => {
    const v = Number(process.env[key])
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : fallback
  }
  const int = (key: string, fallback: number) => {
    const v = Number(process.env[key])
    return Number.isFinite(v) && v > 0 ? Math.round(v) : fallback
  }
  return {
    minRatio: ratio('NARRATION_EMPHASIS_MIN_RATIO', 0.33),
    maxRatio: ratio('NARRATION_EMPHASIS_MAX_RATIO', 0.5),
    maxWordRepeat: int('NARRATION_EMPHASIS_MAX_WORD_REPEAT', 3),
    shortSentenceMaxChars: int('NARRATION_EMPHASIS_SHORT_SENTENCE_CHARS', 14),
    shortEmphasisMaxChars: int('NARRATION_EMPHASIS_SHORT_EMPHASIS_CHARS', 4),
  }
}

export function extractEmphasisWord(sentence: string): string | null {
  const m = String(sentence || '').match(/\*\*(.+?)\*\*/)
  return m?.[1]?.trim() || null
}

function emphasisSentenceCharCount(text: string): number {
  return text.replace(/[\s，,、；;。！？!?]/g, '').length
}

function matchesEmphasisLexicon(word: string, re: RegExp): boolean {
  return new RegExp(re.source).test(word.trim())
}

function scoreEmphasisWord(word: string): number {
  const w = word.trim()
  if (!w || EMPHASIS_BANNED_WORD_RE.test(w.replace(/\s/g, ''))) return 0
  if (isNumericEmphasisContent(w)) return 0
  if (matchesEmphasisLexicon(w, EMPHASIS_EMOTION_RE)) return 10
  if (matchesEmphasisLexicon(w, EMPHASIS_ACTION_RE)) return 8
  if (matchesEmphasisLexicon(w, EMPHASIS_OBJECT_RE)) return 7
  if (matchesEmphasisLexicon(w, EMPHASIS_TURNING_RE)) return 6
  if (w.length >= 2 && w.length <= 6) return 4
  return 3
}

/** 去掉黑名单/空泛词的 ** 标记 */
export function stripBannedEmphasisMarkers(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, (full, inner: string) => {
    const core = inner.trim().replace(/\s/g, '')
    if (!core || EMPHASIS_BANNED_WORD_RE.test(core) || isNumericEmphasisContent(core)) return inner
    return full
  })
}

function sanitizeEmphasisSentence(
  original: string,
  marked: string,
  opts: Required<EmphasisGlobalNormalizeOptions>,
): string {
  let sentence = validateEmphasisMarkedSentence(original, marked)
  sentence = stripBannedEmphasisMarkers(sentence)
  if (!hasEmphasisMarkers(sentence)) return sentence

  const inner = extractEmphasisWord(sentence)
  if (!inner) return stripEmphasisMarkers(sentence)

  const innerLen = inner.replace(/\s/g, '').length
  if (
    emphasisSentenceCharCount(original) <= opts.shortSentenceMaxChars
    && innerLen > opts.shortEmphasisMaxChars
  ) {
    return stripEmphasisMarkers(sentence)
  }
  return sentence
}

function clearEmphasisAt(originals: string[], sentences: string[], index: number) {
  sentences[index] = originals[index] ?? stripEmphasisMarkers(sentences[index] ?? '')
}

/** P0 全局后处理：密度、间隔、去重、短句保护、黑名单 */
export function normalizeEmphasisAcrossSentences(
  originals: string[],
  marked: string[],
  options?: EmphasisGlobalNormalizeOptions,
): string[] {
  if (!originals.length) return []
  const opts = { ...resolveEmphasisGlobalNormalizeOptions(), ...options }
  const sentences = originals.map((original, i) =>
    sanitizeEmphasisSentence(original, marked[i] ?? original, opts),
  )

  const isMarked = (i: number) => hasEmphasisMarkers(sentences[i] ?? '')
  const scoreAt = (i: number) => scoreEmphasisWord(extractEmphasisWord(sentences[i] ?? '') ?? '')

  // 同一强调词全文最多 N 次（保留高分句）
  const wordIndices = new Map<string, number[]>()
  for (let i = 0; i < sentences.length; i++) {
    if (!isMarked(i)) continue
    const word = extractEmphasisWord(sentences[i] ?? '')
    if (!word) {
      clearEmphasisAt(originals, sentences, i)
      continue
    }
    const key = word.replace(/\s/g, '')
    const list = wordIndices.get(key) ?? []
    list.push(i)
    wordIndices.set(key, list)
  }
  for (const indices of wordIndices.values()) {
    if (indices.length <= opts.maxWordRepeat) continue
    const sorted = [...indices].sort((a, b) => scoreAt(a) - scoreAt(b))
    for (let k = 0; k < indices.length - opts.maxWordRepeat; k++) {
      clearEmphasisAt(originals, sentences, sorted[k]!)
    }
  }

  // 相邻双标：仅当两句得分都偏低时才去掉较弱的一句（高分情感/动作/物件可紧邻保留）
  for (let i = 0; i < sentences.length - 1; i++) {
    if (!isMarked(i) || !isMarked(i + 1)) continue
    const scoreA = scoreAt(i)
    const scoreB = scoreAt(i + 1)
    if (scoreA >= 7 || scoreB >= 7) continue
    if (scoreA >= scoreB) clearEmphasisAt(originals, sentences, i + 1)
    else clearEmphasisAt(originals, sentences, i)
  }

  // 超过密度上限时，从低分标记开始剔除
  const maxCount = Math.max(1, Math.ceil(sentences.length * opts.maxRatio))
  let markedIndices = sentences.map((_, i) => i).filter(i => isMarked(i))
  if (markedIndices.length > maxCount) {
    const sorted = [...markedIndices].sort((a, b) => scoreAt(a) - scoreAt(b))
    for (let k = 0; k < markedIndices.length - maxCount; k++) {
      clearEmphasisAt(originals, sentences, sorted[k]!)
    }
    markedIndices = sentences.map((_, i) => i).filter(i => isMarked(i))
  }

  // 低于 minRatio 时用规则兜底补标（约每 2～3 句 1 处）
  const minCount = Math.max(1, Math.ceil(sentences.length * opts.minRatio))
  if (markedIndices.length < minCount) {
    const candidates: Array<{ index: number; score: number; marked: string }> = []
    for (let i = 0; i < sentences.length; i++) {
      if (isMarked(i)) continue
      const heuristic = markEmphasisHeuristic(originals[i] ?? '', 1)
      if (!hasEmphasisMarkers(heuristic)) continue
      const word = extractEmphasisWord(heuristic)
      if (!word) continue
      candidates.push({ index: i, score: scoreEmphasisWord(word), marked: heuristic })
    }
    candidates.sort((a, b) => b.score - a.score || a.index - b.index)
    for (const candidate of candidates) {
      if (markedIndices.length >= minCount) break
      if (markedIndices.length >= maxCount) break
      sentences[candidate.index] = candidate.marked
      markedIndices.push(candidate.index)
    }
  }

  return sentences
}

function pushEmphasisMatches(cands: EmphasisRange[], sentence: string, re: RegExp, priority: number) {
  for (const m of sentence.matchAll(re)) {
    if (m.index == null || !m[0]) continue
    cands.push({ start: m.index, end: m.index + m[0].length, priority })
  }
}

function isNumericEmphasisContent(text: string): boolean {
  return EMPHASIS_NUMERIC_ONLY_RE.test(String(text || '').replace(/\s/g, ''))
}

/** 去掉仅包裹数字的 ** 标记（LLM 误标时兜底） */
export function stripNumericEmphasisMarkers(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, (full, inner: string) => (
    isNumericEmphasisContent(inner) ? inner : full
  ))
}

function pickEmphasisRanges(sentence: string, maxMarks = 1): Array<{ start: number; end: number }> {
  const cands: EmphasisRange[] = []

  pushEmphasisMatches(cands, sentence, EMPHASIS_EMOTION_RE, 0)
  pushEmphasisMatches(cands, sentence, EMPHASIS_OBJECT_RE, 1)
  pushEmphasisMatches(cands, sentence, EMPHASIS_ACTION_RE, 2)
  pushEmphasisMatches(cands, sentence, EMPHASIS_TURNING_RE, 3)
  for (const m of sentence.matchAll(/「([^」]{1,10})」/g)) {
    if (m.index != null) {
      cands.push({ start: m.index, end: m.index + m[0].length, priority: 4 })
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

/** 本地规则自动加 **强调**（情感/物件/动作优先），不标数字；每句最多 1 处，也可不标 */
export function markEmphasisHeuristic(sentence: string, maxMarks = 1): string {
  if (!sentence.trim() || hasEmphasisMarkers(sentence)) return sentence
  const ranges = pickEmphasisRanges(sentence, maxMarks)
  if (!ranges.length) return sentence
  let out = sentence
  for (const { start, end } of [...ranges].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, start)}**${out.slice(start, end)}**${out.slice(end)}`
  }
  return stripNumericEmphasisMarkers(out)
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

/** LLM 返回句须与原文一致（仅允许加 **），否则丢弃标记；纯数字不加 ** */
export function validateEmphasisMarkedSentence(original: string, marked: string): string {
  const clean = String(marked ?? '').trim()
  if (!clean) return original
  if (stripEmphasisMarkers(clean).replace(/\s/g, '') !== original.replace(/\s/g, '')) {
    return original
  }
  return stripBannedEmphasisMarkers(stripNumericEmphasisMarkers(limitEmphasisMarkers(clean, 1)))
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

function buildNarrationAssDefaultStyle(fontName = 'Arial') {
  const fs = NARRATION_SUBTITLE_FONT_SIZE
  return `Style: Default, ${fontName}, ${fs}, &HFFFFFF&, &H00000000&, &H00000000&, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 0, 2, ${NARRATION_SUBTITLE_MARGIN_LR}, ${NARRATION_SUBTITLE_MARGIN_LR}, ${NARRATION_SUBTITLE_MARGIN_V}, 1`
}

function formatNarrationAssPlainInline(text: string) {
  return `${NARRATION_ASS_LAYOUT_TAG}${NARRATION_ASS_WHITE_TAG}${escapeAssText(text)}`
}

function convertEmphasisToAssInline(text: string) {
  const parts: string[] = [`${NARRATION_ASS_LAYOUT_TAG}${NARRATION_ASS_WHITE_TAG}`]
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(EMPHASIS_MARKER_RE.source, 'g')
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(escapeAssText(text.slice(lastIndex, match.index)))
    }
    parts.push(`${NARRATION_ASS_EMPHASIS_TAG}${escapeAssText(match[1])}${NARRATION_ASS_WHITE_TAG}`)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(escapeAssText(text.slice(lastIndex)))
  }
  return parts.join('')
}

export function buildNarrationEmphasisAssHeader(fontName = 'Arial') {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${NARRATION_SUBTITLE_PLAY_RES_X}
PlayResY: ${NARRATION_SUBTITLE_PLAY_RES_Y}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${buildNarrationAssDefaultStyle(fontName)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}

export function buildNarrationPlainAssDialogueLine(text: string, startSec: number, endSec: number) {
  const line = formatNarrationAssPlainInline(text.replace(/\r/g, '').replace(/\n/g, ' ').trim())
  const start = formatAssTimestamp(startSec)
  const end = formatAssTimestamp(endSec)
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,${line}`
}

export function buildNarrationPlainAssContent(text: string, durationSec: number, startOffsetSec = 0) {
  const startAt = Math.max(0, startOffsetSec)
  const endAt = startAt + Math.max(durationSec, 0.05)
  return `${buildNarrationEmphasisAssHeader()}${buildNarrationPlainAssDialogueLine(text, startAt, endAt)}\n`
}

export function buildNarrationEmphasisAssDialogueLine(text: string, startSec: number, endSec: number) {
  const line = convertEmphasisToAssInline(text.replace(/\r/g, '').replace(/\n/g, ' ').trim())
  const start = formatAssTimestamp(startSec)
  const end = formatAssTimestamp(endSec)
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,${line}`
}

export function buildNarrationEmphasisAssContent(text: string, durationSec: number, startOffsetSec = 0) {
  const startAt = Math.max(0, startOffsetSec)
  const endAt = startAt + Math.max(durationSec, 0.05)
  return `${buildNarrationEmphasisAssHeader()}${buildNarrationEmphasisAssDialogueLine(text, startAt, endAt)}\n`
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
    const titleWhiteFs = 104
    const titleFs = 94
    styleLines.push(
      `Style: TitleWhite, ${titleFontName}, ${titleWhiteFs}, &HFFFFFF&, &HFF000000&, &H00000000&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1`,
      `Style: Title, ${titleFontName}, ${titleFs}, &H0014F0&, &HFF000000&, &H00FFFFFF&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1`,
    )
  }
  if (includeNarrationStyles) {
    styleLines.push(buildNarrationAssDefaultStyle(narrationFontName))
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${NARRATION_SUBTITLE_PLAY_RES_X}
PlayResY: ${NARRATION_SUBTITLE_PLAY_RES_Y}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLines.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}
