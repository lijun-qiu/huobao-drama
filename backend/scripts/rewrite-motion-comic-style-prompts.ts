/**
 * 将某集漫画解说配图文案的【画风规格】/光影质感替换为当前高对比国漫规格。
 * Usage: npx tsx scripts/rewrite-motion-comic-style-prompts.ts [episodeId]
 */
import { db, schema } from '../src/db/index.js'
import { eq, and, isNull } from 'drizzle-orm'
import { now } from '../src/utils/response.js'
import {
  MOTION_COMIC_STYLE_SPEC,
  MOTION_COMIC_SCENE_SUFFIX,
} from '../src/constants/motion-comic.js'

const episodeId = Number(process.argv[2] || 305)

const rows = db.select().from(schema.storyboards)
  .where(and(eq(schema.storyboards.episodeId, episodeId), isNull(schema.storyboards.deletedAt)))
  .all()

let fixed = 0
for (const sb of rows) {
  let p = String(sb.imagePrompt || '').trim()
  if (!p) continue
  const prev = p

  if (/【画风规格[：:]/.test(p)) {
    p = p.replace(/【画风规格[：:][^】]*】/, `【画风规格：${MOTION_COMIC_STYLE_SPEC}】`)
  }

  // 光影：柔光/黄金时刻 → 冷色戏剧光
  p = p.replace(/【光影色调[：:]([^】]*)】/g, (_, inner: string) => {
    let body = String(inner || '')
      .replace(/温暖黄金时刻[^，；】]*/g, '冷蓝单侧戏剧光')
      .replace(/黄金时刻[^，；】]*/g, '冷色戏剧光')
      .replace(/柔和(?:窗光|侧光|光影)[^，；】]*/g, '硬边冷色侧光与深阴影')
      .replace(/霓虹冷色侧光与发丝轮廓逆光/g, '冷蓝侧光与发丝冷白轮廓光，半脸可陷入深阴影')
    if (!/戏剧光|硬边|冷蓝|深阴影|高对比/.test(body)) {
      body = `冷蓝单侧戏剧光与深阴影，发丝冷白轮廓光，${body}`
    }
    return `【光影色调：${body}】`
  })

  p = p.replace(/【质感要求[：:]([^】]*)】/g, () => {
    return `【质感要求：锋利干净线稿，硬边赛璐璐高对比，${MOTION_COMIC_SCENE_SUFFIX}】`
  })

  if (p === prev) continue
  db.update(schema.storyboards)
    .set({ imagePrompt: p, updatedAt: now() })
    .where(eq(schema.storyboards.id, sb.id))
    .run()
  fixed += 1
}

console.log(`episode ${episodeId}: rewritten style on ${fixed} prompts`)
