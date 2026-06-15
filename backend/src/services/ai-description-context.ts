import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getEpisodeVisualCharacters } from './narration-characters.js'

function splitScriptLines(text: string): string[] {
  return String(text || '')
    .split(/\n+/)
    .flatMap(block => block.split(/(?<=[。！？；.!?])\s*/))
    .map(s => s.trim())
    .filter(Boolean)
}

export function extractCharacterMentions(script: string, name: string, maxChars = 2200): string {
  const trimmedName = String(name || '').trim()
  if (!trimmedName || !script.trim()) return script.trim().slice(0, maxChars)

  const lines = splitScriptLines(script)
  const direct = lines.filter(line => line.includes(trimmedName))
  if (direct.length) return direct.join('\n').slice(0, maxChars)

  // 单字名容易误匹配，退回较短摘录
  return script.trim().slice(0, Math.min(maxChars, 1200))
}

export function buildCharacterAppearanceContext(params: {
  characterId: number
  characterName: string
  episodeId?: number
  dramaId: number
  script?: string
}) {
  const { characterId, characterName, episodeId, dramaId, script = '' } = params
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()

  let episodeScript = script
  let episodeTitle = ''
  if (episodeId) {
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    if (ep) {
      episodeTitle = ep.title || ''
      episodeScript = episodeScript || String(ep.scriptContent || ep.content || '').trim()
    }
  }

  const mentionExcerpt = extractCharacterMentions(episodeScript, characterName)
  const otherChars = episodeId
    ? getEpisodeVisualCharacters(episodeId, dramaId).filter(ch => ch.id !== characterId)
    : db.select().from(schema.characters).all()
      .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && ch.id !== characterId)
      .slice(0, 6)
      .map(ch => ({ id: ch.id, name: ch.name, appearance: ch.appearance }))

  const storyboardSnippets: string[] = []
  if (episodeId) {
    const storyboards = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId)).all()
      .filter(sb => !sb.deletedAt)
      .sort((a, b) => (a.storyboardNumber || 0) - (b.storyboardNumber || 0))

    const links = db.select().from(schema.storyboardCharacters).all()
    for (const sb of storyboards) {
      const linked = links.some(l => l.storyboardId === sb.id && l.characterId === characterId)
      const text = [sb.dialogue, sb.description, sb.title, sb.imagePrompt, sb.action].filter(Boolean).join(' ')
      const mentioned = text.includes(characterName)
      if (!linked && !mentioned) continue

      storyboardSnippets.push([
        `#${sb.storyboardNumber || '?'}`,
        sb.title,
        sb.location ? `地点:${sb.location}` : '',
        sb.atmosphere ? `氛围:${sb.atmosphere}` : '',
        sb.dialogue ? `旁白/对白:${String(sb.dialogue).slice(0, 200)}` : '',
        sb.description ? `画面:${String(sb.description).slice(0, 160)}` : '',
        sb.imagePrompt ? `配图:${String(sb.imagePrompt).slice(0, 160)}` : '',
      ].filter(Boolean).join(' | '))
    }
  }

  return {
    dramaTitle: drama?.title || '',
    dramaGenre: drama?.genre || '',
    dramaStyle: drama?.style || 'comic',
    episodeTitle,
    mentionExcerpt,
    storyboardSnippets: storyboardSnippets.slice(0, 8),
    otherCharacters: otherChars.map(ch => {
      const app = ('appearance' in ch ? ch.appearance : (ch as { appearance?: string }).appearance) || ''
      return app ? `${ch.name}（${String(app).slice(0, 60)}）` : ch.name
    }),
    hasScript: !!episodeScript.trim(),
  }
}

function formatStoryboardSnippet(sb: typeof schema.storyboards.$inferSelect, label?: string) {
  return [
    label || `#${sb.storyboardNumber || '?'}`,
    sb.title,
    sb.location ? `地点:${sb.location}` : '',
    sb.time ? `时间:${sb.time}` : '',
    sb.atmosphere ? `氛围:${sb.atmosphere}` : '',
    sb.action ? `动作:${String(sb.action).slice(0, 120)}` : '',
    sb.dialogue ? `旁白:${String(sb.dialogue).slice(0, 280)}` : '',
    sb.description ? `画面:${String(sb.description).slice(0, 180)}` : '',
    sb.imagePrompt ? `配图:${String(sb.imagePrompt).slice(0, 160)}` : '',
    sb.bgmPrompt ? `已有BGM意向:${String(sb.bgmPrompt).slice(0, 100)}` : '',
  ].filter(Boolean).join(' | ')
}

export function buildBgmDescriptionContext(params: {
  episodeId?: number
  storyboardId?: number
  content?: string
}) {
  const { episodeId, storyboardId, content = '' } = params

  let episodeScript = content
  let episodeTitle = ''
  let dramaTitle = ''
  let dramaGenre = ''
  let dramaStyle = ''

  if (episodeId) {
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    if (ep) {
      episodeTitle = ep.title || ''
      episodeScript = episodeScript || String(ep.scriptContent || ep.content || '').trim()
      const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
      dramaTitle = drama?.title || ''
      dramaGenre = drama?.genre || ''
      dramaStyle = drama?.style || ''
    }
  }

  const storyboards = episodeId
    ? db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
      .filter(sb => !sb.deletedAt)
      .sort((a, b) => (a.storyboardNumber || 0) - (b.storyboardNumber || 0))
    : []

  let focusShot: typeof schema.storyboards.$inferSelect | undefined
  let prevShot: typeof schema.storyboards.$inferSelect | undefined
  let nextShot: typeof schema.storyboards.$inferSelect | undefined

  if (storyboardId) {
    const idx = storyboards.findIndex(sb => sb.id === storyboardId)
    if (idx >= 0) {
      focusShot = storyboards[idx]
      prevShot = idx > 0 ? storyboards[idx - 1] : undefined
      nextShot = idx < storyboards.length - 1 ? storyboards[idx + 1] : undefined
    }
  }

  const episodeMoodSamples = storyboards.slice(0, 12).map(sb =>
    formatStoryboardSnippet(sb).slice(0, 220),
  )

  return {
    dramaTitle,
    dramaGenre,
    dramaStyle,
    episodeTitle,
    episodeScriptExcerpt: episodeScript.slice(0, 3500),
    focusShot: focusShot ? formatStoryboardSnippet(focusShot, '【目标镜头】') : '',
    prevShot: prevShot ? formatStoryboardSnippet(prevShot, '【上一镜头】') : '',
    nextShot: nextShot ? formatStoryboardSnippet(nextShot, '【下一镜头】') : '',
    episodeMoodSamples,
    shotCount: storyboards.length,
    scope: focusShot ? 'shot' as const : 'episode' as const,
    hasContent: !!(episodeScript.trim() || focusShot || episodeMoodSamples.length),
  }
}
