import { buildNarrationStoryboardLLMSystem } from '../constants/art-styles.js'
import { resolveNarrationStoryboardTextModel } from '../constants/text-models.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { stripEmphasisMarkers } from '../utils/subtitle-emphasis.js'
import { assertTextConfigHasCredentials, getTextConfig } from './ai.js'
import {
  splitNarrationSentencesWithMeta,
  splitTitleSentencesWithMeta,
  type NarrationSentenceItem,
} from './narration-scene-detect.js'
import { callTextChat } from './text-chat.js'

const STORYBOARD_LLM_TIMEOUT_MS = 300_000
const STORYBOARD_LLM_RETRIES = 2

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

function parseFullStoryboardResponse(text: string): { titleSentences: string[]; sentences: string[] } | null {
  const obj = extractJsonObject(text)
  if (!obj) return null

  const bodyRaw = obj.sentences
  if (!Array.isArray(bodyRaw) || !bodyRaw.length) return null
  const sentences = bodyRaw.map(line => String(line ?? '').trim()).filter(Boolean)
  if (!sentences.length) return null

  const titleRaw = obj.title_sentences
  const titleSentences = Array.isArray(titleRaw)
    ? titleRaw.map(line => String(line ?? '').trim()).filter(Boolean)
    : []

  return { titleSentences, sentences }
}

function validateSplitFidelity(original: string, sentences: string[]): boolean {
  const origChars = stripEmphasisMarkers(original).replace(/\s/g, '')
  const splitChars = sentences.map(s => stripEmphasisMarkers(s).replace(/\s/g, '')).join('')
  if (!origChars.length) return false
  const ratio = Math.abs(origChars.length - splitChars.length) / origChars.length
  return ratio <= 0.08
}

function splitBodyParagraphs(body: string): string[] {
  return body.replace(/\r\n/g, '\n').trim().split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
}

function attachParagraphIndices(body: string, sentences: string[]): NarrationSentenceItem[] {
  const paragraphs = splitBodyParagraphs(body)
  if (!paragraphs.length) {
    return sentences.map(sentence => ({ sentence, paragraphIndex: 0 }))
  }

  const norm = (s: string) => stripEmphasisMarkers(s).replace(/\s/g, '')
  const paraNorms = paragraphs.map(norm)
  const items: NarrationSentenceItem[] = []
  let paragraphIndex = 0
  let offset = 0

  for (const sentence of sentences) {
    const sentenceNorm = norm(sentence)
    if (!sentenceNorm) continue

    let matched = false
    while (paragraphIndex < paraNorms.length) {
      const rest = paraNorms[paragraphIndex].slice(offset)
      if (
        rest.startsWith(sentenceNorm)
        || sentenceNorm.startsWith(rest.slice(0, Math.max(1, Math.min(sentenceNorm.length, rest.length))))
      ) {
        items.push({ sentence, paragraphIndex })
        offset += sentenceNorm.length
        if (offset >= paraNorms[paragraphIndex].length) {
          paragraphIndex += 1
          offset = 0
        }
        matched = true
        break
      }
      paragraphIndex += 1
      offset = 0
    }

    if (!matched) {
      items.push({
        sentence,
        paragraphIndex: Math.min(Math.max(paragraphIndex, 0), paragraphs.length - 1),
      })
    }
  }

  return items
}

async function splitFullScriptWithLLM(
  title: string | null,
  body: string,
  options: {
    textModel: string
    titleHook?: string | null
  },
): Promise<{ titleItems: NarrationSentenceItem[]; sentenceItems: NarrationSentenceItem[] } | null> {
  const bodyTrimmed = body.trim()
  const titleTrimmed = title?.trim() || ''
  if (!bodyTrimmed && !titleTrimmed) {
    return { titleItems: [], sentenceItems: [] }
  }

  const plainBody = stripEmphasisMarkers(bodyTrimmed)
  const plainTitle = titleTrimmed ? stripEmphasisMarkers(titleTrimmed) : ''

  const user = JSON.stringify({
    ...(plainTitle ? { title: plainTitle } : {}),
    ...(plainBody ? { body: plainBody } : {}),
    ...(options.titleHook?.trim() ? { title_hook: options.titleHook.trim() } : {}),
    output_format: {
      title_sentences: 'string[]，片头句（无 title 则 []）',
      sentences: 'string[]，正文一镜一句，可含 **',
    },
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
        false,
        STORYBOARD_LLM_TIMEOUT_MS,
        true,
      )
      const parsed = parseFullStoryboardResponse(text)
      if (!parsed) {
        lastError = 'invalid storyboard JSON'
        continue
      }
      if (plainBody && !validateSplitFidelity(plainBody, parsed.sentences)) {
        lastError = 'body fidelity check failed'
        continue
      }
      if (
        plainTitle
        && parsed.titleSentences.length
        && !validateSplitFidelity(plainTitle, parsed.titleSentences)
      ) {
        lastError = 'title fidelity check failed'
        continue
      }

      const titleItems: NarrationSentenceItem[] = plainTitle
        ? (parsed.titleSentences.length
          ? parsed.titleSentences.map((sentence, index) => ({ sentence, paragraphIndex: index }))
          : [{ sentence: plainTitle, paragraphIndex: 0 }])
        : []

      const sentenceItems = plainBody
        ? attachParagraphIndices(bodyTrimmed, parsed.sentences)
        : []

      return { titleItems, sentenceItems }
    } catch (err: unknown) {
      lastError = String((err as Error)?.message || err || 'unknown error')
      if (attempt >= STORYBOARD_LLM_RETRIES) throw err
    }
  }

  logTaskWarn('NarrationStoryboardLLM', 'full-script-fallback-rules', { error: lastError })
  return null
}

export type StoryboardLLMOptions = {
  textModel?: string | null
  textThinking?: boolean
  episodeTextModel?: string | null
  titleHook?: string | null
}

/** 旁白分镜：整稿一次 LLM 拆镜 + ** 标注；失败时规则拆句 + 批量标注 */
export async function buildStoryboardSentenceItemsWithLLM(
  title: string | null,
  body: string,
  options?: StoryboardLLMOptions,
): Promise<{ titleItems: NarrationSentenceItem[]; sentenceItems: NarrationSentenceItem[] }> {
  const textModel = resolveNarrationStoryboardTextModel(
    options?.episodeTextModel ? { textModel: options.episodeTextModel } : null,
    options?.textModel,
  )
  const config = getTextConfig(textModel)
  assertTextConfigHasCredentials(config)

  const ruleTitleItems = title ? splitTitleSentencesWithMeta(title) : []
  const ruleBodyItems = body.trim() ? splitNarrationSentencesWithMeta(body) : []

  logTaskProgress('NarrationStoryboardLLM', 'start', {
    model: textModel,
    bodyChars: stripEmphasisMarkers(body).replace(/\s/g, '').length,
    ruleSentenceCount: ruleBodyItems.length,
  })

  try {
    const llmResult = await splitFullScriptWithLLM(title, body, {
      textModel,
      titleHook: options?.titleHook ?? title,
    })
    if (llmResult) {
      logTaskSuccess('NarrationStoryboardLLM', 'done', {
        titleCount: llmResult.titleItems.length,
        sentenceCount: llmResult.sentenceItems.length,
        usedLlmSplit: true,
      })
      return llmResult
    }
  } catch (err: unknown) {
    logTaskWarn('NarrationStoryboardLLM', 'full-script-error', {
      error: String((err as Error)?.message || err || 'unknown'),
    })
  }

  logTaskProgress('NarrationStoryboardLLM', 'emphasis-fallback-batch', {
    sentenceCount: ruleBodyItems.length,
  })

  const originals = ruleBodyItems.map(item => stripEmphasisMarkers(item.sentence))
  const { markStoryboardSentencesWithEmphasisLLM } = await import('./narration-emphasis-apply.js')
  const marked = await markStoryboardSentencesWithEmphasisLLM(originals, {
    textModel,
    textThinking: false,
    fullNarration: originals,
    titleHook: options?.titleHook ?? title,
  })

  const sentenceItems = ruleBodyItems.map((item, index) => ({
    ...item,
    sentence: marked[index] ?? item.sentence,
  }))

  logTaskSuccess('NarrationStoryboardLLM', 'done', {
    titleCount: ruleTitleItems.length,
    sentenceCount: sentenceItems.length,
    usedLlmSplit: false,
  })

  return { titleItems: ruleTitleItems, sentenceItems }
}
