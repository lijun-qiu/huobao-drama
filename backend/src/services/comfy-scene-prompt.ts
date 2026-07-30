import { callTextChat } from './text-chat.js'
import { logTaskWarn } from '../utils/task-logger.js'
import { normalizeArtStyle } from '../constants/art-styles.js'

/** 规则兜底：常见中文场景词 → 英文环境标签 */
export function ruleBasedEnglishScenePrompt(input: {
  location?: string | null
  time?: string | null
  description?: string | null
}): string {
  const text = `${input.location || ''} ${input.time || ''} ${input.description || ''}`
  const tags: string[] = []
  if (/咖啡/.test(text)) tags.push('coffee shop interior', 'wooden counter', 'coffee cups on counter')
  if (/卤肉|小吃|夜市|摊位|店铺|店/.test(text)) tags.push('small street food shop', 'shop storefront', 'warm shop sign lights')
  if (/巷/.test(text)) tags.push('narrow alley')
  if (/黄昏|夕阳|傍晚/.test(text)) tags.push('warm golden sunset light', 'orange evening glow')
  if (/夜晚|夜里|夜间|夜/.test(text)) tags.push('night scene', 'warm artificial lighting')
  if (/落地窗|窗/.test(text)) tags.push('large windows', 'light through windows')
  if (/热气|蒸汽|升腾/.test(text)) tags.push('steam rising')
  if (/霓虹|城市|街/.test(text)) tags.push('urban street', 'city lights')
  if (/灯光|昏黄/.test(text)) tags.push('dim warm yellow lighting')
  tags.push('anime background art', 'detailed environment', 'empty scene', 'no people', 'no characters')
  return [...new Set(tags)].join(', ')
}

/** 中文场景描述 → ComfyUI 英文环境标签（无人物） */
export async function generateEnglishScenePrompt(
  input: {
    location?: string | null
    time?: string | null
    description?: string | null
  },
  textModel?: string | null,
): Promise<string> {
  const desc = String(input.description || input.location || '').trim()
  if (!desc && !input.location) return ruleBasedEnglishScenePrompt(input)

  if (!/[\u4e00-\u9fff]/.test(`${input.location || ''} ${input.time || ''} ${desc}`)) {
    return [input.location, input.time, desc].filter(Boolean).join(', ').slice(0, 400)
  }

  const system = [
    '你是动漫场景背景 prompt 助手，为 ComfyUI 生成英文环境标签。',
    '只写可见环境：地点类型、时间、光线、天气、氛围、关键陈设（桌椅、招牌、窗户等）。',
    '禁止：人物、角色、人脸、群像；禁止画风词 anime style / 3D / realistic photo。',
    '输出一行英文，逗号分隔，8-14 项，不要标题、不要 English tags 前缀。',
    '示例：coffee shop interior, floor-to-ceiling windows, warm golden sunset light, steam from coffee cups on counter, wooden tables, cozy atmosphere, empty scene, no people',
  ].join('\n')
  const user = [
    input.location ? `地点：${input.location}` : '',
    input.time ? `时间：${input.time}` : '',
    desc ? `描述：${desc}` : '',
  ].filter(Boolean).join('\n')

  try {
    const raw = (await callTextChat(system, user, textModel, false)).trim()
    const line = raw.replace(/^English tags:\s*/i, '').split('\n')[0].trim()
    if (line) return line.slice(0, 400)
  } catch (err) {
    logTaskWarn('ScenePrompt', 'llm-fallback', { error: (err as Error).message })
  }
  return ruleBasedEnglishScenePrompt(input)
}

/** 分镜/镜头配图：允许角色与动作（与纯场景背景不同） */
export async function generateEnglishStoryboardPrompt(
  input: { description?: string | null; characterNames?: string[] },
  textModel?: string | null,
  visualStyle?: string | null,
): Promise<string> {
  const desc = String(input.description || '').trim()
  if (!desc) return 'storyboard frame, 1 character, medium shot, cinematic composition, 16:9 widescreen'

  if (!/[\u4e00-\u9fff]/.test(desc)) {
    return desc.slice(0, 500)
  }

  const styleKey = normalizeArtStyle(visualStyle)
  const styleHint = styleKey === 'cinematic'
    ? '画面要有电影感光影与景别，但仍是插画分镜（非空镜背景）。'
    : styleKey === 'realistic'
      ? '偏写实摄影质感，须有人物主体。'
      : '高质量 2D 动漫分镜插画。'

  const system = [
    '你是分镜配图 prompt 助手，为 ComfyUI 生成英文画面标签。',
    styleHint,
    '必须写：角色数量与动作、表情、服装、场景地点、时间光线、机位景别、氛围情绪。',
    '可以有 1-3 个角色；写清 who does what。',
    '严禁：empty scene, no people, no characters, establishing shot only, background art only。',
    '禁止：画风词 anime style / 3D / photorealistic；禁止 watermark / text / logo。',
    '输出一行英文，逗号分隔，10-18 项，不要标题、不要 English tags 前缀。',
    '示例：1boy running on campus path, breathless expression, hoodie, afternoon sunlight, medium shot, eye level, tense mood, trees and pavement background',
  ].join('\n')

  const userParts = [
    input.characterNames?.length ? `出场角色：${input.characterNames.join('、')}` : '',
    `分镜描述：\n${desc}`,
  ].filter(Boolean)

  try {
    const raw = (await callTextChat(system, userParts.join('\n'), textModel, false)).trim()
    const line = raw.replace(/^English tags:\s*/i, '').split('\n')[0].trim()
    if (line) return line.slice(0, 500)
  } catch (err) {
    logTaskWarn('StoryboardPrompt', 'llm-fallback', { error: (err as Error).message })
  }

  return desc.replace(/[；;]/g, ', ').slice(0, 400)
}
