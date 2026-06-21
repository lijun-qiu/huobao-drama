import { cropEpisodeNarrationImageWatermarks } from '../src/services/narration-image-crop.js'

const episodeId = Number(process.argv[2] || 103)
const result = await cropEpisodeNarrationImageWatermarks(episodeId)
console.log(JSON.stringify(result, null, 2))
