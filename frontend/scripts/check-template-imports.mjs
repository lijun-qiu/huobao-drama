import fs from 'node:fs'
import path from 'node:path'

const compDir = 'app/components/episode'
const studio = fs.readFileSync('app/composables/useEpisodeStudio.ts', 'utf8')

const finalReturn = studio.lastIndexOf('\n  return {')
const returnBlock = studio.slice(finalReturn)
const returnedNames = new Set(
  returnBlock
    .match(/return \{([\s\S]*?)\n  \}/)[1]
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    .filter(Boolean),
)

// Collect imports from composable
const imported = new Set()
for (const m of studio.matchAll(/^import .+ from '([^']+)'/gm)) {
  // skip
}
for (const block of studio.matchAll(/^import \{([\s\S]*?)\} from '([^']+)'/gm)) {
  const names = block[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
  for (const n of names) imported.add(n)
}
const defaultImport = studio.match(/^import (\w+) from/m)
if (defaultImport) imported.add(defaultImport[1])

let template = ''
for (const f of fs.readdirSync(compDir)) {
  if (!f.endsWith('.vue')) continue
  const t = fs.readFileSync(path.join(compDir, f), 'utf8').match(/<template>([\s\S]*?)<\/template>/)[1]
  template += `\n${t}`
}

const usedInTemplate = new Set()
for (const m of template.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) usedInTemplate.add(m[1])
for (const m of template.matchAll(/\{\{\s*([a-zA-Z_][\w$]*)\s*\(/g)) usedInTemplate.add(m[1])
for (const m of template.matchAll(/@click(?:\.[\w]+)?="([a-zA-Z_][\w$]*)\(/g)) usedInTemplate.add(m[1])
for (const m of template.matchAll(/v-for="[^"]*\s+in\s+([a-zA-Z_][\w$]*)/g)) usedInTemplate.add(m[1])

const missingReturn = [...usedInTemplate].filter((n) => imported.has(n) && !returnedNames.has(n)).sort()
const missingComponents = [...usedInTemplate].filter((n) => /^[A-Z]/.test(n) && !returnedNames.has(n) && !imported.has(n)).sort()

console.log('Imported symbols:', imported.size)
console.log('Returned symbols:', returnedNames.size)
console.log('Imported used in template but NOT returned:', missingReturn.join(', ') || '(none)')
console.log('PascalCase used in template but NOT returned/imported:', missingComponents.join(', ') || '(none)')
