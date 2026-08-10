/**
 * AI 服务抽象层 — 从数据库配置中获取 provider 和 API key
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { joinProviderUrl } from './adapters/url.js'
import { now } from '../utils/response.js'
import { LOCAL_COMIC_ENV, LOCAL_PRESET_SERVICES } from '../constants/local-comic.js'
import {
  DEFAULT_TEXT_MODEL,
  isLocalOllamaTextModel,
  normalizeTextModelId,
  resolveLocalEpisodeTextModel,
  resolveOllamaRunnableTextModel,
  resolveOpenRouterApiKeyForModel,
  resolveProviderTextModel,
  resolveTextModelChannel,
} from '../constants/text-models.js'

export type ServiceType = 'text' | 'image' | 'video' | 'audio' | 'music'

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export function parseModelField(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    const single = String(parsed || '').trim()
    return single ? [single] : []
  } catch {
    logTaskWarn('AIConfig', 'model-json-invalid', { raw: String(raw).slice(0, 80) })
    const fallback = String(raw).replace(/[\[\]"\\]/g, ' ').trim().split(/\s+/).filter(Boolean)[0]
    return fallback ? [fallback] : []
  }
}

export function getTextProviderBaseUrl(config: AIConfig) {
  const provider = config.provider.toLowerCase()

  if (provider === 'openai' || provider === 'openrouter' || provider === 'chatfire' || provider === 'deepseek') {
    return joinProviderUrl(config.baseUrl, '/v1', '')
  }

  if (provider === 'volcengine') {
    return joinProviderUrl(config.baseUrl, '/api/v3', '')
  }

  if (provider === 'ali') {
    return joinProviderUrl(config.baseUrl, '/api/v1', '')
  }

  // 智谱 OpenAI 兼容：base 已是 /api/paas/v4，勿再拼 /v1
  if (provider === 'zhipu' || provider === 'bigmodel' || provider === 'zai') {
    return joinProviderUrl(config.baseUrl || LOCAL_COMIC_ENV.zhipuBaseUrl, '', '')
  }

  if (provider === 'ollama') {
    return joinProviderUrl(config.baseUrl, '', '')
  }

  return config.baseUrl
}

function listActiveTextRows() {
  return db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'text'))
    .all()
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
}

function rowToTextConfig(row: typeof schema.aiServiceConfigs.$inferSelect, appModel?: string): AIConfig {
  const models = parseModelField(row.model)
  const provider = String(row.provider || '').toLowerCase()
  const chosenApp = normalizeTextModelId(appModel) || normalizeTextModelId(models[0]) || ''
  const apiModel = resolveProviderTextModel(provider, chosenApp)
  let apiKey = row.apiKey || ''
  if (provider === 'openrouter') {
    apiKey = resolveOpenRouterApiKeyForModel(chosenApp, apiKey)
      || resolveOpenRouterApiKeyForModel(apiModel, apiKey)
  } else if (provider === 'zhipu' || provider === 'bigmodel' || provider === 'zai') {
    apiKey = apiKey || LOCAL_COMIC_ENV.zhipuApiKey || ''
  }
  return {
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey,
    model: apiModel,
  }
}

function pickTextRowForChannel(
  channel: ReturnType<typeof resolveTextModelChannel>,
  appModel?: string,
) {
  const rows = listActiveTextRows()
  if (!rows.length) return null
  if (channel === 'openrouter') {
    return rows.find(r => String(r.provider || '').toLowerCase() === 'openrouter') || rows[0]
  }
  if (channel === 'deepseek') {
    return rows.find((r) => {
      const p = String(r.provider || '').toLowerCase()
      const url = String(r.baseUrl || '').toLowerCase()
      if (p === 'deepseek') return true
      if ((p === 'openai' || p === 'chatfire') && (
        url.includes('deepseek.com')
        || url.includes('4022543')
        || url.includes('chatfire')
        || url.includes('miaofei.vip')
      )) {
        return true
      }
      return false
    }) || rows.find(r => ['openai', 'chatfire', 'deepseek'].includes(String(r.provider || '').toLowerCase())) || rows[0]
  }
  if (channel === 'zhipu') {
    return rows.find(r => ['zhipu', 'bigmodel', 'zai'].includes(String(r.provider || '').toLowerCase())) || rows[0]
  }
  if (channel === 'ollama') {
    return rows.find(r => String(r.provider || '').toLowerCase() === 'ollama') || null
  }
  if (appModel) {
    const listed = rows.find(r => parseModelField(r.model).includes(appModel))
    if (listed) return listed
    if (appModel.startsWith('qwen') || appModel.startsWith('gpt-')) {
      return rows.find(r => String(r.provider || '').toLowerCase() === 'chatfire') || rows[0]
    }
  }
  return rows[0]
}

export function getActiveConfig(serviceType: ServiceType): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
    .all()
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0)) // 高优先级优先

  const active = rows[0]
  if (!active) {
    logTaskWarn('AIConfig', 'active-config-missing', { serviceType })
    return null
  }

  const models = parseModelField(active.model)
  const normalizedModel = normalizeTextModelId(models[0]) || models[0] || ''
  logTaskProgress('AIConfig', 'active-config-selected', {
    serviceType,
    configId: active.id,
    provider: active.provider,
    model: normalizedModel,
    priority: active.priority,
  })
  return {
    provider: active.provider || '',
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: normalizedModel,
  }
}

export function textConfigRequiresApiKey(config: AIConfig): boolean {
  return config.provider.toLowerCase() !== 'ollama'
}

export function assertTextConfigReady(config: AIConfig): void {
  if (!textConfigRequiresApiKey(config)) return
  if (!config.apiKey?.trim()) {
    throw new Error('请先在「设置 → AI 服务」中配置并启用文本 API（如 ChatFire + deepseek-v4-flash），并填写 API Key')
  }
}

/** Ollama 等本地 provider 无需 API Key；云端 provider 需已填写 Key */
export function textConfigHasCredentials(config: AIConfig): boolean {
  if (!textConfigRequiresApiKey(config)) return true
  return Boolean(config.apiKey?.trim())
}

export function assertTextConfigHasCredentials(config: AIConfig, context?: string): void {
  if (textConfigHasCredentials(config)) return
  const suffix = context ? `，${context}` : ''
  throw new Error(`未配置文本模型 API Key${suffix}`)
}

export function getOllamaTextConfig(modelOverride?: string | null): AIConfig {
  const override = String(modelOverride || '').trim()
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'text'))
    .all()
    .filter(r => String(r.provider || '').toLowerCase() === 'ollama')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const row = rows.find(r => r.isActive) || rows[0]
  if (row) {
    const models = parseModelField(row.model)
    return {
      provider: 'ollama',
      baseUrl: row.baseUrl,
      apiKey: row.apiKey || '',
      model: override || models[0] || LOCAL_COMIC_ENV.ollamaTextModel,
    }
  }
  return {
    provider: 'ollama',
    baseUrl: `${LOCAL_COMIC_ENV.ollamaBaseUrl}/v1`,
    apiKey: '',
    model: override || LOCAL_COMIC_ENV.ollamaTextModel,
  }
}

export function getTextConfig(modelOverride?: string | null): AIConfig {
  const override = normalizeTextModelId(String(modelOverride || '').trim())
  const channel = resolveTextModelChannel(override || DEFAULT_TEXT_MODEL)

  if (channel === 'ollama') {
    if (override && isLocalOllamaTextModel(override)) return getOllamaTextConfig(override)
    if (override) return getOllamaTextConfig(resolveOllamaRunnableTextModel(override))
    return getOllamaTextConfig(resolveLocalEpisodeTextModel())
  }

  const row = pickTextRowForChannel(channel, override || undefined) || listActiveTextRows()[0]
  if (!row) throw new Error('No active text AI config')

  const appModel = override
    || parseModelField(row.model)[0]
    || LOCAL_COMIC_ENV.zhipuTextModel
  const config = rowToTextConfig(row, appModel)
  logTaskProgress('AIConfig', 'text-config-resolved', {
    channel,
    provider: config.provider,
    appModel,
    apiModel: config.model,
    baseUrl: config.baseUrl,
  })
  return config
}

export function getAudioConfig(): AIConfig {
  const config = getActiveConfig('audio')
  if (!config) throw new Error('No active audio AI config — 请在设置中添加音频服务')
  return config
}

export function getAudioConfigById(id?: number | null): AIConfig {
  if (id) {
    const config = getConfigById(id)
    if (config) return config
  }
  return getAudioConfig()
}

export function getMusicConfigById(id?: number | null): AIConfig {
  if (id) {
    const config = getConfigById(id)
    if (config) return config
  }
  const music = getActiveConfig('music')
  if (music) return music
  const image = getActiveConfig('image')
  if (image) return image
  throw new Error('No active music AI config')
}

const LOCAL_COMFY_IMAGE_MODELS = new Set([
  'qwen_image_edit_q3',
  'qwen_image_edit_q4',
  'qwen_image_edit',
  'kolors',
  'wan_i2v',
  'wan_i2v_fusionx',
  'wan_flf2v',
])

export function isLocalComfyImageModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return false
  if (LOCAL_COMFY_IMAGE_MODELS.has(m)) return true
  return m.startsWith('sdxl_') || m.startsWith('wan_') || m.startsWith('flux') || m.startsWith('qwen_image')
}

export function getComfyUIImageConfig(): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'image'))
    .all()
    .filter(r => String(r.provider || '').toLowerCase() === 'comfyui')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const active = rows.find(r => r.isActive) || rows[0]
  if (!active) return null
  const models = parseModelField(active.model)
  return {
    provider: active.provider || 'comfyui',
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: models[0] || 'kolors',
  }
}

export function getZhipuImageConfig(): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'image'))
    .all()
    .filter(r => {
      const p = String(r.provider || '').toLowerCase()
      return p === 'zhipu' || p === 'bigmodel' || p === 'zai'
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const active = rows.find(r => r.isActive) || rows[0]
  if (!active) return null
  const models = parseModelField(active.model)
  return {
    provider: 'zhipu',
    baseUrl: active.baseUrl || LOCAL_COMIC_ENV.zhipuBaseUrl,
    apiKey: active.apiKey || LOCAL_COMIC_ENV.zhipuApiKey || '',
    model: models[0] || LOCAL_COMIC_ENV.zhipuImageModel,
  }
}

export function getZhipuVideoConfig(): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'video'))
    .all()
    .filter(r => {
      const p = String(r.provider || '').toLowerCase()
      return p === 'zhipu' || p === 'bigmodel' || p === 'zai'
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const active = rows.find(r => r.isActive) || rows[0]
  if (!active) return null
  const models = parseModelField(active.model)
  return {
    provider: 'zhipu',
    baseUrl: active.baseUrl || LOCAL_COMIC_ENV.zhipuBaseUrl,
    apiKey: active.apiKey || LOCAL_COMIC_ENV.zhipuApiKey || '',
    model: models[0] || LOCAL_COMIC_ENV.zhipuVideoModel,
  }
}

/** SDXL/Wan 生图前自动补全 ComfyUI 配置（可选本地回退，不依赖 local-preset 是否含 comfyui） */
export function ensureComfyUIImageConfig(): AIConfig {
  const existing = getComfyUIImageConfig()
  if (existing) {
    const row = db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.serviceType, 'image'))
      .all()
      .find(r => String(r.provider || '').toLowerCase() === 'comfyui')
    if (row && !row.isActive) {
      db.update(schema.aiServiceConfigs)
        .set({ isActive: true, updatedAt: now() })
        .where(eq(schema.aiServiceConfigs.id, row.id))
        .run()
      logTaskProgress('AIConfig', 'comfyui-image-reactivated', { configId: row.id })
    }
    return existing
  }

  const ts = now()
  const values = {
    serviceType: 'image',
    provider: 'comfyui',
    name: '本地短剧图片服务（ComfyUI）',
    baseUrl: LOCAL_COMIC_ENV.comfyBaseUrl,
    apiKey: '',
    model: JSON.stringify(['qwen_image_edit_q3', 'qwen_image_edit_q4', 'kolors']),
    priority: 90,
    isActive: true,
    updatedAt: ts,
  }
  db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
  logTaskProgress('AIConfig', 'comfyui-image-auto-provisioned', { baseUrl: LOCAL_COMIC_ENV.comfyBaseUrl })

  const created = getComfyUIImageConfig()
  if (!created) throw new Error('ComfyUI 图片配置创建失败')
  return created
}

export function ensureZhipuImageConfig(modelOverride?: string | null): AIConfig {
  const existing = getZhipuImageConfig()
  const model = String(modelOverride || '').trim() || LOCAL_COMIC_ENV.zhipuImageModel
  if (existing) {
    return {
      ...existing,
      apiKey: existing.apiKey || LOCAL_COMIC_ENV.zhipuApiKey || '',
      model: model || existing.model,
    }
  }

  const ts = now()
  const values = {
    serviceType: 'image',
    provider: 'zhipu',
    name: '本地短剧图片服务',
    baseUrl: LOCAL_COMIC_ENV.zhipuBaseUrl,
    apiKey: LOCAL_COMIC_ENV.zhipuApiKey || '',
    model: JSON.stringify([LOCAL_COMIC_ENV.zhipuImageModel, 'cogview-3-flash']),
    priority: 119,
    isActive: true,
    updatedAt: ts,
  }
  db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
  logTaskProgress('AIConfig', 'zhipu-image-auto-provisioned', { model })

  const created = getZhipuImageConfig()
  if (!created) throw new Error('智谱图片配置创建失败')
  return { ...created, model }
}

export function ensureZhipuVideoConfig(modelOverride?: string | null): AIConfig {
  const existing = getZhipuVideoConfig()
  const model = String(modelOverride || '').trim() || LOCAL_COMIC_ENV.zhipuVideoModel
  if (existing) {
    return {
      ...existing,
      apiKey: existing.apiKey || LOCAL_COMIC_ENV.zhipuApiKey || '',
      model: model || existing.model,
    }
  }

  const ts = now()
  const values = {
    serviceType: 'video',
    provider: 'zhipu',
    name: '本地短剧视频服务',
    baseUrl: LOCAL_COMIC_ENV.zhipuBaseUrl,
    apiKey: LOCAL_COMIC_ENV.zhipuApiKey || '',
    model: JSON.stringify([LOCAL_COMIC_ENV.zhipuVideoModel, 'cogvideox-flash']),
    priority: 118,
    isActive: true,
    updatedAt: ts,
  }
  db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
  logTaskProgress('AIConfig', 'zhipu-video-auto-provisioned', { model })

  const created = getZhipuVideoConfig()
  if (!created) throw new Error('智谱视频配置创建失败')
  return { ...created, model }
}

export function getAgnesImageConfig(): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'image'))
    .all()
    .filter(r => String(r.provider || '').toLowerCase() === 'agnes')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const active = rows.find(r => r.isActive) || rows[0]
  if (!active) return null
  const models = parseModelField(active.model)
  return {
    provider: 'agnes',
    baseUrl: active.baseUrl || LOCAL_COMIC_ENV.agnesBaseUrl,
    apiKey: active.apiKey || LOCAL_COMIC_ENV.agnesApiKey || '',
    model: models[0] || LOCAL_COMIC_ENV.agnesPortraitModel,
  }
}

export function ensureAgnesImageConfig(modelOverride?: string | null): AIConfig {
  const model = String(modelOverride || '').trim() || LOCAL_COMIC_ENV.agnesPortraitModel
  const existing = getAgnesImageConfig()
  if (existing) {
    return {
      ...existing,
      apiKey: existing.apiKey || LOCAL_COMIC_ENV.agnesApiKey || '',
      model: model || existing.model,
    }
  }

  const ts = now()
  const values = {
    serviceType: 'image',
    provider: 'agnes',
    name: '定妆 Agnes Image 服务',
    baseUrl: LOCAL_COMIC_ENV.agnesBaseUrl,
    apiKey: LOCAL_COMIC_ENV.agnesApiKey || '',
    model: JSON.stringify([LOCAL_COMIC_ENV.agnesPortraitModel, 'agnes-image-2.1-flash', 'agnes-image-2.0-flash', 'agnes-image-2.0']),
    priority: 125,
    isActive: true,
    updatedAt: ts,
  }
  db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
  logTaskProgress('AIConfig', 'agnes-image-auto-provisioned', { model })

  return ensureAgnesImageConfig(model)
}

/** 视频复用 Agnes 图配置的 baseUrl/apiKey，模型改为 agnes-video-* */
export function ensureAgnesVideoConfig(modelOverride?: string | null): AIConfig {
  const model = String(modelOverride || '').trim() || 'agnes-video-v2.0'
  const imageCfg = ensureAgnesImageConfig()
  return {
    provider: 'agnes',
    baseUrl: imageCfg.baseUrl || LOCAL_COMIC_ENV.agnesBaseUrl,
    apiKey: imageCfg.apiKey || LOCAL_COMIC_ENV.agnesApiKey || '',
    model,
  }
}

/** 生图任务选配置：本地 Comfy 模型走 ComfyUI；CogView 走智谱 */
function looksLikeComfyUiEndpoint(baseUrl?: string | null): boolean {
  const u = String(baseUrl || '').trim().toLowerCase()
  return /:8188(\/|$)/.test(u) || u.includes('/comfyui')
}

function isZhipuImageModelId(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('cogview')
}

function isAgnesImageModelId(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('agnes-image')
}

export function resolveImageGenerationConfig(params: {
  configId?: number | null
  model?: string | null
}): AIConfig {
  const model = String(params.model || '').trim()
  const needsComfy = isLocalComfyImageModel(model)

  if (needsComfy) {
    return ensureComfyUIImageConfig()
  }

  if (isAgnesImageModelId(model)) {
    return ensureAgnesImageConfig(model)
  }

  if (isZhipuImageModelId(model)) {
    return ensureZhipuImageConfig(model)
  }

  if (params.configId) {
    const byId = getConfigById(params.configId)
    if (byId) {
      if (looksLikeComfyUiEndpoint(byId.baseUrl) && String(byId.provider || '').toLowerCase() !== 'comfyui') {
        logTaskWarn('AIConfig', 'comfyui-url-provider-mismatch', {
          configId: params.configId,
          provider: byId.provider,
          baseUrl: byId.baseUrl,
        })
        return ensureComfyUIImageConfig()
      }
      return byId
    }
  }

  const active = getActiveConfig('image')
  if (!active) {
    // 管线默认 Agnes 定妆生图（支持参考图）
    return ensureAgnesImageConfig(model || LOCAL_COMIC_ENV.agnesImageModel)
  }
  if (looksLikeComfyUiEndpoint(active.baseUrl) && String(active.provider || '').toLowerCase() !== 'comfyui') {
    logTaskWarn('AIConfig', 'comfyui-url-provider-mismatch', {
      provider: active.provider,
      baseUrl: active.baseUrl,
    })
    return ensureComfyUIImageConfig()
  }
  return {
    ...active,
    apiKey: active.apiKey || LOCAL_COMIC_ENV.zhipuApiKey || LOCAL_COMIC_ENV.agnesApiKey || '',
    model: model || active.model,
  }
}

export function getConfigById(id: number): AIConfig | null {
  const [row] = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, id)).all()
  if (!row || !row.isActive) {
    logTaskWarn('AIConfig', 'config-by-id-missing', { configId: id })
    return null
  }
  const models = parseModelField(row.model)
  const normalizedModel = normalizeTextModelId(models[0]) || models[0] || ''
  logTaskProgress('AIConfig', 'config-by-id-selected', {
    configId: id,
    provider: row.provider,
    model: normalizedModel,
    serviceType: row.serviceType,
  })
  return {
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: normalizedModel,
  }
}
