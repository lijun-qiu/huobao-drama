/**
 * 配图批量重命名 + 上传工具
 *
 * 用法:
 *   npx tsx scripts/batch-shot-images.ts plan --episode <集ID>
 *   npx tsx scripts/batch-shot-images.ts rename --dir <图片目录> --episode <集ID> [--dry-run]
 *   npx tsx scripts/batch-shot-images.ts upload --dir <图片目录> --episode <集ID> [--dry-run]
 *   npx tsx scripts/batch-shot-images.ts all --dir <图片目录> --episode <集ID> [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import {
  formatShotImageFilename,
  isImageFile,
  parseShotImageFilename,
  sortImageFilesByNumericName,
} from '../src/utils/shot-image-filename.js'
import {
  parseNarrationImageMeta,
  sortStoryboardsByOrder,
  storyboardNeedsOwnImage,
} from '../src/services/narration-image.js'
import { saveUploadedFile } from '../src/utils/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ShotRow = {
  id: number
  episodeId: number
  storyboardNumber: number
  referenceImages: string | null
  composedImage: string | null
  dialogue: string | null
  description: string | null
}

function now() {
  return new Date().toISOString()
}

function usage() {
  console.log(`
配图批量工具 — 将 1.png / 2.png 重命名为 #序号#镜头ID，并写入数据库

命令:
  plan    查看本集需配图镜头与目标文件名（不重命名）
  rename  按数字顺序重命名目录内图片
  upload  按 #序号#ID 文件名上传并关联镜头
  all     先 rename 再 upload

参数:
  --episode <id>   集 ID（episodes 表）
  --dir <path>     图片目录（rename/upload/all 必填）
  --dry-run        仅预览，不写文件/数据库

示例:
  npx tsx scripts/batch-shot-images.ts plan --episode 101
  npx tsx scripts/batch-shot-images.ts rename --dir D:/exports/shots --episode 101
  npx tsx scripts/batch-shot-images.ts upload --dir D:/exports/shots --episode 101
  npx tsx scripts/batch-shot-images.ts all --dir D:/exports/shots --episode 101 --dry-run
`)
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--dry-run') {
      args.dryRun = true
      continue
    }
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

function loadEpisodeShots(episodeId: number) {
  const [episode] = db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId))
    .all()
  if (!episode) throw new Error(`集不存在: ${episodeId}`)

  const rows = db.select({
    id: schema.storyboards.id,
    episodeId: schema.storyboards.episodeId,
    storyboardNumber: schema.storyboards.storyboardNumber,
    referenceImages: schema.storyboards.referenceImages,
    composedImage: schema.storyboards.composedImage,
    dialogue: schema.storyboards.dialogue,
    description: schema.storyboards.description,
    deletedAt: schema.storyboards.deletedAt,
  })
    .from(schema.storyboards)
    .where(and(
      eq(schema.storyboards.episodeId, episodeId),
      isNull(schema.storyboards.deletedAt),
    ))
    .all() as ShotRow[]

  const ordered = sortStoryboardsByOrder(rows)
  const needing = ordered.filter(sb => storyboardNeedsOwnImage(sb))
  return { episode, ordered, needing }
}

function globalSeq(ordered: ShotRow[], sbId: number) {
  const idx = ordered.findIndex(sb => sb.id === sbId)
  return idx >= 0 ? idx + 1 : 0
}

function listSourceImages(dir: string) {
  const abs = path.resolve(dir)
  if (!fs.existsSync(abs)) throw new Error(`目录不存在: ${abs}`)
  const names = fs.readdirSync(abs)
    .filter(name => isImageFile(name))
    .filter(name => !parseShotImageFilename(name))
  return sortImageFilesByNumericName(names).map(name => path.join(abs, name))
}

function listNamedImages(dir: string) {
  const abs = path.resolve(dir)
  if (!fs.existsSync(abs)) throw new Error(`目录不存在: ${abs}`)
  return fs.readdirSync(abs)
    .filter(name => isImageFile(name) && parseShotImageFilename(name))
    .map(name => path.join(abs, name))
}

function summarizeSceneContent(ordered: ShotRow[], sb: ShotRow): string {
  const idx = ordered.findIndex(item => item.id === sb.id)
  if (idx < 0) return ''
  const sentences: string[] = []
  const line = ordered[idx].dialogue || ordered[idx].description || ''
  if (line) sentences.push(String(line).trim())
  for (let i = idx + 1; i < ordered.length; i++) {
    const meta = parseNarrationImageMeta(ordered[i].referenceImages)
    if (meta.narration_image_mode === 'new') break
    const next = ordered[i].dialogue || ordered[i].description || ''
    if (next) sentences.push(String(next).trim())
  }
  return sentences.join('。')
}

async function cmdPlan(episodeId: number) {
  const { episode, ordered, needing } = loadEpisodeShots(episodeId)
  console.log(`集 #${episode.id} · ${episode.title} · 共 ${ordered.length} 镜，需配图 ${needing.length} 张\n`)
  if (!needing.length) {
    console.log('暂无需配图镜头')
    return
  }
  needing.forEach((sb, i) => {
    const seq = globalSeq(ordered, sb.id)
    const ext = '.png'
    const target = formatShotImageFilename(seq, sb.id, ext)
    const line = String(sb.dialogue || sb.description || '').slice(0, 40)
    console.log(`${String(i + 1).padStart(2, ' ')}. ${target}  (镜序号 #${seq}, id=${sb.id})  ${line}`)
  })
  console.log('\n将外部生成的 1.png / 2.png … 按上表顺序重命名后，再执行 upload 或在前端文件夹上传。')
}

async function cmdRename(dir: string, episodeId: number, dryRun: boolean) {
  const { needing, ordered } = loadEpisodeShots(episodeId)
  const sources = listSourceImages(dir)
  if (!needing.length) throw new Error('本集暂无需配图镜头')
  if (!sources.length) throw new Error('目录内没有可重命名的图片（需为纯数字名如 1.png，且尚未是 #序号#ID 格式）')
  if (sources.length !== needing.length) {
    throw new Error(`图片数量 ${sources.length} 与需配图镜头 ${needing.length} 不一致，请核对后再重命名`)
  }

  console.log(dryRun ? '[dry-run] 预览重命名:' : '重命名:')
  for (let i = 0; i < needing.length; i++) {
    const sb = needing[i]
    const src = sources[i]
    const ext = path.extname(src).toLowerCase() || '.png'
    const seq = globalSeq(ordered, sb.id)
    const targetName = formatShotImageFilename(seq, sb.id, ext)
    const target = path.join(path.dirname(src), targetName)
    console.log(`  ${path.basename(src)} → ${targetName}`)
    if (!dryRun) {
      if (fs.existsSync(target) && path.resolve(target) !== path.resolve(src)) {
        throw new Error(`目标已存在: ${targetName}`)
      }
      fs.renameSync(src, target)
    }
  }
  console.log(dryRun ? `\n共 ${needing.length} 个文件（未写入）` : `\n已重命名 ${needing.length} 个文件`)
}

async function cmdUpload(dir: string, episodeId: number, dryRun: boolean) {
  const { ordered, needing } = loadEpisodeShots(episodeId)
  const validIds = new Set(needing.map(sb => sb.id))
  const files = listNamedImages(dir)
  if (!files.length) throw new Error('目录内没有 #序号#ID 格式的图片，请先执行 rename')

  let ok = 0
  let skip = 0
  for (const filePath of files) {
    const parsed = parseShotImageFilename(path.basename(filePath))
    if (!parsed) continue
    const sb = ordered.find(item => item.id === parsed.storyboardId)
    if (!sb) {
      console.warn(`  跳过: ${path.basename(filePath)} — 镜头 id=${parsed.storyboardId} 不属于本集`)
      skip++
      continue
    }
    if (!validIds.has(parsed.storyboardId)) {
      console.warn(`  跳过: ${path.basename(filePath)} — 镜头 id=${parsed.storyboardId} 无需配图`)
      skip++
      continue
    }

    console.log(`  ${path.basename(filePath)} → storyboard #${parsed.storyboardId}`)
    if (dryRun) {
      ok++
      continue
    }

    const buffer = fs.readFileSync(filePath)
    const savedPath = await saveUploadedFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), 'uploads', path.basename(filePath))

    const meta = parseNarrationImageMeta(sb.referenceImages)
    let referenceImages = sb.referenceImages
    if (meta.narration_image_mode !== 'new') {
      referenceImages = JSON.stringify({
        narration_image_mode: 'new',
        scene_content: summarizeSceneContent(ordered, sb),
        narration_shot_type: meta.narration_shot_type,
        narration_tts_mode: meta.narration_tts_mode,
        title_hook: meta.title_hook,
        title_full: meta.title_full,
        paragraph_index: meta.paragraph_index,
        paragraph_layout: meta.paragraph_layout,
      })
    }

    db.update(schema.storyboards)
      .set({
        composedImage: savedPath,
        referenceImages,
        updatedAt: now(),
      })
      .where(eq(schema.storyboards.id, parsed.storyboardId))
      .run()
    ok++
  }

  console.log(dryRun
    ? `\n[dry-run] 将上传 ${ok} 张，跳过 ${skip} 张`
    : `\n已上传 ${ok} 张，跳过 ${skip} 张`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === 'help' || command === '-h' || command === '--help') {
    usage()
    return
  }

  const args = parseArgs(rest)
  const episodeId = Number(args.episode)
  if (!episodeId) throw new Error('请指定 --episode <集ID>')
  const dryRun = !!args.dryRun
  const dir = typeof args.dir === 'string' ? args.dir : ''

  switch (command) {
    case 'plan':
      await cmdPlan(episodeId)
      break
    case 'rename':
      if (!dir) throw new Error('rename 需要 --dir')
      await cmdRename(dir, episodeId, dryRun)
      break
    case 'upload':
      if (!dir) throw new Error('upload 需要 --dir')
      await cmdUpload(dir, episodeId, dryRun)
      break
    case 'all':
      if (!dir) throw new Error('all 需要 --dir')
      await cmdRename(dir, episodeId, dryRun)
      await cmdUpload(dir, episodeId, dryRun)
      break
    default:
      usage()
      throw new Error(`未知命令: ${command}`)
  }
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
