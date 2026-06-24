import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

export const DEFAULT_TTS_SPEED = Number(process.env.TTS_DEFAULT_SPEED || 1)

export function resolveTtsSpeed(value?: number | string | null): number {
  if (value == null || value === '') return DEFAULT_TTS_SPEED
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_TTS_SPEED
  return Math.min(2, Math.max(0.5, Math.round(n * 100) / 100))
}

/** edge-tts --rate：0.9 → -10% */
export function ttsSpeedToEdgeRate(speed: number): string {
  const pct = Math.round((resolveTtsSpeed(speed) - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function buildAtempoFilter(speed: number): string {
  let remaining = resolveTtsSpeed(speed)
  const parts: string[] = []
  while (remaining < 0.5) {
    parts.push('atempo=0.5')
    remaining /= 0.5
  }
  while (remaining > 2) {
    parts.push('atempo=2')
    remaining /= 2
  }
  if (Math.abs(remaining - 1) >= 0.001) {
    parts.push(`atempo=${remaining.toFixed(4)}`)
  }
  return parts.join(',') || 'atempo=1'
}

/** Voicebox 等无原生语速接口时，用 atempo 后处理 */
export async function applyTtsSpeedToAudioFile(relativePath: string, speed?: number | null): Promise<string> {
  const resolved = resolveTtsSpeed(speed)
  if (Math.abs(resolved - 1) < 0.001) return relativePath

  const absPath = toAbsPath(relativePath)
  if (!fs.existsSync(absPath)) return relativePath

  const ext = path.extname(absPath) || '.wav'
  const tmpPath = `${absPath}.speed${ext}`
  const filter = buildAtempoFilter(resolved)

  await new Promise<void>((resolve, reject) => {
    ffmpeg(absPath)
      .audioFilters(filter)
      .outputOptions(['-y'])
      .output(tmpPath)
      .on('end', () => resolve())
      .on('error', err => reject(err))
      .run()
  })

  fs.renameSync(tmpPath, absPath)
  return relativePath
}
