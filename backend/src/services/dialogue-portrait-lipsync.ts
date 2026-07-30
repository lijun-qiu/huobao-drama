/**
 * 对话立绘简易口型：按 TTS 音量在闭口/开口立绘间切换（身体坐标锁定，无整身晃动）
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'

const WIN_SEC = 0.045
const HOP_SEC = 0.02
/** 有声段内张合周期（秒） */
const FLAP_PERIOD_SEC = 0.14
const FLAP_OPEN_RATIO = 0.55
const MAX_ENABLE_INTERVALS = 96

function readMonoWavSamples(wavPath: string): { sampleRate: number; samples: Float32Array } {
  const buf = fs.readFileSync(wavPath)
  const sampleRate = buf.readUInt32LE(24)
  let dataStart = 12
  while (dataStart < buf.length - 8) {
    const chunkId = buf.toString('ascii', dataStart, dataStart + 4)
    const chunkSize = buf.readUInt32LE(dataStart + 4)
    if (chunkId === 'data') {
      dataStart += 8
      break
    }
    dataStart += 8 + chunkSize
  }
  const channels = buf.readUInt16LE(22) || 1
  const bits = buf.readUInt16LE(34) || 16
  if (bits !== 16) throw new Error(`unsupported wav bits=${bits}`)
  const frameBytes = channels * 2
  const frameCount = Math.floor((buf.length - dataStart) / frameBytes)
  const samples = new Float32Array(frameCount)
  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    for (let ch = 0; ch < channels; ch++) {
      sum += buf.readInt16LE(dataStart + i * frameBytes + ch * 2) / 32768
    }
    samples[i] = sum / channels
  }
  return { sampleRate, samples }
}

/** 任意音频 → 临时 mono pcm wav（分析完由调用方删除） */
export function materializeMonoPcmWav(audioPath: string): { wavPath: string; cleanup: () => void } {
  const wavPath = path.join(os.tmpdir(), `dp-lip-${uuid()}.wav`)
  execFileSync('ffmpeg', [
    '-y', '-i', audioPath,
    '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
    wavPath,
  ], { stdio: 'ignore', timeout: 60_000 })
  return {
    wavPath,
    cleanup: () => {
      try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath) } catch { /* ignore */ }
    },
  }
}

export type MouthOpenInterval = { start: number; end: number }

/**
 * 从配音得到开口时间段：静音闭口；有声段内按固定频率张合（音量越大开口略长）。
 */
export function analyzeMouthOpenIntervals(
  wavPath: string,
  durationSec?: number,
): MouthOpenInterval[] {
  const { sampleRate, samples } = readMonoWavSamples(wavPath)
  if (!samples.length) return []

  const win = Math.max(1, Math.round(WIN_SEC * sampleRate))
  const hop = Math.max(1, Math.round(HOP_SEC * sampleRate))
  const rmsList: number[] = []
  for (let i = 0; i + win <= samples.length; i += hop) {
    let sumSq = 0
    for (let j = i; j < i + win; j++) sumSq += samples[j] * samples[j]
    rmsList.push(Math.sqrt(sumSq / win))
  }
  if (!rmsList.length) return []

  const sorted = [...rmsList].sort((a, b) => a - b)
  const p35 = sorted[Math.floor(sorted.length * 0.35)] ?? 0
  const mean = rmsList.reduce((a, b) => a + b, 0) / rmsList.length
  const peak = sorted[sorted.length - 1] || 0
  const threshold = Math.max(0.012, Math.min(peak * 0.22, Math.max(p35 * 1.35, mean * 0.45)))

  const audioDur = samples.length / sampleRate
  const clipDur = Math.max(0.05, durationSec && Number.isFinite(durationSec) ? durationSec : audioDur)
  const intervals: MouthOpenInterval[] = []

  for (let i = 0; i < rmsList.length; i++) {
    const t = (i * hop) / sampleRate
    if (t >= clipDur) break
    const rms = rmsList[i]
    if (rms < threshold) continue
    const loud = Math.min(1, (rms - threshold) / Math.max(threshold * 2.5, 1e-6))
    const openLen = FLAP_PERIOD_SEC * (FLAP_OPEN_RATIO + 0.2 * loud)
    const phase = t % FLAP_PERIOD_SEC
    if (phase > openLen) continue
    const start = t
    const end = Math.min(clipDur, t + HOP_SEC + 0.01)
    const last = intervals[intervals.length - 1]
    if (last && start <= last.end + 0.01) {
      last.end = end
    } else {
      intervals.push({ start, end })
    }
  }

  return mergeAndCapIntervals(intervals, MAX_ENABLE_INTERVALS)
}

function mergeAndCapIntervals(intervals: MouthOpenInterval[], maxN: number): MouthOpenInterval[] {
  if (intervals.length <= maxN) return intervals
  const merged: MouthOpenInterval[] = []
  const bucket = Math.ceil(intervals.length / maxN)
  for (let i = 0; i < intervals.length; i += bucket) {
    const chunk = intervals.slice(i, i + bucket)
    merged.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    })
  }
  return merged.slice(0, maxN)
}

/** FFmpeg overlay enable= 表达式；无开口段时返回 null（不叠开口层） */
export function buildMouthOpenEnableExpr(intervals: MouthOpenInterval[]): string | null {
  if (!intervals.length) return null
  // 外层用单引号包裹，此处逗号无需 \, 转义
  const parts = intervals.map(iv => {
    const a = Math.max(0, iv.start).toFixed(3)
    const b = Math.max(iv.start + 0.02, iv.end).toFixed(3)
    return `between(t,${a},${b})`
  })
  return parts.join('+')
}

export function analyzeMouthOpenEnableExpr(
  audioPath: string,
  durationSec?: number,
): string | null {
  if (!audioPath || !fs.existsSync(audioPath)) return null
  const { wavPath, cleanup } = materializeMonoPcmWav(audioPath)
  try {
    return buildMouthOpenEnableExpr(analyzeMouthOpenIntervals(wavPath, durationSec))
  } finally {
    cleanup()
  }
}
