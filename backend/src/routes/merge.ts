import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { mergeEpisodeVideos, cancelEpisodeMerge, getMergeProgress, isMergeActive } from '../services/ffmpeg-merge.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { now } from '../utils/response.js'

const app = new Hono()

function getLatestMerge(episodeId: number) {
  const [latest] = db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .orderBy(desc(schema.videoMerges.id))
    .limit(1)
    .all()
  return latest ?? null
}

function reconcileStaleMerge(episodeId: number, latest: typeof schema.videoMerges.$inferSelect) {
  if (!['processing', 'pending'].includes(latest.status || '')) return latest
  if (isMergeActive(episodeId, latest.id)) return latest

  db.update(schema.videoMerges)
    .set({ status: 'failed', errorMsg: '任务已中断，请重新生成', completedAt: now() })
    .where(eq(schema.videoMerges.id, latest.id))
    .run()

  return {
    ...latest,
    status: 'failed',
    errorMsg: '任务已中断，请重新生成',
    completedAt: now(),
  }
}

function getLastCompletedMerge(episodeId: number) {
  const [completed] = db.select().from(schema.videoMerges)
    .where(and(
      eq(schema.videoMerges.episodeId, episodeId),
      eq(schema.videoMerges.status, 'completed'),
    ))
    .orderBy(desc(schema.videoMerges.id))
    .limit(1)
    .all()
  return completed ?? null
}

function buildMergeStatusPayload(episodeId: number, latest: typeof schema.videoMerges.$inferSelect | null) {
  if (!latest) return null

  const reconciled = reconcileStaleMerge(episodeId, latest)
  const payload = toSnakeCase(reconciled) as Record<string, unknown>
  const progress = getMergeProgress(episodeId)

  if (progress && ['processing', 'pending'].includes(String(reconciled.status))) {
    payload.progress_percent = progress.percent
    payload.progress_message = progress.message
    payload.progress_phase = progress.phase
  }

  if (!payload.merged_url && ['failed', 'cancelled'].includes(String(reconciled.status))) {
    const lastCompleted = getLastCompletedMerge(episodeId)
    if (lastCompleted?.mergedUrl) {
      payload.merged_url = lastCompleted.mergedUrl
      payload.duration = lastCompleted.duration
      payload.completed_at = lastCompleted.completedAt
    }
  }

  return payload
}

// POST /episodes/:id/merge — 拼接全集视频（若已有任务在跑会先取消）
app.post('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')

  if (body?.cancel_running !== false) {
    cancelEpisodeMerge(episodeId)
  }

  try {
    logTaskStart('MergeAPI', 'episode-merge', { episodeId, dramaId: ep.dramaId })
    const mergeId = await mergeEpisodeVideos(episodeId, ep.dramaId)
    logTaskSuccess('MergeAPI', 'episode-merge', { episodeId, mergeId })
    return success(c, { merge_id: mergeId, status: 'processing' })
  } catch (err: any) {
    logTaskError('MergeAPI', 'episode-merge', { episodeId, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/merge/cancel — 取消正在进行的拼接
app.post('/episodes/:id/merge/cancel', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const cancelled = cancelEpisodeMerge(episodeId)
  if (!cancelled) return badRequest(c, '当前没有进行中的拼接任务')
  return success(c, { status: 'cancelled' })
})

// GET /episodes/:id/merge — 查询拼接状态
app.get('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const latest = getLatestMerge(episodeId)
  return success(c, buildMergeStatusPayload(episodeId, latest))
})

export default app
