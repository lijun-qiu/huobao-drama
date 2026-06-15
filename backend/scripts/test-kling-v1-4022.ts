import { db, schema } from '../src/db/index.js'
import { KlingImageAdapter } from '../src/services/adapters/kling-image.js'
import { readImageAsCompressedDataUrl } from '../src/utils/storage.js'

const [cfg] = db.select().from(schema.aiServiceConfigs).all().filter(c => c.serviceType === 'image')
if (!cfg?.apiKey) {
  console.error('No image config')
  process.exit(1)
}

const adapter = new KlingImageAdapter()
const config = {
  provider: cfg.provider,
  baseUrl: cfg.baseUrl,
  apiKey: cfg.apiKey,
  model: 'kling-v1',
}

async function call(label: string, referenceImages: string | null) {
  const req = adapter.buildGenerateRequest(config as any, {
    id: 0,
    model: 'kling-v1',
    prompt: 'modern Chinese webtoon character portrait, young man, red shirt, no text',
    size: '1920x1080',
    referenceImages,
  } as any)
  console.log(`\n=== ${label} ===`)
  console.log('url:', req.url)
  console.log('has image_reference:', 'image_reference' in (req.body as object))
  console.log('image prefix:', typeof (req.body as any).image === 'string'
    ? (req.body as any).image.slice(0, 20)
    : 'none')

  const resp = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await resp.text()
  console.log('status:', resp.status)
  console.log('body:', text.slice(0, 500))
}

const dataUrl = await readImageAsCompressedDataUrl('static/images/c0fec018-105b-4c96-9b5b-5b68137f32a4.png')
await call('t2i only', null)
await call('i2i v1', JSON.stringify([dataUrl]))
