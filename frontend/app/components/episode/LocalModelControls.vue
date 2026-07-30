<template>
  <div v-if="isLocalComicMode && stage" class="local-model-controls">
    <span class="local-model-controls-label">
      {{ cloudStage ? '云端模型' : '本地模型' }} · {{ localModelStageLabel(stage) }}
      <span v-if="purpose" class="local-model-controls-purpose">（{{ purpose }}）</span>
    </span>
    <BaseSelect
      v-if="stage === 'audio'"
      class="local-model-controls-select"
      :model-value="localTtsEngine"
      :options="localTtsEngineOptions"
      placeholder="配音引擎"
      style="min-width:180px"
      @update:model-value="onLocalTtsEngineChange"
    />
    <BaseSelect
      v-if="stage === 'llm' && localLlmModelOptions.length > 1"
      class="local-model-controls-select"
      :model-value="episodeTextModel"
      :options="localLlmModelOptions"
      placeholder="选择 LLM"
      @update:model-value="onEpisodeTextModelChange"
    />
    <span v-if="localModelSwitching && localModelPrepareHint" class="local-model-prepare-hint">{{ localModelPrepareHint }}</span>
    <span
      v-for="chip in deps"
      :key="chip.key"
      :class="['local-model-chip', chip.ok ? 'is-ok' : 'is-off']"
      :title="chip.hint"
    >{{ chip.label }}</span>
    <div class="local-model-controls-actions">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="localModelSwitching"
        @click="runLocalModelStage(stage)"
      >
        {{ localModelSwitching ? '加载中…' : (cloudStage ? '确认就绪' : '运行模型') }}
      </button>
      <button
        v-if="showUnload && !cloudStage"
        type="button"
        class="btn btn-sm"
        :disabled="localModelSwitching || localModelStage === 'idle'"
        @click="unloadLocalModels()"
      >
        卸载模型
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, unref, type PropType } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'
import { localModelStageLabel, type LocalModelStage } from '~/composables/useEpisodeWorkflow'

export default defineComponent({
  props: {
    stage: {
      type: String as PropType<LocalModelStage>,
      required: true,
    },
    purpose: {
      type: String,
      default: '',
    },
    showUnload: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    const studio = useEpisodeStudioInject()

    const deps = computed(() => {
      const online = unref(studio.localModelOnline)
      const stage = props.stage
      if (stage === 'llm') {
        const model = String(unref(studio.episodeTextModel) || unref(studio.localModelStatus)?.ollama_model || '').trim()
        const hint = model
          ? `${props.purpose || '剧本 / 分镜 LLM'} · ${model}`
          : (props.purpose || '剧本 / 分镜 LLM')
        if (!unref(studio.localModelBarNeedsHardware) && stage === unref(studio.localModelBarStage)) {
          return [{ key: 'cloud', label: '云端文本', ok: true, hint }]
        }
        // 当前控件 stage 可能与 bar 不同：按模型判断
        const needsHw = model.includes(':') && !model.startsWith('glm-')
        if (!needsHw) return [{ key: 'cloud', label: '云端文本', ok: true, hint }]
        return [{ key: 'ollama', label: `Ollama ${online.ollama ? '在线' : '离线'}`, ok: online.ollama, hint }]
      }
      if (stage === 'image' || stage === 'video') {
        const imageModel = String(unref(studio.episodeImageModel) || '')
        const videoModel = String(unref(studio.localModelBarVideoModel) || '')
        const cloud = stage === 'image'
          ? /^(cogview|agnes-image)/i.test(imageModel)
          : /^(cogvideox|cogvideo)/i.test(videoModel) || !/^wan_/i.test(videoModel)
        if (cloud) {
          return [{ key: 'cloud', label: stage === 'video' ? '云端/轻量视频' : '云端生图', ok: true, hint: stage === 'video' ? '图生视频' : '生图' }]
        }
        return [{ key: 'comfyui', label: `ComfyUI ${online.comfyui ? '在线' : '离线'}`, ok: online.comfyui, hint: stage === 'video' ? '图生视频' : 'SDXL 生图' }]
      }
      if (stage === 'audio') {
        const engine = unref(studio.localTtsEngine)
        if (engine === 'indextts') {
          return [{ key: 'indextts', label: `IndexTTS2 ${online.indextts ? '在线' : '离线'}`, ok: online.indextts, hint: '情感克隆 · 复用 GPT-SoVITS 参考音' }]
        }
        if (engine === 'gptsovits') {
          return [{ key: 'gptsovits', label: `GPT-SoVITS ${online.gptsovits ? '在线' : '离线'}`, ok: online.gptsovits, hint: '克隆配音' }]
        }
        if (engine === 'voicebox') {
          return [{ key: 'voicebox', label: `Voicebox ${online.voicebox ? '在线' : '离线'}`, ok: online.voicebox, hint: 'Kokoro / 克隆配音' }]
        }
        return [{ key: 'edge', label: `Edge TTS ${online.edgeTts ? '可用' : '不可用'}`, ok: online.edgeTts, hint: '系统 TTS' }]
      }
      return []
    })

    const cloudStage = computed(() => {
      const stage = props.stage
      if (stage === 'audio') return false
      if (stage === 'llm') {
        const model = String(unref(studio.episodeTextModel) || '').trim()
        return !(model.includes(':') && !model.startsWith('glm-'))
      }
      if (stage === 'image') {
        return /^(cogview|agnes-image)/i.test(String(unref(studio.episodeImageModel) || ''))
      }
      if (stage === 'video') {
        const videoModel = String(unref(studio.localModelBarVideoModel) || '')
        return /^(cogvideox|cogvideo)/i.test(videoModel) || !/^wan_/i.test(videoModel)
      }
      return false
    })

    return {
      ...studio,
      deps,
      cloudStage,
      localModelStageLabel,
    }
  },
})
</script>
