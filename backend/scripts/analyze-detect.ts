/**
 * 模拟检测分镜：调用 LLM needs_image 并输出段落划分，不写库。
 * 用法: npx tsx scripts/analyze-detect.ts [episodeId]
 */
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { buildNarrationParagraphsAsync } from '../src/services/narration-paragraph.js'
import { buildNarrationDetectUnits } from '../src/services/narration-scene-detect.js'
import { loadEpisodeContinuityContext } from '../src/services/episode-continuity.js'
import { resolveEpisodeTextModel, resolveEpisodeTextThinking } from '../src/constants/text-models.js'

function storyboardNarrationSentence(sb: { description?: string | null; dialogue?: string | null }) {
  const desc = String(sb.description || '').trim()
  if (desc) return desc
  return String(sb.dialogue || '').trim().replace(/^(旁白|剧中)[：:]\s*/, '')
}

const episodeId = Number(process.argv[2] || 1)
const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
if (!ep) throw new Error('Episode not found')

const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()
const style = drama?.style || 'narration-minimal'

const orderedStoryboards = db.select().from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId))
  .orderBy(asc(schema.storyboards.storyboardNumber))
  .all()

const sentenceItems = orderedStoryboards.map((sb) => {
  const raw = sb.referenceImages ? JSON.parse(sb.referenceImages) : {}
  return {
    sentence: storyboardNarrationSentence(sb),
    paragraphIndex: typeof raw.script_paragraph_index === 'number' ? raw.script_paragraph_index : 0,
    isTitle: raw.narration_shot_type === 'title',
  }
})

console.log('Episode', episodeId, '| storyboards:', orderedStoryboards.length)
console.log('Detect units:', buildNarrationDetectUnits(sentenceItems).length)
console.log('Running LLM detect...\n')

const continuity = loadEpisodeContinuityContext(episodeId)
const { paragraphs, detectSource } = await buildNarrationParagraphsAsync(sentenceItems, {
  imageDetectMode: 'paragraph',
  textModel: resolveEpisodeTextModel(ep),
  textThinking: resolveEpisodeTextThinking(ep),
  style,
  fullNarrationLines: sentenceItems.map(i => i.sentence),
  previousEpisodeNarration: continuity.previousEpisodeNarration,
})

console.log('Detect source:', detectSource)
console.log('Anchors:', paragraphs.length, `(${(paragraphs.length / orderedStoryboards.length * 100).toFixed(0)}%)`)
console.log('')

for (const para of paragraphs) {
  const sbNum = orderedStoryboards[para.startIndex]?.storyboardNumber
  const endNum = orderedStoryboards[para.endIndex]?.storyboardNumber
  const range = para.startIndex === para.endIndex ? `#${String(sbNum).padStart(2, '0')}` : `#${String(sbNum).padStart(2, '0')}-#${String(endNum).padStart(2, '0')}`
  const preview = para.sentences[0]?.slice(0, 55) || ''
  const extra = para.sentences.length > 1 ? ` (+${para.sentences.length - 1}句)` : ''
  const desc = para.sceneDescription ? ` | ${para.sceneDescription.slice(0, 40)}…` : ''
  console.log(`para${String(para.index).padStart(2, '0')} ${range} ${para.sentences.length}句 | ${preview}${extra}${desc}`)
}

// 可疑：连续单句 anchor
let consecutiveSingle = 0
for (let i = 1; i < paragraphs.length; i++) {
  if (paragraphs[i].startIndex === paragraphs[i - 1].startIndex + 1
    && paragraphs[i].sentences.length === 1
    && paragraphs[i - 1].sentences.length === 1) {
    consecutiveSingle++
  }
}
console.log('\n连续单句配图段:', consecutiveSingle)

// 超长 inherit 段（>5句才开新图）
let maxGap = 0
for (let i = 0; i < paragraphs.length; i++) {
  const gap = paragraphs[i].endIndex - paragraphs[i].startIndex + 1
  maxGap = Math.max(maxGap, gap)
}
console.log('最长单图覆盖句数:', maxGap)
