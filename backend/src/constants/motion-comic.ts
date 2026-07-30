/**
 * 漫画解说 — 画风规格、分镜规则、运镜预设
 * 制作方法：对话为主的快切解说（旁白约30%/对白约70%）+ 高对比国漫配图 + 智能运镜 + 配音字幕（零 I2V）
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
  { value: MOTION_COMIC_STYLE, label: '高对比国漫' },
] as const

/** 漫画解说：每张配图覆盖 2～3 镜（更密，避免同图拖太久） */
export const MOTION_COMIC_IMAGE_SEGMENT_MIN_SHOTS = 2
export const MOTION_COMIC_IMAGE_SEGMENT_MAX_SHOTS = 3

/** 漫画解说：配图锚点约占镜头数 40%～58%（约每 2 镜一张，观感更密） */
export const MOTION_COMIC_IMAGE_DETECT_MIN_STORYBOARD_RATIO = 0.4
export const MOTION_COMIC_IMAGE_DETECT_MAX_STORYBOARD_RATIO = 0.58
/** 后处理优先拉到的目标密度（落在 min～max 偏上） */
export const MOTION_COMIC_IMAGE_DETECT_TARGET_STORYBOARD_RATIO = 0.5

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
  const tags = tagsMatch?.[1]?.trim() || ''
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
  if (!body) {
    const bracketOnly = formatMotionComicPortraitStyleSpecBracket()
    return tags ? `${bracketOnly}\nEnglish tags: ${tags}` : bracketOnly
  }
  const withStyle = `${formatMotionComicPortraitStyleSpecBracket()}，${body}`
  return tags ? `${withStyle}\nEnglish tags: ${tags}` : withStyle
}

/** 提取/补全定妆 appearance：画风与配图一致 */
export const MOTION_COMIC_PORTRAIT_APPEARANCE_LLM_RULE = [
  `【定妆文案·画风规格·硬性】appearance 开头必须原样写入：${formatMotionComicPortraitStyleSpecBracket()}；须与配图同一套短剧解说高清国漫戏剧光，禁止改成白底均匀柔光/新海诚/京阿尼/水彩/厚涂/条漫/webtoon；`,
  '其后只写身份外貌（年龄或约略岁数/脸型/眉眼/发型/身形/#hex服装/标志特征/正面半身站姿）；五官与发型须国漫可辨：轮廓清晰、眉眼锋利、发块干净分明，禁止柔糊水彩五官、禁止万能男模棱角模板脸；',
    '【年龄·硬性】必须按角色名与定位写年龄段：名含伯/爷/爷爷或 role 含爷爷/老年 → 写约60–75岁老年男性（花白或稀疏白发、皱纹），禁止写成青年小伙/黑色碎发少年感；名含婶/阿姨或中年妇人 → 写约40–55岁；role 含父亲/母亲且非青年主角 → 优先中年脸（方正/成熟）与青年主角拉开；青年主角才写20–35岁；',
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
 * 漫画解说定妆对照：按文案点名/对白人数写对照定妆（不封顶）。
 * 不复用解说动漫的「每镜仅 1 个」硬规则。
 */
export const MOTION_COMIC_PORTRAIT_REFERENCE_LLM_RULE = [
  '【定妆对照·硬性】characters 含 portrait_label、gender、has_portrait、portrait_default_outfit、distinct_identity_cue；',
  'has_portrait=true 时正文须含：对照定妆「portrait_label」（distinct_identity_cue短辨识差 + 本镜细化表情）+ 位于{位置}以{姿态} +（身穿#hex本镜服装）；',
  '【辨识差·硬性】distinct_identity_cue 必须原样写入该角色括号靠前位置（如国字浓眉短寸·中年），禁止省略、禁止两名角色写相同辨识差、禁止自编与 cue 冲突的脸型发型；单人镜可只写表情，多人同框必须人人写出不同 cue；',
  '【同一配图禁撞脸】多人同框时每人必须不同脸不同发型，禁止双胞胎/克隆/同脸复制；服装同色也不能画成同一人；',
  '【在场人数】严格按本段 narration_lines / required_portrait_labels：点名或对白几人就画几人（不限人数）；≥2 人时禁止写无配角；1 人时可写无配角；禁止把未点名角色硬塞进画面；',
  '主标签须为列表首项（说话人优先，其次旁白点名）；禁止用主人公/第一人称标签顶替本段点名的其他角色；',
  '表情写在人物描述里，肢体动作写清可见动作，物件写入场景陈设；多人时动作须写清施受关系与左右手分工，禁止第三只手/悬空手；',
  '场所变化须换装；同一配图段内同一人物（身穿…）须一致；无定妆时须写性别。',
].join('')

/** 景别 / 视线 / 场景陈设硬性（解决半身正对镜头、场景空） */
export const MOTION_COMIC_CAMERA_GAZE_SCENE_LLM_RULE = [
  '【景别·硬性】禁止全片默认半身/中近景：站立、行走、进门、离去、指路、室外、对话站姿 → 一律写中景或中远景全身（头高约10–14%，双脚可见，须写「从头顶到脚完整入镜」）；新场所/时间跳转 → 全景或远景建立环境；双人互动 → 中景/过肩全身，头高≤14%；坐姿/蹲姿持物互动 → 才可用中近景（头高≤24%）；纯神情无动作 → 才允许近景。严禁「中近景+朝向上半身+头高18%+」万能句；站立严禁头高≥17%。',
  '【视线·硬性】必须写「视线落在{戏内目标}而非镜头」（对方脸/手腕/手机屏/账本/门外/猫眼等）；禁止「视线：A看向B」简写；禁止直视镜头、望向镜头、目视前方（无目标）、正面面向镜头摆拍；身体默认三分之四侧或侧面，禁止「正面站立」。',
  '【多人构图·硬性】≥2 人须左右或前后拉开站位（画面左/中/右或柜台前/后），禁止三人并排挤脸、禁止重叠站桩；≥3 人优先过肩（一人背影/侧影+对方正面）或一主两辅前后层次；须写「单帧剧情场景」，禁止白底定妆拼贴/角色设定表/多头拼贴。',
  '【场景布置·硬性】年代场景至少写出 5 个具体陈设点（含材质/颜色/状态），前中后景都要有可指认物件；按场所补功能陈设：卤肉店→砧板/卤锅/铁钩腊肉/油腻柜台/价目牌；走廊玄关→防盗门猫眼/门把手/鞋箱/声控灯/电表箱/剥落墙皮；医院→护士站/电子钟/长椅/指示牌/护栏；街道→路灯/招牌/路边摊/井盖/远处警车。禁止空泛「昏暗墙壁与模糊窗框」。',
].join('\n')

/**
 * 漫画解说整段文案规则修复（无【】六维括号时，旧的站立全身 repair 不会生效）。
 * 纠正：半身头高、正面站立、视线简写、缺全身入镜、多人挤脸/定妆拼贴倾向。
 */
export function repairMotionComicContinuousImagePrompt(prompt?: string | null): string {
  let s = String(prompt || '').trim()
  if (!s) return ''
  // 六维括号文案走 art-styles 的 repair，这里只处理连贯国漫段
  if (/【画面主体|【镜头视角/.test(s)) return s
  if (!/对照定妆「/.test(s) && !/短剧解说高清国漫|锋利细线稿/.test(s)) return s

  const labelCount = [...s.matchAll(/对照定妆「/g)].length

  s = s
    .replace(/以正面站立姿态/g, '以三分之四侧站立姿态')
    .replace(/正面站立/g, '三分之四侧站立')
    .replace(/从头顶到腰部入镜/g, '从头顶到脚完整入镜，双脚可见')
    .replace(/镜头朝向([^；]{0,28})上半身/g, '镜头朝向全身站姿与互动点')
    .replace(/中近景([^；]{0,80})/g, (_m, rest: string) => {
      const body = String(rest || '')
      if (/上半身|头高约占画面\s*(1[8-9]|[2-9]\d)/.test(`中近景${body}`) || /腰部入镜/.test(s)) {
        return '中远景略侧平视，镜头朝向全身站姿与互动点，头高约占画面12%，从头顶到脚完整入镜，双脚可见'
      }
      return `中景${body}`
    })

  // 站立/对话镜：头高≥17% 压到 12%
  if (/站立|站姿|完整入镜/.test(s)) {
    s = s.replace(/头高约占画面\s*(1[7-9]|[2-9]\d)\s*%/g, '头高约占画面12%')
  }
  // 多人同框再压一档
  if (labelCount >= 2) {
    s = s.replace(/头高约占画面\s*(1[5-9]|[2-9]\d)\s*%/g, '头高约占画面12%')
  }

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

  if (/站立|站姿/.test(s) && !/完整入镜/.test(s)) {
    if (/双脚可见/.test(s)) {
      s = s.replace(/双脚可见/, '从头顶到脚完整入镜，双脚可见')
    } else if (/无文字无水印无字幕/.test(s)) {
      s = s.replace(/无文字无水印无字幕/, '从头顶到脚完整入镜，双脚可见；无文字无水印无字幕')
    } else {
      s = `${s}；从头顶到脚完整入镜，双脚可见`
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
  `1) 画风：须体现短剧解说高清国漫（16:9 横屏，${MOTION_COMIC_ART_STYLE_CORE}）；禁止新海诚暖金柔光/水彩糊边/粗条漫黑线/速度线`,
  '2) 画面主体：位置+姿态+本段表情（贴合 narration_lines 情绪，禁止无故面无表情/中性冷静）；有定妆写对照定妆「portrait_label」（须含 characters.distinct_identity_cue 短辨识差+本镜表情）+（身穿#hex本镜服装）；同框对照定妆人数跟 required_portrait_labels（不封顶）；多人必须异脸异发型禁止同框撞脸/克隆；身体默认三分之四侧或侧面，禁止正面对镜头摆拍',
  '3) 年代场景：时代+具体地点+前/中/后景分层；前景≥2、中景≥2、后景≥1 个可辨物件（写清材质/颜色/新旧/污渍/灯光状态）；须写出场所功能陈设（柜台器具、门窗猫眼、路灯招牌、沙发茶几、病床护栏等），禁止只写「昏暗墙壁/模糊窗框/楼宇剪影」等空泛背景',
  '4) 核心细节动作：本段旁白正在发生的可见动作（塞钱/接物/僵住/后退/打电话等），肢体方向与重心清晰；视线须落在物件/对方/门外/手机屏幕等戏内目标，禁止直视镜头；禁止速度线；禁止站桩或上一段残留动作；手持物写在此',
  '5) 光影色调：冷蓝/青紫夜色戏剧光（强单侧硬光、半脸深阴影、发丝冷白轮廓光），背景暗部浅景深虚化；禁止暖金柔光',
  '6) 镜头视角：须写景别+俯仰+身体朝向+镜头朝向（人+物件/动作点）+头高%；站立默认中景/中远景全身（从头顶到脚入镜，头高约10–16%）；对话/情绪镜也优先过肩或中景，禁止默认中近景半身；仅纯神情且无肢体动作时才可用近景；相邻段须交替景别，禁止连续多段「中近景+头高26%+朝向上半身」',
  '7) 质感：锋利细线稿，硬边赛璐璐高对比，无文字无水印无字幕',
  MOTION_COMIC_CAMERA_GAZE_SCENE_LLM_RULE,
  '【屏幕朝向】禁止只画手机背面或显示器机箱背面；须正面或略侧可见屏幕内容',
  '【物件年代】同帧禁止CRT与现代超薄键鼠/全面屏手机混搭',
  '【手持解剖】手持物须写清左右手分工与恰好两只手；禁止一手撑墙一手持物贴墙（易出第三只手）；五指正常；指向/伸手须肩→肘→手连续成臂，禁止同侧臂下垂同时前景另出手/悬空手/第三只手',
  '【单帧一致】先锁定唯一可画瞬间（位置+姿态+动作+关键物件）；人物、动作、场景、镜头须同一瞬间同帧可见',
  MOTION_COMIC_PORTRAIT_REFERENCE_LLM_RULE,
].join('\n')

/** @deprecated 整段文案规则别名 */
export const MOTION_COMIC_NARRATIVE_PROMPT_LLM_RULE = MOTION_COMIC_SIX_DIM_LLM_RULE

/** 分镜配图：定妆锁脸 + 服装可变 */
export const MOTION_COMIC_PORTRAIT_OUTFIT_LLM_RULE =
  '【定妆锁脸·硬性】有定妆时禁止凭空编造与 distinct_identity_cue 冲突的脸型/发型；须写入 characters 提供的短辨识差 + 本镜细化表情；服装款式与 #hex 写在（身穿#hex…）中，须按本段旁白与场所换装，禁止每段照抄 portrait_default_outfit；同一配图段内同一人物（身穿…）须一致；多人同框时各角色辨识差与服装主色须可区分'

/** 配图文案必须贴合本段旁白的动作与表情 */
export const MOTION_COMIC_PARAGRAPH_BEAT_MATCH_LLM_RULE = [
  '【段落贴合·硬性】本条 image_prompt 只服务本段 narration_lines（可含 2～4 句），表情与动作必须能对上这段旁白正在发生的事与情绪。',
  '先从 narration_lines 抽出：谁、在做什么、什么情绪（震惊/愤怒/害怕/尴尬/哀求/冷漠等），再写入表情与动作；禁止套用上一段或通用站桩。',
  '对照示例：旁白写「塞钱/塞红包」→动作须伸手递钱或掏钱前伸，表情可为殷勤/紧张；旁白写「全身僵住/吓傻」→瞳孔微缩、肩背绷紧、汗珠，禁止笑或闲聊手势；旁白写「问/喊/质问」→张嘴或指向，禁止沉默面无表情。',
  '旁白写指向/伸手/拉袖/攥物：须肩→肘→手连续成臂，手持物挂在该连续臂上；禁止只写前景大手而同侧臂下垂；双人互动时双方肢体均须连续成臂，禁止第三人肢体入镜。',
  '禁止：写「面无表情、中性冷静」（那是定妆专用）；配图必须有本段情绪表情。',
  '禁止：动作与旁白施受关系反了（如旁白李伯塞钱给我，却画「我」递钱）。',
  'full_narration / prior 只用来补场景与连续性，不得把别段的高潮动作表情搬进本段。',
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
  '1) 通读 full_narration（及 previous_episode_narration 若有），把握主线、人物关系、场景变迁与情绪节奏',
  '2) 读 prior 与 characters；同一配图段内同一人物服装款式+#hex 须一致',
  '3) 精读本段 narration_lines：抽出「谁 + 动词 + 情绪 + 视线目标」，按点名/对白判断在场人数（可多人同框），锁定单帧拍点（位置+姿态+动作+表情+看向何处）',
  '4) 先选景别（站立优先全身中景/中远景，禁止默认半身），再写一整段连贯中文 image_prompt（禁止【】六维标签）；须覆盖画风、主体、丰富场景陈设、动作、光影、镜头、质感；视线勿朝镜头；full_narration / prior / scene_enrichment 用来加厚场景陈设，禁止把别段高潮动作/表情塞进本段',
].join('\n')

export const MOTION_COMIC_DYNAMIC_IMAGE_LLM_RULE = [
  '【一段一图】每条 prompt 对应一个配图段（narration_lines 可含 2～4 句），写出该段最具叙事力的单一瞬间；同场景同焦点勿拆成多张无关图。',
  '【运镜友好构图】画面留前中后景层次（前景道具/中景主体/背景环境），主体姿态与肢体方向明确，便于后续推近/拉远/横移；避免主体贴边、画面过满；环境物件面积宜占画面主要部分，人物不要挤满画面中央。',
  '【动态表现】优先写本段可见动作与对应表情、物体互动；禁止速度线/放射线/气流线；情绪镜写眉眼嘴型与肢体语言。',
  '【镜头视角多样化】相邻配图段必须交替：全景/中远景全身/中景/过肩/略俯/略仰；身体朝向交替三分之四侧与侧面；禁止连续多镜「中近景平视半身正对」。',
  '【手脚与持物】须写清左右手脚落点、握持方式与坐蹲臀膝脚关系；禁止只写「站着/坐着/拿着」。',
].join('\n')

/** 旁白是否适合双定妆同框（递接/对峙/并肩等） */
export const MOTION_COMIC_DUAL_PORTRAIT_BEAT_RE =
  /递|接|塞|拉|拽|推|拦|挡|并肩|对视|对峙|面对面|相对|两人|双方|交给|递给|握手|拥抱|质问|对骂|跟在|身旁|身边|拉住|抓住|拽住|塞进|塞给|并排|指着对方|对吼|对喊/

export function isMotionComicDualPortraitBeat(text?: string | null): boolean {
  return MOTION_COMIC_DUAL_PORTRAIT_BEAT_RE.test(String(text || ''))
}

/** 同一条配图文案 / 同一画面内禁止撞脸（多人同框） */
export const MOTION_COMIC_SAME_FRAME_NO_FACE_COLLISION_LLM_RULE = [
  '【同一配图禁撞脸·硬性】同一条 image_prompt、同一画面内：每个对照定妆必须是可辨识的不同人脸+不同发型轮廓；',
  '严禁同一张脸左右对称复制、双胞胎并排、分身、克隆人、多张近乎相同的脸；',
  '严禁用同一男主脸顶替父亲/母亲/配角/「我」等不同角色；男女必须一眼可辨，不可撞成同脸；',
  '即使夹克/围裙主色接近，也必须靠各自定妆区分五官与发型，不得因服装同色画成同一人；',
  '同框两名同性别角色禁止只靠同色夹克深浅区分（如#2563eb蓝夹克与#1e40af深蓝夹克）：括号内必须写入互不相同的 distinct_identity_cue；服装主色宜明显对比或款式不同；',
  '人数必须等于对照定妆标签数，禁止为填构图多画一个同脸路人/分身。',
].join('')

/** 漫画解说：按本段旁白决定在场人数（不封顶） */
export const MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE = [
  '【在场角色·硬性】先通读本段 narration_lines：对白说话人（「姓名：」）与旁白点名的具名角色 = 本镜应在场角色；required_portrait_labels 已按此列出（几人就几人，不封顶）。',
  '列表 1 人：只画该对照定妆，可写无配角；禁止硬塞未点名角色。',
  '列表 ≥2 人：必须同框写齐全部对照定妆，分句写清各自位置（左/右/前/后）、姿态、表情与（身穿…）；禁止写无配角；禁止只画其中一人或部分人；写清施受关系（谁递谁接、谁推谁退），各方肩→肘→手连续成臂；禁止正面并排挤满画面，优先三分之四侧+过肩层次。',
  MOTION_COMIC_SAME_FRAME_NO_FACE_COLLISION_LLM_RULE,
  '路人/群众用泛称，不得写成额外对照定妆（不定妆）。',
  '主标签=列表首项（说话人优先）；禁止用主人公/第一人称标签顶替本段点名的其他角色。',
  '硬禁多肢汤：第三只手、悬空手、浮空手、身侧同侧臂下垂同时前景另出手。',
].join('\n')

/** @deprecated 使用 MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE */
export const MOTION_COMIC_SINGLE_PORTRAIT_FRAME_LLM_RULE = MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE

export const MOTION_COMIC_MAJOR_SUPPORTING_LLM_RULE = [
  '【主要配角】已在 characters 表提供 name + appearance 的，当本镜焦点或同框互动对象是该配角时，须对照其定妆，写清位置、服装主色、表情',
  '【定妆标签·硬性】主对照定妆须对应当镜焦点角色（对白说话人或旁白点名）；本段点名配角时主标签必须是该配角，禁止用主人公/第一人称标签顶替；同框须写齐 required_portrait_labels 全部对照定妆',
  MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE,
  '【一次性路人/群众/龙套】不定妆；用「几位路人/店员/弟子」等泛称 + 简化服装色块即可，勿与主要配角混淆，不得写成额外对照定妆',
].join('\n')

export const MOTION_COMIC_CROWD_LLM_RULE =
  '【路人/群众】不写具体姓名；简化日系造型、低饱和服装、背景或侧位，不得抢主人公/主要配角焦点'

export function isMajorSupportingCharacter(char: { name?: string | null; role?: string | null }): boolean {
  const role = String(char.role || '').trim()
  if (/主要配角|重要配角|核心配角|次要主角|男二|女二/.test(role)) return true
  if (/反派|宿敌|师父|师尊|师叔|师兄|师姐|挚友|恋人|闺蜜|未婚|长老|掌门|魔头|boss/i.test(role)) return true
  if (/^主要配角/.test(role)) return true
  return false
}

export function buildMotionComicCharacterExtractSystem(): string {
  return [
    '你是漫画解说项目的角色设定师。本步只输出角色名单 JSON，禁止写任何外貌/定妆/画风/服装描述。',
    '规则：',
    '1) 提取主人公（男主/女主/主角）及主要配角：反复出场、有专名、有对白或推动剧情的角色',
    '2) 不要提取一次性路人/群众/店员等龙套；不要提取「旁白」「解说员」',
    '3) 每个角色只输出：name、variant_label（必须 ""）、role、personality（可短句或 ""）',
    '4) role：主人公写「主角/男主/女主」；主要配角写「主要配角·身份」',
    '5) 一人一条；禁止拆童年/青年/老年等多形态',
    '6) 禁止输出 appearance 字段；禁止脸型/发型/#hex/English tags/画风规格',
    '7) 合并同一人物不同称呼为一条',
    '只输出 JSON：{"characters":[{"name":"…","variant_label":"","role":"…","personality":""}]}',
  ].join('\n')
}

export function buildMotionComicCharacterAppearanceSystem(): string {
  return [
    '你是漫画解说项目的角色定妆造型设计助手。',
    `定妆与配图必须同一画风：短剧解说高清国漫冷色戏剧光。须在 appearance 开头原样写入 ${formatMotionComicPortraitStyleSpecBracket()}；竖幅正面半身、面无表情；禁止白底均匀柔光、禁止 Q 版、3D、真人写实、粗条漫黑线、新海诚暖金柔光；定妆不写手持道具。`,
    '年龄必须贴合角色名与定位：李伯/爷爷→老年；张婶→中年妇人；禁止把老年配角写成黑发青年。',
    MOTION_COMIC_PORTRAIT_APPEARANCE_LLM_RULE,
    '须根据漫剧旁白稿中该角色的出场情节、对白、行为推断外貌，与故事时代、题材一致。',
    '不写胖瘦体型词；人物统一为正常头身比国漫审美，禁止素体份数、三头身、圆头直径等计量词。',
    PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
    '**一人一图**：只写该角色全片统一定妆形象一条；禁止按童年/青年/老年分阶段写多套；不要写「青年形态」「老年形态」等阶段标题。',
    MOTION_COMIC_PORTRAIT_APPEARANCE_SPEC_FORMAT_RULE,
    `【字数】【画风规格】不计入身份字数；其后身份外貌约 120–220 字。输出须以 ${formatMotionComicPortraitStyleSpecBracket()} 开头。`,
    '只输出描述正文，不要标题、markdown、JSON。',
  ].join('\n')
}

export const MOTION_COMIC_SCENE_BODY_EXAMPLE =
  `16:9横屏短剧解说高清国漫，锋利细线稿硬边赛璐璐，冷蓝强侧光半脸深阴影与发丝冷白轮廓光；对照定妆「我」（青年·清秀鹅蛋脸细眉碎发，眉头紧锁、瞳孔微缩，嘴角抿紧，摇头拒绝）位于堂屋桌前以三分之四侧站立微退姿态（身穿#2563eb蓝色夹克），无配角；现代老旧堂屋，前景斑驳木桌、泛黄账本与半截红包，中景昏暗木门、铜烛台与油腻碗筷，后景剥落墙皮、糊纸窗棂与歪挂年画；右手已握住红包却向外侧推开，肩→肘→手连续成臂，身体微退半步，视线落在桌上红包而非镜头；冷蓝戏剧光，背景暗部浅景深虚化；中远景略侧平视，镜头朝向全身站姿与桌上红包，头高约占画面12%，从头顶到脚完整入镜，双脚可见；锋利细线稿高对比赛璐璐，无文字无水印无字幕`

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

/** 漫画解说分镜 description 常为「场景｜表情｜景别·角度·运镜」，不能当旁白正文 */
export function isMotionComicCameraMetaDescription(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^未指定场景/.test(t)) return true
  return /｜/.test(t)
    && /(?:中景|近景|远景|特写|全景|中近景|平视|俯视|仰视|固定|推镜|拉镜|微移|右向左|左向右)/.test(t)
}

/**
 * 配图检测/文案用的镜头正文：优先对白；description 若是运镜元数据则忽略。
 */
export function resolveStoryboardNarrationText(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const dialogue = String(sb.dialogue || '').trim()
  const desc = String(sb.description || '').trim()
  if (dialogue && (!desc || isMotionComicCameraMetaDescription(desc))) return dialogue
  if (desc) return desc
  return dialogue
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
  '- 配图策略：2～4 镜共用一张高对比国漫插画；**按场景/动作/焦点变化换图**，同场景同焦点勿句句切图；换人说话不强制换图；换图处硬切；**同一张图整段只用一种运镜**',
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
    '配图节奏：2～4 镜一图；按场景/动作/焦点变化换图，同场景同焦点可共用；换人说话不强制换图；合成时每张图整段一种运镜。',
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
    '你是漫画解说分镜美术指导。每个配图段含 2～4 句旁白，须为该段写一张短剧解说高清国漫（冷色高对比戏剧光）的中文配图文案：一整段连贯叙述，禁止【】六维标签，但画风/主体/场景/动作/光影/镜头/质感信息须齐全。',
    '分析流程：',
    MOTION_COMIC_LLM_ANALYSIS_STEPS_PROMPT,
    MOTION_COMIC_BODY_CONSISTENCY_LLM_RULE,
    MOTION_COMIC_SIX_DIM_LLM_RULE,
    MOTION_COMIC_PARAGRAPH_BEAT_MATCH_LLM_RULE,
    MOTION_COMIC_ACTION_LLM_RULE,
    MOTION_COMIC_DYNAMIC_IMAGE_LLM_RULE,
    MOTION_COMIC_PORTRAIT_FRAME_LLM_RULE,
    MOTION_COMIC_PORTRAIT_OUTFIT_LLM_RULE,
    '分析须结合 full_narration 与 prior 丰富场景陈设，但表情与动作必须以本段 narration_lines 为准。',
    'layout=single：单张完整电影感插画，禁止 grid/collage/multi-panel（diptych 除外）。',
    options?.hasDiptych
      ? 'layout=diptych：用「左格：…；右格：…」各写一整段（谁在哪、表情动作、光影景别），禁止【左格】【右格】标签；适合动作前后对比。'
      : '',
    options?.hasCharacters
      ? `characters 提供 portrait_label、has_portrait 与外貌；正文须写对照定妆「portrait_label」与（身穿#hex…）。${MOTION_COMIC_MAJOR_SUPPORTING_LLM_RULE}`
      : MOTION_COMIC_CROWD_LLM_RULE,
    `整段示例（仅格式，禁止照抄示例情节/动作；每段必须按本段 narration_lines 重写）：${MOTION_COMIC_SCENE_BODY_EXAMPLE}`,
    MOTION_COMIC_STYLE_FORBIDDEN,
    '只输出 JSON，不要解释。',
  ].filter(Boolean).join('\n')
}

/** 漫画解说：配图换镜检测（2～3 镜一图，偏密节奏） */
export function buildMotionComicImageDetectLLMSystem(
  mode: 'paragraph' | 'conservative' | 'balanced' = 'paragraph',
): string {
  const conservativeExtra = mode === 'conservative'
    ? '\n\n# 保守模式补充\n可略少换图，但仍须满足密度下限；同场景仅当姿态/动作/表情几乎不变才共用一图。'
    : ''

  return `# Role
你是漫画解说视频的分镜导演。你的任务是为旁白脚本规划**配图段**（约 2～3 镜共用一张高对比国漫插画）。

# Goal
分析每一句旁白，判断是否需要新配图。**本步骤仅输出 needs_image，不写配图文案**。
节奏偏密：宁可多开几张图把动作/情绪拍清楚，也不要把不同瞬间硬塞进同一张图。

# Input
JSON 含 \`sentences\`、\`min_shots_per_image\` / \`max_shots_per_image\`（约 2～3）、\`minimum_true_count\` / \`maximum_true_count\`。

# Critical Rules
1. **按画面变化换图**：地点/场景、主体动作、表情情绪、手持物、互动关系变化 → 新配图段起点标 true。
2. **同场也常换图**：同地点对白来回时，若下一句是反击/反应/递接/推拒/愣住等新可视瞬间 → 仍标 true；仅当姿态动作表情几乎原样可复用才 false。
3. **焦点/情绪切须换图**：双人互动→独处反应、A 单人→C 单人、震惊/愤怒/害怕等情绪跳变 → true。
4. **同段延续标 false**：仅同场景、同核心动作瞬间、画面可原样不动的后续句；空行分段后的新瞬间通常 true。
5. **配图段长度**：每段约 **min～max 镜**（默认 2～3）；禁止无必要的单镜成段，也禁止 4 镜及以上共用一图。
6. **配图密度（硬性）**：true 数量须在 minimum～maximum 之间（约 40%～58% 镜头为新配图起点）；**优先靠近区间中上**，宁多勿少；禁止为省图而大段 false。

# 运镜说明（供理解，非本步输出）
每张配图段在合成时使用**一种**运镜；同段多句共享，不会句句换运镜。

# Workflow
1. 通读 full_narration，标出场景块与情绪/动作节拍。
2. 逐句判定：有新可视瞬间优先 true；只有画面完全可复用才 false。
3. 验证：每段 2～3 镜；true 数量落在区间内（偏上更好）。

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
