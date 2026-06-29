export const DEFAULT_TEXT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_TEXT_THINKING = true
/** 解说模式：剧本生成 / 配图等文本 LLM 默认模型 */
export const DEFAULT_NARRATION_TEXT_MODEL = 'qwen3.5-plus'
export const DEFAULT_NARRATION_SCRIPT_CHAT_MODEL = DEFAULT_NARRATION_TEXT_MODEL
export const DEFAULT_NARRATION_IMAGE_TEXT_MODEL = DEFAULT_NARRATION_TEXT_MODEL
export const DEFAULT_NARRATION_STORYBOARD_TEXT_MODEL = DEFAULT_NARRATION_TEXT_MODEL

export const TEXT_MODEL_OPTIONS = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro · 默认（推理+Agent）' },
  { value: 'qwen3.5-plus', label: 'Qwen 3.5 Plus · 思考+VLM（4022）' },
  { value: 'gpt-4o', label: 'GPT-4o · OpenAI 兼容' },
] as const

export function resolveEpisodeTextThinking(
  episode?: { textThinking?: boolean | null; text_thinking?: boolean | number | null } | null,
  bodyValue?: boolean | number | string | null,
): boolean {
  if (bodyValue !== undefined && bodyValue !== null && bodyValue !== '') {
    if (bodyValue === false || bodyValue === 0 || bodyValue === '0') return false
    if (bodyValue === true || bodyValue === 1 || bodyValue === '1') return true
  }
  const stored = episode?.textThinking ?? episode?.text_thinking
  if (stored === false || stored === 0) return false
  if (stored === true || stored === 1) return true
  return DEFAULT_TEXT_THINKING
}

export const LEGACY_DEFAULT_TEXT_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'google/gemini-3-flash-preview',
  'gpt-4.1-mini',
] as const

export function resolveEpisodeTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = String(bodyModel || episode?.textModel || '').trim()
  if (picked) return picked
  return DEFAULT_TEXT_MODEL
}

export function resolveNarrationEpisodeTextModel(
  episode?: { textModel?: string | null } | null,
) {
  const stored = String(episode?.textModel || '').trim()
  if (stored && stored !== DEFAULT_TEXT_MODEL) return stored
  return DEFAULT_NARRATION_TEXT_MODEL
}

export function resolveNarrationImageTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = String(bodyModel || '').trim()
  if (picked) return picked
  return resolveNarrationEpisodeTextModel(episode)
}

export function resolveNarrationScriptChatTextModel(bodyModel?: string | null) {
  const picked = String(bodyModel || '').trim()
  if (picked) return picked
  return DEFAULT_NARRATION_SCRIPT_CHAT_MODEL
}

export function resolveNarrationStoryboardTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = String(bodyModel || '').trim()
  if (picked) return picked
  return resolveNarrationEpisodeTextModel(episode)
}

export function isKnownTextModel(model?: string | null): boolean {
  const m = String(model || '').trim()
  return TEXT_MODEL_OPTIONS.some(item => item.value === m)
}
