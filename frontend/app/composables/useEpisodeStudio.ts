import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject, type InjectionKey } from 'vue'
import { toast } from 'vue-sonner'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, Music, FileText, FolderKanban, Clapperboard, Download, Film, Sparkles, Loader2,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, imageAPI, videoAPI, composeAPI, mergeAPI, gridAPI, aiConfigAPI, voicesAPI, musicAPI, uploadAPI } from '~/composables/useApi'
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
  DEFAULT_TEXT_THINKING,
  IMAGE_MODEL_OPTIONS,
  TEXT_MODEL_OPTIONS,
  resolveEpisodeTextModel,
  resolveNarrationEpisodeTextModel,
  resolveEpisodeTextThinking,
  textModelSupportsThinking,
  textModelSupportsVision,
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
  getComposeUnitSubtitleLines,
  listNarrationTtsUnits,
  isNarrationTtsUnitLeader,
  formatComposeTimecode,
  formatComposeUnitDuration,
  getComposeUnitShotRangeLabel,
  getComposedVideoUrl as getStoryboardComposedVideoUrl,
  collectComposeScopeStoryboardIds,
  narrationShotsNeedingImage,
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
  normalizeVariantLabel,
  variantNeedsYouthPortraitReference,
  getVariantAgeGroup,
  findYouthBaseCharacter,
  findPortraitReferenceCharacter,
  findDramaStyleAnchorCharacter,
  sortCharactersForPortraitGeneration,
  dramaStoryboardStep,
  narrationScriptChatStep,
  narrationRawContentStep,
  narrationStoryboardStep,
} from '~/composables/useEpisodeWorkflow'
import { artStyleLabel, NARRATION_MINIMAL_STYLE, MOTION_COMIC_STYLE, MOTION_COMIC_DEFAULT_STYLE, NARRATION_IMAGE_STYLE_OPTIONS, resolveNarrationImageStyle, normalizeArtStyle } from '~/composables/useArtStyles'
import { buildFolderUploadSlots, isImageUploadFile, parseShotImageFilename } from '~/utils/shotImageFilename'
import { hasEmphasisMarkers, stripEmphasisMarkers } from '~/utils/subtitle-emphasis'
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
const isNarrationLikeMode = computed(() => productionMode.value === 'narration' || productionMode.value === 'motion_comic')
const isNarrationMode = isNarrationLikeMode
const storyboardStep = computed(() => isNarrationLikeMode.value ? narrationStoryboardStep() : dramaStoryboardStep())
const narratorChar = computed(() => findNarratorChar(chars.value))
const narratorReady = computed(() => {
  if (isMotionComicMode.value) {
    return localTtsEnabled.value
      ? charsVoiced.value > 0 && charsVoiced.value >= motionComicVoiceChars.value.length
      : charsVoiced.value > 0
  }
  return localTtsEnabled.value || !!(narratorChar.value?.voice_style || narratorChar.value?.voiceStyle)
})
const narratorVoiceId = ref('')
const narratorVoiceDirty = ref(false)
const DEFAULT_LOCAL_EDGE_VOICE = 'zh-CN-YunxiNeural'
const localTtsEnabled = ref(true)
const localTtsEngine = ref('edge')
const localEdgeVoiceId = ref(DEFAULT_LOCAL_EDGE_VOICE)
const edgeVoiceProfiles = ref([])
const voiceboxAvailable = ref(false)
const voiceboxModelLoaded = ref(false)
const localTtsEngineOptions = [
  { label: 'Voicebox（声音克隆）', value: 'voicebox' },
  { label: 'Edge TTS（系统音色）', value: 'edge' },
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
const customTtsUsesLocal = computed(() => isNarrationMode.value && localTtsEnabled.value !== false)
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
  return localTtsEngine.value === 'voicebox' ? '本地 Voicebox' : '本地 Edge TTS'
})
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
  if (localTtsEngine.value !== 'voicebox') return ''
  if (!selectedVoiceSupportsInstruct.value) return ''
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
const narrationBreakdownSummary = ref(null)
const imageDetectMode = ref('paragraph')
const imageDetectBatchThreshold = ref(80)
const imageDetectBatchSize = ref(30)
const narrationImageStyle = ref(NARRATION_MINIMAL_STYLE)
const narrationImageStyleOptions = computed(() => {
  if (isMotionComicMode.value) {
    return [{ value: MOTION_COMIC_STYLE, label: '漫画解说' }]
  }
  return NARRATION_IMAGE_STYLE_OPTIONS.map(item => ({
    value: item.value,
    label: item.label,
  }))
})

function syncNarrationImageStyleFromDrama() {
  if (!drama.value) return
  if (isMotionComicMode.value) {
    narrationImageStyle.value = MOTION_COMIC_STYLE
    return
  }
  const dramaStyle = normalizeArtStyle(drama.value.style)
  if (dramaStyle === NARRATION_MINIMAL_STYLE || dramaStyle === NARRATION_ANIME_STYLE) {
    narrationImageStyle.value = dramaStyle
  }
}

function getNarrationImageStyle() {
  return resolveNarrationImageStyle(narrationImageStyle.value)
}

function onNarrationImageStyleChange(value) {
  narrationImageStyle.value = resolveNarrationImageStyle(value)
  persistNarrationImageStylePref()
}

function restoreNarrationImageStylePref() {
  if (typeof window === 'undefined') return
  if (isMotionComicMode.value) {
    narrationImageStyle.value = MOTION_COMIC_STYLE
    return
  }
  const saved = window.localStorage.getItem('huobao-narration-image-style')
  if (saved) narrationImageStyle.value = resolveNarrationImageStyle(saved)
}

function persistNarrationImageStylePref() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('huobao-narration-image-style', getNarrationImageStyle())
}
const imagePromptBatchSize = ref(6)

const localRaw = ref(''), localScript = ref('')

const SCRIPT_CHAT_WELCOME = computed(() => isMotionComicMode.value
  ? '我是漫画解说编剧。默认写「悬疑快切解说稿」——第三人称叙述、主人公用「我」、一句一行、段间空行换场景；对话嵌入叙述，不用「角色名：台词」。完整稿 3000～8000 字，首行「本期故事：…」。直接说「写完整稿」即可。'
  : '描述你想让观众体验的「一段人生」。默认第二人称「你」、语言亲民真实；完整稿 3000～10000 字。也可切「直接输入」粘贴自备稿。首行以「今天体验的人生剧本是，」开头；** 黄字强调在「旁白分镜」时由 Qwen 自动标注。')
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
const scriptChatThinking = ref(DEFAULT_TEXT_THINKING)
const scriptChatScrollRef = ref(null)
const scriptChatAbortController = ref(null)
const scriptChatQuickHints = computed(() => isMotionComicMode.value
  ? [
    '按悬疑快切模板写完整稿（3000～8000字）：大学生算卦救卤肉店，连环杀人犯破门，九段骨架',
    '按悬疑快切模板写完整稿：都市灵异，主人公第一人称「我」，一句一行，多线交叉',
    '把下面小说长文改写成快切解说稿：拆短句、嵌对话、补九段骨架、段间空行换场景',
    '写完整稿：警局审讯+算命打脸+结尾留钩，片头「本期故事：…」',
  ]
  : [
    '写一篇完整稿（3000～10000 字）：八十年代进城摆夜市摊，从穷到翻身又跌入谷底，写足内心活动',
    '写一篇完整稿（3000～10000 字）：九十年代小镇青年第一次进城打工，犹豫与期待交织',
    '把下面大纲扩成 3000～10000 字完整解说稿：职高辍学→进厂→摆摊→被骗',
    '语气更沉静、更亲民，补内心戏，扩写到 3000 字以上',
  ])

const IMAGE_DETECT_CHAT_WELCOME = computed(() => isMotionComicMode.value
  ? '我是漫画配图换镜检测助手。可讨论哪些镜头需要单独漫画配图（1～3 句一段一图、整段一种运镜）；说「开始检测」或点快捷按钮，我会流式展示检测过程。'
  : '我是配图换镜检测助手。可讨论哪些镜头需要单独配图；说「开始检测」或点下方快捷按钮，我会流式展示检测过程。检测完成后可继续多轮调整策略并重新检测。')
const IMAGE_PROMPT_CHAT_WELCOME = computed(() => isMotionComicMode.value
  ? '我是漫画配图文案助手。须先完成换镜检测；说「开始生成文案」或点快捷按钮，我会流式展示六维漫画 prompt 生成过程。主要配角须写定妆外貌。'
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

const STORYBOARD_CHAT_WELCOME = computed(() => isMotionComicMode.value
  ? '我是旁白分镜助手。整稿按句拆镜、自动标注 ** 强调、片头单独处理；配图 1～3 句一段一图，同图整段一种运镜。说「开始分镜」或点「执行拆镜」，可流式看到拆镜过程。'
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
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const voiceSampleCount = computed(() => chars.value.filter(c => c.voice_sample_url || c.voiceSampleUrl).length)
const composableShots = computed(() => sbs.value.filter(sb => isComposeScopeStoryboard(sb, sbs.value)))
const composeUnitShots = computed(() => getComposeUnitLeaders(sbs.value))
const composableCount = computed(() => composeUnitShots.value.length)
const composedCount = computed(() =>
  composeUnitShots.value.filter(sb => hasComposedStoryboard(sb, sbs.value)).length,
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
  const batch = progress.batch ?? progress.batchCount
  const batchCount = progress.batch_count ?? progress.batchCount
  if (batch && batchCount && (progress.phase === 'prompts' || progress.phase === 'detecting')) {
    return progress.message || (
      progress.phase === 'detecting'
        ? `正在检测换镜（第 ${batch}/${batchCount} 批）…`
        : `正在生成配图文案（第 ${batch}/${batchCount} 批）…`
    )
  }
  return progress.message || '配图分镜进行中…'
})
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
const exportBgmVolume = ref(8)
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
  const kokoro = localCastVoiceProfiles.value.filter(v => v.source === 'kokoro')
  const edge = localCastVoiceProfiles.value.filter(v => v.source === 'edge')
  const mapOption = (v) => ({
    label: `${v.label}${v.source === 'kokoro' ? ' · Kokoro' : ' · Edge'}`,
    value: v.id,
  })
  return [
    ...(kokoro.length ? [{ label: '── Kokoro ──', value: '', disabled: true }] : []),
    ...kokoro.map(mapOption),
    ...(edge.length ? [{ label: '── Edge TTS ──', value: '', disabled: true }] : []),
    ...edge.map(mapOption),
  ]
})
const voiceSelectOptions = computed(() => voiceProfiles.value.map(v => ({ label: `${v.label} · ${v.traits}`, value: v.id })))
const localVoiceAssigning = ref(false)
const edgeVoiceSelectOptions = computed(() => edgeVoiceProfiles.value.map(v => ({ label: v.label, value: v.id })))

function buildLocalTtsPreviewPayload(textOverride) {
  const text = String(textOverride || '').trim() || LOCAL_TTS_PREVIEW_DEFAULT
  const payload = {
    local_tts_engine: localTtsEngine.value === 'voicebox' ? 'voicebox' : 'edge',
    local_voice: localEdgeVoiceId.value,
    tts_speed: localTtsSpeed.value,
    text,
  }
  if (localTtsEngine.value === 'voicebox') {
    const instruct = resolveVoiceboxInstructText()
    if (instruct) payload.voicebox_instruct = instruct
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
    toast.warning(localTtsEngine.value === 'voicebox' ? '请选择 Voicebox 音色' : '请选择本地音色')
    return
  }
  if (localTtsEngine.value === 'voicebox' && !voiceboxAvailable.value) {
    toast.warning('Voicebox 未运行，请先启动 Voicebox')
    return
  }
  if (!selectedVoiceboxVoiceReady()) {
    const row = edgeVoiceProfiles.value.find(p => p.id === localEdgeVoiceId.value)
    toast.warning(row?.modelHint || '该预设音色所需模型尚未下载完成，请先在 Voicebox → Models 中下载，或改用克隆音色「111」')
    return
  }
  try {
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
  if (isNarrationMode.value && localTtsEnabled.value !== false) {
    opts.local_tts = true
    opts.local_tts_engine = localTtsEngine.value === 'voicebox' ? 'voicebox' : 'edge'
    opts.async = false
    if (isMotionComicMode.value) {
      opts.use_speaker_voice = true
    } else if (localEdgeVoiceId.value) {
      opts.local_voice = localEdgeVoiceId.value
    }
    opts.tts_speed = localTtsSpeed.value
    if (localTtsEngine.value === 'voicebox') {
      const instruct = resolveVoiceboxInstructText()
      if (instruct) opts.voicebox_instruct = instruct
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
  if (!isNarrationMode.value || localTtsEnabled.value === false) return
  if (localTtsEngine.value !== 'voicebox') return
  await loadVoiceboxVoices()
  if (voiceboxAvailable.value) return
  localTtsEngine.value = 'edge'
  persistLocalTtsPrefs()
  await refreshLocalVoices()
  toast.warning('Voicebox 未响应，已自动改用 Edge TTS 继续生成（按角色性别匹配音色）')
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
  if (engine === 'edge' || engine === 'voicebox') localTtsEngine.value = engine
  const voice = window.localStorage.getItem(`episode-${epId.value}-local-voice`)
  if (voice) localEdgeVoiceId.value = voice
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
  if (vol) exportBgmVolume.value = Number(vol) || 8
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
const pendingCharAppearanceIds = ref([])
const pendingSceneImageIds = ref([])
const pendingShotFrameKeys = ref([])
const pendingNarrationShotIds = ref([])
const pendingTtsShotIds = ref([])
const ttsBatchActive = ref(false)
const pendingShotScanIds = ref([])
const pendingVideoIds = ref([])
const pendingComposeIds = ref([])
const PROD_SHOT_PAGE_SIZE = 24
const NARRATION_SHOT_PAGE_SIZE = 6
const SCRIPT_STORYBOARD_PAGE_SIZE = 24
const COMPOSE_LIST_PAGE_SIZE = 8
const DUBBING_LIST_PAGE_SIZE = 6
const composeListPage = ref(1)
const composeListFilter = ref('all')
const dubbingListPage = ref(1)
const shotsListPage = ref(1)
const shotsListFilter = ref('all')
const scriptStoryboardPage = ref(1)
const composeVideoViewer = ref({ open: false, src: '', title: '' })
const batchRunning = ref(new Set())
const failedVideoMessages = ref({})
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

function isPendingCompose(id) {
  if (pendingComposeIds.value.includes(id)) return true
  const sb = sbs.value.find(item => item.id === id)
  return sb?.status === 'compose_processing'
}

function composeFailMessage(id) {
  return failedComposeMessages.value[id] || ''
}

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

const motionComicVoiceChars = computed(() => {
  if (!isMotionComicMode.value) return []
  return [...chars.value].sort((a, b) => {
    const pa = isNarratorCharacter(a) ? 0 : 1
    const pb = isNarratorCharacter(b) ? 0 : 1
    if (pa !== pb) return pa - pb
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  })
})

function formatLocalVoiceLabel(char) {
  const voiceId = char?.voice_style || char?.voiceStyle
  if (!voiceId) return '未分配'
  const found = localCastVoiceProfiles.value.find(v => v.id === voiceId)
    || voiceProfiles.value.find(v => v.id === voiceId)
  if (found) return found.label
  if (/^preset:kokoro:/.test(voiceId)) return `Kokoro · ${voiceId.split(':').pop()}`
  if (/^(zh|en|ja|ko)-/i.test(voiceId)) return `Edge · ${voiceId}`
  return voiceId
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
const imageModelOptions = computed(() => IMAGE_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })))
const textModelOptions = computed(() => TEXT_MODEL_OPTIONS.map(item => ({ label: item.label, value: item.value })))
const episodeTextModelSupportsThinking = computed(() => textModelSupportsThinking(episodeTextModel.value))
const showReferPreviousEpisodeToggle = computed(() => episodeNumber.value > 1 && showTextModelPicker.value)
const showImageModelPicker = computed(() => ['chars', 'scenes', 'shots'].includes(prodTab.value))
const showTextModelPicker = computed(() => ['chars', 'shots'].includes(prodTab.value))
const showBgmModelPicker = computed(() => prodTab.value === 'bgm')

function syncEpisodeImageModel(ep) {
  episodeImageModel.value = resolveEpisodeImageModel(ep)
}

function syncEpisodeTextModel(ep) {
  episodeTextModel.value = isNarrationMode.value
    ? resolveNarrationEpisodeTextModel(ep)
    : resolveEpisodeTextModel(ep)
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
    toast.success('配图模型已保存')
  } catch (e) {
    syncEpisodeImageModel(episode.value)
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
  if (isMotionComicMode.value) return ['剧本生成', '文案输入', '旁白分镜']
  if (isNarrationLikeMode.value) return ['剧本生成', '文案输入', '旁白分镜']
  return ['原始内容', 'AI 改写', '提取', '音色', '分镜']
})
const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels.value[scriptStep.value - 1] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === storyboardStep.value) return '进入制作'
  return stepLabels.value[scriptStep.value + 1] || ''
})
const canGoNext = computed(() => {
  if (isNarrationMode.value && scriptStep.value === narrationScriptChatStep()) {
    return !!localRaw.value.trim() || !!lastScriptChatDraft.value || scriptGenMode.value === 'chat'
  }
  if (isNarrationMode.value && scriptStep.value === narrationRawContentStep()) return !!localRaw.value.trim()
  if (isNarrationMode.value && scriptStep.value === narrationStoryboardStep()) return sbs.value.length > 0
  if (scriptStep.value === 0) return !!localRaw.value.trim()
  if (scriptStep.value === 1) return !!localScript.value.trim() || !!scriptContent.value
  if (scriptStep.value === 2) return chars.value.length > 0
  if (scriptStep.value === 3) return charsVoiced.value > 0
  if (scriptStep.value === storyboardStep.value) return sbs.value.length > 0
  return false
})
function goPrevStep() { if (scriptStep.value > 0) scriptStep.value-- }
function goNextStep() {
  if (isNarrationMode.value && scriptStep.value === narrationScriptChatStep() && localRaw.value.trim()) {
    saveRaw()
    localScript.value = localRaw.value
    saveScr()
  }
  if (isNarrationMode.value && scriptStep.value === narrationRawContentStep() && localRaw.value.trim()) {
    saveRaw()
    localScript.value = localRaw.value
    saveScr()
  }
  if (!isNarrationMode.value && scriptStep.value === 0 && localRaw.value.trim()) {
    saveRaw()
  }
  if (!isNarrationMode.value && scriptStep.value === 1 && localScript.value.trim()) { saveScr() }
  if (scriptStep.value === storyboardStep.value) {
    panel.value = 'production'
    prodTab.value = isNarrationMode.value
      ? (visualCharTotal.value && charImgCount.value < visualCharTotal.value ? 'chars' : 'voice')
      : 'chars'
    return
  }
  if (canGoNext.value) scriptStep.value++
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
    const res = await gridAPI.generate({
      storyboard_ids: ids,
      drama_id: dramaId,
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
const ttsEligibleCount = computed(() =>
  isNarrationMode.value ? listNarrationTtsUnits(sbs.value).length : sbs.value.filter(s => hasDialogue(s)).length,
)
const narrationTtsUnitList = computed(() =>
  isNarrationMode.value ? listNarrationTtsUnits(sbs.value) : sbs.value.filter(s => hasDialogue(s)),
)
const dubbingUnitViews = computed(() => {
  if (isNarrationMode.value) {
    return listNarrationTtsUnits(sbs.value).map(sb => ({
      sb,
      subtitleLines: [],
      shotRangeLabel: `#${getNarrationShotDisplayNo(sb)}`,
      durationLabel: formatComposeUnitDuration(sb, sbs.value),
      mergedText: getDialogueText(sb) || '',
      speakerLabel: getDialogueSpeaker(sb),
      voiceHint: resolveShotVoiceHint(sb),
      ready: hasNarrationShotOwnTts(sb),
      statusLabel: hasNarrationShotOwnTts(sb) ? '已生成' : '待生成',
      lineCount: 1,
    }))
  }
  return narrationTtsUnitList.value.map(sb => ({
    sb,
    subtitleLines: [],
    shotRangeLabel: `#${sb.storyboard_number || sb.storyboardNumber || sb.id}`,
    durationLabel: formatComposeUnitDuration(sb, sbs.value),
    mergedText: getDialogueText(sb) || '',
    speakerLabel: getDialogueSpeaker(sb),
    voiceHint: resolveShotVoiceHint(sb),
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
const narrationPromptLiveCount = computed(() =>
  sbs.value.filter(sb =>
    narrationShotNeedsOwnImage(sb) && String(sb?.image_prompt || sb?.imagePrompt || '').trim(),
  ).length,
)
const narrationDetectDisplayCount = computed(() => {
  const live = narrationNeedImageCount.value
  const s = narrationBreakdownSummary.value
  const cached = s?.paragraph_count ?? s?.paragraphCount ?? s?.image_needed_count ?? s?.imageNeededCount
  const hasDetect = !!(s?.image_detect_at ?? s?.imageDetectAt)
  if (live > 0) return live
  if (hasDetect && cached != null) return cached
  return 0
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
  narrationShotsPendingImage(sbs.value).length,
)
const nextPendingNarrationShot = computed(() => narrationShotsPendingImage(sbs.value)[0] || null)
const narrationOwnImageCount = computed(() => {
  const paths = new Set()
  for (const sb of sbs.value) {
    const p = getNarrationShotOwnImage(sb)
    if (p) paths.add(p)
  }
  return paths.size
})
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
const narrationImagesPendingShots = computed(() => narrationShotsPendingImage(sbs.value))
const narrationImagesPendingLabel = computed(() => formatNarrationShotDisplayList(narrationImagesPendingShots.value))
const narrationImagesPendingHint = computed(() => formatNarrationPendingImageHint(sbs.value))
const narrationImagesPendingTitle = computed(() => {
  if (!narrationImagesPendingCount.value) return ''
  return `生成剩余 ${narrationImagesPendingShots.value.length} 张：${narrationImagesPendingLabel.value}`
})
const composePendingCount = computed(() =>
  composeUnitShots.value.filter(sb => !hasComposedStoryboard(sb, sbs.value)).length,
)
const composeProcessingCount = computed(() =>
  composableShots.value.filter(sb => sb.status === 'compose_processing' || isPendingCompose(sb.id)).length,
)
const composeFilteredShots = computed(() => {
  const list = composeUnitShots.value
  if (composeListFilter.value === 'pending') {
    return list.filter(sb => !hasComposedStoryboard(sb, sbs.value))
  }
  if (composeListFilter.value === 'processing') {
    return list.filter(sb => sb.status === 'compose_processing' || isPendingCompose(sb.id))
  }
  if (composeListFilter.value === 'failed') {
    return list.filter(sb => !!composeFailMessage(sb.id))
  }
  if (composeListFilter.value === 'done') {
    return list.filter(sb => hasComposedStoryboard(sb, sbs.value))
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
const sceneImagesPendingCount = computed(() =>
  scenes.value.filter(s => !(s.image_url || s.imageUrl)).length,
)
const videosPendingCount = computed(() => sbs.value.filter(s => !hasVid(s)).length)

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
  updateField(sb, 'image_prompt', trimmed)
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
  const s = narrationBreakdownSummary.value
  if (narrationDetectDisplayCount.value > 0) return true
  if (narrationPromptDisplayCount.value > 0) return true
  if (!s) return false
  if (s.image_breakdown_at ?? s.imageBreakdownAt) return true
  if (s.image_detect_at ?? s.imageDetectAt) return true
  if (s.image_prompt_at ?? s.imagePromptAt) return true
  const detectSource = s.image_detect_source ?? s.imageDetectSource
  const paragraphCount = s.paragraph_count ?? s.paragraphCount
  const promptsGenerated = s.prompts_generated ?? s.promptsGenerated
  return !!(detectSource || paragraphCount != null || promptsGenerated != null)
})

const narrationStoryboardBreakdownPanel = computed(() => {
  if (!isNarrationMode.value || !sbs.value.length) return null
  const s = narrationBreakdownSummary.value
  const liveCount = sbs.value.length
  const liveTitleCount = sbs.value.filter(sb => isNarrationTitleShot(sb)).length
  const liveBodyCount = liveCount - liveTitleCount
  const count = liveCount > 0 ? liveCount : (s?.count ?? 0)
  const sentenceCount = liveBodyCount > 0 ? liveBodyCount : (s?.sentence_count ?? s?.sentenceCount ?? 0)
  const titleCount = liveTitleCount > 0 ? liveTitleCount : (s?.title_count ?? s?.titleCount ?? 0)
  const titleImageCount = s?.title_image_count ?? s?.titleImageCount ?? (titleCount ? 1 : 0)
  const titleHook = s?.title_hook ?? s?.titleHook ?? null
  const totalDur = s?.total_duration ?? s?.totalDuration ?? totalDuration.value
  const generatedAt = s?.storyboard_breakdown_at ?? s?.storyboardBreakdownAt ?? s?.generated_at ?? s?.generatedAt ?? null
  return {
    count,
    sentenceCount,
    titleCount,
    titleImageCount,
    titleHook,
    totalDur,
    generatedAt,
  }
})

const narrationImageBreakdownPanel = computed(() => {
  if (!isNarrationMode.value || !sbs.value.length || !hasNarrationImageBreakdown.value) return null
  const s = narrationBreakdownSummary.value
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
    promptAt: s?.image_prompt_at ?? s?.imagePromptAt ?? null,
  }
})

function syncNarrationBreakdownImageCount() {
  if (!epId.value || !isNarrationMode.value || !narrationBreakdownSummary.value || !sbs.value.length) return
  const liveDetect = narrationNeedImageCount.value
  const livePrompts = narrationPromptLiveCount.value
  const prev = narrationBreakdownSummary.value
  const cachedDetect = prev.image_needed_count ?? prev.imageNeededCount ?? prev.paragraph_count ?? prev.paragraphCount ?? 0
  const cachedPrompts = prev.prompts_generated ?? prev.promptsGenerated ?? 0
  if (liveDetect === cachedDetect && livePrompts === cachedPrompts) return
  persistNarrationBreakdownSummary({
    ...prev,
    image_needed_count: liveDetect || cachedDetect,
    paragraph_count: liveDetect || prev.paragraph_count || prev.paragraphCount || 0,
    prompts_generated: livePrompts || cachedPrompts,
  })
}

function persistNarrationBreakdownSummary(res) {
  if (!epId.value) return
  const prev = narrationBreakdownSummary.value || {}
  const liveImageNeeded = sbs.value.length ? narrationNeedImageCount.value : null
  const storyboardAt = res?.storyboard_breakdown_at ?? res?.storyboardBreakdownAt ?? res?.generatedAt ?? prev.storyboard_breakdown_at ?? prev.storyboardBreakdownAt ?? prev.generated_at ?? prev.generatedAt ?? null
  const imageAt = res?.image_breakdown_at ?? res?.imageBreakdownAt ?? prev.image_breakdown_at ?? prev.imageBreakdownAt ?? null
  const storyboardReset = !!(res?.storyboard_breakdown_at ?? res?.storyboardBreakdownAt)
  const liveTitleCount = sbs.value.filter(sb => isNarrationTitleShot(sb)).length
  const liveBodyCount = Math.max(0, sbs.value.length - liveTitleCount)
  const payload = {
    ...prev,
    count: sbs.value.length > 0 ? sbs.value.length : (res?.count ?? prev.count ?? 0),
    sentence_count: storyboardReset
      ? (liveBodyCount > 0 ? liveBodyCount : (res?.sentence_count ?? res?.sentenceCount ?? 0))
      : (liveBodyCount > 0 ? liveBodyCount : (res?.sentence_count ?? res?.sentenceCount ?? prev.sentence_count ?? prev.sentenceCount ?? 0)),
    title_count: storyboardReset
      ? (liveTitleCount > 0 ? liveTitleCount : (res?.title_count ?? res?.titleCount ?? 0))
      : (liveTitleCount > 0 ? liveTitleCount : (res?.title_count ?? res?.titleCount ?? prev.title_count ?? prev.titleCount ?? 0)),
    title_image_count: res?.title_image_count ?? res?.titleImageCount ?? prev.title_image_count ?? prev.titleImageCount ?? 0,
    title_hook: res?.title_hook ?? res?.titleHook ?? prev.title_hook ?? prev.titleHook ?? null,
    image_needed_count: storyboardReset ? 0 : (liveImageNeeded ?? res?.image_needed_count ?? res?.imageNeededCount ?? prev.image_needed_count ?? prev.imageNeededCount ?? 0),
    paragraph_count: storyboardReset ? 0 : (res?.paragraph_count ?? res?.paragraphCount ?? prev.paragraph_count ?? prev.paragraphCount ?? 0),
    prompts_generated: storyboardReset ? null : (res?.prompts_generated ?? res?.promptsGenerated ?? prev.prompts_generated ?? prev.promptsGenerated ?? null),
    diptych_count: storyboardReset ? 0 : (res?.diptych_count ?? res?.diptychCount ?? prev.diptych_count ?? prev.diptychCount ?? 0),
    image_detect_source: storyboardReset ? null : (res?.image_detect_source ?? res?.imageDetectSource ?? prev.image_detect_source ?? prev.imageDetectSource ?? null),
    image_prompt_source: storyboardReset ? null : (res?.image_prompt_source ?? res?.imagePromptSource ?? prev.image_prompt_source ?? prev.imagePromptSource ?? null),
    image_detect_mode: res?.image_detect_mode ?? res?.imageDetectMode ?? prev.image_detect_mode ?? prev.imageDetectMode ?? imageDetectMode.value,
    image_detect_at: storyboardReset ? null : (res?.image_detect_at ?? res?.imageDetectAt ?? prev.image_detect_at ?? prev.imageDetectAt ?? null),
    image_prompt_at: storyboardReset ? null : (res?.image_prompt_at ?? res?.imagePromptAt ?? prev.image_prompt_at ?? prev.imagePromptAt ?? null),
    total_duration: res?.total_duration ?? res?.totalDuration ?? prev.total_duration ?? prev.totalDuration ?? 0,
    storyboard_breakdown_at: storyboardAt,
    image_breakdown_at: storyboardReset ? null : imageAt,
    generated_at: storyboardAt,
  }
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
  if (isNarrationMode.value) {
    return [
      { id: 'voice', label: isMotionComicMode.value ? '角色音色' : '旁白音色', icon: Mic2, badge: isMotionComicMode.value ? (charsVoiced.value ? `${charsVoiced.value}/${chars.value.length}` : '') : (narratorReady.value ? '✓' : '') },
      { id: 'chars', label: '定妆参考', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
      { id: 'shots', label: '生成配图', icon: ImageIcon, badge: narrationNeedImageCount.value ? `${shotImgCount.value}/${narrationNeedImageCount.value}` : '' },
      { id: 'dubbing', label: '生成配音', icon: Mic2, badge: ttsEligibleCount.value ? `${ttsGeneratedCount.value}/${ttsEligibleCount.value}` : '' },
      { id: 'bgm', label: 'BGM 配乐', icon: Music, badge: sbs.value.length ? `${bgmAppliedCount.value}/${sbs.value.length}` : '' },
      { id: 'compose', label: '镜头合成', icon: Layers, badge: composableCount.value ? `${composedCount.value}/${composableCount.value}` : '' },
    ]
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
}))

const narrationIconMap = {
  'script:raw': FileText,
  'script:chat': Sparkles,
  'script:storyboard': Clapperboard,
  'prod:voice': Mic2,
  'prod:chars': Users,
  'prod:dubbing': Mic2,
  'prod:bgm': Music,
  'prod:shots': ImageIcon,
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
      label: '剧本',
      items: [
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
    return
  }
  if (key.startsWith('prod:')) {
    panel.value = 'production'
    prodTab.value = key.replace('prod:', '')
    return
  }
  if (key.startsWith('export:')) {
    panel.value = 'export'
    exportTab.value = key.replace('export:', '')
    return
  }
  panel.value = 'export'
  exportTab.value = 'merge'
}

const pipelineProgress = computed(() => workflowProgress(productionMode.value, workflowState.value))

const currentStageLabel = computed(() => {
  if (panel.value === 'script') {
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
  if (/^preset:/i.test(raw) || /^[0-9a-f-]{36}$/i.test(raw)) return 'voicebox'
  return ''
}

function updateCharVoice(charId, voiceId) {
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
}
function getVoiceProfile(voiceId) {
  return voiceProfiles.value.find(v => v.id === voiceId) || null
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

async function refreshStoryboardsOnly() {
  if (!epId.value) return
  sbs.value = sortStoryboards(await episodeAPI.storyboards(epId.value))
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
    const sb = bgmTargetSbId.value ? sbs.value.find(s => s.id === bgmTargetSbId.value) : null
    const result = await musicAPI.suggestDescription({
      episode_id: epId.value,
      storyboard_id: sb?.id,
      model: bgmModel.value,
      description: bgmDesc.value.trim() || undefined,
      content: sb ? getDialogueText(sb) : (localScript.value || scriptContent.value || localRaw.value || ''),
    })
    if (result?.description) {
      bgmDesc.value = result.description
      toast.success('BGM 描述已生成')
    } else {
      toast.error('AI 未返回描述')
    }
  } catch (e) {
    toast.error(e.message)
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
  } else if (epHasSbs) scriptStep.value = 4
  else if (epHasScript && chars.value.some(c => c.voice_style || c.voiceStyle)) scriptStep.value = 3
  else if (epHasScript && chars.value.length) scriptStep.value = 2
  else if (epHasScript || epHasContent) scriptStep.value = 1
  else scriptStep.value = 0

  syncNarrationBreakdownImageCount()
  if (isNarrationMode.value && panel.value === 'production' && !['voice', 'chars', 'dubbing', 'bgm', 'shots', 'compose'].includes(prodTab.value)) {
    prodTab.value = 'voice'
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
    resumeComposePollIfNeeded().catch(() => {}),
  )
  await Promise.allSettled(tasks)
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
    if (sbs.value.length) {
      const prevId = selectedSb.value?.id
      const stillExists = prevId && sbs.value.some(sb => sb.id === prevId)
      if (!stillExists) selectedSb.value = sbs.value[0]
    } else {
      selectedSb.value = null
    }

    applyEpisodeDataAfterLoad(ep)

    if (hasDuplicateStoryboardNumbers(sbs.value)) {
      void fixDuplicateStoryboardNumbers()
    }
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

function extractScriptFromChat(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:markdown|text)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()
  const lines = raw.split('\n')
  const idx = lines.findIndex(line => /^今天体验的人生剧本是/.test(line.trim()))
  if (idx >= 0) return lines.slice(idx).join('\n').trim()
  return raw
}

function scrollScriptChatToBottom() {
  const el = scriptChatScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function clearScriptChat() {
  if (scriptChatGenerating.value) scriptChatAbortController.value?.abort()
  scriptChatMessages.value = defaultScriptChatMessages()
  if (epId.value && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${SCRIPT_CHAT_STORAGE_PREFIX}${epId.value}`)
  }
  scriptChatInput.value = ''
}

function applyScriptChatToEditor(mode = 'replace', navigateToRaw = false) {
  const draft = extractScriptFromChat(lastScriptChatDraft.value)
  if (!draft) {
    toast.warning(isMotionComicMode.value ? '暂无可填入的漫剧稿' : '暂无可填入的解说稿')
    return
  }
  if (mode === 'append' && localRaw.value.trim()) {
    localRaw.value = `${localRaw.value.trim()}\n\n${draft}`
  } else {
    localRaw.value = draft
  }
  saveRaw()
  toast.success(mode === 'append' ? '已追加到文案' : '已填入文案')
  if (navigateToRaw) goSubStep('script:raw')
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

  const controller = new AbortController()
  scriptChatAbortController.value = controller
  await nextTick()
  scrollScriptChatToBottom()

  try {
    const payloadMessages = scriptChatMessages.value
      .filter(msg => !msg.local)
      .slice(0, -1)
      .map(({ role, content }) => ({ role, content }))

    const result = await episodeAPI.narrationScriptChatStream(epId.value, {
      messages: payloadMessages,
      text_model: scriptChatModel.value,
      text_thinking: scriptChatThinking.value,
    }, {
      signal: controller.signal,
      onThinking: thinking => {
        scriptChatMessages.value[assistantIdx].thinking = thinking
        scrollScriptChatToBottom()
      },
      onDelta: content => {
        scriptChatMessages.value[assistantIdx].content = content
        scrollScriptChatToBottom()
      },
    })
    if (result?.reply) {
      scriptChatMessages.value[assistantIdx].content = result.reply
    }
  } catch (e) {
    const msg = scriptChatMessages.value[assistantIdx]
    if (!msg?.content && !msg?.thinking) {
      scriptChatMessages.value.splice(assistantIdx, 1)
    }
    if (e.message !== '请求已取消') toast.error(e.message)
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

  const userText = text || '开始检测配图'
  imageDetectChatMessages.value.push({ role: 'user', content: userText })
  imageDetectChatInput.value = ''
  imageDetectChatGenerating.value = true
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

    const result = await episodeAPI.narrationImageDetectChatStream(epId.value, {
      messages: payloadMessages,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
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
    })

    if (result?.reply) {
      const msg = imageDetectChatMessages.value[assistantIdx]
      msg.content = result.reply
    }

    if (action === 'run') {
      await refresh()
      syncNarrationBreakdownImageCount()
      const count = narrationDetectDisplayCount.value
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        image_needed_count: count,
        paragraph_count: count,
        image_detect_at: Date.now(),
        image_detect_source: 'llm',
      })
    }
  } catch (e) {
    const msg = imageDetectChatMessages.value[assistantIdx]
    if (!msg?.content && !msg?.thinking && !msg?.statusText) {
      imageDetectChatMessages.value.splice(assistantIdx, 1)
    }
    if (e.message !== '请求已取消') toast.error(e.message)
  } finally {
    imageDetectChatGenerating.value = false
    imageDetectChatAbortController.value = null
    await nextTick()
    scrollImageDetectChatToBottom()
  }
}

async function sendImagePromptChat(explicitAction?: 'run' | 'retry_missing') {
  const text = imagePromptChatInput.value.trim()
  const action = resolveImagePromptChatAction(text, explicitAction)
  if (!text && !action) return
  if (imagePromptChatGenerating.value || !epId.value) return

  const userText = text || (action === 'retry_missing' ? '补全缺失配图文案' : '开始生成配图文案')
  imagePromptChatMessages.value.push({ role: 'user', content: userText })
  imagePromptChatInput.value = ''
  imagePromptChatGenerating.value = true
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

    const result = await episodeAPI.narrationImagePromptChatStream(epId.value, {
      messages: payloadMessages,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
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
    })

    if (result?.reply) {
      const msg = imagePromptChatMessages.value[assistantIdx]
      msg.content = result.reply
    }

    if (action) {
      await refresh()
      syncNarrationBreakdownImageCount()
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        prompts_generated: narrationPromptDisplayCount.value,
        image_prompt_at: Date.now(),
        image_prompt_source: 'llm_raw',
      })
    }
  } catch (e) {
    const msg = imagePromptChatMessages.value[assistantIdx]
    if (!msg?.content && !msg?.thinking && !msg?.statusText) {
      imagePromptChatMessages.value.splice(assistantIdx, 1)
    }
    if (e.message !== '请求已取消') toast.error(e.message)
  } finally {
    imagePromptChatGenerating.value = false
    imagePromptChatAbortController.value = null
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
        storyboardChatMessages.value[assistantIdx].thinking = thinking
        scrollStoryboardChatToBottom()
      },
      onDelta: content => {
        storyboardChatMessages.value[assistantIdx].content = content
        scrollStoryboardChatToBottom()
      },
      onStatus: content => {
        storyboardChatMessages.value[assistantIdx].statusText = content
        scrollStoryboardChatToBottom()
      },
    })

    if (result?.reply) {
      const msg = storyboardChatMessages.value[assistantIdx]
      msg.content = result.reply
    }

    if (action === 'run') {
      const res = result?.breakdown || {}
      await finalizeStoryboardBreakdown(res)
    }
  } catch (e) {
    const msg = storyboardChatMessages.value[assistantIdx]
    if (!msg?.content && !msg?.thinking && !msg?.statusText) {
      storyboardChatMessages.value.splice(assistantIdx, 1)
    }
    if (e.message !== '请求已取消') toast.error(e.message)
  } finally {
    storyboardChatGenerating.value = false
    storyboardChatAbortController.value = null
    await nextTick()
    scrollStoryboardChatToBottom()
  }
}

watch(() => scriptStep.value, step => {
  if (isNarrationMode.value && step === narrationStoryboardStep()) {
    nextTick(() => scrollStoryboardChatToBottom())
  }
})

watch(() => scriptStep.value, step => {
  if (isNarrationMode.value && step === narrationScriptChatStep()) {
    nextTick(() => scrollScriptChatToBottom())
  }
})

function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }
async function saveNarrationScript() {
  const script = (localRaw.value || localScript.value || '').trim()
  if (!script) throw new Error('请先填写解说文案')
  localScript.value = script
  localRaw.value = script
  await Promise.all([
    episodeAPI.update(epId.value, { content: script, script_content: script }),
  ])
  episode.value.content = script
  episode.value.script_content = script
  return script
}
function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh) }
function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  localScript.value = raw
  saveScr()
  toast.success('已跳过 AI 改写，当前将直接使用原始内容')
  scriptStep.value = 2
}
function doExtract() { saveScr(); runAgent('extractor', '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并', dramaId, epId.value, refresh) }
function doVoice() { runAgent('voice_assigner', '请为所有角色分配合适的音色', dramaId, epId.value, refresh) }
async function batchGenSamples() {
  const pending = chars.value.filter(c => (c.voice_style || c.voiceStyle) && !(c.voice_sample_url || c.voiceSampleUrl))
  if (!pending.length) {
    toast.info(charsVoiced.value ? '所有角色的试听文件已生成' : '请先分配音色')
    return
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
  const cfg = videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)
  const label = cfg ? `${cfg.name} (${cfg.provider})` : '默认'
  runAgent('storyboard_breaker', `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`, dramaId, epId.value, refresh)
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
  if (psz !== null) {
    const n = Number(psz)
    if (Number.isFinite(n) && n >= 1 && n <= 20) imagePromptBatchSize.value = Math.round(n)
  }
}

function persistImageDetectBatchPrefs() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('huobao-narration-detect-batch-threshold', String(imageDetectBatchThreshold.value))
  window.localStorage.setItem('huobao-narration-detect-batch-size', String(imageDetectBatchSize.value))
  window.localStorage.setItem('huobao-narration-prompt-batch-size', String(imagePromptBatchSize.value))
}

async function finalizeStoryboardBreakdown(res) {
  await refreshStoryboardsOnly()
  scriptStoryboardPage.value = 1
  const apiCount = Number(res?.count ?? 0)
  if (apiCount > 0 && sbs.value.length > 0 && apiCount !== sbs.value.length) {
    console.warn('[storyboard] API count vs loaded storyboards mismatch', {
      apiCount,
      loaded: sbs.value.length,
    })
  }
  persistNarrationBreakdownSummary({
    ...res,
    storyboard_breakdown_at: Date.now(),
  })
  await refresh()
  await ensureNarratorCharacter()
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
        : isMotionComicMode.value
          ? '，未识别片头（首行请写「标题：」或「本期故事：…」）'
          : '，未识别片头标题（首行请写「标题：」或「今天体验的人生剧本是…」）'
      const sbLabel = '旁白分镜'
      toast.success(`${sbLabel}：${sentenceCount} 句 → ${res?.count || 0} 镜${titleHint}`)
      await finalizeStoryboardBreakdown(res)
    } catch (e) {
      toast.error(e.message)
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

    if (progress?.status === 'processing') {
      narrationImageBreakdownProgress.value = progress
      narrationImageBreaking.value = true
      return
    }

    // 本地步骤进行中时，忽略上一轮残留的 completed/idle，避免进度条被误关
    if (localStepActive) return

    narrationImageBreakdownProgress.value = progress
    if (progress?.status === 'completed' || progress?.status === 'failed' || progress?.status === 'idle') {
      stopNarrationImageBreakdownPoll()
      narrationImageBreaking.value = false
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
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        image_needed_count: count,
        paragraph_count: count,
        image_detect_at: Date.now(),
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
    onSuccess: () => {
      const count = narrationPromptDisplayCount.value
      const missing = narrationMissingPromptCount.value
      if (missing > 0) {
        toast.warning(`仍有 ${missing} 段文案未生成，请点「补全缺失文案」`)
      } else {
        toast.success(`配图文案已就绪（${count} 条）`)
      }
      persistNarrationBreakdownSummary({
        ...narrationBreakdownSummary.value,
        prompts_generated: count,
        image_prompt_at: Date.now(),
        image_prompt_source: 'llm_raw',
      })
    },
    startMessage: narrationMissingPromptCount.value && narrationPromptDisplayCount.value
      ? `正在补全 ${narrationMissingPromptCount.value} 段缺失配图文案…`
      : '正在生成纯 LLM 配图文案…',
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
    onSuccess: async () => {
      await refresh()
      syncNarrationBreakdownImageCount()
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
    onSuccess: async () => {
      await refresh()
      syncNarrationBreakdownImageCount()
      const count = narrationPromptDisplayCount.value
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
      stepResult = await apiCall()
      jobStarted = true
      const progress = await waitForNarrationImageBreakdownDone()
      await refresh()
      syncNarrationBreakdownImageCount()
      onSuccess?.(progress || stepResult)
    } catch (e) {
      toast.error(e.message)
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
    toast.info(shotsWithIssues
      ? `发现 ${shotsWithIssues}/${total} 镜共 ${issueCount} 项问题，可逐条或全部应用优化`
      : `已检查 ${total} 镜，未发现明显问题`)
  } catch (e) {
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
        await ensureNarratorCharacter()
      } else if (mode === 'create') {
        toast.success(`已创建 ${res?.count || 0} 个旁白分镜`)
        persistNarrationBreakdownSummary({
          count: res?.count,
          total_duration: res?.total_duration ?? res?.totalDuration,
          storyboard_breakdown_at: Date.now(),
        })
        await refresh()
        await ensureNarratorCharacter()
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
      if (updated > 0) {
        persistNarrationBreakdownSummary({
          image_breakdown_at: Date.now(),
          image_prompt_source: 'upload',
        })
      }
      await refresh()
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationStoryboardDescUploading.value = false
    narrationImageDescUploading.value = false
  }
}

async function loadLocalCastVoices() {
  try {
    const res = await voicesAPI.localCast({ model_size: localVoiceboxModelSize.value })
    const rows = res?.voices || []
    localCastVoiceProfiles.value = rows.map(v => ({
      id: v.voice_id,
      label: v.voice_name,
      gender: v.gender === 'female' ? '女声' : v.gender === 'male' ? '男声' : '中性',
      traits: v.source === 'kokoro' ? 'Kokoro 本地' : 'Edge TTS',
      suitable: v.provider === 'voicebox' ? 'Voicebox' : 'Edge',
      source: v.source,
      provider: v.provider,
    }))
  } catch (e) {
    console.error('Failed to load local cast voices', e)
    localCastVoiceProfiles.value = []
  }
}

async function assignLocalCharacterVoices(overwrite = false) {
  if (!epId.value) return
  try {
    localVoiceAssigning.value = true
    const res = await episodeAPI.assignLocalVoices(epId.value, {
      overwrite,
      voicebox_model_size: localVoiceboxModelSize.value,
    })
    await refresh()
    const kokoro = res?.kokoro_available ?? 0
    const edge = res?.edge_available ?? 0
    toast.success(`已分配 ${res?.assigned ?? 0} 个角色音色（Kokoro ${kokoro} 可选 · Edge ${edge} 可选${res?.skipped ? `，跳过 ${res.skipped} 个已有音色` : ''}）`)
  } catch (e) {
    toast.error(e.message || '本地音色分配失败')
  } finally {
    localVoiceAssigning.value = false
  }
}

async function doExtractNarrationCharacters() {
  narrationExtracting.value = true
  try {
    const script = await saveNarrationScript()
    const style = getNarrationImageStyle()
    const res = await episodeAPI.extractNarrationCharacters(epId.value, {
      script,
      style,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
    })
    const created = res?.created ?? 0
    const updated = res?.updated ?? 0
    const archived = res?.archived ?? 0
    if (created || updated) {
      const total = (res?.characters || []).length
      const archiveHint = archived ? `，已移除 ${archived} 个过期定妆` : ''
      const roleLabel = isMotionComicMode.value ? '角色（含主要配角）' : '主角'
      toast.success(`已提取${roleLabel} ${total} 条定妆：新增 ${created}，更新 ${updated}${archiveHint}`)
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
    if (isMotionComicMode.value && (res?.characters || []).length) {
      await assignLocalCharacterVoices(false)
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    narrationExtracting.value = false
  }
}

async function addNarrationCharacter() {
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
  if (voice) narratorVoiceId.value = voice
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
    voice_style: narratorVoiceId.value || dramaNarrator?.voice_style || dramaNarrator?.voiceStyle || undefined,
    voice_provider: lockedAudioProvider.value || undefined,
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
      voice_provider: lockedAudioProvider.value || undefined,
    })
    const patch = {
      voice_style: selectedVoice,
      voiceStyle: selectedVoice,
      voice_provider: lockedAudioProvider.value || undefined,
      voiceProvider: lockedAudioProvider.value || undefined,
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
async function genSample(id) { try { await characterAPI.voiceSample(id, epId.value); toast.success('试听已生成'); refresh() } catch (e) { toast.error(e.message) } }
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
  if (localTtsEnabled.value && localTtsEngine.value === 'voicebox') return 1
  if (localTtsEnabled.value) return 3
  return 3
}

function resolveTtsWatchOptions() {
  if (localTtsEnabled.value && localTtsEngine.value === 'voicebox') {
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

async function watchCharImageResult(charId, generationId, attempts = 36, delay = 2500, baseline = null) {
  const startChar = chars.value.find(c => c.id === charId)
  const startUrl = baseline?.startUrl ?? (startChar?.image_url || startChar?.imageUrl || '')
  const startUpdatedAt = baseline?.startUpdatedAt ?? (startChar?.updated_at || startChar?.updatedAt || '')

  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? 1500 : delay)

    if (generationId) {
      try {
        const gen = await imageAPI.get(generationId)
        if (gen?.status === 'failed') {
          pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
          toast.error(gen?.error_msg || gen?.errorMsg || '定妆生成失败')
          return false
        }
        if (gen?.status === 'completed') {
          await refresh()
          pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
          return true
        }
      } catch {}
    }

    await refresh()
    const char = chars.value.find(c => c.id === charId)
    const url = char?.image_url || char?.imageUrl || ''
    const updatedAt = char?.updated_at || char?.updatedAt || ''
    if (url && (url !== startUrl || updatedAt !== startUpdatedAt)) {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
      return true
    }
  }
  pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== charId)
  toast.warning('定妆生成超时或失败，请重试')
  return false
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
  if (!localEdgeVoiceId.value) {
    toast.warning(localTtsEngine.value === 'voicebox' ? '请选择 Voicebox 音色' : '请选择本地音色')
    return
  }
  try {
    openingAudioGenerating.value = true
    await episodeAPI.generateOpeningAudio(epId.value, {
      subtitle_text: text,
      local_tts_engine: localTtsEngine.value === 'voicebox' ? 'voicebox' : 'edge',
      local_voice: localEdgeVoiceId.value,
      tts_speed: localTtsSpeed.value,
      ...(localTtsEngine.value === 'voicebox' && resolveVoiceboxInstructText()
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

async function scanNarrationShotImage(sb) {
  if (!hasNarrationShotImage(sb)) {
    toast.warning('请先上传或生成配图')
    return
  }
  if (!textModelSupportsVision(episodeTextModel.value)) {
    toast.warning('请先将文本模型设为 qwen3.5-plus 或 gpt-4o')
    return
  }
  pendingShotScanIds.value.push(sb.id)
  try {
    const res = await storyboardAPI.scanNarrationImage(sb.id, {
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
    })
    const score = res?.match_score ?? '—'
    const summary = res?.summary || '扫描完成'
    const issues = (res?.issues || []).filter(Boolean)
    if (issues.length) {
      toast.warning(`${summary}（${score}分）\n${issues.join('；')}`)
    } else {
      toast.success(`${summary}（${score}分）`)
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    pendingShotScanIds.value = pendingShotScanIds.value.filter(id => id !== sb.id)
  }
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
  const count = narrationOwnImageCount.value
  if (!count) {
    toast.info('暂无配图可清除')
    return
  }
  if (!confirm(`将清除本集 ${count} 张配图（含 AI 生成与上传），删除文件并重置数据库；已合成的镜头需重新合成。是否继续？`)) return
  narrationAssetClearing.value = true
  try {
    const res = await episodeAPI.clearNarrationImages(epId.value)
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
      const res = await characterAPI.getPortraitPrompt(charRow.id, epId.value, { useReference })
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

async function genCharImg(id) {
  const useReference = isCharPortraitUseReference(id)
  const beforeChar = chars.value.find(c => c.id === id)
  const baseline = {
    startUrl: beforeChar?.image_url || beforeChar?.imageUrl || '',
    startUpdatedAt: beforeChar?.updated_at || beforeChar?.updatedAt || '',
  }
  try {
    if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
    const result = await characterAPI.generateImage(id, epId.value, { useReference })
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
    await refresh()
    const genId = result?.image_generation_id
    const done = await watchCharImageResult(id, genId, 36, 2500, baseline)
    if (done) toast.success('定妆图已更新')
    else if (genId) {
      try {
        const gen = await imageAPI.get(genId)
        const err = gen?.error_msg || gen?.errorMsg
        if (err) toast.error(err)
      } catch {}
    }
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}

async function recognizeCharPortrait(id) {
  try {
    if (!isPendingCharRecognize(id)) pendingCharRecognizeIds.value.push(id)
    const result = await characterAPI.recognizePortrait(id, epId.value)
    toast.success('外貌描述已更新')
    if (result?.character) {
      const idx = chars.value.findIndex(c => c.id === id)
      if (idx >= 0) chars.value[idx] = result.character
    }
    await refresh()
  } catch (e) {
    toast.error(e.message)
  } finally {
    pendingCharRecognizeIds.value = pendingCharRecognizeIds.value.filter(item => item !== id)
  }
}

async function generateCharAppearance(id) {
  try {
    if (!isPendingCharAppearance(id)) pendingCharAppearanceIds.value.push(id)
    const script = localRaw.value || rawContent.value || scriptContent.value || ''
    const result = await characterAPI.generateAppearance(id, {
      episode_id: epId.value,
      script,
      text_model: episodeTextModel.value,
      text_thinking: episodeTextThinking.value,
    })
    const appearance = result?.appearance || ''
    if (appearance) {
      const c = chars.value.find(ch => ch.id === id)
      if (c) c.appearance = appearance
      if (result?.character) {
        const idx = chars.value.findIndex(ch => ch.id === id)
        if (idx >= 0) chars.value[idx] = result.character
      }
    }
    toast.success('AI 外貌描述已生成（含 English tags）')
  } catch (e) {
    toast.error(e.message)
  } finally {
    pendingCharAppearanceIds.value = pendingCharAppearanceIds.value.filter(item => item !== id)
  }
}

async function batchCharImages() {
  const pending = sortCharactersForPortraitGeneration(
    visualChars.value.filter(c => !(c.image_url || c.imageUrl)),
  )
  const ids = pending.map(c => c.id)
  if (!ids.length) {
    toast.info('所有角色图片已生成')
    return
  }
  if (!tryBeginBatch('charImages', '角色图片批量生成中…')) return
  pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
  try {
    for (const char of pending) {
      const useReference = isCharPortraitUseReference(char.id)
      if (useReference) {
        const ref = findPortraitReferenceCharacter(chars.value, char)
        if (ref && pending.some(c => c.id === ref.id && !(c.image_url || c.imageUrl))) {
          await watchAsyncResult(() => {
            const row = chars.value.find(c => c.id === ref.id)
            return !!(row?.image_url || row?.imageUrl)
          }, 36)
          await refresh()
        } else if (!ref) {
          const anchor = findDramaStyleAnchorCharacter(chars.value, char)
          if (anchor && pending.some(c => c.id === anchor.id && !(c.image_url || c.imageUrl))) {
            await watchAsyncResult(() => {
              const row = chars.value.find(c => c.id === anchor.id)
              return !!(row?.image_url || row?.imageUrl)
            }, 36)
            await refresh()
          }
        }
      }
      await characterAPI.generateImage(char.id, epId.value, { useReference })
    }
    await refresh()
    await watchAsyncResult(() => ids.every(id => {
      const char = chars.value.find(c => c.id === id)
      const done = !!(char?.image_url || char?.imageUrl)
      if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      return done
    }), 36)
    toast.success('角色图片批量生成完成')
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  } finally {
    endBatch('charImages')
  }
}
async function genSceneImg(id) {
  try {
    if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
    await sceneAPI.generateImage(id, epId.value)
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
    const results = await Promise.allSettled(ids.map(id => sceneAPI.generateImage(id, epId.value)))
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
  return match ? match[1].replace(/[（(].+?[)）]/g, '').trim() : ''
}

function getDialogueText(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  return dialogue ? dialogue.replace(/^.+?[:：]\s*/, '').trim() : ''
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
      const mode = provider === 'edge' ? '（本地 Edge）' : provider === 'voicebox' ? '（Voicebox）' : '（付费 API）'
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
          const mode = provider === 'edge' ? '（本地 Edge）' : provider === 'voicebox' ? '（Voicebox）' : '（付费 API）'
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
  void runBatchShotTTS(`配音生成中（剩余 ${pending.length} 段）…`, false)
}

async function batchShotTTSAll() {
  const targets = getTtsBatchTargets(true)
  if (!targets.length) {
    toast.info('当前没有可生成的对白或旁白')
    return
  }
  await ensureLocalTtsEngineForBatch()
  void runBatchShotTTS(`正在重新生成全部 ${targets.length} 段配音…`, true)
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
          toast.success(`剩余配音已全部生成${localTtsEnabled.value ? `（本地 ${localTtsEngine.value === 'voicebox' ? 'Voicebox' : 'Edge'}）` : ''}`)
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
          : `剩余配音已全部生成${localTtsEnabled.value ? `（本地 ${localTtsEngine.value === 'voicebox' ? 'Voicebox' : 'Edge'}）` : ''}`)
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
  const v = sb?.updated_at || sb?.updatedAt || episode.value?.updated_at || episode.value?.updatedAt || ''
  const q = v ? `?v=${encodeURIComponent(String(v))}` : ''
  return `/${path.replace(/^\//, '')}${q}`
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

async function genNarrationShotImage(sb) {
  const style = getNarrationImageStyle()
  const basePrompt = getNarrationImagePromptText(sb, style)
  if (!basePrompt) {
    toast.warning('该镜头没有旁白文案，无法生成配图')
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
    if (!isPendingNarrationShot(sb.id)) pendingNarrationShotIds.value.push(sb.id)
    const characterIds = await resolveShotCharacterIds(sb)
    const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
      storyboard_id: sb.id,
      drama_id: dramaId,
      frame_type: 'illustration',
    }, episodeImageModel.value, characterIds, sbs.value)
    await imageAPI.generate(buildImagePayload(payload))
    toast.success('配图生成中')
    await refresh()
    await watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === sb.id)
      const done = hasNarrationShotImage(target)
      if (done) pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(item => item !== sb.id)
      return done
    })
  } catch (e) {
    pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  }
}

async function watchNarrationImageBatchResult(jobs, options = {}) {
  const attempts = options.attempts ?? 60
  const delay = options.delay ?? 4000

  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? 1500 : delay)

    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'failed') continue
      if (!job.generationId) continue
      try {
        const gen = await imageAPI.get(job.generationId)
        if (gen?.status === 'failed') {
          job.status = 'failed'
          job.error = gen?.error_msg || gen?.errorMsg || '生成失败'
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
          continue
        }
        if (gen?.status === 'completed') {
          job.status = 'completed'
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
        }
      } catch {}
    }

    await refresh()
    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'failed') continue
      const sb = sbs.value.find(s => s.id === job.shotId)
      if (hasNarrationShotImage(sb)) {
        job.status = 'completed'
        pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
      }
    }

    if (jobs.every(j => j.status === 'completed' || j.status === 'failed')) {
      const failed = jobs.filter(j => j.status === 'failed')
      const completed = jobs.filter(j => j.status === 'completed')
      if (failed.length && !completed.length) {
        toast.error(`${failed.length} 张配图失败：${failed[0].error || '请检查图像 API 配置'}`)
      } else if (failed.length) {
        toast.warning(`${completed.length} 张完成，${failed.length} 张失败`)
      }
      await sleep(failed.length ? 1200 : 0)
      return true
    }
  }

  for (const job of jobs) {
    if (job.status === 'processing' || job.status === 'pending') {
      job.status = 'failed'
      job.error = job.error || '生成超时'
      pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
    }
  }
  toast.warning('配图生成超时，请稍后重试')
  return false
}

async function batchNarrationShotImages(options) {
  const allPending = narrationShotsPendingImage(sbs.value)
  const pending = options?.shots?.length ? options.shots : allPending
  if (!pending.length) {
    toast.info('所有需配图镜头已生成')
    return
  }
  const pendingLabel = formatNarrationShotDisplayList(pending)
  const pendingHint = pending.length < allPending.length
    ? `${pendingLabel}（${pending.length}/${allPending.length} 张）`
    : formatNarrationPendingImageHint(sbs.value)
  if (!tryBeginBatch('narrationImages', `配图生成中：${pendingHint}…`)) return
  if (pending.length) shotsListFilter.value = 'processing'
  const jobs = pending.map(sb => ({
    shotId: sb.id,
    generationId: null,
    status: 'pending',
    error: '',
  }))
  try {
    const style = getNarrationImageStyle()
    pendingNarrationShotIds.value = [...new Set([...pendingNarrationShotIds.value, ...pending.map(sb => sb.id)])]
    const results = await Promise.allSettled(pending.map(async sb => {
      const characterIds = await resolveShotCharacterIds(sb)
      const payload = buildNarrationImageGeneratePayload(sb, visualChars.value, style, {
        storyboard_id: sb.id,
        drama_id: dramaId,
        frame_type: 'illustration',
      }, episodeImageModel.value, characterIds, sbs.value)
      return imageAPI.generate(buildImagePayload(payload))
    }))
    results.forEach((result, index) => {
      const job = jobs[index]
      if (!job) return
      if (result.status === 'fulfilled') {
        job.generationId = result.value?.id ?? null
        job.status = job.generationId ? 'processing' : 'failed'
        if (!job.generationId) {
          job.error = '提交失败：未返回任务 ID'
          pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
        }
      } else {
        job.status = 'failed'
        job.error = result.reason?.message || '提交失败'
        pendingNarrationShotIds.value = pendingNarrationShotIds.value.filter(id => id !== job.shotId)
      }
    })
    const submitFailCount = jobs.filter(j => j.status === 'failed').length
    const submitOkCount = jobs.filter(j => j.status === 'processing').length
    if (submitFailCount && !submitOkCount) {
      toast.error(`${submitFailCount} 个镜头配图提交失败（${pendingLabel}）`)
    } else if (submitFailCount) {
      toast.warning(`已提交 ${submitOkCount} 张，${submitFailCount} 张提交失败`)
    } else {
      toast.success(`已提交配图生成：${pendingHint}`)
    }
    if (submitOkCount) {
      await refresh()
      await watchNarrationImageBatchResult(jobs, { attempts: 60, delay: 4000 })
    }
  } finally {
    endBatch('narrationImages')
  }
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
function hasComposed(s) { return hasComposedStoryboard(s, sbs.value) }

function getShotReferenceImages(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 6) return
    refs.push(value)
  }
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = scenes.value.find(item => item.id === sceneId)
  pushRef(scene?.image_url || scene?.imageUrl)
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
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: sb.video_prompt || sb.videoPrompt || '',
    duration: Number(sb.duration || 5),
  }
  const first = getFirstFrame(sb)
  const last = getLastFrame(sb)
  const refs = getRefs(sb)
  if (first && last) { Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last }) }
  else if (refs.length) { Object.assign(params, { reference_mode: 'multiple', reference_image_urls: [first, ...refs].filter(Boolean) }) }
  else if (first) { Object.assign(params, { reference_mode: 'single', image_url: first }) }
  try {
    delete failedVideoMessages.value[sb.id]
    if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
    const generation = await videoAPI.generate(params)
    toast.success('视频生成中')
    await refresh()
    pollVideoGeneration(generation?.id, sb.id)
  } catch (e) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
    toast.error(e.message)
  }
}
async function pollVideoGeneration(generationId, storyboardId) {
  if (!generationId) {
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === storyboardId)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
      return done
    }, 60, 4000)
    return
  }
  for (let i = 0; i < 120; i++) {
    await sleep(4000)
    try {
      const res = await videoAPI.get(generationId)
      await refresh()
      if (res?.status === 'completed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete failedVideoMessages.value[storyboardId]
        toast.success('视频生成完成')
        return
      }
      if (res?.status === 'failed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
        }
        toast.error(failedVideoMessages.value[storyboardId])
        return
      }
    } catch {}
  }
  pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  failedVideoMessages.value = {
    ...failedVideoMessages.value,
    [storyboardId]: '视频生成超时',
  }
  toast.error('视频生成超时')
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
  const pendingIds = sbs.value.filter(s => !hasVid(s)).map(s => s.id)
  if (!pendingIds.length) return
  if (!tryBeginBatch('videos', '批量视频生成中…')) return
  try {
    pendingIds.forEach(id => {
      const sb = sbs.value.find(item => item.id === id)
      if (sb) genVid(sb)
    })
    pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...pendingIds])]
    await watchAsyncResult(() => pendingIds.every(id => {
      const target = sbs.value.find(s => s.id === id)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
      return done
    }), 80, 4000)
  } finally {
    endBatch('videos')
  }
}
async function batchCompose() {
  const pending = composeUnitShots.value.filter(sb => !hasComposedStoryboard(sb, sbs.value))
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
  if (/[男|青年|大爷|学长|boy|man|male]/i.test(text)) return '男声'
  if (/[女|少女|御姐|奶奶|girl|woman|female]/i.test(text)) return '女声'
  return '中性'
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
      return {
        id: v.voice_id,
        label: isCloned
          ? `${v.voice_name}（克隆）`
          : isPreset
            ? `${v.voice_name}（预设·${engineLabel}${notReady ? '·模型未就绪' : ''}）`
            : v.voice_name,
        gender: '本地',
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
      }
    })
  } catch (e) {
    console.error('Failed to load voicebox voices', e)
    voiceboxAvailable.value = false
    voiceboxModelLoaded.value = false
    return []
  }
}

async function refreshLocalVoices() {
  if (localTtsEngine.value === 'voicebox') {
    const profiles = await loadVoiceboxVoices()
    edgeVoiceProfiles.value = profiles
    if (profiles.length && !profiles.some(p => p.id === localEdgeVoiceId.value)) {
      localEdgeVoiceId.value = profiles[0].id
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
  if (isMotionComicMode.value) loadLocalCastVoices()
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
watch([prodTab, epId, () => isMotionComicMode.value], ([tab]) => {
  if (tab === 'bgm' && epId.value) loadBgmLibrary()
  if (tab === 'chars' && isMotionComicMode.value) loadLocalCastVoices()
})
watch([composeListFilter, () => sbs.value.length], () => { composeListPage.value = 1 })
watch(composePageCount, (count) => {
  if (composeListPage.value > count) composeListPage.value = count
})
watch(prodTab, (tab, prev) => {
  if (tab === 'shots' || prev === 'shots') {
    shotsListFilter.value = 'all'
    shotsListPage.value = 1
  }
  if (tab === 'dubbing') dubbingListPage.value = 1
})
watch(dubbingPageCount, (count) => {
  if (dubbingListPage.value > count) dubbingListPage.value = count
})
watch([shotsListFilter, () => sbs.value.length], () => { shotsListPage.value = 1 })
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

async function initLocalVoices() {
  await refreshLocalVoices()
  if (!voiceboxAvailable.value && localTtsEngine.value === 'voicebox' && !edgeVoiceProfiles.value.length) {
    localTtsEngine.value = 'edge'
    await refreshLocalVoices()
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
})

  return {
    BaseSelect,
    COMPOSE_LIST_PAGE_SIZE,
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
    batchCharImages,
    batchCompose,
    batchGenSamples,
    batchNarrationShotImages,
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
    charImagesPendingCount,
    charImgCount,
    charPortraitUseReferenceById,
    chars,
    charsVoiced,
    clearAllCharPortraitImages,
    clearAllComposedVideos,
    clearAllNarrationImagePrompts,
    clearAllNarrationImages,
    clearAllNarrationTts,
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
    copyNarrationShotPromptsBatch,
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
    episodeTextThinking,
    estimateNarrationDurationLocal,
    evaluateComposePollDone,
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
    formatComposeTimecode,
    formatComposeUnitDuration,
    formatSrtRaw,
    formatUploadFailures,
    frameMode,
    frameModeOptions,
    framePendingKey,
    genCharImg,
    genNarrationShotImage,
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
    isNarrationMode,
    isMotionComicMode,
    isNarrationTitleShot,
    isNarratorCharacter,
    isPendingCharAppearance,
    isPendingCharImage,
    isPendingCharRecognize,
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
    loadBgmLibrary,
    loadConfigs,
    loadEdgeVoices,
    loadLatestGridImage,
    loadNarrationSrtFiles,
    loadUploadedEpisodeAudio,
    loadLocalCastVoices,
    loadVoiceboxVoices,
    loadVoices,
    localEdgeVoiceId,
    localRaw,
    localScript,
    localTtsEnabled,
    localTtsEngine,
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
    musicConfigs,
    narrationAssetClearing,
    narrationAudioSplitting,
    narrationAudioUploading,
    narrationBreakdownSummary,
    narrationBreaking,
    narrationCharCount,
    narrationCopyBatchIndex,
    narrationCopyBatchOptions,
    narrationCropImageCount,
    narrationCropWatermarkProcessing,
    narrationDetectDisplayCount,
    narrationEditAsTitle,
    narrationEditBusy,
    narrationEditDialogue,
    narrationEditDuration,
    narrationExtracting,
    narrationIconMap,
    narrationImageAuditPanel,
    narrationImageAuditRestorableCount,
    narrationImageAuditing,
    narrationImageBreakdownPanel,
    narrationImageBreakdownProgress,
    narrationImageBreakdownProgressMessage,
    narrationImageBreakdownProgressPercent,
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
    scriptChatQuickHints,
    scriptChatScrollRef,
    scriptChatThinking,
    scriptContent,
    scriptGenMode,
    scriptLen,
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
    ttsEligibleCount,
    ttsGenerateOptions,
    ttsGeneratedCount,
    ttsPendingCount,
    updateCharVoice,
    updateCharacterAppearance,
    updateField,
    updateGridAssignment,
    updateNarrationImagePrompt,
    updateNarrationImagePromptById,
    uploadImageFile,
    uploadedEpisodeAudio,
    videoConfigSelectOptions,
    videoConfigs,
    videoFailMessage,
    videosPendingCount,
    visibleBgmLibrary,
    visualCharNameCount,
    visualCharTotal,
    visualChars,
    voiceProfiles,
    voiceSampleCount,
    voiceSelectOptions,
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
