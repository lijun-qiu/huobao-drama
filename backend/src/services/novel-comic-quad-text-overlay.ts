/**
 * 小说漫画四格页：生图后用系统字体叠正确旁白（模型只画空框）
 * 优先把字叠进检测到的空气泡/旁白框内；失败则画漫画气泡覆盖。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import sharp from 'sharp'
import { getAbsolutePath } from '../utils/storage.js'
import { parseNarrationImageMeta } from './narration-image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/msyhbd.ttc',
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttf',
  '/System/Library/Fonts/PingFang.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
]

export type BubbleBox = {
  x: number
  y: number
  w: number
  h: number
  /** 检测到的空气泡 vs 兜底气泡 */
  source: 'detect' | 'fallback'
  shape: 'rect' | 'oval'
}

export function resolveNovelComicOverlayFontPath(): string | null {
  for (const p of FONT_CANDIDATES) {
    if (fs.existsSync(p)) return p.replace(/\\/g, '/')
  }
  return null
}

/** 从配图文案提取旁白框/气泡原文（最多 4 条） */
export function extractNovelComicQuadCaptionTexts(prompt?: string | null): string[] {
  const s = String(prompt || '')
  const out: string[] = []
  for (const m of s.matchAll(/(?:旁白框|气泡)「([^」]+)」/g)) {
    const t = String(m[1] || '').trim()
    if (t) out.push(t)
    if (out.length >= 4) break
  }
  return out
}

function wrapChineseText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const chars = Array.from(String(text || '').trim())
  if (!chars.length) return []
  const lines: string[] = []
  let buf = ''
  for (const ch of chars) {
    buf += ch
    if (buf.length >= maxCharsPerLine) {
      lines.push(buf)
      buf = ''
      if (lines.length >= maxLines) break
    }
  }
  if (buf && lines.length < maxLines) lines.push(buf)
  if (chars.length > maxCharsPerLine * maxLines && lines.length) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : '…'
  }
  return lines
}

function escapeXml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function panelOrigins(width: number, height: number) {
  const cellW = width / 2
  const cellH = height / 2
  return [
    { left: 0, top: 0, cellW, cellH },
    { left: cellW, top: 0, cellW, cellH },
    { left: 0, top: cellH, cellW, cellH },
    { left: cellW, top: cellH, cellW, cellH },
  ]
}

function inferShape(w: number, h: number): 'rect' | 'oval' {
  const aspect = w / Math.max(1, h)
  // 横长旁白框 / 竖长旁白框用圆角矩形；接近椭圆的用 oval
  if (aspect >= 1.55 || aspect <= 0.72) return 'rect'
  return 'oval'
}

function fallbackBubbleBox(left: number, top: number, cellW: number, cellH: number): BubbleBox {
  const w = Math.round(cellW * 0.78)
  const h = Math.round(cellH * 0.26)
  const x = left + Math.round((cellW - w) / 2)
  const y = top + Math.round(cellH * 0.035)
  return { x, y, w, h, source: 'fallback', shape: 'rect' }
}

/** 估算气泡能否装下旁白（装不下则改用格顶大气泡，避免字糊脸上） */
function bubbleFitsCaption(box: BubbleBox, caption: string): boolean {
  const textLen = Array.from(String(caption || '').trim()).length
  if (!textLen) return true
  const padX = Math.max(6, Math.round(box.w * (box.shape === 'oval' ? 0.14 : 0.07)))
  const padY = Math.max(5, Math.round(box.h * 0.12))
  const innerW = Math.max(18, box.w - padX * 2)
  const fontSize = Math.max(
    11,
    Math.min(24, Math.round(Math.min(innerW / 10.5, box.h * 0.26, box.w * 0.08))),
  )
  const lineHeight = Math.round(fontSize * 1.26)
  const maxChars = Math.max(5, Math.floor(innerW / (fontSize * 0.9)))
  const maxLines = Math.max(1, Math.min(5, Math.floor((box.h - padY * 2) / lineHeight)))
  const capacity = maxChars * maxLines
  return capacity >= Math.ceil(textLen * 0.85) && box.w >= 90 && box.h >= 36
}

/** 以检测中心为锚，放大到可读写尺寸（仍钳在格内） */
function expandBubbleToFit(
  box: BubbleBox,
  panel: { left: number; top: number; cellW: number; cellH: number },
  caption: string,
): BubbleBox {
  if (bubbleFitsCaption(box, caption)) return box
  const minW = Math.round(panel.cellW * 0.62)
  const minH = Math.round(panel.cellH * Math.min(0.34, 0.14 + Array.from(caption).length * 0.004))
  const cx = box.x + box.w / 2
  const cy = Math.min(box.y + box.h / 2, panel.top + panel.cellH * 0.22)
  let w = Math.max(box.w, minW)
  let h = Math.max(box.h, minH)
  let x = Math.round(cx - w / 2)
  let y = Math.round(cy - h / 2)
  x = Math.max(panel.left + 8, Math.min(x, panel.left + panel.cellW - w - 8))
  y = Math.max(panel.top + 6, Math.min(y, panel.top + panel.cellH * 0.42 - h))
  w = Math.min(w, panel.cellW - (x - panel.left) - 8)
  h = Math.min(h, Math.round(panel.cellH * 0.4))
  const next: BubbleBox = { x, y, w, h, source: 'detect', shape: inferShape(w, h) }
  return bubbleFitsCaption(next, caption) ? next : fallbackBubbleBox(panel.left, panel.top, panel.cellW, panel.cellH)
}

type Blob = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
}

/**
 * 在单格上半部找最适合叠字的近白连通块（空旁白框 / 空气泡）。
 */
export function detectBrightBubbleInPanel(
  raw: Uint8Array | Buffer,
  imgW: number,
  channels: number,
  panel: { left: number; top: number; cellW: number; cellH: number },
): BubbleBox | null {
  const { left, top, cellW, cellH } = panel
  const searchH = Math.max(28, Math.floor(cellH * 0.58))
  const x0 = Math.max(0, Math.floor(left + cellW * 0.03))
  const y0 = Math.max(0, Math.floor(top + cellH * 0.015))
  const x1 = Math.min(imgW, Math.floor(left + cellW * 0.97))
  const y1 = Math.floor(top + searchH)
  const w = x1 - x0
  const h = y1 - y0
  if (w < 24 || h < 18) return null

  const bright = new Uint8Array(w * h)
  let brightCount = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ix = ((y0 + y) * imgW + (x0 + x)) * channels
      const r = raw[ix]
      const g = raw[ix + 1]
      const b = raw[ix + 2]
      const maxc = Math.max(r, g, b)
      const minc = Math.min(r, g, b)
      // 空框内近白；略放宽以覆盖抗锯齿边缘内侧
      const ok = maxc >= 222 && (maxc - minc) <= 40 && (r + g + b) / 3 >= 218
      if (ok) {
        bright[y * w + x] = 1
        brightCount++
      }
    }
  }

  const area = w * h
  const ratio = brightCount / area
  if (ratio < 0.015 || ratio > 0.72) return null

  const visited = new Uint8Array(w * h)
  const blobs: Blob[] = []
  const stack: number[] = []

  for (let i = 0; i < bright.length; i++) {
    if (!bright[i] || visited[i]) continue
    let minX = i % w
    let maxX = minX
    let minY = Math.floor(i / w)
    let maxY = minY
    let count = 0
    stack.length = 0
    stack.push(i)
    visited[i] = 1
    while (stack.length) {
      const cur = stack.pop()!
      const cx = cur % w
      const cy = Math.floor(cur / w)
      count++
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy
      const tryPush = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return
        const n = ny * w + nx
        if (visited[n] || !bright[n]) return
        visited[n] = 1
        stack.push(n)
      }
      tryPush(cx - 1, cy)
      tryPush(cx + 1, cy)
      tryPush(cx, cy - 1)
      tryPush(cx, cy + 1)
    }
    blobs.push({ minX, minY, maxX, maxY, count })
  }

  const minArea = Math.floor(cellW * cellH * 0.01)
  const maxArea = Math.floor(cellW * cellH * 0.28)
  let best: { blob: Blob; score: number; bw: number; bh: number } | null = null

  for (const blob of blobs) {
    const bw = blob.maxX - blob.minX + 1
    const bh = blob.maxY - blob.minY + 1
    if (blob.count < minArea || blob.count > maxArea) continue
    if (bw < cellW * 0.14 || bh < cellH * 0.055) continue
    if (bh > cellH * 0.5) continue
    // 通栏整片纸白（几乎贴满搜索宽）且过高 → 背景留白，跳过
    if (bw > cellW * 0.9 && bh > cellH * 0.35) continue

    const fill = blob.count / (bw * bh)
    if (fill < 0.28) continue
    const aspect = bw / Math.max(1, bh)
    if (aspect < 0.35 || aspect > 7.5) continue

    // 偏上、更大更宽（装字）、更“填满”的块优先；横长旁白框加分
    const cy = (blob.minY + blob.maxY) / 2
    const topBias = 1.35 - (cy / Math.max(1, h)) * 0.7
    const widthBonus = 0.75 + (bw / Math.max(1, cellW)) * 1.6
    const aspectBonus = aspect >= 1.35 && aspect <= 5 ? 1.4 : 1
    const score = bw * bh * fill * topBias * widthBonus * aspectBonus
    if (!best || score > best.score) best = { blob, score, bw, bh }
  }

  if (!best) return null

  // 略收缩避开描边；矩形旁白框少缩一点宽度
  const shape = inferShape(best.bw, best.bh)
  const insetX = Math.max(2, Math.round(best.bw * (shape === 'rect' ? 0.03 : 0.06)))
  const insetY = Math.max(2, Math.round(best.bh * (shape === 'rect' ? 0.08 : 0.1)))
  const bx = x0 + best.blob.minX + insetX
  const by = y0 + best.blob.minY + insetY
  const outW = Math.max(28, best.bw - insetX * 2)
  const outH = Math.max(20, best.bh - insetY * 2)
  return { x: bx, y: by, w: outW, h: outH, source: 'detect', shape }
}

export async function resolvePanelBubbleBoxes(
  absPath: string,
  width: number,
  height: number,
  captions: string[] = [],
): Promise<BubbleBox[]> {
  const { data, info } = await sharp(absPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const channels = info.channels || 4
  const panels = panelOrigins(width, height)
  return panels.map((p, i) => {
    const hit = detectBrightBubbleInPanel(data, info.width, channels, p)
    if (!hit) return fallbackBubbleBox(p.left, p.top, p.cellW, p.cellH)
    return expandBubbleToFit(hit, p, captions[i] || '')
  })
}

function buildBubblePath(box: BubbleBox): string {
  const { x, y, w, h, shape, source } = box
  if (shape === 'rect') {
    const rx = Math.min(14, Math.round(Math.min(w, h) * 0.18))
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="rgba(255,255,255,0.97)" stroke="#222222" stroke-width="2.2"/>`
  }
  const cx = x + w / 2
  const cy = y + h / 2
  const rx = w / 2
  const ry = h / 2
  const oval = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(255,255,255,0.97)" stroke="#222222" stroke-width="2.2"/>`
  if (source !== 'fallback') return oval
  const tailX = x + w * 0.58
  const tailY = y + h - 2
  const tipX = x + w * 0.7
  const tipY = y + h + Math.min(16, Math.round(h * 0.28))
  const tailX2 = x + w * 0.78
  return `${oval}<polygon points="${tailX},${tailY} ${tipX},${tipY} ${tailX2},${tailY}" fill="rgba(255,255,255,0.97)" stroke="#222222" stroke-width="2" stroke-linejoin="round"/>`
}

function buildOverlaySvg(options: {
  width: number
  height: number
  captions: string[]
  bubbles: BubbleBox[]
  fontPath: string | null
}): string {
  const { width, height, captions, bubbles, fontPath } = options

  const fontFace = fontPath
    ? `@font-face{font-family:'NovelComicOverlay';src:url('file:///${fontPath}');}`
    : ''
  const fontFamily = fontPath
    ? `NovelComicOverlay, 'Microsoft YaHei', 'SimHei', sans-serif`
    : `'Microsoft YaHei', 'SimHei', sans-serif`

  const panels: string[] = []
  for (let i = 0; i < 4; i++) {
    const text = captions[i] || ''
    const box = bubbles[i]
    if (!text || !box) continue

    const padX = Math.max(6, Math.round(box.w * (box.shape === 'oval' ? 0.14 : 0.07)))
    const padY = Math.max(5, Math.round(box.h * 0.12))
    const innerW = Math.max(18, box.w - padX * 2)
    const fontSize = Math.max(
      11,
      Math.min(24, Math.round(Math.min(innerW / 10.5, box.h * 0.26, box.w * 0.08))),
    )
    const lineHeight = Math.round(fontSize * 1.26)
    const maxChars = Math.max(5, Math.floor(innerW / (fontSize * 0.9)))
    const maxLines = Math.max(1, Math.min(5, Math.floor((box.h - padY * 2) / lineHeight)))
    const lines = wrapChineseText(text, maxChars, maxLines)
    if (!lines.length) continue

    const blockH = lines.length * lineHeight
    const startY = box.y + (box.h - blockH) / 2 + fontSize * 0.82
    const tx = box.x + box.w / 2
    const textNodes = lines.map((line, li) => {
      const ty = startY + li * lineHeight
      return `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="${fontSize}" fill="#111111" font-family="${fontFamily}">${escapeXml(line)}</text>`
    }).join('')

    panels.push(`${buildBubblePath(box)}${textNodes}`)
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>${fontFace}</style>${panels.join('')}</svg>`
}

export type NovelComicQuadOverlayParams = {
  localPath: string
  prompt?: string | null
  /** 分镜旁白句兜底 */
  narrationLines?: string[] | null
  /** storyboard.reference_images JSON，可解析 narration_lines */
  referenceImages?: string | null
}

/**
 * 对本地四格页叠旁白字；返回新的 static/images/... 相对路径。
 * 无可用文案时原样返回 localPath。
 */
export async function overlayNovelComicQuadPageText(
  params: NovelComicQuadOverlayParams,
): Promise<string> {
  const srcRel = String(params.localPath || '').trim()
  if (!srcRel) return srcRel

  let captions = extractNovelComicQuadCaptionTexts(params.prompt)
  if (captions.length < 4) {
    const fromArg = (params.narrationLines || []).map(s => String(s || '').trim()).filter(Boolean)
    const meta = parseNarrationImageMeta(params.referenceImages)
    const fromMeta = [
      ...(meta.image_narration_lines || []),
      ...(meta.narration_lines || []),
    ].map(s => String(s || '').trim()).filter(Boolean)
    const fallback = fromArg.length ? fromArg : fromMeta
    for (const line of fallback) {
      if (captions.length >= 4) break
      if (!captions.includes(line)) captions.push(line)
    }
  }
  // 短字：过长旁白兜底截断，避免叠字溢出气泡
  captions = captions
    .map(t => {
      const s = String(t || '').trim()
      if (s.length <= 14) return s
      return `${Array.from(s).slice(0, 13).join('')}…`
    })
    .slice(0, 4)
  if (!captions.length) return srcRel

  const abs = getAbsolutePath(srcRel)
  if (!fs.existsSync(abs)) return srcRel

  const meta = await sharp(abs).metadata()
  const width = meta.width || 1280
  const height = meta.height || 720
  const fontPath = resolveNovelComicOverlayFontPath()
  const bubbles = await resolvePanelBubbleBoxes(abs, width, height, captions)
  const svg = buildOverlaySvg({ width, height, captions, bubbles, fontPath })

  const outDir = path.join(STORAGE_ROOT, 'images')
  fs.mkdirSync(outDir, { recursive: true })
  const outName = `${uuid()}.png`
  const outAbs = path.join(outDir, outName)
  const outRel = `static/images/${outName}`

  await sharp(abs)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outAbs)

  return outRel
}
