import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { applyBgmToEpisodeStoryboards, applyBgmToStoryboard, generateBgm, listMusicGenerations, resumePendingBgmTasks, syncBgmRecord } from '../services/bgm-generation.js'
import { generateBgmDescriptionWithLLM } from '../services/bgm-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

app.get('/', (c) => {
  const episodeId = c.req.query('episode_id')
  const dramaId = c.req.query('drama_id')
  const storyboardId = c.req.query('storyboard_id')
  const rows = listMusicGenerations({
    episodeId: episodeId ? Number(episodeId) : undefined,
    dramaId: dramaId ? Number(dramaId) : undefined,
    storyboardId: storyboardId ? Number(storyboardId) : undefined,
  })
  return success(c, toSnakeCaseArray(rows))
})

app.post('/resume-pending', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const episodeId = body.episode_id ? Number(body.episode_id) : undefined
  const dramaId = body.drama_id ? Number(body.drama_id) : undefined
  const resumed = resumePendingBgmTasks({ episodeId, dramaId })
  return success(c, { resumed, episode_id: episodeId, drama_id: dramaId })
})

app.post('/suggest-description', async (c) => {
  const body = await c.req.json()
  let storyboard: typeof schema.storyboards.$inferSelect | undefined
  if (body.storyboard_id) {
    const [row] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
    storyboard = row
  }

  let content = String(body.content || '').trim()
  if (!content && body.episode_id) {
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
    content = String(ep?.scriptContent || ep?.content || '').trim()
  }

  try {
    const description = await generateBgmDescriptionWithLLM({
      model: body.model,
      description: body.description,
      content,
      episodeId: body.episode_id ? Number(body.episode_id) : undefined,
      storyboardId: body.storyboard_id ? Number(body.storyboard_id) : undefined,
      storyboard,
    })
    return success(c, { description })
  } catch (err: any) {
    logTaskError('MusicAPI', 'suggest-description', { error: err.message })
    return badRequest(c, err.message)
  }
})

app.post('/generate', async (c) => {
  const body = await c.req.json()
  if (!body.episode_id && !body.storyboard_id && !body.drama_id) {
    return badRequest(c, 'episode_id, storyboard_id or drama_id is required')
  }

  try {
    logTaskStart('MusicAPI', 'generate', {
      episodeId: body.episode_id,
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
    })
    const ids = await generateBgm({
      dramaId: body.drama_id,
      episodeId: body.episode_id,
      storyboardId: body.storyboard_id,
      description: body.description,
      prompt: body.prompt,
      content: body.content,
      configId: body.config_id,
      model: body.model,
      autoApply: body.auto_apply === true,
    })
    const rows = ids.map(id => db.select().from(schema.musicGenerations).where(eq(schema.musicGenerations.id, id)).all()[0])
    logTaskSuccess('MusicAPI', 'generate', { ids })
    return created(c, { ids, items: toSnakeCaseArray(rows) })
  } catch (err: any) {
    logTaskError('MusicAPI', 'generate', { error: err.message })
    return badRequest(c, err.message)
  }
})

app.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.musicGenerations).where(eq(schema.musicGenerations.id, id)).all()
  return success(c, row ? toSnakeCase(row) : null)
})

app.post('/:id/sync', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return badRequest(c, 'invalid id')
  try {
    const row = await syncBgmRecord(id)
    return success(c, row ? toSnakeCase(row) : null)
  } catch (err: any) {
    logTaskError('MusicAPI', 'sync', { id, error: err.message })
    return badRequest(c, err.message)
  }
})

app.post('/:id/apply', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  if (!body.storyboard_id) return badRequest(c, 'storyboard_id is required')

  try {
    applyBgmToStoryboard(Number(body.storyboard_id), id)
    const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
    return success(c, sb ? toSnakeCase(sb) : null)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.post('/:id/apply-all', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const episodeId = Number(body.episode_id)
  if (!episodeId) return badRequest(c, 'episode_id is required')

  try {
    const applied = applyBgmToEpisodeStoryboards(episodeId, id)
    return success(c, { applied, episode_id: episodeId })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  db.update(schema.musicGenerations)
    .set({ status: 'deleted', updatedAt: now() })
    .where(eq(schema.musicGenerations.id, id))
    .run()
  return success(c, { id })
})

export default app
