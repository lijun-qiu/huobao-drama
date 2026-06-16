import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTextConfig } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import { logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1'

export type SrtCue = {
  index: number
  start: number
  end: number
  text: string
}

function parseSrtTimestamp(raw: string): number {
  const match = raw.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!match) return 0
  const h = Number(match[1])
  const m = Number(match[2])
  const s = Number(match[3])
  const ms = Number(match[4].padEnd(3, '0').slice(0, 3))
  return h * 3600 + m * 60 + s + ms / 1000
}

export function parseSrtContent(content: string): SrtCue[] {
  const blocks = content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)

  const cues: SrtCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 2) continue
    const index = Number(lines[0])
    const timing = lines[1]?.match(/(.+?)\s*-->\s*(.+)/)
    if (!timing) continue
    const start = parseSrtTimestamp(timing[1])
    const end = parseSrtTimestamp(timing[2])
    const text = lines.slice(2).join(' ').trim()
    if (!text || end <= start) continue
    cues.push({ index: Number.isFinite(index) ? index : cues.length + 1, start, end, text })
  }
  return cues
}

function cuesFromVerboseJson(payload: any): SrtCue[] {
  const segments = Array.isArray(payload?.segments) ? payload.segments : []
  return segments
    .map((seg: any, idx: number) => ({
      index: idx + 1,
      start: Number(seg.start) || 0,
      end: Math.max(Number(seg.end) || 0, Number(seg.start) || 0),
      text: String(seg.text || '').trim(),
    }))
    .filter((cue: SrtCue) => cue.text && cue.end > cue.start)
}

function saveTranscribeSrt(content: string): string {
  const dir = path.join(STORAGE_ROOT, 'subtitles', 'transcribe')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `transcribe-${Date.now()}.srt`
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8')
  return `static/subtitles/transcribe/${filename}`
}

async function postWhisperRequest(
  audioAbsPath: string,
  responseFormat: 'srt' | 'verbose_json',
): Promise<{ body: string; format: 'srt' | 'verbose_json' }> {
  const config = getTextConfig()
  const url = joinProviderUrl(config.baseUrl, '/v1', '/audio/transcriptions')
  const form = new FormData()
  const buffer = fs.readFileSync(audioAbsPath)
  const blob = new Blob([buffer], { type: 'audio/mpeg' })
  form.append('file', blob, path.basename(audioAbsPath))
  form.append('model', WHISPER_MODEL)
  form.append('response_format', responseFormat)
  form.append('language', 'zh')

  logTaskProgress('AudioTranscribe', 'request', { format: responseFormat, model: WHISPER_MODEL })

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })

  const body = await res.text()
  if (!res.ok) {
    logTaskError('AudioTranscribe', 'request-failed', { status: res.status, body: body.slice(0, 300) })
    throw new Error(`语音转字幕失败（${res.status}）：${body.slice(0, 200)}`)
  }
  return { body, format: responseFormat }
}

export async function transcribeAudioToSrt(audioAbsPath: string): Promise<{
  srt: string
  srtPath: string
  cues: SrtCue[]
}> {
  if (!fs.existsSync(audioAbsPath)) throw new Error(`音频文件不存在：${audioAbsPath}`)

  let srt = ''
  let cues: SrtCue[] = []

  try {
    const primary = await postWhisperRequest(audioAbsPath, 'srt')
    srt = primary.body.trim()
    cues = parseSrtContent(srt)
  } catch (err: any) {
    logTaskProgress('AudioTranscribe', 'srt-fallback', { reason: err.message })
    const verbose = await postWhisperRequest(audioAbsPath, 'verbose_json')
    const payload = JSON.parse(verbose.body)
    cues = cuesFromVerboseJson(payload)
    srt = cues.map((cue, idx) => {
      const start = formatSrtTimestamp(cue.start)
      const end = formatSrtTimestamp(cue.end)
      return `${idx + 1}\n${start} --> ${end}\n${cue.text}\n`
    }).join('\n')
  }

  if (!cues.length) throw new Error('转写结果为空，请检查音频是否含清晰旁白人声')

  const srtPath = saveTranscribeSrt(srt.endsWith('\n') ? srt : `${srt}\n`)
  logTaskSuccess('AudioTranscribe', 'done', { cueCount: cues.length, srtPath })
  return { srt, srtPath, cues }
}

export function formatSrtTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
