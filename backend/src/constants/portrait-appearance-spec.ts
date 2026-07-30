/**
 * 定妆 appearance 结构化规范：供定妆 LLM 输出、分镜锁脸参考、Flux 英文注入。
 * 配图中文文案不重写脸型/发型（见 stripPortraitStaticIdentityFromImagePromptCn）。
 */

import {
  coerceMinimalCharacterAppearance,
  isNarrationMinimalStyle,
  sanitizeCharacterAppearance,
} from './art-styles.js'
import { sanitizePortraitAppearanceForGeneration, extractPortraitDistinctCueCn } from './portrait-reference.js'
import { resolveCharacterGenderLabelCn, type PortraitGender } from '../services/comfyui-client.js'

export interface PortraitAppearanceSpec {
  genderLabel: '男性' | '女性' | null
  ageText: string
  stageLabel: string
  faceShape: string
  browsEyes: string
  hairStyle: string
  bodyBuild: string
  outfit: string
  traits: string
  englishTags: string
  /** 完整定妆块（含默认服装，定妆入库用） */
  specCn: string
  /** 身份规格块（脸型+眉眼+发型+身形+标志配饰，不含服装；分镜须照抄） */
  identitySpecCn: string
}

export interface PortraitCharacterLike {
  id?: number
  name?: string | null
  role?: string | null
  appearance?: string | null
  variantLabel?: string | null
  imageUrl?: string | null
}

const HANDHELD_RE = /(?:手持|握着|拿着|背着书包|茶杯|圆扇|槟榔|道具)/
const PORTRAIT_POSE_RE = /正面半身标准站姿|正面全身标准站立|头到胸口|双手自然垂于身侧|双手自然下垂|不拿任何道具|标准站立|三视图/
const BASELINE_MOOD_RE = /^(神情|表情)(疲惫|平静|严肃|冷淡|温和)/

const FACE_SHAPE_RE =
  /[^，,；;】）)]*(?:俊朗|清秀|立体|精致|棱角|下颌|下巴|瓜子脸|鹅蛋脸|圆脸|方脸|长脸|脸型|面相)[^，,；;】）)]*/g
const BROWS_EYES_RE =
  /[^，,；;】）)]*(?:剑眉|细眉|浓眉|眉骨|眉峰|大眼|细长眼|眼眸|瞳孔|双眼皮|单眼皮|眼尾|卧蚕|高光|眼型)[^，,；;】）)]*/g
const HAIR_STYLE_RE =
  /[^，,；;】）)]*(?:短发|长发|中发|碎发|刘海|马尾|束发|盘发|侧分|背头|凌乱|微卷|直发|卷发|发丝|黑发|棕发|金发|银发|白发|发色)[^，,；;】）)]*/g
const BODY_BUILD_RE =
  /[^，,；;】）)]*(?:正常头身比|头身比|肩宽|肩略|身形|体型|四肢|修长|匀称|利落|腰线|腰身|躯干[\d.]+\s*份|三头身|标准体型|肥胖|偏胖|瘦削|圆滚)[^，,；;】）)]*/g

export function formatCharacterPortraitLabel(name: string, variantLabel?: string | null): string {
  const n = String(name || '').trim()
  const stage = String(variantLabel || '').trim()
  if (!stage || stage === '常态' || stage === '默认') return n
  return `${n}·${stage}`
}

const PORTRAIT_LABEL_NARRATION_ONLY = new Set(['旁白', '剧中', 'OS', '画外音', '画外', '解说', '解说员'])

/** 第一人称/自称类名字（各剧本通用，不绑死某一角色名） */
const FIRST_PERSON_PORTRAIT_NAMES = new Set(['我', '俺', '余', '本人', '咱'])

type PortraitNameHint = { name: string; role: string; variantLabel?: string | null }

function isProtagonistPortraitName(name: string, chars: PortraitNameHint[]): boolean {
  const n = String(name || '').trim()
  if (!n) return false
  if (FIRST_PERSON_PORTRAIT_NAMES.has(n)) return true
  const ch = chars.find(c => c.name === n)
  return !!ch && /主角|主人公|男主|女主/.test(ch.role)
}

/** 按对白说话人 / 旁白点名，从本集 characters 推断本镜应对照的定妆角色（万能：不绑某一剧本） */
export function resolveExpectedPortraitNamesForPrompt(options: {
  characters: Array<{ name?: string | null; role?: string | null; variantLabel?: string | null }>
  dialogue?: string | null
  narrationLines?: string[] | null
  /** 分镜绑定角色：仅当对白/旁白推不出角色时兜底 */
  fallbackNames?: string[] | null
}): string[] {
  const chars: PortraitNameHint[] = (options.characters || [])
    .map(c => ({
      name: String(c.name || '').trim(),
      role: String(c.role || '').trim(),
      variantLabel: c.variantLabel,
    }))
    .filter(c => c.name && !PORTRAIT_LABEL_NARRATION_ONLY.has(c.name))
  const nameSet = new Set(chars.map(c => c.name))
  const textParts = [
    options.dialogue,
    ...(options.narrationLines || []),
  ].map(s => String(s || '').trim()).filter(Boolean)
  const text = textParts.join('\n')
  if (!nameSet.size) return []

  const ordered: string[] = []
  const push = (n: string) => {
    if (!n || !nameSet.has(n) || ordered.includes(n)) return
    ordered.push(n)
  }

  // 1) 对白说话人优先（「张三：…」）
  for (const line of textParts) {
    const m = line.match(/^([^：:\n]{1,16})[:：]/)
    if (!m) continue
    const sp = m[1].replace(/[（(].+?[)）]/g, '').trim()
    if (!sp || PORTRAIT_LABEL_NARRATION_ONLY.has(sp) || sp === '剧中') continue
    push(sp)
  }

  if (textParts.length) {
    // 按行顺序点名：先非主角具名，再主角/第一人称（避免后文配角抢主标签，也避免主角顶替首句点名）
    for (const line of textParts) {
      const mentioned = [...nameSet]
        .filter(n => line.includes(n))
        .sort((a, b) => b.length - a.length)
      for (const n of mentioned.filter(n => !isProtagonistPortraitName(n, chars))) push(n)
      for (const n of mentioned.filter(n => isProtagonistPortraitName(n, chars))) push(n)
    }
  }

  // 3) 推不出时才用分镜绑定 / 主角兜底
  if (!ordered.length) {
    for (const n of options.fallbackNames || []) push(String(n || '').trim())
  }
  if (!ordered.length) {
    const protag = chars.find(c => /主角|主人公|男主|女主/.test(c.role))
      || chars.find(c => FIRST_PERSON_PORTRAIT_NAMES.has(c.name))
    if (protag) push(protag.name)
  }
  return ordered
}

/**
 * 漫画解说：按本段旁白/对白推断应在场定妆（不限人数）。
 * 不依赖「递/塞/对峙」等互动词——本段点名/说话人有几人就要求同框几人。
 */
export function resolveMotionComicOnScreenPortraitNames(options: {
  characters: Array<{ name?: string | null; role?: string | null; variantLabel?: string | null }>
  dialogue?: string | null
  narrationLines?: string[] | null
  fallbackNames?: string[] | null
}): string[] {
  return resolveExpectedPortraitNamesForPrompt(options)
}

/**
 * 纠正【画面主体】误写的定妆标签：须与本段对白说话人 / 旁白点名角色一致。
 */
export function alignPortraitLabelsInImagePromptCn(
  prompt: string,
  characters: PortraitCharacterLike[],
  context?: {
    dialogue?: string | null
    narrationLines?: string[] | null
    fallbackNames?: string[] | null
    /** 漫画解说：允许多个对照定妆同框（人数跟文案，不封顶） */
    allowDualPortrait?: boolean
  },
): string {
  let text = String(prompt || '').trim()
  if (!text || !/对照定妆「/.test(text)) return text

  const charHints: PortraitNameHint[] = characters.map(c => ({
    name: String(c.name || '').trim(),
    role: String(c.role || '').trim(),
    variantLabel: c.variantLabel,
  }))

  const expected = resolveExpectedPortraitNamesForPrompt({
    characters,
    dialogue: context?.dialogue,
    narrationLines: context?.narrationLines,
    fallbackNames: context?.fallbackNames,
  })
  if (!expected.length) return text

  const labelOf = (name: string) => {
    const ch = characters.find(c => String(c.name || '').trim() === name)
    return formatCharacterPortraitLabel(name, ch?.variantLabel)
  }

  const rewriteLabels = (keep: string[]) => {
    let i = 0
    const seen = new Set<string>()
    return text.replace(/对照定妆「[^」]+」/g, () => {
      if (i >= keep.length) return ''
      const name = keep[i]
      i += 1
      if (seen.has(name)) return ''
      seen.add(name)
      return `对照定妆「${labelOf(name)}」`
    }).replace(/，{2,}/g, '，').replace(/：，/g, '：')
  }

  const currentNames = [...text.matchAll(/对照定妆「([^」]+)」/g)]
    .map(m => m[1].split('·')[0].trim())
    .filter(Boolean)
  if (!currentNames.length) return text

  const nameSet = new Set(charHints.map(c => c.name).filter(Boolean))
  const uniqueCurrent = [...new Set(currentNames)]
  const allCurrentValid = uniqueCurrent.every(n => nameSet.has(n))
  const allowMulti = !!context?.allowDualPortrait
  const maxLabels = allowMulti ? Math.max(expected.length, 1) : 1

  // 超过本段期望人数：压到期望名单
  if (allCurrentValid && uniqueCurrent.length > maxLabels) {
    if (allowMulti) {
      const keep = [
        ...expected.filter(n => uniqueCurrent.includes(n)),
        ...uniqueCurrent.filter(n => !expected.includes(n)),
      ].slice(0, maxLabels)
      return rewriteLabels(keep)
    }
    const keep = (expected[0] && uniqueCurrent.includes(expected[0]))
      ? expected[0]
      : uniqueCurrent[0]
    return enforceSingleCharacterFrameInImagePromptCn(text, keep, characters)
  }

  // 多人合法：标签均在角色表，且覆盖期望主角色
  if (allowMulti && uniqueCurrent.length >= 2 && allCurrentValid) {
    if (expected[0] && !uniqueCurrent.includes(expected[0])) {
      const rest = uniqueCurrent.filter(n => n !== expected[0])
      const keep = [expected[0], ...rest].filter((n, idx, arr) => arr.indexOf(n) === idx).slice(0, maxLabels)
      return rewriteLabels(keep)
    }
    // 期望多人但漏写：交由 inject 补标签；此处不擅自删合法标签
    return text
  }

  const expectedSet = new Set(expected.slice(0, maxLabels))
  const allOk = currentNames.every(n => expectedSet.has(n) || (allowMulti && nameSet.has(n)))
  const primaryWrong = currentNames.length === 1
    && !!expected[0]
    && currentNames[0] !== expected[0]
  const primaryMissing = !!expected[0] && !currentNames.includes(expected[0])
  // 标签全是主角/第一人称，但本镜主角色是其他具名角色
  const protagonistOnlyMismatch = currentNames.length > 0
    && currentNames.every(n => isProtagonistPortraitName(n, charHints))
    && !!expected[0]
    && !isProtagonistPortraitName(expected[0], charHints)

  if (allOk && !primaryWrong && !primaryMissing && !protagonistOnlyMismatch) return text

  let i = 0
  const replaceExpected = expected.slice(0, Math.max(currentNames.length, 1)).slice(0, maxLabels)
  return text.replace(/对照定妆「[^」]+」/g, () => {
    const name = replaceExpected[Math.min(i, replaceExpected.length - 1)]
    i += 1
    return `对照定妆「${labelOf(name)}」`
  })
}

/**
 * 配图文案强制单定妆：保留 keepName 的第一处对照定妆，删除其余对照定妆标签。
 */
export function collapseToSinglePortraitLabelInImagePromptCn(
  prompt: string,
  keepName: string,
  characters?: PortraitCharacterLike[],
): string {
  const keep = String(keepName || '').trim()
  if (!keep) return String(prompt || '')
  const ch = (characters || []).find(c => String(c.name || '').trim() === keep)
  const label = formatCharacterPortraitLabel(keep, ch?.variantLabel)
  let kept = false
  let text = String(prompt || '').replace(/对照定妆「[^」]+」/g, () => {
    if (kept) return ''
    kept = true
    return `对照定妆「${label}」`
  })
  if (!kept && /【画面主体[：:]/.test(text)) {
    text = text.replace(/【画面主体[：:]/, `【画面主体：对照定妆「${label}」，`)
  }
  return text
    .replace(/[；，、]\s*位于画面(?:左侧|右侧|中间|左|右)[^，；】]{0,40}/g, '')
    .replace(/([，；、]){2,}/g, '$1')
    .replace(/，{2,}/g, '，')
    .replace(/；{2,}/g, '；')
    .replace(/：，/g, '：')
    .replace(/，】/g, '】')
    .trim()
}

/**
 * 单人入镜硬清理：标签压成一个 + 去掉动作/光影里的第二人描述（否则生图仍会画两人）。
 */
export function enforceSingleCharacterFrameInImagePromptCn(
  prompt: string,
  keepName: string,
  characters?: PortraitCharacterLike[],
): string {
  const keep = String(keepName || '').trim()
  if (!keep) return String(prompt || '')
  let text = collapseToSinglePortraitLabelInImagePromptCn(prompt, keep, characters)

  const otherNames = [...new Set(
    (characters || [])
      .map(c => String(c.name || '').trim())
      .filter(n => n && n !== keep && !PORTRAIT_LABEL_NARRATION_ONLY.has(n)),
  )].sort((a, b) => b.length - a.length)

  // 画面主体：勿写「左侧/右侧」暗示对面还有人；清残留英文身份词
  text = text.replace(/【画面主体[：:]([^】]*)】/g, (_, inner: string) => {
    let body = String(inner || '')
      .replace(/位于画面(?:左侧|右侧|左|右)(?:中景|近景|远景|特写)?/g, '位于画面中央中景')
      .replace(/\s*[A-Za-z][A-Za-z0-9\s_-]{1,40}\s*）/g, '）')
      .replace(/（\s*）/g, '')
      .replace(/([^（])）/g, '$1')
      .replace(/\s+）/g, '')
    if (!/仅一名|禁止第二人|单人入镜|独自/.test(body)) {
      body = `画面仅一名人物入镜，禁止第二人及对方手背影侧影，${body}`
    }
    body = body
      .replace(/[，；]?[^，；]*(?:背影|侧影|虚化(?:人影|侧影)|画外伸(?:来的)?手|对面(?:的)?(?:手|掌|臂))[^，；]*/g, '')
      .replace(/[，；]{2,}/g, '，')
      .replace(/^，|，$/g, '')
      .trim()
    return `【画面主体：${body}】`
  })

  // 核心细节动作：删掉只描述其他人的分句；去掉「至我掌心」等交互对象与对方肢体
  text = text.replace(/【核心细节动作[：:]([^】]*)】/g, (_, inner: string) => {
    let body = String(inner || '')
    const parts = body.split(/[，；]/).map(s => s.trim()).filter(Boolean)
    const keptParts = parts.filter((p) => {
      const hitOther = otherNames.some(n => p.includes(n))
      const hitKeep = p.includes(keep)
      if (hitOther && !hitKeep) return false
      return true
    })
    body = keptParts.join('，')
    for (const n of otherNames) {
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      body = body
        .replace(new RegExp(`至${esc}[^，；]*`, 'g'), '')
        .replace(new RegExp(`给${esc}[^，；]*`, 'g'), '')
        .replace(new RegExp(`${esc}(?:左手|右手|双手|掌心|胸前|手|臂|背影|侧影)?[^，；]{0,16}`, 'g'), '')
    }
    body = body
      .replace(/双方|两人相对|面对面|并排对坐|对峙/g, '')
      .replace(/两人[^，；]*/g, '')
      .replace(/(?:与|和|跟)?对方[^，；]{0,16}/g, '')
      .replace(/视线(?:在空中)?交汇[^，；]*/g, '')
      .replace(/孙女[^，；]*/g, '')
      .replace(/依偎在大人怀中[^，；]*/g, '')
      .replace(/肢体形成强烈的拉扯张力/g, '姿态紧绷')
      // 禁止用第二人局部入镜（易反转施受，如「我的手接钱」像是我在塞钱）
      .replace(/[，；]?[^，；]*(?:背影|侧影|虚化(?:人影|侧影))[^，；]*/g, '')
      .replace(/[，；]?[^，；]*画外伸(?:来的)?(?:手|臂)[^，；]*/g, '')
      .replace(/[，；]?[^，；]*(?:对面|对方|另一人)(?:的)?(?:左手|右手|双手|手掌|掌心|手|手臂)[^，；]*/g, '')
      .replace(/[，；]?[^，；]*递(?:到|至|进|入)(?:我的|对方|对面)?(?:掌心|手里|手中)[^，；]*/g, '手持物向前伸出')
      .replace(/[，；]?[^，；]*接过[^，；]*/g, '')
      .replace(/[，；]{2,}/g, '，')
      .replace(/^，|，$/g, '')
      .trim()
    if (!body) {
      body = `${keep}独自在画面中央，神情与姿态符合本段情绪`
    }
    if (!/仅一名|禁止第二人|独自|单人入镜/.test(body)) {
      body = `${body}；画面仅一名人物入镜，禁止第二人及对方手背影侧影`
    }
    return `【核心细节动作：${body}】`
  })

  // 光影色调：去掉「两人」
  text = text.replace(/【光影色调[：:]([^】]*)】/g, (_, inner: string) => {
    const body = String(inner || '')
      .replace(/照亮两人[^，；】]*/g, '照亮人物面部')
      .replace(/两人面部表情/g, '人物面部表情')
      .replace(/两人/g, '人物')
    return `【光影色调：${body}】`
  })

  // 叙事型/七维共用：去掉仍暗示第二人肢体入镜的互动措辞（易出多肢汤）
  text = text
    .replace(/拉(?:着|住)身旁人的衣袖/g, '自己伸手拉向画外衣袖方向')
    .replace(/拉(?:着|住)身旁(?:的)?人(?:的)?(?:衣袖|袖口|手腕|手臂|手)?/g, '自己伸手拉向画外')
    .replace(/握(?:着|住)对方(?:的)?(?:手腕|手|衣袖)/g, '自己伸手拉向画外')
    .replace(/身旁人的(?:衣袖|袖口|手腕|手臂|手)/g, '画外衣袖方向')
    .replace(/身旁人/g, '画外')

  return text
    .replace(/([，；、]){2,}/g, '$1')
    .replace(/，{2,}/g, '，')
    .replace(/；{2,}/g, '；')
    .trim()
}

export type PortraitLabelValidation = {
  ok: boolean
  expected: string[]
  actual: string[]
  reason?: 'missing_portrait_label' | 'primary_label_mismatch' | 'protagonist_only_mismatch' | 'multi_portrait_same_frame' | 'missing_secondary_portrait'
}

/**
 * 万能定妆标签校验（不绑某一剧本）：
 * - 期望角色仅由本集 characters + 本段对白/旁白推断
 * - 有明确应出镜角色时必须有对照定妆，且主标签须为期望主角色
 * - 禁止用主角/第一人称标签顶替本段点名的其他角色
 * - 默认禁止同一文案出现 ≥2 个不同对照定妆；allowDualPortrait 时按文案人数同框（不封顶）
 * - allowDualPortrait 且本段期望 ≥2 人时，须写齐全部期望对照定妆
 */
export function validateImagePromptPortraitLabels(
  prompt: string,
  characters: PortraitCharacterLike[],
  context?: {
    dialogue?: string | null
    narrationLines?: string[] | null
    fallbackNames?: string[] | null
    allowDualPortrait?: boolean
  },
): PortraitLabelValidation {
  const charHints: PortraitNameHint[] = characters.map(c => ({
    name: String(c.name || '').trim(),
    role: String(c.role || '').trim(),
    variantLabel: c.variantLabel,
  }))
  const expectedAll = resolveExpectedPortraitNamesForPrompt({
    characters,
    dialogue: context?.dialogue,
    narrationLines: context?.narrationLines,
    fallbackNames: context?.fallbackNames,
  })
  const allowMulti = !!context?.allowDualPortrait
  const expected = allowMulti ? expectedAll : expectedAll.slice(0, 1)
  const actual = [...String(prompt || '').matchAll(/对照定妆「([^」]+)」/g)]
    .map(m => m[1].split('·')[0].trim())
    .filter(Boolean)

  if (!characters.length || !expected.length) {
    return { ok: true, expected, actual }
  }

  const uniqueActual = [...new Set(actual)]
  const maxLabels = allowMulti ? Math.max(expected.length, 1) : 1
  if (uniqueActual.length > maxLabels) {
    return { ok: false, expected, actual, reason: 'multi_portrait_same_frame' }
  }

  if (!actual.length) {
    return { ok: false, expected, actual, reason: 'missing_portrait_label' }
  }

  const expectedPrimary = expected[0]
  const actualAllProtagonist = actual.every(n => isProtagonistPortraitName(n, charHints))
  if (actualAllProtagonist && !isProtagonistPortraitName(expectedPrimary, charHints)) {
    return { ok: false, expected, actual, reason: 'protagonist_only_mismatch' }
  }

  if (!actual.includes(expectedPrimary)) {
    return { ok: false, expected, actual, reason: 'primary_label_mismatch' }
  }

  // 本段旁白已点名/对白多人：须同框写齐全部期望对照定妆
  if (allowMulti && expected.length >= 2) {
    const nameSet = new Set(charHints.map(c => c.name).filter(Boolean))
    if (uniqueActual.some(n => !nameSet.has(n))) {
      return { ok: false, expected, actual, reason: 'multi_portrait_same_frame' }
    }
    if (uniqueActual.length < expected.length || expected.some(n => !uniqueActual.includes(n))) {
      return { ok: false, expected, actual, reason: 'missing_secondary_portrait' }
    }
  }

  return { ok: true, expected, actual }
}

function extractEnglishTags(appearance: string): { body: string; tags: string } {
  const match = appearance.match(/\bEnglish tags:\s*(.+)$/im)
  if (!match) return { body: appearance.trim(), tags: '' }
  return {
    body: appearance.replace(/\s*\bEnglish tags:\s*.+$/im, '').trim(),
    tags: match[1].trim(),
  }
}

function extractAgeText(body: string): string {
  const m = body.match(/(\d{1,2})\s*岁/)
  return m ? `${m[1]}岁` : ''
}

function uniqueChunks(matches: RegExpMatchArray | Iterable<RegExpMatchArray> | null): string[] {
  const out: string[] = []
  if (!matches) return out
  for (const m of matches) {
    const t = String(m[0] || m[1] || '').trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

function extractOutfit(body: string): string {
  const hexParts: string[] = []
  for (const m of body.matchAll(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})[^，,；;】）)]*/g)) {
    const part = m[0].trim()
    if (part && !hexParts.includes(part)) hexParts.push(part)
  }
  if (hexParts.length) return hexParts.join('，')
  const wear = body.match(/(?:穿|身穿|着)[^，,；;】）)]{2,48}/)
  return wear?.[0]?.trim() || ''
}

function extractFaceShape(body: string): string {
  return uniqueChunks(body.matchAll(FACE_SHAPE_RE)).join('，')
}

function extractBrowsEyes(body: string): string {
  return uniqueChunks(body.matchAll(BROWS_EYES_RE)).join('，')
}

function extractHairStyle(body: string): string {
  return uniqueChunks(body.matchAll(HAIR_STYLE_RE)).join('，')
}

function extractBodyBuild(body: string, minimal?: boolean): string {
  const chunks = uniqueChunks(body.matchAll(BODY_BUILD_RE))
  if (chunks.length) return chunks.join('，')
  if (minimal) return ''
  if (/男|男主/.test(body)) return '正常头身比，肩宽适中，四肢修长匀称'
  if (/女|女主/.test(body)) return '正常头身比，肩窄腰线柔和，四肢匀称'
  return '正常头身比，身形匀称'
}

function extractTraits(body: string): string {
  const traits: string[] = []
  for (const m of body.matchAll(/[^，,；;】）)]*(?:眼镜|圆框镜|疤痕|痣|耳环|耳钉|项链|手表|工牌|胡茬|鬓白|皱纹|酒窝)[^，,；;】）)]*/g)) {
    const t = m[0].trim()
    if (t && !HANDHELD_RE.test(t) && !traits.includes(t)) traits.push(t)
  }
  return traits.join('，')
}

function composeSpecCn(parts: {
  genderLabel: '男性' | '女性' | null
  ageText: string
  stageLabel: string
  faceShape: string
  browsEyes: string
  hairStyle: string
  bodyBuild: string
  outfit: string
  traits: string
}, includeOutfit = true): string {
  return [
    parts.genderLabel,
    parts.ageText || (parts.stageLabel && parts.stageLabel !== '常态' ? `${parts.stageLabel}期` : ''),
    parts.faceShape,
    parts.browsEyes,
    parts.hairStyle,
    parts.bodyBuild,
    includeOutfit ? parts.outfit : '',
    parts.traits,
  ].filter(Boolean).join('，')
}

/** 从 appearance 文本解析结构化定妆规格 */
export function parsePortraitAppearanceSpec(
  appearance: string,
  context?: {
    name?: string | null
    role?: string | null
    variantLabel?: string | null
    minimal?: boolean
  },
): PortraitAppearanceSpec {
  const { body, tags } = extractEnglishTags(sanitizePortraitAppearanceForGeneration(appearance))
  const cnBody = context?.minimal
    ? coerceMinimalCharacterAppearance(context.variantLabel, body || appearance)
    : body

  const genderLabel = resolveCharacterGenderLabelCn(context?.name, context?.role, cnBody)
    ?? (/女性|女主/.test(cnBody) ? '女性' : /男性|男主/.test(cnBody) ? '男性' : null)

  const ageText = extractAgeText(cnBody)
  const stageLabel = String(context?.variantLabel || '').trim()
  const faceShape = extractFaceShape(cnBody)
    || (genderLabel === '男性' ? '俊朗棱角动漫脸型' : genderLabel === '女性' ? '清秀精致动漫脸型' : '')
  const browsEyes = extractBrowsEyes(cnBody)
    || (genderLabel === '男性' ? '剑眉，深褐眼眸带瞳孔高光，眼白正常' : genderLabel === '女性' ? '细眉，大而清晰的黑瞳眼眸带高光，眼白正常' : '')
  const hairStyle = extractHairStyle(cnBody)
  const bodyBuild = extractBodyBuild(cnBody, context?.minimal)
  const outfit = extractOutfit(cnBody)
  const traits = extractTraits(cnBody)

  const parts = {
    genderLabel,
    ageText,
    stageLabel,
    faceShape,
    browsEyes,
    hairStyle,
    bodyBuild,
    outfit,
    traits,
  }

  return {
    genderLabel,
    ageText,
    stageLabel,
    faceShape,
    browsEyes,
    hairStyle,
    bodyBuild,
    outfit,
    traits,
    englishTags: tags,
    specCn: composeSpecCn(parts, true),
    identitySpecCn: composeSpecCn(parts, false),
  }
}

export function formatPortraitAppearanceSpecCn(spec: PortraitAppearanceSpec): string {
  return spec.identitySpecCn || spec.specCn
}

/**
 * Kolors 分镜外貌短句：只锁脸型/眉眼/发型/标志配饰，不含服装（服装随本镜身穿）。
 * 中文解析不到时回退 English tags（去掉背景/姿势/服装）。
 */
export function formatPortraitIdentityShortCn(spec: PortraitAppearanceSpec): string {
  const chunks: string[] = []
  const pushUnique = (s?: string | null) => {
    const t = String(s || '').trim()
    if (!t) return
    if (chunks.includes(t)) return
    // 避免「45岁」「45岁」重复
    if (/^\d{1,2}岁$/.test(t) && chunks.some(c => c === t || c.includes(t))) return
    chunks.push(t)
  }
  pushUnique(spec.genderLabel)
  pushUnique(spec.ageText)
  pushUnique(spec.faceShape)
  pushUnique(spec.browsEyes)
  pushUnique(spec.hairStyle)
  pushUnique(spec.traits)

  const needEnFallback = !spec.faceShape?.trim() || !spec.hairStyle?.trim()
  if (needEnFallback && spec.englishTags?.trim()) {
    const skipRe =
      /background|widescreen|16:9|pure white|pose|standing|arms at|head to chest|proportions|empty hands|no props|casual suit|uniform|hoodie|jacket|shirt|pants|trousers|blazer|coat|sweater|#(?:[0-9a-f]{3}|[0-9a-f]{6})/i
    for (const t of spec.englishTags.split(',').map(s => s.trim()).filter(Boolean)) {
      if (skipRe.test(t)) continue
      if (/^\d+-year-old/i.test(t) && chunks.some(c => /\d{1,2}岁/.test(c))) continue
      pushUnique(t)
      if (chunks.length >= 10) break
    }
  }

  let core = chunks.join('，')
  if (!core) {
    core = String(spec.identitySpecCn || '')
      .replace(/[，,]?(?:身穿|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))[^，,]*/g, '')
      .replace(/[，,]{2,}/g, '，')
      .replace(/^[，,]+|[，,]+$/g, '')
      .trim()
  }
  if (!core) return ''
  if (core.length > 140) core = `${core.slice(0, 140).replace(/[，,]\s*$/, '')}…`
  return `同一人外貌：${core}，脸型与发型跨镜保持一致`
}

/** 将外貌短句前置到 Kolors 中文 prompt（避免重复注入） */
export function enrichKolorsPortraitIdentityChinese(
  prompt: string,
  spec: PortraitAppearanceSpec,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return raw
  if (/同一人外貌：|脸型与发型跨镜保持一致|脸型与发型须与定妆参考一致/.test(raw)) return raw.slice(0, 1800)
  const short = formatPortraitIdentityShortCn(spec)
  if (!short) return raw.slice(0, 1800)
  return `${short}。${raw}`.slice(0, 1800)
}

function parseAgeYearsFromText(...parts: Array<string | null | undefined>): number | null {
  const merged = parts.filter(Boolean).join(' ')
  const m = merged.match(/(\d{1,2})\s*岁/)
  return m ? Number.parseInt(m[1], 10) : null
}

function isMatureFemaleAppearance(spec: PortraitAppearanceSpec, extraText = ''): boolean {
  const age = parseAgeYearsFromText(spec.ageText, spec.specCn, spec.stageLabel, extraText)
  if (age != null && age >= 28) return true
  const merged = `${spec.ageText} ${spec.stageLabel} ${spec.specCn} ${extraText}`
  return /中年|35|36|37|38|39|40|45|50|成熟|mature|middle.?aged/i.test(merged)
}

function resolveFemaleIdentityEnLead(spec: PortraitAppearanceSpec, extraText = ''): string[] {
  const age = parseAgeYearsFromText(spec.ageText, spec.specCn, extraText)
  if (isMatureFemaleAppearance(spec, extraText)) {
    const ageLabel = age != null && age >= 18 ? `${age}-year-old` : '35-year-old'
    return [
      `${ageLabel} mature woman protagonist`,
      '1woman',
      'adult female',
      'mature soft anime face',
      'NOT child NOT teenager NOT loli NOT young girl',
    ]
  }
  if (age != null && age >= 18) {
    return ['young adult woman protagonist', '1woman', 'adult female', 'NOT child NOT loli']
  }
  return ['young female protagonist', '1girl', 'beautiful delicate oval anime face']
}

const OUTFIT_EN_TAG_RE =
  /\b(uniform|hoodie|jacket|shirt|pants|trousers|robe|dress|skirt|t-?shirt|coat|sweater|vest|apron|suit|blazer|overalls|工装|服装)\b/i

/** 英文身份块：脸型/发型/身形，不含服装（服装由分镜场景自写） */
export function formatPortraitIdentitySpecEn(spec: PortraitAppearanceSpec, gender?: PortraitGender): string {
  const parts: string[] = []
  if (gender === 'male' || spec.genderLabel === '男性') {
    parts.push('young male protagonist', '1boy', 'handsome sharp jawline anime face', 'masculine facial features')
  } else if (gender === 'female' || spec.genderLabel === '女性') {
    parts.push(...resolveFemaleIdentityEnLead(spec))
  }
  if (spec.englishTags) {
    for (const t of spec.englishTags.split(',').map(s => s.trim()).filter(Boolean)) {
      if (OUTFIT_EN_TAG_RE.test(t)) continue
      if (!parts.some(p => p.toLowerCase() === t.toLowerCase())) parts.push(t)
    }
  } else {
    if (spec.faceShape) parts.push('defined anime face shape, sharp facial features')
    if (spec.browsEyes) parts.push('expressive anime eyes with catchlights, natural dark iris, white sclera, defined eyebrows')
    if (spec.hairStyle) parts.push('consistent hairstyle, same hair color and length')
    if (spec.bodyBuild) parts.push('normal anime body proportions, consistent shoulder width and limb length')
  }
  parts.push('same face shape and hairstyle as character reference, consistent body silhouette')
  return parts.filter(Boolean).join(', ')
}

/** 英文定妆块：供 Flux Subjects in frame 前缀注入（身份为主，服装留给场景译文） */
export function formatPortraitAppearanceSpecEn(spec: PortraitAppearanceSpec, gender?: PortraitGender): string {
  return formatPortraitIdentitySpecEn(spec, gender)
}

export function buildPortraitAppearanceSpecFromCharacter(
  char: PortraitCharacterLike,
  style?: string | null,
): PortraitAppearanceSpec {
  const minimal = isNarrationMinimalStyle(style)
  return parsePortraitAppearanceSpec(char.appearance || '', {
    name: char.name,
    role: char.role,
    variantLabel: char.variantLabel,
    minimal,
  })
}

/** 定妆对照锚点：只写标签；脸型/发型以定妆图为准，文案不重写外貌 */
export function buildPortraitSubjectAnchor(char: PortraitCharacterLike, _style?: string | null): string {
  const label = formatCharacterPortraitLabel(char.name || '', char.variantLabel)
  return `对照定妆「${label}」`
}

const SCENE_EXPRESSION_RE =
  /表情|神情|汗珠|泛红|脸红|颤抖|瞳孔收缩|瞳孔放大|瞳孔微缩|眼神|嘴角|嘴微|嘴抿|抿紧|瞪眼|含泪|咬牙|皱眉|眉头|眉目|微笑|疲惫|紧张|震惊|愣|呆|惊讶|愤怒|发虚|舒展|微扬|低垂|望向|凝视|睁大|眯眼|抽噎|泪光|冷汗/

/** 固定外貌块（脸型/发型/身形/定妆配饰）；不含本镜可变表情 */
function isStaticPortraitIdentityChunk(chunk: string): boolean {
  const c = String(chunk || '').trim()
  if (!c) return true
  if (isSceneExpressionChunk(c)) return false
  if (/^(男性|女性)$/.test(c)) return true
  if (/\d{1,2}\s*岁/.test(c)) return true
  if (/脸型|俊朗|清秀|成熟柔和|立体|精致|棱角|下颌|下巴|瓜子脸|鹅蛋脸|圆脸|方脸|长脸|面相/.test(c)) return true
  if (/(?:剑眉|细眉|浓眉|细长眼|眼眸|双眼皮|眼带[^，]{0,8}高光|瞳孔高光|清澈高光|大而清晰|大而灵动)/.test(c)) return true
  if (/(?:短发|长发|中长发|中发|碎发|刘海|马尾|微卷|披肩|发尾|黑发|棕发|白发|发色|凌乱|卷发|直发)/.test(c)) return true
  if (/(?:正常头身比|头身比|肩宽|身形|体型|四肢|修长|匀称|躯干|三头身|标准体型)/.test(c)) return true
  if (/(?:耳钉|手表|眼镜|项链|手链|配饰|戴简约)/.test(c)) return true
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/.test(c)) return true
  if (/^(穿|身穿)/.test(c)) return true
  return false
}

function isSceneExpressionChunk(chunk: string): boolean {
  const c = String(chunk || '').trim()
  if (!c) return false
  if (BASELINE_MOOD_RE.test(c)) return false
  return SCENE_EXPRESSION_RE.test(c)
}

/** 从「对照定妆「标签」（…）」括号取保留的表情文案 */
function extractSceneExpression(inner: string): string {
  const paren = inner.match(/对照定妆「[^」]+」(（([^）]*)）)/)?.[2]?.trim()
    || inner.match(/^（([^）]+)）/)?.[1]?.trim()
    || ''
  if (!paren) return ''
  return paren
    .split(/[，,]/)
    .map(s => s.trim())
    .filter(c => c && isSceneExpressionChunk(c) && !isStaticPortraitIdentityChunk(c))
    .join('，')
}

/**
 * 仅规则清洗：去掉定妆身份括号内的脸型/发型/身形等，保留表情与位于/身穿。
 * 多人同框（≥2 个对照定妆）时保留脸型/眉眼/发型辨识差，避免同框撞脸。
 */
export function stripPortraitStaticIdentityFromImagePromptCn(prompt: string): string {
  const trimmed = String(prompt || '').trim()
  if (!trimmed) return trimmed
  const portraitCount = [...trimmed.matchAll(/对照定妆「[^」]+」/g)].length
  const keepDistinctIdentity = portraitCount >= 2

  const cleanInner = (inner: string): string => {
    let body = String(inner || '').trim()
    if (!body) return body

    // 主人公：对照定妆「x」（…）→ 单人只留表情；多人保留辨识差+表情
    body = body.replace(
      /(对照定妆「[^」]+」)(（([^）]*)）)?/g,
      (_m, anchor: string, _fullParen: string | undefined, parenContent: string | undefined) => {
        if (!parenContent?.trim()) return anchor
        const kept = parenContent
          .split(/[，,+/]/)
          .map(s => s.trim())
          .filter(c => {
            if (!c) return false
            if (/^(angular\s+face|mole|chin\s*mole|beauty\s*mark)$/i.test(c)) return false
            if (keepDistinctIdentity) {
              // 多人：保留脸型/眉眼/发型辨识，仍去掉身形计量与纯配饰堆砌可选项外的噪音
              if (/正常头身比|头身比|肩宽|身形|体型|四肢|修长|匀称|躯干|三头身|标准体型/.test(c)) return false
              return true
            }
            return !isStaticPortraitIdentityChunk(c)
          })
          .join('，')
        return kept ? `${anchor}（${kept}）` : anchor
      },
    )

    // 配角括号：去掉「精致动漫脸型」等，保留服装/表情
    body = body.replace(
      /(一位[^（]{0,40}?(?:配角|邻居|路人)[^（]{0,24}位于[^（]{0,48}?)(（([^）]*)）)/g,
      (_m, head: string, _full: string, parenContent: string) => {
        const kept = parenContent
          .split(/[，,+/]/)
          .map(s => s.trim())
          .filter(c => {
            if (!c) return false
            if (/^(穿|身穿)/.test(c) || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/.test(c)) return true
            if (isSceneExpressionChunk(c)) return true
            if (/精致动漫脸型|俊朗|清秀|动漫脸型|下巴小痣|angular\s*face/i.test(c)) return false
            return !isStaticPortraitIdentityChunk(c)
          })
          .join('，')
        return kept ? `${head}（${kept}）` : head
      },
    )

    // 身穿括号被写成「夹克 + 下巴小痣 + angular face」时剥掉身份尾巴
    body = body.replace(/（身穿([^）]*)）/g, (_m, inner: string) => {
      const kept = String(inner || '')
        .split(/[，,+/]/)
        .map(s => s.trim())
        .filter(c => {
          if (!c) return false
          if (/下巴小痣|小痣|angular\s*face|sharp\s*jawline|脸型|发型/i.test(c)) return false
          if (isStaticPortraitIdentityChunk(c) && !/^(?:身穿)?#/.test(c) && !/^#/.test(c) && !/^穿/.test(c)) return false
          return true
        })
        .join('，')
      return kept ? `（身穿${kept.replace(/^身穿/, '')}）` : ''
    })
    body = body.replace(/，?\s*(?:下巴小痣|angular\s*face)/gi, '')

    // 游离脸型词（误写在配角外）
    body = body.replace(/，?\s*(?:精致|俊朗|清秀)?(?:棱角)?动漫脸型/g, '')

    // 主人公（身穿）被挤到配角之后时搬回姿态后
    body = body.replace(
      /(位于[^，【\]]{0,48}以[^，【\]]{0,32}姿态)(，一位[^（【\]]{0,48}（(?:穿|身穿)[^）]+）)（身穿([^）]+)）/,
      '$1（身穿$3）$2',
    )

    return body
      .replace(/（\s*）/g, '')
      .replace(/，{2,}/g, '，')
      .replace(/（，/g, '（')
      .replace(/，）/g, '）')
  }

  const scrubBracket = (text: string, label: string): string => {
    // 全角【】与少数半角 [] 混用文案均清洗
    const patterns = [
      new RegExp(`(【${label}[：:]\\s*)([^】]*)(】)`, 'g'),
      new RegExp(`(\\[${label}[：:]\\s*)([^\\]]*)(\\])`, 'g'),
    ]
    let next = text
    for (const re of patterns) {
      next = next.replace(re, (_, open, inner, close) => `${open}${cleanInner(inner)}${close}`)
    }
    return next
  }

  let out = trimmed
  if (/[【\[]左格/.test(out) && /[【\[]右格/.test(out)) {
    out = scrubBracket(out, '左格')
    out = scrubBracket(out, '右格')
  }
  if (/[【\[]画面主体[：:]/.test(out)) {
    out = scrubBracket(out, '画面主体')
  }
  return out
}

function extractLocationTail(inner: string): string {
  const idx = inner.indexOf('位于')
  if (idx >= 0) return inner.slice(idx).trim()
  const extras = inner.match(/(?:，|^)(无配角|一位或几位配角[^，,；;】）)]*)/)?.[0]
  return extras?.trim() || ''
}

/** 从位于…姿态 句尾提取本镜服装（身穿#hex…） */
function extractSceneOutfit(tail: string, fallbackOutfit?: string): string {
  const t = String(tail || '').trim()
  const paren = t.match(/（身穿([^）]+)）/)?.[1]?.trim()
  if (paren) return `（身穿${paren}）`
  const inline = t.match(/身穿#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})[^，,；;】）)]*/)?.[0]?.trim()
  if (inline) return `（${inline}）`
  if (fallbackOutfit?.trim()) {
    const o = fallbackOutfit.trim()
    return o.startsWith('（') ? o : `（${o.startsWith('穿') ? o : `身穿${o}`}）`
  }
  return ''
}

function mergeLocationTail(baseTail: string, sceneOutfit: string): string {
  let tail = String(baseTail || '').trim()
  if (!sceneOutfit) return tail
  const companionMatch = tail.match(/(，?无配角|，?一位或几位配角[^，,；;】）)]*)\s*$/)
  const companionSuffix = companionMatch?.[1] || ''
  let core = companionSuffix ? tail.slice(0, tail.length - companionSuffix.length) : tail
  core = core
    .replace(/（身穿[^）]*）/g, '')
    .replace(/，?身穿#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})[^，,；;】）)]*/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/，$/g, '')
    .trim()
  const outfitText = sceneOutfit.startsWith('（') ? sceneOutfit : `（${sceneOutfit}）`
  if (/位于/.test(core)) return `${core}${outfitText}${companionSuffix}`
  return `${tail}${outfitText}`
}

function rebuildSubjectWithPortraitSpec(
  inner: string,
  char: PortraitCharacterLike,
  style?: string | null,
): string {
  const label = formatCharacterPortraitLabel(char.name || '', char.variantLabel)
  const spec = buildPortraitAppearanceSpecFromCharacter(char, style)
  // 脸型/发型固定参照定妆图：括号内只保留本镜表情，不再注入 identitySpecCn
  const expression = extractSceneExpression(inner)
  const rawTail = extractLocationTail(inner)
  const sceneOutfit = extractSceneOutfit(rawTail, spec.outfit)
  const tail = mergeLocationTail(rawTail, sceneOutfit)

  const anchor = expression
    ? `对照定妆「${label}」（${expression}）`
    : `对照定妆「${label}」`

  if (tail) return `${anchor}${tail.startsWith('，') ? '' : ''}${tail}`
  return anchor
}

function resolvePortraitCharacterForSubject(
  inner: string,
  characters: PortraitCharacterLike[],
): PortraitCharacterLike | null {
  const labelMatch = inner.match(/对照定妆「([^」]+)」/)
  if (labelMatch?.[1]) {
    const parts = labelMatch[1].trim().split('·').map(s => s.trim())
    const name = parts[0]
    const stage = parts[1] || ''
    const matches = characters.filter(c => String(c.name || '').trim() === name)
    if (!matches.length) return null
    if (stage) {
      const exact = matches.find(c => String(c.variantLabel || '').trim() === stage)
      if (exact) return exact
    }
    return matches.find(c => c.imageUrl?.trim()) || matches[0]
  }
  return characters.find(c => c.imageUrl?.trim()) || characters[0] || null
}

/** 括号内是否已含定妆辨识差（勿把「眉头紧锁/瞪大双眼」等表情误判为已有 cue） */
function parenAlreadyHasDistinctIdentityCue(body: string): boolean {
  const raw = String(body || '').trim()
  if (!raw) return false
  // 先去掉本镜表情片段，再查脸型/眉形/发型等静态身份词
  const stripped = raw
    .split(/[，,]/)
    .map(s => s.trim())
    .filter(c => c && !isSceneExpressionChunk(c) && !SCENE_EXPRESSION_RE.test(c))
    .join('，')
  if (!stripped) return false
  return /鹅蛋脸|国字|方正脸|棱角|清秀|圆润脸|瘦长|宽颌|俊朗|剑眉|浓眉|细眉|一字眉|丹凤眼|细长眼|圆大|深褐眼|碎发|寸头|短寸|平头|中长发|刘海|青年男性|青年女性|中年男性|中年女性|老年男性|老年女性|约?\d{1,2}岁|黑发|短发|长发/.test(stripped)
}

/** 按对照定妆标签名解析角色（含「我」→ 主人公） */
function resolvePortraitCharForDistinctCue(
  name: string,
  characters: PortraitCharacterLike[],
): PortraitCharacterLike | null {
  const n = String(name || '').trim()
  if (!n) return null
  const exact = characters.find(c => String(c.name || '').trim() === n)
  if (exact) return exact
  if (FIRST_PERSON_PORTRAIT_NAMES.has(n)) {
    return characters.find(c => /主角|主人公|男主|女主/.test(String(c.role || '')))
      || characters.find(c => FIRST_PERSON_PORTRAIT_NAMES.has(String(c.name || '').trim()))
      || null
  }
  return null
}

/** 多人同框：为每个对照定妆补上定妆短辨识差（脸/发/年龄），防止同框撞脸 */
export function ensureMultiPortraitDistinctCuesInPrompt(
  prompt: string,
  characters: PortraitCharacterLike[],
): string {
  const text = String(prompt || '')
  const matches = [...text.matchAll(/对照定妆「([^」]+)」/g)]
  if (matches.length < 2) return text

  let out = text
  const usedBaseCues: string[] = []
  for (const m of matches) {
    const rawLabel = m[1]
    const name = rawLabel.split(/[·•]/)[0]?.trim()
    if (!name) continue
    const ch = resolvePortraitCharForDistinctCue(name, characters)
    const baseCue = extractPortraitDistinctCueCn(ch?.appearance)
    if (!baseCue) continue
    // 两名角色抽到相同/近同辨识差时，强制拉开文案（避免同框克隆）
    const collided = usedBaseCues.some(
      u => u === baseCue || (u.length >= 6 && (baseCue.includes(u.slice(0, 6)) || u.includes(baseCue.slice(0, 6)))),
    )
    const cue = collided ? `${baseCue}·发型五官须明显异于同框他人` : baseCue
    usedBaseCues.push(baseCue)
    const esc = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(对照定妆「${esc}」)(（([^）]*)）)?`)
    out = out.replace(re, (full, anchor: string, _paren?: string, inner?: string) => {
      const body = String(inner || '').trim()
      if (body.includes(cue) || body.includes(baseCue)) return full
      if (parenAlreadyHasDistinctIdentityCue(body)) {
        // 已有辨识差但与他人撞 cue：追加强制区分句
        if (collided && !/异于同框|明显异于/.test(body)) {
          return `${anchor}（${body}，发型五官须明显异于同框他人）`
        }
        return full
      }
      return body ? `${anchor}（${cue}，${body}）` : `${anchor}（${cue}）`
    })
  }
  return out
}

/** 对齐定妆标签并保留本镜表情/位置/姿态（不注入脸型发型文案）。
 * 有【画面主体】时仍走括号内重建；无括号的叙事型文案则确保含对照定妆「」与（身穿…）。 */
export function injectPortraitSpecIntoImagePromptCn(
  prompt: string,
  characters: PortraitCharacterLike[],
  style?: string | null,
  context?: {
    dialogue?: string | null
    narrationLines?: string[] | null
    fallbackNames?: string[] | null
    allowDualPortrait?: boolean
  },
): string {
  const allowMulti = !!context?.allowDualPortrait
  const expected = resolveExpectedPortraitNamesForPrompt({
    characters,
    dialogue: context?.dialogue,
    narrationLines: context?.narrationLines,
    fallbackNames: context?.fallbackNames,
  })
  let aligned = alignPortraitLabelsInImagePromptCn(prompt, characters, context)
  const labels = [...aligned.matchAll(/对照定妆「([^」]+)」/g)]
    .map(m => m[1].split('·')[0].trim())
    .filter(Boolean)
  const uniqueLabels = [...new Set(labels)]
  const wantMulti = allowMulti && expected.length >= 2
  const keep = expected[0] || uniqueLabels[0]

  // 本段旁白已要求多人：禁止单人硬清理；缺标签时补写同框对照定妆
  if (wantMulti) {
    const present = new Set(
      [...aligned.matchAll(/对照定妆「([^」]+)」/g)]
        .map(m => m[1].split('·')[0].trim())
        .filter(Boolean),
    )
    const missing = expected.filter(n => !present.has(n))
    for (const name of missing) {
      const ch = characters.find(c => String(c.name || '').trim() === name)
      const label = formatCharacterPortraitLabel(name, ch?.variantLabel)
      if (/对照定妆「/.test(aligned)) {
        aligned = aligned.replace(
          /对照定妆「[^」]+」/,
          (m) => `${m}，同框对照定妆「${label}」位于其对面以呼应姿态`,
        )
      } else {
        aligned = `对照定妆「${label}」，${aligned}`
      }
    }
    aligned = aligned
      .replace(/，?无配角/g, '')
      .replace(/画面仅一名人物入镜[^，；。]*/g, '')
      .replace(/禁止第二人[^，；。]*/g, '')
  } else if (keep) {
    aligned = enforceSingleCharacterFrameInImagePromptCn(aligned, keep, characters)
  }

  const stripped = stripPortraitStaticIdentityFromImagePromptCn(aligned)
  // 多人同框：括号内补上定妆短辨识差，避免只写表情导致撞脸
  const withCues = ensureMultiPortraitDistinctCuesInPrompt(stripped, characters)
  if (!withCues || !characters.length) return withCues

  const injectBracket = (text: string, label: string): string => {
    const re = new RegExp(`(【${label}[：:]\\s*)([^】]*)(】)`, 'g')
    return text.replace(re, (_, open, inner, close) => {
      const body = String(inner || '').trim()
      if (!body) return `${open}${inner}${close}`
      const ch = resolvePortraitCharacterForSubject(body, characters)
      if (!ch?.appearance?.trim()) return `${open}${inner}${close}`
      return `${open}${rebuildSubjectWithPortraitSpec(body, ch, style)}${close}`
    })
  }

  let out = withCues
  if (/【左格/.test(out) && /【右格/.test(out)) {
    out = injectBracket(out, '左格')
    out = injectBracket(out, '右格')
  }
  if (/【画面主体[：:]/.test(out)) {
    out = injectBracket(out, '画面主体')
  }

  // 叙事型（无七维括号）：缺对照定妆时补标签+身穿，不伪造整套七维
  if (keep && !/对照定妆「/.test(out) && !/【画面主体[：:]/.test(out) && !/【左格/.test(out)) {
    const ch = characters.find(c => String(c.name || '').trim() === keep)
    const label = formatCharacterPortraitLabel(keep, ch?.variantLabel)
    const outfit = ch
      ? String(buildPortraitAppearanceSpecFromCharacter(ch, style).outfit || '').trim()
      : ''
    const portraitChunk = outfit
      ? `对照定妆「${label}」，（身穿${outfit}）`
      : `对照定妆「${label}」`
    out = `${portraitChunk}。${out}`.replace(/。{2,}/g, '。').trim()
  }

  return out
}

/** Flux 英文：在 Subjects in frame 前注入定妆 English tags */
export function injectPortraitSpecIntoFluxEnglish(
  positive: string,
  spec: PortraitAppearanceSpec,
  gender: PortraitGender = 'unknown',
): string {
  const en = String(positive || '').trim()
  if (!en || !(spec.identitySpecCn || spec.specCn)) return en

  const prefix = formatPortraitAppearanceSpecEn(spec, gender)
  if (!prefix) return en

  const subjRe = /(Subjects in frame:\s*)([^.]*?)(?=\.\s*(?:Lighting|Art style|Render|Environment|Action|Camera)|$)/i
  const match = en.match(subjRe)
  if (match) {
    const existing = match[2].trim()
    const merged = existing
      ? `${prefix}, ${existing}`.replace(/,\s*,/g, ',')
      : prefix
    return en.replace(subjRe, `$1${merged}`)
  }

  if (/Art style spec:|Camera and composition:/i.test(en)) {
    return en.replace(
      /(Subjects in frame:\s*)/i,
      `$1${prefix}, `,
    )
  }
  return `${prefix}, ${en}`
}

function stripPortraitPoseFromBody(body: string): string {
  return String(body || '')
    .replace(PORTRAIT_POSE_RE, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^[，,]+|[，,]+$/g, '')
    .trim()
}

/** 定妆入库：规范化为「中文规格 + English tags」统一格式 */
export function normalizePortraitAppearanceStructured(
  appearance: string,
  context?: {
    name?: string | null
    role?: string | null
    variantLabel?: string | null
    minimal?: boolean
  },
): string {
  const cleaned = sanitizePortraitAppearanceForGeneration(appearance)
  const spec = parsePortraitAppearanceSpec(cleaned, context)
  const { tags } = extractEnglishTags(cleaned)
  const cn = spec.specCn || stripPortraitPoseFromBody(
    cleaned.replace(/\s*\bEnglish tags:.+$/im, '').trim(),
  )
  if (!cn) return tags ? `English tags: ${tags}` : ''
  return tags ? `${cn}\nEnglish tags: ${tags}` : cn
}
