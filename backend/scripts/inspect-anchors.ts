import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'

const episodeId = Number(process.argv[2] || 1)
const sbs = db.select().from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId))
  .orderBy(asc(schema.storyboards.storyboardNumber))
  .all()

function line(sb: typeof sbs[number]) {
  const d = String(sb.description || sb.dialogue || '').replace(/^(旁白|剧中)[：:]\s*/, '').trim()
  return d
}

const anchors = sbs.filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new')
console.log('Storyboards:', sbs.length, '| Anchors:', anchors.length)
console.log('')

for (const sb of anchors) {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const idx = sbs.findIndex(s => s.id === sb.id)
  let endIdx = idx
  while (endIdx + 1 < sbs.length && parseNarrationImageMeta(sbs[endIdx + 1].referenceImages).narration_image_mode !== 'new') {
    endIdx++
  }
  const range = idx === endIdx ? `#${String(sb.storyboardNumber).padStart(2, '0')}` : `#${String(sb.storyboardNumber).padStart(2, '0')}-#${String(sbs[endIdx].storyboardNumber).padStart(2, '0')}`
  const lines = sbs.slice(idx, endIdx + 1).map(line)
  console.log(`${range} (${lines.length}镜)`)
  console.log('  场景:', meta.scene_content?.slice(0, 120) || '(无)')
  console.log('  旁白:', lines[0]?.slice(0, 60) + (lines.length > 1 ? ` … +${lines.length - 1}镜` : ''))
  console.log('')
}
