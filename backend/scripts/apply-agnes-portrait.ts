/**
 * 写入 Agnes 定妆图片配置并探测 API
 */
import { loadEnvLocal } from '../src/utils/load-env-local.js'
import { applyEnvHttpProxy } from '../src/utils/apply-env-http-proxy.js'

loadEnvLocal()
await applyEnvHttpProxy()

const { eq } = await import('drizzle-orm')
const { db, schema } = await import('../src/db/index.js')
const { LOCAL_COMIC_ENV } = await import('../src/constants/local-comic.js')
const { ensureAgnesImageConfig, resolveImageGenerationConfig } = await import('../src/services/ai.js')
const { resolvePortraitImageModel } = await import('../src/services/narration-characters.js')
const { AgnesImageAdapter } = await import('../src/services/adapters/agnes-image.js')

const apiKey = process.env.AGNES_API_KEY || LOCAL_COMIC_ENV.agnesApiKey
if (!apiKey) {
  console.error('缺少 AGNES_API_KEY')
  process.exit(1)
}

const ts = new Date().toISOString()
const model = LOCAL_COMIC_ENV.agnesPortraitModel || 'agnes-image-2.1-flash'

const existing = db.select().from(schema.aiServiceConfigs).all()
  .find(r => r.serviceType === 'image' && String(r.provider).toLowerCase() === 'agnes')

const values = {
  serviceType: 'image',
  provider: 'agnes',
  name: '定妆 Agnes Image 服务',
  baseUrl: LOCAL_COMIC_ENV.agnesBaseUrl,
  apiKey,
  model: JSON.stringify([model, 'agnes-image-2.1-flash', 'agnes-image-2.0-flash', 'agnes-image-2.0']),
  priority: 125,
  isActive: true,
  updatedAt: ts,
}

if (existing) {
  db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
  console.log('updated agnes image id=', existing.id)
} else {
  db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
  console.log('inserted agnes image')
}

const portraitModel = resolvePortraitImageModel('cogview-3-flash')
const cfg = resolveImageGenerationConfig({ model: portraitModel })
console.log('portrait resolve:', { portraitModel, provider: cfg.provider, model: cfg.model, base: cfg.baseUrl, key: cfg.apiKey.slice(0, 10) })

const adapter = new AgnesImageAdapter()
const req = adapter.buildGenerateRequest(cfg, {
  id: 0,
  model: portraitModel,
  prompt: 'anime character portrait, young woman, white background, clean line art, cel shading',
  size: '1024x1024',
})
console.log('request', { url: req.url, body: JSON.stringify(req.body).slice(0, 200) })
console.log('OK ensureAgnes', ensureAgnesImageConfig(portraitModel).model)

try {
  const resp = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(90_000),
  })
  const text = await resp.text()
  console.log('status', resp.status)
  console.log('body', text.slice(0, 500))
  if (!resp.ok) {
    console.warn('Agnes API 探测失败（配置已写入 DB，可稍后重试）')
    process.exit(0)
  }
  const parsed = adapter.parseGenerateResponse(JSON.parse(text))
  console.log('parsed', parsed)
} catch (err) {
  console.warn('Agnes API 网络不可达（配置已写入 DB）:', err instanceof Error ? err.message : err)
  process.exit(0)
}
