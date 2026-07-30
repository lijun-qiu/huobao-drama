/**
 * 清洗已入库配图文案：仅在【画面主体】补性别（男性/女性）
 * npx tsx scripts/fix-gender-in-image-prompts.ts [--drama <id>] [--episode <id>] [--dry-run]
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { injectGenderIntoImagePromptSubject, subjectBracketHasGender } from '../src/constants/art-styles.js'
import { resolveCharacterGenderLabelCn } from '../src/services/comfyui-client.js'
import { now } from '../src/utils/response.js'

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--dry-run') { args.dryRun = true; continue }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const val = argv[i + 1]
      if (!val || val.startsWith('--')) throw new Error(`缺少参数: ${token}`)
      args[key] = val
      i++
    }
  }
  return args
}

function resolveStoryboardGenderLabel(storyboardId: number, episodeId: number): '男性' | '女性' | null {
  const links = db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
  for (const link of links) {
    const ch = db.select().from(schema.characters)
      .where(eq(schema.characters.id, link.characterId)).all()[0]
    if (!ch) continue
    const label = resolveCharacterGenderLabelCn(ch.name, ch.role, ch.appearance)
    if (label) return label
  }

  const episodeLinks = db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
  for (const link of episodeLinks) {
    const ch = db.select().from(schema.characters)
      .where(eq(schema.characters.id, link.characterId)).all()[0]
    if (!ch) continue
    const label = resolveCharacterGenderLabelCn(ch.name, ch.role, ch.appearance)
    if (label) return label
  }
  return null
}

function promptNeedsGenderFix(prompt: string): boolean {
  const matches = String(prompt || '').matchAll(/【画面主体[：:]\s*([^】]*)(】)/g)
  for (const m of matches) {
    if (!subjectBracketHasGender(m[1])) return true
  }
  return false
}

function clearFluxEnglishCache(referenceImages: string | null): string | null {
  if (!referenceImages?.trim()) return referenceImages
  try {
    const raw = JSON.parse(referenceImages) as Record<string, unknown>
    if (!raw.flux_prompt_en) return referenceImages
    delete raw.flux_prompt_en
    delete raw.flux_prompt_en_at
    delete raw.flux_prompt_en_version
    return JSON.stringify(raw)
  } catch {
    return referenceImages
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dramaId = args.drama ? Number(args.drama) : null
  const episodeId = args.episode ? Number(args.episode) : null
  const dryRun = !!args.dryRun

  let episodeIds: number[] | null = null
  if (episodeId) {
    episodeIds = [episodeId]
  } else if (dramaId) {
    episodeIds = db.select({ id: schema.episodes.id })
      .from(schema.episodes)
      .where(eq(schema.episodes.dramaId, dramaId))
      .all()
      .map(r => r.id)
  }

  const allStoryboards = db.select().from(schema.storyboards).all()
  const storyboards = episodeIds
    ? allStoryboards.filter(sb => episodeIds!.includes(sb.episodeId))
    : allStoryboards

  let scanned = 0
  let matched = 0
  let updated = 0
  let skippedNoGender = 0

  for (const sb of storyboards) {
    const prompt = String(sb.imagePrompt || '').trim()
    if (!prompt) continue
    scanned++
    if (!promptNeedsGenderFix(prompt)) continue
    matched++

    const genderLabel = resolveStoryboardGenderLabel(sb.id, sb.episodeId)
    if (!genderLabel) {
      skippedNoGender++
      console.warn(`[skip] storyboard #${sb.id}: 无法推断性别`)
      continue
    }

    const nextPrompt = injectGenderIntoImagePromptSubject(prompt, genderLabel)
    if (nextPrompt === prompt) continue

    if (dryRun) {
      console.log(`[dry-run] #${sb.id} ${genderLabel}`)
      console.log(`  before: ${prompt.slice(0, 160)}…`)
      console.log(`  after:  ${nextPrompt.slice(0, 160)}…`)
      updated++
      continue
    }

    db.update(schema.storyboards)
      .set({
        imagePrompt: nextPrompt,
        referenceImages: clearFluxEnglishCache(sb.referenceImages),
        updatedAt: now(),
      })
      .where(eq(schema.storyboards.id, sb.id))
      .run()
    updated++
    console.log(`[updated] #${sb.id} +${genderLabel}`)
  }

  console.log(JSON.stringify({
    dryRun,
    scanned,
    matched,
    updated,
    skippedNoGender,
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
