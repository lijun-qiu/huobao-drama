import {
  artStylePrompt,
  mergeStoryboardLinesForImagePrompt,
  isNarrationMinimalStyle,
  isNarrationAnimeStyle,
  resolveNarrationImagePrompt,
  appendToNarrationBracket,
  NARRATION_USE_RAW_LLM_PROMPTS,
} from '~/composables/useArtStyles'

export type ProductionMode = 'drama' | 'narration' | 'motion_comic'

export function isNarrationLikeMode(mode: ProductionMode): boolean {
  return mode === 'narration' || mode === 'motion_comic'
}

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2'

export const DEFAULT_TEXT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_TEXT_THINKING = true
/** 剧本生成对话默认模型 */
export const DEFAULT_NARRATION_SCRIPT_CHAT_MODEL = 'qwen3.5-plus'
/** 解说模式：配图等文本 LLM 默认模型 */
export const DEFAULT_NARRATION_TEXT_MODEL = DEFAULT_NARRATION_SCRIPT_CHAT_MODEL

export const TEXT_MODEL_OPTIONS = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro · 默认（推理+Agent）' },
  { value: 'qwen3.5-plus', label: 'Qwen 3.5 Plus · 思考+VLM（4022）' },
  { value: 'gpt-4o', label: 'GPT-4o · OpenAI 兼容' },
] as const

export function resolveEpisodeTextModel(ep?: { text_model?: string | null; textModel?: string | null } | null) {
  const picked = String(ep?.text_model || ep?.textModel || '').trim()
  return picked || DEFAULT_TEXT_MODEL
}

export function resolveNarrationEpisodeTextModel(
  ep?: { text_model?: string | null; textModel?: string | null } | null,
) {
  const stored = String(ep?.text_model || ep?.textModel || '').trim()
  if (stored && stored !== DEFAULT_TEXT_MODEL) return stored
  return DEFAULT_NARRATION_TEXT_MODEL
}

export function resolveNarrationImageTextModel(
  ep?: { text_model?: string | null; textModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = String(bodyModel || '').trim()
  if (picked) return picked
  return resolveNarrationEpisodeTextModel(ep)
}

export function textModelSupportsThinking(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.includes('deepseek') || m.includes('qwen3.5') || m.includes('qwen-3.5')
}

export function textModelSupportsVision(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.includes('qwen3.5') || m.includes('qwen-3.5') || m.includes('gpt-4o')
}

export function resolveEpisodeTextThinking(
  ep?: { text_thinking?: boolean | number | null; textThinking?: boolean | number | null } | null,
  bodyValue?: boolean | number | string | null,
): boolean {
  if (bodyValue !== undefined && bodyValue !== null && bodyValue !== '') {
    if (bodyValue === false || bodyValue === 0 || bodyValue === '0') return false
    if (bodyValue === true || bodyValue === 1 || bodyValue === '1') return true
  }
  const stored = ep?.text_thinking ?? ep?.textThinking
  if (stored === false || stored === 0) return false
  if (stored === true || stored === 1) return true
  return DEFAULT_TEXT_THINKING
}

export const IMAGE_MODEL_OPTIONS = [
  { value: 'gpt-image-2', label: 'GPT Image 2 · ¥0.21/张（默认·文生图+参考图定妆）' },
  { value: 'qwen-image-edit-2509', label: 'Qwen Image Edit · ¥0.12/张（参考图定妆）' },
  { value: 'qwen-image-2.0-2026-03-03', label: 'Qwen Image 2.0 · ¥0.26/张（4022·参考图）' },
  { value: 'kling-v1-5', label: 'Kling V1.5 · ¥0.17/张（同脸 subject 参考）' },
  { value: 'kling-v1', label: 'Kling V1 · ¥0.0425/张（文生图+图生图，无 subject 参考）' },
  { value: 'kling-v2', label: 'Kling V2 · 文生图 ¥0.17 / 图生图 ¥0.34 / 多图 ¥0.68' },
  { value: 'kling-v2-new', label: 'Kling V2 New · 仅图生图 ¥0.34' },
  { value: 'kling-v2-1', label: 'Kling V2.1 · 文生图 ¥0.17（4022 部分账号无渠道）' },
  { value: 'kling-v3', label: 'Kling V3 · 4022 上新' },
  { value: 'doubao-seedream-3-0-t2i-250415', label: 'Seedream 3.0 · ¥0.10' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0 · ¥0.20' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image · ¥0.15/张' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview · ¥0.17/张' },
  { value: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image · ¥0.17/张' },
] as const

export const DEFAULT_BGM_MODEL = 'suno_music_open'

export const BGM_MODEL_OPTIONS = [
  { value: 'suno_music_open', label: 'Suno · 纯器乐（默认）' },
  { value: 'pixverse-sound-effect', label: 'PixVerse · 音效/环境音（需镜头视频）' },
  { value: 'chirp-v3-5', label: 'Suno chirp-v3-5' },
] as const

export function bgmModelLabel(model?: string | null): string {
  const hit = BGM_MODEL_OPTIONS.find(o => o.value === model)
  return hit?.label || String(model || DEFAULT_BGM_MODEL)
}

export function imageModelUnitPrice(model?: string | null): number {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
  if (m.startsWith('gpt-image')) return 0.21
  if (m === 'kling-v1') return 0.0425
  if (m === 'kling-v1-5') return 0.17
  if (m === 'kling-v2' || m === 'kling-v2-1' || m === 'kling-v3') return 0.17
  if (m === 'kling-v2-new') return 0.34
  if (m.startsWith('kling-')) return 0.0425
  if (m.includes('seedream-4-0') || m.includes('seedream-4-5')) return 0.20
  if (m.includes('seedream-5')) return 0.22
  if (m.includes('seedream-3') || m.includes('seedream')) return 0.10
  if (m === 'qwen-image-edit-2509') return 0.12
  if (m.startsWith('qwen-image')) return 0.26
  if (m.includes('gemini') && m.includes('image')) return m.includes('2.5') ? 0.15 : 0.17
  return 0.10
}

export function imageModelPriceLabel(model?: string | null): string {
  const price = imageModelUnitPrice(model)
  const m = String(model || DEFAULT_IMAGE_MODEL)
  if (m.startsWith('gpt-image')) return `GPT Image · ¥${price}/张`
  if (m.startsWith('kling-')) return `Kling 1k · ¥${price}/张`
  if (m.startsWith('qwen-image')) return `Qwen · ¥${price}/张`
  if (m.includes('seedream')) return `Seedream · ¥${price}/张`
  return `¥${price}/张`
}

export function resolveEpisodeImageModel(episode?: any) {
  return episode?.image_model || episode?.imageModel || DEFAULT_IMAGE_MODEL
}

export function imageModelSupportsReferenceImages(model?: string | null): boolean {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
  if (m.startsWith('gpt-image')) return true
  if (m === 'kling-v2-1') return false
  if (m === 'kling-v2-new') return true
  if (m.startsWith('kling-')) return true
  if (m.startsWith('qwen-image')) return true
  if (m.includes('gemini') && m.includes('image')) return true
  return false
}

export function imageModelMaxReferenceImages(model?: string | null): number {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
  if (m.startsWith('gpt-image')) return 4
  if (m.startsWith('kling-')) return 1
  if (m.startsWith('qwen-image')) return 3
  return 4
}

export function parseProductionMode(drama: any): ProductionMode {
  if (!drama) return 'drama'
  let meta = drama.metadata
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) } catch { meta = null }
  }
  if (meta?.production_mode === 'narration') return 'narration'
  if (meta?.production_mode === 'motion_comic') return 'motion_comic'
  return 'drama'
}

export function parseDramaMetadata(drama: any) {
  if (!drama?.metadata) return {}
  if (typeof drama.metadata === 'object') return drama.metadata
  try { return JSON.parse(drama.metadata) } catch { return {} }
}

export function narrationStoryboardPrompt(style = 'comic') {
  const styleHint = isNarrationMinimalStyle(style)
    ? `${NARRATION_IMAGE_STYLE_CORE}。圆头直径全片锁定画面高12%；人生阶段按阶段表锁定总高与躯干宽高，只写动作姿态。`
    : `${artStylePrompt(style, 'agent')}。`
  return [
    '这是旁白解说视频，必须按「一句旁白 = 一个镜头」拆分，严禁把多句旁白合并到同一镜头。',
    '以句号、问号、感叹号或换行作为分镜边界；逗号/顿号/分号处仅当相邻两句合计超过 16 字才拆镜，否则合并。',
    '所有 dialogue 统一写为「旁白：单句内容」，每镜 dialogue 只能有一句旁白。',
    `image_prompt 必须是单张完整插画，描述该场景段落的「主要视觉画面」（综合同场景全部旁白，不要只写首句），画风要求：${styleHint}`,
    '严禁在 image_prompt 中出现 grid、panel、宫格、分格、多格、collage、split、strip 等词。',
    '严禁描写斩首、尸体、血迹等暴力血腥画面；涉及刑案/处决时改写为牢狱候审、押解待审、公堂问讯等温和情节。',
    '严禁暴力词单词替换残留（如倒地的…牢狱候审、刀架脖颈、地面血迹）；六维须整句重写为通顺温和画面。',
    '不要填写 video_prompt，duration 按该句旁白字数估算（约 4 字/秒）。',
    '完成后调用 save_storyboards 保存。',
  ].join('')
}

export function extractNarrationSentence(sb: any): string {
  const dialogue = String(sb?.dialogue || '').trim()
  if (dialogue) {
    const pure = dialogue
      .replace(/^旁白[:：]\s*/, '')
      .replace(/^剧中[:：]\s*/, '')
      .trim()
    if (pure) return pure
  }
  return String(sb?.description || sb?.title || sb?.image_prompt || sb?.imagePrompt || '').trim()
}

export type NarrationImageMode = 'new' | 'inherit' | 'copy'
export type NarrationShotType = 'title' | 'normal'

export interface NarrationImageMeta {
  narration_image_mode: NarrationImageMode
  narration_image_source?: 'upload' | 'generate'
  narration_shot_type?: NarrationShotType
  narration_tts_mode?: 'new' | 'inherit' | 'copy'
  title_hook?: string
  title_full?: string
  scene_content?: string
  narration_lines?: string[]
  image_narration_lines?: string[]
  paragraph_index?: number
  paragraph_layout?: 'single' | 'diptych'
  script_paragraph_index?: number
  body_sentence_index?: number
  image_prompt_source?: 'llm_raw' | 'optimized' | 'upload' | 'manual'
  image_prompt_llm_raw?: string
  subtitle_narration?: string
}

export function isNarrationStoryboard(sb: any) {
  const raw = sb?.reference_images || sb?.referenceImages
  if (!raw) return false
  try {
    const parsed = typeof raw === 'object' ? raw : JSON.parse(raw)
    return parsed != null && typeof parsed === 'object' && 'narration_image_mode' in parsed
  } catch {
    return false
  }
}

export function parseNarrationImageMeta(sb: any): NarrationImageMeta {
  const raw = sb?.reference_images || sb?.referenceImages
  if (!raw) return { narration_image_mode: 'inherit' }
  if (typeof raw === 'object') {
    return {
      narration_image_mode: raw.narration_image_mode || 'inherit',
      narration_image_source: raw.narration_image_source === 'upload' || raw.narration_image_source === 'generate'
        ? raw.narration_image_source
        : undefined,
      narration_shot_type: raw.narration_shot_type === 'title' ? 'title' : 'normal',
      narration_tts_mode: raw.narration_tts_mode,
      title_hook: raw.title_hook,
      title_full: raw.title_full,
      scene_content: raw.scene_content,
      narration_lines: Array.isArray(raw.narration_lines)
        ? raw.narration_lines.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : undefined,
      image_narration_lines: Array.isArray(raw.image_narration_lines)
        ? raw.image_narration_lines.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : undefined,
      paragraph_index: typeof raw.paragraph_index === 'number' ? raw.paragraph_index : undefined,
      paragraph_layout: raw.paragraph_layout === 'diptych' ? 'diptych' : raw.paragraph_layout === 'single' ? 'single' : undefined,
      script_paragraph_index: typeof raw.script_paragraph_index === 'number' ? raw.script_paragraph_index : undefined,
      body_sentence_index: typeof raw.body_sentence_index === 'number' ? raw.body_sentence_index : undefined,
      image_prompt_source: raw.image_prompt_source === 'llm_raw'
        || raw.image_prompt_source === 'optimized'
        || raw.image_prompt_source === 'upload'
        || raw.image_prompt_source === 'manual'
        ? raw.image_prompt_source
        : undefined,
      image_prompt_llm_raw: typeof raw.image_prompt_llm_raw === 'string' && raw.image_prompt_llm_raw.trim()
        ? raw.image_prompt_llm_raw.trim()
        : undefined,
      subtitle_narration: typeof raw.subtitle_narration === 'string' && raw.subtitle_narration.trim()
        ? raw.subtitle_narration.trim()
        : undefined,
    }
  }
  try {
    const parsed = JSON.parse(raw)
    const mode = parsed?.narration_image_mode
    return {
      narration_image_mode: mode === 'new' || mode === 'copy' || mode === 'inherit' ? mode : 'inherit',
      narration_image_source: parsed?.narration_image_source === 'upload' || parsed?.narration_image_source === 'generate'
        ? parsed.narration_image_source
        : undefined,
      narration_shot_type: parsed?.narration_shot_type === 'title' ? 'title' : 'normal',
      narration_tts_mode: parsed?.narration_tts_mode,
      title_hook: parsed?.title_hook,
      title_full: parsed?.title_full,
      scene_content: parsed?.scene_content,
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
      subtitle_narration: typeof parsed?.subtitle_narration === 'string' && parsed.subtitle_narration.trim()
        ? parsed.subtitle_narration.trim()
        : undefined,
    }
  } catch {}
  return { narration_image_mode: 'inherit' }
}

/** 是否已写入配图换镜检测结果（① 检测配图） */
export function storyboardHasImageDetectMarks(meta: NarrationImageMeta): boolean {
  return typeof meta.paragraph_index === 'number'
    || !!meta.scene_content
    || (meta.narration_lines?.length ?? 0) > 0
    || (meta.image_narration_lines?.length ?? 0) > 0
    || (meta.narration_image_mode === 'new' && !meta.narration_image_source)
}

export function narrationImageDetectAnchorCount(storyboards: any[]) {
  return storyboards.filter(sb => storyboardHasImageDetectMarks(parseNarrationImageMeta(sb))).length
}

export function isNarrationTitleShot(sb: any) {
  const meta = parseNarrationImageMeta(sb)
  if (meta.narration_shot_type === 'title') return true
  if (meta.title_full) return true
  return false
}

/** 稳定排序：先镜号，同号时片头镜优先，再按 id */
export function compareStoryboardOrder(a: any, b: any) {
  const na = a.storyboard_number || a.storyboardNumber || 0
  const nb = b.storyboard_number || b.storyboardNumber || 0
  if (na !== nb) return na - nb
  const ta = isNarrationTitleShot(a) ? 0 : 1
  const tb = isNarrationTitleShot(b) ? 0 : 1
  if (ta !== tb) return ta - tb
  return (a.id || 0) - (b.id || 0)
}

export function sortStoryboards(list: any[]) {
  return [...list].sort(compareStoryboardOrder)
}

/** 合成/合并分组用：与后端 resolveStoryboardVisualSource 的 key 对齐 */
export function getStoryboardComposeVisualKey(sb: any, storyboards: any[], ordered = sortStoryboards(storyboards)) {
  if (sb?.video_url || sb?.videoUrl) return `video:${sb.video_url || sb.videoUrl}`
  const ownImage = sb?.composed_image || sb?.composedImage || sb?.first_frame_image || sb?.firstFrameImage
  if (ownImage) return `image:${ownImage}`
  const effective = resolveNarrationEffectiveImage(storyboards, sb, ordered)
  if (effective.path) return `image:${effective.path}`
  return `none:${sb.id}`
}

export function buildComposeVisualGroups(storyboards: any[]) {
  const ordered = sortStoryboards(storyboards)
  if (!ordered.length) return [] as { start: number; end: number }[]

  const groups: { start: number; end: number }[] = []
  let groupStart = 0
  let prevKey = getStoryboardComposeVisualKey(ordered[0], ordered)
  for (let i = 1; i < ordered.length; i++) {
    const currKey = getStoryboardComposeVisualKey(ordered[i], ordered)
    if (currKey !== prevKey) {
      groups.push({ start: groupStart, end: i - 1 })
      groupStart = i
      prevKey = currKey
    }
  }
  groups.push({ start: groupStart, end: ordered.length - 1 })
  return groups
}

/** 配图锚点镜：本镜为 new，或向前找到最近的 new 锚点（与 inherit 链对齐） */
export function resolveNarrationImageAnchorShot(storyboards: any[], sb: any, ordered = sortStoryboards(storyboards)) {
  const idx = ordered.findIndex(item => item.id === sb.id)
  if (idx < 0) return sb
  for (let i = idx; i >= 0; i--) {
    const meta = parseNarrationImageMeta(ordered[i])
    if (meta.narration_image_mode === 'new') return ordered[i]
  }
  return sb
}

/** 合成单元（检测配图 paragraph 或分镜同图继承，与后端 buildComposeUnitGroups 对齐） */
export function resolveComposeUnitKey(sb: any, storyboards: any[], ordered = sortStoryboards(storyboards)) {
  const anchor = resolveNarrationImageAnchorShot(storyboards, sb, ordered)
  const meta = parseNarrationImageMeta(anchor)
  if (typeof meta.paragraph_index === 'number') {
    return `para:${meta.paragraph_index}`
  }
  return getStoryboardComposeVisualKey(sb, ordered)
}

export function buildComposeUnitGroups(storyboards: any[]) {
  const ordered = sortStoryboards(storyboards)
  const body = ordered.filter(sb => !isNarrationTitleShot(sb))
  const groups: { key: string; members: any[]; startIdx: number }[] = []
  let currentKey: string | null = null
  let members: any[] = []
  let startIdx = 0

  for (let i = 0; i < body.length; i++) {
    const sb = body[i]
    const key = resolveComposeUnitKey(sb, ordered)
    if (currentKey === null || key !== currentKey) {
      if (members.length && currentKey != null) {
        groups.push({ key: currentKey, members, startIdx })
      }
      currentKey = key
      members = [sb]
      startIdx = i
    } else {
      members.push(sb)
    }
  }
  if (members.length && currentKey != null) {
    groups.push({ key: currentKey, members, startIdx })
  }
  return groups
}

/** @deprecated 别名 */
export const buildParagraphComposeGroups = buildComposeUnitGroups

export function getParagraphComposeMembers(
  sb: any,
  storyboards: any[],
  groups?: { members: any[] }[],
) {
  return resolveParagraphComposeMembers(sb, groups ?? buildComposeUnitGroups(storyboards))
}

export function resolveParagraphComposeMembers(
  sb: any,
  groups: { members: any[] }[],
) {
  const group = groups.find(g => g.members.some(m => m.id === sb.id))
  return group?.members ?? [sb]
}

/** 合成烧录字幕（与后端 resolveStoryboardSubtitleNarration 对齐） */
export function resolveStoryboardSubtitleNarration(sb: any): string {
  const meta = parseNarrationImageMeta(sb)
  const stored = String(meta.subtitle_narration || '').trim()
  if (stored) return stored
  return extractNarrationSentence(sb)
}

export function stripSubtitleEmphasis(text: string): string {
  return String(text || '').replace(/\*\*/g, '').trim()
}

/** 多镜合并配音：句间加逗号，给 TTS 自然停顿提示 */
export function joinNarrationTtsParts(parts: string[]): string {
  return parts
    .map(s => stripSubtitleEmphasis(s))
    .filter(Boolean)
    .map(s => s.replace(/[，,、；;。！？!?…—\-~～\s]+$/g, '').trim())
    .filter(Boolean)
    .join('，')
}

export function estimateStoryboardDurationSec(sb: any): number {
  const stored = Number(sb?.duration)
  if (Number.isFinite(stored) && stored > 0) return stored
  const text = resolveStoryboardSubtitleNarration(sb)
  const chars = text.replace(/\s/g, '').length
  if (isNarrationTitleShot(sb)) return Math.max(6, Math.min(12, Math.ceil(chars / 3.5)))
  return Math.max(3, Math.min(12, Math.ceil(chars / 4.5)))
}

export type ComposeUnitSubtitleLine = {
  index: number
  shotNo: string
  displayText: string
  startSec: number
  endSec: number
  durationSec: number
}

/** 合成单元内各句字幕与时间轴（与 group compose 顺序一致） */
export function buildComposeUnitSubtitleLines(members: any[]): ComposeUnitSubtitleLine[] {
  let offsetSec = 0
  const lines: ComposeUnitSubtitleLine[] = []
  for (let idx = 0; idx < members.length; idx++) {
    const member = members[idx]
    const marked = resolveStoryboardSubtitleNarration(member)
    const displayText = stripSubtitleEmphasis(marked)
    if (!displayText) continue
    const stored = Number(member?.duration)
    const durationSec = Number.isFinite(stored) && stored > 0
      ? stored
      : estimateStoryboardDurationSec(member)
    const startSec = offsetSec
    const endSec = offsetSec + durationSec
    lines.push({
      index: lines.length + 1,
      shotNo: getNarrationShotDisplayNo(member),
      displayText,
      startSec,
      endSec,
      durationSec,
    })
    offsetSec = endSec
  }
  return lines
}

export function getComposeUnitSubtitleLines(
  sb: any,
  storyboards: any[],
  groups?: { members: any[] }[],
): ComposeUnitSubtitleLine[] {
  return buildComposeUnitSubtitleLines(getParagraphComposeMembers(sb, storyboards, groups))
}

export function getComposeUnitTotalDurationSec(
  sb: any,
  storyboards: any[],
  groups?: { members: any[] }[],
): number {
  const lines = getComposeUnitSubtitleLines(sb, storyboards, groups)
  if (!lines.length) return estimateStoryboardDurationSec(sb)
  return lines[lines.length - 1].endSec
}

export function formatComposeTimecode(sec: number): string {
  const s = Math.max(0, sec)
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}

export function formatComposeUnitDuration(
  sb: any,
  storyboards: any[],
  groups?: { members: any[] }[],
): string {
  return formatComposeTimecode(getComposeUnitTotalDurationSec(sb, storyboards, groups))
}

export function getComposeUnitShotRangeLabel(sb: any, storyboards: any[]): string {
  const members = getParagraphComposeMembers(sb, storyboards)
  if (!members.length) return '#??'
  if (members.length <= 1) return `#${getNarrationShotDisplayNo(members[0])}`
  return `#${getNarrationShotDisplayNo(members[0])}-#${getNarrationShotDisplayNo(members[members.length - 1])}`
}

export function getComposeUnitMergedTtsText(sb: any, storyboards: any[]): string {
  const members = getParagraphComposeMembers(sb, storyboards)
  const parts = members
    .map((member: any) => extractNarrationSentence(member))
    .filter(Boolean)
  if (!parts.length) return stripSubtitleEmphasis(resolveStoryboardSubtitleNarration(sb))
  return joinNarrationTtsParts(parts)
}

/** 配音列表：片头 + 正文每句一镜（按句配音，合成时再拼段落） */
export function listNarrationTtsUnits(storyboards: any[]) {
  const ordered = sortStoryboards(storyboards)
  return ordered.filter(sb => String(sb?.dialogue || '').trim())
}

export type NarrationTtsUnitViewItem = {
  sb: any
  subtitleLines: ComposeUnitSubtitleLine[]
  shotRangeLabel: string
  durationLabel: string
  mergedText: string
  ready: boolean
  statusLabel: string
  lineCount: number
}

/** 配音页卡片视图：一次 buildComposeUnitGroups，避免模板内重复 O(n²) 计算 */
export function buildNarrationTtsUnitViews(storyboards: any[]): NarrationTtsUnitViewItem[] {
  const groups = buildComposeUnitGroups(storyboards)
  const leaderIds = new Set(
    groups
      .map(g => g.members[0])
      .filter(leader => {
        if (!isComposeScopeStoryboard(leader, storyboards)) return false
        const anchor = resolveNarrationImageAnchorShot(storyboards, leader)
        return !isNarrationTitleShot(anchor)
      })
      .map(leader => leader.id),
  )
  const ordered = sortStoryboards(storyboards)
  const units = ordered.filter(sb => {
    const dialogue = String(sb?.dialogue || '').trim()
    if (!dialogue) return false
    if (isNarrationTitleShot(sb)) return true
    return leaderIds.has(sb.id)
  })

  return units.map(sb => {
    const members = isNarrationTitleShot(sb) ? [sb] : resolveParagraphComposeMembers(sb, groups)
    const subtitleLines = buildComposeUnitSubtitleLines(members)
    const mergedText = subtitleLines.length
      ? joinNarrationTtsParts(subtitleLines.map(line => line.displayText))
      : stripSubtitleEmphasis(resolveStoryboardSubtitleNarration(sb))

    let shotRangeLabel: string
    if (isNarrationTitleShot(sb)) {
      shotRangeLabel = `#${getNarrationShotDisplayNo(sb)}`
    } else if (!members.length) {
      shotRangeLabel = '#??'
    } else if (members.length <= 1) {
      shotRangeLabel = `#${getNarrationShotDisplayNo(members[0])}`
    } else {
      shotRangeLabel = `#${getNarrationShotDisplayNo(members[0])}-#${getNarrationShotDisplayNo(members[members.length - 1])}`
    }

    const totalSec = subtitleLines.length
      ? subtitleLines[subtitleLines.length - 1].endSec
      : estimateStoryboardDurationSec(sb)
    const ready = members.every(member => hasNarrationShotOwnTts(member))
    const pendingCount = members.filter(member => !hasNarrationShotOwnTts(member)).length
    const statusLabel = ready
      ? '已就绪'
      : (members.length > 1 ? `待生成 ${pendingCount}/${members.length} 句` : '待生成')

    return {
      sb,
      subtitleLines,
      shotRangeLabel,
      durationLabel: formatComposeTimecode(totalSec),
      mergedText,
      ready,
      statusLabel,
      lineCount: subtitleLines.length || 1,
    }
  })
}

export function isNarrationTtsUnitLeader(sb: any, storyboards: any[]) {
  if (isNarrationTitleShot(sb)) return true
  return getComposeUnitLeaders(storyboards).some(leader => leader.id === sb.id)
}

export function narrationTtsUnitReady(storyboards: any[], sb: any) {
  const members = isNarrationTitleShot(sb)
    ? [sb]
    : getParagraphComposeMembers(sb, storyboards)
  return members.every(member => hasEffectiveNarrationTts(storyboards, member))
}

/** 镜头合成/导出：每个配图单元取代表镜（不含片头） */
export function getComposeUnitLeaders(
  storyboards: any[],
  groups?: { key: string; members: any[]; startIdx: number }[],
) {
  const unitGroups = groups ?? buildComposeUnitGroups(storyboards)
  const ordered = sortStoryboards(storyboards)
  return unitGroups
    .map(g => g.members[0])
    .filter(leader => {
      if (!isComposeScopeStoryboard(leader, storyboards)) return false
      const anchor = resolveNarrationImageAnchorShot(storyboards, leader, ordered)
      return !isNarrationTitleShot(anchor)
    })
}

/** 镜头合成列表：每个合成单元只显示代表镜 */
export function isParagraphComposeLeader(sb: any, storyboards: any[]) {
  return getComposeUnitLeaders(storyboards).some(leader => leader.id === sb.id)
}

/** 批量合成 scope：命中合成单元时纳入单元内全部镜头 */
export function collectComposeScopeStoryboardIds(targets: any[], storyboards: any[]): number[] {
  const ordered = sortStoryboards(storyboards)
  const scopeIds = new Set<number>()
  const groups = buildComposeUnitGroups(ordered)
  for (const sb of targets) {
    scopeIds.add(sb.id)
    const group = groups.find(g => g.members.some(m => m.id === sb.id))
    if (group && group.members.length > 1) {
      group.members.forEach(m => scopeIds.add(m.id))
    }
  }
  return [...scopeIds]
}

/** 与后端 compose-status 的 composable 口径一致（不含片头） */
export function isComposableStoryboard(sb: any, storyboards: any[]) {
  if (sb?.video_url || sb?.videoUrl) return true
  if (String(sb?.dialogue || '').trim()) return true
  if (sb?.composed_image || sb?.composedImage || sb?.first_frame_image || sb?.firstFrameImage) return true
  return !!resolveNarrationEffectiveImage(storyboards, sb).path
}

/** 镜头合成列表/批量：正文镜，片头在导出页单独处理 */
export function isComposeScopeStoryboard(sb: any, storyboards: any[]) {
  if (isNarrationTitleShot(sb)) return false
  return isComposableStoryboard(sb, storyboards)
}

export function getComposedVideoUrl(sb: any) {
  return sb?.composed_video_url || sb?.composedVideoUrl || null
}

export function resolveComposedVideoUrlForShot(sb: any, storyboards: any[]) {
  const own = getComposedVideoUrl(sb)
  if (own) return own
  for (const member of getParagraphComposeMembers(sb, storyboards)) {
    const url = getComposedVideoUrl(member)
    if (url) return url
  }
  return null
}

export function hasComposedStoryboard(
  sb: any,
  storyboards?: any[],
  groups?: { members: any[] }[],
) {
  if (getComposedVideoUrl(sb)) return true
  if (!storyboards?.length) return false
  return getParagraphComposeMembers(sb, storyboards, groups).some(m => !!getComposedVideoUrl(m))
}

/** 批量合成：每个配图段只触发一次 */
export function pickVisualGroupComposeLeaders(targets: any[], storyboards: any[]) {
  const ordered = sortStoryboards(storyboards)
  const targetIds = new Set(targets.map(sb => sb.id))
  const groups = buildComposeUnitGroups(ordered)
  const seenKeys = new Set<string>()
  const leaders: any[] = []

  for (const group of groups) {
    if (!group.members.some(m => targetIds.has(m.id))) continue
    if (seenKeys.has(group.key)) continue
    seenKeys.add(group.key)
    const leaderMember = group.members[0]
    const leader = targets.find(t => t.id === leaderMember.id)
      ?? targets.find(t => group.members.some(m => m.id === t.id))
    if (leader) leaders.push(leader)
  }

  for (const t of targets) {
    if (leaders.some(l => l.id === t.id)) continue
    const group = groups.find(g => g.members.some(m => m.id === t.id))
    if (!group || group.members.length <= 1) leaders.push(t)
  }

  return leaders
}

/** 收集当前镜头之前的全部旁白句，供配图【剧情】全文连贯 */
export function collectPriorNarrationLines(storyboards: any[], currentSb: any): string[] {
  const ordered = sortStoryboards(storyboards)
  const idx = ordered.findIndex(sb => sb.id === currentSb.id)
  if (idx <= 0) return []
  const prior: string[] = []
  for (let i = 0; i < idx; i++) {
    const line = extractNarrationSentence(ordered[i]).trim()
    if (line) prior.push(line)
  }
  return prior
}

export function hasDuplicateStoryboardNumbers(list: any[]) {
  const seen = new Set<number>()
  for (const sb of list) {
    const n = sb.storyboard_number ?? sb.storyboardNumber
    if (n == null) continue
    if (seen.has(n)) return true
    seen.add(n)
  }
  return false
}

export function narrationShotNeedsOwnImage(sb: any) {
  const meta = parseNarrationImageMeta(sb)
  if (meta.narration_image_mode === 'new') return true
  const n = Number(sb?.storyboard_number ?? sb?.storyboardNumber)
  if (meta.narration_shot_type === 'title' && n === 1) return true
  return false
}

export function resolveNarrationParagraphLayout(sb: any): 'single' | 'diptych' {
  const meta = parseNarrationImageMeta(sb)
  return meta.paragraph_layout === 'diptych' ? 'diptych' : 'single'
}

export function getNarrationShotOwnImage(sb: any) {
  return sb?.composed_image || sb?.composedImage || null
}

export function resolveNarrationEffectiveImage(storyboards: any[], sb: any, ordered = sortStoryboards(storyboards)) {
  const idx = ordered.findIndex(item => item.id === sb.id)
  if (idx < 0) return { path: null, inherited: false, sourceId: null }

  const meta = parseNarrationImageMeta(sb)
  const own = getNarrationShotOwnImage(sb)

  if (meta.narration_image_mode === 'new') {
    return { path: own, inherited: false, sourceId: own ? sb.id : null }
  }

  if (own && meta.narration_image_mode === 'copy') {
    for (let i = idx - 1; i >= 0; i--) {
      const prevPath = getNarrationShotOwnImage(ordered[i])
      if (prevPath) {
        return { path: own, inherited: true, sourceId: ordered[i].id }
      }
    }
    return { path: own, inherited: true, sourceId: null }
  }

  for (let i = idx - 1; i >= 0; i--) {
    const prevMeta = parseNarrationImageMeta(ordered[i])
    if (prevMeta.narration_image_mode === 'new') {
      const path = getNarrationShotOwnImage(ordered[i])
      return {
        path,
        inherited: !!path,
        sourceId: path ? ordered[i].id : null,
      }
    }
  }

  return { path: null, inherited: false, sourceId: null }
}

export function narrationShotsWithUploadedImage(storyboards: any[]) {
  return sortStoryboards(storyboards).filter(sb => {
    if (!getNarrationShotOwnImage(sb)) return false
    return parseNarrationImageMeta(sb).narration_image_source === 'upload'
  })
}

export function resolveSceneContentForShot(storyboards: any[], sb: any): string {
  const ordered = sortStoryboards(storyboards)
  const idx = ordered.findIndex(item => item.id === sb.id)
  if (idx < 0) return extractNarrationSentence(sb)

  const sentences = [extractNarrationSentence(sb)].filter(Boolean)
  for (let i = idx + 1; i < ordered.length; i++) {
    const meta = parseNarrationImageMeta(ordered[i])
    if (meta.narration_image_mode === 'new') break
    const line = extractNarrationSentence(ordered[i])
    if (line) sentences.push(line)
  }
  if (sentences.length <= 1) return sentences[0] || ''
  const first = sentences[0]
  const last = sentences[sentences.length - 1]
  if (sentences.length === 2) return `${first}。${last}`
  return `${first}。${sentences.slice(1, -1).join('，')}。${last}`
}

/** 配图模块展示用：优先 scene_content / narration_lines，完整旁白不截断 */
export function getNarrationShotDisplayText(sb: any, storyboards?: any[]): string {
  const meta = parseNarrationImageMeta(sb)
  const scene = String(meta.scene_content || '').trim()
  if (scene) return scene
  const lines = meta.image_narration_lines?.length
    ? meta.image_narration_lines
    : meta.narration_lines?.length
      ? meta.narration_lines
      : null
  if (lines?.length) return lines.join('\n')
  if (storyboards?.length && meta.narration_image_mode === 'new') {
    const resolved = resolveSceneContentForShot(storyboards, sb).trim()
    if (resolved) return resolved
  }
  return extractNarrationSentence(sb)
}

export function collectBodyNarrationLines(storyboards: any[]): string[] {
  return sortStoryboards(storyboards)
    .filter(sb => !isNarrationTitleShot(sb))
    .map(sb => extractNarrationSentence(sb).trim())
    .filter(Boolean)
}

export function collectBodyNarrationLineIndex(storyboards: any[], currentSb: any): number {
  const ordered = sortStoryboards(storyboards).filter(sb => !isNarrationTitleShot(sb))
  return ordered.findIndex(sb => sb.id === currentSb.id)
}

export function buildNarrationImagePrompt(sb: any, style = 'comic', allSbs?: any[]) {
  if (!narrationShotNeedsOwnImage(sb)) return ''
  const storedPrompt = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  if (!storedPrompt) return ''
  const fullNarrationLines = allSbs?.length ? collectBodyNarrationLines(allSbs) : []
  const bodyIndex = allSbs?.length ? collectBodyNarrationLineIndex(allSbs, sb) : -1
  const meta = parseNarrationImageMeta(sb)
  if (meta.image_prompt_source === 'llm_raw' || meta.image_prompt_source === 'optimized') {
    return storedPrompt
  }
  const sceneContent = meta.scene_content || extractNarrationSentence(sb)
  const narrationLines = meta.image_narration_lines?.length
    ? meta.image_narration_lines
    : meta.narration_lines?.length
      ? mergeStoryboardLinesForImagePrompt(meta.narration_lines)
      : sceneContent
        ? mergeStoryboardLinesForImagePrompt(sceneContent.split(/[。！？]+/).map(s => s.trim()).filter(Boolean))
        : [extractNarrationSentence(sb)].map(s => s.trim()).filter(Boolean)
  return resolveNarrationImagePrompt(storedPrompt, style, {
    narrationLines,
    fullNarrationLines,
    timelineUpToIndex: bodyIndex > 0 ? bodyIndex : undefined,
  })
}

export function isNarratorCharacter(char: any) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

export function getVisualCharacters(chars: any[]) {
  return (chars || []).filter(ch => !isNarratorCharacter(ch))
}

export function normalizeVariantLabel(label?: string | null) {
  const raw = String(label || '').trim()
  if (!raw || raw === '常态' || raw === '默认') return ''
  return raw
}

export type VariantAgeGroup = 'youth' | 'child' | 'middle' | 'elder' | 'default' | 'other'

export function getVariantAgeGroup(label?: string | null): VariantAgeGroup {
  const l = normalizeVariantLabel(label)
  if (!l) return 'default'
  if (/童年|幼年|儿时|孩童|幼童/.test(l)) return 'child'
  if (/青年|少年|年轻/.test(l)) return 'youth'
  if (/中年/.test(l)) return 'middle'
  if (/老年|晚年|垂暮|苍老|年迈/.test(l)) return 'elder'
  return 'other'
}

export function variantNeedsYouthPortraitReference(label?: string | null) {
  const group = getVariantAgeGroup(label)
  return group === 'middle' || group === 'elder'
}

export function variantPortraitSortOrder(label?: string | null) {
  const order: Record<VariantAgeGroup, number> = {
    default: 0,
    youth: 1,
    child: 2,
    other: 3,
    middle: 4,
    elder: 5,
  }
  return order[getVariantAgeGroup(label)]
}

export function findYouthBaseCharacter(chars: any[], char: { id?: number; name?: string | null }) {
  const name = String(char?.name || '').trim()
  if (!name) return null
  const siblings = (chars || []).filter(ch => ch.id !== char.id && String(ch.name || '').trim() === name)
  const withImage = (list: any[]) => list.find(ch => ch?.image_url || ch?.imageUrl) || null
  const youthHit = withImage(siblings.filter(ch => getVariantAgeGroup(ch.variant_label || ch.variantLabel) === 'youth'))
  if (youthHit) return youthHit
  return withImage(siblings.filter(ch => getVariantAgeGroup(ch.variant_label || ch.variantLabel) === 'default'))
}

function portraitReferencePriority(targetGroup: VariantAgeGroup): VariantAgeGroup[] {
  switch (targetGroup) {
    case 'elder':
      return ['middle', 'youth', 'default', 'child', 'other']
    case 'middle':
      return ['youth', 'default', 'elder', 'child', 'other']
    case 'youth':
      return ['default', 'child', 'middle', 'elder', 'other']
    case 'child':
      return ['default', 'youth', 'middle', 'other', 'elder']
    default:
      return ['youth', 'default', 'middle', 'child', 'elder', 'other']
  }
}

export function findPortraitReferenceCharacter(
  chars: any[],
  char: { id?: number; name?: string | null; variant_label?: string | null; variantLabel?: string | null },
) {
  const name = String(char?.name || '').trim()
  if (!name) return null
  const siblings = (chars || []).filter(ch => ch.id !== char.id && String(ch.name || '').trim() === name)
  const withImage = (list: any[]) => list.find(ch => ch?.image_url || ch?.imageUrl) || null
  const targetGroup = getVariantAgeGroup(char.variant_label || char.variantLabel)
  for (const group of portraitReferencePriority(targetGroup)) {
    const hit = withImage(siblings.filter(ch => getVariantAgeGroup(ch.variant_label || ch.variantLabel) === group))
    if (hit) return hit
  }
  return withImage(siblings)
}

/** 跨角色画风锚定：取同项目已有定妆（优先青年形态） */
export function findDramaStyleAnchorCharacter(
  chars: any[],
  char: { id?: number },
) {
  const candidates = (chars || [])
    .filter(ch => ch.id !== char.id && (ch?.image_url || ch?.imageUrl))
    .sort((a, b) => {
      const byStage = variantPortraitSortOrder(a.variant_label || a.variantLabel) - variantPortraitSortOrder(b.variant_label || b.variantLabel)
      if (byStage !== 0) return byStage
      return Number(a.id || 0) - Number(b.id || 0)
    })
  return candidates[0] || null
}

export function sortCharactersForPortraitGeneration(chars: any[]) {
  return [...(chars || [])].sort((a, b) => {
    const byStage = variantPortraitSortOrder(a.variant_label || a.variantLabel) - variantPortraitSortOrder(b.variant_label || b.variantLabel)
    if (byStage !== 0) return byStage
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  })
}

export function formatCharacterDisplayName(char: { name?: string | null; variantLabel?: string | null; variant_label?: string | null }) {
  const name = String(char?.name || '').trim()
  const label = normalizeVariantLabel(char?.variantLabel ?? char?.variant_label)
  return label ? `${name} · ${label}` : name
}

export function getStoryboardCharacterIdsFromShot(sb: any) {
  return sb?.character_ids || sb?.characterIds || []
}

export function enrichNarrationPromptWithCharacters(
  prompt: string,
  chars: any[],
  characterIds: number[],
  style = 'comic',
) {
  const base = String(prompt || '').trim()
  if (!base) return base
  if (NARRATION_USE_RAW_LLM_PROMPTS) return base
  const relevant = chars.filter(ch => characterIds.includes(ch.id))
  if (!relevant.length) return base
  if (isNarrationMinimalStyle(style)) {
    const names = relevant.map(ch => formatCharacterDisplayName(ch)).join('、')
    const addition = `场景中出现素体小人角色：${names}，仅通过动作姿态区分，不写服装细节`
    if (/【左格/.test(base) && /【右格/.test(base)) {
      return appendToNarrationBracket(appendToNarrationBracket(base, '左格', addition), '右格', addition)
    }
    if (/【画面主体[：:]/.test(base)) {
      return appendToNarrationBracket(base, '画面主体', addition)
    }
    return appendToNarrationBracket(base, '剧情', addition)
  }
  if (isNarrationAnimeStyle(style)) {
    const hints = relevant.map(ch => {
      const app = String(ch.appearance || ch.description || '').trim()
      const label = formatCharacterDisplayName(ch)
      return app ? `${label}（${app}）` : label
    }).join('、')
    const addition = `场景中出现角色：${hints}，须保持同一人生阶段外貌与服装一致`
    if (/【左格/.test(base) && /【右格/.test(base)) {
      return appendToNarrationBracket(appendToNarrationBracket(base, '左格', addition), '右格', addition)
    }
    if (/【画面主体[：:]/.test(base)) {
      return appendToNarrationBracket(base, '画面主体', addition)
    }
    return `${base}，${addition}`
  }
  const hints = relevant.map(ch => {
    const app = String(ch.appearance || ch.description || '').trim()
    const label = formatCharacterDisplayName(ch)
    return app ? `${label} (${app})` : label
  }).join('; ')
  return `${base}, characters in scene: ${hints}, keep each character appearance consistent with reference images for the same life stage, same face and outfit within the same variant, match reference image line art and cel shading exactly`
}

export function collectNarrationCharacterReferenceImages(
  chars: any[],
  characterIds: number[],
  max = 4,
) {
  const refs: string[] = []
  for (const id of characterIds) {
    const char = chars.find(ch => ch.id === id)
    const url = char?.image_url || char?.imageUrl
    if (url && !refs.includes(url) && refs.length < max) refs.push(url)
  }
  return refs
}

export function buildNarrationImageGeneratePayload(
  sb: any,
  chars: any[],
  style: string,
  extra: Record<string, any> = {},
  model?: string | null,
  characterIds?: number[],
  allSbs?: any[],
) {
  const resolvedIds = characterIds?.length
    ? characterIds
    : getStoryboardCharacterIdsFromShot(sb)
  const basePrompt = buildNarrationImagePrompt(sb, style, allSbs)
  const prompt = enrichNarrationPromptWithCharacters(basePrompt, chars, resolvedIds, style)
  const minimal = isNarrationMinimalStyle(style)
  const maxRefs = imageModelMaxReferenceImages(model)
  const referenceImages = !minimal && imageModelSupportsReferenceImages(model)
    ? collectNarrationCharacterReferenceImages(chars, resolvedIds, maxRefs)
    : []
  return {
    ...extra,
    prompt,
    image_style: style,
    reference_images: referenceImages.length ? referenceImages : undefined,
  }
}

export function narrationShotsNeedingImage(storyboards: any[]) {
  return sortStoryboards(storyboards).filter(sb => narrationShotNeedsOwnImage(sb))
}

/** 需配图但尚未生成/上传自有配图的镜头（已排序） */
export function narrationShotsPendingImage(storyboards: any[]) {
  return narrationShotsNeedingImage(storyboards).filter(sb => !getNarrationShotOwnImage(sb))
}

/** 配图文案分批：每批段落数（1～20，默认 6） */
export function normalizeParagraphPromptBatchSize(size?: number | null) {
  const n = Number(size)
  if (!Number.isFinite(n)) return 6
  return Math.min(20, Math.max(1, Math.floor(n)))
}

export function buildNarrationParagraphBatchOptions(
  storyboards: any[],
  batchSize?: number | null,
) {
  const anchors = narrationShotsNeedingImage(storyboards)
  const size = normalizeParagraphPromptBatchSize(batchSize)
  if (!anchors.length) return []
  const batchCount = Math.ceil(anchors.length / size)
  return Array.from({ length: batchCount }, (_, idx) => {
    const batchItems = anchors.slice(idx * size, (idx + 1) * size)
    const metaFirst = parseNarrationImageMeta(batchItems[0])
    const metaLast = parseNarrationImageMeta(batchItems[batchItems.length - 1])
    const p0 = metaFirst.paragraph_index
    const p1 = metaLast.paragraph_index
    let paraLabel: string
    if (p0 != null && p1 != null) {
      paraLabel = p0 === p1 ? `段${p0 + 1}` : `段${p0 + 1}-${p1 + 1}`
    } else {
      paraLabel = `第${idx + 1}批`
    }
    const firstNo = getNarrationShotDisplayNo(batchItems[0])
    const lastNo = getNarrationShotDisplayNo(batchItems[batchItems.length - 1])
    return {
      value: idx + 1,
      label: paraLabel,
      shotLabel: `#${firstNo}-#${lastNo}`,
      paragraphCount: batchItems.length,
    }
  })
}

/** 指定段落批次内的锚点镜（batchIndex 从 1 起） */
export function narrationShotsInParagraphBatch(
  storyboards: any[],
  batchIndex: number,
  batchSize?: number | null,
) {
  const anchors = narrationShotsNeedingImage(storyboards)
  const size = normalizeParagraphPromptBatchSize(batchSize)
  const idx = Math.max(1, Math.floor(Number(batchIndex)) || 1)
  const start = (idx - 1) * size
  return anchors.slice(start, start + size)
}

/** 仍缺配图文案的锚点镜 */
export function narrationShotsMissingPrompt(storyboards: any[]) {
  return narrationShotsNeedingImage(storyboards).filter(
    sb => !String(sb?.image_prompt || sb?.imagePrompt || '').trim(),
  )
}

/** 指定段批内、仍缺配图文案的锚点镜 */
export function narrationShotsMissingPromptInBatch(
  storyboards: any[],
  batchIndex: number,
  batchSize?: number | null,
) {
  const batch = narrationShotsInParagraphBatch(storyboards, batchIndex, batchSize)
  const missingIds = new Set(narrationShotsMissingPrompt(storyboards).map(sb => sb.id))
  return batch.filter(sb => missingIds.has(sb.id))
}

export function getNarrationShotDisplayNo(sb: any) {
  const n = sb?.storyboard_number ?? sb?.storyboardNumber
  if (n == null || Number.isNaN(Number(n))) return '??'
  return String(n).padStart(2, '0')
}

/** 格式化为 #01、#05、#21 */
export function formatNarrationShotDisplayList(
  shots: any[],
  options?: { prefix?: string; sep?: string },
) {
  const prefix = options?.prefix ?? '#'
  const sep = options?.sep ?? '、'
  return shots.map(sb => `${prefix}${getNarrationShotDisplayNo(sb)}`).join(sep)
}

export function formatNarrationPendingImageHint(storyboards: any[]) {
  const pending = narrationShotsPendingImage(storyboards)
  if (!pending.length) return ''
  const label = formatNarrationShotDisplayList(pending)
  if (pending.length === 1) return `${label}（最后一镜）`
  return label
}

export function narrationShotImageReady(storyboards: any[], sb: any) {
  if (!narrationShotNeedsOwnImage(sb)) return true
  return !!getNarrationShotOwnImage(sb)
}

export function narrationImagesReady(storyboards: any[]) {
  if (!storyboards.length) return false
  return narrationShotsNeedingImage(storyboards).every(sb => narrationShotImageReady(storyboards, sb))
}

export function getNarrationShotOwnTts(sb: any) {
  return sb?.tts_audio_url || sb?.ttsAudioUrl || null
}

export function hasNarrationShotOwnTts(sb: any) {
  return !!getNarrationShotOwnTts(sb)
}

export function resolveNarrationTtsMode(meta: ReturnType<typeof parseNarrationImageMeta>) {
  if (meta.narration_tts_mode) return meta.narration_tts_mode
  if (meta.narration_shot_type === 'title') return 'new'
  if (meta.narration_image_mode === 'new') return 'new'
  if (meta.narration_image_mode === 'copy') return 'copy'
  return 'inherit'
}

export function narrationShotNeedsOwnTts(sb: any) {
  if (isNarrationStoryboard(sb)) return true
  const meta = parseNarrationImageMeta(sb)
  if (meta.narration_shot_type === 'title') return true
  const mode = resolveNarrationTtsMode(meta)
  return mode !== 'inherit' && mode !== 'copy'
}

export function resolveNarrationEffectiveTts(storyboards: any[], sb: any) {
  const own = getNarrationShotOwnTts(sb)
  if (own) return { path: own, inherited: false, sourceId: sb.id }
  if (isNarrationStoryboard(sb)) {
    return { path: null, inherited: false, sourceId: null }
  }

  const ordered = sortStoryboards(storyboards)
  const idx = ordered.findIndex(item => item.id === sb.id)
  if (idx < 0) return { path: null, inherited: false, sourceId: null }

  const meta = parseNarrationImageMeta(sb)
  const mode = resolveNarrationTtsMode(meta)
  if (mode === 'new' || meta.narration_shot_type === 'title') {
    return { path: null, inherited: false, sourceId: null }
  }

  for (let i = idx - 1; i >= 0; i--) {
    const path = getNarrationShotOwnTts(ordered[i])
    if (path) return { path, inherited: true, sourceId: ordered[i].id }
  }
  return { path: null, inherited: false, sourceId: null }
}

export function hasEffectiveNarrationTts(storyboards: any[], sb: any) {
  return !!resolveNarrationEffectiveTts(storyboards, sb).path
}

export function narrationShotTtsReady(storyboards: any[], sb: any) {
  const dialogue = String(sb?.dialogue || '').trim()
  if (!dialogue) return true
  return hasEffectiveNarrationTts(storyboards, sb)
}

export function narrationTtsReady(storyboards: any[]) {
  if (!storyboards.length) return false
  return listNarrationTtsUnits(storyboards).every(sb => hasNarrationShotOwnTts(sb))
}

export function workflowStepTotal(mode: ProductionMode) {
  return isNarrationLikeMode(mode) ? 10 : 12
}

export interface WorkflowState {
  rawContent: boolean
  scriptContent: boolean
  charsCount: number
  charsVoiced: number
  sbsCount: number
  narratorReady: boolean
  ttsEligibleCount: number
  ttsGeneratedCount: number
  shotImgCount: number
  shotImgNeededCount?: number
  narrationImagesReady?: boolean
  narrationTtsReady?: boolean
  shotVidCount: number
  composedCount: number
  mergeUrl: boolean
  openingVideoUrl?: boolean
  titleVideoUrl?: boolean
  bgmAppliedCount?: number
}

export function workflowProgress(mode: ProductionMode, s: WorkflowState) {
  if (isNarrationLikeMode(mode)) {
    let p = 0
    if (s.rawContent) p++
    if (s.charsCount > 0) p++
    if (s.sbsCount) p++
    if (s.narratorReady) p++
    if (s.sbsCount && (s.narrationTtsReady ?? (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount))) p++
    if (s.sbsCount && (s.bgmAppliedCount ?? 0) > 0) p++
    if (s.sbsCount && (s.narrationImagesReady ?? s.shotImgCount === s.sbsCount)) p++
    if (s.sbsCount && s.composedCount === s.sbsCount) p++
    if (s.openingVideoUrl) p++
    if (s.mergeUrl) p++
    return Math.min(p, workflowStepTotal(mode))
  }
  let p = 0
  if (s.rawContent) p++
  if (s.scriptContent) p++
  if (s.charsCount) p++
  if (s.charsVoiced) p++
  if (s.sbsCount) p++
  if (s.sbsCount && (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount)) p++
  if (s.shotImgCount > 0) p++
  if (s.shotVidCount > 0) p++
  if (s.sbsCount && s.composedCount === s.sbsCount) p++
  if (s.openingVideoUrl) p++
  if (s.mergeUrl) p++
  return p
}

export function buildSidebarSections(mode: ProductionMode, s: WorkflowState) {
  if (mode === 'narration' || mode === 'motion_comic') {
    const scriptLabel = mode === 'motion_comic' ? '漫画解说' : '解说'
    const storyboardLabel = '旁白分镜'
    const composeDesc = mode === 'motion_comic' ? '漫画图+旁白+上下运镜' : '配图+旁白'
    return [
      {
        id: 'script',
        label: scriptLabel,
        items: [
          { key: 'script:chat', label: '剧本生成', desc: mode === 'motion_comic' ? 'AI 写短剧稿' : 'AI 写解说稿或直接输入', done: s.rawContent },
          { key: 'script:raw', label: '文案输入', desc: '粘贴文稿', done: s.rawContent },
          { key: 'script:storyboard', label: storyboardLabel, desc: '拆成镜头', done: s.sbsCount > 0 },
        ],
      },
      {
        id: 'production',
        label: '制作',
        items: [
          { key: 'prod:voice', label: '旁白音色', desc: '选择配音', done: s.narratorReady },
          { key: 'prod:chars', label: '定妆参考', desc: '角色参考图', done: s.charsCount > 0 },
          { key: 'prod:shots', label: '生成配图', desc: mode === 'motion_comic' ? '漫画插画+换镜' : '换场景配图', done: s.sbsCount > 0 && (s.narrationImagesReady ?? s.shotImgCount === s.sbsCount) },
          { key: 'prod:dubbing', label: '生成配音', desc: 'TTS 旁白', done: s.sbsCount > 0 && (s.narrationTtsReady ?? (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount)) },
          { key: 'prod:bgm', label: 'BGM 配乐', desc: 'Suno / PixVerse', done: s.sbsCount > 0 && (s.bgmAppliedCount ?? 0) > 0 },
          { key: 'prod:compose', label: '镜头合成', desc: composeDesc, done: s.sbsCount > 0 && s.composedCount === s.sbsCount },
        ],
      },
      {
        id: 'export',
        label: '导出',
        items: [
          { key: 'export:opening', label: '开幕视频', desc: '翻页片头', done: !!s.openingVideoUrl },
          { key: 'export:title', label: '片头视频', desc: '剧中红字', done: !!s.titleVideoUrl },
          { key: 'export:merge', label: '拼接导出', desc: '完整 MP4', done: s.mergeUrl },
        ],
      },
    ]
  }
  return null
}

export function narrationScriptChatStep() {
  return 0
}

export function narrationRawContentStep() {
  return 1
}

export function narrationStoryboardStep() {
  return 2
}

export function dramaStoryboardStep() {
  return 4
}

export function resolveScriptStep(mode: ProductionMode, key: string) {
  if (isNarrationLikeMode(mode)) {
    if (key === 'script:chat') return narrationScriptChatStep()
    if (key === 'script:raw') return narrationRawContentStep()
    if (key === 'script:storyboard') return narrationStoryboardStep()
    return narrationScriptChatStep()
  }
  const stepMap: Record<string, number> = {
    'script:raw': 0,
    'script:rewrite': 1,
    'script:extract': 2,
    'script:voice': 3,
    'script:storyboard': 4,
  }
  return stepMap[key] ?? 0
}

export function resolveActiveSubStepKey(
  mode: ProductionMode,
  panel: string,
  scriptStep: number,
  prodTab: string,
  exportTab = 'merge',
) {
  if (panel === 'export') {
    if (exportTab === 'opening') return 'export:opening'
    if (exportTab === 'title') return 'export:title'
    return 'export:merge'
  }
  if (panel === 'production') return `prod:${prodTab}`
  if (isNarrationLikeMode(mode)) {
    if (scriptStep === narrationStoryboardStep()) return 'script:storyboard'
    if (scriptStep === narrationRawContentStep()) return 'script:raw'
    return 'script:chat'
  }
  if (scriptStep === 0) return 'script:raw'
  if (scriptStep === 1) return 'script:rewrite'
  if (scriptStep === 2) return 'script:extract'
  if (scriptStep === 3) return 'script:voice'
  return 'script:storyboard'
}

export function inferNarrationScriptStep(_ep: any, sbsCount: number, _charsCount: number) {
  if (sbsCount > 0) return narrationStoryboardStep()
  // 已有文案也默认进入「剧本生成」对话，便于多轮修改；文案编辑走侧栏「文案输入」
  return narrationScriptChatStep()
}
