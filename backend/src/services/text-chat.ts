/**
 * 文本 LLM 对话 — 统一封装 chat/completions，支持 DeepSeek / Qwen 思考模式（4022 代理）
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 * @see https://help.aliyun.com/zh/model-studio/deep-thinking
 */
import { getTextConfig, getTextProviderBaseUrl, textConfigRequiresApiKey } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import { ensureLocalModelStage, beginOllamaUse, endOllamaUse } from './local-model-manager.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { isLocalVisionOllamaModel } from '../constants/text-models.js'
import { parseDataUrl } from '../utils/storage.js'

function isOllamaProvider(provider?: string | null): boolean {
  return String(provider || '').toLowerCase() === 'ollama'
}

function buildTextApiHeaders(config: { provider?: string; apiKey?: string }): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  if (String(config.provider || '').toLowerCase() === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3013'
    headers['X-Title'] = process.env.OPENROUTER_APP_TITLE || 'huobao-drama'
  }
  return headers
}

function isOllamaQwen35Model(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.includes('qwen3.5') || m.includes('qwen3_5')
}

type TextChatMessageLike = { role: string; content: string }

const CHINESE_THINKING_USER_HINT = '（启用思考时：内心推理须用简体中文，禁止英文思考链）'

/** 思考模式下在最后一条 user 消息追加中文思考约束 */
export function augmentMessagesForChineseThinking(
  messages: TextChatMessageLike[],
  thinkingEnabled: boolean,
): TextChatMessageLike[] {
  if (!thinkingEnabled) {
    return messages.map(m => ({ role: m.role, content: m.content }))
  }
  const mapped = messages.map(m => ({ role: m.role, content: m.content }))
  for (let i = mapped.length - 1; i >= 0; i--) {
    if (mapped[i].role === 'user') {
      mapped[i] = {
        role: 'user',
        content: `${mapped[i].content}\n\n${CHINESE_THINKING_USER_HINT}`,
      }
      break
    }
  }
  return mapped
}

/** Ollama 原生 /api/chat 的 think */
export function resolveOllamaThinkEnabled(model: string, thinkingEnabled: boolean): boolean {
  return thinkingEnabled
}

function resolveOllamaNumPredict(
  model: string,
  thinkingEnabled: boolean,
  maxTokens: number | undefined,
): number | undefined {
  if (maxTokens == null) return undefined
  if (thinkingEnabled && isOllamaQwen35Model(model)) {
    return maxTokens + DEFAULT_QWEN_THINKING_BUDGET
  }
  return maxTokens
}

function ollamaNativeChatUrl(config: ReturnType<typeof getTextConfig>): string {
  const root = getTextProviderBaseUrl(config).replace(/\/v1\/?$/, '')
  return `${root}/api/chat`
}

function buildOllamaNativeChatBody(
  messages: TextChatMessage[],
  model: string,
  thinkingEnabled: boolean,
  temperature: number,
  maxTokens: number | undefined,
  stream: boolean,
  numCtx?: number,
): Record<string, unknown> {
  const options: Record<string, unknown> = { temperature }
  const numPredict = resolveOllamaNumPredict(model, thinkingEnabled, maxTokens)
  if (numPredict != null) options.num_predict = numPredict
  if (numCtx != null) options.num_ctx = numCtx
  if (LOCAL_COMIC_ENV.ollamaNumGpu != null) options.num_gpu = LOCAL_COMIC_ENV.ollamaNumGpu
  const chatMessages = augmentMessagesForChineseThinking(messages, thinkingEnabled)
  return {
    model,
    messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    stream,
    think: resolveOllamaThinkEnabled(model, thinkingEnabled),
    options,
  }
}

function extractOllamaNativeMessage(json: {
  message?: { content?: string | null; thinking?: string | null }
}): string {
  const content = String(json.message?.content || '').trim()
  if (content) return content
  return String(json.message?.thinking || '').trim()
}

function parseOllamaNativeStreamLine(line: string): { content: string; thinking: string } {
  const trimmed = line.trim()
  if (!trimmed) return { content: '', thinking: '' }
  try {
    const json = JSON.parse(trimmed) as {
      message?: { content?: string | null; thinking?: string | null }
    }
    return {
      content: String(json.message?.content ?? ''),
      thinking: String(json.message?.thinking ?? ''),
    }
  } catch {
    return { content: '', thinking: '' }
  }
}

async function streamOllamaNativeChatMessages(
  config: ReturnType<typeof getTextConfig>,
  messages: TextChatMessage[],
  onDelta: (delta: string, full: string) => void,
  thinkingEnabled: boolean,
  timeoutMs: number,
  temperature: number,
  signal: AbortSignal | undefined,
  maxTokens: number | undefined,
  hooks?: { onThinkingDelta?: (delta: string, full: string) => void },
  ollamaNumCtxProfile: OllamaNumCtxProfile = 'default',
): Promise<string> {
  const numCtx = resolveOllamaNumCtx(config.model, ollamaNumCtxProfile)
  const resp = await fetch(ollamaNativeChatUrl(config), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOllamaNativeChatBody(
      messages,
      config.model,
      thinkingEnabled,
      temperature,
      maxTokens,
      true,
      numCtx,
    )),
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  })

  if (!resp.ok) {
    throw new Error(`Ollama chat error ${resp.status}: ${await resp.text()}`)
  }
  if (!resp.body) throw new Error('Ollama 未返回流式 body')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let fullThinking = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const { content, thinking } = parseOllamaNativeStreamLine(line)
      if (thinking) {
        fullThinking += thinking
        hooks?.onThinkingDelta?.(thinking, fullThinking)
      }
      if (!content) continue
      full += content
      onDelta(content, full)
    }
  }

  if (!full.trim()) {
    throw new Error(isOllamaQwen35Model(config.model) && thinkingEnabled
      ? 'AI 未返回正文（Qwen3.5 本地开思考会占满输出额度，请关闭思考后重试）'
      : 'AI 未返回内容')
  }
  return full.trim()
}

async function callOllamaNativeChatMessages(
  config: ReturnType<typeof getTextConfig>,
  messages: TextChatMessage[],
  thinkingEnabled: boolean,
  timeoutMs: number,
  temperature: number,
  maxTokens: number | undefined,
  ollamaNumCtxProfile: OllamaNumCtxProfile = 'default',
): Promise<string> {
  const numCtx = resolveOllamaNumCtx(config.model, ollamaNumCtxProfile)
  let resp: Response
  try {
    resp = await fetch(ollamaNativeChatUrl(config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOllamaNativeChatBody(
        messages,
        config.model,
        thinkingEnabled,
        temperature,
        maxTokens,
        false,
        numCtx,
      )),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err: unknown) {
    const e = err as { cause?: { code?: string }; code?: string; message?: string }
    const detail = String(e?.cause?.code || e?.code || e?.message || err)
    throw new Error(
      `Ollama 连接失败（${detail}）。请确认 Ollama 已启动；16GB 显存请用每批 2 段、或暂时关闭思考模式`,
    )
  }

  if (!resp.ok) {
    throw new Error(`Ollama chat error ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json() as { message?: { content?: string | null; thinking?: string | null } }
  const text = extractOllamaNativeMessage(json)
  if (!text) {
    throw new Error(isOllamaQwen35Model(config.model) && thinkingEnabled
      ? 'AI 未返回正文（Qwen3.5 本地开思考会占满输出额度，请关闭思考后重试）'
      : 'AI 未返回内容')
  }
  return text
}

export type TextThinkingEffort = 'high' | 'max'
export type TextThinkingFamily = 'deepseek' | 'qwen'

/** Qwen 3.5 思考预算（token）；未设时由上游默认 */
export const DEFAULT_QWEN_THINKING_BUDGET = 8192

/** Ollama qwen3.5:9b 默认上下文（32K；配图/检测/角色等） */
export const OLLAMA_QWEN35_9B_NUM_CTX_DEFAULT = 32_768
/** Ollama qwen3.5:9b 配图文案（同默认 32K） */
export const OLLAMA_QWEN35_9B_NUM_CTX_IMAGE_PROMPT = OLLAMA_QWEN35_9B_NUM_CTX_DEFAULT
/** Ollama qwen3.5:9b 剧本生成（64K；长文+思考需要更大窗口） */
export const OLLAMA_QWEN35_9B_NUM_CTX_SCRIPT = 65_536

export type OllamaNumCtxProfile = 'default' | 'narration_image_prompt' | 'narration_script'

function isOllamaQwen35_9bModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m === 'qwen3.5:9b' || /^qwen3[._]5:9b(?:-|$)/i.test(m)
}

/** 按用途为 Ollama 请求解析 num_ctx；非 qwen3.5:9b 返回 undefined（沿用模型 Modelfile 默认） */
export function resolveOllamaNumCtx(
  model: string,
  profile: OllamaNumCtxProfile = 'default',
): number | undefined {
  if (!isOllamaQwen35_9bModel(model)) return undefined
  if (profile === 'narration_script') return OLLAMA_QWEN35_9B_NUM_CTX_SCRIPT
  if (profile === 'narration_image_prompt') return OLLAMA_QWEN35_9B_NUM_CTX_IMAGE_PROMPT
  return OLLAMA_QWEN35_9B_NUM_CTX_DEFAULT
}

/** 解析模型思考模式族：DeepSeek/智谱用 thinking，Qwen 3.5 用 enable_thinking */
export function resolveTextThinkingFamily(model?: string | null): TextThinkingFamily | null {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return null
  if (m.includes('deepseek')) return 'deepseek'
  if (m.startsWith('glm-') || m.includes('glm4') || m.includes('glm-4')) return 'deepseek'
  if (m.includes('qwen3.5') || m.includes('qwen-3.5')) return 'qwen'
  return null
}

export function supportsTextThinkingMode(model?: string | null): boolean {
  return resolveTextThinkingFamily(model) != null
}

/** 为 chat/completions 请求体追加思考模式参数 */
export function appendTextThinkingOptions(
  body: Record<string, unknown>,
  model: string,
  effort: TextThinkingEffort = 'high',
  enabled = true,
): void {
  const family = resolveTextThinkingFamily(model)
  if (!family) return

  if (family === 'deepseek') {
    body.thinking = { type: enabled ? 'enabled' : 'disabled' }
    // 智谱 GLM 不使用 reasoning_effort；DeepSeek 才需要
    const m = String(model || '').toLowerCase()
    if (!enabled) return
    if (!m.startsWith('glm-') && !m.includes('glm4')) {
      body.reasoning_effort = effort
    }
  } else {
    body.enable_thinking = enabled
    if (!enabled) return
    body.thinking_budget = DEFAULT_QWEN_THINKING_BUDGET
  }

  // 思考模式下 temperature 等参数无效，去掉以免部分网关告警
  delete body.temperature
  delete body.top_p
  delete body.frequency_penalty
  delete body.presence_penalty
}

function assistantReasoningKey(msg: {
  tool_calls?: Array<{ id?: string | null }> | null
  content?: string | null
}): string {
  const ids = (msg.tool_calls || []).map(t => t.id).filter(Boolean).join('|')
  if (ids) return ids
  return String(msg.content || '').slice(0, 80)
}

/**
 * 为 Agent 多轮 tool call 注入思考模式，并在请求中回传 reasoning_content
 * 每个 createAgent 调用应使用独立 fetch 实例（闭包内缓存 reasoning）
 */
export function createTextThinkingFetch(
  thinkingEnabled = true,
  baseFetch: typeof fetch = globalThis.fetch,
): typeof fetch {
  const reasoningByAssistantKey = new Map<string, string>()

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let nextInit = init

    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>
        const model = String(body.model || '')
        if (supportsTextThinkingMode(model)) {
          appendTextThinkingOptions(body, model, 'max', thinkingEnabled)

          if (thinkingEnabled) {
            const messages = body.messages
            if (Array.isArray(messages)) {
              const augmented = augmentMessagesForChineseThinking(
                messages as TextChatMessageLike[],
                true,
              )
              body.messages = augmented
              for (const msg of augmented) {
                if (
                  msg?.role === 'assistant'
                  && Array.isArray(msg.tool_calls)
                  && msg.tool_calls.length > 0
                  && !msg.reasoning_content
                ) {
                  const cached = reasoningByAssistantKey.get(assistantReasoningKey(msg))
                  if (cached) msg.reasoning_content = cached
                }
              }
            }
          }
        }
        nextInit = { ...init, body: JSON.stringify(body) }
      } catch {
        // 非 JSON body，原样透传
      }
    }

    const response = await baseFetch(input, nextInit)

    if (
      thinkingEnabled
      && response.ok
      && nextInit?.body
      && typeof nextInit.body === 'string'
    ) {
      try {
        const body = JSON.parse(nextInit.body) as Record<string, unknown>
        const model = String(body.model || '')
        if (supportsTextThinkingMode(model)) {
          const clone = response.clone()
          const json = await clone.json() as {
            choices?: Array<{ message?: {
              reasoning_content?: string
              tool_calls?: Array<{ id?: string | null }>
              content?: string | null
            } }>
          }
          const message = json.choices?.[0]?.message
          if (message?.reasoning_content && message.tool_calls?.length) {
            reasoningByAssistantKey.set(
              assistantReasoningKey(message),
              message.reasoning_content,
            )
          }
        }
      } catch {
        // 忽略解析失败
      }
    }

    return response
  }
}

export function extractChatCompletionText(json: {
  choices?: Array<{ message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null } }>
}): string {
  const message = json.choices?.[0]?.message
  const content = String(message?.content || '').trim()
  if (content) return content
  const reasoning = String(message?.reasoning_content || message?.reasoning || '').trim()
  return reasoning
}

function parseOpenAIStreamChunk(line: string): { content: string; reasoning: string } {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { content: '', reasoning: '' }
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return { content: '', reasoning: '' }
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: {
        content?: string | null
        reasoning_content?: string | null
        reasoning?: string | null
      } }>
    }
    const delta = json.choices?.[0]?.delta
    return {
      content: String(delta?.content ?? ''),
      reasoning: String(delta?.reasoning_content ?? delta?.reasoning ?? ''),
    }
  } catch {
    return { content: '', reasoning: '' }
  }
}

/** @deprecated 使用 parseOpenAIStreamChunk */
function parseOpenAIStreamDataLine(line: string): string {
  return parseOpenAIStreamChunk(line).content
}

/** 多轮文本对话流式输出；onDelta 收到正文累积全文；hooks.onThinkingDelta 收到思考过程 */
export async function streamTextChatMessages(
  messages: TextChatMessage[],
  onDelta: (delta: string, full: string) => void,
  modelOverride?: string | null,
  thinkingEnabled = true,
  timeoutMs = 300_000,
  temperature = 0.65,
  signal?: AbortSignal,
  maxTokens?: number,
  hooks?: { onThinkingDelta?: (delta: string, full: string) => void },
  ollamaNumCtxProfile: OllamaNumCtxProfile = 'default',
): Promise<string> {
  const config = getTextConfig(modelOverride)
  if (config.provider.toLowerCase() === 'ollama') {
    await ensureLocalModelStage('llm', { ollamaModel: config.model })
  } else if (textConfigRequiresApiKey(config) && !config.apiKey) {
    throw new Error('未配置文本模型 API Key')
  }

  const ollamaInUse = isOllamaProvider(config.provider)
  if (ollamaInUse) beginOllamaUse()
  try {
    if (ollamaInUse) {
      return streamOllamaNativeChatMessages(
        config,
        messages,
        onDelta,
        thinkingEnabled,
        timeoutMs,
        temperature,
        signal,
        maxTokens,
        hooks,
        ollamaNumCtxProfile,
      )
    }

    const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')
    const chatMessages = augmentMessagesForChineseThinking(messages, thinkingEnabled)
    const body: Record<string, unknown> = {
      model: config.model,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      stream: true,
    }
    if (maxTokens != null) body.max_tokens = maxTokens
    appendTextThinkingOptions(body, config.model, 'high', thinkingEnabled)

    const headers = buildTextApiHeaders(config)

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    })

    if (!resp.ok) {
      throw new Error(`Text API error ${resp.status}: ${await resp.text()}`)
    }
    if (!resp.body) throw new Error('Text API 未返回流式 body')

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let fullReasoning = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const { content, reasoning } = parseOpenAIStreamChunk(line)
        if (reasoning) {
          fullReasoning += reasoning
          hooks?.onThinkingDelta?.(reasoning, fullReasoning)
        }
        if (!content) continue
        full += content
        onDelta(content, full)
      }
    }

    // 部分 GLM 开思考时正文只在 reasoning 里；与 callTextChat 对齐
    if (!full.trim() && fullReasoning.trim()) {
      full = fullReasoning.trim()
      onDelta(full, full)
    }
    if (!full.trim()) throw new Error('AI 未返回内容')
    return full.trim()
  } finally {
    if (ollamaInUse) endOllamaUse()
  }
}

export async function callTextChat(
  system: string,
  user: string,
  modelOverride?: string | null,
  thinkingEnabled = true,
  timeoutMs = 180_000,
  jsonObject = false,
  maxTokens?: number,
  ollamaNumCtxProfile: OllamaNumCtxProfile = 'default',
): Promise<string> {
  const config = getTextConfig(modelOverride)
  if (config.provider.toLowerCase() === 'ollama') {
    await ensureLocalModelStage('llm', { ollamaModel: config.model })
  }
  const ollamaInUse = isOllamaProvider(config.provider)
  if (ollamaInUse) beginOllamaUse()
  try {
    if (ollamaInUse) {
      return callOllamaNativeChatMessages(
        config,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        thinkingEnabled,
        timeoutMs,
        0.2,
        maxTokens,
        ollamaNumCtxProfile,
      )
    }

    const simpleMessages = augmentMessagesForChineseThinking(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      thinkingEnabled,
    )

    const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')

    const body: Record<string, unknown> = {
      model: config.model,
      messages: simpleMessages,
      temperature: 0.2,
    }
    if (jsonObject) {
      body.response_format = { type: 'json_object' }
    }
    if (maxTokens != null) body.max_tokens = maxTokens
    appendTextThinkingOptions(body, config.model, 'high', thinkingEnabled)

    const headers = buildTextApiHeaders(config)

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!resp.ok) {
      throw new Error(`Text API error ${resp.status}: ${await resp.text()}`)
    }

    const json = await resp.json() as { choices?: Array<{ message?: { content?: string | null } }> }
    return extractChatCompletionText(json)
  } finally {
    if (ollamaInUse) endOllamaUse()
  }
}

export type TextChatRole = 'system' | 'user' | 'assistant'

export type TextChatMessage = {
  role: TextChatRole
  content: string
}

/** 多轮文本对话（剧本生成聊天等） */
export async function callTextChatMessages(
  messages: TextChatMessage[],
  modelOverride?: string | null,
  thinkingEnabled = true,
  timeoutMs = 300_000,
  temperature = 0.65,
  maxTokens?: number,
  ollamaNumCtxProfile: OllamaNumCtxProfile = 'default',
): Promise<string> {
  const config = getTextConfig(modelOverride)
  if (config.provider.toLowerCase() === 'ollama') {
    await ensureLocalModelStage('llm', { ollamaModel: config.model })
  } else if (textConfigRequiresApiKey(config) && !config.apiKey) {
    throw new Error('未配置文本模型 API Key')
  }

  const ollamaInUse = isOllamaProvider(config.provider)
  if (ollamaInUse) beginOllamaUse()
  try {
    if (ollamaInUse) {
      return callOllamaNativeChatMessages(
        config,
        messages,
        thinkingEnabled,
        timeoutMs,
        temperature,
        maxTokens,
        ollamaNumCtxProfile,
      )
    }

    const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')
    const chatMessages = augmentMessagesForChineseThinking(messages, thinkingEnabled)
    const body: Record<string, unknown> = {
      model: config.model,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      temperature,
    }
    if (maxTokens != null) body.max_tokens = maxTokens
    appendTextThinkingOptions(body, config.model, 'high', thinkingEnabled)

    const headers = buildTextApiHeaders(config)

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!resp.ok) {
      throw new Error(`Text API error ${resp.status}: ${await resp.text()}`)
    }

    const json = await resp.json() as { choices?: Array<{ message?: { content?: string | null } }> }
    return extractChatCompletionText(json)
  } finally {
    if (ollamaInUse) endOllamaUse()
  }
}

export function supportsVisionTextModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (isLocalVisionOllamaModel(m)) return true
  // Ollama 纯文本 tag（如 qwen3.5:9b）不支持看图
  if (/^qwen[\w.-]*:\d/i.test(m)) return false
  return m.includes('qwen3.5') || m.includes('qwen-3.5') || m.includes('gpt-4o')
}

type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

function imageUrlToOllamaBase64(imageUrl: string): string {
  const trimmed = String(imageUrl || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:')) {
    return parseDataUrl(trimmed)?.data || ''
  }
  // 已是裸 base64
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
    return trimmed
  }
  return ''
}

/** Ollama 原生 /api/chat + images（MiniCPM-V / Qwen2.5-VL 等） */
async function callOllamaVisionChat(
  config: ReturnType<typeof getTextConfig>,
  system: string,
  userText: string,
  imageUrls: string[],
  timeoutMs: number,
  jsonObject: boolean,
): Promise<string> {
  await ensureLocalModelStage('llm', { ollamaModel: config.model })
  beginOllamaUse()
  try {
    const images = imageUrls.map(imageUrlToOllamaBase64).filter(Boolean)
    if (!images.length) throw new Error('缺少可用图片（请传 data:image 或本地压缩图）')

    const prompt = jsonObject
      ? `${userText}\n\n请只输出合法 JSON，不要 markdown 代码块，不要额外说明。`
      : userText
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt, images },
      ],
      stream: false,
      think: false,
      options: { temperature: 0.2 },
    }
    if (LOCAL_COMIC_ENV.ollamaNumGpu != null) {
      (body.options as Record<string, unknown>).num_gpu = LOCAL_COMIC_ENV.ollamaNumGpu
    }

    const resp = await fetch(ollamaNativeChatUrl(config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!resp.ok) {
      throw new Error(`Ollama vision error ${resp.status}: ${await resp.text()}`)
    }
    const json = await resp.json() as { message?: { content?: string | null; thinking?: string | null } }
    const text = extractOllamaNativeMessage(json)
    if (!text) throw new Error('Ollama 看图模型未返回内容')
    return text
  } finally {
    endOllamaUse()
  }
}

/** 多模态对话（配图扫描 / 定妆画风校验等）；imageUrls 支持 http(s) 或 data:image/ */
export async function callVisionChat(
  system: string,
  userText: string,
  imageUrls: string[],
  modelOverride?: string | null,
  thinkingEnabled = true,
  timeoutMs = 180_000,
  jsonObject = false,
): Promise<string> {
  const config = getTextConfig(modelOverride)
  if (!supportsVisionTextModel(config.model)) {
    throw new Error(`模型 ${config.model} 不支持视觉输入，请选用 qwen2.5vl:7b、minicpm-v:latest、qwen3.5-plus 或 gpt-4o`)
  }

  if (isOllamaProvider(config.provider) || isLocalVisionOllamaModel(config.model)) {
    return callOllamaVisionChat(config, system, userText, imageUrls, timeoutMs, jsonObject)
  }

  const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')
  const userContent: VisionContentPart[] = [
    { type: 'text', text: userText },
    ...imageUrls.filter(Boolean).map(imageUrl => ({
      type: 'image_url' as const,
      image_url: { url: imageUrl },
    })),
  ]
  if (userContent.length < 2) throw new Error('缺少配图 URL')

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
  }
  if (jsonObject) body.response_format = { type: 'json_object' }
  appendTextThinkingOptions(body, config.model, 'high', thinkingEnabled)

  const resp = await fetch(url, {
    method: 'POST',
    headers: buildTextApiHeaders(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!resp.ok) {
    throw new Error(`Vision API error ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json() as { choices?: Array<{ message?: { content?: string | null } }> }
  return extractChatCompletionText(json)
}
