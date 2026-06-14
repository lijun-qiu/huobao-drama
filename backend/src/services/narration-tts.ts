import { isNarrationStoryboard, parseNarrationImageMeta, sortStoryboardsByOrder } from './narration-image.js'

export type NarrationTtsMode = 'new' | 'inherit' | 'copy'

const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

export function parseDialogueForTTS(dialogue?: string | null) {
  const raw = dialogue?.trim() || ''
  if (!raw) return { speaker: '', pureText: '', ignorable: true }
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').replace(/\s+/g, ' ').trim()
  const ignorable = (!!speaker && IGNORE_TTS_SPEAKERS.test(speaker)) || !pureText || IGNORE_TTS_TEXT.test(pureText)
  return { speaker, pureText, ignorable }
}

/** 片头「剧中」叠字与旁白配音均用旁白角色音色 */
export function resolveNarrationVoiceId(
  speaker: string,
  chars: Array<{ name: string; voiceStyle?: string | null }>,
  options?: { isTitleShot?: boolean },
) {
  if (options?.isTitleShot || speaker === '剧中') {
    const narrator = chars.find(c => c.name === '旁白')
    if (narrator?.voiceStyle) return narrator.voiceStyle
  }
  if (speaker) {
    const found = chars.find(c => c.name === speaker)
    if (found?.voiceStyle) return found.voiceStyle
  }
  return 'alloy'
}

export function normalizeTtsText(text: string) {
  return text.replace(/\s/g, '').trim()
}

type TtsSb = {
  id: number
  storyboardNumber: number
  dialogue?: string | null
  ttsAudioUrl?: string | null
  referenceImages?: string | null
}

export function getStoryboardOwnTts(sb: TtsSb) {
  return sb.ttsAudioUrl || null
}

export function resolveNarrationTtsMode(meta: ReturnType<typeof parseNarrationImageMeta>): NarrationTtsMode {
  if (meta.narration_tts_mode) return meta.narration_tts_mode
  if (meta.narration_shot_type === 'title') return 'new'
  if (meta.narration_image_mode === 'new') return 'new'
  if (meta.narration_image_mode === 'copy') return 'copy'
  return 'inherit'
}

export function narrationShotNeedsOwnTts(sb: TtsSb) {
  if (isNarrationStoryboard(sb)) return true
  const meta = parseNarrationImageMeta(sb.referenceImages)
  if (meta.narration_shot_type === 'title') return true
  const mode = resolveNarrationTtsMode(meta)
  return mode !== 'inherit' && mode !== 'copy'
}

export function findReusableTtsByText(storyboards: TtsSb[], text: string, excludeId?: number) {
  const target = normalizeTtsText(text)
  if (!target) return null
  const ordered = sortStoryboardsByOrder(storyboards)
  for (const sb of ordered) {
    if (excludeId != null && sb.id === excludeId) continue
    const path = getStoryboardOwnTts(sb)
    if (!path) continue
    const parsed = parseDialogueForTTS(sb.dialogue)
    if (parsed.ignorable) continue
    if (normalizeTtsText(parsed.pureText) === target) return path
  }
  return null
}

export function resolveStoryboardTtsSource(storyboards: TtsSb[], storyboardId: number) {
  const ordered = sortStoryboardsByOrder(storyboards)
  const idx = ordered.findIndex(sb => sb.id === storyboardId)
  if (idx < 0) return null

  const current = ordered[idx]
  const own = getStoryboardOwnTts(current)
  if (own) {
    return { path: own, inherited: false, sourceId: current.id }
  }

  if (isNarrationStoryboard(current)) return null

  const meta = parseNarrationImageMeta(current.referenceImages)
  const mode = resolveNarrationTtsMode(meta)
  if (mode === 'new' || meta.narration_shot_type === 'title') return null

  for (let i = idx - 1; i >= 0; i--) {
    const path = getStoryboardOwnTts(ordered[i])
    if (path) {
      return { path, inherited: true, sourceId: ordered[i].id }
    }
  }
  return null
}

export function narrationShotTtsReady(storyboards: TtsSb[], sb: TtsSb) {
  const parsed = parseDialogueForTTS(sb.dialogue)
  if (parsed.ignorable) return true
  return !!resolveStoryboardTtsSource(storyboards, sb.id)?.path
}

export function narrationTtsReady(storyboards: TtsSb[]) {
  if (!storyboards.length) return false
  return storyboards.every(sb => narrationShotTtsReady(storyboards, sb))
}
