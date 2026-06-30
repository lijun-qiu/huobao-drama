import fs from 'fs'
import path from 'path'

const srcPath = 'app/pages/drama/[id]/episode/[episodeNumber].vue'
const src = fs.readFileSync(srcPath, 'utf8')
const lines = src.split(/\r?\n/)

const templateEnd = lines.findIndex((l) => l.trim() === '</template>')
const scriptStart = lines.findIndex((l) => l.trim() === '<script setup>')
const scriptEnd = lines.findIndex((l) => l.trim() === '</script>')
const styleStart = lines.findIndex((l) => l.startsWith('<style'))
const styleEnd = lines.findIndex((l) => l.trim() === '</style>')

const scriptBody = lines.slice(scriptStart + 1, scriptEnd).join('\n')
const styles = lines.slice(styleStart + 1, styleEnd).join('\n')

const sections = {
  EpisodeStudioTopbar: { range: [3, 35], wrap: null },
  EpisodeStudioSidebar: { range: [39, 90], wrap: null },
  EpisodeStageSubnav: { range: [94, 104], wrap: null },
  EpisodeScriptPanel: { range: [108, 990], wrap: 'div class="content-panel"' },
  EpisodeProductionPanel: { range: [996, 2753], wrap: 'div class="content-panel"' },
  EpisodeExportPanel: { range: [2758, 3354], wrap: 'div class="content-panel"' },
  EpisodeStepBubble: { range: [3357, 3414], wrap: null },
  EpisodeStudioModals: { range: [3415, 3499], wrap: null },
  EpisodeStudioFileInputs: { range: [3502, 3532], wrap: null },
}

const dir = 'app/components/episode'
fs.mkdirSync(dir, { recursive: true })
fs.mkdirSync('app/assets/css', { recursive: true })

fs.writeFileSync('app/assets/css/episode-studio.css', styles)

function extractReturnBindings(body) {
  const names = new Set()
  for (const line of body.split('\n')) {
    if (line.startsWith(' ') || line.startsWith('\t')) continue
    let m = line.match(/^async function ([A-Za-z_$][\w$]*)/)
    if (m) {
      names.add(m[1])
      continue
    }
    m = line.match(/^function ([A-Za-z_$][\w$]*)/)
    if (m) {
      names.add(m[1])
      continue
    }
    m = line.match(/^const (.+)$/)
    if (!m) continue
    const rhs = m[1]
    let depth = 0
    let start = 0
    const parts = []
    for (let i = 0; i < rhs.length; i++) {
      const c = rhs[i]
      if (c === '(' || c === '{' || c === '[') depth++
      else if (c === ')' || c === '}' || c === ']') depth--
      else if (c === ',' && depth === 0) {
        parts.push(rhs.slice(start, i).trim())
        start = i + 1
      }
    }
    parts.push(rhs.slice(start).trim())
    for (const part of parts) {
      const lhs = part.split('=')[0].trim()
      if (lhs.startsWith('{') || lhs.startsWith('[')) {
        const inner = lhs.replace(/^[\[{]/, '').replace(/[\]}]\s*$/, '')
        for (const seg of inner.split(',')) {
          const s = seg.trim()
          if (!s) continue
          const renamed = s.match(/:\s*([A-Za-z_$][\w$]*)\s*$/)
          if (renamed) names.add(renamed[1])
          else {
            const plain = s.match(/^([A-Za-z_$][\w$]*)/)
            if (plain) names.add(plain[1])
          }
        }
      } else {
        const nm = lhs.match(/^([A-Za-z_$][\w$]*)/)
        if (nm) names.add(nm[1])
      }
    }
  }
  names.delete('route')
  for (const n of ['artStyleLabel', 'BaseSelect', 'bgmModelLabel', 'formatCharacterDisplayName', 'imageModelSupportsReferenceImages', 'Loader2', 'textModelSupportsThinking']) {
    names.add(n)
  }
  return [...names].sort()
}

const bindingNames = extractReturnBindings(scriptBody)

const cleanedScriptBody = scriptBody
  .replace(/^definePageMeta\([^)]*\)\s*\n/m, '')
  .replace(
    /import \{([^}]+)\} from 'vue'/,
    (_full, imports) => {
      const parts = imports.split(',').map((s) => s.trim()).filter(Boolean)
      if (!parts.includes('inject')) parts.push('inject')
      if (!parts.some((p) => p.includes('InjectionKey'))) parts.push('type InjectionKey')
      return `import { ${parts.join(', ')} } from 'vue'`
    },
  )

const scriptLines = cleanedScriptBody.split('\n')
const logicStart = scriptLines.findIndex((l) => l.startsWith('const route'))
const importBlock = logicStart > 0 ? scriptLines.slice(0, logicStart).join('\n') : ''
const logicBlock = logicStart >= 0 ? scriptLines.slice(logicStart).join('\n') : cleanedScriptBody

const composableFixed = `${importBlock}

export const EPISODE_STUDIO_KEY: InjectionKey<EpisodeStudioContext> = Symbol('episodeStudio')

export type EpisodeStudioContext = ReturnType<typeof useEpisodeStudio>

export function useEpisodeStudio() {
${logicBlock}

  return {
${bindingNames.map((n) => `    ${n},`).join('\n')}
  }
}

export function useEpisodeStudioInject(): EpisodeStudioContext {
  const ctx = inject(EPISODE_STUDIO_KEY)
  if (!ctx) throw new Error('useEpisodeStudioInject() called without provider')
  return ctx
}
`

fs.writeFileSync('app/composables/useEpisodeStudio.ts', composableFixed)

function makeComponent(name, { range, wrap }) {
  let chunk = lines.slice(range[0] - 1, range[1]).join('\n').trim()
  if (wrap) {
    const tagName = wrap.split(' ')[0]
    chunk = `<${wrap}>\n${chunk}\n</${tagName}>`
  }
  const content = `<template>
${chunk}
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
  fs.writeFileSync(path.join(dir, `${name}.vue`), content)
}

for (const [name, cfg] of Object.entries(sections)) {
  makeComponent(name, cfg)
}

const page = `<template>
  <div v-if="!drama" class="studio-loading">加载中…</div>
  <div v-else class="studio">
    <EpisodeStudioTopbar />

    <div class="studio-body">
      <EpisodeStudioSidebar />

      <main class="main">
        <EpisodeStageSubnav />

        <EpisodeScriptPanel v-if="panel === 'script'" />
        <EpisodeProductionPanel v-else-if="panel === 'production'" />
        <EpisodeExportPanel v-else />

        <EpisodeStepBubble />
        <EpisodeStudioModals />
      </main>
    </div>

    <EpisodeStudioFileInputs />
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { useEpisodeStudio, EPISODE_STUDIO_KEY } from '~/composables/useEpisodeStudio'
import EpisodeStudioTopbar from '~/components/episode/EpisodeStudioTopbar.vue'
import EpisodeStudioSidebar from '~/components/episode/EpisodeStudioSidebar.vue'
import EpisodeStageSubnav from '~/components/episode/EpisodeStageSubnav.vue'
import EpisodeScriptPanel from '~/components/episode/EpisodeScriptPanel.vue'
import EpisodeProductionPanel from '~/components/episode/EpisodeProductionPanel.vue'
import EpisodeExportPanel from '~/components/episode/EpisodeExportPanel.vue'
import EpisodeStepBubble from '~/components/episode/EpisodeStepBubble.vue'
import EpisodeStudioModals from '~/components/episode/EpisodeStudioModals.vue'
import EpisodeStudioFileInputs from '~/components/episode/EpisodeStudioFileInputs.vue'

definePageMeta({ layout: 'studio' })

const studio = useEpisodeStudio()
provide(EPISODE_STUDIO_KEY, studio)

const { drama, panel } = studio
</script>

<style>
@import '~/assets/css/episode-studio.css';

.studio-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-dim, #64748b);
  font-size: 14px;
}
</style>
`

fs.writeFileSync(srcPath, page)

console.log('Done')
console.log('Top-level bindings:', bindingNames.length)
console.log('Components:', fs.readdirSync(dir).join(', '))
