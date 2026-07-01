import {
  inferMotionComicShotRole,
  type MotionComicShotRole,
  type MotionComicStoryboardShot,
} from '../constants/motion-comic.js'

const HARD_SPLIT_ROLES = new Set<MotionComicShotRole>(['action', 'reaction', 'establishing'])

function normBg(bg: string) {
  return String(bg || '').replace(/\s/g, '').toLowerCase()
}

function dialogueChars(text: string) {
  return String(text || '').replace(/\s/g, '').length
}

function shotRole(shot: MotionComicStoryboardShot): MotionComicShotRole {
  return shot.shot_role ?? inferMotionComicShotRole(`${shot.dialogue} ${shot.expression_action}`)
}

function isHardSplitShot(shot: MotionComicStoryboardShot) {
  return HARD_SPLIT_ROLES.has(shotRole(shot))
}

function canMergePair(a: MotionComicStoryboardShot, b: MotionComicStoryboardShot, maxChars: number) {
  if (isHardSplitShot(a) || isHardSplitShot(b)) return false
  if (normBg(a.background) !== normBg(b.background)) return false
  if (a.speaker !== b.speaker) return false
  const combined = dialogueChars(`${a.dialogue}${b.dialogue}`)
  if (combined > maxChars) return false
  return true
}

function mergePair(a: MotionComicStoryboardShot, b: MotionComicStoryboardShot): MotionComicStoryboardShot {
  const joiner = /[。！？!?]$/.test(a.dialogue.trim()) ? '' : '，'
  const dialogue = `${a.dialogue.trim()}${joiner}${b.dialogue.trim()}`
  const expression_action = b.expression_action !== '自然状态'
    ? `${a.expression_action}；${b.expression_action}`
    : a.expression_action
  const role = shotRole(b) === 'dialogue' || shotRole(a) === 'dialogue' ? 'dialogue' : shotRole(a)
  return {
    ...a,
    dialogue,
    expression_action,
    shot_role: role,
    emphasis_word: a.emphasis_word || b.emphasis_word,
    atmosphere: b.atmosphere || a.atmosphere,
  }
}

/** 合并同场景、同说话人的连续镜头，降低「一句一镜」密度 */
export function compactMotionComicStoryboardShots(
  shots: MotionComicStoryboardShot[],
  scriptChars: number,
): MotionComicStoryboardShot[] {
  if (shots.length <= 1) return shots

  const targetMax = Math.max(10, Math.ceil(scriptChars / 110))
  let maxMergeChars = 42
  let merged = mergePass(shots, maxMergeChars)

  while (merged.length > targetMax && maxMergeChars < 72) {
    maxMergeChars += 10
    const next = mergePass(shots, maxMergeChars)
    if (next.length >= merged.length) break
    merged = next
  }

  return merged
}

function mergePass(shots: MotionComicStoryboardShot[], maxChars: number) {
  const out: MotionComicStoryboardShot[] = []
  let cur: MotionComicStoryboardShot | null = null

  for (const shot of shots) {
    if (!cur) {
      cur = { ...shot }
      continue
    }
    if (canMergePair(cur, shot, maxChars)) {
      cur = mergePair(cur, shot)
      continue
    }
    out.push(cur)
    cur = { ...shot }
  }
  if (cur) out.push(cur)
  return out
}
