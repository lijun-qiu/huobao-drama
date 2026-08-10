import type { TimelineProject } from '~/composables/timeline-types'
import { cloneProject, createEmptyProject } from '~/composables/timeline-types'

function storageKey(episodeId: number | string) {
  return `timeline-project:${episodeId}`
}

export function hasTimelineProject(episodeId?: number | string | null) {
  if (episodeId == null || episodeId === '') return false
  if (typeof localStorage === 'undefined') return false
  try {
    return !!localStorage.getItem(storageKey(episodeId))
  } catch {
    return false
  }
}

export function loadTimelineProject(episodeId: number): TimelineProject | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(episodeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as TimelineProject
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tracks)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveTimelineProject(project: TimelineProject) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(project.episodeId), JSON.stringify(project))
  } catch (err) {
    console.warn('[timeline] save failed', err)
  }
}

export function clearTimelineProject(episodeId: number) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(storageKey(episodeId))
  } catch {
    /* ignore */
  }
}

export function downloadTimelineProjectJson(project: TimelineProject, filename?: string) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `episode-${project.episodeId}-timeline.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function parseTimelineProjectFile(file: File): Promise<TimelineProject> {
  const text = await file.text()
  const parsed = JSON.parse(text) as TimelineProject
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tracks)) {
    throw new Error('无效的时间线工程文件')
  }
  return parsed
}

export function ensureProject(episodeId: number, width?: number, height?: number): TimelineProject {
  return loadTimelineProject(episodeId) || createEmptyProject(episodeId, width, height)
}

export function snapshotProject(project: TimelineProject) {
  return cloneProject(project)
}
