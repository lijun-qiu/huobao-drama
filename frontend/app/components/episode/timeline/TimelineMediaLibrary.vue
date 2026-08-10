<template>
  <aside class="tl-library card">
    <div class="tl-lib-head">
      <strong>素材库</strong>
      <div class="tl-lib-actions">
        <button class="btn btn-sm btn-primary" type="button" @click="$emit('layout')">一键铺轨</button>
        <button class="btn btn-sm" type="button" @click="$emit('import-merged')">导入成片</button>
      </div>
    </div>
    <div class="tl-lib-hint dim">合成镜头已烧录旁白；单独导入 TTS 会叠音，请慎用。</div>
    <div class="tl-lib-list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="tl-lib-item"
        draggable="true"
        @click="$emit('add', item)"
        @dragstart="onDragStart($event, item)"
      >
        <span class="tl-lib-kind">{{ kindLabel(item.kind) }}</span>
        <span class="tl-lib-name truncate">{{ item.name }}</span>
        <span v-if="item.durationMs" class="tl-lib-dur dim">{{ formatTimecode(item.durationMs) }}</span>
      </button>
      <div v-if="!items.length" class="dim" style="padding:12px;font-size:12px">
        暂无素材。请先完成镜头合成或拼接导出。
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { TimelineMediaItem } from '~/composables/timeline-types'
import { formatTimecode } from '~/composables/timeline-types'

defineProps<{ items: TimelineMediaItem[] }>()
defineEmits<{
  add: [item: TimelineMediaItem]
  layout: []
  'import-merged': []
}>()

function kindLabel(kind: string) {
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  if (kind === 'image') return '图片'
  return kind
}

function onDragStart(e: DragEvent, item: TimelineMediaItem) {
  e.dataTransfer?.setData('text/timeline-media', item.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}
</script>

<style scoped>
.tl-library {
  background: var(--bg-1, #fff);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.tl-lib-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.tl-lib-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tl-lib-hint {
  padding: 0 12px 8px;
  font-size: 11px;
  line-height: 1.4;
}
.tl-lib-list {
  max-height: 360px;
  overflow: auto;
  padding: 6px;
}
.tl-lib-item {
  width: 100%;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 6px;
  align-items: center;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.tl-lib-item:hover {
  background: rgba(59, 130, 246, 0.08);
}
.tl-lib-kind { font-size: 10px; color: var(--text-2); }
.tl-lib-name { font-size: 12px; }
.tl-lib-dur { font-size: 10px; }
</style>
