import { loadEnvLocal } from '../src/utils/load-env-local.js'
import { restoreEpisodeNarrationImagePrompts } from '../src/services/narration-image-prompt-audit.js'
import { unifyEpisodeParagraphOutfits } from '../src/services/narration-outfit-continuity.js'

loadEnvLocal()

const episodeId = Number(process.argv[2] || 108)
const restored = restoreEpisodeNarrationImagePrompts(episodeId)
const result = unifyEpisodeParagraphOutfits(episodeId, undefined, { preferLlmRaw: true })
console.log(JSON.stringify({
  episodeId,
  restored: restored.restored,
  updated: result.updated,
  samples: result.items.filter(item => !item.skipped).slice(0, 8).map(item => ({
    storyboard_number: item.storyboard_number,
    before_outfit: item.before_outfit,
    after_outfit: item.after_outfit,
  })),
  changed_count: result.items.filter(item => !item.skipped).length,
  skipped: result.items.filter(item => item.skipped).length,
}, null, 2))
