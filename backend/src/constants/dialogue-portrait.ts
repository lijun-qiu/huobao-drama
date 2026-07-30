/**
 * 对话立绘模式 — 固定场景背景 + 1～2 人立绘叠层，按台词切表情包合成（无运镜）
 */
import type { ProductionMode } from './production-mode.js'
import { isDialoguePortraitMode, PRODUCTION_MODE_DIALOGUE_PORTRAIT } from './production-mode.js'

export const DIALOGUE_PORTRAIT_PRODUCTION_MODE = PRODUCTION_MODE_DIALOGUE_PORTRAIT

/** 本集绑定角色上限（1=居中，2=左右） */
export const DIALOGUE_PORTRAIT_MAX_CHARS = 2

/** 角色级表情包三态 */
export type DialoguePortraitExpression = 'idle' | 'talk' | 'react'

export const DIALOGUE_PORTRAIT_EXPRESSIONS: readonly DialoguePortraitExpression[] = [
  'idle',
  'talk',
  'react',
] as const

export type DialoguePortraitLayout = 'solo' | 'duo'
export type DialoguePortraitSlot = 'left' | 'right' | 'center'

export const DIALOGUE_PORTRAIT_CANVAS = { width: 1280, height: 720 } as const

/** 立绘缩放后高度（白底半身竖图） */
export const DIALOGUE_PORTRAIT_SPRITE_HEIGHT = 500
export const DIALOGUE_PORTRAIT_SPRITE_WIDTH = 320

/**
 * 叠层坐标（overlay 左上角，基于 1280×720）
 * duo：左/右；solo：居中
 */
export const DIALOGUE_PORTRAIT_SLOTS: Record<DialoguePortraitSlot, { x: number; y: number }> = {
  left: { x: 80, y: 200 },
  right: { x: 880, y: 200 },
  center: { x: 480, y: 180 },
}

/**
 * 白底抠图参数（FFmpeg chromakey / colorkey）
 * similarity ~0.08–0.12；blend 保持较小以免边缘发虚
 */
export const DIALOGUE_PORTRAIT_COLORKEY = {
  color: '0xFFFFFF',
  similarity: 0.10,
  blend: 0.02,
} as const

/** @deprecated 同 DIALOGUE_PORTRAIT_COLORKEY */
export const DIALOGUE_PORTRAIT_CHROMAKEY = DIALOGUE_PORTRAIT_COLORKEY

/** 场景无人约束（中文附加 + 英文负向） */
export const SCENE_EMPTY_PEOPLE_SUFFIX =
  'empty of people, no characters, no humans, no silhouette, no face, environment only'

export const DIALOGUE_PORTRAIT_SCENE_EMPTY_SUFFIX_CN =
  '空场景，绝对无人，无人物，无路人，无剪影，无人脸，纯环境背景'

export const DIALOGUE_PORTRAIT_SCENE_EMPTY_SUFFIX_EN = SCENE_EMPTY_PEOPLE_SUFFIX

export const DIALOGUE_PORTRAIT_SCENE_NEGATIVE =
  'person, people, human, character, face, portrait, crowd, silhouette, figure, man, woman, child, close-up face, bust portrait, anime character, 1girl, 1boy'

/**
 * 对话立绘场景底图专属画风（禁止沿用分镜七维/双眸定妆文案，否则易出人物半身像）
 */
export const DIALOGUE_PORTRAIT_SCENE_ART_STYLE =
  '16:9 landscape, modern high-quality anime environment illustration, clean line art, soft cel shading, detailed interior or exterior background, cinematic wide shot of empty location, shallow depth of field on distant props only, no characters, no people, no face, no portrait'

/**
 * 表情包编辑提示（基于定妆基图）
 * 硬性：三态同一站姿/构图/手位，只改嘴与微表情——合成时身体锁死，仅口型在 idle↔talk 间切。
 */
export const DIALOGUE_PORTRAIT_EXPRESSION_PROMPTS: Record<DialoguePortraitExpression, string> = {
  idle: 'keep exact same character outfit pose framing and hand position as reference, pure white background half-body portrait, neutral calm face, mouth fully closed lips together, eyes looking forward, no hand raise, no lean, no gesture change',
  talk: 'keep exact same character outfit pose framing shoulders and hand position as idle reference (do NOT move arms or body), pure white background half-body portrait, ONLY change the mouth: mouth slightly open mid-speech showing hint of teeth, same eye line, no hand raise, no lean, no speed lines',
  react: 'keep exact same character outfit pose framing shoulders and hand position as idle reference (do NOT move arms or body), pure white background half-body portrait, ONLY change face: mild surprise brow raise and mouth slightly open, no lean, no hand gesture, no speed lines',
}

export interface DialoguePortraitDramaMeta {
  layout?: 'auto' | DialoguePortraitLayout
  expressions?: DialoguePortraitExpression[]
  camera?: 'none'
}

export const DEFAULT_DIALOGUE_PORTRAIT_DRAMA_META: Required<DialoguePortraitDramaMeta> = {
  layout: 'auto',
  expressions: [...DIALOGUE_PORTRAIT_EXPRESSIONS],
  camera: 'none',
}

/** 对话立绘「剧本生成」默认字数下限（纯对白，远短于人生体验解说稿） */
export const DIALOGUE_PORTRAIT_SCRIPT_MIN_CHARS = 800
export const DIALOGUE_PORTRAIT_SCRIPT_MAX_CHARS = 6_000

/**
 * 对话立绘剧本生成 system prompt
 * 硬性：纯「角色名：台词」对话稿；禁止旁白 / 「体验人生」第二人称解说体
 */
export const DIALOGUE_PORTRAIT_SCRIPT_CHAT_SYSTEM = [
  '你是「对话立绘」流水线编剧：写视觉小说式台本——固定场景背景不动，角色立绘叠层说话（身体锁死，仅口型张合）。',
  '成片效果是：无人场景底图 + 1～2 人白底半身立绘抠图叠层；按句切 idle/talk/react，说话时按配音音量切口型，背景与身体不做运镜/晃动。',
  '这不是「体验365个人生」解说稿，也不是漫画解说旁白稿。禁止第二人称「你」旁白、禁止「今天体验的人生剧本是，」片头、禁止大段叙述。',
  '',
  '【角色上限·硬性】',
  `- 本集视觉角色最多 ${DIALOGUE_PORTRAIT_MAX_CHARS} 人（1 人居中 / 2 人左右）。台词说话人只能用这 1～2 个角色名（可用「我」若用户指定第一人称主角）。`,
  '- 禁止引入第三人开口；需要旁人时改写成两人转述或省略。',
  '',
  '【输出格式·硬性】',
  '- 每行必须是「角色名：台词」（全角或半角冒号均可）。',
  '- 禁止无说话人前缀的裸句；禁止「旁白：」「剧中：」行；禁止小说段落 prose。',
  '- 一句一行，单行台词建议 8～28 字，便于一句一镜配音与切表情。',
  '- 可在台词里加短动作括号，如「（点头）知道了」「你别过来（后退）」——系统会切 react；不要另起动作旁白行。',
  '- 换场景：段间空一行；新段首行可用「【客厅】」或「场景：咖啡馆」标地点（该行不写对白）。',
  '- 不要写镜头术语（特写、推镜等）；不要 markdown、**、分镜表、JSON；不要「大家好」「点赞关注」。',
  '',
  '【内容】',
  '- 冲突、信息、情绪全靠对白推进；短动作括号只写可见肢体（点头/挥手/握拳/转身），禁止心理旁白。',
  '- 情绪起伏靠问答、反驳、停顿式短句；适合 idle/talk/react 三态表情切换。',
  '- 用户给小说/解说体时：改写成仅含上述 1～2 人说话人的对白行后再输出。',
  '',
  '【篇幅】',
  `- **用户指定字数时以用户为准**：如「写1000字」，按该目标（约 ±15%），禁止擅自写成人生体验长稿。`,
  `- 用户未指定时，完整稿约 ${DIALOGUE_PORTRAIT_SCRIPT_MIN_CHARS}～${DIALOGUE_PORTRAIT_SCRIPT_MAX_CHARS} 汉字；不够就加对白回合，禁止用旁白注水。`,
  '',
  '【交互】',
  '- 用户要求写完整稿/出剧本：只输出对话台本正文（每行角色名：台词）。',
  '- 多轮改稿：可先一句极短确认（≤20字），空一行后必须输出修改后的完整稿，不要只解释或给 diff。',
  '- 若【当前台本】已有内容，在其基础上改，勿另起新故事。',
  '- 仅闲聊、选题讨论时正常对话，不必输出整稿。',
].join('\n')

export function parseDialoguePortraitDramaMeta(
  metadata?: string | Record<string, unknown> | null,
): DialoguePortraitDramaMeta {
  let meta = metadata
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) as Record<string, unknown> } catch { meta = null }
  }
  const raw = (meta as Record<string, unknown> | null)?.dialogue_portrait as DialoguePortraitDramaMeta | undefined
  return {
    layout: raw?.layout || DEFAULT_DIALOGUE_PORTRAIT_DRAMA_META.layout,
    expressions: raw?.expressions?.length
      ? raw.expressions
      : [...DEFAULT_DIALOGUE_PORTRAIT_DRAMA_META.expressions],
    camera: 'none',
  }
}

export function buildDialoguePortraitDramaMetadata(mode: ProductionMode): string {
  if (!isDialoguePortraitMode(mode)) {
    return JSON.stringify({ production_mode: mode })
  }
  return JSON.stringify({
    production_mode: DIALOGUE_PORTRAIT_PRODUCTION_MODE,
    dialogue_portrait: DEFAULT_DIALOGUE_PORTRAIT_DRAMA_META,
  })
}

/** characters.referenceImages JSON 中的表情包块 */
export type DialoguePortraitExpressionPack = Partial<Record<DialoguePortraitExpression, string>>

export function parseCharacterDialoguePortraitPack(
  referenceImages?: string | null,
): DialoguePortraitExpressionPack {
  if (!referenceImages) return {}
  try {
    const parsed = JSON.parse(referenceImages) as Record<string, unknown>
    const block = parsed?.dialogue_portrait
    if (!block || typeof block !== 'object') return {}
    const out: DialoguePortraitExpressionPack = {}
    for (const key of DIALOGUE_PORTRAIT_EXPRESSIONS) {
      const url = String((block as Record<string, unknown>)[key] || '').trim()
      if (url) out[key] = url
    }
    return out
  } catch {
    return {}
  }
}

export function isDialoguePortraitExpressionPackComplete(
  pack: DialoguePortraitExpressionPack | null | undefined,
): boolean {
  if (!pack) return false
  return DIALOGUE_PORTRAIT_EXPRESSIONS.every(k => !!String(pack[k] || '').trim())
}

/** 合并写入 characters.referenceImages.dialogue_portrait，保留其它键 */
export function mergeCharacterDialoguePortraitPack(
  referenceImages: string | null | undefined,
  pack: DialoguePortraitExpressionPack,
): string {
  let raw: Record<string, unknown> = {}
  if (referenceImages) {
    try {
      const parsed = JSON.parse(referenceImages)
      if (parsed && typeof parsed === 'object') raw = { ...(parsed as Record<string, unknown>) }
    } catch { /* ignore */ }
  }
  const prev = (raw.dialogue_portrait && typeof raw.dialogue_portrait === 'object')
    ? { ...(raw.dialogue_portrait as Record<string, unknown>) }
    : {}
  for (const key of DIALOGUE_PORTRAIT_EXPRESSIONS) {
    const url = String(pack[key] || '').trim()
    if (url) prev[key] = url
  }
  raw.dialogue_portrait = prev
  return JSON.stringify(raw)
}

/** 分镜 referenceImages 上的对话立绘字段（与 narration_image_mode 并存） */
export interface DialoguePortraitStoryboardMeta {
  speaker?: string
  speaker_character_id?: number
  expression?: DialoguePortraitExpression
  layout?: DialoguePortraitLayout
  slot?: DialoguePortraitSlot
  scene_id?: number
}

function normalizeExpression(raw: unknown): DialoguePortraitExpression | undefined {
  const v = String(raw || '').trim()
  if (v === 'idle' || v === 'talk' || v === 'react') return v
  return undefined
}

function normalizeLayout(raw: unknown): DialoguePortraitLayout | undefined {
  const v = String(raw || '').trim()
  if (v === 'solo' || v === 'duo') return v
  return undefined
}

function normalizeSlot(raw: unknown): DialoguePortraitSlot | undefined {
  const v = String(raw || '').trim()
  if (v === 'left' || v === 'right' || v === 'center') return v
  return undefined
}

export function parseDialoguePortraitStoryboardMeta(
  referenceImages?: string | null,
): DialoguePortraitStoryboardMeta {
  if (!referenceImages) return {}
  try {
    const parsed = JSON.parse(referenceImages) as Record<string, unknown>
    const nested = (parsed.dialogue_portrait && typeof parsed.dialogue_portrait === 'object')
      ? (parsed.dialogue_portrait as Record<string, unknown>)
      : null
    const src = nested || parsed
    const speakerIdRaw = src.speaker_character_id ?? src.speakerCharacterId
    const sceneIdRaw = src.scene_id ?? src.sceneId
    return {
      speaker: typeof src.speaker === 'string' && src.speaker.trim() ? src.speaker.trim() : undefined,
      speaker_character_id: typeof speakerIdRaw === 'number' && Number.isFinite(speakerIdRaw)
        ? speakerIdRaw
        : (typeof speakerIdRaw === 'string' && /^\d+$/.test(speakerIdRaw) ? Number(speakerIdRaw) : undefined),
      expression: normalizeExpression(src.expression),
      layout: normalizeLayout(src.layout),
      slot: normalizeSlot(src.slot),
      scene_id: typeof sceneIdRaw === 'number' && Number.isFinite(sceneIdRaw)
        ? sceneIdRaw
        : (typeof sceneIdRaw === 'string' && /^\d+$/.test(sceneIdRaw) ? Number(sceneIdRaw) : undefined),
    }
  } catch {
    return {}
  }
}

/** 写入分镜 referenceImages：narration_image_mode=new（供 TTS）+ dialogue_portrait 字段 */
export function buildDialoguePortraitStoryboardReferenceImages(
  meta: DialoguePortraitStoryboardMeta,
  extra?: Record<string, unknown>,
): string {
  const expression = normalizeExpression(meta.expression) || 'talk'
  const layout = normalizeLayout(meta.layout) || 'solo'
  const slot = normalizeSlot(meta.slot) || (layout === 'duo' ? 'left' : 'center')
  const dialoguePortrait: Record<string, unknown> = {
    speaker: String(meta.speaker || '旁白').trim() || '旁白',
    expression,
    layout,
    slot,
  }
  if (meta.speaker_character_id != null && Number.isFinite(meta.speaker_character_id)) {
    dialoguePortrait.speaker_character_id = meta.speaker_character_id
  }
  if (meta.scene_id != null && Number.isFinite(meta.scene_id)) {
    dialoguePortrait.scene_id = meta.scene_id
  }
  return JSON.stringify({
    narration_image_mode: 'new',
    narration_tts_mode: 'new',
    ...extra,
    // 扁平字段便于调试；正式块放 dialogue_portrait
    speaker: dialoguePortrait.speaker,
    speaker_character_id: dialoguePortrait.speaker_character_id,
    expression,
    layout,
    slot,
    scene_id: dialoguePortrait.scene_id,
    dialogue_portrait: dialoguePortrait,
  })
}

/** 启发式：说话人默认 talk；含？！/惊讶词/短动作括号 → react */
const REACT_WORD_RE = /吃惊|惊讶|震惊|吓|不敢|怎么会|什么|居然|竟然|啊+|哇+|天哪|糟糕|不会吧/
const ACTION_PAREN_RE = /[（(]\s*(?:点头|摇头|挥手|握拳|摊手|耸肩|后退|上前|转身|低头|抬头|捂脸|拍桌|起身|坐下|扶额|叹气|冷笑|咬牙)[^）)]{0,6}\s*[）)]/

export function inferExpressionFromDialogue(text: string): DialoguePortraitExpression {
  const t = String(text || '').trim()
  if (!t) return 'talk'
  if (ACTION_PAREN_RE.test(t) || /[？！?!]{1,}/.test(t) || REACT_WORD_RE.test(t)) return 'react'
  return 'talk'
}

/** @deprecated 使用 inferExpressionFromDialogue */
export function inferDialoguePortraitExpression(dialogue: string): DialoguePortraitExpression {
  return inferExpressionFromDialogue(dialogue)
}

export function resolveLayout(charCount: number): DialoguePortraitLayout {
  return charCount >= 2 ? 'duo' : 'solo'
}

export type DialoguePortraitSlotAssignment = {
  characterId: number
  slot: DialoguePortraitSlot
}

/**
 * 分配说话人/听者槽位。
 * castIds 顺序：第 1 人左（或居中），第 2 人右。
 */
export function resolveSlots(
  speakerId: number | null | undefined,
  castIds: number[],
): {
  layout: DialoguePortraitLayout
  speakerSlot: DialoguePortraitSlot
  listenerSlot?: DialoguePortraitSlot
  assignments: DialoguePortraitSlotAssignment[]
} {
  const ids = [...new Set(castIds.filter(id => Number.isFinite(id) && id > 0))].slice(0, DIALOGUE_PORTRAIT_MAX_CHARS)
  const layout = resolveLayout(ids.length)
  if (layout === 'solo') {
    const id = ids[0]
    return {
      layout,
      speakerSlot: 'center',
      assignments: id != null ? [{ characterId: id, slot: 'center' }] : [],
    }
  }
  const assignments: DialoguePortraitSlotAssignment[] = [
    { characterId: ids[0], slot: 'left' },
    { characterId: ids[1], slot: 'right' },
  ]
  const speakerIdx = speakerId != null ? ids.indexOf(speakerId) : 0
  const speakerSlot: DialoguePortraitSlot = speakerIdx === 1 ? 'right' : 'left'
  const listenerSlot: DialoguePortraitSlot = speakerSlot === 'left' ? 'right' : 'left'
  return { layout, speakerSlot, listenerSlot, assignments }
}

/** 场景生图：追加无人约束 */
export function appendDialoguePortraitEmptyScenePrompt(prompt: string): string {
  const base = String(prompt || '').trim()
  const parts = [
    base,
    DIALOGUE_PORTRAIT_SCENE_EMPTY_SUFFIX_CN,
    SCENE_EMPTY_PEOPLE_SUFFIX,
  ].filter(Boolean)
  return parts.join(', ')
}

/** 过短地点补全为可画环境描述 */
export function expandDialoguePortraitSceneDescription(sceneDesc: string): string {
  const raw = String(sceneDesc || '').trim() || '室内'
  if (raw.length >= 12 && /[，,、]/.test(raw)) return raw
  const key = raw.replace(/\s+/g, '')
  const presets: Record<string, string> = {
    室内: '现代室内空间，前景桌椅与生活杂物，中景家具与门窗，后景墙面与灯光，宽景无人环境',
    室外: '户外街景，前景路面与路缘，中景建筑与树木，后景天空，宽景无人环境',
    客厅: '现代客厅，前景沙发扶手与茶几，中景电视柜与落地窗，后景窗帘透光，宽景无人',
    卧室: '现代卧室，前景床沿与床头柜，中景衣柜与书桌，后景窗户与窗帘，宽景无人',
    教室: '教室内景，前景课桌椅，中景黑板与讲台，后景窗户，宽景无人',
    办公室: '办公室内景，前景办公桌与显示器，中景隔断与文件柜，后景落地窗，宽景无人',
    咖啡馆: '咖啡馆内景，前景吧台与咖啡杯具，中景桌椅与绿植，后景橱窗街景，宽景无人',
    街道: '城市街道，前景人行道与路灯，中景店铺与招牌，后景建筑天际线，宽景无人（无行人）',
    餐厅: '餐厅内景，前景餐桌餐具，中景卡座与吊灯，后景厨房隔断，宽景无人',
  }
  for (const [k, v] of Object.entries(presets)) {
    if (key === k || key.includes(k)) return v
  }
  if (/^场景\d+$/.test(key)) {
    return `${raw}，具体室内外环境，前景中景后景分层陈设，宽景无人`
  }
  return `${raw}，前景中景后景分层，具体物件与材质可见，宽景环境，无人`
}

export function buildDialoguePortraitScenePrompt(sceneDesc: string, stylePrompt?: string): string {
  const desc = expandDialoguePortraitSceneDescription(sceneDesc)
  const style = String(stylePrompt || DIALOGUE_PORTRAIT_SCENE_ART_STYLE).trim()
  return appendDialoguePortraitEmptyScenePrompt(
    [style, desc, 'wide establishing shot, environment only, 16:9 landscape, high quality, no text, no watermark']
      .filter(Boolean)
      .join(', '),
  )
}
