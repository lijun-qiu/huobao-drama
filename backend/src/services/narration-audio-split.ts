import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ffmpeg from 'fluent-ffmpeg'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { getAbsolutePath } from '../utils/storage.js'
import { sortStoryboardsByOrder } from './narration-image.js'
import { parseDialogueForTTS } from './narration-tts.js'
import { transcribeAudioToSrt, formatSrtTimestamp } from './audio-transcribe.js'
import {
  resolveStoryboardAudioRanges,
  mapScriptSegmentsToCues,
  normalizeAlignText,
} from './narration-srt-align.js'
import type { SrtCue } from './audio-transcribe.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const MIN_SEGMENT_SEC = 0.35

type TimeRange = { start: number; end: number }

function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err)
      else resolve(Math.max(MIN_SEGMENT_SEC, Number(data.format.duration) || MIN_SEGMENT_SEC))
    })
  })
}

function trimAudioSegment(inputAbs: string, outputAbs: string, startSec: number, endSec: number): Promise<void> {
  const duration = Math.max(MIN_SEGMENT_SEC, endSec - startSec)
  return new Promise((resolve, reject) => {
    ffmpeg(inputAbs)
      .setStartTime(Math.max(0, startSec))
      .duration(duration)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .format('mp3')
      .on('end', () => resolve())
      .on('error', reject)
      .save(outputAbs)
  })
}

function saveStoryboardTtsClip(inputAbs: string, startSec: number, endSec: number): Promise<string> {
  const dir = path.join(STORAGE_ROOT, 'audio', 'tts-import')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${uuid()}.mp3`
  const outputAbs = path.join(dir, filename)
  return trimAudioSegment(inputAbs, outputAbs, startSec, endSec).then(() => `static/audio/tts-import/${filename}`)
}

type TtsTarget = {
  sb: { id: number; storyboardNumber: number }
  parsed: ReturnType<typeof parseDialogueForTTS>
}

function getEpisodeTtsTargets(episodeId: number): TtsTarget[] {
  const storyboards = sortStoryboardsByOrder(
    db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .all()
      .filter(row => !row.deletedAt),
  )
  return storyboards
    .map(sb => ({ sb, parsed: parseDialogueForTTS(sb.dialogue) }))
    .filter(item => !item.parsed.ignorable && item.parsed.pureText)
}

function assignStoryboardTtsClip(sbId: number, clipPath: string, ts: string) {
  const clipDuration = probeMediaDuration(getAbsolutePath(clipPath))
  return clipDuration.then((sec) => {
    const durationSec = Math.max(1, Math.min(120, Math.ceil(sec)))
    db.update(schema.storyboards)
      .set({
        ttsAudioUrl: clipPath,
        duration: durationSec,
        composedVideoUrl: null,
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sbId))
      .run()
    return { storyboard_id: sbId, tts_audio_url: clipPath, duration: durationSec }
  })
}

async function splitAudioToTargetsBySrt(
  targets: TtsTarget[],
  audioRelativePath: string,
  ts: string,
  merged: boolean,
) {
  const inputAbs = getAbsolutePath(audioRelativePath)
  if (!fs.existsSync(inputAbs)) throw new Error(`音频文件不存在：${audioRelativePath}`)

  const totalDuration = await probeMediaDuration(inputAbs)
  const scripts = targets.map(item => item.parsed.pureText)
  const { srtPath, cues, cached: srtCached } = await transcribeAudioToSrt(inputAbs)
  const aligned = resolveStoryboardAudioRanges(scripts, cues, totalDuration)

  const results: Array<{ storyboard_id: number; tts_audio_url: string; duration: number }> = []
  for (let i = 0; i < targets.length; i++) {
    const { sb } = targets[i]
    const range = aligned.ranges[i]
    const start = Number.isFinite(range?.start) ? range!.start : 0
    const end = Number.isFinite(range?.end) && range!.end > start ? range!.end : totalDuration
    try {
      const clipPath = await saveStoryboardTtsClip(inputAbs, start, end)
      results.push(await assignStoryboardTtsClip(sb.id, clipPath, ts))
    } catch (err: any) {
      logTaskError('NarrationAudioSplit', 'clip-failed', { storyboardId: sb.id, error: err.message })
      throw new Error(`镜头 #${sb.storyboardNumber} 裁剪失败：${err.message}`)
    }
  }

  return {
    results,
    sourceDuration: totalDuration,
    mode: (merged ? 'merged' : 'single') as 'merged' | 'single',
    align_mode: aligned.mode,
    align_score: aligned.alignScore,
    srt_path: srtPath,
    subtitle_count: cues.length,
    srt_cached: srtCached,
    srt_cached_count: srtCached ? 1 : 0,
    srt_files: [buildSrtFilePayload({
      audioPath: audioRelativePath,
      spokenText: cuesToSpokenText(cues),
      cues,
      srtPath,
      duration: totalDuration,
      cached: srtCached,
    }, scripts)],
  }
}

type AudioTranscript = {
  audioPath: string
  spokenText: string
  cues: SrtCue[]
  srtPath: string
  duration: number
  cached: boolean
}

export type NarrationSrtFilePayload = {
  audio_path: string
  srt_path: string
  subtitle_count: number
  cached: boolean
  spoken_text: string
  cues: Array<{
    index: number
    start: number
    end: number
    start_label: string
    end_label: string
    text: string
    script_text: string
  }>
}

function buildSrtFilePayload(transcript: AudioTranscript, scripts: string[] = []): NarrationSrtFilePayload {
  const scriptSegments = scripts.length
    ? mapScriptSegmentsToCues(scripts, transcript.cues)
    : transcript.cues.map(() => '')
  return {
    audio_path: transcript.audioPath,
    srt_path: transcript.srtPath,
    subtitle_count: transcript.cues.length,
    cached: transcript.cached,
    spoken_text: transcript.spokenText,
    cues: transcript.cues.map((cue, idx) => ({
      index: cue.index || idx + 1,
      start: cue.start,
      end: cue.end,
      start_label: formatSrtTimestamp(cue.start),
      end_label: formatSrtTimestamp(cue.end),
      text: cue.text,
      script_text: scriptSegments[idx] || '',
    })),
  }
}

export async function transcribeNarrationAudioFiles(audioInput: string | string[], episodeId?: number) {
  const audioPaths = (Array.isArray(audioInput) ? audioInput : [audioInput])
    .map(p => String(p || '').trim())
    .filter(Boolean)
  if (!audioPaths.length) throw new Error('请提供音频文件')

  const transcripts = await buildAudioTranscripts(audioPaths)
  let srtFiles = transcripts.map(t => buildSrtFilePayload(t))

  if (episodeId) {
    const targets = getEpisodeTtsTargets(episodeId)
    if (targets.length) {
      const groups = matchTranscriptsToTargets(targets, transcripts)
      srtFiles = transcripts.map((transcript) => {
        const group = groups.find(item => item.transcript.audioPath === transcript.audioPath)
        const scripts = group
          ? group.targetIndices.map(i => targets[i].parsed.pureText)
          : []
        return buildSrtFilePayload(transcript, scripts)
      })
    }
  }

  return {
    segment_count: audioPaths.length,
    srt_files: srtFiles,
  }
}

type ContentMatchGroup = {
  targetIndices: number[]
  transcript: AudioTranscript
  matchScore: number
}

function cuesToSpokenText(cues: SrtCue[]): string {
  return cues.map(cue => cue.text).join('')
}

async function buildAudioTranscripts(audioRelativePaths: string[]): Promise<AudioTranscript[]> {
  return Promise.all(audioRelativePaths.map(async (relativePath) => {
    const abs = getAbsolutePath(relativePath)
    if (!fs.existsSync(abs)) throw new Error(`音频文件不存在：${relativePath}`)
    const duration = await probeMediaDuration(abs)
    const { srtPath, cues, cached } = await transcribeAudioToSrt(abs)
    return {
      audioPath: relativePath,
      spokenText: cuesToSpokenText(cues),
      cues,
      srtPath,
      duration,
      cached,
    }
  }))
}

function targetCharWeight(target: TtsTarget): number {
  return Math.max(1, normalizeAlignText(target.parsed.pureText).length)
}

function greedyAssignPairs(
  n: number,
  pairs: Array<{ ti: number; ai: number; cost: number }>,
): Map<number, number> {
  pairs.sort((a, b) => a.cost - b.cost)
  const leftUsed = Array(n).fill(false)
  const rightUsed = Array(n).fill(false)
  const assignment = new Map<number, number>()

  for (const pair of pairs) {
    if (leftUsed[pair.ti] || rightUsed[pair.ai]) continue
    leftUsed[pair.ti] = true
    rightUsed[pair.ai] = true
    assignment.set(pair.ti, pair.ai)
  }

  for (let ti = 0; ti < n; ti++) {
    if (assignment.has(ti)) continue
    for (let ai = 0; ai < n; ai++) {
      if (rightUsed[ai]) continue
      rightUsed[ai] = true
      assignment.set(ti, ai)
      break
    }
  }

  return assignment
}

/** 段数与分镜相同：按字数占比 vs 音频时长占比匹配（不依赖 Whisper 错字） */
function matchEqualCountByDuration(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  const n = targets.length
  const charWeights = targets.map(targetCharWeight)
  const totalChars = charWeights.reduce((sum, w) => sum + w, 0) || n
  const durations = transcripts.map(t => t.duration)
  const totalDur = durations.reduce((sum, d) => sum + d, 0) || n

  const pairs: Array<{ ti: number; ai: number; cost: number }> = []
  for (let ti = 0; ti < n; ti++) {
    const charShare = charWeights[ti] / totalChars
    for (let ai = 0; ai < n; ai++) {
      const durShare = durations[ai] / totalDur
      pairs.push({ ti, ai, cost: Math.abs(charShare - durShare) })
    }
  }

  const assignment = greedyAssignPairs(n, pairs)
  return targets.map((_, ti) => {
    const ai = assignment.get(ti)
    if (ai == null) throw new Error(`镜头 #${targets[ti].sb.storyboardNumber} 未找到匹配的配音段`)
    return { targetIndices: [ti], transcript: transcripts[ai], matchScore: 1 }
  })
}

/** 音频段少于分镜：按各段时长占比划分连续分镜组 */
function matchFewerAudiosByDuration(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  const n = targets.length
  const m = transcripts.length
  const charWeights = targets.map(targetCharWeight)
  const totalChars = charWeights.reduce((sum, w) => sum + w, 0) || n
  const durations = transcripts.map(t => t.duration)
  const totalDur = durations.reduce((sum, d) => sum + d, 0) || m

  const groups: ContentMatchGroup[] = []
  let ti = 0

  for (let j = 0; j < m; j++) {
    const isLast = j === m - 1
    const targetChars = isLast
      ? charWeights.slice(ti).reduce((sum, w) => sum + w, 0)
      : (durations[j] / totalDur) * totalChars

    const indices: number[] = []
    let acc = 0
    while (ti < n) {
      if (!isLast && indices.length > 0 && acc >= targetChars) break
      indices.push(ti)
      acc += charWeights[ti]
      ti++
    }
    if (!indices.length && ti < n) {
      indices.push(ti++)
    }

    groups.push({
      targetIndices: indices,
      transcript: transcripts[j],
      matchScore: 1,
    })
  }

  while (ti < n) {
    groups[groups.length - 1].targetIndices.push(ti++)
  }

  return groups
}

/** 音频段多于分镜：按字数占比 vs 时长占比为每镜挑选音频 */
function matchMoreAudiosByDuration(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  const charWeights = targets.map(targetCharWeight)
  const totalChars = charWeights.reduce((sum, w) => sum + w, 0) || targets.length
  const durations = transcripts.map(t => t.duration)
  const totalDur = durations.reduce((sum, d) => sum + d, 0) || transcripts.length

  const audioUsed = Array(transcripts.length).fill(false)
  return targets.map((target, ti) => {
    const charShare = charWeights[ti] / totalChars
    let bestAi = -1
    let bestCost = Infinity
    for (let ai = 0; ai < transcripts.length; ai++) {
      if (audioUsed[ai]) continue
      const durShare = durations[ai] / totalDur
      const cost = Math.abs(charShare - durShare)
      if (cost < bestCost) {
        bestCost = cost
        bestAi = ai
      }
    }
    if (bestAi < 0) throw new Error(`镜头 #${target.sb.storyboardNumber} 未找到匹配的配音段`)
    audioUsed[bestAi] = true
    return { targetIndices: [ti], transcript: transcripts[bestAi], matchScore: 1 }
  })
}

function matchTranscriptsToTargets(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  if (!transcripts.length) throw new Error('没有可用的配音转写结果')
  if (transcripts.length === 1) {
    return [{
      targetIndices: targets.map((_, i) => i),
      transcript: transcripts[0],
      matchScore: 1,
    }]
  }
  if (transcripts.length === targets.length) return matchEqualCountByDuration(targets, transcripts)
  if (transcripts.length < targets.length) return matchFewerAudiosByDuration(targets, transcripts)
  return matchMoreAudiosByDuration(targets, transcripts)
}

async function assignGroupToStoryboards(
  targets: TtsTarget[],
  group: ContentMatchGroup,
  ts: string,
): Promise<{
  results: Array<{ storyboard_id: number; tts_audio_url: string; duration: number }>
  sourceDuration: number
  alignScore: number
  subtitleCount: number
  srtPath: string
  srtCached: boolean
}> {
  const groupTargets = group.targetIndices.map(i => targets[i])

  if (groupTargets.length === 1) {
    const clipPath = await importWholeAudioFile(group.transcript.audioPath)
    const result = await assignStoryboardTtsClip(groupTargets[0].sb.id, clipPath, ts)
    return {
      results: [result],
      sourceDuration: group.transcript.duration,
      alignScore: group.matchScore,
      subtitleCount: group.transcript.cues.length,
      srtPath: group.transcript.srtPath,
      srtCached: group.transcript.cached,
    }
  }

  const payload = await splitAudioToTargetsBySrt(
    groupTargets,
    group.transcript.audioPath,
    ts,
    false,
  )
  return {
    results: payload.results,
    sourceDuration: payload.sourceDuration,
    alignScore: Math.max(group.matchScore, payload.align_score),
    subtitleCount: payload.subtitle_count,
    srtPath: payload.srt_path,
    srtCached: payload.srt_cached,
  }
}

async function splitAudioByContentMatch(
  targets: TtsTarget[],
  audioRelativePaths: string[],
  ts: string,
) {
  const transcripts = await buildAudioTranscripts(audioRelativePaths)
  const groups = matchTranscriptsToTargets(targets, transcripts)
  const allScripts = targets.map(t => t.parsed.pureText)

  const allResults: Array<{ storyboard_id: number; tts_audio_url: string; duration: number }> = []
  let sourceDuration = 0
  let alignScoreSum = 0
  let subtitleCount = 0
  let srtCachedCount = 0
  let srtPath: string | undefined

  for (const group of groups) {
    const payload = await assignGroupToStoryboards(targets, group, ts)
    allResults.push(...payload.results)
    sourceDuration += payload.sourceDuration
    alignScoreSum += payload.alignScore
    subtitleCount += payload.subtitleCount
    srtPath = payload.srtPath
    if (payload.srtCached) srtCachedCount++
  }

  return {
    results: allResults,
    sourceDuration,
    mode: 'multi' as const,
    align_mode: 'weighted' as const,
    align_score: alignScoreSum / Math.max(1, groups.length),
    srt_path: srtPath,
    subtitle_count: subtitleCount,
    srt_cached_count: srtCachedCount,
    srt_files: transcripts.map((transcript, idx) => {
      const group = groups.find(g => g.transcript.audioPath === transcript.audioPath)
      const scripts = group
        ? group.targetIndices.map(i => allScripts[i])
        : []
      return buildSrtFilePayload(transcript, scripts)
    }),
  }
}

async function importWholeAudioFile(audioRelativePath: string): Promise<string> {
  const inputAbs = getAbsolutePath(audioRelativePath)
  if (!fs.existsSync(inputAbs)) throw new Error(`音频文件不存在：${audioRelativePath}`)
  const dir = path.join(STORAGE_ROOT, 'audio', 'tts-import')
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(inputAbs).toLowerCase() || '.mp3'
  const filename = `${uuid()}${ext}`
  const outputAbs = path.join(dir, filename)
  fs.copyFileSync(inputAbs, outputAbs)
  return `static/audio/tts-import/${filename}`
}

export async function splitNarrationAudioForEpisode(episodeId: number, audioInput: string | string[]) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const audioPaths = (Array.isArray(audioInput) ? audioInput : [audioInput])
    .map(p => String(p || '').trim())
    .filter(Boolean)
  if (!audioPaths.length) throw new Error('请提供音频文件')

  const targets = getEpisodeTtsTargets(episodeId)
  if (!targets.length) throw new Error('当前没有可分配配音的分镜文案')

  logTaskStart('NarrationAudioSplit', 'split', {
    episodeId,
    audioCount: audioPaths.length,
    shotCount: targets.length,
    mode: audioPaths.length > 1 ? 'multi' : 'single',
  })

  const ts = now()
  const merged = audioPaths.length > 1
  const payload = merged
    ? await splitAudioByContentMatch(targets, audioPaths, ts)
    : await splitAudioToTargetsBySrt(targets, audioPaths[0], ts, false)

  logTaskSuccess('NarrationAudioSplit', 'split', {
    episodeId,
    assigned: payload.results.length,
    sourceDuration: payload.sourceDuration,
    mode: payload.mode,
    alignMode: payload.align_mode,
    alignScore: payload.align_score,
    subtitleCount: payload.subtitle_count,
    srtCachedCount: payload.srt_cached_count ?? ('srt_cached' in payload && payload.srt_cached ? 1 : 0),
  })

  return {
    assigned_count: payload.results.length,
    source_duration: payload.sourceDuration,
    segment_count: audioPaths.length,
    merged,
    mode: payload.mode,
    align_mode: payload.align_mode,
    align_score: payload.align_score,
    srt_path: payload.srt_path,
    subtitle_count: payload.subtitle_count,
    srt_cached_count: payload.srt_cached_count ?? ('srt_cached' in payload && payload.srt_cached ? 1 : 0),
    srt_files: payload.srt_files ?? [],
    clips: payload.results,
  }
}

export async function applyUploadedTtsToStoryboard(storyboardId: number, audioRelativePath: string) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')

  const clipPath = await importWholeAudioFile(audioRelativePath)
  const result = await assignStoryboardTtsClip(sb.id, clipPath, now())
  return result
}
