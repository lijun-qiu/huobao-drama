/** 中文服装色词 → 六位小写 hex（长词优先匹配） */
const COLOR_PHRASE_TO_HEX: ReadonlyArray<[RegExp, string]> = [
  [/蓝白/g, '#2563eb与#ffffff'],
  [/花衬衫/g, '#ff6b9d花衬衫'],
  [/亮黄色/g, '#ffd700'],
  [/亮蓝色/g, '#3b82f6'],
  [/亮橙色|亮橙/g, '#f97316'],
  [/浅蓝色|浅蓝/g, '#93c5fd'],
  [/浅紫色|浅紫/g, '#ddd6fe'],
  [/浅灰色|浅灰/g, '#d1d5db'],
  [/浅色/g, '#e5e7eb'],
  [/深蓝色|深蓝/g, '#1e40af'],
  [/深灰色|深灰/g, '#4b5563'],
  [/灰白色|灰白/g, '#e5e7eb'],
  [/灰蓝色|灰蓝/g, '#64748b'],
  [/灰褐色/g, '#78716c'],
  [/灰绿色|灰绿/g, '#5f7a6e'],
  [/深绿色|深绿/g, '#166534'],
  [/黄色/g, '#eab308'],
  [/蓝色/g, '#2563eb'],
  [/白色/g, '#ffffff'],
  [/黑色/g, '#1a1a1a'],
  [/深色/g, '#333333'],
  [/红色/g, '#ef4444'],
  [/绿色/g, '#22c55e'],
  [/紫色/g, '#a855f7'],
  [/橙色/g, '#ea580c'],
  [/卡其/g, '#c4a574'],
  [/棕色|棕/g, '#92400e'],
  [/灰色/g, '#9ca3af'],
  [/花/g, '#ff6b9d'],
]

const HEX_COLOR_RE = /#[0-9a-f]{6}/gi

/** 去掉 hex 后仍残留的中文色词（如 #2563eb蓝色 → #2563eb） */
const REDUNDANT_COLOR_AFTER_HEX_RE =
  /(#[0-9a-f]{6})(?:亮|深|浅|鲜|醒目)?(?:红|蓝|绿|黄|白|黑|灰|橙|紫|青|米|卡其|棕|色)?/g

export function normalizeOutfitHexCase(text: string): string {
  return String(text || '').replace(/#[0-9a-fA-F]{6}/g, m => m.toLowerCase())
}

export function outfitUsesHexColors(text: string): boolean {
  const raw = String(text || '')
  if (!HEX_COLOR_RE.test(raw)) return false
  HEX_COLOR_RE.lastIndex = 0
  return !/(?:亮|深|浅|鲜|醒目)?(?:红|蓝|绿|黄|白|黑|灰|橙|紫|青|米|卡其|棕)(?:色)?(?:与|$)/.test(
    raw.replace(HEX_COLOR_RE, ''),
  )
}

export function convertClothingColorsToHex(text: string): string {
  let result = normalizeOutfitHexCase(String(text || '').trim())
  if (!result) return result

  result = result.replace(/T\s*恤/g, 'T恤').replace(/#\s*([0-9a-f]{6})/gi, '#$1')

  if (!outfitUsesHexColors(result)) {
    for (const [pattern, hex] of COLOR_PHRASE_TO_HEX) {
      result = result.replace(pattern, hex)
    }
    result = result.replace(REDUNDANT_COLOR_AFTER_HEX_RE, '$1')
  }

  return normalizeOutfitHexCase(result.replace(/T\s*恤/g, 'T恤'))
}

/** 将「身穿…」「穿…」片段中的中文色词改为 hex */
export function convertWearClauseColorsToHex(clause: string): string {
  const raw = String(clause || '').trim()
  if (!raw) return raw

  const wearMatch = raw.match(/^((?:身穿|身着|穿着|穿戴))(.+)$/)
  if (wearMatch) {
    return `${wearMatch[1]}${convertClothingColorsToHex(wearMatch[2])}`
  }

  const shortWearMatch = raw.match(/^(穿)(.+)$/)
  if (shortWearMatch) {
    return `穿${convertClothingColorsToHex(shortWearMatch[2])}`
  }

  return convertClothingColorsToHex(raw)
}

export function convertSubjectClothingColorsToHex(subject: string): string {
  const text = String(subject || '').trim()
  if (!text) return text

  return text
    .replace(/(?:身穿|身着|穿着|穿戴)([^，,。；;】）]+)/g, m => convertWearClauseColorsToHex(m))
    .replace(/(?<![身])穿([^，,。；;】）]+)/g, (_, rest: string) => `穿${convertClothingColorsToHex(rest)}`)
}

export function convertPromptClothingColorsToHex(prompt: string): { prompt: string; changed: boolean } {
  const raw = String(prompt || '').trim()
  if (!raw) return { prompt: raw, changed: false }

  let changed = false
  const next = raw.replace(/【画面主体[：:]\s*([^】]+)】/g, (_, content: string) => {
    const converted = convertSubjectClothingColorsToHex(content.trim())
    if (converted !== content.trim()) changed = true
    return `【画面主体：${converted}】`
  })

  return { prompt: next, changed }
}
