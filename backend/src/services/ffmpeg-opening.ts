/**
 * 开幕视频 — 随机 N 张配图 + 云朵转场片头（首尾镜固定 + 可选上传配音/字幕 + 转场音效）
 */
import { execFileSync, spawnSync } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { sortStoryboardsByOrder } from './narration-image.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { appendWatermarkFilter, resolveWatermarkAnimated, resolveWatermarkText } from './ffmpeg-watermark.js'
import { PAGE_FLIP_TRANSITION_SEC, PAGE_FLIP_XFADE_TRANSITION } from './ffmpeg-page-transition.js'
import {
  computeOverlappingPageFlipSoundTimes,
  mixAudioWithPageFlipSfx,
  preparePageFlipSfxSample,
  renderPageFlipAudioTrack,
} from './ffmpeg-page-flip-sfx.js'
import { buildTitleSubtitleAssFilter, TITLE_SUBTITLE_FONT } from '../constants/title-subtitle-font.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

export const DEFAULT_OPENING_IMAGE_COUNT = 20
/** @deprecated 使用 DEFAULT_OPENING_IMAGE_COUNT */
export const OPENING_IMAGE_COUNT = DEFAULT_OPENING_IMAGE_COUNT

export function resolveOpeningImageCount(value?: unknown): number {
  if (value == null || value === '') return DEFAULT_OPENING_IMAGE_COUNT
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_OPENING_IMAGE_COUNT
  return Math.min(100, Math.max(2, Math.round(n)))
}
/** 开幕视频固定时长（秒）；有配音时也截断到此长度 */
export const OPENING_TOTAL_SEC = 3
export const OPENING_NARRATION_TEXT = '体验365个人生副本'
const OPENING_NARRATION_TEXT_LEGACY = '今天要体验的人生是'

/** 兼容旧默认文案，统一返回当前开幕字幕 */
export function resolveOpeningSubtitleText(stored?: string | null): string {
  const trimmed = stored?.trim() || ''
  if (!trimmed || trimmed === OPENING_NARRATION_TEXT_LEGACY) return OPENING_NARRATION_TEXT
  return trimmed
}
const PAGE_TRANSITION_SEC = PAGE_FLIP_TRANSITION_SEC
const OPENING_FPS = 25
const OPENING_WIDTH = 1280
const OPENING_HEIGHT = 720

const OPENING_SUBTITLE_SIZE = 120
const OPENING_SUBTITLE_WHITE_SIZE = OPENING_SUBTITLE_SIZE + 10
/** ASS Alignment 5 = 水平垂直居中 */
const OPENING_SUBTITLE_ALIGNMENT = 5

const processingEpisodes = new Set<number>()

function runFfmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' })
}

function supportsSubtitleFilter(): boolean {
  try {
    const output = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    return /\b(subtitles|ass)\b/.test(output)
  } catch {
    return false
  }
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

const OPENING_TEXT_SLIDE_MS = 420

function buildOpeningAssContent(text: string, durationSec: number) {
  const line = escapeAssText(text)
  const tags = `{\\an5\\move(640,780,640,360,0,${OPENING_TEXT_SLIDE_MS})\\fad(180,140)}`
  const end = formatAssTimestamp(durationSec)
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${OPENING_WIDTH}
PlayResY: ${OPENING_HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: OpeningWhite, ${TITLE_SUBTITLE_FONT}, ${OPENING_SUBTITLE_WHITE_SIZE}, &HFFFFFF&, &HFF000000&, &H00000000&, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 3, 1, ${OPENING_SUBTITLE_ALIGNMENT}, 0, 0, 0, 1
Style: Opening, ${TITLE_SUBTITLE_FONT}, ${OPENING_SUBTITLE_SIZE}, &H0000FF&, &HFF000000&, &H00FFFFFF&, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 3, 1, ${OPENING_SUBTITLE_ALIGNMENT}, 0, 0, 0, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${end},OpeningWhite,,0,0,0,,${tags}${line}
Dialogue: 1,0:00:00.00,${end},Opening,,0,0,0,,${tags}${line}
`
}

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
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

/** 开幕配图：第 1 张=集内首张，最后 1 张=集内末张，中间随机 */
export function pickOpeningImages(orderedIllustrations: string[], count = DEFAULT_OPENING_IMAGE_COUNT): string[] {
  if (!orderedIllustrations.length) return []
  const first = orderedIllustrations[0]
  const last = orderedIllustrations[orderedIllustrations.length - 1]
  if (count <= 1) return [first]
  if (orderedIllustrations.length === 1 || first === last) {
    return Array(count).fill(first)
  }
  if (count === 2) return [first, last]
  const middle = shufflePick(orderedIllustrations, count - 2)
  return [first, ...middle, last]
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

function buildVideoPageFlipFilter(segmentDurations: number[]): string {
  const td = PAGE_TRANSITION_SEC
  const parts: string[] = []
  const clipCount = segmentDurations.length

  let vLabel = '[0:v]'
  let cumulative = segmentDurations[0]

  for (let i = 1; i < clipCount; i++) {
    const vOut = i === clipCount - 1 ? 'vout' : `v${i}`
    const offset = Math.max(0.1, cumulative - td)
    parts.push(
      `${vLabel}[${i}:v]xfade=transition=${PAGE_FLIP_XFADE_TRANSITION}:duration=${td}:offset=${offset.toFixed(3)}[${vOut}]`,
    )
    vLabel = `[${vOut}]`
    cumulative += segmentDurations[i] - td
  }

  return parts.join(';')
}

async function appendPageFlipSfxToAudioTrack(
  audioPath: string,
  flipTimes: number[],
  totalSec: number,
  tempDir: string,
  tempFiles: string[],
): Promise<string> {
  if (!flipTimes.length) return audioPath
  const sfxSample = path.join(tempDir, `${uuid()}-flip.wav`)
  const flipTrack = path.join(tempDir, `${uuid()}-flip.m4a`)
  const mixedPath = path.join(tempDir, `${uuid()}-audio-flip.m4a`)
  tempFiles.push(sfxSample, flipTrack, mixedPath)
  preparePageFlipSfxSample(sfxSample)
  renderPageFlipAudioTrack(flipTimes, sfxSample, flipTrack, totalSec)
  await mixAudioWithPageFlipSfx(audioPath, flipTrack, mixedPath, totalSec)
  return mixedPath
}

async function muxOpeningVideo(
  videoPath: string,
  audioPath: string,
  subtitlePath: string | null,
  outputPath: string,
  watermarkText?: string | null,
  watermarkAnimated = false,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(videoPath)
      .input(audioPath)

    const filters: string[] = []
    if (subtitlePath && supportsSubtitleFilter()) {
      filters.push(buildTitleSubtitleAssFilter(subtitlePath))
    }
    appendWatermarkFilter(filters, watermarkText, { animated: watermarkAnimated })
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

async function trimAudioTrack(inputPath: string, outputPath: string, totalSec: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-af', `atrim=0:${totalSec},asetpts=PTS-STARTPTS`,
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-t', String(totalSec),
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

function renderSilentAudioTrack(outputPath: string, totalSec: number): void {
  runFfmpeg([
    '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${totalSec}`,
    '-t', String(totalSec),
    '-c:a', 'aac', '-b:a', '128k',
    outputPath,
  ])
}

async function muxVideoWithAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  watermarkText?: string | null,
  watermarkAnimated = false,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const filters: string[] = []
    appendWatermarkFilter(filters, watermarkText, { animated: watermarkAnimated })
    let command = ffmpeg()
      .input(videoPath)
      .input(audioPath)
    if (filters.length) command = command.videoFilter(filters)
    const videoCodec = filters.length
      ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'copy']
    command
      .outputOptions([
        '-map', '0:v:0',
        '-map', '1:a:0',
        ...videoCodec,
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
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

async function mergeImageClipsWithPageFlip(
  clipPaths: string[],
  durations: number[],
  outputPath: string,
  totalSec: number,
): Promise<void> {
  if (clipPaths.length === 1) {
    fs.copyFileSync(clipPaths[0], outputPath)
    return
  }

  const filterComplex = buildVideoPageFlipFilter(durations)
  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
    for (const clip of clipPaths) command = command.input(clip)
    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[vout]',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-t', String(totalSec),
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
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

export function parseOpeningPickedImages(raw?: string | null): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

/** 将开幕视频所用配图打包为 zip，返回 zip 绝对路径（调用方负责删除所在临时目录） */
export function buildOpeningPickedImagesZip(imageRels: string[]): { zipPath: string; tempDir: string } {
  if (!imageRels.length) throw new Error('暂无开幕配图记录，请先导出配图')

  const tempDir = path.join(STORAGE_ROOT, 'temp', 'opening', `zip-${uuid()}`)
  const stagingDir = path.join(tempDir, 'files')
  fs.mkdirSync(stagingDir, { recursive: true })

  const staged: string[] = []
  for (let i = 0; i < imageRels.length; i++) {
    const abs = toAbsPath(imageRels[i])
    if (!fs.existsSync(abs)) throw new Error(`开幕配图文件缺失（第 ${i + 1} 张），请重新导出配图`)
    const ext = path.extname(abs) || '.jpg'
    const name = `opening-${String(i + 1).padStart(2, '0')}${ext}`
    fs.copyFileSync(abs, path.join(stagingDir, name))
    staged.push(name)
  }

  const zipPath = path.join(tempDir, 'opening-images.zip')
  const result = spawnSync('tar', ['-a', '-c', '-f', zipPath, ...staged], { cwd: stagingDir })
  if (result.status !== 0 || !fs.existsSync(zipPath)) {
    throw new Error(result.stderr?.toString().trim() || '打包 zip 失败')
  }

  return { zipPath, tempDir }
}

export function pickAndSaveOpeningImages(episodeId: number, count?: number): string[] {
  const illustrations = collectEpisodeIllustrationPaths(episodeId)
  if (!illustrations.length) {
    throw new Error('暂无可用配图，请先生成或上传镜头配图')
  }
  const resolvedCount = resolveOpeningImageCount(count)
  const picked = pickOpeningImages(illustrations, resolvedCount)
  db.update(schema.episodes)
    .set({ openingPickedImages: JSON.stringify(picked), updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()
  return picked
}

function resolveOpeningPickedForVideo(
  episodeId: number,
  ep: typeof schema.episodes.$inferSelect,
  count?: number,
): string[] {
  const illustrations = collectEpisodeIllustrationPaths(episodeId)
  if (!illustrations.length) {
    throw new Error('暂无可用配图，请先生成或上传镜头配图')
  }
  const stored = parseOpeningPickedImages(ep.openingPickedImages)
  const storedValid = stored.length >= 2
    && stored.every(rel => fs.existsSync(toAbsPath(rel)))
  if (storedValid) return stored
  return pickOpeningImages(illustrations, resolveOpeningImageCount(count))
}

export async function generateOpeningVideo(episodeId: number, count?: number): Promise<{
  path: string
  imageCount: number
  pickedImages: string[]
  durationSec: number
}> {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const picked = resolveOpeningPickedForVideo(episodeId, ep, count)
  const illustrationPool = collectEpisodeIllustrationPaths(episodeId).length
  const tempDir = path.join(STORAGE_ROOT, 'temp', 'opening')
  const outputDir = path.join(STORAGE_ROOT, 'opening')
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(outputDir, { recursive: true })

  const tempFiles: string[] = []
  logTaskStart('OpeningVideo', 'generate', { episodeId, illustrationPool, picked: picked.length })

  try {
    const uploadedAudioRel = ep.openingAudioUrl?.trim() || ''
    const subtitleText = uploadedAudioRel ? resolveOpeningSubtitleText(ep.openingSubtitleText) : ''
    if (uploadedAudioRel && ep.openingSubtitleText?.trim() === OPENING_NARRATION_TEXT_LEGACY) {
      db.update(schema.episodes)
        .set({ openingSubtitleText: subtitleText, updatedAt: now() })
        .where(eq(schema.episodes.id, episodeId))
        .run()
    }

    const watermarkText = resolveWatermarkText(ep.watermarkText)
    const watermarkAnimated = resolveWatermarkAnimated(ep.watermarkAnimated)

    const totalSec = OPENING_TOTAL_SEC
    let narrationAbs: string | null = null
    if (uploadedAudioRel) {
      narrationAbs = toAbsPath(uploadedAudioRel)
      if (!fs.existsSync(narrationAbs)) {
        throw new Error('开幕配音文件不存在，请重新上传 MP3')
      }
    }

    const imageCount = picked.length
    const transitionTotal = Math.max(0, imageCount - 1) * PAGE_TRANSITION_SEC
    const perImageDuration = Math.max(
      0.25,
      (totalSec + transitionTotal) / imageCount,
    )
    const segmentDurations = picked.map(() => perImageDuration)

    const clipPaths: string[] = []
    for (let i = 0; i < picked.length; i++) {
      const clipPath = path.join(tempDir, `${uuid()}-clip.mp4`)
      tempFiles.push(clipPath)
      await renderImageClip(toAbsPath(picked[i]), perImageDuration, clipPath)
      clipPaths.push(clipPath)
    }

    const outputFilename = `${uuid()}.mp4`
    const outputAbs = path.join(outputDir, outputFilename)

    const mergedVideoPath = path.join(tempDir, `${uuid()}-merged.mp4`)
    tempFiles.push(mergedVideoPath)
    await mergeImageClipsWithPageFlip(clipPaths, segmentDurations, mergedVideoPath, totalSec)

    const flipTimes = computeOverlappingPageFlipSoundTimes(segmentDurations, totalSec)

    let subtitlePath: string | null = null
    if (subtitleText) {
      subtitlePath = path.join(tempDir, `${uuid()}.ass`)
      tempFiles.push(subtitlePath)
      fs.writeFileSync(subtitlePath, buildOpeningAssContent(subtitleText, totalSec), 'utf-8')
    }

    if (narrationAbs) {
      const narrationTrackPath = path.join(tempDir, `${uuid()}-narration.m4a`)
      tempFiles.push(narrationTrackPath)
      await trimAudioTrack(narrationAbs, narrationTrackPath, totalSec)
      const audioWithSfx = await appendPageFlipSfxToAudioTrack(
        narrationTrackPath,
        flipTimes,
        totalSec,
        tempDir,
        tempFiles,
      )
      await muxOpeningVideo(mergedVideoPath, audioWithSfx, subtitlePath, outputAbs, watermarkText, watermarkAnimated)
    } else {
      const silentTrackPath = path.join(tempDir, `${uuid()}-silent.m4a`)
      tempFiles.push(silentTrackPath)
      renderSilentAudioTrack(silentTrackPath, totalSec)
      const audioWithSfx = await appendPageFlipSfxToAudioTrack(
        silentTrackPath,
        flipTimes,
        totalSec,
        tempDir,
        tempFiles,
      )
      await muxVideoWithAudio(mergedVideoPath, audioWithSfx, outputAbs, watermarkText, watermarkAnimated)
    }

    const relativePath = `static/opening/${outputFilename}`
    db.update(schema.episodes)
      .set({
        openingVideoUrl: relativePath,
        openingVideoError: null,
        openingPickedImages: JSON.stringify(picked),
        updatedAt: now(),
      })
      .where(eq(schema.episodes.id, episodeId))
      .run()

    logTaskSuccess('OpeningVideo', 'generate', {
      episodeId,
      path: relativePath,
      imageCount,
      durationSec: totalSec,
      hasUploadedAudio: !!narrationAbs,
      hasSubtitle: !!subtitleText,
    })

    return {
      path: relativePath,
      imageCount,
      pickedImages: picked,
      durationSec: totalSec,
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

export function startOpeningVideoGeneration(episodeId: number, count?: number): void {
  if (processingEpisodes.has(episodeId)) return
  processingEpisodes.add(episodeId)
  db.update(schema.episodes)
    .set({ openingVideoError: null, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  generateOpeningVideo(episodeId, count)
    .catch(() => {})
    .finally(() => {
      processingEpisodes.delete(episodeId)
    })
}
