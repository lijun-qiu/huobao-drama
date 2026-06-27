import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logTaskWarn } from './task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultEnvPath = path.resolve(__dirname, '../../../.env.local')

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

export function loadEnvLocal(envPath = defaultEnvPath): void {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (key === 'AI_API_KEY') value = normalizeEnvApiKey(value)
    process.env[key] = value
  }
}
