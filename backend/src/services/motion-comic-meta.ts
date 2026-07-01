import type {
  MotionComicCameraKind,
  MotionComicMotionTier,
  MotionComicShotRole,
  MotionComicStoryboardShot,
} from '../constants/motion-comic.js'
import {
  inferMotionComicMotionTier,
  inferMotionComicShotRole,
  motionComicShotNeedsDiptych,
  motionComicShotNeedsOwnImage,
  resolveMotionComicCameraKind,
} from '../constants/motion-comic.js'
import type { NarrationImageMeta, ParagraphLayout } from './narration-image.js'
import { parseNarrationImageMeta, buildNarrationImageMeta } from './narration-image.js'
import type { NarrationParagraph } from './narration-paragraph.js'
import type { MotionCameraOptions } from './motion-comic-camera.js'

export type MotionComicImageMeta = NarrationImageMeta & {
  shot_role?: MotionComicShotRole
  motion_tier?: MotionComicMotionTier
  camera_kind?: MotionComicCameraKind
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
): Pick<MotionComicImageMeta, 'shot_role' | 'motion_tier' | 'paragraph_layout' | 'camera_kind'> {
  return {
    shot_role: role,
    motion_tier: inferMotionComicMotionTier(role),
    paragraph_layout: 'single',
    camera_kind: resolveMotionComicCameraKind(role, {
      movement,
      shotType,
      shotText: expressionAction,
      pageIndex,
    }),
  }
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
): string {
  const role = resolveShotRole(shot.shot_role, `${shot.dialogue} ${shot.expression_action}`)
  const visual = buildMotionComicVisualMeta(role, shot.expression_action, shot.movement)
  const imageMode = motionComicShotNeedsOwnImage(role) ? 'new' as const : 'inherit' as const
  return buildNarrationImageMeta(imageMode, {
    ...extra,
    ...visual,
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
  },
): MotionCameraOptions {
  const meta = parseMotionComicImageMeta(referenceImages)
  const role = meta.shot_role
    ?? inferMotionComicShotRole(String(options?.shotText || ''))
  const isDiptych = meta.paragraph_layout === 'diptych'
    || (role ? motionComicShotNeedsDiptych(role, meta.expression_action, options?.movement) : false)
  const pageIndex = options?.pageIndex

  let cameraKind: MotionComicCameraKind
  if (isDiptych) {
    cameraKind = 'diptych_sweep'
  } else {
    cameraKind = meta.camera_kind
      ?? resolveMotionComicCameraKind(role, {
        movement: options?.movement,
        shotType: options?.shotType,
        shotText: options?.shotText ?? meta.expression_action,
        pageIndex,
      })
  }

  return {
    cameraKind,
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
