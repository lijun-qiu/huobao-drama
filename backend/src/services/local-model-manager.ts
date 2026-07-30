/**
 * 本地模型阶段调度 — 严格互斥，同一时刻只保留一个阶段的 GPU 大模型
 *
 * 规则：
 * - LLM / 生图 / 生视频 / 配音 四阶段互斥，切换时卸载其余（含进行中的 ComfyUI / Ollama）
 * - 生图 ↔ 生视频 切换时释放 ComfyUI 显存以便加载不同工作流
 * - idle → 全部卸载
 */
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { LOCAL_COMIC_ENV, DEFAULT_LOCAL_TTS_ENGINE, type LocalModelStage, type LocalTtsEngine } from '../constants/local-comic.js'
import { DEFAULT_LOCAL_AGENT_MODEL, DEFAULT_LOCAL_TEXT_MODEL, LOCAL_TEXT_MODEL_OPTIONS } from '../constants/text-models.js'
import { checkEdgeTtsAvailable } from './edge-tts-local.js'
import { checkGptSovitsHealth } from './gpt-sovits-tts.js'
import { checkIndexTtsHealth } from './index-tts-tts.js'
import { checkVoiceboxHealth } from './voicebox-tts.js'
import { ensureComfyUIRunning, ensureGptSovitsRunning, ensureOllamaRunning, restartComfyUI as restartComfyUIProcess } from './local-service-starter.js'

let currentStage: LocalModelStage = 'idle'
let ollamaActive = false
let comfyActive = false
let comfyStage: 'image' | 'video' | null = null
let lastOllamaModel = LOCAL_COMIC_ENV.ollamaTextModel
let lastTtsEngine: LocalTtsEngine = DEFAULT_LOCAL_TTS_ENGINE
/** 进行中的 Ollama 推理请求数（流式/Agent 等） */
let ollamaUseCount = 0

export type LocalModelStageOptions = {
  ollamaModel?: string
  ttsEngine?: LocalTtsEngine
  /** wan_i2v | wan_i2v_fusionx | wan_flf2v — 顶栏所选本地生视频工作流 */
  comfyVideoModel?: string
  /**
   * Glide / KenBurns 等轻量运镜：只卸载 Ollama/Comfy，不启动 Comfy、不加载 Wan。
   * 生成视频阶段不跑其它模型时不会抢显存。
   */
  lightMotion?: boolean
}

let lastComfyVideoModel = 'wan_i2v'

export function getActiveComfyVideoModel(): string {
  return lastComfyVideoModel
}

const VALID_COMFY_VIDEO_MODELS = new Set(['wan_i2v', 'wan_i2v_fusionx', 'wan_flf2v'])

function normalizeComfyVideoModel(raw?: string | null): string {
  const v = String(raw || '').trim().toLowerCase()
  if (VALID_COMFY_VIDEO_MODELS.has(v)) return v
  if (v.includes('fusionx')) return 'wan_i2v_fusionx'
  if (v.includes('flf')) return 'wan_flf2v'
  return 'wan_i2v'
}

async function comfyPost(path: string, body?: Record<string, unknown>) {
  const resp = await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    throw new Error(`ComfyUI ${path} failed: ${resp.status}`)
  }
  return resp.json().catch(() => ({}))
}

export async function checkComfyUIOnline(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}/system_stats`, { signal: AbortSignal.timeout(5_000) })
    return resp.ok
  } catch {
    return false
  }
}

export async function checkOllamaOnline(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
    return resp.ok
  } catch {
    return false
  }
}

export function beginOllamaUse() {
  ollamaUseCount++
}

export function endOllamaUse() {
  ollamaUseCount = Math.max(0, ollamaUseCount - 1)
}

export function isOllamaBusy(): boolean {
  return ollamaUseCount > 0
}

/** ComfyUI 队列有等待或执行中的任务 */
export async function isComfyUIBusy(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}/queue`, { signal: AbortSignal.timeout(5_000) })
    if (!resp.ok) return false
    const json = await resp.json() as { queue_running?: unknown[]; queue_pending?: unknown[] }
    return (json.queue_running?.length ?? 0) > 0 || (json.queue_pending?.length ?? 0) > 0
  } catch {
    return false
  }
}

let lastComfyWorkflowFamily: 'flux' | 'kolors' | 'qwen' | 'sdxl' | 'wan' | null = null

function comfyFamilyNeedsRestart(from: typeof lastComfyWorkflowFamily, to: NonNullable<typeof lastComfyWorkflowFamily>): boolean {
  if (!from || from === to) return false
  const heavy = new Set(['flux', 'kolors', 'qwen'])
  return heavy.has(from) || heavy.has(to)
}

/** Flux / Kolors / Qwen / SDXL / Wan 切换前释放 ComfyUI 显存，避免 model_size NoneType 崩溃 */
export async function ensureComfyWorkflowFamily(family: 'flux' | 'kolors' | 'qwen' | 'sdxl' | 'wan') {
  if (lastComfyWorkflowFamily && lastComfyWorkflowFamily !== family) {
    logTaskProgress('LocalModel', 'comfy-checkpoint-swap', { from: lastComfyWorkflowFamily, to: family })
    if (comfyFamilyNeedsRestart(lastComfyWorkflowFamily, family)) {
      await restartComfyUI()
    } else {
      await freeComfyUIMemory()
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  lastComfyWorkflowFamily = family
}

export async function restartComfyUI(): Promise<void> {
  lastComfyWorkflowFamily = null
  await restartComfyUIProcess()
}

export async function freeComfyUIMemory(options?: { force?: boolean }) {
  try {
    if (!options?.force && await isComfyUIBusy()) {
      logTaskWarn('LocalModel', 'comfy-free-skipped-busy', {
        hint: 'ComfyUI 队列非空，跳过 /interrupt+/free，避免定妆/配图 execution_interrupted',
      })
      return false
    }
    await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(5_000) }).catch(() => {})
    await comfyPost('/free', { unload_models: true, free_memory: true })
    lastComfyWorkflowFamily = null
    logTaskProgress('LocalModel', 'comfyui-freed', {})
    return true
  } catch (err) {
    logTaskWarn('LocalModel', 'comfyui-free-failed', { error: (err as Error).message })
    return false
  }
}

export async function unloadOllamaModel(model = lastOllamaModel) {
  if (!model) return
  try {
    await fetch(`${LOCAL_COMIC_ENV.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0 }),
      signal: AbortSignal.timeout(30_000),
    })
    logTaskProgress('LocalModel', 'ollama-unloaded', { model })
  } catch (err) {
    logTaskWarn('LocalModel', 'ollama-unload-failed', { model, error: (err as Error).message })
  }
}

const CLOUD_TEXT_MODELS = new Set([
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openrouter/deepseek-v4-flash:free',
  'openrouter/deepseek-v4-flash',
  'openrouter/deepseek-v4-pro',
  'deepseek-v4-flash:free',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'qwen3.5-plus',
  'gpt-4o',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'google/gemini-3-flash-preview',
  'gpt-4.1-mini',
])

async function listOllamaModelNames(): Promise<string[]> {
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(8_000) })
    if (!resp.ok) return []
    const json = await resp.json() as { models?: Array<{ name: string }> }
    return (json.models || []).map(m => m.name).filter(Boolean)
  } catch {
    return []
  }
}

/** 预加载用：云端模型名或未安装的模型自动回落到本机已 pull 的 Ollama 模型 */
export async function resolveOllamaPreloadModel(requested?: string | null): Promise<string> {
  const raw = String(requested || '').trim()
  const installed = await listOllamaModelNames()
  const pickInstalled = (name: string) => installed.some(m =>
    m === name || m.startsWith(`${name}:`) || m.startsWith(`${name}-`),
  )

  if (raw && !CLOUD_TEXT_MODELS.has(raw) && (installed.length === 0 || pickInstalled(raw))) {
    return raw
  }

  const preferred = [
    raw,
    lastOllamaModel,
    DEFAULT_LOCAL_TEXT_MODEL,
    DEFAULT_LOCAL_AGENT_MODEL,
    LOCAL_COMIC_ENV.ollamaAgentModel,
    LOCAL_COMIC_ENV.ollamaTextModel,
    ...LOCAL_TEXT_MODEL_OPTIONS.map(o => o.value),
  ].filter(Boolean) as string[]

  for (const candidate of preferred) {
    if (CLOUD_TEXT_MODELS.has(candidate)) continue
    if (installed.length === 0 || pickInstalled(candidate)) return candidate
  }

  if (installed.length) return installed[0]
  return DEFAULT_LOCAL_TEXT_MODEL
}

export async function preloadOllamaModel(model = lastOllamaModel) {
  const resolved = await resolveOllamaPreloadModel(model)
  lastOllamaModel = resolved
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: resolved, prompt: ' ', stream: false, keep_alive: '30m' }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      throw new Error(`Ollama preload failed: ${resp.status}${detail ? ` — ${detail.slice(0, 120)}` : ''}（模型 ${resolved} 可能未安装，请 ollama pull ${resolved}）`)
    }
    logTaskProgress('LocalModel', 'ollama-preloaded', { model: resolved })
  } catch (err) {
    logTaskWarn('LocalModel', 'ollama-preload-failed', { model: resolved, error: (err as Error).message })
    throw err
  }
}

export function getLocalModelStage(): LocalModelStage {
  return currentStage
}

function resolveLoadedStages(): LocalModelStage[] {
  const loaded: LocalModelStage[] = []
  if (ollamaActive) loaded.push('llm')
  if (comfyActive && comfyStage) loaded.push(comfyStage)
  if (currentStage === 'audio' && !ollamaActive && !comfyActive) loaded.push('audio')
  return loaded
}

/** 仅切换阶段（导航栏切换用，不预加载）；空闲侧显存按需释放 */
export async function prepareLocalModelStage(stage: LocalModelStage, options?: LocalModelStageOptions) {
  if (options?.comfyVideoModel) {
    lastComfyVideoModel = normalizeComfyVideoModel(options.comfyVideoModel)
  }

  if (stage === 'idle') {
    if (ollamaActive) await unloadOllamaModel(lastOllamaModel)
    if (comfyActive) {
      const freed = await freeComfyUIMemory()
      if (!freed && await isComfyUIBusy()) {
        throw new Error('ComfyUI 正在生图/生视频，请等待完成后再卸载本地模型')
      }
    }
    ollamaActive = false
    comfyActive = false
    comfyStage = null
    currentStage = 'idle'
    return
  }

  if (stage === 'llm') {
    if (options?.ollamaModel) {
      const next = options.ollamaModel
      if (ollamaActive && next !== lastOllamaModel) {
        await unloadOllamaModel(lastOllamaModel)
      }
      lastOllamaModel = next
    }
    if (comfyActive) {
      if (await isComfyUIBusy()) {
        throw new Error('ComfyUI 正在生图/生视频，请等待完成后再切换到 LLM（否则会打断定妆/配图）')
      }
      logTaskProgress('LocalModel', 'comfy-release-for-llm', {})
      await freeComfyUIMemory({ force: true })
      comfyActive = false
      comfyStage = null
    }
    ollamaActive = true
    currentStage = 'llm'
    return
  }

  if (stage === 'video' && options?.lightMotion) {
    if (ollamaActive || isOllamaBusy()) {
      if (isOllamaBusy()) {
        logTaskWarn('LocalModel', 'ollama-force-unload', { switching_to: 'video-light' })
      }
      await unloadOllamaModel(lastOllamaModel)
      ollamaActive = false
    }
    if (comfyActive) {
      if (await isComfyUIBusy()) {
        throw new Error('ComfyUI 正在生图/生视频，请等待完成后再切换轻量运镜')
      }
      logTaskProgress('LocalModel', 'comfy-release-for-light-motion', {})
      await freeComfyUIMemory({ force: true })
      comfyActive = false
      comfyStage = null
    }
    currentStage = 'video'
    return
  }

  if (stage === 'image' || stage === 'video') {
    if (ollamaActive || isOllamaBusy()) {
      if (isOllamaBusy()) {
        logTaskWarn('LocalModel', 'ollama-force-unload', { switching_to: stage })
      }
      await unloadOllamaModel(lastOllamaModel)
      ollamaActive = false
    }
    if (comfyActive && comfyStage && comfyStage !== stage) {
      if (await isComfyUIBusy()) {
        throw new Error(`ComfyUI 正在执行任务，请等待完成后再切换到${stage === 'image' ? '生图' : '视频'}`)
      }
      logTaskProgress('LocalModel', 'comfy-swap', { from: comfyStage, to: stage })
      await freeComfyUIMemory({ force: true })
    }
    if (stage === 'video' && options?.comfyVideoModel) {
      lastComfyVideoModel = normalizeComfyVideoModel(options.comfyVideoModel)
    }
    comfyActive = true
    comfyStage = stage
    currentStage = stage
    return
  }

  if (stage === 'audio') {
    logTaskProgress('LocalModel', 'stage-switch', { from: resolveLoadedStages(), to: stage })
    if (ollamaActive || isOllamaBusy()) {
      if (isOllamaBusy()) {
        logTaskWarn('LocalModel', 'ollama-force-unload', { switching_to: 'audio' })
      }
      await unloadOllamaModel(lastOllamaModel)
    }
    if (comfyActive) {
      if (await isComfyUIBusy()) {
        throw new Error('ComfyUI 正在生图/生视频，请等待完成后再切换到配音')
      }
      await freeComfyUIMemory({ force: true })
    }
    ollamaActive = false
    comfyActive = false
    comfyStage = null
    if (options?.ttsEngine) lastTtsEngine = options.ttsEngine
    currentStage = 'audio'
  }
}

/**
 * 生成任务前确保本地模型就绪：切换阶段 + 检查服务在线 + LLM 预加载
 */
export async function ensureLocalModelStage(
  stage: LocalModelStage,
  options?: LocalModelStageOptions,
) {
  if (stage === 'idle') {
    await prepareLocalModelStage('idle')
    return
  }

  await prepareLocalModelStage(stage, options)

  if (stage === 'llm') {
    await ensureOllamaRunning()
    const resolved = await resolveOllamaPreloadModel(options?.ollamaModel || lastOllamaModel)
    await preloadOllamaModel(resolved)
    return
  }

  if (stage === 'video' && options?.lightMotion) {
    // Glide/KenBurns：不启动 Comfy、不加载 Wan
    return
  }

  if (stage === 'image' || stage === 'video') {
    await ensureComfyUIRunning()
    return
  }

  if (stage === 'audio') {
    const engine = options?.ttsEngine || lastTtsEngine
    lastTtsEngine = engine
    if (engine === 'voicebox') {
      const health = await checkVoiceboxHealth()
      if (!health.ok) {
        throw new Error(health.error || 'Voicebox 未启动，请先启动 Voicebox 桌面应用（默认 http://127.0.0.1:17493）')
      }
      if (!health.model_loaded) {
        logTaskProgress('LocalModel', 'voicebox-warmup', { model_loaded: health.model_loaded })
      }
      return
    }
    if (engine === 'gptsovits') {
      await ensureGptSovitsRunning()
      return
    }
    if (engine === 'indextts') {
      const health = await checkIndexTtsHealth({ force: true })
      if (!health.ok) {
        throw new Error(health.error || 'IndexTTS2 未就绪，请运行 scripts/setup-index-tts.ps1')
      }
      return
    }
    if (!(await checkEdgeTtsAvailable())) {
      throw new Error('Edge TTS 未安装，请执行 pip install edge-tts 并确保 edge-tts 在 PATH 中')
    }
  }
}

export function isLocalTextProvider(provider?: string | null): boolean {
  return String(provider || '').toLowerCase() === 'ollama'
}

export function isLocalImageProvider(provider?: string | null): boolean {
  return String(provider || '').toLowerCase() === 'comfyui'
}

export function isLocalVideoProvider(provider?: string | null): boolean {
  return String(provider || '').toLowerCase() === 'comfyui'
}

export function isLocalAudioProvider(provider?: string | null): boolean {
  const p = String(provider || '').toLowerCase()
  return p === 'edge' || p === 'voicebox' || p === 'gptsovits' || p === 'indextts'
}

export async function getLocalModelStatus() {
  const status: Record<string, unknown> = {
    stage: currentStage,
    tts_engine: lastTtsEngine,
    comfy_base_url: LOCAL_COMIC_ENV.comfyBaseUrl,
    ollama_base_url: LOCAL_COMIC_ENV.ollamaBaseUrl,
    voicebox_base_url: LOCAL_COMIC_ENV.voiceboxBaseUrl,
    gptsovits_base_url: LOCAL_COMIC_ENV.gptsovitsBaseUrl,
    ollama_model: lastOllamaModel,
    comfy_video_model: lastComfyVideoModel,
    loaded_stages: resolveLoadedStages(),
    ollama_loaded: ollamaActive,
    comfy_loaded: comfyActive,
    automation: {
      llm: '互斥：加载 Ollama LLM，卸载 ComfyUI 生图/生视频',
      image: '互斥：准备 ComfyUI 生图，卸载 Ollama',
      video: '互斥：Wan 时准备 ComfyUI；Glide/轻量运镜仅卸载其它模型、不加载 Wan',
      audio: '互斥：配音前卸载 Ollama 与 ComfyUI（Edge / Voicebox / GPT-SoVITS / IndexTTS2）',
      idle: '卸载 Ollama 与 ComfyUI 大模型',
    },
  }

  status.comfyui_online = await checkComfyUIOnline()
  status.comfyui_busy = await isComfyUIBusy()
  status.ollama_online = await checkOllamaOnline()
  status.ollama_busy = isOllamaBusy()
  status.edge_tts_online = await checkEdgeTtsAvailable()
  const voiceboxHealth = await checkVoiceboxHealth()
  status.voicebox_online = voiceboxHealth.ok
  status.voicebox_model_loaded = voiceboxHealth.model_loaded ?? false
  const gptsovitsHealth = await checkGptSovitsHealth()
  status.gptsovits_online = gptsovitsHealth.ok
  status.gptsovits_voice_count = gptsovitsHealth.voice_count ?? 0
  const skipIndexTtsHeavyCheck = currentStage === 'image'
    || currentStage === 'video'
    || comfyActive
    || !!status.comfyui_busy
  const indexttsHealth = await checkIndexTtsHealth({ skipHeavy: skipIndexTtsHeavyCheck })
  status.indextts_online = indexttsHealth.ok
  status.indextts_health_cached = !!indexttsHealth.cached

  if (status.ollama_online) {
    try {
      const resp = await fetch(`${LOCAL_COMIC_ENV.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
      if (resp.ok) {
        const json = await resp.json() as { models?: Array<{ name: string }> }
        status.ollama_models = (json.models || []).map(m => m.name)
      }
    } catch {
      // ignore
    }
  }

  return status
}
