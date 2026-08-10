  import { usesLocalModelPipeline } from './production-mode.js'

/** OpenRouter 默认免费：Poolside Laguna S 2.1 */
export const OPENROUTER_LAGUNA_S_FREE = 'poolside/laguna-s-2.1:free'
/** @deprecated Ling-3.0-flash 已下架（OpenRouter 返回 404: This model is unavailable for free），归一化到 Laguna */
export const OPENROUTER_LING_FLASH_FREE = 'inclusionai/ling-3.0-flash:free'
/** OpenRouter 免费备选：Nemotron 3 Super */
export const OPENROUTER_NEMOTRON_SUPER_FREE = 'nvidia/nemotron-3-super-120b-a12b:free'
/** OpenRouter 免费备选：Nemotron 3 Ultra（高质量） */
export const OPENROUTER_NEMOTRON_ULTRA_FREE = 'nvidia/nemotron-3-ultra-550b-a55b:free'
/** @deprecated 旧免费 Flash 别名，归一到 Laguna 默认 */
export const OPENROUTER_DEEPSEEK_V4_FLASH_FREE = OPENROUTER_LAGUNA_S_FREE
/** OpenRouter 付费 Flash */
export const OPENROUTER_DEEPSEEK_V4_FLASH = 'openrouter/deepseek-v4-flash'
/** OpenRouter 付费 Pro */
export const OPENROUTER_DEEPSEEK_V4_PRO = 'openrouter/deepseek-v4-pro'
/** DeepSeek 官网 Flash */
export const OFFICIAL_DEEPSEEK_V4_FLASH = 'deepseek-v4-flash'
/** DeepSeek 官网 Pro */
export const OFFICIAL_DEEPSEEK_V4_PRO = 'deepseek-v4-pro'

export const DEFAULT_TEXT_MODEL = OFFICIAL_DEEPSEEK_V4_FLASH
export const DEFAULT_TEXT_THINKING = true
export const DEFAULT_LOCAL_TEXT_MODEL = DEFAULT_TEXT_MODEL
export const DEFAULT_LOCAL_SCRIPT_TEXT_MODEL = DEFAULT_LOCAL_TEXT_MODEL
export const DEFAULT_LOCAL_AGENT_MODEL = DEFAULT_LOCAL_TEXT_MODEL
export const DEFAULT_LOCAL_VISION_MODEL = 'qwen2.5vl:7b'
export const DEFAULT_NARRATION_TEXT_MODEL = DEFAULT_TEXT_MODEL
export const DEFAULT_NARRATION_SCRIPT_CHAT_MODEL = DEFAULT_NARRATION_TEXT_MODEL
/** 配图文案专用（统一妙飞 DeepSeek） */
export const DEFAULT_NARRATION_IMAGE_TEXT_MODEL = OFFICIAL_DEEPSEEK_V4_FLASH
export const DEFAULT_NARRATION_STORYBOARD_TEXT_MODEL = DEFAULT_NARRATION_TEXT_MODEL

export const LOCAL_TEXT_MODEL_OPTIONS = [
  { value: 'glm-4.7-flash', label: '智谱 · GLM-4.7-Flash（免费）' },
  { value: 'glm-4-flash-250414', label: '智谱 · GLM-4-Flash-250414（免费）' },
] as const

export const LOCAL_VISION_MODEL_OPTIONS = [
  { value: 'qwen2.5vl:7b', label: 'Ollama · Qwen2.5-VL 7B（看图/画风校验，推荐）' },
  { value: 'minicpm-v:latest', label: 'Ollama · MiniCPM-V' },
] as const

export type TextModelChannel = 'openrouter' | 'deepseek' | 'zhipu' | 'ollama' | 'default'

/** 兼容旧 free / DeepSeek 免费别名 → Laguna；Ultra 短名归一到完整 Ultra id；过期模型映射到当前默认 */
export function normalizeTextModelId(model?: string | null): string {
  const m = String(model || '').trim()
  if (!m) return m
  // DeepSeek 免费旧别名 → Laguna
  if (
    m === 'deepseek-v4-flash:free'
    || m === 'openrouter/deepseek-v4-flash:free'
  ) {
    return OPENROUTER_LAGUNA_S_FREE
  }
  // Ling-3.0-flash 已下架（OpenRouter 404 unavailable for free）→ 妙飞 DeepSeek
  if (
    m === OPENROUTER_LING_FLASH_FREE
    || m === 'inclusionai/ling-3.0-flash'
  ) {
    return OFFICIAL_DEEPSEEK_V4_FLASH
  }
  // Ultra 短名归一到完整 id
  if (
    m === 'nvidia/nemotron-3-ultra:free'
    || m === 'nvidia/nemotron-3-ultra-550b:free'
  ) {
    return OPENROUTER_NEMOTRON_ULTRA_FREE
  }
  // 所有过期的 legacy 默认模型（已下架或不再免费）统一映射到妙飞 DeepSeek
  if ((LEGACY_DEFAULT_TEXT_MODELS as readonly string[]).includes(m)) {
    return OFFICIAL_DEEPSEEK_V4_FLASH
  }
  return m
}

/** 根据应用模型 ID 判断走哪家文本通道 */
export function resolveTextModelChannel(model?: string | null): TextModelChannel {
  const m = normalizeTextModelId(model)
  if (!m) return 'default'
  if (m.startsWith('glm-')) return 'zhipu'
  if (
    m.startsWith('openrouter/')
    || m.startsWith('inclusionai/')
    || m.startsWith('poolside/')
    || m.endsWith(':free')
    || m.startsWith('nvidia/')
    || m === OPENROUTER_LAGUNA_S_FREE
    || m === OPENROUTER_LING_FLASH_FREE
    || m === OPENROUTER_NEMOTRON_SUPER_FREE
    || m === OPENROUTER_NEMOTRON_ULTRA_FREE
  ) {
    return 'openrouter'
  }
  if (m === OFFICIAL_DEEPSEEK_V4_FLASH || m === OFFICIAL_DEEPSEEK_V4_PRO) return 'deepseek'
  if (isLocalOllamaTextModel(m)) return 'ollama'
  return 'default'
}

export function textModelLabel(model?: string | null): string {
  const m = normalizeTextModelId(model)
  if (!m) return '未选'
  const hit = TEXT_MODEL_OPTIONS.find(item => item.value === m)
  return hit?.label || m
}

/** 是否为 OpenRouter 付费 DeepSeek（应用短名） */
export function isOpenRouterPaidDeepseekModel(model?: string | null): boolean {
  const m = normalizeTextModelId(model)
  if (!m || m.includes(':free') || m.startsWith('nvidia/') || m.startsWith('inclusionai/') || m.startsWith('poolside/')) return false
  return (
    m === OPENROUTER_DEEPSEEK_V4_FLASH
    || m === OPENROUTER_DEEPSEEK_V4_PRO
    || m === 'deepseek/deepseek-v4-flash'
    || m === 'deepseek/deepseek-v4-pro'
  )
}

export function resolveOpenRouterApiKeyForModel(
  model?: string | null,
  fallback = '',
): string {
  const paid = String(process.env.OPENROUTER_API_KEY_PAID || '').trim()
  const free = String(
    process.env.OPENROUTER_API_KEY_FREE
    || process.env.OPENROUTER_API_KEY
    || process.env.AI_API_KEY
    || '',
  ).trim()
  if (isOpenRouterPaidDeepseekModel(model) && paid) return paid
  return free || paid || fallback
}

/** 将 UI/剧集模型名解析为 provider 实际 API model id */
export function resolveProviderTextModel(provider?: string | null, model?: string | null): string {
  const m = normalizeTextModelId(model)
  if (!m) return m
  const p = String(provider || '').trim().toLowerCase()

  if (p === 'openrouter') {
    if (
      m === OPENROUTER_LAGUNA_S_FREE
      || m === OPENROUTER_NEMOTRON_SUPER_FREE
      || m === OPENROUTER_NEMOTRON_ULTRA_FREE
    ) return m
    if (
      m === OPENROUTER_DEEPSEEK_V4_FLASH
      || m === OFFICIAL_DEEPSEEK_V4_FLASH
      || m === 'deepseek/deepseek-v4-flash'
    ) return 'deepseek/deepseek-v4-flash'
    if (
      m === OPENROUTER_DEEPSEEK_V4_PRO
      || m === OFFICIAL_DEEPSEEK_V4_PRO
      || m === 'deepseek/deepseek-v4-pro'
    ) return 'deepseek/deepseek-v4-pro'
    if (m.startsWith('openrouter/')) {
      const rest = m.slice('openrouter/'.length)
      if (rest.includes('/')) return rest
      if (rest.endsWith(':free')) {
        const base = rest.replace(/:free$/, '')
        return `deepseek/${base}:free`
      }
      if (rest.startsWith('deepseek-')) return `deepseek/${rest}`
      return rest
    }
    // 禁止把已下架的 inclusionai/ling* 原样打给 OpenRouter
    if (m.startsWith('inclusionai/ling')) return 'deepseek/deepseek-v4-flash'
    if (m.includes('/')) return m
    return m
  }

  // DeepSeek 官网 / 4022：API 使用短名
  if (p === 'openai' || p === 'chatfire' || p === 'deepseek') {
    if (
      m === OPENROUTER_LAGUNA_S_FREE
      || m === OPENROUTER_LING_FLASH_FREE
      || m === OPENROUTER_NEMOTRON_SUPER_FREE
      || m === OPENROUTER_NEMOTRON_ULTRA_FREE
      || m.endsWith(':free')
      || m.startsWith('nvidia/')
      || m.startsWith('inclusionai/')
      || m.startsWith('poolside/')
    ) {
      return OFFICIAL_DEEPSEEK_V4_FLASH
    }
    if (m === OPENROUTER_DEEPSEEK_V4_FLASH || m === 'deepseek/deepseek-v4-flash') return OFFICIAL_DEEPSEEK_V4_FLASH
    if (m === OPENROUTER_DEEPSEEK_V4_PRO || m === 'deepseek/deepseek-v4-pro') return OFFICIAL_DEEPSEEK_V4_PRO
    if (m.startsWith('openrouter/')) {
      const rest = m.slice('openrouter/'.length).replace(/:free$/, '')
      if (rest === 'deepseek-v4-flash' || rest.endsWith('/deepseek-v4-flash')) return OFFICIAL_DEEPSEEK_V4_FLASH
      if (rest === 'deepseek-v4-pro' || rest.endsWith('/deepseek-v4-pro')) return OFFICIAL_DEEPSEEK_V4_PRO
    }
    return m
  }

  if (
    m === OPENROUTER_LAGUNA_S_FREE
    || m === OPENROUTER_LING_FLASH_FREE
    || m === OPENROUTER_NEMOTRON_SUPER_FREE
    || m === OPENROUTER_NEMOTRON_ULTRA_FREE
    || m.startsWith('nvidia/')
    || m.startsWith('inclusionai/')
    || m.startsWith('poolside/')
  ) {
    return OFFICIAL_DEEPSEEK_V4_FLASH
  }
  return m
}

export function isLocalVisionOllamaModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return false
  return (
    m.includes('minicpm')
    || m.includes('qwen2.5vl')
    || m.includes('qwen2.5-vl')
    || m.includes('llava')
    || m.includes('bakllava')
  )
}

export const TEXT_MODEL_OPTIONS = [
  { value: OFFICIAL_DEEPSEEK_V4_FLASH, label: 'DeepSeek V4 Flash · 妙飞（默认）' },
  { value: OPENROUTER_DEEPSEEK_V4_FLASH, label: 'DeepSeek V4 Flash · OpenRouter 付费' },
  { value: OPENROUTER_DEEPSEEK_V4_PRO, label: 'DeepSeek V4 Pro · OpenRouter 付费' },
  { value: OFFICIAL_DEEPSEEK_V4_PRO, label: 'DeepSeek V4 Pro · 官网' },
  { value: OPENROUTER_LAGUNA_S_FREE, label: 'Laguna S 2.1 · OpenRouter 免费' },
  { value: OPENROUTER_NEMOTRON_ULTRA_FREE, label: 'Nemotron 3 Ultra · OpenRouter 免费（备选）' },
  { value: OPENROUTER_NEMOTRON_SUPER_FREE, label: 'Nemotron 3 Super · OpenRouter 免费（备选）' },
  { value: 'qwen3.5-plus', label: 'Qwen 3.5 Plus · 4022' },
  { value: 'gpt-4o', label: 'GPT-4o · OpenAI 兼容' },
  ...LOCAL_TEXT_MODEL_OPTIONS,
] as const

const CLOUD_TEXT_MODELS = new Set([
  OPENROUTER_LAGUNA_S_FREE,
  OPENROUTER_LING_FLASH_FREE,
  OPENROUTER_NEMOTRON_SUPER_FREE,
  OPENROUTER_NEMOTRON_ULTRA_FREE,
  OPENROUTER_DEEPSEEK_V4_FLASH,
  OPENROUTER_DEEPSEEK_V4_PRO,
  OFFICIAL_DEEPSEEK_V4_FLASH,
  OFFICIAL_DEEPSEEK_V4_PRO,
  'openrouter/deepseek-v4-flash:free',
  'deepseek-v4-flash:free',
  'deepseek-v4-pro',
  'qwen3.5-plus',
  'gpt-4o',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'google/gemini-3-flash-preview',
  'gpt-4.1-mini',
])

const LEGACY_OLLAMA_TEXT_MODEL_TAGS = [
  'qwen3.5:9b',
  'qwen3.5:9b-96k',
  'qwen3.5:9b-128k',
  'qwen3.5:27b',
  'qwen3.5:20b-64k',
  'qwen2.5:14b',
  'deepseek-r1:14b',
  'deepseek-r1:14b-24k',
  'deepseek-r1:14b-64k',
] as const

export function isLocalOllamaTextModel(model?: string | null): boolean {
  const m = String(model || '').trim()
  if (!m || CLOUD_TEXT_MODELS.has(m) || CLOUD_TEXT_MODELS.has(normalizeTextModelId(m))) return false
  if (
    m.startsWith('glm-')
    || m.startsWith('openrouter/')
    || m.startsWith('nvidia/')
    || m.startsWith('inclusionai/')
    || m.startsWith('poolside/')
  ) return false
  if (LEGACY_OLLAMA_TEXT_MODEL_TAGS.some(tag => tag === m)) return true
  return /^[\w.-]+:[\w.-]+$/i.test(m)
}

export function isZhipuGlmTextModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  return m.startsWith('glm-')
}

export function isLocalAgentCapableModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return false
  if (isZhipuGlmTextModel(m)) return true
  if (CLOUD_TEXT_MODELS.has(m) || CLOUD_TEXT_MODELS.has(normalizeTextModelId(m))) return true
  return m.includes('qwen2.5') || m.includes('qwen2_5') || m.includes('qwen3.5') || m.includes('qwen3_5')
}

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

export function resolveScriptChatTextThinking(
  episode?: { textThinking?: boolean | null; text_thinking?: boolean | number | null } | null,
  bodyValue?: boolean | number | string | null,
): boolean {
  if (bodyValue !== undefined && bodyValue !== null && bodyValue !== '') {
    if (bodyValue === false || bodyValue === 0 || bodyValue === '0') return false
    if (bodyValue === true || bodyValue === 1 || bodyValue === '1') return true
  }
  const stored = episode?.textThinking ?? episode?.text_thinking
  if (stored === false || stored === 0) return false
  return true
}

export const LEGACY_DEFAULT_TEXT_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'google/gemini-3-flash-preview',
  'gpt-4.1-mini',
  'deepseek-v4-flash:free',
  'openrouter/deepseek-v4-flash:free',
  'inclusionai/ling-3.0-flash:free',
  'inclusionai/ling-3.0-flash',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-ultra:free',
  'nvidia/nemotron-3-ultra-550b:free',
  'glm-4.7-flash',
  'glm-4-flash-250414',
] as const

export function resolveLocalEpisodeTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = normalizeTextModelId(String(bodyModel || episode?.textModel || '').trim())
  if (picked && CLOUD_TEXT_MODELS.has(picked)) return picked
  if (picked && isLocalOllamaTextModel(picked)) return DEFAULT_LOCAL_TEXT_MODEL
  if (picked && LOCAL_TEXT_MODEL_OPTIONS.some(item => item.value === picked)) return picked
  if (picked && !CLOUD_TEXT_MODELS.has(picked)) return picked
  return DEFAULT_LOCAL_TEXT_MODEL
}

export function resolveEpisodeTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
  productionMode?: string | null,
) {
  if (usesLocalModelPipeline(productionMode)) {
    return resolveLocalEpisodeTextModel(episode, bodyModel)
  }
  const picked = normalizeTextModelId(String(bodyModel || episode?.textModel || '').trim())
  if (picked) return picked
  return DEFAULT_TEXT_MODEL
}

export function resolveNarrationEpisodeTextModel(
  episode?: { textModel?: string | null } | null,
) {
  const stored = normalizeTextModelId(String(episode?.textModel || '').trim())
  if (stored && stored !== DEFAULT_TEXT_MODEL && !(LEGACY_DEFAULT_TEXT_MODELS as readonly string[]).includes(stored)) {
    return stored
  }
  return DEFAULT_NARRATION_TEXT_MODEL
}

export function resolveNarrationImageTextModel(
  _episode?: { textModel?: string | null } | null,
  _bodyModel?: string | null,
) {
  // 配图文案批写 paragraph_prompts JSON（统一妙飞 DeepSeek）
  return DEFAULT_NARRATION_IMAGE_TEXT_MODEL
}

export function resolveNarrationScriptChatTextModel(
  bodyModel?: string | null,
  productionMode?: string | null,
  episode?: { textModel?: string | null; text_model?: string | null } | null,
) {
  if (usesLocalModelPipeline(productionMode)) {
    return resolveLocalScriptTextModel(bodyModel, episode)
  }
  const picked = normalizeTextModelId(String(bodyModel || '').trim())
  if (picked) return picked
  return DEFAULT_NARRATION_SCRIPT_CHAT_MODEL
}

export function resolveLocalScriptTextModel(
  bodyModel?: string | null,
  episode?: { textModel?: string | null; text_model?: string | null } | null,
) {
  const stored = String(episode?.textModel || episode?.text_model || '').trim()
  const picked = normalizeTextModelId(String(bodyModel || stored || '').trim())
  if (picked && CLOUD_TEXT_MODELS.has(picked)) return picked
  if (picked && isLocalOllamaTextModel(picked)) return DEFAULT_LOCAL_SCRIPT_TEXT_MODEL
  if (picked && LOCAL_TEXT_MODEL_OPTIONS.some(item => item.value === picked)) return picked
  if (picked && isZhipuGlmTextModel(picked)) return picked
  return DEFAULT_LOCAL_SCRIPT_TEXT_MODEL
}

export function resolveOllamaRunnableTextModel(model?: string | null): string {
  const picked = String(model || '').trim()
  if (picked && isLocalOllamaTextModel(picked)) return picked
  return DEFAULT_LOCAL_SCRIPT_TEXT_MODEL
}

export function resolveNarrationStoryboardTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
) {
  const picked = normalizeTextModelId(String(bodyModel || '').trim())
  if (picked) return picked
  return resolveNarrationEpisodeTextModel(episode)
}

export function isKnownTextModel(model?: string | null): boolean {
  const m = normalizeTextModelId(model)
  return TEXT_MODEL_OPTIONS.some(item => item.value === m)
}
