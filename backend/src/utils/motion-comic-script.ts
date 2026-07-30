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

/** 空桥接旁白（无信息量，只用来引出下一句对白） */
const EMPTY_BRIDGE_NARRATION_RE =
  /^旁白\s*[:：]\s*(?:直接对他说|直接对她说|我却转头就对他说|转头就对他说|转头就对她说|接着(?:就)?开口道|接着说道|于是说道|然后说道|于是开口|接着开口|开口道|说道|对他(?:说)?|对她(?:说)?)\s*[。.!！？]?$/

/** 删掉「直接对他说」类空桥接旁白行 */
export function stripMotionComicEmptyBridgeNarration(script: string): string {
  const text = String(script || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return ''
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      return !EMPTY_BRIDGE_NARRATION_RE.test(t)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripOuterQuotes(s: string): string {
  return String(s || '')
    .trim()
    .replace(/^[「『""']+/, '')
    .replace(/[」』""']+$/, '')
    .trim()
}

function normalizeDialogueSpeaker(raw: string): string {
  const name = String(raw || '')
    .replace(/[（(].+?[)）]/g, '')
    .replace(/[的地得]$/, '')
    .trim()
  if (!name || name === '我' || name === '他' || name === '她') return name === '我' ? '我' : name || '我'
  // 「那个男人」「中年男人」等过泛称呼仍可用，但去掉尾部语气词
  return name.replace(/[啊呀呢吧]$/, '') || '我'
}

/**
 * 确定性：把旁白里的喊话/引语拆成对白行（不依赖 LLM）
 * 例：旁白：大喊一声快跑 → 我：快跑；旁白：李伯喊道：「谢谢」→ 李伯：谢谢
 */
export function rewriteMotionComicSpeechNarrationToDialogue(script: string): string {
  const text = String(script || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return ''

  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      out.push('')
      continue
    }
    const converted = convertNarrationSpeechLine(line)
    if (Array.isArray(converted)) out.push(...converted)
    else out.push(converted)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function convertNarrationSpeechLine(line: string): string | string[] {
  const m = line.match(/^旁白\s*[:：]\s*(.+)$/)
  if (!m) return line
  const body = m[1].trim()
  if (!body) return line

  // 我/旁白：大喊一声快跑别回头
  let hit = body.match(/^(?:我)?大(?:喊|叫)一声\s*(.+)$/)
  if (hit) {
    const speech = stripOuterQuotes(hit[1])
    if (speech) return `我：${speech}`
  }

  // 李伯喊道：「谢谢」/ 顾客问：「多少钱」
  hit = body.match(
    /^(.{1,12}?)(?:对[^「『"']{0,10})?(?:说|喊|叫|问|吼|嚷|喝|答|回)(?:道|道着|着)?[：:，,]?\s*[「『""](.+?)[」』""]\s*$/,
  )
  if (hit) {
    const speaker = normalizeDialogueSpeaker(hit[1])
    const speech = hit[2].trim()
    if (speaker && speech && speaker.length <= 12) return `${speaker}：${speech}`
  }

  // 李伯说：宁可信其有（无引号短句）
  hit = body.match(/^(.{1,12}?)(?:说|喊|问|吼|嚷)(?:道)?[：:]\s*(.+)$/)
  if (hit) {
    const speaker = normalizeDialogueSpeaker(hit[1])
    const speech = stripOuterQuotes(hit[2])
    if (
      speaker
      && speech
      && speaker.length <= 12
      && speech.length >= 2
      && speech.length <= 24
      && !/说是|说道|以为|觉得|开始/.test(hit[1])
    ) {
      return `${speaker}：${speech}`
    }
  }

  // 李伯站在楼下仰头大喊谢谢
  hit = body.match(/^(.{1,12}?)(?:(?:站在|在)[^大]{0,16})?(?:仰头|抬头)?大喊\s*(.+)$/)
  if (hit && !/说是/.test(body)) {
    const speaker = normalizeDialogueSpeaker(hit[1])
    const speech = stripOuterQuotes(hit[2])
    if (speaker && speech && speaker.length <= 8 && speech.length <= 24 && !/[，,]/.test(speaker)) {
      const yellAt = body.indexOf('大喊')
      const beforeYell = yellAt > 0 ? body.slice(0, yellAt).trim() : ''
      if (beforeYell.length > speaker.length + 2) {
        return [`旁白：${beforeYell}`, `${speaker}：${speech}`]
      }
      return `${speaker}：${speech}`
    }
  }

  // 纯引语旁白：「xxx」
  hit = body.match(/^[「『""](.+?)[」』""]\s*$/)
  if (hit?.[1]?.trim()) return `我：${hit[1].trim()}`

  return line
}

export type MotionComicSpeakerRatio = {
  narration: number
  dialogue: number
  juzhong: number
  other: number
  body: number
  /** 旁白占正文（旁白+对白）比例，0～1；无正文时为 0 */
  narrationRatio: number
  dialogueRatio: number
}

/** 统计说话人行配比（不含片头「剧中：」） */
export function measureMotionComicSpeakerRatio(script: string): MotionComicSpeakerRatio {
  let narration = 0
  let dialogue = 0
  let juzhong = 0
  let other = 0
  for (const raw of String(script || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([^：:]{1,20})[：:](.*)$/)
    if (!m) {
      other += 1
      continue
    }
    const speaker = m[1].trim()
    if (speaker === '剧中') {
      juzhong += 1
      continue
    }
    if (speaker === '旁白') narration += 1
    else dialogue += 1
  }
  const body = narration + dialogue
  return {
    narration,
    dialogue,
    juzhong,
    other,
    body,
    narrationRatio: body ? narration / body : 0,
    dialogueRatio: body ? dialogue / body : 0,
  }
}

/** 旁白占比硬上限：超过即触发自动压旁白（对标 ≤35% / 理想约 30%） */
export const MOTION_COMIC_NARRATION_RATIO_SOFT_MAX = 0.35
/** 理想旁白占比（修稿提示用） */
export const MOTION_COMIC_NARRATION_RATIO_TARGET = 0.30

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
  text = stripMotionComicEmptyBridgeNarration(text)
  text = rewriteMotionComicSpeechNarrationToDialogue(text)
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
