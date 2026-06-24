import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { sortStoryboardsByOrder, parseNarrationImageMeta, buildNarrationImageMeta } from './narration-image.js'
import {
  deleteUniqueStaticFiles,
  imagePathsToDelete,
  normalizeStaticRel,
} from './storyboard-asset-replace.js'

function collectEpisodeStoryboards(episodeId: number) {
  return sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(sb => !sb.deletedAt),
  )
}

function stripImageClearMeta(referenceImages: string | null | undefined): string | undefined {
  if (!referenceImages) return undefined
  try {
    const raw = typeof referenceImages === 'string' ? JSON.parse(referenceImages) : referenceImages
    if (!raw || typeof raw !== 'object') return undefined
    const parsed = { ...(raw as Record<string, unknown>) }
    delete parsed.narration_image_source
    delete parsed.wm_crop_applied
    delete parsed.wm_crop_mode
    if (parsed.narration_image_mode === 'copy') {
      parsed.narration_image_mode = 'inherit'
    }
    return JSON.stringify(parsed)
  } catch {
    return undefined
  }
}

/** 清除本集所有镜头配图（含上传与 AI 生成），删除文件并清空数据库字段 */
export async function clearEpisodeNarrationImages(episodeId: number) {
  const storyboards = collectEpisodeStoryboards(episodeId)
  const withImage = storyboards.filter(sb => normalizeStaticRel(sb.composedImage))
  if (!withImage.length) {
    return { cleared: 0, files_deleted: 0, generations_deleted: 0 }
  }

  logTaskStart('EpisodeAssetClear', 'narration-images', {
    episodeId,
    storyboardCount: withImage.length,
  })

  const pathsToDelete: string[] = []
  for (const sb of withImage) {
    pathsToDelete.push(...imagePathsToDelete(String(sb.composedImage || '')))
  }

  const storyboardIds = withImage.map(sb => sb.id)
  const gens = storyboardIds.length
    ? db.select().from(schema.imageGenerations)
      .where(inArray(schema.imageGenerations.storyboardId, storyboardIds))
      .all()
    : []
  for (const gen of gens) {
    if (gen.localPath) pathsToDelete.push(normalizeStaticRel(gen.localPath))
  }

  const filesDeleted = deleteUniqueStaticFiles(pathsToDelete)

  const ts = now()
  let cleared = 0
  for (const sb of withImage) {
    const nextMeta = stripImageClearMeta(sb.referenceImages)
    const updates: Record<string, unknown> = {
      composedImage: null,
      composedVideoUrl: null,
      status: 'pending',
      updatedAt: ts,
    }
    if (nextMeta) updates.referenceImages = nextMeta
    db.update(schema.storyboards)
      .set(updates)
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    cleared++
  }

  let generationsDeleted = 0
  for (const gen of gens) {
    db.delete(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, gen.id))
      .run()
    generationsDeleted++
  }

  logTaskSuccess('EpisodeAssetClear', 'narration-images', {
    episodeId,
    cleared,
    filesDeleted,
    generationsDeleted,
  })

  return {
    cleared,
    files_deleted: filesDeleted,
    generations_deleted: generationsDeleted,
  }
}

/** 清除本集全部配图锚点的 AI/上传配图文案（保留检测分段 meta，不删配图文件） */
export async function clearEpisodeNarrationImagePrompts(episodeId: number) {
  const storyboards = collectEpisodeStoryboards(episodeId)
  const ts = now()
  let cleared = 0

  logTaskStart('EpisodeAssetClear', 'narration-image-prompts', { episodeId })

  for (const sb of storyboards) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    if (meta.narration_image_mode !== 'new') continue
    const hasPrompt = String(sb.imagePrompt || '').trim()
      || meta.image_prompt_source
      || meta.image_prompt_llm_raw
    if (!hasPrompt) continue

    const { image_prompt_source, image_prompt_llm_raw, ...rest } = meta
    db.update(schema.storyboards)
      .set({
        imagePrompt: null,
        referenceImages: buildNarrationImageMeta('new', rest),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    cleared++
  }

  if (!cleared) {
    return { cleared: 0 }
  }

  logTaskSuccess('EpisodeAssetClear', 'narration-image-prompts', { episodeId, cleared })
  return { cleared }
}

/** 清除本集所有镜头配音，删除音频/字幕文件并清空数据库字段 */
export async function clearEpisodeNarrationTts(episodeId: number) {
  const storyboards = collectEpisodeStoryboards(episodeId)
  const withTts = storyboards.filter(sb =>
    normalizeStaticRel(sb.ttsAudioUrl) || normalizeStaticRel(sb.subtitleUrl),
  )
  if (!withTts.length) {
    return { cleared: 0, files_deleted: 0 }
  }

  logTaskStart('EpisodeAssetClear', 'narration-tts', {
    episodeId,
    storyboardCount: withTts.length,
  })

  const pathsToDelete = withTts.flatMap(sb => [
    normalizeStaticRel(sb.ttsAudioUrl),
    normalizeStaticRel(sb.subtitleUrl),
  ]).filter(Boolean)

  const filesDeleted = deleteUniqueStaticFiles(pathsToDelete)

  const ts = now()
  let cleared = 0
  for (const sb of withTts) {
    db.update(schema.storyboards)
      .set({
        ttsAudioUrl: null,
        subtitleUrl: null,
        composedVideoUrl: null,
        status: 'pending',
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    cleared++
  }

  logTaskSuccess('EpisodeAssetClear', 'narration-tts', {
    episodeId,
    cleared,
    filesDeleted,
  })

  return { cleared, files_deleted: filesDeleted }
}

/** 清除本集所有镜头合成视频，删除文件并清空数据库；同时作废导出拼接记录 */
export async function clearEpisodeComposedVideos(episodeId: number) {
  const storyboards = collectEpisodeStoryboards(episodeId)
  const withVideo = storyboards.filter(sb => normalizeStaticRel(sb.composedVideoUrl))
  const merges = db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .all()
    .filter(row => !row.deletedAt)

  if (!withVideo.length && !merges.some(m => normalizeStaticRel(m.mergedUrl))) {
    return { cleared: 0, files_deleted: 0, merges_cleared: 0 }
  }

  logTaskStart('EpisodeAssetClear', 'composed-videos', {
    episodeId,
    storyboardCount: withVideo.length,
    mergeCount: merges.length,
  })

  const pathsToDelete = [
    ...withVideo.map(sb => normalizeStaticRel(sb.composedVideoUrl)),
    ...merges.map(m => normalizeStaticRel(m.mergedUrl)),
  ].filter(Boolean)

  const filesDeleted = deleteUniqueStaticFiles(pathsToDelete)

  const ts = now()
  let cleared = 0
  for (const sb of withVideo) {
    db.update(schema.storyboards)
      .set({
        composedVideoUrl: null,
        status: 'pending',
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    cleared++
  }

  let mergesCleared = 0
  for (const merge of merges) {
    db.update(schema.videoMerges)
      .set({
        status: 'cancelled',
        mergedUrl: null,
        deletedAt: ts,
        completedAt: null,
      })
      .where(eq(schema.videoMerges.id, merge.id))
      .run()
    mergesCleared++
  }

  logTaskSuccess('EpisodeAssetClear', 'composed-videos', {
    episodeId,
    cleared,
    filesDeleted,
    mergesCleared,
  })

  return {
    cleared,
    files_deleted: filesDeleted,
    merges_cleared: mergesCleared,
  }
}
