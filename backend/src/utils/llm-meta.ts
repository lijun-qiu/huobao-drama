import { now } from './response.js'

/** LLM 调用完成时间（ISO 8601），供前端展示「是否新生成」 */
export function llmGeneratedAt(): string {
  return now()
}

export function withLlmGeneratedAt<T extends Record<string, unknown>>(data: T): T & { generated_at: string } {
  return { ...data, generated_at: now() }
}
