/**
 * 漫画解说 — 合成阶段镜头动效（按镜头描述：推/拉/横移/上下/近景放大）
 * 零 I2V：静图 + FFmpeg zoompan
 */
import type { MotionComicCameraKind, MotionComicMotionTier, MotionComicShotRole, MotionComicVfxKind } from '../constants/motion-comic.js'
import { DEFAULT_MOTION_COMIC_PRESET } from '../constants/motion-comic.js'
import { appendMotionComicVfxFilter } from './motion-comic-vfx.js'

const COMPOSE_FPS = 25

/** 全局运镜幅度倍率（推/拉/横移/上下共用） */
const MOTION_COMIC_AMPLITUDE = 1.45

function amp(value: number): number {
  return value * MOTION_COMIC_AMPLITUDE
}

function durationToFrameCount(durationSec: number, fps = COMPOSE_FPS): number {
  return Math.max(1, Math.round(durationSec * fps))
}

export type MotionCameraOptions = {
  zoomStep?: number
  enablePan?: boolean
  pageIndex?: number
  shotIndexInGroup?: number
  shotCountInGroup?: number
  /** 显式覆盖运镜强度（整段合成时由 clip 时长推算） */
  motionScale?: number
  cameraKind?: MotionComicCameraKind
  shotRole?: MotionComicShotRole
  isDiptych?: boolean
  tier?: MotionComicMotionTier
  vfxKind?: MotionComicVfxKind
}

/** 按 clip 时长推算运镜强度：短句略快，长段略慢，保证肉眼可见 */
export function resolveMotionComicMotionScale(
  _shotCountInGroup = 1,
  durationSec?: number,
): number {
  if (typeof durationSec === 'number' && durationSec > 0) {
    if (durationSec < 3.5) return 1.72
    if (durationSec < 5) return 1.55
    if (durationSec < 8) return 1.35
    if (durationSec < 14) return 1.15
    return Math.max(0.95, 1.15 - (durationSec - 14) * 0.01)
  }
  return 1.4
}

function motionScaleFromOptions(options?: MotionCameraOptions, durationSec?: number): number {
  if (typeof options?.motionScale === 'number') return options.motionScale
  return resolveMotionComicMotionScale(options?.shotCountInGroup ?? 1, durationSec)
}

function clampScale(value: number, max = 1.85): number {
  return Math.min(max, Math.max(0.45, value))
}

/** 运镜进度分母：scale 越大越早走完行程（单镜更快） */
function fmtMotionProgress(frames: number, motionScale: number): string {
  const denom = Math.max(1, Math.round(Math.max(1, frames - 1) / clampScale(motionScale)))
  return String(denom)
}

/** 上下运镜：上→下（条漫下滑阅读感） */
export function buildMotionComicPanTbFilter(
  durationSec: number,
  options?: { shotIndex?: number; shotCount?: number; motionScale?: number },
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const shotIndex = options?.shotIndex ?? 0
  const shotCount = Math.max(1, options?.shotCount ?? 1)
  const motionScale = options?.motionScale ?? resolveMotionComicMotionScale(shotCount, durationSec)
  const z = 1.28
  const segmentSize = (1 / shotCount) * clampScale(motionScale)
  const startFrac = shotIndex * segmentSize
  const endFrac = Math.min(1, startFrac + segmentSize)
  const delta = endFrac - startFrac
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(${startFrac}+${delta}*on/${progress})':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 上下运镜：下→上 */
export function buildMotionComicPanBtFilter(
  durationSec: number,
  options?: { shotIndex?: number; shotCount?: number; motionScale?: number },
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const shotIndex = options?.shotIndex ?? 0
  const shotCount = Math.max(1, options?.shotCount ?? 1)
  const motionScale = options?.motionScale ?? resolveMotionComicMotionScale(shotCount, durationSec)
  const z = 1.28
  const segmentSize = (1 / shotCount) * clampScale(motionScale)
  const startFrac = 1 - shotIndex * segmentSize
  const endFrac = Math.max(0, startFrac - segmentSize)
  const delta = endFrac - startFrac
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(${startFrac}+${delta}*on/${progress})':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 标准推镜（比解说略强） */
export function buildMotionComicZoomFilter(
  durationSec: number,
  options?: MotionCameraOptions,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const step = options?.zoomStep ?? DEFAULT_MOTION_COMIC_PRESET.camera!.zoom_step!
  const pageIndex = options?.pageIndex ?? 0
  const shotIndex = options?.shotIndexInGroup ?? 0
  const motionScale = motionScaleFromOptions(options, durationSec)
  const startZ = 1 + shotIndex * step
  const pushDelta = amp(step * 4.5) * motionScale
  const pullDelta = amp(step * 3.5) * motionScale
  const pushIn = options?.cameraKind === 'zoom_in' || pageIndex % 2 === 0
  const endZ = pushIn ? startZ + pushDelta : Math.max(1.04, startZ - pullDelta)
  const zoomDelta = endZ - startZ
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${zoomDelta}*on/${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 建立镜：缓慢拉远，展示场景 */
export function buildMotionComicZoomOutFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1 + amp(0.22) * clampScale(motionScale)
  const endZ = 1
  const delta = endZ - startZ
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 横移左→右（建立镜 / 氛围镜） */
export function buildMotionComicPanFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const travel = clampScale(motionScale)
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='1.22':x='(iw-iw/zoom)*${travel}*on/${progress}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 横移右→左 */
export function buildMotionComicPanReverseFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const travel = clampScale(motionScale)
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='1.22':x='(iw-iw/zoom)*${travel}*(1-on/${progress})':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 对白镜：轻微漂移（微推 + 微移） */
export function buildMotionComicDriftFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1.06
  const endZ = 1.06 + amp(0.11) * clampScale(motionScale)
  const delta = endZ - startZ
  const panTravel = amp(0.48) * clampScale(motionScale)
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${progress}':x='(iw-iw/zoom)*${panTravel}*on/${progress}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 双格图：从左格扫到右格，模拟动作连续 */
export function buildMotionComicDiptychSweepFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const z = 1.32
  const travel = clampScale(motionScale)
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${z}':x='(iw-iw/zoom)*${travel}*on/${progress}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 冲击镜：快推 + 色散 + 暗角 */
export function buildMotionComicShockFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1
  const endZ = 1 + amp(0.17) * clampScale(motionScale)
  const delta = endZ - startZ
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'rgbashift=rh=-8:gh=0:bv=8',
    'vignette=angle=PI/4',
    'format=yuv420p',
  ].join(',')
}

/** 打斗镜：更快推镜 + 强色散 */
export function buildMotionComicActionFilter(
  durationSec: number,
  motionScale = 1,
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1.05
  const endZ = 1.05 + amp(0.18) * clampScale(motionScale)
  const delta = endZ - startZ
  const progress = fmtMotionProgress(frames, motionScale)
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'rgbashift=rh=-12:gh=0:bv=12',
    'vignette=angle=PI/5',
    'format=yuv420p',
  ].join(',')
}

export function buildMotionComicComposeFilter(
  tier: MotionComicMotionTier,
  durationSec: number,
  options?: MotionCameraOptions,
  fps = COMPOSE_FPS,
): string {
  const kind = options?.cameraKind
  const shotCount = Math.max(1, options?.shotCountInGroup ?? 1)
  const motionScale = motionScaleFromOptions(options, durationSec)
  const panOpts = {
    shotIndex: options?.shotIndexInGroup ?? 0,
    shotCount,
    motionScale,
  }

  let cameraFilter: string
  if (kind === 'pan_tb') cameraFilter = buildMotionComicPanTbFilter(durationSec, panOpts, fps)
  else if (kind === 'pan_bt') cameraFilter = buildMotionComicPanBtFilter(durationSec, panOpts, fps)
  else if (kind === 'diptych_sweep') cameraFilter = buildMotionComicDiptychSweepFilter(durationSec, motionScale, fps)
  else if (kind === 'action_push') cameraFilter = buildMotionComicActionFilter(durationSec, motionScale, fps)
  else if (kind === 'shock_push') cameraFilter = buildMotionComicShockFilter(durationSec, motionScale, fps)
  else if (kind === 'zoom_out') cameraFilter = buildMotionComicZoomOutFilter(durationSec, motionScale, fps)
  else if (kind === 'pan_lr') cameraFilter = buildMotionComicPanFilter(durationSec, motionScale, fps)
  else if (kind === 'pan_rl') cameraFilter = buildMotionComicPanReverseFilter(durationSec, motionScale, fps)
  else if (kind === 'drift') cameraFilter = buildMotionComicDriftFilter(durationSec, motionScale, fps)
  else if (kind === 'zoom_in') cameraFilter = buildMotionComicZoomFilter(durationSec, options, fps)
  else cameraFilter = buildMotionComicZoomFilter(durationSec, options, fps)

  return appendMotionComicVfxFilter(cameraFilter, options?.vfxKind, durationSec, fps)
}
