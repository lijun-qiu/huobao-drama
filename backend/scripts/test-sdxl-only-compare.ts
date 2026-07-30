/** SDXL only — save to compare_sdxl_comic.png */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import {
  clampComfyStoryboardSize,
  copyComfyImageOutput,
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
import { getAbsolutePath, upscaleImageToTargetSize } from '../src/utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../data/static/images/compare_sdxl_comic.png')

const ENGLISH_SHOT = [
  '1boy, solo male, college student, handsome anime face, black hoodie',
  'medium shot, upper body, sitting at desk by window',
  'rubbing eyes with one hand, tired expression, morning light on face',
  'university dorm room, bunk bed, laptop and cables on wooden desk',
  'warm morning sunlight through thin curtains, soft golden beams on floor',
  'cinematic anime illustration, clean lineart, soft cel shading, 16:9 widescreen',
].join(', ')

async function main() {
  await ensureComfyUIRunning()
  if (!(await waitForComfyServer(120_000))) throw new Error('ComfyUI down')

  const SIZE = clampComfyStoryboardSize(1920, 1080)
  const params = {
    positive: toComfyStoryboardPrompt(ENGLISH_SHOT, 'comic'),
    negative: resolveComfyStoryboardNegative('comic'),
    width: SIZE.width,
    height: SIZE.height,
    steps: 32,
    cfg: 7,
    samplerName: 'dpmpp_2m' as const,
    scheduler: 'karras' as const,
    checkpoint: resolveComfyCheckpoint('comic'),
    seed: 20260712,
  }
  console.log('[sdxl] checkpoint:', params.checkpoint)
  const prompt = loadWorkflowTemplate('sdxl_anime')
  injectSdxlWorkflow(prompt, params)
  const promptId = await queueComfyPrompt(prompt)
  console.log('[sdxl] queued:', promptId)
  const outputs = await waitForComfyPrompt(promptId, 600_000)
  const rel = copyComfyImageOutput(outputs, 'images')
  const abs = getAbsolutePath(rel)
  console.log('[sdxl] rel:', rel, 'abs:', abs, 'exists:', fs.existsSync(abs))
  await upscaleImageToTargetSize(rel, LOCAL_COMIC_ENV.outputWidth, LOCAL_COMIC_ENV.outputHeight)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.copyFileSync(getAbsolutePath(rel), OUT)
  const meta = await sharp(OUT).metadata()
  console.log('[sdxl] OK', OUT, `${meta.width}x${meta.height}`)
}

main().catch(e => { console.error(e); process.exit(1) })
