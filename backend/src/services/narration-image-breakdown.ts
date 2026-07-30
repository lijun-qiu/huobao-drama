import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel } from '../constants/text-models.js'
import { resolveTitleVisualHook } from './narration-breakdown.js'
import {
  buildNarrationImageMeta,
  parseNarrationImageMeta,
  summarizeSceneMainContent,
  isStoryboardTitleShot,
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
  getNarrationImageBreakdownProgress,
  startNarrationImageBreakdownProgress,
  updateNarrationImageBreakdownProgress,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { loadEpisodeContinuityContext } from './episode-continuity.js'
import { usesMotionComicVisuals, parseProductionMode } from '../constants/production-mode.js'
import { resolveStoryboardNarrationText } from '../constants/motion-comic.js'
import { buildMotionComicAnchorMotionMeta, buildMotionComicSegmentMotionMeta } from './motion-comic-meta.js'
import { now } from '../utils/response.js'
import { llmGeneratedAt } from '../utils/llm-meta.js'
import { mergeStoryboardFluxPromptMeta } from './flux-storyboard-translate.js'
import { logTaskWarn } from '../utils/task-logger.js'

/** 配图/检测用正文：动态漫 description 是机位串时改用对白 */
function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  return resolveStoryboardNarrationText(sb)
}

function preserveShotMeta(existing: ReturnType<typeof parseNarrationImageMeta>) {
  const extra: Record<string, unknown> = {}
  if (existing.narration_shot_type) extra.narration_shot_type = existing.narration_shot_type
  if (existing.title_hook) extra.title_hook = existing.title_hook
  if (existing.title_full) extra.title_full = existing.title_full
  if (existing.subtitle_narration) extra.subtitle_narration = existing.subtitle_narration
  if (typeof existing.body_sentence_index === 'number') extra.body_sentence_index = existing.body_sentence_index
  if (existing.shot_role) extra.shot_role = existing.shot_role
  if (existing.motion_tier) extra.motion_tier = existing.motion_tier
  if (existing.camera_kind) extra.camera_kind = existing.camera_kind
  if (existing.vfx_kind) extra.vfx_kind = existing.vfx_kind
  if (existing.paragraph_layout) extra.paragraph_layout = existing.paragraph_layout
  if (existing.expression_action) extra.expression_action = existing.expression_action
  if (existing.scene_background) extra.scene_background = existing.scene_background
  return extra
}

function buildParagraphMotionMetaMap(
  paragraphs: NarrationParagraph[],
  orderedStoryboards: typeof schema.storyboards.$inferSelect[],
): Map<number, ReturnType<typeof buildMotionComicSegmentMotionMeta>> {
  const map = new Map<number, ReturnType<typeof buildMotionComicSegmentMotionMeta>>()
  for (const para of paragraphs) {
    const anchorSb = orderedStoryboards[para.startIndex]
    if (!anchorSb || isStoryboardTitleShot(anchorSb)) continue
    const motionMeta = buildMotionComicSegmentMotionMeta(para.sentences, para.index, {
      movement: anchorSb.movement,
      shotType: anchorSb.shotType,
      sceneContent: para.sceneDescription,
    })
    for (let i = para.startIndex; i <= para.endIndex; i++) {
      map.set(i, motionMeta)
    }
  }
  return map
}

function mergeMotionMetaIntoReferenceImages(
  imageMode: 'new' | 'inherit',
  base: Record<string, unknown>,
  motionMeta: ReturnType<typeof buildMotionComicAnchorMotionMeta>,
) {
  return buildNarrationImageMeta(imageMode, {
    ...base,
    shot_role: motionMeta.shot_role,
    motion_tier: motionMeta.motion_tier,
    camera_kind: motionMeta.camera_kind,
    vfx_kind: motionMeta.vfx_kind,
  })
}

function resolveDetectImageMode(isParagraphAnchor: boolean): 'new' | 'inherit' {
  return isParagraphAnchor ? 'new' : 'inherit'
}

export type NarrationImageBreakdownOptions = {
  /** ????????? image_prompt ????????? AI????????? */
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
  const paragraphPromptByAnchor = new Map<number, {
    content: string
    prompt: string
    layout: 'single' | 'diptych'
  }>()
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
  /** ???????????? 1 ????????? + batchSize ??? */
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
      throw new Error('?????? ?????')
    }
    if (missingWithoutMeta.length) {
      throw new Error(
        `?? #${missingWithoutMeta.join('?#')} ???????????????? ?????`,
      )
    }
    if (!pendingParagraphs.length && options?.testBatchIndex == null) {
      reportProgress({
        status: 'completed',
        phase: 'done',
        message: `?? ${allParagraphs.length} ????????`,
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
        image_prompt_at: now(),
        generated_at: llmGeneratedAt(),
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
        throw new Error(`?? ${testBatchIndex} ????? ${totalBatches} ??`)
      }
      // ?????????????????????????/???
      targetParagraphs = batchSlice
    }

    const batchCount = testBatchIndex != null
      ? 1
      : Math.max(1, Math.ceil(pendingParagraphs.length / promptBatchSize))
    const alreadyDone = allParagraphs.length - pendingParagraphs.length
    reportProgress({
      phase: 'prompts',
      message: testBatchIndex != null
        ? `?????? ${testBatchIndex}?${targetParagraphs.length} ??????`
        : alreadyDone > 0
          ? `?? ${pendingParagraphs.length} ??????????? ${alreadyDone}/${allParagraphs.length}?? ${batchCount} ???`
          : `???? ${pendingParagraphs.length} ??????? ${batchCount} ???`,
      percent: 12,
      paragraph_count: targetParagraphs.length,
      batch: testBatchIndex ?? undefined,
      batch_count: batchCount,
    })

    const genBatchSize = testBatchIndex != null ? targetParagraphs.length : promptBatchSize
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
        // ???????? JSON?????????????????
        textThinking: false,
        characters: ctx.episodeCharacters,
        fullNarrationLines: ctx.allSentences,
        previousEpisodeNarration: ctx.continuity.previousEpisodeNarration,
        onProgress: reportProgress,
        pureLlm: true,
        batchSize: genBatchSize,
        episodeId,
        inlineFluxEnglish: false,
        onBatchComplete: async ({ batch, promptsByStartIndex }) => {
          const anchorMap = buildPromptAnchorMap(
            targetParagraphs.filter(p => batch.some(item => item.startIndex === p.startIndex)),
            promptsByStartIndex,
          )
          const saved = savePromptAnchorsOnly(ctx, allParagraphs, anchorMap)
          const live = getNarrationImageBreakdownProgress(episodeId)
          const promptsSaved = Number(live?.prompts_saved || 0) + saved
          const seq = Number(live?.prompts_saved_seq || 0) + 1
          reportProgress({
            status: 'processing',
            phase: 'prompts',
            message: `?????????? ${promptsSaved} ?`,
            percent: Math.min(92, 15 + Math.round((promptsSaved / Math.max(1, targetParagraphs.length)) * 70)),
            prompts_saved: promptsSaved,
            prompts_saved_seq: seq,
            paragraph_count: targetParagraphs.length,
          })
        },
      },
    )

    if (!llmPrompts) throw new Error('配图 AI 未返回结果')

    const stillMissing = targetParagraphs.filter(
      para => !String(llmPrompts.promptsByStartIndex.get(para.startIndex) || '').trim(),
    )
    const savedNow = targetParagraphs.length - stillMissing.length
    if (stillMissing.length) {
      // 部分成功：不整任务失败，已落库的保留；前端点「补全缺失」即可
      const msg = testBatchIndex != null
        ? `测试批次 ${testBatchIndex} 仍有 ${stillMissing.length} 段缺 prompt`
        : `本轮已生成 ${savedNow} 段，仍有 ${stillMissing.length} 段失败已跳过；请点「补全缺失文案」继续`
      logTaskWarn('NarrationImageBreakdown', 'prompts-partial', {
        episodeId,
        savedNow,
        stillMissing: stillMissing.length,
        retryMissing: !!options?.retryMissing,
      })
      reportProgress({
        status: 'completed',
        phase: 'done',
        message: msg,
        percent: 100,
        paragraph_count: allParagraphs.length,
        prompts_saved: Number(getNarrationImageBreakdownProgress(episodeId)?.prompts_saved || 0),
        generated_at: llmGeneratedAt(),
      })
      return {
        step: 'prompts',
        paragraph_count: allParagraphs.length,
        image_needed_count: allParagraphs.length,
        prompts_generated: allParagraphs.length - stillMissing.length,
        image_prompt_source: 'llm_raw',
        image_prompt_at: now(),
        generated_at: llmGeneratedAt(),
        retry_missing_prompts: !!options?.retryMissing,
        prompts_updated: savedNow,
        prompts_missing: stillMissing.length,
        paragraphs_retried: options?.retryMissing ? pendingParagraphs.length : undefined,
        partial: true,
      }
    }

    reportProgress({
      status: 'completed',
      phase: 'done',
      message: testBatchIndex != null
        ? `测试批次 ${testBatchIndex} 已生成 ${targetParagraphs.length} 段文案`
        : options?.retryMissing
          ? `已补全 ${pendingParagraphs.length} 段配图文案`
          : `已生成 ${allParagraphs.length} 段配图文案`,
      percent: 100,
      paragraph_count: allParagraphs.length,
      generated_at: llmGeneratedAt(),
    })

    return {
      step: 'prompts',
      paragraph_count: allParagraphs.length,
      image_needed_count: allParagraphs.length,
      prompts_generated: allParagraphs.length,
      image_prompt_source: 'llm_raw',
      image_prompt_at: now(),
      generated_at: llmGeneratedAt(),
      retry_missing_prompts: !!options?.retryMissing,
      prompts_updated: pendingParagraphs.length,
      paragraphs_retried: options?.retryMissing ? pendingParagraphs.length : undefined,
    }
  } catch (err: any) {
    const message = String(err?.message || err || '????????')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message: message.includes('??????') ? message : `${message}????????????????????????`,
      error: message,
    })
    throw err
  }
}

/** ?????? AI ?????????????????????? */
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
  if (!orderedStoryboards.length) {
    throw new Error('????????')
  }

  const sentenceItems: NarrationSentenceItem[] = orderedStoryboards.map((sb) => {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const scriptParagraphIndex = typeof meta.script_paragraph_index === 'number'
      ? meta.script_paragraph_index
      : 0
    return {
      sentence: storyboardNarrationSentence(sb),
      dialogue: String(sb.dialogue || '').trim() || undefined,
      paragraphIndex: scriptParagraphIndex,
      isTitle: meta.narration_shot_type === 'title',
    }
  })

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const motionComicMode = usesMotionComicVisuals(parseProductionMode(drama?.metadata))

  return {
    ep,
    drama,
    motionComicMode,
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
  episodeId: number,
  orderedStoryboards: typeof schema.storyboards.$inferSelect[],
  sentenceItems: NarrationSentenceItem[],
  paragraphs: NarrationParagraph[],
  paragraphMetaByAnchor: Map<number, { content: string; layout: 'single' | 'diptych' }>,
  motionComicMode = false,
) {
  const ts = now()
  const paragraphMotionMap = motionComicMode
    ? buildParagraphMotionMetaMap(paragraphs, orderedStoryboards)
    : new Map()
  orderedStoryboards.forEach((sb, index) => {
    const paraInfo = paragraphMetaByAnchor.get(index)
    const isParagraphAnchor = !!paraInfo
    const para = paragraphs.find(p => p.startIndex === index)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const shotMeta = preserveShotMeta(existing)
    const imageMode = resolveDetectImageMode(isParagraphAnchor)
    const paragraphLayout = para?.layout || existing.paragraph_layout || 'single'
    const motionMeta = paragraphMotionMap.get(index) ?? null
    const refBase = {
      ...shotMeta,
      narration_tts_mode: isParagraphAnchor ? 'new' : 'inherit',
      script_paragraph_index: existing.script_paragraph_index ?? sentenceItems[index]?.paragraphIndex,
      scene_content: paraInfo?.content,
      narration_lines: para?.sentences,
      image_narration_lines: para ? mergeStoryboardLinesForImagePrompt(para.sentences) : undefined,
      paragraph_index: para?.index,
      paragraph_layout: paragraphLayout,
      image_prompt_source: undefined,
      image_prompt_llm_raw: undefined,
    }

    db.update(schema.storyboards)
      .set({
        imagePrompt: null,
        referenceImages: motionMeta
          ? mergeMotionMetaIntoReferenceImages(imageMode, refBase, motionMeta)
          : buildNarrationImageMeta(imageMode, refBase),
        ...(motionMeta ? { movement: motionMeta.movement, shotType: motionMeta.shotType } : {}),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
  })
}

function savePromptAnchorsOnly(
  ctx: ReturnType<typeof loadEpisodeStoryboardContext>,
  paragraphs: NarrationParagraph[],
  paragraphPromptByAnchor: Map<number, {
    content: string
    prompt: string
    layout: 'single' | 'diptych'
    fluxPromptEn?: string
  }>,
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

    let referenceImages = buildNarrationImageMeta('new', {
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
    })
    if (paraInfo.fluxPromptEn) {
      referenceImages = mergeStoryboardFluxPromptMeta(referenceImages, paraInfo.fluxPromptEn)
    }

    db.update(schema.storyboards)
      .set({
        imagePrompt: paraInfo.prompt,
        referenceImages,
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    linkStoryboardCharactersFromText(
      sb.id,
      [sentence, paraInfo.content, paraInfo.prompt].filter(Boolean).join('\n'),
      ctx.episodeCharacters,
      { dialogue: sb.dialogue, speakerPriority: ctx.motionComicMode },
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
  const paragraphMotionMap = ctx.motionComicMode
    ? buildParagraphMotionMetaMap(paragraphs, ctx.orderedStoryboards)
    : new Map()
  ctx.orderedStoryboards.forEach((sb, index) => {
    const paraInfo = paragraphPromptByAnchor.get(index)
    const isParagraphAnchor = !!paraInfo
    const para = paragraphs.find(p => p.startIndex === index)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const sentence = storyboardNarrationSentence(sb)
    const shotMeta = preserveShotMeta(existing)
    const motionMeta = paragraphMotionMap.get(index) ?? null
    const imageMode = isParagraphAnchor ? 'new' : 'inherit'
    const refBase = {
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
    }

    db.update(schema.storyboards)
      .set({
        imagePrompt: isParagraphAnchor ? (paraInfo?.prompt || null) : null,
        referenceImages: motionMeta
          ? mergeMotionMetaIntoReferenceImages(imageMode, refBase, motionMeta)
          : buildNarrationImageMeta(imageMode, refBase),
        ...(motionMeta ? { movement: motionMeta.movement, shotType: motionMeta.shotType } : {}),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    linkStoryboardCharactersFromText(
      sb.id,
      [sentence, paraInfo?.content, paraInfo?.prompt].filter(Boolean).join('\n'),
      ctx.episodeCharacters,
      { dialogue: sb.dialogue, speakerPriority: ctx.motionComicMode },
    )
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

/** ????LLM ?????????????????? */
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

    const resolved = await buildNarrationParagraphsAsync(ctx.sentenceItems, {
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
    const paragraphs = resolved.paragraphs
    const detectSource = resolved.detectSource

    const paragraphMetaByAnchor = new Map<number, { content: string; layout: 'single' | 'diptych' }>()
    paragraphs.forEach((para) => {
      const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
      paragraphMetaByAnchor.set(para.startIndex, {
        content: para.sceneDescription || summarizeSceneMainContent(imageLines),
        layout: para.layout,
      })
    })

    saveDetectResults(episodeId, ctx.orderedStoryboards, ctx.sentenceItems, paragraphs, paragraphMetaByAnchor, ctx.motionComicMode)

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
        ? `???????${paragraphs.length} ????`
        : `?????????????${paragraphs.length} ????`,
      percent: 100,
      paragraph_count: paragraphs.length,
      image_detect_source: detectSource,
      generated_at: llmGeneratedAt(),
    })

    return {
      step: 'detect',
      paragraph_count: paragraphs.length,
      image_needed_count: paragraphs.length,
      title_image_count: titleImageCount,
      title_hook: titleVisualHook,
      image_detect_source: detectSource,
      image_detect_at: now(),
      image_detect_mode: imageDetectMode,
      body_storyboard_count: ctx.orderedStoryboards.length - titleCount,
      generated_at: llmGeneratedAt(),
    }
  } catch (err: any) {
    const message = String(err?.message || err || '????????')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message,
      error: message,
    })
    throw err
  }
}

/** ????????????? LLM ??????????????????????? */
export async function generateNarrationImagePromptsOnly(
  episodeId: number,
  style = 'comic',
  options?: NarrationImagePromptOptions,
) {
  return runNarrationImagePromptGeneration(episodeId, style, options)
}

/** @deprecated ????? detectNarrationImageAnchors + generateNarrationImagePromptsOnly */
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
  return { ...detect, ...prompts, image_breakdown_at: now(), generated_at: llmGeneratedAt() }
}
