import { isPixverseSoundModel } from './adapters/pixverse-sound.js'
import { isAceStepMusicModel } from './adapters/ace-step-music.js'
import { callTextChat } from './text-chat.js'
import { buildBgmDescriptionContext } from './ai-description-context.js'

interface StoryboardContext {
  dialogue?: string | null
  description?: string | null
  bgmPrompt?: string | null
  action?: string | null
  atmosphere?: string | null
  location?: string | null
}

export function buildBgmPrompt(options: {
  description?: string
  content?: string
  storyboard?: StoryboardContext
}): string {
  const parts: string[] = []
  const userDesc = String(options.description || options.storyboard?.bgmPrompt || '').trim()
  const content = String(options.content || '').trim()
  const dialogue = String(options.storyboard?.dialogue || '').trim()
  const sceneBits = [
    options.storyboard?.atmosphere,
    options.storyboard?.location,
    options.storyboard?.action,
    options.storyboard?.description,
  ].map(v => String(v || '').trim()).filter(Boolean)

  if (userDesc) parts.push(userDesc)
  if (content) parts.push(`Scene context: ${content.slice(0, 400)}`)
  else if (dialogue) parts.push(`Narration/dialogue mood: ${dialogue.slice(0, 280)}`)
  if (sceneBits.length) parts.push(`Visual mood: ${sceneBits.join(', ').slice(0, 240)}`)

  parts.push('Instrumental background music only, no vocals, cinematic, suitable for short drama narration, smooth and non-distracting')

  return parts.join('. ').slice(0, 900)
}

/** 去掉模型爱回的 markdown / 标题壳子，只留描述正文 */
export function sanitizeBgmDescription(raw: string): string {
  let text = String(raw || '').trim()
  if (!text) return ''

  // 去掉 ``` 代码块外壳
  text = text.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // 去掉前缀标签
  text = text.replace(/^(BGM|配乐|音效|音乐)描述[:：]\s*/i, '').trim()
  // 去掉 markdown 标题行
  text = text
    .split(/\r?\n/)
    .map(line => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\*\*(.+?)\*\*[:：]?\s*/, '$1：')
      .replace(/^[-*•]\s+/, '')
      .trim())
    .filter(line => {
      if (!line) return false
      // 丢掉明显是表单元数据的行
      if (/^(作品|题材|本集|范围|输出类型)\s*[:：]/.test(line)) return false
      return true
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return text.replace(/^["'`]+|["'`]+$/g, '').trim()
}

export async function generateBgmDescriptionWithLLM(options: {
  model?: string
  textModel?: string
  description?: string
  content?: string
  episodeId?: number
  storyboardId?: number
  storyboard?: StoryboardContext
}): Promise<string> {
  const pixverse = isPixverseSoundModel(options.model)
  const aceStep = isAceStepMusicModel(options.model)
  const ctx = buildBgmDescriptionContext({
    episodeId: options.episodeId,
    storyboardId: options.storyboardId,
    content: options.content,
  })

  if (!ctx.hasContent) {
    throw new Error('缺少剧本或分镜内容，请先生成旁白分镜或填写解说稿')
  }

  const targetLabel = pixverse
    ? 'PixVerse 视频音效'
    : aceStep
      ? 'ACE-Step 本地纯器乐 BGM'
      : 'Suno 纯器乐 BGM'

  const system = pixverse
    ? [
      '你是短视频音效设计师。',
      `为 ${targetLabel} 写一条可直接用于生成的中文描述。`,
      '必须根据提供的解说稿、镜头旁白、画面氛围来写，情绪与场景严格匹配，不要通用模板。',
      '只输出一段连续中文正文（50-130 字）：写环境音、空间感、节奏；可含 1-2 个英文音效词。',
      '禁止：对白、BGM 字样、markdown、标题、列表、作品名复述。',
    ].join('')
    : [
      '你是短视频配乐师。',
      `为 ${targetLabel} 写一条可直接用于生成的中文描述。`,
      '必须根据解说稿/镜头内容的情绪、节奏、题材来写，与旁白氛围一致，不要套话。',
      '只输出一段连续中文正文（50-130 字）：写乐器、情绪、节奏、氛围；强调无人声、不抢旁白。',
      '禁止：歌词、人声、markdown、标题、列表、作品名复述、分点说明。',
    ].join('')

  const userParts = [
    ctx.dramaTitle ? `作品：${ctx.dramaTitle}` : '',
    ctx.dramaGenre ? `题材：${ctx.dramaGenre}` : '',
    ctx.episodeTitle ? `本集：${ctx.episodeTitle}` : '',
    ctx.scope === 'shot' ? '范围：单个镜头配乐' : `范围：整集通用配乐（共 ${ctx.shotCount} 镜）`,
    options.description?.trim() ? `用户补充意向：${options.description.trim()}` : '',
    ctx.focusShot,
    ctx.prevShot,
    ctx.nextShot,
    !ctx.focusShot && ctx.episodeMoodSamples.length
      ? `各镜头氛围摘要：\n${ctx.episodeMoodSamples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '',
    ctx.episodeScriptExcerpt ? `解说稿/剧本摘录：\n${ctx.episodeScriptExcerpt}` : '',
    pixverse ? '输出类型：匹配画面的环境音与音效' : '输出类型：纯器乐背景音乐',
    '请直接输出描述正文，不要解释。',
  ].filter(Boolean)

  // 本地 Qwen 思考模式常把输出额度吃光导致空正文；配乐描述关思考更稳
  const raw = (await callTextChat(
    system,
    userParts.join('\n\n'),
    options.textModel || null,
    false,
    180_000,
    false,
    400,
  )).trim()

  const cleaned = sanitizeBgmDescription(raw)
  if (!cleaned) throw new Error('AI 未返回有效 BGM 描述')
  return cleaned.slice(0, 400)
}
