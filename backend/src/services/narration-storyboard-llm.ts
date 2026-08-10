import { buildNarrationStoryboardLLMSystem } from '../constants/art-styles.js'
import {
  NARRATION_SCRIPT_CHARS_PER_MINUTE,
  NARRATION_VIDEO_SHOT_SEC_MAX,
  NARRATION_VIDEO_SHOT_SEC_MIN,
  NARRATION_VIDEO_TARGET_SHOT_CHARS,
  NARRATION_VIDEO_TARGET_SHOT_SEC,
} from '../constants/narration-video-timing.js'
import { resolveNarrationStoryboardTextModel } from '../constants/text-models.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { markSentencesEmphasisHeuristic, stripEmphasisMarkers } from '../utils/subtitle-emphasis.js'
import { assertTextConfigHasCredentials, getTextConfig } from './ai.js'
import {
  splitNarrationSentencesWithMeta,
  splitTitleSentencesWithMeta,
  type NarrationSentenceItem,
} from './narration-scene-detect.js'
import { callTextChat } from './text-chat.js'

const STORYBOARD_LLM_TIMEOUT_MS = 600_000
/** 非超时错误最多再试 1 次；超时不重试，避免免费模型卡 15 分钟 */
const STORYBOARD_LLM_RETRIES = 1

function isLlmTimeoutError(message: string): boolean {
  return /timeout|aborted|ETIMEDOUT|ECONNRESET|超时|未响应|连不上/i.test(message)
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    // fall through
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function parseFullStoryboardResponse(text: string): { titleSentences: string[]; sentences: string[] } | null {
  const obj = extractJsonObject(text)
  if (!obj) return null

  const bodyRaw = obj.sentences
  if (!Array.isArray(bodyRaw) || !bodyRaw.length) return null
  const sentences = bodyRaw.map(line => String(line ?? '').trim()).filter(Boolean)
  if (!sentences.length) return null

  const titleRaw = obj.title_sentences
  const titleSentences = Array.isArray(titleRaw)
    ? titleRaw.map(line => String(line ?? '').trim()).filter(Boolean)
    : []

  return { titleSentences, sentences }
}

function validateSplitFidelity(original: string, sentences: string[]): boolean {
  const origChars = stripEmphasisMarkers(original).replace(/\s/g, '')
  const splitChars = sentences.map(s => stripEmphasisMarkers(s).replace(/\s/g, '')).join('')
  if (!origChars.length) return false
  const ratio = Math.abs(origChars.length - splitChars.length) / origChars.length
  return ratio <= 0.08
}

function splitBodyParagraphs(body: string): string[] {
  return body.replace(/\r\n/g, '\n').trim().split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
}

function attachParagraphIndices(body: string, sentences: string[]): NarrationSentenceItem[] {
  const paragraphs = splitBodyParagraphs(body)
  if (!paragraphs.length) {
    return sentences.map(sentence => ({ sentence, paragraphIndex: 0 }))
  }

  const norm = (s: string) => stripEmphasisMarkers(s).replace(/\s/g, '')
  const paraNorms = paragraphs.map(norm)
  const items: NarrationSentenceItem[] = []
  let paragraphIndex = 0
  let offset = 0

  for (const sentence of sentences) {
    const sentenceNorm = norm(sentence)
    if (!sentenceNorm) continue

    let matched = false
    while (paragraphIndex < paraNorms.length) {
      const rest = paraNorms[paragraphIndex].slice(offset)
      if (
        rest.startsWith(sentenceNorm)
        || sentenceNorm.startsWith(rest.slice(0, Math.max(1, Math.min(sentenceNorm.length, rest.length))))
      ) {
        items.push({ sentence, paragraphIndex })
        offset += sentenceNorm.length
        if (offset >= paraNorms[paragraphIndex].length) {
          paragraphIndex += 1
          offset = 0
        }
        matched = true
        break
      }
      paragraphIndex += 1
      offset = 0
    }

    if (!matched) {
      items.push({
        sentence,
        paragraphIndex: Math.min(Math.max(paragraphIndex, 0), paragraphs.length - 1),
      })
    }
  }

  return items
}

async function splitFullScriptWithLLM(
  title: string | null,
  body: string,
  options: {
    textModel: string
    titleHook?: string | null
  },
): Promise<{ titleItems: NarrationSentenceItem[]; sentenceItems: NarrationSentenceItem[] } | null> {
  const bodyTrimmed = body.trim()
  const titleTrimmed = title?.trim() || ''
  if (!bodyTrimmed && !titleTrimmed) {
    return { titleItems: [], sentenceItems: [] }
  }

  const plainBody = stripEmphasisMarkers(bodyTrimmed)
  const plainTitle = titleTrimmed ? stripEmphasisMarkers(titleTrimmed) : ''

  const user = JSON.stringify({
    ...(plainTitle ? { title: plainTitle } : {}),
    ...(plainBody ? { body: plainBody } : {}),
    ...(options.titleHook?.trim() ? { title_hook: options.titleHook.trim() } : {}),
    output_format: {
      title_sentences: 'string[]，片头句（无 title 则 []）',
      sentences: 'string[]，正文一镜一句，可含 **',
    },
  })

  const system = buildNarrationStoryboardLLMSystem()
  let lastError = ''

  for (let attempt = 0; attempt <= STORYBOARD_LLM_RETRIES; attempt++) {
    if (attempt > 0) await sleep(2_000 * attempt)
    try {
      const text = await callTextChat(
        system,
        user,
        options.textModel,
        false,
        STORYBOARD_LLM_TIMEOUT_MS,
        true,
      )
      const parsed = parseFullStoryboardResponse(text)
      if (!parsed) {
        lastError = 'invalid storyboard JSON'
        continue
      }
      if (plainBody && !validateSplitFidelity(plainBody, parsed.sentences)) {
        lastError = 'body fidelity check failed'
        continue
      }
      if (
        plainTitle
        && parsed.titleSentences.length
        && !validateSplitFidelity(plainTitle, parsed.titleSentences)
      ) {
        lastError = 'title fidelity check failed'
        continue
      }

      const titleItems: NarrationSentenceItem[] = plainTitle
        ? (parsed.titleSentences.length
          ? parsed.titleSentences.map((sentence, index) => ({ sentence, paragraphIndex: index }))
          : [{ sentence: plainTitle, paragraphIndex: 0 }])
        : []

      const sentenceItems = plainBody
        ? attachParagraphIndices(bodyTrimmed, parsed.sentences)
        : []

      return { titleItems, sentenceItems }
    } catch (err: unknown) {
      lastError = String((err as Error)?.message || err || 'unknown error')
      // 超时重试只会再空等 5 分钟，直接走规则拆句落库
      if (isLlmTimeoutError(lastError) || attempt >= STORYBOARD_LLM_RETRIES) {
        logTaskWarn('NarrationStoryboardLLM', 'full-script-fallback-rules', { error: lastError })
        return null
      }
    }
  }

  logTaskWarn('NarrationStoryboardLLM', 'full-script-fallback-rules', { error: lastError })
  return null
}

export type StoryboardLLMOptions = {
  textModel?: string | null
  textThinking?: boolean
  episodeTextModel?: string | null
  titleHook?: string | null
  onProgress?: (patch: { message: string; percent?: number; phase?: string }) => void
}

export type StoryboardLLMResult = {
  titleItems: NarrationSentenceItem[]
  sentenceItems: NarrationSentenceItem[]
  usedLlmSplit: boolean
  model: string
}

/** 旁白分镜：整稿一次 LLM 拆镜 + ** 标注；失败时规则拆句立刻返回 */
export async function buildStoryboardSentenceItemsWithLLM(
  title: string | null,
  body: string,
  options?: StoryboardLLMOptions,
): Promise<StoryboardLLMResult> {
  const textModel = resolveNarrationStoryboardTextModel(
    options?.episodeTextModel ? { textModel: options.episodeTextModel } : null,
    options?.textModel,
  )
  const config = getTextConfig(textModel)
  assertTextConfigHasCredentials(config)

  const report = (message: string, percent?: number, phase?: string) => {
    try {
      options?.onProgress?.({ message, percent, phase })
    } catch {
      // ignore disconnected SSE
    }
  }

  const ruleTitleItems = title ? splitTitleSentencesWithMeta(title) : []
  const ruleBodyItems = body.trim() ? splitNarrationSentencesWithMeta(body) : []

  logTaskProgress('NarrationStoryboardLLM', 'start', {
    model: textModel,
    bodyChars: stripEmphasisMarkers(body).replace(/\s/g, '').length,
    ruleSentenceCount: ruleBodyItems.length,
  })

  report(
    `正在连接模型：${textModel}（整稿拆镜，最长约 ${Math.round(STORYBOARD_LLM_TIMEOUT_MS / 1000)}s）…`,
    18,
    'llm-connect',
  )

  let lastFailHint = ''
  try {
    const llmResult = await splitFullScriptWithLLM(title, body, {
      textModel,
      titleHook: options?.titleHook ?? title,
    })
    if (llmResult) {
      report(`模型已返回：${textModel}，正在整理镜头…`, 68, 'llm')
      logTaskSuccess('NarrationStoryboardLLM', 'done', {
        titleCount: llmResult.titleItems.length,
        sentenceCount: llmResult.sentenceItems.length,
        usedLlmSplit: true,
      })
      return { ...llmResult, usedLlmSplit: true, model: textModel }
    }
    lastFailHint = '模型未返回有效拆镜结果'
  } catch (err: unknown) {
    lastFailHint = String((err as Error)?.message || err || 'unknown')
    logTaskWarn('NarrationStoryboardLLM', 'full-script-error', {
      error: lastFailHint,
    })
  }

  // 整稿 LLM 失败后：规则拆句 + 本地 ** 启发，立刻返回以便写库。
  report(
    `${lastFailHint || '模型未连上/未响应'} → 改用本地规则拆句写入`,
    55,
    'fallback',
  )
  const originals = ruleBodyItems.map(item => stripEmphasisMarkers(item.sentence))
  const marked = markSentencesEmphasisHeuristic(originals)
  const sentenceItems = ruleBodyItems.map((item, index) => ({
    ...item,
    sentence: marked[index] ?? item.sentence,
  }))

  logTaskWarn('NarrationStoryboardLLM', 'rules-fallback-immediate', {
    titleCount: ruleTitleItems.length,
    sentenceCount: sentenceItems.length,
  })
  logTaskSuccess('NarrationStoryboardLLM', 'done', {
    titleCount: ruleTitleItems.length,
    sentenceCount: sentenceItems.length,
    usedLlmSplit: false,
  })

  return {
    titleItems: ruleTitleItems,
    sentenceItems,
    usedLlmSplit: false,
    model: textModel,
  }
}

const NARRATION_SHOT_VISUAL_SYSTEM = [
  '你是解说视频分镜美术指导：根据每镜「说话人：台词」（可多行、多说话人）写可直接生图的画面描述。',
  `每镜口播约 ${NARRATION_VIDEO_TARGET_SHOT_SEC} 秒（按解说脚本约 ${NARRATION_SCRIPT_CHARS_PER_MINUTE} 字/分钟，约 ${NARRATION_VIDEO_TARGET_SHOT_CHARS} 字），描述对应这一镜要定格/开场的画面，供后续一镜一图、图生视频使用。`,
  '每条描述写：场景地点、画面中人物（全名）、姿态动作、表情氛围、景别与光影；禁止抄台词原文；禁止镜头运动术语堆砌。',
  '旁白镜写剧情对应的可见场面；对白镜写说话人开口的场面；多说话人同镜写同框互动场面。',
  '【本镜锁定】只写本镜 line(s) 里已经发生的人、动作与物件；禁止把邻镜或后文的情节/道具提前写入本镜。',
  '只输出 JSON：{"visuals":["镜1画面","镜2画面",...]}，长度必须与输入 shots 相同。不要 markdown。',
].join('\n')

/** 解说视频 LLM 分镜：约 10s/108 字一镜，可合并不同说话人，并写画面描述 */
const NARRATION_VIDEO_LLM_PACK_SYSTEM = [
  '你是解说视频分镜导演：把「说话人：台词」行打包成镜头序列。',
  '',
  `【节奏】按解说脚本约 ${NARRATION_SCRIPT_CHARS_PER_MINUTE} 字/分钟：每镜口播约 ${NARRATION_VIDEO_TARGET_SHOT_SEC} 秒 ≈ ${NARRATION_VIDEO_TARGET_SHOT_CHARS} 个汉字（允许约 ${Math.round(NARRATION_VIDEO_TARGET_SHOT_CHARS * 0.7)}～${Math.round(NARRATION_VIDEO_TARGET_SHOT_CHARS * 1.2)} 字）。`,
  '【合并】同说话人、不同说话人均可并入同一镜；短对白应与相邻行合并，禁止无故一行一镜。',
  '【忠实】严格保留原文用字与语序，禁止改写、增删、润色；只决定哪些行归入同一镜。',
  '【覆盖】所有输入行必须出现在某一镜的 lines 里，顺序与原文一致，不得丢行、调序。',
  '【画面】每镜写一条 visual：场景地点、人物全名、姿态表情、景别光影；禁止抄台词；禁止运镜术语堆砌。',
  '【本镜锁定】visual 只能写本镜 lines 已出现的人、动作与物件；禁止跨镜挪用邻镜情节或道具；禁止发明 lines 未写的拖拽/指认/接过等肢体动作；左右手与旁白一致。',
  `【时长】duration_sec 为整数，通常 ${NARRATION_VIDEO_TARGET_SHOT_SEC - 1}～${NARRATION_VIDEO_TARGET_SHOT_SEC + 1}，范围 ${NARRATION_VIDEO_SHOT_SEC_MIN}～${NARRATION_VIDEO_SHOT_SEC_MAX}。`,
  '',
  '只输出 JSON：',
  `{"shots":[{"lines":[{"speaker":"旁白","dialogue":"..."},{"speaker":"叶沉","dialogue":"..."}],"duration_sec":${NARRATION_VIDEO_TARGET_SHOT_SEC},"visual":"画面描述"}]}`,
  '不要 markdown，不要解释。',
].join('\n')

export type NarrationVideoLlmPackedShot = {
  segments: Array<{ speaker: string; dialogue: string }>
  durationSec: number
  visual: string
}

function normalizeSpeakerDialoguePair(
  speakerRaw: unknown,
  dialogueRaw: unknown,
): { speaker: string; dialogue: string } | null {
  let speaker = String(speakerRaw || '').trim()
  let dialogue = String(dialogueRaw || '').trim()
  if (!dialogue && (speaker.includes('：') || speaker.includes(':'))) {
    const m = speaker.match(/^([^：:]{1,16})[:：]\s*(.+)$/)
    if (m) {
      speaker = m[1].trim()
      dialogue = m[2].trim()
    }
  }
  if (!dialogue) return null
  if (!speaker) speaker = '旁白'
  return { speaker, dialogue }
}

function parseSpeakerLineString(raw: string): { speaker: string; dialogue: string } | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const m = text.match(/^([^：:\n]{1,16})[:：]\s*(.+)$/s)
  if (m) return { speaker: m[1].trim(), dialogue: m[2].trim() }
  return { speaker: '旁白', dialogue: text }
}

function parseNarrationVideoLlmPackResponse(text: string): NarrationVideoLlmPackedShot[] | null {
  const obj = extractJsonObject(text)
  const shotsRaw = obj?.shots
  if (!Array.isArray(shotsRaw) || !shotsRaw.length) return null

  const shots: NarrationVideoLlmPackedShot[] = []
  for (const item of shotsRaw) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const linesRaw = row.lines
    const segments: Array<{ speaker: string; dialogue: string }> = []

    if (Array.isArray(linesRaw)) {
      for (const line of linesRaw) {
        if (typeof line === 'string') {
          const parsed = parseSpeakerLineString(line)
          if (!parsed) continue
          segments.push(parsed)
          continue
        }
        if (line && typeof line === 'object') {
          const objLine = line as Record<string, unknown>
          const parsed = normalizeSpeakerDialoguePair(
            objLine.speaker ?? objLine.name,
            objLine.dialogue ?? objLine.text ?? objLine.line,
          )
          if (parsed) segments.push(parsed)
        }
      }
    }

    if (!segments.length) {
      // 兼容 {speaker,dialogue} 单段写法
      const parsed = normalizeSpeakerDialoguePair(row.speaker, row.dialogue)
      if (parsed) segments.push(parsed)
    }
    if (!segments.length) return null

    const visual = String(row.visual || row.description || row.scene || '').trim()
    const durationSec = Math.max(
      NARRATION_VIDEO_SHOT_SEC_MIN,
      Math.min(
        NARRATION_VIDEO_SHOT_SEC_MAX,
        Math.round(Number(row.duration_sec ?? row.durationSec ?? row.duration) || NARRATION_VIDEO_TARGET_SHOT_SEC),
      ),
    )
    shots.push({ segments, durationSec, visual })
  }
  return shots.length ? shots : null
}

function narrationVideoPackFidelityOk(
  source: Array<{ speaker: string; dialogue: string }>,
  packed: NarrationVideoLlmPackedShot[],
): boolean {
  const norm = (s: string) => stripEmphasisMarkers(s).replace(/\s/g, '')
  const orig = source.map(l => norm(l.dialogue)).join('')
  const got = packed.flatMap(s => s.segments.map(seg => norm(seg.dialogue))).join('')
  if (!orig.length || !got.length) return false
  const ratio = Math.abs(orig.length - got.length) / orig.length
  return ratio <= 0.08
}

/** 整稿均字数不得仍按旧 6s≈65 字节奏拆（否则镜数几乎不变） */
function narrationVideoPackRhythmOk(packed: NarrationVideoLlmPackedShot[]): boolean {
  if (!packed.length) return false
  const totalChars = packed.reduce(
    (sum, shot) =>
      sum + shot.segments.reduce((n, seg) => n + stripEmphasisMarkers(seg.dialogue).replace(/\s/g, '').length, 0),
    0,
  )
  const avg = totalChars / packed.length
  // 允许偏低到目标的 70%（约 76 字）；当前 bug 下均字约 68，应触发重试
  return avg >= NARRATION_VIDEO_TARGET_SHOT_CHARS * 0.7
}

/**
 * 解说视频：LLM 按约 10s/108 字打包说话人行，并写每镜画面描述。
 * 失败返回 null（调用方勿静默改规则分镜）。
 */
export async function packNarrationVideoShotsWithLLM(
  lines: Array<{ speaker: string; dialogue: string }>,
  options?: { textModel?: string | null; textThinking?: boolean },
): Promise<{ shots: NarrationVideoLlmPackedShot[]; model: string } | null> {
  if (!lines.length) return { shots: [], model: '' }
  const textModel = resolveNarrationStoryboardTextModel(null, options?.textModel)
  const config = getTextConfig(textModel)
  assertTextConfigHasCredentials(config)

  const user = JSON.stringify({
    target_sec: NARRATION_VIDEO_TARGET_SHOT_SEC,
    target_chars: NARRATION_VIDEO_TARGET_SHOT_CHARS,
    chars_per_minute: NARRATION_SCRIPT_CHARS_PER_MINUTE,
    merge_hint: `短行必须并入邻镜，使每镜接近 ${NARRATION_VIDEO_TARGET_SHOT_CHARS} 字；禁止大量不足 ${Math.round(NARRATION_VIDEO_TARGET_SHOT_CHARS * 0.7)} 字的碎镜`,
    lines: lines.map((l, index) => ({
      index,
      speaker: l.speaker,
      dialogue: l.dialogue,
    })),
    output_format: {
      shots: '[{lines:[{speaker,dialogue}],duration_sec,visual}]',
    },
  })

  let lastError = ''
  for (let attempt = 0; attempt <= STORYBOARD_LLM_RETRIES; attempt++) {
    if (attempt > 0) await sleep(2_000 * attempt)
    try {
      logTaskProgress('NarrationStoryboardLLM', 'video-pack-start', {
        model: textModel,
        lineCount: lines.length,
        targetSec: NARRATION_VIDEO_TARGET_SHOT_SEC,
        targetChars: NARRATION_VIDEO_TARGET_SHOT_CHARS,
        attempt,
      })
      const text = await callTextChat(
        NARRATION_VIDEO_LLM_PACK_SYSTEM,
        user,
        textModel,
        options?.textThinking ?? false,
        STORYBOARD_LLM_TIMEOUT_MS,
      )
      const parsed = parseNarrationVideoLlmPackResponse(text)
      if (!parsed?.length) {
        lastError = 'invalid pack JSON'
        continue
      }
      if (!narrationVideoPackFidelityOk(lines, parsed)) {
        lastError = 'pack fidelity check failed'
        continue
      }
      if (!narrationVideoPackRhythmOk(parsed)) {
        const totalChars = parsed.reduce(
          (sum, shot) =>
            sum + shot.segments.reduce((n, seg) => n + stripEmphasisMarkers(seg.dialogue).replace(/\s/g, '').length, 0),
          0,
        )
        lastError = `pack rhythm too fine: ${parsed.length} shots, avg ${Math.round(totalChars / parsed.length)} chars (target ${NARRATION_VIDEO_TARGET_SHOT_CHARS})`
        logTaskWarn('NarrationStoryboardLLM', 'video-pack-rhythm', { error: lastError })
        continue
      }
      logTaskSuccess('NarrationStoryboardLLM', 'video-pack-done', {
        model: textModel,
        lineCount: lines.length,
        shotCount: parsed.length,
      })
      return { shots: parsed, model: textModel }
    } catch (err: unknown) {
      lastError = String((err as Error)?.message || err || 'unknown')
      if (isLlmTimeoutError(lastError) || attempt >= STORYBOARD_LLM_RETRIES) {
        logTaskWarn('NarrationStoryboardLLM', 'video-pack-failed', { error: lastError })
        return null
      }
    }
  }
  logTaskWarn('NarrationStoryboardLLM', 'video-pack-failed', { error: lastError })
  return null
}

/** 为解说视频每镜生成画面描述（写入 storyboards.description） */
export async function generateNarrationShotVisualDescriptions(
  shots: Array<{ speaker: string; dialogue: string; line?: string }>,
  options?: { textModel?: string | null; textThinking?: boolean },
): Promise<string[] | null> {
  if (!shots.length) return []
  try {
    const textModel = resolveNarrationStoryboardTextModel(null, options?.textModel)
    const config = getTextConfig(textModel)
    assertTextConfigHasCredentials(config)

    const batchSize = 24
    const visuals: string[] = []
    for (let start = 0; start < shots.length; start += batchSize) {
      const batch = shots.slice(start, start + batchSize)
      const user = JSON.stringify({
        shots: batch.map((s, i) => ({
          index: start + i,
          line: String(s.line || `${s.speaker}：${s.dialogue}`).trim(),
        })),
        output_format: { visuals: 'string[]，长度与 shots 相同' },
      })
      const text = await callTextChat(
        NARRATION_SHOT_VISUAL_SYSTEM,
        user,
        textModel,
        options?.textThinking ?? false,
        STORYBOARD_LLM_TIMEOUT_MS,
      )
      const obj = extractJsonObject(text)
      const arr = Array.isArray(obj?.visuals) ? obj.visuals : null
      if (!arr || arr.length !== batch.length) {
        logTaskWarn('NarrationStoryboardLLM', 'shot-visual-invalid', {
          expected: batch.length,
          got: arr?.length || 0,
          offset: start,
        })
        return null
      }
      for (const v of arr) {
        const line = String(v || '').trim()
        if (!line) return null
        visuals.push(line)
      }
    }
    logTaskSuccess('NarrationStoryboardLLM', 'shot-visual-done', { count: visuals.length })
    return visuals
  } catch (err: unknown) {
    logTaskWarn('NarrationStoryboardLLM', 'shot-visual-failed', {
      error: String((err as Error)?.message || err || 'unknown'),
    })
    return null
  }
}
