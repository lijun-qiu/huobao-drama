/**
 * 小说漫画讲解 — 原文保存 / 章节大纲 / 一章一集落地
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { callTextChatMessages } from './text-chat.js'
import {
  DEFAULT_LOCAL_TEXT_MODEL,
  DEFAULT_NARRATION_TEXT_MODEL,
} from '../constants/text-models.js'
import {
  NOVEL_COMIC_CHAPTER_SCRIPT_SYSTEM,
  NOVEL_COMIC_OUTLINE_DEFAULT_CHAPTERS,
  NOVEL_COMIC_OUTLINE_MAX_CHAPTERS,
  NOVEL_COMIC_OUTLINE_MIN_CHAPTERS,
  NOVEL_COMIC_OUTLINE_SYSTEM,
  mergeNovelComicMeta,
  parseNovelComicMeta,
  parseOutlineChaptersFromLlm,
  type NovelComicChapterOutline,
} from '../constants/novel-comic.js'
import { isNovelComicMode, parseProductionMode } from '../constants/production-mode.js'

const SOURCE_NOVEL_MAX_CHARS = 120_000
const OUTLINE_SOURCE_SNIPPET = 80_000
const CHAPTER_SOURCE_SNIPPET = 60_000

function requireNovelComicDrama(dramaId: number) {
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
  if (!drama || drama.deletedAt) throw new Error('剧本不存在')
  if (!isNovelComicMode(parseProductionMode(drama.metadata))) {
    throw new Error('当前项目不是「小说漫画讲解」模式')
  }
  return drama
}

function listActiveEpisodes(dramaId: number) {
  return db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .all()
    .filter(ep => !ep.deletedAt)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
}

function episodeHasProductionAssets(episodeId: number): boolean {
  const sbs = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter(sb => !sb.deletedAt)
  if (!sbs.length) return false
  return sbs.some(sb =>
    !!(sb.ttsAudioUrl || sb.composedImage || sb.firstFrameImage || sb.composedVideoUrl || sb.videoUrl),
  ) || sbs.length > 0
}

/** 有分镜即视为已开工（避免误删） */
function episodeIsEmpty(episodeId: number): boolean {
  const sbs = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter(sb => !sb.deletedAt)
  return sbs.length === 0
}

function resolveTextModel(override?: string | null): string {
  const m = String(override || '').trim()
  return m || DEFAULT_LOCAL_TEXT_MODEL || DEFAULT_NARRATION_TEXT_MODEL
}

function chapterEpisodeTitle(ch: NovelComicChapterOutline): string {
  const title = String(ch.title || '').trim() || `第${ch.number}章`
  if (/^第\s*\d+\s*章/.test(title)) return title
  return `第${ch.number}章 ${title}`
}

export function getNovelComicState(dramaId: number) {
  const drama = requireNovelComicDrama(dramaId)
  const meta = parseNovelComicMeta(drama.metadata)
  const episodes = listActiveEpisodes(dramaId).map(ep => ({
    id: ep.id,
    episode_number: ep.episodeNumber,
    title: ep.title,
    has_content: !!String(ep.content || ep.scriptContent || '').trim(),
    empty: episodeIsEmpty(ep.id),
  }))
  return {
    source_novel: meta.source_novel || '',
    chapter_outline: meta.chapter_outline || [],
    outline_confirmed_at: meta.outline_confirmed_at || null,
    episodes,
  }
}

export function saveNovelComicSource(dramaId: number, sourceNovel: string) {
  const drama = requireNovelComicDrama(dramaId)
  const text = String(sourceNovel || '').trim()
  if (!text) throw new Error('请粘贴小说原文')
  if (text.length > SOURCE_NOVEL_MAX_CHARS) {
    throw new Error(`小说原文过长（>${SOURCE_NOVEL_MAX_CHARS} 字），请先截取后再贴`)
  }
  const metadata = mergeNovelComicMeta(drama.metadata, {
    source_novel: text,
    // 改原文后需重新确认大纲
    outline_confirmed_at: null,
  })
  db.update(schema.dramas).set({ metadata, updatedAt: now() }).where(eq(schema.dramas.id, dramaId)).run()
  return parseNovelComicMeta(metadata)
}

export function saveNovelComicOutline(dramaId: number, chapters: NovelComicChapterOutline[]) {
  const drama = requireNovelComicDrama(dramaId)
  const list = (chapters || [])
    .map((c, i) => ({
      number: Number(c.number) || i + 1,
      title: String(c.title || '').trim() || `第${i + 1}章`,
      summary: String(c.summary || '').trim() || String(c.title || '').trim(),
      key_beats: Array.isArray(c.key_beats)
        ? c.key_beats.map(b => String(b || '').trim()).filter(Boolean).slice(0, 8)
        : undefined,
      approx_chars: typeof c.approx_chars === 'number' ? c.approx_chars : undefined,
    }))
    .filter(c => c.title || c.summary)
  if (!list.length) throw new Error('大纲不能为空')
  const renumbered = list.map((c, i) => ({ ...c, number: i + 1 }))
  const metadata = mergeNovelComicMeta(drama.metadata, {
    chapter_outline: renumbered,
    outline_confirmed_at: null,
  })
  db.update(schema.dramas).set({ metadata, updatedAt: now() }).where(eq(schema.dramas.id, dramaId)).run()
  return parseNovelComicMeta(metadata)
}

export async function generateNovelComicOutline(params: {
  dramaId: number
  targetChapters?: number | null
  model?: string | null
  thinkingEnabled?: boolean
}) {
  const drama = requireNovelComicDrama(params.dramaId)
  const meta = parseNovelComicMeta(drama.metadata)
  const source = String(meta.source_novel || '').trim()
  if (!source) throw new Error('请先保存小说原文')

  let target = params.targetChapters != null && Number.isFinite(Number(params.targetChapters))
    ? Math.floor(Number(params.targetChapters))
    : NOVEL_COMIC_OUTLINE_DEFAULT_CHAPTERS
  target = Math.max(NOVEL_COMIC_OUTLINE_MIN_CHAPTERS, Math.min(NOVEL_COMIC_OUTLINE_MAX_CHAPTERS, target))

  const snippet = source.length > OUTLINE_SOURCE_SNIPPET
    ? `${source.slice(0, OUTLINE_SOURCE_SNIPPET)}\n\n…（原文已截断，请按已给部分合理分章）`
    : source

  const user = [
    `请将下列小说划分为 ${target} 章大纲（JSON）。`,
    '',
    '【小说原文】',
    snippet,
  ].join('\n')

  const reply = await callTextChatMessages(
    [
      { role: 'system', content: NOVEL_COMIC_OUTLINE_SYSTEM },
      { role: 'user', content: user },
    ],
    resolveTextModel(params.model),
    params.thinkingEnabled !== false,
    300_000,
    0.4,
    8_192,
  )

  let chapters = parseOutlineChaptersFromLlm(reply)
  if (!chapters.length) {
    throw new Error('大纲生成失败：未能解析章节 JSON，请重试或换模型')
  }
  // 若数量偏差过大，仍接受但重编号
  chapters = chapters.slice(0, NOVEL_COMIC_OUTLINE_MAX_CHAPTERS).map((c, i) => ({
    ...c,
    number: i + 1,
  }))

  const metadata = mergeNovelComicMeta(drama.metadata, {
    chapter_outline: chapters,
    outline_confirmed_at: null,
  })
  db.update(schema.dramas).set({ metadata, updatedAt: now() }).where(eq(schema.dramas.id, params.dramaId)).run()
  return {
    chapter_outline: chapters,
    raw_preview: String(reply || '').slice(0, 500),
  }
}

async function generateChapterScript(params: {
  sourceNovel: string
  chapter: NovelComicChapterOutline
  model?: string | null
  thinkingEnabled?: boolean
}): Promise<string> {
  const source = params.sourceNovel.length > CHAPTER_SOURCE_SNIPPET
    ? params.sourceNovel.slice(0, CHAPTER_SOURCE_SNIPPET)
    : params.sourceNovel
  const beats = (params.chapter.key_beats || []).join('；')
  const user = [
    `请写出第 ${params.chapter.number} 章朗读正文。`,
    `章标题：${params.chapter.title}`,
    `章摘要：${params.chapter.summary}`,
    beats ? `关键情节点：${beats}` : '',
    params.chapter.approx_chars ? `目标约 ${params.chapter.approx_chars} 字` : '',
    '',
    '【小说原文】',
    source,
  ].filter(Boolean).join('\n')

  const reply = await callTextChatMessages(
    [
      { role: 'system', content: NOVEL_COMIC_CHAPTER_SCRIPT_SYSTEM },
      { role: 'user', content: user },
    ],
    resolveTextModel(params.model),
    params.thinkingEnabled !== false,
    300_000,
    0.55,
    12_288,
  )
  const text = String(reply || '').trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  if (text.length < 80) {
    throw new Error(`第${params.chapter.number}章朗读稿过短，请重试`)
  }
  return text
}

export async function applyNovelComicOutline(params: {
  dramaId: number
  model?: string | null
  thinkingEnabled?: boolean
  /** 仅重建指定章（1-based）；默认全部 */
  chapterNumbers?: number[] | null
}) {
  const drama = requireNovelComicDrama(params.dramaId)
  const meta = parseNovelComicMeta(drama.metadata)
  const source = String(meta.source_novel || '').trim()
  if (!source) throw new Error('请先保存小说原文')
  const chapters = meta.chapter_outline || []
  if (!chapters.length) throw new Error('请先生成或保存章节大纲')

  const existing = listActiveEpisodes(params.dramaId)
  const allEmpty = existing.length === 0 || existing.every(ep => episodeIsEmpty(ep.id))
  const ts = now()
  const model = resolveTextModel(params.model)
  const onlyNums = params.chapterNumbers?.length
    ? new Set(params.chapterNumbers.map(n => Math.floor(Number(n))).filter(n => n > 0))
    : null

  const results: Array<{
    chapter: number
    episode_id: number
    title: string
    chars: number
    action: 'created' | 'updated' | 'skipped'
  }> = []

  if (allEmpty) {
    // 重建：按章更新/创建，多余集软删
    for (let i = 0; i < chapters.length; i++) {
      const ch = { ...chapters[i], number: i + 1 }
      if (onlyNums && !onlyNums.has(ch.number)) {
        const ep = existing[i]
        if (ep) {
          results.push({
            chapter: ch.number,
            episode_id: ep.id,
            title: ep.title,
            chars: String(ep.content || '').length,
            action: 'skipped',
          })
        }
        continue
      }
      const script = await generateChapterScript({
        sourceNovel: source,
        chapter: ch,
        model,
        thinkingEnabled: params.thinkingEnabled,
      })
      const title = chapterEpisodeTitle(ch)
      const ep = existing[i]
      if (ep) {
        db.update(schema.episodes).set({
          episodeNumber: ch.number,
          title,
          description: ch.summary,
          content: script,
          scriptContent: script,
          updatedAt: ts,
        }).where(eq(schema.episodes.id, ep.id)).run()
        results.push({
          chapter: ch.number,
          episode_id: ep.id,
          title,
          chars: script.length,
          action: 'updated',
        })
      } else {
        const res = db.insert(schema.episodes).values({
          dramaId: params.dramaId,
          episodeNumber: ch.number,
          title,
          description: ch.summary,
          content: script,
          scriptContent: script,
          status: 'draft',
          imageConfigId: existing[0]?.imageConfigId ?? null,
          imageModel: existing[0]?.imageModel ?? null,
          textModel: existing[0]?.textModel ?? model,
          textThinking: existing[0]?.textThinking ?? true,
          videoConfigId: existing[0]?.videoConfigId ?? null,
          audioConfigId: existing[0]?.audioConfigId ?? null,
          createdAt: ts,
          updatedAt: ts,
        }).run()
        results.push({
          chapter: ch.number,
          episode_id: Number(res.lastInsertRowid),
          title,
          chars: script.length,
          action: 'created',
        })
      }
    }
    // 软删多余空集
    for (let i = chapters.length; i < existing.length; i++) {
      if (episodeIsEmpty(existing[i].id)) {
        db.update(schema.episodes).set({ deletedAt: ts, updatedAt: ts })
          .where(eq(schema.episodes.id, existing[i].id)).run()
      }
    }
  } else {
    // 已有制作资产：不删旧集；为缺失章追加；空内容旧集可补稿
    for (let i = 0; i < chapters.length; i++) {
      const ch = { ...chapters[i], number: i + 1 }
      if (onlyNums && !onlyNums.has(ch.number)) continue
      const ep = existing[i]
      if (ep && !episodeIsEmpty(ep.id) && String(ep.content || ep.scriptContent || '').trim()) {
        results.push({
          chapter: ch.number,
          episode_id: ep.id,
          title: ep.title,
          chars: String(ep.content || ep.scriptContent || '').length,
          action: 'skipped',
        })
        continue
      }
      const script = await generateChapterScript({
        sourceNovel: source,
        chapter: ch,
        model,
        thinkingEnabled: params.thinkingEnabled,
      })
      const title = chapterEpisodeTitle(ch)
      if (ep) {
        db.update(schema.episodes).set({
          title: String(ep.title || '').trim() || title,
          description: ch.summary,
          content: script,
          scriptContent: script,
          updatedAt: ts,
        }).where(eq(schema.episodes.id, ep.id)).run()
        results.push({
          chapter: ch.number,
          episode_id: ep.id,
          title: title,
          chars: script.length,
          action: 'updated',
        })
      } else {
        const last = existing[existing.length - 1]
        const res = db.insert(schema.episodes).values({
          dramaId: params.dramaId,
          episodeNumber: Math.max(
            ch.number,
            (existing[existing.length - 1]?.episodeNumber || 0) + 1,
          ),
          title,
          description: ch.summary,
          content: script,
          scriptContent: script,
          status: 'draft',
          imageConfigId: last?.imageConfigId ?? null,
          imageModel: last?.imageModel ?? null,
          textModel: last?.textModel ?? model,
          textThinking: last?.textThinking ?? true,
          videoConfigId: last?.videoConfigId ?? null,
          audioConfigId: last?.audioConfigId ?? null,
          createdAt: ts,
          updatedAt: ts,
        }).run()
        results.push({
          chapter: ch.number,
          episode_id: Number(res.lastInsertRowid),
          title,
          chars: script.length,
          action: 'created',
        })
      }
    }
  }

  const metadata = mergeNovelComicMeta(drama.metadata, {
    outline_confirmed_at: ts,
  })
  db.update(schema.dramas).set({ metadata, updatedAt: ts }).where(eq(schema.dramas.id, params.dramaId)).run()

  return {
    outline_confirmed_at: ts,
    results,
    rebuilt: allEmpty,
    had_assets: !allEmpty && existing.some(ep => episodeHasProductionAssets(ep.id)),
  }
}
