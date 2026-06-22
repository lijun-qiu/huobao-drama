import fs from 'fs'
import path from 'path'

/** 开幕/片头叠字字幕字体：行书/行楷（Windows 自带「华文行楷」） */
export const TITLE_SUBTITLE_FONT = process.env.TITLE_SUBTITLE_FONT || '华文行楷'

/** 供 libass 加载行书字体目录（stxingka / simkai 等） */
export function resolveTitleSubtitleFontsDir(): string | null {
  const dirs = [
    'C:/Windows/Fonts',
    '/System/Library/Fonts/Supplemental',
    '/usr/share/fonts/truetype',
    '/usr/share/fonts/opentype/noto',
  ]
  const fontFiles = ['stxingka.ttf', 'STXINGKA.TTF', 'simkai.ttf', 'SIMKAI.TTF']
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    if (fontFiles.some(name => fs.existsSync(path.join(dir, name)))) {
      return dir.replace(/\\/g, '/')
    }
  }
  return null
}

export function buildTitleSubtitleAssFilter(subtitlePath: string): string {
  const escaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  const fontsDir = resolveTitleSubtitleFontsDir()
  if (!fontsDir) return `ass='${escaped}'`
  const escapedDir = fontsDir.replace(/:/g, '\\:').replace(/'/g, "\\'")
  return `ass='${escaped}':fontsdir='${escapedDir}'`
}
