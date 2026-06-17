import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'

const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')
const db = new Database(path.join(dataRoot, 'huobao_drama.db'))

function probe(file: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(file, (err, m) => resolve(err ? 0 : (m.format.duration || 0)))
  })
}

async function main() {
  const rows = db.prepare(
    'SELECT storyboard_number, tts_audio_url FROM storyboards WHERE episode_id = 101 AND deleted_at IS NULL ORDER BY storyboard_number LIMIT 25',
  ).all() as { storyboard_number: number; tts_audio_url: string }[]

  for (const r of rows) {
    const abs = path.join(dataRoot, r.tts_audio_url.replace(/^static\//, 'static/'))
    const d = await probe(abs)
    const kind = r.tts_audio_url.includes('tts-import') ? 'split' : 'edge'
    console.log(`#${r.storyboard_number} ${d.toFixed(2)}s ${kind} ${r.tts_audio_url}`)
  }
}

main()
