/**
 * 旁白分镜 — 多轮聊天（讨论拆镜策略、流式展示过程、触发整稿拆镜）
 */
import { eq } from 'drizzle-orm'
import {
  isNarrationVideoMode,
  parseProductionMode,
  usesMotionComicStoryboardRules,
  resolveEpisodeProductionMode,
} from '../constants/production-mode.js'
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

/** 解说视频：LLM 按约 10s/108 字打包，不做规则分镜 */
const NARRATION_VIDEO_STORYBOARD_CHAT_SYSTEM = [
  '你是火宝解说视频流水线的「分镜脚本」助手，帮助创作者把「解说脚本」拆成可配音、一镜一图、图生视频的镜头。',
  '',
  '【拆镜规则】',
  '- 输入是带「说话人：台词」的解说脚本（旁白+人物对白），不是小说原文。',
  '- 系统用 LLM 按约 10 秒≈108 字/镜（650 字/分钟）打包；同说话人、不同说话人均可合并。',
  '- 每镜写入画面描述与秒数；失败不会改用规则分镜，需重试。',
  '- 后续流程：一镜一图 → 一镜一视频。',
  '',
  '【职责】',
  '- 讨论打包粒度、多说话人同镜、画面描述质量等。',
  '- 用户说「开始分镜」「重新分镜」「执行拆镜」等时，系统会走 LLM 分镜并写库；你解读结果（行数、镜数、片头）。',
  '- 重新分镜会覆盖本集全部镜头，提醒用户确认后再执行。',
  '- 不要输出 JSON 或 markdown 表格；用 #镜号 和自然语言说明。',
  '',
  '回复简洁、可操作。',
].join('\n')

function resolveStoryboardChatSystem(episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return STORYBOARD_CHAT_SYSTEM
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const mode = parseProductionMode(drama?.metadata)
  if (usesMotionComicStoryboardRules(mode)) {
    return MOTION_COMIC_STORYBOARD_CHAT_SYSTEM
  }
  if (isNarrationVideoMode(mode)) {
    return NARRATION_VIDEO_STORYBOARD_CHAT_SYSTEM
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
  source_line_count?: number
  title_count?: number
  title_hook?: string | null
  emphasis_source?: string
  pack_source?: string
  total_duration?: number
  target_shot_sec?: number
  target_shot_chars?: number
}, motionComic = false, narrationVideo = false) {
  const shotCount = result.count ?? 0
  const sentenceCount = result.sentence_count ?? 0
  const sourceLineCount = result.source_line_count ?? sentenceCount
  const titleCount = result.title_count ?? 0
  const titleHook = result.title_hook
  const dur = result.total_duration ?? 0
  const source = result.pack_source === 'llm' || result.emphasis_source === 'llm' ? 'LLM 分镜' : '规则兜底'
  const titleHint = titleCount
    ? `，片头 ${titleCount} 镜${titleHook ? `（${titleHook}）` : ''}`
    : narrationVideo
      ? '，未识别片头（首行请写「标题：」或「本期故事：…」）'
      : motionComic
        ? '，未识别片头（首行请写「标题：」或「本期故事：…」）'
        : '，未识别片头（首行请写「标题：」或「今天体验的人生剧本是…」）'
  if (narrationVideo) {
    const pace = result.target_shot_sec && result.target_shot_chars
      ? `，约 ${result.target_shot_sec}s/≈${result.target_shot_chars}字`
      : ''
    return `分镜脚本完成（${source}）：${sourceLineCount} 行 → ${shotCount} 镜${titleHint}${pace}，合计约 ${dur}s。可在下方编辑，或继续对话后重新分镜。`
  }
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
    const productionMode = resolveEpisodeProductionMode(params.episodeId)
    const motionComic = usesMotionComicStoryboardRules(productionMode)
    const narrationVideo = isNarrationVideoMode(productionMode)
    if (!script) {
      throw new Error(
        motionComic ? '请先填写漫剧旁白稿' : (narrationVideo ? '请先填写解说脚本' : '请先填写解说文案'),
      )
    }

    const reportStatus = createWorkflowChatStatusReporter(send)
    const onProgress: StoryboardChatProgressCallback = patch => {
      reportStatus(patch.message)
    }

    reportStatus(`文本模型：${textModel}`)
    reportStatus(
      motionComic
        ? '正在读取旁白稿…'
        : (narrationVideo ? '正在读取解说脚本（LLM 分镜）…' : '正在读取解说稿…'),
    )

    breakdownResult = await breakdownNarrationStoryboards(params.episodeId, script, {
      textModel,
      textThinking,
      onProgress,
    })

    breakdownSummary = formatStoryboardResultSummary(breakdownResult, motionComic, narrationVideo)
    send({
      type: 'storyboard_done',
      count: breakdownResult.count,
      sentence_count: breakdownResult.sentence_count,
      source_line_count: (breakdownResult as { source_line_count?: number }).source_line_count,
      title_count: breakdownResult.title_count,
      title_hook: breakdownResult.title_hook,
      total_duration: breakdownResult.total_duration,
      emphasis_source: breakdownResult.emphasis_source,
      pack_source: (breakdownResult as { pack_source?: string }).pack_source,
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

  const reportStatus = createWorkflowChatStatusReporter(send)
  reportStatus(`正在连接模型生成说明：${textModel}…`)

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
