import { eq } from 'drizzle-orm'
import { parseProductionMode, isMotionComicMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import { MOTION_COMIC_SCRIPT_CHAT_SYSTEM } from '../constants/motion-comic.js'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationScriptChatTextModel } from '../constants/text-models.js'
import { ensureScriptEmphasisInBody } from '../utils/subtitle-emphasis.js'
import { sanitizeMotionComicScript, lineHasSpeakerPrefix } from '../utils/motion-comic-script.js'
import { callTextChatMessages, streamTextChatMessages, type TextChatMessage } from './text-chat.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { parseNarrationScript } from './narration-breakdown.js'
import {
  applyNarrationScriptEmphasisWithLLM,
  looksLikeNarrationScriptDraft,
} from './narration-emphasis-apply.js'

export type NarrationScriptChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

const NARRATION_SCRIPT_CHAT_SYSTEM = [
  '你是「体验365个人生」类短视频解说编剧，为火宝解说流水线写可直接 TTS 与配图的解说稿。',
  '',
  '【语感与真实】',
  '- 语言亲民：口语化、好懂，像跟朋友聊天，不用文绉绉、堆砌辞藻或生僻词。',
  '- 内容真实：细节可信、合乎常理，写具体处境与小人物日常；不悬浮、不伪励志、不夸大其词。',
  '- 代入感：带观众进入「你」当下的感受与选择，写看得见摸得着的动作、物件与场景，少用空泛形容。',
  '- 内心活动：穿插「你」的犹豫、触动、后悔、期待、不安等心理与感受，与动作、对话式旁白交织；情感有起伏，但不写成意识流散文。',
  '',
  '【篇幅】',
  '- 用户要求完整稿时，全文（片头 hook + 正文）不少于 3000 汉字、不超过 10000 汉字；不足须扩写，超出须精简，不得敷衍或注水。',
  '',
  '【时间与人生阶段】',
  '- 时间跨度须贴合本期人生主题，不必写满一生，也不必套「童年→青年→中年→老年」模板。',
  '- 可只写一段：某个夏天、大学几年、进城第一年、一段婚姻、一场病、一次创业、网瘾少年那几年等；阶段由故事决定。',
  '- 禁止为凑篇幅硬塞无关年龄段；没有写到的阶段不要强行补「后来你老了…」。',
  '- 时间推进要清楚（季节/年份感/处境变化即可），但不要求每个剧本都横跨几十年。',
  '',
  '【输出格式】',
  '1) 第一行片头 hook：以「今天体验的人生剧本是，」开头，后接 2～4 个短信息点（身份/处境/核心矛盾等；不必每次写年龄），简短有力即可。',
  '2) 空一行后写正文，段间空一行。',
  '3) 【叙述人称】默认正文第二人称「你」，语气沉静，像带观众亲历这段人生；须符合上文【语感与真实】。若用户明确要求第一人称「我」、第三人称或其他人称，以用户最新要求为准，全文统一，不得混用。',
  '4) 本步骤只输出纯文本解说稿，不要输出 ** 或任何 markdown 标记；字幕关键词强调在「旁白分镜」步骤由 Qwen 自动拆句并标注。',
  '',
  '【画面与配图】',
  '- 每句能想象成画面：年代氛围、地点、服装、摊位/工具、人物动作。',
  '- 写具体物件名（花衬衫、喇叭裤、煤油灯），禁止「各类商品」「很多东西」。',
  '- 年代用「八十年代市井」「九十年代城镇」等，不要写 1980、1990 等年份数字。',
  '- 刑案/冲突只写押解、公堂、牢狱等候，不写血腥暴力。',
  '',
  '【节奏】',
  '- 单句 8～22 字为主，便于一句一镜配音。',
  '- 有 1～2 处命运转折；结尾略有余味，不喊口号。',
  '',
  '【禁止】',
  '- 镜头语言（特写、推镜）、markdown 标题、分点列表、「大家好」「点赞关注」。',
  '',
  '用户要求写完整稿时，只输出解说稿正文（第一行即片头 hook），且须满足【篇幅】3000～10000 字。',
  '',
  '【多轮改稿】',
  '- 支持多轮：用户可在后续消息说「改第二段」「补内心戏」「缩短到5000字」等，须结合【当前台本】或对话历史中的上一版完整稿修改。',
  '- 改稿类请求（含补说话人/改人称/去片尾/扩写/缩写）：先可一句极短确认（≤20字），空一行后**必须输出修改后的完整稿**，不要只解释改了哪段、不要只给 diff。',
  '- 若【当前台本】已有内容而用户未贴新稿，在其基础上改，勿另起新故事。',
  '',
  '闲聊、选题讨论时可正常对话，不必强行输出整稿。',
].join('\n')

function resolveScriptChatSystem(episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return NARRATION_SCRIPT_CHAT_SYSTEM
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  if (isMotionComicMode(parseProductionMode(drama?.metadata))) {
    return MOTION_COMIC_SCRIPT_CHAT_SYSTEM
  }
  return NARRATION_SCRIPT_CHAT_SYSTEM
}

/** 完整稿篇幅：下限 3000 字，上限 10000 字 */
export const NARRATION_SCRIPT_MIN_CHARS = 3_000
export const NARRATION_SCRIPT_MAX_CHARS = 10_000
/** @deprecated 使用 NARRATION_SCRIPT_MAX_CHARS */
export const NARRATION_SCRIPT_TARGET_CHARS = NARRATION_SCRIPT_MAX_CHARS
const NARRATION_SCRIPT_CHAT_MAX_TOKENS = 16_384

/** 手动触发：为解说稿逐句 LLM 标注 ** */
export async function emphasizeNarrationScriptDraft(
  script: string,
  options?: { textModel?: string | null; textThinking?: boolean },
): Promise<string> {
  const trimmed = String(script || '').trim()
  if (!trimmed) throw new Error('请先提供解说稿正文')
  if (!looksLikeNarrationScriptDraft(trimmed)) {
    throw new Error('当前内容不像完整解说稿，请先生成或填入完整稿后再标注')
  }

  logTaskProgress('NarrationScriptChat', 'emphasis-manual-start', {
    model: options?.textModel,
  })

  try {
    return await applyNarrationScriptEmphasisWithLLM(trimmed, options)
  } catch (err: unknown) {
    const msg = String((err as Error)?.message || err || 'unknown')
    if (/401|403|invalid token|未配置文本模型 api key/i.test(msg)) {
      throw err
    }
    logTaskWarn('NarrationScriptChat', 'emphasis-manual-fallback-rules', {
      error: msg,
    })
    const { title, body } = parseNarrationScript(trimmed)
    if (!body.trim()) throw err
    const markedBody = ensureScriptEmphasisInBody(body)
    if (title?.trim()) return `${title.trim()}\n\n${markedBody}`
    return markedBody
  }
}

function buildEpisodeContext(episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return ''

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const lines = [
    drama?.title ? `作品：${drama.title}` : '',
    drama?.genre ? `题材：${drama.genre}` : '',
    drama?.style ? `画风：${drama.style}` : '',
    ep.title ? `本集标题：${ep.title}` : '',
    `集序号：第 ${ep.episodeNumber} 集`,
  ].filter(Boolean)

  return lines.length ? `【当前项目】\n${lines.join('\n')}` : ''
}

/** 剧本聊天上下文：带入「直接输入」/已保存文案，支持多轮改稿 */
export function buildScriptChatContextBlock(episodeId: number, scriptOverride?: string): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return ''

  const motionComic = isMotionComicMode(resolveEpisodeProductionMode(episodeId))
  const script = String(scriptOverride || ep.scriptContent || ep.content || '').trim()
  const parts = [buildEpisodeContext(episodeId)]

  if (!script) {
    parts.push('', `【当前台本】尚未保存。用户可在「直接输入」粘贴后切回 AI 对话，或在对话里直接贴全文。`)
    return parts.filter(Boolean).join('\n')
  }

  const { title, body } = parseNarrationScript(script)
  const charCount = script.replace(/\s/g, '').length
  const bodyLines = body.split('\n').map(l => l.trim()).filter(Boolean)
  const prefixedRatio = bodyLines.length
    ? bodyLines.filter(lineHasSpeakerPrefix).length / bodyLines.length
    : 0

  parts.push(
    '',
    `【当前台本】约 ${charCount} 字（来自已保存文案 / 直接输入，多轮改稿请在此基础上修改）`,
  )
  if (title) {
    parts.push(`片头：${title.slice(0, 160)}${title.length > 160 ? '…' : ''}`)
  }
  if (motionComic && prefixedRatio < 0.5) {
    parts.push('格式提示：当前稿多数行无「说话人：」前缀；若用户要求补说话人/补人名，须输出带前缀的完整稿。')
  }

  // 完整带入，便于「补人名」等多轮改稿；超长时截断并说明
  const maxChars = 24_000
  if (script.length <= maxChars) {
    parts.push('', '--- 台本全文 ---', script, '--- 台本结束 ---')
  } else {
    parts.push(
      '',
      '--- 台本节选（前段） ---',
      script.slice(0, maxChars),
      '…（后文略，完整内容见对话历史中用户/助手消息）',
      '--- 节选结束 ---',
    )
  }

  return parts.join('\n')
}

function looksLikeScriptChatDraftReply(text: string): boolean {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  const charCount = trimmed.replace(/\s/g, '').length
  if (charCount < 180) return false
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 4) return false
  if (/^今天体验的人生剧本是/m.test(trimmed)) return true
  if (/^(?:剧中\s*[:：]\s*)?(?:本期|本集)?故事\s*[:：]/m.test(trimmed)) return true
  if (lines.filter(lineHasSpeakerPrefix).length >= 3) return true
  const { body } = parseNarrationScript(trimmed)
  return body.replace(/\s/g, '').length >= 150
}

function sanitizeChatTurns(messages: NarrationScriptChatTurn[]): NarrationScriptChatTurn[] {
  return (messages || [])
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m.content || '').trim(),
    }))
    .filter(m => m.content)
    .slice(-24)
}

function finalizeMotionComicScriptReply(reply: string, episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return reply
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  if (!isMotionComicMode(parseProductionMode(drama?.metadata))) return reply
  if (!looksLikeScriptChatDraftReply(reply)) return reply.trim()
  return sanitizeMotionComicScript(reply, { ensureSpeakers: true })
}

function buildNarrationScriptChatMessages(params: {
  episodeId: number
  messages: NarrationScriptChatTurn[]
  textModel?: string | null
  textThinking?: boolean
  script?: string
}) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const turns = sanitizeChatTurns(params.messages)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationScriptChatTextModel(params.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, params.textThinking)
  const context = buildScriptChatContextBlock(params.episodeId, params.script)
  const systemPrompt = resolveScriptChatSystem(params.episodeId)

  const apiMessages: TextChatMessage[] = [
    {
      role: 'system',
      content: context ? `${systemPrompt}\n\n${context}` : systemPrompt,
    },
    ...turns,
  ]

  return { ep, turns, textModel, textThinking, apiMessages }
}

export async function streamChatNarrationScript(
  params: {
    episodeId: number
    messages: NarrationScriptChatTurn[]
    textModel?: string | null
    textThinking?: boolean
    script?: string
  },
  onDelta: (delta: string, full: string) => void,
  signal?: AbortSignal,
  onThinkingDelta?: (delta: string, full: string) => void,
) {
  const { textModel, textThinking, apiMessages, turns } = buildNarrationScriptChatMessages(params)

  logTaskProgress('NarrationScriptChat', 'stream-request', {
    episodeId: params.episodeId,
    model: textModel,
    thinking: textThinking,
    turnCount: turns.length,
  })

  const reply = await streamTextChatMessages(
    apiMessages,
    onDelta,
    textModel,
    textThinking,
    900_000,
    0.65,
    signal,
    NARRATION_SCRIPT_CHAT_MAX_TOKENS,
    { onThinkingDelta },
  )

  return {
    reply: finalizeMotionComicScriptReply(reply.trim(), params.episodeId),
    model: textModel,
    text_thinking: textThinking,
  }
}

export async function chatNarrationScript(params: {
  episodeId: number
  messages: NarrationScriptChatTurn[]
  textModel?: string | null
  textThinking?: boolean
  script?: string
}) {
  const { textModel, textThinking, apiMessages, turns } = buildNarrationScriptChatMessages(params)

  logTaskProgress('NarrationScriptChat', 'request', {
    episodeId: params.episodeId,
    model: textModel,
    thinking: textThinking,
    turnCount: turns.length,
  })

  const reply = (await callTextChatMessages(
    apiMessages,
    textModel,
    textThinking,
    900_000,
    0.65,
    NARRATION_SCRIPT_CHAT_MAX_TOKENS,
  )).trim()
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply: finalizeMotionComicScriptReply(reply, params.episodeId),
    model: textModel,
    text_thinking: textThinking,
  }
}
