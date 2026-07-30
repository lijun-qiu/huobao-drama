/**
 * 小说漫画讲解模式 — 贴小说 → 章节大纲 → 一章一集 → 旁白朗读 + 漫画配图
 */
import type { ProductionMode } from './production-mode.js'
import { isNovelComicMode, PRODUCTION_MODE_NOVEL_COMIC } from './production-mode.js'

export const NOVEL_COMIC_PRODUCTION_MODE = PRODUCTION_MODE_NOVEL_COMIC

export interface NovelComicChapterOutline {
  number: number
  title: string
  summary: string
  key_beats?: string[]
  approx_chars?: number
}

export interface NovelComicDramaMeta {
  source_novel?: string
  chapter_outline?: NovelComicChapterOutline[]
  outline_confirmed_at?: string | null
}

export const DEFAULT_NOVEL_COMIC_DRAMA_META: Required<Pick<NovelComicDramaMeta, 'source_novel' | 'chapter_outline'>> & {
  outline_confirmed_at: string | null
} = {
  source_novel: '',
  chapter_outline: [],
  outline_confirmed_at: null,
}

/** 默认章数范围（用户未指定目标章数时） */
export const NOVEL_COMIC_OUTLINE_MIN_CHAPTERS = 2
export const NOVEL_COMIC_OUTLINE_MAX_CHAPTERS = 12
export const NOVEL_COMIC_OUTLINE_DEFAULT_CHAPTERS = 4

/** 单章朗读稿建议字数 */
export const NOVEL_COMIC_CHAPTER_SCRIPT_MIN_CHARS = 400
export const NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS = 4_000

export const NOVEL_COMIC_OUTLINE_SYSTEM = [
  '你是「小说漫画讲解」流水线的分章导演：根据用户粘贴的小说原文，划分适合短视频漫画讲解的章节大纲。',
  '成片形态：每章对应一集；旁白朗读该章小说内容；画面为国漫风格漫画配图 + 轻运镜（不是对话立绘、不是多角色对白快切）。',
  '',
  '【输出·硬性】',
  '- 只输出一个 JSON 对象，不要 markdown 代码围栏，不要解释。',
  '- 格式：',
  '{"chapters":[{"number":1,"title":"短标题","summary":"本章剧情摘要（80～200字）","key_beats":["情节点1","情节点2"],"approx_chars":1800}]}',
  `- chapters 数量：用户指定目标章数时严格按该数；未指定时在 ${NOVEL_COMIC_OUTLINE_MIN_CHAPTERS}～${NOVEL_COMIC_OUTLINE_MAX_CHAPTERS} 章之间，默认约 ${NOVEL_COMIC_OUTLINE_DEFAULT_CHAPTERS} 章。`,
  '- number 从 1 连续递增；title 简洁（≤16字）；summary 覆盖本章起止与冲突；key_beats 2～5 条可见场面。',
  '- approx_chars 为该章朗读稿预估汉字数（建议每章 800～2500）。',
  '',
  '【分章原则】',
  '- 按情节弧线切章（开端/升级/转折/高潮/收束），不要按固定字数机械切。',
  '- 每章应有可画的关键场面，便于漫画配图。',
  '- 保留原文故事走向，不要另起新剧情；不要写「下期继续」「记得关注」。',
].join('\n')

export const NOVEL_COMIC_CHAPTER_SCRIPT_SYSTEM = [
  '你是「小说漫画讲解」流水线编剧：根据【小说原文】与【本章大纲】，写出本章可旁白朗读的正文。',
  '成片：旁白念稿 + 国漫漫画配图；不是角色对白快切，不要写成「角色名：台词」台本。',
  '',
  '【输出·硬性】',
  '- 只输出本章朗读正文（纯叙述/讲解），不要 JSON、不要 markdown、不要章标题行。',
  '- 主体必须来自原文该章内容：可压缩、理顺、口语化，但禁止另起无关剧情。',
  '- 可用极短讲解句衔接（如「此时…」「谁知…」），讲解占比建议 ≤15%。',
  '- 一句一行或短段均可；单句建议不超过 40 字，便于拆镜配音。',
  `- 篇幅约 ${NOVEL_COMIC_CHAPTER_SCRIPT_MIN_CHARS}～${NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS} 汉字，优先覆盖大纲 key_beats。`,
  '- 禁止片尾引流（关注、下期、点赞等）。',
].join('\n')

export const NOVEL_COMIC_SCRIPT_CHAT_SYSTEM = [
  '你是「小说漫画讲解」单集改稿助手：本章旁白朗读稿对应一集漫画讲解视频。',
  '成片效果：旁白念小说/讲解 → 国漫配图换镜 → 轻运镜合成。不是对话立绘，也不是多角色对白快切。',
  '',
  '【输出形态】',
  '- 完整改稿时只输出朗读正文（叙述为主，可少量讲解衔接）。',
  '- 禁止「角色名：台词」对白台本格式；角色说话可写成叙述引语。',
  '- 一句不宜过长；便于旁白分镜与配音。',
  '- 禁止「体验365个人生」第二人称片头体；禁止片尾引流。',
  '',
  '【交互】',
  '- 用户要求改完整稿：可先 ≤20 字确认，空一行后输出修改后的完整本章稿。',
  '- 若【当前台本】已有内容，在其基础上改，勿另起新故事。',
  '- 仅闲聊选题时正常对话，不必输出整稿。',
  '',
  '【篇幅】',
  `- 用户指定字数时以用户为准；未指定时约 ${NOVEL_COMIC_CHAPTER_SCRIPT_MIN_CHARS}～${NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS} 汉字。`,
].join('\n')

function parseMetaObject(metadata?: string | Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof metadata === 'object' ? metadata as Record<string, unknown> : null
}

function normalizeChapter(raw: unknown, index: number): NovelComicChapterOutline | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = String(o.title || '').trim()
  const summary = String(o.summary || '').trim()
  if (!title && !summary) return null
  const numberRaw = o.number
  const number = typeof numberRaw === 'number' && Number.isFinite(numberRaw)
    ? Math.max(1, Math.floor(numberRaw))
    : (typeof numberRaw === 'string' && /^\d+$/.test(numberRaw) ? Number(numberRaw) : index + 1)
  const beatsRaw = o.key_beats ?? o.keyBeats
  const key_beats = Array.isArray(beatsRaw)
    ? beatsRaw.map(b => String(b || '').trim()).filter(Boolean).slice(0, 8)
    : undefined
  const approxRaw = o.approx_chars ?? o.approxChars
  const approx_chars = typeof approxRaw === 'number' && Number.isFinite(approxRaw)
    ? Math.max(100, Math.floor(approxRaw))
    : (typeof approxRaw === 'string' && /^\d+$/.test(approxRaw) ? Number(approxRaw) : undefined)
  return {
    number,
    title: title || `第${number}章`,
    summary: summary || title,
    ...(key_beats?.length ? { key_beats } : {}),
    ...(approx_chars != null ? { approx_chars } : {}),
  }
}

export function parseNovelComicMeta(
  metadata?: string | Record<string, unknown> | null,
): NovelComicDramaMeta {
  const root = parseMetaObject(metadata)
  const raw = (root?.novel_comic && typeof root.novel_comic === 'object')
    ? root.novel_comic as Record<string, unknown>
    : null
  if (!raw) {
    return {
      source_novel: '',
      chapter_outline: [],
      outline_confirmed_at: null,
    }
  }
  const chaptersRaw = raw.chapter_outline ?? raw.chapterOutline
  const chapter_outline = Array.isArray(chaptersRaw)
    ? chaptersRaw.map((c, i) => normalizeChapter(c, i)).filter(Boolean) as NovelComicChapterOutline[]
    : []
  const confirmed = raw.outline_confirmed_at ?? raw.outlineConfirmedAt
  return {
    source_novel: String(raw.source_novel ?? raw.sourceNovel ?? '').trim(),
    chapter_outline,
    outline_confirmed_at: confirmed == null || confirmed === ''
      ? null
      : String(confirmed),
  }
}

export function buildNovelComicDramaMetadata(_mode?: ProductionMode): string {
  return JSON.stringify({
    production_mode: NOVEL_COMIC_PRODUCTION_MODE,
    novel_comic: { ...DEFAULT_NOVEL_COMIC_DRAMA_META },
  })
}

/** 合并写入 dramas.metadata.novel_comic，保留其它键 */
export function mergeNovelComicMeta(
  metadata: string | Record<string, unknown> | null | undefined,
  patch: Partial<NovelComicDramaMeta>,
): string {
  const root = parseMetaObject(metadata) || {}
  const prev = parseNovelComicMeta(root)
  const next: NovelComicDramaMeta = {
    source_novel: patch.source_novel !== undefined
      ? String(patch.source_novel || '')
      : prev.source_novel,
    chapter_outline: patch.chapter_outline !== undefined
      ? (Array.isArray(patch.chapter_outline)
        ? patch.chapter_outline.map((c, i) => normalizeChapter(c, i)).filter(Boolean) as NovelComicChapterOutline[]
        : [])
      : prev.chapter_outline,
    outline_confirmed_at: patch.outline_confirmed_at !== undefined
      ? (patch.outline_confirmed_at || null)
      : prev.outline_confirmed_at,
  }
  return JSON.stringify({
    ...root,
    production_mode: isNovelComicMode(String(root.production_mode || '')) || !root.production_mode
      ? NOVEL_COMIC_PRODUCTION_MODE
      : root.production_mode,
    novel_comic: next,
  })
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1].trim() : raw
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch { /* fall through */ }
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1))
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* ignore */ }
  }
  return null
}

export function parseOutlineChaptersFromLlm(text: string): NovelComicChapterOutline[] {
  const obj = extractJsonObject(text)
  if (!obj) return []
  const list = obj.chapters ?? obj.chapter_outline ?? obj.chapterOutline
  if (!Array.isArray(list)) return []
  return list.map((c, i) => normalizeChapter(c, i)).filter(Boolean) as NovelComicChapterOutline[]
}
