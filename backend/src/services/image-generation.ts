import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveBase64Image } from '../utils/storage.js'
import { getImageAdapter, resolveImageAdapter, resolveImageProvider } from './adapters/registry'
import type { AIConfig, ProviderRequest } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const ts = now()
  const config = params.configId
    ? getConfigById(params.configId)
    : getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')

  const model = params.model || config.model
  const provider = resolveImageProvider(config, model)

  const res = db.insert(schema.imageGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    prompt: params.prompt,
    model,
    provider,
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('ImageTask', 'enqueue', {
    id: lastId,
    provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model,
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

async function processImageGeneration(id: number, config: AIConfig) {
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]
  if (!record) return
  const adapter = resolveImageAdapter(config, record.model)

  try {
    logTaskProgress('ImageTask', 'build-request', {
      id,
      provider: adapter.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
    })

    // 使用 Adapter 构建请求
    const resolvedReferenceImages = await normalizeReferenceImages(record.referenceImages)
    const recordInput = {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      size: record.size,
      frameType: record.frameType,
      referenceImages: resolvedReferenceImages ? JSON.stringify(resolvedReferenceImages) : null,
    }

    const requests = (adapter as { buildGenerateRequestVariants?: (c: AIConfig, r: typeof recordInput) => ProviderRequest[] })
      .buildGenerateRequestVariants?.(config, recordInput)
      ?? [adapter.buildGenerateRequest(config, recordInput)]

    let lastError = 'Image generation failed'
    for (let attempt = 0; attempt < requests.length; attempt++) {
      const request = requests[attempt]
      const { url, method, body } = request
      const isFormData = request.bodyFormat === 'form-data'
      const headers = { ...request.headers }
      if (isFormData) delete headers['Content-Type']

      logTaskProgress('ImageTask', 'request', {
        id,
        provider: adapter.provider,
        method,
        url: redactUrl(url),
        model: record.model,
        attempt: attempt + 1,
        attempts: requests.length,
        bodyFormat: request.bodyFormat || 'json',
      })
      logTaskPayload('ImageTask', 'request payload', {
        id,
        method,
        url,
        headers,
        body: isFormData ? '[form-data]' : body,
      })

      const resp = await fetch(url, {
        method,
        headers,
        body: isFormData ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(600_000),
      })

      const responseText = await resp.text()
      if (!resp.ok) {
        lastError = `API error ${resp.status}: ${responseText.slice(0, 240)}`
        logTaskWarn('ImageTask', 'request-failed', { id, attempt: attempt + 1, error: lastError })
        continue
      }

      let result: any
      try {
        result = JSON.parse(responseText) as any
      } catch {
        lastError = `Invalid JSON response: ${responseText.slice(0, 240)}`
        logTaskWarn('ImageTask', 'invalid-json', { id, attempt: attempt + 1, error: lastError })
        continue
      }

      logTaskPayload('ImageTask', 'response payload', {
        id,
        provider: config.provider,
        attempt: attempt + 1,
        result,
      })

      try {
        const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

        if (!isAsync && imageUrl) {
          logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl, attempt: attempt + 1 })
          await handleImageComplete(id, config.provider, imageUrl)
          return
        }

        if (!isAsync && !imageUrl) {
          const b64 = adapter.extractImageBase64(result)
          if (b64) {
            logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: b64.mimeType, attempt: attempt + 1 })
            await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
            return
          }
          lastError = 'No image URL or base64 data in response'
          continue
        }

        db.update(schema.imageGenerations)
          .set({ taskId, status: 'processing', updatedAt: now() })
          .where(eq(schema.imageGenerations.id, id))
          .run()
        logTaskProgress('ImageTask', 'poll-start', { id, taskId, provider: config.provider, attempt: attempt + 1 })
        pollImageTask(id, config, taskId!)
        return
      } catch (err: any) {
        lastError = err.message || lastError
        logTaskWarn('ImageTask', 'parse-failed', { id, attempt: attempt + 1, error: lastError })
      }
    }

    throw new Error(lastError)
  } catch (err: any) {
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
  }
}

async function normalizeReferenceImages(raw: string | null | undefined): Promise<string[]> {
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

  const normalized = await Promise.all(deduped.map(async (value) => {
    if (value.startsWith('data:image/')) return value
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        return await readImageAsCompressedDataUrl(localPath, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        const resp = await fetch(value, { signal: AbortSignal.timeout(30_000) })
        if (!resp.ok) return null
        const mime = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
        const buf = Buffer.from(await resp.arrayBuffer())
        return `data:${mime};base64,${buf.toString('base64')}`
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-fetch-failed', { url: value, error: (err as Error).message })
        return null
      }
    }
    return value
  }))

  return normalized.filter((item): item is string => !!item).slice(0, 6)
}

async function pollImageTask(id: number, config: AIConfig, taskId: string) {
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const adapter = resolveImageAdapter(config, rows[0]?.model)
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
        // Gemini 可能返回 base64
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

async function markNarrationImageGenerated(storyboardId: number, frameType?: string | null) {
  if (frameType === 'first_frame' || frameType === 'last_frame') return
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb?.referenceImages) return
  try {
    const meta = JSON.parse(sb.referenceImages)
    if (meta && typeof meta === 'object' && meta.narration_image_mode) {
      db.update(schema.storyboards)
        .set({
          referenceImages: JSON.stringify({ ...meta, narration_image_source: 'generate' }),
          updatedAt: now(),
        })
        .where(eq(schema.storyboards.id, storyboardId))
        .run()
    }
  } catch { /* ignore */ }
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

  // 更新关联表
  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
    await markNarrationImageGenerated(record.storyboardId, record.frameType)
  }
  if (record?.characterId) {
    db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
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

  // 更新关联表
  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
    await markNarrationImageGenerated(record.storyboardId, record.frameType)
  }
  if (record?.characterId) {
    db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
  }
  if (record?.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }
}
