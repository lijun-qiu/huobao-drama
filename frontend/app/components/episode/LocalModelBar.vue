<template>
  <div v-if="usesLocalModelPipeline" ref="rootEl" class="model-dd">
    <button
      type="button"
      class="model-dd-trigger"
      :class="{ open: panelOpen, loading: localModelSwitching }"
      :title="localModelBarHint || currentTextFullLabel"
      @click="togglePanel"
    >
      <span v-if="localModelSwitching" class="lmb-spin" />
      <span class="model-dd-trigger-label">模型</span>
      <span class="model-dd-trigger-summary">{{ triggerSummary }}</span>
      <svg class="model-dd-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="panelOpen"
        class="model-dd-backdrop"
        @click="panelOpen = false"
      />
      <div
        v-if="panelOpen"
        class="model-dd-panel local-model-bar"
        :style="panelStyle"
        @click.stop
      >
        <div class="model-dd-panel-head">
          <strong>模型设置</strong>
          <button type="button" class="model-dd-close" title="关闭" @click="panelOpen = false">×</button>
        </div>

        <div class="lmb-row lmb-row-status">
          <div :class="['lmb-status-panel', localModelSwitching && 'is-loading']">
            <span v-if="localModelSwitching" class="lmb-spin" />
            <span class="lmb-status-text">{{ localModelBarStatusText }}</span>
          </div>
          <div class="lmb-group lmb-chips">
            <span
              v-if="localModelBarNeedsHardware && localModelBarStage === 'llm'"
              class="lmb-chip"
              title="Ollama 本地 LLM"
            >
              <span :class="['lmb-dot', localModelOnline.ollama ? 'ok' : 'bad']" />
              <span>Ollama</span>
            </span>
            <span
              v-else-if="localModelBarStage === 'llm'"
              class="lmb-chip"
              title="OpenRouter / DeepSeek / 智谱等云端文本"
            >
              <span class="lmb-dot ok" />
              <span>云端文本</span>
            </span>
            <span
              v-if="localModelBarNeedsHardware && (localModelBarStage === 'image' || localModelBarStage === 'video')"
              class="lmb-chip"
              title="ComfyUI 生图 / 生视频"
            >
              <span :class="['lmb-dot', localModelOnline.comfyui ? 'ok' : 'bad']" />
              <span>ComfyUI</span>
            </span>
            <span
              v-else-if="localModelBarStage === 'image' || localModelBarStage === 'video'"
              class="lmb-chip"
              title="智谱 / Agnes 等云端生图视频"
            >
              <span class="lmb-dot ok" />
              <span>云端生图/视频</span>
            </span>
            <span class="lmb-chip" :title="localTtsEngineLabel">
              <span :class="['lmb-dot', localModelBarTtsOnline ? 'ok' : 'bad']" />
              <span>TTS</span>
            </span>
          </div>
        </div>

        <div class="lmb-row lmb-deepseek-row">
          <span class="lmb-field-label">Nemotron 3 Ultra</span>
          <div class="prod-tabs lmb-channel-tabs">
            <button
              v-for="tab in freeTextTabs"
              :key="tab.value"
              type="button"
              class="prod-tab"
              :class="{ active: activeFreeChannel === tab.value }"
              :disabled="localModelSwitching"
              :title="tab.label"
              @click="onSelectTextModel(tab.value)"
            >
              {{ tab.short }}
            </button>
          </div>
        </div>

        <div class="lmb-row lmb-deepseek-row">
          <span class="lmb-field-label">DeepSeek V4 Flash</span>
          <div class="prod-tabs lmb-channel-tabs">
            <button
              v-for="tab in deepseekFlashTabs"
              :key="tab.value"
              type="button"
              class="prod-tab"
              :class="{ active: activeFlashChannel === tab.value }"
              :disabled="localModelSwitching"
              :title="tab.label"
              @click="onSelectTextModel(tab.value)"
            >
              {{ tab.short }}
            </button>
          </div>
        </div>

        <div class="lmb-row lmb-deepseek-row">
          <span class="lmb-field-label">DeepSeek V4 Pro</span>
          <div class="prod-tabs lmb-channel-tabs">
            <button
              v-for="tab in deepseekProTabs"
              :key="tab.value"
              type="button"
              class="prod-tab"
              :class="{ active: activeProChannel === tab.value }"
              :disabled="localModelSwitching"
              :title="tab.label"
              @click="onSelectTextModel(tab.value)"
            >
              {{ tab.short }}
            </button>
          </div>
        </div>

        <div class="lmb-row lmb-row-models">
          <div class="lmb-field lmb-field-text">
            <span class="lmb-field-label">全部文本</span>
            <BaseSelect
              class="lmb-field-select"
              :model-value="normalizedTextModel"
              :options="localLlmModelOptions"
              placeholder="选择文本模型"
              searchable
              :disabled="localModelSwitching"
              @update:model-value="onSelectTextModel"
            />
          </div>
          <div v-if="episodeTextModelSupportsThinking" class="text-thinking-toggle lmb-thinking">
            <span class="lmb-inline-label">思考</span>
            <div class="prod-tabs text-thinking-tabs">
              <button type="button" class="prod-tab" :class="{ active: episodeTextThinking }" @click="setEpisodeTextThinking(true)">开</button>
              <button type="button" class="prod-tab" :class="{ active: !episodeTextThinking }" @click="setEpisodeTextThinking(false)">关</button>
            </div>
          </div>
          <div class="lmb-field">
            <span class="lmb-field-label">生图</span>
            <BaseSelect
              class="lmb-field-select"
              :model-value="episodeImageModel"
              :options="imageModelOptions"
              placeholder="生图模型"
              searchable
              :disabled="localModelSwitching"
              @update:model-value="onEpisodeImageModelChange"
            />
          </div>
          <div class="lmb-field">
            <span class="lmb-field-label">生视频</span>
            <BaseSelect
              class="lmb-field-select"
              :model-value="localModelBarVideoModel"
              :options="headerVideoModelOptions"
              placeholder="视频模型"
              :disabled="localModelSwitching"
              @update:model-value="onLocalModelBarVideoChange"
            />
          </div>
          <div class="lmb-field">
            <span class="lmb-field-label">配音</span>
            <BaseSelect
              class="lmb-field-select"
              :model-value="localTtsEngine"
              :options="localTtsEngineOptions"
              placeholder="配音引擎"
              :disabled="localModelSwitching"
              @update:model-value="onLocalTtsEngineChange"
            />
          </div>
        </div>

        <div v-if="localModelBarNeedsHardware" class="lmb-row lmb-row-controls">
          <span class="lmb-inline-label">加载到显存</span>
          <BaseSelect
            class="lmb-select-stage"
            :model-value="localModelBarStage"
            :options="localModelBarStageOptions"
            placeholder="选择阶段"
            @update:model-value="onLocalModelBarStageChange"
          />
          <button type="button" class="lmb-btn primary" :disabled="localModelSwitching" @click="onLocalModelBarLoad">
            {{ localModelSwitching ? '加载中…' : '加载' }}
          </button>
          <button
            type="button"
            class="lmb-btn danger"
            :disabled="localModelSwitching || localModelStage === 'idle'"
            @click="unloadLocalModels"
          >
            卸载
          </button>
        </div>
        <div v-else class="lmb-row lmb-row-controls">
          <span class="lmb-inline-label">云端模式</span>
          <span class="lmb-hint">当前文本：{{ currentTextFullLabel }}</span>
        </div>

        <div v-if="localModelBarHint" class="lmb-hint-row">
          <span class="lmb-hint">{{ localModelBarHint }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'
import { normalizeTextModelId, textModelLabel } from '~/composables/useEpisodeWorkflow'

const FREE_TABS = [
  { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', short: 'OR 免费', label: 'Nemotron 3 Ultra · OpenRouter 免费' },
] as const

const FLASH_TABS = [
  { value: 'openrouter/deepseek-v4-flash', short: 'OR 付费', label: 'DeepSeek V4 Flash · OpenRouter 付费' },
  { value: 'deepseek-v4-flash', short: '官网', label: 'DeepSeek V4 Flash · 官网' },
] as const

const PRO_TABS = [
  { value: 'openrouter/deepseek-v4-pro', short: 'OR 付费', label: 'DeepSeek V4 Pro · OpenRouter 付费' },
  { value: 'deepseek-v4-pro', short: '官网', label: 'DeepSeek V4 Pro · 官网' },
] as const

const TRIGGER_SHORT: Record<string, string> = {
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron免费',
  'openrouter/deepseek-v4-flash:free': 'Nemotron免费',
  'openrouter/deepseek-v4-flash': 'OR付费',
  'deepseek-v4-flash': '官网Flash',
  'openrouter/deepseek-v4-pro': 'OR Pro',
  'deepseek-v4-pro': '官网Pro',
  'deepseek-v4-flash:free': 'Nemotron免费',
  'glm-4.7-flash': '智谱4.7',
  'glm-4-flash-250414': '智谱Flash',
}

function imageShortLabel(value: string, options: Array<{ label: string; value: string }>) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  const hit = options.find(o => o.value === raw)
  const label = String(hit?.label || raw)
  if (/agnes/i.test(label) || /agnes/i.test(raw)) return 'Agnes'
  const head = label.split(/[·|｜]/)[0].trim()
  return (head || label).slice(0, 12)
}

export default defineComponent({
  setup() {
    const studio = useEpisodeStudioInject()
    const panelOpen = ref(false)
    const rootEl = ref<HTMLElement | null>(null)
    const panelStyle = ref<Record<string, string>>({})

    const normalizedTextModel = computed(() => normalizeTextModelId(studio.episodeTextModel.value))
    const currentTextFullLabel = computed(() => textModelLabel(normalizedTextModel.value))

    const activeFreeChannel = computed(() => {
      const m = normalizedTextModel.value
      return FREE_TABS.some(t => t.value === m) ? m : ''
    })
    const activeFlashChannel = computed(() => {
      const m = normalizedTextModel.value
      return FLASH_TABS.some(t => t.value === m) ? m : ''
    })
    const activeProChannel = computed(() => {
      const m = normalizedTextModel.value
      return PRO_TABS.some(t => t.value === m) ? m : ''
    })

    const localModelBarTtsOnline = computed(() => {
      const engine = studio.localTtsEngine.value
      if (engine === 'indextts') return studio.localModelOnline.value.indextts
      if (engine === 'gptsovits') return studio.localModelOnline.value.gptsovits
      if (engine === 'voicebox') return studio.localModelOnline.value.voicebox
      return studio.localModelOnline.value.edgeTts
    })

    const triggerSummary = computed(() => {
      const m = normalizedTextModel.value
      const text = TRIGGER_SHORT[m]
        || textModelLabel(m).replace(/^DeepSeek\s+/i, '').replace(/^智谱\s*·\s*/i, '').slice(0, 14)
      const image = imageShortLabel(studio.episodeImageModel.value, studio.imageModelOptions.value || [])
      return `${text} · ${image}`
    })

    function onSelectTextModel(model: string) {
      const next = normalizeTextModelId(model)
      if (!next) return
      void studio.onEpisodeTextModelChange(next)
    }

    function placePanel() {
      const el = rootEl.value
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.min(720, Math.max(360, window.innerWidth - 24))
      let left = Math.min(rect.right - width, window.innerWidth - width - 12)
      left = Math.max(12, left)
      const top = Math.min(rect.bottom + 8, window.innerHeight - 160)
      panelStyle.value = {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        right: 'auto',
      }
    }

    async function togglePanel() {
      panelOpen.value = !panelOpen.value
      if (panelOpen.value) {
        await nextTick()
        placePanel()
      }
    }

    function onResize() {
      if (panelOpen.value) placePanel()
    }

    watch(panelOpen, (open) => {
      if (open) window.addEventListener('resize', onResize)
      else window.removeEventListener('resize', onResize)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', onResize)
    })

    return {
      ...studio,
      panelOpen,
      rootEl,
      panelStyle,
      localModelBarTtsOnline,
      triggerSummary,
      normalizedTextModel,
      currentTextFullLabel,
      deepseekFlashTabs: FLASH_TABS,
      deepseekProTabs: PRO_TABS,
      freeTextTabs: FREE_TABS,
      activeFreeChannel,
      activeFlashChannel,
      activeProChannel,
      onSelectTextModel,
      togglePanel,
    }
  },
})
</script>

<style scoped>
.lmb-deepseek-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding-bottom: 6px;
}
.lmb-channel-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.lmb-field-text {
  flex: 1 1 240px;
  min-width: min(100%, 220px);
}
.lmb-field-text .lmb-field-select {
  flex: 1 1 200px;
  min-width: 180px;
}
</style>
