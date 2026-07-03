/** 解说动漫 / 漫画解说 / 简体素人共用：16:9 三视图定妆参考 */

export const THREE_VIEW_PORTRAIT_SIZE = '1920x1080'

export const THREE_VIEW_PORTRAIT_SCENE_CN =
  '纯白色背景，动漫三视图定妆参考图（正面/侧面/背面同一角色同屏），清晰展示脸型五官与发型，无环境无场景元素'

/** 简体素人 · 三视图场景维 */
export const THREE_VIEW_PORTRAIT_SCENE_MINIMAL_CN =
  '纯白色背景，素体小人三视图定妆参考图（正面/侧面/背面同一角色同屏），清晰展示正常卡通脸与体型比例，无环境无场景元素'

/** 三视图定妆：双手自然下垂，禁止手持道具（道具在分镜配图文案中写） */
export const THREE_VIEW_EMPTY_HANDS_CN =
  '三视图全身标准站立，双手自然垂于身侧，不拿任何道具或物品'

export const THREE_VIEW_EMPTY_HANDS_EN =
  'neutral standing pose, arms at sides, empty hands, NO handheld objects, NO props in hands'

/** 解说 · 动漫风格默认剧情维 */
export const THREE_VIEW_PORTRAIT_PLOT_ANIME_CN =
  '英俊帅气动漫脸型，五官立体清晰，正常头身比，清晰线稿赛璐璐平涂，三视图全身站姿，服装与标志配饰（非手持物）各角度可见，双手自然垂于身侧不拿道具'

/** 漫画解说默认剧情维 */
export const THREE_VIEW_PORTRAIT_PLOT_MOTION_COMIC_CN =
  '英俊帅气动漫脸型，五官立体清晰，正常头身比，粗线平涂，三视图全身站姿，服装与标志配饰（非手持物）各角度可见，双手自然垂于身侧不拿道具'

/** 简体素人默认剧情维 */
export const THREE_VIEW_PORTRAIT_PLOT_MINIMAL_CN =
  '白色素体小人，正常卡通脸圆眼带高光，三视图全身站姿，简化年代服装简笔轮廓，各角度可见体型比例，双手自然垂于身侧不拿道具'

export const THREE_VIEW_PORTRAIT_FRAMING =
  '16:9 widescreen character turnaround design sheet, three views front side back of same character on pure white background, full body neutral standing pose, arms at sides empty hands, clear detailed handsome attractive anime face, sharp facial features well-defined eyes nose jawline, outfit and non-handheld accessories visible in all views, production character reference layout, NOT single view only, NOT close-up headshot only, NOT gray background, NOT scenic background, NOT holding objects'

export const THREE_VIEW_PORTRAIT_FRAMING_MINIMAL =
  '16:9 widescreen stick figure character turnaround design sheet, three views front side back on pure white background, white stick figure with normal cartoon face round eyes with highlights, simplified clothing outline visible in all views, arms at sides empty hands, clear body proportion reference in all angles, NOT single view only, NOT gray background, NOT detailed anime face, NOT realistic portrait, NOT holding objects'

/** 三视图定妆 plot：去掉手持/道具描述，并补全双手自然下垂 */
export function sanitizePortraitPlotForThreeView(text: string): string {
  let s = String(text || '').trim()
  if (!s) return THREE_VIEW_EMPTY_HANDS_CN
  s = s
    .replace(/[，,；;]?[^，,；;]*(?:手持|握着|拿着|可持|可手|持简单道具|持[\u4e00-\u9fff]{0,8}轮廓|背书包|茶杯|圆扇|槟榔|道具轮廓)[^，,；;]*/g, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^[，,]+|[，,]+$/g, '')
    .trim()
  if (!/双手|垂于身侧|不拿/.test(s)) {
    s = s ? `${s}，${THREE_VIEW_EMPTY_HANDS_CN}` : THREE_VIEW_EMPTY_HANDS_CN
  }
  return s
}

/** 配图文案：characters 须对照定妆参考 */
export const NARRATION_PORTRAIT_REFERENCE_LLM_RULE =
  '【定妆对照·硬性】characters 含 portrait_label（如「男主·青年」）与 has_portrait；has_portrait=true 时【画面主体】须以「对照定妆「portrait_label」」开头，随后写与 appearance 一致的发型、服装#hex、体型阶段；禁止另发明与定妆矛盾的发色/服装主色；手持物、互动道具、槟榔/茶杯等只写在【核心细节动作】或【年代场景·陈设】，不在【画面主体】重复写手持'

export const THREE_VIEW_PORTRAIT_STYLE_GUARD_ANIME = [
  'CRITICAL ART STYLE: modern high-quality 2D anime illustration, thin clean line art, flat cel shading with soft gradients, normal body proportions, handsome attractive anime faces',
  'CRITICAL LAYOUT: three-view turnaround character design sheet front side back on pure white background, 16:9 widescreen, clear detailed face',
  'FORBIDDEN: pixel art, dithering, chibi, 3D render, single pose only, gray background, close-up portrait crop only, vertical poster, handheld objects, props in hands',
].join(', ')

export const THREE_VIEW_PORTRAIT_STYLE_GUARD_MOTION_COMIC = [
  'CRITICAL ART STYLE: modern Chinese webtoon comic, bold black outlines, flat cel-shaded colors, normal body proportions, handsome attractive anime faces',
  'CRITICAL LAYOUT: three-view turnaround character design sheet front side back on pure white background, 16:9 widescreen, clear detailed face',
  'FORBIDDEN: pixel art, dithering, chibi, 3D render, single pose only, gray background, close-up portrait crop only, vertical poster, handheld objects, props in hands',
].join(', ')

export const THREE_VIEW_PORTRAIT_STYLE_GUARD_MINIMAL = [
  'CRITICAL ART STYLE: minimal white stick figure protagonist, normal cartoon face with round eyes and highlights, black outline, flat colors',
  'CRITICAL LAYOUT: three-view turnaround stick figure design sheet front side back on pure white background, 16:9 widescreen, clear face and body proportion',
  'FORBIDDEN: pixel art, dithering, single pose only, gray background, detailed anime face, realistic portrait, 3D render',
].join(', ')

export function buildNarrationMinimalCharacterExtractSystem(options?: { weightArc?: { theme_labels: string[] } | null }): string {
  return [
    '你是影视解说项目的角色设定师（简体素人/素体小人画风）。须为「主人公」做 16:9 横屏三视图定妆参考图（纯白色背景、清晰展示正常卡通脸与体型比例），配角不需要单独定妆。',
    '规则：',
    '1) 只提取主人公（男主/女主/主角），不要提取配角（妻子、店员、朋友、提亲者等）',
    '2) 不要提取「旁白」「解说员」「作者」',
    '3) 输出字段：name、variant_label、role、appearance、personality',
    '4) role 只填固定身份「男主」或「女主」，禁止填职业/情节标签（个体户、万元户、服装店老板、流水线工人等；那些是文案剧情不是角色定位）',
    '5) variant_label 表示该条定妆的时期/形态：如 童年、少年、青年、中年、老年；若全篇只有一个时期则留空或填「常态」',
    '6) 同一主人公若文案出现明显不同人生阶段（回忆、多年后、少年与晚年等），必须拆成多条记录：name 相同，variant_label 不同，appearance 各自独立',
    '7) 第一人称「我」叙述时，name 用「男主」或「女主」，并按青年/中年/老年等阶段拆分 variant_label',
    '8) appearance：只写素体小人可见特征（正常卡通脸表情、简化服装#hex简笔轮廓、尺寸比例、三视图标准站立双手自然下垂）；禁止手持/道具/槟榔/茶杯（道具在分镜配图文案中写）；禁止画风/艺术风格/retro/vintage look/pixel/复古风/Q版/条漫；年代只体现在服装发型',
    options?.weightArc
      ? `8b) 剧本含${options.weightArc.theme_labels.join('/')}主题：appearance 须写体重档位与具象躯干宽高（如 obese 青年期躯干1.0份高×1.30份宽），禁止只写标准三头身`
      : '',
    '9) 示例 appearance：28岁男性，正常卡通脸疲惫表情，简化#2563eb蓝色工装简笔轮廓，青年期标准体型，三视图标准站立双手自然下垂',
    '10) 合并同一人物同一时期的称呼，不要重复',
    '只输出 JSON，不要解释。',
  ].filter(Boolean).join('\n')
}

export function buildNarrationMinimalCharacterAppearanceSystem(options?: {
  weightArc?: { theme_labels: string[] } | null
  scriptWeightTier?: string
}): string {
  return [
    '你是解说素体小人项目的角色动作标注助手。',
    '定妆输出用于 16:9 横屏三视图参考图（纯白色背景、正面/侧面/背面同屏），清晰展示正常卡通脸与体型比例。',
    '根据剧本情节，只输出该人生阶段的「白色素体小人 + 正常卡通脸表情 + 简化年代服装#hex简笔轮廓 + 尺寸比例 + 三视图标准站立双手自然下垂」，20-80 字中文；禁止手持道具（槟榔/茶杯/书包等留到分镜配图）。',
    '示例（青年）：白色素体小人，正常卡通脸疲惫表情，简化#2563eb蓝色工装简笔轮廓，青年期标准体型，三视图标准站立双手自然下垂',
    options?.weightArc
      ? `【体重弧线】剧本含${options.weightArc.theme_labels.join('/')}主题：须写体重档位与具象躯干宽高`
      : '',
    '禁止：厚涂写实真人面相、复杂印花、English tags、单视角描述',
    '只输出正文，不要标题、markdown、JSON。',
  ].filter(Boolean).join('\n')
}

export function buildNarrationAnimeCharacterAppearanceSystem(): string {
  return [
    '你是影视解说项目的角色定妆造型设计助手（动漫风格）。',
    '画风：现代高质量 2D 动漫，正常头身比，16:9 横屏三视图定妆（正面/侧面/背面、纯白色背景、清晰脸型、双手自然下垂不拿道具）；男性英俊帅气、女性清秀美丽，大而富有表现力的动漫眼睛带高光；禁止 Q 版、3D、真人写实；手持物/槟榔/道具留到分镜配图文案，定妆不写。',
    '须根据解说稿中该角色的出场情节、对白、行为推断外貌，与故事时代、题材一致。',
    '不写胖瘦体型词；禁止素体份数、三头身、圆头直径、standard torso 等计量词；禁止过程性描述（如牙齿由白变黑）。',
    '若提供了 variant_label，外貌须严格对应该阶段，不得写成其他年龄。',
    '中文为主，可夹 English tags；80-180 字；只描述人物本身，禁止画风/艺术风格词。',
    '输出格式：一段中文外貌 + 换行 + English tags: 英文逗号分隔（发型/服装/配饰），如 English tags: short black hair, blue factory uniform, betel nut',
    '只输出描述正文，不要标题、markdown、JSON。',
  ].join('\n')
}

export function buildNarrationAnimeCharacterExtractSystem(): string {
  return [
    '你是影视解说项目的角色设定师（动漫风格）。须为「主人公」做 16:9 横屏三视图定妆参考图（纯白色背景、清晰脸型、英俊帅气动漫五官），配角不需要单独定妆。',
    '规则：',
    '1) 只提取主人公（男主/女主/主角），不要提取配角',
    '2) 不要提取「旁白」「解说员」「作者」',
    '3) 输出字段：name、variant_label、role、appearance、personality',
    '4) role 只填「男主」或「女主」，禁止填职业/情节标签（个体户、万元户、老板、工人等）',
    '5) variant_label：人生阶段（童年/青年/老年等）；全篇单形态可留空或「常态」；多阶段须拆多条',
    '5) appearance：中英混合，只写人物本身（年龄、性别、发型、脸型五官、服装主色#hex、标志特征）；须写清动漫脸型（男：英俊帅气/棱角分明；女：清秀美丽/精致五官）；禁止胖瘦体型词与 standard torso 等英文计量',
    '6) 禁止画风词：retro style, chibi, 3D, 真人, 厚涂, Q版, pixel',
    '7) 示例 appearance：28岁男性，剑眉，黑色短发，穿#2563eb蓝色工厂工装，神情疲惫。\nEnglish tags: short black hair, blue factory uniform, tired eyes',
    '8) 合并同一人物同一时期称呼，不要重复',
    '只输出 JSON，不要解释。',
  ].join('\n')
}
