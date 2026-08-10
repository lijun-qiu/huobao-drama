/**
 * ComfyUI REST 客户端 — 队列工作流、轮询、拷贝输出
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import sharp from 'sharp'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { qwenEditUnetForModel } from '../constants/image-models.js'
import {
  THREE_VIEW_EMPTY_HANDS_EN,
  THREE_VIEW_PORTRAIT_FRAMING,
  THREE_VIEW_PORTRAIT_FRAMING_MINIMAL,
  sanitizePortraitEyeColorText,
  sanitizePortraitExpressionText,
} from '../constants/portrait-reference.js'
import {
  artStylePrompt,
  normalizeArtStyle,
  NARRATION_MINIMAL_STYLE,
  NARRATION_ANIME_STYLE,
  isMotionComicStyle,
  isNovelComicSketchStyle,
  usesComicIllustrationPipeline,
} from '../constants/art-styles.js'
import {
  MOTION_COMIC_ART_STYLE_EN,
  MOTION_COMIC_PORTRAIT_STYLE_EN,
} from '../constants/motion-comic.js'
import {
  NOVEL_COMIC_SKETCH_ART_STYLE_EN,
  NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_EN,
} from '../constants/novel-comic.js'
import { compressFluxChinesePrompt, compressFluxEnglishPrompt, compressSdxlInstantIdStoryboardEnglish, parseFluxEnglishSections } from '../constants/flux-prompt-compact.js'
import { enrichFluxStoryboardPrompt } from './flux-storyboard-enrich.js'
import { purgeChineseFromFluxEnglish } from '../constants/flux-prompt-en-sanitize.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { getAbsolutePath } from '../utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKFLOW_DIR = path.resolve(__dirname, '../../workflows/comfyui')

type ComfyPrompt = Record<string, { class_type: string; inputs: Record<string, unknown> }>

export type ComfyVisualFamily = 'anime' | 'cinematic' | 'realistic'

export function resolveComfyVisualFamily(style?: string | null): ComfyVisualFamily {
  const key = normalizeArtStyle(style)
  if (key === 'realistic') return 'realistic'
  if (key === 'cinematic') return 'cinematic'
  return 'anime'
}

export function resolveComfyCheckpoint(style?: string | null): string {
  const family = resolveComfyVisualFamily(style)
  if (family === 'realistic' || family === 'cinematic') {
    const realistic = LOCAL_COMIC_ENV.sdxlRealisticCheckpoint?.trim()
    if (realistic) return realistic
  }
  return LOCAL_COMIC_ENV.sdxlCheckpoint
}

/** 定妆四视图：优先 LOCAL_SDXL_PORTRAIT_CHECKPOINT，否则与分镜共用 sdxlCheckpoint */
export function resolveComfyPortraitCheckpoint(style?: string | null): string {
  const portrait = LOCAL_COMIC_ENV.sdxlPortraitCheckpoint?.trim()
  if (portrait) return portrait
  return resolveComfyCheckpoint(style)
}

export type PortraitCheckpointFamily = 'pony' | 'animagine' | 'generic'

/** 定妆底模族：Animagine 与 Pony 的 prompt 词表完全不同，混用会出角色设定表 */
export function resolvePortraitCheckpointFamily(checkpoint?: string | null): PortraitCheckpointFamily {
  const name = String(checkpoint || LOCAL_COMIC_ENV.sdxlPortraitCheckpoint || '').toLowerCase()
  if (/pony/i.test(name)) return 'pony'
  if (/animagine|counterfeit|wai-?ns|noobai|autismmix/i.test(name)) return 'animagine'
  return 'generic'
}

/** 无写实底模时，电影质感/写实画风改用动漫 prompt，避免 pony 底模与 photorealistic 词冲突 */
export function resolveComfyPromptFamily(style?: string | null): ComfyVisualFamily {
  const family = resolveComfyVisualFamily(style)
  if ((family === 'cinematic' || family === 'realistic') && !LOCAL_COMIC_ENV.sdxlRealisticCheckpoint?.trim()) {
    return 'anime'
  }
  return family
}

function shortComfyStylePrompt(style?: string | null, context: 'portrait' | 'scene' = 'scene'): string {
  const key = normalizeArtStyle(style)
  if (usesComicIllustrationPipeline(key)) {
    return comfyVisualStylePrompt(style, context)
  }
  const full = artStylePrompt(style, context).trim()
  if (!full) return ''
  return full.split(',').slice(0, 5).join(',').trim()
}

/** Comfy 场景/定妆英文画风（motion-comic 国漫 / novel-comic-sketch：配图彩漫四格、定妆黑白素笔） */
function comfyVisualStylePrompt(style?: string | null, context: 'portrait' | 'scene' = 'scene'): string {
  const key = normalizeArtStyle(style)
  if (key === NARRATION_MINIMAL_STYLE) {
    return 'simple flat 2D cartoon, bold black outline, round face with eye highlights, minimalist proportions'
  }
  if (isNovelComicSketchStyle(key)) {
    return context === 'portrait' ? NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_EN : NOVEL_COMIC_SKETCH_ART_STYLE_EN
  }
  if (isMotionComicStyle(key)) {
    return context === 'portrait' ? MOTION_COMIC_PORTRAIT_STYLE_EN : MOTION_COMIC_ART_STYLE_EN
  }
  if (key === NARRATION_ANIME_STYLE) {
    return context === 'portrait'
      ? 'Japanese 2D anime illustration portrait, Anime Style, large expressive anime eyes with catchlights, high-contrast cinematic modeling, pure white background, even soft studio lighting, normal young adult body proportions, NOT 3D CGI, NOT photorealistic, NOT chibi'
      : 'Japanese 2D anime illustration, Anime Style, high-contrast cinematic lighting, cool tones when tense, normal young adult body proportions, NOT 3D CGI, NOT photorealistic, NOT chibi'
  }
  if (key === 'short-drama') {
    return 'Chinese short drama 2D animation style, thin clean anime line art, flat soft cel shading, normal young adult body proportions, expressive anime face'
  }
  const full = artStylePrompt(style, context === 'portrait' ? 'portrait' : 'scene').trim()
  if (/[\u4e00-\u9fff【】]/.test(full)) {
    return context === 'portrait'
      ? 'anime illustration, clean lineart, cel shading, normal body proportions, expressive anime face, plain white background'
      : 'anime illustration, clean lineart, cel shading, dramatic lighting, 16:9 widescreen'
  }
  return full.split(',').slice(0, context === 'portrait' ? 4 : 5).join(',').trim()
}

/** ComfyUI 定妆专用英文画风词（禁止注入中文 bracket prompt，Pony 会把「三视图同屏」理解成多人） */
function comfyPortraitStylePrompt(style?: string | null): string {
  return comfyVisualStylePrompt(style, 'portrait')
}

function stripCjkFromPrompt(text: string): string {
  return String(text || '')
    .replace(/[\u4e00-\u9fff【】、，。；：！？]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,+/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()
}

/** 从姓名/定位推断性别（优先于定妆文案，避免 LLM 错写成异性后锁死） */
const PORTRAIT_FEMALE_ROLE_RE =
  /女主|女主角|女性主角|女配|母亲|妈妈|女儿|妻子|老婆|女友|闺蜜|姐妹|师姐|师妹|阿姨|婶|奶奶|姥姥|外婆|小姐|女士|姑娘|夫人|媳妇|女王|女同学|女老师|女同事|嫂/
const PORTRAIT_MALE_ROLE_RE =
  /男主|男主角|男性主角|男配|父亲|爸爸|儿子|丈夫|老公|男友|师兄|师弟|叔叔|大爷|爷爷|外公|姥爷|老哥|小弟|男同学|男老师|男同事|伯/
const PORTRAIT_FEMALE_NAME_RE = /[姐婶婆妹姨娘奶]|小姐|女士|姑娘|阿姨/
const PORTRAIT_MALE_NAME_RE = /[爷伯叔哥弟汉]|先生|大叔/

export type PortraitGender = 'male' | 'female' | 'unknown'

/** 仅凭姓名+定位的性别（不含 appearance，供定妆生成前锁定） */
export function resolveIdentityPortraitGender(
  characterName?: string | null,
  role?: string | null,
): PortraitGender {
  const roleStr = String(role || '').trim()
  const nameStr = String(characterName || '').trim()
  if (/^女主$|^女主人?$/.test(roleStr) || /女主角|女性主角/.test(roleStr)) return 'female'
  if (/^男主$|^男主人?$/.test(roleStr) || /男主角|男性主角/.test(roleStr)) return 'male'
  if (/^女主$/.test(nameStr)) return 'female'
  if (/^(男主|主角|我)$/.test(nameStr)) return 'male'
  // 「主要配角·妻子」等：先看身份词，勿被「配角」里的歧义带偏
  if (PORTRAIT_FEMALE_ROLE_RE.test(roleStr)) return 'female'
  if (PORTRAIT_MALE_ROLE_RE.test(roleStr)) return 'male'
  if (PORTRAIT_FEMALE_NAME_RE.test(nameStr) || (/女/.test(nameStr) && !/男女/.test(nameStr))) return 'female'
  if (PORTRAIT_MALE_NAME_RE.test(nameStr)) return 'male'
  return 'unknown'
}

/**
 * 从旁白/剧本片段补性别：她/他、妻子/丈夫等靠近角色名时生效。
 * 仅在 identity 未知时使用。
 */
export function inferPortraitGenderFromScript(
  characterName?: string | null,
  script?: string | null,
): PortraitGender {
  const name = String(characterName || '').trim()
  const s = String(script || '')
  if (!name || !s) return 'unknown'
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const near = new RegExp(`${esc}[^。！？\\n]{0,24}(她|妻子|老婆|女友|母亲|女儿|姐姐|妹妹|姑娘)|(?:她|妻子|老婆|女友)[^。！？\\n]{0,24}${esc}`)
  if (near.test(s)) return 'female'
  const nearMale = new RegExp(`${esc}[^。！？\\n]{0,24}(他(?![们妈])|丈夫|老公|男友|父亲|儿子|哥哥|弟弟)|(?:他(?![们妈])|丈夫|老公|男友)[^。！？\\n]{0,24}${esc}`)
  if (nearMale.test(s)) return 'male'
  return 'unknown'
}

export function resolvePortraitGender(
  rawPrompt: string,
  characterName?: string | null,
  role?: string | null,
): PortraitGender {
  // 1) 姓名/定位优先：即使定妆误写「男性」，女主/妻子仍锁女性
  const identity = resolveIdentityPortraitGender(characterName, role)
  if (identity !== 'unknown') return identity

  const app = String(rawPrompt || '')
    .replace(/【画风规格[：:][^】]*】/g, ' ')
    .replace(/\bEnglish tags:\s*[\s\S]*$/i, ' ')
  // 2) 定妆正文显式性别
  if (/女性|女主|少女|女孩|女人|女士|1girl|female|woman/i.test(app) && !/男性|男主|1man|1boy/i.test(app)) {
    return 'female'
  }
  if (/男性|男主|中年男|1man|1boy|middle.?aged man|mature male|mature man/i.test(app)) {
    return 'male'
  }
  if (/女性/.test(app)) return 'female'
  if (/男性/.test(app)) return 'male'

  // 3) 弱线索（姓名称谓等）
  const text = `${characterName || ''} ${role || ''} ${app}`
  if (PORTRAIT_FEMALE_ROLE_RE.test(text) || PORTRAIT_FEMALE_NAME_RE.test(text) || /1girl|female|woman|少女/i.test(text)) {
    return 'female'
  }
  if (PORTRAIT_MALE_ROLE_RE.test(text) || PORTRAIT_MALE_NAME_RE.test(text) || /1man|1boy|male|boy/i.test(text)) {
    return 'male'
  }
  if (/男/.test(text) && !/女/.test(text)) return 'male'
  if (/女/.test(text)) return 'female'
  return 'unknown'
}

function resolveGenderHint(raw: string, characterName?: string | null, role?: string | null): string {
  const gender = resolvePortraitGender(raw, characterName, role)
  const text = `${characterName || ''} ${role || ''} ${raw}`
  if (gender === 'female') {
    if (/老年|晚年|白发|苍老|年迈|奶奶|姥姥|外婆|\d{2}\s*岁/.test(text)) {
      const age = text.match(/(\d{2})\s*岁/)
      const n = age ? Number(age[1]) : null
      if ((n != null && n >= 55) || /老年|晚年|白发|苍老|年迈|奶奶|姥姥|外婆/.test(text)) {
        return '1woman, elderly woman, old woman, solo female, mature female'
      }
    }
    if (/中年|母亲|妈妈|婶|阿姨|mature|middle.?aged/.test(text)) {
      return '1woman, mature woman, solo female'
    }
    return '1girl, solo female'
  }
  if (gender === 'male') {
    // 爷/伯/叔等称谓优先于笼统「男」→ 禁止落到 1boy/young man
    if (/爷爷|外公|姥爷|老太爷|老汉|老年|晚年|白发|苍老|年迈|elderly|old man|\d{2}\s*岁/.test(text) || /[爷伯]/.test(String(characterName || ''))) {
      const age = text.match(/(\d{2})\s*岁/)
      const n = age ? Number(age[1]) : null
      if ((n != null && n >= 55) || /爷爷|外公|姥爷|老太爷|老汉|老年|晚年|白发|苍老|年迈|elderly|old man|[爷伯]/.test(`${characterName || ''}${text}`)) {
        return '1man, elderly man, old man, solo male, male focus, wrinkled face, gray hair'
      }
    }
    if (/中年|middle.?aged|mature man|熟男|中年男|叔叔|大叔/.test(text) || /叔/.test(String(characterName || ''))) {
      return '1man, solo male, middle-aged man, male focus'
    }
    return '1boy, solo male, male focus'
  }
  return 'solo, single character'
}

/** 角色性别中文标签（配图文案【画面主体】用） */
export function resolveCharacterGenderLabelCn(
  name?: string | null,
  role?: string | null,
  appearance?: string | null,
): '男性' | '女性' | null {
  const gender = resolvePortraitGender(
    String(appearance || '').trim(),
    name,
    role,
  )
  if (gender === 'male') return '男性'
  if (gender === 'female') return '女性'
  return null
}

const COMFY_PORTRAIT_FEMALE_NEGATIVE =
  '1girl, female, woman, girl, feminine, breasts, cleavage, skirt, dress, long eyelashes, lipstick, makeup'
const COMFY_PORTRAIT_MALE_NEGATIVE =
  '1boy, male, man, masculine, flat chest, broad shoulders, adam apple'

function comfyUrl(pathSuffix: string) {
  return `${LOCAL_COMIC_ENV.comfyBaseUrl}${pathSuffix}`
}

async function comfyJson(method: string, pathSuffix: string, body?: unknown, timeoutMs = 30_000) {
  try {
    const resp = await fetch(comfyUrl(pathSuffix), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`ComfyUI ${method} ${pathSuffix} failed: ${resp.status} ${text.slice(0, 200)}`)
    }
    return resp.json()
  } catch (err: any) {
    const msg = String(err?.message || err || '')
    if (/aborted|timeout|信号灯|semaphore/i.test(msg)) {
      throw new Error(
        `ComfyUI ${method} ${pathSuffix} 超时或无响应（${msg}）。`
        + ' 请确认 ComfyUI 已启动且未卡死；16G 显存请保持 COMFY_IMAGE_CONCURRENCY=1，一次只跑一张图。',
      )
    }
    throw err
  }
}

export function loadWorkflowTemplate(name: string): ComfyPrompt {
  const file = path.join(WORKFLOW_DIR, `${name}.json`)
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
  const prompt: ComfyPrompt = {}
  for (const [nodeId, node] of Object.entries(raw)) {
    if (nodeId.startsWith('_')) continue
    const n = node as { class_type: string; inputs: Record<string, unknown> }
    prompt[nodeId] = { class_type: n.class_type, inputs: { ...n.inputs } }
  }
  return prompt
}

export function parseSize(size?: string | null): { width: number; height: number } {
  const raw = String(size || '768x1024')
  const [w, h] = raw.split(/[x*]/).map(Number)
  if (w > 0 && h > 0) return { width: w, height: h }
  return { width: 768, height: 1024 }
}

export const COMFY_PORTRAIT_SHEET_NEGATIVE = [
  'character sheet, reference sheet, turnaround sheet, model sheet, design sheet',
  'multiple views, contact sheet, sprite sheet, panel layout, grid layout, 2x3 grid, collage, split screen, comic panel',
  'outfit variations, wardrobe sheet, character lineup, age comparison, young and old together',
  'multiple girls, multiple boys, 2girls, 2boys, 3girls, 2men, duo, pair, twins, crowd, harem, ensemble cast, group photo',
].join(', ')

export const COMFY_PORTRAIT_NEGATIVE = [
  COMFY_PORTRAIT_SHEET_NEGATIVE,
  'lowres, bad quality, worst quality, bad anatomy, bad hands, extra fingers, missing fingers',
  'red bow, ribbon, neck bow, surreal, abstract, distorted anatomy, stick thin legs, spiral eyes, blank white eyes, chibi, blue skin',
  'solid red eyes, entirely red iris, completely red sclera, glowing red eyes, crimson eyes, blood-red eyes, demonic red eyes, red contact lenses filling the eye',
  'dark background, black background, grey background, gray background, gradient background, vignette, colored background',
  'spotlight, god rays, light beams, light streaks, rainbow, glowing strip, stage lighting, overhead light, rim light, dramatic lighting, chiaroscuro, moody lighting',
  'bedroom, living room, street, outdoor, scenery, wooden floor, floor, platform, circle platform, shadow on floor, wall, bokeh',
  'nsfw, nude, suggestive, explicit',
  'flat colors, dull colors, low detail, sketch, rough draft, chibi, stick figure',
  'text, watermark, logo, signature, blurry, realistic photo, 3d render',
  'extra limbs, duplicate, clone, twin, extra arms, missing pants',
  'mechanical ring, halo, circular frame, sci-fi, cyberpunk, hologram, data stream, glitch, corrupted image',
  'hands in pockets, hands in hoodie pocket, hood up covering face',
].join(', ')

export const COMFY_PORTRAIT_FACE_NEGATIVE = [
  COMFY_PORTRAIT_NEGATIVE,
  'full body, standing, legs, feet, shoes, knees, thighs, hips, waist down',
  'sitting, bench, chair, wooden floor, scenery, environment, low angle, cowboy shot',
  'turnaround sheet, multiple characters, character sheet',
].join(', ')

export const COMFY_PORTRAIT_BODY_NEGATIVE = [
  COMFY_PORTRAIT_NEGATIVE,
  'close-up face only, portrait crop, headshot only, bust only, face only',
  'sitting, lying, action pose, dynamic pose, walking, running',
  'turnaround sheet, multiple views, contact sheet, panel layout, collage, grid layout, 2x3 grid, six people, outfit variations, costume board, wardrobe sheet',
  '2boys, 2girls, 2men, duo, pair, twins, two people, multiple people, character lineup, age comparison, young and old together',
].join(', ')

const COMFY_PORTRAIT_NEGATIVE_CINEMATIC = COMFY_PORTRAIT_NEGATIVE
  .replace(/, realistic photo/g, '')
  .replace(/3d, realistic photo/g, '3d render')

const COMFY_PORTRAIT_NEGATIVE_REALISTIC = [
  'score_6, score_5, score_4, worst quality, low quality',
  'multiple people, crowd, 2girls, 2boys, ensemble cast',
  'bedroom, living room, street scenery, detailed background, story panel',
  'nsfw, nude, suggestive, anatomical study, cyborg, monster, pixel art',
  'close-up face only, single view only, action pose, sitting, lying',
  'gray background, gradient background',
  'solid red eyes, entirely red iris, completely red sclera, glowing red eyes, crimson eyes, blood-red eyes',
  'extra limbs, bad anatomy, bad hands, duplicate, clone, twin',
  'text, watermark, logo, blurry, anime, cartoon, cel shading, chibi, illustration',
].join(', ')

export function resolveComfyPortraitNegative(style?: string | null): string {
  return resolveComfyPortraitBodyNegative(style)
}

export function resolveComfyPortraitFaceNegative(style?: string | null): string {
  return COMFY_PORTRAIT_FACE_NEGATIVE
}

export function resolveComfyPortraitBodyNegative(style?: string | null): string {
  const family = resolveComfyVisualFamily(style)
  if (family === 'realistic') return COMFY_PORTRAIT_NEGATIVE_REALISTIC
  if (family === 'cinematic') return COMFY_PORTRAIT_NEGATIVE_CINEMATIC
  return COMFY_PORTRAIT_BODY_NEGATIVE
}

/** 单视角全身：额外排除错误朝向，避免侧/背图仍生成正面 */
export function resolveComfyPortraitViewNegative(
  view: 'front' | 'side' | 'back',
  style?: string | null,
  checkpoint?: string | null,
  gender?: PortraitGender | null,
): string {
  const base = resolveComfyPortraitBodyNegative(style)
  const ckptFamily = resolvePortraitCheckpointFamily(checkpoint)
  const animagineExtra = ckptFamily === 'animagine'
    ? ', side view, profile, from side, from behind, back view, headless, cropped head'
    : ''
  const genderExtra = gender === 'male'
    ? `, ${COMFY_PORTRAIT_FEMALE_NEGATIVE}`
    : gender === 'female'
      ? `, ${COMFY_PORTRAIT_MALE_NEGATIVE}`
      : ''
  if (view === 'front') {
    return `${base}${genderExtra}, side profile, back view, from behind, from side, rear view, 3/4 view, looking away${animagineExtra}`
  }
  if (view === 'side') {
    return `${base}, front view, facing camera, facing viewer, frontal pose, symmetrical face, both eyes visible, looking at viewer, back view, from behind, three quarter view, 3/4 view, dutch angle`
  }
  return `${base}, front view, side profile, facing camera, face visible, eyes visible, looking at viewer, frontal, 3/4 view, from side, three quarter view, looking at camera, 2boys, 2girls, duo, pair, twins, two people, multiple figures`
}

/** Pony/SDXL 易误解词 → 更中性的英文标签 */
function sanitizePortraitEnglishTags(tags: string): string {
  return sanitizePortraitExpressionText(sanitizePortraitEyeColorText(String(tags || '')))
    .replace(/\bmature\b/gi, 'adult')
    .replace(/\bstrong build\.?\b/gi, 'athletic build')
    .replace(/\bsame character as youth reference\b/gi, '')
    .replace(/\byouth reference\b/gi, '')
    .replace(/\byoung and old together\b/gi, '')
    .replace(/[，。；;]+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,+/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()
}

const SCENE_ONLY_TAG_PATTERN = /\b(empty scene|no people|no characters|establishing shot|background art|environment illustration|environment photography|cinematic background art)\b/gi

function sanitizeStoryboardEnglishTags(tags: string): string {
  return sanitizePortraitEnglishTags(tags)
    .replace(SCENE_ONLY_TAG_PATTERN, '')
    .replace(/,\s*,+/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()
}

/** appearance 中的 English tags → ComfyUI 定妆提示（布局词必须靠前，CLIP 约 77 token） */
export function toComfyPortraitPrompt(
  rawPrompt: string,
  characterName?: string | null,
  visualStyle?: string | null,
  role?: string | null,
): string {
  const raw = String(rawPrompt || '').trim()
  const cnBody = raw
    .replace(/\s*\bEnglish tags:\s*[\s\S]*$/i, '')
    .replace(/【画风规格[：:][^】]*】/g, ' ')
    .trim()
  const tagged = raw.match(/\bEnglish tags:\s*([^\n【]+)/i)
  let englishTags = sanitizePortraitEnglishTags(tagged?.[1]?.replace(/[，。]+$/, '').trim() || '')
  if (!englishTags) {
    const latinChunks = raw.split(/[，,]/).map(s => s.trim())
      .filter(s => /^[a-zA-Z][\w\s\-'#/]+$/i.test(s) && s.length >= 6)
    englishTags = sanitizePortraitEnglishTags(latinChunks.join(', '))
  }
  if (englishTags) {
    englishTags = sanitizePortraitEnglishTags(
      reconcileEnglishTagsWithChineseAppearance(cnBody, englishTags),
    )
  }

  const genderHint = resolveGenderHint(raw, characterName, role)
  const family = resolveComfyVisualFamily(visualStyle)
  const styleTag = comfyPortraitStylePrompt(visualStyle)
  const minimal = normalizeArtStyle(visualStyle) === 'narration-minimal'
  const layoutCore = minimal ? THREE_VIEW_PORTRAIT_FRAMING_MINIMAL : THREE_VIEW_PORTRAIT_FRAMING
  const layoutShort = layoutCore
    .split(',')
    .slice(0, 4)
    .join(',')
    .replace(/\s+/g, ' ')
    .trim()

  const soloTag = genderHint.includes('1girl')
    ? '1girl, solo female, single character only'
    : genderHint.includes('1boy')
      ? '1boy, solo male, single character only'
      : 'solo, single character only'

  const sharedHead = [
    COMFY_PORTRAIT_QUALITY,
    soloTag,
    layoutShort,
    englishTags,
  ].filter(Boolean)

  if (family === 'realistic') {
    return [
      'score_9, score_8_up, photorealistic',
      soloTag,
      layoutShort,
      englishTags,
      styleTag,
      THREE_VIEW_EMPTY_HANDS_EN,
      'NOT multiple people, NOT lineup',
    ].filter(Boolean).join(', ')
  }

  if (family === 'cinematic') {
    return [
      ...sharedHead,
      styleTag,
      'cinematic single character portrait, dramatic film lighting, color graded',
      THREE_VIEW_EMPTY_HANDS_EN,
      'NOT multiple characters, NOT holding hands, NOT character sheet',
    ].filter(Boolean).join(', ')
  }

  return [
    '(solo:1.35), (single person:1.3), (one character only:1.25)',
    ...sharedHead,
    styleTag,
    'single front full-body anime illustration, clean lineart, cel shading, follow appearance face and hair exactly',
    'natural dark iris, white sclera, catchlights in eyes',
    THREE_VIEW_EMPTY_HANDS_EN,
    'NOT character sheet, NOT reference sheet, NOT turnaround, NOT grid, NOT multiple views, NOT outfit variations',
  ].filter(Boolean).join(', ')
}

function mergePortraitEnglishTags(explicit: string, fullRaw: string, characterName?: string | null, role?: string | null): string {
  const fromFallback = fallbackEnglishTagsFromAppearance(fullRaw, characterName, role)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const fromExplicit = String(explicit || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const merged: string[] = []
  const seen = new Set<string>()
  // 显式 English tags 优先，避免 fallback 里的 young man 覆盖 middle-aged
  for (const tag of [...fromExplicit, ...fromFallback]) {
    const key = tag.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(tag)
  }
  const hasMiddleAged = merged.some(t => /middle.?aged|mature man|1man/i.test(t))
  const filtered = hasMiddleAged
    ? merged.filter(t => !/^1boy$|^young man$|teen|youth|same character as youth|youth reference/i.test(t.trim()))
    : merged.filter(t => !/same character as youth|youth reference|young and old|age comparison/i.test(t.trim()))
  return sanitizePortraitEnglishTags(stripCjkFromPrompt(filtered.slice(0, 14).join(', ')))
}

function portraitEnglishTags(rawPrompt: string, characterName?: string | null, role?: string | null): string {
  const raw = String(rawPrompt || '').trim()
  const tagged = raw.match(/\bEnglish tags:\s*([^\n【]+)/i)
  let englishTags = sanitizePortraitEnglishTags(tagged?.[1]?.replace(/[，。]+$/, '').trim() || '')
  if (!englishTags) {
    const latinChunks = raw.split(/[，,]/).map(s => s.trim())
      .filter(s => /^[a-zA-Z][\w\s\-'#/]+$/i.test(s) && s.length >= 6)
    englishTags = sanitizePortraitEnglishTags(latinChunks.join(', '))
  }
  return mergePortraitEnglishTags(englishTags, raw, characterName, role)
}

function dedupePortraitTagList(tags: string): string {
  const parts = String(tags || '').split(',').map(s => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const key = part.toLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key)) continue
    if (key === '1man' && out.some(t => /^1man$|^1boy$/i.test(t))) continue
    if (/middle.?aged/.test(key) && out.some(t => /middle.?aged/i.test(t))) continue
    if (/^dark suit$/i.test(key) && out.some(t => /dark grey suit|dark gray suit/i.test(t))) continue
    if (/^short black hair$/i.test(key) && out.some(t => /neat short black hair/i.test(t))) continue
    if (/^round rim glasses$/i.test(key) && out.some(t => /dark round glasses|round glasses/i.test(t))) continue
    if (/^glasses$/i.test(key) && out.some(t => /glasses/i.test(t))) continue
    seen.add(key)
    out.push(part)
  }
  return out.slice(0, 10).join(', ')
}

function filterPortraitWardrobeTags(tags: string): string {
  const parts = String(tags || '').split(',').map(s => s.trim()).filter(Boolean)
  let gotTop = false
  let gotBottom = false
  const out: string[] = []
  for (const part of parts) {
    const lower = part.toLowerCase()
    const isTop = /hoodie|shirt|suit|jacket|blazer|coat|uniform|dress|blouse|sweater|top/i.test(lower)
    const isBottom = /pants|jeans|trousers|skirt|shorts|slacks/i.test(lower)
    if (isTop) {
      if (gotTop) continue
      gotTop = true
    }
    if (isBottom) {
      if (gotBottom) continue
      gotBottom = true
    }
    out.push(part)
  }
  return out.slice(0, 8).join(', ')
}

function portraitCoreTags(rawPrompt: string, characterName?: string | null, role?: string | null): string {
  const tagSource = appearanceForComfyPortrait(rawPrompt, characterName, role) || rawPrompt
  return filterPortraitWardrobeTags(dedupePortraitTagList(portraitEnglishTags(tagSource, characterName, role)))
}

const COMFY_PORTRAIT_QUALITY = 'masterpiece, best quality, very aesthetic, absurdres, newest, highly detailed'

function portraitSoloTag(rawPrompt: string, characterName?: string | null, role?: string | null): string {
  const gender = resolvePortraitGender(rawPrompt, characterName, role)
  const text = `${characterName || ''} ${role || ''} ${String(rawPrompt || '')
    .replace(/【画风规格[：:][^】]*】/g, ' ')
    .replace(/\bEnglish tags:\s*[\s\S]*$/i, ' ')
    .replace(/年龄按角色写老年\s*[\/／]\s*中年\s*[\/／]\s*青年[^，。；]*/g, ' ')
    .replace(/发丝冷白轮廓高光/g, ' ')}`
  const age = Number(text.match(/(\d{1,2})\s*岁/)?.[1] || NaN)
  if (gender === 'female') {
    if ((Number.isFinite(age) && age >= 55) || /老年女性|晚年|花白|苍老|年迈|奶奶|姥姥|外婆|elderly|old woman/.test(text)) {
      return '1woman, elderly woman, old woman, solo female, single character only'
    }
    if ((Number.isFinite(age) && age >= 28) || /中年|母亲|妈妈|婶|阿姨|mature|middle.?aged/.test(text)) {
      return '1woman, mature woman, solo female, single character only'
    }
    return '1girl, solo female, single character only'
  }
  if (
    (Number.isFinite(age) && age >= 55)
    || /爷爷|外公|姥爷|老太爷|老汉|老年男性|晚年|花白|苍老|年迈|elderly|old man/.test(text)
    || /[爷伯]/.test(String(characterName || ''))
  ) {
    return '1man, elderly man, old man, solo male, single character only, male focus, wrinkled face'
  }
  if (
    (Number.isFinite(age) && age >= 35 && age < 55)
    || /中年|middle.?aged|mature man|熟男|叔叔|大叔|父亲|爸爸/.test(text)
    || /叔/.test(String(characterName || ''))
  ) {
    return '1man, solo male, single character only, middle-aged man, male focus, mature male'
  }
  if (gender === 'male') return '1boy, solo male, single character only, male focus'
  return 'solo, single character only'
}

/** 定妆拼版 · 面部特写（第 1 列） */
export function toComfyPortraitFacePrompt(rawPrompt: string, characterName?: string | null, visualStyle?: string | null): string {
  const englishTags = portraitEnglishTags(rawPrompt, characterName)
  const soloTag = portraitSoloTag(rawPrompt, characterName)
  const styleTag = comfyPortraitStylePrompt(visualStyle)
  const minimal = normalizeArtStyle(visualStyle) === 'narration-minimal'

  if (minimal) {
    return [
      COMFY_PORTRAIT_QUALITY,
      soloTag,
      'simple flat 2D cartoon character, bold black outline, round face with highlights',
      'head and shoulders portrait, bust shot, face fills 60 percent of frame, pure white background',
      englishTags,
      styleTag,
      'NOT full body, NOT stick figure ghost, NOT multiple characters',
    ].filter(Boolean).join(', ')
  }

  return [
    COMFY_PORTRAIT_WHITE_BG,
    COMFY_PORTRAIT_QUALITY,
    soloTag,
    'high quality anime portrait, follow appearance face hair and eyes exactly, head and shoulders',
    'highly detailed eyes with catchlights, soft even lighting',
    englishTags,
    styleTag,
    'NOT full body, NOT legs, NOT scenery, NOT multiple characters',
  ].filter(Boolean).join(', ')
}

const COMFY_PORTRAIT_WHITE_BG =
  '(pure white background:1.5), (simple white background:1.4), white backdrop, even soft studio lighting, no floor, no scenery, no cast shadow on background'

function comfyPortraitRenderStyle(visualStyle?: string | null): string {
  const key = normalizeArtStyle(visualStyle)
  if (key === NARRATION_MINIMAL_STYLE) {
    return 'flat 2D cartoon, bold black outline'
  }
  if (key === NARRATION_ANIME_STYLE) {
    return 'Japanese 2D anime illustration, Anime Style, highly detailed anime eyes with catchlights, high-contrast cinematic modeling, polished character art, NOT thin-lineart recipe, NOT cel-shading recipe'
  }
  return comfyPortraitStylePrompt(visualStyle)
}

export const COMFY_MINIMAL_NEGATIVE = 'worst quality, low quality, bad anatomy, text, watermark, blurry'

const PORTRAIT_COMPOSITE_VIEW_LAYOUT: Record<'front' | 'side' | 'back', string> = {
  front: 'full body standing, front view, facing camera, 0 degree, symmetrical face, both eyes visible, looking at viewer',
  side: 'full body standing, strict side profile, 90 degree side view, single eye visible, looking to the side, profile silhouette',
  back: 'full body standing, back view, from behind, 180 degree, no face visible, back of head and outfit visible',
}

const PORTRAIT_FRONT_SOLO_LAYOUT =
  'full body, standing, front view, looking at viewer, arms at sides, empty hands, hands outside pockets, no handheld objects'

function portraitPrimarySoloTag(soloTag: string): string {
  const parts = String(soloTag || '').split(',').map(s => s.trim()).filter(Boolean)
  const gender = parts.find(p => /^1(man|boy|girl)$/i.test(p)) || parts[0] || 'solo'
  return `${gender}, solo`
}

function stripSoloGenderFromTags(tags: string): string {
  return String(tags || '')
    .split(',')
    .map(s => s.trim())
    .filter(t => t && !/^1(boy|man|girl)$/i.test(t) && !/^solo( male| female)?$/i.test(t))
    .join(', ')
}

/** Animagine：短 prompt，solo + male focus 放最前 */
function buildAnimaginePortraitFrontPrompt(
  englishTags: string,
  soloTag: string,
  gender: PortraitGender,
): string {
  const tags = stripSoloGenderFromTags(englishTags)
  const maleBoost = gender === 'male'
    ? ['male focus', 'male', 'masculine', 'adult male', 'flat chest']
    : gender === 'female'
      ? ['female focus', 'female']
      : []
  return [
    portraitPrimarySoloTag(soloTag),
    ...maleBoost,
    PORTRAIT_FRONT_SOLO_LAYOUT,
    COMFY_PORTRAIT_WHITE_BG,
    'plain clothes, no text on clothes, no logo, no print on hoodie',
    tags,
    'masterpiece, best quality, very aesthetic, newest',
  ].filter(Boolean).join(', ')
}

/** Pony：rating_safe + solo 靠前，仍保留 booru score 标签 */
function buildPonyPortraitFrontPrompt(englishTags: string, soloTag: string): string {
  return [
    'rating_safe',
    portraitPrimarySoloTag(soloTag),
    PORTRAIT_FRONT_SOLO_LAYOUT,
    'white background',
    englishTags,
    'score_9, score_8_up, source_anime',
  ].filter(Boolean).join(', ')
}

function buildComfyPortraitFrontSoloPrompt(
  englishTags: string,
  soloTag: string,
  _styleTag: string,
  checkpoint?: string | null,
  gender: PortraitGender = 'unknown',
): string {
  const ckptFamily = resolvePortraitCheckpointFamily(checkpoint)
  if (ckptFamily === 'animagine') {
    return buildAnimaginePortraitFrontPrompt(englishTags, soloTag, gender)
  }
  if (ckptFamily === 'pony') {
    return buildPonyPortraitFrontPrompt(englishTags, soloTag)
  }
  return buildAnimaginePortraitFrontPrompt(englishTags, soloTag, gender)
}

/** 定妆：从页面 prompt 提取 English tags，生成 SDXL 纯英文单视角 prompt */
export function toComfyPortraitCompositeViewPrompt(
  rawPrompt: string,
  view: 'front' | 'side' | 'back',
  characterName?: string | null,
  visualStyle?: string | null,
  checkpoint?: string | null,
  role?: string | null,
): string {
  const englishTags = portraitCoreTags(rawPrompt, characterName, role)
  const gender = resolvePortraitGender(rawPrompt, characterName, role)
  const soloTag = portraitSoloTag(rawPrompt, characterName, role)
  const styleTag = comfyPortraitRenderStyle(visualStyle)
  const family = resolveComfyVisualFamily(visualStyle)
  const minimal = normalizeArtStyle(visualStyle) === 'narration-minimal'
  const viewLayout = PORTRAIT_COMPOSITE_VIEW_LAYOUT[view]

  if (view === 'front' && !minimal && family !== 'realistic') {
    return buildComfyPortraitFrontSoloPrompt(englishTags, soloTag, styleTag, checkpoint, gender)
  }

  if (minimal) {
    return [
      COMFY_PORTRAIT_QUALITY,
      soloTag,
      'simple flat 2D cartoon character, bold black outline, round face with highlights',
      viewLayout,
      'neutral standing pose, arms at sides, empty hands, head to feet visible, pure white background',
      englishTags,
      styleTag,
      'single view only, NOT turnaround sheet, NOT multiple views, NOT character lineup',
    ].filter(Boolean).join(', ')
  }

  if (family === 'realistic') {
    return [
      'score_9, score_8_up, photorealistic',
      COMFY_PORTRAIT_WHITE_BG,
      soloTag,
      viewLayout,
      'neutral standing pose, arms at sides, empty hands, head to feet visible',
      englishTags,
      styleTag,
      THREE_VIEW_EMPTY_HANDS_EN,
      'single view only, NOT turnaround sheet, NOT multiple views',
    ].filter(Boolean).join(', ')
  }

  return [
    'score_9, score_8_up, source_anime',
    COMFY_PORTRAIT_WHITE_BG,
    COMFY_PORTRAIT_QUALITY,
    soloTag,
    viewLayout,
    'neutral standing pose, arms at sides, empty hands, head to feet visible',
    englishTags,
    styleTag,
    'single front full-body anime illustration, clean lineart, cel shading, follow appearance face and hair exactly',
    THREE_VIEW_EMPTY_HANDS_EN,
    'single view only, NOT turnaround sheet, NOT multiple views, NOT character lineup, NOT character sheet',
  ].filter(Boolean).join(', ')
}

/** @deprecated 页面六维中文 prompt 不能直接喂 SDXL；请用 toComfyPortraitCompositeViewPrompt */
export function portraitViewPromptFromPage(pagePrompt: string, view: 'front' | 'side' | 'back'): string {
  return toComfyPortraitCompositeViewPrompt(pagePrompt, view)
}

export function toComfyPortraitViewPrompt(
  rawPrompt: string,
  view: 'front' | 'side' | 'back',
  characterName?: string | null,
  visualStyle?: string | null,
): string {
  return toComfyPortraitCompositeViewPrompt(rawPrompt, view, characterName, visualStyle)
}

/** @deprecated 宽图三视图易出多人，请用 toComfyPortraitViewPrompt 分三次生成 */
export function toComfyPortraitBodyPrompt(rawPrompt: string, characterName?: string | null, visualStyle?: string | null): string {
  return toComfyPortraitViewPrompt(rawPrompt, 'front', characterName, visualStyle)
}

/** 无 English tags 时从中文外貌提取简单英文标签（不依赖 LLM） */
export function fallbackEnglishTagsFromAppearance(raw: string, characterName?: string | null, role?: string | null): string {
  // 只看外貌正文：去掉画风规格 / English tags / 说明性套话，避免「写老年」「夜调深蓝」误触发
  const appearanceBody = String(raw || '')
    .replace(/【画风规格[：:][^】]*】/g, ' ')
    .replace(/\bEnglish tags:\s*[\s\S]*$/i, ' ')
    .replace(/年龄按角色写老年\s*[\/／]\s*中年\s*[\/／]\s*青年[^，。；]*/g, ' ')
    .replace(/禁止全员写成青年小伙/g, ' ')
    .replace(/高对比冷色夜调[（(][^）)]*[）)]/g, ' ')
    .replace(/发丝冷白轮廓高光/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const text = `${characterName || ''} ${role || ''} ${appearanceBody}`
  const gender = resolvePortraitGender(appearanceBody, characterName, role)
  const tags: string[] = []
  const ageMatch = appearanceBody.match(/(\d{1,2})\s*岁/)
  const age = ageMatch ? Number.parseInt(ageMatch[1], 10) : null
  const elderCue = /爷爷|外公|姥爷|老太爷|老汉|老年男性|老年女性|晚年|白发|花白|苍老|年迈|elderly|old man/.test(text)
    || /[爷伯]/.test(String(characterName || ''))
  const middleCue = /中年|middle.?aged|mature man|熟男|叔叔|大叔/.test(text)
    || /叔/.test(String(characterName || ''))
  const elderMale = gender === 'male' && (elderCue || (age != null && age >= 55))
  const middleMale = gender === 'male' && !elderMale && (middleCue || (age != null && age >= 35 && age < 55))
  if (elderMale) {
    tags.push('1man', 'elderly man', 'old man', age != null ? `${age}-year-old man` : 'elderly grandfather')
  } else if (middleMale) {
    tags.push('1man', 'middle-aged man', age != null ? `${age}-year-old man` : 'middle-aged man')
  } else if (gender === 'male' || /男|男主|male|boy|man/i.test(text)) {
    tags.push(age != null && age >= 18 ? '1man' : '1boy', age != null ? `${age}-year-old man` : 'young man')
  }
  if (gender === 'female' || (/女|女主|female|girl|woman/i.test(text) || /女|婶|婆|姨/.test(String(characterName || '')))) {
    // 已判定为男则不再叠女标签（防画风句误触）
    if (gender !== 'male' && !tags.some(t => /^1man$|^1boy$/i.test(t))) {
      if ((age != null && age >= 55) || /老年女性|晚年|花白|苍老|年迈|奶奶|姥姥|外婆|elderly/.test(text)) {
        tags.push('1woman', 'elderly woman', age != null ? `${age}-year-old woman` : 'elderly woman')
      } else if ((age != null && age >= 28) || /中年|母亲|妈妈|35|40|成熟|mature|middle.?aged|婶|阿姨/.test(text)) {
        tags.push('1woman', 'mature woman', `${age || 40}-year-old woman`)
      } else {
        tags.push('1woman', age != null ? `${age}-year-old woman` : 'young adult woman')
      }
    }
  }
  if (/程序员|programmer/i.test(text)) tags.push('programmer')
  if (/青年|young adult/i.test(text) && !/中年|老年|middle.?aged|elderly/i.test(text)) tags.push('young adult')
  if (/梳理整齐|整齐.*发|neat.*hair/i.test(text)) tags.push('neat short black hair')
  else if (/花白|白发|灰白|gray hair|grey hair|white hair/i.test(text)) tags.push('gray white hair')
  else if (/黑发|黑色短发|short black hair|black hair/i.test(text) && !elderMale) tags.push('short black hair')
  if (/长发|long hair/i.test(text)) tags.push('long hair')
  if (/深灰西装|dark grey suit|gray suit|grey suit/i.test(text)) tags.push('dark grey suit', 'white dress shirt')
  else if (/西装|suit/i.test(text)) tags.push('dark suit', 'white dress shirt')
  if (/连帽卫衣|灰色卫衣|grey hoodie|gray hoodie/i.test(text)) tags.push('grey hoodie')
  if (/深色|dark.*pants|黑.*裤|长裤|jeans|pants/i.test(text)) tags.push('dark pants')
  // 「无眼镜 / 不戴眼镜」不得匹配成 glasses
  const noGlasses = /无眼镜|不戴眼镜|没有眼镜|未戴眼镜|no glasses|without glasses/i.test(appearanceBody)
  if (!noGlasses && /圆框眼镜|round.?rim|round glasses/i.test(appearanceBody)) tags.push('round rim glasses')
  if (!noGlasses && /(?:^|[^无不没未])眼镜|(?:^|[^a-z])glasses\b/i.test(appearanceBody)) tags.push('glasses')
  if (/自信|坚定.*微笑|confident smile/i.test(text)) tags.push('calm eyes')
  if (/清澈|透亮|bright eyes|clear eyes/i.test(text)) {
    tags.push(gender === 'female' ? 'clear bright eyes' : 'sharp eyes')
  }
  if (/温和|gentle/i.test(text)) tags.push(gender === 'female' ? 'clear eyes' : 'calm eyes')
  if (/精致|handsome|refined/i.test(text)) {
    tags.push(gender === 'female' ? 'beautiful face' : 'masculine facial features')
  }
  if (/格子|格纹|plaid/i.test(text)) tags.push('plaid shirt')
  if (/#475569|蓝灰|blue.?grey/i.test(appearanceBody)) tags.push('blue-grey shirt')
  // 仅服装色号/穿深蓝，勿匹配画风「冷色夜调（深蓝…）」
  if (/#[0-9a-fA-F]{3,8}[^，。；]{0,12}深蓝|穿[^，。；]{0,16}深蓝|深蓝(?:色)?(?:夹克|外套|制服|衬衫|工装)/i.test(appearanceBody)
    || /#1e293b|#1e40af|#0f172a/.test(appearanceBody) && /夹克|制服|衬衫|外套|工装/.test(appearanceBody)) {
    tags.push('dark blue shirt')
  }
  // 优先写入中文里的 #hex（纯色号，避免中文污染 CLIP）
  const hexOnly = appearanceBody.match(/#[0-9a-fA-F]{3,8}/)
  if (hexOnly?.[0]) tags.push(hexOnly[0].toLowerCase())
  tags.push('neutral face', 'no expression')
  if (/工装|uniform/i.test(text)) tags.push('work uniform')
  if (noGlasses) tags.push('no glasses')
  return reconcileEnglishTagsWithChineseAppearance(appearanceBody, [...new Set(tags)].slice(0, 14).join(', '))
}

/**
 * 中英文互校：中文写了「无眼镜」则剔除 glasses；写了具体 #hex 服装则去掉万能 dark blue shirt。
 */
export function reconcileEnglishTagsWithChineseAppearance(
  cnBody: string,
  enTags: string,
  context?: { name?: string | null; role?: string | null },
): string {
  const cn = String(cnBody || '')
  let tags = String(enTags || '').trim()
  if (!tags) return tags
  // 去掉混进 EN 行的中文残留与重复空词
  tags = tags
    .split(',')
    .map(t => t.trim())
    .filter(t => t && !/[\u4e00-\u9fff]/.test(t))
    .join(', ')
  const noGlasses = /无眼镜|不戴眼镜|没有眼镜|未戴眼镜/i.test(cn)
  const hasGlassesCn = !noGlasses && /(?:佩戴|戴着?|带)?(?:黑色|圆框|方框|金属)?眼镜|圆框眼镜|方框眼镜/.test(cn)
  if (noGlasses || !hasGlassesCn) {
    tags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/\bglasses\b|\beyeglasses\b|\bspectacles\b/i.test(t))
      .join(', ')
    if (noGlasses && !/\bno glasses\b/i.test(tags)) {
      tags = tags ? `${tags}, no glasses` : 'no glasses'
    }
  }
  const hasHexOutfit = /#[0-9a-fA-F]{3,8}/.test(cn)
  if (hasHexOutfit) {
    tags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/^dark blue shirt$/i.test(t))
      .join(', ')
  }
  // 深色定妆：去掉 white background 污染
  if (/深藏青|#0f172a|深色冷调|半脸深阴影|短剧解说高清国漫|禁止纯白/.test(cn)) {
    tags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/\b(pure\s+)?white background\b|\bwhite studio\b|\b16:9 widescreen pure white\b/i.test(t))
      .join(', ')
    if (!/\bdeep navy\b|\bdark (cool )?background\b|#0f172a/i.test(tags)) {
      tags = tags ? `${tags}, deep navy dark background #0f172a` : 'deep navy dark background #0f172a'
    }
  }
  const ageFromCn = Number(cn.match(/(\d{1,2})\s*岁/)?.[1] || NaN)
  const ageFromEn = Number(tags.match(/(\d{1,2})-year-old/i)?.[1] || NaN)
  const age = Number.isFinite(ageFromCn) ? ageFromCn : ageFromEn
  if ((Number.isFinite(age) && age < 50) || /青年|少年|儿童|孩童/.test(cn)) {
    tags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/\belderly\b|\bold man\b|\bold woman\b|\bwrinkled\b/i.test(t))
      .join(', ')
  }
  let gender = resolvePortraitGender(cn, context?.name, context?.role)
  if (gender === 'unknown') {
    const hasMale = /\b1man\b|\b1boy\b|\bmale\b/i.test(tags)
    const hasFemale = /\b1woman\b|\b1girl\b|\bfemale\b/i.test(tags)
    if (hasFemale && !hasMale) gender = 'female'
    else if (hasMale && !hasFemale) gender = 'male'
    else if (hasMale && hasFemale) {
      // 混叠时：儿童/女儿/卫衣等偏女；否则看 role
      if (/女儿|女童|姑娘|少女|儿童头身|小圆脸|卫衣/.test(cn) || /女儿|女主|母亲|妈妈/.test(String(context?.role || ''))) {
        gender = 'female'
      } else if (/儿子|男主|父亲|爸爸/.test(String(context?.role || '')) || /男性|男主/.test(cn)) {
        gender = 'male'
      } else {
        gender = 'female' // 混叠默认去男留女，避免男童标签污染女角
      }
    }
  }
  if (gender === 'male') {
    tags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/^1girl$|^1woman$/i.test(t) && !/\bfemale\b|\bwoman\b|\bgirl\b/i.test(t))
      .join(', ')
  } else if (gender === 'female') {
    tags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/^1boy$|^1man$/i.test(t) && !/\b(young )?man\b|\bold man\b|\bmale\b|\bboy\b/i.test(t))
      .join(', ')
  }
  return tags.replace(/,\s*,+/g, ', ').replace(/^,\s*|,\s*$/g, '').trim()
}

/** 仅保留 English tags，避免中文段落污染 CLIP */
export function appearanceForComfyPortrait(
  rawPrompt: string,
  characterName?: string | null,
  role?: string | null,
): string {
  const raw = String(rawPrompt || '').trim()
  const cnBody = raw
    .replace(/\s*\bEnglish tags:\s*[\s\S]*$/i, '')
    .replace(/【画风规格[：:][^】]*】/g, ' ')
    .trim()
  const tagged = raw.match(/\bEnglish tags:\s*([^\n【]+)/i)
  if (tagged?.[1]?.trim()) {
    const reconciled = reconcileEnglishTagsWithChineseAppearance(cnBody, tagged[1].trim(), {
      name: characterName,
      role,
    })
    return `English tags: ${sanitizePortraitEnglishTags(reconciled)}`
  }
  const fallback = fallbackEnglishTagsFromAppearance(raw, characterName, role)
  if (fallback) return `English tags: ${sanitizePortraitEnglishTags(fallback)}`
  return ''
}

export const COMFY_SCENE_NEGATIVE = [
  'score_6, score_5, score_4, worst quality, low quality',
  'people, person, character, face, portrait, crowd, harem, multiple girls, multiple boys, 2girls, 2boys, ensemble',
  'character turnaround, three views, design sheet, white background character reference',
  'nsfw, nude, suggestive, text, watermark, logo, blurry',
  'close-up, portrait crop, chibi, 3d render, realistic photo',
].join(', ')

const COMFY_SCENE_NEGATIVE_CINEMATIC = COMFY_SCENE_NEGATIVE.replace(', realistic photo', '')
const COMFY_SCENE_NEGATIVE_REALISTIC = [
  'score_6, score_5, score_4, worst quality, low quality',
  'people, person, character, face, portrait, crowd, ensemble',
  'character turnaround, three views, design sheet',
  'nsfw, nude, suggestive, text, watermark, logo, blurry',
  'close-up, portrait crop, chibi, anime, cartoon, cel shading, illustration',
].join(', ')

export function resolveComfySceneNegative(style?: string | null): string {
  const family = resolveComfyVisualFamily(style)
  if (family === 'realistic') return COMFY_SCENE_NEGATIVE_REALISTIC
  if (family === 'cinematic') return COMFY_SCENE_NEGATIVE_CINEMATIC
  return COMFY_SCENE_NEGATIVE
}

const COMFY_STORYBOARD_NEGATIVE_BASE = [
  'score_6, score_5, score_4, worst quality, low quality',
  'blurry, out of focus, soft focus, fuzzy face, unclear face, deformed face, bad face',
  'bad anatomy, bad hands, extra limbs, duplicate, clone',
  'text, watermark, logo, pixel art',
].join(', ')

export function resolveComfyStoryboardNegative(style?: string | null): string {
  const family = resolveComfyPromptFamily(style)
  if (family === 'realistic') return `${COMFY_STORYBOARD_NEGATIVE_BASE}, anime, cartoon, cel shading, chibi, illustration`
  if (family === 'cinematic') return `${COMFY_STORYBOARD_NEGATIVE_BASE}, chibi, pixel art, dithering`
  return `${COMFY_STORYBOARD_NEGATIVE_BASE}, realistic photo, 3d render, chibi, dithering`
}

/** 分镜/镜头帧：含角色与动作；角色/面部标签必须靠前（CLIP 约 77 token，后部会被截断） */
export function toComfyStoryboardPrompt(englishTags: string, visualStyle?: string | null): string {
  const tags = sanitizeStoryboardEnglishTags(String(englishTags || '').trim())
  const family = resolveComfyPromptFamily(visualStyle)
  const styleTag = shortComfyStylePrompt(visualStyle, 'scene').split(',').slice(0, 3).join(',').trim()
  const wantsCinematicLook = resolveComfyVisualFamily(visualStyle) === 'cinematic'
  const faceBoost = 'detailed face, sharp eyes, clear facial features, expressive anime face'
  const isWideShot = /\b(wide shot|long shot|establishing|distant view|full body|远景|全景)\b/i.test(tags)

  if (family === 'realistic') {
    const parts = [
      'score_9, score_8_up, photorealistic',
      tags,
      faceBoost,
      styleTag,
      isWideShot ? 'medium close-up, face visible' : '',
      'cinematic composition, natural lighting, 16:9 widescreen, high quality, no text, no watermark',
    ].filter(Boolean)
    return parts.join(', ')
  }

  const parts = [
    'score_9, score_8_up, score_7_up, source_anime',
    tags,
    faceBoost,
    isWideShot ? 'medium close-up, face visible' : '',
    styleTag,
    wantsCinematicLook
      ? 'anime illustration, clean lineart, cel shading, dramatic lighting, 16:9 widescreen, no text, no watermark'
      : 'anime illustration, clean lineart, cel shading, 16:9 widescreen, no text, no watermark',
  ].filter(Boolean)
  return parts.join(', ')
}

/** 场景/分镜背景：英文环境标签优先，禁止人物 */
export function toComfyScenePrompt(englishTags: string, visualStyle?: string | null): string {
  const tags = sanitizePortraitEnglishTags(String(englishTags || '').trim())
  const family = resolveComfyVisualFamily(visualStyle)
  const styleTag = shortComfyStylePrompt(visualStyle, 'scene')

  if (family === 'realistic') {
    const parts = [
      'score_9, score_8_up, photorealistic',
      'environment photography, establishing shot, empty scene, no people, no characters',
      tags,
      styleTag,
      'natural lighting, atmospheric perspective, 16:9 widescreen',
    ].filter(Boolean)
    return parts.join(', ')
  }

  if (family === 'cinematic') {
    const parts = [
      'score_9, score_8_up',
      'cinematic background art, film still, establishing shot, empty scene, no people, no characters',
      tags,
      styleTag,
      'dramatic lighting, color graded, atmospheric perspective, 16:9 widescreen',
    ].filter(Boolean)
    return parts.join(', ')
  }

  const parts = [
    'score_9, score_8_up, score_7_up, source_anime',
    'anime background art, environment illustration, establishing shot, empty scene, no people, no characters',
    tags,
    styleTag,
    'detailed environment, cinematic lighting, atmospheric perspective, 16:9 widescreen',
  ].filter(Boolean)
  return parts.join(', ')
}

/** SDXL 生图尺寸上限（场景/宫格；最长边 1280 清晰度优先） */
export function clampComfyImageSize(width: number, height: number, maxSide = 1280): { width: number; height: number } {
  const maxPixels = maxSide * maxSide
  let w = Math.max(512, Math.floor(width / 8) * 8)
  let h = Math.max(512, Math.floor(height / 8) * 8)
  if (w * h > maxPixels) {
    const scale = Math.sqrt(maxPixels / (w * h))
    w = Math.max(512, Math.floor(w * scale / 8) * 8)
    h = Math.max(512, Math.floor(h * scale / 8) * 8)
  }
  if (Math.max(w, h) > maxSide) {
    const scale = maxSide / Math.max(w, h)
    w = Math.max(512, Math.floor(w * scale / 8) * 8)
    h = Math.max(512, Math.floor(h * scale / 8) * 8)
  }
  return { width: w, height: h }
}

/** 分镜 16:9：1360 宽档，SDXL 清晰 + 后续放大到 1080p */
export function clampComfyStoryboardSize(width: number, height: number): { width: number; height: number } {
  return clampComfyImageSize(width, height, 1360)
}

/** Flux 分镜生图尺寸（16:9 → 约 1360×760，再放大到 1920×1080；批量省显存） */
export function resolveComfyFluxGenerationSize(): { width: number; height: number } {
  return clampComfyStoryboardSize(LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
}

/**
 * Qwen-Image-Edit 分镜尺寸：保持输出画幅比例（默认 16:9），最长边 ≤ maxSide。
 * 默认 maxSide 见 LOCAL_COMIC_ENV.qwenEditStoryboardMaxSide（1024；可用环境变量覆盖）。
 * 不用 clampComfyImageSize：其最小边 512 会把比例抬偏，再硬拉到 1080p 会压扁人物。
 */
export function resolveComfyQwenGenerationSize(
  maxSide = LOCAL_COMIC_ENV.qwenEditStoryboardMaxSide,
): { width: number; height: number } {
  const tw = Math.max(16, LOCAL_COMIC_ENV.outputWidth)
  const th = Math.max(16, LOCAL_COMIC_ENV.outputHeight)
  const scale = Math.min(1, maxSide / Math.max(tw, th))
  const align = (n: number) => Math.max(16, Math.round(n / 16) * 16)
  return {
    width: align(tw * scale),
    height: align(th * scale),
  }
}

/**
 * Flux 定妆：直接按输出分辨率生成（默认 1920×1080），避免 1360×760 再 Lanczos 硬拉导致全身脸糊。
 * 定妆单次任务，允许比分镜更高原生像素。
 */
export function resolveComfyFluxPortraitGenerationSize(): { width: number; height: number } {
  const w = LOCAL_COMIC_ENV.outputWidth
  const h = LOCAL_COMIC_ENV.outputHeight
  return clampComfyImageSize(w, h, Math.max(w, h, 1920))
}

export const COMFY_FLUX_GENERATION_STEPS = 28

/** @deprecated 使用 clampComfyImageSize */
export const clampComfyGridSize = clampComfyImageSize

/** 宫格/contact sheet：保留布局描述，压缩为 CLIP 友好英文 */
export function toComfyGridPrompt(rawPrompt: string, visualStyle?: string | null): string {
  const family = resolveComfyVisualFamily(visualStyle)
  const styleTag = shortComfyStylePrompt(visualStyle, 'scene')
  const raw = String(rawPrompt || '').trim().slice(0, 900)
  const latinChunks = raw.split(/[\n|，,；;]/).map(s => s.trim())
    .filter(s => /[a-zA-Z]/.test(s) && s.length >= 8)
  const tags = sanitizePortraitEnglishTags(latinChunks.join(', ').slice(0, 400))
  const gridHint = /(\d+)x(\d+)\s*grid|grid layout|宫格|panels/i.test(raw)
    ? 'storyboard contact sheet, grid layout, multiple distinct panels, consistent characters'
    : 'storyboard contact sheet, multiple panels, consistent art style'

  if (family === 'realistic') {
    return ['score_9, score_8_up, photorealistic', styleTag, gridHint, tags, 'cinematic lighting, 16:9 widescreen, no text, no watermark'].filter(Boolean).join(', ')
  }
  if (family === 'cinematic') {
    return ['score_9, score_8_up', styleTag, gridHint, tags, 'dramatic film lighting, color graded, 16:9 widescreen, no text, no watermark'].filter(Boolean).join(', ')
  }
  return ['score_9, score_8_up, source_anime', styleTag, gridHint, tags, 'anime storyboard sheet, clean lineart, cel shading, 16:9 widescreen, no text, no watermark'].filter(Boolean).join(', ')
}

export function isFluxImageModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m === 'flux_dev_fp8' || (m.includes('flux') && m !== 'kolors' && !m.startsWith('qwen'))
}

export function isKolorsImageModel(model?: string | null): boolean {
  return String(model || '').trim().toLowerCase() === 'kolors'
}

export function isQwenImageEditModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m === 'qwen_image_edit' || m === 'qwen-image-edit' || m.startsWith('qwen_image_edit')
}

export function isSdxlInstantIdImageModel(model?: string | null): boolean {
  return String(model || '').trim().toLowerCase() === 'sdxl_instantid'
}

/** 本地分镜需英文 prompt（Flux / InstantID）；Qwen/Kolors 中文直出 */
export function needsEnglishImagePrompt(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return isFluxImageModel(m) || isSdxlInstantIdImageModel(m)
}

/** Qwen Edit UNET：按模型 id 选 Q3/Q4 GGUF；缺失则抛错（不回退 fp8） */
export function resolveQwenEditUnetName(model?: string | null): string {
  const m = String(model || '').trim().toLowerCase()
  // 明确选了 q3/q4/旧 id 时按模型；否则可用 LOCAL_QWEN_EDIT_UNET 覆盖
  const name = (
    m.startsWith('qwen_image_edit') || m.startsWith('qwen-image-edit')
      ? qwenEditUnetForModel(m)
      : String(LOCAL_COMIC_ENV.qwenEditUnet || qwenEditUnetForModel('qwen_image_edit_q3')).trim()
  )
  if (!isQwenEditUnetGguf(name)) {
    throw new Error(`Qwen-Image-Edit 仅支持 GGUF（当前配置: ${name}）`)
  }
  for (const folder of ['diffusion_models', 'unet']) {
    if (fs.existsSync(resolveComfyModelsFile(folder, name))) return name
  }
  throw new Error(
    `缺少 GGUF 权重 ${name}。请放到 ComfyUI/models/diffusion_models/（不回退 fp8mixed）`,
  )
}

export function isQwenEditUnetGguf(name?: string | null): boolean {
  return String(name || '').toLowerCase().endsWith('.gguf')
}

/** Qwen-Image-Edit 权重是否落盘（必须对应 GGUF + CLIP + VAE） */
export function isQwenImageEditReady(model?: string | null): boolean {
  try {
    resolveQwenEditUnetName(model)
  } catch {
    return false
  }
  const clip = resolveComfyModelsFile('text_encoders', LOCAL_COMIC_ENV.qwenEditClip)
  const vae = resolveComfyModelsFile('vae', LOCAL_COMIC_ENV.qwenEditVae)
  return fs.existsSync(clip) && fs.existsSync(vae)
}

/** SDXL InstantID 分镜：七维英文 + Animagine 英文画风锚（禁止 shortComfyStylePrompt 注入中文 bracket） */
export function toSdxlInstantIdStoryboardPrompt(englishPrompt: string, style?: string | null): string {
  const core = compressSdxlInstantIdStoryboardEnglish(sanitizeFluxPrompt(String(englishPrompt || '').trim()))
  const family = resolvePortraitCheckpointFamily(resolveComfyPortraitCheckpoint(style))
  if (family === 'animagine') {
    const styleTag = comfyVisualStylePrompt(style, 'scene')
      || 'Chinese short-drama manhua key visual, sharp clean thin lineart, hard-edge cel shading, high contrast cool tones'
    return [
      styleTag,
      core,
      'detailed background, cinematic composition, no text, no watermark',
    ].filter(Boolean).join(', ')
  }
  if (!core) return 'score_9, score_8_up, source_anime, anime style, highly detailed background, no text, no watermark'
  return [
    'score_9, score_8_up, source_anime, anime style, highly detailed background',
    core,
    'no text, no watermark',
  ].filter(Boolean).join(', ')
}

/** 分镜配图：中文六维 → Kolors/Qwen 可读中文（保留原文顺序与内容，仅去【】标签） */
export function resolveKolorsChinesePrompt(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  let out = text
    .replace(/【([^：]+)：/g, '$1：')
    .replace(/】/g, '。')
    .replace(/[「」]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  out = enrichMirrorConsistencyChinese(out)
  out = enrichStandingFullBodyChinese(out)
  out = enrichScreenDeviceChinese(out)
  out = enrichHandheldAnatomyChinese(out)
  return out.slice(0, 1800)
}

/** 手机/电脑：强制屏幕朝向镜头可见内容，并统一物件年代 */
export function enrichScreenDeviceChinese(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return raw
  if (!/手机|电脑|笔记本|平板|显示器|屏幕|键盘|工位|办公|monitor|laptop|phone/i.test(raw)) return raw

  let out = raw
  const facingBits: string[] = []
  if (!/屏幕朝向|略侧.*屏幕|正面.*屏幕|可见(?:亮屏|屏幕内容|界面|UI)|三分之四/i.test(out)) {
    facingBits.push('带屏设备须正面或略侧朝向镜头可见屏幕内容与界面')
    facingBits.push('禁止只露手机背面、摄像头模组或显示器机箱背面')
  }
  const hasCrt = /CRT|显像管|米色(?:厚)?显示器|厚显示器/.test(out)
  const hasModern = /全面屏|智能手机|超薄键盘|巧克力键盘|薄边框笔记本|液晶/.test(out)
  const eraModern = /现代|当代|都市/.test(out)
  const era90 = /九十年代|90年代|千禧/.test(out)
  const eraBits: string[] = []
  if ((hasCrt && hasModern) || (eraModern && hasCrt) || (era90 && /全面屏|智能手机|超薄键盘/.test(out))) {
    if (era90 || (hasCrt && !eraModern)) {
      eraBits.push('本镜电子产品统一九十年代造型：米色CRT厚显示器与厚键帽键盘，可用功能机，禁止全面屏智能机与超薄键鼠混搭')
    } else {
      eraBits.push('本镜电子产品统一现代造型：液晶或超薄笔记本与现代触屏手机，禁止米色CRT厚显示器混搭')
    }
  } else if (!/统一.*年代|年代统一|同期电子|同一年代/.test(out)) {
    eraBits.push('桌面电子产品与通讯工具须与本镜时代氛围同一年代，禁止跨代混搭')
  }

  const add = [...facingBits, ...eraBits].filter(Boolean).join('；')
  if (add && !out.includes(add.slice(0, 12))) {
    out = `${out}。${add}`
  }
  return out.slice(0, 1800)
}

export const QWEN_SCREEN_DEVICE_NEGATIVE_CN = [
  '手机背面朝向镜头',
  '只露摄像头模组',
  '显示器机箱背面占主视角',
  '空白黑屏无内容',
  'CRT与现代超薄键盘混搭',
  'CRT与全面屏手机混搭',
].join('，')

/** 手持物场景：易出三只手 / 畸形指 */
export function isHandheldSceneChinese(text: string): boolean {
  const t = String(text || '')
  return /手持|握着|拿着|持手机|端着|举着|捧着|贴耳|刷手机|握杯|提袋|拎着|夹着文件|拿文件|握遥控器|拿烟|端碗|把手机|把平板|手机贴|手机按|看手机|看行情/.test(t)
    || (/(?:左手|右手|双手).{0,10}(?:持|握|拿|端|举|捧|把)/.test(t) && /手机|杯|袋|文件|遥控|烟|碗|平板|酒瓶/.test(t))
}

/** 拆开「撑墙+持物」等高危组合，并强制两只手 */
export function enrichHandheldAnatomyChinese(text: string): string {
  let raw = String(text || '').trim()
  if (!raw || !isHandheldSceneChinese(raw)) return raw

  // 一手撑墙/扶门 + 一手持物 → 改为肩靠墙 + 单手持物（另一手自然下垂）
  raw = raw
    .replace(/(?:一(?:只)?手|左手|右手)[^，。；\n]{0,10}(?:撑|扶|按|抵|贴)着?(?:着)?(?:墙|门|门框|玻璃)[^，。；\n]{0,40}(?:一(?:只)?手|左手|右手)[^，。；\n]{0,12}(?:持|握|拿|端|举|捧|把)/g,
      '肩背轻靠墙面手不撑墙，右手持物于胸前，左手自然垂于身侧')
    .replace(/(?:左手|右手)(?:撑|扶|按|抵)(?:着)?(?:墙|门框)[^，。；\n]{0,8}，?(?:左手|右手)把?(?:手机|平板)(?:贴|按|抵)?(?:在|到)?墙上?[^，。；\n]{0,16}/g,
      '肩背轻靠墙，右手持手机于胸前看屏幕，左手自然下垂')
    .replace(/(?:撑|扶|按|抵)着?(?:着)?(?:墙|门框)[^，。；\n]{0,28}(?:同时|一边)?[^，。；\n]{0,16}(?:持|握|拿|把)(?:着)?(?:手机|平板)(?:贴|按|抵)?(?:在|到)?墙上?[^，。；\n]{0,16}/g,
      '肩背轻靠墙，右手持手机于胸前看屏幕，左手自然下垂')
    .replace(/把(?:手机|平板)[^，。；\n]{0,10}(?:贴|按|抵)(?:在|到)?墙上[^，。；\n]{0,12}/g, '手持手机于胸前看屏幕')
    .replace(/(?:手机|平板)(?:贴|按|抵)(?:在|到)墙上[^，。；\n]{0,12}/g, '手持手机于胸前看屏幕')
    .replace(/墙上[^，。；\n]{0,8}(?:贴着|按着|抵着)(?:手机|平板)/g, '胸前手持手机')
    .replace(/左手自然下垂贴在墙上[^，。；\n]{0,16}/g, '左手自然下垂')
    .replace(/垂于身侧贴在墙上[^，。；\n]{0,12}/g, '垂于身侧')

  if (/恰好两只手|只有两只手|两只手两条手臂|硬性解剖：主人公恰好两只手/.test(raw)) {
    return raw.slice(0, 1800)
  }

  const prefix = [
    '硬性解剖：主人公恰好两只手两条手臂，五指正常',
    '手持物时写清左右手分工，禁止第三只手、袖口叠手、六指、断指',
    '若靠墙：仅肩背轻靠，手不撑墙不扶门，避免撑墙与持物叠加',
  ].join('。')

  const clauses: string[] = []
  if (!/(?:左手|右手).{0,12}(?:持|握|拿|端|举|捧)/.test(raw) && !/双手(?:持|握|拿|端|捧)/.test(raw)) {
    clauses.push('右手持物，左手自然垂于身侧或插兜，全身仅两只手')
  }
  return `${prefix}。${raw}${clauses.length ? `。${clauses.join('。')}` : ''}`.slice(0, 1800)
}

export const QWEN_HANDHELD_NEGATIVE_CN = [
  '三只手',
  '三只手臂',
  '多余手臂',
  '多只手',
  '第三只手',
  '袖口两只手',
  '叠手',
  '从胸口长出手',
  '畸形手',
  '六根手指',
  '缺指',
  '断指',
  '融合手指',
  '一手撑墙一手持物贴墙',
  '墙上多一只手',
].join('，')

/** 站立/行走：生图前强制全身入镜，避免中近景裁腿 */
export function enrichStandingFullBodyChinese(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return raw
  if (/坐姿|坐在|坐下|蹲|跪|侧卧|躺|趴|卧床|趴桌/.test(raw)) return raw
  if (!/站立|站着|站在|站姿|行走|走进|走出|进门|离去|脚步|踏入/.test(raw)) return raw

  let out = raw
    .replace(/中近景/g, '中远景')
    .replace(/朝向主人公上半身/g, '朝向站立全身的主人公')
    .replace(/朝向([^。，,；;]*?)上半身/g, '朝向站立全身的主人公与$1')
    .replace(/头高约占画面高度\s*(2[2-9]|3[0-9])\s*%/g, '头高约占画面高度12%')
    .replace(/须可见站立姿态肩线与手部[^。，,；;]*/g, '须可见从头顶到脚完整入镜，双脚鞋子清晰')
    .replace(/须可见[^。，,；;]{0,16}肩线与手部[^。，,；;]*/g, '须可见从头顶到脚完整入镜，双脚鞋子清晰')
    .replace(/站立全身约占画面高度\s*(?:2\d|3\d|4[0-4])\s*%/g, '站立全身约占画面高度45%')

  const prefix = [
    '硬性构图优先',
    '16:9横屏站立全身',
    '主人公从头顶到脚完整入镜',
    '双脚与鞋子清晰可见',
    '站立全身约占画面高度45%',
    '头顶与脚底留白',
    '禁止半身特写、齐腰裁切、胸像、截断腿脚',
    '禁止沿用参考图的半身构图',
  ].join('，')

  if (!/硬性构图优先|禁止沿用参考图的半身构图/.test(out)) {
    out = `${prefix}。${out}`
  } else if (!/从头顶到脚|双脚完整入镜|完整入镜/.test(out)) {
    out = `${out}。硬性构图：站立主人公从头顶到脚完整入镜，双脚与鞋子清晰可见，禁止半身特写、胸像、截断腿脚`
  } else if (!/禁止半身|截断腿脚|腿脚出画|齐腰裁切/.test(out)) {
    out = `${out}。禁止半身特写、齐腰裁切、胸像、截断腿脚`
  }
  if (!/站立全身约占|全身约占画面高度/.test(out)) {
    out = `${out}。站立全身约占画面高度45%`
  }
  return out.slice(0, 1800)
}

/** 从六维文案提取本镜（身穿…） */
export function extractOutfitClauseChinese(text: string): string | null {
  const raw = String(text || '')
  const m = raw.match(/身穿([^）\n]{2,48})/)
    || raw.match(/身穿([#\w\u4e00-\u9fff、与和的]{2,40})/)
  const outfit = m?.[1]?.replace(/[。；;].*$/, '').trim()
  return outfit || null
}

/**
 * Qwen-Image-Edit + 定妆参考：易把参考图人物再贴进场景（无镜也「镜像」），并锁死定妆服装。
 * 正向前置：身份锁脸、单人、按本镜换装。
 */
export function enrichQwenPortraitRefStoryboardChinese(text: string, _options?: {
  /** @deprecated 配图同框最多双定妆；保留参数兼容旧调用 */
  dualPortrait?: boolean
}): string {
  const raw = String(text || '').trim()
  if (!raw) return raw
  if (/参考图只锁定|禁止把参考图整个人再贴|禁止沿用参考图/.test(raw)) return raw.slice(0, 1800)
  const outfit = extractOutfitClauseChinese(raw)
  const prefix = [
    '硬性：参考图只锁定同一人脸与发型身份，禁止把参考图整个人再贴进画面或并排复制',
    '场景里只有一名主人公，禁止双胞胎、分身、克隆、两个相同面孔并排',
    outfit
      ? `本镜服装必须是身穿${outfit}，禁止沿用参考图白底定妆那套衣服`
      : '服装严格按本镜身穿描述绘制，禁止沿用参考图定妆服装',
  ].join('。')
  return `${prefix}。${raw}`.slice(0, 1800)
}

/** 双定妆第二遍：整图(image1) + 第二人定妆脸(image2) → 低 denoise 只换第二人脸 */
export function buildQwenDualPortraitSecondPassChinese(options: {
  secondName: string
  primaryName?: string
  sceneHint?: string
}): string {
  const name = String(options.secondName || '').trim() || '第二人'
  const primary = String(options.primaryName || '').trim()
  const scene = String(options.sceneHint || '').trim()
  let sideHint = ''
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sideM = scene.match(
    new RegExp(`对照定妆「${esc}」[^】]{0,40}(?:位于|在)画面(左侧|右侧|左|右)`),
  ) || scene.match(
    new RegExp(`(?:位于|在)画面(左侧|右侧)[^】]{0,24}对照定妆「${esc}」`),
  )
  if (sideM?.[1]) {
    const side = sideM[1].startsWith('左') ? '左侧' : '右侧'
    sideHint = `只改画面${side}人物的脸`
  }

  return [
    '在图1场景上做最小修改',
    `把其中一人的脸换成图2「${name}」的脸与发型，其余不动`,
    primary ? `「${primary}」的脸保持图1原样` : '',
    sideHint,
    '保持构图姿势服装双手与道具清晰，禁止融化五官、融手、重画全身',
  ].filter(Boolean).join('。').slice(0, 500)
}

export const QWEN_REF_DUPLICATE_NEGATIVE_CN = [
  '双胞胎',
  '分身',
  '克隆人',
  '两个相同面孔',
  '并排两个同一人',
  '定妆图贴进场景',
  '白底全身参考人',
  '重复人物',
  '镜像分身无镜子',
].join('，')

/** 站立镜：抑制半身裁切 */
export const QWEN_STANDING_CROP_NEGATIVE_CN = [
  '半身',
  '胸像',
  '大头照',
  '齐腰裁切',
  '膝盖以上构图',
  '截断腿',
  '截断脚',
  '腿脚出画',
  '膝盖以下被裁',
  '只有上半身',
  '腰部以上特写',
  '中近景半身',
  '参考图半身构图',
].join('，')

/** 镜子/反射面：强约束映像与本人同一瞬间姿态（Qwen/Kolors 中文直出） */
export function isMirrorSceneChinese(text?: string | null): boolean {
  return /全身镜|落地镜|穿衣镜|镜面|镜中|镜子|照镜子|镜前|橱窗.{0,4}反|玻璃.{0,4}反|映出.{0,8}(?:自己|背影|人|身)|反射|mirror|reflection/i
    .test(String(text || ''))
}

const QWEN_SEATED_OR_RECLINING_RE = /坐姿|坐在|坐下|端坐|瘫坐|僵直坐|蹲|跪|侧卧|躺|趴|卧床|趴桌/
const QWEN_STANDING_FULLBODY_RE = /站立|站着|站在|站姿|行走|走进|走出|进门|离去|脚步|踏入/

/**
 * 难构图统一判定（镜面 / 站立全身 / 坐卧 / 手持物）。
 * 采样：镜面/反射用 complexSteps，其余引导用 guidedSteps。
 */
export function isQwenGuidedCompositionChinese(text?: string | null): boolean {
  const t = String(text || '')
  if (!t.trim()) return false
  if (isMirrorSceneChinese(t)) return true
  if (isHandheldSceneChinese(t)) return true
  if (QWEN_SEATED_OR_RECLINING_RE.test(t)) return true
  if (QWEN_STANDING_FULLBODY_RE.test(t)) return true
  return false
}

/** 改写「摸镜/伸手进镜」等易诱发第三只手的动作 */
export function sanitizeMirrorTouchActionsChinese(text: string): string {
  return String(text || '')
    .replace(/摸(?:着|向|住)?(?:着)?镜中[^，。；\n]{0,24}/g, '望向镜中映像')
    .replace(/(?:伸手|抬手|探手|伸臂)(?:向|到|进|入)?镜(?:面|中|子|框)?[^，。；\n]{0,20}/g, '站在镜前双手自然下垂')
    .replace(/触(?:摸|碰|及)镜(?:面|中|子|框)?[^，。；\n]{0,20}/g, '双手远离镜面不接触玻璃')
    .replace(/用手[^，。；\n]{0,10}(?:摸|戳|按|碰)[^，。；\n]{0,8}镜[^，。；\n]{0,16}/g, '双手自然下垂不碰镜子')
    .replace(/与镜中(?:人|自己|映像)(?:握手|对掌|击掌|互动)/g, '注视镜中映像')
    .trim()
}

export function enrichMirrorConsistencyChinese(text: string): string {
  let raw = sanitizeMirrorTouchActionsChinese(String(text || '').trim())
  if (!raw || !isMirrorSceneChinese(raw)) return raw

  // 关键置硬约束：Lightning cfg=1 时负向几乎无效，只能靠正向
  const prefix = [
    '硬性构图：画面仅一名实体主人公加一面镜子的光学映像，禁止克隆第二个人站在镜外',
    '主人公全身恰好两只手两条手臂，双手自然下垂或放在身前，绝不接触镜面玻璃，禁止第三只手、袖口叠手、畸形手指',
    '场景仅一面落地镜或穿衣镜，禁止壁挂小圆镜、第二面镜子并排',
  ].join('。')

  const clauses: string[] = []
  if (!/镜中反射与本人|左右镜像|同一瞬间.*镜像|镜面映像与本人姿态/.test(raw)) {
    clauses.push('镜中为物理左右镜像：与本人同一瞬间同一服装同一姿态，不是可触碰的第二个人')
  }
  if (!/双手自然下垂|不接触镜|远离镜面|勿触碰镜/.test(raw)) {
    clauses.push('双手远离镜面，只看不摸')
  }
  return `${prefix}。${raw}${clauses.length ? `。${clauses.join('。')}` : ''}`.slice(0, 1800)
}

export const QWEN_MIRROR_NEGATIVE_CN = [
  '三只手',
  '三只手臂',
  '多余手臂',
  '多只手',
  '第三只手',
  '袖口两只手',
  '叠手',
  '畸形手',
  '六根手指',
  '多面镜子',
  '两面镜子',
  '多面镜',
  '小圆镜',
  '壁挂小镜子',
  '小镜子并排',
  '用手摸镜中人脸',
  '触摸镜中映像',
  '伸手进镜子',
  '镜中另一姿势',
  '镜中另一套动作',
  '假镜子',
  '错位反射',
  '镜外第二个人',
  '克隆人',
  '双胞胎并排',
].join('，')

/** 去掉 SDXL/Pony 专用 tag，供 FLUX 自然语言 prompt 使用 */
export function sanitizeFluxPrompt(text: string): string {
  return String(text || '')
    .replace(/score_\d+(?:_up)?,?\s*/gi, '')
    .replace(/source_anime,?\s*/gi, '')
    .replace(/,\s*,+/g, ', ')
    .replace(/\.\s*\./g, '.')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()
}

const FLUX_SCENE_PHRASE_MAP: Array<[RegExp, string]> = [
  [/非Q版非三头身[^，。]*/g, 'normal young adult body proportions, not chibi, not SD character'],
  [/非Q版/g, 'not chibi style'],
  [/三头身/g, 'not three-head-tall SD proportions'],
  [/电影感柔和光影/g, 'soft cinematic lighting'],
  [/屏幕蓝光映照面部轮廓线增强专注感[（(]?显示器边框画半透明数据流线条[）)]?/g, 'blue monitor glow illuminating face contours with focused expression, holographic translucent data-stream UI on monitor bezel'],
  [/屏幕蓝光映照面部轮廓线增强专注感/g, 'blue monitor glow illuminating face contours, focused expression'],
  [/显示器边框画半透明数据流线条/g, 'holographic translucent data-stream UI on monitor bezel'],
  [/屏幕蓝光/g, 'blue monitor glow'],
  [/位于办公桌前以坐姿端正?/g, 'sitting upright at a desk'],
  [/坐在.*?办公桌前/g, 'sitting at a desk'],
  [/位于.*?前以站立姿态/g, 'standing in front of'],
  [/以站立姿态/g, 'standing'],
  [/以坐姿/g, 'sitting'],
  [/身穿#9ca3af连帽卫衣|身穿.*?连帽卫衣/g, 'wearing light grey hoodie'],
  [/现代办公空间/g, 'modern office workspace'],
  [/办公空间|办公室|工位/g, 'office workspace'],
  [/深灰色金属框架办公桌|金属框架办公桌/g, 'dark grey metal-frame desk'],
  [/木质桌面/g, 'wooden desktop surface'],
  [/木质摊位/g, 'wooden market stall'],
  [/透明玻璃键盘/g, 'transparent glass keyboard'],
  [/机械鼠标/g, 'mechanical computer mouse'],
  [/电脑交互/g, 'interacting with the computer'],
  [/与电脑交互/g, 'interacting with the computer'],
  [/映照面部轮廓线/g, 'monitor light illuminating face contours'],
  [/增强专注感/g, 'focused attentive expression'],
  [/清晨冷色调自然光/g, 'cool early morning natural window light'],
  [/清晨.*?自然光/g, 'early morning natural window light'],
  [/室内蓝白屏幕光/g, 'indoor cool blue-white monitor light'],
  [/蓝白屏幕光/g, 'cool blue-white monitor light'],
  [/暖色窗帘褶皱处过渡柔和的渐变光晕/g, 'warm sunlight through curtain folds with soft gradient glow'],
  [/暖色窗帘/g, 'warm sunlight through curtains'],
  [/混合光影|混合光/g, 'mixed cinematic lighting'],
  [/八十年代/g, '1980s'],
  [/九十年代/g, '1990s'],
  [/市井夜市|夜市/g, 'bustling night market'],
  [/花衬衫/g, 'colorful patterned shirts'],
  [/喇叭裤/g, 'flared trousers'],
  [/摊位/g, 'market stall'],
  [/陈设/g, 'props and set dressing'],
  [/道具/g, 'props'],
  [/客厅/g, 'living room'],
  [/卧室/g, 'bedroom'],
  [/大学宿舍|宿舍清晨|宿舍/g, 'university dormitory bedroom in early morning'],
  [/清晨/g, 'early morning'],
  [/制造柔和渐变氛围/g, 'soft gradient atmosphere'],
  [/强调光晕效果与身体姿态/g, 'emphasizing lens flare and body pose'],
  [/无配角/g, 'no supporting characters'],
  [/浅色木质双层床架|双层床|上下铺/g, 'light wood bunk bed frame with ladder and wrinkled white bedsheets'],
  [/二手笔记本电脑|笔记本电脑/g, 'used laptop computer on desk'],
  [/杂乱充电线束|充电线|线束/g, 'messy charging cables and power strip on desk'],
  [/位于卧室窗前以单手扶框揉眼姿态|扶框揉眼|单手扶框揉眼/g, 'at bedroom window, one hand gripping window frame, other hand rubbing sleepy eye'],
  [/揉眼/g, 'rubbing eye'],
  [/扶框/g, 'hand on window frame'],
  [/窗帘缝隙射入细光束形成光斑投射地板图案|窗帘缝隙.*?光斑.*?地板/g, 'thin sunbeams through curtain gap casting soft light patterns on floor'],
  [/窗帘缝隙/g, 'sunlight through curtain gap'],
  [/光斑投射地板/g, 'light patterns on wooden floor'],
  [/发梢反射晨光金色高光|发梢.*?金色高光/g, 'golden rim light on hair tips from morning sun'],
  [/清晨暖黄色日光穿透薄纱窗帘|暖黄色日光.*?薄纱窗帘/g, 'warm golden morning sunlight through sheer curtains'],
  [/窗外天空呈现淡青灰过渡色|淡青灰.*?天空/g, 'pale blue-grey sky visible outside window'],
  [/中近景侧前方拍摄|中近景侧前方/g, 'medium close-up from side-front three-quarter angle, soft lens flare'],
  [/床单褶皱细节清晰可见|床单褶皱/g, 'wrinkled bedsheet folds clearly visible'],
  [/位于.*?窗前/g, 'at the window in bedroom'],
  [/嘴角微笑|嘴角.*?微笑/g, 'gentle smile'],
  [/厨房/g, 'kitchen'],
  [/教室/g, 'classroom'],
  [/街道/g, 'street'],
  [/商场/g, 'shopping mall'],
  [/公园/g, 'park'],
  [/配角/g, 'supporting characters'],
  [/群众/g, 'crowd in background'],
  [/路人/g, 'passersby in background'],
  [/主人公/g, 'main protagonist'],
  [/中景全身|全身入镜|从头到脚|头顶到脚|从头顶到脚/g, 'medium full-body shot, head to feet fully visible, shoes in frame'],
  [/中近景平视/g, 'medium close-up, eye-level camera, upper-body framing with hands visible'],
  [/中近景/g, 'medium close-up shot, upper-body framing, hands and nearby props visible'],
  [/近景/g, 'close shot showing head and upper body, not face-only'],
  [/特写/g, 'tight close-up shot, still show shoulder line when possible'],
  [/中景/g, 'medium shot, subject placed in environment with visible props and background'],
  [/全景/g, 'wide establishing shot showing full environment with props'],
  [/远景/g, 'long shot showing environment and atmosphere'],
  [/平视/g, 'eye-level camera'],
  [/俯拍|俯视/g, 'high angle camera'],
  [/仰拍|仰视/g, 'low angle camera'],
  [/聚焦人物上半身/g, 'focus on upper body in scene context'],
  [/背景虚化保留.*?细节/g, 'shallow depth of field with softly blurred background details'],
  [/背景虚化/g, 'shallow depth of field with softly blurred background'],
  [/无配角|单人|solo/g, 'solo subject focus'],
  [/黑色略?凌乱短发/g, 'messy black short hair'],
  [/大眼睛带高光/g, 'large anime eyes with catchlights'],
  [/富有表现力的.*?眼/g, 'clear anime eyes with catchlights'],
  [/嘴角上扬.*?微笑/g, 'confident gentle smile'],
  [/自信.*?微笑/g, 'confident smile'],
  [/连帽卫衣|灰色卫衣/g, 'light grey hoodie'],
  [/圆框眼镜/g, 'round rim glasses'],
  [/程序员·青年/g, 'young male programmer protagonist, 1boy, male focus'],
  [/程序员/g, 'young male programmer, male focus'],
  [/青年男|男青年|青年男性/g, 'young adult male, 1boy'],
  [/精致讨喜的动漫脸型/g, 'clear natural anime facial features'],
  [/讨喜的动漫脸型/g, 'natural anime facial features'],
  [/大而精致的眼部高光/g, 'expressive eyes with layered catchlights'],
  [/大眼睛带高光/g, 'expressive eyes with catchlights'],
  [/电影感/g, 'cinematic'],
  [/新海诚|京都动画/g, 'Makoto Shinkai and Kyoto Animation quality'],
  [/16:9横屏|16:9/g, '16:9 widescreen composition'],
  [/无文字无水印|无文字无 watermark/g, 'no text, no watermark'],
  [/对照定妆「([^」]+)」/g, 'matching character reference portrait for $1'],
  [/对照定妆/g, 'matching character reference portrait'],
  [/细腻线稿/g, 'clean detailed lineart'],
  [/柔和光影/g, 'soft cinematic lighting'],
  [/眼部与发丝有层次高光/g, 'layered highlights on eyes and hair strands'],
  [/画面精致干净/g, 'polished clean illustration'],
  [/现代/g, 'modern'],
  [/散落/g, ', with '],
  [/保留/g, 'keeping'],
  [/【|】|「|」|（|）|\(|\)/g, ' '],
  [/，|。/g, ', '],
  [/电影感动漫/g, ' cinematic anime illustration'],
  [/film感动anime/gi, ' cinematic anime illustration'],
]

/** 修复 LLM 译文中残留中文（短语映射 + 清除未匹配 CJK） */
export function fluxRepairMixedEnglish(text: string): string {
  let out = String(text || '').trim()
  if (!out) return ''
  for (const [pattern, replacement] of FLUX_SCENE_PHRASE_MAP) {
    out = out.replace(pattern, replacement)
  }
  out = out.replace(/[\u4e00-\u9fff「」『』【】]/g, ' ')
  out = out.replace(/\s+/g, ' ').replace(/,\s*,+/g, ', ').trim()
  return out
}

function fluxTranslateSceneText(text: string): string {
  let out = fluxRepairMixedEnglish(text)
  if (!out) return ''
  return out
}

export function parseNarrationFluxSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  for (const m of String(raw || '').matchAll(/【([^：]+)：([^】]+)】/g)) {
    sections[m[1].trim()] = m[2].trim()
  }
  return sections
}

export const FLUX_SECTION_ORDER = [
  '画风规格',
  '画面主体',
  '年代场景',
  '核心细节动作',
  '光影色调',
  '镜头视角',
  '质感要求',
] as const

export const FLUX_SECTION_LABELS: Record<string, string> = {
  画风规格: 'Art style spec',
  画面主体: 'Subjects in frame',
  年代场景: 'Environment and era',
  核心细节动作: 'Action and interaction',
  光影色调: 'Lighting and color',
  镜头视角: 'Camera and composition',
  质感要求: 'Render quality',
}

/** 七维英文组装：仅拼接各维译文，不加后缀 */
export function assembleFluxSevenDimEnglish(translated: Record<string, string>): string {
  const parts: string[] = []
  for (const key of FLUX_SECTION_ORDER) {
    const en = String(translated[key] || '').trim()
    if (!en) continue
    parts.push(`${FLUX_SECTION_LABELS[key]}: ${en}`)
  }
  return sanitizeFluxPrompt(parts.join('. ')).slice(0, 1800)
}

/** 规则兜底：七维分段直译，不加 masterpiece/后缀/约束 */
export function narrationPagePromptToFluxEnglish(raw: string, _visualStyle?: string | null): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (!/[\u4e00-\u9fff]/.test(text)) {
    return sanitizeFluxPrompt(text).slice(0, 1800)
  }

  const sections = parseNarrationFluxSections(text)
  if (Object.keys(sections).length >= 2) {
    const translated: Record<string, string> = {}
    for (const key of FLUX_SECTION_ORDER) {
      if (!sections[key]) continue
      translated[key] = fluxTranslateSceneText(sections[key])
    }
    return assembleFluxSevenDimEnglish(translated)
  }

  return sanitizeFluxPrompt(fluxTranslateSceneText(text)).slice(0, 1800)
}

const FLUX_FEMININE_BIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/cute anime face(?: shape)?/gi, 'distinct anime face shape'],
  [/exquisite likable anime face/gi, 'distinct anime face shape'],
  [/likable anime face/gi, 'distinct anime face shape'],
  [/appealing cute anime face/gi, 'distinct anime face shape'],
  [/\bhandsome(?:\s+young)?(?:\s+male)?\s+anime\s+face\b/gi, 'distinct anime face'],
  [/\bhandsome\s+anime\s+face\b/gi, 'distinct anime face'],
  [/\battractive\s+anime\s+face\b/gi, 'distinct anime face'],
  [/large expressive eyes with catchlights/gi, 'sharp expressive male anime eyes with catchlights'],
  [/expressive anime eyes with catchlights/gi, 'sharp expressive male anime eyes with catchlights'],
  [/big eyes with highlights/gi, 'sharp male anime eyes with catchlights'],
]

/** 男主/男性主角：修正翻译里偏女性的用词，并补 male focus */
export function rebalanceFluxPromptForProtagonistGender(
  positive: string,
  gender: PortraitGender,
  rawChinese?: string | null,
): string {
  let en = String(positive || '').trim()
  if (!en || gender !== 'male') return en

  for (const [pattern, replacement] of FLUX_FEMININE_BIAS_REPLACEMENTS) {
    en = en.replace(pattern, replacement)
  }
  en = en.replace(/\b(girl|female|woman|1girl|feminine)\b/gi, 'male')

  const maleLock = 'young male protagonist, 1boy, male focus, flat chest, masculine facial features'
  if (!/\b(male|1boy|1man|young man|boy protagonist|masculine)\b/i.test(en)) {
    en = `${maleLock}, ${en}`
  }
  return sanitizeFluxPrompt(en).slice(0, 1800)
}

/** 女性主角：修正 1girl/young 等幼态词，35岁+须用 1woman/mature woman */
export function rebalanceFluxPromptForFemaleAge(
  positive: string,
  gender: PortraitGender,
  rawChinese?: string | null,
): string {
  let en = String(positive || '').trim()
  if (!en || gender !== 'female') return en

  const cn = String(rawChinese || '')
  const ageMatch = cn.match(/(\d{1,2})\s*岁/)
  const age = ageMatch ? Number.parseInt(ageMatch[1], 10) : null
  const isMature = (age != null && age >= 28)
    || /中年|35|36|37|38|39|40|45|50|成熟|mature|middle.?aged/i.test(cn)

  if (!isMature) return en

  en = en
    .replace(/\byoung female protagonist\b/gi, 'mature adult woman protagonist')
    .replace(/\byoung woman\b/gi, 'mature woman')
    .replace(/\bteen girl\b/gi, 'mature woman')
    .replace(/\blittle girl\b/gi, 'mature woman')
    .replace(/\bchild\b/gi, 'adult')
    .replace(/\b1girl\b/gi, '1woman')

  const ageLabel = age != null && age >= 18 ? `${age}-year-old` : '35-year-old'
  const lock = `${ageLabel} mature woman, 1woman, adult female, mature soft anime face with subtle fine lines, NOT child NOT teenager NOT loli NOT young girl`
  if (!/\b(1woman|mature woman|middle.?aged woman|\d{2}-year-old woman)\b/i.test(en)) {
    en = `${lock}, ${en}`
  }
  return sanitizeFluxPrompt(en).slice(0, 1800)
}

/** Flux 分镜：清中文残留 → 压缩英文七维并按机位优先顺序重排；可选中文源做屏幕/动作增强 */
export function finalizeFluxStoryboardPositivePrompt(positive: string, chineseSource?: string | null): string {
  let text = purgeChineseFromFluxEnglish(sanitizeFluxPrompt(String(positive || '')).trim())
  if (!text) return ''
  if (/[\u4e00-\u9fff]/.test(text) && /【.+：.+】/.test(text)) {
    text = compressFluxChinesePrompt(text)
  }
  if (/Art style spec:|Camera and composition:/i.test(text)) {
    text = compressFluxEnglishPrompt(text)
  } else if (text.length > 900) {
    text = compressFluxEnglishPrompt(text)
  }
  if (chineseSource?.trim()) {
    text = enrichFluxStoryboardPrompt(text, chineseSource)
  }
  return text
}

/** PuLID 分镜：Flux cfg≈1 时负向弱；重排七维顺序(Action→Environment→Camera)并强化 in-scene 视线 */
export function augmentFluxPulidStoryboardPositive(positive: string): string {
  let text = purgeChineseFromFluxEnglish(sanitizeFluxPrompt(String(positive || '')).trim())
  if (!text) return text

  const isInteractionScene = /two people|two-person|supporting character|second person|interaction moment|over-the-shoulder|eye contact between two|both figures visible/i.test(text)

  text = text
    .replace(/\bconfident demeanor\b/gi, 'focused working expression')
    .replace(/\bconfident smile on lips\b/gi, 'focused working expression')
    .replace(/\bconfident smile\b/gi, 'focused expression')
    .replace(/\bemphasize professional status\b/gi, 'show workspace context')
    .replace(/,\s*,/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const sections = parseFluxEnglishSections(text)
  const actionHint = sections['Action and interaction'] || ''
  const envHint = sections['Environment and era'] || ''
  const hasTask = /hand|finger|desk|prop|tool|device|operat|hold|grasp|reach|interact/i.test(`${actionHint} ${envHint}`)
  const hasDisplayTask = /screen|monitor|keyboard|mouse|laptop|phone|tablet|display/i.test(`${actionHint} ${envHint}`)

  if (sections['Camera and composition']) {
    let cam = sections['Camera and composition']
    if (hasDisplayTask) {
      cam = cam
        .replace(/\bmedium close-up\b/gi, 'medium shot waist-up')
        .replace(/\bclose-up\b/gi, 'medium shot')
        .replace(/\bbust shot\b/gi, 'medium shot')
        .replace(/\bportrait framing\b/gi, 'environmental framing')
    }
    sections['Camera and composition'] = cam
  }

  if (sections['Subjects in frame']) {
    const subj = sections['Subjects in frame']
    if (!/same face|reference portrait|character reference/i.test(subj)) {
      sections['Subjects in frame'] = `same face as reference portrait, ${subj}`
    }
  }

  const gazeLead = isInteractionScene
    ? [
      'in-scene two-person photograph not solo portrait',
      'protagonist and supporting character with clear spatial relationship',
      'eye contact between two characters not looking at camera',
      'both figures visible in frame with shared environment context',
    ].join(', ')
    : [
      'in-scene action photograph not poster portrait',
      'character absorbed in task not looking at viewer',
      hasDisplayTask ? 'eyes directed at screen device or props not camera' : 'eyes directed at scene action or props not camera',
      'three-quarter or over-shoulder angle acceptable',
      hasTask ? 'hands and relevant props visible in frame' : '',
    ].filter(Boolean).join(', ')

  const pulidOrder = [
    'Action and interaction',
    'Environment and era',
    'Camera and composition',
    'Lighting and color',
    'Subjects in frame',
    'Art style spec',
    'Render quality',
  ] as const

  if (Object.keys(sections).length >= 2) {
    const parts: string[] = [gazeLead]
    for (const label of pulidOrder) {
      const body = sections[label]
      if (!body) continue
      parts.push(`${label}: ${body}`)
    }
    return compressFluxEnglishPrompt(parts.join('. '))
  }

  return compressFluxEnglishPrompt(`${gazeLead}. ${text}`)
}

/** 定妆四视图拼版（宽图，旧版）—— Redux 易复制出第二个同款人物 */
export async function isTurnaroundReferenceImage(relativePath: string): Promise<boolean> {
  try {
    const normalized = relativePath.replace(/^\//, '')
    const abs = getAbsolutePath(normalized)
    if (!fs.existsSync(abs)) return false
    const meta = await sharp(abs).metadata()
    const w = meta.width || 1024
    const h = meta.height || 1024
    return w / h >= 2.2
  } catch {
    return false
  }
}

/** PuLID 分镜：抑制定妆站姿/看镜头污染（Flux cfg=1 时负向较弱，仍作辅助） */
export const COMFY_FLUX_PULID_STORYBOARD_NEGATIVE = [
  'looking at viewer',
  'eye contact with camera',
  'breaking fourth wall',
  'character facing camera directly',
  'passport photo',
  'id photo',
  'portrait pose only',
  'bust shot only',
  'character standing alone without scene',
  'standing full body',
  'character sheet',
  'turnaround',
  'reference sheet',
  'white background',
  'plain white wall only',
  'wrong pose',
  'wrong action',
].join(', ')

/** PuLID 分镜负向：全身/环境/双人镜头时放宽部分构图抑制 */
export function resolveFluxPulidStoryboardNegative(positive: string): string {
  const text = String(positive || '')
  const wantsFullBody = /full body|head to feet|head-to-feet|全身|从头到脚|头顶到脚|全景|远景|wide establishing|long shot|walking into|entering room/i.test(text)
  const wantsInteraction = /two people|two-person|supporting character|second person|both figures visible|interaction moment/i.test(text)
  const wantsEnvironmental = /medium-wide|22-35 percent|28-40 percent|32-45 percent|10-22 percent|environment dominates|environment occupies majority|22.?percent|28.?percent|35.?percent/i.test(text)
  const relaxTerms = new Set(['standing full body', 'portrait pose only'])
  if (wantsInteraction) relaxTerms.add('character standing alone without scene')
  let parts = COMFY_FLUX_PULID_STORYBOARD_NEGATIVE.split(', ')
  if (wantsFullBody || wantsInteraction) {
    parts = parts.filter(term => !relaxTerms.has(term))
  }
  if (wantsEnvironmental || wantsFullBody) {
    parts.push(
      'extreme close-up',
      'bust shot only',
      'character filling entire frame',
      'portrait crop',
      'headshot only',
      'blank background only',
      'character dominates frame',
    )
  }
  if (/mature woman|1woman|\d{2}-year-old woman|35-year-old|NOT child NOT loli/i.test(text)) {
    parts.push('child', 'loli', 'young girl', 'teen girl', 'little girl', 'schoolgirl', 'chibi')
  }
  return parts.join(', ')
}

/** Flux 分镜配图负向词：避免 Redux/定妆参考污染构图 */
export const COMFY_FLUX_STORYBOARD_NEGATIVE = [
  '1girl',
  'girl',
  'female',
  'woman',
  'feminine face',
  'long eyelashes',
  'lipstick',
  'makeup',
  'breasts',
  'cleavage',
  'skirt',
  'dress',
  'two people',
  'two boys',
  'two girls',
  'duo',
  'twins',
  'multiple characters',
  'two characters facing each other',
  'symmetrical dual portrait',
  'mirror image character',
  'duplicate character',
  'second identical figure',
  'bad anatomy',
  'twisted neck',
  'broken neck',
  'deformed spine',
  'wrong proportions',
  'head facing opposite direction from body',
  'white background',
  'plain white wall only',
  'empty white room',
  'blown out white background',
  'overexposed white window only',
  'strict side profile',
  'side profile only',
  'profile view only',
  'character facing sideways only',
  'character standing alone without scene',
  'character sheet',
  'turnaround',
  'reference sheet',
  'multiple views',
  'grid',
  'standing full body',
  'portrait only',
  'bust shot only',
  'wrong pose',
  'wrong action',
  'chibi proportions',
  'three head tall',
  'SD proportions',
  'character face inside monitor',
  'face on screen',
  'holographic portrait ui',
  'person inside monitor',
  'back view',
  'from behind',
  'over the shoulder',
  'neon cyberpunk palette',
  'text',
  'watermark',
  'low quality',
  'blurry',
].join(', ')

export function toComfyFluxStoryboardPrompt(englishTags: string, visualStyle?: string | null): string {
  return sanitizeFluxPrompt(toComfyStoryboardPrompt(englishTags, visualStyle))
}

export function toComfyFluxScenePrompt(englishTags: string, visualStyle?: string | null): string {
  return sanitizeFluxPrompt(toComfyScenePrompt(englishTags, visualStyle))
}

export function toComfyFluxPortraitPrompt(
  rawPrompt: string,
  characterName?: string | null,
  visualStyle?: string | null,
  role?: string | null,
): string {
  const raw = String(rawPrompt || '').trim()
  if (!raw) return ''
  const gender = resolvePortraitGender(raw, characterName, role)
  const sketch = isNovelComicSketchStyle(visualStyle)
  const motionComic = isMotionComicStyle(visualStyle)
  const isAnime = !motionComic && !sketch && (/动漫|anime|新海诚|京都动画/i.test(raw) || String(visualStyle || '').includes('anime'))
  const styleEn = sketch
    ? `${NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_EN}, masterpiece, best quality, sharp focus, monochrome`
    : motionComic
    ? `${MOTION_COMIC_PORTRAIT_STYLE_EN}, masterpiece, best quality, ultra detailed, sharp focus`
    : isAnime
    ? 'masterpiece, best quality, ultra detailed, sharp focus, cinematic anime illustration, Makoto Shinkai and Kyoto Animation quality, clean detailed lineart, soft cel shading'
    : 'masterpiece, best quality, ultra detailed, sharp focus, cinematic character illustration, natural lighting'

  const tagged = raw.match(/\bEnglish tags:\s*([^\n【]+)/i)
  let englishTags = sanitizePortraitEnglishTags(tagged?.[1]?.replace(/[，。]+$/, '').trim() || '')
  if (!englishTags) {
    englishTags = fallbackEnglishTagsFromAppearance(raw, characterName, role)
  }

  const genderEn = gender === 'male'
    ? '1boy, solo male, male focus, masculine facial features, flat chest'
    : gender === 'female'
      ? '1girl, solo female, female focus'
      : 'solo, single character'

  const layout = [
    '16:9 widescreen horizontal composition matching storyboard illustration format',
    'single front full-body character reference on pure white background',
    'one character only, facing camera, head to feet fully visible in frame',
    'legs and feet and shoes fully visible at bottom of frame, NOT cropped at thighs or waist',
    'neutral standing pose, arms at sides, empty hands, outfit fully visible',
    'natural dark iris, white sclera, catchlights in eyes, fine bloodshot veins in sclera allowed only',
    'same anime character design style as storyboard shots, only difference is white studio background instead of scene',
    'NOT turnaround sheet, NOT multiple views, NOT cropped legs, NOT portrait bust only, NOT half body',
    'NOT solid red eyes, NOT glowing red eyes, NOT entirely red iris, NOT crimson eyes',
    'NOT environment, NOT desk, NOT scenery, NOT props',
    'no text, no watermark',
  ].join(', ')

  let prompt = sanitizeFluxPrompt(`${styleEn}. ${genderEn}. ${englishTags}. ${layout}`)
  if (gender === 'male') {
    prompt = rebalanceFluxPromptForProtagonistGender(prompt, 'male', raw)
  }
  return prompt.slice(0, 1800)
}

export type FluxWorkflowParams = {
  positive: string
  negative?: string
  width: number
  height: number
  checkpoint?: string
  steps?: number
  cfg?: number
  seed?: number
}

export function injectFluxWorkflow(prompt: ComfyPrompt, params: FluxWorkflowParams) {
  if (prompt['4']?.inputs) {
    prompt['4'].inputs.ckpt_name = params.checkpoint || LOCAL_COMIC_ENV.fluxCheckpoint
  }
  if (prompt['5']?.inputs) {
    prompt['5'].inputs.width = params.width
    prompt['5'].inputs.height = params.height
  }
  if (prompt['6']?.inputs) prompt['6'].inputs.text = params.positive
  if (prompt['7']?.inputs) prompt['7'].inputs.text = params.negative ?? ''
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000)
    prompt['3'].inputs.steps = params.steps ?? 20
    prompt['3'].inputs.cfg = params.cfg ?? 1
    prompt['3'].inputs.sampler_name = 'euler'
    prompt['3'].inputs.scheduler = 'simple'
  }
}

export type KolorsWorkflowParams = {
  positive: string
  negative?: string
  width: number
  height: number
  seed?: number
  steps?: number
  cfg?: number
  chatglmCheckpoint?: string
  vaeName?: string
}

export type KolorsImg2ImgWorkflowParams = KolorsWorkflowParams & {
  referenceImage: string
  denoiseStrength?: number
}

export function injectKolorsWorkflow(prompt: ComfyPrompt, params: KolorsWorkflowParams) {
  if (prompt['2']?.inputs) {
    prompt['2'].inputs.chatglm3_checkpoint = params.chatglmCheckpoint || LOCAL_COMIC_ENV.kolorsChatglmCheckpoint
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.prompt = params.positive
    prompt['3'].inputs.negative_prompt = params.negative || '低质量，模糊，文字，水印，畸形'
  }
  if (prompt['4']?.inputs) {
    prompt['4'].inputs.width = params.width
    prompt['4'].inputs.height = params.height
    prompt['4'].inputs.seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000)
    prompt['4'].inputs.steps = params.steps ?? 25
    prompt['4'].inputs.cfg = params.cfg ?? 5
    prompt['4'].inputs.scheduler = 'EulerDiscreteScheduler'
  }
  if (prompt['5']?.inputs) {
    prompt['5'].inputs.vae_name = params.vaeName || LOCAL_COMIC_ENV.kolorsVae
  }
}

export function injectKolorsImg2ImgWorkflow(prompt: ComfyPrompt, params: KolorsImg2ImgWorkflowParams) {
  injectKolorsWorkflow(prompt, params)
  if (prompt['8']?.inputs) {
    prompt['8'].inputs.image = params.referenceImage
  }
  if (prompt['4']?.inputs) {
    prompt['4'].inputs.denoise_strength = params.denoiseStrength ?? LOCAL_COMIC_ENV.kolorsImg2imgDenoise
  }
}

export type QwenImageEditWorkflowParams = {
  positive: string
  negative?: string
  width: number
  height: number
  seed?: number
  steps?: number
  cfg?: number
  shift?: number
  /** 图1：定妆脸芯片 / 第二遍时为整图场景 */
  referenceImage?: string | null
  /** 图2：第二定妆脸芯片（双人换脸第二遍） */
  referenceImage2?: string | null
  /**
   * 第二遍换脸：把图1 VAEEncode 作 latent，并设 denoise<1，避免空 latent 整图重绘扭曲。
   */
  encodeLatentFromReference?: boolean
  denoise?: number
  unetName?: string
  clipName?: string
  vaeName?: string
  lightningLora?: string | null
  loraStrength?: number
}

/** Qwen-Image-Edit-2511：中文 prompt + 定妆参考（可选 1～2 张）；默认 GGUF Q3_K_M */
export function injectQwenImageEditWorkflow(prompt: ComfyPrompt, params: QwenImageEditWorkflowParams) {
  const unet = params.unetName || resolveQwenEditUnetName()
  const clip = params.clipName || LOCAL_COMIC_ENV.qwenEditClip
  const vae = params.vaeName || LOCAL_COMIC_ENV.qwenEditVae
  const useGguf = isQwenEditUnetGguf(unet)
  const lora = params.lightningLora === null
    ? ''
    : (params.lightningLora ?? LOCAL_COMIC_ENV.qwenEditLightningLora)
  const useLora = !!lora
  const steps = params.steps ?? (useLora ? LOCAL_COMIC_ENV.qwenEditSteps : 20)
  const cfg = params.cfg ?? (useLora ? LOCAL_COMIC_ENV.qwenEditCfg : 4)
  const shift = params.shift ?? LOCAL_COMIC_ENV.qwenEditShift

  if (prompt['1']) {
    if (useGguf) {
      prompt['1'].class_type = 'UnetLoaderGGUF'
      prompt['1'].inputs = { unet_name: unet }
    } else {
      prompt['1'].class_type = 'UNETLoader'
      prompt['1'].inputs = { unet_name: unet, weight_dtype: 'default' }
    }
  }
  if (prompt['2']?.inputs) {
    prompt['2'].inputs.clip_name = clip
    prompt['2'].inputs.type = 'qwen_image'
    // 16G 卡：Text Encoder 放 CPU，避免与 UNET 抢显存
    prompt['2'].inputs.device = 'cpu'
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.vae_name = vae
  }
  if (prompt['4']?.inputs) {
    if (params.referenceImage) {
      prompt['4'].inputs.image = params.referenceImage
    }
  }
  // 定妆参考先缩放到目标 16:9（中心裁切），否则 Edit 易跟参考近方形输出，再硬拉 1080p 会压扁
  if (params.referenceImage) {
    prompt['14'] = {
      class_type: 'ImageScale',
      inputs: {
        image: ['4', 0],
        upscale_method: 'lanczos',
        width: params.width,
        height: params.height,
        crop: 'center',
      },
    }
  } else if (prompt['14']) {
    delete prompt['14']
  }

  // 图2：第二定妆（双人换脸）
  if (params.referenceImage2) {
    prompt['15'] = {
      class_type: 'LoadImage',
      inputs: { image: params.referenceImage2 },
    }
    prompt['16'] = {
      class_type: 'ImageScale',
      inputs: {
        image: ['15', 0],
        upscale_method: 'lanczos',
        width: params.width,
        height: params.height,
        crop: 'center',
      },
    }
  } else {
    delete prompt['15']
    delete prompt['16']
  }

  if (prompt['5']?.inputs) {
    if (useLora) {
      prompt['5'].inputs.lora_name = lora
      prompt['5'].inputs.strength_model = params.loraStrength ?? LOCAL_COMIC_ENV.qwenEditLoraStrength
    } else {
      // 无 LoRA：旁路 —— KSampler / AuraFlow 直接吃 UNET
      prompt['5'] = {
        class_type: 'ModelSamplingAuraFlow',
        inputs: { model: ['1', 0], shift },
      }
      prompt['6'] = {
        class_type: 'CFGNorm',
        inputs: { model: ['5', 0], strength: 1.0 },
      }
      if (prompt['11']?.inputs) {
        prompt['11'].inputs.model = ['6', 0]
      }
    }
  }
  if (useLora && prompt['6']?.inputs) {
    prompt['6'].inputs.shift = shift
  }
  const pos = String(params.positive || '').trim()
  const neg = String(params.negative || '').trim()
  if (prompt['8']?.inputs) {
    prompt['8'].inputs.prompt = pos
    if (params.referenceImage) prompt['8'].inputs.image1 = ['14', 0]
    else delete prompt['8'].inputs.image1
    if (params.referenceImage2) prompt['8'].inputs.image2 = ['16', 0]
    else delete prompt['8'].inputs.image2
    delete prompt['8'].inputs.image3
  }
  if (prompt['9']?.inputs) {
    // 负向不喂参考图：避免 Qwen2.5-VL 把定妆图编两次（16G 上极慢）
    prompt['9'].inputs.prompt = neg
    delete prompt['9'].inputs.image1
    delete prompt['9'].inputs.image2
    delete prompt['9'].inputs.image3
  }
  if (prompt['10']?.inputs) {
    prompt['10'].inputs.width = params.width
    prompt['10'].inputs.height = params.height
  }
  if (prompt['11']?.inputs) {
    prompt['11'].inputs.seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000)
    prompt['11'].inputs.steps = steps
    prompt['11'].inputs.cfg = cfg
    prompt['11'].inputs.sampler_name = 'euler'
    prompt['11'].inputs.scheduler = 'simple'
    if (params.encodeLatentFromReference && params.referenceImage) {
      // 从整图 latent 低 denoise 局部改，禁止 Empty latent + denoise=1 整图重绘
      prompt['17'] = {
        class_type: 'VAEEncode',
        inputs: {
          pixels: ['14', 0],
          vae: ['3', 0],
        },
      }
      prompt['11'].inputs.latent_image = ['17', 0]
      prompt['11'].inputs.denoise = params.denoise ?? 0.42
    } else {
      delete prompt['17']
      prompt['11'].inputs.latent_image = ['10', 0]
      prompt['11'].inputs.denoise = params.denoise ?? 1
    }
  }
}

export type FluxReduxWorkflowParams = FluxWorkflowParams & {
  referenceImage: string
  reduxStrength?: number
  reduxStrengthType?: 'multiply' | 'attn_bias'
  reduxModel?: string
  clipVision?: string
}

function resolveComfyModelsFile(...segments: string[]): string {
  const bases = [
    LOCAL_COMIC_ENV.comfyModelsBase,
    path.join(path.dirname(LOCAL_COMIC_ENV.comfyInputDir), 'models'),
    path.join(path.dirname(LOCAL_COMIC_ENV.comfyInputDir), 'ComfyUI', 'models'),
  ]
  for (const base of bases) {
    const candidate = path.join(base, ...segments)
    if (fs.existsSync(candidate)) return candidate
  }
  return path.join(LOCAL_COMIC_ENV.comfyModelsBase, ...segments)
}

/** FLUX Redux + SigLIP 权重是否已就绪（磁盘） */
export function isFluxReduxReady(): boolean {
  const redux = resolveComfyModelsFile('style_models', LOCAL_COMIC_ENV.fluxReduxModel)
  const sigclip = resolveComfyModelsFile('clip_vision', LOCAL_COMIC_ENV.fluxReduxClipVision)
  return fs.existsSync(redux) && fs.existsSync(sigclip)
}

let comfyStyleModelsCache: { names: string[]; at: number } | null = null
let comfyClipVisionCache: { names: string[]; at: number } | null = null

function extractComfyEnumField(field: unknown): string[] {
  if (!Array.isArray(field) || !field.length) return []
  const first = field[0]
  if (Array.isArray(first)) return first.map(String).filter(Boolean)
  if (typeof first === 'string') return [first]
  return []
}

/** ComfyUI 已加载的 style_models 列表（需 extra_model_paths.yaml 配置 style_models） */
export async function fetchComfyStyleModelNames(): Promise<string[]> {
  const now = Date.now()
  if (comfyStyleModelsCache && now - comfyStyleModelsCache.at < 60_000) {
    return comfyStyleModelsCache.names
  }
  const resp = await fetch(comfyUrl('/object_info/StyleModelLoader'), { signal: AbortSignal.timeout(8_000) })
  if (!resp.ok) throw new Error(`ComfyUI object_info ${resp.status}`)
  const json = await resp.json() as {
    StyleModelLoader?: { input?: { required?: { style_model_name?: unknown[] } } }
  }
  const names = extractComfyEnumField(json.StyleModelLoader?.input?.required?.style_model_name)
  comfyStyleModelsCache = { names, at: now }
  return names
}

export async function fetchComfyClipVisionNames(): Promise<string[]> {
  const now = Date.now()
  if (comfyClipVisionCache && now - comfyClipVisionCache.at < 60_000) {
    return comfyClipVisionCache.names
  }
  const resp = await fetch(comfyUrl('/object_info/CLIPVisionLoader'), { signal: AbortSignal.timeout(8_000) })
  if (!resp.ok) throw new Error(`ComfyUI object_info ${resp.status}`)
  const json = await resp.json() as {
    CLIPVisionLoader?: { input?: { required?: { clip_name?: unknown[] } } }
  }
  const names = extractComfyEnumField(json.CLIPVisionLoader?.input?.required?.clip_name)
  comfyClipVisionCache = { names, at: now }
  return names
}

function resolveComfyEnumName(preferred: string, available: string[]): string | null {
  const want = String(preferred || '').trim()
  if (!want || !available.length) return null
  if (available.includes(want)) return want
  const loose = available.find(name => name.includes(want) || want.includes(name))
  return loose || null
}

/** Redux 权重在磁盘且 ComfyUI 能枚举到（避免 value_not_in_list） */
export async function isFluxReduxReadyInComfy(): Promise<boolean> {
  if (!isFluxReduxReady()) return false
  try {
    const [styleNames, clipNames] = await Promise.all([
      fetchComfyStyleModelNames(),
      fetchComfyClipVisionNames(),
    ])
    return !!resolveComfyEnumName(LOCAL_COMIC_ENV.fluxReduxModel, styleNames)
      && !!resolveComfyEnumName(LOCAL_COMIC_ENV.fluxReduxClipVision, clipNames)
  } catch {
    return false
  }
}

export async function resolveFluxReduxModelNamesInComfy(): Promise<{
  reduxModel: string
  clipVision: string
} | null> {
  if (!isFluxReduxReady()) return null
  try {
    const [styleNames, clipNames] = await Promise.all([
      fetchComfyStyleModelNames(),
      fetchComfyClipVisionNames(),
    ])
    const reduxModel = resolveComfyEnumName(LOCAL_COMIC_ENV.fluxReduxModel, styleNames)
    const clipVision = resolveComfyEnumName(LOCAL_COMIC_ENV.fluxReduxClipVision, clipNames)
    if (!reduxModel || !clipVision) return null
    return { reduxModel, clipVision }
  } catch {
    return null
  }
}

export function injectFluxReduxWorkflow(prompt: ComfyPrompt, params: FluxReduxWorkflowParams) {
  injectFluxWorkflow(prompt, params)
  if (prompt['10']?.inputs) prompt['10'].inputs.image = params.referenceImage
  if (prompt['11']?.inputs) {
    prompt['11'].inputs.clip_name = params.clipVision || LOCAL_COMIC_ENV.fluxReduxClipVision
  }
  if (prompt['13']?.inputs) {
    prompt['13'].inputs.style_model_name = params.reduxModel || LOCAL_COMIC_ENV.fluxReduxModel
  }
  if (prompt['14']?.inputs) {
    prompt['14'].inputs.strength = params.reduxStrength ?? LOCAL_COMIC_ENV.fluxReduxStrength
    prompt['14'].inputs.strength_type = params.reduxStrengthType ?? 'attn_bias'
  }
}

export type FluxPulidWorkflowParams = FluxWorkflowParams & {
  referenceImage: string
  pulidModel?: string
  pulidWeight?: number
  pulidStartAt?: number
  pulidEndAt?: number
  pulidFaceProvider?: string
}

/** PuLID + EVA-CLIP + InsightFace + facexlib 权重是否已就绪（磁盘） */
export function isFluxPulidReady(): boolean {
  const pulid = resolveComfyModelsFile('pulid', LOCAL_COMIC_ENV.fluxPulidModel)
  const eva = resolveComfyModelsFile('clip', LOCAL_COMIC_ENV.fluxPulidEvaClip)
  const faceDet = resolveComfyModelsFile('facexlib', 'detection_Resnet50_Final.pth')
  const insight = resolveComfyModelsFile('insightface', 'models', 'antelopev2', 'glintr100.onnx')
  return fs.existsSync(pulid) && fs.existsSync(eva) && fs.existsSync(faceDet) && fs.existsSync(insight)
}

/** ComfyUI 是否已加载 PuLID Flux 自定义节点 */
export async function isFluxPulidReadyInComfy(): Promise<boolean> {
  if (!isFluxPulidReady()) return false
  try {
    const resp = await fetch(comfyUrl('/object_info/ApplyPulidFlux'), { signal: AbortSignal.timeout(8_000) })
    if (!resp.ok) return false
    const json = await resp.json() as Record<string, unknown>
    return !!json.ApplyPulidFlux
  } catch {
    return false
  }
}

export async function resolveFluxPulidModelNameInComfy(): Promise<string | null> {
  if (!isFluxPulidReady()) return null
  try {
    const resp = await fetch(comfyUrl('/object_info/PulidFluxModelLoader'), { signal: AbortSignal.timeout(8_000) })
    if (!resp.ok) return null
    const json = await resp.json() as Record<string, { input?: { required?: { pulid_file?: unknown[] } } }>
    const names = extractComfyEnumField(json.PulidFluxModelLoader?.input?.required?.pulid_file)
    return resolveComfyEnumName(LOCAL_COMIC_ENV.fluxPulidModel, names)
  } catch {
    return LOCAL_COMIC_ENV.fluxPulidModel
  }
}

export type FluxPortraitReferenceCropOptions = {
  /** 仅裁脸区（分镜 PuLID 推荐，少污染站姿/背景） */
  faceOnly?: boolean
  /** 四视图/全身时裁上半身；faceOnly 时忽略 */
  faceBodyOnly?: boolean
}

/** 从定妆/参考图裁切 PuLID·Redux 共用区域 */
async function extractPortraitReferenceBuffer(
  abs: string,
  options?: FluxPortraitReferenceCropOptions,
): Promise<Buffer> {
  const meta = await sharp(abs).metadata()
  const w = meta.width || 1024
  const h = meta.height || 1024
  const faceOnly = options?.faceOnly === true
  const faceBodyOnly = !faceOnly && options?.faceBodyOnly !== false

  if (faceOnly) {
    const cropH = Math.max(1, Math.round(h * 0.34))
    const cropW = Math.max(1, Math.round(Math.min(w, h * 0.62)))
    const left = Math.max(0, Math.round((w - cropW) / 2))
    const top = Math.max(0, Math.round(h * 0.04))
    return sharp(abs).extract({ left, top, width: cropW, height: cropH }).png().toBuffer()
  }
  if (w / h >= 2.2) {
    const colW = Math.max(1, Math.round(w / 4))
    const colBuf = await sharp(abs).extract({ left: 0, top: 0, width: colW, height: h }).png().toBuffer()
    const upperH = Math.max(1, Math.round(h * (faceBodyOnly ? 0.42 : 0.55)))
    return sharp(colBuf).extract({ left: 0, top: 0, width: colW, height: upperH }).png().toBuffer()
  }
  const cropH = Math.max(1, Math.round(h * (faceBodyOnly ? 0.38 : 0.45)))
  const cropW = Math.max(1, Math.round(Math.min(w, h * (faceBodyOnly ? 0.72 : 0.88))))
  const left = Math.max(0, Math.round((w - cropW) / 2))
  return sharp(abs).extract({ left, top: 0, width: cropW, height: cropH }).png().toBuffer()
}

/** 上传定妆参考；分镜推荐 faceOnly 仅锁脸，减少定妆站姿污染场景/动作 */
export async function prepareFluxPulidReferenceImage(
  relativePath: string,
  options?: FluxPortraitReferenceCropOptions,
): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${normalized}`)

  const tmpRel = `static/images/${uuid()}_flux_pulid_ref.png`
  const tmpAbs = getAbsolutePath(tmpRel)
  const refBuffer = await extractPortraitReferenceBuffer(abs, options)
  const faceOnly = options?.faceOnly === true

  if (faceOnly) {
    await sharp(refBuffer).resize(512, 512, { fit: 'cover' }).png().toFile(tmpAbs)
  } else {
    const meta = await sharp(refBuffer).metadata()
    const maxSide = Math.max(meta.width || 512, meta.height || 512)
    const target = maxSide > 1024 ? 1024 : maxSide
    await sharp(refBuffer)
      .resize(target, target, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(tmpAbs)
  }

  return uploadImageToComfyInput(tmpRel)
}

export function injectFluxPulidWorkflow(prompt: ComfyPrompt, params: FluxPulidWorkflowParams) {
  injectFluxWorkflow(prompt, params)
  if (prompt['10']?.inputs) prompt['10'].inputs.image = params.referenceImage
  if (prompt['20']?.inputs) {
    prompt['20'].inputs.pulid_file = params.pulidModel || LOCAL_COMIC_ENV.fluxPulidModel
  }
  if (prompt['21']?.inputs) {
    prompt['21'].inputs.provider = params.pulidFaceProvider || LOCAL_COMIC_ENV.fluxPulidFaceProvider
  }
  if (prompt['23']?.inputs) {
    prompt['23'].inputs.weight = params.pulidWeight ?? LOCAL_COMIC_ENV.fluxPulidWeight
    prompt['23'].inputs.start_at = params.pulidStartAt ?? LOCAL_COMIC_ENV.fluxPulidStartAt
    prompt['23'].inputs.end_at = params.pulidEndAt ?? LOCAL_COMIC_ENV.fluxPulidEndAt
  }
}

/** 从入库 referenceImages 解析本地 static/ 路径（Comfy 专用，不含 data URL） */
export function parseComfyReferenceImagePaths(raw: string | null | undefined): string[] {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.from(new Set(
    refs
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .map(item => (item.startsWith('/static/') ? item.slice(1) : item))
      .filter(item => item.startsWith('static/')),
  )).slice(0, 1)
}

/** 上传定妆参考到 Comfy input；faceOnly 仅裁脸（Redux 锁脸且少污染站姿/背景） */
export async function prepareFluxReduxReferenceImage(
  relativePath: string,
  options?: FluxPortraitReferenceCropOptions,
): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${normalized}`)

  const tmpRel = `static/images/${uuid()}_flux_redux_ref.png`
  const tmpAbs = getAbsolutePath(tmpRel)
  const refBuffer = await extractPortraitReferenceBuffer(abs, options)

  await sharp(refBuffer)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(tmpAbs)

  return uploadImageToComfyInput(tmpRel)
}

/**
 * Qwen-Edit 分镜定妆参考：裁脸后以「白底弱锁脸」铺进目标 16:9。
 * 禁止 cover 铺满整张画布（Edit 会把满幅脸当强改图底 → 手融、身体扭曲）；
 * 也禁止把竖幅全身原图直接 center 裁横屏（易裁到腰而非脸）。
 */
export async function prepareQwenEditStoryboardReferenceImage(
  relativePath: string,
  width: number,
  height: number,
): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${normalized}`)

  const meta = await sharp(abs).metadata()
  const w = meta.width || 1024
  const h = meta.height || 1024
  const tmpRel = `static/images/${uuid()}_qwen_edit_sb_ref.png`
  const tmpAbs = getAbsolutePath(tmpRel)

  let faceBuffer: Buffer
  if (w / h >= 2.2) {
    // 旧四视图横拼：取正面列再裁上半身
    const colW = Math.max(1, Math.round(w / 4))
    const colBuf = await sharp(abs).extract({ left: 0, top: 0, width: colW, height: h }).png().toBuffer()
    const faceH = Math.max(1, Math.round(h * 0.42))
    faceBuffer = await sharp(colBuf).extract({ left: 0, top: 0, width: colW, height: faceH }).png().toBuffer()
  } else if (h > w * 1.15) {
    // 竖幅定妆（男人/消防员）：从上往下取脸+胸，勿中心裁到腰
    const faceH = Math.max(1, Math.round(h * 0.42))
    const faceW = Math.max(1, Math.round(Math.min(w, faceH * 0.95)))
    const left = Math.max(0, Math.round((w - faceW) / 2))
    faceBuffer = await sharp(abs).extract({ left, top: 0, width: faceW, height: faceH }).png().toBuffer()
  } else {
    // 横屏半身定妆：去两侧后裁上半
    const faceH = Math.max(1, Math.round(h * 0.68))
    const faceW = Math.max(1, Math.round(Math.min(w, h * 0.8)))
    const left = Math.max(0, Math.round((w - faceW) / 2))
    faceBuffer = await sharp(abs).extract({ left, top: 0, width: faceW, height: faceH }).png().toBuffer()
  }

  // 弱参考：脸约占画幅一半，四周留白 → Edit 锁身份，不强绑全身构图
  const faceSize = Math.round(Math.min(width, height) * 0.55)
  const resizedFace = await sharp(faceBuffer)
    .resize(faceSize, faceSize, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()
  const top = Math.round(height * 0.08)
  const leftPad = Math.round((width - faceSize) / 2)

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: resizedFace, top, left: leftPad }])
    .png()
    .toFile(tmpAbs)

  return uploadImageToComfyInput(tmpRel)
}

/**
 * 双定妆第二遍：整图场景缩放到目标画幅（cover，无白边），作 image1 + VAEEncode latent。
 */
export async function prepareQwenEditCanvasImage(
  relativePath: string,
  width: number,
  height: number,
): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Canvas image not found: ${normalized}`)

  const tmpRel = `static/images/${uuid()}_qwen_edit_canvas.png`
  const tmpAbs = getAbsolutePath(tmpRel)
  await sharp(abs)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(tmpAbs)
  return uploadImageToComfyInput(tmpRel)
}

/**
 * 双定妆第二遍身份参考：脸部 cover 铺满画幅（勿用白底小芯片，否则低 denoise 仍易糊脸）。
 */
export async function prepareQwenEditFaceIdentityImage(
  relativePath: string,
  width: number,
  height: number,
): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${normalized}`)

  const meta = await sharp(abs).metadata()
  const w = meta.width || 1024
  const h = meta.height || 1024
  const tmpRel = `static/images/${uuid()}_qwen_edit_face_id.png`
  const tmpAbs = getAbsolutePath(tmpRel)

  let faceBuffer: Buffer
  if (w / h >= 2.2) {
    const colW = Math.max(1, Math.round(w / 4))
    const colBuf = await sharp(abs).extract({ left: 0, top: 0, width: colW, height: h }).png().toBuffer()
    const faceH = Math.max(1, Math.round(h * 0.45))
    faceBuffer = await sharp(colBuf).extract({ left: 0, top: 0, width: colW, height: faceH }).png().toBuffer()
  } else if (h > w * 1.15) {
    const faceH = Math.max(1, Math.round(h * 0.42))
    const faceW = Math.max(1, Math.round(Math.min(w, faceH * 0.95)))
    const left = Math.max(0, Math.round((w - faceW) / 2))
    faceBuffer = await sharp(abs).extract({ left, top: 0, width: faceW, height: faceH }).png().toBuffer()
  } else {
    const faceH = Math.max(1, Math.round(h * 0.7))
    const faceW = Math.max(1, Math.round(Math.min(w, h * 0.85)))
    const left = Math.max(0, Math.round((w - faceW) / 2))
    faceBuffer = await sharp(abs).extract({ left, top: 0, width: faceW, height: faceH }).png().toBuffer()
  }

  await sharp(faceBuffer)
    .resize(width, height, { fit: 'cover', position: 'top' })
    .png()
    .toFile(tmpAbs)
  return uploadImageToComfyInput(tmpRel)
}

/**
 * Kolors img2img 弱参考：裁脸后以「小脸芯片」铺进目标画幅白底。
 * 禁止大脸占半幅（denoise 过低时会几乎原样输出白底半身/大头照）。
 */
export async function prepareKolorsImg2ImgReferenceImage(
  relativePath: string,
  width: number,
  height: number,
): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${normalized}`)

  const meta = await sharp(abs).metadata()
  const w = meta.width || 1024
  const h = meta.height || 1024
  const tmpRel = `static/images/${uuid()}_kolors_i2i_ref.png`
  const tmpAbs = getAbsolutePath(tmpRel)

  let faceBuffer: Buffer
  if (w / h >= 2.2) {
    const colW = Math.max(1, Math.round(w / 4))
    const colBuf = await sharp(abs).extract({ left: 0, top: 0, width: colW, height: h }).png().toBuffer()
    const faceH = Math.max(1, Math.round(h * 0.38))
    faceBuffer = await sharp(colBuf).extract({ left: 0, top: 0, width: colW, height: faceH }).png().toBuffer()
  } else if (h > w * 1.15) {
    const faceH = Math.max(1, Math.round(h * 0.36))
    const faceW = Math.max(1, Math.round(Math.min(w, faceH * 0.95)))
    const left = Math.max(0, Math.round((w - faceW) / 2))
    faceBuffer = await sharp(abs).extract({ left, top: 0, width: faceW, height: faceH }).png().toBuffer()
  } else {
    const faceH = Math.max(1, Math.round(h * 0.55))
    const faceW = Math.max(1, Math.round(Math.min(w, h * 0.72)))
    const left = Math.max(0, Math.round((w - faceW) / 2))
    faceBuffer = await sharp(abs).extract({ left, top: 0, width: faceW, height: faceH }).png().toBuffer()
  }

  // 小脸芯片：只提供身份种子，不占构图主导（约 22% 短边）
  const faceSize = Math.round(Math.min(width, height) * 0.22)
  const resizedFace = await sharp(faceBuffer)
    .resize(faceSize, faceSize, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()
  const top = Math.round(height * 0.12)
  const leftPad = Math.round((width - faceSize) / 2)

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: resizedFace, top, left: leftPad }])
    .png()
    .toFile(tmpAbs)

  return uploadImageToComfyInput(tmpRel)
}

/**
 * Kolors img2img：强制按文案景别出场景，禁止沿用参考白底半身/大头。
 */
export function enrichKolorsImg2ImgCompositionChinese(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return raw
  if (/参考图仅提供五官发型|禁止输出白底半身/.test(raw)) return raw.slice(0, 1800)
  const prefix = [
    '硬性：参考图仅提供五官与发型身份种子',
    '必须按文案景别绘制完整场景与人物全身或半身姿态',
    '禁止输出白底半身、大头照、胸像特写、参考图原构图',
  ].join('。')
  return `${prefix}。${raw}`.slice(0, 1800)
}

/** ComfyUI InstantID 节点实际读取的 InsightFace 目录（非 extra_model_paths） */
function resolveComfyUiInsightFaceDir(): string {
  const comfyModels = path.join(path.dirname(LOCAL_COMIC_ENV.comfyInputDir), 'models', 'insightface', 'models', 'antelopev2')
  const external = path.join(LOCAL_COMIC_ENV.comfyModelsBase, 'insightface', 'models', 'antelopev2')
  return fs.existsSync(comfyModels) ? comfyModels : external
}

/** InstantID + InsightFace 权重是否已就绪（磁盘） */
export function isInstantIdReady(): boolean {
  const ipAdapter = resolveComfyModelsFile('instantid', LOCAL_COMIC_ENV.instantIdModel)
  const controlNet = resolveComfyModelsFile('controlnet', 'instantid', 'diffusion_pytorch_model.safetensors')
  const insightDir = resolveComfyUiInsightFaceDir()
  const hasInsight = fs.existsSync(insightDir)
    && fs.existsSync(path.join(insightDir, 'glintr100.onnx'))
    && fs.existsSync(path.join(insightDir, 'scrfd_10g_bnkps.onnx'))
  return fs.existsSync(ipAdapter) && fs.existsSync(controlNet) && hasInsight
}

/** ComfyUI 进程是否已扫描到 InstantID / ControlNet 权重（extra_model_paths 须含 instantid、controlnet） */
export async function isInstantIdComfyCatalogReady(): Promise<boolean> {
  if (!isInstantIdReady()) return false
  try {
    const base = LOCAL_COMIC_ENV.comfyBaseUrl
    const [r1, r2] = await Promise.all([
      fetch(`${base}/object_info/InstantIDModelLoader`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/object_info/ControlNetLoader`, { signal: AbortSignal.timeout(8000) }),
    ])
    if (!r1.ok || !r2.ok) return false
    const j1 = await r1.json() as Record<string, { input?: { required?: Record<string, unknown> } }>
    const j2 = await r2.json() as Record<string, { input?: { required?: Record<string, unknown> } }>
    const ip = extractComfyEnumField(j1.InstantIDModelLoader?.input?.required?.instantid_file)
    const cn = extractComfyEnumField(j2.ControlNetLoader?.input?.required?.control_net_name)
    return ip.length > 0 && cn.some(n => /instantid/i.test(n))
  } catch {
    return false
  }
}

export async function resolveInstantIdComfyFileNames(): Promise<{ ipAdapter: string; controlNet: string }> {
  const fallback = {
    ipAdapter: LOCAL_COMIC_ENV.instantIdModel,
    controlNet: LOCAL_COMIC_ENV.instantIdControlNet,
  }
  try {
    const base = LOCAL_COMIC_ENV.comfyBaseUrl
    const [r1, r2] = await Promise.all([
      fetch(`${base}/object_info/InstantIDModelLoader`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/object_info/ControlNetLoader`, { signal: AbortSignal.timeout(8000) }),
    ])
    if (!r1.ok || !r2.ok) return fallback
    const j1 = await r1.json() as Record<string, any>
    const j2 = await r2.json() as Record<string, any>
    const ipList = extractComfyEnumField(j1.InstantIDModelLoader?.input?.required?.instantid_file)
    const cnList = extractComfyEnumField(j2.ControlNetLoader?.input?.required?.control_net_name)
    const ipAdapter = ipList.find(n => n === LOCAL_COMIC_ENV.instantIdModel) || ipList[0] || fallback.ipAdapter
    const controlNet = cnList.find(n => /instantid/i.test(n)) || fallback.controlNet
    return { ipAdapter, controlNet }
  } catch {
    return fallback
  }
}

/** 上传定妆参考到 Comfy input；InstantID 需可检测人脸，四视图取正面列 */
export async function prepareInstantIdReferenceImage(relativePath: string): Promise<string> {
  const normalized = relativePath.replace(/^\//, '')
  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${normalized}`)

  const meta = await sharp(abs).metadata()
  const w = meta.width || 1024
  const h = meta.height || 1024
  const tmpRel = `static/images/${uuid()}_instantid_ref.png`
  const tmpAbs = getAbsolutePath(tmpRel)

  let refBuffer: Buffer
  if (w / h >= 2.2) {
    const colW = Math.max(1, Math.round(w / 4))
    refBuffer = await sharp(abs)
      .extract({ left: 0, top: 0, width: colW, height: h })
      .png()
      .toBuffer()
  } else {
    refBuffer = await sharp(abs).png().toBuffer()
  }

  const maxSide = Math.max(w, h)
  const target = maxSide > 1024 ? 1024 : maxSide
  await sharp(refBuffer)
    .resize(target, target, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toFile(tmpAbs)

  return uploadImageToComfyInput(tmpRel)
}

export type SdxlInstantIdWorkflowParams = SdxlWorkflowParams & {
  referenceImage: string
  instantIdModel?: string
  instantIdControlNet?: string
  instantIdWeight?: number
  instantIdStartAt?: number
  instantIdEndAt?: number
  instantIdFaceProvider?: string
}

export function injectSdxlInstantIdWorkflow(prompt: ComfyPrompt, params: SdxlInstantIdWorkflowParams) {
  if (prompt['4']?.inputs) {
    prompt['4'].inputs.ckpt_name = params.checkpoint || LOCAL_COMIC_ENV.sdxlCheckpoint
  }
  if (prompt['11']?.inputs) {
    prompt['11'].inputs.instantid_file = params.instantIdModel || LOCAL_COMIC_ENV.instantIdModel
  }
  if (prompt['16']?.inputs) {
    prompt['16'].inputs.control_net_name = params.instantIdControlNet || LOCAL_COMIC_ENV.instantIdControlNet
  }
  if (prompt['13']?.inputs) prompt['13'].inputs.image = params.referenceImage
  if (prompt['39']?.inputs) prompt['39'].inputs.text = params.positive
  if (prompt['40']?.inputs) {
    prompt['40'].inputs.text = params.negative
      || 'lowres, bad anatomy, bad hands, text, watermark, blurry, 3d, realistic, ugly, deformed face'
  }
  if (prompt['38']?.inputs) {
    prompt['38'].inputs.provider = params.instantIdFaceProvider || LOCAL_COMIC_ENV.instantIdFaceProvider
  }
  if (prompt['60']?.inputs) {
    prompt['60'].inputs.weight = params.instantIdWeight ?? LOCAL_COMIC_ENV.instantIdWeight
    prompt['60'].inputs.start_at = params.instantIdStartAt ?? LOCAL_COMIC_ENV.instantIdStartAt
    prompt['60'].inputs.end_at = params.instantIdEndAt ?? LOCAL_COMIC_ENV.instantIdEndAt
  }
  if (prompt['5']?.inputs) {
    prompt['5'].inputs.width = params.width
    prompt['5'].inputs.height = params.height
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000)
    if (params.steps != null) prompt['3'].inputs.steps = params.steps
    if (params.cfg != null) prompt['3'].inputs.cfg = params.cfg
    if (params.samplerName) prompt['3'].inputs.sampler_name = params.samplerName
    if (params.scheduler) prompt['3'].inputs.scheduler = params.scheduler
  }
}

export function injectSdxlWorkflow(
  prompt: ComfyPrompt,
  params: {
    positive: string
    negative?: string
    width: number
    height: number
    seed?: number
    checkpoint?: string
    steps?: number
    cfg?: number
    samplerName?: string
    scheduler?: string
  },
) {
  if (prompt['4']?.inputs) {
    prompt['4'].inputs.ckpt_name = params.checkpoint || LOCAL_COMIC_ENV.sdxlCheckpoint
  }
  if (prompt['5']?.inputs) {
    prompt['5'].inputs.width = params.width
    prompt['5'].inputs.height = params.height
  }
  if (prompt['6']?.inputs) prompt['6'].inputs.text = params.positive
  if (prompt['7']?.inputs) {
    prompt['7'].inputs.text = params.negative
      || 'lowres, bad anatomy, bad hands, text, watermark, blurry, 3d, realistic, ugly'
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000)
    if (params.steps != null) prompt['3'].inputs.steps = params.steps
    if (params.cfg != null) prompt['3'].inputs.cfg = params.cfg
    if (params.samplerName) prompt['3'].inputs.sampler_name = params.samplerName
    if (params.scheduler) prompt['3'].inputs.scheduler = params.scheduler
  }
}

export type SdxlWorkflowParams = {
  positive: string
  negative?: string
  width: number
  height: number
  seed?: number
  checkpoint?: string
  steps?: number
  cfg?: number
  samplerName?: string
  scheduler?: string
}

export type SdxlImg2ImgParams = SdxlWorkflowParams & {
  initImage: string
  denoise?: number
}

export function injectSdxlImg2ImgWorkflow(prompt: ComfyPrompt, params: SdxlImg2ImgParams) {
  if (prompt['4']?.inputs) {
    prompt['4'].inputs.ckpt_name = params.checkpoint || LOCAL_COMIC_ENV.sdxlCheckpoint
  }
  if (prompt['10']?.inputs) {
    prompt['10'].inputs.image = params.initImage
  }
  if (prompt['6']?.inputs) prompt['6'].inputs.text = params.positive
  if (prompt['7']?.inputs) {
    prompt['7'].inputs.text = params.negative
      || 'lowres, bad anatomy, bad hands, text, watermark, blurry, 3d, realistic, ugly'
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000)
    if (params.steps != null) prompt['3'].inputs.steps = params.steps
    if (params.cfg != null) prompt['3'].inputs.cfg = params.cfg
    if (params.samplerName) prompt['3'].inputs.sampler_name = params.samplerName
    if (params.scheduler) prompt['3'].inputs.scheduler = params.scheduler
    if (params.denoise != null) prompt['3'].inputs.denoise = params.denoise
  }
}

/** txt2img + RealESRGAN 4x + 缩放到 outputWidth×outputHeight（见 sdxl_upscale.json） */
export function injectSdxlUpscaleWorkflow(prompt: ComfyPrompt, params: SdxlWorkflowParams) {
  injectSdxlWorkflow(prompt, params)
  const upscaleModel = LOCAL_COMIC_ENV.upscaleModel?.trim()
  if (upscaleModel && prompt['10']?.inputs) {
    prompt['10'].inputs.model_name = upscaleModel
  }
  if (prompt['12']?.inputs) {
    prompt['12'].inputs.width = LOCAL_COMIC_ENV.outputWidth
    prompt['12'].inputs.height = LOCAL_COMIC_ENV.outputHeight
    prompt['12'].inputs.upscale_method = 'lanczos'
  }
}

export function injectWanI2vWorkflow(
  prompt: ComfyPrompt,
  params: {
    positive: string
    negative?: string
    imageName: string
    width?: number
    height?: number
    length?: number
    steps?: number
    cfg?: number
    shift?: number
    samplerName?: string
    scheduler?: string
    unetName?: string
    filenamePrefix?: string
  },
) {
  if (params.unetName && prompt['37']?.inputs) {
    prompt['37'].inputs.unet_name = params.unetName
  }
  if (prompt['10']?.inputs) prompt['10'].inputs.image = params.imageName
  if (prompt['6']?.inputs) prompt['6'].inputs.text = params.positive
  if (prompt['7']?.inputs) {
    prompt['7'].inputs.text = params.negative
      || 'static, blurry, distorted, deformed, morphing, melted face, vertical smear, ghosting, duplicate person, low quality, watermark'
  }
  if (prompt['40']?.inputs) {
    prompt['40'].inputs.width = params.width ?? LOCAL_COMIC_ENV.wanVideoWidth
    prompt['40'].inputs.height = params.height ?? LOCAL_COMIC_ENV.wanVideoHeight
    if (params.length != null && Number.isFinite(params.length)) {
      prompt['40'].inputs.length = Math.max(1, Math.round(params.length))
    }
  }
  if (prompt['42']?.inputs && params.shift != null && Number.isFinite(params.shift)) {
    prompt['42'].inputs.shift = params.shift
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.seed = Math.floor(Math.random() * 1_000_000_000)
    prompt['3'].inputs.steps = params.steps ?? LOCAL_COMIC_ENV.wanVideoSteps
    if (params.cfg != null && Number.isFinite(params.cfg)) {
      prompt['3'].inputs.cfg = params.cfg
    }
    if (params.samplerName) prompt['3'].inputs.sampler_name = params.samplerName
    if (params.scheduler) prompt['3'].inputs.scheduler = params.scheduler
  }
  if (prompt['50']?.inputs && 'fps' in prompt['50'].inputs) {
    prompt['50'].inputs.fps = LOCAL_COMIC_ENV.wanVideoFps
  }
  if (prompt['51']?.inputs) {
    prompt['51'].inputs.filename_prefix = params.filenamePrefix || 'video/huobao_i2v'
  }
}

export function injectWanFlf2vWorkflow(
  prompt: ComfyPrompt,
  params: {
    positive: string
    negative?: string
    startImage: string
    endImage: string
    length?: number
    width?: number
    height?: number
    steps?: number
  },
) {
  if (prompt['10']?.inputs) prompt['10'].inputs.image = params.startImage
  if (prompt['11']?.inputs) prompt['11'].inputs.image = params.endImage
  if (prompt['6']?.inputs) prompt['6'].inputs.text = params.positive
  if (prompt['7']?.inputs) {
    prompt['7'].inputs.text = params.negative || 'static, blurry, distorted, low quality, watermark, jitter'
  }
  // wan_flf2v.json uses node 40 for WanFirstLastFrameToVideo
  for (const nodeId of ['40', '49']) {
    const node = prompt[nodeId]
    if (!node?.inputs) continue
    if (params.length != null && Number.isFinite(params.length) && 'length' in node.inputs) {
      node.inputs.length = Math.max(1, Math.round(params.length))
    }
    if ('width' in node.inputs) node.inputs.width = params.width ?? LOCAL_COMIC_ENV.wanVideoWidth
    if ('height' in node.inputs) node.inputs.height = params.height ?? LOCAL_COMIC_ENV.wanVideoHeight
  }
  if (prompt['3']?.inputs) {
    prompt['3'].inputs.seed = Math.floor(Math.random() * 1_000_000_000)
    prompt['3'].inputs.steps = params.steps ?? LOCAL_COMIC_ENV.wanVideoSteps
  }
  if (prompt['50']?.inputs && 'fps' in prompt['50'].inputs) {
    prompt['50'].inputs.fps = LOCAL_COMIC_ENV.wanVideoFps
  }
  if (prompt['51']?.inputs) {
    prompt['51'].inputs.filename_prefix = 'video/huobao_flf2v'
  }
}

export async function waitForComfyServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await comfyJson('GET', '/system_stats', undefined, 5_000)
      return true
    } catch {
      await new Promise(r => setTimeout(r, 2_000))
    }
  }
  return false
}

export async function queueComfyPrompt(prompt: ComfyPrompt): Promise<string> {
  const clientId = uuid()
  const result = await comfyJson('POST', '/prompt', { prompt, client_id: clientId }, 60_000) as { prompt_id?: string }
  if (!result.prompt_id) throw new Error('ComfyUI did not return prompt_id')
  logTaskProgress('ComfyUI', 'queued', { prompt_id: result.prompt_id, client_id: clientId })
  return result.prompt_id
}

export type ComfyWaitProgress = {
  elapsedSec: number
  value?: number
  max?: number
  percent?: number
  node?: string | null
  phase: 'queued' | 'running'
  label: string
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`
}

function comfyWsUrl(clientId: string) {
  const base = LOCAL_COMIC_ENV.comfyBaseUrl.replace(/^http/, 'ws')
  return `${base}/ws?clientId=${encodeURIComponent(clientId)}`
}

/** 轮询 history；同时听 Comfy WebSocket 的 progress，便于控制台看到采样进度 */
export async function waitForComfyPrompt(
  promptId: string,
  timeoutMs = 3_600_000,
  options?: {
    onProgress?: (p: ComfyWaitProgress) => void
    logEveryMs?: number
    label?: string
  },
) {
  const started = Date.now()
  const logEveryMs = options?.logEveryMs ?? 15_000
  const scopeLabel = options?.label || 'wait'
  let lastLogAt = 0
  let lastValue: number | undefined
  let lastMax: number | undefined
  let lastNode: string | null = null
  let phase: 'queued' | 'running' = 'queued'
  let ws: WebSocket | null = null

  const emitProgress = (forceLog = false) => {
    const elapsedSec = Math.round((Date.now() - started) / 1000)
    const percent = lastMax && lastMax > 0 && lastValue != null
      ? Math.min(99, Math.round((lastValue / lastMax) * 100))
      : undefined
    const parts = [
      `已等待 ${formatElapsed(elapsedSec)}`,
      phase === 'queued' ? '排队中' : '执行中',
      lastNode ? `节点 ${lastNode}` : null,
      percent != null ? `采样 ${lastValue}/${lastMax} (${percent}%)` : null,
    ].filter(Boolean)
    const info: ComfyWaitProgress = {
      elapsedSec,
      value: lastValue,
      max: lastMax,
      percent,
      node: lastNode,
      phase,
      label: parts.join(' · '),
    }
    options?.onProgress?.(info)
    const now = Date.now()
    if (forceLog || now - lastLogAt >= logEveryMs) {
      lastLogAt = now
      logTaskProgress('ComfyUI', scopeLabel, {
        prompt_id: promptId,
        elapsed: formatElapsed(elapsedSec),
        phase,
        node: lastNode || undefined,
        progress: percent != null ? `${lastValue}/${lastMax}` : undefined,
        percent,
      })
    }
  }

  try {
    if (typeof WebSocket !== 'undefined') {
      const clientId = uuid()
      ws = new WebSocket(comfyWsUrl(clientId))
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string
            data?: { value?: number; max?: number; node?: string | null; prompt_id?: string }
          }
          const data = msg.data || {}
          if (data.prompt_id && data.prompt_id !== promptId) return
          if (msg.type === 'progress') {
            phase = 'running'
            if (typeof data.value === 'number') lastValue = data.value
            if (typeof data.max === 'number') lastMax = data.max
            emitProgress()
          } else if (msg.type === 'executing') {
            phase = data.node == null ? 'queued' : 'running'
            lastNode = data.node == null ? null : String(data.node)
            emitProgress()
          }
        } catch {
          // ignore malformed ws frames
        }
      })
      ws.addEventListener('error', () => {
        // 无 WS 时仍靠 history 轮询
      })
    }
  } catch {
    ws = null
  }

  emitProgress(true)
  try {
    while (Date.now() - started < timeoutMs) {
      const hist = await comfyJson('GET', `/history/${promptId}`, undefined, 30_000) as Record<string, {
        status?: { completed?: boolean; status_str?: string; messages?: unknown[] }
        outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }>; videos?: Array<{ filename: string; subfolder?: string; type?: string }> }>
      }>
      const item = hist[promptId]
      if (item) {
        if (item.status?.completed) {
          logTaskSuccess('ComfyUI', 'completed', {
            prompt_id: promptId,
            elapsed: formatElapsed(Math.round((Date.now() - started) / 1000)),
          })
          return item.outputs || {}
        }
        if (item.status?.status_str === 'error') {
          const messages = item.status?.messages || []
          const interrupted = JSON.stringify(messages).includes('execution_interrupted')
          if (interrupted) {
            throw new Error(
              'ComfyUI 任务被中断（execution_interrupted）。常见原因：切换 LLM/配音阶段、点「卸载本地模型」、或 ComfyUI 点了 Interrupt。'
              + '请保持在「定妆/配图」页等待完成，勿切换到剧本 LLM 或配音。',
            )
          }
          throw new Error(`ComfyUI execution failed: ${JSON.stringify(messages)}`)
        }
        phase = 'running'
      } else {
        // 还在队列：查一下是否在 running
        try {
          const q = await comfyJson('GET', '/queue', undefined, 10_000) as {
            queue_running?: Array<[number, string, ...unknown[]]>
            queue_pending?: Array<[number, string, ...unknown[]]>
          }
          const running = (q.queue_running || []).some(row => row?.[1] === promptId)
          const pending = (q.queue_pending || []).some(row => row?.[1] === promptId)
          phase = running ? 'running' : (pending ? 'queued' : phase)
        } catch {
          // ignore queue probe failures
        }
      }
      emitProgress()
      await new Promise(r => setTimeout(r, 5_000))
    }
    throw new Error('ComfyUI prompt timeout')
  } finally {
    try { ws?.close() } catch { /* ignore */ }
  }
}

function resolveComfyOutputPath(filename: string, subfolder = '', type = 'output') {
  if (type === 'input') {
    return path.join(LOCAL_COMIC_ENV.comfyInputDir, subfolder, filename)
  }
  // ComfyUI SaveImage：output 类型直接落在 comfyOutputDir/{subfolder}/ 下
  return path.join(LOCAL_COMIC_ENV.comfyOutputDir, subfolder, filename)
}

export function copyComfyImageOutput(outputs: Record<string, unknown>, destSubDir: string): string {
  for (const out of Object.values(outputs)) {
    const row = out as { images?: Array<{ filename: string; subfolder?: string; type?: string }> }
    const img = row.images?.[0]
    if (!img?.filename) continue
    const src = resolveComfyOutputPath(img.filename, img.subfolder || '', img.type || 'output')
    if (!fs.existsSync(src)) continue
    const destDir = path.dirname(getAbsolutePath(`static/${destSubDir}/placeholder`))
    fs.mkdirSync(destDir, { recursive: true })
    const ext = path.extname(img.filename) || '.png'
    const destName = `${uuid()}${ext}`
    const destPath = path.join(destDir, destName)
    fs.copyFileSync(src, destPath)
    return `static/${destSubDir}/${destName}`
  }
  throw new Error('No image output from ComfyUI')
}

export function copyComfyVideoOutput(outputs: Record<string, unknown>, destSubDir: string): string {
  for (const out of Object.values(outputs)) {
    const row = out as { videos?: Array<{ filename: string; subfolder?: string; type?: string }>; images?: Array<{ filename: string; subfolder?: string; type?: string }> }
    const vid = row.videos?.[0]
    if (vid?.filename) {
      const src = resolveComfyOutputPath(vid.filename, vid.subfolder || '', vid.type || 'output')
      if (!fs.existsSync(src)) continue
      const destDir = path.dirname(getAbsolutePath(`static/${destSubDir}/placeholder`))
      fs.mkdirSync(destDir, { recursive: true })
      const ext = path.extname(vid.filename) || '.mp4'
      const destName = `${uuid()}${ext}`
      const destPath = path.join(destDir, destName)
      fs.copyFileSync(src, destPath)
      return `static/${destSubDir}/${destName}`
    }
    const img = row.images?.[0]
    if (img?.filename?.endsWith('.mp4')) {
      const src = resolveComfyOutputPath(img.filename, img.subfolder || '', img.type || 'output')
      const destDir = path.dirname(getAbsolutePath(`static/${destSubDir}/placeholder`))
      fs.mkdirSync(destDir, { recursive: true })
      const destName = `${uuid()}.mp4`
      fs.copyFileSync(src, path.join(destDir, destName))
      return `static/${destSubDir}/${destName}`
    }
  }
  throw new Error('No video output from ComfyUI')
}

export function uploadImageToComfyInput(relativePath: string, alias?: string): string {
  const abs = getAbsolutePath(relativePath)
  if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${relativePath}`)
  fs.mkdirSync(LOCAL_COMIC_ENV.comfyInputDir, { recursive: true })
  const ext = path.extname(abs) || '.png'
  const name = alias || `huobao_${uuid()}${ext}`
  const dest = path.join(LOCAL_COMIC_ENV.comfyInputDir, name)
  fs.copyFileSync(abs, dest)
  return name
}
