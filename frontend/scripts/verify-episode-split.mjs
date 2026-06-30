import { execSync } from 'node:child_process'
import fs from 'node:fs'

const orig = execSync('git -C .. show HEAD:frontend/app/pages/drama/[id]/episode/[episodeNumber].vue', {
  encoding: 'utf8',
}).split(/\r?\n/)

const scriptStart = orig.findIndex((l) => l.trim() === '<script setup>')
let lastTemplateEnd = -1
for (let i = 0; i < scriptStart; i++) {
  if (orig[i].trim() === '</template>') lastTemplateEnd = i
}

const sections = {
  topbar: [3, 35, 'EpisodeStudioTopbar.vue'],
  sidebar: [39, 90, 'EpisodeStudioSidebar.vue'],
  subnav: [94, 104, 'EpisodeStageSubnav.vue'],
  script: [108, 990, 'EpisodeScriptPanel.vue'],
  production: [996, 2753, 'EpisodeProductionPanel.vue'],
  export: [2758, 3354, 'EpisodeExportPanel.vue'],
  bubble: [3357, 3414, 'EpisodeStepBubble.vue'],
  modals: [3415, 3499, 'EpisodeStudioModals.vue'],
  inputs: [3502, 3532, 'EpisodeStudioFileInputs.vue'],
}

const norm = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()

console.log('=== SECTION CONTENT MATCH ===')
let allOk = true
for (const [name, [a, b, file]] of Object.entries(sections)) {
  const origChunk = norm(orig.slice(a - 1, b).join('\n'))
  const comp = fs.readFileSync(`app/components/episode/${file}`, 'utf8')
  const splitChunk = norm(comp.match(/<template>([\s\S]*?)<\/template>/)[1])
  const ratio = splitChunk.length / Math.max(origChunk.length, 1)
  const ok = ratio > 0.98 && ratio < 1.02
  if (!ok) allOk = false
  console.log(`${ok ? 'OK' : 'FAIL'} ${name.padEnd(12)} ratio=${(ratio * 100).toFixed(2)}%`)
}
console.log('All sections OK:', allOk)

const compInner = Object.values(sections)
  .map(([, , f]) => fs.readFileSync(`app/components/episode/${f}`, 'utf8').match(/<template>([\s\S]*?)<\/template>/)[1])
  .join('\n')
const origTemplate = norm(orig.slice(1, lastTemplateEnd).join('\n'))
const splitTemplate = norm(compInner)
console.log('\n=== FULL TEMPLATE ===')
console.log('Original template chars:', origTemplate.length)
console.log('All components combined chars:', splitTemplate.length)
console.log('Coverage:', `${((splitTemplate.length / origTemplate.length) * 100).toFixed(2)}%`)

const sStart = orig.findIndex((l) => l.trim() === '<script setup>') + 1
const sEnd = orig.findIndex((l) => l.trim() === '</script>')
const origScript = orig.slice(sStart, sEnd).join('\n')
const importsEnd = origScript.split('\n').findIndex((l) => l.startsWith('const route'))
const origLogic = origScript.split('\n').slice(importsEnd).join('\n').replace(/^definePageMeta[^\n]*\n/m, '')
const studio = fs.readFileSync('app/composables/useEpisodeStudio.ts', 'utf8')
const fnStart = studio.indexOf('export function useEpisodeStudio() {') + 'export function useEpisodeStudio() {'.length
const finalReturn = studio.lastIndexOf('\n  return {')
const compLogic = studio.slice(fnStart, finalReturn).trim()
console.log('\n=== SCRIPT LOGIC ===')
console.log('Exact match:', origLogic === compLogic)

const origStyle = orig.slice(orig.findIndex((l) => l.startsWith('<style')) + 1, orig.findIndex((l) => l.trim() === '</style>')).join('\n')
const splitStyle = fs.readFileSync('app/assets/css/episode-studio.css', 'utf8')
console.log('\n=== STYLES ===')
console.log('Exact match:', origStyle === splitStyle)

console.log('\n=== RUNTIME WIRING ===')
console.log('definePageMeta layout studio:', fs.readFileSync('app/pages/drama/[id]/episode/[episodeNumber].vue', 'utf8').includes("layout: 'studio'"))
console.log('provide/inject:', studio.includes('EPISODE_STUDIO_KEY'))
console.log('onMounted:', compLogic.includes('onMounted('))
console.log('onBeforeUnmount:', compLogic.includes('onBeforeUnmount('))
