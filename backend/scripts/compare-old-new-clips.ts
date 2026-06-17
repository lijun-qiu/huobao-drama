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

function toAbs(rel: string) {
  return path.join(dataRoot, rel.replace(/^static\//, 'static/'))
}

async function main() {
  const oldScenes = JSON.parse(
    (db.prepare('SELECT scenes FROM video_merges WHERE id = 32').get() as { scenes: string }).scenes,
  ) as string[]

  const rows = db.prepare(
    'SELECT storyboard_number, composed_video_url, tts_audio_url FROM storyboards WHERE episode_id = 101 AND deleted_at IS NULL ORDER BY storyboard_number LIMIT 15',
  ).all() as { storyboard_number: number; composed_video_url: string; tts_audio_url: string | null }[]

  for (let i = 0; i < rows.length; i++) {
    const sb = rows[i]
    const old = await probe(toAbs(oldScenes[i]))
    const neu = await probe(toAbs(sb.composed_video_url))
    const tts = sb.tts_audio_url ? await probe(toAbs(sb.tts_audio_url)) : 0
    console.log(
      `#${sb.storyboard_number}: old=${old.toFixed(2)}s new=${neu.toFixed(2)}s tts=${tts.toFixed(2)}s ratio=${(old / Math.max(tts, 0.01)).toFixed(2)}`,
    )
  }
}

main()
