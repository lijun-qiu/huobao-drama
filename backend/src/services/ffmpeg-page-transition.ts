/**
 * 场景转场 — 剪映风格云朵擦除（xfade smoothright：新画面自左向右软边滑入）
 * 用于主片换配图、开幕片头、分路总拼接等。
 *
 * 叠加型：各段完整播放，转场 td 秒叠在段间接缝（默认 0.2），旁白不截断。
 *
 * 可通过环境变量覆盖：
 * - MERGE_XFADE_TRANSITION（如 smoothright / hrwind / vdwind）
 * - MERGE_XFADE_DURATION_SEC（秒，默认 0.2）
 */
const transition = String(process.env.MERGE_XFADE_TRANSITION || 'smoothright').trim()
const durationSec = Number(process.env.MERGE_XFADE_DURATION_SEC)

/** @deprecated 名称保留兼容；现为横向云朵/软擦除，不再是纵向翻页 */
export const PAGE_FLIP_XFADE_TRANSITION = transition || 'smoothright'
export const PAGE_FLIP_TRANSITION_SEC = Number.isFinite(durationSec) && durationSec > 0
  ? durationSec
  : 0.2

/** 云朵转场拼接后的总时长：各段之和 + 首段 stop-pad 带来的 td（与 buildXfadeFilterScript 对齐） */
export function computePageFlipMergedDuration(segmentDurations: number[]): number {
  if (!segmentDurations.length) return 0
  if (segmentDurations.length === 1) return segmentDurations[0]
  return segmentDurations.reduce((sum, d) => sum + d, 0) + PAGE_FLIP_TRANSITION_SEC
}

/** 叠加型转场：每段结束处触发音效（与 computePageFlipMergedDuration 对齐） */
export function computePageFlipTransitionTimes(segmentDurations: number[]): number[] {
  if (segmentDurations.length <= 1) return []
  const td = PAGE_FLIP_TRANSITION_SEC
  const times: number[] = []
  let cumulative = segmentDurations[0]
  for (let i = 1; i < segmentDurations.length; i++) {
    times.push(Math.max(0, cumulative))
    cumulative += td + segmentDurations[i]
  }
  return times
}

export function shiftPageFlipTransitionTimes(times: number[], offsetSec: number): number[] {
  return times.map(t => t + offsetSec)
}

/** 在 parent 段之后拼接 child 时间轴（含 parent→child 转场点） */
export function prependPageFlipSegmentTimeline(
  parentDurationSec: number,
  childTimes: number[],
): number[] {
  if (parentDurationSec <= 0) return childTimes
  const td = PAGE_FLIP_TRANSITION_SEC
  const offset = parentDurationSec + td
  return [parentDurationSec, ...shiftPageFlipTransitionTimes(childTimes, offset)]
}
