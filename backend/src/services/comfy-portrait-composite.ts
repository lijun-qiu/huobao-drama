/**
 * 定妆正面全身 — 单张 SDXL txt2img，白底正面全身，输出 1920×1080
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import {
  clampComfyImageSize,
  clampComfyStoryboardSize,
  resolveComfyFluxPortraitGenerationSize,
  copyComfyImageOutput,
  injectFluxWorkflow,
  injectSdxlWorkflow,
  loadWorkflowTemplate,
  queueComfyPrompt,
  resolveComfyPortraitViewNegative,
  toComfyPortraitCompositeViewPrompt,
  toComfyFluxPortraitPrompt,
  resolvePortraitCheckpointFamily,
  resolvePortraitGender,
  waitForComfyPrompt,
  type SdxlWorkflowParams,
} from './comfyui-client.js'
import { freeComfyUIMemory, restartComfyUI } from './local-model-manager.js'
import { getAbsolutePath } from '../utils/storage.js'
import { logTaskProgress } from '../utils/task-logger.js'


export type ComfyPortraitCompositeInput = {
  /** 页面完整 prompt（buildCharacterPortraitPrompt 产物） */
  pagePrompt: string
  checkpoint: string
  characterName?: string | null
  characterRole?: string | null
  visualStyle?: string | null
  seed?: number
}

async function generateSdxlPanel(params: SdxlWorkflowParams): Promise<string> {
  const run = async () => {
    const wf = loadWorkflowTemplate('sdxl_anime')
    injectSdxlWorkflow(wf, params)
    const promptId = await queueComfyPrompt(wf)
    const outputs = await waitForComfyPrompt(promptId, 600_000)
    return copyComfyImageOutput(outputs, 'images')
  }
  try {
    return await run()
  } catch (err) {
    const msg = (err as Error).message || ''
    if (!/model_size|CheckpointLoaderSimple/i.test(msg)) throw err
    logTaskProgress('ImageTask', 'portrait-retry-after-free', { error: msg.slice(0, 120) })
    await freeComfyUIMemory()
    await new Promise(r => setTimeout(r, 2000))
    try {
      return await run()
    } catch (err2) {
      const msg2 = (err2 as Error).message || ''
      if (!/model_size|CheckpointLoaderSimple/i.test(msg2)) throw err2
      logTaskProgress('ImageTask', 'portrait-retry-after-restart', { error: msg2.slice(0, 120) })
      await restartComfyUI()
      await new Promise(r => setTimeout(r, 2000))
      return run()
    }
  }
}

/** 从边缘泛洪，将连通灰/暗背景替换为纯白（保留角色本体）；再扫一遍清掉抠图锯齿白边 */
async function flattenPortraitPanelBackground(imageRel: string): Promise<string> {
  const abs = getAbsolutePath(imageRel)
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels
  const buf = Buffer.from(data)
  const visited = new Uint8Array(w * h)
  const stack: number[] = []

  const isBackdrop = (idx: number) => {
    const r = buf[idx]
    const g = buf[idx + 1]
    const b = buf[idx + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    // 只泛洪近白背景；勿把深灰西装/头发等低饱和色当背景（否则会吃出块状 glitch）
    if (lum >= 228 && sat < 0.12) return true
    return false
  }

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (visited[p]) return
    const idx = p * ch
    if (!isBackdrop(idx)) return
    visited[p] = 1
    stack.push(x, y)
  }

  for (let x = 0; x < w; x++) {
    tryPush(x, 0)
    tryPush(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y)
    tryPush(w - 1, y)
  }

  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    const idx = (y * w + x) * ch
    buf[idx] = 255
    buf[idx + 1] = 255
    buf[idx + 2] = 255
    if (ch === 4) buf[idx + 3] = 255
    tryPush(x + 1, y)
    tryPush(x - 1, y)
    tryPush(x, y + 1)
    tryPush(x, y - 1)
  }

  // 清理人物边缘的半透明/高亮锯齿：邻接纯白且自身偏亮的像素拉回纯白
  const isPureWhite = (idx: number) => buf[idx] >= 252 && buf[idx + 1] >= 252 && buf[idx + 2] >= 252
  const neighborsWhite = (x: number, y: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (isPureWhite((ny * w + nx) * ch)) return true
    }
    return false
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        const idx = p * ch
        if (isPureWhite(idx)) continue
        if (!neighborsWhite(x, y)) continue
        const r = buf[idx]
        const g = buf[idx + 1]
        const b = buf[idx + 2]
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const sat = max === 0 ? 0 : (max - min) / max
        // 高亮低饱和 = 抠图光晕/锯齿，不是衣服高光（衣服通常有色相）
        if (lum >= 210 && sat < 0.18) {
          buf[idx] = 255
          buf[idx + 1] = 255
          buf[idx + 2] = 255
          if (ch === 4) buf[idx + 3] = 255
        }
      }
    }
  }

  const destRel = `static/images/${uuid()}.png`
  await sharp(buf, { raw: { width: w, height: h, channels: ch } }).png().toFile(getAbsolutePath(destRel))
  return destRel
}

async function finalizePortraitOutput(imageRel: string): Promise<string> {
  // 只清白底，保持原生竖幅（如 768×1344）；禁止 contain 垫成 16:9（会左右大白边、人变竖条）
  const flatRel = await flattenPortraitPanelBackground(imageRel)
  const destDir = path.dirname(getAbsolutePath('static/images/placeholder.png'))
  fs.mkdirSync(destDir, { recursive: true })
  const outRel = `static/images/${uuid()}.png`
  const abs = getAbsolutePath(flatRel)
  await sharp(abs).png().toFile(getAbsolutePath(outRel))
  return outRel
}

/** 定妆收尾：白底 flatten，保持生成分辨率（竖幅满构图，与男人/消防员一致） */
export async function finalizePortraitWhiteBackground(imageRel: string): Promise<string> {
  return finalizePortraitOutput(imageRel)
}

const PORTRAIT_CFG = { steps: 28, cfg: 6.5, samplerName: 'dpmpp_2m' as const, scheduler: 'karras' as const }
const FLUX_PORTRAIT_CFG = { steps: 28, cfg: 1 }

/** SDXL 定妆：竖幅全身占满画面；Flux 定妆直接按输出分辨率原生生成 */
function resolvePortraitGenerationSize(useVertical = true): { width: number; height: number } {
  if (useVertical) return clampComfyImageSize(896, 1536, 1536)
  return resolveComfyFluxPortraitGenerationSize()
}

async function generateFluxPanel(positive: string, width: number, height: number, seed: number): Promise<string> {
  const run = async () => {
    const wf = loadWorkflowTemplate('flux_dev_fp8')
    injectFluxWorkflow(wf, {
      positive,
      negative: '',
      width,
      height,
      checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
      seed,
      ...FLUX_PORTRAIT_CFG,
    })
    const promptId = await queueComfyPrompt(wf)
    const outputs = await waitForComfyPrompt(promptId, 600_000)
    return copyComfyImageOutput(outputs, 'images')
  }
  try {
    return await run()
  } catch (err) {
    const msg = (err as Error).message || ''
    if (!/model_size|CheckpointLoaderSimple/i.test(msg)) throw err
    logTaskProgress('ImageTask', 'portrait-flux-retry-after-free', { error: msg.slice(0, 120) })
    await freeComfyUIMemory()
    await new Promise(r => setTimeout(r, 2000))
    try {
      return await run()
    } catch (err2) {
      const msg2 = (err2 as Error).message || ''
      if (!/model_size|CheckpointLoaderSimple/i.test(msg2)) throw err2
      logTaskProgress('ImageTask', 'portrait-flux-retry-after-restart', { error: msg2.slice(0, 120) })
      await restartComfyUI()
      await new Promise(r => setTimeout(r, 2000))
      return run()
    }
  }
}

/** Flux 定妆：正面全身白底，与分镜配图同底模 */
export async function generateComfyPortraitFlux(input: ComfyPortraitCompositeInput): Promise<string> {
  const pagePrompt = String(input.pagePrompt || '').trim()
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000)
  await freeComfyUIMemory()
  await new Promise(r => setTimeout(r, 1000))

  const bodySize = resolvePortraitGenerationSize(false)
  const characterName = input.characterName ?? null
  const characterRole = input.characterRole ?? null
  const visualStyle = input.visualStyle ?? null
  const gender = resolvePortraitGender(pagePrompt, characterName, characterRole)
  const positive = toComfyFluxPortraitPrompt(pagePrompt, characterName, visualStyle, characterRole)

  logTaskProgress('ImageTask', 'portrait-flux-fullbody', {
    checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
    gender,
    role: characterRole,
    width: bodySize.width,
    height: bodySize.height,
    positive: positive.slice(0, 400),
  })

  const frontPath = await generateFluxPanel(positive, bodySize.width, bodySize.height, seed)
  return finalizePortraitOutput(frontPath)
}

export async function generateComfyPortraitComposite(input: ComfyPortraitCompositeInput): Promise<string> {
  const pagePrompt = String(input.pagePrompt || '').trim()
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000)
  await freeComfyUIMemory()
  await new Promise(r => setTimeout(r, 1000))

  // 竖幅半身：人物占满画面；收尾只清白底，保持原生竖幅尺寸
  const bodySize = resolvePortraitGenerationSize(true)
  const characterName = input.characterName ?? null
  const characterRole = input.characterRole ?? null
  const visualStyle = input.visualStyle ?? null
  const checkpoint = input.checkpoint
  const gender = resolvePortraitGender(pagePrompt, characterName, characterRole)
  const frontPositive = toComfyPortraitCompositeViewPrompt(
    pagePrompt, 'front', characterName, visualStyle, checkpoint, characterRole,
  )
  const negative = resolveComfyPortraitViewNegative('front', visualStyle, checkpoint, gender)

  logTaskProgress('ImageTask', 'portrait-front-fullbody', {
    checkpoint,
    ckptFamily: resolvePortraitCheckpointFamily(checkpoint),
    gender,
    role: characterRole,
    width: bodySize.width,
    height: bodySize.height,
    positive: frontPositive,
  })

  const frontPath = await generateSdxlPanel({
    checkpoint: input.checkpoint,
    ...PORTRAIT_CFG,
    positive: frontPositive,
    negative,
    width: bodySize.width,
    height: bodySize.height,
    seed,
  })

  return finalizePortraitOutput(frontPath)
}
