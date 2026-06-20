import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { coerceMinimalLLMImagePrompt } from '../src/constants/art-styles.js'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'
import { now } from '../src/utils/response.js'

const episodeId = Number(process.argv[2] || 103)
const patch = process.argv.includes('--patch')

const sbs = db.select({
  id: schema.storyboards.id,
  storyboardNumber: schema.storyboards.storyboardNumber,
  imagePrompt: schema.storyboards.imagePrompt,
  referenceImages: schema.storyboards.referenceImages,
})
  .from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId))
  .orderBy(asc(schema.storyboards.storyboardNumber))
  .all()

const need = sbs.filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new')

const stats = {
  episodeId,
  anchorCount: need.length,
  empty: 0,
  hasBlackBody: 0,
  hasWhiteCrowd: 0,
  hasWhiteProtagonistHint: 0,
  genericStickOnly: 0,
}

const samples = {
  hasBlack: [] as Array<{ n: number | null; preview: string }>,
  noBlack: [] as Array<{ n: number | null; preview: string }>,
  whiteProtagonist: [] as Array<{ n: number | null; preview: string }>,
}

for (const sb of need) {
  let p = String(sb.imagePrompt || '').trim()
  if (patch && p) {
    const next = coerceMinimalLLMImagePrompt(p)
    if (next !== p) {
      db.update(schema.storyboards)
        .set({ imagePrompt: next, updatedAt: now() })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
      p = next
    }
  }
  if (!p) {
    stats.empty++
    continue
  }

  const hasBlack = /黑色素体/.test(p)
  const hasWhiteCrowd = /白色素体/.test(p)
  const hasWhiteProtagonist = /白色圆头|白色素体小人主人公|主人公[^】]{0,40}白色/.test(p)
  const hasGenericOnly = /素体小人/.test(p) && !hasBlack && !hasWhiteCrowd

  if (hasBlack) stats.hasBlackBody++
  if (hasWhiteCrowd) stats.hasWhiteCrowd++
  if (hasWhiteProtagonist) stats.hasWhiteProtagonistHint++
  if (hasGenericOnly) stats.genericStickOnly++

  const item = { n: sb.storyboardNumber, preview: p.slice(0, 400) }
  if (hasBlack && samples.hasBlack.length < 2) samples.hasBlack.push(item)
  if (!hasBlack && samples.noBlack.length < 4) samples.noBlack.push(item)
  if (hasWhiteProtagonist && samples.whiteProtagonist.length < 2) samples.whiteProtagonist.push(item)
}

console.log(JSON.stringify({ stats, samples }, null, 2))
