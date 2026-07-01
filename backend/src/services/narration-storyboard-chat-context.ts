/**
 * 旁白分镜 — 聊天上下文（解说稿摘要 + 已有镜头）
 */
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { isMotionComicMode, resolveEpisodeProductionMode } from '../constants/production-mode.js'
import { parseNarrationScript } from './narration-breakdown.js'
import { parseNarrationImageMeta } from './narration-image.js'

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^(旁白|剧中)[：:]\s*/, '')
}

export type NarrationStoryboardChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export function sanitizeStoryboardChatTurns(messages: NarrationStoryboardChatTurn[]): NarrationStoryboardChatTurn[] {
  return (messages || [])
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m.content || '').trim(),
    }))
    .filter(m => m.content)
    .slice(-24)
}

export function buildStoryboardChatContextBlock(episodeId: number, scriptOverride?: string): string {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const script = String(scriptOverride || ep.scriptContent || ep.content || '').trim()
  const orderedStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()

  const lines: string[] = [
    ep.title ? `本集：${ep.title}` : '',
    `集序号：第 ${ep.episodeNumber} 集`,
  ].filter(Boolean)

  const motionComic = isMotionComicMode(resolveEpisodeProductionMode(episodeId))

  if (script) {
    const { title, body } = parseNarrationScript(script)
    const charCount = script.replace(/\s/g, '').length
    lines.push('', `【${motionComic ? '漫剧旁白稿' : '解说稿'}】约 ${charCount} 字`)
    if (title) lines.push(`片头：${title.slice(0, 120)}${title.length > 120 ? '…' : ''}`)
    const bodyPreview = body.trim().slice(0, 400)
    if (bodyPreview) {
      lines.push(`正文节选：${bodyPreview}${body.length > 400 ? '…' : ''}`)
    }
  } else {
    lines.push('', `【${motionComic ? '漫剧旁白稿' : '解说稿'}】尚未填写，执行分镜前需先有完整${motionComic ? '旁白稿' : '解说稿'}。`)
  }

  if (orderedStoryboards.length) {
    lines.push('', `【已有镜头】${orderedStoryboards.length} 镜`)
    orderedStoryboards.slice(0, 12).forEach((sb, index) => {
      const num = sb.storyboardNumber ?? index + 1
      const meta = parseNarrationImageMeta(sb.referenceImages)
      const text = storyboardNarrationSentence(sb).slice(0, 80)
      const tag = meta.narration_shot_type === 'title' ? '片头' : (motionComic ? '台词' : '旁白')
      lines.push(`#${String(num).padStart(2, '0')} [${tag}] ${text}`)
    })
    if (orderedStoryboards.length > 12) {
      lines.push(`… 另有 ${orderedStoryboards.length - 12} 镜`)
    }
  } else {
    lines.push('', '【已有镜头】无，待拆镜')
  }

  return lines.join('\n')
}
