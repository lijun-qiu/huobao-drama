import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { breakdownNarrationStoryboards, estimateNarrationDuration } from './narration-breakdown.js'
import {
  buildNarrationImageMeta,
  parseNarrationImageMeta,
  sortStoryboardsByOrder,
} from './narration-image.js'
import { isMotionComicMode, usesMotionComicStoryboardRules, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import {
  getEpisodeVisualCharacters,
  linkStoryboardCharactersFromText,
} from './narration-characters.js'

export interface StoryboardDescBlock {
  index: number
  storyboardId?: number
  label?: string
  content: string
}

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, '')
}

/** 解析【#01 标签】或【#01#123 标签】格式的分镜描述块 */
export function parseStoryboardDescBlocks(text: string): StoryboardDescBlock[] {
  const normalized = stripBom(String(text || '')).replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const headerRe = /【#(\d{1,3})(?:#(\d+))?([^】]*)】/g
  const matches = [...normalized.matchAll(headerRe)]
  if (!matches.length) return []

  const blocks: StoryboardDescBlock[] = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length
    const content = normalized.slice(start, end).trim()
    blocks.push({
      index: Number(m[1]),
      storyboardId: m[2] ? Number(m[2]) : undefined,
      label: m[3]?.trim() || undefined,
      content,
    })
  }
  return blocks
}

export function hasStoryboardDescBlocks(text: string) {
  return /【#\d{1,3}(?:#\d+)?/.test(String(text || ''))
}

function findStoryboardByBlock<T extends { id: number }>(
  ordered: T[],
  block: StoryboardDescBlock,
): T | null {
  if (block.storyboardId) {
    return ordered.find(sb => sb.id === block.storyboardId) || null
  }
  const idx = block.index - 1
  return idx >= 0 && idx < ordered.length ? ordered[idx] : null
}

function isTitleBlock(block: StoryboardDescBlock, content: string) {
  if (/片头|标题/i.test(block.label || '')) return true
  return /^标题\s*[:：]/.test(content)
}

function titleContentFromBlock(content: string) {
  return content.replace(/^标题\s*[:：]\s*/, '').trim() || content
}

async function createStoryboardsFromBlocks(episodeId: number, blocks: StoryboardDescBlock[]) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const validBlocks = blocks.filter(b => b.content.trim())
  if (!validBlocks.length) throw new Error('未能解析出有效分镜描述')

  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
  const ts = now()
  let storyboardNumber = 0
  let totalDuration = 0
  let titleFull: string | null = null

  for (const block of validBlocks) {
    const raw = block.content.trim()
    const isTitle = isTitleBlock(block, raw)
    const sentence = isTitle ? titleContentFromBlock(raw) : raw
    if (!sentence) continue
    if (isTitle && !titleFull) titleFull = sentence

    const duration = estimateNarrationDuration(sentence, isTitle)
    storyboardNumber++
    totalDuration += duration

    const res = db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber,
      title: isTitle ? '片头标题' : sentence.slice(0, 12) || `镜头${storyboardNumber}`,
      description: sentence,
      dialogue: isTitle ? `剧中：${sentence}` : `旁白：${sentence}`,
      imagePrompt: null,
      referenceImages: buildNarrationImageMeta(isTitle ? 'new' : 'inherit', {
        narration_shot_type: isTitle ? 'title' : undefined,
        narration_tts_mode: 'new',
        title_hook: isTitle ? sentence.slice(0, 20) : undefined,
        title_full: isTitle ? (titleFull || sentence) : undefined,
      }),
      shotType: isTitle ? '标题' : '中景',
      angle: '平视',
      movement: '固定',
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run()

    linkStoryboardCharactersFromText(
      Number(res.lastInsertRowid),
      sentence,
      episodeCharacters,
    )
  }

  db.update(schema.episodes)
    .set({ duration: Math.max(1, Math.ceil(totalDuration / 60)), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  return {
    mode: 'create' as const,
    count: storyboardNumber,
    total_duration: totalDuration,
  }
}

/** 上传旁白分镜描述：全文案走规则拆分，【#01】格式则按块填充/创建 */
export async function importNarrationStoryboardDesc(episodeId: number, text: string) {
  const trimmed = stripBom(String(text || '')).replace(/\r\n/g, '\n').trim()
  if (!trimmed) throw new Error('文件内容为空')

  if (!hasStoryboardDescBlocks(trimmed)) {
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    if (!ep) throw new Error('Episode not found')
    const ts = now()
    db.update(schema.episodes)
      .set({ content: trimmed, scriptContent: trimmed, updatedAt: ts })
      .where(eq(schema.episodes.id, episodeId))
      .run()
    const result = await breakdownNarrationStoryboards(episodeId, trimmed)
    return { mode: 'script' as const, ...result }
  }

  const blocks = parseStoryboardDescBlocks(trimmed)
  if (!blocks.length) throw new Error('未能解析分镜描述，请使用【#01】或【#01#镜头ID】格式')

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()

  if (!storyboards.length) {
    const created = await createStoryboardsFromBlocks(episodeId, blocks)
    return created
  }

  const ordered = sortStoryboardsByOrder(storyboards)
  const ts = now()
  let updated = 0
  let skipped = 0

  for (const block of blocks) {
    const content = block.content.trim()
    if (!content) {
      skipped++
      continue
    }
    const sb = findStoryboardByBlock(ordered, block)
    if (!sb) {
      skipped++
      continue
    }
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const isTitle = meta.narration_shot_type === 'title' || isTitleBlock(block, content)
    const sentence = isTitle ? titleContentFromBlock(content) : content

    db.update(schema.storyboards)
      .set({
        description: sentence,
        dialogue: isTitle ? `剧中：${sentence}` : `旁白：${sentence}`,
        title: isTitle ? '片头标题' : sentence.slice(0, 12) || sb.title,
        duration: estimateNarrationDuration(sentence, isTitle),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    updated++
  }

  return {
    mode: 'update' as const,
    updated,
    skipped,
    total: blocks.length,
  }
}

function parsePlainImagePromptLines(text: string): StoryboardDescBlock[] {
  const lines = stripBom(String(text || '')).replace(/\r\n/g, '\n').split('\n')
  const blocks: StoryboardDescBlock[] = []
  let index = 0
  for (const line of lines) {
    const content = line.trim()
    if (!content) continue
    index++
    blocks.push({ index, content })
  }
  return blocks
}

function narrationShotNeedsOwnImage(sb: { referenceImages?: string | null }) {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  return meta.narration_image_mode === 'new'
}

/** 上传配图分镜描述：填充 image_prompt，支持【#01】格式或逐行对应需配图镜头 */
export async function importNarrationImageDesc(episodeId: number, text: string) {
  const trimmed = stripBom(String(text || '')).replace(/\r\n/g, '\n').trim()
  if (!trimmed) throw new Error('文件内容为空')

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
  if (!storyboards.length) {
    const motionComic = usesMotionComicStoryboardRules(resolveEpisodeProductionMode(episodeId))
    throw new Error(motionComic ? '请先完成漫画分镜' : '请先完成旁白分镜')
  }

  const ordered = sortStoryboardsByOrder(storyboards)
  const needingImage = ordered.filter(sb => narrationShotNeedsOwnImage(sb))
  const useBlocks = hasStoryboardDescBlocks(trimmed)
  const blocks = useBlocks ? parseStoryboardDescBlocks(trimmed) : parsePlainImagePromptLines(trimmed)
  if (!blocks.length) throw new Error('未能解析配图描述')

  const lineTargets = needingImage.length ? needingImage : ordered

  const ts = now()
  let updated = 0
  let skipped = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const prompt = block.content.trim()
    if (!prompt) {
      skipped++
      continue
    }

    let sb = useBlocks ? findStoryboardByBlock(ordered, block) : null
    if (!useBlocks) {
      sb = lineTargets[i] || null
    }
    if (!sb) {
      skipped++
      continue
    }

    const existing = parseNarrationImageMeta(sb.referenceImages)
    db.update(schema.storyboards)
      .set({
        imagePrompt: prompt,
        referenceImages: buildNarrationImageMeta('new', {
          narration_shot_type: existing.narration_shot_type,
          narration_tts_mode: existing.narration_tts_mode,
          title_hook: existing.title_hook,
          title_full: existing.title_full,
          scene_content: existing.scene_content,
          narration_lines: existing.narration_lines,
          image_narration_lines: existing.image_narration_lines,
          paragraph_index: existing.paragraph_index,
          paragraph_layout: existing.paragraph_layout || 'single',
          script_paragraph_index: existing.script_paragraph_index,
          body_sentence_index: existing.body_sentence_index,
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    updated++
  }

  return {
    mode: useBlocks ? 'blocks' as const : 'lines' as const,
    updated,
    skipped,
    total: blocks.length,
  }
}
