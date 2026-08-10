import { Hono } from 'hono'
import { eq, and, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/image-generation.js'
import { resolveSceneImageModel } from '../constants/image-models.js'
import { resolveEpisodeVisualStyle } from '../constants/art-styles.js'
import { resolveEpisodeProductionMode } from '../constants/production-mode.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { narrationPropType } from '../services/narration-scene-assets.js'

const app = new Hono()

// POST /props
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id || !body.name) return badRequest(c, 'drama_id and name required')
  const ts = now()
  const episodeId = body.episode_id != null ? Number(body.episode_id) : null
  const res = db.insert(schema.props).values({
    dramaId: Number(body.drama_id),
    name: String(body.name).trim(),
    type: episodeId ? narrationPropType(episodeId) : (body.type || 'narration'),
    description: body.description || body.prompt || '',
    prompt: body.prompt || body.description || '',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [row] = db.select().from(schema.props).where(eq(schema.props.id, Number(res.lastInsertRowid))).all()
  return created(c, toSnakeCase(row))
})

// PUT /props/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [row] = db.select().from(schema.props).where(eq(schema.props.id, id)).all()
  if (!row || row.deletedAt) return notFound(c)
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.description !== undefined) updates.description = body.description
  if (body.prompt !== undefined) updates.prompt = body.prompt
  if (body.image_url !== undefined || body.imageUrl !== undefined) {
    updates.imageUrl = body.image_url ?? body.imageUrl
  }
  db.update(schema.props).set(updates).where(eq(schema.props.id, id)).run()
  return success(c)
})

// POST /props/:id/generate-image — 白底静物定妆
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [prop] = db.select().from(schema.props).where(eq(schema.props.id, id)).all()
  if (!prop || prop.deletedAt) return badRequest(c, 'Prop not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, prop.dramaId)).all()
  const style = resolveEpisodeVisualStyle(ep.id, {
    imageStyle: body.image_style ?? body.imageStyle,
    dramaStyle: drama?.style,
  })
  const desc = String(prop.prompt || prop.description || prop.name).trim()
  if (!desc) return badRequest(c, '道具描述为空，请先填写描述词')

  try {
    const productionMode = resolveEpisodeProductionMode(ep.id)
    // 只按道具描述词生图；frameType 仅用于走静物链路，不往 prompt 里塞模板
    const model = resolveSceneImageModel(ep, body.model, productionMode)
    logTaskStart('PropImage', 'generate', { propId: id, episodeId: ep.id, name: prop.name, model })
    const genId = await generateImage({
      propId: id,
      dramaId: prop.dramaId,
      prompt: desc,
      model,
      style,
      frameType: 'prop-still-life',
      configId: ep.imageConfigId ?? undefined,
      size: body.size || '1024x1024',
      usePortraitReference: false,
    })
    logTaskSuccess('PropImage', 'generate', { propId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('PropImage', 'generate', { propId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// DELETE /props/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.update(schema.props).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.props.id, id)).run()
  return success(c)
})

export default app
