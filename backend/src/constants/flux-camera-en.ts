/**
 * 机位维（镜头视角）规则模板英文化：中近景/头高%等映射为固定英文句，少靠模型意译。
 */
import {
  compressFluxEnglishPrompt,
  FLUX_COMPACT_EN_SECTION_ORDER,
  parseFluxEnglishSections,
  parseNarrationFluxSections,
} from './flux-prompt-compact.js'

function extractChineseDim(raw: string, label: string): string {
  const sections = parseNarrationFluxSections(raw)
  if (sections[label]?.trim()) return sections[label].trim()
  const full = String(raw || '')
  const cn = full.match(new RegExp(`【${label}[：:]\\s*([^】]+)】`))
  if (cn?.[1]) return cn[1].trim()
  const enBr = full.match(new RegExp(`\\[${label}[：:]\\s*([^\\]]+)\\]`))
  return enBr?.[1]?.trim() || ''
}

function extractHeadPct(cn: string): number | null {
  const m = cn.match(/头高约占画面高度\s*(\d{1,2})\s*%/)
    || cn.match(/头高[^。；;%]{0,24}?(\d{1,2})\s*%/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function extractFullBodyPct(cn: string): number | null {
  const m = cn.match(/(?:全身|站立全身)约占画面高度\s*(\d{1,2})\s*%/)
    || cn.match(/(?:全身|站立全身)[^。；;%]{0,16}?(\d{1,2})\s*%/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function hasPoseOrActionContext(cnCamera: string, subject: string, action: string): boolean {
  const blob = `${cnCamera} ${subject} ${action}`
  return /坐姿|站立|站姿|僵直|抬|触|握|端|伸手|双手|右手|左手|扶|按|倚靠|摸|递|推|拉|完整入镜/.test(blob)
}

/** 景别 → 短固定英文（控制在 Camera 预算内） */
function resolveShotScaleEn(cnCamera: string, hasPoseAction: boolean): string {
  if (/过肩/.test(cnCamera)) return 'OTS shot'
  if (/中远景/.test(cnCamera)) return 'medium-wide shot'
  if (/全景|远景/.test(cnCamera)) return 'wide establishing shot'
  if (/中近景/.test(cnCamera)) return 'MCU chest-up, hands in frame'
  if (/中景/.test(cnCamera)) {
    return /全身|从头顶到脚/.test(cnCamera) ? 'medium full shot, full body' : 'medium shot'
  }
  if (/大特写|极端特写/.test(cnCamera)) {
    return hasPoseAction ? 'MCU chest-up, hands in frame' : 'extreme close-up'
  }
  if (/近景/.test(cnCamera)) {
    return hasPoseAction ? 'MCU chest-up, hands in frame' : 'close-up, shoulders visible'
  }
  return hasPoseAction ? 'MCU chest-up, hands in frame' : 'medium shot'
}

function resolveAngleEn(cnCamera: string): string {
  if (/略俯|俯拍|俯视|高机位/.test(cnCamera)) return 'slight high-angle'
  if (/略仰|仰拍|仰视|低机位/.test(cnCamera)) return 'slight low-angle'
  return 'eye-level'
}

function resolveAimEn(cnCamera: string): string {
  if (/朝向[^，,；;]*(?:上半身).*(?:手|动作|物件|镜|门|桌|台)/.test(cnCamera)
    || /朝向[^，,；;]*(?:手|动作).*(?:上半身)/.test(cnCamera)) {
    return 'aimed at upper body + action/prop'
  }
  if (/朝向[^，,；;]*上半身/.test(cnCamera)) return 'aimed at upper body'
  if (/朝向[^，,；;]*(?:全身|从头顶到脚|站立)/.test(cnCamera)) return 'aimed at full body'
  if (/朝向/.test(cnCamera)) return 'aimed at subject + action'
  return 'aimed at upper body + action/prop'
}

function resolveVisibilityEn(cnCamera: string, hasPoseAction: boolean, poseHint?: string): string {
  const poseBlob = `${cnCamera} ${poseHint || ''}`
  // 「坐姿或站姿」等双可：按主体/动作瞬时姿态择一，勿裸匹配「须可见坐姿…」
  if (/须可见(?:坐姿或站姿|站姿或坐姿)/.test(cnCamera) || /坐姿或站姿|站姿或坐姿/.test(cnCamera)) {
    if (/站立|站姿/.test(poseBlob) && !/以坐姿|坐姿僵|端坐|坐下/.test(poseHint || '')) {
      return 'standing shoulders+hands visible'
    }
    if (/以坐姿|坐姿僵|端坐|坐着|坐下/.test(poseHint || '') || /须可见坐姿/.test(cnCamera)) {
      return 'sitting shoulders+hands visible'
    }
    return 'shoulders+hands visible'
  }
  // 须先匹配坐姿/站立，禁止用「肩线与手」泛匹配把站姿误写成 sitting
  if (/须可见坐姿肩线|须可见坐姿[^，；;或]{0,12}肩线与手/.test(cnCamera)) {
    return 'sitting shoulders+hands visible'
  }
  if (/须可见站立肩线|须可见站姿肩线|须可见站立[^，；;]{0,12}肩/.test(cnCamera)) {
    return 'standing shoulders+hands visible'
  }
  if (/须可见上半身与手部|须可见[^，；;]{0,16}上半身与手/.test(cnCamera)) {
    return 'upper body+hands visible'
  }
  if (/须可见/.test(cnCamera) && /手/.test(cnCamera)) {
    return 'hands+pose visible'
  }
  if (/从头顶到脚完整入镜|完整入镜/.test(cnCamera)) {
    return 'full body head-to-feet in frame'
  }
  if (hasPoseAction && /中近景|近景/.test(cnCamera)) {
    return 'hands+pose visible'
  }
  return ''
}

/**
 * 从中文【画面主体】规则生成 Subjects（定妆 label + #hex + 无配角；不针对具体剧本）。
 * 表情/姿态英文不强行意译，留给外译正文；此处只强制身份与色号锚点。
 */
export function buildFluxSubjectsEnglishFromChinese(cnSubject: string): string {
  const s = String(cnSubject || '').trim()
  if (!s) return ''

  const label = s.match(/对照定妆「([^」]+)」/)?.[1]?.trim()
    || s.match(/对照定妆\[([^\]]+)\]/)?.[1]?.trim()
  const hexes = [...s.matchAll(/#([0-9a-fA-F]{6})/g)].map(m => `#${m[1].toLowerCase()}`)
  const wear = s.match(/身穿([^）】\]]+)/)?.[1]?.replace(/[，,].*$/, '').trim() || ''
  const noExtras = /无配角/.test(s)

  const parts: string[] = []
  if (label) {
    parts.push(`Protagonist matching portrait label '${label}'`)
  } else {
    parts.push('Protagonist')
  }
  if (hexes.length) {
    const wearHint = wear && !/[\u4e00-\u9fff]/.test(wear) ? wear : 'outfit'
    parts.push(`wearing ${hexes.join(' / ')} ${wearHint}`.trim())
  }
  if (noExtras) parts.push('no other characters')
  return parts.filter(Boolean).join(', ')
}

/** 从中文【镜头视角】规则生成固定英文 Camera 段 */
export function buildFluxCameraEnglishFromChinese(
  cnCamera: string,
  context?: { subject?: string; action?: string },
): string {
  const cam = String(cnCamera || '').trim()
  if (!cam) {
    return 'MCU chest-up, hands in frame, eye-level, aimed at upper body + action/prop, head ~26% frame height, hands+pose visible'
  }

  const subject = String(context?.subject || '')
  const action = String(context?.action || '')
  const hasPoseAction = hasPoseOrActionContext(cam, subject, action)
  const headPct = extractHeadPct(cam)
  const fullBodyPct = extractFullBodyPct(cam)

  const parts: string[] = [
    resolveShotScaleEn(cam, hasPoseAction),
    resolveAngleEn(cam),
    resolveAimEn(cam),
  ]

  if (headPct != null) {
    const pct = hasPoseAction && headPct >= 35 ? 26 : headPct
    parts.push(`head ~${pct}% frame height`)
  } else if (hasPoseAction) {
    parts.push('head ~26% frame height')
  }

  if (fullBodyPct != null) {
    parts.push(`full body ~${fullBodyPct}% frame height`)
  }

  const visibility = resolveVisibilityEn(cam, hasPoseAction, `${subject} ${action}`)
  if (visibility) parts.push(visibility)

  return parts.filter(Boolean).join(', ')
}

function sectionsToEnglishPrompt(sections: Record<string, string>): string {
  return FLUX_COMPACT_EN_SECTION_ORDER
    .filter(label => sections[label]?.trim())
    .map(label => `${label}: ${sections[label].trim()}`)
    .join('. ')
}

function applySubjectsRuleOverlay(
  sections: Record<string, string>,
  cnSubject: string,
): void {
  const anchor = buildFluxSubjectsEnglishFromChinese(cnSubject)
  if (!anchor) return
  let subj = String(sections['Subjects in frame'] || '').trim()
  // 去掉泛化人称 / 误译 makeup / 音译人名重复，只保留有用的表情服装短句
  subj = subj
    .replace(/^(?:a\s+|the\s+)?(?:young\s+)?(?:woman|man|girl|boy|female|male|lady|gentleman)\b[,:\s]*/i, '')
    .replace(/Control(?:\s+the)?\s+makeup[^,.]*/gi, '')
    .replace(/Contrast(?:ing)?\s+makeup[^,.]*/gi, '')
    .replace(/\bCharacter\s*["'][^"']+["'][^,.]*/gi, '')
    .replace(/\b(?:Xiaoya|Xiao\s*Ya|XiaoYa)\b(?:\s*·?\s*Youth)?(?:\s*\([^)]*\))?/gi, '')
    .replace(/matching\s+(?:reference\s+)?portrait(?:\s+label)?\s*['"][^'"]+['"][,:\s]*/gi, '')
    .replace(/portrait\s+label\s*['"][^'"]+['"][,:\s]*/gi, '')
    .replace(/Located\b[^,.]*/gi, '')
    .replace(/,\s*,/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()

  const label = cnSubject.match(/对照定妆「([^」]+)」/)?.[1]?.trim()
  // 有定妆：Subjects 只保留规则锚点（label + #hex + 无配角），丢掉外译重复/残片
  if (label) {
    sections['Subjects in frame'] = anchor
    return
  }

  if (!subj) {
    sections['Subjects in frame'] = anchor
    return
  }
  for (const hex of cnSubject.match(/#[0-9a-fA-F]{6}/g) || []) {
    if (!new RegExp(hex, 'i').test(subj)) subj = `${subj}, ${hex}`
  }
  if (/无配角/.test(cnSubject) && !/no other characters|no supporting/i.test(subj)) {
    subj = `${subj}, no other characters`
  }
  sections['Subjects in frame'] = `${anchor}, ${subj}`.replace(/,\s*,/g, ', ').replace(/^,\s*|,\s*$/g, '').trim()
}

/** 用中文覆盖英文 Camera + Subjects 锚点（规则模板，非模型意译） */
export function applyRuleTemplatedCameraEnglish(
  english: string,
  chinesePrompt: string,
): string {
  const en = String(english || '').trim()
  const zh = String(chinesePrompt || '').trim()
  if (!en || !zh) return en

  const cnCamera = extractChineseDim(zh, '镜头视角')
  const cnSubject = extractChineseDim(zh, '画面主体')
  const cameraEn = cnCamera
    ? buildFluxCameraEnglishFromChinese(cnCamera, {
        subject: cnSubject,
        action: extractChineseDim(zh, '核心细节动作'),
      })
    : ''

  const sections = parseFluxEnglishSections(en)
  if (Object.keys(sections).length >= 2) {
    if (cameraEn) sections['Camera and composition'] = cameraEn
    if (cnSubject) applySubjectsRuleOverlay(sections, cnSubject)
    // 先压其它维，再强制写回机位/主体锚点（避免预算切掉头高%）
    const compressed = compressFluxEnglishPrompt(sectionsToEnglishPrompt(sections))
    const after = parseFluxEnglishSections(compressed)
    if (Object.keys(after).length >= 2) {
      if (cameraEn) after['Camera and composition'] = cameraEn
      if (cnSubject) applySubjectsRuleOverlay(after, cnSubject)
      return sectionsToEnglishPrompt(after)
    }
    return compressed
  }

  if (cameraEn && /Camera and composition:\s*/i.test(en)) {
    const rebuilt = en.replace(
      /Camera and composition:\s*[\s\S]*?(?=(?:\.\s*)?(?:Action and interaction|Environment and era|Subjects in frame|Lighting and color|Art style spec|Render quality)\s*:|$)/i,
      `Camera and composition: ${cameraEn}. `,
    )
    const compressed = compressFluxEnglishPrompt(rebuilt)
    const after = parseFluxEnglishSections(compressed)
    if (Object.keys(after).length >= 2) {
      after['Camera and composition'] = cameraEn
      if (cnSubject) applySubjectsRuleOverlay(after, cnSubject)
      return sectionsToEnglishPrompt(after)
    }
    return compressed
  }

  if (!cameraEn) return compressFluxEnglishPrompt(en)
  return compressFluxEnglishPrompt(`Camera and composition: ${cameraEn}. ${en}`)
}
