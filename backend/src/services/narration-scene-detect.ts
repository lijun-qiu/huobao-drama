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
} from '../constants/art-styles.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import {
  calcPromptBatchPercent,
  type NarrationImageBreakdownProgressCallback,
} from './narration-image-breakdown-progress.js'

/** 配图段落 prompt：每批最多段落数 */
const PARAGRAPH_PROMPT_LLM_BATCH_SIZE = 10

/** 配图段落 prompt：单批 LLM 超时（毫秒） */
const PARAGRAPH_PROMPT_LLM_BATCH_TIMEOUT_MS = 300_000

/** 单批失败重试次数 */
const PARAGRAPH_PROMPT_LLM_BATCH_RETRIES = 2

/** 批次之间的间隔（毫秒），减轻上游限流 */
const PARAGRAPH_PROMPT_LLM_BATCH_GAP_MS = 2_000

/** 换镜检测 LLM 超时（毫秒） */
const IMAGE_DETECT_LLM_TIMEOUT_MS = 240_000

/** 片头标题图 prompt LLM 超时（毫秒） */
const TITLE_IMAGE_PROMPT_LLM_TIMEOUT_MS = 180_000

/** 配图段分批：按固定段数切批，尾批不足 BATCH_SIZE 也单独成批 */
function chunkParagraphPromptBatch<T>(items: T[]): T[][] {
  if (!items.length) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += PARAGRAPH_PROMPT_LLM_BATCH_SIZE) {
    chunks.push(items.slice(i, i + PARAGRAPH_PROMPT_LLM_BATCH_SIZE))
  }
  return chunks
}

export type NarrationSentenceItem = {
  sentence: string
  paragraphIndex: number
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

/** 分镜/TTS：遇标点（含逗号、顿号、分号）即拆，一句一镜 */
export const STORYBOARD_PUNCT_BOUNDARY_RE = /(?<=[。！？；，、,.!?;])\s*/
/** 配图 prompt：仅在句号级标点拆，同段旁白合并写连贯【场景】【剧情】 */
export const IMAGE_PROMPT_PUNCT_BOUNDARY_RE = /(?<=[。！？])\s*/

function splitNarrationChunk(chunk: string, boundaryRe = STORYBOARD_PUNCT_BOUNDARY_RE): string[] {
  const flat = chunk.replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const parts = flat
    .split(boundaryRe)
    .map(s => s.replace(/^[，,、\s]+|[，,、\s]+$/g, '').trim())
    .filter(Boolean)

  return parts.length ? parts : [flat]
}

/** 配图段旁白：保留分镜短句，按场景拆段后逐句生成【剧情】（不再整段合并成一大块） */
export function mergeStoryboardLinesForImagePrompt(lines: string[]): string[] {
  return lines.map(s => String(s || '').trim()).filter(Boolean)
}

/** 分镜拆句：标点（含逗号顿号）即拆，用于 TTS/时间轴 */
export function splitNarrationSentencesWithMeta(text: string): NarrationSentenceItem[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
  const result: NarrationSentenceItem[] = []

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lineChunks = paragraph.split(/\n+/).map(s => s.trim()).filter(Boolean)
    for (const chunk of lineChunks) {
      for (const sentence of splitNarrationChunk(chunk, STORYBOARD_PUNCT_BOUNDARY_RE)) {
        result.push({ sentence, paragraphIndex })
      }
    }
  })

  return result
}

/** 片头标题：与正文分镜相同，按标点（含逗号顿号）逐句一镜 */
export function splitTitleSentencesWithMeta(text: string): NarrationSentenceItem[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
  const result: NarrationSentenceItem[] = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lineChunks = paragraph.split(/\n+/).map(s => s.trim()).filter(Boolean)
    for (const chunk of lineChunks) {
      for (const sentence of splitNarrationChunk(chunk, STORYBOARD_PUNCT_BOUNDARY_RE)) {
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

function finalizeImageNeeds(items: NarrationSentenceItem[], needs: boolean[]): boolean[] {
  return suppressDateOnlyImageAnchors(items, needs)
}

function resolveImagePickCount(eligibleCount: number): number {
  if (eligibleCount <= 0) return 0
  return Math.max(1, Math.round(eligibleCount * NARRATION_IMAGE_TARGET_RATIO))
}

function scoreStoryboardImagePriority(
  items: NarrationSentenceItem[],
  index: number,
  llmWantsImage = false,
): number {
  const item = items[index]
  const sentence = item.sentence
  if (isNarrationDateOnlySentence(sentence)) return -1000

  let score = 0
  if (llmWantsImage) score += 100
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

/** 按分镜总数约 30% 合理分配配图锚点（结合 LLM 优先级与时间线分段） */
export function allocateImageNeedsByRatio(
  items: NarrationSentenceItem[],
  llmFlags?: unknown[],
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
  for (let segment = 0; segment < segmentCount; segment++) {
    const start = Math.floor(segment * eligibleCount / segmentCount)
    const end = Math.floor((segment + 1) * eligibleCount / segmentCount)
    let bestIndex = -1
    let bestScore = -Infinity
    for (let pos = start; pos < end; pos++) {
      const index = eligibleIndices[pos]
      const llmWants = llmFlags ? !!llmFlags[index] : false
      const score = scoreStoryboardImagePriority(items, index, llmWants)
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
    if (bestIndex >= 0) needs[bestIndex] = true
  }

  return finalizeImageNeeds(items, needs)
}

/** 规则兜底：按约 30% 占比分配 */
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
  maxGap = 6,
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

/** 按 needs_image 切分场景段落：每段首镜配图，内容覆盖该段全部旁白（含段首前的纯日期句） */
export function buildSceneSegments(items: NarrationSentenceItem[], needs: boolean[]): NarrationSceneSegment[] {
  const segments: NarrationSceneSegment[] = []
  for (let i = 0; i < items.length; i++) {
    if (!needs[i]) continue
    let end = i
    while (end + 1 < items.length && !needs[end + 1]) end++
    let start = i
    while (start > 0 && isNarrationDateOnlySentence(items[start - 1].sentence)) {
      start--
    }
    segments.push({
      anchorIndex: i,
      endIndex: end,
      sentences: items.slice(start, end + 1).map(item => item.sentence),
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

    const text = await callTextChat(system, user, textModel, textThinking, PARAGRAPH_PROMPT_LLM_BATCH_TIMEOUT_MS)
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

/** 将 LLM 优先级映射为约 30% 配图分配 */
function normalizeLLMImageDetectFlags(
  items: NarrationSentenceItem[],
  flags: unknown[],
  mode: ImageDetectMode = 'paragraph',
): boolean[] {
  return allocateImageNeedsByRatio(items, flags, mode)
}

export async function detectImageNeedsWithLLM(
  items: NarrationSentenceItem[],
  mode: ImageDetectMode = 'paragraph',
  textModel?: string | null,
  textThinking = true,
  style = 'comic',
  fullNarrationLines?: string[],
): Promise<boolean[] | null> {
  if (!items.length) return []

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) return null

    const detectMode = mode === 'conservative' ? 'conservative' : 'paragraph'
    logTaskProgress('NarrationScene', 'llm-detect-start', {
      sentenceCount: items.length,
      model: config.model,
      detectMode,
    })

    const system = buildNarrationImageDetectLLMSystem(style, detectMode)
    const fullNarration = fullNarrationLines?.length
      ? fullNarrationLines
      : items.map(item => item.sentence)

    const user = JSON.stringify({
      full_narration: fullNarration,
      sentences: items.map(item => item.sentence),
      sentence_indexes: items.map((_, index) => index),
      paragraph_indexes: items.map(item => item.paragraphIndex),
      output_format: { needs_image: 'boolean[]，长度与 sentences 相同' },
    })

    const text = await callTextChat(system, user, textModel, textThinking, IMAGE_DETECT_LLM_TIMEOUT_MS)
    const parsed = extractJsonObject(text)
    const flags = Array.isArray(parsed?.needs_image) ? parsed.needs_image : null
    if (!flags || flags.length !== items.length) {
      logTaskWarn('NarrationScene', 'llm-detect-invalid', { expected: items.length, got: flags?.length || 0 })
      return null
    }

    const normalized = finalizeImageNeeds(
      items,
      normalizeLLMImageDetectFlags(items, flags, mode),
    )
    const llmRawCount = flags.filter((flag: unknown, index: number) => (
      !isNarrationDateOnlySentence(items[index].sentence) && (index === 0 || !!flag)
    )).length
    const needCount = normalized.filter(Boolean).length
    const eligible = items.filter(item => !isNarrationDateOnlySentence(item.sentence)).length
    logTaskSuccess('NarrationScene', 'llm-detect-done', {
      sentenceCount: items.length,
      eligibleSentenceCount: eligible,
      imageNeededCount: needCount,
      imageRatio: eligible ? Math.round(needCount / eligible * 100) : 0,
      llmRawImageCount: llmRawCount,
    })
    return normalized
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-detect-failed', { error: err.message })
    return null
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
  },
): Promise<{
  needs: boolean[]
  source: ImageDetectSource
}> {
  const mode = options?.mode || 'paragraph'
  const fromLLM = await detectImageNeedsWithLLM(
    items,
    mode,
    options?.textModel,
    options?.textThinking ?? true,
    options?.style || 'comic',
    options?.fullNarrationLines,
  )
  if (fromLLM) return { needs: fromLLM, source: 'llm' }

  if (mode === 'conservative') {
    return { needs: detectImageNeedsConservative(items), source: 'conservative' }
  }
  return { needs: detectImageNeedsBalanced(items), source: 'balanced' }
}

export type ParagraphPromptInput = {
  index: number
  startIndex: number
  sentences: string[]
  layout: 'single' | 'diptych'
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

    const user = JSON.stringify({
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
    onProgress?: NarrationImageBreakdownProgressCallback
  },
): Promise<{ titlePrompt: string | null; promptsByStartIndex: Map<number, string> } | null> {
  const style = options?.style || 'comic'
  const textModel = options?.textModel || null
  const textThinking = options?.textThinking ?? true
  const titleHook = options?.titleHook?.trim() || null
  const titleFull = options?.titleFull?.trim() || null
  const characters = options?.characters || []

  if (!paragraphs.length && !titleHook) return { titlePrompt: null, promptsByStartIndex: new Map() }

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) throw new Error('未配置文本模型 API Key')

    const batches = chunkParagraphPromptBatch(paragraphs)
    const batchCount = batches.length

    logTaskProgress('NarrationScene', 'llm-paragraph-prompt-start', {
      paragraphCount: paragraphs.length,
      batchCount,
      batchSize: PARAGRAPH_PROMPT_LLM_BATCH_SIZE,
      hasTitle: !!titleHook,
      model: config.model,
    })

    const system = buildNarrationParagraphImagePromptLLMSystem(style, {
      hasCharacters: characters.length > 0,
    })
    const fullBodyLines = options?.fullNarrationLines || []
    const protagonistHints = characters.map(ch => ({
      name: ch.name,
      variantLabel: (ch as { variantLabel?: string | null }).variantLabel,
      appearance: ch.appearance,
    }))

    const fullNarration = buildFullNarrationForPrompt({
      titleHook,
      titleFull,
      bodySentences: options?.fullNarrationLines,
    })

    const characterPayload = isNarrationMinimalStyle(style)
      ? characters.map(ch => ({
        name: ch.name,
        life_stage: (ch as { variantLabel?: string | null }).variantLabel || '',
        posture_action: coerceMinimalCharacterAppearance(
          (ch as { variantLabel?: string | null }).variantLabel,
          ch.appearance,
        ),
      }))
      : characters.map(ch => ({
        name: ch.name,
        appearance: ch.appearance || '',
      }))

    const paragraphOutputHint =
      '[{ start_index: number, image_prompt: string }]，长度与本批 paragraphs 相同；单图按六维输出；layout=diptych 按【左格】【右格】各写完整六维（见 system 规则）'

    const promptsByStartIndex = new Map<number, string>()
    const reportProgress = options?.onProgress

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      if (batchIndex > 0) await sleep(PARAGRAPH_PROMPT_LLM_BATCH_GAP_MS)

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
        full_narration: fullNarration,
        characters: characterPayload,
        paragraphs: batch.map(p => ({
          paragraph_index: p.index,
          start_index: p.startIndex,
          timeline_up_to_index: p.startIndex,
          prior_narration: fullBodyLines.slice(0, p.startIndex),
          layout: p.layout,
          narration_lines: p.sentences,
        })),
        output_format: {
          paragraph_prompts: paragraphOutputHint,
        },
      })

      let rows: Array<{ start_index?: number; image_prompt?: string }> | null = null
      let lastRaw = ''

      for (let attempt = 0; attempt <= PARAGRAPH_PROMPT_LLM_BATCH_RETRIES; attempt++) {
        if (attempt > 0) {
          logTaskWarn('NarrationScene', 'llm-paragraph-prompt-batch-retry', {
            batch: batchIndex + 1,
            attempt,
            batchCount: batches.length,
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
          model: config.model,
        })

        const text = await callTextChat(
          system,
          user,
          textModel,
          textThinking,
          PARAGRAPH_PROMPT_LLM_BATCH_TIMEOUT_MS,
          true,
        )
        lastRaw = text
        rows = parseParagraphPromptRows(text, batch)
        if (rows) break
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
          return null
        }
        promptsByStartIndex.set(startIndex, resolveLLMImagePrompt(prompt, style, {
          narrationLines: batch[i]?.sentences,
          fullNarrationLines: options?.fullNarrationLines,
          timelineUpToIndex: startIndex,
          protagonistHints,
        }))
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

    let titlePrompt: string | null = null
    if (titleHook) {
      reportProgress?.({
        status: 'processing',
        phase: 'title',
        message: '正在生成片头配图文案…',
        percent: 88,
      })
      titlePrompt = await generateTitleImagePromptWithLLM({
        titleHook,
        titleFull,
        bodySentences: options?.fullNarrationLines,
        style,
        textModel,
        textThinking,
      })
    }

    logTaskSuccess('NarrationScene', 'llm-paragraph-prompt-done', {
      paragraphCount: paragraphs.length,
      batchCount: batches.length,
      hasTitle: !!titlePrompt,
    })
    return { titlePrompt, promptsByStartIndex }
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown error')
    logTaskError('NarrationScene', 'llm-paragraph-prompt-failed', { error: message })
    if (/aborted due to timeout/i.test(message)) {
      throw new Error('配图 AI 调用超时，请稍后重试或减少单集配图段数')
    }
    throw err
  }
}
