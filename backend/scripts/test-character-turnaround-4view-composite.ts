/**
 * 四视图设定图 — 分两次生成（面部特写 + 三视图全身）再拼版
 * 用法: npx tsx scripts/test-character-turnaround-4view-composite.ts
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import {
  clampComfyImageSize,
  copyComfyImageOutput,
  injectSdxlWorkflow,
  loadWorkflowTemplate,
  queueComfyPrompt,
  resolveComfyCheckpoint,
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'
import { ensureComfyUIRunning } from '../src/services/local-service-starter.js'
import { LOCAL_COMIC_ENV } from '../src/constants/local-comic.js'
import { getAbsolutePath } from '../src/utils/storage.js'

const SEED = 20260708
const CHECKPOINT = resolveComfyCheckpoint('realistic')
const GRAY = { r: 184, g: 184, b: 184 }
const OUT_W = LOCAL_COMIC_ENV.outputWidth
const OUT_H = LOCAL_COMIC_ENV.outputHeight
const COL_W = Math.floor(OUT_W / 4)

const NEGATIVE = [
  'score_6, worst quality, low quality, blurry, bad anatomy, bad face',
  '2boys, multiple men, different characters, inconsistent design',
  'female, girl, chibi, child, colorful hair, blonde hair',
  'text, watermark, logo, cropped head, cropped feet',
  'holding object, weapon, props in hands',
].join(', ')

const FACE_POSITIVE = [
  'score_9, score_8_up',
  '1man, solo male, 40-year-old middle-aged man portrait',
  'head and shoulders close-up, face fills 70 percent of frame',
  'angular mature face, stern wise authoritative eyes, dignified expression',
  'jet black long hair tied back, black hair only',
  'dark formal ancient Chinese hanfu collar visible',
  'solid flat gray background, soft diffused studio lighting',
  '3d render, pbr, Chinese style 3d character, sharp facial details',
].join(', ')

const BODY_POSITIVE = [
  'score_9, score_8_up',
  '1man, solo male, same 40-year-old middle-aged man',
  'character turnaround reference sheet, three views same character',
  'three panel layout: front full body 0 degree, side profile 90 degree, back view 180 degree',
  'dark formal ancient Chinese hanfu male robes, jet black hair tied back',
  'standing naturally, arms at sides, empty hands, full body head to feet',
  'solid flat gray background, soft studio lighting, 3d render, Chinese style 3d',
].join(', ')

async function generateImage(positive: string, width: number, height: number): Promise<string> {
  const params = {
    positive,
    negative: NEGATIVE,
    width,
    height,
    steps: 28,
    cfg: 7,
    samplerName: 'dpmpp_2m' as const,
    scheduler: 'karras' as const,
    checkpoint: CHECKPOINT,
    seed: SEED,
  }

  const wf = loadWorkflowTemplate('sdxl_anime')
  injectSdxlWorkflow(wf, params)
  const id = await queueComfyPrompt(wf)
  return copyComfyImageOutput(await waitForComfyPrompt(id, 600_000), 'images')
}

async function compositeFourViews(faceRel: string, bodyRel: string): Promise<string> {
  const faceAbs = getAbsolutePath(faceRel)
  const bodyAbs = getAbsolutePath(bodyRel)
  const bodyMeta = await sharp(bodyAbs).metadata()
  const bw = bodyMeta.width || 1360
  const bh = bodyMeta.height || 760
  const third = Math.floor(bw / 3)

  const facePanel = await sharp(faceAbs)
    .resize(COL_W, OUT_H, { fit: 'contain', background: GRAY })
    .png()
    .toBuffer()

  const bodyPanels: Buffer[] = []
  for (let i = 0; i < 3; i++) {
    const panel = await sharp(bodyAbs)
      .extract({ left: i * third, top: 0, width: third, height: bh })
      .resize(COL_W, OUT_H, { fit: 'contain', background: GRAY })
      .png()
      .toBuffer()
    bodyPanels.push(panel)
  }

  const destDir = path.dirname(getAbsolutePath('static/images/placeholder.png'))
  fs.mkdirSync(destDir, { recursive: true })
  const outName = `${uuid()}.png`
  const outRel = `static/images/${outName}`
  const outAbs = getAbsolutePath(outRel)

  await sharp({
    create: { width: OUT_W, height: OUT_H, channels: 3, background: GRAY },
  })
    .composite([
      { input: facePanel, left: 0, top: 0 },
      { input: bodyPanels[0], left: COL_W, top: 0 },
      { input: bodyPanels[1], left: COL_W * 2, top: 0 },
      { input: bodyPanels[2], left: COL_W * 3, top: 0 },
    ])
    .png()
    .toFile(outAbs)

  return outRel
}

async function main() {
  console.log('[4view+] starting ComfyUI if needed...')
  await ensureComfyUIRunning()
  if (!(await waitForComfyServer(15_000))) throw new Error('ComfyUI 不可用')

  const faceSize = clampComfyImageSize(768, 960, 1024)
  const bodySize = clampComfyImageSize(1344, 448, 1344)

  console.log('[4view+] generating face close-up...', `${faceSize.width}x${faceSize.height}`)
  const facePath = await generateImage(FACE_POSITIVE, faceSize.width, faceSize.height)
  console.log('[4view+] face:', facePath)

  console.log('[4view+] generating three-view body...', `${bodySize.width}x${bodySize.height}`)
  const bodyPath = await generateImage(BODY_POSITIVE, bodySize.width, bodySize.height)
  console.log('[4view+] body:', bodyPath)

  console.log('[4view+] compositing...')
  const finalPath = await compositeFourViews(facePath, bodyPath)
  const meta = await sharp(getAbsolutePath(finalPath)).metadata()

  console.log('[4view+] done!')
  console.log('[4view+] output:', finalPath)
  console.log('[4view+] absolute:', getAbsolutePath(finalPath))
  console.log('[4view+] pixels:', `${meta.width}x${meta.height}`)
}

main().catch((e) => {
  console.error('[4view+] failed:', e.message)
  process.exit(1)
})
