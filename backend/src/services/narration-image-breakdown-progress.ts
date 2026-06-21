export type NarrationImageBreakdownPhase = 'detecting' | 'prompts' | 'title' | 'saving' | 'done' | 'error'

export type NarrationImageBreakdownProgress = {
  status: 'processing' | 'completed' | 'failed' | 'cancelled'
  phase: NarrationImageBreakdownPhase
  message: string
  percent: number
  batch?: number
  batch_count?: number
  paragraph_count?: number
  updated_at: number
  error?: string
}

const progressMap = new Map<number, NarrationImageBreakdownProgress>()
const cancelFlags = new Map<number, boolean>()
const STALE_MS = 15 * 60 * 1000

export class NarrationImageBreakdownCancelledError extends Error {
  constructor() {
    super('配图分镜已取消')
    this.name = 'NarrationImageBreakdownCancelledError'
  }
}

export function isNarrationImageBreakdownCancelled(episodeId: number): boolean {
  return cancelFlags.get(episodeId) === true
}

export function assertNarrationImageBreakdownNotCancelled(episodeId: number) {
  if (isNarrationImageBreakdownCancelled(episodeId)) {
    throw new NarrationImageBreakdownCancelledError()
  }
}

export function requestNarrationImageBreakdownCancel(episodeId: number): boolean {
  const progress = progressMap.get(episodeId)
  if (!progress || progress.status !== 'processing') return false
  cancelFlags.set(episodeId, true)
  updateNarrationImageBreakdownProgress(episodeId, {
    status: 'cancelled',
    phase: 'error',
    message: '配图分镜已取消',
    error: 'cancelled',
  })
  return true
}

function clearNarrationImageBreakdownCancel(episodeId: number) {
  cancelFlags.delete(episodeId)
}

export function calcPromptBatchPercent(batchDone: number, batchCount: number): number {
  if (!batchCount) return 15
  return Math.round(15 + (batchDone / batchCount) * 70)
}

export function updateNarrationImageBreakdownProgress(
  episodeId: number,
  patch: Partial<NarrationImageBreakdownProgress>,
) {
  const prev = progressMap.get(episodeId)
  const next: NarrationImageBreakdownProgress = {
    status: patch.status ?? prev?.status ?? 'processing',
    phase: patch.phase ?? prev?.phase ?? 'detecting',
    message: patch.message ?? prev?.message ?? '',
    percent: patch.percent ?? prev?.percent ?? 0,
    batch: patch.batch ?? prev?.batch,
    batch_count: patch.batch_count ?? prev?.batch_count,
    paragraph_count: patch.paragraph_count ?? prev?.paragraph_count,
    updated_at: Date.now(),
    error: patch.error !== undefined ? patch.error : prev?.error,
  }
  progressMap.set(episodeId, next)
}

export function startNarrationImageBreakdownProgress(episodeId: number) {
  clearNarrationImageBreakdownCancel(episodeId)
  updateNarrationImageBreakdownProgress(episodeId, {
    status: 'processing',
    phase: 'detecting',
    message: '正在检测换镜段落…',
    percent: 3,
  })
}

export function getNarrationImageBreakdownProgress(episodeId: number): NarrationImageBreakdownProgress | null {
  const progress = progressMap.get(episodeId)
  if (!progress) return null
  if (progress.status === 'processing' && Date.now() - progress.updated_at > STALE_MS) {
    return {
      ...progress,
      status: 'failed',
      phase: 'error',
      message: '配图分镜因服务重启或超时中断，请重试',
      error: 'stale',
    }
  }
  return progress
}

export function clearNarrationImageBreakdownProgress(episodeId: number) {
  progressMap.delete(episodeId)
  clearNarrationImageBreakdownCancel(episodeId)
}

export type NarrationImageBreakdownProgressCallback = (patch: Partial<NarrationImageBreakdownProgress>) => void

export function createNarrationImageBreakdownProgressReporter(
  episodeId: number,
): NarrationImageBreakdownProgressCallback {
  return patch => updateNarrationImageBreakdownProgress(episodeId, patch)
}
