import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel } from '../constants/text-models.js'
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
  mergeStoryboardLinesForImagePrompt,
  resolveParagraphPromptBatchSize,
  type ImageDetectMode,
  type NarrationSentenceItem,
} from './narration-scene-detect.js'
import {
  createNarrationImageBreakdownProgressReporter,
  startNarrationImageBreakdownProgress,
  updateNarrationImageBreakdownProgress,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { loadEpisodeContinuityContext } from './episode-continuity.js'
import { now } from '../utils/response.js'
import { applySubtitleLinesToStoryboards } from './narration-emphasis-apply.js'

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^(旁白|剧中)[：:]\s*/, '')
}

function preserveShotMeta(existing: ReturnType<typeof parseNarrationImageMeta>) {
  const extra: Record<string, unknown> = {}
  if (existing.narration_shot_type) extra.narration_shot_type = existing.narration_shot_type
  if (existing.title_hook) extra.title_hook = existing.title_hook
  if (existing.title_full) extra.title_full = existing.title_full
  if (existing.subtitle_narration) extra.subtitle_narration = existing.subtitle_narration
  if (typeof existing.body_sentence_index === 'number') extra.body_sentence_index = existing.body_sentence_index
  return extra
}

export type NarrationImageBreakdownOptions = {
  /** 仅对已有配图段、但 image_prompt 为空的镜头重新调用 AI（不重新换镜检测） */
  retryMissingPrompts?: boolean
  textModel?: string | null
  textThinking?: boolean | null
}

function rebuildParagraphFromAnchor(
  sb: {
    id: number
    storyboardNumber: number
    description?: string | null
    dialogue?: string | null
    referenceImages?: string | null
  },
  storyboardIndex: number,
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
    index: typeof meta.paragraph_index === 'number' ? meta.paragraph_index : storyboardIndex,
    startIndex: storyboardIndex,
    endIndex: storyboardIndex,
    sentences,
    layout: meta.paragraph_layout === 'diptych' ? 'diptych' : 'single',
    sceneDescription: meta.scene_content || undefined,
  }
}

function collectPendingParagraphs(ctx: ReturnType<typeof loadEpisodeStoryboardContext>) {
  const allParagraphs = paragraphsFromAnchors(ctx.orderedStoryboards)
  const missingWithoutMeta: number[] = []
  const pendingParagraphs: NarrationParagraph[] = []

  for (const para of allParagraphs) {
    const sb = ctx.orderedStoryboards[para.startIndex]
    if (!sb) continue
    if (String(sb.imagePrompt || '').trim()) continue
    const rebuilt = rebuildParagraphFromAnchor(sb, para.startIndex)
    if (!rebuilt) {
      missingWithoutMeta.push(sb.storyboardNumber)
      continue
    }
    pendingParagraphs.push(rebuilt)
  }

  return { allParagraphs, pendingParagraphs, missingWithoutMeta }
}

function buildPromptAnchorMap(
  paragraphs: NarrationParagraph[],
  promptsByStartIndex: Map<number, string>,
) {
  const paragraphPromptByAnchor = new Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' }>()
  for (const para of paragraphs) {
    const llmPrompt = String(promptsByStartIndex.get(para.startIndex) || '').trim()
    if (!llmPrompt) continue
    const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
    paragraphPromptByAnchor.set(para.startIndex, {
      content: summarizeSceneMainContent(imageLines),
      prompt: llmPrompt,
      layout: para.layout,
    })
  }
  return paragraphPromptByAnchor
}

export type NarrationImagePromptOptions = {
  batchSize?: number
  /** 测试：仅生成指定段批（从 1 起，按全量配图段落 + batchSize 划分） */
  testBatchIndex?: number
  textModel?: string | null
  textThinking?: boolean | null
  onProgress?: NarrationImageBreakdownProgressCallback
}

function sliceParagraphBatchByIndex<T>(items: T[], batchSize: number, batchIndex: number): T[] {
  const idx = Math.max(1, Math.floor(Number(batchIndex)) || 1)
  const start = (idx - 1) * batchSize
  return items.slice(start, start + batchSize)
}

async function runNarrationImagePromptGeneration(
  episodeId: number,
  style: string,
  options?: NarrationImagePromptOptions & { retryMissing?: boolean },
) {
  startNarrationImageBreakdownProgress(episodeId)
  const baseReportProgress = createNarrationImageBreakdownProgressReporter(episodeId)
  const reportProgress: NarrationImageBreakdownProgressCallback = patch => {
    baseReportProgress(patch)
    options?.onProgress?.(patch)
  }
  const promptBatchSize = resolveParagraphPromptBatchSize(options?.batchSize)

  try {
    const ctx = loadEpisodeStoryboardContext(episodeId, {
      textModel: options?.textModel,
      textThinking: options?.textThinking,
    })
    const { allParagraphs, pendingParagraphs, missingWithoutMeta } = collectPendingParagraphs(ctx)

    if (!allParagraphs.length) {
      throw new Error('请先执行「① 检测配图」')
    }
    if (missingWithoutMeta.length) {
      throw new Error(
        `镜头 #${missingWithoutMeta.join('、#')} 缺少配图段落信息，请重新执行「① 检测配图」`,
      )
    }
    if (!pendingParagraphs.length && options?.testBatchIndex == null) {
      reportProgress({
        status: 'completed',
        phase: 'done',
        message: `全部 ${allParagraphs.length} 条配图文案已就绪`,
        percent: 100,
        paragraph_count: allParagraphs.length,
      })
      return {
        step: 'prompts',
        already_complete: true,
        paragraph_count: allParagraphs.length,
        image_needed_count: allParagraphs.length,
        prompts_generated: allParagraphs.length,
        image_prompt_source: 'llm_raw',
        image_prompt_at: Date.now(),
        retry_missing_prompts: !!options?.retryMissing,
        prompts_updated: 0,
      }
    }

    const testBatchIndex = options?.testBatchIndex
    let targetParagraphs = pendingParagraphs
    if (testBatchIndex != null) {
      const batchSlice = sliceParagraphBatchByIndex(allParagraphs, promptBatchSize, testBatchIndex)
      const totalBatches = Math.max(1, Math.ceil(allParagraphs.length / promptBatchSize))
      if (!batchSlice.length) {
        throw new Error(`段批 ${testBatchIndex} 不存在（共 ${totalBatches} 批）`)
      }
      // 测试：始终生成该段批全部段落（含已有文案，便于试跑/覆盖）
      targetParagraphs = batchSlice
    }

    const batchCount = testBatchIndex != null
      ? 1
      : Math.max(1, Math.ceil(pendingParagraphs.length / promptBatchSize))
    const alreadyDone = allParagraphs.length - pendingParagraphs.length
    reportProgress({
      phase: 'prompts',
      message: testBatchIndex != null
        ? `测试生成段批 ${testBatchIndex}：${targetParagraphs.length} 段配图文案…`
        : alreadyDone > 0
          ? `补全 ${pendingParagraphs.length} 段缺失配图文案（已完成 ${alreadyDone}/${allParagraphs.length}，约 ${batchCount} 批）…`
          : `正在生成 ${pendingParagraphs.length} 段纯 LLM 配图文案（约 ${batchCount} 批）…`,
      percent: 12,
      paragraph_count: targetParagraphs.length,
      batch: testBatchIndex ?? undefined,
      batch_count: batchCount,
    })

    const llmPrompts = await generateParagraphImagePromptsWithLLM(
      targetParagraphs.map(para => ({
        index: para.index,
        startIndex: para.startIndex,
        sentences: mergeStoryboardLinesForImagePrompt(para.sentences),
        ttsSentences: para.sentences,
        layout: para.layout,
        sceneDescription: para.sceneDescription,
      })),
      {
        style,
        textModel: ctx.textModel,
        textThinking: ctx.textThinking,
        characters: ctx.episodeCharacters,
        fullNarrationLines: ctx.allSentences,
        previousEpisodeNarration: ctx.continuity.previousEpisodeNarration,
        onProgress: reportProgress,
        pureLlm: true,
        batchSize: testBatchIndex != null ? targetParagraphs.length : promptBatchSize,
        onBatchComplete: async ({ batch, promptsByStartIndex, subtitleLinesByStartIndex }) => {
          const anchorMap = buildPromptAnchorMap(
            targetParagraphs.filter(p => batch.some(item => item.startIndex === p.startIndex)),
            promptsByStartIndex,
          )
          savePromptAnchorsOnly(ctx, allParagraphs, anchorMap)
          applySubtitleLinesToStoryboards(ctx.orderedStoryboards, allParagraphs, subtitleLinesByStartIndex)
        },
      },
    )

    if (!llmPrompts) throw new Error('配图 AI 文案生成失败')

    applySubtitleLinesToStoryboards(
      ctx.orderedStoryboards,
      allParagraphs,
      llmPrompts.subtitleLinesByStartIndex,
    )

    const stillMissing = targetParagraphs.filter(
      para => !String(llmPrompts.promptsByStartIndex.get(para.startIndex) || '').trim(),
    )
    if (stillMissing.length) {
      const hint = testBatchIndex != null
        ? `测试段批 ${testBatchIndex} 仍有 ${stillMissing.length} 段未返回 prompt`
        : `配图 AI 未返回 ${stillMissing.length} 段的 image_prompt，请点「补全缺失文案」继续`
      throw new Error(hint)
    }

    reportProgress({
      status: 'completed',
      phase: 'done',
      message: testBatchIndex != null
        ? `测试完成：段批 ${testBatchIndex} 已生成 ${targetParagraphs.length} 段配图文案`
        : options?.retryMissing
          ? `已补全 ${pendingParagraphs.length} 条配图文案`
          : `已生成 ${allParagraphs.length} 条纯 LLM 配图文案`,
      percent: 100,
      paragraph_count: allParagraphs.length,
    })

    return {
      step: 'prompts',
      paragraph_count: allParagraphs.length,
      image_needed_count: allParagraphs.length,
      prompts_generated: allParagraphs.length,
      image_prompt_source: 'llm_raw',
      image_prompt_at: Date.now(),
      retry_missing_prompts: !!options?.retryMissing,
      prompts_updated: pendingParagraphs.length,
      paragraphs_retried: options?.retryMissing ? pendingParagraphs.length : undefined,
    }
  } catch (err: any) {
    const message = String(err?.message || err || '配图文案生成失败')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message: message.includes('补全缺失文案') ? message : `${message}（已成功的批次已保存，请点「补全缺失文案」继续）`,
      error: message,
    })
    throw err
  }
}

/** 仅补全缺失的 AI 配图文案（沿用已有配图段落，不重新换镜检测） */
export async function retryMissingNarrationImagePrompts(
  episodeId: number,
  style = 'comic',
  options?: NarrationImagePromptOptions,
) {
  return runNarrationImagePromptGeneration(episodeId, style, { ...options, retryMissing: true })
}

function countNarrationImageNeeded(
  storyboards: Array<{ referenceImages?: string | null }>,
) {
  return storyboards.filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new').length
}

function countTitleImageAnchors(
  storyboards: Array<{ referenceImages?: string | null }>,
  paragraphs: NarrationParagraph[],
) {
  const titleIndexes = new Set(
    storyboards
      .map((sb, index) => ({ sb, index }))
      .filter(({ sb }) => parseNarrationImageMeta(sb.referenceImages).narration_shot_type === 'title')
      .map(({ index }) => index),
  )
  return paragraphs.filter(p => titleIndexes.has(p.startIndex)).length
}

function loadEpisodeStoryboardContext(
  episodeId: number,
  options?: { textModel?: string | null; textThinking?: boolean | null },
) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const orderedStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
  if (!orderedStoryboards.length) throw new Error('请先完成旁白分镜')

  const sentenceItems: NarrationSentenceItem[] = orderedStoryboards.map((sb) => {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const scriptParagraphIndex = typeof meta.script_paragraph_index === 'number'
      ? meta.script_paragraph_index
      : 0
    return {
      sentence: storyboardNarrationSentence(sb),
      paragraphIndex: scriptParagraphIndex,
      isTitle: meta.narration_shot_type === 'title',
    }
  })

  return {
    ep,
    orderedStoryboards,
    sentenceItems,
    allSentences: sentenceItems.map(item => item.sentence),
    continuity: loadEpisodeContinuityContext(episodeId),
    textModel: resolveNarrationImageTextModel(ep, options?.textModel),
    textThinking: resolveEpisodeTextThinking(ep, options?.textThinking),
    episodeCharacters: getEpisodeVisualCharacters(episodeId, ep.dramaId),
  }
}

function saveDetectResults(
  orderedStoryboards: typeof schema.storyboards.$inferSelect[],
  sentenceItems: NarrationSentenceItem[],
  paragraphs: NarrationParagraph[],
  paragraphMetaByAnchor: Map<number, { content: string; layout: 'single' | 'diptych' }>,
) {
  const ts = now()
  orderedStoryboards.forEach((sb, index) => {
    const paraInfo = paragraphMetaByAnchor.get(index)
    const isParagraphAnchor = !!paraInfo
    const para = paragraphs.find(p => p.startIndex === index)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const shotMeta = preserveShotMeta(existing)

    db.update(schema.storyboards)
      .set({
        imagePrompt: null,
        referenceImages: buildNarrationImageMeta(isParagraphAnchor ? 'new' : 'inherit', {
          ...shotMeta,
          narration_tts_mode: isParagraphAnchor ? 'new' : 'inherit',
          script_paragraph_index: existing.script_paragraph_index ?? sentenceItems[index]?.paragraphIndex,
          scene_content: paraInfo?.content,
          narration_lines: para?.sentences,
          image_narration_lines: para ? mergeStoryboardLinesForImagePrompt(para.sentences) : undefined,
          paragraph_index: para?.index,
          paragraph_layout: para?.layout || 'single',
          image_prompt_source: undefined,
          image_prompt_llm_raw: undefined,
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
  })
}

function savePromptAnchorsOnly(
  ctx: ReturnType<typeof loadEpisodeStoryboardContext>,
  paragraphs: NarrationParagraph[],
  paragraphPromptByAnchor: Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' }>,
) {
  if (!paragraphPromptByAnchor.size) return 0
  const ts = now()
  let saved = 0

  for (const [startIndex, paraInfo] of paragraphPromptByAnchor) {
    const sb = ctx.orderedStoryboards[startIndex]
    if (!sb) continue
    const para = paragraphs.find(p => p.startIndex === startIndex)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const sentence = storyboardNarrationSentence(sb)
    const shotMeta = preserveShotMeta(existing)

    db.update(schema.storyboards)
      .set({
        imagePrompt: paraInfo.prompt,
        referenceImages: buildNarrationImageMeta('new', {
          ...shotMeta,
          narration_tts_mode: 'new',
          script_paragraph_index: existing.script_paragraph_index ?? ctx.sentenceItems[startIndex]?.paragraphIndex,
          scene_content: paraInfo.content ?? existing.scene_content,
          narration_lines: para?.sentences ?? existing.narration_lines,
          image_narration_lines: para
            ? mergeStoryboardLinesForImagePrompt(para.sentences)
            : existing.image_narration_lines,
          paragraph_index: para?.index ?? existing.paragraph_index,
          paragraph_layout: para?.layout || existing.paragraph_layout || 'single',
          image_prompt_source: 'llm_raw',
          image_prompt_llm_raw: paraInfo.prompt,
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    linkStoryboardCharactersFromText(
      sb.id,
      [sentence, paraInfo.content, paraInfo.prompt].filter(Boolean).join('\n'),
      ctx.episodeCharacters,
    )
    saved++
  }

  return saved
}

function savePromptResults(
  ctx: ReturnType<typeof loadEpisodeStoryboardContext>,
  paragraphs: NarrationParagraph[],
  paragraphPromptByAnchor: Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' }>,
) {
  const ts = now()
  ctx.orderedStoryboards.forEach((sb, index) => {
    const paraInfo = paragraphPromptByAnchor.get(index)
    const isParagraphAnchor = !!paraInfo
    const para = paragraphs.find(p => p.startIndex === index)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const sentence = storyboardNarrationSentence(sb)
    const shotMeta = preserveShotMeta(existing)

    db.update(schema.storyboards)
      .set({
        imagePrompt: isParagraphAnchor ? (paraInfo?.prompt || null) : null,
        referenceImages: buildNarrationImageMeta(isParagraphAnchor ? 'new' : 'inherit', {
          ...shotMeta,
          narration_tts_mode: isParagraphAnchor ? 'new' : 'inherit',
          script_paragraph_index: existing.script_paragraph_index ?? ctx.sentenceItems[index]?.paragraphIndex,
          scene_content: paraInfo?.content ?? existing.scene_content,
          narration_lines: para?.sentences ?? existing.narration_lines,
          image_narration_lines: para
            ? mergeStoryboardLinesForImagePrompt(para.sentences)
            : existing.image_narration_lines,
          paragraph_index: para?.index ?? existing.paragraph_index,
          paragraph_layout: para?.layout || existing.paragraph_layout || 'single',
          image_prompt_source: isParagraphAnchor ? 'llm_raw' : existing.image_prompt_source,
          image_prompt_llm_raw: isParagraphAnchor ? (paraInfo?.prompt || undefined) : existing.image_prompt_llm_raw,
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    if (isParagraphAnchor) {
      linkStoryboardCharactersFromText(
        sb.id,
        [sentence, paraInfo?.content, paraInfo?.prompt].filter(Boolean).join('\n'),
        ctx.episodeCharacters,
      )
    }
  })
}

function paragraphsFromAnchors(
  orderedStoryboards: typeof schema.storyboards.$inferSelect[],
): NarrationParagraph[] {
  const paragraphs: NarrationParagraph[] = []
  orderedStoryboards.forEach((sb, index) => {
    const para = rebuildParagraphFromAnchor(sb, index)
    if (para) paragraphs.push(para)
  })
  return paragraphs
}

/** 第一步：LLM 检测哪些镜头需要配图（不写配图文案） */
export async function detectNarrationImageAnchors(
  episodeId: number,
  style = 'comic',
  imageDetectMode: ImageDetectMode = 'paragraph',
  batchOptions?: {
    batchThreshold?: number
    batchSize?: number
    textModel?: string | null
    textThinking?: boolean | null
    onProgress?: NarrationImageBreakdownProgressCallback
  },
) {
  startNarrationImageBreakdownProgress(episodeId)
  const baseReportProgress = createNarrationImageBreakdownProgressReporter(episodeId)
  const reportProgress: NarrationImageBreakdownProgressCallback = patch => {
    baseReportProgress(patch)
    batchOptions?.onProgress?.(patch)
  }

  try {
    const ctx = loadEpisodeStoryboardContext(episodeId, {
      textModel: batchOptions?.textModel,
      textThinking: batchOptions?.textThinking,
    })
    const { paragraphs, detectSource } = await buildNarrationParagraphsAsync(ctx.sentenceItems, {
      imageDetectMode,
      textModel: ctx.textModel,
      textThinking: ctx.textThinking,
      style,
      fullNarrationLines: ctx.allSentences,
      previousEpisodeNarration: ctx.continuity.previousEpisodeNarration,
      detectBatchThreshold: batchOptions?.batchThreshold,
      detectBatchSize: batchOptions?.batchSize,
      onDetectProgress: reportProgress,
    })

    const paragraphMetaByAnchor = new Map<number, { content: string; layout: 'single' | 'diptych' }>()
    paragraphs.forEach((para) => {
      const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
      paragraphMetaByAnchor.set(para.startIndex, {
        content: para.sceneDescription || summarizeSceneMainContent(imageLines),
        layout: para.layout,
      })
    })

    saveDetectResults(ctx.orderedStoryboards, ctx.sentenceItems, paragraphs, paragraphMetaByAnchor)

    const firstTitleMeta = ctx.orderedStoryboards
      .map(sb => parseNarrationImageMeta(sb.referenceImages))
      .find(meta => meta.narration_shot_type === 'title')
    const titleVisualHook = resolveTitleVisualHook(firstTitleMeta?.title_full, firstTitleMeta?.title_hook)
    const titleImageCount = countTitleImageAnchors(ctx.orderedStoryboards, paragraphs)
    const titleCount = ctx.orderedStoryboards.filter(
      sb => parseNarrationImageMeta(sb.referenceImages).narration_shot_type === 'title',
    ).length

    reportProgress({
      status: 'completed',
      phase: 'done',
      message: detectSource === 'llm'
        ? `换镜检测完成：${paragraphs.length} 张需配图`
        : `换镜检测完成（规则兜底）：${paragraphs.length} 张需配图`,
      percent: 100,
      paragraph_count: paragraphs.length,
      image_detect_source: detectSource,
    })

    return {
      step: 'detect',
      paragraph_count: paragraphs.length,
      image_needed_count: paragraphs.length,
      title_image_count: titleImageCount,
      title_hook: titleVisualHook,
      image_detect_source: detectSource,
      image_detect_at: Date.now(),
      image_detect_mode: imageDetectMode,
      body_storyboard_count: ctx.orderedStoryboards.length - titleCount,
    }
  } catch (err: any) {
    const message = String(err?.message || err || '配图换镜检测失败')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message,
      error: message,
    })
    throw err
  }
}

/** 第二步：根据已检测锚点，纯 LLM 生成六维配图文案（跳过已有文案，按批增量保存） */
export async function generateNarrationImagePromptsOnly(
  episodeId: number,
  style = 'comic',
  options?: NarrationImagePromptOptions,
) {
  return runNarrationImagePromptGeneration(episodeId, style, options)
}

/** @deprecated 请分步调用 detectNarrationImageAnchors + generateNarrationImagePromptsOnly */
export async function breakdownNarrationImages(
  episodeId: number,
  style = 'comic',
  imageDetectMode: ImageDetectMode = 'paragraph',
  options?: NarrationImageBreakdownOptions,
) {
  if (options?.retryMissingPrompts) {
    return retryMissingNarrationImagePrompts(episodeId, style, {
      textModel: options.textModel,
      textThinking: options.textThinking,
    })
  }
  const detect = await detectNarrationImageAnchors(episodeId, style, imageDetectMode, {
    textModel: options?.textModel,
    textThinking: options?.textThinking,
  })
  if (!detect.paragraph_count) return detect
  const prompts = await generateNarrationImagePromptsOnly(episodeId, style, {
    textModel: options?.textModel,
    textThinking: options?.textThinking,
  })
  return { ...detect, ...prompts, image_breakdown_at: Date.now() }
}
