/**
 * 解说「强化运动」标记：可选写入更冲的 video_prompt；
 * 解说默认每镜走 Agnes/Wan 图生视频，本标记不再决定是否出视频。
 */

import {
  buildToonflowVideoPromptRuleFallback,
  TOONFLOW_VIDEO_STYLE_EN_DEFAULT,
  TOONFLOW_VIDEO_STYLE_ZH_DEFAULT,
} from './toonflow-video-llm.js'

export const NARRATION_HIGHLIGHT_KEYWORDS = [
  '毁灭', '爆炸', '惊醒', '猛回头', '回头', '坠落', '撞击', '觉醒',
  '心跳', '崩塌', '血战', '开战', '追杀', '暴走', '爆发', '闪白',
  '震屏', '末日', '坍塌', '粉碎', '撕裂', '狂奔', '冲刺', '嘶吼',
  '系统提示', '倒计时', '十小时', '世界末日', '无限循环', '重生',
  '拔刀', '拉弓', '开枪', '轰鸣', '雷劈', '闪电', '火焰', '燃烧',
] as const

export type NarrationHighlightHit = {
  highlight: boolean
  reason?: string
  matched?: string[]
}

/** 从旁白/配图文案推断是否高燃 */
export function detectNarrationHighlightMotion(text?: string | null): NarrationHighlightHit {
  const s = String(text || '').replace(/\*\*/g, '').trim()
  if (!s) return { highlight: false }
  const matched: string[] = []
  for (const kw of NARRATION_HIGHLIGHT_KEYWORDS) {
    if (s.includes(kw)) matched.push(kw)
  }
  if (!matched.length) return { highlight: false }
  return {
    highlight: true,
    reason: matched.slice(0, 4).join('、'),
    matched,
  }
}

/** 高燃镜运动提示词（Toonflow 五维双语；优先写入 storyboard.video_prompt） */
export function buildNarrationHighlightVideoPrompt(opts: {
  narration?: string | null
  imageScene?: string | null
  reason?: string | null
  durationSec?: number | null
}): string {
  return buildToonflowVideoPromptRuleFallback({
    scene: opts.imageScene,
    paragraph: opts.narration,
    durationSec: opts.durationSec,
    highlight: true,
    highlightReason: opts.reason,
    soundEffect: defaultNarrationHighlightSoundEffect(opts.reason),
    styleEn: TOONFLOW_VIDEO_STYLE_EN_DEFAULT,
    styleZh: TOONFLOW_VIDEO_STYLE_ZH_DEFAULT,
  })
}

/** 高燃默认音效意向（写入 sound_effect，供后续混音参考） */
export function defaultNarrationHighlightSoundEffect(reason?: string | null): string {
  const r = String(reason || '')
  if (/爆炸|轰鸣|崩塌|粉碎|坍塌/.test(r)) return '爆炸轰鸣'
  if (/心跳|惊醒/.test(r)) return '急促心跳'
  if (/系统|倒计时/.test(r)) return '系统提示音'
  if (/雷|闪电|劈/.test(r)) return '雷电声'
  if (/火焰|燃烧/.test(r)) return '火焰燃烧'
  if (/开枪|拔刀|拉弓/.test(r)) return '武器音效'
  return '冲击音效'
}
