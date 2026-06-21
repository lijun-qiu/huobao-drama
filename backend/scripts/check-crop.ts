import Database from 'better-sqlite3'
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.resolve(__dirname, '../../data/huobao_drama.db'))
const rows = db.prepare(
  'SELECT id, composed_image FROM storyboards WHERE episode_id=103 AND composed_image IS NOT NULL LIMIT 5',
).all() as { id: number; composed_image: string }[]

const storageRoot = path.resolve(__dirname, '../../data/static')

function abs(rel: string) {
  const normalized = rel.replace(/^\//, '')
  if (normalized.startsWith('static/')) return path.join(storageRoot, '..', normalized)
  return path.join(storageRoot, normalized)
}

for (const r of rows) {
  const p = abs(r.composed_image)
  const m = await sharp(p).metadata()
  const ratio = m.height ? (m.height / (m.width || 1)) : 0
  console.log(`sb ${r.id}`, r.composed_image, `${m.width}x${m.height}`, `ratio=${ratio.toFixed(4)}`, m.format)
}

// Expected 16:9 = 0.5625; after crop 8/9 height = 0.5 if was 16:9 before... 
// original 720 height -> crop 640, width 1280 -> ratio 0.5
