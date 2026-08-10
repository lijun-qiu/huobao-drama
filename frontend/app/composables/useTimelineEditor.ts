import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import type { TimelineClip, TimelineMediaItem, TimelineProject, TimelineTrack } from '~/composables/timeline-types'
import {
  createEmptyProject,
  createEmptyTracks,
  formatTimecode,
  msToUs,
  projectTotalDurationMs,
  uid,
} from '~/composables/timeline-types'
import {
  clearTimelineProject,
  downloadTimelineProjectJson,
  loadTimelineProject,
  parseTimelineProjectFile,
  saveTimelineProject,
} from '~/composables/useTimelineProject'

type AvCanvas = import('@webav/av-canvas').AVCanvas
type VisibleSprite = import('@webav/av-cliper').VisibleSprite

export interface TimelineEditorOptions {
  episodeId: Ref<number>
  episodeNumber?: Ref<number | string>
  mediaItems: Ref<TimelineMediaItem[]>
  canvasWidth?: number
  canvasHeight?: number
}

function normalizeMediaUrl(url?: string | null) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:')) return url
  return `/${String(url).replace(/^\//, '')}`
}

async function fetchStream(url: string) {
  const res = await fetch(normalizeMediaUrl(url))
  if (!res.ok || !res.body) throw new Error(`无法加载素材: ${url}`)
  return res.body
}

function fitSpriteCover(spr: VisibleSprite, cw: number, ch: number) {
  const w = spr.rect.w || cw
  const h = spr.rect.h || ch
  const scale = Math.max(cw / w, ch / h)
  spr.rect.w = w * scale
  spr.rect.h = h * scale
  spr.rect.x = Math.round((cw - spr.rect.w) / 2)
  spr.rect.y = Math.round((ch - spr.rect.h) / 2)
}

export function useTimelineEditor(opts: TimelineEditorOptions) {
  const width = opts.canvasWidth ?? 1080
  const height = opts.canvasHeight ?? 1920

  const project = ref<TimelineProject>(createEmptyProject(opts.episodeId.value, width, height))
  const selectedIds = ref<string[]>([])
  const playing = ref(false)
  const exporting = ref(false)
  const exportProgress = ref(0)
  const syncing = ref(false)
  const previewReady = ref(false)
  const canvasHost = shallowRef<HTMLElement | null>(null)

  let avCanvas: AvCanvas | null = null
  const spriteMap = new Map<string, VisibleSprite>()
  let syncToken = 0
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let syncTimer: ReturnType<typeof setTimeout> | null = null

  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  const MAX_HISTORY = 40

  const totalDurationMs = computed(() => Math.max(1000, projectTotalDurationMs(project.value)))
  const selectedClip = computed(() => {
    const id = selectedIds.value[0]
    if (!id) return null
    for (const track of project.value.tracks) {
      const clip = track.clips.find(c => c.id === id)
      if (clip) return clip
    }
    return null
  })
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      saveTimelineProject(project.value)
    }, 400)
  }

  function syncCanvasSoon(delay = 280) {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      void syncCanvas()
    }, delay)
  }

  function pushHistory() {
    undoStack.value.push(JSON.stringify({
      tracks: project.value.tracks,
      selectedIds: selectedIds.value,
      currentTimeMs: project.value.currentTimeMs,
    }))
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
  }

  function applySnapshot(raw: string) {
    try {
      const snap = JSON.parse(raw) as {
        tracks: TimelineTrack[]
        selectedIds: string[]
        currentTimeMs: number
      }
      project.value.tracks = snap.tracks
      selectedIds.value = snap.selectedIds || []
      project.value.currentTimeMs = snap.currentTimeMs || 0
      persistSoon()
      void syncCanvas()
    } catch {
      /* ignore */
    }
  }

  function undo() {
    const prev = undoStack.value.pop()
    if (!prev) return
    redoStack.value.push(JSON.stringify({
      tracks: project.value.tracks,
      selectedIds: selectedIds.value,
      currentTimeMs: project.value.currentTimeMs,
    }))
    applySnapshot(prev)
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(JSON.stringify({
      tracks: project.value.tracks,
      selectedIds: selectedIds.value,
      currentTimeMs: project.value.currentTimeMs,
    }))
    applySnapshot(next)
  }

  function loadOrReset() {
    const saved = loadTimelineProject(opts.episodeId.value)
    project.value = saved
      ? { ...saved, episodeId: opts.episodeId.value, width, height }
      : createEmptyProject(opts.episodeId.value, width, height)
    selectedIds.value = []
    undoStack.value = []
    redoStack.value = []
    void syncCanvas()
  }

  function resetProject() {
    pushHistory()
    project.value = createEmptyProject(opts.episodeId.value, width, height)
    selectedIds.value = []
    clearTimelineProject(opts.episodeId.value)
    void syncCanvas()
    toast.success('已重置时间线')
  }

  function findClip(clipId: string): { track: TimelineTrack; clip: TimelineClip; index: number } | null {
    for (const track of project.value.tracks) {
      const index = track.clips.findIndex(c => c.id === clipId)
      if (index >= 0) return { track, clip: track.clips[index], index }
    }
    return null
  }

  function selectClip(id: string | null, additive = false) {
    if (!id) {
      selectedIds.value = []
      return
    }
    if (additive) {
      if (selectedIds.value.includes(id)) {
        selectedIds.value = selectedIds.value.filter(x => x !== id)
      } else {
        selectedIds.value = [...selectedIds.value, id]
      }
      return
    }
    selectedIds.value = [id]
  }

  function snapMs(ms: number) {
    if (!project.value.snapEnabled) return Math.max(0, Math.round(ms))
    const step = 100
    return Math.max(0, Math.round(ms / step) * step)
  }

  function trackByType(type: TimelineTrack['type']) {
    return project.value.tracks.find(t => t.type === type) || project.value.tracks[0]
  }

  function addMediaToTrack(item: TimelineMediaItem, trackId?: string, atMs?: number) {
    pushHistory()
    const track = trackId
      ? project.value.tracks.find(t => t.id === trackId) || trackByType(item.kind === 'audio' ? 'audio' : item.kind === 'image' ? 'overlay' : 'video')
      : trackByType(item.kind === 'audio' ? 'audio' : item.kind === 'image' ? 'overlay' : 'video')

    const durationMs = Math.max(500, item.durationMs || 3000)
    const startMs = snapMs(atMs ?? projectTotalDurationMs(project.value))
    const clip: TimelineClip = {
      id: uid(item.kind),
      type: item.kind === 'image' ? 'image' : item.kind,
      name: item.name,
      sourceUrl: item.url,
      startMs,
      durationMs,
      trimInMs: 0,
      trimOutMs: durationMs,
      trackId: track.id,
      opacity: 1,
      volume: 1,
      playbackRate: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
    }
    track.clips.push(clip)
    track.clips.sort((a, b) => a.startMs - b.startMs)
    selectedIds.value = [clip.id]
    persistSoon()
    syncCanvasSoon()
    return clip
  }

  function layOutComposedUnits(items: TimelineMediaItem[]) {
    const videos = items.filter(i => i.kind === 'video' && i.group === 'composed')
    if (!videos.length) {
      toast.error('没有可铺轨的合成镜头')
      return
    }
    pushHistory()
    const main = trackByType('video')
    main.clips = []
    let cursor = 0
    for (const item of videos) {
      const durationMs = Math.max(500, item.durationMs || 3000)
      main.clips.push({
        id: uid('video'),
        type: 'video',
        name: item.name,
        sourceUrl: item.url,
        startMs: cursor,
        durationMs,
        trimInMs: 0,
        trimOutMs: durationMs,
        trackId: main.id,
        opacity: 1,
        volume: 1,
        playbackRate: 1,
      })
      cursor += durationMs
    }
    project.value.currentTimeMs = 0
    selectedIds.value = main.clips[0] ? [main.clips[0].id] : []
    persistSoon()
    void syncCanvas()
    toast.success(`已铺轨 ${videos.length} 个合成单元`)
  }

  function importMergedVideo(item: TimelineMediaItem | null) {
    if (!item?.url) {
      toast.error('尚无拼接成片')
      return
    }
    pushHistory()
    const main = trackByType('video')
    const durationMs = Math.max(1000, item.durationMs || 10000)
    main.clips = [{
      id: uid('video'),
      type: 'video',
      name: item.name || '拼接成片',
      sourceUrl: item.url,
      startMs: 0,
      durationMs,
      trimInMs: 0,
      trimOutMs: durationMs,
      trackId: main.id,
      opacity: 1,
      volume: 1,
      playbackRate: 1,
    }]
    project.value.currentTimeMs = 0
    selectedIds.value = [main.clips[0].id]
    persistSoon()
    void syncCanvas()
    toast.success('已导入拼接成片')
  }

  function moveClip(clipId: string, startMs: number, trackId?: string, opts?: { recordHistory?: boolean; sync?: boolean }) {
    const found = findClip(clipId)
    if (!found) return
    if (opts?.recordHistory !== false) pushHistory()
    const nextStart = snapMs(startMs)
    if (trackId && trackId !== found.track.id) {
      const target = project.value.tracks.find(t => t.id === trackId)
      if (!target) return
      found.track.clips.splice(found.index, 1)
      found.clip.trackId = target.id
      found.clip.startMs = nextStart
      target.clips.push(found.clip)
      target.clips.sort((a, b) => a.startMs - b.startMs)
    } else {
      found.clip.startMs = nextStart
      found.track.clips.sort((a, b) => a.startMs - b.startMs)
    }
    persistSoon()
    if (opts?.sync !== false) void syncCanvas()
  }

  function updateSelectedClip(patch: Partial<TimelineClip>) {
    const clip = selectedClip.value
    if (!clip) return
    pushHistory()
    Object.assign(clip, patch)
    if (patch.durationMs != null) {
      clip.durationMs = Math.max(200, patch.durationMs)
      clip.trimOutMs = clip.trimInMs + clip.durationMs
    }
    if (patch.transitionDurationMs != null && clip.type === 'transition') {
      clip.durationMs = Math.max(100, patch.transitionDurationMs)
    }
    persistSoon()
    syncCanvasSoon()
  }

  function deleteSelected() {
    if (!selectedIds.value.length) return
    pushHistory()
    const ids = new Set(selectedIds.value)
    for (const track of project.value.tracks) {
      track.clips = track.clips.filter(c => !ids.has(c.id))
    }
    selectedIds.value = []
    persistSoon()
    void syncCanvas()
  }

  function splitAtPlayhead() {
    const t = project.value.currentTimeMs
    const targets = selectedIds.value.length
      ? selectedIds.value
      : project.value.tracks.flatMap(tr => tr.clips.filter(c => t > c.startMs + 50 && t < c.startMs + c.durationMs - 50).map(c => c.id))
    if (!targets.length) {
      toast.message('请将播放头置于片段中间，或先选中片段')
      return
    }
    pushHistory()
    const created: string[] = []
    for (const id of targets) {
      const found = findClip(id)
      if (!found) continue
      const { track, clip, index } = found
      if (t <= clip.startMs + 50 || t >= clip.startMs + clip.durationMs - 50) continue
      const leftDur = t - clip.startMs
      const rightDur = clip.durationMs - leftDur
      const right: TimelineClip = {
        ...clip,
        id: uid(clip.type),
        startMs: t,
        durationMs: rightDur,
        trimInMs: clip.trimInMs + leftDur,
        trimOutMs: clip.trimOutMs,
      }
      clip.durationMs = leftDur
      clip.trimOutMs = clip.trimInMs + leftDur
      track.clips.splice(index + 1, 0, right)
      created.push(right.id)
    }
    if (created.length) selectedIds.value = created
    persistSoon()
    void syncCanvas()
  }

  function addFadeTransitionBetweenSelected() {
    const clip = selectedClip.value
    if (!clip || (clip.type !== 'video' && clip.type !== 'image')) {
      toast.message('请先选中一段视频/图片')
      return
    }
    const track = project.value.tracks.find(t => t.id === clip.trackId)
    if (!track) return
    const sorted = [...track.clips].filter(c => c.type === 'video' || c.type === 'image').sort((a, b) => a.startMs - b.startMs)
    const idx = sorted.findIndex(c => c.id === clip.id)
    const next = sorted[idx + 1]
    if (!next) {
      toast.message('后面没有可衔接的片段')
      return
    }
    pushHistory()
    const dur = Math.min(500, Math.floor(Math.min(clip.durationMs, next.durationMs) / 3))
    next.startMs = Math.max(0, clip.startMs + clip.durationMs - dur)
    clip.fadeOutMs = dur
    next.fadeInMs = dur
    track.clips.sort((a, b) => a.startMs - b.startMs)
    persistSoon()
    void syncCanvas()
    toast.success(`已添加 ${dur}ms 淡入淡出转场`)
  }

  function setCurrentTime(ms: number, preview = true) {
    project.value.currentTimeMs = Math.max(0, Math.min(totalDurationMs.value, ms))
    if (preview && avCanvas && !playing.value) {
      void avCanvas.previewFrame(msToUs(project.value.currentTimeMs))
    }
  }

  async function ensureCanvas() {
    if (!canvasHost.value) return null
    if (avCanvas) return avCanvas
    const { AVCanvas } = await import('@webav/av-canvas')
    avCanvas = new AVCanvas(canvasHost.value, {
      bgColor: '#0b0f14',
      width: project.value.width,
      height: project.value.height,
    })
    avCanvas.on('timeupdate', (us) => {
      if (!playing.value) return
      project.value.currentTimeMs = Math.round(us / 1000)
    })
    avCanvas.on('paused', () => {
      playing.value = false
    })
    previewReady.value = true
    return avCanvas
  }

  async function clearSprites() {
    if (!avCanvas) return
    for (const spr of spriteMap.values()) {
      try { avCanvas.removeSprite(spr) } catch { /* ignore */ }
    }
    spriteMap.clear()
  }

  async function buildSpriteForClip(clip: TimelineClip, zBase: number): Promise<VisibleSprite | null> {
    const { VisibleSprite, MP4Clip, ImgClip, AudioClip, renderTxt2ImgBitmap } = await import('@webav/av-cliper')
    let spr: VisibleSprite | null = null

    if (clip.type === 'subtitle') {
      const bmp = await renderTxt2ImgBitmap(
        clip.text || clip.name || '字幕',
        `font-size:${clip.fontSize || 48}px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.85);padding:12px 20px;`,
      )
      spr = new VisibleSprite(new ImgClip(bmp))
      await spr.ready
      const rw = project.value.width
      const rh = Math.min(220, project.value.height * 0.18)
      spr.rect.x = Math.round((rw - (spr.rect.w || rw * 0.8)) / 2)
      spr.rect.y = project.value.height - rh - 80
      if (spr.rect.w > rw * 0.9) {
        const scale = (rw * 0.9) / spr.rect.w
        spr.rect.w *= scale
        spr.rect.h *= scale
        spr.rect.x = Math.round((rw - spr.rect.w) / 2)
      }
    } else if (clip.type === 'audio') {
      if (!clip.sourceUrl) return null
      const stream = await fetchStream(clip.sourceUrl)
      const audioClip = new AudioClip(stream, { volume: clip.volume ?? 1 })
      spr = new VisibleSprite(audioClip)
      await spr.ready
    } else if (clip.type === 'image') {
      if (!clip.sourceUrl) return null
      const stream = await fetchStream(clip.sourceUrl)
      spr = new VisibleSprite(new ImgClip(stream))
      await spr.ready
      fitSpriteCover(spr, project.value.width, project.value.height)
    } else if (clip.type === 'video') {
      if (!clip.sourceUrl) return null
      const stream = await fetchStream(clip.sourceUrl)
      const mp4 = new MP4Clip(stream, {
        audio: { volume: clip.volume ?? 1 },
      })
      spr = new VisibleSprite(mp4)
      await spr.ready
      fitSpriteCover(spr, project.value.width, project.value.height)
    } else {
      return null
    }

    const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
    spr.time = {
      offset: msToUs(clip.startMs),
      duration: msToUs(clip.durationMs / rate),
      playbackRate: rate,
    }
    spr.opacity = clip.opacity ?? 1
    spr.zIndex = zBase

    const fadeIn = clip.fadeInMs || 0
    const fadeOut = clip.fadeOutMs || 0
    if (fadeIn > 0 || fadeOut > 0) {
      const totalUs = msToUs(clip.durationMs / rate)
      const inPct = fadeIn > 0 ? `${Math.min(40, (fadeIn / clip.durationMs) * 100)}%` : '0%'
      const outPct = fadeOut > 0 ? `${Math.max(60, 100 - (fadeOut / clip.durationMs) * 100)}%` : '100%'
      const frames: Record<string, { opacity: number }> = {
        '0%': { opacity: fadeIn > 0 ? 0 : (clip.opacity ?? 1) },
      }
      if (fadeIn > 0) frames[inPct] = { opacity: clip.opacity ?? 1 }
      if (fadeOut > 0) frames[outPct] = { opacity: clip.opacity ?? 1 }
      frames['100%'] = { opacity: fadeOut > 0 ? 0 : (clip.opacity ?? 1) }
      spr.setAnimation(frames as any, { duration: totalUs, iterCount: 1 })
    }

    return spr
  }

  async function syncCanvas() {
    const token = ++syncToken
    syncing.value = true
    try {
      const canvas = await ensureCanvas()
      if (!canvas || token !== syncToken) return
      await clearSprites()
      let z = 1
      for (const track of project.value.tracks) {
        for (const clip of [...track.clips].sort((a, b) => a.startMs - b.startMs)) {
          if (token !== syncToken) return
          try {
            const spr = await buildSpriteForClip(clip, z++)
            if (!spr || token !== syncToken) continue
            await canvas.addSprite(spr)
            spriteMap.set(clip.id, spr)
          } catch (err) {
            console.warn('[timeline] sprite failed', clip.name, err)
          }
        }
      }
      if (!playing.value) {
        await canvas.previewFrame(msToUs(project.value.currentTimeMs))
      }
    } finally {
      if (token === syncToken) syncing.value = false
    }
  }

  async function play() {
    const canvas = await ensureCanvas()
    if (!canvas) return
    playing.value = true
    canvas.play({
      start: msToUs(project.value.currentTimeMs),
      end: msToUs(totalDurationMs.value),
    })
  }

  function pause() {
    avCanvas?.pause()
    playing.value = false
  }

  function togglePlay() {
    if (playing.value) pause()
    else void play()
  }

  async function exportMp4() {
    if (exporting.value) return
    if (!projectTotalDurationMs(project.value)) {
      toast.error('时间线为空')
      return
    }
    exporting.value = true
    exportProgress.value = 0
    try {
      pause()
      await syncCanvas()
      const canvas = await ensureCanvas()
      if (!canvas) throw new Error('预览画布未就绪')
      const combinator = await canvas.createCombinator({ bitrate: 5_000_000 })
      combinator.on('OutputProgress', (p) => {
        exportProgress.value = Math.round(p * 100)
      })
      const stream = combinator.output()
      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }
      const blob = new Blob(chunks, { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ep = opts.episodeNumber?.value ?? opts.episodeId.value
      a.download = `episode-${ep}-timeline.mp4`
      a.click()
      URL.revokeObjectURL(url)
      saveTimelineProject(project.value)
      toast.success('导出完成')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  function exportProjectJson() {
    saveTimelineProject(project.value)
    downloadTimelineProjectJson(project.value)
    toast.success('工程已导出')
  }

  async function importProjectJson(file: File) {
    try {
      const parsed = await parseTimelineProjectFile(file)
      pushHistory()
      project.value = {
        ...parsed,
        episodeId: opts.episodeId.value,
        width: parsed.width || width,
        height: parsed.height || height,
      }
      selectedIds.value = []
      persistSoon()
      await syncCanvas()
      toast.success('工程已导入')
    } catch (err: any) {
      toast.error(err?.message || '导入失败')
    }
  }

  function bindCanvasHost(el: HTMLElement | null) {
    if (canvasHost.value === el) return
    destroyCanvas()
    canvasHost.value = el
    if (el) void syncCanvas()
  }

  function destroyCanvas() {
    pause()
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }
    void clearSprites()
    try { avCanvas?.destroy() } catch { /* ignore */ }
    avCanvas = null
    previewReady.value = false
  }

  function addSubtitleAtPlayhead(text = '字幕') {
    pushHistory()
    const track = trackByType('subtitle')
    const clip: TimelineClip = {
      id: uid('subtitle'),
      type: 'subtitle',
      name: text.slice(0, 12),
      text,
      fontSize: 48,
      startMs: snapMs(project.value.currentTimeMs),
      durationMs: 2000,
      trimInMs: 0,
      trimOutMs: 2000,
      trackId: track.id,
      opacity: 1,
    }
    track.clips.push(clip)
    selectedIds.value = [clip.id]
    persistSoon()
    void syncCanvas()
  }

  watch(() => opts.episodeId.value, (id) => {
    if (!id) return
    loadOrReset()
  })

  return {
    project,
    selectedIds,
    selectedClip,
    playing,
    exporting,
    exportProgress,
    syncing,
    previewReady,
    totalDurationMs,
    canUndo,
    canRedo,
    formatTimecode,
    loadOrReset,
    resetProject,
    selectClip,
    addMediaToTrack,
    layOutComposedUnits,
    importMergedVideo,
    moveClip,
    updateSelectedClip,
    deleteSelected,
    splitAtPlayhead,
    addFadeTransitionBetweenSelected,
    addSubtitleAtPlayhead,
    setCurrentTime,
    play,
    pause,
    togglePlay,
    exportMp4,
    exportProjectJson,
    importProjectJson,
    undo,
    redo,
    bindCanvasHost,
    destroyCanvas,
    syncCanvas,
    syncCanvasSoon,
    persistSoon,
    createEmptyTracks,
  }
}
