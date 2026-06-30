import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { saveUploadedFile } from '../utils/storage.js'
import { isImageFile } from '../utils/shot-image-filename.js'
import { parseNarrationImageMeta } from './narration-image.js'
import { replaceStoryboardAssetOnUpdate } from './storyboard-asset-replace.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

export const SHOT_IMAGE_BATCH_MAX = 8

export type ShotImageBatchItem = {
  storyboardId: number
  buffer: ArrayBuffer
  fileName: string
}

export type ShotImageBatchResultItem = {
  storyboard_id: number
  ok: boolean
  path?: string
  reference_images?: string
  error?: string
}

export type ShotImageBatchResult = {
  ok: number
  failed: number
  results: ShotImageBatchResultItem[]
}

function applyUploadedShotImage(storyboardId: number, savedPath: string): string {
  const [storyboard] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, storyboardId))
    .all()
  if (!storyboard) throw new Error('镜头不存在')
  if (storyboard.deletedAt) throw new Error('镜头已删除')

  replaceStoryboardAssetOnUpdate(storyboard, 'composedImage', savedPath)

  const meta = parseNarrationImageMeta(storyboard.referenceImages)
  const referenceImages = JSON.stringify({
    ...meta,
    narration_image_mode: 'new',
    narration_image_source: 'upload',
  })

  db.update(schema.storyboards)
    .set({
      composedImage: savedPath,
      referenceImages,
      updatedAt: now(),
    })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  return referenceImages
}

export async function batchApplyUploadedShotImages(items: ShotImageBatchItem[]): Promise<ShotImageBatchResult> {
  if (!items.length) {
    return { ok: 0, failed: 0, results: [] }
  }
  if (items.length > SHOT_IMAGE_BATCH_MAX) {
    throw new Error(`单次最多上传 ${SHOT_IMAGE_BATCH_MAX} 张`)
  }

  logTaskStart('ShotImageBatchUpload', 'batch', {
    count: items.length,
    storyboardIds: items.map(item => item.storyboardId),
  })

  const results: ShotImageBatchResultItem[] = []
  let ok = 0
  let failed = 0

  for (const item of items) {
    const storyboardId = Number(item.storyboardId)
    if (!storyboardId) {
      failed++
      results.push({ storyboard_id: item.storyboardId, ok: false, error: '无效的 storyboard_id' })
      continue
    }
    if (!isImageFile(item.fileName)) {
      failed++
      results.push({ storyboard_id: storyboardId, ok: false, error: '仅支持 png / jpg / jpeg / webp / gif' })
      continue
    }

    try {
      const savedPath = await saveUploadedFile(item.buffer, 'uploads', item.fileName)
      const referenceImages = applyUploadedShotImage(storyboardId, savedPath)
      ok++
      results.push({
        storyboard_id: storyboardId,
        ok: true,
        path: savedPath,
        reference_images: referenceImages,
      })
    } catch (err: any) {
      failed++
      const message = String(err?.message || err || '上传失败')
      results.push({ storyboard_id: storyboardId, ok: false, error: message })
      logTaskError('ShotImageBatchUpload', 'item-failed', { storyboardId, error: message })
    }
  }

  logTaskSuccess('ShotImageBatchUpload', 'batch-done', { ok, failed })
  return { ok, failed, results }
}
