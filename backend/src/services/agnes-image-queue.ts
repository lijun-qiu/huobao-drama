/**
 * Agnes / 境外云生图限并发：代理隧道并发过高时易 ECONNRESET / CONNECT_TIMEOUT。
 */
import { logTaskProgress } from '../utils/task-logger.js'

const AGNES_IMAGE_CONCURRENCY = Math.max(
  1,
  Number(process.env.AGNES_IMAGE_CONCURRENCY || 1) || 1,
)

let active = 0
const waiters: Array<{ label: string; resolve: () => void }> = []

function tryDequeue() {
  while (active < AGNES_IMAGE_CONCURRENCY && waiters.length) {
    const next = waiters.shift()
    if (!next) break
    active++
    logTaskProgress('AgnesImageQueue', 'dequeue', {
      label: next.label,
      active,
      limit: AGNES_IMAGE_CONCURRENCY,
    })
    next.resolve()
  }
}

export function getAgnesImageQueueStats() {
  return {
    active,
    waiting: waiters.length,
    concurrency: AGNES_IMAGE_CONCURRENCY,
  }
}

/** 在队列槽位内执行 Agnes 生图（默认 concurrency=1） */
export async function runAgnesImageTask<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (active >= AGNES_IMAGE_CONCURRENCY) {
    logTaskProgress('AgnesImageQueue', 'waiting', {
      label,
      active,
      waiting: waiters.length + 1,
      limit: AGNES_IMAGE_CONCURRENCY,
    })
    await new Promise<void>(resolve => waiters.push({ label, resolve }))
  } else {
    active++
    logTaskProgress('AgnesImageQueue', 'acquire', {
      label,
      active,
      limit: AGNES_IMAGE_CONCURRENCY,
    })
  }

  try {
    return await task()
  } finally {
    active = Math.max(0, active - 1)
    tryDequeue()
  }
}
