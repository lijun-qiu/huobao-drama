/**
 * 解说配图 VLM 校验 — 默认本地 Qwen2.5-VL，判断画面是否与旁白/文案匹配且画风合适
 * 结果写入 storyboards.reference_images（持久化）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import { DEFAULT_LOCAL_VISION_MODEL, isLocalVisionOllamaModel } from '../constants/text-models.js'
import { now } from '../utils/response.js'
import { callVisionChat, supportsVisionTextModel } from './text-chat.js'
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
  '你是严苛的解说配图质检员。宁可误判不合格，也不要放过画面错误。',
  '',
  '【必须先做的检查，按顺序】',
  'A. 数手/脚/头：画面里每个完整人物是否恰好 2 手、2 脚、1 头？有没有多出来的手臂/手掌/腿？',
  'B. 查重复同人：是否出现两个脸型+发型+服装几乎相同的主角/主人公？（配角不同脸可以；双胞胎旁白明确写了才可）',
  'C. 查脸崩：五官错位、多嘴多眼、脸糊成一团？',
  'D. 对旁白：主体/动作/场景是否与 narration、image_prompt 大体一致？',
  'E. 查画风：是否 Q版/chibi、3D、真人照片、大字幕水印？',
  '',
  '【判定】',
  '- A/B/C 任一失败 → anatomy_ok=false 或 no_duplicate_identity=false，且 is_suitable=false，issues 必须写具体问题（如「主角有三只手」「画面有两个相同青年男主」）。',
  '- D/E 失败 → is_suitable=false。',
  '- 看不清、不确定 → 一律 is_suitable=false，issues 写「画面存疑：…」。',
  '- 只有 A～E 全部明确通过，才允许 is_suitable=true。',
  '- anatomy_ok、no_duplicate_identity、style_ok 三个字段必须输出，禁止省略。',
  '',
  '只输出 JSON：',
  '{',
  '  "summary": "一句话总评",',
  '  "is_suitable": true/false,',
  '  "match_score": 0-100,',
  '  "matches_narration": true/false,',
  '  "matches_prompt": true/false,',
  '  "style_ok": true/false,',
  '  "anatomy_ok": true/false,',
  '  "no_duplicate_identity": true/false,',
  '  "hand_count_notes": "简短描述每人手数，如：主角可见2手",',
  '  "person_count_notes": "简短描述人数与是否同款，如：1主角+1不同配角",',
  '  "issues": ["具体问题，无则空数组"],',
  '  "suggestions": ["改图建议，无则空数组"]',
  '}',
].join('\n')

function resolveScanVisionModel(override?: string | null): string {
  const picked = String(override || '').trim()
  if (picked && supportsVisionTextModel(picked)) return picked
  if (picked && isLocalVisionOllamaModel(picked)) return picked
  return LOCAL_COMIC_ENV.ollamaVisionModel || DEFAULT_LOCAL_VISION_MODEL
}

async function resolveStoryboardImageDataUrl(imagePath: string): Promise<string> {
  const trimmed = String(imagePath || '').trim()
  if (!trimmed) throw new Error('镜头尚无配图')
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed
  }
  const local = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  return readImageAsCompressedDataUrl(local, { maxWidth: 1280, maxHeight: 720, quality: 80 })
}

function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

/** true / false / 未给出 */
function readTriState(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return null
}

function looksLikeAnatomyIssue(text: string): boolean {
  return /三只手|三只脚|多[了一]只|多余.*(手|脚|臂|腿)|手数异常|肢体.*(异常|畸形|融化|乱接)|断肢|多张嘴|多只眼|五官错位|手从|粘连成爪/.test(text)
}

function looksLikeDuplicateIssue(text: string): boolean {
  return /重复.*(主角|主人公|同人)|两个相同|两个一样|分身|双人.*同款|同款.*(两个|双)|一模一样.*两个|复制.*(人|角色)/.test(text)
}

/** 合并写入校验结果，保留 reference_images 其它字段 */
export function mergeStoryboardImageValidateMeta(
  referenceImages: string | null | undefined,
  payload: {
    at: string
    model: string
    is_suitable: boolean
    match_score: number | null
    summary: string
    issues: string[]
    suggestions: string[]
    matches_narration: boolean
    matches_prompt: boolean
    style_ok: boolean
  },
): string {
  let base: Record<string, unknown> = { narration_image_mode: 'inherit' }
  try {
    const parsed = JSON.parse(String(referenceImages || '{}'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>
    }
  } catch {
    // keep default
  }
  return JSON.stringify({
    ...base,
    image_validate_at: payload.at,
    image_validate_model: payload.model,
    image_validate_is_suitable: payload.is_suitable,
    image_validate_score: payload.match_score,
    image_validate_summary: payload.summary,
    image_validate_issues: payload.issues,
    image_validate_suggestions: payload.suggestions,
    image_validate_matches_narration: payload.matches_narration,
    image_validate_matches_prompt: payload.matches_prompt,
    image_validate_style_ok: payload.style_ok,
  })
}

export async function scanNarrationStoryboardImage(
  storyboardId: number,
  options?: { textModel?: string | null; visionModel?: string | null; textThinking?: boolean },
) {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error('镜头不存在')
  if (!storyboardNeedsOwnImage(sb)) throw new Error('该镜头无需独立配图')

  const visionModel = resolveScanVisionModel(options?.visionModel || options?.textModel)
  const thinkingEnabled = isLocalVisionOllamaModel(visionModel)
    ? false
    : options?.textThinking !== false

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
    task: '严格质检该配图。先数手/人数，再对旁白与画风。不确定则判不合格。',
    must_check: [
      '每人是否只有两只手、两只脚、一个头',
      '是否出现两个相同主角/同款分身',
      '是否与旁白、配图文案一致',
      '是否有Q版/3D/真人/大字幕',
    ],
    output_required_fields: ['anatomy_ok', 'no_duplicate_identity', 'style_ok', 'is_suitable', 'issues'],
  })

  const raw = await callVisionChat(SCAN_SYSTEM, user, [imageUrl], visionModel, thinkingEnabled, 180_000, true)
  const parsed = extractJsonObject(raw)
  if (!parsed) throw new Error('配图校验返回无效 JSON')

  const matchesNarration = readTriState(parsed.matches_narration ?? parsed.matchesNarration)
  const matchesPrompt = readTriState(parsed.matches_prompt ?? parsed.matchesPrompt)
  const styleOk = readTriState(parsed.style_ok ?? parsed.styleOk)
  const anatomyOk = readTriState(parsed.anatomy_ok ?? parsed.anatomyOk)
  const noDuplicateIdentity = readTriState(parsed.no_duplicate_identity ?? parsed.noDuplicateIdentity)
  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter(Boolean) : []
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean) : []
  const scoreRaw = Number(parsed.match_score ?? parsed.matchScore)
  const matchScore = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null

  const issueText = issues.join('；')
  const anatomyIssueHint = looksLikeAnatomyIssue(issueText)
  const duplicateIssueHint = looksLikeDuplicateIssue(issueText)
  const handNotes = String(parsed.hand_count_notes ?? parsed.handCountNotes ?? '').trim()
  const personNotes = String(parsed.person_count_notes ?? parsed.personCountNotes ?? '').trim()

  // 合格门槛收紧：人体/重复字段必须显式 true；缺字段或模型空喊合格都不算过
  let isSuitable = asBool(parsed.is_suitable ?? parsed.isSuitable)
    && anatomyOk === true
    && noDuplicateIdentity === true
    && styleOk !== false
    && matchesNarration !== false
    && issues.length === 0
    && (matchScore == null || matchScore >= 70)

  if (anatomyOk === false || noDuplicateIdentity === false || styleOk === false) isSuitable = false
  if (anatomyIssueHint || duplicateIssueHint) isSuitable = false
  if (anatomyOk == null || noDuplicateIdentity == null) {
    // 模型未返回关键人体字段 → 不得合格
    isSuitable = false
    if (!issues.some(i => /人体|手数|重复|未完成检查|存疑/.test(i))) {
      issues.push('模型未完成人体/重复同人检查（缺 anatomy_ok 或 no_duplicate_identity），请重试或人工复核')
    }
  }
  if (issues.length && matchScore != null && matchScore < 70) isSuitable = false

  let summary = String(parsed.summary || '').trim()
  if (!summary) {
    summary = isSuitable ? '配图合适' : (issues[0] || '配图不合适')
  }
  if (!isSuitable && anatomyOk == null && !/未完成检查|存疑|不合适/.test(summary)) {
    summary = `质检未完成关键人体检查：${summary}`
  }

  const validatedAt = now()
  const referenceImages = mergeStoryboardImageValidateMeta(sb.referenceImages, {
    at: validatedAt,
    model: visionModel,
    is_suitable: isSuitable,
    match_score: matchScore,
    summary,
    issues,
    suggestions,
    matches_narration: matchesNarration !== false,
    matches_prompt: matchesPrompt !== false,
    style_ok: styleOk !== false,
  })

  db.update(schema.storyboards)
    .set({ referenceImages, updatedAt: validatedAt })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  return {
    storyboard_id: storyboardId,
    model: visionModel,
    image_path: imagePath,
    summary,
    is_suitable: isSuitable,
    match_score: matchScore,
    matches_narration: matchesNarration !== false,
    matches_prompt: matchesPrompt !== false,
    style_ok: styleOk !== false,
    anatomy_ok: anatomyOk === true,
    no_duplicate_identity: noDuplicateIdentity === true,
    hand_count_notes: handNotes || undefined,
    person_count_notes: personNotes || undefined,
    issues,
    suggestions,
    image_validate_at: validatedAt,
    reference_images: referenceImages,
  }
}
