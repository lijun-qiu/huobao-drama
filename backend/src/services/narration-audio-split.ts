import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { getAbsolutePath } from '../utils/storage.js'
import { sortStoryboardsByOrder } from './narration-image.js'
import { parseDialogueForTTS } from './narration-tts.js'
import { transcribeAudioToSrt } from './audio-transcribe.js'
import {
  normalizeAlignText,
  resolveStoryboardAudioRanges,
} from './narration-srt-align.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const MIN_SEGMENT_SEC = 0.35

type TimeRange = { start: number; end: number }

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(Math.max(MIN_SEGMENT_SEC, Number(data.format.duration) || MIN_SEGMENT_SEC))
    })
  })
}

function escapeConcatMediaPath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

async function writeConcatMp3(absPaths: string[], outputAbs: string): Promise<void> {
  if (absPaths.length === 1) {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(absPaths[0])
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .format('mp3')
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputAbs)
    })
    return
  }

  const listPath = path.join(os.tmpdir(), `huobao-audio-${uuid()}.txt`)
  const listContent = absPaths.map(p => `file '${escapeConcatMediaPath(p)}'`).join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .format('mp3')
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputAbs)
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }
}

async function prepareEpisodeAudioSource(audioRelativePaths: string[]): Promise<string> {
  if (audioRelativePaths.length === 1) return audioRelativePaths[0]

  const absPaths = audioRelativePaths.map((relativePath) => {
    const abs = getAbsolutePath(relativePath)
    if (!fs.existsSync(abs)) throw new Error(`音频文件不存在：${relativePath}`)
    return abs
  })

  const dir = path.join(STORAGE_ROOT, 'audio', 'tts-import')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `merged-${uuid()}.mp3`
  const outputAbs = path.join(dir, filename)
  await writeConcatMp3(absPaths, outputAbs)
  return `static/audio/tts-import/${filename}`
}

function trimAudioSegment(inputAbs: string, outputAbs: string, startSec: number, endSec: number): Promise<void> {
  const duration = Math.max(MIN_SEGMENT_SEC, endSec - startSec)
  return new Promise((resolve, reject) => {
    ffmpeg(inputAbs)
      .setStartTime(Math.max(0, startSec))
      .duration(duration)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .format('mp3')
      .on('end', () => resolve())
      .on('error', reject)
      .save(outputAbs)
  })
}

function saveStoryboardTtsClip(inputAbs: string, startSec: number, endSec: number): Promise<string> {
  const dir = path.join(STORAGE_ROOT, 'audio', 'tts-import')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${uuid()}.mp3`
  const outputAbs = path.join(dir, filename)
  return trimAudioSegment(inputAbs, outputAbs, startSec, endSec).then(() => `static/audio/tts-import/${filename}`)
}

type TtsTarget = {
  sb: { id: number; storyboardNumber: number }
  parsed: ReturnType<typeof parseDialogueForTTS>
}

function getEpisodeTtsTargets(episodeId: number): TtsTarget[] {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(row => !row.deletedAt),
  )
  return storyboards
    .map(sb => ({ sb, parsed: parseDialogueForTTS(sb.dialogue) }))
    .filter(item => !item.parsed.ignorable && item.parsed.pureText)
}

function assignStoryboardTtsClip(sbId: number, clipPath: string, ts: string) {
  const clipDuration = probeMediaDuration(getAbsolutePath(clipPath))
  return clipDuration.then((sec) => {
    const durationSec = Math.max(1, Math.min(120, Math.ceil(sec)))
    db.update(schema.storyboards)
      .set({
        ttsAudioUrl: clipPath,
        duration: durationSec,
        composedVideoUrl: null,
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sbId))
      .run()
    return { storyboard_id: sbId, tts_audio_url: clipPath, duration: durationSec }
  })
}

async function splitAudioToTargetsBySrt(
  targets: TtsTarget[],
  audioRelativePath: string,
  ts: string,
  merged: boolean,
  alignModeHint: 'srt' | 'boundary' = 'srt',
) {
  const inputAbs = getAbsolutePath(audioRelativePath)
  if (!fs.existsSync(inputAbs)) throw new Error(`音频文件不存在：${audioRelativePath}`)

  const totalDuration = await probeMediaDuration(inputAbs)
  const scripts = targets.map(item => item.parsed.pureText)
  const { srtPath, cues } = await transcribeAudioToSrt(inputAbs)
  const aligned = resolveStoryboardAudioRanges(scripts, cues, totalDuration)

  const results: Array<{ storyboard_id: number; tts_audio_url: string; duration: number }> = []
  for (let i = 0; i < targets.length; i++) {
    const { sb } = targets[i]
    const { start, end } = aligned.ranges[i] || { start: 0, end: totalDuration }
    try {
      const clipPath = await saveStoryboardTtsClip(inputAbs, start, end)
      results.push(await assignStoryboardTtsClip(sb.id, clipPath, ts))
    } catch (err: any) {
      logTaskError('NarrationAudioSplit', 'clip-failed', { storyboardId: sb.id, error: err.message })
      throw new Error(`镜头 #${sb.storyboardNumber} 裁剪失败：${err.message}`)
    }
  }

  return {
    results,
    sourceDuration: totalDuration,
    mode: (merged ? 'merged' : 'single') as 'merged' | 'single',
    align_mode: alignModeHint === 'boundary' ? 'boundary' as const : aligned.mode,
    align_score: aligned.alignScore,
    srt_path: srtPath,
    subtitle_count: cues.length,
  }
}

async function splitTargetsByAudioFiles(
  targets: TtsTarget[],
  audioRelativePaths: string[],
): Promise<TtsTarget[][]> {
  if (audioRelativePaths.length <= 1) return [targets]

  const durations = await Promise.all(
    audioRelativePaths.map(async (relativePath) => {
      const abs = getAbsolutePath(relativePath)
      if (!fs.existsSync(abs)) throw new Error(`音频文件不存在：${relativePath}`)
      return probeMediaDuration(abs)
    }),
  )
  const totalAudio = durations.reduce((sum, d) => sum + d, 0) || durations.length

  const weights = targets.map(item => Math.max(1, normalizeAlignText(item.parsed.pureText).length))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || targets.length
  const groups: TtsTarget[][] = audioRelativePaths.map(() => [])
  let fileIdx = 0
  let weightAcc = 0
  const fileWeightLimits = durations.map((_, idx) =>
    durations.slice(0, idx + 1).reduce((sum, d) => sum + d, 0) / totalAudio,
  )

  for (let i = 0; i < targets.length; i++) {
    weightAcc += weights[i] / totalWeight
    while (fileIdx < fileWeightLimits.length - 1 && weightAcc > fileWeightLimits[fileIdx]) {
      fileIdx++
    }
    groups[fileIdx].push(targets[i])
  }

  for (let i = 0; i < groups.length - 1; i++) {
    if (!groups[i].length && groups[i + 1].length) {
      groups[i].push(groups[i + 1].shift()!)
    }
  }

  return groups.filter(group => group.length)
}

async function splitAudioByFileBoundaries(
  targets: TtsTarget[],
  audioRelativePaths: string[],
  ts: string,
) {
  const groups = await splitTargetsByAudioFiles(targets, audioRelativePaths)
  const allResults: Array<{ storyboard_id: number; tts_audio_url: string; duration: number }> = []
  let sourceDuration = 0
  let alignScoreSum = 0
  let subtitleCount = 0
  let srtPath: string | undefined

  for (let i = 0; i < audioRelativePaths.length; i++) {
    const group = groups[i] || []
    if (!group.length) continue
    const payload = await splitAudioToTargetsBySrt(group, audioRelativePaths[i], ts, false, 'boundary')
    allResults.push(...payload.results)
    sourceDuration += payload.sourceDuration
    alignScoreSum += payload.align_score
    subtitleCount += payload.subtitle_count
    srtPath = payload.srt_path
  }

  return {
    results: allResults,
    sourceDuration,
    mode: 'multi' as const,
    align_mode: 'boundary' as const,
    align_score: alignScoreSum / Math.max(1, audioRelativePaths.length),
    srt_path: srtPath,
    subtitle_count: subtitleCount,
  }
}

async function importWholeAudioFile(audioRelativePath: string): Promise<string> {
  const inputAbs = getAbsolutePath(audioRelativePath)
  if (!fs.existsSync(inputAbs)) throw new Error(`音频文件不存在：${audioRelativePath}`)
  const dir = path.join(STORAGE_ROOT, 'audio', 'tts-import')
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(inputAbs).toLowerCase() || '.mp3'
  const filename = `${uuid()}${ext}`
  const outputAbs = path.join(dir, filename)
  fs.copyFileSync(inputAbs, outputAbs)
  return `static/audio/tts-import/${filename}`
}

export async function splitNarrationAudioForEpisode(episodeId: number, audioInput: string | string[]) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const audioPaths = (Array.isArray(audioInput) ? audioInput : [audioInput])
    .map(p => String(p || '').trim())
    .filter(Boolean)
  if (!audioPaths.length) throw new Error('请提供音频文件')

  const targets = getEpisodeTtsTargets(episodeId)
  if (!targets.length) throw new Error('当前没有可分配配音的分镜文案')

  logTaskStart('NarrationAudioSplit', 'split', {
    episodeId,
    audioCount: audioPaths.length,
    shotCount: targets.length,
    mode: audioPaths.length > 1 ? 'boundary' : 'srt',
  })

  const ts = now()
  const merged = audioPaths.length > 1
  const payload = merged
    ? await splitAudioByFileBoundaries(targets, audioPaths, ts)
    : await splitAudioToTargetsBySrt(targets, audioPaths[0], ts, false)

  logTaskSuccess('NarrationAudioSplit', 'split', {
    episodeId,
    assigned: payload.results.length,
    sourceDuration: payload.sourceDuration,
    mode: payload.mode,
    alignMode: payload.align_mode,
    alignScore: payload.align_score,
    subtitleCount: payload.subtitle_count,
  })

  return {
    assigned_count: payload.results.length,
    source_duration: payload.sourceDuration,
    segment_count: audioPaths.length,
    merged,
    mode: payload.mode,
    align_mode: payload.align_mode,
    align_score: payload.align_score,
    srt_path: payload.srt_path,
    subtitle_count: payload.subtitle_count,
    clips: payload.results,
  }
}

export async function applyUploadedTtsToStoryboard(storyboardId: number, audioRelativePath: string) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')

  const clipPath = await importWholeAudioFile(audioRelativePath)
  const result = await assignStoryboardTtsClip(sb.id, clipPath, now())
  return result
}
