/**
 * 测试端口后端 — 使用 `npm run dev:test` 启动。
 * 供 Cursor Agent / 脚本联调；用户界面与「测试导出」仍走 5679。
 */
import { loadEnvLocal } from '../src/utils/load-env-local.js'
import { BACKEND_TEST_PORT } from '../src/constants/ports.js'

loadEnvLocal()
process.env.PORT = String(BACKEND_TEST_PORT)
await import('../src/index.js')
