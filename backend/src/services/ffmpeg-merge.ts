/**
 * FFmpeg 多镜头拼接 — 将所有合成后的镜头视频拼接为一集
 */
import ffmpeg from 'fluent-ffmpeg'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { PAGE_FLIP_TRANSITION_SEC, PAGE_FLIP_XFADE_TRANSITION, computePageFlipMergedDuration, computePageFlipTransitionTimes, prependPageFlipSegmentTimeline } from './ffmpeg-page-transition.js'
import { mixPageFlipSfxIntoMergedVideo } from './ffmpeg-page-flip-sfx.js'
import { BGM_VOICE_MIX_VOLUME } from './bgm-generation.js'
import { isStoryboardTitleShot, resolveStoryboardVisualSource, sortStoryboardsByOrder } from './narration-image.js'
import { isMotionComicMode, parseProductionMode } from '../constants/production-mode.js'
import { buildComposeUnitGroups, listComposeMergeUnitStoryboards } from './ffmpeg-compose.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

/** 换配图时转场：剪映风格云朵软擦除（自左向右） */
const IMAGE_CHANGE_TRANSITION = PAGE_FLIP_XFADE_TRANSITION
const IMAGE_CHANGE_TRANSITION_SEC = PAGE_FLIP_TRANSITION_SEC
/** 镜头边界音频淡入淡出（秒），消除硬切咔声；不用 acrossfade 避免旁白叠音 */
const AUDIO_BOUNDARY_FADE_SEC = Math.max(0, Number(process.env.MERGE_AUDIO_BOUNDARY_FADE_SEC ?? 0.04))
const MAX_XFADE_INPUTS = 48
/** 成片拼接并行路数（按镜头/画面段分配，最后再总拼接） */
const MERGE_LANE_CONCURRENCY = Math.max(1, Number(process.env.MERGE_LANE_CONCURRENCY || 3))
/** 镜头数低于此值时不启用多路拼接 */
const MERGE_LANE_MIN_CLIPS = Math.max(4, Number(process.env.MERGE_LANE_MIN_CLIPS || 12))

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
  bgmAudioUrl?: string | null
}

type ClipSegment = { path: string; duration: number; storyboardId: number }
type VisualGroup = { visualKey: string; clips: ClipSegment[] }
type MergeSegment = { path: string; duration: number; temp: boolean }

type ActiveMergeRun = {
  mergeId: number
  cancelled: boolean
  command: ReturnType<typeof ffmpeg> | null
  commands: Set<ReturnType<typeof ffmpeg>>
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
  bgmSkippedEmbedded?: boolean
  withTitle?: boolean
  sourceMergeId?: number
  test?: boolean
  clipLimit?: number
  mergeLaneCount?: number
  mergeCacheFingerprint?: string
}

type MergeLaneManifest = {
  fingerprint: string
  lanes: Array<{ index: number; clipPaths: string[] }>
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

/** 按镜头顺序拼接，保留各镜配音；边界短 fade 消除硬切咔声 */
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

  const durations = await Promise.all(absPaths.map(p => getVideoDuration(p)))
  const filterComplex = buildConcatDeclickFilterScript(durations)
  await runFilterComplexMerge(absPaths, filterComplex, outputPath, run, onProgress)
}

async function concatClipsToFile(clips: ClipSegment[], outputPath: string, run?: ActiveMergeRun): Promise<void> {
  await concatComposedVideos(
    clips.map(c => c.path),
    outputPath,
    run || { mergeId: 0, cancelled: false, command: null, commands: new Set() },
  )
}

function fmtFilterSec(sec: number): string {
  return Math.max(0.001, sec).toFixed(3)
}

function resolveAudioBoundaryFadeSec(durationSec: number): number {
  if (AUDIO_BOUNDARY_FADE_SEC <= 0) return 0
  return Math.min(AUDIO_BOUNDARY_FADE_SEC, Math.max(0.008, durationSec / 4))
}

/** 每段首尾短 fade，concat 边界不再「咔」一声（不叠两段旁白） */
function appendAudioDeclickFilter(parts: string[], inputIndex: number, durationSec: number, outLabel: string): void {
  const dStr = fmtFilterSec(durationSec)
  const fade = resolveAudioBoundaryFadeSec(durationSec)
  const base = `[${inputIndex}:a]atrim=duration=${dStr},asetpts=PTS-STARTPTS,aresample=48000`
  if (fade <= 0) {
    parts.push(`${base}[${outLabel}]`)
    return
  }
  const fadeStr = fmtFilterSec(fade)
  if (durationSec <= fade * 2 + 0.02) {
    const half = fmtFilterSec(durationSec / 2)
    parts.push(`${base},afade=t=in:st=0:d=${half},afade=t=out:st=${half}:d=${half}[${outLabel}]`)
    return
  }
  const fadeOutStart = fmtFilterSec(Math.max(0, durationSec - fade))
  parts.push(`${base},afade=t=in:st=0:d=${fadeStr},afade=t=out:st=${fadeOutStart}:d=${fadeStr}[${outLabel}]`)
}

/**
 * 转场拼接旁白：整段保留、硬切不叠音；仅首段片头可极短 fade-in 防咔声。
 */
function appendAudioFullForMerge(
  parts: string[],
  inputIndex: number,
  durationSec: number,
  outLabel: string,
): void {
  const dStr = fmtFilterSec(durationSec)
  const base = `[${inputIndex}:a]atrim=duration=${dStr},asetpts=PTS-STARTPTS,aresample=48000`
  if (inputIndex > 0) {
    parts.push(`${base}[${outLabel}]`)
    return
  }
  const fade = resolveAudioBoundaryFadeSec(durationSec)
  if (fade <= 0 || durationSec <= fade * 2 + 0.02) {
    parts.push(`${base}[${outLabel}]`)
    return
  }
  parts.push(`${base},afade=t=in:st=0:d=${fmtFilterSec(fade)}[${outLabel}]`)
}

function appendSilenceSegment(parts: string[], durationSec: number, label: string): void {
  parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${fmtFilterSec(durationSec)},asetpts=PTS-STARTPTS[${label}]`)
}

function buildConcatDeclickFilterScript(segmentDurations: number[]): string {
  const n = segmentDurations.length
  const parts: string[] = []
  const vLabels: string[] = []
  const aLabels: string[] = []
  for (let i = 0; i < n; i++) {
    const dStr = fmtFilterSec(segmentDurations[i])
    parts.push(`[${i}:v]fps=25,trim=duration=${dStr},setpts=PTS-STARTPTS,format=yuv420p[vin${i}]`)
    appendAudioDeclickFilter(parts, i, segmentDurations[i], `ain${i}`)
    vLabels.push(`[vin${i}]`)
    aLabels.push(`[ain${i}]`)
  }
  parts.push(`${vLabels.join('')}concat=n=${n}:v=1:a=0[vout]`)
  parts.push(`${aLabels.join('')}concat=n=${n}:v=0:a=1[aout]`)
  return parts.join(';\n')
}

async function runFilterComplexMerge(
  inputPaths: string[],
  filterComplex: string,
  outputPath: string,
  run: ActiveMergeRun,
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
    for (const inputPath of inputPaths) command = command.input(inputPath)
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
    attachMergeCommand(run, command)
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

/**
 * 换配图段之间：云朵软擦除转场（smoothright，自左向右）；
 * 叠加型 td 秒：各段画面/旁白完整保留，转场期间旁白连续硬切播放（不截断、不叠音、不插静音）。
 */
function buildXfadeFilterScript(segmentDurations: number[]): string {
  const td = IMAGE_CHANGE_TRANSITION_SEC
  const n = segmentDurations.length
  if (n <= 1) return ''

  const parts: string[] = []
  const vLabels: string[] = []
  const aLabels: string[] = []
  const tdStr = fmtFilterSec(td)

  for (let i = 0; i < n; i++) {
    const d = segmentDurations[i]
    const dStr = fmtFilterSec(d)
    const vLabel = `vin${i}`
    const aLabel = `ain${i}`
    if (i === 0) {
      parts.push(
        `[${i}:v]fps=25,trim=duration=${dStr},setpts=PTS-STARTPTS,format=yuv420p,tpad=stop_mode=clone:stop_duration=${tdStr}[${vLabel}]`,
      )
    } else {
      parts.push(
        `[${i}:v]fps=25,trim=duration=${dStr},setpts=PTS-STARTPTS,format=yuv420p,tpad=start_mode=clone:start_duration=${tdStr}[${vLabel}]`,
      )
    }
    appendAudioFullForMerge(parts, i, d, aLabel)
    vLabels.push(`[${vLabel}]`)
    aLabels.push(`[${aLabel}]`)
  }

  let vChain = vLabels[0]
  let cumulative = segmentDurations[0] + td

  for (let i = 1; i < n; i++) {
    const vOut = i === n - 1 ? 'vout' : `vxf${i}`
    const offset = Math.max(0.001, cumulative - td)
    parts.push(
      `${vChain}${vLabels[i]}xfade=transition=${IMAGE_CHANGE_TRANSITION}:duration=${tdStr}:offset=${fmtFilterSec(offset)}[${vOut}]`,
    )
    vChain = `[${vOut}]`
    cumulative += segmentDurations[i]
  }

  parts.push(`${aLabels.join('')}concat=n=${n}:v=0:a=1[aconcat]`)
  parts.push(`[aconcat]apad=pad_dur=${tdStr}[aout]`)

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

  await runFilterComplexMerge(
    segments.map(s => s.path),
    filterComplex,
    outputPath,
    run,
    onProgress,
  )
}

/** 硬切拼接（无云朵转场） */
async function mergeSegmentsWithConcat(
  segments: MergeSegment[],
  outputPath: string,
  run: ActiveMergeRun,
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  if (segments.length === 1) {
    fs.copyFileSync(segments[0].path, outputPath)
    return
  }
  await concatComposedVideos(segments.map(s => s.path), outputPath, run, onProgress)
}

function episodeUsesMotionComicMerge(episodeId: number): boolean {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return false
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return isMotionComicMode(parseProductionMode(drama?.metadata))
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
        duration: computePageFlipMergedDuration([current.duration, segments[i].duration]),
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

/** 同配图组：多镜顺序拼接；每镜已有独立成片时直接 concat */
async function buildMergeSegments(
  groups: VisualGroup[],
  storyboards: ComposedStoryboard[],
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
      const uniquePaths = [...new Set(group.clips.map(clip => clip.path))]
      if (uniquePaths.length === 1) {
        const duration = await getVideoDuration(uniquePaths[0])
        segments.push({ path: uniquePaths[0], duration, temp: false })
      } else {
        const tempPath = path.join(tempDir, `${uuid()}.mp4`)
        temps.push(tempPath)
        await concatClipsToFile(group.clips, tempPath, run)
        const duration = await getVideoDuration(tempPath)
        segments.push({ path: tempPath, duration, temp: true })
      }
    }
    onGroupProgress?.(i + 1, groups.length)
  }

  return { segments, temps }
}

function attachMergeCommand(run: ActiveMergeRun, command: ReturnType<typeof ffmpeg>) {
  run.command = command
  run.commands.add(command)
}

function computeMergeClipFingerprint(storyboards: ComposedStoryboard[]): string {
  const payload = storyboards
    .map(sb => String(sb.composedVideoUrl || '').trim())
    .join('\n')
  return createHash('sha256').update(payload).digest('hex').slice(0, 24)
}

function getMergeCacheDir(episodeId: number, fingerprint: string): string {
  return path.join(STORAGE_ROOT, 'merge-cache', `ep-${episodeId}`, fingerprint)
}

function laneCachePath(cacheDir: string, laneIndex: number): string {
  return path.join(cacheDir, `lane-${laneIndex}.mp4`)
}

function laneManifestPath(cacheDir: string): string {
  return path.join(cacheDir, 'manifest.json')
}

function readLaneManifest(cacheDir: string): MergeLaneManifest | null {
  const manifestFile = laneManifestPath(cacheDir)
  if (!fs.existsSync(manifestFile)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as MergeLaneManifest
  } catch {
    return null
  }
}

function writeLaneManifest(cacheDir: string, manifest: MergeLaneManifest) {
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(laneManifestPath(cacheDir), JSON.stringify(manifest, null, 2), 'utf-8')
}

function resolveMergeLaneCount(clipCount: number, groupCount: number, usePageFlip: boolean): number {
  if (clipCount < MERGE_LANE_MIN_CLIPS) return 1
  const parts = usePageFlip ? groupCount : clipCount
  if (parts < 2) return 1
  return Math.min(MERGE_LANE_CONCURRENCY, parts)
}

function splitContiguousBalanced<T>(items: T[], laneCount: number): T[][] {
  if (laneCount <= 1 || items.length <= 1) return [items]
  const lanes: T[][] = []
  const total = items.length
  const base = Math.floor(total / laneCount)
  const rem = total % laneCount
  let idx = 0
  for (let i = 0; i < laneCount; i++) {
    const size = base + (i < rem ? 1 : 0)
    if (size <= 0) continue
    lanes.push(items.slice(idx, idx + size))
    idx += size
  }
  return lanes.length ? lanes : [items]
}

/** 按画面段顺序切分，尽量均衡每路镜头数 */
function splitGroupsIntoContiguousLanes(groups: VisualGroup[], laneCount: number): VisualGroup[][] {
  if (laneCount <= 1 || groups.length <= 1) return [groups]
  const totalClips = groups.reduce((sum, group) => sum + group.clips.length, 0)
  const targetClipsPerLane = totalClips / laneCount
  const lanes: VisualGroup[][] = []
  let current: VisualGroup[] = []
  let currentClips = 0

  for (let i = 0; i < groups.length; i++) {
    current.push(groups[i])
    currentClips += groups[i].clips.length
    const lanesLeft = laneCount - lanes.length - 1
    const groupsLeft = groups.length - i - 1
    if (lanesLeft > 0 && groupsLeft >= lanesLeft && currentClips >= targetClipsPerLane) {
      lanes.push(current)
      current = []
      currentClips = 0
    }
  }
  if (current.length) lanes.push(current)
  return lanes.length ? lanes : [groups]
}

function collectLaneClipPaths(groups: VisualGroup[]): string[] {
  return groups.flatMap(group => group.clips.map(clip => clip.path))
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (!items.length) return
  let cursor = 0
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => runWorker()))
}

async function mergeSegmentListToFile(
  segments: MergeSegment[],
  outputPath: string,
  run: ActiveMergeRun,
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  if (segments.length === 1) {
    fs.copyFileSync(segments[0].path, outputPath)
    return
  }
  if (segments.length <= MAX_XFADE_INPUTS) {
    await mergeSegmentsWithPageFlip(segments, outputPath, run, onProgress)
    return
  }
  await mergeSegmentsSequential(segments, outputPath, run, onProgress)
}

async function buildLaneOutputFromGroups(
  groups: VisualGroup[],
  storyboards: ComposedStoryboard[],
  outputPath: string,
  run: ActiveMergeRun,
): Promise<{ duration: number; temps: string[] }> {
  if (!groups.length) throw new Error('拼接分路为空')

  const { segments, temps } = await buildMergeSegments(groups, storyboards, run)
  if (run.cancelled) return { duration: 0, temps }

  if (segments.length === 1) {
    fs.copyFileSync(segments[0].path, outputPath)
    return { duration: segments[0].duration, temps }
  }

  await mergeSegmentListToFile(segments, outputPath, run)
  return { duration: await getVideoDuration(outputPath), temps }
}

type MergeLanePlan = {
  clipPaths: string[]
  groups?: VisualGroup[]
}

function isLaneCacheValid(
  cachePath: string,
  manifest: MergeLaneManifest | null,
  fingerprint: string,
  laneIndex: number,
  clipPaths: string[],
): boolean {
  if (!manifest || manifest.fingerprint !== fingerprint) return false
  if (!fs.existsSync(cachePath)) return false
  const lane = manifest.lanes.find(item => item.index === laneIndex)
  if (!lane) return false
  if (lane.clipPaths.length !== clipPaths.length) return false
  return lane.clipPaths.every((clipPath, idx) => clipPath === clipPaths[idx])
}

async function mergeEpisodeBodyWithLanes(
  storyboards: ComposedStoryboard[],
  groups: VisualGroup[],
  usePageFlip: boolean,
  barePath: string,
  run: ActiveMergeRun,
  episodeId: number,
  onProgress: (encodedSec: number) => void,
): Promise<{ temps: string[]; laneCount: number; cacheFingerprint: string; bodyPageFlipTimes: number[] }> {
  const absPaths = storyboards.map(sb => toAbsPath(sb.composedVideoUrl!))
  const laneCount = resolveMergeLaneCount(storyboards.length, groups.length, usePageFlip)
  const cacheFingerprint = computeMergeClipFingerprint(storyboards)
  const cacheDir = getMergeCacheDir(episodeId, cacheFingerprint)
  const manifestRaw = readLaneManifest(cacheDir)
  const manifest = manifestRaw?.fingerprint === cacheFingerprint ? manifestRaw : null

  if (laneCount <= 1) {
    const temps: string[] = []
    const built = await buildMergeSegments(groups, storyboards, run)
    temps.push(...built.temps)
    if (run.cancelled) return { temps, laneCount: 1, cacheFingerprint, bodyPageFlipTimes: [] }

    if (usePageFlip) {
      await mergeSegmentListToFile(built.segments, barePath, run, onProgress)
      const bodyPageFlipTimes = built.segments.length > 1
        ? computePageFlipTransitionTimes(built.segments.map(seg => seg.duration))
        : []
      return { temps, laneCount: 1, cacheFingerprint, bodyPageFlipTimes }
    }

    if (built.segments.length === 1) {
      fs.copyFileSync(built.segments[0].path, barePath)
      onProgress?.(built.segments[0].duration)
    } else {
      await concatComposedVideos(built.segments.map(seg => seg.path), barePath, run, onProgress)
    }
    return { temps, laneCount: 1, cacheFingerprint, bodyPageFlipTimes: [] }
  }

  fs.mkdirSync(cacheDir, { recursive: true })
  const lanePlans: MergeLanePlan[] = usePageFlip
    ? splitGroupsIntoContiguousLanes(groups, laneCount).map(laneGroups => ({
      clipPaths: collectLaneClipPaths(laneGroups),
      groups: laneGroups,
    }))
    : splitContiguousBalanced(absPaths, laneCount).map(clipPaths => ({ clipPaths }))

  const effectiveLaneCount = lanePlans.length
  const laneOutputs: MergeSegment[] = new Array(effectiveLaneCount)
  const allTemps: string[] = []
  let finishedLanes = 0

  await mapWithConcurrency(
    lanePlans.map((_, index) => index),
    Math.min(MERGE_LANE_CONCURRENCY, effectiveLaneCount),
    async (laneIndex) => {
      if (run.cancelled) return

      const lanePlan = lanePlans[laneIndex]
      const { clipPaths } = lanePlan
      const cachePath = laneCachePath(cacheDir, laneIndex)

      if (isLaneCacheValid(cachePath, manifest, cacheFingerprint, laneIndex, clipPaths)) {
        laneOutputs[laneIndex] = {
          path: cachePath,
          duration: await getVideoDuration(cachePath),
          temp: false,
        }
        finishedLanes++
        const pct = 10 + Math.round((finishedLanes / effectiveLaneCount) * 55)
        setMergeProgress(episodeId, {
          mergeId: run.mergeId,
          phase: 'merging',
          percent: Math.min(65, pct),
          message: `分路 ${finishedLanes}/${effectiveLaneCount} 已完成（复用缓存）…`,
          updatedAt: Date.now(),
        })
        return
      }

      const buildPath = path.join(cacheDir, `lane-${laneIndex}-build-${uuid()}.mp4`)
      allTemps.push(buildPath)

      if (usePageFlip && lanePlan.groups?.length) {
        const { duration, temps } = await buildLaneOutputFromGroups(lanePlan.groups, storyboards, buildPath, run)
        allTemps.push(...temps)
        if (run.cancelled) return
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
        fs.renameSync(buildPath, cachePath)
        laneOutputs[laneIndex] = { path: cachePath, duration, temp: false }
      } else {
        await concatComposedVideos(clipPaths, buildPath, run)
        if (run.cancelled) return
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
        fs.renameSync(buildPath, cachePath)
        laneOutputs[laneIndex] = {
          path: cachePath,
          duration: await getVideoDuration(cachePath),
          temp: false,
        }
      }

      finishedLanes++
      const pct = 10 + Math.round((finishedLanes / effectiveLaneCount) * 55)
      setMergeProgress(episodeId, {
        mergeId: run.mergeId,
        phase: 'merging',
        percent: Math.min(65, pct),
        message: `分路 ${finishedLanes}/${effectiveLaneCount} 已生成（${Math.min(MERGE_LANE_CONCURRENCY, effectiveLaneCount)} 路并发）…`,
        updatedAt: Date.now(),
      })
    },
  )

  if (run.cancelled) return { temps: allTemps, laneCount: effectiveLaneCount, cacheFingerprint, bodyPageFlipTimes: [] }

  writeLaneManifest(cacheDir, {
    fingerprint: cacheFingerprint,
    lanes: lanePlans.map((plan, index) => ({
      index,
      clipPaths: plan.clipPaths,
    })),
  })

  setMergeProgress(episodeId, {
    mergeId: run.mergeId,
    phase: 'merging',
    percent: 68,
    message: `正在总拼接 ${effectiveLaneCount} 路分片…`,
    updatedAt: Date.now(),
  })

  const finalSegments = laneOutputs.filter(Boolean)
  if (finalSegments.length !== effectiveLaneCount) {
    throw new Error('部分拼接分路失败，请重试（已完成分路已缓存）')
  }

  if (usePageFlip) {
    await mergeSegmentListToFile(finalSegments, barePath, run, onProgress)
  } else {
    await concatComposedVideos(finalSegments.map(seg => seg.path), barePath, run, onProgress)
  }

  const bodyPageFlipTimes = usePageFlip && finalSegments.length > 1
    ? computePageFlipTransitionTimes(finalSegments.map(seg => seg.duration))
    : []

  logTaskProgress('MergeTask', 'lane-merge-complete', {
    mergeId: run.mergeId,
    episodeId,
    laneCount: effectiveLaneCount,
    cacheFingerprint,
    cacheDir,
  })

  return { temps: allTemps, laneCount: effectiveLaneCount, cacheFingerprint, bodyPageFlipTimes }
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
  usePageFlip = true,
): Promise<void> {
  if (segments.length === 1) {
    fs.copyFileSync(segments[0].path, outputPath)
    return
  }
  if (!usePageFlip) {
    await mergeSegmentsWithConcat(segments, outputPath, run)
    return
  }
  const tempOut = `${outputPath}.ordered.mp4`
  await mergeSegmentsWithPageFlip(segments, tempOut, run)
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
  fs.renameSync(tempOut, outputPath)
}

/** 无开幕/片头时，黑场云朵擦除进入正文第一镜（与换配图切镜一致） */
const BODY_LEAD_DURATION_SEC = IMAGE_CHANGE_TRANSITION_SEC

function runFfmpegSync(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' })
}

async function createBlackLeadSegment(tempDir: string, _run: ActiveMergeRun): Promise<MergeSegment> {
  fs.mkdirSync(tempDir, { recursive: true })
  const outPath = path.join(tempDir, `lead-${uuid()}.mp4`)
  const d = BODY_LEAD_DURATION_SEC
  const dStr = d.toFixed(3)

  runFfmpegSync([
    '-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=25:d=${dStr}`,
    '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${dStr}`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outPath,
  ])

  return { path: outPath, duration: d, temp: true }
}

async function prependBlackLeadPageFlip(
  bodyVideoPath: string,
  outputPath: string,
  run: ActiveMergeRun,
  tempCollector: string[],
  onProgress?: (encodedSec: number) => void,
): Promise<void> {
  const tempDir = path.join(STORAGE_ROOT, 'temp')
  const lead = await createBlackLeadSegment(tempDir, run)
  tempCollector.push(lead.path)
  const bodyDuration = await getVideoDuration(bodyVideoPath)
  await mergeSegmentsWithPageFlip(
    [lead, { path: bodyVideoPath, duration: bodyDuration, temp: false }],
    outputPath,
    run,
    onProgress,
  )
}

async function prependOpeningToMergedVideo(
  openingAbsPath: string,
  bodyPath: string,
  run: ActiveMergeRun,
  titleAbsPath?: string | null,
  usePageFlip = true,
): Promise<void> {
  const segments = await buildOrderedMergeSegments({
    openingAbs: openingAbsPath,
    titleAbs: titleAbsPath,
    bodyAbs: bodyPath,
  })
  await mergeOrderedSegmentsToOutput(segments, bodyPath, run, usePageFlip)
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
    attachMergeCommand(run, command)
    command
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  fs.renameSync(tempOut, videoPath)
}

/** 镜头合成阶段已混入 BGM 时，成片级再混会叠两层 */
function storyboardsHaveEmbeddedBgm(storyboards: Array<{ bgmAudioUrl?: string | null }>): boolean {
  return storyboards.some(sb => !!String(sb.bgmAudioUrl || '').trim())
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
  for (const command of active.commands) {
    try {
      command.kill('SIGKILL')
    } catch {}
  }

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

/** 主片拼接：按合成单元（与镜头合成一致，不含片头）取代表镜成片 */
function loadComposedStoryboards(episodeId: number, clipLimit?: number): ComposedStoryboard[] {
  const storyboards = loadEpisodeStoryboards(episodeId)
  const unitTotal = buildComposeUnitGroups(storyboards).length
  const composedUnits = listComposeMergeUnitStoryboards(storyboards) as ComposedStoryboard[]
  if (clipLimit && clipLimit > 0) {
    if (composedUnits.length === 0) {
      throw new Error('没有已合成的正文单元，请先在「镜头合成」完成至少 1 个单元')
    }
    return composedUnits.slice(0, clipLimit)
  }
  if (composedUnits.length !== unitTotal) {
    throw new Error(`尚有 ${unitTotal - composedUnits.length} 个合成单元未完成（${composedUnits.length}/${unitTotal}），请先在「镜头合成」完成全部单元后再导出`)
  }
  if (composedUnits.length === 0) throw new Error('No videos to merge')
  return composedUnits
}

async function doMerge(mergeId: number, episodeId: number, options: MergeOptions = {}) {
  const run: ActiveMergeRun = { mergeId, cancelled: false, command: null, commands: new Set() }
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
  const motionComicMerge = episodeUsesMotionComicMerge(episodeId)
  const usePageFlip = !motionComicMerge && groups.length > 1
  const includeOpeningVideo = options.includeOpeningVideo === true
  let tempFiles: string[] = []

  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const bareFilename = `${uuid()}.mp4`
  const barePath = path.join(outputDir, bareFilename)
  let deliverFilename = bareFilename
  let deliverPath = barePath

  const updateEncodeProgress = (encodedSec: number) => {
    const ratio = Math.min(1, encodedSec / totalDurationSec)
    const percent = Math.min(94, 10 + Math.round(ratio * 84))
    setMergeProgress(episodeId, {
      mergeId,
      phase: 'merging',
      percent,
      message: usePageFlip
        ? `正在云朵转场拼接 (${percent}%)…`
        : `正在拼接 ${storyboards.length} 个合成单元 (${percent}%)…`,
      updatedAt: Date.now(),
    })
  }

  let mergeLaneCount = 1
  let mergeCacheFingerprint = computeMergeClipFingerprint(storyboards)
  let pageFlipTimes: number[] = []

  try {
    if (usePageFlip) {
      setMergeProgress(episodeId, {
        mergeId,
        phase: 'merging',
        percent: 10,
        message: `正在按 ${resolveMergeLaneCount(storyboards.length, groups.length, true)} 路并发生成拼接分片…`,
        updatedAt: Date.now(),
      })
    } else {
      setMergeProgress(episodeId, {
        mergeId,
        phase: 'merging',
        percent: 10,
        message: `正在按 ${resolveMergeLaneCount(storyboards.length, groups.length, false)} 路并发拼接 ${storyboards.length} 个镜头…`,
        updatedAt: Date.now(),
      })
    }

    const laneResult = await mergeEpisodeBodyWithLanes(
      storyboards,
      groups,
      usePageFlip,
      barePath,
      run,
      episodeId,
      updateEncodeProgress,
    )
    tempFiles = laneResult.temps
    mergeLaneCount = laneResult.laneCount
    mergeCacheFingerprint = laneResult.cacheFingerprint
    pageFlipTimes = laneResult.bodyPageFlipTimes
    if (run.cancelled) return
  } catch (err: any) {
    activeMerges.delete(episodeId)
    clearMergeProgress(episodeId)
    cleanupTempFiles(tempFiles)
    if (run.cancelled) {
      if (fs.existsSync(barePath)) fs.unlinkSync(barePath)
      if (deliverPath !== barePath && fs.existsSync(deliverPath)) fs.unlinkSync(deliverPath)
      return
    }
    throw err
  }

  if (run.cancelled) {
    activeMerges.delete(episodeId)
    clearMergeProgress(episodeId)
    cleanupTempFiles(tempFiles)
    if (fs.existsSync(barePath)) fs.unlinkSync(barePath)
    if (deliverPath !== barePath && fs.existsSync(deliverPath)) fs.unlinkSync(deliverPath)
    return
  }

  cleanupTempFiles(tempFiles)

  if (!includeOpeningVideo && !run.cancelled && !motionComicMerge) {
    setMergeProgress(episodeId, {
      mergeId,
      phase: 'finalizing',
      percent: 86,
      message: '正在为首镜添加云朵入场…',
      updatedAt: Date.now(),
    })
    try {
      deliverFilename = `${uuid()}.mp4`
      deliverPath = path.join(outputDir, deliverFilename)
      await prependBlackLeadPageFlip(barePath, deliverPath, run, tempFiles, updateEncodeProgress)
      totalDurationSec += BODY_LEAD_DURATION_SEC
      pageFlipTimes = prependPageFlipSegmentTimeline(BODY_LEAD_DURATION_SEC, pageFlipTimes)
    } catch (err: any) {
      throw new Error(`首镜云朵入场失败: ${err.message}`)
    } finally {
      cleanupTempFiles(tempFiles)
    }
  }

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
        const openingDur = await getVideoDuration(openingAbs)
        await prependOpeningToMergedVideo(openingAbs, deliverPath, run, undefined, usePageFlip)
        totalDurationSec += openingDur
        pageFlipTimes = prependPageFlipSegmentTimeline(openingDur, pageFlipTimes)
      } catch (err: any) {
        throw new Error(`开幕视频拼接失败: ${err.message}`)
      }
    }
  }

  if (run.cancelled) return

  if (pageFlipTimes.length > 0 && !run.cancelled) {
    setMergeProgress(episodeId, {
      mergeId,
      phase: 'finalizing',
      percent: 90,
      message: '正在混入转场音效…',
      updatedAt: Date.now(),
    })
    try {
      await mixPageFlipSfxIntoMergedVideo(
        deliverPath,
        pageFlipTimes,
        cmd => attachMergeCommand(run, cmd),
      )
    } catch (err: any) {
      throw new Error(`转场音效混音失败: ${err.message}`)
    }
  }

  let bgmSkippedEmbedded = false
  if (options.bgmMusicId && !run.cancelled) {
    if (storyboardsHaveEmbeddedBgm(storyboards)) {
      bgmSkippedEmbedded = true
      logTaskProgress('MergeTask', 'bgm-skipped-embedded', {
        mergeId,
        episodeId,
        bgmMusicId: options.bgmMusicId,
        reason: 'shots-already-have-bgm',
      })
    } else {
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
          await mixBgmIntoMergedVideo(deliverPath, bgmAbs, options.bgmVolume ?? BGM_VOICE_MIX_VOLUME, run)
        } catch (err: any) {
          throw new Error(`BGM 混音失败: ${err.message}`)
        }
      } else {
        logTaskError('MergeTask', 'bgm-missing', { mergeId, episodeId, bgmMusicId: options.bgmMusicId })
      }
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
  const duration = Math.round(await getVideoDuration(deliverPath))

  const bareRelative = `static/merged/${bareFilename}`
  const mergedRelative = `static/merged/${deliverFilename}`

  const scenesMeta: MergeScenesMeta = {
    clips: storyboards.map(sb => sb.composedVideoUrl).filter(Boolean) as string[],
    bodyMergedUrl: bareRelative,
    withOpening: includeOpeningVideo,
    withTitle: false,
    test: !!clipLimit,
    clipLimit,
    bgmSkippedEmbedded: bgmSkippedEmbedded || undefined,
    mergeLaneCount,
    mergeCacheFingerprint,
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
    mergeMode: usePageFlip ? 'cloud-wipe-audio-declick' : 'concat-declick',
    mergeLaneCount,
    mergeCacheFingerprint,
    pageFlipTransitions: usePageFlip ? groups.length - 1 : 0,
    bodyLeadPageFlip: !includeOpeningVideo,
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
  const run: ActiveMergeRun = { mergeId, cancelled: false, command: null, commands: new Set() }
  const motionComicMerge = episodeUsesMotionComicMerge(episodeId)
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
    await mergeOrderedSegmentsToOutput(segments, outputPath, run, !motionComicMerge)
    if (run.cancelled) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      return
    }

    const flipTimes = motionComicMerge ? [] : computePageFlipTransitionTimes(segments.map(seg => seg.duration))
    if (flipTimes.length) {
      await mixPageFlipSfxIntoMergedVideo(outputPath, flipTimes, cmd => attachMergeCommand(run, cmd))
    }

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
  const run: ActiveMergeRun = { mergeId, cancelled: false, command: null, commands: new Set() }
  const motionComicMerge = episodeUsesMotionComicMerge(episodeId)
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
    await mergeOrderedSegmentsToOutput(segments, outputPath, run, !motionComicMerge)
    if (run.cancelled) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      return
    }

    const flipTimes = motionComicMerge ? [] : computePageFlipTransitionTimes(segments.map(seg => seg.duration))
    if (flipTimes.length) {
      await mixPageFlipSfxIntoMergedVideo(outputPath, flipTimes, cmd => attachMergeCommand(run, cmd))
    }

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
