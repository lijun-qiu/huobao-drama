import { asc, eq } from 'drizzle-orm'
import { extractNarrationPromptBracketContents } from '../constants/art-styles.js'
import { db, schema } from '../db/index.js'
import { buildNarrationImageMeta, parseNarrationImageMeta } from './narration-image.js'
import {
  convertClothingColorsToHex,
  convertPromptClothingColorsToHex,
  normalizeOutfitHexCase,
} from '../utils/outfit-hex-colors.js'
import { now } from '../utils/response.js'

const OUTFIT_WEAR_RE = /(?:身穿|身着|穿着|穿戴)([^，,。；;】）]+)/
const OUTFIT_ITEM_RE = /((?:#[0-9a-fA-F]{6}(?:与#[0-9a-fA-F]{6})?|(?:亮|鲜|醒目|深|浅|黑|白|红|蓝|绿|黄|灰|棕|粉|紫|橙|青|米|卡其)[^，,。；;】]{0,8})(?:衬衫|T恤|裤|裙|袄|外套|围裙|便装|卫衣|毛衣|喇叭裤|背心|夹克|工装|校服|西装|家居服|制服|睡衣)(?:与[^，,。；;】]{2,28}(?:裤|衫|裙|外套|帽|轮廓|色块|便装|短裤|长裤))?(?:鲜明|简化)?简笔轮廓)/

/** 只处理主人公片段，避免误改配角「身穿…」 */
function splitProtagonistSubjectPart(subject: string): { head: string; tail: string } {
  const text = String(subject || '').trim()
  const m = text.match(/^([\s\S]*?)([，,]?与(?:几位|一位|两位|三位|四位|五位|多位|若干)[\s\S]*)$/)
  if (m?.[1] && /(?:配角|路人|顾客|群众|配偶|父亲|母亲|老板|店员|老师|同学|儿童|婴儿)/.test(m[2])) {
    return { head: m[1].trim(), tail: m[2] }
  }
  return { head: text, tail: '' }
}

function cleanOutfitText(outfit: string): string {
  let text = normalizeOutfitHexCase(String(outfit || '').trim().replace(/[）)]+$/g, '').trim())
  if (!text) return ''
  text = convertClothingColorsToHex(text)
  if (!/轮廓|色块/.test(text) && /衬衫|T恤|裤|裙|袄|外套|围裙|便装|卫衣|毛衣|帽|制服|家居服|睡衣|背心|夹克/.test(text)) {
    text = `${text}简笔轮廓`
  }
  return text
}

export function extractProtagonistOutfitFromSubject(subject: string): string | null {
  const { head } = splitProtagonistSubjectPart(subject)
  if (!head || !/主人公/.test(head)) return null

  const wear = head.match(OUTFIT_WEAR_RE)
  if (wear?.[1]) {
    const outfit = cleanOutfitText(wear[1])
    return outfit || null
  }

  const item = head.match(OUTFIT_ITEM_RE)
  if (item?.[1]) return cleanOutfitText(item[1])

  return null
}

export function extractProtagonistOutfitFromPrompt(prompt: string): string | null {
  for (const subject of extractNarrationPromptBracketContents(prompt, '画面主体')) {
    const outfit = extractProtagonistOutfitFromSubject(subject)
    if (outfit) return outfit
  }
  return null
}

function normalizeOutfitKey(outfit: string): string {
  return normalizeOutfitHexCase(outfit).replace(/\s/g, '').replace(/鲜明/g, '').replace(/简化/g, '')
}

export function replaceProtagonistOutfitInSubject(subject: string, outfit: string): string {
  const { head, tail } = splitProtagonistSubjectPart(subject)
  const target = cleanOutfitText(outfit)
  if (!head || !target || !/主人公/.test(head)) return subject

  let newHead = head
  if (OUTFIT_WEAR_RE.test(head)) {
    newHead = head.replace(OUTFIT_WEAR_RE, `身穿${target}`)
  } else if (OUTFIT_ITEM_RE.test(head)) {
    newHead = head.replace(OUTFIT_ITEM_RE, target)
  } else {
    const anchor = head.match(/(一位[^，,。；;】]*?主人公[^，,。；;】]{0,48}?(?:正常卡通脸[^，,。；;】]{0,16})?)/)
    if (anchor?.[1]) {
      newHead = head.replace(anchor[1], `${anchor[1]}，身穿${target}`)
    } else {
      const generic = head.match(/(主人公[^，,。；;】]{0,32})/)
      if (generic?.[1]) newHead = head.replace(generic[1], `${generic[1]}，身穿${target}`)
    }
  }

  return `${newHead}${tail}`
}

function pickCanonicalOutfit(subjects: string[]): string | null {
  const outfits = subjects.map(extractProtagonistOutfitFromSubject).filter(Boolean) as string[]
  if (!outfits.length) return null
  const counts = new Map<string, { raw: string; n: number }>()
  for (const outfit of outfits) {
    const key = normalizeOutfitKey(outfit)
    const prev = counts.get(key)
    counts.set(key, { raw: prev?.raw || outfit, n: (prev?.n || 0) + 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.raw || outfits[0]
}

/** 单条配图 prompt 内统一主人公服装（含 diptych 左右格）；不跨配图段延续 */
export function normalizeOutfitInImagePrompt(prompt: string): {
  prompt: string
  outfit: string | null
  changed: boolean
} {
  const raw = String(prompt || '').trim()
  if (!raw) return { prompt: raw, outfit: null, changed: false }

  const subjects = extractNarrationPromptBracketContents(raw, '画面主体')
  if (!subjects.length) return { prompt: raw, outfit: null, changed: false }

  const outfit = pickCanonicalOutfit(subjects)
  if (!outfit) return { prompt: raw, outfit: null, changed: false }

  let changed = false
  let next = raw.replace(/【画面主体[：:]\s*([^】]+)】/g, (_, content: string) => {
    const replaced = replaceProtagonistOutfitInSubject(content.trim(), outfit)
    if (replaced !== content.trim()) changed = true
    return `【画面主体：${replaced}】`
  })

  const extracted = subjects.map(extractProtagonistOutfitFromSubject).filter(Boolean) as string[]
  if (extracted.length > 1 && new Set(extracted.map(normalizeOutfitKey)).size > 1) {
    changed = true
  }

  const hexConverted = convertPromptClothingColorsToHex(next)
  if (hexConverted.changed) {
    next = hexConverted.prompt
    changed = true
  }

  return {
    prompt: next,
    outfit: extractProtagonistOutfitFromPrompt(next),
    changed,
  }
}

function listEpisodeImageAnchors(episodeId: number) {
  return db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
    .filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new')
}

/** 统一本集每条配图 prompt 段内主人公服装（不跨配图段强行延续） */
export function unifyEpisodeParagraphOutfits(
  episodeId: number,
  storyboardIds?: number[],
  options?: { preferLlmRaw?: boolean },
) {
  const idSet = storyboardIds?.length ? new Set(storyboardIds) : null
  const anchors = listEpisodeImageAnchors(episodeId).filter(sb => !idSet || idSet.has(sb.id))
  if (!anchors.length) {
    return { updated: 0, items: [] as Array<Record<string, unknown>> }
  }

  const ts = now()
  const items: Array<Record<string, unknown>> = []
  let updated = 0

  for (const sb of anchors) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const source = options?.preferLlmRaw !== false
      ? String(meta.image_prompt_llm_raw || sb.imagePrompt || '').trim()
      : String(sb.imagePrompt || '').trim()
    if (!source) {
      items.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        skipped: true,
        reason: 'empty_prompt',
      })
      continue
    }

    const { prompt: after, outfit, changed } = normalizeOutfitInImagePrompt(source)
    const before = String(sb.imagePrompt || '').trim()

    if (!changed && after === before) {
      items.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        skipped: true,
        outfit,
        paragraph_index: meta.paragraph_index,
      })
      continue
    }

    const { narration_image_mode, ...restMeta } = meta
    db.update(schema.storyboards)
      .set({
        imagePrompt: after,
        referenceImages: buildNarrationImageMeta(narration_image_mode, {
          ...restMeta,
          image_prompt_source: meta.image_prompt_llm_raw ? 'optimized' : (meta.image_prompt_source || 'optimized'),
          image_prompt_llm_raw: meta.image_prompt_llm_raw || source,
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    updated += 1
    items.push({
      storyboard_id: sb.id,
      storyboard_number: sb.storyboardNumber,
      paragraph_index: meta.paragraph_index,
      outfit,
      before_outfit: extractProtagonistOutfitFromPrompt(before),
      after_outfit: extractProtagonistOutfitFromPrompt(after),
    })
  }

  return { updated, items }
}

/** 将本集配图 prompt 中主人公/配角服装中文色词统一为 #hex */
export function convertEpisodeOutfitColorsToHex(
  episodeId: number,
  storyboardIds?: number[],
) {
  const idSet = storyboardIds?.length ? new Set(storyboardIds) : null
  const anchors = listEpisodeImageAnchors(episodeId).filter(sb => !idSet || idSet.has(sb.id))
  if (!anchors.length) {
    return { updated: 0, items: [] as Array<Record<string, unknown>> }
  }

  const ts = now()
  const items: Array<Record<string, unknown>> = []
  let updated = 0

  for (const sb of anchors) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const before = String(sb.imagePrompt || '').trim()
    if (!before) {
      items.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        skipped: true,
        reason: 'empty_prompt',
      })
      continue
    }

    const unified = normalizeOutfitInImagePrompt(before)
    const hexOnly = convertPromptClothingColorsToHex(unified.prompt)
    const after = hexOnly.prompt
    if (!unified.changed && !hexOnly.changed && after === before) {
      items.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        skipped: true,
        outfit: unified.outfit,
        paragraph_index: meta.paragraph_index,
      })
      continue
    }

    const { narration_image_mode, ...restMeta } = meta
    db.update(schema.storyboards)
      .set({
        imagePrompt: after,
        referenceImages: buildNarrationImageMeta(narration_image_mode, {
          ...restMeta,
          image_prompt_source: meta.image_prompt_llm_raw ? 'optimized' : (meta.image_prompt_source || 'optimized'),
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    updated += 1
    items.push({
      storyboard_id: sb.id,
      storyboard_number: sb.storyboardNumber,
      paragraph_index: meta.paragraph_index,
      before_outfit: extractProtagonistOutfitFromPrompt(before),
      after_outfit: extractProtagonistOutfitFromPrompt(after),
    })
  }

  return { updated, items }
}
