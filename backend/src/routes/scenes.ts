import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { resolveSceneImageModel } from '../constants/image-models.js'
import { isDialoguePortraitMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import {
  buildDialoguePortraitScenePrompt,
  DIALOGUE_PORTRAIT_SCENE_ART_STYLE,
  DIALOGUE_PORTRAIT_SCENE_NEGATIVE,
} from '../constants/dialogue-portrait.js'
import { artStylePrompt, resolveEpisodeVisualStyle } from '../constants/art-styles.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const res = db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [result] = db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, Number(res.lastInsertRowid))).all()
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, id)).all()
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, scene.dramaId)).all()
  const style = resolveEpisodeVisualStyle(ep.id, {
    imageStyle: body.image_style ?? body.imageStyle,
    dramaStyle: drama?.style,
  })
  const sceneDesc = String(scene.prompt || `${scene.location}, ${scene.time || ''}`).trim()
  const productionMode = resolveEpisodeProductionMode(ep.id)
  // 对话立绘：禁用分镜七维空模板（含「双眸」），改用无人环境宽景文案 + kolors 文生图
  const prompt = isDialoguePortraitMode(productionMode)
    ? buildDialoguePortraitScenePrompt(sceneDesc, DIALOGUE_PORTRAIT_SCENE_ART_STYLE)
    : `${artStylePrompt(style, 'scene')}, ${sceneDesc}, 16:9 landscape, high quality, no text, no watermark`

  try {
    const model = resolveSceneImageModel(ep, undefined, productionMode)
    logTaskStart('SceneImage', 'generate', {
      sceneId: id,
      episodeId: ep.id,
      dramaId: scene.dramaId,
      location: scene.location,
      style,
      productionMode,
      model,
      promptPreview: prompt.slice(0, 240),
    })
    db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    const genId = await generateImage({
      sceneId: id,
      dramaId: scene.dramaId,
      prompt,
      negativePrompt: isDialoguePortraitMode(productionMode)
        ? DIALOGUE_PORTRAIT_SCENE_NEGATIVE
        : undefined,
      model,
      style,
      configId: ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    return badRequest(c, err.message)
  }
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
