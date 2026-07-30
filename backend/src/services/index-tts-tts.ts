/**
 * IndexTTS2 本地情感配音（CLI 子进程）
 * 模型目录默认：C:\my\index-tts\index-tts\checkpoints
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { resolveGptSovitsRefAudioPath, getGptSovitsVoice, resolveGptSovitsVoiceId, GSV_VOICE_PREFIX } from './gpt-sovits-tts.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(PROJECT_ROOT, 'data/static')

const INDEX_TTS_ROOT = process.env.INDEX_TTS_ROOT || LOCAL_COMIC_ENV.indexTtsRoot
const INDEX_TTS_MODEL_DIR = process.env.INDEX_TTS_MODEL_DIR || LOCAL_COMIC_ENV.indexTtsModelDir
const INDEX_TTS_PYTHON = process.env.INDEX_TTS_PYTHON || path.join(INDEX_TTS_ROOT, '.venv', 'Scripts', 'python.exe')
const INDEX_TTS_TIMEOUT_MS = Number(process.env.INDEX_TTS_TIMEOUT_MS || 600_000)
const INDEX_TTS_FP16 = process.env.INDEX_TTS_FP16 !== 'false'
const INDEX_TTS_DEVICE = process.env.INDEX_TTS_DEVICE || 'cuda'

export const IDX_VOICE_PREFIX = 'idx:'

export interface IndexTtsHealth {
  ok: boolean
  model_dir?: string
  root?: string
  cuda?: boolean
  error?: string
  detail?: string
  cached?: boolean
}

const INDEX_TTS_HEALTH_CACHE_MS = Number(process.env.INDEX_TTS_HEALTH_CACHE_MS || 300_000)

let cachedHealth: IndexTtsHealth | null = null
let cachedHealthAt = 0

function setIndexTtsHealthCache(health: IndexTtsHealth) {
  const { cached: _c, ...rest } = health
  cachedHealth = rest
  cachedHealthAt = Date.now()
}

/** 仅检查安装目录与权重文件，不启动 Python / 不占 GPU */
function checkIndexTtsHealthFilesystem(): IndexTtsHealth {
  const modelDir = INDEX_TTS_MODEL_DIR
  if (!fs.existsSync(path.join(INDEX_TTS_ROOT, 'pyproject.toml'))) {
    return { ok: false, error: `IndexTTS2 未安装：${INDEX_TTS_ROOT}` }
  }
  const required = ['gpt.pth', 's2mel.pth', 'config.yaml']
  for (const f of required) {
    if (!fs.existsSync(path.join(modelDir, f))) {
      return { ok: false, model_dir: modelDir, error: `缺少模型文件：${f}` }
    }
  }
  return {
    ok: true,
    model_dir: modelDir,
    root: INDEX_TTS_ROOT,
    detail: 'filesystem-check',
  }
}

async function checkIndexTtsHealthFull(): Promise<IndexTtsHealth> {
  const fsHealth = checkIndexTtsHealthFilesystem()
  if (!fsHealth.ok) return fsHealth

  const modelDir = INDEX_TTS_MODEL_DIR
  try {
    const args = ['check', '--model-dir', modelDir, '--device', INDEX_TTS_DEVICE]
    const result = await runIndexTtsCli(args, 120_000)
    const text = `${result.stdout}\n${result.stderr}`
    const cuda = /cuda:\s*available/i.test(text)
    if (result.code === 0) {
      return { ok: true, model_dir: modelDir, root: INDEX_TTS_ROOT, cuda, detail: result.stdout.trim() }
    }
    return {
      ok: false,
      model_dir: modelDir,
      root: INDEX_TTS_ROOT,
      cuda,
      error: 'IndexTTS2 check 失败',
      detail: text.trim().slice(-2000),
    }
  } catch (err) {
    return {
      ok: false,
      model_dir: modelDir,
      root: INDEX_TTS_ROOT,
      error: (err as Error).message,
    }
  }
}

export type IndexTtsHealthOptions = {
  /** 忽略缓存，执行完整 CLI 检查（配音前 / 专用健康接口） */
  force?: boolean
  /** 生图/生视频期间：仅用缓存或文件检查，不跑 CLI */
  skipHeavy?: boolean
}

export async function checkIndexTtsHealth(options?: IndexTtsHealthOptions): Promise<IndexTtsHealth> {
  const force = options?.force === true
  const skipHeavy = options?.skipHeavy === true

  if (skipHeavy && !force) {
    if (cachedHealth && Date.now() - cachedHealthAt < INDEX_TTS_HEALTH_CACHE_MS) {
      return { ...cachedHealth, cached: true }
    }
    const lite = checkIndexTtsHealthFilesystem()
    if (cachedHealth?.ok) return { ...cachedHealth, cached: true }
    return lite
  }

  if (!force && cachedHealth && Date.now() - cachedHealthAt < INDEX_TTS_HEALTH_CACHE_MS) {
    return { ...cachedHealth, cached: true }
  }

  const health = await checkIndexTtsHealthFull()
  setIndexTtsHealthCache(health)
  return health
}

async function resolveVoiceRefPathAsync(voiceId: string): Promise<string> {
  const raw = String(voiceId || '').trim()
  if (!raw) throw new Error('IndexTTS2 参考音为空')

  if (raw.startsWith(IDX_VOICE_PREFIX)) {
    const rel = raw.slice(IDX_VOICE_PREFIX.length)
    const abs = path.isAbsolute(rel) ? rel : resolveGptSovitsRefAudioPath(rel)
    if (!fs.existsSync(abs)) throw new Error(`IndexTTS2 参考音不存在：${abs}`)
    return abs
  }

  const gsvId = raw.startsWith(GSV_VOICE_PREFIX) ? raw : `${GSV_VOICE_PREFIX}${raw}`
  const resolvedId = await resolveGptSovitsVoiceId(gsvId)
  const voice = await getGptSovitsVoice(resolvedId)
  if (!voice?.ref_audio_path) throw new Error(`IndexTTS2 音色不存在：${resolvedId}`)
  const abs = resolveGptSovitsRefAudioPath(voice.ref_audio_path)
  if (!fs.existsSync(abs)) throw new Error(`IndexTTS2 参考音不存在：${abs}`)
  return abs
}

function runIndexTtsCli(args: string[], timeoutMs = INDEX_TTS_TIMEOUT_MS): Promise<{ code: number; stdout: string; stderr: string }> {
  const python = fs.existsSync(INDEX_TTS_PYTHON) ? INDEX_TTS_PYTHON : 'python'
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-m', 'indextts.cli_v2', ...args], {
      cwd: INDEX_TTS_ROOT,
      env: {
        ...process.env,
        HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
        HF_HUB_CACHE: path.join(INDEX_TTS_MODEL_DIR, 'hf_cache'),
      },
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`IndexTTS2 超时（${timeoutMs}ms）`))
    }, timeoutMs)

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export function getIndexTtsConfigSummary() {
  return {
    root: INDEX_TTS_ROOT,
    model_dir: INDEX_TTS_MODEL_DIR,
    python: INDEX_TTS_PYTHON,
    fp16: INDEX_TTS_FP16,
    device: INDEX_TTS_DEVICE,
  }
}

export async function generateIndexTtsTTS(
  text: string,
  voiceId: string,
  options?: {
    emotionText?: string | null
    emotionWeight?: number | null
    speed?: number | null
  },
): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('配音文本为空')

  const health = await checkIndexTtsHealth({ force: true })
  if (!health.ok) {
    throw new Error(health.error || 'IndexTTS2 未就绪，请运行 scripts/setup-index-tts.ps1')
  }

  const voicePath = await resolveVoiceRefPathAsync(voiceId)
  const emotionText = String(options?.emotionText || '自然流畅的解说语气，情绪饱满').trim()
  const emotionWeight = Math.min(1.5, Math.max(0.1, Number(options?.emotionWeight) || 0.65))

  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.wav`
  const outputAbs = path.join(audioDir, filename)

  logTaskStart('AudioTask', 'indextts-generate', {
    voicePath,
    emotionText,
    emotionWeight,
    textPreview: trimmed.slice(0, 50),
    textLength: trimmed.length,
  })

  const args = [
    'synth',
    '--model-dir', INDEX_TTS_MODEL_DIR,
    '--text', trimmed,
    '--voice', voicePath,
    '--emotion-text', emotionText,
    '--emotion-weight', String(emotionWeight),
    '--output', outputAbs,
    '--force',
    '--device', INDEX_TTS_DEVICE,
  ]
  if (INDEX_TTS_FP16) args.push('--fp16')

  logTaskProgress('AudioTask', 'indextts-cli', { output: outputAbs })
  const result = await runIndexTtsCli(args)
  if (result.code !== 0 || !fs.existsSync(outputAbs) || fs.statSync(outputAbs).size < 44) {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(-2000)
    logTaskError('AudioTask', 'indextts-generate', { error: detail })
    throw new Error(detail || 'IndexTTS2 合成失败')
  }

  const relativePath = `static/audio/${filename}`
  logTaskSuccess('AudioTask', 'indextts-saved', {
    path: relativePath,
    bytes: fs.statSync(outputAbs).size,
  })
  return relativePath
}
