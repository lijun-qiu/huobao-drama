import type { SrtCue } from './audio-transcribe.js'

export type TimeRange = { start: number; end: number }

const PUNCT_RE = /[，。！？；：、,.!?;:'"''""（）()\[\]《》【】「」『』…—·\-~～\s]/g

export function normalizeAlignText(text: string): string {
  return String(text || '').replace(PUNCT_RE, '').toLowerCase()
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }
  return dp[a.length][b.length]
}

function lcsLength(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function charBigrams(text: string): string[] {
  const bigrams: string[] = []
  for (let i = 0; i < text.length - 1; i++) bigrams.push(text.slice(i, i + 2))
  return bigrams
}

function bigramJaccard(a: string, b: string): number {
  if (!a || !b) return 0
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const setA = new Set(charBigrams(a))
  const setB = new Set(charBigrams(b))
  let inter = 0
  for (const gram of setA) if (setB.has(gram)) inter++
  const union = setA.size + setB.size - inter
  return union > 0 ? inter / union : 0
}

/** 文案与转写文本差异成本（0=完全匹配，1=完全不匹配），对谐音/错字更宽容 */
export function textMismatchCost(script: string, spoken: string): number {
  const a = normalizeAlignText(script)
  const b = normalizeAlignText(spoken)
  if (!a && !b) return 0
  if (!a || !b) return 1
  if (a === b) return 0
  if (a.includes(b) || b.includes(a)) return 0.08

  const maxLen = Math.max(a.length, b.length)
  const levCost = levenshteinDistance(a, b) / maxLen
  const lcsCost = 1 - lcsLength(a, b) / maxLen
  const bigramCost = 1 - bigramJaccard(a, b)
  let cost = Math.min(levCost, lcsCost * 0.95, bigramCost * 0.9)

  // 等长句中部分字相同 → 常见于 Whisper 谐音错字
  if (a.length === b.length && a.length >= 3) {
    let samePos = 0
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) samePos++
    const posRatio = samePos / a.length
    if (posRatio >= 0.3) cost = Math.min(cost, (1 - posRatio) * 0.82)
  }

  // 字数接近且公共字比例高
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= 3 && longer.includes(shorter.slice(0, Math.min(4, shorter.length)))) {
    cost = Math.min(cost, 0.12)
  }

  return Math.max(0, Math.min(1, cost))
}

export function textMatchScore(script: string, spoken: string): number {
  return Math.max(0, 1 - textMismatchCost(script, spoken))
}

type AlignGroup = { startCue: number; endCue: number }

const MIN_SEGMENT_SEC = 0.35

function isValidAlignGroup(group: AlignGroup | undefined, cues: SrtCue[]): group is AlignGroup {
  if (!group) return false
  if (group.startCue < 0 || group.endCue < 0) return false
  if (group.startCue >= cues.length || group.endCue >= cues.length) return false
  if (group.startCue > group.endCue) return false
  return !!cues[group.startCue] && !!cues[group.endCue]
}

function groupToTimeRange(group: AlignGroup, cues: SrtCue[]): TimeRange {
  const startCue = cues[group.startCue]
  const endCue = cues[group.endCue]
  return {
    start: startCue.start,
    end: Math.max(startCue.start + MIN_SEGMENT_SEC, endCue.end),
  }
}

function partitionCuesToScripts(scripts: string[], cues: SrtCue[]): AlignGroup[] {
  const n = scripts.length
  const m = cues.length
  if (!n || !m) return []
  // 字幕段少于分镜时无法可靠按 cue 切分
  if (m < n) return []

  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Number.POSITIVE_INFINITY))
  const parent: Array<Array<{ prevI: number; prevJ: number; startCue: number } | null>> =
    Array.from({ length: n + 1 }, () => Array(m + 1).fill(null))
  dp[0][0] = 0

  for (let i = 0; i < n; i++) {
    for (let j = i; j <= m - (n - i); j++) {
      if (!Number.isFinite(dp[i][j])) continue
      const minK = j + 1
      const maxK = m - (n - i - 1)
      for (let k = minK; k <= maxK; k++) {
        const spoken = cues.slice(j, k).map(cue => cue.text).join('')
        const cost = textMismatchCost(scripts[i], spoken)
        const next = dp[i][j] + cost
        if (next < dp[i + 1][k]) {
          dp[i + 1][k] = next
          parent[i + 1][k] = { prevI: i, prevJ: j, startCue: j }
        }
      }
    }
  }

  if (!Number.isFinite(dp[n][m])) {
    return fallbackProportionalGroups(scripts, cues)
  }

  const groups: AlignGroup[] = []
  let i = n
  let j = m
  while (i > 0) {
    const node = parent[i][j]
    if (!node) break
    groups.unshift({ startCue: node.startCue, endCue: j - 1 })
    i = node.prevI
    j = node.prevJ
  }
  return groups.length === n ? groups : fallbackProportionalGroups(scripts, cues)
}

function fallbackProportionalGroups(scripts: string[], cues: SrtCue[]): AlignGroup[] {
  if (!cues.length || scripts.length > cues.length) return []

  const weights = scripts.map(text => Math.max(1, normalizeAlignText(text).length))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || scripts.length
  const groups: AlignGroup[] = []
  let cueIdx = 0

  for (let i = 0; i < scripts.length; i++) {
    const remainingScripts = scripts.length - i
    const remainingCues = cues.length - cueIdx
    if (remainingCues <= 0) return []

    const share = i === scripts.length - 1
      ? remainingCues
      : Math.max(1, Math.round((weights[i] / totalWeight) * cues.length))
    const count = i === scripts.length - 1
      ? remainingCues
      : Math.min(
        Math.max(1, share),
        Math.max(1, remainingCues - remainingScripts + 1),
      )
    const endCue = Math.min(cues.length - 1, cueIdx + count - 1)
    groups.push({ startCue: cueIdx, endCue })
    cueIdx = endCue + 1
  }

  return groups.length === scripts.length ? groups : []
}

function buildSpokenTimeline(cues: SrtCue[]): { text: string; times: number[] } {
  let text = ''
  const times: number[] = []
  for (const cue of cues) {
    const norm = normalizeAlignText(cue.text)
    if (!norm) continue
    const dur = Math.max(0.01, cue.end - cue.start)
    for (let i = 0; i < norm.length; i++) {
      text += norm[i]
      times.push(cue.start + (dur * (i + 0.5)) / norm.length)
    }
  }
  return { text, times }
}

function findTextSpan(spoken: string, pattern: string, from: number): { start: number; end: number; cost: number } {
  const norm = normalizeAlignText(pattern)
  if (!norm) return { start: from, end: from, cost: 1 }

  const startPos = findTextPosition(spoken, norm, from)
  let bestEnd = Math.min(spoken.length, startPos + norm.length)
  let bestCost = textMismatchCost(pattern, spoken.slice(startPos, bestEnd))

  for (let len = Math.max(1, norm.length - 5); len <= norm.length + 8; len++) {
    if (startPos + len > spoken.length) break
    const slice = spoken.slice(startPos, startPos + len)
    const cost = textMismatchCost(pattern, slice)
    if (cost < bestCost) {
      bestCost = cost
      bestEnd = startPos + len
    }
  }

  return { start: startPos, end: Math.max(startPos + 1, bestEnd), cost: bestCost }
}

function timeAtTextIndex(times: number[], index: number): number {
  if (!times.length) return 0
  return times[Math.max(0, Math.min(times.length - 1, index))] ?? 0
}

/** 将时间范围扩展到完整 SRT 字幕段，避免在句中硬切 */
function snapRangeToCueBoundaries(range: TimeRange, cues: SrtCue[]): TimeRange {
  if (!cues.length) return range

  let startCue = 0
  let endCue = cues.length - 1
  for (let i = 0; i < cues.length; i++) {
    if (range.start <= cues[i].end + 0.05) {
      startCue = i
      break
    }
  }
  for (let i = cues.length - 1; i >= 0; i--) {
    if (range.end >= cues[i].start - 0.05) {
      endCue = i
      break
    }
  }
  if (startCue > endCue) endCue = startCue

  return {
    start: cues[startCue].start,
    end: Math.max(cues[startCue].start + MIN_SEGMENT_SEC, cues[endCue].end),
  }
}

function findCueGapSplit(cues: SrtCue[], leftEnd: number, rightStart: number): number {
  let bestMid = (leftEnd + rightStart) / 2
  let bestGap = -1

  for (let i = 0; i < cues.length - 1; i++) {
    const gapStart = cues[i].end
    const gapEnd = cues[i + 1].start
    const gap = gapEnd - gapStart
    const mid = (gapStart + gapEnd) / 2
    if (gap > bestGap && mid > leftEnd - 0.15 && mid < rightStart + 0.15) {
      bestGap = gap
      bestMid = mid
    }
  }

  if (bestGap >= 0.08) return bestMid
  return Math.max(leftEnd, Math.min(rightStart, bestMid))
}

/** 消除重叠，并在相邻字幕段间隙处断句 */
function refineSequentialRanges(ranges: TimeRange[], cues: SrtCue[], totalDuration: number): TimeRange[] {
  if (!ranges.length) return ranges

  const snapped = ranges.map(r => snapRangeToCueBoundaries(r, cues))
  const out: TimeRange[] = [{ ...snapped[0] }]

  for (let i = 1; i < snapped.length; i++) {
    const prev = out[i - 1]
    const curr = { ...snapped[i] }
    if (curr.start < prev.end - 0.02) {
      const split = findCueGapSplit(cues, prev.end, curr.start)
      prev.end = Math.max(prev.start + MIN_SEGMENT_SEC, split)
      curr.start = Math.max(prev.end, curr.start)
    }
    if (curr.end <= curr.start) {
      curr.end = Math.min(totalDuration, curr.start + MIN_SEGMENT_SEC)
    }
    out.push(curr)
  }

  if (out.length) {
    out[0].start = Math.max(0, cues[0]?.start ?? out[0].start)
    out[out.length - 1].end = Math.min(totalDuration, Math.max(out[out.length - 1].end, cues[cues.length - 1]?.end ?? out[out.length - 1].end))
  }

  return out
}

function rangesFromCueGroups(groups: AlignGroup[], cues: SrtCue[]): TimeRange[] {
  return groups.map(group => groupToTimeRange(group, cues))
}

function findTextPosition(spoken: string, pattern: string, from: number): number {
  if (!pattern) return from
  const exact = spoken.indexOf(pattern, from)
  if (exact >= 0) return exact

  let bestIdx = from
  let bestCost = 1
  const searchEnd = Math.min(spoken.length, from + Math.max(pattern.length * 4, 48))
  for (let i = from; i < searchEnd; i++) {
    for (let len = Math.max(1, pattern.length - 2); len <= pattern.length + 3; len++) {
      if (i + len > spoken.length) break
      const cost = textMismatchCost(pattern, spoken.slice(i, i + len))
      if (cost < bestCost) {
        bestCost = cost
        bestIdx = i
      }
    }
  }
  return bestIdx
}

/** 按转写文本顺序在时间轴上定位每镜文案 */
export function alignStoryboardsByTranscriptTimeline(
  scripts: string[],
  cues: SrtCue[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number } {
  const { text: spoken, times } = buildSpokenTimeline(cues)
  if (!spoken || !times.length) {
    return alignStoryboardsByWeightedDuration(scripts, totalDuration)
  }

  const ranges: TimeRange[] = []
  let cursor = 0
  let totalCost = 0

  for (let i = 0; i < scripts.length; i++) {
    const norm = normalizeAlignText(scripts[i])
    if (!norm) {
      const prevEnd = ranges[i - 1]?.end ?? 0
      ranges.push({ start: prevEnd, end: prevEnd })
      continue
    }

    const span = findTextSpan(spoken, scripts[i], cursor)
    cursor = Math.max(cursor, span.end)

    const startTime = timeAtTextIndex(times, span.start)
    let endTime = timeAtTextIndex(times, Math.max(span.start, span.end - 1))
    if (endTime <= startTime) endTime = Math.min(totalDuration, startTime + MIN_SEGMENT_SEC)

    ranges.push({ start: startTime, end: Math.max(startTime + MIN_SEGMENT_SEC, endTime) })
    totalCost += span.cost
  }

  const refined = refineSequentialRanges(ranges, cues, totalDuration)
  const alignScore = Math.max(0, 1 - totalCost / Math.max(1, scripts.length))
  return { ranges: refined, alignScore }
}

/** 毫秒级边界，避免 171+ 分镜时浮点边界重叠导致大量 0.35s 最短片段 */
function buildWeightedBoundaryMs(weights: number[], totalDurationSec: number): number[] {
  const n = weights.length
  const totalMs = Math.max(n, Math.round(totalDurationSec * 1000))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || n
  const minGapMs = Math.max(
    Math.round(MIN_SEGMENT_SEC * 1000),
    Math.floor(totalMs / Math.max(n * 8, n + 1)),
  )

  const boundaries = [0]
  let accWeight = 0
  for (let i = 0; i < n - 1; i++) {
    accWeight += weights[i]
    boundaries.push(Math.round((accWeight / totalWeight) * totalMs))
  }
  boundaries.push(totalMs)

  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] < boundaries[i - 1] + minGapMs) {
      boundaries[i] = boundaries[i - 1] + minGapMs
    }
  }

  let overflow = boundaries[n] - totalMs
  if (overflow > 0) {
    for (let i = n - 1; i >= 1 && overflow > 0; i--) {
      const shrinkable = boundaries[i] - boundaries[i - 1] - minGapMs
      if (shrinkable <= 0) continue
      const shrink = Math.min(shrinkable, overflow)
      for (let j = i; j <= n; j++) boundaries[j] -= shrink
      overflow -= shrink
    }
    boundaries[n] = totalMs
    for (let i = n - 1; i >= 1; i--) {
      if (boundaries[i] <= boundaries[i - 1]) {
        boundaries[i] = Math.min(totalMs, boundaries[i - 1] + minGapMs)
      }
    }
  }

  return boundaries
}

/** 按文案字数比例切分音频时长（0→总时长，按字数占比划分边界） */
export function alignStoryboardsByWeightedDuration(
  scripts: string[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number } {
  if (!scripts.length) return { ranges: [], alignScore: 0 }
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error('音频时长无效，无法按比例裁剪')
  }

  const weights = scripts.map(text => Math.max(1, normalizeAlignText(text).length))
  const boundariesMs = buildWeightedBoundaryMs(weights, totalDuration)
  const boundaries = boundariesMs.map(ms => ms / 1000)

  const ranges: TimeRange[] = []
  for (let i = 0; i < scripts.length; i++) {
    const start = boundaries[i]
    const end = i === scripts.length - 1 ? totalDuration : boundaries[i + 1]
    ranges.push({
      start,
      end: Math.max(start + MIN_SEGMENT_SEC, end),
    })
  }

  if (ranges.length) ranges[ranges.length - 1].end = totalDuration
  return { ranges, alignScore: 1 }
}

/** 按字数比例将分镜文案映射到各 SRT 段（用于展示，不依赖 Whisper 错字） */
export function mapScriptSegmentsToCues(scripts: string[], cues: SrtCue[]): string[] {
  const fullScript = scripts.join('')
  if (!fullScript || !cues.length) return cues.map(() => '')

  const weights = cues.map(cue => {
    const textLen = normalizeAlignText(cue.text).length
    if (textLen > 0) return textLen
    return Math.max(1, Math.round((cue.end - cue.start) * 4))
  })
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || cues.length

  const segments: string[] = []
  let cursor = 0
  for (let i = 0; i < cues.length; i++) {
    const isLast = i === cues.length - 1
    if (isLast) {
      segments.push(fullScript.slice(cursor))
      break
    }
    const share = Math.max(1, Math.round((weights[i] / totalWeight) * fullScript.length))
    const end = Math.min(fullScript.length, cursor + share)
    segments.push(fullScript.slice(cursor, end))
    cursor = end
  }

  while (segments.length < cues.length) segments.push('')
  return segments.slice(0, cues.length)
}

function pickBestAlignment(
  scripts: string[],
  cues: SrtCue[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number; mode: 'srt' | 'timeline' | 'weighted' } {
  const timeline = alignStoryboardsByTranscriptTimeline(scripts, cues, totalDuration)
  const srt = alignStoryboardsToSrt(scripts, cues)
  const weighted = alignStoryboardsByWeightedDuration(scripts, totalDuration)
  const weightedSnapped = refineSequentialRanges(weighted.ranges, cues, totalDuration)

  const candidates = [
    { ...timeline, mode: 'timeline' as const },
    { ...srt, mode: 'srt' as const },
    { ...weightedSnapped, alignScore: weighted.alignScore * 0.85, mode: 'weighted' as const },
  ].sort((a, b) => b.alignScore - a.alignScore)

  const best = candidates[0]
  if (best.alignScore >= 0.2) return best

  if (cues.length < scripts.length * 0.6) {
    return timeline.alignScore >= weighted.alignScore
      ? { ...timeline, mode: 'timeline' as const }
      : { ...weightedSnapped, mode: 'weighted' as const }
  }
  return best.alignScore > 0 ? best : { ...timeline, mode: 'timeline' as const }
}

/** 将 SRT 字幕 cue 与分镜文案顺序对齐，返回每镜时间区间 */
export function alignStoryboardsToSrt(scripts: string[], cues: SrtCue[]): {
  ranges: TimeRange[]
  alignScore: number
} {
  if (!scripts.length) return { ranges: [], alignScore: 0 }
  if (!cues.length) throw new Error('字幕为空，无法对齐')

  const totalDuration = cues[cues.length - 1]?.end ?? cues[0]?.end ?? MIN_SEGMENT_SEC
  const groups = partitionCuesToScripts(scripts, cues)
  if (groups.length !== scripts.length || !groups.every(group => isValidAlignGroup(group, cues))) {
    return alignStoryboardsByTranscriptTimeline(scripts, cues, totalDuration)
  }

  const ranges = refineSequentialRanges(rangesFromCueGroups(groups, cues), cues, totalDuration)

  let totalCost = 0
  for (let i = 0; i < scripts.length; i++) {
    const spoken = cues.slice(groups[i].startCue, groups[i].endCue + 1).map(cue => cue.text).join('')
    totalCost += textMismatchCost(scripts[i], spoken)
  }
  const alignScore = Math.max(0, 1 - totalCost / Math.max(1, scripts.length))

  return { ranges, alignScore }
}

export function resolveStoryboardAudioRanges(
  scripts: string[],
  _cues: SrtCue[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number; mode: 'weighted' } {
  // Whisper 转写常有错字，裁剪只按分镜文案字数在整段音频上比例切分
  return { ...alignStoryboardsByWeightedDuration(scripts, totalDuration), mode: 'weighted' }
}
