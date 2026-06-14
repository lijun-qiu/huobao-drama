import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env.local')

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(envPath)

const apiKey = process.env.AI_API_KEY?.trim()
const baseUrl = (process.env.AI_BASE_URL || 'https://api.4022543.xyz').replace(/\/+$/, '')

if (!apiKey) {
  console.error('Missing AI_API_KEY in .env.local')
  process.exit(1)
}

const PRESET_SERVICES = [
  { serviceType: 'text', label: '文本', provider: 'chatfire', baseUrl, model: 'gemini-3-pro-preview', priority: 100 },
  { serviceType: 'image', label: '图片', provider: 'chatfire', baseUrl, model: 'doubao-seedream-3-0-t2i-250415', priority: 99 },
  { serviceType: 'video', label: '视频', provider: 'volcengine', baseUrl: `${baseUrl}/volcengine`, model: 'doubao-seedance-1-5-pro-251215', priority: 98 },
  { serviceType: 'audio', label: '音频', provider: 'minimax', baseUrl: `${baseUrl}/minimax`, model: 'speech-2.8-hd', priority: 97 },
] as const

const AGENT_DEFAULTS = [
  { agentType: 'script_rewriter', name: '剧本改写' },
  { agentType: 'extractor', name: '角色场景提取' },
  { agentType: 'storyboard_breaker', name: '分镜拆解' },
  { agentType: 'voice_assigner', name: '音色分配' },
  { agentType: 'grid_prompt_generator', name: '图片提示词生成' },
] as const

const AGENT_MODEL = 'gemini-3-pro-preview'
const ts = new Date().toISOString()

for (const preset of PRESET_SERVICES) {
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
    baseUrl: preset.baseUrl,
    apiKey,
    model: JSON.stringify([preset.model]),
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

for (const agent of AGENT_DEFAULTS) {
  const [existing] = db.select().from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.agentType, agent.agentType)).all()

  const values = {
    name: agent.name,
    model: AGENT_MODEL,
    isActive: true,
    updatedAt: ts,
  }

  if (existing) {
    db.update(schema.agentConfigs).set(values).where(eq(schema.agentConfigs.id, existing.id)).run()
  } else {
    db.insert(schema.agentConfigs).values({
      agentType: agent.agentType,
      description: '',
      model: AGENT_MODEL,
      name: agent.name,
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4096,
      maxIterations: 10,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    }).run()
  }
}

console.log(`AI config seeded with base URL: ${baseUrl}`)
