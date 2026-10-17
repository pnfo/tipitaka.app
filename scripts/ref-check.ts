/**
 * AI check of the text references of the dictionaries (<a data-ref="<key>#<paragraph>">, build/dicts/refs.ts):
 * a stratified random sample of links; for each, Claude reads the dictionary context and the cited PTS page (the
 * paragraphs from the one where the page begins to the one where the next page begins) and says which paragraph the
 * dictionary means. Two ways of choosing the target are scored:
 *   A (current): the paragraph in which the page begins
 *   B: the first section (sutta, story ...) that begins on the page, else A
 * and references that are wrong in the dictionary itself (not on that page) are listed.
 *
 *   npm run ref-check -- [--n 300] [--seed 1] [--model opus] [--jobs 3] [--dry]   -> db/ref-check.md
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Claude, pool } from './lib/claude'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const DRY = args.includes('--dry')
const N = +arg('--n', '300')!
const MODEL = arg('--model', 'opus')!

const dict = new Database(path.join(repo, 'db/dict.db'), { readonly: true })
const text = new Database(path.join(repo, 'db/text.db'), { readonly: true })
const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
/** the text without the editions' page markers except the PTS ones, and without notes */
const clean = (t: string) => t.replace(/\{[^}]*\}/g, '').replace(/\|[MVT][0-9.]+\|/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

interface Link { dict: string; word: string; label: string; context: string; key: string; idx: number; names: string[] }

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

// ---------------- the links ----------------
const links: Link[] = []
for (const r of dict.prepare(`SELECT d.code, e.word, e.meaning FROM entry e JOIN dict d ON d.id = e.dict_id WHERE e.meaning LIKE '%data-ref=%'`).iterate() as Iterable<{ code: string; word: string; meaning: string }>) {
  for (const m of r.meaning.matchAll(/<a data-ref="([^"#]+)#(\d+)">([\s\S]*?)<\/a>/g)) {
    const at = m.index!
    const before = strip(r.meaning.slice(0, at)), after = strip(r.meaning.slice(at + m[0].length))
    // the names the reference may be for: the headword and the bold names of the sentence before it
    const sentence = r.meaning.slice(Math.max(0, at - 400), at).split(/\.\s/).pop() ?? ''
    const names = [r.word, ...[...sentence.matchAll(/<b>(?:<a [^>]*>)?([^<]+)/g)].map(x => x[1])]
    links.push({ dict: r.code, word: r.word, label: strip(m[3]), context: `${before.slice(-400)} [[${strip(m[3])}]] ${after.slice(0, 200)}`, key: m[1], idx: +m[2], names })
  }
}
const r = rng(+arg('--seed', '1')!)
const byDict = new Map<string, Link[]>()
for (const l of links) (byDict.get(l.dict) ?? byDict.set(l.dict, []).get(l.dict)!).push(l)
const sample: Link[] = []
for (const [, ls] of byDict) {
  const k = Math.round(N / byDict.size)
  const a = [...ls]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  sample.push(...a.slice(0, k))
}
console.log(`${links.length} links (${[...byDict].map(([d, l]) => `${d} ${l.length}`).join(', ')}), sample ${sample.length}`)

// ---------------- the cited page ----------------
const nodeOf = text.prepare('SELECT book_id FROM node WHERE key = ?').pluck()
const paras = text.prepare(`SELECT p.idx, p.text, n.key, n.title, n.para_start FROM para p JOIN node n ON n.id = p.node_id WHERE p.book_id = ? AND p.idx >= ? AND p.idx < ? ORDER BY p.idx`)
interface Span { paras: { idx: number; text: string; key: string; title: string; start: boolean }[]; b: number }

/** from the target paragraph to the one where the next PTS page begins (at most 12 paragraphs, 9000 characters) */
function span(l: Link): Span | null {
  const book = nodeOf.get(l.key) as number | undefined
  if (book === undefined) return null
  const rows = paras.all(book, l.idx, l.idx + 12) as { idx: number; text: string; key: string; title: string; para_start: number }[]
  if (!rows.length) return null
  const first = /\|P(\d+)\.(\d+)\|/.exec(rows[0].text)
  const out: Span['paras'] = []
  let size = 0
  for (const p of rows) {
    out.push({ idx: p.idx, text: clean(p.text), key: p.key, title: p.title, start: p.idx === p.para_start })
    size += p.text.length
    const pages = [...p.text.matchAll(/\|P(\d+)\.(\d+)\|/g)]
    // the next page begins here (a story reference has no page: three paragraphs)
    if (p !== rows[0] && first && pages.some(m => +m[2] > +first[2] || +m[1] !== +first[1])) break
    if (!first && out.length >= 3) break
    if (size > 9000) break
  }
  return { paras: out, b: book }
}

const foldName = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^[\d\s.()-]+/, '')
  .replace(/(suttam|sutta|jatakavannana|jatakam|jataka|apadanam|apadana|vannana|vatthu|katha)$/, '').replace(/[^a-z]/g, '')
/** strategy C: a section on the page whose title is the headword or a name of the sentence of the reference, else A */
export function byName(s: Span, names: string[]): number {
  const ns = names.map(foldName).filter(n => n.length >= 4)
  const hit = s.paras.find(p => p.start && ns.some(n => { const t = foldName(p.title); return t.length >= 4 && (t === n || (t.includes(n) && n.length >= 6) || (n.includes(t) && t.length >= 6)) }))
  return hit?.idx ?? s.paras[0].idx
}

/** strategy B: the first section that begins after the target paragraph within the span */
const firstStart = (s: Span) => s.paras.slice(1).find(p => p.start)?.idx ?? s.paras[0].idx

// ---------------- Claude ----------------
const SYSTEM = 'You check references of Pāḷi dictionaries against the Pāḷi texts (Chaṭṭha Saṅgāyana edition with PTS page numbers |Pvol.page|). You read Pāḷi well. Answer only through the JSON.'
const claude = new Claude({ system: SYSTEM, cacheDir: path.join(repo, '.cache/ref-check'), model: MODEL, dry: DRY })
const SCHEMA = {
  type: 'object', required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', required: ['id', 'verdict', 'para', 'reason'], properties: {
    id: { type: 'integer' },
    verdict: { type: 'string', enum: ['found', 'not-on-page', 'unsure'] },
    para: { type: ['integer', 'null'] },
    reason: { type: 'string' },
  } } } },
}
interface Answer { items: { id: number; verdict: 'found' | 'not-on-page' | 'unsure'; para: number | null; reason: string }[] }

/** a long paragraph: around the page beginning (the first paragraph of the span), else its beginning */
function excerpt(t: string, first: boolean): string {
  const at = first ? t.search(/\|P\d+\.\d+\|/) : -1
  const from = at > 400 ? at - 400 : 0
  const s = t.slice(from, from + 1800)
  return (from ? '… ' : '') + s + (from + 1800 < t.length ? ' …' : '')
}

function itemPrompt(i: number, l: Link, s: Span): string {
  return [`### ${i}`, `Dictionary ${l.dict}, headword "${l.word}". The reference [[${l.label}]] in context:`, l.context, 'The cited place in the text (paragraphs with their number; a section title marks where a section begins):',
    ...s.paras.map((p, k) => `${p.start ? `== ${p.title} ==\n` : ''}[${p.idx}] ${excerpt(p.text, k === 0)}`)].join('\n')
}
const prompt = (items: [number, Link, Span][]) => `For each reference: which paragraph below holds what the dictionary cites it for (the person, place, word or passage of the context)? verdict "found" with that paragraph's number (the first one, if it runs over several), "not-on-page" when it is in none of them (a wrong reference in the dictionary, or the cited thing is on a later page), "unsure" otherwise. The reference number is a PTS page (|Pvol.page| marks where a page begins), a Jātaka number, or a verse.\n\n${items.map(x => itemPrompt(...x)).join('\n\n')}`

// ---------------- run ----------------
const items: [number, Link, Span][] = []
sample.forEach((l, i) => { const s = span(l); if (s) items.push([i, l, s]) })
const batches: [number, Link, Span][][] = []
for (let i = 0; i < items.length; i += 6) batches.push(items.slice(i, i + 6))
const answers = new Map<number, Answer['items'][number]>()
await pool(batches, +arg('--jobs', '3')!, async b => {
  const a = await claude.ask<Answer>('refcheck-1', prompt(b), SCHEMA)
  for (const x of a?.items ?? []) answers.set(x.id, x)
})
if (DRY) process.exit(0)

const rows: string[] = []
const stats = new Map<string, { n: number; a: number; b: number; c: number; page: number; wrongRef: number; unsure: number }>()
for (const [i, l, s] of items) {
  const ans = answers.get(i)
  if (!ans) continue
  const st = stats.get(l.dict) ?? stats.set(l.dict, { n: 0, a: 0, b: 0, c: 0, page: 0, wrongRef: 0, unsure: 0 }).get(l.dict)!
  st.n++
  const B = firstStart(s)
  if (ans.verdict === 'found' && ans.para !== null) {
    if (ans.para === l.idx) st.a++
    if (ans.para === B) st.b++
    if (ans.para === byName(s, l.names)) st.c++
    st.page++
    if (ans.para !== l.idx) rows.push(`- ${l.dict} **${l.word}** ${l.label} → [${l.idx}] ${s.paras[0].title}: the dictionary means [${ans.para}] ${s.paras.find(p => p.idx === ans.para)?.title ?? ''} (B: [${B}]) — ${ans.reason}`)
  } else if (ans.verdict === 'not-on-page') { st.wrongRef++; rows.push(`- ${l.dict} **${l.word}** ${l.label} → not on the cited page — ${ans.reason}`) } else st.unsure++
}
const pct = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(0)}%`
const out = [`# Reference check ${new Date().toISOString()} (${MODEL}, ${items.length} links)`, '',
  'on the page = the cited thing is on the page the link opens; A = the link opens its paragraph (the paragraph where the page begins); B = the first section that begins on the page; C = a section on the page named like the headword or a bold name before the reference, else A.', '',
  '| dictionary | links | on the page | A exact | B exact | C exact | not on the page (dictionary / edition error) | unsure |', '|---|---|---|---|---|---|---|---|',
  ...[...stats].map(([d, s]) => `| ${d} | ${s.n} | ${pct(s.page, s.n)} | ${pct(s.a, s.n)} | ${pct(s.b, s.n)} | ${pct(s.c, s.n)} | ${pct(s.wrongRef, s.n)} | ${pct(s.unsure, s.n)} |`),
  '', '## Links whose target is not the cited paragraph', ...rows.sort()]
fs.writeFileSync(path.join(repo, 'db/ref-check.md'), out.join('\n') + '\n')
console.log(out.slice(0, 8 + stats.size).join('\n'))
console.log(claude.usageLine())
