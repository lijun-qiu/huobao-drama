/** 配图文件名：#<镜头序号>#<storyboardId>.ext，如 #1#127.png */
const SHOT_IMAGE_NAME_RE = /^#(\d+)#(\d+)$/i

export function parseShotImageFilename(name: string): { seq: number; storyboardId: number } | null {
  const base = name.replace(/\.[^.]+$/, '').split(/[/\\]/).pop() || name
  const m = base.match(SHOT_IMAGE_NAME_RE)
  if (!m) return null
  return { seq: Number(m[1]), storyboardId: Number(m[2]) }
}

export function formatShotImageFilename(seq: number, storyboardId: number, ext: string) {
  const normalized = ext.startsWith('.') ? ext : `.${ext}`
  return `#${seq}#${storyboardId}${normalized}`
}
