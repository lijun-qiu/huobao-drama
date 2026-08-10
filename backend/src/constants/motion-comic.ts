/**
 * 漫画解说 — 画风规格、分镜规则、运镜预设
 * 制作方法：对话为主的快切解说（旁白约30%/对白约70%）+ 高对比国漫配图 + 智能运镜 + 配音字幕（零 I2V）
 */
import type { ProductionMode } from './production-mode.js'
import { isMotionComicMode } from './production-mode.js'
import { PORTRAIT_AGE_INFERENCE_LLM_RULE } from './portrait-reference.js'

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
  { value: MOTION_COMIC_STYLE, label: '高对比国漫' },
] as const

/** 漫画解说：每张配图覆盖 1～2 镜（更密；换焦点可单镜成段） */
export const MOTION_COMIC_IMAGE_SEGMENT_MIN_SHOTS = 1
export const MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS = 2

/** 漫画解说：配图锚点约占镜头数 50%～72%（约每 1.5～2 镜一张） */
export const MOTION_COMIC_IMAGE_DETECT_MIN_STORYBOARD_RATIO = 0.5
export const MOTION_COMIC_IMAGE_DETECT_MAX_STORYBOARD_RATIO = 0.72
/** 后处理优先拉到的目标密度（落在 min～max 偏上） */
export const MOTION_COMIC_IMAGE_DETECT_TARGET_STORYBOARD_RATIO = 0.6

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

// ─── 画风规格（短剧解说高清国漫：配图与定妆共用同一套冷色高对比戏剧光） ─────────────

/** 配图/定妆共用的画风内核（不含画幅） */
export const MOTION_COMIC_ART_STYLE_CORE =
  '短剧解说高清国漫，锋利干净细线稿，硬边赛璐璐明暗分界极鲜明，高对比冷色夜调（深蓝/青紫/深灰），强单侧戏剧光与半脸深阴影，发丝冷白轮廓高光，正常头身比（非Q版非三头身，年龄按角色写老年/中年/青年，禁止全员写成青年小伙），禁止新海诚暖金柔光、禁止水彩糊边、禁止粗条漫黑线、禁止3D真人、禁止画面内字幕水印'

export const MOTION_COMIC_STYLE_SPEC =
  `16:9 横屏，${MOTION_COMIC_ART_STYLE_CORE}，瞳孔可微缩强化张力，紧张时可写汗珠与眉眼紧绷，背景暗部浅景深虚化`

/** 定妆与配图画风一致；Agnes 多图合成友好：深色身份锁脸，禁止白棚设定表 */
export const MOTION_COMIC_PORTRAIT_STYLE_SPEC =
  `竖幅正面半身身份锁脸参考，${MOTION_COMIC_ART_STYLE_CORE}，面无表情中性冷静，人物占满画面，深藏青/深灰纯色或浅景深虚化背景（禁止纯白棚光白底），五官发型清晰可辨，禁止速度线、禁止放射线、禁止夸张表情、禁止角色设定拼贴构图`

/** 定妆场景维：Agnes 多参考合成专用深色背景（白底半身易被合成成设定表） */
export const MOTION_COMIC_PORTRAIT_SCENE_CN =
  '深藏青冷调纯色或极简虚化背景（#0f172a～#1e293b，禁止纯白色背景），竖幅正面半身身份锁脸定妆，强单侧戏剧光与半脸深阴影，发丝冷白轮廓高光，清晰展示脸型五官发型与上半身服装，人物占满画面头到胸口，无杂乱陈设，无白棚，无字幕水印'

/** 英文画风（配图/定妆共用内核） */
export const MOTION_COMIC_ART_STYLE_EN =
  'Chinese short-drama manhua key visual, high-fidelity digital anime, sharp clean thin lineart, hard-edge cel shading, deep chiaroscuro, high contrast cool blue purple grey night tones, strong side key light with deep face shadows, cool white rim light on hair, intense expressive anime eyes, normal body proportions matching character age (elderly/middle-aged/young as specified, NOT default all young), NOT Makoto Shinkai soft golden hour, NOT watercolor blur, NOT chibi, NOT thick webtoon outlines, NOT speed lines, NOT 3D'

/** Agnes 多图合成友好的定妆英文构图（深色底 + 半身锁脸） */
export const MOTION_COMIC_PORTRAIT_FRAMING_AGNES =
  'vertical portrait single front upper-body IDENTITY LOCK reference for multi-character composition, chest-up framing, one character only, facing camera, neutral face no expression, arms at sides empty hands, deep navy dark cool solid or soft-blur background #0f172a, subject fills most of frame, clear face hair and upper outfit, sharp cel manhua style, NOT pure white background, NOT white studio sheet, NOT character lineup, NOT turnaround, NOT full-body tiny figure, NOT landscape empty margins'

export const MOTION_COMIC_PORTRAIT_STYLE_EN =
  `${MOTION_COMIC_ART_STYLE_EN}, vertical half-body portrait, chest-up framing, neutral face no expression, deep navy dark cool background, subject fills frame, NOT pure white flat studio light, NOT white character sheet`

/** 定妆 appearance 须原样照抄的【画风规格】bracket */
export function formatMotionComicPortraitStyleSpecBracket(): string {
  return `【画风规格：${MOTION_COMIC_PORTRAIT_STYLE_SPEC}】`
}

/** 去掉定妆文案中的【画风规格】（生图剧情维已由固定 bracket 注入，避免重复） */
export function stripMotionComicPortraitStyleBracket(appearance: string): string {
  return String(appearance || '')
    .replace(/【画风规格[：:][^】]*】[，,]?\s*/g, '')
    .replace(/^[，,\s]+/, '')
    .trim()
}

/** 入库/补全：确保定妆 appearance 开头带固定【画风规格】 */
export function ensureMotionComicPortraitStyleInAppearance(appearance: string): string {
  const raw = String(appearance || '').trim()
  if (!raw) return raw
  const tagsMatch = raw.match(/\bEnglish tags:\s*([\s\S]+)$/im)
  let body = tagsMatch && tagsMatch.index != null ? raw.slice(0, tagsMatch.index).trim() : raw
  body = stripMotionComicPortraitStyleBracket(body)
  // 去掉旧白底均匀光残留，避免与统一戏剧光冲突
  body = body
    .replace(/[，,]?\s*竖幅纯白色背景/g, '')
    .replace(/[，,]?\s*纯白色背景/g, '')
    .replace(/[，,]?\s*均匀柔光/g, '')
    .replace(/左右只留窄白边/g, '左右边距尽量窄')
    .replace(/窄白边/g, '窄边距')
    .replace(/白底均匀柔光/g, '冷蓝戏剧侧光')
    .replace(/^[，,\s]+/, '')
    .trim()
  if (!body) return formatMotionComicPortraitStyleSpecBracket()
  return `${formatMotionComicPortraitStyleSpecBracket()}，${body}`
}

/** 提取/补全定妆 appearance：画风与配图一致 */
export const MOTION_COMIC_PORTRAIT_APPEARANCE_LLM_RULE = [
  `【定妆文案·画风规格·硬性】appearance 开头必须原样写入：${formatMotionComicPortraitStyleSpecBracket()}；须与配图同一套短剧解说高清国漫戏剧光，禁止改成白底均匀柔光/新海诚/京阿尼/水彩/厚涂/条漫/webtoon；`,
  '其后只写身份外貌（年龄或约略岁数/脸型/眉眼/发型/身形/#hex服装/标志特征/正面半身站姿）；五官与发型须国漫可辨：轮廓清晰、眉眼锋利、发块干净分明，禁止柔糊水彩五官、禁止万能男模棱角模板脸；',
  PORTRAIT_AGE_INFERENCE_LLM_RULE,
  '【同集异脸·硬性】与同集其他角色必须至少换脸型+发型+服装主色三档；禁止两名男性同用黑碎发+蓝夹克青年脸；',
  '定妆须面无表情中性冷静（表情留给配图）；画风光影按【画风规格】戏剧光，勿改成白棚平光。',
].join('')

export const MOTION_COMIC_STYLE_FORBIDDEN =
  '禁止3D渲染、真人照片、新海诚暖金柔光、水彩糊边、粗劣平涂、像素风、Q版三头身、粗条漫黑线、速度线放射线、画面内字幕水印文字'

export const MOTION_COMIC_SCENE_SUFFIX =
  '短剧解说高清国漫质感，冷色高对比戏剧光，锋利赛璐璐，绝对无文字无水印无字幕'

import {
  THREE_VIEW_PORTRAIT_SIZE,
  THREE_VIEW_PORTRAIT_PLOT_MOTION_COMIC_CN,
  NARRATION_PORTRAIT_REFERENCE_LLM_RULE,
  MOTION_COMIC_PORTRAIT_APPEARANCE_SPEC_FORMAT_RULE,
  PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
} from './portrait-reference.js'

export {
  THREE_VIEW_PORTRAIT_SIZE as MOTION_COMIC_PORTRAIT_SIZE,
  THREE_VIEW_PORTRAIT_PLOT_MOTION_COMIC_CN as MOTION_COMIC_PORTRAIT_PLOT_CN,
  MOTION_COMIC_PORTRAIT_FRAMING_AGNES as MOTION_COMIC_PORTRAIT_FRAMING,
  NARRATION_PORTRAIT_REFERENCE_LLM_RULE,
}

export const MOTION_COMIC_NEGATIVE_PROMPT =
  '3D建模、真人照片、新海诚暖金柔光、水彩糊边、粗劣平涂、像素风、Q版三头身、速度线、放射线、水印、文字、字幕、血腥、gore、blood、斩首、尸体'

/**
 * 漫画解说同框对照定妆上限：按剧情最多 2 人同框（各挂一张定妆参考）。
 * 单人戏仍只挂 1 张；换焦点/轮流说话可拆镜。
 */
export const MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS = 2

/**
 * 持物归属：旁白里「手里攥着」的烟不能写成「前景讲桌与香烟」。
 * 对照道具只锁外观，持有人/左右手必须写进动作。
 */
export const PROP_HOLDER_PLACEMENT_LLM_RULE = [
  '【持物归属·硬性】旁白出现手里/手中/握着/攥着/夹着/捏着/拿着/递/接/塞/掉/扔等与人物绑定的道具时：',
  '①必须写入人物动作/【核心细节动作】（谁、哪只手、握持/递接/掉落姿态），例：「王志刚右手攥着没点着的香烟」；',
  '②禁止只写成无人归属的桌面/前景陈设（如「前景讲桌与香烟」「桌上摆着烟」「前景掉落的香烟与桌面」却不写持有人或掉落动作）；',
  '③对照道具「label」只锁外观，不代替写清持有人与左右手；',
  '④仅当旁白明确静置在桌/地/架上且无人手持时，才可写入场景陈设；手持中的道具禁止再作为独立桌面静物重复摆放。',
].join('')

/**
 * 漫画解说定妆对照：按内容 1～2 个对照定妆（说话人/焦点优先）。
 */
export const MOTION_COMIC_PORTRAIT_REFERENCE_LLM_RULE = [
  '【定妆对照·硬性】characters 含 portrait_label、gender、has_portrait、portrait_default_outfit、distinct_identity_cue；',
  'has_portrait=true 时正文须含：对照定妆「portrait_label」（distinct_identity_cue短辨识差 + 本镜细化且可夸张的表情）+ 位于{位置}以{姿态} +（身穿#hex本镜服装）；',
  '【服装·硬性】（身穿…）只写服装款式+#hex，发色/瞳色勿写入身穿；每个 #hex 紧贴对应服装词，禁止无归属裸色号链；输出即终稿，系统不做二次清洗/注入。',
  '【辨识差·硬性】distinct_identity_cue 必须原样写入该角色括号靠前位置（如国字浓眉短寸·中年），禁止省略、禁止自编与 cue 冲突的脸型发型；',
  '【定妆人数·硬性】required_portrait_labels 按本段内容取 1～2 个（说话人/主焦点优先；同场互动且旁白点名两名有定妆角色时可同框 2 人）；每条 image_prompt 对照定妆不超过 2 个；禁止第三人脸/同脸克隆；第三人用剪影；',
  '主标签须为列表首项（说话人优先）；禁止用主人公/第一人称标签顶替本段点名的其他角色；',
  '表情写在人物描述里（可漫画式夸张：瞪眼、汗珠、咬牙、重心夸张等），肢体动作写清可见动作；禁止第三只手/悬空手；',
  PROP_HOLDER_PLACEMENT_LLM_RULE,
  '场所变化须换装；同一配图段内同一人物（身穿…）须一致；无定妆时须写性别。',
].join('')

/** 漫画解说配图文案最低信息量（汉字+陈设+镜头）；过短拒收重写 */
export const MOTION_COMIC_IMAGE_PROMPT_MIN_LEN = 180

/** 景别 / 视线 / 场景陈设硬性（按旁白 beat 选镜，禁止万能全身平视句） */
export const MOTION_COMIC_CAMERA_GAZE_SCENE_LLM_RULE = [
  '【景别·按 beat】优先遵守本段 shot_card；无 card 时按旁白选镜，禁止全片同一句「中远景略侧平视+头高12%+全身入镜」：',
  '· 场所/时间跳转、进门出门、远望 → 全景或远景建立（头高约6–10%）；',
  '· 冲/跑/刺/追/逃/扑等位移 → 跟拍或侧向中景/中远景，写清重心与迈步，头高约10–14%；',
  '· 对峙/拦挡/质问/递接 → 中景或中近景；若双方同场且均有定妆，可同框最多 2 人（左右/前后站位拉开）；仅单焦点时对空位/物件/门缝暗示对方；',
  '· 对话站谈 → 默认中景半身（头高约14–20%）；同场双人可左右/前后并排，禁止过肩双人构图；',
  '· 坐/蹲/跪持物 → 中近景（头高约18–24%）；',
  '· 纯神情（吓/哭/愣/惊恐且无肢体大位移）→ 必须近景或中近景（头高约22–30%），突出眉眼嘴型，表情可夸张；禁止仍写全身/过肩远站；',
  '相邻段须交替景别与俯仰（略俯/平视/略仰），禁止连续多段同一机位口吻。',
  '【姿态·硬性】有冲跑刺拦跪推等动词时，禁止只写「三分之四侧站立」比划；须写位移/重心偏移/手脚连续动作。三分之四侧仅为站谈默认倾向，不是全片唯一姿态；禁止无动作的正面摆拍站桩。',
  '【信息量·硬性】每条须含：短画风标记 + 景别俯仰头高% + 前中后景陈设 + 定妆标签与身穿#hex + 夸张表情动作；总长建议 ≥180 字，禁止只有一句站立概述。',
  '【视线·硬性】按剧情写「视线落在{戏内目标}」：对话看向对方、递接看向物件/手、进门看向室内、惊恐看向声源/门口、写字看向试卷、发呆可低垂或望向窗外；禁止全片统一直视镜头/望向镜头/无目标目视前方；仅当旁白明确「看向镜头/第四面墙」时才写看向镜头。',
  '【在场构图·硬性】可见有名定妆角色 1～2 人（按本段内容）；禁止同脸克隆/设定表/右侧头像墙；未点名群众用剪影。须写「单帧剧情场景」。',
  '【场景布置·硬性】年代场景至少写出 5 个具体陈设点（含材质/颜色/状态），前中后景都要有可指认物件；按场所补功能陈设。禁止空泛「昏暗墙壁与模糊窗框」。',
].join('\n')

/** 旁白位移/对峙等 — repair 时勿强行改成「三分之四侧站立」 */
const MOTION_COMIC_DYNAMIC_POSE_RE =
  /冲|跑|奔|刺|挥|追|逃|扑|踢|踹|打|揍|撞|闪|躲|跃|跳|迈|踏|拦|挡|推|拉|拽|跪|蹲|坐|躺|倒|前倾|后仰|侧身|转身|举起|高举/

/**
 * 漫画解说整段文案规则修复（无【】六维括号时）。
 * 只做必要纠偏：极端半身裁切、视线简写、多人挤脸；不再把镜头/站姿压成万能句。
 */
export function repairMotionComicContinuousImagePrompt(prompt?: string | null): string {
  let s = String(prompt || '').trim()
  if (!s) return ''
  // 六维括号文案走 art-styles 的 repair，这里只处理连贯国漫段
  if (/【画面主体|【镜头视角/.test(s)) return s
  if (!/对照定妆「/.test(s) && !/短剧解说高清国漫|锋利细线稿/.test(s)) return s

  const labelCount = [...s.matchAll(/对照定妆「/g)].length
  // 硬上限：同框对照定妆不超过上限（按文案可多人）
  if (labelCount > MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS) {
    let kept = 0
    s = s.replace(/对照定妆「[^」]+」/g, (m) => {
      kept += 1
      return kept <= MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS ? m : ''
    })
      .replace(/，同框对照定妆/g, '')
      .replace(/，{2,}/g, '，')
      .replace(/；{2,}/g, '；')
      .replace(/：，/g, '：')
  }

  const hasDynamicPose = MOTION_COMIC_DYNAMIC_POSE_RE.test(s)

  // 仅无动态姿态时，把空洞正面站桩改成三分之四侧；有冲刺/对峙等则保留
  if (!hasDynamicPose) {
    s = s
      .replace(/以正面站立姿态/g, '以三分之四侧站立姿态')
      .replace(/正面站立/g, '三分之四侧站立')
  }

  s = s.replace(/从头顶到腰部入镜/g, '从头顶到脚完整入镜，双脚可见')

  // 仅纠正「站谈却写成大头半身」的极端裁切；情绪近景/过肩中近景保留
  if (/站立|站姿/.test(s) && !hasDynamicPose && !/过肩|近景|特写/.test(s)) {
    s = s.replace(/镜头朝向([^；]{0,28})上半身/g, '镜头朝向人物与互动点')
    s = s.replace(/中近景([^；]{0,80})/g, (_m, rest: string) => {
      const body = String(rest || '')
      if (/上半身|腰部入镜|头高约占画面\s*(2[6-9]|[3-9]\d)/.test(`中近景${body}`)) {
        return `中景${body.replace(/上半身/g, '人物与互动点')}`
      }
      return `中近景${body}`
    })
  }

  // 只压极端大头（≥35%）；保留 12–28% 的景别多样性
  s = s.replace(/头高约占画面\s*(\d{1,2})\s*%/g, (_m, n: string) => {
    const pct = Number(n)
    if (!Number.isFinite(pct)) return _m
    if (pct >= 35) return '头高约占画面26%'
    return `头高约占画面${pct}%`
  })

  // 视线：A看向B → 视线落在…
  s = s.replace(/视线：([^；]+)/g, (_m, body: string) => {
    const parts = String(body)
      .split(/[，,]/)
      .map(x => x.trim())
      .filter(Boolean)
    const rewritten = parts.map((p) => {
      const m = p.match(/^(.+?)看向(.+)$/)
      if (!m) return /视线落在/.test(p) ? p : `${p}（视线落在戏内目标而非镜头）`
      const who = m[1].trim()
      let target = m[2].trim()
      if (!/脸|手|腕|屏|门|眼|地|柜|账|物|身/.test(target)) {
        target = `${target}脸上`
      }
      return `${who}的视线落在${target}而非镜头`
    })
    return rewritten.join('，')
  })

  // 全身入镜：仅「站谈全身建立镜」缺句时补；近景/过肩/坐姿不强制
  if (
    /站立|站姿/.test(s)
    && !hasDynamicPose
    && /中远景|全景|远景/.test(s)
    && !/完整入镜|近景|过肩|坐姿|蹲|跪/.test(s)
  ) {
    if (/双脚可见/.test(s)) {
      s = s.replace(/双脚可见/, '从头顶到脚完整入镜，双脚可见')
    } else if (/无文字无水印无字幕/.test(s)) {
      s = s.replace(/无文字无水印无字幕/, '从头顶到脚完整入镜，双脚可见；无文字无水印无字幕')
    }
  }

  if (labelCount >= 2 && !/左右拉开|前后层次|画面左侧|画面右侧|过肩|柜台前|柜台后/.test(s)) {
    s = s.replace(
      /(镜头朝向[^；]+)/,
      '$1，同框人物左右或前后拉开站位禁止重叠挤脸',
    )
  }

  if (labelCount >= 2 && !/单帧剧情场景|禁止白底定妆拼贴|禁止角色设定/.test(s)) {
    s = `单帧剧情场景（禁止白底定妆拼贴、角色设定表、多头拼贴），${s}`
  }

  return s.replace(/；{2,}/g, '；').replace(/，{2,}/g, '，')
}

/**
 * 漫画解说配图：一整段连贯中文（禁止【画风规格】等六维标签），
 * 但仍须覆盖画风/主体/场景/动作/光影/镜头/质感全部信息。
 */
export const MOTION_COMIC_SIX_DIM_LLM_RULE = [
  '【漫画解说整段文案】每条 image_prompt 写成一整段通顺中文（可用逗号/分号衔接），禁止输出【画风规格】【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】等固定【】标签。',
  '信息仍须齐全（顺序建议如下，写成自然叙述即可）：',
  `1) 画风：开头用短标记即可（如「16:9横屏短剧解说高清国漫，锋利细线稿硬边赛璐璐」），勿每条重复整段光影套话；禁止新海诚暖金柔光/水彩糊边/粗条漫黑线/速度线`,
  `2) 画面主体：位置+姿态+本段表情（贴合 narration_lines 情绪，可漫画式夸张：瞪眼/汗珠/咬牙/重心偏移等；禁止无故面无表情/中性冷静）；按内容写 1～2 个对照定妆「portrait_label」（含 distinct_identity_cue 短辨识差+本镜夸张表情）+（身穿#hex本镜服装）；同场互动且点名两名有定妆角色时可双人同框，禁止第三人脸/同脸克隆；未点名路人用剪影；站谈可用三分之四侧，位移/对峙须写动态姿态，禁止无动作正面摆拍`,
  '3) 年代场景：时代+具体地点+前/中/后景分层；前景≥2、中景≥2、后景≥1 个可辨物件（写清材质/颜色/新旧/污渍/灯光状态）；须写出场所功能陈设（柜台器具、门窗猫眼、路灯招牌、沙发茶几、病床护栏等），禁止只写「昏暗墙壁/模糊窗框/楼宇剪影」等空泛背景；手持中的关键道具不要塞进前景桌面陈设',
  '4) 核心细节动作：本段旁白正在发生的可见动作（塞钱/接物/僵住/后退/打电话/冲刺等），肢体方向与重心清晰；视线按剧情落在对方/物件/门外/手机屏幕/窗外等戏内目标，禁止全片统一直视镜头；禁止速度线；禁止站桩或上一段残留动作；手持物必须写在此（谁+哪只手+握持姿态）',
  '5) 光影色调：优先遵守 shot_card.suggested_light；按时段/场所写（夜巷冷蓝侧光、店内暖黄顶灯、白天街道自然光、紧张戏硬侧光）；禁止全片复读「冷蓝强侧光半脸深阴影与发丝冷白轮廓光」；背景可浅景深虚化',
  '6) 镜头视角：优先遵守 shot_card；须写景别+俯仰+身体朝向+镜头朝向（人+物件/动作点）+头高%；相邻段交替景别与俯仰；禁止连续多段「中远景略侧平视+头高12%+全身入镜」万能句',
  '7) 质感：锋利细线稿，硬边赛璐璐高对比，无文字无水印无字幕',
  MOTION_COMIC_CAMERA_GAZE_SCENE_LLM_RULE,
  '【屏幕朝向】禁止只画手机背面或显示器机箱背面；须正面或略侧可见屏幕内容',
  '【物件年代】同帧禁止CRT与现代超薄键鼠/全面屏手机混搭',
  '【手持解剖】手持物须写清左右手分工与恰好两只手；禁止一手撑墙一手持物贴墙（易出第三只手）；五指正常；指向/伸手须肩→肘→手连续成臂，禁止同侧臂下垂同时前景另出手/悬空手/第三只手',
  PROP_HOLDER_PLACEMENT_LLM_RULE,
  '【单帧一致】先锁定唯一可画瞬间（位置+姿态+动作+关键物件）；人物、动作、场景、镜头须同一瞬间同帧可见',
  MOTION_COMIC_PORTRAIT_REFERENCE_LLM_RULE,
].join('\n')

/** @deprecated 整段文案规则别名 */
export const MOTION_COMIC_NARRATIVE_PROMPT_LLM_RULE = MOTION_COMIC_SIX_DIM_LLM_RULE

/** 分镜配图：定妆锁脸 + 服装可变 */
export const MOTION_COMIC_PORTRAIT_OUTFIT_LLM_RULE =
  '【定妆锁脸·硬性】有定妆时禁止凭空编造与 distinct_identity_cue 冲突的脸型/发型；须写入 characters 提供的短辨识差 + 本镜细化表情；服装款式与 #hex 写在（身穿#hex…）中，须按本段旁白与场所换装，禁止每段照抄 portrait_default_outfit；同一配图段内同一人物（身穿…）须一致；同框对照定妆最多 2 人'

/** 配图文案必须贴合本段旁白的动作与表情 */
export const MOTION_COMIC_PARAGRAPH_BEAT_MATCH_LLM_RULE = [
  '【段落贴合·硬性】本条 image_prompt 只服务本段 narration_lines（约 1～2 句），表情与动作必须能对上这段旁白正在发生的事与情绪；可漫画式夸张当时状态（汗珠、瞪眼、嘴角抽搐、身体后仰、重心夸张等），仍须可读为同一瞬间剧情。',
  '先从 narration_lines 抽出：谁、在做什么、什么情绪（震惊/愤怒/害怕/尴尬/哀求/冷漠等），再写入夸张表情与动作；禁止套用上一段或通用站桩。',
  '对照示例：旁白写「塞钱/塞红包」→动作须伸手递钱或掏钱前伸，表情可为殷勤/紧张；旁白写「全身僵住/吓傻」→瞳孔微缩、肩背绷紧、夸张汗珠，禁止笑或闲聊手势；旁白写「问/喊/质问」→张嘴或指向，禁止沉默面无表情；旁白写「冲进/跑向/刺向」→须写迈步重心与身体前倾，禁止只写站立抬手。',
  '若本段含 shot_card：镜头/姿态/光影必须按 card 写，禁止无视 card 改回万能全身平视站立句。',
  '旁白写指向/伸手/拉袖/攥物：须肩→肘→手连续成臂，手持物挂在该连续臂上；禁止只写前景大手而同侧臂下垂；双人同框时各自肢体须可分清，禁止第三人肢体入镜。',
  '禁止：写「面无表情、中性冷静」（那是定妆专用）；配图必须有本段情绪表情，鼓励适度夸张。',
  '禁止：动作与旁白施受关系反了（如旁白李伯塞钱给我，却画「我」递钱）。',
  '【动作保真·硬性】①左右手以 narration_lines 为准：旁白写「左手夹烟/攥物」则动作须左手，禁止改成右手或双手；未写左右时可合理分配，但不得与旁白左右矛盾。',
  '②禁止发明本段旁白没有的肢体动作（如旁白只写「夹不稳/掉落」，却写「半拖半拽/指着标签/接过」）；未写到的下一拍高潮动作一律禁止提前画进本镜。',
  '③prior / full_narration / 相邻段只可补地点与关系，不得把别段或下一段的动词搬进本段【核心细节动作】。',
  'full_narration / prior 只可用来理解人物关系与地点；场景陈设以本段 narration_lines / scene_enrichment 为准，可略扩展同场氛围；禁止把全书物件清单搬进本镜，也不得把别段高潮动作表情搬进本段。',
].join('\n')

export const MOTION_COMIC_ACTION_LLM_RULE =
  '【打斗/动作镜】须写动态姿势、拳头/腿部运动方向、重心偏移与冲击构图；禁止速度线/放射线/写实血腥，用清晰肢体语言表现张力；动作仍须来自本段 narration_lines'

/** 动态漫：统一动漫审美（不写胖瘦体型词） */
export const MOTION_COMIC_BODY_CONSISTENCY_LLM_RULE = [
  '【人物审美·硬性】全片统一正常头身比国漫人物，禁止写「微胖」「肥胖」「瘦削」「腰腹略鼓」等胖瘦体型词；',
  '禁止写「躯干X份高×Y份宽」「三头身」「圆头直径」等素体份数计量；',
  '人物只写本段表情、服装、姿态与道具，不要额外描写肩腰肚胖瘦。',
].join(' ')

export const MOTION_COMIC_LLM_ANALYSIS_STEPS_PROMPT = [
  '1) 可扫一眼 full_narration（及 previous_episode_narration 若有），把握人物关系与地点；勿把全书物件当本镜清单',
  '2) 读 characters；同一配图段内同一人物服装款式+#hex 须一致',
  '3) 精读本段 narration_lines：抽出「谁 + 动词 + 情绪 + 视线目标」与本段可见物件；手持/递接/掉落道具必须挂到人物动作（谁+哪只手），勿只塞进场景前景；按内容选 1～2 个对照定妆（单人戏 1 个，同场互动且点名两名有定妆角色时 2 个），锁定单帧拍点（位置+姿态+动作+表情+看向何处）',
  '4) 先读本段 shot_card（若有）选定景别/姿态/光影，再写一整段连贯中文 image_prompt（禁止【】六维标签）；画风用短标记；场景陈设以本段旁白/scene_enrichment 为准，可略扩展同场氛围；禁止全书物件清单，禁止把别段高潮动作/表情塞进本段；手持道具写进动作而非桌面陈设',
].join('\n')

export const MOTION_COMIC_DYNAMIC_IMAGE_LLM_RULE = [
  '【一段一图】每条 prompt 对应一个配图段（narration_lines 约 1～2 句），写出该段最具叙事力的单一瞬间；同场景同焦点勿拆成多张无关图；换人/换焦点须另开段。',
  '【运镜友好构图】画面留前中后景层次（前景道具/中景主体/背景环境），主体姿态与肢体方向明确，便于后续推近/拉远/横移；避免主体贴边、画面过满；环境物件面积宜占画面主要部分，人物不要挤满画面中央。',
  '【动态表现】优先写本段可见动作与对应表情、物体互动；禁止速度线/放射线/气流线；情绪镜写眉眼嘴型与肢体语言。',
  '【镜头视角多样化】相邻配图段必须交替：全景建立/跟拍中景/单人中近景神情/略俯/略仰；姿态在站谈三分之四侧、侧面迈步、前倾冲刺间切换；禁止连续多镜同一「全身平视站立」口吻；禁止双人过肩构图。',
  '【手脚与持物】须写清左右手脚落点、握持方式与坐蹲臀膝脚关系；禁止只写「站着/坐着/拿着」；旁白「手里攥着/握着」须写「{角色}{左右手}攥/握{物}」，禁止「前景讲桌与{物}」。',
].join('\n')

/** 旁白是否含双人互动拍点（可同框双定妆；换焦点/反应镜可另开图） */
export const MOTION_COMIC_DUAL_PORTRAIT_BEAT_RE =
  /递|接|塞|拉|拽|推|拦|挡|并肩|对视|对峙|面对面|相对|两人|双方|交给|递给|握手|拥抱|质问|对骂|跟在|身旁|身边|拉住|抓住|拽住|塞进|塞给|并排|指着对方|对吼|对喊/

export function isMotionComicDualPortraitBeat(text?: string | null): boolean {
  return MOTION_COMIC_DUAL_PORTRAIT_BEAT_RE.test(String(text || ''))
}

/** 互动后的反应镜：应另开单人图 */
export const MOTION_COMIC_FOCUS_REACTION_BEAT_RE =
  /愣|僵住|吓傻|吓得|惊|怒|哭|吼|退|推开|接过|躲开|抬头|低头|转身|沉默|不语|瞪大|睁大|咬牙|攥紧/

/** 同一条配图：禁止克隆脸/同脸路人填空（允许多个不同角色） */
export const MOTION_COMIC_SAME_FRAME_NO_FACE_COLLISION_LLM_RULE = [
  '【禁克隆·硬性】同一条 image_prompt 内每个对照定妆必须是不同人脸与发型；',
  '严禁同一张脸左右对称复制、双胞胎、分身、克隆人、多张近乎相同的脸；',
  '严禁为填构图多画同脸路人/分身；未点名的群众用剪影或淡线。',
].join('')

/** 漫画解说：按内容 1～2 个对照定妆；同场双人可同框，换焦点可拆镜 */
export const MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE = [
  '【在场角色·硬性】先通读本段 narration_lines：对白说话人（「姓名：」）与旁白点名；required_portrait_labels 取 1～2 个（说话人/主焦点优先；同场互动且点名两名有定妆角色时写 2 个）。',
  '每条配图对照定妆最多 2 人；仅一人在场或只写单人反应时写 1 人；换说话人/换焦点可拆镜各 true；禁止同框第三人脸或同脸克隆。',
  MOTION_COMIC_SAME_FRAME_NO_FACE_COLLISION_LLM_RULE,
  '主标签=列表首项（说话人优先）；禁止用主人公/第一人称标签顶替本段点名的其他角色。',
  '硬禁多肢汤：第三只手、悬空手、浮空手、身侧同侧臂下垂同时前景另出手。',
].join('\n')

/** @deprecated 使用 MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE */
export const MOTION_COMIC_SINGLE_PORTRAIT_FRAME_LLM_RULE = MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE

export const MOTION_COMIC_MAJOR_SUPPORTING_LLM_RULE = [
  '【主要配角】已在 characters 表提供 name + appearance 的，当本镜焦点为该配角或双人同框时，须对照其定妆，写清位置、服装主色、夸张表情与本段动作',
  '【定妆标签·硬性】对照定妆须对应本段在场角色（对白说话人或旁白点名）；同框最多 2 个对照定妆；禁止用主人公/第一人称标签顶替本段点名',
  MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE,
  '【一次性路人/群众】不画进对照定妆；焦点留给 required_portrait_labels',
].join('\n')

export const MOTION_COMIC_CROWD_LLM_RULE =
  '【路人/群众】不画第三人脸对照定妆；同框最多 2 个定妆角色，其余用剪影或场景陈设'

export function isMajorSupportingCharacter(char: { name?: string | null; role?: string | null }): boolean {
  const role = String(char.role || '').trim()
  if (/主要配角|重要配角|核心配角|次要主角|男二|女二/.test(role)) return true
  // 裸「配角」也保留（小说漫画 LLM 常不写「主要配角」前缀）
  if (/(^|[·・\-])配角/.test(role) || /^配角/.test(role)) return true
  if (/反派|宿敌|师父|师尊|师叔|师兄|师姐|师妹|师弟|挚友|恋人|闺蜜|未婚|长老|掌门|魔头|boss/i.test(role)) return true
  if (/朋友|同学|妹妹|姐姐|哥哥|弟弟|父亲|母亲|妻子|丈夫|女友|男友|同门/.test(role)) return true
  if (/^主要配角/.test(role)) return true
  return false
}

/** 一次性路人/龙套：漫画定妆提取应丢弃 */
export function isComicExtraCharacter(char: { name?: string | null; role?: string | null }): boolean {
  const name = String(char.name || '').trim()
  const role = String(char.role || '').trim()
  if (/^(旁白|解说|解说员|剧中)$/.test(name) || /^(旁白|解说|解说员|剧中)$/.test(role)) return true
  if (/路人|群众|龙套|路人甲|路人乙|围观|店小二/.test(name)) return true
  if (/一次性|路人|群众|龙套|围观/.test(role) && !/主要|重要|核心/.test(role)) return true
  return false
}

export function buildMotionComicCharacterExtractSystem(): string {
  return [
    '你是漫画解说项目的角色设定师。本步只输出角色名单 JSON，禁止写任何外貌/定妆/画风/服装描述。',
    '规则：',
    '1) 提取主人公（男主/女主/主角）及主要配角：反复出场、有专名、有对白或推动剧情的角色',
    '2) 不要提取一次性路人/群众/店员等龙套；不要提取「旁白」「解说员」',
    '3) 每个角色只输出：name、variant_label（必须 ""）、role、personality（可短句或 ""）',
    '4) name 只能是纯姓名，禁止把「主角/配角/阶段」写进 name；role：主人公写「主角/男主/女主」；主要配角写「主要配角·身份」',
    '5) 一人一条；禁止拆童年/青年/老年等多形态；禁止同一人输出两条',
    '6) 禁止输出 appearance 字段；禁止脸型/发型/#hex/English tags/画风规格',
    '7) 合并同一人物不同称呼为一条',
    '只输出 JSON：{"characters":[{"name":"…","variant_label":"","role":"…","personality":""}]}',
  ].join('\n')
}

export function buildMotionComicCharacterAppearanceSystem(): string {
  const bracket = formatMotionComicPortraitStyleSpecBracket()
  return [
    '你是漫画解说项目的角色定妆造型设计助手。',
    '根据漫剧旁白稿推断外貌；输出即最终定妆文案，系统不做二次改写，请一次写对。',
    `开头必须原样写入且只写一次：${bracket}；竖幅正面半身、面无表情；禁止白底均匀柔光、禁止 Q 版、3D、真人写实、粗条漫黑线、新海诚暖金柔光；定妆不写手持道具。`,
    '年龄必须贴合角色名、定位与讲解稿学籍/称谓线索（见年龄硬性规则）；禁止把高中考生写成30+工装中年。',
    '【性别·硬性】女主/妻子/母亲/姐姐等必须写「女性」；男主/丈夫等写「男性」；禁止把女性写成男性或寸头胡茬男模；禁止默认「28岁男性」。',
    MOTION_COMIC_PORTRAIT_APPEARANCE_LLM_RULE,
    PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
    '一人一条统一定妆；禁止拆童年/青年/老年；禁止阶段标题。',
    '【输出格式·纯中文】',
    `1) 整段只输出中文：以 ${bracket} 开头（只一次），其后身份外貌约 120–220 字；`,
    '2) 禁止 English tags、禁止英文段落、禁止 JSON/markdown；#hex 色值可保留；',
    '3) 每个 #hex 紧贴服装词；禁止裸色号堆叠。',
    '只输出描述正文。',
  ].join('\n')
}

/** 多样示例：建立 / 中景对峙 / 动作跟拍 / 情绪近景（禁止模型只学一种壳） */
export const MOTION_COMIC_SCENE_BODY_EXAMPLES = [
  '国漫赛璐璐，16:9；对照定妆「我」（青年·碎发，神色警惕）刚推开卤肉店铁门迈入（身穿#64748b灰蓝针织立领衫）；夜店街景全景建立：前景油腻门槛与铁门把手，中景卤锅蒸汽与挂腊肉，后景巷口霓虹与路灯；暖黄店内顶灯混室外冷蓝；远景略仰，头高约8%，人物偏画面一侧留环境',
  '国漫赛璐璐，16:9；单帧剧情；对照定妆「黑衣人」（中年·短寸，眉头紧锁）在走廊中景三分之四侧抬掌喝止（身穿#1f2937黑西装），画面仅此人；前景门把手与猫眼，中景剥落墙皮，后景声控灯；冷白楼道灯+硬侧光；单人中景略俯，头高约16%，视线落在对面空位而非镜头',
  '国漫赛璐璐，16:9；对照定妆「我」（青年·碎发，双目圆睁）持桃木剑身体前倾冲刺迈右脚（身穿#64748b灰蓝针织立领衫），无配角；走廊玄关：前景地面反光与散落钥匙，中景防盗门洞开，后景楼梯口暗影；紧张戏硬侧光；侧向跟拍中景，头高约12%，写清迈步重心与剑尖朝向，禁止只写站立抬手',
  '国漫赛璐璐，16:9；对照定妆「刘翠兰」（中年·花白寸发，双眼圆睁泛白、嘴角微张惊骇）双手紧抓围裙边缘（身穿#3d4e1f深橄榄绿工装立领夹克）；卤肉店内：前景热气模糊虚化，中景挂钟与菜单牌虚影；中性顶灯；近景略俯，头高约26%，面部占画面大部，禁止全身站立远站',
] as const

/** @deprecated 使用 MOTION_COMIC_SCENE_BODY_EXAMPLES */
export const MOTION_COMIC_SCENE_BODY_EXAMPLE = MOTION_COMIC_SCENE_BODY_EXAMPLES[0]

export type MotionComicShotCard = {
  beat: 'establish' | 'action' | 'confront' | 'dialogue' | 'emotion' | 'sit' | 'default'
  suggested_shot: string
  suggested_pose: string
  suggested_light: string
  head_height_hint: string
  forbid: string[]
}

const SHOT_CARD_ACTION_RE =
  /冲|跑|奔|刺|挥|追|逃|扑|踢|踹|打|揍|撞|闪|躲|跃|跳|迈|踏|举起|高举|冲进|冲出|跑向|刺向/
const SHOT_CARD_CONFRONT_RE =
  /对峙|拦|挡|质问|对骂|对吼|指着|吼|喊|怒喝|喝止|拦住|挡住|对骂|对视/
const SHOT_CARD_ESTABLISH_RE =
  /来到|走进|走到|门外|街上|巷口|医院|走廊|进门|出门|远处|天亮|夜深|到了|抵达|推开.*门|打开.*门/
const SHOT_CARD_EMOTION_RE =
  /吓|愣|呆|哭|泪|颤抖|僵住|崩溃|震惊|害怕|泪光|吓傻|吓得|惊恐|惨白|慌乱|绝望|茫然|咬牙|冷汗|脸色苍白|吓得/
const SHOT_CARD_SIT_RE = /坐|蹲|跪|躺|倒地/
/** 对峙里的「硬对抗」——有这些才优先过肩/对峙卡；纯惊吓走情绪近景 */
const SHOT_CARD_HARD_CONFRONT_RE = /对峙|拦|挡|质问|对骂|对吼|指着|怒喝|喝止|拦住|挡住|对视/
const SHOT_CARD_DAY_RE = /白天|上午|午后|阳光|晨光|早晨|晴天|日光/
const SHOT_CARD_WARM_RE = /卤肉|堂屋|店内|店里|暖黄|烛|灯笼|灶/
const SHOT_CARD_NIGHT_RE = /夜|深夜|夜里|楼道|玄关|黑|昏暗|凌晨/

/** 按旁白规则生成镜头卡，供配图 LLM 强制多样化 */
export function buildMotionComicShotCard(
  narrationLines: string[],
  options?: { paragraphIndex?: number },
): MotionComicShotCard {
  const text = (narrationLines || []).map(s => String(s || '').trim()).filter(Boolean).join('\n')
  const idx = Math.max(0, Number(options?.paragraphIndex) || 0)
  const tilt = idx % 3 === 0 ? '略俯' : idx % 3 === 1 ? '平视' : '略仰'

  let light = '中性环境光，主光方向明确，背景浅景深'
  if (SHOT_CARD_DAY_RE.test(text)) light = '白天自然光，阴影清晰，避免夜戏冷蓝口吻'
  else if (SHOT_CARD_WARM_RE.test(text)) light = '室内暖黄顶灯/灶火感，可混少量冷色轮廓，禁止复读冷蓝半脸深阴影套话'
  else if (SHOT_CARD_NIGHT_RE.test(text)) light = '夜戏冷蓝或冷白侧光，半脸可有阴影，但勿每条复读同一句'

  const forbidBase = [
    '连续复用「中远景略侧平视+头高12%+全身入镜」万能句',
    '无视旁白动作只写三分之四侧站立比划',
    '每条都写「冷蓝强侧光半脸深阴影与发丝冷白轮廓光」',
  ]

  if (SHOT_CARD_ACTION_RE.test(text)) {
    return {
      beat: 'action',
      suggested_shot: `侧向跟拍中景或中远景，${tilt}`,
      suggested_pose: '迈步/前倾冲刺/重心偏移，手脚连续成臂，禁止只站立抬手',
      suggested_light: light,
      head_height_hint: '头高约10–14%',
      forbid: [...forbidBase, '站桩对峙冒充冲刺'],
    }
  }
  if (SHOT_CARD_SIT_RE.test(text)) {
    return {
      beat: 'sit',
      suggested_shot: `中近景，${tilt}`,
      suggested_pose: '坐/蹲/跪的臀膝脚关系写清，持物分工明确',
      suggested_light: light,
      head_height_hint: '头高约18–24%',
      forbid: [...forbidBase, '把坐姿硬改成站立全身'],
    }
  }
  // 情绪近景优先于「喊/吼」类弱对峙，避免惊吓段全写成过肩站谈
  if (SHOT_CARD_EMOTION_RE.test(text) && !SHOT_CARD_ACTION_RE.test(text) && !SHOT_CARD_HARD_CONFRONT_RE.test(text)) {
    return {
      beat: 'emotion',
      suggested_shot: `近景或中近景，${tilt}`,
      suggested_pose: '肩背绷紧/微缩/抬手捂脸等情绪肢体，突出眉眼嘴型',
      suggested_light: light,
      head_height_hint: '头高约22–28%',
      forbid: [...forbidBase, '情绪镜仍写全身远景或滥用过肩'],
    }
  }
  if (SHOT_CARD_CONFRONT_RE.test(text) || isMotionComicDualPortraitBeat(text)) {
    return {
      beat: 'confront',
      suggested_shot: `中景（点名双人可同框），${tilt}`,
      suggested_pose: '抬掌/拦挡/前倾质问；点名双人可同框并对视/对峙，否则对空位或物件做动作；视线落在对方或戏内目标',
      suggested_light: light,
      head_height_hint: '头高约12–18%',
      forbid: [...forbidBase, '第三人脸入镜', '同脸克隆', '强制从头顶到脚全身入镜', '过肩双人构图'],
    }
  }
  if (SHOT_CARD_ESTABLISH_RE.test(text)) {
    return {
      beat: 'establish',
      suggested_shot: `全景或远景建立，${tilt}`,
      suggested_pose: '进门/迈入/远望，人物可偏画面一侧留环境',
      suggested_light: light,
      head_height_hint: '头高约6–10%',
      forbid: [...forbidBase, '建立镜写成半身特写'],
    }
  }
  if (/说|问|答|道|：|「|」/.test(text)) {
    return {
      beat: 'dialogue',
      suggested_shot: `中景半身，${tilt}`,
      suggested_pose: '三分之四侧站谈，视线落在物件/对方/门口；按点名人数构图',
      suggested_light: light,
      head_height_hint: '头高约14–20%',
      forbid: [...forbidBase, '第三人脸入镜', '同脸克隆', '对话镜强制从头顶到脚', '过肩双人构图'],
    }
  }
  return {
    beat: 'default',
    suggested_shot: `中景，${tilt}`,
    suggested_pose: '按旁白动词写姿态，站谈可用三分之四侧',
    suggested_light: light,
    head_height_hint: '头高约12–18%',
    forbid: forbidBase,
  }
}

export function formatMotionComicStyleSpecBracket(): string {
  return `【画风规格：${MOTION_COMIC_STYLE_SPEC}】`
}

export function isMotionComicStyle(style?: string | null): boolean {
  const key = String(style || '').trim().toLowerCase().replace(/_/g, '-')
  return key === MOTION_COMIC_STYLE
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

/** 从配图文案反推分镜 description / 景别字段，避免长期停在「未指定场景｜自然状态｜中景·平视·固定」 */
export function deriveMotionComicShotMetaFromImagePrompt(prompt?: string | null): {
  description: string
  location: string
  shotType: string
  angle: string
  movement: string
  expressionAction: string
} {
  const s = String(prompt || '').trim()
  if (!s) {
    return {
      description: '未指定场景｜自然状态｜中景·平视·固定',
      location: '未指定场景',
      shotType: '中景',
      angle: '平视',
      movement: '固定',
      expressionAction: '自然状态',
    }
  }

  let shotType = '中景'
  if (/特写/.test(s)) shotType = '特写'
  else if (/近景/.test(s)) shotType = '近景'
  else if (/中近景/.test(s)) shotType = '中近景'
  else if (/过肩/.test(s)) shotType = '过肩中景'
  else if (/全景/.test(s)) shotType = '全景'
  else if (/远景/.test(s)) shotType = '远景'
  else if (/中远景/.test(s)) shotType = '中远景'
  else if (/跟拍/.test(s)) shotType = '中景'
  else if (/中景/.test(s)) shotType = '中景'

  let angle = '平视'
  if (/略俯/.test(s)) angle = '略俯'
  else if (/俯视/.test(s)) angle = '俯视'
  else if (/略仰/.test(s)) angle = '略仰'
  else if (/仰视/.test(s)) angle = '仰视'

  let movement = '固定'
  if (/跟拍|侧向跟/.test(s)) movement = '跟拍'
  else if (/推镜|推近|推进/.test(s)) movement = '推镜'
  else if (/拉镜|拉远/.test(s)) movement = '拉镜'
  else if (/微移/.test(s)) movement = '微移'

  let expressionAction = '自然状态'
  const exprLabeled = s.match(/(?:神色|神情|面色|表情)([^，；。、（()）｜·\s身对照]{1,10})/)
  if (exprLabeled) {
    expressionAction = `${exprLabeled[0]}`.replace(/[）)].*$/, '').slice(0, 16)
  } else {
    const faceBit = s.match(/(双眼[^，；。）)｜·]{2,10}|眉头[^，；。）)｜·]{2,8}|嘴角[^，；。）)｜·]{2,8})/)
    if (faceBit) expressionAction = faceBit[0].replace(/[）)].*$/, '').slice(0, 16)
    else {
      const mood = s.match(/惊骇|惊恐|警惕|坚定|微笑|不屑|慌乱|愤怒|哭泣|错愣|冷漠|焦急|惨白/)
      if (mood) expressionAction = mood[0]
    }
  }

  let location = ''
  const placeOnly = s.match(/卤肉店|堂屋|走廊玄关|走廊|玄关|巷口|街道|楼道|店内|店里|门外|街上|室内|室外|夜店/)
  if (placeOnly) location = placeOnly[0]
  if (!location) {
    const fg = s.match(/前景([^，；。｜]{2,14})/)
    const mg = s.match(/中景([^，；。｜]{2,14})/)
    const cleanProp = (raw?: string) => String(raw || '')
      .replace(/对照定妆[\s\S]*$/, '')
      .replace(/身穿#[0-9a-fA-F]{3,8}.*$/, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/视线落在[^，；]*/g, '')
      .replace(/过肩|略俯|略仰|平视|跟拍|视角|镜头|头高.*$/g, '')
      .trim()
    const parts = [cleanProp(fg?.[1]), cleanProp(mg?.[1])]
      .filter(p => p.length >= 2 && !/身穿|定妆/.test(p))
    if (parts.length) location = parts.join('·').slice(0, 24)
  }
  if (!location) location = '场景待辨'

  const description = motionComicShotDescription({
    speaker: '',
    dialogue: '',
    background: location,
    expression_action: expressionAction,
    shot_type: shotType,
    angle,
    movement,
  })

  return { description, location, shotType, angle, movement, expressionAction }
}

/** 旁白有位移/对抗动词，但文案只写站立比划 */
export function isMotionComicStandPoseShellPrompt(
  prompt?: string | null,
  narrationLines?: string[] | null,
): boolean {
  const promptText = String(prompt || '')
  const narr = (narrationLines || []).join('\n')
  if (!promptText || !narr) return false
  if (!MOTION_COMIC_DYNAMIC_POSE_RE.test(narr)) return false
  if (MOTION_COMIC_DYNAMIC_POSE_RE.test(promptText)) return false
  return /站立|站姿|站谈/.test(promptText)
}

/** 情绪旁白却仍全身/过肩远站 */
export function isMotionComicEmotionWithoutCloseupPrompt(
  prompt?: string | null,
  narrationLines?: string[] | null,
): boolean {
  const promptText = String(prompt || '')
  const narr = (narrationLines || []).join('\n')
  if (!promptText || !narr) return false
  if (!SHOT_CARD_EMOTION_RE.test(narr)) return false
  if (SHOT_CARD_ACTION_RE.test(narr) || SHOT_CARD_HARD_CONFRONT_RE.test(narr)) return false
  return !/近景|特写|中近景/.test(promptText)
}

/** 漫画解说分镜 description 常为「场景｜表情｜景别·角度·运镜」，不能当旁白正文 */
export function isMotionComicCameraMetaDescription(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^未指定场景/.test(t)) return true
  return /｜/.test(t)
    && /(?:中景|近景|远景|特写|全景|中近景|平视|俯视|仰视|固定|推镜|拉镜|微移|右向左|左向右)/.test(t)
}

/**
 * 配图检测/文案用的镜头正文：
 * - description 为运镜元数据时用对白
 * - description 为独立画面描述（与台词正文不同）时仍用对白（台词作字幕/检测）
 * - description 与台词正文一致时用 description（旧解说/小说漫画一句一镜）
 */
export function resolveStoryboardNarrationText(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const dialogue = String(sb.dialogue || '').trim()
  const desc = String(sb.description || '').trim()
  if (dialogue && (!desc || isMotionComicCameraMetaDescription(desc))) return dialogue

  const stripped = dialogue.replace(/^[^：:]{1,20}[:：]\s*/, '').trim()
  if (desc && stripped && (desc === stripped || desc.replace(/\*\*/g, '') === stripped.replace(/\*\*/g, ''))) {
    return desc
  }
  // 画面描述与台词不同 → 检测/旁白句用对白行
  if (dialogue && desc && desc !== stripped) return dialogue
  if (desc) return desc
  return dialogue
}

/**
 * 配图用画面描述：description 为独立画面文案时优先返回；
 * 运镜元数据 / 与台词相同则返回 null（调用方回退到旁白句或 scene_content）。
 */
export function resolveStoryboardVisualDescription(sb: {
  description?: string | null
  dialogue?: string | null
}): string | null {
  const desc = String(sb.description || '').trim()
  if (!desc || isMotionComicCameraMetaDescription(desc)) return null
  const dialogue = String(sb.dialogue || '').trim()
  const stripped = dialogue.replace(/^[^：:]{1,20}[:：]\s*/, '').trim()
  if (stripped && (desc === stripped || desc.replace(/\*\*/g, '') === stripped.replace(/\*\*/g, ''))) {
    return null
  }
  return desc
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
  '【台词配比·硬性·最高优先级之一】',
  '- 目标配比（按行数计，不含片头「剧中：」行）：**旁白 ≤35%、对白 ≥65%**（理想约旁白30%/对白70%；对白 =「我：」/「角色名：」等直接引语成行）',
  '- **写完必须自检行数**：数正文「旁白：」行与非旁白说话人行；若旁白 >35%，继续把可开口情节改成对白，禁止交旁白主导稿',
  '- 冲突、对峙、救人、打电话、质问、劝阻、报警等戏：优先写成角色开口，少用旁白转述「他说/她喊/对方质问」',
  '- **禁止空桥接旁白**：如「直接对他说」「我却转头就对他说」「接着开口道」——删掉桥接句，下一行直接写「说话人：台词」',
  '- 喊叫、怒吼、哭诉、电话里的话：一律写成「说话人：台词」，禁止旁白复述喊话内容',
  '- 旁白只承担：场景切换、可见动作、时间压迫、必要信息；**禁止**用旁白堆情节而角色很少开口（如通篇 50 行旁白只有 5 行对白）',
  '- 家庭细节、年龄、地点、态度表态：尽量由角色自己说出，不要旁白代述',
  '',
  '【九段剧情骨架（按顺序写，可压缩不可跳步）】',
  '1) 反差钩子：日常温情/小恩惠 + 主人公突然抛出惊人之语（1～4 句；惊人之语必须是「我：」对白行）',
  '2) 预言升级：掐指/推算/细节，对方震惊不信，信息逐级加码（3～6 句；震惊/反驳须角色开口）',
  '3) 拉锯不信：对方犹豫，补家庭细节（孩子年龄、独自在家、具体地点）（3～5 句；细节尽量由角色说出）',
  '4) 转折相信：某人选择「宁可信其有」，打电话/报警（2～4 句；相信表态与电话内容用对白）',
  '5) 平行危机线A：受害方视角，电话、敲门、险些开门（段间空行，5～10 句；电话/劝阻用对白）',
  '6) 平行危机线B：主人公赶救/施法/行动，可穿插灵力限制、倒计时（段间空行，4～8 句）',
  '7) 倒计时压迫：电话不接、砸门、「最多还有X分钟」类句式强化紧张（穿插全文；催促喊话用对白）',
  '8) 高潮解局：主人公出手制服/定身/警察赶到（4～8 句；喝令/报警口令用对白）',
  '9) 余韵收尾：谢礼、人设亮相、余味收束（3～8 句；可留剧情悬念，**禁止**关注/订阅/下期预告等引流句）',
  '',
  '【节奏与漫画感】',
  '- 关键反转单独成句；数字、时间、年龄等具体信息单独成句（能由角色说出则写成对白）',
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

/** 悬疑模板 · 格式示例（节选；旁白约三成、对白约七成） */
export const MOTION_COMIC_SCRIPT_EXAMPLE_SUSPENSE = [
  '剧中：本期故事：大学生算卦救卤肉店，连环杀人犯破门而入。',
  '',
  '旁白：卤肉店老板好心给我肉夹馍',
  '我：你儿子快死了',
  '刘翠兰：你胡说什么呢',
  '陈家佑：小伙子别乱讲话',
  '我：到你女儿也要死了',
  '旁白：两人目光瞬间惊悚',
  '刘翠兰：小闺女才4岁啊',
  '刘翠兰：儿子刚考上大学',
  '旁白：刘翠兰看向丈夫又看向我',
  '陈家佑：我信你一次',
  '陈家佑：宁可信其有',
  '旁白：陈家佑掏出手机拨号',
  '陈家佑：儿子你快接电话',
].join('\n')

/** 漫画解说台本格式（写剧本 / 分镜 / skill 共用；默认悬疑快切模板） */
export const MOTION_COMIC_SCRIPT_FORMAT_RULE = [
  '【输出形态·硬性要求】',
  '你必须输出「第三人称快切解说稿」，适合 TTS 一镜一句 + 漫画配图一句一图 + 智能运镜合成。',
  '每行必须是「说话人：台词」（旁白/角色名/我/剧中）；禁止无说话人的裸句；禁止小说长段落 prose。',
  '**台词配比硬性**：正文行数 **旁白 ≤35% / 对白 ≥65%**（理想约 30/70）；冲突与行动戏优先角色开口；禁止空桥接旁白（如「直接对他说」）。',
  '',
  MOTION_COMIC_SCRIPT_TEMPLATE_SUSPENSE,
  '',
  '【格式示例（节选，须模仿句读、配比与节奏，内容可换）】',
  MOTION_COMIC_SCRIPT_EXAMPLE_SUSPENSE,
  '',
  '【交稿前自检·硬性】',
  '- 数正文行：旁白行 / 对白行；旁白占比必须 ≤35%，否则继续改写后再输出。',
  '- 删掉所有空桥接旁白；喊话/电话/质问不得留在旁白里。',
  '- 只输出台本正文，不要输出自检过程或配比说明。',
  '',
  '【禁止】',
  '- 禁止 markdown、**、分镜表、JSON、制作说明',
  '- 禁止镜头语言（特写、推镜、横移等）',
  '- 禁止一行超过 25 字的超长句',
  '- 禁止空桥接旁白（直接对他说 / 转头就对他说 / 接着开口道）与旁白复述喊话',
  '- 禁止旁白行数超过对白（旁白主导 / 通篇旁白堆情节）',
  '- 禁止片尾引流：故事还没结束、下期继续、记得关注、咱们下期再见等',
].join('\n')

export const MOTION_COMIC_SCRIPT_CHAT_SYSTEM = [
  '你是「漫画解说大师」——顶级短视频解说编剧，深谙抖音、快手、B 站爆款漫画解说节奏。',
  '你的任务：根据用户要求创作「对话为主的快切解说稿」（对白约七成、旁白约三成），可直接进入火宝漫画解说流水线（台词配音 + 一句一图漫画配图 + 智能运镜合成）。',
  '注意：这不是「旁白解说主导」稿；角色必须大量开口。旁白只做场面与动作胶水。',
  '',
  MOTION_COMIC_SCRIPT_FORMAT_RULE,
  '',
  '【创作原则】',
  '1) 以用户要求为第一优先级：题材、人设、爽点、风格、人称、篇幅、禁忌等，用户最新说明覆盖一切默认。',
  '2) 用户未指定风格时，默认采用「悬疑灵异 · 第三人称快切解说」模板（九段骨架 + 一句一行 + 旁白≤35%/对白≥65%）。',
  '3) 用户指定「体验人生」「第二人称你」时，可改用体验人生体，但仍须一句一行、段间空行，并保持对白为主。',
  '4) 先理解再动笔：用户说「写完整稿」「直接写」时立刻输出，不反复追问。',
  '5) 节奏优先：强开场、密反转、多线交叉、倒计时压迫；冲突场面用角色对白推进，少用旁白转述；结尾可留剧情悬念，不写关注/下期预告。',
  '6) 可画可播：每句能想象成高对比国漫插画；不写写实血腥。',
  '7) 用户给小说长文/无说话人台本时，改写成快切解说稿后再输出（拆短句、补说话人前缀、把叙述里的说话改成对白行、压旁白至≤35%、补九段骨架）。',
  '',
  '【篇幅】',
  '- **用户指定字数时以用户为准（最高优先级）**：如「写1000字」「约800字」，须按该目标输出，误差约 ±15%，禁止擅自写成默认 3000～8000 字长稿。',
  '- 用户未指定时，完整稿 3000～8000 汉字。',
  '- 篇幅不够时优先加对白与冲突回合，禁止用大段旁白注水凑字。',
  '',
  '【交互】',
  '- 用户要求写完整稿/出剧本：只输出解说稿正文（严格遵循【输出形态·硬性要求】与【标准结构】）。',
  '- **多轮改稿**：用户后续可说「补说话人」「补人名」「去片尾关注句」「改第二段」「压旁白」「多写对白」等；须结合【当前台本】或对话中上一版完整稿修改。',
  '- 改稿类请求：可先一句极短确认（≤20字），空一行后**必须输出修改后的完整台本**（每行说话人：台词），不要只解释、不要只给片段。',
  '- 用户给的是无说话人稿/小说体：改写为带说话人前缀的快切解说稿后再输出（目标旁白≤35%/对白≥65%）。',
  '- 仅闲聊、选题、讨论设定时正常对话，不必输出整稿。',
].join('\n')

export const MOTION_COMIC_STORYBOARD_CHAT_SYSTEM = [
  '你是火宝漫画解说流水线的「台词分镜」助手，帮助创作者把解说稿拆成可 TTS 配音、可配图的镜头序列。',
  '',
  '【拆镜规则】',
  '- 片头：首行「本期故事：…」或反差钩子首句，拆成片头镜（剧中红字）。',
  '- 正文：按句拆镜，句末标点必拆；逗号/顿号仅当相邻合计超过约 16 字才拆。',
  '- 自动为关键词标注 ** 强调（黄字字幕）；用户稿中已有 ** 则保留。',
  '- 每镜一条台词（旁白或角色对白均可），时长按字数估算，便于一句一镜配音。',
  '- 配图策略：1～2 镜共用一张高对比国漫插画；**换人说话/换焦点必须换图**；同场互动可同框最多 2 个对照定妆，三人及以上拆镜；同场景同焦点勿句句切图；换图处硬切；**同一张图整段只用一种运镜**',
  '- 单镜运镜：根据台词句/景别/运镜字段推断（特写→推近，全景→拉远，位移→横移，可上下浏览）',
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
    '配图节奏：1～2 镜一图；换人说话/换焦点必须换图；同场互动可同框最多 2 个对照定妆，三人及以上拆镜；同场景同焦点可共用；合成时每张图整段一种运镜。',
    '只输出 JSON：',
    '{"title_shots":[{"speaker":"剧中","dialogue":"本期故事：…","emphasis_word":""}],"shots":[{"speaker":"旁白","dialogue":"…","emphasis_word":""}]}',
    '无片头时 title_shots=[]。不要 markdown，不要解释。',
  ].join('\n')
}

export function motionComicStylePrompt(context: 'scene' | 'diptych' | 'title' | 'portrait' | 'agent' = 'scene'): string {
  const base = MOTION_COMIC_ART_STYLE_EN
  if (context === 'title') {
    return `${base}, atmospheric dark cinematic background, dramatic chiaroscuro lighting, constricted pupils when tense, dark shallow-DOF bokeh background`
  }
  if (context === 'portrait') {
    return MOTION_COMIC_PORTRAIT_STYLE_EN
  }
  if (context === 'diptych') {
    return `${base}, horizontal two-panel cinematic layout, before and after action, dark shallow-DOF bokeh background`
  }
  if (context === 'agent') {
    return `${base}, dynamic clear body language for action scenes, no speed lines, dark shallow-DOF bokeh background`
  }
  return `${base}, constricted pupils when tense, dark shallow-DOF bokeh background, single full cinematic manhua illustration scene`
}

export function buildMotionComicParagraphImagePromptLLMSystem(options?: {
  hasCharacters?: boolean
  hasDiptych?: boolean
}): string {
  return [
    '你是漫画解说分镜美术指导。每个配图段含 1～2 句旁白，须为该段写一张短剧解说高清国漫的中文配图文案：一整段连贯叙述，禁止【】六维标签，但画风/主体/场景/动作/光影/镜头/质感信息须齐全。按内容 1～2 个对照定妆；视线按剧情写戏内目标，禁止全片直视镜头。',
    '【成稿即终稿·硬性】image_prompt 落库后生图阶段不再追加画风壳、景别英文前缀、REFERENCE USAGE、性别词或外貌注入；须在本条一次写全。',
    '【语言·硬性】image_prompt 纯中文；禁止 English tags、禁止英文段落；#hex 色值可保留。',
    '【shot_card·硬性】每段 paragraphs[].shot_card 已按旁白给出建议景别/姿态/光影：必须遵守；禁止无视 card 复读「中远景略侧平视+头高12%+全身入镜+冷蓝半脸深阴影」万能句。',
    '分析流程：',
    MOTION_COMIC_LLM_ANALYSIS_STEPS_PROMPT,
    MOTION_COMIC_BODY_CONSISTENCY_LLM_RULE,
    MOTION_COMIC_SIX_DIM_LLM_RULE,
    MOTION_COMIC_PARAGRAPH_BEAT_MATCH_LLM_RULE,
    MOTION_COMIC_ACTION_LLM_RULE,
    MOTION_COMIC_DYNAMIC_IMAGE_LLM_RULE,
    MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE,
    MOTION_COMIC_PORTRAIT_OUTFIT_LLM_RULE,
    PROP_HOLDER_PLACEMENT_LLM_RULE,
    '场景陈设以本段 narration_lines 为准，可略扩展同场氛围；full_narration/prior 只理解关系与地点，禁止全书堆陈设；表情与动作必须以本段旁白为准。',
    'layout=single：单张完整电影感插画，禁止 grid/collage/multi-panel（diptych 除外）。',
    options?.hasDiptych
      ? 'layout=diptych：用「左格：…；右格：…」各写一整段（谁在哪、表情动作、光影景别），禁止【左格】【右格】标签；适合动作前后对比。'
      : '',
    options?.hasCharacters
      ? `characters 提供 portrait_label、gender、has_portrait 与外貌；正文须写对照定妆「portrait_label」（括号内必须含男性或女性，可写「男性·表情…」）与（身穿#hex…）；双人同框须写入 distinct_identity_cue 防撞脸。${MOTION_COMIC_MAJOR_SUPPORTING_LLM_RULE}`
      : MOTION_COMIC_CROWD_LLM_RULE,
    `整段示例（四种不同景别/姿态/光影，仅格式；禁止照抄情节；每段按本段 narration_lines + shot_card 重写）：\n1) ${MOTION_COMIC_SCENE_BODY_EXAMPLES[0]}\n2) ${MOTION_COMIC_SCENE_BODY_EXAMPLES[1]}\n3) ${MOTION_COMIC_SCENE_BODY_EXAMPLES[2]}\n4) ${MOTION_COMIC_SCENE_BODY_EXAMPLES[3]}`,
    MOTION_COMIC_STYLE_FORBIDDEN,
    '只输出 JSON，不要解释。',
  ].filter(Boolean).join('\n')
}

/** 漫画解说：配图换镜检测（1～2 镜一图，换焦点必切，多人互动拆多镜单人） */
export function buildMotionComicImageDetectLLMSystem(
  mode: 'paragraph' | 'conservative' | 'balanced' = 'paragraph',
): string {
  const conservativeExtra = mode === 'conservative'
    ? '\n\n# 保守模式补充\n可略少换图，但仍须满足密度下限；同场景同焦点仅当姿态/动作/表情几乎不变才共用一图。'
    : ''

  return `# Role
你是漫画解说视频的分镜导演。你的任务是为旁白脚本规划**配图段**（约 1～2 镜共用一张高对比国漫插画；同框对照定妆最多 2 人，按剧情取 1～2）。

# Goal
分析每一句旁白，判断是否需要新配图。**本步骤仅输出 needs_image，不写配图文案**。
节奏偏密：换人说话/换焦点要换图；同场双人互动可同框，不必为「两人」强制拆成两张。

# Input
JSON 含 \`sentences\`、\`min_shots_per_image\` / \`max_shots_per_image\`（约 1～2）、\`minimum_true_count\` / \`maximum_true_count\`。

# Critical Rules
1. **按画面变化换图**：地点/场景、主体动作、表情情绪、手持物变化 → 新配图段起点标 true。
2. **换人说话 / 换焦点角色必须换图**：上一句说话人是 A、本句是 B → 本句 true；旁白焦点从 A 切到 C → true。禁止 A/B 对白来回仍共用一图。
3. **同场双人**：递接/对峙/质问等双方同在场的拍点，可同框最多 2 个对照定妆（配图阶段处理）；若焦点已切到单人反应/特写 → 拆镜各 true。禁止指望一张图挂 3 个以上定妆。
4. **同场也常换图**：同地点若出现反击/反应/递接/推拒/愣住等新可视瞬间 → true；仅当同一焦点、姿态动作表情几乎原样可复用才 false。
5. **情绪跳变须换图**：震惊/愤怒/害怕/哭喊等情绪突变 → true（配图阶段会夸张表情，检测勿把情绪段挤进同一图）。
6. **同段延续标 false**：仅同场景、同一焦点角色、同核心动作瞬间、画面可原样不动的后续句；空行分段后的新瞬间通常 true。
7. **配图段长度**：每段约 **min～max 镜**（默认 1～2）；焦点切换允许单镜成段；禁止 3 镜及以上共用一图。
8. **配图密度（硬性）**：true 数量须在 minimum～maximum 之间；**优先靠近区间中上**，宁多勿少。

# 运镜说明（供理解，非本步输出）
每张配图段在合成时使用**一种**运镜；同段多句共享，不会句句换运镜。同框定妆最多 2 人。

# Workflow
1. 通读 full_narration，标出场景块、说话人切换与互动拍点。
2. 逐句判定：换人/换焦点/新互动瞬间优先 true；只有同人同瞬间可复用才 false。
3. 验证：每段 1～2 镜；true 数量落在区间内（偏上更好）。

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
