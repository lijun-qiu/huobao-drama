import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { sortStoryboardsByOrder, parseNarrationImageMeta, buildNarrationImageMeta, buildNarrationImageMetaAfterDetectClear, storyboardHasImageDetectMarks } from './narration-image.js'
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

/** 本集正在进行中的分镜配图任务数（processing / pending） */
export function countEpisodeProcessingNarrationImages(episodeId: number): number {
  const storyboardIds = collectEpisodeStoryboards(episodeId).map(sb => sb.id)
  if (!storyboardIds.length) return 0
  return db.select().from(schema.imageGenerations)
    .where(inArray(schema.imageGenerations.storyboardId, storyboardIds))
    .all()
    .filter(g => g.status === 'processing' || g.status === 'pending')
    .length
}

function normalizeIdFilter(ids?: number[] | null): number[] {
  if (!Array.isArray(ids) || !ids.length) return []
  return [...new Set(ids.map(Number).filter(n => Number.isFinite(n) && n > 0))]
}

function normalizeCharacterIdFilter(characterIds?: number[] | null): number[] {
  return normalizeIdFilter(characterIds)
}

/** 取本集中绑定了指定角色的 storyboard id */
function storyboardIdsLinkedToCharacters(episodeId: number, characterIds: number[]): Set<number> {
  const ids = normalizeCharacterIdFilter(characterIds)
  if (!ids.length) return new Set()
  const epSbIds = new Set(collectEpisodeStoryboards(episodeId).map(sb => sb.id))
  const rows = db.select().from(schema.storyboardCharacters)
    .where(inArray(schema.storyboardCharacters.characterId, ids))
    .all()
  return new Set(
    rows
      .map(r => r.storyboardId)
      .filter(id => epSbIds.has(id)),
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

/** 清除本集镜头配图（含上传与 AI 生成）；可按 character_ids / storyboard_ids 过滤 */
export async function clearEpisodeNarrationImages(
  episodeId: number,
  options?: { characterIds?: number[] | null; storyboardIds?: number[] | null },
) {
  const processing = countEpisodeProcessingNarrationImages(episodeId)
  if (processing > 0) {
    throw new Error(`有 ${processing} 个配图任务正在生成中，请等待完成后再清除`)
  }

  const characterIds = normalizeCharacterIdFilter(options?.characterIds)
  const storyboardIdFilter = normalizeIdFilter(options?.storyboardIds)
  const linkedIds = characterIds.length
    ? storyboardIdsLinkedToCharacters(episodeId, characterIds)
    : null
  const explicitIds = storyboardIdFilter.length ? new Set(storyboardIdFilter) : null

  const storyboards = collectEpisodeStoryboards(episodeId)
  const withImage = storyboards.filter(sb => {
    if (!normalizeStaticRel(sb.composedImage)) return false
    // storyboard_ids 优先（与前端角色筛选一致，含文案名回退匹配）
    if (explicitIds) return explicitIds.has(sb.id)
    if (linkedIds) return linkedIds.has(sb.id)
    return true
  })
  if (!withImage.length) {
    return {
      cleared: 0,
      files_deleted: 0,
      generations_deleted: 0,
      character_ids: characterIds,
      storyboard_ids: storyboardIdFilter,
      filtered: characterIds.length > 0 || storyboardIdFilter.length > 0,
    }
  }

  logTaskStart('EpisodeAssetClear', 'narration-images', {
    episodeId,
    storyboardCount: withImage.length,
    characterIds: characterIds.length ? characterIds : undefined,
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
    if (gen.status === 'processing' || gen.status === 'pending') {
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: '配图已清除，任务已取消', updatedAt: ts })
        .where(eq(schema.imageGenerations.id, gen.id))
        .run()
      continue
    }
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
    characterIds: characterIds.length ? characterIds : undefined,
  })

  return {
    cleared,
    files_deleted: filesDeleted,
    generations_deleted: generationsDeleted,
    character_ids: characterIds,
    storyboard_ids: withImage.map(sb => sb.id),
    filtered: characterIds.length > 0 || storyboardIdFilter.length > 0,
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
    const hasPrompt = String(sb.imagePrompt || '').trim()
      || meta.image_prompt_source
      || meta.image_prompt_llm_raw
      || meta.flux_prompt_en
    // 与前端计数对齐：凡有 image_prompt / 文案 meta 的镜头都清，不限 mode=new
    if (!hasPrompt) continue

    const {
      image_prompt_source: _src,
      image_prompt_llm_raw: _raw,
      flux_prompt_en: _flux,
      flux_prompt_en_at: _fluxAt,
      flux_prompt_en_version: _fluxVer,
      ...rest
    } = meta
    db.update(schema.storyboards)
      .set({
        imagePrompt: null,
        referenceImages: buildNarrationImageMeta(meta.narration_image_mode, rest),
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

/** 清除本集全部配图换镜检测分镜（不保留检测分段；旁白镜头列表与已有配图文件不动） */
export async function clearEpisodeNarrationImageDetect(episodeId: number) {
  const storyboards = collectEpisodeStoryboards(episodeId)
  const ts = now()
  let cleared = 0

  logTaskStart('EpisodeAssetClear', 'narration-image-detect', { episodeId })

  for (const sb of storyboards) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const hadDetect = storyboardHasImageDetectMarks(meta)
    const hasPrompt = String(sb.imagePrompt || '').trim()
      || meta.image_prompt_source
      || meta.image_prompt_llm_raw
    if (!hadDetect && !hasPrompt) continue

    const { changed, referenceImages } = buildNarrationImageMetaAfterDetectClear(sb.referenceImages)
    if (!changed && !hasPrompt) continue

    db.update(schema.storyboards)
      .set({
        imagePrompt: null,
        referenceImages,
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    cleared++
  }

  if (!cleared) {
    return { cleared: 0 }
  }

  logTaskSuccess('EpisodeAssetClear', 'narration-image-detect', { episodeId, cleared })
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

function collectStoryboardAssetPaths(sb: typeof schema.storyboards.$inferSelect): string[] {
  const paths: string[] = []
  paths.push(...imagePathsToDelete(String(sb.composedImage || '')))
  for (const field of [
    sb.firstFrameImage,
    sb.lastFrameImage,
    sb.videoUrl,
    sb.ttsAudioUrl,
    sb.subtitleUrl,
    sb.composedVideoUrl,
    sb.bgmAudioUrl,
  ]) {
    const rel = normalizeStaticRel(field)
    if (rel) paths.push(rel)
  }
  return paths
}

/** 清除本集全部分镜（含关联配图/配音/合成与生成记录） */
export async function clearEpisodeStoryboards(episodeId: number) {
  const storyboards = collectEpisodeStoryboards(episodeId)
  if (!storyboards.length) {
    return { cleared: 0, files_deleted: 0, generations_deleted: 0, merges_cleared: 0 }
  }

  logTaskStart('EpisodeAssetClear', 'storyboards', {
    episodeId,
    storyboardCount: storyboards.length,
  })

  const storyboardIds = storyboards.map(sb => sb.id)
  const pathsToDelete = storyboards.flatMap(collectStoryboardAssetPaths)

  const imageGens = storyboardIds.length
    ? db.select().from(schema.imageGenerations)
      .where(inArray(schema.imageGenerations.storyboardId, storyboardIds))
      .all()
    : []
  for (const gen of imageGens) {
    if (gen.localPath) pathsToDelete.push(normalizeStaticRel(gen.localPath))
    if (gen.imageUrl) pathsToDelete.push(normalizeStaticRel(gen.imageUrl))
  }

  const videoGens = storyboardIds.length
    ? db.select().from(schema.videoGenerations)
      .where(inArray(schema.videoGenerations.storyboardId, storyboardIds))
      .all()
    : []
  for (const gen of videoGens) {
    if (gen.localPath) pathsToDelete.push(normalizeStaticRel(gen.localPath))
    if (gen.videoUrl) pathsToDelete.push(normalizeStaticRel(gen.videoUrl))
  }

  const merges = db.select().from(schema.videoMerges)
    .where(eq(schema.videoMerges.episodeId, episodeId))
    .all()
    .filter(row => !row.deletedAt)
  for (const merge of merges) {
    const rel = normalizeStaticRel(merge.mergedUrl)
    if (rel) pathsToDelete.push(rel)
  }

  const filesDeleted = deleteUniqueStaticFiles(pathsToDelete)

  const ts = now()
  for (const storyboardId of storyboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  for (const gen of imageGens) {
    db.delete(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, gen.id))
      .run()
  }
  for (const gen of videoGens) {
    db.delete(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, gen.id))
      .run()
  }
  db.delete(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .run()

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

  db.update(schema.episodes)
    .set({ duration: 0, updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  const cleared = storyboards.length
  const generationsDeleted = imageGens.length + videoGens.length

  logTaskSuccess('EpisodeAssetClear', 'storyboards', {
    episodeId,
    cleared,
    filesDeleted,
    generationsDeleted,
    mergesCleared,
  })

  return {
    cleared,
    files_deleted: filesDeleted,
    generations_deleted: generationsDeleted,
    merges_cleared: mergesCleared,
  }
}
