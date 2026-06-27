import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'

const episodeId = Number(process.argv[2] || 108)
const db = new Database(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/huobao_drama.db'))

type Row = { storyboard_number: number; image_prompt: string | null; reference_images: string | null }

const rows = db.prepare(`
  SELECT storyboard_number, image_prompt, reference_images
  FROM storyboards WHERE episode_id = ? ORDER BY storyboard_number
`).all(episodeId) as Row[]

const anchors = rows.filter(r => parseNarrationImageMeta(r.reference_images).narration_image_mode === 'new')

let rawHasCnColor = 0
let promptHasCnColor = 0
let rawPromptDiff = 0
let hexSpaceAfter = 0
let supportLowSatNoHex = 0
let missingContour = 0

const cnInWear = /(?:身穿|穿)[^】]{0,100}(?:亮|深|浅|鲜)?(?:黄|蓝|白|黑|灰|红|绿|橙|紫|卡其|棕)(?:色)?[^#]{0,12}(?:T恤|衬衫|裤|制服|便装|家居服|睡衣|背心|围裙)/

for (const sb of anchors) {
  const meta = parseNarrationImageMeta(sb.reference_images)
  const prompt = String(sb.image_prompt || '')
  const raw = String(meta.image_prompt_llm_raw || '')

  if (cnInWear.test(prompt)) promptHasCnColor++
  if (raw && cnInWear.test(raw)) rawHasCnColor++
  if (raw && raw.trim() !== prompt.trim()) rawPromptDiff++

  if (/#[0-9a-f]{6}\s+[T恤衬衫裤]/.test(prompt)) hexSpaceAfter++
  if (/穿低饱和/.test(prompt) && !/穿#[0-9a-f]{6}低饱和/.test(prompt)) supportLowSatNoHex++
  if (/身穿[^】]{0,80}/.test(prompt)) {
    const wear = prompt.match(/身穿[^，,】]{0,80}/)?.[0] || ''
    if (wear && !/简笔轮廓/.test(wear) && /T恤|衬衫|裤|制服|家居服|睡衣|背心|围裙|运动服|外套|休闲装/.test(wear)) {
      missingContour++
    }
  }
}

console.log(JSON.stringify({
  episodeId,
  anchor_count: anchors.length,
  prompt_with_cn_color_in_wear: promptHasCnColor,
  llm_raw_with_cn_color_in_wear: rawHasCnColor,
  llm_raw_differs_from_current_prompt: rawPromptDiff,
  hex_space_before_garment: hexSpaceAfter,
  support_low_sat_without_hex: supportLowSatNoHex,
  protagonist_wear_missing_contour: missingContour,
  sample_raw_cn: anchors.filter(sb => {
    const raw = String(parseNarrationImageMeta(sb.reference_images).image_prompt_llm_raw || '')
    return cnInWear.test(raw)
  }).slice(0, 3).map(sb => ({
    n: sb.storyboard_number,
    wear: String(parseNarrationImageMeta(sb.reference_images).image_prompt_llm_raw).match(/身穿[^，,】]{0,50}/)?.[0],
  })),
}, null, 2))
