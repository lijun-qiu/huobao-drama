/**
 * 解说视频：场景定妆 + 道具定妆
 * - 从分镜聚类场所，写入 scenes / episode_scenes，绑定 storyboards.scene_id
 * - 抽取可复现关键道具，写入 props（type=narration:{episodeId}）
 * - 供配图文案写「对照场景」「对照道具」，生图时挂参考
 * - 描述词：LLM 按 2D 无人环境/静物规则生成后原样落库，不做后处理清洗
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { callTextChat } from './text-chat.js'
import { getTextConfig, assertTextConfigHasCredentials } from './ai.js'
import { now } from '../utils/response.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { parseNarrationImageMeta } from './narration-image.js'
import { extractJsonObject } from '../constants/novel-comic.js'
import {
  formatNarrationStyleSpecBracket,
  isNarrationMinimalStyle,
  NARRATION_ANIME_STYLE,
  resolveEpisodeVisualStyle,
  usesComicIllustrationPipeline,
} from '../constants/art-styles.js'
import {
  MOTION_COMIC_STYLE,
} from '../constants/motion-comic.js'

const MAX_SCENES = 8
const MAX_PROPS = 10
/** 道具须在至少 N 条旁白/分镜中出现才提取（一次性路过不要） */
const MIN_PROP_LINE_HITS = 2

/** 近义道具名 → 规范名（避免「香烟」「烟头」各抽一条） */
const PROP_NAME_CANONICAL: Array<{ re: RegExp; name: string }> = [
  { re: /没点着的烟|香烟|烟头|烟蒂|抽烟|点烟|^烟$/, name: '香烟' },
  { re: /试卷|卷子/, name: '试卷' },
  { re: /笔杆|钢笔|圆珠笔|铅笔|笔尖|^笔$/, name: '笔' },
  { re: /针管|注射器/, name: '针管' },
  { re: /手机|微信屏幕|手机屏幕/, name: '手机' },
  { re: /书包|背包/, name: '书包' },
  { re: /橡皮/, name: '橡皮' },
  { re: /金属盒/, name: '金属盒' },
]

function canonicalizePropName(name: string): string {
  const n = String(name || '').trim()
  if (!n) return ''
  for (const { re, name: canon } of PROP_NAME_CANONICAL) {
    if (re.test(n)) return canon
  }
  return n
}

/** 明显是角色身份名，不当作道具 */
const PROP_PERSON_NAME_RE = /^(人|男人|女人|男孩|女孩|学生|老师|同学|路人|主角|配角|保安|医生|护士|群众)$/

/**
 * 场景/道具专用【画风规格】示例（仅写入 LLM system，不后处理改写落库文案）
 */
const ENV_MOTION_COMIC_STYLE_SPEC =
  '16:9 横屏，短剧解说高清国漫环境，锋利干净细线稿，硬边赛璐璐明暗分界极鲜明，高对比冷色（深蓝/青紫/深灰），强单侧戏剧光，暗部浅景深虚化，禁止新海诚暖金柔光、禁止水彩糊边、禁止粗条漫黑线、禁止3D真人、禁止人物人脸手足路人剪影、禁止画面内字幕水印'

const ENV_ANIME_STYLE_SPEC =
  '16:9 横屏，日系2D动漫环境插画（Anime Style），锋利干净线稿，硬边赛璐璐/平涂上色，高对比电影感戏剧光影，色温贴合时段与氛围，禁止3D/CGI写实、禁止真人照片、禁止人物人脸手足路人剪影、禁止Q版三头身'

const ENV_MINIMAL_STYLE_SPEC =
  '16:9 横屏，2D扁平插画环境，黑色轮廓线，柔和平涂，干净整洁，禁止写实照片、禁止人物人脸手足'

const ENV_PROP_MOTION_STYLE_SPEC =
  '短剧解说高清国漫静物，锋利干净细线稿，硬边赛璐璐材质明暗分界鲜明，禁止3D写实照片、禁止人物手数人手、禁止画面内文字水印'

const ENV_PROP_ANIME_STYLE_SPEC =
  '日系2D动漫静物定妆，锋利线稿，赛璐璐/平涂材质，禁止3D写实照片、禁止人物手数人手、禁止画面内文字水印'

const ENV_PROP_MINIMAL_STYLE_SPEC =
  '2D扁平插画静物，简笔轮廓纯色平涂，禁止写实照片、禁止人物手数'

const ENV_NO_PEOPLE_SUFFIX =
  '绝对无人空镜：禁止人物、人脸、手足、路人、剪影、人影、背影'

const ENV_PROP_NO_PEOPLE_SUFFIX =
  '绝对无人物无手数：物体单独居中，禁止人手持握'

function envSceneStyleBracket(style?: string | null): string {
  if (usesComicIllustrationPipeline(style)) return formatNarrationStyleSpecBracket(ENV_MOTION_COMIC_STYLE_SPEC)
  if (isNarrationMinimalStyle(style)) return formatNarrationStyleSpecBracket(ENV_MINIMAL_STYLE_SPEC)
  return formatNarrationStyleSpecBracket(ENV_ANIME_STYLE_SPEC)
}

function envPropStyleBracket(style?: string | null): string {
  if (usesComicIllustrationPipeline(style)) return formatNarrationStyleSpecBracket(ENV_PROP_MOTION_STYLE_SPEC)
  if (isNarrationMinimalStyle(style)) return formatNarrationStyleSpecBracket(ENV_PROP_MINIMAL_STYLE_SPEC)
  return formatNarrationStyleSpecBracket(ENV_PROP_ANIME_STYLE_SPEC)
}

function envArtStyleHintForLlm(style?: string | null): string {
  const sceneBr = envSceneStyleBracket(style)
  const propBr = envPropStyleBracket(style)
  return [
    '画风须与配图文案/定妆文案同一套 2D 动漫线稿与赛璐璐质感，但场景/道具文案绝对禁止出现任何人物相关描写。',
    `场景 bible 开篇写：${sceneBr}；只写建筑/陈设/光影/材质/前中后景，禁止瞳孔、头身、发丝、五官、半脸、角色、路人、剪影、手足。`,
    `道具 description 开篇写：${propBr}；只写物件外形材质色，禁止手数人手。`,
    ENV_NO_PEOPLE_SUFFIX + '；' + ENV_PROP_NO_PEOPLE_SUFFIX + '。',
    '系统将原样落库，勿依赖后处理清洗。',
  ].join('')
}

/** 统计道具在多少条旁白/分镜中出现（同条多次只算 1） */
function countPropLineHits(name: string, lines: string[]): number {
  const canon = canonicalizePropName(name)
  if (!canon) return 0
  const aliases: string[] = [canon]
  if (canon === '香烟') aliases.push('烟头', '没点着的烟', '烟蒂', '烟掉', '抽烟', '点烟', '烟')
  if (canon === '试卷') aliases.push('卷子')
  if (canon === '笔') aliases.push('笔杆', '钢笔', '圆珠笔', '铅笔', '笔尖')
  if (canon === '手机') aliases.push('微信屏幕', '手机屏幕')
  if (canon === '针管') aliases.push('注射器')
  if (canon === '书包') aliases.push('背包')
  let hits = 0
  for (const line of lines) {
    const t = String(line || '')
    if (!t) continue
    if (aliases.some(a => a && t.includes(a))) hits++
  }
  return hits
}

function filterRecurringProps(
  props: Array<{ name: string; description: string }>,
  lines: string[],
): Array<{ name: string; description: string }> {
  const out: Array<{ name: string; description: string }> = []
  const seen = new Set<string>()
  for (const p of props) {
    const name = canonicalizePropName(p.name)
    if (!name || seen.has(name)) continue
    if (PROP_PERSON_NAME_RE.test(name) || /人物|人脸/.test(name)) continue
    const hits = countPropLineHits(name, lines)
    if (hits < MIN_PROP_LINE_HITS) continue
    const description = String(p.description || '').trim()
    if (!description) continue
    seen.add(name)
    out.push({ name, description })
    if (out.length >= MAX_PROPS) break
  }
  return out
}

const PLACE_RULES: Array<{ re: RegExp; label: string }> = [
  { re: /天台|楼顶/, label: '天台' },
  { re: /教室|课堂|讲台|黑板/, label: '教室' },
  { re: /走廊|过道|楼道|玄关/, label: '走廊' },
  { re: /楼梯|楼梯间/, label: '楼梯间' },
  { re: /操场|器材室/, label: '操场' },
  { re: /办公室/, label: '办公室' },
  { re: /宿舍|寝室/, label: '宿舍' },
  { re: /街道|马路|巷子/, label: '街道' },
  { re: /客厅|卧室|厨房|浴室/, label: '室内居家' },
]

export function narrationPropType(episodeId: number): string {
  return `narration:${episodeId}`
}

export function sceneLabelOf(scene: { location?: string | null; time?: string | null }): string {
  const loc = String(scene.location || '').trim() || '场景'
  const time = String(scene.time || '').trim()
  return time && time !== '日' && time !== '白天' ? `${loc}·${time}` : loc
}

function inferPlaceLabel(text: string): string | null {
  const t = String(text || '')
  for (const { re, label } of PLACE_RULES) {
    if (re.test(t)) return label
  }
  return null
}

/** 场景地点归一：走 PLACE_RULES，去掉「·时段」后缀，避免「教室/高三教室」各一条 */
function normalizeSceneLocation(raw: string): string {
  const t = String(raw || '').trim().replace(/[·・].*$/, '').trim()
  if (!t) return '室内'
  return inferPlaceLabel(t) || t
}

function scenesNearEqual(a: string, b: string): boolean {
  const x = normalizeSceneLocation(a)
  const y = normalizeSceneLocation(b)
  if (x === y) return true
  if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return true
  return false
}

function dedupeSceneDefs(
  defs: Array<{ location: string; time: string; bible: string }>,
): Array<{ location: string; time: string; bible: string }> {
  const map = new Map<string, { location: string; time: string; bible: string }>()
  for (const s of defs) {
    const location = normalizeSceneLocation(s.location)
    if (!location) continue
    const prev = map.get(location)
    if (!prev) {
      map.set(location, {
        location,
        time: String(s.time || '日').trim() || '日',
        bible: String(s.bible || '').trim(),
      })
      continue
    }
    if ((s.bible || '').length > (prev.bible || '').length) prev.bible = s.bible
    if ((prev.time === '日' || prev.time === '白天') && s.time && s.time !== '日' && s.time !== '白天') {
      prev.time = s.time
    }
  }
  return [...map.values()].slice(0, MAX_SCENES)
}

function inferTimeLabel(text: string): string {
  const t = String(text || '')
  if (/清晨|早自习|早晨|早上|晨光/.test(t)) return '清晨'
  if (/傍晚|黄昏|放学/.test(t)) return '傍晚'
  if (/夜晚|夜里|深夜/.test(t)) return '夜晚'
  if (/午|中午/.test(t)) return '午间'
  return '日'
}

function sortStoryboards<T extends { storyboardNumber?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.storyboardNumber || 0) - Number(b.storyboardNumber || 0))
}

function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const exists = db.select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
    .all()[0]
  if (exists) return
  db.insert(schema.episodeScenes).values({
    episodeId,
    sceneId,
    createdAt: now(),
  }).run()
}

function clearEpisodeNarrationEnvAssets(episodeId: number, dramaId: number) {
  const ts = now()
  // 本集已关联场景全部软删（含此前已软删的，统一标记）
  const links = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
  for (const link of links) {
    db.update(schema.scenes).set({
      deletedAt: ts,
      updatedAt: ts,
      imageUrl: null,
      localPath: null,
      status: 'pending',
    }).where(eq(schema.scenes.id, link.sceneId)).run()
  }
  // 本集解说道具全部软删（含已软删）
  const type = narrationPropType(episodeId)
  const props = db.select().from(schema.props)
    .where(and(
      eq(schema.props.dramaId, dramaId),
      eq(schema.props.type, type),
    ))
    .all()
  for (const p of props) {
    db.update(schema.props).set({
      deletedAt: ts,
      updatedAt: ts,
      imageUrl: null,
      localPath: null,
    }).where(eq(schema.props.id, p.id)).run()
  }
  // 清分镜绑定，避免指向已删场景
  db.update(schema.storyboards).set({
    sceneId: null,
    updatedAt: ts,
  }).where(and(
    eq(schema.storyboards.episodeId, episodeId),
    isNull(schema.storyboards.deletedAt),
  )).run()
}

/** 清空后新建场景（不复活旧行）；bible 原样落库，不清洗 */
function insertScene(params: {
  dramaId: number
  episodeId: number
  location: string
  time: string
  bible: string
}): number {
  const location = normalizeSceneLocation(params.location)
  const bible = String(params.bible || '').trim() || location
  const ts = now()
  const res = db.insert(schema.scenes).values({
    dramaId: params.dramaId,
    episodeId: params.episodeId,
    location,
    time: params.time || '日',
    prompt: bible,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const sceneId = Number(res.lastInsertRowid)
  linkSceneToEpisode(params.episodeId, sceneId)
  return sceneId
}

/** 清空后新建道具（不复活旧行）；description 原样落库，不清洗 */
function insertProp(params: {
  dramaId: number
  episodeId: number
  name: string
  description: string
}): number {
  const name = canonicalizePropName(params.name)
  const desc = String(params.description || '').trim() || name
  const ts = now()
  const res = db.insert(schema.props).values({
    dramaId: params.dramaId,
    name,
    type: narrationPropType(params.episodeId),
    description: desc,
    prompt: desc,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  return Number(res.lastInsertRowid)
}

export function listEpisodeNarrationScenes(episodeId: number) {
  const links = db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
  const ids = links.map(l => l.sceneId)
  if (!ids.length) return []
  return db.select().from(schema.scenes).all()
    .filter(s => ids.includes(s.id) && !s.deletedAt)
}

export function listEpisodeNarrationProps(episodeId: number) {
  const type = narrationPropType(episodeId)
  return db.select().from(schema.props)
    .where(and(
      eq(schema.props.type, type),
      isNull(schema.props.deletedAt),
    ))
    .all()
}

/** 规则：从 description/dialogue 推断场所，连续同场所合并 */
export function clusterNarrationScenesByRules(
  storyboards: Array<{
    id: number
    storyboardNumber?: number | null
    dialogue?: string | null
    description?: string | null
    referenceImages?: string | null
  }>,
): Array<{ location: string; time: string; storyboardIds: number[]; sampleText: string }> {
  const ordered = sortStoryboards(storyboards)
  const clusters: Array<{ location: string; time: string; storyboardIds: number[]; sampleText: string }> = []
  let cur: { location: string; time: string; storyboardIds: number[]; sampleText: string } | null = null

  for (const sb of ordered) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const blob = [sb.description, meta.scene_content, sb.dialogue].filter(Boolean).join('，')
    const place: string = inferPlaceLabel(blob) || cur?.location || '室内'
    const time = inferTimeLabel(blob)
    if (!cur || cur.location !== place) {
      cur = { location: place, time, storyboardIds: [sb.id], sampleText: blob.slice(0, 200) }
      clusters.push(cur)
    } else {
      cur.storyboardIds.push(sb.id)
      if (cur.sampleText.length < 160) cur.sampleText = `${cur.sampleText}，${blob}`.slice(0, 200)
      if (cur.time === '日' && time !== '日') cur.time = time
    }
  }
  return clusters.slice(0, MAX_SCENES)
}

async function llmExtractEnvAssets(params: {
  scriptLines: string[]
  style?: string | null
  textModel?: string | null
  textThinking?: boolean
}): Promise<{ scenes: Array<{ location: string; time: string; bible: string }>; props: Array<{ name: string; description: string }> } | null> {
  const lines = params.scriptLines.map(s => String(s || '').trim()).filter(Boolean).slice(0, 80)
  if (!lines.length) return null
  const style = params.style || NARRATION_ANIME_STYLE
  const styleHint = envArtStyleHintForLlm(style)
  try {
    const model = params.textModel || undefined
    const config = getTextConfig(model)
    assertTextConfigHasCredentials(config)
    const system = [
      '你是影视美术指导。根据解说分镜台词，只提取「场景定妆」与「关键复现道具定妆」。',
      `【画风·硬性】${styleHint}`,
      '【无人·硬性】场景与道具文案里禁止出现任何人：人物/人脸/手足/路人/剪影/人影/背影/瞳孔/头身/发丝/五官/角色名；不要照抄定妆文案里的人物词。',
      '场景：合并同地点连续戏；bible = 【画风规格】+ 无人环境（墙/灯/地面/前中后景陈设与光影）。',
      '道具：只抽在多条旁白中重复出现的关键物件（≥2次）；description = 【画风规格】+ 白底静物外形材质，无手数。',
      '不要把角色名、身份（老师/同学等）当成道具或场景。',
      '只输出 JSON：{"scenes":[{"location":"教室","time":"清晨","bible":"【画风规格：…】无人空镜环境…"}],"props":[{"name":"试卷","description":"【画风规格：…】白底静物…"}]}',
    ].join('\n')
    const user = JSON.stringify({
      lines,
      art_style: style,
      limits: {
        max_scenes: MAX_SCENES,
        max_props: MAX_PROPS,
        min_prop_line_hits: MIN_PROP_LINE_HITS,
      },
      hard_rules: {
        match_portrait_and_image_prompt_style: true,
        scene_no_people: true,
        prop_must_recur: true,
        prop_no_people: true,
        must_include_style_bracket: true,
      },
    })
    const text = await callTextChat(
      system,
      user,
      model,
      params.textThinking ?? false,
      120_000,
      false,
      4096,
      'narration_env_extract',
    )
    const obj = extractJsonObject(text)
    if (!obj) return null
    const scenes = Array.isArray(obj.scenes)
      ? obj.scenes.map((s: any) => ({
        location: String(s.location || s.name || '').trim(),
        time: String(s.time || '日').trim() || '日',
        bible: String(s.bible || s.prompt || s.description || '').trim(),
      })).filter((s: { location: string }) => s.location && !PROP_PERSON_NAME_RE.test(s.location))
      : []
    const props = Array.isArray(obj.props)
      ? obj.props.map((p: any) => ({
        name: String(p.name || '').trim(),
        description: String(p.description || p.prompt || '').trim(),
      })).filter((p: { name: string }) => p.name)
      : []
    return {
      scenes: scenes.slice(0, MAX_SCENES),
      props: filterRecurringProps(props, lines),
    }
  } catch (err: any) {
    logTaskWarn('NarrationEnv', 'llm-extract-failed', { error: String(err?.message || err) })
    return null
  }
}

function defaultSceneBible(location: string, time: string, sample: string, style?: string | null): string {
  const hint = sample.replace(/\s+/g, ' ').slice(0, 80)
  const motion = usesComicIllustrationPipeline(style)
  const lightHint = motion
    ? '强单侧戏剧光与冷色高对比，暗部浅景深虚化'
    : '高对比电影感主光，明暗分界清晰'
  return [
    envSceneStyleBracket(style),
    `${time}${location}无人空镜定妆：16:9横屏纯环境。`,
    `2D动漫锋利细线稿、硬边赛璐璐；须固定墙面材质与色调、${lightHint}、地面材质，以及前/中/后景至少各1个可辨认陈设（只写物件与建筑，不写任何人）。`,
    hint ? `参考氛围：${hint}` : '',
    ENV_NO_PEOPLE_SUFFIX,
    '禁止3D真人、水彩糊边、画面内文字水印。',
  ].filter(Boolean).join('')
}

function defaultPropDescription(name: string, style?: string | null): string {
  const motion = usesComicIllustrationPipeline(style)
  const look = motion
    ? '锋利细线稿硬边赛璐璐，材质明暗分界鲜明'
    : '日系2D动漫线稿与赛璐璐上色，材质清晰'
  return [
    envPropStyleBracket(style),
    `白底静物定妆：${name}，正面清晰特写，${look}，比例固定，物体单独居中，适合跨镜对照复现。`,
    ENV_PROP_NO_PEOPLE_SUFFIX,
    '禁止3D写实照片质感。',
  ].join('')
}

/**
 * 提取本集场景+道具定妆资产，并绑定 storyboards.scene_id
 */
export async function extractNarrationEnvAssets(
  episodeId: number,
  dramaId: number,
  options?: { textModel?: string | null; textThinking?: boolean },
): Promise<{
  scenes: typeof schema.scenes.$inferSelect[]
  props: typeof schema.props.$inferSelect[]
  bound_storyboards: number
  prompts_synced: number
  generated_at: string
}> {
  const storyboards = db.select().from(schema.storyboards)
    .where(and(eq(schema.storyboards.episodeId, episodeId), isNull(schema.storyboards.deletedAt)))
    .all()
  if (!storyboards.length) {
    throw new Error('请先生成分镜脚本')
  }

  logTaskProgress('NarrationEnv', 'extract-start', { episodeId, shotCount: storyboards.length })

  // 每次提取：先清空本集已有场景/道具，再全新写入
  clearEpisodeNarrationEnvAssets(episodeId, dramaId)

  const [drama] = db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
  const style = resolveEpisodeVisualStyle(episodeId, { dramaStyle: drama?.style })
    || (usesComicIllustrationPipeline(drama?.style) ? MOTION_COMIC_STYLE : NARRATION_ANIME_STYLE)

  const clusters = clusterNarrationScenesByRules(storyboards)
  const scriptLines = sortStoryboards(storyboards).map(sb => String(sb.dialogue || sb.description || '').trim()).filter(Boolean)
  const llm = await llmExtractEnvAssets({
    scriptLines,
    style,
    textModel: options?.textModel,
    textThinking: options?.textThinking,
  })

  // 场景名单以规则聚类为准；LLM 只给匹配地点补 bible
  const llmBibleByLoc = new Map<string, { time: string; bible: string }>()
  for (const s of llm?.scenes || []) {
    const loc = normalizeSceneLocation(s.location)
    if (!loc) continue
    const prev = llmBibleByLoc.get(loc)
    if (!prev || (s.bible || '').length > (prev.bible || '').length) {
      llmBibleByLoc.set(loc, {
        time: String(s.time || '日').trim() || '日',
        bible: String(s.bible || '').trim(),
      })
    }
  }

  const sceneDefs = dedupeSceneDefs(
    clusters.map(c => {
      const loc = normalizeSceneLocation(c.location)
      const llmHit = llmBibleByLoc.get(loc)
        || [...llmBibleByLoc.entries()].find(([k]) => scenesNearEqual(k, loc))?.[1]
      return {
        location: loc,
        time: (llmHit?.time && llmHit.time !== '日' ? llmHit.time : c.time) || '日',
        bible: llmHit?.bible || defaultSceneBible(loc, c.time, c.sampleText, style),
      }
    }),
  )

  const sceneIdByLocation = new Map<string, number>()
  for (const s of sceneDefs) {
    const loc = normalizeSceneLocation(s.location)
    if (sceneIdByLocation.has(loc)) continue
    const id = insertScene({
      dramaId,
      episodeId,
      location: loc,
      time: s.time,
      bible: String(s.bible || '').trim(),
    })
    sceneIdByLocation.set(loc, id)
  }

  // 绑定 scene_id
  let bound = 0
  for (const cluster of clusters) {
    const clusterLoc = normalizeSceneLocation(cluster.location)
    let sceneId = sceneIdByLocation.get(clusterLoc)
    if (!sceneId) {
      for (const [loc, id] of sceneIdByLocation) {
        if (scenesNearEqual(loc, clusterLoc)) {
          sceneId = id
          break
        }
      }
    }
    if (!sceneId) {
      sceneId = insertScene({
        dramaId,
        episodeId,
        location: clusterLoc,
        time: cluster.time,
        bible: defaultSceneBible(clusterLoc, cluster.time, cluster.sampleText, style),
      })
      sceneIdByLocation.set(clusterLoc, sceneId)
    }
    for (const sbId of cluster.storyboardIds) {
      db.update(schema.storyboards).set({
        sceneId,
        location: clusterLoc,
        time: cluster.time,
        updatedAt: now(),
      }).where(eq(schema.storyboards.id, sbId)).run()
      bound++
    }
  }

  // 道具：LLM 优先；再按「多条旁白复现」硬过滤；否则规则抽取
  const propDefs = filterRecurringProps(
    llm?.props?.length ? llm.props : extractPropsByRules(scriptLines, style),
    scriptLines,
  )
  const insertedPropNames = new Set<string>()
  for (const p of propDefs) {
    const name = canonicalizePropName(p.name)
    if (!name || insertedPropNames.has(name)) continue
    insertedPropNames.add(name)
    insertProp({
      dramaId,
      episodeId,
      name,
      description: String(p.description || '').trim() || defaultPropDescription(name, style),
    })
  }

  const promptsSynced = syncEpisodeImagePromptsEnvShell(episodeId)

  const scenes = listEpisodeNarrationScenes(episodeId)
  const props = listEpisodeNarrationProps(episodeId)
  logTaskSuccess('NarrationEnv', 'extract-done', {
    episodeId,
    scenes: scenes.length,
    props: props.length,
    bound,
    promptsSynced,
  })
  return {
    scenes,
    props,
    bound_storyboards: bound,
    prompts_synced: promptsSynced,
    generated_at: now(),
  }
}

/**
 * 重新提取场景/道具后：同步已有配图文案的「对照场景/对照道具/年代场景外壳」
 * （不整段重写动作与定妆；场景 bible 原样写入，不清洗）
 */
export function syncImagePromptEnvShell(
  prompt: string,
  opts: {
    sceneLabel?: string | null
    sceneBible?: string | null
    propLabels?: string[]
  },
): string {
  let p = String(prompt || '').trim()
  if (!p) return p

  const sceneLabel = String(opts.sceneLabel || '').trim()
  const sceneBible = String(opts.sceneBible || '').trim()
  const propLabels = (opts.propLabels || []).map(x => String(x || '').trim()).filter(Boolean)

  if (sceneLabel) {
    if (/对照场景「[^」]*」/.test(p)) {
      p = p.replace(/对照场景「[^」]*」/g, `对照场景「${sceneLabel}」`)
    } else {
      p = `对照场景「${sceneLabel}」${p}`
    }
  }

  if (sceneBible) {
    if (/【年代场景】/.test(p)) {
      p = p.replace(/【年代场景】[^【]*/g, `【年代场景】${sceneBible}`)
    } else if (/对照场景「[^」]*」/.test(p)) {
      p = p.replace(/(对照场景「[^」]*」)/, `$1【年代场景】${sceneBible}`)
    } else {
      p = `【年代场景】${sceneBible}${p}`
    }
  }

  // 道具标签：去掉旧标签，只保留本镜旁白命中的复现道具
  p = p.replace(/\s*对照道具「[^」]*」/g, '')
  if (propLabels.length) {
    const tags = propLabels.map(n => `对照道具「${n}」`).join('')
    if (/对照场景「[^」]*」/.test(p)) {
      p = p.replace(/(对照场景「[^」]*」)/, `$1${tags}`)
    } else {
      p = `${tags}${p}`
    }
  }

  return p.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** 分镜旁白文本：用于匹配本镜应出现的道具 */
export function storyboardNarrationLinesForEnv(sb: {
  dialogue?: string | null
  description?: string | null
  referenceImages?: string | null
}): string[] {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const fromMeta = [
    ...(Array.isArray(meta.narration_lines) ? meta.narration_lines : []),
    ...(Array.isArray(meta.image_narration_lines) ? meta.image_narration_lines : []),
    meta.scene_content,
  ]
  return [...fromMeta, sb.dialogue, sb.description]
    .map(x => String(x || '').trim())
    .filter(Boolean)
}

/** 按本镜绑定场景 + 旁白命中道具，确定性写入对照场景/对照道具（不依赖 LLM） */
export function enrichImagePromptWithEnvAssets(
  prompt: string,
  sb: {
    sceneId?: number | null
    location?: string | null
    episodeId?: number
    dialogue?: string | null
    description?: string | null
    referenceImages?: string | null
  },
  opts?: {
    scenes?: ReturnType<typeof listEpisodeNarrationScenes>
    props?: ReturnType<typeof listEpisodeNarrationProps>
  },
): string {
  const prev = String(prompt || '').trim()
  if (!prev) return prev
  const episodeId = sb.episodeId
  const scenes = opts?.scenes || (episodeId ? listEpisodeNarrationScenes(episodeId) : [])
  const props = opts?.props || (episodeId ? listEpisodeNarrationProps(episodeId) : [])
  const scene = resolveSceneForStoryboard(sb)
    || (sb.sceneId ? scenes.find(s => s.id === sb.sceneId) || null : null)
  const envProps = props.map(p => ({
    id: p.id,
    prop_label: p.name,
    has_prop_ref: !!String(p.imageUrl || '').trim(),
    description: String(p.description || p.prompt || ''),
  }))
  const hitProps = matchPropsForNarrationLines(storyboardNarrationLinesForEnv(sb), envProps)
  return syncImagePromptEnvShell(prev, {
    sceneLabel: scene ? sceneLabelOf(scene) : null,
    sceneBible: scene ? getSceneBible(scene) : null,
    propLabels: hitProps.map(p => p.prop_label),
  })
}

export function syncEpisodeImagePromptsEnvShell(episodeId: number): number {
  const storyboards = db.select().from(schema.storyboards)
    .where(and(eq(schema.storyboards.episodeId, episodeId), isNull(schema.storyboards.deletedAt)))
    .all()
  const scenes = listEpisodeNarrationScenes(episodeId)
  const props = listEpisodeNarrationProps(episodeId)
  let synced = 0
  for (const sb of storyboards) {
    const prev = String(sb.imagePrompt || '').trim()
    if (!prev) continue
    const next = enrichImagePromptWithEnvAssets(prev, sb, { scenes, props })
    if (next && next !== prev) {
      db.update(schema.storyboards).set({
        imagePrompt: next,
        updatedAt: now(),
      }).where(eq(schema.storyboards.id, sb.id)).run()
      synced++
    }
  }
  return synced
}

function extractPropsByRules(lines: string[], style?: string | null): Array<{ name: string; description: string }> {
  const raw: Array<{ name: string; description: string }> = PROP_NAME_CANONICAL.map(c => ({
    name: c.name,
    description: defaultPropDescription(c.name, style),
  }))
  // 去重规范名后，仅保留在多条旁白中命中的
  const unique = [...new Map(raw.map(p => [p.name, p])).values()]
  return filterRecurringProps(
    unique.filter(p => {
      const c = PROP_NAME_CANONICAL.find(x => x.name === p.name)
      return c ? lines.some(line => c.re.test(line)) : false
    }),
    lines,
  )
}

export function getSceneBible(scene: { prompt?: string | null; location?: string | null; time?: string | null }, style?: string | null): string {
  const p = String(scene.prompt || '').trim()
  if (p && p !== String(scene.location || '').trim()) return p
  return defaultSceneBible(String(scene.location || '场景'), String(scene.time || '日'), '', style)
}

/** 配图 LLM / 生图：本集场景与道具 payload */
export function buildNarrationEnvPromptPayload(episodeId: number) {
  const scenes = listEpisodeNarrationScenes(episodeId).map(s => ({
    id: s.id,
    scene_label: sceneLabelOf(s),
    location: s.location,
    time: s.time,
    has_scene_ref: !!String(s.imageUrl || '').trim(),
    scene_bible: getSceneBible(s),
  }))
  const props = listEpisodeNarrationProps(episodeId).map(p => ({
    id: p.id,
    prop_label: p.name,
    has_prop_ref: !!String(p.imageUrl || '').trim(),
    description: String(p.description || p.prompt || '').trim(),
  }))
  return { scenes, props }
}

export function matchPropsForNarrationLines(
  narrationLines: string[],
  props: Array<{ id: number; prop_label: string; has_prop_ref: boolean; description?: string }>,
) {
  const text = narrationLines.join('\n')
  return props.filter(p => {
    const name = p.prop_label
    if (!name) return false
    if (text.includes(name)) return true
    // 近义
    if (name === '香烟' && /烟头|没点着的烟|烟掉|抽烟/.test(text)) return true
    if (name === '试卷' && /卷子/.test(text)) return true
    if (name === '笔' && /笔杆|笔尖/.test(text)) return true
    if (name === '手机' && /微信|屏幕/.test(text)) return true
    return false
  })
}

export function resolveSceneForStoryboard(sb: {
  sceneId?: number | null
  location?: string | null
  episodeId?: number
}) {
  if (sb.sceneId) {
    const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, sb.sceneId)).all()
    if (scene && !scene.deletedAt) return scene
  }
  const loc = String(sb.location || '').trim()
  if (loc && sb.episodeId) {
    const scenes = listEpisodeNarrationScenes(sb.episodeId)
    return scenes.find(s => s.location === loc) || null
  }
  return null
}

/**
 * 按画面描述推断场所，优先于可能过期的 scene_id（走廊镜误挂教室参考）。
 */
export function resolveSceneForNarrationDescription(params: {
  description?: string | null
  sceneId?: number | null
  location?: string | null
  episodeId: number
  scenes?: ReturnType<typeof listEpisodeNarrationScenes>
}) {
  const envScenes = params.scenes || listEpisodeNarrationScenes(params.episodeId)
  const desc = String(params.description || '').trim()
  if (desc && envScenes.length) {
    const place = inferPlaceLabel(desc)
    if (place) {
      const hit = envScenes.find((s) => {
        const loc = String(s.location || '').trim()
        return loc === place || loc.startsWith(place) || place.startsWith(loc)
      })
      if (hit) return hit
    }
    // 描述里直接点名 location
    let best: (typeof envScenes)[0] | null = null
    let bestLen = 0
    for (const s of envScenes) {
      const loc = String(s.location || '').trim()
      if (loc.length >= 2 && desc.includes(loc) && loc.length > bestLen) {
        best = s
        bestLen = loc.length
      }
    }
    if (best) return best
  }
  return resolveSceneForStoryboard({
    sceneId: params.sceneId,
    location: params.location,
    episodeId: params.episodeId,
  }) || null
}

/**
 * Toonflow：只认画面描述里真正出现的道具（避免旁白串镜误挂香烟/手机）。
 */
export function matchPropsForDescription(
  description: string,
  props: Array<{ id: number; prop_label: string; has_prop_ref: boolean; description?: string }>,
) {
  const text = String(description || '').trim()
  if (!text) return []
  return props.filter((p) => {
    const name = String(p.prop_label || '').trim()
    if (!name) return false
    if (text.includes(name)) return true
    if (name === '香烟' && /(?:香烟|烟头|烟蒂|没点燃的烟|没点着的烟|(?:攥|握|夹|捏)着烟)/.test(text)) return true
    if (name === '试卷' && /卷子/.test(text)) return true
    if (name === '笔' && /(?:钢笔|圆珠笔|铅笔|笔杆|笔尖)/.test(text)) return true
    if (name === '针管' && /注射器/.test(text)) return true
    if (name === '手机' && /手机|微信对话框|手机屏幕/.test(text)) return true
    return false
  })
}

/** 从文案解析对照场景 / 对照道具标签 */
export function extractSceneLabelsFromPrompt(prompt: string): string[] {
  return [...String(prompt || '').matchAll(/对照场景「([^」]+)」/g)]
    .map(m => String(m[1] || '').trim())
    .filter(Boolean)
}

export function extractPropLabelsFromPrompt(prompt: string): string[] {
  return [...String(prompt || '').matchAll(/对照道具「([^」]+)」/g)]
    .map(m => String(m[1] || '').trim())
    .filter(Boolean)
}

export function collectSceneReferenceImagesByLabels(
  prompt: string,
  scenes: Array<{ id: number; location?: string | null; time?: string | null; imageUrl?: string | null }>,
  max = 1,
): { refs: string[]; labels: string[]; sceneIds: number[] } {
  const labels = extractSceneLabelsFromPrompt(prompt)
  const refs: string[] = []
  const outLabels: string[] = []
  const sceneIds: number[] = []
  const seen = new Set<string>()
  const push = (scene: typeof scenes[0], label: string) => {
    const url = String(scene.imageUrl || '').trim()
    if (!url || seen.has(url) || refs.length >= max) return
    seen.add(url)
    refs.push(url)
    outLabels.push(label)
    sceneIds.push(scene.id)
  }
  for (const label of labels) {
    const base = label.split(/[·•]/)[0]?.trim() || label
    const hit = scenes.find(s => sceneLabelOf(s) === label || s.location === label || s.location === base)
    if (hit) push(hit, label)
  }
  return { refs, labels: outLabels, sceneIds }
}

export function collectPropReferenceImagesByLabels(
  prompt: string,
  props: Array<{ id: number; name?: string | null; imageUrl?: string | null }>,
  max = 2,
): { refs: string[]; labels: string[]; propIds: number[] } {
  const labels = extractPropLabelsFromPrompt(prompt)
  const refs: string[] = []
  const outLabels: string[] = []
  const propIds: number[] = []
  const seen = new Set<string>()
  for (const label of labels) {
    if (refs.length >= max) break
    const hit = props.find(p => String(p.name || '').trim() === label)
    const url = String(hit?.imageUrl || '').trim()
    if (!hit || !url || seen.has(url)) continue
    seen.add(url)
    refs.push(url)
    outLabels.push(label)
    propIds.push(hit.id)
  }
  return { refs, labels: outLabels, propIds }
}

export type ImageRefKind = 'portrait' | 'scene' | 'prop'

export type TypedImageRef = { url: string; kind: ImageRefKind }

export function serializeTypedReferenceImages(refs: TypedImageRef[]): string {
  return JSON.stringify(refs.filter(r => r.url))
}

export function parseTypedReferenceImages(raw: string | null | undefined): TypedImageRef[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((item) => {
      if (typeof item === 'string') return { url: item.trim(), kind: 'portrait' as const }
      const url = String(item?.url || item?.path || '').trim()
      const kindRaw = String(item?.kind || 'portrait')
      const kind: ImageRefKind = kindRaw === 'scene' || kindRaw === 'prop' ? kindRaw : 'portrait'
      return url ? { url, kind } : null
    }).filter(Boolean) as TypedImageRef[]
  } catch {
    return []
  }
}

/**
 * 软截断优先级：1 场景 → 旁白/文案点名道具 → 肖像（最多 maxPortrait）→ 其余道具。
 * 避免道具戏被第二张脸挤掉。
 */
export function prioritizeTypedImageRefs(
  refs: TypedImageRef[],
  options?: {
    maxTotal?: number
    maxPortrait?: number
    /** 点名道具 url，优先于第二张肖像 */
    namedPropUrls?: string[]
  },
): TypedImageRef[] {
  const maxTotal = Math.max(1, options?.maxTotal ?? refs.length)
  const maxPortrait = Math.max(0, options?.maxPortrait ?? 2)
  const namedSet = new Set((options?.namedPropUrls || []).map(u => String(u || '').trim()).filter(Boolean))

  const scenes = refs.filter(r => r.kind === 'scene')
  const portraits = refs.filter(r => r.kind === 'portrait')
  const props = refs.filter(r => r.kind === 'prop')
  const namedProps = props.filter(r => namedSet.has(r.url))
  const otherProps = props.filter(r => !namedSet.has(r.url))
  // 无显式 named 时：全部 prop 视为 named（保持旧行为：场景后先道具再脸会太激进；计划是点名道具优先）
  const priorityProps = namedProps.length ? namedProps : props
  const restProps = namedProps.length ? otherProps : []

  const out: TypedImageRef[] = []
  const seen = new Set<string>()
  const push = (r: TypedImageRef) => {
    if (!r.url || seen.has(r.url) || out.length >= maxTotal) return
    seen.add(r.url)
    out.push(r)
  }

  for (const r of scenes.slice(0, 1)) push(r)
  for (const r of priorityProps) push(r)
  let portraitCount = 0
  for (const r of portraits) {
    if (portraitCount >= maxPortrait) break
    const before = out.length
    push(r)
    if (out.length > before) portraitCount++
  }
  for (const r of restProps) push(r)
  // 若还有空位，补剩余（顺序：场景余下、肖像余下）
  for (const r of scenes.slice(1)) push(r)
  for (const r of portraits) push(r)

  return out
}

export type BuildStoryboardTypedRefsResult = {
  refs: TypedImageRef[]
  prompt: string
  sceneLabels: string[]
  portraitLabels: string[]
  propLabels: string[]
}

/**
 * 与 images 路由一致：按文案挂 scene / portrait / prop typed refs（供 Agnes 空 ref 回填复用）。
 */
export function buildStoryboardTypedReferenceImages(params: {
  prompt: string
  storyboard: {
    id?: number
    episodeId?: number | null
    sceneId?: number | null
    location?: string | null
    imagePrompt?: string | null
    dialogue?: string | null
    description?: string | null
    referenceImages?: string | null
  }
  characters: Array<{
    id: number
    name?: string | null
    appearance?: string | null
    referenceImages?: unknown
    imageUrl?: string | null
  }>
  maxPortrait?: number
  maxTotal?: number
  useSceneReference?: boolean
  usePortraitReference?: boolean
  usePropReference?: boolean
  /** 已解析的角色 id（无标签时回退） */
  fallbackCharacterIds?: number[]
  collectPortraitRefs: (prompt: string, maxPortrait: number) => { refs: string[]; names: string[]; allLabels: string[] }
  collectPortraitRefsByIds?: (characterIds: number[], maxPortrait: number) => string[]
}): BuildStoryboardTypedRefsResult {
  const maxPortrait = Math.max(1, params.maxPortrait ?? 2)
  const maxTotal = Math.max(1, params.maxTotal ?? 8)
  const useScene = params.useSceneReference !== false
  const usePortrait = params.usePortraitReference !== false
  const useProp = params.usePropReference !== false
  const epId = Number(params.storyboard.episodeId || 0)
  const epScenes = epId ? listEpisodeNarrationScenes(epId) : []
  const epProps = epId ? listEpisodeNarrationProps(epId) : []

  let prompt = enrichImagePromptWithEnvAssets(params.prompt, {
    sceneId: params.storyboard.sceneId,
    location: params.storyboard.location,
    episodeId: epId || undefined,
    dialogue: params.storyboard.dialogue,
    description: params.storyboard.description,
    referenceImages: params.storyboard.referenceImages,
  }, {
    scenes: epScenes,
    props: epProps,
  })

  const typedRefs: TypedImageRef[] = []
  let sceneLabels: string[] = []
  let portraitLabels: string[] = []
  let propLabels: string[] = []
  const namedPropUrls: string[] = []

  if (useScene) {
    const byScene = collectSceneReferenceImagesByLabels(prompt, epScenes, 1)
    for (const url of byScene.refs) typedRefs.push({ url, kind: 'scene' })
    sceneLabels = byScene.labels
    if (!typedRefs.some(r => r.kind === 'scene') && params.storyboard.sceneId) {
      const sc = epScenes.find(s => s.id === params.storyboard.sceneId)
      const url = String(sc?.imageUrl || '').trim()
      if (sc && url) {
        typedRefs.push({ url, kind: 'scene' })
        sceneLabels = [sceneLabelOf(sc)]
      }
    }
  }

  if (usePortrait) {
    const byLabels = params.collectPortraitRefs(prompt, maxPortrait)
    let charRefs = byLabels.refs.slice(0, maxPortrait)
    if (!charRefs.length && params.fallbackCharacterIds?.length && params.collectPortraitRefsByIds) {
      charRefs = params.collectPortraitRefsByIds(params.fallbackCharacterIds, maxPortrait)
    }
    for (const url of charRefs) typedRefs.push({ url, kind: 'portrait' })
    portraitLabels = (byLabels.names.length
      ? byLabels.names
      : byLabels.allLabels.slice(0, charRefs.length)
    ).slice(0, maxPortrait)
  }

  if (useProp) {
    const propCap = Math.max(epProps.length, 8)
    let byProp = collectPropReferenceImagesByLabels(prompt, epProps, propCap)
    if (!byProp.refs.length) {
      const hit = matchPropsForNarrationLines(
        storyboardNarrationLinesForEnv(params.storyboard),
        epProps.map(p => ({
          id: p.id,
          prop_label: p.name,
          has_prop_ref: !!String(p.imageUrl || '').trim(),
          description: String(p.description || p.prompt || ''),
        })),
      ).filter(p => p.has_prop_ref)
      const refs: string[] = []
      const labels: string[] = []
      for (const p of hit) {
        const row = epProps.find(x => x.id === p.id)
        const url = String(row?.imageUrl || '').trim()
        if (!url) continue
        refs.push(url)
        labels.push(p.prop_label)
      }
      byProp = { refs, labels, propIds: hit.map(p => p.id) }
    }
    for (let i = 0; i < byProp.refs.length; i++) {
      typedRefs.push({ url: byProp.refs[i], kind: 'prop' })
      namedPropUrls.push(byProp.refs[i])
    }
    propLabels = byProp.labels
  }

  const prioritized = prioritizeTypedImageRefs(typedRefs, {
    maxTotal,
    maxPortrait,
    namedPropUrls,
  })

  return {
    refs: prioritized,
    prompt,
    sceneLabels: sceneLabels.slice(0, prioritized.filter(r => r.kind === 'scene').length),
    portraitLabels: portraitLabels.slice(0, prioritized.filter(r => r.kind === 'portrait').length),
    propLabels: propLabels.slice(0, prioritized.filter(r => r.kind === 'prop').length),
  }
}
