import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { composeStoryboard, getStoryboardVisualSource, pickVisualGroupComposeLeaders } from '../services/ffmpeg-compose.js'
import { sortStoryboardsByOrder } from '../services/narration-image.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { toSnakeCase } from '../utils/transform.js'

const app = new Hono()

const COMPOSE_CONCURRENCY = Math.max(1, Number(process.env.COMPOSE_CONCURRENCY || 3))

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  if (!items.length) return
  let cursor = 0
  async function runWorker() {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => runWorker()))
}

// POST /storyboards/:id/compose — 合成单个镜头
app.post('/storyboards/:id/compose', async (c) => {
  const id = Number(c.req.param('id'))
  try {
    logTaskStart('ComposeAPI', 'single-compose', { storyboardId: id })
    const composedUrl = await composeStoryboard(id)
    logTaskSuccess('ComposeAPI', 'single-compose', { storyboardId: id, output: composedUrl })
    return success(c, { id, composed_video_url: composedUrl })
  } catch (err: any) {
    logTaskError('ComposeAPI', 'single-compose', { storyboardId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/compose-all — 批量合成镜头（默认仅剩余未合成）
app.post('/episodes/:id/compose-all', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const onlyRemaining = body?.only_remaining !== false
  const rawIds = body?.storyboard_ids ?? body?.storyboardIds
  const storyboardIds = Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => Number(id)).filter(id => Number.isFinite(id) && id > 0)
    : []

  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )

  if (storyboards.length === 0) return badRequest(c, 'No storyboards found')

  let composable = storyboards.filter(sb => {
    const visual = getStoryboardVisualSource(sb, storyboards)
    const hasDialogue = !!(sb.dialogue || '').trim()
    return !!visual || hasDialogue
  })
  if (storyboardIds.length > 0) {
    const idSet = new Set(storyboardIds)
    composable = composable.filter(sb => idSet.has(sb.id))
  }
  if (composable.length === 0) return badRequest(c, 'No storyboards have video or image yet')

  const targets = onlyRemaining
    ? composable.filter(sb => !sb.composedVideoUrl || sb.status === 'compose_failed')
    : composable
  if (targets.length === 0) {
    return badRequest(c, onlyRemaining ? '没有待合成的镜头' : '没有可合成的镜头')
  }

  const composeTargets = pickVisualGroupComposeLeaders(targets, storyboards)

  for (const sb of targets) {
    db.update(schema.storyboards)
      .set({
        status: 'compose_processing',
        composedVideoUrl: onlyRemaining ? sb.composedVideoUrl : null,
        updatedAt: now(),
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
  }

  ;(async () => {
    await mapWithConcurrency(composeTargets, COMPOSE_CONCURRENCY, async (sb) => {
      try {
        await composeStoryboard(sb.id)
      } catch (err: any) {
        logTaskError('ComposeAPI', 'batch-item', { storyboardId: sb.id, episodeId, error: err.message })
      }
    })
    logTaskSuccess('ComposeAPI', 'batch-compose', {
      episodeId,
      total: composeTargets.length,
      storyboardCount: targets.length,
      onlyRemaining,
      concurrency: COMPOSE_CONCURRENCY,
    })
  })()

  logTaskStart('ComposeAPI', 'batch-compose', {
    episodeId,
    total: composeTargets.length,
    storyboardCount: targets.length,
    onlyRemaining,
    storyboardIds: storyboardIds.length ? storyboardIds : undefined,
    concurrency: COMPOSE_CONCURRENCY,
  })
  return success(c, {
    message: onlyRemaining
      ? `Started composing ${composeTargets.length} visual groups (${targets.length} storyboards)`
      : `Started composing ${composeTargets.length} visual groups (${targets.length} storyboards)`,
    total: composeTargets.length,
    storyboard_count: targets.length,
    only_remaining: onlyRemaining,
    storyboard_ids: targets.map(sb => sb.id),
    concurrency: COMPOSE_CONCURRENCY,
  })
})

// GET /episodes/:id/compose-status — 查询批量合成状态
app.get('/episodes/:id/compose-status', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )

  const composable = storyboards.filter(sb => {
    const visual = getStoryboardVisualSource(sb, storyboards)
    const hasDialogue = !!(sb.dialogue || '').trim()
    return !!visual || hasDialogue
  })
  const completed = composable.filter(sb => sb.status === 'compose_completed' && !!sb.composedVideoUrl)
  const failed = composable.filter(sb => sb.status === 'compose_failed')
  const processing = composable.filter(sb => sb.status === 'compose_processing')
  const idle = composable.filter(sb => !sb.status || !String(sb.status).startsWith('compose_'))

  return success(c, {
    total: composable.length,
    completed: completed.length,
    failed: failed.length,
    processing: processing.length,
    idle: idle.length,
    items: composable.map((sb) => toSnakeCase({
      id: sb.id,
      storyboardNumber: sb.storyboardNumber,
      status: sb.status || 'pending',
      composedVideoUrl: sb.composedVideoUrl,
      errorMsg: sb.status === 'compose_failed' ? '视频合成失败，请检查视频、配音或字幕素材' : '',
    })),
  })
})

export default app
