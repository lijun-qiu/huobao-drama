import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import {
  coerceMinimalLLMImagePrompt,
  resolveLLMImagePrompt,
  hasNarrationForbiddenStyleIssue,
  hasNarrationMultipleProtagonistIssue,
  hasNarrationPartialCloseupIssue,
  hasNarrationFaceCloseupVsActionIssue,
  repairNarrationFaceCloseupVsActionPrompt,
  hasNarrationRedundantTextureIssue,
  hasNarrationSixDimOrderIssue,
  hasNarrationSixDimStructure,
  hasNarrationSpecificYearIssue,
  hasNarrationUniversalPrefixIssue,
  isNarrationMinimalStyle,
  isNarrationStructuredStyle,
  usesComicIllustrationPipeline,
  NARRATION_UNIVERSAL_SCENE_SUFFIX,
  VIOLENCE_IMAGE_DETECT_RE,
  sanitizeSceneImagePrompt,
} from '../constants/art-styles.js'
import { deriveMotionComicShotMetaFromImagePrompt } from '../constants/motion-comic.js'
import { parseNarrationImageMeta, buildNarrationImageMeta } from './narration-image.js'
import { now } from '../utils/response.js'

export type NarrationPromptAuditIssue = {
  code: string
  label: string
  category: 'violence' | 'clothing' | 'style' | 'format' | 'character' | 'redundancy'
  severity: 'warn' | 'error'
}

export type NarrationPromptAuditItem = {
  storyboard_id: number
  storyboard_number: number
  title: string
  prompt: string
  image_prompt_source?: string | null
  can_restore?: boolean
  issues: NarrationPromptAuditIssue[]
}

function countProtagonistMentionsInSixDimBody(text: string): number {
  const bodyStart = text.search(/【画面主体[：:]/)
  const body = bodyStart >= 0 ? text.slice(bodyStart) : text
  return (body.match(/主人公/g) || []).length
}

function hasRedundantSuffixIssue(text: string): boolean {
  const suffixParts = NARRATION_UNIVERSAL_SCENE_SUFFIX.split(/[，,]/).map(s => s.trim()).filter(Boolean)
  for (const part of suffixParts) {
    if (!part) continue
    const matches = text.match(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
    if (matches && matches.length > 1) return true
  }
  return /极简简笔叙事风格.*无文字无水印.*极简简笔/.test(text)
}

function hasTitleLegacyFormatIssue(text: string): boolean {
  return /【片头背景场景|【主题氛围/.test(text)
}

/** 第三步：按万能模板结构审计（不针对具体物件名） */
export function auditNarrationImagePromptText(
  prompt?: string | null,
  style?: string | null,
): NarrationPromptAuditIssue[] {
  const text = String(prompt || '').trim()
  if (!text) {
    return [{ code: 'empty', label: '配图文案为空', category: 'format', severity: 'error' }]
  }

  const minimal = isNarrationMinimalStyle(style)
  const structured = isNarrationStructuredStyle(style)
  const motionComic = usesComicIllustrationPipeline(style)
  const issues: NarrationPromptAuditIssue[] = []

  if (VIOLENCE_IMAGE_DETECT_RE.test(text)) {
    issues.push({
      code: 'violence',
      label: '含血腥/暴力/尸体等描写',
      category: 'violence',
      severity: 'error',
    })
  }

  // 漫画解说 / 小说彩漫四格改为整段文案：不再审计【】六维标签结构
  if (structured && !motionComic) {
    if (!hasNarrationSixDimStructure(text)) {
      issues.push({
        code: 'missing_six_dim',
        label: '缺少万能模板六维结构',
        category: 'format',
        severity: 'warn',
      })
    }
    if (hasNarrationSixDimOrderIssue(text)) {
      issues.push({
        code: 'six_dim_order',
        label: '六维标签顺序不符合万能模板',
        category: 'format',
        severity: 'error',
      })
    }
    if (minimal && hasNarrationUniversalPrefixIssue(text)) {
      issues.push({
        code: 'missing_prefix',
        label: '缺少或偏离【画风规格】（16:9 + 素体规格）',
        category: 'format',
        severity: 'warn',
      })
    } else if (!minimal && !/【画风规格[：:][^】]*2D\s*动漫/.test(text) && !/赛璐璐/.test(text)) {
      issues.push({
        code: 'missing_anime_prefix',
        label: '缺少或偏离【画风规格】（16:9 + 2D 动漫规格）',
        category: 'format',
        severity: 'warn',
      })
    }
    if (hasTitleLegacyFormatIssue(text)) {
      issues.push({
        code: 'title_legacy',
        label: '仍使用片头专用标签（应改为六维）',
        category: 'format',
        severity: 'warn',
      })
    }
    if (hasNarrationMultipleProtagonistIssue(text)) {
      issues.push({
        code: 'multi_protagonist',
        label: '【画面主体】违反万能模板唯一主人公规则',
        category: 'character',
        severity: 'error',
      })
    }
    if (hasNarrationPartialCloseupIssue(text)) {
      issues.push({
        code: 'partial_closeup',
        label: '肢体局部特写与全身主人公冲突（裤脚/猫爪/接触点机位）',
        category: 'format',
        severity: 'warn',
      })
    }
    if (hasNarrationFaceCloseupVsActionIssue(text)) {
      issues.push({
        code: 'face_closeup_vs_action',
        label: '近景/面部特写/头高过高，与坐姿・手部动作・道具冲突（易只出脸）',
        category: 'format',
        severity: 'warn',
      })
    }
    if (/黑色素体/.test(text)) {
      issues.push({
        code: 'black_body',
        label: '仍含黑色素体旧规格（应统一为白色素体）',
        category: 'character',
        severity: 'warn',
      })
    }
    if (hasNarrationRedundantTextureIssue(text)) {
      issues.push({
        code: 'redundant_texture',
        label: '【质感要求】复述前缀画风（应只写短补充项）',
        category: 'redundancy',
        severity: 'warn',
      })
    }
    if (countProtagonistMentionsInSixDimBody(text) > 2) {
      issues.push({
        code: 'protagonist_repeat',
        label: '六维正文中「主人公」重复过多',
        category: 'redundancy',
        severity: 'warn',
      })
    }
  }

  if (hasNarrationSpecificYearIssue(text)) {
    issues.push({
      code: 'year',
      label: '【年代场景】含具体年份数字',
      category: 'style',
      severity: 'warn',
    })
  }
  if (
    /CRT|显像管|米色(?:厚)?显示器|厚显示器/.test(text)
    && /全面屏|智能手机|超薄键盘|巧克力键盘|薄边框笔记本/.test(text)
  ) {
    issues.push({
      code: 'era_prop_clash',
      label: '电子产品跨代混搭（如CRT与现代智能机/超薄键鼠同框）',
      category: 'style',
      severity: 'warn',
    })
  }
  if (/手机背面|机箱背面|摄像头模组朝向|只露背面/.test(text)) {
    issues.push({
      code: 'screen_back',
      label: '带屏设备写成背面朝向镜头（应正面或略侧可见屏幕）',
      category: 'style',
      severity: 'warn',
    })
  }
  if (hasNarrationForbiddenStyleIssue(text)) {
    issues.push({
      code: 'forbidden_style',
      label: '含万能模板禁止的画风词',
      category: 'style',
      severity: 'warn',
    })
  }
  if (hasRedundantSuffixIssue(text)) {
    issues.push({
      code: 'redundant_suffix',
      label: '后缀画风词重复',
      category: 'redundancy',
      severity: 'warn',
    })
  }

  return issues
}

export function optimizeNarrationImagePromptText(
  prompt?: string | null,
  style?: string | null,
): string {
  const raw = String(prompt || '').trim()
  if (!raw) return ''
  const repaired = repairNarrationFaceCloseupVsActionPrompt(raw)
  if (isNarrationStructuredStyle(style)) return resolveLLMImagePrompt(repaired, style)
  return sanitizeSceneImagePrompt(repaired)
}

function listEpisodeImageAnchors(episodeId: number) {
  return db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .all()
    .filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new')
}

/** 第三步：仅扫描，不修改 */
export function auditEpisodeNarrationImagePrompts(episodeId: number, style?: string | null) {
  const anchors = listEpisodeImageAnchors(episodeId)
  const items: NarrationPromptAuditItem[] = anchors.map(sb => {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const prompt = String(sb.imagePrompt || '').trim()
    return {
      storyboard_id: sb.id,
      storyboard_number: sb.storyboardNumber,
      title: sb.title || '',
      prompt,
      image_prompt_source: meta.image_prompt_source || null,
      can_restore: meta.image_prompt_source === 'optimized' && !!meta.image_prompt_llm_raw,
      issues: auditNarrationImagePromptText(prompt, style),
    }
  })

  const issueCount = items.reduce((sum, item) => sum + item.issues.length, 0)
  const shotsWithIssues = items.filter(item => item.issues.length).length

  return {
    total: anchors.length,
    shots_with_issues: shotsWithIssues,
    issue_count: issueCount,
    items,
  }
}

/** 第三步：对指定镜头应用万能模板规则优化 */
export function optimizeEpisodeNarrationImagePrompts(
  episodeId: number,
  style?: string | null,
  storyboardIds?: number[],
) {
  const idSet = storyboardIds?.length ? new Set(storyboardIds) : null
  const anchors = listEpisodeImageAnchors(episodeId).filter(sb => !idSet || idSet.has(sb.id))
  if (!anchors.length) {
    return { optimized: 0, items: [] as Array<Record<string, unknown>> }
  }

  const ts = now()
  const items: Array<Record<string, unknown>> = []

  for (const sb of anchors) {
    const before = String(sb.imagePrompt || '').trim()
    if (!before) continue
    const after = optimizeNarrationImagePromptText(before, style)
    if (!after || after === before) {
      items.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        skipped: true,
        prompt: before,
      })
      continue
    }

    const meta = parseNarrationImageMeta(sb.referenceImages)
    const { narration_image_mode, ...restMeta } = meta
    const llmRawBackup = meta.image_prompt_llm_raw || before
    const derived = usesComicIllustrationPipeline(style)
      ? deriveMotionComicShotMetaFromImagePrompt(after)
      : null
    db.update(schema.storyboards)
      .set({
        imagePrompt: after,
        referenceImages: buildNarrationImageMeta(narration_image_mode, {
          ...restMeta,
          image_prompt_source: 'optimized',
          image_prompt_llm_raw: llmRawBackup,
        }),
        ...(derived
          ? {
            description: derived.description,
            location: derived.location,
            shotType: derived.shotType,
            angle: derived.angle,
            movement: derived.movement,
            action: derived.expressionAction,
          }
          : {}),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    items.push({
      storyboard_id: sb.id,
      storyboard_number: sb.storyboardNumber,
      before,
      after,
      issues_before: auditNarrationImagePromptText(before, style),
      issues_after: auditNarrationImagePromptText(after, style),
    })
  }

  return {
    optimized: items.filter(item => !item.skipped).length,
    items,
  }
}

/** 还原第三步优化前的 LLM 原文 */
export function restoreEpisodeNarrationImagePrompts(
  episodeId: number,
  storyboardIds?: number[],
) {
  const idSet = storyboardIds?.length ? new Set(storyboardIds) : null
  const anchors = listEpisodeImageAnchors(episodeId).filter(sb => !idSet || idSet.has(sb.id))
  if (!anchors.length) {
    return { restored: 0, items: [] as Array<Record<string, unknown>> }
  }

  const ts = now()
  const items: Array<Record<string, unknown>> = []

  for (const sb of anchors) {
    const meta = parseNarrationImageMeta(sb.referenceImages)
    const raw = String(meta.image_prompt_llm_raw || '').trim()
    if (!raw || meta.image_prompt_source !== 'optimized') {
      items.push({
        storyboard_id: sb.id,
        storyboard_number: sb.storyboardNumber,
        skipped: true,
      })
      continue
    }

    const { narration_image_mode, ...restMeta } = meta
    db.update(schema.storyboards)
      .set({
        imagePrompt: raw,
        referenceImages: buildNarrationImageMeta(narration_image_mode, {
          ...restMeta,
          image_prompt_source: 'llm_raw',
          image_prompt_llm_raw: raw,
        }),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()

    items.push({
      storyboard_id: sb.id,
      storyboard_number: sb.storyboardNumber,
      prompt: raw,
    })
  }

  return {
    restored: items.filter(item => !item.skipped).length,
    items,
  }
}
