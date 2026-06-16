export const DEFAULT_TEXT_MODEL = 'deepseek-v4-pro'

export const TEXT_MODEL_OPTIONS = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro · 默认（推理+Agent，OpenAI 兼容）' },
  { value: 'gpt-4o', label: 'GPT-4o · OpenAI 兼容' },
] as const

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

export function isKnownTextModel(model?: string | null): boolean {
  const m = String(model || '').trim()
  return TEXT_MODEL_OPTIONS.some(item => item.value === m)
}
