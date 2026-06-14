
export type ProductionMode = 'drama' | 'narration'

export const DEFAULT_IMAGE_MODEL = 'doubao-seedream-3-0-t2i-250415'

export const IMAGE_MODEL_OPTIONS = [
  { value: 'doubao-seedream-3-0-t2i-250415', label: 'Seedream 3.0 · ¥0.10（默认）' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0 · ¥0.20' },
  { value: 'kling-v2-1', label: 'Kling V2.1 · ¥0.04/张（1k）' },
  { value: 'kling-v2', label: 'Kling V2 · ¥0.04/张（1k）' },
  { value: 'kling-v2-new', label: 'Kling V2 New · ¥0.04/张（1k）' },
  { value: 'kling-v1-5', label: 'Kling V1.5 · ¥0.04/张（1k）' },
  { value: 'kling-v1', label: 'Kling V1 · ¥0.04/张（1k）' },
  { value: 'qwen-image-2.0-2026-03-03', label: 'Qwen Image 2.0 · ¥0.26' },
  { value: 'gemini-3.1-flash-image', label: 'Gemini Flash Image · ¥0.40' },
] as const

export function imageModelUnitPrice(model?: string | null): number {
  const m = String(model || DEFAULT_IMAGE_MODEL).toLowerCase()
  if (m.startsWith('kling-')) return 0.04
  if (m.includes('seedream-4-0') || m.includes('seedream-4-5')) return 0.20
  if (m.includes('seedream-5')) return 0.22
  if (m.includes('seedream-3') || m.includes('seedream')) return 0.10
  if (m.startsWith('qwen-image')) return 0.26
  if (m.includes('gemini') && m.includes('image')) return 0.40
  return 0.10
}

export function imageModelPriceLabel(model?: string | null): string {
  const price = imageModelUnitPrice(model)
  const m = String(model || DEFAULT_IMAGE_MODEL)
  if (m.startsWith('kling-')) return `Kling 1k · ¥${price}/张`
  if (m.includes('seedream')) return `Seedream · ¥${price}/张`
  return `¥${price}/张`
}

export function resolveEpisodeImageModel(episode?: any) {
  return episode?.image_model || episode?.imageModel || DEFAULT_IMAGE_MODEL
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
    `image_prompt 必须是单张完整插画，描述该场景段落的「主要视觉画面」（综合同场景全部旁白，不要只写首句），体现 ${style} style、comic illustration、bold lines。`,
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
      `${style} style, anime illustration, dramatic lighting, shallow depth of field`,
      `atmospheric background mood for story theme: ${hook}`,
      'clean center area reserved for dynamic title overlay, 16:9 landscape, high quality',
    ].join(', ')
  }
  const storedPrompt = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  if (storedPrompt) return storedPrompt
  const sceneContent = meta.scene_content || extractNarrationSentence(sb)
  if (!sceneContent) return ''
  if (meta.paragraph_layout === 'diptych') {
    return [
      'single 16:9 illustration with exactly 2 horizontal panels side by side, diptych layout, one image file',
      'only left panel and right panel, no third panel, no vertical stack',
      `${style} style, comic illustration, cinematic composition`,
      `left panel scene: ${sceneContent}`,
      'right panel scene: continuation of narration scene',
      'high quality, no text, no watermark',
    ].join(', ')
  }
  return [
    'single full illustration, one complete scene only',
    'no grid, no collage, no multi-panel, no comic strip, no split screen, no storyboard layout',
    `${style} style, comic illustration, bold lines, cinematic composition`,
    `illustrate the main visual of this scene based on narration: ${sceneContent}`,
    '16:9 landscape, high quality, no text, no watermark',
  ].join(', ')
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
  return mode === 'narration' ? 7 : 11
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
}

export function workflowProgress(mode: ProductionMode, s: WorkflowState) {
  if (mode === 'narration') {
    let p = 0
    if (s.rawContent) p++
    if (s.sbsCount) p++
    if (s.narratorReady) p++
    if (s.sbsCount && (s.narrationTtsReady ?? (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount))) p++
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
          { key: 'script:storyboard', label: '旁白分镜', desc: '拆成镜头', done: s.sbsCount > 0 },
        ],
      },
      {
        id: 'production',
        label: '制作',
        items: [
          { key: 'prod:voice', label: '旁白音色', desc: '选择配音', done: s.narratorReady },
          { key: 'prod:dubbing', label: '生成配音', desc: 'TTS 旁白', done: s.sbsCount > 0 && (s.narrationTtsReady ?? (!s.ttsEligibleCount || s.ttsGeneratedCount === s.ttsEligibleCount)) },
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
  return 1
}

export function dramaStoryboardStep() {
  return 4
}

export function resolveScriptStep(mode: ProductionMode, key: string) {
  if (mode === 'narration') {
    if (key === 'script:raw') return 0
    if (key === 'script:storyboard') return 1
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
    return scriptStep === 1 ? 'script:storyboard' : 'script:raw'
  }
  if (scriptStep === 0) return 'script:raw'
  if (scriptStep === 1) return 'script:rewrite'
  if (scriptStep === 2) return 'script:extract'
  if (scriptStep === 3) return 'script:voice'
  return 'script:storyboard'
}

export function inferNarrationScriptStep(ep: any, sbsCount: number, narratorReady: boolean) {
  if (sbsCount > 0) return 1
  if (ep?.content || ep?.script_content || ep?.scriptContent) return 1
  return 0
}
