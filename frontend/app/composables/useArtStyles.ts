export type ArtStyleContext = 'scene' | 'diptych' | 'title' | 'portrait' | 'agent'

export const DEFAULT_ART_STYLE = 'short-drama'

/** 解说素体极简叙事画风（项目级视觉风格 value） */
export const NARRATION_MINIMAL_STYLE = 'narration-minimal'

/** 解说素体小人：固定五官（两个小黑点眼睛） */
export const NARRATION_MINIMAL_EYES = '两个小黑点眼睛'

/** 解说配图万能模板：固定前缀 */
export const NARRATION_UNIVERSAL_SCENE_PREFIX =
  `16:9 横屏，2D 扁平化卡通，白色圆头素体小人，${NARRATION_MINIMAL_EYES}，黑色细轮廓线，纯色平涂无复杂光影`

/** 解说配图万能模板：固定后缀 */
export const NARRATION_UNIVERSAL_SCENE_SUFFIX =
  '日常低饱和配色，极简叙事动画风格，干净整洁的画面，无文字无水印'

/** 解说视频模式：核心画风固定关键词（LLM 参考用） */
export const NARRATION_IMAGE_STYLE_CORE =
  `白色圆头素体小人、${NARRATION_MINIMAL_EYES}、黑色细轮廓线、纯色平涂无复杂光影、日常低饱和配色、极简叙事动画风格`

/** 【剧情】通用：仅保留与当前画面仍相关的延续道具（不再写入全文前文概要） */
export const NARRATION_PLOT_CONTINUITY_HINT =
  '货物/道具/品类须与前文已出现内容一致，且仅保留当前画面仍相关的物件'

/** 解说视频模式：负面提示词 */
export const NARRATION_IMAGE_NEGATIVE_PROMPT =
  '复杂五官、写实人脸、鼻子嘴巴、无眼睛、空白脸、无五官、面部皱纹、厚涂肌理、3D 建模、渐变光影、复杂纹理、半写实、西装革履、花衬衫、喇叭裤、墨镜太阳镜、具体服装款式、复古滤镜、像素风、杂乱背景'

export const ART_STYLES = [
  {
    value: 'short-drama',
    label: '短剧动漫（正常比例）',
    description: '抖音剧/解说常用，正常头身比、细线稿、柔和赛璐璐，类似剧本人性',
  },
  {
    value: NARRATION_MINIMAL_STYLE,
    label: '解说素体（极简叙事）',
    description: '白色圆头素体小人、两个小黑点眼睛、黑色细线、扁平平涂，低饱和日常配色，短视频剧情动画质感',
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
    scene: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【场景】，【剧情】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    diptych: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，单张横向两宫格，【左格场景与剧情】，【右格场景与剧情】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
    title: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【片头背景场景】，【主题氛围】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}，中央预留叠字区域`,
    portrait: `${NARRATION_UNIVERSAL_SCENE_PREFIX}，【场景：浅灰纯色背景，单人全身素体小人定妆参考图】，【剧情：${NARRATION_MINIMAL_EYES}，人生阶段与动作姿态】，${NARRATION_UNIVERSAL_SCENE_SUFFIX}`,
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
  '16:9 横屏', '16:9横屏', '2D 扁平化卡通', '2D 扁平化卡通动画', '2D扁平化卡通动画',
  '白色圆头素体小人', '白色圆头无脸素体小人', NARRATION_MINIMAL_EYES, '两个小黑点眼睛',
  '黑色细轮廓线', '黑色简洁轮廓线',
  '纯色平涂无纹理渐变', '纯色平涂无复杂光影', '纯色平涂',
  '日常低饱和配色', '低饱和写实配色', '极简叙事动画风格', '极简叙事画风',
  '短视频剧情动画质感', '干净整洁的画面', '画面干净清晰', '画面干净整洁',
  '无文字无水印', '中央预留叠字区域', '绝对无文字无字母', '绝对无文字',
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
  if (/素体小人|两个小黑点/.test(t)) return false
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
  { re: /摆地摊|摆摊|夜市/, action: '在摊位前整理陈列货物', priority: 10, sceneTags: ['market'] },
  { re: /生意|卖光|卖完|赶时髦|出售|卖出|热卖/, action: '向顾客展示货物并交易', priority: 10, sceneTags: ['market'] },
  { re: /年轻人|顾客|客人|来买|挑选/, action: '几位年轻人围在摊位前挑选货物', priority: 9, sceneTags: ['market'] },
  { re: /批发|进货|批了/, action: '在市场通道搬运整理成箱货物', priority: 9, sceneTags: ['market', 'wholesale'] },
  { re: /固定摊位|越干越有劲/, action: '整理固定摊位上的陈列货物', priority: 9, sceneTags: ['market'] },
  { re: /门面|服装店|开店/, action: '站在店铺门口招呼进店客人', priority: 9, sceneTags: ['shop'] },
  { re: /辞|离开|供销社/, action: '离开供销社门口', priority: 8, sceneTags: ['supply'] },
  { re: /推.*手推车|推车|自行车/, action: '推着手推车运送货物', priority: 8, sceneTags: ['transport'] },
  { re: /疯|议论|说我/, action: '周围多人围观交谈，独自忙碌', priority: 7, sceneTags: ['market'] },
  { re: /万元户/, action: '站在店铺前，周围简化钱币意象', priority: 8, sceneTags: ['shop'] },
  { re: /赚钱|收入|越多|利润/, action: '手持简化账本查看收入', priority: 7, sceneTags: ['market', 'shop'] },
  { re: /铁饭碗|个体户|投机/, action: '独自经营小摊忙碌', priority: 6, sceneTags: ['market'] },
  { re: /心里有数|敢闯|改革|踏实/, action: '在摊前从容应对，继续招揽顾客', priority: 3, sceneTags: ['market'], fallback: true },
]

function detectNarrationSceneTags(text: string): string[] {
  const tags: string[] = []
  if (/夜市|摆地摊|地摊|摊位|摆摊/.test(text)) tags.push('market')
  if (/卖|顾客|生意|交易|货物|商品|赶时髦/.test(text)) tags.push('market')
  if (/批发市场|批(?:发|了)|进货/.test(text)) tags.push('wholesale')
  if (/门面|店铺|服装店|开店|租了/.test(text)) tags.push('shop')
  if (/供销社/.test(text)) tags.push('supply')
  if (/推.*车|自行车|手推车/.test(text)) tags.push('transport')
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
  if (!/批(?:发|了)|进(?:货|了)|卖|摆摊|进货/.test(s)) return null
  const batch = s.match(/批(?:发|了)(?:了)?([^，,。！？；]{2,20})/)
  if (batch?.[1]) {
    const g = normalizeGoodsLabel(batch[1])
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
  [/自行车|二八杠|手推车/, /推.*车|自行车|二八杠|手推车/, '自行车'],
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

function collectRelevantContinuityProps(priorLines: string[], currentText: string): string[] {
  const priorFull = priorLines.join('')
  const current = String(currentText || '').trim()
  if (!current) return []

  const relevant: string[] = []
  for (const prop of extractPersistentVisualProps(current)) {
    if (!relevant.includes(prop)) relevant.push(prop)
  }

  const isMarketScene = /夜市|摆地摊|摊位|摆摊|整理货物|卖|批(?:发|了)|顾客|围观/.test(current)
  if (isMarketScene && priorFull) {
    for (const prop of extractPersistentVisualProps(priorFull)) {
      if (relevant.includes(prop)) continue
      if (/批|卖|进|摊|货|赶时髦|时髦/.test(priorFull)) relevant.push(prop)
    }
  }

  for (const [, sceneRe, label] of SCENE_BOUND_VISUAL_PROPS) {
    if (sceneRe.test(current) && !relevant.includes(label)) relevant.push(label)
  }

  return relevant.slice(0, 4)
}

function resolveActiveSceneFromParts(allParts: string[], currentText: string): string {
  if (/卖|生意|顾客|赶时髦|摆摊|摆地摊|心里有数/.test(currentText)) {
    const stallScene = allParts.find(p => /夜市|摆地摊|摊位/.test(p))
    if (stallScene) return normalizeBracketContent(stallScene)
  }
  return normalizeBracketContent(resolvePrimaryScene(allParts))
}

function inferActiveSceneFromContext(currentText: string, priorLines: string[]): string {
  let parts = extractScenePartsFromNarrationText(currentText)
  if (parts.length) return resolveActiveSceneFromParts(parts, currentText)

  const contextLines = [...priorLines.slice(-4), currentText].filter(Boolean)
  const allParts: string[] = []
  for (const line of contextLines) {
    for (const p of extractScenePartsFromNarrationText(line)) {
      if (!allParts.includes(p)) allParts.push(p)
    }
  }
  if (allParts.length) return resolveActiveSceneFromParts(allParts, currentText)

  const allText = contextLines.join('')
  if (/卖|生意|顾客|摊|批|赶时髦/.test(allText)) {
    return '县城夜市街景与简化摊位'
  }
  return ''
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
      ? `在摊位前向顾客展示${goods}，与年轻人讨价还价`
      : '在摊位前向顾客展示货物，与顾客交易挑选'
  }
  if (/整理.*货物|整理陈列|摆摊|招揽/.test(base)) {
    return goods ? `在摊位前整理陈列${goods}` : base
  }
  if (/自信站立|简化城市|从容应对|心里有数/.test(base)) {
    return goods
      ? `在摊位前从容展示${goods}，继续招揽顾客`
      : '在摊位前从容应对，继续招揽顾客'
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

function buildFocusedScenePlot(sentences: string[], priorLines?: string[], sceneHint?: string): string {
  const lines = sentences.map(s => String(s || '').trim()).filter(Boolean)
  if (!lines.length) return ''
  const prior = priorLines || []
  const currentText = lines.join('')
  const contextText = prior.slice(-4).join('') + currentText
  const sceneTags = detectNarrationSceneTags(contextText)
  const props = collectRelevantContinuityProps(prior, currentText)
  const scene = sceneHint || inferActiveSceneFromContext(currentText, prior)

  let plot = inferVisualPlotFromNarration(currentText, sceneTags)
  if (!plot || isRawNarrationText(plot)) {
    plot = normalizeBracketContent(mergeNarrationPlotSentences(lines))
  }
  plot = contextualizePlotForScene(plot, scene, props, sceneTags)
  return appendPropsToVisualPlot(plot, props)
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

export function parseNarrationIntoScenePlot(
  input: string | string[],
  options?: NarrationScenePromptOptions,
): { scene: string; plot: string } {
  const lines = (Array.isArray(input)
    ? input
    : String(input || '').split(/[。！？]+/))
    .map(s => String(s || '').trim())
    .filter(Boolean)
  if (!lines.length) return { scene: '', plot: '' }

  const fullText = lines.join('')
  const priorLines = resolvePriorNarrationLines(options)
  let scene = inferActiveSceneFromContext(fullText, priorLines)
  if (!scene) {
    const allParts = extractScenePartsFromNarrationText(fullText)
    scene = normalizeBracketContent(resolvePrimaryScene(allParts))
      || (/万元户|摆地摊|赚钱|创业/.test(fullText) ? '简化县城街景，寓意经营成功氛围' : '')
  }
  return {
    scene,
    plot: buildFocusedScenePlot(lines, priorLines, scene),
  }
}

export function buildNarrationSceneImagePromptFromSentences(
  sentences: string | string[],
  options?: NarrationScenePromptOptions,
): string {
  const { scene, plot } = parseNarrationIntoScenePlot(sentences, options)
  if (!scene && !plot) return ''
  return assembleNarrationUniversalScenePrompt(scene, plot)
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

  const sceneBracket = text.match(/【场景[：:]\s*([^】]+)】/)
  const plotBracket = text.match(/【剧情[：:]\s*([^】]+)】/)
  if (sceneBracket || plotBracket) {
    return sanitizeSceneImagePrompt([
      sceneBracket?.[1]?.trim(),
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

export function assembleNarrationUniversalScenePrompt(
  scene: string,
  plot: string,
  options?: { title?: boolean },
): string {
  const scenePart = sanitizeSceneImagePrompt(scene)
  const plotPart = formatNarrationPlotForPrompt(plot)
  let body = ''
  if (options?.title) {
    body = [
      scenePart && ensureNarrationBracket('片头背景场景', scenePart),
      plotPart && ensureNarrationBracket('主题氛围', plotPart),
      '中央预留叠字区域',
    ].filter(Boolean).join('，')
  } else {
    body = [
      scenePart && ensureNarrationBracket('场景', scenePart),
      plotPart && ensureNarrationBracket('剧情', plotPart),
    ].filter(Boolean).join('，')
  }
  if (!body) return ''
  return tidyScenePrompt([
    NARRATION_UNIVERSAL_SCENE_PREFIX,
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
  [/花衬衫|喇叭裤|蛤蟆镜|太阳镜|墨镜|aviator\s+sunglasses?/gi, ''],
  [/floral\s+shirt|bell-bottom|leather\s+shoes?|business\s+suit|wedding\s+dress/gi, ''],
  [/西装|革履|皮鞋|灰布衣服|中山装|唐装|婚纱|喜字|横幅|霓虹/g, ''],
  [/摊位悬挂[^，,；;]*/g, '摊位'],
  [/满载[^，,；;]*/g, ''],
  [/整理[^，,；;]{0,8}(喇叭裤|花衬衫|商品)/g, '整理货物'],
  [/挑选[^，,；;]{0,8}(喇叭裤|花衬衫)/g, '挑选商品'],
  [/递给[^，,；;]{0,8}(花衬衫|商品)/g, '递出商品'],
  [/戴[，,、\s]*(?=推|站|坐|走|$)/g, ''],
  [/脸上有[，,、\s]*/g, ''],
  [/二八杠自行车|自行车靠在[^，,；;]*/g, ''],
  [/靠在摊位旁/g, ''],
  [/推着[^，,；;]{0,12}自行车/g, '推着手推车'],
  [/推着手推车/g, '推着手推车'],
  [/，停靠一旁/g, ''],
  [/推着(?!手推车)/g, '推着手推车'],
  [/推着，/g, '推着手推车，'],
  [/\d{2,4}年代|八十年代|九十年代/g, ''],
  [/2000年代|二十世纪/g, ''],
  [/男性角色|女性角色|年轻顾客|老年男性|老年女性|顾客|店员/g, '素体小人'],
  [/表情[^，,；;]*/g, ''],
  [/微笑|皱纹|头发花白|无脸|无五官/g, ''],
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
  const eyes = NARRATION_MINIMAL_EYES
  const label = String(variantLabel || '').trim()
  if (/童年|幼年|孩童|儿时|幼/.test(label)) return `小型素体小人，${eyes}，站立，简单活泼姿态`
  if (/青年|少年|年轻/.test(label)) return `标准素体小人，${eyes}，站立或行走，可推手推车或自行车轮廓作道具`
  if (/中年/.test(label)) return `略宽素体小人，${eyes}，坐于柜台后，放松姿态，手持茶杯`
  if (/老年|晚年|垂暮|苍老|年迈/.test(label)) return `略佝偻素体小人，${eyes}，坐于凳上，手持圆扇`
  return `标准素体小人，${eyes}，中性站立姿态`
}

export function buildNarrationPortraitPromptContent(scene: string, plot: string): string {
  return assembleNarrationUniversalScenePrompt(scene, plot)
}

function extractPromptBracketParts(raw: string): {
  scene: string
  plot: string
  title: boolean
} {
  const text = String(raw || '').trim()
  const titleScene = text.match(/【片头背景场景[：:]\s*([^】]+)】/)
  const titlePlot = text.match(/【主题氛围[：:]\s*([^】]+)】/)
  if (titleScene || titlePlot || /预留中央叠字|中央预留叠字/.test(text)) {
    return {
      scene: titleScene?.[1]?.trim() || '',
      plot: titlePlot?.[1]?.trim() || '',
      title: true,
    }
  }
  const scene = text.match(/【场景[：:]\s*([^】]+)】/)
  const plot = text.match(/【剧情[：:]\s*([^】]+)】/)
  if (scene || plot) {
    return {
      scene: scene?.[1]?.trim() || '',
      plot: plot?.[1]?.trim() || '',
      title: false,
    }
  }
  return { scene: '', plot: '', title: /片头/.test(text) }
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
}

export function finalizeNarrationImagePrompt(
  prompt?: string | null,
  options?: FinalizeNarrationPromptOptions,
): string {
  const narrationLines = options?.narrationLines?.map(s => s.trim()).filter(Boolean)
  const raw = String(prompt || '').trim()
  const isTitlePrompt = !!options?.titleHook
    || /片头|预留中央叠字|中央预留叠字|【片头背景场景|【主题氛围/.test(raw)

  if (narrationLines?.length) {
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
  const core = bracketParts.scene || bracketParts.plot
    ? ''
    : extractNarrationPromptContentCore(raw)

  if (bracketParts.title || /片头|预留中央叠字|中央预留叠字/.test(raw)) {
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

  if (bracketParts.scene || bracketParts.plot) {
    const enriched = enrichNarrationVisualParts(
      sanitizeSceneImagePrompt(bracketParts.scene),
      formatNarrationPlotForPrompt(bracketParts.plot),
    )
    return assembleNarrationUniversalScenePrompt(enriched.scene, enriched.plot)
  }

  if (!core) return ''
  const { scene, plot } = splitNarrationSceneAndPlot(core)
  const enriched = enrichNarrationVisualParts(scene, plot, core)
  if (enriched.scene && enriched.plot) return assembleNarrationUniversalScenePrompt(enriched.scene, enriched.plot)
  if (enriched.plot) return assembleNarrationUniversalScenePrompt(enriched.scene, enriched.plot)
  return assembleNarrationUniversalScenePrompt(enriched.scene || core, enriched.plot)
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
