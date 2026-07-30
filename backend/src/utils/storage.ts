/**
 * 文件存储工具 — 下载远程文件到本地
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

/**
 * 下载远程文件到本地存储
 */
export async function downloadFile(
  url: string,
  subDir: string,
  options?: { timeoutMs?: number; defaultExt?: string },
): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = getExtFromUrl(url) || options?.defaultExt || '.bin'
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 120_000)
  let resp: Response
  try {
    resp = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)

  const buffer = Buffer.from(await resp.arrayBuffer())
  fs.writeFileSync(filePath, buffer)

  // 返回相对路径（供 API 返回给前端）
  return `static/${subDir}/${filename}`
}

/**
 * 保存上传的文件
 */
export async function saveUploadedFile(data: ArrayBuffer, subDir: string, originalName: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = path.extname(originalName) || '.bin'
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  fs.writeFileSync(filePath, Buffer.from(data))
  return `static/${subDir}/${filename}`
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname)
    if (ext && ext.length <= 5) return ext
  } catch {}
  return '.bin'
}

/**
 * 获取本地文件的绝对路径
 */
export function getAbsolutePath(relativePath: string): string {
  if (relativePath.startsWith('static/')) {
    return path.join(STORAGE_ROOT, '..', relativePath)
  }
  return path.join(STORAGE_ROOT, relativePath)
}

/** Lanczos 放大到目标分辨率（ComfyUI ESRGAN 不可用时的兜底） */
export async function upscaleImageToTargetSize(
  relativePath: string,
  width: number,
  height: number,
  options?: { fit?: 'cover' | 'contain' },
): Promise<string> {
  const abs = getAbsolutePath(relativePath)
  if (!fs.existsSync(abs)) throw new Error(`Image not found: ${relativePath}`)

  const meta = await sharp(abs).metadata()
  if ((meta.width ?? 0) >= width && (meta.height ?? 0) >= height) {
    return relativePath
  }

  const ext = path.extname(abs) || '.png'
  const tmp = abs.replace(new RegExp(`${ext.replace('.', '\\.')}$`), `.up${ext}`)
  const fit = options?.fit ?? 'cover'
  // cover 会中心裁切（易切腿）；分镜站立全身请用 contain
  await sharp(abs)
    .resize(width, height, {
      fit,
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.5, m1: 0.5, m2: 0.25 })
    .toFile(tmp)
  fs.renameSync(tmp, abs)
  return relativePath
}

/**
 * 保存 Base64 编码的图片数据到本地存储
 * 用于 Gemini 等只返回 base64 数据的厂商
 */
export async function saveBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  // 从 mimeType 推断文件扩展名
  const ext = mimeTypeToExt(mimeType)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)

  return `static/${subDir}/${filename}`
}

export function readImageAsDataUrl(relativePath: string): string {
  const filePath = getAbsolutePath(relativePath)
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = extToMimeType(ext)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function readImageAsCompressedDataUrl(
  relativePath: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    /** 透明底 flatten 颜色；Agnes 定妆参考宜用深色，避免白棚 */
    flattenBackground?: string
    /** 将近白像素替换为深藏青（Agnes 多图合成防设定拼贴） */
    replaceNearWhiteBg?: boolean
  } = {},
): Promise<string> {
  const filePath = getAbsolutePath(relativePath)
  const maxWidth = options.maxWidth ?? 768
  const maxHeight = options.maxHeight ?? 768
  const quality = options.quality ?? 68
  const flattenBg = options.flattenBackground || '#ffffff'

  const pipeline = sharp(filePath).rotate().resize({
    width: maxWidth,
    height: maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (options.replaceNearWhiteBg) {
    const { convertPortraitRefWhiteBgToAgnesDark } = await import('./portrait-ref-preprocess.js')
    const buf = await pipeline.ensureAlpha().png().toBuffer()
    const converted = await convertPortraitRefWhiteBgToAgnesDark(buf)
    const out = await sharp(converted)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  }

  const metadata = await pipeline.metadata()
  const output = metadata.hasAlpha
    ? await pipeline.flatten({ background: flattenBg }).jpeg({ quality, mozjpeg: true }).toBuffer()
    : await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
  return `data:image/jpeg;base64,${output.toString('base64')}`
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    data: match[2],
  }
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
  }
  return map[mimeType] || '.png'
}

function extToMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return map[ext] || 'image/png'
}
