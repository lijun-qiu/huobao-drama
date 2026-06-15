/**
 * 可灵 kling-image-recognize — 分析定妆图，提取外貌/场景描述（辅助定妆参考，非生图模型）
 * 4022: POST /v1/videos/image-recognize
 * Kling: POST /kling/v1/videos/image-recognize
 */
import { getActiveConfig, getConfigById, type AIConfig } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import { readImageAsCompressedDataUrl } from '../utils/storage.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

export const KLING_IMAGE_RECOGNIZE_MODEL = 'kling-image-recognize'

function is4022Gateway(baseUrl: string) {
  const base = String(baseUrl || '').toLowerCase()
  return base.includes('4022543') || base.includes('4022')
}

function buildSubmitUrl(config: AIConfig) {
  const base = config.baseUrl.replace(/\/+$/, '')
  if (is4022Gateway(base)) return `${base}/v1/videos/image-recognize`
  return joinProviderUrl(config.baseUrl, '/kling/v1', '/videos/image-recognize')
}

function buildPollCandidates(config: AIConfig, taskId: string): string[] {
  const base = config.baseUrl.replace(/\/+$/, '')
  if (is4022Gateway(base)) {
    return [
      `${base}/v1/videos/image-recognize/${taskId}`,
      `${base}/v1/tasks/${taskId}`,
      joinProviderUrl(base, '/kling/v1', `/videos/image-recognize/${taskId}`),
      joinProviderUrl(base, '/kling/v1', `/images/generations/${taskId}`),
    ]
  }
  return [
    joinProviderUrl(config.baseUrl, '/kling/v1', `/videos/image-recognize/${taskId}`),
    joinProviderUrl(config.baseUrl, '/kling/v1', `/images/generations/${taskId}`),
  ]
}

async function resolveImageInput(imagePath: string): Promise<string> {
  const trimmed = String(imagePath || '').trim()
  if (!trimmed) throw new Error('image path is empty')
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed
  }
  const local = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  return readImageAsCompressedDataUrl(local, { maxWidth: 1024, maxHeight: 1024, quality: 78 })
}

function unwrapData(result: Record<string, unknown>) {
  return (result?.data ?? result) as Record<string, unknown>
}

function parseTaskId(result: Record<string, unknown>): string | null {
  const data = unwrapData(result)
  const raw = data?.task_id || data?.taskId || result?.task_id || result?.taskId || data?.id
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (typeof raw === 'number') return String(raw)
  return null
}

function isDoneStatus(status: string) {
  const s = status.toLowerCase()
  return ['succeed', 'succeeded', 'success', 'completed', 'done', 'finish', 'finished'].includes(s)
}

function isFailedStatus(status: string) {
  const s = status.toLowerCase()
  return ['failed', 'error', 'failure', 'cancelled', 'canceled'].includes(s)
}

const TEXT_KEYS = [
  'description', 'recognition', 'recognize_result', 'recognizeResult',
  'text', 'content', 'result', 'summary', 'caption', 'analysis',
  'appearance', 'prompt', 'message',
]

function collectText(value: unknown, depth = 0, bucket: string[] = []): string[] {
  if (depth > 8 || value == null) return bucket
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.length >= 12 && !/^https?:\/\//i.test(text) && !text.startsWith('data:image/')) {
      bucket.push(text)
    }
    return bucket
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, depth + 1, bucket)
    return bucket
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    for (const key of TEXT_KEYS) {
      if (key in row) collectText(row[key], depth + 1, bucket)
    }
    if (row.task_result) collectText(row.task_result, depth + 1, bucket)
    if (row.output) collectText(row.output, depth + 1, bucket)
    if (row.result) collectText(row.result, depth + 1, bucket)
  }
  return bucket
}

function extractRecognitionText(result: unknown): string {
  const texts = collectText(result)
  const unique = [...new Set(texts)]
  const best = unique.sort((a, b) => b.length - a.length)[0]
  return best?.trim() || ''
}

async function pollRecognition(config: AIConfig, taskId: string): Promise<string> {
  const headers = { Authorization: `Bearer ${config.apiKey}` }
  const urls = buildPollCandidates(config, taskId)

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    for (const url of urls) {
      try {
        const resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(30_000) })
        if (!resp.ok) continue
        const json = await resp.json() as Record<string, unknown>
        const data = unwrapData(json)
        const status = String(data?.task_status || data?.status || '').toLowerCase()
        const text = extractRecognitionText(json)
        if (text && (isDoneStatus(status) || !status)) return text
        if (isDoneStatus(status) && text) return text
        if (isFailedStatus(status)) {
          throw new Error(String(data?.task_status_msg || data?.error || data?.message || '识图任务失败'))
        }
      } catch (err) {
        if ((err as Error).message.includes('识图任务失败')) throw err
        logTaskWarn('KlingRecognize', 'poll-retry', { taskId, url, error: (err as Error).message })
      }
    }
  }
  throw new Error('识图轮询超时')
}

export async function recognizePortraitImage(imagePath: string, configId?: number): Promise<string> {
  const config = configId ? getConfigById(configId) : getActiveConfig('image')
  if (!config?.apiKey) throw new Error('No active image AI config')

  const image = await resolveImageInput(imagePath)
  const url = buildSubmitUrl(config)
  const body: Record<string, unknown> = { image }
  if (is4022Gateway(config.baseUrl)) {
    body.model = KLING_IMAGE_RECOGNIZE_MODEL
  }

  logTaskProgress('KlingRecognize', 'submit', { url: url.replace(/\/\/[^/]+/, '//***') })
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  const rawText = await resp.text()
  if (!resp.ok) {
    throw new Error(`识图请求失败 ${resp.status}: ${rawText.slice(0, 300)}`)
  }

  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(rawText)
  } catch {
    if (rawText.trim().length >= 12) return rawText.trim()
    throw new Error('识图响应无法解析')
  }

  const syncText = extractRecognitionText(json)
  const taskId = parseTaskId(json)
  if (syncText && !taskId) {
    logTaskSuccess('KlingRecognize', 'sync-complete', { length: syncText.length })
    return syncText
  }
  if (syncText && taskId && isDoneStatus(String(unwrapData(json)?.task_status || ''))) {
    return syncText
  }
  if (!taskId) {
    if (syncText) return syncText
    throw new Error('识图响应缺少 task_id 与描述文本')
  }

  logTaskProgress('KlingRecognize', 'poll-start', { taskId })
  const polled = await pollRecognition(config, taskId)
  logTaskSuccess('KlingRecognize', 'poll-complete', { taskId, length: polled.length })
  return polled
}

export function getRecognizeConfig(configId?: number): AIConfig {
  const config = configId ? getConfigById(configId) : getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')
  return config
}
