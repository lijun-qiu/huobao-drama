import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeVisualStyle } from '../constants/art-styles.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { now } from '../utils/response.js'
import { logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { applyRuleTemplatedCameraEnglish } from '../constants/flux-camera-en.js'
import {
  assessFluxEnglishPromptAccuracy,
  isBrokenFluxEnglishPrompt,
  translateNarrationPromptToFluxEnglish,
  FLUX_PROMPT_EN_VERSION,
  withFluxTranslateOllamaSession,
  beginFluxTranslateOllamaBatch,
  endFluxTranslateOllamaBatch,
  isFluxTranslateOllamaBatchActive,
  sanitizeFluxEnglishArtifacts,
} from './flux-prompt-translate.js'
import {
  buildNarrationImageMeta,
  isNarrationStoryboard,
  parseNarrationImageMeta,
  sortStoryboardsByOrder,
} from './narration-image.js'

const FLUX_TRANSLATE_PROVIDER = LOCAL_COMIC_ENV.fluxPromptTranslate

export type FluxTranslateProgress = {
  status: 'idle' | 'running' | 'done' | 'error'
  done: number
  total: number
  current_storyboard_id?: number
  error?: string
  updated_at: number
}

const progressByEpisode = new Map<number, FluxTranslateProgress>()

export function getEpisodeFluxTranslateProgress(episodeId: number): FluxTranslateProgress {
  return progressByEpisode.get(episodeId) ?? {
    status: 'idle',
    done: 0,
    total: 0,
    updated_at: Date.now(),
  }
}

function setEpisodeFluxTranslateProgress(episodeId: number, patch: Partial<FluxTranslateProgress>) {
  const prev = getEpisodeFluxTranslateProgress(episodeId)
  progressByEpisode.set(episodeId, {
    ...prev,
    ...patch,
    updated_at: Date.now(),
  })
}

function resolveStoryboardChinesePrompt(sb: { imagePrompt?: string | null }): string {
  return String(sb.imagePrompt || '').trim()
}

function storyboardNeedsFluxTranslate(sb: { imagePrompt?: string | null; referenceImages?: string | null }): boolean {
  const prompt = resolveStoryboardChinesePrompt(sb)
  if (!prompt || !/[\u4e00-\u9fff]/.test(prompt)) return false
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const stored = String(meta.flux_prompt_en || '').trim()
  if (!stored) return true
  // 准确性未过关才待译；仅版本号落后且内容已合格 → 不占用「剩余」
  return isBrokenFluxEnglishPrompt(stored, prompt)
}

export { beginFluxTranslateOllamaBatch, endFluxTranslateOllamaBatch } from './flux-prompt-translate.js'

export function mergeStoryboardFluxPromptMeta(
  referenceImages: string | null | undefined,
  fluxPromptEn: string,
): string {
  const meta = parseNarrationImageMeta(referenceImages)
  const cleaned = sanitizeFluxEnglishArtifacts(fluxPromptEn)
  return buildNarrationImageMeta(meta.narration_image_mode, {
    ...meta,
    flux_prompt_en: cleaned,
    flux_prompt_en_at: now(),
    flux_prompt_en_version: FLUX_PROMPT_EN_VERSION,
  })
}

/** 就地修复已存英文中的常见误译（无需重跑 LLM） */
export function repairEpisodeFluxPromptArtifacts(episodeId: number): { repaired: number; stillPending: number } {
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter(sb => !sb.deletedAt && String(sb.imagePrompt || '').trim())

  let repaired = 0
  let stillPending = 0
  const ts = now()

  for (const sb of storyboards) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const raw = String(meta.flux_prompt_en || '').trim()
    if (!raw) {
      stillPending++
      continue
    }
    const chinese = String(sb.imagePrompt || '').trim()
    const fixed = chinese
      ? applyRuleTemplatedCameraEnglish(sanitizeFluxEnglishArtifacts(raw), chinese)
      : sanitizeFluxEnglishArtifacts(raw)
    const qualityOk = !!chinese && !isBrokenFluxEnglishPrompt(fixed, chinese)
    if (!qualityOk) {
      stillPending++
      continue
    }
    if (fixed !== raw || Number(meta.flux_prompt_en_version || 0) < FLUX_PROMPT_EN_VERSION) {
      const referenceImages = mergeStoryboardFluxPromptMeta(sb.referenceImages, fixed)
      db.update(schema.storyboards)
        .set({ referenceImages, updatedAt: ts })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
      repaired++
    }
  }

  return { repaired, stillPending }
}

export function clearStoryboardFluxPromptMeta(referenceImages: string | null | undefined): string | undefined {
  const meta = parseNarrationImageMeta(referenceImages)
  if (!meta.flux_prompt_en && !meta.flux_prompt_en_at) return undefined
  const { flux_prompt_en: _a, flux_prompt_en_at: _b, ...rest } = meta
  return buildNarrationImageMeta(meta.narration_image_mode, rest)
}

async function resolveStoryboardVisualStyle(storyboardId: number, episodeId: number): Promise<string | null> {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return null
  const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return resolveEpisodeVisualStyle(ep.id, { dramaStyle: drama?.style ?? null })
}

export async function translateStoryboardFluxPrompt(
  storyboardId: number,
  opts?: { holdOllama?: boolean },
) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')

  const chinese = resolveStoryboardChinesePrompt(sb)
  if (!chinese) throw new Error('该镜头没有中文配图文案')
  if (!/[\u4e00-\u9fff]/.test(chinese)) {
    throw new Error('配图文案已是英文，无需翻译')
  }

  logTaskStart('FluxTranslate', 'storyboard', { storyboardId, episodeId: sb.episodeId, provider: FLUX_TRANSLATE_PROVIDER })

  const holdOllama = !!opts?.holdOllama || isFluxTranslateOllamaBatchActive()
  const visualStyle = await resolveStoryboardVisualStyle(storyboardId, sb.episodeId)
  const english = await translateNarrationPromptToFluxEnglish(chinese, visualStyle, { holdOllama })
  if (!english.trim()) throw new Error('翻译结果为空')
  const assess = assessFluxEnglishPromptAccuracy(english, chinese)
  if (!assess.ok) {
    throw new Error(`英文未通过准确性检查：${assess.reasons.join(', ')}`)
  }

  const referenceImages = mergeStoryboardFluxPromptMeta(sb.referenceImages, english)
  const ts = now()
  db.update(schema.storyboards)
    .set({ referenceImages, updatedAt: ts })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  logTaskSuccess('FluxTranslate', 'storyboard', {
    storyboardId,
    length: english.length,
    provider: FLUX_TRANSLATE_PROVIDER,
    accuracy_ok: true,
  })

  return {
    storyboard_id: storyboardId,
    flux_prompt_en: english,
    flux_prompt_en_at: ts,
    reference_images: referenceImages,
    accuracy_ok: true,
  }
}

export async function translateEpisodeFluxPrompts(episodeId: number, storyboardIds?: number[]) {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  ).filter(sb => isNarrationStoryboard(sb))

  const idSet = storyboardIds?.length ? new Set(storyboardIds.map(Number)) : null
  const targets = storyboards.filter(sb => (!idSet || idSet.has(sb.id)) && storyboardNeedsFluxTranslate(sb))

  logTaskStart('FluxTranslate', 'episode', { episodeId, targetCount: targets.length, provider: FLUX_TRANSLATE_PROVIDER })
  if (!targets.length) {
    setEpisodeFluxTranslateProgress(episodeId, { status: 'idle', done: 0, total: 0 })
    return { translated: 0, skipped: storyboards.length, results: [] as Array<Record<string, unknown>> }
  }

  setEpisodeFluxTranslateProgress(episodeId, {
    status: 'running',
    done: 0,
    total: targets.length,
    current_storyboard_id: undefined,
    error: undefined,
  })

  const visualStyle = await resolveStoryboardVisualStyle(targets[0].id, episodeId)
  const results: Array<Record<string, unknown>> = []
  const failed: Array<{ storyboard_id: number; storyboard_number: number; error: string; reasons?: string[] }> = []
  let processed = 0

  const translateOne = async (sb: typeof targets[number]) => {
    const chinese = resolveStoryboardChinesePrompt(sb)
    logTaskProgress('FluxTranslate', 'shot', {
      storyboardId: sb.id,
      index: processed + 1,
      total: targets.length,
      preview: chinese.slice(0, 80),
    })
    setEpisodeFluxTranslateProgress(episodeId, {
      current_storyboard_id: sb.id,
      done: results.length,
    })
    try {
      const english = await translateNarrationPromptToFluxEnglish(chinese, visualStyle, {
        holdOllama: FLUX_TRANSLATE_PROVIDER === 'llm',
      })
      const assess = assessFluxEnglishPromptAccuracy(english, chinese)
      if (!assess.ok) {
        failed.push({
          storyboard_id: sb.id,
          storyboard_number: sb.storyboardNumber,
          error: `英文未通过准确性检查：${assess.reasons.join(', ')}`,
          reasons: assess.reasons,
        })
        return
      }
      const referenceImages = mergeStoryboardFluxPromptMeta(sb.referenceImages, english)
      const ts = now()
      db.update(schema.storyboards)
        .set({ referenceImages, updatedAt: ts })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
      results.push({
        storyboard_id: sb.id,
        flux_prompt_en: english,
        flux_prompt_en_at: ts,
        reference_images: referenceImages,
        accuracy_ok: true,
      })
    } catch (err) {
      failed.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        error: (err as Error).message || String(err),
      })
    } finally {
      processed++
      setEpisodeFluxTranslateProgress(episodeId, { done: results.length })
    }
  }

  try {
    if (FLUX_TRANSLATE_PROVIDER === 'llm') {
      await withFluxTranslateOllamaSession(async () => {
        for (const sb of targets) {
          await translateOne(sb)
        }
      })
    } else {
      for (const sb of targets) {
        await translateOne(sb)
      }
    }
  } catch (err) {
    setEpisodeFluxTranslateProgress(episodeId, {
      status: 'error',
      error: (err as Error).message,
      done: results.length,
    })
    throw err
  }

  const allFailed = results.length === 0 && failed.length > 0
  setEpisodeFluxTranslateProgress(episodeId, {
    status: allFailed ? 'error' : 'done',
    done: results.length,
    total: targets.length,
    current_storyboard_id: undefined,
    error: failed.length
      ? `${failed.length} 段未通过准确性检查（已跳过，可补译）: #${failed.slice(0, 5).map(f => f.storyboard_number).join(', #')}`
      : undefined,
  })

  logTaskSuccess('FluxTranslate', 'episode', {
    episodeId,
    translated: results.length,
    failed: failed.length,
    provider: FLUX_TRANSLATE_PROVIDER,
  })

  return {
    translated: results.length,
    failed: failed.length,
    skipped: storyboards.length - targets.length,
    failed_details: failed,
    results,
  }
}

/** 清除本集全部 Flux 英文 prompt（保留中文 image_prompt） */
export function clearEpisodeFluxPrompts(episodeId: number) {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  ).filter(sb => isNarrationStoryboard(sb))

  logTaskStart('FluxTranslate', 'clear-episode', { episodeId, storyboardCount: storyboards.length })
  const ts = now()
  let cleared = 0

  for (const sb of storyboards) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    if (!meta.flux_prompt_en && !meta.flux_prompt_en_at) continue
    const referenceImages = clearStoryboardFluxPromptMeta(sb.referenceImages)
    if (!referenceImages) continue
    db.update(schema.storyboards)
      .set({ referenceImages, updatedAt: ts })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    cleared++
  }

  logTaskSuccess('FluxTranslate', 'clear-episode', { episodeId, cleared })
  return { cleared }
}
