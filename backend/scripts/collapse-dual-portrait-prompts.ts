/**
 * 将指定集已有「双对照定妆」配图文案压成单定妆（保留主标签）。
 * Usage: npx tsx scripts/collapse-dual-portrait-prompts.ts [episodeId]
 */
import { db, schema } from '../src/db/index.js'
import { eq, and, isNull } from 'drizzle-orm'
import { now } from '../src/utils/response.js'
import {
  getEpisodeVisualCharacters,
  extractAllPortraitLabelsFromPrompt,
} from '../src/services/narration-characters.js'
import {
  alignPortraitLabelsInImagePromptCn,
  collapseToSinglePortraitLabelInImagePromptCn,
  enforceSingleCharacterFrameInImagePromptCn,
} from '../src/constants/portrait-appearance-spec.js'

const episodeId = Number(process.argv[2] || 305)
const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
if (!ep) {
  console.error('episode not found', episodeId)
  process.exit(1)
}

const characters = getEpisodeVisualCharacters(episodeId, ep.dramaId)
const rows = db.select().from(schema.storyboards)
  .where(and(eq(schema.storyboards.episodeId, episodeId), isNull(schema.storyboards.deletedAt)))
  .all()

let fixed = 0
for (const sb of rows) {
  const raw = String(sb.imagePrompt || '').trim()
  if (!raw || !/对照定妆「/.test(raw)) continue

  const labels = extractAllPortraitLabelsFromPrompt(raw)
  const linkedNames: string[] = []
  const links = db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, sb.id)).all()
  for (const link of links) {
    const ch = characters.find(c => c.id === link.characterId)
    const name = String(ch?.name || '').trim()
    if (name) linkedNames.push(name)
  }

  const aligned = alignPortraitLabelsInImagePromptCn(raw, characters, {
    dialogue: sb.dialogue,
    narrationLines: [],
    fallbackNames: linkedNames.length ? linkedNames : labels.map(l => l.name),
  })
  const keep = extractAllPortraitLabelsFromPrompt(aligned)[0]?.name
    || labels[0]?.name
    || linkedNames[0]
  if (!keep) continue

  const otherNames = characters
    .map(c => String(c.name || '').trim())
    .filter(n => n && n !== keep)
  const looksDual = labels.length >= 2
    || /两人|双方|面对面|并排对坐/.test(raw)
    || otherNames.some(n => raw.includes(n) && /【核心细节动作|【画面主体|【光影色调/.test(raw))

  if (!looksDual && !/位于画面左侧|位于画面右侧/.test(raw)) continue

  const next = enforceSingleCharacterFrameInImagePromptCn(aligned, keep, characters)
  if (next === raw) continue

  db.update(schema.storyboards)
    .set({ imagePrompt: next, updatedAt: now() })
    .where(eq(schema.storyboards.id, sb.id))
    .run()
  fixed += 1
  console.log({
    id: sb.id,
    num: sb.storyboardNumber,
    from: labels.map(l => l.label),
    keep,
    to: extractAllPortraitLabelsFromPrompt(next).map(l => l.label),
    action: (next.match(/【核心细节动作[：:]([^】]*)】/) || [])[1]?.slice(0, 100),
  })
}

console.log(`episode ${episodeId}: enforced single-character frame on ${fixed} prompts`)
