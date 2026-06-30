import fs from 'node:fs'
import path from 'node:path'

const STUDIO_PATH = 'app/composables/useEpisodeStudio.ts'
const COMP_DIR = 'app/components/episode'

let studio = fs.readFileSync(STUDIO_PATH, 'utf8')
const fnStart = studio.indexOf('export function useEpisodeStudio() {') + 'export function useEpisodeStudio() {'.length
const finalReturn = studio.lastIndexOf('\n  return {')
const body = studio.slice(fnStart, finalReturn)

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

function parseImports(header) {
  const names = new Set()
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
}

function readComponentTemplates() {
  let templates = ''
  for (const f of fs.readdirSync(COMP_DIR)) {
    if (!f.endsWith('.vue')) continue
    const lines = fs.readFileSync(path.join(COMP_DIR, f), 'utf8').split('\n')
    const scriptIdx = lines.findIndex((l) => l.trim().startsWith('<script'))
    let end = -1
    for (let i = 0; i < scriptIdx; i++) {
      if (lines[i].trim() === '</template>') end = i
    }
    const start = lines.findIndex((l) => l.trim() === '<template>') + 1
    templates += `${lines.slice(start, end).join('\n')}\n`
  }
  return templates
}

const header = studio.slice(0, fnStart)
const imports = parseImports(header)
const defined = extractTopLevelBindings(body)
const templates = readComponentTemplates()

for (const name of imports) {
  if (new RegExp(`\\b${name}\\b`).test(templates)) defined.add(name)
}
if (/\bnavigateTo\b/.test(templates)) defined.add('navigateTo')
defined.delete('route')
defined.delete('ref') // Vue template ref= attribute false positive

const names = [...defined].sort()
const returnBlock = `\n  return {\n${names.map((n) => `    ${n},`).join('\n')}\n  }`
const injectStart = studio.indexOf('\n}\n\nexport function useEpisodeStudioInject', finalReturn)
studio = studio.slice(0, finalReturn) + returnBlock + studio.slice(injectStart)
fs.writeFileSync(STUDIO_PATH, studio)

console.log('Rebuilt return with', names.length, 'bindings')
console.log('Added template imports:', [...imports].filter((n) => templates.includes(n) && n !== 'ref' && n !== 'computed').join(', ') || 'none')
console.log('navigateTo exported:', names.includes('navigateTo'))
