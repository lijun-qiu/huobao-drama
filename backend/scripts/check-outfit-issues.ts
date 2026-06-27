import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  extractProtagonistOutfitFromPrompt,
  extractProtagonistOutfitFromSubject,
  normalizeOutfitInImagePrompt,
} from '../src/services/narration-outfit-continuity.js'
import { convertPromptClothingColorsToHex, outfitUsesHexColors } from '../src/utils/outfit-hex-colors.js'
import { extractNarrationPromptBracketContents } from '../src/constants/art-styles.js'

const episodeId = Number(process.argv[2] || 108)
const db = new Database(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/huobao_drama.db'))

type Row = {
  id: number
  storyboard_number: number
  image_prompt: string | null
  reference_images: string | null
}

function parseMeta(raw: string | null) {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as { narration_image_mode?: string; paragraph_index?: number }
  } catch {
    return {}
  }
}

const rows = db.prepare(`
  SELECT id, storyboard_number, image_prompt, reference_images
  FROM storyboards WHERE episode_id = ?
  ORDER BY storyboard_number
`).all(episodeId) as Row[]

const anchors = rows.filter(r => parseMeta(r.reference_images).narration_image_mode === 'new')

/** 主人公服装片段内仍含中文色词（排除「白色素体」等形体描述） */
const CN_COLOR_IN_WEAR_RE =
  /(?:身穿|身着|穿着|穿戴)([^，,。；;】）]+)/

const CN_COLOR_WORD_RE =
  /(?:^|[^#])(?:亮|深|浅|鲜|醒目)?(?:红|蓝|绿|黄|白|黑|灰|橙|紫|青|米|卡其|棕)(?:色)?(?=[^0-9a-fA-F]|$)/

const issues: Array<Record<string, unknown>> = []

for (const sb of anchors) {
  const prompt = String(sb.image_prompt || '').trim()
  if (!prompt) {
    issues.push({ type: 'empty_prompt', storyboard_number: sb.storyboard_number })
    continue
  }

  const meta = parseMeta(sb.reference_images)
  const subjects = extractNarrationPromptBracketContents(prompt, '画面主体')
  const outfits = subjects.map(extractProtagonistOutfitFromSubject).filter(Boolean) as string[]
  const outfitKeys = new Set(outfits.map(o => o.replace(/\s/g, '')))

  if (outfitKeys.size > 1) {
    issues.push({
      type: 'internal_outfit_mismatch',
      storyboard_number: sb.storyboard_number,
      paragraph_index: meta.paragraph_index,
      outfits,
    })
  }

  for (const subject of subjects) {
    if (!/主人公/.test(subject)) continue
    const wear = subject.match(CN_COLOR_IN_WEAR_RE)
    if (wear?.[1]) {
      const wearText = wear[1].replace(/白色素体/g, '').replace(/正常卡通脸/g, '')
      if (CN_COLOR_WORD_RE.test(wearText) && !outfitUsesHexColors(wearText)) {
        issues.push({
          type: 'cn_color_in_protagonist_wear',
          storyboard_number: sb.storyboard_number,
          wear: wear[0].slice(0, 80),
        })
      }
    }
    if (/T\s+恤/.test(subject)) {
      issues.push({ type: 't_shirt_spacing', storyboard_number: sb.storyboard_number })
    }
    if (/）与(?:几位|一位|两位|三位|四位|五位)/.test(subject) && !/[，,]与(?:几位|一位|两位|三位|四位|五位)/.test(subject)) {
      issues.push({
        type: 'protagonist_supporting_paren_glued',
        storyboard_number: sb.storyboard_number,
        snippet: subject.slice(0, 120),
      })
    }
  }

  const outfit = extractProtagonistOutfitFromPrompt(prompt)
  if (outfit && (/配角|素体小人配角/.test(outfit) || outfit.length > 80)) {
    issues.push({
      type: 'corrupted_outfit_extract',
      storyboard_number: sb.storyboard_number,
      outfit: outfit.slice(0, 100),
    })
  }

  const { changed: needUnify } = normalizeOutfitInImagePrompt(prompt)
  const { changed: needHex } = convertPromptClothingColorsToHex(prompt)
  if (needUnify || needHex) {
    issues.push({
      type: 'still_needs_postprocess',
      storyboard_number: sb.storyboard_number,
      need_unify: needUnify,
      need_hex: needHex,
    })
  }

  // 配角「穿…」仍用中文色词
  for (const subject of subjects) {
    const supportWear = subject.matchAll(/(?<![身])穿([^，,。；;】）]+)/g)
    for (const m of supportWear) {
      const clause = m[1]
      if (/主人公/.test(subject.slice(0, m.index))) continue
      if (/低饱和|便装|校服|西装|制服/.test(clause) && CN_COLOR_WORD_RE.test(clause) && !outfitUsesHexColors(clause)) {
        issues.push({
          type: 'cn_color_in_support_wear',
          storyboard_number: sb.storyboard_number,
          wear: `穿${clause}`.slice(0, 60),
        })
      }
    }
  }
}

// 段内多种服装
const byParagraph = new Map<number, Set<string>>()
for (const sb of anchors) {
  const meta = parseMeta(sb.reference_images)
  const p = meta.paragraph_index
  if (p == null) continue
  const outfit = extractProtagonistOutfitFromPrompt(String(sb.image_prompt || ''))
  if (!outfit) continue
  const set = byParagraph.get(p) ?? new Set<string>()
  set.add(outfit.replace(/\s/g, ''))
  byParagraph.set(p, set)
}
const paragraphMulti = [...byParagraph.entries()].filter(([, s]) => s.size > 1)

console.log(JSON.stringify({
  episodeId,
  anchor_count: anchors.length,
  issue_count: issues.length,
  issues_by_type: Object.fromEntries(
    [...issues.reduce((m, i) => {
      const t = String(i.type)
      m.set(t, (m.get(t) ?? 0) + 1)
      return m
    }, new Map<string, number>())],
  ),
  paragraph_multi_outfit: paragraphMulti.map(([p, s]) => ({ paragraph_index: p, outfits: [...s] })),
  samples: issues.slice(0, 15),
}, null, 2))
