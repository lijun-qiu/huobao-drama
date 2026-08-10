/**
 * 短剧分镜拆解 — 本地 Ollama 直连 LLM + JSON，不依赖 Mastra Agent 工具调用
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { callTextChat } from './text-chat.js'
import { resolveLocalEpisodeTextModel, DEFAULT_LOCAL_AGENT_MODEL, isLocalAgentCapableModel } from '../constants/text-models.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import {
  readStoryboardContextData,
  saveStoryboardsForEpisode,
  type DramaStoryboardInput,
} from '../agents/tools/storyboard-tools.js'

const STORYBOARD_SYSTEM = [
  '你是资深影视分镜师，将短剧剧本拆解为分镜序列，输出严格 JSON，不要 markdown 代码块外的说明文字。',
  '',
  '拆解要求：',
  '- 每个镜头 10-15 秒，保持剧情完整连续',
  '- 优先复用输入中的 scene id；character_ids 必须使用输入 characters 里的 id',
  '- 每个镜头尽量完整填写 title、shot_type、angle、movement、location、time、action、dialogue、description、result、atmosphere、image_prompt、video_prompt、bgm_prompt、sound_effect、duration',
  '- video_prompt 按 3 秒分段，用 <location>地点</location>、<role>角色名</role> 标记，段间用 <n> 分隔',
  '- 无对白时 dialogue 可空，但 description / action / video_prompt / image_prompt 仍须完整',
  '',
  '输出格式（仅此 JSON 对象）：',
  '{"storyboards":[{"shot_number":1,"title":"...","shot_type":"中景","angle":"平视","movement":"固定","location":"...","time":"白天","character_ids":[1],"scene_id":1,"action":"...","dialogue":"...","description":"...","result":"...","atmosphere":"...","image_prompt":"...","video_prompt":"...","bgm_prompt":"...","sound_effect":"...","duration":12}]}',
].join('\n')

function stripLlmNoiseForJson(text: string): string {
  const raw = String(text || '')
  const closeTag = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62)
  const closeIdx = raw.toLowerCase().lastIndexOf(closeTag)
  const withoutThink = closeIdx >= 0 ? raw.slice(closeIdx + closeTag.length) : raw
  return withoutThink.trim()
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = stripLlmNoiseForJson(text)
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || cleaned).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function resolveStoryboardTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
): string {
  const picked = resolveLocalEpisodeTextModel(episode, bodyModel)
  if (isLocalAgentCapableModel(picked)) return picked
  return DEFAULT_LOCAL_AGENT_MODEL
}

async function callStoryboardLlm(
  user: string,
  primaryModel: string,
): Promise<{ raw: string; model: string }> {
  const models = [primaryModel]
  if (primaryModel !== DEFAULT_LOCAL_AGENT_MODEL) models.push(DEFAULT_LOCAL_AGENT_MODEL)

  let lastRaw = ''
  for (const model of models) {
    const raw = await callTextChat(STORYBOARD_SYSTEM, user, model, false, 600_000, true)
    lastRaw = raw
    if (extractJsonObject(raw)) {
      if (model !== primaryModel) {
        logTaskWarn('DramaStoryboard', 'fallback-model', { from: primaryModel, to: model })
      }
      return { raw, model }
    }
    logTaskWarn('DramaStoryboard', 'invalid-json', { model, preview: raw.slice(0, 240) })
  }

  return { raw: lastRaw, model: models[models.length - 1] }
}

function normalizeStoryboards(
  raw: unknown,
  ctx: ReturnType<typeof readStoryboardContextData>,
): DramaStoryboardInput[] {
  if (!Array.isArray(raw)) return []

  const charById = new Map<number, unknown>(
    ctx.characters.map(c => [Number(c.id), c] as [number, unknown]),
  )
  const charByName = new Map<string, number>(
    ctx.characters.map(c => [String(c.name), Number(c.id)] as [string, number]),
  )
  const sceneById = new Map<number, unknown>(
    ctx.scenes.map(s => [Number(s.id), s] as [number, unknown]),
  )
  const sceneByKey = new Map<string, number>(
    ctx.scenes.map(s => [`${s.location}::${s.time || ''}`, Number(s.id)] as [string, number]),
  )

  const resolveSceneId = (row: any): number | null => {
    const direct = Number(row?.scene_id)
    if (Number.isFinite(direct) && sceneById.has(direct)) return direct
    const location = String(row?.location || row?.scene_location || '').trim()
    const time = String(row?.time || row?.scene_time || '').trim()
    if (!location) return null
    const key = `${location}::${time}`
    if (sceneByKey.has(key)) return sceneByKey.get(key)!
    const fuzzy = ctx.scenes.find(s => s.location === location)
    return fuzzy?.id ?? null
  }

  const resolveCharacterIds = (row: any): number[] => {
    const rawIds: unknown[] = Array.isArray(row?.character_ids) ? (row.character_ids as unknown[]) : []
    const direct = rawIds
      .map((id: unknown) => Number(id))
      .filter((id): id is number => Number.isFinite(id) && charById.has(id))
    if (direct.length) return [...new Set(direct)]

    const rawNames: unknown[] = Array.isArray(row?.character_names) ? (row.character_names as unknown[]) : []
    const names: string[] = rawNames
      .map((name: unknown) => String(name || '').trim())
      .filter((s): s is string => Boolean(s))
    return [...new Set(
      names
        .map(name => charByName.get(name))
        .filter((id): id is number => id != null),
    )]
  }

  return raw
    .map((row: any, index: number): DramaStoryboardInput | null => {
      const shotNumber = Number(row?.shot_number ?? row?.shotNumber ?? index + 1)
      if (!Number.isFinite(shotNumber) || shotNumber <= 0) return null
      return {
        shot_number: Math.round(shotNumber),
        title: String(row?.title || '').trim() || undefined,
        shot_type: String(row?.shot_type || row?.shotType || '').trim() || undefined,
        angle: String(row?.angle || '').trim() || undefined,
        movement: String(row?.movement || '').trim() || undefined,
        location: String(row?.location || '').trim() || undefined,
        time: String(row?.time || '').trim() || undefined,
        action: String(row?.action || '').trim() || undefined,
        dialogue: String(row?.dialogue || '').trim() || undefined,
        description: String(row?.description || '').trim() || undefined,
        result: String(row?.result || '').trim() || undefined,
        atmosphere: String(row?.atmosphere || '').trim() || undefined,
        image_prompt: String(row?.image_prompt || row?.imagePrompt || '').trim() || undefined,
        video_prompt: String(row?.video_prompt || row?.videoPrompt || '').trim() || undefined,
        bgm_prompt: String(row?.bgm_prompt || row?.bgmPrompt || '').trim() || undefined,
        sound_effect: String(row?.sound_effect || row?.soundEffect || '').trim() || undefined,
        duration: Number.isFinite(Number(row?.duration)) ? Math.max(3, Math.round(Number(row.duration))) : 10,
        scene_id: resolveSceneId(row),
        character_ids: resolveCharacterIds(row),
      }
    })
    .filter((row): row is DramaStoryboardInput => row != null)
    .sort((a, b) => a.shot_number - b.shot_number)
}

export async function breakdownDramaEpisodeStoryboards(params: {
  episodeId: number
  dramaId: number
  script?: string
  textModel?: string | null
  videoModelLabel?: string | null
}) {
  const { episodeId, dramaId } = params
  const ctx = readStoryboardContextData(episodeId, dramaId)
  const script = String(params.script || ctx.script || '').trim()
  if (!script) {
    throw new Error('当前集剧本为空，请先在「原始内容」或「AI 改写」步骤填写并保存剧本')
  }
  if (!ctx.characters.length) {
    throw new Error('当前集尚无角色，请先在「提取」步骤提取角色与场景')
  }

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const textModel = resolveStoryboardTextModel(ep, params.textModel)
  const videoHint = String(params.videoModelLabel || '').trim()

  logTaskProgress('DramaStoryboard', 'llm-start', {
    episodeId,
    dramaId,
    model: textModel,
    scriptLength: script.length,
    characters: ctx.characters.length,
    scenes: ctx.scenes.length,
  })

  const user = JSON.stringify({
    script: script.slice(0, 28000),
    characters: ctx.characters.map(c => ({
      id: c.id,
      name: c.name,
      role: c.role,
      appearance: c.appearance,
    })),
    scenes: ctx.scenes.map(s => ({
      id: s.id,
      location: s.location,
      time: s.time,
      prompt: s.prompt,
    })),
    video_model: videoHint || undefined,
    requirements: videoHint
      ? `请根据视频模型「${videoHint}」的特性和时长限制生成合适的 video_prompt`
      : undefined,
  })

  const { raw, model: usedModel } = await callStoryboardLlm(user, textModel)
  const parsed = extractJsonObject(raw)
  if (!parsed) {
    logTaskWarn('DramaStoryboard', 'invalid-json-final', { model: usedModel, preview: raw.slice(0, 240) })
    throw new Error('AI 返回格式无效，请重试；若仍失败可改用 Qwen 2.5 14B 或缩短剧本后再拆解')
  }

  const storyboards = normalizeStoryboards(parsed.storyboards, ctx)
  if (!storyboards.length) {
    throw new Error('未生成有效分镜，请确认剧本含场景与对白后重试')
  }

  const saved = saveStoryboardsForEpisode(episodeId, dramaId, storyboards)
  logTaskSuccess('DramaStoryboard', 'done', {
    episodeId,
    dramaId,
    count: saved.count,
    model: usedModel,
  })

  return {
    count: saved.count,
    total_duration: saved.total_duration,
    model: usedModel,
    storyboards,
  }
}
