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
    'SELECT storyboard_number, dialogue, tts_audio_url FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL ORDER BY storyboard_number',
  ).all(episodeId) as { storyboard_number: number; dialogue: string | null; tts_audio_url: string | null }[]

  let short = 0
  let short035 = 0
  for (const sb of rows) {
    const d = sb.tts_audio_url ? await probe(toAbs(sb.tts_audio_url)) : 0
    if (d < 0.5) {
      short++
      if (d >= 0.34 && d <= 0.36) short035++
      if (short <= 10) {
        console.log(`#${sb.storyboard_number} ${d.toFixed(2)}s dialogue=${JSON.stringify((sb.dialogue || '').slice(0, 80))}`)
      }
    }
  }
  console.log(`\nshort tts (<0.5s): ${short}/${rows.length}, exactly ~0.35s: ${short035}`)
}

main()
