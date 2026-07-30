/**
 * GPT-SoVITS 本地音色克隆 TTS
 * REST API: python api_v2.py -a 127.0.0.1 -p 9880
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(PROJECT_ROOT, 'data/static')

const GPT_SOVITS_BASE_URL = (process.env.GPT_SOVITS_BASE_URL || LOCAL_COMIC_ENV.gptsovitsBaseUrl).replace(/\/$/, '')
const GPT_SOVITS_REF_ROOT = process.env.GPT_SOVITS_REF_ROOT
  || path.resolve(PROJECT_ROOT, 'data/gptsovits-refs')
const GPT_SOVITS_VOICES_FILE = process.env.GPT_SOVITS_VOICES_FILE
  || path.resolve(PROJECT_ROOT, 'data/gptsovits/voices.json')
const GPT_SOVITS_TIMEOUT_MS = Number(process.env.GPT_SOVITS_TIMEOUT_MS || 600_000)
const GPT_SOVITS_HEALTH_TIMEOUT_MS = Number(process.env.GPT_SOVITS_HEALTH_TIMEOUT_MS || 8_000)
const GPT_SOVITS_CONCURRENCY = Math.max(1, Number(process.env.GPT_SOVITS_CONCURRENCY || 1))

export const GSV_VOICE_PREFIX = 'gsv:'

export interface GptSovitsVoice {
  voice_id: string
  voice_name: string
  ref_audio_path: string
  prompt_text?: string
  prompt_lang?: string
  language?: string
  description?: string[]
  gpt_weights?: string
  sovits_weights?: string
  text_split_method?: string
}

export interface GptSovitsHealth {
  ok: boolean
  base_url?: string
  ref_root?: string
  voice_count?: number
  error?: string
}

interface GptSovitsVoiceCatalog {
  voices: GptSovitsVoice[]
}

let gptSovitsActive = 0
const gptSovitsQueue: Array<() => void> = []

function gptSovitsUrl(pathname: string) {
  return `${GPT_SOVITS_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

async function acquireGptSovitsSlot() {
  if (gptSovitsActive < GPT_SOVITS_CONCURRENCY) {
    gptSovitsActive++
    return
  }
  await new Promise<void>(resolve => gptSovitsQueue.push(resolve))
  gptSovitsActive++
}

function releaseGptSovitsSlot() {
  gptSovitsActive = Math.max(0, gptSovitsActive - 1)
  const next = gptSovitsQueue.shift()
  if (next) next()
}

function ensureVoiceCatalogFile() {
  const dir = path.dirname(GPT_SOVITS_VOICES_FILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(GPT_SOVITS_REF_ROOT, { recursive: true })
  if (!fs.existsSync(GPT_SOVITS_VOICES_FILE)) {
    fs.writeFileSync(GPT_SOVITS_VOICES_FILE, JSON.stringify({ voices: [] }, null, 2), 'utf8')
  }
}

function readVoiceCatalog(): GptSovitsVoiceCatalog {
  ensureVoiceCatalogFile()
  try {
    const raw = fs.readFileSync(GPT_SOVITS_VOICES_FILE, 'utf8')
    const parsed = JSON.parse(raw) as GptSovitsVoiceCatalog
    return { voices: Array.isArray(parsed.voices) ? parsed.voices : [] }
  } catch {
    return { voices: [] }
  }
}

function writeVoiceCatalog(catalog: GptSovitsVoiceCatalog) {
  ensureVoiceCatalogFile()
  fs.writeFileSync(GPT_SOVITS_VOICES_FILE, JSON.stringify(catalog, null, 2), 'utf8')
}

export function parseGptSovitsVoiceRef(voiceId?: string | null): string | null {
  const raw = String(voiceId || '').trim()
  if (!raw.startsWith(GSV_VOICE_PREFIX)) return null
  const id = raw.slice(GSV_VOICE_PREFIX.length).trim()
  return id || null
}

export function toGptSovitsVoiceRef(voiceId: string) {
  const id = String(voiceId || '').trim()
  if (!id) throw new Error('GPT-SoVITS 音色 ID 为空')
  return id.startsWith(GSV_VOICE_PREFIX) ? id : `${GSV_VOICE_PREFIX}${id}`
}

export function resolveGptSovitsRefAudioPath(refPath: string): string {
  const raw = String(refPath || '').trim()
  if (!raw) throw new Error('参考音频路径为空')
  if (path.isAbsolute(raw)) return raw
  return path.resolve(GPT_SOVITS_REF_ROOT, raw)
}

export function formatGptSovitsError(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return 'GPT-SoVITS 合成失败'
  try {
    const parsed = JSON.parse(text)
    const detail = String(parsed?.message || parsed?.detail || parsed?.Exception || '').trim()
    if (detail) return formatGptSovitsError(detail)
  } catch { /* plain text */ }
  if (/ECONNREFUSED|fetch failed|Failed to fetch|network/i.test(text)) {
    return `GPT-SoVITS 未启动或无法连接（${GPT_SOVITS_BASE_URL}）。请先运行 scripts/start-gpt-sovits.ps1`
  }
  if (/ref_audio_path/i.test(text)) {
    return '参考音频路径无效。请确认 GPT-SoVITS 能访问该文件，且已在设置中配置参考音'
  }
  if (/timeout|timed out|aborted/i.test(text)) {
    return 'GPT-SoVITS 响应超时。首次加载模型较慢，可增大 GPT_SOVITS_TIMEOUT_MS 或减少并发'
  }
  if (/fast.langdetect|fast_langdetect/i.test(text)) {
    return 'GPT-SoVITS 缺少 fast_langdetect 缓存目录。请重新运行 scripts/setup-gpt-sovits.ps1 或 scripts/start-gpt-sovits.ps1（会自动创建），然后重启 api_v2.py'
  }
  return text
}

export function resolveGptSovitsVoiceDisplayName(voiceId?: string | null): string | null {
  const id = parseGptSovitsVoiceRef(voiceId) || String(voiceId || '').trim()
  if (!id) return null
  const voice = readVoiceCatalog().voices.find(v => v.voice_id === id)
  return voice?.voice_name || null
}

export async function checkGptSovitsHealth(): Promise<GptSovitsHealth> {
  const catalog = readVoiceCatalog()
  const base = {
    base_url: GPT_SOVITS_BASE_URL,
    ref_root: GPT_SOVITS_REF_ROOT,
    voice_count: catalog.voices.length,
  }
  try {
    const resp = await fetch(gptSovitsUrl('/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(GPT_SOVITS_HEALTH_TIMEOUT_MS),
    })
    // 400 = 服务在线但参数不全；200 = 极少见空请求成功
    if (resp.status === 400 || resp.status === 200 || resp.status === 422) {
      return { ok: true, ...base }
    }
    const errText = await resp.text()
    return { ok: false, ...base, error: formatGptSovitsError(errText || `HTTP ${resp.status}`) }
  } catch (err: any) {
    return { ok: false, ...base, error: formatGptSovitsError(err.message) }
  }
}

export async function listGptSovitsVoices(): Promise<GptSovitsVoice[]> {
  return readVoiceCatalog().voices
}

export async function getGptSovitsVoice(voiceId: string): Promise<GptSovitsVoice | null> {
  const id = parseGptSovitsVoiceRef(voiceId) || String(voiceId || '').trim()
  if (!id) return null
  return readVoiceCatalog().voices.find(v => v.voice_id === id) || null
}

export async function upsertGptSovitsVoice(input: Partial<GptSovitsVoice> & { voice_id: string }): Promise<GptSovitsVoice> {
  const voiceId = String(input.voice_id || '').trim().replace(/^gsv:/i, '')
  if (!voiceId) throw new Error('voice_id 不能为空')
  const refAudio = String(input.ref_audio_path || '').trim()
  if (!refAudio) throw new Error('ref_audio_path 不能为空')

  const voice: GptSovitsVoice = {
    voice_id: voiceId,
    voice_name: String(input.voice_name || voiceId).trim() || voiceId,
    ref_audio_path: refAudio,
    prompt_text: String(input.prompt_text || '').trim(),
    prompt_lang: String(input.prompt_lang || 'zh').trim() || 'zh',
    language: String(input.language || '中文').trim() || '中文',
    description: Array.isArray(input.description) ? input.description : [],
    gpt_weights: input.gpt_weights ? String(input.gpt_weights).trim() : undefined,
    sovits_weights: input.sovits_weights ? String(input.sovits_weights).trim() : undefined,
    text_split_method: input.text_split_method ? String(input.text_split_method).trim() : 'cut5',
  }

  const catalog = readVoiceCatalog()
  const idx = catalog.voices.findIndex(v => v.voice_id === voiceId)
  if (idx >= 0) catalog.voices[idx] = { ...catalog.voices[idx], ...voice }
  else catalog.voices.push(voice)
  writeVoiceCatalog(catalog)
  return voice
}

export async function deleteGptSovitsVoice(voiceId: string): Promise<boolean> {
  const id = parseGptSovitsVoiceRef(voiceId) || String(voiceId || '').trim()
  const catalog = readVoiceCatalog()
  const next = catalog.voices.filter(v => v.voice_id !== id)
  if (next.length === catalog.voices.length) return false
  writeVoiceCatalog({ voices: next })
  return true
}

export async function saveGptSovitsRefAudio(buffer: Buffer, fileName: string): Promise<string> {
  ensureVoiceCatalogFile()
  const safeName = String(fileName || 'ref.wav').replace(/[^\w.\-()\u4e00-\u9fff]/g, '_')
  const ext = path.extname(safeName).toLowerCase()
  if (!['.wav', '.mp3', '.flac', '.ogg', '.m4a'].includes(ext)) {
    throw new Error('参考音频仅支持 wav / mp3 / flac / ogg / m4a')
  }
  const filename = `${Date.now()}-${uuid().slice(0, 8)}${ext}`
  const abs = path.join(GPT_SOVITS_REF_ROOT, filename)
  fs.writeFileSync(abs, buffer)
  return abs
}

async function maybeSwitchGptSovitsWeights(voice: GptSovitsVoice) {
  if (voice.gpt_weights) {
    const resp = await fetch(
      gptSovitsUrl(`/set_gpt_weights?weights_path=${encodeURIComponent(voice.gpt_weights)}`),
      { signal: AbortSignal.timeout(120_000) },
    )
    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(formatGptSovitsError(errText || `切换 GPT 权重失败 HTTP ${resp.status}`))
    }
  }
  if (voice.sovits_weights) {
    const resp = await fetch(
      gptSovitsUrl(`/set_sovits_weights?weights_path=${encodeURIComponent(voice.sovits_weights)}`),
      { signal: AbortSignal.timeout(120_000) },
    )
    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(formatGptSovitsError(errText || `切换 SoVITS 权重失败 HTTP ${resp.status}`))
    }
  }
}

export async function resolveGptSovitsVoiceId(voiceId?: string | null): Promise<string> {
  const raw = String(voiceId || '').trim()
  const id = parseGptSovitsVoiceRef(raw) || raw
  if (!id) throw new Error('未选择 GPT-SoVITS 音色')
  const voice = await getGptSovitsVoice(id)
  if (!voice) throw new Error(`GPT-SoVITS 音色不存在：${id}`)
  return id
}

export async function generateGptSovitsTTS(
  text: string,
  voiceId: string,
  speed?: number | null,
): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('配音文本为空')

  const health = await checkGptSovitsHealth()
  if (!health.ok) {
    throw new Error(health.error || 'GPT-SoVITS 未运行，请先启动 api_v2.py（默认 http://127.0.0.1:9880）')
  }

  const resolvedId = await resolveGptSovitsVoiceId(voiceId)
  const voice = await getGptSovitsVoice(resolvedId)
  if (!voice) throw new Error(`GPT-SoVITS 音色不存在：${resolvedId}`)

  const refAudioPath = resolveGptSovitsRefAudioPath(voice.ref_audio_path)
  if (!fs.existsSync(refAudioPath)) {
    throw new Error(`参考音频不存在：${refAudioPath}。请上传参考音或检查 GPT_SOVITS_REF_ROOT`)
  }

  const speedFactor = Math.min(2, Math.max(0.5, Number(speed) || 1))

  logTaskStart('AudioTask', 'gptsovits-generate', {
    voiceId: resolvedId,
    refAudioPath,
    speedFactor,
    textPreview: trimmed.slice(0, 50),
    textLength: trimmed.length,
  })

  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.wav`
  const filePath = path.join(audioDir, filename)

  await acquireGptSovitsSlot()
  try {
    await maybeSwitchGptSovitsWeights(voice)

    const payload = {
      text: trimmed,
      text_lang: 'zh',
      ref_audio_path: refAudioPath,
      prompt_text: voice.prompt_text || '',
      prompt_lang: voice.prompt_lang || 'zh',
      text_split_method: voice.text_split_method || 'cut5',
      batch_size: 1,
      speed_factor: speedFactor,
      streaming_mode: false,
      media_type: 'wav',
      parallel_infer: true,
    }

    logTaskProgress('AudioTask', 'gptsovits-request', { voiceId: resolvedId, speedFactor })
    const resp = await fetch(gptSovitsUrl('/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GPT_SOVITS_TIMEOUT_MS),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(formatGptSovitsError(errText || `GPT-SoVITS HTTP ${resp.status}`))
    }

    const contentType = resp.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const errJson = await resp.json().catch(() => ({})) as Record<string, unknown>
      throw new Error(formatGptSovitsError(String(errJson.message || errJson.detail || 'GPT-SoVITS 返回错误')))
    }

    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length < 44) {
      throw new Error('GPT-SoVITS 返回的音频为空')
    }

    fs.writeFileSync(filePath, buffer)
    const relativePath = `static/audio/${filename}`
    logTaskSuccess('AudioTask', 'gptsovits-saved', {
      voiceId: resolvedId,
      path: relativePath,
      bytes: buffer.length,
    })
    return relativePath
  } catch (err: any) {
    logTaskError('AudioTask', 'gptsovits-generate', { voiceId: resolvedId, error: err.message })
    throw new Error(formatGptSovitsError(err.message))
  } finally {
    releaseGptSovitsSlot()
  }
}

export function getGptSovitsConfigSummary() {
  return {
    base_url: GPT_SOVITS_BASE_URL,
    ref_root: GPT_SOVITS_REF_ROOT,
    voices_file: GPT_SOVITS_VOICES_FILE,
  }
}
