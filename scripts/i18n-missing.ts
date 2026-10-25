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

// the user guide: translations that are missing or follow an older English version (web/help.ts)
const version = (lang: string) => Number(/^<!--\s*version:\s*(\d+)/.exec(fs.readFileSync(`web/src/help/${lang}.md`, 'utf8'))?.[1] ?? 0)
const en = version('en')
for (const code of fs.readdirSync('web/src/i18n').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))) {
  const f = `web/src/help/${code}.md`
  console.log(`help/${code}.md: ${!fs.existsSync(f) ? 'missing (the English is shown)' : version(code) < en ? `version ${version(code)} of ${en}, update from en.md` : 'ok'}`)
}
