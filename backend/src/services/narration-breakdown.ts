import { eq } from 'drizzle-orm'
import {
  formatMotionComicDialogue,
  motionComicShotDescription,
  type MotionComicStoryboardShot,
} from '../constants/motion-comic.js'
import { buildMotionComicStoryboardMetaFromShot, buildMotionComicSegmentMotionMeta } from './motion-comic-meta.js'
import { buildMotionComicStoryboardShotsWithLLM } from './motion-comic-storyboard-llm.js'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
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
} from './narration-characters.js'
import {
  splitNarrationSentencesWithMeta,
  splitTitleSentencesWithMeta,
} from './narration-scene-detect.js'
import { resolveSubtitleNarrationFromSentence, ensureSentenceEmphasisMark } from '../utils/subtitle-emphasis.js'
import { resolveNarrationStoryboardTextModel, resolveEpisodeTextThinking } from '../constants/text-models.js'
import { buildStoryboardSentenceItemsWithLLM } from './narration-storyboard-llm.js'
import { logTaskWarn } from '../utils/task-logger.js'

const TITLE_PREFIX_RE = /^标题\s*[:：]\s*(.+)$/i
const TITLE_ALT_PREFIX_RE = /^(?:片头(?:标题)?|开场标题)\s*[:：]\s*(.+)$/i
const TITLE_BRACKET_RE = /^【\s*标题\s*】\s*(.+)$/i
const TITLE_OPENING_RE = /^今天体验的人生剧本是[，,]?\s*.+/
const TITLE_SCRIPT_RE = /^(?:本期|本集)?人生剧本\s*[:：]?\s*.+/

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

  if (TITLE_OPENING_RE.test(firstLine) || TITLE_SCRIPT_RE.test(firstLine)) {
    return { title: firstLine, body: lines.slice(1).join('\n').trim() }
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

export function estimateNarrationDuration(sentence: string, isTitle = false) {
  const chars = sentence.replace(/\s/g, '').length
  if (isTitle) return Math.max(6, Math.min(12, Math.ceil(chars / 3.5)))
  return Math.max(3, Math.min(12, Math.ceil(chars / 4.5)))
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
  )

  return { storyboardNumber, duration }
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
    options?.onProgress?.(patch)
  }

  report({ message: '正在解析漫剧台本…', percent: 8, phase: 'reading' })

  const { title, body } = parseNarrationScript(script)
  const titleVisualHook = title ? extractTitleHook(title) : null
  // 传完整台本给 LLM，避免 parseNarrationScript 剥掉「标题：」前缀
  const scriptForLlm = script.trim()

  const textModel = resolveNarrationStoryboardTextModel(ep, options?.textModel)
  const episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
  const characterNames = episodeCharacters.map(c => c.name).filter(Boolean)

  report({ message: '正在 LLM 拆成一体化分镜（对白·表情动作·运镜·背景）…', percent: 15, phase: 'llm' })

  let titleShots: MotionComicStoryboardShot[] = []
  let shots: MotionComicStoryboardShot[] = []
  let emphasisSource: 'llm' | 'rules' = 'llm'

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

  report({ message: `已保存 ${storyboardNumber} 镜`, percent: 100, phase: 'done' })

  return {
    count: storyboardNumber,
    sentence_count: shots.length,
    title_count: titleShots.length,
    title_hook: titleVisualHook,
    total_duration: totalDuration,
    emphasis_source: emphasisSource,
    text_model: textModel,
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
    options?.onProgress?.(patch)
  }

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const script = (scriptOverride || ep.scriptContent || ep.content || '').trim()
  if (!script) throw new Error('请先填写解说文案')

  report({ message: '正在解析解说稿…', percent: 8, phase: 'reading' })

  const { title, body } = parseNarrationScript(script)
  const titleVisualHook = title ? extractTitleHook(title) : null

  let titleItems = title ? splitTitleSentencesWithMeta(title) : []
  let sentenceItems = body.trim() ? splitNarrationSentencesWithMeta(body) : []
  let emphasisSource: 'llm' | 'rules' = 'rules'

  const textModel = resolveNarrationStoryboardTextModel(ep, options?.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, options?.textThinking)

  report({ message: '正在 LLM 整稿拆镜并标注 ** 强调…', percent: 15, phase: 'llm' })

  try {
    const llmItems = await buildStoryboardSentenceItemsWithLLM(title, body, {
      textModel,
      textThinking,
      episodeTextModel: ep.textModel,
      titleHook: titleVisualHook,
    })
    titleItems = llmItems.titleItems
    sentenceItems = llmItems.sentenceItems
    emphasisSource = 'llm'
    report({ message: `拆镜完成：片头 ${titleItems.length} 句、正文 ${sentenceItems.length} 句`, percent: 72, phase: 'llm' })
  } catch (err: unknown) {
    logTaskWarn('NarrationBreakdown', 'storyboard-llm-fallback', {
      episodeId,
      error: String((err as Error)?.message || err || 'unknown'),
    })
    titleItems = title ? splitTitleSentencesWithMeta(title) : []
    sentenceItems = body.trim() ? splitNarrationSentencesWithMeta(body) : []
    report({ message: 'LLM 拆镜失败，使用规则拆句…', percent: 50, phase: 'fallback' })
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

  if (titleItems.length) {
    const titleFull = title!
    titleItems.forEach((item) => {
      const sentence = item.sentence
      const duration = estimateNarrationDuration(sentence, true)
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
    const duration = estimateNarrationDuration(marked)
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
