/**
 * 开幕视频 — 随机 8 张配图 + 翻页转场 + 「今天要体验的人生是」配音字幕
 */
import { execFileSync } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { generateTTS } from './tts-generation.js'
import { resolveEdgeVoice } from './edge-tts-local.js'
import { resolveNarrationVoiceId } from './narration-tts.js'
import { sortStoryboardsByOrder } from './narration-image.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

export const OPENING_NARRATION_TEXT = '今天要体验的人生是'
export const OPENING_IMAGE_COUNT = 8
const PAGE_TRANSITION_SEC = 0.45
const OPENING_FPS = 25
const OPENING_WIDTH = 1280
const OPENING_HEIGHT = 720
const OPENING_SUBTITLE_SIZE = 52

const processingEpisodes = new Set<number>()

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function supportsSubtitleFilter(): boolean {
  try {
    const output = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    return /\b(subtitles|ass)\b/.test(output)
  } catch {
    return false
  }
}

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(Math.max(0.5, Number(data.format.duration) || 1))
    })
  })
}

function shufflePick<T>(items: T[], count: number): T[] {
  if (!items.length) return []
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count) {
    if (!pool.length) pool.push(...items)
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

function collectEpisodeIllustrationPaths(episodeId: number): string[] {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )
  const unique = new Set<string>()
  for (const sb of storyboards) {
    for (const rel of [sb.composedImage, sb.firstFrameImage]) {
      if (!rel?.trim()) continue
      const abs = toAbsPath(rel.trim())
      if (fs.existsSync(abs)) unique.add(rel.trim())
    }
  }
  return [...unique]
}

function formatAssTimestamp(seconds: number) {
  const totalCs = Math.max(50, Math.round(seconds * 100))
  const h = Math.floor(totalCs / 360000)
  const m = Math.floor((totalCs % 360000) / 6000)
  const s = Math.floor((totalCs % 6000) / 100)
  const cs = totalCs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function escapeAssText(text: string) {
  return text.replace(/\r/g, '').replace(/\n/g, ' ').trim()
}

function buildOpeningAssContent(text: string, durationSec: number) {
  const line = escapeAssText(text)
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${OPENING_WIDTH}
PlayResY: ${OPENING_HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Opening, Microsoft YaHei, ${OPENING_SUBTITLE_SIZE}, &H00FFFF&, &HFF000000&, &H00000000&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 2, 2, 40, 40, 28, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${formatAssTimestamp(durationSec)},Opening,,0,0,0,,${line}
`
}

function buildVideoPageFlipFilter(segmentDurations: number[]): string {
  const td = PAGE_TRANSITION_SEC
  const parts: string[] = []
  let vLabel = '[0:v]'
  let cumulative = segmentDurations[0]

  for (let i = 1; i < segmentDurations.length; i++) {
    const vOut = i === segmentDurations.length - 1 ? 'vout' : `v${i}`
    const offset = Math.max(0.1, cumulative - td)
    const transition = i % 2 === 0 ? 'hlwind' : 'hrwind'
    parts.push(
      `${vLabel}[${i}:v]xfade=transition=${transition}:duration=${td}:offset=${offset.toFixed(3)}[${vOut}]`,
    )
    vLabel = `[${vOut}]`
    cumulative += segmentDurations[i] - td
  }

  return parts.join(';')
}

async function renderImageClip(imageAbsPath: string, durationSec: number, outputPath: string): Promise<void> {
  const filter = `scale=${OPENING_WIDTH}:${OPENING_HEIGHT}:force_original_aspect_ratio=increase,crop=${OPENING_WIDTH}:${OPENING_HEIGHT},fps=${OPENING_FPS},format=yuv420p`
  await new Promise<void>((resolve, reject) => {
    ffmpeg(imageAbsPath)
      .inputOptions(['-loop', '1'])
      .videoFilter(filter)
      .outputOptions([
        '-t', String(durationSec),
        '-an',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', String(OPENING_FPS),
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

async function mergeImageClipsWithPageFlip(clipPaths: string[], durations: number[], outputPath: string): Promise<void> {
  if (clipPaths.length === 1) {
    fs.copyFileSync(clipPaths[0], outputPath)
    return
  }

  const filterComplex = buildVideoPageFlipFilter(durations)
  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
    for (const clip of clipPaths) command = command.input(clip)
    command = command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[vout]',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

async function muxOpeningVideo(
  videoPath: string,
  audioPath: string,
  subtitlePath: string | null,
  outputPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(videoPath)
      .input(audioPath)

    const filters: string[] = []
    if (subtitlePath && supportsSubtitleFilter()) {
      const escaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
      filters.push(`ass='${escaped}'`)
    }
    if (filters.length) command = command.videoFilter(filters)

    command
      .outputOptions([
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

async function resolveOpeningVoiceId(episodeId: number, dramaId: number): Promise<string> {
  const chars = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId))
    .all()
    .filter(ch => !ch.deletedAt)
  const voiceId = resolveNarrationVoiceId('旁白', chars, { isTitleShot: true })
  return resolveEdgeVoice(voiceId)
}

function cleanupTempFiles(paths: string[]) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      try { fs.unlinkSync(p) } catch {}
    }
  }
}

export function isOpeningVideoProcessing(episodeId: number): boolean {
  return processingEpisodes.has(episodeId)
}

export async function generateOpeningVideo(episodeId: number): Promise<{
  path: string
  imageCount: number
  pickedImages: string[]
  durationSec: number
}> {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const illustrations = collectEpisodeIllustrationPaths(episodeId)
  if (!illustrations.length) {
    throw new Error('暂无可用配图，请先生成或上传镜头配图')
  }

  const picked = shufflePick(illustrations, OPENING_IMAGE_COUNT)
  const tempDir = path.join(STORAGE_ROOT, 'temp', 'opening')
  const outputDir = path.join(STORAGE_ROOT, 'opening')
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(outputDir, { recursive: true })

  const tempFiles: string[] = []
  logTaskStart('OpeningVideo', 'generate', { episodeId, illustrationPool: illustrations.length, picked: picked.length })

  try {
    const voice = await resolveOpeningVoiceId(episodeId, ep.dramaId)
    const audioRel = await generateTTS({
      text: OPENING_NARRATION_TEXT,
      voice,
      configId: null,
      localTts: true,
    })
    const audioAbs = toAbsPath(audioRel)
    const audioDuration = await probeMediaDuration(audioAbs)

    const imageCount = picked.length
    const transitionTotal = Math.max(0, imageCount - 1) * PAGE_TRANSITION_SEC
    const perImageDuration = Math.max(
      0.55,
      (audioDuration - transitionTotal) / imageCount,
    )
    const segmentDurations = picked.map(() => perImageDuration)

    const clipPaths: string[] = []
    for (let i = 0; i < picked.length; i++) {
      const clipPath = path.join(tempDir, `${uuid()}-clip.mp4`)
      tempFiles.push(clipPath)
      await renderImageClip(toAbsPath(picked[i]), perImageDuration, clipPath)
      clipPaths.push(clipPath)
    }

    const mergedVideoPath = path.join(tempDir, `${uuid()}-merged.mp4`)
    tempFiles.push(mergedVideoPath)
    await mergeImageClipsWithPageFlip(clipPaths, segmentDurations, mergedVideoPath)

    const subtitlePath = path.join(tempDir, `${uuid()}.ass`)
    tempFiles.push(subtitlePath)
    fs.writeFileSync(subtitlePath, buildOpeningAssContent(OPENING_NARRATION_TEXT, audioDuration), 'utf-8')

    const outputFilename = `${uuid()}.mp4`
    const outputAbs = path.join(outputDir, outputFilename)
    await muxOpeningVideo(mergedVideoPath, audioAbs, subtitlePath, outputAbs)

    const relativePath = `static/opening/${outputFilename}`
    db.update(schema.episodes)
      .set({
        openingVideoUrl: relativePath,
        openingVideoError: null,
        updatedAt: now(),
      })
      .where(eq(schema.episodes.id, episodeId))
      .run()

    logTaskSuccess('OpeningVideo', 'generate', {
      episodeId,
      path: relativePath,
      imageCount,
      durationSec: audioDuration,
    })

    return {
      path: relativePath,
      imageCount,
      pickedImages: picked,
      durationSec: audioDuration,
    }
  } catch (err: any) {
    logTaskError('OpeningVideo', 'generate', { episodeId, error: err.message })
    db.update(schema.episodes)
      .set({ openingVideoError: err.message, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId))
      .run()
    throw err
  } finally {
    cleanupTempFiles(tempFiles)
  }
}

export function startOpeningVideoGeneration(episodeId: number): void {
  if (processingEpisodes.has(episodeId)) return
  processingEpisodes.add(episodeId)
  db.update(schema.episodes)
    .set({ openingVideoError: null, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  generateOpeningVideo(episodeId)
    .catch(() => {})
    .finally(() => {
      processingEpisodes.delete(episodeId)
    })
}
