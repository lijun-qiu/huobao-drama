import { DEFAULT_EDGE_VOICE, EDGE_VOICE_OPTIONS, resolveEdgeVoice } from './edge-tts-local.js'
import { GSV_VOICE_PREFIX, resolveGptSovitsVoiceDisplayName } from './gpt-sovits-tts.js'
import { inferCharacterGender, inferVoiceGenderFromLabel } from './local-voice-assign.js'

const VOICEBOX_PROFILE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRESET_REF_PREFIX = 'preset:'

export type LocalTtsEngine = 'edge' | 'voicebox' | 'gptsovits' | 'indextts'

export function isEdgeVoiceId(voiceId?: string | null): boolean {
  return /^(zh|en|ja|ko)-/i.test(String(voiceId || '').trim())
}

export function isVoiceboxVoiceId(voiceId?: string | null): boolean {
  const raw = String(voiceId || '').trim()
  if (!raw) return false
  if (raw.startsWith(PRESET_REF_PREFIX)) return true
  return VOICEBOX_PROFILE_UUID_RE.test(raw)
}

export function isGptSovitsVoiceId(voiceId?: string | null): boolean {
  return String(voiceId || '').trim().startsWith(GSV_VOICE_PREFIX)
}

/** GPT-SoVITS 与 IndexTTS2 共用 gsv: 参考音 */
export function isClonedRefVoiceId(voiceId?: string | null): boolean {
  return isGptSovitsVoiceId(voiceId)
}

export function resolveLocalTtsEngine(
  voiceStyle?: string | null,
  voiceProvider?: string | null,
  fallbackEngine: LocalTtsEngine = 'edge',
): LocalTtsEngine {
  const provider = String(voiceProvider || '').trim().toLowerCase()
  if (provider === 'edge') return 'edge'
  if (provider === 'voicebox') return 'voicebox'
  if (provider === 'gptsovits') return 'gptsovits'
  if (provider === 'indextts') return 'indextts'
  const raw = String(voiceStyle || '').trim()
  if (isEdgeVoiceId(raw)) return 'edge'
  if (isClonedRefVoiceId(raw)) {
    if (fallbackEngine === 'indextts') return 'indextts'
    return 'gptsovits'
  }
  if (isVoiceboxVoiceId(raw)) return 'voicebox'
  return fallbackEngine
}

export function resolveLocalTtsVoiceInput(
  voiceStyle?: string | null,
  voiceProvider?: string | null,
  fallback?: { engine: LocalTtsEngine; voice: string },
): { engine: LocalTtsEngine; voice: string } {
  const raw = String(voiceStyle || '').trim()
  const engine = resolveLocalTtsEngine(raw, voiceProvider, fallback?.engine || 'edge')
  if (engine === 'edge') {
    return { engine, voice: resolveEdgeVoice(raw || fallback?.voice) }
  }
  if (engine === 'gptsovits' || engine === 'indextts') {
    if (raw) return { engine, voice: raw }
    if (fallback?.voice && (isClonedRefVoiceId(fallback.voice) || fallback.engine === engine)) {
      return { engine, voice: fallback.voice }
    }
    throw new Error(engine === 'indextts' ? '未选择 IndexTTS2 克隆音色' : '未选择 GPT-SoVITS 音色')
  }
  if (raw) return { engine, voice: raw }
  if (fallback?.voice) return { engine: fallback.engine || 'voicebox', voice: fallback.voice }
  throw new Error('未选择 Voicebox 音色')
}

export function findCharacterVoiceMeta(
  speaker: string,
  chars: Array<{ name: string; voiceStyle?: string | null; voiceProvider?: string | null; role?: string | null; appearance?: string | null; description?: string | null }>,
  options?: { isTitleShot?: boolean },
): { name: string; voiceStyle: string; voiceProvider?: string | null; role?: string | null; appearance?: string | null; description?: string | null } | null {
  const targetName = options?.isTitleShot || speaker === '剧中' ? '旁白' : speaker
  if (!targetName) return null
  const found = chars.find(c => c.name === targetName)
  if (!found?.voiceStyle) return null
  return {
    name: found.name,
    voiceStyle: found.voiceStyle,
    voiceProvider: found.voiceProvider,
    role: found.role,
    appearance: found.appearance,
    description: found.description,
  }
}

export function mapLocalVoiceToEdge(
  charMeta: { name: string; voiceStyle?: string | null; voiceProvider?: string | null; role?: string | null; appearance?: string | null; description?: string | null } | null,
  fallbackVoice?: string | null,
): string {
  const raw = String(charMeta?.voiceStyle || '').trim()
  if (isEdgeVoiceId(raw)) return resolveEdgeVoice(raw)
  const fallback = String(fallbackVoice || '').trim()
  if (isEdgeVoiceId(fallback)) return resolveEdgeVoice(fallback)
  if (isGptSovitsVoiceId(raw)) {
    const label = resolveGptSovitsVoiceDisplayName(raw)
    if (label) {
      const voiceGender = inferVoiceGenderFromLabel(label)
      if (voiceGender === 'female') {
        return EDGE_VOICE_OPTIONS.find(v => v.voice_id === 'zh-CN-XiaoxiaoNeural')?.voice_id || DEFAULT_EDGE_VOICE
      }
      if (voiceGender === 'male') {
        return EDGE_VOICE_OPTIONS.find(v => v.voice_id === 'zh-CN-YunxiNeural')?.voice_id || DEFAULT_EDGE_VOICE
      }
    }
  }
  const gender = inferCharacterGender(charMeta ?? { name: '旁白' })
  if (gender === 'female') {
    return EDGE_VOICE_OPTIONS.find(v => v.voice_id === 'zh-CN-XiaoxiaoNeural')?.voice_id || DEFAULT_EDGE_VOICE
  }
  if (gender === 'male') {
    return EDGE_VOICE_OPTIONS.find(v => v.voice_id === 'zh-CN-YunxiNeural')?.voice_id || DEFAULT_EDGE_VOICE
  }
  return DEFAULT_EDGE_VOICE
}

/** 本地 TTS：角色已分配音色时优先用角色，global local_voice 不得覆盖 */
export function resolveStoryboardLocalTtsInput(
  speaker: string,
  chars: Array<{ name: string; voiceStyle?: string | null; voiceProvider?: string | null; role?: string | null; appearance?: string | null; description?: string | null }>,
  options: {
    isTitleShot?: boolean
    fallbackEngine: LocalTtsEngine
    fallbackVoice?: string | null
    preferSpeakerVoice?: boolean
    forceEngine?: LocalTtsEngine
    allowVoicebox?: boolean
    allowGptsovits?: boolean
    allowIndextts?: boolean
  },
): { engine: LocalTtsEngine; voiceInput: string; speakerName: string; usedCharacterVoice: boolean } {
  const charMeta = findCharacterVoiceMeta(speaker, chars, { isTitleShot: options.isTitleShot })
  const fallbackVoice = options.preferSpeakerVoice
    ? undefined
    : (String(options.fallbackVoice || '').trim() || undefined)
  const characterVoice = String(charMeta?.voiceStyle || '').trim()
  const speakerName = charMeta?.name || (options.isTitleShot || speaker === '剧中' ? '旁白' : speaker)
  const preferredEngine = options.forceEngine || options.fallbackEngine

  const shouldForceEdge = (engine: LocalTtsEngine) => {
    if (options.forceEngine === 'edge') return true
    if (options.forceEngine && engine === options.forceEngine) return false
    if (engine === 'voicebox' && options.allowVoicebox === false) return true
    if (engine === 'gptsovits' && options.allowGptsovits === false) return true
    if (engine === 'indextts' && options.allowIndextts === false) return true
    return false
  }

  if (characterVoice && characterVoice !== 'alloy') {
    const resolved = resolveLocalTtsVoiceInput(
      characterVoice,
      charMeta?.voiceProvider,
      { engine: preferredEngine, voice: fallbackVoice || characterVoice || DEFAULT_EDGE_VOICE },
    )
    if (shouldForceEdge(resolved.engine)) {
      return {
        engine: 'edge',
        voiceInput: mapLocalVoiceToEdge(charMeta, fallbackVoice),
        speakerName,
        usedCharacterVoice: true,
      }
    }
    return {
      engine: resolved.engine,
      voiceInput: resolved.voice,
      speakerName,
      usedCharacterVoice: true,
    }
  }

  const resolved = resolveLocalTtsVoiceInput(
    fallbackVoice || undefined,
    undefined,
    { engine: preferredEngine, voice: fallbackVoice || DEFAULT_EDGE_VOICE },
  )
  if (shouldForceEdge(resolved.engine)) {
    return {
      engine: 'edge',
      voiceInput: mapLocalVoiceToEdge(null, fallbackVoice),
      speakerName,
      usedCharacterVoice: false,
    }
  }
  return {
    engine: resolved.engine,
    voiceInput: resolved.voice,
    speakerName,
    usedCharacterVoice: false,
  }
}
