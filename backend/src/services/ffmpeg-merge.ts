/**
 * FFmpeg 多镜头拼接 — 将所有合成后的镜头视频拼接为一集
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { and, eq, inArray } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { PAGE_FLIP_TRANSITION_SEC, PAGE_FLIP_XFADE_TRANSITION } from './ffmpeg-page-transition.js'
import { resolveStoryboardVisualSource, sortStoryboardsByOrder } from './narration-image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

/** 换配图时翻页转场：左上角卷曲下落（与开幕片头一致） */
const IMAGE_CHANGE_TRANSITION = PAGE_FLIP_XFADE_TRANSITION
const IMAGE_CHANGE_TRANSITION_SEC = PAGE_FLIP_TRANSITION_SEC
const MAX_XFADE_INPUTS = 48

type ComposedStoryboard = {
  id: number
  storyboardNumber: number
  dialogue?: string | null
  referenceImages?: string | null
  ttsAudioUrl?: string | null
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
  composedVideoUrl?: string | null
}

type ClipSegment = { path: string; duration: number; storyboardId: number }
type VisualGroup = { visualKey: string; clips: ClipSegment[] }
type MergeSegment = { path: string; duration: number; temp: boolean }

type ActiveMergeRun = {
  mergeId: number
  cancelled: boolean
  command: ReturnType<typeof ffmpeg> | null
}

export type MergeProgress = {
  mergeId: number
  phase: 'preparing' | 'merging' | 'finalizing'
  percent: number
  message: string
  updatedAt: number
}

export type MergeOptions = {
  bgmMusicId?: number
  bgmVolume?: number
  /** 是否在成片前拼接开幕视频，默认 true */
  includeOpeningVideo?: boolean
}

const activeMerges = new Map<number, ActiveMergeRun>()
const mergeProgressMap = new Map<number, MergeProgress>()

function setMergeProgress(episodeId: number, progress: MergeProgress) {
  mergeProgressMap.set(episodeId, progress)
}

function clearMergeProgress(episodeId: number) {
  mergeProgressMap.delete(episodeId)
}

export function getMergeProgress(episodeId: number): MergeProgress | null {
  return mergeProgressMap.get(episodeId) ?? null
}

export function isMergeActive(episodeId: number, mergeId?: number): boolean {
  const active = activeMerges.get(episodeId)
  if (!active) return false
  if (mergeId != null && active.mergeId !== mergeId) return false
  return true
}

function escapeConcatPath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

function createFfmpegListPath(suffix = '.txt') {
  fs.mkdirSync(os.tmpdir(), { recursive: true })
  return path.join(os.tmpdir(), `huobao-${uuid()}${suffix}`)
}

function parseTimemark(timemark: string): number {
  const parts = timemark.trim().split(':')
  if (parts.length !== 3) return 0
  const h = Number(parts[0]) || 0
  const m = Number(parts[1]) || 0
  const s = Number(parts[2]) || 0
  return h * 3600 + m * 60 + s
}

function supersedeStaleMerges(episodeId: number) {
  db.update(schema.videoMerges)
    .set({ status: 'cancelled', errorMsg: '被新任务取代', completedAt: now() })
    .where(and(
      eq(schema.videoMerges.episodeId, episodeId),
      inArray(schema.videoMerges.status, ['processing', 'pending']),
    ))
    .run()
}

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function getStoryboardVisualKey(sb: ComposedStoryboard, storyboards: ComposedStoryboard[]) {
  const visual = resolveStoryboardVisualSource(storyboards, sb.id)
  if (!visual) return `none:${sb.id}`
  return `${visual.type}:${visual.path}`
}

function buildVisualGroups(storyboards: ComposedStoryboard[]): VisualGroup[] {
  const groups: VisualGroup[] = []
  for (const sb of storyboards) {
    const clipPath = toAbsPath(sb.composedVideoUrl!)
    const visualKey = getStoryboardVisualKey(sb, storyboards)
    const last = groups[groups.length - 1]
    if (!last || last.visualKey !== visualKey) {
      groups.push({ visualKey, clips: [{ path: clipPath, duration: 0, storyboardId: sb.id }] })
    } else {
      last.clips.push({ path: clipPath, duration: 0, storyboardId: sb.id })
    }
  }
  return groups
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(metadata.format.duration || 0)
    })
  })
}

/** 按镜头顺序硬切拼接，保留各镜已烧录的配音与字幕（不重渲染、不叠音） */
async function concatComposedVideos(
  absPaths: string[],
  outputPath: string,
  run: ActiveMergeRun,
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  if (absPaths.length === 1) {
    fs.copyFileSync(absPaths[0], outputPath)
    return
  }

  const listPath = createFfmpegListPath()
  const listContent = absPaths.map(p => `file '${escapeConcatPath(p)}'`).join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-fflags', '+genpts',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-ar', '48000',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
      run.command = command
      command
        .on('progress', (progress) => {
          if (run.cancelled) return
          onProgress?.(parseTimemark(progress.timemark || '0'))
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }
}

async function concatClipsToFile(clips: ClipSegment[], outputPath: string, run?: ActiveMergeRun): Promise<void> {
  await concatComposedVideos(
    clips.map(c => c.path),
    outputPath,
    run || { mergeId: 0, cancelled: false, command: null },
  )
}

function fmtFilterSec(sec: number): string {
  return Math.max(0.001, sec).toFixed(3)
}

/**
 * 换配图段之间：翻页转场（hlwind）；音频硬切 concat（不用 acrossfade，避免叠音/语速错乱）。
 * 每路视频先 trim + setpts 归零，转场前 tpad 预留叠化区，避免 xfade 期间画面卡住、切换后才开始动。
 */
function buildXfadeFilterScript(segmentDurations: number[]): string {
  const td = IMAGE_CHANGE_TRANSITION_SEC
  const n = segmentDurations.length
  if (n <= 1) return ''

  const parts: string[] = []
  const vLabels: string[] = []
  const aLabels: string[] = []

  for (let i = 0; i < n; i++) {
    const d = segmentDurations[i]
    const vLabel = `vin${i}`
    const aLabel = `ain${i}`
    const dStr = fmtFilterSec(d)
    const tdStr = fmtFilterSec(td)
    if (i < n - 1) {
      parts.push(
        `[${i}:v]fps=25,trim=duration=${dStr},setpts=PTS-STARTPTS,format=yuv420p,tpad=stop_mode=clone:stop_duration=${tdStr}[${vLabel}]`,
      )
    } else {
      parts.push(
        `[${i}:v]fps=25,trim=duration=${dStr},setpts=PTS-STARTPTS,format=yuv420p[${vLabel}]`,
      )
    }
    parts.push(
      `[${i}:a]atrim=duration=${dStr},asetpts=PTS-STARTPTS,aresample=48000[${aLabel}]`,
    )
    vLabels.push(`[${vLabel}]`)
    aLabels.push(`[${aLabel}]`)
  }

  let vChain = vLabels[0]
  let cumulative = segmentDurations[0] + td

  for (let i = 1; i < n; i++) {
    const vOut = i === n - 1 ? 'vout' : `vxf${i}`
    const offset = Math.max(0.1, cumulative - td)
    parts.push(
      `${vChain}${vLabels[i]}xfade=transition=${IMAGE_CHANGE_TRANSITION}:duration=${fmtFilterSec(td)}:offset=${fmtFilterSec(offset)}[${vOut}]`,
    )
    vChain = `[${vOut}]`
    const segDur = i < n - 1 ? segmentDurations[i] + td : segmentDurations[i]
    cumulative += segDur - td
  }

  parts.push(`${aLabels.join('')}concat=n=${n}:v=0:a=1[aout]`)

  return parts.join(';\n')
}

async function mergeSegmentsWithPageFlip(
  segments: MergeSegment[],
  outputPath: string,
  run: ActiveMergeRun,
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  if (segments.length === 1) {
    fs.copyFileSync(segments[0].path, outputPath)
    return
  }

  const filterComplex = buildXfadeFilterScript(segments.map(s => s.duration))

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
    for (const seg of segments) command = command.input(seg.path)
    command = command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', '25',
        '-vsync', 'cfr',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
    run.command = command
    command
      .on('progress', (progress) => {
        if (run.cancelled) return
        onProgress?.(parseTimemark(progress.timemark || '0'))
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

async function mergeSegmentsSequential(
  segments: MergeSegment[],
  outputPath: string,
  run: ActiveMergeRun,
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  const tempDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(tempDir, { recursive: true })
  const temps: string[] = []
  let current = segments[0]

  try {
    for (let i = 1; i < segments.length; i++) {
      if (run.cancelled) return
      const tempOut = path.join(tempDir, `${uuid()}.mp4`)
      temps.push(tempOut)
      await mergeSegmentsWithPageFlip([current, segments[i]], tempOut, run, onProgress)
      current = {
        path: tempOut,
        duration: current.duration + segments[i].duration,
        temp: true,
      }
    }
    fs.copyFileSync(current.path, outputPath)
  } finally {
    for (const t of temps) {
      if (fs.existsSync(t)) fs.unlinkSync(t)
    }
  }
}

/** 同配图组内硬切拼接已合成镜头，不重渲染 */
async function buildMergeSegments(
  groups: VisualGroup[],
  run: ActiveMergeRun,
  onGroupProgress?: (done: number, total: number) => void,
): Promise<{ segments: MergeSegment[]; temps: string[] }> {
  const tempDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(tempDir, { recursive: true })
  const segments: MergeSegment[] = []
  const temps: string[] = []

  for (let i = 0; i < groups.length; i++) {
    if (run.cancelled) break
    const group = groups[i]
    for (const clip of group.clips) {
      clip.duration = await getVideoDuration(clip.path)
    }

    if (group.clips.length === 1) {
      segments.push({ path: group.clips[0].path, duration: group.clips[0].duration, temp: false })
    } else {
      const tempPath = path.join(tempDir, `${uuid()}.mp4`)
      temps.push(tempPath)
      await concatClipsToFile(group.clips, tempPath, run)
      const duration = await getVideoDuration(tempPath)
      segments.push({ path: tempPath, duration, temp: true })
    }
    onGroupProgress?.(i + 1, groups.length)
  }

  return { segments, temps }
}

function cleanupTempFiles(paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}

function resolveMergeBgmPath(musicId: number): string | null {
  const [music] = db.select().from(schema.musicGenerations)
    .where(eq(schema.musicGenerations.id, musicId))
    .all()
  if (!music || music.status !== 'completed' || !music.localPath) return null
  const abs = toAbsPath(music.localPath)
  return fs.existsSync(abs) ? abs : null
}

function resolveEpisodeOpeningVideoAbs(episodeId: number): string | null {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const rel = ep?.openingVideoUrl?.trim()
  if (!rel) return null
  const abs = toAbsPath(rel)
  return fs.existsSync(abs) ? abs : null
}

async function prependOpeningToMergedVideo(
  openingAbsPath: string,
  bodyPath: string,
  run: ActiveMergeRun,
): Promise<void> {
  const tempOut = `${bodyPath}.opening.mp4`
  const segments: MergeSegment[] = [
    { path: openingAbsPath, duration: await getVideoDuration(openingAbsPath), temp: false },
    { path: bodyPath, duration: await getVideoDuration(bodyPath), temp: false },
  ]
  await mergeSegmentsWithPageFlip(segments, tempOut, run)
  if (fs.existsSync(bodyPath)) fs.unlinkSync(bodyPath)
  fs.renameSync(tempOut, bodyPath)
}

async function mixBgmIntoMergedVideo(
  videoPath: string,
  bgmAbsPath: string,
  volume: number,
  run: ActiveMergeRun,
): Promise<void> {
  const tempOut = `${videoPath}.bgm.mp4`
  const vol = Math.max(0.05, Math.min(1, volume))

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .input(videoPath)
      .input(bgmAbsPath)
      .inputOptions(['-stream_loop', '-1'])
      .outputOptions([
        '-filter_complex',
        `[0:a]volume=1[voice];[1:a]volume=${vol}[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
      ])
      .output(tempOut)
    run.command = command
    command
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  fs.renameSync(tempOut, videoPath)
}

/**
 * 拼接一集的所有合成镜头视频
 */
export async function mergeEpisodeVideos(episodeId: number, dramaId: number, options: MergeOptions = {}): Promise<number> {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )

  const composedStoryboards = storyboards.filter(sb => !!sb.composedVideoUrl)
  if (composedStoryboards.length !== storyboards.length) {
    throw new Error(`尚有 ${storyboards.length - composedStoryboards.length} 个镜头未合成（${composedStoryboards.length}/${storyboards.length}），请先在「镜头合成」完成全部镜头后再导出`)
  }
  const videos = composedStoryboards
    .map(sb => sb.composedVideoUrl)
    .filter(Boolean) as string[]

  if (videos.length === 0) throw new Error('No videos to merge')

  const absPaths = videos.map(v => toAbsPath(v))
  const missing = absPaths.filter(p => !fs.existsSync(p))
  if (missing.length > 0) {
    throw new Error(`部分镜头视频文件缺失（${missing.length}/${videos.length}），请重新合成后再导出`)
  }

  logTaskStart('MergeTask', 'episode-merge', {
    episodeId,
    dramaId,
    clips: videos.length,
    bgmMusicId: options.bgmMusicId,
    includeOpeningVideo: options.includeOpeningVideo !== false,
  })

  supersedeStaleMerges(episodeId)

  // 创建 merge 记录
  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify(videos),
    createdAt: ts,
  }).run()
  const mergeId = Number(res.lastInsertRowid)

  // 异步执行（doMerge 内会重新读取 DB，避免用到启动瞬间的旧镜头快照）
  doMerge(mergeId, episodeId, options).catch(err => {
    if (String(err?.message || '').includes('SIGKILL') || String(err?.message || '').includes('code 255')) return
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    console.error(`[Merge] Failed:`, err)
    clearMergeProgress(episodeId)
    activeMerges.delete(episodeId)
    db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId)).run()
  })

  return mergeId
}

/** 取消正在进行的拼接（可立即打断 ffmpeg） */
export function cancelEpisodeMerge(episodeId: number): boolean {
  const active = activeMerges.get(episodeId)
  if (!active) return false

  active.cancelled = true
  try {
    active.command?.kill('SIGKILL')
  } catch {}

  db.update(schema.videoMerges)
    .set({ status: 'cancelled', errorMsg: '已取消', completedAt: now() })
    .where(eq(schema.videoMerges.id, active.mergeId))
    .run()

  activeMerges.delete(episodeId)
  clearMergeProgress(episodeId)
  return true
}

function loadComposedStoryboards(episodeId: number): ComposedStoryboard[] {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )
  const composed = storyboards.filter(sb => !!sb.composedVideoUrl)
  if (composed.length !== storyboards.length) {
    throw new Error(`尚有 ${storyboards.length - composed.length} 个镜头未合成（${composed.length}/${storyboards.length}），请先在「镜头合成」完成全部镜头后再导出`)
  }
  return composed
}

async function doMerge(mergeId: number, episodeId: number, options: MergeOptions = {}) {
  const run: ActiveMergeRun = { mergeId, cancelled: false, command: null }
  activeMerges.set(episodeId, run)
  setMergeProgress(episodeId, {
    mergeId,
    phase: 'preparing',
    percent: 2,
    message: '正在准备拼接…',
    updatedAt: Date.now(),
  })

  const storyboards = loadComposedStoryboards(episodeId)
  const absPaths = storyboards.map(sb => toAbsPath(sb.composedVideoUrl!))
  const missing = absPaths.filter(p => !fs.existsSync(p))
  if (missing.length > 0) {
    throw new Error(`部分镜头视频文件缺失（${missing.length}/${absPaths.length}），请重新合成后再导出`)
  }

  // 估算总时长，用于进度条
  let totalDurationSec = 0
  for (let i = 0; i < absPaths.length; i++) {
    totalDurationSec += await getVideoDuration(absPaths[i])
    if (run.cancelled) return
    const prepPct = Math.min(8, 2 + Math.round((i + 1) / absPaths.length * 6))
    setMergeProgress(episodeId, {
      mergeId,
      phase: 'preparing',
      percent: prepPct,
      message: `正在校验镜头 (${i + 1}/${absPaths.length})…`,
      updatedAt: Date.now(),
    })
  }
  if (totalDurationSec <= 0) totalDurationSec = absPaths.length * 3

  const groups = buildVisualGroups(storyboards)
  const usePageFlip = groups.length > 1
  let tempFiles: string[] = []

  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  const updateEncodeProgress = (encodedSec: number) => {
    const ratio = Math.min(1, encodedSec / totalDurationSec)
    const percent = Math.min(94, 10 + Math.round(ratio * 84))
    setMergeProgress(episodeId, {
      mergeId,
      phase: 'merging',
      percent,
      message: usePageFlip
        ? `正在翻页过渡拼接 (${percent}%)…`
        : `正在拼接 ${storyboards.length} 个镜头 (${percent}%)…`,
      updatedAt: Date.now(),
    })
  }

  try {
    if (usePageFlip) {
      setMergeProgress(episodeId, {
        mergeId,
        phase: 'merging',
        percent: 10,
        message: `正在分组 ${groups.length} 段画面并添加翻页过渡…`,
        updatedAt: Date.now(),
      })

      const { segments, temps } = await buildMergeSegments(groups, run, (done, total) => {
        const pct = 10 + Math.round((done / total) * 15)
        setMergeProgress(episodeId, {
          mergeId,
          phase: 'merging',
          percent: Math.min(25, pct),
          message: `正在合并同画面镜头 (${done}/${total})…`,
          updatedAt: Date.now(),
        })
      })
      tempFiles = temps
      if (run.cancelled) return

      if (segments.length <= MAX_XFADE_INPUTS) {
        await mergeSegmentsWithPageFlip(segments, outputPath, run, updateEncodeProgress)
      } else {
        await mergeSegmentsSequential(segments, outputPath, run, updateEncodeProgress)
      }
    } else {
      setMergeProgress(episodeId, {
        mergeId,
        phase: 'merging',
        percent: 10,
        message: `正在按顺序拼接 ${storyboards.length} 个镜头…`,
        updatedAt: Date.now(),
      })
      await concatComposedVideos(absPaths, outputPath, run, updateEncodeProgress)
    }
  } catch (err: any) {
    activeMerges.delete(episodeId)
    clearMergeProgress(episodeId)
    cleanupTempFiles(tempFiles)
    if (run.cancelled) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      return
    }
    throw err
  }

  if (run.cancelled) {
    activeMerges.delete(episodeId)
    clearMergeProgress(episodeId)
    cleanupTempFiles(tempFiles)
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    return
  }

  cleanupTempFiles(tempFiles)

  const includeOpeningVideo = options.includeOpeningVideo !== false
  if (includeOpeningVideo && !run.cancelled) {
    const openingAbs = resolveEpisodeOpeningVideoAbs(episodeId)
    if (openingAbs) {
      setMergeProgress(episodeId, {
        mergeId,
        phase: 'finalizing',
        percent: 88,
        message: '正在拼接开幕视频…',
        updatedAt: Date.now(),
      })
      try {
        await prependOpeningToMergedVideo(openingAbs, outputPath, run)
        totalDurationSec += await getVideoDuration(openingAbs)
      } catch (err: any) {
        throw new Error(`开幕视频拼接失败: ${err.message}`)
      }
    }
  }

  if (run.cancelled) return

  if (options.bgmMusicId && !run.cancelled) {
    const bgmAbs = resolveMergeBgmPath(options.bgmMusicId)
    if (bgmAbs) {
      setMergeProgress(episodeId, {
        mergeId,
        phase: 'finalizing',
        percent: 92,
        message: '正在混入 BGM…',
        updatedAt: Date.now(),
      })
      try {
        await mixBgmIntoMergedVideo(outputPath, bgmAbs, options.bgmVolume ?? 0.22, run)
      } catch (err: any) {
        throw new Error(`BGM 混音失败: ${err.message}`)
      }
    } else {
      logTaskError('MergeTask', 'bgm-missing', { mergeId, episodeId, bgmMusicId: options.bgmMusicId })
    }
  }

  if (run.cancelled) return

  setMergeProgress(episodeId, {
    mergeId,
    phase: 'finalizing',
    percent: 96,
    message: '正在写入成片…',
    updatedAt: Date.now(),
  })

  // 获取时长
  const duration = Math.round(await getVideoDuration(outputPath))

  const mergedRelative = `static/merged/${outputFilename}`

  // 更新 merge 记录
  db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl: mergedRelative, duration, completedAt: now(), errorMsg: null })
    .where(eq(schema.videoMerges.id, mergeId)).run()

  // 更新 episode
  db.update(schema.episodes)
    .set({ videoUrl: mergedRelative, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId)).run()

  setMergeProgress(episodeId, {
    mergeId,
    phase: 'finalizing',
    percent: 100,
    message: '拼接完成',
    updatedAt: Date.now(),
  })
  clearMergeProgress(episodeId)
  activeMerges.delete(episodeId)

  logTaskSuccess('MergeTask', 'episode-merge', {
    mergeId,
    episodeId,
    output: mergedRelative,
    duration,
    clips: storyboards.length,
    mergeMode: usePageFlip ? 'page-flip-audio-cut' : 'concat',
    pageFlipTransitions: usePageFlip ? groups.length - 1 : 0,
    bgmMusicId: options.bgmMusicId,
    includeOpeningVideo,
  })
}
