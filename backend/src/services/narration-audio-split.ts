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
  textMatchScore,
  textMismatchCost,
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
  alignModeHint: 'srt' | 'content_match' = 'srt',
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
    align_mode: alignModeHint === 'content_match' ? 'content_match' as const : aligned.mode,
    align_score: aligned.alignScore,
    srt_path: srtPath,
    subtitle_count: cues.length,
    srt_cached: srtCached,
    srt_files: [buildSrtFilePayload({
      audioPath: audioRelativePath,
      spokenText: cuesToSpokenText(cues),
      cues,
      srtPath,
      duration: totalDuration,
      cached: srtCached,
    })],
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
  }>
}

function buildSrtFilePayload(transcript: AudioTranscript): NarrationSrtFilePayload {
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
    })),
  }
}

export async function transcribeNarrationAudioFiles(audioInput: string | string[]) {
  const audioPaths = (Array.isArray(audioInput) ? audioInput : [audioInput])
    .map(p => String(p || '').trim())
    .filter(Boolean)
  if (!audioPaths.length) throw new Error('请提供音频文件')

  const transcripts = await buildAudioTranscripts(audioPaths)
  return {
    segment_count: audioPaths.length,
    srt_files: transcripts.map(buildSrtFilePayload),
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

function combinedTargetScript(targets: TtsTarget[], indices: number[]): string {
  return indices.map(i => targets[i].parsed.pureText).join('')
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

/** 段数与分镜相同时：按转写内容与旁白文案最优匹配（与上传顺序无关） */
function matchEqualCountByContent(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  const n = targets.length
  const pairs: Array<{ ti: number; ai: number; cost: number }> = []
  for (let ti = 0; ti < n; ti++) {
    for (let ai = 0; ai < n; ai++) {
      pairs.push({
        ti,
        ai,
        cost: textMismatchCost(targets[ti].parsed.pureText, transcripts[ai].spokenText),
      })
    }
  }
  pairs.sort((a, b) => a.cost - b.cost)

  const targetUsed = Array(n).fill(false)
  const audioUsed = Array(n).fill(false)
  const assignment = new Map<number, number>()

  for (const pair of pairs) {
    if (targetUsed[pair.ti] || audioUsed[pair.ai]) continue
    targetUsed[pair.ti] = true
    audioUsed[pair.ai] = true
    assignment.set(pair.ti, pair.ai)
  }

  for (let ti = 0; ti < n; ti++) {
    if (assignment.has(ti)) continue
    let bestAi = -1
    let bestCost = Infinity
    for (let ai = 0; ai < n; ai++) {
      if (audioUsed[ai]) continue
      const cost = textMismatchCost(targets[ti].parsed.pureText, transcripts[ai].spokenText)
      if (cost < bestCost) {
        bestCost = cost
        bestAi = ai
      }
    }
    if (bestAi >= 0) {
      audioUsed[bestAi] = true
      assignment.set(ti, bestAi)
    }
  }

  return targets.map((_, ti) => {
    const ai = assignment.get(ti)
    if (ai == null) throw new Error(`镜头 #${targets[ti].sb.storyboardNumber} 未找到匹配的配音段，请检查上传内容`)
    const transcript = transcripts[ai]
    const matchScore = textMatchScore(targets[ti].parsed.pureText, transcript.spokenText)
    return { targetIndices: [ti], transcript, matchScore }
  })
}

/** 音频段少于分镜：将连续分镜分组后按文案内容匹配到各段音频 */
function matchFewerAudiosByContent(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  const n = targets.length
  const m = transcripts.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Number.POSITIVE_INFINITY))
  const parent: Array<Array<{ prevI: number; transcriptIdx: number; start: number } | null>> =
    Array.from({ length: m + 1 }, () => Array(n + 1).fill(null))
  dp[0][0] = 0

  for (let j = 0; j < m; j++) {
    for (let i = j; i <= n - (m - j); i++) {
      if (!Number.isFinite(dp[j][i])) continue
      const minEnd = i + 1
      const maxEnd = n - (m - j - 1)
      for (let end = minEnd; end <= maxEnd; end++) {
        const script = combinedTargetScript(targets, Array.from({ length: end - i }, (_, k) => i + k))
        const cost = textMismatchCost(script, transcripts[j].spokenText)
        const next = dp[j][i] + cost
        if (next < dp[j + 1][end]) {
          dp[j + 1][end] = next
          parent[j + 1][end] = { prevI: i, transcriptIdx: j, start: i }
        }
      }
    }
  }

  if (!Number.isFinite(dp[m][n])) {
    throw new Error('无法将配音段与分镜旁白对齐，请确认每段音频内容与分镜文案对应')
  }

  const groups: ContentMatchGroup[] = []
  let i = n
  let j = m
  while (j > 0) {
    const node = parent[j][i]
    if (!node) break
    const indices = Array.from({ length: i - node.start }, (_, k) => node.start + k)
    const transcript = transcripts[node.transcriptIdx]
    groups.unshift({
      targetIndices: indices,
      transcript,
      matchScore: textMatchScore(combinedTargetScript(targets, indices), transcript.spokenText),
    })
    i = node.start
    j = node.transcriptIdx
  }

  return groups
}

/** 音频段多于分镜：为每个分镜挑选最匹配的音频段 */
function matchMoreAudiosByContent(
  targets: TtsTarget[],
  transcripts: AudioTranscript[],
): ContentMatchGroup[] {
  const audioUsed = Array(transcripts.length).fill(false)
  return targets.map((target, ti) => {
    let bestAi = -1
    let bestCost = Infinity
    for (let ai = 0; ai < transcripts.length; ai++) {
      if (audioUsed[ai]) continue
      const cost = textMismatchCost(target.parsed.pureText, transcripts[ai].spokenText)
      if (cost < bestCost) {
        bestCost = cost
        bestAi = ai
      }
    }
    if (bestAi < 0) throw new Error(`镜头 #${target.sb.storyboardNumber} 未找到匹配的配音段`)
    audioUsed[bestAi] = true
    const transcript = transcripts[bestAi]
    return {
      targetIndices: [ti],
      transcript,
      matchScore: textMatchScore(target.parsed.pureText, transcript.spokenText),
    }
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
      matchScore: textMatchScore(combinedTargetScript(targets, targets.map((_, i) => i)), transcripts[0].spokenText),
    }]
  }
  if (transcripts.length === targets.length) return matchEqualCountByContent(targets, transcripts)
  if (transcripts.length < targets.length) return matchFewerAudiosByContent(targets, transcripts)
  return matchMoreAudiosByContent(targets, transcripts)
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
  const shouldTrimInsideFile = groupTargets.length === 1
    && (
      group.transcript.cues.length > 1
      || textMismatchCost(groupTargets[0].parsed.pureText, group.transcript.spokenText) > 0.18
    )

  if (groupTargets.length === 1 && !shouldTrimInsideFile) {
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
    'content_match',
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
    align_mode: 'content_match' as const,
    align_score: alignScoreSum / Math.max(1, groups.length),
    srt_path: srtPath,
    subtitle_count: subtitleCount,
    srt_cached_count: srtCachedCount,
    srt_files: transcripts.map(buildSrtFilePayload),
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
    mode: audioPaths.length > 1 ? 'content_match' : 'srt',
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
    srtCachedCount: payload.srt_cached_count ?? (payload.srt_cached ? 1 : 0),
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
    srt_cached_count: payload.srt_cached_count ?? (payload.srt_cached ? 1 : 0),
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
