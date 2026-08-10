import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { resolveImageGenerationConfig } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, getAbsolutePath, saveBase64Image, upscaleImageToTargetSize } from '../utils/storage.js'
import { getImageAdapter } from './adapters/registry'
import { isAgnesImageModel, isAgnesNovelComicQuadPagePrompt } from './adapters/agnes-image.js'
import {
  AGNES_SHEET_RETRY_MAX,
  AGNES_STORYBOARD_MAX_REFS,
  cropPortraitRefToFaceHair,
  detectAgnesCharacterSheetLayout,
  formatAgnesSheetRetryError,
  parseAgnesSheetRetryCount,
} from '../utils/portrait-ref-preprocess.js'
import fs from 'fs'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { generateComfyPortraitComposite, finalizePortraitWhiteBackground } from './comfy-portrait-composite.js'
import {
  getEpisodeVisualCharacters,
  resolveCharacterIdForPortraitLabel,
  resolveCharacterIdForPortraitRef,
  extractAllPortraitLabelsFromPrompt,
  resolveCharacterPortraitReferencePath,
  collectCharacterReferenceImages,
  collectCharacterReferenceImagesByPortraitLabels,
  resolveStoryboardCharacterIdsForShot,
} from './narration-characters.js'
import {
  buildStoryboardTypedReferenceImages,
  serializeTypedReferenceImages,
} from './narration-scene-assets.js'
import { narrationHasStrongLimbAction } from './narration-beat-fidelity.js'
import { DEFAULT_LOCAL_IMAGE_MODEL, imageModelMaxReferenceImages } from '../constants/image-models.js'
import { isBrokenFluxEnglishPrompt, FLUX_PROMPT_EN_VERSION } from './flux-prompt-translate.js'
import {
  normalizeArtStyle,
  resolveEpisodeVisualStyle,
  compileNarrationImageGenerationBundle,
  isNarrationStructuredStyle,
  NARRATION_USE_RAW_LLM_PROMPTS,
} from '../constants/art-styles.js'
import {
  DEFAULT_NOVEL_COMIC_PANEL_TEXT_MODE,
  isNovelComicSketchStyle,
  normalizeNovelComicPanelTextMode,
  novelComicPanelTextModeFromPrompt,
  NOVEL_COMIC_IMAGE_SIZE,
  NOVEL_COMIC_PANEL_TEXT_MODE_SHORT,
} from '../constants/novel-comic.js'
import { overlayNovelComicQuadPageText } from './novel-comic-quad-text-overlay.js'
import { parseNarrationImageMeta } from './narration-image.js'
import {
  PORTRAIT_EYE_COLOR_POSITIVE_CN,
  PORTRAIT_EYE_COLOR_NEGATIVE_CN,
  PORTRAIT_NEUTRAL_FACE_CN,
  PORTRAIT_EXPRESSION_NEGATIVE_CN,
  QWEN_PORTRAIT_QUALITY_NEGATIVE_CN,
  sanitizePortraitEyeColorText,
  sanitizePortraitExpressionText,
} from '../constants/portrait-reference.js'
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
import {
  alignPortraitLabelsInImagePromptCn,
  buildPortraitAppearanceSpecFromCharacter,
  enrichKolorsPortraitIdentityChinese,
  enforceSingleCharacterFrameInImagePromptCn,
  injectPortraitSpecIntoFluxEnglish,
} from '../constants/portrait-appearance-spec.js'
import { isMotionComicCameraMetaDescription, isMotionComicStyle, MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS } from '../constants/motion-comic.js'
import { deleteUniqueStaticFiles, imagePathsToDelete } from './storyboard-asset-replace.js'
import {
  isNarrationEmptySceneGeneration,
  isNarrationPropStillLifeGeneration,
} from './narration-env-image-prompts.js'

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  propId?: number
  prompt: string
  negativePrompt?: string
  model?: string
  size?: string
  style?: string
  referenceImages?: string[] | Array<{ url: string; kind?: string }>
  /** false = 不挂定妆参考，且禁止运行时自动补齐参考图 */
  usePortraitReference?: boolean
  /** 小说漫画格字：short=空框叠字（默认）| full=模型画字 */
  panelTextMode?: 'short' | 'full'
  frameType?: string
  configId?: number
}

/** 小说漫画短字模式：生图完成后叠正确旁白 */
async function maybeOverlayNovelComicQuadText(
  record: { prompt?: string | null; storyboardId?: number | null; style?: string | null; frameType?: string | null },
  localPath: string,
): Promise<string> {
  const src = String(localPath || '').trim()
  if (!src || !record?.storyboardId) return src
  // 定妆等非配图页不叠字
  const ft = String(record.frameType || '')
  if (ft && /portrait|first_frame|last_frame/i.test(ft)) return src

  const prompt = String(record.prompt || '')
  const isQuad = isAgnesNovelComicQuadPagePrompt(prompt)
    || /2×2|四格|四宫格|9:16|素笔彩画竖页|二列|三列|上格\s*[：:]/.test(prompt)
  if (!isQuad) return src

  const visualStyle = record.style || resolveVisualStyleForComfyRecord(record as any)
  if (!isNovelComicSketchStyle(visualStyle) && !isAgnesNovelComicQuadPagePrompt(prompt)) return src

  const sb = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
  const meta = parseNarrationImageMeta(sb?.referenceImages)
  const mode = normalizeNovelComicPanelTextMode(
    (meta as { panel_text_mode?: string }).panel_text_mode
    ?? novelComicPanelTextModeFromPrompt(prompt)
    ?? DEFAULT_NOVEL_COMIC_PANEL_TEXT_MODE,
  )
  if (mode !== NOVEL_COMIC_PANEL_TEXT_MODE_SHORT) return src
  try {
    const next = await overlayNovelComicQuadPageText({
      localPath: src,
      prompt,
      referenceImages: sb?.referenceImages,
      narrationLines: meta.image_narration_lines || meta.narration_lines,
    })
    if (next && next !== src) {
      logTaskProgress('ImageTask', 'novel-comic-quad-overlay', {
        storyboardId: record.storyboardId,
        from: src,
        to: next,
      })
      return next
    }
  } catch (err: any) {
    logTaskWarn('ImageTask', 'novel-comic-quad-overlay-failed', {
      storyboardId: record.storyboardId,
      error: err?.message || String(err),
    })
  }
  return src
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
 * 配图策略：每镜仅挂 1 张定妆参考（说话人/首个标签）；双人戏由检测拆镜。
 */
function resolveStoryboardPortraitReferencePaths(
  record: typeof schema.imageGenerations.$inferSelect,
): Array<{ name: string; path: string }> {
  // 明确写入 []：用户关闭定妆参考，禁止再从文案/绑定补齐
  if (String(record.referenceImages || '').trim() === '[]') return []
  const prompt = resolveStoryboardChinesePromptForRecord(record)
  const fromRecord = parseComfyReferenceImagePaths(record.referenceImages)
  let labels = extractAllPortraitLabelsFromPrompt(prompt)
  if (labels.length < 1 && record.storyboardId) {
    const sb = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
    const rawLabels = extractAllPortraitLabelsFromPrompt(String(sb?.imagePrompt || ''))
    if (rawLabels.length > labels.length) labels = rawLabels
  }
  // 配图只取首个对照定妆
  if (labels.length > 1) labels = labels.slice(0, 1)

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
    if (out.length >= 1) return
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

  for (const label of labels) {
    const hit = resolveLabelPath(label)
    if (hit) push(hit.name, hit.path, hit.id)
  }
  if (!out.length && linkedWithPortrait.length) {
    push(linkedWithPortrait[0].name, linkedWithPortrait[0].path, linkedWithPortrait[0].id)
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
  // 配图最多双定妆：按文案对齐，超出上限再压
  const allowDual = MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS >= 2

  const aligned = alignPortraitLabelsInImagePromptCn(raw, characters, {
    dialogue: sb.dialogue,
    narrationLines,
    fallbackNames: linkedNames,
    allowDualPortrait: allowDual,
  })
  const labels = extractAllPortraitLabelsFromPrompt(aligned)
  if (labels.length <= MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS) return aligned
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

  const usePortraitReference = params.usePortraitReference !== false
  // null=未指定可自动补齐；[]=明确不挂任何参考；有场景/道具 kind 时即使关定妆也保留
  const referenceImagesJson = Array.isArray(params.referenceImages)
    ? JSON.stringify(params.referenceImages)
    : (!usePortraitReference ? '[]' : null)
  let storePrompt = String(params.prompt || '')
  // 入库即终稿：不在此叠四格页/画风壳（须在配图文案或定妆 resolve 阶段写好）
  const res = db.insert(schema.imageGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    propId: params.propId,
    prompt: storePrompt,
    negativePrompt: params.negativePrompt ?? null,
    model: params.model || config.model,
    style: params.style ? normalizeArtStyle(params.style) : null,
    provider: config.provider,
    size: params.size || (
      isNovelComicSketchStyle(params.style)
        && !/portrait|first_frame|last_frame/i.test(String(params.frameType || ''))
        && isAgnesNovelComicQuadPagePrompt(String(params.prompt || ''))
        ? NOVEL_COMIC_IMAGE_SIZE
        : (isNovelComicSketchStyle(params.style)
          && !/portrait|first_frame|last_frame/i.test(String(params.frameType || ''))
          && /9:16|素笔彩画竖页|二列|三列|layout\s*=\s*quad|【格字模式/i.test(String(params.prompt || ''))
          ? NOVEL_COMIC_IMAGE_SIZE
          : '1920x1080')
    ),
    frameType: params.frameType,
    referenceImages: referenceImagesJson,
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
    propId: params.propId,
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
    const isAgnesStoryboard = useAgnesDarkRefs && !!record.storyboardId && !record.characterId
    const sheetRetry = parseAgnesSheetRetryCount(record.errorMsg)
    // 分镜若入库时没带定妆参考：生图前按文案标签补齐（设定表重试 / 明确 [] 不挂参考 除外）
    let referenceImagesJson = record.referenceImages
    const skipPortraitRefs = String(referenceImagesJson || '').trim() === '[]'
    if (isAgnesStoryboard && sheetRetry === 0 && !skipPortraitRefs) {
      const existing = parseComfyReferenceImagePaths(referenceImagesJson)
      if (!existing.length) {
        const sb = record.storyboardId
          ? db.select().from(schema.storyboards).where(eq(schema.storyboards.id, record.storyboardId)).all()[0]
          : null
        const ep = sb
          ? db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()[0]
          : null
        if (sb && ep) {
          const allChars = getEpisodeVisualCharacters(sb.episodeId, ep.dramaId)
          const resolved = resolveStoryboardCharacterIdsForShot(sb.id, { sync: false })
          const promptBase = resolveStoryboardChinesePromptForRecord(record) || String(sb.imagePrompt || record.prompt || '')
          const maxTotal = Math.max(1, imageModelMaxReferenceImages(record.model || config.model))
          const built = buildStoryboardTypedReferenceImages({
            prompt: promptBase,
            storyboard: sb,
            characters: allChars,
            maxPortrait: MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS,
            maxTotal: Math.max(maxTotal, AGNES_STORYBOARD_MAX_REFS + 2, 8),
            fallbackCharacterIds: resolved.characterIds,
            collectPortraitRefs: (prompt, maxPortrait) => {
              const by = collectCharacterReferenceImagesByPortraitLabels(prompt, allChars, maxPortrait)
              return { refs: by.refs, names: by.names, allLabels: by.allLabels }
            },
            collectPortraitRefsByIds: (ids, maxPortrait) =>
              collectCharacterReferenceImages(allChars, ids, maxPortrait),
          })
          if (built.refs.length) {
            referenceImagesJson = serializeTypedReferenceImages(built.refs)
            logTaskProgress('ImageTask', 'agnes-storyboard-refs-filled', {
              id,
              filledCount: built.refs.length,
              kinds: built.refs.map(r => r.kind),
              sceneLabels: built.sceneLabels,
              portraitLabels: built.portraitLabels,
              propLabels: built.propLabels,
            })
          }
        } else {
          const filled = resolveStoryboardPortraitReferencePaths(record)
            .slice(0, AGNES_STORYBOARD_MAX_REFS)
            .map(r => r.path)
            .filter(Boolean)
          if (filled.length) {
            referenceImagesJson = JSON.stringify(filled)
            logTaskProgress('ImageTask', 'agnes-storyboard-refs-filled', {
              id,
              filledCount: filled.length,
              paths: filled,
              fallback: 'portrait-only',
            })
          }
        }
      }
    } else if (skipPortraitRefs) {
      logTaskProgress('ImageTask', 'agnes-storyboard-refs-skipped', { id, reason: 'use_portrait_reference=false' })
    }
    // 对照定妆性别须在配图文案阶段写好；生图不再补「男性/女性」/六维壳
    const requestPrompt = String(record.prompt || '')
    const isNovelComicQuad = isAgnesNovelComicQuadPagePrompt(String(record.prompt || ''))
    const hasEnvRef = /"kind"\s*:\s*"(?:scene|prop)"/.test(String(referenceImagesJson || ''))
      || /【场景参考：|【道具参考顺序：/.test(String(record.prompt || ''))
    // 有环境参考：按已挂载张数走，不再卡 4；纯定妆仍限 AGNES_STORYBOARD_MAX_REFS
    const attachedCount = (() => {
      try {
        const arr = JSON.parse(String(referenceImagesJson || '[]'))
        return Array.isArray(arr) ? arr.length : 0
      } catch {
        return 0
      }
    })()
    const agnesMaxRefs = hasEnvRef
      ? Math.max(attachedCount, AGNES_STORYBOARD_MAX_REFS + 2, 8)
      : AGNES_STORYBOARD_MAX_REFS
    // 强肢体动作镜：跳过 face-crop，保留半身/全身姿势信息
    const skipFaceCropForAction = isAgnesStoryboard && narrationHasStrongLimbAction(
      resolveStoryboardChinesePromptForRecord(record) || requestPrompt,
    )
    // 小说漫画四格：软参考（约八成像）——更小更糊，减轻定妆板过拟合挤场面
    const resolvedReferenceImages = await normalizeReferenceImages(referenceImagesJson, {
      agnesDarkBg: useAgnesDarkRefs,
      agnesStoryboardFaceCrop: isAgnesStoryboard && !skipFaceCropForAction,
      agnesSoftFaceRef: isAgnesStoryboard && isNovelComicQuad,
      maxRefs: isAgnesStoryboard ? agnesMaxRefs : 6,
    })
    if (isAgnesStoryboard) {
      logTaskProgress('ImageTask', 'agnes-storyboard-refs', {
        id,
        faceCrop: isAgnesStoryboard && !skipFaceCropForAction,
        skipFaceCropForAction,
        softFaceRef: isNovelComicQuad,
        maxRefs: agnesMaxRefs,
        hasEnvRef,
        resolvedCount: resolvedReferenceImages.length,
        sheetRetry,
      })
    }
    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: requestPrompt,
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
      || (
        !record.propId
        && !record.sceneId
        && !record.storyboardId
        && !isNarrationPropStillLifeGeneration(record)
        && !isNarrationEmptySceneGeneration(record)
        && /定妆|turnaround|三视图|character design sheet/i.test(String(record.prompt || ''))
      )
    const isScene = (!!record.sceneId && !record.storyboardId) || isNarrationEmptySceneGeneration(record)
    const isPropStill = isNarrationPropStillLifeGeneration(record)
    const isGrid = String(record.frameType || '').startsWith('grid_')
    const isStoryboard = !!record.storyboardId && !isGrid && !isPortrait && !isScene && !isPropStill

    const workflowName = String(record.model || config.model || DEFAULT_LOCAL_IMAGE_MODEL).split(',')[0].trim() || DEFAULT_LOCAL_IMAGE_MODEL
    const useKolors = isKolorsImageModel(workflowName)
    const useQwen = isQwenImageEditModel(workflowName)
    const useInstantId = isSdxlInstantIdImageModel(workflowName)
    const useFlux = isFluxImageModel(workflowName) && !useKolors && !useInstantId && !useQwen
    const visualStyle = resolveVisualStyleForComfyRecord(record)

    await ensureComfyWorkflowFamily(
      useQwen ? 'qwen' : useKolors ? 'kolors' : useFlux ? 'flux' : 'sdxl',
    )

    // 本地 Comfy：入库 prompt 原样；尺寸/工作流仍按类型调整（不叠画风壳）
    let positive = String(record.prompt || '').trim()
    let negative: string | undefined = String(record.negativePrompt || '').trim() || COMFY_MINIMAL_NEGATIVE
    if (
      !NARRATION_USE_RAW_LLM_PROMPTS
      && !isPropStill
      && !useFlux && !useKolors && !useQwen && !useInstantId
      && isStoryboard
      && isNarrationStructuredStyle(visualStyle)
    ) {
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
      if (!NARRATION_USE_RAW_LLM_PROMPTS) {
        positive = toComfyGridPrompt(positive, visualStyle)
      }
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
      if (!NARRATION_USE_RAW_LLM_PROMPTS && useFlux) {
        positive = toComfyFluxPortraitPrompt(
          positive,
          portraitCompositeInput.characterName,
          visualStyle,
          portraitCompositeInput.characterRole,
        )
        negative = ''
      }
      // Qwen 定妆：竖幅 768×1344 原生满构图；收尾只清白底，禁止垫成 16:9
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
      negative = String(record.negativePrompt || '').trim()
        || '低质量，模糊，文字，水印，畸形，多余肢体，低分辨率'
    }
    if (useQwen) negative = String(record.negativePrompt || '').trim() || ''
    if (NARRATION_USE_RAW_LLM_PROMPTS) {
      // 成稿即终稿：仅做模型必需的英文翻译读取（Flux/InstantID 用已存 flux_prompt_en），不叠壳
      if (useFlux && isStoryboard) {
        positive = await resolveFluxPositivePrompt(record, positive, visualStyle)
        positive = finalizeFluxStoryboardPositivePrompt(positive, undefined)
      } else if (useFlux && (isScene || isPropStill || isPortrait)) {
        positive = String(positive).trim().slice(0, 2000)
      } else if (useInstantId && (isStoryboard || isScene)) {
        positive = await resolveFluxPositivePrompt(record, positive, visualStyle)
        positive = finalizeFluxStoryboardPositivePrompt(positive, undefined)
        negative = String(record.negativePrompt || '').trim()
          || 'lowres, bad anatomy, bad hands, text, watermark, blurry, 3d, realistic, ugly, deformed face, white background'
      } else if ((useKolors || useQwen) && (isStoryboard || isScene || isPropStill || isPortrait)) {
        const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
        positive = String(chineseSource || positive).trim().slice(0, 1800)
      }
    } else if (useFlux && (isStoryboard || isScene || isPropStill)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      if (isPropStill || isScene) {
        positive = String(positive || chineseSource).trim().slice(0, 2000)
      } else {
        positive = await resolveFluxPositivePrompt(record, positive, visualStyle)
        positive = finalizeFluxStoryboardPositivePrompt(positive, isStoryboard ? chineseSource : undefined)
        if (isStoryboard) {
          const gender = resolvePortraitGender(chineseSource)
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
                if (ch?.appearance?.trim()) {
                  const spec = buildPortraitAppearanceSpecFromCharacter(ch, visualStyle)
                  positive = injectPortraitSpecIntoFluxEnglish(positive, spec, gender)
                }
              }
            }
          }
        }
      }
      negative = ''
    } else if (useKolors && (isStoryboard || isScene || isPropStill)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      positive = (isScene || isPropStill)
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
    } else if (useQwen && (isStoryboard || isScene || isPortrait)) {
      const chineseSource = resolveStoryboardChinesePromptForRecord(record) || positive
      positive = resolveKolorsChinesePrompt(chineseSource)
      // 旧路径：定妆/分镜 Qwen 增强（NARRATION_USE_RAW_LLM_PROMPTS=false 时）
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
      }
    }
    if (!NARRATION_USE_RAW_LLM_PROMPTS && useInstantId && (isStoryboard || isScene)) {
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

  localPath = await maybeOverlayNovelComicQuadText(record, localPath)

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
  if (record.propId) {
    db.update(schema.props).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.props.id, record.propId)).run()
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
  options?: {
    agnesDarkBg?: boolean
    /** Agnes 分镜：裁成脸+头发再压缩上传 */
    agnesStoryboardFaceCrop?: boolean
    /** 小说漫画四格：软参考（更小/更糊，约八成像，场面优先） */
    agnesSoftFaceRef?: boolean
    maxRefs?: number
  },
): Promise<string[]> {
  if (!raw) return []
  let parsed: unknown = []
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = []
  }
  if (!Array.isArray(parsed)) return []

  type TypedRef = { url: string; kind: 'portrait' | 'scene' | 'prop' }
  const typed: TypedRef[] = []
  const seenUrls = new Set<string>()
  for (const item of parsed) {
    let url = ''
    let kind: TypedRef['kind'] = 'portrait'
    if (typeof item === 'string') {
      url = item.trim()
    } else if (item && typeof item === 'object') {
      url = String((item as any).url || (item as any).path || '').trim()
      const k = String((item as any).kind || 'portrait')
      kind = k === 'scene' || k === 'prop' ? k : 'portrait'
    }
    if (!url || seenUrls.has(url)) continue
    seenUrls.add(url)
    typed.push({ url, kind })
  }

  const agnesDarkBg = !!options?.agnesDarkBg
  const faceCrop = !!options?.agnesStoryboardFaceCrop
  const softFaceRef = !!options?.agnesSoftFaceRef
  const maxRefs = Math.max(1, options?.maxRefs ?? 6)
  const capped = typed.slice(0, maxRefs)

  const normalized = await Promise.all(capped.map(async (entry) => {
    const value = entry.url
    const isEnvRef = entry.kind === 'scene' || entry.kind === 'prop'
    try {
      let buf: Buffer | null = null

      if (value.startsWith('data:image/')) {
        buf = Buffer.from(value.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      } else if (value.startsWith('static/') || value.startsWith('/static/')) {
        const localPath = value.startsWith('/static/') ? value.slice(1) : value
        const abs = getAbsolutePath(localPath)
        if (!fs.existsSync(abs)) {
          logTaskWarn('ImageTask', 'reference-missing', { path: localPath })
          return null
        }
        buf = fs.readFileSync(abs)
      } else if (/^https?:\/\//i.test(value)) {
        if (!faceCrop && !agnesDarkBg && !isEnvRef) return value
        const resp = await fetch(value, { signal: AbortSignal.timeout(60_000) })
        if (!resp.ok) {
          logTaskWarn('ImageTask', 'reference-fetch-failed', { status: resp.status })
          return null
        }
        buf = Buffer.from(await resp.arrayBuffer())
      } else {
        return value
      }

      if (!buf) return null

      if (faceCrop && !isEnvRef) {
        try {
          buf = await cropPortraitRefToFaceHair(buf)
        } catch (err) {
          logTaskWarn('ImageTask', 'reference-face-crop-failed', { error: (err as Error).message })
        }
      }
      if (agnesDarkBg && !isEnvRef) {
        try {
          const { convertPortraitRefWhiteBgToAgnesDark } = await import('../utils/portrait-ref-preprocess.js')
          buf = await convertPortraitRefWhiteBgToAgnesDark(buf)
        } catch (err) {
          logTaskWarn('ImageTask', 'reference-agnes-dark-failed', { error: (err as Error).message })
        }
      }

      const sharp = (await import('sharp')).default
      // 场景/道具保留全图；定妆脸参考可软化
      const edge = isEnvRef ? 768 : (softFaceRef ? 128 : (faceCrop ? 512 : 768))
      const quality = isEnvRef ? 72 : (softFaceRef ? 28 : (faceCrop ? 78 : 68))
      let pipeline = sharp(buf).rotate()
      if (softFaceRef && !isEnvRef) pipeline = pipeline.blur(1.8)
      const out = await pipeline
        .resize({
          width: edge,
          height: edge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      return `data:image/jpeg;base64,${out.toString('base64')}`
    } catch (err) {
      logTaskWarn('ImageTask', 'reference-normalize-failed', { error: (err as Error).message })
      return null
    }
  }))

  return normalized.filter((item): item is string => !!item)
}

function isAgnesStoryboardRecord(record: {
  storyboardId?: number | null
  characterId?: number | null
  model?: string | null
  provider?: string | null
  prompt?: string | null
}): boolean {
  if (!record.storyboardId || record.characterId) return false
  const provider = String(record.provider || '').toLowerCase()
  if (provider === 'agnes' || isAgnesImageModel(record.model)) return true
  return /对照定妆「|对照场景「|对照道具「|16:9横屏短剧解说|单帧剧情场景|【定妆参考顺序：|【场景参考：|【道具参考顺序：/.test(String(record.prompt || ''))
    && isAgnesImageModel(record.model)
}

/**
 * Agnes 分镜成图若检出「右栏设定表」，自动减参考图并重试（最多 AGNES_SHEET_RETRY_MAX 次）。
 * @returns true = 已排队重试，调用方勿落库 completed
 */
async function maybeRetryAgnesCharacterSheet(
  id: number,
  localPath: string,
  config: AIConfig,
): Promise<boolean> {
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]
  if (!record || !isAgnesStoryboardRecord(record)) return false

  // 小说漫画整页 2×2 四格本身就是宫格；设定表检测会误判并丢掉定妆参考
  if (isAgnesNovelComicQuadPagePrompt(String(record.prompt || ''))) {
    logTaskProgress('ImageTask', 'agnes-sheet-skip-quad-page', { id })
    return false
  }

  let abs: string
  try {
    abs = getAbsolutePath(localPath)
  } catch {
    return false
  }
  if (!fs.existsSync(abs)) return false

  let verdict
  try {
    verdict = await detectAgnesCharacterSheetLayout(fs.readFileSync(abs))
  } catch (err) {
    logTaskWarn('ImageTask', 'agnes-sheet-detect-failed', { id, error: (err as Error).message })
    return false
  }

  if (!verdict.isSheet) {
    logTaskProgress('ImageTask', 'agnes-sheet-ok', {
      id,
      score: verdict.score,
      reason: verdict.reason,
    })
    return false
  }

  const prevRetry = parseAgnesSheetRetryCount(record.errorMsg)
  if (prevRetry >= AGNES_SHEET_RETRY_MAX) {
    logTaskWarn('ImageTask', 'agnes-sheet-retry-exhausted', {
      id,
      prevRetry,
      score: verdict.score,
      reason: verdict.reason,
      hint: '仍像设定表，保留成图交人工处理',
    })
    return false
  }

  const nextRetry = prevRetry + 1

  // face-crop 仍易出贴纸：一检出设定表/白底宫格就直接去掉参考图纯文生
  const nextRefs: string[] = []

  logTaskWarn('ImageTask', 'agnes-sheet-retry', {
    id,
    nextRetry,
    score: verdict.score,
    reason: verdict.reason,
    nextRefCount: nextRefs.length,
    hint: 'drop all refs → text-only storyboard',
  })

  try {
    deleteUniqueStaticFiles(imagePathsToDelete(localPath))
  } catch { /* ignore */ }

  db.update(schema.imageGenerations)
    .set({
      status: 'processing',
      imageUrl: null,
      localPath: null,
      taskId: null,
      referenceImages: nextRefs.length ? JSON.stringify(nextRefs) : null,
      errorMsg: formatAgnesSheetRetryError(nextRetry, verdict.reason),
      updatedAt: now(),
    })
    .where(eq(schema.imageGenerations.id, id))
    .run()

  // 勿在当前 Agnes 队列槽内 await 重试（concurrency=1 会死锁）；等本任务释放槽位后再入队
  const useQueue = config.provider.toLowerCase() === 'agnes'
    || isAgnesImageModel(record.model || config.model)
  setImmediate(() => {
    const run = () => processCloudImageGeneration(id, config)
    const p = useQueue
      ? runAgnesImageTask(`image-${id}-sheet-retry-${nextRetry}`, run)
      : run()
    p.catch((err: any) => {
      logTaskError('ImageTask', 'agnes-sheet-retry-failed', { id, error: err?.message || String(err) })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: err?.message || String(err), updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
    })
  })
  return true
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
  let localPath = await downloadFile(imageUrl, 'images')
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  if (record && isAgnesStoryboardRecord(record)) {
    const config = resolveImageGenerationConfig({ model: record.model || undefined })
    const retried = await maybeRetryAgnesCharacterSheet(id, localPath, config)
    if (retried) return
  }

  if (record) localPath = await maybeOverlayNovelComicQuadText(record, localPath)

  db.update(schema.imageGenerations)
    .set({
      imageUrl,
      localPath,
      status: 'completed',
      errorMsg: null,
      updatedAt: now(),
    })
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
  if (record?.propId) {
    db.update(schema.props).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.props.id, record.propId)).run()
  }
}

async function handleImageCompleteBase64(id: number, provider: string, base64Data: string, mimeType: string) {
  let localPath = await saveBase64Image(base64Data, mimeType, 'images')
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  if (record && isAgnesStoryboardRecord(record)) {
    const config = resolveImageGenerationConfig({ model: record.model || undefined })
    const retried = await maybeRetryAgnesCharacterSheet(id, localPath, config)
    if (retried) return
  }

  if (record) localPath = await maybeOverlayNovelComicQuadText(record, localPath)

  db.update(schema.imageGenerations)
    .set({
      localPath,
      status: 'completed',
      errorMsg: null,
      updatedAt: now(),
    })
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
  if (record?.propId) {
    db.update(schema.props).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.props.id, record.propId)).run()
  }
}
