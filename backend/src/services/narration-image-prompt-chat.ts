/**
 * 配图文案生成 — 多轮聊天（可讨论六维文案、流式展示生成过程、触发执行生成）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel, isZhipuGlmTextModel } from '../constants/text-models.js'
import { resolveNarrationImageStyle } from '../constants/art-styles.js'
import {
  generateNarrationImagePromptsOnly,
  retryMissingNarrationImagePrompts,
} from './narration-image-breakdown.js'
import {
  acquireNarrationImageBreakdownJob,
  releaseNarrationImageBreakdownJob,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { streamTextChatMessages, type TextChatMessage } from './text-chat.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { now } from '../utils/response.js'
import {
  buildPromptChatContextBlock,
  sanitizeImageChatTurns,
  type NarrationImageChatTurn,
} from './narration-image-chat-context.js'
import { createWorkflowChatStatusReporter } from './workflow-chat-status.js'
import { usesMotionComicVisuals, resolveEpisodeProductionMode, isNovelComicMode } from '../constants/production-mode.js'

const NARRATION_PROMPT_CHAT_SYSTEM = [
  '你是火宝解说流水线的「配图文案」助手，帮助创作者生成与调整 Toonflow 规则配图提示词。',
  '',
  '【Toonflow 文案结构】',
  '每条配图 prompt 由 LLM 按规则创作（非本地模板）：@图N 槽位声明 → 对照场景/定妆/道具 →【画面】→【风格】；持物须在人手上；静态画面、无血腥暴力。',
  '',
  '【职责】',
  '- 解读当前各段配图文案就绪情况，解释 @图/对照/【画面】是否完整。',
  '- 用户说「开始生成」「补全文案」「重新生成」等时，由系统后台执行 LLM 批量生成；你解读进度与结果。',
  '- 用户要求改某段文案（如「#05 改成夜市全景」），先给出修改建议或完整 Toonflow 示例，建议重新生成该段或全量生成。',
  '- 有定妆须写对照定妆「name·阶段」；手持物写在【画面】动作里，禁止无人归属桌面陈设。',
  '- 不要输出 markdown 代码块包裹的 JSON；用自然语言 + #镜号 说明。',
  '',
  '回复简洁；用 #01 段号 指代配图锚点镜头。',
].join('\n')

const MOTION_COMIC_PROMPT_CHAT_SYSTEM = [
  '你是火宝漫画解说流水线的「漫画配图文案」助手，帮助创作者生成与调整漫画配图 prompt。',
  '',
  '【整段文案】',
  '每条 prompt 写成一整段连贯中文（不用【】六维标签），但仍须覆盖：画风、画面主体、年代场景、核心动作、光影、镜头、质感；短剧解说高清国漫，冷色戏剧光，正常头身比。',
  '主要配角须写定妆对照；构图适合上下运镜浏览；禁止写实血腥。',
  '',
  '【职责】',
  '- 解读各段配图文案就绪情况，说明关键信息是否齐全。',
  '- 用户说「开始生成」「补全文案」「重新生成」等时，由系统后台执行；你解读进度与结果。',
  '- 用户要求改某段文案，先给出修改建议或完整整段示例。',
  '- 不要输出 markdown 代码块包裹的 JSON；用自然语言 + #镜号 说明。',
  '',
  '回复简洁；用 #01 段号 指代配图锚点镜头。',
].join('\n')

const NOVEL_COMIC_PROMPT_CHAT_SYSTEM = [
  '你是火宝「小说漫画讲解」流水线的「素笔彩画竖页配图文案」助手，帮助创作者生成与调整配图 prompt。',
  '',
  '【整段文案】',
  '每条 prompt 写成一整段连贯中文（不用【】六维标签）：9:16 竖屏二列或三列分格（上→下），素笔细线稿+淡彩，场面环境道具与色调优先。',
  '默认长文画字：每格旁白框内写完整讲解文字，模型须把汉字清晰画进框内；可选短字叠字时才空框后期叠字。',
  '须淡彩上色，禁止纯黑白去色线稿页、赛璐璐厚平涂、无框单图、2×2 四宫格、六格/九格、横屏 16:9、平台水印；主要角色可写定妆对照；成片为静图翻页无配音。',
  '',
  '【职责】',
  '- 解读各段配图文案就绪情况。',
  '- 用户说「开始生成」「补全文案」「重新生成」等时，由系统后台执行；你解读进度与结果。',
  '- 用户要求改某段文案，先给出修改建议或完整整段示例（含上格/下格旁白框「」完整讲解）。',
  '',
  '回复简洁；用 #01 段号 指代配图锚点镜头。',
].join('\n')

function resolvePromptChatSystem(episodeId: number): string {
  const mode = resolveEpisodeProductionMode(episodeId)
  if (isNovelComicMode(mode)) return NOVEL_COMIC_PROMPT_CHAT_SYSTEM
  return usesMotionComicVisuals(mode)
    ? MOTION_COMIC_PROMPT_CHAT_SYSTEM
    : NARRATION_PROMPT_CHAT_SYSTEM
}

export type NarrationImagePromptChatParams = {
  episodeId: number
  messages: NarrationImageChatTurn[]
  textModel?: string | null
  textThinking?: boolean
  action?: 'run' | 'retry_missing' | null
  style?: string
  promptBatchSize?: number
  /** 小说漫画格字：short（默认）| full */
  panelTextMode?: 'short' | 'full' | null
}

function buildPromptChatMessages(params: NarrationImagePromptChatParams) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const turns = sanitizeImageChatTurns(params.messages)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationImageTextModel(ep, params.textModel)
  const textThinking = isZhipuGlmTextModel(textModel)
    ? false
    : resolveEpisodeTextThinking(ep, params.textThinking)
  const context = buildPromptChatContextBlock(params.episodeId)

  const apiMessages: TextChatMessage[] = [
    { role: 'system', content: `${resolvePromptChatSystem(params.episodeId)}\n\n${context}` },
    ...turns,
  ]

  return { ep, turns, textModel, textThinking, apiMessages }
}

function formatPromptResultSummary(result: {
  paragraph_count?: number
  prompts_generated?: number
  prompts_updated?: number
  prompts_missing?: number
  already_complete?: boolean
  partial?: boolean
}) {
  if (result.already_complete) {
    return `全部 ${result.paragraph_count ?? result.prompts_generated ?? 0} 条配图文案已就绪，无需重新生成。`
  }
  const total = result.paragraph_count ?? result.prompts_generated ?? 0
  const missing = Number(result.prompts_missing || 0)
  const updated = result.prompts_updated
  if (missing > 0 || result.partial) {
    const done = typeof updated === 'number' ? updated : Math.max(0, total - missing)
    return `本轮已生成 ${done} 段，仍有 ${missing || '若干'} 段失败已自动跳过。请点「补全缺失文案」继续，无需从头重跑。`
  }
  if (typeof updated === 'number' && updated > 0) {
    return `文案生成完成：本次更新 ${updated} 段，当前共 ${total} 条配图文案已就绪。`
  }
  return `文案生成完成：共 ${total} 条配图文案已就绪。可点「检查文案」扫描问题，或继续对话微调。`
}

export async function streamNarrationImagePromptChat(
  params: NarrationImagePromptChatParams,
  send: (payload: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  const { textModel, textThinking, apiMessages, turns } = buildPromptChatMessages(params)
  let promptSummary = ''

  if (params.action === 'run' || params.action === 'retry_missing') {
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
      // 每段中英文落库后通知前端刷新镜头列表
      if (patch.prompts_saved != null || patch.prompts_saved_seq != null) {
        send({
          type: 'prompts_saved',
          prompts_saved: patch.prompts_saved,
          flux_en_saved: patch.flux_en_saved,
          prompts_saved_seq: patch.prompts_saved_seq,
          message: patch.message,
          percent: patch.percent,
        })
      }
    }

    try {
      reportStatus(
        params.action === 'retry_missing' ? '正在补全缺失配图文案…' : '正在生成配图文案…',
      )
      const style = resolveNarrationImageStyle(params.style)
      const opts = {
        batchSize: params.promptBatchSize,
        textModel,
        // 批量写六维文案强制不思考；对话闲聊仍可用上方 textThinking
        textThinking: false,
        onProgress,
        ...(params.panelTextMode ? { panelTextMode: params.panelTextMode } : {}),
      }

      const result = params.action === 'retry_missing'
        ? await retryMissingNarrationImagePrompts(params.episodeId, style, opts)
        : await generateNarrationImagePromptsOnly(params.episodeId, style, opts)

      promptSummary = formatPromptResultSummary(result)
      send({
        type: 'prompt_done',
        paragraph_count: result.paragraph_count,
        prompts_generated: result.prompts_generated,
        message: promptSummary,
        generated_at: result.generated_at ?? now(),
        image_prompt_at: result.image_prompt_at,
      })
    } finally {
      releaseNarrationImageBreakdownJob(params.episodeId)
    }
  }

  logTaskProgress('NarrationImagePromptChat', 'stream-request', {
    episodeId: params.episodeId,
    model: textModel,
    action: params.action,
    turnCount: turns.length,
  })

  // 批量生成刚结束：直接回结果摘要，勿再开一轮「思考」聊天。
  // 本集常开 text_thinking + deepseek，第二次请求 max_tokens=4096 会被思考链吃光 → 界面像「断了」，
  // 即便文案已落库也会被前端 catch 成整次失败。
  if (promptSummary && (params.action === 'run' || params.action === 'retry_missing')) {
    send({ type: 'delta', content: promptSummary })
    return {
      reply: promptSummary,
      model: textModel,
      text_thinking: false,
      prompt: { summary: promptSummary },
    }
  }

  const systemWithResult = apiMessages

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
    'narration_image_prompt',
  )

  reply = reply.trim()
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
    prompt: undefined,
  }
}
