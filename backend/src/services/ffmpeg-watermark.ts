/**
 * 成片水印 — 默认固定于画面右上角；可选左右缓慢浮动
 */
import fs from 'fs'

export const DEFAULT_WATERMARK_TEXT = '顺拾人间'
/** NarratoAI 周期 30s，此处更慢 */
export const WATERMARK_FLOAT_PERIOD_SEC = 50
export const WATERMARK_FLOAT_AMPLITUDE_RATIO = 0.10
/** 距顶边占比 */
export const WATERMARK_MARGIN_TOP_RATIO = 0.10
/** 距右边占比（文字右缘对齐到 w*(1-ratio)） */
export const WATERMARK_MARGIN_RIGHT_RATIO = 0.10

const SUBTITLE_FONT_SIZE = 20

export type WatermarkFilterOptions = {
  animated?: boolean
  width?: number
  height?: number
  fontSize?: number
}

export function resolveWatermarkText(raw?: string | null): string {
  if (raw == null || raw === undefined) return DEFAULT_WATERMARK_TEXT
  return String(raw).trim()
}

/** 默认 false：水印位置固定 */
export function resolveWatermarkAnimated(raw?: boolean | null): boolean {
  return raw === true
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

/** 构建 drawtext 滤镜：默认右上角固定；animated 时在右上区域左右缓慢漂移 */
export function buildWatermarkDrawtextFilter(
  text: string,
  options?: WatermarkFilterOptions,
): string | null {
  const trimmed = resolveWatermarkText(text)
  if (!trimmed) return null

  const w = options?.width ?? 1280
  const h = options?.height ?? 720
  const fontSize = options?.fontSize ?? Math.max(18, Math.round(SUBTITLE_FONT_SIZE * 0.55))
  const animated = options?.animated === true

  const rightX = `w*${1 - WATERMARK_MARGIN_RIGHT_RATIO}-tw`
  const minX = `w*0.55`
  const floatAmplitude = w * WATERMARK_FLOAT_AMPLITUDE_RATIO
  const xExpr = animated
    ? (() => {
      const period = WATERMARK_FLOAT_PERIOD_SEC
      const floatX = `${rightX}-${floatAmplitude}*(1+sin(2*PI*t/${period}))/2`
      return `max(${minX},min(${floatX},${rightX}))`
    })()
    : rightX
  const baseY = `h*${WATERMARK_MARGIN_TOP_RATIO}`

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
    `x='${xExpr}':`,
    `y='${baseY}'`,
  ].join('')
}

export function appendWatermarkFilter(
  filters: string[],
  watermarkText?: string | null,
  options?: Pick<WatermarkFilterOptions, 'animated' | 'width' | 'height' | 'fontSize'>,
): void {
  const filter = buildWatermarkDrawtextFilter(resolveWatermarkText(watermarkText), options)
  if (filter) filters.push(filter)
}
