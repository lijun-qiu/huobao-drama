/**
 * 解说配图 VLM 扫描 — 上传/生成后校验画面与旁白、配图文案是否一致
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { resolveEpisodeTextModel, resolveEpisodeTextThinking } from '../constants/text-models.js'
import { callVisionChat } from './text-chat.js'
import { parseNarrationImageMeta, storyboardNeedsOwnImage } from './narration-image.js'
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

const SCAN_SYSTEM = [
  '你是解说短视频配图质检员。根据镜头旁白、配图文案与上传图片，判断画面是否可用。',
  '只输出 JSON：',
  '{',
  '  "summary": "一句话总评",',
  '  "match_score": 0-100,',
  '  "matches_narration": true/false,',
  '  "matches_prompt": true/false,',
  '  "issues": ["具体问题，无则空数组"],',
  '  "suggestions": ["改图或改文案建议，无则空数组"]',
  '}',
].join('\n')

async function resolveStoryboardImageDataUrl(imagePath: string): Promise<string> {
  const trimmed = String(imagePath || '').trim()
  if (!trimmed) throw new Error('镜头尚无配图')
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed
  }
  const local = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  return readImageAsCompressedDataUrl(local, { maxWidth: 1280, maxHeight: 720, quality: 80 })
}

export async function scanNarrationStoryboardImage(
  storyboardId: number,
  options?: { textModel?: string | null; textThinking?: boolean },
) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')
  if (!storyboardNeedsOwnImage(sb)) throw new Error('该镜头无需独立配图')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const textModel = resolveEpisodeTextModel(ep, options?.textModel)
  const textThinking = resolveEpisodeTextThinking(ep, options?.textThinking)

  const imagePath = String(sb.composedImage || '').trim()
  const imageUrl = await resolveStoryboardImageDataUrl(imagePath)
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const narration = String(sb.dialogue || sb.description || '').trim()
  const imagePrompt = String(sb.imagePrompt || '').trim()

  const user = JSON.stringify({
    narration,
    image_prompt: imagePrompt,
    scene_content: meta.scene_content || '',
    narration_lines: meta.narration_lines || meta.image_narration_lines || [],
    image_source: meta.narration_image_source || 'unknown',
  })

  const raw = await callVisionChat(SCAN_SYSTEM, user, [imageUrl], textModel, textThinking, 120_000, true)
  const parsed = extractJsonObject(raw)
  if (!parsed) throw new Error('配图扫描返回无效 JSON')

  return {
    storyboard_id: storyboardId,
    model: textModel,
    image_path: imagePath,
    ...parsed,
  }
}
