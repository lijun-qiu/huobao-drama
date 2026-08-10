/**
 * 解说「场景空镜 / 道具静物」生图提示词
 * 禁止走分镜六维编译与定妆半身像路径（否则易出人物/头像）
 */
import { artStylePrompt } from '../constants/art-styles.js'

export const NARRATION_EMPTY_SCENE_NEGATIVE = [
  'people', 'person', 'human', 'humans', 'man', 'woman', 'boy', 'girl', 'child',
  'face', 'faces', 'portrait', 'selfie', 'headshot', 'avatar', 'id photo',
  'hands', 'fingers', 'silhouette', 'crowd', 'character', 'anime character',
  'body', 'torso', 'figure', 'student sitting', 'teacher',
].join(', ')

export const NARRATION_PROP_STILL_NEGATIVE = [
  NARRATION_EMPTY_SCENE_NEGATIVE,
  'photo collage', 'magazine cover', 'character sheet', 'turnaround',
  'hand holding', 'holding object', 'fingers gripping',
].join(', ')

/** 试卷/证件类：模型常爱在纸上画证件照头像 */
function propStillLifeExtraGuards(name: string, desc: string): string[] {
  const blob = `${name} ${desc}`
  const out: string[] = []
  if (/试卷|卷子|考卷|答题卡|试卷纸|纸张|信纸|文件|表格|作文/.test(blob)) {
    out.push(
      'printed Chinese exam paper or worksheet only',
      'printed text lines and checkboxes only',
      'NO photo portrait on the paper',
      'NO ID photo',
      'NO face thumbnail',
      'NO headshot stamp',
      'NO human face printed anywhere',
    )
  }
  if (/手机|屏幕/.test(blob)) {
    out.push('phone device product shot only', 'screen shows UI or blank glow', 'NO selfie face selfie close-up')
  }
  if (/烟|香烟|烟头/.test(blob)) {
    out.push('cigarette object only', 'NO person smoking', 'NO lips', 'NO fingers holding')
  }
  return out
}

export function buildNarrationEmptySceneImagePrompt(
  sceneDesc: string,
  style?: string | null,
): { prompt: string; negativePrompt: string } {
  const desc = String(sceneDesc || '').trim() || '室内空镜'
  const prompt = [
    artStylePrompt(style, 'scene'),
    '16:9 cinematic empty environment plate',
    'wide establishing shot of location only',
    desc,
    'empty of people',
    'no characters',
    'no humans',
    'no faces',
    'no hands',
    'no silhouettes',
    'no anime character',
    'architecture and props only',
    'high quality',
    'no text',
    'no watermark',
  ].filter(Boolean).join(', ')
  return { prompt, negativePrompt: NARRATION_EMPTY_SCENE_NEGATIVE }
}

export function buildNarrationPropStillLifeImagePrompt(
  name: string,
  description: string,
  style?: string | null,
): { prompt: string; negativePrompt: string } {
  const label = String(name || 'object').trim() || 'object'
  const desc = String(description || label).trim()
  const guards = propStillLifeExtraGuards(label, desc)
  const prompt = [
    artStylePrompt(style, 'scene'),
    'product still life photography',
    'single object centered on pure white background',
    `object: ${label}`,
    desc,
    'isolated prop reference plate',
    'no people',
    'no human',
    'no face',
    'no hands',
    'no fingers',
    'no character',
    'no portrait',
    'no avatar',
    ...guards,
    'studio soft light',
    'sharp material detail',
    'no text watermark',
  ].filter(Boolean).join(', ')
  return { prompt, negativePrompt: NARRATION_PROP_STILL_NEGATIVE }
}

export function isNarrationEmptySceneGeneration(record: {
  sceneId?: number | null
  storyboardId?: number | null
  characterId?: number | null
  propId?: number | null
  frameType?: string | null
  prompt?: string | null
}): boolean {
  if (record.propId || record.characterId || record.storyboardId) return false
  if (record.sceneId) return true
  const ft = String(record.frameType || '')
  if (/scene-empty|empty-scene|scene_plate/i.test(ft)) return true
  return /empty environment plate|无人空镜|empty of people/i.test(String(record.prompt || ''))
}

export function isNarrationPropStillLifeGeneration(record: {
  propId?: number | null
  characterId?: number | null
  storyboardId?: number | null
  frameType?: string | null
  prompt?: string | null
}): boolean {
  if (record.propId) return true
  if (record.characterId || record.storyboardId) return false
  const ft = String(record.frameType || '')
  if (/prop-still|still-life|prop_plate/i.test(ft)) return true
  return /product still life|白底静物|isolated prop reference/i.test(String(record.prompt || ''))
}
