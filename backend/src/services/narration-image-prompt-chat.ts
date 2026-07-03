/**
 * 配图文案生成 — 多轮聊天（可讨论六维文案、流式展示生成过程、触发执行生成）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel } from '../constants/text-models.js'
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
import { isMotionComicMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'

const NARRATION_PROMPT_CHAT_SYSTEM = [
  '你是火宝解说流水线的「配图文案」助手，帮助创作者生成与调整六维配图提示词。',
  '',
  '【六维文案结构】',
  '每条配图 prompt 含：主体、场景、动作、光影、镜头、画风；与 TTS 旁白句对应，静态画面、无血腥暴力。',
  '',
  '【职责】',
  '- 解读当前各段配图文案就绪情况，解释六维要素是否完整。',
  '- 用户说「开始生成」「补全文案」「重新生成」等时，由系统后台执行 LLM 批量生成；你解读进度与结果。',
  '- 用户要求改某段文案（如「#05 改成夜市全景」），先给出修改建议或完整六维示例，建议重新生成该段或全量生成。',
  '- 【画面主体】有定妆的角色须写「对照定妆「name·阶段」」；手持物/槟榔等写在【核心细节动作】或【年代场景·陈设】；陈设须写具体物件名勿泛称。',
  '- 不要输出 markdown 代码块包裹的 JSON；用自然语言 + #镜号 说明。',
  '',
  '回复简洁；用 #01 段号 指代配图锚点镜头。',
].join('\n')

const MOTION_COMIC_PROMPT_CHAT_SYSTEM = [
  '你是火宝漫画解说流水线的「漫画配图文案」助手，帮助创作者生成与调整六维漫画配图 prompt。',
  '',
  '【六维文案结构】',
  '每条 prompt 含：画风规格、画面主体、年代场景、核心细节动作、光影色调、镜头视角、质感要求；国漫条漫粗线平涂，正常头身比。',
  '主要配角须写定妆外貌；构图适合上下运镜浏览；禁止写实血腥。',
  '',
  '【职责】',
  '- 解读各段配图文案就绪情况，解释六维要素是否完整。',
  '- 用户说「开始生成」「补全文案」「重新生成」等时，由系统后台执行；你解读进度与结果。',
  '- 用户要求改某段文案，先给出修改建议或完整六维示例。',
  '- 不要输出 markdown 代码块包裹的 JSON；用自然语言 + #镜号 说明。',
  '',
  '回复简洁；用 #01 段号 指代配图锚点镜头。',
].join('\n')

function resolvePromptChatSystem(episodeId: number): string {
  return isMotionComicMode(resolveEpisodeProductionMode(episodeId))
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
}

function buildPromptChatMessages(params: NarrationImagePromptChatParams) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const turns = sanitizeImageChatTurns(params.messages)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationImageTextModel(ep, params.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, params.textThinking)
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
  already_complete?: boolean
}) {
  if (result.already_complete) {
    return `全部 ${result.paragraph_count ?? result.prompts_generated ?? 0} 条配图文案已就绪，无需重新生成。`
  }
  const total = result.paragraph_count ?? result.prompts_generated ?? 0
  const updated = result.prompts_updated
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
      reportStatus(patch.message)
    }

    try {
      reportStatus(
        params.action === 'retry_missing' ? '正在补全缺失配图文案…' : '正在生成配图文案…',
      )
      const style = resolveNarrationImageStyle(params.style)
      const opts = {
        batchSize: params.promptBatchSize,
        textModel,
        textThinking,
        onProgress,
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

  const systemWithResult = promptSummary
    ? apiMessages.map((m, i) => i === 0 && m.role === 'system'
      ? { ...m, content: `${m.content}\n\n【刚完成的生成结果】\n${promptSummary}` }
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

  reply = reply.trim() || promptSummary
  if (!reply) throw new Error('AI 未返回内容')

  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
    prompt: promptSummary ? { summary: promptSummary } : undefined,
  }
}
