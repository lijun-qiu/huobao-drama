/**
 * 对话立绘拆镜：按「角色名：台词」一行一镜，写 speaker / expression / layout / slot / scene_id
 */
import { eq } from 'drizzle-orm'
import {
  DIALOGUE_PORTRAIT_MAX_CHARS,
  buildDialoguePortraitScenePrompt,
  inferExpressionFromDialogue,
} from '../constants/dialogue-portrait.js'
import { isDialoguePortraitMode, parseProductionMode } from '../constants/production-mode.js'
import { db, schema } from '../db/index.js'
import {
  isMotionComicOutroLine,
  motionComicScriptHasSpeakerPrefixes,
  parseMotionComicSpeakerLines,
  sanitizeMotionComicScript,
} from '../utils/motion-comic-script.js'
import { now } from '../utils/response.js'
import { resolveSubtitleNarrationFromSentence, ensureSentenceEmphasisMark } from '../utils/subtitle-emphasis.js'
import { logTaskWarn } from '../utils/task-logger.js'
import {
  buildDialoguePortraitStoryboardMeta,
  resolveDialoguePortraitSlots,
} from './dialogue-portrait-meta.js'
import {
  getEpisodeVisualCharacters,
  linkStoryboardCharactersFromText,
  syncMotionComicCharactersFromSpeakers,
} from './narration-characters.js'
import { estimateNarrationDuration, extractTitleHook, parseNarrationScript } from './narration-breakdown.js'

function ensureDefaultSceneId(episodeId: number, dramaId: number, locationHint?: string | null): number {
  const location = String(locationHint || '').trim() || '室内'
  const epLinks = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId)).all()

  // 优先复用同地点场景（对话立绘按空行/【场景】换景）
  for (const link of epLinks) {
    const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, link.sceneId)).all()
    if (!scene || scene.deletedAt) continue
    const loc = String(scene.location || scene.prompt || '').trim()
    if (loc === location || loc.includes(location) || location.includes(loc)) {
      return scene.id
    }
  }

  // 无地点提示时，回退本集已有场景
  if (!String(locationHint || '').trim()) {
    for (const link of epLinks) {
      const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, link.sceneId)).all()
      if (scene && !scene.deletedAt) return scene.id
    }
  }

  const dramaScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId)).all()
    .filter(s => !s.deletedAt)
  const sameLoc = dramaScenes.find(s => {
    const loc = String(s.location || s.prompt || '').trim()
    return loc === location || (locationHint && (loc.includes(location) || location.includes(loc)))
  })
  if (sameLoc) {
    const ts = now()
    if (!epLinks.some(l => l.sceneId === sameLoc.id)) {
      db.insert(schema.episodeScenes).values({
        episodeId,
        sceneId: sameLoc.id,
        createdAt: ts,
      }).run()
    }
    return sameLoc.id
  }

  const epScoped = !locationHint
    ? dramaScenes.find(s => s.episodeId === episodeId)
    : undefined
  if (epScoped) {
    const ts = now()
    if (!epLinks.some(l => l.sceneId === epScoped.id)) {
      db.insert(schema.episodeScenes).values({
        episodeId,
        sceneId: epScoped.id,
        createdAt: ts,
      }).run()
    }
    return epScoped.id
  }

  const ts = now()
  const res = db.insert(schema.scenes).values({
    dramaId,
    episodeId,
    location,
    time: '',
    // 无人空镜约束写入描述字段；生图只按 prompt 原文
    prompt: buildDialoguePortraitScenePrompt(location),
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const sceneId = Number(res.lastInsertRowid)
  db.insert(schema.episodeScenes).values({
    episodeId,
    sceneId,
    createdAt: ts,
  }).run()
  return sceneId
}

function matchSpeakerCharacterId(
  speaker: string,
  characters: Array<{ id: number; name: string }>,
): number | null {
  const name = String(speaker || '').trim()
  if (!name || name === '旁白' || name === '剧中') return null
  const exact = characters.find(c => c.name.trim() === name)
  if (exact) return exact.id
  const partial = characters.find(c => name.includes(c.name.trim()) || c.name.trim().includes(name))
  return partial?.id ?? null
}

function parseDialogueLines(body: string, fallbackSpeaker: string): Array<{ speaker: string; dialogue: string }> {
  const text = String(body || '').trim()
  if (!text) return []

  if (motionComicScriptHasSpeakerPrefixes(text)) {
    return parseMotionComicSpeakerLines(text)
      .filter(line => !isMotionComicOutroLine(line.dialogue) && !isMotionComicOutroLine(`${line.speaker}：${line.dialogue}`))
  }

  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(line => !isMotionComicOutroLine(line))
    .map((line) => {
      const m = line.match(/^(.+?)[:：]\s*(.+)$/s)
      if (m) {
        return {
          speaker: m[1].replace(/[（(].+?[)）]/g, '').trim() || fallbackSpeaker,
          dialogue: m[2].trim(),
        }
      }
      return { speaker: fallbackSpeaker, dialogue: line }
    })
}

const SCENE_HEADER_RE = /^(?:【([^】]+)】|场景\s*[:：]\s*(.+))$/

function parseSceneHeaderLine(line: string): string | null {
  const m = String(line || '').trim().match(SCENE_HEADER_RE)
  if (!m) return null
  return String(m[1] || m[2] || '').trim() || null
}

/** 按空行分段；段首「【客厅】/场景：…」作为地点，不进入对白 */
function parseDialogueSceneSegments(
  body: string,
  fallbackSpeaker: string,
): Array<{ locationHint?: string; lines: Array<{ speaker: string; dialogue: string }> }> {
  const text = String(body || '').replace(/\r\n/g, '\n').trim()
  if (!text) return []

  const chunks = text.split(/\n\s*\n/).map(c => c.trim()).filter(Boolean)
  const segments: Array<{ locationHint?: string; lines: Array<{ speaker: string; dialogue: string }> }> = []

  for (const chunk of chunks) {
    const rawLines = chunk.split('\n').map(l => l.trim()).filter(Boolean)
    if (!rawLines.length) continue
    let locationHint: string | undefined
    let start = 0
    const headerLoc = parseSceneHeaderLine(rawLines[0])
    if (headerLoc) {
      locationHint = headerLoc
      start = 1
    }
    const dialogueBlock = rawLines.slice(start).join('\n')
    const lines = parseDialogueLines(dialogueBlock, fallbackSpeaker)
      .filter(l => !parseSceneHeaderLine(`${l.speaker}：${l.dialogue}`))
    if (!lines.length && !locationHint) continue
    segments.push({ locationHint, lines })
  }

  // 无空行分段时：整篇一段
  if (!segments.length) {
    const lines = parseDialogueLines(text, fallbackSpeaker)
    if (lines.length) segments.push({ lines })
  }
  return segments
}

export async function breakdownDialoguePortraitStoryboards(
  episodeId: number,
  scriptOverride?: string,
  options?: {
    onProgress?: (patch: { message: string; percent?: number; phase?: string }) => void
  },
) {
  const report = (patch: { message: string; percent?: number; phase?: string }) => {
    options?.onProgress?.(patch)
  }

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('Episode not found')

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  if (!isDialoguePortraitMode(parseProductionMode(drama?.metadata))) {
    throw new Error('当前项目不是对话立绘模式')
  }

  const script = (scriptOverride || ep.scriptContent || ep.content || '').trim()
  if (!script) throw new Error('请先填写对话脚本')

  report({ message: '正在解析对话脚本…', percent: 8, phase: 'reading' })

  const cleaned = sanitizeMotionComicScript(script)
  const { title, body } = parseNarrationScript(cleaned)
  const titleVisualHook = title ? extractTitleHook(title) : null

  let episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
  const fallbackSpeaker = episodeCharacters[0]?.name?.trim() || '旁白'
  const segments = parseDialogueSceneSegments(body, fallbackSpeaker)
  const rawLines = segments.flatMap(s => s.lines)

  if (!rawLines.length && !title) throw new Error('未能从脚本中拆出有效对话行')

  report({ message: '正在同步说话人角色…', percent: 30, phase: 'characters' })

  const existingStoryboardIds = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId)).all()
    .map(sb => sb.id)
  for (const storyboardId of existingStoryboardIds) {
    db.delete(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      .run()
  }
  db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

  const ts = now()
  {
    const speakers = new Set(rawLines.map(l => l.speaker.trim()).filter(Boolean))
    for (const speaker of speakers) {
      if (speaker === '旁白' || speaker === '剧中') continue
      const existing = db.select().from(schema.characters).all()
        .find(c => c.dramaId === ep.dramaId && !c.deletedAt && c.name.trim() === speaker)
      let characterId = existing?.id
      if (!characterId) {
        const res = db.insert(schema.characters).values({
          dramaId: ep.dramaId,
          name: speaker,
          role: '角色',
          createdAt: ts,
          updatedAt: ts,
        }).run()
        characterId = Number(res.lastInsertRowid)
      }
      const linked = db.select().from(schema.episodeCharacters)
        .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
        .find(row => row.characterId === characterId)
      if (!linked) {
        db.insert(schema.episodeCharacters).values({
          episodeId,
          characterId: characterId!,
          createdAt: ts,
        }).run()
      }
    }
  }

  episodeCharacters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
  if (episodeCharacters.length > DIALOGUE_PORTRAIT_MAX_CHARS) {
    logTaskWarn('DialoguePortraitBreakdown', 'cast-cap', {
      episodeId,
      visualCount: episodeCharacters.length,
      used: DIALOGUE_PORTRAIT_MAX_CHARS,
      message: '对话立绘仅使用前 2 个视觉角色分配左右槽位',
    })
  }
  const castIds = episodeCharacters.slice(0, DIALOGUE_PORTRAIT_MAX_CHARS).map(c => c.id)
  const castChars = episodeCharacters.slice(0, DIALOGUE_PORTRAIT_MAX_CHARS)

  const firstLocationHint = segments.find(s => s.locationHint)?.locationHint
    || rawLines.find(l =>
      /室内|室外|房间|客厅|卧室|办公室|教室|街道|咖啡馆|餐厅/.test(l.dialogue),
    )?.dialogue?.match(/(室内|室外|房间|客厅|卧室|办公室|教室|街道|咖啡馆|餐厅)[^，。！？]{0,8}/)?.[0]
  const defaultSceneId = ensureDefaultSceneId(episodeId, ep.dramaId, firstLocationHint)

  report({ message: '正在写入对话分镜…', percent: 55, phase: 'saving' })

  let totalDuration = 0
  let storyboardNumber = 0
  let titleCount = 0
  const sceneIdsUsed = new Set<number>()

  if (title?.trim()) {
    const sentence = title.trim()
    const duration = estimateNarrationDuration(sentence, true)
    storyboardNumber++
    titleCount++
    totalDuration += duration
    const slots = resolveDialoguePortraitSlots(castIds, castIds[0] ?? null)
    sceneIdsUsed.add(defaultSceneId)
    const res = db.insert(schema.storyboards).values({
      episodeId,
      sceneId: defaultSceneId,
      storyboardNumber,
      title: '片头标题',
      description: sentence,
      dialogue: `剧中：${sentence}`,
      imagePrompt: null,
      referenceImages: buildDialoguePortraitStoryboardMeta({
        speaker: '剧中',
        expression: 'idle',
        layout: slots.layout,
        slot: 'center',
        scene_id: defaultSceneId,
        narration_shot_type: 'title',
        narration_tts_mode: 'new',
        title_hook: titleVisualHook || extractTitleHook(sentence),
        title_full: sentence,
        dialogueText: sentence,
      }),
      shotType: '标题',
      angle: '平视',
      movement: '固定',
      duration,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    if (castIds.length) {
      for (const characterId of castIds) {
        db.insert(schema.storyboardCharacters).values({
          storyboardId: Number(res.lastInsertRowid),
          characterId,
        }).run()
      }
    } else {
      linkStoryboardCharactersFromText(
        Number(res.lastInsertRowid),
        [sentence, titleVisualHook].filter(Boolean).join('\n'),
        episodeCharacters,
      )
    }
  }

  let bodySentenceIndex = 0
  segments.forEach((segment, segmentIndex) => {
    const sceneId = segmentIndex === 0 && !segment.locationHint
      ? defaultSceneId
      : ensureDefaultSceneId(
        episodeId,
        ep.dramaId,
        segment.locationHint || `场景${segmentIndex + 1}`,
      )
    sceneIdsUsed.add(sceneId)

    for (const line of segment.lines) {
      const marked = ensureSentenceEmphasisMark(line.dialogue)
      const duration = estimateNarrationDuration(marked)
      totalDuration += duration
      storyboardNumber++

      const speakerCharacterId = matchSpeakerCharacterId(line.speaker, castChars)
      const slots = resolveDialoguePortraitSlots(castIds, speakerCharacterId)
      const expression = inferExpressionFromDialogue(marked)
      const dialogue = `${line.speaker}：${marked}`

      const res = db.insert(schema.storyboards).values({
        episodeId,
        sceneId,
        storyboardNumber,
        title: marked.slice(0, 12) || `镜头${storyboardNumber}`,
        description: marked,
        dialogue,
        action: expression,
        imagePrompt: null,
        referenceImages: buildDialoguePortraitStoryboardMeta({
          speaker: line.speaker,
          speaker_character_id: speakerCharacterId ?? undefined,
          expression,
          layout: slots.layout,
          slot: slots.speakerSlot,
          scene_id: sceneId,
          listener_character_id: slots.listenerId ?? undefined,
          listener_expression: slots.listenerId ? 'idle' : undefined,
          listener_slot: slots.listenerSlot ?? undefined,
          narration_tts_mode: 'new',
          body_sentence_index: bodySentenceIndex,
          script_paragraph_index: segmentIndex,
          subtitle_narration: resolveSubtitleNarrationFromSentence(marked),
          dialogueText: marked,
        }),
        shotType: '中景',
        angle: '平视',
        movement: '固定',
        duration,
        createdAt: ts,
        updatedAt: ts,
      }).run()

      bodySentenceIndex++

      const linkIds = castIds.length ? castIds : []
      if (linkIds.length) {
        for (const characterId of linkIds) {
          db.insert(schema.storyboardCharacters).values({
            storyboardId: Number(res.lastInsertRowid),
            characterId,
          }).run()
        }
      } else {
        linkStoryboardCharactersFromText(
          Number(res.lastInsertRowid),
          dialogue,
          episodeCharacters,
          { dialogue, speakerPriority: true },
        )
      }
    }
  })

  syncMotionComicCharactersFromSpeakers(episodeId, ep.dramaId)

  db.update(schema.episodes)
    .set({ duration: Math.max(1, Math.ceil(totalDuration / 60)), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
    .run()

  report({ message: `已保存 ${storyboardNumber} 镜`, percent: 100, phase: 'done' })

  return {
    count: storyboardNumber,
    sentence_count: rawLines.length,
    title_count: titleCount,
    title_hook: titleVisualHook,
    total_duration: totalDuration,
    emphasis_source: 'rules' as const,
    cast_character_ids: castIds,
    cast_capped: episodeCharacters.length > DIALOGUE_PORTRAIT_MAX_CHARS,
    scene_id: defaultSceneId,
    scene_ids: [...sceneIdsUsed],
    scene_count: sceneIdsUsed.size,
    storyboard_breakdown_at: now(),
    generated_at: now(),
  }
}
