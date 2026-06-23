import {
  artStylePrompt,
  buildNarrationDiptychImagePromptContent,
  buildNarrationSceneImagePromptFromSentences,
  isNarrationMinimalStyle,
  SCENE_STYLE_GUARD,
  type NarrationScenePromptOptions,
} from '../constants/art-styles.js'

export type NarrationImageMode = 'new' | 'inherit' | 'copy'
export type NarrationShotType = 'title' | 'normal'
export type ParagraphLayout = 'single' | 'diptych'

export interface NarrationImageMeta {
  narration_image_mode: NarrationImageMode
  narration_image_source?: 'upload' | 'generate'
  narration_shot_type?: NarrationShotType
  narration_tts_mode?: 'new' | 'inherit' | 'copy'
  title_hook?: string
  title_full?: string
  /** 同场景多句旁白汇总后的主要内容，用于配图提示词 */
  scene_content?: string
  /** 配图段完整旁白句（与拆镜段落一致） */
  narration_lines?: string[]
  /** 配图专用：合并后的语义句（句号级），与分镜短句分离 */
  image_narration_lines?: string[]
  /** 内容段落序号（正文从 0 起） */
  paragraph_index?: number
  /** 段落配图版式：单图或两宫格 */
  paragraph_layout?: ParagraphLayout
  /** 文案空行分段序号（旁白分镜时写入，配图分镜用于换景检测） */
  script_paragraph_index?: number
  /** 正文分镜序号（旁白分镜时写入） */
  body_sentence_index?: number
  /** 配图文案来源：llm_raw=第二步纯LLM，optimized=第三步规则优化 */
  image_prompt_source?: 'llm_raw' | 'optimized' | 'upload' | 'manual'
  /** 第二步 LLM 原文备份，第三步优化前写入，用于还原 */
  image_prompt_llm_raw?: string
}

/**
 * 配图沿用规则：旁白仍在同一场景则沿用上一张；切换场景则需新配图。
 * - 片头标题：单独一张
 * - 正文首句：建立第一个场景画面
 * - 含场景/地点/时间跳转词：判定为换场景
 */
const SCENE_LOCATION_RE = /来到|走(进|向|出|到)|跑进|冲进|踏入|进入|离开|走出|返回|回到|抵达|赶到|路过|推开门|打开门|门外|屋里|屋内|室内|室外|房间里|大街上|办公楼|学校里|医院|酒吧|餐厅|厨房|卧室|客厅|阳台|天台|地铁|车站|机场|码头|山下|山上|河边|湖边|海边|森林|田野|另一处|另一边|对面|军营|营地|厂房|仓库|楼道|走廊|楼梯|电梯|车内|车外|窗外|街头|巷口|桥头|门口|办公室|教室|操场|停车场/
const SCENE_TIME_RE = /第二天|翌日|次日|多年后|数年后|几年后|几小时后|片刻后|清晨|黎明|黄昏|傍晚|夜里|深夜|天亮|小时候|闪回|回忆|镜头一转|画面一转|转场|切换/

export function sentenceNeedsOwnImage(sentence: string, index: number) {
  if (index === 0) return true
  return SCENE_LOCATION_RE.test(sentence) || SCENE_TIME_RE.test(sentence)
}

export function isNarrationStoryboard(sb: { referenceImages?: string | null }) {
  const raw = sb.referenceImages
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw)
    return parsed != null && typeof parsed === 'object' && 'narration_image_mode' in parsed
  } catch {
    return false
  }
}

export function parseNarrationImageMeta(referenceImages?: string | null): NarrationImageMeta {
  if (!referenceImages) return { narration_image_mode: 'inherit' }
  try {
    const parsed = JSON.parse(referenceImages)
    const mode = parsed?.narration_image_mode
    const shotType = parsed?.narration_shot_type
    return {
      narration_image_mode: mode === 'new' || mode === 'copy' || mode === 'inherit' ? mode : 'inherit',
      narration_image_source: parsed?.narration_image_source === 'upload' || parsed?.narration_image_source === 'generate'
        ? parsed.narration_image_source
        : undefined,
      narration_shot_type: shotType === 'title' ? 'title' : 'normal',
      narration_tts_mode: parsed?.narration_tts_mode === 'new' || parsed?.narration_tts_mode === 'copy' || parsed?.narration_tts_mode === 'inherit'
        ? parsed.narration_tts_mode
        : undefined,
      title_hook: parsed?.title_hook || undefined,
      title_full: parsed?.title_full || undefined,
      scene_content: parsed?.scene_content || undefined,
      narration_lines: Array.isArray(parsed?.narration_lines)
        ? parsed.narration_lines.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : undefined,
      image_narration_lines: Array.isArray(parsed?.image_narration_lines)
        ? parsed.image_narration_lines.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : undefined,
      paragraph_index: typeof parsed?.paragraph_index === 'number' ? parsed.paragraph_index : undefined,
      paragraph_layout: parsed?.paragraph_layout === 'diptych' ? 'diptych' : parsed?.paragraph_layout === 'single' ? 'single' : undefined,
      script_paragraph_index: typeof parsed?.script_paragraph_index === 'number' ? parsed.script_paragraph_index : undefined,
      body_sentence_index: typeof parsed?.body_sentence_index === 'number' ? parsed.body_sentence_index : undefined,
      image_prompt_source: parsed?.image_prompt_source === 'llm_raw'
        || parsed?.image_prompt_source === 'optimized'
        || parsed?.image_prompt_source === 'upload'
        || parsed?.image_prompt_source === 'manual'
        ? parsed.image_prompt_source
        : undefined,
      image_prompt_llm_raw: typeof parsed?.image_prompt_llm_raw === 'string' && parsed.image_prompt_llm_raw.trim()
        ? parsed.image_prompt_llm_raw.trim()
        : undefined,
    }
  } catch {}
  return { narration_image_mode: 'inherit' }
}

export function buildNarrationImageMeta(
  mode: NarrationImageMode,
  extra?: Partial<Omit<NarrationImageMeta, 'narration_image_mode'>>,
) {
  return JSON.stringify({
    narration_image_mode: mode,
    ...extra,
  })
}

/** 汇总同一场景多句旁白的主要视觉内容 */
export function summarizeSceneMainContent(sentences: string[]): string {
  const lines = sentences.map(s => s.trim()).filter(Boolean)
  if (!lines.length) return ''
  if (lines.length === 1) return lines[0]

  const first = lines[0]
  const middle = lines.slice(1, -1).join('，')
  const last = lines.length > 2 ? lines[lines.length - 1] : lines.slice(1).join('，')

  const parts = [first]
  if (middle) parts.push(middle)
  if (last && last !== middle) parts.push(last)

  const combined = parts.join('。').replace(/。+/g, '。').trim()
  if (combined.length <= 180) return combined
  return `${first}。${last}`.slice(0, 177) + '…'
}

/** 根据段落主要内容生成配图提示词 */
export function buildNarrationSceneImagePrompt(
  sentences: string[],
  style = 'comic',
  options?: NarrationScenePromptOptions,
): string {
  if (isNarrationMinimalStyle(style)) {
    return buildNarrationSceneImagePromptFromSentences(sentences, options)
  }
  const main = summarizeSceneMainContent(sentences)
  if (!main) return ''
  return [
    SCENE_STYLE_GUARD,
    'single full illustration, one complete scene only',
    'no grid, no collage, no multi-panel, no comic strip, no split screen, no storyboard layout',
    artStylePrompt(style, 'scene'),
    `illustrate the main visual of this scene based on narration: ${main}`,
    '16:9 landscape, high quality, no text, no watermark',
  ].join(', ')
}

/** 段落内容较多时用横向两宫格，仍算「一段一图」 */
export function buildNarrationDiptychImagePrompt(
  sentences: string[],
  style = 'comic',
  options?: NarrationScenePromptOptions,
): string {
  const mid = Math.max(1, Math.ceil(sentences.length / 2))
  const left = summarizeSceneMainContent(sentences.slice(0, mid))
  const right = summarizeSceneMainContent(sentences.slice(mid))
  if (!left && !right) return ''
  if (isNarrationMinimalStyle(style)) {
    return buildNarrationDiptychImagePromptContent(left || right, right || left, options)
  }
  return [
    SCENE_STYLE_GUARD,
    'single 16:9 illustration with exactly 2 horizontal panels side by side, diptych layout, one image file',
    'only left panel and right panel, no third panel, no vertical stack',
    artStylePrompt(style, 'diptych'),
    `left panel scene: ${left || right}`,
    `right panel scene: ${right || left}`,
    'high quality, no text, no watermark',
  ].join(', ')
}

export function buildParagraphImagePrompt(
  sentences: string[],
  layout: ParagraphLayout,
  style = 'comic',
  options?: NarrationScenePromptOptions,
): string {
  return layout === 'diptych'
    ? buildNarrationDiptychImagePrompt(sentences, style, options)
    : buildNarrationSceneImagePrompt(sentences, style, options)
}

export function isNarrationTitleShotMeta(meta: NarrationImageMeta) {
  return meta.narration_shot_type === 'title'
}

export function isStoryboardTitleShot(sb: { referenceImages?: string | null }) {
  return isNarrationTitleShotMeta(parseNarrationImageMeta(sb.referenceImages))
}

export function storyboardNeedsOwnImage(sb: {
  referenceImages?: string | null
  storyboardNumber?: number | null
}) {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  return meta.narration_image_mode === 'new'
}

type VisualSb = {
  id: number
  storyboardNumber: number
  referenceImages?: string | null
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
}

function compareStoryboardOrder(a: VisualSb, b: VisualSb) {
  if (a.storyboardNumber !== b.storyboardNumber) return a.storyboardNumber - b.storyboardNumber
  const ta = parseNarrationImageMeta(a.referenceImages).narration_shot_type === 'title' ? 0 : 1
  const tb = parseNarrationImageMeta(b.referenceImages).narration_shot_type === 'title' ? 0 : 1
  if (ta !== tb) return ta - tb
  return a.id - b.id
}

export function sortStoryboardsByOrder<T extends VisualSb>(storyboards: T[]) {
  return [...storyboards].sort(compareStoryboardOrder)
}

export function getStoryboardDirectVisual(sb: VisualSb) {
  if (sb.videoUrl) return { type: 'video' as const, path: sb.videoUrl, sourceId: sb.id }
  const image = sb.composedImage || sb.firstFrameImage
  if (image) return { type: 'image' as const, path: image, sourceId: sb.id }
  return null
}

export function resolveStoryboardVisualSource(storyboards: VisualSb[], storyboardId: number) {
  const ordered = sortStoryboardsByOrder(storyboards)
  const idx = ordered.findIndex(sb => sb.id === storyboardId)
  if (idx < 0) return null

  const sb = ordered[idx]
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const ownVisual = getStoryboardDirectVisual(sb)

  if (meta.narration_image_mode === 'new') {
    if (!ownVisual) return null
    return { ...ownVisual, inherited: false, inheritedFrom: null }
  }

  if (ownVisual && meta.narration_image_mode === 'copy') {
    for (let i = idx - 1; i >= 0; i--) {
      const prevVisual = getStoryboardDirectVisual(ordered[i])
      if (prevVisual) {
        return {
          ...ownVisual,
          inherited: true,
          inheritedFrom: ordered[i].id,
        }
      }
    }
    return { ...ownVisual, inherited: true, inheritedFrom: null }
  }

  for (let i = idx - 1; i >= 0; i--) {
    const prevMeta = parseNarrationImageMeta(ordered[i].referenceImages)
    if (prevMeta.narration_image_mode === 'new') {
      const visual = getStoryboardDirectVisual(ordered[i])
      if (!visual) return null
      return {
        ...visual,
        inherited: true,
        inheritedFrom: ordered[i].id,
      }
    }
  }

  return null
}
