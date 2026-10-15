/** the UI strings of the code: the literal first argument of every t(...) call in web/src (for the tests and `npm run i18n:missing`) */
import fs from 'node:fs'
import path from 'node:path'

const CALL = [/\bt\(\s*'((?:[^'\\]|\\.)*)'/g, /\bt\(\s*"((?:[^"\\]|\\.)*)"/g]

export function uiStrings(dir: string): string[] {
  const out = new Set<string>()
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (/\.(vue|ts)$/.test(f) && !f.endsWith('.test.ts')) {
        const s = fs.readFileSync(p, 'utf8')
        for (const re of CALL) for (const m of s.matchAll(re)) out.add(m[1].replace(/\\(['"\\])/g, '$1'))
      }
    }
  }
  walk(dir)
  return [...out].sort()
}

const placeholders = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join()

/** problems of one translation file: missing strings, unused keys, placeholders that differ */
export function checkTranslation(strings: string[], tr: Record<string, string>) {
  return {
    missing: strings.filter(k => !tr[k]),
    unused: Object.keys(tr).filter(k => !strings.includes(k)),
    placeholders: strings.filter(k => tr[k] && placeholders(k) !== placeholders(tr[k])),
  }
}
