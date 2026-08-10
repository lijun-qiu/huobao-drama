/**
 * Flux 分镜：七维全保留但压缩措辞；英文按「动作→场景→机位→主体」优先顺序组装（构图可见性优先）。
 */

const FLUX_SECTION_ORDER = [
  '画风规格',
  '画面主体',
  '年代场景',
  '核心细节动作',
  '光影色调',
  '镜头视角',
  '质感要求',
] as const

/** 解析中文七维（全角【】/半角[]；冒号兼容：/:） */
export function parseNarrationFluxSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  for (const m of String(raw || '').matchAll(/【([^：:]+)[：:]([^】]+)】/g)) {
    sections[m[1].trim()] = m[2].trim()
  }
  if (Object.keys(sections).length >= 2) return sections
  for (const m of String(raw || '').matchAll(/\[([^：:\]]+)[：:]([^\]]+)\]/g)) {
    sections[m[1].trim()] = m[2].trim()
  }
  return sections
}

/** LLM 写中文配图文案：【画风规格】短锚（勿写导演名/头身比/浅景深/无文字等套话） */
export const NARRATION_FLUX_COMPACT_ART_STYLE_CN = '16:9日系2D动漫'

export const NARRATION_FLUX_COMPACT_TEXTURE_CN = '高对比电影光影，动漫插画质感'

export const NARRATION_FLUX_COMPACT_LLM_RULE = [
  '【Flux压缩·硬性】七维标签仍必填且信息不得丢失，但每维只用短句（每维建议20–45字，全篇中文≤380字）：',
  `【画风规格】只写一行固定短锚：「${NARRATION_FLUX_COMPACT_ART_STYLE_CN}」，禁止写3D/CGI/国漫建模/正常头身比/浅景深/无文字无水印，禁止照抄长段画风规格全文；`,
  '【镜头视角】叙事可见性优先：有肢体/道具/坐站姿态→默认中近景（头高约22–30%），朝向主人公上半身与动作点/物件；纯神情无动作才近景（头高≤35%）；禁止「面部情绪→近景大头」与「面部特写」；',
  '【年代场景】地点+前/中/后景+至少3个具体物件（颜色/材质/状态）；禁止写面部特写；',
  '【核心细节动作】肢体+视线+道具/配角接触（含屏幕UI）；禁止只写盯脸/氛围词；',
  '【画面主体】对照定妆「name·阶段」（只写本镜细化表情，禁止写脸型/发型/发色，禁止写服装）+位于+姿态+（身穿#hex本镜服装）；表情在主体、动作在核心维、物件在场景、镜头须同帧装下；',
  '【光影色调】时段+冷暖+主光源；高对比戏剧光，色温贴合本段情节（紧张悬疑可用冷蓝紫+锐利高光，日常勿硬套末日）；禁「聚焦面部局部」替代构图；',
  `【质感要求】只写「${NARRATION_FLUX_COMPACT_TEXTURE_CN}」；`,
  '禁止同义重复（如画风/质感/后缀各写一遍16:9）；禁止空泛词（高质量、精美、氛围感）替代具体物件/动作/机位。',
].join('')

/** Flux 生图英文组装顺序（动作/场景优先，减弱特写机位抢注意力） */
export const FLUX_COMPACT_EN_SECTION_ORDER = [
  'Action and interaction',
  'Environment and era',
  'Camera and composition',
  'Subjects in frame',
  'Lighting and color',
  'Art style spec',
  'Render quality',
] as const

export const FLUX_COMPACT_CN_SECTION_ORDER = [
  '画风规格',
  '画面主体',
  '年代场景',
  '核心细节动作',
  '光影色调',
  '镜头视角',
  '质感要求',
] as const

export const FLUX_COMPACT_ART_STYLE_EN =
  '16:9 Japanese 2D anime illustration, cinematic contrast'

export const FLUX_COMPACT_RENDER_EN =
  'high-contrast cinematic lighting, anime illustration look, no text, no watermark'

export const FLUX_EN_PROMPT_MAX_CHARS = 1000

const FLUX_EN_SECTION_BUDGET: Record<string, number> = {
  // 机位规则模板含景别+头高%+可见性，需留足空间
  'Camera and composition': 180,
  'Environment and era': 160,
  'Action and interaction': 150,
  'Subjects in frame': 240,
  'Lighting and color': 110,
  'Art style spec': 140,
  'Render quality': 80,
}

const FLUX_EN_FIXED_SECTIONS = new Set(['Art style spec', 'Render quality'])

const FLUX_EN_BLEED_LABELS = [
  'Lighting and color',
  'Art style spec',
  'Render quality',
  'Action and interaction',
  'Environment and era',
  'Camera and composition',
] as const

function closeUnclosedParens(s: string): string {
  let open = 0
  for (const ch of s) {
    if (ch === '(') open++
    else if (ch === ')') open = Math.max(0, open - 1)
  }
  if (open > 0) return `${s.replace(/[,.\s]+$/, '')}${')'.repeat(open)}`
  return s
}

function stripTrailingIncompleteParenGroup(body: string): string {
  let open = 0
  let lastOpen = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') {
      open++
      lastOpen = i
    } else if (body[i] === ')') {
      open = Math.max(0, open - 1)
    }
  }
  if (open > 0 && lastOpen >= 0) return body.slice(0, lastOpen).replace(/[,.\s]+$/, '').trim()
  return body
}

function stripBleedFromSectionBody(body: string): string {
  let cutAt = -1
  for (const label of FLUX_EN_BLEED_LABELS) {
    const escaped = label.replace(/ /g, '\\s+')
    const patterns = [
      new RegExp(`\\.\\s*${escaped}:\\s*`, 'i'),
      new RegExp(`\\(#\\d*\\.?\\s*${escaped}:\\s*`, 'i'),
      new RegExp(`\\(#?[0-9a-f]{3,8}\\.?\\s*${escaped}:\\s*`, 'i'),
      new RegExp(`\\s${escaped}:\\s*`, 'i'),
    ]
    for (const re of patterns) {
      const m = re.exec(body)
      if (m?.index != null && m.index > 12 && (cutAt < 0 || m.index < cutAt)) cutAt = m.index
    }
  }
  let trimmed = cutAt >= 0 ? body.slice(0, cutAt).trim() : body
  trimmed = trimmed.replace(/\s*\(#\d*\.?\s*$/, '').trim()
  trimmed = trimmed.replace(/\s*\(#?[0-9a-f]{3,8}\.?\s*$/i, '').trim()
  return trimmed
}

/** 修复七维英文段落串段、未闭合括号（翻译/压缩后常见） */
export function repairFluxEnglishPromptStructure(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return text

  const sections = parseFluxEnglishSections(text)
  if (Object.keys(sections).length < 2) return closeUnclosedParens(text)

  for (const label of FLUX_COMPACT_EN_SECTION_ORDER) {
    const body = sections[label]
    if (!body) continue
    let fixed = stripBleedFromSectionBody(body)
    if (label === 'Subjects in frame') {
      fixed = stripTrailingIncompleteParenGroup(fixed)
      fixed = closeUnclosedParens(fixed)
    }
    sections[label] = fixed.trim()
  }

  const reassembled = FLUX_COMPACT_EN_SECTION_ORDER
    .filter(label => sections[label])
    .map(label => `${label}: ${sections[label]}`)
    .join('. ')
  return compressFluxEnglishPrompt(reassembled)
}

function collapseWhitespace(s: string): string {
  return String(s || '')
    .replace(/[，,；;]\s*[，,；;]+/g, '，')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，,；;\s]+|[，,；;\s]+$/g, '')
    .trim()
}

function compressChineseSection(key: string, raw: string): string {
  let s = collapseWhitespace(raw)
  if (!s) return s

  if (key === '画风规格') {
    if (/日系2D|2D动漫|三维国漫|3D国漫|电影感.*动漫|日系动漫/.test(s)) return NARRATION_FLUX_COMPACT_ART_STYLE_CN
    return s
      .replace(/16:9横屏[，,]?/g, '16:9，')
      .replace(/（非Q版非三头身）|\(非Q版[^）)]*\)/g, '')
      .replace(/新海诚[^，,]*[，,]?/g, '')
      .replace(/京阿尼[^，,]*[，,]?/g, '')
      .replace(/京都动画[^，,]*[，,]?/g, '')
      .replace(/正常(?:青年)?头身比[，,]?/g, '')
      .replace(/浅景深[，,]?/g, '')
      .replace(/无文字无水印[，,]?/g, '')
      .slice(0, 120)
  }

  if (key === '质感要求') {
    if (/高对比电影|动漫插画质感|细线稿|赛璐璐|光滑CGI|强轮廓|浅景深|干净线稿|电影感/.test(s)) return NARRATION_FLUX_COMPACT_TEXTURE_CN
    return s
      .replace(/无文字无水印[，,]?/g, '')
      .slice(0, 80)
  }

  if (key === '画面主体') {
    s = s
      .replace(/对照定妆/g, '对照定妆')
      .replace(/正常头身比[，,]?/g, '')
      .replace(/精致干净/g, '')
  }

  // 去掉与其它维重复的 16:9 / 无文字 / 浅景深 等
  if (key !== '画风规格') {
    s = s
      .replace(/16:9横屏[，,]?/g, '')
      .replace(/无文字无水印[，,]?/g, '')
      .replace(/浅景深[，,]?/g, '')
      .replace(/电影感叙事构图[，,]?/g, '')
  }

  const max = key === '画面主体' ? 130 : key === '年代场景' || key === '核心细节动作' ? 100 : 90
  return s.slice(0, max)
}

/** 压缩中文七维 prompt（标签不变，信息保留） */
export function compressFluxChinesePrompt(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return text

  const sections = parseNarrationFluxSections(text)
  if (Object.keys(sections).length < 2) return text

  const parts: string[] = []
  for (const key of FLUX_COMPACT_CN_SECTION_ORDER) {
    if (!sections[key]) continue
    parts.push(`【${key}：${compressChineseSection(key, sections[key])}】`)
  }
  // 保留未能映射的额外段
  for (const key of FLUX_SECTION_ORDER) {
    if ((FLUX_COMPACT_CN_SECTION_ORDER as readonly string[]).includes(key)) continue
    if (sections[key]) parts.push(`【${key}：${sections[key]}】`)
  }
  return parts.join('，')
}

function compressEnglishSection(label: string, raw: string): string {
  let s = collapseWhitespace(raw)
  if (!s) return s

  if (label === 'Art style spec') {
    if (/Japanese 2D anime|cinematic contrast|cel shading|3D donghua|Chinese 3D|toon-shaded|Makoto Shinkai|Kyoto Animation|KyoAni|cinematic anime/i.test(s)) {
      return FLUX_COMPACT_ART_STYLE_EN
    }
    return s.slice(0, 140)
  }
  if (label === 'Render quality') return FLUX_COMPACT_RENDER_EN

  if (label !== 'Art style spec') {
    s = s
      .replace(/16:9 horizontal screen,?\s*/gi, '')
      .replace(/no text,?\s*no watermark,?\s*/gi, '')
  }

  // Camera 由规则模板生成，禁止 120 字硬切（会截成 sitting shoulders+ha）
  if (label === 'Camera and composition') return s

  const max = label === 'Subjects in frame' ? 200 : label === 'Environment and era' || label === 'Action and interaction' ? 140 : 120
  // 只在词界截断，避免 straig / mid-grou 半词残骸
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const breakAt = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' '))
  return (breakAt > Math.floor(max * 0.55) ? cut.slice(0, breakAt) : cut).replace(/[,.\s]+$/, '').trim()
}

export function parseFluxEnglishSections(raw: string): Record<string, string> {
  const text = String(raw || '').trim()
  const sections: Record<string, string> = {}
  const re = /(Art style spec|Subjects in frame|Environment and era|Action and interaction|Lighting and color|Camera and composition|Render quality):\s*/gi
  const indices: Array<{ label: string; start: number; contentStart: number }> = []
  for (const m of text.matchAll(re)) {
    if (m.index == null) continue
    indices.push({ label: m[1], start: m.index, contentStart: m.index + m[0].length })
  }
  for (let i = 0; i < indices.length; i++) {
    const end = i + 1 < indices.length ? indices[i + 1].start : text.length
    sections[indices[i].label] = text.slice(indices[i].contentStart, end).replace(/[.\s]+$/, '').trim()
  }
  return sections
}

function trimEnglishSectionBody(label: string, raw: string, maxLen: number): string {
  let s = compressEnglishSection(label, raw)
  if (s.length <= maxLen) return s
  s = s.slice(0, maxLen)
  // 避免在单词中间截断
  const lastBreak = Math.max(s.lastIndexOf(', '), s.lastIndexOf('; '), s.lastIndexOf(' ('))
  if (lastBreak > Math.floor(maxLen * 0.55)) {
    s = s.slice(0, lastBreak)
  }
  if (label === 'Subjects in frame') s = closeUnclosedParens(s)
  return s.replace(/[,.\s]+$/, '').trim()
}

function assembleFluxEnglishWithinBudget(sections: Record<string, string>): string {
  const budgets = { ...FLUX_EN_SECTION_BUDGET }

  function build(): string {
    const parts: string[] = []
    for (const label of FLUX_COMPACT_EN_SECTION_ORDER) {
      const body = sections[label]
      if (!body) continue
      const cap = budgets[label] ?? 120
      parts.push(`${label}: ${trimEnglishSectionBody(label, body, cap)}`)
    }
    return parts.join('. ')
  }

  let joined = build()
  let guard = 0
  while (joined.length > FLUX_EN_PROMPT_MAX_CHARS && guard < 12) {
    guard++
    let shrunk = false
    for (const label of FLUX_COMPACT_EN_SECTION_ORDER) {
      // 机位规则模板不缩（头高%/须可见）
      if (FLUX_EN_FIXED_SECTIONS.has(label) || label === 'Camera and composition') continue
      const cap = budgets[label] ?? 120
      if (cap <= 36) continue
      budgets[label] = Math.max(36, Math.floor(cap * 0.82))
      shrunk = true
    }
    if (!shrunk) break
    joined = build()
  }
  return joined
}

/** 压缩英文七维并按 Flux 优先顺序重排（分段预算，不硬切句子） */
export function compressFluxEnglishPrompt(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return text

  const sections = parseFluxEnglishSections(text)
  if (Object.keys(sections).length < 2) {
    const cn = compressFluxChinesePrompt(text)
    if (cn !== text) return cn
    if (text.length <= FLUX_EN_PROMPT_MAX_CHARS) return text
    const cut = text.slice(0, FLUX_EN_PROMPT_MAX_CHARS)
    const lastDot = cut.lastIndexOf('. ')
    return (lastDot > FLUX_EN_PROMPT_MAX_CHARS * 0.6 ? cut.slice(0, lastDot) : cut).trim()
  }

  return assembleFluxEnglishWithinBudget(sections)
}

/** SDXL CLIP ~77 token：InstantID 分镜只保留机位/场景/动作/主体短句 */
export function compressSdxlInstantIdStoryboardEnglish(raw: string): string {
  const compact = compressFluxEnglishPrompt(String(raw || '').trim())
  const sections = parseFluxEnglishSections(compact)
  if (Object.keys(sections).length < 2) {
    return compact.slice(0, 320)
  }

  const parts: string[] = []
  const subj = sections['Subjects in frame'] || ''
  if (/male|1boy|young man|programmer/i.test(subj)) {
    parts.push('1boy, young man, programmer')
  }
  if (sections['Camera and composition']) parts.push(sections['Camera and composition'].slice(0, 85))
  if (sections['Environment and era']) parts.push(sections['Environment and era'].slice(0, 95))
  if (sections['Action and interaction']) parts.push(sections['Action and interaction'].slice(0, 85))
  if (subj) parts.push(subj.replace(/matching reference portrait[^,]*/i, '').slice(0, 90))

  return parts.join(', ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim().slice(0, 340)
}

/** 中文七维 → 压缩后中文（供 LLM 后处理或规则管线） */
export function normalizeFluxStoryboardChinesePrompt(raw: string): string {
  const text = String(raw || '').trim()
  if (!text || !/【.+：.+】/.test(text)) return text
  return compressFluxChinesePrompt(text)
}
