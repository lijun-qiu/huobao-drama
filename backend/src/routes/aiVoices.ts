/**
 * AI 音色管理
 * GET  /api/v1/ai-voices       - 获取音色列表
 * POST /api/v1/ai-voices/sync  - 从 MiniMax 同步音色
 */
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { EDGE_VOICE_OPTIONS, resolveEdgeVoice } from '../services/edge-tts-local.js'
import {
  checkGptSovitsHealth,
  deleteGptSovitsVoice,
  getGptSovitsConfigSummary,
  listGptSovitsVoices,
  saveGptSovitsRefAudio,
  toGptSovitsVoiceRef,
  upsertGptSovitsVoice,
} from '../services/gpt-sovits-tts.js'
import { checkVoiceboxHealth, listVoiceboxVoiceOptions, resolveVoiceboxProfileId } from '../services/voicebox-tts.js'
import { checkIndexTtsHealth, getIndexTtsConfigSummary } from '../services/index-tts-tts.js'
import { generateTTS } from '../services/tts-generation.js'
import { resolveTtsSpeed } from '../utils/tts-speed.js'
import { resolveVoiceboxInstruct } from '../utils/voicebox-instruct.js'
import { resolveVoiceboxModelSize } from '../utils/voicebox-model-size.js'
import { DEFAULT_CLONED_TTS_VOICE, DEFAULT_LOCAL_TTS_ENGINE } from '../constants/local-comic.js'
import { listLocalCastVoiceCandidates } from '../services/local-voice-assign.js'

const DEFAULT_LOCAL_TTS_PREVIEW_TEXT = '这是一段旁白试听，用于感受当前音色、语速和感情效果。'

const app = new Hono()

// GET /ai-voices/voicebox/health
app.get('/voicebox/health', async (c) => {
  const health = await checkVoiceboxHealth()
  return success(c, health)
})

// GET /ai-voices/gptsovits/health
app.get('/gptsovits/health', async (c) => {
  const health = await checkGptSovitsHealth()
  return success(c, { ...health, ...getGptSovitsConfigSummary() })
})

// GET /ai-voices/indextts/health
app.get('/indextts/health', async (c) => {
  const health = await checkIndexTtsHealth({ force: true })
  return success(c, { ...health, ...getIndexTtsConfigSummary() })
})

// GET /ai-voices/gptsovits/config
app.get('/gptsovits/config', async (c) => {
  return success(c, getGptSovitsConfigSummary())
})

// GET /ai-voices/gptsovits/voices — 本地音色库（不依赖 GPT-SoVITS 服务在线）
app.get('/gptsovits/voices', async (c) => {
  const voices = await listGptSovitsVoices()
  return success(c, {
    voices: voices.map(v => ({
      voice_id: toGptSovitsVoiceRef(v.voice_id),
      voice_name: v.voice_name,
      description: v.description || [],
      language: v.language || '中文',
      provider: 'gptsovits',
      prompt_text: v.prompt_text || '',
      ref_audio_path: v.ref_audio_path,
    })),
    voice_count: voices.length,
  })
})

// POST /ai-voices/gptsovits/voices — 新增或更新音色
app.post('/gptsovits/voices', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  try {
    const voice = await upsertGptSovitsVoice({
      voice_id: String(body.voice_id || body.voiceId || '').trim(),
      voice_name: String(body.voice_name || body.voiceName || '').trim(),
      ref_audio_path: String(body.ref_audio_path || body.refAudioPath || '').trim(),
      prompt_text: String(body.prompt_text || body.promptText || '').trim(),
      prompt_lang: String(body.prompt_lang || body.promptLang || 'zh').trim(),
      language: String(body.language || '中文').trim(),
      description: Array.isArray(body.description) ? body.description as string[] : [],
      gpt_weights: body.gpt_weights ? String(body.gpt_weights) : body.gptWeights ? String(body.gptWeights) : undefined,
      sovits_weights: body.sovits_weights ? String(body.sovits_weights) : body.sovitsWeights ? String(body.sovitsWeights) : undefined,
      text_split_method: body.text_split_method ? String(body.text_split_method) : body.textSplitMethod ? String(body.textSplitMethod) : undefined,
    })
    return success(c, {
      ...voice,
      voice_id: toGptSovitsVoiceRef(voice.voice_id),
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// DELETE /ai-voices/gptsovits/voices/:id
app.delete('/gptsovits/voices/:id', async (c) => {
  const id = c.req.param('id')
  const ok = await deleteGptSovitsVoice(id)
  if (!ok) return badRequest(c, '音色不存在')
  return success(c, { deleted: true, voice_id: id })
})

// POST /ai-voices/gptsovits/upload-ref — 上传参考音频
app.post('/gptsovits/upload-ref', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const absPath = await saveGptSovitsRefAudio(buffer, file.name || 'ref.wav')
    return success(c, { ref_audio_path: absPath, file_name: file.name })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// GET /ai-voices/local-cast — Kokoro + Edge 本地选角音色池
app.get('/local-cast', async (c) => {
  const modelSize = resolveVoiceboxModelSize(c.req.query('model_size') || c.req.query('modelSize'))
  const voices = await listLocalCastVoiceCandidates(modelSize)
  return success(c, {
    kokoro_count: voices.filter(v => v.source === 'kokoro').length,
    cloned_count: voices.filter(v => v.source === 'cloned').length,
    edge_count: voices.filter(v => v.source === 'edge').length,
    voices: voices.map(v => ({
      voice_id: v.voice_id,
      voice_name: v.voice_name,
      provider: v.provider,
      source: v.source,
      gender: v.gender,
    })),
  })
})

// GET /ai-voices?provider=minimax|edge|voicebox
app.get('/', async (c) => {
  const provider = c.req.query('provider') || 'minimax'
  if (provider === 'voicebox') {
    const health = await checkVoiceboxHealth()
    if (!health.ok) {
      return badRequest(c, health.error || 'Voicebox 未运行，请先启动 Voicebox（默认端口 17493）')
    }
    const modelSize = resolveVoiceboxModelSize(c.req.query('model_size') || c.req.query('modelSize'))
    try {
      const profiles = await listVoiceboxVoiceOptions(modelSize)
      return success(c, profiles.map(p => ({
        voice_id: p.voice_id,
        voice_name: p.voice_name,
        description: p.description,
        language: p.language,
        provider: 'voicebox',
        voice_type: p.voice_type,
        sample_count: p.sample_count ?? 0,
        preset_engine: p.preset_engine,
        supports_instruct: p.supports_instruct,
        model_ready: p.model_ready,
        model_hint: p.model_hint,
      })))
    } catch (err: any) {
      return badRequest(c, err.message)
    }
  }
  if (provider === 'gptsovits') {
    const voices = await listGptSovitsVoices()
    return success(c, voices.map(v => ({
      voice_id: toGptSovitsVoiceRef(v.voice_id),
      voice_name: v.voice_name,
      description: v.description || [],
      language: v.language || '中文',
      provider: 'gptsovits',
      prompt_text: v.prompt_text || '',
      ref_audio_path: v.ref_audio_path,
    })))
  }
  if (provider === 'edge') {
    return success(c, EDGE_VOICE_OPTIONS.map(v => ({
      voice_id: v.voice_id,
      voice_name: v.voice_name,
      description: [],
      language: v.language,
      provider: 'edge',
    })))
  }
  const rows = db.select().from(schema.aiVoices)
    .where(eq(schema.aiVoices.provider, provider))
    .all()

  const parsed = rows.map(r => ({
    voice_id: r.voiceId,
    voice_name: r.voiceName,
    description: r.description ? JSON.parse(r.description) : [],
    language: r.language,
    provider: r.provider,
  }))

  return success(c, parsed)
})

function resolvePreviewUsesLocalTts(body: Record<string, unknown>): boolean {
  if (body?.local_tts === false || body?.localTts === false) return false
  if (body?.local_tts === true || body?.localTts === true) return true
  if (body?.local_tts_engine != null || body?.localTtsEngine != null) return true
  if (body?.local_voice != null || body?.localVoice != null) return true
  if (body?.voice_id != null || body?.voiceId != null) return false
  return true
}

// POST /ai-voices/preview — 本地 / API TTS 试听与文案试配
app.post('/preview', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const text = String(body?.text || DEFAULT_LOCAL_TTS_PREVIEW_TEXT).trim()
  if (!text) return badRequest(c, '配音文本为空')

  const speedRaw = body?.tts_speed ?? body?.ttsSpeed
  const ttsSpeed = resolveTtsSpeed(typeof speedRaw === 'number' || typeof speedRaw === 'string' ? speedRaw : undefined)
  const isLocal = resolvePreviewUsesLocalTts(body)

  let voice = ''
  let localTtsEngine: 'edge' | 'voicebox' | 'gptsovits' | 'indextts' = DEFAULT_LOCAL_TTS_ENGINE
  let voiceboxInstruct: string | undefined
  let voiceboxModelSize: ReturnType<typeof resolveVoiceboxModelSize> | undefined

  if (isLocal) {
    const engineRaw = String(body?.local_tts_engine ?? body?.localTtsEngine ?? DEFAULT_LOCAL_TTS_ENGINE).trim().toLowerCase()
    if (engineRaw === 'indextts') {
      localTtsEngine = 'indextts'
    } else if (engineRaw === 'gptsovits') {
      localTtsEngine = 'gptsovits'
    } else if (engineRaw === 'voicebox') {
      localTtsEngine = 'voicebox'
    } else if (engineRaw === 'edge') {
      localTtsEngine = 'edge'
    }
    const localVoiceRaw = String(body?.local_voice || body?.localVoice || '').trim()
    const localVoice = localVoiceRaw
      || ((localTtsEngine === 'gptsovits' || localTtsEngine === 'indextts') ? DEFAULT_CLONED_TTS_VOICE : '')
    if (!localVoice) return badRequest(c, '请选择音色')

    if (localTtsEngine === 'voicebox') {
      const health = await checkVoiceboxHealth()
      if (!health.ok) {
        return badRequest(c, health.error || 'Voicebox 未运行，请先启动 Voicebox')
      }
    }
    if (localTtsEngine === 'gptsovits') {
      const health = await checkGptSovitsHealth()
      if (!health.ok) {
        return badRequest(c, health.error || 'GPT-SoVITS 未运行，请先启动 api_v2.py')
      }
    }
    if (localTtsEngine === 'indextts') {
      const health = await checkIndexTtsHealth({ force: true })
      if (!health.ok) {
        return badRequest(c, health.error || 'IndexTTS2 未就绪，请运行 scripts/setup-index-tts.ps1')
      }
    }

    voiceboxInstruct = (localTtsEngine === 'voicebox' || localTtsEngine === 'indextts')
      ? resolveVoiceboxInstruct(String(body?.voicebox_instruct ?? body?.voiceboxInstruct ?? body?.tts_instruct ?? body?.ttsInstruct ?? ''))
      : undefined
    voiceboxModelSize = localTtsEngine === 'voicebox'
      ? resolveVoiceboxModelSize(String(body?.voicebox_model_size ?? body?.voiceboxModelSize ?? ''))
      : undefined

    voice = localTtsEngine === 'voicebox'
      ? await resolveVoiceboxProfileId(localVoice)
      : (localTtsEngine === 'gptsovits' || localTtsEngine === 'indextts')
        ? localVoice
        : resolveEdgeVoice(localVoice)
  } else {
    voice = String(body?.voice_id || body?.voiceId || 'alloy').trim()
    if (!voice) return badRequest(c, '请选择音色')
  }

  const configIdRaw = body?.config_id ?? body?.configId
  const configId = configIdRaw != null && Number.isFinite(Number(configIdRaw)) ? Number(configIdRaw) : null

  try {
    const audioPath = await generateTTS({
      text,
      voice,
      speed: ttsSpeed,
      configId,
      localTts: isLocal,
      localTtsEngine: isLocal ? localTtsEngine : undefined,
      voiceboxInstruct,
      voiceboxModelSize,
    })
    return success(c, {
      audio_url: audioPath,
      text,
      local_tts: isLocal,
      local_tts_engine: isLocal ? localTtsEngine : undefined,
      voice_id: voice,
      tts_speed: ttsSpeed,
      voicebox_instruct: voiceboxInstruct,
      voicebox_model_size: voiceboxModelSize,
    })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /ai-voices/sync
app.post('/sync', async (c) => {
  // 从数据库获取 minimax 的音频配置
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'audio'))
    .all()
    .filter(r => r.isActive && r.provider === 'minimax')

  if (rows.length === 0) {
    return badRequest(c, 'No active minimax audio config found')
  }

  const config = rows[0]
  if (!config.apiKey) {
    return badRequest(c, 'MiniMax API key not configured')
  }

  // 调用 MiniMax get_voice API
  const resp = await fetch(joinProviderUrl(config.baseUrl, '/v1', '/get_voice'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ voice_type: 'all' }),
  })

  if (!resp.ok) {
    return badRequest(c, `MiniMax API error: ${resp.status}`)
  }

  const result = await resp.json() as any
  if (result.base_resp?.status_code !== 0) {
    return badRequest(c, result.base_resp?.status_msg || 'Failed to fetch voices')
  }

  const voices = (result.system_voice || []).filter((v: any) => shouldKeepVoice(v))
  const ts = now()

  // 先清空旧数据
  db.delete(schema.aiVoices).where(eq(schema.aiVoices.provider, 'minimax')).run()

  // 批量插入新数据
  const insertRows = voices.map((v: any) => ({
    voiceId: v.voice_id,
    voiceName: v.voice_name,
    description: JSON.stringify(v.description || []),
    language: extractLanguage(v.voice_id, v.voice_name),
    provider: 'minimax',
    createdAt: ts,
  }))

  if (insertRows.length > 0) {
    db.insert(schema.aiVoices).values(insertRows).run()
  }

  return success(c, { count: insertRows.length, message: `Synced ${insertRows.length} voices` })
})

/**
 * 从 voice_id 或 voice_name 推断语言
 */
function extractLanguage(voiceId: string, voiceName: string): string {
  const text = `${voiceId} ${voiceName}`.toLowerCase()
  if (text.includes('cantonese') || text.includes('粤')) return '粤语'
  if (text.includes('english') || text.includes('aussie')) return '英语'
  if (text.includes('japanese') || text.includes('日语')) return '日语'
  if (text.includes('korean') || text.includes('韩')) return '韩语'
  if (text.includes('spanish')) return '西班牙语'
  if (text.includes('portuguese')) return '葡萄牙语'
  if (text.includes('french')) return '法语'
  if (text.includes('indonesian')) return '印尼语'
  if (text.includes('german')) return '德语'
  if (text.includes('russian')) return '俄语'
  if (text.includes('italian')) return '意大利语'
  if (text.includes('arabic')) return '阿拉伯语'
  if (text.includes('turkish')) return '土耳其语'
  if (text.includes('ukrainian')) return '乌克兰语'
  if (text.includes('dutch')) return '荷兰语'
  if (text.includes('vietnamese')) return '越南语'
  if (text.includes('chinese') || text.includes('mandarin') || text.includes('中文')) return '中文'
  return '其他'
}

function shouldKeepVoice(voice: { voice_id: string, voice_name: string }) {
  const language = extractLanguage(voice.voice_id, voice.voice_name)
  if (language !== '中文' && language !== '粤语') return false

  const text = `${voice.voice_id} ${voice.voice_name}`.toLowerCase()

  const excludedPatterns = [
    'jingpin',
    '-beta',
    'cartoon_pig',
    'cute_boy',
    'lovely_girl',
    'clever_boy',
    'robot_armor',
    'news_anchor',
    'male_announcer',
    'radio_host',
    'hk_flight_attendant',
  ]

  return !excludedPatterns.some(pattern => text.includes(pattern))
}

export default app
