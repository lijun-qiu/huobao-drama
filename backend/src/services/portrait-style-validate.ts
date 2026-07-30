/**
 * 定妆图「画风不标准」校验 — 默认走本地 Ollama Qwen2.5-VL
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { DEFAULT_LOCAL_VISION_MODEL } from '../constants/text-models.js'
import { callVisionChat } from './text-chat.js'
import { readImageAsCompressedDataUrl } from '../utils/storage.js'

function extractJsonObject(text: string) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    // fall through
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

const VALIDATE_SYSTEM = [
  '你是短剧解说定妆图质检员。判断角色定妆图是否符合「短剧解说高清国漫」标准。',
  '标准要求：正常头身比国漫半身定妆、清晰脸部、硬边赛璐璐/冷色戏剧光、面无夸张表情、背景简洁、人体结构正常。',
  '不标准包括（命中任一条则 is_standard=false）：',
  'Q版/三头身/chibi、3D渲染、真人照片、新海诚暖金柔光、水彩糊边、粗条漫黑线、多脸/转面表、画面内文字水印、',
  '严重畸形断肢、三只手/多余手臂、手指粘连、两个相同人脸/重复同人、全身小人人贴在大空白里、与定妆无关的复杂剧情场景。',
  '只输出 JSON：',
  '{',
  '  "is_standard": true/false,',
  '  "score": 0-100,',
  '  "summary": "一句话总评",',
  '  "issues": ["不标准问题，须点名如「三只手」「出现两张相同脸」，无则空数组"],',
  '  "suggestions": ["改图建议，无则空数组"]',
  '}',
].join('\n')

function resolveVisionModel(override?: string | null): string {
  const picked = String(override || '').trim()
  if (picked) return picked
  return LOCAL_COMIC_ENV.ollamaVisionModel || DEFAULT_LOCAL_VISION_MODEL
}

async function resolvePortraitImageDataUrl(imagePath: string): Promise<string> {
  const trimmed = String(imagePath || '').trim()
  if (!trimmed) throw new Error('角色尚无定妆图')
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed
  }
  const local = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  return readImageAsCompressedDataUrl(local, { maxWidth: 768, maxHeight: 1024, quality: 78 })
}

export async function validateCharacterPortraitStyle(
  characterId: number,
  options?: { visionModel?: string | null; imageUrl?: string | null },
) {
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).all()
  if (!char) throw new Error('角色不存在')

  const imagePath = String(options?.imageUrl || char.imageUrl || '').trim()
  if (!imagePath) throw new Error('请先生成或上传定妆图')

  const visionModel = resolveVisionModel(options?.visionModel)
  const imageUrl = await resolvePortraitImageDataUrl(imagePath)
  const user = JSON.stringify({
    character_name: char.name || '',
    character_role: char.role || '',
    appearance: String(char.appearance || '').slice(0, 400),
    task: '校验该定妆图是否画风不标准',
  })

  const raw = await callVisionChat(VALIDATE_SYSTEM, user, [imageUrl], visionModel, false, 180_000, true)
  const parsed = extractJsonObject(raw)
  if (!parsed) throw new Error('画风校验返回无效 JSON')

  const isStandard = parsed.is_standard === true || parsed.is_standard === 'true' || parsed.isStandard === true
  const scoreRaw = Number(parsed.score)
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null
  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter(Boolean) : []
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean) : []

  return {
    character_id: characterId,
    character_name: char.name,
    model: visionModel,
    image_path: imagePath,
    is_standard: isStandard,
    score,
    summary: String(parsed.summary || (isStandard ? '画风符合标准' : '画风不标准')).trim(),
    issues,
    suggestions,
  }
}
