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

function textMismatchCost(script: string, spoken: string): number {
  const a = normalizeAlignText(script)
  const b = normalizeAlignText(spoken)
  if (!a && !b) return 0
  if (!a || !b) return 1
  if (a === b) return 0
  if (a.includes(b) || b.includes(a)) return 0.08
  const maxLen = Math.max(a.length, b.length)
  return levenshteinDistance(a, b) / maxLen
}

type AlignGroup = { startCue: number; endCue: number }

function partitionCuesToScripts(scripts: string[], cues: SrtCue[]): AlignGroup[] {
  const n = scripts.length
  const m = cues.length
  if (!n || !m) return []

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
  const weights = scripts.map(text => Math.max(1, normalizeAlignText(text).length))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || scripts.length
  const groups: AlignGroup[] = []
  let cueIdx = 0

  for (let i = 0; i < scripts.length; i++) {
    const remainingScripts = scripts.length - i
    const remainingCues = cues.length - cueIdx
    const share = i === scripts.length - 1
      ? remainingCues
      : Math.max(1, Math.round((weights[i] / totalWeight) * cues.length))
    const count = Math.min(Math.max(1, share), Math.max(1, remainingCues - remainingScripts + 1))
    const endCue = Math.min(cues.length - 1, cueIdx + count - 1)
    groups.push({ startCue: cueIdx, endCue })
    cueIdx = endCue + 1
  }

  return groups
}

const MIN_SEGMENT_SEC = 0.35

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

function findTextPosition(spoken: string, pattern: string, from: number): number {
  if (!pattern) return from
  const exact = spoken.indexOf(pattern, from)
  if (exact >= 0) return exact

  let bestIdx = from
  let bestCost = 1
  const searchEnd = Math.min(spoken.length, from + Math.max(pattern.length * 3, 24))
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

    const startPos = findTextPosition(spoken, norm, cursor)
    const endPos = Math.min(spoken.length, startPos + Math.max(1, norm.length))
    cursor = Math.max(cursor, endPos)

    const startTime = times[Math.min(startPos, times.length - 1)] ?? 0
    let endTime = times[Math.min(Math.max(startPos, endPos - 1), times.length - 1)] ?? startTime
    if (endTime <= startTime) endTime = Math.min(totalDuration, startTime + MIN_SEGMENT_SEC)

    if (i > 0 && startTime < ranges[i - 1].end) {
      const prevEnd = ranges[i - 1].end
      ranges.push({ start: prevEnd, end: Math.max(prevEnd + MIN_SEGMENT_SEC, endTime) })
    } else {
      ranges.push({ start: startTime, end: Math.max(startTime + MIN_SEGMENT_SEC, endTime) })
    }

    totalCost += textMismatchCost(scripts[i], spoken.slice(startPos, endPos))
  }

  if (ranges.length) {
    ranges[ranges.length - 1].end = Math.min(totalDuration, Math.max(ranges[ranges.length - 1].end, ranges[ranges.length - 1].start + MIN_SEGMENT_SEC))
  }

  const alignScore = Math.max(0, 1 - totalCost / Math.max(1, scripts.length))
  return { ranges, alignScore }
}

/** 按文案字数比例切分音频时长 */
export function alignStoryboardsByWeightedDuration(
  scripts: string[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number } {
  const weights = scripts.map(text => Math.max(1, normalizeAlignText(text).length))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || scripts.length
  const ranges: TimeRange[] = []
  let cursor = 0

  for (let i = 0; i < scripts.length; i++) {
    const share = i === scripts.length - 1
      ? Math.max(MIN_SEGMENT_SEC, totalDuration - cursor)
      : Math.max(MIN_SEGMENT_SEC, (weights[i] / totalWeight) * totalDuration)
    const end = i === scripts.length - 1 ? totalDuration : Math.min(totalDuration, cursor + share)
    ranges.push({ start: cursor, end: Math.max(cursor + MIN_SEGMENT_SEC, end) })
    cursor = ranges[ranges.length - 1].end
  }

  if (ranges.length) ranges[ranges.length - 1].end = totalDuration
  return { ranges, alignScore: 0.45 }
}

function pickBestAlignment(
  scripts: string[],
  cues: SrtCue[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number; mode: 'srt' | 'timeline' | 'weighted' } {
  const srt = alignStoryboardsToSrt(scripts, cues)
  const timeline = alignStoryboardsByTranscriptTimeline(scripts, cues, totalDuration)
  const weighted = alignStoryboardsByWeightedDuration(scripts, totalDuration)

  const candidates = [
    { ...srt, mode: 'srt' as const },
    { ...timeline, mode: 'timeline' as const },
    { ...weighted, mode: 'weighted' as const },
  ].sort((a, b) => b.alignScore - a.alignScore)

  const best = candidates[0]
  if (best.alignScore >= 0.15) return best

  // 字幕段远少于分镜时，时间轴/比例切分通常更可靠
  if (cues.length < scripts.length * 0.6) {
    const timelinePick = timeline.alignScore >= weighted.alignScore
      ? { ...timeline, mode: 'timeline' as const }
      : { ...weighted, mode: 'weighted' as const }
    return timelinePick
  }
  return best.alignScore > 0 ? best : { ...weighted, mode: 'weighted' as const }
}

/** 将 SRT 字幕 cue 与分镜文案顺序对齐，返回每镜时间区间 */
export function alignStoryboardsToSrt(scripts: string[], cues: SrtCue[]): {
  ranges: TimeRange[]
  alignScore: number
} {
  if (!scripts.length) return { ranges: [], alignScore: 0 }
  if (!cues.length) throw new Error('字幕为空，无法对齐')

  const groups = partitionCuesToScripts(scripts, cues)
  const ranges = groups.map((group) => ({
    start: cues[group.startCue].start,
    end: cues[group.endCue].end,
  }))

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
  cues: SrtCue[],
  totalDuration: number,
): { ranges: TimeRange[]; alignScore: number; mode: 'srt' | 'timeline' | 'weighted' } {
  if (!cues.length) throw new Error('字幕为空，无法对齐')
  return pickBestAlignment(scripts, cues, totalDuration)
}
