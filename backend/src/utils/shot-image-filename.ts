import path from 'path'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** 配图文件名：#<镜头序号>#<storyboardId>.ext，如 #1#127.png */
export const SHOT_IMAGE_NAME_RE = /^#(\d+)#(\d+)$/i

export function isImageFile(name: string) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase())
}

export function parseShotImageFilename(name: string): { seq: number; storyboardId: number } | null {
  const base = path.basename(name, path.extname(name))
  const m = base.match(SHOT_IMAGE_NAME_RE)
  if (!m) return null
  return { seq: Number(m[1]), storyboardId: Number(m[2]) }
}

export function formatShotImageFilename(seq: number, storyboardId: number, ext: string) {
  const normalized = ext.startsWith('.') ? ext : `.${ext}`
  return `#${seq}#${storyboardId}${normalized}`
}

/** 从文件名提取排序用数字：1.png → 1，image_12.jpg → 12 */
export function numericSortKey(name: string): number {
  const base = path.basename(name, path.extname(name))
  const m = base.match(/(\d+)/)
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
}

export function sortImageFilesByNumericName(files: string[]) {
  return [...files].sort((a, b) => {
    const ka = numericSortKey(a)
    const kb = numericSortKey(b)
    if (ka !== kb) return ka - kb
    return a.localeCompare(b, 'zh-CN')
  })
}
