/**
 * 片头视频 — 将本集所有「剧中红字」片头镜合成并拼接为独立 MP4（可单独预览/下载）
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { composeStoryboard, getStoryboardVisualSource } from './ffmpeg-compose.js'
import { isStoryboardTitleShot, sortStoryboardsByOrder } from './narration-image.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

const processingEpisodes = new Set<number>()

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function escapeConcatPath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

async function concatVideos(absPaths: string[], outputPath: string): Promise<void> {
  if (!absPaths.length) throw new Error('没有可拼接的视频')
  if (absPaths.length === 1) {
    fs.copyFileSync(absPaths[0], outputPath)
    return
  }

  fs.mkdirSync(os.tmpdir(), { recursive: true })
  const listPath = path.join(os.tmpdir(), `huobao-title-${uuid()}.txt`)
  const listContent = absPaths.map(p => `file '${escapeConcatPath(p)}'`).join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-fflags', '+genpts',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-ar', '48000',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', err => reject(err))
        .run()
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }
}

function titleShotReady(
  sb: {
    id: number
    dialogue?: string | null
    ttsAudioUrl?: string | null
  },
  storyboards: Parameters<typeof getStoryboardVisualSource>[1],
) {
  if (!String(sb.dialogue || '').trim()) return false
  if (!sb.ttsAudioUrl) return false
  const audioAbs = toAbsPath(sb.ttsAudioUrl)
  if (!fs.existsSync(audioAbs)) return false
  return !!getStoryboardVisualSource(sb, storyboards)
}

export function isTitleVideoProcessing(episodeId: number): boolean {
  return processingEpisodes.has(episodeId)
}

export async function generateTitleSegmentVideo(episodeId: number): Promise<{
  path: string
  shotCount: number
}> {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(row => !row.deletedAt),
  )
  const titleShots = storyboards.filter(sb => isStoryboardTitleShot(sb))
  if (!titleShots.length) {
    throw new Error('本集没有片头镜（剧中红字），请先完成旁白分镜')
  }

  const notReady = titleShots.filter(sb => !titleShotReady(sb, storyboards))
  if (notReady.length) {
    throw new Error(`${notReady.length} 个片头镜尚未就绪（需配图/配音），请先完成后再导出`)
  }

  logTaskStart('TitleSegment', 'generate', { episodeId, shotCount: titleShots.length })

  const outputDir = path.join(STORAGE_ROOT, 'title-segment')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputAbs = path.join(outputDir, outputFilename)

  try {
    for (const sb of titleShots) {
      await composeStoryboard(sb.id)
    }

    const refreshed = sortStoryboardsByOrder(
      db.select().from(schema.storyboards)
        .where(eq(schema.storyboards.episodeId, episodeId))
        .all()
        .filter(row => !row.deletedAt),
    )
    const clipPaths: string[] = []
    for (const sb of titleShots) {
      const row = refreshed.find(item => item.id === sb.id)
      const rel = row?.composedVideoUrl?.trim()
      if (!rel) throw new Error(`片头镜 #${sb.storyboardNumber} 合成失败`)
      const abs = toAbsPath(rel)
      if (!fs.existsSync(abs)) throw new Error(`片头镜 #${sb.storyboardNumber} 合成文件缺失`)
      clipPaths.push(abs)
    }

    await concatVideos(clipPaths, outputAbs)

    const relativePath = `static/title-segment/${outputFilename}`
    db.update(schema.episodes)
      .set({
        titleVideoUrl: relativePath,
        titleVideoError: null,
        updatedAt: now(),
      })
      .where(eq(schema.episodes.id, episodeId))
      .run()

    logTaskSuccess('TitleSegment', 'generate', {
      episodeId,
      path: relativePath,
      shotCount: titleShots.length,
    })

    return { path: relativePath, shotCount: titleShots.length }
  } catch (err: any) {
    logTaskError('TitleSegment', 'generate', { episodeId, error: err.message })
    db.update(schema.episodes)
      .set({ titleVideoError: err.message, updatedAt: now() })
      .where(eq(schema.episodes.id, episodeId))
      .run()
    throw err
  }
}

export function startTitleSegmentVideoGeneration(episodeId: number): void {
  if (processingEpisodes.has(episodeId)) return
  processingEpisodes.add(episodeId)
  db.update(schema.episodes)
    .set({ titleVideoError: null, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  generateTitleSegmentVideo(episodeId)
    .catch(() => {})
    .finally(() => {
      processingEpisodes.delete(episodeId)
    })
}
