<template>
  <div class="tl-tracks card">
    <div class="tl-ruler" @mousedown="onRulerDown">
      <div class="tl-ruler-inner" :style="{ width: timelineWidthPx + 'px' }">
        <span
          v-for="tick in rulerTicks"
          :key="tick.ms"
          class="tl-tick"
          :style="{ left: tick.left + 'px' }"
        >{{ tick.label }}</span>
        <div class="tl-playhead" :style="{ left: playheadX + 'px' }" />
      </div>
    </div>
    <div
      v-for="track in tracks"
      :key="track.id"
      class="tl-track"
      @dragover.prevent
      @drop="$emit('drop-track', $event, track.id)"
    >
      <div class="tl-track-label">{{ track.name }}</div>
      <div
        class="tl-track-lane"
        :style="{ width: timelineWidthPx + 'px' }"
        @mousedown.self="$emit('select', null)"
      >
        <div
          v-for="clip in track.clips"
          :key="clip.id"
          class="tl-clip"
          :class="[`type-${clip.type}`, selectedIds.includes(clip.id) && 'selected']"
          :style="clipStyle(clip)"
          @mousedown.stop="$emit('clip-down', $event, clip)"
        >
          <span class="tl-clip-name truncate">{{ clip.name }}</span>
        </div>
        <div class="tl-playhead" :style="{ left: playheadX + 'px' }" />
      </div>
    </div>
    <div class="tl-zoom">
      <span class="dim">缩放</span>
      <input :value="scale" type="range" min="16" max="160" step="4" @input="onScale" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineClip, TimelineTrack } from '~/composables/timeline-types'
import { formatTimecode } from '~/composables/timeline-types'

const props = defineProps<{
  tracks: TimelineTrack[]
  selectedIds: string[]
  currentTimeMs: number
  totalDurationMs: number
  scale: number
}>()

const emit = defineEmits<{
  select: [id: string | null]
  'clip-down': [e: MouseEvent, clip: TimelineClip]
  'drop-track': [e: DragEvent, trackId: string]
  scrub: [ms: number]
  'update:scale': [scale: number]
}>()

const timelineWidthPx = computed(() => {
  const scale = props.scale || 48
  return Math.max(800, Math.ceil((props.totalDurationMs / 1000) * scale) + 200)
})

const playheadX = computed(() => (props.currentTimeMs / 1000) * (props.scale || 48))

const rulerTicks = computed(() => {
  const scale = props.scale || 48
  const total = props.totalDurationMs
  const step = scale < 30 ? 5000 : scale < 80 ? 2000 : 1000
  const ticks: { ms: number; left: number; label: string }[] = []
  for (let ms = 0; ms <= total + step; ms += step) {
    ticks.push({ ms, left: (ms / 1000) * scale, label: formatTimecode(ms) })
  }
  return ticks
})

function clipStyle(clip: TimelineClip) {
  const scale = props.scale || 48
  return {
    left: `${(clip.startMs / 1000) * scale}px`,
    width: `${Math.max(24, (clip.durationMs / 1000) * scale)}px`,
  }
}

function onRulerDown(e: MouseEvent) {
  const lane = (e.currentTarget as HTMLElement).querySelector('.tl-ruler-inner') as HTMLElement
  if (!lane) return
  const rect = lane.getBoundingClientRect()
  const x = e.clientX - rect.left + (e.currentTarget as HTMLElement).scrollLeft
  emit('scrub', (x / (props.scale || 48)) * 1000)
}

function onScale(e: Event) {
  emit('update:scale', Number((e.target as HTMLInputElement).value))
}
</script>

<style scoped>
.tl-tracks {
  padding: 8px 0 4px;
  overflow-x: auto;
  background: var(--bg-1, #fff);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.tl-ruler {
  position: relative;
  height: 28px;
  margin-left: 88px;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}
.tl-ruler-inner {
  position: relative;
  height: 100%;
}
.tl-tick {
  position: absolute;
  top: 4px;
  font-size: 10px;
  color: var(--text-2);
  transform: translateX(-50%);
  white-space: nowrap;
}
.tl-track {
  display: grid;
  grid-template-columns: 88px 1fr;
  min-height: 44px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.tl-track-label {
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  color: var(--text-2);
  background: rgba(0, 0, 0, 0.02);
}
.tl-track-lane {
  position: relative;
  height: 44px;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 47px,
    rgba(0, 0, 0, 0.03) 47px,
    rgba(0, 0, 0, 0.03) 48px
  );
}
.tl-clip {
  position: absolute;
  top: 6px;
  height: 32px;
  border-radius: 6px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  font-size: 11px;
  color: #fff;
  cursor: grab;
  user-select: none;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}
.tl-clip.selected {
  box-shadow: 0 0 0 2px #3b82f6, inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}
.tl-clip.type-video { background: linear-gradient(90deg, #2563eb, #1d4ed8); }
.tl-clip.type-image { background: linear-gradient(90deg, #7c3aed, #6d28d9); }
.tl-clip.type-audio { background: linear-gradient(90deg, #059669, #047857); }
.tl-clip.type-subtitle { background: linear-gradient(90deg, #d97706, #b45309); }
.tl-clip.type-transition { background: linear-gradient(90deg, #64748b, #475569); }
.tl-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ef4444;
  pointer-events: none;
  z-index: 5;
}
.tl-zoom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
}
</style>
