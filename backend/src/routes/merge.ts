import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { mergeEpisodeVideos, cancelEpisodeMerge, getMergeProgress, isMergeActive, mergeOpeningIntoEpisodeVideo, isTestMergeRecord } from '../services/ffmpeg-merge.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { now } from '../utils/response.js'

const app = new Hono()

function reconcileStaleMerge(episodeId: number, latest: typeof schema.videoMerges.$inferSelect) {
  if (!['processing', 'pending'].includes(latest.status || '')) return latest
  if (isMergeActive(episodeId, latest.id)) return latest

  const progress = getMergeProgress(episodeId)
  if (progress?.mergeId === latest.id && Date.now() - progress.updatedAt < 120_000) {
    return latest
  }

  db.update(schema.videoMerges)
    .set({ status: 'failed', errorMsg: '拼接因服务重启或热更新中断，请点击「重新拼接」', completedAt: now() })
    .where(eq(schema.videoMerges.id, latest.id))
    .run()

  return {
    ...latest,
    status: 'failed',
    errorMsg: '拼接因服务重启或热更新中断，请点击「重新拼接」',
    completedAt: now(),
  }
}

function getLastCompletedMainMerge(episodeId: number) {
  for (const record of getLatestMergeRecords(episodeId)) {
    if (isTestMergeRecord(record)) continue
    if (record.status === 'completed') return record
  }
  return null
}

function getLatestMergeRecords(episodeId: number, limit = 30) {
  return db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .orderBy(desc(schema.videoMerges.id))
    .limit(limit)
    .all()
}

function getLatestMainMerge(episodeId: number) {
  return getLatestMergeRecords(episodeId).find(record => !isTestMergeRecord(record)) ?? null
}

function getLatestTestMerge(episodeId: number) {
  return getLatestMergeRecords(episodeId).find(record => isTestMergeRecord(record)) ?? null
}

function attachMergeProgress(
  episodeId: number,
  reconciled: typeof schema.videoMerges.$inferSelect,
  payload: Record<string, unknown>,
) {
  const progress = getMergeProgress(episodeId)
  if (progress && ['processing', 'pending'].includes(String(reconciled.status)) && progress.mergeId === reconciled.id) {
    payload.progress_percent = progress.percent
    payload.progress_message = progress.message
    payload.progress_phase = progress.phase
  }
}

function buildMergeStatusPayload(episodeId: number, latest: typeof schema.videoMerges.$inferSelect | null) {
  if (!latest) return null

  const reconciled = reconcileStaleMerge(episodeId, latest)
  const payload = toSnakeCase(reconciled) as Record<string, unknown>
  attachMergeProgress(episodeId, reconciled, payload)

  if (['failed', 'cancelled'].includes(String(reconciled.status))) {
    payload.merged_url = null
    payload.duration = null
    payload.completed_at = null
    const lastCompleted = getLastCompletedMainMerge(episodeId)
    if (lastCompleted?.mergedUrl) {
      payload.previous_merged_url = lastCompleted.mergedUrl
      payload.previous_duration = lastCompleted.duration
      payload.previous_completed_at = lastCompleted.completedAt
    }
  }

  return payload
}

function buildTestMergeStatusPayload(episodeId: number, latest: typeof schema.videoMerges.$inferSelect | null) {
  if (!latest) return null

  const reconciled = reconcileStaleMerge(episodeId, latest)
  const payload = toSnakeCase(reconciled) as Record<string, unknown>
  attachMergeProgress(episodeId, reconciled, payload)

  if (['failed', 'cancelled'].includes(String(reconciled.status))) {
    payload.merged_url = null
    payload.duration = null
    payload.completed_at = null
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

  const bgmMusicId = body?.bgm_music_id ? Number(body.bgm_music_id) : undefined
  const bgmVolume = body?.bgm_volume != null ? Number(body.bgm_volume) : undefined
  const includeOpeningVideo = body?.include_opening_video === true
  const clipLimitRaw = body?.clip_limit ?? body?.clipLimit
  const clipLimit = clipLimitRaw != null && Number.isFinite(Number(clipLimitRaw)) && Number(clipLimitRaw) > 0
    ? Math.floor(Number(clipLimitRaw))
    : undefined

  try {
    logTaskStart('MergeAPI', clipLimit ? 'episode-merge-test' : 'episode-merge', { episodeId, dramaId: ep.dramaId, bgmMusicId, includeOpeningVideo, clipLimit })
    const mergeId = await mergeEpisodeVideos(episodeId, ep.dramaId, {
      bgmMusicId: bgmMusicId && Number.isFinite(bgmMusicId) ? bgmMusicId : undefined,
      bgmVolume: bgmVolume != null && Number.isFinite(bgmVolume) ? bgmVolume : undefined,
      includeOpeningVideo,
      clipLimit,
    })
    logTaskSuccess('MergeAPI', clipLimit ? 'episode-merge-test' : 'episode-merge', { episodeId, mergeId, clipLimit })
    return success(c, { merge_id: mergeId, status: 'processing', test: !!clipLimit, clip_limit: clipLimit })
  } catch (err: any) {
    logTaskError('MergeAPI', clipLimit ? 'episode-merge-test' : 'episode-merge', { episodeId, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/merge/opening — 将开幕视频合并进已完成的主片
app.post('/episodes/:id/merge/opening', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')

  if (body?.cancel_running !== false) {
    cancelEpisodeMerge(episodeId)
  }

  try {
    logTaskStart('MergeAPI', 'opening-merge', { episodeId, dramaId: ep.dramaId })
    const mergeId = await mergeOpeningIntoEpisodeVideo(episodeId, ep.dramaId)
    logTaskSuccess('MergeAPI', 'opening-merge', { episodeId, mergeId })
    return success(c, { merge_id: mergeId, status: 'processing' })
  } catch (err: any) {
    logTaskError('MergeAPI', 'opening-merge', { episodeId, error: err.message })
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

// GET /episodes/:id/merge — 查询拼接状态（含测试导出）
app.get('/episodes/:id/merge', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const mainLatest = getLatestMainMerge(episodeId)
  const testLatest = getLatestTestMerge(episodeId)
  const payload = buildMergeStatusPayload(episodeId, mainLatest) || {}
  const testPayload = buildTestMergeStatusPayload(episodeId, testLatest)
  if (testPayload) payload.test = testPayload
  return success(c, payload)
})

export default app
