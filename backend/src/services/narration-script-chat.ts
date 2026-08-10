import { and, eq, isNull } from 'drizzle-orm'
import { parseProductionMode, isMotionComicMode, isLocalComicMode, isDialoguePortraitMode, isNovelComicMode, isNarrationVideoMode, resolveEpisodeProductionMode, usesExplainScriptFlow } from '../constants/production-mode.js'
import { LOCAL_COMIC_SCRIPT_CHAT_SYSTEM, LOCAL_COMIC_SCRIPT_MIN_CHARS } from '../constants/local-comic.js'
import { MOTION_COMIC_SCRIPT_CHAT_SYSTEM } from '../constants/motion-comic.js'
import {
  DIALOGUE_PORTRAIT_SCRIPT_CHAT_SYSTEM,
  DIALOGUE_PORTRAIT_SCRIPT_MIN_CHARS,
  DIALOGUE_PORTRAIT_SCRIPT_MAX_CHARS,
} from '../constants/dialogue-portrait.js'
import {
  NOVEL_COMIC_SCRIPT_CHAT_SYSTEM,
  NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS,
  compressNovelComicPreviousScript,
  formatNovelComicPreviousEpisodeBlock,
  isNovelComicOptimizeNarrationIntent,
  parseNovelComicMeta,
  resolveNovelComicChapterForEpisode,
  resolveNovelComicPanelBeatsForEpisode,
} from '../constants/novel-comic.js'
import { formatNovelBibleForLlm } from '../constants/novel-bible.js'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationScriptChatTextModel, resolveScriptChatTextThinking } from '../constants/text-models.js'
import { ensureScriptEmphasisInBody } from '../utils/subtitle-emphasis.js'
import {
  sanitizeMotionComicScript,
  lineHasSpeakerPrefix,
  measureMotionComicSpeakerRatio,
  MOTION_COMIC_NARRATION_RATIO_SOFT_MAX,
  MOTION_COMIC_NARRATION_RATIO_TARGET,
} from '../utils/motion-comic-script.js'
import {
  callTextChatMessages,
  streamTextChatMessages,
  type OllamaNumCtxProfile,
  type TextChatMessage,
} from './text-chat.js'
import { getTextConfig } from './ai.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { parseNarrationScript } from './narration-breakdown.js'
import {
  applyNarrationScriptEmphasisWithLLM,
  looksLikeNarrationScriptDraft,
} from './narration-emphasis-apply.js'

/** 剧本生成：qwen3.5:9b 用 64K；其它用途默认 32K */
const SCRIPT_CHAT_OLLAMA_NUM_CTX: OllamaNumCtxProfile = 'narration_script'

export type NarrationScriptChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

const NARRATION_SCRIPT_CHAT_SYSTEM = [
  '你是「小说解说」短视频编剧：把小说原文/大纲改写成可直接配音与配图的「解说脚本」。',
  '成片：旁白解说剧情 + 人物对白 + 配图；不是纯旁白散文，不是照搬小说，不是「体验人生」第二人称。',
  '',
  '【最关键·形态】',
  '- 提炼主线剧情，压缩成「旁白解说（行数占比 >20%）+ 人物对话」。',
  '- 每行必须是「说话人：台词」（全角冒号）。叙述用「旁白：」，角色开口用角色全名（如「叶沉：」「林澜：」）。',
  '- 禁止无说话人的裸句；禁止把对白嵌进旁白（不要「叶沉说道」后接台词在同一行）。',
  '- 写完自检：正文「旁白：」行数须 >20%；冲突与高燃优先让角色开口。',
  '',
  '【旁白硬性】',
  '- 旁白只解说剧情推进（谁遇到什么、冲突升到哪、结果是什么）。',
  '- 禁止旁白描写动作、表情、感官细描、心理独白（如青筋、汗水、眼神、骨缝碎裂等一律删掉，交给画面与对白）。',
  '- 旁白里指代人物写角色全名，禁止「他」「她」「他的」「她的」。',
  '',
  '【对白】',
  '- 对白保留关键冲突与情绪，短句利落；可用「你/我」。',
  '- 禁止旧说书腔（且说/话说/却说/看官）；禁止片尾引流、章标题、JSON、markdown。',
  '',
  '【篇幅】',
  '- 成片约 1 分钟对应 600～700 字解说文案（含旁白与对白汉字）。',
  '- 用户指定字数或「约X分钟」时以用户为准（误差约 ±15%）。',
  '- 「改成解说脚本」且未指定时：做成约 2～3 分钟成片，目标约 1500 字，上限 1800 字（3 分钟封顶）；禁止压成空洞短摘要，也禁止写成精修小说。',
  '- 「改成解说脚本」每次都是整篇重写：以【文案输入】为准重新成稿，禁止在旧解说脚本上扩写续写；只有用户明确说「扩写」才扩写。',
  '- 必须涵括【文案输入】整章主线：开端→冲突升级→高燃→余波/钩子，不得只写前半段或高潮切片；次要支线可压缩，关键角色与关键转折不得漏。',
  '',
  '【输出】',
  '- 只输出完整解说脚本正文（说话人行）；不要镜头语言、不要节拍标签。',
  '- 本步骤不要输出 **；字幕强调在「分镜脚本」步骤处理。',
  '- 有【当前解说脚本】则在其基础上改，勿另起新故事。',
  '',
  '闲聊、选题讨论时可正常对话，不必强行输出整稿。',
].join('\n')

/** 与前端「改成解说脚本」按钮文案保持一致（兼容旧「改成讲解稿」） */
export const NARRATION_OPTIMIZE_FROM_SOURCE_USER_HINT =
  '把「文案输入」改成解说脚本：整篇重写；涵括整章主线；每行「旁白：」或「角色名：」；旁白行数>20%且只解说剧情、不写动作表情；人物对话承担冲突；约两三分钟成片、上限1800字；禁止旧说书腔与照抄原文；只输出完整解说脚本。'

export function isNarrationOptimizeFromSourceIntent(text?: string | null): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  if (s === NARRATION_OPTIMIZE_FROM_SOURCE_USER_HINT) return true
  return /改成解说脚本|改成讲解稿|原文改讲解|大纲改讲解|素材改讲解|小说解说/.test(s)
}

function resolveScriptChatSystem(episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return NARRATION_SCRIPT_CHAT_SYSTEM
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const mode = parseProductionMode(drama?.metadata)
  if (isLocalComicMode(mode)) return LOCAL_COMIC_SCRIPT_CHAT_SYSTEM
  if (isDialoguePortraitMode(mode)) return DIALOGUE_PORTRAIT_SCRIPT_CHAT_SYSTEM
  if (isNovelComicMode(mode)) return NOVEL_COMIC_SCRIPT_CHAT_SYSTEM
  if (isMotionComicMode(mode)) return MOTION_COMIC_SCRIPT_CHAT_SYSTEM
  return NARRATION_SCRIPT_CHAT_SYSTEM
}

/** 完整稿篇幅：用户未指定时的默认下限 / 上限 */
export const NARRATION_SCRIPT_MIN_CHARS = 3_000
export const NARRATION_SCRIPT_MAX_CHARS = 10_000
/** @deprecated 使用 NARRATION_SCRIPT_MAX_CHARS */
export const NARRATION_SCRIPT_TARGET_CHARS = NARRATION_SCRIPT_MAX_CHARS

type ScriptLengthPolicy = {
  minChars: number
  maxChars: number
  targetChars: number
  userSpecified: boolean
}

/** 从用户消息解析字数要求（写1000字 / 约800～1200字 / 不超过1500字 等） */
export function parseUserScriptLengthRequest(content: string): ScriptLengthPolicy | null {
  const text = String(content || '').replace(/,/g, '').replace(/，/g, '')
  if (!text) return null

  const clampTarget = (n: number) => Math.max(200, Math.min(NARRATION_SCRIPT_MAX_CHARS, Math.round(n)))

  const range = text.match(
    /(\d{3,5})\s*[～~\-—至到]\s*(\d{3,5})\s*字/,
  )
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const target = clampTarget(Math.round((lo + hi) / 2))
      return {
        minChars: clampTarget(lo * 0.9),
        maxChars: clampTarget(hi * 1.1),
        targetChars: target,
        userSpecified: true,
      }
    }
  }

  const maxOnly = text.match(
    /(?:不超过|最多|控制在|控制到|别超过|不要超过|少于|低于)\s*(\d{3,5})\s*字/,
  )
  if (maxOnly) {
    const max = clampTarget(Number(maxOnly[1]))
    return {
      minChars: clampTarget(max * 0.7),
      maxChars: max,
      targetChars: clampTarget(max * 0.9),
      userSpecified: true,
    }
  }

  const minOnly = text.match(
    /(?:不少于|至少|扩[写充]到|写到|写满|满)\s*(\d{3,5})\s*字/,
  )
  if (minOnly) {
    const min = clampTarget(Number(minOnly[1]))
    return {
      minChars: min,
      maxChars: Math.min(NARRATION_SCRIPT_MAX_CHARS, clampTarget(min * 1.35)),
      targetChars: min,
      userSpecified: true,
    }
  }

  const approx = text.match(
    /(?:写|约|大约|大概|就写|做成|生成|出|要|一共|总共)?\s*(\d{3,5})\s*字(?:左右|上下|即可|就行|左右的|的完整稿|完整稿)?/,
  )
  if (approx) {
    // 避免把「3000～8000字」默认文案里的数字误当成用户要求：需有明确「写/约/字」意图
    const n = clampTarget(Number(approx[1]))
    const hasIntent = /写|约|大约|大概|字数|篇幅|长短|控制|扩写|缩短|生成|出稿|完整稿/.test(text)
      || /(?:^|[^\d])\d{3,5}\s*字/.test(text)
    if (hasIntent) {
      // 「左右/大约」放宽为约 ±25%，避免差几十上百字就触发第二轮慢推理
      const loose = /左右|上下|大约|大概|约/.test(text)
      const loRatio = loose ? 0.75 : 0.85
      const hiRatio = loose ? 1.25 : 1.2
      return {
        minChars: clampTarget(n * loRatio),
        maxChars: clampTarget(n * hiRatio),
        targetChars: n,
        userSpecified: true,
      }
    }
  }

  // 「约3分钟 / 做成2分钟」→ 按 650 字/分钟换算
  const minutes = text.match(/(?:约|大约|大概|做成|做成约|写|目标)?\s*(\d{1,2}(?:\.\d)?)\s*分钟/)
  if (minutes && /分钟|时长|成片/.test(text)) {
    const m = Number(minutes[1])
    if (Number.isFinite(m) && m > 0 && m <= 30) {
      const target = clampTarget(Math.round(m * 650))
      return {
        minChars: clampTarget(target * 0.85),
        maxChars: clampTarget(target * 1.15),
        targetChars: target,
        userSpecified: true,
      }
    }
  }

  return null
}

function findUserScriptLengthPolicy(messages: NarrationScriptChatTurn[]): ScriptLengthPolicy | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    const parsed = parseUserScriptLengthRequest(messages[i].content)
    if (parsed) return parsed
  }
  return null
}

function resolveDefaultScriptMinChars(episodeId: number): number {
  const mode = resolveEpisodeProductionMode(episodeId)
  if (isLocalComicMode(mode)) return LOCAL_COMIC_SCRIPT_MIN_CHARS
  if (isDialoguePortraitMode(mode)) return DIALOGUE_PORTRAIT_SCRIPT_MIN_CHARS
  // 小说漫画讲解：默认不卡最低字数（跟故事走）；用户说「写1200字」时仍走 parseUserScriptLengthRequest
  if (isNovelComicMode(mode)) return 80
  return NARRATION_SCRIPT_MIN_CHARS
}

/** 「改成解说脚本/讲解稿」篇幅策略 */
function resolveExplainScriptOptimizeLengthPolicy(episodeId: number): ScriptLengthPolicy {
  const mode = resolveEpisodeProductionMode(episodeId)
  // 小说漫画：跟故事走，仅防空稿
  if (isNovelComicMode(mode)) {
    return {
      minChars: 80,
      maxChars: NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS,
      targetChars: 80,
      userSpecified: false,
    }
  }
  // 解说视频：约 2～3 分钟；3 分钟上限 1800 字，目标约 1500
  const target = 1_500
  return {
    minChars: 1_200,
    maxChars: 1_800,
    targetChars: target,
    userSpecified: true,
  }
}

function resolveScriptLengthPolicy(
  episodeId: number,
  messages: NarrationScriptChatTurn[],
): ScriptLengthPolicy {
  const mode = resolveEpisodeProductionMode(episodeId)
  const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user')
  // 「改成解说脚本/讲解稿」：固定策略，勿从按钮文案二次解析成用户指定篇幅
  if (
    usesExplainScriptFlow(mode)
    && (
      isNarrationOptimizeFromSourceIntent(lastUser?.content)
      || isNovelComicOptimizeNarrationIntent(lastUser?.content)
    )
  ) {
    return resolveExplainScriptOptimizeLengthPolicy(episodeId)
  }
  const userPolicy = findUserScriptLengthPolicy(messages)
  if (userPolicy) return userPolicy
  const minChars = resolveDefaultScriptMinChars(episodeId)
  const maxChars = isDialoguePortraitMode(mode)
    ? DIALOGUE_PORTRAIT_SCRIPT_MAX_CHARS
    : (isNovelComicMode(mode) ? NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS : NARRATION_SCRIPT_MAX_CHARS)
  return {
    minChars,
    maxChars,
    targetChars: minChars,
    userSpecified: false,
  }
}

const NARRATION_SCRIPT_CHAT_MAX_TOKENS = 24_576
/** 思考模式：预留思考过程 + 正文最多 10000 字（Ollama 64k 上下文） */
const NARRATION_SCRIPT_CHAT_MAX_TOKENS_WITH_THINKING = 57_344
/** 思考模式：Ollama 24k 上下文（num_ctx=24576） */
const NARRATION_SCRIPT_CHAT_MAX_TOKENS_OLLAMA_24K = 20_480
/** 思考模式：Ollama Qwen 3.5 9B 等 64k 上下文（num_ctx=65536，由 text-chat 按请求注入） */
const NARRATION_SCRIPT_CHAT_MAX_TOKENS_OLLAMA_64K = 57_344
/** @deprecated 使用 OLLAMA_64K；保留兼容旧注释 */
const NARRATION_SCRIPT_CHAT_MAX_TOKENS_OLLAMA_32K = NARRATION_SCRIPT_CHAT_MAX_TOKENS_OLLAMA_64K

function resolveScriptChatMaxTokens(textModel: string, thinkingEnabled: boolean): number {
  if (!thinkingEnabled) return NARRATION_SCRIPT_CHAT_MAX_TOKENS
  const model = String(textModel || '').trim().toLowerCase()
  const provider = getTextConfig(textModel).provider.toLowerCase()
  if (provider === 'ollama') {
    if (model.includes('-64k')) return NARRATION_SCRIPT_CHAT_MAX_TOKENS_WITH_THINKING
    if (model.includes('-24k')) return NARRATION_SCRIPT_CHAT_MAX_TOKENS_OLLAMA_24K
    if (model.includes('qwen3.5') || model.includes('qwen3_5')) return NARRATION_SCRIPT_CHAT_MAX_TOKENS_OLLAMA_64K
    return NARRATION_SCRIPT_CHAT_MAX_TOKENS_WITH_THINKING
  }
  return 32_768
}

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

  const base = lines.length ? `【当前项目】\n${lines.join('\n')}` : ''
  const bibleBlock = formatNovelBibleForLlm(drama?.metadata)
  return [base, bibleBlock].filter(Boolean).join('\n\n')
}

/** 读取上集原文，压成短摘录（定妆/上下文参考；小说漫画已不再生成讲解稿） */
export function loadNovelComicPreviousEpisodeSummary(episodeId: number): {
  previousEpisodeNumber: number
  summary: string
} | null {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep || ep.episodeNumber < 2) return null
  const prevNum = ep.episodeNumber - 1
  const [prev] = db.select().from(schema.episodes)
    .where(and(
      eq(schema.episodes.dramaId, ep.dramaId),
      eq(schema.episodes.episodeNumber, prevNum),
      isNull(schema.episodes.deletedAt),
    )).all()
  if (!prev) return null
  // 优先原文；旧项目若仍有讲解稿再回落
  const raw = String(prev.content || '').trim() || String(prev.scriptContent || '').trim()
  const summary = compressNovelComicPreviousScript(raw)
  if (!summary) return null
  return { previousEpisodeNumber: prevNum, summary }
}

/** 剧本聊天上下文：带入「直接输入」/已保存文案，支持多轮改稿 */
export function buildScriptChatContextBlock(episodeId: number, scriptOverride?: string): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return ''

  const mode = resolveEpisodeProductionMode(episodeId)
  const motionComic = isMotionComicMode(mode)
  const novelComic = isNovelComicMode(mode)
  const dialoguePortrait = isDialoguePortraitMode(mode)
  const script = String(scriptOverride || ep.scriptContent || ep.content || '').trim()
  const parts = [buildEpisodeContext(episodeId)]

  if (novelComic) {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
    const chapter = resolveNovelComicChapterForEpisode(drama?.metadata, ep.episodeNumber)
    const panelBeats = resolveNovelComicPanelBeatsForEpisode(drama?.metadata, ep.episodeNumber)
    const epRaw = String(ep.content || '').trim()
    const epScript = String(scriptOverride || ep.scriptContent || '').trim()
    const prev = loadNovelComicPreviousEpisodeSummary(episodeId)
    if (chapter) {
      parts.push(
        '',
        `【本章大纲】第${chapter.number}章「${chapter.title}」`,
        chapter.summary ? `摘要：${chapter.summary}` : '',
        chapter.key_beats?.length ? `情节点：${chapter.key_beats.join('；')}` : '',
      )
    }
    if (panelBeats.length) {
      parts.push(
        '',
        '【场面提示】尽量覆盖，以故事完整为准：',
        ...panelBeats.map((b, i) => `${i + 1}. ${b}`),
      )
    }
    if (prev) {
      parts.push('', formatNovelComicPreviousEpisodeBlock(prev.summary, prev.previousEpisodeNumber))
    }
    if (epRaw) {
      parts.push('', '【文案输入·本章小说原文】改讲解稿时以此为主：', epRaw.slice(0, 20_000))
    } else {
      const novel = String(parseNovelComicMeta(drama?.metadata).source_novel || '').trim()
      if (novel) parts.push('', '【剧集小说原文·摘录】', novel.slice(0, 12_000))
    }
    if (epScript) {
      parts.push('', '【当前讲解稿】在其基础上改，勿另起新故事：', epScript.slice(0, 12_000))
    } else {
      parts.push('', '【当前讲解稿】尚未保存。请根据文案输入改成白话讲解稿。')
    }
    return parts.filter(Boolean).join('\n')
  }

  // 解说视频：文案输入(content) 与讲解稿(script_content) 分离
  if (isNarrationVideoMode(mode)) {
    const epRaw = String(ep.content || '').trim()
    const epScript = String(scriptOverride || ep.scriptContent || '').trim()
    if (epRaw) {
      parts.push('', '【文案输入·原文/大纲/素材】改讲解稿时以此为主：', epRaw.slice(0, 20_000))
    } else {
      parts.push('', '【文案输入】尚未保存。用户可先粘贴原文/大纲，或在对话里直接写完整讲解稿。')
    }
    if (epScript) {
      parts.push('', '【当前讲解稿】在其基础上改，勿另起新故事：', epScript.slice(0, 12_000))
    } else {
      parts.push('', '【当前讲解稿】尚未保存。请根据文案输入改成小说解说讲解稿（精简概括、狠砍感官堆砌、节奏快慢有序；重复写角色名，禁止任何「他」「她」）。')
    }
    return parts.filter(Boolean).join('\n')
  }

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
  if ((motionComic || dialoguePortrait) && prefixedRatio < 0.5) {
    parts.push(
      dialoguePortrait
        ? '格式提示：当前稿多数行无「角色名：」前缀；对话立绘须每行「角色名：台词」，禁止旁白/人生体验解说体。'
        : '格式提示：当前稿多数行无「说话人：」前缀；若用户要求补说话人/补人名，须输出带前缀的完整稿。',
    )
  }
  if (dialoguePortrait) {
    const ratio = measureMotionComicSpeakerRatio(script)
    if (ratio.body >= 4 && ratio.narrationRatio > 0.05) {
      parts.push(
        `格式提示：检测到旁白约 ${Math.round(ratio.narrationRatio * 100)}%；对话立绘须改为纯对白（禁止旁白行），只保留 1～2 个角色开口。`,
      )
    }
  }
  if (motionComic) {
    const ratio = measureMotionComicSpeakerRatio(script)
    if (ratio.body >= 8 && ratio.narrationRatio > MOTION_COMIC_NARRATION_RATIO_SOFT_MAX) {
      parts.push(
        `配比提示：当前旁白约 ${Math.round(ratio.narrationRatio * 100)}%（${ratio.narration}行）、对白约 ${Math.round(ratio.dialogueRatio * 100)}%（${ratio.dialogue}行）；改稿时须压旁白至≤35%、对白≥65%。`,
      )
    }
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

function scriptCharCount(text: string): number {
  return String(text || '').replace(/\s/g, '').length
}

const SCRIPT_AUTO_EXPAND_MAX_ROUNDS = 3

function buildScriptChatResultMeta(
  reply: string,
  textModel: string,
  textThinking: boolean,
  policy: ScriptLengthPolicy,
  extra?: {
    auto_expanded?: boolean
    expand_rounds?: number
    auto_compressed?: boolean
    compress_rounds?: number
    dialogue_ratio_repaired?: boolean
    narration_ratio?: number
    dialogue_ratio?: number
    beat_outline?: string
  },
) {
  const charCount = scriptCharCount(reply)
  const ratio = measureMotionComicSpeakerRatio(reply)
  return {
    reply,
    model: textModel,
    text_thinking: textThinking,
    char_count: charCount,
    min_chars: policy.minChars,
    target_chars: policy.targetChars,
    max_chars: policy.maxChars,
    user_length_specified: policy.userSpecified,
    narration_lines: ratio.narration,
    dialogue_lines: ratio.dialogue,
    narration_ratio: extra?.narration_ratio ?? (ratio.body ? Number(ratio.narrationRatio.toFixed(3)) : null),
    dialogue_ratio: extra?.dialogue_ratio ?? (ratio.body ? Number(ratio.dialogueRatio.toFixed(3)) : null),
    auto_expanded: extra?.auto_expanded ?? false,
    expand_rounds: extra?.expand_rounds ?? 0,
    auto_compressed: extra?.auto_compressed ?? false,
    compress_rounds: extra?.compress_rounds ?? 0,
    dialogue_ratio_repaired: extra?.dialogue_ratio_repaired ?? false,
    below_min: charCount > 0 && charCount < policy.minChars,
    above_max: charCount > policy.maxChars,
    beat_outline: extra?.beat_outline || undefined,
  }
}

/** 用户是否在要完整稿（含「写剧本」「写1000字」「改成解说脚本」等） */
function userWantsFullScriptDraft(content: string): boolean {
  const u = String(content || '').trim()
  if (!u) return false
  if (isNarrationOptimizeFromSourceIntent(u) || isNovelComicOptimizeNarrationIntent(u)) return true
  return /完整稿|整稿|全文|3000|8000|10000|扩写|写一[篇个部]|出稿|写稿|写.{0,8}剧本|帮我写|生成.{0,4}稿|直接写|\d{3,5}\s*字/.test(u)
}

function lastUserMessage(turns: NarrationScriptChatTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'user') return turns[i].content
  }
  return ''
}

function augmentChatTurnsForLength(turns: NarrationScriptChatTurn[], policy: ScriptLengthPolicy): NarrationScriptChatTurn[] {
  if (!turns.length || turns[turns.length - 1].role !== 'user') return turns
  const last = turns[turns.length - 1]
  if (!userWantsFullScriptDraft(last.content)) return turns
  if (policy.userSpecified) {
    if (/严格按|目标约|误差控制|不要写成默认/.test(last.content)) return turns
    return [
      ...turns.slice(0, -1),
      {
        role: 'user' as const,
        content: [
          last.content,
          '',
          `（篇幅硬性：目标约 ${policy.targetChars} 汉字，控制在 ${policy.minChars}～${policy.maxChars} 字。`,
          '请严格按此长度输出完整稿，不要写成默认的 3000～8000/10000 字长稿，也不要只给大纲或片段。）',
        ].join('\n'),
      },
    ]
  }
  if (new RegExp(`不少于\\s*${policy.minChars}|至少\\s*${policy.minChars}|${policy.minChars}\\s*[～~\\-—]`).test(last.content)) {
    return turns
  }
  return [
    ...turns.slice(0, -1),
    {
      role: 'user' as const,
      content: `${last.content}\n\n（请输出完整稿全文，不少于 ${policy.minChars} 汉字，不要只给大纲或片段。）`,
    },
  ]
}

function dedupeAdjacentChatTurns(turns: NarrationScriptChatTurn[]): NarrationScriptChatTurn[] {
  const out: NarrationScriptChatTurn[] = []
  for (const t of turns) {
    const prev = out[out.length - 1]
    if (prev && prev.role === t.role && prev.content === t.content) continue
    out.push(t)
  }
  return out
}

function userAskedScriptExpand(text?: string | null): boolean {
  return /扩写|补全缺失|写长|加长|不够长|字数不够|再写长|继续补全|继续扩/.test(String(text || ''))
}

function shouldAutoExpandScript(turns: NarrationScriptChatTurn[], reply: string, policy: ScriptLengthPolicy): boolean {
  const chars = scriptCharCount(reply)
  if (chars >= policy.minChars) return false
  // 「改成解说脚本」默认整篇重写：未说扩写则不自动扩写
  const lastUser = lastUserMessage(turns)
  if (isNarrationOptimizeFromSourceIntent(lastUser) && !userAskedScriptExpand(lastUser)) {
    return false
  }
  // 用户指定篇幅：至少先过 minChars；达 max(min, 目标70%) 才停
  if (policy.userSpecified && chars >= Math.max(policy.minChars, Math.round(policy.targetChars * 0.7))) {
    return false
  }
  if (!looksLikeScriptChatDraftReply(reply)) return false
  return userWantsFullScriptDraft(lastUser)
}

function shouldAutoCompressScript(reply: string, policy: ScriptLengthPolicy): boolean {
  const chars = scriptCharCount(reply)
  if (chars <= policy.maxChars) return false
  return looksLikeScriptChatDraftReply(reply)
}

function buildScriptCompressUserMessage(currentChars: number, policy: ScriptLengthPolicy): string {
  return [
    `当前稿约 ${currentChars} 字，已超过上限 ${policy.maxChars} 字（目标约 ${policy.targetChars} 字，3 分钟上限 ${policy.maxChars} 字）。`,
    `请精简到 ${policy.minChars}～${policy.maxChars} 字，尽量贴近 ${policy.targetChars} 字。`,
    '硬性：删掉旁白里的动作/表情/感官/心理细描与原文照抄；保留整章主线与关键对白；每行仍是「旁白：」或「角色名：」。',
    '直接输出精简后的完整解说脚本全文，不要解释、不要 diff。',
  ].join('')
}

function buildScriptExpandUserMessage(
  currentChars: number,
  policy: ScriptLengthPolicy,
  options?: { dialoguePortrait?: boolean },
): string {
  if (options?.dialoguePortrait) {
    if (policy.userSpecified) {
      return [
        `当前稿约 ${currentChars} 字，未达到用户要求的约 ${policy.targetChars} 字。`,
        `请在保持 1～2 个角色名与「角色名：台词」格式不变的前提下，加对白回合扩写至约 ${policy.targetChars} 汉字`,
        `（允许范围 ${policy.minChars}～${policy.maxChars} 字）。禁止旁白、禁止人生体验解说体。`,
        '直接输出完整对话台本全文，不要只解释、不要只给 diff 或片段。',
      ].join('')
    }
    return [
      `当前稿约 ${currentChars} 字，不足 ${policy.minChars} 字硬性要求。`,
      `请在保持「角色名：台词」格式与角色上限的前提下扩写至至少 ${policy.minChars} 汉字，`,
      '加冲突问答与情绪回合；禁止旁白注水。直接输出完整对话台本全文。',
    ].join('')
  }
  if (policy.userSpecified) {
    return [
      `当前稿约 ${currentChars} 字，未达到约 ${policy.targetChars} 字（约 2～3 分钟成片）要求。`,
      `请对照【文案输入】整章补齐遗漏情节（开端/冲突升级/高燃/余波钩子），`,
      `扩写至约 ${policy.targetChars} 汉字（允许 ${policy.minChars}～${policy.maxChars} 字）。`,
      '保持每行「旁白：」或「角色名：」；旁白只讲剧情不写动作表情；禁止注水重复。',
      '直接输出完整解说脚本全文，不要只解释、不要只给 diff 或片段。',
    ].join('')
  }
  return [
    `当前稿约 ${currentChars} 字，不足 ${policy.minChars} 字硬性要求。`,
    `请在保持故事主线、人称与说话人格式不变的前提下扩写至至少 ${policy.minChars} 汉字，`,
    '对照原文补齐遗漏情节，不要注水。直接输出完整稿全文。',
  ].join('')
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

function sanitizeChatTurns(
  messages: NarrationScriptChatTurn[],
  policy: ScriptLengthPolicy,
): NarrationScriptChatTurn[] {
  const base = (messages || [])
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m.content || '').trim(),
    }))
    .filter(m => m.content)
    .slice(-24)
  return augmentChatTurnsForLength(dedupeAdjacentChatTurns(base), policy)
}

function finalizeMotionComicScriptReply(reply: string, episodeId: number): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return reply
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const mode = parseProductionMode(drama?.metadata)
  if (!looksLikeScriptChatDraftReply(reply)) return reply.trim()
  if (isDialoguePortraitMode(mode)) {
    // 勿 ensureSpeakers：裸句会自动加「旁白：」，与纯对白规则冲突
    return sanitizeMotionComicScript(reply, { ensureSpeakers: false })
  }
  if (!isMotionComicMode(mode)) return reply
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

  const lengthPolicy = resolveScriptLengthPolicy(params.episodeId, params.messages || [])
  const turns = sanitizeChatTurns(params.messages, lengthPolicy)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new Error('请提供用户消息')
  }

  const textModel = resolveNarrationScriptChatTextModel(
    params.textModel,
    resolveEpisodeProductionMode(params.episodeId),
    ep,
  )
  const textThinking = resolveScriptChatTextThinking(ep, params.textThinking)
  const maxTokens = resolveScriptChatMaxTokens(textModel, textThinking)
  const context = buildScriptChatContextBlock(params.episodeId, params.script)
  let systemPrompt = resolveScriptChatSystem(params.episodeId)
  if (lengthPolicy.userSpecified) {
    systemPrompt = [
      systemPrompt,
      '',
      '【本轮篇幅硬性约束·覆盖默认】',
      `- 用户已指定篇幅：目标约 ${lengthPolicy.targetChars} 汉字，允许 ${lengthPolicy.minChars}～${lengthPolicy.maxChars} 字。`,
      '- 必须按此长度写完整稿；禁止输出默认的 3000～8000/10000 字长稿。',
    ].join('\n')
  }

  const apiMessages: TextChatMessage[] = [
    {
      role: 'system',
      content: context ? `${systemPrompt}\n\n${context}` : systemPrompt,
    },
    ...turns,
  ]

  return {
    ep,
    turns,
    textModel,
    textThinking,
    maxTokens,
    apiMessages,
    minChars: lengthPolicy.minChars,
    lengthPolicy,
  }
}

type ScriptChatStreamHooks = {
  onThinkingDelta?: (delta: string, full: string) => void
  onStatus?: (message: string) => void
  /** 两轮生成：第1轮节拍完成后回调，前端可另开气泡展示 */
  onPhase?: (info: { phase: string; content: string }) => void
}

async function ensureScriptMinLength(params: {
  episodeId: number
  turns: NarrationScriptChatTurn[]
  apiMessages: TextChatMessage[]
  textModel: string
  textThinking: boolean
  maxTokens: number
  lengthPolicy: ScriptLengthPolicy
  initialReply: string
  signal?: AbortSignal
  stream?: {
    onDelta: (delta: string, full: string) => void
    hooks?: ScriptChatStreamHooks
  }
}): Promise<{ reply: string; expandRounds: number }> {
  let reply = params.initialReply.trim()
  let expandRounds = 0
  const policy = params.lengthPolicy

  if (!shouldAutoExpandScript(params.turns, reply, policy)) {
    return { reply, expandRounds }
  }

  let expandMessages = params.apiMessages

  // 扩写轮关闭 thinking，显著缩短本地模型二次推理时间
  const expandThinking = false
  const expandMaxTokens = Math.min(params.maxTokens, policy.userSpecified
    ? Math.max(4096, Math.ceil(policy.targetChars * 4))
    : params.maxTokens)
  // 免费模型扩写易排队卡住：单轮限时 3 分钟，失败则保留当前稿
  const expandTimeoutMs = /:free\b/i.test(String(params.textModel || '')) ? 180_000 : 420_000

  for (let round = 0; round < SCRIPT_AUTO_EXPAND_MAX_ROUNDS; round++) {
    const chars = scriptCharCount(reply)
    if (chars >= policy.minChars) break
    if (policy.userSpecified && chars >= Math.max(policy.minChars, Math.round(policy.targetChars * 0.7))) break

    expandRounds += 1
    logTaskProgress('NarrationScriptChat', 'auto-expand', {
      episodeId: params.episodeId,
      round: expandRounds,
      chars,
      min: policy.minChars,
      target: policy.targetChars,
      userSpecified: policy.userSpecified,
      model: params.textModel,
      thinking: expandThinking,
    })
    params.stream?.hooks?.onStatus?.(
      policy.userSpecified
        ? `篇幅约 ${chars} 字，未达目标 ${policy.targetChars} 字，正在快速补齐（第 ${expandRounds} 轮，已关思考）…`
        : `篇幅不足 ${chars} 字，正在自动扩写（第 ${expandRounds} 轮）…`,
    )

    expandMessages = [
      ...expandMessages,
      { role: 'assistant' as const, content: reply },
      { role: 'user' as const, content: buildScriptExpandUserMessage(chars, policy, {
        dialoguePortrait: isDialoguePortraitMode(resolveEpisodeProductionMode(params.episodeId)),
      }) },
    ]

    try {
      if (params.stream) {
        reply = await streamTextChatMessages(
          expandMessages,
          params.stream.onDelta,
          params.textModel,
          expandThinking,
          expandTimeoutMs,
          0.65,
          params.signal,
          expandMaxTokens,
          { onThinkingDelta: params.stream.hooks?.onThinkingDelta },
          SCRIPT_CHAT_OLLAMA_NUM_CTX,
        )
      } else {
        reply = (await callTextChatMessages(
          expandMessages,
          params.textModel,
          expandThinking,
          expandTimeoutMs,
          0.65,
          expandMaxTokens,
          SCRIPT_CHAT_OLLAMA_NUM_CTX,
        )).trim()
      }
      reply = finalizeMotionComicScriptReply(reply, params.episodeId)
    } catch (err: unknown) {
      const msg = String((err as Error)?.message || err || 'unknown')
      logTaskWarn('NarrationScriptChat', 'auto-expand-failed', {
        episodeId: params.episodeId,
        round: expandRounds,
        chars,
        error: msg,
      })
      params.stream?.hooks?.onStatus?.(
        `自动扩写未完成（${msg.slice(0, 80)}），先保留当前约 ${chars} 字稿…`,
      )
      break
    }
  }

  return { reply, expandRounds }
}

const SCRIPT_AUTO_COMPRESS_MAX_ROUNDS = 2

async function ensureScriptMaxLength(params: {
  episodeId: number
  apiMessages: TextChatMessage[]
  textModel: string
  maxTokens: number
  lengthPolicy: ScriptLengthPolicy
  initialReply: string
  signal?: AbortSignal
  stream?: {
    onDelta: (delta: string, full: string) => void
    hooks?: ScriptChatStreamHooks
  }
}): Promise<{ reply: string; compressRounds: number }> {
  let reply = params.initialReply.trim()
  let compressRounds = 0
  const policy = params.lengthPolicy

  if (!shouldAutoCompressScript(reply, policy)) {
    return { reply, compressRounds }
  }

  let compressMessages = params.apiMessages
  const compressTimeoutMs = /:free\b/i.test(String(params.textModel || '')) ? 180_000 : 420_000
  const compressMaxTokens = Math.min(params.maxTokens, Math.max(4096, Math.ceil(policy.maxChars * 3)))

  for (let round = 0; round < SCRIPT_AUTO_COMPRESS_MAX_ROUNDS; round++) {
    const chars = scriptCharCount(reply)
    if (chars <= policy.maxChars) break

    compressRounds += 1
    logTaskProgress('NarrationScriptChat', 'auto-compress', {
      episodeId: params.episodeId,
      round: compressRounds,
      chars,
      max: policy.maxChars,
      target: policy.targetChars,
      model: params.textModel,
    })
    params.stream?.hooks?.onStatus?.(
      `篇幅约 ${chars} 字，超出上限 ${policy.maxChars}，正在精简（第 ${compressRounds} 轮）…`,
    )

    compressMessages = [
      ...compressMessages,
      { role: 'assistant' as const, content: reply },
      { role: 'user' as const, content: buildScriptCompressUserMessage(chars, policy) },
    ]

    try {
      if (params.stream) {
        reply = await streamTextChatMessages(
          compressMessages,
          params.stream.onDelta,
          params.textModel,
          false,
          compressTimeoutMs,
          0.35,
          params.signal,
          compressMaxTokens,
          { onThinkingDelta: params.stream.hooks?.onThinkingDelta },
          SCRIPT_CHAT_OLLAMA_NUM_CTX,
        )
      } else {
        reply = (await callTextChatMessages(
          compressMessages,
          params.textModel,
          false,
          compressTimeoutMs,
          0.35,
          compressMaxTokens,
          SCRIPT_CHAT_OLLAMA_NUM_CTX,
        )).trim()
      }
      reply = finalizeMotionComicScriptReply(reply, params.episodeId)
    } catch (err: unknown) {
      const msg = String((err as Error)?.message || err || 'unknown')
      logTaskWarn('NarrationScriptChat', 'auto-compress-failed', {
        episodeId: params.episodeId,
        round: compressRounds,
        chars,
        error: msg,
      })
      params.stream?.hooks?.onStatus?.(
        `自动精简未完成（${msg.slice(0, 80)}），先保留当前约 ${chars} 字稿…`,
      )
      break
    }
  }

  return { reply, compressRounds }
}

function episodeIsMotionComic(episodeId: number): boolean {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return false
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return isMotionComicMode(parseProductionMode(drama?.metadata))
}

const DIALOGUE_RATIO_REPAIR_MAX_ROUNDS = 3
/** 至少压低这么多旁白占比才算本轮有效改进 */
const DIALOGUE_RATIO_REPAIR_MIN_IMPROVE = 0.03

function buildDialogueRatioRepairUserMessage(
  ratio: ReturnType<typeof measureMotionComicSpeakerRatio>,
  round: number,
): string {
  const nPct = Math.round(ratio.narrationRatio * 100)
  const dPct = Math.round(ratio.dialogueRatio * 100)
  const targetPct = Math.round(MOTION_COMIC_NARRATION_RATIO_TARGET * 100)
  const hardPct = Math.round(MOTION_COMIC_NARRATION_RATIO_SOFT_MAX * 100)
  const roundHint = round > 1
    ? `这是第 ${round} 轮加压：上一轮仍未达标，必须更狠地把叙述改成角色开口。`
    : ''
  return [
    `当前台本旁白约 ${nPct}%（${ratio.narration}行）、对白约 ${dPct}%（${ratio.dialogue}行），旁白过多。`,
    roundHint,
    `请整稿改写：压旁白至约 ${targetPct}%、对白约 ${100 - targetPct}%（旁白必须 ≤${hardPct}%，按行数计，不含「剧中：」）。`,
    '硬性改法：',
    '- 冲突/电话/质问/劝阻/报警/震惊反驳：一律写成「角色名：/我：」对白行，禁止旁白转述「他说/她喊/对方质问」。',
    '- 家庭细节、年龄、态度表态：尽量由角色自己说出。',
    '- 删除空桥接旁白（直接对他说/接着开口道等）；喊话内容不得留在旁白。',
    '- 旁白只留：场景切换、可见动作、时间压迫；删掉可改成对白的情节旁白。',
    '- 保持一句一行、故事情节完整，不要砍成提纲。',
    '只输出修改后的完整台本（每行说话人：台词），不要解释、不要配比说明。',
  ].filter(Boolean).join('\n')
}

/** 漫画解说：旁白占比过高时自动压旁白（确定性清洗 + 多轮 LLM，关 thinking） */
async function ensureMotionComicDialogueRatio(params: {
  episodeId: number
  apiMessages: TextChatMessage[]
  textModel: string
  maxTokens: number
  initialReply: string
  signal?: AbortSignal
  stream?: {
    onDelta: (delta: string, full: string) => void
    hooks?: ScriptChatStreamHooks
  }
}): Promise<{ reply: string; repaired: boolean; ratio: ReturnType<typeof measureMotionComicSpeakerRatio> }> {
  let best = finalizeMotionComicScriptReply(params.initialReply.trim(), params.episodeId)
  let bestRatio = measureMotionComicSpeakerRatio(best)
  let repaired = false

  if (!episodeIsMotionComic(params.episodeId)) {
    return { reply: best, repaired: false, ratio: bestRatio }
  }
  if (!looksLikeScriptChatDraftReply(best) || bestRatio.body < 8) {
    return { reply: best, repaired: false, ratio: bestRatio }
  }
  if (bestRatio.narrationRatio <= MOTION_COMIC_NARRATION_RATIO_SOFT_MAX) {
    return { reply: best, repaired: false, ratio: bestRatio }
  }

  const ratio0 = bestRatio
  logTaskWarn('NarrationScriptChat', 'narration-ratio-high', {
    episodeId: params.episodeId,
    narration: ratio0.narration,
    dialogue: ratio0.dialogue,
    narrationRatio: Number(ratio0.narrationRatio.toFixed(3)),
    model: params.textModel,
  })

  const repairThinking = false
  const repairMaxTokens = Math.min(params.maxTokens, 24_576)

  for (let round = 1; round <= DIALOGUE_RATIO_REPAIR_MAX_ROUNDS; round++) {
    if (bestRatio.narrationRatio <= MOTION_COMIC_NARRATION_RATIO_SOFT_MAX) break

    params.stream?.hooks?.onStatus?.(
      `旁白约 ${Math.round(bestRatio.narrationRatio * 100)}% 偏高，正在自动压旁白、加对白（${round}/${DIALOGUE_RATIO_REPAIR_MAX_ROUNDS}）…`,
    )
    // 清空流式区，避免 UI 一直显示未修稿；后续 delta 为修稿全文
    params.stream?.onDelta?.('', '')

    const repairMessages: TextChatMessage[] = [
      ...params.apiMessages,
      { role: 'assistant', content: best },
      { role: 'user', content: buildDialogueRatioRepairUserMessage(bestRatio, round) },
    ]

    let candidate: string
    try {
      if (params.stream) {
        candidate = await streamTextChatMessages(
          repairMessages,
          params.stream.onDelta,
          params.textModel,
          repairThinking,
          900_000,
          0.45,
          params.signal,
          repairMaxTokens,
          { onThinkingDelta: params.stream.hooks?.onThinkingDelta },
          SCRIPT_CHAT_OLLAMA_NUM_CTX,
        )
      } else {
        candidate = (await callTextChatMessages(
          repairMessages,
          params.textModel,
          repairThinking,
          900_000,
          0.45,
          repairMaxTokens,
          SCRIPT_CHAT_OLLAMA_NUM_CTX,
        )).trim()
      }
    } catch (err: unknown) {
      const msg = String((err as Error)?.message || err || 'unknown')
      logTaskWarn('NarrationScriptChat', 'dialogue-ratio-repair-error', {
        episodeId: params.episodeId,
        round,
        error: msg,
        bestNarrationRatio: Number(bestRatio.narrationRatio.toFixed(3)),
      })
      // LLM 软失败：保留当前最优稿，不再静默当作成功
      break
    }

    candidate = finalizeMotionComicScriptReply(candidate, params.episodeId)
    const ratio1 = measureMotionComicSpeakerRatio(candidate)
    const validDraft =
      looksLikeScriptChatDraftReply(candidate)
      && ratio1.body >= Math.max(6, Math.floor(bestRatio.body * 0.45))
    const reached = ratio1.narrationRatio <= MOTION_COMIC_NARRATION_RATIO_SOFT_MAX
    const improved = ratio1.narrationRatio <= bestRatio.narrationRatio - DIALOGUE_RATIO_REPAIR_MIN_IMPROVE

    if (validDraft && (reached || improved)) {
      logTaskProgress('NarrationScriptChat', 'dialogue-ratio-repaired', {
        episodeId: params.episodeId,
        round,
        before: Number(bestRatio.narrationRatio.toFixed(3)),
        after: Number(ratio1.narrationRatio.toFixed(3)),
        narration: ratio1.narration,
        dialogue: ratio1.dialogue,
      })
      best = candidate
      bestRatio = ratio1
      repaired = true
      if (reached) break
      continue
    }

    logTaskWarn('NarrationScriptChat', 'dialogue-ratio-repair-skipped', {
      episodeId: params.episodeId,
      round,
      before: Number(bestRatio.narrationRatio.toFixed(3)),
      after: Number(ratio1.narrationRatio.toFixed(3)),
      validDraft,
    })
    // 本轮无效或几乎无改进：停止空转
    break
  }

  if (bestRatio.narrationRatio > MOTION_COMIC_NARRATION_RATIO_SOFT_MAX) {
    logTaskWarn('NarrationScriptChat', 'dialogue-ratio-still-high', {
      episodeId: params.episodeId,
      initial: Number(ratio0.narrationRatio.toFixed(3)),
      final: Number(bestRatio.narrationRatio.toFixed(3)),
      narration: bestRatio.narration,
      dialogue: bestRatio.dialogue,
      repaired,
    })
  }

  return { reply: best, repaired, ratio: bestRatio }
}

/** 两轮·第1轮：节拍大纲（解说视频 / 小说漫画共用骨架） */
const EXPLAIN_SCRIPT_BEAT_OUTLINE_SYSTEM = [
  '你是短视频讲解「节拍编剧」：根据小说原文/大纲，只输出本章情节节拍大纲，不要写旁白/对白正文。',
  '',
  '【输出格式】每行一条，严格如下：',
  '序号. 节奏·慢|中|快｜地点｜角色名 + 冲突/结果',
  '例：3. 节奏·快｜教室讲台｜叶沉交卷触王志刚掌心，桌沿烧穿，全班炸锅',
  '',
  '【硬性】',
  '- 6～14 条，覆盖主线、冲突升级与高燃点；可加减承上启下拍点。',
  '- 必须写角色全名，禁止「他」「她」「他的」「她的」。',
  '- 每条一行短句；禁止散文、禁止感官堆砌、禁止心理独白、禁止完整对白台本。',
  '- 节奏标签必填：铺垫/对峙用慢，爆发/冲突用快，余波/钩子用慢。',
  '- 只输出节拍列表，不要前言后语、不要 markdown。',
].join('\n')

/** 解说视频两轮·第1轮：节拍须铺满整章，支撑 2～3 分钟成片 */
const NARRATION_VIDEO_BEAT_OUTLINE_SYSTEM = [
  '你是小说解说短视频「节拍编剧」：根据【文案输入】整章，只输出情节节拍大纲，不要写旁白/对白正文。',
  '',
  '【输出格式】每行一条，严格如下：',
  '序号. 节奏·慢|中|快｜地点｜角色名 + 冲突/结果',
  '例：3. 节奏·快｜教室讲台｜叶沉交卷失控，桌沿烧穿，王志刚质问，全班炸锅',
  '',
  '【硬性·整章覆盖】',
  '- 10～18 条，必须按时间顺序铺满整章：开端铺垫→冲突升级→高燃爆发→余波/下集钩子。',
  '- 不得只写高潮切片；原文后半段的关键角色、关键转折、收束钩子一律入拍。',
  '- 必须写角色全名，禁止「他」「她」「他的」「她的」。',
  '- 每条一行短句；禁止散文、禁止感官堆砌、禁止心理独白、禁止完整对白台本。',
  '- 节奏标签必填：铺垫/对峙用慢，爆发/冲突用快，余波/钩子用慢。',
  '- 只输出节拍列表，不要前言后语、不要 markdown。',
].join('\n')

/** 小说漫画两轮·第2轮：按节拍写白话旁白讲解稿（保持纯旁白） */
const NOVEL_COMIC_EXPLAIN_FROM_BEATS_SYSTEM = [
  NOVEL_COMIC_SCRIPT_CHAT_SYSTEM,
  '',
  '【本轮硬性·按节拍写】',
  '- 严格按【节拍大纲】写成白话旁白讲解稿；一拍对应一段或数句，顺序不得乱跳。',
  '- 标注「快」的拍：短句连击；标注「慢」的拍：可略多半句交代处境。',
  '- 只输出旁白朗读正文；不要重复节拍列表；不要「节奏·慢/快」标签。',
  '- 篇幅跟故事走；狠砍感官堆砌；指代人物写角色全名，禁止「他」「她」。',
].join('\n')

/** 解说视频两轮·第2轮：按节拍写旁白+对白解说脚本 */
const NARRATION_VIDEO_EXPLAIN_FROM_BEATS_SYSTEM = [
  NARRATION_SCRIPT_CHAT_SYSTEM,
  '',
  '【本轮硬性·按节拍写解说脚本】',
  '- 严格按【节拍大纲】写成解说脚本；每条节拍都要落到正文，不得跳拍、不得只写前半章。',
  '- 每行「旁白：」或「角色名：」；旁白只解说剧情，禁止动作/表情/感官描写；冲突与高燃优先角色开口。',
  '- 禁止照抄【文案输入】长句；禁止散文细描（汗水、青筋、气味、体温、骨缝等一律删）。',
  '- 旁白行数须 >20%；不要重复节拍列表；不要把「节奏·慢/快」写进正文。',
  '- 篇幅硬性：约 2～3 分钟成片，目标约 1500 字，不得超过 1800 字（3 分钟上限）；对照原文核对是否漏掉后半章。',
  '- 本次为整篇重写：只根据节拍与【文案输入】重新成稿，禁止承接或扩写旧解说脚本。',
].join('\n')

function isExplainScriptOptimizeIntent(text?: string | null): boolean {
  return isNarrationOptimizeFromSourceIntent(text) || isNovelComicOptimizeNarrationIntent(text)
}

function stripBeatOutlineNoise(text: string): string {
  return String(text || '')
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^【?第?\s*1\s*轮[·・]?节拍大纲】?\s*/m, '')
    .trim()
}

function formatBeatOutlineForDisplay(beats: string): string {
  const body = stripBeatOutlineNoise(beats)
  return `【第1轮·节拍大纲】\n${body}`
}

async function tryExplainScriptBeatTwoPass(params: {
  episodeId: number
  messages: NarrationScriptChatTurn[]
  textModel: string
  textThinking: boolean
  script?: string
  lengthPolicy: ScriptLengthPolicy
  stream?: {
    onDelta: (delta: string, full: string) => void
    hooks?: ScriptChatStreamHooks
  }
  signal?: AbortSignal
}): Promise<ReturnType<typeof buildScriptChatResultMeta> | null> {
  const mode = resolveEpisodeProductionMode(params.episodeId)
  if (!usesExplainScriptFlow(mode)) return null

  const lastUser = [...(params.messages || [])].reverse().find(m => m.role === 'user')
  if (!isExplainScriptOptimizeIntent(lastUser?.content)) return null

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, params.episodeId)).all()
  if (!ep) return null
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()

  const materialParts: string[] = [buildEpisodeContext(params.episodeId)]
  if (isNovelComicMode(mode)) {
    const chapter = resolveNovelComicChapterForEpisode(drama?.metadata, ep.episodeNumber)
    const panelBeats = resolveNovelComicPanelBeatsForEpisode(drama?.metadata, ep.episodeNumber)
    const prev = loadNovelComicPreviousEpisodeSummary(params.episodeId)
    if (chapter) {
      materialParts.push(
        `【本章大纲】第${chapter.number}章「${chapter.title}」`,
        chapter.summary ? `摘要：${chapter.summary}` : '',
      )
    }
    if (panelBeats.length) {
      materialParts.push('【场面提示】', ...panelBeats.map((b, i) => `${i + 1}. ${b}`))
    }
    if (prev) {
      materialParts.push(formatNovelComicPreviousEpisodeBlock(prev.summary, prev.previousEpisodeNumber))
    }
  }

  const source = String(ep.content || '').trim()
    || (isNovelComicMode(mode) ? String(parseNovelComicMeta(drama?.metadata).source_novel || '').trim() : '')
  const currentScript = String(params.script || ep.scriptContent || '').trim()
  const wantExpand = userAskedScriptExpand(lastUser?.content)
  // 「改成解说脚本」默认整篇重写：有文案输入时绝不喂旧解说脚本（避免模型扩写续写）
  if (source) {
    materialParts.push('【文案输入】', source.slice(0, 20_000))
  } else if (currentScript) {
    materialParts.push(
      isNarrationVideoMode(mode)
        ? '【当前解说脚本·请整篇重写为旁白+对白标准，禁止扩写注水】'
        : '【当前讲解稿·请改写成白话讲解】',
      currentScript.slice(0, 12_000),
    )
  }
  if (!source && !currentScript) {
    throw new Error(
      isNarrationVideoMode(mode)
        ? '请先在「文案输入」粘贴本章小说/大纲，再点「改成解说脚本」'
        : '请先在「文案输入」粘贴本章小说/大纲，再点「改成讲解稿」',
    )
  }

  const material = materialParts.filter(Boolean).join('\n\n')
  const maxTokens = resolveScriptChatMaxTokens(params.textModel, params.textThinking)
  const policy = params.lengthPolicy.userSpecified
    ? params.lengthPolicy
    : resolveExplainScriptOptimizeLengthPolicy(params.episodeId)
  // 免费模型开 thinking 极易排队超时；两轮改稿默认关思考
  const twoPassThinking = /:free\b/i.test(String(params.textModel || ''))
    ? false
    : params.textThinking

  logTaskProgress('NarrationScriptChat', 'explain-beat-two-pass-start', {
    episodeId: params.episodeId,
    mode,
    model: params.textModel,
    hasSource: !!source,
    hasScript: !!currentScript,
    rewriteFromSource: !!source,
    wantExpand,
    userSpecifiedLength: policy.userSpecified,
    minChars: policy.minChars,
    maxChars: policy.maxChars,
    thinking: twoPassThinking,
  })

  // —— 第1轮：节拍大纲 ——
  const narrationVideo = isNarrationVideoMode(mode)
  params.stream?.hooks?.onStatus?.(
    narrationVideo
      ? (wantExpand ? '第1轮：正在生成节拍大纲（扩写）…' : '第1轮：整篇重写 · 正在生成节拍大纲…')
      : '第1轮：正在生成节拍大纲…',
  )
  params.stream?.onDelta?.('', '')
  const beatSystem = narrationVideo
    ? NARRATION_VIDEO_BEAT_OUTLINE_SYSTEM
    : EXPLAIN_SCRIPT_BEAT_OUTLINE_SYSTEM
  const beatMessages: TextChatMessage[] = [
    { role: 'system', content: beatSystem },
    {
      role: 'user',
      content: [
        narrationVideo
          ? '请根据下列材料输出整章节拍大纲（10～18 条，铺满开端到余波；只出列表，不要旁白）。'
          : '请根据下列材料输出本章节拍大纲（只出列表，不要旁白）。',
        '',
        material,
      ].join('\n'),
    },
  ]

  let beatsRaw = ''
  if (params.stream?.onDelta) {
    beatsRaw = await streamTextChatMessages(
      beatMessages,
      (_delta, full) => {
        const display = formatBeatOutlineForDisplay(full)
        params.stream?.onDelta?.(display, display)
      },
      params.textModel,
      twoPassThinking,
      420_000,
      0.4,
      params.signal,
      Math.min(4096, maxTokens),
      { onThinkingDelta: params.stream?.hooks?.onThinkingDelta },
      SCRIPT_CHAT_OLLAMA_NUM_CTX,
    )
  } else {
    beatsRaw = await callTextChatMessages(
      beatMessages,
      params.textModel,
      twoPassThinking,
      420_000,
      0.4,
      Math.min(4096, maxTokens),
      SCRIPT_CHAT_OLLAMA_NUM_CTX,
    )
  }

  const beats = stripBeatOutlineNoise(beatsRaw)
  if (scriptCharCount(beats) < 40) {
    throw new Error('节拍大纲过短，请重试')
  }
  const beatsDisplay = formatBeatOutlineForDisplay(beats)
  params.stream?.onDelta?.(beatsDisplay, beatsDisplay)
  params.stream?.hooks?.onPhase?.({ phase: 'beats_done', content: beatsDisplay })

  // —— 第2轮：按节拍写稿（解说视频=旁白+对白；小说漫画=白话旁白）——
  const fromBeatsSystem = narrationVideo
    ? NARRATION_VIDEO_EXPLAIN_FROM_BEATS_SYSTEM
    : NOVEL_COMIC_EXPLAIN_FROM_BEATS_SYSTEM
  params.stream?.hooks?.onStatus?.(
    policy.userSpecified
      ? (narrationVideo
        ? `第2轮：${wantExpand ? '扩写' : '整篇重写'}解说脚本（目标约 ${policy.targetChars} 字，上限 ${policy.maxChars}）…`
        : `第2轮：正在按节拍写旁白（目标约 ${policy.targetChars} 字）…`)
      : (narrationVideo ? '第2轮：整篇重写解说脚本…' : '第2轮：正在按节拍写旁白…'),
  )
  params.stream?.onDelta?.('', '')
  const lengthHint = narrationVideo
    ? [
        `【篇幅硬性】约 2～3 分钟成片；目标约 ${policy.targetChars} 汉字，必须落在 ${policy.minChars}～${policy.maxChars} 字；3 分钟上限 ${policy.maxChars} 字，禁止超过。`,
        '必须涵括整章主线（开端→冲突→高燃→余波钩子），不得只写高潮切片。',
        wantExpand
          ? '本次可在现有篇幅上补齐遗漏情节并扩写到目标字数。'
          : '本次为整篇重写：只根据节拍与【文案输入】重新成稿，禁止扩写旧解说脚本、禁止照抄原文长句。',
        '旁白只解说剧情，禁止动作表情感官细描。',
      ].join('\n')
    : (policy.userSpecified
      ? [
          `【篇幅硬性】目标约 ${policy.targetChars} 汉字，允许 ${policy.minChars}～${policy.maxChars} 字。`,
          '须压缩感官堆砌与重复铺垫；禁止写成精修小说。',
        ].join('\n')
      : [
          '【篇幅】跟故事走，不按原文百分比卡字数。',
          '精简概括、狠砍感官堆砌；禁止写成精修小说，也禁止压成空洞短摘要。',
        ].join('\n'))
  const narrateMessages: TextChatMessage[] = [
    { role: 'system', content: fromBeatsSystem },
    {
      role: 'user',
      content: [
        narrationVideo
          ? (wantExpand
            ? '请严格按【节拍大纲】写成完整解说脚本；每条节拍都要落到正文；每行「旁白：」或「角色名：」；只输出说话人行正文；字数不得超过上限。'
            : '请严格按【节拍大纲】整篇重写完整解说脚本（不要扩写旧稿）；每条节拍都要落到正文；每行「旁白：」或「角色名：」；只输出说话人行正文；字数不得超过上限。')
          : '请严格按【节拍大纲】写成旁白讲解稿；只输出旁白正文。',
        '',
        lengthHint,
        '',
        '【节拍大纲】',
        beats,
        '',
        '【材料摘录·核对情节用人名，禁止复述原文长描写；解说须覆盖整章】',
        material.slice(0, 16_000),
      ].join('\n'),
    },
  ]

  let narration = ''
  const narrateTimeoutMs = /:free\b/i.test(String(params.textModel || '')) ? 420_000 : 900_000
  if (params.stream?.onDelta) {
    narration = await streamTextChatMessages(
      narrateMessages,
      params.stream.onDelta,
      params.textModel,
      twoPassThinking,
      narrateTimeoutMs,
      0.55,
      params.signal,
      maxTokens,
      { onThinkingDelta: params.stream?.hooks?.onThinkingDelta },
      SCRIPT_CHAT_OLLAMA_NUM_CTX,
    )
  } else {
    narration = await callTextChatMessages(
      narrateMessages,
      params.textModel,
      twoPassThinking,
      narrateTimeoutMs,
      0.55,
      maxTokens,
      SCRIPT_CHAT_OLLAMA_NUM_CTX,
    )
  }

  narration = String(narration || '').trim()
    .replace(/^【?第?\s*2\s*轮[·・]?(?:旁白讲解稿|解说脚本)？】?\s*/m, '')
    .trim()
  if (scriptCharCount(narration) < 80) {
    throw new Error(narrationVideo ? '解说脚本过短，请重试' : '旁白讲解稿过短，请重试')
  }

  // 解说视频：仅用户明确说「扩写」时才自动补齐字数；默认整篇重写不扩
  let expandRounds = 0
  let compressRounds = 0
  let autoExpanded = false
  let autoCompressed = false
  if (narrationVideo && wantExpand && scriptCharCount(narration) < policy.minChars) {
    const expandTurns: NarrationScriptChatTurn[] = [
      ...(params.messages || []),
      { role: 'user', content: NARRATION_OPTIMIZE_FROM_SOURCE_USER_HINT },
    ]
    try {
      const expanded = await ensureScriptMinLength({
        episodeId: params.episodeId,
        turns: expandTurns,
        apiMessages: narrateMessages,
        textModel: params.textModel,
        textThinking: false,
        maxTokens,
        lengthPolicy: policy,
        initialReply: narration,
        signal: params.signal,
        stream: params.stream,
      })
      narration = expanded.reply
      expandRounds = expanded.expandRounds
      autoExpanded = expandRounds > 0
    } catch (err: unknown) {
      logTaskWarn('NarrationScriptChat', 'explain-expand-skipped', {
        episodeId: params.episodeId,
        chars: scriptCharCount(narration),
        error: String((err as Error)?.message || err || 'unknown'),
      })
    }
  }

  // 超上限：自动精简到 ≤1800（顺带砍感官/照抄）
  if (narrationVideo && scriptCharCount(narration) > policy.maxChars) {
    try {
      const compressed = await ensureScriptMaxLength({
        episodeId: params.episodeId,
        apiMessages: narrateMessages,
        textModel: params.textModel,
        maxTokens,
        lengthPolicy: policy,
        initialReply: narration,
        signal: params.signal,
        stream: params.stream,
      })
      narration = compressed.reply
      compressRounds = compressed.compressRounds
      autoCompressed = compressRounds > 0
    } catch (err: unknown) {
      logTaskWarn('NarrationScriptChat', 'explain-compress-skipped', {
        episodeId: params.episodeId,
        chars: scriptCharCount(narration),
        error: String((err as Error)?.message || err || 'unknown'),
      })
    }
  }

  const chars = scriptCharCount(narration)
  if (narrationVideo && chars < policy.minChars) {
    logTaskWarn('NarrationScriptChat', 'explain-script-still-below-min', {
      episodeId: params.episodeId,
      chars,
      min: policy.minChars,
      target: policy.targetChars,
      expandRounds,
    })
  }
  if (narrationVideo && chars > policy.maxChars) {
    logTaskWarn('NarrationScriptChat', 'explain-script-still-above-max', {
      episodeId: params.episodeId,
      chars,
      max: policy.maxChars,
      target: policy.targetChars,
      compressRounds,
    })
  }

  logTaskProgress('NarrationScriptChat', 'explain-beat-two-pass-done', {
    episodeId: params.episodeId,
    beatChars: scriptCharCount(beats),
    narrChars: chars,
    userSpecifiedLength: policy.userSpecified,
    expandRounds,
    compressRounds,
  })

  return buildScriptChatResultMeta(narration, params.textModel, params.textThinking, policy, {
    auto_expanded: autoExpanded,
    expand_rounds: expandRounds,
    auto_compressed: autoCompressed,
    compress_rounds: compressRounds,
    beat_outline: beats,
  })
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
  hooks?: ScriptChatStreamHooks,
) {
  const { textModel, textThinking, maxTokens, apiMessages, turns, minChars, lengthPolicy } = buildNarrationScriptChatMessages(params)

  logTaskProgress('NarrationScriptChat', 'stream-request', {
    episodeId: params.episodeId,
    model: textModel,
    thinking: textThinking,
    maxTokens,
    turnCount: turns.length,
  })

  hooks?.onStatus?.(`正在连接模型：${textModel}…`)

  const optimized = await tryExplainScriptBeatTwoPass({
    episodeId: params.episodeId,
    messages: params.messages,
    textModel,
    textThinking,
    script: params.script,
    lengthPolicy,
    stream: { onDelta, hooks },
    signal,
  })
  if (optimized) return optimized

  let reply = await streamTextChatMessages(
    apiMessages,
    onDelta,
    textModel,
    textThinking,
    900_000,
    0.65,
    signal,
    maxTokens,
    { onThinkingDelta: hooks?.onThinkingDelta },
    SCRIPT_CHAT_OLLAMA_NUM_CTX,
  )

  let finalReply = finalizeMotionComicScriptReply(reply.trim(), params.episodeId)
  const expanded = await ensureScriptMinLength({
    episodeId: params.episodeId,
    turns,
    apiMessages,
    textModel,
    textThinking,
    maxTokens,
    lengthPolicy,
    initialReply: finalReply,
    signal,
    stream: { onDelta, hooks },
  })
  finalReply = expanded.reply

  const ratioFix = await ensureMotionComicDialogueRatio({
    episodeId: params.episodeId,
    apiMessages,
    textModel,
    maxTokens,
    initialReply: finalReply,
    signal,
    stream: { onDelta, hooks },
  })
  finalReply = ratioFix.reply

  if (scriptCharCount(finalReply) < minChars) {
    logTaskWarn('NarrationScriptChat', 'script-below-min-chars', {
      chars: scriptCharCount(finalReply),
      min: minChars,
      target: lengthPolicy.targetChars,
      userSpecified: lengthPolicy.userSpecified,
      model: textModel,
      expandRounds: expanded.expandRounds,
    })
  }
  return buildScriptChatResultMeta(finalReply, textModel, textThinking, lengthPolicy, {
    auto_expanded: expanded.expandRounds > 0,
    expand_rounds: expanded.expandRounds,
    dialogue_ratio_repaired: ratioFix.repaired,
    narration_ratio: ratioFix.ratio.body ? Number(ratioFix.ratio.narrationRatio.toFixed(3)) : undefined,
    dialogue_ratio: ratioFix.ratio.body ? Number(ratioFix.ratio.dialogueRatio.toFixed(3)) : undefined,
  })
}

export async function chatNarrationScript(params: {
  episodeId: number
  messages: NarrationScriptChatTurn[]
  textModel?: string | null
  textThinking?: boolean
  script?: string
}) {
  const { textModel, textThinking, maxTokens, apiMessages, turns, minChars, lengthPolicy } = buildNarrationScriptChatMessages(params)

  logTaskProgress('NarrationScriptChat', 'request', {
    episodeId: params.episodeId,
    model: textModel,
    thinking: textThinking,
    maxTokens,
    turnCount: turns.length,
  })

  const optimized = await tryExplainScriptBeatTwoPass({
    episodeId: params.episodeId,
    messages: params.messages,
    textModel,
    textThinking,
    script: params.script,
    lengthPolicy,
  })
  if (optimized) return optimized

  const reply = (await callTextChatMessages(
    apiMessages,
    textModel,
    textThinking,
    900_000,
    0.65,
    maxTokens,
    SCRIPT_CHAT_OLLAMA_NUM_CTX,
  )).trim()
  if (!reply) throw new Error('AI 未返回内容')

  let finalReply = finalizeMotionComicScriptReply(reply, params.episodeId)
  const expanded = await ensureScriptMinLength({
    episodeId: params.episodeId,
    turns,
    apiMessages,
    textModel,
    textThinking,
    maxTokens,
    lengthPolicy,
    initialReply: finalReply,
  })
  finalReply = expanded.reply

  const ratioFix = await ensureMotionComicDialogueRatio({
    episodeId: params.episodeId,
    apiMessages,
    textModel,
    maxTokens,
    initialReply: finalReply,
  })
  finalReply = ratioFix.reply

  if (scriptCharCount(finalReply) < minChars) {
    logTaskWarn('NarrationScriptChat', 'script-below-min-chars', {
      chars: scriptCharCount(finalReply),
      min: minChars,
      target: lengthPolicy.targetChars,
      userSpecified: lengthPolicy.userSpecified,
      model: textModel,
      expandRounds: expanded.expandRounds,
    })
  }
  return buildScriptChatResultMeta(finalReply, textModel, textThinking, lengthPolicy, {
    auto_expanded: expanded.expandRounds > 0,
    expand_rounds: expanded.expandRounds,
    dialogue_ratio_repaired: ratioFix.repaired,
    narration_ratio: ratioFix.ratio.body ? Number(ratioFix.ratio.narrationRatio.toFixed(3)) : undefined,
    dialogue_ratio: ratioFix.ratio.body ? Number(ratioFix.ratio.dialogueRatio.toFixed(3)) : undefined,
  })
}
