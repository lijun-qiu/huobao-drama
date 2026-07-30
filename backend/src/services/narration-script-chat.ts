import { eq } from 'drizzle-orm'
import { parseProductionMode, isMotionComicMode, isLocalComicMode, isDialoguePortraitMode, isNovelComicMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import { LOCAL_COMIC_SCRIPT_CHAT_SYSTEM, LOCAL_COMIC_SCRIPT_MIN_CHARS } from '../constants/local-comic.js'
import { MOTION_COMIC_SCRIPT_CHAT_SYSTEM } from '../constants/motion-comic.js'
import {
  DIALOGUE_PORTRAIT_SCRIPT_CHAT_SYSTEM,
  DIALOGUE_PORTRAIT_SCRIPT_MIN_CHARS,
  DIALOGUE_PORTRAIT_SCRIPT_MAX_CHARS,
} from '../constants/dialogue-portrait.js'
import {
  NOVEL_COMIC_SCRIPT_CHAT_SYSTEM,
  NOVEL_COMIC_CHAPTER_SCRIPT_MIN_CHARS,
  NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS,
} from '../constants/novel-comic.js'
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
  '你是「体验365个人生」类短视频解说编剧，为火宝解说流水线写可直接 TTS 与配图的解说稿。',
  '',
  '【语感与真实】',
  '- 语言亲民：口语化、好懂，像跟朋友聊天，不用文绉绉、堆砌辞藻或生僻词。',
  '- 内容真实：细节可信、合乎常理，写具体处境与小人物日常；不悬浮、不伪励志、不夸大其词。',
  '- 代入感：带观众进入「你」当下的感受与选择，写看得见摸得着的动作、物件与场景，少用空泛形容。',
  '- 内心活动：穿插「你」的犹豫、触动、后悔、期待、不安等心理与感受，与动作、对话式旁白交织；情感有起伏，但不写成意识流散文。',
  '',
  '【篇幅】',
  '- **用户指定字数时以用户为准（最高优先级）**：如「写1000字」「约800字」，须按该目标输出，误差控制在约 ±15%，禁止擅自写成默认长稿。',
  '- 用户未指定时，完整稿不少于 3000 汉字、不超过 10000 汉字；不足须扩写，超出须精简，不得敷衍或注水。',
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
  '用户要求写完整稿时，只输出解说稿正文（第一行即片头 hook）；篇幅以用户指定为准，未指定时满足【篇幅】3000～10000 字。',
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
  if (isNovelComicMode(mode)) return NOVEL_COMIC_CHAPTER_SCRIPT_MIN_CHARS
  return NARRATION_SCRIPT_MIN_CHARS
}

function resolveScriptLengthPolicy(
  episodeId: number,
  messages: NarrationScriptChatTurn[],
): ScriptLengthPolicy {
  const userPolicy = findUserScriptLengthPolicy(messages)
  if (userPolicy) return userPolicy
  const mode = resolveEpisodeProductionMode(episodeId)
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

  return lines.length ? `【当前项目】\n${lines.join('\n')}` : ''
}

/** 剧本聊天上下文：带入「直接输入」/已保存文案，支持多轮改稿 */
export function buildScriptChatContextBlock(episodeId: number, scriptOverride?: string): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return ''

  const mode = resolveEpisodeProductionMode(episodeId)
  const motionComic = isMotionComicMode(mode)
  const dialoguePortrait = isDialoguePortraitMode(mode)
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

const SCRIPT_AUTO_EXPAND_MAX_ROUNDS = 2

function buildScriptChatResultMeta(
  reply: string,
  textModel: string,
  textThinking: boolean,
  policy: ScriptLengthPolicy,
  extra?: {
    auto_expanded?: boolean
    expand_rounds?: number
    dialogue_ratio_repaired?: boolean
    narration_ratio?: number
    dialogue_ratio?: number
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
    dialogue_ratio_repaired: extra?.dialogue_ratio_repaired ?? false,
    below_min: charCount > 0 && charCount < policy.minChars,
  }
}

/** 用户是否在要完整稿（含「写剧本」「写1000字」等） */
function userWantsFullScriptDraft(content: string): boolean {
  const u = String(content || '').trim()
  if (!u) return false
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

function shouldAutoExpandScript(turns: NarrationScriptChatTurn[], reply: string, policy: ScriptLengthPolicy): boolean {
  const chars = scriptCharCount(reply)
  if (chars >= policy.minChars) return false
  // 用户指定篇幅时：已达目标 70% 以上视为可用稿，不再自动二轮扩写（本地 thinking 极慢）
  if (policy.userSpecified && chars >= Math.round(policy.targetChars * 0.7)) return false
  if (!looksLikeScriptChatDraftReply(reply)) return false
  return userWantsFullScriptDraft(lastUserMessage(turns))
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
      `当前稿约 ${currentChars} 字，未达到用户要求的约 ${policy.targetChars} 字。`,
      `请在保持故事主线、人称与说话人格式不变的前提下扩写至约 ${policy.targetChars} 汉字`,
      `（允许范围 ${policy.minChars}～${policy.maxChars} 字），不要扩成默认长稿。`,
      '直接输出完整稿全文，不要只解释、不要只给 diff 或片段。',
    ].join('')
  }
  return [
    `当前稿约 ${currentChars} 字，不足 ${policy.minChars} 字硬性要求。`,
    `请在保持故事主线、人称与说话人格式不变的前提下扩写至至少 ${policy.minChars} 汉字，`,
    '补内心戏、环境细节与情节转折；直接输出扩写后的完整稿全文，不要只解释、不要只给 diff 或片段。',
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

  for (let round = 0; round < SCRIPT_AUTO_EXPAND_MAX_ROUNDS; round++) {
    const chars = scriptCharCount(reply)
    if (chars >= policy.minChars) break
    if (policy.userSpecified && chars >= Math.round(policy.targetChars * 0.7)) break

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

    if (params.stream) {
      reply = await streamTextChatMessages(
        expandMessages,
        params.stream.onDelta,
        params.textModel,
        expandThinking,
        900_000,
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
        900_000,
        0.65,
        expandMaxTokens,
        SCRIPT_CHAT_OLLAMA_NUM_CTX,
      )).trim()
    }
    reply = finalizeMotionComicScriptReply(reply, params.episodeId)
  }

  return { reply, expandRounds }
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
