import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import {
  buildNarrationTitleImagePromptContent,
  finalizeNarrationImagePrompt,
  isNarrationMinimalStyle,
  sanitizeSceneImagePrompt,
} from '../constants/art-styles.js'
import { resolveEpisodeTextModel } from '../constants/text-models.js'
import {
  buildTitleImagePrompt,
  extractTitleHook,
  resolveTitleVisualHook,
} from './narration-breakdown.js'
import {
  buildNarrationImageMeta,
  buildParagraphImagePrompt,
  parseNarrationImageMeta,
  summarizeSceneMainContent,
} from './narration-image.js'
import {
  getEpisodeVisualCharacters,
  linkStoryboardCharactersFromText,
} from './narration-characters.js'
import { buildNarrationParagraphs, type NarrationParagraph } from './narration-paragraph.js'
import {
  generateParagraphImagePromptsWithLLM,
  generateTitleImagePromptWithLLM,
  mergeStoryboardLinesForImagePrompt,
  type ImageDetectMode,
  type NarrationSentenceItem,
} from './narration-scene-detect.js'
import { now } from '../utils/response.js'

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^旁白[：:]\s*/, '')
}

/** 配图分镜：在已有旁白镜头上检测换图段落并生成配图文案（不重建 TTS 分镜） */
export async function breakdownNarrationImages(
  episodeId: number,
  style = 'comic',
  imageDetectMode: ImageDetectMode = 'paragraph',
) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
  if (!storyboards.length) throw new Error('请先完成旁白分镜')

  const titleStoryboards = storyboards.filter(
    sb => parseNarrationImageMeta(sb.referenceImages).narration_shot_type === 'title',
  )
  const bodyStoryboards = storyboards.filter(
    sb => parseNarrationImageMeta(sb.referenceImages).narration_shot_type !== 'title',
  )
  if (!bodyStoryboards.length && !titleStoryboards.length) {
    throw new Error('未找到解说分镜，请先执行旁白分镜')
  }

  const sentenceItems: NarrationSentenceItem[] = bodyStoryboards.map((sb) => {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const scriptParagraphIndex = typeof meta.script_paragraph_index === 'number'
      ? meta.script_paragraph_index
      : 0
    return {
      sentence: storyboardNarrationSentence(sb),
      paragraphIndex: scriptParagraphIndex,
    }
  })
  const allBodySentences = sentenceItems.map(item => item.sentence)

  const paragraphs = bodyStoryboards.length
    ? buildNarrationParagraphs(sentenceItems, imageDetectMode)
    : []

  const paragraphPromptByAnchor = new Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' }>()
  paragraphs.forEach((para) => {
    const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
    const promptOptions = {
      fullNarrationLines: allBodySentences,
      timelineUpToIndex: para.startIndex,
    }
    paragraphPromptByAnchor.set(para.startIndex, {
      content: summarizeSceneMainContent(imageLines),
      prompt: buildParagraphImagePrompt(imageLines, para.layout, style, promptOptions),
      layout: para.layout,
    })
  })

  const firstTitleMeta = titleStoryboards[0]
    ? parseNarrationImageMeta(titleStoryboards[0].referenceImages)
    : null
  const titleFull = firstTitleMeta?.title_full || null
  const titleVisualHook = resolveTitleVisualHook(titleFull, firstTitleMeta?.title_hook)

  let imagePromptSource: 'paragraph+llm' | 'paragraph' = 'paragraph'
  const titleCtx = { titleFull, bodySentences: allBodySentences }
  let titleImagePrompt = titleVisualHook
    ? (isNarrationMinimalStyle(style)
      ? buildNarrationTitleImagePromptContent(titleVisualHook, titleCtx)
      : buildTitleImagePrompt(titleVisualHook, style, titleCtx))
    : null
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
  const textModel = resolveEpisodeTextModel(ep)

  const llmPrompts = (paragraphs.length || titleVisualHook)
    ? await generateParagraphImagePromptsWithLLM(
      paragraphs.map((para: NarrationParagraph) => ({
        index: para.index,
        startIndex: para.startIndex,
        sentences: mergeStoryboardLinesForImagePrompt(para.sentences),
        layout: para.layout,
      })),
      {
        titleHook: titleVisualHook,
        titleFull,
        style,
        textModel,
        characters: episodeCharacters,
        fullNarrationLines: allBodySentences,
      },
    )
    : null

  if (llmPrompts) {
    imagePromptSource = 'paragraph+llm'
    if (llmPrompts.titlePrompt) {
      titleImagePrompt = isNarrationMinimalStyle(style)
        ? finalizeNarrationImagePrompt(llmPrompts.titlePrompt, {
          titleHook: titleVisualHook || undefined,
          titleFull,
          titleBodySentences: allBodySentences,
        })
        : llmPrompts.titlePrompt
    }
    paragraphs.forEach((para) => {
      const llmPrompt = llmPrompts.promptsByStartIndex.get(para.startIndex)
      if (!llmPrompt) return
      const imageNarrationLines = mergeStoryboardLinesForImagePrompt(para.sentences)
      paragraphPromptByAnchor.set(para.startIndex, {
        content: summarizeSceneMainContent(imageNarrationLines),
        prompt: isNarrationMinimalStyle(style)
          ? finalizeNarrationImagePrompt(llmPrompt, {
            narrationLines: imageNarrationLines,
            fullNarrationLines: allBodySentences,
            timelineUpToIndex: para.startIndex,
          })
          : sanitizeSceneImagePrompt(llmPrompt),
        layout: para.layout,
      })
    })
  }

  if (titleVisualHook && !llmPrompts?.titlePrompt) {
    const titleLlm = await generateTitleImagePromptWithLLM({
      titleHook: titleVisualHook,
      titleFull,
      bodySentences: allBodySentences,
      style,
      textModel,
    })
    if (titleLlm) {
      titleImagePrompt = isNarrationMinimalStyle(style)
        ? finalizeNarrationImagePrompt(titleLlm, {
          titleHook: titleVisualHook || undefined,
          titleFull,
          titleBodySentences: allBodySentences,
        })
        : titleLlm
      if (imagePromptSource === 'paragraph') imagePromptSource = 'paragraph+llm'
    }
  }

  const ts = now()
  let imageNeededCount = 0
  const diptychCount = paragraphs.filter(p => p.layout === 'diptych').length

  if (titleStoryboards.length) {
    titleStoryboards.forEach((sb, titleIndex) => {
      const existing = parseNarrationImageMeta(sb.referenceImages)
      const needsTitleImage = titleIndex === 0
      if (needsTitleImage) imageNeededCount++
      db.update(schema.storyboards)
        .set({
          imagePrompt: needsTitleImage ? titleImagePrompt : null,
          referenceImages: buildNarrationImageMeta(needsTitleImage ? 'new' : 'inherit', {
            narration_shot_type: 'title',
            narration_tts_mode: existing.narration_tts_mode || 'new',
            title_hook: existing.title_hook || titleVisualHook || undefined,
            title_full: existing.title_full || titleFull || undefined,
          }),
          updatedAt: ts,
        })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
    })
  }

  imageNeededCount += paragraphs.length

  bodyStoryboards.forEach((sb, index) => {
    const paraInfo = paragraphPromptByAnchor.get(index)
    const isParagraphAnchor = !!paraInfo
    const para = paragraphs.find(p => p.startIndex === index)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const sentence = storyboardNarrationSentence(sb)

    db.update(schema.storyboards)
      .set({
        imagePrompt: isParagraphAnchor ? (paraInfo?.prompt || null) : null,
        referenceImages: buildNarrationImageMeta(isParagraphAnchor ? 'new' : 'inherit', {
          narration_tts_mode: existing.narration_tts_mode || 'new',
          script_paragraph_index: existing.script_paragraph_index ?? sentenceItems[index]?.paragraphIndex,
          scene_content: paraInfo?.content,
          narration_lines: para?.sentences,
          image_narration_lines: para ? mergeStoryboardLinesForImagePrompt(para.sentences) : undefined,
          paragraph_index: para?.index,
          paragraph_layout: para?.layout || 'single',
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    if (isParagraphAnchor) {
      linkStoryboardCharactersFromText(
        sb.id,
        [sentence, paraInfo?.content, paraInfo?.prompt].filter(Boolean).join('\n'),
        episodeCharacters,
      )
    }
  })

  return {
    paragraph_count: paragraphs.length,
    diptych_count: diptychCount,
    image_needed_count: imageNeededCount,
    title_image_count: titleStoryboards.length ? 1 : 0,
    title_hook: titleVisualHook,
    image_detect_source: imagePromptSource,
    image_prompt_source: imagePromptSource === 'paragraph+llm' ? 'llm' : 'template',
    image_detect_mode: imageDetectMode === 'balanced' || imageDetectMode === 'conservative' ? 'paragraph' : imageDetectMode,
    body_storyboard_count: bodyStoryboards.length,
  }
}
