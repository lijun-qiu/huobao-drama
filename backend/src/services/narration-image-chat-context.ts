/**
 * 配图检测 / 配图文案 — 聊天上下文（镜头列表 + 当前检测/文案状态）
 */
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { parseNarrationImageMeta } from './narration-image.js'

function storyboardNarrationSentence(sb: {
  description?: string | null
  dialogue?: string | null
}): string {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^(旁白|剧中)[：:]\s*/, '')
}

export type NarrationImageChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export function sanitizeImageChatTurns(messages: NarrationImageChatTurn[]): NarrationImageChatTurn[] {
  return (messages || [])
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(m.content || '').trim(),
    }))
    .filter(m => m.content)
    .slice(-24)
}

export function loadNarrationImageChatStoryboards(episodeId: number) {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('集不存在')

  const orderedStoryboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
  if (!orderedStoryboards.length) throw new Error('请先完成旁白分镜')

  return { ep, orderedStoryboards }
}

export function buildDetectChatContextBlock(episodeId: number): string {
  const { ep, orderedStoryboards } = loadNarrationImageChatStoryboards(episodeId)
  const lines: string[] = [
    ep.title ? `本集：${ep.title}` : '',
    `共 ${orderedStoryboards.length} 镜`,
    '',
    '【镜头列表】',
  ].filter(Boolean)

  orderedStoryboards.forEach((sb, index) => {
    const num = sb.storyboardNumber ?? index + 1
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const text = storyboardNarrationSentence(sb).slice(0, 120)
    const flags: string[] = []
    if (meta.narration_shot_type === 'title') flags.push('片头')
    if (meta.narration_image_mode === 'new') {
      flags.push(`需配图#${meta.paragraph_index ?? '?'}`)
      if (meta.paragraph_layout === 'diptych') flags.push('两宫格')
    } else if (meta.narration_image_mode === 'inherit') {
      flags.push('沿用配图')
    }
    const flagStr = flags.length ? ` [${flags.join(' · ')}]` : ''
    lines.push(`#${String(num).padStart(2, '0')} ${text}${flagStr}`)
  })

  const anchorCount = orderedStoryboards.filter(
    sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new',
  ).length
  lines.push('', `【当前状态】已标记需配图 ${anchorCount} 张`)
  return lines.join('\n')
}

export function buildPromptChatContextBlock(episodeId: number): string {
  const { ep, orderedStoryboards } = loadNarrationImageChatStoryboards(episodeId)
  const anchors = orderedStoryboards
    .map((sb, index) => ({ sb, index, meta: parseNarrationImageMeta(sb.referenceImages) }))
    .filter(({ meta }) => meta.narration_image_mode === 'new')

  if (!anchors.length) {
    return [
      ep.title ? `本集：${ep.title}` : '',
      '【当前状态】尚未检测配图，请先执行换镜检测。',
    ].filter(Boolean).join('\n')
  }

  const lines: string[] = [
    ep.title ? `本集：${ep.title}` : '',
    `需配图 ${anchors.length} 张`,
    '',
    '【配图段落与文案】',
  ].filter(Boolean)

  anchors.forEach(({ sb, meta }) => {
    const num = sb.storyboardNumber ?? 0
    const scene = String(meta.scene_content || '').slice(0, 80)
    const prompt = String(sb.imagePrompt || meta.image_prompt_llm_raw || '').trim()
    const promptPreview = prompt ? prompt.slice(0, 160) + (prompt.length > 160 ? '…' : '') : '（未生成）'
    lines.push(
      `#${String(num).padStart(2, '0')} 段${meta.paragraph_index ?? '?'}${meta.paragraph_layout === 'diptych' ? '·两宫格' : ''}`,
      `  场景：${scene || '—'}`,
      `  文案：${promptPreview}`,
    )
  })

  const readyCount = anchors.filter(({ sb, meta }) =>
    String(sb.imagePrompt || meta.image_prompt_llm_raw || '').trim(),
  ).length
  lines.push('', `【当前状态】配图文案 ${readyCount}/${anchors.length} 条已就绪`)
  return lines.join('\n')
}
