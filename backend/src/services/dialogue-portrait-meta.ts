/**
 * 对话立绘 — 分镜 / 角色 meta helpers（不污染 motion-comic）
 */
import {
  type DialoguePortraitExpression,
  type DialoguePortraitLayout,
  type DialoguePortraitSlot,
  DIALOGUE_PORTRAIT_EXPRESSIONS,
  inferExpressionFromDialogue,
  inferDialoguePortraitExpression,
  parseCharacterDialoguePortraitPack,
  resolveLayout,
  resolveSlots,
} from '../constants/dialogue-portrait.js'
import type { NarrationImageMeta } from './narration-image.js'
import { buildNarrationImageMeta, parseNarrationImageMeta } from './narration-image.js'

export type DialoguePortraitStoryboardMeta = NarrationImageMeta & {
  speaker?: string
  speaker_character_id?: number
  expression?: DialoguePortraitExpression
  layout?: DialoguePortraitLayout
  slot?: DialoguePortraitSlot
  scene_id?: number
  /** 听者角色 id（duo） */
  listener_character_id?: number
  listener_expression?: DialoguePortraitExpression
  listener_slot?: DialoguePortraitSlot
}

function parseExpression(raw: unknown): DialoguePortraitExpression | undefined {
  const v = String(raw || '').trim()
  return (DIALOGUE_PORTRAIT_EXPRESSIONS as readonly string[]).includes(v)
    ? (v as DialoguePortraitExpression)
    : undefined
}

function parseLayout(raw: unknown): DialoguePortraitLayout | undefined {
  if (raw === 'solo' || raw === 'duo') return raw
  return undefined
}

function parseSlot(raw: unknown): DialoguePortraitSlot | undefined {
  if (raw === 'left' || raw === 'right' || raw === 'center') return raw
  return undefined
}

export function parseDialoguePortraitStoryboardMeta(
  referenceImages?: string | null,
): DialoguePortraitStoryboardMeta {
  const base = parseNarrationImageMeta(referenceImages)
  if (!referenceImages) return base as DialoguePortraitStoryboardMeta
  try {
    const parsed = JSON.parse(referenceImages) as Record<string, unknown>
    const nested = (parsed.dialogue_portrait && typeof parsed.dialogue_portrait === 'object')
      ? (parsed.dialogue_portrait as Record<string, unknown>)
      : null
    const src = { ...parsed, ...(nested || {}) }
    const speakerIdRaw = src.speaker_character_id ?? src.speakerCharacterId
    const sceneIdRaw = src.scene_id ?? src.sceneId
    const listenerIdRaw = src.listener_character_id ?? src.listenerCharacterId
    return {
      ...base,
      speaker: typeof src.speaker === 'string' && src.speaker.trim()
        ? src.speaker.trim()
        : undefined,
      speaker_character_id: typeof speakerIdRaw === 'number' && Number.isFinite(speakerIdRaw)
        ? speakerIdRaw
        : (typeof speakerIdRaw === 'string' && /^\d+$/.test(speakerIdRaw) ? Number(speakerIdRaw) : undefined),
      expression: parseExpression(src.expression),
      layout: parseLayout(src.layout),
      slot: parseSlot(src.slot),
      scene_id: typeof sceneIdRaw === 'number' && Number.isFinite(sceneIdRaw)
        ? sceneIdRaw
        : (typeof sceneIdRaw === 'string' && /^\d+$/.test(sceneIdRaw) ? Number(sceneIdRaw) : undefined),
      listener_character_id: typeof listenerIdRaw === 'number' && Number.isFinite(listenerIdRaw)
        ? listenerIdRaw
        : (typeof listenerIdRaw === 'string' && /^\d+$/.test(listenerIdRaw) ? Number(listenerIdRaw) : undefined),
      listener_expression: parseExpression(src.listener_expression),
      listener_slot: parseSlot(src.listener_slot),
    }
  } catch {
    return base as DialoguePortraitStoryboardMeta
  }
}

/**
 * 写入分镜 referenceImages：narration_image_mode=new（供 isNarrationStoryboard / TTS）
 * + dialogue_portrait 字段
 */
export function buildDialoguePortraitStoryboardMeta(
  extra: Partial<Omit<DialoguePortraitStoryboardMeta, 'narration_image_mode'>> & {
    speaker: string
    expression?: DialoguePortraitExpression
    layout: DialoguePortraitLayout
    slot: DialoguePortraitSlot
    /** 用于启发式表情推断的台词正文 */
    dialogueText?: string
  },
): string {
  const { dialogueText, ...rest } = extra
  const expression = rest.expression
    ?? inferExpressionFromDialogue(String(dialogueText || rest.subtitle_narration || ''))
  const dialoguePortrait = {
    speaker: String(rest.speaker || '旁白').trim() || '旁白',
    speaker_character_id: rest.speaker_character_id,
    expression,
    layout: rest.layout,
    slot: rest.slot,
    scene_id: rest.scene_id,
    listener_character_id: rest.listener_character_id,
    listener_expression: rest.listener_expression,
    listener_slot: rest.listener_slot,
  }
  return buildNarrationImageMeta('new', {
    narration_tts_mode: rest.narration_tts_mode ?? 'new',
    ...rest,
    expression,
    dialogue_portrait: dialoguePortrait,
  } as any)
}

/** @deprecated 使用 constants.resolveSlots */
export function resolveDialoguePortraitSlots(
  characterIds: number[],
  speakerCharacterId: number | null,
): {
  layout: DialoguePortraitLayout
  speakerSlot: DialoguePortraitSlot
  listenerId: number | null
  listenerSlot: DialoguePortraitSlot | null
} {
  const resolved = resolveSlots(speakerCharacterId, characterIds)
  const listener = resolved.assignments.find(a => a.slot === resolved.listenerSlot)
  return {
    layout: resolved.layout,
    speakerSlot: resolved.speakerSlot,
    listenerId: listener?.characterId ?? null,
    listenerSlot: resolved.listenerSlot ?? null,
  }
}

export function resolveExpressionImageUrl(
  character: { imageUrl?: string | null; referenceImages?: string | null },
  expression: DialoguePortraitExpression,
): string | null {
  const pack = parseCharacterDialoguePortraitPack(character.referenceImages)
  const fromPack = String(pack[expression] || '').trim()
  if (fromPack) return fromPack
  if (expression !== 'idle') {
    const idle = String(pack.idle || '').trim()
    if (idle) return idle
  }
  const base = String(character.imageUrl || '').trim()
  return base || null
}

export {
  inferDialoguePortraitExpression,
  inferExpressionFromDialogue,
  resolveLayout,
  resolveSlots,
}
