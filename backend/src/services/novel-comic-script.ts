/**
 * 小说漫画讲解 — 讲解稿：小说/旧稿 → 白话讲解稿（可选润色；不硬凑字数）
 */
import {
  NOVEL_COMIC_CHAPTER_SCRIPT_SYSTEM,
  NOVEL_COMIC_SCRIPT_EXPAND_SYSTEM,
  compressNovelComicPreviousScript,
  formatNovelComicPreviousEpisodeBlock,
  measureNovelComicScriptLineStats,
  normalizeNovelComicScriptLines,
  resolveNovelComicChapterScriptTargetChars,
  type NovelComicChapterOutline,
} from '../constants/novel-comic.js'
import { callTextChatMessages, streamTextChatMessages, type TextChatMessage } from './text-chat.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'

const DRAFT_TEMP = 0.55
const POLISH_TEMP = 0.4
const PASS_TIMEOUT_MS = 420_000
/** 仅防止空稿；不作为篇幅目标 */
const ABSURD_MIN_CHARS = 80

export type NovelComicScriptProgress = {
  onStatus?: (message: string) => void
  onDelta?: (delta: string, full: string) => void
  signal?: AbortSignal
}

function scriptChars(text: string): number {
  return String(text || '').replace(/\s/g, '').length
}

function resolveHints(chapter: Pick<NovelComicChapterOutline, 'panel_beats' | 'key_beats'>): string[] {
  if (chapter.panel_beats?.length) return chapter.panel_beats.map(b => String(b || '').trim()).filter(Boolean)
  if (chapter.key_beats?.length) return chapter.key_beats.map(b => String(b || '').trim()).filter(Boolean)
  return []
}

function buildNovelToNarrationUser(params: {
  chapter: NovelComicChapterOutline
  targetChars?: number | null
  sourceNovel?: string
  currentScript?: string
  previousEpisodeSummary?: string | null
  previousEpisodeNumber?: number | null
}): string {
  const hints = resolveHints(params.chapter)
  const parts = [
    `请把下面材料改成第 ${params.chapter.number} 章「白话讲解稿」（现代短视频旁白口吻，不要旧式说书腔）。`,
    `章标题：${params.chapter.title}`,
    params.chapter.summary ? `章摘要：${params.chapter.summary}` : '',
    '',
    '要求：精简概括、狠砍感官堆砌；节奏快慢有序（铺垫略慢、高燃短句连击、余波半拍收束）；指代人物一律重复写角色名，禁止任何「他」「她」；可加减承上启下、突出高燃；现代白话；禁止「且说/话说/却说」等套话；不要照抄小说长段；不按原文百分比卡字数。',
  ]
  if (params.targetChars && params.targetChars > 0) {
    parts.push(`（大纲建议约 ${params.targetChars} 字，仅供参考，以故事写全为准。）`)
  }
  const prevBlock = formatNovelComicPreviousEpisodeBlock(
    compressNovelComicPreviousScript(params.previousEpisodeSummary),
    Number(params.previousEpisodeNumber) || Math.max(1, Number(params.chapter.number || 1) - 1),
  )
  if (prevBlock) {
    parts.push('', prevBlock)
  }
  if (hints.length) {
    parts.push(
      '',
      '【情节点/场面提示·尽量覆盖，勿机械按条数句】',
      ...hints.map((b, i) => `${i + 1}. ${b}`),
    )
  }
  const script = String(params.currentScript || '').trim()
  const novel = String(params.sourceNovel || '').trim()
  if (novel) {
    parts.push('', '【小说原文】', novel.slice(0, 50_000))
  }
  if (script) {
    parts.push(
      '',
      novel
        ? '【当前台本·可参考，请改成讲解稿，勿保留小说腔长段】'
        : '【当前台本·请改成讲解稿】',
      script.slice(0, 12_000),
    )
  }
  if (!novel && !script) {
    parts.push('', '（缺少原文与台本时，仅按摘要与情节点写讲解稿。）')
  }
  return parts.filter(Boolean).join('\n')
}

async function llmText(params: {
  messages: TextChatMessage[]
  model: string
  thinkingEnabled?: boolean
  temperature: number
  maxTokens?: number
  stream?: NovelComicScriptProgress
}): Promise<string> {
  if (params.stream?.onDelta) {
    return streamTextChatMessages(
      params.messages,
      params.stream.onDelta,
      params.model,
      params.thinkingEnabled === true,
      PASS_TIMEOUT_MS,
      params.temperature,
      params.stream.signal,
      params.maxTokens ?? 12_288,
    )
  }
  return callTextChatMessages(
    params.messages,
    params.model,
    params.thinkingEnabled === true,
    PASS_TIMEOUT_MS,
    params.temperature,
    params.maxTokens ?? 12_288,
  )
}

async function runNovelToNarrationDraft(params: {
  chapter: NovelComicChapterOutline
  targetChars?: number | null
  sourceNovel?: string
  currentScript?: string
  previousEpisodeSummary?: string | null
  previousEpisodeNumber?: number | null
  model: string
  thinkingEnabled?: boolean
  stream?: NovelComicScriptProgress
}): Promise<string> {
  const user = buildNovelToNarrationUser(params)

  let best = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (params.stream?.onDelta && attempt > 1) params.stream.onDelta('', '')
    const reply = await llmText({
      messages: [
        { role: 'system', content: NOVEL_COMIC_CHAPTER_SCRIPT_SYSTEM },
        {
          role: 'user',
          content: attempt === 1
            ? user
            : `${user}\n\n上一稿过短或为空。请按故事写全本章关键场面，重新输出完整讲解稿（仍不硬凑字数）。`,
        },
      ],
      model: params.model,
      thinkingEnabled: params.thinkingEnabled,
      temperature: DRAFT_TEMP,
      stream: params.stream,
    })
    const text = normalizeNovelComicScriptLines(reply)
    const chars = scriptChars(text)
    if (chars > scriptChars(best)) best = text
    if (chars >= ABSURD_MIN_CHARS) {
      logTaskProgress('NovelComicScript', 'novel-to-narration-ok', {
        chapter: params.chapter.number,
        chars,
        target: params.targetChars ?? null,
        attempt,
      })
      return text
    }
    logTaskWarn('NovelComicScript', 'novel-to-narration-retry', {
      chapter: params.chapter.number,
      attempt,
      chars,
    })
  }

  if (scriptChars(best) >= ABSURD_MIN_CHARS) return best
  throw new Error(`第${params.chapter.number}章讲解稿生成失败，请重试`)
}

/** 仅当大纲明确给了 approx_chars 且明显偏短时才补 */
async function expandIfNeeded(params: {
  draft: string
  targetChars?: number | null
  sourceNovel?: string
  currentScript?: string
  hints: string[]
  model: string
  stream?: NovelComicScriptProgress
}): Promise<string> {
  const target = params.targetChars
  if (!target || target <= 0) return params.draft

  const chars = scriptChars(params.draft)
  const need = Math.round(target * 0.55)
  if (chars >= need) return params.draft

  params.stream?.onStatus?.(`相对大纲建议偏短，正在按故事补场面…`)
  if (params.stream?.onDelta) params.stream.onDelta('', '')

  const material = String(params.sourceNovel || params.currentScript || '').trim().slice(0, 10_000)
  const reply = await llmText({
    messages: [
      { role: 'system', content: NOVEL_COMIC_SCRIPT_EXPAND_SYSTEM },
      {
        role: 'user',
        content: [
          `当前约 ${chars} 字；大纲建议约 ${target} 字（参考，勿注水）。请按故事补关键场面短句。`,
          params.hints.length
            ? ['【场面提示】', ...params.hints.map((b, i) => `${i + 1}. ${b}`)].join('\n')
            : '',
          material ? `【可取材】\n${material}` : '',
          '',
          '【当前稿】',
          params.draft,
        ].filter(Boolean).join('\n'),
      },
    ],
    model: params.model,
    thinkingEnabled: false,
    temperature: POLISH_TEMP,
    stream: params.stream,
  })

  const expanded = normalizeNovelComicScriptLines(reply)
  if (scriptChars(expanded) >= chars) {
    logTaskProgress('NovelComicScript', 'expand-ok', {
      before: chars,
      after: scriptChars(expanded),
      target,
    })
    return expanded
  }
  return params.draft
}

async function runNovelToNarrationPipeline(params: {
  chapter: NovelComicChapterOutline
  targetChars?: number | null
  sourceNovel?: string
  currentScript?: string
  previousEpisodeSummary?: string | null
  previousEpisodeNumber?: number | null
  model: string
  thinkingEnabled?: boolean
  stream?: NovelComicScriptProgress
  onStatus?: (message: string) => void
}): Promise<string> {
  const status = params.stream?.onStatus || params.onStatus
  const hints = resolveHints(params.chapter)

  status?.('正在把小说改成白话讲解稿…')
  let text = await runNovelToNarrationDraft(params)

  text = await expandIfNeeded({
    draft: text,
    targetChars: params.targetChars,
    sourceNovel: params.sourceNovel,
    currentScript: params.currentScript,
    hints,
    model: params.model,
    stream: params.stream,
  })

  return text
}

/** 确认建集 / 重建章 */
export async function generateNovelComicChapterScriptTwoPass(params: {
  sourceNovel: string
  chapter: NovelComicChapterOutline
  model: string
  thinkingEnabled?: boolean
  previousEpisodeSummary?: string | null
  previousEpisodeNumber?: number | null
  onStatus?: (message: string) => void
}): Promise<string> {
  const targetChars = resolveNovelComicChapterScriptTargetChars(params.chapter)
  const finalText = await runNovelToNarrationPipeline({
    chapter: params.chapter,
    targetChars,
    sourceNovel: params.sourceNovel,
    previousEpisodeSummary: params.previousEpisodeSummary,
    previousEpisodeNumber: params.previousEpisodeNumber,
    model: params.model,
    thinkingEnabled: params.thinkingEnabled,
    onStatus: params.onStatus,
  })

  if (scriptChars(finalText) < ABSURD_MIN_CHARS) {
    throw new Error(`第${params.chapter.number}章讲解稿过短，请重试`)
  }

  const stats = measureNovelComicScriptLineStats(finalText)
  logTaskProgress('NovelComicScript', 'chapter-narration-done', {
    chapter: params.chapter.number,
    ...stats,
    target: targetChars,
  })
  return finalText
}

/** 工作室「改成讲解稿」：不强制字数 */
export async function optimizeNovelComicNarrationTwoPass(params: {
  chapter: NovelComicChapterOutline
  currentScript?: string
  sourceNovel?: string
  previousEpisodeSummary?: string | null
  previousEpisodeNumber?: number | null
  model: string
  thinkingEnabled?: boolean
  stream?: NovelComicScriptProgress
}): Promise<string> {
  const hasMaterial = String(params.currentScript || '').trim() || String(params.sourceNovel || '').trim()
  if (!hasMaterial && !resolveHints(params.chapter).length) {
    throw new Error('请先填写本章台本、小说原文，或完成章节大纲')
  }

  // 优化路径：不强制字数（连大纲 approx 也不拿来硬凑）
  if (params.stream?.onDelta) params.stream.onDelta('', '')
  const finalText = await runNovelToNarrationPipeline({
    chapter: params.chapter,
    targetChars: null,
    sourceNovel: params.sourceNovel,
    currentScript: params.currentScript,
    previousEpisodeSummary: params.previousEpisodeSummary,
    previousEpisodeNumber: params.previousEpisodeNumber,
    model: params.model,
    thinkingEnabled: params.thinkingEnabled,
    stream: params.stream,
  })

  if (scriptChars(finalText) < ABSURD_MIN_CHARS) {
    throw new Error('优化结果过短，请重试或先补全台本')
  }
  const stats = measureNovelComicScriptLineStats(finalText)
  logTaskProgress('NovelComicScript', 'optimize-narration-done', stats)
  return finalText
}
