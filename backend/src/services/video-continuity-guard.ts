/**
 * 镜间首尾帧连贯门禁：仅当下一镜与本镜「同定妆角色 + 服装相近」时才串 keyframes。
 * 避免 Agnes/Wan 在服装/人数不同的两张静图之间插值导致中途换装。
 */

export type VideoContinuityCheck = {
  ok: boolean
  reason?: string
}

function listPortraitLabels(prompt: string): string[] {
  const labels = [...String(prompt || '').matchAll(/对照定妆「([^」]+)」/g)]
    .map(m => String(m[1] || '').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    if (seen.has(label)) continue
    seen.add(label)
    out.push(label)
  }
  return out
}

function listSceneLabels(prompt: string): string[] {
  return [...String(prompt || '').matchAll(/对照场景「([^」]+)」/g)]
    .map(m => String(m[1] || '').trim())
    .filter(Boolean)
}

/** 归一化服装签名：身穿片段 + 常见服制关键词 */
export function extractOutfitSignature(prompt?: string | null): string {
  const s = String(prompt || '')
  const wears = [...s.matchAll(/身穿([^）】。，,\n]{2,72})/g)].map(m => m[1])
  const keywords = s.match(
    /连帽卫衣|卫衣|开衫|风衣|西装|衬衫|短袖|长袖|T恤|tee|高领|针织|校服|外套|夹克|毛衣|裙|裤|围裙|制服/gi,
  ) || []
  const raw = [...wears, ...keywords]
    .join('|')
    .replace(/#[0-9a-fA-F]{3,8}/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
  return raw
}

function tokenizeOutfit(sig: string): Set<string> {
  return new Set(String(sig || '').split('|').map(t => t.trim()).filter(t => t.length >= 2))
}

function outfitSignaturesCompatible(a: string, b: string): boolean {
  if (!a || !b) return true
  if (a === b) return true
  const ta = tokenizeOutfit(a)
  const tb = tokenizeOutfit(b)
  if (!ta.size || !tb.size) return true
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  if (union <= 0) return true
  // 至少一半关键词重叠，避免「白衬衫」↔「连帽卫衣」硬串
  return inter / union >= 0.5
}

function samePortraitSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every(x => sb.has(x))
}

function scenesCompatible(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return true
  const nb = new Set(b)
  if (a.some(x => nb.has(x))) return true
  // 弱匹配：去掉「·时段」后比较场所名
  const norm = (x: string) => x.replace(/[·・].*$/, '').trim()
  const nb2 = new Set([...nb].map(norm))
  return a.some(x => nb2.has(norm(x)))
}

/**
 * 根据两镜配图文案判断能否做首尾帧连贯。
 */
export function canChainVideoContinuityByPrompts(
  currentPrompt?: string | null,
  nextPrompt?: string | null,
): VideoContinuityCheck {
  const cur = String(currentPrompt || '').trim()
  const next = String(nextPrompt || '').trim()
  if (!cur || !next) {
    // 缺文案时不敢赌服装一致
    return { ok: false, reason: '缺少配图文案，跳过镜间首尾帧' }
  }

  const portraitsA = listPortraitLabels(cur)
  const portraitsB = listPortraitLabels(next)
  if (portraitsA.length && portraitsB.length) {
    if (portraitsA.length !== portraitsB.length) {
      return { ok: false, reason: `定妆人数不同（${portraitsA.length}→${portraitsB.length}）` }
    }
    if (!samePortraitSet(portraitsA, portraitsB)) {
      return { ok: false, reason: '定妆角色不同' }
    }
  } else if (portraitsA.length !== portraitsB.length) {
    // 一边有定妆一边无：人数构图常变，不串
    return { ok: false, reason: '定妆标签不齐，跳过镜间首尾帧' }
  }

  const scenesA = listSceneLabels(cur)
  const scenesB = listSceneLabels(next)
  if (!scenesCompatible(scenesA, scenesB)) {
    return { ok: false, reason: '场景不同' }
  }

  const outfitA = extractOutfitSignature(cur)
  const outfitB = extractOutfitSignature(next)
  if (outfitA && outfitB && !outfitSignaturesCompatible(outfitA, outfitB)) {
    return { ok: false, reason: '服装不一致' }
  }

  return { ok: true }
}

export function storyboardPromptForContinuity(sb: {
  imagePrompt?: string | null
  description?: string | null
  referenceImages?: string | null
}, parseMeta?: (raw?: string | null) => { image_prompt_llm_raw?: string; scene_content?: string }): string {
  const meta = parseMeta ? parseMeta(sb.referenceImages) : {}
  return String(
    sb.imagePrompt
    || meta.image_prompt_llm_raw
    || meta.scene_content
    || sb.description
    || '',
  ).trim()
}
