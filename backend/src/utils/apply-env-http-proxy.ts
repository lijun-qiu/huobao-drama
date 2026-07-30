/**
 * Node 内置 fetch（undici）默认不读 Windows 系统代理。
 * 在 loadEnvLocal 之后调用，使 HTTPS_PROXY / HTTP_PROXY 对全局 fetch 生效。
 *
 * Agnes/Cloudflare 经代理时 connect 偶发 >10s；提高 connectTimeout，避免误判超时。
 */
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { logTaskProgress, logTaskWarn } from './task-logger.js'

let applied = false

export function applyEnvHttpProxy(): void {
  if (applied) return
  const proxy = String(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim()
  if (!proxy) {
    logTaskWarn('Env', 'http-proxy-missing', {
      hint: '未设置 HTTP_PROXY/HTTPS_PROXY。Agnes 等境外 API 国内直连常 Connect Timeout，请在 .env.local 配置例如 HTTP_PROXY=http://127.0.0.1:7890',
    })
    return
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
