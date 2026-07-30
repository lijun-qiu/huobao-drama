/** Flux only — save to compare_flux_comic.png */
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
  loadWorkflowTemplate,
  queueComfyPrompt,
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'
import { LOCAL_COMIC_ENV } from '../src/constants/local-comic.js'
import { ensureComfyUIRunning, restartComfyUI } from '../src/services/local-service-starter.js'
import { getAbsolutePath, upscaleImageToTargetSize } from '../src/utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../data/static/images/compare_flux_comic.png')

const ENGLISH_SHOT = [
  '1boy, solo male, college student, handsome anime face, black hoodie',
  'medium shot, upper body, sitting at desk by window',
  'rubbing eyes with one hand, tired expression, morning light on face',
  'university dorm room, bunk bed, laptop and cables on wooden desk',
  'warm morning sunlight through thin curtains, soft golden beams on floor',
  'cinematic anime illustration, clean lineart, soft cel shading, 16:9 widescreen',
].join(', ')

async function main() {
  await restartComfyUI()
  if (!(await waitForComfyServer(180_000))) throw new Error('ComfyUI down')

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
    seed: 20260712,
    steps: COMFY_FLUX_GENERATION_STEPS,
    cfg: 1,
  })
  console.log('[flux] checkpoint:', LOCAL_COMIC_ENV.fluxCheckpoint)
  const promptId = await queueComfyPrompt(prompt)
  console.log('[flux] queued:', promptId)
  const outputs = await waitForComfyPrompt(promptId, 600_000)
  const rel = copyComfyImageOutput(outputs, 'images')
  await upscaleImageToTargetSize(rel, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.copyFileSync(getAbsolutePath(rel), OUT)
  const meta = await sharp(OUT).metadata()
  console.log('[flux] OK', OUT, `${meta.width}x${meta.height}`)
}

main().catch(e => { console.error(e); process.exit(1) })
