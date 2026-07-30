/**
 * 本地服务自动启动 — ensure 前若 Ollama / ComfyUI / GPT-SoVITS 未在线则尝试后台拉起
 */
import { execSync } from 'child_process'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { checkGptSovitsHealth } from './gpt-sovits-tts.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'

const START_POLL_MS = 2_000
const START_TIMEOUT_MS = 120_000

async function checkOllamaOnline(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
    return resp.ok
  } catch {
    return false
  }
}

async function checkComfyUIOnline(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}/system_stats`, { signal: AbortSignal.timeout(5_000) })
    return resp.ok
  } catch {
    return false
  }
}

function spawnDetached(command: string, args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  const child = spawn(command, args, {
    cwd: opts?.cwd,
    env: { ...process.env, ...opts?.env },
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  child.unref()
}

async function waitUntil(check: () => Promise<boolean>, label: string): Promise<boolean> {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await check()) {
      logTaskProgress('LocalServiceStarter', 'online', { service: label })
      return true
    }
    await new Promise(r => setTimeout(r, START_POLL_MS))
  }
  return false
}

function resolveOllamaExe(): string {
  const candidates = [
    process.env.OLLAMA_EXE,
    'C:\\my\\ollama\\bin\\ollama.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    'ollama',
  ].filter(Boolean) as string[]
  for (const exe of candidates) {
    if (exe === 'ollama') return exe
    if (fs.existsSync(exe)) return exe
  }
  return 'ollama'
}

export async function ensureOllamaRunning(): Promise<void> {
  if (await checkOllamaOnline()) return

  const exe = resolveOllamaExe()
  if (exe !== 'ollama' && !fs.existsSync(exe)) {
    throw new Error(`未找到 Ollama：${exe}。请安装 Ollama 或设置环境变量 OLLAMA_EXE`)
  }

  logTaskProgress('LocalServiceStarter', 'starting', { service: 'ollama', exe })
  spawnDetached(exe, ['serve'])

  if (!(await waitUntil(checkOllamaOnline, 'ollama'))) {
    throw new Error(
      exe === 'ollama'
        ? 'Ollama 启动超时：系统 PATH 中无 ollama 命令。请安装 Ollama，或设置 OLLAMA_EXE=C:\\my\\ollama\\bin\\ollama.exe 后重启后端'
        : `Ollama 启动超时（${exe}）。请手动运行：ollama serve（默认 http://127.0.0.1:11434）`,
    )
  }
}

export async function ensureComfyUIRunning(): Promise<void> {
  if (await checkComfyUIOnline()) return

  const root = process.env.COMFYUI_ROOT || 'C:\\my\\comfyui\\ComfyUI'
  if (!fs.existsSync(path.join(root, 'main.py'))) {
    throw new Error(`未找到 ComfyUI：${root}\\main.py。请设置 COMFYUI_ROOT 或手动启动 ComfyUI`)
  }
  const pythonCandidates = [
    process.env.COMFYUI_PYTHON,
    path.join(root, '..', 'venv', 'Scripts', 'python.exe'),
    path.join('C:\\my\\comfyui', 'venv', 'Scripts', 'python.exe'),
    'python',
  ].filter(Boolean) as string[]

  logTaskProgress('LocalServiceStarter', 'starting', { service: 'comfyui', root })
  // 默认不用 --lowvram：Qwen CLIP 已放 CPU 后 UNET 更容易整卡驻留，比 480 层换入换出快很多。
  // 若仍 OOM：设 COMFYUI_EXTRA_ARGS=--lowvram
  const extraArgs = String(process.env.COMFYUI_EXTRA_ARGS || '')
    .split(/\s+/).map(s => s.trim()).filter(Boolean)
  const comfyArgs = ['main.py', '--listen', '127.0.0.1', '--port', '8188', ...extraArgs]
  let started = false
  for (const python of pythonCandidates) {
    try {
      spawnDetached(python, comfyArgs, { cwd: root })
      started = true
      break
    } catch (err) {
      logTaskWarn('LocalServiceStarter', 'comfyui-spawn-failed', { python, error: (err as Error).message })
    }
  }
  if (!started) {
    throw new Error('无法启动 ComfyUI，请设置 COMFYUI_ROOT 并手动运行 ComfyUI')
  }

  if (!(await waitUntil(checkComfyUIOnline, 'comfyui'))) {
    throw new Error('ComfyUI 启动超时，请手动运行 ComfyUI（默认 http://127.0.0.1:8188）')
  }
}

/** 杀掉 ComfyUI 进程并重新拉起（Flux↔SDXL 切换后 /free 无法修复 model_size 崩溃时使用） */
export async function restartComfyUI(): Promise<void> {
  logTaskProgress('LocalServiceStarter', 'restarting', { service: 'comfyui' })
  try {
    await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(5_000) })
  } catch { /* ComfyUI 可能已挂 */ }
  try {
    await fetch(`${LOCAL_COMIC_ENV.comfyBaseUrl}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch { /* ignore */ }

  if (process.platform === 'win32') {
    try {
      execSync(
        'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8188 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore', timeout: 20_000 },
      )
    } catch { /* ignore */ }
  }

  await new Promise(r => setTimeout(r, 3_000))
  await ensureComfyUIRunning()
}

async function checkGptSovitsOnline(): Promise<boolean> {
  const health = await checkGptSovitsHealth()
  return health.ok
}

export async function ensureGptSovitsRunning(): Promise<void> {
  if (await checkGptSovitsOnline()) return

  const root = process.env.GPTSOVITS_ROOT || process.env.GPT_SOVITS_DIR || 'C:\\my\\gpt-sovits\\GPT-SoVITS'
  const apiScript = path.join(root, 'api_v2.py')
  if (!fs.existsSync(apiScript)) {
    throw new Error('GPT-SoVITS 未启动或无法连接（http://127.0.0.1:9880）。请先运行 scripts/start-gpt-sovits.ps1')
  }

  const pythonCandidates = [
    path.join(root, '.venv', 'Scripts', 'python.exe'),
    path.join('C:\\my\\gpt-sovits', 'venv', 'Scripts', 'python.exe'),
    'python',
  ]
  const host = new URL(LOCAL_COMIC_ENV.gptsovitsBaseUrl).hostname || '127.0.0.1'
  const port = new URL(LOCAL_COMIC_ENV.gptsovitsBaseUrl).port || '9880'

  logTaskProgress('LocalServiceStarter', 'starting', { service: 'gptsovits', root })
  let started = false
  for (const python of pythonCandidates) {
    try {
      spawnDetached(python, [apiScript, '-a', host, '-p', port], {
        cwd: root,
        env: { GPT_SOVITS_REF_ROOT: process.env.GPT_SOVITS_REF_ROOT },
      })
      started = true
      break
    } catch (err) {
      logTaskWarn('LocalServiceStarter', 'gptsovits-spawn-failed', { python, error: (err as Error).message })
    }
  }
  if (!started) {
    throw new Error('无法启动 GPT-SoVITS，请运行 scripts/start-gpt-sovits.ps1')
  }

  if (!(await waitUntil(checkGptSovitsOnline, 'gptsovits'))) {
    throw new Error('GPT-SoVITS 启动超时，请运行 scripts/start-gpt-sovits.ps1（默认 http://127.0.0.1:9880）')
  }
}
