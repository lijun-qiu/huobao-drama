import { convertEpisodeOutfitColorsToHex } from '../src/services/narration-outfit-continuity.js'

const episodeId = Number(process.argv[2] || 108)
const result = convertEpisodeOutfitColorsToHex(episodeId)
console.log(JSON.stringify({
  episodeId,
  updated: result.updated,
  samples: result.items.filter(item => !item.skipped).slice(0, 10).map(item => ({
    storyboard_number: item.storyboard_number,
    before_outfit: item.before_outfit,
    after_outfit: item.after_outfit,
  })),
  skipped: result.items.filter(item => item.skipped).length,
}, null, 2))
