import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import {
  findYouthBaseCharacter,
  formatCharacterDisplayName,
  getEpisodeVisualCharacters,
  getVariantAgeGroup,
} from './narration-characters.js'
import {
  formatNovelBibleCharacterBriefForLlm,
  formatNovelBibleForLlm,
} from '../constants/novel-bible.js'

function splitScriptLines(text: string): string[] {
  return String(text || '')
    .split(/\n+/)
    .flatMap(block => block.split(/(?<=[。！？；.!?])\s*/))
    .map(s => s.trim())
    .filter(Boolean)
}

export function extractCharacterMentions(
  script: string,
  name: string,
  options?: { role?: string | null; storyboardSnippets?: string[] },
  maxChars = 2200,
): string {
  const trimmedName = String(name || '').trim()
  if (!script.trim()) return ''
  if (!trimmedName) return script.trim().slice(0, maxChars)

  const lines = splitScriptLines(script)
  const direct = lines.filter(line => line.includes(trimmedName))
  if (direct.length >= 2) return direct.join('\n').slice(0, maxChars)

  const firstPerson = /(^|\n)\s*你[\s，,。.]|(^|\n)\s*我[\s，,。.]/.test(script)
    || /男主|女主|主人公/.test(String(options?.role || ''))
  if (direct.length <= 1 && firstPerson) {
    const opening = script.trim().slice(0, 1500)
    const sbHints = (options?.storyboardSnippets || []).slice(0, 5).join('\n')
    return [opening, sbHints].filter(Boolean).join('\n\n').slice(0, maxChars)
  }

  if (direct.length) return direct.join('\n').slice(0, maxChars)
  return script.trim().slice(0, Math.min(maxChars, 1200))
}

function summarizeAppearanceIdentity(appearance: string): string {
  const raw = String(appearance || '').replace(/\bEnglish tags:[\s\S]*$/i, '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const face = raw.match(/(?:脸型|下颌|面相|鹅蛋|棱角|国字|方正|长脸|圆脸)[^，,；;。]{0,18}/)?.[0]
  const hair = raw.match(/(?:发型|短发|长发|碎发|寸头|中分|侧分|束发|卷发|刘海|发色|黑发|白发)[^，,；;。]{0,22}/)?.[0]
  const browEye = raw.match(/(?:剑眉|浓眉|细眉|一字眉|眉|细长眼|圆大|丹凤|深褐眼|黑瞳)[^，,；;。]{0,18}/)?.[0]
  const outfit = raw.match(/#[0-9A-Fa-f]{3,8}[^，,；;。]{0,20}/)?.[0]
  const bits = [face, browEye, hair, outfit].filter(Boolean)
  if (bits.length) return bits.join('·').slice(0, 72)
  return raw.slice(0, 56)
}

export function buildCharacterAppearanceContext(params: {
  characterId: number
  characterName: string
  characterVariantLabel?: string | null
  characterRole?: string | null
  episodeId?: number
  dramaId: number
  script?: string
}) {
  const {
    characterId,
    characterName,
    characterVariantLabel,
    characterRole,
    episodeId,
    dramaId,
    script = '',
  } = params
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

  const mentionExcerpt = extractCharacterMentions(episodeScript, characterName, {
    role: characterRole,
    storyboardSnippets: [],
  }, 1200)

  const storyboardSnippets: string[] = []
  if (episodeId) {
    const storyboards = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId)).all()
      .filter(sb => !sb.deletedAt)
      .sort((a, b) => (a.storyboardNumber || 0) - (b.storyboardNumber || 0))

    const links = db.select().from(schema.storyboardCharacters).all()
    for (const sb of storyboards) {
      const linked = links.some(l => l.storyboardId === sb.id && l.characterId === characterId)
      // 定妆外貌不需要配图文案（image_prompt 很长且易撑爆 4k 上下文）
      const text = [sb.dialogue, sb.description, sb.title, sb.action].filter(Boolean).join(' ')
      const mentioned = text.includes(characterName)
      if (!linked && !mentioned) continue

      storyboardSnippets.push([
        `#${sb.storyboardNumber || '?'}`,
        sb.title,
        sb.location ? `地点:${sb.location}` : '',
        sb.dialogue ? `旁白:${String(sb.dialogue).slice(0, 80)}` : '',
        sb.description ? `画面:${String(sb.description).slice(0, 80)}` : '',
        sb.action ? `动作:${String(sb.action).slice(0, 40)}` : '',
      ].filter(Boolean).join(' | '))
      if (storyboardSnippets.length >= 5) break
    }
  }

  const resolvedMentionExcerpt = mentionExcerpt.length < 160
    ? extractCharacterMentions(episodeScript, characterName, {
      role: characterRole,
      storyboardSnippets,
    }, 1200)
    : mentionExcerpt

  const otherChars = episodeId
    ? getEpisodeVisualCharacters(episodeId, dramaId).filter(ch => ch.id !== characterId)
    : db.select().from(schema.characters).all()
      .filter(ch => ch.dramaId === dramaId && !ch.deletedAt && ch.id !== characterId)
      .slice(0, 6)
      .map(ch => ({ id: ch.id, name: ch.name, appearance: ch.appearance }))

  const targetGroup = getVariantAgeGroup(characterVariantLabel)
  const youthSibling = (targetGroup === 'middle' || targetGroup === 'elder')
    ? findYouthBaseCharacter(dramaId, characterName, characterId)
    : null

  return {
    dramaTitle: drama?.title || '',
    dramaGenre: drama?.genre || '',
    dramaStyle: drama?.style || 'comic',
    episodeTitle,
    mentionExcerpt: resolvedMentionExcerpt.slice(0, 1200),
    storyboardSnippets: storyboardSnippets.slice(0, 5),
    otherCharacters: otherChars.slice(0, 5).map(ch => {
      const app = ('appearance' in ch ? ch.appearance : (ch as { appearance?: string }).appearance) || ''
      const identity = summarizeAppearanceIdentity(String(app))
      return identity ? `${ch.name}：${identity}` : ch.name
    }),
    portraitYouthReference: youthSibling?.appearance?.trim()
      ? {
        variantLabel: youthSibling.variantLabel,
        displayName: formatCharacterDisplayName(youthSibling),
        appearance: String(youthSibling.appearance).trim().slice(0, 360),
      }
      : null,
    novelBibleBlock: formatNovelBibleForLlm(drama?.metadata, { forAppearance: true }),
    novelBibleCharacterBrief: formatNovelBibleCharacterBriefForLlm(drama?.metadata, characterName),
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
