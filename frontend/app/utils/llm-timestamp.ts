/** 格式化 LLM 完成时间（支持 ISO 字符串或毫秒时间戳） */
export function formatLlmGeneratedAt(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return ''
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

export function resolveLlmTimestamp(...sources: (string | number | null | undefined)[]): string {
  for (const s of sources) {
    if (s != null && s !== '') return String(s)
  }
  return new Date().toISOString()
}

export function llmErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '未知错误'
  return String(error || '未知错误')
}

export function isLlmCancelled(error: unknown): boolean {
  return llmErrorMessage(error) === '请求已取消'
}

export function pickLlmGeneratedAt(payload?: Record<string, unknown> | null): string | null {
  const ts = payload?.generated_at ?? payload?.generatedAt
  if (ts == null || ts === '') return null
  return String(ts)
}

export function stampChatAssistantGeneratedAt(
  messages: Array<{ generatedAt?: string; failedAt?: string; errorMessage?: string }>,
  idx: number,
  payload?: Record<string, unknown> | null,
) {
  const ts = pickLlmGeneratedAt(payload)
  if (!ts || !messages[idx]) return
  messages[idx].generatedAt = ts
  messages[idx].failedAt = undefined
  messages[idx].errorMessage = undefined
}

/** 标记对话助手消息失败；取消请求返回 false */
export function stampChatAssistantFailed(
  messages: Array<{ generatedAt?: string; failedAt?: string; errorMessage?: string }>,
  idx: number,
  error: unknown,
): boolean {
  if (isLlmCancelled(error)) return false
  const msg = messages[idx]
  if (!msg) return false
  msg.failedAt = resolveLlmTimestamp()
  msg.errorMessage = llmErrorMessage(error)
  msg.generatedAt = undefined
  return true
}

export function formatLlmStatusTime(
  formatTime: (ts: string | number | null | undefined) => string,
  at: string | number | null | undefined,
  kind: 'success' | 'failure',
): string {
  const label = kind === 'failure' ? '失败于' : '生成于'
  const formatted = formatTime(at)
  return formatted ? `${label} ${formatted}` : ''
}
