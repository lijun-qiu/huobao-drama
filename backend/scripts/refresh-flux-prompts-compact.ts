/**
 * 压缩集内中文配图文案并清除 flux 英文缓存（触发 v14 重译）
 * npx tsx scripts/refresh-flux-prompts-compact.ts --episode 204
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { compressFluxChinesePrompt } from '../src/constants/flux-prompt-compact.js'
import { now } from '../src/utils/response.js'

const episodeId = Number(process.argv.find((a, i) => process.argv[i - 1] === '--episode') || 0)
if (!episodeId) {
  console.error('Usage: npx tsx scripts/refresh-flux-prompts-compact.ts --episode <id>')
  process.exit(1)
}

const rows = db.select().from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId)).all()
  .filter(sb => !sb.deletedAt && sb.imagePrompt?.trim())

let cnUpdated = 0
let enCleared = 0
for (const sb of rows) {
  const oldCn = String(sb.imagePrompt || '').trim()
  const newCn = compressFluxChinesePrompt(oldCn)
  let ref = sb.referenceImages
  try {
    const meta = ref ? JSON.parse(ref) as Record<string, unknown> : {}
    if (meta.flux_prompt_en) {
      delete meta.flux_prompt_en
      delete meta.flux_prompt_en_at
      delete meta.flux_prompt_en_version
      ref = JSON.stringify(meta)
      enCleared++
    }
  } catch {
    // ignore
  }
  const patch: Record<string, unknown> = { updatedAt: now() }
  if (newCn !== oldCn) {
    patch.imagePrompt = newCn
    cnUpdated++
  }
  if (ref !== sb.referenceImages) patch.referenceImages = ref
  if (Object.keys(patch).length > 1) {
    db.update(schema.storyboards).set(patch).where(eq(schema.storyboards.id, sb.id)).run()
  }
}

console.log(JSON.stringify({ episodeId, total: rows.length, cnUpdated, enCleared }, null, 2))
