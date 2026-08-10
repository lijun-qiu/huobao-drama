export type TimelineClipType = 'video' | 'audio' | 'image' | 'subtitle' | 'transition'
export type TimelineTrackType = 'video' | 'overlay' | 'audio' | 'subtitle'

export interface TimelineClip {
  id: string
  type: TimelineClipType
  name: string
  sourceUrl?: string
  startMs: number
  durationMs: number
  trimInMs: number
  trimOutMs: number
  trackId: string
  opacity?: number
  volume?: number
  playbackRate?: number
  fadeInMs?: number
  fadeOutMs?: number
  text?: string
  fontSize?: number
  transitionType?: 'fade' | 'dissolve'
  transitionDurationMs?: number
}

export interface TimelineTrack {
  id: string
  type: TimelineTrackType
  name: string
  clips: TimelineClip[]
}

export interface TimelineProject {
  version: 1
  episodeId: number
  width: number
  height: number
  tracks: TimelineTrack[]
  currentTimeMs: number
  scale: number
  snapEnabled: boolean
}

export interface TimelineMediaItem {
  id: string
  kind: 'video' | 'audio' | 'image'
  name: string
  url: string
  durationMs?: number
  thumbUrl?: string
  group?: string
}

export const DEFAULT_TIMELINE_WIDTH = 1080
export const DEFAULT_TIMELINE_HEIGHT = 1920
export const DEFAULT_PX_PER_SEC = 48

export function createEmptyTracks(): TimelineTrack[] {
  return [
    { id: 'track-video-main', type: 'video', name: '主视频', clips: [] },
    { id: 'track-overlay', type: 'overlay', name: '叠加', clips: [] },
    { id: 'track-audio', type: 'audio', name: '音频', clips: [] },
    { id: 'track-subtitle', type: 'subtitle', name: '字幕', clips: [] },
  ]
}

export function createEmptyProject(episodeId: number, width = DEFAULT_TIMELINE_WIDTH, height = DEFAULT_TIMELINE_HEIGHT): TimelineProject {
  return {
    version: 1,
    episodeId,
    width,
    height,
    tracks: createEmptyTracks(),
    currentTimeMs: 0,
    scale: DEFAULT_PX_PER_SEC,
    snapEnabled: true,
  }
}

export function uid(prefix = 'clip') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function msToUs(ms: number) {
  return Math.max(0, Math.round(ms * 1000))
}

export function usToMs(us: number) {
  return Math.max(0, Math.round(us / 1000))
}

export function formatTimecode(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const frac = Math.floor((ms % 1000) / 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${frac}`
}

export function projectTotalDurationMs(project: TimelineProject) {
  let max = 0
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startMs + clip.durationMs)
    }
  }
  return max
}

export function cloneProject(project: TimelineProject): TimelineProject {
  return JSON.parse(JSON.stringify(project)) as TimelineProject
}
