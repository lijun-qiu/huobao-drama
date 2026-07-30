import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject, type InjectionKey } from 'vue'
import { toast } from 'vue-sonner'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, Music, FileText, FolderKanban, Clapperboard, Download, Film, Sparkles, Loader2,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, imageAPI, videoAPI, composeAPI, mergeAPI, gridAPI, aiConfigAPI, voicesAPI, musicAPI, uploadAPI, localModelAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'
import {
  parseProductionMode,
  buildSidebarSections,
  workflowProgress,
  workflowStepTotal,
  resolveScriptStep,
  resolveActiveSubStepKey,
  inferNarrationScriptStep,
  buildNarrationImagePrompt,
  buildNarrationImageGeneratePayload,
  imageModelSupportsReferenceImages,
  resolveSceneContentForShot,
  extractNarrationSentence,
  getNarrationShotDisplayText,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TEXT_MODEL,
  DEFAULT_NARRATION_SCRIPT_CHAT_MODEL,
  DEFAULT_LOCAL_TEXT_MODEL,
  resolveLocalScriptChatTextModel,
  resolveScriptChatTextThinking,
  DEFAULT_LOCAL_AGENT_MODEL,
  CLOUD_TEXT_MODELS,
  DEFAULT_TEXT_THINKING,
  textModelLabel,
  TEXT_MODEL_OPTIONS,
  LOCAL_TEXT_MODEL_OPTIONS,
  normalizeTextModelId,
  imageModelOptionsForMode,
  textModelOptionsForMode,
  resolveEpisodeTextModelForMode,
  resolveEpisodeImageModelForMode,
  resolveLocalEpisodeTextModel,
  resolveActiveLocalLlmModel,
  resolveLocalExtractModel,
  isLocalAgentToolModel,
  isLocalOllamaTextModel,
  isCloudImageModel,
  needsLocalImageHardware,
  needsLocalVideoHardware,
  resolveEpisodeTextModel,
  resolveNarrationEpisodeTextModel,
  resolveEpisodeTextThinking,
  textModelSupportsThinking,
  textModelSupportsVision,
  DEFAULT_LOCAL_VISION_MODEL,
  BGM_MODEL_OPTIONS,
  DEFAULT_BGM_MODEL,
  bgmModelLabel,
  imageModelUnitPrice,
  imageModelPriceLabel,
  resolveEpisodeImageModel,
  narrationShotNeedsOwnImage,
  resolveNarrationParagraphLayout,
  isNarrationTitleShot,
  getNarrationShotOwnImage,
  resolveNarrationEffectiveImage,
  isComposableStoryboard,
  isComposeScopeStoryboard,
  hasComposedStoryboard,
  resolveComposedVideoUrlForShot,
  getComposeUnitLeaders,
  getParagraphComposeMembers,
  buildComposeUnitGroups,
  getComposeUnitSubtitleLines,
  listNarrationTtsUnits,
  isNarrationTtsUnitLeader,
  formatComposeTimecode,
  formatComposeUnitDuration,
  getComposeUnitMergedTtsText,
  getComposeUnitTotalDurationSec,
  getComposeUnitShotRangeLabel,
  cleanVideoPromptText,
  buildVideoPromptFromParagraphAndImage,
  resolveNarrationImageAnchorShot,
  getComposedVideoUrl as getStoryboardComposedVideoUrl,
  collectComposeScopeStoryboardIds,
  getStoryboardCharacterIdsFromShot,
  narrationShotsNeedingImage,
  narrationImageDetectAnchorCount,
  narrationShotsPendingImage,
  buildNarrationParagraphBatchOptions,
  narrationShotsInParagraphBatch,
  narrationShotsMissingPromptInBatch,
  normalizeParagraphPromptBatchSize,
  getNarrationShotDisplayNo,
  formatNarrationShotDisplayList,
  formatNarrationPendingImageHint,
  narrationShotImageReady,
  narrationImagesReady,
  narrationTtsReady as narrationTtsAllReady,
  getNarrationShotOwnTts,
  hasNarrationShotOwnTts,
  resolveNarrationEffectiveTts,
  parseNarrationImageMeta,
  sortStoryboards,
  hasDuplicateStoryboardNumbers,
  hasEffectiveNarrationTts,
  formatCharacterDisplayName,
  formatCharacterRoleSubtitle,
  normalizeVariantLabel,
  variantNeedsYouthPortraitReference,
  getVariantAgeGroup,
  findYouthBaseCharacter,
  findPortraitReferenceCharacter,
  findDramaStyleAnchorCharacter,
  sortCharactersForPortraitGeneration,
  dramaStoryboardStep,
  dramaStoryboardStepForMode,
  dramaRawStepForMode,
  dramaRewriteStepForMode,
  dramaExtractStepForMode,
  dramaVoiceStepForMode,
  LOCAL_DRAMA_SCRIPT_CHAT_STEP,
  LOCAL_DRAMA_RAW_STEP,
  LOCAL_DRAMA_REWRITE_STEP,
  LOCAL_DRAMA_EXTRACT_STEP,
  LOCAL_DRAMA_VOICE_STEP,
  LOCAL_DRAMA_STORYBOARD_STEP,
  narrationScriptChatStep,
  narrationRawContentStep,
  narrationStoryboardStep,
  usesMotionComicStoryboardRules,
  usesLocalModelPipeline as usesLocalModelPipelineForMode,
  isNarrationLikeMode as isNarrationLikeModeForMode,
  isDialoguePortraitMode as isDialoguePortraitModeForMode,
  usesDialogueSpeakers as usesDialogueSpeakersForMode,
  DIALOGUE_PORTRAIT_EXPRESSIONS,
  DIALOGUE_PORTRAIT_EXPRESSION_LABELS,
  DIALOGUE_PORTRAIT_MAX_CHARS,
  getDialoguePortraitExpressions,
  dialoguePortraitExpressionSrc,
  dialoguePortraitExpressionsReady,
  parseCharacterReferenceImages,
  resolveLocalModelStageFromNav,
  localModelStageLabel,
  LOCAL_VIDEO_MODEL_OPTIONS,
  DEFAULT_LOCAL_VIDEO_MODEL,
  FLUX_PROMPT_EN_VERSION,
  repairFluxEnglishForPendingCheck,
  isFluxEnglishPromptInaccurate,
  type LocalModelStage,
} from '~/composables/useEpisodeWorkflow'
import { artStyleLabel, ART_STYLES, NARRATION_MINIMAL_STYLE, MOTION_COMIC_STYLE, MOTION_COMIC_DEFAULT_STYLE, NARRATION_IMAGE_STYLE_OPTIONS, resolveNarrationImageStyle, normalizeArtStyle } from '~/composables/useArtStyles'
import { buildFolderUploadSlots, isImageUploadFile, parseShotImageFilename } from '~/utils/shotImageFilename'
import { hasEmphasisMarkers, stripEmphasisMarkers } from '~/utils/subtitle-emphasis'
import { stampChatAssistantGeneratedAt, stampChatAssistantFailed, pickLlmGeneratedAt, resolveLlmTimestamp, isLlmCancelled, llmErrorMessage } from '~/utils/llm-timestamp'
import BaseSelect from '~/components/BaseSelect.vue'


export const EPISODE_STUDIO_KEY: InjectionKey<EpisodeStudioContext> = Symbol('episodeStudio')

export type EpisodeStudioContext = ReturnType<typeof useEpisodeStudio>

export function useEpisodeStudio() {
const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = computed(() => Number(route.params.episodeNumber))

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), sbs = ref([]), mergeData = ref(null)
const episodeDataLoading = ref(true)
const studioReady = computed(() => !!(drama.value && episode.value))

function findNarratorChar(list = chars.value) {
  const candidates = list.filter(c => c.name === '旁白'
    || /^(旁白|画外音|narrator)$/i.test(String(c.name || '').trim())
    || (c.role === '旁白' && /旁白|画外音|narrator/i.test(`${c.name || ''} ${c.role || ''}`)))
  if (!candidates.length) return undefined
  return candidates.find(c => c.voice_style || c.voiceStyle) || candidates[0]
}

const productionMode = computed(() => parseProductionMode(drama.value))
const isMotionComicMode = computed(() => productionMode.value === 'motion_comic')
const isNovelComicMode = computed(() => productionMode.value === 'novel_comic')
const isLocalComicMode = computed(() => productionMode.value === 'local_comic')
const isDialoguePortraitMode = computed(() => isDialoguePortraitModeForMode(productionMode.value))
const usesLocalModelPipeline = computed(() => usesLocalModelPipelineForMode(productionMode.value))
const isNarrationLikeMode = computed(() => isNarrationLikeModeForMode(productionMode.value))
const isDramaLikeMode = computed(() => productionMode.value === 'drama' || productionMode.value === 'local_comic')
const isNarrationMode = isNarrationLikeMode
const usesDialogueSpeakers = computed(() => usesDialogueSpeakersForMode(productionMode.value))
const usesComicStoryboardRules = computed(() => usesMotionComicStoryboardRules(productionMode.value))
const usesComicVisuals = computed(() => productionMode.value === 'motion_comic' || productionMode.value === 'novel_comic')
const isComicStoryboardMode = computed(() => isNarrationLikeMode.value)
const isComicCharPortraitMode = computed(() => isNarrationLikeMode.value)

const dramaRawStep = computed(() => dramaRawStepForMode(productionMode.value))
const dramaRewriteStep = computed(() => dramaRewriteStepForMode(productionMode.value))
const dramaExtractStep = computed(() => dramaExtractStepForMode(productionMode.value))
const dramaVoiceStep = computed(() => dramaVoiceStepForMode(productionMode.value))

const localModelStatus = ref(null)
const localModelSwitching = ref(false)
const localModelPrepareHint = ref('')
const localModelStage = computed(() => String(localModelStatus.value?.stage || 'idle'))
const localModelLoadedStages = computed(() => {
  const raw = localModelStatus.value?.loaded_stages
  if (Array.isArray(raw) && raw.length) return raw.map(String)
  const stage = localModelStage.value
  return stage && stage !== 'idle' ? [stage] : []
})

const localModelLoadedStageText = computed(() => {
  const stages = localModelLoadedStages.value
  if (!stages.length) return ''
  return stages.map(s => localModelStageLabel(s)).join(' + ')
})

const localModelStageText = computed(() => {
  const base = localModelStageLabel(localModelStage.value)
  if (localModelStage.value === 'llm') {
    const model = String(localModelStatus.value?.ollama_model || episodeTextModel.value || '').trim()
    return model ? `LLM · ${model}` : base
  }
  if (localModelStage.value !== 'audio') return base
  const engine = resolveActiveLocalTtsEngine()
  const voiceId = String(localEdgeVoiceId.value || '')
  if (engine === 'edge') return '配音·Edge'
  if (engine === 'indextts') return '配音·IndexTTS2'
  if (engine === 'gptsovits' || /^gsv:/i.test(voiceId)) return '配音·GPT-SoVITS'
  if (/^preset:kokoro:/i.test(voiceId)) return '配音·Kokoro'
  if (/^preset:qwen/i.test(voiceId)) return '配音·Qwen'
  const meta = findLocalVoiceProfile(localEdgeVoiceId.value)
  if (meta?.source === 'kokoro') return '配音·Kokoro'
  if (meta?.source === 'cloned') return '配音·克隆'
  return '配音·Voicebox'
})
const localModelOnline = computed(() => ({
  ollama: !!localModelStatus.value?.ollama_online,
  comfyui: !!localModelStatus.value?.comfyui_online,
  edgeTts: !!localModelStatus.value?.edge_tts_online,
  voicebox: !!localModelStatus.value?.voicebox_online,
  gptsovits: !!localModelStatus.value?.gptsovits_online,
  indextts: !!localModelStatus.value?.indextts_online,
}))
const localModelStatusHint = computed(() => {
  const auto = localModelStatus.value?.automation
  const online = [
    `Ollama ${localModelOnline.value.ollama ? '在线' : '离线'}`,
    `ComfyUI ${localModelOnline.value.comfyui ? '在线' : '离线'}`,
    `Edge TTS ${localModelOnline.value.edgeTts ? '可用' : '不可用'}`,
    `Voicebox ${localModelOnline.value.voicebox ? '在线' : '离线'}`,
    `GPT-SoVITS ${localModelOnline.value.gptsovits ? '在线' : '离线'}`,
    `IndexTTS2 ${localModelOnline.value.indextts ? '在线' : '离线'}`,
  ].join(' · ')
  if (!auto) return online
  const stageKey = localModelStage.value === 'idle' ? 'idle' : localModelStage.value
  const rule = auto[stageKey] || ''
  return rule ? `${online}\n${rule}` : online
})

const LOCAL_MODEL_BAR_STAGE_KEY = 'huobao:local-model-bar:stage'
const LOCAL_MODEL_BAR_VIDEO_KEY = 'huobao:local-model-bar:video'

const LOCAL_MODEL_BAR_STAGE_OPTIONS = [
  { value: 'llm', label: 'LLM（写稿 / Agent）' },
  { value: 'image', label: '生图（ComfyUI）' },
  { value: 'video', label: '生视频（ComfyUI）' },
  { value: 'audio', label: '配音（TTS）' },
] as const

function readLocalModelBarStage(): LocalModelStage {
  if (typeof window === 'undefined') return 'llm'
  const saved = window.localStorage.getItem(LOCAL_MODEL_BAR_STAGE_KEY)
  if (saved === 'llm' || saved === 'image' || saved === 'video' || saved === 'audio') return saved
  return 'llm'
}

const localModelBarStage = ref<LocalModelStage>(readLocalModelBarStage())
const localModelBarVideoModel = ref((() => {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_VIDEO_MODEL
  const saved = String(window.localStorage.getItem(LOCAL_MODEL_BAR_VIDEO_KEY) || '').trim()
  if (LOCAL_VIDEO_MODEL_OPTIONS.some(item => item.value === saved)) return saved
  return DEFAULT_LOCAL_VIDEO_MODEL
})())
let localModelBarPollTimer: ReturnType<typeof setInterval> | null = null

const localModelBarModelOptions = computed(() => {
  const stage = localModelBarStage.value
  if (stage === 'llm') return localLlmModelOptions.value
  if (stage === 'image') return imageModelOptions.value
  if (stage === 'video') {
    return LOCAL_VIDEO_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value }))
  }
  if (stage === 'audio') return localTtsEngineOptions
  return []
})

const localModelBarModelValue = computed(() => {
  const stage = localModelBarStage.value
  if (stage === 'llm') return episodeTextModel.value
  if (stage === 'image') return episodeImageModel.value
  if (stage === 'video') return localModelBarVideoModel.value
  if (stage === 'audio') return localTtsEngine.value
  return ''
})

const localModelBarModelDisabled = computed(() => localModelSwitching.value)

const localModelBarStageBadge = computed(() => {
  const loaded = localModelLoadedStageText.value
  if (loaded) {
    const llmModel = String(localModelStatus.value?.ollama_model || episodeTextModel.value || '').trim()
    if (localModelLoadedStages.value.includes('llm') && llmModel) {
      return `${loaded} · ${llmModel}`
    }
    return loaded
  }
  const stage = localModelStageLabel(localModelStage.value)
  if (localModelStage.value === 'llm') {
    const model = String(localModelStatus.value?.ollama_model || episodeTextModel.value || '').trim()
    return model ? `${stage} · ${model}` : stage
  }
  if (localModelStage.value === 'image') {
    const model = String(episodeImageModel.value || '').trim()
    return model ? `${stage} · ${model}` : stage
  }
  if (localModelStage.value === 'video') {
    const model = String(localModelBarVideoModel.value || '').trim()
    return model ? `${stage} · ${model}` : stage
  }
  if (localModelStage.value === 'audio') return localModelStageText.value
  return stage
})

const localModelBarStatusText = computed(() => {
  if (localModelSwitching.value) {
    return localModelPrepareHint.value || '正在加载模型，请稍候…'
  }
  if (!stageNeedsLocalHardware(localModelBarStage.value)) {
    if (localModelBarStage.value === 'llm') return '云端文本（智谱），无需加载显存'
    if (localModelBarStage.value === 'image') return '云端生图，无需加载显存'
    if (localModelBarStage.value === 'video') return '云端/轻量视频，无需加载 Wan'
  }
  const loaded = localModelLoadedStageText.value
  if (loaded) return `已加载：${loaded}`
  if (localModelStage.value && localModelStage.value !== 'idle') {
    return `已加载：${localModelStageLabel(localModelStage.value)}`
  }
  return '云端模型就绪（无需本地预加载）'
})

const localModelBarHint = computed(() => {
  const llmModel = String(episodeTextModel.value || localModelStatus.value?.ollama_model || '未选择')
  const imageModel = String(episodeImageModel.value || '未选择')
  const videoModel = String(localModelBarVideoModel.value || '未选择')
  const audioLabel = localTtsEngineLabel.value
  if (!stageNeedsLocalHardware(localModelBarStage.value)) {
    return '当前为云端 API，切换步骤不会再自动加载 Ollama/ComfyUI'
  }
  if (isLocalOllamaTextModel(llmModel) && !localModelOnline.value.ollama) return 'Ollama 离线，请先启动 Ollama 服务'
  if (localModelBarStage.value === 'image' && needsLocalImageHardware(imageModel) && !localModelOnline.value.comfyui) {
    return `ComfyUI 离线 · 当前：文本 ${llmModel} · 生图 ${imageModel} · 视频 ${videoModel} · 配音 ${audioLabel}`
  }
  if (localModelBarStage.value === 'video' && needsLocalVideoHardware(videoModel) && !localModelOnline.value.comfyui) {
    return `ComfyUI 离线 · 当前：文本 ${llmModel} · 生图 ${imageModel} · 视频 ${videoModel} · 配音 ${audioLabel}`
  }
  if (localModelBarStage.value === 'audio') {
    const engine = localTtsEngine.value
    if (engine === 'indextts' && !localModelOnline.value.indextts) {
      return `IndexTTS2 离线 · 当前配音引擎：${audioLabel}`
    }
    if (engine === 'gptsovits' && !localModelOnline.value.gptsovits) {
      return `GPT-SoVITS 离线 · 当前配音引擎：${audioLabel}`
    }
    if (engine === 'voicebox' && !localModelOnline.value.voicebox) {
      return `Voicebox 离线 · 当前配音引擎：${audioLabel}`
    }
  }
  return `文本 ${llmModel} · 生图 ${imageModel} · 生视频 ${videoModel} · 配音 ${audioLabel} — 本地阶段互斥加载`
})

/** 云端智谱/Agnes 等：不需要 Ollama/Comfy 预加载到显存 */
function stageNeedsLocalHardware(stage: string, opts?: { ollamaModel?: string; comfyVideoModel?: string }): boolean {
  if (stage === 'llm') {
    const model = opts?.ollamaModel || resolveActiveLocalLlmModel(episodeTextModel.value)
    return isLocalOllamaTextModel(model)
  }
  if (stage === 'image') {
    return needsLocalImageHardware(episodeImageModel.value)
  }
  if (stage === 'video') {
    const vm = opts?.comfyVideoModel || localModelBarVideoModel.value
    return needsLocalVideoHardware(vm)
  }
  if (stage === 'audio') {
    // Edge TTS 无需预加载；其它本地引擎才检查/拉起
    const engine = String(opts?.ttsEngine || resolveActiveLocalTtsEngine() || '').trim()
    return engine === 'indextts' || engine === 'gptsovits' || engine === 'voicebox'
  }
  return false
}

const localModelBarNeedsHardware = computed(() => stageNeedsLocalHardware(localModelBarStage.value))

function onLocalModelBarStageChange(stage: string) {
  if (stage !== 'llm' && stage !== 'image' && stage !== 'video' && stage !== 'audio') return
  localModelBarStage.value = stage
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCAL_MODEL_BAR_STAGE_KEY, stage)
  }
}

function onLocalModelBarVideoChange(value: string) {
  if (!value || value === localModelBarVideoModel.value) return
  localModelBarVideoModel.value = value
  if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_MODEL_BAR_VIDEO_KEY, value)
  if (!usesLocalModelPipeline.value) return
  // 轻量动态不占 Comfy；仅 Wan 才写入视频阶段模型
  if (!/wan/i.test(value)) return
  void localModelAPI.setStage(localModelStage.value || 'idle', {
    ...localModelRequestOpts(localModelStage.value || 'idle'),
    comfyVideoModel: value,
  }).then(status => {
    localModelStatus.value = status
  }).catch(() => {})
}

async function onLocalModelBarModelChange(value: string) {
  const stage = localModelBarStage.value
  if (stage === 'llm') {
    await onEpisodeTextModelChange(value)
    return
  }
  if (stage === 'image') {
    await onEpisodeImageModelChange(value)
    return
  }
  if (stage === 'video') {
    localModelBarVideoModel.value = value
    if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_MODEL_BAR_VIDEO_KEY, value)
    return
  }
  if (stage === 'audio') {
    await onLocalTtsEngineChange(value)
  }
}

async function onLocalModelBarLoad() {
  const stage = localModelBarStage.value
  if (stage === 'llm' || stage === 'image' || stage === 'video' || stage === 'audio') {
    await runLocalModelStage(stage)
  }
}

function startLocalModelBarPolling() {
  if (localModelBarPollTimer) clearInterval(localModelBarPollTimer)
  if (!usesLocalModelPipeline.value) return
  const tick = () => { void refreshLocalModelStatus() }
  localModelBarPollTimer = setInterval(tick, localModelSwitching.value ? 2000 : 15000)
}

function stopLocalModelBarPolling() {
  if (localModelBarPollTimer) {
    clearInterval(localModelBarPollTimer)
    localModelBarPollTimer = null
  }
}

function findLocalVoiceProfile(voiceId) {
  if (!voiceId) return null
  return edgeVoiceProfiles.value.find(v => v.id === voiceId)
    || localCastVoiceProfiles.value.find(v => v.id === voiceId)
    || null
}

function usesGsvClonedVoices(engine?: string) {
  return engine === 'gptsovits' || engine === 'indextts'
}

function ttsEngineSupportsEmotionInstruct(engine?: string) {
  return engine === 'voicebox' || engine === 'indextts'
}

/** Kokoro / Qwen 预设与克隆音色必须走 Voicebox；Edge 音色走 edge-tts；gsv 克隆走 GPT-SoVITS 或 IndexTTS2 */
function resolveActiveLocalTtsEngine() {
  const voiceId = String(localEdgeVoiceId.value || '').trim()
  if (/^gsv:/i.test(voiceId)) {
    if (localTtsEngine.value === 'indextts' && indexttsAvailable.value) return 'indextts'
    if (gptsovitsAvailable.value) return 'gptsovits'
    if (indexttsAvailable.value) return 'indextts'
  }
  if (/^preset:/i.test(voiceId)) return 'voicebox'
  const meta = findLocalVoiceProfile(voiceId)
  if (meta?.source === 'kokoro' || meta?.source === 'cloned') return 'voicebox'
  if (localTtsEngine.value === 'indextts' && indexttsAvailable.value) return 'indextts'
  if (localTtsEngine.value === 'gptsovits' && gptsovitsAvailable.value) return 'gptsovits'
  if (localTtsEngine.value === 'voicebox' && voiceboxAvailable.value) return 'voicebox'
  return 'edge'
}

function localModelRequestOpts(stage) {
  const opts: { ollamaModel?: string; ttsEngine?: string; comfyVideoModel?: string; lightMotion?: boolean } = {}
  if (stage === 'llm') {
    opts.ollamaModel = resolveActiveLocalLlmModel(episodeTextModel.value)
  }
  if (stage === 'audio') {
    opts.ttsEngine = resolveActiveLocalTtsEngine()
  }
  if (stage === 'video') {
    const vm = String(localModelBarVideoModel.value || '')
    if (/wan/i.test(vm)) {
      opts.comfyVideoModel = vm
    } else {
      // glide / kenburns：不拉 Comfy、不加载 Wan
      opts.lightMotion = true
    }
  }
  return opts
}

async function refreshLocalModelStatus() {
  if (!usesLocalModelPipeline.value) return
  try {
    localModelStatus.value = await localModelAPI.status()
    const savedVideo = String(localModelStatus.value?.comfy_video_model || '').trim()
    // 勿用后端 Wan 默认覆盖用户已选的轻量动态
    if (
      savedVideo
      && /wan/i.test(savedVideo)
      && /wan/i.test(String(localModelBarVideoModel.value || ''))
      && headerVideoModelOptions.value.some(o => o.value === savedVideo)
    ) {
      localModelBarVideoModel.value = savedVideo
    }
  } catch {
    // 静默：本地服务可能未启动
  }
}

async function syncLocalModelStage(navKey) {
  if (!usesLocalModelPipeline.value) return
  const stage = resolveLocalModelStageFromNav(navKey)
  if (stage === 'idle') return
  // 云端智谱/Agnes/CogView：不自动拉 Ollama/Comfy，避免顶栏一直转圈
  if (!stageNeedsLocalHardware(stage)) return
  // 本地视频生成中勿切到配音等阶段，否则 Comfy /interrupt 会打断 Wan
  if (
    pendingVideoIds.value.length > 0
    && (localModelStage.value === 'video' || localModelLoadedStages.value.includes('video'))
    && stage !== 'video'
  ) {
    return
  }
  // 定妆/分镜生图中勿切到 LLM/配音，否则 /interrupt 会导致 execution_interrupted
  const imageBusy = pendingCharImageIds.value.length > 0
    || pendingNarrationShotIds.value.length > 0
    || isBatchRunning('charImages')
    || isBatchRunning('sceneImages')
    || isBatchRunning('narrationImages')
  if (
    imageBusy
    && (localModelStage.value === 'image' || localModelLoadedStages.value.includes('image'))
    && stage !== 'image'
  ) {
    return
  }
  const loaded = localModelLoadedStages.value
  if (loaded.includes(stage) && stage !== 'audio') return
  localModelSwitching.value = true
  try {
    localModelStatus.value = await localModelAPI.setStage(stage, localModelRequestOpts(stage))
  } catch (err) {
    console.warn('local model stage switch failed', err)
  } finally {
    localModelSwitching.value = false
  }
}

/** 生成任务完成后释放大模型显存（配音/合成等不需要 LLM/ComfyUI 时） */
async function releaseLocalModelsAfterTask() {
  if (!usesLocalModelPipeline.value) return
  if (localModelStage.value === 'idle') return
  // 仍有生图任务时不要 idle 卸载，否则会 interrupt 正在跑的定妆/配图
  if (
    pendingCharImageIds.value.length
    || pendingNarrationShotIds.value.length
    || pendingVideoIds.value.length
    || isBatchRunning('charImages')
    || isBatchRunning('sceneImages')
    || isBatchRunning('narrationImages')
  ) {
    return
  }
  try {
    localModelStatus.value = await localModelAPI.setStage('idle')
  } catch {
    // 释放失败不阻断主流程
  }
}
function localModelPrepareBaseLabel(stage) {
  if (stage === 'llm') return '正在启动 Ollama 并加载 LLM 到显存'
  if (stage === 'image') return '正在启动 ComfyUI 并准备生图环境'
  if (stage === 'video') return '正在启动 ComfyUI 并准备视频模型'
  if (stage === 'audio') {
    const engine = resolveActiveLocalTtsEngine()
    if (engine === 'indextts') return '正在检查 IndexTTS2 配音环境'
    if (engine === 'gptsovits') return '正在启动 GPT-SoVITS 配音服务'
    if (engine === 'voicebox') return '正在检查 Voicebox 配音服务'
    return '正在检查 Edge TTS'
  }
  return '正在准备本地模型'
}

async function ensureLocalModelForTask(stage, opts) {
  if (!usesLocalModelPipeline.value) return
  const requestOpts = { ...localModelRequestOpts(stage) }
  if (opts?.ollamaModel) requestOpts.ollamaModel = opts.ollamaModel
  if (opts?.ttsEngine) requestOpts.ttsEngine = opts.ttsEngine
  // 云端模型：跳过本地预加载，避免无意义转圈
  if (!stageNeedsLocalHardware(stage, requestOpts)) return
  localModelSwitching.value = true
  const base = localModelPrepareBaseLabel(stage)
  const started = Date.now()
  const emitProgress = () => {
    const sec = Math.floor((Date.now() - started) / 1000)
    const text = sec > 0 ? `${base}…（已等待 ${sec}s）` : `${base}…`
    localModelPrepareHint.value = text
    opts?.onProgress?.(text)
  }
  emitProgress()
  const timer = setInterval(emitProgress, 1000)
  try {
    localModelStatus.value = await localModelAPI.ensure(stage, requestOpts)
  } catch (err) {
    toast.error(err.message || '本地模型切换失败')
    throw err
  } finally {
    clearInterval(timer)
    localModelPrepareHint.value = ''
    localModelSwitching.value = false
  }
}

async function runLocalModelStage(stage) {
  if (!usesLocalModelPipeline.value) return
  if (!stageNeedsLocalHardware(stage, localModelRequestOpts(stage))) {
    toast.success(
      stage === 'llm' ? '云端文本已就绪（智谱，无需加载显存）'
        : stage === 'image' ? '云端生图已就绪（无需加载 Comfy）'
          : stage === 'video' ? '云端/轻量视频已就绪（无需加载 Wan）'
            : '当前阶段无需本地预加载',
    )
    return
  }
  try {
    const opts = localModelRequestOpts(stage)
    await ensureLocalModelForTask(stage, opts)
    await refreshLocalModelStatus()
    const modelHint = stage === 'llm'
      ? `（${resolveActiveLocalLlmModel(episodeTextModel.value)}）`
      : stage === 'image'
        ? `（${episodeImageModel.value}）`
      : stage === 'video'
        ? `（${localModelBarVideoModel.value}）`
      : stage === 'audio'
        ? `（${localTtsEngineLabel.value}）`
        : ''
    toast.success(
      stage === 'video' && opts.lightMotion
        ? `轻量运镜就绪（${localModelBarVideoModel.value}，未加载 Wan/Comfy）`
        : `${localModelStageLabel(stage)} 模型已就绪${modelHint}`,
    )
  } catch {
    // ensureLocalModelForTask 已 toast
  }
}

async function unloadLocalModels() {
  if (!usesLocalModelPipeline.value) return
  if (
    pendingCharImageIds.value.length
    || pendingNarrationShotIds.value.length
    || pendingVideoIds.value.length
    || isBatchRunning('charImages')
    || isBatchRunning('sceneImages')
    || isBatchRunning('narrationImages')
  ) {
    toast.warning('仍有生图/视频任务进行中，请等待完成后再卸载本地模型')
    return
  }
  localModelSwitching.value = true
  try {
    localModelStatus.value = await localModelAPI.setStage('idle')
    toast.success('已卸载本地模型，显存已释放')
  } catch (err) {
    toast.error(err.message || '卸载失败')
  } finally {
    localModelSwitching.value = false
  }
}

const currentLocalModelStage = computed(() => {
  if (!usesLocalModelPipeline.value) return null
  if (panel.value === 'script') {
    const navKey = resolveActiveSubStepKey(productionMode.value, panel.value, scriptStep.value, prodTab.value, exportTab.value)
    const stage = resolveLocalModelStageFromNav(navKey)
    return stage === 'idle' ? null : stage
  }
  if (panel.value === 'production') {
    const stage = resolveLocalModelStageFromNav(`prod:${prodTab.value}`)
    return stage === 'idle' ? null : stage
  }
  return null
})

const showCharsDualLocalModelControls = computed(() =>
  isLocalComicMode.value && panel.value === 'production' && prodTab.value === 'chars',
)

async function runLocalComicAgent(type, message, onDone) {
  const llmModel = resolveActiveLocalLlmModel(episodeTextModel.value)
  if (isLocalComicMode.value) {
    const needsTools = type === 'extractor' || type === 'script_rewriter' || type === 'storyboard_breaker' || type === 'voice_assigner' || type === 'grid_prompt_generator'
    if (needsTools && !isLocalAgentToolModel(llmModel)) {
      toast.warning(`「${llmModel}」不支持 Agent 工具调用，提取/改写等将自动改用 ${DEFAULT_LOCAL_AGENT_MODEL}`)
    }
    const preloadModel = needsTools && !isLocalAgentToolModel(llmModel)
      ? DEFAULT_LOCAL_AGENT_MODEL
      : llmModel
    try {
      await ensureLocalModelForTask('llm', { ollamaModel: preloadModel })
    } catch {
      return
    }
  }
  const agentModel = isLocalComicMode.value
    ? ((type === 'extractor' || type === 'script_rewriter' || type === 'storyboard_breaker' || type === 'voice_assigner' || type === 'grid_prompt_generator') && !isLocalAgentToolModel(llmModel)
      ? DEFAULT_LOCAL_AGENT_MODEL
      : llmModel)
    : undefined
  await runAgent(type, message, dramaId, epId.value, onDone, agentModel)
}

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

/** 与后端 isPlausibleDialogueSpeaker 对齐：拒绝把叙述句误当成角色名 */
function isPlausibleDialogueSpeaker(speaker) {
  const name = String(speaker || '').trim()
  if (!name) return false
  if (name === '旁白' || name === '剧中' || name === '解说') return true
  if (name.length > 12) return false
  if (/[，,。！？!?；;、：:\n]/.test(name)) return false
  if (name.length >= 8 && /[的了着过]|他|她|我|这|那|就|又|却|把|被|让/.test(name)) return false
  if (/^(借着|顺着|看着|听着|想到|只见|忽然|突然|于是|然后|接着)/.test(name)) return false
  return true
}

function parseStoryboardSpeaker(dialogue) {
  const raw = String(dialogue || '').trim()
  if (!raw) return ''
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  let speaker = speakerMatch
    ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim()
    : '旁白'
  if (speaker && !isPlausibleDialogueSpeaker(speaker)) speaker = '旁白'
  return speaker === '剧中' ? '旁白' : speaker
}

const motionComicStoryboardSpeakers = computed(() => {
  if (!usesDialogueSpeakers.value) return new Set<string>()
  const speakers = new Set<string>()
  for (const sb of sbs.value) {
    const speaker = parseStoryboardSpeaker(sb.dialogue)
    if (speaker) speakers.add(speaker)
  }
  return speakers
})

const motionComicVoiceChars = computed(() => {
  if (!usesDialogueSpeakers.value) return []
  const speakers = motionComicStoryboardSpeakers.value
  const list = speakers.size
    ? chars.value.filter(c => speakers.has(String(c.name || '').trim()) || (isNarratorCharacter(c) && speakers.has('旁白')))
    : chars.value.filter(c => !isNarratorCharacter(c) || isMotionComicMode.value)
  return [...list].sort((a, b) => {
    const pa = isNarratorCharacter(a) ? 0 : 1
    const pb = isNarratorCharacter(b) ? 0 : 1
    if (pa !== pb) return pa - pb
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  })
})

const motionComicCharsVoiced = computed(() =>
  motionComicVoiceChars.value.filter(c => c.voice_style || c.voiceStyle).length,
)

const storyboardStep = computed(() => {
  if (isNarrationLikeMode.value) return narrationStoryboardStep()
  return dramaStoryboardStepForMode(productionMode.value)
})
const narratorChar = computed(() => findNarratorChar(chars.value))
const narratorReady = computed(() => {
  if (usesDialogueSpeakers.value) {
    return localTtsEnabled.value
      ? motionComicCharsVoiced.value > 0 && motionComicCharsVoiced.value >= motionComicVoiceChars.value.length
      : motionComicCharsVoiced.value > 0
  }
  return localTtsEnabled.value || !!(narratorChar.value?.voice_style || narratorChar.value?.voiceStyle)
})
const narratorVoiceId = ref('')
const narratorVoiceDirty = ref(false)
const DEFAULT_LOCAL_EDGE_VOICE = 'zh-CN-YunxiNeural'
const DEFAULT_LOCAL_TTS_ENGINE = 'indextts'
const DEFAULT_CLONED_VOICE_ID = 'gsv:008' // 云希
const localTtsEnabled = ref(true)
const localTtsEngine = ref(DEFAULT_LOCAL_TTS_ENGINE)
const localEdgeVoiceId = ref(DEFAULT_CLONED_VOICE_ID)
const edgeVoiceProfiles = ref([])
const voiceboxAvailable = ref(false)
const voiceboxModelLoaded = ref(false)
const gptsovitsAvailable = ref(false)
const indexttsAvailable = ref(false)
const gsvCatalogVoices = ref([])
const gsvLoading = ref(false)
const gsvSaving = ref(false)
const gsvUploading = ref(false)
const gsvPreviewing = ref(false)
const gsvDeletingId = ref('')
const gsvEditingId = ref('')
const gsvPreviewUrl = ref('')
const gsvPanelOpen = ref(false)
const gsvFileInputRef = ref(null)
const gsvForm = reactive({
  voice_id: '',
  voice_name: '',
  ref_audio_path: '',
  prompt_text: '',
  prompt_lang: 'zh',
  language: '中文',
  gpt_weights: '',
  sovits_weights: '',
})
const localTtsEngineOptions = [
  { label: 'IndexTTS2（情感克隆 · 复用 GPT-SoVITS 参考音）', value: 'indextts' },
  { label: 'GPT-SoVITS（音色克隆）', value: 'gptsovits' },
  { label: 'Voicebox（Kokoro / Qwen / 克隆）', value: 'voicebox' },
  { label: 'Edge TTS（微软系统音色）', value: 'edge' },
]
const DEFAULT_TTS_SPEED = 1
const localTtsSpeedOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '0.6x', value: 0.6 },
  { label: '0.75x', value: 0.75 },
  { label: '0.8x', value: 0.8 },
  { label: '0.85x', value: 0.85 },
  { label: '0.9x', value: 0.9 },
  { label: '1.0x（默认）', value: 1 },
  { label: '1.25x', value: 1.25 },
]
const localTtsSpeed = ref(DEFAULT_TTS_SPEED)
const VOICEBOX_INSTRUCT_CUSTOM = '__custom__'
const voiceboxInstructOptions = computed(() => isMotionComicMode.value
  ? [
    { label: '默认（自然）', value: '' },
    { label: '漫剧叙述（推荐）', value: '像在为观众讲述一部短剧故事，语气有代入感，节奏紧凑，适合抖音/快手漫剧旁白' },
    { label: '热血战斗', value: '热血激昂，打斗与反转处语速加快、情绪上扬，平时沉稳叙述' },
    { label: '悬疑反转', value: '悬疑感，关键反转处压低声音、略停顿，制造紧张感' },
    { label: '沉稳叙述', value: '沉稳、清晰，适合剧情旁白' },
    { label: '自定义…', value: VOICEBOX_INSTRUCT_CUSTOM },
  ]
  : [
  { label: '默认（自然）', value: '' },
  { label: '体验人生解说（推荐）', value: '像在为观众讲述一次全新的人生体验，语气沉静有代入感，略带好奇与感慨，节奏从容，适合「体验365个人生」类解说旁白' },
  { label: '沉浸第一人称', value: '第一人称沉浸叙述，仿佛正在亲身经历这段人生，情绪随剧情自然起伏，真诚、不夸张' },
  { label: '命运转折', value: '平时沉稳克制；讲到人生转折、逆袭或关键抉择时略带戏剧张力，句末轻微加重' },
  { label: '沉稳叙述', value: '沉稳、清晰，适合纪录片旁白' },
  { label: '温暖亲切', value: '温暖亲切，带有微笑感' },
  { label: '略带感慨', value: '略带感慨，语速适中，有感情' },
  { label: '紧张悬疑', value: '紧张、悬疑，压低声音' },
  { label: '激昂有力', value: '激昂有力，广播质感' },
  { label: '轻声低语', value: '轻声、亲密，如同在耳边诉说' },
  { label: '自定义…', value: VOICEBOX_INSTRUCT_CUSTOM },
])
const DEFAULT_VOICEBOX_MODEL_SIZE = '0.6B'
const localVoiceboxModelSize = ref(DEFAULT_VOICEBOX_MODEL_SIZE)
const voiceboxModelSizeOptions = [
  { label: '0.6B（默认·更快）', value: '0.6B' },
  { label: '1.7B（更高质量）', value: '1.7B' },
]
const MOTION_COMIC_VOICEBOX_INSTRUCT_DEFAULT = '像在为观众讲述一部短剧故事，语气有代入感，节奏紧凑，适合抖音/快手漫剧旁白'
const NARRATION_VOICEBOX_INSTRUCT_DEFAULT = '像在为观众讲述一次全新的人生体验，语气沉静有代入感，略带好奇与感慨，节奏从容，适合「体验365个人生」类解说旁白'
const localVoiceboxInstructPreset = ref(NARRATION_VOICEBOX_INSTRUCT_DEFAULT)
const localVoiceboxInstructCustom = ref('')
const LOCAL_TTS_PREVIEW_DEFAULT = '这是一段旁白试听，用于感受当前音色、语速和感情效果。'
const TTS_BATCH_CONCURRENCY_EDGE = 4
const TTS_BATCH_CONCURRENCY_VOICEBOX = 4
const TTS_BATCH_CONCURRENCY_GPTSOVITS = 1
/** Agnes / 智谱云端生图批量并发（后端无本地队列限制） */
const IMAGE_BATCH_CONCURRENCY_AGNES = 4
const IMAGE_BATCH_CONCURRENCY_CLOUD = 4
const IMAGE_BATCH_CONCURRENCY_LOCAL = 1
const localTtsPreviewing = ref(false)
const localTtsPreviewUrl = ref('')
const localTtsPreviewSrc = computed(() => {
  if (!localTtsPreviewUrl.value) return ''
  const path = localTtsPreviewUrl.value.replace(/^\//, '')
  return `/${path}?v=${encodeURIComponent(localTtsPreviewBump.value)}`
})
const localTtsPreviewBump = ref(0)
const customTtsText = ref('')
const customTtsVoiceId = ref('alloy')
const customTtsAudioUrl = ref('')
const customTtsGenerating = ref(false)
const customTtsPreviewBump = ref(0)
const customTtsUsesLocal = computed(() => (isNarrationMode.value || isLocalComicMode.value) && localTtsEnabled.value !== false)
const customTtsPreviewSrc = computed(() => {
  if (!customTtsAudioUrl.value) return ''
  const path = customTtsAudioUrl.value.replace(/^\//, '')
  return `/${path}?v=${encodeURIComponent(String(customTtsPreviewBump.value))}`
})
const customTtsDownloadSrc = computed(() => {
  if (!customTtsAudioUrl.value) return ''
  return `/${customTtsAudioUrl.value.replace(/^\//, '')}`
})
const customTtsDownloadName = computed(() => {
  const snippet = customTtsText.value.trim().replace(/[^\u4e00-\u9fa5\w]+/g, '_').slice(0, 24) || 'custom-tts'
  const ext = customTtsAudioUrl.value.match(/\.(mp3|wav|m4a)$/i)?.[0] || '.mp3'
  return `${snippet}${ext}`
})
const localTtsSpeedLabel = computed(() => {
  const opt = localTtsSpeedOptions.find(o => o.value === localTtsSpeed.value)
  return opt?.label || `${localTtsSpeed.value}x`
})
const localTtsEngineLabel = computed(() => {
  if (!localTtsEnabled.value) return lockedAudioConfigLabel.value
  if (localTtsEngine.value === 'indextts') return '本地 IndexTTS2'
  if (localTtsEngine.value === 'gptsovits') return '本地 GPT-SoVITS'
  return localTtsEngine.value === 'voicebox' ? '本地 Voicebox' : '本地 Edge TTS'
})
const localTtsSupportsEmotionInstruct = computed(() => ttsEngineSupportsEmotionInstruct(localTtsEngine.value))
const localTtsUsesGsvVoices = computed(() => usesGsvClonedVoices(localTtsEngine.value))
const selectedVoiceSupportsInstruct = computed(() => {
  if (localTtsEngine.value !== 'voicebox') return false
  const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
  return row?.supportsInstruct === true
})
function resolveVoiceboxInstructText() {
  if (localTtsEngine.value === 'voicebox' && !selectedVoiceSupportsInstruct.value) return ''
  if (localVoiceboxInstructPreset.value === VOICEBOX_INSTRUCT_CUSTOM) {
    return String(localVoiceboxInstructCustom.value || '').trim()
  }
  return String(localVoiceboxInstructPreset.value || '').trim()
}
const localVoiceboxInstructLabel = computed(() => {
  if (!ttsEngineSupportsEmotionInstruct(localTtsEngine.value)) return ''
  if (localTtsEngine.value === 'voicebox' && !selectedVoiceSupportsInstruct.value) return ''
  const instruct = resolveVoiceboxInstructText()
  if (!instruct) return ''
  if (localVoiceboxInstructPreset.value === VOICEBOX_INSTRUCT_CUSTOM) {
    return instruct.length > 12 ? `${instruct.slice(0, 12)}…` : instruct
  }
  const opt = voiceboxInstructOptions.value.find(o => o.value === localVoiceboxInstructPreset.value)
  return opt?.label || instruct
})
const localVoiceboxModelSizeLabel = computed(() => {
  if (localTtsEngine.value !== 'voicebox') return ''
  const opt = voiceboxModelSizeOptions.find(o => o.value === localVoiceboxModelSize.value)
  return opt?.label || localVoiceboxModelSize.value
})
const pipelineStepTotal = computed(() => workflowStepTotal(productionMode.value))
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()
const narrationBreaking = ref(false)
const storyboardBreaking = ref(false)
const narrationImageBreaking = ref(false)
const narrationImageStep = ref(null)
const narrationImagePromptTestActive = ref(false)
const narrationImageAuditing = ref(false)
const narrationImageOptimizing = ref(false)
const narrationImageRestoring = ref(false)
const narrationImageAuditPanel = ref(null)
const narrationImageBreakdownProgress = ref(null)
const narrationStoryboardDescUploading = ref(false)
const narrationImageDescUploading = ref(false)
const storyboardDescUploadTarget = ref(null)
const storyboardDescUploadInputRef = ref(null)
const narrationExtracting = ref(false)
const narrationExtractGeneratedAt = ref(null)
const narrationExtractFailedAt = ref(null)
const narrationExtractError = ref(null)
const charAppearanceGeneratedAt = ref({})
const charAppearanceFailedAt = ref({})
const charAppearanceError = ref({})
const charImageGeneratedAt = ref({})
const charImageFailedAt = ref({})
const charImageError = ref({})
const charRecognizeGeneratedAt = ref({})
const charRecognizeFailedAt = ref({})
const charRecognizeError = ref({})
const shotScanGeneratedAt = ref({})
const shotScanFailedAt = ref({})
const shotScanError = ref({})
const bgmDescGeneratedAt = ref(null)
const bgmDescFailedAt = ref(null)
const bgmDescError = ref(null)
const narrationBreakdownSummary = ref(null)
const imageDetectMode = ref('paragraph')
const imageDetectBatchThreshold = ref(80)
const imageDetectBatchSize = ref(30)
const narrationImageStyle = ref(NARRATION_ANIME_STYLE)
const narrationImageStyleOptions = computed(() => {
  if (isMotionComicMode.value || isNovelComicMode.value) {
    return [{ value: MOTION_COMIC_STYLE, label: isNovelComicMode.value ? '小说漫画' : '漫画解说' }]
  }
  if (isDramaLikeMode.value) {
    return ART_STYLES
      .filter(item => item.value !== MOTION_COMIC_STYLE)
      .map(item => ({ value: item.value, label: item.label }))
  }
  return NARRATION_IMAGE_STYLE_OPTIONS.map(item => ({
    value: item.value,
    label: item.label,
  }))
})

function narrationImageStyleStorageKey() {
  if (isDramaLikeMode.value && dramaId) return `huobao-drama-image-style-${dramaId}`
  return 'huobao-narration-image-style'
}

function readSavedNarrationImageStyle() {
  if (typeof window === 'undefined') return null
  const key = narrationImageStyleStorageKey()
  let saved = window.localStorage.getItem(key)
  if (!saved && isLocalComicMode.value) {
    saved = window.localStorage.getItem('huobao-local-drama-image-style')
    if (saved) window.localStorage.setItem(key, saved)
  }
  return saved
}

function syncNarrationImageStyleFromDrama() {
  if (!drama.value) return
  if (isMotionComicMode.value || isNovelComicMode.value) {
    narrationImageStyle.value = MOTION_COMIC_STYLE
    return
  }
  // 集内「画风风格」优先于项目级 drama.style（用户切换后会写入 localStorage）
  const saved = readSavedNarrationImageStyle()
  if (saved) {
    narrationImageStyle.value = isDramaLikeMode.value
      ? normalizeArtStyle(saved)
      : resolveNarrationImageStyle(saved)
    return
  }
  if (isDramaLikeMode.value) {
    narrationImageStyle.value = normalizeArtStyle(drama.value.style)
    return
  }
  const dramaStyle = normalizeArtStyle(drama.value.style)
  if (dramaStyle === NARRATION_MINIMAL_STYLE || dramaStyle === NARRATION_ANIME_STYLE) {
    narrationImageStyle.value = dramaStyle
    return
  }
  narrationImageStyle.value = NARRATION_ANIME_STYLE
}

function getNarrationImageStyle() {
  if (isDramaLikeMode.value) return normalizeArtStyle(narrationImageStyle.value)
  return resolveNarrationImageStyle(narrationImageStyle.value)
}

function onNarrationImageStyleChange(value) {
  narrationImageStyle.value = isDramaLikeMode.value
    ? normalizeArtStyle(value)
    : resolveNarrationImageStyle(value)
  persistNarrationImageStylePref()
}

function restoreNarrationImageStylePref() {
  if (typeof window === 'undefined') return
  if (isMotionComicMode.value || isNovelComicMode.value) {
    narrationImageStyle.value = MOTION_COMIC_STYLE
    return
  }
  const saved = readSavedNarrationImageStyle()
  if (!saved) return
  narrationImageStyle.value = isDramaLikeMode.value
    ? normalizeArtStyle(saved)
    : resolveNarrationImageStyle(saved)
}

function portraitImageStyleOptions() {
  return { imageStyle: getNarrationImageStyle() }
}

function persistNarrationImageStylePref() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(narrationImageStyleStorageKey(), getNarrationImageStyle())
}
  const imagePromptBatchSize = ref(5)

const localRaw = ref(''), localScript = ref('')

const SCRIPT_CHAT_WELCOME = computed(() => {
  if (isLocalComicMode.value) {
    return '我是本地短剧编剧，使用 Ollama 本地模型写短剧剧本。描述题材与梗概即可生成完整稿；写完后可填入「原始内容」继续 AI 改写、提取角色与分镜。支持多轮改稿。「直接输入」可粘贴小说/大纲。'
  }
  if (isDialoguePortraitMode.value) {
    return '我是对话立绘编剧（视觉小说式：背景不动，立绘说话/微动作）。请写 1～2 个角色对白，每行「角色名：台词」；可写（点头）（挥手）等短动作；段间空行或「【场景】」换景。写完后填入文案，再进入「对话分镜」。'
  }
  if (isNovelComicMode.value) {
    return '我是小说漫画讲解助手。请先在剧集页粘贴小说并确认章节大纲（一章一集）。本页改的是「本章旁白朗读稿」：叙述为主，可少量讲解衔接；写完后进旁白分镜 → 漫画配图 → TTS。'
  }
  if (isMotionComicMode.value) {
    return '我是漫画解说编剧。每行须「说话人：台词」（旁白/角色名/我/剧中）；一句一行；目标约旁白 30% / 对白 70%。篇幅以你指定为准（如写1000字），未指定时默认 3000～8000 字。支持多轮改稿：写完可说「补说话人」「压旁白」「去片尾关注句」等。「直接输入」里已保存的文案会自动带入上下文。'
  }
  return '描述你想让观众体验的「一段人生」。默认第二人称「你」、语言亲民真实。篇幅以你指定为准（如写1000字），未指定时默认 3000～10000 字。支持多轮改稿；「直接输入」里的文案会自动带入。也可切「直接输入」粘贴自备稿。'
})
const SCRIPT_CHAT_STORAGE_PREFIX = 'huobao:narration-script-chat:'

function defaultScriptChatMessages() {
  return [{ role: 'assistant', content: SCRIPT_CHAT_WELCOME.value, local: true }]
}

function loadScriptChatMessagesFromStorage(episodeId: number) {
  if (!episodeId || typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${SCRIPT_CHAT_STORAGE_PREFIX}${episodeId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return null
    return parsed.filter(
      (m: { role?: string; content?: string }) =>
        (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string',
    )
  } catch {
    return null
  }
}

function saveScriptChatMessagesToStorage(episodeId: number, messages: Array<{ role: string; content?: string; thinking?: string; local?: boolean }>) {
  if (!episodeId || typeof sessionStorage === 'undefined') return
  try {
    const cleaned = messages.filter(m => {
      if (m.local) return false
      if (m.role === 'assistant' && !String(m.content || '').trim() && !String(m.thinking || '').trim()) return false
      return true
    })
    const key = `${SCRIPT_CHAT_STORAGE_PREFIX}${episodeId}`
    if (!cleaned.length) {
      sessionStorage.removeItem(key)
      return
    }
    sessionStorage.setItem(key, JSON.stringify(cleaned.map(({ role, content, thinking }) => ({ role, content, ...(thinking ? { thinking } : {}) }))))
  } catch { /* ignore quota */ }
}

function restoreScriptChatForEpisode(episodeId: number) {
  const stored = loadScriptChatMessagesFromStorage(episodeId)
  scriptChatMessages.value = stored?.length
    ? [...defaultScriptChatMessages(), ...stored]
    : defaultScriptChatMessages()
  scriptGenMode.value = 'chat'
}

const scriptGenMode = ref('chat')
const scriptChatMessages = ref(defaultScriptChatMessages())
const scriptChatInput = ref('')
const scriptChatGenerating = ref(false)
const scriptChatModel = ref(DEFAULT_NARRATION_SCRIPT_CHAT_MODEL)

function syncScriptChatModel(ep) {
  scriptChatModel.value = isLocalComicMode.value
    ? resolveLocalScriptChatTextModel(ep)
    : DEFAULT_NARRATION_SCRIPT_CHAT_MODEL
}

function syncScriptChatThinking(ep) {
  const enabled = resolveScriptChatTextThinking(ep)
  scriptChatThinking.value = enabled
  episodeTextThinking.value = enabled
}
const scriptChatThinking = ref(DEFAULT_TEXT_THINKING)
const scriptChatScrollRef = ref(null)
const scriptChatAbortController = ref(null)
const scriptChatQuickHints = computed(() => {
  if (isLocalComicMode.value) {
    return [
      '写一篇都市悬疑短剧：盲眼大学生算卦救卤肉店，连环杀人犯破门而入',
      '写一篇甜宠短剧：外卖员误送蛋糕到总裁办公室，引发误会与心动',
      '把下面大纲扩成完整剧本：小镇青年返乡创业，遭遇阻力后逆袭',
      '语气更紧凑、对白更利落，补第二幕冲突，扩写到 3000 字以上',
    ]
  }
  if (isNovelComicMode.value) {
    return [
      '把本章稿压缩到约 1200 字，保留关键情节点，口语化便于旁白',
      '补两三句短讲解衔接，不要改成角色对白台本',
      '按场景换段，一句别太长，方便拆镜配音',
      '去掉说教与引流句，只保留小说叙述与必要讲解',
    ]
  }
  if (isMotionComicMode.value) {
    return [
      '按悬疑快切模板写完整稿：每行「说话人：台词」，片头「剧中：本期故事：…」',
      '帮我把当前文案补全说话人前缀（旁白/角色名/我），输出完整稿',
      '去掉片尾关注引流句，保留剧情余韵，输出完整稿',
      '按悬疑快切模板写完整稿：大学生算卦救邻居，警察从怀疑到信任',
    ]
  }
  return [
    '写一篇完整稿（3000～10000 字）：八十年代进城摆夜市摊，从穷到翻身又跌入谷底，写足内心活动',
    '写一篇完整稿（3000～10000 字）：九十年代小镇青年第一次进城打工，犹豫与期待交织',
    '把下面大纲扩成 3000～10000 字完整解说稿：职高辍学→进厂→摆摊→被骗',
    '语气更沉静、更亲民，补内心戏，扩写到 3000 字以上',
  ]
})
const showScriptChatPanel = computed(() => {
  if (isNarrationMode.value && scriptStep.value === narrationScriptChatStep()) return true
  if (isLocalComicMode.value && scriptStep.value === LOCAL_DRAMA_SCRIPT_CHAT_STEP) return true
  return false
})
const extractRunning = computed(() => isBatchRunning('extract') || (rn.value && rt.value === 'extractor'))
const scriptChatStepTitle = computed(() => (isNovelComicMode.value ? '本章朗读稿' : '剧本生成'))
const scriptChatGenModeHint = computed(() => {
  if (isLocalComicMode.value) {
    return scriptGenMode.value === 'chat' ? 'AI 对话 · 本地 Ollama 写剧本' : '直接输入 · 粘贴小说/大纲/剧本'
  }
  if (isDialoguePortraitMode.value) {
    return scriptGenMode.value === 'chat' ? 'AI 对话 · 写双人对话稿' : '直接输入 · 粘贴「角色名：台词」'
  }
  if (isNovelComicMode.value) {
    return scriptGenMode.value === 'chat' ? 'AI 对话 · 改本章旁白朗读稿' : '直接输入 · 编辑本章朗读正文'
  }
  if (isMotionComicMode.value) {
    return scriptGenMode.value === 'chat' ? 'AI 对话 · 漫画解说写稿' : '直接输入 · 粘贴或编写解说稿'
  }
  return scriptGenMode.value === 'chat' ? 'AI 对话 · 体验人生解说稿' : '直接输入 · 粘贴或编写解说稿'
})
const scriptChatAssistantLabel = computed(() => {
  if (isDialoguePortraitMode.value) return '对话编剧'
  if (isNovelComicMode.value) return '小说讲解'
  if (isMotionComicMode.value) return '解说大师'
  if (isLocalComicMode.value) return '编剧'
  return 'AI'
})
const scriptChatManualPlaceholder = computed(() => {
  if (isLocalComicMode.value) {
    return '粘贴小说原文、故事大纲或分镜描述…\n对话建议「角色名：台词」格式，段间空行换场景'
  }
  if (isDialoguePortraitMode.value) {
    return '粘贴对话脚本，每行「角色名：台词」；本集 1～2 人；段间空行换场景'
  }
  if (isNovelComicMode.value) {
    return '本章旁白朗读正文（叙述为主）…\n可从剧集页「确认大纲」自动填入，再在此微调'
  }
  if (isMotionComicMode.value) {
    return '粘贴或编写快切解说稿…\n首行：本期故事：…\n一句一行，段间空行换场景'
  }
  return '粘贴或编写完整解说稿…\n首行建议：今天体验的人生剧本是，…\n也可从 Word / 备忘录直接粘贴'
})
const scriptChatManualHint = computed(() => {
  if (isLocalComicMode.value) {
    return '自备稿可直接编辑保存，进入「AI 改写」继续；或在 AI 对话中多轮改稿后点「填入文案」。'
  }
  if (isDialoguePortraitMode.value) {
    return '对话立绘须用「角色名：台词」；本集 1～2 人。保存后进「对话分镜」。'
  }
  if (isNovelComicMode.value) {
    return '小说漫画讲解：旁白念本章小说。请先在剧集页完成「粘贴小说 → 章节大纲 → 确认建集」。保存后进旁白分镜。'
  }
  if (isMotionComicMode.value) {
    return '漫画解说须用快切解说稿（每行说话人：台词；约旁白 30% / 对白 70%）；保存后进分镜。在 AI 对话里说「补说话人」「压旁白」可改已保存文案。'
  }
  return '自备稿可直接在此编辑；保存后进入「文案输入」或「旁白分镜」继续。字幕 ** 强调在分镜时由 Qwen 自动标注。'
})
const scriptChatInputPlaceholder = computed(() => {
  if (isLocalComicMode.value) {
    return '描述短剧题材与梗概，或多轮改稿…（直接输入里的文案会自动带入）'
  }
  if (isDialoguePortraitMode.value) {
    return '写一段双人对话（角色名：台词），或多轮改稿…'
  }
  if (isNovelComicMode.value) {
    return '改本章朗读稿：压缩、口语化、补短讲解句…（直接输入里的文案会自动带入）'
  }
  if (isMotionComicMode.value) {
    return '写完整稿，或多轮改稿：补说话人、压旁白、去片尾…（直接输入里的文案会自动带入）'
  }
  return '描述本期人生，例如：十八岁职高辍学，八十年代进城摆夜市摊…'
})
/** 最近一次生成返回的字数下限（用户指定如「写1000字」时以后端为准） */
const scriptChatResolvedMinChars = ref<number | null>(null)
const scriptChatMinChars = computed(() => (
  scriptChatResolvedMinChars.value
  ?? (isLocalComicMode.value ? 2000 : (isDialoguePortraitMode.value ? 800 : (isNovelComicMode.value ? 400 : 3000)))
))
const scriptChatModelOptionsForPicker = computed(() => (
  usesLocalModelPipeline.value ? localLlmModelOptions.value : textModelOptions.value
))
const scriptChatModelSupportsThinking = computed(() => textModelSupportsThinking(scriptChatModel.value))

const IMAGE_DETECT_CHAT_WELCOME = computed(() => usesComicVisuals.value
  ? '我是漫画配图换镜检测助手。可讨论哪些镜头需要单独配图（约 2～4 镜一图、按场景/动作换图、换人不强制换图、整段一种运镜）；说「开始检测」或点快捷按钮，我会流式展示检测过程。'
  : '我是配图换镜检测助手。可讨论哪些镜头需要单独配图；说「开始检测」或点下方快捷按钮，我会流式展示检测过程。检测完成后可继续多轮调整策略并重新检测。')
const IMAGE_PROMPT_CHAT_WELCOME = computed(() => usesComicVisuals.value
  ? '我是漫画配图文案助手。须先完成换镜检测；说「开始生成文案」或点快捷按钮，我会流式展示整段国漫配图文案生成过程。主要配角须写定妆外貌。'
  : '我是配图文案助手。需先完成换镜检测；说「开始生成文案」或点快捷按钮，我会流式展示六维文案生成过程。生成后可逐段讨论修改，或补全缺失文案。')
const IMAGE_DETECT_CHAT_STORAGE_PREFIX = 'huobao:narration-image-detect-chat:'
const IMAGE_PROMPT_CHAT_STORAGE_PREFIX = 'huobao:narration-image-prompt-chat:'

function defaultImageDetectChatMessages() {
  return [{ role: 'assistant', content: IMAGE_DETECT_CHAT_WELCOME.value, local: true }]
}

function defaultImagePromptChatMessages() {
  return [{ role: 'assistant', content: IMAGE_PROMPT_CHAT_WELCOME.value, local: true }]
}

function loadImageChatMessagesFromStorage(prefix: string, episodeId: number) {
  if (!episodeId || typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${prefix}${episodeId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return null
    return parsed.filter(
      (m: { role?: string; content?: string }) =>
        (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string',
    )
  } catch {
    return null
  }
}

function saveImageChatMessagesToStorage(
  prefix: string,
  episodeId: number,
  messages: Array<{ role: string; content?: string; thinking?: string; local?: boolean }>,
) {
  if (!episodeId || typeof sessionStorage === 'undefined') return
  try {
    const cleaned = messages.filter(m => {
      if (m.local) return false
      if (m.role === 'assistant' && !String(m.content || '').trim() && !String(m.thinking || '').trim()) return false
      return true
    })
    const key = `${prefix}${episodeId}`
    if (!cleaned.length) {
      sessionStorage.removeItem(key)
      return
    }
    sessionStorage.setItem(key, JSON.stringify(cleaned.map(({ role, content, thinking }) => ({ role, content, ...(thinking ? { thinking } : {}) }))))
  } catch { /* ignore quota */ }
}

function restoreImageDetectChatForEpisode(episodeId: number) {
  const stored = loadImageChatMessagesFromStorage(IMAGE_DETECT_CHAT_STORAGE_PREFIX, episodeId)
  imageDetectChatMessages.value = stored?.length
    ? [...defaultImageDetectChatMessages(), ...stored]
    : defaultImageDetectChatMessages()
}

function restoreImagePromptChatForEpisode(episodeId: number) {
  const stored = loadImageChatMessagesFromStorage(IMAGE_PROMPT_CHAT_STORAGE_PREFIX, episodeId)
  imagePromptChatMessages.value = stored?.length
    ? [...defaultImagePromptChatMessages(), ...stored]
    : defaultImagePromptChatMessages()
}

const imageWorkflowChatTab = ref('detect')
const imageDetectChatMessages = ref(defaultImageDetectChatMessages())
const imageDetectChatInput = ref('')
const imageDetectChatGenerating = ref(false)
const imageDetectChatScrollRef = ref(null)
const imageDetectChatAbortController = ref(null)
const imageDetectChatQuickHints = [
  '开始检测配图',
  '更保守一些，减少配图张数',
  '片头和第一个场景切换处务必单独配图',
  '重新检测，合并同一场景的连续镜头',
]

const imagePromptChatMessages = ref(defaultImagePromptChatMessages())
const imagePromptChatInput = ref('')
const imagePromptChatGenerating = ref(false)
const imagePromptChatScrollRef = ref(null)
const imagePromptChatAbortController = ref(null)
const imagePromptChatQuickHints = [
  '开始生成全部配图文案',
  '补全缺失的配图文案',
  '整体画风更偏八十年代市井纪实',
  '第5段改成夜市全景，突出霓虹灯牌',
]

const STORYBOARD_CHAT_WELCOME = computed(() => usesComicStoryboardRules.value
  ? '我是旁白分镜助手。整稿按句拆镜、自动标注 ** 强调、片头单独处理；配图约 2～4 镜一图、按场景/动作换图（换人不强制换图），同图整段一种运镜。说「开始分镜」或点「执行拆镜」，可流式看到拆镜过程。'
  : '我是旁白分镜助手。整稿拆镜：按句分镜、自动标注 ** 强调、片头单独处理。说「开始分镜」或点「执行拆镜」，可流式看到拆镜过程；完成后可继续多轮讨论并重新分镜。')
const STORYBOARD_CHAT_STORAGE_PREFIX = 'huobao:narration-storyboard-chat:'

function defaultStoryboardChatMessages() {
  return [{ role: 'assistant', content: STORYBOARD_CHAT_WELCOME.value, local: true }]
}

function restoreStoryboardChatForEpisode(episodeId: number) {
  const stored = loadImageChatMessagesFromStorage(STORYBOARD_CHAT_STORAGE_PREFIX, episodeId)
  storyboardChatMessages.value = stored?.length
    ? [...defaultStoryboardChatMessages(), ...stored]
    : defaultStoryboardChatMessages()
}

const storyboardChatMessages = ref(defaultStoryboardChatMessages())
const storyboardChatInput = ref('')
const storyboardChatGenerating = ref(false)
const storyboardChatScrollRef = ref(null)
const storyboardChatAbortController = ref(null)
const storyboardChatQuickHints = [
  '开始分镜',
  '片头按逗号拆成多镜',
  '长句尽量合并，不要超过 20 字一镜',
  '重新分镜，强调词再标明显一些',
]

const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')

function resolveEpisodeScriptDraft() {
  return (localScript.value || localRaw.value || scriptContent.value || rawContent.value || '').trim()
}

async function ensureEpisodeScriptPersisted() {
  const script = resolveEpisodeScriptDraft()
  if (!script) {
    throw new Error('请先在「原始内容」或「AI 改写」步骤填写剧本')
  }
  if (!epId.value) throw new Error('集信息加载中，请稍后重试')
  localScript.value = script
  localRaw.value = script
  await episodeAPI.update(epId.value, { content: script, script_content: script })
  episode.value.content = script
  episode.value.script_content = script
  return script
}

const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const hasEpisodeScriptDraft = computed(() => !!resolveEpisodeScriptDraft())
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const voiceSampleCount = computed(() => chars.value.filter(c => c.voice_sample_url || c.voiceSampleUrl).length)
const composableShots = computed(() => sbs.value.filter(sb => isComposeScopeStoryboard(sb, sbs.value)))
const composeUnitGroups = computed(() => buildComposeUnitGroups(sbs.value))
const composeUnitShots = computed(() => getComposeUnitLeaders(sbs.value, composeUnitGroups.value))
const composableCount = computed(() => composeUnitShots.value.length)
const composedCount = computed(() =>
  composeUnitShots.value.filter(sb => hasComposedStoryboard(sb, sbs.value, composeUnitGroups.value)).length,
)
const bodyShots = computed(() => sbs.value.filter(sb => !isNarrationTitleShot(sb)))
const bodyComposedCount = computed(() => composedCount.value)
const bodyComposableCount = computed(() => composableCount.value)
const canMergeBody = computed(() =>
  composableCount.value > 0 && composedCount.value === composableCount.value,
)
const mergeUrl = computed(() => {
  if (mergeData.value?.status !== 'completed') return null
  return mergeData.value?.merged_url || mergeData.value?.mergedUrl || null
})
const mergeFailed = computed(() => mergeData.value?.status === 'failed')
const mergeFailedMessage = computed(() =>
  mergeData.value?.error_msg || mergeData.value?.errorMsg || '拼接失败，请重试',
)
const previousMergeUrl = computed(() =>
  mergeData.value?.previous_merged_url || mergeData.value?.previousMergedUrl || null,
)
const mergeProcessing = computed(() => ['processing', 'pending'].includes(mergeData.value?.status))
const mergeTestClipLimit = ref(3)
const pendingMergeKind = ref(null)
const testMergeBlock = computed(() => mergeData.value?.test || null)
const testMergeUrl = computed(() => {
  if (testMergeBlock.value?.status !== 'completed') return null
  return testMergeBlock.value.merged_url || testMergeBlock.value.mergedUrl || null
})
const testMergeProcessing = computed(() => ['processing', 'pending'].includes(testMergeBlock.value?.status))
const testMergeFailed = computed(() => testMergeBlock.value?.status === 'failed')
const testMergeFailedMessage = computed(() =>
  testMergeBlock.value?.error_msg || testMergeBlock.value?.errorMsg || '测试导出失败',
)
const testMergeProgressPercent = computed(() => {
  const p = testMergeBlock.value?.progress_percent ?? testMergeBlock.value?.progressPercent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const testMergeProgressMessage = computed(() =>
  testMergeBlock.value?.progress_message || testMergeBlock.value?.progressMessage || '正在测试拼接…',
)
const testExportActive = computed(() =>
  pendingMergeKind.value === 'test' && (testMergeProcessing.value || batchRunning.value.has('compose')),
)
const composeProcessing = computed(() =>
  isBatchRunning('compose') || composeProcessingCount.value > 0,
)
const anyMergeProcessing = computed(() => mergeProcessing.value || testMergeProcessing.value || testExportActive.value)
const mergeProgressPercent = computed(() => {
  const p = mergeData.value?.progress_percent ?? mergeData.value?.progressPercent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const mergeProgressMessage = computed(() =>
  mergeData.value?.progress_message || mergeData.value?.progressMessage || '正在拼接镜头…',
)
const narrationImageBreakdownProgressPercent = computed(() => {
  const p = narrationImageBreakdownProgress.value?.percent
  return typeof p === 'number' ? Math.min(100, Math.max(0, Math.round(p))) : 0
})
const narrationImageBreakdownProgressMessage = computed(() => {
  const progress = narrationImageBreakdownProgress.value
  if (!progress) return '正在启动配图分镜…'
  if (progress.status === 'failed' || progress.status === 'cancelled') {
    return progress.message || progress.error || '配图任务失败'
  }
  // 后端 message 已含「已完成 x/y、进行中 z 路」，优先原样展示
  if (progress.message) return progress.message
  const done = progress.batches_done ?? progress.batch
  const active = progress.batches_active
  const batchCount = progress.batch_count ?? progress.batchCount
  const concurrency = progress.concurrency
  if (done != null && batchCount && (progress.phase === 'prompts' || progress.phase === 'detecting')) {
    if (progress.phase === 'detecting') {
      return `正在检测换镜（已完成 ${done}/${batchCount} 批）…`
    }
    if (active != null && concurrency != null) {
      return `配图文案：已完成 ${done}/${batchCount} 批，进行中 ${active} 路（并发 ${concurrency}）…`
    }
    return `正在生成配图文案（已完成 ${done}/${batchCount} 批）…`
  }
  return '配图分镜进行中…'
})
const narrationImageBreakdownModalOpen = ref(false)
const narrationShotImageModalOpen = ref(false)
const narrationShotImageModalTitle = computed(() => {
  if (narrationShotImageModalFailed.value) return '配图生成失败'
  if (narrationShotImageModalDone.value) return '配图生成完成'
  const model = String(episodeImageModel.value || '').toLowerCase()
  if (model.includes('q4')) return '正在生成配图 · Qwen Q4'
  if (model.includes('q3') || model.includes('qwen')) return '正在生成配图 · Qwen Q3'
  return '正在生成配图'
})
const narrationShotImageModalJobs = computed(() =>
  Object.values(narrationShotImageJobs.value || {}).filter(Boolean) as Array<{
    status?: string
    percent?: number
    message?: string
    error?: string
  }>,
)
const narrationShotImageModalProcessing = computed(() =>
  pendingNarrationShotIds.value.length > 0
  || narrationShotImageModalJobs.value.some(j => j.status === 'processing' || j.status === 'submitting'),
)
const narrationShotImageModalDone = computed(() => {
  if (narrationShotImageModalProcessing.value) return false
  return narrationShotImageModalJobs.value.some(j => j.status === 'completed')
    && !narrationShotImageModalJobs.value.some(j => j.status === 'failed')
})
const narrationShotImageModalFailed = computed(() => {
  if (narrationShotImageModalProcessing.value) return false
  return narrationShotImageModalJobs.value.some(j => j.status === 'failed')
})
const narrationShotImageModalPercent = computed(() => {
  const jobs = narrationShotImageModalJobs.value
  if (!jobs.length) return pendingNarrationShotIds.value.length ? 8 : 0
  const sum = jobs.reduce((acc, j) => acc + (Number(j.percent) || 0), 0)
  return Math.min(100, Math.max(0, Math.round(sum / jobs.length)))
})
const narrationShotImageModalSummary = computed(() => {
  const pending = pendingNarrationShotIds.value.length
  const jobs = narrationShotImageModalJobs.value
  const failed = jobs.filter(j => j.status === 'failed')
  const completed = jobs.filter(j => j.status === 'completed')
  if (failed.length && !narrationShotImageModalProcessing.value) {
    return failed[0]?.error || failed[0]?.message || '生成失败，请检查 ComfyUI / 模型权重'
  }
  if (narrationShotImageModalDone.value) {
    return completed.length > 1 ? `已完成 ${completed.length} 张配图` : '配图已写入镜头，可关闭此窗口'
  }
  const latest = [...jobs].reverse().find(j => j.message)?.message || 'ComfyUI 生图中…'
  const model = String(episodeImageModel.value || '')
  const modelHint = model.includes('q4')
    ? 'Q4_K_M'
    : (model.includes('q3') || model.includes('qwen') ? 'Q3_K_M' : (model || 'ComfyUI'))
  return pending > 1
    ? `${modelHint} · ${latest}（进行中 ${pending}）`
    : `${modelHint} · ${latest}`
})
function openNarrationShotImageProgressModal() {
  narrationShotImageModalOpen.value = true
}
function closeNarrationShotImageProgressModal() {
  narrationShotImageModalOpen.value = false
  // 关掉弹窗后再清掉已结束任务，避免进度条一闪而空
  const jobs = { ...narrationShotImageJobs.value }
  let changed = false
  for (const [id, job] of Object.entries(jobs)) {
    const status = String((job as any)?.status || '')
    if (status === 'completed' || status === 'failed') {
      delete jobs[id]
      changed = true
    }
  }
  if (changed) narrationShotImageJobs.value = jobs
}

const narrationImageBreakdownModalTitle = computed(() => {
  const progress = narrationImageBreakdownProgress.value
  const phase = progress?.phase
  const status = progress?.status
  if (status === 'completed') {
    return phase === 'detecting' ? '配图检测完成' : '配图文案生成完成'
  }
  if (status === 'failed' || status === 'cancelled') {
    return phase === 'detecting' ? '配图检测失败' : '配图文案生成失败'
  }
  return phase === 'detecting' ? '正在检测换镜配图' : '正在生成配图文案'
})
const narrationImageBreakdownModalProcessing = computed(() => {
  const status = narrationImageBreakdownProgress.value?.status
  return status === 'processing' || (!status && narrationImageBreaking.value)
})
const narrationImageBreakdownModalDone = computed(() =>
  narrationImageBreakdownProgress.value?.status === 'completed',
)
const narrationImageBreakdownModalFailed = computed(() => {
  const status = narrationImageBreakdownProgress.value?.status
  return status === 'failed' || status === 'cancelled'
})
const narrationImageBreakdownModalBatchLabel = computed(() => {
  const progress = narrationImageBreakdownProgress.value
  const done = progress?.batches_done ?? progress?.batch
  const active = progress?.batches_active
  const batchCount = progress?.batch_count ?? progress?.batchCount
  const concurrency = progress?.concurrency
  if (done == null || !batchCount) return ''
  if (progress?.phase === 'prompts' && (active != null || concurrency != null)) {
    return `已完成 ${done}/${batchCount} · 进行中 ${active ?? 0}${concurrency != null ? `/${concurrency}` : ''}`
  }
  return `已完成 ${done} / ${batchCount} 批`
})
const narrationImageBreakdownModalSummary = computed(() => {
  const progress = narrationImageBreakdownProgress.value
  if (narrationImageBreakdownModalFailed.value) {
    return progress?.message || progress?.error || '任务失败，请查看错误信息后重试'
  }
  if (narrationImageBreakdownModalDone.value) {
    if (progress?.phase === 'detecting') {
      const count = narrationDetectDisplayCount.value || progress?.paragraph_count
      return count ? `共 ${count} 张镜头需配图` : (progress?.message || '检测完成')
    }
    const total = narrationDetectDisplayCount.value
    const done = narrationPromptDisplayCount.value
    const missing = narrationMissingPromptCount.value
    if (missing > 0) return `已生成 ${done}/${total} 条，仍有 ${missing} 段可点「补全缺失」`
    return total ? `全部 ${done}/${total} 条配图文案已就绪` : `共 ${done} 条配图文案已就绪`
  }
  return narrationImageBreakdownProgressMessage.value
})
function openNarrationImageBreakdownModal(phase: 'detecting' | 'prompts') {
  narrationImageBreakdownModalOpen.value = true
  if (!narrationImageBreakdownProgress.value || narrationImageBreakdownProgress.value.status !== 'processing') {
    narrationImageBreakdownProgress.value = {
      status: 'processing',
      phase,
      message: phase === 'detecting' ? '正在检测换镜配图…' : '正在生成配图文案…',
      percent: 1,
    }
  }
}
function closeNarrationImageBreakdownModal() {
  narrationImageBreakdownModalOpen.value = false
}
async function cancelNarrationImageBreakdown() {
  if (!epId.value) return
  try {
    await episodeAPI.cancelNarrationImageBreakdown(epId.value)
    imageDetectChatAbortController.value?.abort()
    imagePromptChatAbortController.value?.abort()
  } catch (e: any) {
    toast.error(e?.message || '取消失败')
  }
}
let mergePollTimer = null
let composePollTimer = null
let composePollAborted = false
let narrationImageBreakdownPollTimer = null
const mergeVideoSrc = computed(() => {
  if (!mergeUrl.value) return ''
  const v = mergeData.value?.id || mergeData.value?.completed_at || mergeData.value?.completedAt || Date.now()
  return `/${mergeUrl.value}?v=${encodeURIComponent(String(v))}`
})
const testMergeVideoSrc = computed(() => {
  if (!testMergeUrl.value) return ''
  const v = testMergeBlock.value?.id || testMergeBlock.value?.completed_at || testMergeBlock.value?.completedAt || Date.now()
  return `/${testMergeUrl.value}?v=${encodeURIComponent(String(v))}`
})
const testMergeClipCount = computed(() => {
  const raw = testMergeBlock.value?.scenes
  if (raw && typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.clips)) return parsed.clips.length
      if (Array.isArray(parsed)) return parsed.length
    } catch {}
  }
  return normalizedMergeTestClipLimit()
})
const mergeHasOpening = computed(() => {
  const raw = mergeData.value?.scenes
  if (!raw || typeof raw !== 'string') return false
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed.with_opening === true || parsed.withOpening === true)
  } catch {
    return false
  }
})
const mergeHasTitle = computed(() => {
  const raw = mergeData.value?.scenes
  if (!raw || typeof raw !== 'string') return false
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed.with_title === true || parsed.withTitle === true)
  } catch {
    return false
  }
})

const illustrationImageCount = computed(() => {
  const urls = new Set()
  for (const sb of sbs.value) {
    const img = sb.composed_image || sb.composedImage || sb.first_frame_image || sb.firstFrameImage
    if (img) urls.add(img)
  }
  return urls.size
})
const openingVideoUrl = computed(() => episode.value?.opening_video_url || episode.value?.openingVideoUrl || null)
const openingVideoError = computed(() => episode.value?.opening_video_error || episode.value?.openingVideoError || '')
const openingPickedImages = computed(() => {
  const raw = episode.value?.opening_picked_images ?? episode.value?.openingPickedImages
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
})
const canDownloadOpeningImages = computed(() => openingPickedImages.value.length > 0)
const openingPickedImagesZipSrc = computed(() =>
  epId.value && canDownloadOpeningImages.value
    ? episodeAPI.openingPickedImagesZipUrl(epId.value)
    : '',
)
const titleVideoUrl = computed(() => episode.value?.title_video_url || episode.value?.titleVideoUrl || null)
const titleVideoError = computed(() => episode.value?.title_video_error || episode.value?.titleVideoError || '')
const titleShots = computed(() => sbs.value.filter(sb => isNarrationTitleShot(sb)))
const titleShotsReady = computed(() => {
  if (!titleShots.value.length) return false
  return titleShots.value.every(sb =>
    hasDialogue(sb)
    && hasNarrationShotOwnTts(sb)
    && !!getStoryboardCover(sb),
  )
})
const openingAudioUrl = computed(() => episode.value?.opening_audio_url || episode.value?.openingAudioUrl || '')
const openingAudioSrc = computed(() => openingAudioUrl.value ? `/${openingAudioUrl.value.replace(/^\//, '')}` : '')
const OPENING_SUBTITLE_DEFAULT = '体验365个人生副本'
const OPENING_SUBTITLE_LEGACY = '今天要体验的人生是'
function resolveOpeningSubtitleText(stored) {
  const trimmed = String(stored || '').trim()
  const fallback = isMotionComicMode.value
    ? (drama.value?.title?.trim() || episode.value?.title?.trim() || '本期故事')
    : OPENING_SUBTITLE_DEFAULT
  if (!trimmed || trimmed === OPENING_SUBTITLE_LEGACY) return fallback
  return trimmed
}
const openingSubtitleText = ref(OPENING_SUBTITLE_DEFAULT)
const openingAudioUploading = ref(false)
const openingAudioGenerating = ref(false)
const openingVideoProcessing = ref(false)
const openingPickedImagesExporting = ref(false)
const DEFAULT_OPENING_IMAGE_COUNT = 20
const openingPickCountOptions = [
  { label: '5 张', value: 5 },
  { label: '10 张', value: 10 },
  { label: '15 张', value: 15 },
  { label: '20 张（默认）', value: 20 },
  { label: '30 张', value: 30 },
  { label: '40 张', value: 40 },
  { label: '50 张', value: 50 },
]
const openingPickCount = ref(DEFAULT_OPENING_IMAGE_COUNT)
const titleVideoProcessing = ref(false)
let openingPollTimer = null
const openingVideoSrc = computed(() => {
  if (!openingVideoUrl.value) return ''
  const v = openingVideoUrl.value.split('/').pop() || episode.value?.updated_at || episode.value?.updatedAt || Date.now()
  return `/${openingVideoUrl.value}?v=${encodeURIComponent(String(v))}`
})
const titleVideoSrc = computed(() => {
  if (!titleVideoUrl.value) return ''
  const v = titleVideoUrl.value.split('/').pop() || episode.value?.updated_at || episode.value?.updatedAt || Date.now()
  return `/${titleVideoUrl.value}?v=${encodeURIComponent(String(v))}`
})

const scriptStep = ref(0)
const prodTab = ref('chars')
const exportTab = ref('merge')
const bgmLibrary = ref([])
const bgmGenerating = ref(false)
const bgmUploading = ref(false)
const bgmUploadInput = ref(null)
const narrationAssetClearing = ref(false)
const fluxPromptTranslating = ref(false)
const fluxPromptTranslatingShotIds = ref([])
const fluxPromptClearing = ref(false)
const fluxPromptTranslateProgress = ref({ done: 0, total: 0, status: 'idle', currentNo: null as number | null })
const storyboardClearing = ref(false)
const narrationCropWatermarkProcessing = ref(false)
const narrationRestoreWatermarkProcessing = ref(false)
const shotImageUploadProcessing = ref(false)
const shotImageUploadProgress = ref({ done: 0, total: 0 })
const bgmDescGenerating = ref(false)
const bgmDesc = ref('')
const bgmTargetSbId = ref(null)
const bgmModel = ref(DEFAULT_BGM_MODEL)
const musicConfigs = ref([])
let bgmPollTimer = null
let bgmPollTick = 0
const bgmAppliedCount = computed(() => sbs.value.filter(s => s.bgm_audio_url || s.bgmAudioUrl).length)
const bgmCompletedCount = computed(() => bgmLibrary.value.filter(m => m.status === 'completed').length)
const bgmPendingCount = computed(() => bgmLibrary.value.filter(m => ['pending', 'processing'].includes(m.status)).length)
const exportMixBgm = ref(false)
const exportWatermarkText = ref('顺拾人间')
const exportWatermarkAnimated = ref(false)
let watermarkSaveTimer = null
const exportBgmMusicId = ref(null)
const exportBgmVolume = ref(6)
const exportBgmApplying = ref(false)
const bgmApplyingAllId = ref(null)
const visibleBgmLibrary = computed(() => {
  const items = bgmLibrary.value.filter(m => m.status !== 'deleted')
  const completedTaskIds = new Set(
    items.filter(m => m.status === 'completed' && (m.task_id || m.taskId)).map(m => String(m.task_id || m.taskId)),
  )
  return items
    .filter(m => !(m.status === 'processing' && (m.task_id || m.taskId) && completedTaskIds.has(String(m.task_id || m.taskId))))
    .sort((a, b) => {
      const rank = s => s.status === 'completed' ? 0 : s.status === 'processing' ? 1 : 2
      const diff = rank(a.status) - rank(b.status)
      return diff !== 0 ? diff : Number(b.id || 0) - Number(a.id || 0)
    })
})
const exportBgmOptions = computed(() =>
  visibleBgmLibrary.value
    .filter(m => m.status === 'completed' && (m.local_path || m.localPath))
    .map(m => {
      const fromOtherEpisode = m.episode_id && epId.value && m.episode_id !== epId.value
      return {
        value: m.id,
        label: `${m.title || 'BGM'} #${m.id}${fromOtherEpisode ? ' · 其他集' : ''}`,
      }
    }),
)
const exportBgmPreviewUrl = computed(() => {
  if (!exportBgmMusicId.value) return ''
  const item = bgmLibrary.value.find(m => m.id === exportBgmMusicId.value)
  const path = item?.local_path || item?.localPath
  return path ? `/${path}` : ''
})
const bgmModelOptions = computed(() => {
  const models = new Map(BGM_MODEL_OPTIONS.map(o => [o.value, o.label]))
  for (const cfg of musicConfigs.value) {
    const m = cfg.model
    if (Array.isArray(m)) m.forEach(x => { if (!models.has(x)) models.set(x, x) })
    else if (m && !models.has(m)) models.set(m, m)
  }
  return [...models.entries()].map(([value, label]) => ({ value, label }))
})
const prodTabIdx = computed({
  get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
  set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'chars' },
})
const frameMode = ref('first')
const fallbackVoiceProfiles = [
  { id: 'alloy', label: 'Alloy', gender: '中性', traits: '平衡、自然、克制', suitable: '通用叙述、旁白、需要稳定输出的角色' },
  { id: 'echo', label: 'Echo', gender: '男声', traits: '低沉、稳重、冷静', suitable: '成熟男性、父辈、旁白、压迫感角色' },
  { id: 'fable', label: 'Fable', gender: '男声', traits: '温暖、讲述感、表现力强', suitable: '男主、成长型角色、叙事担当' },
  { id: 'onyx', label: 'Onyx', gender: '男声', traits: '深沉、有力、权威', suitable: '反派、强势角色、掌控型人物' },
  { id: 'nova', label: 'Nova', gender: '女声', traits: '温柔、甜润、亲和', suitable: '女主、母亲、柔和配角' },
  { id: 'shimmer', label: 'Shimmer', gender: '女声', traits: '明亮、活泼、年轻', suitable: '少女、轻快角色、跳脱配角' },
]
const voiceProfiles = ref(fallbackVoiceProfiles)
const localCastVoiceProfiles = ref([])
const localCastVoiceSelectOptions = computed(() => {
  const gptsovits = localCastVoiceProfiles.value.filter(v => v.source === 'gptsovits')
  const kokoro = localCastVoiceProfiles.value.filter(v => v.source === 'kokoro')
  const cloned = localCastVoiceProfiles.value.filter(v => v.source === 'cloned')
  const edge = localCastVoiceProfiles.value.filter(v => v.source === 'edge')
  const suffix = (v) => {
    if (v.source === 'gptsovits') return ' · GPT-SoVITS 克隆'
    if (v.source === 'kokoro') return ' · Kokoro'
    if (v.source === 'cloned') return ' · 克隆'
    return ' · Edge'
  }
  const mapOption = (v) => ({
    label: `${v.gender ? `[${v.gender}] ` : ''}${v.label}${suffix(v)}`,
    value: v.id,
  })
  return [
    ...(gptsovits.length ? [{ label: '── GPT-SoVITS 克隆 ──', value: '', disabled: true }] : []),
    ...gptsovits.map(mapOption),
    ...(kokoro.length ? [{ label: '── Kokoro ──', value: '', disabled: true }] : []),
    ...kokoro.map(mapOption),
    ...(cloned.length ? [{ label: '── Voicebox 克隆 ──', value: '', disabled: true }] : []),
    ...cloned.map(mapOption),
    ...(edge.length ? [{ label: '── Edge TTS ──', value: '', disabled: true }] : []),
    ...edge.map(mapOption),
  ]
})
const voiceSelectOptions = computed(() => voiceProfiles.value.map(v => ({ label: `${v.label} · ${v.traits}`, value: v.id })))
const scriptVoiceSelectOptions = computed(() => {
  if (!usesLocalModelPipeline.value) return voiceSelectOptions.value
  if (localCastVoiceProfiles.value.length) return localCastVoiceSelectOptions.value
  return edgeVoiceSelectOptions.value
})
const scriptVoiceProfiles = computed(() => {
  if (!usesLocalModelPipeline.value) return voiceProfiles.value
  return localCastVoiceProfiles.value.length ? localCastVoiceProfiles.value : edgeVoiceProfiles.value
})
const narratorVoiceSelectOptions = computed(() => {
  const api = voiceSelectOptions.value
  const cloned = localCastVoiceProfiles.value.filter(v => v.source === 'cloned')
  return [
    ...(api.length ? [{ label: '── API 音色 ──', value: '', disabled: true }] : []),
    ...api,
    ...(cloned.length ? [{ label: '── Voicebox 克隆 ──', value: '', disabled: true }] : []),
    ...cloned.map(v => ({
      label: `${v.gender ? `[${v.gender}] ` : ''}${v.label} · 克隆`,
      value: v.id,
    })),
  ]
})
const charVoicePreviewingId = ref(null)
const charVoicePreviewUrls = ref({})
const charVoicePreviewBump = ref(0)
const localVoiceAssigning = ref(false)
function buildGsvVoiceSelectOptions(profiles = edgeVoiceProfiles.value) {
  return profiles.map(v => ({
    label: v.suitable ? `${v.label} · ${v.suitable}` : v.label,
    value: v.id,
  }))
}

function localTtsVoicePlaceholder() {
  if (localTtsEngine.value === 'indextts') return '选择 IndexTTS2 克隆音色（GPT-SoVITS 库）'
  if (localTtsEngine.value === 'gptsovits') return '选择 GPT-SoVITS 克隆音色'
  if (localTtsEngine.value === 'voicebox') return '选择 Voicebox 音色'
  if (localTtsEngine.value === 'edge') return '选择微软 Edge TTS 音色'
  return '选择本地音色'
}

function localTtsEngineReady() {
  if (localTtsEngine.value === 'indextts') return indexttsAvailable.value
  if (localTtsEngine.value === 'gptsovits') return gptsovitsAvailable.value
  if (localTtsEngine.value === 'voicebox') return voiceboxAvailable.value
  return true
}

const edgeVoiceSelectOptions = computed(() => buildGsvVoiceSelectOptions(edgeVoiceProfiles.value))

function resolveLocalTtsEnginePayload() {
  const engine = localTtsEngine.value
  if (engine === 'voicebox' || engine === 'gptsovits' || engine === 'indextts') return engine
  return 'edge'
}

function localTtsEngineDisplayName() {
  if (localTtsEngine.value === 'indextts') return 'IndexTTS2'
  if (localTtsEngine.value === 'gptsovits') return 'GPT-SoVITS'
  if (localTtsEngine.value === 'voicebox') return 'Voicebox'
  return 'Edge'
}

function buildLocalTtsPreviewPayload(textOverride) {
  const text = String(textOverride || '').trim() || LOCAL_TTS_PREVIEW_DEFAULT
  const payload = {
    local_tts_engine: resolveLocalTtsEnginePayload(),
    local_voice: localEdgeVoiceId.value,
    tts_speed: localTtsSpeed.value,
    text,
  }
  if (ttsEngineSupportsEmotionInstruct(localTtsEngine.value)) {
    const instruct = resolveVoiceboxInstructText()
    if (instruct) payload.voicebox_instruct = instruct
  }
  if (localTtsEngine.value === 'voicebox') {
    payload.voicebox_model_size = localVoiceboxModelSize.value
  }
  return payload
}

function selectedVoiceboxVoiceReady() {
  if (localTtsEngine.value !== 'voicebox') return true
  const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
  return row?.modelReady !== false
}

async function previewLocalTtsVoice(textOverride) {
  if (!localEdgeVoiceId.value) {
    toast.warning(localTtsVoicePlaceholder())
    return
  }
  if (localTtsEngine.value === 'voicebox' && !voiceboxAvailable.value) {
    toast.warning('Voicebox 未运行，请先启动 Voicebox')
    return
  }
  if (localTtsEngine.value === 'gptsovits' && !gptsovitsAvailable.value) {
    toast.warning('GPT-SoVITS 未运行，请先启动 api_v2.py（默认端口 9880）')
    return
  }
  if (localTtsEngine.value === 'indextts' && !indexttsAvailable.value) {
    toast.warning('IndexTTS2 未就绪，请运行 scripts/setup-index-tts.ps1')
    return
  }
  if (!selectedVoiceboxVoiceReady()) {
    const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
    toast.warning(row?.modelHint || '该预设音色所需模型尚未下载完成，请先在 Voicebox → Models 中下载，或改用克隆音色「111」')
    return
  }
  try {
    if (usesLocalModelPipeline.value) await ensureLocalModelForTask('audio')
    localTtsPreviewing.value = true
    const res = await voicesAPI.previewLocal(buildLocalTtsPreviewPayload(textOverride))
    const path = res?.audio_url || res?.audioUrl
    if (!path) throw new Error('试听生成失败')
    localTtsPreviewUrl.value = path
    localTtsPreviewBump.value = Date.now()
    toast.success('试听已生成，可直接播放')
  } catch (e) {
    toast.error(e.message)
  } finally {
    localTtsPreviewing.value = false
  }
}

function buildCustomTtsPayload(text) {
  const trimmed = String(text || '').trim()
  if (customTtsUsesLocal.value) {
    return buildLocalTtsPreviewPayload(trimmed)
  }
  return {
    local_tts: false,
    text: trimmed,
    voice_id: customTtsVoiceId.value || narratorChar.value?.voice_style || narratorChar.value?.voiceStyle || 'alloy',
    config_id: lockedAudioConfigId.value,
    tts_speed: localTtsSpeed.value,
  }
}

async function generateCustomTts() {
  const text = customTtsText.value.trim()
  if (!text) {
    toast.warning('请先输入文案')
    return
  }
  if (customTtsUsesLocal.value) {
    if (!localEdgeVoiceId.value) {
      toast.warning(localTtsEngine.value === 'voicebox' ? '请选择 Voicebox 音色' : '请选择本地音色')
      return
    }
    if (localTtsEngine.value === 'voicebox' && !voiceboxAvailable.value) {
      toast.warning('Voicebox 未运行，请先启动 Voicebox')
      return
    }
    if (!selectedVoiceboxVoiceReady()) {
      const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
      toast.warning(row?.modelHint || '该预设音色所需模型尚未下载完成')
      return
    }
  } else if (!lockedAudioConfigId.value) {
    toast.warning('请先在设置中配置音频 API')
    return
  } else if (!customTtsVoiceId.value) {
    toast.warning('请选择音色')
    return
  }

  try {
    customTtsGenerating.value = true
    const res = await voicesAPI.previewTts(buildCustomTtsPayload(text))
    const path = res?.audio_url || res?.audioUrl
    if (!path) throw new Error('配音生成失败')
    customTtsAudioUrl.value = path
    customTtsPreviewBump.value = Date.now()
    toast.success('配音已生成，可播放或下载')
  } catch (e) {
    toast.error(e.message)
  } finally {
    customTtsGenerating.value = false
  }
}

function ttsGenerateOptions(force = false, sb = null) {
  const opts = {}
  if (force) opts.force = true
  if (isLocalComicMode.value) {
    opts.local_tts = true
    opts.local_tts_engine = resolveActiveLocalTtsEngine()
    opts.async = false
    opts.use_speaker_voice = true
    opts.tts_speed = localTtsSpeed.value
    if (ttsEngineSupportsEmotionInstruct(localTtsEngine.value)) {
      const instruct = resolveVoiceboxInstructText()
      if (instruct) opts.voicebox_instruct = instruct
    }
    if (localTtsEngine.value === 'voicebox') {
      opts.voicebox_model_size = localVoiceboxModelSize.value
    }
    return opts
  }
  if (isNarrationMode.value && localTtsEnabled.value !== false) {
    opts.local_tts = true
    opts.local_tts_engine = resolveActiveLocalTtsEngine()
    opts.async = false
    if (isMotionComicMode.value || isDialoguePortraitMode.value) {
      opts.use_speaker_voice = true
    } else if (localEdgeVoiceId.value) {
      opts.local_voice = localEdgeVoiceId.value
    }
    opts.tts_speed = localTtsSpeed.value
    if (ttsEngineSupportsEmotionInstruct(localTtsEngine.value)) {
      const instruct = resolveVoiceboxInstructText()
      if (instruct) opts.voicebox_instruct = instruct
    }
    if (localTtsEngine.value === 'voicebox') {
      opts.voicebox_model_size = localVoiceboxModelSize.value
    }
  } else if (!isNarrationMode.value) {
    opts.async = true
  } else {
    opts.local_tts = false
    opts.async = true
  }
  return opts
}

async function ensureLocalTtsEngineForBatch() {
  if (isLocalComicMode.value || (isNarrationMode.value && localTtsEnabled.value !== false)) {
    await refreshLocalModelStatus()
    if (localTtsEngine.value === 'indextts' && !indexttsAvailable.value) {
      if (gptsovitsAvailable.value) {
        localTtsEngine.value = 'gptsovits'
        persistLocalTtsPrefs()
        toast.warning('IndexTTS2 未就绪，已自动改用 GPT-SoVITS')
      } else if (voiceboxAvailable.value) {
        localTtsEngine.value = 'voicebox'
        persistLocalTtsPrefs()
        toast.warning('IndexTTS2 未就绪，已自动改用 Voicebox')
      } else {
        localTtsEngine.value = 'edge'
        persistLocalTtsPrefs()
        await refreshLocalVoices()
        toast.warning('IndexTTS2 未就绪，已自动改用 Edge TTS')
      }
    }
    if (localTtsEngine.value === 'gptsovits' && !gptsovitsAvailable.value) {
      if (voiceboxAvailable.value) {
        localTtsEngine.value = 'voicebox'
        persistLocalTtsPrefs()
        toast.warning('GPT-SoVITS 未运行，已自动改用 Voicebox')
      } else {
        localTtsEngine.value = 'edge'
        persistLocalTtsPrefs()
        await refreshLocalVoices()
        toast.warning('GPT-SoVITS 未运行，已自动改用 Edge TTS')
      }
    }
    if (localTtsEngine.value === 'voicebox') {
      await loadVoiceboxVoices()
      if (!voiceboxAvailable.value && edgeVoiceProfiles.value.length) {
        localTtsEngine.value = 'edge'
        persistLocalTtsPrefs()
        toast.warning('Voicebox 未响应，已自动改用 Edge TTS')
      }
    }
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('audio', { ttsEngine: resolveActiveLocalTtsEngine() })
    }
    return
  }
  if (!isNarrationMode.value || localTtsEnabled.value === false) return
  if (localTtsEngine.value === 'voicebox') {
    await loadVoiceboxVoices()
    if (voiceboxAvailable.value) return
    localTtsEngine.value = 'edge'
    persistLocalTtsPrefs()
    await refreshLocalVoices()
    toast.warning('Voicebox 未响应，已自动改用 Edge TTS 继续生成（按角色性别匹配音色）')
    return
  }
  if (localTtsEngine.value === 'gptsovits') {
    await loadGptSovitsVoices()
    if (gptsovitsAvailable.value) return
    if (indexttsAvailable.value) {
      localTtsEngine.value = 'indextts'
      persistLocalTtsPrefs()
      await refreshLocalVoices()
      toast.warning('GPT-SoVITS 未响应，已自动改用 IndexTTS2')
      return
    }
    localTtsEngine.value = 'edge'
    persistLocalTtsPrefs()
    await refreshLocalVoices()
    toast.warning('GPT-SoVITS 未响应，已自动改用 Edge TTS 继续生成')
    return
  }
  if (localTtsEngine.value === 'indextts') {
    await loadGptSovitsVoices()
    if (indexttsAvailable.value) return
    if (gptsovitsAvailable.value) {
      localTtsEngine.value = 'gptsovits'
      persistLocalTtsPrefs()
      await refreshLocalVoices()
      toast.warning('IndexTTS2 未响应，已自动改用 GPT-SoVITS')
      return
    }
    localTtsEngine.value = 'edge'
    persistLocalTtsPrefs()
    await refreshLocalVoices()
    toast.warning('IndexTTS2 未响应，已自动改用 Edge TTS 继续生成')
  }
}

function persistOpeningPickPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  window.localStorage.setItem(`episode-${epId.value}-opening-pick-count`, String(openingPickCount.value))
}

function restoreOpeningPickPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const stored = Number(window.localStorage.getItem(`episode-${epId.value}-opening-pick-count`))
  if (Number.isFinite(stored) && stored >= 2 && stored <= 100) openingPickCount.value = stored
}

function persistLocalTtsPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  window.localStorage.setItem(`episode-${epId.value}-local-tts`, localTtsEnabled.value ? '1' : '0')
  window.localStorage.setItem(`episode-${epId.value}-local-tts-engine`, localTtsEngine.value)
  window.localStorage.setItem(`episode-${epId.value}-local-voice`, localEdgeVoiceId.value)
  window.localStorage.setItem(`episode-${epId.value}-local-tts-speed`, String(localTtsSpeed.value))
  window.localStorage.setItem(`episode-${epId.value}-voicebox-instruct-preset`, localVoiceboxInstructPreset.value)
  window.localStorage.setItem(`episode-${epId.value}-voicebox-instruct-custom`, localVoiceboxInstructCustom.value)
  window.localStorage.setItem(`episode-${epId.value}-voicebox-model-size`, localVoiceboxModelSize.value)
}

function restoreLocalTtsPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const stored = window.localStorage.getItem(`episode-${epId.value}-local-tts`)
  localTtsEnabled.value = stored === null ? true : stored === '1'
  const engine = window.localStorage.getItem(`episode-${epId.value}-local-tts-engine`)
  if (engine === 'indextts' || engine === 'gptsovits' || engine === 'voicebox' || engine === 'edge') {
    localTtsEngine.value = engine
  } else {
    // null / 未知 → 默认 IndexTTS2
    localTtsEngine.value = DEFAULT_LOCAL_TTS_ENGINE
  }
  const voice = window.localStorage.getItem(`episode-${epId.value}-local-voice`)
  if (voice && !(localTtsEngine.value !== 'edge' && (/^zh-/i.test(voice) || voice === DEFAULT_LOCAL_EDGE_VOICE))) {
    localEdgeVoiceId.value = voice
  } else if (localTtsEngine.value === 'indextts' || localTtsEngine.value === 'gptsovits') {
    localEdgeVoiceId.value = DEFAULT_CLONED_VOICE_ID
  } else if (localTtsEngine.value === 'edge') {
    localEdgeVoiceId.value = DEFAULT_LOCAL_EDGE_VOICE
  }
  const speed = Number(window.localStorage.getItem(`episode-${epId.value}-local-tts-speed`))
  if (Number.isFinite(speed) && speed >= 0.5 && speed <= 2) localTtsSpeed.value = speed
  const instructPreset = window.localStorage.getItem(`episode-${epId.value}-voicebox-instruct-preset`)
  if (instructPreset !== null) {
    const known = voiceboxInstructOptions.value.some(o => o.value === instructPreset)
    localVoiceboxInstructPreset.value = known ? instructPreset : ''
  } else if (isMotionComicMode.value) {
    localVoiceboxInstructPreset.value = MOTION_COMIC_VOICEBOX_INSTRUCT_DEFAULT
  }
  const instructCustom = window.localStorage.getItem(`episode-${epId.value}-voicebox-instruct-custom`)
  if (instructCustom) localVoiceboxInstructCustom.value = instructCustom
  const modelSize = window.localStorage.getItem(`episode-${epId.value}-voicebox-model-size`)
  if (modelSize === '0.6B' || modelSize === '1.7B') localVoiceboxModelSize.value = modelSize
}

function persistExportBgmPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  window.localStorage.setItem(`episode-${epId.value}-export-mix-bgm`, exportMixBgm.value ? '1' : '0')
  window.localStorage.setItem(`episode-${epId.value}-export-watermark`, exportWatermarkText.value)
  window.localStorage.setItem(`episode-${epId.value}-export-watermark-animated`, exportWatermarkAnimated.value ? '1' : '0')
  window.localStorage.setItem(`drama-${dramaId}-export-bgm-id`, exportBgmMusicId.value ? String(exportBgmMusicId.value) : '')
  window.localStorage.setItem(`drama-${dramaId}-export-bgm-vol`, String(exportBgmVolume.value))
}

function restoreExportBgmPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const mix = window.localStorage.getItem(`episode-${epId.value}-export-mix-bgm`)
  exportMixBgm.value = mix === null ? false : mix === '1'
  const wm = window.localStorage.getItem(`episode-${epId.value}-export-watermark`)
  if (wm != null) exportWatermarkText.value = wm
  const wmAnim = window.localStorage.getItem(`episode-${epId.value}-export-watermark-animated`)
  if (wmAnim != null) exportWatermarkAnimated.value = wmAnim === '1'
  let id = window.localStorage.getItem(`drama-${dramaId}-export-bgm-id`)
  if (id == null) id = window.localStorage.getItem(`episode-${epId.value}-export-bgm-id`)
  exportBgmMusicId.value = id ? Number(id) : null
  let vol = window.localStorage.getItem(`drama-${dramaId}-export-bgm-vol`)
  if (vol == null) vol = window.localStorage.getItem(`episode-${epId.value}-export-bgm-vol`)
  if (vol) exportBgmVolume.value = Number(vol) || 6
}

function formatBgmModelLabel(model) {
  if (model === 'upload') return '用户上传'
  return bgmModelLabel(model)
}

function triggerBgmUpload() {
  const el = bgmUploadInput.value
  if (el) {
    el.value = ''
    el.click()
  }
}

async function onBgmFileSelected(event) {
  const file = event?.target?.files?.[0]
  if (!file) return
  bgmUploading.value = true
  try {
    const uploaded = await uploadAPI.audio(file)
    const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
    if (!path) throw new Error('上传失败，未返回文件路径')
    const result = await musicAPI.upload({
      drama_id: dramaId,
      episode_id: epId.value,
      path,
      title: file.name.replace(/\.[^.]+$/, '') || file.name,
    })
    const created = normalizeBgmLibraryRows([result?.item]).filter(Boolean)
    if (created.length) {
      bgmLibrary.value = mergeBgmLibraryRows(bgmLibrary.value, created)
    } else {
      await loadBgmLibrary({ resumePoll: false })
    }
    toast.success('BGM 已上传，可应用到镜头或整集成片')
  } catch (e) {
    toast.error(e.message || 'BGM 上传失败')
  } finally {
    bgmUploading.value = false
    if (event?.target) event.target.value = ''
  }
}

function syncExportWatermarkFromEpisode(ep) {
  if (!ep) return
  const fromEp = ep.watermark_text ?? ep.watermarkText
  if (fromEp != null && fromEp !== '') {
    exportWatermarkText.value = fromEp
  } else if (fromEp === '') {
    exportWatermarkText.value = ''
  } else {
    exportWatermarkText.value = '顺拾人间'
  }
  const anim = ep.watermark_animated ?? ep.watermarkAnimated
  exportWatermarkAnimated.value = anim === true || anim === 1 || anim === '1'
}

async function saveWatermarkText() {
  if (!epId.value) return
  persistExportBgmPrefs()
  try {
    await episodeAPI.update(epId.value, {
      watermark_text: exportWatermarkText.value.trim(),
      watermark_animated: exportWatermarkAnimated.value,
    })
    if (episode.value) {
      episode.value.watermark_text = exportWatermarkText.value.trim()
      episode.value.watermarkText = exportWatermarkText.value.trim()
      episode.value.watermark_animated = exportWatermarkAnimated.value
      episode.value.watermarkAnimated = exportWatermarkAnimated.value
    }
  } catch (e) {
    toast.error(e.message || '水印设置保存失败')
  }
}

function scheduleWatermarkSave() {
  if (watermarkSaveTimer) clearTimeout(watermarkSaveTimer)
  watermarkSaveTimer = setTimeout(() => { saveWatermarkText() }, 600)
}

function buildMergePayload(extra = {}) {
  const payload = {
    cancel_running: true,
    include_opening_video: false,
    ...extra,
  }
  const canMergeLevelBgm = exportMixBgm.value && exportBgmMusicId.value && bgmAppliedCount.value === 0
  if (canMergeLevelBgm) {
    payload.bgm_music_id = exportBgmMusicId.value
    payload.bgm_volume = Math.max(0.03, Math.min(0.25, exportBgmVolume.value / 100))
  }
  return payload
}

function normalizedMergeTestClipLimit() {
  return Math.max(1, Math.min(50, Number(mergeTestClipLimit.value) || 3))
}

function getTestMergeTargets(limit = normalizedMergeTestClipLimit()) {
  return composeUnitShots.value.slice(0, limit)
}

function isTestComposeUnitReady(sb) {
  if (hasVid(sb)) return true
  if (isDialoguePortraitMode.value) return hasComposeTts(sb) && hasDialogueForCompose(sb)
  if (isNarrationMode.value) return hasImg(sb) && hasComposeTts(sb) && hasDialogueForCompose(sb)
  return hasImg(sb)
}

function canTestMerge(limit = normalizedMergeTestClipLimit()) {
  const targets = getTestMergeTargets(limit)
  return targets.length > 0 && targets.every(sb => isTestComposeUnitReady(sb))
}

async function applyBgmToAllShots(musicId) {
  if (!musicId || !epId.value) return
  if (!sbs.value.length) {
    toast.error('暂无镜头')
    return
  }
  bgmApplyingAllId.value = musicId
  exportBgmApplying.value = true
  try {
    const res = await musicAPI.applyAll(musicId, epId.value)
    const count = res?.applied ?? sbs.value.length
    toast.success(`已应用到全部 ${count} 个镜头，请重新「镜头合成」后 BGM 才会进入各镜`)
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message)
  } finally {
    bgmApplyingAllId.value = null
    exportBgmApplying.value = false
  }
}

async function applyExportBgmToAllShots() {
  if (!exportBgmMusicId.value) {
    toast.error('请先选择 BGM')
    return
  }
  await applyBgmToAllShots(exportBgmMusicId.value)
}
const videoConfigSelectOptions = computed(() => videoConfigs.value.map(c => {
  let modelName = ''
  try { const m = JSON.parse(c.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = c.model || '' }
  const label = modelName ? `${modelName} (${c.provider})` : `${c.name} (${c.provider})`
  return { label, value: c.id }
}))
const frameModeOptions = [{ label: '仅首帧', value: 'first' }, { label: '首尾帧', value: 'first_last' }]
const gridLayoutOptions = [
  { label: '2x2', value: '2x2' },
  { label: '3x3', value: '3x3' },
  { label: '4x4', value: '4x4' },
  { label: '5x5', value: '5x5' },
]
const imageConfigs = ref([])
const videoConfigs = ref([])
const audioConfigs = ref([])
const pendingCharImageIds = ref([])
const charPortraitUseReferenceById = ref({})
const pendingCharRecognizeIds = ref([])
const pendingCharStyleValidateIds = ref([])
const charStyleValidateResult = ref({})
const pendingCharAppearanceIds = ref([])
const pendingSceneImageIds = ref([])
const pendingShotFrameKeys = ref([])
const pendingNarrationShotIds = ref([])
const narrationShotImageJobs = ref({})
const narrationShotImagePollers = new Set()
const pendingTtsShotIds = ref([])
const ttsBatchActive = ref(false)
const pendingShotScanIds = ref([])
const shotScanResult = ref({})
const shotImageValidatePanel = ref(null)
const pendingVideoIds = ref([])
const pendingComposeIds = ref([])
const PROD_SHOT_PAGE_SIZE = 24
const NARRATION_SHOT_PAGE_SIZE = 6
const SCRIPT_STORYBOARD_PAGE_SIZE = 24
const COMPOSE_LIST_PAGE_SIZE = 8
const VIDEO_LIST_PAGE_SIZE = 8
const DUBBING_LIST_PAGE_SIZE = 6
const composeListPage = ref(1)
const composeListFilter = ref('all')
const videosListPage = ref(1)
const videosListFilter = ref('all')
const dubbingListPage = ref(1)
const shotsListPage = ref(1)
const shotsListFilter = ref('all')
const scriptStoryboardPage = ref(1)
const composeVideoViewer = ref({ open: false, src: '', title: '' })
const batchRunning = ref(new Set())
const failedVideoMessages = ref({})
const videoProgressMessages = ref({})
const failedComposeMessages = ref({})
const imageViewer = ref({ open: false, src: '', title: '' })
const shotEditor = ref({
  open: false,
  sb: null,
  number: 0,
  isTitle: false,
  dialogue: '',
  description: '',
  title: '',
  duration: 10,
  shotType: '',
  busy: false,
})

function extractDialogueSpeaker(text) {
  const m = String(text || '').trim().match(/^(.+?)[:：]/)
  if (!m) return ''
  return m[1].replace(/[（(].+?[)）]/g, '').trim()
}

function stripDialogueSpeakerPrefix(text) {
  return String(text || '').replace(/^.+?[:：]\s*/, '').trim()
}

function normalizeNarrationDialogue(sb, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  if (/^[^:：]+[:：]/.test(trimmed)) return trimmed
  if (isNarrationTitleShot(sb)) return `剧中：${trimmed}`
  if (isMotionComicMode.value) {
    const prevSpeaker = extractDialogueSpeaker(sb?.dialogue)
    if (prevSpeaker && prevSpeaker !== '旁白' && prevSpeaker !== '剧中') {
      return `${prevSpeaker}：${trimmed}`
    }
  }
  return `旁白：${trimmed}`
}

const narrationEditDialogue = ref('')
const narrationEditDuration = ref(10)
const narrationEditAsTitle = ref(false)
const narrationEditBusy = ref(false)

/** 分镜/TTS：句末标点必拆；逗号/顿号/分号仅当相邻合计超过 16 字才拆 */
const STORYBOARD_STRONG_PUNCT_BOUNDARY_RE = /(?<=[。！？!?])\s*/
const STORYBOARD_WEAK_PUNCT_BOUNDARY_RE = /(?<=[，、；,;])\s*/
const STORYBOARD_COMMA_MERGE_MAX_CHARS = 16

function trimNarrationPart(s) {
  return s.replace(/^[，,、；;\s]+|[，,、；;\s]+$/g, '').trim()
}

function narrationCharCount(text) {
  return text.replace(/[\s，,、；;。！？!?]/g, '').length
}

function splitByPunctBoundary(chunk, boundaryRe) {
  const parts = chunk.split(boundaryRe).map(trimNarrationPart).filter(Boolean)
  return parts.length ? parts : [chunk.trim()]
}

function mergeWeakPunctParts(parts, maxChars = STORYBOARD_COMMA_MERGE_MAX_CHARS) {
  if (parts.length <= 1) return parts
  const merged = []
  let current = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i]
    if (narrationCharCount(current) + narrationCharCount(next) <= maxChars) {
      current = `${current}，${next}`
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)
  return merged
}

function splitNarrationChunkLocal(chunk) {
  const flat = chunk.replace(/\s+/g, ' ').trim()
  if (!flat) return []
  const strongParts = splitByPunctBoundary(flat, STORYBOARD_STRONG_PUNCT_BOUNDARY_RE)
  const result = []
  for (const strongPart of strongParts) {
    const weakParts = splitByPunctBoundary(strongPart, STORYBOARD_WEAK_PUNCT_BOUNDARY_RE)
    result.push(...(weakParts.length > 1 ? mergeWeakPunctParts(weakParts) : weakParts))
  }
  return result.length ? result : [flat]
}

function splitNarrationLines(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const lines = []
  for (const block of normalized.split(/\n+/)) {
    const flat = block.replace(/\s+/g, ' ').trim()
    if (!flat) continue
    lines.push(...splitNarrationChunkLocal(flat))
  }
  return lines
}

function estimateNarrationDurationLocal(sentence, isTitle = false) {
  const chars = sentence.replace(/\s/g, '').length
  if (isTitle) return Math.max(6, Math.min(12, Math.ceil(chars / 3.5)))
  return Math.max(3, Math.min(12, Math.ceil(chars / 4.5)))
}

function buildNarrationMetaForShot(options) {
  const {
    isTitle,
    inheritImage,
    titleFull,
    titleHook,
    baseMeta = {},
  } = options
  if (isTitle) {
    return JSON.stringify({
      narration_image_mode: inheritImage ? 'inherit' : 'new',
      narration_shot_type: 'title',
      narration_tts_mode: 'new',
      title_full: titleFull || baseMeta.title_full || undefined,
      title_hook: titleHook || baseMeta.title_hook || undefined,
    })
  }
  const meta = {
    narration_image_mode: inheritImage ? 'inherit' : 'new',
    narration_tts_mode: 'new',
  }
  if (baseMeta.paragraph_index != null) meta.paragraph_index = baseMeta.paragraph_index
  meta.paragraph_layout = baseMeta.paragraph_layout === 'diptych' ? 'diptych' : 'single'
  if (baseMeta.scene_content) meta.scene_content = baseMeta.scene_content
  return JSON.stringify(meta)
}

function getNarrationEditContext(sb) {
  if (shotEditor.value?.open && shotEditor.value.sb?.id === sb?.id) {
    return {
      dialogue: String(shotEditor.value.dialogue || '').trim(),
      duration: shotEditor.value.duration || 10,
      asTitle: !!shotEditor.value.isTitle,
    }
  }
  return {
    dialogue: String(narrationEditDialogue.value || '').trim(),
    duration: narrationEditDuration.value,
    asTitle: narrationEditAsTitle.value,
  }
}

function splitShotInheritImage(sb, isTitle, isFirst) {
  if (!isFirst) return true
  if (isTitle) return false
  const meta = parseNarrationImageMeta(sb)
  return meta.narration_image_mode === 'inherit'
}

function syncNarrationEditFromShot(sb) {
  if (!sb) {
    narrationEditDialogue.value = ''
    narrationEditDuration.value = 10
    narrationEditAsTitle.value = false
    return
  }
  narrationEditDialogue.value = isMotionComicMode.value
    ? (stripDialogueSpeakerPrefix(sb.dialogue) || extractNarrationSentence(sb))
    : (stripNarrationDialoguePrefix(sb.dialogue) || extractNarrationSentence(sb))
  narrationEditDuration.value = sb.duration || 10
  narrationEditAsTitle.value = isNarrationTitleShot(sb)
}

async function renumberStoryboards() {
  await refreshStoryboardsOnly()
  const ordered = sortStoryboards(sbs.value)
  for (let i = 0; i < ordered.length; i++) {
    const num = i + 1
    if ((ordered[i].storyboard_number || ordered[i].storyboardNumber) !== num) {
      await storyboardAPI.update(ordered[i].id, { storyboard_number: num })
    }
  }
  await refreshStoryboardsOnly()
}

async function shiftStoryboardNumbersFrom(fromNumber, delta) {
  if (!delta) return
  const victims = sortStoryboards(sbs.value)
    .filter(sb => (sb.storyboard_number || sb.storyboardNumber || 0) >= fromNumber)
    .sort((a, b) => (b.storyboard_number || b.storyboardNumber || 0) - (a.storyboard_number || a.storyboardNumber || 0))
  for (const sb of victims) {
    const current = sb.storyboard_number || sb.storyboardNumber || 0
    await storyboardAPI.update(sb.id, { storyboard_number: current + delta })
  }
}

async function fixDuplicateStoryboardNumbers() {
  const ordered = sortStoryboards(sbs.value)
  let changed = false
  for (let i = 0; i < ordered.length; i++) {
    const num = i + 1
    if ((ordered[i].storyboard_number || ordered[i].storyboardNumber) !== num) {
      await storyboardAPI.update(ordered[i].id, { storyboard_number: num })
      changed = true
    }
  }
  if (changed) await refreshStoryboardsOnly()
}

async function saveNarrationShotDetail(closeEditor = false) {
  const sb = selectedSb.value
  if (!sb || narrationEditBusy.value) return
  const isTitle = narrationEditAsTitle.value
  const draft = { ...sb, reference_images: sb.reference_images || sb.referenceImages }
  if (isTitle && !isNarrationTitleShot(sb)) {
    draft.reference_images = buildNarrationMetaForShot({ isTitle: true, inheritImage: false })
  } else if (!isTitle && isNarrationTitleShot(sb)) {
    draft.reference_images = buildNarrationMetaForShot({ isTitle: false, inheritImage: false })
  }
  const dialogue = isTitle ? normalizeNarrationDialogue({ ...sb, reference_images: draft.reference_images }, narrationEditDialogue.value) : normalizeNarrationDialogue(draft, narrationEditDialogue.value)
  if (!dialogue) {
    toast.warning('请填写台词')
    return
  }
  const pureText = stripNarrationDialoguePrefix(dialogue)
  const duration = Math.max(1, Math.min(60, Number(narrationEditDuration.value) || 10))
  narrationEditBusy.value = true
  try {
    const payload = {
      dialogue,
      description: isMotionComicMode.value && !isTitle
        ? (sb.description || pureText)
        : pureText,
      title: isTitle ? '片头标题' : pureText.slice(0, 12),
      duration,
      shot_type: isTitle ? '标题' : (sb.shot_type || sb.shotType || '中景'),
    }
    if (draft.reference_images !== (sb.reference_images || sb.referenceImages)) {
      payload.reference_images = typeof draft.reference_images === 'string' ? draft.reference_images : JSON.stringify(draft.reference_images)
    }
    await storyboardAPI.update(sb.id, payload)
    toast.success('镜头已保存')
    await refresh()
    if (closeEditor) closeShotEditor()
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationEditBusy.value = false
  }
}

async function splitShotByPunctuation(sb) {
  if (!sb || narrationEditBusy.value) return
  const ctx = getNarrationEditContext(sb)
  const text = ctx.dialogue || stripNarrationDialoguePrefix(sb.dialogue) || extractNarrationSentence(sb)
  const lines = splitNarrationLines(text)
  if (lines.length <= 1) {
    toast.warning('至少要有 2 句才能拆分。用句末标点或较长逗号分段后再试。')
    return
  }

  const isTitle = ctx.asTitle || isNarrationTitleShot(sb)
  const meta = parseNarrationImageMeta(sb)
  const titleFull = meta.title_full || lines.join('')
  const prevSpeaker = extractDialogueSpeaker(sb.dialogue)
  const defaultSpeaker = isTitle
    ? '剧中'
    : (isMotionComicMode.value && prevSpeaker && prevSpeaker !== '旁白' && prevSpeaker !== '剧中'
      ? prevSpeaker
      : '旁白')
  const formatSplitDialogue = (line) => (defaultSpeaker === '剧中' ? `剧中：${line}` : `${defaultSpeaker}：${line}`)
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  if (idx < 0) return

  narrationEditBusy.value = true
  try {
    const firstDialogue = isTitle ? `剧中：${lines[0]}` : formatSplitDialogue(lines[0])
    await storyboardAPI.update(sb.id, {
      dialogue: firstDialogue,
      description: lines[0],
      title: isTitle ? '片头标题' : lines[0].slice(0, 12),
      duration: estimateNarrationDurationLocal(lines[0], isTitle),
      shot_type: isTitle ? '标题' : (sb.shot_type || sb.shotType || '中景'),
      reference_images: buildNarrationMetaForShot({
        isTitle,
        inheritImage: splitShotInheritImage(sb, isTitle, true),
        titleFull,
        titleHook: lines[0].slice(0, 20),
        baseMeta: meta,
      }),
    })

    const insertNumber = (sb.storyboard_number || sb.storyboardNumber || 1) + 1
    const newCount = lines.length - 1
    await shiftStoryboardNumbersFrom(insertNumber, newCount)
    await refreshStoryboardsOnly()

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const dialogue = isTitle ? `剧中：${line}` : formatSplitDialogue(line)
      await storyboardAPI.create({
        episode_id: epId.value,
        storyboard_number: insertNumber + i - 1,
        title: isTitle ? '片头标题' : line.slice(0, 12),
        description: line,
        dialogue,
        duration: estimateNarrationDurationLocal(line, isTitle),
        shot_type: isTitle ? '标题' : '中景',
        angle: '平视',
        movement: '固定',
        reference_images: buildNarrationMetaForShot({
          isTitle,
          inheritImage: splitShotInheritImage(sb, isTitle, false),
          titleFull,
          titleHook: line.slice(0, 20),
          baseMeta: meta,
        }),
      })
    }

    await renumberStoryboards()
    toast.success(`已拆成 ${lines.length} 镜${isTitle ? '（片头 · 剧中红字）' : ''}`)
    closeShotEditor()
    const first = sbs.value.find(item => item.id === sb.id) || sbs.value[0]
    if (first) selectedSb.value = first
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationEditBusy.value = false
  }
}

async function insertShotAfter(sb) {
  if (!sb || narrationEditBusy.value) return
  const isTitle = narrationEditAsTitle.value || isNarrationTitleShot(sb)
  const meta = parseNarrationImageMeta(sb)
  narrationEditBusy.value = true
  try {
    const insertNumber = (sb.storyboard_number || sb.storyboardNumber || 0) + 1
    await shiftStoryboardNumbersFrom(insertNumber, 1)
    await refreshStoryboardsOnly()
    await storyboardAPI.create({
      episode_id: epId.value,
      storyboard_number: insertNumber,
      title: isTitle ? '片头标题' : `镜头${num}`,
      description: '',
      dialogue: isTitle ? '剧中：' : (isMotionComicMode.value && extractDialogueSpeaker(sb.dialogue) ? `${extractDialogueSpeaker(sb.dialogue)}：` : '旁白：'),
      duration: 6,
      shot_type: isTitle ? '标题' : '中景',
      angle: '平视',
      movement: '固定',
      reference_images: buildNarrationMetaForShot({
        isTitle,
        inheritImage: isTitle,
        titleFull: meta.title_full,
      }),
    })
    await renumberStoryboards()
    toast.success('已插入镜头')
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationEditBusy.value = false
  }
}

function stripNarrationDialoguePrefix(text) {
  return String(text || '')
    .replace(/^旁白[:：]\s*/, '')
    .replace(/^剧中[:：]\s*/, '')
    .trim()
}

function openShotEditor(sb) {
  if (!sb) return
  selectedSb.value = sb
  syncNarrationEditFromShot(sb)
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  shotEditor.value = {
    open: true,
    sb,
    number: idx >= 0 ? idx + 1 : (sb.storyboard_number || sb.storyboardNumber || 0),
    isTitle: isNarrationTitleShot(sb),
    dialogue: isMotionComicMode.value
      ? (stripDialogueSpeakerPrefix(sb.dialogue) || extractNarrationSentence(sb))
      : (stripNarrationDialoguePrefix(sb.dialogue) || extractNarrationSentence(sb)),
    description: sb.description || '',
    title: sb.title || '',
    duration: sb.duration || 10,
    shotType: sb.shot_type || sb.shotType || '',
    busy: false,
  }
}

function closeShotEditor() {
  if (shotEditor.value.busy) return
  shotEditor.value.open = false
  shotEditor.value.sb = null
}

async function saveShotEditor(remake = false) {
  const editor = shotEditor.value
  const sb = editor.sb
  if (!sb || editor.busy) return

  const dialogue = normalizeNarrationDialogue(
    editor.isTitle ? { ...sb, reference_images: sb.reference_images || sb.referenceImages } : sb,
    editor.dialogue,
  )
  if (!dialogue) {
    toast.warning('请填写台词')
    return
  }

  const pureText = stripNarrationDialoguePrefix(dialogue)
  const description = String(editor.description || '').trim() || pureText
  const duration = Math.max(1, Math.min(60, Number(editor.duration) || 10))
  const title = String(editor.title || '').trim() || (editor.isTitle ? '片头标题' : pureText.slice(0, 12))

  const prevDialogue = String(sb.dialogue || '').trim()
  const dialogueChanged = dialogue !== prevDialogue

  editor.busy = true
  try {
    const payload = {
      dialogue,
      description,
      title,
      duration,
    }
    if (editor.isTitle) {
      const meta = parseNarrationImageMeta(sb)
      const titleShots = sortStoryboards(sbs.value).filter(isNarrationTitleShot)
      const isFirstTitle = titleShots[0]?.id === sb.id
      payload.reference_images = buildNarrationMetaForShot({
        isTitle: true,
        inheritImage: !isFirstTitle,
        titleFull: meta.title_full,
        titleHook: meta.title_hook || pureText.slice(0, 20),
        baseMeta: meta,
      })
    } else if (isNarrationTitleShot(sb)) {
      payload.reference_images = buildNarrationMetaForShot({
        isTitle: false,
        inheritImage: false,
        baseMeta: parseNarrationImageMeta(sb),
      })
    }

    await storyboardAPI.update(sb.id, payload)
    sb.dialogue = dialogue
    sb.description = description
    sb.title = title
    sb.duration = duration
    if (payload.reference_images) {
      sb.reference_images = payload.reference_images
      sb.referenceImages = payload.reference_images
    }
    if (dialogueChanged) {
      sb.tts_audio_url = null
      sb.ttsAudioUrl = null
      sb.composed_video_url = null
      sb.composedVideoUrl = null
    }

    if (!remake) {
      toast.success('镜头已保存')
      closeShotEditor()
      return
    }

    const titleShotsToRemake = editor.isTitle
      ? sortStoryboards(sbs.value).filter(isNarrationTitleShot)
      : [sb]

    if (editor.isTitle && titleShotsToRemake.length > 1) {
      toast.info(`正在重新制作全部 ${titleShotsToRemake.length} 个片头镜…`)
    } else {
      toast.info('正在重新配音…')
    }

    for (const shot of titleShotsToRemake) {
      if (shot.id !== sb.id && dialogueChanged) {
        shot.tts_audio_url = null
        shot.ttsAudioUrl = null
        shot.composed_video_url = null
        shot.composedVideoUrl = null
      }
      await storyboardAPI.generateTTS(shot.id, ttsGenerateOptions(true, shot))
      delete failedComposeMessages.value[shot.id]
      if (!isPendingCompose(shot.id)) pendingComposeIds.value.push(shot.id)
      await composeAPI.shot(shot.id)
      pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== shot.id)
    }

    toast.success(editor.isTitle && titleShotsToRemake.length > 1
      ? `已重新制作 ${titleShotsToRemake.length} 个片头镜`
      : `镜头 #${editor.number} 已重新制作`)
    closeShotEditor()
    await refresh()
  } catch (e) {
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  } finally {
    editor.busy = false
  }
}

function configLabel(config) {
  if (!config) return '未配置'
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

function isPendingCharImage(id) {
  return pendingCharImageIds.value.includes(id)
}
function isPendingCharRecognize(id) {
  return pendingCharRecognizeIds.value.includes(id)
}

function isPendingCharStyleValidate(id) {
  return pendingCharStyleValidateIds.value.includes(id)
}
function isPendingCharAppearance(id) {
  return pendingCharAppearanceIds.value.includes(id)
}

function isCharPortraitUseReference(id) {
  return charPortraitUseReferenceById.value[id] !== false
}

function toggleCharPortraitUseReference(id) {
  charPortraitUseReferenceById.value = {
    ...charPortraitUseReferenceById.value,
    [id]: !isCharPortraitUseReference(id),
  }
}

function openImageViewer(src, title = '') {
  if (!src) return
  imageViewer.value = { open: true, src, title }
}

function closeImageViewer() {
  imageViewer.value = { open: false, src: '', title: '' }
}

function storyboardDisplayIndex(sb) {
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  return idx >= 0 ? idx + 1 : 0
}

function composeUnitIndex(sb) {
  const idx = composeUnitShots.value.findIndex(item => item.id === sb.id)
  return idx >= 0 ? idx + 1 : 0
}

function composeVideoSrc(sb) {
  const url = resolveComposedVideoUrlForShot(sb, sbs.value)
  if (!url) return ''
  return `/${String(url).replace(/^\//, '')}`
}

function openComposeVideoPreview(sb) {
  const src = composeVideoSrc(sb)
  if (!src) return
  const unitNo = composeUnitIndex(sb)
  composeVideoViewer.value = {
    open: true,
    src,
    title: `合成单元 U${String(unitNo).padStart(2, '0')} · ${getComposeUnitShotRangeLabel(sb, sbs.value)}`,
  }
}

function closeComposeVideoViewer() {
  composeVideoViewer.value = { open: false, src: '', title: '' }
}

function handleImageViewerKeydown(event) {
  if (event.key === 'Escape' && shotEditor.value.open) closeShotEditor()
  if (event.key === 'Escape' && imageViewer.value.open) closeImageViewer()
  if (event.key === 'Escape' && composeVideoViewer.value.open) closeComposeVideoViewer()
}

onMounted(() => {
  window.addEventListener('keydown', handleImageViewerKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImageViewerKeydown)
  stopBgmPoll()
  stopOpeningPoll()
  stopTitlePoll()
  stopComposePoll()
  stopMergePoll()
})

function isPendingSceneImage(id) {
  return pendingSceneImageIds.value.includes(id)
}

function framePendingKey(id, frameType) {
  return `${id}:${frameType}`
}

function isPendingShotFrame(id, frameType) {
  return pendingShotFrameKeys.value.includes(framePendingKey(id, frameType))
}

function isPendingVideo(id) {
  return pendingVideoIds.value.includes(id)
}

function videoFailMessage(id) {
  return failedVideoMessages.value[id] || ''
}
function videoProgressMessage(id) {
  return videoProgressMessages.value[id] || ''
}

function isPendingCompose(id) {
  if (pendingComposeIds.value.includes(id)) return true
  const sb = sbs.value.find(item => item.id === id)
  return sb?.status === 'compose_processing'
}

function composeFailMessage(id) {
  return failedComposeMessages.value[id] || ''
}

function formatLocalVoiceLabel(char) {
  const voiceId = char?.voice_style || char?.voiceStyle
  if (!voiceId) return '未分配'
  const found = localCastVoiceProfiles.value.find(v => v.id === voiceId)
    || voiceProfiles.value.find(v => v.id === voiceId)
  if (found) return `${found.gender ? `[${found.gender}] ` : ''}${found.label}`
  if (/^preset:kokoro:/.test(voiceId)) return `Kokoro · ${voiceId.split(':').pop()}`
  if (/^gsv:/i.test(voiceId)) return `克隆 · ${stripGsvId(voiceId)}`
  if (/^(zh|en|ja|ko)-/i.test(voiceId)) return `Edge · ${voiceId}`
  return voiceId
}

function getLocalVoiceProfile(voiceId) {
  if (!voiceId) return null
  return localCastVoiceProfiles.value.find(v => v.id === voiceId) || null
}

function charVoicePreviewSrc(charId) {
  const path = charVoicePreviewUrls.value[charId]
  if (!path) return ''
  const normalized = String(path).replace(/^\//, '')
  return `/${normalized}?v=${encodeURIComponent(charVoicePreviewBump.value)}`
}

async function previewCharacterLocalVoice(char) {
  const voiceId = char?.voice_style || char?.voiceStyle
  if (!voiceId) {
    toast.warning('请先分配音色')
    return
  }
  if (!epId.value) {
    toast.warning('集信息加载中，请稍后重试')
    return
  }
  try {
    charVoicePreviewingId.value = char.id
    const res = await characterAPI.voiceSample(char.id, epId.value, {
      voicebox_model_size: localVoiceboxModelSize.value,
    })
    const path = res?.voice_sample_url || res?.voiceSampleUrl
    if (!path) throw new Error('试听生成失败')
    charVoicePreviewUrls.value = { ...charVoicePreviewUrls.value, [char.id]: path }
    charVoicePreviewBump.value = Date.now()
    const row = chars.value.find(ch => ch.id === char.id)
    if (row) {
      row.voice_sample_url = path
      row.voiceSampleUrl = path
    }
    if (res?.voicebox_fallback) {
      toast.info(`${char.name || '角色'} 试听已生成（Voicebox 暂不可用，已用 Edge 近似音色）`)
    } else {
      toast.success(`${char.name || '角色'} 试听已生成`)
    }
  } catch (e) {
    toast.error(e.message || '试听生成失败')
  } finally {
    if (charVoicePreviewingId.value === char.id) charVoicePreviewingId.value = null
  }
}

const visualChars = computed(() => {
  const list = chars.value.filter(c => !isNarratorCharacter(c))
  return [...list].sort((a, b) => {
    const byName = String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    if (byName !== 0) return byName
    return normalizeVariantLabel(a.variant_label || a.variantLabel)
      .localeCompare(normalizeVariantLabel(b.variant_label || b.variantLabel), 'zh-CN')
  })
})
const visualCharNameCount = computed(() => new Set(visualChars.value.map(c => c.name)).size)

const lockedImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
const lockedAudioConfigId = computed(() => episode.value?.audio_config_id || episode.value?.audioConfigId || null)
const lockedAudioProvider = computed(() => audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)?.provider || '')
const lockedImageConfigLabel = computed(() => configLabel(imageConfigs.value.find(c => c.id === lockedImageConfigId.value)))
const episodeImageModel = ref(DEFAULT_IMAGE_MODEL)
const episodeTextModel = ref(DEFAULT_TEXT_MODEL)
const episodeTextThinking = ref(DEFAULT_TEXT_THINKING)
const referPreviousEpisode = ref(false)
const imageModelOptions = computed(() =>
  imageModelOptionsForMode(productionMode.value).map(item => ({ label: item.label, value: item.value })),
)
const textModelOptions = computed(() =>
  textModelOptionsForMode(productionMode.value).map(item => ({ label: item.label, value: item.value })),
)
const localLlmModelOptions = computed(() => {
  // 本地短剧也可切 OpenRouter / 官网 DeepSeek；智谱与已安装 Ollama 一并列出
  const cloud = TEXT_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value }))
  const local = LOCAL_TEXT_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value }))
  const installed = (localModelStatus.value?.ollama_models || []).map(String)
  const known = new Set([...cloud, ...local].map(item => item.value))
  const ollamaExtras = installed
    .filter(name => name && !known.has(name))
    .map(name => ({ label: `Ollama · ${name}`, value: name }))
  const merged: Array<{ label: string; value: string }> = []
  const seen = new Set<string>()
  for (const item of [...cloud, ...local, ...ollamaExtras]) {
    if (seen.has(item.value)) continue
    seen.add(item.value)
    merged.push(item)
  }
  const current = normalizeTextModelId(episodeTextModel.value)
  if (current && !seen.has(current)) {
    merged.unshift({ label: textModelLabel(current), value: current })
  }
  return merged
})
const episodeTextModelSupportsThinking = computed(() => textModelSupportsThinking(episodeTextModel.value))
const showReferPreviousEpisodeToggle = computed(() => episodeNumber.value > 1 && showTextModelPicker.value)
const showImageModelPicker = computed(() => ['chars', 'scenes', 'shots'].includes(prodTab.value))
const showImageStylePicker = computed(() =>
  showImageModelPicker.value && (isDramaLikeMode.value || isNarrationMode.value),
)
const showTextModelPicker = computed(() => {
  // 云端始终可在顶部模型栏切换；本地管线同样开放
  if (prodTab.value === 'bgm' && isLocalComicMode.value) return true
  if (isDialoguePortraitMode.value) return ['chars', 'scenes'].includes(prodTab.value)
  if (!usesLocalModelPipeline.value) return true
  return ['chars', 'shots', 'scenes', 'script'].includes(prodTab.value) || panel.value === 'script'
})
const showBgmModelPicker = computed(() => prodTab.value === 'bgm')

const headerTextModelOptions = computed(() =>
  usesLocalModelPipeline.value ? localLlmModelOptions.value : textModelOptions.value,
)
const headerImageModelOptions = computed(() => imageModelOptions.value)
const headerVideoModelOptions = computed(() =>
  LOCAL_VIDEO_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })),
)

const audioConfigSelectOptions = computed(() => audioConfigs.value.map(c => {
  let modelName = ''
  try {
    const m = JSON.parse(c.model || '[]')
    modelName = Array.isArray(m) ? (m[0] || '') : (m || '')
  } catch {
    modelName = c.model || ''
  }
  const label = modelName ? `${modelName} (${c.provider})` : `${c.name} (${c.provider})`
  return { label, value: c.id }
}))

const studioHeaderModelHint = computed(() => {
  const parts = [
    `文本：${textModelLabel(episodeTextModel.value)}`,
    `生图：${episodeImageModel.value || '未选'}`,
  ]
  if (isLocalComicMode.value) {
    parts.push(`生视频：${localModelBarVideoModel.value || '未选'}`)
    parts.push(`配音：${localTtsEngineLabel.value}`)
    return `${parts.join(' · ')} — 切换模型即时生效；点「加载到显存」按阶段预热 Ollama / ComfyUI / TTS`
  }
  parts.push(`生视频：${lockedVideoConfigLabel.value || '未选'}`)
  parts.push(`配音：${lockedAudioConfigLabel.value || '未选'}`)
  if (panel.value === 'script' && showScriptChatPanel.value) {
    return `${parts.join(' · ')} — 写稿 / 改稿使用顶部文本模型`
  }
  if (panel.value === 'production') {
    if (prodTab.value === 'chars') return `${parts.join(' · ')} — 定妆 / 角色提取`
    if (prodTab.value === 'shots') return `${parts.join(' · ')} — 镜头图 / 视频 / 配音`
    if (prodTab.value === 'dubbing') return `${parts.join(' · ')} — 本集配音合成`
  }
  return parts.join(' · ')
})

function syncEpisodeImageModel(ep) {
  const resolved = resolveEpisodeImageModelForMode(productionMode.value, ep)
  episodeImageModel.value = resolved
  // 旧 id qwen_image_edit 映射为 q3，写回分集避免下拉仍显示无效值
  const stored = String(ep?.image_model || ep?.imageModel || '').trim()
  if (epId.value && stored === 'qwen_image_edit' && resolved === 'qwen_image_edit_q3') {
    void episodeAPI.update(epId.value, { image_model: resolved }).then(() => {
      if (episode.value) {
        episode.value.image_model = resolved
        episode.value.imageModel = resolved
      }
    }).catch(() => {})
  }
}

function syncEpisodeTextModel(ep) {
  const next = resolveEpisodeTextModelForMode(productionMode.value, ep)
  episodeTextModel.value = next
  // 旧别名 deepseek-v4-flash:free → openrouter/... 写回，避免顶栏显示裸 ID
  const stored = String(ep?.text_model || ep?.textModel || '').trim()
  if (epId.value && stored && stored !== next && stored === 'deepseek-v4-flash:free') {
    void episodeAPI.update(epId.value, { text_model: next }).then(() => {
      if (episode.value) {
        episode.value.text_model = next
        episode.value.textModel = next
      }
    }).catch(() => {})
  }
}

function narrationTextModelParams() {
  return {
    text_model: episodeTextModel.value,
    text_thinking: episodeTextThinking.value,
  }
}

function syncEpisodeTextThinking(ep) {
  episodeTextThinking.value = resolveEpisodeTextThinking(ep)
}

function syncReferPreviousEpisode(ep) {
  referPreviousEpisode.value = !!(ep?.refer_previous_episode ?? ep?.referPreviousEpisode)
}

async function setReferPreviousEpisode(enabled) {
  if (enabled === referPreviousEpisode.value) return
  referPreviousEpisode.value = enabled
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { refer_previous_episode: enabled })
    if (episode.value) {
      episode.value.refer_previous_episode = enabled
      episode.value.referPreviousEpisode = enabled
    }
    toast.success(enabled ? `已开启参照第 ${episodeNumber.value - 1} 集` : '已关闭参照上集')
  } catch (e) {
    syncReferPreviousEpisode(episode.value)
    toast.error(e.message)
  }
}

async function setEpisodeTextThinking(enabled) {
  if (enabled === episodeTextThinking.value) return
  episodeTextThinking.value = enabled
  scriptChatThinking.value = enabled
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { text_thinking: enabled })
    if (episode.value) {
      episode.value.text_thinking = enabled
      episode.value.textThinking = enabled
    }
    toast.success(enabled ? '思考模式已开启' : '思考模式已关闭')
  } catch (e) {
    syncEpisodeTextThinking(episode.value)
    toast.error(e.message)
  }
}

async function onEpisodeTextModelChange(model) {
  if (!model || model === episodeTextModel.value) return
  episodeTextModel.value = model
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { text_model: model })
    if (episode.value) {
      episode.value.text_model = model
      episode.value.textModel = model
    }
    toast.success('文本模型已保存')
  } catch (e) {
    syncEpisodeTextModel(episode.value)
    toast.error(e.message)
  }
}

async function onEpisodeImageModelChange(model) {
  if (!model || model === episodeImageModel.value) return
  episodeImageModel.value = model
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { image_model: model })
    if (episode.value) {
      episode.value.image_model = model
      episode.value.imageModel = model
    }
    toast.success('生图模型已保存')
  } catch (e) {
    syncEpisodeImageModel(episode.value)
    toast.error(e.message)
  }
}

async function onEpisodeVideoConfigChange(configId: number | string) {
  const id = Number(configId)
  if (!id || id === lockedVideoConfigId.value) return
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { video_config_id: id })
    if (episode.value) {
      episode.value.video_config_id = id
      episode.value.videoConfigId = id
    }
    toast.success('生视频服务已切换')
  } catch (e) {
    toast.error(e.message)
  }
}

async function onEpisodeAudioConfigChange(configId: number | string) {
  const id = Number(configId)
  if (!id || id === lockedAudioConfigId.value) return
  if (!epId.value) return
  try {
    await episodeAPI.update(epId.value, { audio_config_id: id })
    if (episode.value) {
      episode.value.audio_config_id = id
      episode.value.audioConfigId = id
    }
    toast.success('配音服务已切换')
    await loadVoices()
  } catch (e) {
    toast.error(e.message)
  }
}

function buildImagePayload(extra = {}) {
  return { ...extra, model: episodeImageModel.value }
}
const lockedVideoConfigLabel = computed(() => configLabel(videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)))
const lockedAudioConfigLabel = computed(() => configLabel(audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)))

// Grid tool state
const gridDialog = ref(false)
const gridStep = ref(0)
const gridLayout = ref('3x3')
const gridMode = ref('first_frame')
const gridSelected = ref([])
const gridSingleTarget = ref(null)
const gridGenId = ref(null)
const gridImagePath = ref('')
const gridStatusText = ref('')
const gridActualLayout = ref({ rows: 3, cols: 3 })
const gridRecoveredAt = ref('')
const gridRecoveredMode = ref('')
const gridPromptText = ref('')
const gridCellPrompts = ref([])
const gridPromptSource = ref('')
const gridPromptLoading = ref(false)
const gridPromptStatus = ref('')
const gridAssignmentsState = ref([])
const gridActiveShotIds = ref([])
const gridHistory = ref([])
const showAllGridHistory = ref(false)
const activeGridCell = ref(0)
const gridAssignmentPage = ref(0)
const gridStorageKey = computed(() => `huobao:grid:${dramaId}:${epId.value || episodeNumber.value}`)

const gridModes = [
  { id: 'first_frame', label: '首帧', desc: '每格=一个镜头的首帧' },
  { id: 'first_last', label: '首尾帧', desc: '每镜头占一行：左首帧，右尾帧' },
  { id: 'multi_ref', label: '多参考', desc: '所有格子=同一镜头的参考图' },
]

const gridLayoutShape = computed(() => {
  const [rows, cols] = String(gridLayout.value || '3x3').split('x').map(Number)
  return {
    rows: rows || 3,
    cols: cols || 3,
  }
})
const gridTotalCells = computed(() => {
  return gridLayoutShape.value.rows * gridLayoutShape.value.cols
})

const gridCanStart = computed(() => {
  if (gridMode.value === 'multi_ref') return !!gridSingleTarget.value
  return gridSelected.value.length > 0
})

const gridSummary = computed(() => {
  if (gridMode.value === 'multi_ref') {
    const idx = sbs.value.findIndex(s => s.id === gridSingleTarget.value) + 1
    return gridSingleTarget.value ? `${gridLayoutShape.value.rows}x${gridLayoutShape.value.cols} 参考图 → 镜头 #${idx}` : '请选择一个镜头'
  }
  if (!gridSelected.value.length) return '请选择镜头'
  const count = gridSelected.value.length
  if (gridMode.value === 'first_last') {
    const { rows, cols } = gridLayoutShape.value
    return `${count} 个镜头 → ${rows}x${cols} 宫格（按首尾帧风格生成，切分后再手动分配）`
  }
  const { rows, cols } = gridLayoutShape.value
  const cells = rows * cols
  return `${count} 个镜头 → ${rows}x${cols} 宫格（先生成宫格图，切分后再手动分配）`
})

function createGridAssignments() {
  return Array.from({ length: gridActualLayout.value.rows * gridActualLayout.value.cols }, () => ({
    storyboard_id: null,
    frame_type: 'first_frame',
  }))
}

const gridAssignments = computed(() => gridAssignmentsState.value)
const gridAssignableShotIds = computed(() => {
  const assignedIds = [...new Set(gridAssignments.value.map(item => item?.storyboard_id).filter(Boolean))]
  const ids = Array.isArray(gridActiveShotIds.value) && gridActiveShotIds.value.length
    ? gridActiveShotIds.value
    : assignedIds.length
      ? assignedIds
    : gridMode.value === 'multi_ref'
      ? (gridSingleTarget.value ? [gridSingleTarget.value] : [])
      : gridSelected.value.length
        ? [...gridSelected.value]
        : sbs.value.map(s => s.id)
  return ids.filter(id => sbs.value.some(s => s.id === id))
})
const gridAssignmentShotOptions = computed(() => [
  { label: '未分配', value: null },
  ...gridAssignableShotIds.value.map((id) => {
    const index = sbs.value.findIndex(s => s.id === id) + 1
    const sb = sbs.value.find(s => s.id === id)
    return {
      label: `#${String(index).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`,
      value: id,
    }
  }),
])
const gridFrameTypeOptions = computed(() => {
  return [
    { label: '首帧', value: 'first_frame' },
    { label: '尾帧', value: 'last_frame' },
    { label: '参考图', value: 'reference' },
  ]
})
const gridAssignedCount = computed(() => gridAssignments.value.filter(item => !!item.storyboard_id).length)
const gridAssignmentPageSize = computed(() => {
  if (gridAssignments.value.length >= 25) return 8
  if (gridAssignments.value.length >= 16) return 10
  if (gridAssignments.value.length >= 9) return 9
  return Math.max(1, gridAssignments.value.length || 1)
})
const gridAssignmentTotalPages = computed(() => Math.max(1, Math.ceil(gridAssignments.value.length / gridAssignmentPageSize.value)))
const gridAssignmentPageStart = computed(() => gridAssignmentPage.value * gridAssignmentPageSize.value)
const gridAssignmentPageEnd = computed(() => Math.min(gridAssignments.value.length, gridAssignmentPageStart.value + gridAssignmentPageSize.value))
const pagedGridAssignments = computed(() => {
  return gridAssignments.value
    .slice(gridAssignmentPageStart.value, gridAssignmentPageEnd.value)
    .map((assignment, offset) => ({
      assignment,
      index: gridAssignmentPageStart.value + offset,
    }))
})

function resetGridAssignments() {
  gridAssignmentsState.value = createGridAssignments()
  activeGridCell.value = 0
  gridAssignmentPage.value = 0
}

function gridCellLabel(a) {
  if (!a?.storyboard_id) return '未分配'
  const idx = sbs.value.findIndex(s => s.id === a.storyboard_id) + 1
  const suffix = { first_frame: '首', last_frame: '尾', reference: '参' }[a.frame_type] || ''
  return `#${idx}${suffix ? ` ${suffix}` : ''}`
}

function gridCellTitle(id) {
  if (!id) return '未分配'
  const idx = sbs.value.findIndex(s => s.id === id) + 1
  const sb = sbs.value.find(s => s.id === id)
  return `#${String(idx).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`
}

function updateGridAssignment(index, field, value) {
  const next = [...gridAssignmentsState.value]
  next[index] = { ...next[index], [field]: value }
  gridAssignmentsState.value = next
  activeGridCell.value = index
  if (gridImagePath.value) persistGridImagePath(gridImagePath.value)
}

function focusGridCell(index) {
  activeGridCell.value = index
  gridAssignmentPage.value = Math.floor(index / gridAssignmentPageSize.value)
}

const gridOverlayStyle = computed(() => {
  const { rows, cols } = gridActualLayout.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

const gridAutoLayout = computed(() => {
  return gridLayoutShape.value
})

const gridBlankStyle = computed(() => {
  const { rows, cols } = gridAutoLayout.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

// Production step helpers
function prodStepDone(id) {
  if (id === 'voice') return narratorReady.value
  if (id === 'chars') return !visualCharTotal.value || charImgCount.value === visualCharTotal.value
  if (id === 'scenes') return !!scenes.value.length && sceneImgCount.value === scenes.value.length
  if (id === 'dubbing') {
    const ready = isNarrationMode.value ? narrationTtsReady.value : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value)
    return !!sbs.value.length && ready
  }
  if (id === 'bgm') return !!sbs.value.length && bgmAppliedCount.value > 0
  if (id === 'shots') return !!sbs.value.length && (isNarrationMode.value ? narrationImageReady.value : shotImgCount.value === sbs.value.length)
  if (id === 'videos') {
    const narrationReady = !!sbs.value.length
      && (isNarrationMode.value ? narrationImageReady.value : shotImgCount.value === sbs.value.length)
      && (isNarrationMode.value ? narrationTtsReady.value : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value))
    return narrationReady || (!!sbs.value.length && shotVidCount.value === sbs.value.length)
  }
  if (id === 'compose') return composableCount.value > 0 && composedCount.value === composableCount.value
  return false
}
const canExport = computed(() => composableCount.value > 0 && composedCount.value === composableCount.value)
function goNextProd() {
  if (prodTabIdx.value < prodTabDefs.value.length - 1) {
    prodTabIdx.value++
  } else {
    panel.value = 'export'
    exportTab.value = 'merge'
  }
}

// Script step navigation
const stepLabels = computed(() => {
  if (isDialoguePortraitMode.value) return ['剧本生成', '文案输入', '对话分镜']
  if (isNovelComicMode.value) return ['本章朗读稿', '文案输入', '旁白分镜']
  if (isMotionComicMode.value) return ['剧本生成', '文案输入', '旁白分镜']
  if (isNarrationMode.value) return ['剧本生成', '文案输入', '旁白分镜']
  if (isLocalComicMode.value) return ['剧本生成', '原始内容', 'AI 改写', '提取', '音色', '分镜']
  return ['原始内容', 'AI 改写', '提取', '音色', '分镜']
})
const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels.value[scriptStep.value - 1] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === storyboardStep.value) return '进入制作'
  return stepLabels.value[scriptStep.value + 1] || ''
})
const canGoNext = computed(() => {
  if (isLocalComicMode.value && scriptStep.value === LOCAL_DRAMA_SCRIPT_CHAT_STEP) {
    return !!localRaw.value.trim() || !!lastScriptChatDraft.value || scriptGenMode.value === 'chat'
  }
  if (isNarrationMode.value && scriptStep.value === narrationScriptChatStep()) {
    return !!localRaw.value.trim() || !!lastScriptChatDraft.value || scriptGenMode.value === 'chat'
  }
  if (isNarrationMode.value && scriptStep.value === narrationRawContentStep()) return !!localRaw.value.trim()
  if (isNarrationMode.value && scriptStep.value === narrationStoryboardStep()) return sbs.value.length > 0
  if (scriptStep.value === dramaRawStep.value) return !!localRaw.value.trim()
  if (scriptStep.value === dramaRewriteStep.value) return !!localScript.value.trim() || !!scriptContent.value
  if (scriptStep.value === dramaExtractStep.value) return chars.value.length > 0
  if (scriptStep.value === dramaVoiceStep.value) return charsVoiced.value > 0
  if (scriptStep.value === storyboardStep.value) return sbs.value.length > 0
  return false
})
function goPrevStep() { if (scriptStep.value > 0) scriptStep.value-- }
function goNextStep() {
  void (async () => {
    if (isLocalComicMode.value && scriptStep.value === LOCAL_DRAMA_SCRIPT_CHAT_STEP && localRaw.value.trim()) {
      await ensureEpisodeScriptPersisted()
    }
    if (isLocalComicMode.value && scriptStep.value === LOCAL_DRAMA_RAW_STEP && localRaw.value.trim()) {
      try {
        await ensureEpisodeScriptPersisted()
      } catch (e) {
        toast.error(e.message)
        return
      }
    }
    if (isNarrationMode.value && scriptStep.value === narrationScriptChatStep() && localRaw.value.trim()) {
      await ensureEpisodeScriptPersisted()
    }
    if (isNarrationMode.value && scriptStep.value === narrationRawContentStep() && localRaw.value.trim()) {
      await ensureEpisodeScriptPersisted()
    }
    if (!isNarrationMode.value && !isLocalComicMode.value && scriptStep.value === dramaRawStep.value && localRaw.value.trim()) {
      try {
        await ensureEpisodeScriptPersisted()
      } catch (e) {
        toast.error(e.message)
        return
      }
    }
    if (!isNarrationMode.value && scriptStep.value === dramaRewriteStep.value && (localScript.value.trim() || scriptContent.value)) {
      try {
        await ensureEpisodeScriptPersisted()
      } catch (e) {
        toast.error(e.message)
        return
      }
    }
    if (scriptStep.value === storyboardStep.value) {
      panel.value = 'production'
      prodTab.value = isNarrationMode.value
        ? (visualCharTotal.value && charImgCount.value < visualCharTotal.value ? 'chars' : 'voice')
        : 'chars'
      return
    }
    if (canGoNext.value) scriptStep.value++
  })()
}

function gridSelectAll() {
  if (gridSelected.value.length === sbs.value.length) gridSelected.value = []
  else gridSelected.value = sbs.value.map(s => s.id)
}

function openGridTool() {
  gridStep.value = 0
  gridSelected.value = []
  gridSingleTarget.value = null
  gridActiveShotIds.value = []
  gridPromptText.value = ''
  gridCellPrompts.value = []
  gridPromptSource.value = ''
  gridPromptStatus.value = ''
  gridAssignmentsState.value = []
  gridDialog.value = true
}

function persistGridImagePath(value) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(gridStorageKey.value)
    return
  }
  const current = restoreGridState() || {}
  const entries = current.entries || {}
  entries[value] = {
    generationId: gridGenId.value,
    layout: gridActualLayout.value,
    shotIds: gridActiveShotIds.value,
    assignments: gridAssignmentsState.value,
    recoveredAt: gridRecoveredAt.value,
    recoveredMode: gridRecoveredMode.value,
  }
  const payload = {
    activeImagePath: value,
    entries,
  }
  window.localStorage.setItem(gridStorageKey.value, JSON.stringify(payload))
}

function restoreGridState() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(gridStorageKey.value)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { activeImagePath: raw, entries: { [raw]: {} } }
  }
}

function applyGridState(imagePath, meta = {}) {
  gridImagePath.value = imagePath || ''
  gridGenId.value = meta.generationId || meta.id || null
  if (meta.layout?.rows && meta.layout?.cols) gridActualLayout.value = meta.layout
  if (Array.isArray(meta.shotIds)) gridActiveShotIds.value = meta.shotIds
  else gridActiveShotIds.value = []
  if (Array.isArray(meta.assignments)) gridAssignmentsState.value = meta.assignments
  else gridAssignmentsState.value = []
  gridRecoveredAt.value = meta.recoveredAt || meta.createdAtLabel || ''
  gridRecoveredMode.value = meta.recoveredMode || meta.modeLabel || ''
}

function selectGridHistory(item) {
  const cached = restoreGridState()
  const cachedEntry = cached?.entries?.[item.localPath] || {}
  applyGridState(item.localPath, {
    ...item,
    ...cachedEntry,
    generationId: cachedEntry.generationId || item.id,
    recoveredAt: cachedEntry.recoveredAt || item.createdAtLabel,
    recoveredMode: cachedEntry.recoveredMode || item.modeLabel,
  })
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  persistGridImagePath(item.localPath)
}

function reopenGridPreview() {
  if (!gridImagePath.value) {
    openGridTool()
    return
  }
  gridDialog.value = true
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridStep.value = 3
}

function parseGridLayoutFromFrameType(value) {
  const match = String(value || '').match(/grid_[^_]+_(\d+)x(\d+)$/)
  if (!match) return null
  return { rows: Number(match[1]) || 3, cols: Number(match[2]) || 3 }
}

function continueGridSplit() {
  if (!gridImagePath.value) {
    toast.warning('还没有可继续切割的宫格图')
    return
  }
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridDialog.value = true
  gridStep.value = 3
}

function getGridPromptShotIds() {
  if (gridMode.value === 'multi_ref') return gridSingleTarget.value ? [gridSingleTarget.value] : []
  if (gridMode.value === 'first_last') return [...gridSelected.value]
  return gridSelected.value.slice(0, gridTotalCells.value)
}

async function generateGridPrompt() {
  if (!gridCanStart.value) {
    toast.warning('请先选择镜头')
    return
  }
  gridPromptLoading.value = true
  gridPromptStatus.value = '正在调用 AI 生成宫格提示词...'
  gridPromptText.value = ''
  gridCellPrompts.value = []
  gridPromptSource.value = ''
  try {
    const shotIds = getGridPromptShotIds()
    const { rows, cols } = gridAutoLayout.value

    const res = await gridAPI.prompt({
      storyboard_ids: shotIds,
      drama_id: dramaId,
      episode_id: epId.value,
      rows,
      cols,
      mode: gridMode.value,
    })

    gridPromptText.value = res?.grid_prompt || ''
    gridCellPrompts.value = Array.isArray(res?.cell_prompts) ? res.cell_prompts : []
    gridPromptSource.value = res?.source || ''

    if (gridPromptText.value) {
      resetGridAssignments()
      gridPromptStatus.value = gridPromptSource.value === 'agent' ? 'AI 提示词已生成' : '已使用模板提示词'
      gridStep.value = 1
    } else {
      gridPromptStatus.value = ''
      toast.error('提示词生成失败')
    }
  } catch (e) {
    gridPromptStatus.value = ''
    toast.error(e?.message || '生成提示词失败')
  } finally {
    gridPromptLoading.value = false
  }
}

async function startGridGen() {
  let rows, cols, ids
  if (gridMode.value === 'multi_ref') {
    rows = gridAutoLayout.value.rows; cols = gridAutoLayout.value.cols; ids = [gridSingleTarget.value]
  } else {
    rows = gridAutoLayout.value.rows; cols = gridAutoLayout.value.cols; ids = gridSelected.value.slice(0, gridTotalCells.value)
    if (gridMode.value === 'first_last') ids = [...gridSelected.value]
  }
  gridActiveShotIds.value = ids.filter(Boolean)
  gridActualLayout.value = { rows, cols }
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridStep.value = 2
  gridStatusText.value = '提交生成请求...'
  try {
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('image')
    }
    const res = await gridAPI.generate({
      storyboard_ids: ids,
      drama_id: dramaId,
      episode_id: epId.value,
      rows,
      cols,
      mode: gridMode.value,
      custom_prompt: gridPromptText.value || undefined,
    })
    gridGenId.value = res.image_generation_id
    gridActualLayout.value = res.grid || { rows, cols }
    gridStatusText.value = '等待图片生成...'
    pollGridStatus()
  } catch (e) {
    toast.error(e.message)
    gridStep.value = 0
  }
}

async function pollGridStatus() {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const res = await gridAPI.status(gridGenId.value)
      gridStatusText.value = `状态: ${res.status}`
      if (res.status === 'completed' && res.local_path) {
        gridImagePath.value = res.local_path
        gridGenId.value = gridGenId.value || res.id || null
        persistGridImagePath(res.local_path)
        gridStep.value = 3
        return
      }
      if (res.status === 'failed') {
        toast.error(res.error_msg || '生成失败')
        gridStep.value = 0
        return
      }
    } catch {}
  }
  toast.error('生成超时'); gridStep.value = 0
}

async function loadLatestGridImage() {
  try {
    const rows = await imageAPI.list({ drama_id: dramaId, grid_only: true })
    const list = Array.isArray(rows) ? rows : []
    const grids = list
      .filter((row) => row?.status === 'completed' && String(row?.frame_type || row?.frameType || '').startsWith('grid_') && (row?.local_path || row?.localPath))
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
      .map((row) => {
        const frameType = String(row?.frame_type || row?.frameType || '')
        const parsedLayout = parseGridLayoutFromFrameType(frameType) || { rows: 3, cols: 3 }
        return {
          id: row.id,
          localPath: row?.local_path || row?.localPath || '',
          layout: parsedLayout,
          modeLabel: frameType.replace(/^grid_/, '').replace(/_/g, ' · '),
          createdAtLabel: row?.created_at || row?.createdAt || '',
        }
      })

    gridHistory.value = grids

    const cached = restoreGridState()
    const preferredPath = cached?.activeImagePath && grids.some(item => item.localPath === cached.activeImagePath)
      ? cached.activeImagePath
      : grids[0]?.localPath
    const current = grids.find(item => item.localPath === preferredPath)
    if (current) {
      const cachedEntry = cached?.entries?.[current.localPath] || {}
      applyGridState(current.localPath, {
        ...current,
        ...cachedEntry,
        generationId: cachedEntry.generationId || current.id,
        recoveredAt: cachedEntry.recoveredAt || current.createdAtLabel,
        recoveredMode: cachedEntry.recoveredMode || current.modeLabel,
      })
      if (!gridAssignmentsState.value.length) resetGridAssignments()
      persistGridImagePath(current.localPath)
      return
    }
  } catch {}

  const cached = restoreGridState()
  if (cached?.activeImagePath) {
    const cachedEntry = cached?.entries?.[cached.activeImagePath] || {}
    applyGridState(cached.activeImagePath, {
      ...cachedEntry,
      recoveredAt: cachedEntry.recoveredAt || '',
      recoveredMode: cachedEntry.recoveredMode || '',
    })
  }
}

async function doGridSplit() {
  const { rows, cols } = gridActualLayout.value
  try {
    const assignments = gridAssignments.value
      .filter(item => !!item.storyboard_id)
      .map(item => ({ storyboard_id: item.storyboard_id, frame_type: item.frame_type }))
    if (!assignments.length) {
      toast.warning('请至少分配一个格子')
      return
    }
    await gridAPI.split({ image_generation_id: gridGenId.value, rows, cols, assignments })
    persistGridImagePath(gridImagePath.value)
    gridStep.value = 4
    toast.success('切分分配完成')
  } catch (e) {
    toast.error(e.message)
  }
}

const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
const dialoguePortraitExpressionReadyCount = computed(() =>
  visualChars.value.filter(c => dialoguePortraitExpressionsReady(c)).length,
)
const dialoguePortraitCharOverLimit = computed(() =>
  isDialoguePortraitMode.value && visualChars.value.length > DIALOGUE_PORTRAIT_MAX_CHARS,
)
const pendingDialogueExpressionIds = ref<number[]>([])
function isPendingDialogueExpression(id: number) {
  return pendingDialogueExpressionIds.value.includes(id)
}
const ttsEligibleCount = computed(() =>
  isNarrationMode.value ? listNarrationTtsUnits(sbs.value).length : sbs.value.filter(s => hasDialogue(s)).length,
)
const narrationTtsUnitList = computed(() =>
  isNarrationMode.value ? listNarrationTtsUnits(sbs.value) : sbs.value.filter(s => hasDialogue(s)),
)
const dubbingUnitViews = computed(() => {
  const groups = composeUnitGroups.value
  if (isNarrationMode.value) {
    return listNarrationTtsUnits(sbs.value).map(sb => ({
      sb,
      subtitleLines: [],
      shotRangeLabel: `#${getNarrationShotDisplayNo(sb)}`,
      durationLabel: formatComposeUnitDuration(sb, sbs.value, groups),
      mergedText: getDialogueText(sb) || '',
      speakerLabel: getDialogueSpeaker(sb),
      voiceHint: resolveShotVoiceHint(sb),
      voiceGenderLabel: resolveShotVoiceGenderLabel(sb),
      ready: hasNarrationShotOwnTts(sb),
      statusLabel: hasNarrationShotOwnTts(sb) ? '已生成' : '待生成',
      lineCount: 1,
    }))
  }
  return narrationTtsUnitList.value.map(sb => ({
    sb,
    subtitleLines: [],
    shotRangeLabel: `#${sb.storyboard_number || sb.storyboardNumber || sb.id}`,
    durationLabel: formatComposeUnitDuration(sb, sbs.value, groups),
    mergedText: getDialogueText(sb) || '',
    speakerLabel: getDialogueSpeaker(sb),
    voiceHint: resolveShotVoiceHint(sb),
    voiceGenderLabel: resolveShotVoiceGenderLabel(sb),
    ready: hasTTS(sb),
    statusLabel: hasTTS(sb) ? '已生成' : '待生成',
    lineCount: 1,
  }))
})
const dubbingPageCount = computed(() =>
  Math.max(1, Math.ceil(dubbingUnitViews.value.length / DUBBING_LIST_PAGE_SIZE)),
)
const dubbingPageItems = computed(() => {
  const page = Math.min(Math.max(1, dubbingListPage.value), dubbingPageCount.value)
  const start = (page - 1) * DUBBING_LIST_PAGE_SIZE
  return dubbingUnitViews.value.slice(start, start + DUBBING_LIST_PAGE_SIZE)
})
const ttsGeneratedCount = computed(() => {
  if (isNarrationMode.value) {
    return narrationTtsUnitList.value.filter(sb => hasNarrationShotOwnTts(sb)).length
  }
  return sbs.value.filter(s => hasDialogue(s) && hasTTS(s)).length
})
const narrationTtsReady = computed(() => narrationTtsAllReady(sbs.value))
const shotImgCount = computed(() => {
  if (isNarrationMode.value) {
    return sbs.value.filter(s => narrationShotNeedsOwnImage(s) && hasNarrationShotImage(s)).length
  }
  return sbs.value.filter(s => s.first_frame_image || s.firstFrameImage || s.last_frame_image || s.lastFrameImage || s.composed_image || s.composedImage).length
})
const narrationNeedImageCount = computed(() => narrationShotsNeedingImage(sbs.value).length)
const narrationImageDetectLiveCount = computed(() => narrationImageDetectAnchorCount(sbs.value))
const narrationPromptLiveCount = computed(() =>
  sbs.value.filter(sb =>
    narrationShotNeedsOwnImage(sb) && String(sb?.image_prompt || sb?.imagePrompt || '').trim(),
  ).length,
)
const narrationDetectDisplayCount = computed(() => {
  const live = narrationImageDetectLiveCount.value
  const s = narrationBreakdownSummary.value
  const cached = s?.paragraph_count ?? s?.paragraphCount ?? s?.image_needed_count ?? s?.imageNeededCount
  const hasDetect = !!(s?.image_detect_at ?? s?.imageDetectAt)
  if (live > 0) return live
  if (hasDetect && cached != null && Number(cached) > 0) return Number(cached)
  return 0
})
/** 清除检测配图：可清除的锚点/分段数（比展示数更宽，避免仅有 mode=new 时按钮置灰） */
const narrationDetectClearCount = computed(() => {
  const live = narrationImageDetectLiveCount.value
  if (live > 0) return live
  const need = narrationNeedImageCount.value
  const titleOnly = need === 1 && sbs.value.some(sb => isNarrationTitleShot(sb) && narrationShotNeedsOwnImage(sb))
  if (need > 0 && !titleOnly) return need
  return narrationDetectDisplayCount.value
})
const canClearNarrationImageDetect = computed(() => {
  if (!sbs.value.length) return false
  if (narrationDetectClearCount.value > 0) return true
  if (narrationPromptLiveCount.value > 0) return true
  const s = narrationBreakdownSummary.value
  return !!(s?.image_detect_at ?? s?.imageDetectAt ?? s?.image_detect_source ?? s?.imageDetectSource)
})
const narrationPromptDisplayCount = computed(() => {
  const live = narrationPromptLiveCount.value
  const s = narrationBreakdownSummary.value
  const cached = s?.prompts_generated ?? s?.promptsGenerated
  const hasPrompt = !!(s?.image_prompt_at ?? s?.imagePromptAt)
  if (live > 0) return live
  if (hasPrompt && cached != null) return cached
  return 0
})
const narrationImageAuditRestorableCount = computed(() =>
  narrationImageAuditPanel.value?.items?.filter(item => item.can_restore)?.length ?? 0,
)
const narrationMissingPromptCount = computed(() =>
  sbs.value.filter(sb =>
    narrationShotNeedsOwnImage(sb) && !String(sb?.image_prompt || sb?.imagePrompt || '').trim(),
  ).length,
)
const NARRATION_PROMPT_COPY_BATCH_SIZE = 10
const narrationCopyBatchIndex = ref(1)
const narrationCopyBatchOptions = computed(() => {
  const list = narrationShotsNeedingImage(sbs.value)
  const total = list.length
  if (!total) return []
  const batchCount = Math.ceil(total / NARRATION_PROMPT_COPY_BATCH_SIZE)
  return Array.from({ length: batchCount }, (_, idx) => {
    const batchItems = list.slice(idx * NARRATION_PROMPT_COPY_BATCH_SIZE, (idx + 1) * NARRATION_PROMPT_COPY_BATCH_SIZE)
    const firstNo = getNarrationShotDisplayNo(batchItems[0])
    const lastNo = getNarrationShotDisplayNo(batchItems[batchItems.length - 1])
    return { value: idx + 1, label: `#${firstNo}-#${lastNo}` }
  })
})
watch(narrationCopyBatchOptions, (opts) => {
  if (!opts.length) {
    narrationCopyBatchIndex.value = 1
    return
  }
  if (!opts.some(opt => opt.value === narrationCopyBatchIndex.value)) {
    narrationCopyBatchIndex.value = opts[0].value
  }
})

const narrationPromptTestBatchIndex = ref(1)
const narrationPromptTestBatchDetails = computed(() =>
  buildNarrationParagraphBatchOptions(sbs.value, imagePromptBatchSize.value),
)
const narrationPromptTestBatchOptions = computed(() =>
  narrationPromptTestBatchDetails.value.map(o => ({ value: o.value, label: o.label })),
)
watch([narrationPromptTestBatchOptions, imagePromptBatchSize], () => {
  const opts = narrationPromptTestBatchOptions.value
  if (!opts.length) {
    narrationPromptTestBatchIndex.value = 1
    return
  }
  if (!opts.some(opt => opt.value === narrationPromptTestBatchIndex.value)) {
    narrationPromptTestBatchIndex.value = opts[0].value
  }
})
function normalizedImagePromptBatchSize() {
  return normalizeParagraphPromptBatchSize(imagePromptBatchSize.value)
}
const narrationPromptTestBatchAnchors = computed(() =>
  narrationShotsInParagraphBatch(
    sbs.value,
    narrationPromptTestBatchIndex.value,
    imagePromptBatchSize.value,
  ),
)
const narrationPromptTestBatchAnchorCount = computed(() => narrationPromptTestBatchAnchors.value.length)
const narrationPromptTestPendingShots = computed(() =>
  narrationShotsMissingPromptInBatch(
    sbs.value,
    narrationPromptTestBatchIndex.value,
    imagePromptBatchSize.value,
  ),
)
const narrationPromptTestPendingCount = computed(() => narrationPromptTestPendingShots.value.length)
const narrationPromptTestCanRun = computed(() =>
  narrationNeedImageCount.value > 0 && narrationPromptTestBatchAnchorCount.value > 0,
)
const narrationPromptTestPendingLabel = computed(() => formatNarrationShotDisplayList(
  narrationPromptTestPendingCount.value
    ? narrationPromptTestPendingShots.value
    : narrationPromptTestBatchAnchors.value,
))
const narrationPromptTestPendingTitle = computed(() => {
  const perBatch = normalizedImagePromptBatchSize()
  const batch = narrationPromptTestBatchDetails.value.find(o => o.value === narrationPromptTestBatchIndex.value)
  const batchHint = batch
    ? `${batch.label}（${batch.shotLabel}，${batch.paragraphCount} 段/每批 ${perBatch} 段）`
    : `每批 ${perBatch} 段`
  if (!narrationNeedImageCount.value) return '请先执行「① 检测配图」'
  if (!narrationPromptTestBatchAnchorCount.value) return '当前段批无配图段落'
  if (!narrationPromptTestPendingCount.value) {
    return `测试重新生成 ${narrationPromptTestBatchAnchorCount.value} 段：${narrationPromptTestPendingLabel.value}（${batchHint}）`
  }
  return `测试生成 ${narrationPromptTestPendingCount.value} 段：${narrationPromptTestPendingLabel.value}（${batchHint}）`
})

const ttsPendingCount = computed(() => {
  if (isNarrationMode.value) {
    return sbs.value.filter(sb => hasDialogue(sb) && !hasNarrationShotOwnTts(sb)).length
  }
  return sbs.value.filter(sb => hasDialogue(sb) && !hasTTS(sb)).length
})
const narrationImagesPendingCount = computed(() =>
  narrationImagesPendingShotsFiltered.value.length,
)
const nextPendingNarrationShot = computed(() => narrationImagesPendingShotsFiltered.value[0] || null)

/** 配图清除/重生：多角色时可选指定角色（空=全部） */
const narrationImageCharFilterIds = ref([])

function toggleNarrationImageCharFilter(charId) {
  const id = Number(charId)
  if (!Number.isFinite(id) || id <= 0) return
  const cur = narrationImageCharFilterIds.value
  narrationImageCharFilterIds.value = cur.includes(id)
    ? cur.filter(x => x !== id)
    : [...cur, id]
}

function clearNarrationImageCharFilter() {
  narrationImageCharFilterIds.value = []
}

function selectAllNarrationImageCharFilter() {
  narrationImageCharFilterIds.value = visualChars.value.map(c => c.id).filter(Boolean)
}

function storyboardMatchesNarrationImageCharFilter(sb, selectedIds = narrationImageCharFilterIds.value) {
  if (!selectedIds?.length) return true
  const ids = getStoryboardCharacterIdsFromShot(sb).map(Number)
  if (ids.some(id => selectedIds.includes(id))) return true
  const blob = [
    sb?.image_prompt,
    sb?.imagePrompt,
    sb?.description,
    sb?.dialogue,
    sb?.narration_text,
    sb?.narrationText,
  ].map(x => String(x || '')).join('\n')
  for (const c of visualChars.value) {
    if (!selectedIds.includes(c.id)) continue
    const name = String(c.name || '').trim()
    if (!name) continue
    if (blob.includes(name)) return true
    const stage = String(c.variant_label || c.variantLabel || '').trim()
    if (stage && blob.includes(`${name}·${stage}`)) return true
  }
  return false
}

const narrationImageCharFilterActive = computed(() => narrationImageCharFilterIds.value.length > 0)
const narrationImageCharFilterLabel = computed(() => {
  if (!narrationImageCharFilterActive.value) return '全部角色'
  const names = visualChars.value
    .filter(c => narrationImageCharFilterIds.value.includes(c.id))
    .map(c => formatCharacterDisplayName(c))
  return names.length ? names.join('、') : '所选角色'
})
const showNarrationImageCharFilter = computed(() =>
  isNarrationLikeMode.value && visualChars.value.length > 1,
)

const narrationOwnImageCount = computed(() => {
  const paths = new Set()
  for (const sb of sbs.value) {
    if (!storyboardMatchesNarrationImageCharFilter(sb)) continue
    const p = getNarrationShotOwnImage(sb)
    if (p) paths.add(p)
  }
  return paths.size
})
const narrationImagesPendingShotsFiltered = computed(() =>
  narrationShotsPendingImage(sbs.value).filter(sb => storyboardMatchesNarrationImageCharFilter(sb)),
)
/** 所选角色下已有配图、可强制重生成的镜头 */
const narrationImagesRegenShotsFiltered = computed(() =>
  narrationShotsNeedingImage(sbs.value).filter(sb =>
    storyboardMatchesNarrationImageCharFilter(sb) && !!getNarrationShotOwnImage(sb),
  ),
)
const narrationImagesRegenCount = computed(() => narrationImagesRegenShotsFiltered.value.length)
const ttsAssignedCount = computed(() =>
  sbs.value.filter(sb => getNarrationShotOwnTts(sb) || sb.tts_audio_url || sb.ttsAudioUrl).length,
)
const narrationCropImageCount = computed(() => {
  const paths = new Set()
  for (const sb of sbs.value) {
    const p = getNarrationShotOwnImage(sb)
    if (p) paths.add(p)
  }
  return paths.size
})
const narrationWmCroppedImageCount = computed(() => {
  const paths = new Set()
  for (const sb of sbs.value) {
    const p = getNarrationShotOwnImage(sb)
    if (!p) continue
    if (p.includes('-wm9')) {
      paths.add(p)
      continue
    }
    try {
      const meta = JSON.parse(sb.referenceImages || '{}')
      if (meta?.wm_crop_applied) paths.add(p)
    } catch {}
  }
  return paths.size
})
const narrationImagesPendingShots = computed(() => narrationImagesPendingShotsFiltered.value)
const narrationImagesPendingLabel = computed(() => formatNarrationShotDisplayList(narrationImagesPendingShots.value))
const narrationImagesPendingHint = computed(() => {
  const pending = narrationImagesPendingShotsFiltered.value
  if (!pending.length) return ''
  const label = formatNarrationShotDisplayList(pending)
  if (pending.length === 1) return `${label}（最后一镜）`
  return label
})
const narrationImagesPendingTitle = computed(() => {
  if (!narrationImagesPendingCount.value) return ''
  const scope = narrationImageCharFilterActive.value ? `（${narrationImageCharFilterLabel.value}）` : ''
  return `生成剩余 ${narrationImagesPendingShots.value.length} 张${scope}：${narrationImagesPendingLabel.value}`
})
const composePendingCount = computed(() =>
  composeUnitShots.value.filter(sb => !hasComposedStoryboard(sb, sbs.value, composeUnitGroups.value)).length,
)
const composeProcessingCount = computed(() =>
  composableShots.value.filter(sb => sb.status === 'compose_processing' || isPendingCompose(sb.id)).length,
)
const composeFilteredShots = computed(() => {
  const list = composeUnitShots.value
  const groups = composeUnitGroups.value
  if (composeListFilter.value === 'pending') {
    return list.filter(sb => !hasComposedStoryboard(sb, sbs.value, groups))
  }
  if (composeListFilter.value === 'processing') {
    return list.filter(sb => sb.status === 'compose_processing' || isPendingCompose(sb.id))
  }
  if (composeListFilter.value === 'failed') {
    return list.filter(sb => !!composeFailMessage(sb.id))
  }
  if (composeListFilter.value === 'done') {
    return list.filter(sb => hasComposedStoryboard(sb, sbs.value, groups))
  }
  return list
})
const composePageCount = computed(() =>
  Math.max(1, Math.ceil(composeFilteredShots.value.length / COMPOSE_LIST_PAGE_SIZE)),
)
const composePageShots = computed(() => {
  const page = Math.min(Math.max(1, composeListPage.value), composePageCount.value)
  const start = (page - 1) * COMPOSE_LIST_PAGE_SIZE
  return composeFilteredShots.value.slice(start, start + COMPOSE_LIST_PAGE_SIZE)
})
const shotsFiltered = computed(() => {
  const list = sbs.value
  if (isNarrationMode.value) {
    if (shotsListFilter.value === 'pending') return narrationShotsPendingImage(list)
    if (shotsListFilter.value === 'processing') return list.filter(sb => isPendingNarrationShot(sb.id))
    if (shotsListFilter.value === 'done') return list.filter(sb => !!getNarrationDisplayImage(sb))
    if (shotsListFilter.value === 'need_own') return list.filter(sb => narrationShotNeedsOwnImage(sb))
    if (shotsListFilter.value === 'inherit') return list.filter(sb => !narrationShotNeedsOwnImage(sb))
    return list
  }
  if (shotsListFilter.value === 'pending') {
    return list.filter(sb => !getFirstFrame(sb) || (frameMode.value === 'first_last' && !getLastFrame(sb)))
  }
  if (shotsListFilter.value === 'processing') {
    return list.filter(sb =>
      isPendingShotFrame(sb.id, 'first_frame') || isPendingShotFrame(sb.id, 'last_frame'),
    )
  }
  if (shotsListFilter.value === 'done') {
    return list.filter(sb => getFirstFrame(sb) && (frameMode.value !== 'first_last' || getLastFrame(sb)))
  }
  return list
})
const shotsListPageSize = computed(() =>
  isNarrationMode.value ? NARRATION_SHOT_PAGE_SIZE : PROD_SHOT_PAGE_SIZE,
)
const shotsPageCount = computed(() =>
  Math.max(1, Math.ceil(shotsFiltered.value.length / shotsListPageSize.value)),
)
const shotsPageItems = computed(() => {
  const page = Math.min(Math.max(1, shotsListPage.value), shotsPageCount.value)
  const start = (page - 1) * shotsListPageSize.value
  return shotsFiltered.value.slice(start, start + shotsListPageSize.value)
})
const scriptStoryboardPageCount = computed(() =>
  Math.max(1, Math.ceil(sbs.value.length / SCRIPT_STORYBOARD_PAGE_SIZE)),
)
const scriptStoryboardPageItems = computed(() => {
  const page = Math.min(Math.max(1, scriptStoryboardPage.value), scriptStoryboardPageCount.value)
  const start = (page - 1) * SCRIPT_STORYBOARD_PAGE_SIZE
  return sbs.value.slice(start, start + SCRIPT_STORYBOARD_PAGE_SIZE)
})
function scriptStoryboardListNo(sb) {
  if (isNarrationMode.value) return getNarrationShotDisplayNo(sb)
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  return idx >= 0 ? idx + 1 : '—'
}
const shotsDoneCount = computed(() => {
  if (isNarrationMode.value) {
    return sbs.value.filter(sb => !!getNarrationDisplayImage(sb)).length
  }
  return sbs.value.filter(sb => getFirstFrame(sb) && (frameMode.value !== 'first_last' || getLastFrame(sb))).length
})
const shotsPendingCount = computed(() => {
  if (isNarrationMode.value) return narrationImagesPendingCount.value
  return sbs.value.filter(sb => !getFirstFrame(sb) || (frameMode.value === 'first_last' && !getLastFrame(sb))).length
})
const charImagesPendingCount = computed(() =>
  visualChars.value.filter(c => !(c.image_url || c.imageUrl)).length,
)
const charAppearancesPendingCount = computed(() =>
  visualChars.value.filter(c => !(String(c.appearance || '').trim())).length,
)
const sceneImagesPendingCount = computed(() =>
  scenes.value.filter(s => !(s.image_url || s.imageUrl)).length,
)
/** 解说模式按合成单元生成；剧场模式按镜头 */
const videoGenTargets = computed(() => {
  if (isNarrationMode.value) return composeUnitShots.value.filter(sb => !isNarrationTitleShot(sb))
  return sbs.value
})

const videosPendingCount = computed(() =>
  videoGenTargets.value.filter(s => hasImg(s) && !hasVid(s)).length,
)
const videosDoneCount = computed(() =>
  videoGenTargets.value.filter(s => hasVid(s)).length,
)
const videosProcessingCount = computed(() =>
  videoGenTargets.value.filter(s => isPendingVideo(s.id)).length,
)
const videosFilteredTargets = computed(() => {
  const list = videoGenTargets.value
  if (videosListFilter.value === 'pending') {
    return list.filter(s => hasImg(s) && !hasVid(s) && !isPendingVideo(s.id))
  }
  if (videosListFilter.value === 'processing') {
    return list.filter(s => isPendingVideo(s.id))
  }
  if (videosListFilter.value === 'failed') {
    return list.filter(s => !!videoFailMessage(s.id))
  }
  if (videosListFilter.value === 'done') {
    return list.filter(s => hasVid(s))
  }
  return list
})
const videosPageCount = computed(() =>
  Math.max(1, Math.ceil(videosFilteredTargets.value.length / VIDEO_LIST_PAGE_SIZE)),
)
const videosPageShots = computed(() => {
  const page = Math.min(Math.max(1, videosListPage.value), videosPageCount.value)
  const start = (page - 1) * VIDEO_LIST_PAGE_SIZE
  return videosFilteredTargets.value.slice(start, start + VIDEO_LIST_PAGE_SIZE)
})

/** 与镜头合成一致：同配图段多句旁白合并文案 */
function getVideoUnitMergedText(sb) {
  if (isNarrationMode.value || isLocalComicMode.value) {
    const merged = String(getComposeUnitMergedTtsText(sb, sbs.value) || '').trim()
    if (merged) return merged
  }
  return String(getDialogueText(sb) || '').trim()
}

function estimateVideoDurationSec(sb) {
  // 与镜头合成同一套：同配图段多句累加（有 TTS duration 用实测，否则按字数估）
  if (isNarrationMode.value || isLocalComicMode.value) {
    const unitSec = getComposeUnitTotalDurationSec(sb, sbs.value, composeUnitGroups.value)
    if (Number.isFinite(unitSec) && unitSec > 0) {
      return Math.max(2, Math.round(unitSec * 10) / 10)
    }
  }
  const fromField = Number(sb?.duration)
  if (Number.isFinite(fromField) && fromField > 0) return fromField
  const text = getVideoUnitMergedText(sb)
  if (text) {
    const chars = text.replace(/\s/g, '').length
    return Math.max(3, Math.min(12, Math.ceil(chars / 4.5)))
  }
  return 3
}

function buildLocalVideoPrompt(sb) {
  const existing = String(sb?.video_prompt || sb?.videoPrompt || '').trim()
  if (existing) return existing
  const anchor = resolveNarrationImageAnchorShot(sbs.value, sb) || sb
  const meta = parseNarrationImageMeta(anchor)
  const paragraph = getVideoUnitMergedText(sb)
  const imageScene = String(
    anchor?.image_prompt
    || anchor?.imagePrompt
    || meta?.image_prompt_llm_raw
    || meta?.scene_content
    || getNarrationImagePromptText(anchor)
    || anchor?.description
    || '',
  ).trim()
  return buildVideoPromptFromParagraphAndImage(imageScene, paragraph)
}

function resolveVideoReferenceImage(sb) {
  const anchor = resolveNarrationImageAnchorShot(sbs.value, sb) || sb
  return getFirstFrame(anchor)
    || anchor?.composed_image
    || anchor?.composedImage
    || getNarrationDisplayImage(anchor)
    || getStoryboardCover(anchor)
    || getFirstFrame(sb)
    || sb?.composed_image
    || sb?.composedImage
    || getNarrationDisplayImage(sb)
    || getStoryboardCover(sb)
    || null
}

function getNarrationImagePromptText(sb, style = getNarrationImageStyle()) {
  const stored = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  if (stored) return stored
  return buildNarrationImagePrompt(sb, style, sbs.value)
}

function getNarrationImagePromptForCopy(sb, style = getNarrationImageStyle()) {
  const text = getNarrationImagePromptText(sb, style)
  if (text) return text
  const meta = parseNarrationImageMeta(sb)
  return String(meta.scene_content || extractNarrationSentence(sb) || '').trim()
}

function updateNarrationImagePrompt(sb, value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return
  const prev = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  updateField(sb, 'image_prompt', trimmed)
  if (prev !== trimmed) clearShotFluxPromptMetaLocal(sb)
}

async function updateNarrationFluxPromptEn(sb, value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return
  const prev = getNarrationFluxPromptEn(sb)
  if (prev === trimmed) return
  applyShotFluxPromptMeta(sb, null, trimmed, new Date().toISOString())
  try {
    await storyboardAPI.update(sb.id, { flux_prompt_en: trimmed })
  } catch (e) {
    toast.error(e?.message || '保存英文 prompt 失败')
  }
}

function isKolorsEpisodeImageModel() {
  return String(episodeImageModel.value || '').toLowerCase() === 'kolors'
}

function isQwenEpisodeImageModel() {
  const m = String(episodeImageModel.value || '').toLowerCase()
  return m === 'qwen_image_edit' || m.startsWith('qwen_image')
}

function isInstantIdEpisodeImageModel() {
  return String(episodeImageModel.value || '').toLowerCase() === 'sdxl_instantid'
}

function needsEnglishImagePromptModel() {
  return isFluxEpisodeImageModel() || isInstantIdEpisodeImageModel()
}

function isFluxEpisodeImageModel() {
  return String(episodeImageModel.value || '').toLowerCase().includes('flux')
}

function getNarrationFluxPromptEn(sb) {
  return String(parseNarrationImageMeta(sb).flux_prompt_en || '').trim()
}

function normalizeFluxEnForPendingCheck(en: string): string {
  return repairFluxEnglishForPendingCheck(en)
}

function needsFluxEnglishTranslate(sb) {
  if (!needsEnglishImagePromptModel()) return false
  const prompt = getNarrationImagePromptText(sb)
  if (!prompt || !/[\u4e00-\u9fff]/.test(prompt)) return false
  const en = normalizeFluxEnForPendingCheck(getNarrationFluxPromptEn(sb))
  if (!en) return true
  // 已有英文且通过准确性判定即视为完成（不再仅因 version 落后显示剩余 1）
  return isFluxEnglishPromptInaccurate(en, prompt)
}

function clearShotFluxPromptMetaLocal(sb) {
  const meta = parseNarrationImageMeta(sb)
  if (!meta.flux_prompt_en && !meta.flux_prompt_en_at) return
  delete meta.flux_prompt_en
  delete meta.flux_prompt_en_at
  delete meta.flux_prompt_en_version
  const json = JSON.stringify(meta)
  sb.reference_images = json
  sb.referenceImages = json
}

function applyShotFluxPromptMeta(sb, referenceImages, fluxPromptEn, fluxPromptEnAt) {
  if (referenceImages) {
    sb.reference_images = referenceImages
    sb.referenceImages = referenceImages
  } else if (fluxPromptEn) {
    const meta = parseNarrationImageMeta(sb)
    meta.flux_prompt_en = fluxPromptEn
    if (fluxPromptEnAt) meta.flux_prompt_en_at = fluxPromptEnAt
    meta.flux_prompt_en_version = FLUX_PROMPT_EN_VERSION
    const json = JSON.stringify(meta)
    sb.reference_images = json
    sb.referenceImages = json
  }
}

function updateNarrationImagePromptById(id, value) {
  const sb = sbs.value.find(item => item.id === id)
  if (sb) updateNarrationImagePrompt(sb, value)
}

function buildNarrationImageDetectLabel(detectSource, detectMode) {
  if (detectMode === 'paragraph' || detectSource === 'balanced' || detectSource === 'conservative') {
    if (detectSource === 'llm') return '按场景配图 · AI识别'
    if (detectSource === 'balanced' || detectSource === 'conservative') return '按场景配图 · 规则识别'
    return '按场景配图'
  }
  if (detectMode === 'conservative') {
    return detectSource === 'llm' ? '省钱 · AI识别' : '省钱 · 规则识别'
  }
  if (detectSource === 'llm') return '标准 · AI识别'
  if (detectSource === 'heuristic' || detectSource === 'balanced') return '标准 · 规则识别'
  return '标准'
}

function buildNarrationImagePromptLabel(promptSource) {
  if (promptSource === 'llm_raw') return '纯 LLM 文案'
  if (promptSource === 'optimized') return '已规则优化'
  if (promptSource === 'llm') return 'AI 配图文案'
  if (promptSource === 'template' || promptSource === 'rule' || promptSource === 'heuristic') return '规则配图文案'
  return null
}

const hasNarrationImageBreakdown = computed(() => {
  if (narrationImageDetectLiveCount.value > 0) return true
  if (narrationPromptDisplayCount.value > 0) return true
  const s = narrationBreakdownSummary.value
  if (!s) return false
  if (s.image_breakdown_at ?? s.imageBreakdownAt) return true
  if (s.image_detect_at ?? s.imageDetectAt) return true
  if (s.image_prompt_at ?? s.imagePromptAt) return true
  const paragraphCount = s.paragraph_count ?? s.paragraphCount
  const promptsGenerated = s.prompts_generated ?? s.promptsGenerated
  if (paragraphCount != null && Number(paragraphCount) > 0) return true
  if (promptsGenerated != null && Number(promptsGenerated) > 0) return true
  const detectSource = s.image_detect_source ?? s.imageDetectSource
  return !!detectSource
})

const narrationStoryboardBreakdownPanel = computed(() => {
  if (!isNarrationMode.value) return null
  const s = narrationBreakdownSummary.value
  const failedAt = s?.storyboard_breakdown_failed_at ?? s?.storyboardBreakdownFailedAt ?? null
  const errorMessage = s?.storyboard_breakdown_error ?? s?.storyboardBreakdownError ?? null
  const generatedAt = s?.storyboard_breakdown_at ?? s?.storyboardBreakdownAt ?? s?.generated_at ?? s?.generatedAt ?? null
  if (!sbs.value.length && !failedAt && !generatedAt) return null
  const liveCount = sbs.value.length
  const liveTitleCount = sbs.value.filter(sb => isNarrationTitleShot(sb)).length
  const liveBodyCount = liveCount - liveTitleCount
  const count = liveCount > 0 ? liveCount : (s?.count ?? 0)
  const sentenceCount = liveBodyCount > 0 ? liveBodyCount : (s?.sentence_count ?? s?.sentenceCount ?? 0)
  const titleCount = liveTitleCount > 0 ? liveTitleCount : (s?.title_count ?? s?.titleCount ?? 0)
  const titleImageCount = s?.title_image_count ?? s?.titleImageCount ?? (titleCount ? 1 : 0)
  const titleHook = s?.title_hook ?? s?.titleHook ?? null
  const totalDur = s?.total_duration ?? s?.totalDuration ?? totalDuration.value
  return {
    count,
    sentenceCount,
    titleCount,
    titleImageCount,
    titleHook,
    totalDur,
    generatedAt,
    failedAt,
    errorMessage,
  }
})

const narrationImageBreakdownPanel = computed(() => {
  if (!isNarrationMode.value || !sbs.value.length) return null
  const s = narrationBreakdownSummary.value
  const detectFailedAt = s?.image_detect_failed_at ?? s?.imageDetectFailedAt ?? null
  const promptFailedAt = s?.image_prompt_failed_at ?? s?.imagePromptFailedAt ?? null
  const detectCount = narrationDetectDisplayCount.value
  const promptCount = narrationPromptDisplayCount.value
  const diptychCount = s?.diptych_count ?? s?.diptychCount ?? 0
  const unitPrice = imageModelUnitPrice(episodeImageModel.value)
  const estImageCost = Math.round(detectCount * unitPrice * 100) / 100
  const priceLabel = imageModelPriceLabel(episodeImageModel.value)
  const detectSource = s?.image_detect_source ?? s?.imageDetectSource
  const detectMode = s?.image_detect_mode ?? s?.imageDetectMode ?? imageDetectMode.value
  const promptSource = s?.image_prompt_source ?? s?.imagePromptSource
  return {
    detectCount,
    promptCount,
    diptychCount,
    estImageCost,
    priceLabel,
    detectLabel: buildNarrationImageDetectLabel(detectSource, detectMode),
    promptLabel: buildNarrationImagePromptLabel(promptSource),
    detectAt: s?.image_detect_at ?? s?.imageDetectAt ?? null,
    detectFailedAt: s?.image_detect_failed_at ?? s?.imageDetectFailedAt ?? null,
    detectError: s?.image_detect_error ?? s?.imageDetectError ?? null,
    promptAt: s?.image_prompt_at ?? s?.imagePromptAt ?? null,
    promptFailedAt: s?.image_prompt_failed_at ?? s?.imagePromptFailedAt ?? null,
    promptError: s?.image_prompt_error ?? s?.imagePromptError ?? null,
    auditAt: s?.image_audit_at ?? s?.imageAuditAt ?? null,
    auditFailedAt: s?.image_audit_failed_at ?? s?.imageAuditFailedAt ?? null,
    auditError: s?.image_audit_error ?? s?.imageAuditError ?? null,
    optimizeAt: s?.image_optimize_at ?? s?.imageOptimizeAt ?? null,
    auditShotsWithIssues: s?.image_audit_shots_with_issues ?? s?.imageAuditShotsWithIssues ?? null,
    auditIssueCount: s?.image_audit_issue_count ?? s?.imageAuditIssueCount ?? null,
  }
})

function syncNarrationBreakdownImageCount() {
  if (!epId.value || !isNarrationMode.value || !sbs.value.length) return
  const liveDetect = narrationImageDetectLiveCount.value
  const livePrompts = narrationPromptLiveCount.value
  const prev = narrationBreakdownSummary.value || {}
  const cachedDetect = prev.paragraph_count ?? prev.paragraphCount ?? prev.image_needed_count ?? prev.imageNeededCount ?? 0
  const cachedPrompts = prev.prompts_generated ?? prev.promptsGenerated ?? 0
  if (narrationBreakdownSummary.value && liveDetect === cachedDetect && livePrompts === cachedPrompts) return
  if (!liveDetect && !livePrompts && !narrationBreakdownSummary.value) return
  persistNarrationBreakdownSummary({
    ...prev,
    image_needed_count: liveDetect,
    paragraph_count: liveDetect,
    prompts_generated: livePrompts,
  })
}

function persistLlmBreakdownFailure(kind: 'storyboard' | 'detect' | 'prompt', error: unknown) {
  if (isLlmCancelled(error)) return
  const ts = resolveLlmTimestamp()
  const message = llmErrorMessage(error)
  const patch = kind === 'storyboard'
    ? {
      storyboard_breakdown_failed_at: ts,
      storyboard_breakdown_error: message,
      storyboard_breakdown_at: null,
      generated_at: null,
    }
    : kind === 'detect'
      ? {
        image_detect_failed_at: ts,
        image_detect_error: message,
        image_detect_at: null,
      }
      : {
        image_prompt_failed_at: ts,
        image_prompt_error: message,
        image_prompt_at: null,
      }
  persistNarrationBreakdownSummary({ ...narrationBreakdownSummary.value, ...patch })
}

function clearLlmBreakdownFailure(kind: 'storyboard' | 'detect' | 'prompt') {
  const patch = kind === 'storyboard'
    ? { storyboard_breakdown_failed_at: null, storyboard_breakdown_error: null }
    : kind === 'detect'
      ? { image_detect_failed_at: null, image_detect_error: null }
      : { image_prompt_failed_at: null, image_prompt_error: null }
  persistNarrationBreakdownSummary({ ...narrationBreakdownSummary.value, ...patch })
}

function persistNarrationBreakdownSummary(res) {
  if (!epId.value) return
  const prev = narrationBreakdownSummary.value || {}
  const liveImageDetect = sbs.value.length ? narrationImageDetectLiveCount.value : null
  const storyboardAt = res?.storyboard_breakdown_at ?? res?.storyboardBreakdownAt ?? res?.generatedAt ?? prev.storyboard_breakdown_at ?? prev.storyboardBreakdownAt ?? prev.generated_at ?? prev.generatedAt ?? null
  const storyboardFailedAt = res?.storyboard_breakdown_failed_at !== undefined
    ? res.storyboard_breakdown_failed_at
    : (res?.storyboardBreakdownFailedAt !== undefined ? res.storyboardBreakdownFailedAt : prev.storyboard_breakdown_failed_at ?? prev.storyboardBreakdownFailedAt ?? null)
  const storyboardError = res?.storyboard_breakdown_error !== undefined
    ? res.storyboard_breakdown_error
    : (res?.storyboardBreakdownError !== undefined ? res.storyboardBreakdownError : prev.storyboard_breakdown_error ?? prev.storyboardBreakdownError ?? null)
  const imageAt = res?.image_breakdown_at ?? res?.imageBreakdownAt ?? prev.image_breakdown_at ?? prev.imageBreakdownAt ?? null
  const detectFailedAt = res?.image_detect_failed_at !== undefined
    ? res.image_detect_failed_at
    : (res?.imageDetectFailedAt !== undefined ? res.imageDetectFailedAt : prev.image_detect_failed_at ?? prev.imageDetectFailedAt ?? null)
  const detectError = res?.image_detect_error !== undefined
    ? res.image_detect_error
    : (res?.imageDetectError !== undefined ? res.imageDetectError : prev.image_detect_error ?? prev.imageDetectError ?? null)
  const promptFailedAt = res?.image_prompt_failed_at !== undefined
    ? res.image_prompt_failed_at
    : (res?.imagePromptFailedAt !== undefined ? res.imagePromptFailedAt : prev.image_prompt_failed_at ?? prev.imagePromptFailedAt ?? null)
  const promptError = res?.image_prompt_error !== undefined
    ? res.image_prompt_error
    : (res?.imagePromptError !== undefined ? res.imagePromptError : prev.image_prompt_error ?? prev.imagePromptError ?? null)
  const storyboardReset = !!(res?.storyboard_breakdown_at ?? res?.storyboardBreakdownAt)
  const detectCleared = !!(res?.image_detect_cleared ?? res?.imageDetectCleared)
  const liveTitleCount = sbs.value.filter(sb => isNarrationTitleShot(sb)).length
  const liveBodyCount = Math.max(0, sbs.value.length - liveTitleCount)
  const payload = {
    ...prev,
    ...res,
    count: sbs.value.length > 0 ? sbs.value.length : (res?.count ?? prev.count ?? 0),
    sentence_count: storyboardReset
      ? (liveBodyCount > 0 ? liveBodyCount : (res?.sentence_count ?? res?.sentenceCount ?? 0))
      : (liveBodyCount > 0 ? liveBodyCount : (res?.sentence_count ?? res?.sentenceCount ?? prev.sentence_count ?? prev.sentenceCount ?? 0)),
    title_count: storyboardReset
      ? (liveTitleCount > 0 ? liveTitleCount : (res?.title_count ?? res?.titleCount ?? 0))
      : (liveTitleCount > 0 ? liveTitleCount : (res?.title_count ?? res?.titleCount ?? prev.title_count ?? prev.titleCount ?? 0)),
    title_image_count: res?.title_image_count ?? res?.titleImageCount ?? prev.title_image_count ?? prev.titleImageCount ?? 0,
    title_hook: res?.title_hook ?? res?.titleHook ?? prev.title_hook ?? prev.titleHook ?? null,
    image_needed_count: detectCleared
      ? 0
      : (storyboardReset ? 0 : (liveImageDetect ?? res?.image_needed_count ?? res?.imageNeededCount ?? prev.image_needed_count ?? prev.imageNeededCount ?? 0)),
    paragraph_count: detectCleared
      ? 0
      : (storyboardReset ? 0 : (res?.paragraph_count ?? res?.paragraphCount ?? prev.paragraph_count ?? prev.paragraphCount ?? 0)),
    prompts_generated: detectCleared
      ? null
      : (storyboardReset ? null : (res?.prompts_generated ?? res?.promptsGenerated ?? prev.prompts_generated ?? prev.promptsGenerated ?? null)),
    diptych_count: detectCleared
      ? 0
      : (storyboardReset ? 0 : (res?.diptych_count ?? res?.diptychCount ?? prev.diptych_count ?? prev.diptychCount ?? 0)),
    image_detect_source: detectCleared
      ? null
      : (storyboardReset ? null : (res?.image_detect_source ?? res?.imageDetectSource ?? prev.image_detect_source ?? prev.imageDetectSource ?? null)),
    image_prompt_source: detectCleared
      ? null
      : (storyboardReset ? null : (res?.image_prompt_source ?? res?.imagePromptSource ?? prev.image_prompt_source ?? prev.imagePromptSource ?? null)),
    image_detect_mode: res?.image_detect_mode ?? res?.imageDetectMode ?? prev.image_detect_mode ?? prev.imageDetectMode ?? imageDetectMode.value,
    image_detect_at: detectCleared
      ? null
      : (storyboardReset ? null : (res?.image_detect_at ?? res?.imageDetectAt ?? prev.image_detect_at ?? prev.imageDetectAt ?? null)),
    image_prompt_at: detectCleared
      ? null
      : (storyboardReset ? null : (res?.image_prompt_at ?? res?.imagePromptAt ?? prev.image_prompt_at ?? prev.imagePromptAt ?? null)),
    total_duration: res?.total_duration ?? res?.totalDuration ?? prev.total_duration ?? prev.totalDuration ?? 0,
    storyboard_breakdown_at: storyboardAt,
    storyboard_breakdown_failed_at: storyboardAt ? null : storyboardFailedAt,
    storyboard_breakdown_error: storyboardAt ? null : storyboardError,
    image_breakdown_at: detectCleared ? null : (storyboardReset ? null : imageAt),
    image_detect_failed_at: detectCleared ? null : (storyboardReset ? null : (res?.image_detect_at ?? res?.imageDetectAt ? null : detectFailedAt)),
    image_detect_error: detectCleared ? null : (storyboardReset ? null : (res?.image_detect_at ?? res?.imageDetectAt ? null : detectError)),
    image_prompt_failed_at: detectCleared ? null : (storyboardReset ? null : (res?.image_prompt_at ?? res?.imagePromptAt ? null : promptFailedAt)),
    image_prompt_error: detectCleared ? null : (storyboardReset ? null : (res?.image_prompt_at ?? res?.imagePromptAt ? null : promptError)),
    generated_at: storyboardAt,
  }
  delete payload.image_detect_cleared
  delete payload.imageDetectCleared
  narrationBreakdownSummary.value = payload
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`episode-${epId.value}-narration-breakdown`, JSON.stringify(payload))
  }
}

function restoreNarrationBreakdownSummary() {
  if (typeof window === 'undefined' || !epId.value) return
  try {
    const raw = window.localStorage.getItem(`episode-${epId.value}-narration-breakdown`)
    narrationBreakdownSummary.value = raw ? JSON.parse(raw) : null
  } catch {
    narrationBreakdownSummary.value = null
  }
}

function formatBreakdownTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}
const narrationImageReady = computed(() => narrationImagesReady(sbs.value))
const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
const visualCharTotal = computed(() => visualChars.value.length)

const prodTabDefs = computed(() => {
  if (isDialoguePortraitMode.value) {
    return [
      { id: 'voice', label: '角色音色', icon: Mic2, badge: narratorReady.value ? '✓' : '' },
      {
        id: 'chars',
        label: '定妆/表情包',
        icon: Users,
        badge: visualCharTotal.value
          ? `${dialoguePortraitExpressionReadyCount.value}/${visualCharTotal.value}`
          : '',
      },
      {
        id: 'scenes',
        label: '场景背景',
        icon: MapPin,
        badge: scenes.value.length ? `${sceneImgCount.value}/${scenes.value.length}` : '',
      },
      { id: 'dubbing', label: '生成配音', icon: Mic2, badge: ttsEligibleCount.value ? `${ttsGeneratedCount.value}/${ttsEligibleCount.value}` : '' },
      { id: 'compose', label: '镜头合成', icon: Layers, badge: composableCount.value ? `${composedCount.value}/${composableCount.value}` : '' },
    ]
  }
  if (isNarrationMode.value) {
    const tabs = [
      { id: 'voice', label: '旁白音色', icon: Mic2, badge: narratorReady.value ? '✓' : '' },
      { id: 'chars', label: '定妆参考', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
      { id: 'shots', label: '生成配图', icon: ImageIcon, badge: narrationNeedImageCount.value ? `${shotImgCount.value}/${narrationNeedImageCount.value}` : '' },
    ]
    tabs.push(
      { id: 'dubbing', label: '生成配音', icon: Mic2, badge: ttsEligibleCount.value ? `${ttsGeneratedCount.value}/${ttsEligibleCount.value}` : '' },
      { id: 'bgm', label: 'BGM 配乐', icon: Music, badge: sbs.value.length ? `${bgmAppliedCount.value}/${sbs.value.length}` : '' },
      {
        id: 'videos',
        label: '本地视频（可选）',
        icon: Video,
        badge: composeUnitShots.value.length
          ? `${composeUnitShots.value.filter(hasVid).length}/${composeUnitShots.value.length}`
          : '',
      },
      { id: 'compose', label: '镜头合成', icon: Layers, badge: composableCount.value ? `${composedCount.value}/${composableCount.value}` : '' },
    )
    return tabs
  }
  return [
    { id: 'chars', label: '角色形象', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
    { id: 'scenes', label: '场景图片', icon: MapPin, badge: sceneImgCount.value ? `${sceneImgCount.value}/${scenes.value.length}` : '' },
    { id: 'dubbing', label: '配音生成', icon: Mic2, badge: '' },
    { id: 'bgm', label: 'BGM 配乐', icon: Music, badge: sbs.value.length ? `${bgmAppliedCount.value}/${sbs.value.length}` : '' },
    { id: 'shots', label: '镜头图片', icon: ImageIcon, badge: shotImgCount.value ? `${shotImgCount.value}/${sbs.value.length}` : '' },
    { id: 'videos', label: '视频生成（可选）', icon: Video, badge: shotVidCount.value ? `${shotVidCount.value}/${sbs.value.length}` : '' },
    { id: 'compose', label: '视频合成', icon: Layers, badge: composableCount.value ? `${composedCount.value}/${composableCount.value}` : '' },
  ]
})

const mainStageDefs = [
  { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
  { id: 'assets', label: '资产', desc: '角色、场景与音色', icon: FolderKanban },
  { id: 'storyboard', label: '分镜', desc: '镜头制作与合成', icon: Clapperboard },
  { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
]

const workflowState = computed(() => ({
  rawContent: !!rawContent.value,
  scriptContent: !!scriptContent.value,
  charsCount: visualChars.value.length,
  charsVoiced: charsVoiced.value,
  sbsCount: sbs.value.length,
  narratorReady: narratorReady.value,
  ttsEligibleCount: ttsEligibleCount.value,
  ttsGeneratedCount: ttsGeneratedCount.value,
  shotImgCount: shotImgCount.value,
  shotImgNeededCount: narrationNeedImageCount.value,
  narrationImagesReady: narrationImageReady.value,
  narrationTtsReady: narrationTtsReady.value,
  shotVidCount: shotVidCount.value,
  composedCount: composedCount.value,
  mergeUrl: !!mergeUrl.value,
  openingVideoUrl: !!openingVideoUrl.value,
  titleVideoUrl: !!titleVideoUrl.value,
  bgmAppliedCount: bgmAppliedCount.value,
  scenesCount: scenes.value.length,
  sceneImgCount: sceneImgCount.value,
  scenesReady: scenes.value.length > 0 && sceneImgCount.value === scenes.value.length,
  expressionPackReadyCount: dialoguePortraitExpressionReadyCount.value,
}))

const narrationIconMap = {
  'script:raw': FileText,
  'script:chat': Sparkles,
  'script:storyboard': Clapperboard,
  'prod:voice': Mic2,
  'prod:chars': Users,
  'prod:scenes': MapPin,
  'prod:dubbing': Mic2,
  'prod:bgm': Music,
  'prod:shots': ImageIcon,
  'prod:videos': Video,
  'prod:compose': Layers,
  'export:opening': Film,
  'export:title': Clapperboard,
  'export:merge': Download,
}

const sidebarSections = computed(() => {
  if (isNarrationMode.value) {
    const sections = buildSidebarSections(productionMode.value, workflowState.value) || []
    return sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        icon: narrationIconMap[item.key] || FileText,
      })),
    }))
  }
  return [
    {
      id: 'script',
      label: isLocalComicMode.value ? '本地短剧' : '剧本',
      items: [
        ...(isLocalComicMode.value ? [
          { key: 'script:chat', label: '剧本生成', desc: 'Ollama 写稿', icon: Sparkles, done: !!rawContent.value },
        ] : []),
        { key: 'script:raw', label: '原始内容', desc: '', icon: FileText, done: !!rawContent.value },
        { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText, done: !!scriptContent.value },
        { key: 'script:extract', label: '提取', desc: '', icon: Users, done: !!chars.value.length },
        { key: 'script:voice', label: '音色', desc: '', icon: Mic2, done: !!chars.value.length && charsVoiced.value === chars.value.length },
        { key: 'script:storyboard', label: '分镜', desc: '', icon: Clapperboard, done: !!sbs.value.length },
      ],
    },
    {
      id: 'production',
      label: '制作',
      items: [
        { key: 'prod:chars', label: '角色形象', desc: '', icon: Users, done: prodStepDone('chars') },
        { key: 'prod:scenes', label: '场景图片', desc: '', icon: MapPin, done: prodStepDone('scenes') },
        { key: 'prod:dubbing', label: '配音生成', desc: '', icon: Mic2, done: prodStepDone('dubbing') },
        { key: 'prod:bgm', label: 'BGM 配乐', desc: '', icon: Music, done: prodStepDone('bgm') },
        { key: 'prod:shots', label: '镜头图片', desc: '', icon: ImageIcon, done: prodStepDone('shots') },
        { key: 'prod:videos', label: '视频生成', desc: '', icon: Video, done: prodStepDone('videos') },
        { key: 'prod:compose', label: '视频合成', desc: '', icon: Layers, done: prodStepDone('compose') },
      ],
    },
    {
      id: 'export',
      label: '导出',
      items: [
        { key: 'export:opening', label: '开幕视频', desc: '', icon: Film, done: !!openingVideoUrl.value },
        { key: 'export:title', label: '片头视频', desc: '', icon: Clapperboard, done: !!titleVideoUrl.value },
        { key: 'export:merge', label: '拼接导出', desc: '', icon: Download, done: !!mergeUrl.value },
      ],
    },
  ]
})

const activeMainStage = computed(() => {
  if (panel.value === 'export') return 'export'
  if (isNarrationMode.value) {
    if (panel.value === 'production') return 'production'
    return 'script'
  }
  if (panel.value === 'production') {
    return ['chars', 'scenes'].includes(prodTab.value) ? 'assets' : 'storyboard'
  }
  if (scriptStep.value <= 1) return 'script'
  if (scriptStep.value <= 3) return 'assets'
  return 'storyboard'
})

function mainStageDone(stageId) {
  if (stageId === 'script') return !!scriptContent.value
  if (stageId === 'assets') {
    const charsReady = !!chars.value.length && charsVoiced.value === chars.value.length
    const charImagesReady = !visualCharTotal.value || charImgCount.value === visualCharTotal.value
    const sceneImagesReady = !scenes.value.length || sceneImgCount.value === scenes.value.length
    return charsReady && charImagesReady && sceneImagesReady
  }
  if (stageId === 'storyboard') {
    if (!sbs.value.length) return false
    const ttsReady = isNarrationMode.value
      ? narrationTtsReady.value
      : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value)
    return ttsReady
      && (isNarrationMode.value ? narrationImageReady.value : shotImgCount.value === sbs.value.length)
      && (isNarrationMode.value || shotVidCount.value === sbs.value.length)
      && composedCount.value === composableCount.value
  }
  if (stageId === 'export') return !!mergeUrl.value
  return false
}

function goMainStage(stageId) {
  if (stageId === 'script') {
    panel.value = 'script'
    scriptStep.value = Math.min(scriptStep.value, isNarrationMode.value ? 1 : 1)
    return
  }
  if (stageId === 'assets') {
    const hasAssetWorkspace = !!visualCharTotal.value || !!scenes.value.length
    const hasPendingAssetGeneration = (visualCharTotal.value && charImgCount.value < visualCharTotal.value)
      || (scenes.value.length && sceneImgCount.value < scenes.value.length)
    if (panel.value === 'production' || hasPendingAssetGeneration || hasAssetWorkspace) {
      panel.value = 'production'
      prodTab.value = ['chars', 'scenes'].includes(prodTab.value) ? prodTab.value : 'chars'
      return
    }
    panel.value = 'script'
    scriptStep.value = chars.value.length ? 3 : 2
    return
  }
  if (stageId === 'storyboard') {
    if (panel.value === 'production') {
      prodTab.value = ['dubbing', 'bgm', 'shots', 'videos', 'compose'].includes(prodTab.value) ? prodTab.value : 'dubbing'
      return
    }
    panel.value = 'script'
    scriptStep.value = 4
    return
  }
  panel.value = 'export'
}

const activeSubSteps = computed(() => {
  if (isNarrationMode.value) {
    if (panel.value === 'script') {
      return [
        { key: 'script:chat', label: '剧本生成', done: !!rawContent.value },
        { key: 'script:raw', label: '文案输入', done: !!rawContent.value },
        { key: 'script:storyboard', label: stepLabels.value[2], done: !!sbs.value.length },
      ]
    }
    if (panel.value === 'production') {
      return [
        { key: 'prod:voice', label: '旁白音色', done: narratorReady.value },
        { key: 'prod:chars', label: '定妆参考', done: !visualCharTotal.value || charImgCount.value === visualCharTotal.value },
        { key: 'prod:shots', label: '生成配图', done: !!sbs.value.length && narrationImageReady.value },
        { key: 'prod:dubbing', label: '生成配音', done: isNarrationMode.value ? narrationTtsReady.value : (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value) },
        { key: 'prod:bgm', label: 'BGM 配乐', done: bgmAppliedCount.value > 0 },
        { key: 'prod:videos', label: '本地视频', done: !!sbs.value.length && shotVidCount.value > 0 },
        { key: 'prod:compose', label: '镜头合成', done: composableCount.value > 0 && composedCount.value === composableCount.value },
      ]
    }
    return [
      { key: 'export:opening', label: '开幕视频', done: !!openingVideoUrl.value },
      { key: 'export:title', label: '片头视频', done: !!titleVideoUrl.value },
      { key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value },
    ]
  }
  if (activeMainStage.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
    ]
  }
  if (activeMainStage.value === 'assets') {
    return [
      { key: 'script:extract', label: '提取角色场景', done: !!chars.value.length },
      { key: 'script:voice', label: '分配音色', done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'prod:chars', label: '角色形象', done: !visualCharTotal.value || charImgCount.value === visualCharTotal.value },
      { key: 'prod:scenes', label: '场景图片', done: !scenes.value.length || sceneImgCount.value === scenes.value.length },
    ]
  }
  if (activeMainStage.value === 'storyboard') {
    return [
      { key: 'script:storyboard', label: '分镜拆解', done: !!sbs.value.length },
      { key: 'prod:dubbing', label: '配音生成', done: !ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value },
      { key: 'prod:bgm', label: 'BGM 配乐', done: bgmAppliedCount.value > 0 },
      { key: 'prod:shots', label: '镜头图片', done: !!sbs.value.length && shotImgCount.value === sbs.value.length },
      { key: 'prod:videos', label: '视频生成', done: !!sbs.value.length && shotVidCount.value === sbs.value.length },
      { key: 'prod:compose', label: '视频合成', done: composableCount.value > 0 && composedCount.value === composableCount.value },
    ]
  }
  return [
    { key: 'export:opening', label: '开幕视频', done: !!openingVideoUrl.value },
    { key: 'export:title', label: '片头视频', done: !!titleVideoUrl.value },
    { key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value },
  ]
})

const activeSubStepKey = computed(() => resolveActiveSubStepKey(productionMode.value, panel.value, scriptStep.value, prodTab.value, exportTab.value))

const sidebarJumpSteps = computed(() => {
  const section = sidebarSections.value.find((item) => item.items.some(step => step.key === activeSubStepKey.value))
  return section?.items || []
})

const bubbleSteps = computed(() => {
  if (panel.value === 'script') {
    if (isNarrationMode.value) {
      return [
        { key: 'script:chat', label: '剧本生成', done: !!rawContent.value },
        { key: 'script:raw', label: '文案输入', done: !!rawContent.value },
        { key: 'script:storyboard', label: stepLabels.value[2], done: !!sbs.value.length },
      ]
    }
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
      { key: 'script:extract', label: '提取', done: !!chars.value.length },
      { key: 'script:voice', label: '音色', done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'script:storyboard', label: '分镜', done: !!sbs.value.length },
    ]
  }
  if (panel.value === 'production') {
    return prodTabDefs.value.map(step => ({
      key: `prod:${step.id}`,
      label: step.label,
      done: prodStepDone(step.id),
    }))
  }
  return []
})

const activeBubbleKey = computed(() => {
  if (panel.value === 'script') return activeSubStepKey.value
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return ''
})

const showBottomBubble = computed(() => panel.value === 'script' || panel.value === 'production')

function goSubStep(key) {
  if (key.startsWith('script:')) {
    panel.value = 'script'
    scriptStep.value = resolveScriptStep(productionMode.value, key)
    if (usesLocalModelPipeline.value) syncLocalModelStage(key)
    return
  }
  if (key.startsWith('prod:')) {
    panel.value = 'production'
    prodTab.value = key.replace('prod:', '')
    if (usesLocalModelPipeline.value) syncLocalModelStage(key)
    return
  }
  if (key.startsWith('export:')) {
    panel.value = 'export'
    exportTab.value = key.replace('export:', '')
    if (usesLocalModelPipeline.value) syncLocalModelStage(key)
    return
  }
  panel.value = 'export'
  exportTab.value = 'merge'
  if (usesLocalModelPipeline.value) syncLocalModelStage('export:merge')
}

const pipelineProgress = computed(() => workflowProgress(productionMode.value, workflowState.value))

const currentStageLabel = computed(() => {
  if (panel.value === 'script') {
    if (isLocalComicMode.value) return `本地短剧 · ${stepLabels.value[scriptStep.value] || ''}`
    if (isDialoguePortraitMode.value) return `对话立绘 · ${stepLabels.value[scriptStep.value] || ''}`
    if (isNovelComicMode.value) return `小说漫画讲解 · ${stepLabels.value[scriptStep.value] || ''}`
    if (isMotionComicMode.value) return `漫画解说 · ${stepLabels.value[scriptStep.value] || ''}`
    return `${isNarrationLikeMode.value ? '解说' : '剧本'}阶段 · ${stepLabels.value[scriptStep.value] || ''}`
  }
  if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
  if (exportTab.value === 'opening') {
    return openingVideoUrl.value ? '导出阶段 · 开幕视频已生成' : '导出阶段 · 开幕视频'
  }
  if (exportTab.value === 'title') {
    return titleVideoUrl.value ? '导出阶段 · 片头视频已生成' : '导出阶段 · 片头视频'
  }
  return mergeUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
})

const currentMainStageLabel = computed(() => {
  const current = mainStageDefs.find(stage => stage.id === activeMainStage.value)
  return current?.label || '工作台'
})

const currentSubStageLabel = computed(() => {
  const current = activeSubSteps.value.find(step => step.key === activeSubStepKey.value)
  return current?.label || currentStageLabel.value
})

function inferLocalVoiceProvider(voiceId) {
  const raw = String(voiceId || '').trim()
  if (!raw) return ''
  if (/^(zh|en|ja|ko)-/i.test(raw)) return 'edge'
  if (/^gsv:/i.test(raw)) return localTtsEngine.value === 'indextts' ? 'indextts' : 'gptsovits'
  if (/^preset:/i.test(raw) || /^[0-9a-f-]{36}$/i.test(raw)) return 'voicebox'
  return ''
}

function updateCharVoice(charId, voiceId) {
  if (!voiceId) return
  const provider = inferLocalVoiceProvider(voiceId) || lockedAudioProvider.value || undefined
  characterAPI.update(charId, { voice_style: voiceId, voice_provider: provider || undefined })
  const c = chars.value.find(ch => ch.id === charId)
  if (c) {
    c.voice_style = voiceId
    c.voiceStyle = voiceId
    c.voice_provider = provider || ''
    c.voiceProvider = provider || ''
    c.voice_sample_url = ''
    c.voiceSampleUrl = ''
  }
  if (charVoicePreviewUrls.value[charId]) {
    const next = { ...charVoicePreviewUrls.value }
    delete next[charId]
    charVoicePreviewUrls.value = next
  }
}
function getVoiceProfile(voiceId) {
  if (isLocalComicMode.value) {
    return localCastVoiceProfiles.value.find(v => v.id === voiceId)
      || scriptVoiceProfiles.value.find(v => v.id === voiceId)
      || null
  }
  return voiceProfiles.value.find(v => v.id === voiceId)
    || localCastVoiceProfiles.value.find(v => v.id === voiceId)
    || edgeVoiceProfiles.value.find(v => v.id === voiceId)
    || null
}
const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))

const selectedSb = ref(null)
watch(selectedSb, sb => syncNarrationEditFromShot(sb), { immediate: true })

const shotTypes = [
  '大远景', '远景', '全景', '中景', '中近景', '近景', '特写', '大特写',
  '双人镜头', '三人镜头', '群像', '背影', '侧面', '正面', '俯视', '仰视',
  '过肩', '主观视角', '航拍', '运动镜头',
]
const shotAngles = ['平视', '仰视', '俯视', '侧拍', '背拍', '斜侧', '主观视角', '过肩']
const shotMovements = ['固定', '推镜', '拉镜', '摇镜', '移镜', '跟拍', '升降', '手持', '环绕']

function updateField(sb, field, value) {
  const current = sb[field] ?? sb[toCamel(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamel(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value })
}

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function getStoryboardCharacterIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function getStoryboardCharacterNames(sb) {
  const ids = getStoryboardCharacterIds(sb)
  return chars.value.filter(char => ids.includes(char.id)).map(char => formatCharacterDisplayName(char))
}

async function resolveShotCharacterIds(sb) {
  try {
    const resolved = await storyboardAPI.resolveCharacters(sb.id)
    const ids = resolved?.character_ids || []
    if (ids.length) {
      sb.character_ids = ids
      sb.characterIds = ids
    }
    return ids.length ? ids : getStoryboardCharacterIds(sb)
  } catch {
    return getStoryboardCharacterIds(sb)
  }
}

function isStoryboardCharacterSelected(sb, charId) {
  return getStoryboardCharacterIds(sb).includes(charId)
}

function toggleStoryboardCharacter(sb, charId) {
  const currentIds = getStoryboardCharacterIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  updateField(sb, 'character_ids', nextIds)
}

function getSceneName(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return '未绑定场景'
  const scene = scenes.value.find(s => s.id === sceneId)
  return scene ? `${scene.location} · ${scene.time || '未设时间'}` : `场景 #${sceneId}`
}

async function deleteShot(sb) {
  if (!confirm('确定删除此镜头？')) return
  const idx = sbs.value.indexOf(sb)
  await storyboardAPI.del(sb.id)
  await refresh()
  if (sbs.value.length) selectedSb.value = sbs.value[Math.min(idx, sbs.value.length - 1)]
  else selectedSb.value = null
}

const scriptSteps = computed(() => {
  const hasScript = !!scriptContent.value
  const hasChars = chars.value.length > 0 && hasScript
  const hasVoice = charsVoiced.value > 0 && hasChars
  const hasSbs = sbs.value.length > 0
  if (isLocalComicMode.value) {
    return [
      { label: '剧本生成', state: rawContent.value ? 'done' : 'active', spinning: false },
      { label: '原始内容', state: rawContent.value ? 'done' : '', spinning: false },
      { label: 'AI 改写', state: hasScript ? 'done' : (rawContent.value ? 'active' : ''), spinning: rt.value === 'script_rewriter' },
      { label: '提取', state: hasChars ? 'done' : (hasScript ? 'active' : ''), spinning: rt.value === 'extractor' },
      { label: '音色', state: hasVoice ? 'done' : (hasChars ? 'active' : ''), spinning: rt.value === 'voice_assigner' },
      { label: '分镜', state: hasSbs ? 'done' : (hasVoice ? 'active' : ''), spinning: rt.value === 'storyboard_breaker' },
    ]
  }
  return [
    { label: '原始内容', state: rawContent.value ? 'done' : 'active', spinning: false },
    { label: 'AI 改写', state: hasScript ? 'done' : (rawContent.value ? 'active' : ''), spinning: rt.value === 'script_rewriter' },
    { label: '提取', state: hasChars ? 'done' : (hasScript ? 'active' : ''), spinning: rt.value === 'extractor' },
    { label: '音色', state: hasVoice ? 'done' : (hasChars ? 'active' : ''), spinning: rt.value === 'voice_assigner' },
    { label: '分镜', state: hasSbs ? 'done' : (hasVoice ? 'active' : ''), spinning: rt.value === 'storyboard_breaker' },
  ]
})

watch(rawContent, v => {
  localRaw.value = v
}, { immediate: true })

watch(scriptChatMessages, msgs => {
  if (epId.value) saveScriptChatMessagesToStorage(epId.value, msgs)
}, { deep: true })

watch(imageDetectChatMessages, msgs => {
  if (epId.value) saveImageChatMessagesToStorage(IMAGE_DETECT_CHAT_STORAGE_PREFIX, epId.value, msgs)
}, { deep: true })

watch(imagePromptChatMessages, msgs => {
  if (epId.value) saveImageChatMessagesToStorage(IMAGE_PROMPT_CHAT_STORAGE_PREFIX, epId.value, msgs)
}, { deep: true })

watch(storyboardChatMessages, msgs => {
  if (epId.value) saveImageChatMessagesToStorage(STORYBOARD_CHAT_STORAGE_PREFIX, epId.value, msgs)
}, { deep: true })

watch(epId, (id, prev) => {
  if (id && id !== prev) {
    restoreScriptChatForEpisode(id)
    restoreImageDetectChatForEpisode(id)
    restoreImagePromptChatForEpisode(id)
    restoreStoryboardChatForEpisode(id)
  }
})
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

function syncSelectedStoryboardFromList(options?: { resetToFirst?: boolean }) {
  const list = sbs.value
  if (!list.length) {
    selectedSb.value = null
    return
  }
  if (options?.resetToFirst) {
    selectedSb.value = list[0]
    return
  }
  const prev = selectedSb.value
  if (!prev) {
    selectedSb.value = list[0]
    return
  }
  const prevNumber = prev.storyboard_number ?? prev.storyboardNumber
  if (prevNumber != null) {
    const byNumber = list.find(sb => (sb.storyboard_number ?? sb.storyboardNumber) === prevNumber)
    if (byNumber) {
      selectedSb.value = byNumber
      return
    }
  }
  const byId = list.find(sb => sb.id === prev.id)
  selectedSb.value = byId ?? list[0]
}

async function refreshStoryboardsOnly() {
  if (!epId.value) return
  sbs.value = sortStoryboards(await episodeAPI.storyboards(epId.value))
  syncSelectedStoryboardFromList()
}

function normalizeBgmLibraryRows(rows) {
  if (Array.isArray(rows)) return rows
  if (Array.isArray(rows?.items)) return rows.items
  return []
}

function mergeBgmLibraryRows(existing, incoming) {
  const map = new Map()
  for (const item of existing || []) map.set(item.id, item)
  for (const item of incoming || []) map.set(item.id, { ...map.get(item.id), ...item })
  return Array.from(map.values()).sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
}

function stopBgmPoll() {
  if (bgmPollTimer) {
    clearInterval(bgmPollTimer)
    bgmPollTimer = null
  }
}

async function tickBgmPoll(options = { resume: false }) {
  if (!dramaId) return
  try {
    const prevCompleted = bgmCompletedCount.value
    if (options.resume) {
      try { await musicAPI.resumePending({ drama_id: dramaId }) } catch {}
    }
    await loadBgmLibrary({ resumePoll: false })
    const pending = bgmPendingCount.value
    const nowCompleted = bgmCompletedCount.value
    if (nowCompleted > prevCompleted) {
      toast.success(`BGM 生成完成，新增 ${nowCompleted - prevCompleted} 首，共 ${nowCompleted} 首可用`)
      await refreshStoryboardsOnly()
    }
    if (!pending) stopBgmPoll()
  } catch (e) {
    console.warn('[BGM poll]', e?.message || e)
  }
}

function startBgmPoll() {
  stopBgmPoll()
  bgmPollTick = 0
  void tickBgmPoll({ resume: true })
  bgmPollTimer = setInterval(() => {
    bgmPollTick += 1
    void tickBgmPoll({ resume: bgmPollTick % 6 === 0 })
  }, 5000)
}

async function loadBgmLibrary(options = { resumePoll: true }) {
  if (!dramaId) return
  const rows = await musicAPI.list({ drama_id: dramaId })
  bgmLibrary.value = normalizeBgmLibraryRows(rows)
  if (options.resumePoll) {
    const pending = bgmLibrary.value.some(m => ['pending', 'processing'].includes(m.status))
    if (pending && !bgmPollTimer) startBgmPoll()
  }
}

async function refreshBgmLibrary() {
  if (!dramaId) return
  const pendingLead = bgmLibrary.value
    .filter(m => m.status === 'processing')
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))[0]
  if (pendingLead?.id) {
    try {
      await musicAPI.sync(pendingLead.id)
      toast.success('BGM 已同步完成')
      await loadBgmLibrary()
      return
    } catch (e) {
      console.warn('[BGM sync]', e?.message || e)
    }
  }
  try { await musicAPI.resumePending({ drama_id: dramaId }) } catch {}
  await loadBgmLibrary()
}

async function generateBgmDescription() {
  bgmDescGenerating.value = true
  try {
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('llm', { ollamaModel: resolveActiveLocalLlmModel(episodeTextModel.value) })
    }
    const sb = bgmTargetSbId.value ? sbs.value.find(s => s.id === bgmTargetSbId.value) : null
    const result = await musicAPI.suggestDescription({
      episode_id: epId.value,
      storyboard_id: sb?.id,
      model: bgmModel.value,
      text_model: usesLocalModelPipeline.value
        ? resolveActiveLocalLlmModel(episodeTextModel.value)
        : undefined,
      description: bgmDesc.value.trim() || undefined,
      content: sb ? getDialogueText(sb) : (localScript.value || scriptContent.value || localRaw.value || ''),
    })
    if (result?.description) {
      bgmDesc.value = result.description
      bgmDescGeneratedAt.value = pickLlmGeneratedAt(result) ?? resolveLlmTimestamp()
      bgmDescFailedAt.value = null
      bgmDescError.value = null
      toast.success('BGM 描述已生成')
    } else {
      bgmDescFailedAt.value = resolveLlmTimestamp()
      bgmDescError.value = 'AI 未返回描述'
      toast.error('AI 未返回描述')
    }
  } catch (e) {
    if (!isLlmCancelled(e)) {
      bgmDescGeneratedAt.value = null
      bgmDescFailedAt.value = resolveLlmTimestamp()
      bgmDescError.value = llmErrorMessage(e)
      toast.error(e.message)
    }
  } finally {
    bgmDescGenerating.value = false
  }
}

async function generateEpisodeBgm() {
  if (!bgmDesc.value.trim()) {
    toast.error('请填写 BGM 描述')
    return
  }
  if (bgmModel.value === 'pixverse-sound-effect' && !bgmTargetSbId.value) {
    toast.error('PixVerse 需关联已有合成/视频的镜头')
    return
  }
  if (bgmModel.value === 'pixverse-sound-effect' && bgmTargetSbId.value) {
    const sb = sbs.value.find(s => s.id === bgmTargetSbId.value)
    const hasVideo = sb && (sb.composed_video_url || sb.composedVideoUrl || sb.video_url || sb.videoUrl)
    if (!hasVideo) {
      toast.error('所选镜头尚无合成/视频，请先在「合成」步骤生成，或改用 Suno')
      return
    }
  }
  bgmGenerating.value = true
  try {
    const sb = bgmTargetSbId.value ? sbs.value.find(s => s.id === bgmTargetSbId.value) : null
    const result = await musicAPI.generate({
      drama_id: dramaId,
      episode_id: epId.value,
      storyboard_id: sb?.id,
      description: bgmDesc.value.trim(),
      content: sb ? getDialogueText(sb) : (localScript.value || scriptContent.value || ''),
      model: bgmModel.value,
      auto_apply: !!sb,
    })
    const createdItems = normalizeBgmLibraryRows(result?.items)
    await loadBgmLibrary({ resumePoll: false })
    if (createdItems.length) {
      bgmLibrary.value = mergeBgmLibraryRows(bgmLibrary.value, createdItems)
    }
    toast.success(createdItems.length ? 'BGM 已提交，正在生成…' : 'BGM 生成已提交，请稍候')
    startBgmPoll()
  } catch (e) {
    toast.error(e.message)
  } finally {
    bgmGenerating.value = false
  }
}

async function applyBgmToShot(musicId, storyboardId) {
  try {
    await musicAPI.apply(musicId, storyboardId)
    toast.success('已应用到镜头')
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message)
  }
}

function applyEpisodeFromDrama() {
  if (!drama.value) return null
  const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber.value)
  if (!ep) return null
  episode.value = ep
  syncExportWatermarkFromEpisode(ep)
  openingSubtitleText.value = resolveOpeningSubtitleText(ep.opening_subtitle_text || ep.openingSubtitleText)
  syncEpisodeImageModel(ep)
  syncEpisodeTextModel(ep)
  syncScriptChatModel(ep)
  syncScriptChatThinking(ep)
  syncEpisodeTextThinking(ep)
  syncReferPreviousEpisode(ep)
  return ep
}

function applyEpisodeDataAfterLoad(ep) {
  const epHasContent = !!(episode.value?.content)
  const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)
  const epHasSbs = sbs.value.length > 0

  if (isNarrationMode.value) {
    scriptStep.value = inferNarrationScriptStep(episode.value, sbs.value.length, visualChars.value.length)
    restoreScriptChatForEpisode(ep.id)
    restoreImageDetectChatForEpisode(ep.id)
    restoreImagePromptChatForEpisode(ep.id)
    restoreStoryboardChatForEpisode(ep.id)
    void ensureNarratorCharacter().catch(() => {})
  } else if (isLocalComicMode.value) {
    if (epHasSbs) scriptStep.value = LOCAL_DRAMA_STORYBOARD_STEP
    else if (epHasScript && chars.value.some(c => c.voice_style || c.voiceStyle)) scriptStep.value = LOCAL_DRAMA_VOICE_STEP
    else if (epHasScript && chars.value.length) scriptStep.value = LOCAL_DRAMA_EXTRACT_STEP
    else if (epHasScript) scriptStep.value = LOCAL_DRAMA_REWRITE_STEP
    else if (epHasContent) scriptStep.value = LOCAL_DRAMA_RAW_STEP
    else scriptStep.value = LOCAL_DRAMA_SCRIPT_CHAT_STEP
    restoreScriptChatForEpisode(ep.id)
  } else if (epHasSbs) scriptStep.value = 4
  else if (epHasScript && chars.value.some(c => c.voice_style || c.voiceStyle)) scriptStep.value = 3
  else if (epHasScript && chars.value.length) scriptStep.value = 2
  else if (epHasScript || epHasContent) scriptStep.value = 1
  else scriptStep.value = 0

  syncNarrationBreakdownImageCount()
  // 旁白类各模式 prodTab 不同（对话立绘含 scenes，不含 shots/videos）；按当前模式合法 tab 校正
  if (isNarrationMode.value && panel.value === 'production') {
    const allowed = new Set(prodTabDefs.value.map(t => t.id))
    if (!allowed.has(prodTab.value)) {
      prodTab.value = prodTabDefs.value[0]?.id || 'voice'
    }
  }
}

async function repairFluxPromptsSilently() {
  if (!usesLocalModelPipeline.value || !epId.value) return
  if (!sbs.value.some(sb => getNarrationFluxPromptEn(sb))) return
  try {
    const res = await episodeAPI.repairFluxPrompts(epId.value)
    if (res?.repaired) await refreshStoryboardsOnly()
  } catch {
    /* 静默修复，失败忽略 */
  }
}

async function refreshSecondary() {
  if (!epId.value) return
  const tasks: Promise<unknown>[] = [
    loadLatestGridImage(),
    loadBgmLibrary().catch(() => {}),
  ]
  tasks.push(
    mergeAPI.status(epId.value).then((data) => {
      mergeData.value = data
      if (['processing', 'pending'].includes(data?.status) || ['processing', 'pending'].includes(data?.test?.status)) {
        startMergePoll()
      }
    }).catch(() => {}),
    resumeNarrationImageBreakdownPollIfNeeded().catch(() => {}),
    resumeCharImagePollIfNeeded().catch(() => {}),
    resumeNarrationShotImagePollIfNeeded().catch(() => {}),
    resumeComposePollIfNeeded().catch(() => {}),
  )
  await Promise.allSettled(tasks)
}

function stampCharImageSuccess(charId: number, ts?: string | null) {
  charImageGeneratedAt.value = {
    ...charImageGeneratedAt.value,
    [charId]: ts ? String(ts) : resolveLlmTimestamp(),
  }
  charImageFailedAt.value = { ...charImageFailedAt.value, [charId]: null }
  charImageError.value = { ...charImageError.value, [charId]: null }
}

function stampCharImageFailure(charId: number, error: unknown) {
  if (isLlmCancelled(error)) return
  charImageGeneratedAt.value = { ...charImageGeneratedAt.value, [charId]: null }
  charImageFailedAt.value = { ...charImageFailedAt.value, [charId]: resolveLlmTimestamp() }
  charImageError.value = {
    ...charImageError.value,
    [charId]: typeof error === 'string' ? error : llmErrorMessage(error),
  }
}

function resolveCharImageDisplayTime(c: { id: number; image_url?: string; imageUrl?: string; updated_at?: string; updatedAt?: string }) {
  if (charImageFailedAt.value[c.id]) return null
  const stamped = charImageGeneratedAt.value[c.id]
  if (stamped) return stamped
  if (c.image_url || c.imageUrl) return c.updated_at || c.updatedAt || null
  return null
}

function charPortraitImageSrc(c: { image_url?: string; imageUrl?: string; updated_at?: string; updatedAt?: string }) {
  const path = String(c?.image_url || c?.imageUrl || '').replace(/^\//, '')
  if (!path) return ''
  const v = c?.updated_at || c?.updatedAt || ''
  return v ? `/${path}?v=${encodeURIComponent(String(v))}` : `/${path}`
}

/** 从 generation 立即写回角色定妆，避免 refresh 竞态 / 浏览器缓存旧图 */
function applyCharPortraitFromGeneration(charId, gen) {
  const path = String(gen?.local_path || gen?.localPath || gen?.image_url || gen?.imageUrl || '').trim()
  if (!path || !charId) return false
  const stamp = String(
    gen?.completed_at || gen?.completedAt || gen?.updated_at || gen?.updatedAt || '',
  ) || new Date().toISOString()
  const bust = `${stamp}|${path}`
  const next = chars.value.map((row) => {
    if (row.id !== charId) return row
    return {
      ...row,
      image_url: path,
      imageUrl: path,
      local_path: path,
      localPath: path,
      updated_at: bust,
      updatedAt: bust,
    }
  })
  chars.value = next
  stampCharImageSuccess(charId, bust)
  return true
}

function syncCharImageTimestampsFromChars() {
  const next = { ...charImageGeneratedAt.value }
  for (const c of chars.value) {
    const url = c.image_url || c.imageUrl
    const updatedAt = c.updated_at || c.updatedAt
    if (!url || !updatedAt) continue
    const existing = next[c.id]
    if (!existing || new Date(updatedAt) > new Date(existing)) {
      next[c.id] = String(updatedAt)
    }
  }
  charImageGeneratedAt.value = next
}

async function refresh(options?: { deferSecondary?: boolean; skipDramaRefetch?: boolean }) {
  const deferSecondary = options?.deferSecondary !== false
  const skipDramaRefetch = options?.skipDramaRefetch === true && !!drama.value
  episodeDataLoading.value = true
  try {
    if (!skipDramaRefetch) {
      drama.value = await dramaAPI.get(dramaId)
      syncNarrationImageStyleFromDrama()
    }
    const ep = applyEpisodeFromDrama()
    if (!ep) {
      toast.error('未找到该集')
      return
    }

    const [charsRes, scenesRes, sbsRes] = await Promise.all([
      episodeAPI.characters(ep.id).catch(() => []),
      episodeAPI.scenes(ep.id).catch(() => []),
      episodeAPI.storyboards(ep.id),
    ])
    chars.value = charsRes || []
    scenes.value = scenesRes || []
    sbs.value = sortStoryboards(sbsRes || [])
    syncCharImageTimestampsFromChars()
    syncSelectedStoryboardFromList()
    if (isNarrationMode.value) reconcileNarrationShotImageState()

    applyEpisodeDataAfterLoad(ep)

    if (hasDuplicateStoryboardNumbers(sbs.value)) {
      void fixDuplicateStoryboardNumbers()
    }
    void repairFluxPromptsSilently()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    episodeDataLoading.value = false
  }

  if (deferSecondary) {
    void refreshSecondary()
  } else {
    await refreshSecondary()
  }
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }

const lastScriptChatDraft = computed(() => {
  for (let i = scriptChatMessages.value.length - 1; i >= 0; i--) {
    const msg = scriptChatMessages.value[i]
    if (msg.role === 'assistant' && !msg.local && String(msg.content || '').trim()) {
      return String(msg.content).trim()
    }
  }
  return ''
})

const lastScriptChatDraftExtracted = computed(() => extractScriptFromChat(lastScriptChatDraft.value))
const lastScriptChatDraftCharCount = computed(() => countScriptChars(lastScriptChatDraftExtracted.value))

const scriptChatDraftHasEmphasis = computed(() => hasEmphasisMarkers(lastScriptChatDraft.value))
const rawHasEmphasis = computed(() => hasEmphasisMarkers(localRaw.value))

function replaceLastScriptChatDraft(content) {
  const next = String(content || '').trim()
  if (!next) return false
  for (let i = scriptChatMessages.value.length - 1; i >= 0; i--) {
    const msg = scriptChatMessages.value[i]
    if (msg.role === 'assistant' && !msg.local) {
      scriptChatMessages.value[i].content = next
      return true
    }
  }
  return false
}

function findScriptStartLineIndex(lines: string[]): number {
  const trimmedLines = lines.map(l => l.trim())
  const hookIdx = trimmedLines.findIndex(t =>
    /^今天体验的人生剧本是/.test(t)
    || /^(?:剧中\s*[:：]\s*)?(?:本期|本集)?故事\s*[:：]/.test(t)
    || /^标题\s*[:：]/.test(t),
  )
  if (hookIdx >= 0) return hookIdx

  for (let i = 0; i < trimmedLines.length; i++) {
    const t = trimmedLines[i]
    if (!t) continue
    if (/^[^：:\n]{1,12}[:：]/.test(t)) {
      const following = trimmedLines.slice(i).filter(Boolean)
      const speakerLines = following.filter(l => /^[^：:\n]{1,12}[:：]/.test(l))
      if (speakerLines.length >= 3 && following.length >= 4) return i
    }
  }
  return -1
}

function extractScriptFromChat(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''

  const fenced = raw.match(/```(?:markdown|text)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()

  const lines = raw.split('\n')
  const startIdx = findScriptStartLineIndex(lines)
  if (startIdx >= 0) return lines.slice(startIdx).join('\n').trim()

  // 多轮改稿：助手可能先一句确认，再空行输出正文；段间空行不能把后文截掉
  const blocks = raw.split(/\n\s*\n+/)
  for (let bi = 0; bi < blocks.length; bi++) {
    const blockLines = blocks[bi].split('\n')
    const relStart = findScriptStartLineIndex(blockLines)
    if (relStart >= 0) {
      const head = blockLines.slice(relStart).join('\n').trim()
      const tailBlocks = blocks.slice(bi + 1).map(b => b.trim()).filter(Boolean)
      return tailBlocks.length ? [head, ...tailBlocks].join('\n\n').trim() : head
    }
  }

  return raw
}

function countScriptChars(text) {
  return String(text || '').replace(/\s/g, '').length
}

function scrollScriptChatToBottom() {
  const el = scriptChatScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function clearScriptChat() {
  if (scriptChatGenerating.value) scriptChatAbortController.value?.abort()
  scriptChatMessages.value = defaultScriptChatMessages()
  scriptChatResolvedMinChars.value = null
  if (epId.value && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${SCRIPT_CHAT_STORAGE_PREFIX}${epId.value}`)
  }
  scriptChatInput.value = ''
}

function applyScriptChatToEditor(mode = 'replace', navigateToRaw = false) {
  const draft = lastScriptChatDraftExtracted.value
  if (!draft) {
    toast.warning(isLocalComicMode.value ? '暂无可填入的剧本' : (isMotionComicMode.value ? '暂无可填入的漫剧稿' : '暂无可填入的解说稿'))
    return
  }
  const chars = countScriptChars(draft)
  const minChars = scriptChatMinChars.value
  if (mode === 'append' && localRaw.value.trim()) {
    localRaw.value = `${localRaw.value.trim()}\n\n${draft}`
  } else {
    localRaw.value = draft
  }
  saveRaw()
  toast.success(mode === 'append' ? `已追加到文案（约 ${chars} 字）` : `已填入文案（约 ${chars} 字）`)
  if (chars < minChars) {
    toast.warning(`当前稿不足 ${minChars} 字，可在对话中说「扩写到 ${minChars} 字以上」让 AI 继续补全`)
  }
  if (navigateToRaw && isNarrationMode.value) goSubStep('script:raw')
}

function doScriptChatStripEmphasis() {
  const draft = extractScriptFromChat(lastScriptChatDraft.value)
  if (!draft) {
    toast.warning(isMotionComicMode.value ? '暂无可处理的漫剧稿' : '暂无可处理的解说稿')
    return
  }
  if (!hasEmphasisMarkers(draft)) {
    toast.info('当前稿没有 ** 标记')
    return
  }
  const stripped = stripEmphasisMarkers(draft)
  if (!replaceLastScriptChatDraft(stripped)) {
    toast.error('更新对话失败')
    return
  }
  toast.success('已去掉 ** 标记')
}

function stripRawEmphasis() {
  const raw = String(localRaw.value || '').trim()
  if (!raw) {
    toast.warning('暂无文案')
    return
  }
  if (!hasEmphasisMarkers(raw)) {
    toast.info('当前文案没有 ** 标记')
    return
  }
  localRaw.value = stripEmphasisMarkers(raw)
  saveRaw()
  toast.success('已去掉 ** 标记')
}

async function sendScriptChat() {
  const text = scriptChatInput.value.trim()
  if (!text || scriptChatGenerating.value || !epId.value) return

  scriptChatMessages.value.push({ role: 'user', content: text })
  scriptChatInput.value = ''
  scriptChatGenerating.value = true
  scriptChatMessages.value.push({ role: 'assistant', content: '', thinking: '' })
  const assistantIdx = scriptChatMessages.value.length - 1

  await nextTick()
  scrollScriptChatToBottom()

  const controller = new AbortController()
  scriptChatAbortController.value = controller

  try {
    const scriptModel = usesLocalModelPipeline.value
      ? resolveLocalScriptChatTextModel(episode.value)
      : scriptChatModel.value
    scriptChatModel.value = scriptModel

    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('llm', {
        ollamaModel: scriptModel,
        onProgress: (hint) => {
          scriptChatMessages.value[assistantIdx].statusText = hint
          scrollScriptChatToBottom()
        },
      })
      scriptChatMessages.value[assistantIdx].statusText = 'LLM 已就绪，正在连接模型…'
      scrollScriptChatToBottom()
    }

    const payloadMessages = scriptChatMessages.value
      .filter(msg => !msg.local)
      .slice(0, -1)
      .map(({ role, content }) => ({ role, content }))

    const scriptThinking = resolveScriptChatTextThinking(episode.value, episodeTextThinking.value)

    const result = await episodeAPI.narrationScriptChatStream(epId.value, {
      messages: payloadMessages,
      text_model: scriptModel,
      text_thinking: scriptThinking,
      script: (localRaw.value || localScript.value || '').trim() || undefined,
    }, {
      signal: controller.signal,
      onThinking: thinking => {
        scriptChatMessages.value[assistantIdx].statusText = ''
        scriptChatMessages.value[assistantIdx].thinking = thinking
        scrollScriptChatToBottom()
      },
      onStatus: statusText => {
        scriptChatMessages.value[assistantIdx].statusText = statusText
        scrollScriptChatToBottom()
      },
      onDelta: content => {
        scriptChatMessages.value[assistantIdx].statusText = ''
        scriptChatMessages.value[assistantIdx].content = content
        scrollScriptChatToBottom()
      },
    })
    if (result?.reply) {
      scriptChatMessages.value[assistantIdx].content = result.reply
    }
    scriptChatMessages.value[assistantIdx].statusText = ''
    stampChatAssistantGeneratedAt(scriptChatMessages.value, assistantIdx, result)
    const extracted = extractScriptFromChat(scriptChatMessages.value[assistantIdx].content || result?.reply || '')
    const chars = result?.char_count ?? countScriptChars(extracted)
    if (typeof result?.min_chars === 'number') {
      scriptChatResolvedMinChars.value = result.min_chars
    }
    const minChars = result?.min_chars ?? scriptChatMinChars.value
    const maxChars = result?.max_chars
    const targetChars = result?.target_chars
    if (result?.auto_expanded && chars >= minChars) {
      toast.success(`已自动扩写至约 ${chars} 字`)
    } else if (chars > 0 && chars < minChars) {
      toast.warning(`生成完成约 ${chars} 字，未达 ${minChars} 字要求。可说「扩写到 ${minChars} 字以上」继续补全。`)
    } else if (
      result?.user_length_specified
      && typeof maxChars === 'number'
      && chars > maxChars
    ) {
      const targetHint = typeof targetChars === 'number' ? targetChars : minChars
      toast.warning(`约 ${chars} 字，超出目标上限 ${maxChars}。可说「精简到约 ${targetHint} 字」`)
    }
    if (isMotionComicMode.value && typeof result?.narration_ratio === 'number') {
      const nPct = Math.round(result.narration_ratio * 100)
      if (result.narration_ratio > 0.35) {
        toast.warning(`旁白仍约占 ${nPct}%，可说「压旁白、多写对白」继续改到约 30/70`)
      } else if (result.dialogue_ratio_repaired) {
        toast.success(`已自动压旁白至约 ${nPct}%`)
      }
    }
  } catch (e) {
    if (!stampChatAssistantFailed(scriptChatMessages.value, assistantIdx, e)) {
      const msg = scriptChatMessages.value[assistantIdx]
      if (!msg?.content && !msg?.thinking && !msg?.statusText) {
        scriptChatMessages.value.splice(assistantIdx, 1)
      }
    }
    if (!isLlmCancelled(e)) toast.error(e.message)
  } finally {
    scriptChatGenerating.value = false
    scriptChatAbortController.value = null
    await nextTick()
    scrollScriptChatToBottom()
  }
}

function scrollImageDetectChatToBottom() {
  const el = imageDetectChatScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function scrollImagePromptChatToBottom() {
  const el = imagePromptChatScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function clearImageDetectChat() {
  if (imageDetectChatGenerating.value) imageDetectChatAbortController.value?.abort()
  imageDetectChatMessages.value = defaultImageDetectChatMessages()
  if (epId.value && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${IMAGE_DETECT_CHAT_STORAGE_PREFIX}${epId.value}`)
  }
  imageDetectChatInput.value = ''
}

function clearImagePromptChat() {
  if (imagePromptChatGenerating.value) imagePromptChatAbortController.value?.abort()
  imagePromptChatMessages.value = defaultImagePromptChatMessages()
  if (epId.value && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${IMAGE_PROMPT_CHAT_STORAGE_PREFIX}${epId.value}`)
  }
  imagePromptChatInput.value = ''
}

function resolveImageDetectChatAction(text: string, explicit?: 'run' | null) {
  if (explicit === 'run') return 'run' as const
  if (/^(开始|执行|重新|再次).*(检测|换镜|配图)/.test(text)) return 'run' as const
  return null
}

function resolveImagePromptChatAction(text: string, explicit?: 'run' | 'retry_missing' | null) {
  if (explicit) return explicit
  if (/补全.*(缺失|缺).*文案/.test(text)) return 'retry_missing' as const
  if (/^(开始|执行|重新|再次).*(生成|写).*(文案|prompt|配图)/.test(text)) return 'run' as const
  return null
}

async function sendImageDetectChat(explicitAction?: 'run') {
  const text = imageDetectChatInput.value.trim()
  const action = resolveImageDetectChatAction(text, explicitAction)
  if (!text && !action) return
  if (imageDetectChatGenerating.value || !epId.value) return

  try {
    await ensureLocalModelForTask('llm')
  } catch {
    return
  }

  const userText = text || '开始检测配图'
  imageDetectChatMessages.value.push({ role: 'user', content: userText })
  imageDetectChatInput.value = ''
  imageDetectChatGenerating.value = true
  if (action === 'run') {
    openNarrationImageBreakdownModal('detecting')
    narrationImageBreaking.value = true
    narrationImageBreakdownProgress.value = {
      status: 'processing',
      phase: 'detecting',
      message: '正在检测换镜配图…',
      percent: 1,
    }
    startNarrationImageBreakdownPoll()
  }
  imageDetectChatMessages.value.push({
    role: 'assistant',
    content: '',
    thinking: '',
  })
  const assistantIdx = imageDetectChatMessages.value.length - 1

  const controller = new AbortController()
  imageDetectChatAbortController.value = controller
  await nextTick()
  scrollImageDetectChatToBottom()

  try {
    const payloadMessages = imageDetectChatMessages.value
      .filter(msg => !msg.local)
      .slice(0, -1)
      .map(({ role, content }) => ({ role, content }))

    const detectThinking = textModelSupportsThinking(episodeTextModel.value)
      ? episodeTextThinking.value
      : false
    const result = await episodeAPI.narrationImageDetectChatStream(epId.value, {
      messages: payloadMessages,
      text_model: episodeTextModel.value,
      text_thinking: detectThinking,
      action: action ?? undefined,
      style: getNarrationImageStyle(),
      image_detect_mode: imageDetectMode.value === 'conservative' ? 'conservative' : 'paragraph',
      detect_batch_threshold: imageDetectBatchThreshold.value,
      detect_batch_size: imageDetectBatchSize.value,
    }, {
      signal: controller.signal,
      onThinking: thinking => {
        imageDetectChatMessages.value[assistantIdx].thinking = thinking
        scrollImageDetectChatToBottom()
      },
      onDelta: content => {
        imageDetectChatMessages.value[assistantIdx].content = content
        scrollImageDetectChatToBottom()
      },
      onStatus: content => {
        imageDetectChatMessages.value[assistantIdx].statusText = content
        scrollImageDetectChatToBottom()
      },
      onProgress: payload => {
        if (payload?.type === 'detect_done' && action === 'run') {
          const ts = resolveLlmTimestamp(pickLlmGeneratedAt(payload), payload?.image_detect_at)
          persistNarrationBreakdownSummary({
            ...narrationBreakdownSummary.value,
            image_needed_count: narrationDetectDisplayCount.value,
            paragraph_count: narrationDetectDisplayCount.value,
            image_detect_at: ts,
            image_detect_source: payload?.image_detect_source ?? 'llm',
          })
        }
      },
    })

    if (result?.reply) {
      const msg = imageDetectChatMessages.value[assistantIdx]
      msg.content = result.reply
    }
    stampChatAssistantGeneratedAt(imageDetectChatMessages.value, assistantIdx, result)

    if (action === 'run') {
      clearLlmBreakdownFailure('detect')
      await refresh()
      syncNarrationBreakdownImageCount()
      const count = narrationDetectDisplayCount.value
      const ts = resolveLlmTimestamp(
        pickLlmGeneratedAt(result),
        narrationBreakdownSummary.value?.image_detect_at,
      )
      const source = narrationBreakdownSummary.value?.image_detect_source
        || result?.image_detect_source
        || result?.imageDetectSource
        || 'llm'
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        image_needed_count: count,
        paragraph_count: count,
        image_detect_at: ts,
        image_detect_source: source,
      })
      if (source && source !== 'llm') {
        toast.warning('LLM 检测未完全成功，已用规则兜底分段（可稍后再试 AI 检测）')
      }
    }
  } catch (e) {
    if (action === 'run') persistLlmBreakdownFailure('detect', e)
    if (!stampChatAssistantFailed(imageDetectChatMessages.value, assistantIdx, e)) {
      const msg = imageDetectChatMessages.value[assistantIdx]
      if (!msg?.content && !msg?.thinking && !msg?.statusText) {
        imageDetectChatMessages.value.splice(assistantIdx, 1)
      }
    }
    if (!isLlmCancelled(e)) toast.error(e.message)
  } finally {
    imageDetectChatGenerating.value = false
    imageDetectChatAbortController.value = null
    if (action === 'run') {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
      try {
        narrationImageBreakdownProgress.value = await episodeAPI.narrationImageBreakdownStatus(epId.value)
      } catch {}
    }
    await nextTick()
    scrollImageDetectChatToBottom()
  }
}

async function sendImagePromptChat(explicitAction?: 'run' | 'retry_missing') {
  const text = imagePromptChatInput.value.trim()
  const action = resolveImagePromptChatAction(text, explicitAction)
  if (!text && !action) return
  if (imagePromptChatGenerating.value || !epId.value) return

  try {
    await ensureLocalModelForTask('llm')
  } catch {
    return
  }

  const userText = text || (action === 'retry_missing' ? '补全缺失配图文案' : '开始生成配图文案')
  imagePromptChatMessages.value.push({ role: 'user', content: userText })
  imagePromptChatInput.value = ''
  imagePromptChatGenerating.value = true
  if (action) {
    openNarrationImageBreakdownModal('prompts')
    narrationImageBreaking.value = true
    narrationImageBreakdownProgress.value = {
      status: 'processing',
      phase: 'prompts',
      message: action === 'retry_missing' ? '正在补全缺失配图文案…' : '正在生成配图文案…',
      percent: 1,
    }
    startNarrationImageBreakdownPoll()
  }
  imagePromptChatMessages.value.push({
    role: 'assistant',
    content: '',
    thinking: '',
  })
  const assistantIdx = imagePromptChatMessages.value.length - 1

  const controller = new AbortController()
  imagePromptChatAbortController.value = controller
  await nextTick()
  scrollImagePromptChatToBottom()

  try {
    const payloadMessages = imagePromptChatMessages.value
      .filter(msg => !msg.local)
      .slice(0, -1)
      .map(({ role, content }) => ({ role, content }))

    const promptThinking = textModelSupportsThinking(episodeTextModel.value)
      ? episodeTextThinking.value
      : false
    const result = await episodeAPI.narrationImagePromptChatStream(epId.value, {
      messages: payloadMessages,
      text_model: episodeTextModel.value,
      text_thinking: promptThinking,
      action: action ?? undefined,
      style: getNarrationImageStyle(),
      prompt_batch_size: imagePromptBatchSize.value,
    }, {
      signal: controller.signal,
      onThinking: thinking => {
        imagePromptChatMessages.value[assistantIdx].thinking = thinking
        scrollImagePromptChatToBottom()
      },
      onDelta: content => {
        imagePromptChatMessages.value[assistantIdx].content = content
        scrollImagePromptChatToBottom()
      },
      onStatus: content => {
        imagePromptChatMessages.value[assistantIdx].statusText = content
        scrollImagePromptChatToBottom()
      },
      onProgress: payload => {
        if (payload?.type === 'prompts_saved') {
          void refreshStoryboardsOnly()
          return
        }
        if (payload?.type === 'prompt_done' && action) {
          const ts = resolveLlmTimestamp(pickLlmGeneratedAt(payload), payload?.image_prompt_at)
          persistNarrationBreakdownSummary({
            ...narrationBreakdownSummary.value,
            prompts_generated: narrationPromptDisplayCount.value,
            image_prompt_at: ts,
            image_prompt_source: 'llm_raw',
          })
        }
      },
    })

    if (result?.reply) {
      const msg = imagePromptChatMessages.value[assistantIdx]
      msg.content = result.reply
    }
    stampChatAssistantGeneratedAt(imagePromptChatMessages.value, assistantIdx, result)

    if (action) {
      clearLlmBreakdownFailure('prompt')
      await refresh()
      syncNarrationBreakdownImageCount()
      const ts = resolveLlmTimestamp(
        pickLlmGeneratedAt(result),
        narrationBreakdownSummary.value?.image_prompt_at,
      )
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        prompts_generated: narrationPromptDisplayCount.value,
        image_prompt_at: ts,
        image_prompt_source: 'llm_raw',
      })
      const missing = narrationMissingPromptCount.value
      if (missing > 0) {
        toast.warning(`仍有 ${missing} 段文案未生成，请点「补全缺失文案」继续（已自动跳过失败批次）`)
      }
    }
  } catch (e) {
    if (action) persistLlmBreakdownFailure('prompt', e)
    if (!stampChatAssistantFailed(imagePromptChatMessages.value, assistantIdx, e)) {
      const msg = imagePromptChatMessages.value[assistantIdx]
      if (!msg?.content && !msg?.thinking && !msg?.statusText) {
        imagePromptChatMessages.value.splice(assistantIdx, 1)
      }
    }
    if (!isLlmCancelled(e)) toast.error(e.message)
  } finally {
    imagePromptChatGenerating.value = false
    imagePromptChatAbortController.value = null
    if (action) {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
      try {
        narrationImageBreakdownProgress.value = await episodeAPI.narrationImageBreakdownStatus(epId.value)
      } catch {}
    }
    await nextTick()
    scrollImagePromptChatToBottom()
  }
}

function scrollStoryboardChatToBottom() {
  const el = storyboardChatScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function clearStoryboardChat() {
  if (storyboardChatGenerating.value) storyboardChatAbortController.value?.abort()
  storyboardChatMessages.value = defaultStoryboardChatMessages()
  if (epId.value && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${STORYBOARD_CHAT_STORAGE_PREFIX}${epId.value}`)
  }
  storyboardChatInput.value = ''
}

function resolveStoryboardChatAction(text: string, explicit?: 'run' | null) {
  if (explicit === 'run') return 'run' as const
  if (/^(开始|执行|重新|再次).*(分镜|拆镜)/.test(text)) return 'run' as const
  return null
}

async function sendStoryboardChat(explicitAction?: 'run') {
  const text = storyboardChatInput.value.trim()
  const action = resolveStoryboardChatAction(text, explicitAction)
  if (!text && !action) return
  if (storyboardChatGenerating.value || !epId.value) return

  const userText = text || '开始分镜'
  storyboardChatMessages.value.push({ role: 'user', content: userText })
  storyboardChatInput.value = ''
  storyboardChatGenerating.value = true
  storyboardChatMessages.value.push({
    role: 'assistant',
    content: '',
    thinking: '',
  })
  const assistantIdx = storyboardChatMessages.value.length - 1

  const controller = new AbortController()
  storyboardChatAbortController.value = controller
  await nextTick()
  scrollStoryboardChatToBottom()

  try {
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('llm', {
        onProgress: (hint) => {
          storyboardChatMessages.value[assistantIdx].statusText = hint
          scrollStoryboardChatToBottom()
        },
      })
      storyboardChatMessages.value[assistantIdx].statusText = 'LLM 已就绪，正在连接模型…'
      scrollStoryboardChatToBottom()
    }

    let script: string | undefined
    if (action === 'run') {
      script = await saveNarrationScript()
    }

    const payloadMessages = storyboardChatMessages.value
      .filter(msg => !msg.local)
      .slice(0, -1)
      .map(({ role, content }) => ({ role, content }))

    const result = await episodeAPI.narrationStoryboardChatStream(epId.value, {
      messages: payloadMessages,
      ...narrationTextModelParams(),
      action: action ?? undefined,
      script,
    }, {
      signal: controller.signal,
      onThinking: thinking => {
        storyboardChatMessages.value[assistantIdx].statusText = ''
        storyboardChatMessages.value[assistantIdx].thinking = thinking
        scrollStoryboardChatToBottom()
      },
      onDelta: content => {
        storyboardChatMessages.value[assistantIdx].statusText = ''
        storyboardChatMessages.value[assistantIdx].content = content
        scrollStoryboardChatToBottom()
      },
      onStatus: content => {
        storyboardChatMessages.value[assistantIdx].statusText = content
        scrollStoryboardChatToBottom()
      },
      onProgress: payload => {
        if (payload.type === 'storyboard_done') {
          void applyStoryboardBreakdownProgress(payload)
        }
      },
    })

    if (result?.reply) {
      const msg = storyboardChatMessages.value[assistantIdx]
      msg.content = result.reply
    }
    stampChatAssistantGeneratedAt(storyboardChatMessages.value, assistantIdx, result)

    if (action === 'run') {
      const res = result?.breakdown || {}
      await finalizeStoryboardBreakdown(res)
    }
  } catch (e) {
    if (action === 'run') persistLlmBreakdownFailure('storyboard', e)
    if (!stampChatAssistantFailed(storyboardChatMessages.value, assistantIdx, e)) {
      const msg = storyboardChatMessages.value[assistantIdx]
      if (!msg?.content && !msg?.thinking && !msg?.statusText) {
        storyboardChatMessages.value.splice(assistantIdx, 1)
      }
    }
    if (!isLlmCancelled(e)) toast.error(e.message)
  } finally {
    storyboardChatGenerating.value = false
    storyboardChatAbortController.value = null
    await nextTick()
    scrollStoryboardChatToBottom()
  }
}

watch(() => scriptStep.value, step => {
  if (isComicStoryboardMode.value && step === storyboardStep.value) {
    nextTick(() => scrollStoryboardChatToBottom())
  }
  if (isLocalComicMode.value && step === LOCAL_DRAMA_VOICE_STEP) {
    void loadLocalCastVoices()
    void refreshLocalVoices()
  }
  if (usesLocalModelPipeline.value) {
    syncLocalModelStage(resolveActiveSubStepKey(productionMode.value, 'script', step, prodTab.value, exportTab.value))
  }
})

watch(() => scriptStep.value, step => {
  if (isNarrationMode.value && step === narrationScriptChatStep()) {
    nextTick(() => scrollScriptChatToBottom())
  }
  if (isLocalComicMode.value && step === LOCAL_DRAMA_SCRIPT_CHAT_STEP) {
    nextTick(() => scrollScriptChatToBottom())
  }
})

async function saveNarrationScript() {
  const script = (localRaw.value || localScript.value || '').trim()
  if (!script) {
    throw new Error(isLocalComicMode.value ? '请先填写剧本' : (usesComicStoryboardRules.value ? '请先填写漫剧旁白稿' : '请先填写解说文案'))
  }
  localScript.value = script
  localRaw.value = script
  await Promise.all([
    episodeAPI.update(epId.value, { content: script, script_content: script }),
  ])
  episode.value.content = script
  episode.value.script_content = script
  return script
}

function saveScr() {
  void ensureEpisodeScriptPersisted().catch((e) => toast.error(e.message))
}

function doRewrite() {
  void (async () => {
    try {
      await ensureEpisodeScriptPersisted()
    } catch (e) {
      toast.error(e.message)
      return
    }
    await runLocalComicAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', refresh)
  })()
}
function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  localScript.value = raw
  void ensureEpisodeScriptPersisted()
    .then(() => toast.success('已跳过 AI 改写，当前将直接使用原始内容'))
    .then(() => { scriptStep.value = isLocalComicMode.value ? dramaExtractStep.value : 2 })
    .catch((e) => toast.error(e.message))
}
function doExtract() {
  void (async () => {
    try {
      await ensureEpisodeScriptPersisted()
    } catch (e) {
      toast.error(e.message)
      return
    }
    if (usesLocalModelPipeline.value) {
      const llmModel = resolveLocalExtractModel(episodeTextModel.value)
      try {
        await ensureLocalModelForTask('llm', { ollamaModel: llmModel })
      } catch (e) {
        toast.error(e?.message || '本地 LLM 未就绪，请确认 Ollama 已启动')
        return
      }
      if (!tryBeginBatch('extract', '正在提取角色与场景…')) return
      try {
        const script = resolveEpisodeScriptDraft()
        const result = await episodeAPI.extract(epId.value, {
          script,
          text_model: llmModel,
          text_thinking: false,
        })
        const charsTotal = Number(result?.characters?.created || 0) + Number(result?.characters?.merged || 0)
        const scenesTotal = Number(result?.scenes?.created || 0) + Number(result?.scenes?.reused || 0)
        if (!charsTotal && !scenesTotal) {
          toast.warning('未从剧本中识别到角色或场景，请检查剧本内容后重试')
        } else {
          toast.success(`提取完成：${charsTotal} 个角色 · ${scenesTotal} 个场景`)
        }
        await refresh()
      } catch (e) {
        toast.error(e.message)
      } finally {
        endBatch('extract')
      }
      return
    }
    await runLocalComicAgent('extractor', '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并', refresh)
  })()
}
function doVoice() { runLocalComicAgent('voice_assigner', '请为所有角色分配合适的音色', refresh) }
async function batchGenSamples() {
  const pending = chars.value.filter(c => (c.voice_style || c.voiceStyle) && !(c.voice_sample_url || c.voiceSampleUrl))
  if (!pending.length) {
    toast.info(charsVoiced.value ? '所有角色的试听文件已生成' : '请先分配音色')
    return
  }
  if (usesLocalModelPipeline.value) {
    try {
      await ensureLocalModelForTask('audio')
    } catch {
      return
    }
  }
  if (!tryBeginBatch('voiceSamples', '正在批量生成试听文件…')) return
  try {
    const results = await Promise.allSettled(pending.map(c => characterAPI.voiceSample(c.id, epId.value)))
    const okCount = results.filter(r => r.status === 'fulfilled').length
    const failCount = results.length - okCount
    if (okCount) toast.success(`已生成 ${okCount} 份试听文件`)
    if (failCount) toast.error(`${failCount} 份试听文件生成失败`)
    await refresh()
  } finally {
    endBatch('voiceSamples')
  }
}
function doBreakdown() {
  void (async () => {
    try {
      await ensureEpisodeScriptPersisted()
    } catch (e) {
      toast.error(e.message)
      return
    }
    if (!chars.value.length) {
      toast.warning('请先在「提取」步骤提取角色与场景，再拆解分镜')
      return
    }
    const cfg = videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)
    const label = cfg ? `${cfg.name} (${cfg.provider})` : '默认'

    if (usesLocalModelPipeline.value) {
      const llmModel = resolveLocalExtractModel(episodeTextModel.value)
      try {
        await ensureLocalModelForTask('llm', { ollamaModel: llmModel })
      } catch (e) {
        toast.error(e?.message || '本地 LLM 未就绪，请确认 Ollama 已启动')
        return
      }
      if (!tryBeginBatch('storyboardBreakdown', '正在拆解分镜并生成提示词…')) return
      storyboardBreaking.value = true
      try {
        const script = resolveEpisodeScriptDraft()
        const result = await episodeAPI.storyboardBreakdown(epId.value, {
          script,
          text_model: llmModel,
          video_model_label: label,
        })
        const count = Number(result?.count || 0)
        if (!count) {
          toast.warning('未生成有效分镜，请确认剧本含场景与对白后重试')
        } else {
          toast.success(`分镜拆解完成：${count} 镜`)
        }
        await refresh()
      } catch (e) {
        toast.error(e.message)
      } finally {
        storyboardBreaking.value = false
        endBatch('storyboardBreakdown')
      }
      return
    }

    await runLocalComicAgent(
      'storyboard_breaker',
      `请读取剧本上下文，拆解分镜并生成视频提示词，完成后务必调用 save_storyboards 保存。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`,
      refresh,
    )
  })()
}
function restoreImageDetectModePrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const mode = window.localStorage.getItem(`episode-${epId.value}-image-detect-mode`)
  if (mode === 'paragraph' || mode === 'balanced' || mode === 'conservative') imageDetectMode.value = 'paragraph'
}

function restoreImageDetectBatchPrefs() {
  if (typeof window === 'undefined') return
  const th = window.localStorage.getItem('huobao-narration-detect-batch-threshold')
  const sz = window.localStorage.getItem('huobao-narration-detect-batch-size')
  const psz = window.localStorage.getItem('huobao-narration-prompt-batch-size')
  if (th !== null) {
    const n = Number(th)
    if (Number.isFinite(n) && n >= 0) imageDetectBatchThreshold.value = Math.round(n)
  }
  if (sz !== null) {
    const n = Number(sz)
    if (Number.isFinite(n) && n >= 10) imageDetectBatchSize.value = Math.round(n)
  }
  // 默认每批 5 段（与后端对齐）；旧 localStorage=1 视为误设，升到 5
  if (psz !== null) {
    const n = Number(psz)
    if (Number.isFinite(n) && n >= 1 && n <= 20) {
      imagePromptBatchSize.value = n === 1 ? 5 : Math.round(n)
    }
  } else {
    imagePromptBatchSize.value = 5
  }
}

function persistImageDetectBatchPrefs() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('huobao-narration-detect-batch-threshold', String(imageDetectBatchThreshold.value))
  window.localStorage.setItem('huobao-narration-detect-batch-size', String(imageDetectBatchSize.value))
  window.localStorage.setItem('huobao-narration-prompt-batch-size', String(imagePromptBatchSize.value))
}

async function applyStoryboardBreakdownProgress(res) {
  await refreshStoryboardsOnly()
  scriptStoryboardPage.value = 1
  clearLlmBreakdownFailure('storyboard')
  persistNarrationBreakdownSummary({
    ...res,
    storyboard_breakdown_at: resolveLlmTimestamp(res?.generated_at, res?.storyboard_breakdown_at),
  })
}

async function finalizeStoryboardBreakdown(res) {
  await applyStoryboardBreakdownProgress(res)
  const apiCount = Number(res?.count ?? 0)
  if (apiCount > 0 && sbs.value.length > 0 && apiCount !== sbs.value.length) {
    console.warn('[storyboard] API count vs loaded storyboards mismatch', {
      apiCount,
      loaded: sbs.value.length,
    })
  }
  await refresh()
  if (isMotionComicMode.value) {
    try {
      await syncMotionComicVoicesAfterScript({ silent: true })
    } catch (e) {
      toast.warning(e.message || '分镜已完成，但按文案自动分配音色失败，请在「角色音色」点「重新分配」')
    }
  } else {
    await ensureNarratorCharacter()
  }
}

function doNarrationBreakdown() {
  narrationBreaking.value = true
  void (async () => {
    try {
      const script = await saveNarrationScript()
      toast.info('正在整稿拆镜并标注字幕强调…')
      const res = await episodeAPI.narrationStoryboardBreakdown(epId.value, {
        script,
        ...narrationTextModelParams(),
      })
      const titleCount = res?.title_count ?? res?.titleCount ?? 0
      const titleHook = res?.title_hook ?? res?.titleHook
      const sentenceCount = res?.sentence_count ?? res?.sentenceCount ?? 0
      const titleHint = titleCount
        ? `，片头 ${titleCount} 镜${titleHook ? `（${titleHook}）` : ''}`
        : usesComicStoryboardRules.value
          ? '，未识别片头（首行请写「标题：」或「本期故事：…」）'
          : '，未识别片头标题（首行请写「标题：」或「今天体验的人生剧本是…」）'
      const sbLabel = usesComicStoryboardRules.value ? '旁白分镜' : '旁白分镜'
      toast.success(`${sbLabel}：${sentenceCount} 句 → ${res?.count || 0} 镜${titleHint}`)
      await finalizeStoryboardBreakdown(res)
    } catch (e) {
      persistLlmBreakdownFailure('storyboard', e)
      if (!isLlmCancelled(e)) toast.error(e.message)
    } finally {
      narrationBreaking.value = false
    }
  })()
}

function stopNarrationImageBreakdownPoll() {
  if (narrationImageBreakdownPollTimer) {
    clearInterval(narrationImageBreakdownPollTimer)
    narrationImageBreakdownPollTimer = null
  }
}

async function pollNarrationImageBreakdownProgress() {
  if (!epId.value) return
  try {
    const progress = await episodeAPI.narrationImageBreakdownStatus(epId.value)
    const localStepActive = !!narrationImageStep.value
    const prevSeq = narrationImageBreakdownProgress.value?.prompts_saved_seq
    const prevSaved = narrationImageBreakdownProgress.value?.prompts_saved

    if (progress?.status === 'processing') {
      narrationImageBreakdownProgress.value = progress
      narrationImageBreaking.value = true
      // 每段落库后刷新，页面左右中英文文案即时出现
      if (
        progress.phase === 'prompts'
        && (progress.prompts_saved_seq !== prevSeq || progress.prompts_saved !== prevSaved)
        && (progress.prompts_saved != null || progress.prompts_saved_seq != null)
      ) {
        void refreshStoryboardsOnly()
      }
      return
    }

    // 本地步骤进行中时，忽略上一轮残留的 completed/idle，避免进度条被误关
    if (localStepActive) return

    narrationImageBreakdownProgress.value = progress
    if (progress?.status === 'completed' || progress?.status === 'failed' || progress?.status === 'idle') {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
      if (progress?.status === 'completed' && progress.phase === 'done') {
        void refreshStoryboardsOnly()
      }
    }
  } catch {}
}

function startNarrationImageBreakdownPoll() {
  stopNarrationImageBreakdownPoll()
  void pollNarrationImageBreakdownProgress()
  narrationImageBreakdownPollTimer = setInterval(() => {
    void pollNarrationImageBreakdownProgress()
  }, 1500)
}

async function resumeNarrationImageBreakdownPollIfNeeded() {
  if (!epId.value) return
  const progress = await episodeAPI.narrationImageBreakdownStatus(epId.value)
  narrationImageBreakdownProgress.value = progress
  if (progress?.status === 'processing') {
    narrationImageBreaking.value = true
    openNarrationImageBreakdownModal(progress.phase === 'detecting' ? 'detecting' : 'prompts')
    startNarrationImageBreakdownPoll()
  }
}

function doNarrationImageDetect() {
  persistImageDetectBatchPrefs()
  runNarrationImageStep('detect', () => episodeAPI.narrationImageDetect(epId.value, {
    style: getNarrationImageStyle(),
    image_detect_mode: imageDetectMode.value === 'conservative' ? 'conservative' : 'paragraph',
    detect_batch_threshold: imageDetectBatchThreshold.value,
    detect_batch_size: imageDetectBatchSize.value,
    ...narrationTextModelParams(),
  }), {
    onSuccess: (progress) => {
      const count = narrationDetectDisplayCount.value
      const source = progress?.image_detect_source ?? progress?.imageDetectSource ?? 'llm'
      if (source !== 'llm') {
        toast.warning(`检测完成（规则兜底）：${count} 张需配图。可缩小「每批镜数」后重试 LLM 检测`)
      } else {
        toast.success(`检测完成：${count} 张需配图`)
      }
      clearLlmBreakdownFailure('detect')
      const ts = resolveLlmTimestamp(progress?.generated_at, progress?.image_detect_at)
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        image_needed_count: count,
        paragraph_count: count,
        image_detect_at: ts,
        image_detect_source: source,
      })
    },
    startMessage: '正在 LLM 检测需配图镜头…',
  })
}

function doNarrationImagePrompts() {
  runNarrationImageStep('prompts', () => episodeAPI.narrationImagePrompts(epId.value, {
    style: getNarrationImageStyle(),
    prompt_batch_size: imagePromptBatchSize.value,
    ...narrationTextModelParams(),
  }), {
    onSuccess: (progress) => {
      const count = narrationPromptDisplayCount.value
      const missing = narrationMissingPromptCount.value
      if (missing > 0) {
        toast.warning(`仍有 ${missing} 段文案未生成，请点「补全缺失文案」`)
      } else {
        toast.success(`配图文案已就绪（${count} 条）`)
      }
      clearLlmBreakdownFailure('prompt')
      const ts = resolveLlmTimestamp(
        narrationImageBreakdownProgress.value?.generated_at,
        narrationBreakdownSummary.value?.image_prompt_at,
      )
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        prompts_generated: count,
        image_prompt_at: ts,
        image_prompt_source: 'llm_raw',
      })
    },
    startMessage: narrationMissingPromptCount.value && narrationPromptDisplayCount.value
      ? `正在补全 ${narrationMissingPromptCount.value} 段缺失配图文案${wantEn ? '（同步英文）' : ''}…`
      : `正在生成配图文案${wantEn ? '（同步英文）' : ''}…`,
  })
}

function doNarrationImagePromptsTest() {
  persistImageDetectBatchPrefs()
  const batch = narrationPromptTestBatchDetails.value.find(o => o.value === narrationPromptTestBatchIndex.value)
  const pending = narrationPromptTestPendingCount.value
  const total = narrationPromptTestBatchAnchorCount.value
  narrationImagePromptTestActive.value = true
  runNarrationImageStep('prompts', () => episodeAPI.narrationImagePrompts(epId.value, {
    style: getNarrationImageStyle(),
    prompt_batch_size: imagePromptBatchSize.value,
    test_batch_index: narrationPromptTestBatchIndex.value,
    ...narrationTextModelParams(),
  }), {
    onSuccess: async (progress) => {
      await refresh()
      syncNarrationBreakdownImageCount()
      clearLlmBreakdownFailure('prompt')
      const count = narrationPromptDisplayCount.value
      const ts = resolveLlmTimestamp(progress?.generated_at, progress?.image_prompt_at)
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        prompts_generated: count,
        image_prompt_at: ts,
        image_prompt_source: 'llm_raw',
      })
      const label = batch?.label || `段批 ${narrationPromptTestBatchIndex.value}`
      toast.success(pending < total
        ? `测试完成：${label}（${pending} 段新文案）`
        : `测试完成：${label}（${total} 段已重新生成）`)
    },
    startMessage: batch
      ? (pending < total
        ? `测试生成 ${batch.label} 配图文案（${pending}/${total} 段缺文案）…`
        : `测试重新生成 ${batch.label} 配图文案（${total} 段）…`)
      : '测试生成配图文案…',
  })
}

function doRetryMissingNarrationImagePrompts() {
  runNarrationImageStep('prompts', () => episodeAPI.narrationImagePrompts(epId.value, {
    style: getNarrationImageStyle(),
    retry_missing_prompts: true,
    prompt_batch_size: imagePromptBatchSize.value,
    ...narrationTextModelParams(),
  }), {
    onSuccess: async (progress) => {
      await refresh()
      syncNarrationBreakdownImageCount()
      clearLlmBreakdownFailure('prompt')
      const count = narrationPromptDisplayCount.value
      const ts = resolveLlmTimestamp(progress?.generated_at, progress?.image_prompt_at)
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        prompts_generated: count,
        image_prompt_at: ts,
        image_prompt_source: 'llm_raw',
      })
      toast.success(`已补全缺失配图文案（当前 ${count} 条）`)
    },
    startMessage: '正在补全缺失配图文案…',
  })
}

async function waitForNarrationImageBreakdownDone() {
  for (;;) {
    const progress = await episodeAPI.narrationImageBreakdownStatus(epId.value)
    narrationImageBreakdownProgress.value = progress
    if (progress?.status === 'completed') return progress
    if (progress?.status === 'failed' || progress?.status === 'cancelled') {
      throw new Error(progress?.message || progress?.error || '配图任务失败')
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
}

function runNarrationImageStep(step, apiCall, { onSuccess, startMessage }) {
  narrationImageStep.value = step
  narrationImageBreaking.value = true
  openNarrationImageBreakdownModal(step === 'detect' ? 'detecting' : 'prompts')
  narrationImageBreakdownProgress.value = {
    status: 'processing',
    phase: step === 'detect' ? 'detecting' : 'prompts',
    message: startMessage,
    percent: 1,
  }
  startNarrationImageBreakdownPoll()
  void (async () => {
    let jobStarted = false
    let stepResult = null
    try {
      if (usesLocalModelPipeline.value) {
        await ensureLocalModelForTask(step === 'detect' || step === 'prompts' ? 'llm' : 'image')
      }
      stepResult = await apiCall()
      jobStarted = true
      const progress = await waitForNarrationImageBreakdownDone()
      await refresh()
      syncNarrationBreakdownImageCount()
      onSuccess?.(progress || stepResult)
    } catch (e) {
      const step = narrationImageStep.value
      if (step === 'detect') persistLlmBreakdownFailure('detect', e)
      else if (step === 'prompts') persistLlmBreakdownFailure('prompt', e)
      if (!isLlmCancelled(e)) toast.error(e.message)
    } finally {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
      narrationImageStep.value = null
      narrationImagePromptTestActive.value = false
      try {
        narrationImageBreakdownProgress.value = await episodeAPI.narrationImageBreakdownStatus(epId.value)
      } catch {
        narrationImageBreakdownProgress.value = jobStarted ? narrationImageBreakdownProgress.value : null
      }
    }
  })()
}

async function doNarrationImageAudit() {
  if (!epId.value) return
  narrationImageAuditing.value = true
  try {
    const res = await episodeAPI.narrationImageAudit(epId.value)
    const total = res?.total ?? 0
    const shotsWithIssues = res?.shots_with_issues ?? res?.shotsWithIssues ?? 0
    const issueCount = res?.issue_count ?? res?.issueCount ?? 0
    narrationImageAuditPanel.value = {
      total,
      shotsWithIssues,
      issueCount,
      items: res?.items || [],
    }
    persistNarrationBreakdownSummary({
      ...narrationBreakdownSummary.value,
      image_audit_at: resolveLlmTimestamp(),
      image_audit_failed_at: null,
      image_audit_error: null,
      image_audit_shots_with_issues: shotsWithIssues,
      image_audit_issue_count: issueCount,
    })
    toast.info(shotsWithIssues
      ? `发现 ${shotsWithIssues}/${total} 镜共 ${issueCount} 项问题，可逐条或全部应用优化`
      : `已检查 ${total} 镜，未发现明显问题`)
  } catch (e) {
    persistNarrationBreakdownSummary({
      ...narrationBreakdownSummary.value,
      image_audit_failed_at: resolveLlmTimestamp(),
      image_audit_error: llmErrorMessage(e),
      image_audit_at: null,
    })
    toast.error(e.message)
  } finally {
    narrationImageAuditing.value = false
  }
}

async function doNarrationImageOptimizeOne(storyboardId) {
  await doNarrationImageOptimize([storyboardId])
}

async function doNarrationImageOptimizeAll() {
  const ids = narrationImageAuditPanel.value?.items
    ?.filter(item => item.issues?.length)
    ?.map(item => item.storyboard_id) || []
  await doNarrationImageOptimize(ids)
}

async function doNarrationImageOptimize(storyboardIds) {
  if (!epId.value || !storyboardIds?.length) return
  narrationImageOptimizing.value = true
  try {
    const res = await episodeAPI.narrationImageOptimize(epId.value, { storyboard_ids: storyboardIds })
    const optimized = res?.optimized ?? 0
    persistNarrationBreakdownSummary({
      ...narrationBreakdownSummary.value,
      image_optimize_at: resolveLlmTimestamp(),
      image_prompt_source: optimized > 0 ? 'optimized' : (narrationBreakdownSummary.value?.image_prompt_source ?? null),
    })
    toast.success(`已优化 ${optimized} 条配图文案`)
    await refresh()
    await doNarrationImageAudit()
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationImageOptimizing.value = false
  }
}

async function doNarrationImageRestoreOne(storyboardId) {
  await doNarrationImageRestore([storyboardId])
}

async function doNarrationImageRestoreAll() {
  const ids = narrationImageAuditPanel.value?.items
    ?.filter(item => item.can_restore)
    ?.map(item => item.storyboard_id) || []
  await doNarrationImageRestore(ids)
}

async function doNarrationImageRestore(storyboardIds) {
  if (!epId.value || !storyboardIds?.length) return
  narrationImageRestoring.value = true
  try {
    const res = await episodeAPI.narrationImageRestore(epId.value, { storyboard_ids: storyboardIds })
    const restored = res?.restored ?? 0
    toast.success(`已还原 ${restored} 条 LLM 原文`)
    await refresh()
    await doNarrationImageAudit()
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationImageRestoring.value = false
  }
}

function doNarrationImageBreakdown() {
  doNarrationImageDetect()
}

function runNarrationImageBreakdown(options = {}) {
  if (options.retry_missing_prompts) {
    doRetryMissingNarrationImagePrompts()
    return
  }
  doNarrationImageDetect()
}
function triggerNarrationStoryboardDescUpload() {
  storyboardDescUploadTarget.value = 'storyboard'
  storyboardDescUploadInputRef.value?.click()
}

function triggerNarrationImageDescUpload() {
  storyboardDescUploadTarget.value = 'image'
  storyboardDescUploadInputRef.value?.click()
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file, 'UTF-8')
  })
}

async function onStoryboardDescUploadSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const target = storyboardDescUploadTarget.value
  storyboardDescUploadTarget.value = null
  if (!file || !target) return

  try {
    const text = String(await readTextFile(file)).trim()
    if (!text) throw new Error('文件内容为空')

    if (target === 'storyboard') {
      narrationStoryboardDescUploading.value = true
      const res = await episodeAPI.importNarrationStoryboardDesc(epId.value, text)
      const mode = res?.mode
      if (mode === 'script') {
        localRaw.value = text
        localScript.value = text
        if (episode.value) {
          episode.value.content = text
          episode.value.script_content = text
        }
        const titleCount = res?.title_count ?? res?.titleCount ?? 0
        const sentenceCount = res?.sentence_count ?? res?.sentenceCount ?? 0
        toast.success(`已导入文案并分镜：${sentenceCount} 句 → ${res?.count || 0} 镜`)
        persistNarrationBreakdownSummary({
          ...res,
          storyboard_breakdown_at: Date.now(),
        })
        await refresh()
        if (isMotionComicMode.value) {
          try { await syncMotionComicVoicesAfterScript({ silent: true }) } catch {}
        } else {
          await ensureNarratorCharacter()
        }
      } else if (mode === 'create') {
        toast.success(`已创建 ${res?.count || 0} 个旁白分镜`)
        persistNarrationBreakdownSummary({
          count: res?.count,
          total_duration: res?.total_duration ?? res?.totalDuration,
          storyboard_breakdown_at: Date.now(),
        })
        await refresh()
        if (isMotionComicMode.value) {
          try { await syncMotionComicVoicesAfterScript({ silent: true }) } catch {}
        } else {
          await ensureNarratorCharacter()
        }
      } else {
        const updated = res?.updated ?? 0
        const skipped = res?.skipped ?? 0
        toast.success(`已更新 ${updated} 镜旁白描述${skipped ? `，${skipped} 条未匹配` : ''}`)
        await refresh()
      }
    } else if (target === 'image') {
      narrationImageDescUploading.value = true
      const res = await episodeAPI.importNarrationImageDesc(epId.value, text)
      const updated = res?.updated ?? 0
      const skipped = res?.skipped ?? 0
      const mode = res?.mode === 'lines' ? '逐行' : '【#序号】'
      toast.success(`已导入 ${updated} 条配图描述（${mode}）${skipped ? `，${skipped} 条未匹配` : ''}`)
      await refresh()
      if (updated > 0) {
        persistNarrationBreakdownSummary({
          ...narrationBreakdownSummary.value,
          image_prompt_at: resolveLlmTimestamp(),
          image_prompt_source: 'upload',
          prompts_generated: narrationPromptLiveCount.value,
        })
      }
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationStoryboardDescUploading.value = false
    narrationImageDescUploading.value = false
  }
}

async function loadLocalCastVoices() {
  if (usesLocalModelPipeline.value) {
    try {
      const profiles = await loadGptSovitsVoices()
      const gsvMapped = profiles.map(v => ({
        id: v.id,
        label: String(v.label || '').replace(/（GPT-SoVITS）$/, ''),
        gender: v.gender,
        traits: v.traits || 'GPT-SoVITS 克隆',
        suitable: v.suitable || '参考音频克隆',
        source: 'gptsovits',
        provider: 'gptsovits',
      }))
      const edgeMapped = (await loadEdgeVoices()).map(v => ({
        id: v.id,
        label: v.label,
        gender: v.gender,
        traits: v.traits || '微软 Edge TTS',
        suitable: v.suitable || '系统音色 · 免本地模型',
        source: 'edge',
        provider: 'edge',
      }))
      localCastVoiceProfiles.value = [...gsvMapped, ...edgeMapped]
    } catch (e) {
      console.error('Failed to load GPT-SoVITS / Edge voices for local comic', e)
      try {
        const edgeMapped = (await loadEdgeVoices()).map(v => ({
          id: v.id,
          label: v.label,
          gender: v.gender,
          traits: v.traits || '微软 Edge TTS',
          suitable: v.suitable || '系统音色 · 免本地模型',
          source: 'edge',
          provider: 'edge',
        }))
        localCastVoiceProfiles.value = edgeMapped
      } catch {
        localCastVoiceProfiles.value = []
      }
    }
    return
  }
  try {
    const res = await voicesAPI.localCast({ model_size: localVoiceboxModelSize.value })
    const rows = res?.voices || []
    const gsvProfiles = await loadGptSovitsVoices().catch(() => [])
    const gsvMapped = gsvProfiles.map(v => ({
      id: v.id,
      label: v.label,
      gender: v.gender,
      traits: v.traits || 'GPT-SoVITS 克隆',
      suitable: v.suitable || '参考音频克隆',
      source: 'gptsovits',
      provider: 'gptsovits',
    }))
    const castMapped = rows.map(v => ({
      id: v.voice_id,
      label: v.voice_name,
      gender: v.gender === 'female' ? '女声' : v.gender === 'male' ? '男声' : '中性',
      traits: v.source === 'kokoro' ? 'Kokoro 本地' : v.source === 'cloned' ? 'Voicebox 克隆' : 'Edge TTS',
      suitable: v.provider === 'voicebox' ? 'Voicebox' : 'Edge',
      source: v.source,
      provider: v.provider,
    }))
    localCastVoiceProfiles.value = [...gsvMapped, ...castMapped.filter(v => v.source !== 'gptsovits')]
  } catch (e) {
    console.error('Failed to load local cast voices', e)
    localCastVoiceProfiles.value = []
  }
}

async function assignLocalCharacterVoices(overwrite = false, options?: { silent?: boolean }) {
  if (!epId.value) return null
  try {
    localVoiceAssigning.value = true
    const res = await episodeAPI.assignLocalVoices(epId.value, {
      overwrite,
      voicebox_model_size: localVoiceboxModelSize.value,
    })
    await refresh()
    if (!options?.silent) {
      const kokoro = res?.kokoro_available ?? 0
      const edge = res?.edge_available ?? 0
      toast.success(`已分配 ${res?.assigned ?? 0} 个角色音色（Kokoro ${kokoro} 可选 · Edge ${edge} 可选${res?.skipped ? `，跳过 ${res.skipped} 个已有音色` : ''}）`)
    }
    return res
  } catch (e) {
    if (!options?.silent) toast.error(e.message || '本地音色分配失败')
    throw e
  } finally {
    localVoiceAssigning.value = false
  }
}

/** 动态漫：分镜/文案变更后，按当前分镜说话人重新分配 Kokoro/Edge 音色 */
async function syncMotionComicVoicesAfterScript(options?: { silent?: boolean }) {
  if (!isMotionComicMode.value || !epId.value) return
  await ensureNarratorCharacter()
  if (sbs.value.length) {
    await episodeAPI.linkNarrationCharacters(epId.value)
    await refresh()
  }
  await assignLocalCharacterVoices(true, options)
}

async function doExtractNarrationCharacters() {
  const extractModel = usesLocalModelPipeline.value
    ? resolveLocalExtractModel(episodeTextModel.value)
    : episodeTextModel.value
  if (usesLocalModelPipeline.value) {
    try {
      await ensureLocalModelForTask('llm', { ollamaModel: extractModel })
    } catch (e) {
      toast.error(e?.message || '本地 LLM 未就绪，请确认 Ollama 已启动')
      return
    }
  }
  narrationExtracting.value = true
  try {
    const script = await saveNarrationScript()
    const style = getNarrationImageStyle()
    const res = await episodeAPI.extractNarrationCharacters(epId.value, {
      script,
      style,
      text_model: extractModel,
      // 漫画解说提取只拿名单，不必开思考（定妆文案另点「一键生成 AI 配图描述」）
      text_thinking: isMotionComicMode.value ? false : true,
    })
    narrationExtractGeneratedAt.value = pickLlmGeneratedAt(res) ?? resolveLlmTimestamp()
    narrationExtractFailedAt.value = null
    narrationExtractError.value = null
    const created = res?.created ?? 0
    const updated = res?.updated ?? 0
    const archived = res?.archived ?? 0
    if (created || updated) {
      const total = (res?.characters || []).length
      const archiveHint = archived ? `，已移除 ${archived} 个过期定妆` : ''
      const roleLabel = isMotionComicMode.value ? '角色（含主要配角）' : '主角'
      toast.success(
        isMotionComicMode.value
          ? `已提取${roleLabel} ${total} 人：新增 ${created}，更新 ${updated}${archiveHint}。定妆文案请点「一键生成 AI 配图描述」`
          : `已提取${roleLabel} ${total} 条定妆：新增 ${created}，更新 ${updated}${archiveHint}`,
      )
    } else if (archived) {
      toast.success(`已移除 ${archived} 个过期定妆，保留 ${(res?.characters || []).length} 条`)
    } else if ((res?.characters || []).length) {
      toast.info('角色列表已是最新')
    } else {
      toast.warning('未从文案中识别到画面角色，可手动添加或跳过后续分镜')
    }
    await refresh()
    if (sbs.value.length) {
      await episodeAPI.linkNarrationCharacters(epId.value)
      await refresh()
    }
    if (isMotionComicMode.value && (res?.characters || []).length && (created || updated || archived)) {
      try {
        await syncMotionComicVoicesAfterScript({ silent: true })
        toast.info('已按最新文案角色表重新分配本地音色')
      } catch (e) {
        toast.warning(e.message || '角色已更新，但自动分配音色失败，请在「角色音色」点「重新分配」')
      }
    }
  } catch (e) {
    if (!isLlmCancelled(e)) {
      narrationExtractGeneratedAt.value = null
      narrationExtractFailedAt.value = resolveLlmTimestamp()
      narrationExtractError.value = llmErrorMessage(e)
      toast.error(e.message)
    }
  } finally {
    narrationExtracting.value = false
  }
}

async function addNarrationCharacter() {
  if (isDialoguePortraitMode.value && visualChars.value.length >= DIALOGUE_PORTRAIT_MAX_CHARS) {
    toast.warning(`对话立绘本集最多 ${DIALOGUE_PORTRAIT_MAX_CHARS} 个角色（1 人居中 / 2 人左右）`)
    return
  }
  const name = window.prompt('角色姓名')
  if (!name?.trim()) return
  try {
    await characterAPI.create({
      drama_id: dramaId,
      episode_id: epId.value,
      name: name.trim(),
      role: '角色',
    })
    await refresh()
    toast.success('角色已添加')
  } catch (e) {
    toast.error(e.message)
  }
}

function updateCharacterAppearance(charId, value) {
  const trimmed = String(value || '').trim()
  characterAPI.update(charId, { appearance: trimmed })
  const c = chars.value.find(ch => ch.id === charId)
  if (c) c.appearance = trimmed
}

function onNarratorVoiceChange(voiceId) {
  narratorVoiceId.value = voiceId
  narratorVoiceDirty.value = true
}

function syncNarratorVoiceFromChar(narrator) {
  if (narratorVoiceDirty.value) return
  const voice = narrator?.voice_style || narrator?.voiceStyle
  narratorVoiceId.value = voice || DEFAULT_CLONED_VOICE_ID
}

async function ensureNarratorCharacter() {
  if (!epId.value) {
    throw new Error('集信息加载中，请稍后重试')
  }
  let narrator = findNarratorChar(chars.value)
  if (narrator) {
    syncNarratorVoiceFromChar(narrator)
    return narrator
  }

  const dramaNarrator = findNarratorChar(drama.value?.characters || [])
  await characterAPI.create({
    drama_id: dramaId,
    episode_id: epId.value,
    name: '旁白',
    role: '旁白',
    voice_style: narratorVoiceId.value || dramaNarrator?.voice_style || dramaNarrator?.voiceStyle || DEFAULT_CLONED_VOICE_ID,
    voice_provider: inferLocalVoiceProvider(narratorVoiceId.value || dramaNarrator?.voice_style || dramaNarrator?.voiceStyle || DEFAULT_CLONED_VOICE_ID)
      || DEFAULT_LOCAL_TTS_ENGINE,
  })
  try { chars.value = await episodeAPI.characters(epId.value) } catch { chars.value = [] }
  narrator = findNarratorChar(chars.value)
  if (narrator) syncNarratorVoiceFromChar(narrator)
  return narrator || null
}
async function saveNarratorVoice() {
  if (!narratorVoiceId.value) {
    toast.warning('请先选择旁白音色')
    return
  }
  const selectedVoice = narratorVoiceId.value
  try {
    const narrator = await ensureNarratorCharacter()
    if (!narrator?.id) {
      toast.error('旁白角色创建失败，请刷新页面后重试')
      return
    }
    narratorVoiceId.value = selectedVoice
    const updated = await characterAPI.update(narrator.id, {
      voice_style: selectedVoice,
      voice_provider: inferLocalVoiceProvider(selectedVoice) || lockedAudioProvider.value || undefined,
    })
    const patch = {
      voice_style: selectedVoice,
      voiceStyle: selectedVoice,
      voice_provider: inferLocalVoiceProvider(selectedVoice) || lockedAudioProvider.value || undefined,
      voiceProvider: inferLocalVoiceProvider(selectedVoice) || lockedAudioProvider.value || undefined,
    }
    const local = chars.value.find(c => c.id === narrator.id)
    if (local) Object.assign(local, patch)
    const dramaChar = drama.value?.characters?.find(c => c.id === narrator.id)
    if (dramaChar) Object.assign(dramaChar, patch)
    narratorVoiceId.value = updated?.voice_style || updated?.voiceStyle || selectedVoice
    narratorVoiceDirty.value = false
    toast.success('旁白音色已保存')
  } catch (e) {
    toast.error(e.message || '旁白音色保存失败')
  }
}
async function genSample(id) {
  try {
    if (usesLocalModelPipeline.value) await ensureLocalModelForTask('audio')
    await characterAPI.voiceSample(id, epId.value)
    toast.success('试听已生成')
    refresh()
  } catch (e) {
    toast.error(e.message)
  }
}
async function addShot() { await storyboardAPI.create({ episode_id: epId.value, storyboard_number: sbs.value.length + 1, title: `镜头${sbs.value.length + 1}`, duration: 10 }); refresh() }

function isBatchRunning(key) {
  if (key === 'tts') return ttsBatchActive.value
  return batchRunning.value.has(key)
}

function isPendingTtsShot(id) {
  return pendingTtsShotIds.value.includes(id)
}

function markTtsPending(id) {
  if (!pendingTtsShotIds.value.includes(id)) {
    pendingTtsShotIds.value = [...pendingTtsShotIds.value, id]
  }
}

function unmarkTtsPending(id) {
  pendingTtsShotIds.value = pendingTtsShotIds.value.filter(item => item !== id)
}

function tryBeginBatch(key, message) {
  if (batchRunning.value.has(key)) {
    toast.warning('批量任务进行中，请稍候')
    return false
  }
  batchRunning.value = new Set([...batchRunning.value, key])
  toast.info(message)
  return true
}

function endBatch(key) {
  const next = new Set(batchRunning.value)
  next.delete(key)
  batchRunning.value = next
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return []
  const results = new Array(items.length)
  let cursor = 0
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => runWorker()))
  return results
}

function resolveTtsBatchConcurrency() {
  if (localTtsEnabled.value && (localTtsEngine.value === 'gptsovits' || localTtsEngine.value === 'indextts')) return TTS_BATCH_CONCURRENCY_GPTSOVITS
  if (localTtsEnabled.value && localTtsEngine.value === 'voicebox') return TTS_BATCH_CONCURRENCY_VOICEBOX
  return TTS_BATCH_CONCURRENCY_EDGE
}

/** 定妆：Comfy 本地串行；Agnes / 其它云端并发生成 */
function resolveCharImageBatchConcurrency() {
  const m = String(episodeImageModel.value || '').trim().toLowerCase()
  if (m.startsWith('agnes-image')) return IMAGE_BATCH_CONCURRENCY_AGNES
  if (needsLocalImageHardware(m)) return IMAGE_BATCH_CONCURRENCY_LOCAL
  // 分集选 CogView 时定妆仍走 Agnes，可并发
  return IMAGE_BATCH_CONCURRENCY_AGNES
}

/** 分镜/场景配图：Agnes/CogView 并发，Comfy 串行 */
function resolveStoryboardImageBatchConcurrency() {
  const m = String(episodeImageModel.value || '').trim().toLowerCase()
  if (m.startsWith('agnes-image')) return IMAGE_BATCH_CONCURRENCY_AGNES
  if (m.startsWith('cogview')) return IMAGE_BATCH_CONCURRENCY_CLOUD
  if (needsLocalImageHardware(m)) return IMAGE_BATCH_CONCURRENCY_LOCAL
  return IMAGE_BATCH_CONCURRENCY_CLOUD
}

const ttsBatchConcurrencyLabel = computed(() => {
  if (!localTtsEnabled.value) return `${TTS_BATCH_CONCURRENCY_EDGE} 路并发`
  if (localTtsEngine.value === 'indextts') return `${TTS_BATCH_CONCURRENCY_GPTSOVITS} 路并发（IndexTTS2）`
  if (localTtsEngine.value === 'gptsovits') return `${TTS_BATCH_CONCURRENCY_GPTSOVITS} 路并发（GPT-SoVITS）`
  if (localTtsEngine.value === 'voicebox') return `${TTS_BATCH_CONCURRENCY_VOICEBOX} 路并发（Voicebox）`
  return `${TTS_BATCH_CONCURRENCY_EDGE} 路并发`
})

function resolveTtsWatchOptions() {
  if (localTtsEnabled.value && (localTtsEngine.value === 'voicebox' || localTtsEngine.value === 'gptsovits' || localTtsEngine.value === 'indextts')) {
    return { attempts: 180, delay: 2000 }
  }
  return { attempts: 90, delay: 2000 }
}

function formatTtsShotLabel(sb) {
  return isNarrationMode.value
    ? `#${getNarrationShotDisplayNo(sb)}`
    : `#${sb.storyboard_number || sb.storyboardNumber || sb.id}`
}

function getTtsBatchTargets(force = false) {
  const list = isNarrationMode.value
    ? narrationTtsUnitList.value
    : sbs.value.filter(sb => hasDialogue(sb))
  return list
    .filter(sb => force || (isNarrationMode.value ? !hasNarrationShotOwnTts(sb) : !hasTTS(sb)))
    .sort((a, b) => (a.storyboard_number || a.storyboardNumber || 0) - (b.storyboard_number || b.storyboardNumber || 0))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function watchAsyncResult(check, attempts = 24, delay = 2500) {
  return (async () => {
    for (let i = 0; i < attempts; i++) {
      await sleep(delay)
      await refresh()
      if (check()) return true
    }
    return false
  })()
}

const charImagePollers = new Set()

async function pollCharImageJob(charId, generationId, baseline = null, options = {}) {
  const attempts = options.attempts ?? 240
  const delay = options.delay ?? 3000
  const startChar = chars.value.find(c => c.id === charId)
  const startUrl = String(baseline?.startUrl ?? (startChar?.image_url || startChar?.imageUrl || '')).trim()
  const hadExistingPortrait = !!startUrl

  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? 800 : delay)

    if (generationId) {
      try {
        const gen = await imageAPI.get(generationId)
        if (gen?.status === 'failed') {
          pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
          stampCharImageFailure(charId, gen?.error_msg || gen?.errorMsg || '定妆生成失败')
          toast.error(gen?.error_msg || gen?.errorMsg || '定妆生成失败')
          return false
        }
        if (gen?.status === 'completed') {
          const genPath = String(gen?.local_path || gen?.localPath || gen?.image_url || gen?.imageUrl || '').trim()
          // 重生成必须落到新路径；若仍是旧图则继续等（避免假完成）
          if (hadExistingPortrait && genPath && genPath === startUrl) {
            continue
          }
          applyCharPortraitFromGeneration(charId, gen)
          await refresh({ skipDramaRefetch: true }).catch(() => {})
          const after = chars.value.find(c => c.id === charId)
          const afterPath = String(after?.image_url || after?.imageUrl || '').trim()
          if (genPath && afterPath !== genPath) applyCharPortraitFromGeneration(charId, gen)
          pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
          return true
        }
        // 有 generationId 时，任务未完成前不根据 refresh/updatedAt 提前成功
        // （生成接口可能改 appearance.updatedAt，会误判为定妆已替换）
        continue
      } catch {
        // 拉取 generation 失败时再走下方 refresh 兜底
      }
    }

    await refresh({ skipDramaRefetch: true })
    const char = chars.value.find(c => c.id === charId)
    const url = String(char?.image_url || char?.imageUrl || '').trim()
    // 重生成：必须路径变化；首次生成：有图即可
    if (url && (!hadExistingPortrait || url !== startUrl)) {
      stampCharImageSuccess(charId, char?.updated_at || char?.updatedAt ? String(char.updated_at || char.updatedAt) : null)
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
      return true
    }
  }

  if (generationId) {
    try {
      const gen = await imageAPI.get(generationId)
      if (gen?.status === 'processing' || gen?.status === 'pending') {
        toast.info('定妆仍在 ComfyUI 生成中，完成后会自动替换原图（刷新页面也会继续等待）')
        return false
      }
      if (gen?.status === 'completed') {
        applyCharPortraitFromGeneration(charId, gen)
        pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
        return true
      }
    } catch {}
  }

  pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
  stampCharImageFailure(charId, '定妆生成超时或失败，请重试')
  toast.warning('定妆生成超时或失败，请重试')
  return false
}

function scheduleCharImagePoll(charId, generationId, baseline = null) {
  const key = `${charId}:${generationId || 'unknown'}`
  if (charImagePollers.has(key)) return
  charImagePollers.add(key)
  void pollCharImageJob(charId, generationId, baseline).finally(() => {
    charImagePollers.delete(key)
  })
}

async function watchCharImageResult(charId, generationId, attempts = 240, delay = 3000, baseline = null) {
  const done = await pollCharImageJob(charId, generationId, baseline, { attempts, delay })
  if (done) return true
  if (generationId) {
    try {
      const gen = await imageAPI.get(generationId)
      if (gen?.status === 'processing' || gen?.status === 'pending') {
        scheduleCharImagePoll(charId, generationId, baseline)
      }
    } catch {}
  }
  return done
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim()
  if (!value) {
    toast.warning('暂无描述词')
    return false
  }
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (!ok) toast.error('复制失败，请手动复制')
    return ok
  }
}

const imageUploadInputRef = ref(null)
const shotFolderUploadInputRef = ref(null)
const imageUploadTarget = ref(null)
const audioUploadInputRef = ref(null)
const audioUploadTarget = ref(null)
const narrationAudioSplitting = ref(false)
const narrationAudioUploading = ref(false)
const narrationSrtPreviewing = ref(false)
const uploadedEpisodeAudio = ref([])
const narrationSrtFiles = ref([])
const narrationSrtPanelOpen = ref(false)
const expandedSrtIndex = ref(-1)
const srtViewMode = ref('table')

const narrationSrtCueCount = computed(() =>
  narrationSrtFiles.value.reduce((sum, file) => sum + (file.cues?.length || file.subtitle_count || file.subtitleCount || 0), 0),
)

function pendingAudioStorageKey() {
  return `episode-${epId.value}-pending-audio`
}

function loadUploadedEpisodeAudio() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(pendingAudioStorageKey())
    uploadedEpisodeAudio.value = raw ? JSON.parse(raw) : []
  } catch {
    uploadedEpisodeAudio.value = []
  }
}

function saveUploadedEpisodeAudio() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(pendingAudioStorageKey(), JSON.stringify(uploadedEpisodeAudio.value))
}

function clearUploadedEpisodeAudio() {
  uploadedEpisodeAudio.value = []
  saveUploadedEpisodeAudio()
  clearNarrationSrtFiles()
}

function removeUploadedEpisodeAudio(index) {
  uploadedEpisodeAudio.value = uploadedEpisodeAudio.value.filter((_, i) => i !== index)
  saveUploadedEpisodeAudio()
}

function getUploadedAudioUrl(path) {
  const normalized = String(path || '').replace(/^\/+/, '')
  return normalized ? `/${normalized}` : ''
}

function narrationSrtStorageKey() {
  return `episode-${epId.value}-narration-srt`
}

function loadNarrationSrtFiles() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(narrationSrtStorageKey())
    narrationSrtFiles.value = raw ? JSON.parse(raw) : []
    expandedSrtIndex.value = -1
  } catch {
    narrationSrtFiles.value = []
    expandedSrtIndex.value = -1
  }
}

function saveNarrationSrtFiles() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(narrationSrtStorageKey(), JSON.stringify(narrationSrtFiles.value))
}

function applyNarrationSrtFiles(files) {
  narrationSrtFiles.value = Array.isArray(files) ? files : []
  saveNarrationSrtFiles()
}

function clearNarrationSrtFiles() {
  narrationSrtFiles.value = []
  expandedSrtIndex.value = -1
  saveNarrationSrtFiles()
}

function getSrtAudioName(file) {
  const path = file.audio_path || file.audioPath || ''
  const matched = uploadedEpisodeAudio.value.find(item => item.path === path)
  if (matched?.name) return matched.name
  return path.split('/').pop() || '音频'
}

function getSrtDownloadUrl(path) {
  return getUploadedAudioUrl(path)
}

function formatSrtRaw(file) {
  const cues = file.cues || []
  return cues.map(cue => {
    const idx = cue.index
    const start = cue.start_label || cue.startLabel || ''
    const end = cue.end_label || cue.endLabel || ''
    const script = cue.script_text || cue.scriptText || ''
    const scriptLine = script ? `\n; 分镜: ${script}` : ''
    return `${idx}\n${start} --> ${end}\n${cue.text}${scriptLine}\n`
  }).join('\n')
}

function hasSrtScriptColumn(file) {
  return (file.cues || []).some(cue => cue.script_text || cue.scriptText)
}

function toggleSrtExpand(index) {
  expandedSrtIndex.value = expandedSrtIndex.value === index ? -1 : index
}

async function previewNarrationSrt() {
  if (!uploadedEpisodeAudio.value.length) {
    toast.warning('请先上传 MP3')
    return
  }
  narrationSrtPreviewing.value = true
  try {
    toast.info('正在 Whisper 转写字幕…')
    const paths = uploadedEpisodeAudio.value.map(item => item.path)
    const res = await episodeAPI.transcribeNarrationAudio(epId.value, paths)
    const files = res?.srt_files ?? res?.srtFiles ?? []
    applyNarrationSrtFiles(files)
    const cached = files.filter(f => f.cached).length
    const cacheHint = cached > 0 ? `，其中 ${cached} 份来自缓存` : ''
    toast.success(`已生成 ${files.length} 份字幕${cacheHint}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationSrtPreviewing.value = false
  }
}

watch(epId, () => {
  loadUploadedEpisodeAudio()
  loadNarrationSrtFiles()
}, { immediate: true })

function triggerEpisodeNarrationAudioUpload(replace = false) {
  if (!ttsEligibleCount.value) {
    toast.warning('请先完成分镜并填写旁白文案')
    return
  }
  audioUploadTarget.value = { kind: 'episode-upload', replace: !!replace }
  if (audioUploadInputRef.value) {
    audioUploadInputRef.value.multiple = true
  }
  audioUploadInputRef.value?.click()
}

async function splitEpisodeNarrationAudio() {
  if (!uploadedEpisodeAudio.value.length) {
    toast.warning('请先上传 MP3')
    return
  }
  narrationAudioSplitting.value = true
  try {
    toast.info('正在按文案对齐裁剪…')
    const paths = uploadedEpisodeAudio.value.map(item => item.path)
    const res = await episodeAPI.splitNarrationAudio(epId.value, paths)
    const srtFiles = res?.srt_files ?? res?.srtFiles
    if (srtFiles?.length) applyNarrationSrtFiles(srtFiles)
    await refresh()
    const count = res?.assigned_count ?? res?.assignedCount ?? 0
    const alignMode = res?.align_mode ?? res?.alignMode
    const merged = res?.merged
    const alignScore = res?.align_score ?? res?.alignScore
    const srtCachedCount = res?.srt_cached_count ?? res?.srtCachedCount ?? 0
    const alignHintMap = {
      srt: '（SRT 字幕对齐）',
      speech: '（句间静音对齐）',
      boundary: '（上传段边界对齐）',
      weighted: '（按字数比例切分）',
      content_match: '（按字数比例切分）',
    }
    const scoreHint = typeof alignScore === 'number' ? `，匹配度 ${Math.round(alignScore * 100)}%` : ''
    const cacheHint = srtCachedCount > 0 ? `，复用 ${srtCachedCount} 份已生成字幕` : ''
    const alignHint = alignHintMap[alignMode] || ''
    const mergeHint = merged ? '（多段已先合成）' : ''
    toast.success(`已裁剪分配 ${count} 条配音${mergeHint}${alignHint}${scoreHint}${cacheHint}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationAudioSplitting.value = false
  }
}

function triggerShotTtsUpload(sbId) {
  audioUploadTarget.value = { kind: 'shot', id: sbId }
  if (audioUploadInputRef.value) {
    audioUploadInputRef.value.multiple = false
  }
  audioUploadInputRef.value?.click()
}

function triggerOpeningAudioUpload() {
  audioUploadTarget.value = { kind: 'opening' }
  if (audioUploadInputRef.value) {
    audioUploadInputRef.value.multiple = false
  }
  audioUploadInputRef.value?.click()
}

async function generateOpeningAudio() {
  const text = openingSubtitleText.value.trim()
  if (!text) {
    toast.warning('请先填写字幕文案')
    return
  }
  if (localTtsEngine.value === 'voicebox' && !voiceboxAvailable.value) {
    toast.error('Voicebox 未运行，请先启动 Voicebox（默认端口 17493）')
    return
  }
  if (localTtsEngine.value === 'indextts' && !indexttsAvailable.value) {
    toast.error('IndexTTS2 未就绪，请运行 scripts/setup-index-tts.ps1')
    return
  }
  if (!localEdgeVoiceId.value) {
    toast.warning(localTtsVoicePlaceholder())
    return
  }
  try {
    openingAudioGenerating.value = true
    await episodeAPI.generateOpeningAudio(epId.value, {
      subtitle_text: text,
      local_tts_engine: resolveLocalTtsEnginePayload(),
      local_voice: localEdgeVoiceId.value,
      tts_speed: localTtsSpeed.value,
      ...(ttsEngineSupportsEmotionInstruct(localTtsEngine.value) && resolveVoiceboxInstructText()
        ? { voicebox_instruct: resolveVoiceboxInstructText() }
        : {}),
      ...(localTtsEngine.value === 'voicebox'
        ? { voicebox_model_size: localVoiceboxModelSize.value }
        : {}),
    })
    await refresh()
    toast.success('开幕配音已生成，可点击生成开幕视频')
  } catch (e) {
    toast.error(e.message)
  } finally {
    openingAudioGenerating.value = false
  }
}

async function saveOpeningSubtitle() {
  if (!epId.value || !openingAudioUrl.value) return
  try {
    const path = openingAudioUrl.value.replace(/^\//, '')
    await episodeAPI.uploadOpeningAudio(epId.value, path, openingSubtitleText.value.trim())
    await refresh()
  } catch (e) {
    toast.error(e.message)
  }
}

async function onAudioUploadSelected(event) {
  const files = Array.from(event.target.files || [])
    .filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name))
  event.target.value = ''
  const target = audioUploadTarget.value
  audioUploadTarget.value = null
  if (!files.length || !target) return

  try {
    if (target.kind === 'episode-upload') {
      narrationAudioUploading.value = true
      toast.info(`正在上传 ${files.length} 段音频…`)
      const entries = []
      for (const file of files) {
        const uploaded = await uploadAPI.audio(file)
        const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
        if (!path) throw new Error('上传失败')
        entries.push({ path, name: file.name })
      }
      uploadedEpisodeAudio.value = target.replace
        ? entries
        : [...uploadedEpisodeAudio.value, ...entries]
      saveUploadedEpisodeAudio()
      toast.success(`已添加 ${entries.length} 段，当前共 ${uploadedEpisodeAudio.value.length} 段，可先试听后裁剪`)
    } else if (target.kind === 'shot') {
      const file = files[0]
      const uploaded = await uploadAPI.audio(file)
      const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
      if (!path) throw new Error('上传失败')
      await storyboardAPI.uploadTTS(target.id, path)
      await refresh()
      toast.success('本镜配音已上传')
    } else if (target.kind === 'opening') {
      openingAudioUploading.value = true
      const file = files[0]
      const uploaded = await uploadAPI.audio(file)
      const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
      if (!path) throw new Error('上传失败')
      await episodeAPI.uploadOpeningAudio(epId.value, path, openingSubtitleText.value.trim())
      await refresh()
      toast.success('开幕配音已上传，可点击生成开幕视频')
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationAudioUploading.value = false
    openingAudioUploading.value = false
  }
}

function triggerAllCharImageUpload() {
  const ids = sortCharactersForPortraitGeneration(visualChars.value).map(c => c.id)
  if (!ids.length) {
    toast.warning('暂无角色')
    return
  }
  imageUploadTarget.value = { kind: 'character-batch', ids }
  imageUploadInputRef.value?.click()
}

function triggerCharImageUpload(charId) {
  imageUploadTarget.value = { kind: 'character-batch', ids: [charId] }
  imageUploadInputRef.value?.click()
}

async function clearCharPortraitImage(charId) {
  const row = chars.value.find(ch => ch.id === charId)
  if (!row?.image_url && !row?.imageUrl) {
    toast.info('该角色暂无定妆图')
    return
  }
  try {
    await characterAPI.update(charId, { image_url: null, local_path: null })
    if (row) {
      row.image_url = null
      row.imageUrl = null
      row.local_path = null
      row.localPath = null
    }
    toast.success(`已清除「${formatCharacterDisplayName(row || { name: '角色' })}」定妆图`)
  } catch (e) {
    toast.error(e.message)
  }
}

async function clearAllCharPortraitImages() {
  const withImage = visualChars.value.filter(c => c.image_url || c.imageUrl)
  if (!withImage.length) {
    toast.info('暂无定妆图可清除')
    return
  }
  if (!confirm(`将清除 ${withImage.length} 个角色的定妆参考图（仅清数据库记录，不删除磁盘文件）。是否继续？`)) return
  let ok = 0
  for (const c of withImage) {
    try {
      await characterAPI.update(c.id, { image_url: null, local_path: null })
      c.image_url = null
      c.imageUrl = null
      c.local_path = null
      c.localPath = null
      ok++
    } catch (e) {
      console.error(e)
    }
  }
  if (ok === withImage.length) {
    toast.success(`已清除 ${ok} 张定妆参考图`)
  } else {
    toast.warning(`已清除 ${ok}/${withImage.length}，部分失败请重试`)
  }
}

function triggerAllShotImageUpload() {
  const list = narrationShotsNeedingImage(sbs.value)
  const ids = list.map(sb => sb.id)
  if (!ids.length) {
    toast.warning('暂无需配图镜头')
    return
  }
  imageUploadTarget.value = { kind: 'shot-batch', ids }
  imageUploadInputRef.value?.click()
}

function triggerShotImageUpload(sbId) {
  imageUploadTarget.value = { kind: 'shot-batch', ids: [sbId] }
  imageUploadInputRef.value?.click()
}

async function uploadImageFile(file) {
  const uploaded = await uploadAPI.image(file)
  const path = uploaded?.path || String(uploaded?.url || '').replace(/^\//, '')
  if (!path) throw new Error('上传失败')
  return path
}

async function applyCharacterUploadedImage(charId, path) {
  await characterAPI.update(charId, { image_url: path })
  const row = chars.value.find(ch => ch.id === charId)
  if (row) {
    row.image_url = path
    row.imageUrl = path
  }
}

async function applyShotUploadedImage(sbId, path) {
  const sb = sbs.value.find(item => item.id === sbId)
  const updates = { composed_image: path }
  if (sb) {
    const meta = parseNarrationImageMeta(sb)
    updates.reference_images = JSON.stringify({
      ...meta,
      narration_image_mode: 'new',
      narration_image_source: 'upload',
    })
  }
  await storyboardAPI.update(sbId, updates)
  syncShotUploadedImageLocal(sbId, path, updates.reference_images)
}

function syncShotUploadedImageLocal(sbId, path, referenceImages) {
  const row = sbs.value.find(item => item.id === sbId)
  if (!row) return
  row.composed_image = path
  row.composedImage = path
  if (referenceImages) row.reference_images = referenceImages
}

async function scanNarrationShotImage(sb, options = {}) {
  if (!hasNarrationShotImage(sb)) {
    toast.warning('请先上传或生成配图')
    return
  }
  const quiet = !!options.quiet
  const skipEnsure = !!options.skipEnsure
  if (usesLocalModelPipeline.value && !skipEnsure) {
    await ensureLocalModelForTask('llm', { ollamaModel: DEFAULT_LOCAL_VISION_MODEL })
  }
  if (!pendingShotScanIds.value.includes(sb.id)) pendingShotScanIds.value.push(sb.id)
  try {
    const res = await storyboardAPI.scanNarrationImage(sb.id, {
      vision_model: DEFAULT_LOCAL_VISION_MODEL,
      text_thinking: false,
    })
    shotScanGeneratedAt.value = {
      ...shotScanGeneratedAt.value,
      [sb.id]: pickLlmGeneratedAt(res) ?? resolveLlmTimestamp(),
    }
    shotScanFailedAt.value = { ...shotScanFailedAt.value, [sb.id]: null }
    shotScanError.value = { ...shotScanError.value, [sb.id]: null }
    shotScanResult.value = {
      ...shotScanResult.value,
      [sb.id]: {
        is_suitable: res?.is_suitable === true,
        match_score: res?.match_score ?? null,
        summary: res?.summary || '',
        issues: Array.isArray(res?.issues) ? res.issues : [],
        suggestions: Array.isArray(res?.suggestions) ? res.suggestions : [],
        at: res?.image_validate_at || pickLlmGeneratedAt(res) || resolveLlmTimestamp(),
      },
    }
    // 后端已写入 reference_images，同步到本地分镜列表
    if (res?.reference_images) {
      const row = sbs.value.find(item => item.id === sb.id)
      if (row) {
        row.reference_images = res.reference_images
        row.referenceImages = res.reference_images
      }
    }
    rebuildShotImageValidatePanel()
    if (!quiet) {
      const score = res?.match_score ?? '—'
      const summary = res?.summary || '校验完成'
      const issues = (res?.issues || []).filter(Boolean)
      const detail = issues.length ? `\n问题：${issues.join('；')}` : ''
      const tips = (res?.suggestions || []).filter(Boolean)
      const tipLine = tips.length ? `\n建议：${tips.join('；')}` : ''
      if (res?.is_suitable === true && !issues.length) {
        toast.success(`#${getNarrationShotDisplayNo(sb)} ${summary}（${score}分）${detail}${tipLine}`, { duration: 8000 })
      } else {
        toast.warning(`#${getNarrationShotDisplayNo(sb)} ${summary}（${score}分）${detail || '\n配图不合适'}${tipLine}`, { duration: 10000 })
      }
    }
    return res
  } catch (e) {
    if (!isLlmCancelled(e)) {
      shotScanGeneratedAt.value = { ...shotScanGeneratedAt.value, [sb.id]: null }
      shotScanFailedAt.value = { ...shotScanFailedAt.value, [sb.id]: resolveLlmTimestamp() }
      shotScanError.value = { ...shotScanError.value, [sb.id]: llmErrorMessage(e) }
      if (!quiet) toast.error(e.message)
      throw e
    }
  } finally {
    pendingShotScanIds.value = pendingShotScanIds.value.filter(id => id !== sb.id)
  }
}

function rebuildShotImageValidatePanel() {
  const items = Object.entries(shotScanResult.value || {})
    .map(([id, r]) => {
      const sbId = Number(id)
      const sb = sbs.value.find(item => item.id === sbId)
      return {
        storyboard_id: sbId,
        shot_no: sb ? getNarrationShotDisplayNo(sb) : sbId,
        is_suitable: !!r?.is_suitable,
        match_score: r?.match_score ?? null,
        summary: r?.summary || '',
        issues: Array.isArray(r?.issues) ? r.issues : [],
        suggestions: Array.isArray(r?.suggestions) ? r.suggestions : [],
        at: r?.at || null,
      }
    })
    .sort((a, b) => Number(a.shot_no) - Number(b.shot_no))
  if (!items.length) {
    shotImageValidatePanel.value = null
    return
  }
  const unsuitableItems = items.filter(i => !i.is_suitable || i.issues.length)
  const latestAt = items.map(i => i.at).filter(Boolean).sort().at(-1) || resolveLlmTimestamp()
  shotImageValidatePanel.value = {
    at: latestAt,
    total: items.length,
    suitable: items.length - unsuitableItems.length,
    unsuitable: unsuitableItems.length,
    items,
    unsuitableItems,
  }
  if (typeof document !== 'undefined') {
    requestAnimationFrame(() => {
      document.getElementById('shot-image-validate-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
}

/** 从分镜 reference_images 恢复已持久化的校验记录 */
function hydrateShotImageValidateFromStoryboards(showPanel = false) {
  const next = {}
  const times = {}
  for (const sb of sbs.value) {
    if (!sb?.id) continue
    const meta = parseNarrationImageMeta(sb)
    if (!meta.image_validate_at && meta.image_validate_is_suitable == null && !meta.image_validate_summary) continue
    next[sb.id] = {
      is_suitable: meta.image_validate_is_suitable === true,
      match_score: meta.image_validate_score ?? null,
      summary: meta.image_validate_summary || '',
      issues: Array.isArray(meta.image_validate_issues) ? meta.image_validate_issues : [],
      suggestions: Array.isArray(meta.image_validate_suggestions) ? meta.image_validate_suggestions : [],
      at: meta.image_validate_at || null,
    }
    if (meta.image_validate_at) {
      times[sb.id] = meta.image_validate_at
    }
  }
  shotScanResult.value = next
  shotScanGeneratedAt.value = { ...shotScanGeneratedAt.value, ...times }
  if (showPanel && Object.keys(next).length) {
    rebuildShotImageValidatePanel()
  } else if (!Object.keys(next).length) {
    shotImageValidatePanel.value = null
  } else if (shotImageValidatePanel.value) {
    // 面板已打开时同步内容，不强制滚动
    const items = Object.entries(next).map(([id, r]) => {
      const sbId = Number(id)
      const sb = sbs.value.find(item => item.id === sbId)
      return {
        storyboard_id: sbId,
        shot_no: sb ? getNarrationShotDisplayNo(sb) : sbId,
        is_suitable: !!r?.is_suitable,
        match_score: r?.match_score ?? null,
        summary: r?.summary || '',
        issues: Array.isArray(r?.issues) ? r.issues : [],
        suggestions: Array.isArray(r?.suggestions) ? r.suggestions : [],
        at: r?.at || null,
      }
    }).sort((a, b) => Number(a.shot_no) - Number(b.shot_no))
    const unsuitableItems = items.filter(i => !i.is_suitable || i.issues.length)
    shotImageValidatePanel.value = {
      at: items.map(i => i.at).filter(Boolean).sort().at(-1) || shotImageValidatePanel.value.at,
      total: items.length,
      suitable: items.length - unsuitableItems.length,
      unsuitable: unsuitableItems.length,
      items,
      unsuitableItems,
    }
  }
}

function clearShotImageValidatePanel() {
  shotImageValidatePanel.value = null
}

async function batchScanNarrationShotImages() {
  const list = sbs.value.filter(sb => narrationShotNeedsOwnImage(sb) && hasNarrationShotImage(sb))
  if (!list.length) {
    toast.warning('暂无配图可校验')
    return
  }
  if (!tryBeginBatch('shotImageValidate', `正在用 ${DEFAULT_LOCAL_VISION_MODEL} 校验配图是否合适…`)) return
  let ok = 0
  let bad = 0
  let failed = 0
  try {
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('llm', { ollamaModel: DEFAULT_LOCAL_VISION_MODEL })
    }
    for (const sb of list) {
      try {
        const res = await scanNarrationShotImage(sb, { quiet: true, skipEnsure: true })
        if (res?.is_suitable === true && !(res?.issues || []).length) ok++
        else bad++
      } catch {
        failed++
      }
    }
    rebuildShotImageValidatePanel()
    const parts = [`合适 ${ok}`, `不合适 ${bad}`]
    if (failed) parts.push(`失败 ${failed}`)
    toast.info(`配图校验完成：${parts.join('，')}（详见上方结果面板）`, { duration: 8000 })
  } finally {
    endBatch('shotImageValidate')
  }
}

function jumpToShotFromValidate(storyboardId) {
  const id = Number(storyboardId)
  const sb = sbs.value.find(item => item.id === id)
  if (!sb) {
    toast.warning('未找到对应镜头')
    return
  }

  // 切到「生成配图」页签
  panel.value = 'production'
  prodTab.value = 'shots'

  // 当前筛选下找不到该镜时，切回「全部」或「已有图」
  if (!shotsFiltered.value.some(item => item.id === id)) {
    shotsListFilter.value = hasNarrationShotImage(sb) ? 'done' : 'all'
  }

  // 等筛选重置页码的 watch 跑完后再定位分页
  nextTick(() => {
    jumpShotsListToShot(id)
    selectedSb.value = sb
    nextTick(() => {
      const el = typeof document !== 'undefined'
        ? document.getElementById(`shot-card-${id}`)
        : null
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  })
}

function triggerNextShotImageUpload() {
  const next = nextPendingNarrationShot.value
  if (!next) {
    toast.warning('暂无待配图镜头')
    return
  }
  imageUploadTarget.value = { kind: 'shot-batch', ids: [next.id] }
  imageUploadInputRef.value?.click()
}

async function clearAllStoryboards() {
  const count = sbs.value.length
  if (!count) {
    toast.info('暂无分镜可清除')
    return
  }
  if (!confirm(`将删除本集全部 ${count} 个分镜（含镜头配图、配音、合成视频等关联资源）。清除后可重新拆镜。是否继续？`)) return
  storyboardClearing.value = true
  try {
    const res = await episodeAPI.clearStoryboards(epId.value)
    narrationBreakdownSummary.value = null
    if (typeof window !== 'undefined' && epId.value) {
      window.localStorage.removeItem(`episode-${epId.value}-narration-breakdown`)
    }
    selectedSb.value = null
    scriptStoryboardPage.value = 1
    toast.success(`已清除 ${res?.cleared ?? count} 个分镜，可重新拆镜`)
    await refresh()
  } catch (e) {
    toast.error(e.message || '清除分镜失败')
  } finally {
    storyboardClearing.value = false
  }
}

async function clearAllNarrationImageDetect() {
  const count = narrationDetectClearCount.value
  if (!canClearNarrationImageDetect.value) {
    toast.info('暂无检测配图结果可清除')
    return
  }
  if (!confirm(`将清除本集${count ? ` ${count} 段` : ''}检测配图结果（不保留检测分段与配图文案；旁白镜头列表与已有配图文件不动）。清除后需重新执行「① 检测配图」。是否继续？`)) return
  narrationAssetClearing.value = true
  try {
    const res = await episodeAPI.clearNarrationImageDetect(epId.value)
    narrationImageAuditPanel.value = null
    persistNarrationBreakdownSummary({
      image_detect_cleared: true,
      image_audit_at: null,
      image_audit_failed_at: null,
      image_audit_error: null,
      image_audit_shots_with_issues: null,
      image_audit_issue_count: null,
      image_optimize_at: null,
    })
    toast.success(`已清除 ${res?.cleared ?? count} 段配图换镜检测分镜`)
    await refresh()
  } catch (e) {
    toast.error(e.message || '清除配图检测失败')
  } finally {
    narrationAssetClearing.value = false
  }
}

async function clearAllNarrationImagePrompts() {
  const count = narrationPromptLiveCount.value
  if (!count) {
    toast.info('暂无配图文案可清除')
    return
  }
  if (!confirm(`将清除本集 ${count} 条配图锚点的配图文案（保留①检测分段信息，不删除配图文件）。是否继续？`)) return
  narrationAssetClearing.value = true
  try {
    const res = await episodeAPI.clearNarrationImagePrompts(epId.value)
    narrationImageAuditPanel.value = null
    persistNarrationBreakdownSummary({
      ...narrationBreakdownSummary.value,
      prompts_generated: 0,
      image_prompt_at: null,
      image_prompt_source: null,
      image_audit_at: null,
      image_audit_failed_at: null,
      image_audit_error: null,
      image_audit_shots_with_issues: null,
      image_audit_issue_count: null,
      image_optimize_at: null,
    })
    toast.success(`已清除 ${res?.cleared ?? count} 条配图文案`)
    await refresh()
  } catch (e) {
    toast.error(e.message || '清除配图文案失败')
  } finally {
    narrationAssetClearing.value = false
  }
}

async function clearAllNarrationImages() {
  const processingJobs = Object.values(narrationShotImageJobs.value)
    .filter(j => j && (j.status === 'processing' || j.status === 'submitting'))
  if (pendingNarrationShotIds.value.length || processingJobs.length) {
    toast.warning('有镜头正在生图中，请等待完成后再清除配图')
    return
  }
  const count = narrationOwnImageCount.value
  if (!count) {
    toast.info(narrationImageCharFilterActive.value
      ? `「${narrationImageCharFilterLabel.value}」相关分镜暂无配图可清除`
      : '暂无配图可清除')
    return
  }
  const scopeHint = narrationImageCharFilterActive.value
    ? `所选角色「${narrationImageCharFilterLabel.value}」相关的 `
    : '本集 '
  if (!confirm(`将清除${scopeHint}${count} 张配图（含 AI 生成与上传），删除文件并重置数据库；已合成的镜头需重新合成。是否继续？`)) return
  narrationAssetClearing.value = true
  try {
    const storyboardIds = narrationImageCharFilterActive.value
      ? sbs.value
        .filter(sb => storyboardMatchesNarrationImageCharFilter(sb) && !!getNarrationShotOwnImage(sb))
        .map(sb => sb.id)
      : undefined
    const res = await episodeAPI.clearNarrationImages(epId.value, {
      ...(storyboardIds?.length
        ? { storyboardIds }
        : narrationImageCharFilterActive.value
          ? { characterIds: [...narrationImageCharFilterIds.value] }
          : {}),
    })
    toast.success(`已清除 ${res?.cleared ?? count} 张配图`)
    await refresh()
  } catch (e) {
    toast.error(e.message || '清除配图失败')
  } finally {
    narrationAssetClearing.value = false
  }
}

async function clearAllNarrationTts() {
  const count = ttsAssignedCount.value
  if (!count) {
    toast.info('暂无配音可清除')
    return
  }
  if (!confirm(`将清除本集 ${count} 条镜头配音，删除音频文件并重置数据库；已合成的镜头需重新合成。是否继续？`)) return
  narrationAssetClearing.value = true
  try {
    const res = await episodeAPI.clearNarrationTts(epId.value)
    toast.success(`已清除 ${res?.cleared ?? count} 条配音`)
    await refresh()
  } catch (e) {
    toast.error(e.message || '清除配音失败')
  } finally {
    narrationAssetClearing.value = false
  }
}

async function clearAllComposedVideos() {
  const count = composedCount.value
  if (!count && !mergeUrl.value) {
    toast.info('暂无合成视频可清除')
    return
  }
  if (!confirm(`将清除本集 ${count} 个镜头合成视频${mergeUrl.value ? '及导出成片' : ''}，删除文件并重置数据库。是否继续？`)) return
  narrationAssetClearing.value = true
  try {
    const res = await episodeAPI.clearComposedVideos(epId.value)
    mergeData.value = null
    toast.success(`已清除 ${res?.cleared ?? count} 个合成视频${res?.merges_cleared ? `，作废 ${res.merges_cleared} 条导出记录` : ''}`)
    await refresh()
  } catch (e) {
    toast.error(e.message || '清除合成视频失败')
  } finally {
    narrationAssetClearing.value = false
  }
}

async function cropNarrationImageWatermarks() {
  const count = narrationCropImageCount.value
  if (!count) {
    toast.warning('暂无配图文件')
    return
  }
  if (!confirm(`将处理 ${count} 张配图右下角水印区（宽 1/8 × 高 1/18，用相邻画面覆盖）；已合成的镜头视频会失效，需重新「镜头合成」。是否继续？`)) return
  narrationCropWatermarkProcessing.value = true
  try {
    const res = await episodeAPI.cropNarrationImages(epId.value)
    const cropped = res?.cropped ?? 0
    const skipped = res?.skipped ?? 0
    const failed = res?.failed ?? 0
    if (failed) {
      toast.warning(`新裁剪 ${cropped} 张，跳过 ${skipped} 张，失败 ${failed} 张`)
    } else if (skipped && !cropped) {
      toast.info(`配图已裁剪过（${skipped} 张），无需重复操作`)
    } else {
      toast.success(`已处理 ${cropped} 张右下角水印${skipped ? `，${skipped} 张此前已处理` : ''}`)
    }
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message || '裁剪失败')
  } finally {
    narrationCropWatermarkProcessing.value = false
  }
}

async function restoreNarrationImageWatermarks() {
  const count = narrationWmCroppedImageCount.value
  if (!count) {
    toast.warning('没有可恢复的水印裁剪配图')
    return
  }
  if (!confirm(`将 ${count} 张配图恢复为去水印前的原图（同名原图或生成记录）；已合成镜头需重新「镜头合成」。是否继续？`)) return
  narrationRestoreWatermarkProcessing.value = true
  try {
    const res = await episodeAPI.restoreNarrationImages(epId.value)
    const restored = res?.restored ?? 0
    const failed = res?.failed ?? 0
    const fromGen = res?.from_generation ?? 0
    if (failed) {
      toast.warning(`已恢复 ${restored} 张${fromGen ? `（${fromGen} 张来自生成记录）` : ''}，${failed} 张失败`)
    } else {
      toast.success(`已恢复 ${restored} 张原图${fromGen ? `（${fromGen} 张来自生成记录）` : ''}`)
    }
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message || '恢复失败')
  } finally {
    narrationRestoreWatermarkProcessing.value = false
  }
}

function triggerShotFolderUpload() {
  const list = narrationShotsNeedingImage(sbs.value)
  const ids = list.map(sb => sb.id)
  if (!ids.length) {
    toast.warning('暂无需配图镜头')
    return
  }
  imageUploadTarget.value = { kind: 'shot-batch', ids, matchByFilename: true }
  shotFolderUploadInputRef.value?.click()
}

function resolveImageUploadPairs(files, target) {
  const ids = target.ids || []
  const parsed = files.map(file => ({
    file,
    storyboardId: parseShotImageFilename(file.name)?.storyboardId ?? null,
  }))
  const allShotIds = parsed.length > 0 && parsed.every(item => item.storyboardId != null)
  const useShotId = allShotIds && (
    target.matchByFilename
    || target.kind === 'shot-batch'
  )

  if (useShotId) {
    const validSet = new Set(ids)
    const pairs = []
    const unmatched = []
    for (const item of parsed) {
      if (item.storyboardId && validSet.has(item.storyboardId)) {
        pairs.push({ file: item.file, id: item.storyboardId })
      } else {
        unmatched.push(item.file.name)
      }
    }
    if (!pairs.length) {
      throw new Error('没有可匹配的图片（文件名需为 #序号#镜头ID，如 #1#127.png）')
    }
    return { pairs, unmatched, matchMode: 'storyboard-id' }
  }

  if (target.matchByFilename) {
    const { slots, error } = buildFolderUploadSlots(files, ids.length)
    if (error) throw new Error(error)
    return {
      pairs: slots.map(({ file, slotIndex }) => ({ file, id: ids[slotIndex] })),
      unmatched: [],
      matchMode: 'order',
    }
  }

  if (files.length !== ids.length) {
    throw new Error(`请一次选择 ${ids.length} 张图片（当前选了 ${files.length} 张），按列表顺序对应`)
  }
  return {
    pairs: files.map((file, i) => ({ file, id: ids[i] })),
    unmatched: [],
    matchMode: 'picker-order',
  }
}

const SHOT_IMAGE_UPLOAD_BATCH_SIZE = 8

async function processShotImageUploadPairs(pairs) {
  let ok = 0
  const failed = []
  shotImageUploadProcessing.value = true
  shotImageUploadProgress.value = { done: 0, total: pairs.length }
  try {
    for (let i = 0; i < pairs.length; i += SHOT_IMAGE_UPLOAD_BATCH_SIZE) {
      const chunk = pairs.slice(i, i + SHOT_IMAGE_UPLOAD_BATCH_SIZE)
      const res = await uploadAPI.shotImagesBatch(chunk.map(({ file, id }) => ({ file, storyboardId: id })))
      for (const item of res?.results || []) {
        const sbId = item.storyboard_id ?? item.storyboardId
        if (item.ok && item.path) {
          syncShotUploadedImageLocal(sbId, item.path, item.reference_images)
          ok++
        } else {
          const pair = chunk.find(p => p.id === sbId)
          const sb = sbs.value.find(row => row.id === sbId)
          failed.push({
            id: sbId,
            label: sb ? `#${getNarrationShotDisplayNo(sb)}` : `#${sbId}`,
            fileName: pair?.file?.name || '—',
            error: item.error || '上传失败',
          })
        }
      }
      shotImageUploadProgress.value = {
        done: Math.min(i + chunk.length, pairs.length),
        total: pairs.length,
      }
    }
    await refresh()
    return { ok, failed }
  } finally {
    shotImageUploadProcessing.value = false
    shotImageUploadProgress.value = { done: 0, total: 0 }
  }
}

async function processImageUploadPairs(pairs, target) {
  if (target.kind === 'shot-batch' && pairs.length) {
    return processShotImageUploadPairs(pairs)
  }

  let ok = 0
  const failed = []
  for (const { file, id } of pairs) {
    try {
      const path = await uploadImageFile(file)
      if (target.kind === 'character-batch') {
        await applyCharacterUploadedImage(id, path)
      } else {
        await applyShotUploadedImage(id, path)
      }
      ok++
    } catch (err) {
      console.error(err)
      const sb = sbs.value.find(item => item.id === id)
      failed.push({
        id,
        label: sb ? `#${getNarrationShotDisplayNo(sb)}` : `#${id}`,
        fileName: file.name,
        error: err?.message || String(err),
      })
    }
  }
  await refresh()
  return { ok, failed }
}

function formatUploadFailures(failed, limit = 5) {
  if (!failed.length) return ''
  const head = failed.slice(0, limit).map(f => `${f.label}（${f.fileName}）`).join('、')
  const tail = failed.length > limit ? ` 等 ${failed.length} 镜` : ''
  return `${head}${tail}`
}

async function onShotFolderUploadSelected(event) {
  const files = Array.from(event.target.files || []).filter(isImageUploadFile)
  event.target.value = ''
  const target = imageUploadTarget.value
  imageUploadTarget.value = null
  if (!files.length || !target) return

  try {
    const { pairs, unmatched, matchMode } = resolveImageUploadPairs(files, target)
    const { ok, failed } = await processImageUploadPairs(pairs, target)
    if (unmatched.length) {
      toast.warning(`已上传 ${ok} 张，${unmatched.length} 个文件无法匹配（需 #序号#镜头ID）`)
      return
    }
    if (failed.length) {
      toast.warning(`上传完成 ${ok}/${pairs.length}，失败：${formatUploadFailures(failed)}`)
      return
    }
    if (ok === pairs.length) {
      const firstSb = sbs.value.find(item => item.id === pairs[0]?.id)
      const lastSb = sbs.value.find(item => item.id === pairs[pairs.length - 1]?.id)
      const firstNo = firstSb ? getNarrationShotDisplayNo(firstSb) : '?'
      const lastNo = lastSb ? getNarrationShotDisplayNo(lastSb) : '?'
      toast.success(matchMode === 'order'
        ? `已上传 ${ok} 张：无后缀→#${firstNo}，(${pairs.length - 1})→#${lastNo}`
        : `已按文件名匹配上传 ${ok} 张配图`)
    } else {
      toast.warning(`上传完成 ${ok}/${pairs.length}，部分失败请重试`)
    }
  } catch (e) {
    toast.error(e.message)
  }
}

async function onImageUploadSelected(event) {
  const files = Array.from(event.target.files || []).filter(isImageUploadFile)
  event.target.value = ''
  const target = imageUploadTarget.value
  imageUploadTarget.value = null
  if (!files.length || !target) return

  const ids = target.ids || []
  if (!ids.length) return

  try {
    const { pairs, unmatched, matchMode } = resolveImageUploadPairs(files, target)
    const { ok, failed } = await processImageUploadPairs(pairs, target)
    if (unmatched.length) {
      toast.warning(`已上传 ${ok} 张，${unmatched.length} 个文件无法匹配`)
      return
    }
    if (failed.length) {
      toast.warning(`上传完成 ${ok}/${pairs.length}，失败：${formatUploadFailures(failed)}`)
      return
    }
    if (ok === pairs.length) {
      if (target.kind === 'character-batch') {
        if (pairs.length === 1) {
          const ch = chars.value.find(item => item.id === pairs[0].id)
          toast.success(`已上传「${formatCharacterDisplayName(ch || { name: '角色' })}」定妆图`)
        } else {
          toast.success(`已全部上传 ${ok} 张定妆图`)
        }
      } else {
      const shotMsg = target.kind === 'shot-batch' && pairs.length === 1
        ? `镜头 #${getNarrationShotDisplayNo(sbs.value.find(item => item.id === pairs[0].id) || { storyboard_number: pairs[0].id })}`
        : ''
      toast.success(matchMode === 'order'
        ? `已按文件名序号上传 ${ok} 张配图`
        : target.matchByFilename || pairs.some(p => parseShotImageFilename(p.file.name))
          ? `已按文件名匹配上传 ${ok} 张配图`
          : shotMsg
            ? `已上传配图到 ${shotMsg}（同段镜头自动沿用至下一需配图位置）`
            : `已全部上传 ${ok} 张配图`)
      }
    } else {
      toast.warning(`上传完成 ${ok}/${pairs.length}，部分失败请重试`)
    }
  } catch (e) {
    toast.error(e.message)
  }
}

async function copyAllCharPortraitPrompts() {
  const list = sortCharactersForPortraitGeneration(visualChars.value)
  if (!list.length) {
    toast.warning('暂无角色')
    return
  }
  const blocks = []
  for (const charRow of list) {
    try {
      const useReference = isCharPortraitUseReference(charRow.id)
      const res = await characterAPI.getPortraitPrompt(charRow.id, epId.value, { useReference, ...portraitImageStyleOptions() })
      if (res?.prompt) blocks.push(`【${formatCharacterDisplayName(charRow)}】\n${res.prompt}`)
    } catch {
      const fallback = String(charRow?.appearance || charRow?.description || '').trim()
      if (fallback) blocks.push(`【${formatCharacterDisplayName(charRow)}】\n${fallback}`)
    }
  }
  if (!blocks.length) {
    toast.warning('暂无描述词')
    return
  }
  const copied = await copyTextToClipboard(blocks.join('\n\n'))
  if (copied) toast.success(`已复制全部 ${blocks.length} 条定妆描述词`)
}

async function copyNarrationShotPromptsBatch() {
  const list = narrationShotsNeedingImage(sbs.value)
  if (!list.length) {
    toast.warning('暂无需配图镜头')
    return
  }
  const batchIdx = Math.max(1, Number(narrationCopyBatchIndex.value) || 1)
  const start = (batchIdx - 1) * NARRATION_PROMPT_COPY_BATCH_SIZE
  const batch = list.slice(start, start + NARRATION_PROMPT_COPY_BATCH_SIZE)
  if (!batch.length) {
    toast.warning('当前批次无镜头')
    return
  }
  const firstNo = getNarrationShotDisplayNo(batch[0])
  const lastNo = getNarrationShotDisplayNo(batch[batch.length - 1])
  const blocks = batch.map((sb) => getNarrationImagePromptForCopy(sb)).filter(Boolean)
  if (!blocks.length) {
    toast.warning(`镜头 #${firstNo}-#${lastNo} 暂无描述词`)
    return
  }
  const copied = await copyTextToClipboard(blocks.join('\n\n'))
  if (!copied) return
  if (blocks.length < batch.length) {
    toast.success(`已复制 ${blocks.length}/${batch.length} 条（镜头 #${firstNo}-#${lastNo}，${batch.length - blocks.length} 条暂无文案）`)
    return
  }
  toast.success(`已复制 ${blocks.length} 条描述词（镜头 #${firstNo}-#${lastNo}）`)
}

async function copyNarrationShotPrompt(sb) {
  const prompt = getNarrationImagePromptForCopy(sb)
  if (!prompt) {
    toast.warning('暂无配图文案')
    return
  }
  const label = `#${getNarrationShotDisplayNo(sb)}`
  const copied = await copyTextToClipboard(prompt)
  if (copied) toast.success(`已复制镜头 ${label} 配图文案`)
}

async function copyNarrationFluxPromptEn(sb) {
  const prompt = getNarrationFluxPromptEn(sb)
  if (!prompt) {
    toast.warning('暂无 Flux 英文')
    return
  }
  const label = `#${getNarrationShotDisplayNo(sb)}`
  const copied = await copyTextToClipboard(prompt)
  if (copied) toast.success(`已复制镜头 ${label} Flux 英文`)
}

const narrationFluxTranslatePendingCount = computed(() =>
  narrationShotsNeedingImage(sbs.value).filter(sb => needsFluxEnglishTranslate(sb)).length,
)

const narrationFluxChineseShotCount = computed(() =>
  narrationShotsNeedingImage(sbs.value).filter(sb => {
    const prompt = getNarrationImagePromptText(sb)
    return prompt && /[\u4e00-\u9fff]/.test(prompt)
  }).length,
)

const narrationFluxTranslateDoneCount = computed(() =>
  Math.max(0, narrationFluxChineseShotCount.value - narrationFluxTranslatePendingCount.value),
)

const narrationFluxEnglishCount = computed(() =>
  narrationShotsNeedingImage(sbs.value).filter(sb => getNarrationFluxPromptEn(sb)).length,
)

const showFluxTranslateRemaining = computed(() =>
  showFluxEnglishPrompt.value
  && narrationFluxTranslatePendingCount.value > 0
  && narrationFluxEnglishCount.value > 0,
)

const fluxPromptTranslateProgressPercent = computed(() => {
  const { done, total } = fluxPromptTranslateProgress.value
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
})

const showFluxEnglishPrompt = computed(() => needsEnglishImagePromptModel())

const canUseFluxEnglishPrompt = computed(() => needsEnglishImagePromptModel())

const fluxEnglishPromptHint = computed(() => {
  if (isKolorsEpisodeImageModel()) return '当前为 Kolors 中文直出，无需翻译英文'
  if (isQwenEpisodeImageModel()) return '当前为 Qwen-Image-Edit 中文直出，无需翻译英文'
  if (!needsEnglishImagePromptModel()) {
    return '请先将顶栏「生图」切换为 InstantID / FLUX（需英文）或 Kolors（中文直出）'
  }
  if (isInstantIdEpisodeImageModel()) return 'InstantID 分镜需英文 prompt；请点「翻译英文」自译中文配图文案'
  return 'FLUX 分镜需英文 prompt；配图文案只出中文，请点「翻译英文」自译'
})

async function translateNarrationShotFluxPrompt(sb) {
  if (!canUseFluxEnglishPrompt.value) {
    toast.warning(fluxEnglishPromptHint.value || '请先将顶栏生图模型切换为 FLUX')
    return
  }
  const prompt = getNarrationImagePromptText(sb)
  if (!prompt) {
    toast.warning('暂无中文配图文案')
    return
  }
  if (!/[一-鿿]/.test(prompt)) {
    toast.info('配图文案已是英文，无需翻译')
    return
  }
  if (fluxPromptTranslatingShotIds.value.includes(sb.id)) return
  fluxPromptTranslatingShotIds.value.push(sb.id)
  try {
    const res = await storyboardAPI.translateFluxPrompt(sb.id)
    applyShotFluxPromptMeta(sb, res?.reference_images, res?.flux_prompt_en, res?.flux_prompt_en_at)
    toast.success(`镜头 #${getNarrationShotDisplayNo(sb)} 已翻译为英文`)
  } catch (e) {
    toast.error(e?.message || '翻译失败')
  } finally {
    fluxPromptTranslatingShotIds.value = fluxPromptTranslatingShotIds.value.filter(id => id !== sb.id)
  }
}

async function translateAllNarrationFluxPrompts() {
  if (!canUseFluxEnglishPrompt.value) {
    toast.warning(fluxEnglishPromptHint.value || '请先将顶栏生图模型切换为 FLUX')
    return
  }
  const pending = narrationShotsNeedingImage(sbs.value).filter(sb => needsFluxEnglishTranslate(sb))
  if (!pending.length) {
    toast.info('没有需要翻译的镜头（需中文配图文案且尚未翻译）')
    return
  }
  fluxPromptTranslating.value = true
  fluxPromptTranslateProgress.value = { done: 0, total: pending.length, status: 'running', currentNo: null }
  let translated = 0
  let failed = 0
  try {
    await episodeAPI.startFluxTranslateSession(epId.value)
    for (const sb of pending) {
      const shotNo = getNarrationShotDisplayNo(sb)
      fluxPromptTranslateProgress.value = {
        done: translated,
        total: pending.length,
        status: 'running',
        currentNo: shotNo,
      }
      try {
        const res = await storyboardAPI.translateFluxPrompt(sb.id, { hold_ollama: true })
        applyShotFluxPromptMeta(sb, res?.reference_images, res?.flux_prompt_en, res?.flux_prompt_en_at)
        translated++
        fluxPromptTranslateProgress.value = {
          done: translated,
          total: pending.length,
          status: 'running',
          currentNo: shotNo,
        }
      } catch (e) {
        failed++
        toast.error(`镜头 #${shotNo} 翻译失败：${e?.message || '未知错误'}`)
      }
    }
    if (translated) {
      try {
        const repair = await episodeAPI.repairFluxPrompts(epId.value)
        if (repair?.repaired) await refreshStoryboardsOnly()
      } catch {
        /* 修复失败不阻断 */
      }
      toast.success(failed
        ? `已翻译 ${translated} 镜，${failed} 镜失败（已完成镜头已保存）`
        : `已翻译 ${translated} 个镜头为英文，可开始生成配图`)
    } else if (failed) {
      toast.error('全部镜头翻译失败')
    }
  } catch (e) {
    toast.error(e?.message || '批量翻译失败')
  } finally {
    try {
      await episodeAPI.endFluxTranslateSession(epId.value)
    } catch {
      /* 释放显存失败忽略 */
    }
    fluxPromptTranslating.value = false
    fluxPromptTranslateProgress.value = { done: 0, total: 0, status: 'idle', currentNo: null }
  }
}

const translateRemainingNarrationFluxPrompts = translateAllNarrationFluxPrompts

async function clearAllNarrationFluxPrompts() {
  const count = narrationFluxEnglishCount.value
  if (!count) {
    toast.info('暂无 Flux 英文可清除')
    return
  }
  if (fluxPromptTranslating.value || fluxPromptTranslatingShotIds.value.length) {
    toast.warning('正在翻译中，请等待完成后再清除')
    return
  }
  if (!confirm(`将清除本集 ${count} 个镜头的 Flux 英文（保留中文配图文案），之后可重新一键翻译。是否继续？`)) return
  fluxPromptClearing.value = true
  try {
    const res = await episodeAPI.clearFluxPrompts(epId.value)
    for (const sb of narrationShotsNeedingImage(sbs.value)) {
      clearShotFluxPromptMetaLocal(sb)
    }
    toast.success(`已清除 ${res?.cleared ?? count} 个镜头的 Flux 英文`)
    await refresh()
  } catch (e) {
    toast.error(e?.message || '清除 Flux 英文失败')
  } finally {
    fluxPromptClearing.value = false
  }
}

async function genCharImg(id) {
  let useReference = isCharPortraitUseReference(id)
  const beforeChar = chars.value.find(c => c.id === id)
  const baseline = {
    startUrl: beforeChar?.image_url || beforeChar?.imageUrl || '',
    startUpdatedAt: beforeChar?.updated_at || beforeChar?.updatedAt || '',
  }
  // 重生成时：若参考图就是自己当前定妆，改为纯文生图，否则容易「看起来没换」
  if (useReference && baseline.startUrl) {
    const ref = findPortraitReferenceCharacter(chars.value, beforeChar)
    if (!ref || ref.id === id) useReference = false
  }
  try {
    await ensureLocalModelForTask('image')
    if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
    const result = await characterAPI.generateImage(id, epId.value, { useReference, ...portraitImageStyleOptions() })
    // 生图提交后再次钉死 image 阶段，防止其它任务切走 Comfy
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('image').catch(() => {})
    }
    if (result?.appearance_auto_enriched && result?.appearance) {
      const c = chars.value.find(ch => ch.id === id)
      if (c) c.appearance = result.appearance
      toast.info('已自动补全 English tags 外貌描述')
    }
    const refHint = !useReference
      ? '（纯文生图）'
      : result?.used_portrait_reference
      ? `（参考：${result?.reference_character_variant || '同角色定妆'}）`
      : result?.used_style_anchor
      ? '（画风锚定：项目已有定妆）'
      : '（无可用参考，纯文生图）'
    toast.success(`定妆生成中 · ${result?.model || episodeImageModel.value}${refHint}`)
    const genId = result?.image_generation_id
    // Qwen 定妆常需 2～4 分钟；超时后仍会后台继续轮询并写回
    const done = await watchCharImageResult(id, genId, 120, 3000, baseline)
    if (done) {
      if (genId) {
        try {
          const gen = await imageAPI.get(genId)
          if (gen?.status === 'completed') applyCharPortraitFromGeneration(id, gen)
        } catch {}
      }
      toast.success('定妆图已更新')
    } else if (genId) {
      try {
        const gen = await imageAPI.get(genId)
        const err = gen?.error_msg || gen?.errorMsg
        if (err && gen?.status === 'failed') {
          stampCharImageFailure(id, err)
          toast.error(err)
        } else if (gen?.status === 'processing' || gen?.status === 'pending') {
          toast.info('定妆仍在生成中，完成后会自动替换原图')
        }
      } catch {}
    }
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    stampCharImageFailure(id, e)
    if (!isLlmCancelled(e)) toast.error(e.message)
  }
}

function applyDialoguePortraitExpressionsLocal(id: number, result: any) {
  const c = chars.value.find(ch => ch.id === id)
  if (!c) return
  const pack = result?.dialogue_portrait
    || result?.expressions
    || result?.reference_images?.dialogue_portrait
    || result?.referenceImages?.dialogue_portrait
  const refsRaw = result?.reference_images ?? result?.referenceImages
  if (refsRaw != null) {
    c.reference_images = typeof refsRaw === 'string' ? refsRaw : JSON.stringify(refsRaw)
    c.referenceImages = c.reference_images
    return
  }
  if (pack && typeof pack === 'object') {
    const prev = parseCharacterReferenceImages(c)
    const next = { ...prev, dialogue_portrait: pack }
    const json = JSON.stringify(next)
    c.reference_images = json
    c.referenceImages = json
  }
}

async function genDialogueExpressions(id: number, options?: { force?: boolean }) {
  const c = chars.value.find(ch => ch.id === id)
  if (!(c?.image_url || c?.imageUrl)) {
    toast.warning('请先生成定妆基图，再生成表情包')
    return
  }
  try {
    await ensureLocalModelForTask('image')
    if (!isPendingDialogueExpression(id)) pendingDialogueExpressionIds.value.push(id)
    const result = await characterAPI.generateDialogueExpressions(id, epId.value, {
      force: options?.force,
      ...portraitImageStyleOptions(),
    })
    applyDialoguePortraitExpressionsLocal(id, result)
    if (result?.character) {
      const idx = chars.value.findIndex(ch => ch.id === id)
      if (idx >= 0) chars.value[idx] = result.character
    }
    toast.success(dialoguePortraitExpressionsReady(chars.value.find(ch => ch.id === id) || c)
      ? '表情包已更新（idle / talk / react）'
      : '表情包已提交（未齐时合成将回退定妆基图）')
    await refresh()
  } catch (e) {
    toast.error(e?.message || '表情包生成失败（后端 API 可能尚未就绪）')
  } finally {
    pendingDialogueExpressionIds.value = pendingDialogueExpressionIds.value.filter(item => item !== id)
  }
}

async function batchDialogueExpressions(options?: { force?: boolean }) {
  const targets = visualChars.value.filter(c => c.image_url || c.imageUrl)
  if (!targets.length) {
    toast.warning('请先为角色生成定妆基图')
    return
  }
  if (!tryBeginBatch('dialogueExpressions', '表情包批量生成中…')) return
  try {
    await ensureLocalModelForTask('image')
    const ids = targets.map(c => c.id)
    for (const id of ids) {
      if (!isPendingDialogueExpression(id)) pendingDialogueExpressionIds.value.push(id)
    }
    try {
      const result = await characterAPI.batchDialogueExpressions(ids, epId.value, {
        force: options?.force,
        ...portraitImageStyleOptions(),
      })
      const updated = result?.characters || result?.items || []
      for (const row of updated) {
        if (!row?.id) continue
        applyDialoguePortraitExpressionsLocal(row.id, row)
        const idx = chars.value.findIndex(ch => ch.id === row.id)
        if (idx >= 0) chars.value[idx] = { ...chars.value[idx], ...row }
      }
      toast.success(`已请求生成 ${ids.length} 个角色的表情包`)
    } catch {
      // 批量接口可能尚未实现：逐个回退
      let ok = 0
      for (const id of ids) {
        try {
          await genDialogueExpressions(id, { force: options?.force })
          ok++
        } catch { /* toast already shown */ }
      }
      if (ok) toast.success(`已生成 ${ok}/${ids.length} 个角色表情包`)
    }
    await refresh()
  } finally {
    pendingDialogueExpressionIds.value = []
    endBatch('dialogueExpressions')
  }
}

async function recognizeCharPortrait(id) {
  try {
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('llm')
    }
    if (!isPendingCharRecognize(id)) pendingCharRecognizeIds.value.push(id)
    const result = await characterAPI.recognizePortrait(id, epId.value)
    charRecognizeGeneratedAt.value = {
      ...charRecognizeGeneratedAt.value,
      [id]: pickLlmGeneratedAt(result) ?? resolveLlmTimestamp(),
    }
    charRecognizeFailedAt.value = { ...charRecognizeFailedAt.value, [id]: null }
    charRecognizeError.value = { ...charRecognizeError.value, [id]: null }
    toast.success('外貌描述已更新')
    if (result?.character) {
      const idx = chars.value.findIndex(c => c.id === id)
      if (idx >= 0) chars.value[idx] = result.character
    }
    await refresh()
  } catch (e) {
    if (!isLlmCancelled(e)) {
      charRecognizeGeneratedAt.value = { ...charRecognizeGeneratedAt.value, [id]: null }
      charRecognizeFailedAt.value = { ...charRecognizeFailedAt.value, [id]: resolveLlmTimestamp() }
      charRecognizeError.value = { ...charRecognizeError.value, [id]: llmErrorMessage(e) }
      toast.error(e.message)
    }
  } finally {
    pendingCharRecognizeIds.value = pendingCharRecognizeIds.value.filter(item => item !== id)
  }
}

async function validateCharPortraitStyle(id, options = {}) {
  const quiet = !!options.quiet
  try {
    if (usesLocalModelPipeline.value && !options.skipEnsure) {
      await ensureLocalModelForTask('llm', { ollamaModel: DEFAULT_LOCAL_VISION_MODEL })
    }
    if (!isPendingCharStyleValidate(id)) pendingCharStyleValidateIds.value.push(id)
    const result = await characterAPI.validatePortraitStyle(id, {
      vision_model: DEFAULT_LOCAL_VISION_MODEL,
    })
    charStyleValidateResult.value = {
      ...charStyleValidateResult.value,
      [id]: {
        is_standard: !!result?.is_standard,
        score: result?.score ?? null,
        summary: result?.summary || '',
        issues: Array.isArray(result?.issues) ? result.issues : [],
        suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [],
        at: pickLlmGeneratedAt(result) ?? resolveLlmTimestamp(),
      },
    }
    if (!quiet) {
      const score = result?.score ?? '—'
      const summary = result?.summary || '校验完成'
      const issues = (result?.issues || []).filter(Boolean)
      if (result?.is_standard) {
        toast.success(`${summary}（${score}分）`)
      } else {
        toast.warning(`${summary}（${score}分）\n${issues.join('；') || '画风不标准'}`)
      }
    }
    return result
  } catch (e) {
    if (!isLlmCancelled(e)) {
      if (!quiet) toast.error(e.message || '画风校验失败')
      throw e
    }
  } finally {
    pendingCharStyleValidateIds.value = pendingCharStyleValidateIds.value.filter(item => item !== id)
  }
}

async function batchValidateCharPortraitStyles() {
  const ids = visualChars.value
    .filter(c => c.image_url || c.imageUrl)
    .map(c => c.id)
  if (!ids.length) {
    toast.warning('暂无定妆图可校验')
    return
  }
  if (!tryBeginBatch('charStyleValidate', `正在用 ${DEFAULT_LOCAL_VISION_MODEL} 校验定妆画风…`)) return
  let nonStandard = 0
  let ok = 0
  let failed = 0
  try {
    if (usesLocalModelPipeline.value) {
      await ensureLocalModelForTask('llm', { ollamaModel: DEFAULT_LOCAL_VISION_MODEL })
    }
    for (const id of ids) {
      try {
        const result = await validateCharPortraitStyle(id, { quiet: true, skipEnsure: true })
        if (result?.is_standard) ok++
        else nonStandard++
      } catch {
        failed++
      }
    }
    const parts = [`标准 ${ok}`, `不标准 ${nonStandard}`]
    if (failed) parts.push(`失败 ${failed}`)
    toast.info(`画风校验完成：${parts.join('，')}`)
  } finally {
    endBatch('charStyleValidate')
  }
}

async function generateCharAppearance(id) {
  const toastId = `char-appearance-${id}`
  try {
    if (usesLocalModelPipeline.value) {
      toast.info('正在切换 LLM 并生成外貌描述，约需 1–2 分钟…', { id: toastId, duration: 8000 })
      await ensureLocalModelForTask('llm')
    }
    if (!isPendingCharAppearance(id)) pendingCharAppearanceIds.value.push(id)
    const script = localRaw.value || rawContent.value || scriptContent.value || ''
    const result = await characterAPI.generateAppearance(id, {
      episode_id: epId.value,
      script,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
      image_style: getNarrationImageStyle(),
    })
    charAppearanceGeneratedAt.value = {
      ...charAppearanceGeneratedAt.value,
      [id]: pickLlmGeneratedAt(result) ?? resolveLlmTimestamp(),
    }
    charAppearanceFailedAt.value = { ...charAppearanceFailedAt.value, [id]: null }
    charAppearanceError.value = { ...charAppearanceError.value, [id]: null }
    const appearance = result?.appearance || ''
    if (appearance) {
      const c = chars.value.find(ch => ch.id === id)
      if (c) c.appearance = appearance
      if (result?.character) {
        const idx = chars.value.findIndex(ch => ch.id === id)
        if (idx >= 0) chars.value[idx] = result.character
      }
    }
    toast.success(isLocalComicMode.value ? 'AI 配图描述已生成（含 English tags）' : 'AI 外貌描述已生成（含 English tags）')
    toast.dismiss(toastId)
  } catch (e) {
    if (!isLlmCancelled(e)) {
      charAppearanceGeneratedAt.value = { ...charAppearanceGeneratedAt.value, [id]: null }
      charAppearanceFailedAt.value = { ...charAppearanceFailedAt.value, [id]: resolveLlmTimestamp() }
      charAppearanceError.value = { ...charAppearanceError.value, [id]: llmErrorMessage(e) }
      toast.error(e.message)
      toast.dismiss(toastId)
    }
  } finally {
    pendingCharAppearanceIds.value = pendingCharAppearanceIds.value.filter(item => item !== id)
  }
}

async function batchCharAppearances() {
  const missing = visualChars.value.filter(c => !(String(c.appearance || '').trim()))
  const forceAll = missing.length === 0
  const candidates = forceAll ? visualChars.value : missing
  const pending = sortCharactersForPortraitGeneration(candidates)
  const ids = pending.map(c => c.id)
  if (!ids.length) {
    toast.info('暂无角色可生成 AI 配图描述')
    return
  }
  if (forceAll) {
    if (!confirm(`将重新生成 ${ids.length} 个角色的 AI 配图描述（覆盖现有文案）。是否继续？`)) return
  }
  if (!tryBeginBatch('charAppearances', forceAll ? '正在覆盖重写 AI 配图描述…' : '正在批量生成 AI 配图描述…')) return
  try {
    if (usesLocalModelPipeline.value) await ensureLocalModelForTask('llm')
    for (const char of pending) {
      await generateCharAppearance(char.id)
    }
    toast.success(forceAll ? 'AI 配图描述已全部重写' : 'AI 配图描述批量生成完成')
  } catch (e) {
    toast.error(e.message)
  } finally {
    endBatch('charAppearances')
  }
}

async function batchCharImages(options?: { forceRegen?: boolean }) {
  const forceRegen = !!options?.forceRegen
  const candidates = forceRegen
    ? visualChars.value.filter(c => !!(c.image_url || c.imageUrl))
    : visualChars.value.filter(c => !(c.image_url || c.imageUrl))
  const pending = sortCharactersForPortraitGeneration(candidates)
  const ids = pending.map(c => c.id)
  if (!ids.length) {
    toast.info(forceRegen ? '暂无已有定妆可重新生成' : '所有角色图片已生成')
    return
  }
  if (forceRegen) {
    if (!confirm(`将重新生成 ${ids.length} 个角色定妆（覆盖原图）。是否继续？`)) return
  }
  const concurrency = resolveCharImageBatchConcurrency()
  const batchHint = concurrency > 1
    ? `角色定妆并发生成中（Agnes · ${concurrency} 路）…`
    : (forceRegen ? '定妆重新生成中…' : '角色图片批量生成中…')
  if (!tryBeginBatch('charImages', forceRegen ? `定妆重新生成中${concurrency > 1 ? `（${concurrency} 路并发）` : ''}…` : batchHint)) return
  pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
  const baselines = new Map(pending.map(c => [c.id, {
    startUrl: c.image_url || c.imageUrl || '',
    startUpdatedAt: c.updated_at || c.updatedAt || '',
  }]))
  const pendingIdSet = new Set(ids)
  try {
    await ensureLocalModelForTask('image')
    let completedCount = 0
    let failedCount = 0

    const results = await mapWithConcurrency(pending, concurrency, async (char) => {
      const useReference = isCharPortraitUseReference(char.id)
      const effectiveUseRef = forceRegen ? false : useReference
      if (effectiveUseRef) {
        const ref = findPortraitReferenceCharacter(chars.value, char)
        if (ref && pendingIdSet.has(ref.id) && !(ref.image_url || ref.imageUrl)) {
          await watchCharImageResult(ref.id, null, 120, 3000, baselines.get(ref.id) || null)
          await refresh({ skipDramaRefetch: true })
        } else if (!ref) {
          const anchor = findDramaStyleAnchorCharacter(chars.value, char)
          if (anchor && pendingIdSet.has(anchor.id) && !(anchor.image_url || anchor.imageUrl)) {
            await watchCharImageResult(anchor.id, null, 120, 3000, baselines.get(anchor.id) || null)
            await refresh({ skipDramaRefetch: true })
          }
        }
      }
      const result = await characterAPI.generateImage(char.id, epId.value, {
        useReference: effectiveUseRef,
        ...portraitImageStyleOptions(),
      })
      if (usesLocalModelPipeline.value && concurrency <= 1) {
        await ensureLocalModelForTask('image').catch(() => {})
      }
      const genId = result?.image_generation_id
      const done = await watchCharImageResult(char.id, genId, 120, 3000, baselines.get(char.id) || null)
      if (!done) throw new Error('定妆生成超时或失败')
      return true
    })

    for (let i = 0; i < results.length; i++) {
      const row = results[i]
      const char = pending[i]
      if (row?.status === 'fulfilled') {
        completedCount++
      } else {
        failedCount++
        const err = row?.reason
        stampCharImageFailure(char.id, err)
        pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== char.id)
      }
    }

    await refresh({ skipDramaRefetch: true })
    if (failedCount && !completedCount) {
      toast.error(`${failedCount} 个定妆生成失败`)
    } else if (failedCount) {
      toast.warning(`${completedCount} 张完成，${failedCount} 张失败`)
    } else {
      toast.success(forceRegen
        ? `已重新生成 ${completedCount} 张定妆${concurrency > 1 ? `（${concurrency} 路并发）` : ''}`
        : `角色图片批量生成完成${concurrency > 1 ? `（${concurrency} 路并发）` : ''}`)
    }
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  } finally {
    endBatch('charImages')
  }
}

async function regenerateAllCharPortraitImages() {
  return batchCharImages({ forceRegen: true })
}
async function genSceneImg(id) {
  try {
    await ensureLocalModelForTask('image')
    if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
    await sceneAPI.generateImage(id, epId.value, portraitImageStyleOptions())
    toast.success('场景图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const scene = scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
async function batchSceneImages() {
  const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) {
    toast.info('所有场景图片已生成')
    return
  }
  if (!tryBeginBatch('sceneImages', '场景图片批量生成中…')) return
  pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
  try {
    const results = await Promise.allSettled(ids.map(id => sceneAPI.generateImage(id, epId.value, portraitImageStyleOptions())))
    const failCount = results.filter(r => r.status === 'rejected').length
    if (failCount) toast.error(`${failCount} 个场景图片提交失败`)
    await refresh()
    await watchAsyncResult(() => ids.every(id => {
      const scene = scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    }), 36)
    if (!failCount) toast.success('场景图片批量生成完成')
  } catch (e) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  } finally {
    endBatch('sceneImages')
  }
}

const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function getDialogueSpeakerRaw(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  const match = dialogue.match(/^(.+?)[:：]/)
  if (!match) return ''
  const speaker = match[1].replace(/[（(].+?[)）]/g, '').trim()
  if (speaker && !isPlausibleDialogueSpeaker(speaker)) return '旁白'
  return speaker
}

function getDialogueText(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  if (!dialogue) return ''
  const match = dialogue.match(/^(.+?)[:：]/)
  if (!match) return dialogue
  const speaker = match[1].replace(/[（(].+?[)）]/g, '').trim()
  // 误切叙述句：整句当旁白正文，不剥前缀
  if (speaker && !isPlausibleDialogueSpeaker(speaker)) return dialogue
  return dialogue.replace(/^.+?[:：]\s*/, '').trim()
}

function isTTSIgnorable(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  const text = getDialogueText(sb)
  if (!sb?.dialogue?.trim()) return true
  if (speaker && IGNORE_TTS_SPEAKERS.test(speaker)) return true
  if (!text) return true
  if (IGNORE_TTS_TEXT.test(text)) return true
  return false
}

function hasDialogue(sb) { return !isTTSIgnorable(sb) }
function hasTTS(sb) { return !!(sb?.tts_audio_url || sb?.ttsAudioUrl) }
function hasComposeTts(sb) {
  if (isNarrationMode.value) return hasEffectiveNarrationTts(sbs.value, sb)
  return hasTTS(sb)
}
function getTTSUrl(sb) { return sb?.tts_audio_url || sb?.ttsAudioUrl || '' }
function applyTtsResultToStoryboard(storyboardId, result) {
  const path = result?.tts_audio_url || result?.ttsAudioUrl
  if (!path) return
  const duration = result?.duration
  const updateShot = (sb) => {
    if (!sb) return
    sb.tts_audio_url = path
    sb.ttsAudioUrl = path
    if (Number.isFinite(duration) && duration > 0) sb.duration = duration
  }
  updateShot(sbs.value.find(sb => sb.id === storyboardId))
  const memberIds = result?.unit_member_ids
  if (Array.isArray(memberIds)) {
    for (const mid of memberIds) {
      if (mid === storyboardId) continue
      updateShot(sbs.value.find(sb => sb.id === mid))
    }
  }
}

async function watchTtsBatchResults(shotIds, options = resolveTtsWatchOptions()) {
  const pending = new Set(shotIds)
  for (let i = 0; i < options.attempts && pending.size; i++) {
    await sleep(i === 0 ? 800 : options.delay)
    await refreshStoryboardsOnly()
    for (const id of [...pending]) {
      const sb = sbs.value.find(s => s.id === id)
      if (!sb) {
        pending.delete(id)
        unmarkTtsPending(id)
        continue
      }
      const ready = isNarrationMode.value ? hasNarrationShotOwnTts(sb) : hasTTS(sb)
      if (ready) {
        pending.delete(id)
        unmarkTtsPending(id)
      }
    }
  }
  for (const id of pending) unmarkTtsPending(id)
  return { completed: shotIds.length - pending.size, remaining: pending.size }
}
function hasEffectiveTTS(sb) {
  if (!isNarrationMode.value) return hasTTS(sb)
  return !!resolveNarrationEffectiveTts(sbs.value, sb).path
}
function getEffectiveTTSUrl(sb) {
  if (!isNarrationMode.value) return getTTSUrl(sb)
  return resolveNarrationEffectiveTts(sbs.value, sb).path || ''
}
function narrationTtsUnitStatusLabel(sb) {
  if (!isNarrationMode.value) return hasTTS(sb) ? '已生成' : '待生成'
  if (hasNarrationShotOwnTts(sb)) return '已生成'
  return '待生成'
}
function narrationTtsStatusLabel(sb) {
  if (!isNarrationMode.value) return hasTTS(sb) ? '已生成' : '待生成'
  const resolved = resolveNarrationEffectiveTts(sbs.value, sb)
  if (resolved.path && resolved.inherited) return '沿用前镜'
  return resolved.path ? '已生成' : '待生成'
}
function getDialogueSpeaker(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  if (!speaker) return '旁白'
  return speaker
}
function resolveShotVoiceLabel(sb) {
  const speaker = getDialogueSpeaker(sb)
  const char = chars.value.find(c => c.name === speaker)
  return formatLocalVoiceLabel(char || { voice_style: '', voiceStyle: '' })
}

function resolveShotVoiceHint(sb) {
  const speaker = getDialogueSpeaker(sb)
  const char = chars.value.find(c => c.name === speaker)
  const voice = char?.voice_style || char?.voiceStyle
  if (!voice) return `${speaker} · 未分配音色`
  return `${speaker} · ${formatLocalVoiceLabel(char)}`
}

async function genShotTTS(sb, force = false) {
  if (isPendingTtsShot(sb.id)) return
  await ensureLocalTtsEngineForBatch()
  markTtsPending(sb.id)
  const label = formatTtsShotLabel(sb)
  try {
    const res = await storyboardAPI.generateTTS(sb.id, ttsGenerateOptions(force, sb))
    if (res?.tts_audio_url) {
      applyTtsResultToStoryboard(sb.id, res)
      const provider = res?.provider || (localTtsEnabled.value ? localTtsEngine.value : 'api')
      const mode = provider === 'edge' ? '（本地 Edge）' : provider === 'indextts' ? '（IndexTTS2）' : provider === 'gptsovits' ? '（GPT-SoVITS）' : provider === 'voicebox' ? '（Voicebox）' : '（付费 API）'
      const speakerHint = isMotionComicMode.value
        ? ` · ${res?.speaker || getDialogueSpeaker(sb)}${res?.used_character_voice === false ? '（默认音色）' : ''}`
        : ''
      toast.success(`${label} 配音已生成${mode}${speakerHint}`)
      unmarkTtsPending(sb.id)
      return
    }
    if (res?.status === 'processing') {
      toast.info(`${label} 配音后台生成中…`)
      void watchTtsBatchResults([sb.id]).then(({ completed, remaining }) => {
        if (completed) {
          const provider = res?.provider || (localTtsEnabled.value ? localTtsEngine.value : 'api')
          const mode = provider === 'edge' ? '（本地 Edge）' : provider === 'indextts' ? '（IndexTTS2）' : provider === 'gptsovits' ? '（GPT-SoVITS）' : provider === 'voicebox' ? '（Voicebox）' : '（付费 API）'
          toast.success(`${label} 配音已生成${mode}`)
        } else if (remaining) {
          toast.warning(`${label} 配音超时，请确认 Voicebox 已启动且模型已下载，或改用 Edge 后重试`)
        }
      })
      return
    }
    unmarkTtsPending(sb.id)
    toast.error('配音提交失败')
  } catch (e) {
    unmarkTtsPending(sb.id)
    toast.error(`${label} ${e.message}`)
  }
}
async function batchShotTTS() {
  const pending = getTtsBatchTargets(false)
  if (!pending.length) {
    toast.info(ttsEligibleCount.value ? '所有镜头配音已就绪' : '当前没有可生成的对白或旁白')
    return
  }
  await ensureLocalTtsEngineForBatch()
  const concurrency = resolveTtsBatchConcurrency()
  void runBatchShotTTS(`配音生成中（剩余 ${pending.length} 段 · ${concurrency} 路并发）…`, false)
}

async function batchShotTTSAll() {
  const targets = getTtsBatchTargets(true)
  if (!targets.length) {
    toast.info('当前没有可生成的对白或旁白')
    return
  }
  await ensureLocalTtsEngineForBatch()
  const concurrency = resolveTtsBatchConcurrency()
  void runBatchShotTTS(`正在重新生成全部 ${targets.length} 段配音（${concurrency} 路并发）…`, true)
}

async function runBatchShotTTS(batchMessage, force) {
  if (ttsBatchActive.value) {
    toast.warning('配音批量任务进行中')
    return
  }
  const targets = getTtsBatchTargets(force)
  if (!targets.length) return

  ttsBatchActive.value = true
  toast.info(batchMessage)

  const shotIds = targets.map(sb => sb.id)
  pendingTtsShotIds.value = [...new Set([...pendingTtsShotIds.value, ...shotIds])]

  try {
    const concurrency = resolveTtsBatchConcurrency()
    const results = await mapWithConcurrency(targets, concurrency, async sb =>
      storyboardAPI.generateTTS(sb.id, ttsGenerateOptions(force, sb)),
    )

    let submitFail = 0
    let immediate = 0
    const failures = []

    results.forEach((result, index) => {
      const sb = targets[index]
      if (!sb) return
      const label = formatTtsShotLabel(sb)
      if (result.status === 'rejected') {
        submitFail++
        failures.push(`${label}: ${result.reason?.message || '提交失败'}`)
        unmarkTtsPending(sb.id)
        return
      }
      const res = result.value
      if (res?.tts_audio_url) {
        applyTtsResultToStoryboard(sb.id, res)
        unmarkTtsPending(sb.id)
        immediate++
      } else if (res?.status !== 'processing') {
        submitFail++
        failures.push(`${label}: 提交失败`)
        unmarkTtsPending(sb.id)
      }
    })

    const stillPending = shotIds.filter(id => pendingTtsShotIds.value.includes(id))
    const submitted = shotIds.length - submitFail

    if (stillPending.length) {
      if (submitted > 0) {
        toast.success(`已提交 ${submitted} 段配音后台生成${immediate ? `（${immediate} 段已就绪）` : ''}`)
      }
      void watchTtsBatchResults(stillPending, resolveTtsWatchOptions()).then(({ completed, remaining }) => {
        ttsBatchActive.value = false
        if (remaining > 0) {
          const failHint = failures.length
            ? `；提交失败 ${failures.length} 段：${failures.slice(0, 2).join('；')}${failures.length > 2 ? '…' : ''}`
            : ''
          toast.warning(`配音完成 ${completed + immediate} 段，仍有 ${remaining} 段未完成${failHint}`)
        } else if (completed + immediate > 0) {
          toast.success(`剩余配音已全部生成${localTtsEnabled.value ? `（本地 ${localTtsEngineDisplayName()}）` : ''}`)
        } else if (failures.length) {
          toast.error(`${failures.length} 段配音失败：${failures.slice(0, 3).join('；')}${failures.length > 3 ? '…' : ''}`)
        }
      })
      return
    }

    ttsBatchActive.value = false
    if (submitFail && !immediate) {
      toast.error(`${submitFail} 段配音失败：${failures.slice(0, 3).join('；')}${failures.length > 3 ? '…' : ''}`)
    } else if (immediate > 0) {
      if (failures.length) {
        toast.warning(`已生成 ${immediate} 段，${failures.length} 段失败：${failures.slice(0, 2).join('；')}${failures.length > 2 ? '…' : ''}`)
      } else {
        toast.success(force
          ? `已重新生成 ${immediate} 条配音`
          : `剩余配音已全部生成${localTtsEnabled.value ? `（本地 ${localTtsEngineDisplayName()}）` : ''}`)
      }
    }
  } catch (e) {
    ttsBatchActive.value = false
    shotIds.forEach(unmarkTtsPending)
    toast.error(e.message)
  }
}

function getFirstFrame(s) { return s?.first_frame_image || s?.firstFrameImage || null }
function getLastFrame(s) { return s?.last_frame_image || s?.lastFrameImage || null }
function getNarrationShotImage(s) { return getNarrationShotOwnImage(s) }
function hasNarrationShotImage(s) { return !!getNarrationShotImage(s) }
function getNarrationDisplayImage(s) { return resolveNarrationEffectiveImage(sbs.value, s).path }
function narrationShotImageSrc(sb) {
  const path = getNarrationDisplayImage(sb)
  if (!path) return ''
  const stamp = sb?.updated_at || sb?.updatedAt || ''
  const file = String(path).split('/').pop() || ''
  const q = `?v=${encodeURIComponent(`${file}|${stamp}`)}`
  return `/${String(path).replace(/^\//, '')}${q}`
}
function narrationShotInherited(s) {
  return hasNarrationShotImage(s) && parseNarrationImageMeta(s).narration_image_mode === 'copy'
    || (!hasNarrationShotImage(s) && !!resolveNarrationEffectiveImage(sbs.value, s).inherited)
}
function narrationShotImageLabel(s) {
  const meta = parseNarrationImageMeta(s)
  if (meta.narration_shot_type === 'title') {
    const segment = extractNarrationSentence(s)
    if (meta.narration_image_mode === 'new') {
      return hasNarrationShotImage(s)
        ? `片头 · 已生成背景图（剧中红字：${segment}）`
        : `片头 · 待生成背景图（剧中红字：${segment}）`
    }
    const inherited = resolveNarrationEffectiveImage(sbs.value, s)
    return inherited.path
      ? `片头 · 沿用背景图（剧中红字：${segment}）`
      : '片头 · 待首镜生成背景图'
  }
  if (meta.narration_image_mode === 'new') {
    const paraHint = meta.paragraph_index != null ? `段 ${meta.paragraph_index + 1}` : '段落'
    const layoutHint = meta.paragraph_layout === 'diptych' ? ' · 两宫格' : ''
    const sceneHint = meta.scene_content ? ` · ${meta.scene_content.slice(0, 20)}${meta.scene_content.length > 20 ? '…' : ''}` : ''
    return hasNarrationShotImage(s)
      ? `${paraHint}${layoutHint} · 已生成配图${sceneHint}`
      : `${paraHint}${layoutHint} · 待生成配图${sceneHint}`
  }
  if (hasNarrationShotImage(s) && meta.narration_image_mode === 'copy') return '已复用邻镜配图'
  if (!narrationShotNeedsOwnImage(s)) return '沿用上一张'
  if (resolveNarrationEffectiveImage(sbs.value, s).inherited) return '同段 · 合成沿用前图'
  return '同段 · 沿用上一张'
}
function findPrevNarrationShotWithImage(sb) {
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  if (idx <= 0) return null
  for (let i = idx - 1; i >= 0; i--) {
    if (hasNarrationShotImage(sbs.value[i])) return sbs.value[i]
  }
  return null
}
function findNextNarrationShotWithImage(sb) {
  const idx = sbs.value.findIndex(item => item.id === sb.id)
  if (idx < 0 || idx >= sbs.value.length - 1) return null
  for (let i = idx + 1; i < sbs.value.length; i++) {
    if (hasNarrationShotImage(sbs.value[i])) return sbs.value[i]
  }
  return null
}
function narrationShotExplicitCopy(sb) {
  return hasNarrationShotImage(sb) && parseNarrationImageMeta(sb).narration_image_mode === 'copy'
}
function narrationImageMetaJson(mode) {
  return JSON.stringify({ narration_image_mode: mode })
}
async function reuseNarrationShotImage(sb) {
  const prev = findPrevNarrationShotWithImage(sb)
  if (!prev) {
    toast.warning('前面没有可复用的配图')
    return
  }
  await storyboardAPI.update(sb.id, {
    composed_image: getNarrationShotImage(prev),
    reference_images: narrationImageMetaJson('copy'),
  })
  toast.success('已复用上一镜配图')
  await refresh()
}
async function reuseNextNarrationShotImage(sb) {
  const next = findNextNarrationShotWithImage(sb)
  if (!next) {
    toast.warning('后面没有可复用的配图')
    return
  }
  await storyboardAPI.update(sb.id, {
    composed_image: getNarrationShotImage(next),
    reference_images: narrationImageMetaJson('copy'),
  })
  toast.success('已复用下一镜配图')
  await refresh()
}
async function clearNarrationShotImage(sb) {
  await storyboardAPI.update(sb.id, {
    composed_image: null,
    reference_images: narrationImageMetaJson('inherit'),
  })
  toast.success('已取消复用，合成时将自动沿用前图')
  await refresh()
}
async function markNarrationShotNeedImage(sb) {
  const sceneContent = resolveSceneContentForShot(sbs.value, sb)
  const style = getNarrationImageStyle()
  const meta = {
    narration_image_mode: 'new',
    scene_content: sceneContent,
    paragraph_layout: 'single',
  }
  const draft = {
    ...sb,
    reference_images: JSON.stringify(meta),
    image_prompt: null,
    imagePrompt: null,
  }
  await storyboardAPI.update(sb.id, {
    reference_images: JSON.stringify(meta),
    image_prompt: buildNarrationImagePrompt(draft, style, sbs.value),
  })
  toast.success('已标记为需配图')
  await refresh()
}

async function setNarrationShotLayout(sb, layout) {
  if (resolveNarrationParagraphLayout(sb) === layout) return
  const meta = parseNarrationImageMeta(sb)
  let parsed = {}
  const raw = sb?.reference_images || sb?.referenceImages
  if (raw) {
    try {
      parsed = typeof raw === 'object' ? { ...raw } : JSON.parse(raw)
    } catch {
      parsed = {}
    }
  }
  parsed.narration_image_mode = meta.narration_image_mode || 'new'
  parsed.paragraph_layout = layout
  if (meta.scene_content) parsed.scene_content = meta.scene_content
  if (meta.paragraph_index != null) parsed.paragraph_index = meta.paragraph_index
  if (meta.narration_shot_type) parsed.narration_shot_type = meta.narration_shot_type
  if (meta.narration_tts_mode) parsed.narration_tts_mode = meta.narration_tts_mode

  const style = getNarrationImageStyle()
  const existingPrompt = String(sb?.image_prompt || sb?.imagePrompt || '').trim()
  const draft = {
    ...sb,
    reference_images: JSON.stringify(parsed),
    image_prompt: existingPrompt ? existingPrompt : null,
    imagePrompt: existingPrompt ? existingPrompt : null,
  }
  const newPrompt = existingPrompt || buildNarrationImagePrompt(draft, style, sbs.value)
  await storyboardAPI.update(sb.id, {
    reference_images: JSON.stringify(parsed),
    image_prompt: newPrompt || null,
  })
  sb.reference_images = JSON.stringify(parsed)
  sb.image_prompt = newPrompt
  sb.imagePrompt = newPrompt
  toast.success(
    existingPrompt
      ? (layout === 'diptych' ? '已切换为两宫格，AI 配图文案已保留' : '已切换为完整单图，AI 配图文案已保留')
      : (layout === 'diptych' ? '已切换为两宫格' : '已切换为完整单图'),
  )
}
function isPendingNarrationShot(id) { return pendingNarrationShotIds.value.includes(id) }

function getNarrationShotImageJob(shotId) {
  return narrationShotImageJobs.value[shotId] || null
}

function patchNarrationShotImageJob(shotId, patch) {
  const prev = narrationShotImageJobs.value[shotId] || {}
  narrationShotImageJobs.value = {
    ...narrationShotImageJobs.value,
    [shotId]: { ...prev, ...patch },
  }
}

function clearNarrationShotImageJob(shotId, delayMs = 0) {
  if (delayMs > 0) {
    setTimeout(() => clearNarrationShotImageJob(shotId, 0), delayMs)
    return
  }
  if (!narrationShotImageJobs.value[shotId]) return
  const next = { ...narrationShotImageJobs.value }
  delete next[shotId]
  narrationShotImageJobs.value = next
}

/** 成功完成：弹窗开着时保留 completed，关弹窗再清 */
function clearNarrationShotImageJobAfterSuccess(shotId) {
  if (narrationShotImageModalOpen.value) return
  clearNarrationShotImageJob(shotId, 2500)
}

/** 配图已落库但轮询/待处理列表未清理时，同步前端生图状态 */
function reconcileNarrationShotImageState() {
  const pending = new Set(pendingNarrationShotIds.value)
  let jobs = { ...narrationShotImageJobs.value }
  let changedPending = false
  let changedJobs = false

  for (const sb of sbs.value) {
    if (!narrationShotNeedsOwnImage(sb) || !hasNarrationShotImage(sb)) continue
    if (pending.delete(sb.id)) changedPending = true
    if (jobs[sb.id]) {
      delete jobs[sb.id]
      changedJobs = true
    }
  }

  if (changedPending) {
    pendingNarrationShotIds.value = [...pending]
  }
  if (changedJobs) {
    narrationShotImageJobs.value = jobs
  }
}

/** 从 generation 记录立即把 local_path 写回镜头，避免 refresh 竞态导致页面空白 */
function applyNarrationShotImageFromGeneration(shotId, gen) {
  const path = String(gen?.local_path || gen?.localPath || gen?.image_url || gen?.imageUrl || '').trim()
  if (!path) return false
  // 强制新 stamp，避免与库内旧 updated_at 相同导致浏览器缓存旧图
  const stamp = String(
    gen?.completed_at || gen?.completedAt || gen?.updated_at || gen?.updatedAt || '',
  ) || new Date().toISOString()
  const bust = `${stamp}|${path}`
  const next = sbs.value.map((row) => {
    if (row.id !== shotId) return row
    return {
      ...row,
      composed_image: path,
      composedImage: path,
      updated_at: bust,
      updatedAt: bust,
    }
  })
  sbs.value = next
  if (selectedSb.value?.id === shotId) {
    selectedSb.value = {
      ...selectedSb.value,
      composed_image: path,
      composedImage: path,
      updated_at: bust,
      updatedAt: bust,
    }
  }
  return true
}

function jumpShotsListToShot(shotId) {
  const list = shotsFiltered.value
  const idx = list.findIndex(item => item.id === shotId)
  if (idx < 0) return
  const size = shotsListPageSize.value || 1
  shotsListPage.value = Math.floor(idx / size) + 1
}

async function finalizeNarrationShotImageReady(shotId, gen = null) {
  if (gen) applyNarrationShotImageFromGeneration(shotId, gen)
  await refreshStoryboardsOnly()
  // refresh 后若库里已有路径则保持；若仍空则用 generation.local_path 再挂一次
  if (gen) applyNarrationShotImageFromGeneration(shotId, gen)
  for (let retry = 0; retry < 4 && !hasNarrationShotImage(sbs.value.find(s => s.id === shotId)); retry++) {
    await sleep(500)
    await refreshStoryboardsOnly()
    if (gen) applyNarrationShotImageFromGeneration(shotId, gen)
  }
  const sb = sbs.value.find(s => s.id === shotId)
  if (hasNarrationShotImage(sb) || (gen && applyNarrationShotImageFromGeneration(shotId, gen))) {
    patchNarrationShotImageJob(shotId, { status: 'completed', percent: 100, message: '生成完成' })
    pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
    // 弹窗打开时保留 completed 状态供进度条展示；关闭弹窗时再清
    if (!narrationShotImageModalOpen.value) clearNarrationShotImageJobAfterSuccess(shotId)
    // 「生成中」过滤下镜头会消失：切到有图列表并翻到该镜
    if (shotsListFilter.value === 'processing' || shotsListFilter.value === 'pending') {
      shotsListFilter.value = 'done'
    }
    jumpShotsListToShot(shotId)
    return true
  }
  return false
}

async function pollNarrationShotImageJob(shotId, generationId, options = {}) {
  const attempts = options.attempts ?? 240
  const delay = options.delay ?? 3000
  const batchLabel = options.batchLabel

  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? 800 : delay)
    const pseudoPercent = Math.min(92, 12 + Math.round((i / attempts) * 80))

    if (generationId) {
      try {
        const gen = await imageAPI.get(generationId)
        if (!gen?.id && !gen?.status) {
          await refresh({ skipDramaRefetch: true })
          const sbMissing = sbs.value.find(s => s.id === shotId)
          // 无任务记录时：仅当不再 pending 且本镜有图才收尾（避免重生误判）
          if (hasNarrationShotImage(sbMissing) && !isPendingNarrationShot(shotId)) {
            patchNarrationShotImageJob(shotId, { status: 'completed', percent: 100, message: '生成完成' })
            clearNarrationShotImageJobAfterSuccess(shotId)
            return true
          }
          patchNarrationShotImageJob(shotId, {
            status: 'failed',
            percent: 100,
            message: '任务已取消',
            error: '配图任务记录不存在（可能生图时被「清除配图」打断），请重新生成',
          })
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
          clearNarrationShotImageJob(shotId, 15000)
          return false
        }
        if (gen?.status === 'failed') {
          const err = gen?.error_msg || gen?.errorMsg || '生成失败'
          patchNarrationShotImageJob(shotId, {
            status: 'failed',
            percent: 100,
            message: '生成失败',
            error: err,
          })
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
          clearNarrationShotImageJob(shotId, 15000)
          return false
        }
        if (gen?.status === 'processing' || gen?.status === 'pending') {
          const startedMs = Date.parse(String(gen?.created_at || gen?.createdAt || gen?.updated_at || gen?.updatedAt || ''))
          // 云端任务进程内轮询丢失后会永远 processing；超时后按失败收尾，避免弹窗卡死
          if (Number.isFinite(startedMs) && Date.now() - startedMs > 12 * 60 * 1000) {
            patchNarrationShotImageJob(shotId, {
              status: 'failed',
              percent: 100,
              message: '生成超时',
              error: '生图超时或服务中断，请重新生成该镜头',
            })
            pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
            clearNarrationShotImageJob(shotId, 15000)
            return false
          }
        }
        if (gen?.status === 'completed') {
          if (await finalizeNarrationShotImageReady(shotId, gen)) return true
          // completed 但分镜路径尚未可见：继续轮询，勿提前清 loading
          patchNarrationShotImageJob(shotId, {
            status: 'processing',
            percent: Math.max(pseudoPercent, 90),
            message: '配图已生成，同步到页面…',
            generationId,
          })
          continue
        }
      } catch {}
      // 仍有 generationId 且未 completed：禁止用库里旧配图误判「已完成」
      await refreshStoryboardsOnly()
      patchNarrationShotImageJob(shotId, {
        status: 'processing',
        percent: pseudoPercent,
        message: batchLabel ? `ComfyUI 生图中（${batchLabel}）` : 'ComfyUI 生图中…',
        generationId,
      })
      continue
    }

    await refreshStoryboardsOnly()
    const sb = sbs.value.find(s => s.id === shotId)
    if (hasNarrationShotImage(sb)) {
      patchNarrationShotImageJob(shotId, { status: 'completed', percent: 100, message: '生成完成' })
      pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
      clearNarrationShotImageJobAfterSuccess(shotId)
      if (shotsListFilter.value === 'processing' || shotsListFilter.value === 'pending') {
        shotsListFilter.value = 'done'
      }
      return true
    }

    patchNarrationShotImageJob(shotId, {
      status: 'processing',
      percent: pseudoPercent,
      message: batchLabel ? `ComfyUI 生图中（${batchLabel}）` : 'ComfyUI 生图中…',
      generationId,
    })
  }

  // Flux+Redux 在 3080 上可能超过 5 分钟；有 generationId 时必须等本任务完成，不能拿旧图交差
  await refresh({ skipDramaRefetch: true })
  if (generationId) {
    try {
      const gen = await imageAPI.get(generationId)
      if (gen?.status === 'completed' && await finalizeNarrationShotImageReady(shotId, gen)) return true
      const stillProcessing = gen?.status === 'processing' || gen?.status === 'pending'
      if (stillProcessing) {
        patchNarrationShotImageJob(shotId, {
          status: 'processing',
          percent: 92,
          message: 'ComfyUI 仍在生图，请稍候（刷新页面会继续等待）',
          generationId,
        })
        return false
      }
    } catch {}
  } else {
    const sbFinal = sbs.value.find(s => s.id === shotId)
    if (hasNarrationShotImage(sbFinal)) {
      patchNarrationShotImageJob(shotId, { status: 'completed', percent: 100, message: '生成完成' })
      pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
      clearNarrationShotImageJobAfterSuccess(shotId)
      return true
    }
  }

  let stillProcessing = false
  if (generationId) {
    try {
      const gen = await imageAPI.get(generationId)
      stillProcessing = gen?.status === 'processing' || gen?.status === 'pending'
      if (gen?.status === 'completed' && await finalizeNarrationShotImageReady(shotId, gen)) return true
    } catch {}
  }
  if (stillProcessing) {
    patchNarrationShotImageJob(shotId, {
      status: 'processing',
      percent: 92,
      message: 'ComfyUI 仍在生图，请稍候（刷新页面会继续等待）',
      generationId,
    })
    return false
  }

  patchNarrationShotImageJob(shotId, {
    status: 'failed',
    percent: 100,
    message: '生成超时',
    error: '轮询超时，请稍后刷新查看',
  })
  pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
  clearNarrationShotImageJob(shotId, 15000)
  return false
}

function scheduleNarrationShotImagePoll(shotId, generationId, options = {}) {
  const key = `${shotId}:${generationId || 'unknown'}`
  if (narrationShotImagePollers.has(key)) return
  narrationShotImagePollers.add(key)
  void pollNarrationShotImageJob(shotId, generationId, options).finally(() => {
    narrationShotImagePollers.delete(key)
  })
}

async function resumeCharImagePollIfNeeded() {
  if (!dramaId) return
  try {
    const rows = await imageAPI.list({ drama_id: dramaId })
    const list = Array.isArray(rows) ? rows : []
    const processing = list.filter(row => {
      const status = String(row?.status || '').toLowerCase()
      if (status !== 'processing' && status !== 'pending') return false
      const charId = Number(row?.character_id ?? row?.characterId)
      return Number.isFinite(charId) && charId > 0
    })
    for (const row of processing) {
      const charId = Number(row?.character_id ?? row?.characterId)
      const generationId = Number(row?.id)
      if (!Number.isFinite(charId) || !Number.isFinite(generationId)) continue
      if (!chars.value.some(c => c.id === charId)) continue
      if (!pendingCharImageIds.value.includes(charId)) {
        pendingCharImageIds.value.push(charId)
      }
      scheduleCharImagePoll(charId, generationId)
    }
  } catch {}
}

async function resumeNarrationShotImagePollIfNeeded() {
  if (!dramaId || !isNarrationMode.value) return
  reconcileNarrationShotImageState()
  try {
    const rows = await imageAPI.list({ drama_id: dramaId })
    const list = Array.isArray(rows) ? rows : []

    // 已完成但前端还停在「生图中」/无图：立刻用 local_path 挂上（刷新/HMR 丢轮询时常见）
    const recentCompleted = list.filter((row) => {
      const status = String(row?.status || '').toLowerCase()
      if (status !== 'completed') return false
      const frame = String(row?.frame_type || row?.frameType || '').toLowerCase()
      if (frame && frame !== 'illustration') return false
      return !!(row?.local_path || row?.localPath || row?.image_url || row?.imageUrl)
    })
    for (const row of recentCompleted) {
      const shotId = Number(row?.storyboard_id ?? row?.storyboardId)
      if (!Number.isFinite(shotId)) continue
      const sb = sbs.value.find(item => item.id === shotId)
      if (!sb) continue
      if (hasNarrationShotImage(sb) && !isPendingNarrationShot(shotId) && !getNarrationShotImageJob(shotId)) continue
      await finalizeNarrationShotImageReady(shotId, row)
    }

    const processing = list.filter(row => {
      const status = String(row?.status || '').toLowerCase()
      if (status !== 'processing' && status !== 'pending') return false
      const frame = String(row?.frame_type || row?.frameType || '').toLowerCase()
      return frame === 'illustration' || !frame
    })
    for (const row of processing) {
      const shotId = Number(row?.storyboard_id ?? row?.storyboardId)
      const generationId = Number(row?.id)
      if (!Number.isFinite(shotId) || !Number.isFinite(generationId)) continue
      const sb = sbs.value.find(item => item.id === shotId)
      if (!sb) continue
      if (hasNarrationShotImage(sb)) {
        pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== shotId)
        clearNarrationShotImageJob(shotId)
        continue
      }
      if (!pendingNarrationShotIds.value.includes(shotId)) {
        pendingNarrationShotIds.value.push(shotId)
      }
      patchNarrationShotImageJob(shotId, {
        status: 'processing',
        percent: getNarrationShotImageJob(shotId)?.percent ?? 20,
        message: 'ComfyUI 生图中…',
        generationId,
      })
      openNarrationShotImageProgressModal()
      scheduleNarrationShotImagePoll(shotId, generationId)
    }
  } catch {}
}

async function genNarrationShotImage(sb) {
  const style = getNarrationImageStyle()
  const basePrompt = getNarrationImagePromptText(sb, style)
  if (!basePrompt) {
    toast.warning('该镜头没有旁白文案，无法生成配图')
    return
  }
  if (needsFluxEnglishTranslate(sb)) {
    toast.warning('请先点击「翻译英文」，再生成配图')
    return
  }
  const otherPending = narrationShotsPendingImage(sbs.value).filter(item => item.id !== sb.id)
  if (otherPending.length) {
    toast.info(`另有未生成：${formatNarrationShotDisplayList(otherPending)}`)
  } else if (narrationShotNeedsOwnImage(sb) && !hasNarrationShotImage(sb)) {
    toast.info(`正在生成最后一镜 #${getNarrationShotDisplayNo(sb)}`)
  }
  if (!String(sb?.image_prompt || sb?.imagePrompt || '').trim()) {
    updateField(sb, 'image_prompt', basePrompt)
  }
  try {
    await ensureLocalModelForTask('image')
    if (!isPendingNarrationShot(sb.id)) pendingNarrationShotIds.value.push(sb.id)
    patchNarrationShotImageJob(sb.id, { status: 'submitting', percent: 8, message: '正在提交任务…' })
    openNarrationShotImageProgressModal()
    const characterIds = await resolveShotCharacterIds(sb)
    const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
      storyboard_id: sb.id,
      drama_id: dramaId,
      frame_type: 'illustration',
    }, episodeImageModel.value, characterIds, sbs.value)
    const generation = await imageAPI.generate(buildImagePayload(payload))
    const generationId = generation?.id ?? null
    patchNarrationShotImageJob(sb.id, {
      status: 'processing',
      percent: 15,
      message: 'ComfyUI 生图中…',
      generationId,
    })
    toast.success('配图生成中')
    scheduleNarrationShotImagePoll(sb.id, generationId)
  } catch (e) {
    patchNarrationShotImageJob(sb.id, {
      status: 'failed',
      percent: 100,
      message: '提交失败',
      error: e.message,
    })
    pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(item => item !== sb.id)
    clearNarrationShotImageJob(sb.id, 15000)
    toast.error(e.message)
  }
}

async function watchNarrationImageBatchResult(jobs, options = {}) {
  // Qwen GGUF 冷启动可能要数分钟；原先 60×4s≈4min 易超时却任务已在后台完成
  const attempts = options.attempts ?? 180
  const delay = options.delay ?? 4000

  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? 1500 : delay)

    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'failed') continue
      if (!job.generationId) continue
      const doneCount = jobs.filter(j => j.status === 'completed' || j.status === 'failed').length
      const batchLabel = `${doneCount}/${jobs.length}`
      try {
        const gen = await imageAPI.get(job.generationId)
        if (gen?.status === 'failed') {
          job.status = 'failed'
          job.error = gen?.error_msg || gen?.errorMsg || '生成失败'
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
          patchNarrationShotImageJob(job.shotId, {
            status: 'failed',
            percent: 100,
            message: '生成失败',
            error: job.error,
          })
          clearNarrationShotImageJob(job.shotId, 15000)
          continue
        }
        if (gen?.status === 'completed') {
          if (await finalizeNarrationShotImageReady(job.shotId, gen)) {
            job.status = 'completed'
          } else {
            patchNarrationShotImageJob(job.shotId, {
              status: 'processing',
              percent: 95,
              message: '配图已生成，同步到页面…',
              generationId: job.generationId,
            })
          }
          continue
        }
        patchNarrationShotImageJob(job.shotId, {
          status: 'processing',
          percent: Math.min(92, 15 + Math.round((doneCount / Math.max(jobs.length, 1)) * 70)),
          message: `ComfyUI 生图中（${batchLabel}）`,
          generationId: job.generationId,
        })
      } catch {}
    }

    await refreshStoryboardsOnly()
    // 批量任务同样：有 generationId 时禁止用旧配图误判完成（由上方 gen.status===completed 分支收尾）
    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'failed') continue
      if (job.generationId) continue
      const sb = sbs.value.find(s => s.id === job.shotId)
      if (hasNarrationShotImage(sb)) {
        job.status = 'completed'
        pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
        patchNarrationShotImageJob(job.shotId, { status: 'completed', percent: 100, message: '生成完成' })
        clearNarrationShotImageJobAfterSuccess(job.shotId)
        jumpShotsListToShot(job.shotId)
      }
    }

    if (jobs.every(j => j.status === 'completed' || j.status === 'failed')) {
      const failed = jobs.filter(j => j.status === 'failed')
      const completed = jobs.filter(j => j.status === 'completed')
      if (failed.length && !completed.length) {
        toast.error(`${failed.length} 张配图失败：${failed[0].error || '请检查图像 API 配置'}`)
      } else if (failed.length) {
        toast.warning(`${completed.length} 张完成，${failed.length} 张失败`)
      } else if (completed.length) {
        toast.success(`${completed.length} 张配图已完成`)
        if (shotsListFilter.value === 'processing' || shotsListFilter.value === 'pending') {
          shotsListFilter.value = 'done'
        }
      }
      await sleep(failed.length ? 1200 : 0)
      reconcileNarrationShotImageState()
      return true
    }
  }

  for (const job of jobs) {
    if (job.status === 'processing' || job.status === 'pending') {
      const sb = sbs.value.find(s => s.id === job.shotId)
      if (hasNarrationShotImage(sb)) {
        job.status = 'completed'
        pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
        clearNarrationShotImageJob(job.shotId)
        continue
      }
      // 超时前再拉一次 generation，可能后台已完成
      if (job.generationId) {
        try {
          const gen = await imageAPI.get(job.generationId)
          if (gen?.status === 'completed' && await finalizeNarrationShotImageReady(job.shotId, gen)) {
            job.status = 'completed'
            continue
          }
        } catch {}
      }
      job.status = 'failed'
      job.error = job.error || '生成超时'
      pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
    }
  }
  toast.warning('配图生成超时，请稍后重试或刷新页面')
  reconcileNarrationShotImageState()
  return false
}

async function batchNarrationShotImages(options) {
  const allPending = narrationShotsPendingImage(sbs.value)
  const filteredPending = allPending.filter(sb => storyboardMatchesNarrationImageCharFilter(sb))
  const pending = options?.shots?.length
    ? options.shots
    : (options?.forceRegen
      ? narrationImagesRegenShotsFiltered.value
      : filteredPending)
  if (!pending.length) {
    toast.info(options?.forceRegen
      ? (narrationImageCharFilterActive.value
        ? `「${narrationImageCharFilterLabel.value}」暂无已有配图可重新生成`
        : '暂无已有配图可重新生成')
      : (narrationImageCharFilterActive.value
        ? `「${narrationImageCharFilterLabel.value}」相关镜头均已生成配图`
        : '所有需配图镜头已生成'))
    return
  }
  if (options?.forceRegen) {
    const scopeHint = narrationImageCharFilterActive.value
      ? `所选角色「${narrationImageCharFilterLabel.value}」`
      : '本集'
    if (!confirm(`将重新生成${scopeHint} ${pending.length} 张已有配图（覆盖原图）。是否继续？`)) return
  }
  const needTranslate = pending.filter(sb => needsFluxEnglishTranslate(sb))
  if (needTranslate.length) {
    toast.warning(`有 ${needTranslate.length} 个镜头尚未有 Flux 英文，请点「翻译英文」后再生图`)
    return
  }
  const pendingLabel = formatNarrationShotDisplayList(pending)
  const pendingHint = pending.length < allPending.length || narrationImageCharFilterActive.value
    ? `${pendingLabel}（${pending.length}${narrationImageCharFilterActive.value ? ' · ' + narrationImageCharFilterLabel.value : '/' + allPending.length} 张）`
    : formatNarrationPendingImageHint(sbs.value)
  const concurrency = resolveStoryboardImageBatchConcurrency()
  if (!tryBeginBatch('narrationImages', `${options?.forceRegen ? '重新生成配图' : '配图生成中'}：${pendingHint}${concurrency > 1 ? ` · ${concurrency} 路并发` : ''}…`)) return
  if (pending.length) shotsListFilter.value = 'processing'
  openNarrationShotImageProgressModal()
  const jobs = pending.map(sb => ({
    shotId: sb.id,
    generationId: null,
    status: 'pending',
    error: '',
  }))
  try {
    await ensureLocalModelForTask('image')
    const style = getNarrationImageStyle()
    pendingNarrationShotIds.value = [...new Set([...pendingNarrationShotIds.value, ...pending.map(sb => sb.id)])]

    let completedCount = 0
    let failedCount = 0
    const imageModel = String(episodeImageModel.value || '').trim()
    const agnesBatch = imageModel.toLowerCase().startsWith('agnes-image')

    const results = await mapWithConcurrency(pending, concurrency, async (sb, index) => {
      const job = jobs[index]
      if (!job) throw new Error('内部任务缺失')
      const batchLabel = `${index + 1}/${pending.length}`
      patchNarrationShotImageJob(sb.id, { status: 'submitting', percent: 6, message: concurrency > 1 ? `并发提交（${batchLabel}）…` : `排队提交（${batchLabel}）…` })
      const characterIds = await resolveShotCharacterIds(sb)
      const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
        storyboard_id: sb.id,
        drama_id: dramaId,
        frame_type: 'illustration',
      }, episodeImageModel.value, characterIds, sbs.value)
      if (agnesBatch) payload.model = 'agnes-image-2.0-flash'
      const generation = await imageAPI.generate(buildImagePayload(payload))
      job.generationId = generation?.id ?? null
      if (!job.generationId) {
        throw new Error('提交失败：未返回任务 ID')
      }
      job.status = 'processing'
      patchNarrationShotImageJob(job.shotId, {
        status: 'processing',
        percent: 12,
        message: concurrency > 1
          ? `Agnes 并发生图中（${batchLabel}）`
          : `生图中（${batchLabel}）`,
        generationId: job.generationId,
      })
      const ok = await pollNarrationShotImageJob(sb.id, job.generationId, {
        batchLabel,
        attempts: 240,
        delay: concurrency > 1 ? 3000 : 4000,
      })
      if (!ok) {
        throw new Error(getNarrationShotImageJob(sb.id)?.error || '生成失败')
      }
      job.status = 'completed'
      return true
    })

    for (let i = 0; i < results.length; i++) {
      const row = results[i]
      const job = jobs[i]
      const sb = pending[i]
      if (row?.status === 'fulfilled') {
        completedCount++
      } else {
        failedCount++
        const errMsg = row?.reason?.message || String(row?.reason || '提交失败')
        if (job) {
          job.status = 'failed'
          job.error = errMsg
        }
        if (sb) {
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== sb.id)
          patchNarrationShotImageJob(sb.id, {
            status: 'failed',
            percent: 100,
            message: '生成失败',
            error: errMsg,
          })
          clearNarrationShotImageJob(sb.id, 15000)
        }
      }
    }

    if (failedCount && !completedCount) {
      toast.error(`${failedCount} 个镜头配图失败（${pendingLabel}）`)
    } else if (failedCount) {
      toast.warning(`${completedCount} 张完成，${failedCount} 张失败`)
    } else {
      toast.success(options?.forceRegen
        ? `已重新生成 ${completedCount} 张配图${concurrency > 1 ? `（${concurrency} 路并发）` : ''}`
        : `配图已全部生成：${pendingHint}${concurrency > 1 ? `（${concurrency} 路并发）` : ''}`)
    }
  } finally {
    reconcileNarrationShotImageState()
    endBatch('narrationImages')
  }
}


async function regenerateNarrationShotImagesForFilter() {
  return batchNarrationShotImages({ forceRegen: true })
}

function getStoryboardCover(s) {
  if (isNarrationMode.value) return getNarrationDisplayImage(s) || getNarrationShotImage(s)
  return s?.composed_image || s?.composedImage || getFirstFrame(s) || getLastFrame(s) || null
}
function getVideoUrl(s) { return s?.video_url || s?.videoUrl || null }
function getComposedVideoUrl(s) { return getStoryboardComposedVideoUrl(s) }
function hasImg(s) { return !!getStoryboardCover(s) }
function hasVid(s) { return !!getVideoUrl(s) }
function hasDialogueForCompose(s) { return hasDialogue(s) }
function canCompose(s) {
  if (hasVid(s)) return true
  if (isNarrationMode.value) return hasDialogueForCompose(s)
  return hasImg(s)
}
function hasComposed(s) { return hasComposedStoryboard(s, sbs.value, composeUnitGroups.value) }

function getShotReferenceImages(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 6) return
    refs.push(value)
  }
  // 定妆参考优先（Flux Redux 身份锁定）
  for (const charId of getStoryboardCharacterIds(sb)) {
    const char = chars.value.find(item => item.id === charId)
    pushRef(char?.image_url || char?.imageUrl)
  }
  for (const ref of getRefs(sb)) {
    pushRef(ref)
  }
  const first = getFirstFrame(sb)
  const last = getLastFrame(sb)
  pushRef(first)
  pushRef(last)
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = scenes.value.find(item => item.id === sceneId)
  pushRef(scene?.image_url || scene?.imageUrl)
  return refs.filter(Boolean).slice(0, 6)
}

function buildShotImagePrompt(sb, frameType) {
  const title = sb.title || ''
  const description = sb.image_prompt || sb.imagePrompt || sb.description || ''
  const shotType = sb.shot_type || sb.shotType || ''
  const angle = sb.angle || ''
  const movement = sb.movement || ''
  const location = sb.location || getSceneName(sb)
  const time = sb.time || ''
  const charactersText = getStoryboardCharacterNames(sb).join('、')
  const action = sb.action || ''
  const atmosphere = sb.atmosphere || ''
  const frameHint = frameType === 'first_frame'
    ? '生成这个镜头的起始关键帧，突出建立关系和动作开始瞬间'
    : '生成这个镜头的结束关键帧，突出动作结束、情绪落点或结果状态'

  return [
    title ? `镜头标题：${title}` : '',
    description ? `画面描述：${description}` : '',
    shotType ? `景别：${shotType}` : '',
    angle ? `机位：${angle}` : '',
    movement ? `运镜：${movement}` : '',
    charactersText ? `角色：${charactersText}` : '',
    location ? `地点：${location}` : '',
    time ? `时间：${time}` : '',
    action ? `动作：${action}` : '',
    atmosphere ? `氛围：${atmosphere}` : '',
    frameHint,
  ].filter(Boolean).join('；')
}

async function genShotFrame(sb, frameType) {
  const prompt = buildShotImagePrompt(sb, frameType)
  const referenceImages = getShotReferenceImages(sb)
  const key = framePendingKey(sb.id, frameType)
  try {
    await ensureLocalModelForTask('image')
    if (!pendingShotFrameKeys.value.includes(key)) pendingShotFrameKeys.value.push(key)
    const body = buildImagePayload({
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt,
      frame_type: frameType,
      reference_images: referenceImages.length ? referenceImages : undefined,
    })
    await imageAPI.generate(body)
    toast.success(frameType === 'first_frame' ? '首帧生成中' : '尾帧生成中')
    await refresh()
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === sb.id)
      const done = frameType === 'first_frame' ? !!getFirstFrame(target) : !!getLastFrame(target)
      if (done) pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
      return done
    })
  } catch (e) {
    pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
    toast.error(e.message)
  }
}

async function genVid(sb) {
  const cover = resolveVideoReferenceImage(sb)
  if (!cover) {
    toast.error('请先生成配图再生成视频')
    return
  }
  const anchor = resolveNarrationImageAnchorShot(sbs.value, sb) || sb
  const duration = estimateVideoDurationSec(sb)
  const prompt = buildLocalVideoPrompt(sb)
  const videoModel = String(localModelBarVideoModel.value || DEFAULT_LOCAL_VIDEO_MODEL)
  const isWan = /wan/i.test(videoModel)
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt,
    duration,
    model: videoModel,
  }
  const first = getFirstFrame(anchor) || getFirstFrame(sb) || cover
  const last = getLastFrame(sb) || getLastFrame(anchor)
  const refs = getRefs(sb)
  if (isWan && videoModel.includes('flf') && first && last) {
    Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last })
  } else if (isWan && first && last && !videoModel.includes('i2v')) {
    Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last })
  } else if (refs.length) {
    Object.assign(params, { reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter(Boolean), image_url: cover })
  } else {
    Object.assign(params, { reference_mode: 'single', image_url: cover, first_frame_url: first || cover })
  }
  try {
    if (isWan) {
      await ensureLocalModelForTask('video', { comfyVideoModel: videoModel })
    }
    delete failedVideoMessages.value[sb.id]
    delete videoProgressMessages.value[sb.id]
    if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
    videoProgressMessages.value = {
      ...videoProgressMessages.value,
      [sb.id]: isWan ? '已提交，等待 ComfyUI…' : '正在用 Glide/轻量运镜生成…',
    }
    const generation = await videoAPI.generate(params)
    toast.success(isWan ? 'Wan 视频生成中（较慢）' : '运镜动态生成中')
    console.info(`[VideoGen] 已提交 storyboard=${sb.id} gen=${generation?.id} model=${videoModel}`)
    await refresh()
    pollVideoGeneration(generation?.id, sb.id)
  } catch (e) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  }
}
async function pollVideoGeneration(generationId, storyboardId) {
  // 本地 Wan 图生视频常需 10～40+ 分钟（冷启动更久）；后端 waitComfy 上限约 2h
  // 原先 120×4s≈8min 会误报超时，任务其实仍在 Comfy 跑
  const maxAttempts = 900
  const delayMs = 5000
  const startedAt = Date.now()
  const formatElapsed = (ms) => {
    const sec = Math.max(0, Math.round(ms / 1000))
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`
  }
  if (!generationId) {
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === storyboardId)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete videoProgressMessages.value[storyboardId]
      }
      return done
    }, maxAttempts, delayMs)
    return
  }
  let lastStatus = ''
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(delayMs)
    try {
      const res = await videoAPI.get(generationId)
      lastStatus = String(res?.status || '')
      const progressText = String(res?.error_msg || res?.errorMsg || '').trim()
      const elapsed = formatElapsed(Date.now() - startedAt)
      if (lastStatus === 'processing' || lastStatus === 'pending') {
        const label = progressText || `视频生成中 · 已等待 ${elapsed}`
        videoProgressMessages.value = { ...videoProgressMessages.value, [storyboardId]: label }
        if (i === 0 || i % 3 === 0) {
          console.info(`[VideoGen] storyboard=${storyboardId} gen=${generationId} ${label}`)
        }
      }
      // 只刷分镜，避免每 5s 全量 refresh 拖慢页面
      await refreshStoryboardsOnly().catch(() => {})
      if (res?.status === 'completed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete failedVideoMessages.value[storyboardId]
        delete videoProgressMessages.value[storyboardId]
        console.info(`[VideoGen] storyboard=${storyboardId} 完成，耗时 ${elapsed}`)
        toast.success('视频生成完成')
        return
      }
      if (res?.status === 'failed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete videoProgressMessages.value[storyboardId]
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [storyboardId]: progressText || '视频生成失败',
        }
        console.error(`[VideoGen] storyboard=${storyboardId} 失败:`, failedVideoMessages.value[storyboardId])
        toast.error(failedVideoMessages.value[storyboardId])
        return
      }
    } catch (err) {
      if (i % 6 === 0) console.warn(`[VideoGen] storyboard=${storyboardId} 轮询异常`, err)
    }
  }
  // 仍在排队/处理中：后端可能还在跑，勿当硬失败
  pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  delete videoProgressMessages.value[storyboardId]
  if (lastStatus === 'pending' || lastStatus === 'processing' || !lastStatus) {
    toast.warning('视频生成较慢，后台仍在继续，请稍后刷新页面查看结果')
    return
  }
  failedVideoMessages.value = {
    ...failedVideoMessages.value,
    [storyboardId]: '视频生成超时',
  }
  toast.error('视频生成超时')
}

async function deleteShotVideo(sb) {
  if (!hasVid(sb)) {
    toast.info('该单元还没有视频')
    return
  }
  if (isPendingVideo(sb.id)) {
    toast.info('正在生成中，请稍后再删')
    return
  }
  const label = getComposeUnitShotRangeLabel(sb, sbs.value)
  if (!confirm(`确定删除 ${label} 的本地视频？可稍后重新生成。`)) return
  try {
    await storyboardAPI.update(sb.id, { video_url: null })
    sb.video_url = null
    sb.videoUrl = null
    delete failedVideoMessages.value[sb.id]
    delete videoProgressMessages.value[sb.id]
    toast.success(`已删除 ${label} 视频`)
    await refreshStoryboardsOnly()
  } catch (e) {
    toast.error(e.message || '删除视频失败')
  }
}

async function doCompose(sb) {
  try {
    delete failedComposeMessages.value[sb.id]
    if (!isPendingCompose(sb.id)) pendingComposeIds.value.push(sb.id)
    await composeAPI.shot(sb.id)
    toast.success('合成完成')
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    await refreshStoryboardsOnly()
  } catch (e) {
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    failedComposeMessages.value = {
      ...failedComposeMessages.value,
      [sb.id]: e.message,
    }
    toast.error(e.message)
  }
}
async function batchVideos() {
  const targets = videoGenTargets.value.filter(s => hasImg(s) && !hasVid(s))
  if (!targets.length) {
    toast.info('没有可生成的镜头（需有配图且尚未生成视频）')
    return
  }
  const videoModel = String(localModelBarVideoModel.value || DEFAULT_LOCAL_VIDEO_MODEL)
  const isWan = /wan/i.test(videoModel)
  if (!tryBeginBatch('videos', isWan
    ? `批量 Wan 视频中（串行 ${targets.length}）…`
    : `批量动图风中（${targets.length}）…`)) return
  try {
    if (isWan) {
      await ensureLocalModelForTask('video', { comfyVideoModel: videoModel })
    }
    for (const sb of targets) {
      pendingVideoIds.value = [...new Set([...pendingVideoIds.value, sb.id])]
      try {
        await genVid(sb)
        // 串行：Wan 防爆显存；轻量动态也串行以免 FFmpeg 抢满磁盘
        await watchAsyncResult(() => {
          const target = sbs.value.find(s => s.id === sb.id)
          return !!(target?.video_url || target?.videoUrl) || !!failedVideoMessages.value[sb.id]
        }, isWan ? 900 : 120, isWan ? 5000 : 1500)
      } catch (e) {
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [sb.id]: e?.message || '视频生成失败',
        }
      }
    }
  } finally {
    endBatch('videos')
  }
}
async function batchCompose() {
  const pending = composeUnitShots.value.filter(sb => !hasComposedStoryboard(sb, sbs.value, composeUnitGroups.value))
  if (!pending.length) {
    toast.info('所有可合成镜头已完成')
    return
  }
  if (!tryBeginBatch('compose', `镜头合成中（剩余 ${pending.length} 个 · 并发）…`)) return
  try {
    if (composeProcessingCount.value) composeListFilter.value = 'processing'
    const res = await composeAPI.all(epId.value, { only_remaining: true })
    const concurrency = res?.concurrency || 3
    const scopeIds = Array.isArray(res?.scope_storyboard_ids) ? res.scope_storyboard_ids : collectComposeScopeStoryboardIds(pending, sbs.value)
    pendingComposeIds.value = [...new Set(scopeIds)]
    const groupCount = res?.total || res?.storyboard_count || pending.length
    toast.info(`已开始合成 ${scopeIds.length} 个镜头（${concurrency} 路并发）`)
    await pollComposeStatus({ expectStoryboardIds: scopeIds })
  } catch (e) {
    toast.error(e.message)
  } finally {
    endBatch('compose')
  }
}

async function regenerateAllComposeAndMerge() {
  const targets = composableShots.value
  if (!targets.length) {
    toast.info('没有可合成的镜头')
    return
  }
  if (!tryBeginBatch('compose', `正在重新合成全部 ${targets.length} 个镜头…`)) return
  try {
    const res = await composeAPI.all(epId.value, { only_remaining: false })
    const concurrency = res?.concurrency || 3
    const scopeIds = Array.isArray(res?.scope_storyboard_ids) ? res.scope_storyboard_ids : collectComposeScopeStoryboardIds(targets, sbs.value)
    pendingComposeIds.value = [...new Set(scopeIds)]
    toast.info(`已开始重新合成 ${scopeIds.length} 个镜头（${concurrency} 路并发）`)
    const ok = await pollComposeStatus({
      successMessage: '全部镜头合成完成，正在拼接导出…',
      maxAttempts: Math.max(600, scopeIds.length * 4),
      expectStoryboardIds: scopeIds,
    })
    await refresh()
    if (!ok) return
    panel.value = 'export'
    exportTab.value = 'merge'
    await doMerge({ wait: true })
  } catch (e) {
    toast.error(e.message)
  } finally {
    endBatch('compose')
  }
}
function stopComposePoll() {
  if (composePollTimer) {
    clearInterval(composePollTimer)
    composePollTimer = null
  }
}

function applyComposeStatusPatch(res, options = {}) {
  const expectStoryboardIds = options.expectStoryboardIds ?? null
  const items = Array.isArray(res?.items) ? res.items : []
  const scopedItems = expectStoryboardIds?.length
    ? items.filter(item => expectStoryboardIds.includes(item.id))
    : items
  const byId = new Map(items.map(item => [item.id, item]))
  for (const sb of sbs.value) {
    const item = byId.get(sb.id)
    if (!item) continue
    const url = item.composed_video_url ?? item.composedVideoUrl
    const status = item.status ?? sb.status
    if (url != null && url !== sb.composed_video_url) {
      sb.composed_video_url = url
      sb.composedVideoUrl = url
    }
    if (status !== sb.status) sb.status = status
  }
  pendingComposeIds.value = composableShots.value
    .filter(sb => sb.status === 'compose_processing')
    .map(sb => sb.id)
  const failedItems = scopedItems.filter(item => item.status === 'compose_failed')
  if (failedItems.length) {
    const next = { ...failedComposeMessages.value }
    failedItems.forEach((item) => {
      next[item.id] = item.error_msg || item.errorMsg || '视频合成失败'
    })
    failedComposeMessages.value = next
  }
  return { scopedItems, items }
}

function evaluateComposePollDone(res, options, scopedItems) {
  const expectStoryboardIds = options.expectStoryboardIds ?? null
  const items = Array.isArray(res?.items) ? res.items : []
  const processingCount = expectStoryboardIds?.length
    ? scopedItems.filter(item => item.status === 'compose_processing').length
    : (res?.processing ?? items.filter(item => item.status === 'compose_processing').length)
  const failedItems = scopedItems.filter(item => item.status === 'compose_failed')
  const incompleteCount = scopedItems.filter(item => {
    const url = item.composed_video_url || item.composedVideoUrl
    if (url) return false
    if (item.status === 'compose_failed' || item.status === 'compose_cancelled') return false
    return true
  }).length
  if (processingCount > 0 || incompleteCount > 0) return { done: false, failedItems }
  return { done: true, failedItems }
}

async function tickComposePoll(options = {}) {
  const res = await composeAPI.status(epId.value)
  const { scopedItems } = applyComposeStatusPatch(res, options)
  return evaluateComposePollDone(res, options, scopedItems)
}

async function resumeComposePollIfNeeded() {
  if (!epId.value || composePollTimer || batchRunning.value.has('compose')) return
  try {
    const res = await composeAPI.status(epId.value)
    const processing = Number(res?.processing ?? 0)
    applyComposeStatusPatch(res)
    if (processing <= 0) return
    batchRunning.value = new Set([...batchRunning.value, 'compose'])
    toast.info(`检测到 ${processing} 个镜头仍在合成，继续等待…`)
    void pollComposeStatus({ maxAttempts: 600 }).finally(() => endBatch('compose'))
  } catch {}
}

function stopMergePoll() {
  if (mergePollTimer) {
    clearInterval(mergePollTimer)
    mergePollTimer = null
  }
}

function startMergePoll(onDone) {
  stopMergePoll()
  mergePollTimer = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    const mainStatus = mergeData.value?.status
    const testStatus = mergeData.value?.test?.status
    const mainActive = ['processing', 'pending'].includes(mainStatus)
    const testActive = ['processing', 'pending'].includes(testStatus)
    if (mainActive || testActive) return

    stopMergePoll()
    if (pendingMergeKind.value === 'test') {
      if (testStatus === 'completed') {
        toast.success(`测试导出完成（前 ${testMergeClipCount.value} 段）`)
        await refresh()
      } else if (testStatus === 'failed') {
        toast.error(testMergeFailedMessage.value)
      }
      pendingMergeKind.value = null
      return
    }

    if (mainStatus === 'completed') {
      toast.success('视频生成完成')
      await refresh()
      onDone?.(true)
    } else if (mainStatus === 'failed') {
      toast.error(mergeFailedMessage.value)
      onDone?.(false)
    } else {
      onDone?.(false)
    }
    pendingMergeKind.value = null
  }, 1500)
}

function waitForMergeComplete() {
  return new Promise((resolve) => {
    startMergePoll(resolve)
  })
}

async function cancelMerge() {
  try {
    await mergeAPI.cancel(epId.value)
    stopMergePoll()
    pendingMergeKind.value = null
    mergeData.value = {
      ...(mergeData.value || {}),
      status: mergeData.value?.status === 'processing' || mergeData.value?.status === 'pending' ? 'cancelled' : mergeData.value?.status,
      test: mergeData.value?.test && ['processing', 'pending'].includes(mergeData.value.test.status)
        ? { ...mergeData.value.test, status: 'cancelled' }
        : mergeData.value?.test,
    }
    toast.info('已取消生成')
  } catch (e) {
    toast.error(e.message)
  }
}

async function cancelCompose() {
  try {
    composePollAborted = true
    await composeAPI.cancel(epId.value)
    stopComposePoll()
    endBatch('compose')
    pendingComposeIds.value = []
    if (pendingMergeKind.value === 'test' && !testMergeProcessing.value) {
      pendingMergeKind.value = null
    }
    try {
      const res = await composeAPI.status(epId.value)
      applyComposeStatusPatch(res)
    } catch {}
    await refresh()
    toast.info('已取消合成')
  } catch (e) {
    toast.error(e.message)
  }
}

function stopOpeningPoll() {
  if (openingPollTimer) {
    clearInterval(openingPollTimer)
    openingPollTimer = null
  }
}

function startOpeningPoll() {
  stopOpeningPoll()
  openingPollTimer = setInterval(async () => {
    try {
      const status = await episodeAPI.openingVideoStatus(epId.value)
      if (status?.status === 'processing') return
      stopOpeningPoll()
      openingVideoProcessing.value = false
      await refresh()
      if (status?.status === 'completed') toast.success('开幕视频已生成')
      else if (status?.status === 'failed') toast.error(status?.opening_video_error || '开幕视频生成失败')
    } catch {
      stopOpeningPoll()
      openingVideoProcessing.value = false
    }
  }, 2500)
}

async function exportOpeningPickedImages() {
  if (!epId.value || !illustrationImageCount.value) {
    toast.warning('暂无可用配图，请先生成或上传镜头配图')
    return
  }
  const count = openingPickCount.value
  openingPickedImagesExporting.value = true
  try {
    const blob = await episodeAPI.exportOpeningPickedImages(epId.value, { count })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `opening-images-ep${epId.value}.zip`
    a.click()
    URL.revokeObjectURL(url)
    await refresh()
    toast.success(`已导出 ${count} 张配图（第 1 张=集内首张，第 ${count} 张=集内末张）`)
  } catch (e) {
    toast.error(e.message || '导出失败')
  } finally {
    openingPickedImagesExporting.value = false
  }
}

async function generateOpeningVideo() {
  if (!illustrationImageCount.value) {
    toast.warning('暂无可用配图，请先生成或上传镜头配图')
    return
  }
  try {
    openingVideoProcessing.value = true
    await episodeAPI.generateOpeningVideo(epId.value, { count: openingPickCount.value })
    toast.success('开幕视频生成中…')
    startOpeningPoll()
  } catch (e) {
    openingVideoProcessing.value = false
    toast.error(e.message)
  }
}

let titlePollTimer = null

function stopTitlePoll() {
  if (titlePollTimer) {
    clearInterval(titlePollTimer)
    titlePollTimer = null
  }
}

function startTitlePoll() {
  stopTitlePoll()
  titlePollTimer = setInterval(async () => {
    try {
      const status = await episodeAPI.titleVideoStatus(epId.value)
      if (status?.status === 'processing') return
      stopTitlePoll()
      titleVideoProcessing.value = false
      await refresh()
      if (status?.status === 'completed') toast.success('片头视频已生成')
      else if (status?.status === 'failed') toast.error(status?.title_video_error || '片头视频生成失败')
    } catch {
      stopTitlePoll()
      titleVideoProcessing.value = false
    }
  }, 2500)
}

async function generateTitleVideo() {
  if (!titleShots.value.length) {
    toast.warning('本集没有片头镜')
    return
  }
  if (!titleShotsReady.value) {
    toast.warning('请为全部片头镜完成配图与配音')
    return
  }
  try {
    titleVideoProcessing.value = true
    await episodeAPI.generateTitleVideo(epId.value)
    toast.success('片头视频生成中…')
    startTitlePoll()
  } catch (e) {
    titleVideoProcessing.value = false
    toast.error(e.message)
  }
}

async function mergeOpeningIntoMain() {
  if (!mergeUrl.value) {
    toast.error('请先完成全集拼接')
    return
  }
  if (!openingVideoUrl.value) {
    toast.error('请先生成开幕视频')
    return
  }
  if (mergeHasOpening.value) {
    toast.info('当前成片已包含开幕视频')
    return
  }
  try {
    await mergeAPI.mergeOpening(epId.value)
    mergeData.value = {
      status: 'processing',
      merged_url: null,
      mergedUrl: null,
      progress_percent: 0,
      progress_message: '正在合并开幕视频…',
    }
    toast.success('正在合并开幕视频…')
    startMergePoll()
  } catch (e) {
    toast.error(e.message)
  }
}

async function mergeTitleIntoMain() {
  if (!mergeUrl.value) {
    toast.error('请先完成全集拼接')
    return
  }
  if (!titleVideoUrl.value) {
    toast.error('请先生成片头视频')
    return
  }
  if (mergeHasTitle.value) {
    toast.info('当前成片已包含片头视频')
    return
  }
  try {
    await mergeAPI.mergeTitle(epId.value)
    mergeData.value = {
      status: 'processing',
      merged_url: null,
      mergedUrl: null,
      progress_percent: 0,
      progress_message: '正在合并片头视频…',
    }
    toast.success('正在合并片头视频…')
    startMergePoll()
  } catch (e) {
    toast.error(e.message)
  }
}

async function regenerateMerge() {
  stopMergePoll()
  await doMerge()
}

async function doTestMerge() {
  const limit = normalizedMergeTestClipLimit()
  mergeTestClipLimit.value = limit
  const targets = getTestMergeTargets(limit)
  if (!targets.length) {
    toast.error('暂无分镜')
    return false
  }
  const notReady = targets.filter(sb => !isTestComposeUnitReady(sb))
  if (notReady.length) {
    toast.error(`前 ${limit} 段中有 ${notReady.length} 段尚未就绪（需配图+配音）`)
    return false
  }
  if (!tryBeginBatch('compose', `测试导出：重新合成前 ${targets.length} 段…`)) return false

  pendingMergeKind.value = 'test'
  panel.value = 'export'
  exportTab.value = 'merge'

  try {
    const res = await composeAPI.all(epId.value, {
      only_remaining: false,
      storyboard_ids: targets.map(sb => sb.id),
    })
    const scopeIds = Array.isArray(res?.scope_storyboard_ids)
      ? res.scope_storyboard_ids
      : collectComposeScopeStoryboardIds(targets, sbs.value)
    pendingComposeIds.value = [...new Set(scopeIds)]
    toast.info(`正在重新合成前 ${targets.length} 段…`)

    const ok = await pollComposeStatus({
      expectStoryboardIds: scopeIds,
      successMessage: `前 ${targets.length} 段合成完成，正在测试拼接…`,
      maxAttempts: Math.max(120, scopeIds.length * 4),
    })
    await refresh()
    if (!ok) {
      pendingMergeKind.value = null
      return false
    }

    await mergeAPI.merge(epId.value, { ...buildMergePayload(), clip_limit: limit })
    mergeData.value = {
      ...(mergeData.value || {}),
      test: {
        status: 'processing',
        merged_url: null,
        mergedUrl: null,
        progress_percent: 0,
        progress_message: `正在拼接前 ${targets.length} 段…`,
      },
    }
    startMergePoll()
  } catch (e) {
    pendingMergeKind.value = null
    toast.error(e.message)
    return false
  } finally {
    endBatch('compose')
  }
}

async function doMerge(options = {}) {
  if (!canMergeBody.value) {
    const missing = composableCount.value - composedCount.value
    toast.error(`尚有 ${missing} 个合成单元未完成（${composedCount.value}/${composableCount.value}），请先在「镜头合成」完成全部单元后再导出`)
    return false
  }
  if (exportMixBgm.value && bgmAppliedCount.value > 0) {
    toast.info('镜头合成已含 BGM，成片不再额外混入，避免重叠')
  } else if (exportMixBgm.value && !exportBgmMusicId.value && exportBgmOptions.value.length) {
    exportBgmMusicId.value = exportBgmOptions.value[0].value
  } else if (exportMixBgm.value && !exportBgmMusicId.value) {
    toast.warning('未选择 BGM，将仅拼接旁白；可在右侧选择曲目或前往「BGM 配乐」生成')
  }
  try {
    pendingMergeKind.value = 'full'
    await mergeAPI.merge(epId.value, buildMergePayload())
    mergeData.value = {
      status: 'processing',
      merged_url: null,
      mergedUrl: null,
      progress_percent: 0,
      progress_message: '正在启动拼接…',
    }
    toast.success('生成中…')
    if (options.wait) return waitForMergeComplete()
    startMergePoll()
  } catch (e) {
    pendingMergeKind.value = null
    toast.error(e.message)
    return false
  }
}

async function pollComposeStatus(options = {}) {
  const maxAttempts = options.maxAttempts ?? Math.max(120, Math.ceil(sbs.value.length / 3) * 6)
  const pollIntervalMs = options.pollIntervalMs ?? (sbs.value.length > 80 ? 6000 : 4000)
  let attempts = 0
  composePollAborted = false
  stopComposePoll()

  const finishPoll = async (result) => {
    stopComposePoll()
    await refreshStoryboardsOnly()
    if (composePollAborted) return false
    const { failedItems = [] } = result
    if (failedItems.length) {
      toast.error(`有 ${failedItems.length} 个镜头合成失败`)
      return false
    }
    toast.success(options.successMessage || '剩余镜头合成完成')
    return true
  }

  try {
    const first = await tickComposePoll(options)
    if (first.done) return finishPoll(first)
  } catch {}

  return new Promise((resolve) => {
    composePollTimer = setInterval(async () => {
      if (composePollAborted) {
        stopComposePoll()
        resolve(false)
        return
      }
      attempts += 1
      try {
        const result = await tickComposePoll(options)
        if (result.done) {
          const ok = await finishPoll(result)
          resolve(ok)
          return
        }
        if (attempts >= maxAttempts) {
          stopComposePoll()
          toast.error('合成等待超时，请稍后在导出页手动拼接')
          resolve(false)
        }
      } catch {
        if (attempts >= maxAttempts) {
          stopComposePoll()
          toast.error('合成等待超时，请稍后在导出页手动拼接')
          resolve(false)
        }
      }
    }, pollIntervalMs)
  })
}
function getRefs(sb) {
  const raw = sb.reference_images || sb.referenceImages
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function loadConfigs() {
  try {
    const [imgCfgs, vidCfgs, audCfgs, musCfgs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
      aiConfigAPI.list('music'),
    ])
    imageConfigs.value = imgCfgs || []
    videoConfigs.value = vidCfgs || []
    audioConfigs.value = audCfgs || []
    musicConfigs.value = musCfgs || []
    const activeMusic = (musCfgs || []).find(c => c.is_active)
    if (activeMusic?.model) {
      bgmModel.value = Array.isArray(activeMusic.model) ? activeMusic.model[0] : activeMusic.model
    } else {
      bgmModel.value = DEFAULT_BGM_MODEL
    }
  } catch (e) { console.error('Failed to load AI configs', e) }
}

function inferVoiceGender(name, desc = []) {
  const text = `${name} ${Array.isArray(desc) ? desc.join(' ') : ''}`
  if (/(?:^|[\s:/_-])male(?:[-_]|$)/i.test(text)) return '男声'
  if (/(?:^|[\s:/_-])female(?:[-_]|$)/i.test(text)) return '女声'
  if (/(男|青年|大爷|学长|\bboy\b|\bman\b|\bmale\b)/i.test(text)) return '男声'
  if (/(女|少女|御姐|奶奶|晓晨|晨宝|笑笑|翠兰|老板娘|\bgirl\b|\bwoman\b|\bfemale\b)/i.test(text)) return '女声'
  return '中性'
}

function inferCharacterGenderLabel(char) {
  if (!char) return ''
  const text = `${char.name || ''} ${char.role || ''} ${char.appearance || ''} ${char.description || ''}`
  if (/旁白|解说|narrator|画外音/i.test(text)) return '中性'
  if (/女主|少女|女性|姑娘|师姐|师妹|母亲|娘|妻|女二|女|奶奶|阿姨|御姐/i.test(text)) return '女声'
  if (/男主|少年|男性|男子|师兄|师弟|父亲|爷|爸|兄|男二|男|反派|魔头|宿敌|长老|掌门|boss/i.test(text)) return '男声'
  return ''
}

function resolveShotVoiceGenderLabel(sb) {
  const speaker = getDialogueSpeaker(sb)
  const char = chars.value.find(c => c.name === speaker)
  const voiceId = char?.voice_style || char?.voiceStyle
  if (voiceId) {
    const localProfile = getLocalVoiceProfile(voiceId)
    if (localProfile?.gender) return localProfile.gender
    const profile = voiceProfiles.value.find(v => v.id === voiceId)
    if (profile?.gender && profile.gender !== '本地') return profile.gender
  }
  return inferCharacterGenderLabel(char)
}

function mapVoiceProfile(v) {
  const desc = Array.isArray(v.description) ? v.description : []
  return {
    id: v.voice_id,
    label: v.voice_name || v.voice_id,
    gender: inferVoiceGender(v.voice_name || v.voice_id, desc),
    traits: desc.length ? desc.slice(0, 2).join('、') : `${v.language || '多语言'}音色`,
    suitable: desc.length > 2 ? desc.slice(2).join('、') : `${v.language || '通用'}角色`,
  }
}

async function loadEdgeVoices() {
  try {
    const rows = await voicesAPI.list('edge')
    return rows?.length
      ? rows.map(mapVoiceProfile)
      : [{ id: DEFAULT_LOCAL_EDGE_VOICE, label: '云希（男·解说）', gender: '男声', traits: '本地 Edge', suitable: '解说旁白' }]
  } catch (e) {
    console.error('Failed to load edge voices', e)
    return [{ id: DEFAULT_LOCAL_EDGE_VOICE, label: '云希（男·解说）', gender: '男声', traits: '本地 Edge', suitable: '解说旁白' }]
  }
}

async function loadVoiceboxVoices() {
  try {
    const health = await voicesAPI.voiceboxHealth()
    voiceboxAvailable.value = !!health?.ok
    voiceboxModelLoaded.value = !!health?.model_loaded
    if (!health?.ok) return []
    const rows = await voicesAPI.list('voicebox', { model_size: localVoiceboxModelSize.value })
    if (!rows?.length) return []
    const presetEngineLabel = (engine) => {
      if (engine === 'qwen_custom_voice') return 'CustomVoice'
      if (engine === 'kokoro') return 'Kokoro'
      return engine || '预设'
    }
    return rows.map(v => {
      const isCloned = v.voice_type === 'cloned'
      const isPreset = v.voice_type === 'preset'
      const engineLabel = presetEngineLabel(v.preset_engine)
      const desc = Array.isArray(v.description) ? v.description[0] : ''
      const notReady = v.model_ready === false
      const isChinese = v.language === '中文' || /^preset:kokoro:z[fm]_/i.test(String(v.voice_id || ''))
      return {
        id: v.voice_id,
        label: isCloned
          ? `${v.voice_name}（克隆）`
          : isPreset
            ? `${v.voice_name}（预设·${engineLabel}${notReady ? '·模型未就绪' : ''}）`
            : v.voice_name,
        gender: inferVoiceGender(v.voice_name || v.voice_id, desc ? [desc] : v.description),
        traits: v.supports_instruct
          ? '支持感情 instruct'
          : isCloned
            ? 'Voicebox 克隆'
            : 'Voicebox 预设',
        suitable: notReady
          ? (v.model_hint || '模型未下载')
          : (desc || `${v.language || '中文'}${isCloned ? ` · 样本 ${v.sample_count ?? 0}` : ''}`),
        modelReady: v.model_ready !== false,
        modelHint: v.model_hint || '',
        supportsInstruct: v.supports_instruct === true,
        isChinese,
      }
    })
  } catch (e) {
    console.error('Failed to load voicebox voices', e)
    voiceboxAvailable.value = false
    voiceboxModelLoaded.value = false
    return []
  }
}

async function loadGptSovitsVoices() {
  try {
    const catalog = await voicesAPI.gptsovitsCatalog().catch(() => null)
    const rows = catalog?.voices || await voicesAPI.list('gptsovits').catch(() => [])
    const [gsvHealth, indexHealth] = await Promise.all([
      voicesAPI.gptsovitsHealth().catch(() => null),
      voicesAPI.indexttsHealth().catch(() => null),
    ])
    gptsovitsAvailable.value = !!gsvHealth?.ok
    indexttsAvailable.value = !!indexHealth?.ok
    if (!rows?.length) return []
    return rows.map(v => {
      const desc = Array.isArray(v.description) ? v.description[0] : ''
      return {
        id: v.voice_id,
        label: v.voice_name || stripGsvId(v.voice_id),
        gender: inferVoiceGender(v.voice_name || v.voice_id, desc ? [desc] : v.description),
        traits: '音色克隆',
        suitable: desc || v.prompt_text || '参考音频克隆',
        isChinese: true,
        source: 'gptsovits',
      }
    })
  } catch (e) {
    console.error('Failed to load GPT-SoVITS voices', e)
    gptsovitsAvailable.value = false
    return []
  }
}

function stripGsvId(id) {
  return String(id || '').replace(/^gsv:/i, '').trim()
}

function toGsvRef(id) {
  const raw = stripGsvId(id)
  return raw ? `gsv:${raw}` : ''
}

function resolveDefaultClonedVoiceId(profiles = edgeVoiceProfiles.value) {
  const byId = profiles.find(p => p.id === DEFAULT_CLONED_VOICE_ID || stripGsvId(p.id) === '008')
  if (byId) return byId.id
  const byName = profiles.find(p => /云希/.test(String(p.label || '')))
  return byName?.id || profiles[0]?.id || DEFAULT_CLONED_VOICE_ID
}

function ensureClonedVoiceForEngine() {
  if (!usesGsvClonedVoices(localTtsEngine.value)) return
  const isEdgeVoice = /^zh-/i.test(String(localEdgeVoiceId.value || ''))
  const missing = !edgeVoiceProfiles.value.some(p => p.id === localEdgeVoiceId.value)
  if (missing || isEdgeVoice) {
    localEdgeVoiceId.value = resolveDefaultClonedVoiceId(edgeVoiceProfiles.value)
  }
}

/** 仅一次性把「从未显式选过引擎」的旧默认迁到 IndexTTS2；已选 Edge 则保留 */
function migrateLegacyEdgeDefaultTtsPrefs() {
  if (typeof window === 'undefined' || !epId.value) return
  const flagKey = `episode-${epId.value}-tts-migrated-edge-default-v2`
  if (window.localStorage.getItem(flagKey)) return
  const storedEngine = window.localStorage.getItem(`episode-${epId.value}-local-tts-engine`)
  const storedVoice = window.localStorage.getItem(`episode-${epId.value}-local-voice`)
  // null = 旧默认未写入；不再把用户主动选择的 edge 强行改掉
  if (storedEngine === null) {
    localTtsEngine.value = DEFAULT_LOCAL_TTS_ENGINE
    if (!storedVoice || storedVoice === DEFAULT_LOCAL_EDGE_VOICE || /^zh-/i.test(String(storedVoice))) {
      localEdgeVoiceId.value = DEFAULT_CLONED_VOICE_ID
    }
    persistLocalTtsPrefs()
  }
  window.localStorage.setItem(flagKey, '1')
}

function resetGsvForm() {
  gsvEditingId.value = ''
  gsvForm.voice_id = ''
  gsvForm.voice_name = ''
  gsvForm.ref_audio_path = ''
  gsvForm.prompt_text = ''
  gsvForm.prompt_lang = 'zh'
  gsvForm.language = '中文'
  gsvForm.gpt_weights = ''
  gsvForm.sovits_weights = ''
  gsvPreviewUrl.value = ''
  if (gsvFileInputRef.value) gsvFileInputRef.value.value = ''
}

const canSaveGsvVoice = computed(() => {
  return !!stripGsvId(gsvForm.voice_id)
    && !!String(gsvForm.voice_name || '').trim()
    && !!String(gsvForm.ref_audio_path || '').trim()
    && !!String(gsvForm.prompt_text || '').trim()
})

const gsvVoiceInCatalog = computed(() => {
  const id = stripGsvId(gsvForm.voice_id)
  return !!id && gsvCatalogVoices.value.some(v => stripGsvId(v.voice_id) === id)
})

async function loadGsvVoiceCatalog() {
  if (!usesLocalModelPipeline.value) return
  gsvLoading.value = true
  try {
    const catalog = await voicesAPI.gptsovitsCatalog().catch(() => null)
    gsvCatalogVoices.value = catalog?.voices || []
    await loadLocalCastVoices()
    const [gsvHealth, indexHealth] = await Promise.all([
      voicesAPI.gptsovitsHealth().catch(() => null),
      voicesAPI.indexttsHealth().catch(() => null),
    ])
    gptsovitsAvailable.value = !!gsvHealth?.ok
    indexttsAvailable.value = !!indexHealth?.ok
  } catch (e) {
    console.error('Failed to load GPT-SoVITS catalog', e)
  } finally {
    gsvLoading.value = false
  }
}

async function onGsvFilePick(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  gsvUploading.value = true
  try {
    const res = await voicesAPI.uploadGptsovitsRef(file)
    gsvForm.ref_audio_path = res?.ref_audio_path || res?.refAudioPath || ''
    if (!gsvForm.ref_audio_path) throw new Error('上传成功但未返回路径')
    toast.success('参考音频已上传')
  } catch (e) {
    toast.error(e.message)
  } finally {
    gsvUploading.value = false
    if (gsvFileInputRef.value) gsvFileInputRef.value.value = ''
  }
}

function editGsvVoice(v) {
  const id = stripGsvId(v.voice_id)
  gsvEditingId.value = id
  gsvPanelOpen.value = true
  gsvForm.voice_id = id
  gsvForm.voice_name = v.voice_name || id
  gsvForm.ref_audio_path = v.ref_audio_path || ''
  gsvForm.prompt_text = v.prompt_text || ''
  gsvForm.prompt_lang = v.prompt_lang || 'zh'
  gsvForm.language = v.language || '中文'
  gsvForm.gpt_weights = v.gpt_weights || ''
  gsvForm.sovits_weights = v.sovits_weights || ''
  gsvPreviewUrl.value = ''
}

async function saveGsvVoice() {
  if (!canSaveGsvVoice.value) {
    toast.warning('请填写音色 ID、名称、参考音频与参考文本')
    return
  }
  gsvSaving.value = true
  try {
    const payload = {
      voice_id: stripGsvId(gsvForm.voice_id),
      voice_name: String(gsvForm.voice_name).trim(),
      ref_audio_path: String(gsvForm.ref_audio_path).trim(),
      prompt_text: String(gsvForm.prompt_text).trim(),
      prompt_lang: String(gsvForm.prompt_lang || 'zh').trim() || 'zh',
      language: String(gsvForm.language || '中文').trim() || '中文',
    }
    if (gsvForm.gpt_weights?.trim()) payload.gpt_weights = gsvForm.gpt_weights.trim()
    if (gsvForm.sovits_weights?.trim()) payload.sovits_weights = gsvForm.sovits_weights.trim()
    await voicesAPI.saveGptsovitsVoice(payload)
    toast.success(gsvEditingId.value ? '音色已更新' : '音色已添加（项目全局可用）')
    resetGsvForm()
    gsvPanelOpen.value = false
    await loadGsvVoiceCatalog()
  } catch (e) {
    toast.error(e.message)
  } finally {
    gsvSaving.value = false
  }
}

async function deleteGsvVoice(v) {
  const id = stripGsvId(v.voice_id)
  if (!id) return
  if (!window.confirm(`确定删除全局音色「${v.voice_name || id}」？`)) return
  gsvDeletingId.value = id
  try {
    await voicesAPI.deleteGptsovitsVoice(id)
    toast.success('已删除')
    if (gsvEditingId.value === id) resetGsvForm()
    await loadGsvVoiceCatalog()
  } catch (e) {
    toast.error(e.message)
  } finally {
    gsvDeletingId.value = ''
  }
}

async function previewGsvVoice() {
  const voiceId = toGsvRef(gsvForm.voice_id)
  if (!voiceId || !gptsovitsAvailable.value) return
  gsvPreviewing.value = true
  gsvPreviewUrl.value = ''
  try {
    const res = await voicesAPI.previewLocal({
      local_tts_engine: 'gptsovits',
      local_voice: voiceId,
      text: String(gsvForm.prompt_text || '').trim() || '这是一段 GPT-SoVITS 试听。',
    })
    const path = res?.audio_url || res?.audioUrl
    if (!path) throw new Error('试听生成失败')
    gsvPreviewUrl.value = path.startsWith('/') ? path : `/${path.replace(/^\/+/, '')}`
    toast.success('试听已生成')
  } catch (e) {
    toast.error(e.message)
  } finally {
    gsvPreviewing.value = false
  }
}

async function refreshLocalVoices() {
  if (usesGsvClonedVoices(localTtsEngine.value)) {
    const profiles = await loadGptSovitsVoices()
    edgeVoiceProfiles.value = profiles
    ensureClonedVoiceForEngine()
    return
  }
  if (localTtsEngine.value === 'voicebox') {
    const profiles = await loadVoiceboxVoices()
    edgeVoiceProfiles.value = profiles
    if (profiles.length && !profiles.some(p => p.id === localEdgeVoiceId.value)) {
      const preferred = profiles.find(p => p.isChinese) || profiles[0]
      localEdgeVoiceId.value = preferred.id
    }
    return
  }
  edgeVoiceProfiles.value = await loadEdgeVoices()
  if (!edgeVoiceProfiles.value.some(p => p.id === localEdgeVoiceId.value)) {
    localEdgeVoiceId.value = edgeVoiceProfiles.value[0]?.id || DEFAULT_LOCAL_EDGE_VOICE
  }
}

async function loadVoices() {
  try {
    const provider = lockedAudioProvider.value || 'minimax'
    const rows = await voicesAPI.list(provider)
    voiceProfiles.value = rows?.length ? rows.map(mapVoiceProfile) : fallbackVoiceProfiles
  } catch (e) {
    console.error('Failed to load voices', e)
    voiceProfiles.value = fallbackVoiceProfiles
  }
}

watch([lockedAudioConfigId, audioConfigs], () => { loadVoices() }, { deep: true })
watch([localTtsEnabled, localTtsEngine, localEdgeVoiceId, localTtsSpeed, localVoiceboxInstructPreset, localVoiceboxInstructCustom, localVoiceboxModelSize], persistLocalTtsPrefs)
watch(localVoiceboxModelSize, () => {
  if (localTtsEngine.value === 'voicebox') refreshLocalVoices()
  if (isNarrationLikeMode.value) loadLocalCastVoices()
})
watch(localTtsEngine, () => { refreshLocalVoices() })
watch(bgmAppliedCount, (count) => {
  if (count > 0 && exportMixBgm.value) {
    exportMixBgm.value = false
    persistExportBgmPrefs()
  }
})
watch([exportMixBgm, exportBgmMusicId, exportBgmVolume], persistExportBgmPrefs)
watch(exportWatermarkText, () => {
  persistExportBgmPrefs()
  scheduleWatermarkSave()
})
watch(exportWatermarkAnimated, () => {
  persistExportBgmPrefs()
  scheduleWatermarkSave()
})
watch(exportBgmOptions, (opts) => {
  if (!exportBgmMusicId.value && opts.length) exportBgmMusicId.value = opts[0].value
})
watch(narratorChar, (c) => {
  const voice = c?.voice_style || c?.voiceStyle
  if (voice) customTtsVoiceId.value = voice
}, { immediate: true })
watch(epId, () => { restoreLocalTtsPrefs(); restoreExportBgmPrefs(); restoreNarrationBreakdownSummary(); restoreImageDetectModePrefs(); restoreImageDetectBatchPrefs(); restoreNarrationImageStylePref(); restoreOpeningPickPrefs() }, { immediate: true })
watch(openingPickCount, persistOpeningPickPrefs)
watch([imageDetectBatchThreshold, imageDetectBatchSize, imagePromptBatchSize], () => { persistImageDetectBatchPrefs() })
watch([epId, isNarrationLikeMode, isLocalComicMode], ([id, narrationLike, localComic]) => {
  if (id && (narrationLike || localComic)) void loadLocalCastVoices()
}, { immediate: true })
watch([scriptStep, isLocalComicMode], ([step, localComic]) => {
  if (localComic && step === LOCAL_DRAMA_VOICE_STEP) void loadGsvVoiceCatalog()
  else if (!localComic && step === 3) void loadGsvVoiceCatalog()
})
watch([prodTab, epId, () => isNarrationLikeMode.value], ([tab]) => {
  if (tab === 'bgm' && epId.value) loadBgmLibrary()
  if (tab === 'voice' && isNarrationLikeMode.value) {
    void loadLocalCastVoices()
    if (isMotionComicMode.value) void loadVoiceboxVoices()
  }
})
watch([composeListFilter, () => sbs.value.length], () => { composeListPage.value = 1 })
watch(composePageCount, (count) => {
  if (composeListPage.value > count) composeListPage.value = count
})
watch([videosListFilter, () => videoGenTargets.value.length], () => { videosListPage.value = 1 })
watch(videosPageCount, (count) => {
  if (videosListPage.value > count) videosListPage.value = count
})
watch(prodTab, (tab, prev) => {
  if (usesLocalModelPipeline.value) {
    syncLocalModelStage(`prod:${tab}`)
  }
  if (tab === 'shots' || prev === 'shots') {
    shotsListFilter.value = 'all'
    shotsListPage.value = 1
  }
  if (tab === 'videos') videosListPage.value = 1
  if (tab === 'dubbing') dubbingListPage.value = 1
})
watch(dubbingPageCount, (count) => {
  if (dubbingListPage.value > count) dubbingListPage.value = count
})
watch([shotsListFilter, () => sbs.value.length], () => { shotsListPage.value = 1 })
watch(
  () => sbs.value.map(sb => `${sb.id}:${sb.reference_images || sb.referenceImages || ''}:${sb.updated_at || sb.updatedAt || ''}`).join('|'),
  () => { hydrateShotImageValidateFromStoryboards(false) },
  { immediate: true },
)
watch(shotsPageCount, (count) => {
  if (shotsListPage.value > count) shotsListPage.value = count
})
watch(() => sbs.value.length, () => { scriptStoryboardPage.value = 1 })
watch(scriptStoryboardPageCount, (count) => {
  if (scriptStoryboardPage.value > count) scriptStoryboardPage.value = count
})
watch([panel, epId], ([p, id]) => {
  if (p === 'export' && id) loadBgmLibrary({ resumePoll: false })
})

async function onLocalTtsEngineChange(engine) {
  if (!engine || engine === localTtsEngine.value) return
  localTtsEngine.value = engine
  persistLocalTtsPrefs()
  if (!usesLocalModelPipeline.value) return
  if (prodTab.value === 'dubbing' || panel.value === 'script') {
    try {
      await ensureLocalModelForTask('audio', { ttsEngine: resolveActiveLocalTtsEngine() })
      await refreshLocalModelStatus()
    } catch {
      // ensureLocalModelForTask 已 toast
    }
  }
}

async function initLocalVoices() {
  const readStoredVoice = () => (
    typeof window !== 'undefined' && epId.value
      ? window.localStorage.getItem(`episode-${epId.value}-local-voice`)
      : null
  )

  if (usesLocalModelPipeline.value) {
    await refreshLocalModelStatus()
    await loadGsvVoiceCatalog()
  }
  await refreshLocalVoices()

  if (isLocalComicMode.value) localTtsEnabled.value = true

  if (isNarrationLikeMode.value || isLocalComicMode.value) {
    migrateLegacyEdgeDefaultTtsPrefs()
    // Edge 引擎保留用户选择；仅 GSV 克隆引擎时清掉残留的 Edge 音色 ID
    if (usesGsvClonedVoices(localTtsEngine.value) && (!readStoredVoice() || /^zh-/i.test(String(localEdgeVoiceId.value || '')))) {
      ensureClonedVoiceForEngine()
    }
    if (epId.value) persistLocalTtsPrefs()
  }

  // 仅 Voicebox 完全不可用时才换引擎；IndexTTS2 未就绪仍保持选中，由 UI 显示「未就绪」
  if (!voiceboxAvailable.value && localTtsEngine.value === 'voicebox' && !edgeVoiceProfiles.value.length) {
    localTtsEngine.value = DEFAULT_LOCAL_TTS_ENGINE
    await refreshLocalVoices()
    if (epId.value) persistLocalTtsPrefs()
  }
}

watch(() => Number(route.params.episodeNumber), (next, prev) => {
  if (prev != null && next !== prev) {
    selectedSb.value = null
    chars.value = []
    scenes.value = []
    sbs.value = []
    void refresh({ skipDramaRefetch: true })
  }
})

onMounted(() => {
  void refresh()
  void initLocalVoices()
  loadConfigs()
  loadVoices()
  if (epId.value) {
    sessionStorage.removeItem(`huobao:tts-batch:${epId.value}`)
  }
  if (usesLocalModelPipeline.value) {
    void refreshLocalModelStatus().then(() => {
      const stage = resolveLocalModelStageFromNav(activeSubStepKey.value)
      if (stage && stage !== 'idle' && stageNeedsLocalHardware(stage)) {
        syncLocalModelStage(activeSubStepKey.value)
      }
    })
    startLocalModelBarPolling()
  }
})

onBeforeUnmount(() => {
  stopLocalModelBarPolling()
})

watch(usesLocalModelPipeline, enabled => {
  if (enabled) startLocalModelBarPolling()
  else stopLocalModelBarPolling()
})

watch(localModelSwitching, () => {
  if (usesLocalModelPipeline.value) startLocalModelBarPolling()
})

watch(currentLocalModelStage, stage => {
  if (!stage || stage === 'idle') return
  if (localModelBarStage.value === stage) return
  localModelBarStage.value = stage
})

  return {
    BaseSelect,
    COMPOSE_LIST_PAGE_SIZE,
    VIDEO_LIST_PAGE_SIZE,
    DEFAULT_LOCAL_EDGE_VOICE,
    DEFAULT_OPENING_IMAGE_COUNT,
    DEFAULT_TTS_SPEED,
    DEFAULT_VOICEBOX_MODEL_SIZE,
    DUBBING_LIST_PAGE_SIZE,
    IGNORE_TTS_SPEAKERS,
    IGNORE_TTS_TEXT,
    LOCAL_TTS_PREVIEW_DEFAULT,
    Loader2,
    NARRATION_PROMPT_COPY_BATCH_SIZE,
    OPENING_SUBTITLE_DEFAULT,
    OPENING_SUBTITLE_LEGACY,
    NARRATION_SHOT_PAGE_SIZE,
    PROD_SHOT_PAGE_SIZE,
    SCRIPT_CHAT_WELCOME,
    SCRIPT_STORYBOARD_PAGE_SIZE,
    STORYBOARD_COMMA_MERGE_MAX_CHARS,
    STORYBOARD_STRONG_PUNCT_BOUNDARY_RE,
    STORYBOARD_WEAK_PUNCT_BOUNDARY_RE,
    VOICEBOX_INSTRUCT_CUSTOM,
    activeBubbleKey,
    activeGridCell,
    activeMainStage,
    activeSubStepKey,
    activeSubSteps,
    addNarrationCharacter,
    addShot,
    anyMergeProcessing,
    applyBgmToAllShots,
    applyBgmToShot,
    applyCharacterUploadedImage,
    applyComposeStatusPatch,
    applyExportBgmToAllShots,
    applyGridState,
    applyNarrationSrtFiles,
    applyScriptChatToEditor,
    applyShotUploadedImage,
    applyTtsResultToStoryboard,
    artStyleLabel,
    audioConfigs,
    audioUploadInputRef,
    audioUploadTarget,
    batchCharAppearances,
    batchCharImages,
    batchDialogueExpressions,
    regenerateAllCharPortraitImages,
    batchCompose,
    batchGenSamples,
    batchNarrationShotImages,
    regenerateNarrationShotImagesForFilter,
    batchRunning,
    batchSceneImages,
    batchShotTTS,
    batchShotTTSAll,
    batchVideos,
    bgmAppliedCount,
    bgmApplyingAllId,
    bgmCompletedCount,
    bgmDesc,
    bgmDescGenerating,
    bgmGenerating,
    bgmLibrary,
    bgmModel,
    bgmModelLabel,
    bgmModelOptions,
    bgmPendingCount,
    bgmTargetSbId,
    bgmUploadInput,
    bgmUploading,
    bodyComposableCount,
    bodyComposedCount,
    bodyShots,
    bubbleSteps,
    buildCustomTtsPayload,
    buildImagePayload,
    buildLocalTtsPreviewPayload,
    buildMergePayload,
    buildNarrationImageDetectLabel,
    buildNarrationImagePromptLabel,
    buildNarrationMetaForShot,
    buildShotImagePrompt,
    canCompose,
    canDownloadOpeningImages,
    canExport,
    canGoNext,
    canMergeBody,
    canTestMerge,
    cancelCompose,
    cancelMerge,
    charAppearancesPendingCount,
    charImagesPendingCount,
    charImgCount,
    charPortraitUseReferenceById,
    charVoicePreviewingId,
    charVoicePreviewSrc,
    charVoicePreviewUrls,
    chars,
    charsVoiced,
    clearAllCharPortraitImages,
    clearAllComposedVideos,
    clearAllNarrationImageDetect,
    clearAllNarrationImagePrompts,
    clearAllNarrationImages,
    narrationImageCharFilterIds,
    toggleNarrationImageCharFilter,
    clearNarrationImageCharFilter,
    selectAllNarrationImageCharFilter,
    narrationImageCharFilterActive,
    narrationImageCharFilterLabel,
    showNarrationImageCharFilter,
    narrationImagesRegenCount,
    clearAllNarrationTts,
    clearAllStoryboards,
    clearCharPortraitImage,
    clearNarrationShotImage,
    clearNarrationSrtFiles,
    clearScriptChat,
    clearImageDetectChat,
    clearImagePromptChat,
    clearStoryboardChat,
    clearUploadedEpisodeAudio,
    closeComposeVideoViewer,
    closeImageViewer,
    closeShotEditor,
    composableCount,
    composableShots,
    composeFailMessage,
    composeFilteredShots,
    composeListFilter,
    composeListPage,
    videosListPage,
    videosListFilter,
    videosFilteredTargets,
    videosPageCount,
    videosPageShots,
    videosDoneCount,
    videosProcessingCount,
    composePageCount,
    composePageShots,
    composePendingCount,
    composeProcessing,
    composeProcessingCount,
    composeUnitIndex,
    composeUnitShots,
    composeVideoSrc,
    composeVideoViewer,
    composedCount,
    configLabel,
    continueGridSplit,
    copyAllCharPortraitPrompts,
    copyNarrationShotPrompt,
    copyNarrationFluxPromptEn,
    copyNarrationShotPromptsBatch,
    translateNarrationShotFluxPrompt,
    translateAllNarrationFluxPrompts,
    translateRemainingNarrationFluxPrompts,
    clearAllNarrationFluxPrompts,
    getNarrationFluxPromptEn,
    needsFluxEnglishTranslate,
    showFluxEnglishPrompt,
    canUseFluxEnglishPrompt,
    fluxEnglishPromptHint,
    fluxPromptTranslating,
    fluxPromptTranslatingShotIds,
    fluxPromptClearing,
    fluxPromptTranslateProgress,
    fluxPromptTranslateProgressPercent,
    narrationFluxTranslatePendingCount,
    narrationFluxTranslateDoneCount,
    narrationFluxEnglishCount,
    showFluxTranslateRemaining,
    copyTextToClipboard,
    createGridAssignments,
    cropNarrationImageWatermarks,
    currentMainStageLabel,
    currentStageLabel,
    currentSubStageLabel,
    customTtsAudioUrl,
    customTtsDownloadName,
    customTtsDownloadSrc,
    customTtsGenerating,
    customTtsPreviewBump,
    customTtsPreviewSrc,
    customTtsText,
    customTtsUsesLocal,
    customTtsVoiceId,
    deleteShot,
    deleteShotVideo,
    doBreakdown,
    doCompose,
    doExtract,
    doExtractNarrationCharacters,
    assignLocalCharacterVoices,
    formatLocalVoiceLabel,
    doGridSplit,
    doMerge,
    doNarrationBreakdown,
    doNarrationImageAudit,
    doNarrationImageBreakdown,
    doNarrationImageDetect,
    doNarrationImageOptimize,
    doNarrationImageOptimizeAll,
    doNarrationImageOptimizeOne,
    doNarrationImagePrompts,
    doNarrationImagePromptsTest,
    doNarrationImageRestore,
    doNarrationImageRestoreAll,
    doNarrationImageRestoreOne,
    doRetryMissingNarrationImagePrompts,
    doRewrite,
    doScriptChatStripEmphasis,
    doTestMerge,
    doVoice,
    drama,
    dramaId,
    dubbingListPage,
    dubbingPageCount,
    dubbingPageItems,
    dubbingUnitViews,
    edgeVoiceProfiles,
    edgeVoiceSelectOptions,
    endBatch,
    ensureNarratorCharacter,
    epId,
    episode,
    episodeDataLoading,
    episodeImageModel,
    episodeNumber,
    episodeTextModel,
    episodeTextModelSupportsThinking,
    headerTextModelOptions,
    headerImageModelOptions,
    headerVideoModelOptions,
    audioConfigSelectOptions,
    studioHeaderModelHint,
    onLocalModelBarVideoChange,
    onEpisodeVideoConfigChange,
    onEpisodeAudioConfigChange,
    episodeTextThinking,
    estimateNarrationDurationLocal,
    evaluateComposePollDone,
    extractRunning,
    expandedSrtIndex,
    exportBgmApplying,
    exportBgmMusicId,
    exportBgmOptions,
    exportBgmPreviewUrl,
    exportBgmVolume,
    exportMixBgm,
    exportOpeningPickedImages,
    exportTab,
    exportWatermarkAnimated,
    exportWatermarkText,
    extractNarrationSentence,
    getNarrationShotDisplayText,
    extractScriptFromChat,
    failedComposeMessages,
    failedVideoMessages,
    fallbackVoiceProfiles,
    findNarratorChar,
    findNextNarrationShotWithImage,
    findPrevNarrationShotWithImage,
    fixDuplicateStoryboardNumbers,
    focusGridCell,
    formatBgmModelLabel,
    formatBreakdownTime,
    formatCharacterDisplayName,
    formatCharacterRoleSubtitle,
    formatComposeTimecode,
    formatComposeUnitDuration,
    formatSrtRaw,
    formatUploadFailures,
    frameMode,
    frameModeOptions,
    framePendingKey,
    genCharImg,
    genDialogueExpressions,
    getDialoguePortraitExpressions,
    dialoguePortraitExpressionSrc,
    dialoguePortraitExpressionsReady,
    DIALOGUE_PORTRAIT_EXPRESSIONS,
    DIALOGUE_PORTRAIT_EXPRESSION_LABELS,
    DIALOGUE_PORTRAIT_MAX_CHARS,
    dialoguePortraitCharOverLimit,
    dialoguePortraitExpressionReadyCount,
    isPendingDialogueExpression,
    genNarrationShotImage,
    getNarrationShotImageJob,
    genSample,
    genSceneImg,
    genShotFrame,
    genShotTTS,
    genVid,
    generateBgmDescription,
    generateCharAppearance,
    generateCustomTts,
    generateEpisodeBgm,
    generateGridPrompt,
    generateOpeningAudio,
    generateOpeningVideo,
    generateTitleVideo,
    getComposeUnitShotRangeLabel,
    getComposeUnitSubtitleLines,
    getComposedVideoUrl,
    getDialogueSpeaker,
    getDialogueSpeakerRaw,
    getDialogueText,
    getVideoUnitMergedText,
    getEffectiveTTSUrl,
    getFirstFrame,
    getGridPromptShotIds,
    getLastFrame,
    getNarrationDisplayImage,
    getNarrationEditContext,
    getNarrationImagePromptForCopy,
    getNarrationImagePromptText,
    getNarrationImageStyle,
    getNarrationShotDisplayNo,
    getNarrationShotImage,
    getRefs,
    getSceneName,
    getShotReferenceImages,
    getSrtAudioName,
    getSrtDownloadUrl,
    getStoryboardCharacterIds,
    getStoryboardCharacterNames,
    getStoryboardCover,
    getTTSUrl,
    getTestMergeTargets,
    getTtsBatchTargets,
    getUploadedAudioUrl,
    getVideoUrl,
    getCharacterGenderLabel: inferCharacterGenderLabel,
    getLocalVoiceProfile,
    getVoiceProfile,
    goMainStage,
    goNextProd,
    goNextStep,
    goPrevStep,
    goSubStep,
    gridActiveShotIds,
    gridActualLayout,
    gridAssignableShotIds,
    gridAssignedCount,
    gridAssignmentPage,
    gridAssignmentPageEnd,
    gridAssignmentPageSize,
    gridAssignmentPageStart,
    gridAssignmentShotOptions,
    gridAssignmentTotalPages,
    gridAssignments,
    gridAssignmentsState,
    gridAutoLayout,
    gridBlankStyle,
    gridCanStart,
    gridCellLabel,
    gridCellPrompts,
    gridCellTitle,
    gridDialog,
    gridFrameTypeOptions,
    gridGenId,
    gridHistory,
    gridImagePath,
    gridLayout,
    gridLayoutOptions,
    gridLayoutShape,
    gridMode,
    gridModes,
    gridOverlayStyle,
    gridPromptLoading,
    gridPromptSource,
    gridPromptStatus,
    gridPromptText,
    gridRecoveredAt,
    gridRecoveredMode,
    gridSelectAll,
    gridSelected,
    gridSingleTarget,
    gridStatusText,
    gridStep,
    gridStorageKey,
    gridSummary,
    gridTotalCells,
    handleImageViewerKeydown,
    hasComposeTts,
    hasComposed,
    hasDialogue,
    hasDialogueForCompose,
    hasEffectiveTTS,
    hasImg,
    hasNarrationImageBreakdown,
    hasNarrationShotImage,
    hasNarrationShotOwnTts,
    hasSrtScriptColumn,
    hasTTS,
    hasVid,
    illustrationImageCount,
    imageConfigs,
    imageDetectBatchSize,
    imageDetectBatchThreshold,
    imageDetectChatGenerating,
    imageDetectChatInput,
    imageDetectChatMessages,
    imageDetectChatQuickHints,
    imageDetectChatScrollRef,
    imageDetectMode,
    imagePromptChatGenerating,
    imagePromptChatInput,
    imagePromptChatMessages,
    imagePromptChatQuickHints,
    imagePromptChatScrollRef,
    imageWorkflowChatTab,
    imageModelOptions,
    imageModelSupportsReferenceImages,
    imagePromptBatchSize,
    imageUploadInputRef,
    imageUploadTarget,
    imageViewer,
    inferVoiceGender,
    insertShotAfter,
    isBatchRunning,
    isCharPortraitUseReference,
    isComicCharPortraitMode,
    isComicStoryboardMode,
    isNarrationMode,
    isMotionComicMode,
    isNovelComicMode,
    isLocalComicMode,
    isDialoguePortraitMode,
    usesDialogueSpeakers,
    usesLocalModelPipeline,
    isDramaLikeMode,
    usesComicStoryboardRules,
    usesComicVisuals,
    localModelOnline,
    localModelStage,
    localModelStageText,
    localModelStatus,
    localModelStatusHint,
    localModelSwitching,
    localModelPrepareHint,
    localModelBarStage,
    localModelBarStageOptions: LOCAL_MODEL_BAR_STAGE_OPTIONS,
    localModelBarVideoModel,
    localModelBarModelOptions,
    localModelBarModelValue,
    localModelBarModelDisabled,
    localModelBarStageBadge,
    localModelBarStatusText,
    localModelBarHint,
    localModelBarNeedsHardware,
    onLocalModelBarStageChange,
    onLocalModelBarModelChange,
    onLocalModelBarLoad,
    currentLocalModelStage,
    showCharsDualLocalModelControls,
    runLocalModelStage,
    unloadLocalModels,
    isNarrationTitleShot,
    isNarratorCharacter,
    isPendingCharAppearance,
    isPendingCharImage,
    isPendingCharRecognize,
    isPendingCharStyleValidate,
    isPendingCompose,
    isPendingNarrationShot,
    isPendingTtsShot,
    isPendingSceneImage,
    isPendingShotFrame,
    isPendingVideo,
    isStoryboardCharacterSelected,
    isTTSIgnorable,
    isTestComposeUnitReady,
    lastScriptChatDraft,
    lastScriptChatDraftCharCount,
    loadBgmLibrary,
    loadConfigs,
    loadEdgeVoices,
    loadLatestGridImage,
    loadNarrationSrtFiles,
    loadUploadedEpisodeAudio,
    loadLocalCastVoices,
    loadGptSovitsVoices,
    loadVoiceboxVoices,
    loadVoices,
    localEdgeVoiceId,
    localRaw,
    localScript,
    localTtsEnabled,
    localTtsEngine,
    onLocalTtsEngineChange,
    localTtsEngineLabel,
    localTtsEngineOptions,
    localTtsPreviewBump,
    localTtsPreviewSrc,
    localTtsPreviewUrl,
    localTtsPreviewing,
    localTtsSpeed,
    localTtsSpeedLabel,
    localTtsSpeedOptions,
    localVoiceboxInstructCustom,
    localVoiceboxInstructLabel,
    localVoiceboxInstructPreset,
    localVoiceboxModelSize,
    localCastVoiceProfiles,
    localCastVoiceSelectOptions,
    localVoiceAssigning,
    lockedAudioConfigId,
    lockedAudioConfigLabel,
    lockedAudioProvider,
    lockedImageConfigId,
    lockedImageConfigLabel,
    lockedVideoConfigId,
    lockedVideoConfigLabel,
    mainStageDefs,
    mainStageDone,
    mapVoiceProfile,
    mapWithConcurrency,
    markNarrationShotNeedImage,
    mergeBgmLibraryRows,
    mergeData,
    mergeFailed,
    mergeFailedMessage,
    mergeHasOpening,
    mergeHasTitle,
    mergeOpeningIntoMain,
    mergeProcessing,
    mergeProgressMessage,
    mergeProgressPercent,
    mergeTestClipLimit,
    mergeTitleIntoMain,
    mergeUrl,
    mergeVideoSrc,
    mergeWeakPunctParts,
    motionComicVoiceChars,
    motionComicCharsVoiced,
    musicConfigs,
    narrationAssetClearing,
    storyboardClearing,
    narrationAudioSplitting,
    narrationAudioUploading,
    narrationBreakdownSummary,
    narrationBreaking,
    storyboardBreaking,
    narrationCharCount,
    narrationCopyBatchIndex,
    narrationCopyBatchOptions,
    narrationCropImageCount,
    narrationCropWatermarkProcessing,
    canClearNarrationImageDetect,
    narrationDetectClearCount,
    narrationDetectDisplayCount,
    narrationEditAsTitle,
    narrationEditBusy,
    narrationEditDialogue,
    narrationEditDuration,
    narrationExtracting,
    narrationExtractGeneratedAt,
    narrationExtractFailedAt,
    narrationExtractError,
    charAppearanceGeneratedAt,
    charAppearanceFailedAt,
    charAppearanceError,
    charImageGeneratedAt,
    charImageFailedAt,
    charImageError,
    resolveCharImageDisplayTime,
    charPortraitImageSrc,
    charRecognizeGeneratedAt,
    charRecognizeFailedAt,
    charRecognizeError,
    charStyleValidateResult,
    shotScanGeneratedAt,
    shotScanFailedAt,
    shotScanError,
    shotScanResult,
    shotImageValidatePanel,
    bgmDescGeneratedAt,
    bgmDescFailedAt,
    bgmDescError,
    narrationIconMap,
    narrationImageAuditPanel,
    narrationImageAuditRestorableCount,
    narrationImageAuditing,
    narrationImageBreakdownPanel,
    narrationImageBreakdownProgress,
    narrationImageBreakdownProgressMessage,
    narrationImageBreakdownProgressPercent,
    narrationImageBreakdownModalOpen,
    narrationImageBreakdownModalTitle,
    narrationImageBreakdownModalProcessing,
    narrationImageBreakdownModalDone,
    narrationImageBreakdownModalFailed,
    narrationImageBreakdownModalBatchLabel,
    narrationImageBreakdownModalSummary,
    closeNarrationImageBreakdownModal,
    cancelNarrationImageBreakdown,
    narrationShotImageModalOpen,
    narrationShotImageModalTitle,
    narrationShotImageModalProcessing,
    narrationShotImageModalDone,
    narrationShotImageModalFailed,
    narrationShotImageModalPercent,
    narrationShotImageModalSummary,
    closeNarrationShotImageProgressModal,
    narrationImageBreaking,
    narrationImageDescUploading,
    narrationImageMetaJson,
    narrationImageOptimizing,
    narrationImagePromptTestActive,
    narrationImageReady,
    narrationImageRestoring,
    narrationImageStep,
    narrationImageStyle,
    narrationImageStyleOptions,
    narrationImagesPendingCount,
    narrationImagesPendingHint,
    narrationImagesPendingLabel,
    narrationImagesPendingShots,
    narrationImagesPendingTitle,
    narrationMissingPromptCount,
    narrationNeedImageCount,
    narrationOwnImageCount,
    narrationPromptDisplayCount,
    narrationPromptLiveCount,
    narrationPromptTestBatchAnchorCount,
    narrationPromptTestBatchAnchors,
    narrationPromptTestBatchDetails,
    narrationPromptTestBatchIndex,
    narrationPromptTestBatchOptions,
    narrationPromptTestCanRun,
    narrationPromptTestPendingCount,
    narrationPromptTestPendingLabel,
    narrationPromptTestPendingShots,
    narrationPromptTestPendingTitle,
    narrationRestoreWatermarkProcessing,
    narrationShotExplicitCopy,
    narrationShotImageLabel,
    narrationShotImageSrc,
    narrationShotInherited,
    narrationShotNeedsOwnImage,
    narrationSrtCueCount,
    narrationSrtFiles,
    narrationSrtPanelOpen,
    narrationSrtPreviewing,
    narrationSrtStorageKey,
    narrationStoryboardBreakdownPanel,
    narrationStoryboardDescUploading,
    narrationTextModelParams,
    narrationTtsReady,
    narrationTtsStatusLabel,
    narrationTtsUnitList,
    narrationTtsUnitStatusLabel,
    narrationWmCroppedImageCount,
    narratorChar,
    narratorReady,
    narratorVoiceDirty,
    narratorVoiceId,
    navigateTo,
    nextPendingNarrationShot,
    nextStepLabel,
    normalizeBgmLibraryRows,
    normalizeNarrationDialogue,
    normalizedImagePromptBatchSize,
    normalizedMergeTestClipLimit,
    onAudioUploadSelected,
    onBgmFileSelected,
    onEpisodeImageModelChange,
    onEpisodeTextModelChange,
    onImageUploadSelected,
    onNarrationImageStyleChange,
    onNarratorVoiceChange,
    onShotFolderUploadSelected,
    onStoryboardDescUploadSelected,
    openComposeVideoPreview,
    openGridTool,
    openImageViewer,
    openShotEditor,
    openingAudioGenerating,
    openingAudioSrc,
    openingAudioUploading,
    openingAudioUrl,
    openingPickCount,
    openingPickCountOptions,
    openingPickedImages,
    openingPickedImagesExporting,
    openingPickedImagesZipSrc,
    openingSubtitleText,
    openingVideoError,
    openingVideoProcessing,
    openingVideoSrc,
    openingVideoUrl,
    pagedGridAssignments,
    panel,
    parseGridLayoutFromFrameType,
    parseNarrationImageMeta,
    pendingAudioStorageKey,
    pendingCharAppearanceIds,
    pendingCharImageIds,
    pendingCharRecognizeIds,
    pendingCharStyleValidateIds,
    pendingComposeIds,
    pendingMergeKind,
    pendingNarrationShotIds,
    pendingTtsShotIds,
    pendingSceneImageIds,
    pendingShotFrameKeys,
    pendingShotScanIds,
    pendingVideoIds,
    persistExportBgmPrefs,
    persistGridImagePath,
    persistImageDetectBatchPrefs,
    persistLocalTtsPrefs,
    persistNarrationBreakdownSummary,
    persistNarrationImageStylePref,
    persistOpeningPickPrefs,
    pipelineProgress,
    pipelineStepTotal,
    pollComposeStatus,
    pollGridStatus,
    pollNarrationImageBreakdownProgress,
    pollVideoGeneration,
    prevStepLabel,
    previewCharacterLocalVoice,
    previewLocalTtsVoice,
    previewNarrationSrt,
    previousMergeUrl,
    processImageUploadPairs,
    prodStepDone,
    prodTab,
    prodTabDefs,
    prodTabIdx,
    productionMode,
    rawContent,
    rawHasEmphasis,
    rawLen,
    readTextFile,
    recognizeCharPortrait,
    validateCharPortraitStyle,
    batchValidateCharPortraitStyles,
    referPreviousEpisode,
    refresh,
    refreshBgmLibrary,
    refreshLocalVoices,
    refreshStoryboardsOnly,
    regenerateAllComposeAndMerge,
    regenerateMerge,
    removeUploadedEpisodeAudio,
    renumberStoryboards,
    reopenGridPreview,
    replaceLastScriptChatDraft,
    resetGridAssignments,
    resolveImageUploadPairs,
    resolveNarrationParagraphLayout,
    resolveOpeningSubtitleText,
    resolveShotCharacterIds,
    resolveTtsBatchConcurrency,
    resolveVoiceboxInstructText,
    restoreExportBgmPrefs,
    restoreGridState,
    restoreImageDetectBatchPrefs,
    restoreImageDetectModePrefs,
    restoreLocalTtsPrefs,
    restoreNarrationBreakdownSummary,
    restoreNarrationImageStylePref,
    restoreNarrationImageWatermarks,
    restoreOpeningPickPrefs,
    resumeComposePollIfNeeded,
    resumeNarrationImageBreakdownPollIfNeeded,
    resumeNarrationShotImagePollIfNeeded,
    reuseNarrationShotImage,
    reuseNextNarrationShotImage,
    rn,
    rt,
    runAgent,
    runBatchShotTTS,
    runNarrationImageBreakdown,
    runNarrationImageStep,
    saveNarrationScript,
    saveNarrationShotDetail,
    saveNarrationSrtFiles,
    saveNarratorVoice,
    saveOpeningSubtitle,
    saveRaw,
    saveScr,
    saveShotEditor,
    saveUploadedEpisodeAudio,
    saveWatermarkText,
    sbs,
    scanNarrationShotImage,
    batchScanNarrationShotImages,
    clearShotImageValidatePanel,
    jumpToShotFromValidate,
    rebuildShotImageValidatePanel,
    hydrateShotImageValidateFromStoryboards,
    sceneImagesPendingCount,
    sceneImgCount,
    scenes,
    scheduleWatermarkSave,
    scriptChatAbortController,
    scriptChatDraftHasEmphasis,
    scriptChatGenerating,
    scriptChatInput,
    scriptChatMessages,
    scriptChatModel,
    scriptChatAssistantLabel,
    scriptChatGenModeHint,
    scriptChatInputPlaceholder,
    scriptChatManualHint,
    scriptChatManualPlaceholder,
    scriptChatMinChars,
    scriptChatModelOptionsForPicker,
    scriptChatModelSupportsThinking,
    scriptChatQuickHints,
    scriptChatScrollRef,
    scriptChatStepTitle,
    scriptChatThinking,
    showScriptChatPanel,
    scriptContent,
    scriptGenMode,
    scriptLen,
    hasEpisodeScriptDraft,
    scriptStep,
    scriptSteps,
    scriptStoryboardListNo,
    scriptStoryboardPage,
    scriptStoryboardPageCount,
    scriptStoryboardPageItems,
    scrollImageDetectChatToBottom,
    scrollImagePromptChatToBottom,
    scrollScriptChatToBottom,
    scrollStoryboardChatToBottom,
    selectGridHistory,
    selectedSb,
    selectedVoiceSupportsInstruct,
    selectedVoiceboxVoiceReady,
    sendImageDetectChat,
    sendImagePromptChat,
    sendScriptChat,
    sendStoryboardChat,
    setEpisodeTextThinking,
    setNarrationShotLayout,
    setReferPreviousEpisode,
    shiftStoryboardNumbersFrom,
    shotAngles,
    shotEditor,
    shotFolderUploadInputRef,
    shotImageUploadProcessing,
    shotImageUploadProgress,
    shotImgCount,
    shotMovements,
    shotTypes,
    shotVidCount,
    shotsDoneCount,
    shotsFiltered,
    shotsListFilter,
    shotsListPage,
    shotsListPageSize,
    shotsPageCount,
    shotsPageItems,
    shotsPendingCount,
    showAllGridHistory,
    showBgmModelPicker,
    showBottomBubble,
    showImageModelPicker,
    showImageStylePicker,
    showReferPreviousEpisodeToggle,
    showTextModelPicker,
    sidebarJumpSteps,
    sidebarSections,
    skipRewrite,
    sleep,
    splitByPunctBoundary,
    splitEpisodeNarrationAudio,
    splitNarrationChunkLocal,
    splitNarrationLines,
    splitShotByPunctuation,
    splitShotInheritImage,
    srtViewMode,
    startBgmPoll,
    startGridGen,
    startMergePoll,
    startNarrationImageBreakdownPoll,
    startOpeningPoll,
    startTitlePoll,
    stepLabels,
    stopBgmPoll,
    stopComposePoll,
    stopMergePoll,
    stopNarrationImageBreakdownPoll,
    stopOpeningPoll,
    stopTitlePoll,
    storyboardDescUploadInputRef,
    storyboardDescUploadTarget,
    storyboardDisplayIndex,
    storyboardChatGenerating,
    storyboardChatInput,
    storyboardChatMessages,
    storyboardChatQuickHints,
    storyboardChatScrollRef,
    storyboardStep,
    dramaRawStep,
    dramaRewriteStep,
    dramaExtractStep,
    dramaVoiceStep,
    studioReady,
    stripNarrationDialoguePrefix,
    stripRawEmphasis,
    syncEpisodeImageModel,
    syncEpisodeTextModel,
    syncEpisodeTextThinking,
    syncExportWatermarkFromEpisode,
    syncNarrationBreakdownImageCount,
    syncNarrationEditFromShot,
    syncNarratorVoiceFromChar,
    syncReferPreviousEpisode,
    testExportActive,
    testMergeBlock,
    testMergeClipCount,
    testMergeFailed,
    testMergeFailedMessage,
    testMergeProcessing,
    testMergeProgressMessage,
    testMergeProgressPercent,
    testMergeUrl,
    testMergeVideoSrc,
    textModelOptions,
    localLlmModelOptions,
    textModelSupportsThinking,
    textModelSupportsVision,
    tickBgmPoll,
    tickComposePoll,
    titleShots,
    titleShotsReady,
    titleVideoError,
    titleVideoProcessing,
    titleVideoSrc,
    titleVideoUrl,
    toCamel,
    toast,
    toggleCharPortraitUseReference,
    toggleSrtExpand,
    toggleStoryboardCharacter,
    totalDuration,
    triggerAllCharImageUpload,
    triggerCharImageUpload,
    triggerAllShotImageUpload,
    triggerBgmUpload,
    triggerEpisodeNarrationAudioUpload,
    triggerNarrationImageDescUpload,
    triggerNarrationStoryboardDescUpload,
    triggerNextShotImageUpload,
    triggerOpeningAudioUpload,
    triggerShotFolderUpload,
    triggerShotImageUpload,
    triggerShotTtsUpload,
    trimNarrationPart,
    tryBeginBatch,
    ttsAssignedCount,
    ttsBatchActive,
    ttsBatchConcurrencyLabel,
    ttsEligibleCount,
    ttsGenerateOptions,
    ttsGeneratedCount,
    ttsPendingCount,
    updateCharVoice,
    updateCharacterAppearance,
    updateField,
    updateGridAssignment,
    updateNarrationImagePrompt,
    updateNarrationFluxPromptEn,
    updateNarrationImagePromptById,
    uploadImageFile,
    uploadedEpisodeAudio,
    videoConfigSelectOptions,
    videoConfigs,
    videoFailMessage,
    videoProgressMessage,
    videoGenTargets,
    estimateVideoDurationSec,
    videosPendingCount,
    visibleBgmLibrary,
    visualCharNameCount,
    visualCharTotal,
    visualChars,
    voiceProfiles,
    voiceSampleCount,
    narratorVoiceSelectOptions,
    voiceSelectOptions,
    scriptVoiceSelectOptions,
    scriptVoiceProfiles,
    gptsovitsAvailable,
    indexttsAvailable,
    localTtsVoicePlaceholder,
    localTtsEngineReady,
    localTtsSupportsEmotionInstruct,
    localTtsUsesGsvVoices,
    gsvCatalogVoices,
    gsvLoading,
    gsvSaving,
    gsvUploading,
    gsvPreviewing,
    gsvDeletingId,
    gsvEditingId,
    gsvPreviewUrl,
    gsvPanelOpen,
    gsvFileInputRef,
    gsvForm,
    canSaveGsvVoice,
    gsvVoiceInCatalog,
    stripGsvId,
    resetGsvForm,
    loadGsvVoiceCatalog,
    onGsvFilePick,
    editGsvVoice,
    saveGsvVoice,
    deleteGsvVoice,
    previewGsvVoice,
    voiceboxAvailable,
    voiceboxInstructOptions,
    voiceboxModelLoaded,
    voiceboxModelSizeOptions,
    waitForMergeComplete,
    waitForNarrationImageBreakdownDone,
    watchAsyncResult,
    watchCharImageResult,
    watchNarrationImageBatchResult,
    workflowState,
  }
}

export function useEpisodeStudioInject(): EpisodeStudioContext {
  const ctx = inject(EPISODE_STUDIO_KEY)
  if (!ctx) throw new Error('useEpisodeStudioInject() called without provider')
  return ctx
}
