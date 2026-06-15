import { artStylePrompt } from '~/composables/useArtStyles'

export type ProductionMode = 'drama' | 'narration'

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2-all'

export const IMAGE_MODEL_OPTIONS = [
  { value: 'gpt-image-2-all', label: 'GPT Image 2 · ¥0.21/张（默认·文生图+参考图定妆）' },
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
  return 'drama'
}

export function parseDramaMetadata(drama: any) {
  if (!drama?.metadata) return {}
  if (typeof drama.metadata === 'object') return drama.metadata
  try { return JSON.parse(drama.metadata) } catch { return {} }
}

export function narrationStoryboardPrompt(style = 'comic') {
  return [
    '这是旁白解说视频，必须按「一句旁白 = 一个镜头」拆分，严禁把多句旁白合并到同一镜头。',
    '以句号、问号、感叹号、分号、逗号、顿号或换行作为分镜边界，每个标点（或换行）后单独一镜，严禁合并。',
    '所有 dialogue 统一写为「旁白：单句内容」，每镜 dialogue 只能有一句旁白。',
    `image_prompt 必须是单张完整插画，描述该场景段落的「主要视觉画面」（综合同场景全部旁白，不要只写首句），画风要求：${artStylePrompt(style, 'agent')}。`,
    '严禁在 image_prompt 中出现 grid、panel、宫格、分格、多格、collage、split、strip 等词。',
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
  narration_shot_type?: NarrationShotType
  narration_tts_mode?: 'new' | 'inherit' | 'copy'
  title_hook?: string
  title_full?: string
  paragraph_index?: number
  paragraph_layout?: 'single' | 'diptych'
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
      narration_shot_type: raw.narration_shot_type === 'title' ? 'title' : 'normal',
      narration_tts_mode: raw.narration_tts_mode,
      title_hook: raw.title_hook,
      title_full: raw.title_full,
      scene_content: raw.scene_content,
      paragraph_index: typeof raw.paragraph_index === 'number' ? raw.paragraph_index : undefined,
      paragraph_layout: raw.paragraph_layout === 'diptych' ? 'diptych' : raw.paragraph_layout === 'single' ? 'single' : undefined,
    }
  }
  try {
    const parsed = JSON.parse(raw)
    const mode = parsed?.narration_image_mode
    return {
      narration_image_mode: mode === 'new' || mode === 'copy' || mode === 'inherit' ? mode : 'inherit',
      narration_shot_type: parsed?.narration_shot_type === 'title' ? 'title' : 'normal',
      narration_tts_mode: parsed?.narration_tts_mode,
      title_hook: parsed?.title_hook,
      title_full: parsed?.title_full,
      scene_content: parsed?.scene_content,
      paragraph_index: typeof parsed?.paragraph_index === 'number' ? parsed.paragraph_index : undefined,
      paragraph_layout: parsed?.paragraph_layout === 'diptych' ? 'diptych' : parsed?.paragraph_layout === 'single' ? 'single' : undefined,
    }
  } catch {}
  return { narration_image_mode: 'inherit' }
}

export function isNarrationTitleShot(sb: any) {
  return parseNarrationImageMeta(sb).narration_shot_type === 'title'
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
  return meta.narration_image_mode === 'new'
}

export function getNarrationShotOwnImage(sb: any) {
  return sb?.composed_image || sb?.composedImage || null
}

export function resolveNarrationEffectiveImage(storyboards: any[], sb: any) {
  const ordered = sortStoryboards(storyboards)
  const idx = ordered.findIndex(item => item.id === sb.id)
  if (idx < 0) return { path: null, inherited: false, sourceId: null }
  for (let i = idx; i >= 0; i--) {
    const path = getNarrationShotOwnImage(ordered[i])
    if (path) {
      return {
        path,
        inherited: ordered[i].id !== sb.id,
        sourceId: ordered[i].id,
      }
    }
  }
  return { path: null, inherited: false, sourceId: null }
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

export function buildNarrationImagePrompt(sb: any, style = 'comic') {
  if (!narrationShotNeedsOwnImage(sb)) return ''
  const meta = parseNarrationImageMeta(sb)
  if (meta.narration_shot_type === 'title') {
    const hook = meta.title_hook || meta.title_full || extractNarrationSentence(sb)
    if (!hook) return ''
    return [
      'cinematic opening background scene, single full illustration',
      'absolutely no text, no letters, no words, no watermark, no captions on image',
      artStylePrompt(style, 'title'),
      `atmospheric background mood for story theme: ${hook}`,
      'clean center area reserved for dynamic title overlay, 16:9 landscape, high quality',
    ].join(', ')
  }
  const storedPrompt = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  const sceneContent = meta.scene_content || extractNarrationSentence(sb)
  if (!storedPrompt && !sceneContent) return ''
  if (storedPrompt) return storedPrompt
  if (meta.paragraph_layout === 'diptych') {
    return [
      'single 16:9 illustration with exactly 2 horizontal panels side by side, diptych layout, one image file',
      'only left panel and right panel, no third panel, no vertical stack',
      artStylePrompt(style, 'diptych'),
      `left panel scene: ${sceneContent}`,
      'right panel scene: continuation of narration scene',
      'high quality, no text, no watermark',
    ].join(', ')
  }
  return [
    'single full illustration, one complete scene only',
    'no grid, no collage, no multi-panel, no comic strip, no split screen, no storyboard layout',
    artStylePrompt(style, 'scene'),
    `illustrate the main visual of this scene based on narration: ${sceneContent}`,
    '16:9 landscape, high quality, no text, no watermark',
  ].join(', ')
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
) {
  const base = String(prompt || '').trim()
  if (!base) return base
  const relevant = chars.filter(ch => characterIds.includes(ch.id))
  if (!relevant.length) return base
  const hints = relevant.map(ch => {
    const app = String(ch.appearance || ch.description || '').trim()
    const label = formatCharacterDisplayName(ch)
    return app ? `${label} (${app})` : label
  }).join('; ')
  return `${base}, characters in scene: ${hints}, keep each character appearance consistent with reference images for the same life stage, same face and outfit within the same variant`
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
) {
  const resolvedIds = characterIds?.length
    ? characterIds
    : getStoryboardCharacterIdsFromShot(sb)
  const basePrompt = buildNarrationImagePrompt(sb, style)
  const prompt = enrichNarrationPromptWithCharacters(basePrompt, chars, resolvedIds)
  const maxRefs = imageModelMaxReferenceImages(model)
  const referenceImages = imageModelSupportsReferenceImages(model)
    ? collectNarrationCharacterReferenceImages(chars, resolvedIds, maxRefs)
    : []
  return {
    ...extra,
    prompt,
    reference_images: referenceImages.length ? referenceImages : undefined,
  }
}

export function narrationShotsNeedingImage(storyboards: any[]) {
  return storyboards.filter(sb => narrationShotNeedsOwnImage(sb))
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
  return hasEffectiveNarrationTts(storyboards, sb)
}

export function narrationTtsReady(storyboards: any[]) {
  if (!storyboards.length) return false
  return storyboards.filter(sb => {
    const dialogue = String(sb?.dialogue || '').trim()
    return !!dialogue
  }).every(sb => !!getNarrationShotOwnTts(sb))
}

export function workflowStepTotal(mode: ProductionMode) {
  return mode === 'narration' ? 9 : 11
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
  bgmAppliedCount?: number
}

export function workflowProgress(mode: ProductionMode, s: WorkflowState) {
  if (mode === 'narration') {
    let p = 0
    if (s.rawContent) p++
    if (s.charsCount > 0) p++
    if (s.sbsCount) p++
    if (s.narratorReady) p++
    if (s.sbsCount && (s.narrationTtsReady ?? (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount))) p++
    if (s.sbsCount && (s.bgmAppliedCount ?? 0) > 0) p++
    if (s.sbsCount && (s.narrationImagesReady ?? s.shotImgCount === s.sbsCount)) p++
    if (s.sbsCount && s.composedCount === s.sbsCount) p++
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
  if (s.mergeUrl) p++
  return p
}

export function buildSidebarSections(mode: ProductionMode, s: WorkflowState) {
  if (mode === 'narration') {
    return [
      {
        id: 'script',
        label: '解说',
        items: [
          { key: 'script:raw', label: '文案输入', desc: '粘贴解说稿', done: s.rawContent },
          { key: 'script:characters', label: '角色定妆', desc: '提取并生成参考图', done: s.charsCount > 0 },
          { key: 'script:storyboard', label: '旁白分镜', desc: '拆成镜头', done: s.sbsCount > 0 },
        ],
      },
      {
        id: 'production',
        label: '制作',
        items: [
          { key: 'prod:voice', label: '旁白音色', desc: '选择配音', done: s.narratorReady },
          { key: 'prod:chars', label: '定妆参考', desc: '角色参考图', done: s.charsCount > 0 },
          { key: 'prod:dubbing', label: '生成配音', desc: 'TTS 旁白', done: s.sbsCount > 0 && (s.narrationTtsReady ?? (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount)) },
          { key: 'prod:bgm', label: 'BGM 配乐', desc: 'Suno / PixVerse', done: s.sbsCount > 0 && (s.bgmAppliedCount ?? 0) > 0 },
          { key: 'prod:shots', label: '生成配图', desc: '换场景配图', done: s.sbsCount > 0 && (s.narrationImagesReady ?? s.shotImgCount === s.sbsCount) },
          { key: 'prod:compose', label: '镜头合成', desc: '配图+旁白', done: s.sbsCount > 0 && s.composedCount === s.sbsCount },
        ],
      },
      {
        id: 'export',
        label: '导出',
        items: [
          { key: 'export:merge', label: '拼接导出', desc: '完整 MP4', done: s.mergeUrl },
        ],
      },
    ]
  }
  return null
}

export function narrationStoryboardStep() {
  return 2
}

export function dramaStoryboardStep() {
  return 4
}

export function resolveScriptStep(mode: ProductionMode, key: string) {
  if (mode === 'narration') {
    if (key === 'script:raw') return 0
    if (key === 'script:characters') return 1
    if (key === 'script:storyboard') return 2
    return 0
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

export function resolveActiveSubStepKey(mode: ProductionMode, panel: string, scriptStep: number, prodTab: string) {
  if (panel === 'export') return 'export:merge'
  if (panel === 'production') return `prod:${prodTab}`
  if (mode === 'narration') {
    if (scriptStep === 2) return 'script:storyboard'
    if (scriptStep === 1) return 'script:characters'
    return 'script:raw'
  }
  if (scriptStep === 0) return 'script:raw'
  if (scriptStep === 1) return 'script:rewrite'
  if (scriptStep === 2) return 'script:extract'
  if (scriptStep === 3) return 'script:voice'
  return 'script:storyboard'
}

export function inferNarrationScriptStep(ep: any, sbsCount: number, charsCount: number) {
  if (sbsCount > 0) return 2
  if (charsCount > 0) return 1
  if (ep?.content || ep?.script_content || ep?.scriptContent) return 1
  return 0
}
