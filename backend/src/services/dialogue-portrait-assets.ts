/**
 * 对话立绘资产生成：角色表情包 idle/talk/react
 * 优先 Qwen-Edit 基于定妆改表情；失败或未就绪则三态回退基图（不覆盖 imageUrl）
 */
import fs from 'fs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { getAbsolutePath } from '../utils/storage.js'
import { normalizeStaticRel } from './storyboard-asset-replace.js'
import {
  DIALOGUE_PORTRAIT_EXPRESSIONS,
  DIALOGUE_PORTRAIT_EXPRESSION_PROMPTS,
  appendDialoguePortraitEmptyScenePrompt,
  isDialoguePortraitExpressionPackComplete,
  mergeCharacterDialoguePortraitPack,
  parseCharacterDialoguePortraitPack,
  type DialoguePortraitExpression,
  type DialoguePortraitExpressionPack,
} from '../constants/dialogue-portrait.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import {
  clampComfyImageSize,
  copyComfyImageOutput,
  injectQwenImageEditWorkflow,
  isQwenImageEditReady,
  loadWorkflowTemplate,
  queueComfyPrompt,
  resolveQwenEditUnetName,
  uploadImageToComfyInput,
  waitForComfyPrompt,
  waitForComfyServer,
} from './comfyui-client.js'
import { ensureComfyWorkflowFamily, ensureLocalModelStage, freeComfyUIMemory } from './local-model-manager.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

export { appendDialoguePortraitEmptyScenePrompt }

function normalizePortraitPath(url?: string | null): string {
  const rel = normalizeStaticRel(url)
  if (!rel) return ''
  return rel.startsWith('static/') ? rel : (rel.startsWith('/') ? rel.slice(1) : rel)
}

async function generateOneExpressionEdit(
  baseRel: string,
  expression: DialoguePortraitExpression,
): Promise<string> {
  const abs = getAbsolutePath(baseRel)
  if (!fs.existsSync(abs)) throw new Error(`定妆基图不存在: ${baseRel}`)

  const size = clampComfyImageSize(768, 1344, 1344)
  const refFile = uploadImageToComfyInput(baseRel, `dp_expr_${expression}_${Date.now()}.png`)
  const unet = resolveQwenEditUnetName()
  const wf = loadWorkflowTemplate('qwen_image_edit')
  injectQwenImageEditWorkflow(wf, {
    positive: DIALOGUE_PORTRAIT_EXPRESSION_PROMPTS[expression],
    negative: 'extra people, text, watermark, speed lines, exaggerated deformation, multiple faces',
    width: size.width,
    height: size.height,
    referenceImage: refFile,
    unetName: unet,
    lightningLora: null,
    steps: LOCAL_COMIC_ENV.qwenEditPortraitSteps || LOCAL_COMIC_ENV.qwenEditGuidedSteps,
    cfg: LOCAL_COMIC_ENV.qwenEditPortraitCfg || LOCAL_COMIC_ENV.qwenEditGuidedCfg,
    shift: LOCAL_COMIC_ENV.qwenEditShift,
  })
  const promptId = await queueComfyPrompt(wf)
  const outputs = await waitForComfyPrompt(promptId, 600_000)
  return copyComfyImageOutput(outputs, 'dialogue-expressions')
}

export type GenerateDialoguePortraitExpressionsOptions = {
  force?: boolean
  episodeId?: number
  /** 前端传入的风格字段（MVP 预留，当前不影响路径） */
  imageStyle?: string
  /** 为 false 时跳过 Comfy，直接回退基图 */
  tryAiEdit?: boolean
}

export async function generateDialoguePortraitExpressions(
  characterId: number,
  options?: GenerateDialoguePortraitExpressionsOptions,
): Promise<{
  idle: string
  talk: string
  react: string
  dialogue_portrait: DialoguePortraitExpressionPack
  reference_images: string
  character: Record<string, unknown>
  fallback: boolean
}> {
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  if (!char || char.deletedAt) throw new Error('Character not found')

  const basePath = normalizePortraitPath(char.imageUrl || char.localPath)
  if (!basePath) {
    throw new Error('请先生成定妆基图，再生成表情包')
  }

  const existing = parseCharacterDialoguePortraitPack(char.referenceImages)
  if (!options?.force && isDialoguePortraitExpressionPackComplete(existing)) {
    logTaskProgress('DialoguePortrait', 'expressions-reuse', {
      characterId,
      episodeId: options?.episodeId,
    })
    const pack: DialoguePortraitExpressionPack = {
      idle: existing.idle!,
      talk: existing.talk!,
      react: existing.react!,
    }
    return {
      idle: pack.idle!,
      talk: pack.talk!,
      react: pack.react!,
      dialogue_portrait: pack,
      reference_images: char.referenceImages || mergeCharacterDialoguePortraitPack(null, pack),
      character: toSnakeCase(char as unknown as Record<string, unknown>),
      fallback: false,
    }
  }

  logTaskStart('DialoguePortrait', 'expressions-generate', {
    characterId,
    episodeId: options?.episodeId,
    force: !!options?.force,
    basePath,
  })

  const pack: DialoguePortraitExpressionPack = {}
  let fallback = false
  const tryAi = options?.tryAiEdit !== false

  if (tryAi) {
    try {
      await ensureLocalModelStage('image')
      const online = await waitForComfyServer()
      if (!online) throw new Error('ComfyUI 未启动')
      if (!isQwenImageEditReady()) throw new Error('Qwen-Image-Edit 权重未就绪')
      await ensureComfyWorkflowFamily('qwen')
      await freeComfyUIMemory()

      for (const expr of DIALOGUE_PORTRAIT_EXPRESSIONS) {
        try {
          logTaskProgress('DialoguePortrait', 'expression-edit', { characterId, expression: expr })
          pack[expr] = await generateOneExpressionEdit(basePath, expr)
        } catch (err: unknown) {
          pack[expr] = basePath
          fallback = true
          logTaskWarn('DialoguePortrait', 'expression-fallback', {
            characterId,
            expression: expr,
            error: String((err as Error)?.message || err),
          })
        }
      }
    } catch (err: unknown) {
      fallback = true
      for (const expr of DIALOGUE_PORTRAIT_EXPRESSIONS) pack[expr] = basePath
      logTaskWarn('DialoguePortrait', 'expressions-ai-unavailable', {
        characterId,
        error: String((err as Error)?.message || err),
        message: 'AI 表情编辑不可用，三态回退定妆基图',
      })
    }
  } else {
    fallback = true
    for (const expr of DIALOGUE_PORTRAIT_EXPRESSIONS) pack[expr] = basePath
  }

  for (const expr of DIALOGUE_PORTRAIT_EXPRESSIONS) {
    if (!String(pack[expr] || '').trim()) {
      pack[expr] = basePath
      fallback = true
    }
  }

  const referenceImages = mergeCharacterDialoguePortraitPack(char.referenceImages, pack)
  db.update(schema.characters)
    .set({ referenceImages, updatedAt: now() })
    .where(eq(schema.characters.id, characterId))
    .run()

  const [updated] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  logTaskSuccess('DialoguePortrait', 'expressions-generate', {
    characterId,
    expressions: DIALOGUE_PORTRAIT_EXPRESSIONS.join(','),
    fallback,
  })

  return {
    idle: pack.idle!,
    talk: pack.talk!,
    react: pack.react!,
    dialogue_portrait: pack,
    reference_images: referenceImages,
    character: toSnakeCase((updated || char) as unknown as Record<string, unknown>),
    fallback,
  }
}

export async function batchGenerateDialoguePortraitExpressions(
  characterIds: number[],
  options?: GenerateDialoguePortraitExpressionsOptions,
): Promise<{
  count: number
  results: Array<{
    character_id: number
    ok: boolean
    error?: string
    data?: Awaited<ReturnType<typeof generateDialoguePortraitExpressions>>
  }>
  /** FE `batchDialogueExpressions` 读取 characters / items */
  characters: Array<Record<string, unknown> & {
    id: number
    dialogue_portrait: DialoguePortraitExpressionPack
    reference_images: string
    idle: string
    talk: string
    react: string
    fallback: boolean
  }>
  items: Array<Record<string, unknown> & {
    id: number
    dialogue_portrait: DialoguePortraitExpressionPack
    reference_images: string
    idle: string
    talk: string
    react: string
    fallback: boolean
  }>
}> {
  const results: Array<{
    character_id: number
    ok: boolean
    error?: string
    data?: Awaited<ReturnType<typeof generateDialoguePortraitExpressions>>
  }> = []

  for (const id of characterIds) {
    try {
      const data = await generateDialoguePortraitExpressions(id, options)
      results.push({ character_id: id, ok: true, data })
    } catch (err: unknown) {
      results.push({
        character_id: id,
        ok: false,
        error: String((err as Error)?.message || err || 'unknown'),
      })
      logTaskError('DialoguePortrait', 'batch-item-failed', {
        characterId: id,
        error: String((err as Error)?.message || err),
      })
    }
  }

  const characters = results
    .filter((r): r is typeof r & { data: NonNullable<typeof r.data> } => !!r.ok && !!r.data)
    .map((r) => ({
      id: r.character_id,
      ...(r.data.character || {}),
      dialogue_portrait: r.data.dialogue_portrait,
      reference_images: r.data.reference_images,
      idle: r.data.idle,
      talk: r.data.talk,
      react: r.data.react,
      fallback: r.data.fallback,
    }))

  return {
    count: characters.length,
    results,
    characters,
    items: characters,
  }
}
