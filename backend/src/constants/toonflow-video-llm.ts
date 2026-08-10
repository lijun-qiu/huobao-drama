/**
 * Toonflow 视频提示词规则（对齐 Toonflow-app universalFirstAndLastFrameMode）
 * 用于解说图生视频 video_prompt 生成。
 */

/** Agnes / Wan 首尾帧或单图图生视频：系统提示词 */
export function buildToonflowVideoPromptLLMSystem(options?: {
  styleEn?: string | null
  styleZh?: string | null
}): string {
  const styleEn = String(options?.styleEn || '').trim()
    || 'Japanese 2D anime, clean cel shading, cinematic lighting, shallow depth of field'
  const styleZh = String(options?.styleZh || '').trim()
    || '日系2D动漫，清晰赛璐璐，电影感光影，浅景深'

  return [
    '你是**视频提示词生成 Agent**（Toonflow 通用首尾帧/单图模式），根据分镜信息输出视频提示词。',
    '',
    '## 核心原则',
    '- **纯文本提示词**：不使用任何 `@图N`、对照定妆/场景标签引用',
    '- **双语输出**：必须同时输出英文版 + 中文版，语义一致',
    '- **五维度结构**：Visual/Motion/Camera/Audio/Narrative（中文：画面/动作/镜头/音频/叙事）',
    '- **全程单一连贯镜头**：从头到尾一个镜头，禁止切镜',
    '- **时间轴分段**：每段最低 1 秒，用 `0s-Xs` 标注，总和不超过目标时长',
    '- **严格基于输入**：不编造未提供的角色/道具/台词；无台词写「无台词」/ No dialogue',
    '- **保持与参考静帧一致**：人物服装发型场景不得换装换人',
    `- **视觉风格标签（EN）**：${styleEn}`,
    `- **视觉风格标签（ZH）**：${styleZh}`,
    '',
    '## 输出格式（必须严格遵守）',
    '先英文后中文，用标记分隔，不要解释：',
    '',
    '===EN===',
    '[Visual]',
    '{SubjectA}: {appearance}, {pose}, {speaking/silent}.',
    '{scene}, {props}.',
    '{style tags}.',
    '',
    '[Motion]',
    '0s-{X}s: {action segment 1}.',
    '{X}s-{Y}s: {action segment 2}.',
    '',
    '[Camera]',
    '{shot type}, {camera move}, single continuous take, no cuts.',
    '',
    '[Audio]',
    '{Xs-Ys}: "{dialogue or narration}" — {speaker} ({dialogue / inner monologue OS / voiceover VO}), {lip-sync active / silent lips}.',
    '{sfx}.',
    '',
    '[Narrative]',
    '{beat summary}.',
    '',
    '===ZH===',
    '【画面】',
    '{主体A}：{外观}，{姿态}，{说话/沉默}。',
    '{场景}，{道具}。',
    '{视觉风格}。',
    '',
    '【动作】',
    '0s-{X}s：{动作段1}。',
    '{X}s-{Y}s：{动作段2}。',
    '',
    '【镜头】',
    '{景别}，{运镜}，全程单一连贯镜头，不切镜。',
    '',
    '【音频】',
    '{Xs-Ys}：「{台词/旁白}」— {说话者}（对白/内心OS/画外音VO）。',
    '{音效/环境声}。',
    '',
    '【叙事】',
    '{情节点概述}。',
    '',
    '## 生成规则',
    '1. ===EN=== 段落英文（台词原文除外）；===ZH=== 段落中文',
    '2. 旁白解说优先标为 voiceover VO / 画外音VO，角色对白标 dialogue',
    '3. 每个主体必须标注 speaking/silent 或 说话/沉默',
    '4. Motion 时间轴覆盖目标时长，动作来自【画面】与旁白，禁止空转氛围凑段',
    '5. 若标注强化运动：动作幅度更大、节奏更紧，仍保持单镜连贯',
    '6. 禁止 markdown 代码块、禁止前言后记',
  ].join('\n')
}

/** 默认日系解说风格标签 */
export const TOONFLOW_VIDEO_STYLE_EN_DEFAULT =
  'Japanese 2D anime, hand-drawn cel animation, cinematic, clean line art, shallow depth of field'

export const TOONFLOW_VIDEO_STYLE_ZH_DEFAULT =
  '日系2D动漫，手绘赛璐璐，电影感，清晰线条，浅景深'

export function isToonflowVideoPromptStructure(raw?: string | null): boolean {
  const t = String(raw || '')
  return /===EN===/i.test(t) || (/【动作】/.test(t) && /【镜头】/.test(t)) || (/\[Motion\]/i.test(t) && /\[Camera\]/i.test(t))
}

export type ToonflowVideoRuleFallbackInput = {
  scene?: string | null
  paragraph?: string | null
  durationSec?: number | null
  shotType?: string | null
  movement?: string | null
  roleNames?: string[] | null
  sceneLabel?: string | null
  propLabels?: string[] | null
  soundEffect?: string | null
  highlight?: boolean
  highlightReason?: string | null
  styleEn?: string | null
  styleZh?: string | null
}

/**
 * LLM 失败时的 Toonflow 五维双语规则模板（格式与 LLM 输出一致，便于落库与抽取）。
 */
export function buildToonflowVideoPromptRuleFallback(input: ToonflowVideoRuleFallbackInput): string {
  const dur = (() => {
    const n = Number(input.durationSec)
    if (Number.isFinite(n) && n > 0) return Math.min(13, Math.max(2, Math.round(n)))
    return 5
  })()
  const mid = Math.max(1, Math.floor(dur / 2))
  const scene = String(input.scene || '').replace(/\s+/g, ' ').trim().slice(0, 220)
    || String(input.sceneLabel || '').trim()
    || '画面与参考静帧一致'
  const para = String(input.paragraph || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const roles = (input.roleNames || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 4)
  const props = (input.propLabels || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 3)
  const shot = String(input.shotType || '').trim() || '中景'
  const move = String(input.movement || '').trim() || (input.highlight ? '跟拍推进' : '缓推/微动')
  const sfx = String(input.soundEffect || '').trim() || (input.highlight ? '冲击音效' : '环境声')
  const styleEn = String(input.styleEn || '').trim() || TOONFLOW_VIDEO_STYLE_EN_DEFAULT
  const styleZh = String(input.styleZh || '').trim() || TOONFLOW_VIDEO_STYLE_ZH_DEFAULT
  const highlightNoteZh = input.highlight
    ? `强化运动${input.highlightReason ? `（${input.highlightReason}）` : ''}，动作幅度更大、节奏更紧`
    : '角色轻微自然动作，保持服装发型一致'
  const highlightNoteEn = input.highlight
    ? `Intensified motion${input.highlightReason ? ` (${input.highlightReason})` : ''}, larger amplitude, tighter rhythm`
    : 'Subtle natural motion; keep costume and hairstyle unchanged'

  const subjectZh = roles.length
    ? roles.map(r => `${r}：与参考静帧一致，沉默`).join('\n')
    : '主体：与参考静帧一致，沉默'
  const subjectEn = roles.length
    ? roles.map(r => `${r}: matches reference still, silent.`).join('\n')
    : 'Subject: matches reference still, silent.'
  const propZh = props.length ? `道具：${props.join('、')}` : ''
  const propEn = props.length ? `Props: ${props.join(', ')}.` : ''

  const motion1Zh = input.highlight
    ? `${highlightNoteZh}，主体重心与表情明显变化`
    : '主体轻微呼吸/眨眼或姿态微调，场景氛围稳定'
  const motion2Zh = input.highlight
    ? '动作延续并收束，镜头跟随，不切镜'
    : '动作自然延续，镜头稳定，不切镜'
  const motion1En = input.highlight
    ? `${highlightNoteEn}; clear weight shift and expression change`
    : 'Subtle breathing/blink or posture micro-adjust; scene stable'
  const motion2En = input.highlight
    ? 'Action continues then settles; camera follows; no cuts'
    : 'Motion continues naturally; camera steady; no cuts'

  const audioZh = para
    ? `0s-${dur}s：「${para}」— 旁白（画外音VO），角色闭嘴。`
    : `0s-${dur}s：无台词。`
  const audioEn = para
    ? `0s-${dur}s: "${para}" — Narrator (voiceover VO), silent lips.`
    : `0s-${dur}s: No dialogue.`

  const narrativeZh = para
    ? `旁白节拍下的单镜运动：${para.slice(0, 80)}`
    : '与配图一致的单镜连贯运动'
  const narrativeEn = para
    ? `Single-take motion under narration beat: ${para.slice(0, 80)}`
    : 'Single continuous take matching the still'

  return [
    '===EN===',
    '[Visual]',
    subjectEn,
    `${scene}.`,
    propEn || null,
    `${styleEn}.`,
    '',
    '[Motion]',
    `0s-${mid}s: ${motion1En}.`,
    `${mid}s-${dur}s: ${motion2En}.`,
    '',
    '[Camera]',
    `${shot}, ${move}, single continuous take, no cuts.`,
    '',
    '[Audio]',
    audioEn,
    `${sfx}.`,
    '',
    '[Narrative]',
    `${narrativeEn}.`,
    '',
    '===ZH===',
    '【画面】',
    subjectZh,
    `${scene}。`,
    propZh || null,
    `${styleZh}。`,
    '',
    '【动作】',
    `0s-${mid}s：${motion1Zh}。`,
    `${mid}s-${dur}s：${motion2Zh}。`,
    '',
    '【镜头】',
    `${shot}，${move}，全程单一连贯镜头，不切镜。`,
    '',
    '【音频】',
    audioZh,
    `${sfx}。`,
    '',
    '【叙事】',
    `${narrativeZh}。`,
  ].filter((line): line is string => line != null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 从 Toonflow 双语视频描述中提取提交给生视频模型的正文。
 * 优先英文整段；其次中文【动作】+【镜头】；再退回原文。
 */
export function extractVideoPromptForModel(raw?: string | null): string {
  const text = String(raw || '').trim()
  if (!text) return ''

  // (?= 之后直接写 ===ZH===，整体为 (?====ZH===|$) —— 三个等号，勿多写 =
  const en = text.match(/===EN===\s*([\s\S]*?)(?====ZH===|$)/i)?.[1]?.trim()
  if (en && en.length >= 20) return en

  const zhBlock = text.match(/===ZH===\s*([\s\S]*)$/i)?.[1]?.trim() || text
  const motion = zhBlock.match(/【动作】([\s\S]*?)(?=【镜头】|【音频】|【叙事】|$)/)?.[1]?.trim()
  const camera = zhBlock.match(/【镜头】([\s\S]*?)(?=【音频】|【叙事】|$)/)?.[1]?.trim()
  const visual = zhBlock.match(/【画面】([\s\S]*?)(?=【动作】|【镜头】|$)/)?.[1]?.trim()
  const parts = [visual, motion, camera].filter(Boolean)
  if (parts.length) return parts.join('\n').trim()

  return text
}

/** 清洗 LLM 输出：保留 Toonflow 结构，去掉代码块外壳 */
export function sanitizeToonflowVideoPrompt(raw: string): string {
  let text = String(raw || '').trim()
  if (!text) return ''
  text = text.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '').trim()
  text = text.replace(/^(视频描述|运动描述|视频提示词|video\s*prompt)\s*[:：]\s*/i, '').trim()

  // 已是 Toonflow 结构：保留换行，轻微规整
  if (/===EN===/i.test(text) || /【动作】/.test(text)) {
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    // 上限放宽，按段落边界截断，避免半截
    if (text.length > 3500) {
      const cut = text.slice(0, 3500)
      const zhEnd = cut.lastIndexOf('【叙事】')
      if (zhEnd > 1200) return cut.slice(0, zhEnd).trim()
      const enEnd = cut.lastIndexOf('[Narrative]')
      if (enEnd > 800) return cut.slice(0, enEnd).trim()
      return cut.trim()
    }
    return text
  }

  // 非结构输出：收成一段完整中文
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*•\d]+[.)、]\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 480)
}
