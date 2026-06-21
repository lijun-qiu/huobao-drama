import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { getAbsolutePath } from '../utils/storage.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { parseNarrationImageMeta, sortStoryboardsByOrder } from './narration-image.js'

/** 右下角水印区：宽 1/8、高 1/18 */
export const NARRATION_IMAGE_WATERMARK_WIDTH_RATIO = 1 / 8
export const NARRATION_IMAGE_WATERMARK_HEIGHT_RATIO = 1 / 18

const WM_CROP_SUFFIX = '-wm9'
const CORNER_BLUR_SIGMA = 22

function isAlreadyWatermarkCroppedPath(relativePath: string): boolean {
  const base = path.basename(String(relativePath || '').replace(/^\//, ''))
  return base.includes(WM_CROP_SUFFIX)
}

function buildCroppedRelativePath(normalized: string): string {
  const dir = path.posix.dirname(normalized.replace(/\\/g, '/'))
  const ext = path.extname(normalized)
  const base = path.basename(normalized, ext)
  const croppedName = `${base}${WM_CROP_SUFFIX}${ext || '.png'}`
  return dir && dir !== '.' ? `${dir}/${croppedName}` : croppedName
}

/** 由 -wm9 路径还原为处理前原图路径 */
export function buildOriginalRelativePathFromWmCropped(croppedRel: string): string | null {
  const normalized = String(croppedRel || '').trim().replace(/^\//, '')
  if (!isAlreadyWatermarkCroppedPath(normalized)) return null

  const ext = path.extname(normalized)
  const base = path.basename(normalized, ext)
  if (!base.endsWith(WM_CROP_SUFFIX)) return null

  const originalName = `${base.slice(0, base.length - WM_CROP_SUFFIX.length)}${ext || '.png'}`
  const dir = path.posix.dirname(normalized.replace(/\\/g, '/'))
  return dir && dir !== '.' ? `${dir}/${originalName}` : originalName
}

function clearWmCropMeta(referenceImages: string | null | undefined): string | undefined {
  if (!referenceImages) return undefined
  try {
    const raw = typeof referenceImages === 'string' ? JSON.parse(referenceImages) : referenceImages
    if (!raw || typeof raw !== 'object') return undefined
    const parsed = { ...raw as Record<string, unknown> }
    if (!parsed.wm_crop_applied) return undefined
    delete parsed.wm_crop_applied
    delete parsed.wm_crop_mode
    return JSON.stringify(parsed)
  } catch {
    return undefined
  }
}

function hasWmCropApplied(referenceImages: string | null | undefined): boolean {
  if (!referenceImages) return false
  try {
    const raw = typeof referenceImages === 'string' ? JSON.parse(referenceImages) : referenceImages
    return !!(raw && typeof raw === 'object' && (raw as Record<string, unknown>).wm_crop_applied)
  } catch {
    return false
  }
}

function normalizeImageRel(relativePath: string): string {
  return String(relativePath || '').trim().replace(/^\//, '')
}

/** 从配图生成记录中找回未去水印的原图路径 */
function findGenerationOriginalPath(storyboardId: number, avoidPaths: Set<string>): string | null {
  const gens = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.storyboardId, storyboardId))
    .all()
    .filter(g => g.status === 'completed' && g.localPath)
    .sort((a, b) => b.id - a.id)

  for (const gen of gens) {
    const rel = normalizeImageRel(String(gen.localPath))
    if (!rel || avoidPaths.has(rel) || isAlreadyWatermarkCroppedPath(rel)) continue
    const abs = getAbsolutePath(rel)
    if (fs.existsSync(abs)) return rel
  }
  return null
}

function resolveRestoreOriginalPath(
  currentRel: string,
  storyboardIds: number[],
): { originalRel: string | null; source: 'sibling' | 'generation' | null } {
  const normalized = normalizeImageRel(currentRel)
  if (!normalized) return { originalRel: null, source: null }

  const avoid = new Set<string>([normalized])
  const siblingRel = buildOriginalRelativePathFromWmCropped(normalized)
  if (siblingRel) {
    avoid.add(siblingRel)
    const siblingAbs = getAbsolutePath(siblingRel)
    if (fs.existsSync(siblingAbs)) {
      return { originalRel: siblingRel, source: 'sibling' }
    }
  }

  for (const sbId of storyboardIds) {
    const genRel = findGenerationOriginalPath(sbId, avoid)
    if (genRel) return { originalRel: genRel, source: 'generation' }
  }

  return { originalRel: null, source: null }
}

function resolveCornerWatermarkRect(width: number, height: number) {
  const wmWidth = Math.max(8, Math.floor(width * NARRATION_IMAGE_WATERMARK_WIDTH_RATIO))
  const wmHeight = Math.max(8, Math.floor(height * NARRATION_IMAGE_WATERMARK_HEIGHT_RATIO))
  if (wmWidth >= width || wmHeight >= height) {
    throw new Error('图片尺寸过小，无法处理右下角水印区')
  }
  return {
    left: width - wmWidth,
    top: height - wmHeight,
    width: wmWidth,
    height: wmHeight,
  }
}

/** 用紧邻水印区上方的像素块覆盖（无上方块时尝试左侧，再不行则强模糊） */
async function buildCornerWatermarkPatch(
  abs: string,
  rect: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  const { left, top, width: wmWidth, height: wmHeight } = rect
  const cloneTop = top - wmHeight
  if (cloneTop >= 0) {
    return sharp(abs)
      .extract({ left, top: cloneTop, width: wmWidth, height: wmHeight })
      .toBuffer()
  }
  const cloneLeft = left - wmWidth
  if (cloneLeft >= 0) {
    return sharp(abs)
      .extract({ left: cloneLeft, top, width: wmWidth, height: wmHeight })
      .toBuffer()
  }
  return sharp(abs)
    .extract({ left, top, width: wmWidth, height: wmHeight })
    .blur(CORNER_BLUR_SIGMA)
    .toBuffer()
}

async function writeImageWithCornerWatermarkRemoved(abs: string, outAbs: string): Promise<void> {
  const meta = await sharp(abs).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) throw new Error('无法读取图片尺寸')

  const rect = resolveCornerWatermarkRect(width, height)
  const patch = await buildCornerWatermarkPatch(abs, rect)
  const composited = sharp(abs).composite([{ input: patch, left: rect.left, top: rect.top }])

  const format = meta.format
  if (format === 'png') {
    await composited.png().toFile(outAbs)
  } else if (format === 'webp') {
    await composited.webp({ quality: 95 }).toFile(outAbs)
  } else {
    await composited.jpeg({ quality: 95, mozjpeg: true }).toFile(outAbs)
  }
}

/** 去除右下角水印区（宽 1/8 × 高 1/18），输出新文件 */
export async function cropImageRemoveBottomWatermark(relativePath: string): Promise<string> {
  const normalized = String(relativePath || '').trim().replace(/^\//, '')
  if (!normalized) throw new Error('图片路径为空')
  if (isAlreadyWatermarkCroppedPath(normalized)) return normalized

  const abs = getAbsolutePath(normalized)
  if (!fs.existsSync(abs)) throw new Error('图片文件不存在')

  const newRel = buildCroppedRelativePath(normalized)
  const outAbs = getAbsolutePath(newRel)
  fs.mkdirSync(path.dirname(outAbs), { recursive: true })

  await writeImageWithCornerWatermarkRemoved(abs, outAbs)

  return newRel
}

function mergeWmCropMeta(referenceImages: string | null | undefined): string {
  let parsed: Record<string, unknown> = {}
  if (referenceImages) {
    try {
      const raw = typeof referenceImages === 'string' ? JSON.parse(referenceImages) : referenceImages
      if (raw && typeof raw === 'object') parsed = { ...raw as Record<string, unknown> }
    } catch {
      parsed = {}
    }
  }
  parsed.wm_crop_applied = true
  parsed.wm_crop_mode = 'corner'
  return JSON.stringify(parsed)
}

export async function cropEpisodeNarrationImageWatermarks(episodeId: number): Promise<{
  cropped: number
  skipped: number
  failed: number
  storyboards_reset: number
  errors: string[]
}> {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )

  const pathToStoryboardIds = new Map<string, number[]>()
  for (const sb of storyboards) {
    const rel = String(sb.composedImage || '').trim().replace(/^\//, '')
    if (!rel) continue
    const ids = pathToStoryboardIds.get(rel) || []
    ids.push(sb.id)
    pathToStoryboardIds.set(rel, ids)
  }

  if (!pathToStoryboardIds.size) {
    throw new Error('本集暂无配图文件')
  }

  logTaskStart('NarrationImageCrop', 'episode-crop', {
    episodeId,
    uniqueImages: pathToStoryboardIds.size,
    mode: 'corner-1/8x1/18',
  })

  let cropped = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []
  const pathMap = new Map<string, string>()

  for (const rel of pathToStoryboardIds.keys()) {
    if (isAlreadyWatermarkCroppedPath(rel)) {
      pathMap.set(rel, rel)
      skipped++
      continue
    }
    try {
      const newRel = await cropImageRemoveBottomWatermark(rel)
      pathMap.set(rel, newRel)
      cropped++
    } catch (err: any) {
      failed++
      const message = String(err?.message || err || '处理失败')
      errors.push(`${rel}: ${message}`)
      logTaskError('NarrationImageCrop', 'image-failed', { episodeId, path: rel, error: message })
    }
  }

  let storyboardsReset = 0
  const ts = now()
  for (const sb of storyboards) {
    const rel = String(sb.composedImage || '').trim().replace(/^\//, '')
    if (!rel) continue
    const mapped = pathMap.get(rel)
    if (!mapped || mapped === rel && !isAlreadyWatermarkCroppedPath(rel)) continue

    const updates: {
      composedImage: string
      composedVideoUrl: null
      referenceImages?: string
      updatedAt: string
    } = {
      composedImage: mapped,
      composedVideoUrl: null,
      updatedAt: ts,
    }

    const meta = parseNarrationImageMeta(sb.referenceImages)
    if (meta.narration_image_mode) {
      updates.referenceImages = mergeWmCropMeta(sb.referenceImages)
    }

    db.update(schema.storyboards)
      .set(updates)
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    storyboardsReset++
  }

  logTaskSuccess('NarrationImageCrop', 'episode-crop-done', {
    episodeId,
    cropped,
    skipped,
    failed,
    storyboardsReset,
  })

  return {
    cropped,
    skipped,
    failed,
    storyboards_reset: storyboardsReset,
    errors,
  }
}

/** 恢复为去水印前的原图（优先同名原图，其次配图生成记录） */
export async function restoreEpisodeNarrationImageWatermarks(episodeId: number): Promise<{
  restored: number
  skipped: number
  failed: number
  storyboards_reset: number
  from_generation: number
  errors: string[]
}> {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )

  const pathToStoryboardIds = new Map<string, number[]>()
  for (const sb of storyboards) {
    const rel = normalizeImageRel(String(sb.composedImage || ''))
    if (!rel) continue
    const wmProcessed = isAlreadyWatermarkCroppedPath(rel) || hasWmCropApplied(sb.referenceImages)
    if (!wmProcessed) continue
    const ids = pathToStoryboardIds.get(rel) || []
    ids.push(sb.id)
    pathToStoryboardIds.set(rel, ids)
  }

  if (!pathToStoryboardIds.size) {
    throw new Error('没有可恢复的水印处理配图（需已执行过去水印，或配图路径带 -wm9）')
  }

  logTaskStart('NarrationImageCrop', 'episode-restore', {
    episodeId,
    processedImages: pathToStoryboardIds.size,
  })

  let restored = 0
  let fromGeneration = 0
  const skipped = 0
  let failed = 0
  const errors: string[] = []
  const pathMap = new Map<string, string>()

  for (const [currentRel, sbIds] of pathToStoryboardIds) {
    const { originalRel, source } = resolveRestoreOriginalPath(currentRel, sbIds)
    if (!originalRel) {
      failed++
      errors.push(`${currentRel}: 找不到原图（同名文件与生成记录均不可用）`)
      continue
    }
    pathMap.set(currentRel, originalRel)
    restored++
    if (source === 'generation') fromGeneration++
  }

  let storyboardsReset = 0
  const ts = now()
  const croppedFilesToDelete = new Set<string>()

  for (const sb of storyboards) {
    const rel = String(sb.composedImage || '').trim().replace(/^\//, '')
    if (!rel || !pathMap.has(rel)) continue

    const originalRel = pathMap.get(rel)!
    croppedFilesToDelete.add(rel)

    const updates: {
      composedImage: string
      composedVideoUrl: null
      referenceImages?: string
      updatedAt: string
    } = {
      composedImage: originalRel,
      composedVideoUrl: null,
      updatedAt: ts,
    }

    const clearedMeta = clearWmCropMeta(sb.referenceImages)
    if (clearedMeta) updates.referenceImages = clearedMeta

    db.update(schema.storyboards)
      .set(updates)
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    storyboardsReset++
  }

  for (const croppedRel of croppedFilesToDelete) {
    if (!isAlreadyWatermarkCroppedPath(croppedRel)) continue
    const croppedAbs = getAbsolutePath(croppedRel)
    try {
      if (fs.existsSync(croppedAbs)) fs.unlinkSync(croppedAbs)
    } catch (err: any) {
      logTaskError('NarrationImageCrop', 'delete-cropped-file-failed', {
        episodeId,
        path: croppedRel,
        error: err?.message,
      })
    }
  }

  logTaskSuccess('NarrationImageCrop', 'episode-restore-done', {
    episodeId,
    restored,
    fromGeneration,
    skipped,
    failed,
    storyboardsReset,
  })

  if (!restored) {
    throw new Error(errors[0] || '未能恢复任何配图')
  }

  return {
    restored,
    skipped,
    failed,
    storyboards_reset: storyboardsReset,
    from_generation: fromGeneration,
    errors,
  }
}
