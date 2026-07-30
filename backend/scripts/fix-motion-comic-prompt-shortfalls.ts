/**
 * 补齐漫画解说配图短板：回写 description，并清掉偏短/站姿壳/情绪远站弱文案后触发补全。
 * npx tsx scripts/fix-motion-comic-prompt-shortfalls.ts --episode 306 [--rewrite]
 */
import { asc, eq } from 'drizzle-orm'
import { loadEnvLocal } from '../src/utils/load-env-local.js'
import { db, schema } from '../src/db/index.js'
import { resolveEpisodeVisualStyle } from '../src/constants/art-styles.js'
import {
  deriveMotionComicShotMetaFromImagePrompt,
  isMotionComicEmotionWithoutCloseupPrompt,
  isMotionComicStandPoseShellPrompt,
  MOTION_COMIC_IMAGE_PROMPT_MIN_LEN,
  resolveStoryboardNarrationText,
} from '../src/constants/motion-comic.js'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'
import { retryMissingNarrationImagePrompts } from '../src/services/narration-image-breakdown.js'
import { now } from '../src/utils/response.js'

loadEnvLocal()

const episodeId = Number(process.argv.find((a, i) => process.argv[i - 1] === '--episode') || 0)
const doRewrite = process.argv.includes('--rewrite')
if (!episodeId) {
  console.error('Usage: npx tsx scripts/fix-motion-comic-prompt-shortfalls.ts --episode <id> [--rewrite]')
  process.exit(1)
}

const ep = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).get()
if (!ep) {
  console.error('episode not found', episodeId)
  process.exit(1)
}

const rows = db.select().from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId))
  .orderBy(asc(schema.storyboards.storyboardNumber))
  .all()
  .filter(sb => !sb.deletedAt)

const withPrompt = rows.filter(sb => String(sb.imagePrompt || '').trim().length > 20)
const ts = now()
let synced = 0
const weakIds: number[] = []
const weakReasons = new Map<number, string[]>()

for (const sb of withPrompt) {
  const prompt = String(sb.imagePrompt || '').trim()
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const narrLines = meta.image_narration_lines?.length
    ? meta.image_narration_lines
    : meta.narration_lines?.length
      ? meta.narration_lines
      : [resolveStoryboardNarrationText(sb)].filter(Boolean)

  const derived = deriveMotionComicShotMetaFromImagePrompt(prompt)
  // 有配图文案时一律回写 description / 景别，避免旧占位或脏抽取残留
  db.update(schema.storyboards)
    .set({
      description: derived.description,
      location: derived.location,
      shotType: derived.shotType,
      angle: derived.angle,
      movement: derived.movement,
      action: derived.expressionAction,
      updatedAt: ts,
    })
    .where(eq(schema.storyboards.id, sb.id))
    .run()
  synced++

  const reasons: string[] = []
  if (prompt.length < MOTION_COMIC_IMAGE_PROMPT_MIN_LEN) reasons.push(`short(${prompt.length})`)
  if (isMotionComicStandPoseShellPrompt(prompt, narrLines)) reasons.push('stand_shell')
  if (isMotionComicEmotionWithoutCloseupPrompt(prompt, narrLines)) reasons.push('emotion_far')
  // 误用通用 comic 六维壳（非国漫整段）
  if (/【画风规格】/.test(prompt) || /comic illustration,\s*bold lines/i.test(prompt)) {
    reasons.push('wrong_style_shell')
  }
  if (reasons.length) {
    weakIds.push(sb.id)
    weakReasons.set(sb.id, reasons)
  }
}

console.log(JSON.stringify({
  episodeId,
  title: ep.title,
  prompts: withPrompt.length,
  description_synced: synced,
  weak: weakIds.length,
  weak_sample: [...weakReasons.entries()].slice(0, 12).map(([id, reasons]) => {
    const sb = withPrompt.find(r => r.id === id)
    return { id, sb: sb?.storyboardNumber, reasons, len: String(sb?.imagePrompt || '').length }
  }),
}, null, 2))

if (!doRewrite) {
  console.log('Dry-run done. Re-run with --rewrite to clear weak prompts and regenerate.')
  process.exit(0)
}

if (!weakIds.length) {
  console.log('No weak prompts to rewrite.')
  process.exit(0)
}

for (const id of weakIds) {
  db.update(schema.storyboards)
    .set({ imagePrompt: null, updatedAt: now() })
    .where(eq(schema.storyboards.id, id))
    .run()
}
console.log(`Cleared ${weakIds.length} weak prompts; starting retryMissing…`)

const style = resolveEpisodeVisualStyle(episodeId, {
  imageStyle: (ep as { imageStyle?: string | null }).imageStyle,
  dramaStyle: undefined,
})
console.log('using style:', style)

await retryMissingNarrationImagePrompts(episodeId, style, {
  onProgress: (p) => {
    if (p.message) console.log(`[${p.percent ?? ''}] ${p.message}`)
  },
})

const after = db.select().from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId))
  .all()
  .filter(sb => !sb.deletedAt && String(sb.imagePrompt || '').trim())

let stillWeak = 0
let placeholderDesc = 0
for (const sb of after) {
  const prompt = String(sb.imagePrompt || '').trim()
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const narrLines = meta.image_narration_lines?.length
    ? meta.image_narration_lines
    : meta.narration_lines || []
  if (
    prompt.length < MOTION_COMIC_IMAGE_PROMPT_MIN_LEN
    || isMotionComicStandPoseShellPrompt(prompt, narrLines)
    || isMotionComicEmotionWithoutCloseupPrompt(prompt, narrLines)
    || /【画风规格】/.test(prompt)
    || /comic illustration,\s*bold lines/i.test(prompt)
  ) stillWeak++
  if (/未指定场景/.test(String(sb.description || ''))) placeholderDesc++
}

console.log(JSON.stringify({
  done: true,
  prompts_after: after.length,
  still_weak: stillWeak,
  placeholder_desc: placeholderDesc,
}, null, 2))
