/**
 * 开幕视频 — 随机 10 张配图 + 翻页片头（首尾镜固定 + 翻页音效 + 可选上传配音/字幕）
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
import { buildTitleSubtitleAssFilter, TITLE_SUBTITLE_FONT } from '../constants/title-subtitle-font.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

export const OPENING_IMAGE_COUNT = 10
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

const OPENING_SUBTITLE_SIZE = 100
const OPENING_SUBTITLE_WHITE_SIZE = OPENING_SUBTITLE_SIZE + 10
/** ASS Alignment 5 = 水平垂直居中 */
const OPENING_SUBTITLE_ALIGNMENT = 5
/** 单次书本翻页音效时长（秒），须小于转场间隔避免叠成一片 */
const PAGE_FLIP_SFX_SEC = 0.17
/** 内置翻页音效（从用户参考 MP3 截取） */
const OPENING_PAGE_FLIP_ASSET = path.resolve(__dirname, '../../assets/page-flip.wav')
/** 翻页音效参考文件，可通过 OPENING_PAGE_FLIP_REF 覆盖 */
const OPENING_PAGE_FLIP_REF = process.env.OPENING_PAGE_FLIP_REF
  || 'D:/我的/视频剪辑/NarratoAI/resource/videos/6月16日.mp3'

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

/** 开幕配图：第 1 张=集内首张配图，第 10 张=集内末张配图，中间随机 */
export function pickOpeningImages(orderedIllustrations: string[], count = OPENING_IMAGE_COUNT): string[] {
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

/** 每次翻页转场开始时播放一次书本翻页声 */
function computePageFlipSoundTimes(segmentDurations: number[], totalSec: number): number[] {
  const td = PAGE_TRANSITION_SEC
  const times: number[] = []
  let cumulative = segmentDurations[0]
  for (let i = 1; i < segmentDurations.length; i++) {
    times.push(Math.max(0, cumulative - td))
    cumulative += segmentDurations[i] - td
  }
  return times.map(t => Math.min(totalSec - 0.02, t))
}

/** 解析参考音频中的翻页声区间（silencedetect） */
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

/** 在参考音频有效区间内找平均音量最低的片段，模拟轻柔翻页 */
function findQuietestFlipOffset(refPath: string, region: { start: number; end: number }): number {
  const span = region.end - region.start
  if (span <= PAGE_FLIP_SFX_SEC) return 0

  const tempWav = path.join(STORAGE_ROOT, 'temp', 'opening', `_quiet-${uuid()}.wav`)
  fs.mkdirSync(path.dirname(tempWav), { recursive: true })
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

/** 翻页音效后处理：提亮高频，让纸张声更脆 */
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

/** 从参考 MP3 音量较低处截取，模拟轻柔书本翻页 */
function extractBookPageFlipFromReference(outputPath: string): boolean {
  if (!fs.existsSync(OPENING_PAGE_FLIP_REF)) return false
  try {
    const region = detectPageFlipRegion(OPENING_PAGE_FLIP_REF)
    const quietOffset = region ? findQuietestFlipOffset(OPENING_PAGE_FLIP_REF, region) : 0.02
    const ss = region
      ? region.start + quietOffset
      : 0.96
    runFfmpeg([
      '-ss', ss.toFixed(3), '-i', OPENING_PAGE_FLIP_REF,
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

/** 合成短促书本翻页声（兜底） */
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

/** 准备单次书本翻页音效样本 */
function preparePageFlipSfxSample(outputPath: string): void {
  if (extractBookPageFlipFromReference(outputPath)) return
  if (fs.existsSync(OPENING_PAGE_FLIP_ASSET)) {
    fs.copyFileSync(OPENING_PAGE_FLIP_ASSET, outputPath)
    return
  }
  synthesizeBookPageFlipSample(outputPath)
}

function renderPageFlipAudioTrack(flipTimes: number[], sfxPath: string, outputPath: string, totalSec: number): void {
  const n = flipTimes.length
  if (!n) {
    runFfmpeg([
      '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${totalSec}`,
      '-t', String(totalSec),
      '-c:a', 'aac', '-b:a', '128k',
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
  parts.push(`${mixIn}amix=inputs=${n}:duration=longest:dropout_transition=0:normalize=0,volume=0.88[aout]`)

  runFfmpeg([
    '-i', sfxPath,
    '-filter_complex', parts.join(';'),
    '-map', '[aout]',
    '-t', String(totalSec),
    '-c:a', 'aac', '-b:a', '128k',
    outputPath,
  ])
}

async function mixNarrationWithPageFlips(
  narrationPath: string,
  flipTrackPath: string,
  outputPath: string,
  totalSec: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(narrationPath)
      .input(flipTrackPath)
      .complexFilter(
        `[0:a]atrim=0:${totalSec},asetpts=PTS-STARTPTS[n];[n][1:a]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`,
      )
      .outputOptions(['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(totalSec)])
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
  if (!imageRels.length) throw new Error('暂无开幕配图记录，请先导出十张配图')

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

export function pickAndSaveOpeningImages(episodeId: number): string[] {
  const illustrations = collectEpisodeIllustrationPaths(episodeId)
  if (!illustrations.length) {
    throw new Error('暂无可用配图，请先生成或上传镜头配图')
  }
  const picked = pickOpeningImages(illustrations, OPENING_IMAGE_COUNT)
  db.update(schema.episodes)
    .set({ openingPickedImages: JSON.stringify(picked), updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()
  return picked
}

function resolveOpeningPickedForVideo(episodeId: number, ep: typeof schema.episodes.$inferSelect): string[] {
  const illustrations = collectEpisodeIllustrationPaths(episodeId)
  if (!illustrations.length) {
    throw new Error('暂无可用配图，请先生成或上传镜头配图')
  }
  const stored = parseOpeningPickedImages(ep.openingPickedImages)
  const storedValid = stored.length === OPENING_IMAGE_COUNT
    && stored.every(rel => fs.existsSync(toAbsPath(rel)))
  if (storedValid) return stored
  return pickOpeningImages(illustrations, OPENING_IMAGE_COUNT)
}

export async function generateOpeningVideo(episodeId: number): Promise<{
  path: string
  imageCount: number
  pickedImages: string[]
  durationSec: number
}> {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const picked = resolveOpeningPickedForVideo(episodeId, ep)
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

    const flipTimes = computePageFlipSoundTimes(segmentDurations, totalSec)
    const sfxPath = path.join(tempDir, `${uuid()}-flip.wav`)
    tempFiles.push(sfxPath)
    preparePageFlipSfxSample(sfxPath)

    const flipTrackPath = path.join(tempDir, `${uuid()}-flip-track.m4a`)
    tempFiles.push(flipTrackPath)
    renderPageFlipAudioTrack(flipTimes, sfxPath, flipTrackPath, totalSec)

    if (narrationAbs) {
      const mixedAudioPath = path.join(tempDir, `${uuid()}-mixed.m4a`)
      tempFiles.push(mixedAudioPath)
      await mixNarrationWithPageFlips(narrationAbs, flipTrackPath, mixedAudioPath, totalSec)

      let subtitlePath: string | null = null
      if (subtitleText) {
        subtitlePath = path.join(tempDir, `${uuid()}.ass`)
        tempFiles.push(subtitlePath)
        fs.writeFileSync(subtitlePath, buildOpeningAssContent(subtitleText, totalSec), 'utf-8')
      }
      await muxOpeningVideo(mergedVideoPath, mixedAudioPath, subtitlePath, outputAbs, watermarkText, watermarkAnimated)
    } else {
      await muxVideoWithAudio(mergedVideoPath, flipTrackPath, outputAbs, watermarkText, watermarkAnimated)
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
