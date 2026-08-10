import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { llmGeneratedAt } from '../utils/llm-meta.js'
import {
  artStylePrompt,
  coerceMinimalCharacterAppearance,
  detectNarrationWeightArcTheme,
  coerceMinimalLLMImagePrompt,
  isNarrationMinimalStyle,
  isNarrationAnimeStyle,
  isShortDramaStyle,
  usesPortraitAppearanceSanitize,
  normalizeArtStyle,
  sanitizeCharacterAppearance,
  sanitizeAppearanceForPortrait,
  stripMinimalAppearanceForPortrait,
  stripBodyMeasureSpecsFromAppearance,
  formatNarrationStyleSpecBracket,
  NARRATION_ANIME_SCENE_SUFFIX,
  NARRATION_ANIME_STYLE,
  NARRATION_MINIMAL_STYLE,
  NARRATION_UNIVERSAL_SCENE_SUFFIX,
  appendToNarrationBracket,
  NARRATION_PROTAGONIST_BODY,
  NARRATION_PROTAGONIST_FACE,
  NARRATION_USE_RAW_LLM_PROMPTS,
  usesComicIllustrationPipeline,
} from '../constants/art-styles.js'
import {
  buildMotionComicCharacterAppearanceSystem,
  buildMotionComicCharacterExtractSystem,
  ensureMotionComicPortraitStyleInAppearance,
  isComicExtraCharacter,
  isMajorSupportingCharacter,
  isMotionComicStyle,
  MOTION_COMIC_PORTRAIT_FRAMING,
  MOTION_COMIC_PORTRAIT_PLOT_CN,
  MOTION_COMIC_PORTRAIT_SCENE_CN,
  MOTION_COMIC_PORTRAIT_STYLE_SPEC,
  MOTION_COMIC_SCENE_SUFFIX,
  MOTION_COMIC_STYLE,
} from '../constants/motion-comic.js'
import {
  buildNovelComicSketchCharacterAppearanceSystem,
  buildNovelComicSketchCharacterExtractSystem,
  acceptNovelComicPortraitAppearanceRaw,
  ensureNovelComicSketchPortraitStyleInAppearance,
  isNovelComicSketchStyle,
  NOVEL_COMIC_SKETCH_PORTRAIT_FRAMING_EN,
  NOVEL_COMIC_SKETCH_PORTRAIT_PLOT_CN,
  NOVEL_COMIC_SKETCH_PORTRAIT_SCENE_CN,
  NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_GUARD,
  NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_SPEC,
  NOVEL_COMIC_SKETCH_PORTRAIT_SUFFIX,
} from '../constants/novel-comic.js'
import { LOCAL_COMIC_CHARACTER_APPEARANCE_SYSTEM, LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import {
  buildNarrationAnimeCharacterAppearanceSystem,
  buildNarrationAnimeCharacterExtractSystem,
  buildNarrationMinimalCharacterAppearanceSystem,
  buildNarrationMinimalCharacterExtractSystem,
  THREE_VIEW_PORTRAIT_FRAMING,
  THREE_VIEW_PORTRAIT_FRAMING_MINIMAL,
  THREE_VIEW_PORTRAIT_PLOT_ANIME_CN,
  THREE_VIEW_PORTRAIT_PLOT_MINIMAL_CN,
  THREE_VIEW_PORTRAIT_SCENE_CN,
  THREE_VIEW_PORTRAIT_SCENE_MINIMAL_CN,
  THREE_VIEW_PORTRAIT_SIZE,
  THREE_VIEW_PORTRAIT_STYLE_GUARD_ANIME,
  THREE_VIEW_PORTRAIT_STYLE_GUARD_MINIMAL,
  THREE_VIEW_PORTRAIT_STYLE_GUARD_MOTION_COMIC,
  sanitizePortraitPlotForThreeView,
  sanitizePortraitAppearanceForGeneration,
  isIncompletePortraitEnglishTags,
  PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
  appearanceCollidesWithPeers,
  resolvePortraitSilhouetteSlot,
  PORTRAIT_SILHOUETTE_SLOTS,
  enforceAppearanceGenderCn,
  inferPortraitAgeHint,
  formatPortraitAgeHintForLlm,
} from '../constants/portrait-reference.js'
import { normalizePortraitAppearanceStructured } from '../constants/portrait-appearance-spec.js'
import { DEFAULT_IMAGE_MODEL } from '../constants/image-models.js'
import { assertTextConfigReady, getTextConfig } from './ai.js'
import {
  fallbackEnglishTagsFromAppearance,
  reconcileEnglishTagsWithChineseAppearance,
  resolveIdentityPortraitGender,
  inferPortraitGenderFromScript,
} from './comfyui-client.js'
import { isLocalTextProvider } from './local-model-manager.js'
import { callTextChat } from './text-chat.js'
import { parseNarrationImageMeta } from './narration-image.js'
import { parseDialogueForTTS } from './narration-tts.js'
import { parseMotionComicSpeakerLines } from '../utils/motion-comic-script.js'
import { isLocalComicMode, isMotionComicMode, isNovelComicMode, parseProductionMode, type ProductionMode } from '../constants/production-mode.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

const NARRATION_ONLY_SPEAKERS = new Set(['旁白', '剧中', 'OS', '画外音', '画外'])

export type NarrationCharacterRow = {
  id: number
  name: string
  role?: string | null
  appearance?: string | null
  variantLabel?: string | null
  personality?: string | null
  imageUrl?: string | null
}

export function normalizeVariantLabel(label?: string | null): string {
  const raw = String(label || '').trim()
  if (!raw || raw === '常态' || raw === '默认') return ''
  // 漫画/小说「觉醒前/后通用」等伪阶段：不当作独立定妆形态
  if (/觉醒前\s*\/\s*后\s*通用|觉醒前后通用|^通用$|前\/后通用/.test(raw)) return ''
  return raw
}

/** 从脏 name（如「陆沉舟·主角·觉醒前/后通用」）拆出纯姓名，并把 role/阶段归位 */
export function normalizeExtractedCharacterIdentity(input: {
  name?: string | null
  role?: string | null
  variantLabel?: string | null
  variant_label?: string | null
}): { name: string; role: string; variantLabel: string } {
  let name = String(input.name || '').trim()
  let role = String(input.role || '').trim()
  let variantLabel = normalizeVariantLabel(input.variantLabel ?? input.variant_label)

  const parts = name.split(/[·•･・]/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    name = parts[0]
    for (const part of parts.slice(1)) {
      if (/^(男主|女主|主角|主人公)$/.test(part)) {
        if (!role || role === '角色') role = part
        continue
      }
      if (/配角|反派|宿敌|师父|师尊|恋人|闺蜜|朋友|同学/.test(part)) {
        if (!role || role === '角色' || /^(男主|女主|主角|主人公)$/.test(role)) {
          role = /^主要配角|^重要配角/.test(part) ? part : `主要配角·${part}`
        }
        continue
      }
      if (/觉醒前\s*\/\s*后\s*通用|觉醒前后通用|^通用$|前\/后通用/.test(part)) continue
      if (!variantLabel) variantLabel = normalizeVariantLabel(part)
    }
  }

  // 括号脏后缀：陆沉舟（主角）
  const paren = name.match(/^(.+?)[（(]([^）)]+)[）)]$/)
  if (paren) {
    name = paren[1].trim()
    const inner = paren[2].trim()
    if (/^(男主|女主|主角|主人公)$/.test(inner) && (!role || role === '角色')) role = inner
    else if (/配角|反派/.test(inner) && (!role || /^(男主|女主|主角|主人公|角色)$/.test(role))) {
      role = /^主要配角|^重要配角/.test(inner) ? inner : `主要配角·${inner}`
    } else if (!variantLabel) variantLabel = normalizeVariantLabel(inner)
  }

  role = normalizeExtractedCharacterRole(name, role)
  variantLabel = normalizeVariantLabel(variantLabel)
  return { name, role, variantLabel }
}

/** 同名去重：漫画/小说一人一条；优先保留有外貌描述的 */
export function dedupeExtractedCharactersByName<T extends {
  name: string
  role?: string
  variantLabel?: string
  appearance?: string
  personality?: string
}>(rows: T[], options?: { collapseVariants?: boolean }): T[] {
  const collapse = options?.collapseVariants !== false
  const map = new Map<string, T>()
  for (const row of rows) {
    const name = String(row.name || '').trim()
    if (!name) continue
    const key = collapse
      ? name
      : `${name}::${normalizeVariantLabel(row.variantLabel)}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, collapse ? { ...row, name, variantLabel: '' } : { ...row, name })
      continue
    }
    const prevApp = String(prev.appearance || '').trim()
    const nextApp = String(row.appearance || '').trim()
    const preferNext = nextApp.length > prevApp.length
    const base = preferNext ? row : prev
    const other = preferNext ? prev : row
    map.set(key, {
      ...base,
      name,
      role: String(base.role || '').trim() || String(other.role || '').trim(),
      appearance: String(base.appearance || '').trim() || String(other.appearance || '').trim(),
      personality: String(base.personality || '').trim() || String(other.personality || '').trim(),
      variantLabel: collapse ? '' : (normalizeVariantLabel(base.variantLabel) || normalizeVariantLabel(other.variantLabel)),
    } as T)
  }
  return [...map.values()]
}

/** 提取/落库前规范化 role：解说主人公只保留 男主/女主，禁止职业或跨集情节标签 */
export function normalizeExtractedCharacterRole(name?: string | null, role?: string | null): string {
  const n = String(name || '').trim()
  const raw = String(role || '').trim()
  if (/^旁白$/.test(n)) return '旁白'
  // 漫画/小说彩漫配角标签原样保留（含「主要配角·…」「重要配角」等）
  if (/主要配角|重要配角|核心配角|(^|[·・\-])配角|^配角/.test(raw)) {
    if (/^配角$/.test(raw)) return '主要配角'
    if (/^配角[·・]/.test(raw)) return raw.replace(/^配角/, '主要配角')
    return raw
  }
  if (/反派|宿敌|师父|师尊|师叔|师兄|师姐|师妹|师弟|挚友|恋人|闺蜜|朋友|同学|妻子|丈夫|女友|男友/.test(raw)
    && !/男主|女主|主角|主人公/.test(raw)) {
    return /^主要配角/.test(raw) ? raw : `主要配角·${raw}`
  }
  if (/^女主$|^女主人?$/.test(n) || /^女主$|女性主角|女主角/.test(raw)) return '女主'
  if (/^(男主|主角|我)$/.test(n) || /^(男主|主人公|主角)$/.test(raw)) return '男主'
  if (/女主|女性主角|女主角/.test(raw)) return '女主'
  if (/男主|主人公|主角|叙述者/.test(raw) && !/[、，,/]|个体户|万元户|老板|店员|职员|患者|店主|工人|学徒/.test(raw)) {
    return /女/.test(raw) ? '女主' : '男主'
  }
  if (n === '男主' || n === '主角' || n === '我') return '男主'
  if (n === '女主') return '女主'
  if (!raw || raw === '角色') {
    if (/女/.test(n) || /[姐婶婆妹姨娘奶]|小姐|女士|姑娘|阿姨/.test(n)) return '女主'
    if (/[爷伯叔哥弟汉]|先生|大叔/.test(n)) return '男主'
    // 无名性别线索时勿默认男主（避免女角色被写成男性定妆）
    return '角色'
  }
  // 职业/情节标签（含顿号、斜杠）一律归并为固定身份（解说主人公定妆用；已是配角标签的上面已 return）
  if (/[、，,/]|个体户|万元户|老板|店员|职员|患者|店主|工人|学徒|个体|万元|铺主|装修|赌球|沪漂/.test(raw)) {
    return /女|妻子|老婆|母亲|妈妈|女儿|姐|妹|婶|阿姨/.test(n + raw) ? '女主' : '男主'
  }
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

export function variantNeedsYouthPortraitReference(label?: string | null): boolean {
  const group = getVariantAgeGroup(label)
  return group === 'middle' || group === 'elder'
}

export function variantPortraitSortOrder(label?: string | null): number {
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

export function findYouthBaseCharacter(
  dramaId: number,
  name: string,
  excludeId?: number,
): NarrationCharacterRow | null {
  const siblings = listCharacterSiblings(dramaId, name, excludeId)
  const withImage = (list: NarrationCharacterRow[]) => list.find(ch => ch.imageUrl?.trim()) || null
  const youthHit = withImage(siblings.filter(ch => getVariantAgeGroup(ch.variantLabel) === 'youth'))
  if (youthHit) return youthHit
  return withImage(siblings.filter(ch => getVariantAgeGroup(ch.variantLabel) === 'default'))
}

function listCharacterSiblings(dramaId: number, name: string, excludeId?: number): NarrationCharacterRow[] {
  return db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && ch.name.trim() === name.trim() && ch.id !== excludeId)
    .map(ch => ({
      id: ch.id,
      name: ch.name,
      role: ch.role,
      appearance: ch.appearance,
      variantLabel: ch.variantLabel,
      personality: ch.personality,
      imageUrl: ch.imageUrl,
    }))
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

/** 按目标形态智能选取同角色已有定妆参考（不限于青年） */
export function findPortraitReferenceCharacter(
  dramaId: number,
  name: string,
  excludeId?: number,
  targetLabel?: string | null,
): NarrationCharacterRow | null {
  const siblings = listCharacterSiblings(dramaId, name, excludeId)
  const withImage = (list: NarrationCharacterRow[]) => list.find(ch => ch.imageUrl?.trim()) || null
  const targetGroup = getVariantAgeGroup(targetLabel)

  for (const group of portraitReferencePriority(targetGroup)) {
    const hit = withImage(siblings.filter(ch => getVariantAgeGroup(ch.variantLabel) === group))
    if (hit) return hit
  }
  return withImage(siblings)
}

/** 跨角色画风锚定：取同项目已有定妆（优先青年形态），供新角色对齐线稿/赛璐璐 */
export function findDramaStyleAnchorCharacter(
  dramaId: number,
  excludeId?: number,
): NarrationCharacterRow | null {
  const candidates = db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && ch.id !== excludeId && ch.imageUrl?.trim())
    .map(ch => ({
      id: ch.id,
      name: ch.name,
      role: ch.role,
      appearance: ch.appearance,
      variantLabel: ch.variantLabel,
      personality: ch.personality,
      imageUrl: ch.imageUrl,
    }))
    .sort((a, b) => {
      const byStage = variantPortraitSortOrder(a.variantLabel) - variantPortraitSortOrder(b.variantLabel)
      if (byStage !== 0) return byStage
      return a.id - b.id
    })
  return candidates[0] || null
}

function variantAgeOrder(group: VariantAgeGroup): number {
  const order: Record<VariantAgeGroup, number> = {
    child: 0,
    youth: 1,
    default: 1,
    other: 2,
    middle: 3,
    elder: 4,
  }
  return order[group]
}

function buildPortraitReferenceHint(targetGroup: VariantAgeGroup, refGroup: VariantAgeGroup): string {
  const stickBase = 'plain black filled stick figure body, two small white dot eyes only, black outline, NOT detailed face, NOT realistic portrait'
  if (refGroup === targetGroup) {
    return `same person as reference image, ${stickBase}, match reference art style and line weight, follow appearance description`
  }
  const delta = variantAgeOrder(targetGroup) - variantAgeOrder(refGroup)
  if (delta > 0) {
    if (targetGroup === 'elder') {
      return `same person as reference image, ${stickBase}, naturally aged to elderly, a few simple white hair strokes on both sides of round head, slightly stooped, do NOT add wrinkles nose mouth realistic face, match reference art style`
    }
    if (targetGroup === 'middle') {
      return `same person as reference image, ${stickBase}, slightly wider torso (slightly chubby), match reference art style, follow appearance description over reference age`
    }
    return `same person as reference image, older than reference, ${stickBase}, follow target life stage in appearance description, match reference art style`
  }
  if (delta < 0) {
    return `same person as reference image, younger than reference, ${stickBase}, follow target life stage in appearance description, match reference art style and line weight`
  }
  return `same person as reference image, ${stickBase}, keep identity recognizable, match reference art style, follow appearance description`
}

export function formatCharacterDisplayName(char: { name?: string | null; variantLabel?: string | null; variant_label?: string | null }) {
  const name = String(char.name || '').trim()
  const label = normalizeVariantLabel(char.variantLabel ?? (char as { variant_label?: string }).variant_label)
  return label ? `${name} · ${label}` : name
}

/** 从配图文案解析「对照定妆「name·阶段」」 */
export function extractPortraitLabelFromPrompt(text: string): { name: string; stage: string; label: string } | null {
  const all = extractAllPortraitLabelsFromPrompt(text)
  return all[0] || null
}

/** 解析文案中全部「对照定妆「name·阶段」」标签（双人镜可有多个） */
export function extractAllPortraitLabelsFromPrompt(
  text: string,
): Array<{ name: string; stage: string; label: string }> {
  const out: Array<{ name: string; stage: string; label: string }> = []
  const re = new RegExp('\\u5bf9\\u7167\\u5b9a\\u5986\\u300c([^\\u300d]+)\\u300d', 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(String(text || ''))) !== null) {
    const raw = m[1].trim()
    const parts = raw.split(/[·•]/).map(s => s.trim()).filter(Boolean)
    if (!parts[0]) continue
    out.push({ name: parts[0], stage: parts[1] || '', label: raw })
  }
  return out
}

function extractSubjectBracketForVariant(text: string): string {
  const re = new RegExp('\\u3010\\u753b\\u9762\\u4e3b\\u4f53[\\uff1a:]([^\\u3011]*)')
  return String(text || '').match(re)?.[1]?.trim() || String(text || '')
}

export function resolveCharacterIdForPortraitLabel(
  text: string,
  characters: NarrationCharacterRow[],
): number | null {
  const ref = extractPortraitLabelFromPrompt(text)
  if (!ref) return null
  return resolveCharacterIdForPortraitRef(ref, characters, text)
}

/** 按定妆标签对象解析角色 id（可带上下文文案做变体消歧） */
export function resolveCharacterIdForPortraitRef(
  label: { name: string; stage?: string; label?: string },
  characters: NarrationCharacterRow[],
  contextText?: string,
): number | null {
  const name = String(label?.name || '').trim()
  if (!name) return null
  const stage = String(label?.stage || '').trim()
  const matches = characters.filter(ch => ch.name.trim() === name)
  if (!matches.length) return null
  if (stage) {
    const exact = matches.find(ch => normalizeVariantLabel(ch.variantLabel) === stage)
    if (exact) return exact.id
  }
  if (matches.length === 1) return matches[0].id
  return pickBestVariantForText(
    extractSubjectBracketForVariant(contextText || label?.label || name),
    matches,
  ).id
}

export function resolveCharacterPortraitReferencePath(
  char: { imageUrl?: string | null },
): string | null {
  const url = char.imageUrl?.trim()
  if (!url) return null
  const normalized = url.startsWith('/static/') ? url.slice(1) : url
  return normalized.startsWith('static/') ? normalized : null
}

function scoreVariantForText(text: string, char: NarrationCharacterRow): number {
  const portraitRef = extractPortraitLabelFromPrompt(text)
  const scope = portraitRef
    ? `对照定妆「${portraitRef.name}${portraitRef.stage ? `·${portraitRef.stage}` : ''}」`
    : extractSubjectBracketForVariant(text)
  const label = normalizeVariantLabel(char.variantLabel)
  const app = String(char.appearance || '').trim()
  let score = 0

  if (portraitRef?.stage && label === portraitRef.stage) score += 50
  else if (label && scope.includes(label)) score += 15

  const ageRules: Array<{ keys: string[]; pattern: RegExp }> = [
    { keys: ['童年', '幼年', '孩童'], pattern: /童年|幼年|儿时|小时候|孩童|幼童|几岁/ },
    { keys: ['少年', '青年'], pattern: /少年|青年|年轻|二十岁|18岁|19岁|20岁|二十出头|大学|小伙/ },
    { keys: ['中年'], pattern: /中年|四十|五十|人到中年|40岁|50岁/ },
    { keys: ['老年', '晚年'], pattern: /老年|晚年|白发|鬓白|六十|七十|80岁|垂暮|苍老|老人|年迈/ },
  ]

  for (const rule of ageRules) {
    const labelHit = label ? rule.keys.some(k => label.includes(k)) : false
    const textHit = rule.pattern.test(scope)
    const appHit = rule.keys.some(k => app.includes(k))
    if (labelHit && textHit) score += 12
    if (textHit && appHit) score += 8
  }

  const textAge = scope.match(/(\d{1,2})\s*岁/)?.[1]
  const appAge = app.match(/(\d{1,2})\s*岁/)?.[1]
  if (textAge && appAge && textAge === appAge) score += 20

  if (!label) score += 1
  return score
}

function pickBestVariantForText(text: string, variants: NarrationCharacterRow[]): NarrationCharacterRow {
  let best = variants[0]
  let bestScore = -1
  for (const variant of variants) {
    const score = scoreVariantForText(text, variant)
    if (score > bestScore) {
      bestScore = score
      best = variant
    }
  }
  if (bestScore <= 0) {
    return variants.find(v => !normalizeVariantLabel(v.variantLabel)) || variants[0]
  }
  return best
}

export function isNarratorCharacter(char: { name?: string | null; role?: string | null }) {
  const text = `${char.name || ''} ${char.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

export function isVisualCharacter(char: { name?: string | null; role?: string | null }) {
  return !isNarratorCharacter(char)
}

export function isProtagonistCharacter(char: { name?: string | null; role?: string | null }) {
  const name = String(char.name || '').trim()
  const role = String(char.role || '').trim()
  if (/^(男主|女主|主角|主人公)$/.test(name)) return true
  if (/主角|主人公|男主|女主|第一人称|叙述者/.test(role)) return true
  return false
}

function isFirstPersonNarrative(script: string): boolean {
  return /(?:^|[\s，,。！？；:：])我(?:的|在|把|被|会|要|也|都|还|就|则|便|曾|已|将|想|说|看|走|来|去|得|给|让|用|做|吃|喝|买|卖|开|关|拿|带|找|等|站|坐|躺|睡|醒|爱|恨|觉得|认为|知道|发现|想起|决定|开始|继续|完成|辞|推|摆)/.test(script)
}

/** 解说定妆：保留主人公 + 主要配角（可含同人多阶段）；路人丢弃 */
export function filterNarrationExtractedCharacters<T extends { name: string; role?: string | null }>(
  rows: T[],
  script: string,
): T[] {
  return filterMotionComicExtractedCharacters(rows, script)
}

/** @deprecated 旧「只留主人公」；请用 filterNarrationExtractedCharacters */
export function filterNarrationProtagonistOnly<T extends { name: string; role?: string | null }>(
  rows: T[],
  script: string,
): T[] {
  const protagonistRows = rows.filter(row => isProtagonistCharacter(row))
  if (protagonistRows.length) return protagonistRows

  if (isFirstPersonNarrative(script) && rows.length) {
    const byName = new Map<string, T[]>()
    for (const row of rows) {
      const name = row.name.trim()
      if (!name) continue
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(row)
    }
    let best: T[] = []
    for (const group of byName.values()) {
      if (group.length > best.length) best = group
    }
    if (best.length) return best
  }

  return rows.slice(0, 1)
}

/** 漫画/小说彩漫：LLM 已按「主角+重要配角、勿提路人」输出；只丢龙套，避免 role 未标「主要配角」被滤成 1 人 */
export function filterMotionComicExtractedCharacters<T extends { name: string; role?: string | null }>(
  rows: T[],
  script: string,
): T[] {
  const nonExtras = rows.filter(row => !isComicExtraCharacter(row) && !!String(row.name || '').trim())
  if (nonExtras.length) return nonExtras
  const tagged = rows.filter(row => isProtagonistCharacter(row) || isMajorSupportingCharacter(row))
  if (tagged.length) return tagged
  return filterNarrationProtagonistOnly(rows, script)
}

function archiveNonProtagonistCharacters(dramaId: number, keepNames: Set<string>): number {
  const ts = now()
  let archived = 0
  const all = db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && isVisualCharacter(ch))

  for (const ch of all) {
    const fullName = ch.name.trim()
    if (keepNames.has(fullName)) continue

    const baseName = normalizeExtractedCharacterIdentity({ name: fullName }).name
    // 脏名重复：把外貌/定妆图迁到纯姓名条目后再归档
    if (baseName && keepNames.has(baseName) && baseName !== fullName) {
      const keeper = all.find(row => row.id !== ch.id && !row.deletedAt && row.name.trim() === baseName)
        || db.select().from(schema.characters).all()
          .find(row => row.dramaId === dramaId && !row.deletedAt && row.name.trim() === baseName)
      if (keeper) {
        const migrate: Record<string, any> = { updatedAt: ts }
        if (!String(keeper.appearance || '').trim() && String(ch.appearance || '').trim()) {
          migrate.appearance = ch.appearance
        }
        if (!String(keeper.imageUrl || '').trim() && String(ch.imageUrl || '').trim()) {
          migrate.imageUrl = ch.imageUrl
        }
        if (!String(keeper.personality || '').trim() && String(ch.personality || '').trim()) {
          migrate.personality = ch.personality
        }
        if ((!keeper.role || keeper.role === '角色') && ch.role) migrate.role = ch.role
        if (Object.keys(migrate).length > 1) {
          db.update(schema.characters).set(migrate).where(eq(schema.characters.id, keeper.id)).run()
        }
      }
      db.update(schema.characters).set({ deletedAt: ts, updatedAt: ts }).where(eq(schema.characters.id, ch.id)).run()
      archived++
      continue
    }

    db.update(schema.characters).set({ deletedAt: ts, updatedAt: ts }).where(eq(schema.characters.id, ch.id)).run()
    archived++
  }
  return archived
}

function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const existing = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
    .find(row => row.characterId === characterId)
  if (!existing) {
    db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: now() }).run()
  }
}

/** 小说漫画：新建集时把项目全部角色挂到本集（定妆共享双保险） */
export function linkDramaCastToEpisode(episodeId: number, dramaId: number): number {
  const rows = db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt)
  for (const ch of rows) {
    linkCharacterToEpisode(episodeId, ch.id)
  }
  return rows.length
}

export function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  for (const characterId of uniqueIds) {
    db.insert(schema.storyboardCharacters).values({ storyboardId, characterId }).run()
  }
}

function unlinkCharacterFromEpisode(episodeId: number, characterId: number) {
  db.delete(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
    .run()
}

/** 从本集分镜 dialogue 收集说话人（动态漫音色分配依据） */
export function collectEpisodeStoryboardSpeakers(episodeId: number): Set<string> {
  const speakers = new Set<string>()
  for (const sb of db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()) {
    if (sb.deletedAt) continue
    const parsed = parseDialogueForTTS(sb.dialogue)
    if (parsed.ignorable || !parsed.speaker) continue
    speakers.add(parsed.speaker === '剧中' ? '旁白' : parsed.speaker)
  }
  return speakers
}

function getEpisodeLinkedCharacterRows(episodeId: number, dramaId: number) {
  const links = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
  const linkedIds = new Set(links.map(link => link.characterId))
  return db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && linkedIds.has(ch.id))
}

export function ensureDramaNarratorCharacter(dramaId: number, episodeId?: number) {
  const existing = db.select().from(schema.characters).all()
    .find(c => c.dramaId === dramaId && !c.deletedAt && (c.name === '旁白' || c.role === '旁白'))
  if (existing) {
    if (episodeId) linkCharacterToEpisode(episodeId, existing.id)
    return existing
  }

  const needsNarrator = episodeId
    ? collectEpisodeStoryboardSpeakers(episodeId).has('旁白')
    : false
  if (!needsNarrator) return null

  const ts = now()
  const res = db.insert(schema.characters).values({
    dramaId,
    name: '旁白',
    role: '旁白',
    description: '过渡叙述与片头叠字',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const id = Number(res.lastInsertRowid)
  if (episodeId) linkCharacterToEpisode(episodeId, id)
  return db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()[0] || null
}

/** 动态漫：按当前分镜说话人同步本集角色关联（创建缺失角色、解除过期关联） */
export function syncMotionComicCharactersFromSpeakers(episodeId: number, dramaId: number) {
  const speakers = collectEpisodeStoryboardSpeakers(episodeId)
  if (!speakers.size) {
    return {
      created: 0,
      linked: 0,
      unlinked: 0,
      speakers: [] as string[],
      characters: getEpisodeVisualCharacters(episodeId, dramaId),
    }
  }

  const ts = now()
  let created = 0
  let linked = 0
  let unlinked = 0

  if (speakers.has('旁白')) {
    ensureDramaNarratorCharacter(dramaId, episodeId)
  }

  const dramaChars = db.select().from(schema.characters).all()
    .filter(c => c.dramaId === dramaId && !c.deletedAt)

  for (const speaker of speakers) {
    if (speaker === '旁白') continue
    let ch = dramaChars.find(c => c.name.trim() === speaker)
    if (!ch) {
      const res = db.insert(schema.characters).values({
        dramaId,
        name: speaker,
        role: '角色',
        createdAt: ts,
        updatedAt: ts,
      }).run()
      ch = db.select().from(schema.characters).where(eq(schema.characters.id, Number(res.lastInsertRowid))).all()[0]
      if (ch) dramaChars.push(ch)
      created++
    }
    if (!ch) continue
    const hadLink = db.select().from(schema.episodeCharacters)
      .where(and(
        eq(schema.episodeCharacters.episodeId, episodeId),
        eq(schema.episodeCharacters.characterId, ch.id),
      ))
      .all().length > 0
    linkCharacterToEpisode(episodeId, ch.id)
    if (!hadLink) linked++
  }

  for (const ch of getEpisodeLinkedCharacterRows(episodeId, dramaId)) {
    const name = ch.name.trim()
    const keep = isNarratorCharacter(ch) ? speakers.has('旁白') : speakers.has(name)
    if (!keep) {
      unlinkCharacterFromEpisode(episodeId, ch.id)
      unlinked++
    }
  }

  return {
    created,
    linked,
    unlinked,
    speakers: [...speakers],
    characters: getEpisodeVisualCharacters(episodeId, dramaId),
  }
}

export function getEpisodeVisualCharacters(episodeId: number, dramaId: number): NarrationCharacterRow[] {
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
  const novelComic = isNovelComicMode(parseProductionMode(drama?.metadata))

  // 小说漫画：定妆/角色按项目全集共享，不按 episode_characters 过滤
  if (novelComic) {
    return db.select().from(schema.characters).all()
      .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && isVisualCharacter(ch))
      .map(ch => ({
        id: ch.id,
        name: ch.name,
        role: ch.role,
        appearance: ch.appearance,
        variantLabel: ch.variantLabel,
        personality: ch.personality,
        imageUrl: ch.imageUrl,
      }))
  }

  const links = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
  const linkedIds = new Set(links.map(link => link.characterId))
  return db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && linkedIds.has(ch.id) && isVisualCharacter(ch))
    .map(ch => ({
      id: ch.id,
      name: ch.name,
      role: ch.role,
      appearance: ch.appearance,
      variantLabel: ch.variantLabel,
      personality: ch.personality,
      imageUrl: ch.imageUrl,
    }))
}

export function detectCharacterIdsInText(text: string, characters: NarrationCharacterRow[]): number[] {
  const normalized = String(text || '').trim()
  if (!normalized || !characters.length) return []

  const found = new Set<number>()

  // 文案「对照定妆「姓名」」优先（含单字名「我」）
  for (const id of detectCharacterIdsFromPortraitLabels(normalized, characters)) {
    found.add(id)
  }

  const mentionedNames: string[] = []
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length)
  for (const char of sorted) {
    const name = char.name.trim()
    // 「我」等单字主角名也要识别；其余仍要求 ≥2 字以免误伤
    if (!name || (name.length < 2 && name !== '我')) continue
    if (normalized.includes(name) && !mentionedNames.includes(name)) mentionedNames.push(name)
  }

  for (const name of mentionedNames) {
    const variants = characters.filter(ch => ch.name.trim() === name)
    if (!variants.length) continue
    if (variants.length === 1) {
      found.add(variants[0].id)
      continue
    }
    const portraitId = resolveCharacterIdForPortraitLabel(normalized, variants)
    if (portraitId) {
      found.add(portraitId)
      continue
    }
    found.add(pickBestVariantForText(extractSubjectBracketForVariant(normalized), variants).id)
  }

  for (const id of detectCharacterIdsFromAppearanceHints(normalized, characters)) {
    found.add(id)
  }
  for (const id of detectFirstPersonProtagonistIds(normalized, characters)) {
    found.add(id)
  }

  return [...found]
}

/** 按文案出现的对照定妆标签顺序解析角色 ID（多人同框锁脸用） */
export function detectCharacterIdsFromPortraitLabels(
  text: string,
  characters: NarrationCharacterRow[],
): number[] {
  const labels = extractAllPortraitLabelsFromPrompt(text)
  if (!labels.length || !characters.length) return []
  const ids: number[] = []
  const seen = new Set<number>()
  for (const label of labels) {
    let id = resolveCharacterIdForPortraitRef(label, characters, text)
    if (!id && label.name === '我') {
      const namedMe = characters.filter(c => c.name.trim() === '我')
      const withPortrait = namedMe.find(c => !!String(c.imageUrl || '').trim())
      if (withPortrait) id = withPortrait.id
      else if (namedMe.length === 1) id = namedMe[0].id
      else {
        const protag = characters.find(c => isProtagonistCharacter(c) && !!String(c.imageUrl || '').trim())
          || characters.find(c => isProtagonistCharacter(c))
        if (protag) id = protag.id
      }
    }
    if (id != null && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

function extractAppearanceMatchTags(appearance: string): string[] {
  const app = String(appearance || '').trim()
  if (!app) return []
  const englishTags = app.match(/english tags:\s*(.+)/i)?.[1]
  const raw = englishTags || app
  return raw.split(/[,，;；]/).map(t => t.trim().toLowerCase()).filter(t => t.length >= 5)
}

function detectCharacterIdsFromAppearanceHints(text: string, characters: NarrationCharacterRow[]): number[] {
  const normalized = String(text || '').toLowerCase()
  if (!normalized) return []

  const byName = new Map<string, NarrationCharacterRow[]>()
  for (const ch of characters) {
    const name = ch.name.trim()
    if (!name) continue
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name)!.push(ch)
  }

  const found: number[] = []
  for (const [, variants] of byName) {
    let bestVariant: NarrationCharacterRow | null = null
    let bestScore = 0
    for (const variant of variants) {
      const app = String(variant.appearance || '').toLowerCase()
      if (!app) continue
      let score = 0
      for (const tag of extractAppearanceMatchTags(app)) {
        if (normalized.includes(tag)) score += tag.length >= 10 ? 4 : 2
      }
      const textAge = normalized.match(/(\d{1,2})[- ]?year[- ]?old/)?.[1]
      const appAge = app.match(/(\d{1,2})[- ]?year[- ]?old/)?.[1] || app.match(/(\d{1,2})\s*岁/)?.[1]
      if (textAge && appAge && textAge === appAge) score += 12
      if (score > bestScore) {
        bestScore = score
        bestVariant = variant
      }
    }
    if (bestVariant && bestScore >= 4) found.push(bestVariant.id)
  }
  return found
}

function detectFirstPersonProtagonistIds(text: string, characters: NarrationCharacterRow[]): number[] {
  const raw = String(text || '')
  const hasFirstPerson = /(?:^|[\s，,。！？；:：「])我(?:的|在|把|被|会|要|也|都|还|就|则|便|曾|已|将|想|说|看|走|来|去|得|给|让|用|做|吃|喝|买|卖|开|关|拿|带|找|等|站|坐|躺|睡|醒|爱|恨|觉得|认为|知道|发现|想起|决定|开始|继续|完成|辞|推|摆|」)/.test(raw)
    || /对照定妆「我」/.test(raw)
  if (!hasFirstPerson) return []

  // 优先具名「我」且有定妆图
  const namedMe = characters.filter(ch => ch.name.trim() === '我')
  const meWithPortrait = namedMe.find(ch => !!String(ch.imageUrl || '').trim())
  if (meWithPortrait) return [meWithPortrait.id]
  if (namedMe.length === 1) return [namedMe[0].id]

  const protagonistNames = new Set(
    characters
      .filter(ch => ch.name === '主角' || /主角|主人公|个体户|男主|女主/.test(String(ch.role || '')))
      .map(ch => ch.name.trim())
      .filter(Boolean),
  )
  if (!protagonistNames.size) return []

  const found: number[] = []
  for (const name of protagonistNames) {
    const variants = characters.filter(ch => ch.name.trim() === name)
    if (!variants.length) continue
    found.push(variants.length === 1 ? variants[0].id : pickBestVariantForText(text, variants).id)
  }
  return found
}

export function buildStoryboardCharacterContextText(sb: {
  dialogue?: string | null
  description?: string | null
  title?: string | null
  imagePrompt?: string | null
  action?: string | null
  atmosphere?: string | null
  location?: string | null
  referenceImages?: string | null
}) {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const parts = [
    meta.scene_content,
    meta.title_hook,
    meta.title_full,
    sb.dialogue,
    sb.description,
    sb.title,
    sb.imagePrompt,
    sb.action,
    sb.atmosphere,
    sb.location,
  ]
  return parts.map(v => String(v || '').trim()).filter(Boolean).join('\n')
}

/** 从分镜对白解析说话人并映射到角色 ID（动态漫一句一镜换说话人时用） */
export function resolveSpeakerCharacterId(
  dialogue: string | null | undefined,
  characters: NarrationCharacterRow[],
): number | null {
  const parsed = parseDialogueForTTS(String(dialogue || ''))
  if (parsed.ignorable || !parsed.speaker) return null
  const speakerName = parsed.speaker === '剧中' ? '旁白' : parsed.speaker.trim()
  if (NARRATION_ONLY_SPEAKERS.has(speakerName)) return null

  const variants = characters.filter(c => c.name.trim() === speakerName)
  if (variants.length === 1) return variants[0].id
  if (variants.length > 1) return pickBestVariantForText(String(dialogue || ''), variants).id

  if (speakerName === '我') {
    const protagonistIds = detectFirstPersonProtagonistIds(String(dialogue || ''), characters)
    if (protagonistIds.length) return protagonistIds[0]
    const protag = characters.find(c => isProtagonistCharacter(c))
    if (protag) return protag.id
  }
  return null
}

export function detectStoryboardCharacterIds(
  text: string,
  characters: NarrationCharacterRow[],
  options?: { dialogue?: string | null; speakerPriority?: boolean },
): number[] {
  // 配图文案已写对照定妆：以标签人数为准（可多人），勿被「说话人优先」压成单人
  const portraitIds = detectCharacterIdsFromPortraitLabels(text, characters)
  if (portraitIds.length) {
    const ids = new Set(portraitIds)
    const speakerId = resolveSpeakerCharacterId(options?.dialogue, characters)
    if (speakerId) ids.add(speakerId)
    return [...ids]
  }

  const speakerId = resolveSpeakerCharacterId(options?.dialogue, characters)
  if (speakerId && options?.speakerPriority) return [speakerId]

  const ids = new Set(detectCharacterIdsInText(text, characters))
  if (speakerId) ids.add(speakerId)
  return [...ids]
}

export function resolveStoryboardCharacterIdsForShot(
  storyboardId: number,
  options?: { sync?: boolean },
) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  if (!ep) throw new Error('剧集不存在')

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const motionComicMode = isMotionComicMode(parseProductionMode(drama?.metadata))
  const characters = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
  const text = buildStoryboardCharacterContextText(sb)
  const ids = detectStoryboardCharacterIds(text, characters, {
    dialogue: sb.dialogue,
    speakerPriority: motionComicMode,
  })
  if (options?.sync !== false) syncStoryboardCharacters(storyboardId, ids)

  return {
    storyboardId,
    episodeId: sb.episodeId,
    dramaId: ep.dramaId,
    characterIds: ids,
    characters: characters.filter(ch => ids.includes(ch.id)),
    contextText: text,
  }
}

export function linkStoryboardCharactersFromText(
  storyboardId: number,
  text: string,
  characters: NarrationCharacterRow[],
  options?: { dialogue?: string | null; speakerPriority?: boolean },
) {
  const ids = detectStoryboardCharacterIds(text, characters, options)
  syncStoryboardCharacters(storyboardId, ids)
  return ids
}

export function linkAllNarrationStoryboardCharacters(episodeId: number, dramaId: number) {
  const characters = getEpisodeVisualCharacters(episodeId, dramaId)
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
  const motionComicMode = isMotionComicMode(parseProductionMode(drama?.metadata))
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .filter(sb => !sb.deletedAt)

  let linked = 0
  for (const sb of storyboards) {
    const text = buildStoryboardCharacterContextText(sb)
    const ids = detectStoryboardCharacterIds(text, characters, {
      dialogue: sb.dialogue,
      speakerPriority: motionComicMode,
    })
    syncStoryboardCharacters(sb.id, ids)
    if (ids.length) linked++
  }
  return { storyboardCount: storyboards.length, linkedStoryboardCount: linked, characterCount: characters.length }
}

function stripLlmNoiseForJson(text: string): string {
  const raw = String(text || '')
  const closeTag = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62)
  const closeIdx = raw.toLowerCase().lastIndexOf(closeTag)
  const withoutThink = closeIdx >= 0 ? raw.slice(closeIdx + closeTag.length) : raw
  return withoutThink.trim()
}

function extractJsonPayload(text: string): unknown | null {
  const cleaned = stripLlmNoiseForJson(text)
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || cleaned).trim()
  const tries: Array<[number, number]> = []
  const objStart = candidate.indexOf('{')
  const objEnd = candidate.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) tries.push([objStart, objEnd + 1])
  const arrStart = candidate.indexOf('[')
  const arrEnd = candidate.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) tries.push([arrStart, arrEnd + 1])
  for (const [start, end] of tries) {
    try {
      return JSON.parse(candidate.slice(start, end))
    } catch {
      // 尝试下一种包裹格式
    }
  }
  return null
}

/**
 * 免费模型常截断 JSON：从半截 {"characters":[{...},{... 中捞出已完整的角色对象。
 */
function salvageCharacterRowsFromTruncatedJson(text: string): unknown[] | null {
  const cleaned = stripLlmNoiseForJson(text)
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || cleaned).trim()
  if (!candidate) return null

  const arrayMatch = candidate.match(/"characters"\s*:\s*\[([\s\S]*)/i)
  const body = arrayMatch?.[1] ?? (candidate.includes('"name"') ? candidate : '')
  if (!body) return null

  const objects: unknown[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      if (depth <= 0) continue
      depth--
      if (depth === 0 && start >= 0) {
        const slice = body.slice(start, i + 1)
        try {
          const obj = JSON.parse(slice) as Record<string, unknown>
          if (obj && typeof obj === 'object' && String(obj.name || '').trim()) {
            objects.push(obj)
          }
        } catch {
          // 半截对象，跳过
        }
        start = -1
      }
    }
  }
  return objects.length ? objects : null
}

function normalizeExtractedCharacterRows(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { characters?: unknown }).characters)) {
    return (parsed as { characters: unknown[] }).characters
  }
  return null
}

function parseExtractedCharacterRowsFromLlm(text: string): unknown[] | null {
  const rows = normalizeExtractedCharacterRows(extractJsonPayload(text))
  if (rows?.length) return rows
  const salvaged = salvageCharacterRowsFromTruncatedJson(text)
  if (salvaged?.length) {
    logTaskWarn('NarrationChars', 'extract-json-salvaged', { count: salvaged.length })
    return salvaged
  }
  return null
}

/** LLM 失败时：从「说话人：台词」行捞主要角色名，避免定妆只剩 1 人 */
function extractCharactersFromSpeakerLines(script: string): Array<{
  name: string
  variantLabel: string
  role: string
  appearance: string
  personality: string
}> {
  const counts = new Map<string, number>()
  for (const line of parseMotionComicSpeakerLines(script)) {
    const name = String(line.speaker || '').trim()
    if (!name || NARRATION_ONLY_SPEAKERS.has(name) || isNarratorCharacter({ name })) continue
    if (name.length > 12) continue
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .map(([name]) => name)
    .slice(0, 8)
  if (!ranked.length) return []
  return ranked.map((name, index) => ({
    name,
    variantLabel: '',
    role: index === 0 ? '男主' : `主要配角·${name}`,
    appearance: '',
    personality: '',
  }))
}

async function callNarrationCharacterExtractLlm(
  system: string,
  user: string,
  textModel?: string | null,
  textThinking = true,
): Promise<string> {
  const attempts: Array<{ thinking: boolean; label: string }> = [
    { thinking: false, label: 'json-no-thinking' },
  ]
  if (textThinking) attempts.push({ thinking: true, label: 'json-with-thinking' })

  let lastRaw = ''
  for (const attempt of attempts) {
    // 禁止 json_object：部分 OpenRouter 免费模型（如 ling-3.0-flash）会 INVALID_REQUEST_BODY
    // maxTokens 给足，降低 characters 数组被截断概率
    const raw = await callTextChat(system, user, textModel, attempt.thinking, 300_000, false, 4096)
    lastRaw = raw
    const rows = parseExtractedCharacterRowsFromLlm(raw)
    if (rows?.length) {
      if (attempt.thinking) {
        logTaskWarn('NarrationChars', 'extract-fallback-thinking', { model: textModel })
      }
      return raw
    }
    logTaskWarn('NarrationChars', 'extract-attempt-invalid-json', {
      model: textModel,
      attempt: attempt.label,
      preview: raw.slice(0, 240),
    })
  }
  return lastRaw
}

export { callTextChat } from './text-chat.js'

function resolvePortraitFraming(style: string, _appearance: string): string {
  if (isNarrationMinimalStyle(style)) {
    return THREE_VIEW_PORTRAIT_FRAMING_MINIMAL
  }
  if (isNovelComicSketchStyle(style)) {
    return NOVEL_COMIC_SKETCH_PORTRAIT_FRAMING_EN
  }
  if (isMotionComicStyle(style)) {
    return MOTION_COMIC_PORTRAIT_FRAMING
  }
  if (isNarrationAnimeStyle(style)) {
    return THREE_VIEW_PORTRAIT_FRAMING
  }
  return [
    'single front full-body character portrait for animation production',
    'isolated single character on plain white studio background',
    'full-body front view standing, outfit visible, one person only',
    'NOT movie poster, NOT scenic background, NOT environmental illustration',
    'NOT character sheet, NOT turnaround, NOT multiple views, NOT pixel art, NOT retro photo filter',
  ].join(', ')
}

const PORTRAIT_STYLE_GUARD = [
  'CRITICAL ART STYLE: modern Chinese short-drama 2D anime, thin clean line art, flat soft cel shading',
  'CRITICAL LAYOUT: single front full-body character reference facing camera on pure white background, 16:9 widescreen, clear detailed face, head to feet visible',
  'FORBIDDEN: pixel art, dithering, 8-bit, retro game, vintage photo filter, nostalgic poster, film grain, CRT noise, cross-hatching, turnaround sheet, multiple views, close-up headshot only, gray background',
].join(', ')

const MOTION_COMIC_PORTRAIT_STYLE_GUARD = THREE_VIEW_PORTRAIT_STYLE_GUARD_MOTION_COMIC

function resolvePortraitStyleGuard(style: string): string {
  const key = normalizeArtStyle(style)
  if (isNovelComicSketchStyle(key)) return NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_GUARD
  if (isMotionComicStyle(key)) return MOTION_COMIC_PORTRAIT_STYLE_GUARD
  if (isNarrationAnimeStyle(key)) return THREE_VIEW_PORTRAIT_STYLE_GUARD_ANIME
  if (isNarrationMinimalStyle(key)) return THREE_VIEW_PORTRAIT_STYLE_GUARD_MINIMAL
  if (key === 'short-drama') return PORTRAIT_STYLE_GUARD
  return ''
}

export function resolvePortraitImageSize(style: string): string | undefined {
  if (
    usesComicIllustrationPipeline(style) ||
    isNarrationAnimeStyle(style) ||
    isNarrationMinimalStyle(style) ||
    isShortDramaStyle(style)
  ) {
    return THREE_VIEW_PORTRAIT_SIZE
  }
  return undefined
}

function extractEnglishAppearanceTags(appearance: string): { body: string; tags: string } {
  const match = appearance.match(/\bEnglish tags:\s*(.+)$/im)
  if (!match) return { body: appearance.trim(), tags: '' }
  return {
    body: appearance.replace(/\s*\bEnglish tags:\s*.+$/im, '').trim(),
    tags: parseEnglishTagsFromLlmRaw(match[1].trim()),
  }
}

export function hasEnglishAppearanceTags(appearance?: string | null): boolean {
  return /\bEnglish tags:\s*\S/i.test(String(appearance || ''))
}

function extractPortraitFeatureTokens(refAppearance: string): string[] {
  const text = String(refAppearance || '')
  const tokens: string[] = []
  const noGlasses = /无眼镜|不戴眼镜|没有眼镜|未戴眼镜/i.test(text)
  if (!noGlasses && /眼镜|圆框眼镜|方框眼镜/.test(text)) tokens.push('round rim glasses')
  if (/黑发|黑色短发|黑色略?凌乱短发|messy black short hair/i.test(text)) tokens.push('messy black short hair')
  if (/连帽卫衣|grey hoodie|gray hoodie|浅灰.*卫衣/i.test(text)) tokens.push('grey hoodie')
  const tagsLine = text.match(/\bEnglish tags:\s*(.+)$/im)?.[1] || ''
  for (const part of tagsLine.split(',').map(s => s.trim()).filter(Boolean)) {
    if (/glass|hair|hoodie|eyes/i.test(part)) {
      if (noGlasses && /\bglasses\b/i.test(part) && !/\bno glasses\b/i.test(part)) continue
      tokens.push(part)
    }
  }
  return Array.from(new Set(tokens))
}

/** 中年/老年外貌：保留青年定妆的识别特征（眼镜、发型等），但不写跨阶段对照以免 SDXL 出双人 */
export function enforceSiblingAppearanceContinuity(
  appearance: string,
  youthReference?: { appearance: string; displayName?: string | null } | null,
  variantLabel?: string | null,
): string {
  if (!youthReference?.appearance?.trim()) return appearance
  const group = getVariantAgeGroup(variantLabel)
  if (group !== 'middle' && group !== 'elder') return appearance

  const { body, tags } = extractEnglishAppearanceTags(appearance)
  let cnBody = sanitizePortraitAppearanceForGeneration(body.trim())
  const youthText = youthReference.appearance

  if (/(?:^|[^无不没未])眼镜|圆框眼镜/.test(youthText) && !/(?:^|[^无不没未])眼镜|圆框眼镜|无眼镜/.test(cnBody)) {
    if (!/无眼镜|不戴眼镜/.test(youthText)) {
      cnBody = `${cnBody}，保留圆框眼镜`
    }
  }
  if (!/正面半身|双手自然|头到胸口/.test(cnBody)) {
    cnBody = `${cnBody}，正面半身标准站姿，头到胸口完整入镜，双手自然下垂`
  }

  const requiredTags = extractPortraitFeatureTokens(youthText)
  const tagList = tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : []
  for (const req of requiredTags) {
    const key = req.toLowerCase().slice(0, 10)
    if (!tagList.some(t => t.toLowerCase().includes(key))) tagList.push(req)
  }
  if (group === 'middle' && !tagList.some(t => /middle-aged/i.test(t))) {
    tagList.push('middle-aged man')
  }
  if (group === 'elder' && !tagList.some(t => /elderly|old man/i.test(t))) {
    tagList.push('elderly man')
  }
  if (!tagList.some(t => /^1man$|^1boy$|^1girl$|^solo/i.test(t))) {
    tagList.unshift(group === 'middle' || group === 'elder' ? '1man' : '1boy')
  }

  const merged = sanitizePortraitAppearanceForGeneration(
    [cnBody, tagList.length ? `English tags: ${tagList.join(', ')}` : ''].filter(Boolean).join('\n'),
  )
  return sanitizeCharacterAppearance(merged).slice(0, 800)
}

export async function generateEnglishAppearanceTags(
  appearanceBody: string,
  context?: { name?: string | null; role?: string | null; textModel?: string | null },
): Promise<string> {
  const system = [
    '你是定妆中英对照翻译助手。根据中文外貌描述，输出与中文一一对应的 English tags。',
    '规则：',
    '1) 中文每一段可视特征都须在英文中有对应短语，不得遗漏：年龄性别、脸型下颌、眉形、眼型、发型发色刘海、头身比肩宽四肢、#hex服装、非手持配饰、正面半身站姿（头到胸口、空手）；背景按中文：深色定妆写 deep navy dark background，白底定妆才写 pure white background；',
    '2) 忠实直译，禁止用 young woman / mature expression 等笼统词替代具体描述；28岁及以上女性须写 1woman/mature woman/具体年龄，禁止 1girl/young girl/loli；保留 #hex 色值；中文写「无眼镜」时英文须写 no glasses，禁止 glasses；',
    '3) 禁止 retro style, vintage look, pixel, webtoon, chibi, anime style 等画风词；',
    '4) 只输出一行纯文本：English tags: …（逗号分隔，12–20 项）。禁止 JSON、禁止 markdown、禁止代码块。',
    '示例：',
    '中文：28岁男性，俊朗棱角动漫脸型，剑眉，细长眼带瞳孔高光，黑色略凌乱碎发刘海微遮额，正常头身比肩宽适中四肢修长匀称，穿#2563eb蓝色工厂工装，左耳简约耳钉，正面半身标准站姿，头到胸口完整入镜，双手自然垂于身侧',
    'English tags: 28-year-old male, handsome sharp jawline anime face, thick straight eyebrows, narrow expressive eyes with catchlights, messy black short hair with bangs, normal anime body proportions balanced shoulders slim athletic build, #2563eb blue factory uniform, small ear stud on left ear, front chest-up upper-body pose, head to chest in frame, arms at sides, empty hands no props, deep navy dark background',
  ].join('\n')
  const user = [
    context?.name ? `角色：${context.name}` : '',
    context?.role ? `定位：${context.role}` : '',
    `外貌描述：\n${appearanceBody}`,
  ].filter(Boolean).join('\n\n')
  try {
    // 禁止 jsonObject：否则模型吐 {"english_tags":"..."}，解析会留下 JSON 碎屑
    const raw = (await callTextChat(system, user, context?.textModel || undefined, false, 180_000, false)).trim()
    const tags = sanitizeCharacterAppearance(parseEnglishTagsFromLlmRaw(raw))
    if (tags) return tags
  } catch (err: any) {
    logTaskWarn('CharacterAppearance', 'english-tags-fallback', {
      model: context?.textModel,
      error: err?.message || String(err),
    })
  }
  return sanitizeCharacterAppearance(fallbackEnglishTagsFromAppearance(appearanceBody, context?.name))
}

/** 从 LLM 原文解析 English tags（兼容误开 JSON 模式的残留） */
function parseEnglishTagsFromLlmRaw(raw: string): string {
  let text = String(raw || '').trim()
  if (!text) return ''
  text = text.replace(/^```(?:json|text)?\s*|\s*```$/gim, '').trim()
  // {"english_tags":"..."} / {"English tags":"..."} / {"tags":"..."}
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>
      const hit = obj.english_tags ?? obj.englishTags ?? obj['English tags'] ?? obj.tags ?? obj.appearance_tags
      if (typeof hit === 'string' && hit.trim()) text = hit.trim()
      else if (Array.isArray(hit)) text = hit.map(String).join(', ')
    } catch {
      const m = text.match(/"(?:english_tags|English tags|tags)"\s*:\s*"((?:\\.|[^"\\])*)"/i)
      if (m?.[1]) text = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim()
    }
  }
  const line = text.match(/English tags:\s*(.+)/i)?.[1] || text
  return line
    .replace(/^English tags:\s*/i, '')
    .replace(/^["'`{]+|["'`},]+$/g, '')
    .trim()
}

function finalizePortraitAppearanceOutput(text: string, options?: { maxLen?: number }): string {
  const cleaned = sanitizePortraitAppearanceForGeneration(sanitizeCharacterAppearance(text))
  const maxLen = options?.maxLen ?? 1200
  if (cleaned.length <= maxLen) return cleaned
  // 优先保中文主体 + 完整 English tags，避免从中间截断 tags
  const tagMatch = cleaned.match(/\nEnglish tags:\s*([\s\S]+)$/i)
  if (!tagMatch || tagMatch.index == null) return cleaned.slice(0, maxLen)
  const body = cleaned.slice(0, tagMatch.index).trim()
  const tags = tagMatch[1].trim()
  const tagBlock = `\nEnglish tags: ${tags}`
  if (tagBlock.length >= maxLen - 80) {
    return `${body.slice(0, 80)}${tagBlock}`.slice(0, maxLen)
  }
  const bodyBudget = Math.max(120, maxLen - tagBlock.length)
  return `${body.slice(0, bodyBudget).replace(/[，,\s]+$/u, '')}${tagBlock}`
}

/** 清洗 + 补全 English tags；缺项时默认可用 LLM，生图路径请传 allowLlmEnrichment:false 避免抢占 Comfy 显存 */
export async function finalizeCharacterAppearance(
  appearance: string,
  context?: {
    name?: string | null
    role?: string | null
    textModel?: string | null
    minimal?: boolean
    variantLabel?: string | null
    skipEnglishTags?: boolean
    /** 默认 true；定妆「重新生成配图」应为 false（只用规则补全，不调 Ollama） */
    allowLlmEnrichment?: boolean
    /** 漫画解说：入库时强制深色画风规格、去掉白棚残留 */
    motionComic?: boolean
    /** 小说漫画彩漫四格：入库时强制彩漫画风规格 */
    novelComicSketch?: boolean
  },
): Promise<string> {
  if (context?.minimal) {
    return coerceMinimalCharacterAppearance(context.variantLabel, appearance)
  }
  let text = sanitizeCharacterAppearance(appearance)
  if (!text) return ''
  if (context?.novelComicSketch) {
    text = ensureNovelComicSketchPortraitStyleInAppearance(text)
  } else if (context?.motionComic) {
    const { ensureMotionComicPortraitStyleInAppearance } = await import('../constants/motion-comic.js')
    text = ensureMotionComicPortraitStyleInAppearance(text)
  }
  if (context?.skipEnglishTags) {
    return text.replace(/\s*\bEnglish tags:\s*.+$/im, '').trim().slice(0, 1200)
  }
  const allowLlm = context?.allowLlmEnrichment !== false
  const outMax = context?.novelComicSketch || context?.motionComic ? 1400 : 1200

  const resolveTags = async (body: string, existingTags?: string): Promise<string> => {
    const cleanedExisting = existingTags
      ? sanitizeCharacterAppearance(parseEnglishTagsFromLlmRaw(existingTags))
      : ''
    if (cleanedExisting && !isIncompletePortraitEnglishTags(body, cleanedExisting)) {
      return reconcileEnglishTagsWithChineseAppearance(body, cleanedExisting, context)
    }
    if (allowLlm) {
      const regenerated = await generateEnglishAppearanceTags(body, context)
      if (regenerated) return reconcileEnglishTagsWithChineseAppearance(body, regenerated, context)
    }
    const fallback = sanitizeCharacterAppearance(
      fallbackEnglishTagsFromAppearance(body, context?.name, context?.role),
    )
    if (cleanedExisting && cleanedExisting.length >= fallback.length) {
      return reconcileEnglishTagsWithChineseAppearance(body, cleanedExisting, context)
    }
    return reconcileEnglishTagsWithChineseAppearance(body, fallback || cleanedExisting, context)
  }

  if (hasEnglishAppearanceTags(text)) {
    const { body, tags } = extractEnglishAppearanceTags(text)
    const cleanedBody = sanitizeCharacterAppearance(body)
    const cleanedTags = await resolveTags(cleanedBody, tags)
    const merged = [cleanedBody, cleanedTags ? `English tags: ${cleanedTags}` : ''].filter(Boolean).join('\n')
    const normalized = normalizePortraitAppearanceStructured(merged, {
      name: context?.name,
      role: context?.role,
      variantLabel: context?.variantLabel,
      minimal: context?.minimal,
    })
    let out = finalizePortraitAppearanceOutput(normalized, { maxLen: outMax })
    if (context?.novelComicSketch) out = ensureNovelComicSketchPortraitStyleInAppearance(out)
    else if (context?.motionComic) {
      const { ensureMotionComicPortraitStyleInAppearance } = await import('../constants/motion-comic.js')
      out = ensureMotionComicPortraitStyleInAppearance(out)
    }
    return out
  }

  const { body } = extractEnglishAppearanceTags(text)
  const sourceBody = (body || text).trim()
  const fallbackTags = sanitizeCharacterAppearance(
    fallbackEnglishTagsFromAppearance(sourceBody, context?.name, context?.role),
  )
  if (fallbackTags.split(',').filter(Boolean).length >= 4 && !isIncompletePortraitEnglishTags(sourceBody, fallbackTags)) {
    const merged = `${sourceBody}\nEnglish tags: ${fallbackTags}`
    let out = finalizePortraitAppearanceOutput(merged, { maxLen: outMax })
    if (context?.novelComicSketch) out = ensureNovelComicSketchPortraitStyleInAppearance(out)
    else if (context?.motionComic) {
      const { ensureMotionComicPortraitStyleInAppearance } = await import('../constants/motion-comic.js')
      out = ensureMotionComicPortraitStyleInAppearance(out)
    }
    return out
  }

  const tags = await resolveTags(sourceBody)
  if (!tags) {
    let out = finalizePortraitAppearanceOutput(text, { maxLen: outMax })
    if (context?.novelComicSketch) out = ensureNovelComicSketchPortraitStyleInAppearance(out)
    else if (context?.motionComic) {
      const { ensureMotionComicPortraitStyleInAppearance } = await import('../constants/motion-comic.js')
      out = ensureMotionComicPortraitStyleInAppearance(out)
    }
    return out
  }
  const merged = `${sourceBody}\nEnglish tags: ${tags}`
  const normalized = normalizePortraitAppearanceStructured(merged, {
    name: context?.name,
    role: context?.role,
    variantLabel: context?.variantLabel,
    minimal: context?.minimal,
  })
  let out = finalizePortraitAppearanceOutput(normalized, { maxLen: outMax })
  if (context?.novelComicSketch) out = ensureNovelComicSketchPortraitStyleInAppearance(out)
  else if (context?.motionComic) {
    const { ensureMotionComicPortraitStyleInAppearance } = await import('../constants/motion-comic.js')
    out = ensureMotionComicPortraitStyleInAppearance(out)
  }
  return out
}

/** 定妆剧情维：去掉 markdown / 对比示例，避免脏 prompt 诱发重影与多人对照 */
function flattenPortraitAppearanceText(text: string): string {
  let s = String(text || '')
  if (!s.trim()) return ''
  s = s
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/对比示例[：:][\s\S]*?(?=English tags:|$)/i, '')
    .replace(/同集其他角色[^\n]*/g, '')
    .replace(/定位[：:][^\n]*/g, '')
    .replace(/外貌特征[：:]?/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[，,]{2,}/g, '，')
    .trim()
  const tagMatch = s.match(/\bEnglish tags:\s*[\s\S]+$/i)
  const tags = tagMatch?.[0]?.trim() || ''
  const body = (tagMatch && tagMatch.index != null ? s.slice(0, tagMatch.index) : s)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420)
  return [body, tags].filter(Boolean).join('\n')
}

export function buildCharacterPortraitPrompt(
  char: { name: string; appearance?: string | null; description?: string | null; personality?: string | null; role?: string | null; variantLabel?: string | null },
  style = 'webtoon',
  options?: { portraitReference?: boolean; referenceVariantLabel?: string | null; styleAnchorReference?: boolean },
) {
  const normalizedStyle = normalizeArtStyle(style)
  const minimal = isNarrationMinimalStyle(normalizedStyle)
  let rawAppearance = sanitizePortraitAppearanceForGeneration(
    sanitizeCharacterAppearance(char.appearance?.trim() || char.description?.trim() || ''),
  )
  if (!minimal) rawAppearance = stripMinimalAppearanceForPortrait(rawAppearance)
  rawAppearance = flattenPortraitAppearanceText(rawAppearance)
  const { body: appearance, tags: englishTags } = extractEnglishAppearanceTags(rawAppearance)
  const role = char.role?.trim() || ''
  const cleanTags = englishTags
    ? reconcileEnglishTagsWithChineseAppearance(
      appearance,
      sanitizeCharacterAppearance(englishTags),
      { name: char.name, role },
    )
    : ''
  const stage = normalizeVariantLabel(char.variantLabel)
  const ageGroup = getVariantAgeGroup(char.variantLabel)
  const stylePrompt = artStylePrompt(normalizedStyle, 'portrait')
  const refHint = options?.portraitReference
    ? buildPortraitReferenceHint(ageGroup, getVariantAgeGroup(options.referenceVariantLabel))
    : ''
  const styleAnchorHint = options?.styleAnchorReference
    ? (isNovelComicSketchStyle(normalizedStyle)
      ? 'match reference image art style, thin black ink line weight, pencil cross-hatching technique ONLY, generate a completely different character per appearance description, do NOT copy face identity or outfit from reference'
      : isNarrationAnimeStyle(normalizedStyle)
        ? 'match reference image Japanese 2D anime illustration style and color technique ONLY, generate a completely different character per appearance description, do NOT copy face identity or outfit from reference'
        : 'match reference image art style, line weight, flat cel shading, and color technique ONLY, generate a completely different character per appearance description, do NOT copy face identity or outfit from reference')
    : ''
  if (isNarrationAnimeStyle(normalizedStyle)) {
    const plot = sanitizePortraitPlotForThreeView([
      char.name,
      stage ? `${stage}阶段` : '',
      appearance || THREE_VIEW_PORTRAIT_PLOT_ANIME_CN,
      cleanTags,
    ].filter(Boolean).join('，'))
    return [
      formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE),
      `【场景：${THREE_VIEW_PORTRAIT_SCENE_CN}】`,
      `【剧情：${plot}】`,
      NARRATION_ANIME_SCENE_SUFFIX,
    ].join('，')
  }
  if (isNovelComicSketchStyle(normalizedStyle)) {
    const plot = sanitizePortraitPlotForThreeView([
      char.name,
      stage ? `${stage}阶段` : '',
      appearance || NOVEL_COMIC_SKETCH_PORTRAIT_PLOT_CN,
      cleanTags,
    ].filter(Boolean).join('，'))
    return [
      formatNarrationStyleSpecBracket(NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_SPEC),
      `【场景：${NOVEL_COMIC_SKETCH_PORTRAIT_SCENE_CN}】`,
      `【剧情：${plot}】`,
      NOVEL_COMIC_SKETCH_PORTRAIT_SUFFIX,
      NOVEL_COMIC_SKETCH_PORTRAIT_FRAMING_EN,
    ].join('，')
  }
  if (isMotionComicStyle(normalizedStyle)) {
    const plot = sanitizePortraitPlotForThreeView([
      char.name,
      stage ? `${stage}阶段` : '',
      appearance || MOTION_COMIC_PORTRAIT_PLOT_CN,
      cleanTags,
    ].filter(Boolean).join('，'))
    return [
      formatNarrationStyleSpecBracket(MOTION_COMIC_PORTRAIT_STYLE_SPEC),
      // Agnes 多图合成：必须用深色身份锁脸场景，禁止白底定妆（易塌成设定拼贴）
      `【场景：${MOTION_COMIC_PORTRAIT_SCENE_CN}】`,
      `【剧情：${plot}】`,
      MOTION_COMIC_SCENE_SUFFIX,
      MOTION_COMIC_PORTRAIT_FRAMING,
    ].join('，')
  }
  if (minimal) {
    const actionPlot = sanitizePortraitPlotForThreeView(coerceMinimalCharacterAppearance(char.variantLabel, appearance))
    const plot = [
      char.name,
      stage ? `${stage}阶段` : '',
      actionPlot || THREE_VIEW_PORTRAIT_PLOT_MINIMAL_CN,
    ].filter(Boolean).join('，')
    return [
      formatNarrationStyleSpecBracket(undefined, NARRATION_MINIMAL_STYLE),
      `【场景：${THREE_VIEW_PORTRAIT_SCENE_MINIMAL_CN}】`,
      `【剧情：${plot}】`,
      NARRATION_UNIVERSAL_SCENE_SUFFIX,
    ].join('，')
  }

  const framing = resolvePortraitFraming(normalizedStyle, `${rawAppearance} ${cleanTags}`)
  return [
    resolvePortraitStyleGuard(normalizedStyle),
    stylePrompt,
    'unified single character portrait, single consistent project art style, no mixed media',
    `${char.name}${stage ? ` (${stage})` : ''}, character reference portrait for animation production`,
    stage ? `life stage: ${stage}` : '',
    refHint,
    styleAnchorHint,
    appearance ? `appearance: ${appearance}` : '',
    cleanTags ? `costume and props: ${cleanTags}` : '',
    role ? `role: ${role}` : '',
    framing,
    'no text, no watermark',
    'repeat: 2D anime cel-shading single character portrait, NOT pixel art, NOT retro filter, NOT character sheet',
  ].filter(Boolean).join(', ')
}

export function resolveCharacterPortraitGeneration(
  char: {
    id: number
    name: string
    dramaId: number
    appearance?: string | null
    description?: string | null
    personality?: string | null
    role?: string | null
    variantLabel?: string | null
    imageUrl?: string | null
  },
  style = 'comic',
  options?: { useReference?: boolean },
) {
  const normalizedStyle = normalizeArtStyle(style)
  const minimal = isNarrationMinimalStyle(normalizedStyle)
  const useReference = !minimal && options?.useReference !== false
  const refChar = useReference
    ? findPortraitReferenceCharacter(char.dramaId, char.name, char.id, char.variantLabel)
    : null
  const refUrl = refChar?.imageUrl?.trim() || null
  // 禁止用「其他角色定妆」作参考图：Qwen-Edit/PuLID/Redux 会锁脸，导致全员长得像第一个人
  // 画风统一靠 prompt / 底模，不靠跨角色参考图

  const referenceImages: string[] = []
  if (useReference && refUrl) referenceImages.push(refUrl)

  const prompt = buildCharacterPortraitPrompt(char, style, {
    portraitReference: !!(useReference && refUrl),
    referenceVariantLabel: refChar?.variantLabel,
    styleAnchorReference: false,
  })

  return {
    prompt,
    referenceImages: referenceImages.length ? referenceImages : undefined,
    referenceCharacterId: refChar?.id,
    referenceCharacterVariant: refChar?.variantLabel || null,
    styleAnchorCharacterId: undefined,
    /** @deprecated use referenceCharacterId */
    youthCharacterId: getVariantAgeGroup(refChar?.variantLabel) === 'youth' ? refChar?.id : undefined,
  }
}

/** 定妆：默认 Agnes Image 2.0（支持参考图）；显式选 Comfy/Qwen 时尊重用户 */
export function resolvePortraitImageModel(episodeModel?: string | null, _variantLabel?: string | null): string {
  const model = String(episodeModel || '').trim()
  if (model === 'qwen_image_edit' || model === 'qwen_image_edit_q3') return 'qwen_image_edit_q3'
  if (model === 'qwen_image_edit_q4') return 'qwen_image_edit_q4'
  if (model === 'kolors' || model.startsWith('sdxl_') || model.startsWith('flux') || model === 'flux_dev_fp8') {
    return model
  }
  if (model.startsWith('agnes-image')) {
    if (model === 'agnes-image-2.0') return 'agnes-image-2.0-flash'
    if (model === 'agnes-image-2.1') return 'agnes-image-2.1-flash'
    return model
  }
  // 分集默认 cogview / 空 / 其它云端：定妆统一走 Agnes（可参考图锁脸）
  return LOCAL_COMIC_ENV.agnesPortraitModel || 'agnes-image-2.1-flash'
}

export function enrichImagePromptWithCharacters(
  prompt: string,
  characters: NarrationCharacterRow[],
  characterIds?: number[],
  style?: string | null,
) {
  const base = String(prompt || '').trim()
  if (!base) return base

  const relevant = characterIds?.length
    ? characters.filter(ch => characterIds.includes(ch.id))
    : characters

  if (isNarrationMinimalStyle(style)) {
    if (NARRATION_USE_RAW_LLM_PROMPTS && !relevant.length) return base
    const coerced = coerceMinimalLLMImagePrompt(base)
    if (NARRATION_USE_RAW_LLM_PROMPTS) {
      if (!relevant.length) return base
      const names = relevant.map(ch => formatCharacterDisplayName(ch)).join('、')
      const addition = `本镜主人公：${names}`
      if (/【左格/.test(base) && /【右格/.test(base)) {
        return appendToNarrationBracket(appendToNarrationBracket(base, '左格', addition), '右格', addition)
      }
      if (/【画面主体[：:]/.test(base)) {
        return appendToNarrationBracket(base, '画面主体', addition)
      }
      return appendToNarrationBracket(base, '剧情', addition)
    }
    if (!relevant.length) return coerced
    const names = relevant.map(ch => formatCharacterDisplayName(ch)).join('、')
    const addition = `本镜主人公：${names}`
    if (/【左格/.test(coerced) && /【右格/.test(coerced)) {
      return appendToNarrationBracket(appendToNarrationBracket(coerced, '左格', addition), '右格', addition)
    }
    if (/【画面主体[：:]/.test(coerced)) {
      return appendToNarrationBracket(coerced, '画面主体', addition)
    }
    return appendToNarrationBracket(coerced, '剧情', addition)
  }

  if (!relevant.length) return base
  if (NARRATION_USE_RAW_LLM_PROMPTS) return base

  const hints = relevant.map(ch => {
    const app = ch.appearance?.trim()
    const label = formatCharacterDisplayName(ch)
    return app ? `${label} (${app})` : label
  }).join('; ')

  return `${base}, characters in scene: ${hints}, keep each character appearance consistent with reference images for the same life stage, same face and outfit within the same variant, match reference image line art and cel shading exactly`
}

export async function generateCharacterAppearance(params: {
  character: {
    name: string
    role?: string | null
    personality?: string | null
    appearance?: string | null
    description?: string | null
    variantLabel?: string | null
  }
  script?: string
  style?: string
  textModel?: string | null
  textThinking?: boolean
  contentContext?: {
    dramaTitle?: string
    dramaGenre?: string
    dramaStyle?: string
    episodeTitle?: string
    mentionExcerpt?: string
    storyboardSnippets?: string[]
    otherCharacters?: string[]
    novelBibleBlock?: string
    novelBibleCharacterBrief?: string
    portraitYouthReference?: {
      variantLabel?: string | null
      displayName?: string
      appearance: string
    } | null
  }
  productionMode?: ProductionMode | string | null
}): Promise<string> {
  const { character, script, style = 'comic', textModel, textThinking = true, contentContext, productionMode } = params
  const localComic = isLocalComicMode(productionMode)
  const minimal = isNarrationMinimalStyle(style)
  const novelComicSketch = isNovelComicSketchStyle(style)
  const motionComic = isMotionComicStyle(style)
  const anime = isNarrationAnimeStyle(style) && !localComic
  const scriptText = [
    contentContext?.mentionExcerpt,
    script,
    ...(contentContext?.storyboardSnippets || []),
  ].filter(Boolean).join('\n')
  const weightArc = minimal && scriptText.trim() ? detectNarrationWeightArcTheme(scriptText) : null
  logTaskProgress('CharacterAppearance', 'llm-generate-start', { name: character.name, model: getTextConfig(textModel).model })
  const system = localComic
    ? LOCAL_COMIC_CHARACTER_APPEARANCE_SYSTEM
    : minimal
    ? buildNarrationMinimalCharacterAppearanceSystem({ weightArc: weightArc ?? undefined })
    : novelComicSketch
    ? buildNovelComicSketchCharacterAppearanceSystem()
    : motionComic
    ? buildMotionComicCharacterAppearanceSystem()
    : anime
    ? buildNarrationAnimeCharacterAppearanceSystem()
    : [
    '你是影视角色定妆造型设计助手。',
    '必须根据解说稿/剧本中该角色的出场情节、对白、行为来推断外貌，与故事时代、题材、氛围一致。',
    '不要写与内容无关的通用模板；若剧本暗示年龄/职业/身份，外貌要体现。',
    PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
    '若提供了 variant_label / 时期标签，外貌必须严格对应该人生阶段，不得写成其他年龄。',
    '中文为主，可夹英文关键词；含年龄、性别、发型、五官、服装、体型、标志特征；80-180 字。',
    '【重要】只描述人物本身：发型、五官、服装、配饰、体型、动作道具。画风由项目统一设置，禁止出现：',
    '- 渲染/画风词：retro style, vintage look, pixel, webtoon, chibi, anime style, 复古风, Q版, 条漫, 像素',
    '- 把年代写成画风：禁止 "1980s retro style"，应写 "1980s side-part hairstyle, floral shirt, bell-bottom pants"',
    '- 禁止 vintage bicycle，应写 bicycle 或 pushing a bicycle',
    '- 禁止 wedding dress / red roses / evening gown 等浪漫海报元素，服装写具体款式如 red dress、floral shirt',
    '示例（好）：28-year-old male, 1980s side-part haircut, floral shirt, bell-bottom pants, aviator sunglasses, pushing a bicycle',
    '示例（差）：28-year-old male, 1980s retro style, vintage look, retro hairstyle',
    '输出格式：一段中文外貌描述 + 换行 + English tags: 英文逗号分隔的具体发型/服装/配饰/道具（生图必用），如 English tags: 1980s side-part haircut, floral shirt, bell-bottom pants, aviator sunglasses, bicycle',
    '只输出描述正文，不要标题、markdown、JSON。',
  ].join('\n')

  const peerNames = (contentContext?.otherCharacters || [])
    .map(line => String(line || '').split(/[：:]/)[0]?.trim())
    .filter(Boolean)
  let genderResolved = resolveIdentityPortraitGender(character.name, character.role)
  if (genderResolved === 'unknown') {
    genderResolved = inferPortraitGenderFromScript(character.name, scriptText)
  }
  const genderLabelCn: '男性' | '女性' | null =
    genderResolved === 'female' ? '女性' : genderResolved === 'male' ? '男性' : null
  const silhouette = resolvePortraitSilhouetteSlot(
    character.name,
    peerNames,
    genderResolved === 'unknown' ? null : genderResolved,
  )
  const existingApp = character.appearance?.trim() || ''
  const existingCollides = !!(
    existingApp
    && contentContext?.otherCharacters?.length
    && appearanceCollidesWithPeers(existingApp, contentContext.otherCharacters)
  )
  const forceRewriteDistinct = !!(contentContext?.otherCharacters?.length && (existingCollides || existingApp))
  // 漫画/小说彩漫：信任模型成稿，不把旧脏描述当「可优化」喂回去
  const comicDirect = novelComicSketch || motionComic
  const ageHint = inferPortraitAgeHint({
    name: character.name,
    role: character.role,
    personality: character.personality,
    variantLabel: character.variantLabel,
    script: scriptText,
  })
  const genderLockLine = genderLabelCn === '女性'
    ? '【性别·硬性】本角色是女性。appearance 必须以「N岁女性」或「青年女性/中年女性」开头；禁止写男性、男模、寸头、平头、光头、胡茬、国字方正脸、宽颌厚实脸；禁止照抄「28岁男性」示例。'
    : genderLabelCn === '男性'
      ? '【性别·硬性】本角色是男性。appearance 必须以「N岁男性」或「青年男性/中年男性」开头；禁止写成女性、长裙娇柔女模模板。'
      : '【性别·硬性】须根据定位与旁白中的她/他、妻子/丈夫等线索明确写出「女性」或「男性」；不得默认写成男性。'

  const buildUser = (retryDistinct: boolean) => [
    `角色名：${character.name}`,
    normalizeVariantLabel(character.variantLabel) ? `定妆时期：${normalizeVariantLabel(character.variantLabel)}` : '定妆时期：常态（全篇单一形态）',
    character.role ? `定位：${character.role}` : '',
    character.personality ? `性格：${String(character.personality).slice(0, 80)}` : '',
    ageHint ? formatPortraitAgeHintForLlm(ageHint) : '',
    genderLockLine,
    comicDirect
      ? (retryDistinct
        ? '【重写】上一稿与同集角色撞脸，请整段重写：换脸型+发型+服装主色，不要沿用旧描述。'
        : '请按规则直接输出最终定妆文案（不要参考任何旧描述）。')
      : (forceRewriteDistinct || retryDistinct
        ? (existingApp
          ? `旧描述（禁止沿用其脸型/发型/深灰外套模板，必须整段重写拉开差距）：${existingApp.slice(0, 180)}`
          : '')
        : (existingApp
          ? `已有描述（可优化但勿偏离剧情）：${existingApp.slice(0, 220)}`
          : '')),
    character.description?.trim() ? `简介：${character.description.trim().slice(0, 120)}` : '',
    contentContext?.novelBibleBlock?.trim() || '',
    contentContext?.novelBibleCharacterBrief?.trim() || '',
    contentContext?.dramaTitle ? `作品：${contentContext.dramaTitle}` : '',
    contentContext?.dramaGenre ? `题材：${contentContext.dramaGenre}` : '',
    contentContext?.episodeTitle ? `本集：${contentContext.episodeTitle}` : '',
    contentContext?.otherCharacters?.length
      ? [
        '同集其他角色（本角色必须避开其脸型+发型组合，至少换3项辨识特征）：',
        contentContext.otherCharacters.join('；'),
        `为本角色指定视觉槽位${silhouette.index + 1}/${PORTRAIT_SILHOUETTE_SLOTS.length}：${silhouette.hint}`,
        PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
      ].join('\n')
      : `无同集对照时仍须写出具体脸型发型，勿写万能俊朗棱角模板。建议槽位：${silhouette.hint}`,
    retryDistinct && !comicDirect
      ? '【重写·硬性】上一稿与同集角色撞脸，必须换脸型族+发型族+服装主色，禁止再写棱角分明方正下颌+细长眼+深灰外套。'
      : '',
    contentContext?.portraitYouthReference
      ? [
        '【硬性·同人延续】本角色须为下方「参考形态」的同一人自然 aging：',
        '- 必须保留参考形态中的脸型、发型、眼镜/痣等识别特征；',
        '- 只按当前定妆时期调整体型、气质与服装（如青年卫衣→中年西装）；',
        '- 禁止写成与参考形态无关的陌生人；English tags 须保留参考中的眼镜/发型等英文词，并含 same character。',
        `参考形态（${contentContext.portraitYouthReference.displayName || '青年'}）：\n${String(contentContext.portraitYouthReference.appearance || '').slice(0, 360)}`,
      ].join('\n')
      : '',
    contentContext?.mentionExcerpt?.trim()
      ? `剧本中该角色相关段落：\n${contentContext.mentionExcerpt.trim().slice(0, 1000)}`
      : script?.trim()
        ? `${localComic ? '剧本' : (motionComic || novelComicSketch) ? '讲解/旁白稿' : '剧本/解说稿'}摘录：\n${script.trim().slice(0, 1600)}`
        : '',
    contentContext?.storyboardSnippets?.length
      ? `该角色出现的镜头：\n${contentContext.storyboardSnippets.slice(0, 5).map((s, i) => `${i + 1}. ${String(s).slice(0, 160)}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const applyGenderGuard = (text: string) => enforceAppearanceGenderCn(text, genderLabelCn)

  const runOnce = async (retryDistinct: boolean) => {
    const raw = (await callTextChat(
      system,
      buildUser(retryDistinct),
      textModel,
      isLocalTextProvider(getTextConfig(textModel).provider) ? false : textThinking,
      300_000,
    )).trim()
    const cleaned = raw.replace(/^["'`]+|["'`]+$/g, '').replace(/^外貌描述[:：]\s*/i, '').trim()
    if (!cleaned) throw new Error('AI 未返回有效外貌描述')
    if (minimal) return applyGenderGuard(coerceMinimalCharacterAppearance(character.variantLabel, cleaned))

    // 小说彩漫 / 漫画解说：规则已写死在 system，直接信模型，不再 finalize/sanitize/二次翻 tags
    if (novelComicSketch) {
      const accepted = acceptNovelComicPortraitAppearanceRaw(cleaned)
      if (!accepted.trim()) throw new Error('AI 未返回有效外貌描述')
      return applyGenderGuard(accepted)
    }
    if (motionComic) {
      const light = cleaned
        .replace(/^```(?:text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/\n?English tags:\s*[\s\S]*$/i, '')
        .trim()
      return applyGenderGuard(ensureMotionComicPortraitStyleInAppearance(light))
    }
    // 解说日系2D：纯中文定妆，不补 English tags
    if (anime) {
      const light = cleaned
        .replace(/^```(?:text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/\n?English tags:\s*[\s\S]*$/i, '')
        .replace(/\bEnglish tags:\s*/gi, '')
        .trim()
      if (!light) throw new Error('AI 未返回有效外貌描述')
      return applyGenderGuard(sanitizePortraitAppearanceForGeneration(
        stripBodyMeasureSpecsFromAppearance(light),
      ))
    }

    const finalized = await finalizeCharacterAppearance(cleaned, {
      name: character.name,
      role: character.role,
      variantLabel: character.variantLabel,
      textModel,
      motionComic,
      novelComicSketch,
      skipEnglishTags: true,
    })
    let result = finalized
    if (localComic) result = stripBodyMeasureSpecsFromAppearance(finalized)
    else result = finalized
    if (contentContext?.portraitYouthReference) {
      result = enforceSiblingAppearanceContinuity(
        result,
        contentContext.portraitYouthReference,
        character.variantLabel,
      )
    }
    return applyGenderGuard(sanitizePortraitAppearanceForGeneration(result))
  }

  let result = await runOnce(false)
  logTaskSuccess('CharacterAppearance', 'llm-generate-done', { name: character.name, length: result.length })
  if (
    contentContext?.otherCharacters?.length
    && appearanceCollidesWithPeers(result, contentContext.otherCharacters)
  ) {
    logTaskWarn('CharacterAppearance', 'peer-collision-retry', {
      name: character.name,
      slot: silhouette.index + 1,
    })
    result = await runOnce(true)
    logTaskSuccess('CharacterAppearance', 'llm-generate-retry-done', { name: character.name, length: result.length })
    // 仍撞脸则再强制一次（换槽位提示）
    if (appearanceCollidesWithPeers(result, contentContext.otherCharacters)) {
      logTaskWarn('CharacterAppearance', 'peer-collision-retry-2', {
        name: character.name,
        slot: (silhouette.index + 2) % PORTRAIT_SILHOUETTE_SLOTS.length + 1,
      })
      result = await runOnce(true)
    }
  }
  return result
}

export function collectCharacterReferenceImages(
  characters: NarrationCharacterRow[],
  characterIds: number[],
  max = 4,
): string[] {
  const refs: string[] = []
  for (const id of characterIds) {
    const char = characters.find(ch => ch.id === id)
    const url = char?.imageUrl?.trim()
    if (url && !refs.includes(url) && refs.length < max) refs.push(url)
  }
  return refs
}

/** 按对照定妆标签顺序收集定妆参考图（与 Agnes 多图合成顺序对齐） */
export function collectCharacterReferenceImagesByPortraitLabels(
  prompt: string,
  characters: NarrationCharacterRow[],
  max = 4,
): {
  refs: string[]
  names: string[]
  characterIds: number[]
  /** 文案中全部对照定妆标签（含无参考图者） */
  allLabels: string[]
  /** 未能绑定到独立定妆图的标签（缺图或与他人共用同一 URL） */
  missingLabels: string[]
} {
  const labels = extractAllPortraitLabelsFromPrompt(prompt)
  const refs: string[] = []
  const names: string[] = []
  const characterIds: number[] = []
  const allLabels: string[] = []
  const missingLabels: string[] = []
  const seenIds = new Set<number>()
  const seenUrls = new Set<string>()

  const pushChar = (id: number, displayName: string): boolean => {
    if (seenIds.has(id) || refs.length >= max) return false
    const char = characters.find(ch => ch.id === id)
    const url = String(char?.imageUrl || '').trim()
    if (!url || seenUrls.has(url)) return false
    seenIds.add(id)
    seenUrls.add(url)
    refs.push(url)
    names.push(displayName)
    characterIds.push(id)
    return true
  }

  for (const label of labels) {
    const displayName = label.label || label.name
    allLabels.push(displayName)
    let id = resolveCharacterIdForPortraitRef(label, characters, prompt)
    if (!id && label.name === '我') {
      const namedMe = characters.filter(c => c.name.trim() === '我')
      id = namedMe.find(c => !!String(c.imageUrl || '').trim())?.id
        ?? namedMe[0]?.id
        ?? characters.find(c => isProtagonistCharacter(c) && !!String(c.imageUrl || '').trim())?.id
        ?? characters.find(c => isProtagonistCharacter(c))?.id
        ?? null
    }
    if (id == null) {
      if (!missingLabels.includes(displayName)) missingLabels.push(displayName)
      continue
    }
    // 同一标签/同一角色再次出现：已成功入列则不算 missing
    if (seenIds.has(id)) continue
    if (!pushChar(id, displayName)) {
      if (!missingLabels.includes(displayName)) missingLabels.push(displayName)
    }
  }

  return { refs, names, characterIds, allLabels, missingLabels }
}

/** 多人定妆参考：提示模型按参考图顺序锁不同脸，严格禁止同一配图撞脸 */
export function prependMultiPortraitReferenceHint(
  prompt: string,
  names: string[],
  options?: {
    genders?: Array<string | null | undefined>
    cues?: Array<string | null | undefined>
    /** 文案点名总人数（可大于有参考图的 names） */
    totalCount?: number
    missingLabels?: string[]
  },
): string {
  const list = (names || []).map(n => String(n || '').trim()).filter(Boolean)
  const missing = (options?.missingLabels || []).map(n => String(n || '').trim()).filter(Boolean)
  const totalCount = Math.max(options?.totalCount || 0, list.length + missing.length, list.length)
  if (list.length < 2 && !(list.length >= 1 && missing.length >= 1) && totalCount < 2) {
    return String(prompt || '')
  }
  const genders = options?.genders || []
  const cues = options?.cues || []
  const mapping = list.map((n, i) => {
    const g = String(genders[i] || '').trim()
    const cue = String(cues[i] || '').trim()
    const gHint = g ? `(${g})` : ''
    const cueHint = cue ? `，辨识差「${cue}」` : ''
    return `第${i + 1}张参考图严格锁定「${n}」${gHint}${cueHint}的脸型/发型/五官，禁止挪用到其他人脸上`
  }).join('；')
  const maleCount = genders.filter(g => /男|male/i.test(String(g || ''))).length
  const femaleCount = genders.filter(g => /女|female/i.test(String(g || ''))).length
  const sameGenderWarn = maleCount >= 2
    ? '同框有多名男性时五官与发型轮廓必须明显不同，严禁同一张男脸复制；禁止因两件蓝色夹克深浅接近就把两名男角画成双胞胎。'
    : (femaleCount >= 2
      ? '同框有多名女性时五官与发型轮廓必须明显不同，严禁同一张女脸复制。'
      : '')
  const missingWarn = missing.length
    ? `以下角色无独立定妆参考图，必须仅靠文案内辨识差画成与其他人完全不同的脸与发型，严禁克隆任一已有参考脸：${missing.map(n => `「${n}」`).join('、')}。`
    : ''
  const similarOutfitWarn = /#(?:2563eb|1e40af|1d4ed8|3b82f6).{0,12}夹克/.test(String(prompt || ''))
    && (maleCount >= 2 || /对照定妆「[^」]+」[^；]{0,80}夹克[^；]{0,120}对照定妆「[^」]+」[^；]{0,80}夹克/.test(String(prompt || '')))
    ? '两名男角夹克主色接近时更须靠发型轮廓与五官拉开，不得画成同一人换姿势。'
    : ''
  const hint = [
    `【同一配图禁撞脸·硬性】${mapping || '按文案对照定妆标签锁脸'}。`,
    `画面人数恰好 ${totalCount} 人且仅此 ${totalCount} 张不同脸；禁止同一人脸左右对称复制、双胞胎、分身、克隆；禁止多出第 ${totalCount + 1} 人。`,
    '禁止白底定妆并排、角色设定表、多头拼贴、公告板/软木板贴脸照片、办公室货架定妆墙。',
    sameGenderWarn,
    missingWarn,
    similarOutfitWarn,
    '服装主色即使接近，脸也必须各自可辨识，不得因夹克/围裙同色而画成同一人。',
    '中年/老年角色须保留文案年龄感，禁止统一画成二十岁青年脸。',
    'distinct faces only, no duplicate identity, no cloned face, no twin extras, no character sheet lineup.',
  ].filter(Boolean).join('')
  const body = String(prompt || '').trim()
  if (!body) return hint
  if (body.includes('【同一配图禁撞脸·硬性】') || body.includes('【定妆参考对应·硬性】')) {
    // 旧提示升级：去掉弱提示再挂强提示
    const cleaned = body
      .replace(/^【定妆参考对应·硬性】[^\n]*\n?/, '')
      .replace(/^【同一配图禁撞脸·硬性】[^\n]*\n?/, '')
      .trim()
    return `${hint}\n${cleaned}`
  }
  return `${hint}\n${body}`
}

export async function extractNarrationCharacters(
  episodeId: number,
  dramaId: number,
  script: string,
  style = 'comic',
  textModel?: string | null,
  textThinking = true,
) {
  const existing = db.select().from(schema.characters).all()
    .filter(ch => ch.dramaId === dramaId && !ch.deletedAt)

  let extracted: Array<{ name: string; variantLabel?: string; role?: string; appearance?: string; personality?: string }> = []

  try {
    const config = getTextConfig(textModel)
    assertTextConfigReady(config)

    logTaskProgress('NarrationChars', 'llm-extract-start', {
      episodeId,
      model: config.model,
      motionComic: isMotionComicStyle(style),
      novelComicSketch: isNovelComicSketchStyle(style),
    })

      const extractWeightArc = !usesComicIllustrationPipeline(style) && isNarrationMinimalStyle(style)
        ? detectNarrationWeightArcTheme(script.slice(0, 12000))
        : null
      const namesOnlyExtract = usesComicIllustrationPipeline(style)
        || isNarrationAnimeStyle(style)
        || isNovelComicSketchStyle(style)
      const system = isNovelComicSketchStyle(style)
        ? buildNovelComicSketchCharacterExtractSystem()
        : isMotionComicStyle(style)
        ? buildMotionComicCharacterExtractSystem()
        : isNarrationAnimeStyle(style)
        ? buildNarrationAnimeCharacterExtractSystem()
        : isNarrationMinimalStyle(style)
        ? buildNarrationMinimalCharacterExtractSystem({ weightArc: extractWeightArc ?? undefined })
        : buildNarrationAnimeCharacterExtractSystem()

      const user = JSON.stringify({
        script: script.slice(0, 12000),
        existing_characters: existing.filter(isVisualCharacter).map(ch => ({
          name: ch.name,
          variant_label: ch.variantLabel || '',
        })),
        output_format: {
          // 提取只拿名单；定妆文案另步并发生成，禁止在此写配图描述
          characters: namesOnlyExtract
            ? '[{ name, variant_label, role, personality }]'
            : '[{ name, variant_label, role, appearance, personality }]',
        },
      })

      const text = await callNarrationCharacterExtractLlm(system, user, textModel, textThinking)
      const characterRows = parseExtractedCharacterRowsFromLlm(text)
      if (characterRows?.length) {
        const comicPipeline = usesComicIllustrationPipeline(style)
        extracted = characterRows
          .map((row: any) => {
            const identity = normalizeExtractedCharacterIdentity({
              name: String(row?.name || '').trim(),
              role: String(row?.role || '').trim(),
              variantLabel: row?.variant_label ?? row?.variantLabel,
            })
            return {
              name: identity.name,
              variantLabel: comicPipeline ? '' : identity.variantLabel,
              role: identity.role,
              // 名单提取：不写入 appearance（定妆描述另步并发）
              appearance: namesOnlyExtract
                ? ''
                : sanitizeCharacterAppearance(String(row?.appearance || '').trim()),
              personality: String(row?.personality || '').trim(),
            }
          })
          .filter((row: { name: string }) => row.name && !isNarratorCharacter(row))
        extracted = comicPipeline
          ? dedupeExtractedCharactersByName(
            filterMotionComicExtractedCharacters(extracted, script),
            { collapseVariants: true },
          )
          : filterNarrationExtractedCharacters(extracted, script)
      } else {
        logTaskWarn('NarrationChars', 'llm-extract-invalid-json', { preview: text.slice(0, 200) })
      }
  } catch (err: any) {
    logTaskWarn('NarrationChars', 'llm-extract-failed', { error: err.message })
    throw err
  }

  if (!extracted.length) {
    const speakerFallback = extractCharactersFromSpeakerLines(script)
    if (speakerFallback.length) {
      logTaskWarn('NarrationChars', 'extract-speaker-fallback', {
        episodeId,
        count: speakerFallback.length,
        names: speakerFallback.map(r => r.name),
      })
      extracted = filterNarrationExtractedCharacters(speakerFallback, script)
    }
  }

  if (extracted.length) {
    const portraitStructured = usesPortraitAppearanceSanitize(style)
    const namesOnly = usesComicIllustrationPipeline(style)
      || isNarrationAnimeStyle(style)
      || isNovelComicSketchStyle(style)
    // 名单提取：跳过定妆文案 finalize（含 English tags）；定妆描述另步并发生成
    if (!namesOnly) {
      extracted = await Promise.all(extracted.map(async row => {
        let appearance = row.appearance
          ? (portraitStructured
            ? sanitizePortraitAppearanceForGeneration(sanitizeCharacterAppearance(row.appearance))
            : sanitizeCharacterAppearance(row.appearance)
          ).slice(0, 800)
          : ''
        if (appearance && portraitStructured && !isNarrationMinimalStyle(style)) {
          appearance = await finalizeCharacterAppearance(appearance, {
            name: row.name,
            role: row.role,
            variantLabel: row.variantLabel,
            textModel,
            skipEnglishTags: true,
          })
        }
        return { ...row, appearance }
      }))
    }
  }

  if (!extracted.length) {
    logTaskWarn('NarrationChars', 'llm-extract-empty', { episodeId })
    return {
      created: 0,
      updated: 0,
      archived: 0,
      characters: getEpisodeVisualCharacters(episodeId, dramaId),
      linked: linkAllNarrationStoryboardCharacters(episodeId, dramaId),
    }
  }

  const ts = now()
  let created = 0
  let updated = 0
  const keepNames = new Set(extracted.map(row => row.name.trim()).filter(Boolean))

  // 先归并同名脏条目并更新，再归档多余角色（避免先删掉有外貌的脏名）
  for (const row of extracted) {
    const variantLabel = normalizeVariantLabel(row.variantLabel) || null
    const siblings = existing.filter(ch =>
      !ch.deletedAt
      && normalizeExtractedCharacterIdentity({ name: ch.name }).name === row.name
      && normalizeVariantLabel(ch.variantLabel) === normalizeVariantLabel(variantLabel),
    ).sort((a, b) => {
      const exact = (b.name === row.name ? 1 : 0) - (a.name === row.name ? 1 : 0)
      if (exact) return exact
      const app = String(b.appearance || '').trim().length - String(a.appearance || '').trim().length
      if (app) return app
      return (b.imageUrl ? 1 : 0) - (a.imageUrl ? 1 : 0)
    })
    const match = siblings[0]
    if (match) {
      const updates: Record<string, any> = { updatedAt: ts }
      if (match.name !== row.name) updates.name = row.name
      if (row.role) updates.role = row.role
      if (variantLabel && match.variantLabel !== variantLabel) updates.variantLabel = variantLabel
      if (!variantLabel && match.variantLabel) updates.variantLabel = null
      const siblingAppearance = siblings
        .map(s => String(s.appearance || '').trim())
        .sort((a, b) => b.length - a.length)[0] || ''
      const nextAppearance = row.appearance
        ? sanitizeCharacterAppearance(row.appearance)
        : siblingAppearance
      if (nextAppearance && nextAppearance !== String(match.appearance || '').trim()) {
        updates.appearance = nextAppearance
        if (match.imageUrl && row.appearance && nextAppearance !== siblingAppearance) {
          updates.imageUrl = null
        }
      }
      if (!match.imageUrl) {
        const sibImg = siblings.find(s => s.id !== match.id && s.imageUrl)?.imageUrl
        if (sibImg) updates.imageUrl = sibImg
      }
      if (row.personality && !match.personality) updates.personality = row.personality
      else if (!match.personality) {
        const sibPers = siblings.find(s => s.id !== match.id && s.personality)?.personality
        if (sibPers) updates.personality = sibPers
      }
      if (Object.keys(updates).length > 1) {
        db.update(schema.characters).set(updates).where(eq(schema.characters.id, match.id)).run()
        updated++
      }
      linkCharacterToEpisode(episodeId, match.id)
      // 同批其余脏名/重复 id 标删除，避免后续 archive 漏迁
      for (const sib of siblings) {
        if (sib.id === match.id) continue
        db.update(schema.characters).set({ deletedAt: ts, updatedAt: ts }).where(eq(schema.characters.id, sib.id)).run()
        sib.deletedAt = ts
      }
      match.name = row.name
      match.deletedAt = null
    } else {
      const res = db.insert(schema.characters).values({
        dramaId,
        name: row.name,
        role: row.role || normalizeExtractedCharacterRole(row.name, null),
        variantLabel,
        appearance: sanitizeCharacterAppearance(row.appearance || ''),
        personality: row.personality || '',
        createdAt: ts,
        updatedAt: ts,
      }).run()
      linkCharacterToEpisode(episodeId, Number(res.lastInsertRowid))
      created++
    }
  }

  const archived = archiveNonProtagonistCharacters(dramaId, keepNames)
  if (archived) {
    logTaskProgress('NarrationChars', 'archived-non-protagonist', { dramaId, archived, keepNames: [...keepNames] })
  }

  const linked = linkAllNarrationStoryboardCharacters(episodeId, dramaId)
  const characters = getEpisodeVisualCharacters(episodeId, dramaId)

  logTaskSuccess('NarrationChars', 'extract-done', {
    episodeId,
    created,
    updated,
    archived,
    characterCount: characters.length,
    linkedStoryboards: linked.linkedStoryboardCount,
  })

  return { created, updated, archived, characters, linked, generated_at: llmGeneratedAt() }
}
