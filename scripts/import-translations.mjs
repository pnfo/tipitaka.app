// node scripts/import-translations.mjs - one time import of the v2 UI translations (public/translations/<lang>.txt,
// "english line, translation line" pairs) into web/src/i18n/<lang>.json. New strings are added by translators there.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(repo, 'public/translations'), dst = path.join(repo, 'web/src/i18n')
fs.mkdirSync(dst, { recursive: true })
for (const f of fs.readdirSync(src).filter(f => /^[a-z]{2}\.txt$/.test(f))) {
  const lines = fs.readFileSync(path.join(src, f), 'utf8').split(/\r?\n/)
  const out = {}
  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].trim()
    if (!key) continue
    const val = (lines[++i] ?? '').trim()
    if (val) out[key] = val
  }
  fs.writeFileSync(path.join(dst, f.replace('.txt', '.json')), JSON.stringify(out, null, 1) + '\n')
  console.log(f, Object.keys(out).length)
}
