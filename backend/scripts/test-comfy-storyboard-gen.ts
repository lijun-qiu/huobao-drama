/**
 * 本地分镜生图测试 — 1360×760 生图 → ESRGAN → 1920×1080
 * 用法: npx tsx scripts/test-comfy-storyboard-gen.ts
 */
import sharp from 'sharp'
import {
  clampComfyStoryboardSize,
  copyComfyImageOutput,
  injectSdxlUpscaleWorkflow,
  injectSdxlWorkflow,
  loadWorkflowTemplate,
  queueComfyPrompt,
  resolveComfyCheckpoint,
  toComfyStoryboardPrompt,
  resolveComfyStoryboardNegative,
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'
import { LOCAL_COMIC_ENV } from '../src/constants/local-comic.js'
import { getAbsolutePath, upscaleImageToTargetSize } from '../src/utils/storage.js'

const ENGLISH_SHOT = [
  '1boy, solo male, college student, handsome anime face, black hoodie',
  'close-up portrait, upper body, face focus',
  'breathless expression, sweat on forehead, looking back over shoulder',
  'university campus path background, afternoon golden sunlight',
  'sharp focus on face, shallow depth of field, tense mood',
].join(', ')

const VISUAL_STYLE = 'cinematic'
const SIZE = clampComfyStoryboardSize(1920, 1080)

const sdxlParams = {
  positive: '',
  negative: '',
  width: SIZE.width,
  height: SIZE.height,
  steps: 32,
  cfg: 7,
  samplerName: 'dpmpp_2m' as const,
  scheduler: 'karras' as const,
  checkpoint: resolveComfyCheckpoint(VISUAL_STYLE),
  seed: 424242,
}

async function main() {
  console.log('[test] waiting for ComfyUI...')
  const online = await waitForComfyServer(30_000)
  if (!online) throw new Error('ComfyUI 未启动 (http://127.0.0.1:8188)')

  sdxlParams.positive = toComfyStoryboardPrompt(ENGLISH_SHOT, VISUAL_STYLE)
  sdxlParams.negative = resolveComfyStoryboardNegative(VISUAL_STYLE)

  console.log('[test] checkpoint:', sdxlParams.checkpoint)
  console.log('[test] gen size:', `${SIZE.width}x${SIZE.height}`)
  console.log('[test] output:', `${LOCAL_COMIC_ENV.outputWidth}x${LOCAL_COMIC_ENV.outputHeight}`)
  console.log('[test] upscale model:', LOCAL_COMIC_ENV.upscaleModel || '(sharp fallback)')

  let localPath: string
  try {
    const prompt = loadWorkflowTemplate('sdxl_upscale')
    injectSdxlUpscaleWorkflow(prompt, sdxlParams)
    console.log('[test] workflow: sdxl_upscale (ESRGAN)')
    const promptId = await queueComfyPrompt(prompt)
    console.log('[test] prompt_id:', promptId, '— generating...')
    const outputs = await waitForComfyPrompt(promptId, 600_000)
    localPath = copyComfyImageOutput(outputs, 'images')
  } catch (err) {
    console.warn('[test] ESRGAN failed, fallback:', (err as Error).message)
    const prompt = loadWorkflowTemplate('sdxl_anime')
    injectSdxlWorkflow(prompt, sdxlParams)
    const promptId = await queueComfyPrompt(prompt)
    const outputs = await waitForComfyPrompt(promptId, 600_000)
    localPath = copyComfyImageOutput(outputs, 'images')
    await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
  }

  const abs = getAbsolutePath(localPath)
  const meta = await sharp(abs).metadata()
  console.log('[test] done!')
  console.log('[test] path:', localPath)
  console.log('[test] absolute:', abs)
  console.log('[test] final pixels:', `${meta.width}x${meta.height}`)
}

main().catch((err) => {
  console.error('[test] failed:', err.message)
  process.exit(1)
})
