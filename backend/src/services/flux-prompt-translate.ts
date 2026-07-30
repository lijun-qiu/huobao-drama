/**
 * 解说分镜七维中文 → Flux 七维英文（LLM 整段直译，无规则兜底）
 */
import { buildFluxTranslateGlossaryBlock } from '../constants/flux-translate-glossary.js'
import { applyRuleTemplatedCameraEnglish, buildFluxCameraEnglishFromChinese } from '../constants/flux-camera-en.js'
import { compressFluxChinesePrompt, compressFluxEnglishPrompt, parseFluxEnglishSections, repairFluxEnglishPromptStructure } from '../constants/flux-prompt-compact.js'
import {
  fluxEnglishCjkFragments,
  hasFluxEnglishCjk,
  hasIllegalFluxEnglishCjk,
  illegalFluxEnglishCjkFragments,
  purgeChineseFromFluxEnglish,
} from '../constants/flux-prompt-en-sanitize.js'
import { LOCAL_COMIC_ENV } from '../constants/local-comic.js'
import {
  assembleFluxSevenDimEnglish,
  FLUX_SECTION_LABELS,
  FLUX_SECTION_ORDER,
  narrationPagePromptToFluxEnglish,
  parseNarrationFluxSections,
  sanitizeFluxPrompt,
} from './comfyui-client.js'
import { ensureLocalModelStage, unloadOllamaModel } from './local-model-manager.js'
import { mymemoryTranslate } from './mymemory-translate.js'
import { callTextChat } from './text-chat.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { youdaoTranslate } from './youdao-translate.js'

/** 翻译版本号；低于此值的缓存英文视为过期 */
export const FLUX_PROMPT_EN_VERSION = 20

export { FLUX_SECTION_LABELS, FLUX_SECTION_ORDER, assembleFluxSevenDimEnglish } from './comfyui-client.js'

export type FluxTranslateOptions = {
  holdOllama?: boolean
}

const FLUX_PROMPT_TRANSLATE_SYSTEM = `You are a faithful Chinese-to-English translator for FLUX.1 image generation.

The input is a universal seven-dimension (七维) storyboard prompt. Output the SAME seven dimensions in English — same facts, shorter wording. Do NOT invent story-specific details not in the Chinese.

${buildFluxTranslateGlossaryBlock()}

MANDATORY OUTPUT FORMAT (compact; ACTION and ENVIRONMENT before camera — Flux attends to early concrete nouns/verbs; total under 900 English chars):
Action and interaction: ...
Environment and era: ...
Camera and composition: ...
Subjects in frame: ...
Lighting and color: ...
Art style spec: ... (one short line; do NOT copy a long Chinese art-style paragraph)
Render quality: ... (one short line)

Rules:
1. Translate section by section — keep hex colors, props, actions, gender, portrait labels.
2. Camera section is overwritten by rule templates after translate — keep it short; never invent face-only close-ups when Chinese has pose/props.
3. Do NOT add masterpiece, score_* tags, or constraints not in the Chinese.
4. Output ONLY the English prompt. No Chinese left. No markdown.`

function stripFluxLlmReply(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim()
  if (!/thinking process|analyze the request|deconstruct the input/i.test(s)) return s

  const paragraphs = s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i]
    if (p.length >= 80 && !/^thinking process|^(\d+\.|\*\*)/i.test(p)) return p
  }
  return ''
}

/** LLM 原文直出：去 thinking → 清中文 → 分段压缩 → 修误译 */
function finalizeFluxLlmEnglish(raw: string): string {
  const stripped = sanitizeFluxPrompt(stripFluxLlmReply(raw))
  const purged = purgeChineseFromFluxEnglish(stripped)
  return sanitizeFluxEnglishArtifacts(compressFluxEnglishPrompt(purged))
}

function buildFluxTranslateRetryMessage(raw: string, fragments: string[]): string {
  return [
    buildFluxTranslateUserMessage(raw),
    '',
    `CRITICAL: Your previous output still contained Chinese: ${fragments.join(', ')}`,
    'Re-translate 100% into English. Zero Chinese characters (汉字).',
    '/no_think',
  ].join('\n')
}

async function translateFluxEnglishWithSectionFallback(raw: string): Promise<string> {
  const text = compressFluxChinesePrompt(resolveFluxTranslateSource(raw))
  if (hasYoudaoCredentials()) {
    const english = purgeChineseFromFluxEnglish(
      await narrationPagePromptToFluxEnglishYoudaoSections(text),
    )
    return compressFluxEnglishPrompt(english)
  }
  const english = purgeChineseFromFluxEnglish(
    await narrationPagePromptToFluxEnglishMyMemorySections(text),
  )
  return compressFluxEnglishPrompt(english)
}

function resolveFluxTranslateSource(raw: string): string {
  return String(raw || '').trim()
}

function buildFluxTranslateUserMessage(raw: string): string {
  return [
    'Translate this seven-dimension Chinese prompt to English (faithful, section by section):',
    '',
    raw,
    '',
    'Reply with ONLY the seven English sections using the mandatory labels.',
    '/no_think',
  ].join('\n')
}

export function resolveFluxTranslateModel(): string {
  return LOCAL_COMIC_ENV.ollamaFluxTranslateModel || LOCAL_COMIC_ENV.zhipuTextModel || 'glm-4.7-flash'
}

function isOllamaFluxTranslateModel(model?: string | null): boolean {
  const m = String(model || '').trim().toLowerCase()
  if (!m || m.startsWith('glm-')) return false
  return m.includes(':')
}

let fluxTranslateOllamaBatchDepth = 0

export function isFluxTranslateOllamaBatchActive(): boolean {
  return fluxTranslateOllamaBatchDepth > 0
}

export async function beginFluxTranslateOllamaBatch(): Promise<void> {
  if (LOCAL_COMIC_ENV.fluxPromptTranslate !== 'llm') return
  const model = resolveFluxTranslateModel()
  if (!isOllamaFluxTranslateModel(model)) return
  if (fluxTranslateOllamaBatchDepth === 0) {
    await ensureLocalModelStage('llm', { ollamaModel: model })
  }
  fluxTranslateOllamaBatchDepth++
}

export async function endFluxTranslateOllamaBatch(): Promise<void> {
  if (LOCAL_COMIC_ENV.fluxPromptTranslate !== 'llm') return
  if (fluxTranslateOllamaBatchDepth <= 0) return
  fluxTranslateOllamaBatchDepth--
  const model = resolveFluxTranslateModel()
  if (fluxTranslateOllamaBatchDepth === 0 && isOllamaFluxTranslateModel(model)) {
    await unloadOllamaModel(model)
  }
}

export async function withFluxTranslateOllamaSession<T>(fn: () => Promise<T>): Promise<T> {
  await beginFluxTranslateOllamaBatch()
  try {
    return await fn()
  } finally {
    await endFluxTranslateOllamaBatch()
  }
}

/** 修复常见误译/漏译痕迹（对照定妆→Contrasting makeup 等） */
export function sanitizeFluxEnglishArtifacts(en: string): string {
  let s = sanitizeFluxPrompt(String(en || '').trim())
  if (!s) return s
  s = s
    .replace(/Contrasting makeup\s*["「]?/gi, 'matching reference portrait for "')
    .replace(/Contrast makeup\s*["「]?/gi, 'matching reference portrait for "')
    .replace(/matching reference portrait for\s*["「]?\s*Programmer\s*·/gi, 'matching reference portrait for "programmer·')
    .replace(/Xinhai Cheng/gi, 'Makoto Shinkai')
    .replace(/Jing\s*'ani/gi, 'Kyoto Animation')
    .replace(/Cellulu/gi, 'cel shading')
    .replace(/16:\s*9\s+Movie\s+Japanese\s+animation/gi, '16:9 cinematic anime')
    .replace(/head-to-body ratio/gi, 'body proportions')
    .replace(/supporting role/gi, 'supporting characters')
    .replace(/non-q version/gi, 'not chibi')
    .replace(/\brelationsh\./gi, 'relationship with environment')
    .replace(/\bThe\.\s+Subjects/gi, 'Subjects')
    .replace(/standing and low\./gi, 'standing with head lowered')
    .replace(/,\s*no\s+w\.\s*Render/gi, ', no text. Render')
    .replace(/\bcharacter relatio\.?/gi, 'two-person interaction and spatial relationship')
    .replace(/\brelatio\.?\s*$/gi, 'relationship')
  s = repairFluxEnglishPromptStructure(s)
  return sanitizeFluxPrompt(s)
}

export type FluxEnglishAccuracyResult = {
  ok: boolean
  reasons: string[]
}

const FLUX_EN_REQUIRED_LABELS = [
  'Action and interaction',
  'Environment and era',
  'Camera and composition',
  'Subjects in frame',
  'Lighting and color',
  'Art style spec',
  'Render quality',
] as const

/**
 * 英文七维准确性判定（完成条件）：
 * 结构齐全、无非法中文、无截断/常见误译，且与中文定妆/#hex/头高%/站坐姿态对齐。
 */
export function assessFluxEnglishPromptAccuracy(
  en: string,
  chinese?: string | null,
): FluxEnglishAccuracyResult {
  const reasons: string[] = []
  const stored = sanitizeFluxEnglishArtifacts(String(en || '').trim())
  if (!stored) return { ok: false, reasons: ['empty'] }

  if (hasIllegalFluxEnglishCjk(stored)) {
    reasons.push(`cjk:${illegalFluxEnglishCjkFragments(stored).slice(0, 4).join('|')}`)
  }
  if (/thinking process|analyze the request|deconstruct the input|\*\*/i.test(stored)) {
    reasons.push('thinking_leak')
  }
  if (/contrast pose|contrasting makeup|control makeup|shinkaisei|delicate line manuscript|non-q version|supporting role|head-to-head ratio|celluloid and gradient|film感动/i.test(stored)) {
    reasons.push('mistranslation')
  }
  // Subjects 规则锚点后仍残留音译人名/重复角色句 → 未完成清洗
  if (/portrait\s+label\s*'[^']+'[^.]{0,40}\b(?:Xiaoya|Xiao\s*Ya|XiaoYa)\b/i.test(stored)) {
    reasons.push('subjects_name_dup')
  }
  if (/portrait\s+label\s*'[^']+'[^.]{0,80}\bCharacter\s*["']/i.test(stored)) {
    reasons.push('subjects_name_dup')
  }
  if (/\b(and|with|or|mult|mechan|transpar|keyboar|highligh|display)\s*\.?\s*$/i.test(stored)) {
    reasons.push('truncated_tail')
  }
  if (/\b(straig|mid-grou|shoulders\+ha|shoulders\+h)\b/i.test(stored)) {
    reasons.push('hard_truncation')
  }

  const sections = parseFluxEnglishSections(stored)
  for (const label of FLUX_EN_REQUIRED_LABELS) {
    if (!String(sections[label] || '').trim()) reasons.push(`missing:${label}`)
  }

  const subjects = sections['Subjects in frame'] || ''
  if (subjects) {
    let open = 0
    for (const ch of subjects) {
      if (ch === '(') open++
      else if (ch === ')') open = Math.max(0, open - 1)
    }
    if (open > 0) reasons.push('subjects_unclosed_paren')
  }

  const zh = String(chinese || '').trim()
  const zhSections = parseNarrationFluxSections(zh)
  if (Object.keys(zhSections).length >= 2) {
    if (stored.length < 60) reasons.push('too_short')
    for (const key of FLUX_SECTION_ORDER) {
      if (!zhSections[key]) continue
      const label = FLUX_SECTION_LABELS[key]
      if (!stored.toLowerCase().includes(label.toLowerCase().slice(0, 10))) {
        reasons.push(`missing_label:${label}`)
      }
    }

    const cnCamDim = zhSections['镜头视角'] || ''
    const cnCam = `${cnCamDim} ${zhSections['画面主体'] || ''} ${zhSections['核心细节动作'] || ''}`
    const cam = sections['Camera and composition'] || ''
    if (/头高约占画面高度\s*\d+\s*%/.test(cnCamDim) && !/head\s*~\s*\d+%/.test(cam)) {
      reasons.push('missing:head_pct')
    }
    // 「坐姿或站姿」双可时不判站→坐硬冲突；否则按主体瞬时姿态
    const dualPose = /坐姿或站姿|站姿或坐姿/.test(cnCamDim)
    if (!dualPose) {
      if (/站立|站姿/.test(cnCam) && /sitting/i.test(cam)) reasons.push('pose:stand_to_sit')
      if (/坐姿|端坐/.test(cnCam) && /standing shoulders/i.test(cam) && !/sitting/i.test(cam)) {
        reasons.push('pose:sit_to_stand')
      }
    } else {
      const subjectPose = `${zhSections['画面主体'] || ''} ${zhSections['核心细节动作'] || ''}`
      if (/站立|以站姿|站姿/.test(subjectPose) && !/以坐姿|端坐/.test(subjectPose) && /sitting/i.test(cam)) {
        reasons.push('pose:stand_to_sit')
      }
      if (/以坐姿|端坐|坐着/.test(subjectPose) && /standing shoulders/i.test(cam) && !/sitting/i.test(cam)) {
        reasons.push('pose:sit_to_stand')
      }
    }

    const cnSub = zhSections['画面主体'] || ''
    const portraitLabel = cnSub.match(/对照定妆「([^」]+)」/)?.[1]?.trim()
    if (portraitLabel) {
      if (!subjects.includes(portraitLabel) && !/portrait\s+label/i.test(subjects)) {
        reasons.push('missing:portrait_label')
      }
    }
    const hexes = cnSub.match(/#[0-9a-fA-F]{6}/g) || []
    for (const hex of hexes) {
      if (!new RegExp(hex, 'i').test(stored)) {
        reasons.push(`missing:hex:${hex}`)
        break
      }
    }
    if (/无配角/.test(cnSub) && !/no other characters|no supporting/i.test(subjects)) {
      reasons.push('missing:no_extras')
    }
  } else if (stored.length < 40) {
    reasons.push('too_short')
  }

  return { ok: reasons.length === 0, reasons }
}

/** 英文不可用/未达标（待重译或拒绝落库） */
export function isBrokenFluxEnglishPrompt(en: string, chinese?: string | null): boolean {
  return !assessFluxEnglishPromptAccuracy(en, chinese).ok
}

type SectionTranslator = (text: string) => Promise<string>

async function translateFluxSectionsFaithfully(
  raw: string,
  translateSection: SectionTranslator,
): Promise<string> {
  const text = resolveFluxTranslateSource(raw)
  if (!text) return ''
  if (!/[\u4e00-\u9fff]/.test(text)) {
    return sanitizeFluxPrompt(text).slice(0, 1800)
  }

  const sections = parseNarrationFluxSections(text)
  if (Object.keys(sections).length >= 2) {
    const translated: Record<string, string> = {}
    for (const key of FLUX_SECTION_ORDER) {
      const content = sections[key]
      if (!content) continue
      // 机位维：固定英文模板，不调用外译 API
      if (key === '镜头视角') {
        translated[key] = buildFluxCameraEnglishFromChinese(content, {
          subject: sections['画面主体'],
          action: sections['核心细节动作'],
        })
        continue
      }
      translated[key] = await translateSection(content)
    }
    return assembleFluxSevenDimEnglish(translated)
  }

  const plain = text
    .replace(/【([^：]+)：/g, '$1: ')
    .replace(/】/g, '. ')
    .replace(/[「」]/g, ' ')
  const translated = await translateSection(plain)
  return sanitizeFluxPrompt(translated).slice(0, 1800)
}

async function narrationPagePromptToFluxEnglishMyMemorySections(raw: string): Promise<string> {
  const email = LOCAL_COMIC_ENV.mymemoryEmail || undefined
  return translateFluxSectionsFaithfully(raw, chunk => mymemoryTranslate(chunk, { email }))
}

function youdaoCredentials() {
  return {
    appKey: LOCAL_COMIC_ENV.youdaoAppKey,
    appSecret: LOCAL_COMIC_ENV.youdaoAppSecret,
  }
}

function hasYoudaoCredentials(): boolean {
  const { appKey, appSecret } = youdaoCredentials()
  return !!(appKey && appSecret)
}

async function narrationPagePromptToFluxEnglishYoudaoSections(raw: string): Promise<string> {
  if (!hasYoudaoCredentials()) {
    throw new Error('未配置 YOUDAO_APP_KEY / YOUDAO_APP_SECRET')
  }
  const creds = youdaoCredentials()
  return translateFluxSectionsFaithfully(raw, chunk => youdaoTranslate(chunk, creds))
}

/** LLM 整段直译，直接使用模型输出 */
async function translateWithLlmOnly(
  raw: string,
  opts?: FluxTranslateOptions,
): Promise<string> {
  const text = compressFluxChinesePrompt(resolveFluxTranslateSource(raw))
  if (!text) return ''
  if (!/[\u4e00-\u9fff]/.test(text)) {
    return sanitizeFluxPrompt(text).slice(0, 1800)
  }

  const model = resolveFluxTranslateModel()
  const holdOllama = !!opts?.holdOllama
  if (!holdOllama && isOllamaFluxTranslateModel(model)) {
    await ensureLocalModelStage('llm', { ollamaModel: model })
  }

  try {
    const reply = await callTextChat(
      FLUX_PROMPT_TRANSLATE_SYSTEM,
      buildFluxTranslateUserMessage(text),
      model,
      false,
      120_000,
      false,
      4096,
    )
    let english = finalizeFluxLlmEnglish(reply)
    if (!english || english.length < 40) {
      throw new Error('LLM 翻译结果为空')
    }
    if (/thinking process|analyze the request|deconstruct the input/i.test(english)) {
      throw new Error('LLM 翻译输出无效（思考链泄漏）')
    }

    if (hasIllegalFluxEnglishCjk(english)) {
      const fragments = illegalFluxEnglishCjkFragments(english)
      logTaskWarn('FluxTranslate', 'cjk-in-llm-output', { fragments })
      const retryReply = await callTextChat(
        FLUX_PROMPT_TRANSLATE_SYSTEM,
        buildFluxTranslateRetryMessage(text, fragments),
        model,
        false,
        120_000,
        false,
        4096,
      )
      english = finalizeFluxLlmEnglish(retryReply)
    }

    if (hasIllegalFluxEnglishCjk(english)) {
      logTaskWarn('FluxTranslate', 'cjk-fallback-sections', {
        fragments: illegalFluxEnglishCjkFragments(english),
      })
      english = await translateFluxEnglishWithSectionFallback(text)
    }

    if (!english || english.length < 40) {
      throw new Error('LLM 翻译结果为空')
    }
    if (hasIllegalFluxEnglishCjk(english)) {
      throw new Error(`翻译仍含中文: ${illegalFluxEnglishCjkFragments(english).join(', ')}`)
    }
    return english
  } finally {
    if (!holdOllama) {
      await unloadOllamaModel(model)
    }
  }
}

async function translateWithFallbacks(
  raw: string,
  opts?: FluxTranslateOptions,
): Promise<{ english: string; provider: string }> {
  const text = resolveFluxTranslateSource(raw)
  const provider = LOCAL_COMIC_ENV.fluxPromptTranslate

  if (provider === 'llm') {
    const english = await translateWithLlmOnly(text, opts)
    return { english, provider: 'llm' }
  }

  if (provider === 'youdao') {
    if (!hasYoudaoCredentials()) {
      throw new Error('未配置 YOUDAO_APP_KEY / YOUDAO_APP_SECRET')
    }
    const english = compressFluxEnglishPrompt(
      purgeChineseFromFluxEnglish(await narrationPagePromptToFluxEnglishYoudaoSections(text)),
    )
    return { english, provider: 'youdao' }
  }

  if (provider === 'mymemory') {
    const english = compressFluxEnglishPrompt(
      purgeChineseFromFluxEnglish(await narrationPagePromptToFluxEnglishMyMemorySections(text)),
    )
    return { english, provider: 'mymemory' }
  }

  const english = compressFluxEnglishPrompt(purgeChineseFromFluxEnglish(narrationPagePromptToFluxEnglish(text)))
  return { english, provider: 'rule' }
}

async function polishAndAssessFluxEnglish(
  english: string,
  chinese: string,
): Promise<{ english: string; assess: FluxEnglishAccuracyResult }> {
  const polished = applyRuleTemplatedCameraEnglish(
    sanitizeFluxEnglishArtifacts(english),
    chinese,
  )
  return { english: polished, assess: assessFluxEnglishPromptAccuracy(polished, chinese) }
}

/** 将中文七维配图文案译为 Flux 七维英文（通过准确性判定才返回） */
export async function translateNarrationPromptToFluxEnglish(
  raw: string,
  _visualStyle?: string | null,
  opts?: FluxTranslateOptions,
): Promise<string> {
  const text = resolveFluxTranslateSource(raw)
  if (!text) return ''
  if (!/[\u4e00-\u9fff]/.test(text)) {
    return sanitizeFluxPrompt(text).slice(0, 1800)
  }

  try {
    const { english, provider } = await translateWithFallbacks(text, opts)
    let { english: polished, assess } = await polishAndAssessFluxEnglish(english, text)

    if (!assess.ok) {
      logTaskWarn('FluxTranslate', 'accuracy-retry', {
        provider,
        reasons: assess.reasons,
      })
      // 主通道不达标时换分段外译/规则再跑一遍
      const fallback = await translateFluxEnglishWithSectionFallback(text)
      ;({ english: polished, assess } = await polishAndAssessFluxEnglish(fallback, text))
    }

    if (!assess.ok) {
      throw new Error(`英文未通过准确性检查：${assess.reasons.join(', ')}`)
    }

    logTaskProgress('FluxTranslate', provider, {
      length: polished.length,
      preview: polished.slice(0, 220),
      camera_templated: true,
      accuracy_ok: true,
    })
    return polished
  } catch (err) {
    logTaskWarn('FluxTranslate', 'failed', { error: (err as Error).message })
    throw err
  }
}

/** @deprecated */
export async function narrationPagePromptToFluxEnglishLLM(
  raw: string,
  visualStyle?: string | null,
): Promise<string> {
  return translateNarrationPromptToFluxEnglish(raw, visualStyle)
}
