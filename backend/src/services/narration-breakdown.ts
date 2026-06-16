import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { artStylePrompt, sanitizeSceneImagePrompt } from '../constants/art-styles.js'
import {
  buildNarrationImageMeta,
  buildParagraphImagePrompt,
  summarizeSceneMainContent,
} from './narration-image.js'
import {
  getEpisodeVisualCharacters,
  linkStoryboardCharactersFromText,
} from './narration-characters.js'
import { buildNarrationParagraphs, type NarrationParagraph } from './narration-paragraph.js'
import {
  generateParagraphImagePromptsWithLLM,
  splitNarrationSentencesWithMeta,
  splitTitleSentencesWithMeta,
  type ImageDetectMode,
} from './narration-scene-detect.js'

const TITLE_PREFIX_RE = /^标题\s*[:：]\s*(.+)$/i
const TITLE_ALT_PREFIX_RE = /^(?:片头(?:标题)?|开场标题)\s*[:：]\s*(.+)$/i
const TITLE_BRACKET_RE = /^【\s*标题\s*】\s*(.+)$/i
const TITLE_OPENING_RE = /^今天体验的人生剧本是[，,]?\s*.+/
const TITLE_SCRIPT_RE = /^(?:本期|本集)?人生剧本\s*[:：]?\s*.+/

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, '')
}

export function parseNarrationScript(text: string) {
  const normalized = stripBom(text.replace(/\r\n/g, '\n')).trim()
  if (!normalized) return { title: null as string | null, body: '' }

  const lines = normalized.split('\n').map(line => line.trim())
  const firstLine = lines[0] || ''

  const explicit =
    firstLine.match(TITLE_PREFIX_RE)
    || firstLine.match(TITLE_ALT_PREFIX_RE)
    || firstLine.match(TITLE_BRACKET_RE)

  if (explicit) {
    const title = explicit[1].trim()
    const body = lines.slice(1).join('\n').trim()
    return { title: title || null, body }
  }

  if (TITLE_OPENING_RE.test(firstLine) || TITLE_SCRIPT_RE.test(firstLine)) {
    return { title: firstLine, body: lines.slice(1).join('\n').trim() }
  }

  const blocks = normalized.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean)
  if (blocks.length >= 2) {
    const opener = blocks[0].replace(/\n/g, ' ').trim()
    if (opener.length >= 4 && opener.length <= 48 && !/[。！？；!?]$/.test(opener)) {
      return { title: opener, body: blocks.slice(1).join('\n\n').trim() }
    }
  }

  return { title: null, body: normalized }
}

export function extractTitleHook(title: string) {
  let hook = title
    .replace(/^今天体验的人生剧本是[，,]?\s*/, '')
    .replace(/^(?:本期|本集)?人生剧本\s*[:：]?\s*/, '')
    .replace(/^【|】$/g, '')
    .replace(/^[，,、\s]+/, '')
    .trim()
  if (!hook) hook = title.trim()

  const firstSegment = hook.split(/[，,]/)[0]?.trim() || hook
  if (firstSegment.length >= 6 && firstSegment.length <= 22) return firstSegment
  if (hook.length > 20) return hook.slice(0, 20)
  return hook
}

/** 片头配图用：优先从完整标题提取主题，避免「今天体验的人生剧本是」这类前缀句 */
export function resolveTitleVisualHook(titleFull?: string | null, titleHook?: string | null): string {
  const full = String(titleFull || '').trim()
  if (full) return extractTitleHook(full)
  const hook = String(titleHook || '').trim()
  if (!hook) return ''
  const stripped = extractTitleHook(hook)
  return stripped && stripped !== hook ? stripped : extractTitleHook(hook)
}

export function buildTitleImagePrompt(moodHint: string, style = 'comic') {
  const hook = sanitizeSceneImagePrompt(moodHint)
  return [
    'Chinese short drama narration opening background, single full illustration',
    'absolutely no text, no letters, no words, no watermark, no captions on image',
    'NOT romantic couple, NOT clock faces, NOT roses, NOT dreamlike abstract wallpaper, NOT pixel art, NOT retro photo filter',
    artStylePrompt(style, 'title'),
    `visual theme based on story hook: ${hook}`,
    'concrete era-appropriate environment matching the hook (street market, shop interior, city street, etc)',
    'clean center area reserved for dynamic title overlay, 16:9 landscape, high quality',
  ].join(', ')
}

/** @deprecated 使用 splitNarrationSentencesWithMeta */
export function splitNarrationSentences(text: string): string[] {
  return splitNarrationSentencesWithMeta(text).map(item => item.sentence)
}

export function estimateNarrationDuration(sentence: string, isTitle = false) {
  const chars = sentence.replace(/\s/g, '').length
  if (isTitle) return Math.max(6, Math.min(12, Math.ceil(chars / 3.5)))
  return Math.max(3, Math.min(12, Math.ceil(chars / 4.5)))
}

export async function breakdownNarrationEpisode(
  episodeId: number,
  style = 'comic',
  scriptOverride?: string,
  imageDetectMode: ImageDetectMode = 'paragraph',
) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const script = (scriptOverride || ep.scriptContent || ep.content || '').trim()
  if (!script) throw new Error('请先填写解说文案')

  const { title, body } = parseNarrationScript(script)
  const titleItems = title ? splitTitleSentencesWithMeta(title) : []
  const sentenceItems = splitNarrationSentencesWithMeta(body)
  if (!titleItems.length && !sentenceItems.length) throw new Error('未能从文案中拆分出有效句子')

  const paragraphs = buildNarrationParagraphs(sentenceItems)
  const paragraphPromptByAnchor = new Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' }>()
  paragraphs.forEach((para) => {
    const content = summarizeSceneMainContent(para.sentences)
    const prompt = buildParagraphImagePrompt(para.sentences, para.layout, style)
    paragraphPromptByAnchor.set(para.startIndex, { content, prompt, layout: para.layout })
  })

  const titleVisualHook = title ? extractTitleHook(title) : null
  let imagePromptSource: 'paragraph+llm' | 'paragraph' = 'paragraph'
  let titleImagePrompt = titleVisualHook ? buildTitleImagePrompt(titleVisualHook, style) : null
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)

  const llmPrompts = await generateParagraphImagePromptsWithLLM(
    paragraphs.map((para: NarrationParagraph) => ({
      index: para.index,
      startIndex: para.startIndex,
      sentences: para.sentences,
      layout: para.layout,
    })),
    { titleHook: titleVisualHook, titleFull: title || null, style, characters: episodeCharacters },
  )
  if (llmPrompts) {
    imagePromptSource = 'paragraph+llm'
    if (llmPrompts.titlePrompt) titleImagePrompt = sanitizeSceneImagePrompt(llmPrompts.titlePrompt)
    paragraphs.forEach((para) => {
      const llmPrompt = llmPrompts.promptsByStartIndex.get(para.startIndex)
      if (!llmPrompt) return
      paragraphPromptByAnchor.set(para.startIndex, {
        content: summarizeSceneMainContent(para.sentences),
        prompt: sanitizeSceneImagePrompt(llmPrompt),
        layout: para.layout,
      })
    })
  }

  const ts = now()
  const existingStoryboardIds = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .map(sb => sb.id)

  for (const storyboardId of existingStoryboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

  let totalDuration = 0
  let imageNeededCount = 0
  let storyboardNumber = 0
  const diptychCount = paragraphs.filter(p => p.layout === 'diptych').length

  if (titleItems.length) {
    const titleFull = title!
    titleItems.forEach((item, titleIndex) => {
      const sentence = item.sentence
      const duration = estimateNarrationDuration(sentence, true)
      const needsTitleImage = titleIndex === 0
      storyboardNumber++
      if (needsTitleImage) imageNeededCount++
      totalDuration += duration
      const res = db.insert(schema.storyboards).values({
        episodeId,
        storyboardNumber,
        title: '片头标题',
        description: sentence,
        dialogue: `剧中：${sentence}`,
        imagePrompt: needsTitleImage ? titleImagePrompt : null,
        referenceImages: buildNarrationImageMeta(needsTitleImage ? 'new' : 'inherit', {
          narration_shot_type: 'title',
          narration_tts_mode: 'new',
          title_hook: titleVisualHook || extractTitleHook(sentence),
          title_full: titleFull,
        }),
        shotType: '标题',
        angle: '平视',
        movement: '固定',
        duration,
        createdAt: ts,
        updatedAt: ts,
      }).run()
      linkStoryboardCharactersFromText(
        Number(res.lastInsertRowid),
        [titleFull, titleVisualHook, needsTitleImage ? titleImagePrompt : '', sentence].filter(Boolean).join('\n'),
        episodeCharacters,
      )
    })
  }

  imageNeededCount += paragraphs.length

  sentenceItems.forEach((item, index) => {
    const sentence = item.sentence
    const duration = estimateNarrationDuration(sentence)
    totalDuration += duration
    storyboardNumber++

    const paraInfo = paragraphPromptByAnchor.get(index)
    const isParagraphAnchor = !!paraInfo
    const para = paragraphs.find(p => p.startIndex === index)

    const res = db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber,
      title: sentence.slice(0, 12) || `镜头${storyboardNumber}`,
      description: sentence,
      dialogue: `旁白：${sentence}`,
      imagePrompt: paraInfo?.prompt || null,
      referenceImages: buildNarrationImageMeta(isParagraphAnchor ? 'new' : 'inherit', {
        narration_tts_mode: 'new',
        scene_content: paraInfo?.content,
        paragraph_index: para?.index,
        paragraph_layout: para?.layout || 'single',
      }),
      shotType: '中景',
      angle: '平视',
      movement: '固定',
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkStoryboardCharactersFromText(
      Number(res.lastInsertRowid),
      [sentence, paraInfo?.content, paraInfo?.prompt].filter(Boolean).join('\n'),
      episodeCharacters,
    )
  })

  db.update(schema.episodes)
    .set({ duration: Math.max(1, Math.ceil(totalDuration / 60)), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  return {
    count: storyboardNumber,
    sentence_count: sentenceItems.length,
    title_count: titleItems.length,
    title_image_count: titleItems.length ? 1 : 0,
    title_hook: titleVisualHook,
    paragraph_count: paragraphs.length,
    diptych_count: diptychCount,
    image_needed_count: imageNeededCount,
    image_detect_source: imagePromptSource,
    image_prompt_source: imagePromptSource === 'paragraph+llm' ? 'llm' : 'template',
    image_detect_mode: imageDetectMode === 'balanced' || imageDetectMode === 'conservative' ? 'paragraph' : imageDetectMode,
    total_duration: totalDuration,
  }
}
