<template>
  <section class="tl-preview-wrap card">
    <div class="tl-preview-bar">
      <button class="btn btn-sm btn-primary" type="button" @click="$emit('toggle-play')">
        {{ playing ? '暂停' : '播放' }}
      </button>
      <input
        class="tl-scrub"
        type="range"
        min="0"
        :max="totalDurationMs"
        :value="currentTimeMs"
        @input="onScrub"
      />
      <span class="dim" style="font-size:11px">{{ width }}×{{ height }}</span>
    </div>
    <div class="tl-canvas-stage">
      <div ref="hostRef" class="tl-canvas-host" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  playing: boolean
  currentTimeMs: number
  totalDurationMs: number
  width: number
  height: number
}>()

const emit = defineEmits<{
  'toggle-play': []
  scrub: [ms: number]
  'bind-host': [el: HTMLElement | null]
}>()

const hostRef = ref<HTMLElement | null>(null)

function onScrub(e: Event) {
  emit('scrub', Number((e.target as HTMLInputElement).value))
}

onMounted(() => emit('bind-host', hostRef.value))
watch(hostRef, (el) => emit('bind-host', el))
onBeforeUnmount(() => emit('bind-host', null))
</script>

<style scoped>
.tl-preview-wrap {
  background: var(--bg-1, #fff);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.tl-preview-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.tl-scrub { flex: 1; }
.tl-canvas-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  background: #0b0f14;
}
.tl-canvas-host {
  width: min(100%, 280px);
  aspect-ratio: 9 / 16;
  max-height: 420px;
  background: #000;
}
.tl-canvas-host :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain;
}
</style>
