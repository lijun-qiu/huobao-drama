import { eq } from 'drizzle-orm'
import {
  formatMotionComicDialogue,
  motionComicShotDescription,
  type MotionComicStoryboardShot,
} from '../constants/motion-comic.js'
import {
  NARRATION_SCRIPT_CHARS_PER_MINUTE,
  NARRATION_VIDEO_CHARS_PER_SEC,
  NARRATION_VIDEO_SHOT_SEC_MAX,
  NARRATION_VIDEO_SHOT_SEC_MIN,
  NARRATION_VIDEO_TARGET_SHOT_CHARS,
  NARRATION_VIDEO_TARGET_SHOT_SEC,
} from '../constants/narration-video-timing.js'
import { NOVEL_COMIC_SHOT_DURATION_SEC } from '../constants/novel-comic.js'
import { isDialoguePortraitMode, isNarrationVideoMode, isNovelComicMode, parseProductionMode, usesMotionComicStoryboardRules } from '../constants/production-mode.js'
import {
  buildMotionComicStoryboardMetaFromShot,
  buildMotionComicSegmentMotionMeta,
} from './motion-comic-meta.js'
import { buildMotionComicStoryboardShotsWithLLM } from './motion-comic-storyboard-llm.js'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import {
  extractMotionComicTitleShot,
  isMotionComicOutroLine,
  motionComicScriptHasSpeakerPrefixes,
  parseMotionComicSpeakerLines,
  sanitizeMotionComicScript,
} from '../utils/motion-comic-script.js'
import {
  buildNarrationTitleImagePromptContent,
  artStylePrompt,
  isNarrationMinimalStyle,
  sanitizeSceneImagePrompt,
} from '../constants/art-styles.js'
import {
  buildNarrationImageMeta,
} from './narration-image.js'
import {
  getEpisodeVisualCharacters,
  linkStoryboardCharactersFromText,
  syncMotionComicCharactersFromSpeakers,
  linkAllNarrationStoryboardCharacters,
} from './narration-characters.js'
import {
  splitNarrationSentencesWithMeta,
  splitTitleSentencesWithMeta,
} from './narration-scene-detect.js'
import { resolveSubtitleNarrationFromSentence, ensureSentenceEmphasisMark } from '../utils/subtitle-emphasis.js'
import { resolveNarrationStoryboardTextModel, resolveEpisodeTextThinking } from '../constants/text-models.js'
import {
  buildStoryboardSentenceItemsWithLLM,
  generateNarrationShotVisualDescriptions,
  packNarrationVideoShotsWithLLM,
} from './narration-storyboard-llm.js'
import { logTaskWarn } from '../utils/task-logger.js'

const TITLE_PREFIX_RE = /^标题\s*[:：]\s*(.+)$/i
const TITLE_ALT_PREFIX_RE = /^(?:片头(?:标题)?|开场标题)\s*[:：]\s*(.+)$/i
const TITLE_BRACKET_RE = /^【\s*标题\s*】\s*(.+)$/i
const TITLE_OPENING_RE = /^今天体验的人生剧本是[，,]?\s*.+/
const TITLE_SCRIPT_RE = /^(?:本期|本集)?人生剧本\s*[:：]?\s*.+/
const MOTION_COMIC_TITLE_RE = /^(?:剧中\s*[:：]\s*)?(?:本期|本集)?故事\s*[:：]\s*.+/

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, '')
}

export function parseNarrationScript(text: string) {
  const normalized = stripBom(text.replace(/\r\n/g, '\n')).trim()
  if (!normalized) return { title: null as string | null, body: '' }

  const lines = normalized.split('\n').map(line => line.trim())
  const firstLine = lines[0] || ''

  const explicit =
    firstLine.match(TITLE_PREFIX_RE)
    || firstLine.match(TITLE_ALT_PREFIX_RE)
    || firstLine.match(TITLE_BRACKET_RE)

  if (explicit) {
    const title = explicit[1].trim()
    const body = lines.slice(1).join('\n').trim()
    return { title: title || null, body }
  }

  if (TITLE_OPENING_RE.test(firstLine) || TITLE_SCRIPT_RE.test(firstLine) || MOTION_COMIC_TITLE_RE.test(firstLine)) {
    return { title: firstLine.replace(/^剧中\s*[:：]\s*/, ''), body: lines.slice(1).join('\n').trim() }
  }

  const blocks = normalized.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean)
  if (blocks.length >= 2) {
    const opener = blocks[0].replace(/\n/g, ' ').trim()
    if (opener.length >= 4 && opener.length <= 48 && !/[。！？；!?]$/.test(opener)) {
      return { title: opener, body: blocks.slice(1).join('\n\n').trim() }
    }
  }

  return { title: null, body: normalized }
}

export function extractTitleHook(title: string) {
  let hook = title
    .replace(/^今天体验的人生剧本是[，,]?\s*/, '')
    .replace(/^(?:本期|本集)?人生剧本\s*[:：]?\s*/, '')
    .replace(/^(?:本期|本集)?故事\s*[:：]\s*/, '')
    .replace(/^剧中\s*[:：]\s*/, '')
    .replace(/^【|】$/g, '')
    .replace(/^[，,、\s]+/, '')
    .trim()
  if (!hook) hook = title.trim()

  const firstSegment = hook.split(/[，,]/)[0]?.trim() || hook
  if (firstSegment.length >= 6 && firstSegment.length <= 22) return firstSegment
  if (hook.length > 20) return hook.slice(0, 20)
  return hook
}

/** 片头配图用：优先从完整标题提取主题，避免「今天体验的人生剧本是」这类前缀句 */
export function resolveTitleVisualHook(titleFull?: string | null, titleHook?: string | null): string {
  const full = String(titleFull || '').trim()
  if (full) return extractTitleHook(full)
  const hook = String(titleHook || '').trim()
  if (!hook) return ''
  const stripped = extractTitleHook(hook)
  return stripped && stripped !== hook ? stripped : extractTitleHook(hook)
}

export function buildTitleImagePrompt(
  moodHint: string,
  style = 'comic',
  ctx?: { titleFull?: string | null; bodySentences?: string[] },
) {
  if (isNarrationMinimalStyle(style)) {
    return buildNarrationTitleImagePromptContent(moodHint, {
      titleFull: ctx?.titleFull,
      titleHook: moodHint,
      bodySentences: ctx?.bodySentences,
    })
  }
  const hook = sanitizeSceneImagePrompt(moodHint)
  return [
    'Chinese short drama narration opening background, single full illustration',
    'absolutely no text, no letters, no words, no watermark, no captions on image',
    'NOT romantic couple, NOT clock faces, NOT roses, NOT dreamlike abstract wallpaper, NOT pixel art, NOT retro photo filter',
    artStylePrompt(style, 'title'),
    `visual theme based on story hook: ${hook}`,
    '16:9 landscape, high quality',
  ].join(', ')
}

/** @deprecated 使用 splitNarrationSentencesWithMeta */
export function splitNarrationSentences(text: string): string[] {
  return splitNarrationSentencesWithMeta(text).map(item => item.sentence)
}

export {
  NARRATION_SCRIPT_CHARS_PER_MINUTE,
  NARRATION_VIDEO_CHARS_PER_SEC,
  NARRATION_VIDEO_SHOT_SEC_MAX,
  NARRATION_VIDEO_SHOT_SEC_MIN,
  NARRATION_VIDEO_TARGET_SHOT_CHARS,
  NARRATION_VIDEO_TARGET_SHOT_SEC,
}

export function estimateNarrationDuration(sentence: string, isTitle = false) {
  const chars = sentence.replace(/\s/g, '').length
  if (isTitle) return Math.max(6, Math.min(12, Math.round(chars / 3.5) || 6))
  // 按解说脚本节奏估秒数，落在 7～13s（目标约 10s / 108 字）
  return Math.max(
    NARRATION_VIDEO_SHOT_SEC_MIN,
    Math.min(NARRATION_VIDEO_SHOT_SEC_MAX, Math.round(chars / NARRATION_VIDEO_CHARS_PER_SEC) || NARRATION_VIDEO_SHOT_SEC_MIN),
  )
}

function narrationDialogueCharLen(text: string) {
  return String(text || '').replace(/\s/g, '').length
}

/** 过长台词按标点切成约 targetSec（约 108 字）的片段 */
function splitDialogueByTargetDuration(dialogue: string, targetSec = NARRATION_VIDEO_TARGET_SHOT_SEC): string[] {
  const text = String(dialogue || '').trim()
  if (!text) return []
  const targetChars = Math.round(targetSec * NARRATION_VIDEO_CHARS_PER_SEC)
  const softMaxChars = Math.round(targetSec * 1.35 * NARRATION_VIDEO_CHARS_PER_SEC)
  if (narrationDialogueCharLen(text) <= softMaxChars) return [text]

  let parts = text.split(/(?<=[。！？!?；;])/).map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) {
    parts = text.split(/(?<=[，,、])/).map(s => s.trim()).filter(Boolean)
  }
  if (parts.length <= 1) {
    const chunks: string[] = []
    let rest = text
    while (narrationDialogueCharLen(rest) > softMaxChars) {
      chunks.push(rest.slice(0, targetChars))
      rest = rest.slice(targetChars)
    }
    if (rest.trim()) chunks.push(rest.trim())
    return chunks
  }

  const chunks: string[] = []
  let buf = ''
  for (const part of parts) {
    const merged = buf ? `${buf}${part}` : part
    if (buf && narrationDialogueCharLen(merged) > softMaxChars) {
      chunks.push(buf)
      buf = part
    } else if (narrationDialogueCharLen(merged) >= targetChars) {
      chunks.push(merged)
      buf = ''
    } else {
      buf = merged
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

export type NarrationVideoPackedSegment = {
  speaker: string
  dialogue: string
}

export type NarrationVideoPackedShot = {
  /** 首个说话人（兼容旧调用） */
  speaker: string
  /** 纯台词拼接（不计说话人名前缀），用于估时长 / 字数 */
  dialogue: string
  segments: NarrationVideoPackedSegment[]
  sourceLineIndices: number[]
}

export function packedShotCharLen(shot: Pick<NarrationVideoPackedShot, 'segments' | 'dialogue'>) {
  if (shot.segments?.length) {
    return shot.segments.reduce((n, s) => n + narrationDialogueCharLen(s.dialogue), 0)
  }
  return narrationDialogueCharLen(shot.dialogue)
}

export function formatPackedShotDialogueLines(shot: NarrationVideoPackedShot): string {
  const segs = shot.segments?.length
    ? shot.segments
    : [{ speaker: shot.speaker, dialogue: shot.dialogue }]
  return segs
    .map(s => formatMotionComicDialogue(s.speaker, ensureSentenceEmphasisMark(s.dialogue)))
    .join('\n')
}

export function packedShotVisualLine(shot: NarrationVideoPackedShot): string {
  const segs = shot.segments?.length
    ? shot.segments
    : [{ speaker: shot.speaker, dialogue: shot.dialogue }]
  return segs.map(s => `${s.speaker}：${s.dialogue}`).join('\n')
}

/**
 * 解说视频：按解说脚本节奏（约 650 字/分钟 → 10s≈108 字）打包。
 * - 同说话人 / 不同说话人均可合并，直到接近目标字数
 * - 过长单句会先按标点切开
 */
export function packNarrationVideoShotsByDuration(
  lines: Array<{ speaker: string; dialogue: string }>,
  targetSec = NARRATION_VIDEO_TARGET_SHOT_SEC,
): NarrationVideoPackedShot[] {
  const targetChars = Math.round(targetSec * NARRATION_VIDEO_CHARS_PER_SEC)
  const softMinChars = Math.round(targetSec * 0.55 * NARRATION_VIDEO_CHARS_PER_SEC)
  const softMaxChars = Math.round(targetSec * 1.35 * NARRATION_VIDEO_CHARS_PER_SEC)

  const atoms: Array<{ speaker: string; dialogue: string; sourceIndex: number }> = []
  lines.forEach((line, index) => {
    const chunks = splitDialogueByTargetDuration(line.dialogue, targetSec)
    for (const chunk of chunks) {
      atoms.push({ speaker: line.speaker, dialogue: chunk, sourceIndex: index })
    }
  })

  const packed: NarrationVideoPackedShot[] = []
  let cur: NarrationVideoPackedShot | null = null
  for (const atom of atoms) {
    if (!cur) {
      cur = {
        speaker: atom.speaker,
        dialogue: atom.dialogue,
        segments: [{ speaker: atom.speaker, dialogue: atom.dialogue }],
        sourceLineIndices: [atom.sourceIndex],
      }
      continue
    }
    const curLen = packedShotCharLen(cur)
    const mergedLen = curLen + narrationDialogueCharLen(atom.dialogue)
    const canMerge = mergedLen <= softMaxChars
      && (curLen < softMinChars || mergedLen <= Math.round(targetChars * 1.2))
    if (canMerge) {
      const last = cur.segments[cur.segments.length - 1]
      if (last && last.speaker === atom.speaker) {
        const joiner = /[。！？!?；;，,、]$/.test(last.dialogue) ? '' : '，'
        last.dialogue = `${last.dialogue}${joiner}${atom.dialogue}`
      } else {
        cur.segments.push({ speaker: atom.speaker, dialogue: atom.dialogue })
      }
      cur.dialogue = cur.segments.map(s => s.dialogue).join('')
      cur.sourceLineIndices.push(atom.sourceIndex)
      continue
    }
    packed.push(cur)
    cur = {
      speaker: atom.speaker,
      dialogue: atom.dialogue,
      segments: [{ speaker: atom.speaker, dialogue: atom.dialogue }],
      sourceLineIndices: [atom.sourceIndex],
    }
  }
  if (cur) packed.push(cur)
  return packed
}

function insertMotionComicStoryboardShot(
  episodeId: number,
  shot: MotionComicStoryboardShot,
  storyboardNumber: number,
  ts: string,
  options: {
    isTitle?: boolean
    titleFull?: string | null
    titleHook?: string | null
    paragraphIndex?: number
    bodyIndex?: number
    episodeCharacters: ReturnType<typeof getEpisodeVisualCharacters>
  },
): { storyboardNumber: number; duration: number } {
  const dialogue = formatMotionComicDialogue(shot.speaker, shot.dialogue, shot.emphasis_word)
  const isTitle = options.isTitle ?? shot.speaker === '剧中'
  const duration = estimateNarrationDuration(dialogue.replace(/^[^：:]+[:：]\s*/, ''), isTitle)
  const description = motionComicShotDescription(shot)
  const motionMeta = buildMotionComicSegmentMotionMeta(
    [`${shot.dialogue} ${shot.expression_action}`.trim()],
    options.paragraphIndex ?? options.bodyIndex ?? storyboardNumber,
    {
      movement: shot.movement,
      shotType: shot.shot_type,
      expressionAction: shot.expression_action,
    },
  )

  const res = db.insert(schema.storyboards).values({
    episodeId,
    storyboardNumber,
    title: isTitle ? '片头标题' : (shot.dialogue.slice(0, 12) || `镜头${storyboardNumber}`),
    location: shot.background,
    description,
    dialogue,
    action: shot.expression_action,
    atmosphere: shot.atmosphere || null,
    imagePrompt: null,
    referenceImages: buildMotionComicStoryboardMetaFromShot(shot, {
      script_paragraph_index: options.paragraphIndex ?? 0,
      body_sentence_index: options.bodyIndex,
      subtitle_narration: dialogue.replace(/^[^：:]+[:：]\s*/, ''),
      ...(isTitle && options.titleFull
        ? {
          narration_shot_type: 'title' as const,
          title_hook: options.titleHook ?? undefined,
          title_full: options.titleFull,
        }
        : {}),
    }, options.bodyIndex ?? storyboardNumber),
    shotType: motionMeta.shotType,
    angle: shot.angle,
    movement: motionMeta.movement,
    duration,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  linkStoryboardCharactersFromText(
    Number(res.lastInsertRowid),
    [dialogue, shot.expression_action, shot.background, options.titleFull].filter(Boolean).join('\n'),
    options.episodeCharacters,
    { dialogue, speakerPriority: true },
  )

  return { storyboardNumber, duration }
}

function defaultMotionComicShotFromLine(line: { speaker: string; dialogue: string }): MotionComicStoryboardShot {
  return {
    speaker: line.speaker,
    dialogue: line.dialogue,
    expression_action: '自然状态',
    shot_type: '中景',
    angle: '平视',
    movement: '固定',
    background: '未指定场景',
  }
}

function buildMotionComicShotsFromSpeakerScript(script: string): {
  titleShots: MotionComicStoryboardShot[]
  shots: MotionComicStoryboardShot[]
} | null {
  const cleaned = sanitizeMotionComicScript(script)
  const { title, body } = parseNarrationScript(cleaned)
  if (!body.trim() || !motionComicScriptHasSpeakerPrefixes(body)) return null

  const rawLines = parseMotionComicSpeakerLines(body)
    .filter(line => !isMotionComicOutroLine(line.dialogue) && !isMotionComicOutroLine(`${line.speaker}：${line.dialogue}`))

  const titleLine = extractMotionComicTitleShot(title, rawLines)
  let bodyLines = rawLines
  if (titleLine && bodyLines[0]?.speaker === titleLine.speaker && bodyLines[0]?.dialogue === titleLine.dialogue) {
    bodyLines = bodyLines.slice(1)
  }

  const titleShots = titleLine ? [defaultMotionComicShotFromLine(titleLine)] : []
  const shots = bodyLines.map(defaultMotionComicShotFromLine)
  if (!titleShots.length && !shots.length) return null
  return { titleShots, shots }
}

async function breakdownMotionComicStoryboards(
  episodeId: number,
  script: string,
  ep: typeof schema.episodes.$inferSelect,
  options?: {
    textModel?: string | null
    textThinking?: boolean
    onProgress?: (patch: { message: string; percent?: number; phase?: string }) => void
  },
) {
  const report = (patch: { message: string; percent?: number; phase?: string }) => {
    try {
      options?.onProgress?.(patch)
    } catch {
      // SSE 已断开时勿打断拆镜落库
    }
  }

  report({ message: '正在解析漫剧台本…', percent: 8, phase: 'reading' })

  const scriptClean = sanitizeMotionComicScript(script)
  const { title, body } = parseNarrationScript(scriptClean)
  const titleVisualHook = title ? extractTitleHook(title) : null
  const scriptForLlm = scriptClean.trim()

  const textModel = resolveNarrationStoryboardTextModel(ep, options?.textModel)
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
  const characterNames = episodeCharacters.map(c => c.name).filter(Boolean)

  report({ message: '正在 LLM 拆成一体化分镜（对白·表情动作·运镜·背景）…', percent: 15, phase: 'llm' })

  let titleShots: MotionComicStoryboardShot[] = []
  let shots: MotionComicStoryboardShot[] = []
  let emphasisSource: 'llm' | 'rules' = 'llm'

  const parsedFromSpeakers = buildMotionComicShotsFromSpeakerScript(scriptClean)
  if (parsedFromSpeakers) {
    titleShots = parsedFromSpeakers.titleShots
    shots = parsedFromSpeakers.shots
    emphasisSource = 'rules'
    report({ message: `规则拆镜：片头 ${titleShots.length} 镜、正文 ${shots.length} 镜`, percent: 72, phase: 'parse' })
  } else {
  try {
    const llmResult = await buildMotionComicStoryboardShotsWithLLM(scriptForLlm, {
      textModel,
      episodeTextModel: ep.textModel,
      characterNames,
    })
    titleShots = llmResult.titleShots
    shots = llmResult.shots
    if (!titleShots.length && title?.trim()) {
      const titleLine = /^标题\s*[:：]/.test(script.trim().split('\n')[0] || '')
        ? script.trim().split('\n')[0].trim()
        : `标题：${title.trim()}`
      titleShots = [{
        speaker: '剧中',
        dialogue: titleLine,
        expression_action: '标题呈现',
        shot_type: '全景',
        angle: '平视',
        movement: '固定',
        background: '片头氛围背景',
        shot_role: 'establishing',
      }]
    }
    report({ message: `拆镜完成：片头 ${titleShots.length} 镜、正文 ${shots.length} 镜`, percent: 72, phase: 'llm' })
  } catch (err: unknown) {
    logTaskWarn('NarrationBreakdown', 'motion-comic-storyboard-fallback', {
      episodeId,
      error: String((err as Error)?.message || err || 'unknown'),
    })
    emphasisSource = 'rules'
    report({ message: '一体化分镜 LLM 失败，请检查台本格式后重试', percent: 50, phase: 'fallback' })
    throw err
  }
  }

  if (!titleShots.length && !shots.length) throw new Error('未能从台本中拆分出有效镜头')

  report({ message: '正在写入镜头…', percent: 78, phase: 'saving' })

  const ts = now()
  const existingStoryboardIds = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .map(sb => sb.id)

  for (const storyboardId of existingStoryboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

  let totalDuration = 0
  let storyboardNumber = 0
  const titleFull = title || titleShots[0]?.dialogue || null

  for (const shot of titleShots) {
    storyboardNumber++
    const { duration } = insertMotionComicStoryboardShot(episodeId, shot, storyboardNumber, ts, {
      isTitle: true,
      titleFull,
      titleHook: titleVisualHook,
      episodeCharacters,
    })
    totalDuration += duration
  }

  shots.forEach((shot, index) => {
    storyboardNumber++
    const { duration } = insertMotionComicStoryboardShot(episodeId, shot, storyboardNumber, ts, {
      paragraphIndex: 0,
      bodyIndex: index,
      episodeCharacters,
    })
    totalDuration += duration
  })

  db.update(schema.episodes)
    .set({ duration: Math.max(1, Math.ceil(totalDuration / 60)), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  syncMotionComicCharactersFromSpeakers(episodeId, ep.dramaId)
  linkAllNarrationStoryboardCharacters(episodeId, ep.dramaId)

  report({ message: `已保存 ${storyboardNumber} 镜`, percent: 100, phase: 'done' })

  return {
    count: storyboardNumber,
    sentence_count: shots.length,
    title_count: titleShots.length,
    title_hook: titleVisualHook,
    total_duration: totalDuration,
    emphasis_source: emphasisSource,
    text_model: textModel,
    storyboard_breakdown_at: now(),
    generated_at: now(),
  }
}

/** 解说视频：按约 10s 口播量拆镜，一镜一图/一视频，并为每镜写画面描述 */
async function breakdownNarrationVideoSpeakerStoryboards(
  episodeId: number,
  script: string,
  ep: typeof schema.episodes.$inferSelect,
  options?: {
    textModel?: string | null
    textThinking?: boolean
    onProgress?: (patch: { message: string; percent?: number; phase?: string }) => void
  },
) {
  const report = (patch: { message: string; percent?: number; phase?: string }) => {
    try {
      options?.onProgress?.(patch)
    } catch {
      // SSE 已断开时勿打断拆镜落库
    }
  }

  report({ message: '正在解析解说脚本…', percent: 8, phase: 'reading' })

  const { title, body } = parseNarrationScript(script)
  const titleVisualHook = title ? extractTitleHook(title) : null
  const rawLines = parseMotionComicSpeakerLines(body)
    .filter(line => !isMotionComicOutroLine(line.dialogue) && !isMotionComicOutroLine(`${line.speaker}：${line.dialogue}`))

  const titleLine = extractMotionComicTitleShot(title, rawLines)
  let bodyLines = rawLines
  if (titleLine && bodyLines[0]?.speaker === titleLine.speaker && bodyLines[0]?.dialogue === titleLine.dialogue) {
    bodyLines = bodyLines.slice(1)
  }

  if (!titleLine && !bodyLines.length) throw new Error('未能从解说脚本中拆出说话人行')

  const textModel = resolveNarrationStoryboardTextModel(ep, options?.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, options?.textThinking)
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)

  report({
    message: `LLM 分镜中：约 ${NARRATION_VIDEO_TARGET_SHOT_SEC}s/镜（≈${NARRATION_VIDEO_TARGET_SHOT_CHARS}字，${NARRATION_SCRIPT_CHARS_PER_MINUTE}字/分），输入 ${bodyLines.length} 行…`,
    percent: 18,
    phase: 'llm',
  })

  const llmPack = await packNarrationVideoShotsWithLLM(bodyLines, { textModel, textThinking })
  if (!llmPack?.shots?.length) {
    throw new Error(`LLM 分镜失败（模型：${textModel}）。请重试，不使用规则分镜。`)
  }

  const packedBody: NarrationVideoPackedShot[] = llmPack.shots.map((shot) => ({
    speaker: shot.segments[0]?.speaker || '旁白',
    dialogue: shot.segments.map(s => s.dialogue).join(''),
    segments: shot.segments,
    sourceLineIndices: [],
  }))
  const visuals = llmPack.shots.map(s => String(s.visual || '').trim())
  const llmDurations = llmPack.shots.map(s => s.durationSec)
  let visualCount = visuals.filter(Boolean).length
  const emphasisSource: 'llm' | 'rules' = 'llm'

  if (visualCount < packedBody.length) {
    report({
      message: `LLM 分镜完成：${bodyLines.length} 行 → ${packedBody.length} 镜；补写缺失画面描述（${packedBody.length - visualCount} 镜）…`,
      percent: 55,
      phase: 'llm',
    })
    const filled = await generateNarrationShotVisualDescriptions(
      packedBody.map(shot => ({
        speaker: shot.speaker,
        dialogue: shot.dialogue,
        line: packedShotVisualLine(shot),
      })),
      { textModel, textThinking },
    )
    if (filled?.length === packedBody.length) {
      for (let i = 0; i < packedBody.length; i++) {
        if (!visuals[i] && filled[i]) visuals[i] = filled[i]
      }
      visualCount = visuals.filter(Boolean).length
    }
  }

  report({
    message: visualCount
      ? `LLM 分镜完成：${bodyLines.length} 行 → ${packedBody.length} 镜（含 ${visualCount} 条画面描述）`
      : `LLM 分镜完成：${bodyLines.length} 行 → ${packedBody.length} 镜（画面描述缺失，台词回退）`,
    percent: 72,
    phase: 'llm',
  })

  report({ message: '正在写入分镜脚本…', percent: 78, phase: 'saving' })

  const ts = now()
  const existingStoryboardIds = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .map(sb => sb.id)

  for (const storyboardId of existingStoryboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

  let totalDuration = 0
  let storyboardNumber = 0
  /** 一镜一图：paragraph_index 与镜序对齐，后续配图无需再合并分镜 */
  let paragraphIndex = 0

  if (titleLine) {
    const sentence = titleLine.dialogue
    const duration = estimateNarrationDuration(sentence, true)
    storyboardNumber++
    totalDuration += duration
    const titleFull = title || sentence
    const titlePara = paragraphIndex++
    const res = db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber,
      title: `片头标题 · ${duration}s`,
      description: sentence,
      dialogue: formatMotionComicDialogue(titleLine.speaker || '剧中', sentence),
      imagePrompt: null,
      referenceImages: buildNarrationImageMeta('new', {
        narration_shot_type: 'title',
        narration_tts_mode: 'new',
        title_hook: titleVisualHook || extractTitleHook(sentence),
        title_full: titleFull,
        paragraph_index: titlePara,
        paragraph_layout: 'single',
        narration_lines: [sentence],
        scene_content: sentence,
      }),
      shotType: '标题',
      angle: '平视',
      movement: '固定',
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkStoryboardCharactersFromText(
      Number(res.lastInsertRowid),
      [titleFull, titleVisualHook, sentence].filter(Boolean).join('\n'),
      episodeCharacters,
      { dialogue: formatMotionComicDialogue(titleLine.speaker || '剧中', sentence), speakerPriority: true },
    )
  }

  packedBody.forEach((line, index) => {
    const dialogue = formatPackedShotDialogueLines(line)
    const plain = line.dialogue
    const markedPlain = ensureSentenceEmphasisMark(plain)
    const visual = String(visuals[index] || '').trim()
    const description = visual || markedPlain
    const duration = Number.isFinite(llmDurations[index]) && llmDurations[index]! > 0
      ? Math.max(
          NARRATION_VIDEO_SHOT_SEC_MIN,
          Math.min(NARRATION_VIDEO_SHOT_SEC_MAX, Math.round(llmDurations[index]!)),
        )
      : estimateNarrationDuration(plain)
    totalDuration += duration
    storyboardNumber++
    const paraIdx = paragraphIndex++
    const narrationLines = line.segments.map(s => ensureSentenceEmphasisMark(s.dialogue))
    const titleHint = line.segments.length > 1
      ? `${line.segments.map(s => s.speaker).filter((v, i, a) => a.indexOf(v) === i).join('+')}`.slice(0, 10)
      : (markedPlain.slice(0, 10) || `镜头${storyboardNumber}`)

    const res = db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber,
      title: `${titleHint} · ${duration}s`,
      description,
      dialogue,
      imagePrompt: null,
      referenceImages: buildNarrationImageMeta('new', {
        narration_tts_mode: 'new',
        script_paragraph_index: 0,
        body_sentence_index: index,
        paragraph_index: paraIdx,
        paragraph_layout: 'single',
        narration_lines: narrationLines,
        image_narration_lines: narrationLines,
        subtitle_narration: resolveSubtitleNarrationFromSentence(markedPlain),
        scene_content: visual || markedPlain,
        highlight_motion: true,
      }),
      shotType: '中景',
      angle: '平视',
      movement: '固定',
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkStoryboardCharactersFromText(
      Number(res.lastInsertRowid),
      [dialogue, description].join('\n'),
      episodeCharacters,
      { dialogue, speakerPriority: true },
    )
  })

  db.update(schema.episodes)
    .set({ duration: Math.max(1, Math.ceil(totalDuration / 60)), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  syncMotionComicCharactersFromSpeakers(episodeId, ep.dramaId)
  linkAllNarrationStoryboardCharacters(episodeId, ep.dramaId)

  report({
    message: `已保存 ${storyboardNumber} 镜（LLM 分镜，约 ${NARRATION_VIDEO_TARGET_SHOT_SEC}s/≈${NARRATION_VIDEO_TARGET_SHOT_CHARS}字，合计 ${totalDuration}s）`,
    percent: 100,
    phase: 'done',
  })

  return {
    count: storyboardNumber,
    sentence_count: packedBody.length,
    source_line_count: bodyLines.length,
    title_count: titleLine ? 1 : 0,
    title_hook: titleVisualHook,
    total_duration: totalDuration,
    target_shot_sec: NARRATION_VIDEO_TARGET_SHOT_SEC,
    target_shot_chars: NARRATION_VIDEO_TARGET_SHOT_CHARS,
    emphasis_source: emphasisSource,
    pack_source: 'llm',
    text_model: llmPack.model || textModel,
    storyboard_breakdown_at: now(),
    generated_at: now(),
  }
}

/** 旁白分镜：整稿一次 LLM 拆镜 + ** 标注（失败回退规则拆句 + 批量标注） */
export async function breakdownNarrationStoryboards(
  episodeId: number,
  scriptOverride?: string,
  options?: {
    textModel?: string | null
    textThinking?: boolean
    onProgress?: (patch: { message: string; percent?: number; phase?: string }) => void
  },
) {
  const report = (patch: { message: string; percent?: number; phase?: string }) => {
    try {
      options?.onProgress?.(patch)
    } catch {
      // SSE 已断开时勿打断拆镜落库
    }
  }

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  const productionMode = parseProductionMode(drama?.metadata)
  // 小说漫画：只用原文 content（不再经讲解稿）；解说视频：只用解说脚本 script_content
  const script = isNarrationVideoMode(productionMode)
    ? (scriptOverride || ep.scriptContent || '').trim()
    : isNovelComicMode(productionMode)
      ? (scriptOverride || ep.content || '').trim()
      : (scriptOverride || ep.scriptContent || ep.content || '').trim()
  if (!script) {
    if (isNovelComicMode(productionMode)) throw new Error('请先在「文案输入」粘贴本章小说原文')
    if (isNarrationVideoMode(productionMode)) throw new Error('请先在「解说脚本」步骤生成或填写解说脚本')
    throw new Error(isDialoguePortraitMode(productionMode) ? '请先填写对话脚本' : '请先填写解说文案')
  }

  if (isDialoguePortraitMode(productionMode)) {
    const { breakdownDialoguePortraitStoryboards } = await import('./dialogue-portrait-breakdown.js')
    return breakdownDialoguePortraitStoryboards(episodeId, script, {
      onProgress: options?.onProgress,
    })
  }
  if (usesMotionComicStoryboardRules(productionMode)) {
    return breakdownMotionComicStoryboards(episodeId, script, ep, options)
  }

  // 解说视频：说话人行稿 → 按行拆镜 + 画面描述
  if (isNarrationVideoMode(productionMode)) {
    const { body } = parseNarrationScript(script)
    if (motionComicScriptHasSpeakerPrefixes(body) || motionComicScriptHasSpeakerPrefixes(script)) {
      return breakdownNarrationVideoSpeakerStoryboards(episodeId, script, ep, options)
    }
  }

  report({ message: '正在解析解说稿…', percent: 8, phase: 'reading' })

  const { title, body } = parseNarrationScript(script)
  const titleVisualHook = title ? extractTitleHook(title) : null

  let titleItems = title ? splitTitleSentencesWithMeta(title) : []
  let sentenceItems = body.trim() ? splitNarrationSentencesWithMeta(body) : []
  let emphasisSource: 'llm' | 'rules' = 'rules'

  const textModel = resolveNarrationStoryboardTextModel(ep, options?.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, options?.textThinking)

  report({
    message: `正在请求模型拆镜：${textModel}`,
    percent: 15,
    phase: 'llm',
  })

  try {
    const llmItems = await buildStoryboardSentenceItemsWithLLM(title, body, {
      textModel,
      textThinking,
      episodeTextModel: ep.textModel,
      titleHook: titleVisualHook,
      onProgress: options?.onProgress,
    })
    titleItems = llmItems.titleItems
    sentenceItems = llmItems.sentenceItems
    emphasisSource = llmItems.usedLlmSplit ? 'llm' : 'rules'
    report({
      message: llmItems.usedLlmSplit
        ? `模型已连上并返回：片头 ${titleItems.length} 句、正文 ${sentenceItems.length} 句`
        : `模型未连上/未响应，已用规则拆句：片头 ${titleItems.length} 句、正文 ${sentenceItems.length} 句`,
      percent: 72,
      phase: llmItems.usedLlmSplit ? 'llm' : 'fallback',
    })
  } catch (err: unknown) {
    logTaskWarn('NarrationBreakdown', 'storyboard-llm-fallback', {
      episodeId,
      error: String((err as Error)?.message || err || 'unknown'),
    })
    titleItems = title ? splitTitleSentencesWithMeta(title) : []
    sentenceItems = body.trim() ? splitNarrationSentencesWithMeta(body) : []
    report({
      message: `模型连不上（${String((err as Error)?.message || err || '未知错误').slice(0, 120)}）→ 规则拆句…`,
      percent: 50,
      phase: 'fallback',
    })
  }

  if (!titleItems.length && !sentenceItems.length) throw new Error('未能从文案中拆分出有效句子')
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)

  report({ message: '正在写入镜头…', percent: 78, phase: 'saving' })

  const ts = now()
  const existingStoryboardIds = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .map(sb => sb.id)

  for (const storyboardId of existingStoryboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

  let totalDuration = 0
  let storyboardNumber = 0

  const novelComicMode = isNovelComicMode(productionMode)
  const shotDuration = (sentence: string, isTitle = false) => (
    novelComicMode ? NOVEL_COMIC_SHOT_DURATION_SEC : estimateNarrationDuration(sentence, isTitle)
  )

  if (titleItems.length) {
    const titleFull = title!
    titleItems.forEach((item) => {
      const sentence = item.sentence
      const duration = shotDuration(sentence, true)
      storyboardNumber++
      totalDuration += duration
      const res = db.insert(schema.storyboards).values({
        episodeId,
        storyboardNumber,
        title: '片头标题',
        description: sentence,
        dialogue: `剧中：${sentence}`,
        imagePrompt: null,
        referenceImages: buildNarrationImageMeta('inherit', {
          narration_shot_type: 'title',
          narration_tts_mode: 'new',
          title_hook: titleVisualHook || extractTitleHook(sentence),
          title_full: titleFull,
        }),
        shotType: '标题',
        angle: '平视',
        movement: '固定',
        duration,
        createdAt: ts,
        updatedAt: ts,
      }).run()
      linkStoryboardCharactersFromText(
        Number(res.lastInsertRowid),
        [titleFull, titleVisualHook, sentence].filter(Boolean).join('\n'),
        episodeCharacters,
      )
    })
  }

  sentenceItems.forEach((item, index) => {
    const marked = ensureSentenceEmphasisMark(item.sentence)
    const duration = shotDuration(marked)
    totalDuration += duration
    storyboardNumber++

    const res = db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber,
      title: marked.slice(0, 12) || `镜头${storyboardNumber}`,
      description: marked,
      dialogue: `旁白：${marked}`,
      imagePrompt: null,
      referenceImages: buildNarrationImageMeta('inherit', {
        narration_tts_mode: 'new',
        script_paragraph_index: item.paragraphIndex,
        body_sentence_index: index,
        subtitle_narration: resolveSubtitleNarrationFromSentence(marked),
      }),
      shotType: '中景',
      angle: '平视',
      movement: '固定',
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkStoryboardCharactersFromText(
      Number(res.lastInsertRowid),
      marked,
      episodeCharacters,
    )
  })

  db.update(schema.episodes)
    .set({ duration: Math.max(1, Math.ceil(totalDuration / 60)), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  report({ message: `已保存 ${storyboardNumber} 镜`, percent: 100, phase: 'done' })

  return {
    count: storyboardNumber,
    sentence_count: sentenceItems.length,
    title_count: titleItems.length,
    title_hook: titleVisualHook,
    total_duration: totalDuration,
    emphasis_source: emphasisSource,
    text_model: textModel,
    storyboard_breakdown_at: now(),
    generated_at: now(),
  }
}

/** @deprecated 请分别调用 breakdownNarrationStoryboards 与 breakdownNarrationImages */
export async function breakdownNarrationEpisode(
  episodeId: number,
  style = 'comic',
  scriptOverride?: string,
  _imageDetectMode?: import('./narration-scene-detect.js').ImageDetectMode,
) {
  return breakdownNarrationStoryboards(episodeId, scriptOverride)
}
