import { assertTextConfigHasCredentials, getTextConfig, textConfigHasCredentials } from './ai.js'
import { callTextChat, resolveOllamaNumCtx } from './text-chat.js'
import { resolveCharacterGenderLabelCn } from './comfyui-client.js'
import {
  buildPortraitAppearanceSpecFromCharacter,
  formatCharacterPortraitLabel,
  injectPortraitSpecIntoImagePromptCn,
  resolveExpectedPortraitNamesForPrompt,
  resolveMotionComicOnScreenPortraitNames,
  validateImagePromptPortraitLabels,
} from '../constants/portrait-appearance-spec.js'
import { PORTRAIT_STORYBOARD_OUTFIT_LLM_RULE, extractPortraitDistinctCueCn } from '../constants/portrait-reference.js'
import {
  compressFullNarrationLines,
  compressTimelineNarrationLines,
  buildNarrationImageDetectLLMSystem,
  buildNarrationParagraphImagePromptLLMSystem,
  buildNarrationSceneSegmentsImagePromptLLMSystem,
  buildNarrationTitleImagePromptLLMSystem,
  buildMinimalPortraitPostureHint,
  coerceMinimalCharacterAppearance,
  detectNarrationWeightArcTheme,
  extractNarrationBodyStageFromText,
  formatNarrationBodyWeightSpec,
  inferParagraphBodyWeightTier,
  usesNarrationNaturalBodyLock,
  isNarrationAnimeStyle,
  resolveLLMImagePrompt,
  repairNarrationFaceCloseupVsActionPrompt,
  repairNarrationStandingFullBodyPrompt,
  isNarrationDateOnlySentence,
  isNarrationMinimalStyle,
  NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
  NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
  NARRATION_IMAGE_DETECT_BATCH_THRESHOLD_DEFAULT,
  NARRATION_IMAGE_DETECT_BATCH_SIZE_DEFAULT,
  NARRATION_IMAGE_PROMPT_BATCH_SIZE_DEFAULT,
  NARRATION_IMAGE_PROMPT_BATCH_SIZE_MIN,
  NARRATION_IMAGE_PROMPT_BATCH_SIZE_MAX,
  NARRATION_IMAGE_PROMPT_BATCH_CONCURRENCY_DEFAULT,
  NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
  NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
} from '../constants/art-styles.js'
import {
  isMotionComicStyle,
  MOTION_COMIC_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
  MOTION_COMIC_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
  MOTION_COMIC_IMAGE_DETECT_TARGET_STORYBOARD_RATIO,
  MOTION_COMIC_IMAGE_SEGMENT_MIN_SHOTS,
  MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS,
  MOTION_COMIC_IMAGE_PROMPT_MIN_LEN,
  MOTION_COMIC_PORTRAIT_OUTFIT_LLM_RULE,
  repairMotionComicContinuousImagePrompt,
  buildMotionComicShotCard,
  isMotionComicStandPoseShellPrompt,
  isMotionComicEmotionWithoutCloseupPrompt,
} from '../constants/motion-comic.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import {
  calcPromptBatchPercent,
  calcDetectBatchPercent,
  assertNarrationImageBreakdownNotCancelled,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { buildPriorNarrationLines } from './episode-continuity.js'
import { buildNarrationSceneEnrichment } from './narration-scene-enrichment.js'
import { ensureLocalModelStage, unloadOllamaModel } from './local-model-manager.js'

/** 场景段配图 prompt（单次调用）超时 */
const SCENE_SEGMENTS_PROMPT_LLM_TIMEOUT_MS = 300_000

export function resolveParagraphPromptBatchSize(batchSize?: number): number {
  if (batchSize == null || !Number.isFinite(batchSize)) {
    return NARRATION_IMAGE_PROMPT_BATCH_SIZE_DEFAULT
  }
  return Math.min(
    NARRATION_IMAGE_PROMPT_BATCH_SIZE_MAX,
    Math.max(NARRATION_IMAGE_PROMPT_BATCH_SIZE_MIN, Math.round(batchSize)),
  )
}

/** 配图段落 prompt：单批 LLM 超时下限（毫秒） */
const PARAGRAPH_PROMPT_LLM_TIMEOUT_MIN_MS = 600_000

/** 配图段落 prompt：单批 LLM 超时上限（毫秒） */
const PARAGRAPH_PROMPT_LLM_TIMEOUT_MAX_MS = 1_800_000

/** 每段配图估算 LLM 耗时（毫秒），用于按批内段数缩放超时 */
const PARAGRAPH_PROMPT_LLM_TIMEOUT_PER_PARAGRAPH_MS = 45_000

/** 单批失败重试次数 */
const PARAGRAPH_PROMPT_LLM_BATCH_RETRIES = 2

/** 批次之间的间隔（毫秒），减轻上游限流（串行模式）；并发模式下仅作启动错峰 */
const PARAGRAPH_PROMPT_LLM_BATCH_GAP_MS = 600

/** 云端配图文案批并发；本地 Ollama 强制 1 */
const PARAGRAPH_PROMPT_LLM_BATCH_CONCURRENCY = NARRATION_IMAGE_PROMPT_BATCH_CONCURRENCY_DEFAULT

/** 送给配图 LLM 的 prior 最近原句条数（更早内容压成一条 timeline 摘要） */
const PARAGRAPH_PROMPT_PRIOR_LLM_TAIL_LINES = 16

/** 压缩 previous_episode / 过长 prior，避免后期批上下文=全文两遍 */
function slimNarrationLinesForPromptLlm(lines: string[], tailLines = PARAGRAPH_PROMPT_PRIOR_LLM_TAIL_LINES): string[] {
  const clean = (lines || []).map(s => String(s || '').trim()).filter(Boolean)
  if (clean.length <= tailLines) return clean
  const earlier = compressTimelineNarrationLines(clean, clean.length - tailLines)
  const tail = clean.slice(-tailLines)
  return earlier ? [`[earlier] ${earlier}`, ...tail] : tail
}

/** 六维配图文案 JSON 每段约 2～3k token；给足 num_predict 避免 Ollama 默认截断 */
function resolveParagraphPromptMaxTokens(batchParagraphCount: number): number {
  const perParagraph = 3_200
  const min = 12_000
  const max = 24_000
  return Math.min(max, Math.max(min, batchParagraphCount * perParagraph))
}

function resolveParagraphPromptLLMTimeoutMs(batchParagraphCount: number, attempt = 1): number {
  const scaled = Math.max(
    PARAGRAPH_PROMPT_LLM_TIMEOUT_MIN_MS,
    batchParagraphCount * PARAGRAPH_PROMPT_LLM_TIMEOUT_PER_PARAGRAPH_MS,
  )
  const withRetry = attempt > 1 ? Math.round(scaled * 1.25) : scaled
  return Math.min(PARAGRAPH_PROMPT_LLM_TIMEOUT_MAX_MS, withRetry)
}

function isLLMTimeoutError(message: string): boolean {
  return /timeout|aborted due to timeout/i.test(message)
}

/** 智谱等云端瞬态限流 / 网关错误，可退避重试 */
function isLLMTransientProviderError(message: string): boolean {
  return /Text API error (429|502|503)|访问量过大|速率限制|rate.?limit|too many requests|temporarily unavailable|服务繁忙|系统繁忙/i.test(
    message,
  )
}

function isLLMRetryableError(message: string): boolean {
  return isLLMTimeoutError(message) || isLLMTransientProviderError(message)
}

/** 换镜检测 LLM 超时下限（毫秒） */
const IMAGE_DETECT_LLM_TIMEOUT_MIN_MS = 240_000

/** 换镜检测 LLM 超时上限（毫秒） */
const IMAGE_DETECT_LLM_TIMEOUT_MAX_MS = 900_000

/** 每个检测单元估算耗时（毫秒），用于按镜头数缩放超时 */
const IMAGE_DETECT_LLM_TIMEOUT_PER_UNIT_MS = 4_500

const IMAGE_DETECT_LLM_BATCH_RETRIES = 2
/** 检测分批之间留空，降低智谱免费配额 429 */
const IMAGE_DETECT_LLM_BATCH_GAP_MS = 900

function resolveDetectLLMTimeoutMs(detectUnitCount: number, attempt = 1): number {
  const scaled = Math.max(
    IMAGE_DETECT_LLM_TIMEOUT_MIN_MS,
    detectUnitCount * IMAGE_DETECT_LLM_TIMEOUT_PER_UNIT_MS,
  )
  const withRetry = attempt > 1 ? Math.round(scaled * 1.25) : scaled
  return Math.min(IMAGE_DETECT_LLM_TIMEOUT_MAX_MS, withRetry)
}

/** 片头标题图 prompt LLM 超时（毫秒） */
const TITLE_IMAGE_PROMPT_LLM_TIMEOUT_MS = 180_000

/** 配图段分批：按固定段数切批，尾批不足 batchSize 也单独成批 */
function chunkParagraphPromptBatch<T>(items: T[], batchSize: number): T[][] {
  if (!items.length) return []
  const size = resolveParagraphPromptBatchSize(batchSize)
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export type NarrationSentenceItem = {
  sentence: string
  paragraphIndex: number
  /** 分镜原始对白（含说话人前缀），动态漫配图检测用 */
  dialogue?: string | null
  /** 片头标题镜（检测时连续片头句合并为一个 LLM 单元） */
  isTitle?: boolean
}

export type NarrationDetectUnit = {
  /** 1-based，与 LLM 输入/输出 index 一致 */
  detectIndex: number
  /** 对应 storyboard 在 items 数组中的下标 */
  storyboardIndices: number[]
  text: string
  isTitleGroup?: boolean
}

export type NarrationDetectLLMResult = {
  needs: boolean[]
  segmentDescriptions: Map<number, string>
}

export type DetectImageNeedsOptions = {
  /** 超过该镜头数时分批；0=不分批；默认 80 */
  batchThreshold?: number
  /** 每批覆盖的镜头数；默认 40 */
  batchSize?: number
  onProgress?: NarrationImageBreakdownProgressCallback
}

export type NarrationSceneSegment = {
  anchorIndex: number
  endIndex: number
  sentences: string[]
}

export type ImageDetectMode = 'paragraph' | 'conservative' | 'balanced'

type ImageSegmentBounds = {
  minShots: number
  maxShots: number
  minRatio: number
  maxRatio: number
  /** 后处理优先拉到的目标密度；缺省则只保证 min～max */
  targetRatio?: number
}

function resolveImageSegmentBounds(style?: string | null): ImageSegmentBounds {
  if (isMotionComicStyle(style)) {
    return {
      minShots: MOTION_COMIC_IMAGE_SEGMENT_MIN_SHOTS,
      maxShots: MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS,
      minRatio: MOTION_COMIC_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
      maxRatio: MOTION_COMIC_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
      targetRatio: MOTION_COMIC_IMAGE_DETECT_TARGET_STORYBOARD_RATIO,
    }
  }
  return {
    minShots: NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
    maxShots: NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
    minRatio: NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
    maxRatio: NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
  }
}

/** 强场景切换：地点/时间明显跳转 */
const STRONG_SCENE_SHIFT_RE = /来到|走(进|向|出|到)|跑进|冲进|踏入|进入|离开|走出|返回|回到|抵达|赶到|第二天|翌日|次日|多年后|数年后|几年后|几小时后|清晨|黎明|黄昏|傍晚|夜里|深夜|天亮|小时候|闪回|回忆|镜头一转|画面一转|另一边|另一处|转场|切换|与此同时/
const SCENE_SHIFT_RE = /路过|推开|打开|转入|同一时间|不久后|片刻后|随即|来到|走(进|向|出|到)|进入|离开|返回|回到|抵达|第二天|翌日|清晨|黄昏|夜里|闪回|转场|切换/
const SCENE_OPENING_RE = /^(在|于|当|随着|这时|此时|只见|眼前|身后|门口|屋里|室内|室外|大街上|[^，,]{2,16}(里|中|外|内|旁|边|前|后|上|下))[，,]/
const BEAT_SHIFT_RE = /然而|但是|可是|与此同时|另一边|同时|接着|随后|就在这时|不料|突然|转眼/

/** 配图换景：地点/经营阶段关键词（同段内出现新标签则开新图） */
const IMAGE_LOCATION_TAGS: Array<[RegExp, string]> = [
  [/供销社/, '供销社'],
  [/批发市场|在批发|批了一车/, '批发市场'],
  [/夜市|摆地摊|地摊|去县城的?夜市/, '夜市'],
  [/固定摊位|从地摊摆/, '固定摊位'],
  [/门面|租了|开店铺|店铺|两家店|箱包|临街/, '店铺'],
  [/婚礼|娶了|提亲|洞房|十里八乡/, '婚礼'],
  [/彩色电视|固定电话|串门|走到哪|高看一眼/, '家里'],
  [/雇了|店员|老板|下岗|喝茶/, '经营'],
  [/万元户/, '成功'],
  [/改革开放|敢闯/, '创业'],
]

function getImageLocationTags(text: string): string[] {
  const tags: string[] = []
  for (const [re, tag] of IMAGE_LOCATION_TAGS) {
    if (re.test(text) && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/** 分镜/TTS：句末标点（。！？）必拆 */
export const STORYBOARD_STRONG_PUNCT_BOUNDARY_RE = /(?<=[。！？!?])\s*/
/** 分镜/TTS：逗号/顿号/分号仅当相邻片段合计超过 {@link STORYBOARD_COMMA_MERGE_MAX_CHARS} 字才拆 */
export const STORYBOARD_WEAK_PUNCT_BOUNDARY_RE = /(?<=[，、；,;])\s*/
/** @deprecated 使用 STORYBOARD_STRONG/WEAK_PUNCT_BOUNDARY_RE */
export const STORYBOARD_PUNCT_BOUNDARY_RE = STORYBOARD_STRONG_PUNCT_BOUNDARY_RE
/** 逗号/顿号/分号相邻片段合计不超过此字数则合并为一镜 */
export const STORYBOARD_COMMA_MERGE_MAX_CHARS = 16
/** 配图 prompt：仅在句号级标点拆，同段旁白合并写连贯【场景】【剧情】 */
export const IMAGE_PROMPT_PUNCT_BOUNDARY_RE = /(?<=[。！？])\s*/

function trimNarrationPart(s: string): string {
  return s.replace(/^[，,、；;\s]+|[，,、；;\s]+$/g, '').trim()
}

function narrationCharCount(text: string): number {
  return text.replace(/[\s，,、；;。！？!?]/g, '').length
}

function splitByPunctBoundary(chunk: string, boundaryRe: RegExp): string[] {
  const parts = chunk
    .split(boundaryRe)
    .map(trimNarrationPart)
    .filter(Boolean)
  return parts.length ? parts : [chunk.trim()]
}

/** 弱标点切分后，相邻片段合计 ≤ maxChars 则合并为一镜 */
function mergeWeakPunctParts(parts: string[], maxChars = STORYBOARD_COMMA_MERGE_MAX_CHARS): string[] {
  if (parts.length <= 1) return parts
  const merged: string[] = []
  let current = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i]
    if (narrationCharCount(current) + narrationCharCount(next) <= maxChars) {
      current = `${current}，${next}`
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)
  return merged
}

function splitNarrationChunk(chunk: string): string[] {
  const flat = chunk.replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const strongParts = splitByPunctBoundary(flat, STORYBOARD_STRONG_PUNCT_BOUNDARY_RE)
  const result: string[] = []

  for (const strongPart of strongParts) {
    const weakParts = splitByPunctBoundary(strongPart, STORYBOARD_WEAK_PUNCT_BOUNDARY_RE)
    result.push(...(weakParts.length > 1 ? mergeWeakPunctParts(weakParts) : weakParts))
  }

  return result.length ? result : [flat]
}

/** 配图段旁白：保留分镜短句，按场景拆段后逐句生成【剧情】（不再整段合并成一大块） */
export function mergeStoryboardLinesForImagePrompt(lines: string[]): string[] {
  return lines.map(s => String(s || '').trim()).filter(Boolean)
}

/** 分镜拆句：句末标点必拆；逗号/顿号/分号仅当相邻合计超过 16 字才拆，用于 TTS/时间轴 */
export function splitNarrationSentencesWithMeta(text: string): NarrationSentenceItem[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
  const result: NarrationSentenceItem[] = []

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lineChunks = paragraph.split(/\n+/).map(s => s.trim()).filter(Boolean)
    for (const chunk of lineChunks) {
      for (const sentence of splitNarrationChunk(chunk)) {
        result.push({ sentence, paragraphIndex })
      }
    }
  })

  return result
}

/** 片头标题：与正文分镜相同规则拆句 */
export function splitTitleSentencesWithMeta(text: string): NarrationSentenceItem[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
  const result: NarrationSentenceItem[] = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lineChunks = paragraph.split(/\n+/).map(s => s.trim()).filter(Boolean)
    for (const chunk of lineChunks) {
      for (const sentence of splitNarrationChunk(chunk)) {
        result.push({ sentence, paragraphIndex })
      }
    }
  })
  return result
}

/** 纯日期/季节句不单独开配图锚点，沿用上一张或并入下一段 */
export function suppressDateOnlyImageAnchors(
  items: NarrationSentenceItem[],
  needs: boolean[],
): boolean[] {
  const result = [...needs]
  for (let i = 0; i < items.length; i++) {
    if (!result[i]) continue
    if (!isNarrationDateOnlySentence(items[i].sentence)) continue
    result[i] = false
  }
  if (items.length && !result.some(Boolean)) {
    const fallback = items.findIndex(item => !isNarrationDateOnlySentence(item.sentence))
    result[fallback >= 0 ? fallback : 0] = true
  }
  return result
}

/** 正文分镜配图占比（约 30%） */
export const NARRATION_IMAGE_TARGET_RATIO = 0.3

/** 每张配图平均覆盖镜数（切段目标） */
export const NARRATION_IMAGE_AVERAGE_SHOTS_PER_SEGMENT = 4

/** 单段最多镜数（超过则补锚点） */
export const NARRATION_IMAGE_MAX_SHOTS_PER_SEGMENT = 5

/** 单段最少镜数（不足则合并到上一张，避免隔一镜换图） */
export const NARRATION_IMAGE_MIN_SHOTS_PER_SEGMENT = 3

function finalizeImageNeeds(items: NarrationSentenceItem[], needs: boolean[]): boolean[] {
  return suppressDateOnlyImageAnchors(
    items,
    enforceMinShotsPerSegment(
      enforceMaxShotsPerSegment(enforceMinShotsPerSegment(needs)),
    ),
  )
}

function resolveImagePickCount(eligibleCount: number): number {
  if (eligibleCount <= 0) return 0
  return Math.max(1, Math.round(eligibleCount / NARRATION_IMAGE_AVERAGE_SHOTS_PER_SEGMENT))
}

function scoreStoryboardImagePriority(
  items: NarrationSentenceItem[],
  index: number,
  llmPriority = 0,
): number {
  const item = items[index]
  const sentence = item.sentence
  if (isNarrationDateOnlySentence(sentence)) return -1000

  let score = 0
  if (llmPriority > 0) score += llmPriority
  if (index === 0) score += 40

  if (index > 0 && items[index].paragraphIndex !== items[index - 1].paragraphIndex) score += 35
  if (STRONG_SCENE_SHIFT_RE.test(sentence)) score += 32
  if (SCENE_SHIFT_RE.test(sentence)) score += 24
  if (BEAT_SHIFT_RE.test(sentence)) score += 18
  if (SCENE_OPENING_RE.test(sentence)) score += 12
  if (sentenceHasNewLocationTag(items, index)) score += 28

  if (/批|卖|摊|店|万元|辞|创业|赚钱|租|开|推.*车|婚礼|串门|电视|网购|杂货|风光|落魄/.test(sentence)) score += 8
  if (/年轻人|顾客|货物|商品|赶时髦/.test(sentence)) score += 6

  return score
}

function sentenceHasNewLocationTag(items: NarrationSentenceItem[], index: number): boolean {
  if (index <= 0) return false
  const curTags = getImageLocationTags(items[index].sentence)
  if (!curTags.length) return false
  const priorText = items.slice(0, index).map(item => item.sentence).join('')
  const priorTags = getImageLocationTags(priorText)
  return curTags.some(tag => !priorTags.includes(tag))
}

function pickSegmentAnchorIndex(
  items: NarrationSentenceItem[],
  eligibleIndices: number[],
  windowStart: number,
  windowEnd: number,
  llmPriorities: number[] | undefined,
  lastAnchor: number,
): number {
  const minIndex = lastAnchor < 0 ? 0 : lastAnchor + NARRATION_IMAGE_MIN_SHOTS_PER_SEGMENT

  let bestIndex = -1
  let bestScore = -Infinity
  for (let pos = windowStart; pos < windowEnd; pos++) {
    const index = eligibleIndices[pos]!
    if (lastAnchor >= 0 && index < minIndex) continue
    const score = scoreStoryboardImagePriority(items, index, llmPriorities?.[index] ?? 0)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  if (bestIndex >= 0) return bestIndex

  for (let pos = windowStart; pos < windowEnd; pos++) {
    const index = eligibleIndices[pos]!
    if (lastAnchor < 0 || index >= minIndex) return index
  }

  return eligibleIndices[windowStart]!
}

/** 按分镜总数约 30% 配图、平均约 4 镜一图分配锚点（结合 LLM 优先级与时间线分段） */
export function allocateImageNeedsByRatio(
  items: NarrationSentenceItem[],
  llmPriorities?: number[],
  _mode: ImageDetectMode = 'paragraph',
): boolean[] {
  if (!items.length) return []

  const eligibleIndices = items
    .map((item, index) => index)
    .filter(index => !isNarrationDateOnlySentence(items[index].sentence))

  const eligibleCount = eligibleIndices.length
  if (!eligibleCount) return items.map(() => false)

  const targetPick = resolveImagePickCount(eligibleCount)

  const needs = items.map(() => false)
  const segmentCount = targetPick
  let lastAnchor = -1
  for (let segment = 0; segment < segmentCount; segment++) {
    const start = Math.floor(segment * eligibleCount / segmentCount)
    const end = Math.floor((segment + 1) * eligibleCount / segmentCount)
    if (start >= end) continue
    const anchorIndex = pickSegmentAnchorIndex(
      items,
      eligibleIndices,
      start,
      end,
      llmPriorities,
      lastAnchor,
    )
    needs[anchorIndex] = true
    lastAnchor = anchorIndex
  }

  return finalizeImageNeeds(items, needs)
}

/** 相邻锚点不足 min 镜时去掉后锚，合并到上一张 */
function enforceMinShotsPerSegment(
  needs: boolean[],
  min = NARRATION_IMAGE_MIN_SHOTS_PER_SEGMENT,
): boolean[] {
  const result = [...needs]
  if (!result.length) return result

  let lastAnchor = -1
  for (let i = 0; i < result.length; i++) {
    if (!result[i]) continue
    if (lastAnchor >= 0 && i - lastAnchor < min) {
      result[i] = false
      continue
    }
    lastAnchor = i
  }

  if (!result.some(Boolean)) result[0] = true
  return result
}

/** 相邻锚点超过 max 镜时补锚点（均分，且每段不少于 min 镜） */
function enforceMaxShotsPerSegment(
  needs: boolean[],
  max = NARRATION_IMAGE_MAX_SHOTS_PER_SEGMENT,
  min = NARRATION_IMAGE_MIN_SHOTS_PER_SEGMENT,
): boolean[] {
  const result = [...needs]
  if (!result.length) return result

  let changed = true
  while (changed) {
    changed = false
    const anchors = result
      .map((flag, index) => (flag ? index : -1))
      .filter(index => index >= 0)

    for (let a = 0; a < anchors.length - 1; a++) {
      const start = anchors[a]!
      const end = anchors[a + 1]!
      const gap = end - start
      if (gap <= max) continue

      const splits = Math.ceil(gap / max)
      const chunkSize = Math.max(min, Math.ceil(gap / splits))
      const cursor = start + chunkSize
      if (cursor < end && end - cursor >= min) {
        result[cursor] = true
        changed = true
        break
      }
    }
  }

  return result
}

/** 规则兜底：按约 30% 占比、平均约 4 镜一图分配 */
export function detectImageNeedsBalanced(items: NarrationSentenceItem[]): boolean[] {
  return allocateImageNeedsByRatio(items, undefined, 'balanced')
}

/** 省钱模式兜底：同样按约 30% 配图 */
export function detectImageNeedsConservative(items: NarrationSentenceItem[]): boolean[] {
  return allocateImageNeedsByRatio(items, undefined, 'conservative')
}

/** 漫画解说规则兜底：按场景/动作换图，不因换人说话强制切图；约 2～4 镜一图 */
export function detectImageNeedsMotionComic(items: NarrationSentenceItem[]): boolean[] {
  if (!items.length) return []

  const raw = items.map((item, index) => {
    if (item.isTitle) {
      if (index === 0) return true
      return !items[index - 1]?.isTitle
    }
    if (isNarrationDateOnlySentence(item.sentence)) return false
    if (index === 0) return true

    const prev = items[index - 1]
    const sentence = item.sentence
    // 换人说话不强制换图：同场景对白来回可共用
    if (item.paragraphIndex !== prev.paragraphIndex) return true
    if (STRONG_SCENE_SHIFT_RE.test(sentence)) return true
    if (SCENE_SHIFT_RE.test(sentence)) return true
    if (SCENE_OPENING_RE.test(sentence)) return true
    if (BEAT_SHIFT_RE.test(sentence)) return true
    return false
  })

  let needs = suppressDateOnlyImageAnchors(items, raw)
  needs = ensureMaxNarrationGap(items, needs, MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS)
  return enforceImageSegmentShotBounds(
    needs,
    MOTION_COMIC_IMAGE_SEGMENT_MIN_SHOTS,
    MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS,
  )
}

/** 同一场景连续超过 maxGap 句仍无新图 → 补一张，避免画面长时间不切换 */
export function ensureMaxNarrationGap(
  items: NarrationSentenceItem[],
  needs: boolean[],
  maxGap = NARRATION_IMAGE_MAX_SHOTS_PER_SEGMENT,
): boolean[] {
  const result = [...needs]
  if (!items.length) return result
  let lastImageIndex = 0
  for (let i = 1; i < items.length; i++) {
    if (result[i]) {
      lastImageIndex = i
      continue
    }
    if (i - lastImageIndex >= maxGap) {
      result[i] = true
      lastImageIndex = i
    }
  }
  return result
}

/** 合并过短的场景段（不足 minSentences 句且无强切换 → 沿用上一场景） */
export function consolidateShortSceneSegments(
  items: NarrationSentenceItem[],
  needs: boolean[],
  minSentences = 4,
): boolean[] {
  const result = [...needs]
  if (!items.length) return result
  result[0] = true

  let i = 0
  while (i < items.length) {
    if (!result[i]) { i++; continue }
    let end = i
    while (end + 1 < items.length && !result[end + 1]) end++
    const segLen = end - i + 1
    const locationBoundary = hasNewImageLocationTag(items, needs, i)
    if (i > 0 && isNarrationDateOnlySentence(items[i].sentence)) {
      result[i] = false
    } else if (i > 0 && segLen < minSentences && !STRONG_SCENE_SHIFT_RE.test(items[i].sentence) && !locationBoundary) {
      result[i] = false
    }
    i = end + 1
  }
  return result
}

function hasNewImageLocationTag(
  items: NarrationSentenceItem[],
  needs: boolean[],
  index: number,
): boolean {
  if (index <= 0) return false
  let prevImage = 0
  for (let j = index - 1; j >= 0; j--) {
    if (needs[j]) {
      prevImage = j
      break
    }
  }
  const segText = items.slice(prevImage, index).map(item => item.sentence).join('')
  const segTags = getImageLocationTags(segText)
  const curTags = getImageLocationTags(items[index].sentence)
  return curTags.some(tag => !segTags.includes(tag))
}

/** 规则兜底：换段落、场景词、地点/时间起句、叙事节拍转折 → 新配图 */
export function detectImageNeedsHeuristic(items: NarrationSentenceItem[]): boolean[] {
  const raw = items.map((item, index) => {
    if (isNarrationDateOnlySentence(item.sentence)) return false
    if (index === 0) return true
    const prev = items[index - 1]
    const sentence = item.sentence
    if (item.paragraphIndex !== prev.paragraphIndex) return true
    if (STRONG_SCENE_SHIFT_RE.test(sentence)) return true
    if (SCENE_SHIFT_RE.test(sentence)) return true
    if (SCENE_OPENING_RE.test(sentence)) return true
    if (BEAT_SHIFT_RE.test(sentence)) return true
    return false
  })
  return finalizeImageNeeds(items, raw)
}

function extractJsonObject(text: string) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    // fall through
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

function normalizeParagraphPromptRow(row: unknown): {
  start_index: number
  image_prompt: string
  flux_prompt_en?: string
  subtitle_lines?: string[]
} | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const startIndex = Number(r.start_index ?? r.startIndex)
  let prompt = String(r.image_prompt ?? r.imagePrompt ?? r.prompt ?? '').trim()
  let fluxEn = String(r.flux_prompt_en ?? r.fluxPromptEn ?? '').trim()
  if (!Number.isFinite(startIndex) || !prompt) return null

  const looksCn = (s: string) => /[\u4e00-\u9fff]/.test(s)
  const looksEnSections = (s: string) =>
    /Action and interaction|Camera and composition|Subjects in frame|Art style spec/i.test(s)

  // 防模型把英文塞进 image_prompt：必要时对调/丢弃英文伪中文
  if (!looksCn(prompt) && looksCn(fluxEn)) {
    const tmp = prompt
    prompt = fluxEn
    fluxEn = looksEnSections(tmp) ? tmp : ''
  }
  if (!looksCn(prompt) && looksEnSections(prompt)) {
    if (!fluxEn) fluxEn = prompt
    return null // 中文文案缺失，整行作废以便单段重试
  }
  // 接受整段中文（不再强制【画风规格】等六维标签）；过短视为无效
  if (!looksCn(prompt) || prompt.length < 24) {
    return null
  }

  const subtitleLines = Array.isArray(r.subtitle_lines ?? r.subtitleLines)
    ? (r.subtitle_lines ?? r.subtitleLines as unknown[]).map(s => String(s ?? ''))
    : undefined
  return {
    start_index: startIndex,
    image_prompt: prompt,
    ...(fluxEn ? { flux_prompt_en: fluxEn } : {}),
    subtitle_lines: subtitleLines,
  }
}

/** JSON 损坏时：按字段名捞 start_index + image_prompt（+ 可选英文） */
function salvageParagraphPromptRowsFromRaw(
  text: string,
  expectedStarts: number[],
): Array<{ start_index: number; image_prompt: string; flux_prompt_en?: string }> {
  const raw = String(text || '')
  const found: Array<{ start_index: number; image_prompt: string; flux_prompt_en?: string }> = []
  const unescapeJson = (s: string) => s
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim()

  const push = (startIndex: number, prompt: string, fluxEn?: string) => {
    if (!Number.isFinite(startIndex) || !prompt) return
    if (expectedStarts.length && !expectedStarts.includes(startIndex)) return
    const existing = found.find(r => r.start_index === startIndex)
    if (existing) {
      if (fluxEn && !existing.flux_prompt_en) existing.flux_prompt_en = fluxEn
      return
    }
    found.push({
      start_index: startIndex,
      image_prompt: prompt,
      ...(fluxEn ? { flux_prompt_en: fluxEn } : {}),
    })
  }

  const blockRe = /\{\s*"start_index"\s*:\s*(\d+)[\s\S]*?"image_prompt"\s*:\s*"((?:\\.|[^"\\])*)"([\s\S]*?)(?=\}\s*,|\}\s*\])/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(raw))) {
    const startIndex = Number(m[1])
    const prompt = unescapeJson(m[2])
    const tail = m[3] || ''
    const enM = tail.match(/"flux_prompt_en"\s*:\s*"((?:\\.|[^"\\])*)"/)
    push(startIndex, prompt, enM?.[1] ? unescapeJson(enM[1]) : undefined)
  }

  if (!found.length) {
    const re =
      /"start_index"\s*:\s*(\d+)\s*,\s*"image_prompt"\s*:\s*"((?:\\.|[^"\\])*)"/g
    while ((m = re.exec(raw))) {
      push(Number(m[1]), unescapeJson(m[2]))
    }
  }
  return found
}

function parseParagraphPromptRows(
  text: string,
  batch: ParagraphPromptInput[],
  opts?: { allowPartial?: boolean },
): Array<{ start_index: number; image_prompt: string; flux_prompt_en?: string; subtitle_lines?: string[] }> | null {
  const raw = String(text || '').trim()
  if (!raw) return null

  const expectedStarts = batch.map(p => p.startIndex)
  const allowPartial = !!opts?.allowPartial
  const collect = (rows: unknown[]): Array<{
    start_index: number
    image_prompt: string
    flux_prompt_en?: string
    subtitle_lines?: string[]
  }> | null => {
    const normalized = rows.map(normalizeParagraphPromptRow).filter(Boolean) as Array<{
      start_index: number
      image_prompt: string
      flux_prompt_en?: string
      subtitle_lines?: string[]
    }>
    if (normalized.length === batch.length) return normalized
    const byStart = normalized.filter(r => expectedStarts.includes(r.start_index))
    if (byStart.length === batch.length) return byStart
    if (allowPartial && byStart.length > 0) return byStart
    return null
  }

  const parsed = extractJsonObject(raw)
  const fromObject = Array.isArray(parsed?.paragraph_prompts) ? parsed.paragraph_prompts : null
  if (fromObject) {
    const rows = collect(fromObject)
    if (rows) return rows
  }

  const promptsKey = raw.match(/"paragraph_prompts"\s*:\s*(\[[\s\S]*\])/)
  if (promptsKey?.[1]) {
    try {
      const arr = JSON.parse(promptsKey[1])
      if (Array.isArray(arr)) {
        const rows = collect(arr)
        if (rows) return rows
      }
    } catch {
      // ignore — fall through to salvage
    }
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const direct = JSON.parse(arrayMatch[0])
      if (Array.isArray(direct)) {
        const rows = collect(direct)
        if (rows) return rows
      }
    } catch {
      // ignore
    }
  }

  const salvaged = salvageParagraphPromptRowsFromRaw(raw, expectedStarts)
  if (salvaged.length === batch.length) return salvaged
  if (allowPartial && salvaged.length > 0) return salvaged
  return null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 有限并发执行：任一 worker 完成后立刻领取下一批（不按波次等待） */
async function mapPool(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, Math.min(concurrency, count))
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (true) {
      const index = next++
      if (index >= count) return
      await worker(index)
    }
  }))
}

/** 串行化共享状态写入（近重复校验 / Map / 增量落库） */
function createAsyncMutex() {
  let tail: Promise<void> = Promise.resolve()
  return async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const prev = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await prev
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

/** 去掉画风/定妆外壳/辨识差，用于判断模型是否在复读同一条动作文案 */
function promptActionFingerprint(prompt: string): string {
  let s = String(prompt || '')
  // 画风壳（须充分剥离，否则前 40 字全是共用模板 → 误判近重复）
  s = s
    .replace(/16\s*[:：]?\s*9\s*横屏[^，；。]*/g, '')
    .replace(/短剧解说高清国漫[^，,。．]*/g, '')
    .replace(/锋利细线稿[^，；。]*/g, '')
    .replace(/硬边赛璐璐/g, '')
    .replace(/高对比赛璐璐[^，；。]*/g, '')
    .replace(/冷[蓝紫青][^，；。]{0,48}/g, '')
    .replace(/冷色[^，,。．]{0,24}/g, '')
    .replace(/无文字无水印无字幕/g, '')
    .replace(/背景暗部浅景深虚化/g, '')
    .replace(/对照定妆「[^」]+」/g, '')
    .replace(/（身穿[^）]*）/g, '')
    .replace(/【[^】]{0,24}】/g, '')
  // 定妆括号：丢掉脸型/发型/年龄辨识差，只留本镜表情与动作向短语
  s = s.replace(/（([^）]*)）/g, (_m, inner: string) => {
    const kept = String(inner || '')
      .split(/[，,、·•]/)
      .map(x => x.trim())
      .filter((c) => {
        if (!c) return false
        if (/身穿|#(?:[0-9a-fA-F]{3,8})/.test(c)) return false
        const identityLike = /鹅蛋|国字|方正|棱角|清秀|圆润脸|瘦长|宽颌|剑眉|浓眉|细眉|一字眉|丹凤眼|细长眼|圆大|深褐眼|碎发|寸头|短寸|平头|中长发|刘海|花白|青年男性|青年女性|中年男性|中年女性|老年|约?\d{1,2}岁|微卷中长发|齐耳短发|圆脸/.test(c)
        const expressionLike = /表情|神情|眉头|嘴唇|嘴角|瞪|震惊|严肃|痛苦|颤抖|泛红|紧锁|微张|微抿|凝重|笃定|锐利|警觉|眼神|目光|瞳孔|泪|咬牙|皱眉/.test(c)
        if (identityLike && !expressionLike) return false
        return true
      })
      .join('')
    return kept
  })
  return s.replace(/[，,。．；;、\s/|｜·•:：]+/g, '').slice(0, 120)
}

function isNearDuplicateImagePrompt(prompt: string, existing: Iterable<string>): boolean {
  const fp = promptActionFingerprint(prompt)
  if (fp.length < 24) return false
  for (const other of existing) {
    const ofp = promptActionFingerprint(other)
    if (!ofp || ofp.length < 24) continue
    if (fp === ofp) return true
    // 动作指纹前缀相同才判近重复（已剥离画风/辨识差，避免同场所误伤）
    const n = Math.min(48, fp.length, ofp.length)
    if (n >= 36 && fp.slice(0, n) === ofp.slice(0, n)) return true
  }
  return false
}

/** 片头连续标题句合并为一个检测单元；正文每句一单元 */
export function buildNarrationDetectUnits(items: NarrationSentenceItem[]): NarrationDetectUnit[] {
  const units: NarrationDetectUnit[] = []
  let i = 0
  while (i < items.length) {
    if (items[i].isTitle) {
      const indices: number[] = []
      const parts: string[] = []
      while (i < items.length && items[i].isTitle) {
        indices.push(i)
        parts.push(items[i].sentence)
        i++
      }
      units.push({
        detectIndex: units.length + 1,
        storyboardIndices: indices,
        text: parts.join('，'),
        isTitleGroup: indices.length > 1,
      })
      continue
    }
    units.push({
      detectIndex: units.length + 1,
      storyboardIndices: [i],
      text: String(items[i].dialogue || '').trim() || items[i].sentence,
    })
    i++
  }
  return units
}

function expandDetectNeedsToStoryboards(
  items: NarrationSentenceItem[],
  units: NarrationDetectUnit[],
  analysis: Array<{ index?: unknown; needs_image?: unknown }>,
): boolean[] | null {
  const needs = new Array(items.length).fill(false)
  const byIndex = new Map<number, boolean>()
  for (const row of analysis) {
    const idx = Number(row?.index)
    if (!Number.isFinite(idx) || idx < 1) return null
    if (typeof row?.needs_image !== 'boolean') return null
    byIndex.set(idx, row.needs_image)
  }
  if (byIndex.size !== units.length) return null

  for (const unit of units) {
    if (!byIndex.get(unit.detectIndex)) continue
    needs[unit.storyboardIndices[0]] = true
  }

  if (!needs.some(Boolean) && units.length) {
    needs[units[0].storyboardIndices[0]] = true
  }
  return needs
}

function parseDetectSegmentDescriptions(
  units: NarrationDetectUnit[],
  imagePrompts: unknown,
): Map<number, string> {
  const descriptions = new Map<number, string>()
  if (!Array.isArray(imagePrompts)) return descriptions

  for (const row of imagePrompts) {
    const startIndex = Number((row as { start_index?: unknown })?.start_index)
    const desc = String((row as { description?: unknown })?.description || '').trim()
    if (!desc || !Number.isFinite(startIndex) || startIndex < 1) continue
    const unit = units.find(u => u.detectIndex === startIndex)
    if (!unit) continue
    descriptions.set(unit.storyboardIndices[0], desc)
  }
  return descriptions
}

function listImageAnchorSegments(needs: boolean[]) {
  const segments: Array<{ start: number; end: number }> = []
  for (let i = 0; i < needs.length; ) {
    if (!needs[i]) {
      i++
      continue
    }
    let end = i
    while (end + 1 < needs.length && !needs[end + 1]) end++
    segments.push({ start: i, end })
    i = end + 1
  }
  return segments
}

/** 校正配图段长度：每段 2～4 镜（含锚点镜） */
export function enforceImageSegmentShotBounds(
  needs: boolean[],
  minShots = NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
  maxShots = NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
): boolean[] {
  if (!needs.length || minShots < 1 || maxShots < minShots) return needs

  const result = [...needs]
  if (!result.some(Boolean)) result[0] = true

  const splitLongSegments = () => {
    let changed = false
    for (const seg of listImageAnchorSegments(result)) {
      let start = seg.start
      let end = seg.end
      while (end - start + 1 > maxShots) {
        const remaining = end - start + 1
        let chunk = maxShots
        const after = remaining - chunk
        if (after > 0 && after < minShots) {
          chunk = remaining - minShots
          if (chunk < minShots) chunk = Math.ceil(remaining / 2)
        }
        const nextAnchor = start + chunk
        if (nextAnchor > end) break
        if (!result[nextAnchor]) {
          result[nextAnchor] = true
          changed = true
        }
        start = nextAnchor
      }
    }
    return changed
  }

  const mergeShortSegments = () => {
    const segments = listImageAnchorSegments(result)
    if (segments.length <= 1) return false

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s]
      const len = seg.end - seg.start + 1
      if (len >= minShots) continue

      if (s > 0) {
        const prev = segments[s - 1]
        const mergedLen = seg.end - prev.start + 1
        if (mergedLen <= maxShots) {
          result[seg.start] = false
          return true
        }
      }
      if (s < segments.length - 1) {
        const next = segments[s + 1]
        const mergedLen = next.end - seg.start + 1
        if (mergedLen <= maxShots) {
          result[next.start] = false
          return true
        }
      }
    }
    return false
  }

  while (splitLongSegments()) { /* until stable */ }
  for (let guard = 0; guard < needs.length && mergeShortSegments(); guard++) {
    while (splitLongSegments()) { /* rebalance after merge */ }
  }

  return result
}

/** 段长合规后锚点仍不足最低张数时，优先拆分较长段落 */
function boostImageAnchorCountToMinimum(
  needs: boolean[],
  minimumTrueCount: number,
  minShots = NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
  maxShots = NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
): boolean[] {
  let result = enforceImageSegmentShotBounds(needs, minShots, maxShots)
  for (let guard = 0; guard < needs.length && result.filter(Boolean).length < minimumTrueCount; guard++) {
    const segments = listImageAnchorSegments(result)
      .map(seg => ({ ...seg, len: seg.end - seg.start + 1 }))
      .sort((a, b) => b.len - a.len)
    const target = segments.find(seg => seg.len > minShots)
    if (!target) break
    const splitAt = target.start + Math.ceil(target.len / 2)
    if (splitAt <= target.start || splitAt > target.end) break
    result[splitAt] = true
    result = enforceImageSegmentShotBounds(result, minShots, maxShots)
  }
  return result
}

/** 锚点过多时合并相邻段（仍满足每段 2～4 镜） */
function trimImageAnchorCountToMaximum(
  needs: boolean[],
  maximumTrueCount: number,
  minShots = NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
  maxShots = NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
): boolean[] {
  let result = [...needs]
  for (let guard = 0; guard < needs.length && result.filter(Boolean).length > maximumTrueCount; guard++) {
    const segments = listImageAnchorSegments(result)
    let merged = false
    for (let s = 0; s < segments.length - 1; s++) {
      const a = segments[s]
      const b = segments[s + 1]
      const mergedLen = b.end - a.start + 1
      if (mergedLen >= minShots && mergedLen <= maxShots) {
        result[b.start] = false
        merged = true
        break
      }
    }
    if (!merged) break
  }
  return enforceImageSegmentShotBounds(result, minShots, maxShots)
}

function resolveTargetDetectTrueCount(storyboardCount: number, bounds: ImageSegmentBounds): number {
  const minCount = resolveMinimumDetectTrueCount(storyboardCount, bounds)
  const maxCount = resolveMaximumDetectTrueCount(storyboardCount, bounds)
  if (!(bounds.targetRatio > 0)) return minCount
  const target = Math.max(1, Math.round(storyboardCount * bounds.targetRatio))
  return Math.min(maxCount, Math.max(minCount, target))
}

function applyImageAnchorConstraints(
  needs: boolean[],
  minimumTrueCount: number,
  maximumTrueCount: number,
  bounds: ImageSegmentBounds,
): boolean[] {
  let result = enforceImageSegmentShotBounds(needs, bounds.minShots, bounds.maxShots)
  // 先拉到目标密度（漫画解说偏密），再保证不低于 min、不超过 max
  const targetCount = resolveTargetDetectTrueCount(needs.length, bounds)
  result = boostImageAnchorCountToMinimum(result, Math.max(minimumTrueCount, targetCount), bounds.minShots, bounds.maxShots)
  result = boostImageAnchorCountToMinimum(result, minimumTrueCount, bounds.minShots, bounds.maxShots)
  result = trimImageAnchorCountToMaximum(result, maximumTrueCount, bounds.minShots, bounds.maxShots)
  return result
}

/** 按配图锚点切分场景段落：每段首镜配图，内容覆盖该段全部旁白 */
export function buildSceneSegments(items: NarrationSentenceItem[], needs: boolean[]): NarrationSceneSegment[] {
  const segments: NarrationSceneSegment[] = []
  for (let i = 0; i < items.length; i++) {
    if (!needs[i]) continue
    let end = i
    while (end + 1 < items.length && !needs[end + 1]) end++
    segments.push({
      anchorIndex: i,
      endIndex: end,
      sentences: items.slice(i, end + 1).map(item => item.sentence),
    })
  }
  return segments
}

/** 用文本模型为每个场景段落生成配图画面描述 */
export async function generateSceneImagePromptsWithLLM(
  segments: NarrationSceneSegment[],
  style = 'comic',
  textModel?: string | null,
  fullNarrationLines?: string[],
  textThinking = true,
): Promise<string[] | null> {
  if (!segments.length) return []

  try {
    const config = getTextConfig(textModel)
    if (!textConfigHasCredentials(config)) return null

    logTaskProgress('NarrationScene', 'llm-scene-prompt-start', { sceneCount: segments.length, model: config.model })

    const system = buildNarrationSceneSegmentsImagePromptLLMSystem(style)

    const user = JSON.stringify({
      full_narration: fullNarrationLines?.length ? fullNarrationLines : undefined,
      scenes: segments.map((seg, index) => ({
        scene_index: index,
        narration_lines: seg.sentences,
      })),
      output_format: { image_prompts: 'string[]，长度与 scenes 相同' },
    })

    const text = await callTextChat(system, user, textModel, textThinking, SCENE_SEGMENTS_PROMPT_LLM_TIMEOUT_MS)
    const parsed = extractJsonObject(text)
    const prompts = Array.isArray(parsed?.image_prompts) ? parsed.image_prompts : null
    if (!prompts || prompts.length !== segments.length) {
      logTaskWarn('NarrationScene', 'llm-scene-prompt-invalid', { expected: segments.length, got: prompts?.length || 0 })
      return null
    }

    const normalized = prompts.map((p: unknown) => (
      resolveLLMImagePrompt(String(p || '').trim(), style)
    )).filter(Boolean)
    if (normalized.length !== segments.length) return null

    logTaskSuccess('NarrationScene', 'llm-scene-prompt-done', { sceneCount: segments.length })
    return normalized
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-scene-prompt-failed', { error: err.message })
    return null
  }
}

function parseLLMNeedsImage(raw: unknown[], length: number): boolean[] | null {
  if (raw.length !== length) return null
  const needs: boolean[] = []
  for (let i = 0; i < length; i++) {
    const val = raw[i]
    if (typeof val === 'boolean') {
      needs.push(val)
      continue
    }
    if (typeof val === 'number' || typeof val === 'string') {
      const n = Number(val)
      if (!Number.isFinite(n)) return null
      needs.push(n >= 70)
      continue
    }
    return null
  }
  return needs
}

function countTrueDetectUnits(analysis: Array<{ needs_image?: unknown }>): number {
  return analysis.filter(row => row?.needs_image === true).length
}

function resolveMinimumDetectTrueCount(storyboardCount: number, bounds: ImageSegmentBounds): number {
  if (storyboardCount <= 0) return 0
  return Math.max(1, Math.ceil(storyboardCount * bounds.minRatio))
}

function resolveMaximumDetectTrueCount(storyboardCount: number, bounds: ImageSegmentBounds): number {
  if (storyboardCount <= 0) return 0
  const minimum = resolveMinimumDetectTrueCount(storyboardCount, bounds)
  const maximum = Math.floor(storyboardCount * bounds.maxRatio)
  return Math.max(minimum, maximum)
}

function formatDetectRatioRange(bounds: ImageSegmentBounds): string {
  const minPct = Math.round(bounds.minRatio * 100)
  const maxPct = Math.round(bounds.maxRatio * 100)
  return `${minPct}%～${maxPct}%`
}

export function resolveDetectBatchThreshold(raw?: number): number {
  if (raw === 0) return 0
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw)
  return NARRATION_IMAGE_DETECT_BATCH_THRESHOLD_DEFAULT
}

export function resolveDetectBatchSize(raw?: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 10) return Math.round(raw)
  return NARRATION_IMAGE_DETECT_BATCH_SIZE_DEFAULT
}

function shouldUseDetectBatching(storyboardCount: number, batchThreshold?: number): boolean {
  const threshold = resolveDetectBatchThreshold(batchThreshold)
  return threshold > 0 && storyboardCount > threshold
}

/** 按镜头数切分检测单元，避免单批过大 */
function chunkDetectUnitsByStoryboardSize(
  units: NarrationDetectUnit[],
  batchStoryboardSize: number,
): NarrationDetectUnit[][] {
  if (!units.length) return []
  const batches: NarrationDetectUnit[][] = []
  let current: NarrationDetectUnit[] = []
  let currentShots = 0

  for (const unit of units) {
    const unitShots = unit.storyboardIndices.length
    if (current.length > 0 && currentShots + unitShots > batchStoryboardSize) {
      batches.push(current)
      current = []
      currentShots = 0
    }
    current.push(unit)
    currentShots += unitShots
  }
  if (current.length) batches.push(current)
  return batches
}

function resolveBatchDetectTrueCounts(
  batchUnitCount: number,
  totalUnitCount: number,
  minimumTrueCount: number,
  maximumTrueCount: number,
): { batchMin: number; batchMax: number } {
  if (totalUnitCount <= 0 || batchUnitCount <= 0) {
    return { batchMin: 0, batchMax: 0 }
  }
  const ratio = batchUnitCount / totalUnitCount
  const batchMin = Math.max(0, Math.round(minimumTrueCount * ratio))
  const batchMax = Math.max(batchMin, Math.round(maximumTrueCount * ratio))
  return { batchMin, batchMax }
}

type DetectLLMCallContext = {
  system: string
  fullNarration: string[]
  storyboardCount: number
  totalUnitCount: number
  minimumTrueCount: number
  maximumTrueCount: number
  ratioRange: string
  segmentBounds: ImageSegmentBounds
  previousEpisodeNarration?: string[]
  textModel?: string | null
  textThinking: boolean
}

function buildDetectUserPayload(
  ctx: DetectLLMCallContext,
  batchUnits: NarrationDetectUnit[],
  batchMeta?: { batchIndex: number; batchCount: number },
  retryHint?: string,
): string {
  const { batchMin, batchMax } = resolveBatchDetectTrueCounts(
    batchUnits.length,
    ctx.totalUnitCount,
    ctx.minimumTrueCount,
    ctx.maximumTrueCount,
  )
  return JSON.stringify({
    ...(ctx.previousEpisodeNarration?.length ? { previous_episode_narration: ctx.previousEpisodeNarration } : {}),
    full_narration: ctx.fullNarration,
    storyboard_count: ctx.storyboardCount,
    detect_unit_count: batchUnits.length,
    minimum_true_count: batchMeta ? batchMin : ctx.minimumTrueCount,
    maximum_true_count: batchMeta ? batchMax : ctx.maximumTrueCount,
    minimum_true_ratio: ctx.segmentBounds.minRatio,
    maximum_true_ratio: ctx.segmentBounds.maxRatio,
    min_shots_per_image: ctx.segmentBounds.minShots,
    max_shots_per_image: ctx.segmentBounds.maxShots,
    ...(batchMeta ? {
      batch_index: batchMeta.batchIndex,
      batch_count: batchMeta.batchCount,
      batch_note: '本批为全文分段检测的一部分：仅对下列 sentences 输出 analysis，index 须与输入一致；须结合 full_narration 理解前后文后再判定。',
    } : {}),
    ...(retryHint ? { retry_hint: retryHint } : {}),
    sentences: batchUnits.map(unit => ({
      index: unit.detectIndex,
      text: unit.text,
    })),
  })
}

async function finalizeDetectNeedsFromAnalysis(
  items: NarrationSentenceItem[],
  units: NarrationDetectUnit[],
  analysis: Array<Record<string, unknown>>,
  minimumTrueCount: number,
  maximumTrueCount: number,
  ratioRange: string,
  imagePrompts: unknown,
  bounds: ImageSegmentBounds,
): Promise<NarrationDetectLLMResult> {
  if (analysis.length !== units.length) {
    throw new Error(`配图换镜 AI 返回无效（期望 ${units.length} 项 analysis）`)
  }

  let needs = expandDetectNeedsToStoryboards(items, units, analysis)
  if (!needs) {
    throw new Error('配图换镜 AI 返回无效（analysis 与检测单元数量不匹配）')
  }

  const beforeBounds = needs.filter(Boolean).length
  needs = applyImageAnchorConstraints(needs, minimumTrueCount, maximumTrueCount, bounds)
  const afterBounds = needs.filter(Boolean).length
  if (afterBounds !== beforeBounds) {
    logTaskProgress('NarrationScene', 'segment-bounds-applied', {
      beforeAnchors: beforeBounds,
      afterAnchors: afterBounds,
      minimumTrueCount,
      maximumTrueCount,
      minShots: bounds.minShots,
      maxShots: bounds.maxShots,
    })
  }

  const needCount = needs.filter(Boolean).length
  if (needCount < minimumTrueCount) {
    throw new Error(
      `配图检测仅 ${needCount} 张，低于最低 ${minimumTrueCount} 张（镜头数 ${items.length} 的 ${ratioRange} 下限），请重试检测`,
    )
  }
  if (needCount > maximumTrueCount) {
    throw new Error(
      `配图检测 ${needCount} 张，超过最高 ${maximumTrueCount} 张（镜头数 ${items.length} 的 ${ratioRange} 上限），请重试检测`,
    )
  }

  return {
    needs,
    segmentDescriptions: parseDetectSegmentDescriptions(units, imagePrompts),
  }
}

async function callDetectImageNeedsLLM(
  system: string,
  user: string,
  textModel?: string | null,
  textThinking = false,
  timeoutMs = IMAGE_DETECT_LLM_TIMEOUT_MIN_MS,
): Promise<{
  analysis: Array<Record<string, unknown>>
  image_prompts: unknown
}> {
  const text = await callTextChat(system, user, textModel, textThinking, timeoutMs, true)
  const parsed = extractJsonObject(text)
  const analysis = Array.isArray(parsed?.analysis) ? parsed.analysis : null
  if (!analysis) {
    throw new Error('配图换镜 AI 返回无效（缺少 analysis）')
  }
  return { analysis, image_prompts: parsed?.image_prompts }
}

async function callDetectImageNeedsLLMWithRetry(
  system: string,
  user: string,
  detectUnitCount: number,
  textModel?: string | null,
  batchMeta?: { batchIndex: number; batchCount: number },
): Promise<{
  analysis: Array<Record<string, unknown>>
  image_prompts: unknown
}> {
  let lastError = ''
  for (let attempt = 1; attempt <= IMAGE_DETECT_LLM_BATCH_RETRIES + 1; attempt++) {
    try {
      return await callDetectImageNeedsLLM(
        system,
        user,
        textModel,
        false,
        resolveDetectLLMTimeoutMs(detectUnitCount, attempt),
      )
    } catch (err: unknown) {
      lastError = String((err as Error)?.message || err || 'unknown error')
      const retryable = isLLMRetryableError(lastError)
      if (!retryable || attempt > IMAGE_DETECT_LLM_BATCH_RETRIES) throw err
      const waitMs = isLLMTransientProviderError(lastError)
        ? 3_000 * attempt
        : 2_000 * attempt
      logTaskWarn('NarrationScene', 'llm-detect-batch-retry', {
        ...(batchMeta || {}),
        attempt,
        detectUnitCount,
        waitMs,
        error: lastError.slice(0, 200),
      })
      await sleep(waitMs)
    }
  }
  throw new Error(lastError || '配图换镜 AI 检测失败')
}

export async function detectImageNeedsWithLLM(
  items: NarrationSentenceItem[],
  mode: ImageDetectMode = 'paragraph',
  textModel?: string | null,
  textThinking = true,
  style = 'comic',
  fullNarrationLines?: string[],
  previousEpisodeNarration?: string[],
  options?: DetectImageNeedsOptions,
): Promise<NarrationDetectLLMResult> {
  if (!items.length) return { needs: [], segmentDescriptions: new Map() }

  const config = getTextConfig(textModel)
  assertTextConfigHasCredentials(config, '无法执行配图换镜检测')

  const detectMode = mode === 'conservative' ? 'conservative' : 'paragraph'
  const units = buildNarrationDetectUnits(items)
  const segmentBounds = resolveImageSegmentBounds(style)
  const minimumTrueCount = resolveMinimumDetectTrueCount(items.length, segmentBounds)
  const maximumTrueCount = resolveMaximumDetectTrueCount(items.length, segmentBounds)
  const ratioRange = formatDetectRatioRange(segmentBounds)
  const batchSize = resolveDetectBatchSize(options?.batchSize)
  const useBatch = shouldUseDetectBatching(items.length, options?.batchThreshold)
  const onProgress = options?.onProgress

  logTaskProgress('NarrationScene', 'llm-detect-start', {
    sentenceCount: items.length,
    detectUnitCount: units.length,
    minimumTrueCount,
    maximumTrueCount,
    minimumTrueRatio: segmentBounds.minRatio,
    maximumTrueRatio: segmentBounds.maxRatio,
    timeoutMs: resolveDetectLLMTimeoutMs(units.length),
    model: config.model,
    detectMode,
    batched: useBatch,
    batchThreshold: resolveDetectBatchThreshold(options?.batchThreshold),
    batchSize,
  })

  const system = buildNarrationImageDetectLLMSystem(style, detectMode)
  const fullNarration = fullNarrationLines?.length
    ? fullNarrationLines
    : items.map(item => item.sentence)
  const callCtx: DetectLLMCallContext = {
    system,
    fullNarration,
    storyboardCount: items.length,
    totalUnitCount: units.length,
    minimumTrueCount,
    maximumTrueCount,
    ratioRange,
    segmentBounds,
    previousEpisodeNarration,
    textModel,
    textThinking: false,
  }

  try {
    if (useBatch) {
      const batches = chunkDetectUnitsByStoryboardSize(units, batchSize)
      logTaskProgress('NarrationScene', 'llm-detect-batched', {
        batchCount: batches.length,
        batchSize,
        storyboardCount: items.length,
      })

      const mergedAnalysis: Array<Record<string, unknown>> = []
      let lastImagePrompts: unknown

      for (let bi = 0; bi < batches.length; bi++) {
        if (bi > 0) await sleep(IMAGE_DETECT_LLM_BATCH_GAP_MS)
        const batchUnits = batches[bi]
        const batchShots = batchUnits.reduce((sum, unit) => sum + unit.storyboardIndices.length, 0)
        onProgress?.({
          phase: 'detecting',
          batch: bi + 1,
          batch_count: batches.length,
          message: `正在检测换镜（第 ${bi + 1}/${batches.length} 批，约 ${batchShots} 镜）…`,
          percent: calcDetectBatchPercent(bi, batches.length),
        })

        const llmResult = await callDetectImageNeedsLLMWithRetry(
          callCtx.system,
          buildDetectUserPayload(callCtx, batchUnits, { batchIndex: bi + 1, batchCount: batches.length }),
          batchUnits.length,
          callCtx.textModel,
          { batchIndex: bi + 1, batchCount: batches.length },
        )
        if (llmResult.analysis.length !== batchUnits.length) {
          logTaskWarn('NarrationScene', 'llm-detect-batch-invalid', {
            batch: bi + 1,
            batchCount: batches.length,
            expected: batchUnits.length,
            got: llmResult.analysis.length,
          })
          throw new Error(`配图换镜 AI 第 ${bi + 1}/${batches.length} 批返回无效（期望 ${batchUnits.length} 项 analysis）`)
        }
        mergedAnalysis.push(...llmResult.analysis)
        if (llmResult.image_prompts) lastImagePrompts = llmResult.image_prompts
      }

      onProgress?.({
        phase: 'detecting',
        batch: batches.length,
        batch_count: batches.length,
        message: '正在合并换镜检测结果…',
        percent: calcDetectBatchPercent(batches.length, batches.length),
      })

      const result = await finalizeDetectNeedsFromAnalysis(
        items,
        units,
        mergedAnalysis,
        minimumTrueCount,
        maximumTrueCount,
        ratioRange,
        lastImagePrompts,
        segmentBounds,
      )

      logTaskSuccess('NarrationScene', 'llm-detect-done', {
        sentenceCount: items.length,
        detectUnitCount: units.length,
        imageNeededCount: result.needs.filter(Boolean).length,
        minimumTrueCount,
        maximumTrueCount,
        imageRatio: items.length ? Math.round(result.needs.filter(Boolean).length / items.length * 100) : 0,
        segmentDescriptionCount: result.segmentDescriptions.size,
        llmDirect: true,
        batched: true,
        batchCount: batches.length,
      })
      return result
    }

    onProgress?.({
      phase: 'detecting',
      message: '正在检测换镜段落…',
      percent: 5,
    })

    let llmResult = await callDetectImageNeedsLLMWithRetry(
      callCtx.system,
      buildDetectUserPayload(callCtx, units),
      units.length,
      callCtx.textModel,
    )
    if (llmResult.analysis.length !== units.length) {
      logTaskWarn('NarrationScene', 'llm-detect-invalid', { expected: units.length, got: llmResult.analysis.length })
      throw new Error(`配图换镜 AI 返回无效（期望 ${units.length} 项 analysis）`)
    }

    let trueUnitCount = countTrueDetectUnits(llmResult.analysis)
    if (trueUnitCount < minimumTrueCount) {
      logTaskWarn('NarrationScene', 'llm-detect-below-minimum', {
        trueUnitCount,
        minimumTrueCount,
        storyboardCount: items.length,
      })
      const retryHint = [
        `上次输出仅 ${trueUnitCount} 个 needs_image=true，低于最低要求 ${minimumTrueCount}（镜头数 ${items.length} 的 ${ratioRange} 下限）。`,
        `配图张数目标区间：${minimumTrueCount}～${maximumTrueCount} 张（${ratioRange}）。`,
        `每个配图段须覆盖 ${segmentBounds.minShots}～${segmentBounds.maxShots} 镜（含锚点镜），禁止超过 ${segmentBounds.maxShots} 镜共用一图。`,
        '请重新通读全文：只有「上一张图可原样复用、无任何可视差异」的单元才标 false；',
        '凡有场景/时间/动作/表情/物件/互动关系/视觉焦点变化的一律标 true；同场对白若出现新反应瞬间也要 true。',
        '输出完整 JSON，analysis 长度仍须与 sentences 相同。',
      ].join('')
      llmResult = await callDetectImageNeedsLLMWithRetry(
        callCtx.system,
        buildDetectUserPayload(callCtx, units, undefined, retryHint),
        units.length,
        callCtx.textModel,
      )
      if (llmResult.analysis.length !== units.length) {
        throw new Error(`配图换镜 AI 重试返回无效（期望 ${units.length} 项 analysis）`)
      }
      trueUnitCount = countTrueDetectUnits(llmResult.analysis)
    }

    const result = await finalizeDetectNeedsFromAnalysis(
      items,
      units,
      llmResult.analysis,
      minimumTrueCount,
      maximumTrueCount,
      ratioRange,
      llmResult.image_prompts,
      segmentBounds,
    )

    logTaskSuccess('NarrationScene', 'llm-detect-done', {
      sentenceCount: items.length,
      detectUnitCount: units.length,
      imageNeededCount: result.needs.filter(Boolean).length,
      minimumTrueCount,
      maximumTrueCount,
      imageRatio: items.length ? Math.round(result.needs.filter(Boolean).length / items.length * 100) : 0,
      segmentDescriptionCount: result.segmentDescriptions.size,
      llmDirect: true,
      batched: false,
    })
    return result
  } catch (err: any) {
    const message = String(err?.message || err || '')
    const isTimeout = /timeout|aborted due to timeout/i.test(message)
    logTaskError('NarrationScene', 'llm-detect-failed', { error: message, batched: useBatch })
    if (isTimeout) {
      const waitMin = Math.round(resolveDetectLLMTimeoutMs(units.length) / 60_000)
      const batchHint = useBatch
        ? `已启用分批检测（阈值 ${resolveDetectBatchThreshold(options?.batchThreshold)} 镜，每批 ${batchSize} 镜）。`
        : `镜头较多时可在页面调低「检测分批」阈值或减小每批镜数。`
      throw new Error(
        `配图换镜检测超时（${items.length} 镜 / ${units.length} 检测单元，已等待约 ${waitMin} 分钟）。${batchHint}若仍失败可在集设置中暂时关闭「思考模式」。`,
      )
    }
    throw new Error(message || '配图换镜 AI 检测失败')
  }
}

export type ImageDetectSource = 'llm' | 'balanced' | 'conservative'

export async function resolveImageNeeds(
  items: NarrationSentenceItem[],
  options?: {
    mode?: ImageDetectMode
    textModel?: string | null
    textThinking?: boolean
    style?: string
    fullNarrationLines?: string[]
    previousEpisodeNarration?: string[]
    batchThreshold?: number
    batchSize?: number
    onProgress?: NarrationImageBreakdownProgressCallback
  },
): Promise<{
  needs: boolean[]
  segmentDescriptions: Map<number, string>
  source: ImageDetectSource
}> {
  const mode = options?.mode || 'paragraph'
  try {
    const { needs, segmentDescriptions } = await detectImageNeedsWithLLM(
      items,
      mode,
      options?.textModel,
      false,
      options?.style || 'comic',
      options?.fullNarrationLines,
      options?.previousEpisodeNarration,
      {
        batchThreshold: options?.batchThreshold,
        batchSize: options?.batchSize,
        onProgress: options?.onProgress,
      },
    )
    return { needs, segmentDescriptions, source: 'llm' }
  } catch (err: unknown) {
    const message = String((err as Error)?.message || err || '配图换镜 AI 检测失败')
    logTaskWarn('NarrationScene', 'llm-detect-fallback-rules', {
      error: message.slice(0, 300),
      mode,
      sentenceCount: items.length,
    })
    options?.onProgress?.({
      phase: 'detecting',
      message: isLLMTransientProviderError(message)
        ? 'LLM 限流，改用规则兜底分配配图段…'
        : isLLMTimeoutError(message)
          ? 'LLM 检测超时，改用规则兜底分配配图段…'
          : 'LLM 检测失败，改用规则兜底分配配图段…',
      percent: 90,
    })
    const segmentBounds = resolveImageSegmentBounds(options?.style)
    const minimumTrueCount = resolveMinimumDetectTrueCount(items.length, segmentBounds)
    const maximumTrueCount = resolveMaximumDetectTrueCount(items.length, segmentBounds)
    const motionComic = isMotionComicStyle(options?.style)
    const rawNeeds = motionComic
      ? detectImageNeedsMotionComic(items)
      : mode === 'conservative'
        ? detectImageNeedsConservative(items)
        : detectImageNeedsBalanced(items)
    const needs = applyImageAnchorConstraints(rawNeeds, minimumTrueCount, maximumTrueCount, segmentBounds)
    return {
      needs,
      segmentDescriptions: new Map(),
      source: motionComic ? 'balanced' : (mode === 'conservative' ? 'conservative' : 'balanced'),
    }
  }
}

export type ParagraphPromptInput = {
  index: number
  startIndex: number
  sentences: string[]
  /** 分镜 TTS 粒度原句（与 narration_lines 一一对应，用于 subtitle_lines） */
  ttsSentences?: string[]
  layout: 'single' | 'diptych'
  sceneDescription?: string
}

type CharacterPromptHint = {
  name: string
  appearance?: string | null
  variant_label?: string | null
  portrait_label?: string
  has_portrait?: boolean
  gender?: '男' | '女'
}

function formatCharacterGenderForLLM(
  name: string,
  role?: string | null,
  appearance?: string | null,
): '男' | '女' | undefined {
  const label = resolveCharacterGenderLabelCn(name, role, appearance)
  if (label === '男性') return '男'
  if (label === '女性') return '女'
  return undefined
}

function buildFullNarrationForPrompt(options: {
  titleHook?: string | null
  titleFull?: string | null
  bodySentences?: string[]
}): string[] {
  const titleLine = String(options.titleFull || options.titleHook || '').trim()
  const body = (options.bodySentences || []).map(s => String(s || '').trim()).filter(Boolean)
  return titleLine ? [titleLine, ...body] : body
}

/** 根据全文旁白生成片头标题图 prompt */
export async function generateTitleImagePromptWithLLM(options: {
  titleHook?: string | null
  titleFull?: string | null
  bodySentences?: string[]
  previousEpisodeNarration?: string[]
  style?: string
  textModel?: string | null
  textThinking?: boolean
}): Promise<string | null> {
  const titleHook = options.titleHook?.trim() || null
  const titleFull = options.titleFull?.trim() || null
  if (!titleHook && !titleFull) return null

  const style = options.style || 'comic'
  const textModel = options.textModel || null
  const textThinking = options.textThinking ?? true
  const fullNarration = buildFullNarrationForPrompt(options)
  if (!fullNarration.length) return null

  try {
    const config = getTextConfig(textModel)
    if (!textConfigHasCredentials(config)) return null

    logTaskProgress('NarrationScene', 'llm-title-prompt-start', { model: config.model })

    const system = buildNarrationTitleImagePromptLLMSystem(style)

    const previousEpisodeNarration = options.previousEpisodeNarration || []
    const user = JSON.stringify({
      ...(previousEpisodeNarration.length ? { previous_episode_narration: previousEpisodeNarration } : {}),
      title: { hook: titleHook || titleFull, full: titleFull || titleHook },
      full_narration: fullNarration,
      output_format: { title_image_prompt: 'string，片头背景完整 prompt' },
    })

    const text = await callTextChat(system, user, textModel, textThinking, TITLE_IMAGE_PROMPT_LLM_TIMEOUT_MS)
    const parsed = extractJsonObject(text)
    const prompt = String(parsed?.title_image_prompt || '').trim()
    if (!prompt) {
      logTaskWarn('NarrationScene', 'llm-title-prompt-empty', {})
      return null
    }

    const normalized = resolveLLMImagePrompt(prompt, style, {
      titleHook: titleHook || undefined,
      titleFull,
      titleBodySentences: options.bodySentences,
    })
    if (!normalized) return null

    logTaskSuccess('NarrationScene', 'llm-title-prompt-done', {})
    return normalized
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-title-prompt-failed', { error: err.message })
    return null
  }
}

/** 按段落规则拆镜后，用文本模型分批生成配图提示词（素体中文 / 其他画风英文） */
export async function generateParagraphImagePromptsWithLLM(
  paragraphs: ParagraphPromptInput[],
  options?: {
    titleHook?: string | null
    titleFull?: string | null
    style?: string
    textModel?: string | null
    textThinking?: boolean
    characters?: CharacterPromptHint[]
    fullNarrationLines?: string[]
    previousEpisodeNarration?: string[]
    onProgress?: NarrationImageBreakdownProgressCallback
    /** 为 true 时原样保存 LLM 输出，不做 resolveLLMImagePrompt 清洗 */
    pureLlm?: boolean
    /** 每批段落数；默认见 NARRATION_IMAGE_PROMPT_BATCH_SIZE_DEFAULT */
    batchSize?: number
    /** 集数 ID：用于取消检测 */
    episodeId?: number
    /** 已废弃：配图文案 LLM 只出中文，英文由用户后期翻译 */
    inlineFluxEnglish?: boolean
    /** 每批成功后回调（用于增量落库） */
    onBatchComplete?: (payload: {
      batch: ParagraphPromptInput[]
      promptsByStartIndex: Map<number, string>
      englishByStartIndex?: Map<number, string>
      subtitleLinesByStartIndex: Map<number, string[]>
    }) => void | Promise<void>
  },
): Promise<{
  titlePrompt: string | null
  promptsByStartIndex: Map<number, string>
  englishByStartIndex: Map<number, string>
  subtitleLinesByStartIndex: Map<number, string[]>
} | null> {
  const style = options?.style || 'comic'
  const textModel = options?.textModel || null
  // 配图文案默认关思考（结构化 JSON）；显式传入 true 才开
  const textThinking = options?.textThinking ?? false
  const titleHook = options?.titleHook?.trim() || null
  const titleFull = options?.titleFull?.trim() || null
  void titleHook
  void titleFull
  const characters = options?.characters || []
  const promptBatchSize = resolveParagraphPromptBatchSize(options?.batchSize)
  // 配图文案只出中文；英文（若需要）由用户后期点翻译，不在此同轮共写
  const inlineFluxEnglish = false
  const motionComic = isMotionComicStyle(style)
  const batchGapMs = promptBatchSize <= 1 ? 400 : PARAGRAPH_PROMPT_LLM_BATCH_GAP_MS

  if (!paragraphs.length) {
    return {
      titlePrompt: null,
      promptsByStartIndex: new Map(),
      englishByStartIndex: new Map(),
      subtitleLinesByStartIndex: new Map(),
    }
  }

  try {
    const config = getTextConfig(textModel)
    assertTextConfigHasCredentials(config)

    const batches = chunkParagraphPromptBatch(paragraphs, promptBatchSize)
    const batchCount = batches.length

    const ollamaLlm = config.provider.toLowerCase() === 'ollama'
    if (ollamaLlm) {
      options?.onProgress?.({
        status: 'processing',
        phase: 'prompts',
        batch_count: batchCount,
        paragraph_count: paragraphs.length,
        message: `正在加载 LLM（${config.model}）…`,
        percent: 2,
      })
      // 释放可能以过大 num_ctx 占满显存的旧会话，再按配图文案 profile（9B=32K）预加载
      await unloadOllamaModel(config.model)
      await ensureLocalModelStage('llm', { ollamaModel: config.model })
    }

    const episodeHasDiptych = paragraphs.some(p => p.layout === 'diptych')
    const fullBodyLines = options?.fullNarrationLines || []
    const previousEpisodeNarration = options?.previousEpisodeNarration || []
    const fullNarrationForArc = fullBodyLines.length
      ? fullBodyLines.map(s => String(s || '').trim()).filter(Boolean)
      : buildFullNarrationForPrompt({
        titleHook,
        titleFull,
        bodySentences: [],
      })
    const weightArc = detectNarrationWeightArcTheme(fullNarrationForArc)
    const system = buildNarrationParagraphImagePromptLLMSystem(style, {
      hasCharacters: characters.length > 0,
      hasDiptych: episodeHasDiptych,
      weightArc,
    })
    const protagonistHints = characters.map(ch => ({
      name: ch.name,
      variantLabel: (ch as { variantLabel?: string | null }).variantLabel,
      appearance: ch.appearance,
    }))
    const naturalBodyLock = usesNarrationNaturalBodyLock(style)

    const fullNarration = fullBodyLines.length
      ? fullBodyLines.map(s => String(s || '').trim()).filter(Boolean)
      : buildFullNarrationForPrompt({
        titleHook,
        titleFull,
        bodySentences: [],
      })

    // 配图文案：短辨识差（distinct_identity_cue）防同框撞脸；长定妆外貌仍不整段塞入
    const characterPayload = isNarrationMinimalStyle(style)
      ? characters.map(ch => {
        const variantLabel = (ch as { variantLabel?: string | null }).variantLabel || ''
        const coerced = coerceMinimalCharacterAppearance(variantLabel, ch.appearance)
        const role = (ch as { role?: string | null }).role
        const spec = buildPortraitAppearanceSpecFromCharacter(
          { name: ch.name, role, appearance: coerced, variantLabel },
          style,
        )
        return {
          name: ch.name,
          variant_label: variantLabel,
          portrait_label: formatCharacterPortraitLabel(ch.name, variantLabel),
          has_portrait: !!(ch as { imageUrl?: string | null }).imageUrl?.trim(),
          gender: formatCharacterGenderForLLM(ch.name, role, ch.appearance),
          life_stage: variantLabel,
          portrait_default_outfit: spec.outfit,
          distinct_identity_cue: extractPortraitDistinctCueCn(coerced || ch.appearance),
        }
      })
      : characters.map(ch => {
        const variantLabel = (ch as { variantLabel?: string | null }).variantLabel || ''
        const role = (ch as { role?: string | null }).role
        const spec = buildPortraitAppearanceSpecFromCharacter(
          { name: ch.name, role, appearance: ch.appearance, variantLabel },
          style,
        )
        return {
          name: ch.name,
          variant_label: variantLabel,
          portrait_label: formatCharacterPortraitLabel(ch.name, variantLabel),
          has_portrait: !!(ch as { imageUrl?: string | null }).imageUrl?.trim(),
          gender: formatCharacterGenderForLLM(ch.name, role, ch.appearance),
          portrait_default_outfit: spec.outfit,
          distinct_identity_cue: extractPortraitDistinctCueCn(ch.appearance),
        }
      })

    const paragraphOutputHint = motionComic
      ? (episodeHasDiptych
        ? '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；layout=single 写一整段连贯中文（禁止【】六维标签，须覆盖画风/主体/场景/动作/光影/镜头/质感）；layout=diptych 用「左格：…；右格：…」各写一整段；有定妆须含对照定妆「label」与（身穿#hex…）'
        : '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；每条一整段连贯中文 image_prompt（禁止【画风规格】等六维标签，但仍须写全画风/主体/场景/动作/光影/镜头/质感）；有定妆须含对照定妆「label」与（身穿#hex…）')
      : inlineFluxEnglish
        ? '必须同时返回中文+英文两个字段：[{ "start_index":number, "image_prompt":"中文七维【画风规格】…【质感要求】", "flux_prompt_en":"English seven sections" }]。image_prompt 严禁英文；flux_prompt_en 严禁中文。英文顺序：Action and interaction / Environment and era / Camera and composition / Subjects in frame / Lighting and color / Art style spec / Render quality'
        : episodeHasDiptych
          ? '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；layout=single 按七维输出；layout=diptych 按【左格】【右格】各写完整七维'
          : '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；每条一条七维中文 image_prompt'

    const fullNarrationSummary = compressFullNarrationLines(fullNarration)
      || (Array.isArray(fullNarration) ? fullNarration.slice(0, 6).join('→') : String(fullNarration || '').slice(0, 200))
    const previousEpisodeSummary = previousEpisodeNarration.length
      ? (compressFullNarrationLines(previousEpisodeNarration) || previousEpisodeNarration.slice(0, 6).join('→'))
      : ''

    const promptsByStartIndex = new Map<number, string>()
    const englishByStartIndex = new Map<number, string>()
    const reportProgress = options?.onProgress
    let skippedBatches = 0
    let consecutiveBatchFails = 0
    let completedBatches = 0
    let activeBatches = 0
    let launchSeq = 0
    /** 全局限流：失败后推迟「新开批」时间，但不阻塞已完成 worker 立刻领下一批的逻辑之外的额外长睡 */
    let rateLimitUntil = 0
    const withSharedLock = createAsyncMutex()
    const batchConcurrency = ollamaLlm
      ? 1
      : Math.max(1, Math.min(PARAGRAPH_PROMPT_LLM_BATCH_CONCURRENCY, batches.length || 1))

    const emitPromptProgress = (extra?: {
      message?: string
      percent?: number
      lastBatch?: number
    }) => {
      const done = completedBatches
      const active = activeBatches
      const total = batches.length
      const message = extra?.message ?? (
        batchConcurrency > 1
          ? `配图文案：已完成 ${done}/${total} 批，进行中 ${active} 路（并发 ${batchConcurrency}）…`
          : `正在生成配图文案（${done}/${total} 批）…`
      )
      reportProgress?.({
        status: 'processing',
        phase: 'prompts',
        // 兼容旧前端：batch 表示已完成批次数，避免显示「当前批号」乱跳
        batch: done,
        batch_count: total,
        batches_done: done,
        batches_active: active,
        concurrency: batchConcurrency,
        paragraph_count: paragraphs.length,
        message,
        percent: extra?.percent ?? calcPromptBatchPercent(done, total),
      })
    }

    logTaskProgress('NarrationScene', 'llm-paragraph-prompt-start', {
      paragraphCount: paragraphs.length,
      batchCount,
      batchSize: promptBatchSize,
      concurrency: batchConcurrency,
      model: config.model,
      thinking: textThinking,
      inlineFluxEnglish,
    })

    const runOneBatch = async (batchIndex: number) => {
      if (options?.episodeId != null) {
        assertNarrationImageBreakdownNotCancelled(options.episodeId)
      }
      const batch = batches[batchIndex]

      // 仅首波并发启动错峰；任一完成后立刻领下一批，不再按批号 sleep
      const myLaunch = launchSeq++
      if (batchConcurrency > 1 && myLaunch < batchConcurrency) {
        await sleep(80 * myLaunch)
      } else if (batchConcurrency <= 1 && batchIndex > 0) {
        await sleep(batchGapMs)
      }
      // 失败退避：只在开新批前短等，避免占着并发槽长睡
      const rateWait = Math.max(0, rateLimitUntil - Date.now())
      if (rateWait > 0) await sleep(Math.min(rateWait, 3_000))

      activeBatches++
      emitPromptProgress({
        message: batchConcurrency > 1
          ? `配图文案：已完成 ${completedBatches}/${batches.length} 批，进行中 ${activeBatches} 路（正在跑第 ${batchIndex + 1} 批）…`
          : `正在生成配图文案（第 ${batchIndex + 1}/${batches.length} 批）…`,
      })

      try {
      const batchHasDiptych = batch.some(p => p.layout === 'diptych')
      const batchSystem = batchHasDiptych === episodeHasDiptych
        ? system
        : buildNarrationParagraphImagePromptLLMSystem(style, {
          hasCharacters: characters.length > 0,
          hasDiptych: batchHasDiptych,
          weightArc,
        })

      // （原 reportProgress 启动文案已由 emitPromptProgress 覆盖）

      // 每段只带：全文摘要 + 本段旁白 + enrichment；不再塞长 prior_narration 原文数组
      const user = JSON.stringify({
        ...(previousEpisodeSummary ? { previous_episode_summary: previousEpisodeSummary } : {}),
        ...(naturalBodyLock
          ? { protagonist_body_policy: '标准比例动漫身材匀称，禁止写胖瘦体型词' }
          : {}),
        ...(weightArc && !naturalBodyLock
          ? {
            weight_arc: {
              theme_labels: weightArc.theme_labels,
              tier_spec_table: weightArc.tier_spec_table,
            },
          }
          : {}),
        full_narration_summary: fullNarrationSummary,
        characters: characterPayload,
        paragraphs: batch.map(p => {
          const priorNarration = buildPriorNarrationLines(previousEpisodeNarration, fullBodyLines, p.startIndex)
          const priorTimelineSnip = compressTimelineNarrationLines(priorNarration) || undefined
          const sceneEnrichment = buildNarrationSceneEnrichment({
            narrationLines: p.sentences,
            priorLines: priorNarration,
            detectSceneDescription: p.sceneDescription,
          })
          const base = {
            paragraph_index: p.index,
            start_index: p.startIndex,
            layout: p.layout,
            narration_lines: p.sentences,
            ...(motionComic
              ? {
                shot_card: buildMotionComicShotCard(p.sentences, { paragraphIndex: p.index }),
                shot_card_rule: '必须按 shot_card 写景别/姿态/光影；禁止无视 card 复读万能全身平视站立句',
              }
              : {}),
            ...(priorTimelineSnip ? { prior_timeline_snip: priorTimelineSnip } : {}),
            ...(p.sceneDescription ? { detect_scene_description: p.sceneDescription } : {}),
            ...(sceneEnrichment ? { scene_enrichment: sceneEnrichment } : {}),
            ...(() => {
              if (!characters.length) return {}
              const expected = (motionComic
                ? resolveMotionComicOnScreenPortraitNames({
                  characters,
                  dialogue: p.sentences?.[0] || null,
                  narrationLines: p.sentences,
                })
                : resolveExpectedPortraitNamesForPrompt({
                  characters,
                  dialogue: p.sentences?.[0] || null,
                  narrationLines: p.sentences,
                }).slice(0, 1))
              if (!expected.length) return {}
              return {
                required_portrait_labels: expected.map(name => {
                  const ch = characters.find(c => String(c.name || '').trim() === name)
                  return formatCharacterPortraitLabel(
                    name,
                    (ch as { variantLabel?: string | null })?.variantLabel,
                  )
                }),
                ...(motionComic && expected.length >= 2
                  ? {
                    presence_rule: '本段 narration_lines 已点名/对白多人：必须同框写出 required_portrait_labels 全部对照定妆，禁止写无配角，禁止只画其中一人；同一配图严禁撞脸/双胞胎克隆/同脸复制',
                  }
                  : motionComic
                    ? {
                      presence_rule: '本段仅一名焦点角色：只画 required_portrait_labels 首项，可写无配角；禁止硬塞未点名角色',
                    }
                    : {}),
              }
            })(),
          }
          if (naturalBodyLock) return base
          const suggestedTier = inferParagraphBodyWeightTier(p.sentences, priorNarration, fullBodyLines)
          const stage = extractNarrationBodyStageFromText(p.sentences.join('\n'))
            || extractNarrationBodyStageFromText(priorNarration.join('\n'))
            || '青年'
          return {
            ...base,
            suggested_body_weight_tier: suggestedTier,
            ...(suggestedTier !== 'standard'
              ? { suggested_body_spec: formatNarrationBodyWeightSpec(stage, suggestedTier) }
              : {}),
          }
        }),
        output_format: {
          paragraph_prompts: paragraphOutputHint,
          writing_rule: motionComic
            ? '只根据本段 narration_lines + shot_card 写一整段连贯中文（禁止【】六维标签）：必须遵守 shot_card 景别/姿态/光影；表情与动作必须符合该段旁白，禁止面无表情站桩、禁止搬用别段动作、禁止复读万能全身平视句；画风用短标记；full_narration_summary/prior/scene_enrichment 只补场景；有定妆须含对照定妆「label」与（身穿#hex…）；严格 JSON'
            : inlineFluxEnglish
              ? 'image_prompt 必须是中文七维（含【画风规格】【画面主体】等全角括号），禁止把英文写进 image_prompt；flux_prompt_en 为短英文七维，Subjects 用 portrait_label；两项都要有；严格 JSON'
              : '只根据本段 narration_lines 写七维中文：【画面主体】表情与【核心细节动作】必须符合该段旁白正在发生的事与情绪，禁止面无表情站桩、禁止搬用别段动作；full_narration_summary/prior 只补场景；勿复述长旁白原文；输出严格 JSON',
          paragraph_beat_match: motionComic
            ? '硬性：先从 narration_lines 提取动作动词与情绪词，再写入人物表情与可见动作；冲跑刺拦须写位移重心，禁止只写三分之四侧站立比划；塞钱就画递钱、僵住就画僵住、质问就画张嘴/指向；禁止与本段无关的通用姿势'
            : '硬性：先从 narration_lines 提取动作动词与情绪词，再写入【核心细节动作】与【画面主体】表情；塞钱就画递钱、僵住就画僵住、质问就画张嘴/指向；禁止与本段无关的通用姿势',
          scene_enrichment_rule: motionComic
            ? '若含 scene_enrichment：场景陈设写入 place/carriers/props；actions 仅当与本段 narration_lines 一致时写入动作描述；执行 must_use'
            : '若含 scene_enrichment：【年代场景】写入 place/carriers/props；actions 仅当与本段 narration_lines 一致时写入【核心细节动作】；执行 must_use',
          paragraph_outfit_continuity:
            '同一 start_index 内（身穿#hex）须一致；跨段按旁白+场所换装，禁止全片抄同一套定妆服/同一毛衣；#hex紧挨款式词；禁止中文色词',
          ...(characters.length
            ? {
              paragraph_portrait_spec: motionComic
                ? MOTION_COMIC_PORTRAIT_OUTFIT_LLM_RULE
                : PORTRAIT_STORYBOARD_OUTFIT_LLM_RULE,
              portrait_label_rule: motionComic
                ? '必须遵守本段 required_portrait_labels：列表有几人就写几个对照定妆（不封顶）；本段点名/对白多人时禁止无配角、禁止漏人；禁止用主人公/第一人称标签顶替本段点名或说话人'
                : '若段落含 required_portrait_labels：【画面主体】只写这 1 个对照定妆；画面仅此一人入镜，禁止第二人手/背影/侧影；禁止用主人公/第一人称标签顶替本段点名或说话人',
            }
            : {}),
          ...(naturalBodyLock
            ? {
              paragraph_body_policy: motionComic
                ? '全片统一标准比例动漫审美；禁止写胖瘦体型词；有定妆只写对照定妆标签+细化表情+服装姿态'
                : '全片统一标准比例动漫审美；【画面主体】禁止写胖瘦体型词；有定妆只写对照定妆标签+细化表情+服装姿态',
            }
            : weightArc
              ? {
                paragraph_body_weight:
                  'suggested_body_weight_tier 与【画面主体】躯干宽高须一致',
              }
              : {}),
        },
      })

      let rows: Array<{ start_index?: number; image_prompt?: string }> | null = null
      let lastRaw = ''
      let lastError = ''

      // 同批多次重试：超时 / 429 / JSON 不完整均可退避再打（智谱免费配额易抖）
      const batchAttempts = PARAGRAPH_PROMPT_LLM_BATCH_RETRIES + 1
      for (let attempt = 0; attempt < batchAttempts; attempt++) {
        if (attempt > 0) {
          const waitMs = isLLMTransientProviderError(lastError) ? 3_000 * attempt : 2_000 * attempt
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-batch-retry', {
            batch: batchIndex + 1,
            attempt,
            batchCount: batches.length,
            waitMs,
            lastError: lastError.slice(0, 200),
          })
          emitPromptProgress({
            message: `第 ${batchIndex + 1} 批重试中（${attempt + 1}/${batchAttempts}）；已完成 ${completedBatches}/${batches.length}，进行中 ${activeBatches} 路…`,
          })
          await sleep(waitMs)
        }

        const maxTokens = inlineFluxEnglish
          ? Math.max(resolveParagraphPromptMaxTokens(batch.length), 16_000)
          : resolveParagraphPromptMaxTokens(batch.length)
        logTaskProgress('NarrationScene', 'llm-paragraph-prompt-batch', {
          batch: batchIndex + 1,
          batchCount: batches.length,
          paragraphCount: batch.length,
          attempt: attempt + 1,
          timeoutMs: resolveParagraphPromptLLMTimeoutMs(batch.length, attempt + 1),
          maxTokens,
          thinking: textThinking,
          numCtx: resolveOllamaNumCtx(config.model, 'narration_image_prompt'),
          model: config.model,
        })

        try {
          const text = await callTextChat(
            batchSystem,
            user,
            textModel,
            textThinking,
            resolveParagraphPromptLLMTimeoutMs(batch.length, attempt + 1),
            true,
            maxTokens,
            'narration_image_prompt',
          )
          lastRaw = text
          rows = parseParagraphPromptRows(text, batch, { allowPartial: true })
          if (rows?.length) break
          lastError = 'invalid or incomplete paragraph_prompts JSON'
          // JSON 无效：继续重试，勿直接放弃整批
          continue
        } catch (err: any) {
          lastError = String(err?.message || err || 'unknown error')
          if (isLLMRetryableError(lastError) && attempt < batchAttempts - 1) {
            continue
          }
          // 不可重试或已用尽：留下 lastRaw/lastError，走单段兜底
          break
        }
      }

      const buildPortraitCtx = (batchItem?: ParagraphPromptInput) => {
        const lines = (batchItem?.ttsSentences?.length
          ? batchItem.ttsSentences
          : batchItem?.sentences) || []
        return {
          dialogue: lines[0] || null,
          narrationLines: lines,
          allowDualPortrait: motionComic,
        }
      }

      const buildRequiredPortraitFields = (item: ParagraphPromptInput) => {
        const lines = item.ttsSentences?.length ? item.ttsSentences : item.sentences
        const expected = (motionComic
          ? resolveMotionComicOnScreenPortraitNames({
            characters,
            dialogue: lines?.[0] || null,
            narrationLines: lines,
          })
          : resolveExpectedPortraitNamesForPrompt({
            characters,
            dialogue: lines?.[0] || null,
            narrationLines: lines,
          }).slice(0, 1))
        if (!expected.length) return {}
        const labels = expected.map(name => {
          const ch = characters.find(c => String(c.name || '').trim() === name)
          return formatCharacterPortraitLabel(name, (ch as { variantLabel?: string | null })?.variantLabel)
        })
        return {
          required_portrait_labels: labels,
          ...(motionComic && labels.length >= 2
            ? { presence_rule: '本段 narration_lines 已点名/对白多人：必须同框写出全部 required_portrait_labels，禁止无配角' }
            : {}),
          retry_hint: motionComic
            ? (labels.length >= 2
              ? `【在场角色·重写】上一条在场角色不对。本段必须同框对照定妆「${labels[0]}」与「${labels[1]}」，分句写清各自位置姿态表情与（身穿…）；禁止无配角；禁止漏画或顶替。`
              : `【在场角色·重写】上一条定妆标签错误。本段只画对照定妆「${labels[0]}」；旁白未点名其他人时不要硬塞第二人；表情与动作须符合本段 narration_lines。`)
            : `【定妆标签·重写】上一条【画面主体】定妆标签错误或出现多人同框。本段只允许 1 个对照定妆「${labels[0]}」` +
              `；禁止第二人任何可视部分（含手/背影/侧影/画外伸手）；互动只写该焦点角色本人肢体与手持物；表情与动作须符合本段 narration_lines（禁止面无表情站桩、禁止与旁白无关动作）。`,
        }
      }

      /** 本批拒收原因：用于进度文案（勿把「近重复」误报成定妆不符） */
      const rejectReasonByStart = new Map<number, 'format' | 'portrait' | 'duplicate'>()

      const commitRow = (
        row: { start_index?: number; image_prompt?: string; flux_prompt_en?: string },
        fallbackItem?: ParagraphPromptInput,
        opts?: { enforcePortrait?: boolean; forceAfterAlign?: boolean; allowDuplicate?: boolean },
      ) => {
        const batchItem = batch.find(p => p.startIndex === Number(row?.start_index)) ?? fallbackItem
        const startIndex = Number(row?.start_index ?? batchItem?.startIndex)
        const prompt = String(row?.image_prompt || '').trim()
        if (!Number.isFinite(startIndex) || !prompt) return false
        // 硬性：须含汉字且达最低信息量；不再强制【】六维标签
        const hasCn = /[\u4e00-\u9fff]/.test(prompt)
        const hasPortraitTag = /对照定妆「/.test(prompt)
        const minLen = motionComic ? MOTION_COMIC_IMAGE_PROMPT_MIN_LEN : 24
        const narrLines = batchItem?.sentences || []
        const forceAccept = !!opts?.forceAfterAlign
        const tooThin = motionComic && !forceAccept && prompt.length < minLen
        const standShell = motionComic && !forceAccept && isMotionComicStandPoseShellPrompt(prompt, narrLines)
        const emotionFar = motionComic && !forceAccept && isMotionComicEmotionWithoutCloseupPrompt(prompt, narrLines)
        const acceptOk = hasCn
          && prompt.length >= (forceAccept ? 24 : minLen)
          && !tooThin
          && !standShell
          && !emotionFar
        if (!acceptOk) {
          rejectReasonByStart.set(startIndex, 'format')
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-cn-missing', {
            startIndex,
            preview: prompt.slice(0, 120),
            hasCn,
            hasPortraitTag,
            length: prompt.length,
            minLen,
            tooThin: !!tooThin,
            standShell: !!standShell,
            emotionFar: !!emotionFar,
          })
          const fluxEn = String(row?.flux_prompt_en || '').trim()
          if (fluxEn) englishByStartIndex.set(startIndex, fluxEn)
          else if (/Action and interaction|Camera and composition/i.test(prompt)) {
            englishByStartIndex.set(startIndex, prompt)
          }
          return false
        }

        const portraitCtx = buildPortraitCtx(batchItem)
        const enforcePortrait = opts?.enforcePortrait !== false && characters.length > 0
        if (enforcePortrait && !opts?.forceAfterAlign) {
          const check = validateImagePromptPortraitLabels(prompt, characters, portraitCtx)
          if (!check.ok) {
            rejectReasonByStart.set(startIndex, 'portrait')
            logTaskWarn('NarrationScene', 'llm-paragraph-prompt-portrait-mismatch', {
              startIndex,
              reason: check.reason,
              expected: check.expected,
              actual: check.actual,
              preview: prompt.slice(0, 120),
            })
            return false
          }
        }

        // 拦截模型复读：与本轮已落库文案动作指纹过近则拒收，走单段重写
        // forceAfterAlign / allowDuplicate：单段兜底末次允许落库，避免整批空过
        const peerPrompts = [...promptsByStartIndex.entries()]
          .filter(([idx]) => idx !== startIndex)
          .map(([, p]) => p)
        const dup = isNearDuplicateImagePrompt(prompt, peerPrompts)
        if (dup && !opts?.forceAfterAlign && !opts?.allowDuplicate) {
          rejectReasonByStart.set(startIndex, 'duplicate')
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-duplicate', {
            startIndex,
            preview: prompt.slice(0, 120),
          })
          return false
        }
        if (dup && (opts?.forceAfterAlign || opts?.allowDuplicate)) {
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-duplicate-forced', {
            startIndex,
            preview: prompt.slice(0, 120),
          })
        }

        rejectReasonByStart.delete(startIndex)
        const injected = options?.pureLlm
          ? injectPortraitSpecIntoImagePromptCn(prompt, characters, style, portraitCtx)
          : injectPortraitSpecIntoImagePromptCn(
            resolveLLMImagePrompt(prompt, style, {
              narrationLines: batchItem?.sentences,
              fullNarrationLines: options?.fullNarrationLines,
              timelineUpToIndex: startIndex,
              protagonistHints,
            }),
            characters,
            style,
            portraitCtx,
          )
        const repaired = repairNarrationStandingFullBodyPrompt(
          repairNarrationFaceCloseupVsActionPrompt(injected),
        )
        promptsByStartIndex.set(
          startIndex,
          motionComic ? repairMotionComicContinuousImagePrompt(repaired) : repaired,
        )
        const fluxEn = String(row?.flux_prompt_en || '').trim()
        if (fluxEn) englishByStartIndex.set(startIndex, fluxEn)
        return true
      }

      for (let i = 0; i < (rows?.length || 0); i++) {
        await withSharedLock(() => {
          commitRow(rows![i], batch[i])
        })
      }

      // 缺段 / 定妆标签校验失败：单段重写（带 required_portrait_labels）
      let missing = await withSharedLock(() => batch.filter(p => !promptsByStartIndex.has(p.startIndex)))
      if (missing.length && missing.length < batch.length) {
        logTaskWarn('NarrationScene', 'llm-paragraph-prompt-partial', {
          batch: batchIndex + 1,
          got: batch.length - missing.length,
          missing: missing.map(p => p.startIndex),
          responsePreview: lastRaw.slice(0, 240),
        })
      }
      for (let mi = 0; mi < missing.length; mi++) {
        const item = missing[mi]
        const rejectReason = rejectReasonByStart.get(item.startIndex)
        const portraitFields = buildRequiredPortraitFields(item)
        // 仅真实定妆校验失败才提示「定妆标签不符」；有 required_portrait_labels 不等于标签不符
        const isPortraitRetry = rejectReason === 'portrait'
        const isDuplicateRetry = rejectReason === 'duplicate'
        const isFormatRetry = rejectReason === 'format'
        const retryHintExtra = isDuplicateRetry
          ? '【动作去重·硬性】禁止照抄填空示例或其它段的同一套动作（如推开红包/堂屋账本）；必须严格按本段 narration_lines 写全新表情与动作，场景与镜头也须贴合本段。'
          : isFormatRetry
            ? '【信息量/景别·硬性】文案须≥180字；须含前中后景陈设+定妆+身穿#hex+景别俯仰头高%；旁白有冲跑刺拦等动词时禁止只写站立比划；纯惊吓/哭愣须近景或中近景，禁止全身远站或滥用过肩。'
            : ''
        const mergedPortraitFields = retryHintExtra
          ? {
            ...portraitFields,
            retry_hint: [String((portraitFields as { retry_hint?: string }).retry_hint || '').trim(), retryHintExtra]
              .filter(Boolean)
              .join(''),
          }
          : portraitFields
        emitPromptProgress({
          message: isDuplicateRetry
            ? `第 ${batchIndex + 1} 批近重复重写 ${mi + 1}/${missing.length}；已完成 ${completedBatches}/${batches.length}，进行中 ${activeBatches} 路…`
            : isPortraitRetry
              ? `第 ${batchIndex + 1} 批定妆不符重写 ${mi + 1}/${missing.length}；已完成 ${completedBatches}/${batches.length}，进行中 ${activeBatches} 路…`
              : isFormatRetry
                ? `第 ${batchIndex + 1} 批格式重写 ${mi + 1}/${missing.length}；已完成 ${completedBatches}/${batches.length}，进行中 ${activeBatches} 路…`
                : `第 ${batchIndex + 1} 批缺段补写 ${mi + 1}/${missing.length}；已完成 ${completedBatches}/${batches.length}，进行中 ${activeBatches} 路…`,
        })
        const singleUser = JSON.stringify({
          ...(previousEpisodeSummary ? { previous_episode_summary: previousEpisodeSummary } : {}),
          full_narration_summary: fullNarrationSummary,
          characters: characterPayload,
          paragraphs: (() => {
            const priorNarration = buildPriorNarrationLines(previousEpisodeNarration, fullBodyLines, item.startIndex)
            const priorTimelineSnip = compressTimelineNarrationLines(priorNarration) || undefined
            const sceneEnrichment = buildNarrationSceneEnrichment({
              narrationLines: item.sentences,
              priorLines: priorNarration,
              detectSceneDescription: item.sceneDescription,
            })
            return [{
              paragraph_index: item.index,
              start_index: item.startIndex,
              layout: item.layout,
              narration_lines: (item.ttsSentences?.length ? item.ttsSentences : item.sentences),
              ...(motionComic
                ? {
                  shot_card: buildMotionComicShotCard(
                    item.ttsSentences?.length ? item.ttsSentences : item.sentences,
                    { paragraphIndex: item.index },
                  ),
                  shot_card_rule: '必须按 shot_card 写景别/姿态/光影；禁止无视 card 复读万能全身平视站立句',
                }
                : {}),
              ...(priorTimelineSnip ? { prior_timeline_snip: priorTimelineSnip } : {}),
              ...(item.sceneDescription ? { detect_scene_description: item.sceneDescription } : {}),
              ...(sceneEnrichment ? { scene_enrichment: sceneEnrichment } : {}),
              ...mergedPortraitFields,
            }]
          })(),
          output_format: {
            paragraph_prompts: motionComic
              ? '[{ start_index: number, image_prompt: string }]，仅 1 条；一整段连贯中文（禁止【】六维标签，须覆盖画风/主体/场景/动作/光影/镜头/质感）；有定妆须含对照定妆「label」'
              : inlineFluxEnglish
                ? '[{ start_index, image_prompt, flux_prompt_en }]，仅 1 条；中文七维 + 短英文七维'
                : '[{ start_index: number, image_prompt: string }]，仅 1 条；按七维中文输出完整 image_prompt',
            writing_rule: motionComic
              ? '只根据本段 narration_lines + shot_card 写一整段连贯中文；必须遵守 shot_card 景别/姿态/光影；表情与动作必须符合该段旁白，禁止面无表情站桩、禁止搬用别段动作、禁止照抄填空示例、禁止【】六维标签；full_narration_summary/prior 只补场景；严格 JSON'
              : inlineFluxEnglish
                ? '写中文七维并同步短英文 flux_prompt_en；严格 JSON'
                : '只根据本段 narration_lines 写七维；表情与【核心细节动作】必须符合该段旁白正在发生的事，禁止面无表情站桩、禁止搬用别段动作、禁止照抄填空示例；full_narration_summary/prior 只补场景；严格 JSON',
            paragraph_beat_match: motionComic
              ? '硬性：从 narration_lines 提取动作与情绪再写入人物表情与可见动作；有冲跑刺拦时禁止只写站立比划；禁止与本段无关的通用姿势；禁止复用其它段或示例里的推红包/站桩动作'
              : '硬性：从 narration_lines 提取动作与情绪再写入【核心细节动作】与表情；禁止与本段无关的通用姿势；禁止复用其它段或示例里的推红包/站桩动作',
            scene_enrichment_rule: motionComic
              ? '若含 scene_enrichment：场景陈设写入 place/carriers/props；actions 仅当与本段 narration_lines 一致时写入动作描述'
              : '若含 scene_enrichment：【年代场景】写入 place/carriers/props；actions 仅当与本段 narration_lines 一致时写入【核心细节动作】',
            ...(Object.keys(mergedPortraitFields).length > 0
              ? {
                portrait_label_rule: motionComic
                  ? '必须遵守本段 required_portrait_labels：按列表人数写定妆标签；≥2 人必须同框写齐；禁止擅自改成单人；禁止用主人公/第一人称标签顶替'
                  : '必须遵守本段 required_portrait_labels：【画面主体】只写列表中那 1 个对照定妆；画面仅此一人，禁止第二人手/背影；禁止用主人公/第一人称标签顶替',
              }
              : {}),
          },
        })
        try {
          let singleOk = false
          const singleAttempts = 3
          for (let sa = 0; sa < singleAttempts && !singleOk; sa++) {
            if (sa > 0) {
              logTaskWarn('NarrationScene', 'llm-paragraph-prompt-single-retry', {
                startIndex: item.startIndex,
                attempt: sa + 1,
                batch: batchIndex + 1,
                rejectReason: rejectReasonByStart.get(item.startIndex) || rejectReason || null,
              })
              await sleep(1_500 * sa)
            }
            try {
              const text = await callTextChat(
                batchSystem,
                singleUser,
                textModel,
                textThinking,
                resolveParagraphPromptLLMTimeoutMs(1, sa + 1),
                true,
                resolveParagraphPromptMaxTokens(1),
                'narration_image_prompt',
              )
              const singleRows = parseParagraphPromptRows(text, [item], { allowPartial: true })
              const rowToCommit = singleRows?.[0]
                || salvageParagraphPromptRowsFromRaw(text, [item.startIndex])[0]
                || null
              if (rowToCommit) {
                const committed = await withSharedLock(() => commitRow(rowToCommit, item))
                if (!committed && !(await withSharedLock(() => promptsByStartIndex.has(item.startIndex))) && sa === singleAttempts - 1) {
                  // 末次兜底：强制写入（跳过定妆校验 + 近重复拦截）
                  logTaskWarn('NarrationScene', 'llm-paragraph-prompt-force-accept', {
                    startIndex: item.startIndex,
                    required: (mergedPortraitFields as { required_portrait_labels?: string[] }).required_portrait_labels,
                    rejectReason: rejectReasonByStart.get(item.startIndex) || rejectReason || null,
                  })
                  await withSharedLock(() => {
                    commitRow(rowToCommit, item, { forceAfterAlign: true, allowDuplicate: true })
                  })
                } else if (!committed && !(await withSharedLock(() => promptsByStartIndex.has(item.startIndex))) && rejectReasonByStart.get(item.startIndex) === 'portrait') {
                  logTaskWarn('NarrationScene', 'llm-paragraph-prompt-portrait-force-align', {
                    startIndex: item.startIndex,
                    required: (mergedPortraitFields as { required_portrait_labels?: string[] }).required_portrait_labels,
                  })
                  await withSharedLock(() => {
                    commitRow(rowToCommit, item, { forceAfterAlign: true })
                  })
                }
                if (await withSharedLock(() => promptsByStartIndex.has(item.startIndex))) singleOk = true
              } else {
                lastError = 'invalid or incomplete single paragraph_prompts JSON'
              }
            } catch (err: any) {
              const msg = String(err?.message || err)
              lastError = msg
              if (!isLLMRetryableError(msg) && sa >= 1) break
              logTaskWarn('NarrationScene', 'llm-paragraph-prompt-single-failed', {
                startIndex: item.startIndex,
                attempt: sa + 1,
                error: msg.slice(0, 200),
              })
            }
          }
        } catch (err: any) {
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-single-failed', {
            startIndex: item.startIndex,
            error: String(err?.message || err).slice(0, 200),
          })
        }
        await sleep(800)
      }

      missing = await withSharedLock(() => batch.filter(p => !promptsByStartIndex.has(p.startIndex)))
      const batchPrompts = new Map<number, string>()
      await withSharedLock(() => {
        for (const item of batch) {
          const p = promptsByStartIndex.get(item.startIndex)
          if (p) batchPrompts.set(item.startIndex, p)
        }
      })
      if (batchPrompts.size) {
        const batchEnglish = new Map<number, string>()
        await withSharedLock(() => {
          for (const [si, en] of englishByStartIndex) {
            if (batchPrompts.has(si)) batchEnglish.set(si, en)
          }
        })
        await options?.onBatchComplete?.({
          batch: batch.filter(p => batchPrompts.has(p.startIndex)),
          promptsByStartIndex: batchPrompts,
          englishByStartIndex: batchEnglish,
          subtitleLinesByStartIndex: new Map(),
        })
      }

      if (missing.length && !batchPrompts.size) {
        await withSharedLock(() => {
          skippedBatches++
          consecutiveBatchFails++
        })
        logTaskWarn('NarrationScene', 'llm-paragraph-prompt-batch-skip', {
          batch: batchIndex + 1,
          batchCount: batches.length,
          expected: batch.length,
          got: 0,
          consecutiveBatchFails,
          responsePreview: lastRaw.slice(0, 400),
          lastError: lastError.slice(0, 200),
        })
        // 整批失败：不中断后续；限流写入 shared window，本 worker 立刻可领下一批
        const coolMs = Math.min(8_000, 1_500 * Math.max(1, consecutiveBatchFails))
        rateLimitUntil = Math.max(rateLimitUntil, Date.now() + coolMs)
        emitPromptProgress({
          message: `第 ${batchIndex + 1} 批失败已跳过；已完成 ${completedBatches}/${batches.length}，进行中 ${Math.max(0, activeBatches - 1)} 路…`,
        })
      } else {
        await withSharedLock(() => {
          consecutiveBatchFails = 0
        })
        emitPromptProgress({
          message: missing.length
            ? `第 ${batchIndex + 1} 批部分完成（缺 ${missing.length} 段）；已完成 ${completedBatches}/${batches.length}，进行中 ${Math.max(0, activeBatches - 1)} 路…`
            : undefined,
        })
      }
      } finally {
        activeBatches = Math.max(0, activeBatches - 1)
        completedBatches++
        emitPromptProgress()
      }
    }

    emitPromptProgress({
      message: batchConcurrency > 1
        ? `配图文案并发生成中（最多同时 ${batchConcurrency} 批，完成一路立即开下一路）…`
        : `正在生成配图文案（共 ${batches.length} 批）…`,
      percent: 4,
    })

    await mapPool(batches.length, batchConcurrency, runOneBatch)

    if (paragraphs.length && promptsByStartIndex.size !== paragraphs.length) {
      logTaskWarn('NarrationScene', 'llm-paragraph-prompt-incomplete', {
        expected: paragraphs.length,
        got: promptsByStartIndex.size,
        skippedBatches,
        concurrency: batchConcurrency,
      })
      // 返回已成功部分，供落库 +「补全缺失」；勿用 null 抹掉本轮结果
      return { titlePrompt: null, promptsByStartIndex, englishByStartIndex, subtitleLinesByStartIndex: new Map() }
    }

    logTaskSuccess('NarrationScene', 'llm-paragraph-prompt-done', {
      paragraphCount: paragraphs.length,
      batchCount: batches.length,
      concurrency: batchConcurrency,
      englishCount: englishByStartIndex.size,
      inlineFluxEnglish,
      skippedBatches,
    })
    return { titlePrompt: null, promptsByStartIndex, englishByStartIndex, subtitleLinesByStartIndex: new Map() }
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown error')
    logTaskError('NarrationScene', 'llm-paragraph-prompt-failed', { error: message })
    if (isLLMTimeoutError(message)) {
      const waitMin = Math.round(resolveParagraphPromptLLMTimeoutMs(promptBatchSize) / 60_000)
      throw new Error(
        `配图 AI 调用超时（共 ${paragraphs.length} 段，每批最多 ${promptBatchSize} 段，单批最长约 ${waitMin} 分钟）。已成功的批次已保存，请点「补全缺失文案」继续。`,
      )
    }
    throw err
  }
}
