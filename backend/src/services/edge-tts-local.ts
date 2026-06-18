import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { DEFAULT_TTS_SPEED, resolveTtsSpeed, ttsSpeedToEdgeRate } from '../utils/tts-speed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const EDGE_TTS_TIMEOUT_MS = Number(process.env.EDGE_TTS_TIMEOUT_MS || 45_000)
const EDGE_TTS_CONCURRENCY = Math.max(1, Number(process.env.EDGE_TTS_CONCURRENCY || 6))

let edgeTtsActive = 0
const edgeTtsQueue: Array<() => void> = []

async function acquireEdgeTtsSlot() {
  if (edgeTtsActive < EDGE_TTS_CONCURRENCY) {
    edgeTtsActive++
    return
  }
  await new Promise<void>(resolve => edgeTtsQueue.push(resolve))
  edgeTtsActive++
}

function releaseEdgeTtsSlot() {
  edgeTtsActive = Math.max(0, edgeTtsActive - 1)
  const next = edgeTtsQueue.shift()
  if (next) next()
}

export const DEFAULT_EDGE_VOICE = 'zh-CN-YunxiNeural'

export const EDGE_VOICE_OPTIONS = [
  { voice_id: 'zh-CN-YunxiNeural', voice_name: '云希（男·解说）', language: '中文' },
  { voice_id: 'zh-CN-YunyangNeural', voice_name: '云扬（男·新闻）', language: '中文' },
  { voice_id: 'zh-CN-YunjianNeural', voice_name: '云健（男·体育）', language: '中文' },
  { voice_id: 'zh-CN-XiaoxiaoNeural', voice_name: '晓晓（女·温柔）', language: '中文' },
  { voice_id: 'zh-CN-XiaoyiNeural', voice_name: '晓伊（女·活泼）', language: '中文' },
  { voice_id: 'zh-CN-liaoning-XiaobeiNeural', voice_name: '晓北（东北话）', language: '中文' },
  { voice_id: 'zh-CN-shaanxi-XiaoniNeural', voice_name: '晓妮（陕西话）', language: '中文' },
] as const

const MINIMAX_TO_EDGE: Record<string, string> = {
  'female-shaonv': 'zh-CN-XiaoxiaoNeural',
  'female-yujie': 'zh-CN-XiaoyiNeural',
  'female-chengshu': 'zh-CN-XiaoxiaoNeural',
  'female-tianmei': 'zh-CN-XiaoyiNeural',
  'male-qn-qingse': 'zh-CN-YunxiNeural',
  'male-qn-jingying': 'zh-CN-YunyangNeural',
  'male-qn-badao': 'zh-CN-YunjianNeural',
  'male-qn-daxuesheng': 'zh-CN-YunxiNeural',
  'Chinese (Mandarin)_Reliable_Executive': 'zh-CN-YunyangNeural',
  'Chinese (Mandarin)_News_Anchor': 'zh-CN-YunyangNeural',
  'Chinese (Mandarin)_Mature_Woman': 'zh-CN-XiaoyiNeural',
}

export function resolveEdgeVoice(voiceId?: string | null) {
  const raw = (voiceId || '').trim()
  if (!raw) return DEFAULT_EDGE_VOICE
  if (/^(zh|en|ja|ko)-/i.test(raw)) return raw
  return MINIMAX_TO_EDGE[raw] || DEFAULT_EDGE_VOICE
}

function resolveEdgeTtsBin() {
  return (process.env.EDGE_TTS_BIN || 'edge-tts').trim() || 'edge-tts'
}

/** 通过临时文件调用 edge-tts CLI，避免 Windows shell 把含空格的 --text 拆成多参数 */
function runEdgeTtsCli(text: string, voice: string, outputPath: string, speed = DEFAULT_TTS_SPEED): Promise<void> {
  const bin = resolveEdgeTtsBin()
  const tmpDir = path.join(STORAGE_ROOT, 'audio', '.tts-tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const tmpFile = path.join(tmpDir, `${uuid()}.txt`)
  fs.writeFileSync(tmpFile, text, 'utf8')
  const rate = ttsSpeedToEdgeRate(resolveTtsSpeed(speed))

  return new Promise((resolve, reject) => {
    const args = ['--voice', voice, `--rate=${rate}`, '--file', tmpFile, '--write-media', outputPath]
    logTaskProgress('AudioTask', 'edge-tts-cli', { bin, voice, rate, textLength: text.length, via: 'file' })

    const proc = spawn(bin, args, { shell: false, windowsHide: true })

    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`edge-tts 超时（${EDGE_TTS_TIMEOUT_MS / 1000}s），请检查网络或安装 edge-tts：pip install edge-tts`))
    }, EDGE_TTS_TIMEOUT_MS)

    proc.stderr?.on('data', chunk => { stderr += String(chunk) })
    proc.on('error', err => {
      clearTimeout(timer)
      reject(new Error(`无法启动 edge-tts：${err.message}。请执行 pip install edge-tts`))
    })
    proc.on('close', code => {
      clearTimeout(timer)
      try { fs.unlinkSync(tmpFile) } catch {}
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `edge-tts 失败，退出码 ${code ?? 'unknown'}`))
    })
  })
}

export async function generateEdgeTTS(
  text: string,
  voiceId?: string | null,
  speed?: number | null,
): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('配音文本为空')

  const voice = resolveEdgeVoice(voiceId)
  const resolvedSpeed = resolveTtsSpeed(speed)
  logTaskStart('AudioTask', 'edge-tts-generate', {
    voice,
    speed: resolvedSpeed,
    textPreview: trimmed.slice(0, 50),
    textLength: trimmed.length,
    engine: 'edge-tts-cli',
  })

  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.mp3`
  const filePath = path.join(audioDir, filename)

  await acquireEdgeTtsSlot()
  try {
    await runEdgeTtsCli(trimmed, voice, filePath, resolvedSpeed)
    const relativePath = `static/audio/${filename}`
    logTaskSuccess('AudioTask', 'edge-tts-saved', {
      voice,
      path: relativePath,
      bytes: fs.statSync(filePath).size,
      engine: 'edge-tts-cli',
    })
    return relativePath
  } catch (err: any) {
    logTaskError('AudioTask', 'edge-tts-generate', { voice, error: err.message })
    throw new Error(`本地 Edge TTS 失败: ${err.message}`)
  } finally {
    releaseEdgeTtsSlot()
  }
}
