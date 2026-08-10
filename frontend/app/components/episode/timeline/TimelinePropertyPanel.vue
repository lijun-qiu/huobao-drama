<template>
  <aside class="tl-props card">
    <div class="tl-props-title">属性</div>
    <template v-if="clip">
      <div class="tl-prop-row">
        <span class="dim">名称</span>
        <input class="input" :value="clip.name" @change="emitPatch('name', ($event.target as HTMLInputElement).value)" />
      </div>
      <div class="tl-prop-row">
        <span class="dim">时长(ms)</span>
        <input class="input" type="number" min="200" :value="clip.durationMs" @change="emitPatch('durationMs', Number(($event.target as HTMLInputElement).value))" />
      </div>
      <div class="tl-prop-row">
        <span class="dim">不透明度</span>
        <input class="input" type="number" min="0" max="1" step="0.05" :value="clip.opacity ?? 1" @change="emitPatch('opacity', Number(($event.target as HTMLInputElement).value))" />
      </div>
      <div class="tl-prop-row">
        <span class="dim">音量</span>
        <input class="input" type="number" min="0" max="2" step="0.05" :value="clip.volume ?? 1" @change="emitPatch('volume', Number(($event.target as HTMLInputElement).value))" />
      </div>
      <div class="tl-prop-row">
        <span class="dim">倍速</span>
        <input class="input" type="number" min="0.25" max="4" step="0.05" :value="clip.playbackRate ?? 1" @change="emitPatch('playbackRate', Number(($event.target as HTMLInputElement).value))" />
      </div>
      <div class="tl-prop-row">
        <span class="dim">淡入(ms)</span>
        <input class="input" type="number" min="0" :value="clip.fadeInMs || 0" @change="emitPatch('fadeInMs', Number(($event.target as HTMLInputElement).value))" />
      </div>
      <div class="tl-prop-row">
        <span class="dim">淡出(ms)</span>
        <input class="input" type="number" min="0" :value="clip.fadeOutMs || 0" @change="emitPatch('fadeOutMs', Number(($event.target as HTMLInputElement).value))" />
      </div>
      <template v-if="clip.type === 'subtitle'">
        <div class="tl-prop-row">
          <span class="dim">字幕</span>
          <textarea class="input" rows="3" :value="clip.text || ''" @change="emitPatch('text', ($event.target as HTMLTextAreaElement).value)" />
        </div>
        <div class="tl-prop-row">
          <span class="dim">字号</span>
          <input class="input" type="number" min="16" max="120" :value="clip.fontSize || 48" @change="emitPatch('fontSize', Number(($event.target as HTMLInputElement).value))" />
        </div>
      </template>
    </template>
    <div v-else class="dim" style="font-size:12px;line-height:1.5">选中时间轴上的片段以编辑属性。</div>
  </aside>
</template>

<script setup lang="ts">
import type { TimelineClip } from '~/composables/timeline-types'

defineProps<{ clip: TimelineClip | null }>()
const emit = defineEmits<{ update: [patch: Partial<TimelineClip>] }>()

function emitPatch<K extends keyof TimelineClip>(key: K, value: TimelineClip[K]) {
  emit('update', { [key]: value } as Partial<TimelineClip>)
}
</script>

<style scoped>
.tl-props {
  padding: 10px 12px;
  overflow: auto;
  background: var(--bg-1, #fff);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.tl-props-title {
  font-weight: 650;
  margin-bottom: 10px;
}
.tl-prop-row {
  display: grid;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 12px;
}
</style>
