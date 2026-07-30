/**
 * ACE-Step 1.5 本地配乐 — OpenRouter 兼容 API（默认 http://127.0.0.1:8001）
 */
import { LOCAL_COMIC_ENV } from '../../constants/local-comic.js'

export const ACE_STEP_DEFAULT_MODEL = 'ace_step_local'
export const ACE_STEP_API_MODEL = 'acemusic/acestep-v15-turbo'
/** 16GB 显存默认用 0.6B LM；需要更高规划质量可改 1.7B */
export const ACE_STEP_LM_MODEL = process.env.ACE_STEP_LM_MODEL || 'acestep-5Hz-lm-0.6B'

export function isAceStepMusicModel(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  return m === ACE_STEP_DEFAULT_MODEL
    || m === 'acestep-v15-turbo'
    || m === 'acestep'
    || m.startsWith('acemusic/acestep')
}

export function aceStepBaseUrl(): string {
  return LOCAL_COMIC_ENV.aceStepBaseUrl
}

export async function checkAceStepHealth(timeoutMs = 5_000): Promise<{
  ok: boolean
  modelsInitialized?: boolean
  error?: string
}> {
  try {
    const resp = await fetch(`${aceStepBaseUrl()}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!resp.ok) return { ok: false, error: `ACE-Step health ${resp.status}` }
    const json = await resp.json().catch(() => ({})) as any
    const data = json?.data || json
    return {
      ok: true,
      modelsInitialized: Boolean(data?.models_initialized),
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'ACE-Step 未启动' }
  }
}

/** lazy-start 时需先 /v1/init，否则 /v1/chat/completions 会 503 */
export async function ensureAceStepInitialized(timeoutMs = 600_000): Promise<void> {
  const health = await checkAceStepHealth()
  if (!health.ok) {
    throw new Error(health.error || 'ACE-Step 未启动，请运行 scripts/start-ace-step.ps1')
  }
  if (health.modelsInitialized) return

  const resp = await fetch(`${aceStepBaseUrl()}/v1/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'acestep-v15-turbo',
      init_llm: true,
      lm_model_path: ACE_STEP_LM_MODEL,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await resp.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`ACE-Step init 返回非 JSON: ${text.slice(0, 200)}`)
  }
  if (!resp.ok || (json?.code != null && Number(json.code) >= 400)) {
    throw new Error(String(json?.error || json?.detail || json?.data?.message || `ACE-Step init ${resp.status}`))
  }
}

export type AceStepGenerateInput = {
  prompt: string
  durationSec?: number
  instrumental?: boolean
  bpm?: number
  timeoutMs?: number
}

export type AceStepGenerateResult = {
  audioDataUrl: string
  content?: string
}

function extractAceStepAudioUrl(json: any): string | undefined {
  const msg = json?.choices?.[0]?.message
  const candidates = [
    msg?.audio?.[0]?.audio_url?.url,
    msg?.audio?.[0]?.url,
    msg?.audios?.[0]?.url,
    msg?.audio?.[0]?.audio_url,
    json?.audio?.[0]?.url,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.includes('base64,')) return c
  }
  return undefined
}

/** 调用本地 ACE-Step 生成纯器乐 BGM，返回 data:audio/...;base64,... */
export async function generateAceStepMusic(input: AceStepGenerateInput): Promise<AceStepGenerateResult> {
  await ensureAceStepInitialized()

  const caption = String(input.prompt || '').trim()
  if (!caption) throw new Error('ACE-Step 生成需要音乐描述（prompt）')

  const duration = Math.max(15, Math.min(180, Number(input.durationSec) || 60))
  const instrumental = input.instrumental !== false
  const lyrics = instrumental ? '[Instrumental]' : ''
  const body = {
    model: ACE_STEP_API_MODEL,
    stream: false,
    thinking: false,
    use_format: false,
    use_cot_caption: true,
    use_cot_language: false,
    batch_size: 1,
    task_type: 'text2music',
    lyrics,
    messages: [
      {
        role: 'user',
        content: instrumental
          ? `<prompt>${caption}</prompt>\n<lyrics>[Instrumental]</lyrics>`
          : caption,
      },
    ],
    audio_config: {
      duration,
      instrumental: true,
      format: 'mp3',
      vocal_language: 'zh',
      ...(input.bpm ? { bpm: input.bpm } : {}),
    },
  }

  const timeoutMs = Math.max(120_000, Number(input.timeoutMs) || 600_000)
  const resp = await fetch(`${aceStepBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await resp.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`ACE-Step 返回非 JSON: ${text.slice(0, 200)}`)
  }
  if (!resp.ok) {
    throw new Error(String(json?.error?.message || json?.detail || `ACE-Step ${resp.status}: ${text.slice(0, 240)}`))
  }

  const audioUrl = extractAceStepAudioUrl(json)
  if (!audioUrl) {
    throw new Error('ACE-Step 未返回音频 data URL')
  }

  return {
    audioDataUrl: audioUrl,
    content: typeof json?.choices?.[0]?.message?.content === 'string'
      ? json.choices[0].message.content
      : undefined,
  }
}
