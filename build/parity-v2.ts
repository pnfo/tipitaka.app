/**
 * Parity of the new text with the v2 tipitaka.app texts (Sinhala, from an older CST edition):
 *   git archive 1dd4fdf public | tar -x -C .cache/v2 && tsx build/parity-v2.ts .cache/v2/public/text
 * Per v2 file: share of its words found in the new text of the nodes its headings map to (data/legacy-map.tsv).
 * 2026-10: median 1.0, 98.4% of files >= 0.95, overall recall 0.995 (differences: VRI corrections, a few remapped files).
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { convert } from '@pnfo/pali-converter'
import { tokens } from '../shared/tokenize'
const dir = process.argv[2]
const db = new Database(path.join(path.dirname(new URL(import.meta.url).pathname), '../db/text.db'), { readonly: true })
const entries = db.prepare('SELECT file, key FROM legacy WHERE line > 0').all() as { file: string; key: string }[]
const node = db.prepare('SELECT book_id, para_start, para_end FROM node WHERE key = ?')
const paras = db.prepare('SELECT text FROM para WHERE id >= ? AND id < ?')
const byFile = new Map<string, string[]>()
for (const e of entries) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e.key])
const norm = (s: string) => s.replace(/[“”‘’"'`]/g, '')
const cnt = (ws: string[]) => { const m = new Map<string, number>(); for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1); return m }
const scores: [number, string, string][] = []
let tOld = 0, tCommon = 0
for (const [file, keys] of byFile) {
  const ns = keys.map(k => node.get(k) as { book_id: number; para_start: number; para_end: number })
  const book = ns[0].book_id
  const sel = ns.filter(n => n.book_id === book)
  const from = Math.min(...sel.map(n => n.para_start)), to = Math.max(...sel.map(n => n.para_end))
  const newText = (paras.all(book * 1048576 + from, book * 1048576 + to) as { text: string }[]).map(r => r.text).join(' ')
  const old = fs.readFileSync(path.join(dir, file + '.txt'), 'utf8').split(/\r?\n/).map(l => l.replace(/^[a-z]{3}:(\d+:)?/, '').replace(/<pb [^>]*\/>/g, '').replace(/<n>(.*?)<\/n>/g, '{$1}').replace(/<\/?b>/g, '**')).join(' ')
  const a = cnt(tokens(norm(convert(old, 'latn', 'sinh').toLowerCase()))), b = cnt(tokens(norm(newText)))
  let common = 0, ta = 0, tb = 0
  for (const v of a.values()) ta += v
  for (const v of b.values()) tb += v
  for (const [w, v] of a) common += Math.min(v, b.get(w) ?? 0)
  tOld += ta; tCommon += common
  scores.push([common / Math.max(ta, 1), file, `${keys[0]} old=${ta} new=${tb}`])
}
const s = scores.map(x => x[0]).sort((a, b) => a - b)
const pct = (p: number) => s[Math.floor(p * (s.length - 1))].toFixed(4)
console.log(`files ${s.length}  p1 ${pct(0.01)}  p5 ${pct(0.05)}  p25 ${pct(0.25)}  median ${pct(0.5)}  >=0.98: ${(s.filter(x => x >= 0.98).length / s.length * 100).toFixed(1)}%  >=0.95: ${(s.filter(x => x >= 0.95).length / s.length * 100).toFixed(1)}%  overall old-token recall ${(tCommon / tOld).toFixed(4)}`)
console.log(scores.sort((a, b) => a[0] - b[0]).slice(0, 10).map(w => `${w[0].toFixed(3)} ${w[1]} ${w[2]}`).join('\n'))
