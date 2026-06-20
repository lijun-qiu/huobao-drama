export type ArtStyleContext = 'scene' | 'diptych' | 'title' | 'portrait' | 'agent'

export const DEFAULT_ART_STYLE = 'short-drama'

/** 解说素体极简叙事画风（项目级视觉风格 value） */
export const NARRATION_MINIMAL_STYLE = 'narration-minimal'

/** 解说素体小人：主人公眼睛（黑头上用白点） */
export const NARRATION_PROTAGONIST_EYES = '两个白色小圆点眼睛'

/** 解说素体小人：群众眼睛（白头上用黑点，与用户参考图一致） */
export const NARRATION_CROWD_EYES = '两个黑色小圆点眼睛'

/** @deprecated 群众/旧 prompt 兼容；主人公请用 NARRATION_PROTAGONIST_EYES */
export const NARRATION_MINIMAL_EYES = NARRATION_CROWD_EYES

/** 主人公形体：纯黑填充简笔素体 */
export const NARRATION_PROTAGONIST_BODY = '黑色素体小人'

/** 群众/路人/顾客形体：纯白填充简笔素体 */
export const NARRATION_CROWD_BODY = '白色素体小人'

/** 禁止偏离简笔素体的画风（写入 LLM 与清洗规则） */
export const NARRATION_MINIMAL_STYLE_FORBIDDEN =
  '禁止写实人脸、动漫脸、五官细节、鼻子嘴巴、发型、赛璐璐、日式动画脸、表情包、条漫、像素风、渐变阴影、3D渲染'

/** 素体人物一律无服装（主人公与群众均适用） */
export const NARRATION_MINIMAL_NO_CLOTHING_RULE =
  '所有人物均为纯素体，全身无任何服装鞋帽围巾围裙工装制服外套裙装裤装，仅黑白填充简笔身体+眼睛+老年可选两侧简化白发弧线'

/** 写入【质感要求】与 LLM 硬性规则的无服装表述 */
export const NARRATION_MINIMAL_NO_CLOTHING_LLM_RULE =
  `【无服装】${NARRATION_MINIMAL_NO_CLOTHING_RULE}；禁止在【画面主体】【核心细节动作】写穿着/身着/身穿/戴帽/穿鞋；年代氛围只写环境，不写人物穿衣`

/** 解说素体通用尺寸（全片统一简笔比例，仅人生阶段微调） */
export const NARRATION_MINIMAL_BODY_SIZE_SPEC =
  '圆头约占身高三分之一，简笔躯干与圆头相当，四肢等粗黑线，青年标准站姿总高约三个头高'

/** 写入 prompt 的完整身形约束（含全片统一） */
export const NARRATION_BODY_CONSISTENCY_CORE =
  `全片统一简笔素体比例，${NARRATION_MINIMAL_BODY_SIZE_SPEC}`

/** 各人生阶段相对青年尺寸的微调（主人公均为黑色素体，仅体型差异） */
export const NARRATION_BODY_STAGE_SIZE_HINTS =
  '小孩比青年小一号约2.2头高；青年严格三头高；中年三头高躯干略宽微胖；老年略佝偻约2.8头高圆头两侧各几条简化白发弧线'

/** 素体人生阶段 + 黑白分工（写入 LLM 硬性规则） */
export const NARRATION_MINIMAL_STAGE_FACE_RULE =
  '【黑白分工】主人公一律黑色素体小人+两个白色小圆点眼睛；群众/路人/顾客一律白色素体小人+两个黑色小圆点眼睛；【阶段】小孩比青年小一号；青年标准三头高；中年略宽微胖；老年略佝偻+圆头两侧简化白发弧线；全阶段禁止写实五官/动漫脸/皱纹/发型；【无服装】所有人物全身无服装鞋帽'

/** 解说配图万能模板：固定前缀 */
export const NARRATION_UNIVERSAL_SCENE_PREFIX =
  `16:9 横屏，2D 扁平简笔画，纯色平涂无复杂光影，主人公${NARRATION_PROTAGONIST_BODY}（${NARRATION_PROTAGONIST_EYES}），群众${NARRATION_CROWD_BODY}（${NARRATION_CROWD_EYES}），黑色轮廓线，${NARRATION_BODY_CONSISTENCY_CORE}`

/** 解说配图万能模板：固定后缀 */
export const NARRATION_UNIVERSAL_SCENE_SUFFIX =
  '日常低饱和配色，极简简笔叙事风格，干净整洁的画面，无文字无水印'

/** 解说视频模式：核心画风固定关键词（LLM 参考用） */
export const NARRATION_IMAGE_STYLE_CORE =
  `主人公${NARRATION_PROTAGONIST_BODY}（${NARRATION_PROTAGONIST_EYES}）、群众${NARRATION_CROWD_BODY}（${NARRATION_CROWD_EYES}）、黑色轮廓线、纯色平涂、${NARRATION_BODY_CONSISTENCY_CORE}、极简简笔叙事风格、${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 群众/路人/顾客：白色素体，与主人公黑白区分 */
export const NARRATION_CROWD_STYLE_HINT =
  `顾客、路人、群众、年轻人等配角一律写成「几位${NARRATION_CROWD_BODY}」（${NARRATION_CROWD_EYES}），与主人公${NARRATION_PROTAGONIST_BODY}同款简笔比例，仅颜色与姿态区分；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 解说配图六维结构（LLM 与规则兜底共用） */
export const NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE =
  '每条 image_prompt 必须按以下六维顺序撰写（【】标签必填）：【画面主体】→【年代场景】→【核心细节动作】→【光影色调】→【镜头视角】→【质感要求】；内容均从 full_narration / prior_narration / narration_lines 推断，禁止照抄旁白原文'

/** 解说配图万能模板：六维正文 */
export const NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE =
  '【画面主体：入画主角与同框配角，素体须标明阶段与数量位置】，【年代场景：时代氛围、具体地点环境；有摊位/货架/柜台/桌面等载体时须写「载体+上陈列的具体物件名称」】，【核心细节动作：本瞬间可见动作与互动细节】，【光影色调：光线明暗、时段、冷暖与情绪色调】，【镜头视角：景别与机位，如中景平视、略俯全景】，【质感要求：画风线条涂色与画面禁忌】'

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
  `2D扁平简笔画，主人公${NARRATION_PROTAGONIST_BODY}（${NARRATION_PROTAGONIST_EYES}），群众${NARRATION_CROWD_BODY}（${NARRATION_CROWD_EYES}），黑色轮廓线，纯色平涂，${NARRATION_BODY_CONSISTENCY_CORE}，${NARRATION_MINIMAL_NO_CLOTHING_RULE}，${NARRATION_MINIMAL_STYLE_FORBIDDEN}，无文字无水印`

/** LLM：素体须符合通用尺寸规格，仅人生阶段微调 */
export const NARRATION_BODY_CONSISTENCY_LLM_RULE =
  `【通用素体尺寸】每条须在【质感要求】或【画面主体】体现：${NARRATION_MINIMAL_BODY_SIZE_SPEC}；主人公${NARRATION_PROTAGONIST_BODY}、群众${NARRATION_CROWD_BODY}；人生阶段微调：${NARRATION_BODY_STAGE_SIZE_HINTS}；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** LLM 写配图 prompt：光影色调须贴合当前段（写入【光影色调】） */
export const NARRATION_ATMOSPHERE_LLM_RULE =
  '【光影色调】综合 narration_lines 写光线明暗、时段、冷暖、人气喧闹或寂静、经营旺衰等可见基调（2–4个短语）；须与【年代场景】【核心细节动作】情绪一致；只写可见光影与色调，不写内心独白'

/** LLM：主人公须入画且画风一致（写入【画面主体】【核心细节动作】） */
export const NARRATION_PROTAGONIST_PLOT_LLM_RULE =
  `【画面主体】主人公须为${NARRATION_PROTAGONIST_BODY}（按 life_stage 标明小孩/青年/中年/老年阶段），同框配角为${NARRATION_CROWD_BODY}；${NARRATION_MINIMAL_STAGE_FACE_RULE}；人生阶段微调：${NARRATION_BODY_STAGE_SIZE_HINTS}`

/** LLM：群众/路人须为白色素体 */
export const NARRATION_CROWD_PLOT_LLM_RULE =
  `【群众画风一致】顾客、路人、群众一律写成「几位${NARRATION_CROWD_BODY}」（${NARRATION_CROWD_EYES}），与主人公同款简笔比例，仅颜色与姿态不同；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** LLM：交通工具须与旁白一致（自行车≠手推车） */
export const NARRATION_VEHICLE_LLM_RULE =
  '交通工具须严格按旁白写：自行车/二八杠≠手推车/板车；旁白写自行车或二八杠时写「推着自行车」或「二八杠自行车轮廓」，禁止写成手推车；旁白写手推车/板车时才写手推车；旁白未提及任何车辆时禁止臆造推车或自行车'

/** LLM 素体配图：剧情只写可见动作（写入【核心细节动作】） */
export const NARRATION_MINIMAL_PLOT_VISIBILITY_LLM_RULE =
  '【核心细节动作】只写素体小人（含主人公与群众）的可见动作、姿态与位置；禁止面部表情、内心活动、抽象情绪'

/** LLM 配图：四步分析流程（通用，适用于任意题材旁白） */
export const NARRATION_LLM_ANALYSIS_STEPS = [
  '1) 通读 full_narration，把握全文主线、人物关系、核心事件与情节走向',
  '2) 读 prior_narration（若为空则回溯 full_narration 已交代部分），提取地点、场所、物件、道具、品类（用于【年代场景】陈设）',
  '3) 读 narration_lines，确定本张图要画的「当前瞬间」主画面',
  '4) 按六维写出【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】；【年代场景】有陈列载体时必须写「载体+上陈列的具体物件名」',
] as const

/** LLM 写配图 prompt：如何通读全文 */
export const NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE =
  '必须先通读 full_narration 并按时间线理解剧情走向，再联合 prior_narration 与 narration_lines 写每条配图 prompt'

/** LLM 写配图 prompt：物件/品类全文连贯（通用） */
export const NARRATION_PLOT_CONTINUITY_LLM_RULE =
  '【年代场景】中的物件/陈设须能在当前 narration_lines 或同场景 prior_narration 中找到依据；有具体名称须写具体名称；场景切换时按当前段重设，禁止带入已过场物件'

/** @deprecated 使用 NARRATION_FIXTURES_LLM_RULE */
export const NARRATION_FIXTURES_CONTINUITY_LLM_RULE = NARRATION_FIXTURES_LLM_RULE

/** 六维正文填表示例（硬性规则用，模型须替换为旁白真实内容） */
export const NARRATION_UNIVERSAL_SCENE_BODY_EXAMPLE =
  `【画面主体：青年期${NARRATION_PROTAGONIST_BODY}主人公与两位${NARRATION_CROWD_BODY}】，【年代场景：八十年代市井夜市，摊位上陈列物件甲与物件乙】，【核心细节动作：主人公${NARRATION_PROTAGONIST_BODY}伸手示意摊位陈列物】，【光影色调：暖黄夜市灯光，喧闹人气】，【镜头视角：中景平视】，【质感要求：${NARRATION_PROTAGONIST_BODY}、${NARRATION_CROWD_BODY}、简笔平涂、无文字无水印】`

/** 两宫格六维输出格式（layout=diptych） */
export const NARRATION_DIPPTYCH_SIX_PART_LLM_RULE =
  'layout=diptych：单张 16:9 横向两宫格；左、右格各写完整六维，格式为【左格】【画面主体：…】，【年代场景：…】，【核心细节动作：…】，【光影色调：…】，【镜头视角：…】，【质感要求：…】，【右格】【画面主体：…】…【质感要求：…】；禁止旧式【左格场景与剧情】'

export const NARRATION_SCENE_PLOT_QUALITY_LLM_RULE =
  '【年代场景】与【核心细节动作】须在同一空间；【核心细节动作】须为可见动作，严禁照抄旁白原文；抽象句须推断成可画瞬间'

/** LLM 配图写法抽象示例（不含具体故事情节，模型须从输入旁白中提取内容） */
export const NARRATION_LLM_PROMPT_PATTERN =
  'prior 已交代物件 + narration_lines 描述场所活动 →【画面主体：素体小人主人公与配角】，【年代场景：时代+地点+载体上陈列的具体物件名】，【核心细节动作：可见动作】，【光影色调：光线色调】，【镜头视角：景别机位】，【质感要求：画风与禁忌】'

/** LLM 写片头标题图 prompt 时的规则（通用） */
export const NARRATION_TITLE_IMAGE_LLM_RULE =
  '片头标题图须综合 full_narration 全文（片头 hook + 正文旁白），提炼最能概括本期核心的【片头背景场景】与【主题氛围】；不局限于 hook 字面，须体现全文主线（核心事件、身份或关系转折、关键场所或物件意象等），绝对无文字'

/** 组装「段落配图」LLM system prompt（素体 / 其他画风） */
export function buildNarrationParagraphImagePromptLLMSystem(
  style?: string | null,
  options?: { hasCharacters?: boolean },
): string {
  const minimal = isNarrationMinimalStyle(style)
  const shared = [
    `你是影视解说分镜美术指导。拆镜结构已由规则确定，你的任务是根据整集旁白全文，为每个配图段写出最佳 AI 文生图${minimal ? '中文' : ''} image_prompt。`,
    '分析流程（每条都必须执行）：',
    ...NARRATION_LLM_ANALYSIS_STEPS,
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_PLOT_CONTINUITY_LLM_RULE,
    NARRATION_FIXTURES_LLM_RULE,
    NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE,
    NARRATION_ATMOSPHERE_LLM_RULE,
    NARRATION_SCENE_PLOT_QUALITY_LLM_RULE,
    NARRATION_VEHICLE_LLM_RULE,
    minimal ? NARRATION_MINIMAL_PLOT_VISIBILITY_LLM_RULE : '',
    minimal ? NARRATION_PROTAGONIST_PLOT_LLM_RULE : '',
    minimal ? NARRATION_CROWD_PLOT_LLM_RULE : '',
    minimal ? NARRATION_BODY_CONSISTENCY_LLM_RULE : '',
    '写法模式（抽象模板，具体内容须从输入旁白中提取，勿套用无关题材）：',
    NARRATION_LLM_PROMPT_PATTERN,
  ].filter(Boolean)
  if (minimal) {
    return [
      ...shared,
      '硬性规则：',
      `1) 画风固定关键词（每条必含）：${NARRATION_IMAGE_STYLE_CORE}`,
      '2) 每条 prompt 以画风前缀开头，接六维正文与后缀；【】内填入从旁白推断的真实内容，勿照抄占位说明。结构示例：',
      `${NARRATION_UNIVERSAL_SCENE_PREFIX}，${NARRATION_UNIVERSAL_SCENE_BODY_EXAMPLE}，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
      `3) 【质感要求】须包含：${NARRATION_IMAGE_STYLE_CORE}，并写明无文字无水印`,
      `4) ${NARRATION_FIXTURES_LLM_RULE}`,
      '5) layout=single：单张完整场景插画。禁止 grid/collage/multi-panel/split screen/storyboard',
      `6) ${NARRATION_DIPPTYCH_SIX_PART_LLM_RULE}`,
      `7) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
      `8) ${NARRATION_MINIMAL_STAGE_FACE_RULE}`,
      `9) ${NARRATION_MINIMAL_NO_CLOTHING_LLM_RULE}`,
      '10) 【年代场景】可写时代氛围感（如八十年代市井），禁止写具体年份数字；禁止写实人脸',
      options?.hasCharacters
        ? '11) characters 的 life_stage 仅用于素体阶段体型约束，禁止写入服装发型五官'
        : '11) 无 characters 时【画面主体】仍须写黑色素体小人主人公',
      '12) 每条 prompt 只写当前配图段的一个场景；不要输出负面提示词',
      '只输出 JSON，不要解释。',
    ].filter(Boolean).join('\n')
  }
  return [
    ...shared,
    '硬性规则：',
    '1) 先读 full_narration 与 prior_narration，再写当前段画面',
    NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE,
    `2) 画风基调：${artStylePrompt(style, 'scene')}, 16:9 landscape, high quality, no text, no watermark`,
    '3) 六维标签用中文【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】',
    NARRATION_FIXTURES_LLM_RULE,
    NARRATION_DIPPTYCH_SIX_PART_LLM_RULE,
    '4) layout=single：单张完整场景插画。prompt 以 "single full illustration, one complete scene only" 开头，并写明 no grid, no collage, no multi-panel, no split screen',
    `5) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
    '6) 除 diptych 外，禁止 grid/panel/collage/strip/storyboard 等词',
    options?.hasCharacters
      ? '7) 若段落涉及已知角色，prompt 中写出其外貌特征并保持与角色设定一致'
      : '',
    '8) 【质感要求】须写明画风质感与禁止项（no text, no watermark）',
    '只输出 JSON，不要解释。',
  ].filter(Boolean).join('\n')
}

/** 组装「配图换镜检测」LLM system prompt（与万能模板配套：判定每句是否开新图） */
export function buildNarrationImageDetectLLMSystem(
  style?: string | null,
  _mode: 'paragraph' | 'conservative' | 'balanced' = 'paragraph',
): string {
  const minimal = isNarrationMinimalStyle(style)

  const detectRules = [
    '换镜判定（needs_image）：',
    '1) 通读 full_narration，结合 narration_lines 判断每句是否适合作为新配图起点',
    '2) 全集正文分镜约 30% 需要配图（系统会按你的优先级选取，请标出相对更需要画面的句子）',
    '3) needs_image=true：场景/地点/经营阶段切换、新动作、新物件、新互动、叙事节拍转折、空行分段后的新瞬间',
    '4) needs_image=false：同场景内画面可完全复用上一张、无新可视信息',
    '5) 纯日期/季节/时段句 → needs_image=false；正文首句若非纯日期句 → needs_image=true',
    '6) needs_image=true 的句子将作为新配图段起点，后续按万能模板生成单张 16:9 场景插画',
  ]

  const templateContext = minimal
    ? [
      '后续每张新图将严格使用以下万能模板（你只需判定换镜点，不必输出 prompt）：',
      `${NARRATION_UNIVERSAL_SCENE_PREFIX}，${NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE}，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
      `画风固定：${NARRATION_IMAGE_STYLE_CORE}`,
      NARRATION_PROTAGONIST_PLOT_LLM_RULE,
      NARRATION_CROWD_PLOT_LLM_RULE,
      NARRATION_BODY_CONSISTENCY_LLM_RULE,
      NARRATION_FIXTURES_LLM_RULE,
      NARRATION_DIPPTYCH_SIX_PART_LLM_RULE,
    ]
    : [
      '后续每张新图将按项目画风生成单场景插画（你只需判定换镜点，不必输出 prompt）：',
      `画风：${artStylePrompt(style, 'scene')}, 16:9 landscape, single full illustration`,
    ]

  return [
    '你是影视解说分镜导演。根据整集旁白剧情，自由判断每一句是否需要配一张**新插图**（needs_image）。',
    '分析流程（每条都必须执行）：',
    ...NARRATION_LLM_ANALYSIS_STEPS,
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    ...detectRules,
    ...templateContext,
    '输出要求：只输出 JSON { "needs_image": boolean[] }，长度与 sentences 相同，不要解释。',
  ].filter(Boolean).join('\n')
}

/** 组装「片头标题图」LLM system prompt */
export function buildNarrationTitleImagePromptLLMSystem(style?: string | null): string {
  if (isNarrationMinimalStyle(style)) {
    return [
      '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的中文 image_prompt。',
      NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
      `硬性规则：`,
      `1) 画风固定关键词（必含）：${NARRATION_IMAGE_STYLE_CORE}`,
      '2) 严格按此万能模板输出完整 prompt：',
      `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【片头背景场景：具体地点与环境】，【主题氛围：与全文主线对应的叙事氛围】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
      `3) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
      '4) 禁止写年代/年份和具体服装描述；禁止在画面中出现任何文字',
      '只输出 JSON，不要解释。',
    ].join('\n')
  }
  return [
    '你是影视解说分镜美术指导，根据整集解说全文为片头标题图写 AI 文生图用的 image_prompt。',
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_TITLE_IMAGE_LLM_RULE,
    `画风：${artStylePrompt(style, 'title')}, 16:9 landscape, high quality, absolutely no text, no watermark`,
    '只输出 JSON，不要解释。',
  ].join('\n')
}

/** 组装「场景段落」LLM system prompt（非拆镜段落流程） */
export function buildNarrationSceneSegmentsImagePromptLLMSystem(style?: string | null): string {
  return [
    '你是影视解说分镜美术指导，根据每段旁白场景写出用于 AI 文生图的「单场景画面描述」。',
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_PLOT_CONTINUITY_LLM_RULE,
    NARRATION_SCENE_PLOT_QUALITY_LLM_RULE,
    NARRATION_FIXTURES_LLM_RULE,
    '规则：',
    '1) 先通读 full_narration，再写每段画面；综合该段全部旁白句子，提炼地点、人物、动作与氛围',
    '2) 每条 prompt 描述一个完整场景的主画面，适合单张插画；物件/品类须与全文前文一致',
    `3) ${artStylePrompt(style, 'scene')}，电影感构图，无文字无水印`,
    '4) 不要出现 grid、panel、宫格、分格、collage、split、strip 等词',
    '5) 用中文描述画面内容，可夹杂少量英文风格词',
    '只输出 JSON，不要解释。',
  ].join('\n')
}

/** 解说视频模式：负面提示词 */
export const NARRATION_IMAGE_NEGATIVE_PROMPT =
  '复杂五官、写实人脸、鼻子嘴巴、无眼睛、空白脸、无五官、面部皱纹、厚涂肌理、3D 建模、渐变光影、复杂纹理、半写实、人物穿衣服、人物穿鞋戴帽、服装细节、角色穿西装革履、角色穿花衬衫、角色穿喇叭裤、角色穿T恤衬衫裤子裙子、角色戴墨镜太阳镜、角色具体服装款式、有服装的素体、穿着描述、复古滤镜、像素风、杂乱背景、写实路人、不同画风角色、正常比例人体、头身比失调、长短腿、四肢粗细不一、身高参差不齐、体型不一'

export const ART_STYLES = [
  {
    value: 'short-drama',
    label: '短剧动漫（正常比例）',
    description: '抖音剧/解说常用，正常头身比、细线稿、柔和赛璐璐，类似剧本人性',
  },
  {
    value: NARRATION_MINIMAL_STYLE,
    label: '解说素体（极简叙事）',
    description: '主人公黑色素体、群众白色素体，简笔三头身，黑白区分，低饱和平涂',
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
    scene: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    diptych: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，单张横向两宫格，【左格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，【右格】【画面主体】，【年代场景】，【核心细节动作】，【光影色调】，【镜头视角】，【质感要求】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    title: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【片头背景场景】，【主题氛围】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    portrait: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【场景：浅灰纯色背景，单人全身${NARRATION_PROTAGONIST_BODY}定妆参考图】，【剧情：${NARRATION_PROTAGONIST_EYES}，人生阶段与动作姿态】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    agent: NARRATION_IMAGE_STYLE_CORE,
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
  if (STYLE_PROMPTS[key]) return key
  return DEFAULT_ART_STYLE
}

export function artStyleLabel(style?: string | null): string {
  const key = normalizeArtStyle(style)
  return ART_STYLES.find(item => item.value === key)?.label || key
}

export function artStylePrompt(style?: string | null, context: ArtStyleContext = 'scene'): string {
  const key = normalizeArtStyle(style)
  return STYLE_PROMPTS[key]?.[context] || STYLE_PROMPTS[DEFAULT_ART_STYLE][context]
}

export function isNarrationMinimalStyle(style?: string | null): boolean {
  return normalizeArtStyle(style) === NARRATION_MINIMAL_STYLE
}

export const SCENE_STYLE_GUARD = [
  'CRITICAL ART STYLE: Chinese short-drama 2D anime scene illustration',
  'thin clean line art, flat soft cel shading, normal body proportions',
  'FORBIDDEN: semi-realistic, digital painting, painterly, manhua concept art, soft gradient shading, thick outlines, photorealistic',
  'FORBIDDEN: pixel art, retro filter, film grain, romantic wallpaper, bishounen bishoujo poster',
].join(', ')

const NARRATION_PROMPT_BOILERPLATE_PARTS = [
  '16:9 横屏', '16:9横屏', '2D 扁平简笔画', '2D 扁平化卡通', '2D 扁平化卡通动画', '2D扁平化卡通动画',
  NARRATION_PROTAGONIST_BODY, NARRATION_CROWD_BODY, '白色圆头素体小人', '白色圆头无脸素体小人',
  NARRATION_PROTAGONIST_EYES, NARRATION_CROWD_EYES, NARRATION_MINIMAL_EYES, '两个小黑点眼睛', '两个白色小圆点眼睛',
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
  if (/素体小人|黑色素体小人|白色素体小人|两个小黑点|两个白色小圆点/.test(t)) {
    const stripped = t.replace(/素体小人|几位白色素体小人|几位素体小人|黑色素体小人|白色素体小人|白色圆头|青年期|中年期|老年期|小孩期/g, '').trim()
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
  { re: /摆地摊|摆摊|夜市/, action: '黑色素体小人在摊位前整理陈列货物', priority: 10, sceneTags: ['market'] },
  { re: /生意|卖光|卖完|赶时髦|出售|卖出|热卖/, action: '黑色素体小人向几位白色素体小人展示货物并交易', priority: 10, sceneTags: ['market'] },
  { re: /年轻人|顾客|客人|来买|挑选/, action: '黑色素体小人在摊位前忙碌，几位白色素体小人围在摊位前挑选货物', priority: 9, sceneTags: ['market'] },
  { re: /批发|进货|批了/, action: '黑色素体小人在市场通道搬运整理成箱货物', priority: 9, sceneTags: ['market', 'wholesale'] },
  { re: /固定摊位|越干越有劲/, action: '黑色素体小人整理固定摊位上的陈列货物', priority: 9, sceneTags: ['market'] },
  { re: /门面|服装店|开店/, action: '黑色素体小人站在店铺门口招呼几位白色素体小人进店', priority: 9, sceneTags: ['shop'] },
  { re: /辞|离开/, action: '黑色素体小人离开供销社门口', priority: 10, sceneTags: ['supply'] },
  { re: /供销社/, action: '黑色素体小人在供销社门口或营业大厅内站立行走', priority: 7, sceneTags: ['supply'] },
  { re: /手推车|板车|独轮车/, action: '黑色素体小人推着手推车运送货物', priority: 9, sceneTags: ['transport'] },
  { re: /二八杠|自行车/, action: '黑色素体小人推着二八杠自行车轮廓前行', priority: 9, sceneTags: ['transport'] },
  { re: /推.*车/, action: '黑色素体小人推着二八杠自行车轮廓前行', priority: 6, sceneTags: ['transport'] },
  { re: /扇.*扇|蒲扇|乘凉|小凳/, action: '黑色素体小人坐在门口小凳上扇蒲扇', priority: 9 },
  { re: /疯|议论|说我/, action: '黑色素体小人在摊位前独自忙碌，周围几位白色素体小人围观交谈', priority: 7, sceneTags: ['market'] },
  { re: /万元户/, action: '黑色素体小人站在店铺前，周围几位白色素体小人围观', priority: 8, sceneTags: ['shop'] },
  { re: /赚钱|收入|越多|利润/, action: '黑色素体小人手持简化账本查看收入', priority: 7, sceneTags: ['market', 'shop'] },
  { re: /彩色电视|彩电|固定电话|串门|看电视/, action: '黑色素体小人与几位白色素体小人坐在客厅沙发前看电视', priority: 9, sceneTags: ['home'] },
  { re: /提亲|娶了|婚礼|十里八乡/, action: '黑色素体小人与几位白色素体小人在婚礼喜庆简化场景中互动', priority: 9, sceneTags: ['home'] },
  { re: /雇了|店员|喝茶|收收钱/, action: '黑色素体小人坐在店铺内喝茶，几位白色素体小人在柜台前忙碌', priority: 8, sceneTags: ['shop'] },
  { re: /皮鞋|箱包/, action: '黑色素体小人在店铺货架前整理皮鞋与箱包', priority: 8, sceneTags: ['shop'] },
  { re: /风光|九十年代|开了两家/, action: '黑色素体小人站在店铺门口与几位白色素体小人交谈', priority: 8, sceneTags: ['shop'] },
  { re: /网购|客人.*少|生意.*不行|卖不出去|砸在手里/, action: '黑色素体小人独自在店铺内整理滞销服装', priority: 9, sceneTags: ['shop'] },
  { re: /连锁|批发市场越来越多/, action: '黑色素体小人望着街对面新开连锁服装店', priority: 8, sceneTags: ['shop', 'street'] },
  { re: /下岗|投奔/, action: '几位白色素体小人站在店铺门口与素体小人交谈', priority: 7, sceneTags: ['shop'] },
  { re: /杂货|油盐|酱醋|日用品|微薄的利润/, action: '黑色素体小人在杂货铺柜台前整理油盐酱醋日用品', priority: 9, sceneTags: ['grocery'] },
  { re: /时代|浪潮|风口|裸泳|本事大|变迁|平淡如水|起起落落/, action: '黑色素体小人独自坐在门口小凳上望向远方街景', priority: 4, fallback: true },
  { re: /铁饭碗|个体户|投机/, action: '黑色素体小人独自经营小摊忙碌', priority: 6, sceneTags: ['market'] },
  { re: /心里有数|敢闯|改革|踏实/, action: '黑色素体小人在摊前从容应对，继续向围观的白色素体小人招揽', priority: 3, sceneTags: ['market'], fallback: true },
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
      return '黑色素体小人离开供销社门口'
    }
    if (/供销社/.test(narr)) {
      return '黑色素体小人在供销社门口或营业大厅内站立行走'
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

/** 将剧情中的群众/路人描述统一为白色素体小人，主人公保持黑色素体 */
export function normalizeMinimalCrowdInPlot(plot?: string | null): string {
  let text = String(plot || '').trim()
  if (!text) return ''
  const prot = NARRATION_PROTAGONIST_BODY
  const crowd = NARRATION_CROWD_BODY
  const PROT = '\uE000P'

  text = text
    .replace(/(小孩|青年|中年|老年)期?黑色素体小人/g, `$1期${PROT}`)
    .replace(/黑色素体小人/g, PROT)
    .replace(/(小孩|青年|中年|老年)期素体小人/g, `$1期${PROT}`)

  const crowdReplacements: Array<[RegExp, string]> = [
    [/几位白色素体小人/g, `几位${crowd}`],
    [/几位素体小人/g, `几位${crowd}`],
    [/围观的白色素体小人/g, `围观的${crowd}`],
    [/围观的素体小人/g, `围观的${crowd}`],
    [/周围几位白色素体小人/g, `周围几位${crowd}`],
    [/周围几位素体小人/g, `周围几位${crowd}`],
    [/与几位白色素体小人/g, `与几位${crowd}`],
    [/与几位素体小人/g, `与几位${crowd}`],
    [/向几位白色素体小人/g, `向几位${crowd}`],
    [/向几位素体小人/g, `向几位${crowd}`],
    [/几位年轻人/g, `几位${crowd}`],
    [/年轻人围/g, `几位${crowd}围`],
    [/与年轻人/g, `与几位${crowd}`],
    [/向顾客/g, `向几位${crowd}`],
    [/几位顾客/g, `几位${crowd}`],
    [/顾客围/g, `几位${crowd}围`],
    [/周围多人/g, `周围几位${crowd}`],
    [/路人匆匆/g, `几位${crowd}匆匆`],
    [/行人匆匆/g, `几位${crowd}匆匆路过`],
    [/围观群众/g, `围观的几位${crowd}`],
    [/围观者/g, `围观的${crowd}`],
    [/路人/g, `${crowd}路人`],
    [/招揽顾客/g, `向围观的${crowd}招揽`],
    [/进店客人/g, `几位${crowd}进店`],
  ]
  for (const [pattern, replacement] of crowdReplacements) {
    text = text.replace(pattern, replacement)
  }

  text = text
    .replace(/素体小人主人公/g, `${prot}主人公`)
    .replace(/(?<!黑色素体)(?<!白色)素体小人/g, prot)
    .replace(new RegExp(PROT, 'g'), prot)

  return text
    .replace(new RegExp(`${crowd}${crowd}`, 'g'), crowd)
    .replace(new RegExp(`${prot}${prot}`, 'g'), prot)
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
  if (/素体小人|黑色素体小人|白色素体小人|白色圆头/.test(plotPart)) {
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
    NARRATION_UNIVERSAL_SCENE_PREFIX,
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
  const stageMatch = text.match(/(小孩|青年|中年|老年)期?(?:黑色素体|白色素体)?小人/)
  if (stageMatch) return `${stageMatch[0]}与同框${NARRATION_CROWD_BODY}`
  if (/黑色素体小人|白色素体小人|素体小人/.test(text)) {
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
    NARRATION_UNIVERSAL_SCENE_PREFIX,
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
    NARRATION_UNIVERSAL_SCENE_PREFIX,
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

const SCENE_PROMPT_REPLACEMENTS: Array<[RegExp, string]> = [
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
  [/\bwearing\s+[^,，;；]+/gi, ''],
  [/\bin\s+[a-z\s]+(?:dress|shirt|pants|suit|uniform|outfit|clothing|coat|jacket)\b/gi, ''],
  [/\boutfit\b/gi, ''],
  [/\b(?:same|matching)\s+(?:face|outfit)\b/gi, ''],
  [/\b(?:detailed|specific)\s+(?:clothing|costume|apparel)\b/gi, ''],
  [/[，,]?[^，,；;]*(?:穿着|身着|衣着|穿搭)[^，,；;]*/g, ''],
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
  [/floral\s+shirt|bell-bottom|leather\s+shoes?|business\s+suit|wedding\s+dress/gi, ''],
  [/西装|革履|皮鞋|灰布衣服|中山装|唐装|婚纱|喜字|横幅|霓虹/g, ''],
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
  [/表情[^，,；;]*/g, ''],
  [/[，,]?[^，,。【]{0,12}(?:穿着|身着|身穿|穿戴|戴着)[^，,。【]{0,24}/g, ''],
  [/(?:主人公|素体小人|黑色素体小人|白色素体小人)[^，,。]{0,8}(?:穿|戴)(?:着)?[^，,。]{0,20}/g, ''],
  [/[，,]?[^，,。【]*(?:一件|套|身)[^，,。【]{0,8}(?:T恤|衬衫|衣|裤|裙|外套|鞋|帽|制服|工装)/g, ''],
  [/[，,]?[^，,。【]*(?:T恤|花衬衫|喇叭裤|西装革履|中山装|唐装|旗袍|汉服|围裙|背心|短裤|牛仔裤|运动服|校服|护士服|羽绒服|夹克|皮鞋|球鞋|围巾|帽子)/g, ''],
  [/微笑|皱纹|头发花白|无脸|无五官/g, ''],
  [/beautiful\s+face|wrinkled\s+face|receding\s+hairline|detailed\s+face|realistic\s+face/gi, ''],
  [/面容姣好|五官分明|五官轮廓|皱纹|发际线|花白头发|头发花白|小胡子|络腮胡|美人脸|写实五官|复杂五官/g, ''],
  [/gray\s+hair|white\s+hair|wrinkles?/gi, ''],
  [/slicked-back|wavy\s+hair|messy\s+short\s+hair/gi, ''],
]

/** 清洗场景/片头配图 prompt：去掉会把模型带偏的复古/浪漫/抽象装饰词 */
export function sanitizeSceneImagePrompt(prompt?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''
  for (const [pattern, replacement] of SCENE_PROMPT_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  return tidyAppearancePunctuation(text)
}

/** 解说素体模式：按人生阶段给出仅动作/姿态的定妆提示（中文） */
export function buildMinimalPortraitPostureHint(variantLabel?: string | null): string {
  const eyes = NARRATION_PROTAGONIST_EYES
  const body = NARRATION_PROTAGONIST_BODY
  const label = String(variantLabel || '').trim()
  const size = NARRATION_MINIMAL_BODY_SIZE_SPEC
  if (/童年|幼年|孩童|儿时|幼|小孩/.test(label)) {
    return `${body}，${eyes}，无服装，比青年小一号约2.2头高，站立，简单活泼姿态`
  }
  if (/青年|少年|年轻/.test(label)) {
    return `${body}，${eyes}，无服装，${size}，三头高标准身形，站立或行走，可持简单道具轮廓`
  }
  if (/中年/.test(label)) {
    return `${body}，${eyes}，无服装，三头高躯干略宽微胖，坐或站放松姿态，可手持茶杯轮廓`
  }
  if (/老年|晚年|垂暮|苍老|年迈/.test(label)) {
    return `${body}，${eyes}，无服装，总高约2.8头高略佝偻，圆头两侧各几条简化白发弧线，坐于凳上，可手持圆扇轮廓`
  }
  return `${body}，${eyes}，无服装，${size}，中性站立姿态`
}

/** 配图/定妆：素体模式强制使用阶段约束（黑色素体主人公），忽略写实/旧白色外貌 */
export function coerceMinimalCharacterAppearance(
  variantLabel?: string | null,
  appearance?: string | null,
): string {
  const hint = buildMinimalPortraitPostureHint(variantLabel)
  const raw = String(appearance || '').trim()
  if (!raw) return hint
  if (/wrinkl|beautiful\s+face|五官|皱纹|发际线|花白|胡子|comic画风|English tags/i.test(raw)) return hint
  if (/黑色素体小人/.test(raw) && /两个白色小圆点|白点眼睛/.test(raw) && !/写实|皱纹|面容|五官分明|白色素体/.test(raw)) {
    return sanitizeCharacterAppearance(raw).slice(0, 120) || hint
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

/** 是否为六维（或两宫格六维）AI 配图 prompt */
export function isStoredNarrationImagePromptComplete(raw?: string | null): boolean {
  const text = String(raw || '').trim()
  if (!text) return false
  if (/【(年代场景|画面主体|核心细节动作)[：:]/.test(text)) return true
  return /【左格[：:]/.test(text) && /【(画面主体|年代场景)[：:]/.test(text)
}

/** 纯 AI 模式下是否应原样保留 prompt（不做规则改写或角色补全） */
export function shouldPreserveRawNarrationPrompt(raw?: string | null): boolean {
  return NARRATION_USE_RAW_LLM_PROMPTS && !!String(raw || '').trim()
}

/** 配图 prompt 统一出口：素体模式强制黑白主人公约束 */
export function resolveNarrationImagePrompt(
  prompt?: string | null,
  style?: string | null,
  _options?: FinalizeNarrationPromptOptions,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return ''
  if (isNarrationMinimalStyle(style)) return coerceMinimalLLMImagePrompt(raw)
  return raw
}

/** 配图/定妆：素体 prompt 强制补全无服装约束并清洗穿着描述 */
export function applyMinimalNoClothingGuard(prompt?: string | null): string {
  let text = sanitizeSceneImagePrompt(String(prompt || '').trim())
  if (!text) return ''
  if (!/无服装|无任何服装|全身无服装/.test(text)) {
    if (/【质感要求[：:]/.test(text)) {
      text = text.replace(
        /【质感要求[：:]([^】]*)】/,
        (_, body) => `【质感要求：${String(body).replace(/[，,]+$/g, '').trim()}，${NARRATION_MINIMAL_NO_CLOTHING_RULE}】`,
      )
    } else {
      text = `${text}，${NARRATION_MINIMAL_NO_CLOTHING_RULE}`
    }
  }
  return tidyAppearancePunctuation(text)
}

/** 将 LLM/旧库中的素体配图 prompt 强制对齐黑白主人公约束 */
export function coerceMinimalLLMImagePrompt(prompt?: string | null): string {
  let text = String(prompt || '').trim()
  if (!text) return ''

  const alreadyCoerced = /黑色素体小人/.test(text)
    && !/白色圆头素体小人|白色黑色素体|黑色黑色素体|期素体小人|素体小人主人公/.test(text)

  if (!alreadyCoerced) {
    text = text
      .replace(/几位白色黑色素体小人白色黑色素体小人/g, `几位${NARRATION_CROWD_BODY}`)
      .replace(/白色黑色素体小人/g, NARRATION_CROWD_BODY)
      .replace(/黑色黑色素体小人/g, NARRATION_PROTAGONIST_BODY)

    const bracketStart = text.search(/【(?:画面主体|年代场景|片头|左格|主题氛围)/)
    if (bracketStart > 0) {
      text = `${NARRATION_UNIVERSAL_SCENE_PREFIX}，${text.slice(bracketStart)}`
    } else if (/^16:9\s*横屏/.test(text)) {
      const sceneSplit = text.match(/总高约三个头高[，,]\s*/)
      if (sceneSplit?.index != null) {
        const bodyStart = sceneSplit.index + sceneSplit[0].length
        text = `${NARRATION_UNIVERSAL_SCENE_PREFIX}，${text.slice(bodyStart)}`
      }
    }

    text = text.replace(/【([^：:【]+)[：:]([^】]*)】/g, (_, label, body) => {
      const trimmedLabel = String(label).trim()
      let next = normalizeMinimalCrowdInPlot(String(body).trim())
      if (trimmedLabel === '质感要求') {
        next = NARRATION_MINIMAL_TEXTURE_PROMPT
      }
      return `【${trimmedLabel}：${next}】`
    })

    if (!/【/.test(text)) {
      text = text
        .replace(/白色圆头素体小人/g, NARRATION_PROTAGONIST_BODY)
        .replace(/两个小黑点眼睛/g, NARRATION_PROTAGONIST_EYES)
      text = normalizeMinimalCrowdInPlot(text)
    }

    text = text
      .replace(/极简叙事动画风格/g, '极简简笔叙事风格')
      .replace(/画中所有人物均为同款素体造型与统一身形[，,]?/g, '')
      .replace(/全片统一素体尺寸，圆头直径约占全身高度三分之一[^，【]*总高约三个头高[，,]?/g, '')
      .replace(/2D\s*扁平化卡通/g, '2D扁平简笔画')
  }

  return applyMinimalNoClothingGuard(text)
}

/** LLM 返回的配图 prompt：素体模式强制黑白主人公约束，其余画风原样 */
export function resolveLLMImagePrompt(
  prompt?: string | null,
  style?: string | null,
  _options?: FinalizeNarrationPromptOptions,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return ''
  if (isNarrationMinimalStyle(style)) return coerceMinimalLLMImagePrompt(raw)
  return raw
}
