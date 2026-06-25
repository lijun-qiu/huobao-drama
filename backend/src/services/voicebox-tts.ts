/**
 * Voicebox 本地语音克隆 TTS
 * REST API: http://127.0.0.1:17493
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { resolveVoiceboxInstruct } from '../utils/voicebox-instruct.js'
import { DEFAULT_VOICEBOX_MODEL_SIZE, resolveVoiceboxModelSize, type VoiceboxModelSize } from '../utils/voicebox-model-size.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const VOICEBOX_BASE_URL = (process.env.VOICEBOX_BASE_URL || 'http://127.0.0.1:17493').replace(/\/$/, '')
const VOICEBOX_TIMEOUT_MS = Number(process.env.VOICEBOX_TIMEOUT_MS || 600_000)
const VOICEBOX_CONCURRENCY = Math.max(1, Number(process.env.VOICEBOX_CONCURRENCY || 3))

export interface VoiceboxProfile {
  id: string
  name: string
  description?: string
  language: string
  voice_type: string
  preset_engine?: string | null
  preset_voice_id?: string | null
  default_engine?: string | null
  sample_count?: number
  generation_count?: number
}

export interface VoiceboxHealth {
  ok: boolean
  status?: string
  model_loaded?: boolean
  backend_type?: string
  error?: string
  models?: VoiceboxModelStatus[]
}

export interface VoiceboxModelStatus {
  model_name: string
  display_name?: string
  downloaded?: boolean
  downloading?: boolean
  loaded?: boolean
}

const ENGINE_MODEL_CANDIDATES: Record<string, Array<{ modelName: string; size: VoiceboxModelSize }>> = {
  qwen: [
    { modelName: 'qwen-tts-0.6B', size: '0.6B' },
    { modelName: 'qwen-tts-1.7B', size: '1.7B' },
  ],
  qwen_custom_voice: [
    { modelName: 'qwen-custom-voice-0.6B', size: '0.6B' },
    { modelName: 'qwen-custom-voice-1.7B', size: '1.7B' },
  ],
  kokoro: [{ modelName: 'kokoro', size: '1.7B' }],
}

export { type VoiceboxModelSize, DEFAULT_VOICEBOX_MODEL_SIZE, resolveVoiceboxModelSize }

export async function fetchVoiceboxModelsStatus(): Promise<VoiceboxModelStatus[]> {
  try {
    const resp = await fetch(voiceboxUrl('/models/status'), { signal: AbortSignal.timeout(10_000) })
    if (!resp.ok) return []
    const data = await resp.json() as { models?: VoiceboxModelStatus[] }
    return data.models || []
  } catch {
    return []
  }
}


function resolveEngineModel(
  engine: string | undefined,
  models: VoiceboxModelStatus[],
  preferredSize: VoiceboxModelSize = DEFAULT_VOICEBOX_MODEL_SIZE,
): { modelSize?: VoiceboxModelSize; ready: boolean; hint?: string } {
  const key = engine || 'qwen'
  const candidates = ENGINE_MODEL_CANDIDATES[key]
  if (!candidates?.length) return { ready: true }

  const labels: Record<string, string> = {
    qwen_custom_voice: 'Qwen CustomVoice',
    qwen: 'Qwen TTS',
    kokoro: 'Kokoro',
  }
  const label = labels[key] || key
  const target = candidates.find(c => c.size === preferredSize) || candidates[0]
  const row = models.find(m => m.model_name === target.modelName)

  if (row?.downloaded || row?.loaded) {
    return { modelSize: target.size, ready: true }
  }
  if (row?.downloading) {
    return {
      ready: false,
      hint: `${row.display_name || row.model_name} 正在下载中，请在 Voicebox → Models 等待完成后再试`,
    }
  }

  return {
    ready: false,
    hint: `${label} ${target.size} 模型未下载，请在 Voicebox → Models 中下载；或先选用克隆音色`,
  }
}

export function formatVoiceboxError(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return 'Voicebox TTS 失败'
  try {
    const parsed = JSON.parse(text)
    const detail = String(parsed?.detail || parsed?.message || '').trim()
    if (detail) return formatVoiceboxError(detail)
  } catch { /* plain text */ }
  if (/not downloaded/i.test(text) && /1\.7B/i.test(text)) {
    return 'Voicebox 的 1.7B 模型尚未下载完成。请在 Voicebox → Models 中下载对应引擎模型，或先选用克隆音色试听'
  }
  if (/not downloaded/i.test(text)) {
    return 'Voicebox 对应模型尚未下载完成，请在 Voicebox → Models 中下载后再试'
  }
  if (/timeout|timed out|aborted due to timeout|fetch failed|ECONNREFUSED|ECONNRESET/i.test(text)) {
    return 'Voicebox 响应超时或未连接。预设 CustomVoice 首次生成需加载约 2.4GB 模型（约 3–10 分钟），请确认 Voicebox 已启动且勿并发多条；可在 Voicebox 内先试生成一次，或增大 VOICEBOX_TIMEOUT_MS'
  }
  if (text.startsWith('Voicebox TTS 失败:')) return text
  return text
}

let voiceboxActive = 0
const voiceboxQueue: Array<() => void> = []

async function acquireVoiceboxSlot() {
  if (voiceboxActive < VOICEBOX_CONCURRENCY) {
    voiceboxActive++
    return
  }
  await new Promise<void>(resolve => voiceboxQueue.push(resolve))
  voiceboxActive++
}

function releaseVoiceboxSlot() {
  voiceboxActive = Math.max(0, voiceboxActive - 1)
  const next = voiceboxQueue.shift()
  if (next) next()
}

function voiceboxUrl(pathname: string) {
  return `${VOICEBOX_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

export async function checkVoiceboxHealth(): Promise<VoiceboxHealth> {
  try {
    const resp = await fetch(voiceboxUrl('/health'), {
      signal: AbortSignal.timeout(5_000),
    })
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` }
    }
    const data = await resp.json() as Record<string, unknown>
    const models = await fetchVoiceboxModelsStatus()
    return {
      ok: data.status === 'healthy',
      status: String(data.status || ''),
      model_loaded: Boolean(data.model_loaded),
      backend_type: data.backend_type ? String(data.backend_type) : undefined,
      models,
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export interface VoiceboxPresetVoice {
  voice_id: string
  name: string
  gender?: string
  language?: string
}

const VOICEBOX_PROFILE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRESET_REF_PREFIX = 'preset:'

const QWEN_CUSTOM_VOICE_HINTS: Record<string, string> = {
  Vivian: '明快略尖的年轻女声',
  Serena: '温暖柔和的年轻女声',
  Uncle_Fu: '低沉醇厚的成熟男声',
  Dylan: '清亮自然的北京青年男声',
  Eric: '活泼略带沙哑的成都男声',
  Ryan: '富有节奏感的英语男声',
  Aiden: '阳光清澈的美式男声',
  Ono_Anna: '轻快灵动的日语女声',
  Sohee: '富有感情的韩语女声',
}

export async function listVoiceboxPresetCatalog(engine: string): Promise<VoiceboxPresetVoice[]> {
  const resp = await fetch(voiceboxUrl(`/profiles/presets/${engine}`), {
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Voicebox preset catalog error ${resp.status}: ${errText}`)
  }
  const data = await resp.json() as { voices?: VoiceboxPresetVoice[] }
  return data.voices || []
}

async function ensureVoiceboxPresetProfile(engine: string, presetVoiceId: string): Promise<string> {
  const profiles = await listVoiceboxProfiles()
  const existing = profiles.find(p =>
    p.voice_type === 'preset'
    && p.preset_engine === engine
    && p.preset_voice_id === presetVoiceId,
  )
  if (existing) return existing.id

  let voiceName = presetVoiceId
  let language = 'zh'
  try {
    const catalog = await listVoiceboxPresetCatalog(engine)
    const row = catalog.find(v => v.voice_id === presetVoiceId)
    if (row?.name) voiceName = row.name
    if (row?.language) language = row.language
  } catch { /* catalog unavailable */ }

  const resp = await fetch(voiceboxUrl('/profiles'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: voiceName,
      voice_type: 'preset',
      preset_engine: engine,
      preset_voice_id: presetVoiceId,
      language,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(errText || `创建预设音色 profile 失败 HTTP ${resp.status}`)
  }
  const created = await resp.json() as VoiceboxProfile
  return created.id
}

export type VoiceboxVoiceOption = {
  voice_id: string
  voice_name: string
  voice_type: string
  language: string
  description: string[]
  sample_count: number
  preset_engine?: string
  supports_instruct?: boolean
  model_ready?: boolean
  model_hint?: string
}

/** 合并用户 profile + 内置预设目录（未建 profile 的预设也可直接选） */
export async function listVoiceboxVoiceOptions(modelSize?: VoiceboxModelSize): Promise<VoiceboxVoiceOption[]> {
  const preferredSize = resolveVoiceboxModelSize(modelSize)
  const models = await fetchVoiceboxModelsStatus()
  const profiles = await listVoiceboxProfiles()
  const coveredPresets = new Set(
    profiles
      .filter(p => p.voice_type === 'preset' && p.preset_engine && p.preset_voice_id)
      .map(p => `${p.preset_engine}:${p.preset_voice_id}`),
  )

  const items: VoiceboxVoiceOption[] = profiles.map(p => {
    const engine = p.preset_engine || p.default_engine || (p.voice_type === 'cloned' ? 'qwen' : undefined)
    const modelState = resolveEngineModel(engine || undefined, models, preferredSize)
    return {
      voice_id: p.id,
      voice_name: p.name,
      voice_type: p.voice_type,
      language: p.language === 'zh' ? '中文' : p.language,
      description: p.description ? [p.description] : [],
      sample_count: p.sample_count ?? 0,
      preset_engine: p.preset_engine || undefined,
      supports_instruct: p.preset_engine === 'qwen_custom_voice',
      model_ready: modelState.ready,
      model_hint: modelState.hint,
    }
  })

  const appendCatalog = async (engine: string, languages?: string[]) => {
    try {
      const voices = await listVoiceboxPresetCatalog(engine)
      for (const v of voices) {
        if (languages?.length && !languages.includes(v.language || '')) continue
        const key = `${engine}:${v.voice_id}`
        if (coveredPresets.has(key)) continue
        const engineLabel = engine === 'qwen_custom_voice' ? 'CustomVoice' : engine === 'kokoro' ? 'Kokoro' : engine
        const hint = QWEN_CUSTOM_VOICE_HINTS[v.voice_id] || ''
        const modelState = resolveEngineModel(engine, models, preferredSize)
        items.push({
          voice_id: `${PRESET_REF_PREFIX}${engine}:${v.voice_id}`,
          voice_name: v.name,
          voice_type: 'preset',
          language: v.language === 'zh' ? '中文' : v.language || '其他',
          description: [`${engineLabel} 内置${hint ? ` · ${hint}` : ''}`],
          sample_count: 0,
          preset_engine: engine,
          supports_instruct: engine === 'qwen_custom_voice',
          model_ready: modelState.ready,
          model_hint: modelState.hint,
        })
      }
    } catch {
      // 对应引擎模型未下载时跳过
    }
  }

  await appendCatalog('qwen_custom_voice', ['zh'])
  await appendCatalog('kokoro', ['zh'])

  return items
}

export async function listVoiceboxProfiles(): Promise<VoiceboxProfile[]> {
  const resp = await fetch(voiceboxUrl('/profiles'), {
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Voicebox profiles error ${resp.status}: ${errText}`)
  }
  const rows = await resp.json() as VoiceboxProfile[]
  return rows.filter(p => p.voice_type !== 'import')
}

function resolveProfileLanguage(profileId: string, profiles: VoiceboxProfile[], fallback = 'zh') {
  const profile = profiles.find(p => p.id === profileId)
  return profile?.language || fallback
}

/** 仅 Qwen CustomVoice 预设音色支持 instruct 感情/风格控制 */
export function voiceboxProfileSupportsInstruct(profile?: VoiceboxProfile | null): boolean {
  return profile?.preset_engine === 'qwen_custom_voice'
}

export async function generateVoiceboxTTS(
  text: string,
  profileId: string,
  language?: string | null,
  instruct?: string | null,
  modelSize?: VoiceboxModelSize | null,
): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('配音文本为空')
  const profile = (profileId || '').trim()
  if (!profile) throw new Error('未选择 Voicebox 音色')

  const resolvedProfileId = await resolveVoiceboxProfileId(profile)
  let lang = (language || '').trim()
  const models = await fetchVoiceboxModelsStatus()
  const profiles = await listVoiceboxProfiles()
  const profileMeta = profiles.find(p => p.id === resolvedProfileId)
  const engine = profileMeta?.preset_engine || profileMeta?.default_engine
    || (profileMeta?.voice_type === 'cloned' ? 'qwen' : undefined)
  const preferredSize = resolveVoiceboxModelSize(modelSize)
  const modelState = resolveEngineModel(engine, models, preferredSize)
  if (!modelState.ready) {
    throw new Error(modelState.hint || 'Voicebox 模型未就绪')
  }
  const resolvedModelSize = modelState.modelSize
  if (!lang) lang = resolveProfileLanguage(resolvedProfileId, profiles)

  const styleInstructRaw = resolveVoiceboxInstruct(instruct)
  const styleInstruct = voiceboxProfileSupportsInstruct(profileMeta) ? styleInstructRaw : undefined
  if (styleInstructRaw && !styleInstruct) {
    logTaskProgress('AudioTask', 'voicebox-instruct-skipped', {
      profileId: resolvedProfileId,
      voiceType: profileMeta?.voice_type,
      engine,
      reason: 'only-qwen-custom-voice-supports-instruct',
    })
  }

  logTaskStart('AudioTask', 'voicebox-generate', {
    profileId: resolvedProfileId,
    language: lang,
    instruct: styleInstruct,
    engine,
    modelSize: resolvedModelSize,
    textPreview: trimmed.slice(0, 50),
    textLength: trimmed.length,
  })

  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.wav`
  const filePath = path.join(audioDir, filename)

  await acquireVoiceboxSlot()
  try {
    logTaskProgress('AudioTask', 'voicebox-stream', { profileId: resolvedProfileId, language: lang, instruct: styleInstruct, engine })
    const payload: Record<string, string> = {
      text: trimmed,
      profile_id: resolvedProfileId,
      language: lang,
    }
    if (styleInstruct) payload.instruct = styleInstruct
    if (engine) payload.engine = engine
    if (resolvedModelSize) payload.model_size = resolvedModelSize
    const resp = await fetch(voiceboxUrl('/generate/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(VOICEBOX_TIMEOUT_MS),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(formatVoiceboxError(errText || `Voicebox HTTP ${resp.status}`))
    }

    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length < 44) {
      throw new Error('Voicebox 返回的音频为空')
    }

    fs.writeFileSync(filePath, buffer)
    const relativePath = `static/audio/${filename}`
    logTaskSuccess('AudioTask', 'voicebox-saved', {
      profileId: resolvedProfileId,
      path: relativePath,
      bytes: buffer.length,
      engine: engine || 'voicebox',
    })
    return relativePath
  } catch (err: any) {
    logTaskError('AudioTask', 'voicebox-generate', { profileId: resolvedProfileId, error: err.message })
    throw new Error(formatVoiceboxError(err.message))
  } finally {
    releaseVoiceboxSlot()
  }
}

export async function resolveVoiceboxProfileId(voiceId?: string | null, fallbackProfileId?: string | null): Promise<string> {
  const raw = (voiceId || '').trim()
  if (raw.startsWith(PRESET_REF_PREFIX)) {
    const parts = raw.split(':')
    const engine = parts[1]
    const presetVoiceId = parts.slice(2).join(':')
    if (!engine || !presetVoiceId) throw new Error('无效的预设音色 ID')
    return ensureVoiceboxPresetProfile(engine, presetVoiceId)
  }
  if (VOICEBOX_PROFILE_UUID_RE.test(raw)) return raw
  const fallback = (fallbackProfileId || '').trim()
  if (fallback) return fallback
  if (raw) return raw
  throw new Error('未选择 Voicebox 音色')
}
