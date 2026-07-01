/**
 * 漫画解说 — 合成阶段镜头动效（按镜头描述：推/拉/横移/上下/近景放大）
 * 零 I2V：静图 + FFmpeg zoompan
 */
import type { MotionComicCameraKind, MotionComicMotionTier, MotionComicShotRole } from '../constants/motion-comic.js'
import { DEFAULT_MOTION_COMIC_PRESET } from '../constants/motion-comic.js'

const COMPOSE_FPS = 25

function durationToFrameCount(durationSec: number, fps = COMPOSE_FPS): number {
  return Math.max(1, Math.round(durationSec * fps))
}

function fmtFrames(frames: number): string {
  return String(Math.max(1, frames - 1))
}

export type MotionCameraOptions = {
  zoomStep?: number
  enablePan?: boolean
  pageIndex?: number
  shotIndexInGroup?: number
  shotCountInGroup?: number
  cameraKind?: MotionComicCameraKind
  shotRole?: MotionComicShotRole
  isDiptych?: boolean
  tier?: MotionComicMotionTier
}

/** 上下运镜：上→下（条漫下滑阅读感） */
export function buildMotionComicPanTbFilter(
  durationSec: number,
  options?: { shotIndex?: number; shotCount?: number },
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const shotIndex = options?.shotIndex ?? 0
  const shotCount = Math.max(1, options?.shotCount ?? 1)
  const z = 1.14
  const segmentSize = 1 / shotCount
  const startFrac = shotIndex * segmentSize
  const endFrac = Math.min(1, startFrac + segmentSize)
  const delta = endFrac - startFrac
  return [
    'scale=8000:-1',
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(${startFrac}+${delta}*on/${fmtFrames(frames)})':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 上下运镜：下→上 */
export function buildMotionComicPanBtFilter(
  durationSec: number,
  options?: { shotIndex?: number; shotCount?: number },
  fps = COMPOSE_FPS,
): string {
  const frames = durationToFrameCount(durationSec, fps)
  const shotIndex = options?.shotIndex ?? 0
  const shotCount = Math.max(1, options?.shotCount ?? 1)
  const z = 1.14
  const segmentSize = 1 / shotCount
  const startFrac = 1 - shotIndex * segmentSize
  const endFrac = Math.max(0, startFrac - segmentSize)
  const delta = endFrac - startFrac
  return [
    'scale=8000:-1',
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(${startFrac}+${delta}*on/${fmtFrames(frames)})':d=${frames}:s=1280x720:fps=${fps}`,
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
  const startZ = 1 + shotIndex * step
  const endZ = pageIndex % 2 === 0 ? startZ + step * 2 : startZ - step * 0.5
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${fmtFrames(frames)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 建立镜：缓慢拉远，展示场景 */
export function buildMotionComicZoomOutFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1.14
  const endZ = 1.02
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${fmtFrames(frames)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 横移左→右（建立镜 / 氛围镜） */
export function buildMotionComicPanFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  return [
    'scale=8000:-1',
    `zoompan=z='1.08':x='(iw-iw/zoom)*on/${fmtFrames(frames)}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 横移右→左 */
export function buildMotionComicPanReverseFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  return [
    'scale=8000:-1',
    `zoompan=z='1.08':x='(iw-iw/zoom)*(1-on/${fmtFrames(frames)})':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 对白镜：轻微漂移（微推 + 微移） */
export function buildMotionComicDriftFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1.04
  const endZ = 1.09
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${fmtFrames(frames)}':x='(iw-iw/zoom)*0.15*on/${fmtFrames(frames)}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 双格图：从左格扫到右格，模拟动作连续 */
export function buildMotionComicDiptychSweepFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  const z = 1.32
  return [
    'scale=8000:-1',
    `zoompan=z='${z}':x='(iw-iw/zoom)*on/${fmtFrames(frames)}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

/** 冲击镜：快推 + 色散 + 暗角 */
export function buildMotionComicShockFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1
  const endZ = 1.12
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${fmtFrames(frames)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
    'rgbashift=rh=-8:gh=0:bv=8',
    'vignette=angle=PI/4',
    'format=yuv420p',
  ].join(',')
}

/** 打斗镜：更快推镜 + 强色散 */
export function buildMotionComicActionFilter(durationSec: number, fps = COMPOSE_FPS): string {
  const frames = durationToFrameCount(durationSec, fps)
  const startZ = 1.05
  const endZ = 1.18
  const delta = endZ - startZ
  return [
    'scale=8000:-1',
    `zoompan=z='${startZ}+${delta}*on/${fmtFrames(frames)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`,
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
  const panOpts = {
    shotIndex: options?.shotIndexInGroup ?? 0,
    shotCount: options?.shotCountInGroup ?? 1,
  }

  if (kind === 'pan_tb') return buildMotionComicPanTbFilter(durationSec, panOpts, fps)
  if (kind === 'pan_bt') return buildMotionComicPanBtFilter(durationSec, panOpts, fps)
  if (kind === 'diptych_sweep') return buildMotionComicDiptychSweepFilter(durationSec, fps)
  if (kind === 'action_push') return buildMotionComicActionFilter(durationSec, fps)
  if (kind === 'shock_push') return buildMotionComicShockFilter(durationSec, fps)
  if (kind === 'zoom_out') return buildMotionComicZoomOutFilter(durationSec, fps)
  if (kind === 'pan_lr') return buildMotionComicPanFilter(durationSec, fps)
  if (kind === 'pan_rl') return buildMotionComicPanReverseFilter(durationSec, fps)
  if (kind === 'drift') return buildMotionComicDriftFilter(durationSec, fps)
  if (kind === 'zoom_in') return buildMotionComicZoomFilter(durationSec, options, fps)

  // 默认：轻微推近（近景感）
  return buildMotionComicZoomFilter(durationSec, options, fps)
}
