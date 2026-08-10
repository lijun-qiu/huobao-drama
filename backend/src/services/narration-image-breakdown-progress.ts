export type NarrationImageBreakdownPhase = 'detecting' | 'prompts' | 'title' | 'saving' | 'done' | 'error'

export type NarrationImageBreakdownProgress = {
  status: 'processing' | 'completed' | 'failed' | 'cancelled'
  phase: NarrationImageBreakdownPhase
  message: string
  percent: number
  /** @deprecated 并发时请用 batches_done；保留兼容旧前端 */
  batch?: number
  batch_count?: number
  /** 已完成批次数 */
  batches_done?: number
  /** 当前进行中批次数 */
  batches_active?: number
  /** 云端批并发上限 */
  concurrency?: number
  paragraph_count?: number
  /** 本任务已落库的配图文案条数（中文） */
  prompts_saved?: number
  /** 本任务已落库的英文条数 */
  flux_en_saved?: number
  /** 递增序号，前端用来判断是否该刷新镜头列表 */
  prompts_saved_seq?: number
  image_detect_source?: 'llm' | 'balanced' | 'conservative' | 'rules' | 'one_to_one'
  generated_at?: string
  /** 本次配图文案任务同步写出的 Flux 英文条数 */
  flux_prompt_en_translated?: number
  updated_at: number
  error?: string
}

const progressMap = new Map<number, NarrationImageBreakdownProgress>()
const cancelFlags = new Map<number, boolean>()
const runningJobs = new Set<number>()
const STALE_MS = 60 * 60 * 1000

export class NarrationImageBreakdownCancelledError extends Error {
  constructor() {
    super('配图分镜已取消')
    this.name = 'NarrationImageBreakdownCancelledError'
  }
}

export function isNarrationImageBreakdownRunning(episodeId: number): boolean {
  const progress = progressMap.get(episodeId)
  return progress?.status === 'processing' || runningJobs.has(episodeId)
}

export function acquireNarrationImageBreakdownJob(episodeId: number): boolean {
  if (runningJobs.has(episodeId)) return false
  const progress = progressMap.get(episodeId)
  if (progress?.status === 'processing') return false
  runningJobs.add(episodeId)
  return true
}

export function releaseNarrationImageBreakdownJob(episodeId: number) {
  runningJobs.delete(episodeId)
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
  const running = runningJobs.has(episodeId) || progress?.status === 'processing'
  if (!running) return false
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

/** 换镜检测分批进度：detecting 阶段约占 3%～85% */
export function calcDetectBatchPercent(batchDone: number, batchCount: number): number {
  if (!batchCount) return 5
  return Math.round(3 + (batchDone / batchCount) * 82)
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
    batches_done: patch.batches_done ?? prev?.batches_done,
    batches_active: patch.batches_active ?? prev?.batches_active,
    concurrency: patch.concurrency ?? prev?.concurrency,
    paragraph_count: patch.paragraph_count ?? prev?.paragraph_count,
    prompts_saved: patch.prompts_saved ?? prev?.prompts_saved,
    flux_en_saved: patch.flux_en_saved ?? prev?.flux_en_saved,
    prompts_saved_seq: patch.prompts_saved_seq ?? prev?.prompts_saved_seq,
    image_detect_source: patch.image_detect_source ?? prev?.image_detect_source,
    generated_at: patch.generated_at ?? prev?.generated_at,
    flux_prompt_en_translated: patch.flux_prompt_en_translated ?? prev?.flux_prompt_en_translated,
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
