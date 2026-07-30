<template>
<div v-if="narrationImageBreakdownModalOpen" class="overlay image-breakdown-overlay">
        <div class="card image-breakdown-dialog" @click.stop>
          <div class="image-breakdown-dialog-body">
            <Loader2
              v-if="narrationImageBreakdownModalProcessing"
              :size="40"
              class="animate-spin image-breakdown-spinner"
            />
            <div v-else-if="narrationImageBreakdownModalDone" class="image-breakdown-icon is-done">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div v-else-if="narrationImageBreakdownModalFailed" class="image-breakdown-icon is-fail">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div class="image-breakdown-dialog-title">{{ narrationImageBreakdownModalTitle }}</div>
            <div class="image-breakdown-dialog-desc">{{ narrationImageBreakdownModalSummary }}</div>
            <div
              v-if="narrationImageBreakdownModalProcessing || narrationImageBreakdownProgressPercent > 0"
              class="progress-wrap image-breakdown-progress"
            >
              <div class="progress-head">
                <span class="progress-label">{{ narrationImageBreakdownModalBatchLabel || '整体进度' }}</span>
                <span class="progress-val">{{ narrationImageBreakdownProgressPercent }}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: narrationImageBreakdownProgressPercent + '%' }"></div>
              </div>
            </div>
            <div v-if="narrationImageBreakdownModalProcessing" class="image-breakdown-hint dim">
              本地模型每批可能需数分钟，请勿关闭页面；可点「取消」中断当前任务。
            </div>
            <div class="image-breakdown-dialog-actions">
              <button
                v-if="narrationImageBreakdownModalProcessing"
                type="button"
                class="btn"
                @click="cancelNarrationImageBreakdown"
              >
                取消任务
              </button>
              <button
                v-else
                type="button"
                class="btn btn-primary"
                @click="closeNarrationImageBreakdownModal"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      </div>

<div v-if="narrationShotImageModalOpen" class="overlay image-breakdown-overlay">
        <div class="card image-breakdown-dialog" @click.stop>
          <div class="image-breakdown-dialog-body">
            <Loader2
              v-if="narrationShotImageModalProcessing"
              :size="40"
              class="animate-spin image-breakdown-spinner"
            />
            <div v-else-if="narrationShotImageModalDone" class="image-breakdown-icon is-done">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div v-else-if="narrationShotImageModalFailed" class="image-breakdown-icon is-fail">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div class="image-breakdown-dialog-title">{{ narrationShotImageModalTitle }}</div>
            <div class="image-breakdown-dialog-desc">{{ narrationShotImageModalSummary }}</div>
            <div
              v-if="narrationShotImageModalProcessing || narrationShotImageModalPercent > 0"
              class="progress-wrap image-breakdown-progress"
            >
              <div class="progress-head">
                <span class="progress-label">生图进度</span>
                <span class="progress-val">{{ narrationShotImageModalPercent }}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: narrationShotImageModalPercent + '%' }"></div>
              </div>
            </div>
            <div v-if="narrationShotImageModalProcessing" class="image-breakdown-hint dim">
              Qwen GGUF 冷启动可能约 1–2 分钟，热启动约 30 秒；完成后页面会自动挂上新图。
            </div>
            <div class="image-breakdown-dialog-actions">
              <button
                type="button"
                class="btn"
                :class="{ 'btn-primary': !narrationShotImageModalProcessing }"
                @click="closeNarrationShotImageProgressModal"
              >
                {{ narrationShotImageModalProcessing ? '后台继续' : '知道了' }}
              </button>
            </div>
          </div>
        </div>
      </div>

<div v-if="shotEditor.open && shotEditor.sb" class="overlay shot-editor-overlay" @click.self="closeShotEditor">
        <div class="card shot-editor-dialog" @click.stop>
          <div class="shot-editor-head">
            <div>
              <div class="shot-editor-title">编辑镜头 #{{ shotEditor.number }}</div>
              <div class="shot-editor-sub">
                <span v-if="shotEditor.isTitle" class="tag tag-title">片头 · 剧中红字</span>
                <span v-else class="tag">{{ isMotionComicMode ? '台词镜头' : '旁白镜头' }}</span>
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
              <textarea v-model="shotEditor.dialogue" class="textarea" rows="3" :placeholder="shotEditor.isTitle ? (isMotionComicMode ? '剧中：标题：…' : '剧中：今天体验的人生剧本是，') : '旁白：…'" />
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
        <button type="button" class="image-viewer-close" title="关闭" aria-label="关闭" @click="closeComposeVideoViewer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="card image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ composeVideoViewer.title || '合成预览' }}</div>
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
        <button type="button" class="image-viewer-close" title="关闭" aria-label="关闭" @click="closeImageViewer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="card image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ imageViewer.title || '图片预览' }}</div>
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
