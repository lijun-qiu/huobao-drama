/**
 * 进程入口：先加载 .env.local / .env，再启动 HTTP 服务
 * （保证 LOCAL_COMIC_ENV 等能读到智谱 Key；Agnes 等需代理的 API 走 HTTPS_PROXY）
 */
import dns from 'node:dns'
import { loadEnvLocal } from './utils/load-env-local.js'
import { applyEnvHttpProxy } from './utils/apply-env-http-proxy.js'

// Agnes/Cloudflare 偶发坏 AAAA；优先 IPv4，减少 TLS ECONNRESET
try { dns.setDefaultResultOrder('ipv4first') } catch { /* Node < 17 */ }

loadEnvLocal()
applyEnvHttpProxy()

await import('./index.js')
