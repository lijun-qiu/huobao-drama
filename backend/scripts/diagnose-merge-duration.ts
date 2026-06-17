import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'
import { resolveStoryboardVisualSource, sortStoryboardsByOrder } from '../src/services/narration-image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataRoot = path.resolve(__dirname, '../../data')
const db = new Database(path.join(dataRoot, 'huobao_drama.db'))
const episodeId = Number(process.argv[2] || 101)

function probe(file: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(file, (err, m) => resolve(err ? 0 : (m.format.duration || 0)))
  })
}

function toAbs(rel: string) {
  return path.join(dataRoot, rel.replace(/^static\//, 'static/'))
}

async function main() {
  const merges = db.prepare(
    'SELECT id, duration, merged_url, created_at FROM video_merges WHERE episode_id = ? AND status = ? ORDER BY id DESC LIMIT 3',
  ).all(episodeId, 'completed') as { id: number; duration: number; merged_url: string; created_at: string }[]

  for (const m of merges) {
    const abs = toAbs(m.merged_url)
    const actual = fs.existsSync(abs) ? await probe(abs) : 0
    console.log(`merge ${m.id}: db=${m.duration}s ffprobe=${Math.round(actual)}s (${(actual / 60).toFixed(1)}min)`)
  }

  const rows = db.prepare(
    'SELECT id, storyboard_number, composed_video_url, reference_images, video_url, composed_image, first_frame_image FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL',
  ).all(episodeId) as Array<{
    id: number
    storyboard_number: number
    composed_video_url: string
    reference_images: string | null
    video_url: string | null
    composed_image: string | null
    first_frame_image: string | null
  }>

  const ordered = sortStoryboardsByOrder(rows)
  let clipSum = 0
  let zeroDuration = 0
  for (const sb of ordered) {
    const d = await probe(toAbs(sb.composed_video_url))
    clipSum += d
    if (d <= 0) zeroDuration++
  }

  // visual groups (same logic as merge)
  const groups: { count: number; duration: number }[] = []
  let prevKey = ''
  for (const sb of ordered) {
    const visual = resolveStoryboardVisualSource(ordered, sb.id)
    const key = visual ? `${visual.type}:${visual.path}` : `none:${sb.id}`
    const d = await probe(toAbs(sb.composed_video_url))
    if (!groups.length || key !== prevKey) {
      groups.push({ count: 1, duration: d })
      prevKey = key
    } else {
      groups[groups.length - 1].count++
      groups[groups.length - 1].duration += d
    }
  }

  const groupDurationSum = groups.reduce((s, g) => s + g.duration, 0)
  const transitionLoss = (groups.length - 1) * 0.45

  console.log(`\nepisode ${episodeId}:`)
  console.log(`  clips: ${ordered.length}, zero-duration: ${zeroDuration}`)
  console.log(`  clip sum: ${Math.round(clipSum)}s (${(clipSum / 60).toFixed(1)}min)`)
  console.log(`  visual groups: ${groups.length}`)
  console.log(`  group duration sum: ${Math.round(groupDurationSum)}s`)
  console.log(`  expected after xfade: ~${Math.round(groupDurationSum - transitionLoss)}s (${((groupDurationSum - transitionLoss) / 60).toFixed(1)}min)`)
  console.log(`  multi-shot groups: ${groups.filter(g => g.count > 1).length}`)
  console.log(`  max group size: ${Math.max(...groups.map(g => g.count))}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
