import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const src = execSync('git -C .. show HEAD:frontend/app/pages/drama/[id]/episode/[episodeNumber].vue', {
  encoding: 'utf8',
})
const lines = src.split(/\r?\n/)
const dir = 'app/components/episode'

function writeComponent(name, startLine, endLine) {
  const chunk = lines.slice(startLine - 1, endLine).join('\n')
  const content = `<template>
${chunk.trim()}
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useEpisodeStudioInject } from '~/composables/useEpisodeStudio'

export default defineComponent({
  setup() {
    return useEpisodeStudioInject()
  },
})
</script>
`
  fs.writeFileSync(path.join(dir, `${name}.vue`), content, 'utf8')
  console.log(name, endLine - startLine + 1, 'lines', '- first:', lines[startLine - 1].trim().slice(0, 60))
}

writeComponent('EpisodeStepBubble', 3357, 3414)
writeComponent('EpisodeStudioModals', 3415, 3499)
writeComponent('EpisodeStudioFileInputs', 3502, 3532)

try {
  fs.unlinkSync(path.join(dir, 'EpisodeOverlays.vue'))
} catch {
  // already removed
}
