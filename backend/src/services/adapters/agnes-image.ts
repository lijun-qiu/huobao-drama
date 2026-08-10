/**
 * Agnes Image Adapter（定妆 / 文生图 / 图生图）
 * @see https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash
 * @see https://wiki.agnes-ai.com/en/docs/agnes-image-20-flash
 * POST https://apihub.agnes-ai.com/v1/images/generations
 *
 * 图生图参考图放在 extra_body.image（URL 或 Data URI）；
 * response_format 必须放在 extra_body，不可顶层。
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'
import {
  AGNES_STORYBOARD_MAX_REFS,
  convertPortraitRefWhiteBgToAgnesDark,
} from '../../utils/portrait-ref-preprocess.js'

export { convertPortraitRefWhiteBgToAgnesDark, AGNES_STORYBOARD_MAX_REFS }

export const AGNES_OPENAI_BASE_URL = 'https://apihub.agnes-ai.com/v1'
/** 默认用 2.1：复杂构图/高信息密度更好；2.0 仍可选 */
export const AGNES_DEFAULT_IMAGE_MODEL = 'agnes-image-2.1-flash'
export const AGNES_IMAGE_MODEL_ALIASES = [
  'agnes-image-2.1-flash',
  'agnes-image-2.1',
  'agnes-image-2.0-flash',
  'agnes-image-2.0',
] as const

export function isAgnesImageModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('agnes-image')
}

export function resolveAgnesImageModel(model?: string | null): string {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return AGNES_DEFAULT_IMAGE_MODEL
  if (m === 'agnes-image-2.1') return 'agnes-image-2.1-flash'
  if (m === 'agnes-image-2.0') return 'agnes-image-2.0-flash'
  if (m.startsWith('agnes-image')) return m
  return AGNES_DEFAULT_IMAGE_MODEL
}

function parseReferenceImages(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const refs = JSON.parse(raw)
    if (!Array.isArray(refs)) return []
    return refs.map(item => String(item || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function agnesBase(config: AIConfig): string {
  return (config.baseUrl || AGNES_OPENAI_BASE_URL).replace(/\/+$/, '')
}

/** Agnes 常用尺寸 */
export function normalizeAgnesImageSize(size?: string | null): string {
  const raw = String(size || '1024x1024').toLowerCase().replace('*', 'x')
  const [w, h] = raw.split(/[x×]/).map(Number)
  if (!w || !h) return '1024x1024'
  const aspect = w / h
  if (aspect > 1.2) return '1024x768'
  if (aspect < 0.85) return '768x1024'
  return '1024x1024'
}

/** Agnes 定妆生图英文锚点（深色身份锁脸，非白棚）——漫画解说等彩漫定妆 */
export const AGNES_PORTRAIT_IDENTITY_PREFIX =
  'vertical chest-up character IDENTITY LOCK reference, single person, neutral face, deep navy dark background #0f172a, sharp anime cel shading, clear face and hair, NOT pure white background, NOT character sheet, NOT lineup'

/** 解说日系2D 定妆：白底半身，与配图同画风（勿套深色赛璐璐前缀） */
export const AGNES_NARRATION_ANIME_PORTRAIT_PREFIX =
  'vertical chest-up character IDENTITY LOCK reference, single person, neutral face, pure white background, Japanese 2D anime illustration, Anime Style, high-contrast cinematic modeling, clear face and hair, even soft studio light, NOT 3D CGI, NOT photorealistic, NOT thin-lineart recipe, NOT cel-shading recipe, NOT character sheet, NOT lineup'

/** 小说漫画定妆：黑白素笔白底半身（与配图素笔彩画竖页分离；勿套深色赛璐璐前缀） */
export const AGNES_NOVEL_COMIC_PORTRAIT_PREFIX =
  'vertical chest-up black-and-white pencil sketch IDENTITY LOCK reference, single person, neutral face, pure white background, clean thin black ink lineart with cross-hatching only, NO flat color, NO cel shading, NOT photorealistic, NOT photo, NOT 3D, NOT full-color comic page, NOT character sheet, NOT lineup, NOT multi-panel page'

export function isAgnesNovelComicBwPortraitPrompt(prompt: string): boolean {
  const s = String(prompt || '')
  if (!s.trim()) return false
  if (/左上\s*[：:].{0,120}右上\s*[：:]|上格\s*[：:].{0,80}下格\s*[：:]|一整页\s*2\s*[×xX]\s*2|9:16\s*竖屏|layout\s*=\s*quad|FOUR-PANEL COMIC PAGE|VERTICAL COMIC PAGE|素笔彩画竖页|【格字模式/i.test(s)) {
    return false
  }
  return /黑白素笔|素笔线稿|black-and-white pencil|cross-hatching shading only|无上色无赛璐璐|NO flat color/i.test(s)
    || (/身份锁脸|竖幅正面半身|单人半身定妆/.test(s) && /黑白|素笔|monochrome|pencil sketch/i.test(s))
}

/** 解说视频日系2D 白底定妆（勿被漫画解说深色前缀改写） */
export function isAgnesNarrationAnimePortraitPrompt(prompt: string): boolean {
  const s = String(prompt || '')
  if (!s.trim()) return false
  if (isAgnesNovelComicBwPortraitPrompt(s)) return false
  if (/deep navy|#0f172a|短剧解说高清国漫|锋利细线稿硬边赛璐璐/i.test(s)) return false
  const animeStyle = /日系2D|Japanese 2D anime|Anime Style|高对比电影感|【画风规格：16:9日系2D/.test(s)
  const portraitLayout = /纯白|white background|定妆|chest-up|IDENTITY LOCK|半身|character reference portrait/i.test(s)
  return animeStyle && portraitLayout
}

export type AgnesShotFraming = 'waist-up' | 'full-body' | 'close-up'

/** 从中文分镜提示抽出短场景锚点，供 Agnes 多图合成英文前缀使用 */
export function extractAgnesSceneAnchorCn(prompt: string): string {
  const s = String(prompt || '')
  // 优先前景/中景/后景整段（比单点「收银台」更能锁住卤锅·腊肉·巷口）
  const env = s.match(/前景[^；]{4,72}(?:中景[^；]{4,72})?(?:后景[^；]{4,72})?/)?.[0]
  if (env) return env.trim().slice(0, 120)
  const place = s.match(
    /(?:深夜|白天|清晨|黄昏|夜间)?[^，；]{0,12}(?:卤肉店|卤锅|腊肉|深巷|堂屋|走廊|玄关|巷口|街道|病房|客厅|厨房|天台|仓库|收银台)[^，；]{0,24}/,
  )?.[0]
  if (place) return place.trim()
  const loc = s.match(/位于([^，；]{2,24})以/)?.[1]
  if (loc) return loc.trim()
  return 'cinematic drama scene with environment'
}

/** 景别：文案写中景半身时勿强塞 FULL BODY（易塌成站立定妆并排） */
export function detectAgnesShotFraming(prompt: string): AgnesShotFraming {
  const s = String(prompt || '')
  if (/特写|近景|头高约\s*2[4-9]\s*%|头高约\s*[3-9]\d\s*%/.test(s)) return 'close-up'
  if (/全身|从头顶到脚|双脚可见|远景建立|头高约\s*(?:[6-9]|1[0-2])\s*%/.test(s)) return 'full-body'
  if (/中景半身|半身平视|腰部入镜|头高约\s*1[3-9]\s*%|头高约\s*2[0-3]\s*%/.test(s)) return 'waist-up'
  return 'waist-up'
}

export type AgnesPortraitIdentitySlot = {
  label: string
  age?: number
  traits?: string
  gender?: 'male' | 'female'
}

function inferAgnesGender(traits?: string, label?: string): 'male' | 'female' | undefined {
  const t = `${traits || ''} ${label || ''}`
  if (/女性|女主|女孩|少女|女人|女士|妻子|老婆|母亲|妈妈|女儿|姐|妹|婶|阿姨|姑娘|夫人/.test(t)) return 'female'
  if (/男性|男主|男孩|男人|男士|少年男|丈夫|老公|父亲|爸爸|儿子|爷|伯|叔/.test(t)) return 'male'
  return undefined
}

function agnesGenderLockEn(gender?: 'male' | 'female'): string {
  if (gender === 'female') {
    return 'GENDER LOCK: female woman only — feminine face and body; FORBIDDEN: male, man, boy.'
  }
  if (gender === 'male') {
    return 'GENDER LOCK: adult male man only — masculine face, flat chest, broad shoulders; FORBIDDEN: female, woman, girl, feminine body, breasts.'
  }
  return ''
}

/** 解析「对照定妆「名」（26岁·…）」中的年龄与辨识差，供英文 identity map */
export function extractAgnesPortraitIdentitySlots(prompt: string): AgnesPortraitIdentitySlot[] {
  const s = String(prompt || '')
  const slots: AgnesPortraitIdentitySlot[] = []
  const seen = new Set<string>()
  for (const m of s.matchAll(/对照定妆「([^」]+)」(?:（([^）]*)）)?/g)) {
    const label = String(m[1] || '').trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    const traits = String(m[2] || '').trim()
    const ageRaw = traits.match(/(\d{1,3})\s*岁/)?.[1]
    const age = ageRaw ? Number(ageRaw) : undefined
    slots.push({
      label,
      age: age != null && Number.isFinite(age) ? age : undefined,
      traits: traits || undefined,
      gender: inferAgnesGender(traits, label),
    })
  }
  return slots
}

function framingInstruction(framing: AgnesShotFraming): string {
  if (framing === 'full-body') {
    return 'Framing: FULL BODY head-to-toe with feet/shoes visible when standing; real environment depth.'
  }
  if (framing === 'close-up') {
    return 'Framing: close-up / near shot as described; face dominant; real environment still visible behind.'
  }
  return 'Framing: MEDIUM waist-up conversational shot (chest/waist), NOT full-body standing lineup, NOT a portrait strip.'
}

/**
 * 多参考 → 单帧剧情。
 * 定妆=脸锁；场景=环境锁；道具=物件锁（顺序与 images.ts 挂载一致：场景→定妆→道具）。
 * 勿用 “Combine the N reference images”（Agnes 易理解成白底/办公室定妆并排拼贴）。
 */
export type AgnesRefSlotKind = 'scene' | 'portrait' | 'prop'

/** 与 images.ts 挂载顺序对齐：场景 → 定妆 → 道具；Toonflow @图N 优先 */
export function parseAgnesMixedRefSlots(prompt: string, refCount: number): Array<{ kind: AgnesRefSlotKind; label: string }> {
  const n = Math.max(0, refCount || 0)
  if (!n) return []
  const text = String(prompt || '')

  // Toonflow：@图N 为{label}{角色|场景|道具} — 与挂图顺序严格一致
  const atSlots: Array<{ kind: AgnesRefSlotKind; label: string; index: number }> = []
  for (const m of text.matchAll(/@图(\d+)\s*为\s*([^\s@图,，]+?)(角色|场景|道具)/g)) {
    const index = Number(m[1])
    const label = String(m[2] || '').trim()
    const kindCn = m[3]
    const kind: AgnesRefSlotKind = kindCn === '场景' ? 'scene' : kindCn === '道具' ? 'prop' : 'portrait'
    if (!Number.isFinite(index) || index < 1 || !label) continue
    if (atSlots.some(x => x.index === index)) continue
    atSlots.push({ index, kind, label })
  }
  if (atSlots.length) {
    const ordered = atSlots.sort((a, b) => a.index - b.index).map(({ kind, label }) => ({ kind, label }))
    while (ordered.length < n) ordered.push({ kind: 'portrait', label: `character ${ordered.length + 1}` })
    return ordered.slice(0, n)
  }

  const sceneLabels = (() => {
    const m = text.match(/【场景参考：([^】]+)】/)
    if (m) return m[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean)
    return [...text.matchAll(/对照场景「([^」]+)」/g)].map(x => x[1].trim()).filter(Boolean)
  })()
  const portraitLabels = (() => {
    const m = text.match(/【定妆参考顺序：([^】]+)】/)
    if (m) return m[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean)
    return [...text.matchAll(/对照定妆「([^」]+)」/g)].map(x => x[1].trim()).filter(Boolean)
  })()
  const propLabels = (() => {
    const m = text.match(/【道具参考顺序：([^】]+)】/)
    if (m) return m[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean)
    return [...text.matchAll(/对照道具「([^」]+)」/g)].map(x => x[1].trim()).filter(Boolean)
  })()
  const hasEnvMarkers = sceneLabels.length > 0 || propLabels.length > 0
    || /【场景参考：|【道具参考顺序：|对照场景「|对照道具「/.test(text)
  if (!hasEnvMarkers) {
    return Array.from({ length: n }, (_, i) => ({
      kind: 'portrait' as const,
      label: portraitLabels[i] || `character ${i + 1}`,
    }))
  }
  const slots: Array<{ kind: AgnesRefSlotKind; label: string }> = []
  const push = (kind: AgnesRefSlotKind, label: string) => {
    if (slots.length >= n) return
    slots.push({ kind, label: label || kind })
  }
  for (const label of sceneLabels.slice(0, 1)) push('scene', label)
  if (!sceneLabels.length && /【场景参考：|对照场景「/.test(text)) push('scene', 'scene')
  for (const label of portraitLabels) push('portrait', label)
  for (const label of propLabels) push('prop', label)
  while (slots.length < n) push('portrait', `character ${slots.length + 1}`)
  return slots.slice(0, n)
}

function formatAgnesRefSlotMapping(
  slots: Array<{ kind: AgnesRefSlotKind; label: string }>,
  identitySlots: AgnesPortraitIdentitySlot[],
): string {
  const slotByLabel = new Map(identitySlots.map(s => [s.label, s]))
  return slots.map((slot, i) => {
    const idx = i + 1
    if (slot.kind === 'scene') {
      return `image ${idx} = ENVIRONMENT LOCK of location「${slot.label}」— keep walls/lights/furniture shell; do NOT paste as a flat poster; do NOT treat as a face`
    }
    if (slot.kind === 'prop') {
      return `image ${idx} = OBJECT LOCK of prop「${slot.label}」— keep silhouette/material/color; place only if the shot narration needs it; do NOT treat as a face`
    }
    const name = slot.label || `character ${idx}`
    const idSlot = slotByLabel.get(name) || identitySlots.find(s => s.label === name)
    const ageBit = idSlot?.age != null ? `, ${idSlot.age} years old` : ''
    const traitBit = idSlot?.traits ? `, keep traits: ${idSlot.traits.slice(0, 36)}` : ''
    return `image ${idx} = FACE/HAIR identity lock of「${name}」only${ageBit}${traitBit} — never paste the whole reference plate`
  }).join('; ')
}

export function buildAgnesMultiRefCombinePrefix(options: {
  refCount: number
  portraitLabels?: string[]
  sceneAnchor?: string
  /** 文案点名总人数（可大于有参考图数） */
  exactPeople?: number
  identitySlots?: AgnesPortraitIdentitySlot[]
  framing?: AgnesShotFraming
  /** 与参考图顺序对齐；缺省时按 prompt 解析 */
  refSlots?: Array<{ kind: AgnesRefSlotKind; label: string }>
  promptForSlots?: string
}): string {
  const refN = Math.max(1, options.refCount || 0)
  const labels = (options.portraitLabels || []).map(x => String(x || '').trim()).filter(Boolean)
  const identitySlots = options.identitySlots || []
  const refSlots = (options.refSlots?.length
    ? options.refSlots
    : parseAgnesMixedRefSlots(options.promptForSlots || '', refN)
  ).slice(0, refN)
  while (refSlots.length < refN) {
    refSlots.push({ kind: 'portrait', label: labels[refSlots.length] || `character ${refSlots.length + 1}` })
  }
  const portraitN = Math.max(
    1,
    refSlots.filter(s => s.kind === 'portrait').length,
    labels.length,
    options.exactPeople || 0,
  )
  const hasEnv = refSlots.some(s => s.kind === 'scene' || s.kind === 'prop')
  const mapping = formatAgnesRefSlotMapping(refSlots, identitySlots)
  const scene = String(options.sceneAnchor || 'cinematic drama scene').trim()
  const framing = options.framing || 'waist-up'
  const usageLine = hasEnv
    ? `REFERENCE USAGE (CRITICAL): The ${refN} attached images mix ENVIRONMENT/OBJECT locks and FACE/HAIR identity locks. Follow the identity map strictly. Do NOT paste, collage, tile, or line them up as a character sheet.`
    : `REFERENCE USAGE (CRITICAL): The ${refN} attached images are FACE/HAIR IDENTITY LOCKS only. Do NOT paste, collage, tile, or line them up as a character sheet.`
  return [
    usageLine,
    `Paint ONE brand-new 16:9 cinematic storyboard still inside this environment: ${scene}.`,
    `Identity map: ${mapping}. Portrait faces must stay distinct; do not clone or twin faces.`,
    `EXACTLY ${portraitN} people in frame (one per named 对照定妆); FORBIDDEN to add a ${portraitN + 1}th filler, twin, clone, or random extra.`,
    'Preserve stated ages — do NOT youth-wash 40+/middle-aged characters into early-20s faces.',
    framingInstruction(framing),
    'Characters look at each other or props, NOT at camera.',
    'FORBIDDEN layouts: white-background character sheet, portrait lineup, multi-head collage, turnaround, contact sheet, corkboard/photo-wall of faces, office shelf “casting board”, wardrobe variants side-by-side.',
  ].join(' ')
}

/** 单人定妆 / 单场景环境 i2i */
export function buildAgnesSingleRefStoryboardPrefix(options?: {
  portraitLabel?: string
  sceneAnchor?: string
  exactPeople?: number
  identitySlot?: AgnesPortraitIdentitySlot
  framing?: AgnesShotFraming
  /** scene | prop | portrait（默认 portrait） */
  refKind?: AgnesRefSlotKind
  refLabel?: string
}): string {
  const scene = String(options?.sceneAnchor || 'the described drama scene').trim()
  const framing = options?.framing || 'waist-up'
  const kind = options?.refKind || 'portrait'
  if (kind === 'scene') {
    const loc = String(options?.refLabel || 'the location').trim() || 'the location'
    return [
      `Use the reference image ONLY as ENVIRONMENT LOCK of location「${loc}」. Keep walls, lights, furniture shell and depth; do NOT paste the plate as a flat poster; do NOT treat it as a face.`,
      `Output ONE single 16:9 cinematic storyboard still of: ${scene}.`,
      framingInstruction(framing),
      'Must be a real environment with foreground/midground/background — never a white panel beside the scene.',
    ].join(' ')
  }
  if (kind === 'prop') {
    const prop = String(options?.refLabel || 'the prop').trim() || 'the prop'
    return [
      `Use the reference image ONLY as OBJECT LOCK of prop「${prop}」. Keep silhouette, material and color; place it only if the shot narration needs it; do NOT treat it as a face.`,
      `Output ONE single 16:9 cinematic storyboard still of: ${scene}.`,
      framingInstruction(framing),
      'Must be a real environment with foreground/midground/background — never a white panel beside the scene.',
    ].join(' ')
  }
  const name = String(options?.portraitLabel || options?.identitySlot?.label || 'the character').trim() || 'the character'
  const ageBit = options?.identitySlot?.age != null ? ` (${options.identitySlot.age} years old)` : ''
  const gender = options?.identitySlot?.gender || inferAgnesGender(options?.identitySlot?.traits, name)
  const genderLock = agnesGenderLockEn(gender)
  return [
    `Use the reference image ONLY for face/hair identity of「${name}」${ageBit}. Do NOT paste the reference plate into the frame.`,
    `Output ONE single 16:9 cinematic storyboard still of: ${scene}.`,
    'EXACTLY 1 person in the entire frame — the named character only. FORBIDDEN: second person, crowd, NPC, twin, clone, back silhouette, off-screen hands, right-side avatar wall, character sheet stickers.',
    genderLock,
    'ONE outfit matching the prompt hex color. Do NOT show outfit variations side by side.',
    framingInstruction(framing),
    'FORBIDDEN layouts: character sheet, reference sheet, turnaround, contact sheet, multi-head collage, grid of bust portraits on white, small heads stacked on the right, wardrobe lineup, corkboard of faces.',
    'Must be a real environment with foreground/midground/background props — never a white panel beside the scene.',
  ].filter(Boolean).join(' ')
}

function hasAgnesStoryboardRefPrefix(prompt: string): boolean {
  return /REFERENCE USAGE \(CRITICAL\): The \d+ attached images (?:are FACE\/HAIR IDENTITY LOCKS|mix ENVIRONMENT\/OBJECT locks)/i.test(prompt)
    || /Combine the \d+ reference character images into ONE/i.test(prompt)
    || /Use the reference image ONLY for face\/hair identity/i.test(prompt)
    || /Use the reference image ONLY as ENVIRONMENT LOCK/i.test(prompt)
    || /Use the reference image ONLY as OBJECT LOCK/i.test(prompt)
    || /FOUR-PANEL COMIC PAGE \(CRITICAL\)/i.test(prompt)
}

/** 小说漫画：9:16 竖屏二/三列分格页（讲解文字画在图上；勿套单帧腰景前缀） */
export function isAgnesNovelComicQuadPagePrompt(prompt: string): boolean {
  const s = String(prompt || '')
  // 定妆单人半身：文案里可能出现「非四格」等否定词，绝当不当分格页
  if (/身份锁脸|竖幅正面半身|单人半身定妆|定妆参考/.test(s)
    && !/左上\s*[：:].{0,120}右上\s*[：:]|上格\s*[：:].{0,80}下格\s*[：:]|一整页\s*2\s*[×xX]\s*2|9:16\s*竖屏|layout\s*=\s*quad|素笔彩画竖页/i.test(s)) {
    return false
  }
  // 须有正向分格版式信号（含旧四格文案兼容）
  return /一整页\s*2\s*[×xX]\s*2|9:16[^\n【]{0,48}(?:竖屏|二列|三列)|16:9[^\n【]{0,48}2\s*[×xX]\s*2|layout\s*=\s*quad|FOUR-PANEL COMIC PAGE|VERTICAL COMIC PAGE|左上\s*[：:].{0,120}右上\s*[：:]|上格\s*[：:].{0,80}下格\s*[：:]|【画风规格：(?:彩漫四格页|素笔彩画竖页)】|【格字模式/i.test(s)
}

export function buildAgnesNovelComicQuadPagePrefix(options?: {
  portraitLabel?: string
  identitySlot?: AgnesPortraitIdentitySlot
  /** short=空框后期叠字；full=模型画汉字（默认） */
  panelTextMode?: 'short' | 'full' | null
}): string {
  const name = String(options?.portraitLabel || options?.identitySlot?.label || '').trim()
  // 软参考约五成：只认粗轮廓；参考图已很小很糊
  const faceBit = name
    ? `SOFT FACE GUIDE (~50%): if a tiny blurry reference is attached, keep only a rough silhouette resemblance of「${name}」face/hair — NOT identity lock, NOT detailed facial copy. Scene/environment ALWAYS outweigh face matching; ignore reference clothing.`
    : 'SOFT FACE GUIDE (~50%): if a tiny blurry reference is attached, keep only a rough face/hair silhouette — NOT identity lock. Scene/environment ALWAYS outweigh face matching.'
  const gender = options?.identitySlot?.gender || inferAgnesGender(options?.identitySlot?.traits, name)
  const genderLock = agnesGenderLockEn(gender)
  const short = options?.panelTextMode === 'short'
  const textBit = short
    ? 'Draw EMPTY speech bubbles or caption boxes in each panel corner with blank white interiors — do NOT paint any Chinese characters, glyphs, or fake letters inside them (text will be overlaid later). Still leave clear bubble shapes for overlay.'
    : 'Draw speech bubbles or caption boxes in each panel and paint clear readable FULL Chinese narration inside them, matching the 旁白框「…」/气泡「…」 text from the prompt.'
  return [
    'VERTICAL COMIC PAGE (CRITICAL): Output ONE single 9:16 portrait pencil-and-light-watercolor comic page with a 2-column OR 3-column panel layout (choose 2 or 3 panels by content).',
    'Thin dark panel borders; reading order top → bottom (上格 → 中格 → 下格).',
    'SCENE FIRST: each panel must show clear environment, props, weather, and action from the Chinese prompt; vary shots (wide establishing / medium action / prop detail / reaction). NOT identical waist-up talking-head portraits.',
    'OUTFIT from the Chinese prompt description; ignore clothing on the reference plate.',
    textBit,
    faceBit,
    'Do NOT paste the reference plate into any panel.',
    genderLock,
    'Pencil/ink lineart with soft color wash and paper texture; NOT heavy cel flat colors, NOT monochrome ink-only page, NOT photorealistic, NO logo watermark.',
    'FORBIDDEN: 2x2 four-panel landscape 16:9; six-panel / nine-panel; empty studio background; single full-bleed illustration without panel borders; character sheet / turnaround / contact sheet.',
  ].filter(Boolean).join(' ')
}

function storyboardFramingFallback(
  framing: AgnesShotFraming,
  exactPeople: number,
  gender?: 'male' | 'female',
): string {
  const n = Math.max(1, Math.min(4, Math.floor(Number(exactPeople) || 1)))
  const countBit = n <= 1
    ? 'EXACTLY 1 person in frame; no extras, no crowd, no twin clones, no right-side avatar stickers.'
    : `EXACTLY ${n} different named people in frame matching reference portraits; distinct faces/hair; no twin clones, no right-side avatar stickers, no unnamed crowd stealing focus.`
  const genderLock = n <= 1 ? agnesGenderLockEn(gender) : ''
  const base = genderLock ? `${countBit} ${genderLock}` : countBit
  if (framing === 'full-body') {
    return `16:9 cinematic anime still of a real scene with environment; FULL BODY head-to-toe with feet/shoes visible; character looks at props or off-screen target, NOT at camera; ${base} NOT white background; NOT character reference sheet.`
  }
  if (framing === 'close-up') {
    return `16:9 cinematic anime still; close-up / near shot with real environment behind; character looks at props or off-screen target, NOT at camera; ${base} NOT white background; NOT character reference sheet.`
  }
  return `16:9 cinematic anime still; MEDIUM waist-up framing with real environment depth; character looks at props or off-screen target, NOT at camera; ${base} NOT full-body lineup; NOT white background; NOT character reference sheet.`
}

export class AgnesImageAdapter implements ImageProviderAdapter {
  readonly provider = 'agnes'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = resolveAgnesImageModel(record.model || config.model)
    // 分镜：纯定妆仍限 AGNES_STORYBOARD_MAX_REFS；有场景/道具时按已挂载内容全部送出
    const promptPeek = String(record.prompt || '')
    const isNovelComicQuad = isAgnesNovelComicQuadPagePrompt(promptPeek)
    const isStoryboardScenePeek = !isNovelComicQuad
      && /对照定妆「|对照场景「|对照道具「|16:9横屏短剧解说|单帧剧情场景|锋利细线稿硬边赛璐璐|【定妆参考顺序：|【场景参考：|【道具参考顺序：|@图\d+|【画面】/.test(promptPeek)
    const hasEnvMarkers = /【场景参考：|【道具参考顺序：|对照场景「|对照道具「|@图\d+\s*为\S+场景|@图\d+\s*为\S+道具/.test(promptPeek)
    const attached = parseReferenceImages(record.referenceImages)
    const refs = (isStoryboardScenePeek && !hasEnvMarkers && !isNovelComicQuad)
      ? attached.slice(0, AGNES_STORYBOARD_MAX_REFS)
      : attached
    // 落库文案为终稿；仅当挂了场景/道具参考时补英文 REFERENCE USAGE，避免 Agnes 把环境图当脸
    let prompt = String(record.prompt || '').trim() || 'character portrait'
    if (refs.length && hasEnvMarkers && !hasAgnesStoryboardRefPrefix(prompt) && !isNovelComicQuad) {
      const refSlots = parseAgnesMixedRefSlots(prompt, refs.length)
      const sceneAnchor = (prompt.match(/对照场景「([^」]+)」/) || prompt.match(/【场景参考：([^】、,，]+)/) || [])[1]
        || 'cinematic drama scene'
      const portraitLabels = refSlots.filter(s => s.kind === 'portrait').map(s => s.label)
      const prefix = refs.length === 1
        ? buildAgnesSingleRefStoryboardPrefix({
          refKind: refSlots[0]?.kind || 'portrait',
          refLabel: refSlots[0]?.label,
          sceneAnchor,
        })
        : buildAgnesMultiRefCombinePrefix({
          refCount: refs.length,
          portraitLabels,
          sceneAnchor,
          exactPeople: Math.max(1, portraitLabels.length),
          refSlots,
          promptForSlots: prompt,
        })
      prompt = `${prefix}\n${prompt}`
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      size: normalizeAgnesImageSize(record.size),
      extra_body: {
        response_format: 'url',
      } as Record<string, unknown>,
    }

    if (refs.length) {
      ;(body.extra_body as Record<string, unknown>).image = refs
    }

    return {
      url: joinProviderUrl(agnesBase(config), '', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const url = result?.data?.[0]?.url
    if (url) return { isAsync: false, imageUrl: String(url) }
    const b64 = result?.data?.[0]?.b64_json
    if (b64) {
      // 同步 base64：由 extractImageBase64 处理
      return { isAsync: false }
    }
    const taskId = result?.id || result?.task_id
    if (taskId) return { isAsync: true, taskId: String(taskId) }
    throw new Error(`Unexpected Agnes image response: ${JSON.stringify(result).slice(0, 240)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(agnesBase(config), '', `/images/generations/${encodeURIComponent(taskId)}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    const url = result?.data?.[0]?.url
    if (url) return { status: 'completed', imageUrl: String(url) }
    const status = String(result?.status || result?.task_status || '').toLowerCase()
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: result?.error?.message || result?.message || 'Agnes image failed' }
    }
    if (status === 'processing' || status === 'pending' || status === 'running') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractImageUrl(result: any): string | null {
    return result?.data?.[0]?.url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result?.data?.[0]?.b64_json
    if (!b64) return null
    return { data: String(b64), mimeType: 'image/png' }
  }
}
