import { db, schema } from '../src/db/index.js'
import { resolveImageAdapter } from '../src/services/adapters/registry.js'

const MODELS = ['qwen-image-2.0-2026-03-03', 'qwen-image-edit-2509'] as const
const REF_IMAGE = 'https://picsum.photos/seed/huobao-qwen-ref/768/768'
const TIMEOUT_MS = 120_000

async function testModel(model: string, cfg: { baseUrl: string; apiKey: string; provider: string }, withRef = false) {
  const adapter = resolveImageAdapter(cfg, model)
  const request = adapter.buildGenerateRequest(cfg as any, {
    id: 0,
    model,
    prompt: withRef
      ? 'same person from reference image, cinematic portrait in ancient costume, high quality, no text'
      : 'cinematic portrait of a young woman in red dress, high quality, no text',
    size: '1664x928',
    referenceImages: withRef ? JSON.stringify([REF_IMAGE]) : null,
  })

  console.log(`\n=== ${model}${withRef ? ' +ref' : ''} ===`)
  console.log('adapter:', adapter.provider)
  console.log('url:', request.url)

  const started = Date.now()
  const resp = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await resp.text()
  const elapsed = Date.now() - started

  console.log('status:', resp.status, `(${elapsed}ms)`)
  console.log('body:', text.slice(0, 800))

  if (!resp.ok) return false

  try {
    const json = JSON.parse(text)
    const parsed = adapter.parseGenerateResponse(json)
    console.log('parsed:', parsed)
    return !!(parsed.imageUrl || parsed.taskId)
  } catch (err) {
    console.log('parse error:', (err as Error).message)
    return false
  }
}

async function main() {
  const rows = db.select().from(schema.aiServiceConfigs).all()
    .filter(r => r.serviceType === 'image')
  const cfg = rows.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
  if (!cfg?.apiKey) {
    console.error('No image AI config / API key in database')
    process.exit(1)
  }

  console.log('baseUrl:', cfg.baseUrl)
  console.log('provider:', cfg.provider)

  let ok = 0
  let total = 0
  for (const model of MODELS) {
    for (const withRef of [false, true]) {
      total++
      try {
        if (await testModel(model, cfg, withRef)) ok++
      } catch (err) {
        console.error(`\n=== ${model}${withRef ? ' +ref' : ''} FAILED ===`)
        console.error((err as Error).message)
      }
    }
  }

  console.log(`\nResult: ${ok}/${total} cases OK`)
  process.exit(ok === total ? 0 : 1)
}

main()
