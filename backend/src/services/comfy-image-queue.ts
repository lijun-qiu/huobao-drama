/**
 * ComfyUI 生图串行/限并发队列：避免 16G 显存下多路 Flux+PuLID 同时跑导致 OOM、
 * ComfyUI 无响应或 Windows「信号灯超时时间已到」。
 */
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { logTaskProgress } from '../utils/task-logger.js'

let active = 0
const waiters: Array<{ label: string; resolve: () => void }> = []

function tryDequeue() {
  const limit = LOCAL_COMIC_ENV.comfyImageConcurrency
  while (active < limit && waiters.length) {
    const next = waiters.shift()
    if (!next) break
    active++
    logTaskProgress('ComfyImageQueue', 'dequeue', { label: next.label, active, limit })
    next.resolve()
  }
}

export function getComfyImageQueueStats() {
  return {
    active,
    waiting: waiters.length,
    concurrency: LOCAL_COMIC_ENV.comfyImageConcurrency,
  }
}

/** 在队列槽位内执行 ComfyUI 生图（默认 concurrency=1） */
export async function runComfyImageTask<T>(label: string, task: () => Promise<T>): Promise<T> {
  const limit = LOCAL_COMIC_ENV.comfyImageConcurrency
  if (active >= limit) {
    logTaskProgress('ComfyImageQueue', 'waiting', { label, active, waiting: waiters.length + 1, limit })
    await new Promise<void>(resolve => waiters.push({ label, resolve }))
  } else {
    active++
    logTaskProgress('ComfyImageQueue', 'acquire', { label, active, limit })
  }

  try {
    return await task()
  } finally {
    active = Math.max(0, active - 1)
    tryDequeue()
  }
}
