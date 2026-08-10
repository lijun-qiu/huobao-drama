/**
 * 配图换镜检测 — 多轮聊天（可讨论策略、流式展示检测过程、触发执行检测）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel, isZhipuGlmTextModel } from '../constants/text-models.js'
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
import { usesMotionComicVisuals, resolveEpisodeProductionMode, isNovelComicMode, isNarrationVideoMode } from '../constants/production-mode.js'

const NARRATION_VIDEO_DETECT_CHAT_SYSTEM = [
  '你是火宝解说视频流水线的「分镜配图同步」助手。',
  '',
  '【职责】',
  '- 解说视频分镜脚本已按约 10 秒一镜拆好，配图必须一镜一图，禁止再合并 2～4 镜。',
  '- 用户说「开始同步」「开始检测」「执行检测」「同步分镜配图」等时，由系统把每镜标为独立配图锚点；你解读结果。',
  '- 完成后说明：共多少镜需配图（通常≈分镜数）、片头是否单独 1 张。',
  '',
  '【原则】',
  '- 一镜一图、一镜一视频；画面描述来自分镜脚本 description',
  '- 不要建议合并同场景镜头来减配图张数',
  '',
  '回复简洁；用 #01 #02 指代镜头编号。',
].join('\n')

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
  '- 1～2 镜共用一张漫画插画（一段一图；按内容 1～2 个对照定妆）',
  '- **换人说话 / 换焦点必须换图**',
  '- **同场互动可同框最多 2 个对照定妆**；三人及以上或换反应焦点可拆镜；视线按剧情落在对方/物件等戏内目标，禁止全片直视镜头',
  '- **同一张图整段只用一种运镜**（推/拉/横移/上下等），不会句句换',
  '- **配图可夸张当时表情动作**（汗珠、瞪眼、重心夸张等），定妆仍保持面无表情',
  '- 片头 hook 通常单独 1 张标题图',
  '- 全片配图比例约 50%～70%',
  '',
  '回复简洁、可操作；用 #01 #02 指代镜头编号。',
].join('\n')

const NOVEL_COMIC_DETECT_CHAT_SYSTEM = [
  '你是火宝「小说漫画讲解」流水线的「竖页换页检测」助手，帮助创作者决定哪些讲解镜头需要新开一张素笔彩画竖页。',
  '',
  '【职责】',
  '- 阅读镜头列表，解释换页策略：一张配图=一整页 9:16 二列或三列分格（≈二～三个场面），**按剧情内容**装页，无硬性张数比例。',
  '- 用户说「开始检测」「重新检测」「执行检测」等时，由系统后台执行 LLM 检测；你解读结果。',
  '- 检测完成后总结：共多少张竖页、平均每页几句、主要换页依据（地点/冲突/节拍等）。',
  '- 用户要求调整时，先讨论可行性，建议重新检测；不要假装已改库。',
  '',
  '【配图原则（供讨论）】',
  '- true = 新开一页竖屏分格（不是单幅插画、不是 2×2 四宫格）',
  '- 以情节点/地点/冲突转折为准；常见大约几句一页只是软参考，禁止为凑比例硬切',
  '- panel_beats 可参考约 2～3 条一组，仍以内容为准',
  '- 成片：静图 3 秒 + BGM + 左右翻页（无配音）',
  '',
  '回复简洁、可操作；用 #01 #02 指代镜头编号。',
].join('\n')

function resolveDetectChatSystem(episodeId: number): string {
  const mode = resolveEpisodeProductionMode(episodeId)
  if (isNovelComicMode(mode)) return NOVEL_COMIC_DETECT_CHAT_SYSTEM
  if (isNarrationVideoMode(mode)) return NARRATION_VIDEO_DETECT_CHAT_SYSTEM
  return usesMotionComicVisuals(mode)
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
  // 智谱免费 Flash：开思考易空正文 / 吃配额；检测对话一律关思考
  const textThinking = isZhipuGlmTextModel(textModel)
    ? false
    : resolveEpisodeTextThinking(ep, params.textThinking)
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
  const source = result.image_detect_source === 'one_to_one'
    ? '一镜一图'
    : result.image_detect_source === 'llm'
      ? 'AI 检测'
      : '规则兜底'
  const titleHint = result.title_image_count ? `，含片头 ${result.title_image_count} 张` : ''
  return `同步完成（${source}）：共 ${count} 张需配图${titleHint}。可直接生成配图文案，或继续对话后重新同步。`
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
      const parts = [patch.message]
      if (patch.batch && patch.batch_count) {
        parts.push(`第 ${patch.batch}/${patch.batch_count} 批`)
      }
      if (typeof patch.percent === 'number') {
        parts.push(`${patch.percent}%`)
      }
      reportStatus(parts.filter(Boolean).join(' · '))
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

  // 检测刚结束：直接回摘要，勿再开一轮思考聊天（同配图文案：thinking 吃满 4096 会像「断了」）
  if (detectSummary && params.action === 'run') {
    send({ type: 'delta', content: detectSummary })
    return {
      reply: detectSummary,
      model: textModel,
      text_thinking: false,
      detect: { summary: detectSummary },
    }
  }

  let reply = ''
  reply = await streamTextChatMessages(
    apiMessages,
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

  reply = reply.trim()
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
    detect: undefined,
  }
}
