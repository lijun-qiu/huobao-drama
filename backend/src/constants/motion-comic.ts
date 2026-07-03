/**
 * 漫画解说 — 画风规格、分镜规则、运镜预设
 * 制作方法：旁白解说 + 漫画配图快切（一句一图）+ 智能运镜 + 配音字幕（零 I2V）
 */
import type { ProductionMode } from './production-mode.js'
import { isMotionComicMode } from './production-mode.js'

export const MOTION_COMIC_STYLE = 'motion-comic'

export const MOTION_COMIC_DEFAULT_STYLE = MOTION_COMIC_STYLE

/** 镜型：决定配图策略与合成动效 */
export type MotionComicShotRole =
  | 'establishing'
  | 'dialogue'
  | 'reaction'
  | 'action'
  | 'atmosphere'
  | 'normal'

/** 动效档位 */
export type MotionComicMotionTier = 'static' | 'light' | 'action' | 'shock'

export const MOTION_COMIC_IMAGE_STYLE_OPTIONS = [
  { value: MOTION_COMIC_STYLE, label: '漫画解说' },
] as const

/** 漫画解说：每张配图覆盖 1～2 镜（一段一图，整段一种运镜） */
export const MOTION_COMIC_IMAGE_SEGMENT_MIN_SHOTS = 1
export const MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS = 2

/** 漫画解说：配图锚点占镜头数比例（50% 以上；换人说话须换图时可达 100%） */
export const MOTION_COMIC_IMAGE_DETECT_MIN_STORYBOARD_RATIO = 0.5
export const MOTION_COMIC_IMAGE_DETECT_MAX_STORYBOARD_RATIO = 1

/** 项目级动效预设（写入 dramas.metadata） */
export interface MotionComicPreset {
  motion_preset?: 'light' | 'standard' | 'heavy'
  camera?: {
    zoom_step?: number
    enable_pan?: boolean
    pan_alternate?: boolean
  }
  motion_budget?: {
    max_action_shots?: number
  }
}

export const DEFAULT_MOTION_COMIC_PRESET: Required<MotionComicPreset> = {
  motion_preset: 'light',
  camera: {
    zoom_step: 0.06,
    enable_pan: true,
    pan_alternate: true,
  },
  motion_budget: {
    max_action_shots: 0,
  },
}

export function parseMotionComicPreset(metadata?: string | Record<string, unknown> | null): MotionComicPreset {
  let meta = metadata
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) as Record<string, unknown> } catch { meta = null }
  }
  const raw = (meta as Record<string, unknown> | null)?.motion_comic as MotionComicPreset | undefined
  return {
    motion_preset: raw?.motion_preset || DEFAULT_MOTION_COMIC_PRESET.motion_preset,
    camera: { ...DEFAULT_MOTION_COMIC_PRESET.camera, ...raw?.camera },
    motion_budget: { ...DEFAULT_MOTION_COMIC_PRESET.motion_budget, ...raw?.motion_budget },
  }
}

export function buildMotionComicDramaMetadata(mode: ProductionMode): string {
  if (!isMotionComicMode(mode)) {
    return JSON.stringify({ production_mode: mode })
  }
  return JSON.stringify({
    production_mode: 'motion_comic',
    motion_comic: DEFAULT_MOTION_COMIC_PRESET,
  })
}

// ─── 画风规格 ─────────────────────────────────────────

export const MOTION_COMIC_STYLE_SPEC =
  '现代国漫条漫风格，粗黑线描，平涂赛璐璐，正常头身比，表情夸张，漫画速度线可用，16:9横屏'

export const MOTION_COMIC_STYLE_FORBIDDEN =
  '禁止3D渲染、真人照片、厚涂肌理、像素风、Q版三头身、水印文字'

export const MOTION_COMIC_SCENE_SUFFIX =
  '单张完整漫画插画，绝对无文字无水印，画面干净'

import {
  THREE_VIEW_PORTRAIT_SIZE,
  THREE_VIEW_PORTRAIT_SCENE_CN,
  THREE_VIEW_PORTRAIT_PLOT_MOTION_COMIC_CN,
  THREE_VIEW_PORTRAIT_FRAMING,
  NARRATION_PORTRAIT_REFERENCE_LLM_RULE,
} from './portrait-reference.js'

export {
  THREE_VIEW_PORTRAIT_SIZE as MOTION_COMIC_PORTRAIT_SIZE,
  THREE_VIEW_PORTRAIT_SCENE_CN as MOTION_COMIC_PORTRAIT_SCENE_CN,
  THREE_VIEW_PORTRAIT_PLOT_MOTION_COMIC_CN as MOTION_COMIC_PORTRAIT_PLOT_CN,
  THREE_VIEW_PORTRAIT_FRAMING as MOTION_COMIC_PORTRAIT_FRAMING,
  NARRATION_PORTRAIT_REFERENCE_LLM_RULE,
}

export const MOTION_COMIC_NEGATIVE_PROMPT =
  '3D建模、真人照片、厚涂肌理、像素风、Q版三头身、水印、文字、血腥、gore、blood、斩首、尸体'

export const MOTION_COMIC_SIX_DIM_LLM_RULE = [
  '【六维结构】每条 image_prompt 必须含：',
  '【画风规格】现代国漫条漫，粗黑线描，平涂赛璐璐，正常头身比，表情夸张，16:9横屏',
  '【画面主体】写清人物位置、服装主色、表情；有定妆时须对照 portrait_label',
  '【年代场景】地点与时代氛围；有载体时须写至少2个具体物件名（含材质或颜色）',
  '【核心细节动作】具体动作与互动；打斗镜须写动态姿势与漫画速度线；手持物写在此维',
  '【光影色调】漫画式简化光影',
  '【镜头视角】平视/低角度/特写等',
  '【质感要求】平涂赛璐璐，线条清晰，无文字无水印',
  NARRATION_PORTRAIT_REFERENCE_LLM_RULE,
].join('\n')

export const MOTION_COMIC_ACTION_LLM_RULE =
  '【打斗/动作镜】须写动态姿势、拳头/腿部运动方向、漫画放射状速度线、冲击构图；禁止写实血腥，用漫画夸张表现'

/** 动态漫：统一动漫审美（不写胖瘦体型词） */
export const MOTION_COMIC_BODY_CONSISTENCY_LLM_RULE = [
  '【人物审美·硬性】全片统一正常头身比国漫条漫人物（以【画风规格】为准），禁止写「微胖」「肥胖」「瘦削」「腰腹略鼓」等胖瘦体型词；',
  '禁止写「躯干X份高×Y份宽」「三头身」「圆头直径」等素体份数计量；',
  '【画面主体】只写发型、表情、服装、姿态与道具，不要额外描写肩腰肚胖瘦。',
].join(' ')

export const MOTION_COMIC_LLM_ANALYSIS_STEPS_PROMPT = [
  '1) 通读 full_narration（及 previous_episode_narration 若有），把握主线、人物关系、场景变迁与情绪节奏',
  '2) 读 prior_narration 与 characters；同一配图段内主人公服装款式+#hex 须一致',
  '3) 读 narration_lines 确定本配图段叙事锚点；先锁定单帧（位置+姿态+动作+表情），再按六维填空',
  '4) 结合 full_narration 丰富场景与动作，禁止只贴段内字面',
].join('\n')

export const MOTION_COMIC_DYNAMIC_IMAGE_LLM_RULE = [
  '【一段一图·动态瞬间】每条 prompt 对应一个配图段（narration_lines 可含 1～2 句），须写出该段最具视觉冲击力的单一瞬间，禁止把无关剧情揉进一张图。',
  '【运镜友好构图】画面留前中后景层次（前景道具/中景主体/背景环境），主体姿态与肢体方向明确，便于后续推近/拉远/横移/上下运镜；避免主体贴边、画面过满。',
  '【动态表现】优先写可见动作、表情变化、物体互动、速度线/冲击线/气流线；情绪镜写夸张表情与肢体语言；建立镜写环境纵深与空间关系。',
  '【镜头视角多样化】相邻配图段宜交替使用中景/近景/特写/略俯/略仰，避免连续多镜同一景别同一站桩姿势。',
].join('\n')

/** 主要配角：须定妆 + 场景 prompt 引用外貌；一次性路人仅 inline 描述 */
export const MOTION_COMIC_MAJOR_SUPPORTING_LLM_RULE = [
  '【主要配角】已在 characters 表提供 name + appearance 的，【画面主体】须写清其位置、服装主色、表情，与主人公视觉区分（发型/服装配色/体型）',
  '【一次性路人/群众/龙套】不定妆；在【画面主体】用「几位路人/店员/弟子」等泛称 + 简化服装色块即可，勿与主要配角混淆',
].join('\n')

export const MOTION_COMIC_CROWD_LLM_RULE =
  '【路人/群众】不写具体姓名；简化漫画造型、低饱和服装、背景或侧位，不得抢主人公/主要配角焦点'

export function isMajorSupportingCharacter(char: { name?: string | null; role?: string | null }): boolean {
  const role = String(char.role || '').trim()
  if (/主要配角|重要配角|核心配角|次要主角|男二|女二/.test(role)) return true
  if (/反派|宿敌|师父|师尊|师叔|师兄|师姐|挚友|恋人|闺蜜|未婚|长老|掌门|魔头|boss/i.test(role)) return true
  if (/^主要配角/.test(role)) return true
  return false
}

export function buildMotionComicCharacterExtractSystem(): string {
  return [
    '你是漫画解说项目的角色设定师。画面采用现代国漫条漫画风（正常头身比、粗黑线描、平涂赛璐璐、16:9横屏），须为「主人公」和「主要配角」分别做 16:9 横屏三视图定妆参考图（纯白色背景、清晰脸型、英俊帅气动漫五官）。',
    '规则：',
    '1) 提取主人公（男主/女主/主角）及主要配角：反复出场、有专名、有对白或推动剧情的角色（反派、师父、挚友、恋人、宿敌、师兄师姐等）',
    '2) 不要提取一次性路人/群众/店员/衙役/无名弟子等龙套；不要提取「旁白」「解说员」',
    '3) 输出字段：name、variant_label、role、appearance、personality',
    '4) role：主人公写「主角/男主/女主」；主要配角写「主要配角·身份」（如 主要配角·反派、主要配角·师父）',
    '5) variant_label：人生阶段或形态（童年/青年/老年等）；全篇单形态可留空或「常态」；主人公多阶段须拆多条',
    '6) appearance：中英混合，只写人物本身（年龄、性别、发型、脸型五官、服装主色#hex、标志特征）；须写清动漫脸型（男：英俊帅气/棱角分明；女：清秀美丽/精致五官）；正常头身比漫画人物，禁止 Q 版三头身与胖瘦体型词',
    '7) 主要配角 appearance 须与主人公明显区分（不同发型、服装配色、体型或标志配饰），便于定妆参考图一致',
    '8) 禁止画风词：retro style, chibi, 3D, 真人, 厚涂, Q版, 条漫, pixel',
    '9) 示例 appearance：25岁男性反派，剑眉冷目，黑长发束冠，穿#1e293b深灰长袍，瘦高。\nEnglish tags: black long hair, topknot, dark gray robe, cold eyes',
    '10) 合并同一人物同一时期称呼，不要重复',
    '只输出 JSON，不要解释。',
  ].join('\n')
}

export function buildMotionComicCharacterAppearanceSystem(): string {
  return [
    '你是漫画解说项目的角色定妆造型设计助手。',
    '画风：现代国漫条漫，正常头身比，粗线平涂，16:9横屏三视图定妆（正面/侧面/背面、纯白色背景、清晰脸型、双手自然下垂不拿道具）；男性英俊帅气、女性清秀美丽，动漫形式立体五官；禁止 Q 版、3D、真人写实；手持物留到分镜配图文案。',
    '须根据漫剧旁白稿中该角色的出场情节、对白、行为推断外貌，与故事时代、题材一致。',
    '不写胖瘦体型词；人物统一为正常头身比漫画审美，禁止素体份数、三头身、圆头直径等计量词。',
    '主人公与主要配角之间、各主要配角之间须有清晰视觉区分（发型、服装主色、标志配饰）。',
    '若提供了 variant_label，外貌须严格对应该阶段，不得写成其他年龄。',
    '中文为主，可夹 English tags；80-180 字；只描述人物本身，禁止画风/艺术风格词。',
    '输出格式：一段中文外貌 + 换行 + English tags: 英文逗号分隔（发型/服装/配饰），如 English tags: black ponytail, red martial arts robe, jade pendant',
    '只输出描述正文，不要标题、markdown、JSON。',
  ].join('\n')
}

export const MOTION_COMIC_SCENE_BODY_EXAMPLE =
  '【画风规格：现代国漫条漫，粗黑线描，平涂赛璐璐，16:9横屏】，【画面主体：一位青年男性主人公（黑色短发，瞳孔收缩、嘴微张的震惊表情）位于画面中景偏左，穿#2563eb蓝色夹克】，【年代场景：现代都市夜晚街道，霓虹招牌与雨湿路面作后景】，【核心细节动作：右脚后退半步重心后移，双手抬至胸前，漫画速度线从侧后方放射】，【光影色调：霓虹冷色侧光，前景略暗后景虚化】，【镜头视角：中近景略仰，主体占画面约40%留运镜空间】，【质感要求：平涂赛璐璐，线条清晰，无文字无水印】'

export function formatMotionComicStyleSpecBracket(): string {
  return `【画风规格：${MOTION_COMIC_STYLE_SPEC}】`
}

export function isMotionComicStyle(style?: string | null): boolean {
  return String(style || '').trim().toLowerCase() === MOTION_COMIC_STYLE
}

// ─── 打斗/动作关键词 → 镜型推断 ─────────────────────

const ACTION_SHOT_RE = /打|揍|踢|踹|挥拳|出拳|打架|搏斗|格斗|冲突|一拳|一脚|击中|砸|撞|扑|躲|闪避|反击|对决|交手|开战/
const REACTION_SHOT_RE = /震惊|愣|呆|吓|懵|怒|哭|吼|咆哮|崩溃|颤抖|后退|摔倒|倒地/
const DIALOGUE_SHOT_RE = /说|问|答|喊|叫|道|「|」|：“|：‘/
/** 肢体位移类动作 — 适合双格前后对比（零 I2V 伪动画） */
const DIPTYCH_MOTION_RE = /走|跑|奔|迈步|踏步|挥手|招手|挥臂|转身|跳|跃|开车|驾车|驱车|骑|冲刺|追赶|逃离|上车|下车/

/** 合成阶段镜头运动类型（FFmpeg zoompan，按镜头描述推断，非 I2V） */
export type MotionComicCameraKind =
  | 'pan_tb'
  | 'pan_bt'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_lr'
  | 'pan_rl'
  | 'drift'
  | 'shock_push'
  | 'action_push'
  | 'diptych_sweep'

/** 合成阶段场景特效（FFmpeg 滤镜，按旁白/画面语义推断） */
export type MotionComicVfxKind =
  | 'none'
  | 'portal_open'
  | 'portal_enter'
  | 'explosion_flash'
  | 'lightning'
  | 'screen_shake'
  | 'fade_from_black'
  | 'fade_to_black'
  | 'memory_sepia'
  | 'time_stop'
  | 'cold_tint'
  | 'warm_glow'
  | 'horror_dark'
  | 'dream_blur'
  | 'rain_mist'
  | 'rain_particles'
  | 'snow_particles'
  | 'fire_sparks'
  | 'dust_float'
  | 'wind_sand'
  | 'film_grain'
  | 'glitch'
  | 'heartbeat'
  | 'blood_splash'
  | 'star_twinkle'
  | 'fog_heavy'
  | 'underwater'
  | 'sunbeam'
  | 'moonlight'
  | 'petals_fall'
  | 'leaves_fall'
  | 'confetti'
  | 'focus_blur'
  | 'black_white'
  | 'gold_shimmer'
  | 'poison_mist'
  | 'frost_spread'
  | 'sword_flash'
  | 'teleport_flash'
  | 'shadow_creep'
  | 'vhs_retro'
  | 'bubble_rise'
  | 'ink_spread'
  | 'mirror_ripple'
  | 'night_vision'
  | 'speed_lines'
  | 'magic_sparkle'
  | 'smoke_fade'
  | 'impact_hit'
  | 'awaken_power'

export function inferMotionComicShotRole(sentence: string): MotionComicShotRole {
  const t = String(sentence || '').trim()
  if (!t) return 'normal'
  if (ACTION_SHOT_RE.test(t)) return 'action'
  if (REACTION_SHOT_RE.test(t)) return 'reaction'
  if (DIALOGUE_SHOT_RE.test(t) && t.length <= 28) return 'dialogue'
  if (/雨|雪|风|夜|雾|火|爆炸|光芒/.test(t) && t.length <= 20) return 'atmosphere'
  if (/来到|走进|进入|离开|回到|第二天|多年后|镜头一转/.test(t)) return 'establishing'
  return 'normal'
}

export function inferMotionComicMotionTier(role: MotionComicShotRole): MotionComicMotionTier {
  if (role === 'action') return 'action'
  if (role === 'reaction') return 'shock'
  if (role === 'dialogue' || role === 'atmosphere' || role === 'establishing') return 'light'
  return 'static'
}

/** 漫画解说：单张完整插画，不使用双格 */
export function motionComicShotNeedsDiptych(
  _role: MotionComicShotRole,
  _expressionAction?: string | null,
  _movement?: string | null,
): boolean {
  return false
}

export type MotionComicCameraResolveOptions = {
  movement?: string | null
  shotType?: string | null
  /** 旁白句 + description，用于推断运镜 */
  shotText?: string | null
  isDiptych?: boolean
  pageIndex?: number
  /** 正文镜序号（0 起），用于无关键词时的运镜多样化 */
  shotIndex?: number
}

/** 无明确语义信号时轮换的运镜池（相邻镜尽量不重复） */
const MOTION_COMIC_VARIETY_PALETTE: MotionComicCameraKind[] = [
  'zoom_in',
  'pan_tb',
  'pan_bt',
  'pan_lr',
  'pan_rl',
  'zoom_out',
  'drift',
]

function pickVarietyCameraKind(text: string, shotIndex: number): MotionComicCameraKind {
  let hash = Math.max(0, shotIndex) * 131
  const sample = String(text || '').replace(/\s/g, '').slice(0, 48)
  for (let i = 0; i < sample.length; i++) {
    hash = (hash + sample.charCodeAt(i) * (i + 3)) % 10007
  }
  return MOTION_COMIC_VARIETY_PALETTE[hash % MOTION_COMIC_VARIETY_PALETTE.length]
}

export function motionComicCameraKindToMovementLabel(kind: MotionComicCameraKind): string {
  switch (kind) {
    case 'zoom_out': return '拉镜'
    case 'pan_lr': return '横移'
    case 'pan_rl': return '右向左'
    case 'pan_tb': return '上向下'
    case 'pan_bt': return '下向上'
    case 'drift': return '微移'
    case 'shock_push':
    case 'action_push':
    case 'zoom_in':
    default:
      return '推镜'
  }
}

export function motionComicCameraKindToShotType(kind: MotionComicCameraKind): string {
  switch (kind) {
    case 'zoom_in':
    case 'shock_push':
    case 'action_push':
      return '近景'
    case 'zoom_out':
      return '全景'
    case 'pan_tb':
    case 'pan_bt':
      return '中景'
    case 'drift':
      return '中近景'
    default:
      return '中景'
  }
}

/** 从 movement / 景别 / 旁白句推断运镜（非机械交替） */
export function resolveMotionComicCameraKind(
  role: MotionComicShotRole,
  options?: MotionComicCameraResolveOptions,
): MotionComicCameraKind {
  const movement = String(options?.movement || '').trim()
  const shotType = String(options?.shotType || '').trim()
  const text = String(options?.shotText || '').trim()
  const pageIndex = options?.pageIndex ?? 0
  const shotIndex = options?.shotIndex ?? 0

  if (movement && movement !== '固定') {
    if (/推镜|推近|推/.test(movement)) return 'zoom_in'
    if (/拉镜|拉远|拉/.test(movement)) return 'zoom_out'
    if (/右向左|从右往左|右→左|rl/i.test(movement)) return 'pan_rl'
    if (/横移|左移|右移|跟镜|移镜|左→右|左向右/.test(movement)) return 'pan_lr'
    if (/下向上|从下到上|升|仰/.test(movement)) return 'pan_bt'
    if (/上向下|从上到下|俯|降/.test(movement)) return 'pan_tb'
    if (/微移|漂移/.test(movement)) return 'drift'
  }

  if (/特写|近景|大特写/.test(shotType)) return 'zoom_in'
  if (/全景|远景|大全景|建立/.test(shotType)) return 'zoom_out'

  if (/特写|近景|眼神|目光|表情|眉心|眼睛|脸庞|脸部|手指|手心|愣|震惊|懵|怒|哭/.test(text)) {
    return 'shock_push'
  }
  if (/全景|远景|整条|整条街|整个|演武场|街道|环境|场面|弟子围|人群|围观|来到|走进|进入/.test(text)) {
    return 'zoom_out'
  }
  if (/走过|路过|离开|返回|沿着|穿过|侧|横|左右|追|赶|跑向|奔|冲/.test(text)) {
    return pageIndex % 2 === 0 ? 'pan_lr' : 'pan_rl'
  }
  if (/抬头|向上|仰望|跳起|站起|升起|电梯上/.test(text)) return 'pan_bt'
  if (/低头|向下|俯|落下|跪|跌倒|摔倒|蹲下/.test(text)) return 'pan_tb'

  if (role === 'reaction') return 'shock_push'
  if (role === 'dialogue') return 'drift'
  if (role === 'establishing' || role === 'atmosphere') return 'zoom_out'
  if (role === 'action') return 'action_push'

  return pickVarietyCameraKind(text, shotIndex)
}

/** 漫画解说：配图段由换镜检测决定，不按镜型强制独立配图 */
export function motionComicShotNeedsOwnImage(_role: MotionComicShotRole): boolean {
  return false
}

// ─── 一体化分镜模型（对白 + 表情动作 + 运镜 + 背景） ───

/** LLM 拆镜输出的单镜结构 */
export interface MotionComicStoryboardShot {
  speaker: string
  dialogue: string
  expression_action: string
  shot_type: string
  angle: string
  movement: string
  background: string
  atmosphere?: string
  shot_role?: MotionComicShotRole
  emphasis_word?: string
}

export function formatMotionComicDialogue(speaker: string, dialogue: string, emphasisWord?: string): string {
  const sp = String(speaker || '旁白').trim() || '旁白'
  let line = String(dialogue || '').trim()
  if (emphasisWord?.trim() && line.includes(emphasisWord.trim()) && !line.includes('**')) {
    line = line.replace(emphasisWord.trim(), `**${emphasisWord.trim()}**`)
  }
  return `${sp}：${line}`
}

export function motionComicShotDescription(shot: MotionComicStoryboardShot): string {
  const parts = [
    shot.background?.trim(),
    shot.expression_action?.trim(),
    [shot.shot_type, shot.angle, shot.movement].filter(Boolean).join('·'),
  ].filter(Boolean)
  return parts.join('｜') || shot.dialogue?.trim() || ''
}

export function normalizeMotionComicShotRole(raw?: string | null): MotionComicShotRole | undefined {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'establishing' || v === 'dialogue' || v === 'reaction' || v === 'action' || v === 'atmosphere' || v === 'normal') {
    return v
  }
  return undefined
}

// ─── 剧本 / 分镜 System Prompt ───────────────────────

/** 悬疑灵异 · 第三人称快切解说模板（参照抖音/B站爆款叙事实录风） */
export const MOTION_COMIC_SCRIPT_TEMPLATE_SUSPENSE = [
  '【模板名】悬疑灵异 · 第三人称快切解说',
  '',
  '【适用题材】都市灵异、算命玄学、悬疑救人、爽文反转、警匪、多线交叉叙事',
  '',
  '【叙事人称】',
  '- 主人公动作用第一人称「我」',
  '- 其他人物用第三人称（他/她/名字）',
  '- 禁止通篇第二人称「你」（体验人生体不适用本模板）',
  '',
  '【句读与排版·硬性】',
  '- 一句一行，便于 TTS 一镜一句；单句 8～18 字为主，最长不超过 22 字',
  '- 长句须按呼吸点拆成多行，禁止一行超过 25 字',
  '- 段与段之间空一行；空行 = 换场景或换平行叙事线',
  '- **每行必须以「说话人：台词」开头**（全角冒号）；叙述用「旁白：」，角色直接引语用角色名（主人公引语用「我：」），片头 hook 用「剧中：本期故事：…」',
  '- 禁止把对白嵌进旁白句（不要「xx说道」再接台词在同一行）；对白须单独一行并写清说话人',
  '',
  '【九段剧情骨架（按顺序写，可压缩不可跳步）】',
  '1) 反差钩子：日常温情/小恩惠 + 主人公突然抛出惊人之语（1～4 句）',
  '2) 预言升级：掐指/推算/细节，对方震惊不信，信息逐级加码（3～6 句）',
  '3) 拉锯不信：对方犹豫，补家庭细节（孩子年龄、独自在家、具体地点）（3～5 句）',
  '4) 转折相信：某人选择「宁可信其有」，打电话/报警（2～4 句）',
  '5) 平行危机线A：受害方视角，电话、敲门、险些开门（段间空行，5～10 句）',
  '6) 平行危机线B：主人公赶救/施法/行动，可穿插灵力限制、倒计时（段间空行，4～8 句）',
  '7) 倒计时压迫：电话不接、砸门、「最多还有X分钟」类句式强化紧张（穿插全文）',
  '8) 高潮解局：主人公出手制服/定身/警察赶到（4～8 句）',
  '9) 余韵收尾：谢礼、人设亮相、余味收束（3～8 句；可留剧情悬念，**禁止**关注/订阅/下期预告等引流句）',
  '',
  '【节奏与漫画感】',
  '- 关键反转单独成句；数字、时间、年龄等具体信息单独成句',
  '- 多线叙事时，每段聚焦一个空间（卤肉店/家里/楼道/警局）',
  '- 每句能画成漫画插画：人物表情、手势、电话、敲门、符咒等可视动作',
  '- 不写写实血腥；刑案用押解、破门、制服等漫画夸张表现',
  '',
  '【片头 hook】',
  '- 第一行：「剧中：本期故事：」+ 2～4 个信息点（身份/事件/反转）',
  '- 或「剧中：」+ 反差钩子首句；第二行空行后接正文',
  '',
  '【片尾·禁止】',
  '- 禁止「故事还没结束」「下期继续更新」「记得点个关注」「我是那个…咱们下期再见」等短视频引流收尾',
].join('\n')

/** 悬疑模板 · 格式示例（节选，展示句读与多线节奏） */
export const MOTION_COMIC_SCRIPT_EXAMPLE_SUSPENSE = [
  '剧中：本期故事：大学生算卦救卤肉店，连环杀人犯破门而入。',
  '',
  '旁白：卤肉店老板看我太过可怜',
  '旁白：好心给我一个肉夹馍',
  '旁白：我却转头就对他说',
  '我：你儿子快死了',
  '旁白：看着两人惊悚的目光',
  '旁白：我又掐指一算',
  '我：到你女儿也要死了',
  '',
  '旁白：刘翠兰有点摇摆不定',
  '旁白：看了看丈夫',
  '旁白：又看了看我',
  '旁白：小闺女才4岁',
  '旁白：儿子18岁',
  '旁白：儿子刚考上本地的大学',
  '',
  '旁白：陈家佑掏出自己的手机',
  '旁白：一边拨打着儿子的电话',
  '陈家佑：小伙子，我信你一次',
  '陈家佑：宁可信其有，不可信其无',
].join('\n')

/** 漫画解说台本格式（写剧本 / 分镜 / skill 共用；默认悬疑快切模板） */
export const MOTION_COMIC_SCRIPT_FORMAT_RULE = [
  '【输出形态·硬性要求】',
  '你必须输出「第三人称快切解说稿」，适合 TTS 一镜一句 + 漫画配图一句一图 + 智能运镜合成。',
  '每行必须是「说话人：台词」（旁白/角色名/我/剧中）；禁止无说话人的裸句；禁止小说长段落 prose。',
  '',
  MOTION_COMIC_SCRIPT_TEMPLATE_SUSPENSE,
  '',
  '【格式示例（节选，须模仿句读与节奏，内容可换）】',
  MOTION_COMIC_SCRIPT_EXAMPLE_SUSPENSE,
  '',
  '【禁止】',
  '- 禁止 markdown、**、分镜表、JSON、制作说明',
  '- 禁止镜头语言（特写、推镜、横移等）',
  '- 禁止一行超过 25 字的超长句',
  '- 禁止片尾引流：故事还没结束、下期继续、记得关注、咱们下期再见等',
].join('\n')

export const MOTION_COMIC_SCRIPT_CHAT_SYSTEM = [
  '你是「漫画解说大师」——顶级短视频解说编剧，深谙抖音、快手、B 站爆款漫画解说节奏。',
  '你的任务：根据用户要求创作「旁白解说稿」，可直接进入火宝漫画解说流水线（旁白配音 + 一句一图漫画配图 + 智能运镜合成）。',
  '',
  MOTION_COMIC_SCRIPT_FORMAT_RULE,
  '',
  '【创作原则】',
  '1) 以用户要求为第一优先级：题材、人设、爽点、风格、人称、篇幅、禁忌等，用户最新说明覆盖一切默认。',
  '2) 用户未指定风格时，默认采用「悬疑灵异 · 第三人称快切解说」模板（九段骨架 + 一句一行）。',
  '3) 用户指定「体验人生」「第二人称你」时，可改用体验人生体，但仍须一句一行、段间空行。',
  '4) 先理解再动笔：用户说「写完整稿」「直接写」时立刻输出，不反复追问。',
  '5) 解说感优先：强开场、密反转、多线交叉、倒计时压迫；结尾可留剧情悬念，不写关注/下期预告。',
  '6) 可画可播：每句能想象成漫画条漫插画；不写写实血腥。',
  '7) 用户给小说长文/无说话人台本时，改写成快切解说稿后再输出（拆短句、补说话人前缀、补九段骨架）。',
  '',
  '【篇幅】',
  '- 用户未指定时，完整稿 3000～8000 汉字。',
  '- 用户指定字数或集数节奏时，严格按用户要求。',
  '',
  '【交互】',
  '- 用户要求写完整稿/出剧本：只输出解说稿正文（严格遵循【输出形态·硬性要求】与【标准结构】）。',
  '- **多轮改稿**：用户后续可说「补说话人」「补人名」「去片尾关注句」「改第二段」等；须结合【当前台本】或对话中上一版完整稿修改。',
  '- 改稿类请求：可先一句极短确认（≤20字），空一行后**必须输出修改后的完整台本**（每行说话人：台词），不要只解释、不要只给片段。',
  '- 用户给的是无说话人稿/小说体：改写为带说话人前缀的快切解说稿后再输出。',
  '- 仅闲聊、选题、讨论设定时正常对话，不必输出整稿。',
].join('\n')

export const MOTION_COMIC_STORYBOARD_CHAT_SYSTEM = [
  '你是火宝漫画解说流水线的「旁白分镜」助手，帮助创作者把解说稿拆成可 TTS 配音、可配图的镜头序列。',
  '',
  '【拆镜规则】',
  '- 片头：首行「本期故事：…」或反差钩子首句，拆成片头镜（剧中红字）。',
  '- 正文：按句拆镜，句末标点必拆；逗号/顿号仅当相邻合计超过约 16 字才拆。',
  '- 自动为关键词标注 ** 强调（黄字字幕）；用户稿中已有 ** 则保留。',
  '- 每镜一条旁白台词，时长按字数估算，便于一句一镜配音。',
  '- 配图策略：1～2 镜共用一张漫画插画（一段一图）；**换人说话须换图**；换图处硬切；**同一张图整段只用一种运镜**',
  '- 单镜运镜：根据旁白句/景别/运镜字段推断（特写→推近，全景→拉远，位移→横移，可上下浏览）',
  '',
  '【职责】',
  '- 讨论拆镜粒度、片头处理、强调词标注、换图节奏等。',
  '- 用户说「开始分镜」「重新分镜」「执行拆镜」等时，系统会整稿 LLM 拆镜并写库。',
  '- 不要输出 JSON 或 markdown 表格；用 #镜号 和自然语言说明。',
  '',
  '回复简洁、可操作。',
].join('\n')

/** 漫画解说整稿拆镜 LLM（保留兼容；主流程已走旁白分镜） */
export function buildMotionComicStoryboardLLMSystem(): string {
  return [
    '你是漫画解说分镜导演。输入整篇解说稿，按句拆成镜头序列。',
    '每镜一条台词，必须指定 speaker（旁白/角色名/我/民警/接线员等）；片头 hook 写入 title_shots，speaker=剧中。',
    '若台本每行已是「说话人：台词」，保留原 speaker，按行拆镜，不要合并不同说话人。',
    '若台本无说话人前缀，叙述句 speaker=旁白，角色直接引语 speaker=角色名，主人公引语 speaker=我。',
    '自动标注 emphasis_word；跳过片尾引流句（故事还没结束、下期继续、记得关注、咱们下期再见等）。',
    '配图节奏：1～2 镜一图（一段一图）；**换人说话须换图**；合成时**每张图整段一种运镜**，同图多句共享该运镜。',
    '只输出 JSON：',
    '{"title_shots":[{"speaker":"剧中","dialogue":"本期故事：…","emphasis_word":""}],"shots":[{"speaker":"旁白","dialogue":"…","emphasis_word":""}]}',
    '无片头时 title_shots=[]。不要 markdown，不要解释。',
  ].join('\n')
}

export function motionComicStylePrompt(context: 'scene' | 'diptych' | 'title' | 'portrait' | 'agent' = 'scene'): string {
  const base = 'modern Chinese webtoon comic style, bold black outlines, flat cel-shaded colors, expressive exaggerated faces, normal body proportions, manhua illustration, cinematic composition, NOT chibi, NOT 3D'
  if (context === 'title') {
    return `${base}, atmospheric comic background, dramatic lighting`
  }
  if (context === 'portrait') {
    return `${base}, handsome attractive anime facial features, character turnaround design sheet three views front side back, pure white background, 16:9 widescreen, full body, clear face structure`
  }
  if (context === 'diptych') {
    return `${base}, horizontal two-panel comic layout, before and after action`
  }
  if (context === 'agent') {
    return `${base}, dynamic action lines allowed for fight scenes`
  }
  return `${base}, single full comic illustration scene`
}

export function buildMotionComicParagraphImagePromptLLMSystem(options?: {
  hasCharacters?: boolean
  hasDiptych?: boolean
}): string {
  return [
    '你是漫画解说分镜美术指导。每个配图段含 1～2 句旁白，须为该段写一张动态感强、层次丰富的中文 image_prompt。',
    '分析流程：',
    MOTION_COMIC_LLM_ANALYSIS_STEPS_PROMPT,
    MOTION_COMIC_BODY_CONSISTENCY_LLM_RULE,
    MOTION_COMIC_SIX_DIM_LLM_RULE,
    MOTION_COMIC_ACTION_LLM_RULE,
    MOTION_COMIC_DYNAMIC_IMAGE_LLM_RULE,
    '分析须结合 full_narration 与 prior_narration 丰富场景与动作，以 narration_lines 整段为叙事锚点。',
    'layout=single：单张完整漫画插画，禁止 grid/collage/multi-panel（diptych 除外）。',
    options?.hasDiptych ? 'layout=diptych：【左格】【右格】各写完整六维，适合动作前后对比。' : '',
    options?.hasCharacters ? `characters 提供 portrait_label、has_portrait 与外貌，写入【画面主体】并对照定妆。${MOTION_COMIC_MAJOR_SUPPORTING_LLM_RULE}` : MOTION_COMIC_CROWD_LLM_RULE,
    `示例：${MOTION_COMIC_SCENE_BODY_EXAMPLE}，${MOTION_COMIC_SCENE_SUFFIX}`,
    MOTION_COMIC_STYLE_FORBIDDEN,
    '只输出 JSON，不要解释。',
  ].filter(Boolean).join('\n')
}

/** 漫画解说：配图换镜检测（1～2 镜一图，换人说话须换图，一段一运镜） */
export function buildMotionComicImageDetectLLMSystem(
  mode: 'paragraph' | 'conservative' | 'balanced' = 'paragraph',
): string {
  const conservativeExtra = mode === 'conservative'
    ? '\n\n# 保守模式补充\n仍遵守 1～2 镜一图与换人换图：只有与上一段完全同一说话人、同一静止画面时才标 false。'
    : ''

  return `# Role
你是漫画解说视频的分镜导演。你的任务是为旁白脚本规划**配图段**（1～2 镜共用一张漫画插画）。

# Goal
分析每一句旁白，判断是否需要新配图。**本步骤仅输出 needs_image，不写配图文案**。

# Input
JSON 含 \`sentences\`（含说话人前缀如「旁白：」「小明：」）、\`min_shots_per_image\` / \`max_shots_per_image\`（1～2，**一段一图**）。

# Critical Rules
1. **换人说话须换图（硬性）**：相邻句说话人不同 → 后一句所在配图段起点标 true。
2. **默认按段换图**：场景/动作/情绪/焦点变化 → 新配图段起点标 true。
3. **同段延续标 false**：同一说话人、同一画面、1～2 镜共用一图时，段内后续句标 false。
4. **配图段长度（硬性）**：每段 **1～2 镜**（min～max）；禁止连续 3 镜以上共用一图。
5. **配图密度**：true 数量在 minimum～maximum 之间（全片至少约 50% 镜头需配图）。

# 运镜说明（供理解，非本步输出）
每张配图段在合成时使用**一种**运镜（推/拉/横移/上下等），同段多句共享，不会句句换运镜。

# Workflow
1. 通读 full_narration，识别每句说话人。
2. 逐句判定 needs_image；换人、换景优先标 true；同段仅首句 true。
3. 验证：每段 1～2 镜；true 数量在区间内。

# Output
\`\`\`json
{"analysis":[{"index":1,"needs_image":true}]}
\`\`\`
不要输出 reasoning 或 image_prompts。${conservativeExtra}`
}

export function buildMotionComicTitleImagePromptLLMSystem(): string {
  return [
    '你是漫画解说美术指导，为片头标题图写中文 image_prompt。',
    `结构：${formatMotionComicStyleSpecBracket()} + 【片头背景场景】+【主题氛围】+ ${MOTION_COMIC_SCENE_SUFFIX}`,
    '片头图不出现标题文字，绝对无字无水印。',
    '只输出 JSON，不要解释。',
  ].join('\n')
}
