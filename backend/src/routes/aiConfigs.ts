import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { parseModelField } from '../services/ai.js'
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { LOCAL_PRESET_SERVICES, LOCAL_COMIC_ENV } from '../constants/local-comic.js'

const app = new Hono()

const HUOBAO_PRESET_SERVICES = [
  { serviceType: 'text', label: '文本', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api', model: 'poolside/laguna-s-2.1:free,nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/deepseek-v4-flash,openrouter/deepseek-v4-pro', priority: 110 },
  { serviceType: 'image', label: '图片', provider: 'chatfire', baseUrl: 'https://api.4022543.xyz', model: 'gpt-image-2', priority: 99 },
  { serviceType: 'video', label: '视频', provider: 'vidu', baseUrl: 'https://api.4022543.xyz', model: 'viduq3-turbo', priority: 98 },
  { serviceType: 'audio', label: '音频', provider: 'minimax', baseUrl: 'https://api.4022543.xyz/minimax', model: 'speech-2.8-hd', priority: 97 },
  { serviceType: 'music', label: '音乐', provider: 'chatfire', baseUrl: 'https://api.4022543.xyz', model: 'suno_music_open', priority: 96 },
] as const

const HUOBAO_AGENT_DEFAULTS = [
  { agentType: 'script_rewriter', name: '剧本改写' },
  { agentType: 'extractor', name: '角色场景提取' },
  { agentType: 'storyboard_breaker', name: '分镜拆解' },
  { agentType: 'voice_assigner', name: '音色分配' },
  { agentType: 'grid_prompt_generator', name: '图片提示词生成' },
] as const

const HUOBAO_AGENT_MODEL = 'deepseek-v4-flash'

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function viduHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Token ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function buildProbe(serviceType: string, provider: string, baseUrl: string, model?: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const m = model || ''

  if (p === 'gemini') {
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${m || 'gemini-2.5-flash'}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return { method: 'POST', url: url.toString(), headers: geminiHeaders(apiKey, true), body: {} }
  }

  if (p === 'openai' || p === 'openrouter' || p === 'chatfire') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'zhipu' || p === 'bigmodel' || p === 'zai') {
    if (serviceType === 'image') {
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '', '/images/generations'),
        headers: bearerHeaders(apiKey, true),
        body: {
          model: m || 'cogview-3-flash',
          prompt: 'probe',
          size: '1024x1024',
        },
      }
    }
    if (serviceType === 'video') {
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '', '/videos/generations'),
        headers: bearerHeaders(apiKey, true),
        body: {
          model: m || 'cogvideox-flash',
          prompt: 'probe',
          size: '1344x768',
          fps: 30,
        },
      }
    }
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '', '/chat/completions'),
      headers: bearerHeaders(apiKey, true),
      body: {
        model: m || 'glm-4.7-flash',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        thinking: { type: 'disabled' },
      },
    }
  }

  if (p === 'agnes') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '', '/images/generations'),
      headers: bearerHeaders(apiKey, true),
      body: {
        model: m || 'agnes-image-2.1-flash',
        prompt: 'probe character portrait anime',
        size: '1024x1024',
        extra_body: { response_format: 'url' },
      },
    }
  }

  if (p === 'ali') {
    const isQwenImage = String(m || '').toLowerCase().startsWith('qwen-image')
    const imagePath = isQwenImage
      ? '/services/aigc/multimodal-generation/generation'
      : '/services/aigc/image-generation/generation'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', serviceType === 'video'
        ? '/services/aigc/video-generation/video-synthesis'
        : imagePath),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    const path = serviceType === 'audio'
      ? '/t2a_v2'
      : serviceType === 'video'
        ? '/video_generation'
        : '/image_generation'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v1', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'vidu') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '', '/ent/v2/img2video'),
      headers: viduHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'kling') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/kling/v1', '/images/generations'),
      headers: bearerHeaders(apiKey, true),
      body: {
        model_name: m || 'gpt-image-2',
        prompt: 'probe',
        n: 1,
        aspect_ratio: '16:9',
      },
    }
  }

  if (p === 'ollama') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'comfyui') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '', '/system_stats'),
      headers: {},
      body: undefined,
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

// GET /ai-configs?service_type=text
app.get('/', async (c) => {
  const serviceType = c.req.query('service_type')
  let rows = db.select().from(schema.aiServiceConfigs).all()
  if (serviceType) rows = rows.filter(r => r.serviceType === serviceType)

  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    model: parseModelField(r.model),
  }))
  return success(c, parsed)
})

// POST /ai-configs
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()

  // 验证必填字段
  if (!body.service_type || !body.provider) {
    return badRequest(c, 'service_type and provider are required')
  }

  const res = db.insert(schema.aiServiceConfigs).values({
    serviceType: body.service_type,
    provider: body.provider,
    name: body.name || `${body.provider}-${body.service_type}`,
    baseUrl: body.base_url || '',
    apiKey: body.api_key || '',
    model: JSON.stringify(body.model || []),
    priority: body.priority || 0,
    isActive: true,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const [row] = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, Number(res.lastInsertRowid))).all()

  return created(c, {
    ...toSnakeCase(row),
    model: parseModelField(row.model),
  })
})

// POST /ai-configs/huobao-preset
app.post('/huobao-preset', async (c) => {
  const body = await c.req.json()
  const apiKey = String(body.api_key || '').trim()
  if (!apiKey) return badRequest(c, 'api_key is required')

  const ts = now()

  for (const preset of HUOBAO_PRESET_SERVICES) {
    const existing = preset.serviceType === 'image'
      ? db.select().from(schema.aiServiceConfigs).all()
        .filter(row => row.serviceType === 'image')
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
      : db.select().from(schema.aiServiceConfigs).all()
        .find(row => row.serviceType === preset.serviceType && row.provider === preset.provider)

    const values = {
      serviceType: preset.serviceType,
      provider: preset.provider,
      name: `火宝默认${preset.label}服务`,
      baseUrl: preset.baseUrl,
      apiKey,
      model: JSON.stringify(preset.model.split(',').map(s => s.trim()).filter(Boolean)),
      priority: preset.priority,
      isActive: true,
      updatedAt: ts,
    }

    if (existing) {
      db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
    } else {
      db.insert(schema.aiServiceConfigs).values({
        ...values,
        createdAt: ts,
      }).run()
    }
  }

  for (const agent of HUOBAO_AGENT_DEFAULTS) {
    const [existing] = db.select().from(schema.agentConfigs).where(eq(schema.agentConfigs.agentType, agent.agentType)).all()
    const values = {
      name: agent.name,
      model: HUOBAO_AGENT_MODEL,
      isActive: true,
      updatedAt: ts,
    }

    if (existing) {
      db.update(schema.agentConfigs).set(values).where(eq(schema.agentConfigs.id, existing.id)).run()
    } else {
      db.insert(schema.agentConfigs).values({
        agentType: agent.agentType,
        description: '',
        model: HUOBAO_AGENT_MODEL,
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

  const configs = db.select().from(schema.aiServiceConfigs).all().map(row => ({
    ...toSnakeCase(row),
    model: parseModelField(row.model),
  }))
  const agents = db.select().from(schema.agentConfigs).all().map(row => toSnakeCase(row))

  logTaskSuccess('AIConfig', 'huobao-preset-applied', {
    serviceCount: HUOBAO_PRESET_SERVICES.length,
    agentCount: HUOBAO_AGENT_DEFAULTS.length,
  })

  return success(c, {
    configs,
    agents,
    agent_model: HUOBAO_AGENT_MODEL,
  })
})

// POST /ai-configs/local-preset — 本地短剧：智谱文本/视频 + Agnes 定妆生图 + Edge TTS
app.post('/local-preset', async (c) => {
  const ts = now()

  for (const preset of LOCAL_PRESET_SERVICES) {
    const existing = db.select().from(schema.aiServiceConfigs).all()
      .find(row => row.serviceType === preset.serviceType && row.provider === preset.provider)

    const isZhipu = String(preset.provider).toLowerCase() === 'zhipu'
    const isAgnes = String(preset.provider).toLowerCase() === 'agnes'
    // env 有 key 用 env；否则保留库里已有 key，禁止 local-preset 把有效令牌写成空串
    const envKey = isZhipu
      ? (LOCAL_COMIC_ENV.zhipuApiKey || '')
      : isAgnes
        ? (LOCAL_COMIC_ENV.agnesApiKey || '')
        : ''
    const existingKey = String(existing?.apiKey || '').trim()
    const apiKey = envKey || existingKey
    const values = {
      serviceType: preset.serviceType,
      provider: preset.provider,
      name: `本地短剧${preset.label}服务`,
      baseUrl: preset.baseUrl,
      apiKey,
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
    } else {
      db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
    }
  }

  // 停用冲突的本地 Ollama 文本 / Comfy 默认图视频（保留可选，但降低优先级并取消激活以免抢默认）
  for (const row of db.select().from(schema.aiServiceConfigs).all()) {
    const provider = String(row.provider || '').toLowerCase()
    if (row.serviceType === 'text' && provider === 'ollama' && row.isActive) {
      db.update(schema.aiServiceConfigs)
        .set({ isActive: false, updatedAt: ts })
        .where(eq(schema.aiServiceConfigs.id, row.id))
        .run()
      continue
    }
    if ((row.serviceType === 'image' || row.serviceType === 'video') && provider === 'comfyui' && row.isActive) {
      db.update(schema.aiServiceConfigs)
        .set({ priority: Math.min(row.priority || 90, 90), updatedAt: ts })
        .where(eq(schema.aiServiceConfigs.id, row.id))
        .run()
    }
  }

  const localAgentModel = LOCAL_COMIC_ENV.zhipuAgentModel
  for (const agent of HUOBAO_AGENT_DEFAULTS) {
    const [existing] = db.select().from(schema.agentConfigs).where(eq(schema.agentConfigs.agentType, agent.agentType)).all()
    const values = {
      name: agent.name,
      model: localAgentModel,
      isActive: true,
      updatedAt: ts,
    }

    if (existing) {
      db.update(schema.agentConfigs).set(values).where(eq(schema.agentConfigs.id, existing.id)).run()
    } else {
      db.insert(schema.agentConfigs).values({
        agentType: agent.agentType,
        description: '',
        model: localAgentModel,
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

  const configs = db.select().from(schema.aiServiceConfigs).all().map(row => ({
    ...toSnakeCase(row),
    model: parseModelField(row.model),
  }))
  const agents = db.select().from(schema.agentConfigs).all().map(row => toSnakeCase(row))

  logTaskSuccess('AIConfig', 'local-preset-applied', {
    serviceCount: LOCAL_PRESET_SERVICES.length,
    agentCount: HUOBAO_AGENT_DEFAULTS.length,
    agentModel: localAgentModel,
  })

  return success(c, { configs, agents, agent_model: localAgentModel })
})

// POST /ai-configs/test
app.post('/test', async (c) => {
  const body = await c.req.json()
  if (!body.service_type || !body.provider || !body.base_url) {
    return badRequest(c, 'service_type, provider and base_url are required')
  }

  const model = Array.isArray(body.model) ? body.model[0] : body.model
  const probe = buildProbe(body.service_type, body.provider, body.base_url, model, body.api_key)
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: body.service_type,
    provider: body.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await resp.text()
    const reachable = [200, 204, 400, 401, 403].includes(resp.status)
    const payload = {
      ok: resp.ok,
      reachable,
      status: resp.status,
      status_text: resp.statusText,
      method: probe.method,
      url: probeUrl,
      message: reachable
        ? (resp.ok ? '端点可访问，认证与路径基本正常' : '端点已响应，请根据状态码判断认证或路径是否正确')
        : '端点未按预期响应，请检查 Base URL 和代理前缀',
      response_preview: text.slice(0, 240),
    }
    if (reachable) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
    }
    return success(c, payload)
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', {
      provider: body.provider,
      url: probeUrl,
      error: error.message,
    })
    return success(c, {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      message: error.message || '请求失败',
      response_preview: '',
    })
  }
})

// GET /ai-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).all()
  if (!row) return notFound(c)
  return success(c, {
    ...toSnakeCase(row),
    model: parseModelField(row.model),
  })
})

// PUT /ai-configs/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }

  if ('provider' in body) updates.provider = body.provider
  if ('name' in body) updates.name = body.name
  if ('base_url' in body) updates.baseUrl = body.base_url
  if ('api_key' in body) updates.apiKey = body.api_key
  if ('model' in body) updates.model = JSON.stringify(body.model)
  if ('priority' in body) updates.priority = body.priority
  if ('is_active' in body) updates.isActive = body.is_active

  db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, id)).run()
  return success(c)
})

// DELETE /ai-configs/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).run()
  return success(c)
})

// GET /ai-providers
export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const rows = db.select().from(schema.aiServiceProviders).all()
  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
  return success(c, parsed)
})

export default app
