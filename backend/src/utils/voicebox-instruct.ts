/** Voicebox Qwen CustomVoice 风格/感情 instruct（自然语言） */
export const VOICEBOX_INSTRUCT_MAX_LENGTH = 200

export function resolveVoiceboxInstruct(value?: string | null): string | undefined {
  const trimmed = String(value ?? process.env.VOICEBOX_DEFAULT_INSTRUCT ?? '').trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, VOICEBOX_INSTRUCT_MAX_LENGTH)
}
