/**
 * 规则清洗本集配图文案：去掉【画面主体】定妆括号内的脸型/发型/身形等，保留表情与（身穿…）。
 * 用法: npx tsx scripts/clean-portrait-identity-prompts.ts [episodeId]
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { stripPortraitStaticIdentityFromImagePromptCn } from '../src/constants/portrait-appearance-spec.js'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'
import { now } from '../src/utils/response.js'

const episodeId = Number(process.argv[2] || 204)
if (!Number.isFinite(episodeId) || episodeId <= 0) {
  console.error('usage: npx tsx scripts/clean-portrait-identity-prompts.ts <episodeId>')
  process.exit(1)
}

const rows = db
  .select()
  .from(schema.storyboards)
  .where(and(eq(schema.storyboards.episodeId, episodeId), isNull(schema.storyboards.deletedAt)))
  .all()
  .filter(sb => String(sb.imagePrompt || '').trim())

let changed = 0
let clearedEn = 0
const samples: Array<{ id: number; before: string; after: string }> = []

for (const sb of rows) {
  const before = String(sb.imagePrompt || '').trim()
  const after = stripPortraitStaticIdentityFromImagePromptCn(before)
  if (after === before) continue

  const meta = parseNarrationImageMeta(sb.referenceImages) as Record<string, unknown>
  if (meta.image_prompt_llm_raw && typeof meta.image_prompt_llm_raw === 'string') {
    meta.image_prompt_llm_raw = stripPortraitStaticIdentityFromImagePromptCn(meta.image_prompt_llm_raw)
  }
  if (meta.flux_prompt_en || meta.flux_prompt_en_at || meta.flux_prompt_en_version) {
    delete meta.flux_prompt_en
    delete meta.flux_prompt_en_at
    delete meta.flux_prompt_en_version
    clearedEn += 1
  }

  db.update(schema.storyboards)
    .set({
      imagePrompt: after,
      referenceImages: JSON.stringify(meta),
      updatedAt: now(),
    })
    .where(eq(schema.storyboards.id, sb.id))
    .run()

  changed += 1
  if (samples.length < 4) {
    const b = before.match(/【画面主体[：:][^】]{0,180}/)?.[0] || before.slice(0, 120)
    const a = after.match(/【画面主体[：:][^】]{0,180}/)?.[0] || after.slice(0, 120)
    samples.push({ id: sb.id, before: b, after: a })
  }
}

console.log(JSON.stringify({
  episodeId,
  scanned: rows.length,
  changed,
  cleared_flux_en: clearedEn,
  samples,
}, null, 2))
