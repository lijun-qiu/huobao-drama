/**
 * 一键：文本/生图/视频切到智谱免费模型，并写入 API Key
 */
import { loadEnvLocal } from '../src/utils/load-env-local.js'

loadEnvLocal()

const { eq } = await import('drizzle-orm')
const { db, schema } = await import('../src/db/index.js')
const { LOCAL_COMIC_ENV, LOCAL_PRESET_SERVICES } = await import('../src/constants/local-comic.js')

const apiKey = process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY || LOCAL_COMIC_ENV.zhipuApiKey
if (!apiKey) {
  console.error('缺少 ZHIPU_API_KEY（请写入 .env.local）')
  process.exit(1)
}

const ts = new Date().toISOString()

for (const preset of LOCAL_PRESET_SERVICES) {
  const existing = db.select().from(schema.aiServiceConfigs).all()
    .find(row => row.serviceType === preset.serviceType && row.provider === preset.provider)

  const isZhipu = String(preset.provider).toLowerCase() === 'zhipu'
  const values = {
    serviceType: preset.serviceType,
    provider: preset.provider,
    name: `本地短剧${preset.label}服务`,
    baseUrl: preset.baseUrl,
    apiKey: isZhipu ? apiKey : '',
    model: JSON.stringify(
      preset.serviceType === 'text'
        ? [LOCAL_COMIC_ENV.zhipuTextModel, 'glm-4.7-flash', 'glm-4-flash-250414']
        : preset.model.split(',').map(s => s.trim()).filter(Boolean),
    ),
    priority: preset.priority,
    isActive: true,
    updatedAt: ts,
  }

  if (existing) {
    db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
    console.log(`updated ${preset.serviceType}:${preset.provider} id=${existing.id}`)
  } else {
    db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
    console.log(`inserted ${preset.serviceType}:${preset.provider}`)
  }
}

for (const row of db.select().from(schema.aiServiceConfigs).all()) {
  const provider = String(row.provider || '').toLowerCase()
  if (row.serviceType === 'text' && provider === 'ollama' && row.isActive) {
    db.update(schema.aiServiceConfigs)
      .set({ isActive: false, updatedAt: ts })
      .where(eq(schema.aiServiceConfigs.id, row.id))
      .run()
    console.log(`deactivated text:ollama id=${row.id}`)
  }
}

const agentModel = LOCAL_COMIC_ENV.zhipuAgentModel
for (const agentType of ['script_rewriter', 'extractor', 'storyboard_breaker', 'voice_assigner', 'grid_prompt_generator']) {
  const [existing] = db.select().from(schema.agentConfigs).where(eq(schema.agentConfigs.agentType, agentType)).all()
  if (existing) {
    db.update(schema.agentConfigs).set({ model: agentModel, isActive: true, updatedAt: ts })
      .where(eq(schema.agentConfigs.id, existing.id)).run()
  }
}

// 旧 episode：Ollama 文本 / Qwen-Edit 生图 → 智谱免费
let textN = 0
let imageN = 0
for (const ep of db.select().from(schema.episodes).all()) {
  const tm = String(ep.textModel || '')
  const im = String(ep.imageModel || '')
  const patch: Record<string, string> = { updatedAt: ts }
  let changed = false
  if (tm.includes(':') && !tm.startsWith('glm-')) {
    patch.textModel = LOCAL_COMIC_ENV.zhipuTextModel
    textN++
    changed = true
  }
  if (
    im.startsWith('qwen_image')
    || im === 'kolors'
    || im.startsWith('flux')
    || im.startsWith('sdxl_')
    || !im.trim()
  ) {
    patch.imageModel = LOCAL_COMIC_ENV.zhipuImageModel
    imageN++
    changed = true
  }
  if (changed) {
    db.update(schema.episodes).set(patch).where(eq(schema.episodes.id, ep.id)).run()
  }
}
console.log(`migrated episodes text=${textN} image=${imageN}`)

console.log('OK', {
  text: LOCAL_COMIC_ENV.zhipuTextModel,
  image: LOCAL_COMIC_ENV.zhipuImageModel,
  video: LOCAL_COMIC_ENV.zhipuVideoModel,
  keyPrefix: `${apiKey.slice(0, 8)}…`,
})
