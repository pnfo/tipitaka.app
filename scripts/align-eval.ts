/**
 * npm run align:eval [-- --no-decisions] [--books s0101a,…] [--min-conf 0.6]
 *
 * Scores the commentary aligner against the gold set: data/alignments/gold/*.jsonl, made by
 * `npm run align:ai -- gold` (Opus searching the whole corpus) and corrected by hand (src gold:manual). No AI calls,
 * ~15 s: run it after every matcher change. --no-decisions scores the deterministic aligner alone.
 *
 * Per gold lemma: a quotation (match) is found (the predicted words overlap the gold words), wrong (other words) or
 * missed; a bold text that is no quotation (not-lemma / none) is correctly left alone or falsely aligned.
 * precision = found / aligned, recall = found / gold quotations. Writes db/align-eval.md (with the errors) and
 * db/align-eval.json (the next run prints the change).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { corpusFromDb } from '../build/align/db-corpus'
import { alignCommentaries, type Gloss } from '../build/align'
import { NodeTexts, readDecisions, resolveSelector, type Decision } from '../build/align/decisions'
import { buildParaLinks, paraPos } from '../build/links'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const ALIGN_DIR = path.join(repo, 'data/alignments')
const GOLD_DIR = path.join(ALIGN_DIR, 'gold')
const minConf = +arg('--min-conf', '0.6')!

const { corpus: c } = corpusFromDb(path.join(repo, 'db/text.db'))
const nt = new NodeTexts(c)
const gold: { book: string; d: Decision }[] = []
for (const f of fs.existsSync(GOLD_DIR) ? fs.readdirSync(GOLD_DIR).filter(f => f.endsWith('.jsonl')).sort() : []) {
  for (const l of fs.readFileSync(path.join(GOLD_DIR, f), 'utf8').split('\n')) if (l.trim()) gold.push({ book: f.replace(/\.jsonl$/, ''), d: JSON.parse(l) })
}
const only = arg('--books')?.split(',')
const items = gold.filter(g => g.d.conf >= minConf && (!only || only.some(o => g.book.startsWith(o))))
if (!items.length) { console.log('no gold set: npm run align:ai -- gold'); process.exit(1) }

const books = [...new Set(items.map(g => c.nodes[c.keyToNode.get(g.d.c.k)!]?.book).filter(b => b !== undefined))]
const useDecisions = !args.includes('--no-decisions')
const r = alignCommentaries(c, buildParaLinks(c, ALIGN_DIR), { books, decisions: useDecisions ? readDecisions(ALIGN_DIR) : [] })
const byPara = new Map<number, Gloss[]>()
for (const g of r.glosses) {
  if (g.kind === 'mula-tika') continue
  const k = paraPos(c, g.cBook, g.cIdx)
  byPara.set(k, [...(byPara.get(k) ?? []), g])
}

type Outcome = 'found' | 'wrong' | 'missed' | 'left' | 'false'
interface Row { book: string; src: string; outcome: Outcome; d: Decision; g?: Gloss }
const rows: Row[] = []
let broken = 0
const before = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
for (const { book, d } of items) {
  const cr = resolveSelector(nt, d.c)
  if (!cr) { broken++; continue }
  const w = cr.ws[cr.w0]
  const preds = (byPara.get(paraPos(c, cr.book, w.idx)) ?? []).filter(g => g.cS >= w.s && g.cS < w.e)
  const g = preds.sort((a, b) => b.conf - a.conf)[0]
  const src = g?.src ?? '-'
  if (d.v !== 'match' || !d.m) { rows.push({ book, src, outcome: g ? 'false' : 'left', d, g }); continue }
  const mr = resolveSelector(nt, d.m)
  if (!mr) { broken++; continue }
  if (!g) { rows.push({ book, src, outcome: 'missed', d }); continue }
  const a0: [number, number] = [g.tIdx, g.tS], a1: [number, number] = [g.tEIdx, g.tE]
  const b0: [number, number] = [mr.ws[mr.w0].idx, mr.ws[mr.w0].s], b1: [number, number] = [mr.ws[mr.w1].idx, mr.ws[mr.w1].e]
  const overlap = g.tBook === mr.book && before(a0, b1) && before(b0, a1)
  rows.push({ book, src, outcome: overlap ? 'found' : 'wrong', d, g })
}

interface Score { n: number; quotes: number; found: number; wrong: number; missed: number; left: number; false: number; precision: number; recall: number; f1: number }
function score(rs: Row[]): Score {
  const n = (o: Outcome) => rs.filter(r => r.outcome === o).length
  const found = n('found'), wrong = n('wrong'), missed = n('missed'), left = n('left'), fals = n('false')
  const aligned = found + wrong + fals, quotes = found + wrong + missed
  const precision = aligned ? found / aligned : 1, recall = quotes ? found / quotes : 1
  return { n: rs.length, quotes, found, wrong, missed, left, false: fals, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 }
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const line = (name: string, s: Score) => `| ${name} | ${s.n} | ${s.quotes} | ${s.found} | ${s.wrong} | ${s.missed} | ${s.false} | ${s.left} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} |`
const head = ['| | gold lemmas | quotations | found | wrong | missed | false quotation | left alone | precision | recall | F1 |', '|---|---|---|---|---|---|---|---|---|---|---|']
const all = score(rows)
const groups = (f: (r: Row) => string) => {
  const m = new Map<string, Row[]>()
  for (const r of rows) m.set(f(r), [...(m.get(f(r)) ?? []), r])
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

// change against the previous run
const jsonFile = path.join(repo, 'db/align-eval.json')
const prev = fs.existsSync(jsonFile) ? JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as { all: Score; decisions: boolean } : null
const delta = (k: 'precision' | 'recall' | 'f1') => (prev && prev.decisions === useDecisions ? ` (${all[k] >= prev.all[k] ? '+' : ''}${((all[k] - prev.all[k]) * 100).toFixed(1)})` : '')

const strip = (x: string) => x.replace(/\|[MVPT][0-9.]+\||\{[^}]*\}|\*\*/g, '')
const t = (b: number, i: number) => c.paras[paraPos(c, b, i)].text
const show = (sel: Decision['c'] | undefined) => {
  if (!sel) return ''
  const r2 = resolveSelector(nt, sel)
  if (!r2) return '?'
  const a = r2.ws[r2.w0], z = r2.ws[r2.w1]
  const p = c.paras[paraPos(c, r2.book, a.idx)].text
  return `${sel.k}: …${p.slice(Math.max(0, a.s - 60), a.s).replace(/\*\*/g, '')}⟦${p.slice(a.s, a.idx === z.idx ? z.e : p.length).replace(/\*\*/g, '')}⟧`
}
const errors = rows.filter(r => r.outcome === 'wrong' || r.outcome === 'missed' || r.outcome === 'false')
const md = [
  '# Alignment evaluation', '',
  `${new Date().toISOString()} · ${items.length} gold lemmas (conf ≥ ${minConf}) of ${new Set(items.map(i => i.book)).size} books · ${useDecisions ? 'with' : 'without'} the stored AI / manual decisions${broken ? ` · ${broken} gold rows no longer resolve` : ''}`, '',
  ...head, line('**all**', all), '',
  '## By book', '', ...head, ...groups(r => r.book).map(([k, v]) => line(k, score(v))), '',
  '## By source of the alignment', '', ...head, ...groups(r => r.src).map(([k, v]) => line(k, score(v))), '',
  `## Errors (${errors.length})`, '',
  ...errors.flatMap(e => [
    `- **${e.outcome}** ${e.book} ${e.g ? `(${e.g.src}/${e.g.mk} ${e.g.conf})` : ''}: ${show(e.d.c)}`,
    ...(e.d.m ? [`  - gold: ${show(e.d.m)}`] : [`  - gold: ${e.d.v}${e.d.note ? ` - ${e.d.note}` : ''}`]),
    ...(e.g ? [`  - aligned: ${c.books[e.g.tBook].def.id} ${e.g.tIdx}: …${strip(t(e.g.tBook, e.g.tIdx).slice(Math.max(0, e.g.tS - 60), e.g.tS))}⟦${strip(t(e.g.tBook, e.g.tIdx).slice(e.g.tS, e.g.tIdx === e.g.tEIdx ? e.g.tE : undefined)).slice(0, 120)}⟧`] : []),
  ]),
].join('\n')
fs.writeFileSync(path.join(repo, 'db/align-eval.md'), md + '\n')
fs.writeFileSync(jsonFile, JSON.stringify({ at: new Date().toISOString(), decisions: useDecisions, all }, null, 1))
console.log(`${items.length} gold lemmas, ${useDecisions ? 'with' : 'without'} decisions: precision ${pct(all.precision)}${delta('precision')}, recall ${pct(all.recall)}${delta('recall')}, F1 ${pct(all.f1)}${delta('f1')}`)
console.log(`found ${all.found}, wrong ${all.wrong}, missed ${all.missed}, false quotations ${all.false}, left alone ${all.left} -> db/align-eval.md`)
