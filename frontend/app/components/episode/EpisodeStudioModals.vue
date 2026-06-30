<template>
<div v-if="shotEditor.open && shotEditor.sb" class="overlay shot-editor-overlay" @click.self="closeShotEditor">
        <div class="card shot-editor-dialog" @click.stop>
          <div class="shot-editor-head">
            <div>
              <div class="shot-editor-title">编辑镜头 #{{ shotEditor.number }}</div>
              <div class="shot-editor-sub">
                <span v-if="shotEditor.isTitle" class="tag tag-title">片头 · 剧中红字</span>
                <span v-else class="tag">旁白镜头</span>
                <span class="dim" style="font-size:11px;margin-left:6px">{{ shotEditor.shotType || '未设景别' }} · {{ shotEditor.duration }}s</span>
              </div>
            </div>
            <button class="btn btn-ghost btn-icon" @click="closeShotEditor">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="shot-editor-body">
            <label class="field">
              <span class="field-label">{{ shotEditor.isTitle ? '剧中台词（合成红字）' : '旁白台词' }}</span>
              <textarea v-model="shotEditor.dialogue" class="textarea" rows="3" :placeholder="shotEditor.isTitle ? '剧中：今天体验的人生剧本是，' : '旁白：职高读到第二年六月，'" />
              <span class="dim" style="font-size:11px;margin-top:4px;display:block">
                {{ shotEditor.isTitle ? '片头改字后点「保存并重新制作」：将重新配音并合成全部片头镜。' : '改台词后需重新配音并重新合成该镜。' }}
              </span>
            </label>
            <label class="field">
              <span class="field-label">画面描述（列表展示用）</span>
              <textarea v-model="shotEditor.description" class="textarea" rows="2" placeholder="可选，默认与台词一致" />
            </label>
            <div class="field-grid field-grid-2">
              <label class="field">
                <span class="field-label">时长（秒）</span>
                <input v-model.number="shotEditor.duration" class="input" type="number" min="1" max="60" />
              </label>
              <label class="field">
                <span class="field-label">镜头标题</span>
                <input v-model="shotEditor.title" class="input" placeholder="可选" />
              </label>
            </div>
          </div>
          <div class="shot-editor-foot">
            <button class="btn" :disabled="shotEditor.busy" @click="closeShotEditor">取消</button>
            <button class="btn" :disabled="shotEditor.busy" @click="splitShotByPunctuation(shotEditor.sb)">按标点拆成多镜</button>
            <button class="btn" :disabled="shotEditor.busy" @click="saveShotEditor(false)">仅保存</button>
            <button class="btn btn-primary" :disabled="shotEditor.busy" @click="saveShotEditor(true)">
              <Loader2 v-if="shotEditor.busy" :size="12" class="animate-spin" />
              {{ shotEditor.busy ? '处理中…' : '保存并重新制作' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="composeVideoViewer.open && composeVideoViewer.src" class="overlay image-viewer-overlay" @click.self="closeComposeVideoViewer">
        <div class="card image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ composeVideoViewer.title || '合成预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="closeComposeVideoViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <video
              :key="composeVideoViewer.src"
              :src="composeVideoViewer.src"
              controls
              autoplay
              playsinline
              preload="auto"
              class="image-viewer-video"
            />
          </div>
        </div>
      </div>

      <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="closeImageViewer">
        <div class="card image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ imageViewer.title || '图片预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="closeImageViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <img :src="imageViewer.src" :alt="imageViewer.title || '图片预览'" class="image-viewer-img" />
          </div>
        </div>
      </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'

export default defineComponent({
  setup() {
    return useEpisodeStudioInject()
  },
})
</script>
