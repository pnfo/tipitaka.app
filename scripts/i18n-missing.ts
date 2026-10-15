// lists the UI strings without translation (and unused keys) per language: npm run i18n:missing
import fs from 'node:fs'
import { checkTranslation, uiStrings } from '../web/src/i18n/strings'

const strings = uiStrings('web/src')
for (const f of fs.readdirSync('web/src/i18n').filter(f => f.endsWith('.json'))) {
  const r = checkTranslation(strings, JSON.parse(fs.readFileSync(`web/src/i18n/${f}`, 'utf8')))
  console.log(`${f}: ${r.missing.length} missing, ${r.unused.length} unused, ${r.placeholders.length} placeholder mismatches`)
  for (const k of r.missing) console.log(`  missing: ${JSON.stringify(k)}`)
  for (const k of r.placeholders) console.log(`  placeholders: ${JSON.stringify(k)}`)
}
