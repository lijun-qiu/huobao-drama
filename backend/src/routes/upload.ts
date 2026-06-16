import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { saveUploadedFile } from '../utils/storage.js'

const app = new Hono()

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
