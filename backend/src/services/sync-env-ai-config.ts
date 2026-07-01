import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { normalizeEnvApiKey } from '../utils/load-env-local.js'

const PRESET_SERVICES = [
  { serviceType: 'text', label: '文本', provider: 'chatfire', model: 'deepseek-v4-pro,qwen3.5-plus,gpt-4o', priority: 100 },
  { serviceType: 'image', label: '图片', provider: 'chatfire', model: 'gpt-image-2', priority: 99 },
  { serviceType: 'video', label: '视频', provider: 'vidu', model: 'viduq3-turbo', priority: 98 },
  { serviceType: 'audio', label: '音频', provider: 'minimax', basePath: '/minimax', model: 'speech-2.8-hd', priority: 97 },
  { serviceType: 'music', label: '音乐', provider: 'chatfire', model: 'suno_music_open', priority: 96 },
] as const

function presetModels(model: string): string[] {
  return model.split(',').map(s => s.trim()).filter(Boolean)
}

/** 从 .env.local 的 AI_API_KEY / AI_BASE_URL 同步 AI 服务到数据库 */
export function syncEnvAiConfig(): void {
  const apiKey = normalizeEnvApiKey(process.env.AI_API_KEY || '')
  if (!apiKey) return

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.4022543.xyz').replace(/\/+$/, '')
  const ts = new Date().toISOString()

  for (const preset of PRESET_SERVICES) {
    const presetBaseUrl = 'basePath' in preset && preset.basePath
      ? `${baseUrl}${preset.basePath}`
      : baseUrl

    const existing = preset.serviceType === 'image'
      ? db.select().from(schema.aiServiceConfigs).all()
        .filter(row => row.serviceType === 'image')
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
      : db.select().from(schema.aiServiceConfigs).all()
        .find(row => row.serviceType === preset.serviceType && row.provider === preset.provider)

    const values = {
      serviceType: preset.serviceType,
      provider: preset.provider,
      name: `默认${preset.label}服务`,
      baseUrl: presetBaseUrl,
      apiKey,
      model: JSON.stringify(presetModels(preset.model)),
      priority: preset.priority,
      isActive: true,
      updatedAt: ts,
    }

    if (existing) {
      db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
    } else {
      db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
    }
  }

  logTaskProgress('AIConfig', 'env-ai-config-synced', {
    baseUrl,
    services: PRESET_SERVICES.map(p => `${p.serviceType}:${p.model}`).join(','),
    keyPrefix: `${apiKey.slice(0, 8)}…`,
  })
}
