import { eq } from 'drizzle-orm'
import { buildNarrationScriptEmphasisLLMSystem, buildNarrationSubtitleEmphasisLLMSystem } from '../constants/art-styles.js'
import { parseNarrationScript } from './narration-breakdown.js'
import { splitNarrationSentencesWithMeta, type NarrationSentenceItem } from './narration-scene-detect.js'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import {
  limitEmphasisMarkers,
  markSentencesEmphasisHeuristic,
  narrationEmphasisEnabled,
  narrationEmphasisUsesLlm,
  resolveNarrationEmphasisMode,
  stripEmphasisMarkers,
  validateEmphasisMarkedSentence,
  normalizeEmphasisAcrossSentences,
  hasEmphasisMarkers,
} from '../utils/subtitle-emphasis.js'
import { getTextConfig } from './ai.js'
import { patchNarrationImageMeta, parseNarrationImageMeta } from './narration-image.js'
import type { NarrationParagraph } from './narration-paragraph.js'
import { callTextChat } from './text-chat.js'

const SUBTITLE_EMPHASIS_LLM_BATCH_SIZE = 20
const SUBTITLE_EMPHASIS_LLM_RETRIES = 2
const SUBTITLE_EMPHASIS_LLM_TIMEOUT_MS = 180_000
const SUBTITLE_EMPHASIS_LLM_BATCH_GAP_MS = 1_000

const SCRIPT_EMPHASIS_LLM_BATCH_SIZE = 25
const SCRIPT_EMPHASIS_LLM_TIMEOUT_MS = 180_000

export type ParagraphSubtitleInput = {
  startIndex: number
  ttsSentences: string[]
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function chunkParagraphSubtitles<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export function isParagraphSubtitleLinesComplete(
  ttsSentences: string[],
  lines?: string[],
): boolean {
  return Array.isArray(lines) && lines.length === ttsSentences.length
}

export function normalizeParagraphSubtitleLines(
  lines: unknown,
  ttsSentences: string[],
): string[] | undefined {
  if (!ttsSentences.length || !narrationEmphasisEnabled()) return undefined
  if (resolveNarrationEmphasisMode() === 'script') return undefined

  if (resolveNarrationEmphasisMode() === 'rules') {
    return normalizeEmphasisAcrossSentences(
      ttsSentences,
      markSentencesEmphasisHeuristic(ttsSentences),
    )
  }

  if (!Array.isArray(lines) || lines.length !== ttsSentences.length) {
    return undefined
  }

  return lines.map((line, i) => {
    const original = ttsSentences[i] || ''
    return limitEmphasisMarkers(
      validateEmphasisMarkedSentence(original, String(line ?? '').trim() || original),
      1,
    )
  })
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

function normalizeSubtitleEmphasisRow(row: unknown): {
  start_index: number
  subtitle_lines: string[]
} | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const startIndex = Number(r.start_index ?? r.startIndex)
  const linesRaw = r.subtitle_lines ?? r.subtitleLines
  if (!Number.isFinite(startIndex) || !Array.isArray(linesRaw)) return null
  const subtitleLines = linesRaw.map(line => String(line ?? ''))
  if (!subtitleLines.length) return null
  return { start_index: startIndex, subtitle_lines: subtitleLines }
}

function parseSubtitleEmphasisRows(
  text: string,
  batch: ParagraphSubtitleInput[],
): Array<{ start_index: number; subtitle_lines: string[] }> | null {
  const raw = String(text || '').trim()
  if (!raw) return null

  const expectedStarts = batch.map(p => p.startIndex)
  const collect = (rows: unknown[]): Array<{ start_index: number; subtitle_lines: string[] }> | null => {
    const normalized = rows.map(normalizeSubtitleEmphasisRow).filter(Boolean) as Array<{
      start_index: number
      subtitle_lines: string[]
    }>
    if (normalized.length === batch.length) return normalized
    const byStart = normalized.filter(r => expectedStarts.includes(r.start_index))
    if (byStart.length === batch.length) return byStart
    return null
  }

  const parsed = extractJsonObject(raw)
  const fromObject = Array.isArray(parsed?.subtitle_results) ? parsed.subtitle_results : null
  if (fromObject) {
    const rows = collect(fromObject)
    if (rows) return rows
  }

  const resultsKey = raw.match(/"subtitle_results"\s*:\s*(\[[\s\S]*\])/)
  if (resultsKey?.[1]) {
    try {
      const arr = JSON.parse(resultsKey[1])
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
      const arr = JSON.parse(arrayMatch[0])
      if (Array.isArray(arr)) {
        const rows = collect(arr)
        if (rows) return rows
      }
    } catch {
      // ignore
    }
  }

  return null
}

function parseMarkedSentencesResponse(text: string, expectedLen: number): string[] | null {
  const obj = extractJsonObject(text)
  const raw = obj?.marked_sentences ?? obj?.markedSentences
  if (!Array.isArray(raw) || raw.length !== expectedLen) return null
  return raw.map(line => String(line ?? ''))
}

function normalizeMarkedSentences(originals: string[], marked: string[]): string[] {
  return originals.map((original, i) => limitEmphasisMarkers(
    validateEmphasisMarkedSentence(original, marked[i]?.trim() || original),
    1,
  ))
}

function reassembleMarkedBody(items: NarrationSentenceItem[], markedSentences: string[]): string {
  const byPara = new Map<number, string[]>()
  items.forEach((item, i) => {
    const list = byPara.get(item.paragraphIndex) ?? []
    list.push(markedSentences[i] ?? item.sentence)
    byPara.set(item.paragraphIndex, list)
  })
  const maxPara = Math.max(...items.map(item => item.paragraphIndex), 0)
  const parts: string[] = []
  for (let p = 0; p <= maxPara; p++) {
    const sents = byPara.get(p)
    if (sents?.length) parts.push(sents.join(''))
  }
  return parts.join('\n\n')
}

export function looksLikeNarrationScriptDraft(text: string): boolean {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  if (/^今天体验的人生剧本是/m.test(trimmed)) return true
  const { body } = parseNarrationScript(trimmed)
  return body.replace(/\s/g, '').length >= 150
}

export type NarrationEmphasisLLMOptions = {
  textModel?: string | null
  textThinking?: boolean
  fullNarration?: string[]
  titleHook?: string | null
}

function buildEmphasisLLMUserPayload(params: {
  sentences?: string[]
  paragraphs?: ParagraphSubtitleInput[]
  batchSentenceStartIndex?: number
  fullNarration?: string[]
  titleHook?: string | null
  outputFormat: Record<string, string>
}) {
  const fullNarration = (params.fullNarration || [])
    .map(s => String(s || '').trim())
    .filter(Boolean)

  return JSON.stringify({
    ...(params.titleHook?.trim() ? { title_hook: params.titleHook.trim() } : {}),
    ...(fullNarration.length ? { full_narration: fullNarration } : {}),
    ...(params.batchSentenceStartIndex != null && params.batchSentenceStartIndex >= 0
      ? { batch_sentence_start_index: params.batchSentenceStartIndex }
      : {}),
    ...(params.sentences?.length ? { sentences: params.sentences } : {}),
    ...(params.paragraphs?.length
      ? {
        paragraphs: params.paragraphs.map(p => ({
          start_index: p.startIndex,
          tts_sentences: p.ttsSentences,
        })),
      }
      : {}),
    output_format: params.outputFormat,
  })
}

async function markSentencesWithEmphasisLLM(
  originals: string[],
  options?: NarrationEmphasisLLMOptions,
): Promise<string[]> {
  if (!originals.length) return []

  const config = getTextConfig(options?.textModel)
  if (!config.apiKey) throw new Error('未配置文本模型 API Key')

  const system = buildNarrationScriptEmphasisLLMSystem()
  // 结构化 JSON 标注，禁用思考模式以显著加速（125 句约 5 批）
  const textThinking = false
  const result = [...originals]
  const batches = chunkParagraphSubtitles(
    originals.map((sentence, index) => ({ startIndex: index, ttsSentences: [sentence] })),
    SCRIPT_EMPHASIS_LLM_BATCH_SIZE,
  ).map(batch => batch.map(item => item.ttsSentences[0] ?? ''))

  logTaskProgress('NarrationScriptEmphasis', 'llm-start', {
    sentenceCount: originals.length,
    batchCount: batches.length,
    model: config.model,
  })

  let offset = 0
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    if (batchIndex > 0) await sleep(SUBTITLE_EMPHASIS_LLM_BATCH_GAP_MS)

    const user = buildEmphasisLLMUserPayload({
      sentences: batch,
      batchSentenceStartIndex: offset,
      fullNarration: options?.fullNarration,
      titleHook: options?.titleHook,
      outputFormat: { marked_sentences: 'string[]，长度与 sentences 相同' },
    })

    let marked: string[] | null = null
    let lastError = ''

    for (let attempt = 0; attempt <= SUBTITLE_EMPHASIS_LLM_RETRIES; attempt++) {
      if (attempt > 0) {
        logTaskWarn('NarrationScriptEmphasis', 'batch-retry', {
          batch: batchIndex + 1,
          attempt,
          lastError: lastError.slice(0, 200),
        })
        await sleep(2_000 * attempt)
      }

      try {
        const text = await callTextChat(
          system,
          user,
          options?.textModel,
          textThinking,
          SCRIPT_EMPHASIS_LLM_TIMEOUT_MS,
          true,
        )
        marked = parseMarkedSentencesResponse(text, batch.length)
        if (marked) break
        lastError = 'invalid marked_sentences JSON'
      } catch (err: unknown) {
        lastError = String((err as Error)?.message || err || 'unknown error')
        if (attempt >= SUBTITLE_EMPHASIS_LLM_RETRIES) throw err
      }
    }

    if (marked) {
      const normalized = normalizeMarkedSentences(batch, marked)
      normalized.forEach((line, i) => {
        result[offset + i] = line
      })
      logTaskProgress('NarrationScriptEmphasis', 'batch-done', {
        batch: batchIndex + 1,
        batchCount: batches.length,
        size: batch.length,
      })
    } else {
      logTaskWarn('NarrationScriptEmphasis', 'batch-fallback-rules', {
        batch: batchIndex + 1,
        size: batch.length,
      })
      markSentencesEmphasisHeuristic(batch).forEach((line, i) => {
        result[offset + i] = line
      })
    }

    offset += batch.length
  }

  logTaskSuccess('NarrationScriptEmphasis', 'llm-done', {
    sentenceCount: originals.length,
  })

  const beforeAnchors = result.filter(line => hasEmphasisMarkers(line)).length
  const normalized = normalizeEmphasisAcrossSentences(originals, result)
  const afterAnchors = normalized.filter(line => hasEmphasisMarkers(line)).length
  if (beforeAnchors !== afterAnchors) {
    logTaskProgress('NarrationScriptEmphasis', 'global-normalize', {
      beforeAnchors,
      afterAnchors,
      sentenceCount: originals.length,
    })
  }

  return normalized
}

/** 旁白分镜：为已拆好的镜头句批量 LLM 标注 ** */
export async function markStoryboardSentencesWithEmphasisLLM(
  originals: string[],
  options?: NarrationEmphasisLLMOptions,
): Promise<string[]> {
  return markSentencesWithEmphasisLLM(originals, options)
}

/** 剧本生成第二阶段：逐句 LLM 标注 **，不改字 */
export async function applyNarrationScriptEmphasisWithLLM(
  script: string,
  options?: { textModel?: string | null; textThinking?: boolean },
): Promise<string> {
  const trimmed = String(script || '').trim()
  if (!trimmed || !narrationEmphasisEnabled()) return trimmed

  const { title, body } = parseNarrationScript(trimmed)
  if (!body.trim()) return trimmed

  const items = splitNarrationSentencesWithMeta(body)
  if (!items.length) return trimmed

  const originals = items.map(item => stripEmphasisMarkers(item.sentence))
  const markedSentences = await markSentencesWithEmphasisLLM(originals, {
    ...options,
    fullNarration: originals,
    titleHook: title?.trim() || null,
  })
  const markedBody = reassembleMarkedBody(items, markedSentences)

  if (title?.trim()) return `${title.trim()}\n\n${markedBody}`
  return markedBody
}

/** 独立 LLM 调用：为缺失 subtitle_lines 的段落补全关键词强调 */
export async function fillParagraphSubtitleLinesWithLLM(
  paragraphs: ParagraphSubtitleInput[],
  options?: NarrationEmphasisLLMOptions,
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()
  if (!paragraphs.length || !narrationEmphasisUsesLlm()) return result

  const config = getTextConfig(options?.textModel)
  if (!config.apiKey) throw new Error('未配置文本模型 API Key')

  const system = buildNarrationSubtitleEmphasisLLMSystem()
  const textThinking = options?.textThinking ?? false
  const batches = chunkParagraphSubtitles(paragraphs, SUBTITLE_EMPHASIS_LLM_BATCH_SIZE)

  logTaskProgress('NarrationEmphasis', 'llm-subtitle-start', {
    paragraphCount: paragraphs.length,
    batchCount: batches.length,
    model: config.model,
  })

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    if (batchIndex > 0) await sleep(SUBTITLE_EMPHASIS_LLM_BATCH_GAP_MS)

    const user = buildEmphasisLLMUserPayload({
      paragraphs: batch,
      fullNarration: options?.fullNarration,
      titleHook: options?.titleHook,
      outputFormat: {
        subtitle_results: '[{ start_index: number, subtitle_lines: string[] }]，长度与本批 paragraphs 相同',
      },
    })

    let rows: Array<{ start_index: number; subtitle_lines: string[] }> | null = null
    let lastRaw = ''
    let lastError = ''

    for (let attempt = 0; attempt <= SUBTITLE_EMPHASIS_LLM_RETRIES; attempt++) {
      if (attempt > 0) {
        logTaskWarn('NarrationEmphasis', 'llm-subtitle-batch-retry', {
          batch: batchIndex + 1,
          attempt,
          lastError: lastError.slice(0, 200),
        })
        await sleep(2_000 * attempt)
      }

      try {
        const text = await callTextChat(
          system,
          user,
          options?.textModel,
          textThinking,
          SUBTITLE_EMPHASIS_LLM_TIMEOUT_MS,
          true,
        )
        lastRaw = text
        rows = parseSubtitleEmphasisRows(text, batch)
        if (rows) break
        lastError = 'invalid subtitle_results JSON'
      } catch (err: unknown) {
        lastError = String((err as Error)?.message || err || 'unknown error')
        if (attempt >= SUBTITLE_EMPHASIS_LLM_RETRIES) throw err
      }
    }

    if (!rows) {
      logTaskWarn('NarrationEmphasis', 'llm-subtitle-invalid', {
        batch: batchIndex + 1,
        expected: batch.length,
        responsePreview: lastRaw.slice(0, 400),
      })
      continue
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const batchItem = batch.find(p => p.startIndex === Number(row?.start_index)) ?? batch[i]
      const startIndex = Number(row?.start_index ?? batchItem?.startIndex)
      if (!Number.isFinite(startIndex) || !batchItem) continue

      const normalized = normalizeParagraphSubtitleLines(row.subtitle_lines, batchItem.ttsSentences)
      if (normalized?.length) result.set(startIndex, normalized)
    }
  }

  logTaskSuccess('NarrationEmphasis', 'llm-subtitle-done', {
    requested: paragraphs.length,
    filled: result.size,
  })

  return result
}

/** 对 map 中缺失或长度不对的段落补调独立 LLM */
export async function ensureParagraphSubtitleLinesWithLLM(
  paragraphs: ParagraphSubtitleInput[],
  subtitleLinesByStartIndex: Map<number, string[]>,
  options?: NarrationEmphasisLLMOptions,
): Promise<{ filled: number; stillMissing: number }> {
  if (!narrationEmphasisUsesLlm()) {
    return { filled: 0, stillMissing: 0 }
  }

  const missing = paragraphs.filter(p => {
    const lines = subtitleLinesByStartIndex.get(p.startIndex)
    return !isParagraphSubtitleLinesComplete(p.ttsSentences, lines)
  })
  if (!missing.length) return { filled: 0, stillMissing: 0 }

  const filledMap = await fillParagraphSubtitleLinesWithLLM(missing, options)
  for (const [startIndex, lines] of filledMap) {
    subtitleLinesByStartIndex.set(startIndex, lines)
  }

  const stillMissing = paragraphs.filter(p => {
    const lines = subtitleLinesByStartIndex.get(p.startIndex)
    return !isParagraphSubtitleLinesComplete(p.ttsSentences, lines)
  }).length

  if (stillMissing) {
    logTaskWarn('NarrationEmphasis', 'llm-subtitle-incomplete', {
      requested: paragraphs.length,
      missingBefore: missing.length,
      stillMissing,
    })
  }

  return { filled: filledMap.size, stillMissing }
}

/** 将配图分镜 LLM 返回的 subtitle_lines 写入各镜 meta.subtitle_narration */
export function applySubtitleLinesToStoryboards(
  orderedStoryboards: Array<{ id: number; referenceImages?: string | null }>,
  paragraphs: NarrationParagraph[],
  subtitleLinesByStartIndex: Map<number, string[]>,
) {
  if (!subtitleLinesByStartIndex.size) return

  const ts = now()
  for (const [startIndex, lines] of subtitleLinesByStartIndex) {
    const para = paragraphs.find(p => p.startIndex === startIndex)
    if (!para || !lines.length) continue

    for (let offset = 0; offset <= para.endIndex - para.startIndex; offset++) {
      const sb = orderedStoryboards[para.startIndex + offset]
      if (!sb) continue
      const subtitleNarration = lines[offset]
      if (!subtitleNarration) continue

      const existing = parseNarrationImageMeta(sb.referenceImages)
      if (existing.subtitle_narration?.includes('**')) continue

      db.update(schema.storyboards)
        .set({
          referenceImages: patchNarrationImageMeta(sb.referenceImages, {
            subtitle_narration: subtitleNarration,
          }),
          updatedAt: ts,
        })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
    }
  }
}
