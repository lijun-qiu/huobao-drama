/**
 * 分镜配图拍点保真：从旁白抽结构化拍点，并对 image_prompt 做硬校验。
 */
import {
  isToonflowStyleImagePrompt,
  validateToonflowPromptAgainstDescription,
} from './toonflow-storyboard-prompt.js'

export type NarrationBeatHandsLr = 'left' | 'right' | null

export type NarrationBeatCard = {
  actors: string[]
  verbs: string[]
  hands_lr: NarrationBeatHandsLr
  held_props: string[]
  /** 旁白未出现、却常被模型从下一段偷来的词 */
  invent_forbidden: string[]
  has_strong_limb_action: boolean
  /** 生成侧须覆盖的短要点（旁白提炼，允许同义） */
  must_cover: string[]
}

/** 强肢体动作：生图时宜跳过 face-crop，避免姿势塌成站桩 */
export const STRONG_LIMB_ACTION_RE =
  /冲|跑|奔|跪|递|拽|拖|插|刺|推|拉|扔|摔|扑|抱|扛|踢|挡|拦|塞|掏|夹|握|攥|按|扣|挥|甩|迈|踏|蹲|坐|趴|躺|滑坐|抬|举|指|戳|咬|撕/

const CORE_VERB_PATTERNS: Array<{ re: RegExp; verb: string }> = [
  { re: /半拖半拽|拖拽/, verb: '拖拽' },
  { re: /熄灭|闷响/, verb: '熄灭' },
  { re: /碳化|崩解/, verb: '崩解' },
  { re: /融化|粘在掌心/, verb: '融化' },
  { re: /升腾/, verb: '升腾' },
  { re: /叠齐/, verb: '叠齐' },
  { re: /交上|递过去|递出|递向/, verb: '递' },
  { re: /接过/, verb: '接过' },
  { re: /喘息|喘气/, verb: '喘息' },
  { re: /刺入|扎进/, verb: '刺' },
  { re: /夹不稳|夹着|夹烟/, verb: '夹' },
  { re: /攥着|攥住/, verb: '攥' },
  { re: /握着|握住|握笔/, verb: '握' },
  { re: /塞钱|塞红包|塞给/, verb: '塞' },
  { re: /掏出|掏钱/, verb: '掏' },
  { re: /按住|死死按/, verb: '按' },
  { re: /扣住|扣紧/, verb: '扣' },
  { re: /冲出|冲进|冲向/, verb: '冲' },
  { re: /跑向|跑出|跑进|单腿发力/, verb: '跑' },
  { re: /跪下|跪倒/, verb: '跪' },
  { re: /插进|插入裤兜/, verb: '插' },
  { re: /推开|推门|推上/, verb: '推' },
  { re: /拉开|拉住/, verb: '拉' },
  { re: /盯着|盯住/, verb: '盯' },
  { re: /冒烟/, verb: '冒烟' },
]

function extractVerbs(text: string): string[] {
  const verbs: string[] = []
  for (const { re, verb } of CORE_VERB_PATTERNS) {
    if (re.test(text) && !verbs.includes(verb)) verbs.push(verb)
  }
  return verbs
}

const HELD_PROP_CANDIDATES = [
  '香烟', '烟', '针管', '试卷', '书包', '手机', '红包', '钱', '针', '笔', '橡皮', '金属盒', '麦克风',
]

/** 旁白未写却易被模型发明的动作词（串镜/脑补） */
const COMMON_INVENT_ACTIONS = [
  '半拖半拽', '拖拽', '拽住', '食指指向', '指向序列号', '指向标签', '接过', '指着',
]

function joinNarration(lines: string[] | string | null | undefined): string {
  if (Array.isArray(lines)) return lines.map(s => String(s || '').trim()).filter(Boolean).join('\n')
  return String(lines || '').trim()
}

function narrationHas(text: string, needle: string): boolean {
  return text.includes(needle)
}

function buildMustCover(
  beat: Omit<NarrationBeatCard, 'must_cover'>,
  text: string,
): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const t = String(s || '').trim()
    if (!t || out.includes(t)) return
    out.push(t)
  }
  if (beat.hands_lr === 'left') push('左手持物')
  if (beat.hands_lr === 'right') push('右手持物')
  for (const prop of beat.held_props) push(prop)
  for (const v of beat.verbs) push(v)
  for (const { re } of CORE_VERB_PATTERNS) {
    const m = text.match(re)
    if (m?.[0]) push(m[0])
  }
  return out.slice(0, 8)
}

/**
 * 从本段旁白抽出拍点，供 LLM user payload 与验收使用。
 */
export function extractNarrationBeatCard(
  narrationLines: string[] | string | null | undefined,
): NarrationBeatCard {
  const text = joinNarration(narrationLines)
  const actors: string[] = []
  for (const name of ['叶沉', '林澜', '王志刚', '韩策', '旁白']) {
    if (name !== '旁白' && text.includes(name) && !actors.includes(name)) actors.push(name)
  }
  // 通用：XX说/XX： 前的人名（2～4 汉字）
  for (const m of text.matchAll(/(?:^|[\n，。；])([\u4e00-\u9fff]{2,4})(?:：|:|说|道|喊|问)/g)) {
    const n = m[1]
    if (n && n !== '旁白' && n !== '画外音' && !actors.includes(n)) actors.push(n)
  }

  const verbs = extractVerbs(text)

  let hands_lr: NarrationBeatHandsLr = null
  if (/左手/.test(text) && !/右手/.test(text)) hands_lr = 'left'
  else if (/右手/.test(text) && !/左手/.test(text)) hands_lr = 'right'
  else if (/左手/.test(text) && /右手/.test(text)) {
    // 同时出现时：优先「左手…夹/攥/握」或「右手…」持物句
    if (/左手[^。\n]{0,12}(?:夹|攥|握|持|拿)/.test(text)) hands_lr = 'left'
    else if (/右手[^。\n]{0,12}(?:夹|攥|握|持|拿)/.test(text)) hands_lr = 'right'
  }

  const held_props: string[] = []
  for (const prop of HELD_PROP_CANDIDATES) {
    if (!text.includes(prop)) continue
    // 桌面陈设不算持物；有手里/夹/攥/握/递 等才记
    if (
      /手里|手中|夹|攥|握|持|拿|递|塞|掏|插进|装进/.test(text)
      || new RegExp(`(?:夹|攥|握|持|拿|递)${prop}`).test(text)
      || new RegExp(`${prop}[^。\\n]{0,6}(?:夹|攥|握|掉)`).test(text)
    ) {
      if (!held_props.includes(prop)) held_props.push(prop)
    }
  }
  // 去短名：有「香烟」则去掉「烟」；有「针管」则去掉「针」
  const heldDedup = held_props.filter((prop) => {
    if (prop === '烟' && held_props.some(p => p.includes('烟') && p !== '烟')) return false
    if (prop === '针' && held_props.some(p => p.includes('针') && p !== '针')) return false
    return true
  })

  const invent_forbidden = COMMON_INVENT_ACTIONS.filter(w => !narrationHas(text, w))
  const base = {
    actors,
    verbs,
    hands_lr,
    held_props: heldDedup,
    invent_forbidden,
    has_strong_limb_action: STRONG_LIMB_ACTION_RE.test(text),
  }

  return {
    ...base,
    must_cover: buildMustCover(base, text),
  }
}

export type BeatFidelityFail = {
  ok: false
  /** 硬缺项（拒收/重写） */
  reasons: string[]
  soft_reasons: string[]
  /** 给单段重写用（仅硬项） */
  retry_hint: string
}

export type BeatFidelityPass = {
  ok: true
  soft_reasons: string[]
}

/**
 * 硬校验 image_prompt 是否贴合本段拍点。
 * 硬：左右手/持物/动词/禁发明/缺【画面】关键实体 → 拒收。
 * 软：氛围提示 → 仅 soft_reasons，不拒收。
 */
export function validateImagePromptBeatFidelity(
  prompt: string,
  beat: NarrationBeatCard,
  narrationLines?: string[] | string | null,
  options?: { description?: string | null },
): BeatFidelityPass | BeatFidelityFail {
  const p = String(prompt || '')
  const narr = joinNarration(narrationLines)
  const hard: string[] = []
  const soft: string[] = []

  const desc = String(options?.description || '').trim()
  if (desc && isToonflowStyleImagePrompt(p)) {
    const descCheck = validateToonflowPromptAgainstDescription(p, desc)
    if (descCheck.soft_reasons?.length) soft.push(...descCheck.soft_reasons)
    if (!descCheck.ok) hard.push(...(descCheck.hard_reasons.length ? descCheck.hard_reasons : descCheck.reasons))
  }

  // 左右手：旁白单侧持物 → 禁止写反侧持同一物；「左手指尖微颤」不算已写持物
  const leftHoldOk = /左手[^，。；\n]{0,20}(?:夹|攥|握|持|拿|递)/.test(p)
  const rightHoldOk = /右手[^，。；\n]{0,20}(?:夹|攥|握|持|拿|递)/.test(p)

  if (beat.hands_lr === 'left') {
    const rightHoldSmoke = rightHoldOk
      && /(?:烟|香烟|针|针管|手机|笔|试卷)/.test(p)
    if (rightHoldSmoke && !leftHoldOk) {
      hard.push('旁白为左手持物，文案写成右手持物')
    } else if (/左手[^。\n]{0,12}(?:夹|攥|握|持)/.test(narr) && !leftHoldOk) {
      hard.push('旁白写左手持物，文案未写左手持物')
    }
  }
  if (beat.hands_lr === 'right') {
    const leftHoldSmoke = leftHoldOk
      && /(?:烟|香烟|针|针管|手机|笔|试卷)/.test(p)
    if (leftHoldSmoke && !rightHoldOk) {
      hard.push('旁白为右手持物，文案写成左手持物')
    } else if (/右手[^。\n]{0,12}(?:夹|攥|握|持)/.test(narr) && !rightHoldOk) {
      hard.push('旁白写右手持物，文案未写右手持物')
    }
  }

  // 发明下一段动作
  for (const w of beat.invent_forbidden) {
    if (w.length >= 2 && p.includes(w)) {
      hard.push(`发明本段旁白没有的动作「${w}」`)
    }
  }
  // 半拖半拽变体
  if (!/拖|拽/.test(narr) && /(?:半拖半拽|拖拽|拽住)/.test(p)) {
    hard.push('发明本段旁白没有的拖拽动作')
  }
  if (!/指/.test(narr) && /(?:食指指向|指向序列号|指向标签|指着针)/.test(p)) {
    hard.push('发明本段旁白没有的指认动作')
  }

  // 核心动词：旁白有明确动词时，文案动作区至少命中一个（过短旁白/纯对白可跳过）
  if (beat.verbs.length >= 1 && narr.replace(/\s/g, '').length >= 12) {
    const hit = beat.verbs.some(v => p.includes(v))
    // 同义宽松：熄灭↔闷响熄/火熄；递↔递出；攥↔握
    const loose = beat.verbs.some((v) => {
      if (v === '熄灭') return /熄|灭|闷响/.test(p)
      if (v === '递' || v === '交上') return /递|交/.test(p)
      if (v === '攥' || v === '握') return /攥|握|持|拿|夹/.test(p)
      if (v === '夹') return /夹|攥|握/.test(p)
      if (v === '盯') return /盯|注视|望|看/.test(p)
      if (v === '喘息') return /喘息|喘气|靠/.test(p)
      if (v === '刺') return /刺|扎/.test(p)
      if (v === '拖拽') return /拖|拽/.test(p)
      if (v === '冲') return /冲|奔/.test(p)
      if (v === '跑') return /跑|冲|迈/.test(p)
      if (v === '按') return /按|压/.test(p)
      if (v === '插') return /插|塞进裤|裤兜/.test(p)
      if (v === '掏') return /掏|拿出|握于胸前|手机/.test(p)
      if (v === '扣') return /扣|扣住|扣紧/.test(p)
      if (v === '拉') return /拉|拉开/.test(p)
      if (v === '推') return /推|抵/.test(p)
      if (v === '崩解') return /崩|碳化|窟窿|焦黑/.test(p)
      if (v === '融化') return /融|粘/.test(p)
      if (v === '升腾') return /升腾|黑烟|升起/.test(p)
      if (v === '叠齐') return /叠|试卷/.test(p)
      if (v === '冒烟') return /冒烟|青烟|黑烟/.test(p)
      return false
    })
    if (!hit && !loose) {
      hard.push(`未覆盖旁白核心动作（须含：${beat.verbs.slice(0, 6).join('/')}）`)
    }
  }

  // 持物须进动作，禁止只当桌面陈设（「烟」可用「香烟」满足；Toonflow @图N / @图N（名）绑定道具也算）
  for (const prop of beat.held_props) {
    const propEsc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const atPropHit = new RegExp(`@图\\d+\\s*为[^\\s@图]*${propEsc}[^\\s]*道具`).test(p)
      || new RegExp(`@图\\d+（[^）]*${propEsc}[^）]*）`).test(p)
      || (prop === '烟' && (/@图\d+\s*为[^\s@图]*香烟[^\s]*道具/.test(p) || /@图\d+（[^）]*香烟[^）]*）/.test(p)))
    const propHit = p.includes(prop)
      || (prop === '烟' && /香烟|烟头|烟蒂/.test(p))
      || (prop === '针' && /针管|注射器/.test(p))
      || atPropHit
    if (!propHit) {
      hard.push(`旁白持物「${prop}」未写入文案`)
      continue
    }
    const deskOnly = new RegExp(`(?:前景|桌上|讲桌|桌面)[^。\\n]{0,12}${propEsc}|${propEsc}[^。\\n]{0,8}(?:放在|摆在)`).test(p)
    const heldOk = new RegExp(`(?:左手|右手|手里|手中|夹|攥|握|持|拿|递).{0,10}${propEsc}|${propEsc}.{0,8}(?:夹|攥|握|掉)`).test(p)
      || (prop === '烟' && /(?:左手|右手|手里|夹|攥|握).{0,10}(?:香烟|烟)/.test(p))
      || (atPropHit && /(?:左手|右手|手里|手中|夹|攥|握|持|拿|递).{0,16}@图\d+/.test(p))
    if (deskOnly && !heldOk) {
      hard.push(`持物「${prop}」被写成桌面陈设，须挂到人物手上`)
    }
  }

  if (!hard.length) return { ok: true, soft_reasons: soft }

  const retry_hint = [
    '【拍点保真·重写】上一条动作与旁白不符，必须严格按 beat_card / must_cover 重写：',
    beat.hands_lr === 'left' ? '持物须写左手，禁止改成右手；' : '',
    beat.hands_lr === 'right' ? '持物须写右手，禁止改成左手；' : '',
    beat.verbs.length ? `须体现动词：${beat.verbs.slice(0, 8).join('、')}；` : '',
    beat.held_props.length ? `持物写入人物动作：${beat.held_props.join('、')}；` : '',
    beat.must_cover.length ? `须覆盖 must_cover：${beat.must_cover.join('、')}；` : '',
    beat.invent_forbidden.length
      ? `禁止出现：${beat.invent_forbidden.slice(0, 6).join('、')}；`
      : '',
    `硬缺项：${hard.join('；')}。`,
  ].filter(Boolean).join('')

  return { ok: false, reasons: hard, soft_reasons: soft, retry_hint }
}

export function beatCardForLlmPayload(beat: NarrationBeatCard) {
  return {
    beat_card: {
      actors: beat.actors,
      verbs: beat.verbs,
      hands_lr: beat.hands_lr,
      held_props: beat.held_props,
      invent_forbidden: beat.invent_forbidden.slice(0, 8),
      has_strong_limb_action: beat.has_strong_limb_action,
      must_cover: beat.must_cover.slice(0, 8),
    },
    beat_card_rule:
      '硬性：【画面】/动作描述必须覆盖 beat_card.verbs 与 must_cover（允许同义改写）；hands_lr 为 left/right 时持物左右手不得写反；held_props 必须挂到人物手上禁止桌面陈设；禁止写入 invent_forbidden 中的发明动作（多为下一段情节）。',
    must_cover_rule:
      '硬性：【画面】须覆盖 must_cover 全部要点；允许同义改写，禁止漏核心动作/持物/左右手。',
  }
}

/** 旁白或文案是否含强肢体动作（供 face-crop 跳过） */
export function narrationHasStrongLimbAction(
  narrationOrPrompt: string[] | string | null | undefined,
): boolean {
  return STRONG_LIMB_ACTION_RE.test(joinNarration(narrationOrPrompt))
}
