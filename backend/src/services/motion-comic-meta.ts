import type {
  MotionComicCameraKind,
  MotionComicMotionTier,
  MotionComicShotRole,
  MotionComicStoryboardShot,
  MotionComicVfxKind,
} from '../constants/motion-comic.js'
import {
  inferMotionComicMotionTier,
  inferMotionComicShotRole,
  motionComicCameraKindToMovementLabel,
  motionComicCameraKindToShotType,
  motionComicShotNeedsDiptych,
  motionComicShotNeedsOwnImage,
  resolveMotionComicCameraKind,
} from '../constants/motion-comic.js'
import type { NarrationImageMeta, ParagraphLayout } from './narration-image.js'
import { parseNarrationImageMeta, buildNarrationImageMeta } from './narration-image.js'
import type { NarrationParagraph } from './narration-paragraph.js'
import type { MotionCameraOptions } from './motion-comic-camera.js'
import { resolveMotionComicVfxKind } from './motion-comic-vfx.js'

export type MotionComicImageMeta = NarrationImageMeta & {
  shot_role?: MotionComicShotRole
  motion_tier?: MotionComicMotionTier
  camera_kind?: MotionComicCameraKind
  vfx_kind?: MotionComicVfxKind
}

function resolveShotRole(
  role?: MotionComicShotRole | null,
  fallbackText?: string,
): MotionComicShotRole {
  if (role) return role
  return inferMotionComicShotRole(String(fallbackText || ''))
}

function buildMotionComicVisualMeta(
  role: MotionComicShotRole,
  expressionAction?: string | null,
  movement?: string | null,
  pageIndex = 0,
  shotType?: string | null,
  shotText?: string | null,
  shotIndex = 0,
): Pick<MotionComicImageMeta, 'shot_role' | 'motion_tier' | 'paragraph_layout' | 'camera_kind'> {
  return {
    shot_role: role,
    motion_tier: inferMotionComicMotionTier(role),
    paragraph_layout: 'single',
    camera_kind: resolveMotionComicCameraKind(role, {
      movement,
      shotType,
      shotText: shotText ?? expressionAction,
      pageIndex,
      shotIndex,
    }),
  }
}

export type MotionComicAnchorMotionMeta = {
  shot_role: MotionComicShotRole
  motion_tier: MotionComicMotionTier
  camera_kind: MotionComicCameraKind
  vfx_kind: MotionComicVfxKind
  movement: string
  shotType: string
}

/** 为配图段（1～3 句）推断运镜，整段共用一种 camera_kind */
export function buildMotionComicSegmentMotionMeta(
  sentences: string[],
  paragraphIndex: number,
  options?: {
    movement?: string | null
    shotType?: string | null
    expressionAction?: string | null
    sceneBackground?: string | null
    sceneContent?: string | null
  },
): MotionComicAnchorMotionMeta {
  const shotText = [
    options?.expressionAction,
    options?.sceneBackground,
    options?.sceneContent,
    ...sentences.map(s => String(s || '').trim()).filter(Boolean),
  ].filter(Boolean).join(' ')
  const role = inferMotionComicShotRole(shotText)
  const movementExplicit = String(options?.movement || '').trim()
  const useExplicitMovement = movementExplicit && movementExplicit !== '固定'
  const cameraKind = resolveMotionComicCameraKind(role, {
    movement: options?.movement,
    shotType: options?.shotType,
    shotText,
    pageIndex: paragraphIndex,
    shotIndex: paragraphIndex,
  })
  const vfxKind = resolveMotionComicVfxKind(shotText, {
    expressionAction: options?.expressionAction,
    sceneBackground: options?.sceneBackground,
    sceneContent: options?.sceneContent,
  })
  return {
    shot_role: role,
    motion_tier: inferMotionComicMotionTier(role),
    camera_kind: cameraKind,
    vfx_kind: vfxKind,
    movement: useExplicitMovement ? movementExplicit : motionComicCameraKindToMovementLabel(cameraKind),
    shotType: options?.shotType && options.shotType !== '中景'
      ? options.shotType
      : motionComicCameraKindToShotType(cameraKind),
  }
}

/** @deprecated 使用 buildMotionComicSegmentMotionMeta（整段一句或多句） */
export function buildMotionComicAnchorMotionMeta(
  sentence: string,
  shotIndex: number,
  options?: {
    movement?: string | null
    shotType?: string | null
    expressionAction?: string | null
    pageIndex?: number
  },
): MotionComicAnchorMotionMeta {
  return buildMotionComicSegmentMotionMeta(
    [sentence],
    options?.pageIndex ?? shotIndex,
    options,
  )
}

export function parseMotionComicImageMeta(referenceImages?: string | null): MotionComicImageMeta {
  const base = parseNarrationImageMeta(referenceImages)
  if (!referenceImages) return base as MotionComicImageMeta
  try {
    const parsed = JSON.parse(referenceImages) as Record<string, unknown>
    return {
      ...base,
      shot_role: parsed.shot_role as MotionComicShotRole | undefined,
      motion_tier: parsed.motion_tier as MotionComicMotionTier | undefined,
      camera_kind: (parsed.camera_kind ?? base.camera_kind) as MotionComicCameraKind | undefined,
      vfx_kind: (parsed.vfx_kind ?? base.vfx_kind) as MotionComicVfxKind | undefined,
    }
  } catch {
    return base as MotionComicImageMeta
  }
}

export function buildMotionComicStoryboardMeta(
  sentence: string,
  extra?: Partial<Omit<MotionComicImageMeta, 'narration_image_mode'>>,
): string {
  const role = resolveShotRole(extra?.shot_role, sentence)
  const visual = buildMotionComicVisualMeta(role, extra?.expression_action)
  const imageMode = motionComicShotNeedsOwnImage(role) ? 'new' as const : 'inherit' as const
  return buildNarrationImageMeta(imageMode, {
    ...extra,
    ...visual,
    narration_tts_mode: extra?.narration_tts_mode ?? 'new',
  })
}

export function buildMotionComicStoryboardMetaFromShot(
  shot: MotionComicStoryboardShot,
  extra?: Partial<Omit<MotionComicImageMeta, 'narration_image_mode' | 'shot_role' | 'motion_tier' | 'paragraph_layout' | 'camera_kind'>>,
  shotIndex = 0,
): string {
  const role = resolveShotRole(shot.shot_role, `${shot.dialogue} ${shot.expression_action}`)
  const shotText = `${shot.dialogue} ${shot.expression_action} ${shot.background || ''}`.trim()
  const visual = buildMotionComicVisualMeta(
    role,
    shot.expression_action,
    shot.movement,
    extra?.paragraph_index ?? 0,
    shot.shot_type,
    shotText,
    shotIndex,
  )
  const segmentMeta = buildMotionComicSegmentMotionMeta(
    [shot.dialogue],
    extra?.paragraph_index ?? shotIndex,
    {
      movement: shot.movement,
      shotType: shot.shot_type,
      expressionAction: shot.expression_action,
      sceneBackground: shot.background,
    },
  )
  const imageMode = motionComicShotNeedsOwnImage(role) ? 'new' as const : 'inherit' as const
  return buildNarrationImageMeta(imageMode, {
    ...extra,
    ...visual,
    vfx_kind: segmentMeta.vfx_kind,
    narration_tts_mode: extra?.narration_tts_mode ?? 'new',
    expression_action: shot.expression_action,
    scene_background: shot.background,
  })
}

export function patchMotionComicImageMeta(
  referenceImages: string | null | undefined,
  patch: Partial<MotionComicImageMeta>,
): string {
  const current = parseMotionComicImageMeta(referenceImages)
  return JSON.stringify({ ...current, ...patch })
}

export function resolveMotionTierForCompose(referenceImages?: string | null): MotionComicMotionTier {
  const meta = parseMotionComicImageMeta(referenceImages)
  if (meta.motion_tier) return meta.motion_tier
  if (meta.shot_role) return inferMotionComicMotionTier(meta.shot_role)
  return 'static'
}

export function resolveMotionComicComposeOptions(
  referenceImages?: string | null,
  options?: {
    pageIndex?: number
    movement?: string | null
    shotType?: string | null
    shotText?: string | null
    shotIndex?: number
  },
): MotionCameraOptions {
  const meta = parseMotionComicImageMeta(referenceImages)
  const role = meta.shot_role
    ?? inferMotionComicShotRole(String(options?.shotText || ''))
  const isDiptych = meta.paragraph_layout === 'diptych'
    || (role ? motionComicShotNeedsDiptych(role, meta.expression_action, options?.movement) : false)
  const pageIndex = options?.pageIndex
  const shotIndex = options?.shotIndex
    ?? (typeof meta.body_sentence_index === 'number' ? meta.body_sentence_index : 0)

  let cameraKind: MotionComicCameraKind
  if (isDiptych) {
    cameraKind = 'diptych_sweep'
  } else if (meta.camera_kind) {
    // 配图段锚点已锁定运镜 → 同图多句整段共用，不因单句重算
    cameraKind = meta.camera_kind
  } else {
    cameraKind = resolveMotionComicCameraKind(role, {
      movement: options?.movement,
      shotType: options?.shotType,
      shotText: options?.shotText ?? meta.expression_action,
      pageIndex,
      shotIndex: typeof meta.paragraph_index === 'number' ? meta.paragraph_index : shotIndex,
    })
  }

  const shotText = String(options?.shotText || meta.expression_action || '').trim()
  let vfxKind: MotionComicVfxKind
  if (meta.vfx_kind) {
    vfxKind = meta.vfx_kind
  } else {
    vfxKind = resolveMotionComicVfxKind(shotText, {
      expressionAction: meta.expression_action,
      sceneBackground: meta.scene_background,
      sceneContent: meta.scene_content,
    })
  }

  return {
    cameraKind,
    vfxKind,
    shotRole: role,
    isDiptych,
    pageIndex,
    tier: resolveMotionTierForCompose(referenceImages),
  }
}

export function resolveMotionComicParagraphLayout(
  meta: MotionComicImageMeta,
  movement?: string | null,
): ParagraphLayout {
  if (meta.paragraph_layout === 'diptych' || meta.paragraph_layout === 'single') {
    return meta.paragraph_layout
  }
  if (!meta.shot_role) return 'single'
  return motionComicShotNeedsDiptych(meta.shot_role, meta.expression_action, movement)
    ? 'diptych'
    : 'single'
}

type StoryboardRow = {
  description?: string | null
  dialogue?: string | null
  referenceImages?: string | null
  movement?: string | null
}

function storyboardSentence(sb: StoryboardRow): string {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^(旁白|剧中)[：:]\s*/, '')
}

/** 动态漫换镜：按镜型规则生成配图段（动作镜双格、建立镜/氛围镜单独成段） */
export function buildMotionComicImageParagraphs(
  storyboards: StoryboardRow[],
): NarrationParagraph[] {
  const paragraphs: NarrationParagraph[] = []
  let paraIndex = 0

  for (let index = 0; index < storyboards.length;) {
    const sb = storyboards[index]
    const meta = parseMotionComicImageMeta(sb.referenceImages)
    const isTitle = meta.narration_shot_type === 'title'
    const role = resolveShotRole(meta.shot_role, storyboardSentence(sb))
    const needsOwn = isTitle || motionComicShotNeedsOwnImage(role) || index === 0

    if (!needsOwn) {
      index++
      continue
    }

    let endIndex = index
    for (let j = index + 1; j < storyboards.length; j++) {
      const nextMeta = parseMotionComicImageMeta(storyboards[j].referenceImages)
      if (nextMeta.narration_shot_type === 'title') break
      const nextRole = resolveShotRole(nextMeta.shot_role, storyboardSentence(storyboards[j]))
      if (motionComicShotNeedsOwnImage(nextRole)) break
      endIndex = j
    }

    const anchorMeta = parseMotionComicImageMeta(storyboards[index].referenceImages)
    const layout = resolveMotionComicParagraphLayout(anchorMeta, storyboards[index].movement)
    const sentences = storyboards.slice(index, endIndex + 1).map(storyboardSentence).filter(Boolean)

    paragraphs.push({
      index: paraIndex++,
      startIndex: index,
      endIndex,
      sentences,
      layout,
      sceneDescription: anchorMeta.scene_background
        || anchorMeta.expression_action
        || storyboards[index].description
        || undefined,
    })

    index = endIndex + 1
  }

  return paragraphs
}
