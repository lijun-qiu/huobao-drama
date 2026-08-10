/**
 * SSE JSON 流响应：长任务等待期间定时 keepalive，避免代理/浏览器掐空闲连接。
 * send 在流已关闭时静默失败，避免进度推送打断落库。
 */

const DEFAULT_KEEPALIVE_MS = 15_000

export type SseJsonSend = (payload: Record<string, unknown>) => void

export function createSseJsonResponse(
  handler: (send: SseJsonSend) => Promise<Record<string, unknown> | void>,
  options?: { keepaliveMs?: number },
): Response {
  const encoder = new TextEncoder()
  const keepaliveMs = Math.max(5_000, options?.keepaliveMs ?? DEFAULT_KEEPALIVE_MS)
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const stopHeartbeat = () => {
        if (heartbeat != null) {
          clearInterval(heartbeat)
          heartbeat = null
        }
      }

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return false
        try {
          controller.enqueue(chunk)
          return true
        } catch {
          closed = true
          stopHeartbeat()
          return false
        }
      }

      const send: SseJsonSend = (payload) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      heartbeat = setInterval(() => {
        // 注释行 + ping：代理认「有字节」；前端忽略未知 type
        if (!safeEnqueue(encoder.encode(`: keepalive\n\n`))) return
        send({ type: 'ping', ts: Date.now() })
      }, keepaliveMs)

      const finish = () => {
        stopHeartbeat()
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // already closed by client
        }
      }

      try {
        const result = await handler(send)
        if (result && typeof result === 'object') {
          send({ ...result, type: 'done' })
        }
        finish()
      } catch (err: any) {
        send({ type: 'error', message: String(err?.message || err || '生成失败') })
        finish()
      }
    },
    cancel() {
      if (heartbeat != null) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
