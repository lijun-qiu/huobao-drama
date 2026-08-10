import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { normalizeEnvApiKey } from '../utils/load-env-local.js'
import {
  DEFAULT_TEXT_MODEL,
  OFFICIAL_DEEPSEEK_V4_FLASH,
  OFFICIAL_DEEPSEEK_V4_PRO,
  OPENROUTER_DEEPSEEK_V4_FLASH,
  OPENROUTER_DEEPSEEK_V4_PRO,
  OPENROUTER_LAGUNA_S_FREE,
  OPENROUTER_LING_FLASH_FREE,
  OPENROUTER_NEMOTRON_SUPER_FREE,
  OPENROUTER_NEMOTRON_ULTRA_FREE,
} from '../constants/text-models.js'

const PRESET_SERVICES = [
  { serviceType: 'text', label: '文本', provider: 'chatfire', model: `${OFFICIAL_DEEPSEEK_V4_FLASH},${OFFICIAL_DEEPSEEK_V4_PRO},${OPENROUTER_LAGUNA_S_FREE},${OPENROUTER_NEMOTRON_ULTRA_FREE},${OPENROUTER_NEMOTRON_SUPER_FREE},${OPENROUTER_DEEPSEEK_V4_FLASH},${OPENROUTER_DEEPSEEK_V4_PRO},qwen3.5-plus,gpt-4o`, priority: 100 },
  { serviceType: 'image', label: '图片', provider: 'chatfire', model: 'gpt-image-2', priority: 99 },
  { serviceType: 'video', label: '视频', provider: 'vidu', model: 'viduq3-turbo', priority: 98 },
  { serviceType: 'audio', label: '音频', provider: 'minimax', basePath: '/minimax', model: 'speech-2.8-hd', priority: 97 },
  { serviceType: 'music', label: '音乐', provider: 'chatfire', model: 'suno_music_open', priority: 96 },
] as const

const OPENROUTER_TEXT_MODELS = [
  OPENROUTER_LAGUNA_S_FREE,
  OPENROUTER_NEMOTRON_ULTRA_FREE,
  OPENROUTER_NEMOTRON_SUPER_FREE,
  OPENROUTER_DEEPSEEK_V4_FLASH,
  OPENROUTER_DEEPSEEK_V4_PRO,
] as const

const OFFICIAL_TEXT_MODELS = [
  OFFICIAL_DEEPSEEK_V4_FLASH,
  OFFICIAL_DEEPSEEK_V4_PRO,
] as const

function presetModels(model: string): string[] {
  return model.split(',').map(s => s.trim()).filter(Boolean)
}

function upsertTextConfig(values: {
  provider: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  priority: number
  isActive: boolean
  updatedAt: string
  createdAt?: string
}) {
  const existing = db.select().from(schema.aiServiceConfigs).all()
    .find(row => row.serviceType === 'text' && String(row.provider || '').toLowerCase() === values.provider.toLowerCase())
  if (existing) {
    db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
    return existing.id
  }
  db.insert(schema.aiServiceConfigs).values({
    ...values,
    serviceType: 'text',
    createdAt: values.createdAt || values.updatedAt,
  }).run()
  return null
}

function syncAgentDefaultModels(model: string): void {
  const ts = new Date().toISOString()
  const rows = db.select().from(schema.agentConfigs).all()
  for (const row of rows) {
    const current = String(row.model || '').trim()
    if (
      !current
      || current === 'deepseek-v4-flash'
      || current === 'deepseek-v4-pro'
      || current === 'deepseek-v4-flash:free'
      || current === 'openrouter/deepseek-v4-flash:free'
      || current === OPENROUTER_DEEPSEEK_V4_FLASH
      || current === OPENROUTER_LING_FLASH_FREE
      || current === OPENROUTER_NEMOTRON_ULTRA_FREE
      || current === 'nvidia/nemotron-3-ultra:free'
      || current === 'nvidia/nemotron-3-ultra-550b:free'
      || current === 'glm-4.7-flash'
      || current === 'glm-4-flash-250414'
    ) {
      db.update(schema.agentConfigs)
        .set({ model, updatedAt: ts })
        .where(eq(schema.agentConfigs.id, row.id))
        .run()
    }
  }
}

function syncOpenRouterText(ts: string): boolean {
  const freeKey = normalizeEnvApiKey(
    process.env.OPENROUTER_API_KEY_FREE
    || process.env.OPENROUTER_API_KEY
    || process.env.AI_API_KEY
    || '',
  )
  const paidKey = normalizeEnvApiKey(process.env.OPENROUTER_API_KEY_PAID || '')
  if (!freeKey && !paidKey) return false

  const preferred = String(process.env.AI_TEXT_MODEL || '').trim() || DEFAULT_TEXT_MODEL
  const models = [
    preferred,
    ...OPENROUTER_TEXT_MODELS.filter(m => m !== preferred),
  ]
  upsertTextConfig({
    provider: 'openrouter',
    name: 'OpenRouter 文本（Laguna 免费 / DeepSeek 付费）',
    baseUrl: 'https://openrouter.ai/api',
    apiKey: freeKey || paidKey,
    model: JSON.stringify(models),
    priority: 110,
    isActive: true,
    updatedAt: ts,
  })
  logTaskProgress('AIConfig', 'env-openrouter-synced', {
    models: models.join(','),
    freeKey: freeKey ? `${freeKey.slice(0, 8)}…` : '',
    paidKey: paidKey ? `${paidKey.slice(0, 8)}…` : '',
  })
  return true
}

function syncOfficialDeepseekText(ts: string): boolean {
  const apiKey = normalizeEnvApiKey(
    process.env.DEEPSEEK_API_KEY
    || process.env.AI_DEEPSEEK_API_KEY
    || '',
  )
  if (!apiKey) return false
  // 若 AI_API_KEY 本身就是 OpenRouter，不要误当成官网 key
  if (/^sk-or-/i.test(apiKey)) return false

  const baseUrl = (
    process.env.DEEPSEEK_BASE_URL
    || 'https://api.deepseek.com'
  ).replace(/\/+$/, '')

  const isMiaofei = /miaofei\.vip/i.test(baseUrl)
  upsertTextConfig({
    provider: 'openai',
    name: isMiaofei ? 'DeepSeek 文本（妙飞网关）' : 'DeepSeek 官网文本',
    baseUrl,
    apiKey,
    model: JSON.stringify([...OFFICIAL_TEXT_MODELS]),
    priority: 108,
    isActive: true,
    updatedAt: ts,
  })
  logTaskProgress('AIConfig', 'env-deepseek-official-synced', {
    baseUrl,
    models: OFFICIAL_TEXT_MODELS.join(','),
    keyPrefix: `${apiKey.slice(0, 8)}…`,
  })
  return true
}

/** 从 .env.local 同步 OpenRouter / DeepSeek 官网等到数据库 */
export function syncEnvAiConfig(): void {
  const ts = new Date().toISOString()
  const syncedOr = syncOpenRouterText(ts)
  const syncedOfficial = syncOfficialDeepseekText(ts)

  if (syncedOr || syncedOfficial) {
    const preferred = String(process.env.AI_TEXT_MODEL || '').trim() || DEFAULT_TEXT_MODEL
    syncAgentDefaultModels(preferred)
    return
  }

  const apiKey = normalizeEnvApiKey(process.env.AI_API_KEY || '')
  if (!apiKey) return

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  const isDeepseekOfficial = /api\.deepseek\.com/i.test(baseUrl) && !/^sk-or-/i.test(apiKey)
  const services = isDeepseekOfficial
    ? PRESET_SERVICES.filter(p => p.serviceType === 'text')
    : PRESET_SERVICES

  for (const preset of services) {
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
      provider: isDeepseekOfficial ? 'openai' : preset.provider,
      name: isDeepseekOfficial ? 'DeepSeek 官网文本' : `默认${preset.label}服务`,
      baseUrl: presetBaseUrl,
      apiKey,
      model: JSON.stringify(presetModels(
        isDeepseekOfficial
          ? OFFICIAL_TEXT_MODELS.join(',')
          : preset.model,
      )),
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
    services: services.map(p => `${p.serviceType}:${p.model}`).join(','),
    keyPrefix: `${apiKey.slice(0, 8)}…`,
  })
}
