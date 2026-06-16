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
