/**
 * 漫剧/短剧角色与场景提取 — 本地 Ollama 直连 LLM + JSON，不依赖 Mastra Agent 工具调用
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { callTextChat } from './text-chat.js'
import { resolveLocalEpisodeTextModel, DEFAULT_LOCAL_AGENT_MODEL, isLocalAgentCapableModel } from '../constants/text-models.js'
import { logTaskProgress, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import {
  listDramaCharactersForExtraction,
  listDramaScenesForExtraction,
  readEpisodeScriptContent,
  saveDedupExtractedCharacters,
  saveDedupExtractedScenes,
} from '../agents/tools/extract-tools.js'

const EXTRACT_SYSTEM = [
  '你是制片助理，从短剧/漫剧剧本中提取角色与场景，输出严格 JSON，不要 markdown 代码块外的说明文字。',
  '',
  '提取规则：',
  '- 只提取本集剧本中真实出现或被明确提及的角色与场景',
  '- 角色含：name（必填）、role（主角/配角等）、description、appearance（外貌发型服装体态，尽量具体）、personality',
  '- 场景含：location（必填）、time（如白天/夜晚/黄昏）、prompt（光线氛围色调，可用于生图）',
  '- 不要提取旁白、解说员、作者',
  '- 若用户消息中含 existing_characters / existing_scenes，同名角色或同地点+同时间场景优先在结果中保留可合并信息，勿重复编造',
  '',
  '输出格式（仅此 JSON 对象）：',
  '{"characters":[{"name":"...","role":"...","description":"...","appearance":"...","personality":"..."}],"scenes":[{"location":"...","time":"...","prompt":"..."}]}',
].join('\n')

function stripLlmNoiseForJson(text: string): string {
  const raw = String(text || '')
  const closeTag = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62) // 
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

function resolveExtractTextModel(
  episode?: { textModel?: string | null } | null,
  bodyModel?: string | null,
): string {
  const picked = resolveLocalEpisodeTextModel(episode, bodyModel)
  if (isLocalAgentCapableModel(picked)) return picked
  return DEFAULT_LOCAL_AGENT_MODEL
}

async function callExtractLlm(
  user: string,
  primaryModel: string,
): Promise<{ raw: string; model: string }> {
  const models = [primaryModel]
  if (primaryModel !== DEFAULT_LOCAL_AGENT_MODEL) models.push(DEFAULT_LOCAL_AGENT_MODEL)

  let lastRaw = ''
  for (const model of models) {
    const raw = await callTextChat(EXTRACT_SYSTEM, user, model, false, 300_000, true)
    lastRaw = raw
    if (extractJsonObject(raw)) {
      if (model !== primaryModel) {
        logTaskWarn('DramaExtract', 'fallback-model', { from: primaryModel, to: model })
      }
      return { raw, model }
    }
    logTaskWarn('DramaExtract', 'invalid-json', { model, preview: raw.slice(0, 240) })
  }

  return { raw: lastRaw, model: models[models.length - 1] }
}

function normalizeCharacters(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row: any) => ({
      name: String(row?.name || '').trim(),
      role: String(row?.role || '').trim(),
      description: String(row?.description || '').trim(),
      appearance: String(row?.appearance || '').trim(),
      personality: String(row?.personality || '').trim(),
    }))
    .filter(row => row.name && !/^(旁白|解说员|narrator)$/i.test(row.name))
}

function normalizeScenes(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row: any) => ({
      location: String(row?.location || '').trim(),
      time: String(row?.time || '').trim(),
      prompt: String(row?.prompt || row?.description || '').trim(),
    }))
    .filter(row => row.location)
}

export async function extractDramaEpisodeAssets(params: {
  episodeId: number
  dramaId: number
  script?: string
  textModel?: string | null
  textThinking?: boolean
}) {
  const { episodeId, dramaId } = params
  const script = String(params.script || readEpisodeScriptContent(episodeId) || '').trim()
  if (!script) {
    throw new Error('当前集剧本为空，请先在「原始内容」或「AI 改写」步骤填写并保存剧本')
  }

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  const textModel = resolveExtractTextModel(ep, params.textModel)

  const charCtx = listDramaCharactersForExtraction(episodeId, dramaId)
  const sceneCtx = listDramaScenesForExtraction(episodeId, dramaId)

  logTaskProgress('DramaExtract', 'llm-start', { episodeId, dramaId, model: textModel, scriptLength: script.length })

  const user = JSON.stringify({
    script: script.slice(0, 28000),
    existing_characters: charCtx.characters.map(c => ({
      name: c.name,
      role: c.role,
      appearance: c.appearance,
    })),
    existing_scenes: sceneCtx.scenes.map(s => ({
      location: s.location,
      time: s.time,
      prompt: s.prompt,
    })),
  })

  const { raw, model: usedModel } = await callExtractLlm(user, textModel)
  const parsed = extractJsonObject(raw)
  if (!parsed) {
    logTaskWarn('DramaExtract', 'invalid-json-final', { model: usedModel, preview: raw.slice(0, 240) })
    throw new Error('AI 返回格式无效，请重试；若仍失败可改用 Qwen 2.5 14B 或缩短剧本后再提取')
  }

  const characters = normalizeCharacters(parsed.characters)
  const scenes = normalizeScenes(parsed.scenes)
  if (!characters.length && !scenes.length) {
    throw new Error('未从剧本中识别到角色或场景，请确认剧本含对白与场景描写后重试')
  }

  const charResult = characters.length
    ? saveDedupExtractedCharacters(episodeId, dramaId, characters)
    : { created: 0, merged: 0 }
  const sceneResult = scenes.length
    ? saveDedupExtractedScenes(episodeId, dramaId, scenes)
    : { created: 0, reused: 0 }

  logTaskSuccess('DramaExtract', 'done', {
    episodeId,
    dramaId,
    characters: characters.length,
    scenes: scenes.length,
    ...charResult,
    ...sceneResult,
  })

  return {
    characters: charResult,
    scenes: sceneResult,
    extracted_characters: characters.length,
    extracted_scenes: scenes.length,
    model: usedModel,
  }
}
