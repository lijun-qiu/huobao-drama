import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { getLocalModelStatus, prepareLocalModelStage, ensureLocalModelStage, type LocalModelStageOptions } from '../services/local-model-manager.js'
import type { LocalModelStage, LocalTtsEngine } from '../constants/local-comic.js'

const app = new Hono()

const VALID_STAGES = new Set<LocalModelStage>(['idle', 'llm', 'image', 'video', 'audio'])

function parseStageBody(body: Record<string, unknown>) {
  const stage = String(body.stage || '').trim() as LocalModelStage
  const options: LocalModelStageOptions = {}
  if (body.ollama_model) options.ollamaModel = String(body.ollama_model)
  if (body.comfy_video_model) options.comfyVideoModel = String(body.comfy_video_model)
  if (body.light_motion === true || body.light_motion === 1 || body.light_motion === '1' || body.light_motion === 'true') {
    options.lightMotion = true
  }
  const tts = String(body.tts_engine || '').trim()
  if (tts === 'edge' || tts === 'voicebox' || tts === 'gptsovits' || tts === 'indextts') options.ttsEngine = tts as LocalTtsEngine
  return { stage, options }
}

app.get('/status', async (c) => {
  const status = await getLocalModelStatus()
  return success(c, status)
})

// POST /local-models/stage — 按导航切换本地模型（仅卸载冲突，不预加载）
app.post('/stage', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const { stage, options } = parseStageBody(body)
  if (!VALID_STAGES.has(stage)) {
    return badRequest(c, 'stage must be one of: idle, llm, image, video, audio')
  }
  await prepareLocalModelStage(stage, options)
  const status = await getLocalModelStatus()
  return success(c, status)
})

// POST /local-models/ensure — 生成任务前确保模型就绪（切换 + 检查在线 + 预加载）
app.post('/ensure', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const { stage, options } = parseStageBody(body)
  if (!VALID_STAGES.has(stage) || stage === 'idle') {
    return badRequest(c, 'stage must be one of: llm, image, video, audio')
  }
  try {
    await ensureLocalModelStage(stage, options)
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
  const status = await getLocalModelStatus()
  return success(c, status)
})

export default app
