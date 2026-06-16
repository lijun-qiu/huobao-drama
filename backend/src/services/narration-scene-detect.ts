import { getTextConfig, getTextProviderBaseUrl } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import {
  artStylePrompt,
  finalizeNarrationImagePrompt,
  isNarrationDateOnlySentence,
  isNarrationMinimalStyle,
  NARRATION_IMAGE_STYLE_CORE,
  NARRATION_PLOT_CONTINUITY_LLM_RULE,
  NARRATION_TITLE_IMAGE_LLM_RULE,
  sanitizeSceneImagePrompt,
} from '../constants/art-styles.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

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

function finalizeImageNeeds(items: NarrationSentenceItem[], needs: boolean[]): boolean[] {
  return suppressDateOnlyImageAnchors(items, needs)
}

/** 均衡配图：换段/地点切换/叙事节拍开新图，同场景最多连续 2 句沿用，约每 1–2 句一图 */
export function detectImageNeedsBalanced(items: NarrationSentenceItem[]): boolean[] {
  const raw: boolean[] = []
  let lastImageIdx = 0
  for (let index = 0; index < items.length; index++) {
    if (index === 0) {
      raw.push(true)
      continue
    }
    const prev = items[index - 1]
    const sentence = items[index].sentence
    if (isNarrationDateOnlySentence(sentence)) {
      raw.push(false)
      continue
    }
    let need = false
    if (items[index].paragraphIndex !== prev.paragraphIndex) need = true
    else if (STRONG_SCENE_SHIFT_RE.test(sentence)) need = true
    else if (SCENE_SHIFT_RE.test(sentence)) need = true
    else if (SCENE_OPENING_RE.test(sentence)) need = true
    else if (BEAT_SHIFT_RE.test(sentence)) need = true
    else {
      const segText = items.slice(lastImageIdx, index).map(i => i.sentence).join('')
      const segTags = getImageLocationTags(segText)
      const curTags = getImageLocationTags(sentence)
      if (curTags.some(tag => !segTags.includes(tag))) need = true
    }
    raw.push(need)
    if (need) lastImageIdx = index
  }
  const merged = consolidateShortSceneSegments(items, raw, 2)
  return finalizeImageNeeds(items, ensureMaxNarrationGap(items, merged, 3))
}

/** 省钱模式：段落换景 + 场景词 + 长段自动补图，约每 3–4 句一图 */
export function detectImageNeedsConservative(items: NarrationSentenceItem[]): boolean[] {
  const raw = items.map((item, index) => {
    if (isNarrationDateOnlySentence(item.sentence)) return false
    if (index === 0) return true
    const prev = items[index - 1]
    const sentence = item.sentence
    if (item.paragraphIndex !== prev.paragraphIndex) return true
    if (STRONG_SCENE_SHIFT_RE.test(sentence)) return true
    if (SCENE_SHIFT_RE.test(sentence)) return true
    if (BEAT_SHIFT_RE.test(sentence)) return true
    return false
  })
  const merged = consolidateShortSceneSegments(items, raw, 2)
  return finalizeImageNeeds(items, ensureMaxNarrationGap(items, merged, 4))
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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

async function callTextChat(system: string, user: string, modelOverride?: string | null): Promise<string> {
  const config = getTextConfig(modelOverride)
  const url = joinProviderUrl(getTextProviderBaseUrl(config), '/chat/completions', '')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    }),
  })

  if (!resp.ok) {
    throw new Error(`Text API error ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json() as any
  return json.choices?.[0]?.message?.content || ''
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
): Promise<string[] | null> {
  if (!segments.length) return []

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-scene-prompt-start', { sceneCount: segments.length, model: config.model })

    const system = [
      '你是影视解说分镜美术指导，根据每段旁白场景写出用于 AI 文生图的「单场景画面描述」。',
      '规则：',
      '1) 综合该段全部旁白句子，提炼地点、人物、动作与氛围，不要只描述首句',
      '2) 每条 prompt 描述一个完整场景的主画面，适合单张插画',
      `3) ${artStylePrompt(style, 'scene')}，电影感构图，无文字无水印`,
      '4) 不要出现 grid、panel、宫格、分格、collage、split、strip 等词',
      '5) 用中文描述画面内容，可夹杂少量英文风格词',
      '只输出 JSON，不要解释。',
    ].join('\n')

    const user = JSON.stringify({
      full_narration: fullNarrationLines?.length ? fullNarrationLines : undefined,
      scenes: segments.map((seg, index) => ({
        scene_index: index,
        narration_lines: seg.sentences,
      })),
      output_format: { image_prompts: 'string[]，长度与 scenes 相同' },
    })

    const text = await callTextChat(system, user, textModel)
    const parsed = extractJsonObject(text)
    const prompts = Array.isArray(parsed?.image_prompts) ? parsed.image_prompts : null
    if (!prompts || prompts.length !== segments.length) {
      logTaskWarn('NarrationScene', 'llm-scene-prompt-invalid', { expected: segments.length, got: prompts?.length || 0 })
      return null
    }

    const normalized = prompts.map((p: unknown) => (
      isNarrationMinimalStyle(style)
        ? finalizeNarrationImagePrompt(String(p || '').trim())
        : sanitizeSceneImagePrompt(String(p || '').trim())
    )).filter(Boolean)
    if (normalized.length !== segments.length) return null

    logTaskSuccess('NarrationScene', 'llm-scene-prompt-done', { sceneCount: segments.length })
    return normalized
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-scene-prompt-failed', { error: err.message })
    return null
  }
}

export async function detectImageNeedsWithLLM(
  items: NarrationSentenceItem[],
  mode: ImageDetectMode = 'balanced',
  textModel?: string | null,
): Promise<boolean[] | null> {
  if (!items.length) return []

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-detect-start', { sentenceCount: items.length, model: config.model })

    const system = mode === 'conservative'
      ? [
        '你是影视解说分镜导演，判断每句旁白是否需要配一张新插图（省钱均衡模式：比标准少配图，但不能长期不换画面）。',
        '规则：',
        '1) 场景/地点/时间/空间明显切换 → needs_image=true',
        '2) 空行分段后的首句 → 通常 needs_image=true',
        '3) 同一场景内连续动作、情绪描写 → needs_image=false',
        '4) 正文第1句 needs_image=true（但若该句仅为日期/季节如「1985年的春天」，needs_image=false）',
        '5) 目标密度：大约每 3–4 句配 1 张新图；同一段落内若已连续 3 句 false，下一句优先 true',
        '6) 忽略「在xxx里，」等弱起句，除非整段确实换到新地点',
        '7) 纯日期/季节/时段句（如「1985年的春天」「第二天清晨」）不要单独配图，needs_image=false',
        '只输出 JSON，不要解释。',
      ].join('\n')
      : [
        '你是影视解说分镜导演，负责判断每一句旁白是否需要单独配一张新插图。',
        '规则：',
        '1) 与上一句相比，若场景/地点/时间/空间/视角发生明显切换 → needs_image=true',
        '2) 仍在同一场景、同一空间连续叙述、只是动作或对白延续 → needs_image=false',
        '3) 正文第1句永远 needs_image=true（但若该句仅为日期/季节如「1985年的春天」，needs_image=false）',
        '4) 空行分段后的首句，通常表示场景切换，优先 needs_image=true',
        '5) 宁可多标 true，也不要把明显换场景的句子标成 false',
        '6) 纯日期/季节/时段句不要单独配图，needs_image=false',
        '只输出 JSON，不要解释。',
      ].join('\n')

    const user = JSON.stringify({
      sentences: items.map(item => item.sentence),
      paragraph_indexes: items.map(item => item.paragraphIndex),
      output_format: { needs_image: 'boolean[]，长度与 sentences 相同' },
    })

    const text = await callTextChat(system, user, textModel)
    const parsed = extractJsonObject(text)
    const flags = Array.isArray(parsed?.needs_image) ? parsed.needs_image : null
    if (!flags || flags.length !== items.length) {
      logTaskWarn('NarrationScene', 'llm-detect-invalid', { expected: items.length, got: flags?.length || 0 })
      return null
    }

    const normalized = finalizeImageNeeds(
      items,
      mode === 'conservative'
        ? ensureMaxNarrationGap(
          items,
          consolidateShortSceneSegments(
            items,
            flags.map((flag: unknown, index: number) => (
              isNarrationDateOnlySentence(items[index].sentence)
                ? false
                : index === 0 ? true : !!flag
            )),
            2,
          ),
          6,
        )
        : flags.map((flag: unknown, index: number) => (
          isNarrationDateOnlySentence(items[index].sentence)
            ? false
            : index === 0 ? true : !!flag
        )),
    )
    const needCount = normalized.filter(Boolean).length
    logTaskSuccess('NarrationScene', 'llm-detect-done', { sentenceCount: items.length, imageNeededCount: needCount })
    return normalized
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-detect-failed', { error: err.message })
    return null
  }
}

export async function resolveImageNeeds(
  items: NarrationSentenceItem[],
  mode: ImageDetectMode = 'conservative',
): Promise<{
  needs: boolean[]
  source: 'llm' | 'heuristic' | 'conservative'
}> {
  if (mode === 'conservative') {
    const fromLLM = await detectImageNeedsWithLLM(items, 'conservative')
    if (fromLLM) return { needs: fromLLM, source: 'llm' }
    return { needs: detectImageNeedsConservative(items), source: 'conservative' }
  }
  const fromLLM = await detectImageNeedsWithLLM(items, 'balanced')
  if (fromLLM) return { needs: fromLLM, source: 'llm' }
  return { needs: detectImageNeedsHeuristic(items), source: 'heuristic' }
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
}): Promise<string | null> {
  const titleHook = options.titleHook?.trim() || null
  const titleFull = options.titleFull?.trim() || null
  if (!titleHook && !titleFull) return null

  const style = options.style || 'comic'
  const textModel = options.textModel || null
  const fullNarration = buildFullNarrationForPrompt(options)
  if (!fullNarration.length) return null

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-title-prompt-start', { model: config.model })

    const system = isNarrationMinimalStyle(style)
      ? [
        '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的中文 image_prompt。',
        '硬性规则：',
        `1) 画风固定关键词（必含）：${NARRATION_IMAGE_STYLE_CORE}`,
        '2) 严格按此万能模板输出完整 prompt：',
        `16:9 横屏，2D 扁平化卡通，白色圆头素体小人，两个小黑点眼睛，黑色细轮廓线，纯色平涂无复杂光影，【片头背景场景：具体地点与环境】，【主题氛围：与全文主线对应的叙事氛围】，日常低饱和配色，极简叙事动画风格，干净整洁的画面，无文字无水印，中央预留叠字区域`,
        NARRATION_TITLE_IMAGE_LLM_RULE,
        '3) 禁止写年代/年份和具体服装描述；禁止在画面中出现任何文字',
        '只输出 JSON，不要解释。',
      ].join('\n')
      : [
        '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的 image_prompt。',
        `画风：${artStylePrompt(style, 'title')}, 16:9 landscape, high quality, absolutely no text, no watermark`,
        NARRATION_TITLE_IMAGE_LLM_RULE,
        'clean center area reserved for dynamic title overlay',
        '只输出 JSON，不要解释。',
      ].join('\n')

    const user = JSON.stringify({
      title: { hook: titleHook || titleFull, full: titleFull || titleHook },
      full_narration: fullNarration,
      output_format: { title_image_prompt: 'string，片头背景完整 prompt' },
    })

    const text = await callTextChat(system, user, textModel)
    const parsed = extractJsonObject(text)
    const prompt = String(parsed?.title_image_prompt || '').trim()
    if (!prompt) {
      logTaskWarn('NarrationScene', 'llm-title-prompt-empty', {})
      return null
    }

    const normalized = isNarrationMinimalStyle(style)
      ? finalizeNarrationImagePrompt(prompt, {
        titleHook: titleHook || undefined,
        titleFull,
        titleBodySentences: options.bodySentences,
      })
      : sanitizeSceneImagePrompt(prompt)
    if (!normalized) return null

    logTaskSuccess('NarrationScene', 'llm-title-prompt-done', {})
    return normalized
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-title-prompt-failed', { error: err.message })
    return null
  }
}

/** 按段落规则拆镜后，用文本模型批量生成配图提示词（素体中文 / 其他画风英文） */
export async function generateParagraphImagePromptsWithLLM(
  paragraphs: ParagraphPromptInput[],
  options?: {
    titleHook?: string | null
    titleFull?: string | null
    style?: string
    textModel?: string | null
    characters?: CharacterPromptHint[]
    fullNarrationLines?: string[]
  },
): Promise<{ titlePrompt: string | null; promptsByStartIndex: Map<number, string> } | null> {
  const style = options?.style || 'comic'
  const textModel = options?.textModel || null
  const titleHook = options?.titleHook?.trim() || null
  const titleFull = options?.titleFull?.trim() || null
  const characters = options?.characters || []

  if (!paragraphs.length && !titleHook) return { titlePrompt: null, promptsByStartIndex: new Map() }

  try {
    const config = getTextConfig(textModel)
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-paragraph-prompt-start', {
      paragraphCount: paragraphs.length,
      hasTitle: !!titleHook,
      model: config.model,
    })

    const system = isNarrationMinimalStyle(style)
      ? [
        '你是影视解说分镜美术指导。拆镜结构已由规则确定（一句旁白一镜、按场景换图并根据内容适当沿用），你的任务是写 AI 文生图用的中文 image_prompt。',
        '硬性规则：',
        '1) 每个配图段综合该段旁白句，提炼地点、人物动作、氛围；段越短越聚焦当前画面，不要写未出现的后续情节',
        `2) 画风固定关键词（每条必含）：${NARRATION_IMAGE_STYLE_CORE}`,
        '3) 严格按此万能模板输出完整 prompt（【】内填入具体内容，场景与剧情都要写充分、有画面感）：',
        `16:9 横屏，2D 扁平化卡通，白色圆头素体小人，两个小黑点眼睛，黑色细轮廓线，纯色平涂无复杂光影，【场景：具体地点与环境】，【剧情：动作与互动情节】，日常低饱和配色，极简叙事动画风格，干净整洁的画面，无文字无水印`,
        '4) 【场景】根据 narration_lines 中的地点/环境/时间感确定背景；【剧情】只写当前段主画面动作与互动，综合该段全部旁白句',
        '5) 【场景】写清楚地点、环境陈设与氛围；【剧情】聚焦本段画面重点，不要写「前文概要」，不要写已过场情节（如当前是夜市摆摊则勿写推自行车），不要写「素体小人」，不要照抄旁白原文',
        '6) layout=single（默认）：单张完整场景插画。禁止 grid/collage/multi-panel/split screen/storyboard',
        '7) layout=diptych：单张 16:9 横向两宫格，左格与右格分别描述，仍是一张图',
        '8) 片头标题图：' + NARRATION_TITLE_IMAGE_LLM_RULE.replace(/^片头标题图：/, ''),
        '9) 禁止写年代/年份和具体服装描述；禁止在【剧情】中出现「素体小人」',
        '10) 好示例：旁白「辞掉供销社工作推着自行车」→【场景：供销社门口春日背景】，【剧情：辞掉供销社工作，推着自行车】；旁白「去县城夜市摆地摊，身边人都说我疯了」→【场景：县城夜市街景与简化摊位】，【剧情：在摊位前整理货物，周围多人围观交谈】（勿写前文推自行车）',
        characters.length
          ? '11) 若段落涉及已知角色，只写其在画面中的动作与位置，不写外貌/服装/年代'
          : '',
        NARRATION_PLOT_CONTINUITY_LLM_RULE,
        '12) 每条 prompt 只写当前配图段的一个场景，不要合并未出现的后续情节；不要输出负面提示词',
        '只输出 JSON，不要解释。',
      ].filter(Boolean).join('\n')
      : [
        '你是影视解说分镜美术指导。拆镜结构已由规则确定（一句旁白一镜、按场景换图并根据内容适当沿用），你的任务是写 AI 文生图用的 image_prompt。',
        '硬性规则：',
        '1) 每个配图段综合该段旁白句，提炼地点、人物、动作、氛围；段越短越聚焦当前画面，不要写未出现的后续情节',
        `2) 画风：${artStylePrompt(style, 'scene')}, 16:9 landscape, high quality, no text, no watermark`,
        '3) layout=single（默认）：单张完整场景插画。prompt 以 "single full illustration, one complete scene only" 开头，并写明 no grid, no collage, no multi-panel, no split screen',
        '4) 仅当输入 layout=diptych 时才写两宫格：横向两宫格（仍算一张图）。分别描述 left panel 与 right panel',
        '5) 片头标题图：' + NARRATION_TITLE_IMAGE_LLM_RULE.replace(/^片头标题图：/, ''),
        '6) 除 diptych 两宫格式外，禁止 grid/panel/collage/strip/storyboard 等词',
        characters.length
          ? '7) 若段落涉及已知角色，prompt 中写出其外貌特征并保持与角色设定一致'
          : '',
        NARRATION_PLOT_CONTINUITY_LLM_RULE,
        '只输出 JSON，不要解释。',
      ].filter(Boolean).join('\n')

    const user = JSON.stringify({
      full_narration: buildFullNarrationForPrompt({
        titleHook,
        titleFull,
        bodySentences: options?.fullNarrationLines,
      }),
      title: titleHook ? { hook: titleHook, full: titleFull || titleHook } : null,
      characters: isNarrationMinimalStyle(style)
        ? characters.map(ch => ({
          name: ch.name,
          life_stage: (ch as { variantLabel?: string | null }).variantLabel || '',
        }))
        : characters.map(ch => ({
          name: ch.name,
          appearance: ch.appearance || '',
        })),
      paragraphs: paragraphs.map(p => ({
        paragraph_index: p.index,
        start_index: p.startIndex,
        timeline_up_to_index: p.startIndex,
        layout: p.layout,
        narration_lines: p.sentences,
      })),
      output_format: {
        title_image_prompt: isNarrationMinimalStyle(style)
          ? 'string | null，片头背景中文 prompt'
          : 'string | null，片头背景英文 prompt',
        paragraph_prompts: '[{ start_index: number, image_prompt: string }]，长度与 paragraphs 相同',
      },
    })

    const text = await callTextChat(system, user, textModel)
    const parsed = extractJsonObject(text)
    const rows = Array.isArray(parsed?.paragraph_prompts) ? parsed.paragraph_prompts : null
    if (paragraphs.length && (!rows || rows.length !== paragraphs.length)) {
      logTaskWarn('NarrationScene', 'llm-paragraph-prompt-invalid', {
        expected: paragraphs.length,
        got: rows?.length || 0,
      })
      return null
    }

    const promptsByStartIndex = new Map<number, string>()
    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const startIndex = Number(row?.start_index ?? paragraphs[i]?.startIndex)
        const prompt = String(row?.image_prompt || '').trim()
        if (!Number.isFinite(startIndex) || !prompt) continue
        promptsByStartIndex.set(startIndex, isNarrationMinimalStyle(style)
          ? finalizeNarrationImagePrompt(prompt, {
            narrationLines: paragraphs[i]?.sentences,
            fullNarrationLines: options?.fullNarrationLines,
            timelineUpToIndex: startIndex,
          })
          : sanitizeSceneImagePrompt(prompt))
      }
      if (promptsByStartIndex.size !== paragraphs.length) return null
    }

    const titlePrompt = titleHook
      ? (isNarrationMinimalStyle(style)
        ? finalizeNarrationImagePrompt(String(parsed?.title_image_prompt || '').trim(), {
          titleHook,
          titleFull,
          titleBodySentences: options?.fullNarrationLines,
        })
        : sanitizeSceneImagePrompt(String(parsed?.title_image_prompt || '').trim())) || null
      : null

    logTaskSuccess('NarrationScene', 'llm-paragraph-prompt-done', {
      paragraphCount: paragraphs.length,
      hasTitle: !!titlePrompt,
    })
    return { titlePrompt, promptsByStartIndex }
  } catch (err: any) {
    logTaskError('NarrationScene', 'llm-paragraph-prompt-failed', { error: err.message })
    return null
  }
}
