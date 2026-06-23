/** 配图文件名：#<镜头序号>#<storyboardId>.ext，如 #1#127.png */
const SHOT_IMAGE_NAME_RE = /^#(\d+)#(\d+)$/i

const IMAGE_UPLOAD_EXT = /\.(png|jpe?g|webp|gif)$/i

/** 半角 (1) 或全角 （1） */
const PAREN_INDEX_RE = /[（(](\d+)[）)]\s*$/

function uploadFileName(file: { name?: string; webkitRelativePath?: string }) {
  const raw = file.webkitRelativePath || file.name || ''
  return raw.split(/[/\\]/).pop() || raw
}

function basenameWithoutExt(name: string) {
  return name.replace(/\.[^.]+$/, '').split(/[/\\]/).pop() || name
}

export function isImageUploadFile(file: { name?: string; type?: string; webkitRelativePath?: string }) {
  if (file.type?.startsWith('image/')) return true
  return IMAGE_UPLOAD_EXT.test(uploadFileName(file))
}

export function parseShotImageFilename(name: string): { seq: number; storyboardId: number } | null {
  const base = basenameWithoutExt(name)
  const m = base.match(SHOT_IMAGE_NAME_RE)
  if (!m) return null
  return { seq: Number(m[1]), storyboardId: Number(m[2]) }
}

export function formatShotImageFilename(seq: number, storyboardId: number, ext: string) {
  const normalized = ext.startsWith('.') ? ext : `.${ext}`
  return `#${seq}#${storyboardId}${normalized}`
}

export type FolderUploadSlot<T> = { file: T; slotIndex: number }

function extractParenIndex(base: string): number | null {
  const m = base.trim().match(PAREN_INDEX_RE)
  return m ? Number(m[1]) : null
}

/**
 * 文件夹批量配图（固定规则）：
 * - 无括号原文件 → 第 1 镜（slot 0）
 * - 标题 (1) / （1） → 第 2 镜
 * - 标题 (n) / （n） → 第 n+1 镜
 */
export function buildFolderUploadSlots<T extends { name: string; webkitRelativePath?: string }>(
  files: T[],
  slotCount: number,
): { slots: FolderUploadSlot<T>[]; error?: string } {
  const baseFiles: T[] = []
  const byParen = new Map<number, T>()

  for (const file of files) {
    const base = basenameWithoutExt(uploadFileName(file)).trim()
    const paren = extractParenIndex(base)
    if (paren != null) {
      if (byParen.has(paren)) return { slots: [], error: `存在重复序号 (${paren})：${uploadFileName(file)}` }
      byParen.set(paren, file)
      continue
    }
    if (/^\d+$/.test(base)) {
      const n = Number(base)
      if (byParen.has(n)) return { slots: [], error: `存在重复序号 ${n}：${uploadFileName(file)}` }
      byParen.set(n, file)
      continue
    }
    if (!/\d/.test(base)) {
      baseFiles.push(file)
      continue
    }
    return { slots: [], error: `无法识别配图序号：${uploadFileName(file)}` }
  }

  if (baseFiles.length === 1 && byParen.size === slotCount - 1) {
    for (let n = 1; n < slotCount; n++) {
      if (!byParen.has(n)) {
        return { slots: [], error: `缺少「(${n})」或「（${n}）」文件，无法与 ${slotCount} 个待配图镜头一一对应` }
      }
    }
    const slots: FolderUploadSlot<T>[] = [{ file: baseFiles[0], slotIndex: 0 }]
    for (let n = 1; n < slotCount; n++) {
      slots.push({ file: byParen.get(n)!, slotIndex: n })
    }
    return { slots }
  }

  // 纯数字 1..N 连续命名（prepare-shot-folder.py 重命名后）→ 第 1 镜 .. 第 N 镜
  if (baseFiles.length === 0 && byParen.size > 0) {
    const keys = [...byParen.keys()].sort((a, b) => a - b)
    const consecutiveFromOne = keys[0] === 1 && keys.every((k, i) => k === i + 1)
    if (consecutiveFromOne) {
      if (keys.length !== slotCount) {
        return {
          slots: [],
          error: `文件夹内 ${keys.length} 张（1～${keys.length}），需配图镜头 ${slotCount} 个，数量不一致`,
        }
      }
      return {
        slots: keys.map(n => ({ file: byParen.get(n)!, slotIndex: n - 1 })),
      }
    }
  }

  if (baseFiles.length > 1) {
    return { slots: [], error: `文件夹内有多张无序号原图（${baseFiles.length} 张），请只保留 1 张无括号文件作为第 1 镜` }
  }

  if (files.length !== slotCount) {
    return {
      slots: [],
      error: `文件夹内 ${files.length} 张图片，需配图镜头 ${slotCount} 个（期望 1 张无后缀 + (1)…(${slotCount - 1})）`,
    }
  }

  return { slots: [], error: `无法匹配文件夹命名，请使用：1 张无后缀原图 + (1)…(${slotCount - 1}) 或全角（1）…（${slotCount - 1}）` }
}
