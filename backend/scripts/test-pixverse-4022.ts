import { v4 as uuid } from 'uuid'
import { db, schema } from '../src/db/index.js'

async function main() {
  const cfg = db.select().from(schema.aiServiceConfigs).all()
    .filter(r => r.serviceType === 'music' || r.serviceType === 'image')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
  if (!cfg?.apiKey) {
    console.error('no music/image config key')
    process.exit(1)
  }

  const base = cfg.baseUrl.replace(/\/+$/, '')
  const traceId = uuid()
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    'Ai-Trace-Id': traceId,
  }

  const submitUrl = `${base}/openapi/v2/video/sound_effect/generate`
  const body = {
    model: 'pixverse-sound-effect',
    sound_effect_content: 'soft cinematic ambient background, gentle piano, suspense mood, no vocals',
    original_sound_switch: false,
  }

  console.log('POST', submitUrl)
  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  const submitText = await submitResp.text()
  console.log('submit status', submitResp.status)
  console.log(submitText.slice(0, 1200))
  if (!submitResp.ok) process.exit(1)

  let videoId = ''
  try {
    const json = JSON.parse(submitText)
    const resp = json?.Resp ?? json?.data ?? json
    videoId = String(resp?.video_id ?? resp?.videoId ?? json?.data ?? '')
  } catch {}
  if (!videoId) {
    console.error('no video_id parsed')
    process.exit(1)
  }
  console.log('videoId', videoId)

  const pollUrl = `${base}/openapi/v2/video/result/${videoId}`
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollResp = await fetch(pollUrl, { headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Ai-Trace-Id': traceId }, signal: AbortSignal.timeout(60_000) })
    const pollText = await pollResp.text()
    console.log(`poll ${i + 1}`, pollResp.status, pollText.slice(0, 600))
    try {
      const parsed = JSON.parse(pollText)
      const resp = parsed?.Resp ?? parsed?.data ?? parsed
      const status = Number(resp?.status ?? -1)
      const url = resp?.url || resp?.video_url || resp?.audio_url
      if (status === 1 && url) {
        console.log('DONE url=', url)
        process.exit(0)
      }
      if (status === 7 || status === 8) {
        console.error('FAILED', pollText)
        process.exit(1)
      }
    } catch {}
  }
  console.error('timeout')
  process.exit(1)
}

main()
