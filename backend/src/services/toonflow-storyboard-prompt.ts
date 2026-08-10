/**
 * Toonflow 风格分镜配图：画面描述忠实转换 + @图N 资产绑定。
 * 不做创意写作；输入 description 是主干。
 */

export type ToonflowAssetKind = 'scene' | 'portrait' | 'prop'

export type ToonflowAssetRef = {
  kind: ToonflowAssetKind
  label: string
  /** 有图才进入 @图N 槽位 */
  url?: string | null
}

export type ToonflowAtImageSlot = {
  index: number
  kind: ToonflowAssetKind
  label: string
  url?: string
}

export type BuildToonflowStoryboardPromptInput = {
  description: string
  styleAnchor: string
  assets: ToonflowAssetRef[]
  /** 旁白句，用于持物归属轻量修补 */
  narrationLines?: string[] | string | null
}

export type BuildToonflowStoryboardPromptResult = {
  prompt: string
  slots: ToonflowAtImageSlot[]
}

const KIND_CN: Record<ToonflowAssetKind, string> = {
  portrait: '角色',
  scene: '场景',
  prop: '道具',
}

function joinNarration(lines: string[] | string | null | undefined): string {
  if (Array.isArray(lines)) return lines.map(s => String(s || '').trim()).filter(Boolean).join('\n')
  return String(lines || '').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 解析 `@图N 为{label}{角色|场景|道具}` */
export function parseToonflowAtImageSlots(prompt: string): Array<{
  index: number
  kind: ToonflowAssetKind
  label: string
}> {
  const out: Array<{ index: number; kind: ToonflowAssetKind; label: string }> = []
  const re = /@图(\d+)\s*为\s*([^\s@图,，]+?)(角色|场景|道具)/g
  for (const m of String(prompt || '').matchAll(re)) {
    const index = Number(m[1])
    const label = String(m[2] || '').trim()
    const kindCn = m[3]
    const kind: ToonflowAssetKind = kindCn === '场景' ? 'scene' : kindCn === '道具' ? 'prop' : 'portrait'
    if (!Number.isFinite(index) || index < 1 || !label) continue
    if (out.some(x => x.index === index)) continue
    out.push({ index, kind, label })
  }
  return out.sort((a, b) => a.index - b.index)
}

export function isToonflowStyleImagePrompt(prompt?: string | null): boolean {
  const p = String(prompt || '')
  return /@图\d+\s*为/.test(p) && /【画面】/.test(p)
}

/**
 * 从旁白轻量修补：手里/攥着的道具禁止只留在「前景…与{物}」无人归属句。
 * 仅当 description 已含该物且旁白有持物线索、但动作句缺持有人时补一句。
 */
function ensureHeldPropInAction(
  description: string,
  narration: string,
): string {
  let text = String(description || '').trim()
  if (!text || !narration) return text

  const heldPatterns: Array<{ prop: string; who?: string; hand?: string }> = []
  const props = ['香烟', '烟', '针管', '试卷', '手机', '笔', '书包', '金属盒']
  for (const prop of props) {
    if (!narration.includes(prop) && !(prop === '烟' && narration.includes('香烟'))) continue
    if (!/(?:手里|手中|攥|握|夹|拿|捏|递|塞|掏)/.test(narration)) continue
    const m = narration.match(
      new RegExp(`([\\u4e00-\\u9fff]{2,4})[^。\\n]{0,12}(?:右手|左手|手里|手中)?[^。\\n]{0,8}(?:攥着|握着|夹着|拿着|捏着)[^。\\n]{0,6}${escapeRegExp(prop)}`),
    )
    const who = m?.[1]
    const hand = /右手/.test(narration) && !/左手[^。\n]{0,8}(?:攥|握|夹)/.test(narration)
      ? '右手'
      : /左手/.test(narration) && !/右手[^。\n]{0,8}(?:攥|握|夹)/.test(narration)
        ? '左手'
        : '手里'
    if (who && who !== '旁白') heldPatterns.push({ prop: prop === '烟' ? '香烟' : prop, who, hand })
  }

  for (const { prop, who, hand } of heldPatterns) {
    if (!text.includes(prop) && !(prop === '香烟' && text.includes('烟'))) continue
    const holdOk = new RegExp(`${escapeRegExp(who!)}[^。\\n]{0,20}(?:${hand}|手)[^。\\n]{0,12}(?:攥|握|夹|拿|捏)`).test(text)
      || new RegExp(`(?:${hand}|右手|左手|手里)[^。\\n]{0,12}${escapeRegExp(prop)}`).test(text)
    if (holdOk) continue
    // 去掉无人归属的前景陈设句碎片
    text = text
      .replace(new RegExp(`前景[^，。]{0,12}${escapeRegExp(prop)}`, 'g'), '')
      .replace(new RegExp(`桌上[^，。]{0,8}${escapeRegExp(prop)}`, 'g'), '')
      .replace(/，{2,}/g, '，')
      .replace(/^，|，$/g, '')
    text = `${text}。${who}${hand}攥着${prop}`
  }
  return text.replace(/。{2,}/g, '。').trim()
}

/**
 * 将 description 中的资产名绑成 `@图N（可读名）`（长标签优先）。
 * 保留中文描述可读性；禁止把「笔尖/笔杆」切成「@图N尖」。
 * 场景只替换整词场景名（教室/天台），不吞掉「教室门」「天台铁门」后缀。
 */
function bindAtImagesInBody(description: string, slots: ToonflowAtImageSlot[]): string {
  let body = String(description || '').trim()
  if (!body || !slots.length) return body

  const sorted = [...slots].sort((a, b) => b.label.length - a.label.length)
  for (const slot of sorted) {
    const label = slot.label
    const base = label.split(/[·•]/)[0]?.trim() || label
    const display = base || label
    const token = `@图${slot.index}（${display}）`
    // 已绑定过则跳过
    if (body.includes(`@图${slot.index}（`)) continue

    const patterns = label === base ? [label] : [label, base]
    for (const name of patterns) {
      if (!name || name.length < 1) continue
      if (slot.kind === 'scene') {
        // 场景：整词命中；后面若紧跟门/口/楼等场所后缀则不替换（留给正文）
        body = body.replace(
          new RegExp(`${escapeRegExp(name)}(?![门楼口内外侧上下前后左右间走廊梯墙])`, 'g'),
          token,
        )
      } else if (slot.kind === 'prop') {
        // 道具：禁止匹配「X尖/X杆/X头」等复合词前缀
        body = body.replace(
          new RegExp(`${escapeRegExp(name)}(?![尖杆头盖盒袋身管壳底面沿])`, 'g'),
          token,
        )
      } else {
        body = body.replace(new RegExp(escapeRegExp(name), 'g'), token)
      }
    }
  }
  return body
}

/**
 * 画面描述 + 有图资产 → Toonflow 式三段中文 prompt。
 * 槽位顺序固定：场景 → 定妆 → 道具（与 Agnes identity map 一致）。
 */
export function buildToonflowStoryboardPrompt(
  input: BuildToonflowStoryboardPromptInput,
): BuildToonflowStoryboardPromptResult {
  const styleAnchor = String(input.styleAnchor || '16:9日系2D动漫').trim() || '16:9日系2D动漫'
  const narration = joinNarration(input.narrationLines)
  let description = ensureHeldPropInAction(String(input.description || '').trim(), narration)
  if (!description) {
    return { prompt: '', slots: [] }
  }

  const scenes = input.assets.filter(a => a.kind === 'scene' && String(a.label || '').trim())
  const portraits = input.assets.filter(a => a.kind === 'portrait' && String(a.label || '').trim())
  const props = input.assets.filter(a => a.kind === 'prop' && String(a.label || '').trim())

  const orderedWithUrl: ToonflowAssetRef[] = []
  const pushUnique = (list: ToonflowAssetRef[], max?: number) => {
    for (const a of list) {
      if (max != null && orderedWithUrl.filter(x => x.kind === a.kind).length >= max) continue
      const label = String(a.label || '').trim()
      const url = String(a.url || '').trim()
      if (!label || !url) continue
      if (orderedWithUrl.some(x => x.url === url || (x.kind === a.kind && x.label === label))) continue
      orderedWithUrl.push({ kind: a.kind, label, url })
    }
  }
  pushUnique(scenes.slice(0, 1), 1)
  pushUnique(portraits, 2)
  pushUnique(props, 4)

  const slots: ToonflowAtImageSlot[] = orderedWithUrl.map((a, i) => ({
    index: i + 1,
    kind: a.kind,
    label: a.label,
    url: String(a.url || '').trim() || undefined,
  }))

  const prefixParts = slots.map(s => `@图${s.index} 为${s.label}${KIND_CN[s.kind]}`)
  // 对照标签只来自已挂图槽位，避免「对照道具」无对应 @图N
  const tagParts: string[] = []
  for (const s of slots) {
    if (s.kind === 'portrait') tagParts.push(`对照定妆「${s.label}」`)
    else if (s.kind === 'scene') tagParts.push(`对照场景「${s.label}」`)
    else if (s.kind === 'prop') tagParts.push(`对照道具「${s.label}」`)
  }

  const portraitOrder = slots.filter(s => s.kind === 'portrait').map(s => s.label)
  const sceneOrder = slots.filter(s => s.kind === 'scene').map(s => s.label)
  const propOrder = slots.filter(s => s.kind === 'prop').map(s => s.label)
  const orderBits = [
    portraitOrder.length ? `【定妆参考顺序：${portraitOrder.join('、')}】` : '',
    sceneOrder.length ? `【场景参考：${sceneOrder.join('、')}】` : '',
    propOrder.length ? `【道具参考顺序：${propOrder.join('、')}】` : '',
  ].filter(Boolean)

  const body = bindAtImagesInBody(description, slots)
  // 去掉易冲突的光影长句（交给场景参考图）；保留极短氛围词不强制删
  const bodyNoHeavyLight = body
    .replace(/[，,]?\s*(?:左侧|右侧|顶光|逆光|侧光|冷白|暖黄|冷蓝|高对比)[^。\n]{0,40}(?:光|影|色温|阴影)[^。\n]{0,20}/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/^，|，$/g, '')
    .trim() || body

  const keepFace = slots.some(s => s.kind === 'portrait')
    ? `保持 ${slots.filter(s => s.kind === 'portrait').map(s => `@图${s.index}`).join('、')} 面部特征、发型、服饰与参考图完全一致。`
    : ''

  const prompt = [
    prefixParts.length ? `${prefixParts.join(' ')},` : '',
    tagParts.join(''),
    orderBits.join(''),
    '',
    `【画面】${bodyNoHeavyLight}`,
    '',
    `【风格】${styleAnchor}，禁止画外字幕、水印、UI文字。`,
    keepFace,
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim()

  return { prompt, slots }
}

export {
  buildToonflowParagraphImagePromptLLMSystem,
  TOONFLOW_PARAGRAPH_PROMPT_OUTPUT_HINT,
} from '../constants/toonflow-llm.js'

/** 描述保真：可核验实体（人名/道具/带·标签/强动作短语），避免 2～6 字切片误杀 */
const DESC_ENTITY_NAMES = ['叶沉', '林澜', '王志刚', '韩策'] as const
const DESC_ENTITY_PROPS = [
  '香烟', '针管', '试卷', '书包', '手机', '红包', '笔', '橡皮', '金属盒', '麦克风', '烟', '针',
] as const
const DESC_ACTION_PHRASES = [
  '单腿发力', '冲出', '冲向', '递过去', '递出', '死死按', '插进裤兜', '冒烟',
  '碳化', '崩解', '青筋暴起', '结霜', '幽蓝', '盯着', '攥着', '握着', '夹着',
] as const

export type ToonflowDescFidelityResult = {
  ok: boolean
  /** 硬缺项（缺【画面】/关键实体/持物陈设化）；ok=false 时与 hard_reasons 相同 */
  reasons: string[]
  hard_reasons: string[]
  /** 氛围软提示，仅日志，不拒收 */
  soft_reasons: string[]
}

function entityCoveredInPrompt(prompt: string, entity: string): boolean {
  const p = prompt
  const e = entity.trim()
  if (!e) return true
  if (p.includes(e)) return true
  if (e === '烟' && /香烟|烟头|烟蒂/.test(p)) return true
  if (e === '针' && /针管|注射器/.test(p)) return true
  if (e === '香烟' && /(?:香烟|烟头)/.test(p)) return true
  if (new RegExp(`@图\\d+\\s*为[^\\s@图]*${escapeRegExp(e)}`).test(p)) return true
  if (new RegExp(`@图\\d+（[^）]*${escapeRegExp(e)}[^）]*）`).test(p)) return true
  const slots = parseToonflowAtImageSlots(p)
  const head = e.split(/[·•]/)[0] || e
  return slots.some(s =>
    s.label === e
    || s.label.includes(e)
    || e.includes(s.label)
    || (head.length >= 2 && (s.label.startsWith(head) || s.label.includes(head))),
  )
}

function extractDescriptionHardEntities(description: string): string[] {
  const d = description
  const out: string[] = []
  const push = (t: string) => {
    const s = String(t || '').trim()
    if (s.length < 2 || out.includes(s)) return
    out.push(s)
  }
  for (const m of d.matchAll(/[\u4e00-\u9fffA-Za-z0-9]{1,12}·[\u4e00-\u9fffA-Za-z0-9]{1,16}/g)) {
    push(m[0])
  }
  for (const name of DESC_ENTITY_NAMES) {
    if (d.includes(name)) push(name)
  }
  for (const prop of DESC_ENTITY_PROPS) {
    if (!d.includes(prop)) continue
    if (prop === '烟' && d.includes('香烟')) continue
    if (prop === '针' && d.includes('针管')) continue
    push(prop)
  }
  for (const phrase of DESC_ACTION_PHRASES) {
    if (d.includes(phrase)) push(phrase)
  }
  return out.slice(0, 16)
}

/**
 * 校验 Toonflow 文案相对画面描述是否丢了可核验实体。
 * 硬缺项 → ok=false；氛围软项仅进 soft_reasons，不拒收。
 */
export function validateToonflowPromptAgainstDescription(
  prompt: string,
  description: string,
): ToonflowDescFidelityResult {
  const p = String(prompt || '')
  const d = String(description || '').trim()
  const hard_reasons: string[] = []
  const soft_reasons: string[] = []

  if (!p || !/【画面】/.test(p)) {
    hard_reasons.push('缺少【画面】段')
    return { ok: false, reasons: hard_reasons, hard_reasons, soft_reasons }
  }
  if (!d) return { ok: true, reasons: [], hard_reasons, soft_reasons }

  const entities = extractDescriptionHardEntities(d)
  const missed: string[] = []
  for (const ent of entities) {
    if (entityCoveredInPrompt(p, ent)) continue
    missed.push(ent)
  }
  for (const t of missed.slice(0, 3)) {
    hard_reasons.push(`画面描述关键元素未保留「${t}」`)
  }
  if (missed.length >= 4) {
    hard_reasons.push(`画面描述多项关键元素未保留（约 ${missed.length} 项）`)
  }

  // 禁止明显桌面陈设化持物（若描述里已有攥/握/手里）
  if (
    /攥着|握着|手里/.test(d)
    && /前景[^。\n]{0,16}(?:香烟|烟)/.test(p)
    && !/(?:右手|左手|手里)[^。\n]{0,12}(?:香烟|烟)/.test(p)
  ) {
    hard_reasons.push('持物写成无人归属前景陈设')
  }

  // 软：描述有明显声光氛围词而文案完全未体现（仅 warn）
  const softCuePairs: Array<{ inDesc: RegExp; inPrompt: RegExp; label: string }> = [
    { inDesc: /嗡嗡|灯管/, inPrompt: /灯|嗡|荧光|冷光/, label: '灯管/声响氛围' },
    { inDesc: /风声|呼啸|劲风|狂风/, inPrompt: /风|呼啸/, label: '风声氛围' },
  ]
  for (const cue of softCuePairs) {
    if (cue.inDesc.test(d) && !cue.inPrompt.test(p)) {
      soft_reasons.push(`画面描述氛围未体现「${cue.label}」（软提示）`)
    }
  }

  if (hard_reasons.length) {
    return { ok: false, reasons: hard_reasons, hard_reasons, soft_reasons }
  }
  return { ok: true, reasons: [], hard_reasons, soft_reasons }
}
