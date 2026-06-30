import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { saveUploadedFile } from '../utils/storage.js'
import { batchApplyUploadedShotImages, SHOT_IMAGE_BATCH_MAX } from '../services/shot-image-batch-upload.js'

const app = new Hono()

function parseStoryboardIds(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map(id => Number(id))
  } catch {
    return raw.split(',').map(part => Number(part.trim())).filter(Boolean)
  }
}

function collectUploadFiles(raw: unknown): File[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((item): item is File => item instanceof File)
  return raw instanceof File ? [raw] : []
}

// POST /upload/image
app.post('/image', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }

  const buffer = await file.arrayBuffer()
  const path = await saveUploadedFile(buffer, 'uploads', file.name)
  return success(c, { url: `/${path}`, path })
})

// POST /upload/shot-images-batch — 批量上传配图并绑定镜头（单次最多 8 张）
app.post('/shot-images-batch', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const files = collectUploadFiles(body['files'])
  const storyboardIds = parseStoryboardIds(body['storyboard_ids'])

  if (!files.length) return badRequest(c, 'files is required')
  if (!storyboardIds?.length) return badRequest(c, 'storyboard_ids is required')
  if (files.length > SHOT_IMAGE_BATCH_MAX) {
    return badRequest(c, `单次最多上传 ${SHOT_IMAGE_BATCH_MAX} 张`)
  }
  if (files.length !== storyboardIds.length) {
    return badRequest(c, 'storyboard_ids 数量须与 files 一致')
  }

  try {
    const items = await Promise.all(files.map(async (file, index) => ({
      storyboardId: storyboardIds[index],
      buffer: await file.arrayBuffer(),
      fileName: file.name || `shot-${storyboardIds[index]}.png`,
    })))
    const result = await batchApplyUploadedShotImages(items)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /upload/audio — mp3/wav/m4a
app.post('/audio', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }

  const name = file.name || 'audio.mp3'
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg'].includes(ext)) {
    return badRequest(c, '仅支持 mp3 / wav / m4a / aac / ogg')
  }

  const buffer = await file.arrayBuffer()
  const saved = await saveUploadedFile(buffer, 'uploads/audio', name)
  return success(c, { url: `/${saved}`, path: saved })
})

export default app
