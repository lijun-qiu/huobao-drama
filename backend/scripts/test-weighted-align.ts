import { alignStoryboardsByWeightedDuration, normalizeAlignText } from '../src/services/narration-srt-align.js'

const scripts = Array.from({ length: 171 }, (_, i) =>
  i % 2 === 0 ? '剧中：18岁职高辍学打工，' : '旁白：闷热的暑气笼罩着整栋宿舍楼，',
)

const totalDuration = 418
const { ranges } = alignStoryboardsByWeightedDuration(scripts, totalDuration)

let short = 0
let minWidth = Infinity
let sumWidth = 0
for (const r of ranges) {
  const w = r.end - r.start
  sumWidth += w
  minWidth = Math.min(minWidth, w)
  if (w < 0.5) short++
}

console.log('ranges', ranges.length)
console.log('sum width', sumWidth.toFixed(2), 'expected', totalDuration)
console.log('min width', minWidth.toFixed(3))
console.log('short (<0.5s)', short)
console.log('last end', ranges[ranges.length - 1]?.end)
