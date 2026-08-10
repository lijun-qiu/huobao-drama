/** 本地短剧模式 — 文本走智谱免费 GLM，生图/视频仍可走 ComfyUI */
import type { ProductionMode } from './production-mode.js'
import { PORTRAIT_REFERENCE_IMAGE_LAYOUT_CN, PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE } from './portrait-reference.js'

export const LOCAL_COMIC_PRODUCTION_MODE = 'local_comic' as const

export type LocalModelStage = 'idle' | 'llm' | 'image' | 'video' | 'audio'

export type LocalTtsEngine = 'edge' | 'voicebox' | 'gptsovits' | 'indextts'

/** 默认本地配音引擎与克隆音色（GPT-SoVITS 音色库 voice_id=008 云希） */
export const DEFAULT_LOCAL_TTS_ENGINE: LocalTtsEngine = 'indextts'
export const DEFAULT_CLONED_TTS_VOICE = 'gsv:008'

/** 智谱 OpenAI 兼容 Base URL（含 /api/paas/v4） @see https://docs.bigmodel.cn/cn/guide/develop/openai/introduction */
export const ZHIPU_OPENAI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
/** 与 text-models.DEFAULT_LOCAL_TEXT_MODEL 保持一致（避免循环依赖） */
const ZHIPU_DEFAULT_TEXT_MODEL = 'glm-4.7-flash'
const ZHIPU_DEFAULT_IMAGE_MODEL = 'cogview-3-flash'
const ZHIPU_DEFAULT_VIDEO_MODEL = 'cogvideox-flash'

export const LOCAL_COMIC_ENV = {
  comfyBaseUrl: (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
  comfyInputDir: process.env.COMFYUI_INPUT_DIR || 'C:\\my\\comfyui\\ComfyUI\\input',
  comfyOutputDir: process.env.COMFYUI_OUTPUT_DIR || 'C:\\my\\comfyui\\ComfyUI\\output',
  /** 智谱开放平台（文本 LLM 默认） */
  zhipuBaseUrl: (process.env.ZHIPU_BASE_URL || ZHIPU_OPENAI_BASE_URL).replace(/\/+$/, ''),
  zhipuApiKey: process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY || '',
  zhipuTextModel: process.env.ZHIPU_TEXT_MODEL || ZHIPU_DEFAULT_TEXT_MODEL,
  zhipuAgentModel: process.env.ZHIPU_AGENT_MODEL || ZHIPU_DEFAULT_TEXT_MODEL,
  zhipuImageModel: process.env.ZHIPU_IMAGE_MODEL || ZHIPU_DEFAULT_IMAGE_MODEL,
  zhipuVideoModel: process.env.ZHIPU_VIDEO_MODEL || ZHIPU_DEFAULT_VIDEO_MODEL,
  /** Agnes 定妆生图（支持参考图 / 图生图） @see https://wiki.agnes-ai.com/en/docs/agnes-image-20-flash */
  agnesBaseUrl: (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/+$/, ''),
  agnesApiKey: process.env.AGNES_API_KEY || '',
  agnesImageModel: process.env.AGNES_IMAGE_MODEL || process.env.AGNES_PORTRAIT_MODEL || 'agnes-image-2.1-flash',
  agnesPortraitModel: process.env.AGNES_PORTRAIT_MODEL || process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.1-flash',
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
  /** @deprecated 文本已迁智谱；保留给仍启用 Ollama 的环境 */
  ollamaTextModel: process.env.OLLAMA_TEXT_MODEL || ZHIPU_DEFAULT_TEXT_MODEL,
  /** 本地看图 / 定妆画风校验 VLM */
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:7b',
  /**
   * GPU 加载层数（可选）。未设时 Ollama 自动估算；显存紧时可设小一点让更多层走系统内存，如 20～28。
   * @see https://github.com/ollama/ollama/blob/main/docs/faq.md
   */
  ollamaNumGpu: (() => {
    const raw = process.env.OLLAMA_NUM_GPU?.trim()
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? Math.round(n) : undefined
  })(),
  /** Flux 配图文案中→英专用模型（FLUX_PROMPT_TRANSLATE=llm 时；默认智谱免费） */
  ollamaFluxTranslateModel: process.env.OLLAMA_FLUX_TRANSLATE_MODEL || process.env.ZHIPU_TEXT_MODEL || ZHIPU_DEFAULT_TEXT_MODEL,
  /** Flux 配图文案中→英：llm（默认，整段忠实七维）| youdao | mymemory | rule */
  fluxPromptTranslate: (process.env.FLUX_PROMPT_TRANSLATE || 'llm').toLowerCase(),
  youdaoAppKey: process.env.YOUDAO_APP_KEY || '',
  youdaoAppSecret: process.env.YOUDAO_APP_SECRET || '',
  /** MyMemory 注册邮箱，可提升免费日额度（可选） */
  mymemoryEmail: process.env.MYMEMORY_EMAIL || '',
  ollamaAgentModel: process.env.OLLAMA_AGENT_MODEL || ZHIPU_DEFAULT_TEXT_MODEL,
  /** Kolors VAE（models/vae/） */
  kolorsVae: process.env.LOCAL_KOLORS_VAE || 'kolors_vae_fp16.safetensors',
  /** Kolors ChatGLM3 量化权重（models/LLM/checkpoints/） */
  kolorsChatglmCheckpoint: process.env.LOCAL_KOLORS_CHATGLM || 'chatglm3-8bit.safetensors',
  /**
   * Kolors img2img denoise（标准语义：越高越听文案/越能改构图，越低越贴参考图）。
   * 原 0.32 会几乎原样保留「白底大头」参考 → 半身/只剩头；分镜默认 0.78。
   */
  kolorsImg2imgDenoise: Number(process.env.LOCAL_KOLORS_IMG2IMG_DENOISE || 0.78),
  /** Qwen-Image-Edit UNET（models/diffusion_models/）；仅 GGUF Q3_K_M，缺失直接报错 */
  qwenEditUnet: process.env.LOCAL_QWEN_EDIT_UNET || 'qwen-image-edit-2511-Q3_K_M.gguf',
  /** Qwen2.5-VL text encoder（models/text_encoders/） */
  qwenEditClip: process.env.LOCAL_QWEN_EDIT_CLIP || 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  /** Qwen Image VAE（models/vae/） */
  qwenEditVae: process.env.LOCAL_QWEN_EDIT_VAE || 'qwen_image_vae.safetensors',
  /** Lightning 4-step LoRA（models/loras/）；空字符串则关闭加速 */
  qwenEditLightningLora: process.env.LOCAL_QWEN_EDIT_LIGHTNING_LORA
    ?? 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
  /** Lightning 开启时 steps/cfg/shift；关闭 LoRA 时可用 20 / 4 / 3 */
  qwenEditSteps: Number(process.env.LOCAL_QWEN_EDIT_STEPS || 4),
  qwenEditCfg: Number(process.env.LOCAL_QWEN_EDIT_CFG || 1),
  qwenEditShift: Number(process.env.LOCAL_QWEN_EDIT_SHIFT || 3),
  qwenEditLoraStrength: Number(process.env.LOCAL_QWEN_EDIT_LORA_STRENGTH || 1),
  /** 关 Lightning 的引导采样：普通难构图 */
  qwenEditGuidedSteps: Number(process.env.LOCAL_QWEN_EDIT_GUIDED_STEPS || 6),
  qwenEditGuidedCfg: Number(process.env.LOCAL_QWEN_EDIT_GUIDED_CFG || 3.5),
  /**
   * 分镜有定妆参考时的步数（默认 20：弱锁脸 + 场景重绘，更稳）。
   */
  qwenEditPortraitRefSteps: Number(process.env.LOCAL_QWEN_EDIT_PORTRAIT_REF_STEPS || 20),
  /**
   * 双定妆同框第二遍换脸（漫画解说互动镜可用）。
   * 默认关闭；文案含双对照定妆时可 LOCAL_QWEN_EDIT_DUAL_PORTRAIT_PASS=true
   */
  qwenEditDualPortraitPass: process.env.LOCAL_QWEN_EDIT_DUAL_PORTRAIT_PASS === 'true',
  /**
   * 第二遍换脸：必须低 denoise（从整图 latent 局部改），denoise=1 会整图重绘导致脸/手融化。
   */
  qwenEditDualPortraitPassSteps: Number(process.env.LOCAL_QWEN_EDIT_DUAL_PORTRAIT_PASS_STEPS || 10),
  qwenEditDualPortraitPassCfg: Number(process.env.LOCAL_QWEN_EDIT_DUAL_PORTRAIT_PASS_CFG || 2.8),
  qwenEditDualPortraitPassDenoise: Math.min(
    0.85,
    Math.max(0.2, Number(process.env.LOCAL_QWEN_EDIT_DUAL_PORTRAIT_PASS_DENOISE || 0.42)),
  ),
  /** 镜面/反射等超难构图：多几步降翻车 */
  qwenEditComplexSteps: Number(process.env.LOCAL_QWEN_EDIT_COMPLEX_STEPS || 10),
  /** 定妆专用：关 Lightning；默认 20 步换干净半身锁脸图 */
  qwenEditPortraitSteps: Number(process.env.LOCAL_QWEN_EDIT_PORTRAIT_STEPS || 20),
  qwenEditPortraitCfg: Number(process.env.LOCAL_QWEN_EDIT_PORTRAIT_CFG || 3.8),
  /**
   * 分镜/场景 Qwen-Edit 原生长边（再放大到 outputWidth×outputHeight）。
   * 原 832 偏糊；1024 为默认折中；16G+ 可设 1280（LOCAL_QWEN_EDIT_STORYBOARD_MAX_SIDE）。
   */
  qwenEditStoryboardMaxSide: Math.max(512, Number(process.env.LOCAL_QWEN_EDIT_STORYBOARD_MAX_SIDE || 1024)),
  sdxlCheckpoint: process.env.LOCAL_SDXL_CHECKPOINT || 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
  /** 定妆 SDXL 底模（Animagine；单人动漫定妆比 Flux FP8 更稳） */
  sdxlPortraitCheckpoint: process.env.LOCAL_SDXL_PORTRAIT_CHECKPOINT || 'animagine-xl-3.1.safetensors',
  /** FLUX.1-dev FP8 单文件 checkpoint（models/checkpoints/） */
  fluxCheckpoint: process.env.LOCAL_FLUX_CHECKPOINT || 'flux1-dev-fp8.safetensors',
  /** FLUX Redux 风格/身份参考（models/style_models/） */
  fluxReduxModel: process.env.LOCAL_FLUX_REDUX_MODEL || 'flux1-redux-dev.safetensors',
  /** Redux 配套 SigLIP vision（models/clip_vision/） */
  fluxReduxClipVision: process.env.LOCAL_FLUX_REDUX_CLIP_VISION || 'sigclip_vision_patch14_384.safetensors',
  /** Redux 参考强度（0.6～1.0；越高越贴参考图） */
  fluxReduxStrength: Number(process.env.LOCAL_FLUX_REDUX_STRENGTH || 0.82),
  /** 分镜 Redux：弱锁脸（场景由 T5 英文七维主导）；attn_bias；宜 0.15～0.22 */
  fluxReduxStoryboardStrength: Number(process.env.LOCAL_FLUX_REDUX_STORYBOARD_STRENGTH || 0.18),
  fluxReduxStoryboardStrengthType: (process.env.LOCAL_FLUX_REDUX_STORYBOARD_STRENGTH_TYPE || 'attn_bias') as 'multiply' | 'attn_bias',
  /** 分镜 Redux 可选弱锁脸（默认关：Redux 会把定妆肖像构图盖过场景）；开启：LOCAL_FLUX_STORYBOARD_USE_REDUX=true */
  fluxStoryboardUseRedux: (() => {
    if (process.env.LOCAL_FLUX_STORYBOARD_SKIP_REDUX === 'true') return false
    return process.env.LOCAL_FLUX_STORYBOARD_USE_REDUX === 'true'
  })(),
  /** PuLID-Flux 分镜锁脸（默认开：有定妆图且权重就绪时优先于 Redux）；关闭：LOCAL_FLUX_STORYBOARD_USE_PULID=false */
  fluxStoryboardUsePulid: process.env.LOCAL_FLUX_STORYBOARD_USE_PULID !== 'false',
  /** PuLID-Flux 定妆跨阶段参考（默认开：有 reference_images 时锁脸）；关闭：LOCAL_FLUX_PORTRAIT_USE_PULID=false */
  fluxPortraitUsePulid: process.env.LOCAL_FLUX_PORTRAIT_USE_PULID !== 'false',
  /** PuLID 权重（models/pulid/） */
  fluxPulidModel: process.env.LOCAL_FLUX_PULID_MODEL || 'pulid_flux_v0.9.1.safetensors',
  /** EVA-CLIP（models/clip/） */
  fluxPulidEvaClip: process.env.LOCAL_FLUX_PULID_EVA_CLIP || 'EVA02_CLIP_L_336_psz14_s6B.pt',
  /** PuLID 身份强度（0.7～1.2；分镜推荐 0.75～0.85，过高易把定妆正脸 gaze 带进场景） */
  fluxPulidWeight: Number(process.env.LOCAL_FLUX_PULID_WEIGHT || 0.8),
  fluxPulidStartAt: Number(process.env.LOCAL_FLUX_PULID_START_AT || 0),
  /** 分镜 PuLID 结束步（全局默认；分镜见 fluxPulidStoryboardEndAt） */
  fluxPulidEndAt: Number(process.env.LOCAL_FLUX_PULID_END_AT || 0.65),
  /** 分镜专用 PuLID 强度（前段锁脸 + 后段场景；推荐 weight 0.65~0.75 endAt 0.38~0.48） */
  fluxPulidStoryboardWeight: Number(process.env.LOCAL_FLUX_PULID_STORYBOARD_WEIGHT || 0.68),
  fluxPulidStoryboardStartAt: Number(process.env.LOCAL_FLUX_PULID_STORYBOARD_START_AT || 0),
  fluxPulidStoryboardEndAt: Number(process.env.LOCAL_FLUX_PULID_STORYBOARD_END_AT || 0.42),
  /** 分镜 PuLID 参考图仅裁脸（减少定妆站姿污染构图）；关闭：LOCAL_FLUX_PULID_STORYBOARD_FACE_ONLY=false */
  fluxPulidStoryboardFaceOnly: process.env.LOCAL_FLUX_PULID_STORYBOARD_FACE_ONLY !== 'false',
  /** PuLID InsightFace 设备（当前 onnxruntime 若为 CPU 版须用 CPU，否则会 OSError） */
  fluxPulidFaceProvider: (process.env.LOCAL_FLUX_PULID_FACE_PROVIDER || 'CPU').toUpperCase(),
  /** @deprecated 用 USE_REDUX；为 true 时强制不用 Redux */
  fluxStoryboardSkipRedux: process.env.LOCAL_FLUX_STORYBOARD_SKIP_REDUX === 'true',
  /** InstantID ip-adapter（models/instantid/） */
  instantIdModel: process.env.LOCAL_INSTANTID_MODEL || 'ip-adapter.bin',
  /** InstantID ControlNet（models/controlnet/instantid/） */
  instantIdControlNet: process.env.LOCAL_INSTANTID_CONTROLNET || 'instantid/diffusion_pytorch_model.safetensors',
  /** InstantID 身份锁定强度（0.6～1.0） */
  instantIdWeight: Number(process.env.LOCAL_INSTANTID_WEIGHT || 0.8),
  /** InstantID 采样区间（0～1） */
  instantIdStartAt: Number(process.env.LOCAL_INSTANTID_START_AT || 0),
  instantIdEndAt: Number(process.env.LOCAL_INSTANTID_END_AT || 1),
  /** InstantID InsightFace 推理设备（CUDA 显著快于 CPU） */
  instantIdFaceProvider: (process.env.LOCAL_INSTANTID_FACE_PROVIDER || 'CUDA').toUpperCase(),
  /** 电影质感 / 写实摄影 ComfyUI 底模（可选；未配置时仍用 sdxlCheckpoint + 对应 prompt） */
  sdxlRealisticCheckpoint: process.env.LOCAL_SDXL_REALISTIC_CHECKPOINT || process.env.LOCAL_SDXL_CINEMATIC_CHECKPOINT || 'RealVisXL_V4.0.safetensors',
  /** ComfyUI 放大模型（models/upscale_models/）；空则仅 Lanczos 缩放到 outputSize */
  upscaleModel: process.env.LOCAL_UPSCALE_MODEL || 'RealESRGAN_x4plus.pth',
  /** 分镜/场景输出分辨率（先低分辨率生图再放大） */
  outputWidth: Number(process.env.LOCAL_OUTPUT_WIDTH || 1920),
  outputHeight: Number(process.env.LOCAL_OUTPUT_HEIGHT || 1080),
  /** 分镜生图后放大到 outputWidth×outputHeight（ComfyUI ESRGAN；失败则 Sharp 兜底） */
  upscaleStoryboardTo1080p: process.env.LOCAL_COMIC_UPSCALE_1080P !== 'false',
  /** ComfyUI 额外模型根目录（与 extra_model_paths.yaml 的 base_path 一致） */
  comfyModelsBase: process.env.COMFYUI_MODELS_BASE || 'C:\\my\\comfyui\\models',
  /** ComfyUI 生图并发（16G 显存建议 1；多卡或 24G+ 可设 2） */
  comfyImageConcurrency: Math.max(1, Number(process.env.COMFY_IMAGE_CONCURRENCY || 1)),
  voiceboxBaseUrl: (process.env.VOICEBOX_BASE_URL || 'http://127.0.0.1:17493').replace(/\/+$/, ''),
  gptsovitsBaseUrl: (process.env.GPT_SOVITS_BASE_URL || 'http://127.0.0.1:9880').replace(/\/+$/, ''),
  indexTtsRoot: process.env.INDEX_TTS_ROOT || 'C:\\my\\index-tts\\index-tts',
  indexTtsModelDir: process.env.INDEX_TTS_MODEL_DIR || 'C:\\my\\index-tts\\index-tts\\checkpoints',
  /** ACE-Step 1.5 本地配乐 API（scripts/start-ace-step.ps1） */
  aceStepBaseUrl: (process.env.ACE_STEP_BASE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, ''),
  aceStepRoot: process.env.ACE_STEP_ROOT || 'C:\\my\\ace-step\\ACE-Step-1.5',
  /** Wan 图生视频默认 fps（与 wan_* 工作流 CreateVideo 一致） */
  wanVideoFps: Math.max(8, Number(process.env.LOCAL_WAN_FPS || 16)),
  /**
   * Wan 采样帧数上下限（仅控制 Comfy 短动作；成片时长跟旁白/配音走）。
   * 默认最长约 49 帧 ≈ 3s@16fps。
   */
  wanVideoLengthMin: Math.max(17, Number(process.env.LOCAL_WAN_LENGTH_MIN || 25)),
  wanVideoLengthMax: Math.max(25, Number(process.env.LOCAL_WAN_LENGTH_MAX || 49)),
  /**
   * Wan 分辨率（768×432：比 704×400 更稳，仍快于 832×480）。
   * 过低易在运动中崩成竖向拖影/鬼影。
   */
  wanVideoWidth: Math.max(256, Number(process.env.LOCAL_WAN_WIDTH || 768)),
  wanVideoHeight: Math.max(256, Number(process.env.LOCAL_WAN_HEIGHT || 432)),
  /** Wan 采样步数（20：16 步在镜面/复杂构图上易崩） */
  wanVideoSteps: Math.max(4, Number(process.env.LOCAL_WAN_STEPS || 20)),
  /** FusionX I2V UNET（models/diffusion_models/） */
  wanFusionxUnet: process.env.LOCAL_WAN_FUSIONX_UNET || 'Wan14Bi2vFusioniX.safetensors',
  /** FusionX 推荐 6～10 步；cfg=1、shift=2 */
  wanFusionxSteps: Math.max(4, Number(process.env.LOCAL_WAN_FUSIONX_STEPS || 6)),
  wanFusionxCfg: Number(process.env.LOCAL_WAN_FUSIONX_CFG || 1),
  wanFusionxShift: Number(process.env.LOCAL_WAN_FUSIONX_SHIFT || 2),
  /**
   * 成片时长软上限（秒）：有配音时以 TTS 实测为准。
   * 仅防异常超长；可用 LOCAL_WAN_DURATION_MAX 覆盖。
   */
  wanVideoDurationMaxSec: Math.max(12, Number(process.env.LOCAL_WAN_DURATION_MAX || 120)),
  /** Comfy 动作片段最长秒数（短动作 + 冻帧补旁白） */
  wanVideoMotionMaxSec: Math.max(2, Number(process.env.LOCAL_WAN_MOTION_MAX || 3)),
  /**
   * glide-ffmpeg Python（需 torch+CUDA）。默认复用 ComfyUI venv，不另装扩散模型。
   * 覆盖：GLIDE_PYTHON / GLIDE_ROOT
   */
  glidePython: process.env.GLIDE_PYTHON || 'C:\\my\\comfyui\\venv\\Scripts\\python.exe',
  glideRoot: process.env.GLIDE_ROOT || '',
} as const

export const LOCAL_PRESET_SERVICES = [
  {
    serviceType: 'text',
    label: '文本',
    provider: 'zhipu',
    baseUrl: LOCAL_COMIC_ENV.zhipuBaseUrl,
    model: LOCAL_COMIC_ENV.zhipuTextModel,
    priority: 120,
  },
  {
    serviceType: 'image',
    label: '图片',
    provider: 'agnes',
    baseUrl: LOCAL_COMIC_ENV.agnesBaseUrl,
    model: `${LOCAL_COMIC_ENV.agnesImageModel},agnes-image-2.1-flash,agnes-image-2.0-flash,agnes-image-2.0`,
    priority: 120,
  },
  {
    serviceType: 'image',
    label: '图片',
    provider: 'zhipu',
    baseUrl: LOCAL_COMIC_ENV.zhipuBaseUrl,
    model: `${LOCAL_COMIC_ENV.zhipuImageModel},cogview-3-flash`,
    priority: 110,
  },
  {
    serviceType: 'video',
    label: '视频',
    provider: 'zhipu',
    baseUrl: LOCAL_COMIC_ENV.zhipuBaseUrl,
    model: `${LOCAL_COMIC_ENV.zhipuVideoModel},cogvideox-flash`,
    priority: 118,
  },
  {
    serviceType: 'audio',
    label: '音频',
    provider: 'edge',
    baseUrl: 'local://edge-tts',
    model: 'edge-tts',
    priority: 107,
  },
] as const

export function isLocalComicMode(mode?: ProductionMode | string | null): boolean {
  return mode === LOCAL_COMIC_PRODUCTION_MODE
}

export function buildLocalComicDramaMetadata(): string {
  return JSON.stringify({
    production_mode: LOCAL_COMIC_PRODUCTION_MODE,
    local_comic: {
      model_stages: ['llm', 'image', 'video', 'audio'],
    },
  })
}

/** 本地漫剧 AI 写稿：完整稿字数下限 */
export const LOCAL_COMIC_SCRIPT_MIN_CHARS = 2_000

/** 本地短剧「剧本生成」AI 对话写剧本系统提示 */
export const LOCAL_COMIC_SCRIPT_CHAT_SYSTEM = [
  '你是本地短剧流水线编剧，写可直接进入「原始内容 → AI 改写 → 提取角色 → 分配音色 → 分镜 → 生图 → 视频 → 配音」的短剧剧本原文。',
  '',
  '【题材与风格】',
  '- 竖屏短剧：节奏快、钩子强、对白利落，适合单集或连载。',
  '- 可写都市、悬疑、逆袭、甜宠等；细节具体，场景可拍、可画。',
  '',
  '【篇幅】',
  `- **用户指定字数时以用户为准**：如「写1000字」，须按该目标输出（约 ±15%），禁止擅自写成默认长稿。`,
  `- 用户未指定时，全文不少于 ${LOCAL_COMIC_SCRIPT_MIN_CHARS} 汉字，建议 3000～8000 字；不足须扩写，超出可精简。`,
  '',
  '【输出格式】',
  '- 纯文本，不要 markdown、不要分点列表或标题层级。',
  '- 对话行用「角色名：台词」；旁白可用「旁白：…」。',
  '- 场景转换用空行分隔；可穿插简短动作/环境描写，不要写镜头术语（推镜、特写等）。',
  '- 不要写「大家好」「点赞关注」等引流话术。',
  '',
  '【多轮改稿】',
  '- 支持多轮：用户可说「改第二幕」「补对白」「缩短」等，须结合【当前台本】输出修改后的完整稿，不要只解释或给 diff。',
  '- 若【当前台本】已有内容，在其基础上改，勿另起新故事。',
  '',
  '闲聊、选题讨论时可正常对话，不必强行输出整稿。',
].join('\n')

/** 本地漫剧角色「AI 配图描述」— 界面展示中文 + English tags；ComfyUI 生图仅使用 English tags */
export const LOCAL_COMIC_CHARACTER_APPEARANCE_SYSTEM = [
  '你是本地漫剧角色定妆助理，为创作者撰写「AI 配图描述」。',
  '',
  '【画风与构图】',
  `- ${PORTRAIT_REFERENCE_IMAGE_LAYOUT_CN}。`,
  '- 双手自然下垂，不拿道具（道具留到分镜配图）。',
  '',
  '【内容】',
  '- 根据剧本中该角色的情节、对白、行为推断外貌，与时代、题材一致。',
  `- ${PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE}`,
  '- 一人一图：只写该角色统一定妆形象；禁止拆青年/老年等多形态。',
  '- 不要写镜头术语；English tags 与中文外貌一致。',
  '- 只写可视特征：年龄、性别、发型、五官、服装颜色与款式、体型；80～150 字。',
  '- 结尾须含「正面半身标准站姿，头到胸口完整入镜，双手自然下垂」。',
  '',
  '【输出格式】',
  '- 第一段：纯中文外貌描述（供界面展示与编辑）',
  '- 换行后第二段：English tags: 英文逗号分隔（脸型/发型/服装/配饰，供本地 ComfyUI 生图；用 adult 勿用 mature，勿写画风词）',
  '- 禁止 markdown、JSON、标题；English tags 行须写具体英文词，勿写画风/艺术风格词。',
  '',
  '示例：',
  '28岁男性，国字方正脸浓眉，黑色短寸头，穿白色T恤，正面半身标准站姿，头到胸口完整入镜，双手自然下垂。',
  'English tags: 28-year-old male, square jaw anime face, thick brows, black buzz cut, white t-shirt, chest-up upper body, arms at sides',
].join('\n')
