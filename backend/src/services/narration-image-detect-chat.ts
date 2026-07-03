/**
 * 配图换镜检测 — 多轮聊天（可讨论策略、流式展示检测过程、触发执行检测）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel } from '../constants/text-models.js'
import { resolveNarrationImageStyle } from '../constants/art-styles.js'
import { detectNarrationImageAnchors } from './narration-image-breakdown.js'
import {
  acquireNarrationImageBreakdownJob,
  releaseNarrationImageBreakdownJob,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { streamTextChatMessages, type TextChatMessage } from './text-chat.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { now } from '../utils/response.js'
import {
  buildDetectChatContextBlock,
  sanitizeImageChatTurns,
  type NarrationImageChatTurn,
} from './narration-image-chat-context.js'
import { createWorkflowChatStatusReporter } from './workflow-chat-status.js'
import { isMotionComicMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'

const NARRATION_DETECT_CHAT_SYSTEM = [
  '你是火宝解说流水线的「配图换镜检测」助手，帮助创作者决定哪些旁白镜头需要单独配图。',
  '',
  '【职责】',
  '- 阅读镜头列表，解释换镜/配图策略（按场景段落、保守少配图、两宫格等）。',
  '- 用户说「开始检测」「重新检测」「执行检测」等时，由系统后台执行 LLM 检测；你只需在检测前后给出说明与结果解读。',
  '- 检测完成后，用清晰条目总结：共多少张需配图、片头几镜、有无两宫格、哪些段落是锚点。',
  '- 用户要求调整时（如「第10镜不要配图」「合并3-5镜」），先讨论可行性，建议重新检测并说明期望；不要假装已改库。',
  '',
  '【配图原则（供讨论）】',
  '- 场景/时间/地点明显切换 → 新配图锚点',
  '- 同一场景连续动作 → 可沿用上一张（inherit）',
  '- 片头 hook 通常单独 1 张标题图',
  '- 全片配图比例约 15%～35%，不宜每句一图',
  '',
  '回复简洁、可操作；用 #01 #02 指代镜头编号。',
].join('\n')

const MOTION_COMIC_DETECT_CHAT_SYSTEM = [
  '你是火宝漫画解说流水线的「配图换镜检测」助手，帮助创作者决定哪些旁白镜头需要单独漫画配图。',
  '',
  '【职责】',
  '- 阅读镜头列表，解释换镜/配图策略（一句一图、动态构图、智能运镜合成）。',
  '- 用户说「开始检测」「重新检测」「执行检测」等时，由系统后台执行 LLM 检测；你解读检测过程与结果。',
  '- 检测完成后总结：共多少张需配图、片头几镜、哪些段落是锚点。',
  '- 用户要求调整时，先讨论可行性，建议重新检测；不要假装已改库。',
  '',
  '【配图原则（供讨论）】',
  '- 1～2 镜共用一张漫画插画（一段一图）',
  '- **换人说话须换图**',
  '- **同一张图整段只用一种运镜**（推/拉/横移/上下等），不会句句换',
  '- **合成会自动加场景特效**（传送门、下雨/飘雪粒子、爆炸闪光、回忆褪色、风沙等），按旁白语义匹配',
  '- 片头 hook 通常单独 1 张标题图',
  '- 全片配图比例约 50% 以上',
  '',
  '回复简洁、可操作；用 #01 #02 指代镜头编号。',
].join('\n')

function resolveDetectChatSystem(episodeId: number): string {
  return isMotionComicMode(resolveEpisodeProductionMode(episodeId))
    ? MOTION_COMIC_DETECT_CHAT_SYSTEM
    : NARRATION_DETECT_CHAT_SYSTEM
}

export type NarrationImageDetectChatParams = {
  episodeId: number
  messages: NarrationImageChatTurn[]
  textModel?: string | null
  textThinking?: boolean
  action?: 'run' | null
  style?: string
  imageDetectMode?: 'paragraph' | 'conservative'
  detectBatchThreshold?: number
  detectBatchSize?: number
}

function buildDetectChatMessages(params: NarrationImageDetectChatParams) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const turns = sanitizeImageChatTurns(params.messages)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationImageTextModel(ep, params.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, params.textThinking)
  const context = buildDetectChatContextBlock(params.episodeId)

  const apiMessages: TextChatMessage[] = [
    { role: 'system', content: `${resolveDetectChatSystem(params.episodeId)}\n\n${context}` },
    ...turns,
  ]

  return { ep, turns, textModel, textThinking, apiMessages }
}

function formatDetectResultSummary(result: {
  paragraph_count?: number
  image_needed_count?: number
  title_image_count?: number
  image_detect_source?: string
}) {
  const count = result.paragraph_count ?? result.image_needed_count ?? 0
  const source = result.image_detect_source === 'llm' ? 'AI 检测' : '规则兜底'
  const titleHint = result.title_image_count ? `，含片头 ${result.title_image_count} 张` : ''
  return `检测完成（${source}）：共 ${count} 张需配图${titleHint}。可在下方查看各镜标记，或继续对话调整策略后重新检测。`
}

export async function streamNarrationImageDetectChat(
  params: NarrationImageDetectChatParams,
  send: (payload: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  const { textModel, textThinking, apiMessages, turns } = buildDetectChatMessages(params)
  let detectSummary = ''

  if (params.action === 'run') {
    if (!acquireNarrationImageBreakdownJob(params.episodeId)) {
      throw new Error('配图任务进行中，请稍候')
    }

    const reportStatus = createWorkflowChatStatusReporter(send)
    const onProgress: NarrationImageBreakdownProgressCallback = patch => {
      reportStatus(patch.message)
    }

    try {
      reportStatus('正在启动换镜检测…')
      const style = resolveNarrationImageStyle(params.style)
      const mode = params.imageDetectMode === 'conservative' ? 'conservative' : 'paragraph'

      const result = await detectNarrationImageAnchors(params.episodeId, style, mode, {
        batchThreshold: params.detectBatchThreshold,
        batchSize: params.detectBatchSize,
        textModel,
        textThinking,
        onProgress,
      })

      detectSummary = formatDetectResultSummary(result)
      send({
        type: 'detect_done',
        paragraph_count: result.paragraph_count,
        image_needed_count: result.image_needed_count,
        image_detect_source: result.image_detect_source,
        message: detectSummary,
        generated_at: result.generated_at ?? now(),
        image_detect_at: result.image_detect_at,
      })
    } finally {
      releaseNarrationImageBreakdownJob(params.episodeId)
    }
  }

  logTaskProgress('NarrationImageDetectChat', 'stream-request', {
    episodeId: params.episodeId,
    model: textModel,
    action: params.action,
    turnCount: turns.length,
  })

  const systemWithResult = detectSummary
    ? apiMessages.map((m, i) => i === 0 && m.role === 'system'
      ? { ...m, content: `${m.content}\n\n【刚完成的检测结果】\n${detectSummary}` }
      : m)
    : apiMessages

  let reply = ''
  reply = await streamTextChatMessages(
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

  reply = reply.trim() || detectSummary
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
    detect: detectSummary ? { summary: detectSummary } : undefined,
  }
}
