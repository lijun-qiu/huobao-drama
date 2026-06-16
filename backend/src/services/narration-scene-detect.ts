import { getTextConfig, getTextProviderBaseUrl } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import { artStylePrompt, sanitizeSceneImagePrompt } from '../constants/art-styles.js'
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

/** 解说分镜：遇标点即拆，一句一镜 */
const PUNCT_BOUNDARY_RE = /(?<=[。！？；，、,.!?;])\s*/

function splitNarrationChunk(chunk: string): string[] {
  const flat = chunk.replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const parts = flat
    .split(PUNCT_BOUNDARY_RE)
    .map(s => s.trim())
    .filter(Boolean)

  return parts.length ? parts : [flat]
}

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

/** 片头标题：与正文相同，按标点（含逗号顿号）逐句一镜；合成时红字「剧中」叠字 */
export function splitTitleSentencesWithMeta(text: string): NarrationSentenceItem[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  return splitNarrationSentencesWithMeta(normalized)
}

/** 省钱模式：段落换景 + 中强场景词 + 长段自动补图，避免整段只用一张 */
export function detectImageNeedsConservative(items: NarrationSentenceItem[]): boolean[] {
  const raw = items.map((item, index) => {
    if (index === 0) return true
    const prev = items[index - 1]
    const sentence = item.sentence
    if (item.paragraphIndex !== prev.paragraphIndex) return true
    if (STRONG_SCENE_SHIFT_RE.test(sentence)) return true
    if (SCENE_SHIFT_RE.test(sentence)) return true
    return false
  })
  const merged = consolidateShortSceneSegments(items, raw, 2)
  return ensureMaxNarrationGap(items, merged, 6)
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
    if (i > 0 && segLen < minSentences && !STRONG_SCENE_SHIFT_RE.test(items[i].sentence)) {
      result[i] = false
    }
    i = end + 1
  }
  return result
}

/** 规则兜底：换段落、场景词、地点/时间起句、叙事节拍转折 → 新配图 */
export function detectImageNeedsHeuristic(items: NarrationSentenceItem[]): boolean[] {
  return items.map((item, index) => {
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

async function callTextChat(system: string, user: string): Promise<string> {
  const config = getTextConfig()
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

/** 按 needs_image 切分场景段落：每段首镜配图，内容覆盖该段全部旁白 */
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
): Promise<string[] | null> {
  if (!segments.length) return []

  try {
    const config = getTextConfig()
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-scene-prompt-start', { sceneCount: segments.length, model: config.model })

    const system = [
      '你是影视解说分镜美术指导，根据每段旁白场景写出用于 AI 文生图的「单场景画面描述」。',
      '规则：',
      '1) 综合该段全部旁白句子，提炼地点、人物、动作与氛围，不要只描述首句',
      '2) 每条 prompt 描述一个完整场景的主画面，适合单张插画',
      `3) ${style} 漫画插画风格，电影感构图，无文字无水印`,
      '4) 不要出现 grid、panel、宫格、分格、collage、split、strip 等词',
      '5) 用中文描述画面内容，可夹杂少量英文风格词',
      '只输出 JSON，不要解释。',
    ].join('\n')

    const user = JSON.stringify({
      scenes: segments.map((seg, index) => ({
        scene_index: index,
        narration_lines: seg.sentences,
      })),
      output_format: { image_prompts: 'string[]，长度与 scenes 相同' },
    })

    const text = await callTextChat(system, user)
    const parsed = extractJsonObject(text)
    const prompts = Array.isArray(parsed?.image_prompts) ? parsed.image_prompts : null
    if (!prompts || prompts.length !== segments.length) {
      logTaskWarn('NarrationScene', 'llm-scene-prompt-invalid', { expected: segments.length, got: prompts?.length || 0 })
      return null
    }

    const normalized = prompts.map((p: unknown) => String(p || '').trim()).filter(Boolean)
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
): Promise<boolean[] | null> {
  if (!items.length) return []

  try {
    const config = getTextConfig()
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-detect-start', { sentenceCount: items.length, model: config.model })

    const system = mode === 'conservative'
      ? [
        '你是影视解说分镜导演，判断每句旁白是否需要配一张新插图（省钱均衡模式：比标准少配图，但不能长期不换画面）。',
        '规则：',
        '1) 场景/地点/时间/空间明显切换 → needs_image=true',
        '2) 空行分段后的首句 → 通常 needs_image=true',
        '3) 同一场景内连续动作、情绪描写 → needs_image=false',
        '4) 正文第1句 needs_image=true',
        '5) 目标密度：大约每 4–6 句配 1 张新图；同一段落内若已连续 5 句 false，下一句优先 true',
        '6) 忽略「在xxx里，」等弱起句，除非整段确实换到新地点',
        '只输出 JSON，不要解释。',
      ].join('\n')
      : [
        '你是影视解说分镜导演，负责判断每一句旁白是否需要单独配一张新插图。',
        '规则：',
        '1) 与上一句相比，若场景/地点/时间/空间/视角发生明显切换 → needs_image=true',
        '2) 仍在同一场景、同一空间连续叙述、只是动作或对白延续 → needs_image=false',
        '3) 正文第1句永远 needs_image=true',
        '4) 空行分段后的首句，通常表示场景切换，优先 needs_image=true',
        '5) 宁可多标 true，也不要把明显换场景的句子标成 false',
        '只输出 JSON，不要解释。',
      ].join('\n')

    const user = JSON.stringify({
      sentences: items.map(item => item.sentence),
      paragraph_indexes: items.map(item => item.paragraphIndex),
      output_format: { needs_image: 'boolean[]，长度与 sentences 相同' },
    })

    const text = await callTextChat(system, user)
    const parsed = extractJsonObject(text)
    const flags = Array.isArray(parsed?.needs_image) ? parsed.needs_image : null
    if (!flags || flags.length !== items.length) {
      logTaskWarn('NarrationScene', 'llm-detect-invalid', { expected: items.length, got: flags?.length || 0 })
      return null
    }

    const normalized = mode === 'conservative'
      ? ensureMaxNarrationGap(
        items,
        consolidateShortSceneSegments(
          items,
          flags.map((flag: unknown, index: number) => index === 0 ? true : !!flag),
          2,
        ),
        6,
      )
      : flags.map((flag: unknown, index: number) => index === 0 ? true : !!flag)
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

/** 按段落规则拆镜后，用文本模型批量生成配图提示词（英文，可直接用于文生图） */
export async function generateParagraphImagePromptsWithLLM(
  paragraphs: ParagraphPromptInput[],
  options?: {
    titleHook?: string | null
    titleFull?: string | null
    style?: string
    characters?: CharacterPromptHint[]
  },
): Promise<{ titlePrompt: string | null; promptsByStartIndex: Map<number, string> } | null> {
  const style = options?.style || 'comic'
  const titleHook = options?.titleHook?.trim() || null
  const titleFull = options?.titleFull?.trim() || null
  const characters = options?.characters || []

  if (!paragraphs.length && !titleHook) return { titlePrompt: null, promptsByStartIndex: new Map() }

  try {
    const config = getTextConfig()
    if (!config.apiKey) return null

    logTaskProgress('NarrationScene', 'llm-paragraph-prompt-start', {
      paragraphCount: paragraphs.length,
      hasTitle: !!titleHook,
      model: config.model,
    })

    const system = [
      '你是影视解说分镜美术指导。拆镜结构已由规则确定（一句旁白一镜、按场景密切换图），你的任务是写 AI 文生图用的英文 image_prompt。',
      '硬性规则：',
      '1) 每个配图段综合该段旁白句，提炼地点、人物、动作、氛围；段越短越聚焦当前画面，不要写未出现的后续情节',
      `2) 画风：${artStylePrompt(style, 'scene')}, 16:9 landscape, high quality, no text, no watermark`,
      '3) layout=single（默认）：单张完整场景插画，完整概括该段旁白。prompt 以 "single full illustration, one complete scene only" 开头，并写明 no grid, no collage, no multi-panel, no split screen',
      '4) 仅当输入 layout=diptych 时才写两宫格：横向两宫格（仍算一张图）。prompt 以 "single 16:9 illustration with exactly 2 horizontal panels side by side, diptych layout, one image file" 开头，分别描述 left panel 与 right panel',
      '5) 片头标题图：与故事 hook 对应的具体时代/场景背景（如 80 年代夜市、杂货铺），预留中央叠字区域，绝对无文字 no text no letters no words',
      '6) 除 diptych 两宫格式外，禁止 grid/panel/collage/strip/storyboard 等词',
      '7) 禁止 romantic couple、clock faces、roses、ethereal、dreamlike、nostalgic filter、retro filter、pixel art 等会把画风带偏的词；写 1980s-era 场景即可，不要写 1980s retro',
      characters.length
        ? '8) 若段落涉及已知角色，prompt 中必须写出其外貌特征并保持与角色设定一致（same face, same outfit）'
        : '',
      '只输出 JSON，不要解释。',
    ].filter(Boolean).join('\n')

    const user = JSON.stringify({
      title: titleHook ? { hook: titleHook, full: titleFull || titleHook } : null,
      characters: characters.map(ch => ({
        name: ch.name,
        appearance: ch.appearance || '',
      })),
      paragraphs: paragraphs.map(p => ({
        paragraph_index: p.index,
        start_index: p.startIndex,
        layout: p.layout,
        narration_lines: p.sentences,
      })),
      output_format: {
        title_image_prompt: 'string | null，片头背景英文 prompt',
        paragraph_prompts: '[{ start_index: number, image_prompt: string }]，长度与 paragraphs 相同',
      },
    })

    const text = await callTextChat(system, user)
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
        promptsByStartIndex.set(startIndex, sanitizeSceneImagePrompt(prompt))
      }
      if (promptsByStartIndex.size !== paragraphs.length) return null
    }

    const titlePrompt = titleHook
      ? sanitizeSceneImagePrompt(String(parsed?.title_image_prompt || '').trim()) || null
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
