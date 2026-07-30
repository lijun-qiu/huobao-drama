/** 解说动漫 / 漫画解说 / 简体素人共用：16:9 正面半身定妆参考（脸+上半身占满，供配图锁脸，勿全身竖条） */

export const THREE_VIEW_PORTRAIT_SIZE = '768x1344'

export const THREE_VIEW_PORTRAIT_SCENE_CN =
  '纯白色背景，竖幅正面半身定妆参考图，清晰展示脸型五官、发型与上半身服装，人物占满画面，左右只留窄白边，无环境无场景元素'

/** 简体素人 · 正面半身场景维 */
export const THREE_VIEW_PORTRAIT_SCENE_MINIMAL_CN =
  '纯白色背景，竖幅正面半身素体小人定妆参考图，清晰展示正常卡通脸与上半身体型，人物占满画面，左右只留窄白边，无环境无场景元素'

/** 定妆参考图硬性构图（提取/生图/入库共用）——竖幅半身占满，与配图锁脸一致 */
export const PORTRAIT_REFERENCE_IMAGE_LAYOUT_CN =
  '竖幅纯白色背景，单张正面半身定妆（头到胸口/腰际），人物面向镜头，脸与上半身清晰且占满画面，左右只留窄白边；禁止横屏左右大片留白、禁止中间竖条小人、禁止全身小全身、禁止三视图'

/** 定妆 appearance 末尾须带的站姿锚点（半身锁脸） */
export const PORTRAIT_FULL_BODY_STANDING_CN =
  '正面半身标准站姿，头到胸口完整入镜，竖幅人物占满画面，左右边距尽量窄，双手自然垂于身侧，不拿任何道具或物品'

/** 定妆：双手自然下垂，禁止手持道具（道具在分镜配图文案中写） */
export const THREE_VIEW_EMPTY_HANDS_CN = PORTRAIT_FULL_BODY_STANDING_CN

export const THREE_VIEW_EMPTY_HANDS_EN =
  'neutral upper-body pose, chest-up framing, arms at sides, empty hands, NO handheld objects, NO props in hands'

/** 解说 · 动漫风格默认剧情维 */
export const THREE_VIEW_PORTRAIT_PLOT_ANIME_CN =
  '具体脸型五官与发型按角色外貌描述，正常头身比，正面半身站姿，上半身服装与标志配饰（非手持物）清晰可见，双手自然垂于身侧不拿道具'

/** 漫画解说默认剧情维 */
export const THREE_VIEW_PORTRAIT_PLOT_MOTION_COMIC_CN =
  '具体脸型五官与发型按角色外貌描述，正常头身比，正面半身站姿，上半身服装与标志配饰（非手持物）清晰可见，双手自然垂于身侧不拿道具'

/** 简体素人默认剧情维 */
export const THREE_VIEW_PORTRAIT_PLOT_MINIMAL_CN =
  '白色素体小人，正常卡通脸圆眼带高光，正面半身站姿，简化年代服装简笔轮廓，上半身体型清晰可见，双手自然垂于身侧不拿道具'

export const THREE_VIEW_PORTRAIT_FRAMING =
  'vertical portrait single front upper-body character reference on pure white background, chest-up framing, one character only, facing camera, neutral pose, arms at sides empty hands, follow appearance face hair and upper outfit exactly, distinct face and silhouette, natural dark iris white sclera catchlights, subject fills most of frame with only narrow side margins, NOT landscape with large empty side margins, NOT tiny centered vertical strip, NOT full-body tiny figure, NOT turnaround sheet, NOT multiple views, NOT side view, NOT back view, NOT character lineup'

export const THREE_VIEW_PORTRAIT_FRAMING_MINIMAL =
  'vertical portrait single front upper-body stick figure reference on pure white background, chest-up framing, one character only, facing camera, white stick figure with normal cartoon face round eyes with highlights, simplified upper clothing outline visible, arms at sides empty hands, subject fills most of frame with only narrow side margins, NOT landscape with large empty side margins, NOT tiny centered vertical strip, NOT full-body tiny figure, NOT turnaround sheet, NOT multiple views, NOT gray background, NOT detailed anime face, NOT realistic portrait, NOT holding objects'

/** 定妆 plot：去掉手持/道具描述，并补全双手自然下垂 */
export function sanitizePortraitPlotForThreeView(text: string): string {
  let s = String(text || '').trim()
  if (!s) return THREE_VIEW_EMPTY_HANDS_CN
  s = s
    .replace(/[，,；;]?[^，,；;]*(?:手持|握着|拿着|可持|可手|持简单道具|持[\u4e00-\u9fff]{0,8}轮廓|背书包|茶杯|圆扇|槟榔|道具轮廓)[^，,；;]*/g, '')
    .replace(/三视图|turnaround|侧面|背面|side view|back view/gi, '正面半身')
    .replace(/[，,；;]?[^，,；;]*(?:同一人|对照[^，,；;]{0,20}(?:青年|少年|童年|定妆)|与(?:青年|少年|童年)(?:时期|阶段)?[^，,；;]{0,24}|自然\s*ag(?:ing)?)[^，,；;]*/gi, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^[，,]+|[，,]+$/g, '')
    .trim()
  if (!/双手|垂于身侧|不拿|半身|胸口|入镜/.test(s)) {
    s = s ? `${s}，${THREE_VIEW_EMPTY_HANDS_CN}` : THREE_VIEW_EMPTY_HANDS_CN
  }
  return s
}

/** 定妆外貌入库/生图前：去掉三视图、跨阶段对照等易诱发「双人/多视角」的表述 */
export function sanitizePortraitAppearanceForGeneration(text: string): string {
  let s = String(text || '').trim()
  if (!s) return s
  const tagsMatch = s.match(/\bEnglish tags:\s*(.+)$/im)
  let body = tagsMatch && tagsMatch.index != null ? s.slice(0, tagsMatch.index).trim() : s
  let tags = tagsMatch?.[1]?.trim() || ''

  body = sanitizePortraitExpressionText(
    sanitizePortraitEyeColorText(sanitizePortraitPlotForThreeView(body)),
  )
    .replace(/三视图标准站立/g, '正面半身标准站姿')
    .replace(/正面全身标准站立/g, '正面半身标准站姿')
    .replace(/动漫三视图定妆参考图[^】]*/g, '')
    .replace(/从头顶到脚|双脚完整入镜|双脚与鞋子|全身竖条/g, '头到胸口完整入镜')
    .replace(/大头照|头像照|仅面部|大腿以上|截断腿脚/g, '正面半身')
    .trim()

  if (body && !/面无表情|中性冷静|neutral face/i.test(body)) {
    body = `${body}，${PORTRAIT_NEUTRAL_FACE_CN}`
  }

  if (body && !/竖幅|16:9\s*横屏/.test(body)) {
    // 漫画解说定妆用深色戏剧光，勿默认塞纯白棚光
    const darkPortrait = /深色冷调|半脸深阴影|短剧解说高清国漫|深藏青|#0f172a|身份锁脸/.test(body)
    body = darkPortrait ? `竖幅正面半身，${body}` : `竖幅纯白色背景，${body}`
  }
  // 深色定妆：清掉白棚残留
  if (/深色冷调|半脸深阴影|短剧解说高清国漫|深藏青|#0f172a/.test(body)) {
    body = body
      .replace(/竖幅纯白色背景/g, '竖幅正面半身')
      .replace(/纯白色背景/g, '深藏青冷调背景')
      .replace(/左右只留窄白边/g, '左右边距尽量窄')
      .replace(/窄白边/g, '窄边距')
      .replace(/白底均匀柔光/g, '冷蓝戏剧侧光')
  }
  if (body && !/头到胸口|正面半身/.test(body)) {
    body = body
      .replace(/[，,；;]?\s*(?:正面(?:全身|半身)标准站(?:立|姿)|三视图(?:标准)?站立)[^，,；;]*$/u, '')
      .replace(/[，,；;]?\s*双手自然(?:垂于身侧|下垂)[^，,；;]*$/u, '')
      .replace(/[，,]+$/g, '')
      .trim()
    body = `${body}，${PORTRAIT_FULL_BODY_STANDING_CN}`
  }

  if (tags) {
    tags = sanitizePortraitExpressionText(sanitizePortraitEyeColorText(tags))
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !/same character as youth|youth reference|young and old|age comparison|turnaround|multiple views|character lineup/i.test(t))
      .join(', ')
  }

  if (!body) return tags ? `English tags: ${tags}` : ''
  return tags ? `${body}\nEnglish tags: ${tags}` : body
}

/** 检测 English tags 是否与中文定妆规格一一对应（过短/缺项视为不完整） */
export function isIncompletePortraitEnglishTags(cnBody: string, enTags: string): boolean {
  const body = String(cnBody || '').trim()
  const tags = String(enTags || '').trim()
  if (!body) return !tags
  if (!tags) return true

  const tagItems = tags.split(',').map(t => t.trim()).filter(Boolean)
  if (tagItems.length < 8) return true
  if (tags.length < Math.min(120, body.length * 0.22)) return true

  const checks: Array<[RegExp, RegExp]> = [
    [/脸型|下颌|鹅蛋|棱角|面相/, /face|jaw|chin|cheek/i],
    [/眉/, /brow/i],
    [/眼/, /eye/i],
    [/发|刘海/, /hair/i],
    [/头身|肩|四肢|身形|体型/, /body|proportion|shoulder|limb|build/i],
    [/穿|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/, /shirt|pants|sweater|dress|outfit|uniform|jeans|knit|cardigan|wear|#|jacket|apron|coat/i],
    [/16:9|横屏|白底|纯白|深藏青|#0f172a|深色冷调/, /16:9|widescreen|white background|dark|navy|#0f172a/i],
    [/半身|胸口|入镜|站姿/, /upper.?body|chest.?up|bust|standing|pose|neutral face|no expression/i],
  ]
  let missing = 0
  for (const [cnRe, enRe] of checks) {
    if (cnRe.test(body) && !enRe.test(tags)) missing++
  }
  return missing >= 2
}

/** 配图文案：characters 须对照定妆参考（脸型/发型以定妆图锁定，文案不重写） */
export const NARRATION_PORTRAIT_REFERENCE_LLM_RULE =
  '【定妆对照·硬性】characters 含 portrait_label、gender、has_portrait、portrait_default_outfit（定妆默认服装，仅无剧情换装时 fallback）；appearance_identity_spec_cn 仅供查阅、禁止写入文案；has_portrait=true 时【画面主体】结构固定为：对照定妆「portrait_label」（只写本镜细化表情，禁止写脸型/发型/发色/眉形/身形等固定外貌）位于{位置}以{姿态}（身穿#hex本镜服装）；**每镜仅 1 个对照定妆**，画面只允许这一名人物入镜；禁止第二人脸/身/手/臂/背影/侧影或画外伸手；互动只写焦点本人肢体与手持物（勿用对方接物的手反转施受）；「对照定妆」标签必须与本镜焦点角色一致（段落含 required_portrait_labels 时必须采用该项；禁止用主人公/第一人称标签顶替本段点名的其他角色）；禁止串用他人标签或写「对照定妆标签「xxx」」；脸型与发型固定参照定妆图不变；表情写在【画面主体】，肢体动作写在【核心细节动作】，物件写在【年代场景】，镜头朝向须使姿态+动作+关键物件同帧可见；本镜服装+#hex只写在位于…以…之后的（身穿…）内；场所/职业/时段变化时须换装（办公室正装、居家便装、外出外套等），勿每镜都照抄同一套定妆毛衣；仅当旁白完全未暗示换装且场所连续时才可用 portrait_default_outfit；无定妆时须写性别；手持物只写在【核心细节动作】'

/** 分镜配图：定妆锁脸 + 服装可变（写入 output_format） */
export const PORTRAIT_STORYBOARD_OUTFIT_LLM_RULE =
  '【定妆锁脸·硬性】有定妆时禁止在【画面主体】写脸型/发型/发色/眉形/身形；只写对照定妆标签+本镜细化表情；服装款式与 #hex 写在「位于…以…姿态」之后的（身穿#hex…）中，须按本段旁白与场所换装（办公室/居家/外出/就寝各写对应服装），禁止每段都照抄 portrait_default_outfit 或同一套毛衣；同一配图段内（身穿…）须一致'

/** 定妆：禁止表情/神情（表情只写在分镜配图【画面主体】） */
export const PORTRAIT_NEUTRAL_EXPRESSION_LLM_RULE =
  '【定妆表情·硬性】定妆 appearance 只写静态外貌身份（脸型/眉形/眼型虹膜/发型/身形/服装/配饰）+正面半身中性站姿；必须面无表情、中性冷静；禁止任何表情/神情/情绪/微表情/眉眼动态（如微笑、疲惫、憔悴、严肃、冷淡、皱眉、紧锁、倒八字眉、含泪、瞪眼、嘴角、焦虑、震惊、松弛无力感、血丝等）；English tags 禁止 smile/smiling/tired/weary/angry/frowning/crying/expressive/mature expression/bloodshot 等；分镜配图再写本镜表情'

/** 定妆中性脸正向锚点（写入 appearance / 生图） */
export const PORTRAIT_NEUTRAL_FACE_CN = '面无表情，中性冷静'

/** 定妆负向表情（Qwen 等生图用） */
export const PORTRAIT_EXPRESSION_NEGATIVE_CN =
  '微笑，笑容，疲惫，憔悴，严肃，冷淡，皱眉，紧锁，倒八字眉，含泪，瞪眼，张嘴，愤怒，焦虑，震惊，表情夸张，血丝，smiling，tired expression，weary，angry，frowning，crying，bloodshot'

/** 定妆眼色：干净眼白，禁止血丝/通红（血丝易诱发疲惫感） */
export const PORTRAIT_EYE_COLOR_LLM_RULE =
  '【定妆眼色·硬性】虹膜写自然色（黑/深褐/灰褐等）+瞳孔高光，眼白为干净正常白色；禁止血丝、红瞳、整眼鲜红、虹膜通红、血红双眼、solid/glowing/crimson red eyes、demon eyes、bloodshot；English tags 用 natural dark iris, white sclera，禁止 red eyes / crimson eyes / bloodshot'

/** Qwen 定妆正向眼色锚点（中文） */
export const PORTRAIT_EYE_COLOR_POSITIVE_CN =
  '虹膜为自然深褐或黑色，眼白干净正常白色带瞳孔高光；禁止血丝、整眼鲜红、红瞳、虹膜通红'

/** Qwen 定妆负向眼色（中文） */
export const PORTRAIT_EYE_COLOR_NEGATIVE_CN =
  '红瞳，整眼鲜红，虹膜通红，血红双眼，赤瞳，眼睛全红，solid red eyes，glowing red eyes，crimson eyes'

/** Qwen 定妆质量负向：压重影/双轮廓/脸扭曲/速度线/抠图白边 */
export const QWEN_PORTRAIT_QUALITY_NEGATIVE_CN = [
  '重影',
  '双轮廓',
  '双重轮廓',
  '叠影',
  '残影',
  '模糊',
  '低质量',
  '脸部扭曲',
  '五官不对称',
  '眼睛大小不一',
  '畸形手指',
  '多余手指',
  '漫画速度线',
  '放射线',
  '动作线',
  '背景线条',
  '全身小全身',
  '全身竖条',
  '中间竖条小人',
  '两侧大片白边',
  '左右大片留白',
  '人物过窄',
  '从头到脚全身',
  '大头照',
  '仅面部特写',
  '多人',
  '双人',
  '文字',
  '水印',
  '白边锯齿',
  '边缘光晕',
  '抠图痕迹',
  '透明边缘碎边',
  'jagged white fringe',
  'halo artifacts',
  'cutout fringe',
  'pixelated outline',
].join('，')

/**
 * 多角色定妆必须一眼可辨：禁止全员滑向同一套「棱角方正脸+细长眼+黑发+深灰外套」。
 * 用于提取/单人生成 appearance。
 */
export const PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE = [
  '【角色辨识·硬性】同集每个角色必须一眼可区分，禁止复用或微调同一套万能男模：棱角分明/俊朗棱角 + 方正下颌 + 细长深褐或丹凤眼 + 黑色中分/侧分短发或中长发/碎发 + 深蓝/深灰西装或夹克 + 银色耳钉。',
  '须在脸型（棱角/鹅蛋/国字/长脸/圆脸）、眉形（剑眉/浓眉/细眉/一字眉）、眼型（细长/圆大/下垂/丹凤）、发型（短寸/碎发/中分/侧分/中长发/光头/卷烫）、发色、标志配饰（眼镜/疤痕/痣/耳钉/胡茬）、年龄段（青年/中年/老年）中至少换 3 项；服装主色 #hex 也须不同（禁止两人同用深蓝夹克 #1e40af/#2563eb 或同用深灰 #6a7c8f/#382f2e 系）。',
  '同性别多名角色（尤其两名青年男性）必须拉开：一方鹅蛋碎发圆眼 ↔ 另一方国字寸头浓眉，或一方中年皱纹花白 ↔ 另一方青年黑发；禁止全员黑碎发+蓝夹克青年脸。',
  '若提供了「同集其他角色」外貌，本角色必须刻意写成视觉对立，禁止在旧描述上小改几个字交差。',
  'English tags 须写出具体 face shape / eyebrows / eyes / hair / age / outfit color，禁止只写 handsome anime face / attractive face / angular jawline / messy black hair / blue jacket 万能词凑数。',
].join('')

/** 定妆视觉槽位：批量/撞脸重写时按角色分配，避免全员同一模板 */
export const PORTRAIT_SILHOUETTE_SLOTS = [
  '清秀鹅蛋脸 + 细眉 + 圆大深褐眼 + 黑色碎发刘海微遮额 + 非深蓝夹克主色（如#8B4513棕/#64748b灰蓝针织）+ 禁止耳钉',
  '国字方正脸 + 浓眉 + 细长眼 + 黑色短寸头无刘海 + 深色制服或工装（可#1e40af）+ 可有胡茬或眼镜 + 中年感优先',
  '瘦长冷脸 + 剑眉 + 细长眼 + 黑色中长发侧分或束发 + 长外套/风衣 + 可有细疤',
  '圆润脸 + 一字眉 + 下垂眼 + 微卷中分短发 + 浅色休闲装 + 可有痣',
  '宽颌厚实脸 + 浓眉 + 略圆眼 + 极短平头或光头 + 工装/制服色 + 禁止耳钉 + 偏中老年',
]

export function extractPortraitIdentityKeys(text: string): string[] {
  const t = String(text || '')
  const keys: string[] = []
  if (/鹅蛋|清秀/.test(t)) keys.push('oval')
  if (/国字|方正下颌|方正脸/.test(t)) keys.push('square')
  if (/棱角|俊朗棱角|棱角分明/.test(t)) keys.push('angular')
  if (/长脸|瘦长/.test(t)) keys.push('long')
  if (/圆脸|圆润脸/.test(t)) keys.push('round')
  if (/宽颌|厚实脸/.test(t)) keys.push('wide')
  if (/寸头|平头|buzz|光头/.test(t)) keys.push('buzz')
  if (/碎发|凌乱/.test(t)) keys.push('messy')
  if (/中分/.test(t)) keys.push('center')
  if (/侧分/.test(t)) keys.push('side')
  if (/中长发|长发|束发|肩/.test(t)) keys.push('longhair')
  if (/短发/.test(t) && !/中长|长发/.test(t)) keys.push('shorthair')
  if (/浓眉|剑眉/.test(t)) keys.push('thickbrow')
  if (/细眉|一字眉/.test(t)) keys.push('thinbrow')
  if (/圆大|大眼/.test(t)) keys.push('roundeye')
  if (/细长|丹凤/.test(t)) keys.push('narroweye')
  if (/耳钉|ear\s*stud/i.test(t)) keys.push('stud')
  if (/眼镜/.test(t) && !/无眼镜|不戴眼镜|没有眼镜|未戴眼镜/.test(t)) keys.push('glasses')
  if (/深灰|#6a7c8f|#382f2e|#334155|#475569|#1e293b/i.test(t)) keys.push('graycoat')
  if (/深蓝夹克|蓝色夹克|蓝夹克|#1e40af|#2563eb|#1d4ed8|#3b82f6/i.test(t)) keys.push('bluejacket')
  if (/(?:青年|20\s*岁|2[0-9]\s*岁|三十出头)/.test(t)) keys.push('young')
  if (/(?:中年|4[0-9]\s*岁|五十|40\s*岁|50\s*岁)/.test(t)) keys.push('midage')
  if (/(?:老年|花白|白发|60\s*岁|6[0-9]\s*岁|七十)/.test(t)) keys.push('elder')
  return [...new Set(keys)]
}

/** 与同集其他角色脸型+发型（或≥3项身份键）撞车则视为不够辨识 */
export function appearanceCollidesWithPeers(appearance: string, peerTexts: string[]): boolean {
  const mine = extractPortraitIdentityKeys(appearance)
  if (mine.length < 2 || !peerTexts.length) return false
  const faceKeys = new Set(['oval', 'square', 'angular', 'long', 'round', 'wide'])
  const hairKeys = new Set(['buzz', 'messy', 'center', 'side', 'longhair', 'shorthair'])
  const outfitKeys = new Set(['graycoat', 'bluejacket'])
  const mineSet = new Set(mine)
  for (const peer of peerTexts) {
    const theirs = extractPortraitIdentityKeys(peer)
    if (!theirs.length) continue
    const overlap = theirs.filter(k => mineSet.has(k))
    const faceHit = overlap.some(k => faceKeys.has(k))
    const hairHit = overlap.some(k => hairKeys.has(k))
    const outfitHit = overlap.some(k => outfitKeys.has(k))
    // 脸+发同 → 撞脸；脸+同色夹克 → 易克隆；蓝夹克+碎发同套 → 撞
    if (faceHit && hairHit) return true
    if (faceHit && outfitHit) return true
    if (overlap.includes('bluejacket') && overlap.includes('messy')) return true
    if (overlap.includes('young') && faceHit && (hairHit || outfitHit)) return true
    if (overlap.length >= 3) return true
  }
  return false
}

/**
 * 从定妆 appearance 抽出短辨识差（供配图文案写入对照定妆括号，防同框撞脸）。
 * 不含表情；约 12–32 字。
 */
export function extractPortraitDistinctCueCn(appearance?: string | null, maxLen = 32): string {
  const raw = String(appearance || '')
    .replace(/【画风规格[：:][^】]*】/g, '')
    .replace(/\bEnglish tags:[\s\S]*$/i, '')
    .replace(/\s+/g, '')
  if (!raw) return ''
  const parts: string[] = []
  const age = raw.match(/(约?\d{1,2}岁|青年男性|青年女性|中年男性|中年女性|老年男性|老年女性|少年)/)?.[0]
  if (age) parts.push(age)
  const face = raw.match(/(清秀鹅蛋脸|鹅蛋脸|国字方正脸|方正下颌|棱角分明[^，。]{0,6}脸|瘦长冷脸|圆润脸|宽颌厚实脸|长脸|圆脸|方脸|俊朗棱角脸)/)?.[0]
  if (face) parts.push(face)
  const browEye = [
    raw.match(/(剑眉|浓眉|细眉|一字眉)/)?.[0],
    raw.match(/(圆大深褐眼|细长眼|下垂眼|丹凤眼|大而清晰[^，。]{0,8}眼|细长深褐眼)/)?.[0],
  ].filter(Boolean).join('')
  if (browEye) parts.push(browEye)
  const hair = raw.match(/(黑色短寸头无刘海|黑色碎发刘海微遮额|黑色中长发侧分|黑色长发束冠|极短平头|光头|微卷中分短发|花白[^，。]{0,8}发|黑色[^，。]{0,14}(?:碎发|短发|长发|寸头|平头|中分|侧分|束发))/)?.[0]
  if (hair) parts.push(hair.slice(0, 16))
  let cue = [...new Set(parts)].join('·')
  if (!cue) {
    // 兜底：截取外貌前若干汉字（去掉画风）
    cue = raw.replace(/短剧解说|高清国漫|锋利细线|赛璐璐|冷蓝|戏剧光/g, '').slice(0, maxLen)
  }
  if (cue.length > maxLen) cue = cue.slice(0, maxLen)
  return cue
}

/** 按角色名稳定分配视觉槽位，拉开同集差异 */
export function resolvePortraitSilhouetteSlot(
  characterName: string,
  peerNames: string[] = [],
): { index: number; hint: string } {
  const names = [...new Set([characterName, ...peerNames].map(n => String(n || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
  let index = Math.max(0, names.indexOf(String(characterName || '').trim()))
  if (index < 0) index = 0
  index = index % PORTRAIT_SILHOUETTE_SLOTS.length
  return { index, hint: PORTRAIT_SILHOUETTE_SLOTS[index] }
}

/** 漫画解说定妆构图（深色身份锁脸，禁止白棚） */
export const MOTION_COMIC_PORTRAIT_REFERENCE_LAYOUT_CN =
  '竖幅深藏青冷调背景（#0f172a，禁止纯白棚光白底），单张正面半身身份锁脸定妆（头到胸口），人物面向镜头，脸与上半身清晰且占满画面，左右边距尽量窄；禁止白底设定表、禁止横屏大片留白、禁止全身小全身、禁止三视图'

/** 定妆 LLM 输出格式说明（与 appearance_spec_cn 对齐） */
export const PORTRAIT_APPEARANCE_SPEC_FORMAT_RULE = [
  `【定妆参考图构图·硬性】${PORTRAIT_REFERENCE_IMAGE_LAYOUT_CN}；appearance 正文末尾须含「${PORTRAIT_FULL_BODY_STANDING_CN}」`,
  '【定妆规格格式·硬性】必须写满以下可见项（中文 120–220 字 + English tags 12–20 项，英文须与中文一一对应、不得缩写），写入定妆 appearance 供锁脸；分镜配图文案不得重写脸型/发型：',
  '1) 性别+年龄或阶段；',
  '2) 脸型：具体脸型与下颌（如俊朗棱角脸型/清秀鹅蛋脸/方正下颌）；',
  '3) 眉眼：眉形+眼型+虹膜自然色（如剑眉+细长深褐眼带瞳孔高光/细眉+大而清晰的黑瞳眼眸）；眼白干净正常白色；禁止血丝/红瞳/整眼鲜红；禁止写表情神情；',
  '4) 发型：发色+长度+造型+刘海（如黑色略凌乱碎发、刘海微遮额，禁止只写「短发」）；',
  '5) 身形：头身比+肩宽/腰线/四肢比例（动漫写「正常头身比，肩宽适中，四肢修长匀称」；素体写具体躯干宽高）；',
  '6) #hex定妆默认服装（仅写入定妆照与 portrait_default_outfit，分镜身份括号不照抄此项）；7) 非手持标志配饰（眼镜/耳钉等）；8) 面无表情、中性冷静；',
  PORTRAIT_NEUTRAL_EXPRESSION_LLM_RULE,
  PORTRAIT_EYE_COLOR_LLM_RULE,
  PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
  '换行 English tags: 英文逗号分隔，须含 face shape/eyebrows/eyes/hair/body proportion/outfit 各项，并含 neutral face / no expression；禁止写 pure white background（漫画解说定妆用 deep navy dark background）；',
  '对比示例（勿全员抄同一套）：',
  'A 青年男主：清秀鹅蛋脸，细眉，圆大深褐眼，黑色碎发刘海微遮额，穿#2563eb蓝夹克。English tags: oval soft jawline anime face, thin eyebrows, large round dark-brown eyes, messy black bangs, blue jacket',
  'B 中年警官：国字方正脸，浓眉，细长眼，黑色短寸头无刘海，穿#1e40af深蓝制服。English tags: square jaw anime face, thick brows, narrow eyes, buzz cut no bangs, navy police uniform',
  'C 反派：瘦长冷脸，剑眉，细长冷目，黑色长发束冠，穿#1e293b深灰长袍。English tags: long lean cold face, sharp brows, narrow cold eyes, black long hair topknot, dark gray robe',
].join(' ')

/** 漫画解说定妆格式（深色底，替换白棚构图句） */
export const MOTION_COMIC_PORTRAIT_APPEARANCE_SPEC_FORMAT_RULE =
  PORTRAIT_APPEARANCE_SPEC_FORMAT_RULE.replace(
    PORTRAIT_REFERENCE_IMAGE_LAYOUT_CN,
    MOTION_COMIC_PORTRAIT_REFERENCE_LAYOUT_CN,
  ).replace(
    /pure white background/gi,
    'deep navy dark background #0f172a',
  )

/** 入库/生图前：去掉整眼通红与血丝（定妆要干净中性眼白） */
export function sanitizePortraitEyeColorText(text: string): string {
  let s = String(text || '')
  if (!s) return s
  s = s
    .replace(/(?:与|和|及|带|有)?(?:眼白)?(?:带|有)?(?:细微|轻微|少许)?血丝/g, '')
    .replace(/\bfine\s+bloodshot\s+veins?(?:\s+in\s+(?:the\s+)?sclera)?\b/gi, '')
    .replace(/\bbloodshot(?:\s+(?:eyes?|sclera|veins?))?\b/gi, '')
    .replace(/红瞳|赤瞳|血红双眼|双眼血红|整眼(?:通红|鲜红|发红)|虹膜(?:通红|鲜红|全红)|眼睛(?:通红|全红)|满眼(?:通红|鲜红)/g, '深褐虹膜')
    .replace(/[^，,；;]*?(?:红眼睛|红眼珠|血红的眼|鲜红的眼眸|通红的眼眸)[^，,；;]*/g, '深褐眼眸带瞳孔高光，眼白正常')
    .replace(/\b(solid\s+)?(glowing\s+)?(crimson|blood[- ]?red|demon(?:ic)?|fiery)\s+eyes?\b/gi, 'natural dark-brown iris, white sclera')
    .replace(/\bred\s+eyes?\b/gi, 'natural dark-brown eyes with white sclera')
    .replace(/\bentirely\s+red\s+(iris|sclera|eyes?)\b/gi, 'natural dark iris, white sclera')
    .replace(/\bcompletely\s+red\s+(iris|sclera|eyes?)\b/gi, 'natural dark iris, white sclera')
    .replace(/与及|和及|与和/g, '与')
    .replace(/高光与及/g, '高光与')
    .replace(/高光及/g, '高光与')
    .replace(/[，,]{2,}/g, '，')
    .replace(/,\s*,+/g, ', ')
    .trim()
  return s
}

/** 定妆 appearance：去掉表情/神情/情绪词（表情留给分镜配图） */
export function sanitizePortraitExpressionText(text: string): string {
  let s = String(text || '')
  if (!s) return s

  // 先保护中性脸锚点，避免被「表情」整句删除误伤
  const NEUTRAL_MARK = '<<PORTRAIT_NEUTRAL_FACE>>'
  s = s.replace(/面无表情(?:[，,]\s*中性冷静)?|中性冷静|\bneutral\s+face\b|\bno\s+expression\b/gi, NEUTRAL_MARK)

  // 整句/整分句以表情、神情、眉眼动态为主 → 整段删
  s = s
    .replace(/[，,；;]?[^，,；;]*?(?:表情|神情|微表情|情绪)[^，,；;]*/g, '')
    .replace(/[，,；;]?[^，,；;]*?(?:微笑|笑容|奸笑|冷笑|苦笑|傻笑|咧嘴|露齿)[^，,；;]*/g, '')
    .replace(/[，,；;]?[^，,；;]*?(?:含泪|泪光|抽噎|哭泣|哭腔|落泪|泪痕)[^，,；;]*/g, '')
    .replace(/[，,；;]?[^，,；;]*?(?:汗珠|冷汗|泛红|脸红|潮红)[^，,；;]*/g, '')
    .replace(/[，,；;]?[^，,；;]*?(?:紧锁|微皱|深锁|倒八字(?:状|眉)?|愁眉|横眉|扬眉|眉头紧|眉心皱)[^，,；;]*/g, '')
    .replace(/[，,；;]?[^，,；;]*?(?:嘴角(?:上扬|下垂|微扬)|抿嘴|抿紧|咬牙|咬唇|张嘴|微张)[^，,；;]*/g, '')
    .replace(/[，,；;]?[^，,；;]*?(?:瞪眼|眯眼|睁大(?:双眼|眼睛)?|斜视|飘忽|游移|凝视|望向|低垂|眼神)[^，,；;]*/g, '')

  // 嵌在外貌词前的情绪/状态形容词局部剥除（如「疲惫憔悴动漫脸型」→「动漫脸型」）
  s = s
    .replace(/大而灵动的/g, '大而清晰的')
    .replace(/(?:略显|略带|带着|透着|流露|带着一丝)?(?:疲惫|憔悴|熬夜感|困倦|无力|沮丧|落寞|紧张|焦虑|惊恐|惊慌|震惊|吃惊|惊讶|愤怒|恼怒|恼火|凶狠|阴沉|阴郁|严肃|冷淡|温和|平静|淡定|冷漠|傲慢|得意|兴奋|激动|害羞|腼腆|尴尬|松弛|萎靡|颓废|憔悴感|模糊)(?:的|地|感|状)?/g, '')
    .replace(/(?:下颌|下巴|面颊|面容|脸庞)?(?:线条)?(?:略显|略带)?(?:模糊)?松弛/g, '')
    .replace(/富有表现力的|极具表现力的|灵动的|柔情的|妩媚的|杀气的/g, '')
    // 英文：先删整词组，再删残留 expression（已保护 no expression / neutral face）
    .replace(/\b(?:weary|tired|mature|pained|cold|gentle|stern|dramatic|emotional|neutral)\s+expressions?\b/gi, '')
    .replace(/\b(?:smiling|smile|smirk|grin|frowning|frown|angry|anger|furious|sad|crying|teary|tearful|tears|weeping|nervous|anxious|anxious[- ]looking|shocked|surprised|scared|fearful|tired(?:[- ]looking)?|weary|exhausted|sleepy|drowsy|expressive(?:\s+(?:face|eyes?))?|happy|joyful|depressed|melancholy|worried|worried[- ]looking|confident\s+smile|focused\s+(?:expression|look))\b/gi, '')
    .replace(/\b(?:furrowed\s+brows?|knitted\s+brows?|raised\s+brows?|downturned\s+mouth|upturned\s+mouth|clenched\s+jaw)\b/gi, '')
    .replace(/\bexpressions?\b/gi, '')
    .replace(/呈状/g, '')
    .replace(new RegExp(NEUTRAL_MARK, 'g'), PORTRAIT_NEUTRAL_FACE_CN)
    .replace(/(?:面无表情，中性冷静，?)+/g, `${PORTRAIT_NEUTRAL_FACE_CN}，`)
    .replace(/[，,](?:\s*[，,])+/g, '，')
    .replace(/,\s*,+/g, ', ')
    .replace(/^[，,\s]+|[，,\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s
}

export const THREE_VIEW_PORTRAIT_STYLE_GUARD_ANIME = [
  'CRITICAL ART STYLE: cinematic anime key visual, Makoto Shinkai Kyoto Animation film style, highly detailed anime eyes with catchlights, natural dark iris, white sclera, thin clean lineart, soft painterly cel shading, golden hour soft lighting, delicate atmospheric shading',
  'CRITICAL LAYOUT: vertical portrait single front upper-body character reference facing camera on pure white background, chest-up framing, subject fills most of frame with only narrow side margins, clear detailed face, neutral face no expression',
  'FORBIDDEN: pixel art, dithering, chibi, 3D render, turnaround sheet, multiple views, side view, back view, gray background, landscape with large empty side margins, tiny centered vertical strip, tiny full-body figure, vertical poster crop-out, handheld objects, props in hands, flat dull colors, rough sketch, duplicate character, solid red eyes, glowing red eyes, crimson eyes, entirely red iris, demonic red eyes, smiling, angry expression, tired expression, frowning, crying',
].join(', ')

export const THREE_VIEW_PORTRAIT_STYLE_GUARD_MOTION_COMIC = [
  'CRITICAL ART STYLE: Chinese short-drama manhua portrait, sharp clean thin lineart, hard-edge cel shading, deep chiaroscuro, high contrast cool blue purple grey night tones, strong side key light with deep face shadows, cool white rim light on hair, clear crisp facial features, normal young adult body proportions, NOT Makoto Shinkai, NOT golden hour, NOT watercolor, NOT pure white flat studio light',
  'CRITICAL LAYOUT: vertical portrait single front upper-body IDENTITY LOCK reference facing camera, chest-up framing, subject fills most of frame, clear detailed face, deep navy dark cool background #0f172a, neutral face no expression',
  'FORBIDDEN: pure white background, white studio sheet, character lineup sheet, Makoto Shinkai soft golden hour, watercolor blur, painterly soft shading, pure white flat studio light, even soft beauty lighting, pixel art, dithering, chibi, 3D render, turnaround sheet, multiple views, side view, back view, landscape with large empty side margins, tiny centered vertical strip, tiny full-body figure, thick webtoon outlines, speed lines, action lines, handheld objects, props in hands, duplicate character, solid red eyes, glowing red eyes, crimson eyes, entirely red iris, smiling, angry expression, tired expression, frowning, crying',
].join(', ')

export const THREE_VIEW_PORTRAIT_STYLE_GUARD_MINIMAL = [
  'CRITICAL ART STYLE: minimal white stick figure protagonist, normal cartoon face with round eyes and highlights, black outline, flat colors',
  'CRITICAL LAYOUT: vertical portrait single front upper-body stick figure reference facing camera on pure white background, chest-up framing, subject fills most of frame with only narrow side margins, clear face, neutral face no expression',
  'FORBIDDEN: pixel art, dithering, turnaround sheet, multiple views, side view, back view, gray background, landscape with large empty side margins, tiny centered vertical strip, tiny full-body figure, detailed anime face, realistic portrait, 3D render, duplicate character, solid red eyes, glowing red eyes, smiling, tired expression, frowning',
].join(', ')

export function buildNarrationMinimalCharacterExtractSystem(options?: { weightArc?: { theme_labels: string[] } | null }): string {
  return [
    '你是影视解说项目的角色设定师（简体素人/素体小人画风）。须为「主人公」做 16:9 横屏正面半身定妆参考图（纯白色背景、脸与上半身占满画面、清晰展示正常卡通脸），配角不需要单独定妆。',
    '规则：',
    '1) 只提取主人公（男主/女主/主角），不要提取配角（妻子、店员、朋友、提亲者等）',
    '2) 不要提取「旁白」「解说员」「作者」',
    '3) 输出字段：name、variant_label、role、appearance、personality',
    '4) role 只填固定身份「男主」或「女主」，禁止填职业/情节标签（个体户、万元户、服装店老板、流水线工人等；那些是文案剧情不是角色定位）',
    '5) variant_label 表示该条定妆的时期/形态：如 童年、少年、青年、中年、老年；若全篇只有一个时期则留空或填「常态」',
    '6) 同一主人公若文案出现明显不同人生阶段（回忆、多年后、少年与晚年等），必须拆成多条记录：name 相同，variant_label 不同，appearance 各自独立',
    '7) 第一人称「我」叙述时，name 用「男主」或「女主」，并按青年/中年/老年等阶段拆分 variant_label',
    `8) appearance：按定妆规格格式输出（性别+阶段+脸型+眉眼+发型+身形+#hex简笔服装+${PORTRAIT_FULL_BODY_STANDING_CN}）；身形须写躯干宽高或标准体型档位；禁止手持/道具；禁止全身小全身竖条/三视图描述；禁止任何表情/神情`,
    options?.weightArc
      ? `8b) 剧本含${options.weightArc.theme_labels.join('/')}主题：appearance 须写体重档位与具象躯干宽高（如 obese 青年期躯干1.0份高×1.30份宽），禁止只写标准三头身`
      : '',
    '9) 示例 appearance：28岁男性，正常卡通圆脸带高光，圆点眼，青年期躯干1.0份高×1.0份宽标准体型，简化#2563eb蓝色工装简笔轮廓，正面半身标准站姿头到胸口完整入镜双手自然下垂',
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
    '定妆输出用于 16:9 横屏正面半身参考图（纯白色背景、脸与上半身占满画面），清晰展示正常卡通脸与上半身服装。',
    '根据剧本情节，只输出该人生阶段的定妆规格：性别+阶段+白色素体小人+正常卡通脸+#hex简笔服装轮廓+尺寸比例+正面半身标准站姿头到胸口完整入镜双手自然下垂，20-80 字中文；禁止手持道具（槟榔/茶杯/书包等留到分镜配图）；禁止任何表情/神情（如疲惫、微笑等）。',
    '示例（青年）：28岁男性，白色素体小人，正常卡通圆脸圆点眼，简化#2563eb蓝色工装简笔轮廓，青年期标准体型，正面半身标准站姿头到胸口完整入镜双手自然下垂',
    options?.weightArc
      ? `【体重弧线】剧本含${options.weightArc.theme_labels.join('/')}主题：须写体重档位与具象躯干宽高`
      : '',
    '禁止：厚涂写实真人面相、复杂印花、English tags、多视角描述',
    '只输出正文，不要标题、markdown、JSON。',
  ].filter(Boolean).join('\n')
}

export function buildNarrationAnimeCharacterAppearanceSystem(): string {
  return [
    '你是影视解说项目的角色定妆造型设计助手（动漫风格）。',
    `画风：现代高质量 2D 动漫，正常头身比，${PORTRAIT_REFERENCE_IMAGE_LAYOUT_CN}；大而清晰的动漫眼睛带高光与自然虹膜色、干净眼白；禁止 Q 版、3D、真人写实、全身小全身竖条、三视图；手持物/槟榔/道具留到分镜配图文案，定妆不写。`,
    '须根据解说稿中该角色的出场情节、对白、行为推断外貌，与故事时代、题材一致。',
    '不写过程性描述（如牙齿由白变黑）；身形须写具体（头身比+肩宽/腰线/四肢比例），禁止只写「标准」或省略；禁止素体份数、三头身、圆头直径等计量词（素体画风除外）。',
    '若提供了 variant_label，外貌须严格对应该阶段，不得写成其他年龄。',
    PORTRAIT_CHARACTER_DISTINCTIVENESS_RULE,
    PORTRAIT_NEUTRAL_EXPRESSION_LLM_RULE,
    PORTRAIT_EYE_COLOR_LLM_RULE,
    PORTRAIT_APPEARANCE_SPEC_FORMAT_RULE,
    '只输出描述正文，不要标题、markdown、JSON。',
  ].join('\n')
}

export function buildNarrationAnimeCharacterExtractSystem(): string {
  return [
    '你是影视解说项目的角色设定师（动漫风格）。须为「主人公」做 16:9 横屏正面半身定妆参考图（纯白色背景、脸与上半身占满画面、清晰脸型），配角不需要单独定妆。',
    '规则：',
    '1) 只提取主人公（男主/女主/主角），不要提取配角',
    '2) 不要提取「旁白」「解说员」「作者」',
    '3) 输出字段：name、variant_label、role、appearance、personality',
    '4) role 只填「男主」或「女主」，禁止填职业/情节标签（个体户、万元户、老板、工人等）',
    '5) variant_label：人生阶段（童年/青年/老年等）；全篇单形态可留空或「常态」；多阶段须拆多条',
    `5) appearance：按定妆规格格式（性别+年龄/阶段+脸型+眉眼+发型+身形+#hex服装+标志特征 + English tags）；须写清动漫脸型与眉眼；身形须写头身比+肩宽/四肢比例；末尾须含「${PORTRAIT_FULL_BODY_STANDING_CN}」；禁止全身小全身竖条/三视图；禁止表情/神情；禁止只写「短发」「标准」等笼统词`,
    `5b) ${PORTRAIT_NEUTRAL_EXPRESSION_LLM_RULE}`,
    `5c) ${PORTRAIT_EYE_COLOR_LLM_RULE}`,
    '6) 禁止画风词：retro style, chibi, 3D, 真人, 厚涂, Q版, pixel',
    '7) 示例 appearance：28岁男性，俊朗棱角动漫脸型，剑眉，细长深褐眼带瞳孔高光，黑色略凌乱碎发刘海微遮额，正常头身比肩宽适中四肢修长匀称，穿#2563eb蓝色工厂工装，左耳简约耳钉，面无表情，中性冷静。\nEnglish tags: handsome sharp jawline anime face, thick straight eyebrows, narrow dark-brown eyes with catchlights and white sclera, messy black short hair with bangs, normal anime body proportions balanced shoulders slim athletic build, blue factory uniform, small ear stud, neutral face, no expression',
    '8) 合并同一人物同一时期称呼，不要重复',
    '只输出 JSON，不要解释。',
  ].join('\n')
}
