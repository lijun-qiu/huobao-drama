/** 工作流聊天：将任务进度以流式 status 文本推送（非进度条） */
export function createWorkflowChatStatusReporter(
  send: (payload: Record<string, unknown>) => void,
) {
  const lines: string[] = []
  return (message?: string | null) => {
    const text = String(message || '').trim()
    if (!text) return
    if (lines[lines.length - 1] === text) return
    lines.push(text)
    send({ type: 'status', content: lines.join('\n') })
  }
}
