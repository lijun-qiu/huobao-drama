import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logTaskWarn } from './task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../..')
const defaultEnvPaths = [
  path.resolve(projectRoot, '.env.local'),
  path.resolve(projectRoot, '.env'),
]

/** 修正粘贴时误带入的 AI_API_KEY=sk- 重复前缀 */
export function normalizeEnvApiKey(raw: string): string {
  let key = String(raw || '').trim()
  if (!key) return key

  const duplicated = /^sk-AI_API_KEY=/i.test(key)
  if (duplicated) {
    key = key.replace(/^sk-AI_API_KEY=/i, '')
    logTaskWarn('Env', 'api-key-paste-fixed', {
      hint: '.env.local 的 AI_API_KEY 误粘贴了 AI_API_KEY=sk- 前缀，已自动修正；请确认 sk- 后面是你要用的新 Key',
    })
  }
  if (/^AI_API_KEY=/i.test(key)) {
    key = key.replace(/^AI_API_KEY=/i, '')
  }
  if (key && !key.startsWith('sk-')) {
    key = `sk-${key.replace(/^sk-+/i, '')}`
  }
  return key
}

function applyEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key === 'AI_API_KEY'
      || key === 'OPENROUTER_API_KEY'
      || key === 'OPENROUTER_API_KEY_FREE'
      || key === 'OPENROUTER_API_KEY_PAID'
      || key === 'DEEPSEEK_API_KEY'
      || key === 'AI_DEEPSEEK_API_KEY'
    ) {
      value = normalizeEnvApiKey(value)
    }
    // 已有环境变量优先，不覆盖
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

export function loadEnvLocal(envPath?: string): void {
  if (envPath) {
    applyEnvFile(envPath)
    return
  }
  for (const p of defaultEnvPaths) applyEnvFile(p)
}
