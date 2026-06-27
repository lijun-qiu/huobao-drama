import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  extractProtagonistOutfitFromPrompt,
  extractProtagonistOutfitFromSubject,
  normalizeOutfitInImagePrompt,
} from '../src/services/narration-outfit-continuity.js'
import { extractNarrationPromptBracketContents } from '../src/constants/art-styles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.resolve(__dirname, '../../data/huobao_drama.db'))

const episodeId = Number(process.argv[2] || 108)

type Row = {
  id: number
  storyboard_number: number
  image_prompt: string | null
  reference_images: string | null
}

const rows = db.prepare(`
  SELECT id, storyboard_number, image_prompt, reference_images
  FROM storyboards
  WHERE episode_id = ?
  ORDER BY storyboard_number
`).all(episodeId) as Row[]

function parseMeta(raw: string | null) {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as {
      narration_image_mode?: string
      paragraph_index?: number
      paragraph_layout?: string
    }
  } catch {
    return {}
  }
}

const anchors = rows.filter(r => parseMeta(r.reference_images).narration_image_mode === 'new')

let internalMismatch = 0
let stillNeedFix = 0
const mismatchSamples: Array<Record<string, unknown>> = []
const outfitByParagraph = new Map<number, Set<string>>()

for (const sb of anchors) {
  const prompt = String(sb.image_prompt || '').trim()
  if (!prompt) continue

  const meta = parseMeta(sb.reference_images)
  const subjects = extractNarrationPromptBracketContents(prompt, '画面主体')
  const outfits = subjects.map(extractProtagonistOutfitFromSubject).filter(Boolean) as string[]
  const keys = new Set(outfits.map(o => o.replace(/\s/g, '')))

  if (meta.paragraph_index != null && outfits.length) {
    const set = outfitByParagraph.get(meta.paragraph_index) ?? new Set<string>()
    for (const o of outfits) set.add(o.replace(/\s/g, ''))
    outfitByParagraph.set(meta.paragraph_index, set)
  }

  if (keys.size > 1) {
    internalMismatch += 1
    if (mismatchSamples.length < 5) {
      mismatchSamples.push({
        storyboard_number: sb.storyboard_number,
        paragraph_index: meta.paragraph_index,
        layout: meta.paragraph_layout,
        outfits,
      })
    }
  }

  const { changed } = normalizeOutfitInImagePrompt(prompt)
  if (changed) stillNeedFix += 1
}

const outfitSummary = [...outfitByParagraph.entries()]
  .filter(([, set]) => set.size > 1)
  .slice(0, 5)
  .map(([paragraphIndex, set]) => ({ paragraph_index: paragraphIndex, outfits: [...set] }))

console.log(JSON.stringify({
  episodeId,
  anchor_count: anchors.length,
  with_prompt: anchors.filter(r => r.image_prompt?.trim()).length,
  internal_prompt_mismatch: internalMismatch,
  would_still_need_fix: stillNeedFix,
  mismatch_samples: mismatchSamples,
  paragraph_with_multiple_outfits: outfitSummary,
  unique_outfits: [...new Set(anchors.map(sb => extractProtagonistOutfitFromPrompt(String(sb.image_prompt || ''))).filter(Boolean))],
  timeline_samples: [1, 19, 54, 79, 93, 117, 139, 163].map(n => {
    const sb = anchors.find(r => r.storyboard_number === n)
    if (!sb) return null
    const meta = parseMeta(sb.reference_images)
    return {
      storyboard_number: n,
      paragraph_index: meta.paragraph_index,
      outfit: extractProtagonistOutfitFromPrompt(String(sb.image_prompt || '')),
    }
  }).filter(Boolean),
  sample_outfits: anchors.slice(0, 12).map(sb => ({
    n: sb.storyboard_number,
    p: parseMeta(sb.reference_images).paragraph_index,
    outfit: extractProtagonistOutfitFromPrompt(String(sb.image_prompt || '')),
  })),
}, null, 2))
