import { toast } from 'vue-sonner'
import { api } from './useApi'

function parseToolResultPayload(result: unknown) {
  if (!result) return null
  if (typeof result === 'object') return result as Record<string, unknown>
  if (typeof result !== 'string') return null
  try {
    return JSON.parse(result) as Record<string, unknown>
  } catch {
    return null
  }
}

function summarizeExtractorRun(data: any): string | null {
  const results = data?.toolResults || data?.tool_results || []
  if (!Array.isArray(results) || !results.length) {
    return '提取未完成：AI 未调用保存工具。请确认剧本已保存，并点击「运行模型」后再试'
  }

  let hadSaveChars = false
  let hadSaveScenes = false
  let charsTotal = 0
  let scenesTotal = 0
  let scriptError = ''

  for (const entry of results) {
    const toolName = String(entry?.toolName || entry?.tool_name || '')
    const payload = parseToolResultPayload(entry?.result)
    if (toolName.includes('read_script_for_extraction') && payload?.error) {
      scriptError = String(payload.error)
    }
    if (toolName.includes('save_dedup_characters')) {
      hadSaveChars = true
      charsTotal += Number(payload?.created || 0) + Number(payload?.merged || 0)
    }
    if (toolName.includes('save_dedup_scenes')) {
      hadSaveScenes = true
      scenesTotal += Number(payload?.created || 0) + Number(payload?.reused || 0)
    }
  }

  if (scriptError) return `提取失败：${scriptError}`
  if (!hadSaveChars && !hadSaveScenes) {
    return '提取未完成：AI 未保存角色/场景。请检查剧本是否已写入数据库后重试'
  }
  if (charsTotal + scenesTotal === 0) {
    return '未从剧本中识别到角色或场景。请确认剧本含对白与场景描写后重试'
  }
  return null
}

function summarizeStoryboardRun(data: any): string | null {
  const results = data?.toolResults || data?.tool_results || []
  if (!Array.isArray(results) || !results.length) {
    return '分镜未完成：AI 未调用保存工具。请确认剧本已保存、已完成提取，并点击「运行模型」后再试'
  }

  let hadSave = false
  let savedCount = 0
  let contextError = ''

  for (const entry of results) {
    const toolName = String(entry?.toolName || entry?.tool_name || '')
    const payload = parseToolResultPayload(entry?.result)
    if (toolName.includes('read_storyboard_context') && payload?.error) {
      contextError = String(payload.error)
    }
    if (toolName.includes('save_storyboards')) {
      hadSave = true
      savedCount = Number(payload?.count || payload?.saved || payload?.storyboards?.length || 0)
    }
  }

  if (contextError) return `分镜失败：${contextError}`
  if (!hadSave) {
    return '分镜未完成：AI 未保存分镜。请确认已完成「提取」步骤，并点击「运行模型」加载 LLM 后重试'
  }
  if (!savedCount) {
    return '未生成有效分镜。请确认剧本含场景与对白后重试'
  }
  return null
}

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)

  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void, textModel?: string) {
    if (running.value) { toast.warning('操作执行中'); return }
    running.value = true
    runningType.value = type
    try {
      const payload: Record<string, unknown> = {
        message: msg,
        drama_id: dramaId,
        episode_id: episodeId,
      }
      if (textModel) payload.text_model = textModel
      const data = await api.post<any>(`/agent/${type}/chat`, payload)
      if (type === 'extractor') {
        const warn = summarizeExtractorRun(data)
        if (warn) {
          toast.warning(warn)
        } else {
          toast.success('角色与场景提取完成')
        }
      } else if (type === 'storyboard_breaker') {
        const warn = summarizeStoryboardRun(data)
        if (warn) {
          toast.warning(warn)
        } else {
          toast.success('分镜拆解完成')
        }
      } else {
        toast.success('完成')
      }
      onDone?.()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      running.value = false
      runningType.value = null
    }
  }

  return { running, runningType, run }
}
