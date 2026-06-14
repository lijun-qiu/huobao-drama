/**
 * FFmpeg 单镜头合成 — 视频/配图 + TTS音频 + 烧录字幕
 */
import { createHash } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { generateTTS } from './tts-generation.js'
import { resolveEdgeVoice } from './edge-tts-local.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { isNarrationStoryboard, parseNarrationImageMeta, resolveStoryboardVisualSource, sortStoryboardsByOrder } from './narration-image.js'
import { parseDialogueForTTS, resolveNarrationVoiceId, resolveStoryboardTtsSource } from './narration-tts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')
let subtitleFilterSupport: boolean | null = null
const imageBaseCacheInflight = new Map<string, Promise<string>>()

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function supportsSubtitleFilter(): boolean {
  if (subtitleFilterSupport != null) return subtitleFilterSupport
  try {
    const output = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    subtitleFilterSupport = /\b(subtitles|ass)\b/.test(output)
  } catch {
    subtitleFilterSupport = false
  }
  return subtitleFilterSupport
}

export function getStoryboardVisualSource(sb: {
  id?: number
  storyboardNumber?: number
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
}, episodeStoryboards?: Array<{
  id: number
  storyboardNumber: number
  videoUrl?: string | null
  composedImage?: string | null
  firstFrameImage?: string | null
}>) {
  if (episodeStoryboards?.length && sb.id != null) {
    const resolved = resolveStoryboardVisualSource(episodeStoryboards, sb.id)
    if (resolved) {
      return {
        type: resolved.type,
        path: toAbsPath(resolved.path),
        inherited: resolved.inherited,
        inheritedFrom: resolved.inheritedFrom,
      }
    }
    return null
  }
  if (sb.videoUrl) return { type: 'video' as const, path: toAbsPath(sb.videoUrl) }
  const image = sb.composedImage || sb.firstFrameImage
  if (image) return { type: 'image' as const, path: toAbsPath(image) }
  return null
}

/** 烧录字幕用：去掉中英文标点，保留正文与空格 */
function stripSubtitlePunctuation(text: string): string {
  return text
    .replace(/[，。！？；：、,.!?;:'"''""（）()\[\]《》【】「」『』…—·\-~～]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatSrtTimestamp(seconds: number) {
  const totalMs = Math.max(500, Math.round(seconds * 1000))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(Math.max(1, Number(data.format.duration) || 1))
    })
  })
}

function formatAssTimestamp(seconds: number) {
  const totalCs = Math.max(50, Math.round(seconds * 100))
  const h = Math.floor(totalCs / 360000)
  const m = Math.floor((totalCs % 360000) / 6000)
  const s = Math.floor((totalCs % 6000) / 100)
  const cs = totalCs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

const TITLE_FONT_SIZE = 74

function escapeAssChar(ch: string) {
  if (ch === '\n') return '\\N'
  if (ch === '{') return '('
  if (ch === '}') return ')'
  return ch
}

function escapeAssText(text: string) {
  return [...text.replace(/\r/g, '')].map(escapeAssChar).join('')
}

/** 片头「剧中」红字：ASS 居中整句显示（无打字机） */
function buildTitleAssHeader() {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TitleWhite, Microsoft YaHei, ${TITLE_FONT_SIZE}, &HFFFFFF&, &HFF000000&, &H00000000&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1
Style: Title, Microsoft YaHei, ${TITLE_FONT_SIZE}, &H0014F0&, &HFF000000&, &H00FFFFFF&, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 5, 0, 0, 0, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
}

const TITLE_TEXT_SLIDE_MS = 420
/** 片头字幕相对该句音频起点的显示延迟（原 0.5s，提前 0.5s 后为 0） */
const TITLE_SUBTITLE_START_DELAY_SEC = 0

/** 片头字幕：自下往上滑入 + 首句白字/后续红字（参照解说类成片） */
function buildTitleAssDialogueLine(text: string, startSec: number, endSec: number, lineIndex = 0) {
  const line = escapeAssText(text.replace(/\r/g, '').replace(/\n/g, ' ').trim())
  const style = lineIndex === 0 ? 'TitleWhite' : 'Title'
  const tags = `{\\an5\\move(640,780,640,360,0,${TITLE_TEXT_SLIDE_MS})\\fad(180,140)}`
  return `Dialogue: 0,${formatAssTimestamp(startSec)},${formatAssTimestamp(endSec)},${style},,0,0,0,,${tags}${line}`
}

function buildTitleAssContent(text: string, durationSec: number, lineIndex = 0) {
  const endAt = Math.max(durationSec - 0.2, 0.8)
  return `${buildTitleAssHeader()}${buildTitleAssDialogueLine(text, TITLE_SUBTITLE_START_DELAY_SEC, endAt, lineIndex)}\n`
}

function buildSubtitleForceStyle(isTitleShot: boolean) {
  if (isTitleShot) {
    return `FontSize=${TITLE_FONT_SIZE}\\,PrimaryColour=&H0014F0&\\,OutlineColour=&HFFFFFF&\\,Outline=3\\,Bold=1\\,Alignment=5\\,MarginL=0\\,MarginR=0\\,MarginV=0`
  }
  return 'FontSize=20\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2\\,Alignment=2\\,MarginV=24'
}

function buildSubtitleFilter(subtitlePath: string, isTitleShot: boolean) {
  const escapedPath = subtitlePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
  // 片头 ASS 用 ass 滤镜，按 Dialogue 时间轴逐段显示；正文 SRT 仍用 subtitles
  if (isTitleShot && subtitlePath.toLowerCase().endsWith('.ass')) {
    return `ass='${escapedPath}'`
  }
  const forceStyle = buildSubtitleForceStyle(isTitleShot)
  return `subtitles=filename='${escapedPath}':original_size=1280x720:force_style='${forceStyle}'`
}

function buildImageMotionFilter() {
  const fps = 25
  return `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=${fps},format=yuv420p`
}

/** 片头动态底：慢推镜 + RGB 色散 + 暗角（参照解说成片风格） */
function buildTitleDynamicMotionFilter(baseFrames = 750) {
  const fps = 25
  return [
    'scale=8000:-1',
    `zoompan=z='min(1+0.00022*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${baseFrames}:s=1280x720:fps=${fps}`,
    'rgbashift=rh=-5:gh=0:bv=5',
    'vignette=angle=PI/5',
    'format=yuv420p',
  ].join(',')
}

async function isValidVideoFile(filePath: string): Promise<boolean> {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < 1024) return false
    await probeMediaDuration(filePath)
    return true
  } catch {
    return false
  }
}

/** 同一张配图生成共享底片；片头启用 dynamic 动态底 */
async function getSharedImageBaseVideo(imageAbsPath: string, options?: { dynamic?: boolean }): Promise<string> {
  const cacheDir = path.join(STORAGE_ROOT, 'temp', 'image-bases')
  fs.mkdirSync(cacheDir, { recursive: true })
  const key = createHash('md5').update(`${imageAbsPath}|${options?.dynamic ? 'dynamic' : 'static'}`).digest('hex')
  const cached = path.join(cacheDir, `${key}-base.mp4`)

  if (fs.existsSync(cached)) {
    if (await isValidVideoFile(cached)) return cached
    try { fs.unlinkSync(cached) } catch {}
  }

  const inflight = imageBaseCacheInflight.get(key)
  if (inflight) return inflight

  const videoFilter = options?.dynamic ? buildTitleDynamicMotionFilter() : buildImageMotionFilter()
  const buildPromise = (async () => {
    const tmpPath = path.join(cacheDir, `${key}-base.${uuid()}.tmp.mp4`)
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(imageAbsPath)
          .inputOptions(['-loop', '1'])
          .videoFilter(videoFilter)
          .outputOptions([
            '-t', '30',
            '-an',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-g', '1',
            '-keyint_min', '1',
            '-tune', 'stillimage',
            '-pix_fmt', 'yuv420p',
            '-r', '25',
          ])
          .output(tmpPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      if (!(await isValidVideoFile(tmpPath))) {
        throw new Error(`Generated image base video is invalid: ${tmpPath}`)
      }

      fs.renameSync(tmpPath, cached)
      return cached
    } finally {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath) } catch {}
      }
      imageBaseCacheInflight.delete(key)
    }
  })()

  imageBaseCacheInflight.set(key, buildPromise)
  return buildPromise
}

function escapeConcatMediaPath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

async function concatAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 1) {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPaths[0])
        .outputOptions(['-c:a', 'aac', '-ar', '48000', '-b:a', '192k'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
    return
  }

  const listPath = path.join(os.tmpdir(), `huobao-${uuid()}.txt`)
  const listContent = audioPaths.map(p => `file '${escapeConcatMediaPath(p)}'`).join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'aac', '-ar', '48000', '-b:a', '192k'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
  }
}

/** 同配图多句：一次渲染，避免句间切换时背景跳动 */
export async function renderSameImageGroupSegment(
  orderedStoryboards: Array<{
    id: number
    dialogue?: string | null
    referenceImages?: string | null
    ttsAudioUrl?: string | null
  }>,
  imageAbsPath: string,
  outputPath: string,
): Promise<number> {
  const baseVideo = await getSharedImageBaseVideo(imageAbsPath, { dynamic: true })
  const tempDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(tempDir, { recursive: true })

  let offsetSec = 0
  let titleMode = false
  const assDialogues: string[] = []
  const srtBlocks: string[] = []
  const audioPaths: string[] = []

  for (let i = 0; i < orderedStoryboards.length; i++) {
    const sb = orderedStoryboards[i]
    const parsed = parseDialogueForTTS(sb.dialogue)
    const titleMeta = isNarrationStoryboard(sb) ? parseNarrationImageMeta(sb.referenceImages) : null
    const isTitleShot = titleMeta?.narration_shot_type === 'title'
    if (isTitleShot) titleMode = true

    if (!sb.ttsAudioUrl) throw new Error(`Storyboard ${sb.id} missing narration audio`)
    const audioPath = toAbsPath(sb.ttsAudioUrl)
    if (!fs.existsSync(audioPath)) throw new Error(`Storyboard ${sb.id} audio file missing`)

    const durationSec = await probeMediaDuration(audioPath)
    const text = stripSubtitlePunctuation(parsed.pureText)
    const startSec = isTitleShot
      ? offsetSec + TITLE_SUBTITLE_START_DELAY_SEC
      : offsetSec + 0.5
    const endSec = offsetSec + Math.max(durationSec - 0.2, 0.8)

    if (text) {
      if (isTitleShot) {
        assDialogues.push(buildTitleAssDialogueLine(text, startSec, endSec, i))
      } else {
        srtBlocks.push(
          `${i + 1}\n${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}\n${text}\n`,
        )
      }
    }

    audioPaths.push(audioPath)
    offsetSec += durationSec
  }

  const subtitlePath = path.join(tempDir, `${uuid()}.${titleMode ? 'ass' : 'srt'}`)
  fs.writeFileSync(
    subtitlePath,
    titleMode ? `${buildTitleAssHeader()}${assDialogues.join('\n')}\n` : srtBlocks.join('\n'),
    'utf-8',
  )

  const mergedAudioPath = path.join(tempDir, `${uuid()}.m4a`)
  await concatAudioFiles(audioPaths, mergedAudioPath)

  await new Promise<void>((resolve, reject) => {
    const filters: string[] = []
    if (supportsSubtitleFilter()) {
      filters.push(buildSubtitleFilter(subtitlePath, titleMode))
    }

    let cmd = ffmpeg().input(baseVideo).input(mergedAudioPath)
    if (filters.length > 0) cmd = cmd.videoFilter(filters)
    cmd
      .outputOptions([
        '-t', String(offsetSec),
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-g', '1',
        '-keyint_min', '1',
        '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p',
        '-r', '25',
        '-vsync', 'cfr',
        '-c:a', 'aac',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  if (fs.existsSync(mergedAudioPath)) fs.unlinkSync(mergedAudioPath)
  if (fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath)

  return offsetSec
}

/**
 * 合成单个镜头：视频/配图 + TTS对白音频 + 烧录字幕
 */
export async function composeStoryboard(storyboardId: number): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)

  const episodeStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
    .filter(row => !row.deletedAt)

  let visual = getStoryboardVisualSource(sb, episodeStoryboards)
  const useBlackFrame = !visual
  db.update(schema.storyboards)
    .set({ status: 'compose_processing', composedVideoUrl: null, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: sb.storyboardNumber,
    episodeId: sb.episodeId,
  })

  let audioPath: string | null = null
  let subtitlePath: string | null = null
  const parsedDialogue = parseDialogueForTTS(sb.dialogue)
  const titleMeta = isNarrationStoryboard(sb) ? parseNarrationImageMeta(sb.referenceImages) : null
  const isTitleShot = titleMeta?.narration_shot_type === 'title'

  // 1. 解析 TTS 音频（解说每镜独立配音，不复用）
  try {
    if (!parsedDialogue.ignorable) {
      if (isNarrationStoryboard(sb) && sb.ttsAudioUrl) {
        const ownPath = toAbsPath(sb.ttsAudioUrl)
        if (fs.existsSync(ownPath)) audioPath = ownPath
      } else if (!isNarrationStoryboard(sb)) {
        const resolvedTts = resolveStoryboardTtsSource(episodeStoryboards, storyboardId)
        if (resolvedTts?.path) {
          const existingAudioPath = toAbsPath(resolvedTts.path)
          if (fs.existsSync(existingAudioPath)) {
            audioPath = existingAudioPath
            if (resolvedTts.inherited) {
              logTaskProgress('ComposeTask', 'reuse-tts', {
                storyboardId,
                inheritedFrom: resolvedTts.sourceId,
              })
            }
          }
        }
      }

      if (!audioPath) {
        let voiceId = 'alloy'
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        if (ep) {
          const chars = db.select().from(schema.characters)
            .where(eq(schema.characters.dramaId, ep.dramaId)).all()
          voiceId = resolveNarrationVoiceId(parsedDialogue.speaker, chars, { isTitleShot: !!isTitleShot })
        }

        const pureDialogue = parsedDialogue.pureText
        if (pureDialogue) {
          const useLocalTts = isNarrationStoryboard(sb)
          const ttsVoice = useLocalTts ? resolveEdgeVoice(voiceId) : voiceId
          logTaskProgress('ComposeTask', 'generate-inline-tts', {
            storyboardId,
            voiceId: ttsVoice,
            localTts: useLocalTts,
            textPreview: pureDialogue.slice(0, 40),
          })
          const ttsPath = await generateTTS({
            text: pureDialogue,
            voice: ttsVoice,
            configId: useLocalTts ? null : (ep?.audioConfigId ?? undefined),
            localTts: useLocalTts,
          })
          audioPath = toAbsPath(ttsPath)
          db.update(schema.storyboards).set({ ttsAudioUrl: ttsPath, updatedAt: now() })
            .where(eq(schema.storyboards.id, storyboardId)).run()
        }
      }
    }

    const clipDuration = audioPath
      ? await probeMediaDuration(audioPath)
      : (sb.duration || 10)

    if (!visual && !audioPath) {
      throw new Error(`Storyboard ${storyboardId} has no video, image, or narration audio`)
    }

    if (visual?.inherited) {
      logTaskProgress('ComposeTask', 'reuse-image', {
        storyboardId,
        inheritedFrom: visual.inheritedFrom,
      })
    }

    // 2. 生成字幕：正文 SRT 底栏；片头 ASS 剧中红字整句居中
    const subtitleText = parsedDialogue.pureText
    const pureText = stripSubtitlePunctuation(subtitleText)
    if (pureText && (!parsedDialogue.ignorable || isTitleShot)) {
      const srtDir = path.join(STORAGE_ROOT, 'subtitles')
      fs.mkdirSync(srtDir, { recursive: true })
      const subtitleFilename = `${uuid()}${isTitleShot ? '.ass' : '.srt'}`
      subtitlePath = path.join(srtDir, subtitleFilename)

      const endAt = formatSrtTimestamp(Math.max(clipDuration - 0.2, 0.8))
      let titleLineIndex = 0
      if (isTitleShot) {
        const titleShots = sortStoryboardsByOrder(episodeStoryboards).filter(row => {
          const meta = parseNarrationImageMeta(row.referenceImages)
          return meta.narration_shot_type === 'title'
        })
        titleLineIndex = Math.max(0, titleShots.findIndex(row => row.id === storyboardId))
      }
      const subtitleContent = isTitleShot
        ? buildTitleAssContent(pureText, clipDuration, titleLineIndex)
        : `1\n00:00:00,500 --> ${endAt}\n${pureText}\n`
      fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8')

      const subtitleRelative = `static/subtitles/${subtitleFilename}`
      db.update(schema.storyboards).set({ subtitleUrl: subtitleRelative, updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
    }

    // 3. FFmpeg 合成
    const outputDir = path.join(STORAGE_ROOT, 'composed')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputFilename = `${uuid()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    await new Promise<void>(async (resolve, reject) => {
      const titleMeta = isNarrationStoryboard(sb) ? parseNarrationImageMeta(sb.referenceImages) : null
      const isTitleShot = titleMeta?.narration_shot_type === 'title'
      const filters: string[] = []
      if (subtitlePath && supportsSubtitleFilter()) {
        filters.push(buildSubtitleFilter(subtitlePath, !!isTitleShot))
      } else if (subtitlePath) {
        logTaskProgress('ComposeTask', 'subtitle-filter-unavailable', {
          storyboardId,
          subtitlePath,
        })
      }

      let cmd = ffmpeg()
      if (useBlackFrame) {
        cmd = cmd.input(`color=c=black:s=1280x720:r=25:d=${clipDuration}`).inputOptions(['-f', 'lavfi'])
        filters.unshift('fps=25,format=yuv420p')
        logTaskProgress('ComposeTask', 'black-frame-compose', { storyboardId, duration: clipDuration })
      } else if (visual!.type === 'image') {
        const useTitleDynamic = !!isTitleShot
        const baseVideo = await getSharedImageBaseVideo(visual!.path, { dynamic: useTitleDynamic })
        cmd = cmd.input(baseVideo)
        logTaskProgress('ComposeTask', 'image-slideshow-compose', {
          storyboardId,
          duration: clipDuration,
          inherited: visual!.inherited || false,
          sharedBase: true,
          titleDynamic: useTitleDynamic,
        })
      } else {
        cmd = cmd.input(visual!.path)
      }

      if (audioPath) {
        cmd = cmd.input(audioPath)
      }

      if (filters.length > 0) {
        cmd = cmd.videoFilter(filters)
      }

      const outputOptions = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p']

      if (useBlackFrame || visual?.type === 'image') {
        outputOptions.push('-t', String(clipDuration), '-vsync', 'cfr', '-r', '25')
        if (visual?.type === 'image') {
          outputOptions.push('-g', '1', '-keyint_min', '1')
        }
      }

      if (audioPath) {
        const videoInput = 0
        const audioInput = 1
        outputOptions.push('-map', `${videoInput}:v`, '-map', `${audioInput}:a`, '-c:a', 'aac', '-shortest')
        if (useBlackFrame || visual?.type === 'image') {
          outputOptions.push('-tune', 'stillimage')
        }
      } else if (useBlackFrame || visual?.type === 'image') {
        outputOptions.push('-an')
      } else {
        outputOptions.push('-an')
      }

      cmd.outputOptions(outputOptions)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    const composedRelative = `static/composed/${outputFilename}`
    db.update(schema.storyboards).set({ composedVideoUrl: composedRelative, status: 'compose_completed', updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId)).run()

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: sb.storyboardNumber,
      output: composedRelative,
    })
    return composedRelative
  } catch (err) {
    db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    throw err
  }
}
