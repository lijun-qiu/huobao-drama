/**
 * 解说高燃镜自动标记（合成单元锚点）
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import {
  buildNarrationImageMeta,
  parseNarrationImageMeta,
  resolveStoryboardImageAnchorShot,
  isStoryboardTitleShot,
  sortStoryboardsByOrder,
} from './narration-image.js'
import { findComposeUnitMembers } from './ffmpeg-compose.js'
import {
  defaultNarrationHighlightSoundEffect,
  detectNarrationHighlightMotion,
} from '../constants/narration-highlight.js'
import { buildNarrationVideoMotionPrompt } from './narration-video-prompt.js'

export function autoMarkNarrationHighlightsForEpisode(episodeId: number): {
  scanned: number
  marked: number
  cleared: number
} {
  const rows = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
  const ordered = sortStoryboardsByOrder(rows)
  const seenAnchors = new Set<number>()
  let scanned = 0
  let marked = 0
  let cleared = 0

  for (const sb of ordered) {
    if (isStoryboardTitleShot(sb)) continue
    const anchor = resolveStoryboardImageAnchorShot(ordered, sb.id) ?? sb
    if (seenAnchors.has(anchor.id)) continue
    seenAnchors.add(anchor.id)
    scanned++

    const members = findComposeUnitMembers(anchor.id, ordered)
    const list = members.length ? members : [anchor]
    const blob = list.map(m => [
      m.dialogue,
      m.description,
      m.imagePrompt,
      parseNarrationImageMeta(m.referenceImages).scene_content,
      ...(parseNarrationImageMeta(m.referenceImages).narration_lines || []),
    ].filter(Boolean).join(' ')).join(' ')

    const hit = detectNarrationHighlightMotion(blob)
    const meta = parseNarrationImageMeta(anchor.referenceImages)
    const prev = !!meta.highlight_motion
    const next = hit.highlight

    if (prev === next && (!next || meta.highlight_reason === hit.reason)) {
      continue
    }

    const { flux_prompt_en: _fp, flux_prompt_en_at: _fpa, ...rest } = meta
    const extra: Record<string, unknown> = {
      ...rest,
      highlight_motion: next,
      highlight_reason: next ? hit.reason : undefined,
    }
    const patch: Record<string, unknown> = {
      referenceImages: buildNarrationImageMeta(meta.narration_image_mode, extra),
      updatedAt: now(),
    }

    if (next) {
      if (!String(anchor.videoPrompt || '').trim()) {
        patch.videoPrompt = buildNarrationVideoMotionPrompt({
          imagePrompt: anchor.imagePrompt || meta.scene_content,
          paragraph: list.map(m => m.dialogue || '').join(''),
          highlight: true,
          highlightReason: hit.reason,
        })
      }
      if (!String(anchor.soundEffect || '').trim()) {
        patch.soundEffect = defaultNarrationHighlightSoundEffect(hit.reason)
      }
      marked++
    } else {
      cleared++
    }

    db.update(schema.storyboards)
      .set(patch)
      .where(eq(schema.storyboards.id, anchor.id))
      .run()
  }

  return { scanned, marked, cleared }
}
