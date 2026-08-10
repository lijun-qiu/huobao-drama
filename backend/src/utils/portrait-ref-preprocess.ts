/**
 * Agnes 定妆参考预处理：
 * - 白底 → 深藏青（防设定表拼贴）
 * - 分镜参考裁脸+头发（去掉半身站姿污染）
 * - 成图「右栏设定表」启发式检出
 */
export const AGNES_PORTRAIT_DARK_BG = '#0f172a'
const AGNES_DARK_RGB = { r: 15, g: 23, b: 42 }

/** 分镜喂 Agnes 时最多参考图张数（须与 MOTION_COMIC_MAX_SAME_FRAME_PORTRAITS 一致） */
export const AGNES_STORYBOARD_MAX_REFS = 2

/** 设定表废图最多自动重试次数（不含首次） */
export const AGNES_SHEET_RETRY_MAX = 2

export const AGNES_SHEET_RETRY_PREFIX = 'agnes_sheet_retry:'

export async function convertPortraitRefWhiteBgToAgnesDark(
  input: Buffer | string,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const src = typeof input === 'string' && input.startsWith('data:')
    ? Buffer.from(input.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    : input
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r >= 232 && g >= 232 && b >= 232) {
      data[i] = AGNES_DARK_RGB.r
      data[i + 1] = AGNES_DARK_RGB.g
      data[i + 2] = AGNES_DARK_RGB.b
    } else if (r >= 245 && g >= 245 && b >= 240) {
      data[i] = AGNES_DARK_RGB.r
      data[i + 1] = AGNES_DARK_RGB.g
      data[i + 2] = AGNES_DARK_RGB.b
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}

function bufferFromInput(input: Buffer | string): Buffer {
  if (Buffer.isBuffer(input)) return input
  const s = String(input || '')
  if (s.startsWith('data:image/')) {
    return Buffer.from(s.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  }
  return Buffer.from(s)
}

/**
 * 几何裁切：脸+头发（定妆竖幅半身居中时够准；略放宽高度保发顶）。
 * 非检测器，依赖「正面半身、人物占满」构图约定。
 */
export async function cropPortraitRefToFaceHair(
  input: Buffer | string,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const src = bufferFromInput(input)
  const meta = await sharp(src).metadata()
  const w = meta.width || 1024
  const h = meta.height || 1024
  // 比 Comfy faceOnly(0.34) 略高，多留头发轮廓
  const cropH = Math.max(1, Math.round(h * 0.4))
  const cropW = Math.max(1, Math.round(Math.min(w, h * 0.68)))
  const left = Math.max(0, Math.round((w - cropW) / 2))
  const top = Math.max(0, Math.round(h * 0.02))
  return sharp(src)
    .extract({ left, top, width: cropW, height: Math.min(cropH, h - top) })
    .resize(512, 512, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()
}

export type AgnesSheetDetectResult = {
  isSheet: boolean
  reason: string
  score: number
  rightBrightRatio: number
  leftBrightRatio: number
}

/**
 * 检出 Agnes 翻车：
 * 1) 左剧情 + 右白底设定表
 * 2) 整幅白底六宫格/贴纸贴图（face-crop 参考后的新翻车形态）
 */
export async function detectAgnesCharacterSheetLayout(
  input: Buffer | string,
): Promise<AgnesSheetDetectResult> {
  const sharp = (await import('sharp')).default
  const src = bufferFromInput(input)
  const { data, info } = await sharp(src)
    .rotate()
    .resize({ width: 320, height: 180, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height
  const channels = info.channels || 3
  const splitX = Math.max(1, Math.floor(w * 0.62))

  let leftBright = 0
  let leftN = 0
  let rightBright = 0
  let rightN = 0
  let rightNearWhite = 0
  let overallBright = 0
  let overallNearWhite = 0
  let overallN = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      overallN++
      if (lum >= 220) overallBright++
      if (lum >= 235) overallNearWhite++
      if (x < splitX) {
        leftN++
        if (lum >= 220) leftBright++
      } else {
        rightN++
        if (lum >= 220) rightBright++
        if (lum >= 235) rightNearWhite++
      }
    }
  }

  const leftBrightRatio = leftN ? leftBright / leftN : 0
  const rightBrightRatio = rightN ? rightBright / rightN : 0
  const rightNearWhiteRatio = rightN ? rightNearWhite / rightN : 0
  const overallBrightRatio = overallN ? overallBright / overallN : 0
  const overallNearWhiteRatio = overallN ? overallNearWhite / overallN : 0

  const countFaceLikeCells = (x0: number, y0: number, x1: number, y1: number, cols: number, rows: number) => {
    const regionW = Math.max(1, x1 - x0)
    const regionH = Math.max(1, y1 - y0)
    const cellW = Math.max(1, Math.floor(regionW / cols))
    const cellH = Math.max(1, Math.floor(regionH / rows))
    let faceLike = 0
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx0 = x0 + gx * cellW
        const cy0 = y0 + gy * cellH
        const cx1 = Math.min(x1, cx0 + cellW)
        const cy1 = Math.min(y1, cy0 + cellH)
        let sum = 0
        let sumSq = 0
        let n = 0
        let nearWhite = 0
        for (let y = cy0; y < cy1; y++) {
          for (let x = cx0; x < cx1; x++) {
            const i = (y * w + x) * channels
            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
            sum += lum
            sumSq += lum * lum
            n++
            if (lum >= 235) nearWhite++
          }
        }
        if (!n) continue
        const mean = sum / n
        const variance = sumSq / n - mean * mean
        const std = Math.sqrt(Math.max(0, variance))
        const whiteRatio = nearWhite / n
        // 白底上的半身/头像格：中间有脸部对比，四周偏白
        if (std >= 16 && mean >= 80 && mean <= 220 && whiteRatio >= 0.12) faceLike++
        else if (std >= 22 && mean >= 70 && mean <= 210) faceLike++
      }
    }
    return faceLike
  }

  const rightGridHeads = countFaceLikeCells(splitX, 0, w, h, 2, 3)
  const fullGrid23 = countFaceLikeCells(0, 0, w, h, 3, 2)
  const fullGrid32 = countFaceLikeCells(0, 0, w, h, 2, 3)

  let score = 0
  const reasons: string[] = []

  if (rightBrightRatio >= 0.35 && leftBrightRatio <= 0.28) {
    score += 0.55
    reasons.push('right-panel-brighter-than-scene')
  }
  if (rightNearWhiteRatio >= 0.28 && leftBrightRatio <= 0.3) {
    score += 0.25
    reasons.push('right-near-white-strip')
  }
  // 夜景左暗 + 右侧窄头像墙：以前只打到 0.35 被放行；有右侧宫格头就直接判失败
  if (rightGridHeads >= 4) {
    score += 0.55
    reasons.push(`right-grid-heads:${rightGridHeads}`)
  } else if (rightGridHeads >= 3 && (rightBrightRatio >= 0.2 || leftBrightRatio <= 0.35)) {
    score += 0.5
    reasons.push(`right-grid-heads:${rightGridHeads}`)
  }
  if (rightBrightRatio >= 0.55) {
    score += 0.2
    reasons.push('right-mostly-bright')
  }

  // 整幅白底贴纸/六宫格（face-crop 后常见；旧逻辑因左右都白而漏检）
  const bestFullGrid = Math.max(fullGrid23, fullGrid32)
  if (overallNearWhiteRatio >= 0.35 && bestFullGrid >= 3) {
    score += 0.7
    reasons.push(`full-white-sticker-grid:${bestFullGrid}`)
  } else if (overallBrightRatio >= 0.35 && bestFullGrid >= 4) {
    score += 0.65
    reasons.push(`full-bright-portrait-grid:${bestFullGrid}`)
  } else if (overallNearWhiteRatio >= 0.5 && overallBrightRatio >= 0.6) {
    score += 0.6
    reasons.push('mostly-white-canvas')
  }

  const isSheet = score >= 0.5
  return {
    isSheet,
    reason: reasons.join('+') || 'ok',
    score: Math.round(score * 100) / 100,
    rightBrightRatio: Math.round(rightBrightRatio * 1000) / 1000,
    leftBrightRatio: Math.round(leftBrightRatio * 1000) / 1000,
  }
}

export function parseAgnesSheetRetryCount(errorMsg?: string | null): number {
  const m = String(errorMsg || '').match(new RegExp(`^${AGNES_SHEET_RETRY_PREFIX}(\\d+)`))
  if (!m) return 0
  const n = Number(m[1])
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

export function formatAgnesSheetRetryError(retry: number, reason: string): string {
  return `${AGNES_SHEET_RETRY_PREFIX}${retry}|${String(reason || 'sheet').slice(0, 120)}`
}
