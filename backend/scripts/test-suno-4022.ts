import { db, schema } from '../src/db/index.js'

async function main() {
  const cfg = db.select().from(schema.aiServiceConfigs).all()
    .filter(r => r.serviceType === 'image')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
  if (!cfg?.apiKey) {
    console.error('no image config key')
    process.exit(1)
  }
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  }

  const submitUrl = `${base}/suno/submit/music`
  const body = {
    mv: 'chirp-v3-5',
    gpt_description_prompt: 'light cinematic instrumental background music, warm piano and soft strings, no vocals, 60 seconds',
    make_instrumental: true,
  }
  console.log('POST', submitUrl)
  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const submitText = await submitResp.text()
  console.log('submit status', submitResp.status)
  console.log(submitText.slice(0, 1000))

  if (!submitResp.ok) process.exit(1)

  let taskId = ''
  try {
    const json = JSON.parse(submitText)
    taskId = json?.data?.task_id || json?.data?.taskId || json?.task_id || json?.taskId || json?.data || ''
    if (typeof taskId === 'object') taskId = taskId.task_id || taskId.taskId || taskId.jobId || ''
  } catch {}
  if (!taskId) {
    console.error('no task id parsed')
    process.exit(1)
  }
  console.log('taskId', taskId)

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 6000))
    const fetchUrl = `${base}/suno/fetch/${taskId}`
    const fetchResp = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(60_000) })
    const fetchText = await fetchResp.text()
    console.log(`poll ${i + 1}`, fetchResp.status, fetchText.slice(0, 500))
    try {
      const parsed = JSON.parse(fetchText)
      const data = parsed?.data ?? parsed
      const status = String(data?.status || data?.task_status || data?.taskStatus || '').toUpperCase()
      if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'FINISHED'].includes(status)) {
        console.log('DONE', JSON.stringify(data?.data || data, null, 2).slice(0, 1500))
        process.exit(0)
      }
      if (status === 'FAILURE' || status === 'FAILED' || status === 'ERROR') {
        console.error('FAILED', fetchText)
        process.exit(1)
      }
    } catch {}
  }
  console.error('timeout')
  process.exit(1)
}

main()
