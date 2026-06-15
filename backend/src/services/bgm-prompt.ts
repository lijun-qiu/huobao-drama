import { isPixverseSoundModel } from './adapters/pixverse-sound.js'
import { callTextChat } from './narration-characters.js'
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

export async function generateBgmDescriptionWithLLM(options: {
  model?: string
  description?: string
  content?: string
  episodeId?: number
  storyboardId?: number
  storyboard?: StoryboardContext
}): Promise<string> {
  const pixverse = isPixverseSoundModel(options.model)
  const ctx = buildBgmDescriptionContext({
    episodeId: options.episodeId,
    storyboardId: options.storyboardId,
    content: options.content,
  })

  if (!ctx.hasContent) {
    throw new Error('缺少剧本或分镜内容，请先生成旁白分镜或填写解说稿')
  }

  const system = pixverse
    ? [
      '你是短视频音效设计师，为 PixVerse 视频音效生成写描述。',
      '必须根据提供的解说稿、镜头旁白、画面氛围来写，情绪与场景严格匹配，不要写通用模板。',
      '中文 50-130 字；写环境音、空间感、节奏；可含 1-2 个英文音效词；不要对白、不要「BGM」字样；只输出描述正文。',
    ].join('')
    : [
      '你是短视频配乐师，为 Suno 纯器乐生成写描述。',
      '必须根据解说稿/镜头内容的情绪、节奏、题材来写，与旁白氛围一致，不要套话。',
      '中文 50-130 字；写乐器、情绪、节奏、氛围；强调无人声、不抢旁白；只输出描述正文。',
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
  ].filter(Boolean)

  const raw = (await callTextChat(system, userParts.join('\n\n'))).trim()
  const cleaned = raw.replace(/^["'`]+|["'`]+$/g, '').replace(/^(BGM|配乐|音效)描述[:：]\s*/i, '').trim()
  if (!cleaned) throw new Error('AI 未返回有效 BGM 描述')
  return cleaned.slice(0, 400)
}
