/**
 * 剧级「小说设定」圣经：大纲 / 世界观 / 主要角色。
 * 存 dramas.metadata.novel_bible，供各集讲解稿与定妆参考。
 */

export interface NovelBibleCharacter {
  name: string
  role?: string
  brief?: string
}

export interface NovelBible {
  outline: string
  setting: string
  main_characters: NovelBibleCharacter[]
  updated_at: string | null
}

export const DEFAULT_NOVEL_BIBLE: NovelBible = {
  outline: '',
  setting: '',
  main_characters: [],
  updated_at: null,
}

const OUTLINE_LLM_MAX = 2_400
const SETTING_LLM_MAX = 800
const CAST_LLM_MAX = 1_200

function parseMetaObject(metadata?: string | Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof metadata === 'object' ? metadata as Record<string, unknown> : null
}

function normalizeCharacter(raw: unknown): NovelBibleCharacter | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = String(o.name || '').trim()
  if (!name) return null
  const role = String(o.role || '').trim()
  const brief = String(o.brief || o.description || '').trim()
  return {
    name,
    ...(role ? { role } : {}),
    ...(brief ? { brief } : {}),
  }
}

export function parseNovelBible(
  metadata?: string | Record<string, unknown> | null,
): NovelBible {
  const root = parseMetaObject(metadata)
  const raw = (root?.novel_bible && typeof root.novel_bible === 'object')
    ? root.novel_bible as Record<string, unknown>
    : null
  if (!raw) return { ...DEFAULT_NOVEL_BIBLE, main_characters: [] }

  const castRaw = raw.main_characters ?? raw.mainCharacters
  const main_characters = Array.isArray(castRaw)
    ? castRaw.map(normalizeCharacter).filter(Boolean) as NovelBibleCharacter[]
    : []
  const updated = raw.updated_at ?? raw.updatedAt
  return {
    outline: String(raw.outline || '').trim(),
    setting: String(raw.setting || '').trim(),
    main_characters,
    updated_at: updated == null || updated === '' ? null : String(updated),
  }
}

export function normalizeNovelBibleInput(body: unknown): Partial<NovelBible> {
  if (!body || typeof body !== 'object') return {}
  const o = body as Record<string, unknown>
  const patch: Partial<NovelBible> = {}
  if (o.outline !== undefined) patch.outline = String(o.outline || '')
  if (o.setting !== undefined) patch.setting = String(o.setting || '')
  if (o.main_characters !== undefined || o.mainCharacters !== undefined) {
    const castRaw = o.main_characters ?? o.mainCharacters
    patch.main_characters = Array.isArray(castRaw)
      ? castRaw.map(normalizeCharacter).filter(Boolean) as NovelBibleCharacter[]
      : []
  }
  return patch
}

/** 合并写入 dramas.metadata.novel_bible，保留其它键 */
export function mergeNovelBible(
  metadata: string | Record<string, unknown> | null | undefined,
  patch: Partial<NovelBible>,
): string {
  const root = parseMetaObject(metadata) || {}
  const prev = parseNovelBible(root)
  const next: NovelBible = {
    outline: patch.outline !== undefined ? String(patch.outline || '') : prev.outline,
    setting: patch.setting !== undefined ? String(patch.setting || '') : prev.setting,
    main_characters: patch.main_characters !== undefined
      ? (Array.isArray(patch.main_characters)
        ? patch.main_characters.map(normalizeCharacter).filter(Boolean) as NovelBibleCharacter[]
        : [])
      : prev.main_characters,
    updated_at: new Date().toISOString(),
  }
  return JSON.stringify({
    ...root,
    novel_bible: next,
  })
}

export function novelBibleHasContent(bible: NovelBible): boolean {
  return !!(
    bible.outline.trim()
    || bible.setting.trim()
    || bible.main_characters.some(c => c.name.trim())
  )
}

function clip(text: string, max: number): string {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max).replace(/[，。；！？、\s]+$/u, '')}…`
}

/** 注入拆镜 / 定妆 LLM 的跨集统一设定块 */
export function formatNovelBibleForLlm(
  metadata?: string | Record<string, unknown> | null,
  options?: { forAppearance?: boolean },
): string {
  const bible = parseNovelBible(metadata)
  if (!novelBibleHasContent(bible)) return ''

  const lines: string[] = [
    '【作品小说设定·跨集统一】',
    '本集原文拆镜与定妆须与下列整本设定一致；勿另造主要角色外貌或人设矛盾。',
  ]
  if (bible.outline.trim()) {
    lines.push('', '【作品大纲】', clip(bible.outline, OUTLINE_LLM_MAX))
  }
  if (bible.setting.trim()) {
    lines.push('', '【世界观/时代/基调】', clip(bible.setting, SETTING_LLM_MAX))
  }
  if (bible.main_characters.length) {
    lines.push('', '【主要角色】')
    const castLines = bible.main_characters.map((c, i) => {
      const bits = [`${i + 1}. ${c.name}`]
      if (c.role) bits.push(`定位：${c.role}`)
      if (c.brief) bits.push(c.brief)
      return bits.join(' · ')
    })
    lines.push(clip(castLines.join('\n'), CAST_LLM_MAX))
  }
  if (options?.forAppearance) {
    lines.push('', '定妆外貌须贴合上述角色简介与作品基调，禁止写成无关路人模板。')
  }
  return lines.filter((l, i) => !(l === '' && lines[i - 1] === '')).join('\n')
}

/** 取圣经中与角色名匹配的条目 */
export function findNovelBibleCharacter(
  metadata: string | Record<string, unknown> | null | undefined,
  characterName: string,
): NovelBibleCharacter | null {
  const name = String(characterName || '').trim()
  if (!name) return null
  const bible = parseNovelBible(metadata)
  return bible.main_characters.find(c => c.name === name)
    || bible.main_characters.find(c => name.includes(c.name) || c.name.includes(name))
    || null
}

export function formatNovelBibleCharacterBriefForLlm(
  metadata: string | Record<string, unknown> | null | undefined,
  characterName: string,
): string {
  const hit = findNovelBibleCharacter(metadata, characterName)
  if (!hit) return ''
  const bits = [
    `【小说设定·本角色】${hit.name}`,
    hit.role ? `定位：${hit.role}` : '',
    hit.brief ? `简介：${clip(hit.brief, 400)}` : '',
  ].filter(Boolean)
  return bits.join('\n')
}
