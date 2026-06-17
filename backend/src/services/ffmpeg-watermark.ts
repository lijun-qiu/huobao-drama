/**
 * 成片水印 — 参照 NarratoAI：垂直居中、靠右半区；此处改为左右缓慢浮动（无上下浮动）
 */
import fs from 'fs'

export const DEFAULT_WATERMARK_TEXT = '顺拾人间'
/** NarratoAI 周期 30s，此处更慢 */
export const WATERMARK_FLOAT_PERIOD_SEC = 50
export const WATERMARK_FLOAT_AMPLITUDE_RATIO = 0.10

const SUBTITLE_FONT_SIZE = 20

export function resolveWatermarkText(raw?: string | null): string {
  if (raw == null || raw === undefined) return DEFAULT_WATERMARK_TEXT
  return String(raw).trim()
}

export function isWatermarkEnabled(raw?: string | null): boolean {
  if (raw === '') return false
  return !!resolveWatermarkText(raw)
}

function resolveDrawtextFontPath(): string | null {
  const candidates = [
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/msyhbd.ttc',
    'C:/Windows/Fonts/simhei.ttf',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
}

function escapeDrawtextPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:')
}

/** 构建 drawtext 滤镜：居中靠右 + 左右 10% 幅度缓慢漂移 */
export function buildWatermarkDrawtextFilter(
  text: string,
  options?: { width?: number; height?: number; fontSize?: number },
): string | null {
  const trimmed = resolveWatermarkText(text)
  if (!trimmed) return null

  const w = options?.width ?? 1280
  const h = options?.height ?? 720
  const fontSize = options?.fontSize ?? Math.max(18, Math.round(SUBTITLE_FONT_SIZE * 0.55))
  const margin = Math.max(12, Math.round(Math.min(w, h) * 0.02))
  const floatAmplitude = w * WATERMARK_FLOAT_AMPLITUDE_RATIO
  const period = WATERMARK_FLOAT_PERIOD_SEC

  const minX = `w*0.5+${margin}`
  const maxX = `w-tw-${margin}`
  const baseX = `max(${minX},min(w*0.75-tw/2,${maxX}))`
  const floatX = `${baseX}+${floatAmplitude}*sin(2*PI*t/${period})`
  const clampedX = `max(${minX},min(${floatX},${maxX}))`
  const baseY = '(h-th)/2'

  const escapedText = escapeDrawtextText(trimmed)
  const fontPath = resolveDrawtextFontPath()
  const fontPart = fontPath
    ? `fontfile='${escapeDrawtextPath(fontPath)}':`
    : "font='Microsoft YaHei':"

  return [
    'drawtext=',
    fontPart,
    `text='${escapedText}':`,
    `fontsize=${fontSize}:`,
    'fontcolor=white@0.72:',
    'borderw=1:',
    'bordercolor=black@0.72:',
    `x='${clampedX}':`,
    `y='${baseY}'`,
  ].join('')
}

export function appendWatermarkFilter(filters: string[], watermarkText?: string | null): void {
  const filter = buildWatermarkDrawtextFilter(resolveWatermarkText(watermarkText))
  if (filter) filters.push(filter)
}
