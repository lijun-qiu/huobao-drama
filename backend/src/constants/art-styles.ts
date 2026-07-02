import {
  MOTION_COMIC_STYLE,
  isMotionComicStyle,
  motionComicStylePrompt,
  buildMotionComicParagraphImagePromptLLMSystem,
  buildMotionComicTitleImagePromptLLMSystem,
  buildMotionComicImageDetectLLMSystem,
  formatMotionComicStyleSpecBracket,
  MOTION_COMIC_SCENE_SUFFIX,
  MOTION_COMIC_SCENE_BODY_EXAMPLE,
  MOTION_COMIC_STYLE_SPEC,
  MOTION_COMIC_NEGATIVE_PROMPT,
} from './motion-comic.js'
import { isMotionComicMode, resolveEpisodeProductionMode } from './production-mode.js'

export type ArtStyleContext = 'scene' | 'diptych' | 'title' | 'portrait' | 'agent'

export const DEFAULT_ART_STYLE = 'short-drama'

/** 解说素体极简叙事画风（项目级视觉风格 value） */
export const NARRATION_MINIMAL_STYLE = 'narration-minimal'

/** 解说配图动漫风格（正常头身比 2D 动漫，七维结构与素体相同） */
export const NARRATION_ANIME_STYLE = 'narration-anime'

/** 漫画解说（条漫平涂 + 上下运镜，独立于素体解说） */
export {
  MOTION_COMIC_STYLE,
  isMotionComicStyle,
  motionComicStylePrompt,
  buildMotionComicParagraphImagePromptLLMSystem,
  buildMotionComicTitleImagePromptLLMSystem,
  MOTION_COMIC_NEGATIVE_PROMPT,
} from './motion-comic.js'

/** 解说配图可选画风（定妆参考与配图共用） */
export const NARRATION_IMAGE_STYLE_OPTIONS = [
  { value: NARRATION_MINIMAL_STYLE, label: '简体素人' },
  { value: NARRATION_ANIME_STYLE, label: '动漫风格' },
] as const

export function resolveNarrationImageStyle(style?: string | null): string {
  const key = String(style || '').trim().toLowerCase()
  if (key === NARRATION_MINIMAL_STYLE || key === NARRATION_ANIME_STYLE) return key
  if (key === MOTION_COMIC_STYLE) return MOTION_COMIC_STYLE
  return NARRATION_ANIME_STYLE
}

/** 定妆 + 配图统一画风：优先 image_style，漫画解说固定条漫，否则默认动漫 */
export function resolveEpisodeVisualStyle(
  episodeId: number,
  options?: { imageStyle?: string | null; dramaStyle?: string | null },
): string {
  const explicit = String(options?.imageStyle || '').trim()
  if (explicit) return resolveNarrationImageStyle(explicit)
  if (isMotionComicMode(resolveEpisodeProductionMode(episodeId))) return MOTION_COMIC_STYLE
  return resolveNarrationImageStyle(options?.dramaStyle)
}

/** 主人公面部：素体头上的正常卡通脸（参考温馨叙事插画） */
export const NARRATION_PROTAGONIST_FACE =
  '头部正常卡通脸，圆眼或弯眼带高光，眉毛嘴巴清晰，可有腮红，表情生动'

/** 群众面部：与主人公同款正常卡通脸画风 */
export const NARRATION_CROWD_FACE =
  '头部正常卡通脸，圆眼或弯眼带高光，眉毛嘴巴清晰，可有腮红，表情生动'

/** @deprecated 使用 NARRATION_PROTAGONIST_FACE */
export const NARRATION_PROTAGONIST_EYES = NARRATION_PROTAGONIST_FACE

/** @deprecated 使用 NARRATION_CROWD_FACE */
export const NARRATION_CROWD_EYES = NARRATION_CROWD_FACE

/** @deprecated 使用 NARRATION_CROWD_FACE */
export const NARRATION_MINIMAL_EYES = NARRATION_CROWD_FACE

/** 主人公形体：白色简笔素体（与配角统一） */
export const NARRATION_PROTAGONIST_BODY = '白色素体小人'

/** 群众/路人/顾客形体：白色简笔素体 */
export const NARRATION_CROWD_BODY = '白色素体小人'

/** 禁止偏离简笔素体的画风（写入 LLM 与清洗规则） */
export const NARRATION_MINIMAL_STYLE_FORBIDDEN =
  '禁止厚涂肌理、赛璐璐、日式精细动画脸、条漫、像素风、渐变阴影、3D渲染、真人照片质感'

/** 素体正常卡通脸表情：主人公与大圆眼，群众小圆点眼，与剧情情绪一致 */
export const NARRATION_MINIMAL_EXPRESSION_LLM_RULE =
  '【面部表情】主人公及同框第二位主人公（配偶/父母/子女等）须写正常卡通脸表情（圆眼或弯眼带高光、眉毛嘴巴清晰、可有腮红）；路人/群众配角正面/侧面须写两个小圆点眼（小眼睛）与简笔表情；与 narration_lines 情绪一致；写入【画面主体】或【核心细节动作】'

/** 主人公与配角视觉区分 — 已并入 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE */
export const NARRATION_PROTAGONIST_DISTINCT_LLM_RULE =
  '【主人公鲜明】见 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE'

/** 素体人物须穿与年代剧情一致的简化服装轮廓（简笔色块，非写实） */
export const NARRATION_MINIMAL_CLOTHING_LLM_RULE =
  '【服装】主人公须写具体鲜明的简化服装款式与主色（简笔色块）；主色一律用六位小写十六进制色值紧挨款式词（如 #ffd700短袖T恤、#2563eb短裤）；配角写笼统低饱和便装轮廓并用 #hex（如 #64748b低饱和便装）；均须与年代、职业、场景匹配，禁止写实布料褶皱与复杂印花；禁止只用中文颜色词而不写 #hex；服装写入【画面主体】'

/** LLM 配图：服装主色须用 #hex 锁定（段内一致） */
export const NARRATION_OUTFIT_HEX_COLOR_LLM_RULE =
  '【服装色值】主人公与可见配角（含配偶/路人/群众）服装主色须写六位小写十六进制色值（如 #ffd700、#2563eb、#ffffff、#333333）；格式「#hex紧挨款式词、中间无空格」（如 #ffd700短袖T恤、#2563eb短裤，禁止 #2563eb 短裤）；上下装用「与」连接，整段须以简笔轮廓结尾：身穿#ffd700短袖T恤与#2563eb短裤简笔轮廓；配角写穿#64748b低饱和便装、穿#5f7a6e低饱和校服、穿#9ca3af低饱和连衣裙或穿#ffffff围裙；花衬衫写#ff6b9d花衬衫；禁止亮黄/蓝色/白色等纯中文色词；同一配图段内主人公 #hex 须完全一致（含 diptych 左右格）'

/** @deprecated 使用 NARRATION_MINIMAL_CLOTHING_LLM_RULE */
export const NARRATION_MINIMAL_NO_CLOTHING_RULE = NARRATION_MINIMAL_CLOTHING_LLM_RULE

/** 写入 LLM 硬性规则的服装与六维分工 */
export const NARRATION_MINIMAL_NO_CLOTHING_LLM_RULE = NARRATION_MINIMAL_CLOTHING_LLM_RULE

/** 素体四肢：仅两手两脚 */
export const NARRATION_MINIMAL_LIMBS_SPEC = '简笔四肢仅两手两脚，等粗黑线轮廓'

/** 全片锁定的圆头绝对尺寸（锚定 16:9 画幅竖向高度） */
export const NARRATION_BODY_HEAD_DIAMETER_ANCHOR =
  '圆头直径为全片固定设计尺寸：中景全身入镜时圆头占画面竖向高度12%；跨镜头须保持同一圆头绝对大小（近景可整体放大、禁止只放大头部）'

/** 轮廓线粗相对圆头（与头径同比） */
export const NARRATION_BODY_LINE_WEIGHT_ANCHOR = '黑轮廓线线粗约为圆头直径的1/10'

/** 素体尺寸计量单位（1份 = 上述固定圆头直径） */
export const NARRATION_BODY_MEASURE_UNIT = '以全片锁定的圆头直径为1份竖向计量（1份=画面高12%）'

export type NarrationBodyStage = '小孩' | '少年' | '青年' | '中年' | '老年'

/** 各阶段站立全身入镜时的画面高度占比（= 阶段份数 × 12%） */
export const NARRATION_BODY_STAGE_FRAME_HEIGHTS: Record<NarrationBodyStage, string> = {
  小孩: '26%',
  少年: '32%',
  青年: '36%',
  中年: '36%',
  老年: '34%',
}

/** 各阶段共用解剖基准（写入画风规格） */
export const NARRATION_BODY_ANATOMY_BASE =
  `${NARRATION_BODY_HEAD_DIAMETER_ANCHOR}，${NARRATION_BODY_LINE_WEIGHT_ANCHOR}，${NARRATION_BODY_MEASURE_UNIT}，${NARRATION_MINIMAL_LIMBS_SPEC}，全片共用同一计量标尺，禁止同画面随机放大缩小；同一配图段内主人公躯干宽高须一致，跨配图段可随剧情体现体重变化（如肥胖→减肥逆袭）`

/** 各人生阶段具象尺寸（1份=圆头直径=画面高12%；供 LLM 与编译层引用） */
export const NARRATION_BODY_STAGE_SPECS: Record<NarrationBodyStage, string> = {
  小孩:
    '小孩期：圆头1份=画面高12%，站立总高2.2份=画面高26%，躯干0.65份高×0.7份宽（幼童纤细），单肢各约0.35份，手脚极小，圆头无头发',
  少年:
    '少年期：圆头1份=画面高12%，站立总高2.7份=画面高32%，躯干0.85份高×0.85份宽（肩窄腰直偏瘦），单肢各约0.6份，圆头无头发',
  青年:
    '青年期：圆头1份=画面高12%，站立总高3.0份=画面高36%严格三头身，躯干1.0份高×1.0份宽（标准匀称），单肢各约0.75份，圆头无头发',
  中年:
    '中年期：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×1.15份宽（腰腹微鼓略胖不臃肿），四肢同青年，圆头无头发',
  老年:
    '老年期：圆头1份=画面高12%，站立总高2.8份=画面高34%微驼背，躯干0.9份高×0.9份宽（消瘦），单肢各约0.65份略细，圆头两侧各2-3条白发弧线',
}

/** 编译层英文正向：锁定圆头绝对尺寸 */
export const NARRATION_BODY_HEAD_SIZE_POSITIVE =
  'fixed round head diameter exactly 12 percent of frame height, identical head size across all shots, scale whole body together never enlarge head alone'

/** 编译层英文负向：头身比例漂移 */
export const NARRATION_BODY_HEAD_SIZE_NEGATIVE =
  'inconsistent head size, varying head diameter, oversized head, tiny head, bobblehead, chibi scale drift, different character scale between shots'

/** 解说素体通用尺寸（画风规格维：标尺 + 阶段表索引） */
export const NARRATION_MINIMAL_BODY_SIZE_SPEC =
  `${NARRATION_BODY_ANATOMY_BASE}；具体总高与胖瘦按【画面主体】人生阶段与体重档位（standard/chubby/obese/slim）执行对应规格（青年期三头身为基准）`

/** 写入 prompt 的完整身形约束（含全片统一） */
export const NARRATION_BODY_CONSISTENCY_CORE =
  `全片统一简笔素体比例，${NARRATION_MINIMAL_BODY_SIZE_SPEC}`

/** 各人生阶段具象尺寸表（LLM 与定妆参考） */
export const NARRATION_BODY_STAGE_SIZE_HINTS = Object.values(NARRATION_BODY_STAGE_SPECS).join('；')

/** 按阶段取具象尺寸短语 */
export function formatNarrationBodyStageSpec(stage?: string | null): string {
  const key = normalizeNarrationBodyStage(stage)
  return NARRATION_BODY_STAGE_SPECS[key]
}

/** 规范化人生阶段标签 */
export function normalizeNarrationBodyStage(stage?: string | null): NarrationBodyStage {
  const t = String(stage || '').trim().replace(/期$/, '')
  if (t === '小孩' || /童年|幼年|孩童|儿时/.test(t)) return '小孩'
  if (t === '少年') return '少年'
  if (t === '青年' || /年轻|小伙/.test(t)) return '青年'
  if (t === '中年') return '中年'
  if (t === '老年' || /晚年|垂暮|苍老|年迈/.test(t)) return '老年'
  return '青年'
}

/** 从【画面主体】等文本提取人生阶段 */
export function extractNarrationBodyStageFromText(text?: string | null): NarrationBodyStage | null {
  const t = String(text || '')
  const explicit = t.match(/(小孩|少年|青年|中年|老年)期/)
  if (explicit) return explicit[1] as NarrationBodyStage
  if (/童年|儿时|小时候|幼年|孩童/.test(t)) return '小孩'
  if (/少年|十五岁|十六岁|十七岁/.test(t)) return '少年'
  if (/青年|18岁|20岁|小伙|年轻/.test(t)) return '青年'
  if (/中年|而立|40岁|50岁/.test(t)) return '中年'
  if (/老年|晚年|花甲|白发|佝偻|拄拐/.test(t)) return '老年'
  return null
}

/** 体重弧线档位：standard=阶段默认，chubby/obese=偏胖至肥胖，slim=瘦削/逆袭后 */
export type NarrationBodyWeightTier = 'standard' | 'chubby' | 'obese' | 'slim'

/** 体重弧线主题上下文（传给配图 LLM） */
export type NarrationWeightArcContext = {
  active: boolean
  theme_labels: string[]
  tier_spec_table: string
}

/** 各档位×人生阶段具象躯干规格（standard 时回退 NARRATION_BODY_STAGE_SPECS） */
export const NARRATION_BODY_WEIGHT_TIER_SPECS: Record<
  Exclude<NarrationBodyWeightTier, 'standard'>,
  Record<NarrationBodyStage, string>
> = {
  chubby: {
    小孩:
      '小孩期（偏胖）：圆头1份=画面高12%，站立总高2.2份=画面高26%，躯干0.65份高×0.80份宽（孩童圆润），单肢各约0.35份，圆头无头发',
    少年:
      '少年期（偏胖）：圆头1份=画面高12%，站立总高2.7份=画面高32%，躯干0.85份高×0.95份宽（少年偏胖圆润），单肢各约0.6份，圆头无头发',
    青年:
      '青年期（偏胖）：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×1.20份宽（腰腹圆润略鼓），单肢各约0.75份，圆头无头发',
    中年:
      '中年期（偏胖）：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×1.20份宽（腰腹微鼓），四肢同青年，圆头无头发',
    老年:
      '老年期（偏胖）：圆头1份=画面高12%，站立总高2.8份=画面高34%微驼背，躯干0.9份高×1.05份宽（老年圆润），单肢各约0.65份，圆头两侧各2-3条白发弧线',
  },
  obese: {
    小孩:
      '小孩期（肥胖）：圆头1份=画面高12%，站立总高2.2份=画面高26%，躯干0.65份高×0.88份宽（幼童胖乎乎圆滚），单肢各约0.35份，圆头无头发',
    少年:
      '少年期（肥胖）：圆头1份=画面高12%，站立总高2.7份=画面高32%，躯干0.85份高×1.10份宽（少年肥胖圆滚肚子），单肢各约0.6份，圆头无头发',
    青年:
      '青年期（肥胖）：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×1.30份宽（明显肥胖圆滚腰腹突出），单肢各约0.75份，圆头无头发',
    中年:
      '中年期（肥胖）：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×1.35份宽（中年肥胖臃肿），四肢同青年，圆头无头发',
    老年:
      '老年期（肥胖）：圆头1份=画面高12%，站立总高2.8份=画面高34%微驼背，躯干0.9份高×1.25份宽（老年肥胖），单肢各约0.65份，圆头两侧各2-3条白发弧线',
  },
  slim: {
    小孩:
      '小孩期（瘦削）：圆头1份=画面高12%，站立总高2.2份=画面高26%，躯干0.65份高×0.65份宽（幼童纤细），单肢各约0.35份，圆头无头发',
    少年:
      '少年期（瘦削）：圆头1份=画面高12%，站立总高2.7份=画面高32%，躯干0.85份高×0.80份宽（少年精瘦），单肢各约0.6份，圆头无头发',
    青年:
      '青年期（瘦削）：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×0.90份宽（瘦削匀称腰腹平坦），单肢各约0.75份，圆头无头发',
    中年:
      '中年期（瘦削）：圆头1份=画面高12%，站立总高3.0份=画面高36%，躯干1.0份高×0.95份宽（精干瘦削），四肢同青年，圆头无头发',
    老年:
      '老年期（瘦削）：圆头1份=画面高12%，站立总高2.8份=画面高34%微驼背，躯干0.9份高×0.85份宽（老年清瘦），单肢各约0.65份略细，圆头两侧各2-3条白发弧线',
  },
}

const NARRATION_BODY_WEIGHT_SLIM_RE =
  /瘦下来|瘦了|减肥成功|逆袭|重生|蜕变|苗条|修身|精瘦|瘦削|腰腹平坦|不再挡住视线|不再觉得胖是罪|健康.*责任|体重下降|甩掉.*斤|瘦回/
const NARRATION_BODY_WEIGHT_OBESE_RE =
  /肥胖|胖子|超重|圆滚滚|圆滚|肚腩|臃肿|更胖|肉会颤|叠起来的肉|体重反弹|创(?:新)?高|显眼的轮廓|勒住.*大腿|办公椅.*吱呀|体型和你差不多|手感好.*暖和|专门定做|正装.*定做/
const NARRATION_BODY_WEIGHT_CHUBBY_RE =
  /微胖|丰满|(?:^|[^不])胖[^子]|偏胖|略胖|体型圆润|圆润的|养得真好|有福气|多吃|体重秤|大瓷碗|吃(?:了|一)肚子/
const NARRATION_BODY_WEIGHT_ANY_RE =
  /肥胖|偏胖|略胖|圆润|圆滚|超重|臃肿|肚腩|瘦削|苗条|躯干[\d.]+\s*份\s*[×xX]\s*[\d.]+\s*份|1\.\d+\s*份宽/

/** 按人生阶段 + 体重档位取具象规格 */
export function formatNarrationBodyWeightSpec(
  stage?: string | null,
  tier: NarrationBodyWeightTier = 'standard',
): string {
  const key = normalizeNarrationBodyStage(stage)
  if (tier !== 'standard') return NARRATION_BODY_WEIGHT_TIER_SPECS[tier][key]
  return NARRATION_BODY_STAGE_SPECS[key]
}

/** @deprecated alias */
export function resolveNarrationBodySpec(
  stage?: string | null,
  tier: NarrationBodyWeightTier = 'standard',
): string {
  return formatNarrationBodyWeightSpec(stage, tier)
}

/** 从旁白/配图文案推断体重档位 */
export function inferNarrationBodyWeightTierFromText(text?: string | null): NarrationBodyWeightTier {
  const t = String(text || '')
  if (!t.trim()) return 'standard'
  if (NARRATION_BODY_WEIGHT_SLIM_RE.test(t)) return 'slim'
  if (NARRATION_BODY_WEIGHT_OBESE_RE.test(t)) return 'obese'
  if (NARRATION_BODY_WEIGHT_CHUBBY_RE.test(t)) return 'chubby'
  if (/躯干[\d.]+\s*份\s*[×xX]\s*1\.(?:3[0-9]|4\d|35)\s*份|1\.3\d?\s*份宽|1\.4\d?\s*份宽/.test(t)) return 'obese'
  if (/躯干[\d.]+\s*份\s*[×xX]\s*1\.(?:2[0-9]|15)\s*份|1\.2\d?\s*份宽|1\.15\s*份宽/.test(t)) return 'chubby'
  if (/躯干[\d.]+\s*份\s*[×xX]\s*0\.(?:8\d|9\d)\s*份|0\.9\d?\s*份宽/.test(t)) return 'slim'
  return 'standard'
}

/** 从【画面主体】等已生成 prompt 提取体重档位 */
export function extractNarrationBodyWeightTierFromText(text?: string | null): NarrationBodyWeightTier {
  const tier = inferNarrationBodyWeightTierFromText(text)
  if (tier !== 'standard') return tier
  const t = String(text || '')
  if (/（肥胖）|obese|明显肥胖|圆滚腰腹/.test(t)) return 'obese'
  if (/（偏胖）|（圆润）|体型圆润/.test(t)) return 'chubby'
  if (/（瘦削）|瘦削匀称|腰腹平坦/.test(t)) return 'slim'
  return 'standard'
}

/** 通读全文识别肥胖/减肥/逆袭体重弧线主题 */
export function detectNarrationWeightArcTheme(
  fullNarration: string[] | string,
): NarrationWeightArcContext | null {
  const text = Array.isArray(fullNarration) ? fullNarration.join('\n') : String(fullNarration || '')
  if (!text.trim()) return null
  const themes: string[] = []
  if (/肥胖|胖子|超重|圆滚滚|肚腩|臃肿|更胖|肉会颤|体重秤|大瓷碗|养得真好/.test(text)) themes.push('肥胖')
  if (/减肥|瘦下来|瘦了|节食|体重反弹|创(?:新)?高|运动|卡路里|饿得/.test(text)) themes.push('减肥')
  if (/逆袭|重生|蜕变|不再觉得胖|健康.*责任|系鞋带.*轻松|不再挡住/.test(text)) themes.push('逆袭')
  if (!themes.length) return null
  const tierLines = (['obese', 'chubby', 'slim'] as const).flatMap(tier =>
    Object.values(NARRATION_BODY_WEIGHT_TIER_SPECS[tier]),
  )
  return {
    active: true,
    theme_labels: themes,
    tier_spec_table: tierLines.join('；'),
  }
}

/** 为单个配图段推断建议体重档位（结合段内旁白 + prior + 全文弧线） */
export function inferParagraphBodyWeightTier(
  narrationLines: string[],
  priorNarration: string[] = [],
  fullNarration?: string[],
): NarrationBodyWeightTier {
  const segment = [...priorNarration.slice(-10), ...narrationLines].join('\n')
  const tier = inferNarrationBodyWeightTierFromText(segment)
  if (tier !== 'standard') return tier

  const fullText = (fullNarration || []).join('\n')
  const arc = fullText ? detectNarrationWeightArcTheme(fullText) : null
  if (!arc) return 'standard'

  const priorText = priorNarration.join('\n')
  if (NARRATION_BODY_WEIGHT_SLIM_RE.test(priorText)) return 'slim'
  if (NARRATION_BODY_WEIGHT_SLIM_RE.test(fullText) && /系鞋带|轻松|健康|逆袭|重生|蜕变/.test(segment)) {
    return 'slim'
  }
  if (/小时候|童年|少年|餐桌|瓷碗|红烧肉|圆滚|肉会颤|体重秤|面试|办公椅|火锅|正装/.test(segment)) {
    return 'obese'
  }
  return 'chubby'
}

/** 体重弧线 LLM 规则（仅 weight_arc 激活时注入） */
export const NARRATION_BODY_WEIGHT_ARC_LLM_RULE = [
  '【体重弧线·硬性】全文含肥胖/减肥/逆袭主题时，【画面主体】须写清具象躯干宽高（如「躯干1.0份高×1.30份宽（明显肥胖圆滚腰腹）」），禁止只写「青年期三头身」而不写肥胖规格；',
  '档位：obese（肥胖，青年1.30份宽/少年1.10份宽）→ chubby（偏胖，青年1.20份宽）→ slim（逆袭后瘦削，青年0.90份宽）；须与 narration_lines 及 suggested_body_weight_tier 一致；',
  '同一配图段（同一 start_index）内躯干宽高须锁定一致；跨配图段可随剧情从 obese 过渡到 slim；',
  '旁白含胖/肚子/圆滚/体重秤/勒住/显眼的轮廓/办公椅吱呀/定做正装等时，【画面主体】必须写 obese 或 chubby 档位具象规格，不得用标准匀称三头身；',
  '旁白含瘦下来/逆袭/重生/系鞋带轻松/不再挡住视线/健康责任等时，【画面主体】须写 slim 档位（躯干0.90份宽或等价表述）；',
  `档位规格表：${Object.values(NARRATION_BODY_WEIGHT_TIER_SPECS.obese).join('；')}；${Object.values(NARRATION_BODY_WEIGHT_TIER_SPECS.slim).join('；')}`,
].join(' ')

/** LLM：人生阶段发型与体型（多主人公同框须统一遵守） */
export const NARRATION_STAGE_HAIR_LLM_RULE =
  '【阶段发型】小孩/少年/青年/中年期主人公均无头发（圆头无发丝）；中年期在青年三头身基础上仅加宽躯干至1.15份；仅老年期圆头两侧可有2-3条简化白发弧线；多主人公同框须同阶段、同规格、同发型规则，禁止一人有发一人无发或青年配中年'

/** LLM：同框多主人公（夫妻/父子/母子等）须人生阶段与画风统一 */
export const NARRATION_DUAL_PROTAGONIST_LLM_RULE =
  '【多主人公例外】旁白明确同框且同为叙事主角（夫妻、父子、母子、兄妹等）时，【画面主体】可写「两位X期主人公」或「一位X期主人公与一位X期配偶/父亲/母亲/儿子/女儿主人公」，须同处一个人生阶段（同少年/同青年/同中年/同老年），两位须同为白色素体、同款阶段规格与发型规则、均写正常卡通脸（圆眼或弯眼带高光），仅通过性别/简化服装/构图区分；禁止把路人或群众写成第二位主人公'

/** LLM：群众配角面部（非背面须小眼睛） */
export const NARRATION_CROWD_EYE_LLM_RULE =
  '【配角眼型】路人/顾客/群众配角正面或侧面出镜时须写「两个小圆点眼（小眼睛）」，简笔眉嘴从简；仅背面或远背影时可不写眼；主人公仍用正常卡通脸（圆眼或弯眼带高光），禁止配角也用大圆眼抢戏'

/** 素体人生阶段 + 统一白色形体（写入 LLM 与清洗规则） */
export const NARRATION_MINIMAL_STAGE_FACE_RULE =
  `【形体统一】主人公与配角均为${NARRATION_CROWD_BODY}白色素体身形（${NARRATION_MINIMAL_LIMBS_SPEC}）；须用构图与服装鲜明区分：默认仅 1 位「一位X期主人公」为画面焦点；夫妻/父子/母子等同框双主角时见【多主人公例外】；配角为「几位背景配角」；禁止写黑色素体；${NARRATION_STAGE_HAIR_LLM_RULE}；主人公写正常卡通脸，配角正面写小圆点眼`

/** LLM 配图：年代氛围与服装（统一标准） */
export const NARRATION_ERA_CLOTHING_LLM_RULE =
  '【年代与着装】年代氛围写「八十年代市井」「九十年代城镇」等概括词，禁止具体年份数字（1980、1990、19XX）及 vintage/retro/复古滤镜；【画面主体】须写主人公与可见配角的年代化简化服装；【年代场景】写地点环境与陈设道具'

/** 解说配图万能模板：画风规格维固定正文（原无前缀前缀块，不含【】） */
export const NARRATION_UNIVERSAL_STYLE_SPEC_BODY =
  `16:9 横屏，2D 扁平插画，全员${NARRATION_CROWD_BODY}简笔身形纯色平涂无复杂光影（${NARRATION_CROWD_FACE}），黑色轮廓线，${NARRATION_BODY_CONSISTENCY_CORE}`

/** 解说配图动漫风格：画风规格维固定正文 */
export const NARRATION_ANIME_STYLE_SPEC_BODY =
  '16:9 横屏，现代高质量 2D 动漫插画，清晰线稿，赛璐璐平涂结合柔和渐变，正常青年头身比（非Q版非三头身），大而富有表现力的动漫眼睛带瞳孔高光，日常叙事 slice-of-life 质感，低饱和写实配色'

/** 动漫风格禁止偏离项 */
export const NARRATION_ANIME_STYLE_FORBIDDEN =
  '禁止Q版三头身、像素风、3D渲染、真人照片、厚涂肌理、条漫、半写实数字绘画'

/** 动漫风格固定后缀 */
export const NARRATION_ANIME_SCENE_SUFFIX =
  '电影感叙事构图，干净整洁的画面，无文字无水印'

/** LLM 写【质感要求】时的短补充项（动漫） */
export const NARRATION_ANIME_TEXTURE_LLM_HINT =
  '清晰线稿，赛璐璐平涂与柔和渐变，表情夸张生动，环境陈设有细节，无文字无水印'

/** 动漫/动态漫：统一人物审美（不写胖瘦体型词，只保持正常头身比动漫风） */
export const NARRATION_NATURAL_BODY_AESTHETIC_LLM_RULE = [
  '【人物审美·硬性】全片统一正常头身比动漫/漫画人物（以【画风规格】为准），禁止写「微胖」「肥胖」「瘦削」「腰腹略鼓」「肩背厚实」等胖瘦体型词；',
  '禁止写「躯干X份高×Y份宽」「三头身」「圆头直径」等素体份数计量；',
  '【画面主体】只写发型、表情、服装、姿态与道具，不要额外描写肩腰肚胖瘦；情绪只改表情（汗珠/脸红/眼神）。',
].join(' ')

/** @deprecated 动漫/动态漫不再按档位写体型，仅保留类型供素体模式使用 */
export type AnimeBodyBuild = 'slim' | 'average' | 'stocky' | 'chubby' | 'obese'

/** @deprecated 动漫/动态漫配图不再注入胖瘦体型描述 */
export const NARRATION_ANIME_BODY_DESCRIPTORS: Record<AnimeBodyBuild, string> = {
  slim: '偏瘦匀称身材，肩窄腰直，腹部平坦，四肢修长',
  average: '标准匀称身材，肩腰比例正常，腹部平坦，体态健康',
  stocky: '敦实健壮身材，肩背略宽，腰腹紧实，四肢有力',
  chubby: '微胖体型，腰腹略鼓，肩背略厚，四肢偏圆润但不臃肿',
  obese: '明显肥胖身材，腰腹突出圆润，肩背宽厚，整体体量较大',
}

/** 动漫配图：写 prompt 用分析流程 */
export const NARRATION_ANIME_LLM_ANALYSIS_STEPS_PROMPT = [
  '1) 通读 full_narration（及 previous_episode_narration 若有），把握全文主线、人物关系、地点变迁、核心物件与情绪节奏',
  '2) 读 prior_narration 与 characters，提取已出现地点、陈设载体、具体物件名、服装款式、人生阶段；同一配图段内主人公服装款式+#hex 主色须锁定一致',
  '3) 读 narration_lines 确定本配图段叙事锚点；先锁定单帧（位置+姿态+动作+表情），再按动漫模板六维填空',
  '4) 按 NARRATION_ANIME_SCENE_BODY_TEMPLATE 写出丰富 prompt，结合 full_narration 与 prior_narration；禁止只贴段内字面',
] as const

/** @deprecated 使用 NARRATION_NATURAL_BODY_AESTHETIC_LLM_RULE */
export const NARRATION_ANIME_BODY_CONSISTENCY_LLM_RULE = NARRATION_NATURAL_BODY_AESTHETIC_LLM_RULE

/** @deprecated 动漫/动态漫不再按体重弧线改体型 */
export const NARRATION_ANIME_BODY_WEIGHT_ARC_LLM_RULE = ''

/** 动漫 / 动态漫：是否用自然语言锁定全片主人公体型（禁止素体份数计量） */
export function usesNarrationNaturalBodyLock(style?: string | null): boolean {
  return isNarrationAnimeStyle(style) || isMotionComicStyle(style)
}

/** 剥离外貌/定妆中的素体份数与胖瘦体型词 */
export function stripBodyMeasureSpecsFromAppearance(appearance?: string | null): string {
  return stripProtagonistBodyWeightPhrases(
    String(appearance || '')
      .replace(/躯干[\d.]+\s*份\s*高\s*[×xX]\s*[\d.]+\s*份\s*宽(?:\s*（[^）]*）)?/g, '')
      .replace(/站立总高[\d.]+份[^，,；;\n]*/g, '')
      .replace(/圆头[\d.]+份[^，,；;\n]*/g, ''),
  )
}

/** 从角色设定/全文推断主人公审美锚点（固定正常头身比动漫风，不写胖瘦） */
export function inferEpisodeAnimeBodyDescriptor(
  _fullNarration: string[],
  _characters?: Array<{ appearance?: string | null; role?: string | null; name?: string | null }>,
): string {
  return '正常头身比标准动漫身材匀称'
}

export function inferEpisodeAnimeBodyBuild(fullNarration: string[]): AnimeBodyBuild {
  const text = fullNarration.join('\n')
  const arc = detectNarrationWeightArcTheme(fullNarration)
  if (arc?.active) {
    if (/肥胖|臃肿|圆滚滚|肚腩|超重/.test(text) && !/瘦下来|减肥成功|瘦身逆袭/.test(text.slice(-800))) {
      return 'obese'
    }
    if (/减肥|瘦下来|瘦身|逆袭/.test(text)) return 'slim'
    return 'chubby'
  }
  if (NARRATION_BODY_WEIGHT_OBESE_RE.test(text)) return 'obese'
  if (NARRATION_BODY_WEIGHT_CHUBBY_RE.test(text)) return 'chubby'
  if (NARRATION_BODY_WEIGHT_SLIM_RE.test(text)) return 'slim'
  if (/健壮|魁梧|敦实|肌肉/.test(text)) return 'stocky'
  return 'average'
}

const ANIME_MINIMAL_BODY_MEASURE_RE =
  /，?躯干\s*[\d.]+\s*份\s*高\s*[×xX]\s*[\d.]+\s*份\s*宽(?:\s*（[^）]*）)?|（腰腹圆润略鼓）|（瘦削匀称腰腹平坦）|（标准匀称）|（明显肥胖[^）]*）|（腰腹微鼓）|（偏胖[^）]*）/g

const NARRATION_BODY_WEIGHT_PHRASE_RE =
  /(?:微胖|偏胖|略胖|肥胖|臃肿|超重|圆滚|肥硕|瘦削|精瘦|苗条|纤瘦|丰满|壮实|敦实|健壮|魁梧)(?:体型|身材)?[^，,；;）)]{0,24}|(?:身材|体型|体格)[^，,；;\n]{2,40}|(?:腰腹|肩背|腹部|肚腩)[^，,；;）)]{0,16}/g

function stripProtagonistBodyWeightPhrases(text: string): string {
  return String(text || '')
    .replace(ANIME_MINIMAL_BODY_MEASURE_RE, '')
    .replace(NARRATION_BODY_WEIGHT_PHRASE_RE, '')
    .replace(/，{2,}/g, '，')
    .replace(/^，|，$/g, '')
    .trim()
}

/** 清洗动漫/动态漫 prompt 中误入的胖瘦体型词与素体份数，不注入体型描述 */
export function normalizeAnimeProtagonistBodyInPrompt(
  prompt: string,
  _lockedBody?: string | null,
): string {
  return prompt
    .replace(ANIME_MINIMAL_BODY_MEASURE_RE, '')
    .replace(/【画面主体[：:]([^】]*)】/g, (_, raw) => `【画面主体：${stripProtagonistBodyWeightPhrases(String(raw))}】`)
}

/** 按画风取【画风规格】固定正文 */
export function getNarrationStyleSpecBody(style?: string | null): string {
  const key = String(style || '').trim().toLowerCase()
  if (key === NARRATION_ANIME_STYLE) return NARRATION_ANIME_STYLE_SPEC_BODY
  if (key === MOTION_COMIC_STYLE) return MOTION_COMIC_STYLE_SPEC
  return NARRATION_UNIVERSAL_STYLE_SPEC_BODY
}

/** 画风规格维标签（七维之首：画幅/线稿/素体比例等固定文风，与具体场景无关） */
export const NARRATION_STYLE_SPEC_DIM_LABEL = '画风规格'

/** 组装【画风规格】 bracket */
export function formatNarrationStyleSpecBracket(body?: string | null, style?: string | null): string {
  const content = String(body || getNarrationStyleSpecBody(style)).trim()
  return `【${NARRATION_STYLE_SPEC_DIM_LABEL}：${content}】`
}

/** @deprecated 使用 NARRATION_UNIVERSAL_STYLE_SPEC_BODY */
export const NARRATION_UNIVERSAL_SCENE_PREFIX = NARRATION_UNIVERSAL_STYLE_SPEC_BODY

/** 解说配图万能模板：固定后缀 */
export const NARRATION_UNIVERSAL_SCENE_SUFFIX =
  '柔和平涂，温馨叙事插画感，干净整洁的画面，无文字无水印'

/** 解说视频模式：核心画风固定关键词（LLM 参考用） */
export const NARRATION_IMAGE_STYLE_CORE =
  `全员${NARRATION_CROWD_BODY}（${NARRATION_CROWD_FACE}）、黑色轮廓线、纯色平涂、${NARRATION_BODY_CONSISTENCY_CORE}、温馨叙事插画风格、${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 群众/路人/顾客：白色素体，与主人公同款身形 */
export const NARRATION_CROWD_STYLE_HINT =
  `顾客、路人、群众等配角一律写成「几位${NARRATION_CROWD_BODY}配角」，位置在两侧/背景/后方/讲台等不抢焦点处，简化低饱和便装，不得与主人公抢焦点；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 解说配图场景六维（不含画风规格） */
export const NARRATION_SCENE_DIM_LABELS = [
  '画面主体',
  '年代场景',
  '核心细节动作',
  '光影色调',
  '镜头视角',
  '质感要求',
] as const

/** 解说配图万能模板七维标签（画风规格 + 场景六维） */
export const NARRATION_SIX_DIM_LABELS = [
  NARRATION_STYLE_SPEC_DIM_LABEL,
  ...NARRATION_SCENE_DIM_LABELS,
] as const

/** 解说配图七维结构（LLM 与规则兜底共用） */
export const NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE =
  '每条 image_prompt 必须按以下七维顺序撰写（【】标签必填）：【画风规格】→【画面主体】→【年代场景】→【核心细节动作】→【光影色调】→【镜头视角】→【质感要求】；【画风规格】全文固定照抄标准文风规格，禁止改写；以 narration_lines 为段内锚点，须结合 full_narration 与 prior_narration 丰富场景、陈设、动作与情绪，禁止照抄旁白原文或只写空泛场所'

/** LLM：【画风规格】维须原样照抄的固定文风 */
export const NARRATION_STYLE_SPEC_LLM_RULE =
  `【画风规格·固定】须原样写入：${NARRATION_UNIVERSAL_STYLE_SPEC_BODY}；禁止改写、禁止在此维写具体人物姿态或场景（姿态/位置只在【画面主体】）`

/** LLM：【镜头视角】须以完整主人公为朝向，禁止肢体局部特写当主 framing */
export const NARRATION_PARTIAL_CLOSEUP_LLM_RULE =
  '【禁止肢体局部特写】素体小人须保持统一比例：【画面主体】写全身/大半身姿态时，【镜头视角】禁止「近景特写/大特写/镜头朝向裤脚/鞋/手/猫爪/接触点」等以肢体局部为主 framing；【光影色调】禁止「聚焦于裤脚/鞋/猫爪」而不写主人公整体；脚边/猫爪/勾裤脚等互动须写「同一主人公从头顶到裤脚完整入镜」「猫爪勾住该同一主人公裤脚」，禁止第二个人的腿/鞋/巨型裤腿；推荐机位：中景或中近景略俯/略仰，镜头朝向主人公整体，脚边互动在其身体下方同一画面'

/** 解说配图万能模板：七维正文（【画风规格】+ 场景六维） */
export const NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE =
  `【画风规格：照抄固定文风规格】，【画面主体：无配角时写「一位主人公位于{位置}以{姿态}（人生阶段+身穿#hex款式简笔轮廓+正常卡通脸表情），无配角」；有配角时写「一位主人公位于{位置}以{姿态}（…），一位或几位配角位于{配角位置}（穿#64748b低饱和便装，两个小圆点眼）」；姿态须与{姿态}一致，禁止写「画面中心前景站立」与躺卧/侧卧/休息矛盾；脚边/猫爪互动须写「同一主人公的裤脚/脚边」，禁止第二个人的腿或鞋】，【年代场景：时代氛围+具体地点；有载体时写「载体+陈列物件名」】，【核心细节动作：无配角时只写猫/道具/环境互动（勿写主人公）；有配角时写配角动作（勿写主人公，主人公只在【画面主体】出现一次）；猫勾裤脚等只写猫的动作，不写「主人公裤脚」】，【光影色调：光线明暗、时段、冷暖与剧情情绪；禁止只写「聚焦于裤脚/猫爪」而不照主人公整体】，【镜头视角：中景或中近景，镜头朝向该姿态下的主人公整体；禁止近景特写对准裤脚/鞋/手/猫爪/接触点】，【质感要求：柔和平涂，简化服装轮廓，正常卡通脸表情，无文字无水印】`

/** LLM：【年代场景】陈设（权威表述，纯 AI 输出，无后处理补全） */
export const NARRATION_FIXTURES_LLM_RULE =
  '【年代场景·陈设】陈设唯一写入【年代场景】：有摊位/货架/柜台/桌面/展台/铺面等载体时，必须写「载体+上陈列/摆放+具体物件名称」（从 prior_narration、full_narration 或 narration_lines 提取）；句式「{场所}，{载体}上陈列{物件甲}与{物件乙}」；同场所可从 prior 延续仍相关物件，场景/经营形态切换时重设；须与【核心细节动作】展示行为一致；禁止货物/商品/货物堆/各类商品等泛称；无载体则只写场所'

/** @deprecated 使用 NARRATION_FIXTURES_LLM_RULE */
export const NARRATION_FIXTURES_FORMAT_LLM_RULE = NARRATION_FIXTURES_LLM_RULE

/** @deprecated 使用 NARRATION_FIXTURES_LLM_RULE */
export const NARRATION_FIXTURES_DISPLAY_LLM_RULE = NARRATION_FIXTURES_LLM_RULE

/** 默认镜头视角 */
export const NARRATION_DEFAULT_CAMERA_PROMPT = '中景平视，叙事解说构图，主体清晰'

/** 素体画风质感要求（写入【质感要求】） */
export const NARRATION_MINIMAL_TEXTURE_PROMPT =
  `2D扁平插画，全员${NARRATION_CROWD_BODY}（${NARRATION_CROWD_FACE}），黑色轮廓线，纯色平涂，${NARRATION_BODY_CONSISTENCY_CORE}，${NARRATION_MINIMAL_STYLE_FORBIDDEN}，无文字无水印`

/** LLM 写【质感要求】时的短补充项（不重复前缀画风） */
export const NARRATION_MINIMAL_TEXTURE_LLM_HINT =
  '柔和平涂，简化服装轮廓，正常卡通脸表情，无文字无水印'

/** LLM 配图：七维去冗余（画风规格/后缀已含固定画风） */
export const NARRATION_LLM_ANTI_REDUNDANCY_RULE =
  '【去冗余】【画风规格】与后缀已含固定画风与无文字无水印；其余各维只写本镜独有信息；禁止在【画面主体】及以后维度重复【画风规格】已有的「16:9/2D扁平插画/素体小人/三头身/正常卡通脸/无复杂光影」等短语；同一关键词全文最多出现一次；禁止在末尾再追加第二遍画风说明'

/** LLM：素体须符合通用尺寸规格；有体重弧线时按档位写躯干宽高 */
export const NARRATION_BODY_CONSISTENCY_LLM_RULE =
  `【通用素体尺寸】圆头直径全片锁定为画面高12%（1份），跨镜头禁止变大变小；${NARRATION_BODY_LINE_WEIGHT_ANCHOR}；【画面主体】须标明人生阶段；有 weight_arc 或 suggested_body_weight_tier 时须写对应档位具象躯干宽高（obese/chubby/slim），同一配图段内一致、跨配图段可随剧情变化；无体重弧线时按阶段执行：${NARRATION_BODY_STAGE_SIZE_HINTS}；标尺由【画风规格】承担，【质感要求】不必重复；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** LLM 写配图 prompt：光影色调须贴合全文剧情（写入【光影色调】） */
export const NARRATION_ATMOSPHERE_LLM_RULE =
  '【光影色调】结合 full_narration、prior_narration 与 narration_lines 写光线明暗、时段、冷暖、人气喧闹或寂静、经营旺衰等可见基调（2–4个短语）；须与【年代场景】【核心细节动作】及全文情绪曲线一致；只写可见光影与色调，不写内心独白'

/** 解说配图万能模板：LLM 唯一结构规范（七维分工与一致性均在此，禁止另加补丁规则） */
export const NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE = [
  `【万能模板】完整 prompt = ${formatNarrationStyleSpecBracket()} + 场景六维 + ${NARRATION_UNIVERSAL_SCENE_SUFFIX}；${NARRATION_LLM_ANTI_REDUNDANCY_RULE}`,
  NARRATION_STYLE_SPEC_LLM_RULE,
  `【七维正文·严格按序填空】${NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE}`,
  '【单帧一致】写七维前先锁定唯一可画瞬间（主人公位置+姿态+动作）；【画面主体】须同时写清位置与姿态，【核心细节动作】【镜头视角】须同一瞬间同一位置同一姿态，禁止动作维再写与主体不同的姿态；与【年代场景】【光影色调】同空间同氛围；配角须与主人公逗号分句分开写位置，禁止挤在同一括号内。',
  '【无配角单帧】旁白无其他人物时【画面主体】须写「无配角」；禁止同时出现站立展示与躺卧/侧卧/休息两种姿态（文生图易画两个同款主人公）；【画风规格】只写通用三头身比例，勿写「标准站姿」「中心前景站立」等与{姿态}冲突的词',
  NARRATION_PARTIAL_CLOSEUP_LLM_RULE,
  NARRATION_MINIMAL_CLOTHING_LLM_RULE,
  NARRATION_MINIMAL_EXPRESSION_LLM_RULE,
  NARRATION_STAGE_HAIR_LLM_RULE,
  NARRATION_DUAL_PROTAGONIST_LLM_RULE,
  NARRATION_CROWD_EYE_LLM_RULE,
  NARRATION_FIXTURES_LLM_RULE,
  NARRATION_ATMOSPHERE_LLM_RULE,
  NARRATION_ERA_CLOTHING_LLM_RULE,
  `【质感要求】仅写「${NARRATION_MINIMAL_TEXTURE_LLM_HINT}」，禁止复述【画风规格】画风`,
].join(' ')

/** 解说配图动漫风格：LLM 七维结构规范（场景六维复用，仅替换画风/人物/质感规则） */
export const NARRATION_ANIME_STYLE_SPEC_LLM_RULE =
  `【画风规格·固定】须原样写入：${NARRATION_ANIME_STYLE_SPEC_BODY}；禁止改写、禁止在此维写具体人物姿态或场景`

/** 动漫风格七维正文模板 */
export const NARRATION_ANIME_SCENE_BODY_TEMPLATE =
  '【画风规格：照抄固定文风规格】，【画面主体：无配角时写「一位X期主人公（性别+发型+夸张表情，正常头身比）位于{位置}以{姿态}，身穿#hex款式，无配角」；有配角时写「一位主人公…，一位或几位配角位于{配角位置}（低饱和便装，简化动漫脸型）」；禁止写素体小人/圆点眼/三头身/份数计量/胖瘦体型词】，【年代场景：时代氛围+具体地点；有载体时写「载体+陈列物件名」】，【核心细节动作：无配角时只写猫/道具/环境互动；有配角时写配角动作（勿重复写主人公姿态）】，【光影色调：光线明暗、时段、冷暖与剧情情绪】，【镜头视角：中景或中近景，电影感叙事构图，朝向主人公整体】，【质感要求：清晰线稿，赛璐璐平涂与柔和渐变，表情夸张生动，无文字无水印】'

/** 动漫风格 LLM 唯一结构规范 */
export const NARRATION_ANIME_SIX_DIM_LLM_RULE = [
  `【动漫模板】完整 prompt = ${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)} + 场景六维 + ${NARRATION_ANIME_SCENE_SUFFIX}；${NARRATION_LLM_ANTI_REDUNDANCY_RULE}`,
  NARRATION_ANIME_STYLE_SPEC_LLM_RULE,
  `【七维正文·严格按序填空】${NARRATION_ANIME_SCENE_BODY_TEMPLATE}`,
  '【单帧一致】写七维前先锁定唯一可画瞬间（主人公位置+姿态+动作）；【画面主体】须写清位置、姿态与动漫表情；【核心细节动作】【镜头视角】须同一瞬间同一姿态；配角须与主人公分句写位置。',
  '【人物规格】主人公与配角均为正常头身比动漫人物，大眼睛带瞳孔高光，表情可夸张（紧张时可画汗珠、脸红、颤抖线）；禁止素体小人、圆点眼、三头身、Q版比例。',
  NARRATION_NATURAL_BODY_AESTHETIC_LLM_RULE,
  NARRATION_MINIMAL_CLOTHING_LLM_RULE,
  NARRATION_FIXTURES_LLM_RULE,
  NARRATION_ATMOSPHERE_LLM_RULE,
  NARRATION_ERA_CLOTHING_LLM_RULE,
  `【质感要求】仅写「${NARRATION_ANIME_TEXTURE_LLM_HINT}」，禁止复述【画风规格】画风；${NARRATION_ANIME_STYLE_FORBIDDEN}`,
].join(' ')

/** 动漫风格六维填表示例 */
export const NARRATION_ANIME_SCENE_BODY_EXAMPLE =
  `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【画面主体：一位青年期男性主人公（黑色略凌乱短发，大眼睛带高光，脸颊泛红、额头汗珠，表情紧张）位于客厅沙发前以坐姿僵直（身穿#64748b休闲T恤与#334155长裤），无配角】，【年代场景：现代都市客厅，蓝色布艺沙发、木质茶几上摆啤酒罐与烟盒】，【核心细节动作：头部周围画白色颤抖线强调紧张】，【光影色调：室内自然光偏冷，低饱和蓝灰色调】，【镜头视角：中近景平视，镜头朝向主人公面部与上半身】，【质感要求：${NARRATION_ANIME_TEXTURE_LLM_HINT}】`

/** @deprecated 已并入 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE */
export const NARRATION_FRAME_TRIAD_CONSISTENCY_LLM_RULE = NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE

/** @deprecated 已并入 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE */
export const NARRATION_PROTAGONIST_UNIFIED_LLM_RULE = NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE

/** @deprecated 已并入 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE */
export const NARRATION_MINIMAL_PLOT_VISIBILITY_LLM_RULE = NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE

/** @deprecated 已并入 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE */
export const NARRATION_SINGLE_PROTAGONIST_LLM_RULE = NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE

/** @deprecated 已并入 NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE */
export const NARRATION_PROTAGONIST_PLOT_LLM_RULE = NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE

/** LLM：群众/路人须为白色素体配角 */
export const NARRATION_CROWD_PLOT_LLM_RULE =
  `【配角一致】顾客、路人、群众写成「几位${NARRATION_CROWD_BODY}配角」，有明确互动角色（如老师/店员）可写「一位配角位于讲台/柜台/前方」；位置在两侧/背景/后方/讲台等不抢焦点处（两个小圆点眼小眼睛，${NARRATION_MINIMAL_LIMBS_SPEC}），穿#64748b低饱和便装或穿#5f7a6e低饱和校服等 #hex 简化服装，动作从简，不得与主人公服装 #hex 相同；${NARRATION_CROWD_EYE_LLM_RULE}；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`
export const NARRATION_VEHICLE_LLM_RULE =
  '交通工具须严格按旁白写：自行车/二八杠≠手推车/板车；旁白写自行车或二八杠时写「推着自行车」或「二八杠自行车轮廓」，禁止写成手推车；旁白写手推车/板车时才写手推车；旁白未提及任何车辆时禁止臆造推车或自行车'

/** 配图换镜检测：needs_image=true 的锚点数量占镜头数的比例下限（LLM 硬性约束） */
export const NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO = 0.25

/** 配图换镜检测：needs_image=true 的锚点数量占镜头数的比例上限 */
export const NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO = 0.35

/** 每张配图覆盖的镜头数下限（含锚点镜） */
export const NARRATION_IMAGE_SEGMENT_MIN_SHOTS = 2

/** 每张配图覆盖的镜头数上限（含锚点镜） */
export const NARRATION_IMAGE_SEGMENT_MAX_SHOTS = 4

/** 配图换镜检测：超过该镜头数时默认分批调用 LLM（0=不分批） */
export const NARRATION_IMAGE_DETECT_BATCH_THRESHOLD_DEFAULT = 80

/** 配图换镜检测：分批时每批覆盖的镜头数上限 */
export const NARRATION_IMAGE_DETECT_BATCH_SIZE_DEFAULT = 30

/** 配图文案生成：每批段落数默认值 */
export const NARRATION_IMAGE_PROMPT_BATCH_SIZE_DEFAULT = 6

/** 配图文案生成：每批段落数下限 */
export const NARRATION_IMAGE_PROMPT_BATCH_SIZE_MIN = 1

/** 配图文案生成：每批段落数上限 */
export const NARRATION_IMAGE_PROMPT_BATCH_SIZE_MAX = 20

/** LLM 配图：换镜检测用分析流程 */
export const NARRATION_LLM_ANALYSIS_STEPS_DETECT = [
  '1) 通读 full_narration，把握全文主线与场景节奏',
  '2) 读 previous_episode_narration / prior 上下文，理解已出现地点与物件',
  '3) 对每句旁白判定 needs_image：true=本句须开新配图，false=沿用上一张',
] as const

/** LLM 配图：写 prompt 用分析流程 */
export const NARRATION_LLM_ANALYSIS_STEPS_PROMPT = [
  '1) 通读 full_narration（及 previous_episode_narration 若有），把握全文主线、人物关系、地点变迁、核心物件与情绪节奏；若有 weight_arc 须识别肥胖→减肥→逆袭的体重变化时间线',
  '2) 读 prior_narration、characters 与 suggested_body_weight_tier，提取已出现地点、陈设载体、具体物件名、服装款式、人生阶段与体重档位；同一配图段内主人公服装款式+#hex 主色与躯干宽高须锁定一致',
  '3) 读 narration_lines 确定本配图段叙事锚点；先锁定单帧（位置+姿态+动作+体重档位），再按万能模板六维填空',
  '4) 按 NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE 写出丰富 prompt，结合 full_narration 与 prior_narration；禁止只贴段内字面',
] as const

/** @deprecated 使用 NARRATION_LLM_ANALYSIS_STEPS_PROMPT */
export const NARRATION_LLM_ANALYSIS_STEPS = NARRATION_LLM_ANALYSIS_STEPS_PROMPT

/** LLM 配图 prompt：段内锚点 + 全文丰富 */
export const NARRATION_PARAGRAPH_FULL_COVERAGE_LLM_RULE =
  '本配图段以 narration_lines 为叙事锚点，须覆盖段内每一句要点；同时结合 full_narration 与 prior_narration 丰富场景、陈设、动作与氛围；可组织为一个代表性瞬间，但该瞬间须能体现段内全部要点并承接全文上下文，禁止只写段内首句字面而遗漏段内其它信息或全文已建立的环境细节'

/** @deprecated 使用 NARRATION_PARAGRAPH_FULL_COVERAGE_LLM_RULE */
export const NARRATION_PARAGRAPH_KEY_MOMENT_LLM_RULE = NARRATION_PARAGRAPH_FULL_COVERAGE_LLM_RULE

/** LLM 写配图 prompt：如何通读全文 */
export const NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE =
  '写每条配图 prompt 前须先通读 full_narration（及 previous_episode_narration 若有），按时间线把握人物关系、地点变迁、职业/经营形态、反复出现的物件与情绪曲线；再读 prior_narration 与 narration_lines 确定本段锚点；画面设计以全文为依据丰富细节，而非仅翻译当前段落'

/** LLM 配图：以全文剧情丰富画面，不单贴当前段落 */
export const NARRATION_FULL_PLOT_ENRICHMENT_LLM_RULE =
  '【全文丰富】narration_lines 只定本配图段的叙事锚点与情绪，但每条 prompt 须结合 full_narration、prior_narration、characters、detect_scene_description（若有）与全文时间线，主动丰富【年代场景】的环境细节、【年代场景·陈设】的具体物件、【核心细节动作】的可视化动作与互动、【光影色调】的剧情氛围；禁止只复述 narration_lines 首句或段内字面、禁止空泛场所（如只写「室内」「商店」而不写陈设载体与物件）、禁止省略 prior/全文已建立的关键道具与生活/经营细节；须推断出完整可画的单帧瞬间，让观众不看字幕也能懂剧情'

/** LLM 写配图 prompt：物件/品类全文连贯（通用） */
export const NARRATION_PLOT_CONTINUITY_LLM_RULE =
  '【物件连贯】陈设/物件/服装须能在 full_narration、prior_narration 或 narration_lines 中找到依据或合理推断；同一场所可从 prior 与全文前文延续仍相关物件并补充具体名称；场景/时代/经营形态切换时重设，禁止无关物件混搭；有具体名称必须写具体名称，禁止泛称'

/** LLM 配图：同一配图段内主人公服装款式与主色锁定，换段可换装 */
export const NARRATION_PARAGRAPH_OUTFIT_CONTINUITY_LLM_RULE =
  '【段落内服装锁定】同一配图段（同一 start_index / paragraph_index；含 layout=diptych 的【左格】【右格】）内，主人公仅一套简化服装，款式与 #hex 主色须完全一致，禁止同段内左格 #ff6b9d花衬衫、右格 #2563ebT恤 或同 prompt 内两套不同 #hex；换配图段（不同 start_index）时，若旁白未明确换装/更衣/洗澡/换季/改行/时段大跳转，须延续上一段主人公服装款式与 #hex；旁白明确换装或场景大切换后，新段可更换服装，但新段内须再次锁定直至下一段；本批 paragraphs 逐段独立检查，不得段内乱换 #hex'

/** LLM 配图：就寝场景仅换款式词，不换 #hex 主色 */
export const NARRATION_SLEEP_OUTFIT_CONTINUITY_LLM_RULE =
  '【就寝换装·保主色】入睡、半夜醒来、盖被休息、床上侧卧/躺卧等就寝场景：须延续上一配图段主人公已锁定的 #hex 主色（上装 hex 与下装 hex 均不变），仅将款式词改为同色系家居服/睡衣/睡裤（如 #6b7280短袖衬衫→#6b7280睡衣、#1f2937长裤→#1f2937睡裤）；禁止就寝场景另起全新 #hex（如 #1e40af）除非 prior 段已是该 hex 或旁白明确洗澡更衣换洗衣物'

/** @deprecated 使用 NARRATION_FIXTURES_LLM_RULE */
export const NARRATION_FIXTURES_CONTINUITY_LLM_RULE = NARRATION_FIXTURES_LLM_RULE

/** 六维正文填表示例（硬性规则用，模型须替换为旁白真实内容） */
export const NARRATION_UNIVERSAL_SCENE_BODY_EXAMPLE =
  `${formatNarrationStyleSpecBracket()}，【画面主体：一位青年期白色素体小人主人公位于夜市摊位前以站立姿态伸手整理花衬衫（${NARRATION_MINIMAL_LIMBS_SPEC}，正常卡通脸热情微笑，身穿#ff6b9d花衬衫与#333333喇叭裤鲜明简笔轮廓），三位白色素体小人配角位于两侧背景（穿#64748b低饱和市井便装，两个小圆点眼，表情从简）】，【年代场景：八十年代市井夜市，木质摊位上陈列花衬衫与喇叭裤与成捆布料】，【核心细节动作：配角在两侧挑选货物】，【光影色调：暖黄夜市灯光，喧闹市井人气】，【镜头视角：中景平视，镜头朝向摊位前站立的主人公，主体清晰】，【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}】`

/** LLM 配图正反例（素体模式） */
export const NARRATION_LLM_PROMPT_GOOD_BAD_EXAMPLES = [
  '正反例（须从旁白提取真实内容，勿照抄）：',
  `✓ 【画面主体：青年期${NARRATION_PROTAGONIST_BODY}主人公身穿#ff6b9d花衬衫与#333333喇叭裤简笔轮廓…】，【年代场景：…】，【核心细节动作：…】，【光影色调：…】`,
  `✓ 【画面主体：两位中年期${NARRATION_PROTAGONIST_BODY}主人公（圆头无头发、躯干1.15份宽，正常卡通脸）并肩位于前景…】（夫妻/父子等同框双主角须同阶段同规格）`,
  `✓ 【画面主体：一位青年期${NARRATION_PROTAGONIST_BODY}主人公位于楼道站立低头看脚边…，【核心细节动作：一只狸花猫伸爪勾住裤脚】，【镜头视角：中近景略俯拍，同一主人公从头顶到裤脚完整入镜，猫爪在该主人公裤脚上】`,
  `✓ 【画面主体：一位青年期${NARRATION_PROTAGONIST_BODY}主人公位于教室后排课桌处以趴桌姿态伏低（穿#3b82f6短袖…），一位配角位于后方讲台（穿#4b5563低饱和西装）】…【核心细节动作：配角在讲台手持点名册指向下方（勿写主人公）】…【镜头视角：中景平视，镜头朝向趴桌姿态的主人公】`,
  `✓ 【画面主体：一位少年期${NARRATION_PROTAGONIST_BODY}主人公位于餐桌前以坐姿（躯干0.85份高×1.10份宽，少年肥胖圆滚肚子，正常卡通脸开心，身穿#fbbf24短袖…）…】（肥胖主题须写具象躯干宽高，禁止只写三头身）`,
  '✗ 【镜头视角】近景特写，镜头朝向裤脚与猫爪接触点（与全身主人公冲突，易生成巨型裤腿/第二个人的腿）',
  '✗ 【光影色调】聚焦于裤脚与猫爪互动（不写主人公整体，易把裤腿画成独立主体）',
  '✗ 【核心细节动作】再写「主人公保持趴桌…」（与【画面主体】重复，文生图会画两个同款主人公）',
  '✗ 【画面主体：仅写素体小人无服装】（须写与年代匹配的简化服装）',
  '✗ 【画面主体】写中心前景站立 + 【核心细节动作】写后排趴桌（三镜矛盾，会生成两个同款主人公）',
  '✗ 【画面主体】侧卧/躺卧休息 + 前缀或主体含「标准站姿」「中心前景站立」（姿态冲突，文生图易画站立+躺卧两个同款主人公）',
  '✗ 就寝场景把 #6b7280+#1f2937 日装换成全新 #1e40af 睡衣（须保主色仅改款式词，见【就寝换装·保主色】）',
  '✗ 【画面主体】主人公与配角挤在同一括号用「与一位配角」连接（须分开写各自位置）',
  '✗ 【画面主体：身穿亮黄色T恤与蓝色短裤】（禁止中文色词，须写 #ffd700、#2563eb 等 #hex）',
  '✗ 【画面主体：身穿#2563eb 短裤】（#hex 与款式词之间禁止空格）',
  '✗ 【质感要求：2D扁平插画，主人公白色素体…】（禁止复述前缀画风）',
  '✗ 只写 narration_lines 首句字面，场景空泛、无具体陈设与动作（须结合全文丰富环境/物件/互动）',
  '✗ 段内句子很短就只写一句抽象话，忽略 prior/全文已交代的地点、道具与经营细节',
  '✗ 主人公与配角服装 #hex 相同、都居中、难以分辨谁是主角',
  '✗ 同一段 diptych 左格与右格主人公服装 #hex/款式不同（同段须同一套服装）',
  '✗ 同一配图段内【画面主体】写两套不同 #hex 服装或同段内随机换色',
  '✗ 配角写穿低饱和便装却不写 #hex（须写穿#64748b低饱和便装）',
  '✗ 夫妻同框却一青年一中年，或中年主人公写白发（青年/中年均无头发，仅老年可有白发）',
  '✗ 【画面主体】只写「青年期」不写具象规格，或同段青年与中年体型混用（须按阶段表锁定总高与躯干宽高）',
  '✗ 肥胖/减肥主题却【画面主体】只写标准匀称三头身、不写躯干1.30份宽等档位规格（须见 weight_arc / suggested_body_weight_tier）',
  '✗ 群众配角正面出镜却写圆眼大卡通脸（配角正面须小圆点眼）',
].join('\n')

/** 两宫格六维输出格式（layout=diptych） */
export const NARRATION_DIPPTYCH_SIX_PART_LLM_RULE =
  `layout=diptych：单张 16:9 横向两宫格；左、右格各写完整六维，格式为【左格】【画面主体：…】，【年代场景：…】，【核心细节动作：…】，【光影色调：…】，【镜头视角：…】，【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}】，【右格】【画面主体：…】…【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}】；禁止旧式【左格场景与剧情】；各格【质感要求】禁止复述前缀画风；每一格全画面仅 1 位${NARRATION_PROTAGONIST_BODY}主人公（${NARRATION_MINIMAL_LIMBS_SPEC}）；左格与右格主人公服装款式与 #hex 主色须完全一致，仅动作/机位/表情可不同`

export const NARRATION_SCENE_PLOT_QUALITY_LLM_RULE =
  '【年代场景】与【核心细节动作】须在同一空间；【核心细节动作】须写成素体小人可见的具体动作与互动（含配角陪衬），结合全文推断而非只摘 narration_lines 一句；抽象感慨/评价句须据全文剧情推断成可画瞬间（含相应场景陈设）'

/** LLM 配图：禁止暴力血腥画面，改写为温和司法/羁押情节 */
export const NARRATION_VIOLENCE_CONTENT_LLM_RULE =
  '【内容合规】禁止描写斩首、尸体、尸首、断颈、血腥、血迹、杀戮、凶杀、处决、砍头、人头落地、残肢、血肉模糊、恐怖虐杀等暴力画面；旁白涉及刑案/杀人/处决时，改写为牢狱候审、押解待审、公堂问讯、铁链羁押、牢房静坐、衙役押送等温和可画瞬间，只表现司法流程与人物姿态，不表现伤害过程与遗体'

/** LLM 配图：禁止暴力词替换残留，六维全文须语义通顺的温和改写 */
export const NARRATION_VIOLENCE_NO_FRAGMENT_LLM_RULE =
  '【禁止替换残留】暴力血腥禁止出现在任一维度（【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】及画风前后缀）；严禁对暴力词做单词替换后拼凑（如「尸体」改「牢狱候审」却写「倒地的…牢狱候审」「旁边有…牢狱候审」）；必须整句重写为完整、通顺、无伤亡暗示的温和司法画面，不得残留倒地不动、刀刃近颈、地面血迹、刑架处决等可视化伤亡'

/** LLM 配图写法抽象示例（不含具体故事情节，模型须从输入旁白中提取内容） */
export const NARRATION_LLM_PROMPT_PATTERN =
  `prior 已交代物件 + narration_lines 描述场所活动 →【画面主体：一位${NARRATION_PROTAGONIST_BODY}主人公位于{与动作一致的位置}，配角单独分句写位置】，【年代场景：时代+地点+载体上陈列的具体物件名】，【核心细节动作：该位置可见动作】，【光影色调：光线色调】，【镜头视角：景别机位，朝向该位置主人公】，【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}，不重复前缀画风】`

/** LLM 写片头标题图 prompt 时的规则（通用） */
export const NARRATION_TITLE_IMAGE_LLM_RULE =
  `片头标题图须综合 full_narration 全文，提炼最能概括本期核心的【片头背景场景】与【主题氛围】；绝对无文字；背景若出现人物，全画面仅 1 位${NARRATION_PROTAGONIST_BODY}主人公（${NARRATION_PROTAGONIST_EYES}，${NARRATION_MINIMAL_LIMBS_SPEC}），其余为${NARRATION_CROWD_BODY}或无人`

/** LLM 多集连贯：上集旁白作为上下文，索引仍只针对本集 */
export const NARRATION_PREVIOUS_EPISODE_LLM_RULE =
  '若输入含 previous_episode_narration（上集正文旁白，按时间顺序），须先通读以理解人物、地点与剧情延续；full_narration 仅含本集旁白；needs_image / start_index 均只针对本集 sentences；prior_narration = previous_episode_narration + 本集锚点之前旁白'

/** 旁白字幕关键词强调（独立 LLM 调用，不与配图六维混批） */
export const NARRATION_SUBTITLE_EMPHASIS_LLM_RULE = [
  '须先通读 full_narration（及 title_hook 若有）理解本期人生主题、情绪曲线与关键转折，再为本批句子标注；强调词须贴合全文语境，帮观众快速代入「你」的处境与感受，并在屏上形成视觉焦点（黄字加大）。',
  '为每句 tts_sentences / sentences 输出等长 subtitle_lines 或 marked_sentences，逐句一一对应；不得改字删字增字，只允许用 ** 包裹 1 个连续词/短语（2～8 字）；每句最多 1 处 **，无合适强调词则原句照抄。',
  '标注重心（三选一，优先顺序）：① 关键情感——犹豫、后悔、心动、不安、觉醒、崩溃、孤独、震惊、触动、失望、害怕、委屈、期待、死心、放手等内心感受词；② 具象物件——文中出现的具体可感知名词（花衬衫、煤油灯、手推车、摊位、账本、彩电、门面…），须从本句/全文提取，禁止「各类商品」「很多东西」等泛称；③ 关键动作——本句核心动词或动宾短语（辞职、摆摊、整理货物、扇蒲扇、押解候审、推车、挑选、喝茶…），2～6 字为宜。',
  '次要可标：与本期核心转折相关的固定词组（铁饭碗、万元户、摆地摊、离婚、下岗）；书名号「」内词。禁止标：任何纯数字/金额/年龄/百分比；空泛形容词（很好、非常、特别）；单独虚词或连词；与画面和情绪无关的抽象词。',
  '全文节奏：约每 2～3 句标 1 处，情感高点、物件首次出现、关键动作句可多标，平淡过渡句可不标。',
].join(' ')

/** 组装「旁白字幕强调」独立 LLM system prompt */
export function buildNarrationSubtitleEmphasisLLMSystem(): string {
  return [
    '你是解说视频字幕编辑。任务是为旁白逐句标注屏幕强调词，重点标出关键情感、具象物件、关键动作，让观众一眼代入。',
    NARRATION_SUBTITLE_EMPHASIS_LLM_RULE,
    '输入含 full_narration 时须结合全文后再标注本批 paragraphs；batch 内 index 仅针对本批 tts_sentences。',
    '只输出 JSON，格式：{"subtitle_results":[{"start_index":0,"subtitle_lines":["你心里**一阵犹豫**，…","第二句原文"]}]}',
    'subtitle_results 长度须与本批 paragraphs 相同；不要 markdown，不要解释。',
  ].join('\n')
}

/** 组装「解说稿第二阶段：整稿逐句加 **」LLM system prompt */
export function buildNarrationScriptEmphasisLLMSystem(): string {
  return [
    '你是解说视频字幕编辑。输入含 full_narration 与 title_hook，须先理解整稿后再标注本批 sentences；重点标关键情感、具象物件、关键动作。',
    NARRATION_SUBTITLE_EMPHASIS_LLM_RULE,
    'batch_sentence_start_index 表示本批 sentences 在 full_narration 中的起始下标，标注时须结合该句前后文。',
    '只输出 JSON：{"marked_sentences":["你**辞职**那天，…","第二句原文"]}',
    'marked_sentences 长度必须与输入 sentences 完全相同；不要 markdown 标题/列表，不要解释。',
  ].join('\n')
}

/** 组装「旁白分镜：整稿一次拆镜 + 关键词 **」LLM system prompt */
export function buildNarrationStoryboardLLMSystem(): string {
  return [
    '你是解说视频分镜编辑。输入整篇 title（可选）与 body 正文，一次性输出所有旁白镜头句。',
    '每句对应一镜（TTS 一句），并为部分句标注 1 处 ** 强调词（黄字字幕用）。',
    '',
    '【拆镜规则·必须遵守】',
    '- 强断点：句号、问号、感叹号（。！？!?）处必须拆成独立镜头句',
    '- 弱断点：逗号、顿号、分号（，、；）处，仅当相邻两片段合计超过 16 个汉字时才拆，否则合并为一句',
    '- 单句以 8～22 个汉字为主，过长须按弱断点再拆',
    '- 严格保留原文用字与语序：只决定断句位置并插入 **，禁止改写、增删、替换文字',
    '- 所有 sentences 按正文阅读顺序拼接后，须与输入 body 用字完全一致（仅允许插入 **）',
    '',
    '【强调规则】',
    NARRATION_SUBTITLE_EMPHASIS_LLM_RULE,
    '约每 2～3 句标 1 处；情感高点、具象物件、关键动作句优先标；无合适词时可不标（该句原样输出）',
    '',
    '【片头标题】若有 title：写入 title_sentences，按句末标点拆句即可，可不标 ** 或仅标主题词',
    '',
    '只输出 JSON：{"title_sentences":["片头句"],"sentences":["正文第一句","第二句带**词**"]}',
    '无 title 时 title_sentences 为 []。不要 markdown，不要解释。',
  ].join('\n')
}

/** 组装「段落配图」LLM system prompt（素体 / 其他画风） */
export function buildNarrationParagraphImagePromptLLMSystem(
  style?: string | null,
  options?: { hasCharacters?: boolean; hasDiptych?: boolean; weightArc?: NarrationWeightArcContext | null },
): string {
  const minimal = isNarrationMinimalStyle(style)
  const anime = isNarrationAnimeStyle(style)
  const motionComic = isMotionComicStyle(style)
  if (motionComic) {
    return buildMotionComicParagraphImagePromptLLMSystem({
      hasCharacters: options?.hasCharacters,
      hasDiptych: options?.hasDiptych,
    })
  }
  const structured = minimal || anime
  const violenceRule = `${NARRATION_VIOLENCE_CONTENT_LLM_RULE}；${NARRATION_VIOLENCE_NO_FRAGMENT_LLM_RULE}`

  const analysisSteps = minimal
    ? NARRATION_LLM_ANALYSIS_STEPS_PROMPT
    : anime
      ? NARRATION_ANIME_LLM_ANALYSIS_STEPS_PROMPT
      : NARRATION_LLM_ANALYSIS_STEPS_PROMPT

  const shared = [
    `你是影视解说分镜美术指导。拆镜结构已由规则确定，根据整集旁白与全文剧情为每个配图段写${structured ? '中文' : ''} image_prompt，须丰富场景、陈设与动作，不单贴当前段落字面。`,
    '分析流程：',
    ...analysisSteps,
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_FULL_PLOT_ENRICHMENT_LLM_RULE,
    NARRATION_PREVIOUS_EPISODE_LLM_RULE,
    NARRATION_PARAGRAPH_FULL_COVERAGE_LLM_RULE,
    NARRATION_PLOT_CONTINUITY_LLM_RULE,
    NARRATION_PARAGRAPH_OUTFIT_CONTINUITY_LLM_RULE,
    NARRATION_SLEEP_OUTFIT_CONTINUITY_LLM_RULE,
    NARRATION_OUTFIT_HEX_COLOR_LLM_RULE,
    minimal
      ? NARRATION_UNIVERSAL_SIX_DIM_LLM_RULE
      : anime
        ? NARRATION_ANIME_SIX_DIM_LLM_RULE
        : NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE,
    options?.weightArc?.active && minimal
      ? NARRATION_BODY_WEIGHT_ARC_LLM_RULE
      : '',
    violenceRule,
    NARRATION_VEHICLE_LLM_RULE,
    minimal ? NARRATION_LLM_PROMPT_GOOD_BAD_EXAMPLES : '',
    '片头/标题句作为普通配图段处理，与其它旁白同样写六维 prompt，禁止使用单独的【片头背景场景】【主题氛围】格式',
  ].filter(Boolean)

  if (structured) {
    const styleSpec = formatNarrationStyleSpecBracket(undefined, style)
    const suffix = minimal ? NARRATION_UNIVERSAL_SCENE_SUFFIX : NARRATION_ANIME_SCENE_SUFFIX
    const example = minimal ? NARRATION_UNIVERSAL_SCENE_BODY_EXAMPLE : NARRATION_ANIME_SCENE_BODY_EXAMPLE
    const hardRules = [
      '硬性规则：',
      `1) 结构：${styleSpec} + 场景六维 + ${suffix}`,
      `2) 填空示例：${example}，${suffix}`,
      '3) layout=single：单张完整场景，禁止 grid/collage/multi-panel/split/storyboard',
      options?.hasDiptych ? `4) ${NARRATION_DIPPTYCH_SIX_PART_LLM_RULE}` : '',
      options?.hasCharacters ? 'characters 提供人生阶段与外貌，写入【画面主体】主人公段' : '',
      '每条 prompt 须以 narration_lines 为锚点、结合 full_narration 与 prior_narration 丰富场景/陈设/动作；不要输出负面提示词',
    ].filter(Boolean)
    return [...shared, ...hardRules, '只输出 JSON，不要解释。'].join('\n')
  }

  const hardRules = [
    '硬性规则：',
    `1) 画风：${artStylePrompt(style, 'scene')}, 16:9 landscape, high quality, no text, no watermark`,
    '2) 七维标签：【画风规格】【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】',
    '3) layout=single：single full illustration, one complete scene, no grid/collage/multi-panel/split',
    options?.hasDiptych ? `4) ${NARRATION_DIPPTYCH_SIX_PART_LLM_RULE}` : '',
    `5) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
    NARRATION_ERA_CLOTHING_LLM_RULE,
    options?.hasCharacters
      ? '若段落涉及已知角色，prompt 中写出其外貌特征并保持与角色设定一致'
      : '',
    '每条 prompt 须以 narration_lines 为锚点、结合 full_narration 与 prior_narration 丰富场景/陈设/动作；不要输出负面提示词',
  ].filter(Boolean)
  return [...shared, ...hardRules, '只输出 JSON，不要解释。'].join('\n')
}

/** 组装「配图换镜检测」LLM system prompt */
export function buildNarrationImageDetectLLMSystem(
  style?: string | null,
  mode: 'paragraph' | 'conservative' | 'balanced' = 'paragraph',
): string {
  if (isMotionComicStyle(style)) {
    return buildMotionComicImageDetectLLMSystem(mode)
  }
  void style
  const conservativeExtra = mode === 'conservative'
    ? '\n\n# 保守模式补充\n标 true 的门槛可略高，但 **仍遵守「仅同画面可复用才 false」**：只有确信上一张图无需改动即可表达本单元时才标 false；有任何可视差异一律标 true。'
    : ''

  return `# Role
你是一位顶级的视频分镜导演和视觉叙事专家。你的任务是为给定的旁白脚本规划配图方案。

# Goal
分析每一句旁白，判断它是否需要一张新的配图。**本步骤仅输出换镜判定（needs_image），不写配图文案**（配图文案在后续步骤生成）。

# Input Data
你将收到一个 JSON 对象，其中 \`sentences\` 为检测单元数组；每个元素包含：
- \`index\`: 检测单元序号（从 1 开始；片头多句可能已合并为一个单元）
- \`text\`: 该单元的旁白文本

若提供 \`previous_episode_narration\`，请结合上一集上下文理解已出现场景。
输入还会提供 \`storyboard_count\`（镜头总数）、\`minimum_true_count\` / \`maximum_true_count\`（\`needs_image=true\` 张数下限/上限，= 镜头数 × 25% / × 35%）、\`min_shots_per_image\` / \`max_shots_per_image\`（每张配图覆盖镜头数下限/上限）。**最终 true 的数量须在 \`minimum_true_count\`～\`maximum_true_count\` 之间**；且每个配图段须在 \`min_shots_per_image\`～\`max_shots_per_image\` 镜之间。

# Critical Rules for \`needs_image\` Judgment
请严格遵守以下规则，为每个检测单元输出 \`true\` 或 \`false\`：

1. **配图段起点判定 (Mark \`true\`)**：当**上一张配图无法在不改画面的前提下**表达本单元时，必须标记为 \`true\`。以下情况通常必须标 \`true\`：
   - **场景/空间切换**：地点、环境、室内外发生变化。
   - **时间/时代跳跃**：新的时间点、季节、年代（如「十年后」「1985年春天」）。
   - **叙事节拍转折**：情节阶段、核心矛盾、情绪基调发生可视上的转变。
   - **视觉焦点转变**：画面主体、核心物件、关键互动对象改变。
   - **动作/物件/互动更新**：出现**新的可见动作、姿态、道具、陈列、经营形态**（如从摆地摊→租门面→开两家店），即使仍在同一大时代，也需新图。
   - **空行分段后的新瞬间**：若旁白在脚本中分段，新段首句通常标 \`true\`（除非与上一张确为同一静止画面）。

2. **配图段延续判定 (Mark \`false\`)——严格限定**：
   - **仅当**本单元与当前配图段**完全共用同一画面**时才标 \`false\`：同一空间、同一主体、同一核心动作瞬间，观众看到的图可以**原样不动**。
   - 自问：「若仍用上一张图，观众会不会觉得画面和内容对不上？」若会，则必须标 \`true\`。
   - **禁止**仅因「同一场景 / 同一时间段 / 同一叙事节奏 / 多写了一个细节」就标 \`false\`。
   - **禁止**为减少配图数量而合并本需换镜的句子；只有**真正同画面可复用**才标 \`false\`。

3. **关键原则**：
   - **可视差异优先**：配镜以「画面是否需要换」为准；有可视差异就换，无差异才沿用。
   - **配图段长度（硬性）**：每个 \`needs_image=true\` 到下一个 \`true\` 之间（含锚点镜）覆盖 **\`min_shots_per_image\`～\`max_shots_per_image\` 镜**（默认 2～4 镜）。**禁止**单镜成段（&lt;2）或连续 5 镜及以上共用一图（&gt;4）。
   - **配图密度区间**：全篇 \`needs_image: true\` **须在 \`minimum_true_count\`～\`maximum_true_count\` 之间**（镜头数 × 25%～× 35%）。
   - **片头标题**：片头多句合并为一个单元时，该单元通常标 \`true\`。

# Workflow
1. **通读全文**：把握整体叙事脉络和场景节奏。
2. **逐单元判定** \`needs_image\`。
3. **自我验证**：**统计每个配图段镜数是否在 min～max 之间**；**统计 \`needs_image: true\` 是否在 \`minimum_true_count\`～\`maximum_true_count\` 之间**，不满足则调整后再输出。

# Output Format
请严格按照以下 JSON 格式输出结果，不要包含任何其他文本或解释。**不要输出 reasoning、image_prompts 或配图文案**。
\`\`\`json
{
  "analysis": [
    {
      "index": <检测单元序号>,
      "needs_image": <true 或 false>
    }
  ]
}
\`\`\`

# Example
输入 sentences:
[
  {"index": 1, "text": "1985年的春天，我来到了这座城市。"},
  {"index": 2, "text": "火车站前人潮涌动，我一眼就看到了他。"},
  {"index": 3, "text": "他穿着一件褪色的军大衣，正向我挥手。"},
  {"index": 4, "text": "十年后，我们再次相遇，地点却是在法庭上。"}
]

输出:
{
  "analysis": [
    {"index": 1, "needs_image": true},
    {"index": 2, "needs_image": false},
    {"index": 3, "needs_image": false},
    {"index": 4, "needs_image": true}
  ]
}${conservativeExtra}`
}

/** 组装「片头标题图」LLM system prompt */
export function buildNarrationTitleImagePromptLLMSystem(style?: string | null): string {
  const violenceRule = `${NARRATION_VIOLENCE_CONTENT_LLM_RULE}；${NARRATION_VIOLENCE_NO_FRAGMENT_LLM_RULE}`
  if (isNarrationMinimalStyle(style)) {
    return [
      '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的中文 image_prompt。',
      NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
      NARRATION_PREVIOUS_EPISODE_LLM_RULE,
      NARRATION_PROTAGONIST_UNIFIED_LLM_RULE,
      NARRATION_ERA_CLOTHING_LLM_RULE,
      violenceRule,
      '硬性规则：',
      `1) 结构：${formatNarrationStyleSpecBracket(undefined, style)} + 【片头背景场景】+【主题氛围】+ ${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
      `2) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
      `3) ${NARRATION_LLM_ANTI_REDUNDANCY_RULE}`,
      '只输出 JSON，不要解释。',
    ].join('\n')
  }
  if (isNarrationAnimeStyle(style)) {
    return [
      '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的中文 image_prompt。',
      NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
      NARRATION_PREVIOUS_EPISODE_LLM_RULE,
      NARRATION_ERA_CLOTHING_LLM_RULE,
      violenceRule,
      '硬性规则：',
      `1) 结构：${formatNarrationStyleSpecBracket(undefined, style)} + 【片头背景场景】+【主题氛围】+ ${NARRATION_ANIME_SCENE_SUFFIX}`,
      `2) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
      `3) ${NARRATION_LLM_ANTI_REDUNDANCY_RULE}`,
      '只输出 JSON，不要解释。',
    ].join('\n')
  }
  if (isMotionComicStyle(style)) {
    return buildMotionComicTitleImagePromptLLMSystem()
  }
  return [
    '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的 image_prompt。',
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_PREVIOUS_EPISODE_LLM_RULE,
    NARRATION_TITLE_IMAGE_LLM_RULE,
    NARRATION_ERA_CLOTHING_LLM_RULE,
    violenceRule,
    `画风：${artStylePrompt(style, 'title')}, 16:9 landscape, high quality, absolutely no text, no watermark`,
    '只输出 JSON，不要解释。',
  ].join('\n')
}

/** 组装「场景段落」LLM system prompt（非拆镜段落流程） */
export function buildNarrationSceneSegmentsImagePromptLLMSystem(style?: string | null): string {
  const violenceRule = `${NARRATION_VIOLENCE_CONTENT_LLM_RULE}；${NARRATION_VIOLENCE_NO_FRAGMENT_LLM_RULE}`
  return [
    '你是影视解说分镜美术指导，根据每段旁白场景写出用于 AI 文生图的「单场景画面描述」。',
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_FULL_PLOT_ENRICHMENT_LLM_RULE,
    NARRATION_PARAGRAPH_KEY_MOMENT_LLM_RULE,
    NARRATION_PLOT_CONTINUITY_LLM_RULE,
    NARRATION_PARAGRAPH_OUTFIT_CONTINUITY_LLM_RULE,
    NARRATION_SLEEP_OUTFIT_CONTINUITY_LLM_RULE,
    NARRATION_OUTFIT_HEX_COLOR_LLM_RULE,
    NARRATION_SCENE_PLOT_QUALITY_LLM_RULE,
    NARRATION_ERA_CLOTHING_LLM_RULE,
    violenceRule,
    NARRATION_FIXTURES_LLM_RULE,
    '规则：',
    '1) 先通读 full_narration，再写每段画面；以段内旁白为锚点，结合全文丰富环境、陈设与动作',
    '2) 每条 prompt 描述一个完整场景的主画面，适合单张插画；物件/品类须与 full_narration 前文一致',
    `3) ${artStylePrompt(style, 'scene')}，电影感构图，无文字无水印`,
    '4) 不要出现 grid、panel、宫格、分格、collage、split、strip 等词',
    '5) 用中文描述画面内容，可夹杂少量英文风格词',
    '只输出 JSON，不要解释。',
  ].join('\n')
}

/** 解说视频模式：负面提示词 */
export const NARRATION_IMAGE_NEGATIVE_PROMPT =
  '厚涂肌理、3D 建模、渐变光影、复杂纹理、半写实、真人照片质感、写实布料褶皱、复杂印花、复古滤镜、像素风、杂乱背景、写实路人、不同画风角色、正常比例人体、头身比失调、长短腿、四肢粗细不一、身高参差不齐、同画面双主人公体型规格不一致、斩首、砍头、尸体、尸首、血腥、血迹、杀戮、凶杀、处决、残肢、血肉模糊、恐怖虐杀、gore、blood、bloody、corpse、decapitation'

/** 解说视频模式：负面提示词（动漫） */
export const NARRATION_ANIME_IMAGE_NEGATIVE_PROMPT =
  'Q版、三头身、chibi、bobblehead、像素风、3D建模、厚涂肌理、半写实、真人照片质感、条漫、杂乱背景、不同画风角色、斩首、砍头、尸体、血腥、gore、blood'

/** 从【画风规格】正文推断是否为动漫模板 */
function isNarrationAnimeStyleSpecText(text?: string | null): boolean {
  const t = String(text || '')
  return /现代高质量\s*2D\s*动漫|赛璐璐平涂结合柔和渐变|正常青年头身比/.test(t)
}

export const ART_STYLES = [
  {
    value: 'short-drama',
    label: '短剧动漫（正常比例）',
    description: '抖音剧/解说常用，正常头身比、细线稿、柔和赛璐璐，类似剧本人性',
  },
  {
    value: NARRATION_MINIMAL_STYLE,
    label: '解说素体（极简叙事）',
    description: '全员白色素体简笔三头身，正常卡通脸表情，柔和平涂温馨叙事插画感',
  },
  {
    value: NARRATION_ANIME_STYLE,
    label: '解说动漫（正常比例）',
    description: '现代 2D 动漫插画，清晰线稿、赛璐璐+柔和渐变，正常头身比，表情夸张',
  },
  {
    value: MOTION_COMIC_STYLE,
    label: '漫画解说（条漫平涂）',
    description: '国漫条漫风，粗线平涂，静图快切+动效，适合逆袭/打斗短剧',
  },
  {
    value: 'webtoon',
    label: '解说条漫（Q版夸张）',
    description: '粗黑线描、平涂赛璐璐、Q 版比例，偏夸张表情包感',
  },
  {
    value: 'comic',
    label: '漫画插画',
    description: '欧美漫画感，粗线条叙事插画',
  },
  {
    value: 'anime',
    label: '日系动漫',
    description: '日本 TV 动画风格',
  },
  {
    value: 'ghibli',
    label: '吉卜力风',
    description: '柔和手绘、温暖光影',
  },
  {
    value: 'realistic',
    label: '写实摄影',
    description: '接近真人照片质感',
  },
  {
    value: 'cinematic',
    label: '电影质感',
    description: '大片构图与电影调色',
  },
  {
    value: 'watercolor',
    label: '水彩手绘',
    description: '水彩纸纹与晕染笔触',
  },
] as const

const STYLE_PROMPTS: Record<string, Record<ArtStyleContext, string>> = {
  [NARRATION_MINIMAL_STYLE]: {
    scene: `${formatNarrationStyleSpecBracket(undefined, NARRATION_MINIMAL_STYLE)}，【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    diptych: `${formatNarrationStyleSpecBracket(undefined, NARRATION_MINIMAL_STYLE)}，单张横向两宫格，【左格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，【右格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    title: `${formatNarrationStyleSpecBracket(undefined, NARRATION_MINIMAL_STYLE)}，【片头背景场景】，【主题氛围】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    portrait: `${formatNarrationStyleSpecBracket(undefined, NARRATION_MINIMAL_STYLE)}，【场景：浅灰纯色背景，单人全身${NARRATION_PROTAGONIST_BODY}定妆参考图】，【剧情：${NARRATION_PROTAGONIST_EYES}，人生阶段与动作姿态】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    agent: NARRATION_IMAGE_STYLE_CORE,
  },
  [NARRATION_ANIME_STYLE]: {
    scene: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    diptych: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，单张横向两宫格，【左格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，【右格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    title: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【片头背景场景】，【主题氛围】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    portrait: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【场景：浅灰纯色背景，单人全身动漫人物定妆参考图】，【剧情：正常头身比，清晰线稿，人生阶段与动作姿态】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    agent: `${NARRATION_ANIME_STYLE_SPEC_BODY}，${NARRATION_ANIME_STYLE_FORBIDDEN}`,
  },
  'short-drama': {
    scene: 'Chinese short drama 2D animation style, normal realistic body proportions, clean consistent line art, soft cel shading, expressive anime faces, Douyin storytelling animation aesthetic, school drama illustration, cinematic composition, NOT chibi, NOT Q-version',
    diptych: 'Chinese short drama 2D animation style, normal body proportions, clean line art, soft cel shading, expressive faces, NOT chibi, cinematic composition',
    title: 'Chinese short drama 2D animation style, atmospheric background, clean line art, soft cel shading, dramatic lighting, shallow depth of field',
    portrait: '2D Chinese Douyin scripted drama animation style, thin clean anime line art, flat soft cel shading, bright even lighting, normal young adult body proportions, TV anime character design reference sheet, plain light gray background, NOT painterly, NOT semi-realistic, NOT digital painting portrait, NOT chibi, NOT thick comic outlines, NOT concept art poster',
    agent: 'Chinese short drama 2D animation style, normal body proportions, clean line art, soft cel shading, NOT chibi',
  },
  [MOTION_COMIC_STYLE]: {
    scene: motionComicStylePrompt('scene'),
    diptych: motionComicStylePrompt('diptych'),
    title: motionComicStylePrompt('title'),
    portrait: motionComicStylePrompt('portrait'),
    agent: motionComicStylePrompt('agent'),
  },
  webtoon: {
    scene: 'modern Chinese webtoon animation style, semi-chibi stylized characters, bold black outlines, cel-shaded flat colors, expressive exaggerated faces, vibrant saturated colors, manhua illustration, cinematic composition',
    diptych: 'modern Chinese webtoon animation style, semi-chibi stylized characters, bold black outlines, cel-shaded flat colors, expressive faces, manhua illustration, cinematic composition',
    title: 'modern Chinese webtoon animation style, atmospheric background, bold outlines, cel-shaded colors, dramatic lighting, shallow depth of field',
    portrait: 'modern Chinese webtoon animation style, semi-chibi stylized character, bold black outlines, cel-shaded flat colors, expressive face, vibrant colors, manhua character design, cinematic lighting, high quality, detailed face and clothing',
    agent: 'modern Chinese webtoon animation style, semi-chibi stylized characters, bold black outlines, cel-shaded flat colors, expressive faces, manhua illustration',
  },
  comic: {
    scene: 'comic illustration, bold lines, cinematic composition',
    diptych: 'comic illustration, cinematic composition',
    title: 'comic illustration, anime illustration, dramatic lighting, shallow depth of field',
    portrait: 'comic style, cinematic lighting, high quality, detailed face and clothing',
    agent: 'comic illustration, bold lines',
  },
  anime: {
    scene: 'anime illustration, clean line art, cinematic composition',
    diptych: 'anime illustration, cinematic composition',
    title: 'anime illustration, dramatic lighting, shallow depth of field',
    portrait: 'anime style, cinematic lighting, high quality, detailed face and clothing',
    agent: 'anime illustration, clean line art',
  },
  ghibli: {
    scene: 'studio ghibli style, soft hand-painted background, warm lighting, cinematic composition',
    diptych: 'studio ghibli style, soft hand-painted, cinematic composition',
    title: 'studio ghibli style, atmospheric background, warm golden hour lighting, shallow depth of field',
    portrait: 'studio ghibli style, soft hand-painted character, warm lighting, high quality, detailed face and clothing',
    agent: 'studio ghibli style, soft hand-painted illustration',
  },
  realistic: {
    scene: 'photorealistic, cinematic photography, natural lighting, cinematic composition',
    diptych: 'photorealistic, cinematic photography, cinematic composition',
    title: 'photorealistic cinematic background, dramatic lighting, shallow depth of field',
    portrait: 'photorealistic portrait, natural lighting, high quality, detailed face and clothing',
    agent: 'photorealistic illustration, cinematic photography',
  },
  cinematic: {
    scene: 'cinematic film still, dramatic lighting, rich color grading, cinematic composition',
    diptych: 'cinematic film still, dramatic lighting, cinematic composition',
    title: 'cinematic atmospheric background, dramatic lighting, shallow depth of field',
    portrait: 'cinematic portrait lighting, high quality, detailed face and clothing',
    agent: 'cinematic illustration, dramatic lighting',
  },
  watercolor: {
    scene: 'watercolor painting, soft brush strokes, paper texture, cinematic composition',
    diptych: 'watercolor painting, soft brush strokes, cinematic composition',
    title: 'watercolor atmospheric background, soft brush strokes, dramatic lighting',
    portrait: 'watercolor character portrait, soft brush strokes, high quality, detailed face and clothing',
    agent: 'watercolor illustration, soft brush strokes',
  },
}

export function normalizeArtStyle(style?: string | null): string {
  const key = String(style || '').trim().toLowerCase()
  if (key === NARRATION_MINIMAL_STYLE || key === NARRATION_ANIME_STYLE) return key
  if (key === MOTION_COMIC_STYLE) return MOTION_COMIC_STYLE
  if (STYLE_PROMPTS[key]) return key
  return DEFAULT_ART_STYLE
}

export function artStyleLabel(style?: string | null): string {
  const key = normalizeArtStyle(style)
  const narrationOption = NARRATION_IMAGE_STYLE_OPTIONS.find(item => item.value === key)
  if (narrationOption) return narrationOption.label
  return ART_STYLES.find(item => item.value === key)?.label || key
}

export function artStylePrompt(style?: string | null, context: ArtStyleContext = 'scene'): string {
  const key = normalizeArtStyle(style)
  return STYLE_PROMPTS[key]?.[context] || STYLE_PROMPTS[DEFAULT_ART_STYLE][context]
}

export function isNarrationMinimalStyle(style?: string | null): boolean {
  return normalizeArtStyle(style) === NARRATION_MINIMAL_STYLE
}

export function isNarrationAnimeStyle(style?: string | null): boolean {
  return normalizeArtStyle(style) === NARRATION_ANIME_STYLE
}


export function isNarrationStructuredStyle(style?: string | null): boolean {
  return isNarrationMinimalStyle(style) || isNarrationAnimeStyle(style) || isMotionComicStyle(style)
}

export const SCENE_STYLE_GUARD = [
  'CRITICAL ART STYLE: Chinese short-drama 2D anime scene illustration',
  'thin clean line art, flat soft cel shading, normal body proportions',
  'FORBIDDEN: semi-realistic, digital painting, painterly, manhua concept art, soft gradient shading, thick outlines, photorealistic',
  'FORBIDDEN: pixel art, retro filter, film grain, romantic wallpaper, bishounen bishoujo poster',
].join(', ')

const NARRATION_PROMPT_BOILERPLATE_PARTS = [
  '16:9 横屏', '16:9横屏', '2D 扁平简笔画', '2D 扁平化卡通', '2D 扁平化卡通动画', '2D扁平化卡通动画',
  NARRATION_PROTAGONIST_BODY, NARRATION_CROWD_BODY, '白色圆头素体小人', '白色圆头无脸素体小人', '黑色素体小人',
  NARRATION_PROTAGONIST_FACE, NARRATION_CROWD_FACE, NARRATION_PROTAGONIST_EYES, NARRATION_CROWD_EYES, NARRATION_MINIMAL_EYES,
  '两个小黑点眼睛', '两个白色小圆点眼睛', '两个黑色小圆点眼睛', '正常卡通脸',
  '黑色细轮廓线', '黑色简洁轮廓线',
  '纯色平涂无纹理渐变', '纯色平涂无复杂光影', '纯色平涂',
  '日常低饱和配色', '低饱和写实配色', '极简叙事动画风格', '极简叙事画风',
  '短视频剧情动画质感', '干净整洁的画面', '画面干净清晰', '画面干净整洁',
  '无文字无水印', '绝对无文字无字母', '绝对无文字',
  '扁平化平涂上色', '无渐变无复杂阴影', '极简叙事卡通画风', '场景简化还原',
  '2D扁平化卡通', 'flat cel', '卡通动画', '动画',
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 统一清洗【】内正文：去首尾标点、合并句号、去掉与前缀重复的眼睛描述 */
export function normalizeBracketContent(text?: string | null): string {
  let t = String(text || '').trim()
  if (!t) return ''
  t = t.replace(new RegExp(`(?:${escapeRegExp(NARRATION_MINIMAL_EYES)}[，,、\\s]*)+`, 'g'), '')
  t = t.replace(/人生剧本主题氛围/g, '')
  t = t.replace(/[。！？；]+/g, '，')
  t = t.replace(/[，,、;；]+/g, '，')
  t = t.replace(/[，,、]+/g, '，')
  t = t.replace(/的，+/g, '，')
  t = t.replace(/，的(?=，|$)/g, '')
  t = t.replace(/^的+/g, '')
  t = t.replace(/^[，,、]+|[，,、]+$/g, '')
  return t.replace(/\s{2,}/g, ' ').trim()
}

function isRawNarrationText(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/素体小人|白色素体小人主人公|白色素体小人|两个小黑点|两个白色小圆点|正常卡通脸/.test(t)) {
    const stripped = t.replace(/素体小人|几位白色素体小人|几位素体小人|白色素体小人主人公|白色素体小人|白色圆头|小孩期|少年期|青年期|中年期|老年期/g, '').trim()
    if (!stripped || stripped.length < 4) return false
    return isRawNarrationText(stripped)
  }
  return /[我你他她]|(?:了|的|吗|呢|吧)[，,、]?$|辞掉|摆地摊|万元户|供销社|批发市场|觉得|以为|才知道|本事大|浪潮|风口|裸泳|变迁|平淡|起起落落/.test(t)
}

function isAbstractNarrationPlot(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  return /时代|浪潮|风口|裸泳|本事大|变迁|平淡如水|起起落落|风光过|落魄过|原来没有|谁能一直|扛得住|回过头|只觉得|以后日子|越来越好|越来越好|赶上了好时代/.test(t)
}

type SceneFamily = 'market' | 'shop' | 'wholesale' | 'supply' | 'grocery' | 'home' | 'street' | 'generic'

function detectSceneFamily(text: string, sceneHint?: string): SceneFamily {
  const t = `${sceneHint || ''}${text}`
  if (/杂货|小卖部|油盐|酱醋|日用品|蒲扇/.test(t)) return 'grocery'
  if (/家里|客厅|串门|彩电|彩色电视|固定电话|提亲|婚礼|娶了|洞房/.test(t)) return 'home'
  if (/供销社/.test(t)) return 'supply'
  if (/批发市场|批了一车|批(?:发|了)/.test(t)) return 'wholesale'
  if (/店铺|门面|服装店|开店|租了门面|店员|雇了/.test(t)) return 'shop'
  if (/夜市|摆地摊|地摊|摊位|摆摊/.test(t)) return 'market'
  if (/县城街景|街景|大街|院落/.test(t)) return 'street'
  return 'generic'
}

/** LLM 场景标签是否与当前段旁白明显冲突（如旁白租门面但场景仍写夜市摊位） */
function narrationSceneConflictsWithLabel(narrationText: string, sceneLabel: string): boolean {
  const narr = String(narrationText || '')
  const scene = String(sceneLabel || '')
  if (!narr || !scene) return false
  if (/门面|服装店|开店|租了门面|店员|雇了/.test(narr)
    && /夜市|摆地摊|摊位/.test(scene) && !/店铺|门面|服装店/.test(scene)) {
    return true
  }
  if (/家里|客厅|串门|婚礼|提亲|彩电|彩色电视|固定电话/.test(narr)
    && /夜市|摊位|批发市场/.test(scene) && !/客厅|家里|婚礼/.test(scene)) {
    return true
  }
  if (/杂货|油盐|酱醋|蒲扇|小门面/.test(narr)
    && !/杂货|小卖部/.test(scene)) {
    return true
  }
  if (/批发市场|批了一车|批(?:发|了)/.test(narr)
    && /客厅|家里|婚礼/.test(scene)) {
    return true
  }
  return false
}

/** 当前配图段是否应从 prior 继承陈设（否则仅按本段旁白重设） */
function shouldInheritFixturesFromPrior(
  priorFull: string,
  currentFull: string,
  sceneHint?: string,
): boolean {
  if (!priorFull.trim() || !currentFull.trim()) return false

  const priorFamily = detectSceneFamily(priorFull)
  const currentFamily = detectSceneFamily(currentFull, sceneHint)
  if (currentFamily !== 'generic' && priorFamily !== 'generic' && priorFamily !== currentFamily) {
    return false
  }
  if (/又租|改开|改成|守着|杂货铺|小门面|开超市|搞起了工程|网购|连锁服装店/.test(currentFull)
    && priorFamily !== currentFamily) {
    return false
  }
  if (priorFamily === 'generic') return false
  return priorFamily === currentFamily || currentFamily === 'generic'
}

const NARRATION_SCENE_HINTS: Array<[RegExp, string]> = [
  [/供销社/, '供销社门口或营业大厅内景，简化陈设'],
  [/批发市场/, '批发市场货架通道，堆叠货物箱与手推车'],
  [/夜市|摆地摊|地摊/, '县城夜市街景，简化摊位与灯泡照明'],
  [/服装店|门面|租了/, '临街小店铺内景，简化货架与柜台'],
  [/万元户|赚钱|收入/, '简化县城街景，寓意经营成功氛围'],
  [/身边|议论|说我/, '日常街道或院落，简化背景'],
  [/春天|夏天|秋天|冬天/, '户外街景，季节感简化背景'],
  [/推.*手推车|手推车/, '户外街景或市场通道'],
]

type NarrationPlotHint = {
  re: RegExp
  action: string
  /** 越高越优先；具体画面动作宜设高分，抽象情绪宜设低分 */
  priority: number
  sceneTags?: string[]
  /** 无更具体匹配时才作为兜底 */
  fallback?: boolean
}

const NARRATION_PLOT_HINTS: NarrationPlotHint[] = [
  { re: /斩首|砍头|杀头|铡刀|处决|人头落地|断头/, action: '白色素体小人主人公被几位白色素体小人押解走向牢房候审', priority: 11 },
  { re: /尸体|尸首|遗体|死尸|尸身|惨死|横尸|验尸|解剖/, action: '白色素体小人主人公在牢房内端坐候审', priority: 11 },
  { re: /血腥|血迹|鲜血|流血|血泊|血肉模糊|溅血|凶杀|杀戮|虐杀|屠杀/, action: '白色素体小人主人公在公堂问讯场景中站立候审', priority: 11 },
  { re: /牢房|牢狱|监狱|大狱|公堂|衙门|押解|候审|羁押|待审/, action: '白色素体小人主人公在牢房或公堂内静坐候审，两侧有白色素体小人衙役站立', priority: 10 },
  { re: /摆地摊|摆摊|夜市/, action: '白色素体小人主人公在摊位前整理陈列货物', priority: 10, sceneTags: ['market'] },
  { re: /生意|卖光|卖完|赶时髦|出售|卖出|热卖/, action: '白色素体小人主人公向几位白色素体小人展示货物并交易', priority: 10, sceneTags: ['market'] },
  { re: /年轻人|顾客|客人|来买|挑选/, action: '白色素体小人主人公在摊位前忙碌，几位白色素体小人围在摊位前挑选货物', priority: 9, sceneTags: ['market'] },
  { re: /批发|进货|批了/, action: '白色素体小人主人公在市场通道搬运整理成箱货物', priority: 9, sceneTags: ['market', 'wholesale'] },
  { re: /固定摊位|越干越有劲/, action: '白色素体小人主人公整理固定摊位上的陈列货物', priority: 9, sceneTags: ['market'] },
  { re: /门面|服装店|开店/, action: '白色素体小人主人公站在店铺门口招呼几位白色素体小人进店', priority: 9, sceneTags: ['shop'] },
  { re: /辞|离开/, action: '白色素体小人主人公离开供销社门口', priority: 10, sceneTags: ['supply'] },
  { re: /供销社/, action: '白色素体小人主人公在供销社门口或营业大厅内站立行走', priority: 7, sceneTags: ['supply'] },
  { re: /手推车|板车|独轮车/, action: '白色素体小人主人公推着手推车运送货物', priority: 9, sceneTags: ['transport'] },
  { re: /二八杠|自行车/, action: '白色素体小人主人公推着二八杠自行车轮廓前行', priority: 9, sceneTags: ['transport'] },
  { re: /推.*车/, action: '白色素体小人主人公推着二八杠自行车轮廓前行', priority: 6, sceneTags: ['transport'] },
  { re: /扇.*扇|蒲扇|乘凉|小凳/, action: '白色素体小人主人公坐在门口小凳上扇蒲扇', priority: 9 },
  { re: /疯|议论|说我/, action: '白色素体小人主人公在摊位前独自忙碌，周围几位白色素体小人围观交谈', priority: 7, sceneTags: ['market'] },
  { re: /万元户/, action: '白色素体小人主人公站在店铺前，周围几位白色素体小人围观', priority: 8, sceneTags: ['shop'] },
  { re: /赚钱|收入|越多|利润/, action: '白色素体小人主人公手持简化账本查看收入', priority: 7, sceneTags: ['market', 'shop'] },
  { re: /彩色电视|彩电|固定电话|串门|看电视/, action: '白色素体小人主人公与几位白色素体小人坐在客厅沙发前看电视', priority: 9, sceneTags: ['home'] },
  { re: /提亲|娶了|婚礼|十里八乡/, action: '白色素体小人主人公与几位白色素体小人在婚礼喜庆简化场景中互动', priority: 9, sceneTags: ['home'] },
  { re: /雇了|店员|喝茶|收收钱/, action: '白色素体小人主人公坐在店铺内喝茶，几位白色素体小人在柜台前忙碌', priority: 8, sceneTags: ['shop'] },
  { re: /皮鞋|箱包/, action: '白色素体小人主人公在店铺货架前整理皮鞋与箱包', priority: 8, sceneTags: ['shop'] },
  { re: /风光|九十年代|开了两家/, action: '白色素体小人主人公站在店铺门口与几位白色素体小人交谈', priority: 8, sceneTags: ['shop'] },
  { re: /网购|客人.*少|生意.*不行|卖不出去|砸在手里/, action: '白色素体小人主人公独自在店铺内整理滞销服装', priority: 9, sceneTags: ['shop'] },
  { re: /连锁|批发市场越来越多/, action: '白色素体小人主人公望着街对面新开连锁服装店', priority: 8, sceneTags: ['shop', 'street'] },
  { re: /下岗|投奔/, action: '几位白色素体小人站在店铺门口与素体小人交谈', priority: 7, sceneTags: ['shop'] },
  { re: /杂货|油盐|酱醋|日用品|微薄的利润/, action: '白色素体小人主人公在杂货铺柜台前整理油盐酱醋日用品', priority: 9, sceneTags: ['grocery'] },
  { re: /时代|浪潮|风口|裸泳|本事大|变迁|平淡如水|起起落落/, action: '白色素体小人主人公独自坐在门口小凳上望向远方街景', priority: 4, fallback: true },
  { re: /铁饭碗|个体户|投机/, action: '白色素体小人主人公独自经营小摊忙碌', priority: 6, sceneTags: ['market'] },
  { re: /心里有数|敢闯|改革|踏实/, action: '白色素体小人主人公在摊前从容应对，继续向围观的白色素体小人招揽', priority: 3, sceneTags: ['market'], fallback: true },
]

function detectNarrationSceneTags(text: string): string[] {
  const tags: string[] = []
  if (/夜市|摆地摊|地摊|摊位|摆摊/.test(text)) tags.push('market')
  if (/卖|顾客|生意|交易|货物|商品|赶时髦/.test(text)) tags.push('market')
  if (/批发市场|批(?:发|了)|进货/.test(text)) tags.push('wholesale')
  if (/门面|店铺|服装店|开店|租了/.test(text)) tags.push('shop')
  if (/家里|客厅|串门|婚礼|提亲|电视|电话/.test(text)) tags.push('home')
  if (/杂货|小卖部/.test(text)) tags.push('grocery')
  if (/供销社/.test(text)) tags.push('supply')
  if (/推.*手推车|手推车|板车/.test(text)) tags.push('cart')
  if (/推.*车|自行车|二八杠/.test(text)) tags.push('bike')
  if (/牢|狱|公堂|衙门|押解|候审|羁押/.test(text)) tags.push('justice')
  return tags
}

function inferVisualPlotFromNarration(text: string, sceneTags?: string[]): string {
  const tags = sceneTags?.length ? sceneTags : detectNarrationSceneTags(text)
  const hits: Array<{ action: string; priority: number }> = []

  for (const hint of NARRATION_PLOT_HINTS) {
    if (!hint.re.test(text)) continue
    let priority = hint.priority
    if (hint.sceneTags?.some(t => tags.includes(t))) priority += 8
    else if (tags.length && hint.fallback) priority -= 6
    else if (tags.length && !hint.sceneTags) priority -= 4
    hits.push({ action: hint.action, priority })
  }

  hits.sort((a, b) => b.priority - a.priority)
  const actions: string[] = []
  for (const hit of hits) {
    if (!actions.includes(hit.action)) actions.push(hit.action)
    if (actions.length >= 2) break
  }
  if (actions.length) return actions.join('，')
  return ''
}

function inferTitleAtmosphere(hook: string): string {
  const t = String(hook || '').trim()
  if (/摆地摊|万元户|赚钱|创业|个体户/.test(t)) {
    return '创业奋斗叙事氛围，简化街景与经营意象'
  }
  if (/婚礼|爱情|分手/.test(t)) return '情感叙事氛围，简化生活场景'
  return '人生剧本叙事氛围，温和日常色调'
}

export type TitleVisualContext = {
  titleFull?: string | null
  titleHook?: string | null
  bodySentences?: string[]
}

/** 片头 + 正文旁白合并为全文语境（正文经压缩） */
export function buildTitleScriptContext(ctx: TitleVisualContext): string {
  const title = String(ctx.titleFull || ctx.titleHook || '').trim()
  const body = compressFullNarrationLines(ctx.bodySentences)
  if (title && body) return `${shortenNarrationClause(title, 36)}→${body}`
  return title || body
}

function buildTitleAtmosphereFromScript(fullText: string, hook: string): string {
  const text = String(fullText || '').trim()
  const hookBrief = hook.length > 32 ? `${hook.slice(0, 32)}…` : hook
  const themes: string[] = []
  if (/摆地摊|万元户|赚钱|创业|个体户|批发|夜市|供销社|摊位|开店|门面/.test(text)) {
    themes.push('创业奋斗与市井经营')
  }
  if (/职高|辍学|打工|辞掉|辞职|下岗|转行/.test(text)) themes.push('人生转折与起点')
  if (/婚礼|爱情|分手|复仇|背叛/.test(text)) themes.push('情感纠葛')
  if (/1985|1980|80年代|90年代|\d{2,4}年|春天|夏天|秋天|冬天/.test(text)) {
    themes.push('年代感人生故事')
  }
  if (/逆袭|翻身|成功|失败|落魄|巅峰/.test(text)) themes.push('命运起伏')
  if (themes.length) {
    return `${themes.slice(0, 2).join('、')}，呼应「${hookBrief || '本期人生剧本'}」`
  }
  return hookBrief
    ? `人生剧本叙事氛围，呼应「${hookBrief}」`
    : inferTitleAtmosphere(hook || text)
}

/** 根据片头 hook + 全文旁白，合成片头背景【场景】与【主题氛围】 */
export function buildTitleVisualBrief(ctx: TitleVisualContext): { scene: string; atmosphere: string } {
  const hook = String(ctx.titleHook || ctx.titleFull || '').trim()
  const fullContext = buildTitleScriptContext(ctx)
  const text = fullContext || hook
  if (!text.trim()) return { scene: '', atmosphere: '' }

  const sceneParts = extractScenePartsFromNarrationText(text)
  let scene = normalizeBracketContent(resolvePrimaryScene(sceneParts))
  if (!scene) {
    if (/万元户|摆地摊|赚钱|创业|批发|夜市|供销社/.test(text)) {
      scene = '简化县城街景与市井经营意象'
    } else if (/婚礼|爱情/.test(text)) {
      scene = '简化生活场景与情感叙事背景'
    } else {
      scene = sanitizeSceneImagePrompt(hook) || '简化日常叙事场景背景'
    }
  }

  const atmosphere = buildTitleAtmosphereFromScript(text, hook)
  return { scene, atmosphere }
}

const NARRATION_SETTING_ONLY_RE =
  /^(?:\d{2,4}\s*年)?(?:的)?(?:春|夏|秋|冬|天|日|夜|晚|晨|暮|早|午)(?:天|季|里|间|上)?[，,、\s]*$/

/** 纯日期/季节/时段旁白（不含具体情节，不应单独配图） */
export function isNarrationDateOnlySentence(sentence: string): boolean {
  const t = String(sentence || '')
    .replace(/^[，,、\s]+|[，,、\s]+|[。！？.!?]+$/g, '')
    .replace(/\s/g, '')
  if (!t) return false
  if (NARRATION_SETTING_ONLY_RE.test(t)) return true
  return /^(?:\d{2,4}\s*年(?:的)?|(?:八十年代|九十年代|\d{2,4}年代))$/.test(t)
}

const NARRATION_SCENE_KEYWORDS: Array<[RegExp, string]> = [
  [/牢房|牢狱|监狱|大狱/, '简化牢房内景，木栏与石墙'],
  [/公堂|衙门|大堂/, '简化公堂问讯内景'],
  [/杂货店|杂货铺|小卖部/, '老旧杂货店门口，简化店面与玻璃橱窗'],
  [/供销社/, '供销社门口或营业大厅内景'],
  [/批发市场/, '批发市场货架通道与货物堆'],
  [/夜市|摆地摊|地摊/, '县城夜市街景与简化摊位'],
  [/服装店|门面|店铺|租了/, '临街店铺或门店铺面内景'],
  [/家里|客厅|串门|婚礼/, '家中客厅简化内景'],
  [/固定摊位|摊位/, '市场固定摊位内景'],
  [/县城/, '县城街景'],
  [/身边|议论|说我/, '日常街道或院落背景'],
]

function extractScenePartsFromNarrationText(text: string): string[] {
  const parts: string[] = []
  if (/春/.test(text)) parts.push('春日户外')
  if (/夏/.test(text)) parts.push('夏日户外')
  if (/秋/.test(text)) parts.push('秋日户外')
  if (/冬/.test(text)) parts.push('冬日户外')
  if (/夜|晚/.test(text)) parts.push('夜晚')
  if (/清晨|早晨|黎明/.test(text)) parts.push('清晨')

  for (const [re, label] of NARRATION_SCENE_KEYWORDS) {
    if (re.test(text) && !parts.includes(label)) {
      if (label.includes('供销社') && /比在供销社|在供销社上班/.test(text)) continue
      parts.push(label)
    }
  }

  const inLoc = text.match(/在([^，,。！？；]{2,10}?)(?:批|进|走|去|摆|卖|租|开|里|外|门口|摊)/)
  if (inLoc?.[1]) {
    const loc = sanitizeSceneImagePrompt(inLoc[1])
    if (loc) parts.push(`${loc}简化场景背景`)
  }

  const gotoLoc = text.match(/(?:到|去|赶往|抵达|回到)(?:县城的?)?(夜市|市场|店铺|门面|供销社|摊位)/)
  if (gotoLoc?.[1]) {
    const label = gotoLoc[1]
    if (label === '夜市') parts.push('县城夜市街景与简化摊位')
    else if (label === '市场') parts.push('批发市场货架通道与货物堆')
    else if (/店铺|门面/.test(label)) parts.push('临街店铺或门店铺面内景')
    else if (label === '供销社') parts.push('供销社门口或营业大厅内景')
    else if (label === '摊位') parts.push('市场固定摊位内景')
  }

  return parts
}

function mergeNarrationPlotSentences(sentences: string[]): string {
  return sentences
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .join('，')
}

/** 可在多场景中持续出现的货物/道具 */
const PERSISTENT_VISUAL_PROPS: Array<[RegExp, string]> = [
  [/蛤蟆镜|墨镜|太阳镜/, '蛤蟆镜'],
  [/喇叭裤/, '喇叭裤'],
  [/花衬衫|T恤|衣服|服装|服饰/, '服装'],
  [/箱包|皮包|手提包/, '箱包'],
  [/电话|彩电|彩色电视/, '家电'],
  [/钱币|万元|钞票/, '钱币'],
]

/** 与特定场景绑定的道具：仅当前段仍涉及该场景/动作时才保留 */
const SCENE_BOUND_VISUAL_PROPS: Array<[RegExp, RegExp, string]> = [
  [/自行车|二八杠/, /推.*车|自行车|二八杠/, '二八杠自行车'],
  [/手推车|板车/, /手推车|板车/, '手推车'],
  [/供销社/, /供销社/, '供销社'],
  [/批发市场/, /批发市场|批(?:发|了)|进货/, '批发市场货物'],
]

function extractPersistentVisualProps(text: string): string[] {
  const props: string[] = []
  for (const [re, label] of PERSISTENT_VISUAL_PROPS) {
    if (re.test(text) && !props.includes(label)) props.push(label)
  }
  return props
}

function pushContinuityProp(relevant: string[], raw: string): void {
  const prop = String(raw || '').trim()
  if (!prop) return
  const parts = prop.split(/[与和、]/).map(p => p.trim()).filter(p => p.length >= 2)
  for (const part of parts) {
    if (!relevant.includes(part)) relevant.push(part)
  }
}

function isMarketNarrationContext(text: string, sceneTags?: string[]): boolean {
  if (sceneTags?.includes('market')) return true
  return /夜市|摆地摊|摊位|摆摊|整理货物|卖|批(?:发|了)|顾客|围观|挑选|交易|展示货物|货物|商品|赶时髦/.test(text)
}

function collectGoodsFromNarrationLines(lines: string[]): string[] {
  const goods: string[] = []
  for (const line of lines) {
    const extracted = extractGoodsFromSingleSentence(line)
    if (extracted) pushContinuityProp(goods, extracted)
    for (const prop of extractPersistentVisualProps(line)) {
      pushContinuityProp(goods, prop)
    }
  }
  return goods
}

function collectRelevantContinuityProps(
  priorLines: string[],
  currentLines: string[],
  sceneTags?: string[],
  sceneHint?: string,
): string[] {
  const priorFull = priorLines.join('')
  const currentFull = currentLines.join('')
  if (!currentFull.trim()) return []

  const relevant: string[] = []
  for (const line of currentLines) {
    for (const prop of extractPersistentVisualProps(line)) {
      pushContinuityProp(relevant, prop)
    }
  }
  for (const goods of collectGoodsFromNarrationLines(currentLines)) {
    pushContinuityProp(relevant, goods)
  }

  if (shouldInheritFixturesFromPrior(priorFull, currentFull, sceneHint)) {
    for (const [re, label] of PERSISTENT_VISUAL_PROPS) {
      if (re.test(priorFull) && !relevant.includes(label)) {
        relevant.push(label)
      }
    }
    for (const goods of collectGoodsFromNarrationLines(priorLines)) {
      pushContinuityProp(relevant, goods)
    }
  }

  for (const [, sceneRe, label] of SCENE_BOUND_VISUAL_PROPS) {
    if (!sceneRe.test(currentFull)) continue
    if (label === '批发市场货物' && relevant.length > 0) continue
    if (!relevant.includes(label)) relevant.push(label)
  }

  return relevant.slice(0, 4)
}

function inferVisualSceneFromNarration(text: string): string {
  for (const [re, scene] of NARRATION_SCENE_HINTS) {
    if (re.test(text)) return scene
  }
  return ''
}

function resolveActiveSceneFromParts(
  allParts: string[],
  currentText: string,
  sceneTags?: string[],
): string {
  const family = detectSceneFamily(currentText)
  if (family === 'grocery' || sceneTags?.includes('grocery')) {
    const hit = allParts.find(p => /杂货|小卖部/.test(p))
    return normalizeBracketContent(hit || '老旧杂货店门口，简化店面与玻璃橱窗')
  }
  if (family === 'home' || sceneTags?.includes('home')) {
    const hit = allParts.find(p => /客厅|家里|婚礼/.test(p))
    return normalizeBracketContent(hit || '家中客厅简化内景')
  }
  if (family === 'shop' || sceneTags?.includes('shop')) {
    const shopScene = allParts.find(p => /店铺|门面|服装店/.test(p))
    if (shopScene) return normalizeBracketContent(shopScene)
    return '临街店铺或门店铺面内景'
  }
  if (family === 'wholesale' || sceneTags?.includes('wholesale')) {
    const hit = allParts.find(p => /批发市场/.test(p))
    return normalizeBracketContent(hit || '批发市场货架通道与货物堆')
  }
  if (family === 'supply' || sceneTags?.includes('supply')) {
    const hit = allParts.find(p => /供销社/.test(p))
    return normalizeBracketContent(hit || '供销社门口或营业大厅内景')
  }

  const marketActive = isMarketNarrationContext(currentText, sceneTags)
    || sceneTags?.includes('market')
  if (marketActive) {
    const stallScene = allParts.find(p => /夜市|摆地摊|摊位|市场/.test(p))
    if (stallScene) return normalizeBracketContent(stallScene)
    return '县城夜市街景与简化摊位'
  }
  if (/卖|生意|顾客|赶时髦|摆摊|摆地摊|心里有数|挑选|交易/.test(currentText)) {
    const stallScene = allParts.find(p => /夜市|摆地摊|摊位/.test(p))
    if (stallScene) return normalizeBracketContent(stallScene)
  }
  return normalizeBracketContent(resolvePrimaryScene(allParts))
}

function reconcileSceneWithPlot(scene: string, plot: string, sceneTags: string[]): string {
  const sceneText = String(scene || '').trim()
  const plotText = String(plot || '').trim()
  if (!plotText) return sceneText
  const isGenericStreet = /日常街道|院落/.test(sceneText) && !/夜市|摊位|市场/.test(sceneText)
  const plotIsMarket = /摊位|摆摊|顾客|展示|交易|挑选|招揽/.test(plotText)
  if (isGenericStreet && (plotIsMarket || sceneTags.includes('market'))) {
    return '县城夜市街景与简化摊位'
  }
  return sceneText
}

function inferActiveSceneFromContext(
  currentText: string,
  priorLines: string[],
  sceneTags?: string[],
): string {
  const contextLines = [...priorLines.slice(-4), currentText].filter(Boolean)
  const contextText = contextLines.join('')
  const tags = sceneTags?.length ? sceneTags : detectNarrationSceneTags(contextText)

  let parts = extractScenePartsFromNarrationText(currentText)
  if (parts.length) return resolveActiveSceneFromParts(parts, contextText, tags)

  const allParts: string[] = []
  for (const line of contextLines) {
    for (const p of extractScenePartsFromNarrationText(line)) {
      if (!allParts.includes(p)) allParts.push(p)
    }
  }
  if (allParts.length) return resolveActiveSceneFromParts(allParts, contextText, tags)

  if (isMarketNarrationContext(contextText, tags)) {
    return '县城夜市街景与简化摊位'
  }
  return ''
}

function pickPrimaryActionLine(lines: string[], sceneHint?: string): string {
  if (!lines.length) return ''
  const scene = String(sceneHint || '')
  if (/供销社/.test(scene)) {
    const supplyLine = lines.find(l => /供销社|辞|离开|铁饭碗/.test(l))
    if (supplyLine) return supplyLine
  }
  const dated = /^\d{2,4}年|春天|夏天|秋天|冬天|春日|夏日|秋日|冬日/
  const concrete = lines.find(l => !dated.test(l.trim()) && inferVisualPlotFromNarration(l))
  return concrete || lines[lines.length - 1]
}

/** 纠正自行车/手推车混写：旁白写自行车时禁止落成手推车 */
function reconcilePlotVehicles(plot: string, narrationText: string): string {
  let text = String(plot || '').trim()
  const narr = String(narrationText || '')
  if (!text || !narr) return text

  const mentionsCart = /手推车|板车|独轮车/.test(narr)
  const mentionsBike = /自行车|二八杠/.test(narr)
  const mentionsVehicle = mentionsCart || mentionsBike || /推.*车/.test(narr)

  if (mentionsBike && !mentionsCart && /手推车/.test(text)) {
    text = text
      .replace(/推着手推车运送货物/g, '推着二八杠自行车轮廓前行')
      .replace(/手推车/g, '二八杠自行车轮廓')
  }

  if (!mentionsVehicle && /手推车|自行车|二八杠/.test(text)) {
    if (/供销社/.test(narr) && /辞|离开|铁饭碗/.test(narr)) {
      return '白色素体小人主人公离开供销社门口'
    }
    if (/供销社/.test(narr)) {
      return '白色素体小人主人公在供销社门口或营业大厅内站立行走'
    }
  }

  return text
}

function reconcileVehicleInImagePrompt(prompt: string, narrationText: string): string {
  const narr = String(narrationText || '')
  if (!narr) return prompt
  let text = String(prompt || '')
  const labels = ['画面主体', '核心细节动作']
  for (const label of labels) {
    const re = new RegExp(`(【${label}[：:]\\s*)([^】]*)(】)`)
    const match = text.match(re)
    if (!match) continue
    const fixed = reconcilePlotVehicles(match[2], narr)
    if (fixed !== match[2]) {
      text = text.replace(match[0], `${match[1]}${fixed}${match[3]}`)
    }
  }
  return text
}

/** 【年代场景】是否已写明 prior 中的具体陈列物件（泛称「货物/商品」不算） */
function eraSceneHasSpecificListedGoods(eraScene: string, props: string[]): boolean {
  const text = String(eraScene || '').trim()
  if (!text || !props.length) return false
  return props.some((p) => {
    const parts = p.split(/[与和、]/).map(s => s.trim()).filter(s => s.length >= 2)
    return parts.some(part => text.includes(part))
  })
}

function collectContinuityPropsForPromptOptions(options?: FinalizeNarrationPromptOptions): string[] {
  const lines = options?.narrationLines?.map(s => s.trim()).filter(Boolean) || []
  if (!lines.length) return []
  const priorLines = resolvePriorNarrationLines({
    fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines,
    timelineUpToIndex: options?.timelineUpToIndex,
    priorNarrationLines: options?.priorNarrationLines,
  })
  const contextText = [...priorLines.slice(-4), lines.join('')].join('')
  const sceneTags = detectNarrationSceneTags(contextText)
  const sceneHint = inferActiveSceneFromContext(lines.join(''), priorLines, sceneTags)
  return collectRelevantContinuityProps(priorLines, lines, sceneTags, sceneHint)
}

function inferFixturesFromNarrationOptions(options?: FinalizeNarrationPromptOptions): string {
  const lines = options?.narrationLines?.map(s => s.trim()).filter(Boolean)
  if (!lines?.length) return ''
  const { fixtures } = parseNarrationIntoScenePlot(lines, {
    fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines,
    timelineUpToIndex: options?.timelineUpToIndex,
    protagonistHints: options?.protagonistHints,
  })
  return fixtures
}

/** LLM 原文落库 / 生图前：按全文 prior 补全【年代场景】中的具体陈设物件 */
function enrichFixturesInImagePrompt(
  prompt: string,
  options?: FinalizeNarrationPromptOptions,
): string {
  let text = String(prompt || '')
  const props = collectContinuityPropsForPromptOptions(options)
  const inferredFixtures = inferFixturesFromNarrationOptions(options)
  if (!props.length && !inferredFixtures) return text

  const legacyFixtures = text.match(/【陈设[：:]\s*([^】]+)】/)
  if (legacyFixtures) {
    text = text.replace(legacyFixtures[0], '')
  }

  const eraMatch = text.match(/(【年代场景[：:]\s*)([^】]*)(】)/)
  if (!eraMatch) return text

  const eraScene = eraMatch[2].trim()
  if (eraSceneHasSpecificListedGoods(eraScene, props)) return text

  const sceneTags = detectNarrationSceneTags([
    ...(options?.fullNarrationLines?.slice(0, options.timelineUpToIndex) || []),
    ...(options?.narrationLines || []),
  ].join(''))
  const fixtureText = inferredFixtures
    || inferFixturesDisplay(eraScene, props, options?.narrationLines?.join('') || '', sceneTags)
  if (!fixtureText && !props.length) return text

  let merged = eraScene
    .replace(/，?\s*(各类商品|各种货物|货物堆|成箱货物|堆积的货物|简化货物)(?=[，,]|$)/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/^，|，$/g, '')
    .trim()

  const toAppend = fixtureText || (props.length
    ? inferFixturesDisplay(merged || eraScene, props, '', sceneTags)
    : '')
  if (!toAppend) return text

  const firstGood = props[0]?.split(/[与和、]/)[0] || toAppend.slice(0, 4)
  if (!merged.includes(firstGood) && !merged.includes(toAppend)) {
    merged = [merged, toAppend].filter(Boolean).join('，')
  }

  return text.replace(eraMatch[0], `${eraMatch[1]}${merged}${eraMatch[3]}`)
}

function contextualizePlotForScene(
  plot: string,
  scene: string,
  props: string[],
  sceneTags: string[],
): string {
  const base = String(plot || '').trim()
  if (!base) return base

  const isMarket = (sceneTags.includes('market') || /夜市|摊位|摆摊|摆地摊/.test(scene))
    && !/店铺|门面|服装店|杂货/.test(scene)
  if (!isMarket) return base

  const goods = props.length ? props.slice(0, 3).join('与') : ''
  if (/交易|卖|顾客|生意|挑选|展示|讨价还价/.test(base)) {
    return goods
      ? `在摊位前向几位白色素体小人展示${goods}，与几位白色素体小人讨价还价`
      : '在摊位前向几位白色素体小人展示货物并交易挑选'
  }
  if (/整理.*货物|整理陈列|摆摊|招揽/.test(base)) {
    return goods ? `在摊位前整理陈列${goods}` : base
  }
  if (/自信站立|简化城市|从容应对|心里有数/.test(base)) {
    return goods
      ? `在摊位前从容展示${goods}，继续向围观的白色素体小人招揽`
      : '在摊位前从容应对，继续向围观的白色素体小人招揽'
  }
  if (goods && !base.includes(goods)) {
    return `在摊位前展示${goods}，${base}`
  }
  return base
}

function appendPropsToVisualPlot(plot: string, props: string[]): string {
  const base = String(plot || '').trim()
  if (!base || !props.length) return base
  const missing = props.filter(p => !base.includes(p))
  if (!missing.length) return base
  if (/摊位|摆摊|摆地摊|夜市|整理货物|卖|货物|商品/.test(base)) {
    return `${base}，摊位上可见${missing.slice(0, 3).join('与')}`
  }
  return base
}

function buildFocusedScenePlot(
  sentences: string[],
  priorLines?: string[],
  sceneHint?: string,
  protagonistHints?: NarrationProtagonistHint[],
): string {
  const lines = sentences.map(s => String(s || '').trim()).filter(Boolean)
  if (!lines.length) return ''
  const prior = priorLines || []
  const currentText = lines.join('')
  const contextText = prior.slice(-4).join('') + currentText
  const sceneTags = detectNarrationSceneTags(contextText)
  const scene = sceneHint || inferActiveSceneFromContext(currentText, prior, sceneTags)
  const props = collectRelevantContinuityProps(prior, lines, sceneTags, scene)

  const primaryLine = pickPrimaryActionLine(lines, scene)
  let plot = inferVisualPlotFromNarration(primaryLine, sceneTags)
  if (!plot || isRawNarrationText(plot) || isAbstractNarrationPlot(plot)) {
    plot = inferVisualPlotFromNarration(currentText, sceneTags)
  }
  if (!plot || isRawNarrationText(plot) || isAbstractNarrationPlot(plot)) {
    for (const line of lines) {
      const linePlot = inferVisualPlotFromNarration(line, sceneTags)
      if (linePlot && !isRawNarrationText(linePlot) && !isAbstractNarrationPlot(linePlot)) {
        plot = linePlot
        break
      }
    }
  }
  if (!plot || isRawNarrationText(plot) || isAbstractNarrationPlot(plot)) {
    plot = inferVisualPlotFromNarration(currentText, sceneTags)
  }
  plot = contextualizePlotForScene(plot, scene, props, sceneTags)
  plot = reconcilePlotVehicles(plot, currentText)
  return formatMinimalProtagonistPlot(plot, {
    narrationText: currentText,
    protagonistHints,
  })
}

function narrationParagraphToVisualPlot(sentences: string[], priorLines?: string[]): string {
  return buildFocusedScenePlot(sentences, priorLines)
}

function resolvePrimaryScene(sceneParts: string[]): string {
  const unique = [...new Set(sceneParts.filter(Boolean))]
  if (!unique.length) return ''
  if (unique.length <= 2) return unique.join('，')

  const priority = ['批发市场', '夜市', '供销社', '店铺', '门面', '摊位', '春日', '夏日', '秋日', '冬日', '夜晚', '清晨', '街道', '院落', '县城']
  for (const key of priority) {
    const hit = unique.find(part => part.includes(key))
    if (hit) return hit
  }
  return unique[0]
}

function resolvePriorNarrationLines(options?: NarrationScenePromptOptions): string[] {
  const full = resolveFullNarrationLines(options)
  if (!full.length) return []
  const upTo = options?.timelineUpToIndex
  if (upTo != null && upTo > 0) return full.slice(0, upTo)
  return []
}

function inferNarrationAtmosphereFromText(text: string, sceneHint?: string): string {
  const t = `${sceneHint || ''}${text}`
  if (/婚礼|娶了|提亲|十里八乡|风风光光/.test(t)) return '喜庆热闹、人头攒动的欢庆氛围'
  if (/彩电|彩色电视|串门|客厅|家里天天/.test(t)) return '温馨闲适、邻里往来的家居氛围'
  if (/夜市|摆地摊|赶时髦|卖光|生意好|一晚上/.test(t)) return '灯火通明、喧闹繁忙的市井氛围'
  if (/批发市场|批了一车|进货|货物堆/.test(t)) return '嘈杂忙碌、货物堆积的交易氛围'
  if (/开店|门面|服装店|雇了|喝茶|收收钱/.test(t)) return '安稳经营、日常忙碌的店铺氛围'
  if (/网购|客人.*少|不行了|滞销|卖不出去|砸在手里|没落/.test(t)) return '冷清落寞、客流稀少的萧条氛围'
  if (/杂货|油盐|蒲扇|六十岁|晚年|小门面/.test(t)) return '平静怀旧、岁月悠然的低沉氛围'
  if (/时代|浪潮|风口|裸泳|变迁|平淡如水|起起落落/.test(t)) return '宁静沉思、略带感伤的叙事氛围'
  if (/疯了|议论|投机|铁饭碗/.test(t)) return '紧张对峙、议论纷纷的紧张氛围'
  if (/万元户|赚钱|收入|越多|风光/.test(t)) return '兴旺得意、充满希望的喜悦氛围'
  if (/春天|春日|清晨|黎明/.test(t)) return '和煦明亮、充满生机的春日氛围'
  if (/1985|80年代|90年代|2000/.test(t)) return '怀旧年代感、温和复古的叙事氛围'
  if (/供销社|辞职/.test(t)) return '平静克制、略带决心的日常氛围'
  return '平和日常、低饱和安静的叙事氛围'
}

function inferFixturesDisplay(scene: string, props: string[], plot: string, sceneTags: string[]): string {
  if (!props.length) return ''
  const goods = props.slice(0, 3).join('与')
  const ctx = `${scene}${plot}`
  const hasFixture = /摊位|地摊|货架|柜台|桌面|展台|铺面|店铺|店面|门店|市场|铺子/.test(ctx)
    || sceneTags.includes('market') || sceneTags.includes('shop') || sceneTags.includes('wholesale')
  if (!hasFixture) return ''
  if (/摊位|地摊|夜市|摆摊/.test(ctx)) return `摊位上陈列${goods}`
  if (/货架|批发市场|仓库/.test(ctx)) return `货架与堆面上摆放${goods}`
  if (/柜台|收银/.test(ctx)) return `柜台上摆放${goods}`
  if (/桌面|书桌|餐桌/.test(ctx)) return `桌面上摆放${goods}`
  if (/店铺|店面|门店|门面/.test(ctx)) return `店内货架陈列${goods}`
  return `可见陈设包括${goods}`
}

/** 从配图段旁白句拆出【场景】【陈设】【剧情】 */
export function parseNarrationIntoScenePlot(
  input: string | string[],
  options?: NarrationScenePromptOptions,
): { scene: string; atmosphere: string; fixtures: string; plot: string } {
  const lines = (Array.isArray(input)
    ? input
    : String(input || '').split(/[。！？]+/))
    .map(s => String(s || '').trim())
    .filter(Boolean)
  if (!lines.length) return { scene: '', atmosphere: '', fixtures: '', plot: '' }

  const fullText = lines.join('')
  const priorLines = resolvePriorNarrationLines(options)
  const contextText = [...priorLines.slice(-4), fullText].join('')
  const sceneTags = detectNarrationSceneTags(contextText)
  let scene = inferActiveSceneFromContext(fullText, priorLines, sceneTags)
  if (!scene) {
    const allParts = extractScenePartsFromNarrationText(fullText)
    scene = normalizeBracketContent(resolvePrimaryScene(allParts))
      || (/万元户|摆地摊|赚钱|创业/.test(fullText) ? '简化县城街景，寓意经营成功氛围' : '')
  }
  const props = collectRelevantContinuityProps(priorLines, lines, sceneTags, scene)
  const plot = buildFocusedScenePlot(lines, priorLines, scene, options?.protagonistHints)
  scene = reconcileSceneWithPlot(scene, plot, sceneTags)
  const atmosphere = inferNarrationAtmosphereFromText(fullText, scene)
  const fixtures = inferFixturesDisplay(scene, props, plot, sceneTags)
  return { scene, atmosphere, fixtures, plot }
}

/** 按配图段旁白句组装完整场景 prompt（【场景】【陈设】【剧情】智能推断 + 素体万能模板） */
export function buildNarrationSceneImagePromptFromSentences(
  sentences: string | string[],
  options?: NarrationScenePromptOptions,
): string {
  const { scene, atmosphere, fixtures, plot } = parseNarrationIntoScenePlot(sentences, options)
  if (!scene && !atmosphere && !fixtures && !plot) return ''
  return assembleNarrationUniversalScenePrompt(scene, plot, { fixtures, atmosphere })
}

function enrichNarrationVisualParts(scene: string, plot: string, fallback = ''): { scene: string; plot: string } {
  const merged = [scene, plot, fallback].filter(Boolean).join('，')
  let nextScene = normalizeBracketContent(scene)
  let nextPlot = normalizeBracketContent(plot)

  const needsSceneInfer = !nextScene
    || isRawNarrationText(nextScene)
    || !/(街景|内景|背景|市场|夜市|店铺|现场|通道|院落|街道|供销社)/.test(nextScene)
  const needsPlotInfer = !nextPlot?.trim()
    || isRawNarrationText(nextPlot)
    || isAbstractNarrationPlot(nextPlot)

  if (needsSceneInfer) {
    nextScene = inferVisualSceneFromNarration(merged) || nextScene
  }
  if (needsPlotInfer) {
    nextPlot = inferVisualPlotFromNarration(merged) || nextPlot
  }
  if (!nextScene && nextPlot) {
    nextScene = inferVisualSceneFromNarration(merged)
  }
  if (!nextPlot && (nextScene || fallback)) {
    nextPlot = inferVisualPlotFromNarration(merged || fallback)
  }
  return { scene: nextScene, plot: nextPlot }
}

/** 去掉模板固定词，保留【场景】【剧情】正文 */
export function extractNarrationPromptContentCore(raw?: string | null): string {
  let text = String(raw || '').trim()
  if (!text) return ''
  text = text.replace(/[，,]\s*负面提示[：:][\s\S]*$/i, '').trim()

  const titleSceneBracket = text.match(/【片头背景场景[：:]\s*([^】]+)】/)
  const titlePlotBracket = text.match(/【主题氛围[：:]\s*([^】]+)】/)
  if (titleSceneBracket || titlePlotBracket) {
    return sanitizeSceneImagePrompt([
      titleSceneBracket?.[1] ? `片头背景场景：${titleSceneBracket[1].trim()}` : '',
      titlePlotBracket?.[1]?.trim(),
    ].filter(Boolean).join('，'))
  }

  const subjectBracket = text.match(/【画面主体[：:]\s*([^】]+)】/)
  const eraSceneBracket = text.match(/【年代场景[：:]\s*([^】]+)】/)
  const actionBracket = text.match(/【核心细节动作[：:]\s*([^】]+)】/)
  const lightingBracket = text.match(/【光影色调[：:]\s*([^】]+)】/)
  const cameraBracket = text.match(/【镜头视角[：:]\s*([^】]+)】/)
  const textureBracket = text.match(/【质感要求[：:]\s*([^】]+)】/)
  if (subjectBracket || eraSceneBracket || actionBracket || lightingBracket || cameraBracket || textureBracket) {
    return sanitizeSceneImagePrompt([
      subjectBracket?.[1]?.trim(),
      eraSceneBracket?.[1]?.trim(),
      actionBracket?.[1]?.trim(),
      lightingBracket?.[1]?.trim(),
      cameraBracket?.[1]?.trim(),
      textureBracket?.[1]?.trim(),
    ].filter(Boolean).join('，'))
  }

  const sceneBracket = text.match(/【场景[：:]\s*([^】]+)】/)
  const atmosphereBracket = text.match(/【环境气氛[：:]\s*([^】]+)】/)
  const fixturesBracket = text.match(/【陈设[：:]\s*([^】]+)】/)
  const plotBracket = text.match(/【剧情[：:]\s*([^】]+)】/)
  if (sceneBracket || atmosphereBracket || fixturesBracket || plotBracket) {
    return sanitizeSceneImagePrompt([
      sceneBracket?.[1]?.trim(),
      atmosphereBracket?.[1]?.trim(),
      fixturesBracket?.[1]?.trim(),
      plotBracket?.[1]?.trim(),
    ].filter(Boolean).join('，'))
  }

  const leftBracket = text.match(/【左格[：:]\s*([^】]+)】/)
  const rightBracket = text.match(/【右格[：:]\s*([^】]+)】/)
  if (leftBracket || rightBracket) {
    return sanitizeSceneImagePrompt([
      '单张横向两宫格',
      leftBracket?.[1] ? `左格：${leftBracket[1].trim()}` : '',
      rightBracket?.[1] ? `右格：${rightBracket[1].trim()}` : '',
    ].filter(Boolean).join('，'))
  }

  for (const part of NARRATION_PROMPT_BOILERPLATE_PARTS) {
    text = text.replace(new RegExp(`[，,]?\\s*${escapeRegExp(part)}[，,]?`, 'g'), '，')
  }
  return sanitizeSceneImagePrompt(text)
}

/** 从【核心细节动作】去掉以「主人公」开头的分句（生图时主人公仅在【画面主体】描述一次） */
export function stripProtagonistClausesFromNarrationAction(action?: string | null): string {
  const parts = String(action || '').split(/[，,]/).map(s => s.trim()).filter(Boolean)
  if (!parts.length) return ''
  const kept = parts.filter(p => !/^主人公/.test(p) && !/^该主人公/.test(p))
  if (kept.length) return kept.join('，')
  return parts.filter(p => /配角|路人|群众|老师|店员|老板|衙役/.test(p)).join('，')
}

/** 非站立/休息姿态（编译层修正前缀 + 附加强约束） */
export const NARRATION_NON_STANDING_POSE_RE =
  /趴|伏|躺|卧|侧(?:卧|身|躺)?|蹲|坐于|伏低|闭目|闭眼|休息|睡觉|入睡|盖被|蜷缩/

/** 无配角休息场景：生图英文 negative */
export const NARRATION_REST_SCENE_NO_CROWD_NEGATIVE =
  'duplicate character, two same characters, standing figure, upright pose, front view standing, character sheet, turnaround, multiple views, clone, twin, mirror self, second protagonist, extra stick figure, crowd, watermark, text, logo'

/** 无配角休息场景：生图英文 positive 强约束 */
export const NARRATION_REST_SCENE_NO_CROWD_POSITIVE =
  'single character only, exactly one protagonist in the entire frame, resting or sleeping pose only, no standing figure anywhere'

export function isNarrationRestSceneNoCrowd(
  subject: string,
  action: string,
  era = '',
): boolean {
  const blob = `${subject}${action}${era}`
  const noCrowd = /无配角|仅一位主人公|唯一主人公|全画面仅\s*1\s*位/i.test(blob)
  return noCrowd && NARRATION_NON_STANDING_POSE_RE.test(blob)
}

/** 镜头/光影以裤脚、鞋、手等肢体局部为主 framing（与全身主人公冲突） */
export const NARRATION_BODY_PART_FOCUS_RE =
  /裤脚|脚踝|鞋(?:尖|面|子)?|脚尖|手指|指尖|手(?:背|心|腕)|猫爪|爪尖|接触点/

export const NARRATION_CLOSEUP_SHOT_RE =
  /特写|近景|大特写|极端特写|微距|局部(?:特写|镜头)/

export const NARRATION_PARTIAL_CLOSEUP_NEGATIVE =
  'giant legs, giant shoes, disembodied legs, second pair of legs, extra legs, oversized body parts, cropped anonymous legs, duplicate pants, two different people legs, macro leg shot separated from character, separate giant trousers'

export const NARRATION_PARTIAL_CLOSEUP_POSITIVE =
  'same single protagonist head to feet in one frame, cat interacts with that same protagonist pants hem only, one consistent body scale, no giant separate legs or shoes'

export function isNarrationPartialCloseupConflict(
  subject: string,
  action: string,
  lighting: string,
  camera: string,
): boolean {
  const hasSoloProtagonist = /一位.*(?:主人公|素体小人)/.test(subject)
    && !/两位|几位.*主人公/.test(subject)
  if (!hasSoloProtagonist) return false

  const blob = `${subject}${action}${lighting}${camera}`
  const mentionsBodyPart = NARRATION_BODY_PART_FOCUS_RE.test(blob)
  if (!mentionsBodyPart) return false

  const closeupCamera = NARRATION_CLOSEUP_SHOT_RE.test(camera)
    && /(?:朝向|对准|对准于|聚焦于|特写于).*(?:裤|脚|鞋|爪|手|接触点)|(?:裤|脚|鞋|爪|手|接触点).*(?:特写|近景)/.test(`${camera}${lighting}`)
  const lightingFocusPart = /聚焦于(?:裤脚|脚边|鞋|猫爪|爪尖|接触点)/.test(lighting)
  const cameraTowardPart = /镜头(?:朝向|对准).*(?:裤脚|脚|鞋|猫爪|爪尖|接触点)/.test(camera)

  return closeupCamera || lightingFocusPart || cameraTowardPart
}

export function fixNarrationPartialCloseupCamera(
  camera: string,
  subject: string,
  action: string,
): string {
  const lookingDown = /低头|看脚|俯/.test(`${subject}${action}${camera}`)
  if (lookingDown) {
    return '中近景略俯拍，同一主人公从头顶到裤脚完整入镜，脚边互动在该主人公身上'
  }
  return '中景平视，同一主人公全身清晰入镜，局部互动在该主人公身上'
}

export function fixNarrationPartialCloseupLighting(lighting: string): string {
  return String(lighting || '')
    .replace(/聚焦于(?:裤脚|脚边|鞋|猫爪|爪尖|接触点)与/g, '局部光仍照同一主人公与')
    .replace(/聚焦于(?:裤脚|脚边|鞋|猫爪|爪尖|接触点)(?:互动)?/g, '局部光仍照同一主人公脚边互动')
    .trim()
}

export function enrichNarrationPartialCloseupSubject(subject: string, action: string): string {
  let text = String(subject || '').trim()
  if (!text) return text
  if (/同一(?:人|主人公)|该主人公|同一人|禁止第二个人的腿/.test(text)) return text

  const footInteraction = /裤脚|猫.*爪|爪.*裤|脚边/.test(`${text}${action}`)
  if (!footInteraction) {
    return `${text}，同一人的肢体不得脱离身体单独放大`
  }
  if (/无配角/.test(text)) {
    return text.replace(
      /无配角/,
      '脚边互动须在同一主人公身上，禁止第二个人的腿或鞋，无配角',
    )
  }
  return `${text}，脚边互动须在同一主人公身上，禁止第二个人的腿或鞋`
}

export function normalizeNarrationPartialCloseupAction(action: string): string {
  return String(action || '')
    .replace(/伸出爪子勾住(?:该)?主人公(?:的)?裤脚/g, '伸爪勾住裤脚')
    .replace(/勾住(?:该)?主人公(?:的)?裤脚/g, '伸爪勾住裤脚')
    .replace(/伸出爪子勾住裤脚/g, '伸爪勾住裤脚')
    .replace(/(?:该)?主人公(?:的)?裤脚/g, '裤脚')
}

export function applyNarrationPartialCloseupFixes(fields: {
  subject: string
  action: string
  lighting: string
  camera: string
}): { subject: string; action: string; lighting: string; camera: string; conflict: boolean } {
  const conflict = isNarrationPartialCloseupConflict(
    fields.subject,
    fields.action,
    fields.lighting,
    fields.camera,
  )
  if (!conflict) return { ...fields, conflict: false }
  return {
    subject: enrichNarrationPartialCloseupSubject(fields.subject, fields.action),
    action: normalizeNarrationPartialCloseupAction(fields.action),
    lighting: fixNarrationPartialCloseupLighting(fields.lighting) || fields.lighting,
    camera: fixNarrationPartialCloseupCamera(fields.camera, fields.subject, fields.action),
    conflict: true,
  }
}

function mergeNarrationImageNegativePrompts(...parts: Array<string | undefined>): string | undefined {
  const merged = parts
    .flatMap(part => String(part || '').split(/[,，]/))
    .map(item => item.trim())
    .filter(Boolean)
  if (!merged.length) return undefined
  return Array.from(new Set(merged)).join(', ')
}

function fixNarrationGenerationPrefix(prefix: string, nonStanding: boolean): string {
  if (nonStanding) {
    return prefix
      .replace(/青年标准站姿总高约三个头高/g, '姿态以【画面主体】描述为准')
      .replace(/青年期简笔身形总高约三个头高/g, '姿态以【画面主体】描述为准')
      .replace(/具体总高与胖瘦按【画面主体】人生阶段执行对应规格（青年期三头身为基准）/g, '姿态以【画面主体】描述为准')
  }
  return prefix
    .replace(/青年标准站姿总高约三个头高/g, '青年期三头身为基准')
    .replace(/青年期简笔身形总高约三个头高/g, '青年期三头身为基准')
}

/** 将旧库无前缀 bracket 的裸前缀块迁移为【画风规格】 */
export function ensureNarrationStyleSpecDim(text: string, style?: string | null): string {
  const raw = String(text || '').trim()
  if (!raw || /【画风规格[：:]/.test(raw)) return raw

  const bodyStart = raw.search(/【(?:画面主体|年代场景|片头背景场景|左格|主题氛围)/)
  if (bodyStart > 0) {
    const maybePrefix = raw.slice(0, bodyStart).replace(/[，,]+$/g, '').trim()
    if (/16:9\s*横屏/.test(maybePrefix) && (/白色素体小人|简笔/.test(maybePrefix) || isNarrationAnimeStyleSpecText(maybePrefix))) {
      return `${formatNarrationStyleSpecBracket(maybePrefix, style)}，${raw.slice(bodyStart)}`
    }
  }

  if (/【(?:画面主体|年代场景)/.test(raw)) {
    return `${formatNarrationStyleSpecBracket(undefined, style)}，${raw}`
  }
  return raw
}

function resolveNarrationStyleSpecFromPrompt(text: string, style?: string | null): string {
  const bracketed = extractNarrationPromptBracketContents(text, NARRATION_STYLE_SPEC_DIM_LABEL)[0]
  if (bracketed) return bracketed

  const bodyStart = text.search(/【(?:画风规格|画面主体|年代场景)/)
  if (bodyStart > 0) {
    const legacyPrefix = text.slice(0, bodyStart).replace(/[，,]+$/g, '').trim()
    if (/16:9\s*横屏/.test(legacyPrefix)) return legacyPrefix
  }
  return getNarrationStyleSpecBody(style)
}

export interface NarrationImageGenerationBundle {
  prompt: string
  negativePrompt?: string
}

/**
 * 六维 prompt 落库格式 → 文生图 API 用单行场景描述。
 * 文生图模型不识别六维标签，且【画面主体】【核心细节动作】各写「主人公」会重复入画。
 */
export function compileNarrationImageGenerationBundle(
  raw?: string | null,
  style?: string | null,
): { prompt: string; negativePrompt?: string } {
  const text = ensureNarrationStyleSpecDim(String(raw || '').trim(), style)
  if (!text || !hasNarrationSixDimStructure(text)) return { prompt: text }
  if (/【左格】/.test(text) && /【右格】/.test(text)) return { prompt: text }

  const subject = extractNarrationPromptBracketContents(text, '画面主体')[0] ?? ''
  const era = extractNarrationPromptBracketContents(text, '年代场景')[0] ?? ''
  const action = extractNarrationPromptBracketContents(text, '核心细节动作')[0] ?? ''
  const lighting = extractNarrationPromptBracketContents(text, '光影色调')[0] ?? ''
  const camera = extractNarrationPromptBracketContents(text, '镜头视角')[0] ?? ''
  const styleSpecRaw = resolveNarrationStyleSpecFromPrompt(text, style)
  const anime = isNarrationAnimeStyle(style) || isNarrationAnimeStyleSpecText(styleSpecRaw)
  const motionComic = isMotionComicStyle(style)

  if (motionComic) {
    const visualCoreParts = [
      styleSpecRaw || MOTION_COMIC_STYLE_SPEC,
      subject,
      era,
      action,
      lighting,
      camera,
    ]
    const prompt = tidyAppearancePunctuation([
      visualCoreParts.filter(Boolean).join('，'),
      MOTION_COMIC_SCENE_SUFFIX,
    ].join('，'))
    return {
      prompt,
      negativePrompt: mergeNarrationImageNegativePrompts(MOTION_COMIC_NEGATIVE_PROMPT),
    }
  }

  if (anime) {
    const visualCoreParts = [
      styleSpecRaw || NARRATION_ANIME_STYLE_SPEC_BODY,
      subject,
      era,
      stripProtagonistClausesFromNarrationAction(action),
      lighting,
      camera,
    ]
    const prompt = tidyAppearancePunctuation([
      visualCoreParts.filter(Boolean).join('，'),
      NARRATION_ANIME_SCENE_SUFFIX,
    ].join('，'))
    return {
      prompt,
      negativePrompt: mergeNarrationImageNegativePrompts(
        NARRATION_ANIME_IMAGE_NEGATIVE_PROMPT,
      ),
    }
  }

  const nonStanding = NARRATION_NON_STANDING_POSE_RE.test(`${subject}${action}`)
  const restNoCrowd = isNarrationRestSceneNoCrowd(subject, action, era)
  const styleSpecFixed = fixNarrationGenerationPrefix(styleSpecRaw, nonStanding)
  const partialFixed = applyNarrationPartialCloseupFixes({
    subject,
    action,
    lighting,
    camera,
  })
  const bodyStage = extractNarrationBodyStageFromText(partialFixed.subject || subject)
  const weightTier = extractNarrationBodyWeightTierFromText(partialFixed.subject || subject)
  const bodyStageSpec = bodyStage ? formatNarrationBodyWeightSpec(bodyStage, weightTier) : undefined

  const visualCoreParts = [
    styleSpecFixed,
    NARRATION_BODY_HEAD_SIZE_POSITIVE,
    partialFixed.subject,
    bodyStageSpec,
    era,
    stripProtagonistClausesFromNarrationAction(partialFixed.action),
    partialFixed.lighting,
    partialFixed.camera,
    '全画面仅一位主人公，禁止第二个同款服装素体小人',
  ]
  if (restNoCrowd) {
    visualCoreParts.push(NARRATION_REST_SCENE_NO_CROWD_POSITIVE)
    visualCoreParts.push(`Avoid: ${NARRATION_REST_SCENE_NO_CROWD_NEGATIVE}`)
  }
  if (partialFixed.conflict) {
    visualCoreParts.push(NARRATION_PARTIAL_CLOSEUP_POSITIVE)
    visualCoreParts.push(`Avoid: ${NARRATION_PARTIAL_CLOSEUP_NEGATIVE}`)
  }

  const prompt = tidyAppearancePunctuation([
    visualCoreParts.filter(Boolean).join('，'),
    NARRATION_UNIVERSAL_SCENE_SUFFIX,
  ].join('，'))

  return {
    prompt,
    negativePrompt: mergeNarrationImageNegativePrompts(
      NARRATION_BODY_HEAD_SIZE_NEGATIVE,
      restNoCrowd ? NARRATION_REST_SCENE_NO_CROWD_NEGATIVE : undefined,
      partialFixed.conflict ? NARRATION_PARTIAL_CLOSEUP_NEGATIVE : undefined,
      NARRATION_IMAGE_NEGATIVE_PROMPT,
    ),
  }
}

export function compileNarrationImageGenerationPrompt(raw?: string | null, style?: string | null): string {
  return compileNarrationImageGenerationBundle(raw, style).prompt
}

/** 将一段内容拆成场景环境 + 剧情动作 */
export function splitNarrationSceneAndPlot(content: string): { scene: string; plot: string } {
  const text = sanitizeSceneImagePrompt(content)
  if (!text) return { scene: '', plot: '' }

  const sceneBracket = text.match(/【场景[：:]\s*([^】]+)】/)
  const plotBracket = text.match(/【剧情[：:]\s*([^】]+)】/)
  if (sceneBracket || plotBracket) {
    return {
      scene: sceneBracket?.[1]?.trim() || '',
      plot: plotBracket?.[1]?.trim() || '',
    }
  }

  if (/^(片头|单张横向两宫格|左格：|右格：|【左格|【右格|【片头)/.test(text)) {
    return { scene: text, plot: '' }
  }

  const locationMatch = text.match(
    /^(.*?(?:街景|夜市|市场|店铺|店面|客厅|婚礼|现场|街道|杂货铺|仓库|柜台|办公室|教室|供销社|批发|居民楼|地铁站|医院|厨房|内|外|门口|旁|背景|场景))(?:[，,]\s*)(.+)$/s,
  )
  if (locationMatch?.[1] && locationMatch?.[2] && locationMatch[1].length <= 48) {
    return { scene: locationMatch[1].trim(), plot: locationMatch[2].trim() }
  }

  const actorMatch = text.match(/^(.+?)([，,]\s*(?:多个|两个|三个|几位|主角|素体小人).+)$/s)
  if (actorMatch?.[1] && actorMatch?.[2]) {
    return { scene: actorMatch[1].trim(), plot: actorMatch[2].trim().replace(/^[，,\s]+/, '') }
  }

  const comma = text.indexOf('，')
  if (comma > 4 && comma < text.length - 6) {
    return { scene: text.slice(0, comma).trim(), plot: text.slice(comma + 1).trim() }
  }
  return { scene: '', plot: text }
}

function ensureNarrationBracket(label: string, content: string): string {
  const trimmed = String(content || '').trim()
  if (!trimmed) return ''
  if (new RegExp(`^【${label}[：:]`).test(trimmed)) {
    return trimmed.endsWith('】') ? trimmed : `【${label}：${trimmed}】`
  }
  return `【${label}：${trimmed}】`
}

/** 【剧情】写入 prompt：清洗旁白原文并保证素体小人可见动作 */
function formatNarrationPlotForPrompt(plot?: string | null): string {
  return String(plot || '').trim()
}

function sanitizeNarrationPlotForPrompt(
  plot?: string | null,
  narrationLines?: string[],
  options?: {
    protagonistHints?: NarrationProtagonistHint[]
    scene?: string
    priorLines?: string[]
  },
): string {
  const raw = String(plot || '').trim()
  const lines = narrationLines?.map(s => s.trim()).filter(Boolean) || []
  const narrationText = lines.join('')
  const prior = options?.priorLines || []
  const sceneTags = detectNarrationSceneTags([...prior.slice(-4), narrationText].join(''))

  const plotEchoesNarration = narrationText.length >= 8
    && (raw.includes(narrationText.slice(0, Math.min(14, narrationText.length)))
      || lines.some(line => line.length >= 6 && raw.includes(line.slice(0, Math.min(12, line.length)))))

  const needsRework = !raw
    || isRawNarrationText(raw)
    || isAbstractNarrationPlot(raw)
    || plotEchoesNarration

  if (needsRework && lines.length) {
    const inferred = buildFocusedScenePlot(lines, prior, options?.scene, options?.protagonistHints)
    if (inferred && !isRawNarrationText(inferred) && !isAbstractNarrationPlot(inferred)) {
      return inferred
    }
    const fallback = inferVisualPlotFromNarration(narrationText, sceneTags)
    if (fallback && !isRawNarrationText(fallback)) {
      return formatMinimalProtagonistPlot(fallback, {
        narrationText,
        protagonistHints: options?.protagonistHints,
      })
    }
  }

  return formatMinimalProtagonistPlot(raw, {
    narrationText,
    protagonistHints: options?.protagonistHints,
  })
}

function propAllowedInFixtures(propLabel: string, allowedProps: string[]): boolean {
  if (!propLabel) return false
  return allowedProps.some(p => p === propLabel || p.includes(propLabel) || propLabel.includes(p))
}

function sanitizeFixturesForParagraph(
  allowedProps: string[],
  scene: string,
  sceneTags: string[],
  plot: string,
  llmFixtures?: string | null,
): string {
  if (!allowedProps.length) return ''
  const inferred = inferFixturesDisplay(scene, allowedProps, plot, sceneTags)
  const llm = normalizeBracketContent(llmFixtures)
  if (!llm) return inferred

  for (const [, label] of PERSISTENT_VISUAL_PROPS) {
    if (llm.includes(label) && !propAllowedInFixtures(label, allowedProps)) {
      return inferred
    }
  }
  if (inferred && llm !== inferred) {
    const allowedGoods = allowedProps.slice(0, 3).join('与')
    if (allowedGoods && !llm.includes(allowedGoods.split('与')[0])) {
      return inferred
    }
  }
  return llm
}

export type NarrationScenePromptOptions = {
  /** 本集全部旁白句（按时间顺序） */
  fullNarrationLines?: string[]
  /** 仅取 fullNarrationLines[0..timelineUpToIndex) 生成前文概要（不含当前配图段） */
  timelineUpToIndex?: number
  /** @deprecated 请用 fullNarrationLines */
  priorNarrationLines?: string[]
  /** 主人公定妆（用于推断人生阶段与姿态） */
  protagonistHints?: NarrationProtagonistHint[]
}

export type NarrationProtagonistHint = {
  name?: string
  variantLabel?: string | null
  appearance?: string | null
}

function inferProtagonistStageLabel(
  text: string,
  hints?: NarrationProtagonistHint[],
): string | null {
  const fromText = extractNarrationBodyStageFromText(text)
  if (fromText) return fromText
  if (!hints?.length) return null
  for (const hint of hints) {
    const label = String(hint.variantLabel || '').trim().replace(/期$/, '')
    if (label && text.includes(label)) return label
  }
  const primary = String(hints[0]?.variantLabel || '').trim().replace(/期$/, '')
  return primary || null
}

/** 将剧情中的群众/路人统一为几位白色素体配角，主人公保留「主人公」标记 */
export function normalizeMinimalCrowdInPlot(plot?: string | null): string {
  let text = String(plot || '').trim()
  if (!text) return ''
  const body = NARRATION_CROWD_BODY
  const PROT = '\uE000P'

  text = text
    .replace(/黑色素体小人/g, body)
    .replace(/(小孩|少年|青年|中年|老年)期?白色素体小人主人公/g, `$1期${PROT}主人公`)
    .replace(/白色素体小人主人公/g, `${PROT}主人公`)
    .replace(/(小孩|少年|青年|中年|老年)期?素体小人主人公/g, `$1期${PROT}主人公`)

  const crowdReplacements: Array<[RegExp, string]> = [
    [/几位白色素体小人/g, `几位${body}`],
    [/几位素体小人/g, `几位${body}`],
    [/围观的白色素体小人/g, `围观的${body}`],
    [/围观的素体小人/g, `围观的${body}`],
    [/周围几位白色素体小人/g, `周围几位${body}`],
    [/周围几位素体小人/g, `周围几位${body}`],
    [/与几位白色素体小人/g, `与几位${body}`],
    [/与几位素体小人/g, `与几位${body}`],
    [/向几位白色素体小人/g, `向几位${body}`],
    [/向几位素体小人/g, `向几位${body}`],
    [/几位年轻人/g, `几位${body}`],
    [/年轻人围/g, `几位${body}围`],
    [/与年轻人/g, `与几位${body}`],
    [/向顾客/g, `向几位${body}`],
    [/几位顾客/g, `几位${body}`],
    [/顾客围/g, `几位${body}围`],
    [/周围多人/g, `周围几位${body}`],
    [/路人匆匆/g, `几位${body}匆匆`],
    [/行人匆匆/g, `几位${body}匆匆路过`],
    [/围观群众/g, `围观的几位${body}`],
    [/围观者/g, `围观的${body}`],
    [/路人/g, `${body}路人`],
    [/招揽顾客/g, `向围观的${body}招揽`],
    [/进店客人/g, `几位${body}进店`],
  ]
  for (const [pattern, replacement] of crowdReplacements) {
    text = text.replace(pattern, replacement)
  }

  text = text
    .replace(/素体小人主人公/g, `${PROT}主人公`)
    .replace(/(?<!白色)素体小人/g, body)
    .replace(new RegExp(PROT, 'g'), body)

  return text
    .replace(new RegExp(`${body}${body}`, 'g'), body)
}

function pickProtagonistAppearance(
  hints?: NarrationProtagonistHint[],
  stage?: string | null,
): string {
  if (!hints?.length) return ''
  if (stage) {
    const matched = hints.find(h => String(h.variantLabel || '').includes(stage))
    if (matched?.appearance) return String(matched.appearance).trim()
  }
  return String(hints[0]?.appearance || '').trim()
}

/** 将剧情动作加上素体主人公主语，保证全片造型一致 */
function formatMinimalProtagonistPlot(
  plot: string,
  options?: {
    narrationText?: string
    protagonistHints?: NarrationProtagonistHint[]
  },
): string {
  const plotPart = formatNarrationPlotForPrompt(plot)
  if (!plotPart) return ''
  const narrationText = String(options?.narrationText || plotPart)
  if (/素体小人|白色素体小人主人公|白色素体小人|白色圆头/.test(plotPart)) {
    if (isRawNarrationText(plotPart) || isAbstractNarrationPlot(plotPart)) {
      const inferred = inferVisualPlotFromNarration(narrationText, detectNarrationSceneTags(narrationText))
      if (inferred && !isRawNarrationText(inferred)) {
        return normalizeMinimalCrowdInPlot(inferred)
      }
    }
    return normalizeMinimalCrowdInPlot(plotPart)
  }

  const stage = inferProtagonistStageLabel(narrationText, options?.protagonistHints)
  const subject = stage ? `${stage}期${NARRATION_PROTAGONIST_BODY}` : NARRATION_PROTAGONIST_BODY

  if (/几位年轻人|顾客围|路人|围观者|群众|行人/.test(plotPart) && !/素体小人/.test(plotPart)) {
    if (/挑选|顾客|交易|摊位|摆摊/.test(plotPart)) {
      return normalizeMinimalCrowdInPlot(`${subject}在摊位前忙碌经营，${plotPart}`)
    }
  }

  if (/^(在|于|站在|坐在|蹲在|倚在|靠于)/.test(plotPart)) {
    return normalizeMinimalCrowdInPlot(`${subject}${plotPart}`)
  }
  if (/^(推|离开|手持|向|整理|独自|迎面|挥手)/.test(plotPart)) {
    return normalizeMinimalCrowdInPlot(`${subject}${plotPart}`)
  }

  const appearance = pickProtagonistAppearance(options?.protagonistHints, stage)
  if (isRawNarrationText(plotPart) && appearance) {
    const posture = appearance
      .replace(/English tags:[\s\S]*/i, '')
      .replace(new RegExp(NARRATION_MINIMAL_EYES, 'g'), '')
      .trim()
    if (posture && posture.length <= 60) {
      return normalizeMinimalCrowdInPlot(
        `${subject}${posture.startsWith('在') || posture.startsWith('坐') ? '' : '在画面中'}${posture}`,
      )
    }
  }

  if (/摊位|摆摊|店铺|门面|供销社|市场|夜市|杂货/.test(plotPart)) {
    return normalizeMinimalCrowdInPlot(`${subject}在画面中${plotPart}`)
  }
  return normalizeMinimalCrowdInPlot(`${subject}${plotPart}`)
}

function resolveFullNarrationLines(options?: NarrationScenePromptOptions): string[] {
  const full = options?.fullNarrationLines?.map(s => String(s || '').trim()).filter(Boolean)
  if (full?.length) return full
  return (options?.priorNarrationLines || []).map(s => String(s || '').trim()).filter(Boolean)
}

function dedupeNarrationLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const t = String(line || '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function shortenNarrationClause(text: string, maxLen = 18): string {
  let t = String(text || '')
    .replace(/^旁白[：:]\s*/, '')
    .replace(/^剧中[：:]\s*/, '')
    .replace(/[。！？.!?]+$/g, '')
    .trim()
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

function normalizeGoodsLabel(raw: string): string {
  return String(raw || '')
    .replace(/^在[^，,。！？；]{0,12}/, '')
    .replace(/^市场/, '')
    .replace(/批(?:发|了)(?:了)?/, '')
    .replace(/和/g, '与')
    .replace(/[了的地]$/, '')
    .trim()
}

function segmentOverlapsExisting(seg: string, existing: string[]): boolean {
  const norm = (s: string) => String(s || '').replace(/和/g, '与').trim()
  const s = norm(seg)
  if (!s) return true
  return existing.some(e => {
    const n = norm(e)
    if (n === s) return true
    if (n.includes(s) || s.includes(n)) return true
    const shorter = s.length < n.length ? s : n
    const longer = s.length < n.length ? n : s
    return shorter.length >= 4 && longer.includes(shorter)
  })
}

function scoreNarrationBeat(sentence: string): number {
  let score = 0
  for (const hint of NARRATION_PLOT_HINTS) {
    if (hint.re.test(sentence)) score += 2
  }
  for (const [re] of NARRATION_SCENE_KEYWORDS) {
    if (re.test(sentence)) score += 1
  }
  if (/批|卖|摊|店|万元|辞|创业|赚钱|租|开|推.*车|自行车/.test(sentence)) score += 1
  if (isNarrationDateOnlySentence(sentence)) score -= 2
  return score
}

function extractGoodsFromSingleSentence(sentence: string): string | null {
  const s = String(sentence || '').trim()
  const truck = s.match(/(?:一[辆]?车|整整一车|一车)([^，,。！？；]{2,18})/)
  if (truck?.[1]?.trim()) {
    return shortenNarrationClause(truck[1].trim(), 18)
  }
  if (!/批(?:发|了)|进(?:货|了)|卖|摆摊|进货|时髦/.test(s)) return null
  const batch = s.match(/批(?:发|了)(?:了)?([^，,。！？；]{2,20})/)
  if (batch?.[1]) {
    const g = normalizeGoodsLabel(batch[1])
    if (g && g.length >= 2) return g
  }
  const stock = s.match(/进(?:货|了)(?:了)?([^，,。！？；]{2,20})/)
  if (stock?.[1]) {
    const g = normalizeGoodsLabel(stock[1])
    if (g && g.length >= 2) return g
  }
  const trendy = s.match(/赶时髦(?:的)?([^，,。！？；]{2,16})/)
  if (trendy?.[1]) {
    const g = normalizeGoodsLabel(trendy[1])
    if (g && g.length >= 2) return g
  }
  return null
}

function appendSentenceToTimeline(segments: string[], sentence: string): void {
  const s = String(sentence || '').trim()
  if (!s) return

  if (isNarrationDateOnlySentence(s)) {
    const t = shortenNarrationClause(s, 14)
    if (t && !segmentOverlapsExisting(t, segments)) segments.push(t)
    return
  }

  const goods = extractGoodsFromSingleSentence(s)
  if (goods && !segmentOverlapsExisting(goods, segments)) {
    segments.push(goods)
  }

  const action = shortenNarrationClause(s, 22)
  if (!action) return
  if (goods && (action === goods || action.includes(goods) || goods.includes(action))) return
  if (segments.length >= 7 && scoreNarrationBeat(s) <= 0) return
  if (!segmentOverlapsExisting(action, segments)) segments.push(action)
}

function trimTimelineSegments(segments: string[]): string {
  if (segments.length <= 7) return segments.join('→')
  return [...segments.slice(0, 2), '…', ...segments.slice(-4)].join('→')
}

/** 按旁白时间顺序逐句压缩为时间线概要；upToExclusive 不含该索引（用于当前段之前的前文） */
export function compressTimelineNarrationLines(lines?: string[], upToExclusive?: number): string {
  const all = dedupeNarrationLines((lines || []).map(s => String(s || '').trim()).filter(Boolean))
  const scope = upToExclusive != null && upToExclusive >= 0 ? all.slice(0, upToExclusive) : all
  if (!scope.length) return ''
  if (scope.length === 1) return shortenNarrationClause(scope[0], 48)

  const segments: string[] = []
  for (const line of scope) appendSentenceToTimeline(segments, line)

  let result = trimTimelineSegments(segments)
  if (result.length > 200) result = `${result.slice(0, 197)}…`
  return result
}

function buildTimelineContextForPrompt(options?: NarrationScenePromptOptions): string {
  const lines = resolveFullNarrationLines(options)
  if (!lines.length) return ''
  const upTo = options?.timelineUpToIndex
  if (upTo != null && upTo >= 0) return compressTimelineNarrationLines(lines, upTo)
  return compressTimelineNarrationLines(lines)
}

/** 压缩整集旁白（片头等需全文概览时使用） */
export function compressFullNarrationLines(lines?: string[]): string {
  return compressTimelineNarrationLines(lines)
}

/** 按时间线生成前文/全文概要 */
export function buildFullNarrationContext(lines?: string[], upToExclusive?: number): string {
  return compressTimelineNarrationLines(lines, upToExclusive)
}

/** @deprecated 请用 buildFullNarrationContext */
export function buildPriorNarrationContext(priorLines?: string[]): string {
  return buildFullNarrationContext(priorLines)
}

export type NarrationPlotContinuityOptions = {
  priorLines?: string[]
  currentLines?: string[]
}

/** 为【剧情】聚焦当前段主画面，仅保留与当前画面仍相关的延续道具 */
export function applyNarrationPlotContinuity(
  plot: string,
  priorContextOrOptions?: string | NarrationPlotContinuityOptions,
): string {
  const options = typeof priorContextOrOptions === 'object' && priorContextOrOptions != null
    ? priorContextOrOptions
    : undefined
  const currentLines = options?.currentLines?.map(s => String(s || '').trim()).filter(Boolean)
    || (String(plot || '').trim() ? [String(plot || '').trim()] : [])
  if (currentLines.length) {
    return buildFocusedScenePlot(currentLines, options?.priorLines)
  }
  return String(plot || '').trim()
}

/** 向已有 prompt 的指定【】框内追加内容（用于角色名等补充描述） */
export function appendToNarrationBracket(prompt: string, label: string, addition: string): string {
  const trimmed = String(prompt || '').trim()
  const extra = String(addition || '').trim()
  if (!trimmed || !extra) return trimmed
  const re = new RegExp(`(【${label}[：:]\\s*)([^】]*)(】)`)
  const match = trimmed.match(re)
  if (!match) return `${trimmed}，${extra}`
  const inner = match[2].trim()
  const merged = inner ? `${inner}，${extra}` : extra
  return trimmed.replace(match[0], `${match[1]}${merged}${match[3]}`)
}

/** 解说素体画风：将旁白主内容套入万能模板 */
export function wrapNarrationMinimalScenePrompt(plot: string): string {
  const raw = String(plot || '').trim()
  if (!raw) return ''
  const sentences = raw.split(/[。！？]+/).map(s => s.trim()).filter(Boolean)
  if (sentences.length > 1 || (sentences[0] && sentences[0].length > 24)) {
    return buildNarrationSceneImagePromptFromSentences(sentences)
  }
  const plotPart = sanitizeSceneImagePrompt(raw)
  const sceneTags = detectNarrationSceneTags(plotPart)
  const scene = inferVisualSceneFromNarration(plotPart) || ''
  const props = collectGoodsFromNarrationLines([plotPart])
  const fixtures = inferFixturesDisplay(scene, props, plotPart, sceneTags)
  const atmosphere = inferNarrationAtmosphereFromText(plotPart, scene)
  return assembleNarrationUniversalScenePrompt(scene, plotPart, { fixtures, atmosphere })
}

export function wrapNarrationMinimalDiptychPrompt(left: string, right: string): string {
  const leftPart = sanitizeSceneImagePrompt(String(left || '').trim())
  const rightPart = sanitizeSceneImagePrompt(String(right || '').trim())
  if (!leftPart && !rightPart) return ''
  const body = [
    '单张横向两宫格',
    leftPart ? ensureNarrationBracket('左格', leftPart) : '',
    rightPart ? ensureNarrationBracket('右格', rightPart) : '',
  ].filter(Boolean).join('，')
  return tidyAppearancePunctuation([
    formatNarrationStyleSpecBracket(),
    body,
    NARRATION_UNIVERSAL_SCENE_SUFFIX,
  ].join('，'))
}

export function wrapNarrationMinimalTitlePrompt(hook: string): string {
  const theme = sanitizeSceneImagePrompt(String(hook || '').trim())
  if (!theme) return ''
  return assembleNarrationUniversalScenePrompt(theme, '人生剧本叙事氛围，温和日常色调', { title: true })
}

/** 按画风包装配图 prompt：非素体 sanitize；素体仅套画风模板 */
export function applyNarrationStyleToPrompt(
  prompt: string,
  style?: string | null,
  narrationMain?: string,
): string {
  if (isNarrationMinimalStyle(style)) {
    return wrapNarrationMinimalScenePrompt(String(narrationMain || prompt || '').trim())
  }
  return sanitizeSceneImagePrompt(prompt)
}

/** 从剧情推断【画面主体】（规则兜底） */
function inferMinimalSubjectFromPlot(plot: string): string {
  const text = String(plot || '').trim()
  if (!text) return `${NARRATION_PROTAGONIST_BODY}主人公`
  const stageMatch = text.match(/(小孩|少年|青年|中年|老年)期?(?:黑色素体|白色素体)?小人/)
  if (stageMatch) return `${stageMatch[0]}与同框${NARRATION_CROWD_BODY}`
  if (/白色素体小人主人公|白色素体小人|素体小人/.test(text)) {
    const m = text.match(/(?:黑色素体|白色素体|素体)小人[^，,。]{0,24}/)
    if (m) return m[0]
  }
  return `${NARRATION_PROTAGONIST_BODY}主人公`
}

/** 按万能模板组装解说场景配图 prompt */
export function assembleNarrationUniversalScenePrompt(
  scene: string,
  plot: string,
  options?: {
    title?: boolean
    fixtures?: string
    atmosphere?: string
    subject?: string
    camera?: string
    texture?: string
    styleSpec?: string
  },
): string {
  const scenePart = sanitizeSceneImagePrompt(scene)
  const atmospherePart = formatNarrationPlotForPrompt(options?.atmosphere || '')
  const fixturesPart = formatNarrationPlotForPrompt(options?.fixtures || '')
  const plotPart = formatNarrationPlotForPrompt(plot)
  let body = ''

  if (options?.title) {
    body = [
      scenePart && ensureNarrationBracket('片头背景场景', scenePart),
      plotPart && ensureNarrationBracket('主题氛围', plotPart),
    ].filter(Boolean).join('，')
  } else {
    const subjectText = formatNarrationPlotForPrompt(
      options?.subject || inferMinimalSubjectFromPlot(plotPart),
    )
    const eraSceneText = [scenePart, fixturesPart].filter(Boolean).join('，')
    body = [
      subjectText && ensureNarrationBracket('画面主体', subjectText),
      eraSceneText && ensureNarrationBracket('年代场景', eraSceneText),
      plotPart && ensureNarrationBracket('核心细节动作', plotPart),
      atmospherePart && ensureNarrationBracket('光影色调', atmospherePart),
      ensureNarrationBracket('镜头视角', options?.camera || NARRATION_DEFAULT_CAMERA_PROMPT),
      ensureNarrationBracket('质感要求', options?.texture || NARRATION_MINIMAL_TEXTURE_PROMPT),
    ].filter(Boolean).join('，')
  }

  if (!body) return ''

  return tidyAppearancePunctuation([
    formatNarrationStyleSpecBracket(options?.styleSpec),
    body,
    NARRATION_UNIVERSAL_SCENE_SUFFIX,
  ].join('，'))
}

/** 解说视频场景配图：按通用模板组装完整中文 prompt */
export function buildNarrationSceneImagePromptContent(scenePlot: string): string {
  return buildNarrationSceneImagePromptFromSentences(scenePlot)
}

/** 解说视频片头配图 */
export function buildNarrationTitleImagePromptContent(
  hook: string,
  ctx?: TitleVisualContext,
): string {
  const hookTrimmed = String(hook || '').trim()
  const hasFullContext = !!(ctx?.bodySentences?.length || ctx?.titleFull)
  if (hasFullContext) {
    const brief = buildTitleVisualBrief({
      titleFull: ctx?.titleFull,
      titleHook: hookTrimmed || ctx?.titleHook,
      bodySentences: ctx?.bodySentences,
    })
    if (brief.scene || brief.atmosphere) {
      return assembleNarrationUniversalScenePrompt(brief.scene, brief.atmosphere, { title: true })
    }
  }
  const theme = sanitizeSceneImagePrompt(hookTrimmed)
  if (!theme) return ''
  const scenePart = normalizeBracketContent(extractScenePartsFromNarrationText(theme).join('，')) || theme
  const atmosphere = inferTitleAtmosphere(theme)
  return assembleNarrationUniversalScenePrompt(scenePart, atmosphere, { title: true })
}

/** 解说视频两宫格配图（仍算一张图） */
export function buildNarrationDiptychImagePromptContent(
  leftPlot: string,
  rightPlot: string,
  options?: NarrationScenePromptOptions,
): string {
  const priorLines = resolvePriorNarrationLines(options)
  const left = applyNarrationPlotContinuity(formatNarrationPlotForPrompt(leftPlot), {
    priorLines,
    currentLines: [leftPlot],
  })
  const right = applyNarrationPlotContinuity(formatNarrationPlotForPrompt(rightPlot), {
    priorLines,
    currentLines: [rightPlot],
  })
  if (!left && !right) return ''
  const body = [
    '单张横向两宫格',
    left ? ensureNarrationBracket('左格', left) : '',
    right ? ensureNarrationBracket('右格', right) : '',
  ].filter(Boolean).join('，')
  return tidyAppearancePunctuation([
    formatNarrationStyleSpecBracket(),
    body,
    NARRATION_UNIVERSAL_SCENE_SUFFIX,
  ].join('，'))
}

const APPEARANCE_STYLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b1980s side-part (hairstyle|haircut|hair)\b/gi, 'side-part $1'],
  [/\b1980s-era\b/gi, ''],
  [/\b1980s?\s+fashionable\b/gi, ''],
  [/\b1980s?\s+(wavy|curly)\b/gi, 'wavy'],
  [/\bstylish\s+80s\s+dress\b/gi, 'stylish dress'],
  [/\b80s?\s+dress\b/gi, 'dress'],
  [/\bred\s+wedding\s+dress\b/gi, 'red dress'],
  [/\bwedding\s+dress\b/gi, 'dress'],
  [/\bevening\s+gown\b/gi, 'dress'],
  [/\bred\s+roses?\b/gi, ''],
  [/\bholding\s+roses?\b/gi, ''],
  [/\b1990s?\s+business\b/gi, 'business'],
  [/\b19\d0s?\s+(business|fashionable|fashion|style|look|aesthetic)\b/gi, ''],
  [/\b19\d0s?\b/gi, ''],
  [/\b80s\b/gi, ''],
  [/\b90s\b/gi, ''],
  [/\b80年代\b/g, ''],
  [/\b90年代\b/g, ''],
  [/\b1980s?\s*retro\s+hairstyle\b/gi, 'side-part hairstyle'],
  [/\b19\d0s?\s*retro\s+/gi, ''],
  [/\b80s?\s*retro\s+/gi, ''],
  [/\b90s?\s*retro\s+/gi, ''],
  [/\bretro\s+hairstyle\b/gi, 'side-part hairstyle'],
  [/\bretro\s+look\b/gi, ''],
  [/\bretro\s+style\b/gi, ''],
  [/\bvintage\s+bicycle\b/gi, 'bicycle'],
  [/\bvintage\s+/gi, ''],
  [/\bretro\b/gi, ''],
  [/\bvintage\b/gi, ''],
  [/webtoon画风/gi, ''],
  [/时代弄潮儿/gi, ''],
  [/走在时代前沿/g, ''],
]

const CONFLICTING_STYLE_PATTERNS = [
  /comic画风/gi,
  /漫画风/gi,
  /写实风(格)?/gi,
  /写实画风/gi,
  /photorealistic/gi,
  /cross[- ]?hatch/gi,
  /watercolor/gi,
  /油画/gi,
  /sketch/gi,
  /anime style/gi,
  /日系/gi,
  /retro\s*style/gi,
  /19\d0s?\s*retro/gi,
  /80s?\s*retro/gi,
  /pixel\s*art/gi,
  /8-?bit/gi,
  /16-?bit/gi,
  /dither(ing)?/gi,
  /vintage\s*(photo|filter|style|aesthetic|look)/gi,
  /film\s*grain/gi,
  /game\s*sprite/gi,
  /复古风(格)?/gi,
  /像素风/gi,
  /怀旧风(格)?/gi,
  /webtoon/gi,
  /semi-?chibi/gi,
  /Q版/gi,
  /条漫/gi,
  /romantic\s+poster/gi,
  /concept\s+art\s+poster/gi,
  /movie\s+poster/gi,
  /digital\s+painting\s+portrait/gi,
]

function tidyAppearancePunctuation(text: string): string {
  return text
    .split('\n')
    .map(line => line
      .replace(/[^\S\n]{2,}/g, ' ')
      .replace(/[，,、]{2,}/g, '，')
      .replace(/[。！？；]+/g, '，')
      .replace(/[，,、]\s*[。！？；]+/g, '，')
      .replace(/[。！？；]+\s*[，,、]+/g, '，')
      .replace(/^[,，;；、。\s]+|[,，;；、。\s]+$/g, '')
      .replace(/\(\s*\)/g, '')
      .trim(),
    )
    .filter(Boolean)
    .join('\n')
    .trim()
}

/** 清洗角色外貌描述：去掉会污染生图画风的词，保留服装/发型/道具等人物特征 */
export function sanitizeCharacterAppearance(appearance?: string | null): string {
  let text = String(appearance || '').trim()
  if (!text) return ''
  for (const [pattern, replacement] of APPEARANCE_STYLE_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  text = text.replace(/\b(19\d0s?|80s?|90s?)\s*retro\b/gi, '$1-era')
  for (const pattern of CONFLICTING_STYLE_PATTERNS) {
    text = text.replace(pattern, ' ')
  }
  return tidyAppearancePunctuation(text)
}

/** @deprecated alias */
export function sanitizeAppearanceForPortrait(appearance?: string | null): string {
  return sanitizeCharacterAppearance(appearance)
}

/** 非素体定妆：剥离素体小人画风残留，避免动漫/条漫定妆被旧外貌描述污染 */
export function stripMinimalAppearanceForPortrait(appearance?: string | null): string {
  let text = stripBodyMeasureSpecsFromAppearance(appearance)
  if (!text) return ''
  if (!/素体|圆点眼|三头身|简笔轮廓|正常卡通脸/.test(text)) return text
  text = text
    .replace(/白色素体小人主人公|白色素体小人|几位白色素体小人配角|几位白色素体小人|白色圆头素体小人|黑色素体小人/g, ' ')
    .replace(/正常卡通脸[^，,；;]*/g, ' ')
    .replace(/两个小圆点眼[^，,；;]*/g, ' ')
    .replace(/简笔轮廓/g, ' ')
    .replace(/[，,；;]{2,}/g, '，')
  return tidyAppearancePunctuation(text)
}

const SCENE_PROMPT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/黑色素体小人/g, '白色素体小人主人公'],
  [/黑色黑色素体小人/g, '白色素体小人主人公'],
  [/\b1980s?\s*retro\b/gi, ''],
  [/\b80s?\s*retro\b/gi, ''],
  [/\b90s?\s*retro\b/gi, ''],
  [/\b1980s-era\b/gi, ''],
  [/\b1990s-era\b/gi, ''],
  [/\b19\d0s?-era\b/gi, ''],
  [/\b19\d0s?\b/gi, ''],
  [/\b80s?\b/gi, ''],
  [/\b90s?\b/gi, ''],
  [/\b80年代\b/g, ''],
  [/\b90年代\b/g, ''],
  [/\b\d{2,4}年代\b/g, ''],
  [/\bera-appropriate\b/gi, ''],
  [/\bconcrete era\b/gi, ''],
  [/\bretro\s+(street|market|background|filter|style|look|aesthetic)\b/gi, '$1'],
  [/\bwarm\s+nostalgic\s+lighting\b/gi, 'warm natural lighting'],
  [/\bnostalg(?:ic|ia)\b/gi, ''],
  [/\bchanging\s+times\b/gi, ''],
  [/\bsense\s+of\s+nostalgia\b/gi, ''],
  [/\bethereal\b/gi, ''],
  [/\bdreamlike\b/gi, ''],
  [/\bromantic\b/gi, ''],
  [/\bclock\s*faces?\b/gi, ''],
  [/\bfloating\s+clocks?\b/gi, ''],
  [/\bwhite\s+roses?\b/gi, ''],
  [/\bshattered\s+glass\b/gi, ''],
  [/\bfloating\s+debris\b/gi, ''],
  [/\bcouple\s+silhouette\b/gi, ''],
  [/\bwallpaper\s+aesthetic\b/gi, ''],
  [/\bfilm\s+grain\b/gi, ''],
  [/\bvintage\s+photo\s+filter\b/gi, ''],
  [/\d{2,4}\s*年(?:的)?(?:春|夏|秋|冬)?天?/g, ''],
  [/批了一车[^，,；;]*/g, '批了一车货物'],
  [/时髦的[^，,；;]*/g, ''],
  [/满载[^，,；;]*/g, ''],
  [/戴[，,、\s]*(?=推|站|坐|走|$)/g, ''],
  [/脸上有[，,、\s]*/g, ''],
  [/二八杠自行车/g, '二八杠自行车轮廓'],
  [/自行车靠在[^，,；;]*/g, '自行车靠在一旁'],
  [/推着[^，,；;]{0,12}自行车/g, '推着二八杠自行车轮廓'],
  [/推着手推车/g, '推着手推车'],
  [/，停靠一旁/g, ''],
  [/\d{2,4}年代|八十年代|九十年代/g, ''],
  [/2000年代|二十世纪/g, ''],
  [/男性角色|女性角色|年轻顾客|老年男性|老年女性|顾客|店员/g, NARRATION_CROWD_BODY],
  [/斩首|砍头|杀头|铡刀|处决|人头落地|断头/g, ''],
  [/尸体|尸首|遗体|死尸|尸身|惨死|横尸/g, ''],
  [/验尸|解剖/g, ''],
  [/血迹|血腥|鲜血|流血|血泊|血肉模糊|溅血|血染/g, ''],
  [/杀戮|凶杀|虐杀|屠杀|捅死|刺死|砍死|勒死|枪毙|绞刑/g, ''],
  [/残肢|断肢|断手|断腿|开膛/g, ''],
  [/上吊|吊死/g, ''],
  [/decapitation|beheading|execution|gore|bloody|blood\s*splatter|corpse|dead\s*body|mutilat/gi, ''],
  [/古代刑场/g, '古代公堂门外候审区'],
  [/刑场/g, '公堂门外'],
  [/刽子手/g, '衙役'],
  [/高举大刀/g, '站立押送'],
  [/大刀/g, '木棍'],
  [/刀已架在脖颈[^，。】]*/g, '双手被衙役反绑候审'],
  [/刀刃|挥刀|砍向|持刀刺|刺向/g, ''],
  [/刺入[^，。【]{0,16}身体/g, '围在身旁'],
  [/扎进[^，。【]{0,12}脚心/g, '踩在地面'],
  [/地面有干涸/g, '地面平整青石'],
  [/地面有，/g, '地面平整，'],
  [/地面斑斑/g, '地面平整'],
  [/黑红色?血滴|血滴|流血[^，。】]*/g, ''],
  [/地面有黑红血滴/g, '地面土路'],
  [/沾有红色的/g, '散落的'],
  [/持剑横于颈前/g, '手持竹简低头站立'],
  [/一条红线表示[，,]?/g, ''],
  [/身体后仰倒地/g, '跪坐于地'],
  [/仰面躺在地上，一动不动/g, '端坐木凳上候审'],
  [/躺在地上[^，。】]*/g, '跪坐于地'],
  [/倒地的白色素体小人牢狱候审/g, '站立的白色素体小人衙役'],
  [/倒地的[^，。【]{0,12}素体小人/g, '跪坐的素体小人'],
  [/竹刀刺入[^，。】]*/g, '竹简散落身旁'],
  [/几把竹刀[^，。】]*/g, '几卷散落的竹简'],
  [/冲前伸手，似欲阻止不及/g, '伸手招呼'],
  [/古代战场布景/g, '古代衙门外景布景'],
  [/散落道具盾牌与长矛/g, '散落道具木箱与旗帜'],
  [/竹刀/g, '竹简'],
  [/持剑[^，。】]*/g, '手持竹简'],
  [/后仰倒地/g, '跪坐于地'],
  [/红线表示[，,]?/g, ''],
  [/宫女持刀[^，。】]*/g, '宫女手持竹简'],
  [/木桩刑架/g, '木栏围栏'],
  [/人头攒动/g, '人声喧闹'],
  [/打在主人公脸上和脖子上/g, '打在主人公脸上和肩背上'],
  [/竹简已刺入躯体/g, '竹简散落在身旁'],
  [/聚焦刺入的竹简/g, '聚焦散落的竹简'],
  [/刺入/g, '贴近'],
  [/暗红血色|血色/g, '暗沉天色'],
  [/颈旁/g, '身旁'],
  [/刀仍架在[^，。】]*/g, '双手仍被绑绳'],
  [/刀已架在[^，。】]*/g, '双手被衙役反绑候审'],
  [/刑具/g, '绳索'],
  [/肃杀/g, '沉静'],
  [/旁边有[^，。】]*候审/g, '旁边有站立的白色素体小人衙役'],
  [/倒地[^，。】]*候审/g, '跪地候审'],
  [/躺[^，。】]{0,12}地上/g, '跪坐于地'],
  [/一动不动/g, '端坐'],
  [/高举[^，。】]{0,8}(?:大刀|木棍)/g, '站立押送'],
  [/押解待审台/g, '公堂门外石台'],
  [/地面有[，,]\s*/g, '地面平整，'],
]

/** 暴力词替换后残留的半暴力语义（须整段重写，不能只删词） */
export const VIOLENCE_RESIDUE_DETECT_RE =
  /倒地[^，】]{0,24}候审|候审[^，】]{0,24}倒地|旁边有倒|仰面躺|躺[^，】]{0,12}地上|一动不动|地面有[，,]|地面有干涸|高举[^，】]{0,8}(?:刀|棍)|木桩刑架|绑[^，】]{0,8}刀|刀[^，】]{0,12}颈|颈[^，】]{0,8}刀|淋漓|残肢|血肉|尸|遗体|死尸|斩|砍头|人头落地|处决|刽子手|刑场|刑架|血迹|血腥|血色|血滴|血泊|斑斑|干涸|刺入|扎入|后仰倒地|持剑|竹刀|gore|bloody|corpse|decapitation|beheading|execution|mutilat/i

/** 检测配图 prompt 是否仍含暴力血腥元素 */
export const VIOLENCE_IMAGE_DETECT_RE =
  /斩首|砍头|杀头|铡刀|处决|人头(?!攒动)|人头落地|断头|尸体|尸首|遗体|死尸|尸身|惨死|横尸|验尸|解剖|血迹|血腥|鲜血|流血|血泊|血肉|溅血|血染|血滴|血色|杀戮|凶杀|虐杀|屠杀|残肢|断肢|开膛|上吊|吊死|枪毙|绞刑|刽子手|刑场|刑具|大刀|刀刃|挥刀|刺入|扎入|脖颈|颈上|颈前|颈旁|竹刀|持剑|后仰倒地|红线表示|一动不动|斑斑|干涸|gore|bloody|corpse|decapitation|beheading|execution|mutilat/i

function bracketNeedsViolenceRewrite(text: string): boolean {
  return VIOLENCE_IMAGE_DETECT_RE.test(text) || VIOLENCE_RESIDUE_DETECT_RE.test(text)
}

const VIOLENT_SUBJECT_FALLBACK = '青年期白色素体小人主人公与几位白色素体小人衙役'
const VIOLENT_ACTION_FALLBACK = '白色素体小人主人公在公堂或牢房内端坐候审，两侧几位白色素体小人衙役站立押解'

function rewriteViolentImagePromptBrackets(prompt: string): string {
  const bracketLabels = ['核心细节动作', '画面主体', '镜头视角', '年代场景', '光影色调']
  let text = prompt
  for (const label of bracketLabels) {
    text = text.replace(new RegExp(`【${label}[：:]([^】]*)】`, 'g'), (_, body) => {
      const b = String(body).trim()
      if (!bracketNeedsViolenceRewrite(b)) return `【${label}：${b}】`
      if (label === '年代场景') {
        let next = b.replace(/刑场|战场|刑架|血[^，】]*/g, '').replace(/[，,]{2,}/g, '，').trim()
        if (!next || bracketNeedsViolenceRewrite(next)) next = '古代公堂门外或牢房内景，木栏石墙'
        return `【${label}：${next}】`
      }
      if (label === '核心细节动作') return `【${label}：${VIOLENT_ACTION_FALLBACK}】`
      if (label === '画面主体') return `【${label}：${VIOLENT_SUBJECT_FALLBACK}】`
      if (label === '光影色调') {
        const next = b
          .replace(/暗红血色|血色|血腥|血染/g, '暗沉天色')
          .replace(/肃杀/g, '沉静')
          .replace(VIOLENCE_IMAGE_DETECT_RE, '')
          .replace(VIOLENCE_RESIDUE_DETECT_RE, '')
          .replace(/[，,]{2,}/g, '，')
          .trim()
        return `【${label}：${next || '阴天灰调，尘土微扬'}】`
      }
      const cleaned = b
        .replace(VIOLENCE_IMAGE_DETECT_RE, '')
        .replace(VIOLENCE_RESIDUE_DETECT_RE, '')
        .replace(/[，,]{2,}/g, '，')
        .trim()
      return `【${label}：${cleaned || '中景平视，叙事解说构图'}】`
    })
  }
  return text
}

/** 清洗配图 prompt 中的暴力血腥描写，改写为牢狱候审/押解待审等温和情节 */
export function sanitizeViolenceInImagePrompt(prompt?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''
  text = rewriteViolentImagePromptBrackets(text)
  if (bracketNeedsViolenceRewrite(text)) {
    text = rewriteViolentImagePromptBrackets(text)
  }
  return tidyAppearancePunctuation(text)
}

/** 清洗场景/片头配图 prompt：去掉会把模型带偏的复古/浪漫/抽象装饰词 */
export function sanitizeSceneImagePrompt(prompt?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''
  for (const [pattern, replacement] of SCENE_PROMPT_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  return sanitizeViolenceInImagePrompt(text)
}

/** 解说素体模式：按人生阶段给出仅动作/姿态的定妆提示（中文） */
export function buildMinimalPortraitPostureHint(variantLabel?: string | null): string {
  const face = NARRATION_PROTAGONIST_FACE
  const body = NARRATION_PROTAGONIST_BODY
  const label = String(variantLabel || '').trim()
  const stage = normalizeNarrationBodyStage(label)
  const spec = formatNarrationBodyStageSpec(stage)
  if (stage === '小孩') {
    return `${body}主人公，${face}，开心微笑，简化童装轮廓，${spec}，站立，简单活泼姿态`
  }
  if (stage === '少年') {
    return `${body}主人公，${face}，青涩微笑，简化校服或休闲装轮廓，${spec}，站立或行走，可背书包轮廓`
  }
  if (stage === '青年') {
    return `${body}主人公，${face}，自信微笑，简化年代服装轮廓，${spec}，站立或行走，可持简单道具轮廓`
  }
  if (stage === '中年') {
    return `${body}主人公，${face}，沉稳表情，简化中年便装轮廓，${spec}，坐或站放松姿态，可手持茶杯轮廓`
  }
  if (stage === '老年') {
    return `${body}主人公，${face}，慈祥微笑，简化老年便装轮廓，${spec}，坐于凳上，可手持圆扇轮廓`
  }
  return `${body}主人公，${face}，中性表情，简化服装轮廓，${spec}，中性站立姿态`
}

function extractBodyWeightAppearanceFragments(raw: string): string[] {
  const fragments: string[] = []
  const matches = raw.match(
    /(?:肥胖|偏胖|略胖|圆润|圆滚|超重|臃肿|肚腩|瘦削|苗条|腰腹[^，,；;]{0,12}|躯干[\d.]+\s*份\s*[×xX]\s*[\d.]+\s*份|1\.\d+\s*份宽)/g,
  )
  if (!matches) return fragments
  for (const match of matches) {
    const text = match.trim()
    if (text && !fragments.includes(text)) fragments.push(text)
  }
  return fragments.slice(0, 3)
}

function mergeBodyWeightIntoMinimalAppearance(
  hint: string,
  raw: string,
  variantLabel?: string | null,
): string {
  const tier = inferNarrationBodyWeightTierFromText(raw)
  const stage = normalizeNarrationBodyStage(variantLabel)
  const parts = extractBodyWeightAppearanceFragments(raw)
  if (tier !== 'standard') parts.push(formatNarrationBodyWeightSpec(stage, tier))
  if (!parts.length) return hint
  const merged = sanitizeCharacterAppearance(`${hint}，${parts.join('，')}`)
  return merged.slice(0, 180) || hint
}

function minimalAppearanceHasBodyWeightSpec(text: string): boolean {
  return /躯干[\d.]+\s*份\s*[×xX]\s*[\d.]+\s*份|（肥胖）|（偏胖）|（瘦削）|体型圆润|1\.\d+\s*份宽/.test(text)
}

/** 配图/定妆：素体模式强制使用白色素体阶段约束，保留旁白中的体型关键词 */
export function coerceMinimalCharacterAppearance(
  variantLabel?: string | null,
  appearance?: string | null,
): string {
  const hint = buildMinimalPortraitPostureHint(variantLabel)
  const raw = String(appearance || '').trim()
  if (!raw) return hint

  const hasBodyCue = NARRATION_BODY_WEIGHT_ANY_RE.test(raw)
  const tier = inferNarrationBodyWeightTierFromText(raw)

  if (/comic画风|English tags/i.test(raw)) {
    return hasBodyCue || tier !== 'standard'
      ? mergeBodyWeightIntoMinimalAppearance(hint, raw, variantLabel)
      : hint
  }
  if (/白色素体小人/.test(raw) && /正常卡通脸|眉眼|微笑|表情|腮红/.test(raw)) {
    const sanitized = sanitizeCharacterAppearance(raw).slice(0, 120) || hint
    if (!hasBodyCue && tier === 'standard') return sanitized
    if (minimalAppearanceHasBodyWeightSpec(sanitized)) return sanitized
    return mergeBodyWeightIntoMinimalAppearance(sanitized, raw, variantLabel)
  }
  if (hasBodyCue || tier !== 'standard') {
    return mergeBodyWeightIntoMinimalAppearance(hint, raw, variantLabel)
  }
  return hint
}

/** 解说素体定妆：按万能模板组装完整中文 prompt */
export function buildNarrationPortraitPromptContent(scene: string, plot: string): string {
  return assembleNarrationUniversalScenePrompt(scene, plot)
}

function extractPromptBracketParts(raw: string): {
  scene: string
  atmosphere: string
  fixtures: string
  plot: string
  subject: string
  camera: string
  texture: string
  styleSpec: string
  title: boolean
} {
  const text = String(raw || '').trim()
  const styleSpec = text.match(/【画风规格[：:]\s*([^】]+)】/)
  const titleScene = text.match(/【片头背景场景[：:]\s*([^】]+)】/)
  const titlePlot = text.match(/【主题氛围[：:]\s*([^】]+)】/)
  if (titleScene || titlePlot) {
    return {
      scene: titleScene?.[1]?.trim() || '',
      atmosphere: '',
      fixtures: '',
      plot: titlePlot?.[1]?.trim() || '',
      subject: '',
      camera: '',
      texture: '',
      styleSpec: styleSpec?.[1]?.trim() || '',
      title: true,
    }
  }
  const subject = text.match(/【画面主体[：:]\s*([^】]+)】/)
  const eraScene = text.match(/【年代场景[：:]\s*([^】]+)】/)
  const action = text.match(/【核心细节动作[：:]\s*([^】]+)】/)
  const lighting = text.match(/【光影色调[：:]\s*([^】]+)】/)
  const camera = text.match(/【镜头视角[：:]\s*([^】]+)】/)
  const texture = text.match(/【质感要求[：:]\s*([^】]+)】/)
  if (subject || eraScene || action || lighting || camera || texture || styleSpec) {
    return {
      scene: eraScene?.[1]?.trim() || '',
      atmosphere: lighting?.[1]?.trim() || '',
      fixtures: '',
      plot: action?.[1]?.trim() || '',
      subject: subject?.[1]?.trim() || '',
      camera: camera?.[1]?.trim() || '',
      texture: texture?.[1]?.trim() || '',
      styleSpec: styleSpec?.[1]?.trim() || '',
      title: false,
    }
  }
  const scene = text.match(/【场景[：:]\s*([^】]+)】/)
  const atmosphere = text.match(/【环境气氛[：:]\s*([^】]+)】/)
  const fixtures = text.match(/【陈设[：:]\s*([^】]+)】/)
  const plot = text.match(/【剧情[：:]\s*([^】]+)】/)
  if (scene || atmosphere || fixtures || plot) {
    return {
      scene: scene?.[1]?.trim() || '',
      atmosphere: atmosphere?.[1]?.trim() || '',
      fixtures: fixtures?.[1]?.trim() || '',
      plot: plot?.[1]?.trim() || '',
      subject: '',
      camera: '',
      texture: '',
      styleSpec: '',
      title: false,
    }
  }
  return {
    scene: '',
    atmosphere: '',
    fixtures: '',
    plot: '',
    subject: '',
    camera: '',
    texture: '',
    styleSpec: '',
    title: /片头/.test(text),
  }
}

export type FinalizeNarrationPromptOptions = {
  /** 配图段旁白句：仅在无 LLM/已存 prompt 时用于规则兜底推断【场景】【剧情】 */
  narrationLines?: string[]
  /** 本集全部旁白句，供全文连贯 */
  fullNarrationLines?: string[]
  /** 前文概要截止索引（不含当前配图段） */
  timelineUpToIndex?: number
  /** @deprecated 请用 fullNarrationLines */
  priorNarrationLines?: string[]
  titleHook?: string
  titleFull?: string | null
  /** 正文旁白句，供片头标题图综合全文 */
  titleBodySentences?: string[]
  /** 主人公定妆，用于规则兜底时对齐人生阶段与姿态 */
  protagonistHints?: NarrationProtagonistHint[]
  /** 动漫画风：全片锁定主人公自然语言体型 */
  lockedAnimeProtagonistBody?: string | null
}

/** 最终清洗配图 prompt：推断【场景】【剧情】并套素体万能模板 */
export function finalizeNarrationImagePrompt(
  prompt?: string | null,
  options?: FinalizeNarrationPromptOptions,
): string {
  const narrationLines = options?.narrationLines?.map(s => s.trim()).filter(Boolean)
  const raw = String(prompt || '').trim()
  if (shouldPreserveRawNarrationPrompt(raw)) return raw

  const isTitlePrompt = !!options?.titleHook
    || /片头|【片头背景场景|【主题氛围/.test(raw)

  if (narrationLines?.length && !raw) {
    if (isTitlePrompt) {
      const hook = options?.titleHook || narrationLines.join('')
      return buildNarrationTitleImagePromptContent(hook, {
        titleFull: options?.titleFull,
        titleHook: hook,
        bodySentences: options?.titleBodySentences,
      })
    }
    return buildNarrationSceneImagePromptFromSentences(narrationLines, {
      fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines,
      timelineUpToIndex: options?.timelineUpToIndex,
      protagonistHints: options?.protagonistHints,
    })
  }

  if (!raw) return ''

  if (isStoredNarrationImagePromptComplete(raw)) {
    return String(raw).trim()
  }

  if (/单张横向两宫格|【左格|左格：|【右格|右格：/.test(raw)) {
    const leftBracket = raw.match(/【左格[：:]\s*([^】]+)】/)
    const rightBracket = raw.match(/【右格[：:]\s*([^】]+)】/)
    if (leftBracket || rightBracket) {
      return buildNarrationDiptychImagePromptContent(
        leftBracket?.[1]?.trim() || '',
        rightBracket?.[1]?.trim() || '',
        { fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines },
      )
    }
    const core = extractNarrationPromptContentCore(raw)
    if (!core) return ''
    return buildNarrationDiptychImagePromptContent(
      core.match(/左格：([^，,]+)/)?.[1] || core,
      core.match(/右格：([^，,]+)/)?.[1] || '',
      { fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines },
    ) || assembleNarrationUniversalScenePrompt(`单张横向两宫格，${core}`, '')
  }

  const bracketParts = extractPromptBracketParts(raw)
  const core = bracketParts.scene || bracketParts.fixtures || bracketParts.plot || bracketParts.subject
    ? ''
    : extractNarrationPromptContentCore(raw)

  if (bracketParts.title || /片头/.test(raw)) {
    const split = bracketParts.scene || bracketParts.plot
      ? bracketParts
      : (() => {
        const { scene, plot } = splitNarrationSceneAndPlot(core.replace(/^片头背景(?:场景)?[：:]?\s*/, ''))
        return { scene: scene || core, plot, title: true as const }
      })()
    const enriched = enrichNarrationVisualParts(split.scene, split.plot, core)
    const scene = enriched.scene || sanitizeSceneImagePrompt(split.scene || core)
    const atmosphere = formatNarrationPlotForPrompt(split.plot) || inferTitleAtmosphere(scene)
    return assembleNarrationUniversalScenePrompt(scene, atmosphere, { title: true })
  }

  if (bracketParts.scene || bracketParts.fixtures || bracketParts.plot || bracketParts.subject) {
    const priorLines = resolvePriorNarrationLines({
      fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines,
      timelineUpToIndex: options?.timelineUpToIndex,
      priorNarrationLines: options?.priorNarrationLines,
    })
    const lines = narrationLines || []
    const narrationText = lines.join('')
    const sceneTags = detectNarrationSceneTags([...priorLines.slice(-4), narrationText].join(''))
    const sceneBase = sanitizeSceneImagePrompt(bracketParts.scene)
    let enrichedScene = enrichNarrationVisualParts(sceneBase, '', narrationText).scene || sceneBase
    if (lines.length) {
      const inferredParts = parseNarrationIntoScenePlot(lines, {
        fullNarrationLines: options?.fullNarrationLines ?? options?.priorNarrationLines,
        timelineUpToIndex: options?.timelineUpToIndex,
        priorNarrationLines: options?.priorNarrationLines,
        protagonistHints: options?.protagonistHints,
      })
      if (inferredParts.scene) {
        if (narrationSceneConflictsWithLabel(narrationText, enrichedScene)) {
          enrichedScene = inferredParts.scene
        } else if (!enrichedScene) {
          enrichedScene = inferredParts.scene
        }
      }
    }
    const props = lines.length
      ? collectRelevantContinuityProps(priorLines, lines, sceneTags, enrichedScene)
      : []
    const sanitizedPlot = sanitizeNarrationPlotForPrompt(bracketParts.plot, lines, {
      protagonistHints: options?.protagonistHints,
      scene: enrichedScene,
      priorLines,
    })
    const fixtures = sanitizeFixturesForParagraph(
      props,
      enrichedScene,
      sceneTags,
      sanitizedPlot,
      bracketParts.fixtures,
    )
    if (!enrichedScene) {
      enrichedScene = inferVisualSceneFromNarration(`${sanitizedPlot}${narrationText}`)
        || inferActiveSceneFromContext(narrationText, priorLines, sceneTags)
        || '日常街道简化背景'
    }
    return assembleNarrationUniversalScenePrompt(enrichedScene, sanitizedPlot, {
      fixtures,
      atmosphere: bracketParts.atmosphere
        || inferNarrationAtmosphereFromText(narrationText, enrichedScene),
      subject: bracketParts.subject,
      camera: bracketParts.camera,
      texture: bracketParts.texture,
    })
  }

  if (!core) return ''
  const { scene, plot } = splitNarrationSceneAndPlot(core)
  const enriched = enrichNarrationVisualParts(scene, plot, core)
  if (enriched.scene && enriched.plot) return assembleNarrationUniversalScenePrompt(enriched.scene, enriched.plot)
  if (enriched.plot) return assembleNarrationUniversalScenePrompt(enriched.scene, enriched.plot)
  return assembleNarrationUniversalScenePrompt(enriched.scene || core, enriched.plot)
}

/** LLM 配图 prompt 原样落库、原样生图，不做规则清洗或补全 */
export const NARRATION_USE_RAW_LLM_PROMPTS = true

/** 是否为七维（或两宫格七维；兼容旧六维无前缀 bracket）AI 配图 prompt */
export function isStoredNarrationImagePromptComplete(raw?: string | null): boolean {
  return hasNarrationSixDimStructure(String(raw || '').trim())
}

const NARRATION_WEAR_ON_PERSON_RE = /(?:身穿|身着|穿着|戴帽|穿鞋|穿[衣裙裤袜]|穿戴|戴着[^，,。；;】]{0,8}(?:帽|镜|眼镜|围巾))/
const NARRATION_SPECIFIC_YEAR_RE = /(?:^|[^\d])(?:19|20)\d{2}(?:年)?(?:[^\d]|$)/

function stripNarrationNegatedClauses(text: string): string {
  return text
    .replace(/禁止[^，,。；;】]*/g, ' ')
    .replace(/勿[^，,。；;】]*/g, ' ')
    .replace(/无写实[^，,。；;】]*/g, ' ')
}

function buildMinimalStyleForbiddenPattern(): RegExp {
  const terms = NARRATION_MINIMAL_STYLE_FORBIDDEN
    .replace(/^禁止/, '')
    .split(/[、,]/)
    .map(term => term.trim())
    .filter(Boolean)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(terms.join('|'), 'i')
}

let minimalStyleForbiddenPattern: RegExp | null = null

function getMinimalStyleForbiddenPattern(): RegExp {
  if (!minimalStyleForbiddenPattern) {
    minimalStyleForbiddenPattern = buildMinimalStyleForbiddenPattern()
  }
  return minimalStyleForbiddenPattern
}

/** 提取指定六维标签的正文（支持重复标签，如两宫格） */
export function extractNarrationPromptBracketContents(text: string, labels: string | string[]): string[] {
  const labelList = Array.isArray(labels) ? labels : [labels]
  const contents: string[] = []
  for (const label of labelList) {
    const re = new RegExp(`【${label}[：:]\\s*([^】]+)】`, 'g')
    for (const match of String(text || '').matchAll(re)) {
      if (match[1]) contents.push(match[1].trim())
    }
  }
  return contents
}

/** 是否具备万能模板要求的七维（或两宫格七维；兼容旧六维裸前缀）结构 */
export function hasNarrationSixDimStructure(text: string): boolean {
  const raw = String(text || '').trim()
  if (!raw) return false

  const hasSceneDims = (chunk: string) => NARRATION_SCENE_DIM_LABELS.every(
    label => new RegExp(`【${label}[：:]`).test(chunk),
  )
  const hasFullDims = (chunk: string) => NARRATION_SIX_DIM_LABELS.every(
    label => new RegExp(`【${label}[：:]`).test(chunk),
  )

  if (hasFullDims(raw)) return true
  if (hasSceneDims(raw)) return true
  if (/【左格】/.test(raw) && /【右格】/.test(raw)) {
    const [left = '', right = ''] = raw.split(/【右格】/)
    return (hasFullDims(left) || hasSceneDims(left)) && (hasFullDims(right) || hasSceneDims(right))
  }
  return false
}

export function hasNarrationWearOnPersonIssue(_text: string): boolean {
  return false
}

/** 偏离素体万能模板禁止画风词（来自 NARRATION_MINIMAL_STYLE_FORBIDDEN） */
export function hasNarrationForbiddenStyleIssue(text: string): boolean {
  return getMinimalStyleForbiddenPattern().test(stripNarrationNegatedClauses(text))
}

/** 年代场景含具体年份数字（违背 NARRATION_ERA_CLOTHING_LLM_RULE） */
export function hasNarrationSpecificYearIssue(text: string): boolean {
  const eraContents = extractNarrationPromptBracketContents(text, '年代场景')
  const scope = eraContents.length ? eraContents.join(' ') : text
  return NARRATION_SPECIFIC_YEAR_RE.test(scope)
}

/** 六维标签顺序是否与万能模板一致（含【画风规格】；旧库无画风规格时只校验场景六维） */
export function hasNarrationSixDimOrderIssue(text: string): boolean {
  const raw = String(text || '').trim()
  if (!raw) return false

  const labels = /【画风规格[：:]/.test(raw)
    ? [...NARRATION_SIX_DIM_LABELS]
    : [...NARRATION_SCENE_DIM_LABELS]

  const checkChunk = (chunk: string) => {
    let last = -1
    for (const label of labels) {
      const match = chunk.match(new RegExp(`【${label}[：:]`))
      if (!match || match.index == null) return false
      if (match.index < last) return true
      last = match.index
    }
    return false
  }

  if (/【左格】/.test(raw) && /【右格】/.test(raw)) {
    const rightIdx = raw.indexOf('【右格】')
    const leftChunk = raw.slice(0, rightIdx)
    const rightChunk = raw.slice(rightIdx)
    return checkChunk(leftChunk) || checkChunk(rightChunk)
  }
  return checkChunk(raw)
}

export function hasNarrationPartialCloseupIssue(text: string): boolean {
  const subject = extractNarrationPromptBracketContents(text, '画面主体')[0] ?? ''
  const action = extractNarrationPromptBracketContents(text, '核心细节动作')[0] ?? ''
  const lighting = extractNarrationPromptBracketContents(text, '光影色调')[0] ?? ''
  const camera = extractNarrationPromptBracketContents(text, '镜头视角')[0] ?? ''
  return isNarrationPartialCloseupConflict(subject, action, lighting, camera)
}

/** 【画面主体】出现多位主人公（不含【多主人公例外】） */
function isAllowedDualNarrativeProtagonistSubject(subject: string): boolean {
  if (/一位.+?主人公与一位.+?(?:配偶|父亲|母亲|儿子|女儿|丈夫|妻子|兄长|姐姐|弟弟|妹妹)主人公/.test(subject)) return true
  if (/两位(?:青年|中年|老年|小孩)?期?(?:白色素体小人)?主人公/.test(subject)) return true
  return false
}

export function hasNarrationMultipleProtagonistIssue(text: string): boolean {
  for (const subject of extractNarrationPromptBracketContents(text, '画面主体')) {
    if (isAllowedDualNarrativeProtagonistSubject(subject)) continue
    if (/(?:两|三|四|五|几|多|两位|三位|两个|三个).*(?:位|个).*主人公/.test(subject)) return true
    if ((subject.match(/主人公/g) || []).length >= 2) return true
    if (/(?:两位|三位|两个|三个)白色素体小人主人公/.test(subject)) return true
  }
  return false
}

/** 【质感要求】复述前缀画风（应使用 normalizeMinimalTextureBracket 短项） */
export function hasNarrationRedundantTextureIssue(text: string): boolean {
  for (const content of extractNarrationPromptBracketContents(text, '质感要求')) {
    if (/2D扁平(?:简笔画|插画)/.test(content) && /白色素体小人/.test(content)) return true
    if (content.length > 55 && /全片统一简笔素体比例/.test(content)) return true
  }
  return false
}

/** 画风规格是否与万能模板一致（【画风规格】维或旧裸前缀） */
export function hasNarrationUniversalPrefixIssue(text: string): boolean {
  const styleSpecContents = extractNarrationPromptBracketContents(text, NARRATION_STYLE_SPEC_DIM_LABEL)
  if (styleSpecContents.length) {
    const spec = styleSpecContents[0]
    return !/16:9\s*横屏/.test(spec)
      || !/2D\s*扁平(?:简笔画|插画)/.test(spec)
      || !new RegExp(NARRATION_CROWD_BODY).test(spec)
  }

  const bodyStart = text.search(/【(?:画风规格|画面主体|年代场景|片头背景场景|左格)/)
  const prefix = bodyStart > 0 ? text.slice(0, bodyStart).replace(/[，,]+$/g, '') : ''
  if (!prefix) return !/【画风规格[：:]/.test(text)
  return !/16:9\s*横屏/.test(prefix)
    || !/2D\s*扁平(?:简笔画|插画)/.test(prefix)
    || !new RegExp(NARRATION_CROWD_BODY).test(prefix)
}

function sanitizeNarrationWearOnPersonText(body: string): string {
  return String(body || '').trim()
}

/** 按六维角色清洗单维正文（不针对具体物件名，只按维度职责） */
export function sanitizeNarrationSixDimBracket(label: string, body?: string | null): string {
  let text = String(body || '').trim()
  if (!text) return ''

  switch (label) {
    case NARRATION_STYLE_SPEC_DIM_LABEL:
      return tidyAppearancePunctuation(text)
    case '画面主体':
      text = sanitizeNarrationWearOnPersonText(text)
      text = normalizeMinimalCrowdInPlot(text)
      return tidyAppearancePunctuation(text)
    case '核心细节动作':
      text = sanitizeNarrationWearOnPersonText(text)
      text = sanitizeViolenceInImagePrompt(text)
      text = normalizeMinimalCrowdInPlot(text)
      return tidyAppearancePunctuation(text)
    case '年代场景':
      text = sanitizeViolenceInImagePrompt(text)
      text = text.replace(NARRATION_SPECIFIC_YEAR_RE, ' ')
      text = text.replace(/\b(?:vintage|retro)\b/gi, '')
      text = text.replace(/复古滤镜/g, '')
      return tidyAppearancePunctuation(text)
    case '光影色调':
      text = text.replace(/\bnostalg(?:ic|ia)\b/gi, '')
      text = text.replace(/\b(?:ethereal|dreamlike|romantic)\b/gi, '')
      return tidyAppearancePunctuation(text)
    case '镜头视角':
      return tidyAppearancePunctuation(text)
    case '质感要求':
      return normalizeMinimalTextureBracket(text)
    default:
      return tidyAppearancePunctuation(sanitizeViolenceInImagePrompt(text))
  }
}

/** 解析六维 bracket 为 assembleNarrationUniversalScenePrompt 所需字段 */
export function extractNarrationPromptBracketParts(raw: string) {
  return extractPromptBracketParts(raw)
}

/** 按万能模板解析 → 分维清洗 → 重新组装 */
export function normalizeMinimalPromptByTemplate(prompt?: string | null): string {
  let text = ensureNarrationStyleSpecDim(String(prompt || '').trim())
  if (!text) return ''

  if (/【左格】/.test(text) && /【右格】/.test(text)) {
    return applyMinimalNoClothingGuard(sanitizeViolenceInImagePrompt(text))
  }

  if (!hasNarrationSixDimStructure(text)) {
    return coerceMinimalLLMImagePromptLegacy(text)
  }

  const parts = extractPromptBracketParts(text)
  if (parts.title) {
    return assembleNarrationUniversalScenePrompt(
      sanitizeNarrationSixDimBracket('年代场景', parts.scene),
      sanitizeNarrationSixDimBracket('核心细节动作', parts.plot),
      { title: true, styleSpec: parts.styleSpec },
    )
  }

  const styleSpec = sanitizeNarrationSixDimBracket(NARRATION_STYLE_SPEC_DIM_LABEL, parts.styleSpec || NARRATION_UNIVERSAL_STYLE_SPEC_BODY)
  let subject = sanitizeNarrationSixDimBracket('画面主体', parts.subject)
  const scene = sanitizeNarrationSixDimBracket('年代场景', parts.scene)
  const plot = sanitizeNarrationSixDimBracket('核心细节动作', parts.plot)
  let atmosphere = sanitizeNarrationSixDimBracket('光影色调', parts.atmosphere)
  let camera = sanitizeNarrationSixDimBracket('镜头视角', parts.camera) || NARRATION_DEFAULT_CAMERA_PROMPT
  const texture = sanitizeNarrationSixDimBracket('质感要求', parts.texture)

  const partialFixed = applyNarrationPartialCloseupFixes({
    subject,
    action: plot,
    lighting: atmosphere,
    camera,
  })
  subject = partialFixed.subject
  atmosphere = partialFixed.lighting
  camera = partialFixed.camera
  const plotFixed = partialFixed.action

  return assembleNarrationUniversalScenePrompt(scene, plotFixed, {
    styleSpec,
    subject,
    atmosphere,
    camera,
    texture,
  })
}

/** 纯 AI 模式下是否应原样保留 prompt（不做规则改写或角色补全） */
export function shouldPreserveRawNarrationPrompt(raw?: string | null): boolean {
  return NARRATION_USE_RAW_LLM_PROMPTS && !!String(raw || '').trim()
}

/** 将 LLM/旧库中的动漫配图 prompt 对齐七维模板 */
export function coerceAnimeLLMImagePrompt(
  prompt?: string | null,
  style?: string | null,
  options?: { lockedProtagonistBody?: string | null },
): string {
  let text = ensureNarrationStyleSpecDim(String(prompt || '').trim(), style)
  if (!text) return ''
  text = text.replace(/【([^：:【]+)[：:]([^】]*)】/g, (_, label, body) => {
    const trimmedLabel = String(label).trim()
    if (trimmedLabel === '质感要求') {
      const normalized = normalizeAnimeTextureBracket(String(body).trim())
      return `【${trimmedLabel}：${normalized}】`
    }
    return `【${trimmedLabel}：${normalizeBracketContent(String(body).trim())}】`
  })
  if (!/【画风规格[：:]/.test(text) && /【(?:画面主体|年代场景)/.test(text)) {
    text = `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，${text}`
  }
  text = normalizeAnimeProtagonistBodyInPrompt(text, options?.lockedProtagonistBody)
  return applyMinimalNoClothingGuard(text)
}

/** 将【质感要求】规范为动漫短补充项 */
export function normalizeAnimeTextureBracket(body?: string | null): string {
  const trimmed = String(body || '').replace(/[，,]+$/g, '').trim()
  if (!trimmed) return NARRATION_ANIME_TEXTURE_LLM_HINT
  const isLongBlob =
    trimmed.length > 55
    || /现代高质量\s*2D\s*动漫/.test(trimmed)
    || /赛璐璐平涂结合柔和渐变/.test(trimmed)
  if (isLongBlob) return NARRATION_ANIME_TEXTURE_LLM_HINT
  const hasEssentials = /无文字/.test(trimmed) && (/线稿|赛璐璐|渐变/.test(trimmed))
  if (trimmed.length <= 48 && hasEssentials) return trimmed
  return NARRATION_ANIME_TEXTURE_LLM_HINT
}

/** 配图 prompt 统一出口：七维结构化画风强制模板约束 */
export function resolveNarrationImagePrompt(
  prompt?: string | null,
  style?: string | null,
  _options?: FinalizeNarrationPromptOptions,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return ''
  if (isNarrationMinimalStyle(style)) return coerceMinimalLLMImagePrompt(raw)
  if (usesNarrationNaturalBodyLock(style)) {
    return coerceAnimeLLMImagePrompt(raw, style)
  }
  return raw
}

/** 将【质感要求】规范为短补充项，去掉与前缀重复的长段 */
export function normalizeMinimalTextureBracket(body?: string | null): string {
  const trimmed = String(body || '').replace(/[，,]+$/g, '').trim()
  if (!trimmed) return NARRATION_MINIMAL_TEXTURE_LLM_HINT

  const isLongBlob =
    trimmed.length > 55
    || /全片统一简笔素体比例/.test(trimmed)
    || /2D扁平(?:简笔画|插画)，.*?白色素体小人/.test(trimmed)
    || trimmed.includes(NARRATION_MINIMAL_NO_CLOTHING_RULE)
    || trimmed === NARRATION_MINIMAL_TEXTURE_PROMPT

  if (isLongBlob) return NARRATION_MINIMAL_TEXTURE_LLM_HINT

  const hasEssentials = /无文字/.test(trimmed) && (/平涂|简笔/.test(trimmed) || /禁止写实/.test(trimmed))
  if (trimmed.length <= 48 && hasEssentials) {
    return trimmed
  }

  return NARRATION_MINIMAL_TEXTURE_LLM_HINT
}

/** 配图 prompt 保留服装描述，仅做基础清洗 */
export function applyMinimalNoClothingGuard(prompt?: string | null): string {
  return tidyAppearancePunctuation(sanitizeSceneImagePrompt(String(prompt || '').trim()))
}

/** 非六维旧格式的兜底清洗（逐步废弃） */
function coerceMinimalLLMImagePromptLegacy(prompt?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''

  const alreadyCoerced = /白色素体小人/.test(text)
    && !/黑色素体|白色圆头素体小人|黑色黑色素体|白色白色素体/.test(text)

  if (!alreadyCoerced) {
    text = text
      .replace(/黑色素体小人/g, `${NARRATION_CROWD_BODY}主人公`)
      .replace(/黑色白色素体小人主人公/g, `${NARRATION_CROWD_BODY}主人公`)
      .replace(/白色白色素体小人主人公/g, NARRATION_CROWD_BODY)
      .replace(/几位白色白色素体小人主人公+/g, `几位${NARRATION_CROWD_BODY}`)
      .replace(/白色黑色素体小人/g, NARRATION_CROWD_BODY)
      .replace(/黑色黑色素体小人/g, `${NARRATION_CROWD_BODY}主人公`)

    const bracketStart = text.search(/【(?:画风规格|画面主体|年代场景|片头|左格|主题氛围)/)
    if (bracketStart > 0) {
      const legacyPrefix = text.slice(0, bracketStart).replace(/[，,]+$/g, '').trim()
      text = `${formatNarrationStyleSpecBracket(/16:9\s*横屏/.test(legacyPrefix) ? legacyPrefix : undefined)}，${text.slice(bracketStart)}`
    } else if (/^16:9\s*横屏/.test(text)) {
      const sceneSplit = text.match(/总高约三个头高[，,]\s*/)
      if (sceneSplit?.index != null) {
        const bodyStart = sceneSplit.index + sceneSplit[0].length
        text = `${formatNarrationStyleSpecBracket()}，${text.slice(bodyStart)}`
      }
    }

    text = text.replace(/【([^：:【]+)[：:]([^】]*)】/g, (_, label, body) => {
      const trimmedLabel = String(label).trim()
      const next = normalizeMinimalCrowdInPlot(String(body).trim())
      return `【${trimmedLabel}：${next}】`
    })

    if (!/【/.test(text)) {
      text = text
        .replace(/白色圆头素体小人/g, NARRATION_PROTAGONIST_BODY)
        .replace(/两个白色小圆点眼睛/g, NARRATION_PROTAGONIST_FACE)
        .replace(/两个黑色小圆点眼睛/g, NARRATION_CROWD_FACE)
        .replace(/两个小黑点眼睛/g, NARRATION_PROTAGONIST_FACE)
      text = normalizeMinimalCrowdInPlot(text)
    }

    text = text
      .replace(/极简叙事动画风格/g, '极简简笔叙事风格')
      .replace(/画中所有人物均为同款素体造型与统一身形[，,]?/g, '')
      .replace(/全片统一素体尺寸，圆头直径约占全身高度三分之一[^，【]*总高约三个头高[，,]?/g, '')
      .replace(/2D\s*扁平化卡通/g, '2D扁平简笔画')
  }

  text = text.replace(
    /【质感要求[：:]([^】]*)】/g,
    (_, body) => `【质感要求：${normalizeMinimalTextureBracket(body)}】`,
  )

  return applyMinimalNoClothingGuard(ensureNarrationStyleSpecDim(text))
}

/** 将 LLM/旧库中的素体配图 prompt 对齐万能模板（前缀 + 六维 + 后缀） */
export function coerceMinimalLLMImagePrompt(prompt?: string | null): string {
  return normalizeMinimalPromptByTemplate(prompt)
}

/** LLM 返回的配图 prompt：七维结构化画风强制模板约束，其余原样 */
export function resolveLLMImagePrompt(
  prompt?: string | null,
  style?: string | null,
  _options?: FinalizeNarrationPromptOptions,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return ''
  if (isNarrationMinimalStyle(style)) return coerceMinimalLLMImagePrompt(raw)
  if (usesNarrationNaturalBodyLock(style)) {
    return coerceAnimeLLMImagePrompt(raw, style)
  }
  return raw
}
