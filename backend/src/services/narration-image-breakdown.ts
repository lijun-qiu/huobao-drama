import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextThinking, resolveNarrationImageTextModel } from '../constants/text-models.js'
import { resolveTitleVisualHook } from './narration-breakdown.js'
import {
  buildNarrationImageMeta,
  parseNarrationImageMeta,
  summarizeSceneMainContent,
  isStoryboardTitleShot,
  type NarrationImageMeta,
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
  type NarrationImageBreakdownProgress,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { loadEpisodeContinuityContext } from './episode-continuity.js'
import { isNarrationVideoMode, usesMotionComicVisuals, parseProductionMode } from '../constants/production-mode.js'
import { resolveNovelComicPanelBeatsForEpisode } from '../constants/novel-comic.js'
import {
  resolveStoryboardNarrationText,
  resolveStoryboardVisualDescription,
  deriveMotionComicShotMetaFromImagePrompt,
} from '../constants/motion-comic.js'
import { buildMotionComicAnchorMotionMeta, buildMotionComicSegmentMotionMeta } from './motion-comic-meta.js'
import { now } from '../utils/response.js'
import { llmGeneratedAt } from '../utils/llm-meta.js'
import { mergeStoryboardFluxPromptMeta } from './flux-storyboard-translate.js'
import { logTaskWarn } from '../utils/task-logger.js'
import {
  enrichImagePromptWithEnvAssets,
  listEpisodeNarrationProps,
  listEpisodeNarrationScenes,
  matchPropsForDescription,
  resolveSceneForNarrationDescription,
  sceneLabelOf,
} from './narration-scene-assets.js'
import {
  formatCharacterPortraitLabel,
  resolveExpectedPortraitNamesForPrompt,
} from '../constants/portrait-appearance-spec.js'
import { NARRATION_FLUX_COMPACT_ART_STYLE_CN } from '../constants/flux-prompt-compact.js'
import {
  extractNarrationBeatCard,
  validateImagePromptBeatFidelity,
} from './narration-beat-fidelity.js'
import {
  buildToonflowStoryboardPrompt,
  validateToonflowPromptAgainstDescription,
  isToonflowStyleImagePrompt,
  type ToonflowAssetRef,
} from './toonflow-storyboard-prompt.js'

/** 配图/检测用正文：动态漫 description 是机位串时改用对白 */
function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  return resolveStoryboardNarrationText(sb)
}

/** 分镜已写入的画面描述（description / scene_content），优先于检测 LLM 新写的概括 */
function resolveAnchorVisualDescription(sb: {
  description?: string | null
  dialogue?: string | null
  referenceImages?: string | null
}): string | undefined {
  const fromDesc = resolveStoryboardVisualDescription(sb)
  if (fromDesc) return fromDesc
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const fromMeta = String(meta.scene_content || '').trim()
  return fromMeta || undefined
}

function applyStoryboardVisualDescriptions(
  paragraphs: NarrationParagraph[],
  orderedStoryboards: Array<{
    description?: string | null
    dialogue?: string | null
    referenceImages?: string | null
  }>,
): NarrationParagraph[] {
  return paragraphs.map((para) => {
    const sb = orderedStoryboards[para.startIndex]
    if (!sb) return para
    const visual = resolveAnchorVisualDescription(sb)
    if (!visual) return para
    return { ...para, sceneDescription: visual }
  })
}

function preserveShotMeta(existing: ReturnType<typeof parseNarrationImageMeta>): Partial<Omit<NarrationImageMeta, 'narration_image_mode'>> {
  const extra: Partial<Omit<NarrationImageMeta, 'narration_image_mode'>> = {}
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
  if (typeof existing.highlight_motion === 'boolean') extra.highlight_motion = existing.highlight_motion
  if (existing.highlight_reason) extra.highlight_reason = existing.highlight_reason
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
  base: Partial<Omit<NarrationImageMeta, 'narration_image_mode'>>,
  motionMeta: ReturnType<typeof buildMotionComicSegmentMotionMeta>,
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
    layout: meta.paragraph_layout === 'quad'
      ? 'quad'
      : meta.paragraph_layout === 'diptych'
        ? 'diptych'
        : 'single',
    sceneDescription: resolveAnchorVisualDescription(sb) || meta.scene_content || undefined,
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
    layout: 'single' | 'diptych' | 'quad'
  }>()
  for (const para of paragraphs) {
    const llmPrompt = String(promptsByStartIndex.get(para.startIndex) || '').trim()
    if (!llmPrompt) continue
    const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
    paragraphPromptByAnchor.set(para.startIndex, {
      content: para.sceneDescription || summarizeSceneMainContent(imageLines),
      prompt: llmPrompt,
      layout: para.layout,
    })
  }
  return paragraphPromptByAnchor
}

/** 为本段组装 Toonflow @图N 资产（有图才进槽位） */
function buildToonflowAssetsForParagraph(
  ctx: ReturnType<typeof loadEpisodeStoryboardContext>,
  para: NarrationParagraph,
): ToonflowAssetRef[] {
  const sb = ctx.orderedStoryboards[para.startIndex]
  if (!sb) return []
  const assets: ToonflowAssetRef[] = []
  const envScenes = listEpisodeNarrationScenes(ctx.ep.id)
  const envProps = listEpisodeNarrationProps(ctx.ep.id)
  const description = String(para.sceneDescription || '').trim()

  const scene = resolveSceneForNarrationDescription({
    description,
    sceneId: sb.sceneId,
    location: sb.location,
    episodeId: ctx.ep.id,
    scenes: envScenes,
  })
  if (scene) {
    assets.push({
      kind: 'scene',
      label: sceneLabelOf(scene),
      url: scene.imageUrl,
    })
  }

  const portraitNames = resolveExpectedPortraitNamesForPrompt({
    characters: ctx.episodeCharacters,
    dialogue: sb.dialogue,
    // 画面描述里的人名也要进定妆（旁白可能只有对白壳）
    narrationLines: [...para.sentences, description].filter(Boolean),
  })
  for (const name of portraitNames.slice(0, 2)) {
    const ch = ctx.episodeCharacters.find(c => String(c.name || '').trim() === name)
    if (!ch) continue
    const label = formatCharacterPortraitLabel(
      name,
      (ch as { variantLabel?: string | null }).variantLabel,
    )
    assets.push({
      kind: 'portrait',
      label,
      url: (ch as { imageUrl?: string | null }).imageUrl,
    })
  }

  // 只认画面描述里的道具，避免串镜误挂
  const hitProps = matchPropsForDescription(
    description,
    envProps.map(p => ({
      id: p.id,
      prop_label: p.name,
      has_prop_ref: !!String(p.imageUrl || '').trim(),
      description: String(p.description || p.prompt || ''),
    })),
  )
  for (const p of hitProps.slice(0, 4)) {
    const row = envProps.find(x => x.id === p.id)
    const url = String(row?.imageUrl || '').trim()
    if (!url) continue
    assets.push({
      kind: 'prop',
      label: p.prop_label,
      url,
    })
  }

  return assets
}

function convertParagraphToToonflowPrompt(
  ctx: ReturnType<typeof loadEpisodeStoryboardContext>,
  para: NarrationParagraph,
  style: string,
): string {
  const description = String(para.sceneDescription || '').trim()
  if (description.length < 12) return ''
  const styleAnchor = ctx.motionComicMode
    || /motion-comic|国漫|comic/i.test(String(style || ''))
    ? '16:9横屏短剧解说高清国漫，锋利细线稿硬边赛璐璐'
    : NARRATION_FLUX_COMPACT_ART_STYLE_CN
  const { prompt } = buildToonflowStoryboardPrompt({
    description,
    styleAnchor,
    assets: buildToonflowAssetsForParagraph(ctx, para),
    narrationLines: para.sentences,
  })
  return prompt
}

export type NarrationImagePromptOptions = {
  batchSize?: number
  /** 测试：只生成第 N 批（1 起算），每批大小为 batchSize */
  testBatchIndex?: number
  textModel?: string | null
  textThinking?: boolean | null
  onProgress?: NarrationImageBreakdownProgressCallback
  /** 小说漫画格字：short（默认）| full */
  panelTextMode?: 'short' | 'full' | null
  /**
   * 显式开启时才用画面描述做 Toonflow 忠实转换（旁路 LLM）。
   * 默认 false：一律 LLM，避免「清除文案后秒出 N 条」被当成缓存。
   */
  preferToonflow?: boolean
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
    let { allParagraphs, pendingParagraphs, missingWithoutMeta } = collectPendingParagraphs(ctx)

    // 解说视频一镜一图：拆镜后 meta 可能仍是 inherit；生成文案前自动补锚点，避免「请先检测」空跑
    if (!allParagraphs.length && ctx.narrationVideoMode && ctx.orderedStoryboards.length) {
      reportProgress({
        status: 'processing',
        phase: 'detecting',
        message: '解说视频：自动按分镜一镜一图写入配图锚点…',
        percent: 8,
        paragraph_count: ctx.orderedStoryboards.length,
      })
      const paragraphs = applyStoryboardVisualDescriptions(
        buildNarrationVideoOneToOneParagraphs(ctx.orderedStoryboards, ctx.sentenceItems),
        ctx.orderedStoryboards,
      )
      const paragraphMetaByAnchor = new Map<number, { content: string; layout: 'single' | 'diptych' | 'quad' }>()
      paragraphs.forEach((para) => {
        const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
        const anchorSb = ctx.orderedStoryboards[para.startIndex]
        const visual = anchorSb ? resolveAnchorVisualDescription(anchorSb) : undefined
        paragraphMetaByAnchor.set(para.startIndex, {
          content: visual || para.sceneDescription || summarizeSceneMainContent(imageLines),
          layout: para.layout,
        })
      })
      saveDetectResults(episodeId, ctx.orderedStoryboards, ctx.sentenceItems, paragraphs, paragraphMetaByAnchor, ctx.motionComicMode)
      // 重新读库后的镜头 meta
      const refreshed = loadEpisodeStoryboardContext(episodeId, {
        textModel: options?.textModel,
        textThinking: options?.textThinking,
      })
      Object.assign(ctx, refreshed)
      ;({ allParagraphs, pendingParagraphs, missingWithoutMeta } = collectPendingParagraphs(ctx))
    }

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

    const genBatchSize = testBatchIndex != null ? targetParagraphs.length : promptBatchSize

    // 默认一律 LLM。旧逻辑「画面描述 ≥12 字 → Toonflow 秒转落库」会在清除后瞬间写回多条，
    // 看起来像缓存，且与进度文案「纯 LLM 配图文案」不符。仅 preferToonflow 时启用。
    const toonParagraphs: NarrationParagraph[] = []
    const llmParagraphs: NarrationParagraph[] = []
    const preferToonflow = options?.preferToonflow === true
    for (const para of targetParagraphs) {
      const desc = String(para.sceneDescription || '').trim()
      if (preferToonflow && desc.length >= 12) toonParagraphs.push(para)
      else llmParagraphs.push(para)
    }

    let toonSaved = 0
    const toonSavedIndexes = new Set<number>()
    if (toonParagraphs.length) {
      reportProgress({
        status: 'processing',
        phase: 'prompts',
        message: `Toonflow 忠实转换 ${toonParagraphs.length} 段配图文案…`,
        percent: 14,
        paragraph_count: targetParagraphs.length,
      })
      const toonPrompts = new Map<number, string>()
      for (const para of toonParagraphs) {
        const prompt = convertParagraphToToonflowPrompt(ctx, para, style)
        if (!prompt) {
          llmParagraphs.push(para)
          continue
        }
        const check = validateToonflowPromptAgainstDescription(prompt, String(para.sceneDescription || ''))
        if (check.soft_reasons?.length) {
          logTaskWarn('NarrationImageBreakdown', 'toonflow-desc-fidelity-soft', {
            startIndex: para.startIndex,
            soft_reasons: check.soft_reasons,
          })
        }
        if (!check.ok) {
          logTaskWarn('NarrationImageBreakdown', 'toonflow-desc-fidelity', {
            startIndex: para.startIndex,
            reasons: check.hard_reasons.length ? check.hard_reasons : check.reasons,
          })
          // 硬缺项严重（缺【画面】/多项关键实体）才回退 LLM；软氛围不回退
          const hard = check.hard_reasons.length ? check.hard_reasons : check.reasons
          if (hard.some(r => /多项关键元素未保留|缺少【画面】|持物写成无人归属/.test(r))) {
            llmParagraphs.push(para)
            continue
          }
        }
        const beat = extractNarrationBeatCard(para.sentences)
        const beatCheck = validateImagePromptBeatFidelity(
          prompt,
          beat,
          para.sentences,
          { description: para.sceneDescription },
        )
        if (beatCheck.soft_reasons?.length) {
          logTaskWarn('NarrationImageBreakdown', 'toonflow-beat-fidelity-soft', {
            startIndex: para.startIndex,
            soft_reasons: beatCheck.soft_reasons,
          })
        }
        if (!beatCheck.ok) {
          logTaskWarn('NarrationImageBreakdown', 'toonflow-beat-fidelity', {
            startIndex: para.startIndex,
            reasons: beatCheck.reasons,
          })
          // 硬：持物桌面陈设 / 左右手写反 / 持物缺失 → 回退 LLM
          if (beatCheck.reasons.some(r => /桌面陈设|左手|右手|持物|核心动作/.test(r))) {
            llmParagraphs.push(para)
            continue
          }
        }
        toonPrompts.set(para.startIndex, prompt)
      }
      if (toonPrompts.size) {
        const anchorMap = buildPromptAnchorMap(
          toonParagraphs.filter(p => toonPrompts.has(p.startIndex)),
          toonPrompts,
        )
        toonSaved = savePromptAnchorsOnly(ctx, allParagraphs, anchorMap, { imagePromptSource: 'toonflow' })
        for (const [idx, prompt] of toonPrompts) {
          toonSavedIndexes.add(idx)
          const sb = ctx.orderedStoryboards[idx]
          if (sb) sb.imagePrompt = prompt
        }
        reportProgress({
          status: 'processing',
          phase: 'prompts',
          message: `已落库 Toonflow 文案 ${toonSaved} 条`,
          percent: Math.min(40, 15 + Math.round((toonSaved / Math.max(1, targetParagraphs.length)) * 25)),
          prompts_saved: toonSaved,
          paragraph_count: targetParagraphs.length,
        })
      }
    }

    const llmTargets = llmParagraphs.filter(
      (p, i, arr) => arr.findIndex(x => x.startIndex === p.startIndex) === i
        && !toonSavedIndexes.has(p.startIndex),
    )

    let llmPrompts: { promptsByStartIndex: Map<number, string> } | null = {
      promptsByStartIndex: new Map(),
    }
    if (llmTargets.length) {
      llmPrompts = await generateParagraphImagePromptsWithLLM(
        llmTargets.map(para => ({
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
          // 配图文案强制关 thinking，并禁止 json_object（free 模型会 INVALID_REQUEST_BODY）
          textThinking: false,
          characters: ctx.episodeCharacters,
          fullNarrationLines: ctx.allSentences,
          previousEpisodeNarration: ctx.continuity.previousEpisodeNarration,
          panelBeats: ctx.panelBeats,
          panelTextMode: options?.panelTextMode,
          onProgress: reportProgress,
          pureLlm: true,
          batchSize: genBatchSize,
          episodeId,
          inlineFluxEnglish: false,
          onBatchComplete: async ({ batch, promptsByStartIndex }) => {
            const anchorMap = buildPromptAnchorMap(
              llmTargets.filter(p => batch.some(item => item.startIndex === p.startIndex)),
              promptsByStartIndex,
            )
            const saved = savePromptAnchorsOnly(ctx, allParagraphs, anchorMap, { imagePromptSource: 'llm_raw' })
            const live = getNarrationImageBreakdownProgress(episodeId)
            const promptsSaved = Number(live?.prompts_saved || 0) + saved
            const seq = Number(live?.prompts_saved_seq || 0) + 1
            reportProgress({
              status: 'processing',
              phase: 'prompts',
              message: `已落库配图文案 ${promptsSaved} 条`,
              percent: Math.min(92, 15 + Math.round((promptsSaved / Math.max(1, targetParagraphs.length)) * 70)),
              prompts_saved: promptsSaved,
              prompts_saved_seq: seq,
              paragraph_count: targetParagraphs.length,
            })
          },
        },
      )
    }

    if (!llmPrompts && !toonSaved) throw new Error('配图 AI 未返回结果')

    const stillMissing = targetParagraphs.filter((para) => {
      if (toonSavedIndexes.has(para.startIndex)) return false
      const sb = ctx.orderedStoryboards[para.startIndex]
      if (String(sb?.imagePrompt || '').trim()) return false
      return !String(llmPrompts?.promptsByStartIndex.get(para.startIndex) || '').trim()
    })
    const savedNow = targetParagraphs.length - stillMissing.length
    const promptSourceLabel = toonSaved > 0 && !llmTargets.length
      ? 'toonflow'
      : toonSaved > 0
        ? 'toonflow+llm_raw'
        : 'llm_raw'
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
        image_prompt_source: promptSourceLabel,
        image_prompt_at: now(),
        generated_at: llmGeneratedAt(),
        retry_missing_prompts: !!options?.retryMissing,
        prompts_updated: savedNow,
        prompts_missing: stillMissing.length,
        paragraphs_retried: options?.retryMissing ? pendingParagraphs.length : undefined,
        partial: true,
        toonflow_saved: toonSaved,
      }
    }

    reportProgress({
      status: 'completed',
      phase: 'done',
      message: testBatchIndex != null
        ? `测试批次 ${testBatchIndex} 已生成 ${targetParagraphs.length} 段文案${toonSaved ? `（Toonflow ${toonSaved}）` : ''}`
        : options?.retryMissing
          ? `已补全 ${pendingParagraphs.length} 段配图文案${toonSaved ? `（Toonflow ${toonSaved}）` : ''}`
          : `已生成 ${allParagraphs.length} 段配图文案${toonSaved ? `（Toonflow ${toonSaved}）` : ''}`,
      percent: 100,
      paragraph_count: allParagraphs.length,
      generated_at: llmGeneratedAt(),
    })

    return {
      step: 'prompts',
      paragraph_count: allParagraphs.length,
      image_needed_count: allParagraphs.length,
      prompts_generated: allParagraphs.length,
      image_prompt_source: promptSourceLabel,
      image_prompt_at: now(),
      generated_at: llmGeneratedAt(),
      retry_missing_prompts: !!options?.retryMissing,
      prompts_updated: pendingParagraphs.length,
      paragraphs_retried: options?.retryMissing ? pendingParagraphs.length : undefined,
      toonflow_saved: toonSaved,
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
  if (!orderedStoryboards.length) {
    throw new Error('请先完成旁白分镜')
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
  const panelBeats = resolveNovelComicPanelBeatsForEpisode(drama?.metadata, ep.episodeNumber)

  const productionMode = parseProductionMode(drama?.metadata)

  return {
    ep,
    drama,
    productionMode,
    narrationVideoMode: isNarrationVideoMode(productionMode),
    motionComicMode,
    panelBeats,
    orderedStoryboards,
    sentenceItems,
    allSentences: sentenceItems.map(item => item.sentence),
    continuity: loadEpisodeContinuityContext(episodeId),
    textModel: resolveNarrationImageTextModel(ep, options?.textModel),
    textThinking: resolveEpisodeTextThinking(ep, options?.textThinking),
    episodeCharacters: getEpisodeVisualCharacters(episodeId, ep.dramaId),
  }
}

/** 解说视频：分镜脚本已按镜拆好，配图一镜一锚点，不再合并 2～4 镜 */
function buildNarrationVideoOneToOneParagraphs(
  orderedStoryboards: typeof schema.storyboards.$inferSelect[],
  sentenceItems: NarrationSentenceItem[],
): NarrationParagraph[] {
  return sentenceItems.map((item, index) => {
    const sb = orderedStoryboards[index]
    const visual = sb ? resolveAnchorVisualDescription(sb) : undefined
    const sentence = String(item.sentence || '').trim()
    return {
      index,
      startIndex: index,
      endIndex: index,
      sentences: sentence ? [sentence] : [],
      layout: 'single' as const,
      sceneDescription: visual || sentence || undefined,
    }
  })
}

function saveDetectResults(
  episodeId: number,
  orderedStoryboards: typeof schema.storyboards.$inferSelect[],
  sentenceItems: NarrationSentenceItem[],
  paragraphs: NarrationParagraph[],
  paragraphMetaByAnchor: Map<number, { content: string; layout: 'single' | 'diptych' | 'quad' }>,
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
    const refBase: Partial<Omit<NarrationImageMeta, 'narration_image_mode'>> = {
      ...shotMeta,
      narration_tts_mode: isParagraphAnchor ? 'new' : 'inherit',
      script_paragraph_index: existing.script_paragraph_index ?? sentenceItems[index]?.paragraphIndex,
      scene_content: paraInfo?.content,
      narration_lines: para?.sentences,
      image_narration_lines: para ? mergeStoryboardLinesForImagePrompt(para.sentences) : undefined,
      paragraph_index: para?.index,
      paragraph_layout: paragraphLayout,
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
    layout: 'single' | 'diptych' | 'quad'
    fluxPromptEn?: string
  }>,
  options?: { imagePromptSource?: 'llm_raw' | 'toonflow' },
) {
  if (!paragraphPromptByAnchor.size) return 0
  const ts = now()
  let saved = 0
  const promptSource = options?.imagePromptSource || 'llm_raw'

  const envScenes = listEpisodeNarrationScenes(ctx.ep.id)
  const envProps = listEpisodeNarrationProps(ctx.ep.id)

  for (const [startIndex, paraInfo] of paragraphPromptByAnchor) {
    const sb = ctx.orderedStoryboards[startIndex]
    if (!sb) continue
    const para = paragraphs.find(p => p.startIndex === startIndex)
    const existing = parseNarrationImageMeta(sb.referenceImages)
    const sentence = storyboardNarrationSentence(sb)
    const shotMeta = preserveShotMeta(existing)
    // Toonflow 格式（含 LLM 按规则生成）已含对照/@图N；勿再 enrich 灌场景 bible
    const rawPrompt = String(paraInfo.prompt || '').trim()
    const enrichedPrompt = promptSource === 'toonflow' || isToonflowStyleImagePrompt(rawPrompt)
      ? rawPrompt
      : enrichImagePromptWithEnvAssets(rawPrompt, {
        ...sb,
        referenceImages: sb.referenceImages,
      }, { scenes: envScenes, props: envProps })

    const panelTextModeFromPrompt = /【格字模式：长文画字】/.test(enrichedPrompt)
      ? 'full' as const
      : /【格字模式：短字叠字】|文字由后期叠字|框内留白勿绘/.test(enrichedPrompt)
        ? 'short' as const
        : existing.panel_text_mode
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
      image_prompt_source: promptSource,
      image_prompt_llm_raw: paraInfo.prompt,
      panel_text_mode: panelTextModeFromPrompt,
    })
    if (paraInfo.fluxPromptEn) {
      referenceImages = mergeStoryboardFluxPromptMeta(referenceImages, paraInfo.fluxPromptEn)
    }

    const derived = ctx.motionComicMode
      ? deriveMotionComicShotMetaFromImagePrompt(enrichedPrompt)
      : null

    db.update(schema.storyboards)
      .set({
        imagePrompt: enrichedPrompt,
        referenceImages,
        ...(derived
          ? {
            description: derived.description,
            location: derived.location,
            shotType: derived.shotType,
            angle: derived.angle,
            movement: derived.movement,
            action: derived.expressionAction,
          }
          : {}),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    linkStoryboardCharactersFromText(
      sb.id,
      [sentence, paraInfo.content, enrichedPrompt].filter(Boolean).join('\n'),
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
  paragraphPromptByAnchor: Map<number, { content: string; prompt: string; layout: 'single' | 'diptych' | 'quad' }>,
) {
  const ts = now()
  const envScenes = listEpisodeNarrationScenes(ctx.ep.id)
  const envProps = listEpisodeNarrationProps(ctx.ep.id)
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
    const rawPrompt = isParagraphAnchor ? String(paraInfo?.prompt || '').trim() : ''
    const enrichedPrompt = rawPrompt
      ? enrichImagePromptWithEnvAssets(rawPrompt, sb, { scenes: envScenes, props: envProps })
      : ''
    const refBase: Partial<Omit<NarrationImageMeta, 'narration_image_mode'>> = {
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

    const derived = ctx.motionComicMode && isParagraphAnchor && enrichedPrompt
      ? deriveMotionComicShotMetaFromImagePrompt(enrichedPrompt)
      : null

    db.update(schema.storyboards)
      .set({
        imagePrompt: isParagraphAnchor ? (enrichedPrompt || null) : null,
        referenceImages: motionMeta
          ? mergeMotionMetaIntoReferenceImages(imageMode, refBase, motionMeta)
          : buildNarrationImageMeta(imageMode, refBase),
        ...(motionMeta ? { movement: motionMeta.movement, shotType: motionMeta.shotType } : {}),
        ...(derived
          ? {
            description: derived.description,
            location: derived.location,
            shotType: derived.shotType,
            angle: derived.angle,
            movement: derived.movement,
            action: derived.expressionAction,
          }
          : {}),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    linkStoryboardCharactersFromText(
      sb.id,
      [sentence, paraInfo?.content, enrichedPrompt || paraInfo?.prompt].filter(Boolean).join('\n'),
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

    let paragraphs: NarrationParagraph[]
    let detectSource: string

    if (ctx.narrationVideoMode) {
      reportProgress({
        status: 'processing',
        phase: 'detecting',
        message: '解说视频：按分镜脚本一镜一图（不再合并分段）…',
        percent: 40,
      })
      paragraphs = applyStoryboardVisualDescriptions(
        buildNarrationVideoOneToOneParagraphs(ctx.orderedStoryboards, ctx.sentenceItems),
        ctx.orderedStoryboards,
      )
      detectSource = 'one_to_one'
    } else {
      const resolved = await buildNarrationParagraphsAsync(ctx.sentenceItems, {
        imageDetectMode,
        textModel: ctx.textModel,
        textThinking: ctx.textThinking,
        style,
        fullNarrationLines: ctx.allSentences,
        previousEpisodeNarration: ctx.continuity.previousEpisodeNarration,
        panelBeats: ctx.panelBeats,
        detectBatchThreshold: batchOptions?.batchThreshold,
        detectBatchSize: batchOptions?.batchSize,
        onDetectProgress: reportProgress,
      })
      paragraphs = applyStoryboardVisualDescriptions(resolved.paragraphs, ctx.orderedStoryboards)
      detectSource = resolved.detectSource
    }

    const paragraphMetaByAnchor = new Map<number, { content: string; layout: 'single' | 'diptych' | 'quad' }>()
    paragraphs.forEach((para) => {
      const imageLines = mergeStoryboardLinesForImagePrompt(para.sentences)
      const anchorSb = ctx.orderedStoryboards[para.startIndex]
      const visual = anchorSb ? resolveAnchorVisualDescription(anchorSb) : undefined
      paragraphMetaByAnchor.set(para.startIndex, {
        content: visual || para.sceneDescription || summarizeSceneMainContent(imageLines),
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
      message: detectSource === 'one_to_one'
        ? `已按分镜一镜一图：${paragraphs.length} 镜`
        : detectSource === 'llm'
          ? `检测完成：${paragraphs.length} 个配图锚点`
          : `规则检测完成：${paragraphs.length} 个配图锚点`,
      percent: 100,
      paragraph_count: paragraphs.length,
      image_detect_source: detectSource as NarrationImageBreakdownProgress['image_detect_source'],
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
      image_detect_mode: ctx.narrationVideoMode ? 'one_to_one' : imageDetectMode,
      body_storyboard_count: ctx.orderedStoryboards.length - titleCount,
      generated_at: llmGeneratedAt(),
    }
  } catch (err: any) {
    const message = String(err?.message || err || '配图检测失败')
    updateNarrationImageBreakdownProgress(episodeId, {
      status: 'failed',
      phase: 'error',
      message,
      error: message,
    })
    throw err
  }
}

/** 第二步：根据已检测锚点，纯 LLM 生成配图文案（跳过已有文案，按批增量保存） */
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
  return { ...detect, ...prompts, image_breakdown_at: now(), generated_at: llmGeneratedAt() }
}
