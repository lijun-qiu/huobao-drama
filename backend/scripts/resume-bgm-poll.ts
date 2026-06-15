import { db, schema } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import { getMusicConfig } from '../src/services/bgm-generation.js'
import { buildSunoPollRequest, parseSunoPollResponse } from '../src/services/adapters/suno-music.js'

async function pollOnce(taskId: string) {
  const config = getMusicConfig()
  const poll = buildSunoPollRequest(config, taskId)
  const resp = await fetch(poll.url, { method: poll.method, headers: poll.headers, signal: AbortSignal.timeout(60_000) })
  const text = await resp.text()
  console.log('status', resp.status)
  console.log(text.slice(0, 800))
  if (!resp.ok) return
  try {
    const parsed = parseSunoPollResponse(JSON.parse(text))
    console.log('parsed', parsed.status, 'tracks', parsed.tracks.length, parsed.error || '')
  } catch (e) {
    console.log('parse error', (e as Error).message)
  }
}

async function main() {
  const rows = db.select().from(schema.musicGenerations).all().filter(r => r.status === 'processing' && r.taskId)
  console.log('processing rows', rows.length)
  for (const row of rows) {
    console.log('\n--- id', row.id, 'taskId', row.taskId, 'updated', row.updatedAt)
    await pollOnce(String(row.taskId))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
