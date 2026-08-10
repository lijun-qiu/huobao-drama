/**
 * 解说图生视频：按 Toonflow 视频提示词规则（五维度双语）生成 video_prompt。
 * 规则拼装仅作 LLM 失败兜底；禁止把配图全文前 N 字（常为 @图/对照标签）当视频 prompt。
 */

import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { defaultNarrationHighlightSoundEffect } from '../constants/narration-highlight.js'
import {
  resolveEpisodeTextModel,
} from '../constants/text-models.js'
import { parseProductionMode } from '../constants/production-mode.js'
import {
  buildToonflowVideoPromptLLMSystem,
  buildToonflowVideoPromptRuleFallback,
  isToonflowVideoPromptStructure,
  sanitizeToonflowVideoPrompt,
  TOONFLOW_VIDEO_STYLE_EN_DEFAULT,
  TOONFLOW_VIDEO_STYLE_ZH_DEFAULT,
} from '../constants/toonflow-video-llm.js'
import {
  buildComposeUnitMergedTtsText,
} from './ffmpeg-compose.js'
import {
  isStoryboardTitleShot,
  parseNarrationImageMeta,
  resolveStoryboardImageAnchorShot,
  sortStoryboardsByOrder,
} from './narration-image.js'
import { callTextChat } from './text-chat.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

export { extractVideoPromptForModel } from '../constants/toonflow-video-llm.js'

function cleanMotionText(s: string): string {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/旁白\s*[:：]\s*/g, '')
    .replace(/@图\d+/g, '')
    .replace(/对照定妆「[^」]+」/g, '')
    .replace(/对照场景「[^」]+」/g, '')
    .replace(/对照道具「[^」]+」/g, '')
    .replace(/【定妆参考顺序：[^\]]*】/g, '')
    .replace(/【场景参考：[^\]]*】/g, '')
    .replace(/【道具参考顺序：[^\]]*】/g, '')
    .replace(/（[^）]{0,8}）/g, (m) => (/男性|女性/.test(m) ? '' : m))
    .replace(/\s+/g, ' ')
    .trim()
}

/** 抽取 Toonflow【画面】段；无则去掉壳后取正文 */
export function extractImageSceneForVideoPrompt(imagePrompt?: string | null): string {
  const raw = String(imagePrompt || '').trim()
  if (!raw) return ''
  const huamian = raw.match(/【画面】([\s\S]*?)(?=\n*【(?:风格|画风|定妆|场景|道具)|$)/)
  if (huamian?.[1]) {
    return cleanMotionText(huamian[1]).slice(0, 220)
  }
  const stripped = raw
    .split(/\n+/)
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      if (/^@图\d+/.test(t)) return false
      if (/^对照(定妆|场景|道具)/.test(t)) return false
      if (/^【定妆参考|^【场景参考|^【道具参考/.test(t)) return false
      if (/^【风格】|^保持 @图/.test(t)) return false
      return true
    })
    .join(' ')
    .replace(/【画面】/g, '')
  return cleanMotionText(stripped).slice(0, 220)
}

export function extractNarrationBeatForVideoPrompt(paragraph?: string | null): string {
  return cleanMotionText(String(paragraph || '')).slice(0, 160)
}

/**
 * 规则兜底：Toonflow 五维双语模板（非配图全文截断）。
 * highlight 时走强化运动措辞，仍保持同一结构。
 */
export function buildNarrationVideoMotionPrompt(opts: {
  imagePrompt?: string | null
  paragraph?: string | null
  highlight?: boolean
  highlightReason?: string | null
  durationSec?: number | null
  shotType?: string | null
  movement?: string | null
  roleNames?: string[] | null
  sceneLabel?: string | null
  propLabels?: string[] | null
  soundEffect?: string | null
}): string {
  const scene = extractImageSceneForVideoPrompt(opts.imagePrompt)
  const para = extractNarrationBeatForVideoPrompt(opts.paragraph)
  const soundEffect = opts.soundEffect
    || (opts.highlight ? defaultNarrationHighlightSoundEffect(opts.highlightReason) : undefined)

  return buildToonflowVideoPromptRuleFallback({
    scene,
    paragraph: para,
    durationSec: opts.durationSec,
    shotType: opts.shotType,
    movement: opts.movement,
    roleNames: opts.roleNames,
    sceneLabel: opts.sceneLabel,
    propLabels: opts.propLabels,
    soundEffect,
    highlight: !!opts.highlight,
    highlightReason: opts.highlightReason,
    styleEn: TOONFLOW_VIDEO_STYLE_EN_DEFAULT,
    styleZh: TOONFLOW_VIDEO_STYLE_ZH_DEFAULT,
  })
}

function cleanWanPromptText(s: string): string {
  return String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
}

export function sanitizeVideoMotionPrompt(raw: string): string {
  return sanitizeToonflowVideoPrompt(raw)
}

type ShotVideoPromptContext = {
  paragraph: string
  imagePrompt: string
  scene: string
  highlight: boolean
  highlightReason?: string
  durationSec: number
  shotType?: string
  movement?: string
  location?: string
  atmosphere?: string
  action?: string
  soundEffect?: string
  roleNames: string[]
  sceneLabel?: string
  propLabels: string[]
  dramaTitle?: string
  dramaGenre?: string
  artStyle?: string
}

function extractPortraitLabels(imagePrompt: string): string[] {
  return [...String(imagePrompt || '').matchAll(/对照定妆「([^」]+)」/g)]
    .map(m => String(m[1] || '').replace(/（[^）]*）/g, '').trim())
    .filter(Boolean)
}

function extractSceneLabel(imagePrompt: string): string | undefined {
  const m = String(imagePrompt || '').match(/对照场景「([^」]+)」/)
  return m?.[1]?.trim() || undefined
}

function extractPropLabels(imagePrompt: string): string[] {
  return [...String(imagePrompt || '').matchAll(/对照道具「([^」]+)」/g)]
    .map(m => String(m[1] || '').trim())
    .filter(Boolean)
}

function resolveShotRoleNames(
  sb: typeof schema.storyboards.$inferSelect,
  imagePrompt: string,
): string[] {
  const fromPrompt = extractPortraitLabels(imagePrompt)
  if (fromPrompt.length) return [...new Set(fromPrompt)].slice(0, 4)
  const links = db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, sb.id))
    .all()
  const names: string[] = []
  for (const link of links) {
    const [ch] = db.select({ name: schema.characters.name, variant: schema.characters.variantLabel })
      .from(schema.characters)
      .where(eq(schema.characters.id, link.characterId))
      .all()
    if (!ch?.name) continue
    const label = ch.variant ? `${ch.name}·${ch.variant}` : ch.name
    names.push(label)
  }
  return [...new Set(names)].slice(0, 4)
}

function collectShotVideoPromptContext(
  sb: typeof schema.storyboards.$inferSelect,
  episodeSbs: typeof schema.storyboards.$inferSelect[],
): ShotVideoPromptContext {
  const anchor = resolveStoryboardImageAnchorShot(episodeSbs, sb.id) ?? sb
  const meta = parseNarrationImageMeta(anchor.referenceImages)
  const paragraph = cleanWanPromptText(
    buildComposeUnitMergedTtsText(sb.id, episodeSbs)
      || String(sb.dialogue || sb.description || '').trim(),
  )
  const imagePrompt = String(
    anchor.imagePrompt
    || meta.image_prompt_llm_raw
    || meta.scene_content
    || anchor.description
    || '',
  ).trim()
  const durationRaw = Number(sb.duration || 0)
  const durationSec = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.min(13, Math.max(2, Math.round(durationRaw)))
    : 10
  return {
    paragraph,
    imagePrompt,
    scene: extractImageSceneForVideoPrompt(imagePrompt),
    highlight: !!meta.highlight_motion,
    highlightReason: meta.highlight_reason ? String(meta.highlight_reason) : undefined,
    durationSec,
    shotType: String(sb.shotType || '').trim() || undefined,
    movement: String(sb.movement || '').trim() || undefined,
    location: String(sb.location || '').trim() || undefined,
    atmosphere: String(sb.atmosphere || '').trim() || undefined,
    action: String(sb.action || '').trim() || undefined,
    soundEffect: String(sb.soundEffect || '').trim() || undefined,
    roleNames: resolveShotRoleNames(sb, imagePrompt),
    sceneLabel: extractSceneLabel(imagePrompt) || String(sb.location || '').trim() || undefined,
    propLabels: extractPropLabels(imagePrompt),
  }
}

/** Toonflow 风格 videoDesc 摘要（供 LLM 对齐字段） */
function buildToonflowVideoDescLine(ctx: ShotVideoPromptContext): string {
  const roles = ctx.roleNames.length ? ctx.roleNames.join('/') : '无角色'
  const assets = [
    ctx.sceneLabel,
    ...ctx.roleNames,
    ...ctx.propLabels,
  ].filter(Boolean).join('/') || '无'
  const line = [
    ctx.scene || ctx.action || '画面与配图一致',
    ctx.sceneLabel || ctx.location || '场景',
    assets,
    `${ctx.durationSec}s`,
    ctx.shotType || '中景',
    ctx.movement || '固定',
    ctx.action || '角色自然动作',
    ctx.highlight ? (ctx.highlightReason || '紧张冲击') : (ctx.atmosphere || '日常'),
    ctx.atmosphere || '自然光',
    ctx.paragraph || '无台词',
    ctx.soundEffect || '环境声',
    '本地分镜',
  ].join('、')
  return `（${line}）`
}

function buildRulePromptForContext(ctx: ShotVideoPromptContext): string {
  return buildNarrationVideoMotionPrompt({
    imagePrompt: ctx.imagePrompt,
    paragraph: ctx.paragraph,
    highlight: ctx.highlight,
    highlightReason: ctx.highlightReason,
    durationSec: ctx.durationSec,
    shotType: ctx.shotType,
    movement: ctx.movement,
    roleNames: ctx.roleNames,
    sceneLabel: ctx.sceneLabel,
    propLabels: ctx.propLabels,
    soundEffect: ctx.soundEffect,
  })
}

async function generateVideoMotionPromptWithLLM(
  ctx: ShotVideoPromptContext,
  opts?: { textModel?: string | null; textThinking?: boolean },
): Promise<string> {
  if (!ctx.scene && !ctx.paragraph && !ctx.imagePrompt) {
    throw new Error('缺少配图文案或旁白，无法生成视频描述')
  }

  const system = buildToonflowVideoPromptLLMSystem({
    styleEn: TOONFLOW_VIDEO_STYLE_EN_DEFAULT,
    styleZh: ctx.artStyle
      ? `${TOONFLOW_VIDEO_STYLE_ZH_DEFAULT}（${ctx.artStyle}）`
      : TOONFLOW_VIDEO_STYLE_ZH_DEFAULT,
  })

  const assetLines = [
    ctx.sceneLabel ? `[S1, scene, ${ctx.sceneLabel}]` : '',
    ...ctx.roleNames.map((name, i) => `[R${i + 1}, role, ${name}]`),
    ...ctx.propLabels.map((name, i) => `[P${i + 1}, prop, ${name}]`),
  ].filter(Boolean)

  const userParts = [
    ctx.dramaTitle ? `作品：${ctx.dramaTitle}` : '',
    ctx.dramaGenre ? `题材：${ctx.dramaGenre}` : '',
    '模式：通用首尾帧/单图图生视频（Agnes / Wan）',
    `目标时长：${ctx.durationSec} 秒`,
    ctx.highlight ? `强化运动：是${ctx.highlightReason ? `（${ctx.highlightReason}）` : ''}` : '强化运动：否',
    assetLines.length ? `资产信息${assetLines.join(', ')}` : '资产信息（无显式资产）',
    `分镜信息：<storyboardItem videoDesc='${buildToonflowVideoDescLine(ctx).replace(/'/g, '’')}' duration='${ctx.durationSec}'></storyboardItem>`,
    ctx.scene ? `配图【画面】参考（勿输出 @图 标签）：\n${ctx.scene.slice(0, 360)}` : '',
    ctx.paragraph ? `旁白/台词原文（须写入【音频】，旁白用画外音VO）：\n${ctx.paragraph.slice(0, 360)}` : '台词：无台词',
    '请按 Toonflow 格式输出完整 ===EN=== + ===ZH=== 五维度视频提示词，不要解释。',
  ].filter(Boolean)

  const raw = (await callTextChat(
    system,
    userParts.join('\n\n'),
    opts?.textModel || null,
    opts?.textThinking === true,
    180_000,
    false,
    3200,
  )).trim()

  const cleaned = sanitizeVideoMotionPrompt(raw)
  if (!cleaned || cleaned.length < 40) {
    throw new Error('AI 未返回有效视频描述')
  }
  // 必须是 Toonflow 五维结构，否则走规则兜底（同样是双语五维）
  if (!isToonflowVideoPromptStructure(cleaned)) {
    throw new Error('AI 未返回 Toonflow 结构视频描述')
  }
  return cleaned
}

async function loadDramaMetaForEpisode(episodeId: number): Promise<{
  dramaTitle?: string
  dramaGenre?: string
  artStyle?: string
  productionMode?: string | null
  episode: typeof schema.episodes.$inferSelect
}> {
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) throw new Error('剧集不存在')
  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
  return {
    episode: ep,
    dramaTitle: drama?.title ? String(drama.title) : undefined,
    dramaGenre: drama?.genre ? String(drama.genre) : undefined,
    artStyle: drama?.style ? String(drama.style) : undefined,
    productionMode: drama ? parseProductionMode(drama.metadata) : null,
  }
}

export type RegenerateVideoPromptOptions = {
  force?: boolean
  textModel?: string | null
  textThinking?: boolean
  /** 失败时是否回退规则拼装（默认 true） */
  allowRuleFallback?: boolean
}

/** 单镜：LLM 生成并落库 video_prompt */
export async function regenerateStoryboardVideoPrompt(
  storyboardId: number,
  opts?: RegenerateVideoPromptOptions,
): Promise<{
  storyboardId: number
  videoPrompt: string
  skipped?: boolean
  source?: 'llm' | 'rule' | 'existing'
  model?: string
} | null> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) return null
  const existing = String(sb.videoPrompt || '').trim()
  if (!opts?.force && existing) {
    return { storyboardId, videoPrompt: existing, skipped: true, source: 'existing' }
  }

  const meta = await loadDramaMetaForEpisode(sb.episodeId)
  const textModel = resolveEpisodeTextModel(meta.episode, opts?.textModel, meta.productionMode)
  // 视频描述短输出：默认关思考，更稳更快；显式传 true 才开
  const thinking = opts?.textThinking === true

  const episodeSbs = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .all()
  const ctx: ShotVideoPromptContext = {
    ...collectShotVideoPromptContext(sb, episodeSbs),
    dramaTitle: meta.dramaTitle,
    dramaGenre: meta.dramaGenre,
    artStyle: meta.artStyle,
  }

  logTaskStart('NarrationVideoPrompt', 'generate', { storyboardId, textModel })
  let videoPrompt = ''
  let source: 'llm' | 'rule' = 'llm'
  try {
    videoPrompt = await generateVideoMotionPromptWithLLM(ctx, { textModel, textThinking: thinking })
    logTaskSuccess('NarrationVideoPrompt', 'generate', { storyboardId, source: 'llm', len: videoPrompt.length })
  } catch (err: any) {
    logTaskError('NarrationVideoPrompt', 'generate', { storyboardId, error: err?.message || err })
    if (opts?.allowRuleFallback === false) throw err
    videoPrompt = buildRulePromptForContext(ctx)
    source = 'rule'
  }

  db.update(schema.storyboards)
    .set({ videoPrompt, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()
  return { storyboardId, videoPrompt, source, model: textModel }
}

/** 整集：批量 LLM 生成 video_prompt（串行，避免免费模型限流） */
export async function regenerateEpisodeVideoPrompts(
  episodeId: number,
  opts?: RegenerateVideoPromptOptions & { onlyMissing?: boolean },
): Promise<{
  scanned: number
  updated: number
  skipped: number
  failed: number
  sourceLlm: number
  sourceRule: number
  model?: string
}> {
  const force = !!opts?.force
  const onlyMissing = opts?.onlyMissing !== false && !force
  const meta = await loadDramaMetaForEpisode(episodeId)
  const textModel = resolveEpisodeTextModel(meta.episode, opts?.textModel, meta.productionMode)
  const thinking = opts?.textThinking === true ? true : false

  const all = sortStoryboardsByOrder(
    db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all(),
  )

  let scanned = 0
  let updated = 0
  let skipped = 0
  let failed = 0
  let sourceLlm = 0
  let sourceRule = 0

  logTaskStart('NarrationVideoPrompt', 'batch', { episodeId, force, onlyMissing, textModel })

  for (const sb of all) {
    if (isStoryboardTitleShot(sb)) continue
    scanned++
    const existing = String(sb.videoPrompt || '').trim()
    if (onlyMissing && existing) {
      skipped++
      continue
    }
    if (!force && existing) {
      skipped++
      continue
    }

    const ctx: ShotVideoPromptContext = {
      ...collectShotVideoPromptContext(sb, all),
      dramaTitle: meta.dramaTitle,
      dramaGenre: meta.dramaGenre,
      artStyle: meta.artStyle,
    }

    let videoPrompt = ''
    try {
      videoPrompt = await generateVideoMotionPromptWithLLM(ctx, { textModel, textThinking: thinking })
      sourceLlm++
    } catch (err: any) {
      logTaskError('NarrationVideoPrompt', 'batch-shot', {
        episodeId,
        storyboardId: sb.id,
        error: err?.message || err,
      })
      if (opts?.allowRuleFallback === false) {
        failed++
        continue
      }
      videoPrompt = buildRulePromptForContext(ctx)
      sourceRule++
    }

    db.update(schema.storyboards)
      .set({ videoPrompt, updatedAt: now() })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    updated++
  }

  logTaskSuccess('NarrationVideoPrompt', 'batch', {
    episodeId,
    scanned,
    updated,
    skipped,
    failed,
    sourceLlm,
    sourceRule,
  })

  return { scanned, updated, skipped, failed, sourceLlm, sourceRule, model: textModel }
}
