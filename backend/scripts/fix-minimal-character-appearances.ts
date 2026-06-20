/**
 * 将素体项目角色 appearance 重置为阶段约束（去掉写实五官描述）
 * npx tsx scripts/fix-minimal-character-appearances.ts --drama 2 [--dry-run]
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { coerceMinimalCharacterAppearance } from '../src/constants/art-styles.js'

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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dramaId = Number(args.drama)
  const dryRun = !!args.dryRun
  if (!dramaId) throw new Error('请指定 --drama <id>')

  const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
  if (!drama) throw new Error(`项目不存在: ${dramaId}`)

  const chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId)).all()
  console.log(`项目 #${dramaId} ${drama.title} · ${chars.length} 个角色`)
  let updated = 0
  for (const ch of chars) {
    const next = coerceMinimalCharacterAppearance(ch.variantLabel, ch.appearance)
    if (next === (ch.appearance || '').trim()) continue
    console.log(`  ${ch.name}${ch.variantLabel ? `(${ch.variantLabel})` : ''}`)
    console.log(`    旧: ${String(ch.appearance || '').slice(0, 80)}…`)
    console.log(`    新: ${next}`)
    if (!dryRun) {
      db.update(schema.characters)
        .set({ appearance: next, updatedAt: new Date().toISOString() })
        .where(eq(schema.characters.id, ch.id))
        .run()
    }
    updated++
  }
  console.log(dryRun ? `\n[dry-run] 将更新 ${updated} 个角色` : `\n已更新 ${updated} 个角色`)
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
