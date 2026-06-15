export type ArtStyleContext = 'scene' | 'diptych' | 'title' | 'portrait' | 'agent'

export const DEFAULT_ART_STYLE = 'short-drama'

export const ART_STYLES = [
  {
    value: 'short-drama',
    label: '短剧动漫（正常比例）',
    description: '抖音剧/解说常用，正常头身比、细线稿、柔和赛璐璐，类似剧本人性',
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

const APPEARANCE_STYLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b1980s side-part (hairstyle|haircut|hair)\b/gi, 'side-part $1'],
  [/\b1980s-era\b/gi, ''],
  [/\b1980s?\s+fashionable\b/gi, ''],
  [/\b1980s?\s+(wavy|curly)\b/gi, 'wavy'],
  [/\bstylish\s+80s\s+dress\b/gi, 'stylish dress'],
  [/\b80s?\s+dress\b/gi, 'dress'],
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
  /写实/gi,
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
]

function tidyAppearancePunctuation(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/[,，;；]\s*[,，;；]+/g, ', ')
    .replace(/^[,，;；\s]+|[,，;；\s]+$/g, '')
    .replace(/\(\s*\)/g, '')
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
