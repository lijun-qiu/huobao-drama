export type ArtStyleContext = 'scene' | 'diptych' | 'title' | 'portrait' | 'agent'

export const DEFAULT_ART_STYLE = 'short-drama'

/** 解说素体极简叙事画风（项目级视觉风格 value） */
export const NARRATION_MINIMAL_STYLE = 'narration-minimal'

/** 解说配图动漫风格（正常头身比 2D 动漫，七维结构与素体相同） */
export const NARRATION_ANIME_STYLE = 'narration-anime'

/** 漫画解说（条漫平涂 + 上下运镜） */
export const MOTION_COMIC_STYLE = 'motion-comic'

export const MOTION_COMIC_DEFAULT_STYLE = MOTION_COMIC_STYLE

/** 解说动漫 / 漫画解说共用：三视图定妆 */
export const THREE_VIEW_PORTRAIT_SCENE_CN =
  '纯白色背景，动漫三视图定妆参考图（正面/侧面/背面同一角色同屏），清晰展示脸型五官与发型，无环境无场景元素'

export const THREE_VIEW_PORTRAIT_PLOT_ANIME_CN =
  '英俊帅气动漫脸型，五官立体清晰，正常头身比，清晰线稿赛璐璐平涂，三视图全身站姿，服装与标志配饰在各角度均可见'

export const THREE_VIEW_PORTRAIT_PLOT_MINIMAL_CN =
  '白色素体小人，正常卡通脸圆眼带高光，三视图全身站姿，简化年代服装简笔轮廓，各角度可见体型比例与标志道具'

export const THREE_VIEW_PORTRAIT_SCENE_MINIMAL_CN =
  '纯白色背景，素体小人三视图定妆参考图（正面/侧面/背面同一角色同屏），清晰展示正常卡通脸与体型比例，无环境无场景元素'

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

/** 禁止偏离简笔素体的画风 */
export const NARRATION_MINIMAL_STYLE_FORBIDDEN =
  '禁止厚涂肌理、赛璐璐、日式精细动画脸、条漫、像素风、渐变阴影、3D渲染、真人照片质感'

/** 素体正常卡通脸表情：主人公大圆眼，群众小圆点眼 */
export const NARRATION_MINIMAL_EXPRESSION_LLM_RULE =
  '【面部表情】主人公及同框第二位主人公（配偶/父母/子女等）须写正常卡通脸表情（圆眼或弯眼带高光、眉毛嘴巴清晰、可有腮红）；路人/群众配角正面/侧面须写两个小圆点眼（小眼睛）与简笔表情；与 narration_lines 情绪一致；写入【画面主体】或【核心细节动作】'

/** 主人公与配角视觉区分（同白色素体，靠构图/服装/焦点区分） */
export const NARRATION_PROTAGONIST_DISTINCT_LLM_RULE =
  '【主人公鲜明】全画面仅 1 位主人公须是视觉焦点：写清「一位X期主人公位于画面中心或前景」，服装款式与主色须具体鲜明；配角写「几位配角在两侧/背景/后方」，低饱和简化便装，禁止与主人公服装主色相同'

/** 素体人物须穿与年代剧情一致的简化服装轮廓（简笔色块，非写实） */
export const NARRATION_MINIMAL_CLOTHING_LLM_RULE =
  '【服装】主人公须写具体鲜明的简化服装款式与主色；配角写笼统低饱和便装轮廓，与主人公形成对比；均须与年代、职业、场景匹配，禁止写实布料褶皱与复杂印花；服装写入【画面主体】'

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

/** 各阶段共用解剖基准（写入画风规格） */
export const NARRATION_BODY_ANATOMY_BASE =
  `${NARRATION_BODY_HEAD_DIAMETER_ANCHOR}，${NARRATION_BODY_LINE_WEIGHT_ANCHOR}，${NARRATION_BODY_MEASURE_UNIT}，${NARRATION_MINIMAL_LIMBS_SPEC}，全片共用同一计量标尺，禁止同画面随机放大缩小；同一配图段内主人公躯干宽高须一致，跨配图段可随剧情体现体重变化（如肥胖→减肥逆袭）`

/** 各人生阶段具象尺寸（1份=圆头直径=画面高12%） */
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

/** 解说素体通用尺寸（画风规格维：标尺 + 阶段表索引） */
export const NARRATION_MINIMAL_BODY_SIZE_SPEC =
  `${NARRATION_BODY_ANATOMY_BASE}；具体总高与胖瘦按【画面主体】人生阶段与体重档位（standard/chubby/obese/slim）执行对应规格（青年期三头身为基准）`

export const NARRATION_BODY_CONSISTENCY_CORE =
  `全片统一简笔素体比例，${NARRATION_MINIMAL_BODY_SIZE_SPEC}`

export const NARRATION_BODY_STAGE_SIZE_HINTS = Object.values(NARRATION_BODY_STAGE_SPECS).join('；')

export function formatNarrationBodyStageSpec(stage?: string | null): string {
  const key = normalizeNarrationBodyStage(stage)
  return NARRATION_BODY_STAGE_SPECS[key]
}

export function normalizeNarrationBodyStage(stage?: string | null): NarrationBodyStage {
  const t = String(stage || '').trim().replace(/期$/, '')
  if (t === '小孩' || /童年|幼年|孩童|儿时/.test(t)) return '小孩'
  if (t === '少年') return '少年'
  if (t === '青年' || /年轻|小伙/.test(t)) return '青年'
  if (t === '中年') return '中年'
  if (t === '老年' || /晚年|垂暮|苍老|年迈/.test(t)) return '老年'
  return '青年'
}

/** LLM：人生阶段发型与体型（多主人公同框须统一遵守） */
export const NARRATION_STAGE_HAIR_LLM_RULE =
  '【阶段发型】小孩/少年/青年/中年期主人公均无头发（圆头无发丝）；中年期在青年三头身基础上仅加宽躯干至1.15份；仅老年期圆头两侧可有2-3条简化白发弧线；多主人公同框须同阶段、同规格、同发型规则，禁止一人有发一人无发或青年配中年'

/** LLM：同框多主人公（夫妻/父子/母子等）须人生阶段与画风统一 */
export const NARRATION_DUAL_PROTAGONIST_LLM_RULE =
  '【多主人公例外】旁白明确同框且同为叙事主角（夫妻、父子、母子、兄妹等）时，【画面主体】可写「两位X期主人公」或「一位X期主人公与一位X期配偶/父亲/母亲/儿子/女儿主人公」，须同处一个人生阶段（同青年/同中年/同老年），两位须同为白色素体、同款简笔比例与发型规则、均写正常卡通脸（圆眼或弯眼带高光），仅通过性别/简化服装/构图区分；禁止把路人或群众写成第二位主人公'

/** LLM：群众配角面部（非背面须小眼睛） */
export const NARRATION_CROWD_EYE_LLM_RULE =
  '【配角眼型】路人/顾客/群众配角正面或侧面出镜时须写「两个小圆点眼（小眼睛）」，简笔眉嘴从简；仅背面或远背影时可不写眼；主人公仍用正常卡通脸（圆眼或弯眼带高光），禁止配角也用大圆眼抢戏'

/** 解说配图万能模板：画风规格维固定正文（原无前缀前缀块，不含【】） */
export const NARRATION_UNIVERSAL_STYLE_SPEC_BODY =
  `16:9 横屏，2D 扁平插画，全员${NARRATION_CROWD_BODY}简笔身形纯色平涂无复杂光影（${NARRATION_CROWD_FACE}），黑色轮廓线，${NARRATION_BODY_CONSISTENCY_CORE}`

/** 解说配图动漫风格：画风规格维固定正文 */
export const NARRATION_ANIME_STYLE_SPEC_BODY =
  '16:9 横屏，现代高质量 2D 动漫插画，清晰线稿，赛璐璐平涂结合柔和渐变，正常青年头身比（非Q版非三头身），大而富有表现力的动漫眼睛带瞳孔高光，日常叙事 slice-of-life 质感，低饱和写实配色'

/** 动漫风格固定后缀 */
export const NARRATION_ANIME_SCENE_SUFFIX =
  '电影感叙事构图，干净整洁的画面，无文字无水印'

/** LLM 写【质感要求】时的短补充项（动漫） */
export const NARRATION_ANIME_TEXTURE_LLM_HINT =
  '清晰线稿，赛璐璐平涂与柔和渐变，表情夸张生动，环境陈设有细节，无文字无水印'

export function getNarrationStyleSpecBody(style?: string | null): string {
  const key = String(style || '').trim().toLowerCase()
  if (key === NARRATION_ANIME_STYLE) return NARRATION_ANIME_STYLE_SPEC_BODY
  return NARRATION_UNIVERSAL_STYLE_SPEC_BODY
}

/** 画风规格维标签（七维之首） */
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

/** 群众/路人/顾客：配角在两侧或背景，不得抢主人公焦点 */
export const NARRATION_CROWD_STYLE_HINT =
  `顾客、路人、群众等配角一律写成「几位${NARRATION_CROWD_BODY}配角」置于两侧或背景，简化低饱和便装，不得与主人公抢焦点；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 解说配图六维结构 */
export const NARRATION_IMAGE_PROMPT_SIX_PART_HINT =
  '每条 image_prompt 按六维顺序：【画面主体】→【年代场景】→【核心细节动作】→【光影色调】→【镜头视角】→【质感要求】；以 narration_lines 为锚点，结合 full_narration 与 prior_narration 丰富场景、陈设、动作与情绪'

/** 解说配图万能模板：六维正文 */
export const NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE =
  '【画面主体：一位主人公位于画面中心或前景（人生阶段+鲜明简化服装+正常卡通脸表情），几位配角在两侧或背景（低饱和简化便装）】，【年代场景：时代氛围、具体地点环境与关键陈设物件】，【核心细节动作：主人公关键动作与表情清晰，配角陪衬互动】，【光影色调：光线明暗、时段、冷暖与剧情情绪氛围】，【镜头视角：景别与机位，镜头朝向主人公】，【质感要求：画风线条涂色与画面禁忌】'

/** 默认镜头视角 */
export const NARRATION_DEFAULT_CAMERA_PROMPT = '中景平视，叙事解说构图，主体清晰'

/** LLM 写【质感要求】时的短补充项（不重复前缀画风） */
export const NARRATION_MINIMAL_TEXTURE_LLM_HINT =
  '柔和平涂，简化服装轮廓，正常卡通脸表情，无文字无水印'

/** 素体画风质感要求（组装兜底用；LLM/coerce 落库时用短补充项） */
export const NARRATION_MINIMAL_TEXTURE_PROMPT =
  `2D扁平插画，全员${NARRATION_CROWD_BODY}（${NARRATION_CROWD_FACE}），黑色轮廓线，纯色平涂，${NARRATION_BODY_CONSISTENCY_CORE}，${NARRATION_MINIMAL_CLOTHING_LLM_RULE}，${NARRATION_MINIMAL_STYLE_FORBIDDEN}，无文字无水印`

/** LLM：通用素体尺寸 */
export const NARRATION_BODY_CONSISTENCY_HINT =
  `通用素体尺寸：${NARRATION_MINIMAL_BODY_SIZE_SPEC}；人生阶段微调：${NARRATION_BODY_STAGE_SIZE_HINTS}`

/** 主人公须入画且画风一致 */
export const NARRATION_PROTAGONIST_PLOT_HINT =
  `【画面主体】全画面仅 1 位${NARRATION_PROTAGONIST_BODY}主人公（${NARRATION_PROTAGONIST_FACE}），同框配角为几位${NARRATION_CROWD_BODY}；人生阶段微调：${NARRATION_BODY_STAGE_SIZE_HINTS}`

/** LLM 光影色调须贴合全文剧情 */
export const NARRATION_ATMOSPHERE_HINT =
  '【光影色调】结合 full_narration 与 narration_lines 写光线、时段、冷暖、人气与剧情情绪基调，与年代场景和核心细节动作一致'

/** LLM：【年代场景】陈设（权威表述） */
export const NARRATION_FIXTURES_HINT =
  '【年代场景·陈设】有陈列载体时写「载体+上陈列+具体物件名」（从 prior_narration、full_narration 或 narration_lines 提取）；同场所可延续 prior 物件，场景切换时重设；禁止货物堆等泛称'

/** @deprecated 使用 NARRATION_FIXTURES_HINT */
export const NARRATION_FIXTURES_FORMAT_HINT = NARRATION_FIXTURES_HINT

/** @deprecated 使用 NARRATION_FIXTURES_HINT */
export const NARRATION_FIXTURES_DISPLAY_HINT = NARRATION_FIXTURES_HINT

export const NARRATION_CROWD_PLOT_HINT =
  `同框配角须为几位${NARRATION_CROWD_BODY}配角在两侧或背景（两个小圆点眼小眼睛，${NARRATION_MINIMAL_LIMBS_SPEC}），低饱和简化便装，不得抢主人公焦点；${NARRATION_CROWD_EYE_LLM_RULE}`

/** LLM 素体剧情只写可见动作 */
export const NARRATION_MINIMAL_PLOT_VISIBILITY_HINT =
  '【核心细节动作】主人公动作与表情须清晰具体，配角只做陪衬；禁止内心独白与抽象说理'

/** LLM 写配图 prompt：如何通读全文 */
export const NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE =
  '写每条配图 prompt 前须先通读 full_narration（及 previous_episode_narration 若有），按时间线把握人物关系、地点变迁、核心物件与情绪曲线；再读 prior_narration 与 narration_lines 确定本段锚点；画面设计以全文为依据丰富细节，而非仅翻译当前段落'

/** LLM 配图：以全文剧情丰富画面，不单贴当前段落 */
export const NARRATION_FULL_PLOT_ENRICHMENT_LLM_RULE =
  '【全文丰富】narration_lines 只定本配图段叙事锚点，但 prompt 须结合 full_narration、prior_narration 与 characters 主动丰富【年代场景】环境、【陈设】具体物件、【核心细节动作】可见互动、【光影色调】剧情氛围；禁止空泛场所或只贴段内字面'

/** 【剧情】通用：物件/品类全文连贯 */
export const NARRATION_PLOT_CONTINUITY_HINT =
  '物件/品类须基于 full_narration、prior_narration 或 narration_lines 有据；同一场所可延续 prior 物件并补充具体名称；场景切换时陈设重设，禁止无关混搭'

/** @deprecated 使用 NARRATION_FIXTURES_HINT */
export const NARRATION_FIXTURES_CONTINUITY_HINT = NARRATION_FIXTURES_HINT

/** LLM 写配图 prompt：场景与剧情质量要求（通用） */
export const NARRATION_SCENE_PLOT_QUALITY_LLM_RULE =
  '【年代场景】与【核心细节动作】须在同一空间；【核心细节动作】须写成可见的具体动作与互动，结合全文推断而非只摘 narration_lines 一句；抽象句须据全文推断成可画瞬间（含相应场景陈设）'

/** LLM 配图：禁止暴力血腥画面，改写为温和司法/羁押情节 */
export const NARRATION_VIOLENCE_CONTENT_LLM_RULE =
  '【内容合规】禁止描写斩首、尸体、尸首、断颈、血腥、血迹、杀戮、凶杀、处决、砍头、人头落地、残肢、血肉模糊、恐怖虐杀等暴力画面；旁白涉及刑案/杀人/处决时，改写为牢狱候审、押解待审、公堂问讯、铁链羁押、牢房静坐、衙役押送等温和可画瞬间，只表现司法流程与人物姿态，不表现伤害过程与遗体'

/** LLM 配图：禁止暴力词替换残留，六维全文须语义通顺的温和改写 */
export const NARRATION_VIOLENCE_NO_FRAGMENT_LLM_RULE =
  '【禁止替换残留】暴力血腥禁止出现在任一维度（【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】及画风前后缀）；严禁对暴力词做单词替换后拼凑（如「尸体」改「牢狱候审」却写「倒地的…牢狱候审」「旁边有…牢狱候审」）；必须整句重写为完整、通顺、无伤亡暗示的温和司法画面，不得残留倒地不动、刀刃近颈、地面血迹、刑架处决等可视化伤亡'

/** 解说视频模式：负面提示词 */
export const NARRATION_IMAGE_NEGATIVE_PROMPT =
  '厚涂肌理、3D 建模、渐变光影、复杂纹理、半写实、真人照片质感、写实布料褶皱、复杂印花、复古滤镜、像素风、杂乱背景、写实路人、不同画风角色、正常比例人体、头身比失调、长短腿、四肢粗细不一、身高参差不齐、体型不一、斩首、砍头、尸体、尸首、血腥、血迹、杀戮、凶杀、处决、残肢、血肉模糊、恐怖虐杀、gore、blood、bloody、corpse、decapitation'

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
    description: '国漫条漫风，粗线平涂，静图快切+打斗动效，适合逆袭/短剧',
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
    portrait: `${formatNarrationStyleSpecBracket(undefined, NARRATION_MINIMAL_STYLE)}，【场景：${THREE_VIEW_PORTRAIT_SCENE_MINIMAL_CN}】，【剧情：${THREE_VIEW_PORTRAIT_PLOT_MINIMAL_CN}】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    agent: NARRATION_IMAGE_STYLE_CORE,
  },
  [NARRATION_ANIME_STYLE]: {
    scene: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    diptych: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，单张横向两宫格，【左格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，【右格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    title: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【片头背景场景】，【主题氛围】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    portrait: `${formatNarrationStyleSpecBracket(undefined, NARRATION_ANIME_STYLE)}，【场景：${THREE_VIEW_PORTRAIT_SCENE_CN}】，【剧情：${THREE_VIEW_PORTRAIT_PLOT_ANIME_CN}】，${NARRATION_ANIME_SCENE_SUFFIX}`,
    agent: `${NARRATION_ANIME_STYLE_SPEC_BODY}，禁止Q版三头身、3D渲染、真人照片`,
  },
  [MOTION_COMIC_STYLE]: {
    scene: 'modern Chinese webtoon comic style, bold black outlines, flat cel-shaded colors, normal body proportions, expressive exaggerated faces, manhua illustration, dynamic action lines for fight scenes, cinematic composition, NOT chibi, NOT 3D',
    diptych: 'modern Chinese webtoon comic style, horizontal two-panel before/after action, bold outlines, flat cel colors, normal proportions, manhua illustration',
    title: 'modern Chinese webtoon comic style, atmospheric background, bold outlines, dramatic lighting, no text',
    portrait: 'modern Chinese webtoon comic character turnaround reference sheet, three views front side back, bold black outlines, flat cel colors, normal body proportions, handsome attractive anime face, clear facial features, 16:9 widescreen horizontal framing, pure white background',
    agent: 'modern Chinese webtoon comic style, bold outlines, flat cel colors, expressive faces, action lines allowed, NOT chibi',
  },
  'short-drama': {
    scene: 'Chinese short drama 2D animation style, normal realistic body proportions, clean consistent line art, soft cel shading, expressive anime faces, Douyin storytelling animation aesthetic, school drama illustration, cinematic composition, NOT chibi, NOT Q-version',
    diptych: 'Chinese short drama 2D animation style, normal body proportions, clean line art, soft cel shading, expressive faces, NOT chibi, cinematic composition',
    title: 'Chinese short drama 2D animation style, atmospheric background, clean line art, soft cel shading, dramatic lighting, shallow depth of field',
    portrait: '2D Chinese Douyin scripted drama animation style, thin clean anime line art, flat soft cel shading, bright even lighting, normal young adult body proportions, TV anime character design reference sheet, plain light gray background, NOT painterly, NOT semi-realistic, NOT digital painting portrait, NOT chibi, NOT thick comic outlines, NOT concept art poster',
    agent: 'Chinese short drama 2D animation style, normal body proportions, clean line art, soft cel shading, NOT chibi',
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

export function isMotionComicStyle(style?: string | null): boolean {
  return normalizeArtStyle(style) === MOTION_COMIC_STYLE
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
  if (/素体小人|白色素体小人主人公|白色素体小人|两个小黑点|两个白色小圆点|正常卡通脸/.test(t)) return false
  return /[我你他她]|(?:了|的|吗|呢|吧)[，,、]?$|辞掉|摆地摊|万元户|供销社|批发市场/.test(t)
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
  priority: number
  sceneTags?: string[]
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
  { re: /手推车|板车|独轮车/, action: '白色素体小人主人公推着手推车运送货物', priority: 9, sceneTags: ['cart'] },
  { re: /二八杠|自行车/, action: '白色素体小人主人公推着二八杠自行车轮廓前行', priority: 9, sceneTags: ['bike'] },
  { re: /推.*车/, action: '白色素体小人主人公推着二八杠自行车轮廓前行', priority: 6, sceneTags: ['bike'] },
  { re: /扇.*扇|蒲扇|乘凉|小凳/, action: '白色素体小人主人公坐在门口小凳上扇蒲扇', priority: 9 },
  { re: /疯|议论|说我/, action: '白色素体小人主人公在摊位前独自忙碌，周围几位白色素体小人围观交谈', priority: 7, sceneTags: ['market'] },
  { re: /万元户/, action: '白色素体小人主人公站在店铺前，周围简化钱币意象', priority: 8, sceneTags: ['shop'] },
  { re: /赚钱|收入|越多|利润/, action: '白色素体小人主人公手持简化账本查看收入', priority: 7, sceneTags: ['market', 'shop'] },
  { re: /铁饭碗|个体户|投机/, action: '白色素体小人主人公独自经营小摊忙碌', priority: 6, sceneTags: ['market'] },
  { re: /心里有数|敢闯|改革|踏实/, action: '白色素体小人主人公在摊前从容应对，继续向围观的白色素体小人招揽', priority: 3, sceneTags: ['market'], fallback: true },
]

function detectNarrationSceneTags(text: string): string[] {
  const tags: string[] = []
  if (/夜市|摆地摊|地摊|摊位|摆摊/.test(text)) tags.push('market')
  if (/卖|顾客|生意|交易|货物|商品|赶时髦/.test(text)) tags.push('market')
  if (/批发市场|批(?:发|了)|进货/.test(text)) tags.push('wholesale')
  if (/门面|店铺|服装店|开店|租了/.test(text)) tags.push('shop')
  if (/供销社/.test(text)) tags.push('supply')
  if (/推.*手推车|手推车|板车/.test(text)) tags.push('cart')
  if (/推.*车|自行车|二八杠/.test(text)) tags.push('bike')
  if (/牢|狱|公堂|衙门|押解|候审|羁押/.test(text)) tags.push('justice')
  return tags
}

function inferVisualSceneFromNarration(text: string): string {
  for (const [re, scene] of NARRATION_SCENE_HINTS) {
    if (re.test(text)) return scene
  }
  return ''
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
  return String(text || '').trim()
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

const NARRATION_SCENE_KEYWORDS: Array<[RegExp, string]> = [
  [/牢房|牢狱|监狱|大狱/, '简化牢房内景，木栏与石墙'],
  [/公堂|衙门|大堂/, '简化公堂问讯内景'],
  [/杂货店|杂货铺|小卖部/, '老旧杂货店门口，简化店面与玻璃橱窗'],
  [/供销社/, '供销社门口或营业大厅内景'],
  [/批发市场/, '批发市场货架通道与货物堆'],
  [/夜市|摆地摊|地摊/, '县城夜市街景与简化摊位'],
  [/服装店|门面|店铺|租了/, '临街店铺或门店铺面内景'],
  [/固定摊位|摊位/, '市场固定摊位内景'],
  [/县城/, '县城街景'],
  [/身边|议论|说我/, '日常街道或院落背景'],
]

const NARRATION_SETTING_ONLY_RE =
  /^(?:\d{2,4}\s*年)?(?:的)?(?:春|夏|秋|冬|天|日|夜|晚|晨|暮|早|午)(?:天|季|里|间|上)?[，,、\s]*$/

function isNarrationDateOnlySentence(sentence: string): boolean {
  const t = String(sentence || '')
    .replace(/^[，,、\s]+|[，,、\s]+|[。！？.!?]+$/g, '')
    .replace(/\s/g, '')
  if (!t) return false
  if (NARRATION_SETTING_ONLY_RE.test(t)) return true
  return /^(?:\d{2,4}\s*年(?:的)?|(?:八十年代|九十年代|\d{2,4}年代))$/.test(t)
}

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

/** 【剧情】写入 prompt：与配图段旁白原文一致，不做清洗 */
function formatNarrationPlotForPrompt(plot?: string | null): string {
  return String(plot || '').trim()
}

export type NarrationScenePromptOptions = {
  fullNarrationLines?: string[]
  timelineUpToIndex?: number
  /** @deprecated 请用 fullNarrationLines */
  priorNarrationLines?: string[]
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
  const t = String(text || '')
  if (/童年|儿时|小时候|幼年|小孩/.test(t)) return '小孩'
  if (/少年|青年|18岁|20岁|小伙|年轻/.test(t)) return '青年'
  if (/中年|而立|40岁|50岁/.test(t)) return '中年'
  if (/老年|晚年|花甲|白发|佝偻|拄拐/.test(t)) return '老年'
  if (!hints?.length) return null
  for (const hint of hints) {
    const label = String(hint.variantLabel || '').trim().replace(/期$/, '')
    if (label && t.includes(label)) return label
  }
  const primary = String(hints[0]?.variantLabel || '').trim().replace(/期$/, '')
  return primary || null
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
    [/店员/g, `${body}店员`],
  ]
  for (const [pattern, replacement] of crowdReplacements) {
    text = text.replace(pattern, replacement)
  }

  text = text
    .replace(/素体小人主人公/g, `${PROT}主人公`)
    .replace(/(?<!白色)素体小人/g, body)
    .replace(new RegExp(PROT, 'g'), body)

  return text.replace(new RegExp(`${body}${body}`, 'g'), body)
}

function formatMinimalProtagonistPlot(
  plot: string,
  options?: {
    narrationText?: string
    protagonistHints?: NarrationProtagonistHint[]
  },
): string {
  const plotPart = formatNarrationPlotForPrompt(plot)
  if (!plotPart) return ''
  if (/素体小人|白色素体小人主人公|白色素体小人|白色圆头/.test(plotPart)) return normalizeMinimalCrowdInPlot(plotPart)

  const narrationText = String(options?.narrationText || plotPart)
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
  if (goods && !segmentOverlapsExisting(goods, segments)) segments.push(goods)
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

export function compressFullNarrationLines(lines?: string[]): string {
  return compressTimelineNarrationLines(lines)
}

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

/** @deprecated 剧情不再清洗 */
export function sanitizeNarrationPlotLine(text?: string | null): string {
  return formatNarrationPlotForPrompt(text)
}

/** @deprecated 剧情不再清洗 */
export function stripNarrationPlotActors(text?: string | null): string {
  return formatNarrationPlotForPrompt(text)
}

export function ensureMinimalPlotEyes(plot?: string | null): string {
  return formatNarrationPlotForPrompt(plot)
}

export function normalizePlotDescription(plot?: string | null): string {
  return formatNarrationPlotForPrompt(plot)
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
  currentText: string,
  sceneTags?: string[],
): string[] {
  const priorFull = priorLines.join('')
  const current = String(currentText || '').trim()
  const contextText = priorFull + current
  if (!contextText.trim()) return []

  const relevant: string[] = []
  for (const prop of extractPersistentVisualProps(current)) {
    pushContinuityProp(relevant, prop)
  }

  const isMarketScene = isMarketNarrationContext(contextText, sceneTags)
  if (isMarketScene && priorFull) {
    const priorHasGoodsCue = /批|卖|进|摊|货|赶时髦|时髦|摆摊|地摊|夜市/.test(priorFull)
    if (priorHasGoodsCue) {
      for (const prop of extractPersistentVisualProps(priorFull)) {
        pushContinuityProp(relevant, prop)
      }
      for (const goods of collectGoodsFromNarrationLines(priorLines)) {
        pushContinuityProp(relevant, goods)
      }
    }
  }

  for (const [, sceneRe, label] of SCENE_BOUND_VISUAL_PROPS) {
    if (!sceneRe.test(current)) continue
    if (label === '批发市场货物' && relevant.length > 0) continue
    if (!relevant.includes(label)) relevant.push(label)
  }

  return relevant.slice(0, 4)
}

function resolveActiveSceneFromParts(
  allParts: string[],
  currentText: string,
  sceneTags?: string[],
): string {
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
      return '素体小人离开供销社门口'
    }
    if (/供销社/.test(narr)) {
      return '素体小人在供销社门口或营业大厅内站立行走'
    }
  }

  return text
}

function contextualizePlotForScene(
  plot: string,
  scene: string,
  props: string[],
  sceneTags: string[],
): string {
  const base = String(plot || '').trim()
  if (!base) return base

  const isMarket = sceneTags.includes('market')
    || /夜市|摊位|摆摊|摆地摊/.test(scene + base)
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
  const props = collectRelevantContinuityProps(prior, currentText, sceneTags)
  const scene = sceneHint || inferActiveSceneFromContext(currentText, prior, sceneTags)

  const primaryLine = pickPrimaryActionLine(lines, scene)
  let plot = inferVisualPlotFromNarration(primaryLine, sceneTags)
  if (!plot || isRawNarrationText(plot)) {
    plot = inferVisualPlotFromNarration(currentText, sceneTags)
  }
  if (!plot || isRawNarrationText(plot)) {
    plot = normalizeBracketContent(mergeNarrationPlotSentences(lines))
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

export function mergeStoryboardLinesForImagePrompt(lines: string[]): string[] {
  return lines.map(s => String(s || '').trim()).filter(Boolean)
}

function resolvePriorNarrationLines(options?: NarrationScenePromptOptions): string[] {
  const full = resolveFullNarrationLines(options)
  if (!full.length) return []
  const upTo = options?.timelineUpToIndex
  if (upTo != null && upTo > 0) return full.slice(0, upTo)
  return []
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
  const props = collectRelevantContinuityProps(priorLines, fullText, sceneTags)
  let scene = inferActiveSceneFromContext(fullText, priorLines, sceneTags)
  if (!scene) {
    const allParts = extractScenePartsFromNarrationText(fullText)
    scene = normalizeBracketContent(resolvePrimaryScene(allParts))
      || (/万元户|摆地摊|赚钱|创业/.test(fullText) ? '简化县城街景，寓意经营成功氛围' : '')
  }
  const plot = buildFocusedScenePlot(lines, priorLines, scene, options?.protagonistHints)
  scene = reconcileSceneWithPlot(scene, plot, sceneTags)
  const fixtures = inferFixturesDisplay(scene, props, plot, sceneTags)
  const atmosphere = inferNarrationAtmosphereFromText(fullText, scene)
  return { scene, fixtures, plot, atmosphere }
}

export function buildNarrationSceneImagePromptFromSentences(
  sentences: string | string[],
  options?: NarrationScenePromptOptions,
): string {
  const { scene, fixtures, plot, atmosphere } = parseNarrationIntoScenePlot(sentences, options)
  if (!scene && !fixtures && !plot && !atmosphere) return ''
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

/** 向已有 prompt 的指定【】框内追加内容 */
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

export function wrapNarrationMinimalScenePrompt(plot: string): string {
  const plotPart = sanitizeSceneImagePrompt(String(plot || '').trim())
  if (!plotPart) return ''
  return assembleNarrationUniversalScenePrompt('', plotPart)
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
  return tidyScenePrompt([
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
  return tidyScenePrompt([
    formatNarrationStyleSpecBracket(options?.styleSpec),
    body,
    NARRATION_UNIVERSAL_SCENE_SUFFIX,
  ].join('，'))
}

export function buildNarrationSceneImagePromptContent(scenePlot: string): string {
  return buildNarrationSceneImagePromptFromSentences(scenePlot)
}

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
  return tidyScenePrompt([
    NARRATION_UNIVERSAL_SCENE_PREFIX,
    body,
    NARRATION_UNIVERSAL_SCENE_SUFFIX,
  ].join('，'))
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
  [/斩首|砍头|杀头|铡刀|处决|人头落地|断头/g, '押解待审'],
  [/尸体|尸首|遗体|死尸|尸身|惨死|横尸/g, '牢狱候审'],
  [/验尸|解剖/g, '公堂问讯'],
  [/血迹|血腥|鲜血|流血|血泊|血肉模糊|溅血|血染/g, ''],
  [/杀戮|凶杀|虐杀|屠杀|捅死|刺死|砍死|勒死|枪毙|绞刑/g, '羁押候审'],
  [/残肢|断肢|断手|断腿|开膛/g, ''],
  [/上吊|吊死/g, '牢房静坐'],
  [/decapitation|beheading|execution|gore|bloody|blood\s*splatter|corpse|dead\s*body|mutilat/gi, 'detained awaiting trial'],
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
]

function tidyScenePrompt(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/[，,、]{2,}/g, '，')
    .replace(/[。！？；]+/g, '，')
    .replace(/[，,、]\s*[。！？；]+/g, '，')
    .replace(/[。！？；]+\s*[，,、]+/g, '，')
    .replace(/^[,，;；、。\s]+|[,，;；、。\s]+$/g, '')
    .replace(/\(\s*\)/g, '')
    .trim()
}

export function sanitizeSceneImagePrompt(prompt?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''
  for (const [pattern, replacement] of SCENE_PROMPT_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  return tidyScenePrompt(text)
}

export function buildMinimalPortraitPostureHint(variantLabel?: string | null): string {
  const face = NARRATION_PROTAGONIST_FACE
  const body = NARRATION_PROTAGONIST_BODY
  const label = String(variantLabel || '').trim()
  const stage = normalizeNarrationBodyStage(label)
  const spec = formatNarrationBodyStageSpec(stage)
  if (stage === '小孩') return `${body}主人公，${face}，开心微笑，简化童装轮廓，${spec}，站立，简单活泼姿态`
  if (stage === '少年') return `${body}主人公，${face}，青涩微笑，简化校服或休闲装轮廓，${spec}，站立或行走，可背书包轮廓`
  if (stage === '青年') return `${body}主人公，${face}，自信微笑，简化年代服装轮廓，${spec}，站立或行走，可持简单道具轮廓`
  if (stage === '中年') return `${body}主人公，${face}，沉稳表情，简化中年便装轮廓，${spec}，坐或站放松姿态，可手持茶杯轮廓`
  if (stage === '老年') return `${body}主人公，${face}，慈祥微笑，简化老年便装轮廓，${spec}，坐于凳上，可手持圆扇轮廓`
  return `${body}主人公，${face}，中性表情，简化服装轮廓，${spec}，中性站立姿态`
}

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
  title: boolean
} {
  const text = String(raw || '').trim()
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
      title: true,
    }
  }
  const subject = text.match(/【画面主体[：:]\s*([^】]+)】/)
  const eraScene = text.match(/【年代场景[：:]\s*([^】]+)】/)
  const action = text.match(/【核心细节动作[：:]\s*([^】]+)】/)
  const lighting = text.match(/【光影色调[：:]\s*([^】]+)】/)
  const camera = text.match(/【镜头视角[：:]\s*([^】]+)】/)
  const texture = text.match(/【质感要求[：:]\s*([^】]+)】/)
  if (subject || eraScene || action || lighting || camera || texture) {
    return {
      scene: eraScene?.[1]?.trim() || '',
      atmosphere: lighting?.[1]?.trim() || '',
      fixtures: '',
      plot: action?.[1]?.trim() || '',
      subject: subject?.[1]?.trim() || '',
      camera: camera?.[1]?.trim() || '',
      texture: texture?.[1]?.trim() || '',
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
    title: /片头/.test(text),
  }
}

export type FinalizeNarrationPromptOptions = {
  narrationLines?: string[]
  fullNarrationLines?: string[]
  timelineUpToIndex?: number
  /** @deprecated 请用 fullNarrationLines */
  priorNarrationLines?: string[]
  titleHook?: string
  titleFull?: string | null
  titleBodySentences?: string[]
  protagonistHints?: NarrationProtagonistHint[]
}

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
    const enriched = enrichNarrationVisualParts(
      sanitizeSceneImagePrompt(bracketParts.scene),
      formatMinimalProtagonistPlot(
        formatNarrationPlotForPrompt(bracketParts.plot),
        {
          narrationText: narrationLines?.join('') || bracketParts.plot,
          protagonistHints: options?.protagonistHints,
        },
      ),
    )
    const narrationText = narrationLines?.join('') || ''
    return assembleNarrationUniversalScenePrompt(enriched.scene, enriched.plot, {
      fixtures: formatNarrationPlotForPrompt(bracketParts.fixtures),
      atmosphere: bracketParts.atmosphere
        || inferNarrationAtmosphereFromText(narrationText, enriched.scene),
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

/** LLM 配图 prompt 原样落库、原样生图 */
export const NARRATION_USE_RAW_LLM_PROMPTS = true

/** 是否为六维（或两宫格六维）AI 配图 prompt */
export function isStoredNarrationImagePromptComplete(raw?: string | null): boolean {
  const text = String(raw || '').trim()
  if (!text) return false
  if (/【(画风规格|年代场景|画面主体|核心细节动作)[：:]/.test(text)) return true
  return /【左格[：:]/.test(text) && /【(画面主体|年代场景)[：:]/.test(text)
}

/** 纯 AI 模式下是否应原样保留 prompt */
export function shouldPreserveRawNarrationPrompt(raw?: string | null): boolean {
  return NARRATION_USE_RAW_LLM_PROMPTS && !!String(raw || '').trim()
}

/** 配图 prompt：七维结构化画风强制模板约束 */
export function resolveNarrationImagePrompt(
  prompt?: string | null,
  style?: string | null,
  _options?: FinalizeNarrationPromptOptions,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return ''
  if (isNarrationMinimalStyle(style)) return coerceMinimalLLMImagePrompt(raw)
  if (isNarrationAnimeStyle(style)) return coerceAnimeLLMImagePrompt(raw, style)
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

/** 将 LLM/旧库中的动漫配图 prompt 对齐七维模板 */
export function coerceAnimeLLMImagePrompt(prompt?: string | null, style?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''
  if (!/【画风规格[：:]/.test(text) && /【(?:画面主体|年代场景)/.test(text)) {
    text = `${formatNarrationStyleSpecBracket(undefined, style || NARRATION_ANIME_STYLE)}，${text}`
  }
  text = text.replace(
    /【质感要求[：:]([^】]*)】/g,
    (_, body) => `【质感要求：${normalizeAnimeTextureBracket(body)}】`,
  )
  return applyMinimalNoClothingGuard(text)
}

/** 配图 prompt 保留服装描述，仅做基础清洗 */
export function applyMinimalNoClothingGuard(prompt?: string | null): string {
  return tidyScenePrompt(sanitizeSceneImagePrompt(String(prompt || '').trim()))
}

/** 将 LLM/旧库中的素体配图 prompt 对齐万能模板（与 backend 同步） */
export function coerceMinimalLLMImagePrompt(prompt?: string | null): string {
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

  return applyMinimalNoClothingGuard(text)
}

export function extractTitleHook(title: string) {
  let hook = title
    .replace(/^今天体验的人生剧本是[，,]?\s*/, '')
    .replace(/^(?:本期|本集)?人生剧本\s*[:：]?\s*/, '')
    .replace(/^【|】$/g, '')
    .replace(/^[，,、\s]+/, '')
    .trim()
  if (!hook) hook = title.trim()
  const firstSegment = hook.split(/[，,]/)[0]?.trim() || hook
  if (firstSegment.length >= 6 && firstSegment.length <= 22) return firstSegment
  if (hook.length > 20) return hook.slice(0, 20)
  return hook
}

export function resolveTitleVisualHook(titleFull?: string | null, titleHook?: string | null): string {
  const full = String(titleFull || '').trim()
  if (full) return extractTitleHook(full)
  const hook = String(titleHook || '').trim()
  if (!hook) return ''
  return extractTitleHook(hook)
}

export const artStyleSelectOptions = ART_STYLES.map(item => ({
  label: `${item.label} — ${item.description}`,
  value: item.value,
}))
