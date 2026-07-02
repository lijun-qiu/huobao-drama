/**
 * TTS 语音合成服务
 * 支持 MiniMax TTS (hex 音频响应) 和 OpenAI 兼容 /audio/speech
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { getAudioConfigById } from './ai.js'
import { getTTSAdapter } from './adapters/registry.js'
import { generateEdgeTTS } from './edge-tts-local.js'
import { mapLocalVoiceToEdge, resolveLocalTtsVoiceInput } from './local-tts-resolve.js'
import { generateVoiceboxTTS, resolveVoiceboxProfileId, type VoiceboxModelSize } from './voicebox-tts.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { applyTtsSpeedToAudioFile, resolveTtsSpeed } from '../utils/tts-speed.js'
import { getAbsolutePath } from '../utils/storage.js'
import ffmpeg from 'fluent-ffmpeg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

interface TTSParams {
  text: string
  voice: string
  model?: string
  speed?: number
  emotion?: string
  configId?: number | null
  localTts?: boolean
  localTtsEngine?: 'edge' | 'voicebox'
  voiceboxInstruct?: string | null
  voiceboxModelSize?: VoiceboxModelSize | null
}

/** 探测已落盘配音时长（秒），失败返回 null */
export async function probeStoredAudioDuration(relativePath: string): Promise<number | null> {
  const rel = String(relativePath || '').trim().replace(/^\/+/, '')
  if (!rel) return null
  try {
    const abs = getAbsolutePath(rel)
    if (!fs.existsSync(abs)) return null
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(abs, (err, data) => {
        if (err) reject(err)
        else resolve(Math.max(0.1, Number(data.format?.duration) || 0))
      })
    })
    return Number.isFinite(duration) && duration > 0 ? duration : null
  } catch {
    return null
  }
}

/**
 * 生成 TTS 音频，返回本地文件路径
 */
export async function generateTTS(params: TTSParams): Promise<string> {
  const speed = resolveTtsSpeed(params.speed)

  if (params.localTts) {
    if (params.localTtsEngine === 'voicebox') {
      const profileId = await resolveVoiceboxProfileId(params.voice)
      const path = await generateVoiceboxTTS(params.text, profileId, null, params.voiceboxInstruct, params.voiceboxModelSize)
      return applyTtsSpeedToAudioFile(path, speed)
    }
    return generateEdgeTTS(params.text, params.voice, speed)
  }

  const config = getAudioConfigById(params.configId)
  const adapter = getTTSAdapter(config.provider)

  logTaskStart('AudioTask', 'tts-generate', {
    provider: config.provider,
    voice: params.voice,
    speed,
    model: params.model || config.model,
    textPreview: params.text.slice(0, 50),
    textLength: params.text.length,
  })
  logTaskPayload('AudioTask', 'tts params', {
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })

  const { url, method, headers, body } = adapter.buildGenerateRequest(config, { ...params, speed })
  logTaskProgress('AudioTask', 'request', {
    provider: config.provider,
    voice: params.voice,
    method,
    url: redactUrl(url),
    model: params.model || config.model,
  })
  logTaskPayload('AudioTask', 'request payload', {
    method,
    url,
    headers,
    body,
  })

  const resp = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    logTaskError('AudioTask', 'tts-generate', { provider: config.provider, voice: params.voice, status: resp.status, error: errText })
    throw new Error(`TTS API error ${resp.status}: ${errText}`)
  }

  const result = await resp.json()
  const parsed = adapter.parseResponse(result)

  // 将 hex 解码为二进制
  const buffer = Buffer.from(parsed.audioHex, 'hex')

  // 保存到本地
  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.${parsed.format || 'mp3'}`
  const filePath = path.join(audioDir, filename)
  fs.writeFileSync(filePath, buffer)

  const relativePath = `static/audio/${filename}`
  logTaskSuccess('AudioTask', 'tts-saved', {
    provider: config.provider,
    voice: params.voice,
    path: relativePath,
    bytes: buffer.length,
    audioMs: parsed.audioLength,
  })
  return relativePath
}

/**
 * 为角色生成试听音频（支持 Edge / Voicebox；Voicebox 失败时按性别回退 Edge）
 */
export async function generateVoiceSample(
  characterName: string,
  voiceId: string,
  configId?: number | null,
  voiceProvider?: string | null,
  charMeta?: { role?: string | null; appearance?: string | null; description?: string | null },
  voiceboxModelSize?: VoiceboxModelSize | null,
): Promise<{ path: string; engine: 'edge' | 'voicebox' | 'api' }> {
  const sampleText = `你好，我是${characterName}。很高兴认识你，这是我的声音试听。`
  const meta = {
    name: characterName,
    voiceStyle: voiceId,
    voiceProvider,
    role: charMeta?.role,
    appearance: charMeta?.appearance,
    description: charMeta?.description,
  }

  let resolved: ReturnType<typeof resolveLocalTtsVoiceInput>
  try {
    resolved = resolveLocalTtsVoiceInput(voiceId, voiceProvider)
  } catch {
    const path = await generateTTS({ text: sampleText, voice: voiceId, configId })
    return { path, engine: 'api' }
  }

  if (resolved.engine === 'edge') {
    const path = await generateTTS({
      text: sampleText,
      voice: resolved.voice,
      localTts: true,
      localTtsEngine: 'edge',
    })
    return { path, engine: 'edge' }
  }

  try {
    const profileId = await resolveVoiceboxProfileId(resolved.voice)
    const path = await generateTTS({
      text: sampleText,
      voice: profileId,
      localTts: true,
      localTtsEngine: 'voicebox',
      voiceboxModelSize: voiceboxModelSize ?? undefined,
    })
    return { path, engine: 'voicebox' }
  } catch (err: any) {
    const edgeVoice = mapLocalVoiceToEdge(meta)
    logTaskWarn('VoiceSample', 'voicebox-fallback-edge', {
      characterName,
      voiceId,
      error: err.message,
      edgeVoice,
    })
    const path = await generateTTS({
      text: sampleText,
      voice: edgeVoice,
      localTts: true,
      localTtsEngine: 'edge',
    })
    return { path, engine: 'edge' }
  }
}
