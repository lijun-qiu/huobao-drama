/**
 * 对话立绘合成：固定背景 + 白底抠图立绘；说话人按 TTS 音量切 idle/talk 口型
 */
import fs from 'fs'
import path from 'path'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import {
  DIALOGUE_PORTRAIT_CANVAS,
  DIALOGUE_PORTRAIT_COLORKEY,
  DIALOGUE_PORTRAIT_SLOTS,
  DIALOGUE_PORTRAIT_SPRITE_HEIGHT,
  type DialoguePortraitExpression,
  type DialoguePortraitSlot,
} from '../constants/dialogue-portrait.js'
import {
  parseDialoguePortraitStoryboardMeta,
  resolveExpressionImageUrl,
} from './dialogue-portrait-meta.js'
import { getEpisodeVisualCharacters } from './narration-characters.js'
import { analyzeMouthOpenEnableExpr } from './dialogue-portrait-lipsync.js'

export type DialoguePortraitOverlayLayer = {
  characterId: number
  absPath: string
  openAbsPath?: string | null
  slot: DialoguePortraitSlot
  expression: DialoguePortraitExpression
  isSpeaker: boolean
}

function toAbsPath(relativePath: string, storageRoot: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/') || relativePath.startsWith('static\\')) {
    return path.join(path.dirname(storageRoot), relativePath)
  }
  return path.join(storageRoot, relativePath.replace(/^static[\\/]/, ''))
}

export function buildDialoguePortraitOverlayXy(
  slot: DialoguePortraitSlot,
  _expression?: DialoguePortraitExpression,
): { x: string; y: string } {
  const pos = DIALOGUE_PORTRAIT_SLOTS[slot] || DIALOGUE_PORTRAIT_SLOTS.center
  return { x: String(pos.x), y: String(pos.y) }
}

export function buildDialoguePortraitSpriteFilter(inputIndex: number, label: string): string {
  const { color, similarity, blend } = DIALOGUE_PORTRAIT_COLORKEY
  const h = DIALOGUE_PORTRAIT_SPRITE_HEIGHT
  return `[${inputIndex}:v]scale=-1:${h}:force_original_aspect_ratio=decrease,` +
    `colorkey=${color}:${similarity}:${blend},format=yuva420p[${label}]`
}

export function buildDialoguePortraitBgFilter(inputIndex: number, label: string, fps: number): string {
  const { width, height } = DIALOGUE_PORTRAIT_CANVAS
  return `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},fps=${fps},format=yuv420p[${label}]`
}

export function resolveDialoguePortraitBgPath(
  sb: typeof schema.storyboards.$inferSelect,
  dramaId: number,
  storageRoot: string,
): string | null {
  const meta = parseDialoguePortraitStoryboardMeta(sb.referenceImages)
  const sceneId = meta.scene_id || sb.sceneId
  if (sceneId) {
    const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).all()
    const url = String(scene?.imageUrl || '').trim()
    if (url) {
      const abs = toAbsPath(url, storageRoot)
      if (fs.existsSync(abs)) return abs
    }
  }
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId)).all()
    .filter(s => !s.deletedAt && s.imageUrl)
  for (const scene of scenes) {
    const abs = toAbsPath(String(scene.imageUrl), storageRoot)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

export function resolveDialoguePortraitOverlayLayers(
  sb: typeof schema.storyboards.$inferSelect,
  dramaId: number,
  storageRoot: string,
): DialoguePortraitOverlayLayer[] {
  const meta = parseDialoguePortraitStoryboardMeta(sb.referenceImages)
  const links = db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, sb.id)).all()
  let castIds = links.map(l => l.characterId)
  if (!castIds.length) {
    castIds = getEpisodeVisualCharacters(sb.episodeId, dramaId).slice(0, 2).map(c => c.id)
  } else {
    castIds = castIds.slice(0, 2)
  }

  const layers: DialoguePortraitOverlayLayer[] = []
  for (let i = 0; i < castIds.length; i++) {
    const characterId = castIds[i]
    const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
    if (!char) continue

    const isSpeaker = !!(meta.speaker_character_id === characterId
      || (!meta.speaker_character_id && meta.speaker && char.name.trim() === meta.speaker.trim()))
    let expression: DialoguePortraitExpression = 'idle'
    if (isSpeaker) expression = meta.expression || 'talk'
    else if (meta.listener_character_id === characterId && meta.listener_expression) {
      expression = meta.listener_expression
    }

    let slot: DialoguePortraitSlot = castIds.length <= 1 ? 'center' : (i === 0 ? 'left' : 'right')
    if (isSpeaker && meta.slot) slot = meta.slot
    else if (!isSpeaker && meta.listener_slot) slot = meta.listener_slot

    const closedExpr: DialoguePortraitExpression = isSpeaker ? 'idle' : expression
    const openExpr: DialoguePortraitExpression = expression === 'react' ? 'react' : 'talk'
    const closedUrl = resolveExpressionImageUrl(char, closedExpr)
      || resolveExpressionImageUrl(char, expression)
    if (!closedUrl) continue
    const absPath = toAbsPath(closedUrl, storageRoot)
    if (!fs.existsSync(absPath)) continue

    let openAbsPath: string | null = null
    if (isSpeaker) {
      const openUrl = resolveExpressionImageUrl(char, openExpr)
        || resolveExpressionImageUrl(char, 'talk')
      if (openUrl) {
        const openPath = toAbsPath(openUrl, storageRoot)
        if (fs.existsSync(openPath) && path.resolve(openPath) !== path.resolve(absPath)) {
          openAbsPath = openPath
        }
      }
    }

    layers.push({ characterId, absPath, openAbsPath, slot, expression, isSpeaker })
  }
  return layers
}

export function resolveMouthEnableExpr(audioPath: string | null, durationSec: number): string | null {
  if (!audioPath || !fs.existsSync(audioPath)) return null
  return analyzeMouthOpenEnableExpr(audioPath, durationSec)
}

export { DIALOGUE_PORTRAIT_CANVAS }
