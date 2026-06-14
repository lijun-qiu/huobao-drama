import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateVoiceSample } from '../services/tts-generation.js'
import { generateImage } from '../services/image-generation.js'
import { resolveEpisodeImageModel } from '../constants/image-models.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const existing = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
    .find(row => row.characterId === characterId)
  if (!existing) {
    db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: now() }).run()
  }
}

function findDramaNarrator(dramaId: number) {
  return db.select().from(schema.characters).all()
    .find(c => c.dramaId === dramaId && !c.deletedAt && (c.name === '旁白' || c.role === '旁白'))
}

// POST /characters
app.post('/', async (c) => {
  const body = await c.req.json()
  const dramaId = Number(body.drama_id || body.dramaId)
  const name = String(body.name || '').trim()
  if (!dramaId || !name) return badRequest(c, 'drama_id and name are required')

  const ts = now()
  const episodeId = Number(body.episode_id || body.episodeId || 0)

  if (name === '旁白') {
    const existing = findDramaNarrator(dramaId)
    if (existing) {
      const updates: Record<string, any> = { updatedAt: ts }
      const voiceStyle = body.voice_style || body.voiceStyle
      const voiceProvider = body.voice_provider || body.voiceProvider
      if (voiceStyle) updates.voiceStyle = voiceStyle
      if (voiceProvider) updates.voiceProvider = voiceProvider
      if (Object.keys(updates).length > 1) {
        db.update(schema.characters).set(updates).where(eq(schema.characters.id, existing.id)).run()
      }
      if (episodeId) linkCharacterToEpisode(episodeId, existing.id)
      const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, existing.id)).all()
      return success(c, toSnakeCase(row))
    }
  }

  const res = db.insert(schema.characters).values({
    dramaId,
    name,
    role: body.role || '旁白',
    description: body.description || '',
    appearance: body.appearance || '',
    personality: body.personality || '',
    voiceStyle: body.voice_style || body.voiceStyle || null,
    voiceProvider: body.voice_provider || body.voiceProvider || null,
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const characterId = Number(res.lastInsertRowid)
  if (episodeId) linkCharacterToEpisode(episodeId, characterId)

  const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  return success(c, toSnakeCase(row))
})

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!existing || existing.deletedAt) return badRequest(c, '角色不存在')
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'personality', 'voiceStyle', 'voiceProvider', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  if ('voice_style' in body || 'voiceStyle' in body) {
    updates.voiceSampleUrl = null
  }
  db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
  const [row] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  return success(c, toSnakeCase(row))
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// POST /characters/:id/generate-voice-sample — 生成角色音色试听
app.post('/:id/generate-voice-sample', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!char.voiceStyle) return badRequest(c, '请先分配音色')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    logTaskStart('VoiceSample', 'generate', { characterId: id, characterName: char.name, episodeId: ep.id, voice: char.voiceStyle })
    const audioPath = await generateVoiceSample(char.name, char.voiceStyle, ep.audioConfigId ?? undefined)
    db.update(schema.characters)
      .set({ voiceSampleUrl: audioPath, updatedAt: now() })
      .where(eq(schema.characters.id, id)).run()
    logTaskSuccess('VoiceSample', 'generate', { characterId: id, path: audioPath })
    return success(c, { voice_sample_url: audioPath })
  } catch (err: any) {
    logTaskError('VoiceSample', 'generate', { characterId: id, error: err.message })
    return badRequest(c, `TTS 生成失败: ${err.message}`)
  }
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  const prompt = `${char.name}, ${char.appearance || char.description || '人物立绘'}, 高质量, 正面, 白色背景`
  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId })
    const genId = await generateImage({
      characterId: id,
      dramaId: char.dramaId,
      prompt,
      model: resolveEpisodeImageModel(ep),
      configId: ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const results: number[] = []
  for (const cid of ids) {
    const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, cid)).all()
    if (!char) continue
    const prompt = `${char.name}, ${char.appearance || char.description || '人物立绘'}, 高质量, 正面, 白色背景`
    try {
      const genId = await generateImage({
        characterId: cid,
        dramaId: char.dramaId,
        prompt,
        model: resolveEpisodeImageModel(ep),
        configId: ep.imageConfigId ?? undefined,
      })
      results.push(genId)
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app
