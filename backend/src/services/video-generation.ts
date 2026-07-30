import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import ffmpeg from 'fluent-ffmpeg'
import { getActiveConfig, getConfigById, ensureZhipuVideoConfig } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, getAbsolutePath, readImageAsCompressedDataUrl } from '../utils/storage.js'
import { getVideoAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { ensureComfyWorkflowFamily, ensureLocalModelStage, getActiveComfyVideoModel } from './local-model-manager.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { DEFAULT_LOCAL_VIDEO_MODEL, isZhipuVideoModel } from '../constants/video-models.js'
import {
  copyComfyVideoOutput,
  injectWanFlf2vWorkflow,
  injectWanI2vWorkflow,
  loadWorkflowTemplate,
  queueComfyPrompt,
  uploadImageToComfyInput,
  waitForComfyPrompt,
  waitForComfyServer,
} from './comfyui-client.js'
import {
  buildComposeUnitMergedTtsText,
  findComposeUnitMembers,
  renderKenBurnsClip,
} from './ffmpeg-compose.js'
import { renderGlideClip } from './glide-ffmpeg.js'
import {
  parseNarrationImageMeta,
  resolveStoryboardImageAnchorShot,
  resolveStoryboardVisualSource,
} from './narration-image.js'

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt?: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  duration?: number
  aspectRatio?: string
  configId?: number
}

function isWanVideoModel(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  return m === 'wan_i2v' || m === 'wan_flf2v' || m.startsWith('wan_') || m.includes('wan2')
}

function isKenBurnsVideoModel(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  return (
    m === 'glide'
    || m === 'glide-ffmpeg'
    || m === 'kenburns'
    || m === 'ffmpeg'
    || m === 'ffmpeg_motion'
    || m === 'gif'
    || m === 'light'
  )
}

function prefersGlideMotion(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  // 默认动图风走 glide；显式 kenburns 仍用 FFmpeg zoompan
  if (m === 'kenburns' || m === 'ffmpeg' || m === 'ffmpeg_motion') return false
  return true
}

function resolveVideoConfig(params: GenerateVideoParams): AIConfig {
  if (params.configId) {
    const config = getConfigById(params.configId)
    if (config) {
      if (isZhipuVideoModel(params.model) || isZhipuVideoModel(config.model)) {
        return ensureZhipuVideoConfig(params.model || config.model)
      }
      return config
    }
  }
  if (isKenBurnsVideoModel(params.model)) {
    const m = String(params.model || '').toLowerCase()
    return {
      provider: 'ffmpeg',
      baseUrl: '',
      apiKey: '',
      model: prefersGlideMotion(m) ? 'glide' : 'kenburns',
    }
  }
  // 未指定 / 智谱模型：默认免费 CogVideoX-Flash
  if (!params.model || isZhipuVideoModel(params.model)) {
    return ensureZhipuVideoConfig(params.model || DEFAULT_LOCAL_VIDEO_MODEL)
  }
  if (isWanVideoModel(params.model)) {
    return {
      provider: 'comfyui',
      baseUrl: LOCAL_COMIC_ENV.comfyBaseUrl,
      apiKey: '',
      model: String(params.model || getActiveComfyVideoModel() || 'wan_i2v'),
    }
  }
  const active = getActiveConfig('video')
  if (active) {
    if (String(active.provider).toLowerCase() === 'zhipu' || String(active.provider).toLowerCase() === 'bigmodel') {
      return ensureZhipuVideoConfig(params.model || active.model)
    }
    return {
      ...active,
      model: params.model || active.model,
    }
  }
  return ensureZhipuVideoConfig(params.model || DEFAULT_LOCAL_VIDEO_MODEL)
}

function loadEpisodeStoryboardsForShot(sb: typeof schema.storyboards.$inferSelect) {
  if (!sb?.episodeId) return [sb]
  return db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
}

function cleanWanPromptText(raw: string): string {
  return String(raw || '')
    .replace(/\*\*/g, '')
    .replace(/旁白\s*[:：]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 合成单元配图（锚点镜 inherit 链上的 composedImage） */
function resolveComposeUnitVisual(
  sb: typeof schema.storyboards.$inferSelect,
  episodeStoryboards: typeof schema.storyboards.$inferSelect[],
): {
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
} {
  const visual = resolveStoryboardVisualSource(episodeStoryboards, sb.id)
  const anchor = resolveStoryboardImageAnchorShot(episodeStoryboards, sb.id) ?? sb
  const imageUrl = String(visual?.path || anchor.composedImage || anchor.firstFrameImage || '').trim() || undefined
  const firstFrameUrl = String(anchor.firstFrameImage || anchor.composedImage || imageUrl || '').trim() || undefined
  const lastFrameUrl = String(sb.lastFrameImage || anchor.lastFrameImage || '').trim() || undefined
  return {
    imageUrl: imageUrl || firstFrameUrl,
    firstFrameUrl,
    lastFrameUrl,
  }
}

/** 段落旁白 + 配图场景描述 → Wan 提示词 */
function buildVideoPromptFromComposeUnit(
  sb: typeof schema.storyboards.$inferSelect,
  episodeStoryboards: typeof schema.storyboards.$inferSelect[],
): string {
  const existing = String(sb.videoPrompt || '').trim()
  if (existing) return existing

  const anchor = resolveStoryboardImageAnchorShot(episodeStoryboards, sb.id) ?? sb
  const meta = parseNarrationImageMeta(anchor.referenceImages)
  const paragraph = cleanWanPromptText(
    buildComposeUnitMergedTtsText(sb.id, episodeStoryboards)
      || String(sb.dialogue || sb.description || '').trim(),
  )
  const imageScene = cleanWanPromptText(
    String(
      anchor.imagePrompt
      || meta.image_prompt_llm_raw
      || meta.scene_content
      || anchor.description
      || '',
    ).trim(),
  )

  const paraClip = paragraph.slice(0, 90)
  const sceneClip = imageScene.slice(0, 110)
  if (sceneClip && paraClip) {
    return `${sceneClip}。旁白情境：${paraClip}。画面与配图一致，角色轻微自然动作，镜头稳定，动漫风格`
  }
  if (paraClip) {
    return `旁白情境：${paraClip}。画面与配图一致，角色轻微自然动作，镜头稳定，动漫风格`
  }
  if (sceneClip) {
    return `${sceneClip}。画面轻微自然运动，镜头稳定，动漫风格`
  }
  return '画面与配图一致，角色轻微自然动作，镜头稳定，动漫风格'
}

/** 合成单元时长：优先累加各句 TTS 实测，否则按字数估 */
async function estimateComposeUnitDurationSec(
  storyboardId: number,
  episodeStoryboards: typeof schema.storyboards.$inferSelect[],
): Promise<number> {
  const members = findComposeUnitMembers(storyboardId, episodeStoryboards)
  const list = members.length ? members : episodeStoryboards.filter(s => s.id === storyboardId)
  let sum = 0
  for (const m of list) {
    const url = String(m.ttsAudioUrl || '').trim()
    if (url) {
      const abs = getAbsolutePath(url)
      if (fs.existsSync(abs)) {
        sum += await probeMediaDuration(abs).catch(() => 0)
        continue
      }
    }
    const text = String(m.dialogue || '').replace(/^.+?[:：]\s*/, '').replace(/\*\*/g, '').replace(/\s/g, '')
    sum += Math.max(2, Math.min(12, Math.ceil(text.length / 4.5) || 3))
  }
  if (sum <= 0) return 3
  return Math.min(
    LOCAL_COMIC_ENV.wanVideoDurationMaxSec,
    Math.max(2, Math.round(sum * 10) / 10),
  )
}

/** 合成单元配音：优先整段共用一条；否则取单元内第一条可用 TTS */
function resolveComposeUnitTtsAudio(
  storyboardId: number,
  episodeStoryboards: typeof schema.storyboards.$inferSelect[],
): string {
  const members = findComposeUnitMembers(storyboardId, episodeStoryboards)
  const list = members.length ? members : episodeStoryboards.filter(s => s.id === storyboardId)
  const urls = list.map(m => String(m.ttsAudioUrl || '').trim()).filter(Boolean)
  if (!urls.length) return ''
  const unique = new Set(urls)
  if (unique.size === 1) return urls[0]
  // 各句独立配音时，先用首句（finalize 里按该音轨时长对齐；完整拼接留给镜头合成）
  return urls[0]
}

/** duration(秒) → Wan 采样帧数：只生成短动作片段，成片时长由旁白/配音决定 */
export function wanDurationToLength(durationSec?: number | null): number {
  const fps = LOCAL_COMIC_ENV.wanVideoFps
  const min = LOCAL_COMIC_ENV.wanVideoLengthMin
  const max = LOCAL_COMIC_ENV.wanVideoLengthMax
  const motionCap = LOCAL_COMIC_ENV.wanVideoMotionMaxSec
  const sec = Number(durationSec)
  const targetSec = Number.isFinite(sec) && sec > 0
    ? Math.min(motionCap, Math.max(2, sec))
    : Math.min(motionCap, 3)
  let frames = Math.round(targetSec * fps)
  if (frames % 2 === 0) frames += 1
  return Math.min(max, Math.max(min, frames))
}

function resolveStoryboardImage(sb: typeof schema.storyboards.$inferSelect | undefined): {
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
} {
  if (!sb) return {}
  const episodeSbs = loadEpisodeStoryboardsForShot(sb)
  return resolveComposeUnitVisual(sb, episodeSbs)
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const ts = now()
  const config = resolveVideoConfig(params)

  let prompt = String(params.prompt || '').trim()
  let imageUrl = params.imageUrl
  let firstFrameUrl = params.firstFrameUrl
  let lastFrameUrl = params.lastFrameUrl
  let duration = params.duration || 5
  let storyboard: typeof schema.storyboards.$inferSelect | undefined

  if (params.storyboardId) {
    const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, params.storyboardId)).all()
    storyboard = sb
    if (sb) {
      const episodeSbs = loadEpisodeStoryboardsForShot(sb)
      if (!prompt) prompt = buildVideoPromptFromComposeUnit(sb, episodeSbs)
      const imgs = resolveComposeUnitVisual(sb, episodeSbs)
      if (!imageUrl) imageUrl = imgs.imageUrl
      if (!firstFrameUrl) firstFrameUrl = imgs.firstFrameUrl
      if (!lastFrameUrl) lastFrameUrl = imgs.lastFrameUrl
      if (!params.duration) {
        duration = await estimateComposeUnitDurationSec(sb.id, episodeSbs)
      }
    }
  }
  if (!prompt) prompt = '画面轻微运动，镜头稳定，动作自然流畅，动漫风格，高清细节'

  const model = String(params.model || config.model || DEFAULT_LOCAL_VIDEO_MODEL)

  const res = db.insert(schema.videoGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt,
    model,
    provider: config.provider,
    referenceMode: params.referenceMode || 'none',
    imageUrl,
    firstFrameUrl,
    lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls ? JSON.stringify(params.referenceImageUrls) : null,
    duration,
    aspectRatio: params.aspectRatio || '16:9',
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('VideoTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    model,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'none',
    duration,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id: lastId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params: { ...params, prompt, imageUrl, firstFrameUrl, lastFrameUrl, duration, model },
  })
  processVideoGeneration(lastId, { ...config, model }).catch(err => {
    logTaskError('VideoTask', 'process', { id: lastId, error: err.message })
    console.error(`Video generation ${lastId} failed:`, err)
  })
  return lastId
}

async function processVideoGeneration(id: number, config: AIConfig) {
  if (isKenBurnsVideoModel(config.model) || config.provider.toLowerCase() === 'ffmpeg') {
    await processKenBurnsVideoGeneration(id, config)
    return
  }
  if (config.provider.toLowerCase() === 'comfyui' || isWanVideoModel(config.model)) {
    await processComfyUIVideoGeneration(id, config)
    return
  }

  const adapter = getVideoAdapter(config.provider)

  try {
    const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return
    logTaskProgress('VideoTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      referenceMode: record.referenceMode,
    })

    const resolvedImageUrl = await normalizeVideoReferenceUrl(record.imageUrl)
    const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(record.firstFrameUrl)
    const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(record.lastFrameUrl)
    const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(record.referenceImageUrls)

    // 使用 Adapter 构建请求
    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: resolvedImageUrl,
      firstFrameUrl: resolvedFirstFrameUrl,
      lastFrameUrl: resolvedLastFrameUrl,
      referenceImageUrls: resolvedReferenceImageUrls ? JSON.stringify(resolvedReferenceImageUrls) : null,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
    })
    logTaskProgress('VideoTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
      referenceMode: record.referenceMode,
    })
    logTaskPayload('VideoTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    const resp = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any

    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl })
      // 同步模式
      await handleVideoComplete(id, videoUrl, record.duration)
      return
    }

    // 异步模式：更新 taskId，开始轮询
    db.update(schema.videoGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'poll-start', { id, taskId, provider: config.provider })

    // Vidu 没有轮询端点，跳过轮询（依赖 Webhook 回调）
    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return
    }

    pollVideoTask(id, config, taskId!, record.storyboardId)
  } catch (err: any) {
    logTaskError('VideoTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

async function processKenBurnsVideoGeneration(id: number, config: AIConfig) {
  try {
    const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return

    const useGlide = prefersGlideMotion(config.model || record.model)
    db.update(schema.videoGenerations)
      .set({
        status: 'processing',
        errorMsg: useGlide
          ? '正在用 Glide 生成亚像素运镜（不加载 Wan）…'
          : '正在生成动图风动态（FFmpeg 推拉）…',
        updatedAt: now(),
      })
      .where(eq(schema.videoGenerations.id, id))
      .run()

    let imageUrl = record.imageUrl
    let firstFrameUrl = record.firstFrameUrl
    if (record.storyboardId) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, record.storyboardId)).all()
      if (sb) {
        const imgs = resolveStoryboardImage(sb)
        if (!imageUrl) imageUrl = imgs.imageUrl || null
        if (!firstFrameUrl) firstFrameUrl = imgs.firstFrameUrl || null
      }
    }
    const src = String(imageUrl || firstFrameUrl || '').trim()
    if (!src) throw new Error('轻量动态需要参考图（请先生成配图）')

    const duration = Math.max(2, Number(record.duration) || 3)
    const tag = useGlide ? 'glide' : 'kenburns'
    const silentRel = `static/videos/${uuid()}-${tag}-silent.mp4`
    const silentAbs = getAbsolutePath(silentRel)
    const imageAbs = src.startsWith('static/') || src.startsWith('/static/')
      ? getAbsolutePath(src.startsWith('/') ? src.slice(1) : src)
      : getAbsolutePath(src)

    // 整段旁白只做一次连续动作（不再截短再循环，避免反复缩放）
    const motionSec = Math.min(
      LOCAL_COMIC_ENV.wanVideoDurationMaxSec,
      Math.max(2, duration),
    )
    const motionSeed = record.storyboardId || id
    logTaskProgress('VideoTask', `${tag}-start`, {
      id,
      image: src,
      duration,
      motionSec,
      seed: motionSeed,
      engine: tag,
    })

    if (useGlide) {
      try {
        await renderGlideClip(imageAbs, motionSec, silentAbs, {
          seed: motionSeed,
          fps: 25,
          width: 1280,
          height: 720,
          amount: 0.30,
          freeComfyFirst: true,
        })
      } catch (glideErr: any) {
        logTaskWarn('VideoTask', 'glide-fallback-kenburns', {
          id,
          error: glideErr?.message || String(glideErr),
        })
        db.update(schema.videoGenerations)
          .set({
            errorMsg: 'Glide 不可用，回退 FFmpeg 轻推镜…',
            updatedAt: now(),
          })
          .where(eq(schema.videoGenerations.id, id))
          .run()
        await renderKenBurnsClip(imageAbs, motionSec, silentAbs, { seed: motionSeed })
      }
    } else {
      await renderKenBurnsClip(imageAbs, motionSec, silentAbs, { seed: motionSeed })
    }

    const finalized = await finalizeWanShotVideo(silentRel, {
      storyboardId: record.storyboardId,
      targetDurationSec: duration,
      extendMode: 'freeze',
    })
    try {
      if (silentRel !== finalized.path && fs.existsSync(silentAbs)) fs.unlinkSync(silentAbs)
    } catch { /* ignore */ }

    await handleVideoCompleteLocal(id, finalized.path, finalized.duration, record.storyboardId)
  } catch (err: any) {
    logTaskError('VideoTask', 'kenburns-process', { id, error: err.message })
    db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

async function processComfyUIVideoGeneration(id: number, config: AIConfig) {
  try {
    const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return

    const preferredModel = String(record.model || config.model || getActiveComfyVideoModel() || 'wan_i2v').toLowerCase()
    const useFusionx = preferredModel.includes('fusionx')
    const comfyVideoModel = preferredModel.includes('flf')
      ? 'wan_flf2v'
      : useFusionx
        ? 'wan_i2v_fusionx'
        : 'wan_i2v'
    await ensureLocalModelStage('video', { comfyVideoModel })
    await ensureComfyWorkflowFamily('wan')
    const online = await waitForComfyServer()
    if (!online) {
      throw new Error('ComfyUI 未启动，请先启动 ComfyUI（本地漫剧顶栏切到「视频」阶段会尝试拉起）')
    }

    let imageUrl = record.imageUrl
    let firstFrameUrl = record.firstFrameUrl
    let lastFrameUrl = record.lastFrameUrl
    let promptText = String(record.prompt || '').trim()

    if (record.storyboardId) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, record.storyboardId)).all()
      if (sb) {
        const episodeSbs = loadEpisodeStoryboardsForShot(sb)
        const imgs = resolveComposeUnitVisual(sb, episodeSbs)
        if (!imageUrl) imageUrl = imgs.imageUrl || null
        if (!firstFrameUrl) firstFrameUrl = imgs.firstFrameUrl || null
        if (!lastFrameUrl) lastFrameUrl = imgs.lastFrameUrl || null
        if (!promptText) {
          promptText = buildVideoPromptFromComposeUnit(sb, episodeSbs)
        }
      }
    }
    if (!promptText) promptText = '画面轻微运动，镜头稳定，动作自然流畅，动漫风格，高清细节'

    const mode = String(record.referenceMode || 'single')
    const wantFlf = preferredModel.includes('flf') || mode === 'first_last'
    const useFlf2v = wantFlf && !!(firstFrameUrl && lastFrameUrl)
    const workflowName = useFlf2v ? 'wan_flf2v' : useFusionx ? 'wan_i2v_fusionx' : 'wan_i2v'
    const length = wanDurationToLength(record.duration)
    const prompt = loadWorkflowTemplate(workflowName)
    const wanSteps = useFusionx ? LOCAL_COMIC_ENV.wanFusionxSteps : LOCAL_COMIC_ENV.wanVideoSteps

    if (useFlf2v) {
      const start = uploadImageToComfyInput(String(firstFrameUrl))
      const end = uploadImageToComfyInput(String(lastFrameUrl))
      injectWanFlf2vWorkflow(prompt, {
        positive: promptText,
        startImage: start,
        endImage: end,
        length,
      })
    } else {
      const src = imageUrl || firstFrameUrl
      if (!src) throw new Error('图生视频需要参考图（请先生成配图 / 首帧）')
      const imageName = uploadImageToComfyInput(String(src))
      injectWanI2vWorkflow(prompt, {
        positive: promptText,
        imageName,
        length,
        steps: wanSteps,
        ...(useFusionx
          ? {
              unetName: LOCAL_COMIC_ENV.wanFusionxUnet,
              cfg: LOCAL_COMIC_ENV.wanFusionxCfg,
              shift: LOCAL_COMIC_ENV.wanFusionxShift,
              samplerName: 'dpmpp_sde',
              scheduler: 'beta',
              filenamePrefix: 'video/huobao_fusionx',
            }
          : {}),
      })
    }

    logTaskProgress('VideoTask', 'comfyui-queue', {
      id,
      workflow: workflowName,
      referenceMode: mode,
      length,
      duration: record.duration,
      size: `${LOCAL_COMIC_ENV.wanVideoWidth}x${LOCAL_COMIC_ENV.wanVideoHeight}`,
      steps: wanSteps,
      fps: LOCAL_COMIC_ENV.wanVideoFps,
      fusionx: useFusionx,
    })
    const promptId = await queueComfyPrompt(prompt)
    db.update(schema.videoGenerations)
      .set({ taskId: promptId, status: 'processing', errorMsg: '已提交 ComfyUI，等待采样…', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    let lastProgressWrite = 0
    const outputs = await waitForComfyPrompt(promptId, 7_200_000, {
      label: `wan-video#${id}`,
      logEveryMs: 15_000,
      onProgress: (p) => {
        const t = Date.now()
        if (t - lastProgressWrite < 10_000) return
        lastProgressWrite = t
        db.update(schema.videoGenerations)
          .set({ errorMsg: p.label, updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()
      },
    })
    const localPath = copyComfyVideoOutput(outputs, 'videos')
    const finalized = await finalizeWanShotVideo(localPath, {
      storyboardId: record.storyboardId,
      targetDurationSec: record.duration,
    })
    await handleVideoCompleteLocal(id, finalized.path, finalized.duration, record.storyboardId)
  } catch (err: any) {
    logTaskError('VideoTask', 'comfyui-process', { id, error: err.message })
    db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(Math.max(0.1, Number(data.format?.duration) || 0.1))
    })
  })
}

function runFfmpeg(builder: (cmd: ReturnType<typeof ffmpeg>) => ReturnType<typeof ffmpeg>): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = builder(ffmpeg())
    cmd.on('end', () => resolve()).on('error', (err) => reject(err)).run()
  })
}

/**
 * 本地视频后处理：混入旁白；画面不够长时定格尾帧（不循环，避免反复缩放）。
 */
async function finalizeWanShotVideo(
  videoRel: string,
  opts: {
    storyboardId?: number | null
    targetDurationSec?: number | null
    /** loop=循环画面（易反复缩放）；freeze=定格尾帧（默认，推荐） */
    extendMode?: 'loop' | 'freeze'
  },
): Promise<{ path: string; duration: number }> {
  const videoAbs = getAbsolutePath(videoRel)
  if (!fs.existsSync(videoAbs)) return { path: videoRel, duration: Number(opts.targetDurationSec) || 3 }
  const extendMode = opts.extendMode === 'loop' ? 'loop' : 'freeze'

  let audioAbs = ''
  let tempConcatAudio = ''
  if (opts.storyboardId) {
    const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, opts.storyboardId)).all()
    if (sb) {
      const episodeSbs = loadEpisodeStoryboardsForShot(sb)
      const members = findComposeUnitMembers(sb.id, episodeSbs)
      const list = members.length ? members : [sb]
      const urls = list.map(m => String(m.ttsAudioUrl || '').trim()).filter(Boolean)
      const unique = [...new Set(urls)]
      if (unique.length === 1) {
        audioAbs = getAbsolutePath(unique[0])
      } else if (unique.length > 1) {
        const absList = unique.map(u => getAbsolutePath(u)).filter(p => fs.existsSync(p))
        if (absList.length === 1) {
          audioAbs = absList[0]
        } else if (absList.length > 1) {
          tempConcatAudio = getAbsolutePath(`static/audio/${uuid()}-wan-unit.m4a`)
          fs.mkdirSync(path.dirname(tempConcatAudio), { recursive: true })
          await concatAudioFilesLocal(absList, tempConcatAudio)
          audioAbs = tempConcatAudio
        }
      } else {
        const fallback = resolveComposeUnitTtsAudio(sb.id, episodeSbs)
        if (fallback) audioAbs = getAbsolutePath(fallback)
      }
    }
  }

  const maxSec = LOCAL_COMIC_ENV.wanVideoDurationMaxSec
  const requested = Number(opts.targetDurationSec)
  const fallbackTarget = Number.isFinite(requested) && requested > 0
    ? Math.min(maxSec, Math.max(2, requested))
    : 3

  const videoDur = await probeMediaDuration(videoAbs).catch(() => 1)
  const outRel = `static/videos/${uuid()}.mp4`
  const outAbs = getAbsolutePath(outRel)
  fs.mkdirSync(path.dirname(outAbs), { recursive: true })

  try {
    if (audioAbs && fs.existsSync(audioAbs)) {
      const audioDur = await probeMediaDuration(audioAbs)
      // 有配音时以实测音轨为准，勿用文案估时把画面拉得比旁白更长（否则尾段静音冻帧）
      const target = Math.min(maxSec, Math.max(2, audioDur + 0.05))
      const padSec = Math.max(0, target - videoDur)

      if (extendMode === 'loop') {
        await runFfmpeg((cmd) => cmd
          .input(videoAbs)
          .inputOptions(['-stream_loop', '-1'])
          .input(audioAbs)
          .outputOptions([
            '-t', String(target),
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest',
            '-movflags', '+faststart',
          ])
          .output(outAbs))
      } else if (padSec > 0.12) {
        // 定格最后一帧补足旁白时长，整段只保留一次运镜
        await runFfmpeg((cmd) => cmd
          .input(videoAbs)
          .input(audioAbs)
          .complexFilter([`[0:v]tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}[vout]`])
          .outputOptions([
            '-map', '[vout]',
            '-map', '1:a:0',
            '-t', String(target),
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
          ])
          .output(outAbs))
      } else {
        await runFfmpeg((cmd) => cmd
          .input(videoAbs)
          .input(audioAbs)
          .outputOptions([
            '-t', String(target),
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest',
            '-movflags', '+faststart',
          ])
          .output(outAbs))
      }
      logTaskProgress('VideoTask', 'mux-narration', {
        video: videoRel,
        audio: audioAbs,
        videoDur,
        audioDur,
        target,
        estimated: fallbackTarget,
        extendMode,
        padSec: Number(padSec.toFixed(2)),
      })
      return { path: outRel, duration: target }
    }

    // 无配音：按文案推测时长拉伸画面（不循环）
    const target = Math.min(maxSec, Math.max(fallbackTarget, videoDur))
    if (Math.abs(target - videoDur) < 0.15) {
      return { path: videoRel, duration: videoDur }
    }
    const speed = target / Math.max(0.1, videoDur)
    await runFfmpeg((cmd) => cmd
      .input(videoAbs)
      .videoFilters(`setpts=${speed.toFixed(4)}*PTS`)
      .outputOptions([
        '-an',
        '-t', String(target),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(outAbs))
    logTaskProgress('VideoTask', 'stretch-duration', { video: videoRel, videoDur, target })
    return { path: outRel, duration: target }
  } catch (err) {
    logTaskWarn('VideoTask', 'finalize-failed', { error: (err as Error).message, video: videoRel })
    try { if (fs.existsSync(outAbs)) fs.unlinkSync(outAbs) } catch { /* ignore */ }
    return { path: videoRel, duration: videoDur }
  } finally {
    if (tempConcatAudio) {
      try { if (fs.existsSync(tempConcatAudio)) fs.unlinkSync(tempConcatAudio) } catch { /* ignore */ }
    }
  }
}

async function concatAudioFilesLocal(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 1) {
    await runFfmpeg((cmd) => cmd
      .input(audioPaths[0])
      .outputOptions(['-c:a', 'aac', '-ar', '48000', '-b:a', '192k'])
      .output(outputPath))
    return
  }
  const listPath = path.join(path.dirname(outputPath), `${uuid()}-concat.txt`)
  const escape = (p: string) => p.replace(/\\/g, '/').replace(/'/g, "'\\''")
  fs.writeFileSync(listPath, audioPaths.map(p => `file '${escape(p)}'`).join('\n'), 'utf-8')
  try {
    await runFfmpeg((cmd) => cmd
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c:a', 'aac', '-ar', '48000', '-b:a', '192k'])
      .output(outputPath))
  } finally {
    try { if (fs.existsSync(listPath)) fs.unlinkSync(listPath) } catch { /* ignore */ }
  }
}

async function handleVideoCompleteLocal(
  id: number,
  localPath: string,
  duration: number | null | undefined,
  storyboardId?: number | null,
) {
  db.update(schema.videoGenerations)
    .set({
      localPath,
      videoUrl: localPath,
      status: 'completed',
      errorMsg: null,
      completedAt: now(),
      updatedAt: now(),
      ...(duration != null ? { duration } : {}),
    })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'comfyui-saved', { id, localPath, storyboardId, duration })

  if (storyboardId) {
    // 只写 videoUrl，勿覆盖分镜 duration（多为 TTS 实测；写成片时长会污染后续估时）
    db.update(schema.storyboards)
      .set({ videoUrl: localPath, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(raw: string | null | undefined): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeVideoReferenceUrl(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

async function pollVideoTask(id: number, config: AIConfig, taskId: string, storyboardId?: number | null) {
  const adapter = getVideoAdapter(config.provider)

  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('VideoTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const resp = await fetch(url, { method, headers })
      if (!resp.ok) continue
      const result = await resp.json() as any

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.videoUrl) {
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollResp.videoUrl })
        await handleVideoComplete(id, pollResp.videoUrl, null, storyboardId)
        return
      }
      if (pollResp.status === 'failed') {
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Video generation failed' })
        throw new Error(pollResp.error || 'Video generation failed')
      }
    } catch (err: any) {
      if (i === 299) {
        logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: err.message })
        db.update(schema.videoGenerations)
          .set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()
        return
      }
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }
}

async function handleVideoComplete(id: number, videoUrl: string, duration: number | null | undefined, storyboardId?: number | null) {
  const localPath = await downloadFile(videoUrl, 'videos')
  db.update(schema.videoGenerations)
    .set({ videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'downloaded', { id, localPath, storyboardId, duration })

  if (storyboardId) {
    db.update(schema.storyboards)
      .set({ videoUrl: localPath, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }
}
