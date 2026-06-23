import fs from 'fs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { getAbsolutePath } from '../utils/storage.js'
import { buildOriginalRelativePathFromWmCropped } from './narration-image-crop.js'

type StoryboardRow = typeof schema.storyboards.$inferSelect
type AssetField =
  | 'composedImage'
  | 'firstFrameImage'
  | 'lastFrameImage'
  | 'ttsAudioUrl'
  | 'subtitleUrl'
  | 'composedVideoUrl'

export function normalizeStaticRel(relativePath: string | null | undefined): string {
  return String(relativePath || '').trim().replace(/^\/+/, '')
}

export function deleteStaticFileIfExists(relativePath: string): boolean {
  const rel = normalizeStaticRel(relativePath)
  if (!rel) return false
  try {
    const abs = getAbsolutePath(rel)
    if (!fs.existsSync(abs)) return false
    fs.unlinkSync(abs)
    return true
  } catch {
    return false
  }
}

export function deleteUniqueStaticFiles(paths: string[]): number {
  const unique = [...new Set(paths.map(normalizeStaticRel).filter(Boolean))]
  let deleted = 0
  for (const rel of unique) {
    if (deleteStaticFileIfExists(rel)) deleted++
  }
  return deleted
}

function imagePathsToDelete(composedImage: string): string[] {
  const rel = normalizeStaticRel(composedImage)
  if (!rel) return []
  const paths = [rel]
  const original = buildOriginalRelativePathFromWmCropped(rel)
  if (original && original !== rel) paths.push(original)
  return paths
}

function listEpisodeStoryboards(episodeId: number, excludeStoryboardId?: number) {
  return db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter(sb => !sb.deletedAt && sb.id !== excludeStoryboardId)
}

/** 同集其他镜头仍引用该路径时不删文件 */
export function countEpisodePathRefs(
  episodeId: number,
  field: AssetField,
  relPath: string,
  excludeStoryboardId?: number,
): number {
  const rel = normalizeStaticRel(relPath)
  if (!rel) return 0
  let count = 0
  for (const sb of listEpisodeStoryboards(episodeId, excludeStoryboardId)) {
    if (normalizeStaticRel(sb[field]) === rel) count++
  }
  return count
}

export function deleteEpisodeAssetFileIfUnreferenced(
  relPath: string | null | undefined,
  episodeId: number,
  field: AssetField,
  storyboardId: number,
): boolean {
  const rel = normalizeStaticRel(relPath)
  if (!rel) return false
  if (countEpisodePathRefs(episodeId, field, rel, storyboardId) > 0) return false
  return deleteStaticFileIfExists(rel)
}

function resolveImageField(frameType?: string | null): AssetField {
  if (frameType === 'first_frame') return 'firstFrameImage'
  if (frameType === 'last_frame') return 'lastFrameImage'
  return 'composedImage'
}

/** 重新生成配图前：删旧文件、清字段，并作废该镜合成视频 */
export function purgeStoryboardImageBeforeRegenerate(
  storyboardId: number,
  frameType?: string | null,
): void {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) return

  const field = resolveImageField(frameType)
  const oldPath = sb[field]
  if (oldPath) {
    const paths = field === 'composedImage'
      ? imagePathsToDelete(String(oldPath))
      : [normalizeStaticRel(String(oldPath))]
    for (const p of paths) {
      deleteEpisodeAssetFileIfUnreferenced(p, sb.episodeId, field, storyboardId)
    }
  }

  purgeStoryboardComposedVideoBeforeRegenerate(storyboardId, sb)

  const updates: Record<string, unknown> = { updatedAt: now() }
  updates[field] = null
  db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, storyboardId)).run()
}

/** 重新生成配音前：删旧 TTS/字幕文件并清字段，同时作废合成视频 */
export function purgeStoryboardTtsBeforeRegenerate(storyboardId: number, sbInput?: StoryboardRow): void {
  const sb = sbInput
    ?? db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()[0]
  if (!sb) return

  for (const field of ['ttsAudioUrl', 'subtitleUrl'] as const) {
    const oldPath = sb[field]
    if (oldPath) {
      deleteEpisodeAssetFileIfUnreferenced(oldPath, sb.episodeId, field, storyboardId)
    }
  }

  purgeStoryboardComposedVideoBeforeRegenerate(storyboardId, sb)

  db.update(schema.storyboards)
    .set({
      ttsAudioUrl: null,
      subtitleUrl: null,
      updatedAt: now(),
    })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()
}

/** 重新合成视频前：删旧合成文件并清字段 */
export function purgeStoryboardComposedVideoBeforeRegenerate(
  storyboardId: number,
  sbInput?: StoryboardRow,
): void {
  const sb = sbInput
    ?? db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()[0]
  if (!sb?.composedVideoUrl) return

  deleteEpisodeAssetFileIfUnreferenced(
    sb.composedVideoUrl,
    sb.episodeId,
    'composedVideoUrl',
    storyboardId,
  )

  db.update(schema.storyboards)
    .set({
      composedVideoUrl: null,
      status: sb.status === 'compose_completed' || sb.status === 'compose_failed'
        ? 'pending'
        : sb.status,
      updatedAt: now(),
    })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()
}

/** storyboard 更新字段时，若路径变更则删旧文件 */
export function replaceStoryboardAssetOnUpdate(
  storyboard: StoryboardRow,
  field: AssetField,
  nextValue: unknown,
): void {
  const oldPath = normalizeStaticRel(storyboard[field])
  const newPath = normalizeStaticRel(typeof nextValue === 'string' ? nextValue : '')
  if (!oldPath || oldPath === newPath) return

  if (field === 'composedImage') {
    for (const p of imagePathsToDelete(oldPath)) {
      deleteEpisodeAssetFileIfUnreferenced(p, storyboard.episodeId, field, storyboard.id)
    }
    purgeStoryboardComposedVideoBeforeRegenerate(storyboard.id, storyboard)
    return
  }

  deleteEpisodeAssetFileIfUnreferenced(oldPath, storyboard.episodeId, field, storyboard.id)
  if (field === 'ttsAudioUrl' || field === 'subtitleUrl') {
    purgeStoryboardComposedVideoBeforeRegenerate(storyboard.id, storyboard)
  }
}

export { imagePathsToDelete }
