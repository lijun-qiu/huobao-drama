/**
 * FFmpeg 单镜头合成 — 视频/配图 + TTS音频 + 烧录字幕
 */
import { createHash } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq, inArray } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { BGM_SOLO_VOLUME, BGM_VOICE_MIX_VOLUME } from './bgm-generation.js'
import { generateTTS } from './tts-generation.js'
import { resolveEdgeVoice } from './edge-tts-local.js'
import { resolveVoiceboxProfileId } from './voicebox-tts.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { isNarrationStoryboard, isStoryboardTitleShot, parseNarrationImageMeta, resolveStoryboardVisualSource, resolveStoryboardSubtitleNarration, sortStoryboardsByOrder } from './narration-image.js'
import { deleteEpisodeAssetFileIfUnreferenced } from './storyboard-asset-replace.js'
import { TITLE_SUBTITLE_FONT } from '../constants/title-subtitle-font.js'
import { parseDialogueForTTS, resolveNarrationVoiceId, resolveStoryboardTtsSource } from './narration-tts.js'
import { appendWatermarkFilter, resolveWatermarkAnimated, resolveWatermarkText } from './ffmpeg-watermark.js'
import { PAGE_FLIP_TRANSITION_SEC } from './ffmpeg-page-transition.js'
import { resolveTtsSpeed } from '../utils/tts-speed.js'
import { resolveVoiceboxInstruct } from '../utils/voicebox-instruct.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'
import {
  buildCombinedAssHeader,
  buildNarrationEmphasisAssContent,
  buildNarrationEmphasisAssDialogueLine,
  buildNarrationPlainAssContent,
  buildNarrationPlainAssDialogueLine,
  hasEmphasisMarkers,
  NARRATION_SUBTITLE_FONT_SIZE,
  NARRATION_SUBTITLE_MARGIN_V,
  NARRATION_SUBTITLE_PLAY_RES_X,
  NARRATION_SUBTITLE_PLAY_RES_Y,
  stripSubtitlePunctuationPreservingEmphasis,
} from '../utils/subtitle-emphasis.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')
let subtitleFilterSupport: boolean | null = null
const imageBaseCacheInflight = new Map<string, Promise<string>>()
const groupComposeInflight = new Map<string, Promise<string>>()

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function supportsSubtitleFilter(): boolean {
  if (subtitleFilterSupport != null) return subtitleFilterSupport
  try {
    const output = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    subtitleFilterSupport = /\b(subtitles|ass)\b/.test(output)
  } catch {
    subtitleFilterSupport = false
  }
  return subtitleFilterSupport
}

export function getStoryboardVisualSource(sb: {
  id?: number
  storyboardNumber?: number
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
}, episodeStoryboards?: Array<{
  id: number
  storyboardNumber: number
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
}>) {
  if (episodeStoryboards?.length && sb.id != null) {
    const resolved = resolveStoryboardVisualSource(episodeStoryboards, sb.id)
    if (resolved) {
      return {
        type: resolved.type,
        path: toAbsPath(resolved.path),
        inherited: resolved.inherited,
        inheritedFrom: resolved.inheritedFrom,
      }
    }
    return null
  }
  if (sb.videoUrl) return { type: 'video' as const, path: toAbsPath(sb.videoUrl) }
  const image = sb.composedImage || sb.firstFrameImage
  if (image) return { type: 'image' as const, path: toAbsPath(image) }
  return null
}

/** 烧录字幕用：去掉中英文标点，保留正文与空格 */
function stripSubtitlePunctuation(text: string): string {
  return text
    .replace(/[，。！？；：、,.!?;:'"''""（）()\[\]《》【】「」『』…—·\-~～]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(Math.max(1, Number(data.format.duration) || 1))
    })
  })
}

function formatAssTimestamp(seconds: number) {
  const totalCs = Math.max(0, Math.round(seconds * 100))
  const h = Math.floor(totalCs / 360000)
  const m = Math.floor((totalCs % 360000) / 6000)
  const s = Math.floor((totalCs % 6000) / 100)
  const cs = totalCs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

const TITLE_FONT_SIZE = 94
const TITLE_WHITE_FONT_SIZE = TITLE_FONT_SIZE + 10

function escapeAssChar(ch: string) {
  if (ch === '\n') return '\\N'
  if (ch === '{') return '('
  if (ch === '}') return ')'
  return ch
}

function escapeAssText(text: string) {
  return [...text.replace(/\r/g, '')].map(escapeAssChar).join('')
}

/** 片头「剧中」红字：ASS 居中整句显示（无打字机） */
function buildTitleAssHeader() {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TitleWhite, ${TITLE_SUBTITLE_FONT}, ${TITLE_WHITE_FONT_SIZE}, &HFFFFFF&, &HFF000000&, &H00000000&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1
Style: Title, ${TITLE_SUBTITLE_FONT}, ${TITLE_FONT_SIZE}, &H0014F0&, &HFF000000&, &H00FFFFFF&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}

const TITLE_TEXT_SLIDE_MS = 420
/** 片头字幕相对该句音频起点的显示延迟（原 0.5s，提前 0.5s 后为 0） */
const TITLE_SUBTITLE_START_DELAY_SEC = 0

/** 片头字幕：自下往上滑入 + 白底大字叠红字（同文案，白字大 10 号） */
function buildTitleAssDialogueLine(text: string, startSec: number, endSec: number) {
  const line = escapeAssText(text.replace(/\r/g, '').replace(/\n/g, ' ').trim())
  const tags = `{\\an5\\move(640,780,640,360,0,${TITLE_TEXT_SLIDE_MS})\\fad(180,140)}`
  const start = formatAssTimestamp(startSec)
  const end = formatAssTimestamp(endSec)
  const white = `Dialogue: 0,${start},${end},TitleWhite,,0,0,0,,${tags}${line}`
  const red = `Dialogue: 1,${start},${end},Title,,0,0,0,,${tags}${line}`
  return `${white}\n${red}`
}

function buildTitleAssContent(text: string, durationSec: number, startOffsetSec = 0) {
  const startAt = startOffsetSec + TITLE_SUBTITLE_START_DELAY_SEC
  const endAt = startOffsetSec + Math.max(durationSec, 0.1)
  return `${buildTitleAssHeader()}${buildTitleAssDialogueLine(text, startAt, endAt)}\n`
}

function fmtComposeFilterSec(sec: number): string {
  return Math.max(0.001, sec).toFixed(3)
}

/** 合成转场 hold（= PAGE_FLIP_TRANSITION_SEC）；同配图组内仅首镜 start、末镜 stop，避免句间硬切时缩放顿住 */
function resolveComposeTransitionPadSec(): number {
  return PAGE_FLIP_TRANSITION_SEC
}

type ComposeTransitionPads = {
  startPadSec: number
  endPadSec: number
}

function resolveComposeOutputDuration(contentDurationSec: number, pads: ComposeTransitionPads): number {
  return Math.max(0.001, contentDurationSec + pads.startPadSec + pads.endPadSec)
}

function buildComposeTransitionVideoPadFilter(pads: ComposeTransitionPads): string | null {
  const parts: string[] = []
  if (pads.startPadSec > 0) {
    parts.push(`start_mode=clone:start_duration=${fmtComposeFilterSec(pads.startPadSec)}`)
  }
  if (pads.endPadSec > 0) {
    parts.push(`stop_mode=clone:stop_duration=${fmtComposeFilterSec(pads.endPadSec)}`)
  }
  if (!parts.length) return null
  return `tpad=${parts.join(':')}`
}

function appendComposeTransitionVideoPad(filters: string[], pads: ComposeTransitionPads): void {
  const filter = buildComposeTransitionVideoPadFilter(pads)
  if (filter) filters.push(filter)
}

/** 转场 tpad 须在烧录字幕之前，否则首尾 hold 会把已烧字幕整体推迟，与 adelay 旁白不同步 */
function appendComposeVideoPostFilters(
  filters: string[],
  subtitlePath: string | null | undefined,
  isTitleShot: boolean,
  pads: ComposeTransitionPads,
  watermarkText?: string | null,
  watermarkAnimated = false,
): void {
  appendComposeTransitionVideoPad(filters, pads)
  if (subtitlePath && supportsSubtitleFilter()) {
    filters.push(buildSubtitleFilter(subtitlePath, isTitleShot))
  }
  appendWatermarkFilter(filters, watermarkText, { animated: watermarkAnimated })
}

function buildComposeTransitionAudioPadFilter(inputIndex: number, label: string, pads: ComposeTransitionPads): string {
  const filters: string[] = []
  if (pads.startPadSec > 0) {
    const delayMs = Math.round(pads.startPadSec * 1000)
    filters.push(`adelay=${delayMs}|${delayMs}`)
  }
  if (pads.endPadSec > 0) {
    filters.push(`apad=pad_dur=${fmtComposeFilterSec(pads.endPadSec)}`)
  }
  if (!filters.length) {
    return `[${inputIndex}:a]anull[${label}]`
  }
  return `[${inputIndex}:a]${filters.join(',')}[${label}]`
}

function buildSubtitleForceStyle(isTitleShot: boolean) {
  if (isTitleShot) {
    return `FontName=${TITLE_SUBTITLE_FONT}\\,FontSize=${TITLE_FONT_SIZE}\\,PrimaryColour=&H0014F0&\\,OutlineColour=&HFFFFFF&\\,Outline=3\\,Bold=1\\,Alignment=5\\,MarginL=0\\,MarginR=0\\,MarginV=0`
  }
  return `FontSize=${NARRATION_SUBTITLE_FONT_SIZE}\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2\\,Alignment=2\\,MarginV=${NARRATION_SUBTITLE_MARGIN_V}`
}

function buildSubtitleFilter(subtitlePath: string, isTitleShot: boolean) {
  const escapedPath = subtitlePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
  const playRes = `${NARRATION_SUBTITLE_PLAY_RES_X}x${NARRATION_SUBTITLE_PLAY_RES_Y}`
  // 片头 ASS 保留 ass 滤镜以兼容 \move；旁白 ASS 走 subtitles+original_size，与历史 SRT 底栏位置一致
  if (subtitlePath.toLowerCase().endsWith('.ass')) {
    if (isTitleShot) return `ass='${escapedPath}'`
    return `subtitles=filename='${escapedPath}':original_size=${playRes}`
  }
  const forceStyle = buildSubtitleForceStyle(isTitleShot)
  return `subtitles=filename='${escapedPath}':original_size=1280x720:force_style='${forceStyle}'`
}

function buildImageMotionFilter() {
  const fps = 25
  return `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=${fps},format=yuv420p`
}

/** 配图推镜：同图每镜 +0.02 连续放大；换图后奇数页从上一图峰值回拉至 1，再下一张从 1 重开 */
const SAME_IMAGE_ZOOM_STEP = 0.02
const COMPOSE_FPS = 25

type VisualStoryboard = {
  id: number
  storyboardNumber: number
  referenceImages?: string | null
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
}

type VisualGroupInfo = {
  /** 配图页序号（0 起，换图 +1） */
  pageIndex: number
  /** 当前镜头在同配图组内的序号（0 起） */
  shotIndexInGroup: number
  /** 上一配图组的镜头数（奇数页回拉时计算起点） */
  prevGroupShotCount: number
}

function getStoryboardVisualKey(sb: VisualStoryboard, storyboards: VisualStoryboard[]) {
  const visual = resolveStoryboardVisualSource(storyboards, sb.id)
  if (!visual) return `none:${sb.id}`
  return `${visual.type}:${visual.path}`
}

function buildVisualGroups(ordered: VisualStoryboard[]) {
  if (ordered.length === 0) return [] as { start: number; end: number }[]

  const groups: { start: number; end: number }[] = []
  let groupStart = 0
  let prevKey = getStoryboardVisualKey(ordered[0], ordered)
  for (let i = 1; i < ordered.length; i++) {
    const currKey = getStoryboardVisualKey(ordered[i], ordered)
    if (currKey !== prevKey) {
      groups.push({ start: groupStart, end: i - 1 })
      groupStart = i
      prevKey = currKey
    }
  }
  groups.push({ start: groupStart, end: ordered.length - 1 })
  return groups
}

/** 当前镜头在分集内的配图组信息 */
function getVisualGroupInfo(storyboardId: number, episodeStoryboards: VisualStoryboard[]): VisualGroupInfo {
  const ordered = sortStoryboardsByOrder(episodeStoryboards)
  const idx = ordered.findIndex(sb => sb.id === storyboardId)
  if (idx < 0) return { pageIndex: 0, shotIndexInGroup: 0, prevGroupShotCount: 0 }

  const groups = buildVisualGroups(ordered)
  const groupIndex = groups.findIndex(group => idx >= group.start && idx <= group.end)
  const group = groups[groupIndex >= 0 ? groupIndex : 0]
  const prevGroupShotCount = groupIndex > 0
    ? groups[groupIndex - 1].end - groups[groupIndex - 1].start + 1
    : 0

  return {
    pageIndex: groupIndex >= 0 ? groupIndex : 0,
    shotIndexInGroup: idx - group.start,
    prevGroupShotCount,
  }
}

function resolveComposeTransitionPads(
  storyboardId: number,
  episodeStoryboards: VisualStoryboard[],
): ComposeTransitionPads {
  const pad = resolveComposeTransitionPadSec()
  const ordered = sortStoryboardsByOrder(episodeStoryboards)
  const idx = ordered.findIndex(sb => sb.id === storyboardId)
  if (idx < 0) return { startPadSec: pad, endPadSec: pad }

  const groups = buildVisualGroups(ordered)
  const group = groups.find(g => idx >= g.start && idx <= g.end) ?? groups[0]
  return {
    startPadSec: idx === group.start ? pad : 0,
    endPadSec: idx === group.end ? pad : 0,
  }
}

function durationToFrameCount(durationSec: number, fps = COMPOSE_FPS) {
  return Math.max(2, Math.round(durationSec * fps))
}

function buildShotZoomRange(pageIndex: number, shotIndexInGroup: number, prevGroupShotCount: number) {
  if (pageIndex % 2 === 0) {
    const startZ = 1 + shotIndexInGroup * SAME_IMAGE_ZOOM_STEP
    return { startZ, endZ: startZ + SAME_IMAGE_ZOOM_STEP }
  }
  const peakZ = 1 + prevGroupShotCount * SAME_IMAGE_ZOOM_STEP
  const startZ = peakZ - shotIndexInGroup * SAME_IMAGE_ZOOM_STEP
  return { startZ, endZ: startZ - SAME_IMAGE_ZOOM_STEP }
}

/** 单镜配图：同图逐镜递进缩放（中心缩放） */
function buildShotZoomMotionFilter(info: VisualGroupInfo, durationSec: number, fps = COMPOSE_FPS) {
  const frames = durationToFrameCount(durationSec, fps)
  const { startZ, endZ } = buildShotZoomRange(info.pageIndex, info.shotIndexInGroup, info.prevGroupShotCount)
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${frames - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 同配图多句：整组一条线性推/拉镜，缩放速率随总时长均匀分布 */
function buildGroupProgressiveZoomFilter(
  shotDurationsSec: number[],
  pageIndex: number,
  prevGroupShotCount: number,
  fps = COMPOSE_FPS,
) {
  const frameCounts = shotDurationsSec.map(d => durationToFrameCount(d, fps))
  const totalFrames = frameCounts.reduce((sum, count) => sum + count, 0)
  const shotCount = shotDurationsSec.length

  let startZ: number
  let endZ: number
  if (pageIndex % 2 === 0) {
    startZ = 1
    endZ = 1 + shotCount * SAME_IMAGE_ZOOM_STEP
  } else {
    startZ = 1 + prevGroupShotCount * SAME_IMAGE_ZOOM_STEP
    endZ = 1
  }
  const delta = endZ - startZ

  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${totalFrames - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 片头镜在同背景组内的序号（多句片头共用 1 张图时用于连续推镜） */
function getTitleGroupInfo(storyboardId: number, episodeStoryboards: VisualStoryboard[]) {
  const ordered = sortStoryboardsByOrder(episodeStoryboards)
  const titleShots = ordered.filter(sb => {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    return meta.narration_shot_type === 'title'
  })
  const idx = titleShots.findIndex(sb => sb.id === storyboardId)
  return { shotIndexInGroup: idx >= 0 ? idx : 0 }
}

/** 片头动态底：按镜头时长推镜 + RGB 色散 + 暗角；多句片头在同图内缩放连续递进 */
function buildTitleShotMotionFilter(durationSec: number, shotIndexInGroup: number, fps = COMPOSE_FPS) {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1 + shotIndexInGroup * SAME_IMAGE_ZOOM_STEP
  const endZ = startZ + SAME_IMAGE_ZOOM_STEP
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${frames - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'rgbashift=rh=-5:gh=0:bv=5',
    'vignette=angle=PI/5',
    'format=yuv420p',
  ].join(',')
}

async function isValidVideoFile(filePath: string): Promise<boolean> {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < 1024) return false
    await probeMediaDuration(filePath)
    return true
  } catch {
    return false
  }
}

/** 同一张配图生成共享底片；片头启用 dynamic 动态底 */
async function getSharedImageBaseVideo(imageAbsPath: string, options?: { dynamic?: boolean }): Promise<string> {
  const cacheDir = path.join(STORAGE_ROOT, 'temp', 'image-bases')
  fs.mkdirSync(cacheDir, { recursive: true })
  const key = createHash('md5').update(`${imageAbsPath}|${options?.dynamic ? 'dynamic' : 'static'}`).digest('hex')
  const cached = path.join(cacheDir, `${key}-base.mp4`)

  if (fs.existsSync(cached)) {
    if (await isValidVideoFile(cached)) return cached
    try { fs.unlinkSync(cached) } catch {}
  }

  const inflight = imageBaseCacheInflight.get(key)
  if (inflight) return inflight

  const videoFilter = options?.dynamic
    ? buildTitleShotMotionFilter(30, 0)
    : buildImageMotionFilter()
  const buildPromise = (async () => {
    const tmpPath = path.join(cacheDir, `${key}-base.${uuid()}.tmp.mp4`)
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(imageAbsPath)
          .inputOptions(['-loop', '1'])
          .videoFilter(videoFilter)
          .outputOptions([
            '-t', '30',
            '-an',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-g', '1',
            '-keyint_min', '1',
            '-tune', 'stillimage',
            '-pix_fmt', 'yuv420p',
            '-r', '25',
          ])
          .output(tmpPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      if (!(await isValidVideoFile(tmpPath))) {
        throw new Error(`Generated image base video is invalid: ${tmpPath}`)
      }

      fs.renameSync(tmpPath, cached)
      return cached
    } finally {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath) } catch {}
      }
      imageBaseCacheInflight.delete(key)
    }
  })()

  imageBaseCacheInflight.set(key, buildPromise)
  return buildPromise
}

function escapeConcatMediaPath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

async function concatAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 1) {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPaths[0])
        .outputOptions(['-c:a', 'aac', '-ar', '48000', '-b:a', '192k'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
    return
  }

  const listPath = path.join(os.tmpdir(), `huobao-${uuid()}.txt`)
  const listContent = audioPaths.map(p => `file '${escapeConcatMediaPath(p)}'`).join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'aac', '-ar', '48000', '-b:a', '192k'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }
}

/** 同配图多句：一次渲染，避免句间切换时背景跳动 */
export async function renderSameImageGroupSegment(
  orderedStoryboards: Array<{
    id: number
    dialogue?: string | null
    referenceImages?: string | null
    ttsAudioUrl?: string | null
  }>,
  imageAbsPath: string,
  outputPath: string,
  pageIndex = 0,
  prevGroupShotCount = 0,
): Promise<number> {
  const tempDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(tempDir, { recursive: true })

  const transitionPad = resolveComposeTransitionPadSec()
  const transitionPads: ComposeTransitionPads = { startPadSec: transitionPad, endPadSec: transitionPad }
  let offsetSec = 0
  let titleMode = false
  type GroupSubtitleLine =
    | { type: 'title'; text: string; startSec: number; endSec: number }
    | {
      type: 'narration'
      displayText: string
      markedText: string
      startSec: number
      endSec: number
      durationSec: number
      index: number
    }
  const subtitleLines: GroupSubtitleLine[] = []
  const audioPaths: string[] = []
  const shotDurationsSec: number[] = []

  for (let i = 0; i < orderedStoryboards.length; i++) {
    const sb = orderedStoryboards[i]
    const parsed = parseDialogueForTTS(sb.dialogue)
    const isTitleShot = isStoryboardTitleShot(sb)
    if (isTitleShot) titleMode = true

    if (!sb.ttsAudioUrl) throw new Error(`Storyboard ${sb.id} missing narration audio`)
    const audioPath = toAbsPath(sb.ttsAudioUrl)
    if (!fs.existsSync(audioPath)) throw new Error(`Storyboard ${sb.id} audio file missing`)

    const durationSec = await probeMediaDuration(audioPath)
    shotDurationsSec.push(durationSec)
    const subtitleMarkedText = resolveStoryboardSubtitleNarration(sb)
    const displayText = stripSubtitlePunctuationPreservingEmphasis(subtitleMarkedText)
    const startSec = isTitleShot
      ? offsetSec + transitionPad + TITLE_SUBTITLE_START_DELAY_SEC
      : offsetSec + transitionPad
    const endSec = offsetSec + transitionPad + Math.max(durationSec, 0.05)

    if (displayText) {
      if (isTitleShot) {
        subtitleLines.push({ type: 'title', text: displayText, startSec, endSec })
      } else {
        subtitleLines.push({
          type: 'narration',
          displayText,
          markedText: subtitleMarkedText,
          startSec,
          endSec,
          durationSec,
          index: i,
        })
      }
    }

    audioPaths.push(audioPath)
    offsetSec += durationSec
  }

  const hasNarrationSubtitles = subtitleLines.some(line => line.type === 'narration')
  const useAssSubtitle = titleMode || hasNarrationSubtitles
  const subtitlePath = path.join(tempDir, `${uuid()}.ass`)
  let subtitleContent: string
  if (useAssSubtitle) {
    const dialogueLines = subtitleLines.map(line => {
      if (line.type === 'title') {
        return buildTitleAssDialogueLine(line.text, line.startSec, line.endSec)
      }
      if (hasEmphasisMarkers(line.markedText)) {
        return buildNarrationEmphasisAssDialogueLine(line.displayText, line.startSec, line.endSec)
      }
      return buildNarrationPlainAssDialogueLine(line.displayText, line.startSec, line.endSec)
    })
    subtitleContent = `${buildCombinedAssHeader({
      includeTitleStyles: titleMode,
      includeNarrationStyles: hasNarrationSubtitles,
      titleFontName: TITLE_SUBTITLE_FONT,
    })}${dialogueLines.join('\n')}\n`
  } else {
    subtitleContent = ''
  }
  fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8')

  const mergedAudioPath = path.join(tempDir, `${uuid()}.m4a`)
  await concatAudioFiles(audioPaths, mergedAudioPath)

  const [firstSb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, orderedStoryboards[0].id)).all()
  const [ep] = firstSb
    ? db.select().from(schema.episodes).where(eq(schema.episodes.id, firstSb.episodeId)).all()
    : [undefined]
  const watermarkText = resolveWatermarkText(ep?.watermarkText)
  const watermarkAnimated = resolveWatermarkAnimated(ep?.watermarkAnimated)

  const contentDuration = offsetSec
  const outputDuration = resolveComposeOutputDuration(contentDuration, transitionPads)

  await new Promise<void>((resolve, reject) => {
    const filters: string[] = [buildGroupProgressiveZoomFilter(shotDurationsSec, pageIndex, prevGroupShotCount)]
    appendComposeVideoPostFilters(
      filters,
      subtitlePath,
      titleMode && !hasNarrationSubtitles,
      transitionPads,
      watermarkText,
      watermarkAnimated,
    )

    const videoChain = `[0:v]${filters.join(',')}[vout]`
    const filterComplex = [
      videoChain,
      buildComposeTransitionAudioPadFilter(1, 'aout', transitionPads),
    ].join(';')

    let cmd = ffmpeg()
      .input(imageAbsPath)
      .inputOptions(['-loop', '1'])
      .input(mergedAudioPath)
    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-t', String(outputDuration),
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-g', '1',
        '-keyint_min', '1',
        '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p',
        '-r', '25',
        '-vsync', 'cfr',
        '-c:a', 'aac',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  if (fs.existsSync(mergedAudioPath)) fs.unlinkSync(mergedAudioPath)
  if (fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath)

  return outputDuration
}

type EpisodeStoryboardRow = typeof schema.storyboards.$inferSelect

type SameImageGroupComposeContext = {
  episodeId: number
  groupIndex: number
  groupStart: number
  groupEnd: number
  pageIndex: number
  prevGroupShotCount: number
  members: EpisodeStoryboardRow[]
  imageAbsPath: string
}

function resolveSameImageGroupComposeContext(
  storyboardId: number,
  episodeStoryboards: EpisodeStoryboardRow[],
): SameImageGroupComposeContext | null {
  const ordered = sortStoryboardsByOrder(episodeStoryboards)
  const idx = ordered.findIndex(sb => sb.id === storyboardId)
  if (idx < 0) return null

  const sb = ordered[idx]
  if (isStoryboardTitleShot(sb)) return null

  const groups = buildVisualGroups(ordered)
  const groupIndex = groups.findIndex(group => idx >= group.start && idx <= group.end)
  if (groupIndex < 0) return null

  const group = groups[groupIndex]
  const members = ordered.slice(group.start, group.end + 1)
  if (members.length <= 1) return null

  const visual = resolveStoryboardVisualSource(ordered, members[0].id)
  if (!visual || visual.type !== 'image') return null

  return {
    episodeId: sb.episodeId,
    groupIndex,
    groupStart: group.start,
    groupEnd: group.end,
    pageIndex: groupIndex,
    prevGroupShotCount: groupIndex > 0
      ? groups[groupIndex - 1].end - groups[groupIndex - 1].start + 1
      : 0,
    members,
    imageAbsPath: toAbsPath(visual.path),
  }
}

function groupComposeInflightKey(ctx: SameImageGroupComposeContext) {
  return `${ctx.episodeId}:${ctx.groupStart}-${ctx.groupEnd}`
}

/** 批量合成时按同配图组去重，每组只触发一次 */
export function pickVisualGroupComposeLeaders<T extends { id: number }>(
  targets: T[],
  episodeStoryboards: EpisodeStoryboardRow[],
): T[] {
  const ordered = sortStoryboardsByOrder(episodeStoryboards)
  const groups = buildVisualGroups(ordered)
  const seenStarts = new Set<number>()
  const leaders: T[] = []

  for (const sb of targets) {
    const idx = ordered.findIndex(item => item.id === sb.id)
    if (idx < 0) {
      leaders.push(sb)
      continue
    }
    const group = groups.find(g => idx >= g.start && idx <= g.end)
    if (!group || seenStarts.has(group.start)) continue
    seenStarts.add(group.start)
    leaders.push(sb)
  }

  return leaders
}

async function composeSameImageGroup(
  storyboardId: number,
  ctx: SameImageGroupComposeContext,
): Promise<string> {
  const inflightKey = groupComposeInflightKey(ctx)
  const inflight = groupComposeInflight.get(inflightKey)
  if (inflight) return inflight

  const composePromise = (async () => {
    const memberIds = ctx.members.map(m => m.id)
    logTaskStart('ComposeTask', 'same-image-group-compose', {
      storyboardId,
      episodeId: ctx.episodeId,
      memberIds,
      pageIndex: ctx.pageIndex,
      shotCount: ctx.members.length,
    })

    for (const member of ctx.members) {
      if (member.composedVideoUrl) {
        deleteEpisodeAssetFileIfUnreferenced(
          member.composedVideoUrl,
          member.episodeId,
          'composedVideoUrl',
          member.id,
        )
      }
    }

    db.update(schema.storyboards)
      .set({ status: 'compose_processing', composedVideoUrl: null, subtitleUrl: null, updatedAt: now() })
      .where(inArray(schema.storyboards.id, memberIds))
      .run()

    const outputDir = path.join(STORAGE_ROOT, 'composed')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputFilename = `${uuid()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    try {
      await renderSameImageGroupSegment(
        ctx.members,
        ctx.imageAbsPath,
        outputPath,
        ctx.pageIndex,
        ctx.prevGroupShotCount,
      )

      const composedRelative = `static/composed/${outputFilename}`
      db.update(schema.storyboards)
        .set({ composedVideoUrl: composedRelative, status: 'compose_completed', updatedAt: now() })
        .where(inArray(schema.storyboards.id, memberIds))
        .run()

      logTaskSuccess('ComposeTask', 'same-image-group-compose', {
        storyboardId,
        episodeId: ctx.episodeId,
        memberIds,
        output: composedRelative,
      })
      return composedRelative
    } catch (err) {
      db.update(schema.storyboards)
        .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
        .where(inArray(schema.storyboards.id, memberIds))
        .run()
      throw err
    }
  })()

  groupComposeInflight.set(inflightKey, composePromise)
  try {
    return await composePromise
  } finally {
    groupComposeInflight.delete(inflightKey)
  }
}

/**
 * 合成单个镜头：视频/配图 + TTS音频 + 烧录字幕
 * 同配图多句自动走整组一次渲染（renderSameImageGroupSegment）
 */
export async function composeStoryboard(storyboardId: number): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)

  const episodeStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
    .filter(row => !row.deletedAt)

  const groupCtx = resolveSameImageGroupComposeContext(storyboardId, episodeStoryboards)
  if (groupCtx) {
    return composeSameImageGroup(storyboardId, groupCtx)
  }
  return composeStoryboardSingle(storyboardId)
}

async function composeStoryboardSingle(storyboardId: number): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)

  const episodeStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
    .filter(row => !row.deletedAt)

  let visual = getStoryboardVisualSource(sb, episodeStoryboards)
  const useBlackFrame = !visual
  if (sb.composedVideoUrl) {
    deleteEpisodeAssetFileIfUnreferenced(
      sb.composedVideoUrl,
      sb.episodeId,
      'composedVideoUrl',
      storyboardId,
    )
  }
  db.update(schema.storyboards)
    .set({ status: 'compose_processing', composedVideoUrl: null, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: sb.storyboardNumber,
    episodeId: sb.episodeId,
  })

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const watermarkText = resolveWatermarkText(ep?.watermarkText)
  const watermarkAnimated = resolveWatermarkAnimated(ep?.watermarkAnimated)

  let audioPath: string | null = null
  let bgmPath: string | null = null
  let subtitlePath: string | null = null
  const parsedDialogue = parseDialogueForTTS(sb.dialogue)
  const isTitleShot = isStoryboardTitleShot(sb)

  // 1. 解析 TTS 音频（解说每镜独立配音，不复用）
  try {
    if (!parsedDialogue.ignorable) {
      const usesOwnNarrationTts = isNarrationStoryboard(sb) || isTitleShot
      if (usesOwnNarrationTts && sb.ttsAudioUrl) {
        const ownPath = toAbsPath(sb.ttsAudioUrl)
        if (fs.existsSync(ownPath)) audioPath = ownPath
      } else if (!usesOwnNarrationTts) {
        const resolvedTts = resolveStoryboardTtsSource(episodeStoryboards, storyboardId)
        if (resolvedTts?.path) {
          const existingAudioPath = toAbsPath(resolvedTts.path)
          if (fs.existsSync(existingAudioPath)) {
            audioPath = existingAudioPath
            if (resolvedTts.inherited) {
              logTaskProgress('ComposeTask', 'reuse-tts', {
                storyboardId,
                inheritedFrom: resolvedTts.sourceId,
              })
            }
          }
        }
      }

      if (!audioPath) {
        let voiceId = 'alloy'
        if (ep) {
          const chars = db.select().from(schema.characters)
            .where(eq(schema.characters.dramaId, ep.dramaId)).all()
          voiceId = resolveNarrationVoiceId(parsedDialogue.speaker, chars, { isTitleShot: !!isTitleShot })
        }

        const pureDialogue = parsedDialogue.pureText
        if (pureDialogue) {
          const useLocalTts = usesOwnNarrationTts
          const localTtsEngine = process.env.LOCAL_TTS_ENGINE === 'voicebox' ? 'voicebox' : 'edge'
          const ttsVoice = useLocalTts
            ? (localTtsEngine === 'voicebox'
              ? await resolveVoiceboxProfileId(voiceId, process.env.VOICEBOX_PROFILE_ID)
              : resolveEdgeVoice(voiceId))
            : voiceId
          logTaskProgress('ComposeTask', 'generate-inline-tts', {
            storyboardId,
            voiceId: ttsVoice,
            localTts: useLocalTts,
            localTtsEngine: useLocalTts ? localTtsEngine : undefined,
            textPreview: pureDialogue.slice(0, 40),
          })
          const ttsPath = await generateTTS({
            text: pureDialogue,
            voice: ttsVoice,
            speed: resolveTtsSpeed(process.env.TTS_DEFAULT_SPEED),
            configId: useLocalTts ? null : (ep?.audioConfigId ?? undefined),
            localTts: useLocalTts,
            localTtsEngine: useLocalTts ? localTtsEngine : undefined,
            voiceboxInstruct: useLocalTts && localTtsEngine === 'voicebox'
              ? resolveVoiceboxInstruct(process.env.VOICEBOX_DEFAULT_INSTRUCT)
              : undefined,
            voiceboxModelSize: useLocalTts && localTtsEngine === 'voicebox'
              ? resolveVoiceboxModelSize(process.env.VOICEBOX_MODEL_SIZE)
              : undefined,
          })
          audioPath = toAbsPath(ttsPath)
          db.update(schema.storyboards).set({ ttsAudioUrl: ttsPath, updatedAt: now() })
            .where(eq(schema.storyboards.id, storyboardId)).run()
        }
      }
    }

    const clipDuration = audioPath
      ? await probeMediaDuration(audioPath)
      : (sb.duration || 10)

    if (sb.bgmAudioUrl) {
      const candidate = toAbsPath(sb.bgmAudioUrl)
      if (fs.existsSync(candidate)) {
        bgmPath = candidate
        logTaskProgress('ComposeTask', 'bgm-attached', { storyboardId, bgmPath: sb.bgmAudioUrl })
      }
    }

    if (!visual && !audioPath && !bgmPath) {
      throw new Error(`Storyboard ${storyboardId} has no video, image, narration audio, or BGM`)
    }

    if (visual?.inherited) {
      logTaskProgress('ComposeTask', 'reuse-image', {
        storyboardId,
        inheritedFrom: visual.inheritedFrom,
      })
    }

    const transitionPads = resolveComposeTransitionPads(storyboardId, episodeStoryboards)
    const outputDuration = resolveComposeOutputDuration(clipDuration, transitionPads)

    // 2. 生成字幕：旁白统一 ASS；片头 ASS 剧中红字（时间轴偏移 startPad，对齐首段 hold）
    const subtitleMarkedText = resolveStoryboardSubtitleNarration(sb)
    const displayText = stripSubtitlePunctuationPreservingEmphasis(subtitleMarkedText)
    const useEmphasisAss = !isTitleShot && hasEmphasisMarkers(subtitleMarkedText)
    if (displayText && (!parsedDialogue.ignorable || isTitleShot)) {
      const srtDir = path.join(STORAGE_ROOT, 'subtitles')
      fs.mkdirSync(srtDir, { recursive: true })
      const subtitleFilename = `${uuid()}.ass`
      subtitlePath = path.join(srtDir, subtitleFilename)

      const subtitleContent = isTitleShot
        ? buildTitleAssContent(displayText, clipDuration, transitionPads.startPadSec)
        : useEmphasisAss
          ? buildNarrationEmphasisAssContent(displayText, clipDuration, transitionPads.startPadSec)
          : buildNarrationPlainAssContent(displayText, clipDuration, transitionPads.startPadSec)
      fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8')

      const subtitleRelative = `static/subtitles/${subtitleFilename}`
      db.update(schema.storyboards).set({ subtitleUrl: subtitleRelative, updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
    }

    // 3. FFmpeg 合成
    const outputDir = path.join(STORAGE_ROOT, 'composed')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputFilename = `${uuid()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    await new Promise<void>(async (resolve, reject) => {
      const isTitleShot = isStoryboardTitleShot(sb)
      const filters: string[] = []

      let cmd = ffmpeg()
      if (useBlackFrame) {
        cmd = cmd.input(`color=c=black:s=1280x720:r=25:d=${clipDuration}`).inputOptions(['-f', 'lavfi'])
        filters.push('fps=25,format=yuv420p')
        logTaskProgress('ComposeTask', 'black-frame-compose', { storyboardId, duration: clipDuration, outputDuration })
      } else if (visual!.type === 'image') {
        const useTitleDynamic = !!isTitleShot
        const titleGroupInfo = useTitleDynamic
          ? getTitleGroupInfo(storyboardId, episodeStoryboards)
          : undefined
        const visualGroupInfo = useTitleDynamic
          ? undefined
          : getVisualGroupInfo(storyboardId, episodeStoryboards)
        if (useTitleDynamic) {
          filters.push(buildTitleShotMotionFilter(clipDuration, titleGroupInfo!.shotIndexInGroup))
        } else {
          filters.push(buildShotZoomMotionFilter(visualGroupInfo!, clipDuration))
        }
        cmd = cmd.input(visual!.path).inputOptions(['-loop', '1'])
        logTaskProgress('ComposeTask', 'image-slideshow-compose', {
          storyboardId,
          duration: clipDuration,
          inherited: visual!.inherited || false,
          sharedBase: false,
          titleDynamic: useTitleDynamic,
          titleGroupInfo,
          visualGroupInfo,
        })
      } else {
        cmd = cmd.input(visual!.path)
        filters.push(`trim=duration=${fmtComposeFilterSec(clipDuration)},setpts=PTS-STARTPTS,fps=25,format=yuv420p`)
      }

      if (subtitlePath && !supportsSubtitleFilter()) {
        logTaskProgress('ComposeTask', 'subtitle-filter-unavailable', {
          storyboardId,
          subtitlePath,
        })
      }
      appendComposeVideoPostFilters(
        filters,
        subtitlePath,
        !!isTitleShot,
        transitionPads,
        watermarkText,
        watermarkAnimated,
      )

      if (audioPath) {
        cmd = cmd.input(audioPath)
      }
      if (bgmPath) {
        cmd = cmd.input(bgmPath).inputOptions(['-stream_loop', '-1'])
      }

      const outputOptions = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p']
      const hasVoice = !!audioPath
      const hasBgm = !!bgmPath
      const outputDurationStr = fmtComposeFilterSec(outputDuration)
      const videoChain = `[0:v]${filters.join(',')}[vout]`
      const complexParts: string[] = [videoChain]

      if (hasVoice && hasBgm) {
        const voiceInput = 1
        const bgmInput = 2
        complexParts.push(buildComposeTransitionAudioPadFilter(voiceInput, 'voice', transitionPads))
        complexParts.push(`[${bgmInput}:a]volume=${BGM_VOICE_MIX_VOLUME},atrim=0:${outputDurationStr}[bgm]`)
        complexParts.push('[voice][bgm]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0[aout]')
        outputOptions.push('-map', '[vout]', '-map', '[aout]', '-c:a', 'aac')
      } else if (hasVoice) {
        complexParts.push(buildComposeTransitionAudioPadFilter(1, 'aout', transitionPads))
        outputOptions.push('-map', '[vout]', '-map', '[aout]', '-c:a', 'aac')
      } else if (hasBgm) {
        complexParts.push(`[1:a]volume=${BGM_SOLO_VOLUME},atrim=0:${outputDurationStr}[aout]`)
        outputOptions.push('-map', '[vout]', '-map', '[aout]', '-c:a', 'aac')
      } else {
        outputOptions.push('-map', '[vout]', '-an')
      }

      outputOptions.push('-t', outputDurationStr, '-vsync', 'cfr', '-r', '25')
      if (visual?.type === 'image') {
        outputOptions.push('-g', '1', '-keyint_min', '1', '-tune', 'stillimage')
      }

      cmd.complexFilter(complexParts.join(';'))
      cmd.outputOptions(outputOptions)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    const composedRelative = `static/composed/${outputFilename}`
    db.update(schema.storyboards).set({ composedVideoUrl: composedRelative, status: 'compose_completed', updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId)).run()

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: sb.storyboardNumber,
      output: composedRelative,
    })
    return composedRelative
  } catch (err) {
    db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    throw err
  }
}
