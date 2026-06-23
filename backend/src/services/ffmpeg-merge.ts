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
import { and, desc, eq, inArray } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { PAGE_FLIP_TRANSITION_SEC, PAGE_FLIP_XFADE_TRANSITION } from './ffmpeg-page-transition.js'
import { BGM_VOICE_MIX_VOLUME } from './bgm-generation.js'
import { isStoryboardTitleShot, resolveStoryboardVisualSource, sortStoryboardsByOrder } from './narration-image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

/** 换配图时翻页转场：自上往下卷曲翻页（与开幕片头一致） */
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
  /** 是否在成片前拼接开幕视频，默认 false */
  includeOpeningVideo?: boolean
  /** 测试导出：仅拼接前 N 个已合成镜头，不写回 episode.videoUrl */
  clipLimit?: number
}

type MergeScenesMeta = {
  clips?: string[]
  bodyMergedUrl?: string
  withOpening?: boolean
  withTitle?: boolean
  sourceMergeId?: number
  test?: boolean
  clipLimit?: number
}

export function isTestMergeRecord(record: { model?: string | null; scenes?: string | null } | null | undefined): boolean {
  if (!record) return false
  if (record.model === 'ffmpeg-concat-test') return true
  return parseMergeScenes(record.scenes).test === true
}

function parseMergeScenes(raw: string | null | undefined): MergeScenesMeta {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return { clips: parsed as string[] }
    if (parsed && typeof parsed === 'object') return parsed as MergeScenesMeta
  } catch {
    // ignore
  }
  return {}
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
 * 换配图段之间：翻页转场（vdwind，自上往下）；音频硬切 concat（不用 acrossfade，避免叠音/语速错乱）。
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

function resolveEpisodeTitleVideoAbs(episodeId: number): string | null {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const rel = ep?.titleVideoUrl?.trim()
  if (!rel) return null
  const abs = toAbsPath(rel)
  return fs.existsSync(abs) ? abs : null
}

async function buildOrderedMergeSegments(parts: {
  openingAbs?: string | null
  titleAbs?: string | null
  bodyAbs: string
}): Promise<MergeSegment[]> {
  const segments: MergeSegment[] = []
  if (parts.openingAbs) {
    segments.push({ path: parts.openingAbs, duration: await getVideoDuration(parts.openingAbs), temp: false })
  }
  if (parts.titleAbs) {
    segments.push({ path: parts.titleAbs, duration: await getVideoDuration(parts.titleAbs), temp: false })
  }
  segments.push({ path: parts.bodyAbs, duration: await getVideoDuration(parts.bodyAbs), temp: false })
  return segments
}

async function mergeOrderedSegmentsToOutput(
  segments: MergeSegment[],
  outputPath: string,
  run: ActiveMergeRun,
): Promise<void> {
  if (segments.length === 1) {
    fs.copyFileSync(segments[0].path, outputPath)
    return
  }
  const tempOut = `${outputPath}.ordered.mp4`
  await mergeSegmentsWithPageFlip(segments, tempOut, run)
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
  fs.renameSync(tempOut, outputPath)
}

async function prependOpeningToMergedVideo(
  openingAbsPath: string,
  bodyPath: string,
  run: ActiveMergeRun,
  titleAbsPath?: string | null,
): Promise<void> {
  const segments = await buildOrderedMergeSegments({
    openingAbs: openingAbsPath,
    titleAbs: titleAbsPath,
    bodyAbs: bodyPath,
  })
  await mergeOrderedSegmentsToOutput(segments, bodyPath, run)
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
        `[0:a]volume=1[voice];[1:a]volume=${vol}[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]`,
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
  const clipLimit = options.clipLimit && options.clipLimit > 0 ? Math.floor(options.clipLimit) : undefined
  const composedStoryboards = loadComposedStoryboards(episodeId, clipLimit)
  const videos = composedStoryboards
    .map(sb => sb.composedVideoUrl)
    .filter(Boolean) as string[]

  if (videos.length === 0) throw new Error('No videos to merge')

  const absPaths = videos.map(v => toAbsPath(v))
  const missing = absPaths.filter(p => !fs.existsSync(p))
  if (missing.length > 0) {
    throw new Error(`部分镜头视频文件缺失（${missing.length}/${videos.length}），请重新合成后再导出`)
  }

  logTaskStart('MergeTask', clipLimit ? 'episode-merge-test' : 'episode-merge', {
    episodeId,
    dramaId,
    clips: videos.length,
    clipLimit,
    bgmMusicId: options.bgmMusicId,
    includeOpeningVideo: options.includeOpeningVideo === true,
  })

  supersedeStaleMerges(episodeId)

  // 创建 merge 记录
  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: clipLimit
      ? `Episode ${episodeId} Test Merge (${videos.length}/${clipLimit} clips)`
      : `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: clipLimit ? 'ffmpeg-concat-test' : 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify({
      clips: videos,
      test: !!clipLimit,
      clipLimit,
    }),
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

function loadEpisodeStoryboards(episodeId: number) {
  return sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )
}

/** 主片拼接用镜头：默认不含片头镜（片头需单独合并进成片） */
function loadComposedStoryboards(episodeId: number, clipLimit?: number): ComposedStoryboard[] {
  const storyboards = loadEpisodeStoryboards(episodeId)
  const bodyStoryboards = storyboards.filter(sb => !isStoryboardTitleShot(sb))
  const composed = bodyStoryboards.filter(sb => !!sb.composedVideoUrl)
  if (clipLimit && clipLimit > 0) {
    if (composed.length === 0) {
      throw new Error('没有已合成的正文镜头，请先在「镜头合成」完成至少 1 镜')
    }
    return composed.slice(0, clipLimit)
  }
  if (composed.length !== bodyStoryboards.length) {
    throw new Error(`尚有 ${bodyStoryboards.length - composed.length} 个正文镜头未合成（${composed.length}/${bodyStoryboards.length}），请先在「镜头合成」完成全部正文镜头后再导出`)
  }
  if (composed.length === 0) throw new Error('No videos to merge')
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

  const clipLimit = options.clipLimit && options.clipLimit > 0 ? Math.floor(options.clipLimit) : undefined
  const storyboards = loadComposedStoryboards(episodeId, clipLimit)
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

  const includeOpeningVideo = options.includeOpeningVideo === true
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
        await mixBgmIntoMergedVideo(outputPath, bgmAbs, options.bgmVolume ?? BGM_VOICE_MIX_VOLUME, run)
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

  const scenesMeta: MergeScenesMeta = {
    clips: storyboards.map(sb => sb.composedVideoUrl).filter(Boolean) as string[],
    bodyMergedUrl: mergedRelative,
    withOpening: includeOpeningVideo,
    withTitle: false,
    test: !!clipLimit,
    clipLimit,
  }

  // 更新 merge 记录
  db.update(schema.videoMerges)
    .set({
      status: 'completed',
      mergedUrl: mergedRelative,
      duration,
      completedAt: now(),
      errorMsg: null,
      scenes: JSON.stringify(scenesMeta),
    })
    .where(eq(schema.videoMerges.id, mergeId)).run()

  // 测试导出不写回整集成片 URL
  if (!clipLimit) {
    db.update(schema.episodes)
      .set({ videoUrl: mergedRelative, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId)).run()
  }

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

/**
 * 将开幕视频合并进已完成的主片（翻页转场拼接在片头）
 */
export async function mergeOpeningIntoEpisodeVideo(episodeId: number, dramaId: number): Promise<number> {
  if (isMergeActive(episodeId)) throw new Error('有拼接任务正在进行，请稍候')

  const [sourceMerge] = db.select().from(schema.videoMerges)
    .where(and(
      eq(schema.videoMerges.episodeId, episodeId),
      eq(schema.videoMerges.status, 'completed'),
    ))
    .orderBy(desc(schema.videoMerges.id))
    .limit(1)
    .all()

  if (!sourceMerge?.mergedUrl) throw new Error('请先完成全集拼接')

  const sourceMeta = parseMergeScenes(sourceMerge.scenes)
  if (sourceMeta.withOpening) throw new Error('当前成片已包含开幕视频，如需重新合并请先「重新拼接」主视频')

  const bodyRel = sourceMeta.bodyMergedUrl || sourceMerge.mergedUrl
  const bodyAbs = toAbsPath(bodyRel)
  if (!fs.existsSync(bodyAbs)) throw new Error('主片文件缺失，请重新拼接')

  const openingAbs = resolveEpisodeOpeningVideoAbs(episodeId)
  if (!openingAbs) throw new Error('请先生成开幕视频')

  const titleAbs = sourceMeta.withTitle ? resolveEpisodeTitleVideoAbs(episodeId) : null
  if (sourceMeta.withTitle && !titleAbs) throw new Error('片头视频文件缺失，请重新生成')

  logTaskStart('MergeTask', 'opening-merge', { episodeId, dramaId, sourceMergeId: sourceMerge.id })

  supersedeStaleMerges(episodeId)

  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Opening Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-opening-merge',
    status: 'processing',
    scenes: JSON.stringify({
      clips: sourceMeta.clips,
      bodyMergedUrl: bodyRel,
      withOpening: true,
      withTitle: sourceMeta.withTitle === true,
      sourceMergeId: sourceMerge.id,
    }),
    createdAt: ts,
  }).run()
  const mergeId = Number(res.lastInsertRowid)

  const openingMeta: MergeScenesMeta = {
    clips: sourceMeta.clips,
    bodyMergedUrl: bodyRel,
    withOpening: true,
    withTitle: sourceMeta.withTitle === true,
    sourceMergeId: sourceMerge.id,
  }

  doOpeningMerge(mergeId, episodeId, openingAbs, bodyAbs, bodyRel, openingMeta, titleAbs).catch(err => {
    if (String(err?.message || '').includes('SIGKILL') || String(err?.message || '').includes('code 255')) return
    logTaskError('MergeTask', 'opening-merge', { mergeId, episodeId, error: err.message })
    clearMergeProgress(episodeId)
    activeMerges.delete(episodeId)
    db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId)).run()
  })

  return mergeId
}

async function doOpeningMerge(
  mergeId: number,
  episodeId: number,
  openingAbs: string,
  bodyAbs: string,
  bodyRel: string,
  sourceMeta: MergeScenesMeta,
  titleAbs?: string | null,
) {
  const run: ActiveMergeRun = { mergeId, cancelled: false, command: null }
  activeMerges.set(episodeId, run)
  setMergeProgress(episodeId, {
    mergeId,
    phase: 'finalizing',
    percent: 15,
    message: '正在合并开幕视频…',
    updatedAt: Date.now(),
  })

  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(STORAGE_ROOT, 'merged', outputFilename)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  try {
    if (run.cancelled) return
    const segments = await buildOrderedMergeSegments({
      openingAbs,
      titleAbs: titleAbs || null,
      bodyAbs,
    })
    await mergeOrderedSegmentsToOutput(segments, outputPath, run)
    if (run.cancelled) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      return
    }

    const duration = Math.round(await getVideoDuration(outputPath))
    const mergedRelative = `static/merged/${outputFilename}`

    db.update(schema.videoMerges)
      .set({
        status: 'completed',
        mergedUrl: mergedRelative,
        duration,
        completedAt: now(),
        errorMsg: null,
        scenes: JSON.stringify({
          clips: sourceMeta.clips,
          bodyMergedUrl: bodyRel,
          withOpening: true,
          withTitle: sourceMeta.withTitle === true,
          sourceMergeId: sourceMeta.sourceMergeId,
        }),
      })
      .where(eq(schema.videoMerges.id, mergeId)).run()

    db.update(schema.episodes)
      .set({ videoUrl: mergedRelative, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId)).run()

    setMergeProgress(episodeId, {
      mergeId,
      phase: 'finalizing',
      percent: 100,
      message: '开幕视频已合并完成',
      updatedAt: Date.now(),
    })
    clearMergeProgress(episodeId)
    activeMerges.delete(episodeId)

    logTaskSuccess('MergeTask', 'opening-merge', {
      mergeId,
      episodeId,
      output: mergedRelative,
      duration,
    })
  } catch (err) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    throw err
  }
}

/**
 * 将片头视频合并进已完成的主片（翻页转场拼接在开幕之后、正文之前）
 */
export async function mergeTitleIntoEpisodeVideo(episodeId: number, dramaId: number): Promise<number> {
  if (isMergeActive(episodeId)) throw new Error('有拼接任务正在进行，请稍候')

  const [sourceMerge] = db.select().from(schema.videoMerges)
    .where(and(
      eq(schema.videoMerges.episodeId, episodeId),
      eq(schema.videoMerges.status, 'completed'),
    ))
    .orderBy(desc(schema.videoMerges.id))
    .limit(1)
    .all()

  if (!sourceMerge?.mergedUrl) throw new Error('请先完成全集拼接')

  const sourceMeta = parseMergeScenes(sourceMerge.scenes)
  if (sourceMeta.withTitle) throw new Error('当前成片已包含片头视频，如需重新合并请先「重新拼接」主视频')

  const bodyRel = sourceMeta.bodyMergedUrl || sourceMerge.mergedUrl
  const bodyAbs = toAbsPath(bodyRel)
  if (!fs.existsSync(bodyAbs)) throw new Error('主片文件缺失，请重新拼接')

  const titleAbs = resolveEpisodeTitleVideoAbs(episodeId)
  if (!titleAbs) throw new Error('请先生成片头视频')

  const openingAbs = sourceMeta.withOpening ? resolveEpisodeOpeningVideoAbs(episodeId) : null
  if (sourceMeta.withOpening && !openingAbs) throw new Error('开幕视频文件缺失，请重新生成')

  logTaskStart('MergeTask', 'title-merge', { episodeId, dramaId, sourceMergeId: sourceMerge.id })

  supersedeStaleMerges(episodeId)

  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Title Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-title-merge',
    status: 'processing',
    scenes: JSON.stringify({
      clips: sourceMeta.clips,
      bodyMergedUrl: bodyRel,
      withOpening: sourceMeta.withOpening === true,
      withTitle: true,
      sourceMergeId: sourceMerge.id,
    }),
    createdAt: ts,
  }).run()
  const mergeId = Number(res.lastInsertRowid)

  const titleMeta: MergeScenesMeta = {
    clips: sourceMeta.clips,
    bodyMergedUrl: bodyRel,
    withOpening: sourceMeta.withOpening === true,
    withTitle: true,
    sourceMergeId: sourceMerge.id,
  }

  doTitleMerge(mergeId, episodeId, titleAbs, bodyAbs, bodyRel, titleMeta, openingAbs).catch(err => {
    if (String(err?.message || '').includes('SIGKILL') || String(err?.message || '').includes('code 255')) return
    logTaskError('MergeTask', 'title-merge', { mergeId, episodeId, error: err.message })
    clearMergeProgress(episodeId)
    activeMerges.delete(episodeId)
    db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId)).run()
  })

  return mergeId
}

async function doTitleMerge(
  mergeId: number,
  episodeId: number,
  titleAbs: string,
  bodyAbs: string,
  bodyRel: string,
  sourceMeta: MergeScenesMeta,
  openingAbs?: string | null,
) {
  const run: ActiveMergeRun = { mergeId, cancelled: false, command: null }
  activeMerges.set(episodeId, run)
  setMergeProgress(episodeId, {
    mergeId,
    phase: 'finalizing',
    percent: 15,
    message: '正在合并片头视频…',
    updatedAt: Date.now(),
  })

  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(STORAGE_ROOT, 'merged', outputFilename)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  try {
    if (run.cancelled) return
    const segments = await buildOrderedMergeSegments({
      openingAbs: openingAbs || null,
      titleAbs,
      bodyAbs,
    })
    await mergeOrderedSegmentsToOutput(segments, outputPath, run)
    if (run.cancelled) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      return
    }

    const duration = Math.round(await getVideoDuration(outputPath))
    const mergedRelative = `static/merged/${outputFilename}`

    db.update(schema.videoMerges)
      .set({
        status: 'completed',
        mergedUrl: mergedRelative,
        duration,
        completedAt: now(),
        errorMsg: null,
        scenes: JSON.stringify({
          clips: sourceMeta.clips,
          bodyMergedUrl: bodyRel,
          withOpening: sourceMeta.withOpening === true,
          withTitle: true,
          sourceMergeId: sourceMeta.sourceMergeId,
        }),
      })
      .where(eq(schema.videoMerges.id, mergeId)).run()

    db.update(schema.episodes)
      .set({ videoUrl: mergedRelative, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId)).run()

    setMergeProgress(episodeId, {
      mergeId,
      phase: 'finalizing',
      percent: 100,
      message: '片头视频已合并完成',
      updatedAt: Date.now(),
    })
    clearMergeProgress(episodeId)
    activeMerges.delete(episodeId)

    logTaskSuccess('MergeTask', 'title-merge', {
      mergeId,
      episodeId,
      output: mergedRelative,
      duration,
    })
  } catch (err) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    throw err
  }
}
