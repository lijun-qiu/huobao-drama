<template>
  <div class="tl-editor">
    <div class="tl-toolbar">
      <div class="tl-toolbar-left">
        <div class="step-indicator">
          <span class="step-num">04</span>
          <span class="step-name">剪辑台</span>
        </div>
        <span class="tag dim">{{ formatTimecode(project.currentTimeMs) }} / {{ formatTimecode(totalDurationMs) }}</span>
        <span v-if="syncing" class="tag">同步预览…</span>
        <span v-if="exporting" class="tag">导出 {{ exportProgress }}%</span>
      </div>
      <div class="tl-toolbar-right">
        <button class="btn btn-sm" type="button" :disabled="!canUndo" @click="undo">撤销</button>
        <button class="btn btn-sm" type="button" :disabled="!canRedo" @click="redo">重做</button>
        <button class="btn btn-sm" type="button" @click="splitAtPlayhead">分割</button>
        <button class="btn btn-sm" type="button" :disabled="!selectedIds.length" @click="deleteSelected">删除</button>
        <button class="btn btn-sm" type="button" @click="addFadeTransitionBetweenSelected">淡入淡出</button>
        <button class="btn btn-sm" type="button" @click="addSubtitleAtPlayhead()">加字幕</button>
        <label class="btn btn-sm tl-check">
          <input v-model="project.snapEnabled" type="checkbox" />
          吸附
        </label>
        <button class="btn btn-sm" type="button" @click="resetProject">重置</button>
        <button class="btn btn-sm" type="button" @click="exportProjectJson">导出工程</button>
        <label class="btn btn-sm">
          导入工程
          <input type="file" accept="application/json,.json" hidden @change="onImportProject" />
        </label>
        <button class="btn btn-primary btn-sm" type="button" :disabled="exporting" @click="exportMp4">
          {{ exporting ? `导出中 ${exportProgress}%` : '导出视频' }}
        </button>
      </div>
    </div>

    <div class="tl-main">
      <TimelineMediaLibrary
        :items="mediaItems"
        @add="addMediaToTrack"
        @layout="layOutComposedUnits(mediaItems)"
        @import-merged="importMergedVideo(mergedItem)"
      />
      <TimelinePreview
        :playing="playing"
        :current-time-ms="project.currentTimeMs"
        :total-duration-ms="totalDurationMs"
        :width="project.width"
        :height="project.height"
        @toggle-play="togglePlay"
        @scrub="setCurrentTime"
        @bind-host="bindCanvasHost"
      />
      <TimelinePropertyPanel :clip="selectedClip" @update="updateSelectedClip" />
    </div>

    <TimelineTrackArea
      :tracks="project.tracks"
      :selected-ids="selectedIds"
      :current-time-ms="project.currentTimeMs"
      :total-duration-ms="totalDurationMs"
      :scale="project.scale"
      @select="selectClip($event)"
      @clip-down="onClipMouseDown"
      @drop-track="onDropTrack"
      @scrub="setCurrentTime"
      @update:scale="project.scale = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { TimelineClip, TimelineMediaItem } from '~/composables/timeline-types'
import { useTimelineEditor } from '~/composables/useTimelineEditor'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'
import {
  buildComposeUnitGroups,
  getComposeUnitTotalDurationSec,
  getNarrationShotOwnImage,
  getNarrationShotOwnTts,
  resolveComposedVideoUrlForShot,
  resolveNarrationEffectiveImage,
} from '~/composables/useEpisodeWorkflow'
import TimelineMediaLibrary from '~/components/episode/timeline/TimelineMediaLibrary.vue'
import TimelinePreview from '~/components/episode/timeline/TimelinePreview.vue'
import TimelinePropertyPanel from '~/components/episode/timeline/TimelinePropertyPanel.vue'
import TimelineTrackArea from '~/components/episode/timeline/TimelineTrackArea.vue'

const studio = useEpisodeStudioInject() as any
const episodeId = computed(() => Number(studio.epId?.value || studio.episode?.value?.id || 0))
const episodeNumber = computed(() => studio.episodeNumber?.value ?? studio.episode?.value?.episode_number ?? 0)

function mediaUrl(url?: string | null) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:')) return url
  return `/${String(url).replace(/^\//, '')}`
}

const mediaItems = computed<TimelineMediaItem[]>(() => {
  const items: TimelineMediaItem[] = []
  const sbs = studio.sbs?.value || []
  const units = studio.composeUnitShots?.value || []
  const groups = buildComposeUnitGroups(sbs)

  units.forEach((sb: any, i: number) => {
    const url = resolveComposedVideoUrlForShot(sb, sbs)
    if (!url) return
    const sec = getComposeUnitTotalDurationSec(sb, sbs, groups) || Number(sb.duration) || 3
    items.push({
      id: `composed-${sb.id}`,
      kind: 'video',
      name: `合成 U${String(i + 1).padStart(2, '0')}`,
      url: mediaUrl(url),
      durationMs: Math.max(500, Math.round(sec * 1000)),
      group: 'composed',
    })
  })

  if (studio.mergeUrl?.value) {
    items.push({
      id: 'merged-main',
      kind: 'video',
      name: '拼接成片',
      url: mediaUrl(studio.mergeUrl.value),
      durationMs: 60000,
      group: 'merged',
    })
  }
  if (studio.openingVideoUrl?.value) {
    items.push({
      id: 'opening',
      kind: 'video',
      name: '开幕视频',
      url: mediaUrl(studio.openingVideoUrl.value),
      durationMs: 5000,
      group: 'opening',
    })
  }
  if (studio.titleVideoUrl?.value) {
    items.push({
      id: 'title',
      kind: 'video',
      name: '片头视频',
      url: mediaUrl(studio.titleVideoUrl.value),
      durationMs: 5000,
      group: 'title',
    })
  }

  units.forEach((sb: any, i: number) => {
    const tts = getNarrationShotOwnTts(sb) || sb.tts_audio_url || sb.ttsAudioUrl
    if (!tts) return
    items.push({
      id: `tts-${sb.id}`,
      kind: 'audio',
      name: `旁白 U${String(i + 1).padStart(2, '0')}`,
      url: mediaUrl(tts),
      durationMs: Math.max(500, Math.round((Number(sb.duration) || 3) * 1000)),
      group: 'tts',
    })
  })

  units.forEach((sb: any, i: number) => {
    const resolved = resolveNarrationEffectiveImage(sbs, sb)
    const img = getNarrationShotOwnImage(sb) || resolved?.path || sb.composed_image || sb.composedImage
    if (!img) return
    items.push({
      id: `img-${sb.id}`,
      kind: 'image',
      name: `配图 U${String(i + 1).padStart(2, '0')}`,
      url: mediaUrl(img),
      durationMs: 3000,
      group: 'image',
      thumbUrl: mediaUrl(img),
    })
  })

  return items
})

const mergedItem = computed(() => mediaItems.value.find(i => i.group === 'merged') || null)

const editor = useTimelineEditor({
  episodeId: episodeId as any,
  episodeNumber: episodeNumber as any,
  mediaItems,
})

const {
  project,
  selectedIds,
  selectedClip,
  playing,
  exporting,
  exportProgress,
  syncing,
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
  togglePlay,
  exportMp4,
  exportProjectJson,
  importProjectJson,
  undo,
  redo,
  bindCanvasHost,
  destroyCanvas,
  syncCanvas,
} = editor

function onDropTrack(e: DragEvent, trackId: string) {
  const id = e.dataTransfer?.getData('text/timeline-media')
  if (!id) return
  const item = mediaItems.value.find(m => m.id === id)
  if (!item) return
  const lane = (e.currentTarget as HTMLElement).querySelector('.tl-track-lane') as HTMLElement
  const rect = lane?.getBoundingClientRect()
  const x = rect ? e.clientX - rect.left : 0
  const atMs = (x / (project.value.scale || 48)) * 1000
  addMediaToTrack(item, trackId, atMs)
}

let dragClipId = ''
let dragStartX = 0
let dragOriginStart = 0

function onClipMouseDown(e: MouseEvent, clip: TimelineClip) {
  selectClip(clip.id, e.shiftKey)
  dragClipId = clip.id
  dragStartX = e.clientX
  dragOriginStart = clip.startMs
  let moved = false
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - dragStartX
    const dMs = (dx / (project.value.scale || 48)) * 1000
    moveClip(dragClipId, Math.max(0, dragOriginStart + dMs), undefined, { recordHistory: !moved, sync: false })
    moved = true
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (moved) void syncCanvas()
    dragClipId = ''
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onImportProject(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void importProjectJson(file)
  input.value = ''
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    deleteSelected()
  } else if (e.key === ' ') {
    e.preventDefault()
    togglePlay()
  } else if (e.key === 's' && !e.ctrlKey) {
    splitAtPlayhead()
  }
}

onMounted(() => {
  loadOrReset()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  destroyCanvas()
})
</script>

<style scoped>
.tl-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  padding: 8px 0 12px;
}
.tl-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.tl-toolbar-left,
.tl-toolbar-right {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.tl-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tl-main {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(280px, 1fr) minmax(200px, 240px);
  gap: 10px;
  min-height: 320px;
}
@media (max-width: 1100px) {
  .tl-main {
    grid-template-columns: 1fr;
  }
}
</style>
