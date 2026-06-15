import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const db = new Database(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/huobao_drama.db'))
const episodeId = 101
const rows = db.prepare(
  `SELECT status, COUNT(*) c FROM storyboards
   WHERE episode_id=? AND deleted_at IS NULL AND (composed_video_url IS NULL OR composed_video_url='')
   GROUP BY status`,
).all(episodeId)
console.log('uncomposed by status:', rows)
console.log('all statuses:', db.prepare(
  `SELECT status, COUNT(*) c FROM storyboards WHERE episode_id=? AND deleted_at IS NULL GROUP BY status`,
).all(episodeId))
console.log('uncomposed total:', db.prepare(
  `SELECT COUNT(*) c FROM storyboards WHERE episode_id=? AND deleted_at IS NULL AND (composed_video_url IS NULL OR composed_video_url='')`,
).get(episodeId))
