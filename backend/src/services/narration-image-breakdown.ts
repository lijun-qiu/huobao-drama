import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextModel, resolveEpisodeTextThinking } from '../constants/text-models.js'
import { resolveTitleVisualHook } from './narration-breakdown.js'
import {
  buildNarrationImageMeta,
  parseNarrationImageMeta,
  summarizeSceneMainContent,
} from './narration-image.js'
import {
  getEpisodeVisualCharacters,
  linkStoryboardCharactersFromText,
} from './narration-characters.js'
import { buildNarrationParagraphsAsync, type NarrationParagraph } from './narration-paragraph.js'
import {
  generateParagraphImagePromptsWithLLM,
  generateTitleImagePromptWithLLM,
  mergeStoryboardLinesForImagePrompt,
  type ImageDetectMode,
  type NarrationSentenceItem,
} from './narration-scene-detect.js'
import {
  createNarrationImageBreakdownProgressReporter,
  startNarrationImageBreakdownProgress,
  updateNarrationImageBreakdownProgress,
} from './narration-image-breakdown-progress.js'
import { loadEpisodeContinuityContext } from './episode-continuity.js'
import { now } from '../utils/response.js'

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^旁白[：:]\s*/, '')
}

export type NarrationImageBreakdownOptions = {
  /** 仅对已有配图段、但 image_prompt 为空的镜头重新调用 AI（不重新换镜检测） */
  retryMissingPrompts?: boolean
}

function rebuildParagraphFromAnchor(
  sb: {
    id: number
    storyboardNumber: number
    description?: string | null
    dialogue?: string | null
    referenceImages?: string | null
  },
  bodyIndex: number,
): NarrationParagraph | null {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  if (meta.narration_image_mode !== 'new') return null

  const rawLines = meta.image_narration_lines?.length
    ? meta.image_narration_lines
    : meta.narration_lines?.length
      ? meta.narration_lines
      : meta.scene_content
        ? [meta.scene_content]
        : [storyboardNarrationSentence(sb)]
  const sentences = rawLines.map(s => String(s).trim()).filter(Boolean)
  if (!sentences.length) return null

  return {
    index: typeof meta.paragraph_index === 'number' ? meta.paragraph_index : bodyIndex,
    startIndex: bodyIndex,
    endIndex: bodyIndex,
    sentences,
    layout: meta.paragraph_layout === 'diptych' ? 'diptych' : 'single',
  }
}

/** 仅补全缺失的 AI 配图文案（沿用已有配图段落，不重新换镜检测） */
export async function retryMissingNarrationImagePrompts(episodeId: number, style = 'comic') {
  startNarrationImageBreakdownProgress(episodeId)
  const reportProgress = createNarrationImageBreakdownProgressReporter(episodeId)

  try {
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

    const missingParagraphs: NarrationParagraph[] = []
    const missingAnchorByStartIndex = new Map<number, typeof bodyStoryboards[number]>()
    const missingWithoutMeta: number[] = []

    bodyStoryboards.forEach((sb, index) => {
      const meta = parseNarrationImageMeta(sb.referenceImages)
      if (meta.narration_image_mode !== 'new') return
      if (String(sb.imagePrompt || '').trim()) return
      const para = rebuildParagraphFromAnchor(sb, index)
      if (!para) {
        missingWithoutMeta.push(sb.storyboardNumber)
        return
      }
      missingParagraphs.push(para)
      missingAnchorByStartIndex.set(index, sb)
    })

    if (missingWithoutMeta.length) {
      throw new Error(
        `镜头 #${missingWithoutMeta.join('、#')} 缺少配图段落信息，请执行完整「配图分镜」`,
      )
    }

    const firstTitle = titleStoryboards[0]
    const titleMissing = firstTitle && !String(firstTitle.imagePrompt || '').trim()
    const firstTitleMeta = firstTitle ? parseNarrationImageMeta(firstTitle.referenceImages) : null
    const titleFull = firstTitleMeta?.title_full || null
    const titleVisualHook = resolveTitleVisualHook(titleFull, firstTitleMeta?.title_hook)

    if (!missingParagraphs.length && !titleMissing) {
      throw new Error('所有需配图镜头已有配图文案，无需补跑')
    }

    const allBodySentences = bodyStoryboards.map(sb => storyboardNarrationSentence(sb))
    const continuity = loadEpisodeContinuityContext(episodeId)
    const textModel = resolveEpisodeTextModel(ep)
    const textThinking = resolveEpisodeTextThinking(ep)
    const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)

    const batchCount = Math.max(1, Math.ceil(missingParagraphs.length / 10))
    reportProgress({
      phase: 'prompts',
      message: titleMissing
        ? `准备补全 ${missingParagraphs.length} 段正文 + 片头配图文案（约 ${batchCount} 批）…`
        : `准备补全 ${missingParagraphs.length} 段缺失配图文案（约 ${batchCount} 批）…`,
      percent: 12,
      paragraph_count: missingParagraphs.length,
    })

    const llmPrompts = await generateParagraphImagePromptsWithLLM(
      missingParagraphs.map(para => ({
        index: para.index,
        startIndex: para.startIndex,
        sentences: mergeStoryboardLinesForImagePrompt(para.sentences),
        layout: para.layout,
      })),
      {
        titleHook: titleMissing ? titleVisualHook : null,
        titleFull: titleMissing ? titleFull : null,
        style,
        textModel,
        textThinking,
        characters: episodeCharacters,
        fullNarrationLines: allBodySentences,
        previousEpisodeNarration: continuity.previousEpisodeNarration,
        onProgress: reportProgress,
      },
    )

    if (!llmPrompts) {
      throw new Error('配图 AI 文案生成失败')
    }

    reportProgress({
      phase: 'saving',
      message: '正在写入配图文案…',
      percent: 96,
    })

    const ts = now()
    let promptsUpdated = 0

    for (const para of missingParagraphs) {
      const llmPrompt = String(llmPrompts.promptsByStartIndex.get(para.startIndex) || '').trim()
      if (!llmPrompt) {
        throw new Error(`配图 AI 未返回第 ${para.index + 1} 段的 image_prompt`)
      }
      const sb = missingAnchorByStartIndex.get(para.startIndex)
      if (!sb) continue
      db.update(schema.storyboards)
        .set({ imagePrompt: llmPrompt, updatedAt: ts })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
      linkStoryboardCharactersFromText(
        sb.id,
        [storyboardNarrationSentence(sb), llmPrompt].filter(Boolean).join('\n'),
        episodeCharacters,
      )
      promptsUpdated++
    }

    if (titleMissing && firstTitle) {
      let titleImagePrompt = String(llmPrompts.titlePrompt || '').trim() || null
      if (!titleImagePrompt) {
        reportProgress({
          phase: 'title',
          message: '正在生成片头配图文案…',
          percent: 88,
        })
        titleImagePrompt = await generateTitleImagePromptWithLLM({
          titleHook: titleVisualHook,
          titleFull,
          bodySentences: allBodySentences,
          previousEpisodeNarration: continuity.previousEpisodeNarration,
          style,
          textModel,
          textThinking,
        })
      }
      if (!titleImagePrompt?.trim()) {
        throw new Error('片头配图 AI 文案生成失败')
      }
      db.update(schema.storyboards)
        .set({ imagePrompt: titleImagePrompt, updatedAt: ts })
        .where(eq(schema.storyboards.id, firstTitle.id))
        .run()
      promptsUpdated++
    }

    reportProgress({
      status: 'completed',
      phase: 'done',
      message: `已补全 ${promptsUpdated} 条配图文案`,
      percent: 100,
      paragraph_count: missingParagraphs.length,
    })

    return {
      retry_missing_prompts: true,
      prompts_updated: promptsUpdated,
      paragraphs_retried: missingParagraphs.length,
      title_retried: titleMissing,
      image_prompt_source: 'llm',
      paragraph_count: missingParagraphs.length,
      image_needed_count: countNarrationImageNeeded(storyboards),
    }
  } catch (err: any) {
    const message = String(err?.message || err || '补全配图文案失败')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message,
      error: message,
    })
    throw err
  }
}

function countNarrationImageNeeded(
  storyboards: Array<{ referenceImages?: string | null }>,
) {
  return storyboards.filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new').length
}

/** 配图分镜：在已有旁白镜头上检测换图段落并生成配图文案（不重建 TTS 分镜） */
export async function breakdownNarrationImages(
  episodeId: number,
  style = 'comic',
  imageDetectMode: ImageDetectMode = 'paragraph',
  options?: NarrationImageBreakdownOptions,
) {
  if (options?.retryMissingPrompts) {
    return retryMissingNarrationImagePrompts(episodeId, style)
  }
  startNarrationImageBreakdownProgress(episodeId)
  const reportProgress = createNarrationImageBreakdownProgressReporter(episodeId)

  try {
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
  const continuity = loadEpisodeContinuityContext(episodeId)
  const textModel = resolveEpisodeTextModel(ep)
  const textThinking = resolveEpisodeTextThinking(ep)

  const { paragraphs, detectSource } = bodyStoryboards.length
    ? await buildNarrationParagraphsAsync(sentenceItems, {
      imageDetectMode,
      textModel,
      textThinking,
      style,
      fullNarrationLines: allBodySentences,
      previousEpisodeNarration: continuity.previousEpisodeNarration,
    })
    : { paragraphs: [] as NarrationParagraph[], detectSource: 'balanced' as const }

  reportProgress({
    phase: 'detecting',
    message: paragraphs.length
      ? continuity.enabled
        ? `已识别 ${paragraphs.length} 段配图（已参照第 ${continuity.previousEpisodeNumber} 集），准备生成 AI 文案…`
        : `已识别 ${paragraphs.length} 段配图，准备生成 AI 文案…`
      : '换镜检测完成，准备生成片头文案…',
    percent: 12,
    paragraph_count: paragraphs.length,
  })

  const paragraphMetaByAnchor = new Map<number, { content: string; layout: 'single' | 'diptych' }>()
  paragraphs.forEach((para) => {
    const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
    paragraphMetaByAnchor.set(para.startIndex, {
      content: summarizeSceneMainContent(imageLines),
      layout: para.layout,
    })
  })

  const firstTitleMeta = titleStoryboards[0]
    ? parseNarrationImageMeta(titleStoryboards[0].referenceImages)
    : null
  const titleFull = firstTitleMeta?.title_full || null
  const titleVisualHook = resolveTitleVisualHook(titleFull, firstTitleMeta?.title_hook)
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)

  const paragraphPromptByAnchor = new Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' }>()
  let titleImagePrompt: string | null = null
  const needsLlmPrompts = paragraphs.length > 0 || !!titleVisualHook

  if (needsLlmPrompts) {
    const llmPrompts = await generateParagraphImagePromptsWithLLM(
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
        textThinking,
        characters: episodeCharacters,
        fullNarrationLines: allBodySentences,
        previousEpisodeNarration: continuity.previousEpisodeNarration,
        onProgress: reportProgress,
      },
    )

    if (!llmPrompts) {
      throw new Error('配图 AI 文案生成失败')
    }

    for (const para of paragraphs) {
      const llmPrompt = String(llmPrompts.promptsByStartIndex.get(para.startIndex) || '').trim()
      if (!llmPrompt) {
        throw new Error(`配图 AI 未返回第 ${para.index + 1} 段的 image_prompt`)
      }
      const meta = paragraphMetaByAnchor.get(para.startIndex)
      if (!meta) continue
      paragraphPromptByAnchor.set(para.startIndex, {
        content: meta.content,
        prompt: llmPrompt,
        layout: meta.layout,
      })
    }

    if (titleVisualHook) {
      titleImagePrompt = String(llmPrompts.titlePrompt || '').trim() || null
      if (!titleImagePrompt) {
        reportProgress({
          phase: 'title',
          message: '正在生成片头配图文案…',
          percent: 88,
        })
        titleImagePrompt = await generateTitleImagePromptWithLLM({
          titleHook: titleVisualHook,
          titleFull,
          bodySentences: allBodySentences,
          previousEpisodeNarration: continuity.previousEpisodeNarration,
          style,
          textModel,
          textThinking,
        })
      }
      if (!titleImagePrompt?.trim()) {
        throw new Error('片头配图 AI 文案生成失败')
      }
    }
  }

  reportProgress({
    phase: 'saving',
    message: '正在写入分镜数据…',
    percent: 96,
  })

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

  reportProgress({
    status: 'completed',
    phase: 'done',
    message: '配图分镜完成',
    percent: 100,
    paragraph_count: paragraphs.length,
  })

  return {
    paragraph_count: paragraphs.length,
    diptych_count: diptychCount,
    image_needed_count: imageNeededCount,
    title_image_count: titleStoryboards.length ? 1 : 0,
    title_hook: titleVisualHook,
    image_detect_source: detectSource,
    image_prompt_source: needsLlmPrompts ? 'llm' : null,
    image_detect_mode: imageDetectMode === 'balanced' || imageDetectMode === 'conservative' ? 'paragraph' : imageDetectMode,
    body_storyboard_count: bodyStoryboards.length,
  }
  } catch (err: any) {
    const message = String(err?.message || err || '配图分镜失败')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message,
      error: message,
    })
    throw err
  }
}
