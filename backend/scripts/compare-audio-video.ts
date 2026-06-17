import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'

const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')
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
  const rows = db.prepare(
    'SELECT storyboard_number, composed_video_url, tts_audio_url FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL ORDER BY storyboard_number',
  ).all(episodeId) as { storyboard_number: number; composed_video_url: string; tts_audio_url: string | null }[]

  let audioSum = 0
  let videoSum = 0
  let truncated = 0
  let samples: string[] = []

  for (const sb of rows) {
    const v = await probe(toAbs(sb.composed_video_url))
    const a = sb.tts_audio_url ? await probe(toAbs(sb.tts_audio_url)) : 0
    audioSum += a
    videoSum += v
    if (a - v > 0.3) {
      truncated++
      if (samples.length < 8) {
        samples.push(`#${sb.storyboard_number}: video=${v.toFixed(2)}s audio=${a.toFixed(2)}s`)
      }
    }
  }

  console.log(`clips: ${rows.length}`)
  console.log(`audio sum: ${Math.round(audioSum)}s (${(audioSum / 60).toFixed(1)}min)`)
  console.log(`video sum: ${Math.round(videoSum)}s (${(videoSum / 60).toFixed(1)}min)`)
  console.log(`truncated (audio > video+0.3s): ${truncated}`)
  if (samples.length) console.log('samples:', samples.join('\n  '))
}

main()
