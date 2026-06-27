/**
 * 体验人生解说稿 — 多轮聊天生成（① 纯文稿；② 标注 ** 由用户手动触发）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationScriptChatTextModel } from '../constants/text-models.js'
import { ensureScriptEmphasisInBody } from '../utils/subtitle-emphasis.js'
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
  '4) 本步骤只输出纯文本解说稿，不要输出 ** 或任何 markdown 标记；字幕关键词强调由用户另行触发标注。',
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
  '用户要求修改时，输出修改后的完整稿或明确说明改动了哪段；若仅改人称，须整稿统一处理。',
  '闲聊、选题讨论时可正常对话，不必强行输出整稿。',
].join('\n')

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

function sanitizeChatTurns(messages: NarrationScriptChatTurn[]): NarrationScriptChatTurn[] {
  return (messages || [])
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m.content || '').trim(),
    }))
    .filter(m => m.content)
    .slice(-24)
}

function buildNarrationScriptChatMessages(params: {
  episodeId: number
  messages: NarrationScriptChatTurn[]
  textModel?: string | null
  textThinking?: boolean
}) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const turns = sanitizeChatTurns(params.messages)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationScriptChatTextModel(params.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, params.textThinking)
  const context = buildEpisodeContext(params.episodeId)

  const apiMessages: TextChatMessage[] = [
    {
      role: 'system',
      content: context ? `${NARRATION_SCRIPT_CHAT_SYSTEM}\n\n${context}` : NARRATION_SCRIPT_CHAT_SYSTEM,
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
    reply: reply.trim(),
    model: textModel,
    text_thinking: textThinking,
  }
}

export async function chatNarrationScript(params: {
  episodeId: number
  messages: NarrationScriptChatTurn[]
  textModel?: string | null
  textThinking?: boolean
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
    reply,
    model: textModel,
    text_thinking: textThinking,
  }
}
