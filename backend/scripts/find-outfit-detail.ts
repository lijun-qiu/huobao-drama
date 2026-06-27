import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseNarrationImageMeta } from '../src/services/narration-image.js'

const episodeId = 108
const db = new Database(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/huobao_drama.db'))
const rows = db.prepare('SELECT storyboard_number, image_prompt, reference_images FROM storyboards WHERE episode_id=?').all(episodeId) as Array<{storyboard_number:number;image_prompt:string|null;reference_images:string|null}>

const cnInWear = /(?:身穿|穿)[^】]{0,100}(?:亮|深|浅|鲜)?(?:黄|蓝|白|黑|灰|红|绿|橙|紫|卡其|棕)(?:色)?[^#]{0,12}(?:T恤|衬衫|裤|制服|便装|家居服|睡衣|背心|围裙)/

for (const sb of rows) {
  const meta = parseNarrationImageMeta(sb.reference_images)
  if (meta.narration_image_mode !== 'new') continue
  const p = String(sb.image_prompt||'')
  if (cnInWear.test(p)) {
    console.log('CN in prompt', sb.storyboard_number, p.match(/身穿[^，,】]{0,70}/)?.[0], p.match(/穿[^，,】]{0,40}/g))
  }
  if (/#[0-9a-f]{6}\s+[T恤衬衫裤]/.test(p)) console.log('hex space', sb.storyboard_number, p.match(/#[0-9a-f]{6}\s+\S+/)?.[0])
  const wear = p.match(/身穿[^，,】]{0,80}/)?.[0]||''
  if (wear && !/简笔轮廓/.test(wear) && /运动服|外套|休闲装/.test(wear)) console.log('no contour', sb.storyboard_number, wear)
  if (/穿低饱和/.test(p) && !/穿#[0-9a-f]{6}低饱和/.test(p)) console.log('support no hex', sb.storyboard_number, [...p.matchAll(/穿低饱和[^，,）]{0,20}/g)].map(m=>m[0]))
}
