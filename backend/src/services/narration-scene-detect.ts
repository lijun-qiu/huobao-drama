import { getTextConfig } from './ai.js'
import { callTextChat } from './text-chat.js'
import {
  buildNarrationImageDetectLLMSystem,
  buildNarrationParagraphImagePromptLLMSystem,
  buildNarrationSceneSegmentsImagePromptLLMSystem,
  buildNarrationTitleImagePromptLLMSystem,
  buildMinimalPortraitPostureHint,
  coerceMinimalCharacterAppearance,
  resolveLLMImagePrompt,
  isNarrationDateOnlySentence,
  isNarrationMinimalStyle,
  NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
  NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
  NARRATION_IMAGE_DETECT_BATCH_THRESHOLD_DEFAULT,
  NARRATION_IMAGE_DETECT_BATCH_SIZE_DEFAULT,
  NARRATION_IMAGE_PROMPT_BATCH_SIZE_DEFAULT,
  NARRATION_IMAGE_PROMPT_BATCH_SIZE_MIN,
  NARRATION_IMAGE_PROMPT_BATCH_SIZE_MAX,
  NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
  NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
} from '../constants/art-styles.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import {
  calcPromptBatchPercent,
  calcDetectBatchPercent,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'
import { buildPriorNarrationLines } from './episode-continuity.js'

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

/** 批次之间的间隔（毫秒），减轻上游限流 */
const PARAGRAPH_PROMPT_LLM_BATCH_GAP_MS = 2_000

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

/** 换镜检测 LLM 超时下限（毫秒） */
const IMAGE_DETECT_LLM_TIMEOUT_MIN_MS = 240_000

/** 换镜检测 LLM 超时上限（毫秒） */
const IMAGE_DETECT_LLM_TIMEOUT_MAX_MS = 900_000

/** 每个检测单元估算耗时（毫秒），用于按镜头数缩放超时 */
const IMAGE_DETECT_LLM_TIMEOUT_PER_UNIT_MS = 3_500

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

function normalizeParagraphPromptRow(row: unknown): { start_index: number; image_prompt: string } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const startIndex = Number(r.start_index ?? r.startIndex)
  const prompt = String(r.image_prompt ?? r.imagePrompt ?? r.prompt ?? '').trim()
  if (!Number.isFinite(startIndex) || !prompt) return null
  return { start_index: startIndex, image_prompt: prompt }
}

function parseParagraphPromptRows(
  text: string,
  batch: ParagraphPromptInput[],
): Array<{ start_index: number; image_prompt: string }> | null {
  const raw = String(text || '').trim()
  if (!raw) return null

  const expectedStarts = batch.map(p => p.startIndex)
  const collect = (rows: unknown[]): Array<{ start_index: number; image_prompt: string }> | null => {
    const normalized = rows.map(normalizeParagraphPromptRow).filter(Boolean) as Array<{
      start_index: number
      image_prompt: string
    }>
    if (normalized.length === batch.length) return normalized
    const byStart = normalized.filter(r => expectedStarts.includes(r.start_index))
    if (byStart.length === batch.length) return byStart
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
      // ignore
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

  return null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
      text: items[i].sentence,
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

function applyImageAnchorConstraints(
  needs: boolean[],
  minimumTrueCount: number,
  maximumTrueCount: number,
): boolean[] {
  let result = enforceImageSegmentShotBounds(needs)
  result = boostImageAnchorCountToMinimum(result, minimumTrueCount)
  result = trimImageAnchorCountToMaximum(result, maximumTrueCount)
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
    if (!config.apiKey) return null

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

function resolveMinimumDetectTrueCount(storyboardCount: number): number {
  if (storyboardCount <= 0) return 0
  return Math.max(1, Math.ceil(storyboardCount * NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO))
}

function resolveMaximumDetectTrueCount(storyboardCount: number): number {
  if (storyboardCount <= 0) return 0
  const minimum = resolveMinimumDetectTrueCount(storyboardCount)
  const maximum = Math.floor(storyboardCount * NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO)
  return Math.max(minimum, maximum)
}

function formatDetectRatioRange(): string {
  const minPct = Math.round(NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO * 100)
  const maxPct = Math.round(NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO * 100)
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
    minimum_true_ratio: NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
    maximum_true_ratio: NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
    min_shots_per_image: NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
    max_shots_per_image: NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
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
): Promise<NarrationDetectLLMResult> {
  if (analysis.length !== units.length) {
    throw new Error(`配图换镜 AI 返回无效（期望 ${units.length} 项 analysis）`)
  }

  let needs = expandDetectNeedsToStoryboards(items, units, analysis)
  if (!needs) {
    throw new Error('配图换镜 AI 返回无效（analysis 与检测单元数量不匹配）')
  }

  const beforeBounds = needs.filter(Boolean).length
  needs = applyImageAnchorConstraints(needs, minimumTrueCount, maximumTrueCount)
  const afterBounds = needs.filter(Boolean).length
  if (afterBounds !== beforeBounds) {
    logTaskProgress('NarrationScene', 'segment-bounds-applied', {
      beforeAnchors: beforeBounds,
      afterAnchors: afterBounds,
      minimumTrueCount,
      maximumTrueCount,
      minShots: NARRATION_IMAGE_SEGMENT_MIN_SHOTS,
      maxShots: NARRATION_IMAGE_SEGMENT_MAX_SHOTS,
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
  textThinking = true,
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
  if (!config.apiKey) throw new Error('未配置文本模型 API Key，无法执行配图换镜检测')

  const detectMode = mode === 'conservative' ? 'conservative' : 'paragraph'
  const units = buildNarrationDetectUnits(items)
  const minimumTrueCount = resolveMinimumDetectTrueCount(items.length)
  const maximumTrueCount = resolveMaximumDetectTrueCount(items.length)
  const ratioRange = formatDetectRatioRange()
  const batchSize = resolveDetectBatchSize(options?.batchSize)
  const useBatch = shouldUseDetectBatching(items.length, options?.batchThreshold)
  const onProgress = options?.onProgress

  logTaskProgress('NarrationScene', 'llm-detect-start', {
    sentenceCount: items.length,
    detectUnitCount: units.length,
    minimumTrueCount,
    maximumTrueCount,
    minimumTrueRatio: NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO,
    maximumTrueRatio: NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO,
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
    previousEpisodeNarration,
    textModel,
    textThinking,
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
        const batchUnits = batches[bi]
        const batchShots = batchUnits.reduce((sum, unit) => sum + unit.storyboardIndices.length, 0)
        onProgress?.({
          phase: 'detecting',
          batch: bi + 1,
          batch_count: batches.length,
          message: `正在检测换镜（第 ${bi + 1}/${batches.length} 批，约 ${batchShots} 镜）…`,
          percent: calcDetectBatchPercent(bi, batches.length),
        })

        const llmResult = await callDetectImageNeedsLLM(
          callCtx.system,
          buildDetectUserPayload(callCtx, batchUnits, { batchIndex: bi + 1, batchCount: batches.length }),
          callCtx.textModel,
          callCtx.textThinking,
          resolveDetectLLMTimeoutMs(batchUnits.length, 1),
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

    let llmResult = await callDetectImageNeedsLLM(
      callCtx.system,
      buildDetectUserPayload(callCtx, units),
      callCtx.textModel,
      callCtx.textThinking,
      resolveDetectLLMTimeoutMs(units.length, 1),
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
        `每个配图段须覆盖 ${NARRATION_IMAGE_SEGMENT_MIN_SHOTS}～${NARRATION_IMAGE_SEGMENT_MAX_SHOTS} 镜（含锚点镜），禁止单镜成段或连续 5 镜以上共用一图。`,
        '请重新通读全文：只有「上一张图可原样复用、无任何可视差异」的单元才标 false；',
        '凡有场景/时间/动作/物件/经营阶段/视觉焦点变化的一律标 true。',
        '输出完整 JSON，analysis 长度仍须与 sentences 相同。',
      ].join('')
      llmResult = await callDetectImageNeedsLLM(
        callCtx.system,
        buildDetectUserPayload(callCtx, units, undefined, retryHint),
        callCtx.textModel,
        callCtx.textThinking,
        resolveDetectLLMTimeoutMs(units.length, 2),
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
  const { needs, segmentDescriptions } = await detectImageNeedsWithLLM(
    items,
    mode,
    options?.textModel,
    options?.textThinking ?? true,
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
}

export type ParagraphPromptInput = {
  index: number
  startIndex: number
  sentences: string[]
  layout: 'single' | 'diptych'
  sceneDescription?: string
}

type CharacterPromptHint = {
  name: string
  appearance?: string | null
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
    if (!config.apiKey) return null

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
    /** 每批段落数；默认 6 */
    batchSize?: number
    /** 每批成功后回调（用于增量落库） */
    onBatchComplete?: (payload: {
      batch: ParagraphPromptInput[]
      promptsByStartIndex: Map<number, string>
    }) => void | Promise<void>
  },
): Promise<{ titlePrompt: string | null; promptsByStartIndex: Map<number, string> } | null> {
  const style = options?.style || 'comic'
  const textModel = options?.textModel || null
  const textThinking = options?.textThinking ?? true
  const titleHook = options?.titleHook?.trim() || null
  const titleFull = options?.titleFull?.trim() || null
  void titleHook
  void titleFull
  const characters = options?.characters || []
  const promptBatchSize = resolveParagraphPromptBatchSize(options?.batchSize)

  if (!paragraphs.length) return { titlePrompt: null, promptsByStartIndex: new Map() }

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) throw new Error('未配置文本模型 API Key')

    const batches = chunkParagraphPromptBatch(paragraphs, promptBatchSize)
    const batchCount = batches.length

    logTaskProgress('NarrationScene', 'llm-paragraph-prompt-start', {
      paragraphCount: paragraphs.length,
      batchCount,
      batchSize: promptBatchSize,
      model: config.model,
    })

    const episodeHasDiptych = paragraphs.some(p => p.layout === 'diptych')
    const system = buildNarrationParagraphImagePromptLLMSystem(style, {
      hasCharacters: characters.length > 0,
      hasDiptych: episodeHasDiptych,
    })
    const fullBodyLines = options?.fullNarrationLines || []
    const previousEpisodeNarration = options?.previousEpisodeNarration || []
    const protagonistHints = characters.map(ch => ({
      name: ch.name,
      variantLabel: (ch as { variantLabel?: string | null }).variantLabel,
      appearance: ch.appearance,
    }))

    const fullNarration = fullBodyLines.length
      ? fullBodyLines.map(s => String(s || '').trim()).filter(Boolean)
      : buildFullNarrationForPrompt({
        titleHook,
        titleFull,
        bodySentences: [],
      })

    const characterPayload = isNarrationMinimalStyle(style)
      ? characters.map(ch => {
        const variantLabel = (ch as { variantLabel?: string | null }).variantLabel || ''
        const coerced = coerceMinimalCharacterAppearance(variantLabel, ch.appearance)
        return {
          name: ch.name,
          life_stage: variantLabel,
          posture_action: coerced,
          simplified_outfit: coerced,
        }
      })
      : characters.map(ch => ({
        name: ch.name,
        appearance: ch.appearance || '',
      }))

    const paragraphOutputHint = episodeHasDiptych
      ? '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；layout=single 按六维输出；layout=diptych 按【左格】【右格】各写完整六维'
      : '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；按六维输出'

    const promptsByStartIndex = new Map<number, string>()
    const reportProgress = options?.onProgress

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      if (batchIndex > 0) await sleep(PARAGRAPH_PROMPT_LLM_BATCH_GAP_MS)

      const batchHasDiptych = batch.some(p => p.layout === 'diptych')
      const batchSystem = batchHasDiptych === episodeHasDiptych
        ? system
        : buildNarrationParagraphImagePromptLLMSystem(style, {
          hasCharacters: characters.length > 0,
          hasDiptych: batchHasDiptych,
        })

      reportProgress?.({
        status: 'processing',
        phase: 'prompts',
        batch: batchIndex + 1,
        batch_count: batches.length,
        paragraph_count: paragraphs.length,
        message: `正在生成配图文案（第 ${batchIndex + 1}/${batches.length} 批，${batch.length} 段）…`,
        percent: calcPromptBatchPercent(batchIndex, batches.length),
      })

      const user = JSON.stringify({
        ...(previousEpisodeNarration.length ? { previous_episode_narration: previousEpisodeNarration } : {}),
        full_narration: fullNarration,
        characters: characterPayload,
        paragraphs: batch.map(p => ({
          paragraph_index: p.index,
          start_index: p.startIndex,
          timeline_up_to_index: p.startIndex,
          prior_narration: buildPriorNarrationLines(previousEpisodeNarration, fullBodyLines, p.startIndex),
          layout: p.layout,
          narration_lines: p.sentences,
          ...(p.sceneDescription ? { detect_scene_description: p.sceneDescription } : {}),
        })),
        output_format: {
          paragraph_prompts: paragraphOutputHint,
        },
      })

      let rows: Array<{ start_index?: number; image_prompt?: string }> | null = null
      let lastRaw = ''
      let lastError = ''

      for (let attempt = 0; attempt <= PARAGRAPH_PROMPT_LLM_BATCH_RETRIES; attempt++) {
        if (attempt > 0) {
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-batch-retry', {
            batch: batchIndex + 1,
            attempt,
            batchCount: batches.length,
            lastError: lastError.slice(0, 200),
          })
          reportProgress?.({
            status: 'processing',
            phase: 'prompts',
            batch: batchIndex + 1,
            batch_count: batches.length,
            message: `第 ${batchIndex + 1}/${batches.length} 批重试中（${attempt}/${PARAGRAPH_PROMPT_LLM_BATCH_RETRIES}）…`,
            percent: calcPromptBatchPercent(batchIndex, batches.length),
          })
          await sleep(3_000 * attempt)
        }

        logTaskProgress('NarrationScene', 'llm-paragraph-prompt-batch', {
          batch: batchIndex + 1,
          batchCount: batches.length,
          paragraphCount: batch.length,
          attempt: attempt + 1,
          timeoutMs: resolveParagraphPromptLLMTimeoutMs(batch.length, attempt + 1),
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
          )
          lastRaw = text
          rows = parseParagraphPromptRows(text, batch)
          if (rows) break
          lastError = 'invalid paragraph_prompts JSON'
        } catch (err: any) {
          lastError = String(err?.message || err || 'unknown error')
          if (!isLLMTimeoutError(lastError) || attempt >= PARAGRAPH_PROMPT_LLM_BATCH_RETRIES) {
            throw err
          }
        }
      }

      if (!rows) {
        logTaskWarn('NarrationScene', 'llm-paragraph-prompt-invalid', {
          batch: batchIndex + 1,
          batchCount: batches.length,
          expected: batch.length,
          got: 0,
          responsePreview: lastRaw.slice(0, 400),
        })
        throw new Error(
          `配图 AI 第 ${batchIndex + 1}/${batches.length} 批返回无效（模型未输出 paragraph_prompts JSON，可能上游限流或截断）`,
        )
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const startIndex = Number(row?.start_index ?? batch[i]?.startIndex)
        const prompt = String(row?.image_prompt || '').trim()
        if (!Number.isFinite(startIndex) || !prompt) {
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-row-invalid', {
            batch: batchIndex + 1,
            row: i,
            startIndex,
          })
          throw new Error(
            `配图 AI 第 ${batchIndex + 1}/${batches.length} 批第 ${i + 1} 条无效（缺少 start_index 或 image_prompt）`,
          )
        }
        promptsByStartIndex.set(startIndex, options?.pureLlm
          ? prompt
          : resolveLLMImagePrompt(prompt, style, {
            narrationLines: batch[i]?.sentences,
            fullNarrationLines: options?.fullNarrationLines,
            timelineUpToIndex: startIndex,
            protagonistHints,
          }))
      }

      const batchPrompts = new Map<number, string>()
      for (const item of batch) {
        const p = promptsByStartIndex.get(item.startIndex)
        if (p) batchPrompts.set(item.startIndex, p)
      }
      if (batchPrompts.size) {
        await options?.onBatchComplete?.({ batch, promptsByStartIndex: batchPrompts })
      }

      reportProgress?.({
        status: 'processing',
        phase: 'prompts',
        batch: batchIndex + 1,
        batch_count: batches.length,
        message: `第 ${batchIndex + 1}/${batches.length} 批配图文案已完成`,
        percent: calcPromptBatchPercent(batchIndex + 1, batches.length),
      })
    }

    if (paragraphs.length && promptsByStartIndex.size !== paragraphs.length) {
      logTaskWarn('NarrationScene', 'llm-paragraph-prompt-incomplete', {
        expected: paragraphs.length,
        got: promptsByStartIndex.size,
      })
      return null
    }

    logTaskSuccess('NarrationScene', 'llm-paragraph-prompt-done', {
      paragraphCount: paragraphs.length,
      batchCount: batches.length,
    })
    return { titlePrompt: null, promptsByStartIndex }
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
