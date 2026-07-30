/**
 * SDXL vs Flux 分镜英文 prompt 对比（对齐项目正式链路）
 * 用法: npx tsx scripts/test-sdxl-vs-flux-compare.ts
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import {
  clampComfyStoryboardSize,
  copyComfyImageOutput,
  COMFY_FLUX_GENERATION_STEPS,
  finalizeFluxStoryboardPositivePrompt,
  injectFluxWorkflow,
  injectSdxlUpscaleWorkflow,
  injectSdxlWorkflow,
  loadWorkflowTemplate,
  queueComfyPrompt,
  resolveComfyCheckpoint,
  resolveComfyStoryboardNegative,
  toComfyStoryboardPrompt,
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'
import { LOCAL_COMIC_ENV } from '../src/constants/local-comic.js'
import { ensureComfyUIRunning } from '../src/services/local-service-starter.js'
import { freeComfyUIMemory } from '../src/services/local-model-manager.js'
import { getAbsolutePath, upscaleImageToTargetSize } from '../src/utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../../data/static/images')

const ENGLISH_SHOT = [
  '1boy, solo male, college student, handsome anime face, black hoodie',
  'medium shot, upper body, sitting at desk by window',
  'rubbing eyes with one hand, tired expression, morning light on face',
  'university dorm room, bunk bed, laptop and cables on wooden desk',
  'warm morning sunlight through thin curtains, soft golden beams on floor',
  'cinematic anime illustration, clean lineart, soft cel shading, 16:9 widescreen',
].join(', ')

const VISUAL_STYLE = 'comic'
const SEED = 20260712
const SIZE = clampComfyStoryboardSize(1920, 1080)

async function runSdxl(): Promise<string> {
  await freeComfyUIMemory()
  await new Promise(r => setTimeout(r, 2000))
  const positive = toComfyStoryboardPrompt(ENGLISH_SHOT, VISUAL_STYLE)
  const negative = resolveComfyStoryboardNegative(VISUAL_STYLE)
  const params = {
    positive,
    negative,
    width: SIZE.width,
    height: SIZE.height,
    steps: 32,
    cfg: 7,
    samplerName: 'dpmpp_2m' as const,
    scheduler: 'karras' as const,
    checkpoint: resolveComfyCheckpoint(VISUAL_STYLE),
    seed: SEED,
  }
  console.log('[sdxl] checkpoint:', params.checkpoint)
  console.log('[sdxl] positive:', positive.slice(0, 200), '...')

  let localPath: string
  try {
    const prompt = loadWorkflowTemplate('sdxl_upscale')
    injectSdxlUpscaleWorkflow(prompt, params)
    const promptId = await queueComfyPrompt(prompt)
    console.log('[sdxl] queued:', promptId)
    const outputs = await waitForComfyPrompt(promptId, 600_000)
    localPath = copyComfyImageOutput(outputs, 'images')
  } catch (err) {
    console.warn('[sdxl] upscale failed, fallback txt2img:', (err as Error).message)
    const prompt = loadWorkflowTemplate('sdxl_anime')
    injectSdxlWorkflow(prompt, params)
    const promptId = await queueComfyPrompt(prompt)
    const outputs = await waitForComfyPrompt(promptId, 600_000)
    localPath = copyComfyImageOutput(outputs, 'images')
    await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
  }
  return localPath
}

async function runFlux(): Promise<string> {
  await freeComfyUIMemory()
  await new Promise(r => setTimeout(r, 3000))
  const positive = finalizeFluxStoryboardPositivePrompt(
    [
      'Camera and composition: medium shot eye-level, young man at dorm desk by window, upper body visible.',
      'Environment and era: university dorm morning, bunk bed, wooden desk, laptop and charging cables.',
      'Action and interaction: one hand rubbing eye, tired expression, looking down not at camera.',
      'Subjects in frame: solo young male college student, black short hair, gray hoodie.',
      'Lighting and color: warm morning sunlight through thin curtains, golden beams on floor.',
      'Art style spec: 16:9 cinematic anime, clean lineart, soft cel shading, Makoto Shinkai atmosphere.',
      'Render quality: no text, no watermark, sharp focus.',
    ].join(' '),
    ENGLISH_SHOT,
  )
  const fluxSize = clampComfyStoryboardSize(1920, 1080)
  const prompt = loadWorkflowTemplate('flux_dev_fp8')
  injectFluxWorkflow(prompt, {
    positive,
    negative: '',
    width: fluxSize.width,
    height: fluxSize.height,
    checkpoint: LOCAL_COMIC_ENV.fluxCheckpoint,
    seed: SEED,
    steps: COMFY_FLUX_GENERATION_STEPS,
    cfg: 1,
  })
  console.log('[flux] checkpoint:', LOCAL_COMIC_ENV.fluxCheckpoint)
  console.log('[flux] positive:', positive.slice(0, 200), '...')

  const promptId = await queueComfyPrompt(prompt)
  console.log('[flux] queued:', promptId)
  const outputs = await waitForComfyPrompt(promptId, 600_000)
  let localPath = copyComfyImageOutput(outputs, 'images')
  if (LOCAL_COMIC_ENV.upscaleStoryboardTo1080p) {
    await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
  }
  return localPath
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log('[compare] waiting for ComfyUI...')
  await ensureComfyUIRunning()
  if (!(await waitForComfyServer(120_000))) throw new Error('ComfyUI 未启动')

  console.log('\n=== SDXL ===')
  const sdxlRel = await runSdxl()
  const sdxlOut = path.join(OUT_DIR, 'compare_sdxl_cinematic.png')
  fs.copyFileSync(getAbsolutePath(sdxlRel), sdxlOut)

  console.log('\n=== FLUX ===')
  const fluxRel = await runFlux()
  const fluxOut = path.join(OUT_DIR, 'compare_flux_cinematic.png')
  fs.copyFileSync(getAbsolutePath(fluxRel), fluxOut)

  const sdxlMeta = await sharp(sdxlOut).metadata()
  const fluxMeta = await sharp(fluxOut).metadata()
  console.log('\n[compare] done')
  console.log('SDXL:', sdxlOut, `${sdxlMeta.width}x${sdxlMeta.height}`)
  console.log('Flux:', fluxOut, `${fluxMeta.width}x${fluxMeta.height}`)
  console.log('View: http://localhost:5679/static/images/compare_sdxl_cinematic.png')
  console.log('View: http://localhost:5679/static/images/compare_flux_cinematic.png')
}

main().catch(err => {
  console.error('[compare] failed:', err.message)
  process.exit(1)
})
