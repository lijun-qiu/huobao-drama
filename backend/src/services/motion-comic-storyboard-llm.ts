import {
  buildMotionComicStoryboardLLMSystem,
  formatMotionComicDialogue,
  normalizeMotionComicShotRole,
  type MotionComicStoryboardShot,
} from '../constants/motion-comic.js'
import { resolveNarrationStoryboardTextModel } from '../constants/text-models.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { compactMotionComicStoryboardShots } from './motion-comic-shot-merge.js'
import { getTextConfig } from './ai.js'
import { callTextChat } from './text-chat.js'

const STORYBOARD_LLM_TIMEOUT_MS = 300_000
const STORYBOARD_LLM_RETRIES = 2

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

const SCRIPT_SCENE_LINE_RE = /^【\s*场景\s*】/
const SCRIPT_ACTION_LINE_RE = /^[（(].+[)）]$/
const NARRATION_SPEAKERS = new Set(['旁白', '剧中', 'OS', '画外音', '画外'])

function normalizeShotSpeakerAndDialogue(
  speaker: string,
  dialogue: string,
): { speaker: string; dialogue: string } {
  const rawDialogue = String(dialogue || '').trim()
  if (!rawDialogue) return { speaker: '旁白', dialogue: '' }

  const rawSpeaker = String(speaker || '').trim()
  const embedded = rawDialogue.match(/^(.+?)[:：]\s*(.+)$/s)
  if (embedded) {
    const embeddedSpeaker = embedded[1].replace(/[（(].+?[)）]/g, '').trim()
    const embeddedLine = embedded[2].trim()
    const isNarrationSpeaker = NARRATION_SPEAKERS.has(embeddedSpeaker)
    // LLM 常把「小明：台词」整句放进 dialogue 且 speaker 漏填为旁白
    if (!rawSpeaker || rawSpeaker === '旁白') {
      if (!isNarrationSpeaker && embeddedSpeaker.length <= 16) {
        return { speaker: embeddedSpeaker, dialogue: embeddedLine }
      }
      if (isNarrationSpeaker) {
        return { speaker: embeddedSpeaker, dialogue: embeddedLine }
      }
    }
    if (rawSpeaker === embeddedSpeaker) {
      return { speaker: embeddedSpeaker, dialogue: embeddedLine }
    }
  }

  return { speaker: rawSpeaker || '旁白', dialogue: rawDialogue }
}

function parseShot(raw: unknown): MotionComicStoryboardShot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const dialogueRaw = String(o.dialogue ?? '').trim()
  if (!dialogueRaw) return null
  if (SCRIPT_SCENE_LINE_RE.test(dialogueRaw) || SCRIPT_ACTION_LINE_RE.test(dialogueRaw)) return null

  const { speaker, dialogue } = normalizeShotSpeakerAndDialogue(
    String(o.speaker ?? ''),
    dialogueRaw,
  )
  if (!dialogue) return null

  const expression_action = String(o.expression_action ?? o.action ?? '').trim()
  const shot_type = String(o.shot_type ?? o.shotType ?? '中景').trim() || '中景'
  const angle = String(o.angle ?? '平视').trim() || '平视'
  const movement = String(o.movement ?? '固定').trim() || '固定'
  const background = String(o.background ?? o.location ?? '').trim()
  const atmosphere = String(o.atmosphere ?? '').trim() || undefined
  const shot_role = normalizeMotionComicShotRole(String(o.shot_role ?? ''))
  const emphasis_word = String(o.emphasis_word ?? '').trim() || undefined
  return {
    speaker,
    dialogue,
    expression_action: expression_action || '自然状态',
    shot_type,
    angle,
    movement,
    background: background || '未指定场景',
    atmosphere,
    shot_role,
    emphasis_word,
  }
}

function parseMotionComicStoryboardResponse(text: string): {
  titleShots: MotionComicStoryboardShot[]
  shots: MotionComicStoryboardShot[]
} | null {
  const obj = extractJsonObject(text)
  if (!obj) return null

  const titleRaw = obj.title_shots
  const bodyRaw = obj.shots
  if (!Array.isArray(bodyRaw)) return null

  const titleShots = Array.isArray(titleRaw)
    ? titleRaw.map(parseShot).filter((s): s is MotionComicStoryboardShot => !!s)
    : []
  const shots = bodyRaw.map(parseShot).filter((s): s is MotionComicStoryboardShot => !!s)
  if (!titleShots.length && !shots.length) return null

  return { titleShots, shots }
}

export type MotionComicStoryboardLLMOptions = {
  textModel?: string | null
  episodeTextModel?: string | null
  characterNames?: string[]
}

export type MotionComicStoryboardLLMResult = {
  titleShots: MotionComicStoryboardShot[]
  shots: MotionComicStoryboardShot[]
  usedLlm: boolean
}

async function splitMotionComicScriptWithLLM(
  script: string,
  options: { textModel: string; characterNames?: string[] },
): Promise<MotionComicStoryboardLLMResult | null> {
  const trimmed = script.trim()
  if (!trimmed) return { titleShots: [], shots: [], usedLlm: true }

  const user = JSON.stringify({
    script: trimmed,
    ...(options.characterNames?.length ? { known_characters: options.characterNames } : {}),
  })

  const system = buildMotionComicStoryboardLLMSystem()
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
      const parsed = parseMotionComicStoryboardResponse(text)
      if (!parsed) {
        lastError = 'invalid motion comic storyboard JSON'
        continue
      }
      return { ...parsed, usedLlm: true }
    } catch (err: unknown) {
      lastError = String((err as Error)?.message || err || 'unknown error')
      if (attempt >= STORYBOARD_LLM_RETRIES) throw err
    }
  }

  logTaskWarn('MotionComicStoryboardLLM', 'parse-failed', { error: lastError })
  return null
}

/** 动态漫：整稿 LLM 拆成一体化镜头（对白+表情动作+运镜+背景） */
export async function buildMotionComicStoryboardShotsWithLLM(
  script: string,
  options?: MotionComicStoryboardLLMOptions,
): Promise<MotionComicStoryboardLLMResult> {
  const textModel = resolveNarrationStoryboardTextModel(
    options?.episodeTextModel ? { textModel: options.episodeTextModel } : null,
    options?.textModel,
  )
  const config = getTextConfig(textModel)
  if (!config.apiKey) {
    throw new Error('未配置文本模型 API Key')
  }

  logTaskProgress('MotionComicStoryboardLLM', 'start', {
    model: textModel,
    scriptChars: script.replace(/\s/g, '').length,
  })

  try {
    const llmResult = await splitMotionComicScriptWithLLM(script, {
      textModel,
      characterNames: options?.characterNames,
    })
    if (llmResult) {
      const scriptChars = script.replace(/\s/g, '').length
      const rawCount = llmResult.shots.length
      const compactedShots = compactMotionComicStoryboardShots(llmResult.shots, scriptChars)
      if (compactedShots.length < rawCount) {
        logTaskWarn('MotionComicStoryboardLLM', 'shots-compacted', {
          rawCount,
          compactCount: compactedShots.length,
          targetMax: Math.max(10, Math.ceil(scriptChars / 110)),
        })
      }
      logTaskSuccess('MotionComicStoryboardLLM', 'done', {
        titleCount: llmResult.titleShots.length,
        shotCount: compactedShots.length,
        rawShotCount: rawCount,
      })
      return { ...llmResult, shots: compactedShots }
    }
  } catch (err: unknown) {
    logTaskWarn('MotionComicStoryboardLLM', 'error', {
      error: String((err as Error)?.message || err || 'unknown'),
    })
    throw err
  }

  throw new Error('动态漫分镜 LLM 解析失败，请检查台本格式后重试')
}

export { formatMotionComicDialogue }
