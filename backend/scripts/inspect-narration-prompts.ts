import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { breakdownNarrationStoryboards } from '../src/services/narration-breakdown.js'
import { breakdownNarrationImages } from '../src/services/narration-image-breakdown.js'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

const episodeId = 1
const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep!.dramaId)).all()
const style = drama?.style || 'narration-minimal'

console.log('Running narration storyboard breakdown for episode', episodeId)
await breakdownNarrationStoryboards(episodeId)
console.log('Running narration image breakdown, style:', style)
const result = await breakdownNarrationImages(episodeId, style)
console.log('Image breakdown result:', JSON.stringify(result, null, 2))

const sbs = db.select().from(schema.storyboards)
  .where(eq(schema.storyboards.episodeId, episodeId)).all()
  .sort((a, b) => (a.storyboardNumber || 0) - (b.storyboardNumber || 0))

const needImage = sbs.filter(sb => parseNarrationImageMeta(sb.referenceImages).narration_image_mode === 'new')

console.log('\n=== 需配图镜头', needImage.length, '/', sbs.length, '===\n')

const BAD_PATTERNS = [
  { name: '年代/年份', re: /19\d0s?|80年代|90年代|1980|1990|八十年代|九十年代/i },
  { name: '具体服装', re: /花衬衫|喇叭裤|蛤蟆镜|西装|婚纱|护士服|旗袍|皮夹克/i },
  { name: '复古画风', re: /retro|vintage|复古风|像素|pixel|3D|写实人脸/i },
  { name: '缺素体关键词', re: /素体|圆头|小黑点眼睛/i, invert: true },
]

for (const sb of needImage) {
  const meta = parseNarrationImageMeta(sb.referenceImages)
  const prompt = sb.imagePrompt || ''
  console.log(`--- #${sb.storyboardNumber} ${sb.title} ---`)
  console.log('旁白:', (sb.description || '').slice(0, 80))
  if (meta.scene_content) console.log('场景汇总:', meta.scene_content.slice(0, 100))
  console.log('配图描述:', prompt)
  const issues = BAD_PATTERNS.filter(p => {
    const hit = p.re.test(prompt)
    return p.invert ? !hit : hit
  }).map(p => p.name)
  console.log(issues.length ? `⚠ 问题: ${issues.join(', ')}` : '✓ 格式检查通过')
  console.log()
}
