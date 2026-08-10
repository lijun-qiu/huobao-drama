/** 解说视频分镜口播节奏（与配图/图生视频一镜对齐） */

/** 与解说脚本篇幅一致：约 650 字/分钟（600～700 中值） */
export const NARRATION_SCRIPT_CHARS_PER_MINUTE = 650
/** 解说视频分镜目标口播时长（秒） */
export const NARRATION_VIDEO_TARGET_SHOT_SEC = 10
/** 单镜口播秒数下限 / 上限（估时长与 LLM duration_sec 钳制） */
export const NARRATION_VIDEO_SHOT_SEC_MIN = 7
export const NARRATION_VIDEO_SHOT_SEC_MAX = 13
/** 约 10.8 字/秒 → 10s ≈ 108 字 */
export const NARRATION_VIDEO_CHARS_PER_SEC = NARRATION_SCRIPT_CHARS_PER_MINUTE / 60
export const NARRATION_VIDEO_TARGET_SHOT_CHARS = Math.round(
  NARRATION_VIDEO_TARGET_SHOT_SEC * NARRATION_VIDEO_CHARS_PER_SEC,
)
