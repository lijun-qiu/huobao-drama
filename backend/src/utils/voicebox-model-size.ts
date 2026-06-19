export type VoiceboxModelSize = '0.6B' | '1.7B'

export const DEFAULT_VOICEBOX_MODEL_SIZE: VoiceboxModelSize = '0.6B'

export function resolveVoiceboxModelSize(value?: string | null): VoiceboxModelSize {
  const raw = String(value ?? process.env.VOICEBOX_MODEL_SIZE ?? DEFAULT_VOICEBOX_MODEL_SIZE).trim()
  if (raw === '1.7B' || raw === '1.7b') return '1.7B'
  return '0.6B'
}
