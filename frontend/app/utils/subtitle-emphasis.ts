/** 旁白字幕 ** 强调标记（与 backend subtitle-emphasis 规则一致） */

export function stripEmphasisMarkers(text: string): string {
  return String(text || '').replace(/\*\*(.+?)\*\*/g, '$1')
}

export function hasEmphasisMarkers(text: string): boolean {
  return /\*\*.+?\*\*/.test(String(text || ''))
}
