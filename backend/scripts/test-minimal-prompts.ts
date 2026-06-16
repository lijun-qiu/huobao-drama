import { finalizeNarrationImagePrompt, buildNarrationSceneImagePromptContent } from '../src/constants/art-styles.js'
import { buildCharacterPortraitPrompt } from '../src/services/narration-characters.js'

const badScene = '16:9 横屏，2D 扁平化卡通动画，白色圆头无脸素体小人，黑色简洁轮廓线，纯色平涂无纹理渐变，年代中国县城夜市街景，摊位悬挂喇叭裤和蛤蟆镜，二八杠自行车靠在摊位旁，男性角色在摊位前整理喇叭裤'

console.log('=== 场景 prompt 清洗 ===')
console.log(finalizeNarrationImagePrompt(badScene))

console.log('\n=== 规则兜底 prompt ===')
console.log(buildNarrationSceneImagePromptContent('夜晚县城夜市，素体小人在摊位前整理货物，周围有其他素体小人围观，简化街景与灯泡照明'))

console.log('\n=== 定妆 prompt（青年）===')
console.log(buildCharacterPortraitPrompt({
  name: '男主',
  variantLabel: '青年',
  appearance: '28岁男性，花衬衫喇叭裤，戴墨镜，推自行车',
  role: '主角',
}, 'narration-minimal'))

console.log('\n=== 定妆 prompt（老年）===')
console.log(buildCharacterPortraitPrompt({
  name: '男主',
  variantLabel: '老年',
  appearance: '60岁男性，头发花白，脸上有皱纹，穿着灰布衣服，摇蒲扇',
  role: '主角',
}, 'narration-minimal'))
