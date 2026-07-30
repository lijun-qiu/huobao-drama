/**
 * FLUX PuLID 锁脸分镜测试（对齐正式分镜链路）
 * 用法:
 *   npx tsx scripts/test-flux-pulid-gen.ts [定妆图] [storyboardId]
 *   npx tsx scripts/test-flux-pulid-gen.ts static/uploads/xxx.png 272
 */
import { db, schema } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import {
  clampComfyStoryboardSize,
  copyComfyImageOutput,
  COMFY_FLUX_PULID_STORYBOARD_NEGATIVE,
  finalizeFluxStoryboardPositivePrompt,
  augmentFluxPulidStoryboardPositive,
  injectFluxPulidWorkflow,
  isFluxPulidReady,
  isFluxPulidReadyInComfy,
  loadWorkflowTemplate,
  prepareFluxPulidReferenceImage,
  queueComfyPrompt,
  resolveFluxPulidModelNameInComfy,
  waitForComfyPrompt,
  waitForComfyServer,
} from '../src/services/comfyui-client.js'
import { LOCAL_COMIC_ENV } from '../src/constants/local-comic.js'
import { getAbsolutePath } from '../src/utils/storage.js'
import sharp from 'sharp'

const REF = process.argv[2] || 'static/uploads/5a5ce588-9eac-417e-80a0-125250807303.png'
const STORYBOARD_ID = Number(process.argv[3] || 272)

const FALLBACK_POSITIVE = finalizeFluxStoryboardPositivePrompt([
  'Camera and composition: medium close-up eye-level, focusing on the upper body interacting with a computer.',
  'Environment and era: modern office space, dark gray metal-framed desk with wooden surface, transparent glass keyboard and dual monitors.',
  'Action and interaction: hands typing on keyboard, screen blue light casting facial contour lines, looking at monitor not camera.',
  'Subjects in frame: young male programmer in black hoodie, solo, masculine facial features.',
  'Lighting and color: afternoon office, cool monitor light on face, soft ambient fill.',
  'Art style spec: 16:9 cinematic anime, Makoto Shinkai/KyoAni, clean lineart, soft cel shading.',
  'Render quality: clean lineart, cinematic soft light, no text, no watermark.',
].join(' '))

function loadStoryboardFluxPrompt(storyboardId: number): string {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) {
    console.warn('[pulid-test] storyboard not found:', storyboardId)
    return FALLBACK_POSITIVE
  }
  try {
    const meta = JSON.parse(String(sb.referenceImages || '{}')) as { flux_prompt_en?: string }
    const en = String(meta.flux_prompt_en || '').trim()
    if (en) return finalizeFluxStoryboardPositivePrompt(en)
  } catch {}
  console.warn('[pulid-test] no flux_prompt_en on storyboard', storyboardId)
  return FALLBACK_POSITIVE
}

async function main() {
  console.log('[pulid-test] disk ready:', isFluxPulidReady())
  console.log('[pulid-test] waiting for ComfyUI...')
  if (!(await waitForComfyServer(30_000))) throw new Error('ComfyUI offline')
  const comfyReady = await isFluxPulidReadyInComfy()
  console.log('[pulid-test] comfy node ready:', comfyReady)
  if (!comfyReady) throw new Error('ApplyPulidFlux not loaded — restart ComfyUI after setup-pulid-flux.ps1')

  const positive = augmentFluxPulidStoryboardPositive(
    STORYBOARD_ID ? loadStoryboardFluxPrompt(STORYBOARD_ID) : FALLBACK_POSITIVE,
  )
  const pulidModel = await resolveFluxPulidModelNameInComfy()
  console.log('[pulid-test] pulid model:', pulidModel)
  console.log('[pulid-test] ref:', REF)
  console.log('[pulid-test] storyboardId:', STORYBOARD_ID || '(fallback prompt)')
  console.log('[pulid-test] positive:', positive.slice(0, 320))

  const size = clampComfyStoryboardSize(1360, 760)
  const faceOnly = LOCAL_COMIC_ENV.fluxPulidStoryboardFaceOnly
  const refName = await prepareFluxPulidReferenceImage(REF, { faceOnly })
  console.log('[pulid-test] comfy ref image:', refName, 'faceOnly:', faceOnly)
  console.log('[pulid-test] pulid weight/endAt:', LOCAL_COMIC_ENV.fluxPulidWeight, LOCAL_COMIC_ENV.fluxPulidEndAt)

  const prompt = loadWorkflowTemplate('flux_dev_fp8_pulid')
  injectFluxPulidWorkflow(prompt, {
    positive,
    negative: COMFY_FLUX_PULID_STORYBOARD_NEGATIVE,
    width: size.width,
    height: size.height,
    steps: 20,
    cfg: 1,
    seed: 20260712,
    referenceImage: refName,
    pulidModel: pulidModel || LOCAL_COMIC_ENV.fluxPulidModel,
    pulidWeight: LOCAL_COMIC_ENV.fluxPulidStoryboardWeight,
    pulidStartAt: LOCAL_COMIC_ENV.fluxPulidStoryboardStartAt,
    pulidEndAt: LOCAL_COMIC_ENV.fluxPulidStoryboardEndAt,
  })

  const promptId = await queueComfyPrompt(prompt)
  console.log('[pulid-test] queued:', promptId, '— generating (warm ~1min, cold start may take longer)...')
  const outputs = await waitForComfyPrompt(promptId, 3_600_000)
  const localPath = copyComfyImageOutput(outputs, 'images')
  const abs = getAbsolutePath(localPath)
  const meta = await sharp(abs).metadata()
  console.log('[pulid-test] done!')
  console.log('[pulid-test] path:', localPath)
  console.log('[pulid-test] pixels:', `${meta.width}x${meta.height}`)
}

main().catch((err) => {
  console.error('[pulid-test] failed:', err.message)
  process.exit(1)
})
