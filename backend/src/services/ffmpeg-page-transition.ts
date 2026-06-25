/**
 * 场景转场 — 剪映风格云朵擦除（xfade smoothright：新画面自左向右软边滑入）
 * 用于主片换配图、开幕片头、分路总拼接等。
 *
 * 可通过环境变量覆盖：
 * - MERGE_XFADE_TRANSITION（如 smoothright / hrwind / vdwind）
 * - MERGE_XFADE_DURATION_SEC（秒，默认 0.55）
 */
const transition = String(process.env.MERGE_XFADE_TRANSITION || 'smoothright').trim()
const durationSec = Number(process.env.MERGE_XFADE_DURATION_SEC)

/** @deprecated 名称保留兼容；现为横向云朵/软擦除，不再是纵向翻页 */
export const PAGE_FLIP_XFADE_TRANSITION = transition || 'smoothright'
export const PAGE_FLIP_TRANSITION_SEC = Number.isFinite(durationSec) && durationSec > 0
  ? durationSec
  : 0.55
