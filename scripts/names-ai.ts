/**
 * AI help for the mentions of names (dev-docs/names.md), run with Claude Code on the plan usage:
 *
 *   npm run names:ai -- forms [--limit 400] [--min 1]
 *       one verdict per word form that is a name and a common word (ānando, sakko, uttaro): name (the name nearly
 *       always), word (nearly never a name), context (both) -> data/names/form-verdicts.tsv
 *   npm run names:ai -- mentions [--books s0101m,s0502a] [--limit 100]
 *       the occurrences of the context forms, one by one: which name (or none) -> data/names/decisions/<book>.jsonl
 *   npm run names:ai -- check [--n 300] [--seed 1]
 *       spot check of the mentions the build accepts (by source): precision -> db/names-check.md
 *   common: --jobs 5 (parallel calls) --model sonnet --dry (print the first prompt, no calls)
 *
 * Needs db/text.db (npm run build:data), data/names (npm run names:gazetteer), .cache/dpd/dpd.db (the meanings of the
 * common words) and the claude CLI (scripts/lib/claude.ts). Calls are cached in .cache/names/ai/, so a run can be
 * stopped and resumed. Manual verdicts / decisions (src manual) are never overwritten.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { Claude, pool } from './lib/claude'
import { corpusFromDb } from '../build/align/db-corpus'
import { NodeTexts, makeSelector } from '../build/align/decisions'
import { paraPos } from '../build/links'
import { displayName, readGazetteer, type Entity } from '../build/names/gazetteer'
import { extractMentions, occurrences, readMentionDecisions, readVerdicts, type MentionDecision, type Occurrence, type Verdict } from '../build/names/mentions'
import { plainText } from '../shared/markup'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const cmd = args[0]
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const DATA = path.join(repo, 'data/names')
const VERDICTS = path.join(DATA, 'form-verdicts.tsv')
const JOBS = +arg('--jobs', '5')!
const DRY = args.includes('--dry')

const SYSTEM = `You are an expert in Pāḷi and the Theravāda canon and commentaries. You decide whether words of the texts are proper names (of people, deities, places, peoples) or common words. Answer only through the requested JSON. Be precise and conservative: a word is a name only when the text uses it as a name.`
const claude = new Claude({ system: SYSTEM, cacheDir: path.join(repo, '.cache/names/ai'), model: arg('--model', 'sonnet')!, dry: DRY, versions: { forms: 1, mentions: 1, check: 1 } })

const { corpus: c } = corpusFromDb(path.join(repo, 'db/text.db'))
const g = readGazetteer(DATA)
const dpd = new Database(path.join(repo, '.cache/dpd/dpd.db'), { readonly: true })
const meaningOf = dpd.prepare('SELECT meaning_1 FROM dpd_headwords WHERE lemma_1 = ?').pluck()
const sense = (lemma: string) => `${lemma.replace(/ [\d.]+$/, '')}: ${String(meaningOf.get(lemma) ?? '').slice(0, 70) || '?'}`
const candidate = (e: Entity) => `${e.slug} = ${displayName(e)} (${e.type}): ${e.meaning.slice(0, 90)}`

/** the paragraph text around a word, the word marked ⟦ ⟧ */
function context(o: { book: number; idx: number; s: number; e: number }, width = 110): string {
  const t = c.paras[paraPos(c, o.book, o.idx)].text
  const before = plainText(t.slice(0, o.s)), after = plainText(t.slice(o.e))
  return `…${before.slice(-width)} ⟦${plainText(t.slice(o.s, o.e))}⟧ ${after.slice(0, width)}…`.replace(/\s+/g, ' ')
}
const where = (o: { book: number }) => c.books[o.book].def.title

// ---------------- forms ----------------
async function forms() {
  const have = readVerdicts(DATA)
  const manual = new Set<string>()
  const lines = fs.existsSync(VERDICTS) ? fs.readFileSync(VERDICTS, 'utf8').split('\n').slice(1).filter(Boolean) : []
  for (const l of lines) { const [f, , src] = l.split('\t'); if (src === 'manual') manual.add(f) }
  const occ = new Map<string, Occurrence[]>()
  for (const o of occurrences(c, g)) if (o.f.notNames.length) occ.set(o.form, [...(occ.get(o.form) ?? []), o])
  const min = +arg('--min', '1')!
  const todo = [...occ.entries()].filter(([f, os]) => !have.has(f) && os.length >= min).sort((a, b) => b[1].length - a[1].length)
    .slice(0, +arg('--limit', '100000')!)
  console.log(`${occ.size} ambiguous forms, ${have.size} with a verdict, asking ${todo.length}`)
  const batches: (typeof todo)[] = []
  for (let i = 0; i < todo.length; i += 40) batches.push(todo.slice(i, i + 40))
  const schema = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: {
    form: { type: 'string' }, verdict: { type: 'string', enum: ['name', 'word', 'context'] } }, required: ['form', 'verdict'] } } }, required: ['verdicts'] }
  const out = new Map<string, { v: Verdict; n: number }>()
  await pool(batches, JOBS, async batch => {
    const items = batch.map(([form, os]) => {
      const f = os[0].f
      const names = [...new Map(f.entities.map(e => [`${displayName(e)}|${e.type}`, e])).values()].slice(0, 4)
      // up to 4 contexts spread over the occurrences (books differ)
      const picks = os.length <= 4 ? os : [0.1, 0.4, 0.7, 0.95].map(x => os[Math.floor(x * os.length)])
      return `### ${form} (${os.length} occurrences)\nas a name: ${names.map(e => `${displayName(e)} (${e.type}: ${e.meaning.slice(0, 60)})`).join('; ')}\n` +
        `as a common word: ${f.notNames.slice(0, 4).map(sense).join('; ')}\n` + picks.map(o => `- [${where(o)}] ${context(o, 60)}`).join('\n')
    })
    const prompt = `Each Pāḷi word form below is the form of a proper name and also of a common word. For each form, judge from the sample contexts (the word is marked ⟦ ⟧) and your knowledge of the texts how the form is used across the canon and commentaries:
- name: (nearly) always the proper name in these texts
- word: (nearly) always the common word, the name being rare or never meant
- context: both uses are common; each occurrence must be judged
Answer every form.\n\n${items.join('\n\n')}`
    const r = await claude.ask<{ verdicts: { form: string; verdict: Verdict }[] }>('forms', prompt, schema)
    for (const v of r?.verdicts ?? []) {
      const b = batch.find(([f]) => f === v.form)
      if (b) out.set(v.form, { v: v.verdict, n: b[1].length })
    }
  })
  if (DRY) return
  const kept = lines.filter(l => manual.has(l.split('\t')[0]) || !out.has(l.split('\t')[0]))
  const rows = [...kept, ...[...out].filter(([f]) => !manual.has(f)).map(([f, x]) => `${f}\t${x.v}\tai\t${x.n}`)]
    .sort((a, b) => a.localeCompare(b))
  fs.writeFileSync(VERDICTS, ['form\tverdict\tsrc\toccurrences', ...rows].join('\n') + '\n')
  const count = (v: Verdict) => [...out.values()].filter(x => x.v === v).length
  console.log(`${out.size} verdicts: name ${count('name')}, word ${count('word')}, context ${count('context')} -> data/names/form-verdicts.tsv`)
  console.log(claude.usageLine())
}

// ---------------- mentions ----------------
async function mentions() {
  const books = arg('--books')?.split(',')
  const r = extractMentions(c, g, readVerdicts(DATA), readMentionDecisions(DATA))
  const todo = r.pending.filter(o => !books || books.some(b => c.books[o.book].def.id.startsWith(b))).slice(0, +arg('--limit', '1000000')! * 25)
  console.log(`${r.pending.length} occurrences to decide, asking ${todo.length} (${Math.ceil(todo.length / 25)} calls)`)
  const batches: Occurrence[][] = []
  for (let i = 0; i < todo.length; i += 25) batches.push(todo.slice(i, i + 25))
  const nt = new NodeTexts(c)
  const byBook = new Map<number, MentionDecision[]>()
  const schema = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'integer' }, name: { type: 'string', description: 'the id of the name (before =), or none' }, sure: { type: 'boolean' } },
  required: ['id', 'name', 'sure'] } } }, required: ['answers'] }
  await pool(batches, JOBS, async batch => {
    const items = batch.map((o, i) => `${i + 1}. [${where(o)}] ${context(o)}\n   names: ${o.f.entities.slice(0, 6).map(candidate).join(' | ')}\n   common word: ${o.f.notNames.slice(0, 3).map(sense).join('; ')}`)
    const prompt = `For each numbered passage, is the marked word ⟦ ⟧ the proper name, and which one? Answer with the name's id (the text before =) or "none" when it is the common word. Choose among the given names only; when it is a name but none of them fits, answer none. sure: false when the passage does not decide.\n\n${items.join('\n\n')}`
    const res = await claude.ask<{ answers: { id: number; name: string; sure: boolean }[] }>('mentions', prompt, schema)
    for (const a of res?.answers ?? []) {
      const o = batch[a.id - 1]
      if (!o) continue
      const e = a.name === 'none' ? null : o.f.entities.find(x => x.slug === a.name)
      if (e === undefined) continue
      const key = c.nodes[c.paras[paraPos(c, o.book, o.idx)].node].key
      const sel = makeSelector(nt, key, o.idx, o.s, o.e)
      if (!sel) continue
      byBook.set(o.book, [...(byBook.get(o.book) ?? []), { c: sel, e: e?.slug ?? null, conf: a.sure ? 0.9 : 0.6, src: 'ai' }])
    }
  })
  if (DRY) return
  const dir = path.join(DATA, 'decisions')
  fs.mkdirSync(dir, { recursive: true })
  for (const [b, ds] of byBook) {
    const file = path.join(dir, `${c.books[b].def.id.replace(/\.[a-z]+$/, '')}.jsonl`)
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
    fs.writeFileSync(file, [...old, ...ds.map(d => JSON.stringify(d))].join('\n') + '\n')
  }
  const all = [...byBook.values()].flat()
  console.log(`${all.length} decisions: ${all.filter(d => d.e).length} names, ${all.filter(d => !d.e).length} none -> data/names/decisions/`)
  console.log(claude.usageLine())
}

// ---------------- check ----------------
async function check() {
  const r = extractMentions(c, g, readVerdicts(DATA), readMentionDecisions(DATA))
  let seed = +arg('--seed', '1')!
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const n = +arg('--n', '300')!
  // stratified by source: precision per source, weighted by its share
  const bySrc = new Map<string, typeof r.mentions>()
  for (const m of r.mentions) bySrc.set(m.src, [...(bySrc.get(m.src) ?? []), m])
  const sample: (typeof r.mentions[number])[] = []
  for (const ms of bySrc.values()) for (let i = 0; i < Math.ceil(n / bySrc.size) && ms.length; i++) sample.push(ms[Math.floor(rand() * ms.length)])
  const batches: (typeof sample)[] = []
  for (let i = 0; i < sample.length; i += 25) batches.push(sample.slice(i, i + 25))
  const schema = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'integer' }, isName: { type: 'boolean' }, rightName: { type: 'boolean', description: 'the given name is the one meant (or a namesake of it)' } },
  required: ['id', 'isName', 'rightName'] } } }, required: ['answers'] }
  const results: { m: typeof sample[number]; isName: boolean; right: boolean }[] = []
  await pool(batches, JOBS, async batch => {
    const items = batch.map((m, i) => `${i + 1}. [${where(m)}] ${context(m)}\n   taken as: ${candidate(g.entities.get(m.entity)!)}`)
    const prompt = `Check each numbered passage: is the marked word ⟦ ⟧ a proper name here (isName), and is it the given name or a namesake of the same spelling (rightName)?\n\n${items.join('\n\n')}`
    const res = await claude.ask<{ answers: { id: number; isName: boolean; rightName: boolean }[] }>('check', prompt, schema)
    for (const a of res?.answers ?? []) if (batch[a.id - 1]) results.push({ m: batch[a.id - 1], isName: a.isName, right: a.isName && a.rightName })
  })
  if (DRY) return
  const total = r.mentions.length
  const lines = ['# Names: mention spot check', '', `${results.length} checked of ${total} mentions (AI judge: ${arg('--model', 'sonnet')}).`, '',
    '| source | mentions | checked | a name | right name |', '|---|---|---|---|---|']
  let wName = 0, wRight = 0
  for (const [src, ms] of bySrc) {
    const rs = results.filter(x => x.m.src === src)
    const pn = rs.filter(x => x.isName).length / Math.max(1, rs.length), pr = rs.filter(x => x.right).length / Math.max(1, rs.length)
    wName += pn * ms.length / total; wRight += pr * ms.length / total
    lines.push(`| ${src} | ${ms.length} | ${rs.length} | ${Math.round(pn * 100)}% | ${Math.round(pr * 100)}% |`)
  }
  lines.push('', `Weighted: a name ${Math.round(wName * 100)}%, the right name ${Math.round(wRight * 100)}%.`, '', '## Errors', '')
  for (const x of results.filter(x => !x.right)) lines.push(`- (${x.m.src}${x.isName ? ', other name' : ', no name'}) ${x.m.entity}: ${context(x.m, 80)}`)
  fs.writeFileSync(path.join(repo, 'db/names-check.md'), lines.join('\n') + '\n')
  console.log(lines.slice(4, 6 + bySrc.size).join('\n'))
  console.log(claude.usageLine())
}

if (cmd === 'forms') await forms()
else if (cmd === 'mentions') await mentions()
else if (cmd === 'check') await check()
else console.log('npm run names:ai -- forms | mentions | check (see scripts/names-ai.ts)')
