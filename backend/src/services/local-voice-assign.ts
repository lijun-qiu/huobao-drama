import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { EDGE_VOICE_OPTIONS } from './edge-tts-local.js'
import { parseDialogueForTTS } from './narration-tts.js'
import { listVoiceboxVoiceOptions } from './voicebox-tts.js'
import { resolveVoiceboxModelSize, type VoiceboxModelSize } from '../utils/voicebox-model-size.js'
import { logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'

export type VoiceGender = 'male' | 'female' | 'neutral'

export type LocalVoiceCandidate = {
  voice_id: string
  voice_name: string
  provider: 'voicebox' | 'edge'
  gender: VoiceGender
  source: 'kokoro' | 'edge'
}

export function inferVoiceGenderFromLabel(label: string): VoiceGender {
  const text = String(label || '').trim()
  if (!text) return 'neutral'
  if (/[女|娘|姐|妹|母|妻|girl|woman|female|xiaoxiao|xiaoyi|晓晓|晓伊|晓北|晓妮|anna|sohee|serena|vivian]/i.test(text)) {
    return 'female'
  }
  if (/[男|爷|爸|兄|弟|boy|man|male|yunxi|yunjian|yunyang|云希|云扬|云健|uncle|dylan|eric|ryan|aiden|fu]/i.test(text)) {
    return 'male'
  }
  return 'neutral'
}

export function inferCharacterGender(char: {
  name?: string | null
  role?: string | null
  appearance?: string | null
  description?: string | null
}): VoiceGender {
  const text = `${char.name || ''} ${char.role || ''} ${char.appearance || ''} ${char.description || ''}`
  if (/旁白|解说|narrator|画外音/i.test(text)) return 'neutral'
  if (/女主|少女|女性|姑娘|师姐|师妹|母亲|娘|妻|女二|女|奶奶|阿姨|少女|御姐/i.test(text)) return 'female'
  if (/男主|少年|男性|男子|师兄|师弟|父亲|爷|爸|兄|男二|男|反派|魔头|宿敌|长老|掌门|boss/i.test(text)) return 'male'
  return 'neutral'
}

function voiceGenderScore(candidate: VoiceGender, target: VoiceGender): number {
  if (candidate === target) return 3
  if (candidate === 'neutral' || target === 'neutral') return 1
  return 0
}

function sortCharactersForVoiceAssign<T extends { name: string; role?: string | null }>(rows: T[]): T[] {
  const priority = (char: T) => {
    const text = `${char.name} ${char.role || ''}`
    if (/旁白|narrator|画外音/i.test(text)) return 0
    if (/主角|男主|女主|主人公/i.test(text)) return 1
    if (/主要配角|反派|宿敌|师父|挚友|恋人|师兄|师姐/i.test(text)) return 2
    return 3
  }
  return [...rows].sort((a, b) => {
    const byPriority = priority(a) - priority(b)
    if (byPriority !== 0) return byPriority
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

export async function listLocalCastVoiceCandidates(modelSize?: VoiceboxModelSize): Promise<LocalVoiceCandidate[]> {
  const preferredSize = resolveVoiceboxModelSize(modelSize)
  const kokoro: LocalVoiceCandidate[] = []
  try {
    const voiceboxRows = await listVoiceboxVoiceOptions(preferredSize)
    for (const row of voiceboxRows) {
      if (row.preset_engine !== 'kokoro') continue
      if (row.model_ready === false) continue
      kokoro.push({
        voice_id: row.voice_id,
        voice_name: row.voice_name,
        provider: 'voicebox',
        gender: inferVoiceGenderFromLabel(row.voice_name),
        source: 'kokoro',
      })
    }
  } catch {
    // Voicebox 未运行时仅使用 Edge
  }

  const edge = EDGE_VOICE_OPTIONS.map(v => ({
    voice_id: v.voice_id,
    voice_name: v.voice_name,
    provider: 'edge' as const,
    gender: inferVoiceGenderFromLabel(v.voice_name),
    source: 'edge' as const,
  }))

  return [...kokoro, ...edge]
}

function pickVoiceFromPool(
  pool: LocalVoiceCandidate[],
  targetGender: VoiceGender,
  usedVoiceIds: Set<string>,
): LocalVoiceCandidate | null {
  const ranked = pool
    .filter(v => !usedVoiceIds.has(v.voice_id))
    .map(v => ({ v, score: voiceGenderScore(v.gender, targetGender) }))
    .sort((a, b) => b.score - a.score || a.v.source.localeCompare(b.v.source))
  return ranked[0]?.v || null
}

function ensureNarratorCharacter(dramaId: number, episodeId?: number) {
  const existing = db.select().from(schema.characters).all()
    .find(c => c.dramaId === dramaId && !c.deletedAt && (c.name === '旁白' || c.role === '旁白'))
  if (existing) return existing

  const needsNarrator = episodeId
    ? db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
      .some(sb => {
        if (sb.deletedAt) return false
        const parsed = parseDialogueForTTS(sb.dialogue)
        return parsed.speaker === '旁白' || parsed.speaker === '剧中'
      })
    : false
  if (!needsNarrator) return null

  const ts = now()
  const res = db.insert(schema.characters).values({
    dramaId,
    name: '旁白',
    role: '旁白',
    description: '过渡叙述与片头叠字',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const id = Number(res.lastInsertRowid)
  return db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()[0] || null
}

export async function assignLocalVoicesToDrama(options: {
  dramaId: number
  episodeId?: number
  modelSize?: VoiceboxModelSize
  overwrite?: boolean
}) {
  const { dramaId, episodeId, overwrite = false } = options
  const candidates = await listLocalCastVoiceCandidates(options.modelSize)
  if (!candidates.length) {
    throw new Error('没有可用的 Kokoro 或 Edge 本地音色，请确认 Voicebox 已启动或 Edge TTS 可用')
  }

  const kokoroPool = candidates.filter(v => v.source === 'kokoro')
  const edgePool = candidates.filter(v => v.source === 'edge')
  const usedVoiceIds = new Set<string>()
  const assignedByName = new Map<string, LocalVoiceCandidate>()
  const ts = now()

  let rows = db.select().from(schema.characters).all()
    .filter(c => c.dramaId === dramaId && !c.deletedAt)

  const narrator = ensureNarratorCharacter(dramaId, episodeId)
  if (narrator && !rows.some(c => c.id === narrator.id)) rows.push(narrator)

  if (episodeId) {
    const speakers = new Set<string>()
    for (const sb of db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()) {
      if (sb.deletedAt) continue
      const parsed = parseDialogueForTTS(sb.dialogue)
      if (parsed.ignorable || !parsed.speaker) continue
      speakers.add(parsed.speaker === '剧中' ? '旁白' : parsed.speaker)
    }
    if (speakers.size) {
      rows = rows.filter(c => speakers.has(c.name))
      if (speakers.has('旁白') && narrator) {
        if (!rows.some(c => c.name === '旁白')) rows.unshift(narrator)
      }
    }
  }

  const uniqueNames = sortCharactersForVoiceAssign(
    Array.from(new Map(rows.map(c => [c.name, c])).values()),
  )

  logTaskProgress('LocalVoiceAssign', 'start', {
    dramaId,
    episodeId,
    characterCount: uniqueNames.length,
    kokoroCount: kokoroPool.length,
    edgeCount: edgePool.length,
  })

  let assigned = 0
  let skipped = 0

  const applyVoiceToName = (name: string, picked: LocalVoiceCandidate) => {
    usedVoiceIds.add(picked.voice_id)
    assignedByName.set(name, picked)
    for (const row of rows.filter(c => c.name === name)) {
      db.update(schema.characters).set({
        voiceStyle: picked.voice_id,
        voiceProvider: picked.provider,
        voiceSampleUrl: null,
        updatedAt: ts,
      }).where(eq(schema.characters.id, row.id)).run()
    }
  }

  for (const char of uniqueNames) {
    if (!overwrite && char.voiceStyle) {
      skipped++
      if (char.voiceStyle) assignedByName.set(char.name, {
        voice_id: char.voiceStyle,
        voice_name: char.voiceStyle,
        provider: char.voiceProvider === 'edge' ? 'edge' : 'voicebox',
        gender: inferCharacterGender(char),
        source: char.voiceProvider === 'edge' ? 'edge' : 'kokoro',
      })
      continue
    }

    const existingForName = assignedByName.get(char.name)
    if (existingForName) {
      applyVoiceToName(char.name, existingForName)
      assigned++
      continue
    }

    const gender = inferCharacterGender(char)
    let picked = pickVoiceFromPool(kokoroPool, gender, usedVoiceIds)
      || pickVoiceFromPool(edgePool, gender, usedVoiceIds)
      || pickVoiceFromPool(kokoroPool, 'neutral', usedVoiceIds)
      || pickVoiceFromPool(edgePool, 'neutral', usedVoiceIds)

    if (!picked) {
      skipped++
      continue
    }

    applyVoiceToName(char.name, picked)
    assigned++
  }

  const refreshed = db.select().from(schema.characters).all()
    .filter(c => c.dramaId === dramaId && !c.deletedAt)

  logTaskSuccess('LocalVoiceAssign', 'done', {
    dramaId,
    assigned,
    skipped,
    kokoroUsed: [...usedVoiceIds].filter(id => id.startsWith('preset:kokoro:')).length,
    edgeUsed: [...usedVoiceIds].filter(id => isEdgeVoiceId(id)).length,
  })

  return {
    assigned,
    skipped,
    kokoro_available: kokoroPool.length,
    edge_available: edgePool.length,
    characters: refreshed,
  }
}

function isEdgeVoiceId(voiceId: string): boolean {
  return /^(zh|en|ja|ko)-/i.test(voiceId)
}
