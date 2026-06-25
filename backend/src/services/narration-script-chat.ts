/**
 * 体验人生解说稿 — 多轮聊天生成
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextModel, resolveEpisodeTextThinking } from '../constants/text-models.js'
import { callTextChatMessages, type TextChatMessage } from './text-chat.js'
import { logTaskProgress } from '../utils/task-logger.js'

export type NarrationScriptChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

const NARRATION_SCRIPT_CHAT_SYSTEM = [
  '你是「体验365个人生」类短视频解说编剧，为火宝解说流水线写可直接 TTS 与配图的解说稿。',
  '',
  '【输出格式】',
  '1) 第一行片头 hook，格式：「今天体验的人生剧本是，」+ 2～4 个短信息点（年龄/身份/核心矛盾），整行 20～40 字。',
  '2) 空一行后写正文，3～5 个自然段，段间空一行。',
  '3) 全文第一人称「我」，语气沉静、有代入感，像在带观众体验一段人生。',
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
  '用户要求写完整稿时，只输出解说稿正文（第一行即片头 hook）。',
  '用户要求修改时，输出修改后的完整稿或明确说明改动了哪段。',
  '闲聊、选题讨论时可正常对话，不必强行输出整稿。',
].join('\n')

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

export async function chatNarrationScript(params: {
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

  const textModel = resolveEpisodeTextModel(ep, params.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, params.textThinking)
  const context = buildEpisodeContext(params.episodeId)

  const apiMessages: TextChatMessage[] = [
    {
      role: 'system',
      content: context ? `${NARRATION_SCRIPT_CHAT_SYSTEM}\n\n${context}` : NARRATION_SCRIPT_CHAT_SYSTEM,
    },
    ...turns,
  ]

  logTaskProgress('NarrationScriptChat', 'request', {
    episodeId: params.episodeId,
    model: textModel,
    thinking: textThinking,
    turnCount: turns.length,
  })

  const reply = (await callTextChatMessages(apiMessages, textModel, textThinking)).trim()
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
  }
}
