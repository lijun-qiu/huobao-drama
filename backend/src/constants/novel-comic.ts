/**
 * 小说漫画讲解模式 — 贴小说 → 章节大纲（二/三列节拍）→ 一章一集
 * → 素笔彩画「9:16 竖屏二/三列分格」配图（全文画在图上）+ BGM + 左右翻页（无配音）
 */
import type { ProductionMode } from './production-mode.js'
import { isNovelComicMode, PRODUCTION_MODE_NOVEL_COMIC } from './production-mode.js'
import { PORTRAIT_AGE_INFERENCE_LLM_RULE } from './portrait-reference.js'

export const NOVEL_COMIC_PRODUCTION_MODE = PRODUCTION_MODE_NOVEL_COMIC

/** 小说漫画默认画风：素笔彩画竖页（key 仍为 novel-comic-sketch，避免改库） */
export const NOVEL_COMIC_SKETCH_STYLE = 'novel-comic-sketch'
export const NOVEL_COMIC_DEFAULT_STYLE = NOVEL_COMIC_SKETCH_STYLE

/** 成片单镜时长（秒）：固定切镜，不跟配音 */
export const NOVEL_COMIC_SHOT_DURATION_SEC = 3
/** 成片画幅 9:16 */
export const NOVEL_COMIC_COMPOSE_WIDTH = 720
export const NOVEL_COMIC_COMPOSE_HEIGHT = 1280
/** 生图默认尺寸（竖屏） */
export const NOVEL_COMIC_IMAGE_SIZE = '768x1344'

export const NOVEL_COMIC_IMAGE_STYLE_OPTIONS = [
  { value: NOVEL_COMIC_SKETCH_STYLE, label: '素笔彩画' },
] as const

export interface NovelComicChapterOutline {
  number: number
  title: string
  summary: string
  /** 粗粒度情节点（2～5） */
  key_beats?: string[]
  /**
   * 分格页内的单格场面（每章约 6～12 条优先）：
   * 每 2～3 条合成一页竖屏二/三列漫画
   */
  panel_beats?: string[]
  approx_chars?: number
}

/** 格内文字策略：短字叠字 | 长文由模型画字（默认：全文画在图上） */
export type NovelComicPanelTextMode = 'short' | 'full'
export const NOVEL_COMIC_PANEL_TEXT_MODE_SHORT: NovelComicPanelTextMode = 'short'
export const NOVEL_COMIC_PANEL_TEXT_MODE_FULL: NovelComicPanelTextMode = 'full'
export const DEFAULT_NOVEL_COMIC_PANEL_TEXT_MODE: NovelComicPanelTextMode = NOVEL_COMIC_PANEL_TEXT_MODE_FULL

export function normalizeNovelComicPanelTextMode(value?: string | null): NovelComicPanelTextMode {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'short' || v === 'overlay' || v === 'stack') return NOVEL_COMIC_PANEL_TEXT_MODE_SHORT
  if (v === 'full' || v === 'long' || v === 'paint' || v === 'model') return NOVEL_COMIC_PANEL_TEXT_MODE_FULL
  return DEFAULT_NOVEL_COMIC_PANEL_TEXT_MODE
}

/** 从配图文案推断格字模式（显式标记优先） */
export function novelComicPanelTextModeFromPrompt(prompt?: string | null): NovelComicPanelTextMode | null {
  const s = String(prompt || '')
  if (/【格字模式：短字叠字】|文字由后期叠字|框内留白勿绘制汉字|框内留白勿绘汉字/.test(s)) {
    return NOVEL_COMIC_PANEL_TEXT_MODE_SHORT
  }
  if (/【格字模式：长文画字】/.test(s)) return NOVEL_COMIC_PANEL_TEXT_MODE_FULL
  return null
}

export function novelComicPanelTextModeMarker(mode: NovelComicPanelTextMode): string {
  return mode === NOVEL_COMIC_PANEL_TEXT_MODE_FULL ? '【格字模式：长文画字】' : '【格字模式：短字叠字】'
}

export interface NovelComicDramaMeta {
  source_novel?: string
  chapter_outline?: NovelComicChapterOutline[]
  outline_confirmed_at?: string | null
}

export const DEFAULT_NOVEL_COMIC_DRAMA_META: Required<Pick<NovelComicDramaMeta, 'source_novel' | 'chapter_outline'>> & {
  outline_confirmed_at: string | null
} = {
  source_novel: '',
  chapter_outline: [],
  outline_confirmed_at: null,
}

/** 默认章数范围（用户未指定目标章数时；大纲 API 仍可用，建集上限见 MAX_EPISODES） */
export const NOVEL_COMIC_OUTLINE_MIN_CHAPTERS = 2
export const NOVEL_COMIC_OUTLINE_MAX_CHAPTERS = 12
export const NOVEL_COMIC_OUTLINE_DEFAULT_CHAPTERS = 4

/** 小说漫画手动分集上限 */
export const NOVEL_COMIC_MAX_EPISODES = 1000

/** 上集前情摘录上限（定妆/上下文参考） */
export const NOVEL_COMIC_PREV_EPISODE_SUMMARY_MAX_CHARS = 600

/** 压缩上集原文供本集上下文引用 */
export function compressNovelComicPreviousScript(
  text?: string | null,
  maxChars: number = NOVEL_COMIC_PREV_EPISODE_SUMMARY_MAX_CHARS,
): string {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  if (raw.length <= maxChars) return raw
  return `${raw.slice(0, maxChars).replace(/[，。；！？、\s]+$/u, '')}…`
}

/** 上集原文前情块（供定妆/拆镜上下文；本模式不再写讲解稿） */
export function formatNovelComicPreviousEpisodeBlock(
  summary: string,
  previousEpisodeNumber: number,
): string {
  const s = String(summary || '').trim()
  if (!s) return ''
  return [
    `【上集前情·第${previousEpisodeNumber}集原文摘录】`,
    '仅作连贯参考；本集直接使用「文案输入」原文拆镜，勿另写讲解稿。',
    s,
  ].join('\n')
}

/** 单章朗读稿建议字数（说书短句密排，仍需够念） */
export const NOVEL_COMIC_CHAPTER_SCRIPT_MIN_CHARS = 800
export const NOVEL_COMIC_CHAPTER_SCRIPT_DEFAULT_CHARS = 1_400
export const NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS = 4_000

/** 每章单格节拍数量（建议 2～3 的倍数；每 2～3 条 = 一页竖屏分格；优先 6～12） */
export const NOVEL_COMIC_PANEL_BEATS_MIN = 4
export const NOVEL_COMIC_PANEL_BEATS_MAX = 12

/**
 * 一页 9:16 竖屏 ≈ 二列或三列场面。检测以剧情内容为准，下列数值仅作 LLM 软提示 / 极端兜底，
 * 后处理不再按比例硬拉、硬砍锚点数量。
 */
export const NOVEL_COMIC_PAGE_SEGMENT_MIN_SHOTS = 2
export const NOVEL_COMIC_PAGE_SEGMENT_MAX_SHOTS = 5
/** 软提示用参考占比（不强制）；极端超长单页才拆（见 maxShots 兜底） */
export const NOVEL_COMIC_PAGE_DETECT_MIN_STORYBOARD_RATIO = 0
export const NOVEL_COMIC_PAGE_DETECT_MAX_STORYBOARD_RATIO = 1
export const NOVEL_COMIC_PAGE_DETECT_TARGET_STORYBOARD_RATIO = 0
/** 内容驱动：仅防止单页旁白极端过长时拆页 */
export const NOVEL_COMIC_PAGE_SEGMENT_HARD_MAX_SHOTS = 8

// ─── 素笔彩画竖页（9:16；二/三列分格；默认全文画在图上；定妆仍黑白素笔无字） ─────

/** 配图素笔彩画画风（不含版式；定妆另用黑白素笔，见 PORTRAIT_*） */
export const NOVEL_COMIC_SKETCH_ART_STYLE_CORE =
  '素笔彩画，干净细素笔/钢笔线稿，淡彩水彩或彩铅轻铺色，纸感留白，色相柔和分明，人物与场景轮廓清晰，正常头身比（非Q版），年龄按角色写，禁止赛璐璐厚平涂、禁止纯黑白去色线稿页、禁止写实照片'

/** 短字叠字（可选）：空框，文字后期叠 */
export const NOVEL_COMIC_SKETCH_STYLE_SPEC_SHORT =
  `9:16 竖屏一整页二列或三列分格漫画，深色细分格线，上→下阅读，${NOVEL_COMIC_SKETCH_ART_STYLE_CORE}，按内容选 2 格或 3 格并拉开景别（全景/中景/特写）画出环境道具，每格角落小空旁白框或空气泡（框内留白勿绘制汉字，文字由后期叠字）`

/** 长文画字（默认）：模型把完整讲解文字画进格内 */
export const NOVEL_COMIC_SKETCH_STYLE_SPEC_FULL =
  `9:16 竖屏一整页二列或三列分格漫画，深色细分格线，上→下阅读，${NOVEL_COMIC_SKETCH_ART_STYLE_CORE}，按内容选 2 格或 3 格并拉开景别（全景/中景/特写）画出环境道具，每格须有旁白框或气泡且框内完整中文讲解文字清晰可读`

/** @deprecated 兼容旧引用 → 全文画字默认 */
export const NOVEL_COMIC_SKETCH_STYLE_SPEC = NOVEL_COMIC_SKETCH_STYLE_SPEC_FULL

export function novelComicSketchStyleSpec(mode?: NovelComicPanelTextMode | null): string {
  return normalizeNovelComicPanelTextMode(mode) === NOVEL_COMIC_PANEL_TEXT_MODE_SHORT
    ? NOVEL_COMIC_SKETCH_STYLE_SPEC_SHORT
    : NOVEL_COMIC_SKETCH_STYLE_SPEC_FULL
}

export const NOVEL_COMIC_SKETCH_PORTRAIT_ART_CORE =
  '黑白素笔线稿定妆，干净细黑线，铅笔/钢笔疏密排线表现明暗，无上色无赛璐璐平涂，正常头身比（非Q版），年龄按角色写，单人半身定妆参考（非分镜页、非多格拼贴），禁止画面内任何文字水印字幕'

export const NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_SPEC =
  `竖幅正面半身身份锁脸参考，${NOVEL_COMIC_SKETCH_PORTRAIT_ART_CORE}，面无表情中性冷静，人物占满画面，纯白或极浅灰留白背景，五官发型服装轮廓清晰可辨，禁止彩漫平涂上色、禁止写实照片、禁止速度线、禁止夸张表情、禁止角色设定拼贴构图、禁止多格分镜拼贴`

export const NOVEL_COMIC_SKETCH_PORTRAIT_SCENE_CN =
  '纯白或极浅灰留白背景，竖幅正面半身身份锁脸定妆，黑白素笔细线稿+疏密排线明暗，清晰展示脸型五官发型与上半身服装轮廓，人物占满画面头到胸口，无杂乱陈设，无彩色上色，无字幕水印，单人半身非分镜页'

export const NOVEL_COMIC_SKETCH_ART_STYLE_EN_SHORT =
  'vertical 9:16 pencil-and-light-watercolor comic page, clean thin pencil/ink lineart with soft color wash, paper texture, rich environment and props in each panel, shot variety wide/medium/detail, NOT cel flat colors, NOT heavy oil paint, NOT photorealistic, NOT 3D, NOT chibi, normal body proportions matching character age, ONE image with 2-column OR 3-column panel layout (choose 2 or 3 panels by content), thin dark panel borders, EMPTY speech bubbles or caption boxes with blank interiors — do NOT paint any Chinese characters inside bubbles (text will be added later)'

export const NOVEL_COMIC_SKETCH_ART_STYLE_EN_FULL =
  'vertical 9:16 pencil-and-light-watercolor comic page, clean thin pencil/ink lineart with soft color wash, paper texture, rich environment and props in each panel, shot variety wide/medium/detail, NOT cel flat colors, NOT heavy oil paint, NOT photorealistic, NOT 3D, NOT chibi, normal body proportions matching character age, ONE image with 2-column OR 3-column panel layout (choose 2 or 3 panels by content), thin dark panel borders, speech bubbles or caption boxes with clear readable full Chinese narration matching the prompt'

/** @deprecated 兼容 → 全文英文默认 */
export const NOVEL_COMIC_SKETCH_ART_STYLE_EN = NOVEL_COMIC_SKETCH_ART_STYLE_EN_FULL

export const NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_EN =
  'black-and-white pencil sketch character portrait, clean thin black ink lineart, cross-hatching shading only, NO flat color, NO cel shading, vertical half-body portrait, chest-up framing, neutral face no expression, pure white or very light gray background, subject fills frame, clear face hair and upper outfit outlines, monochrome only, NOT full-color manhua, NOT photorealistic, NOT 3D, NO text, NO watermark, NOT multi-panel, NOT comic page grid'

export const NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_SHORT =
  '禁止赛璐璐厚平涂、纯黑白去色线稿页、厚涂油画、新海诚暖金柔光、3D渲染、真人照片、Q版三头身、粗条漫夸张黑线、速度线放射线、角色设定表/三视图拼贴、2×2四宫格、六宫格或九宫格、横屏16:9、全是半身大头/正对镜头说话、乱码英文、平台水印 logo、框内手绘汉字；配图页必须是 9:16 竖屏二列或三列分格素笔彩画，场面与环境优先，空旁白框框内留白'

export const NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_FULL =
  '禁止赛璐璐厚平涂、纯黑白去色线稿页、厚涂油画、新海诚暖金柔光、3D渲染、真人照片、Q版三头身、粗条漫夸张黑线、速度线放射线、角色设定表/三视图拼贴、2×2四宫格、六宫格或九宫格、横屏16:9、全是半身大头/正对镜头说话、乱码英文、平台水印 logo；配图页必须是 9:16 竖屏二列或三列分格素笔彩画，场面与环境优先，旁白框内完整中文讲解清晰可读'

/** @deprecated 兼容 → 全文 */
export const NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN = NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_FULL

export const NOVEL_COMIC_SKETCH_SCENE_SUFFIX_SHORT =
  '素笔彩画淡彩，环境道具与天气色调交代清楚，单张 9:16 内二列或三列分格且景别拉开，服装以文案为准勿抄定妆参考衣着，每格角落小空旁白框框内留白勿绘制汉字，文字由后期叠字，须淡彩上色禁止纯黑白无乱码英文无平台水印 logo'

export const NOVEL_COMIC_SKETCH_SCENE_SUFFIX_FULL =
  '素笔彩画淡彩，环境道具与天气色调交代清楚，单张 9:16 内二列或三列分格且景别拉开，服装以文案为准勿抄定妆参考衣着，格内完整中文讲解清晰可读，须淡彩上色禁止纯黑白无乱码英文无平台水印 logo'

/** @deprecated 兼容 → 全文 */
export const NOVEL_COMIC_SKETCH_SCENE_SUFFIX = NOVEL_COMIC_SKETCH_SCENE_SUFFIX_FULL

export function novelComicSketchSceneSuffix(mode?: NovelComicPanelTextMode | null): string {
  return normalizeNovelComicPanelTextMode(mode) === NOVEL_COMIC_PANEL_TEXT_MODE_SHORT
    ? NOVEL_COMIC_SKETCH_SCENE_SUFFIX_SHORT
    : NOVEL_COMIC_SKETCH_SCENE_SUFFIX_FULL
}

/** 定妆专用后缀（勿与配图页 SCENE_SUFFIX 混用；定妆=黑白素笔，配图=彩漫） */
export const NOVEL_COMIC_SKETCH_PORTRAIT_SUFFIX =
  '黑白素笔细线稿+疏密排线，无彩色平涂，绝对无写实照片无文字无水印无字幕，单人半身定妆非分镜页'

/** 定妆生图负向（与配图负向相反：禁写实/上色，允许黑白线稿） */
export const NOVEL_COMIC_SKETCH_PORTRAIT_NEGATIVE_PROMPT =
  'full color, cel shading, flat colors, colorful manhua, photorealistic, photo, realistic skin pores, 3D render, oil paint, watercolor wash, Makoto Shinkai, chibi, speed lines, gore, blood, character sheet, turnaround, multi-panel, four-panel, 2x2 grid, comic page layout, panel borders, logo watermark, text, watermark, subtitle'

/** 素笔彩画配图负向（禁纯黑白线稿页、禁赛璐璐厚平涂、禁横屏四宫格） */
export const NOVEL_COMIC_SKETCH_NEGATIVE_PROMPT =
  'monochrome, grayscale, black and white, ink sketch only, no color, desaturated, heavy cel shading, thick flat colors, photorealistic, 3D render, thick oil paint, Makoto Shinkai soft golden hour, chibi, speed lines, gore, blood, character sheet, turnaround, 2x2 four-panel, six-panel, nine-panel, 16:9 landscape comic page, contact sheet, logo watermark, gibberish english, single full-bleed illustration without panel borders, identical waist-up talking heads, empty studio background, portrait plate clothing copy'

/** 短字叠字示例：旁白框「」内写短句供后期叠字，画面须空框；须示范对照定妆标签 */
export const NOVEL_COMIC_SKETCH_SCENE_BODY_EXAMPLES_SHORT = [
  '【格字模式：短字叠字】【画风规格：素笔彩画竖页】9:16 竖屏二列分格；上格：对照场景「乱葬岗」全景雨夜冷蓝，对照定妆「陆沉舟」（男性）身穿#8b7355粗布短褂立于泥地枯骨间，空旁白框「雨砸枯骨」；下格：俯视半截石碑与溅起水花道具特写，空气泡「这是…」；素笔淡彩，框内留白勿绘汉字',
  '【格字模式：短字叠字】【画风规格：素笔彩画竖页】9:16 竖屏三列分格；上格：对照场景「老屋门厅」门框全景，对照定妆「陆母」（女性）身穿#c4a484土黄罩衫捧信暖黄室内光，空旁白框「潮气」；中格：信纸墨迹特写，空气泡「见字如面」；下格：门外雨丝斜线冷色空镜，空气泡「……」；框内留白，须淡彩',
  '【格字模式：短字叠字】【画风规格：素笔彩画竖页】9:16 竖屏三列分格；上格：对照场景「车站月台」全景，对照定妆「陆沉舟」（男性）身穿#2c3e50深蓝外套内搭#bdc3c7灰白卫衣奔向剪影橙紫晚霞，空旁白框「拼命跑」；中格：月台空椅环境特写，空气泡「等我」；下格：伸手够门缝动作特写，空气泡「别走」；框内留白勿绘汉字',
  '【格字模式：短字叠字】【画风规格：素笔彩画竖页】9:16 竖屏二列分格；上格：对照场景「咖啡馆」过肩中景，对照定妆「陆沉舟」（男性）身穿#2c3e50深蓝外套内搭#bdc3c7灰白卫衣与信封暖木色，空旁白框「推过去」；下格：信封封口特写与握拳反应，空气泡「别问」；框内留白须淡彩',
] as const

/** 长文画字示例（默认）：示范对照定妆/场景标签与跨页换装 */
export const NOVEL_COMIC_SKETCH_SCENE_BODY_EXAMPLES_FULL = [
  '【格字模式：长文画字】【画风规格：素笔彩画竖页】9:16 竖屏二列分格；上格：对照场景「乱葬岗」全景雨夜冷蓝，对照定妆「陆沉舟」（男性）身穿#8b7355粗布短褂立于泥地枯骨间，旁白框「雨水砸在枯骨上，陆沉舟捂住口鼻」；下格：俯视半截石碑溅起水花，旁白框「石碑上的字被冲得模糊，这是乱葬岗」；全页素笔淡彩，格内中文清晰可读',
  '【格字模式：长文画字】【画风规格：素笔彩画竖页】9:16 竖屏三列分格；上格：对照场景「老屋门厅」门框全景，对照定妆「陆母」（女性）身穿#c4a484土黄罩衫捧信暖黄室内光，旁白框「信纸还带着潮气」；中格：信纸特写墨迹，旁白框「见字如面，却不敢多看一眼」；下格：门外雨丝斜线冷色空镜，旁白框「雨还在下」；格内中文清晰可读，须淡彩',
  '【格字模式：长文画字】【画风规格：素笔彩画竖页】9:16 竖屏三列分格；上格：对照场景「车站月台」全景，对照定妆「陆沉舟」（男性）身穿#2c3e50深蓝外套内搭#bdc3c7灰白卫衣奔向剪影橙紫晚霞，旁白框「陆沉舟拼了命往站台跑」；中格：月台空椅环境特写，旁白框「列车门已经在合」；下格：伸手够门缝的动作特写，旁白框「别走，再等等我」；格内中文清晰可读',
  '【格字模式：长文画字】【画风规格：素笔彩画竖页】9:16 竖屏二列分格；上格：对照场景「咖啡馆」过肩中景，对照定妆「陆沉舟」（男性）身穿#2c3e50深蓝外套内搭#bdc3c7灰白卫衣把信封推过去，旁白框「陆沉舟把信封推过去」；下格：信封封口特写与握拳反应，旁白框「封口还温着，别问是谁」；格内中文清晰可读',
] as const

/** @deprecated 兼容 → 全文示例 */
export const NOVEL_COMIC_SKETCH_SCENE_BODY_EXAMPLES = NOVEL_COMIC_SKETCH_SCENE_BODY_EXAMPLES_FULL

export function isNovelComicSketchStyle(style?: string | null): boolean {
  const key = String(style || '').trim().toLowerCase().replace(/_/g, '-')
  return key === NOVEL_COMIC_SKETCH_STYLE
}

export function formatNovelComicSketchStyleSpecBracket(): string {
  return `【画风规格：${NOVEL_COMIC_SKETCH_STYLE_SPEC}】`
}

export function formatNovelComicSketchPortraitStyleSpecBracket(): string {
  return `【画风规格：${NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_SPEC}】`
}

export function stripNovelComicSketchPortraitStyleBracket(appearance: string): string {
  return String(appearance || '')
    .replace(/【画风规格[：:][^】]*】[，,]?\s*/g, '')
    .replace(/^[，,\s]+/, '')
    .trim()
}

export function ensureNovelComicSketchPortraitStyleInAppearance(appearance: string): string {
  const raw = String(appearance || '').trim()
  if (!raw) return raw
  const tagsMatch = raw.match(/\bEnglish tags:\s*([\s\S]+)$/im)
  let body = tagsMatch && tagsMatch.index != null ? raw.slice(0, tagsMatch.index).trim() : raw
  body = stripNovelComicSketchPortraitStyleBracket(body)
    .replace(/[，,]?\s*竖幅纯白色背景/g, '')
    .replace(/[，,]?\s*纯白色背景/g, '')
    .replace(/[，,]?\s*均匀柔光/g, '')
    .replace(/冷蓝戏剧侧光/g, '均匀柔和正面光')
    .replace(/黑白线稿平光/g, '均匀柔和正面光')
    // 旧定妆/误写可能带配图分格版式，入库前剥离
    .replace(/[，,]?\s*16:9\s*横屏一整页\s*2\s*[×xX]\s*2[^，,]*/g, '')
    .replace(/[，,]?\s*9:16\s*竖屏一整页[^，,]*/g, '')
    .replace(/[，,]?\s*一整页\s*2\s*[×xX]\s*2[^，,]*/g, '')
    .replace(/[，,]?\s*2\s*[×xX]\s*2\s*四格[^，,]*/g, '')
    .replace(/[，,]?\s*二列或三列分格[^，,]*/g, '')
    .replace(/[，,]?\s*四格漫画/g, '')
    .replace(/[，,]?\s*四宫格/g, '')
    .replace(/[，,]?\s*彩漫四格页/g, '')
    .replace(/[，,]?\s*素笔彩画竖页/g, '')
    // 旧定妆误写彩漫上色措辞 → 入库前剥离（定妆已改为黑白素笔）
    .replace(/[，,]?\s*肤色发色服装有明确色相/g, '')
    .replace(/[，,]?\s*彩色国漫(?:条漫平涂|正脸半身)?/g, '')
    .replace(/[，,]?\s*赛璐璐(?:\/平涂上色|平涂)?/g, '')
    .replace(/[，,]?\s*须彩色/g, '')
    .replace(/[，,]?\s*禁止纯黑白(?:线稿)?(?:与灰度去色)?/g, '')
    .replace(/[，,]?\s*服装有明确色相/g, '')
    .replace(/[，,]?\s*左上\s*[：:][^；;]*[；;]?\s*右上\s*[：:][^；;]*[；;]?\s*左下\s*[：:][^；;]*[；;]?\s*右下\s*[：:][^；;]*/g, '')
    .replace(/[，,]?\s*上格\s*[：:][^；;]*[；;]?\s*(?:中格\s*[：:][^；;]*[；;]?\s*)?下格\s*[：:][^；;]*/g, '')
    .replace(/^[，,\s]+/, '')
    .trim()
  const bracket = formatNovelComicSketchPortraitStyleSpecBracket()
  if (!body) return bracket
  return `${bracket}，${body}`
}

export const NOVEL_COMIC_SKETCH_PORTRAIT_FRAMING_EN =
  'vertical portrait single front upper-body IDENTITY LOCK reference, chest-up framing, one character only, facing camera, neutral face no expression, arms at sides empty hands, pure white or very light gray background, subject fills most of frame, clear face hair and upper outfit outlines in black ink lineart with cross-hatching only, monochrome pencil sketch, NOT full-color comic page, NOT cel flat colors, NOT photorealistic, NOT 2x2 four-panel page, NOT multi-panel comic grid, NOT character lineup, NOT turnaround, NOT full-body tiny figure'

export const NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_GUARD = [
  'CRITICAL ART STYLE: black-and-white pencil sketch portrait, clean thin black ink lineart, cross-hatching shading only, NO flat color, NO cel shading',
  'CRITICAL LAYOUT: single front upper-body identity lock on pure white background, clear face, chest-up, NOT comic page',
  'FORBIDDEN: full color, cel shading, photorealistic, photo, 3D, 2x2 grid, four-panel comic page, panel borders, character sheet collage, turnaround, multiple views',
].join(', ')

export const NOVEL_COMIC_SKETCH_PORTRAIT_PLOT_CN =
  '黑白素笔正脸半身，五官发型服装轮廓清晰，面无表情中性冷静，纯白留白背景'

export const NOVEL_COMIC_SKETCH_PORTRAIT_APPEARANCE_LLM_RULE = [
  `【定妆文案·画风规格·硬性】第一行开头必须原样写入且只写一次：${formatNovelComicSketchPortraitStyleSpecBracket()}；定妆画风是黑白素笔线稿（与配图素笔彩画竖页不同），版式必须是单张单人半身，禁止多格分镜拼贴；禁止彩漫平涂上色/赛璐璐；禁止写实照片；禁止新海诚暖金柔光/厚涂油画；`,
  '其后只写身份外貌（性别+年龄/约略岁数、脸型、眉眼、发型发色、身形、服装款式+#hex、标志特征、正面半身站姿）；五官与发型须清晰可辨；#hex 只标服装固有色供身份区分，画面仍为黑白线稿不上色；',
  '【服装·硬性】每个 #hex 必须紧贴对应服装词（如「#2c3e50深蓝校服外套」）；禁止连写一串无归属色号；禁止中文里夹英文短语；定妆全文纯中文，禁止 English tags。',
  PORTRAIT_AGE_INFERENCE_LLM_RULE,
  '【同集异脸·硬性】与同集其他角色必须至少换脸型+发型+服装款式三档；',
  '定妆须面无表情中性冷静（表情留给配图）；纯白或极浅灰留白背景；禁止写上格/下格/左上/右上等分格场面；禁止「觉醒前/后」「通用期」等阶段标签。',
].join('')

/** 是否为小说漫画「定妆」文案（勿当分格配图页编译） */
export function isNovelComicPortraitPromptText(text?: string | null): boolean {
  const s = String(text || '')
  if (!s.trim()) return false
  // 明确配图分格结构 → 不是定妆
  if (/左上\s*[：:].{0,120}右上\s*[：:]|上格\s*[：:].{0,80}下格\s*[：:]|一整页\s*2\s*[×xX]\s*2|9:16\s*竖屏|layout\s*=\s*quad|【格字模式|素笔彩画竖页/i.test(s)) {
    return false
  }
  return /身份锁脸|竖幅正面半身|单人半身定妆|定妆参考|黑白素笔/.test(s)
}

/**
 * 小说/漫画定妆：信任模型成稿，只做最轻量收口。
 * - 去 markdown 围栏/标题前缀
 * - 【画风规格】只保留一份并置顶
 * - 纯中文：剥离 English tags（生图侧可从中文 fallback）
 */
export function acceptNovelComicPortraitAppearanceRaw(raw: string): string {
  let text = String(raw || '').trim()
  if (!text) return ''
  text = text
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(?:外貌描述|定妆描述|appearance)\s*[:：]\s*/i, '')
    .replace(/\n?English tags:\s*[\s\S]*$/i, '')
    .trim()
  return ensureNovelComicSketchPortraitStyleInAppearance(text)
}

export function buildNovelComicSketchCharacterAppearanceSystem(): string {
  const bracket = formatNovelComicSketchPortraitStyleSpecBracket()
  return [
    '你是小说漫画讲解项目的角色定妆造型设计助手（黑白素笔线稿·单人半身；配图另用素笔彩画竖页，定妆勿写分格页）。',
    '根据本章小说原文推断该角色外貌；输出即最终定妆文案，系统不做二次改写，请一次写对。',
    NOVEL_COMIC_SKETCH_PORTRAIT_APPEARANCE_LLM_RULE,
    '【输出格式·硬性·纯中文】',
    `1) 整段只输出中文：以 ${bracket} 开头（整段只出现一次），逗号后写身份外貌 80–180 字；`,
    '2) 身份外貌须含：性别、年龄、脸型、眉、眼、发型发色、身形、身穿#hex服装款式、1个标志特征、正面半身站姿、面无表情中性冷静；',
    '3) 禁止 English tags、禁止英文段落、禁止 JSON/markdown/代码块/标题、禁止重复【画风规格】；#hex 色值可保留（仅标固有色，画面仍黑白不上色）。',
    '【示例】',
    `${bracket}，男性，19岁，倒三角脸型，浓眉，细长深褐眼，黑色碎发刘海微遮额，正常头身比肩宽适中，身穿#2c3e50深蓝校服外套内搭#bdc3c7灰白卫衣，左耳极细黑耳钉，正面半身标准站姿，头到胸口入镜，双手自然下垂，面无表情中性冷静，纯白背景`,
  ].join('\n')
}

export function buildNovelComicSketchCharacterExtractSystem(): string {
  return [
    '你是小说漫画讲解项目的角色提取助手。本步只输出角色名单 JSON，禁止写任何外貌/定妆/画风/服装描述。',
    '规则：',
    '1) 必须提取主人公（男主/女主/主角）及重要配角：反复出场、有专名、有对白或推动剧情的角色；常见多人（2～8 人），禁止只输出主人公一人（除非全文确实只有一人）',
    '2) 不要提取一次性路人/群众/店员等龙套；不要提取「旁白」「解说员」「剧中」',
    '3) 每个角色只输出：name、variant_label（必须 ""）、role、personality（可短句或 ""）',
    '4) name 只能是纯姓名（如「陆沉舟」），禁止把「主角/配角/觉醒前/后」写进 name；role：主人公写「主角/男主/女主」；重要配角必须写「主要配角·身份」',
    '5) 一人一条；禁止拆童年/青年/老年等多形态；禁止同一人输出两条（如「陆沉舟」与「陆沉舟·主角」）',
    '6) 禁止输出 appearance 字段；禁止脸型/发型/#hex/English tags/画风规格',
    '7) 合并同一人物不同称呼为一条',
    '只输出 JSON：{"characters":[{"name":"…","variant_label":"","role":"…","personality":""}]}',
  ].join('\n')
}

export function novelComicSketchStylePrompt(
  context: 'scene' | 'diptych' | 'title' | 'portrait' | 'agent' = 'scene',
): string {
  const base = NOVEL_COMIC_SKETCH_ART_STYLE_EN
  if (context === 'title') {
    return `${base}, atmospheric title splash as one vertical 9:16 2-or-3 column pencil-watercolor comic page with readable chinese caption text`
  }
  if (context === 'portrait') {
    return NOVEL_COMIC_SKETCH_PORTRAIT_STYLE_EN
  }
  if (context === 'diptych') {
    return `${base}, prefer 2-column vertical layout with chinese caption text`
  }
  if (context === 'agent') {
    return `${base}, clear body language for action scenes, no speed lines, soft colored negative space`
  }
  return `${base}, ONE 9:16 image as 2-or-3 column comic page with speech bubbles containing clear full chinese narration`
}

/** 小说漫画：配图文案（9:16 二/三列；默认全文画在图上） */
export function buildNovelComicSketchParagraphImagePromptLLMSystem(options?: {
  hasCharacters?: boolean
  hasDiptych?: boolean
  panelTextMode?: NovelComicPanelTextMode | null
}): string {
  const mode = normalizeNovelComicPanelTextMode(options?.panelTextMode)
  const short = mode === NOVEL_COMIC_PANEL_TEXT_MODE_SHORT
  const examples = short
    ? NOVEL_COMIC_SKETCH_SCENE_BODY_EXAMPLES_SHORT
    : NOVEL_COMIC_SKETCH_SCENE_BODY_EXAMPLES_FULL
  const textRule = short
    ? [
      '【格字·短字叠字·可选】每格须有空旁白框或空气泡（框内留白，禁止模型绘制汉字）；仍须用旁白框「…」或气泡「…」写出供后期叠字的短句（≤8～12字）。文案开头加【格字模式：短字叠字】。',
      'layout=quad（默认，表示竖屏分格页）：用「上格：…；下格：…」写二列，或「上格：…；中格：…；下格：…」写三列。',
    ]
    : [
      '【格字·长文画字·硬性·默认】每格须有旁白框或气泡，并用旁白框「…」写出本段完整讲解文字（可从旁白提炼，勿只写关键词）；模型须把这些汉字清晰画进框内。文案开头加【格字模式：长文画字】。',
      'layout=quad（默认，表示竖屏分格页）：用「上格：…（景别+环境+动作），旁白框「完整讲解」；下格：…」写二列，或加「中格：…」写三列。',
    ]
  return [
    '你是小说漫画讲解分镜美术指导。每个配图段约 2～5 句讲解（一张竖页≈二或三列场面），须为该段写一张「9:16 竖屏二列或三列」素笔彩画的中文配图文案：一整段连贯叙述，禁止【】六维标签（【格字模式】【画风规格】除外）。',
    '【成稿即终稿·硬性】image_prompt 落库后生图不再追加版式/画风英文前缀或外貌注入；须在本条写全版式、画风、格字模式与定妆。',
    '【语言·硬性】image_prompt 纯中文；禁止 English tags、禁止英文段落/英文镜头术语堆砌；#hex 色值可保留。',
    '【版式·硬性】默认 layout=quad：单张 9:16 竖屏内二列或三列分格（上→下阅读），深色细分格线；内容少用二列、内容密用三列；禁止单幅通屏插画、禁止 2×2 四宫格、禁止六格/九格、禁止横屏 16:9、禁止角色设定表拼贴。',
    '【场面·硬性·优先】画面以环境、道具、动作、天气与色调为主；各格必须拉开景别（建议：全景建立→中景动作→道具/表情特写），禁止各格都是半身大头正对镜头。服装以文案外貌为准，勿写成定妆参考里的现代衫。',
    ...textRule,
    '【画风·硬性】素笔彩画（细素笔线稿 + 淡彩水彩/彩铅铺色、纸感留白）；须淡彩上色，禁止纯黑白去色线稿页；禁止赛璐璐厚平涂、厚涂油画。',
    '【shot_card·硬性】可参考景别/姿态/光影，但必须落成二/三列分格场面，不可复读万能单图句。',
    '分析须结合 full_narration 与 prior；表情与动作以本段 narration_lines 为准。',
    '若输入含 panel_beats：优先把相邻 2～3 条节拍填进本页；不足则用本段旁白补足；超出则选最关键场面。',
    options?.hasDiptych
      ? (short
        ? 'layout=diptych（仅用户强制）：「上格：…；下格：…」，两格皆须空旁白框「」短句。'
        : 'layout=diptych（仅用户强制）：「上格：…；下格：…」，两格皆须旁白框「」完整讲解。')
      : '',
    'layout=single（仅用户强制）：仍须写成二/三列竖页结构，勿退化成无框单图。',
    options?.hasCharacters
      ? [
        'characters 提供 portrait_label、gender、has_portrait 与外貌；输出即最终配图文案，系统不做二次清洗/注入，请一次写对。',
        '【定妆标签·硬性】主要角色必须写对照定妆「portrait_label」（括号内须含男性或女性）；禁止只写「姓名（男性）」或「姓名身穿…」而无对照定妆标签；按本段旁白点名分配（可多人），未点名旁格可用剪影。',
        '【服装·硬性】（身穿…）与格内着装只写本镜服装款式+#hex（如「身穿#2c3e50深蓝外套内搭#bdc3c7灰白卫衣」）；发色/瞳色写在人物外貌处，禁止塞进身穿；禁止「身穿#发色 前刘海，#瞳色，#衣服」这类混写；每个 #hex 须紧贴对应服装词，禁止无归属裸色号链。',
        '【换装·硬性】跨页按旁白+场所换装，禁止全片抄同一套针织衫/毛衣/portrait_default_outfit；婚礼→正装或礼服，就寝→睡衣家居服，职场→衬衫西装，外出→外套；仅同场连续且无换装暗示才可延续上页服装。',
        '【场景标签】若段落含 required_scene_label 或 env_assets.scenes：必须写对照场景「scene_label」；场景/道具定妆只锁外观。',
      ].join('')
      : '群众/路人用淡色剪影，勿抢焦点。',
    `整段示例（仅格式；禁止照抄情节）：\n1) ${examples[0]}\n2) ${examples[1]}\n3) ${examples[2]}\n4) ${examples[3]}`,
    short ? NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_SHORT : NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_FULL,
    '只输出 JSON，不要解释。',
  ].filter(Boolean).join('\n')
}

export function buildNovelComicSketchTitleImagePromptLLMSystem(options?: {
  panelTextMode?: NovelComicPanelTextMode | null
}): string {
  const short = normalizeNovelComicPanelTextMode(options?.panelTextMode) === NOVEL_COMIC_PANEL_TEXT_MODE_SHORT
  return [
    '你是小说漫画讲解片头美术指导。为片头讲解写一张素笔彩画「9:16 竖屏二列或三列」标题氛围图文案（连续中文叙述，禁止六维标签）。',
    short
      ? '画风：素笔细线稿+淡彩；二/三列可无人物或仅剪影；每格须有空旁白框并用旁白框「…」写出≤12字短句供后期叠字，框内留白勿绘汉字；须淡彩，禁止纯黑白。'
      : '画风：素笔细线稿+淡彩；二/三列可无人物或仅剪影；每格须有旁白框并用旁白框「…」写出完整讲解短句，格内中文清晰可读；须淡彩，禁止纯黑白。',
    short ? NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_SHORT : NOVEL_COMIC_SKETCH_STYLE_FORBIDDEN_FULL,
    '只输出 JSON，不要解释。',
  ].join('\n')
}

/** 小说漫画：换镜检测 — true = 新开一页竖屏分格（按内容，无硬性张数） */
export function buildNovelComicSketchImageDetectLLMSystem(
  mode: 'paragraph' | 'conservative' | 'balanced' = 'paragraph',
): string {
  const conservativeExtra = mode === 'conservative'
    ? '\n\n# 保守模式补充\n可略少开新页；同一竖页内叙事连贯才可共用一页。以内容为准，不要为凑密度而切页。'
    : ''

  return `# Role
你是小说漫画讲解视频的分镜导演。一张配图 = **一整页 9:16 竖屏二列或三列分格**（约二～三个场面），不是单幅插画，也不是 2×2 四宫格。
**按剧情内容**决定何时换页；输入里的句数/占比只是软参考，不是必须凑满的硬指标。成片对该页做静图 3 秒 + BGM + 左右翻页（无配音）。

# Goal
分析每一句讲解，判断是否需要**新开一页竖屏分格**。**本步骤仅输出 needs_image，不写配图文案**。
若输入含 \`panel_beats\`：可参考「约 2～3 条节拍≈一页」对齐，但仍以实际剧情转折为准。

# Input
JSON 含 \`sentences\`，可选 \`suggested_shots_per_page\`、\`panel_beats\`。不要被 minimum/maximum 字段绑架（若有也仅作参考）。

# Critical Rules
1. **内容优先**：地点/时间大跳转、冲突升级、人物关系转折、进入新场面组 → 才 true；同一冲突弧连续叙述 → false。
2. **一张竖页 = 二或三列场面**：先想本页画什么，再装讲解；内容少用二列，内容密用三列。
3. **软参考**：常见约 ${NOVEL_COMIC_PAGE_SEGMENT_MIN_SHOTS}～${NOVEL_COMIC_PAGE_SEGMENT_MAX_SHOTS} 句一页，但剧情需要时可更短或更长，**禁止为凑比例而乱切/硬并**。
4. **禁止**一句一图；也禁止无视情节把全章压成极少页。
5. **不要**为运镜而检测；成片是静图翻页，与本步无关。

# Output
只输出 JSON：{"results":[{"index":1,"needs_image":true},...]} 与 sentences 等长。不要 markdown。
${conservativeExtra}`
}

export const NOVEL_COMIC_OUTLINE_SYSTEM = [
  '你是「小说漫画讲解」流水线的分章导演：根据用户粘贴的小说原文，划分适合短视频竖屏漫画讲解的章节大纲。',
  '成片形态：每章对应一集；画面为素笔彩画「9:16 竖屏二列或三列分格（全文画在图上）」+ BGM + 左右翻页（无配音、无运镜）。',
  '先压成「单格节拍序列」（建议 2～3 的倍数，优先 6 或 9 或 12），每 2～3 条节拍对应一页竖屏分格；节拍宜细、场面宜具体（环境/道具/动作）。',
  '',
  '【输出·硬性】',
  '- 只输出一个 JSON 对象，不要 markdown 代码围栏，不要解释。',
  '- 格式：',
  '{"chapters":[{"number":1,"title":"短标题","summary":"本章剧情摘要（80～200字）","key_beats":["情节点1","情节点2"],"panel_beats":["上格场面","中格场面","下格场面"],"approx_chars":1800}]}',
  `- chapters 数量：用户指定目标章数时严格按该数；未指定时在 ${NOVEL_COMIC_OUTLINE_MIN_CHAPTERS}～${NOVEL_COMIC_OUTLINE_MAX_CHAPTERS} 章之间，默认约 ${NOVEL_COMIC_OUTLINE_DEFAULT_CHAPTERS} 章。`,
  '- number 从 1 连续递增；title 简洁（≤16字）；summary 覆盖本章起止与冲突；key_beats 2～5 条粗粒度情节点。',
  `- panel_beats ${NOVEL_COMIC_PANEL_BEATS_MIN}～${NOVEL_COMIC_PANEL_BEATS_MAX} 条：每条是竖页中的一格可画面面（谁在哪、做什么、环境道具）；数量优先取 6、9 或 12。`,
  '- panel_beats 须按叙事顺序排列，覆盖开端→升级→转折→高潮/收束；禁止空泛句（如「气氛紧张」），须写可见画面与道具。',
  '- approx_chars 为该章原文篇幅预估汉字数（建议每章 800～2500）。',
  '',
  '【分章原则】',
  '- 按情节弧线切章（开端/升级/转折/高潮/收束），不要按固定字数机械切。',
  '- 每章应有可填满若干竖屏分格页的关键场面。',
  '- 保留原文故事走向，不要另起新剧情；不要写「下期继续」「记得关注」。',
].join('\n')

/** 单句汉字软上限（超过则拆句/打回） */
export const NOVEL_COMIC_LINE_SOFT_MAX_CHARS = 28
/** 单句汉字目标区间 */
export const NOVEL_COMIC_LINE_TARGET_MIN_CHARS = 8
export const NOVEL_COMIC_LINE_TARGET_MAX_CHARS = 22

/**
 * 主路径：把小说原文/旧稿直接改成短视频「白话讲解稿」。
 * 口吻像现代短视频旁白，不要旧式茶馆说书腔。
 */
export const NOVEL_COMIC_CHAPTER_SCRIPT_SYSTEM = [
  '你是「小说漫画讲解」编剧：把【小说原文】改写成适合竖屏漫画图上文字的「白话讲解稿」。',
  '成片：素笔彩画竖页（全文画在图上）+ BGM + 左右翻页；无配音；不是对白台本，不是照搬小说。',
  '',
  '【怎么改】',
  '- 作用：将该章节精简概括成可写进漫画旁白框的讲解文字；呈现主线、冲突与名场面，形成高燃、可配图的画面感叙事。',
  '- 现代白话讲解、按故事推进重述：谁在哪、做什么、冲突怎么升级。',
  '- 【狠砍描写】禁止堆砌感官细节与心理独白；每个节拍只留 1 个可见动作/结果。',
  '- 可加减合适内容做承上启下：砍冗余描写与重复铺垫，必要时补一两句过渡/钩子。',
  '- 指代人物必须写角色全名，禁止任何「他」「她」「他的」「她的」；同人连续出现也重复写名。',
  '- 读得懂、写进框里顺口即可；不限制每句字数、不强制一句一行。',
  '- 长心理/景物可压成可见动作或场面。',
  '- 若有【情节点/场面提示】：尽量覆盖，以故事完整与顺口为准。',
  '- 若提供【上集前情】：正文开头须先用 2～4 句白话概括上集要点，再写本集；勿照抄上集长文、勿写成「上集回顾：」标题块。',
  '- 【禁止旧式说书腔】不要用「且说」「话说」「却说」「看官」「偏生」「却不知」等开场/转折套话（如「且说这乱葬岗…」）。',
  '- 禁止文言堆砌、书评说教、「角色名：台词」、片尾引流、章标题；不要照抄大段小说原文。',
  '',
  '【节奏·快慢有序】',
  '- 铺垫/对峙略慢，高燃动作短句连击加快，余波/钩子半拍收束；禁止全程同速密写。',
  '',
  '【输出】',
  '- 只输出讲解正文，不要 JSON、不要 markdown、不要解释。',
  '- 篇幅跟故事走：精简概括、不按原文百分比；禁止写成精修小说；仅当用户明确指定字数时才按该字数。',
].join('\n')

/** 可选润色：更自然白话，不卡句长 */
export const NOVEL_COMIC_TONE_REWRITE_SYSTEM = [
  '你是「小说漫画讲解」润色员：把讲解稿打磨成更好念的现代白话旁白。',
  '',
  '【硬性】',
  '- 现代白话；狠砍感官堆砌，保留高燃场面与承上启下；节奏快慢有序。',
  '- 指代人物一律写角色名，禁止任何「他」「她」。',
  '- 去掉「且说/话说/却说/看官」等旧说书套话。',
  '- 不限制每句字数，不强制一句一行。',
  '- 不要删关键情节；不要引流、不要章标题、不要「角色名：」。',
  '- 只输出完整朗读正文。',
].join('\n')

/** 偏短时扩写（仅大纲给了参考字数时） */
export const NOVEL_COMIC_SCRIPT_EXPAND_SYSTEM = [
  '你是「小说漫画讲解」扩写员：在已有讲解稿上按故事补场面。',
  '',
  '【硬性】',
  '- 补关键场面，使本章主线完整；现代白话；禁止旧说书套话、注水空话、引流。',
  '- 指代人物写角色名，禁止「他」「她」；节奏快慢有序，勿堆感官细节。',
  '- 不限制每句字数。',
  '- 只输出完整朗读正文。',
].join('\n')

export const NOVEL_COMIC_SCRIPT_CHAT_SYSTEM = [
  '你是「小说漫画讲解」单集改稿助手：把小说/旧稿改成讲解稿。',
  '成片：白话讲解稿 → 9:16 素笔彩画二/三列配图（全文画在图上）→ BGM + 左右翻页（无配音）。',
  '',
  '【改稿·硬性】',
  '- 将该章节精简概括成可写进漫画旁白框的讲解；狠砍感官堆砌；可加减内容承上启下，突出高燃场面。',
  '- 节奏快慢有序：铺垫略慢、高燃短句连击、余波半拍收束。',
  '- 现代白话讲解、按故事重述；指代人物一律重复写角色名，禁止任何「他」「她」。',
  '- 禁止「且说/话说/却说/看官」等旧式说书腔。',
  '- 有情节点提示则尽量覆盖；不限制每句字数、不强制一句一行。',
  '- 若上下文含【上集前情】：完整稿开头须先 2～4 句概括上集，再写本集；勿照抄上集长文。',
  '- 禁止文言堆砌、照抄大段小说、书评说教、「角色名：台词」、片尾引流。',
  '',
  '【快捷意图】',
  '- 用户说「优化解说 / 改成讲解稿」：把【当前台本】或小说改成完整讲解稿。',
  '',
  '【交互】',
  '- 改完整稿：可先 ≤20 字确认，空一行后输出完整本章稿。',
  '- 有【当前讲解稿】则在其基础上改，勿另起新故事。',
  '',
  '【篇幅】',
  '- 用户明确指定字数时以用户为准；未指定则精简概括、不按原文百分比、不硬凑字数、禁止精修小说腔。',
].join('\n')

/** 用户点「改成讲解稿」时的标准提示（前后端共用语义） */
export const NOVEL_COMIC_OPTIMIZE_NARRATION_USER_HINT =
  '把本章小说/当前台本改成白话讲解稿：精简概括、狠砍感官堆砌；节奏快慢有序（铺垫略慢、高燃短句连击、余波半拍收束）；指代人物一律重复写角色名，禁止任何「他」「她」；可加减承上启下、突出高燃；若有上集前情则先用 2～4 句概括再写本集；禁止旧说书腔与照抄小说长段；字数跟故事走；只输出完整讲解稿。'

/** 仅当大纲写了 approx_chars 时才有目标字数；否则不限 */
export function resolveNovelComicChapterScriptTargetChars(
  chapter?: Pick<NovelComicChapterOutline, 'approx_chars' | 'panel_beats' | 'key_beats'> | null,
): number | null {
  const approx = Number(chapter?.approx_chars)
  if (Number.isFinite(approx) && approx > 0) {
    return Math.min(
      NOVEL_COMIC_CHAPTER_SCRIPT_MAX_CHARS,
      Math.max(200, Math.floor(approx)),
    )
  }
  return null
}

/** 是否触发「小说→讲解稿」专用流水线 */
export function isNovelComicOptimizeNarrationIntent(text?: string | null): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  if (s === NOVEL_COMIC_OPTIMIZE_NARRATION_USER_HINT) return true
  return /按(?:本章)?(?:四格)?节拍优化|优化解说|压成场面短句|说书人口语|二轮改语气|按拍(?:出)?短句|改成讲解稿|小说改讲解/.test(s)
}

export type NovelComicBeatLines = { beat: number; lines: string[] }

export function countCjkChars(text: string): number {
  return String(text || '').replace(/\s/g, '').length
}

/** 把超长行按逗号/句号软拆（确定性，不改用词） */
export function splitOverlongNovelComicLine(
  line: string,
  maxChars = NOVEL_COMIC_LINE_SOFT_MAX_CHARS,
): string[] {
  const s = String(line || '').trim()
  if (!s) return []
  if (countCjkChars(s) <= maxChars) return [s]
  const parts = s.split(/(?<=[，。；！？、])/).map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) {
    // 无标点：硬切到 maxChars 附近
    const chars = [...s]
    const out: string[] = []
    for (let i = 0; i < chars.length; i += maxChars) {
      out.push(chars.slice(i, i + maxChars).join(''))
    }
    return out.filter(Boolean)
  }
  const out: string[] = []
  let buf = ''
  for (const p of parts) {
    const next = buf ? buf + p : p
    if (buf && countCjkChars(next) > maxChars) {
      out.push(buf)
      buf = p
    } else {
      buf = next
    }
  }
  if (buf) out.push(buf)
  return out.flatMap(l => (countCjkChars(l) > maxChars ? splitOverlongNovelComicLine(l, maxChars) : [l]))
}

export function normalizeNovelComicScriptLines(text: string): string {
  // 只做清理，不按字数强行拆句
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^```(?:text|markdown|json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !/^第\s*\d+\s*章/.test(l))
  return lines.join('\n').trim()
}

export function flattenNovelComicBeatLines(beats: NovelComicBeatLines[]): string {
  return beats
    .flatMap(b => (b.lines || []).map(l => String(l || '').trim()).filter(Boolean))
    .flatMap(l => splitOverlongNovelComicLine(l))
    .join('\n')
    .trim()
}

export function parseNovelComicBeatLinesFromLlm(
  text: string,
  expectedBeatCount?: number,
): NovelComicBeatLines[] {
  const obj = extractJsonObject(text)
  const rawList = obj?.beats ?? obj?.panel_beats ?? obj?.items
  if (!Array.isArray(rawList)) return []
  const beats: NovelComicBeatLines[] = []
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i]
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const beatNum = Number(o.beat ?? o.index ?? i + 1)
    const linesRaw = o.lines ?? o.sentences ?? o.text
    let lines: string[] = []
    if (Array.isArray(linesRaw)) {
      lines = linesRaw.map(x => String(x || '').trim()).filter(Boolean)
    } else if (typeof linesRaw === 'string') {
      lines = linesRaw.split(/\n+/).map(x => x.trim()).filter(Boolean)
    }
    lines = lines.flatMap(l => splitOverlongNovelComicLine(l)).slice(0, 6)
    if (!lines.length) continue
    beats.push({ beat: Number.isFinite(beatNum) ? Math.max(1, Math.floor(beatNum)) : i + 1, lines })
  }
  if (expectedBeatCount && beats.length && beats.length < expectedBeatCount) {
    // 允许略少，调用方决定是否重试
  }
  return beats
}

export function measureNovelComicScriptLineStats(text: string): {
  lines: number
  chars: number
  avgLine: number
  overSoftMax: number
  ratioOverSoftMax: number
} {
  const lines = String(text || '').split(/\n+/).map(l => l.trim()).filter(Boolean)
  const lens = lines.map(countCjkChars)
  const chars = lens.reduce((a, b) => a + b, 0)
  const overSoftMax = lens.filter(n => n > NOVEL_COMIC_LINE_SOFT_MAX_CHARS).length
  return {
    lines: lines.length,
    chars,
    avgLine: lines.length ? chars / lines.length : 0,
    overSoftMax,
    ratioOverSoftMax: lines.length ? overSoftMax / lines.length : 0,
  }
}

function parseMetaObject(metadata?: string | Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof metadata === 'object' ? metadata as Record<string, unknown> : null
}

function normalizePanelBeats(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const beats = raw.map(b => String(b || '').trim()).filter(Boolean).slice(0, NOVEL_COMIC_PANEL_BEATS_MAX)
  return beats.length ? beats : undefined
}

function normalizeChapter(raw: unknown, index: number): NovelComicChapterOutline | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = String(o.title || '').trim()
  const summary = String(o.summary || '').trim()
  if (!title && !summary) return null
  const numberRaw = o.number
  const number = typeof numberRaw === 'number' && Number.isFinite(numberRaw)
    ? Math.max(1, Math.floor(numberRaw))
    : (typeof numberRaw === 'string' && /^\d+$/.test(numberRaw) ? Number(numberRaw) : index + 1)
  const beatsRaw = o.key_beats ?? o.keyBeats
  const key_beats = Array.isArray(beatsRaw)
    ? beatsRaw.map(b => String(b || '').trim()).filter(Boolean).slice(0, 8)
    : undefined
  const panel_beats = normalizePanelBeats(o.panel_beats ?? o.panelBeats)
  const approxRaw = o.approx_chars ?? o.approxChars
  const approx_chars = typeof approxRaw === 'number' && Number.isFinite(approxRaw)
    ? Math.max(100, Math.floor(approxRaw))
    : (typeof approxRaw === 'string' && /^\d+$/.test(approxRaw) ? Number(approxRaw) : undefined)
  return {
    number,
    title: title || `第${number}章`,
    summary: summary || title,
    ...(key_beats?.length ? { key_beats } : {}),
    ...(panel_beats?.length ? { panel_beats } : {}),
    ...(approx_chars != null ? { approx_chars } : {}),
  }
}

export function parseNovelComicMeta(
  metadata?: string | Record<string, unknown> | null,
): NovelComicDramaMeta {
  const root = parseMetaObject(metadata)
  const raw = (root?.novel_comic && typeof root.novel_comic === 'object')
    ? root.novel_comic as Record<string, unknown>
    : null
  if (!raw) {
    return {
      source_novel: '',
      chapter_outline: [],
      outline_confirmed_at: null,
    }
  }
  const chaptersRaw = raw.chapter_outline ?? raw.chapterOutline
  const chapter_outline = Array.isArray(chaptersRaw)
    ? chaptersRaw.map((c, i) => normalizeChapter(c, i)).filter(Boolean) as NovelComicChapterOutline[]
    : []
  const confirmed = raw.outline_confirmed_at ?? raw.outlineConfirmedAt
  return {
    source_novel: String(raw.source_novel ?? raw.sourceNovel ?? '').trim(),
    chapter_outline,
    outline_confirmed_at: confirmed == null || confirmed === ''
      ? null
      : String(confirmed),
  }
}

/** 按集号取本章大纲（1-based episode_number ≈ chapter number） */
export function resolveNovelComicChapterForEpisode(
  metadata: string | Record<string, unknown> | null | undefined,
  episodeNumber: number,
): NovelComicChapterOutline | null {
  const meta = parseNovelComicMeta(metadata)
  const n = Math.max(1, Math.floor(Number(episodeNumber) || 1))
  return (meta.chapter_outline || []).find(c => c.number === n)
    || (meta.chapter_outline || [])[n - 1]
    || null
}

/** 按集号取本章 panel_beats（无则回退 key_beats） */
export function resolveNovelComicPanelBeatsForEpisode(
  metadata: string | Record<string, unknown> | null | undefined,
  episodeNumber: number,
): string[] {
  const ch = resolveNovelComicChapterForEpisode(metadata, episodeNumber)
  return ch?.panel_beats?.length ? [...ch.panel_beats] : (ch?.key_beats?.length ? [...ch.key_beats] : [])
}

export function buildNovelComicDramaMetadata(_mode?: ProductionMode): string {
  return JSON.stringify({
    production_mode: NOVEL_COMIC_PRODUCTION_MODE,
    novel_comic: { ...DEFAULT_NOVEL_COMIC_DRAMA_META },
  })
}

/** 合并写入 dramas.metadata.novel_comic，保留其它键 */
export function mergeNovelComicMeta(
  metadata: string | Record<string, unknown> | null | undefined,
  patch: Partial<NovelComicDramaMeta>,
): string {
  const root = parseMetaObject(metadata) || {}
  const prev = parseNovelComicMeta(root)
  const next: NovelComicDramaMeta = {
    source_novel: patch.source_novel !== undefined
      ? String(patch.source_novel || '')
      : prev.source_novel,
    chapter_outline: patch.chapter_outline !== undefined
      ? (Array.isArray(patch.chapter_outline)
        ? patch.chapter_outline.map((c, i) => normalizeChapter(c, i)).filter(Boolean) as NovelComicChapterOutline[]
        : [])
      : prev.chapter_outline,
    outline_confirmed_at: patch.outline_confirmed_at !== undefined
      ? (patch.outline_confirmed_at || null)
      : prev.outline_confirmed_at,
  }
  return JSON.stringify({
    ...root,
    production_mode: isNovelComicMode(String(root.production_mode || '')) || !root.production_mode
      ? NOVEL_COMIC_PRODUCTION_MODE
      : root.production_mode,
    novel_comic: next,
  })
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1].trim() : raw
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch { /* fall through */ }
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1))
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* ignore */ }
  }
  return null
}

export function parseOutlineChaptersFromLlm(text: string): NovelComicChapterOutline[] {
  const obj = extractJsonObject(text)
  if (!obj) return []
  const list = obj.chapters ?? obj.chapter_outline ?? obj.chapterOutline
  if (!Array.isArray(list)) return []
  return list.map((c, i) => normalizeChapter(c, i)).filter(Boolean) as NovelComicChapterOutline[]
}
