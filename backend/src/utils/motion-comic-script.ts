/** 动态漫台本清洗：去片尾引流、补说话人前缀 */

const OUTRO_BLOCK_START_RE = /\n(?:故事还没结束|下期继续(?:更新)?|记得点(?:个)?关注|不错过任何一集|咱们下期再见)\s*$/m

const OUTRO_LINE_RES: RegExp[] = [
  /^故事还没结束$/,
  /^下期继续(?:更新)?$/,
  /^记得点(?:个)?关注$/,
  /^不错过任何一集$/,
  /^我是那个.+$/,
  /^也是那个.+$/,
  /^咱们下期再见$/,
  /^动态漫剧本.*$/,
  /^记得关注$/,
  /^点个关注$/,
  /^关注不迷路$/,
  /^未完待续$/,
]

const SPEAKER_PREFIX_RE = /^[^：:\n]{1,16}[:：]\s*\S/

export function isMotionComicOutroLine(line: string): boolean {
  const t = String(line || '').trim()
  if (!t) return false
  if (OUTRO_LINE_RES.some(re => re.test(t))) return true
  return /(?:记得|点个|关注一下|订阅|点赞).{0,6}(?:关注|订阅)/.test(t)
    || /^(?:我是|咱们).{0,12}(?:下期|再见|关注)/.test(t)
}

/** 去掉片尾「下期继续 / 记得关注」等动态漫引流句 */
export function stripMotionComicOutro(script: string): string {
  let text = String(script || '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  const blockMatch = text.match(OUTRO_BLOCK_START_RE)
  if (blockMatch?.index != null && blockMatch.index >= 0) {
    text = text.slice(0, blockMatch.index).trimEnd()
  }

  const lines = text.split('\n')
  let cutFrom = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (!t) {
      if (cutFrom < lines.length) cutFrom = i
      continue
    }
    if (isMotionComicOutroLine(t)) {
      cutFrom = i
      continue
    }
    break
  }
  if (cutFrom < lines.length) {
    text = lines.slice(0, cutFrom).join('\n').trimEnd()
  }
  return text
}

export function lineHasSpeakerPrefix(line: string): boolean {
  return SPEAKER_PREFIX_RE.test(String(line || '').trim())
}

/** 无说话人前缀的行补「旁白：」 */
export function ensureMotionComicSpeakerPrefixes(script: string): string {
  const text = String(script || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return ''

  return text.split('\n').map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return ''
    if (lineHasSpeakerPrefix(trimmed)) return trimmed
    return `旁白：${trimmed}`
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export type MotionComicScriptLine = { speaker: string; dialogue: string }

const TITLE_LINE_RE = /^(?:本期|本集)?故事\s*[:：]/

export function parseMotionComicSpeakerLines(body: string): MotionComicScriptLine[] {
  return String(body || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)[:：]\s*(.+)$/s)
      if (m) {
        const speaker = m[1].replace(/[（(].+?[)）]/g, '').trim() || '旁白'
        return { speaker, dialogue: m[2].trim() }
      }
      return { speaker: '旁白', dialogue: line }
    })
}

/** 正文行是否几乎都带说话人前缀（可直接规则拆镜） */
export function motionComicScriptHasSpeakerPrefixes(body: string, threshold = 0.85): boolean {
  const lines = String(body || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return false
  const prefixed = lines.filter(lineHasSpeakerPrefix).length
  return prefixed / lines.length >= threshold
}

export function sanitizeMotionComicScript(script: string, options?: { ensureSpeakers?: boolean }): string {
  let text = stripMotionComicOutro(script)
  if (options?.ensureSpeakers) {
    text = ensureMotionComicSpeakerPrefixes(text)
  }
  return text.trim()
}

export function extractMotionComicTitleShot(title: string | null, bodyLines: MotionComicScriptLine[]): MotionComicScriptLine | null {
  if (title?.trim()) {
    const hook = title.trim()
    const dialogue = TITLE_LINE_RE.test(hook) ? hook : `本期故事：${hook.replace(/^本期故事\s*[:：]\s*/, '')}`
    return { speaker: '剧中', dialogue }
  }
  const first = bodyLines[0]
  if (first && (first.speaker === '剧中' || TITLE_LINE_RE.test(first.dialogue) || TITLE_LINE_RE.test(`${first.speaker}：${first.dialogue}`))) {
    return {
      speaker: '剧中',
      dialogue: TITLE_LINE_RE.test(first.dialogue) ? first.dialogue : `本期故事：${first.dialogue}`,
    }
  }
  return null
}
