import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { normalizeEnvApiKey } from '../utils/load-env-local.js'

const TEXT_MODELS = ['deepseek-v4-pro', 'qwen3.5-plus', 'gpt-4o']

/** 从 .env.local 的 AI_API_KEY / AI_BASE_URL 同步文本服务到数据库 */
export function syncEnvAiConfig(): void {
  const apiKey = normalizeEnvApiKey(process.env.AI_API_KEY || '')
  if (!apiKey) return

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.4022543.xyz').replace(/\/+$/, '')
  const ts = new Date().toISOString()

  const existing = db.select().from(schema.aiServiceConfigs).all()
    .find(row => row.serviceType === 'text' && row.provider === 'chatfire')

  const values = {
    serviceType: 'text' as const,
    provider: 'chatfire',
    name: '默认文本服务',
    baseUrl,
    apiKey,
    model: JSON.stringify(TEXT_MODELS),
    priority: 100,
    isActive: true,
    updatedAt: ts,
  }

  if (existing) {
    db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
  } else {
    db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
  }

  logTaskProgress('AIConfig', 'env-text-config-synced', {
    baseUrl,
    models: TEXT_MODELS.join(','),
    keyPrefix: `${apiKey.slice(0, 8)}…`,
  })
}
