/**
 * Glide（glide-ffmpeg）静图亚像素运镜 — 不加载 Wan/Comfy 扩散模型。
 * 仅用 PyTorch grid_sample + FFmpeg 编码；生成视频阶段不跑其它模型时不与 Comfy 抢显存。
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { freeComfyUIMemory } from './local-model-manager.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')

export type GlidePreset =
  | 'push-in'
  | 'push-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'

const GLIDE_PRESETS: GlidePreset[] = [
  'push-in',
  'push-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
]

export function resolveGlideRoot(): string {
  const env = String(process.env.GLIDE_ROOT || LOCAL_COMIC_ENV.glideRoot || '').trim()
  if (env) return path.resolve(env)
  return path.join(REPO_ROOT, 'tools', 'glide-ffmpeg')
}

export function resolveGlidePython(): string {
  const env = String(process.env.GLIDE_PYTHON || LOCAL_COMIC_ENV.glidePython || '').trim()
  if (env) return env
  return 'python'
}

export function resolveGlideScript(): string {
  return path.join(resolveGlideRoot(), 'glide.py')
}

export function pickGlidePreset(seed?: number | null): GlidePreset {
  const n = Number.isFinite(Number(seed)) ? Math.abs(Math.floor(Number(seed))) : 0
  return GLIDE_PRESETS[n % GLIDE_PRESETS.length]
}

export type RenderGlideOptions = {
  fps?: number
  width?: number
  height?: number
  preset?: GlidePreset
  amount?: number
  easing?: 'linear' | 'cubic' | 'sine'
  seed?: number | null
  /** 渲染前尝试释放 Comfy 显存（不启动 Comfy） */
  freeComfyFirst?: boolean
  device?: string
  crf?: number
  encodePreset?: string
  supersample?: number
  batch?: number
  timeoutMs?: number
}

function runGlideCli(args: string[], timeoutMs: number): Promise<void> {
  const python = resolveGlidePython()
  const script = resolveGlideScript()
  if (!fs.existsSync(script)) {
    throw new Error(`glide-ffmpeg 未找到: ${script}`)
  }
  if (!fs.existsSync(python) && python !== 'python' && python !== 'python3') {
    throw new Error(
      `Glide Python 不存在: ${python}（请安装 torch 环境或设置 GLIDE_PYTHON，推荐 ComfyUI venv）`,
    )
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args], {
      cwd: resolveGlideRoot(),
      env: {
        ...process.env,
        // 避免与 Comfy 抢已占满的显存时误用全部显存；仍允许 CUDA
        PYTORCH_CUDA_ALLOC_CONF: process.env.PYTORCH_CUDA_ALLOC_CONF || 'expandable_segments:True',
      },
      windowsHide: true,
    })
    let stderr = ''
    let stdout = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      reject(new Error(`Glide 渲染超时（>${Math.round(timeoutMs / 1000)}s）`))
    }, timeoutMs)

    child.stdout?.on('data', (buf: Buffer) => {
      stdout += buf.toString()
    })
    child.stderr?.on('data', (buf: Buffer) => {
      stderr += buf.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      const detail = (stderr || stdout || '').trim().slice(-1200)
      reject(new Error(`Glide 退出码 ${code}${detail ? `: ${detail}` : ''}`))
    })
  })
}

/**
 * 用 glide-ffmpeg 生成静音运镜 mp4（不加载 Wan / 不排队 Comfy）。
 */
export async function renderGlideClip(
  imageAbsPath: string,
  durationSec: number,
  outputAbsPath: string,
  options?: RenderGlideOptions,
): Promise<void> {
  if (!fs.existsSync(imageAbsPath)) throw new Error(`配图不存在: ${imageAbsPath}`)
  const sec = Math.max(1, Number(durationSec) || 3)
  const fps = Math.max(12, options?.fps ?? 25)
  const width = Math.max(320, options?.width ?? 1280)
  const height = Math.max(180, options?.height ?? 720)
  const preset = options?.preset || pickGlidePreset(options?.seed)
  // 默认 0.30：原先 0.14 几乎看不出；上游默认 0.20，再抬一档保证分镜观感明显
  const amount = options?.amount ?? 0.30
  const easing = options?.easing ?? 'sine'
  const freeFirst = options?.freeComfyFirst !== false
  const timeoutMs = Math.max(60_000, options?.timeoutMs ?? Math.round(sec * 25_000 + 120_000))

  if (freeFirst) {
    try {
      await freeComfyUIMemory()
    } catch (err) {
      logTaskWarn('Glide', 'free-comfy-skipped', { error: (err as Error).message })
    }
  }

  fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true })
  if (fs.existsSync(outputAbsPath)) {
    try { fs.unlinkSync(outputAbsPath) } catch { /* ignore */ }
  }

  const args = [
    imageAbsPath,
    outputAbsPath,
    '--preset', preset,
    '--amount', String(amount),
    '--duration', String(sec),
    '--fps', String(fps),
    '--easing', easing,
    '--size', String(width), String(height),
    '--supersample', String(options?.supersample ?? 1.5),
    '--batch', String(options?.batch ?? 8),
    '--crf', String(options?.crf ?? 20),
    '--encode-preset', options?.encodePreset ?? 'veryfast',
  ]
  if (options?.device) {
    args.push('--device', options.device)
  }

  logTaskProgress('Glide', 'start', {
    image: imageAbsPath,
    out: outputAbsPath,
    preset,
    duration: sec,
    fps,
    size: `${width}x${height}`,
    python: resolveGlidePython(),
  })

  await runGlideCli(args, timeoutMs)

  if (!fs.existsSync(outputAbsPath) || fs.statSync(outputAbsPath).size < 1024) {
    throw new Error('Glide 输出无效（文件过小或不存在）')
  }

  logTaskProgress('Glide', 'done', { out: outputAbsPath, bytes: fs.statSync(outputAbsPath).size })
}
