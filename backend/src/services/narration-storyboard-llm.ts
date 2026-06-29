import { buildNarrationStoryboardLLMSystem } from '../constants/art-styles.js'
import { resolveNarrationStoryboardTextModel } from '../constants/text-models.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { stripEmphasisMarkers } from '../utils/subtitle-emphasis.js'
import { getTextConfig } from './ai.js'
import {
  splitNarrationSentencesWithMeta,
  splitTitleSentencesWithMeta,
  type NarrationSentenceItem,
} from './narration-scene-detect.js'
import { callTextChat } from './text-chat.js'

const STORYBOARD_LLM_TIMEOUT_MS = 180_000
const STORYBOARD_LLM_RETRIES = 2
const STORYBOARD_LLM_PARAGRAPH_GAP_MS = 800

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    // fall through
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function parseStoryboardSentencesResponse(text: string): string[] | null {
  const obj = extractJsonObject(text)
  const raw = obj?.sentences
  if (!Array.isArray(raw) || !raw.length) return null
  const sentences = raw.map(line => String(line ?? '').trim()).filter(Boolean)
  return sentences.length ? sentences : null
}

function validateSplitFidelity(original: string, sentences: string[]): boolean {
  const origChars = stripEmphasisMarkers(original).replace(/\s/g, '')
  const splitChars = sentences.map(s => stripEmphasisMarkers(s).replace(/\s/g, '')).join('')
  if (!origChars.length) return false
  const ratio = Math.abs(origChars.length - splitChars.length) / origChars.length
  return ratio <= 0.08
}

async function splitParagraphWithLLM(
  paragraph: string,
  paragraphIndex: number,
  options: {
    textModel: string
    textThinking: boolean
    isTitle?: boolean
    titleHook?: string | null
    fullNarration?: string[]
  },
): Promise<NarrationSentenceItem[] | null> {
  const trimmed = String(paragraph || '').trim()
  if (!trimmed) return []

  const user = JSON.stringify({
    is_title: !!options.isTitle,
    paragraph_index: paragraphIndex,
    paragraph: trimmed,
    ...(options.titleHook?.trim() ? { title_hook: options.titleHook.trim() } : {}),
    ...(options.fullNarration?.length ? { full_narration: options.fullNarration } : {}),
    output_format: { sentences: 'string[]，本段拆镜后的旁白句，可含 **' },
  })

  const system = buildNarrationStoryboardLLMSystem()
  let lastError = ''

  for (let attempt = 0; attempt <= STORYBOARD_LLM_RETRIES; attempt++) {
    if (attempt > 0) await sleep(2_000 * attempt)
    try {
      const text = await callTextChat(
        system,
        user,
        options.textModel,
        options.textThinking,
        STORYBOARD_LLM_TIMEOUT_MS,
        true,
      )
      const sentences = parseStoryboardSentencesResponse(text)
      if (!sentences?.length) {
        lastError = 'invalid sentences JSON'
        continue
      }
      if (!validateSplitFidelity(trimmed, sentences)) {
        lastError = 'split fidelity check failed'
        continue
      }
      return sentences.map(sentence => ({ sentence, paragraphIndex }))
    } catch (err: unknown) {
      lastError = String((err as Error)?.message || err || 'unknown error')
      if (attempt >= STORYBOARD_LLM_RETRIES) throw err
    }
  }

  logTaskWarn('NarrationStoryboardLLM', 'paragraph-fallback-rules', {
    paragraphIndex,
    isTitle: !!options.isTitle,
    error: lastError,
  })
  return null
}

function splitBodyParagraphs(body: string): string[] {
  return body.replace(/\r\n/g, '\n').trim().split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
}

function ruleSplitTitle(title: string): NarrationSentenceItem[] {
  return splitTitleSentencesWithMeta(title)
}

function ruleSplitBody(body: string): NarrationSentenceItem[] {
  return splitNarrationSentencesWithMeta(body)
}

export type StoryboardLLMOptions = {
  textModel?: string | null
  textThinking?: boolean
  episodeTextModel?: string | null
  titleHook?: string | null
}

/** Qwen 旁白分镜：按段 LLM 拆句并标注 **，失败时回退规则拆句 + LLM 仅标注 */
export async function buildStoryboardSentenceItemsWithLLM(
  title: string | null,
  body: string,
  options?: StoryboardLLMOptions,
): Promise<{ titleItems: NarrationSentenceItem[]; sentenceItems: NarrationSentenceItem[] }> {
  const textModel = resolveNarrationStoryboardTextModel(
    options?.episodeTextModel ? { textModel: options.episodeTextModel } : null,
    options?.textModel,
  )
  const textThinking = options?.textThinking ?? false
  const config = getTextConfig(textModel)
  if (!config.apiKey) {
    throw new Error('未配置文本模型 API Key')
  }

  const bodyParagraphs = splitBodyParagraphs(body)
  const ruleTitleItems = title ? ruleSplitTitle(title) : []
  const ruleBodyItems = body.trim() ? ruleSplitBody(body) : []
  const fullNarration = ruleBodyItems.map(item => stripEmphasisMarkers(item.sentence))

  logTaskProgress('NarrationStoryboardLLM', 'start', {
    model: textModel,
    titleParagraphs: title ? 1 : 0,
    bodyParagraphs: bodyParagraphs.length,
    ruleSentenceCount: ruleBodyItems.length,
  })

  const titleItems: NarrationSentenceItem[] = []
  if (title?.trim()) {
    const llmTitle = await splitParagraphWithLLM(title.trim(), 0, {
      textModel,
      textThinking,
      isTitle: true,
      titleHook: options?.titleHook ?? title,
      fullNarration,
    })
    titleItems.push(...(llmTitle ?? ruleTitleItems))
  }

  const sentenceItems: NarrationSentenceItem[] = []
  let usedLlmSplit = true

  for (let i = 0; i < bodyParagraphs.length; i++) {
    if (i > 0) await sleep(STORYBOARD_LLM_PARAGRAPH_GAP_MS)
    const llmItems = await splitParagraphWithLLM(bodyParagraphs[i], i, {
      textModel,
      textThinking,
      titleHook: options?.titleHook ?? title,
      fullNarration,
    })
    if (llmItems?.length) {
      sentenceItems.push(...llmItems)
    } else {
      usedLlmSplit = false
      const fallback = ruleSplitBody(bodyParagraphs[i]).map(item => ({
        ...item,
        paragraphIndex: i,
      }))
      sentenceItems.push(...fallback)
    }
  }

  if (!usedLlmSplit && sentenceItems.length) {
    logTaskProgress('NarrationStoryboardLLM', 'emphasis-fallback-batch', {
      sentenceCount: sentenceItems.length,
    })
    const originals = sentenceItems.map(item => stripEmphasisMarkers(item.sentence))
    const { markStoryboardSentencesWithEmphasisLLM } = await import('./narration-emphasis-apply.js')
    const marked = await markStoryboardSentencesWithEmphasisLLM(originals, {
      textModel,
      textThinking: false,
      fullNarration: originals,
      titleHook: options?.titleHook ?? title,
    })
    marked.forEach((sentence, index) => {
      if (sentenceItems[index]) sentenceItems[index].sentence = sentence
    })
  }

  logTaskSuccess('NarrationStoryboardLLM', 'done', {
    titleCount: titleItems.length,
    sentenceCount: sentenceItems.length,
    usedLlmSplit,
  })

  return { titleItems, sentenceItems }
}
