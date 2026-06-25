/**
 * 文本 LLM 对话 — 统一封装 chat/completions，支持 DeepSeek / Qwen 思考模式（4022 代理）
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 * @see https://help.aliyun.com/zh/model-studio/deep-thinking
 */
import { getTextConfig, getTextProviderBaseUrl } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'

export type TextThinkingEffort = 'high' | 'max'
export type TextThinkingFamily = 'deepseek' | 'qwen'

/** Qwen 3.5 思考预算（token）；未设时由上游默认 */
export const DEFAULT_QWEN_THINKING_BUDGET = 8192

/** 解析模型思考模式族：DeepSeek 用 thinking+reasoning_effort，Qwen 3.5 用 enable_thinking */
export function resolveTextThinkingFamily(model?: string | null): TextThinkingFamily | null {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return null
  if (m.includes('deepseek')) return 'deepseek'
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
    if (!enabled) return
    body.reasoning_effort = effort
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
              for (const msg of messages) {
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
  choices?: Array<{ message?: { content?: string | null } }>
}): string {
  return json.choices?.[0]?.message?.content || ''
}

export async function callTextChat(
  system: string,
  user: string,
  modelOverride?: string | null,
  thinkingEnabled = true,
  timeoutMs = 180_000,
  jsonObject = false,
): Promise<string> {
  const config = getTextConfig(modelOverride)
  const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  }
  if (jsonObject) {
    body.response_format = { type: 'json_object' }
  }
  appendTextThinkingOptions(body, config.model, 'high', thinkingEnabled)

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!resp.ok) {
    throw new Error(`Text API error ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json() as { choices?: Array<{ message?: { content?: string | null } }> }
  return extractChatCompletionText(json)
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
): Promise<string> {
  const config = getTextConfig(modelOverride)
  if (!config.apiKey) throw new Error('未配置文本模型 API Key')

  const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')
  const body: Record<string, unknown> = {
    model: config.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature,
  }
  appendTextThinkingOptions(body, config.model, 'high', thinkingEnabled)

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!resp.ok) {
    throw new Error(`Text API error ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json() as { choices?: Array<{ message?: { content?: string | null } }> }
  return extractChatCompletionText(json)
}

export function supportsVisionTextModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.includes('qwen3.5') || m.includes('qwen-3.5') || m.includes('gpt-4o')
}

type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** 多模态对话（配图扫描等）；imageUrls 支持 http(s) 或 data:image/ */
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
    throw new Error(`模型 ${config.model} 不支持视觉输入，请选用 qwen3.5-plus 或 gpt-4o`)
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
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!resp.ok) {
    throw new Error(`Vision API error ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json() as { choices?: Array<{ message?: { content?: string | null } }> }
  return extractChatCompletionText(json)
}
