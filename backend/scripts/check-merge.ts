import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.resolve(__dirname, '../../data/huobao_drama.db'))

const episodeId = Number(process.argv[2] || 101)

const merges = db.prepare(
  'SELECT id, status, error_msg, merged_url, created_at, completed_at FROM video_merges WHERE episode_id = ? ORDER BY id DESC LIMIT 8',
).all(episodeId)
console.log('recent merges:', merges)

const sb = db.prepare(
  `SELECT COUNT(*) AS total,
   SUM(CASE WHEN composed_video_url IS NOT NULL AND composed_video_url != '' THEN 1 ELSE 0 END) AS composed
   FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL`,
).get(episodeId) as { total: number; composed: number }
console.log('storyboards:', sb)

const missing = db.prepare(
  `SELECT id, storyboard_number, composed_video_url
   FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL
   AND (composed_video_url IS NULL OR composed_video_url = '')
   LIMIT 10`,
).all(episodeId)
console.log('missing composed count sample:', missing.length, missing)

const composedPaths = db.prepare(
  `SELECT composed_video_url FROM storyboards
   WHERE episode_id = ? AND deleted_at IS NULL AND composed_video_url IS NOT NULL AND composed_video_url != ''`,
).all(episodeId) as { composed_video_url: string }[]

const root = path.resolve(__dirname, '../../data')
let missingFiles = 0
for (const row of composedPaths.slice(0, 20)) {
  const abs = path.join(root, row.composed_video_url.replace(/^static\//, 'static/'))
  if (!fs.existsSync(abs)) {
    missingFiles++
    if (missingFiles <= 3) console.log('missing file:', abs)
  }
}
console.log('sample missing files (first 20 checked):', missingFiles)
