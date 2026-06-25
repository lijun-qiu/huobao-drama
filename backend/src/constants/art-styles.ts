export type ArtStyleContext = 'scene' | 'diptych' | 'title' | 'portrait' | 'agent'

export const DEFAULT_ART_STYLE = 'short-drama'

/** 解说素体极简叙事画风（项目级视觉风格 value） */
export const NARRATION_MINIMAL_STYLE = 'narration-minimal'

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

/** 主人公与配角视觉区分（同白色素体，靠构图/服装/焦点区分） */
export const NARRATION_PROTAGONIST_DISTINCT_LLM_RULE =
  '【主人公鲜明】全画面仅 1 位主人公须是视觉焦点：写清「一位X期主人公位于画面中心或前景」，服装款式与主色须具体鲜明（如亮花衬衫+喇叭裤、醒目围裙、特色帽饰）；配角写「几位配角在两侧/背景/后方」，服装用低饱和简化便装（灰蓝/深绿/素色块），表情与动作从简；禁止主人公与配角服装款式主色相同；禁止多位人物都像主角一样居中抢镜'

/** 素体人物须穿与年代剧情一致的简化服装轮廓（简笔色块，非写实） */
export const NARRATION_MINIMAL_CLOTHING_LLM_RULE =
  '【服装】主人公须写具体鲜明的简化服装款式与主色（简笔色块）；配角写笼统低饱和便装轮廓，与主人公形成对比；均须与年代、职业、场景匹配，禁止写实布料褶皱与复杂印花；服装写入【画面主体】'

/** @deprecated 使用 NARRATION_MINIMAL_CLOTHING_LLM_RULE */
export const NARRATION_MINIMAL_NO_CLOTHING_RULE = NARRATION_MINIMAL_CLOTHING_LLM_RULE

/** 写入 LLM 硬性规则的服装与六维分工 */
export const NARRATION_MINIMAL_NO_CLOTHING_LLM_RULE = NARRATION_MINIMAL_CLOTHING_LLM_RULE

/** 素体四肢：仅两手两脚 */
export const NARRATION_MINIMAL_LIMBS_SPEC = '简笔四肢仅两手两脚，等粗黑线轮廓'

/** 解说素体通用尺寸（全片统一简笔比例，仅人生阶段微调） */
export const NARRATION_MINIMAL_BODY_SIZE_SPEC =
  `圆头约占身高三分之一，简笔躯干与圆头相当，${NARRATION_MINIMAL_LIMBS_SPEC}，青年标准站姿总高约三个头高`

/** 写入 prompt 的完整身形约束（含全片统一） */
export const NARRATION_BODY_CONSISTENCY_CORE =
  `全片统一简笔素体比例，${NARRATION_MINIMAL_BODY_SIZE_SPEC}`

/** 各人生阶段相对青年尺寸的微调（主人公与配角均为白色素体，仅体型与发型差异） */
export const NARRATION_BODY_STAGE_SIZE_HINTS =
  '小孩比青年小一号约2.2头高；青年严格三头高圆头无头发；中年三头高躯干略宽微胖仍无头发；老年略佝偻约2.8头高，仅老年期圆头两侧可有若干条简化白发弧线'

/** LLM：人生阶段发型与体型（多主人公同框须统一遵守） */
export const NARRATION_STAGE_HAIR_LLM_RULE =
  '【阶段发型】青年期与中年期主人公均无头发（圆头无发丝）；中年期在青年三头身基础上躯干略宽略胖；仅老年期可有简化白发弧线；多主人公同框须同阶段、同发型规则，禁止一人有发一人无发或青年配中年'

/** LLM：同框多主人公（夫妻/父子/母子等）须人生阶段与画风统一 */
export const NARRATION_DUAL_PROTAGONIST_LLM_RULE =
  '【多主人公例外】旁白明确同框且同为叙事主角（夫妻、父子、母子、兄妹等）时，【画面主体】可写「两位X期主人公」或「一位X期主人公与一位X期配偶/父亲/母亲/儿子/女儿主人公」，须同处一个人生阶段（同青年/同中年/同老年），两位须同为白色素体、同款简笔比例与发型规则、均写正常卡通脸（圆眼或弯眼带高光），仅通过性别/简化服装/构图区分；禁止把路人或群众写成第二位主人公'

/** LLM：群众配角面部（非背面须小眼睛） */
export const NARRATION_CROWD_EYE_LLM_RULE =
  '【配角眼型】路人/顾客/群众配角正面或侧面出镜时须写「两个小圆点眼（小眼睛）」，简笔眉嘴从简；仅背面或远背影时可不写眼；主人公仍用正常卡通脸（圆眼或弯眼带高光），禁止配角也用大圆眼抢戏'

/** 素体人生阶段 + 统一白色形体（写入 LLM 与清洗规则） */
export const NARRATION_MINIMAL_STAGE_FACE_RULE =
  `【形体统一】主人公与配角均为${NARRATION_CROWD_BODY}白色素体身形（${NARRATION_MINIMAL_LIMBS_SPEC}）；须用构图与服装鲜明区分：默认仅 1 位「一位X期主人公」为画面焦点；夫妻/父子/母子等同框双主角时见【多主人公例外】；配角为「几位背景配角」；禁止写黑色素体；${NARRATION_STAGE_HAIR_LLM_RULE}；主人公写正常卡通脸，配角正面写小圆点眼`

/** LLM 配图：唯一主人公 + 黑白素体规格（合并原 PROTAGONIST_PLOT / SINGLE_PROTAGONIST / STAGE_FACE） */
export const NARRATION_PROTAGONIST_UNIFIED_LLM_RULE =
  `【唯一主人公】每张配图（含 diptych 每格）全画面仅 1 位主人公（${NARRATION_PROTAGONIST_FACE}，${NARRATION_MINIMAL_LIMBS_SPEC}），须居中或前景、服装鲜明、动作清晰；其余为几位配角在两侧或背景；${NARRATION_PROTAGONIST_DISTINCT_LLM_RULE}；${NARRATION_MINIMAL_STAGE_FACE_RULE}`

/** LLM 配图：年代氛围与服装（统一标准） */
export const NARRATION_ERA_CLOTHING_LLM_RULE =
  '【年代与着装】年代氛围写「八十年代市井」「九十年代城镇」等概括词，禁止具体年份数字（1980、1990、19XX）及 vintage/retro/复古滤镜；【画面主体】须写主人公与可见配角的年代化简化服装；【年代场景】写地点环境与陈设道具'

/** 解说配图万能模板：固定前缀 */
export const NARRATION_UNIVERSAL_SCENE_PREFIX =
  `16:9 横屏，2D 扁平插画，全员${NARRATION_CROWD_BODY}简笔身形纯色平涂无复杂光影（${NARRATION_CROWD_FACE}），黑色轮廓线，${NARRATION_BODY_CONSISTENCY_CORE}`

/** 解说配图万能模板：固定后缀 */
export const NARRATION_UNIVERSAL_SCENE_SUFFIX =
  '柔和平涂，温馨叙事插画感，干净整洁的画面，无文字无水印'

/** 解说视频模式：核心画风固定关键词（LLM 参考用） */
export const NARRATION_IMAGE_STYLE_CORE =
  `全员${NARRATION_CROWD_BODY}（${NARRATION_CROWD_FACE}）、黑色轮廓线、纯色平涂、${NARRATION_BODY_CONSISTENCY_CORE}、温馨叙事插画风格、${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 群众/路人/顾客：白色素体，与主人公同款身形 */
export const NARRATION_CROWD_STYLE_HINT =
  `顾客、路人、群众等配角一律写成「几位${NARRATION_CROWD_BODY}配角」置于两侧或背景，简化低饱和便装，不得与主人公抢焦点；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** 解说配图六维结构（LLM 与规则兜底共用） */
export const NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE =
  '每条 image_prompt 必须按以下六维顺序撰写（【】标签必填）：【画面主体】→【年代场景】→【核心细节动作】→【光影色调】→【镜头视角】→【质感要求】；以 narration_lines 为段内锚点，须结合 full_narration 与 prior_narration 丰富场景、陈设、动作与情绪，禁止照抄旁白原文或只写空泛场所'

/** 解说配图万能模板：六维正文 */
export const NARRATION_UNIVERSAL_SCENE_BODY_TEMPLATE =
  '【画面主体：一位主人公位于画面中心或前景（人生阶段+鲜明简化服装+正常卡通脸表情），几位配角在两侧或背景（低饱和简化便装）】，【年代场景：时代氛围、具体地点环境；有载体时写「载体+陈列物件名」】，【核心细节动作：主人公关键动作与表情清晰，配角陪衬互动】，【光影色调：光线明暗、时段、冷暖与剧情情绪氛围】，【镜头视角：景别与机位，镜头朝向主人公】，【质感要求：画风线条涂色与画面禁忌】'

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

/** LLM 配图：六维去冗余（前缀/后缀已含固定画风） */
export const NARRATION_LLM_ANTI_REDUNDANCY_RULE =
  '【去冗余】前缀与后缀已含固定画风与无文字无水印；六维各维只写本镜独有信息；禁止在任一维度重复前缀已有的「16:9/2D扁平插画/素体小人/三头身/正常卡通脸/无复杂光影」等短语；同一关键词全文最多出现一次；禁止在末尾再追加第二遍画风说明'

/** LLM 配图：每张仅一位主人公 */
export const NARRATION_SINGLE_PROTAGONIST_LLM_RULE = NARRATION_PROTAGONIST_UNIFIED_LLM_RULE

/** LLM：主人公须入画且画风一致（写入【画面主体】【核心细节动作】） */
export const NARRATION_PROTAGONIST_PLOT_LLM_RULE = NARRATION_PROTAGONIST_UNIFIED_LLM_RULE

/** LLM：素体须符合通用尺寸规格，仅人生阶段微调 */
export const NARRATION_BODY_CONSISTENCY_LLM_RULE =
  `【通用素体尺寸】【画面主体】须标明人生阶段（小孩/青年/中年/老年）；三头身等通用规格由前缀承担，【质感要求】不必重复；阶段微调：${NARRATION_BODY_STAGE_SIZE_HINTS}；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`

/** LLM 写配图 prompt：光影色调须贴合全文剧情（写入【光影色调】） */
export const NARRATION_ATMOSPHERE_LLM_RULE =
  '【光影色调】结合 full_narration、prior_narration 与 narration_lines 写光线明暗、时段、冷暖、人气喧闹或寂静、经营旺衰等可见基调（2–4个短语）；须与【年代场景】【核心细节动作】及全文情绪曲线一致；只写可见光影与色调，不写内心独白'

/** LLM：群众/路人须为白色素体配角 */
export const NARRATION_CROWD_PLOT_LLM_RULE =
  `【配角一致】顾客、路人、群众一律写成「几位${NARRATION_CROWD_BODY}配角」在两侧或背景（两个小圆点眼小眼睛，${NARRATION_MINIMAL_LIMBS_SPEC}），低饱和简化便装，动作从简，不得与主人公服装主色相同；${NARRATION_CROWD_EYE_LLM_RULE}；${NARRATION_MINIMAL_STYLE_FORBIDDEN}`
export const NARRATION_VEHICLE_LLM_RULE =
  '交通工具须严格按旁白写：自行车/二八杠≠手推车/板车；旁白写自行车或二八杠时写「推着自行车」或「二八杠自行车轮廓」，禁止写成手推车；旁白写手推车/板车时才写手推车；旁白未提及任何车辆时禁止臆造推车或自行车'

/** LLM 素体配图：剧情写可见动作与情绪氛围 */
export const NARRATION_MINIMAL_PLOT_VISIBILITY_LLM_RULE =
  '【核心细节动作】主人公动作与表情须清晰具体；【配角】只做陪衬动作；须与【画面主体】焦点一致；禁止内心独白与抽象说理'

/** 配图换镜检测：needs_image=true 的锚点数量占镜头数的比例下限（LLM 硬性约束） */
export const NARRATION_IMAGE_DETECT_MIN_STORYBOARD_RATIO = 0.25

/** 配图换镜检测：needs_image=true 的锚点数量占镜头数的比例上限 */
export const NARRATION_IMAGE_DETECT_MAX_STORYBOARD_RATIO = 0.35

/** 每张配图覆盖的镜头数下限（含锚点镜） */
export const NARRATION_IMAGE_SEGMENT_MIN_SHOTS = 2

/** 每张配图覆盖的镜头数上限（含锚点镜） */
export const NARRATION_IMAGE_SEGMENT_MAX_SHOTS = 4

/** 配图换镜检测：超过该镜头数时默认分批调用 LLM（0=不分批） */
export const NARRATION_IMAGE_DETECT_BATCH_THRESHOLD_DEFAULT = 100

/** 配图换镜检测：分批时每批覆盖的镜头数上限 */
export const NARRATION_IMAGE_DETECT_BATCH_SIZE_DEFAULT = 50

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
  '1) 通读 full_narration（及 previous_episode_narration 若有），把握全文主线、人物关系、地点变迁、核心物件与情绪节奏',
  '2) 读 prior_narration 与 characters，提取已出现地点、陈设载体、具体物件名、服装款式与人生阶段',
  '3) 读 narration_lines 确定本配图段叙事锚点；再从全文推断应入画的环境细节、陈设道具、可见动作与氛围',
  '4) 按六维写出丰富 prompt：【年代场景】写具体场所+载体陈设，【核心细节动作】写可见互动，【光影色调】贴合全文情绪；禁止只贴段内字面',
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

/** @deprecated 使用 NARRATION_FIXTURES_LLM_RULE */
export const NARRATION_FIXTURES_CONTINUITY_LLM_RULE = NARRATION_FIXTURES_LLM_RULE

/** 六维正文填表示例（硬性规则用，模型须替换为旁白真实内容） */
export const NARRATION_UNIVERSAL_SCENE_BODY_EXAMPLE =
  `【画面主体：一位青年期白色素体小人主人公位于画面中心前景（${NARRATION_MINIMAL_LIMBS_SPEC}，正常卡通脸热情微笑，身穿亮花衬衫与喇叭裤鲜明简笔轮廓）与三位白色素体小人配角分列两侧背景（穿灰蓝低饱和市井便装，表情从简）】，【年代场景：八十年代市井夜市，木质摊位上陈列花衬衫与喇叭裤与成捆布料】，【核心细节动作：主人公站在摊位前伸手整理花衬衫面向镜头，配角在两侧挑选货物】，【光影色调：暖黄夜市灯光，喧闹市井人气】，【镜头视角：中景平视，镜头朝向主人公，主体清晰】，【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}】`

/** LLM 配图正反例（素体模式） */
export const NARRATION_LLM_PROMPT_GOOD_BAD_EXAMPLES = [
  '正反例（须从旁白提取真实内容，勿照抄）：',
  `✓ 【画面主体：青年期${NARRATION_PROTAGONIST_BODY}主人公穿花衬衫喇叭裤简笔轮廓…】，【年代场景：…】，【核心细节动作：…】，【光影色调：…】`,
  `✓ 【画面主体：两位中年期${NARRATION_PROTAGONIST_BODY}主人公（圆头无头发、躯干略宽，正常卡通脸）并肩位于前景…】（夫妻/父子等同框双主角须同阶段同发型）`,
  '✗ 【画面主体：仅写素体小人无服装】（须写与年代匹配的简化服装）',
  '✗ 【质感要求：2D扁平插画，主人公白色素体…】（禁止复述前缀画风）',
  '✗ 只写 narration_lines 首句字面，场景空泛、无具体陈设与动作（须结合全文丰富环境/物件/互动）',
  '✗ 段内句子很短就只写一句抽象话，忽略 prior/全文已交代的地点、道具与经营细节',
  '✗ 主人公与配角服装主色相同、都居中、难以分辨谁是主角',
  '✗ 夫妻同框却一青年一中年，或中年主人公写白发（青年/中年均无头发，仅老年可有白发）',
  '✗ 群众配角正面出镜却写圆眼大卡通脸（配角正面须小圆点眼）',
].join('\n')

/** 两宫格六维输出格式（layout=diptych） */
export const NARRATION_DIPPTYCH_SIX_PART_LLM_RULE =
  `layout=diptych：单张 16:9 横向两宫格；左、右格各写完整六维，格式为【左格】【画面主体：…】，【年代场景：…】，【核心细节动作：…】，【光影色调：…】，【镜头视角：…】，【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}】，【右格】【画面主体：…】…【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}】；禁止旧式【左格场景与剧情】；各格【质感要求】禁止复述前缀画风；每一格全画面仅 1 位${NARRATION_PROTAGONIST_BODY}主人公（${NARRATION_MINIMAL_LIMBS_SPEC}）`

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
  `prior 已交代物件 + narration_lines 描述场所活动 →【画面主体：一位${NARRATION_PROTAGONIST_BODY}主人公与配角】，【年代场景：时代+地点+载体上陈列的具体物件名】，【核心细节动作：可见动作】，【光影色调：光线色调】，【镜头视角：景别机位】，【质感要求：${NARRATION_MINIMAL_TEXTURE_LLM_HINT}，不重复前缀画风】`

/** LLM 写片头标题图 prompt 时的规则（通用） */
export const NARRATION_TITLE_IMAGE_LLM_RULE =
  `片头标题图须综合 full_narration 全文，提炼最能概括本期核心的【片头背景场景】与【主题氛围】；绝对无文字；背景若出现人物，全画面仅 1 位${NARRATION_PROTAGONIST_BODY}主人公（${NARRATION_PROTAGONIST_EYES}，${NARRATION_MINIMAL_LIMBS_SPEC}），其余为${NARRATION_CROWD_BODY}或无人`

/** LLM 多集连贯：上集旁白作为上下文，索引仍只针对本集 */
export const NARRATION_PREVIOUS_EPISODE_LLM_RULE =
  '若输入含 previous_episode_narration（上集正文旁白，按时间顺序），须先通读以理解人物、地点与剧情延续；full_narration 仅含本集旁白；needs_image / start_index 均只针对本集 sentences；prior_narration = previous_episode_narration + 本集锚点之前旁白'

/** 组装「段落配图」LLM system prompt（素体 / 其他画风） */
export function buildNarrationParagraphImagePromptLLMSystem(
  style?: string | null,
  options?: { hasCharacters?: boolean; hasDiptych?: boolean },
): string {
  const minimal = isNarrationMinimalStyle(style)
  const violenceRule = `${NARRATION_VIOLENCE_CONTENT_LLM_RULE}；${NARRATION_VIOLENCE_NO_FRAGMENT_LLM_RULE}`

  const shared = [
    `你是影视解说分镜美术指导。拆镜结构已由规则确定，根据整集旁白与全文剧情为每个配图段写${minimal ? '中文' : ''} image_prompt，须丰富场景、陈设与动作，不单贴当前段落字面。`,
    '分析流程：',
    ...NARRATION_LLM_ANALYSIS_STEPS_PROMPT,
    NARRATION_FULL_CONTEXT_ANALYSIS_LLM_RULE,
    NARRATION_FULL_PLOT_ENRICHMENT_LLM_RULE,
    NARRATION_PREVIOUS_EPISODE_LLM_RULE,
    NARRATION_PARAGRAPH_FULL_COVERAGE_LLM_RULE,
    NARRATION_PLOT_CONTINUITY_LLM_RULE,
    NARRATION_IMAGE_PROMPT_SIX_PART_LLM_RULE,
    NARRATION_FIXTURES_LLM_RULE,
    NARRATION_ATMOSPHERE_LLM_RULE,
    NARRATION_SCENE_PLOT_QUALITY_LLM_RULE,
    NARRATION_ERA_CLOTHING_LLM_RULE,
    minimal ? NARRATION_MINIMAL_EXPRESSION_LLM_RULE : '',
    minimal ? NARRATION_PROTAGONIST_DISTINCT_LLM_RULE : '',
    minimal ? NARRATION_MINIMAL_CLOTHING_LLM_RULE : '',
    violenceRule,
    NARRATION_VEHICLE_LLM_RULE,
    minimal ? NARRATION_MINIMAL_PLOT_VISIBILITY_LLM_RULE : '',
    minimal ? NARRATION_PROTAGONIST_UNIFIED_LLM_RULE : '',
    minimal ? NARRATION_DUAL_PROTAGONIST_LLM_RULE : '',
    minimal ? NARRATION_STAGE_HAIR_LLM_RULE : '',
    minimal ? NARRATION_CROWD_EYE_LLM_RULE : '',
    minimal ? NARRATION_CROWD_PLOT_LLM_RULE : '',
    minimal ? NARRATION_LLM_PROMPT_GOOD_BAD_EXAMPLES : '',
    '片头/标题句作为普通配图段处理，与其它旁白同样写六维 prompt，禁止使用单独的【片头背景场景】【主题氛围】格式',
  ].filter(Boolean)

  if (minimal) {
    const hardRules = [
      '硬性规则：',
      `1) 结构：${NARRATION_UNIVERSAL_SCENE_PREFIX} + 六维 + ${NARRATION_UNIVERSAL_SCENE_SUFFIX}；画风仅在前缀/后缀各写一次`,
      `2) 示例：${NARRATION_UNIVERSAL_SCENE_PREFIX}，${NARRATION_UNIVERSAL_SCENE_BODY_EXAMPLE}，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
      `3) 【质感要求】仅写「${NARRATION_MINIMAL_TEXTURE_LLM_HINT}」；${NARRATION_LLM_ANTI_REDUNDANCY_RULE}`,
      '4) layout=single：单张完整场景，禁止 grid/collage/multi-panel/split/storyboard',
      options?.hasDiptych ? `5) ${NARRATION_DIPPTYCH_SIX_PART_LLM_RULE}` : '',
      options?.hasCharacters
        ? 'characters 提供人生阶段与外貌；【画面主体】须写一位主人公居中前景+鲜明服装，配角在两侧背景且服装从简'
        : '无 characters 时【画面主体】仍须写一位主人公居中前景（阶段+鲜明简化服装），配角不得抢镜',
      '每条 prompt 须以 narration_lines 为锚点、结合 full_narration 与 prior_narration 丰富场景/陈设/动作；不要输出负面提示词',
    ].filter(Boolean)
    return [...shared, ...hardRules, '只输出 JSON，不要解释。'].join('\n')
  }

  const hardRules = [
    '硬性规则：',
    `1) 画风：${artStylePrompt(style, 'scene')}, 16:9 landscape, high quality, no text, no watermark`,
    '2) 六维标签：【画面主体】【年代场景】【核心细节动作】【光影色调】【镜头视角】【质感要求】',
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
      `1) 结构：${NARRATION_UNIVERSAL_SCENE_PREFIX} + 【片头背景场景】+【主题氛围】+ ${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
      `2) ${NARRATION_TITLE_IMAGE_LLM_RULE}`,
      `3) ${NARRATION_LLM_ANTI_REDUNDANCY_RULE}`,
      '只输出 JSON，不要解释。',
    ].join('\n')
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
    const stripped = t.replace(/素体小人|几位白色素体小人|几位素体小人|白色素体小人主人公|白色素体小人|白色圆头|青年期|中年期|老年期|小孩期/g, '').trim()
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

/** 将剧情中的群众/路人统一为几位白色素体配角，主人公保留「主人公」标记 */
export function normalizeMinimalCrowdInPlot(plot?: string | null): string {
  let text = String(plot || '').trim()
  if (!text) return ''
  const body = NARRATION_CROWD_BODY
  const PROT = '\uE000P'

  text = text
    .replace(/黑色素体小人/g, body)
    .replace(/(小孩|青年|中年|老年)期?白色素体小人主人公/g, `$1期${PROT}主人公`)
    .replace(/白色素体小人主人公/g, `${PROT}主人公`)
    .replace(/(小孩|青年|中年|老年)期?素体小人主人公/g, `$1期${PROT}主人公`)

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
  const size = NARRATION_MINIMAL_BODY_SIZE_SPEC
  if (/童年|幼年|孩童|儿时|幼|小孩/.test(label)) {
    return `${body}主人公，${face}，开心微笑，简化童装轮廓，比青年小一号约2.2头高，站立，简单活泼姿态`
  }
  if (/青年|少年|年轻/.test(label)) {
    return `${body}主人公，${face}，自信微笑，简化年代服装轮廓，${size}，三头高标准身形，站立或行走，可持简单道具轮廓`
  }
  if (/中年/.test(label)) {
    return `${body}主人公，${face}，沉稳表情，简化中年便装轮廓，三头高躯干略宽微胖，坐或站放松姿态，可手持茶杯轮廓`
  }
  if (/老年|晚年|垂暮|苍老|年迈/.test(label)) {
    return `${body}主人公，${face}，慈祥微笑，简化老年便装轮廓，总高约2.8头高略佝偻，圆头两侧各几条简化白发弧线，坐于凳上，可手持圆扇轮廓`
  }
  return `${body}主人公，${face}，中性表情，简化服装轮廓，${size}，中性站立姿态`
}

/** 配图/定妆：素体模式强制使用白色素体阶段约束 */
export function coerceMinimalCharacterAppearance(
  variantLabel?: string | null,
  appearance?: string | null,
): string {
  const hint = buildMinimalPortraitPostureHint(variantLabel)
  const raw = String(appearance || '').trim()
  if (!raw) return hint
  if (/comic画风|English tags/i.test(raw)) return hint
  if (/白色素体小人/.test(raw) && /正常卡通脸|眉眼|微笑|表情|腮红/.test(raw)) {
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
  return hasNarrationSixDimStructure(String(raw || '').trim())
}

/** 万能模板六维标签（与 assembleNarrationUniversalScenePrompt 一致） */
export const NARRATION_SIX_DIM_LABELS = [
  '画面主体',
  '年代场景',
  '核心细节动作',
  '光影色调',
  '镜头视角',
  '质感要求',
] as const

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

/** 是否具备万能模板要求的六维（或两宫格六维）结构 */
export function hasNarrationSixDimStructure(text: string): boolean {
  const raw = String(text || '').trim()
  if (!raw) return false

  const hasAllLabels = (chunk: string) => NARRATION_SIX_DIM_LABELS.every(
    label => new RegExp(`【${label}[：:]`).test(chunk),
  )

  if (hasAllLabels(raw)) return true
  if (/【左格】/.test(raw) && /【右格】/.test(raw)) {
    const [left = '', right = ''] = raw.split(/【右格】/)
    return hasAllLabels(left) && hasAllLabels(right)
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

/** 【画面主体】主人公不够鲜明（缺焦点位置或与配角难区分） */
export function hasNarrationProtagonistDistinctIssue(text: string): boolean {
  const subjects = extractNarrationPromptBracketContents(text, '画面主体')
  if (!subjects.length) return false
  for (const subject of subjects) {
    if (!/主人公/.test(subject)) return true
    const hasCrowd = /几位|配角|路人|顾客|群众/.test(subject)
    if (!hasCrowd) continue
    const hasFocus = /中心|前景|焦点|居中|画面主/.test(subject)
    const hasCrowdPlacement = /两侧|背景|后方|陪衬|从简/.test(subject)
    if (!hasFocus || !hasCrowdPlacement) return true
  }
  return false
}

/** 【画面主体】出现多位主人公 */
export function hasNarrationMultipleProtagonistIssue(text: string): boolean {
  for (const subject of extractNarrationPromptBracketContents(text, '画面主体')) {
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

/** 前缀是否与万能模板一致 */
export function hasNarrationUniversalPrefixIssue(text: string): boolean {
  const bodyStart = text.search(/【(?:画面主体|年代场景|片头背景场景|左格)/)
  const prefix = bodyStart > 0 ? text.slice(0, bodyStart).replace(/[，,]+$/g, '') : ''
  if (!prefix) return true
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
  const text = String(prompt || '').trim()
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
      { title: true },
    )
  }

  const subject = sanitizeNarrationSixDimBracket('画面主体', parts.subject)
  const scene = sanitizeNarrationSixDimBracket('年代场景', parts.scene)
  const plot = sanitizeNarrationSixDimBracket('核心细节动作', parts.plot)
  const atmosphere = sanitizeNarrationSixDimBracket('光影色调', parts.atmosphere)
  const camera = sanitizeNarrationSixDimBracket('镜头视角', parts.camera) || NARRATION_DEFAULT_CAMERA_PROMPT
  const texture = sanitizeNarrationSixDimBracket('质感要求', parts.texture)

  return assembleNarrationUniversalScenePrompt(scene, plot, {
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

/** 将 LLM/旧库中的素体配图 prompt 对齐万能模板（前缀 + 六维 + 后缀） */
export function coerceMinimalLLMImagePrompt(prompt?: string | null): string {
  return normalizeMinimalPromptByTemplate(prompt)
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
