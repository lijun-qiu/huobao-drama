/**
 * 清洗已入库配图 prompt 中的暴力血腥描述
 * npx tsx scripts/fix-violence-image-prompts.ts [--drama <id>] [--episode <id>] [--dry-run]
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import {
  normalizeArtStyle,
  resolveLLMImagePrompt,
  sanitizeSceneImagePrompt,
  sanitizeViolenceInImagePrompt,
  VIOLENCE_IMAGE_DETECT_RE,
  VIOLENCE_RESIDUE_DETECT_RE,
} from '../src/constants/art-styles.js'

function promptNeedsViolenceFix(text: string): boolean {
  return VIOLENCE_IMAGE_DETECT_RE.test(text) || VIOLENCE_RESIDUE_DETECT_RE.test(text)
}

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

function cleanPrompt(raw: string, style: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return trimmed
  const sanitized = sanitizeSceneImagePrompt(trimmed)
  const resolved = resolveLLMImagePrompt(sanitized, style) || sanitized
  return sanitizeViolenceInImagePrompt(resolved)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dramaId = args.drama ? Number(args.drama) : null
  const episodeId = args.episode ? Number(args.episode) : null
  const dryRun = !!args.dryRun

  const dramas = db.select().from(schema.dramas).all()
  const dramaStyleById = new Map(dramas.map(d => [d.id, normalizeArtStyle(d.style)]))

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

  const episodes = db.select().from(schema.episodes).all()
  const episodeDramaId = new Map(episodes.map(e => [e.id, e.dramaId]))

  let scanned = 0
  let matched = 0
  let updated = 0

  for (const sb of storyboards) {
    const prompt = String(sb.imagePrompt || '').trim()
    if (!prompt) continue
    scanned++

    if (!promptNeedsViolenceFix(prompt)) continue
    matched++

    const dramaIdForSb = episodeDramaId.get(sb.episodeId)
    const style = dramaStyleById.get(dramaIdForSb || 0) || 'narration-minimal'
    const next = cleanPrompt(prompt, style)
    if (next === prompt) continue

    console.log(`--- 镜头 #${sb.storyboardNumber} id=${sb.id} ep=${sb.episodeId} ---`)
    console.log(`  旧: ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`)
    console.log(`  新: ${next.slice(0, 120)}${next.length > 120 ? '…' : ''}`)

    if (!dryRun) {
      db.update(schema.storyboards)
        .set({ imagePrompt: next, updatedAt: new Date().toISOString() })
        .where(eq(schema.storyboards.id, sb.id))
        .run()
    }
    updated++
  }

  // image_generations 表中的 prompt
  const gens = db.select().from(schema.imageGenerations).all()
  let genMatched = 0
  let genUpdated = 0
  for (const gen of gens) {
    const prompt = String(gen.prompt || '').trim()
    if (!prompt || !promptNeedsViolenceFix(prompt)) continue
    genMatched++
    const next = cleanPrompt(prompt, 'narration-minimal')
    if (next === prompt) continue
    console.log(`--- image_generation id=${gen.id} ---`)
    console.log(`  旧: ${prompt.slice(0, 120)}…`)
    console.log(`  新: ${next.slice(0, 120)}…`)
    if (!dryRun) {
      db.update(schema.imageGenerations)
        .set({ prompt: next, updatedAt: new Date().toISOString() })
        .where(eq(schema.imageGenerations.id, gen.id))
        .run()
    }
    genUpdated++
  }

  console.log(
    dryRun
      ? `\n[dry-run] 扫描 ${scanned} 条配图 prompt，命中暴力词 ${matched} 条，将更新 ${updated} 条；image_generations 命中 ${genMatched}，将更新 ${genUpdated}`
      : `\n扫描 ${scanned} 条配图 prompt，命中暴力词 ${matched} 条，已更新 ${updated} 条；image_generations 命中 ${genMatched}，已更新 ${genUpdated}`,
  )
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
