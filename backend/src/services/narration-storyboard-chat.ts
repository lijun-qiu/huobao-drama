/**
 * 旁白分镜 — 多轮聊天（讨论拆镜策略、流式展示过程、触发整稿拆镜）
 */
import { eq } from 'drizzle-orm'
import { parseProductionMode, isMotionComicMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import { MOTION_COMIC_STORYBOARD_CHAT_SYSTEM } from '../constants/motion-comic.js'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationStoryboardTextModel } from '../constants/text-models.js'
import { breakdownNarrationStoryboards } from './narration-breakdown.js'
import { streamTextChatMessages, type TextChatMessage } from './text-chat.js'
import { logTaskProgress } from '../utils/task-logger.js'
import {
  buildStoryboardChatContextBlock,
  sanitizeStoryboardChatTurns,
  type NarrationStoryboardChatTurn,
} from './narration-storyboard-chat-context.js'
import { createWorkflowChatStatusReporter } from './workflow-chat-status.js'

const STORYBOARD_CHAT_SYSTEM = [
  '你是火宝解说流水线的「旁白分镜」助手，帮助创作者把解说稿拆成可 TTS 配音、可配图的镜头序列。',
  '',
  '【拆镜规则】',
  '- 片头：首行「今天体验的人生剧本是，…」或「标题：…」拆成片头镜（剧中红字）。',
  '- 正文：按句拆镜，句末标点必拆；逗号/顿号仅当相邻合计超过约 16 字才拆。',
  '- 自动为关键词标注 ** 强调（黄字字幕）；用户稿中已有 ** 则保留。',
  '- 每镜一条旁白台词，时长按字数估算，便于一句一镜配音。',
  '',
  '【职责】',
  '- 讨论拆镜粒度、片头处理、强调词标注等，结合【解说稿】与【已有镜头】给建议。',
  '- 用户说「开始分镜」「重新分镜」「执行拆镜」等时，系统会整稿 LLM 拆镜并写库；你解读结果（句数、镜数、片头）。',
  '- 重新分镜会覆盖本集全部镜头，提醒用户确认后再执行。',
  '- 不要输出 JSON 或 markdown 表格；用 #镜号 和自然语言说明。',
  '',
  '回复简洁、可操作。',
].join('\n')

function resolveStoryboardChatSystem(episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return STORYBOARD_CHAT_SYSTEM
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  if (isMotionComicMode(parseProductionMode(drama?.metadata))) {
    return MOTION_COMIC_STORYBOARD_CHAT_SYSTEM
  }
  return STORYBOARD_CHAT_SYSTEM
}

export type NarrationStoryboardChatParams = {
  episodeId: number
  messages: NarrationStoryboardChatTurn[]
  textModel?: string | null
  textThinking?: boolean
  action?: 'run' | null
  script?: string
}

export type StoryboardChatProgressCallback = (patch: {
  message: string
  percent?: number
  phase?: string
}) => void

function buildStoryboardChatMessages(params: NarrationStoryboardChatParams) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const turns = sanitizeStoryboardChatTurns(params.messages)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationStoryboardTextModel(ep, params.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, params.textThinking)
  const context = buildStoryboardChatContextBlock(params.episodeId, params.script)
  const systemPrompt = resolveStoryboardChatSystem(params.episodeId)

  const apiMessages: TextChatMessage[] = [
    { role: 'system', content: `${systemPrompt}\n\n${context}` },
    ...turns,
  ]

  return { ep, turns, textModel, textThinking, apiMessages }
}

function formatStoryboardResultSummary(result: {
  count?: number
  sentence_count?: number
  title_count?: number
  title_hook?: string | null
  emphasis_source?: string
  total_duration?: number
}, motionComic = false) {
  const shotCount = result.count ?? 0
  const sentenceCount = result.sentence_count ?? 0
  const titleCount = result.title_count ?? 0
  const titleHook = result.title_hook
  const dur = result.total_duration ?? 0
  const source = result.emphasis_source === 'llm' ? 'AI 拆镜' : '规则兜底'
  const titleHint = titleCount
    ? `，片头 ${titleCount} 镜${titleHook ? `（${titleHook}）` : ''}`
    : motionComic
      ? '，未识别片头（首行请写「标题：」或「本期故事：…」）'
      : '，未识别片头（首行请写「标题：」或「今天体验的人生剧本是…」）'
  const label = motionComic ? '句台词' : '句旁白'
  return `${motionComic ? '漫画' : ''}分镜完成（${source}）：${sentenceCount} ${label} → ${shotCount} 镜${titleHint}，约 ${dur}s。可在下方编辑镜头，或继续对话后重新分镜。`
}

export async function streamNarrationStoryboardChat(
  params: NarrationStoryboardChatParams,
  send: (payload: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  const { textModel, textThinking, apiMessages, turns } = buildStoryboardChatMessages(params)
  let breakdownSummary = ''
  let breakdownResult: Awaited<ReturnType<typeof breakdownNarrationStoryboards>> | null = null

  if (params.action === 'run') {
    const script = String(params.script || '').trim()
    const motionComic = isMotionComicMode(resolveEpisodeProductionMode(params.episodeId))
    if (!script) throw new Error(motionComic ? '请先填写漫剧旁白稿' : '请先填写解说文案')

    const reportStatus = createWorkflowChatStatusReporter(send)
    const onProgress: StoryboardChatProgressCallback = patch => {
      reportStatus(patch.message)
    }

    reportStatus(motionComic ? '正在读取旁白稿…' : '正在读取解说稿…')

    breakdownResult = await breakdownNarrationStoryboards(params.episodeId, script, {
      textModel,
      textThinking,
      onProgress,
    })

    breakdownSummary = formatStoryboardResultSummary(breakdownResult, motionComic)
    send({
      type: 'storyboard_done',
      count: breakdownResult.count,
      sentence_count: breakdownResult.sentence_count,
      title_count: breakdownResult.title_count,
      title_hook: breakdownResult.title_hook,
      total_duration: breakdownResult.total_duration,
      emphasis_source: breakdownResult.emphasis_source,
      message: breakdownSummary,
      generated_at: breakdownResult.generated_at,
      storyboard_breakdown_at: breakdownResult.storyboard_breakdown_at,
    })
  }

  logTaskProgress('NarrationStoryboardChat', 'stream-request', {
    episodeId: params.episodeId,
    model: textModel,
    action: params.action,
    turnCount: turns.length,
  })

  const systemWithResult = breakdownSummary
    ? apiMessages.map((m, i) => i === 0 && m.role === 'system'
      ? { ...m, content: `${m.content}\n\n【刚完成的分镜结果】\n${breakdownSummary}` }
      : m)
    : apiMessages

  let reply = await streamTextChatMessages(
    systemWithResult,
    (_delta, full) => send({ type: 'delta', content: full }),
    textModel,
    textThinking,
    600_000,
    0.5,
    signal,
    4096,
    {
      onThinkingDelta: (_delta, full) => send({ type: 'thinking', content: full }),
    },
  )

  reply = reply.trim() || breakdownSummary
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
    breakdown: breakdownResult ?? undefined,
  }
}
