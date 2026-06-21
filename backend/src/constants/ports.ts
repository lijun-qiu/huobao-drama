/** 后端开发端口（日常 dev、前端 /api 代理目标） */
export const BACKEND_DEV_PORT = 5679

/** 后端测试端口 — 仅 Agent / 脚本 curl 验证用，前端与用户操作始终走 BACKEND_DEV_PORT */
export const BACKEND_TEST_PORT = 5680

/** 前端开发端口 */
export const FRONTEND_DEV_PORT = 3013

export function resolveBackendPort(): number {
  const fromEnv = process.env.PORT
  if (fromEnv) return Number(fromEnv)
  return BACKEND_DEV_PORT
}

export function backendBaseUrl(port = resolveBackendPort()): string {
  return `http://localhost:${port}`
}

export function backendApiUrl(port = resolveBackendPort()): string {
  return `${backendBaseUrl(port)}/api/v1`
}

export const BACKEND_CORS_ORIGINS = [
  `http://localhost:${FRONTEND_DEV_PORT}`,
  `http://localhost:${BACKEND_DEV_PORT}`,
  `http://localhost:${BACKEND_TEST_PORT}`,
] as const
