import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { resolveImageGenerationConfig } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveBase64Image, upscaleImageToTargetSize } from '../utils/storage.js'
import { getImageAdapter } from './adapters/registry'
import { isAgnesImageModel } from './adapters/agnes-image.js'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { generateComfyPortraitComposite, finalizePortraitWhiteBackground } from './comfy-portrait-composite.js'
import {
  getEpisodeVisualCharacters,
  resolveCharacterIdForPortraitLabel,
  resolveCharacterIdForPortraitRef,
  extractAllPortraitLabelsFromPrompt,
  resolveCharacterPortraitReferencePath,
} from './narration-characters.js'
import { isBrokenFluxEnglishPrompt, FLUX_PROMPT_EN_VERSION } from './flux-prompt-translate.js'
import { normalizeArtStyle, resolveEpisodeVisualStyle, compileNarrationImageGenerationBundle, isNarrationStructuredStyle } from '../constants/art-styles.js'
import {
  PORTRAIT_EYE_COLOR_POSITIVE_CN,
  PORTRAIT_EYE_COLOR_NEGATIVE_CN,
  PORTRAIT_NEUTRAL_FACE_CN,
  PORTRAIT_EXPRESSION_NEGATIVE_CN,
  QWEN_PORTRAIT_QUALITY_NEGATIVE_CN,
  sanitizePortraitEyeColorText,
  sanitizePortraitExpressionText,
} from '../constants/portrait-reference.js'
import { DEFAULT_LOCAL_IMAGE_MODEL } from '../constants/image-models.js'
import {
  copyComfyImageOutput,
  injectSdxlWorkflow,
  injectSdxlUpscaleWorkflow,
  injectFluxWorkflow,
  injectFluxReduxWorkflow,
  injectFluxPulidWorkflow,
  loadWorkflowTemplate,
  parseSize,
  queueComfyPrompt,
  COMFY_MINIMAL_NEGATIVE,
  COMFY_FLUX_GENERATION_STEPS,
  resolveComfyFluxGenerationSize,
  resolveComfyFluxPortraitGenerationSize,
  resolveComfyQwenGenerationSize,
  resolveComfyCheckpoint,
  resolveComfyPortraitCheckpoint,
  toComfyGridPrompt,
  clampComfyGridSize,
  clampComfyImageSize,
  clampComfyStoryboardSize,
  isFluxImageModel,
  isFluxReduxReady,
  isFluxPulidReady,
  isFluxPulidReadyInComfy,
  resolveFluxPulidModelNameInComfy,
  isKolorsImageModel,
  injectKolorsWorkflow,
  resolveKolorsChinesePrompt,
  isMirrorSceneChinese,
  isQwenGuidedCompositionChinese,
  enrichQwenPortraitRefStoryboardChinese,
  buildQwenDualPortraitSecondPassChinese,
  QWEN_MIRROR_NEGATIVE_CN,
  QWEN_REF_DUPLICATE_NEGATIVE_CN,
  QWEN_STANDING_CROP_NEGATIVE_CN,
  QWEN_SCREEN_DEVICE_NEGATIVE_CN,
  QWEN_HANDHELD_NEGATIVE_CN,
  isHandheldSceneChinese,
  isQwenImageEditModel,
  isQwenImageEditReady,
  injectQwenImageEditWorkflow,
  resolveQwenEditUnetName,
  uploadImageToComfyInput,
  prepareQwenEditStoryboardReferenceImage,
  prepareQwenEditCanvasImage,
  prepareQwenEditFaceIdentityImage,
  isSdxlInstantIdImageModel,
  isInstantIdReady,
  isInstantIdComfyCatalogReady,
  resolveInstantIdComfyFileNames,
  injectSdxlInstantIdWorkflow,
  prepareInstantIdReferenceImage,
  toSdxlInstantIdStoryboardPrompt,
  parseComfyReferenceImagePaths,
  prepareFluxReduxReferenceImage,
  prepareFluxPulidReferenceImage,
  finalizeFluxStoryboardPositivePrompt,
  augmentFluxPulidStoryboardPositive,
  COMFY_FLUX_PULID_STORYBOARD_NEGATIVE,
  resolveFluxPulidStoryboardNegative,
  toComfyFluxPortraitPrompt,
  resolvePortraitGender,
  rebalanceFluxPromptForProtagonistGender,
  rebalanceFluxPromptForFemaleAge,
  waitForComfyPrompt,
  waitForComfyServer,
} from './comfyui-client.js'
import { ensureLocalModelStage, ensureComfyWorkflowFamily, freeComfyUIMemory } from './local-model-manager.js'
import { runComfyImageTask } from './comfy-image-queue.js'
import { runAgnesImageTask } from './agnes-image-queue.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { parseNarrationImageMeta } from './narration-image.js'
import {
  alignPortraitLabelsInImagePromptCn,
  buildPortraitAppearanceSpecFromCharacter,
  enrichKolorsPortraitIdentityChinese,
  enforceSingleCharacterFrameInImagePromptCn,
  injectPortraitSpecIntoFluxEnglish,
} from '../constants/portrait-appearance-spec.js'
import { isMotionComicCameraMetaDescription, isMotionComicStyle } from '../constants/motion-comic.js'
import { deleteUniqueStaticFiles, imagePathsToDelete } from './storyboard-asset-replace.js'

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  prompt: string
  negativePrompt?: string
  model?: string
  size?: string
  style?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

function replaceCharacterPortraitImage(characterId: number, localPath: string) {
  const prev = db.select().from(schema.characters)
    .where(eq(schema.characters.id, characterId)).all()[0]
  const oldPath = String(prev?.imageUrl || '').trim()
  db.update(schema.characters)
    .set({ imageUrl: localPath, updatedAt: now() })
    .where(eq(schema.characters.id, characterId))
    .run()
  if (oldPath && oldPath !== localPath) {
    try {
      deleteUniqueStaticFiles(imagePathsToDelete(oldPath))
    } catch { /* ignore */ }
  }
}

function resolveEpisodeIdForImageRecord(record: typeof schema.imageGenerations.$inferSelect): number | null {
  if (record.storyboardId) {
    const sb = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
    if (sb?.episodeId) return sb.episodeId
  }
  if (record.sceneId) {
    const link = db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.sceneId, record.sceneId)).all()[0]
    if (link?.episodeId) return link.episodeId
  }
  if (record.characterId) {
    const link = db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.characterId, record.characterId)).all()[0]
    if (link?.episodeId) return link.episodeId
  }
  return null
}

function resolveCharacterLabelForPortrait(characterId: number | null | undefined): string | null {
  if (!characterId) return null
  const ch = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()[0]
  if (!ch) return null
  const variant = ch.variantLabel?.trim()
  return [ch.name?.trim(), variant].filter(Boolean).join('·') || null
}

function resolveCharacterRoleForPortrait(characterId: number | null | undefined): string | null {
  if (!characterId) return null
  const ch = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()[0]
  return ch?.role?.trim() || null
}

function resolveVisualStyleForComfyRecord(record: typeof schema.imageGenerations.$inferSelect): string {
  if (record.style) return normalizeArtStyle(record.style)
  const episodeId = resolveEpisodeIdForImageRecord(record)
  const drama = record.dramaId
    ? db.select().from(schema.dramas).where(eq(schema.dramas.id, record.dramaId)).all()[0]
    : undefined
  if (episodeId) {
    return resolveEpisodeVisualStyle(episodeId, { dramaStyle: drama?.style })
  }
  return normalizeArtStyle(drama?.style)
}

function resolveFluxPortraitReferencePath(
  record: typeof schema.imageGenerations.$inferSelect,
): string | null {
  const fromRecord = parseComfyReferenceImagePaths(record.referenceImages)
  if (fromRecord[0]) return fromRecord[0]
  if (!record.characterId) return null
  const ch = db.select().from(schema.characters)
    .where(eq(schema.characters.id, record.characterId)).all()[0]
  return ch ? resolveCharacterPortraitReferencePath(ch) : null
}

function resolveFluxStoryboardReferencePath(
  record: typeof schema.imageGenerations.$inferSelect,
): string | null {
  return resolveStoryboardPortraitReferencePaths(record)[0]?.path || null
}

/**
 * 分镜定妆参考：文案「对照定妆」优先；可跨出本镜绑定从本集定妆取图。
 * 多人镜按文案标签顺序取齐全部可解析定妆；双人第二遍换脸仍可用 [1]。
 * 注意：许多多人镜只绑定一人，绝不能因 link_cnt=1 提前 return。
 */
function resolveStoryboardPortraitReferencePaths(
  record: typeof schema.imageGenerations.$inferSelect,
): Array<{ name: string; path: string }> {
  const prompt = resolveStoryboardChinesePromptForRecord(record)
  const fromRecord = parseComfyReferenceImagePaths(record.referenceImages)
  // 对齐后若被压成单人，回退用分镜原文标签（防止多定妆丢失）
  let labels = extractAllPortraitLabelsFromPrompt(prompt)
  if (labels.length < 2 && record.storyboardId) {
    const sb = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
    const rawLabels = extractAllPortraitLabelsFromPrompt(String(sb?.imagePrompt || ''))
    if (rawLabels.length > labels.length) labels = rawLabels
  }

  type Linked = { id: number; name: string; path: string | null }
  const linkedChars: Linked[] = []
  let episodeCharacters: ReturnType<typeof getEpisodeVisualCharacters> = []

  if (record.storyboardId) {
    const sb = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
    const ep = sb ? db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, sb.episodeId)).all()[0] : undefined
    if (sb && ep) {
      episodeCharacters = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
    }
    const links = db.select().from(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, record.storyboardId)).all()
    for (const link of links) {
      const ch = episodeCharacters.find(c => c.id === link.characterId)
        || db.select().from(schema.characters).where(eq(schema.characters.id, link.characterId)).all()[0]
      if (!ch) continue
      linkedChars.push({
        id: ch.id,
        name: String(ch.name || '').trim(),
        path: resolveCharacterPortraitReferencePath(ch),
      })
    }
  }

  const linkedWithPortrait = linkedChars.filter((c): c is Linked & { path: string } => !!c.path)
  const out: Array<{ name: string; path: string }> = []
  const usedIds = new Set<number>()
  const usedPaths = new Set<string>()

  const push = (name: string, path: string, id?: number) => {
    if (!path || usedPaths.has(path)) return
    if (id != null && usedIds.has(id)) return
    usedPaths.add(path)
    if (id != null) usedIds.add(id)
    out.push({ name: name || '角色', path })
  }

  /** 同名多条时优先有定妆图的 */
  const resolveLabelPath = (label: { name: string; stage: string; label: string }) => {
    const sameName = episodeCharacters.filter(c => c.name.trim() === label.name)
    const withPortrait = sameName.filter(c => !!resolveCharacterPortraitReferencePath(c))
    const pool = withPortrait.length ? withPortrait : (sameName.length ? sameName : episodeCharacters)
    const charId = resolveCharacterIdForPortraitRef(label, pool, prompt)
    if (!charId) return null
    const fromEpisode = episodeCharacters.find(c => c.id === charId)
    const fromLinked = linkedChars.find(c => c.id === charId)
    const path = (fromEpisode ? resolveCharacterPortraitReferencePath(fromEpisode) : null)
      || fromLinked?.path
      || null
    if (!path) return null
    return { id: charId, name: label.label || label.name, path }
  }

  const targetCount = Math.max(labels.length, 1)

  // 文案有 ≥2 个对照定妆：必须按标签取齐（可超出本镜绑定）
  if (labels.length >= 2) {
    for (const label of labels) {
      const hit = resolveLabelPath(label)
      if (hit) push(hit.name, hit.path, hit.id)
    }
    // 标签解析失败时再用绑定补齐
    for (const c of linkedWithPortrait) {
      if (out.length >= targetCount) break
      push(c.name, c.path, c.id)
    }
    if (out.length >= 2) return out
  }

  // 单标签 / 无标签：单人绑定可直接用；否则标签 → 绑定 → record.ref
  if (labels.length <= 1 && linkedWithPortrait.length === 1) {
    push(linkedWithPortrait[0].name, linkedWithPortrait[0].path, linkedWithPortrait[0].id)
    return out
  }

  for (const label of labels) {
    const hit = resolveLabelPath(label)
    if (hit) push(hit.name, hit.path, hit.id)
  }
  for (const c of linkedWithPortrait) {
    if (out.length >= Math.max(targetCount, 2)) break
    push(c.name, c.path, c.id)
  }
  if (!out.length && fromRecord[0]) {
    push('参考', fromRecord[0])
  }

  return out
}

function resolveStoryboardChinesePromptForRecord(
  record: typeof schema.imageGenerations.$inferSelect,
): string {
  if (!record.storyboardId) return String(record.prompt || '').trim()
  const sb = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
  const raw = String(sb?.imagePrompt || record.prompt || '').trim()
  if (!sb || !raw || !/对照定妆「/.test(raw)) return raw

  const ep = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, sb.episodeId)).all()[0]
  if (!ep) return raw

  const characters = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
  const linkedNames: string[] = []
  const links = db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, sb.id)).all()
  for (const link of links) {
    const ch = characters.find(c => c.id === link.characterId)
    const name = String(ch?.name || '').trim()
    if (name) linkedNames.push(name)
  }

  const desc = String(sb.description || '').trim()
  const narrationLines = desc && !isMotionComicCameraMetaDescription(desc) ? [desc] : []
  const allowDual = isMotionComicStyle(ep.style)

  const aligned = alignPortraitLabelsInImagePromptCn(raw, characters, {
    dialogue: sb.dialogue,
    narrationLines,
    fallbackNames: linkedNames,
    allowDualPortrait: allowDual,
  })
  const labels = extractAllPortraitLabelsFromPrompt(aligned)
  if (allowDual && labels.length >= 2) return aligned
  const keep = labels[0]?.name
    || linkedNames[0]
    || extractAllPortraitLabelsFromPrompt(raw)[0]?.name
  if (!keep) return aligned
  return enforceSingleCharacterFrameInImagePromptCn(aligned, keep, characters)
}

/**
 * 优先使用分镜 meta 中预翻译的 flux_prompt_en。
 * 生图阶段不再现场拉 Ollama 翻译（会抢 ComfyUI 显存）；缺英文时直接报错，请先「翻译英文」。
 */
async function resolveFluxPositivePrompt(
  record: typeof schema.imageGenerations.$inferSelect,
  rawPrompt: string,
  _visualStyle?: string | null,
): Promise<string> {
  const chineseSource = resolveStoryboardChinesePromptForRecord(record) || rawPrompt
  if (record.storyboardId) {
    const sb = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
    if (sb?.referenceImages) {
      const meta = parseNarrationImageMeta(sb.referenceImages)
      const stored = String(meta.flux_prompt_en || '').trim()
      const version = Number(meta.flux_prompt_en_version || 0)
      if (stored && version >= FLUX_PROMPT_EN_VERSION && !isBrokenFluxEnglishPrompt(stored, chineseSource)) {
        return finalizeFluxStoryboardPositivePrompt(stored, chineseSource)
      }
      if (stored && !isBrokenFluxEnglishPrompt(stored, chineseSource)) {
        // 版本略旧但仍可用：不触发 LLM，避免生图时抢显存
        return finalizeFluxStoryboardPositivePrompt(stored, chineseSource)
      }
    }
    if (/[\u4e00-\u9fff]/.test(chineseSource)) {
      throw new Error('该镜头缺少可用的 Flux 英文配图文案。请先点「翻译英文」，再生图（生图阶段不会自动加载 LLM）')
    }
  }
  // 非分镜或已是英文：直接用
  if (!/[\u4e00-\u9fff]/.test(String(rawPrompt || '').trim())) {
    return finalizeFluxStoryboardPositivePrompt(String(rawPrompt || '').trim(), chineseSource)
  }
  throw new Error('Flux/InstantID 需要英文 prompt。请先翻译配图文案，再生图（生图阶段不会自动加载 LLM）')
}

function comfyImageTargetKey(record: Pick<typeof schema.imageGenerations.$inferSelect, 'storyboardId' | 'characterId' | 'sceneId' | 'frameType'>): string {
  return `${record.storyboardId || 0}:${record.characterId || 0}:${record.sceneId || 0}:${record.frameType || ''}`
}

function persistComfyTaskId(id: number, promptId: string) {
  db.update(schema.imageGenerations)
    .set({ taskId: promptId, updatedAt: now() })
    .where(eq(schema.imageGenerations.id, id))
    .run()
}

/** 同一目标重复提交时，取消仍在 processing 的旧 Comfy 任务 */
function cancelStaleComfyImageTasks(newId: number, params: GenerateImageParams) {
  const targetKey = comfyImageTargetKey({
    storyboardId: params.storyboardId ?? null,
    characterId: params.characterId ?? null,
    sceneId: params.sceneId ?? null,
    frameType: params.frameType ?? null,
  })
  const stale = db.select().from(schema.imageGenerations).all()
    .filter(row =>
      row.id !== newId
      && row.status === 'processing'
      && row.provider?.toLowerCase() === 'comfyui'
      && comfyImageTargetKey(row) === targetKey,
    )
  for (const row of stale) {
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: '已被新任务取代', updatedAt: now() })
      .where(eq(schema.imageGenerations.id, row.id))
      .run()
    logTaskWarn('ImageTask', 'cancel-stale', { id: row.id, replacedBy: newId, target: targetKey })
  }
}

async function resumeComfyImageTask(id: number, promptId: string) {
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]
  if (!record || record.status !== 'processing') return

  logTaskStart('ImageTask', 'resume-comfy', { id, promptId })
  const outputs = await waitForComfyPrompt(promptId)
  let localPath = copyComfyImageOutput(outputs, 'images')

  const isGrid = String(record.frameType || '').startsWith('grid_')
  const isStoryboard = !!record.storyboardId && !isGrid
  if (isStoryboard && LOCAL_COMIC_ENV.upscaleStoryboardTo1080p) {
    await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, { fit: 'contain' })
  }
  await handleImageCompleteLocal(id, localPath)
}

/** 后端重启后恢复卡在 processing 的 ComfyUI 配图任务 */
export function resumeStuckComfyImageGenerations(): number {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000
  const rows = db.select().from(schema.imageGenerations).all()
    .filter(row => {
      if (row.status !== 'processing' || row.provider?.toLowerCase() !== 'comfyui') return false
      const ts = Date.parse(String(row.updatedAt || row.createdAt || ''))
      return !Number.isFinite(ts) || ts >= cutoffMs
    })

  const byTarget = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = comfyImageTargetKey(row)
    const list = byTarget.get(key) || []
    list.push(row)
    byTarget.set(key, list)
  }

  const toResume: typeof rows = []
  for (const group of byTarget.values()) {
    group.sort((a, b) => b.id - a.id)
    const [newest, ...older] = group
    for (const stale of older) {
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: '已被新任务取代（后端重启）', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, stale.id))
        .run()
    }
    toResume.push(newest)
  }

  if (!toResume.length) return 0
  logTaskStart('ImageTask', 'resume-pending', { count: toResume.length })

  void (async () => {
    for (const newest of toResume.sort((a, b) => a.id - b.id)) {
      try {
        if (newest.taskId) {
          await resumeComfyImageTask(newest.id, newest.taskId)
        } else {
          const config = resolveImageGenerationConfig({ model: newest.model || undefined })
          await processComfyUIImageGeneration(newest.id, config)
        }
      } catch (err: any) {
        logTaskError('ImageTask', 'resume-failed', { id: newest.id, taskId: newest.taskId, error: err.message })
        db.update(schema.imageGenerations)
          .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
          .where(eq(schema.imageGenerations.id, newest.id))
          .run()
      }
    }
  })()

  return toResume.length
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const ts = now()
  const config = resolveImageGenerationConfig({
    configId: params.configId,
    model: params.model,
  })

  const res = db.insert(schema.imageGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    prompt: params.prompt,
    negativePrompt: params.negativePrompt ?? null,
    model: params.model || config.model,
    style: params.style ? normalizeArtStyle(params.style) : null,
    provider: config.provider,
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  cancelStaleComfyImageTasks(lastId, params)
  logTaskStart('ImageTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id: lastId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })
  processImageGeneration(lastId, config).catch(err => {
    logTaskError('ImageTask', 'process', { id: lastId, error: err.message })
    console.error(`Image generation ${lastId} failed:`, err)
  })
  return lastId
}

function formatFetchError(err: unknown): string {
  const e = err as any
  const cause = e?.cause
  const code = String(cause?.code || e?.code || '').trim()
  const detail = String(cause?.message || e?.message || err || 'fetch failed').trim()
  if (code && !detail.includes(code)) return `${detail} (${code})`
  return detail
}

function isTransientNetworkError(err: unknown): boolean {
  const e = err as any
  const msg = `${e?.message || ''} ${e?.cause?.message || ''} ${e?.cause?.code || ''} ${e?.code || ''}`.toLowerCase()
  return /fetch failed|econnreset|etimedout|econnrefused|enotfound|socket|tls|handshake|network|und_err|aborted|eai_again/.test(msg)
}

async function fetchWithNetworkRetry(
  url: string,
  init: RequestInit,
  opts?: { retries?: number; label?: string; id?: number },
): Promise<Response> {
  const retries = Math.max(1, opts?.retries ?? 3)
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      lastErr = err
      if (attempt >= retries || !isTransientNetworkError(err)) throw err
      const waitMs = 700 * attempt * (attempt >= 3 ? 2 : 1)
      logTaskWarn('ImageTask', 'network-retry', {
        id: opts?.id,
        label: opts?.label,
        attempt,
        waitMs,
        error: formatFetchError(err),
      })
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  throw lastErr
}

async function processImageGeneration(id: number, config: AIConfig) {
  if (config.provider.toLowerCase() === 'comfyui') {
    await runComfyImageTask(`image-${id}`, () => processComfyUIImageGeneration(id, config))
    return
  }

  const useAgnesQueue = config.provider.toLowerCase() === 'agnes'
    || isAgnesImageModel(config.model)
  if (useAgnesQueue) {
    await runAgnesImageTask(`image-${id}`, () => processCloudImageGeneration(id, config))
    return
  }

  await processCloudImageGeneration(id, config)
}

async function processCloudImageGeneration(id: number, config: AIConfig) {
  const adapter = getImageAdapter(config.provider)

  try {
    const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return
    logTaskProgress('ImageTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
    })

    const useAgnesDarkRefs = config.provider === 'agnes' || isAgnesImageModel(record.model || config.model)
    const resolvedReferenceImages = await normalizeReferenceImages(record.referenceImages, {
      agnesDarkBg: useAgnesDarkRefs,
    })
    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      size: record.size,
      frameType: record.frameType,
      referenceImages: resolvedReferenceImages ? JSON.stringify(resolvedReferenceImages) : null,
    })
    logTaskProgress('ImageTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })
    logTaskPayload('ImageTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    const resp = await fetchWithNetworkRetry(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    }, { id, label: 'generate', retries: useAgnesDarkRefs ? 5 : 3 })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any
    logTaskPayload('ImageTask', 'response payload', {
      id,
      provider: config.provider,
      result,
    })

    const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && imageUrl) {
      logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl })
      await handleImageComplete(id, config.provider, imageUrl)
      return
    }

    if (!isAsync && !imageUrl) {
      const b64 = adapter.extractImageBase64(result)
      if (b64) {
        logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: b64.mimeType })
        await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
        return
      }
      throw new Error('No image URL or base64 data in response')
    }

    db.update(schema.imageGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
    logTaskProgress('ImageTask', 'poll-start', { id, taskId, provider: config.provider })
    pollImageTask(id, config, taskId!)
  } catch (err: any) {
    const errorMsg = formatFetchError(err)
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: errorMsg })
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
  }
}

async function processComfyUIImageGeneration(id: number, config: AIConfig) {
  try {
    const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return

    await ensureLocalModelStage('image')
    const online = await waitForComfyServer()
    if (!online) throw new Error('ComfyUI 未启动，请先运行 start-comfyui-wan.ps1')

    const parsed = parseSize(record.size)
    let width = parsed.width
    let height = parsed.height
    const isPortrait = !!record.characterId
      || (!record.sceneId && !record.storyboardId && /定妆|turnaround|三视图|character design sheet/i.test(String(record.prompt || '')))
    const isScene = !!record.sceneId && !record.storyboardId
    const isGrid = String(record.frameType || '').startsWith('grid_')
    const isStoryboard = !!record.storyboardId && !isGrid && !isPortrait

    const workflowName = String(record.model || config.model || DEFAULT_LOCAL_IMAGE_MODEL).split(',')[0].trim() || DEFAULT_LOCAL_IMAGE_MODEL
    const useKolors = isKolorsImageModel(workflowName)
    const useQwen = isQwenImageEditModel(workflowName)
    const useInstantId = isSdxlInstantIdImageModel(workflowName)
    const useFlux = isFluxImageModel(workflowName) && !useKolors && !useInstantId && !useQwen
    const visualStyle = resolveVisualStyleForComfyRecord(record)

    await ensureComfyWorkflowFamily(
      useQwen ? 'qwen' : useKolors ? 'kolors' : useFlux ? 'flux' : 'sdxl',
    )

    // 本地 Comfy：使用入库 prompt；解说分镜 SDXL 走完整场景编译 + 负向词（Flux/Kolors/Qwen/InstantID 保留六维结构）
    let positive = String(record.prompt || '').trim()
    let negative: string | undefined = String(record.negativePrompt || '').trim() || COMFY_MINIMAL_NEGATIVE
    if (!useFlux && !useKolors && !useQwen && !useInstantId && (isStoryboard || isScene) && isNarrationStructuredStyle(visualStyle)) {
      const compiled = compileNarrationImageGenerationBundle(positive, visualStyle)
      if (compiled.prompt) positive = compiled.prompt
      if (compiled.negativePrompt) negative = compiled.negativePrompt
    }
    let portraitCompositeInput: {
      pagePrompt: string
      checkpoint: string
      characterName?: string | null
      characterRole?: string | null
      visualStyle?: string | null
    } | null = null

    const kind = isGrid ? 'grid' : isPortrait ? 'portrait-front' : isStoryboard ? 'storyboard' : isScene ? 'scene' : 'generic'

    if (isGrid) {
      positive = toComfyGridPrompt(positive, visualStyle)
      const clamped = clampComfyGridSize(width, height)
      width = clamped.width
      height = clamped.height
    } else if (isPortrait) {
      portraitCompositeInput = {
        pagePrompt: positive,
        checkpoint: resolveComfyPortraitCheckpoint(visualStyle),
        characterName: resolveCharacterLabelForPortrait(record.characterId),
        characterRole: resolveCharacterRoleForPortrait(record.characterId),
        visualStyle,
      }
      if (useFlux) {
        positive = toComfyFluxPortraitPrompt(
          positive,
          portraitCompositeInput.characterName,
          visualStyle,
          portraitCompositeInput.characterRole,
        )
        negative = ''
      }
      // Qwen 定妆：竖幅 768×1344 原生满构图（人宽、左右窄白边）；收尾只清白底，禁止垫成 16:9
      const portraitSize = useFlux
        ? resolveComfyFluxPortraitGenerationSize()
        : useQwen
          ? clampComfyImageSize(768, 1344, 1344)
          : clampComfyImageSize(896, 1536, 1536)
      width = portraitSize.width
      height = portraitSize.height
    } else if (isStoryboard) {
      const clampedSb = resolveComfyFluxGenerationSize()
      width = clampedSb.width
      height = clampedSb.height
    } else if (isScene || /[\u4e00-\u9fff]/.test(positive)) {
      const clamped = clampComfyImageSize(width, height)
      width = clamped.width
      height = clamped.height
    }

    if (useFlux) negative = ''
    if (useKolors) {
      negative = '低质量，模糊，文字，水印，畸形，多余肢体，低分辨率'
    }
    if (useQwen) negative = ''
    if (useFlux && (isStoryboard || isScene)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      positive = await resolveFluxPositivePrompt(record, positive, visualStyle)
      positive = finalizeFluxStoryboardPositivePrompt(positive, isStoryboard ? chineseSource : undefined)
      if (isStoryboard) {
        const gender = resolvePortraitGender(chineseSource)
        const pulidLikely = LOCAL_COMIC_ENV.fluxStoryboardUsePulid
          && !!resolveFluxStoryboardReferencePath(record)
          && isFluxPulidReady()
        if (!LOCAL_COMIC_ENV.fluxStoryboardUseRedux) {
          positive = rebalanceFluxPromptForProtagonistGender(positive, gender, chineseSource)
          positive = rebalanceFluxPromptForFemaleAge(positive, gender, chineseSource)
        }
        if (record.storyboardId) {
          const sb = db.select().from(schema.storyboards)
            .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
          const ep = sb ? db.select().from(schema.episodes)
            .where(eq(schema.episodes.id, sb.episodeId)).all()[0] : undefined
          if (sb && ep) {
            const characters = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
            const portraitCharId = resolveCharacterIdForPortraitLabel(chineseSource, characters)
            if (portraitCharId) {
              const ch = characters.find(c => c.id === portraitCharId)
              // PuLID 锁脸仍保留 Subjects 身份锚点（脸型/发型），避免弱锁脸时角色跑偏
              if (ch?.appearance?.trim()) {
                const spec = buildPortraitAppearanceSpecFromCharacter(ch, visualStyle)
                positive = injectPortraitSpecIntoFluxEnglish(positive, spec, gender)
              }
            }
          }
        }
      }
      negative = ''
    }
    if (useKolors && (isStoryboard || isScene)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      // 场景底图：保留无人环境文案，勿走站立全身/手持等分镜增强（易把环境改成人物构图）
      positive = isScene
        ? String(chineseSource || positive).trim().slice(0, 1800)
        : resolveKolorsChinesePrompt(chineseSource)
      if (record.storyboardId) {
        const sb = db.select().from(schema.storyboards)
          .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
        const ep = sb ? db.select().from(schema.episodes)
          .where(eq(schema.episodes.id, sb.episodeId)).all()[0] : undefined
        if (sb && ep) {
          const characters = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
          const portraitCharId = resolveCharacterIdForPortraitLabel(chineseSource, characters)
          const ch = portraitCharId
            ? characters.find(c => c.id === portraitCharId)
            : characters.find(c => c.imageUrl?.trim())
          if (ch?.appearance?.trim()) {
            const spec = buildPortraitAppearanceSpecFromCharacter(ch, visualStyle)
            positive = enrichKolorsPortraitIdentityChinese(positive, spec)
          }
        }
      }
    }
    if (useQwen && (isStoryboard || isScene || isPortrait)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      positive = resolveKolorsChinesePrompt(chineseSource)
      if (isPortrait) {
        positive = sanitizePortraitExpressionText(sanitizePortraitEyeColorText(positive))
        if (!/虹膜|眼白|natural dark iris|white sclera/i.test(positive)) {
          positive = `${positive}。${PORTRAIT_EYE_COLOR_POSITIVE_CN}`
        }
        if (!/面无表情|中性冷静|neutral face/i.test(positive)) {
          positive = `${positive}。${PORTRAIT_NEUTRAL_FACE_CN}`
        }
        negative = [
          negative,
          PORTRAIT_EYE_COLOR_NEGATIVE_CN,
          PORTRAIT_EXPRESSION_NEGATIVE_CN,
          QWEN_PORTRAIT_QUALITY_NEGATIVE_CN,
        ].filter(Boolean).join('，')
        // 定妆正向：竖幅半身占满（与男人/消防员一致），禁止垫成横屏大白边
        positive = positive
          .replace(/表情夸张/g, '面无表情')
          .replace(/漫画速度线可用/g, '干净线稿')
          .replace(/速度线|放射线|动作线/g, '')
          .replace(/正面全身标准站立|从头顶到脚完整入镜|双脚完整入镜|双脚与鞋子清晰可见/g, '正面半身标准站姿，头到胸口完整入镜')
          .replace(/16:9横屏纯白背景|16:9\s*横屏/g, '竖幅纯白背景')
          .replace(/人物横向尽量占满画面|人物占满画面主体/g, '人物占满画面')
          .replace(/人物宽度约占画面宽度55%～70%，高度约占75%～90%/g, '人物占满画面，左右只留窄白边')
        if (!/干净线稿|清晰轮廓|无重影/.test(positive)) {
          positive = `${positive}。干净清晰单线轮廓，无重影无叠影，五官左右对称，边缘干净无白边锯齿无抠图光晕`
        }
        if (!/竖幅|占满画面|窄白边/.test(positive)) {
          positive = `${positive}。硬性构图：竖幅纯白背景，正面半身标准站姿，头到胸口完整入镜，人物占满画面，左右只留窄白边；禁止横屏左右大片留白、中间竖条小人、全身小全身、仅面部大头照，禁止速度线与放射背景`
        } else if (!/禁止横屏|禁止两侧大片|窄白边/.test(positive)) {
          positive = `${positive}。左右只留窄白边，禁止横屏大片留白与中间竖条小人，禁止速度线`
        }
        // 压万能男模脸：避免同集定妆全员棱角方正+细长眼+深灰外套
        if (!/禁止万能男模|禁止与同集/.test(positive)) {
          positive = `${positive}。硬性辨识：严格按本角色独有脸型与发型绘制，禁止生成万能棱角方正脸细长眼深灰外套男模`
        }
        negative = [
          negative,
          '万能男模脸',
          '与同集角色撞脸',
          '棱角分明方正下颌万能脸',
          '细长眼深灰外套模板',
        ].filter(Boolean).join('，')
      }
      // 分镜有定妆参考时：防「无镜双人」+ 强制按本镜身穿换装（勿锁死定妆毛衣）
      if ((isStoryboard || isScene) && /对照定妆|定妆/.test(chineseSource + positive)) {
        positive = enrichQwenPortraitRefStoryboardChinese(positive)
          .replace(/表情夸张/g, '表情自然')
          // 速度线/气流线在 Edit 低步数下易糊边、融手，改为干净线稿
          .replace(/放射状速度线|漫画式气流线|速度线|动作线|气流扰动线/g, '')
          .replace(/周围环绕[^，。]{0,12}/g, '周围干净无特效线')
        if (!/干净线稿|清晰轮廓/.test(positive)) {
          positive = `${positive}。干净清晰单线轮廓，双手五指分明无融手`
        }
        negative = [
          negative,
          QWEN_REF_DUPLICATE_NEGATIVE_CN,
          '两人同框',
          '双人对话',
          '第二个人物',
          '对面另一人',
          '畸形手指',
          '融手',
          '糊手',
          '残缺手指',
          '多指',
          '少指',
          '重影轮廓',
          '速度线',
          '放射线',
          '身体扭曲',
          '肢体变形',
        ].filter(Boolean).join('，')
      }
      if (
        (isStoryboard || isScene)
        && /站立|站着|站在|站姿|行走|走进|走出|进门/.test(positive)
        && !/坐姿|坐在|侧卧|躺|趴/.test(positive)
      ) {
        negative = [negative, QWEN_STANDING_CROP_NEGATIVE_CN].filter(Boolean).join('，')
      }
      if (isMirrorSceneChinese(chineseSource) || isMirrorSceneChinese(positive)) {
        negative = [negative, QWEN_MIRROR_NEGATIVE_CN].filter(Boolean).join('，')
      }
      if (
        (isStoryboard || isScene)
        && /手机|电脑|笔记本|平板|显示器|屏幕|键盘|工位/i.test(chineseSource + positive)
      ) {
        negative = [negative, QWEN_SCREEN_DEVICE_NEGATIVE_CN].filter(Boolean).join('，')
      }
      if (
        (isStoryboard || isScene)
        && (isHandheldSceneChinese(chineseSource) || isHandheldSceneChinese(positive))
      ) {
        negative = [negative, QWEN_HANDHELD_NEGATIVE_CN].filter(Boolean).join('，')
      }
    }
    if (useInstantId && (isStoryboard || isScene)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      const english = await resolveFluxPositivePrompt(record, positive, visualStyle)
      positive = toSdxlInstantIdStoryboardPrompt(
        finalizeFluxStoryboardPositivePrompt(english, chineseSource),
        visualStyle,
      )
      negative = 'lowres, bad anatomy, bad hands, text, watermark, blurry, 3d, realistic, ugly, deformed face, white background'
    }

    logTaskProgress('ImageTask', 'comfyui-positive', {
      id,
      kind,
      style: visualStyle,
      width,
      height,
      positive: positive.slice(0, 400),
    })

    const genWidth = width
    const genHeight = height
    const wantUpscale1080 = isStoryboard && LOCAL_COMIC_ENV.upscaleStoryboardTo1080p
    let localPath: string

    if (isPortrait && portraitCompositeInput && !useFlux && !useKolors && !useQwen && !useInstantId) {
      await freeComfyUIMemory()
      localPath = await generateComfyPortraitComposite(portraitCompositeInput)
    } else if (useQwen) {
      if (!isQwenImageEditReady(workflowName)) {
        const want = (() => {
          try { return resolveQwenEditUnetName(workflowName) } catch { return 'qwen-image-edit-2511-Q3_K_M.gguf / Q4_K_M.gguf' }
        })()
        throw new Error(
          `Qwen-Image-Edit 权重未就绪：请将 ${want} 放到 ComfyUI/models/diffusion_models/，并确认 qwen_2.5_vl_7b_fp8_scaled + qwen_image_vae 已就位（不回退 fp8mixed）`,
        )
      }
      const storyboardRefs = isStoryboard
        ? resolveStoryboardPortraitReferencePaths(record)
        : []
      const dualLabels = extractAllPortraitLabelsFromPrompt(
        resolveStoryboardChinesePromptForRecord(record),
      )
      if (isStoryboard && dualLabels.length >= 2 && storyboardRefs.length < 2) {
        logTaskWarn('ImageTask', 'qwen-dual-refs-incomplete', {
          id,
          labels: dualLabels.map(l => l.label),
          resolved: storyboardRefs.map(r => ({ name: r.name, path: r.path })),
          hint: '文案有双对照定妆但只解析到一张参考；第二遍换脸将跳过',
        })
      }
      const storyboardRefRel = storyboardRefs[0]?.path || null
      const portraitRefRel = isPortrait ? resolveFluxPortraitReferencePath(record) : null
      // 场景背景禁止喂定妆参考：Edit 模型会改成人物半身像
      const refRel = isScene ? null : (storyboardRefRel || portraitRefRel)
      if (isStoryboard && !refRel) {
        logTaskWarn('ImageTask', 'qwen-edit-no-ref', {
          id,
          hint: '无角色定妆参考，Qwen-Image-Edit 将弱参考出图；建议先生成定妆',
        })
      }
      if (isScene) {
        logTaskProgress('ImageTask', 'scene-no-portrait-ref', {
          id,
          hint: '场景底图不使用角色定妆参考，避免出人物半身像',
        })
      }
      const qwenSize = isPortrait
        ? { width: genWidth, height: genHeight }
        : (isStoryboard || isScene)
          ? resolveComfyQwenGenerationSize(LOCAL_COMIC_ENV.qwenEditStoryboardMaxSide)
          : clampComfyImageSize(genWidth, genHeight, 896)
      // 分镜：竖幅定妆须裁脸+上半身再喂；禁止原图 center 裁 16:9（会裁到腰）
      const refFile = !refRel
        ? null
        : isStoryboard
          ? await prepareQwenEditStoryboardReferenceImage(refRel, qwenSize.width, qwenSize.height)
          : uploadImageToComfyInput(refRel)
      const qwenUnet = resolveQwenEditUnetName(workflowName)
      const qwenPrompt = loadWorkflowTemplate('qwen_image_edit')
      const chineseForGuided = [
        positive,
        resolveStoryboardChinesePromptForRecord(record),
      ].filter(Boolean).join('\n')
      const mirrorShot = !isPortrait && isMirrorSceneChinese(chineseForGuided)
      // 镜面/站立/坐卧/手持 → 关 Lightning；镜面单独加步
      // 定妆：禁止 Lightning 4 步（易重影/脸扭曲），强制引导采样
      const hardComposition = !isPortrait && isQwenGuidedCompositionChinese(chineseForGuided)
      const hasPortraitRef = !!refFile && isStoryboard
      const needGuidedCfg = isPortrait || hardComposition || hasPortraitRef
      const guidedSteps = isPortrait
        ? LOCAL_COMIC_ENV.qwenEditPortraitSteps
        : mirrorShot
          ? LOCAL_COMIC_ENV.qwenEditComplexSteps
          : hasPortraitRef
            ? LOCAL_COMIC_ENV.qwenEditPortraitRefSteps
            : LOCAL_COMIC_ENV.qwenEditGuidedSteps
      const guidedCfg = isPortrait
        ? LOCAL_COMIC_ENV.qwenEditPortraitCfg
        : LOCAL_COMIC_ENV.qwenEditGuidedCfg
      injectQwenImageEditWorkflow(qwenPrompt, {
        positive,
        negative: negative || '',
        width: qwenSize.width,
        height: qwenSize.height,
        // 定妆 txt2img：不喂参考图，避免 Edit 模型叠影
        referenceImage: isPortrait ? null : refFile,
        unetName: qwenUnet,
        ...(needGuidedCfg
          ? {
              lightningLora: null,
              steps: guidedSteps,
              cfg: guidedCfg,
              shift: LOCAL_COMIC_ENV.qwenEditShift,
            }
          : {}),
      })
      logTaskProgress('ImageTask', 'comfyui-queue', {
        id,
        workflow: 'qwen_image_edit',
        unet: qwenUnet,
        model: workflowName,
        style: visualStyle,
        kind,
        width: qwenSize.width,
        height: qwenSize.height,
        ref: refRel || null,
        dualRefs: storyboardRefs.map(r => r.name),
        hardComposition,
        mirror: mirrorShot,
        portraitRef: hasPortraitRef,
        guidedSteps: needGuidedCfg ? guidedSteps : LOCAL_COMIC_ENV.qwenEditSteps,
        lightning: !needGuidedCfg,
        positive: positive.slice(0, 400),
      })
      const promptId = await queueComfyPrompt(qwenPrompt)
      persistComfyTaskId(id, promptId)
      const outputs = await waitForComfyPrompt(promptId)
      localPath = copyComfyImageOutput(outputs, 'images')

      // 双定妆：整图保留 → 第二遍用第二人定妆局部换脸（比单次双 IP 稳）
      const dualSecond = storyboardRefs[1]
      if (
        (isStoryboard || isScene)
        && LOCAL_COMIC_ENV.qwenEditDualPortraitPass
        && dualSecond?.path
        && localPath
      ) {
        try {
          const canvasFile = await prepareQwenEditCanvasImage(
            localPath,
            qwenSize.width,
            qwenSize.height,
          )
          const face2File = await prepareQwenEditFaceIdentityImage(
            dualSecond.path,
            qwenSize.width,
            qwenSize.height,
          )
          const dualPositive = buildQwenDualPortraitSecondPassChinese({
            secondName: dualSecond.name,
            primaryName: storyboardRefs[0]?.name,
            sceneHint: positive,
          })
          const dualPrompt = loadWorkflowTemplate('qwen_image_edit')
          injectQwenImageEditWorkflow(dualPrompt, {
            positive: dualPositive,
            negative: [
              negative,
              '融化五官',
              '扭曲脸',
              '融手',
              '畸形手指',
              '重影',
              '双胞胎同脸',
              '大改构图',
              '重画全身',
              '白底定妆贴图',
            ].filter(Boolean).join('，'),
            width: qwenSize.width,
            height: qwenSize.height,
            referenceImage: canvasFile,
            referenceImage2: face2File,
            encodeLatentFromReference: true,
            denoise: LOCAL_COMIC_ENV.qwenEditDualPortraitPassDenoise,
            unetName: qwenUnet,
            lightningLora: null,
            steps: LOCAL_COMIC_ENV.qwenEditDualPortraitPassSteps,
            cfg: LOCAL_COMIC_ENV.qwenEditDualPortraitPassCfg,
            shift: LOCAL_COMIC_ENV.qwenEditShift,
          })
          logTaskProgress('ImageTask', 'comfyui-queue-dual-pass', {
            id,
            workflow: 'qwen_image_edit',
            primary: storyboardRefs[0]?.name || null,
            second: dualSecond.name,
            secondPath: dualSecond.path,
            denoise: LOCAL_COMIC_ENV.qwenEditDualPortraitPassDenoise,
            steps: LOCAL_COMIC_ENV.qwenEditDualPortraitPassSteps,
            positive: dualPositive.slice(0, 300),
          })
          console.log(
            `[ImageTask] dual-portrait-pass id=${id} ${storyboardRefs[0]?.name || '?'} → +${dualSecond.name} denoise=${LOCAL_COMIC_ENV.qwenEditDualPortraitPassDenoise}`,
          )
          const dualPromptId = await queueComfyPrompt(dualPrompt)
          persistComfyTaskId(id, dualPromptId)
          const dualOutputs = await waitForComfyPrompt(dualPromptId)
          localPath = copyComfyImageOutput(dualOutputs, 'images')
        } catch (dualErr: any) {
          logTaskWarn('ImageTask', 'qwen-dual-portrait-pass-failed', {
            id,
            second: dualSecond.name,
            error: dualErr?.message || String(dualErr),
            hint: '保留第一遍整图结果',
          })
        }
      }

      // 定妆：只清白底，保持竖幅原生尺寸（禁止 contain 垫 16:9）
      if (isPortrait) {
        localPath = await finalizePortraitWhiteBackground(localPath)
      } else if (wantUpscale1080) {
        // 分镜禁止 cover 裁腿；不足画幅时 letterbox
        await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, {
          fit: (isStoryboard || isScene) ? 'contain' : 'cover',
        })
      }
    } else if (useKolors) {
      // Kolors：纯文生图 + 外貌短句。img2img 弱参考易锁死白底半身/大头，已停用。
      const kolorsPrompt = loadWorkflowTemplate('kolors')
      injectKolorsWorkflow(kolorsPrompt, {
        positive,
        negative,
        width: genWidth,
        height: genHeight,
        steps: 25,
        cfg: 5,
      })
      logTaskProgress('ImageTask', 'comfyui-queue', {
        id,
        workflow: 'kolors',
        style: visualStyle,
        width: genWidth,
        height: genHeight,
        positive: positive.slice(0, 400),
      })
      const promptId = await queueComfyPrompt(kolorsPrompt)
      persistComfyTaskId(id, promptId)
      const outputs = await waitForComfyPrompt(promptId)
      localPath = copyComfyImageOutput(outputs, 'images')
      if (wantUpscale1080) {
        await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, { fit: (isStoryboard || isScene) ? 'contain' : 'cover' })
      }
    } else if (useFlux) {
      const storyboardRefRel = isStoryboard ? resolveFluxStoryboardReferencePath(record) : null
      const portraitRefRel = isPortrait ? resolveFluxPortraitReferencePath(record) : null
      const refRel = storyboardRefRel || portraitRefRel
      const pulidReady = isFluxPulidReady()
      const pulidComfyReady = pulidReady ? await isFluxPulidReadyInComfy() : false
      const canUsePulid = !!refRel
        && pulidReady
        && pulidComfyReady
        && (
          (LOCAL_COMIC_ENV.fluxStoryboardUsePulid && isStoryboard)
          || (LOCAL_COMIC_ENV.fluxPortraitUsePulid && isPortrait)
        )
      const canUseRedux = LOCAL_COMIC_ENV.fluxStoryboardUseRedux
        && isStoryboard
        && !!refRel
        && isFluxReduxReady()
        && !canUsePulid
      if (isStoryboard && !canUsePulid && !canUseRedux) {
        logTaskProgress('ImageTask', 'flux-txt2img-scene', {
          id,
          storyboardId: record.storyboardId,
          hint: pulidReady && !pulidComfyReady
            ? 'PuLID 权重已下载但 ComfyUI 未加载节点；请运行 scripts/setup-pulid-flux.ps1 并重启 ComfyUI'
            : '分镜 flux_dev_fp8 纯文本出场景；有定妆图且 PuLID 就绪时自动锁脸',
        })
      }
      if (LOCAL_COMIC_ENV.fluxStoryboardUsePulid && isStoryboard && refRel && !pulidReady) {
        logTaskWarn('ImageTask', 'flux-pulid-missing', {
          id,
          ref: refRel,
          hint: '请运行 scripts/setup-pulid-flux.ps1 下载 PuLID/EVA-CLIP/facexlib 并安装 ComfyUI_PuLID_Flux_ll',
        })
      }
      if (LOCAL_COMIC_ENV.fluxPortraitUsePulid && isPortrait && portraitRefRel && !pulidReady) {
        logTaskWarn('ImageTask', 'flux-portrait-pulid-missing', {
          id,
          ref: portraitRefRel,
          hint: '请运行 scripts/setup-pulid-flux.ps1；定妆参考图已就绪但 PuLID 未安装',
        })
      }
      if (LOCAL_COMIC_ENV.fluxPortraitUsePulid && isPortrait && !portraitRefRel) {
        logTaskProgress('ImageTask', 'flux-portrait-txt2img', {
          id,
          characterId: record.characterId,
          hint: '无参考定妆，纯文本出正面全身白底定妆',
        })
      }
      if (LOCAL_COMIC_ENV.fluxStoryboardUseRedux && isStoryboard && !refRel) {
        logTaskWarn('ImageTask', 'flux-redux-no-ref', {
          id,
          storyboardId: record.storyboardId,
          hint: '未找到定妆 image_url，Redux 跳过；请先生成/上传角色定妆',
        })
      }
      if (LOCAL_COMIC_ENV.fluxStoryboardUseRedux && (isStoryboard || isScene) && refRel && !isFluxReduxReady()) {
        logTaskWarn('ImageTask', 'flux-redux-missing', {
          id,
          ref: refRel,
          hint: '请运行 scripts/setup-flux-redux.ps1 下载 flux1-redux-dev 与 sigclip_vision_patch14_384',
        })
      }

      let workflowKey = 'flux_dev_fp8'
      let fluxPrompt = loadWorkflowTemplate(workflowKey)
      if (canUsePulid && refRel) {
        workflowKey = 'flux_dev_fp8_pulid'
        fluxPrompt = loadWorkflowTemplate(workflowKey)
        const pulidFaceOnly = isPortrait
          || (isStoryboard && LOCAL_COMIC_ENV.fluxPulidStoryboardFaceOnly)
        const pulidPositive = isStoryboard
          ? augmentFluxPulidStoryboardPositive(positive)
          : isPortrait
            ? `${positive}, same character identity as reference portrait, preserve face from reference while generating chest-up upper body on white background`
            : positive
        const refFile = await prepareFluxPulidReferenceImage(refRel, { faceOnly: pulidFaceOnly })
        const pulidModel = await resolveFluxPulidModelNameInComfy()
        injectFluxPulidWorkflow(fluxPrompt, {
          positive: pulidPositive,
          negative: isStoryboard ? resolveFluxPulidStoryboardNegative(pulidPositive) : negative,
          width: genWidth,
          height: genHeight,
          checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
          referenceImage: refFile,
          pulidModel: pulidModel || LOCAL_COMIC_ENV.fluxPulidModel,
          pulidWeight: isStoryboard ? LOCAL_COMIC_ENV.fluxPulidStoryboardWeight : LOCAL_COMIC_ENV.fluxPulidWeight,
          pulidStartAt: isStoryboard ? LOCAL_COMIC_ENV.fluxPulidStoryboardStartAt : LOCAL_COMIC_ENV.fluxPulidStartAt,
          pulidEndAt: isStoryboard ? LOCAL_COMIC_ENV.fluxPulidStoryboardEndAt : LOCAL_COMIC_ENV.fluxPulidEndAt,
          steps: COMFY_FLUX_GENERATION_STEPS,
          cfg: 1,
        })
        logTaskProgress('ImageTask', 'flux-pulid-ref', {
          id,
          ref: refRel,
          refFile,
          faceOnly: pulidFaceOnly,
          weight: isStoryboard ? LOCAL_COMIC_ENV.fluxPulidStoryboardWeight : LOCAL_COMIC_ENV.fluxPulidWeight,
          endAt: isStoryboard ? LOCAL_COMIC_ENV.fluxPulidStoryboardEndAt : LOCAL_COMIC_ENV.fluxPulidEndAt,
          positive: pulidPositive.slice(0, 320),
          hint: isPortrait
            ? 'PuLID 定妆跨阶段锁脸（参考图仅锁脸型）+ 白底正面全身 prompt'
            : 'PuLID 分镜弱锁脸(前32%步)+Action优先英文 prompt',
        })
      } else if (canUseRedux && refRel) {
        workflowKey = 'flux_dev_fp8_redux'
        fluxPrompt = loadWorkflowTemplate(workflowKey)
        const refFile = await prepareFluxReduxReferenceImage(refRel, { faceOnly: true })
        const reduxStrength = LOCAL_COMIC_ENV.fluxReduxStoryboardStrength
        injectFluxReduxWorkflow(fluxPrompt, {
          positive,
          negative,
          width: genWidth,
          height: genHeight,
          checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
          referenceImage: refFile,
          reduxStrength,
          reduxStrengthType: LOCAL_COMIC_ENV.fluxReduxStoryboardStrengthType,
          steps: COMFY_FLUX_GENERATION_STEPS,
          cfg: 1,
        })
        logTaskProgress('ImageTask', 'flux-redux-ref', {
          id,
          ref: refRel,
          refFile,
          strength: reduxStrength,
          strengthType: LOCAL_COMIC_ENV.fluxReduxStoryboardStrengthType,
          hint: 'Redux 弱锁脸（faceOnly + attn_bias）；场景/动作由 Flux 英文七维 txt2img 主导',
        })
      } else {
        injectFluxWorkflow(fluxPrompt, {
          positive,
          negative,
          width: genWidth,
          height: genHeight,
          checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
          steps: COMFY_FLUX_GENERATION_STEPS,
          cfg: 1,
        })
      }

      if (isPortrait) {
        logTaskProgress('ImageTask', 'portrait-flux-fullbody', {
          checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
          width: genWidth,
          height: genHeight,
          positive: positive.slice(0, 400),
        })
      }

      logTaskProgress('ImageTask', 'comfyui-queue', {
        id,
        workflow: workflowKey,
        style: visualStyle,
        width: genWidth,
        height: genHeight,
      })
      const usedPulid = workflowKey === 'flux_dev_fp8_pulid'
      try {
        const promptId = await queueComfyPrompt(fluxPrompt)
        persistComfyTaskId(id, promptId)
        const outputs = await waitForComfyPrompt(promptId)
        localPath = copyComfyImageOutput(outputs, 'images')
      } catch (fluxErr: any) {
        const fluxMsg = String(fluxErr?.message || '')
        if (usedPulid && refRel && isFluxReduxReady() && /PulidFlux|InsightFaceLoader|OSError/i.test(fluxMsg)) {
          logTaskWarn('ImageTask', 'flux-pulid-fallback-redux', {
            id,
            error: fluxMsg.slice(0, 240),
            hint: 'PuLID InsightFace 失败，自动回退 Redux 弱锁脸',
          })
          const reduxPrompt = loadWorkflowTemplate('flux_dev_fp8_redux')
          const refFile = await prepareFluxReduxReferenceImage(refRel, { faceOnly: true })
          injectFluxReduxWorkflow(reduxPrompt, {
            positive,
            negative,
            width: genWidth,
            height: genHeight,
            checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
            referenceImage: refFile,
            reduxStrength: LOCAL_COMIC_ENV.fluxReduxStoryboardStrength,
            reduxStrengthType: LOCAL_COMIC_ENV.fluxReduxStoryboardStrengthType,
            steps: COMFY_FLUX_GENERATION_STEPS,
            cfg: 1,
          })
          const promptId = await queueComfyPrompt(reduxPrompt)
          persistComfyTaskId(id, promptId)
          const outputs = await waitForComfyPrompt(promptId)
          localPath = copyComfyImageOutput(outputs, 'images')
        } else {
          throw fluxErr
        }
      }
      if (wantUpscale1080) {
        await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, { fit: (isStoryboard || isScene) ? 'contain' : 'cover' })
      }
      if (isPortrait) {
        localPath = await finalizePortraitWhiteBackground(localPath)
      }
    } else if (useInstantId) {
      const refRel = resolveFluxStoryboardReferencePath(record)
      const instantSize = clampComfyImageSize(LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, 1024)
      const sdxlParams = {
        positive,
        negative,
        width: instantSize.width,
        height: instantSize.height,
        steps: isStoryboard ? 24 : 22,
        cfg: 4.5,
        samplerName: 'dpmpp_2m' as const,
        scheduler: 'karras' as const,
        checkpoint: resolveComfyPortraitCheckpoint(visualStyle),
      }

      const instantIdCatalogReady = await isInstantIdComfyCatalogReady()
      const canUseInstantId = (isStoryboard || isScene) && !!refRel && instantIdCatalogReady
      if ((isStoryboard || isScene) && refRel && !instantIdCatalogReady) {
        logTaskWarn('ImageTask', 'instantid-missing', {
          id,
          ref: refRel,
          diskReady: isInstantIdReady(),
          hint: isInstantIdReady()
            ? '权重在磁盘但 ComfyUI 未加载：请在 extra_model_paths.yaml 添加 controlnet/instantid，并确保 ComfyUI/models/insightface 下有 antelopev2（运行 setup-instantid.ps1）'
            : '请运行 scripts/setup-instantid.ps1 并安装 ComfyUI_InstantID 自定义节点',
        })
      }

      if (canUseInstantId && refRel) {
        const refFile = await prepareInstantIdReferenceImage(refRel)
        const instantIdFiles = await resolveInstantIdComfyFileNames()
        const instantPrompt = loadWorkflowTemplate('sdxl_instantid')
        const storyboardInstantIdWeight = Math.min(LOCAL_COMIC_ENV.instantIdWeight, 0.65)
        injectSdxlInstantIdWorkflow(instantPrompt, {
          ...sdxlParams,
          referenceImage: refFile,
          instantIdModel: instantIdFiles.ipAdapter,
          instantIdControlNet: instantIdFiles.controlNet,
          instantIdWeight: isStoryboard ? storyboardInstantIdWeight : LOCAL_COMIC_ENV.instantIdWeight,
        })
        logTaskProgress('ImageTask', 'instantid-ref', {
          id,
          ref: refRel,
          weight: isStoryboard ? storyboardInstantIdWeight : LOCAL_COMIC_ENV.instantIdWeight,
        })
        logTaskProgress('ImageTask', 'comfyui-queue', {
          id,
          workflow: 'sdxl_instantid',
          style: visualStyle,
          width: instantSize.width,
          height: instantSize.height,
          positive: positive.slice(0, 400),
        })
        const promptId = await queueComfyPrompt(instantPrompt)
        persistComfyTaskId(id, promptId)
        const outputs = await waitForComfyPrompt(promptId)
        localPath = copyComfyImageOutput(outputs, 'images')
        if (wantUpscale1080) {
          await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, { fit: (isStoryboard || isScene) ? 'contain' : 'cover' })
        }
      } else {
        if (isStoryboard && !refRel) {
          logTaskWarn('ImageTask', 'instantid-no-ref', {
            id,
            hint: '无角色定妆参考，回退 sdxl_anime txt2img',
          })
        }
        const basePrompt = loadWorkflowTemplate('sdxl_anime')
        injectSdxlWorkflow(basePrompt, sdxlParams)
        logTaskProgress('ImageTask', 'comfyui-queue', {
          id,
          workflow: 'sdxl_anime',
          style: visualStyle,
          width: sdxlParams.width,
          height: sdxlParams.height,
          fallback: !canUseInstantId,
        })
        const promptId = await queueComfyPrompt(basePrompt)
        persistComfyTaskId(id, promptId)
        const outputs = await waitForComfyPrompt(promptId)
        localPath = copyComfyImageOutput(outputs, 'images')
        if (wantUpscale1080) {
          await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, { fit: (isStoryboard || isScene) ? 'contain' : 'cover' })
        }
      }
    } else {
      const sdxlParams = {
        positive,
        negative,
        width: genWidth,
        height: genHeight,
        steps: isPortrait || isStoryboard ? 32 : 26,
        cfg: 7,
        samplerName: isStoryboard || isPortrait ? 'dpmpp_2m' as const : undefined,
        scheduler: isStoryboard || isPortrait ? 'karras' as const : undefined,
        checkpoint: resolveComfyCheckpoint(visualStyle),
      }

      if (wantUpscale1080) {
        try {
          const upscalePrompt = loadWorkflowTemplate('sdxl_upscale')
          injectSdxlUpscaleWorkflow(upscalePrompt, sdxlParams)
          logTaskProgress('ImageTask', 'comfyui-queue', {
            id,
            workflow: 'sdxl_upscale',
            style: visualStyle,
            genWidth: sdxlParams.width,
            genHeight: sdxlParams.height,
            outputWidth: LOCAL_COMIC_ENV.outputWidth,
            outputHeight: LOCAL_COMIC_ENV.outputHeight,
          })
          const promptId = await queueComfyPrompt(upscalePrompt)
          persistComfyTaskId(id, promptId)
          const outputs = await waitForComfyPrompt(promptId)
          localPath = copyComfyImageOutput(outputs, 'images')
        } catch (upscaleErr: any) {
          logTaskWarn('ImageTask', 'upscale-workflow-fallback', { id, error: upscaleErr.message })
          const basePrompt = loadWorkflowTemplate('sdxl_anime')
          injectSdxlWorkflow(basePrompt, sdxlParams)
          logTaskProgress('ImageTask', 'comfyui-queue', {
            id,
            workflow: workflowName,
            style: visualStyle,
            width: sdxlParams.width,
            height: sdxlParams.height,
          })
          const promptId = await queueComfyPrompt(basePrompt)
          persistComfyTaskId(id, promptId)
          const outputs = await waitForComfyPrompt(promptId)
          localPath = copyComfyImageOutput(outputs, 'images')
          await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight, { fit: (isStoryboard || isScene) ? 'contain' : 'cover' })
        }
      } else {
        const basePrompt = loadWorkflowTemplate('sdxl_anime')
        injectSdxlWorkflow(basePrompt, sdxlParams)
        logTaskProgress('ImageTask', 'comfyui-queue', {
          id,
          workflow: workflowName,
          style: visualStyle,
          width: sdxlParams.width,
          height: sdxlParams.height,
        })
        const promptId = await queueComfyPrompt(basePrompt)
        persistComfyTaskId(id, promptId)
        const outputs = await waitForComfyPrompt(promptId)
        localPath = copyComfyImageOutput(outputs, 'images')
      }
    }

    const latest = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()[0]
    if (!latest) {
      logTaskWarn('ImageTask', 'stale-complete-skipped', { id, hint: '任务记录已删除' })
      return
    }
    await handleImageCompleteLocal(id, localPath)
  } catch (err: any) {
    logTaskError('ImageTask', 'comfyui-process', { id, error: err.message })
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
  }
}

function storyboardImageFieldForFrame(frameType?: string | null): 'composedImage' | 'firstFrameImage' | 'lastFrameImage' {
  if (frameType === 'first_frame') return 'firstFrameImage'
  if (frameType === 'last_frame') return 'lastFrameImage'
  return 'composedImage'
}

/** 清理僵尸 processing 任务：绝不打断「同一目标上最新的进行中任务」（否则重生成定妆会被误杀） */
export function reconcileStaleProcessingImageGenerations(dramaId?: number | null): number {
  const allRows = db.select().from(schema.imageGenerations).all()
  const rows = allRows.filter(row => {
    if (row.status !== 'processing' && row.status !== 'pending') return false
    if (dramaId != null && row.dramaId !== dramaId) return false
    return !!(row.storyboardId || row.characterId || row.sceneId)
  })

  const STALE_NEWEST_MS = 12 * 60 * 1000
  let fixed = 0
  for (const row of rows) {
    const sameTarget = allRows.filter(other =>
      comfyImageTargetKey(other) === comfyImageTargetKey(row),
    )
    const newestId = sameTarget.reduce((max, r) => Math.max(max, r.id), 0)

    // 最新一条 = 正在/刚提交的重生成，保留（除非已超时无结果）
    if (row.id === newestId) {
      const targetPath = resolveTargetImagePath(row)
      if (row.localPath && targetPath && String(row.localPath) === String(targetPath)) {
        db.update(schema.imageGenerations)
          .set({ status: 'completed', updatedAt: now() })
          .where(eq(schema.imageGenerations.id, row.id))
          .run()
        fixed++
        logTaskWarn('ImageTask', 'reconcile-mark-completed', { id: row.id, path: row.localPath })
        continue
      }
      const startedMs = Date.parse(String(row.createdAt || row.updatedAt || ''))
      const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : 0
      // Agnes/智谱等云端轮询在进程内；超时无 localPath = 僵尸（重启或丢轮询）
      if (ageMs >= STALE_NEWEST_MS && !String(row.localPath || '').trim()) {
        db.update(schema.imageGenerations)
          .set({
            status: 'failed',
            errorMsg: '生图超时或服务中断（无结果），请重新生成',
            updatedAt: now(),
          })
          .where(eq(schema.imageGenerations.id, row.id))
          .run()
        fixed++
        logTaskWarn('ImageTask', 'reconcile-stale-newest-timeout', {
          id: row.id,
          provider: row.provider,
          ageSec: Math.round(ageMs / 1000),
        })
      }
      continue
    }

    // 已被同目标更新的任务取代
    const replaced = sameTarget.some(other =>
      other.id > row.id && (other.status === 'completed' || other.status === 'processing' || other.status === 'pending'),
    )
    if (!replaced) continue

    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: '已被新任务取代', updatedAt: now() })
      .where(eq(schema.imageGenerations.id, row.id))
      .run()
    fixed++
    logTaskWarn('ImageTask', 'reconcile-stale-processing', {
      id: row.id,
      storyboardId: row.storyboardId,
      characterId: row.characterId,
      sceneId: row.sceneId,
    })
  }
  return fixed
}

/**
 * 后端重启后：云端（Agnes/智谱等）进程内轮询已丢失，processing 不会再变 completed。
 * ComfyUI 有 promptId 的由 resumeStuckComfyImageGenerations 恢复。
 */
export function failOrphanCloudImageGenerations(): number {
  const rows = db.select().from(schema.imageGenerations).all()
    .filter(row => {
      if (row.status !== 'processing' && row.status !== 'pending') return false
      const provider = String(row.provider || '').toLowerCase()
      if (provider === 'comfyui') return false
      return !!(row.storyboardId || row.characterId || row.sceneId)
    })
  let fixed = 0
  for (const row of rows) {
    db.update(schema.imageGenerations)
      .set({
        status: 'failed',
        errorMsg: '服务重启，云端生图轮询中断，请重新生成',
        updatedAt: now(),
      })
      .where(eq(schema.imageGenerations.id, row.id))
      .run()
    fixed++
    logTaskWarn('ImageTask', 'orphan-cloud-failed', {
      id: row.id,
      provider: row.provider,
      storyboardId: row.storyboardId,
    })
  }
  return fixed
}

function resolveTargetImagePath(
  row: Pick<typeof schema.imageGenerations.$inferSelect, 'storyboardId' | 'characterId' | 'sceneId' | 'frameType'>,
): string | null {
  if (row.storyboardId) {
    const sb = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, row.storyboardId)).all()[0]
    const field = storyboardImageFieldForFrame(row.frameType)
    return String(sb?.[field] || '').trim() || null
  }
  if (row.characterId) {
    const ch = db.select().from(schema.characters)
      .where(eq(schema.characters.id, row.characterId)).all()[0]
    return String(ch?.imageUrl || '').trim() || null
  }
  if (row.sceneId) {
    const sc = db.select().from(schema.scenes)
      .where(eq(schema.scenes.id, row.sceneId)).all()[0]
    return String(sc?.imageUrl || '').trim() || null
  }
  return null
}

async function handleImageCompleteLocal(id: number, localPath: string) {
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]
  if (!record) {
    logTaskWarn('ImageTask', 'comfyui-orphan-complete', {
      id,
      localPath,
      hint: '任务记录已删除（可能清除配图时仍在生图），图片文件已保留',
    })
    return
  }
  if (record.status === 'failed') {
    // 旧版 reconcile 会把「已有定妆图时的重生成」误标 failed；若仍是同目标最新任务则允许写回
    const err = String(record.errorMsg || '')
    const wrongCancel = /配图已存在|配图已生成，旧任务已结束/.test(err)
    const newestSameTarget = db.select().from(schema.imageGenerations).all()
      .filter(r => comfyImageTargetKey(r) === comfyImageTargetKey(record))
      .reduce((max, r) => Math.max(max, r.id), 0)
    if (!wrongCancel || record.id !== newestSameTarget) {
      logTaskWarn('ImageTask', 'stale-complete-skipped', {
        id,
        localPath,
        hint: '任务已被新任务取代，忽略迟到的 Comfy 输出',
      })
      return
    }
    logTaskWarn('ImageTask', 'recover-wrong-cancel', { id, errorMsg: err.slice(0, 80) })
  }

  // 先写分镜/角色/场景图路径，再标 generation completed，避免前端轮询看到 completed 时 refresh 仍无图
  if (record.storyboardId) {
    const sb = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
    if (!sb) {
      logTaskWarn('ImageTask', 'storyboard-deleted-on-complete', {
        id,
        storyboardId: record.storyboardId,
        localPath,
        hint: '分镜已删除，配图文件已保留但未写入分镜',
      })
    } else {
      const sbUpdate: Record<string, any> = { updatedAt: now() }
      if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
      else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
      else sbUpdate.composedImage = localPath
      db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
    }
  }
  if (record.characterId) {
    replaceCharacterPortraitImage(record.characterId, localPath)
  }
  if (record.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }

  db.update(schema.imageGenerations)
    .set({
      localPath,
      imageUrl: localPath,
      status: 'completed',
      completedAt: now(),
      updatedAt: now(),
    })
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'comfyui-saved', { id, localPath })
}

async function normalizeReferenceImages(
  raw: string | null | undefined,
  options?: { agnesDarkBg?: boolean },
): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }

  const deduped = Array.from(
    new Set(
      refs
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )

  const agnesDarkBg = !!options?.agnesDarkBg
  const normalized = await Promise.all(deduped.map(async (value) => {
    if (value.startsWith('data:image/')) {
      if (!agnesDarkBg) return value
      try {
        const { convertPortraitRefWhiteBgToAgnesDark } = await import('../utils/portrait-ref-preprocess.js')
        const converted = await convertPortraitRefWhiteBgToAgnesDark(value)
        return `data:image/png;base64,${converted.toString('base64')}`
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-agnes-dark-failed', { error: (err as Error).message })
        return value
      }
    }
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        return await readImageAsCompressedDataUrl(localPath, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
          flattenBackground: agnesDarkBg ? '#0f172a' : '#ffffff',
          replaceNearWhiteBg: agnesDarkBg,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    return value
  }))

  return normalized.filter((item): item is string => !!item).slice(0, 6)
}

async function pollImageTask(id: number, config: AIConfig, taskId: string) {
  const adapter = getImageAdapter(config.provider)
  const startedAt = Date.now()
  const maxDurationMs = 600_000

  for (let i = 0; i < 120; i++) {
    if (Date.now() - startedAt >= maxDurationMs) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: 'Timeout: Polling exceeded 10 minutes', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
      return
    }
    await new Promise(r => setTimeout(r, 5000))
    if (Date.now() - startedAt >= maxDurationMs) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: 'Timeout: Polling exceeded 10 minutes', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
      return
    }
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('ImageTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const remainingMs = Math.max(1_000, maxDurationMs - (Date.now() - startedAt))
      const resp = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(remainingMs),
      })
      if (!resp.ok) continue
      const result = await resp.json() as any

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.imageUrl) {
        logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl: pollResp.imageUrl })
        await handleImageComplete(id, config.provider, pollResp.imageUrl)
        return
      }
      if (pollResp.status === 'completed' && adapter.provider === 'gemini') {
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskSuccess('ImageTask', 'poll-base64-complete', { id, taskId, mimeType: b64.mimeType })
          await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
          return
        }
      }
      if (pollResp.status === 'failed') {
        logTaskError('ImageTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Generation failed' })
        throw new Error(pollResp.error || 'Generation failed')
      }
    } catch (err: any) {
      if (i === 119 || Date.now() - startedAt >= maxDurationMs) {
        logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: err.message })
        db.update(schema.imageGenerations)
          .set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.imageGenerations.id, id))
          .run()
        return
      }
      logTaskWarn('ImageTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }
}

async function handleImageComplete(id: number, provider: string, imageUrl: string) {
  const localPath = await downloadFile(imageUrl, 'images')
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  db.update(schema.imageGenerations)
    .set({ imageUrl, localPath, status: 'completed', updatedAt: now() })
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'downloaded', { id, provider, localPath })

  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
  }
  if (record?.characterId) {
    replaceCharacterPortraitImage(record.characterId, localPath)
  }
  if (record?.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }
}

async function handleImageCompleteBase64(id: number, provider: string, base64Data: string, mimeType: string) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  db.update(schema.imageGenerations)
    .set({ localPath, status: 'completed', updatedAt: now() })
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'saved-base64', { id, provider, mimeType, localPath })

  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
  }
  if (record?.characterId) {
    db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
  }
  if (record?.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }
}
