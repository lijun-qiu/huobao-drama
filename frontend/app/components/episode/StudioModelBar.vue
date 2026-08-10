<template>
  <div ref="rootEl" class="model-dd">
    <button
      type="button"
      class="model-dd-trigger"
      :class="{ open: panelOpen }"
      :title="studioHeaderModelHint || triggerSummary"
      @click="togglePanel"
    >
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
        class="model-dd-panel studio-model-bar"
        :style="panelStyle"
        @click.stop
      >
        <div class="model-dd-panel-head">
          <strong>模型设置</strong>
          <button type="button" class="model-dd-close" title="关闭" @click="panelOpen = false">×</button>
        </div>

        <div class="smb-row smb-deepseek-row">
          <span class="smb-label">OpenRouter 免费</span>
          <div class="prod-tabs smb-channel-tabs">
            <button
              v-for="tab in freeTextTabs"
              :key="tab.value"
              type="button"
              class="prod-tab"
              :class="{ active: activeFreeChannel === tab.value }"
              :title="tab.label"
              @click="onSelectTextModel(tab.value)"
            >
              {{ tab.short }}
            </button>
          </div>
        </div>

        <div class="smb-row smb-deepseek-row">
          <span class="smb-label">DeepSeek V4 Flash</span>
          <div class="prod-tabs smb-channel-tabs">
            <button
              v-for="tab in deepseekFlashTabs"
              :key="tab.value"
              type="button"
              class="prod-tab"
              :class="{ active: activeFlashChannel === tab.value }"
              :title="tab.label"
              @click="onSelectTextModel(tab.value)"
            >
              {{ tab.short }}
            </button>
          </div>
        </div>

        <div class="smb-row smb-deepseek-row">
          <span class="smb-label">DeepSeek V4 Pro</span>
          <div class="prod-tabs smb-channel-tabs">
            <button
              v-for="tab in deepseekProTabs"
              :key="tab.value"
              type="button"
              class="prod-tab"
              :class="{ active: activeProChannel === tab.value }"
              :title="tab.label"
              @click="onSelectTextModel(tab.value)"
            >
              {{ tab.short }}
            </button>
          </div>
        </div>

        <div class="smb-row smb-row-models">
          <div class="smb-field smb-field-text">
            <span class="smb-label">全部文本</span>
            <BaseSelect
              class="smb-select"
              :model-value="normalizedTextModel"
              :options="cloudTextSelectOptions"
              placeholder="文本模型"
              searchable
              @update:model-value="onSelectTextModel"
            />
          </div>
          <div v-if="episodeTextModelSupportsThinking" class="text-thinking-toggle smb-thinking">
            <span class="smb-label">思考</span>
            <div class="prod-tabs text-thinking-tabs">
              <button type="button" class="prod-tab" :class="{ active: episodeTextThinking }" @click="setEpisodeTextThinking(true)">开</button>
              <button type="button" class="prod-tab" :class="{ active: !episodeTextThinking }" @click="setEpisodeTextThinking(false)">关</button>
            </div>
          </div>
          <div v-if="showReferPreviousEpisodeToggle" class="text-thinking-toggle smb-thinking">
            <span class="smb-label">参照上集</span>
            <div class="prod-tabs text-thinking-tabs">
              <button type="button" class="prod-tab" :class="{ active: referPreviousEpisode }" @click="setReferPreviousEpisode(true)">开</button>
              <button type="button" class="prod-tab" :class="{ active: !referPreviousEpisode }" @click="setReferPreviousEpisode(false)">关</button>
            </div>
          </div>
          <div class="smb-field">
            <span class="smb-label">生图</span>
            <BaseSelect
              class="smb-select"
              :model-value="episodeImageModel"
              :options="headerImageModelOptions"
              placeholder="配图模型"
              searchable
              @update:model-value="onEpisodeImageModelChange"
            />
          </div>
          <div class="smb-field">
            <span class="smb-label">生视频</span>
            <BaseSelect
              class="smb-select"
              :model-value="lockedVideoConfigId"
              :options="videoConfigSelectOptions"
              placeholder="视频服务"
              searchable
              @update:model-value="onEpisodeVideoConfigChange"
            />
          </div>
          <div class="smb-field">
            <span class="smb-label">配音</span>
            <BaseSelect
              class="smb-select"
              :model-value="lockedAudioConfigId"
              :options="audioConfigSelectOptions"
              placeholder="配音服务"
              searchable
              @update:model-value="onEpisodeAudioConfigChange"
            />
          </div>
        </div>
        <div class="smb-hint-row">
          <span class="smb-hint">当前文本：{{ currentTextFullLabel }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'
import {
  TEXT_MODEL_OPTIONS,
  normalizeTextModelId,
  textModelLabel,
} from '~/composables/useEpisodeWorkflow'

const FREE_TABS = [
  { value: 'poolside/laguna-s-2.1:free', short: 'Laguna', label: 'Laguna S 2.1 · OpenRouter 免费' },
  { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', short: 'Ultra', label: 'Nemotron 3 Ultra · OpenRouter 免费（备选）' },
  { value: 'nvidia/nemotron-3-super-120b-a12b:free', short: 'Super', label: 'Nemotron 3 Super · OpenRouter 免费（备选）' },
] as const

const FLASH_TABS = [
  { value: 'deepseek-v4-flash', short: '妙飞', label: 'DeepSeek V4 Flash · 妙飞（默认）' },
  { value: 'openrouter/deepseek-v4-flash', short: 'OR 付费', label: 'DeepSeek V4 Flash · OpenRouter 付费' },
] as const

const PRO_TABS = [
  { value: 'openrouter/deepseek-v4-pro', short: 'OR 付费', label: 'DeepSeek V4 Pro · OpenRouter 付费' },
  { value: 'deepseek-v4-pro', short: '官网', label: 'DeepSeek V4 Pro · 官网' },
] as const

const TRIGGER_SHORT: Record<string, string> = {
  'poolside/laguna-s-2.1:free': 'Laguna免费',
  'nvidia/nemotron-3-super-120b-a12b:free': 'Super免费',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Ultra高质量',
  'openrouter/deepseek-v4-flash:free': 'Laguna免费',
  'openrouter/deepseek-v4-flash': '妙速',
  'deepseek-v4-flash': '妙飞',
  'openrouter/deepseek-v4-pro': 'OR Pro',
  'deepseek-v4-pro': '官网Pro',
  'deepseek-v4-flash:free': 'Laguna免费',
}

function imageShortLabel(value: string | number | null | undefined, options: Array<{ label: string; value: any }>) {
  const raw = String(value ?? '').trim()
  if (!raw) return '—'
  const hit = options.find(o => String(o.value) === raw)
  const label = String(hit?.label || raw)
  const head = label.split(/[·|｜]/)[0].trim()
  if (/agnes/i.test(head) || /agnes/i.test(raw)) return 'Agnes'
  return (head || label).slice(0, 12)
}

export default defineComponent({
  setup() {
    const studio = useEpisodeStudioInject()
    const panelOpen = ref(false)
    const rootEl = ref<HTMLElement | null>(null)
    const panelStyle = ref<Record<string, string>>({})

    const normalizedTextModel = computed(() => normalizeTextModelId(studio.episodeTextModel.value))

    const cloudTextSelectOptions = computed(() =>
      TEXT_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })),
    )

    const currentTextFullLabel = computed(() => textModelLabel(normalizedTextModel.value))

    const activeFreeChannel = computed(() => {
      const m = normalizedTextModel.value
      return FREE_TABS.some(t => t.value === m) ? m : ''
    })

    const activeFlashChannel = computed(() => {
      const m = normalizedTextModel.value
      if (FLASH_TABS.some(t => t.value === m)) return m
      return ''
    })

    const activeProChannel = computed(() => {
      const m = normalizedTextModel.value
      if (PRO_TABS.some(t => t.value === m)) return m
      return ''
    })

    const triggerSummary = computed(() => {
      const m = normalizedTextModel.value
      const text = TRIGGER_SHORT[m]
        || textModelLabel(m).replace(/^DeepSeek\s+/i, '').replace(/^Nemotron\s+/i, 'Nemotron ').slice(0, 16)
      const image = imageShortLabel(studio.episodeImageModel.value, studio.headerImageModelOptions.value || [])
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
      triggerSummary,
      normalizedTextModel,
      cloudTextSelectOptions,
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
.smb-deepseek-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 0 2px 8px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  margin-bottom: 8px;
}
.smb-channel-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.smb-field-text {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: min(100%, 280px);
  flex: 1 1 240px;
}
.smb-field-text .smb-select {
  flex: 1 1 200px;
  min-width: 180px;
}
</style>
