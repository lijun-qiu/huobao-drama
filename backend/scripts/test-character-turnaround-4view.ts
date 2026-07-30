/**
 * 四视图角色设定图 — 按用户提示词生成
 * 用法: npx tsx scripts/test-character-turnaround-4view.ts
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
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'
import { LOCAL_COMIC_ENV } from '../src/constants/local-comic.js'
import { getAbsolutePath, upscaleImageToTargetSize } from '../src/utils/storage.js'

const POSITIVE = [
  'score_9, score_8_up',
  '1man, solo male, 40-year-old middle-aged man, 180cm tall, seven head body ratio',
  'character design sheet, character turnaround, four views same character',
  'four panel layout left to right: face portrait bust, front full body 0 degree, side profile 90 degree, back view 180 degree',
  'angular mature face, stern wise authoritative eyes, subtle dignified expression',
  'jet black long hair tied back, black hair only',
  'dark formal ancient Chinese hanfu male robes, simple minimal accessories',
  'standing naturally, arms relaxed at sides, empty hands, full body head to feet visible',
  'solid flat gray background, soft diffused studio lighting, no harsh shadow',
  '3d render, high precision modeling, pbr materials, Chinese style 3d character',
].join(', ')

const NEGATIVE = [
  'score_6, score_5, score_4, worst quality, low quality, blurry, bad anatomy',
  '2boys, 2men, multiple characters, different people, inconsistent design',
  'cropped head, cropped feet, cut off legs, cut off arms, partial body',
  'blonde hair, colorful hair, female, girl, woman, chibi, child',
  'holding object, weapon, props in hands, strong backlight, dark silhouette',
  'text, watermark, logo, border, frame split lines',
].join(', ')

const SIZE = clampComfyStoryboardSize(1920, 1080)

async function main() {
  console.log('[4view] waiting for ComfyUI...')
  if (!(await waitForComfyServer(30_000))) throw new Error('ComfyUI 未启动')

  const checkpoint = resolveComfyCheckpoint('realistic')
  const params = {
    positive: POSITIVE,
    negative: NEGATIVE,
    width: SIZE.width,
    height: SIZE.height,
    steps: 32,
    cfg: 7,
    samplerName: 'dpmpp_2m' as const,
    scheduler: 'karras' as const,
    checkpoint,
    seed: 20260708,
  }

  console.log('[4view] checkpoint:', checkpoint)
  console.log('[4view] gen:', `${SIZE.width}x${SIZE.height}`, '→', `${LOCAL_COMIC_ENV.outputWidth}x${LOCAL_COMIC_ENV.outputHeight}`)

  let localPath: string
  try {
    const wf = loadWorkflowTemplate('sdxl_upscale')
    injectSdxlUpscaleWorkflow(wf, params)
    const id = await queueComfyPrompt(wf)
    console.log('[4view] ESRGAN workflow, prompt_id:', id)
    localPath = copyComfyImageOutput(await waitForComfyPrompt(id, 600_000), 'images')
  } catch (err) {
    console.warn('[4view] ESRGAN fallback:', (err as Error).message)
    const wf = loadWorkflowTemplate('sdxl_anime')
    injectSdxlWorkflow(wf, params)
    localPath = copyComfyImageOutput(await waitForComfyPrompt(await queueComfyPrompt(wf), 600_000), 'images')
    await upscaleImageToTargetSize(localPath, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
  }

  const meta = await sharp(getAbsolutePath(localPath)).metadata()
  console.log('[4view] done:', localPath)
  console.log('[4view] pixels:', `${meta.width}x${meta.height}`)
}

main().catch((e) => { console.error('[4view] failed:', e.message); process.exit(1) })
