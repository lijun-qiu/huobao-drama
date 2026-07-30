/**
 * Flux 英文 prompt：清除 LLM 漏译的中文残留
 */
export const FLUX_EN_CJK_PHRASE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/对照定妆/g, 'matching reference portrait'],
  [/定妆/g, 'character reference portrait'],
  [/程序员/g, 'programmer'],
  [/青年/g, 'young adult'],
  [/中年/g, 'middle-aged'],
  [/男性/g, 'male'],
  [/女性/g, 'female'],
  [/无配角/g, 'no supporting characters'],
  [/玻璃幕墙/g, 'glass curtain wall'],
  [/轮廓虚化/g, 'softly blurred silhouette'],
  [/边缘轮廓虚化/g, 'softly blurred edge silhouette'],
  [/轮廓线/g, 'contour lines'],
  [/数据流线条/g, 'data-stream lines'],
  [/半透明/g, 'semi-transparent'],
  [/中近景/g, 'medium close-up'],
  [/俯视角度?/g, 'high-angle'],
  [/仰视角度?/g, 'low-angle'],
  [/侧视/g, 'side view'],
  [/平视/g, 'eye-level'],
  [/背景虚化/g, 'shallow depth of field with softly blurred background'],
  [/虚化/g, 'soft blur'],
  [/改造/g, 'converted'],
  [/深夜/g, 'late night'],
  [/清晨/g, 'early morning'],
  [/工作室/g, 'studio'],
  [/办公空间/g, 'office space'],
  [/宿舍/g, 'dormitory'],
  [/机械键盘/g, 'mechanical keyboard'],
  [/连帽卫衣/g, 'hooded sweatshirt'],
  [/赛璐璐/g, 'cel shading'],
  [/线稿/g, 'clean lineart'],
  [/新海诚/g, 'Makoto Shinkai'],
  [/京都动画|京阿尼/g, 'Kyoto Animation'],
  [/电影感/g, 'cinematic'],
  [/头身比/g, 'body proportions'],
  [/非Q版/g, 'not chibi'],
  [/无文字无水印/g, 'no text, no watermark'],
] as const

/** 替换已知中文术语；剩余 CJK 片段标出供 fallback */
export function purgeChineseFromFluxEnglish(raw: string): string {
  let s = String(raw || '')
    .replace(/[「」『』]/g, '"')
    .replace(/[（(]([^）)]*[\u4e00-\u9fff][^）)]*)[）)]/g, (_, inner: string) => {
      let t = inner
      for (const [re, en] of FLUX_EN_CJK_PHRASE_REPLACEMENTS) {
        t = t.replace(re, en)
      }
      return /[\u4e00-\u9fff]/.test(t) ? '' : ` (${t.trim()})`
    })

  for (const [re, en] of FLUX_EN_CJK_PHRASE_REPLACEMENTS) {
    s = s.replace(re, en)
  }

  // 中英粘连：from a俯视angle → from a high-angle view
  s = s
    .replace(/a\s*high-angle\s*angle/gi, 'a high-angle view')
    .replace(/slightly\s*low-angle\s*angle/gi, 'slightly low-angle')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*,/g, ',')
    .trim()

  return s
}

export function hasFluxEnglishCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(String(text || ''))
}

export function fluxEnglishCjkFragments(text: string): string[] {
  return [...String(text || '').matchAll(/[\u4e00-\u9fff]+/g)].map(m => m[0])
}

/**
 * 定妆 label 引号内允许保留中文（如 portrait label '小雅·青年'）；
 * 其余位置出现汉字视为漏译。
 */
export function stripAllowedPortraitLabelCjk(en: string): string {
  return String(en || '')
    .replace(/portrait\s+label\s*'[^']*'/gi, "portrait label ''")
    .replace(/portrait\s+label\s*"[^"]*"/gi, 'portrait label ""')
    .replace(/matching\s+(?:reference\s+)?portrait(?:\s+for)?\s*'[^']*'/gi, "matching portrait ''")
    .replace(/matching\s+(?:reference\s+)?portrait(?:\s+for)?\s*"[^"]*"/gi, 'matching portrait ""')
}

export function hasIllegalFluxEnglishCjk(text: string): boolean {
  return hasFluxEnglishCjk(stripAllowedPortraitLabelCjk(text))
}

export function illegalFluxEnglishCjkFragments(text: string): string[] {
  return fluxEnglishCjkFragments(stripAllowedPortraitLabelCjk(text))
}
