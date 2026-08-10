/**
 * Node 内置 fetch（undici）默认不读 Windows 系统代理。
 * 在 loadEnvLocal 之后调用，使 HTTPS_PROXY / HTTP_PROXY 对全局 fetch 生效。
 *
 * Agnes/Cloudflare 经代理时 connect 偶发 >10s；提高 connectTimeout，避免误判超时。
 * 若本机代理端口未开：回退直连（避免 ECONNREFUSED 127.0.0.1:7890 整片失败）。
 */
import net from 'net'
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici'
import { logTaskProgress, logTaskWarn } from './task-logger.js'

let applied = false

function parseProxyHostPort(proxyUrl: string): { host: string; port: number } | null {
  try {
    const u = new URL(proxyUrl)
    const host = u.hostname || '127.0.0.1'
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80)
    if (!Number.isFinite(port) || port <= 0) return null
    return { host, port }
  } catch {
    return null
  }
}

function probeTcp(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      try { socket.destroy() } catch { /* ignore */ }
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

export async function applyEnvHttpProxy(): Promise<void> {
  if (applied) return
  const proxy = String(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim()
  if (!proxy) {
    logTaskWarn('Env', 'http-proxy-missing', {
      hint: '未设置 HTTP_PROXY/HTTPS_PROXY。Agnes 等境外 API 国内直连常 Connect Timeout，请在 .env.local 配置例如 HTTP_PROXY=http://127.0.0.1:7890',
    })
    applied = true
    return
  }

  const hp = parseProxyHostPort(proxy)
  if (hp) {
    const ok = await probeTcp(hp.host, hp.port)
    if (!ok) {
      setGlobalDispatcher(new Agent({
        connect: { timeout: 60_000 },
        bodyTimeout: 0,
        headersTimeout: 120_000,
      }))
      applied = true
      logTaskWarn('Env', 'http-proxy-unreachable', {
        proxy,
        hint: `代理 ${hp.host}:${hp.port} 未监听，已回退直连。若 Agnes 超时请先打开本地代理再重启后端`,
      })
      return
    }
  }

  setGlobalDispatcher(new ProxyAgent({
    uri: proxy,
    // undici 默认 connectTimeout=10s，代理节点慢或并发时易 UND_ERR_CONNECT_TIMEOUT
    connectTimeout: 60_000,
    bodyTimeout: 0,
    headersTimeout: 120_000,
  }))
  applied = true
  logTaskProgress('Env', 'http-proxy-applied', {
    proxy,
    noProxy: process.env.NO_PROXY || '',
    connectTimeoutMs: 60_000,
  })
}
