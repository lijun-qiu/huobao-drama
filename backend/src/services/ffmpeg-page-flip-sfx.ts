/**
 * 云朵/翻页转场音效 — 与成片 BGM 相同：在最终视频上后置混音，不占用旁白轨。
 */
import { spawnSync, execFileSync } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { PAGE_FLIP_TRANSITION_SEC } from './ffmpeg-page-transition.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

export const PAGE_FLIP_SFX_SEC = 0.17
export const PAGE_FLIP_SFX_ASSET = path.resolve(__dirname, '../../assets/page-flip.wav')
const PAGE_FLIP_SFX_REF = process.env.OPENING_PAGE_FLIP_REF
  || 'D:/我的/视频剪辑/NarratoAI/resource/videos/6月16日.mp3'

export function resolveTransitionSfxVolume(): number {
  const v = Number(process.env.MERGE_TRANSITION_SFX_VOLUME)
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.45
}

function runFfmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' })
}

function pageFlipAudioFilters(): string {
  return [
    'highpass=f=780',
    'lowpass=f=9800',
    'equalizer=f=3000:width_type=h:width=1600:g=4.5',
    'equalizer=f=5500:width_type=h:width=2200:g=2.8',
    'afade=t=in:st=0:d=0.005',
    `afade=t=out:st=${(PAGE_FLIP_SFX_SEC - 0.07).toFixed(3)}:d=0.06`,
    'volume=2.8',
  ].join(',')
}

function detectPageFlipRegion(refPath: string): { start: number; end: number } | null {
  const { stderr } = spawnSync('ffmpeg', [
    '-hide_banner', '-i', refPath,
    '-af', 'silencedetect=noise=-45dB:d=0.03',
    '-f', 'null', '-',
  ], { encoding: 'utf8' })
  const log = stderr || ''
  if (!log) return null

  const events: Array<{ type: 'start' | 'end'; time: number }> = []
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    events.push({ type: m[1] as 'start' | 'end', time: parseFloat(m[2]) })
  }
  if (!events.length) return null

  let soundStart: number | null = null
  let soundEnd: number | null = null
  for (const ev of events) {
    if (ev.type === 'end' && soundStart === null) {
      soundStart = ev.time
    } else if (ev.type === 'start' && soundStart !== null && ev.time > soundStart + 0.05) {
      soundEnd = ev.time
      break
    }
  }
  if (soundStart === null || soundEnd === null) return null
  if (soundEnd - soundStart < 0.08) return null
  return { start: soundStart, end: soundEnd }
}

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
  const sampleCount = Math.floor((buf.length - dataStart) / 2)
  const samples = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buf.readInt16LE(dataStart + i * 2) / 32768
  }
  return { sampleRate, samples }
}

function findQuietestFlipOffset(refPath: string, region: { start: number; end: number }): number {
  const span = region.end - region.start
  if (span <= PAGE_FLIP_SFX_SEC) return 0

  const tempWav = path.join(os.tmpdir(), `page-flip-quiet-${uuid()}.wav`)
  try {
    runFfmpeg([
      '-ss', region.start.toFixed(3), '-i', refPath,
      '-t', span.toFixed(3),
      '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le',
      tempWav,
    ])
    const { sampleRate, samples } = readMonoWavSamples(tempWav)
    const win = Math.round(PAGE_FLIP_SFX_SEC * sampleRate)
    const hop = Math.max(1, Math.round(0.005 * sampleRate))
    const minRms = 0.0018

    let bestOffsetSec = 0
    let bestRms = Infinity
    for (let i = 0; i <= samples.length - win; i += hop) {
      let sumSq = 0
      for (let j = i; j < i + win; j++) sumSq += samples[j] * samples[j]
      const rms = Math.sqrt(sumSq / win)
      if (rms < minRms || rms >= bestRms) continue
      bestRms = rms
      bestOffsetSec = i / sampleRate
    }
    return bestOffsetSec
  } finally {
    if (fs.existsSync(tempWav)) {
      try { fs.unlinkSync(tempWav) } catch {}
    }
  }
}

function extractBookPageFlipFromReference(outputPath: string): boolean {
  if (!fs.existsSync(PAGE_FLIP_SFX_REF)) return false
  try {
    const region = detectPageFlipRegion(PAGE_FLIP_SFX_REF)
    const quietOffset = region ? findQuietestFlipOffset(PAGE_FLIP_SFX_REF, region) : 0.02
    const ss = region ? region.start + quietOffset : 0.96
    runFfmpeg([
      '-ss', ss.toFixed(3), '-i', PAGE_FLIP_SFX_REF,
      '-t', String(PAGE_FLIP_SFX_SEC),
      '-vn',
      '-af', pageFlipAudioFilters(),
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le',
      outputPath,
    ])
    return fs.existsSync(outputPath)
  } catch {
    return false
  }
}

function synthesizeBookPageFlipSample(outputPath: string): void {
  const dur = PAGE_FLIP_SFX_SEC
  runFfmpeg([
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=${dur}:sample_rate=48000`,
    '-af', [
      'highpass=f=380',
      'lowpass=f=4800',
      'bandpass=f=1100:width_type=h:w=1700',
      "volume='min(t/0.006,1)*pow(max(0,1-t/0.17),1.35)*exp(-max(t-0.04,0)*5)':eval=frame",
      'afade=t=in:st=0:d=0.006',
      `afade=t=out:st=${(dur - 0.08).toFixed(3)}:d=0.06`,
      'volume=2.4',
      'asplit=2[a][b]',
      '[a]volume=exp(-t*9):eval=frame[L]',
      '[b]adelay=28|28,volume=exp(-(t-0.025)*6)*min(t/0.15,1):eval=frame[R]',
      '[L][R]amerge=inputs=2,pan=stereo|c0=c0|c1=c1',
      'volume=1.6',
    ].join(','),
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le',
    outputPath,
  ])
}

export function preparePageFlipSfxSample(outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  if (extractBookPageFlipFromReference(outputPath)) return
  if (fs.existsSync(PAGE_FLIP_SFX_ASSET)) {
    fs.copyFileSync(PAGE_FLIP_SFX_ASSET, outputPath)
    return
  }
  synthesizeBookPageFlipSample(outputPath)
}

export function renderPageFlipAudioTrack(
  flipTimes: number[],
  sfxPath: string,
  outputPath: string,
  totalSec: number,
): void {
  const n = flipTimes.length
  if (!n) {
    runFfmpeg([
      '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${totalSec}`,
      '-t', String(totalSec),
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      outputPath,
    ])
    return
  }

  const splitOut = flipTimes.map((_, i) => `[s${i}]`).join('')
  const parts: string[] = [`[0:a]asplit=${n}${splitOut}`]
  flipTimes.forEach((t, i) => {
    const ms = Math.round(t * 1000)
    parts.push(`[s${i}]adelay=${ms}|${ms},apad=whole_dur=${totalSec}[f${i}]`)
  })
  const mixIn = flipTimes.map((_, i) => `[f${i}]`).join('')
  parts.push(`${mixIn}amix=inputs=${n}:duration=longest:dropout_transition=0:normalize=0[aout]`)

  runFfmpeg([
    '-i', sfxPath,
    '-filter_complex', parts.join(';'),
    '-map', '[aout]',
    '-t', String(totalSec),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    outputPath,
  ])
}

export async function mixAudioWithPageFlipSfx(
  narrationPath: string,
  flipTrackPath: string,
  outputPath: string,
  totalSec: number,
  sfxVolume = resolveTransitionSfxVolume(),
): Promise<void> {
  const vol = Math.max(0.05, Math.min(1, sfxVolume))
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(narrationPath)
      .input(flipTrackPath)
      .complexFilter(
        `[0:a]atrim=0:${totalSec},asetpts=PTS-STARTPTS[voice];[1:a]volume=${vol}[sfx];[voice][sfx]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
      )
      .outputOptions(['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(totalSec)])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) resolve(0)
      else resolve(Math.max(0, Number(data.format.duration) || 0))
    })
  })
}

/** 开幕片头等重叠 xfade 音效时间轴（与 ffmpeg-opening buildVideoPageFlipFilter 对齐） */
export function computeOverlappingPageFlipSoundTimes(segmentDurations: number[], totalSec: number): number[] {
  const td = PAGE_FLIP_TRANSITION_SEC
  const times: number[] = []
  let cumulative = segmentDurations[0]
  for (let i = 1; i < segmentDurations.length; i++) {
    times.push(Math.max(0, cumulative - td))
    cumulative += segmentDurations[i] - td
  }
  return times.map(t => Math.min(totalSec - 0.02, t))
}

export async function mixPageFlipSfxIntoMergedVideo(
  videoPath: string,
  flipTimes: number[],
  attachCommand: (command: ReturnType<typeof ffmpeg>) => void,
  volume = resolveTransitionSfxVolume(),
): Promise<void> {
  if (!flipTimes.length) return

  const totalSec = await probeMediaDuration(videoPath)
  if (totalSec <= 0) return

  const tempDir = path.join(STORAGE_ROOT, 'temp', 'page-flip-sfx')
  fs.mkdirSync(tempDir, { recursive: true })
  const sfxSample = path.join(tempDir, `sample-${uuid()}.wav`)
  const sfxTrack = path.join(tempDir, `track-${uuid()}.m4a`)
  const tempOut = `${videoPath}.sfx.mp4`
  const vol = Math.max(0.05, Math.min(1, volume))

  try {
    preparePageFlipSfxSample(sfxSample)
    renderPageFlipAudioTrack(flipTimes, sfxSample, sfxTrack, totalSec)

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg()
        .input(videoPath)
        .input(sfxTrack)
        .outputOptions([
          '-filter_complex',
          `[0:a]volume=1[voice];[1:a]volume=${vol}[sfx];[voice][sfx]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-ar', '48000',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ])
        .output(tempOut)
      attachCommand(command)
      command
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    fs.renameSync(tempOut, videoPath)
  } finally {
    for (const p of [sfxSample, sfxTrack]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p) } catch {}
      }
    }
    if (fs.existsSync(tempOut)) {
      try { fs.unlinkSync(tempOut) } catch {}
    }
  }
}
