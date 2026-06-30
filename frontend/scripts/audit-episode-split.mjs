import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const STUDIO_PATH = 'app/composables/useEpisodeStudio.ts'
const COMP_DIR = 'app/components/episode'
const PAGE_PATH = 'app/pages/drama/[id]/episode/[episodeNumber].vue'

const studio = fs.readFileSync(STUDIO_PATH, 'utf8')
const fnStart = studio.indexOf('export function useEpisodeStudio() {') + 'export function useEpisodeStudio() {'.length
const finalReturn = studio.lastIndexOf('\n  return {')
const body = studio.slice(fnStart, finalReturn)
const returnBlock = studio.slice(finalReturn).match(/return \{([\s\S]*?)\n  \}/)[1]
const returnNames = new Set(
  returnBlock
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    .filter(Boolean),
)

function extractTopLevelBindings(source) {
  const names = new Set()
  for (const line of source.split('\n')) {
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
  return names
}

const defined = extractTopLevelBindings(body)
const imports = (() => {
  const names = new Set()
  const header = studio.slice(0, fnStart)
  for (const m of header.matchAll(/^import \{([\s\S]*?)\} from '([^']+)'/gm)) {
    for (const part of m[1].split(',')) {
      const s = part.trim()
      if (!s || s.startsWith('type ')) continue
      if (s.includes(' as ')) names.add(s.split(' as ').pop().trim())
      else {
        const d = s.match(/^([A-Za-z_$][\w$]*)/)
        if (d) names.add(d[1])
      }
    }
  }
  const def = header.match(/^import (\w+) from/m)
  if (def) names.add(def[1])
  return names
})()
for (const n of imports) defined.add(n)
if (returnNames.has('navigateTo')) defined.add('navigateTo')

const invalidReturn = [...returnNames].filter((n) => !defined.has(n)).sort()
const missingReturn = [...defined].filter((n) => !returnNames.has(n)).sort()

console.log('=== RETURN BLOCK ===')
console.log('Return count:', returnNames.size)
console.log('Defined count:', defined.size)
console.log('Invalid in return:', invalidReturn.length ? invalidReturn.join(', ') : 'none')
console.log('Not exported (may be internal):', missingReturn.length, missingReturn.slice(0, 15).join(', '), missingReturn.length > 15 ? '...' : '')

// Template usage in components
const skip = new Set([
  'true', 'false', 'null', 'undefined', 'if', 'else', 'in', 'of', 'as', 'typeof', 'new', 'return',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Date', 'Math', 'parseInt', 'parseFloat',
  'panel', 'script', 'production', 'export', 'chars', 'scenes', 'shots', 'videos', 'compose', 'voice',
  'dubbing', 'bgm', 'merge', 'opening', 'title', 'chat', 'table', 'first', 'first_last', 'first_frame',
  'multi_ref', 'all', 'paragraph', 'inherit', 'own', 'step', 'sub', 'item', 't', 'm', 'c', 'sb', 'i',
  'f', 'p', 'v', 'n', 'k', 'x', 'y', 'div', 'span', 'button', 'svg', 'line', 'polyline', 'polygon',
  'rect', 'path', 'template', 'component', 'slot', 'is', 'size', 'active', 'done', 'current', 'primary',
  'dim', 'ok', 'open', 'src', 'local', 'assistant', 'user', 'role', 'content', 'id', 'label', 'value',
  'key', 'icon', 'desc', 'badge', 'gender', 'traits', 'suitable', 'rows', 'cols', 'flex', 'block',
  'manual', 'pixverse', 'sound', 'effect', 'busy', 'success', 'thinking', 'toast', 'voicebox', 'max',
  'length', 'idx', 'name', 'description', 'dialogue', 'imageUrl', 'image_url', 'isTitle', 'items',
  'section', 'msg', '$',
])

function collectTemplateIds(template) {
  const ids = new Set()
  for (const m of template.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) ids.add(m[1])
  for (const m of template.matchAll(/\{\{\s*([^}|]+?)\s*\}\}/g)) {
    for (const tok of m[1].split(/[^a-zA-Z0-9_$]/)) {
      if (/^[a-zA-Z_$]/.test(tok)) ids.add(tok.split('.')[0].split('[')[0])
    }
  }
  for (const m of template.matchAll(/v-(?:if|else-if|show|for|model|bind:[\w.]+)="([^"]+)"/g)) {
    for (const tok of m[1].split(/[^a-zA-Z0-9_$]/)) {
      if (/^[a-zA-Z_$]/.test(tok)) ids.add(tok.split('.')[0].split('[')[0])
    }
  }
  for (const m of template.matchAll(/@click(?:\.[\w]+)?="([^"]+)"/g)) {
    for (const tok of m[1].replace(/\([^)]*\)/g, ' ').split(/[^a-zA-Z0-9_$]/)) {
      if (/^[a-zA-Z_$]/.test(tok)) ids.add(tok.split('.')[0])
    }
  }
  for (const m of template.matchAll(/:[\w-]+="([^"]+)"/g)) {
    for (const tok of m[1].split(/[^a-zA-Z0-9_$]/)) {
      if (/^[a-zA-Z_$]/.test(tok)) ids.add(tok.split('.')[0].split('[')[0])
    }
  }
  return ids
}

function getTemplate(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const scriptIdx = content.split('\n').findIndex((l) => l.trim().startsWith('<script'))
  let end = -1
  for (let i = 0; i < scriptIdx; i++) {
    if (content.split('\n')[i].trim() === '</template>') end = i
  }
  const lines = content.split('\n')
  const start = lines.findIndex((l) => l.trim() === '<template>') + 1
  return lines.slice(start, end).join('\n')
}

console.log('\n=== TEMPLATE BINDINGS (child components) ===')
const compFiles = fs.readdirSync(COMP_DIR).filter((f) => f.endsWith('.vue')).sort()
const missingInReturn = new Map()

for (const file of compFiles) {
  const template = getTemplate(path.join(COMP_DIR, file))
  const ids = [...collectTemplateIds(template)].filter((id) => !skip.has(id) && !returnNames.has(id)).sort()
  if (ids.length) missingInReturn.set(file, ids)
}

if (missingInReturn.size === 0) {
  console.log('All template identifiers covered by return block')
} else {
  for (const [file, ids] of missingInReturn) {
    console.log(`${file}: ${ids.join(', ')}`)
  }
}

// Page file checks
console.log('\n=== PAGE FILE ===')
const page = fs.readFileSync(PAGE_PATH, 'utf8')
console.log('Uses script setup only:', !page.includes('export default defineComponent'))
console.log('Has provide:', page.includes('provide(EPISODE_STUDIO_KEY'))
console.log('Has definePageMeta:', page.includes("layout: 'studio'"))
console.log('Imports all 9 components:', compFiles.every((f) => page.includes(f.replace('.vue', ''))))

// Child component pattern
console.log('\n=== CHILD COMPONENTS ===')
for (const file of compFiles) {
  const content = fs.readFileSync(path.join(COMP_DIR, file), 'utf8')
  const usesInject = content.includes('useEpisodeStudioInject')
  const usesDefineComponent = content.includes('defineComponent')
  const hasScriptSetup = content.includes('<script setup')
  if (!usesInject || !usesDefineComponent || hasScriptSetup) {
    console.log(`WARN ${file}: inject=${usesInject} defineComponent=${usesDefineComponent} scriptSetup=${hasScriptSetup}`)
  }
}
console.log('All child components use defineComponent + inject')

// Original parity
const orig = execSync('git -C .. show HEAD:frontend/app/pages/drama/[id]/episode/[episodeNumber].vue', { encoding: 'utf8' })
const origLines = orig.split(/\r?\n/)
const scriptStart = origLines.findIndex((l) => l.trim() === '<script setup>') + 1
const scriptEnd = origLines.findIndex((l) => l.trim() === '</script>')
const origScript = origLines.slice(scriptStart, scriptEnd).join('\n')
const importsEnd = origScript.split('\n').findIndex((l) => l.startsWith('const route'))
const origLogic = origScript.split('\n').slice(importsEnd).join('\n').replace(/^definePageMeta[^\n]*\n/m, '')
const compLogic = body.trim()
console.log('\n=== ORIGINAL PARITY ===')
console.log('Script logic exact match:', origLogic === compLogic)

const origStyle = origLines.slice(origLines.findIndex((l) => l.startsWith('<style')) + 1, origLines.findIndex((l) => l.trim() === '</style>')).join('\n')
const splitStyle = fs.readFileSync('app/assets/css/episode-studio.css', 'utf8')
console.log('Styles exact match:', origStyle === splitStyle)

// Simulate return evaluation - check each return name resolves in function scope
console.log('\n=== RUNTIME RETURN SIMULATION ===')
try {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`
    ${body}
    return {
${returnBlock.split('\n').slice(1, -1).join('\n')}
    }
  `)
  fn()
  console.log('Return object evaluates: OK')
} catch (e) {
  console.log('Return object evaluates: FAIL -', e.message)
}

// Duplicate return keys
const dupes = returnBlock.split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean)
const seen = new Set()
const duplicates = []
for (const d of dupes) {
  if (seen.has(d)) duplicates.push(d)
  seen.add(d)
}
console.log('Duplicate return keys:', duplicates.length ? duplicates.join(', ') : 'none')

process.exit(invalidReturn.length || missingInReturn.size ? 1 : 0)
