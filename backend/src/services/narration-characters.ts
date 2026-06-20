import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import {
  artStylePrompt,
  buildMinimalPortraitPostureHint,
  buildNarrationPortraitPromptContent,
  coerceMinimalCharacterAppearance,
  coerceMinimalLLMImagePrompt,
  isNarrationMinimalStyle,
  NARRATION_MINIMAL_NO_CLOTHING_RULE,
  normalizeArtStyle,
  sanitizeCharacterAppearance,
  sanitizeAppearanceForPortrait,
  appendToNarrationBracket,
  NARRATION_MINIMAL_BODY_SIZE_SPEC,
  NARRATION_BODY_STAGE_SIZE_HINTS,
  NARRATION_PROTAGONIST_BODY,
  NARRATION_PROTAGONIST_EYES,
  NARRATION_CROWD_BODY,
  NARRATION_CROWD_EYES,
  NARRATION_USE_RAW_LLM_PROMPTS,
} from '../constants/art-styles.js'
import { DEFAULT_IMAGE_MODEL } from '../constants/image-models.js'
import { getActiveConfig, getTextConfig } from './ai.js'
import { callTextChat } from './text-chat.js'
import { parseNarrationImageMeta } from './narration-image.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

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

function scoreVariantForText(text: string, char: NarrationCharacterRow): number {
  const label = normalizeVariantLabel(char.variantLabel)
  const app = String(char.appearance || '').trim()
  let score = 0

  if (label && text.includes(label)) score += 15

  const ageRules: Array<{ keys: string[]; pattern: RegExp }> = [
    { keys: ['童年', '幼年', '孩童'], pattern: /童年|幼年|儿时|小时候|孩童|幼童|几岁/ },
    { keys: ['少年', '青年'], pattern: /少年|青年|年轻|二十岁|18岁|19岁|20岁|二十出头|大学|小伙/ },
    { keys: ['中年'], pattern: /中年|四十|五十|人到中年|40岁|50岁/ },
    { keys: ['老年', '晚年'], pattern: /老年|晚年|白发|鬓白|六十|七十|80岁|垂暮|苍老|老人|年迈/ },
  ]

  for (const rule of ageRules) {
    const labelHit = label ? rule.keys.some(k => label.includes(k)) : false
    const textHit = rule.pattern.test(text)
    const appHit = rule.keys.some(k => app.includes(k))
    if (labelHit && textHit) score += 12
    if (textHit && appHit) score += 8
  }

  const textAge = text.match(/(\d{1,2})\s*岁/)?.[1]
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

/** 解说定妆只保留主人公；第一人称文案优先保留同名多阶段记录 */
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

function archiveNonProtagonistCharacters(dramaId: number, keepNames: Set<string>): number {
  const ts = now()
  let archived = 0
  for (const ch of db.select().from(schema.characters).all()) {
    if (ch.dramaId !== dramaId || ch.deletedAt || !isVisualCharacter(ch)) continue
    if (keepNames.has(ch.name.trim())) continue
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

export function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  for (const characterId of uniqueIds) {
    db.insert(schema.storyboardCharacters).values({ storyboardId, characterId }).run()
  }
}

export function getEpisodeVisualCharacters(episodeId: number, dramaId: number): NarrationCharacterRow[] {
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

  const mentionedNames: string[] = []
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length)
  for (const char of sorted) {
    const name = char.name.trim()
    if (!name || name.length < 2) continue
    if (normalized.includes(name) && !mentionedNames.includes(name)) mentionedNames.push(name)
  }

  for (const name of mentionedNames) {
    const variants = characters.filter(ch => ch.name.trim() === name)
    if (!variants.length) continue
    if (variants.length === 1) {
      found.add(variants[0].id)
      continue
    }
    found.add(pickBestVariantForText(normalized, variants).id)
  }

  for (const id of detectCharacterIdsFromAppearanceHints(normalized, characters)) {
    found.add(id)
  }
  for (const id of detectFirstPersonProtagonistIds(normalized, characters)) {
    found.add(id)
  }

  return [...found]
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
  const hasFirstPerson = /(?:^|[\s，,。！？；:：])我(?:的|在|把|被|会|要|也|都|还|就|则|便|曾|已|将|想|说|看|走|来|去|得|给|让|用|做|吃|喝|买|卖|开|关|拿|带|找|等|站|坐|躺|睡|醒|爱|恨|觉得|认为|知道|发现|想起|决定|开始|继续|完成|辞|推|摆)/.test(text)
  if (!hasFirstPerson) return []

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

export function resolveStoryboardCharacterIdsForShot(
  storyboardId: number,
  options?: { sync?: boolean },
) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  if (!ep) throw new Error('剧集不存在')

  const characters = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
  const text = buildStoryboardCharacterContextText(sb)
  const ids = detectCharacterIdsInText(text, characters)
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
) {
  const ids = detectCharacterIdsInText(text, characters)
  syncStoryboardCharacters(storyboardId, ids)
  return ids
}

export function linkAllNarrationStoryboardCharacters(episodeId: number, dramaId: number) {
  const characters = getEpisodeVisualCharacters(episodeId, dramaId)
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .filter(sb => !sb.deletedAt)

  let linked = 0
  for (const sb of storyboards) {
    const text = buildStoryboardCharacterContextText(sb)
    const ids = linkStoryboardCharactersFromText(sb.id, text, characters)
    if (ids.length) linked++
  }
  return { storyboardCount: storyboards.length, linkedStoryboardCount: linked, characterCount: characters.length }
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

export { callTextChat } from './text-chat.js'

function resolvePortraitFraming(style: string, _appearance: string): string {
  if (isNarrationMinimalStyle(style)) {
    return [
      'single black filled stick figure with two small white dot eyes on plain light gray background',
      'no clothing, no outfit, no shoes, no hat, plain stick figure body only',
      'simple white dot eyes only on black round head, distinguish by posture and small props, NOT detailed face, NOT realistic portrait, NOT anime face',
      'NOT movie poster, NOT scenic background, NOT environmental illustration',
      'NOT pixel art, NOT retro photo filter, NOT dithered shading',
    ].join(', ')
  }
  return [
    'character design reference sheet for animation production',
    'isolated single character on plain light gray studio background',
    'half-body to full-body turnaround view, outfit and small props visible',
    'NOT movie poster, NOT scenic background, NOT environmental illustration',
    'NOT pixel art, NOT retro photo filter, NOT dithered shading',
  ].join(', ')
}

const PORTRAIT_STYLE_GUARD = [
  'CRITICAL ART STYLE: modern Chinese short-drama 2D anime, thin clean line art, flat soft cel shading, solid light gray background',
  'FORBIDDEN: pixel art, dithering, 8-bit, retro game, vintage photo filter, nostalgic poster, film grain, CRT noise, cross-hatching',
].join(', ')

function extractEnglishAppearanceTags(appearance: string): { body: string; tags: string } {
  const match = appearance.match(/\bEnglish tags:\s*(.+)$/im)
  if (!match) return { body: appearance.trim(), tags: '' }
  return {
    body: appearance.replace(/\s*\bEnglish tags:\s*.+$/im, '').trim(),
    tags: match[1].trim(),
  }
}

export function hasEnglishAppearanceTags(appearance?: string | null): boolean {
  return /\bEnglish tags:\s*\S/i.test(String(appearance || ''))
}

async function generateEnglishAppearanceTags(
  appearanceBody: string,
  context?: { name?: string | null; role?: string | null },
): Promise<string> {
  const system = [
    '你是定妆视觉标注助手。根据外貌描述，只输出一行 English tags: 开头的英文标签。',
    '仅写肉眼可见项：发型、上衣、下装、鞋、眼镜、首饰、道具、手持/身旁物品（如 bicycle）。',
    '禁止 retro style, vintage look, pixel, webtoon, chibi, anime style 等画风词。',
    '禁止 abstract 气质词，只要可视名词短语；逗号分隔，6-12 项。',
    '示例：English tags: side-part haircut, floral shirt, bell-bottom pants, aviator sunglasses, bicycle',
  ].join('\n')
  const user = [
    context?.name ? `角色：${context.name}` : '',
    context?.role ? `定位：${context.role}` : '',
    `外貌描述：\n${appearanceBody}`,
  ].filter(Boolean).join('\n\n')
  const raw = (await callTextChat(system, user)).trim()
  const matched = raw.match(/English tags:\s*(.+)/i)?.[1] || raw.split('\n')[0]?.trim() || ''
  const tags = sanitizeCharacterAppearance(matched.replace(/^English tags:\s*/i, ''))
  return tags
}

/** 清洗 + 补全 English tags（缺失时自动调用 LLM）；素体模式仅保留中文动作描述 */
export async function finalizeCharacterAppearance(
  appearance: string,
  context?: { name?: string | null; role?: string | null; minimal?: boolean; variantLabel?: string | null },
): Promise<string> {
  if (context?.minimal) {
    return coerceMinimalCharacterAppearance(context.variantLabel, appearance)
  }
  let text = sanitizeCharacterAppearance(appearance)
  if (!text) return ''
  if (hasEnglishAppearanceTags(text)) {
    const { body, tags } = extractEnglishAppearanceTags(text)
    const cleanedBody = sanitizeCharacterAppearance(body)
    const cleanedTags = tags ? sanitizeCharacterAppearance(tags) : ''
    return [cleanedBody, cleanedTags ? `English tags: ${cleanedTags}` : ''].filter(Boolean).join('\n').slice(0, 600)
  }

  const { body } = extractEnglishAppearanceTags(text)
  const tags = await generateEnglishAppearanceTags(body || text, context)
  if (!tags) return text.slice(0, 600)
  const merged = `${(body || text).trim()}\nEnglish tags: ${tags}`
  return sanitizeCharacterAppearance(merged).slice(0, 600)
}

export function buildCharacterPortraitPrompt(
  char: { name: string; appearance?: string | null; description?: string | null; personality?: string | null; role?: string | null; variantLabel?: string | null },
  style = 'webtoon',
  options?: { portraitReference?: boolean; referenceVariantLabel?: string | null; styleAnchorReference?: boolean },
) {
  const normalizedStyle = normalizeArtStyle(style)
  const rawAppearance = sanitizeCharacterAppearance(char.appearance?.trim() || char.description?.trim() || '')
  const { body: appearance, tags: englishTags } = extractEnglishAppearanceTags(rawAppearance)
  const cleanTags = englishTags ? sanitizeCharacterAppearance(englishTags) : ''
  const role = char.role?.trim() || ''
  const stage = normalizeVariantLabel(char.variantLabel)
  const ageGroup = getVariantAgeGroup(char.variantLabel)
  const stylePrompt = artStylePrompt(normalizedStyle, 'portrait')
  const refHint = options?.portraitReference
    ? buildPortraitReferenceHint(ageGroup, getVariantAgeGroup(options.referenceVariantLabel))
    : ''
  const styleAnchorHint = options?.styleAnchorReference
    ? 'match reference image art style, line weight, flat cel shading, and color technique ONLY, generate a completely different character per appearance description, do NOT copy face identity or outfit from reference'
    : ''
  const minimal = isNarrationMinimalStyle(normalizedStyle)
  if (minimal) {
    const actionPlot = coerceMinimalCharacterAppearance(char.variantLabel, appearance)
    const plot = [
      char.name,
      stage ? `${stage}阶段` : '',
      actionPlot,
    ].filter(Boolean).join('，')
    const scene = `浅灰纯色背景，单人全身${NARRATION_PROTAGONIST_BODY}定妆参考图，无环境无场景元素`
    return buildNarrationPortraitPromptContent(scene, plot)
  }

  const framing = resolvePortraitFraming(normalizedStyle, `${rawAppearance} ${cleanTags}`)
  return [
    PORTRAIT_STYLE_GUARD,
    stylePrompt,
    'unified character design sheet, single consistent project art style, no mixed media',
    `${char.name}${stage ? ` (${stage})` : ''}, character reference portrait for animation production`,
    stage ? `life stage: ${stage}` : '',
    refHint,
    styleAnchorHint,
    appearance ? `appearance: ${appearance}` : '',
    cleanTags ? `costume and props: ${cleanTags}` : '',
    role ? `role: ${role}` : '',
    framing,
    'no text, no watermark',
    'repeat: 2D anime cel-shading character sheet, NOT pixel art, NOT retro filter',
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
  const styleAnchor = useReference && !refUrl
    ? findDramaStyleAnchorCharacter(char.dramaId, char.id)
    : null
  const styleAnchorUrl = styleAnchor?.imageUrl?.trim() || null

  const referenceImages: string[] = []
  if (useReference && refUrl) referenceImages.push(refUrl)
  if (useReference && styleAnchorUrl) referenceImages.push(styleAnchorUrl)

  const prompt = buildCharacterPortraitPrompt(char, style, {
    portraitReference: !!(useReference && refUrl),
    referenceVariantLabel: refChar?.variantLabel,
    styleAnchorReference: !!(useReference && styleAnchorUrl),
  })

  return {
    prompt,
    referenceImages: referenceImages.length ? referenceImages : undefined,
    referenceCharacterId: refChar?.id,
    referenceCharacterVariant: refChar?.variantLabel || null,
    styleAnchorCharacterId: styleAnchor?.id,
    /** @deprecated use referenceCharacterId */
    youthCharacterId: getVariantAgeGroup(refChar?.variantLabel) === 'youth' ? refChar?.id : undefined,
  }
}

/** 中年/老年定妆需 subject 参考能力；kling-v1 仅普通图生图，自动升到 v1.5 */
export function resolvePortraitImageModel(episodeModel?: string | null, variantLabel?: string | null): string {
  const model = String(episodeModel || '').trim() || DEFAULT_IMAGE_MODEL
  if (!variantNeedsYouthPortraitReference(variantLabel)) return model
  if (model === 'kling-v1') return 'kling-v1-5'
  return model
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
    const coerced = coerceMinimalLLMImagePrompt(base)
    if (!relevant.length || NARRATION_USE_RAW_LLM_PROMPTS) return coerced
    const names = relevant.map(ch => formatCharacterDisplayName(ch)).join('、')
    const addition = `场景中出现素体：主人公${names}须为${NARRATION_PROTAGONIST_BODY}（${NARRATION_PROTAGONIST_EYES}），同框配角须为${NARRATION_CROWD_BODY}（${NARRATION_CROWD_EYES}），${NARRATION_MINIMAL_NO_CLOTHING_RULE}，同款简笔比例仅颜色与人生阶段微调区分`
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
  }
}): Promise<string> {
  const { character, script, style = 'comic', textModel, textThinking = true, contentContext } = params
  const minimal = isNarrationMinimalStyle(style)
  logTaskProgress('CharacterAppearance', 'llm-generate-start', { name: character.name, model: getTextConfig(textModel).model })
  const system = minimal
    ? [
      '你是解说素体小人项目的角色动作标注助手。',
      `本项目主人公定妆是「${NARRATION_PROTAGONIST_BODY}，${NARRATION_PROTAGONIST_EYES}」，${NARRATION_MINIMAL_NO_CLOTHING_RULE}，通用尺寸：${NARRATION_MINIMAL_BODY_SIZE_SPEC}；人生阶段微调：${NARRATION_BODY_STAGE_SIZE_HINTS}；不写发型/复杂五官/年代。`,
      `根据剧本情节，只输出该人生阶段的「${NARRATION_PROTAGONIST_BODY} + ${NARRATION_PROTAGONIST_EYES} + 无服装 + 尺寸比例 + 动作姿态 + 可选简单道具」，20-60 字中文。`,
      `示例（小孩）：${NARRATION_PROTAGONIST_BODY}，${NARRATION_PROTAGONIST_EYES}，比青年小一号约2.2头高，站立活泼姿态`,
      `示例（青年）：${NARRATION_PROTAGONIST_BODY}，${NARRATION_PROTAGONIST_EYES}，圆头约占身高三分之一三头高，标准身形，站立或行走`,
      `示例（中年）：${NARRATION_PROTAGONIST_BODY}，${NARRATION_PROTAGONIST_EYES}，三头高躯干略宽微胖，坐于柜台后手持茶杯轮廓`,
      `示例（老年）：${NARRATION_PROTAGONIST_BODY}，${NARRATION_PROTAGONIST_EYES}，约2.8头高略佝偻，圆头两侧各几条简化白发弧线，坐于凳上手持圆扇轮廓`,
      '禁止：花衬衫、西装、墨镜、皱纹、写实五官、美人脸、小胡子、花白全头、发际线、复杂发型、无眼睛、80年代、English tags、白色素体（群众才是白色）、任何服装鞋帽',
      '只输出正文，不要标题、markdown、JSON。',
    ].join('\n')
    : [
    '你是影视角色定妆造型设计助手。',
    '必须根据解说稿/剧本中该角色的出场情节、对白、行为来推断外貌，与故事时代、题材、氛围一致。',
    '不要写与内容无关的通用模板；若剧本暗示年龄/职业/身份，外貌要体现。',
    '与其他角色要有明显区分。',
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

  const user = [
    `角色名：${character.name}`,
    normalizeVariantLabel(character.variantLabel) ? `定妆时期：${normalizeVariantLabel(character.variantLabel)}` : '定妆时期：常态（全篇单一形态）',
    character.role ? `定位：${character.role}` : '',
    character.personality ? `性格：${character.personality}` : '',
    character.appearance?.trim() ? `已有描述（可优化但勿偏离剧情）：${character.appearance.trim()}` : '',
    character.description?.trim() ? `简介：${character.description.trim()}` : '',
    contentContext?.dramaTitle ? `作品：${contentContext.dramaTitle}` : '',
    contentContext?.dramaGenre ? `题材：${contentContext.dramaGenre}` : '',
    contentContext?.episodeTitle ? `本集：${contentContext.episodeTitle}` : '',
    contentContext?.otherCharacters?.length
      ? `同集其他角色（勿混淆）：${contentContext.otherCharacters.join('；')}`
      : '',
    contentContext?.mentionExcerpt?.trim()
      ? `剧本中该角色相关段落：\n${contentContext.mentionExcerpt.trim()}`
      : script?.trim() ? `剧本/解说稿摘录：\n${script.trim().slice(0, 3500)}` : '',
    contentContext?.storyboardSnippets?.length
      ? `该角色出现的镜头：\n${contentContext.storyboardSnippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const raw = (await callTextChat(system, user, textModel, textThinking)).trim()
  const cleaned = raw.replace(/^["'`]+|["'`]+$/g, '').replace(/^外貌描述[:：]\s*/i, '').trim()
  if (!cleaned) throw new Error('AI 未返回有效外貌描述')
  logTaskSuccess('CharacterAppearance', 'llm-generate-done', { name: character.name, length: cleaned.length })
  if (minimal) return coerceMinimalCharacterAppearance(character.variantLabel, cleaned)
  return finalizeCharacterAppearance(cleaned.slice(0, 600), {
    name: character.name,
    role: character.role,
    variantLabel: character.variantLabel,
  })
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

  const activeText = getActiveConfig('text')
  if (!activeText?.apiKey?.trim()) {
    throw new Error('请先在「设置 → AI 服务」中配置并启用文本 API（如 ChatFire + deepseek-v4-pro），并填写 API Key')
  }

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey?.trim()) {
      throw new Error('文本 AI 服务未填写 API Key，请在设置中完善配置')
    }

    logTaskProgress('NarrationChars', 'llm-extract-start', { episodeId, model: config.model })

      const system = [
        '你是影视解说项目的角色设定师。解说视频采用极简素体小人画风，画面里只需给「主人公」做定妆参考，配角不需要单独定妆。',
        '规则：',
        '1) 只提取主人公（男主/女主/主角），不要提取配角（妻子、店员、朋友、提亲者等）',
        '2) 不要提取「旁白」「解说员」「作者」',
        '3) 输出字段：name、variant_label、role、appearance、personality',
        '4) variant_label 表示该条定妆的时期/形态：如 童年、少年、青年、中年、老年；若全篇只有一个时期则留空或填「常态」',
        '5) 同一主人公若文案出现明显不同人生阶段（回忆、多年后、少年与晚年等），必须拆成多条记录：name 相同，variant_label 不同，appearance 各自独立',
        '6) 第一人称「我」叙述时，name 用「男主」或「女主」，并按青年/中年/老年等阶段拆分 variant_label',
        '7) appearance：中英混合，只写人物外貌与服饰（年龄、性别、发型、服装、体型、标志特征、动作道具）；禁止画风/艺术风格/retro/vintage look/pixel/复古风/Q版/条漫；年代只体现在服装发型（如80年代花衬衫、三七分发型），禁止写 "1980s retro style" 或 "retro hairstyle"，应写 "1980s side-part hairstyle"',
        '8) 示例 appearance：28岁男性个体户，精干结实。\nEnglish tags: 1980s side-part haircut, floral shirt, bell-bottom pants, aviator sunglasses, bicycle',
        '9) 合并同一人物同一时期的称呼，不要重复',
        '只输出 JSON，不要解释。',
      ].join('\n')

      const user = JSON.stringify({
        script: script.slice(0, 12000),
        existing_characters: existing.filter(isVisualCharacter).map(ch => ({
          name: ch.name,
          variant_label: ch.variantLabel || '',
          appearance: ch.appearance,
        })),
        output_format: {
          characters: '[{ name, variant_label, role, appearance, personality }]',
        },
      })

      const text = await callTextChat(system, user, textModel, textThinking)
      const parsed = extractJsonObject(text)
      if (Array.isArray(parsed?.characters)) {
        extracted = parsed.characters
          .map((row: any) => ({
            name: String(row?.name || '').trim(),
            variantLabel: normalizeVariantLabel(row?.variant_label ?? row?.variantLabel),
            role: String(row?.role || '角色').trim(),
            appearance: sanitizeCharacterAppearance(String(row?.appearance || '').trim()),
            personality: String(row?.personality || '').trim(),
          }))
          .filter((row: { name: string }) => row.name && !isNarratorCharacter(row))
        extracted = filterNarrationProtagonistOnly(extracted, script)
      } else {
        logTaskWarn('NarrationChars', 'llm-extract-invalid-json', { preview: text.slice(0, 200) })
      }
  } catch (err: any) {
    logTaskWarn('NarrationChars', 'llm-extract-failed', { error: err.message })
    throw err
  }

  if (extracted.length) {
    extracted = extracted.map(row => ({
      ...row,
      appearance: row.appearance
        ? sanitizeCharacterAppearance(row.appearance).slice(0, 600)
        : '',
    }))
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
  const archived = archiveNonProtagonistCharacters(dramaId, keepNames)
  if (archived) {
    logTaskProgress('NarrationChars', 'archived-non-protagonist', { dramaId, archived, keepNames: [...keepNames] })
  }

  for (const row of extracted) {
    const variantLabel = normalizeVariantLabel(row.variantLabel) || null
    const match = existing.find(ch =>
      ch.name === row.name
      && !ch.deletedAt
      && normalizeVariantLabel(ch.variantLabel) === normalizeVariantLabel(variantLabel),
    )
    if (match) {
      const updates: Record<string, any> = { updatedAt: ts }
      if (row.role && !match.role) updates.role = row.role
      if (variantLabel && match.variantLabel !== variantLabel) updates.variantLabel = variantLabel
      if (row.appearance && (!match.appearance || match.appearance.length < row.appearance.length)) {
        updates.appearance = sanitizeCharacterAppearance(row.appearance)
      }
      if (row.personality && !match.personality) updates.personality = row.personality
      if (Object.keys(updates).length > 1) {
        db.update(schema.characters).set(updates).where(eq(schema.characters.id, match.id)).run()
        updated++
      }
      linkCharacterToEpisode(episodeId, match.id)
    } else {
      const res = db.insert(schema.characters).values({
        dramaId,
        name: row.name,
        role: row.role || '角色',
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

  return { created, updated, archived, characters, linked }
}
