/**
 * DPD names that are one name twice: headwords of variant spellings (nālandā / nāḷandā, mahāmoggalāna / mahāmoggallāna,
 * payāga 1 / payāgā 1). The candidates are the pairs of names of the same type that DPD lists as variants of each other
 * (variant, var_phonetic, var_text); Gemini decides each from both meanings and the DPPN entries linked to them (the
 * variant fields also list related names: aññatarā tissā "another Tissā" is no Tissā):
 *
 *   npm run names:same [--limit 40] [--model gemini-4-argon] [--dry]
 *
 * -> data/names/same.tsv: dpd, same_as (DPD ids), lemmas, verdict same | different | unsure, src ai | manual (kept). The
 * gazetteer (npm run names:gazetteer) makes a name of the ones judged the same: the one with the most uses keeps them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { pool } from './lib/claude'
import { Gemini } from './lib/gemini'
import { parseDppnEntry } from '../build/dicts/dppn'
import { stripTags } from '../build/dicts/markup'
import { readDppnEntries, readDppnLinks, DPPN_LINKS } from '../build/names/dppn'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const DATA = path.join(repo, 'data/names')
const SAME = path.join(DATA, 'same.tsv')

// the DPD names (data/names/entities.tsv: slug type lemma dpd family meaning dppn freq …)
const rows = fs.readFileSync(path.join(DATA, 'entities.tsv'), 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'))
const names = new Map(rows.filter(r => r[3] !== '0').map(r => [+r[3], { slug: r[0], type: r[1], lemma: r[2], family: r[4], meaning: r[5] }]))
const dpd = new Database(path.join(repo, '.cache/dpd/dpd.db'), { readonly: true })
const base = (l: string) => l.replace(/\s+[\d.]+$/, '')
const core = (m: string) => m.toLowerCase().replace(/\(.*?\)|;.*$|modern day.*|,.*$/g, '').replace(/[ .]+$/, '').trim()
const byBase = new Map<string, number[]>()
for (const [id, n] of names) byBase.set(base(n.lemma), [...(byBase.get(base(n.lemma)) ?? []), id])

// the DPPN texts linked to each DPD name
const { entries } = readDppnEntries(JSON.parse(fs.readFileSync(path.join(repo, '.cache/dicts/dppn/DPPN.json'), 'utf8')), parseDppnEntry, stripTags)
const body = new Map(entries.map(e => [e.ref, e.body]))
const dppnOf = new Map<number, string[]>()
for (const [ref, l] of readDppnLinks(fs.readFileSync(path.join(DATA, DPPN_LINKS), 'utf8'))) {
  if (l.dpd && body.has(ref)) dppnOf.set(l.dpd, [...(dppnOf.get(l.dpd) ?? []), body.get(ref)!.slice(0, 350)])
}

// candidate pairs: of one type, one listed as a variant of the other (several homonyms of the variant: the one of the same meaning)
const pairs = new Map<string, [number, number]>()
const q = dpd.prepare('SELECT variant, var_phonetic, var_text, meaning_1 FROM dpd_headwords WHERE id = ?')
for (const [id, n] of names) {
  const h = q.get(id) as { variant: string; var_phonetic: string; var_text: string; meaning_1: string } | undefined
  if (!h) continue
  const vars = new Set([h.variant, h.var_phonetic, h.var_text].flatMap(f => (f ?? '').split(/[,;]/)).map(s => s.trim()).filter(Boolean))
  for (const v of vars) {
    let cands = (byBase.get(base(v)) ?? []).filter(j => j !== id && names.get(j)!.type === n.type)
    if (cands.length > 1) cands = cands.filter(j => core(names.get(j)!.meaning) === core(n.meaning))
    for (const j of cands) pairs.set([id, j].sort((a, b) => a - b).join(':'), [Math.min(id, j), Math.max(id, j)])
  }
}

const have = new Map<string, string[]>()
if (fs.existsSync(SAME)) for (const l of fs.readFileSync(SAME, 'utf8').split('\n').slice(1).filter(Boolean)) { const p = l.split('\t'); have.set(`${p[0]}:${p[1]}`, p) }
const todo = [...pairs.values()].filter(([a, b]) => !have.has(`${a}:${b}`)).slice(0, +arg('--limit', '100000')!)
console.log(`${pairs.size} candidate pairs, ${have.size} decided, asking ${todo.length}`)

const SYSTEM = `You are an expert in Pāḷi, the Theravāda canon and commentaries, the Digital Pāḷi Dictionary (DPD) and the
Dictionary of Pāli Proper Names (DPPN). DPD sometimes has one name twice, as two headwords of variant spellings (Nālandā /
Nāḷandā, Mahāmoggalāna / Mahāmoggallāna). For each pair decide: "same" (the same person, being, place or people, only spelled
differently), "different" (two different ones that share or nearly share a name: another nun called Tissā, a different
Kakudha), or "unsure" (too little to tell). Answer only through the requested JSON.`
const gemini = new Gemini({ system: SYSTEM, cacheDir: path.join(repo, '.cache/names/ai'), model: arg('--model', 'gemini-4-argon')!, price: [2, 10] })
const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  i: { type: 'integer' }, verdict: { type: 'string', enum: ['same', 'different', 'unsure'] } }, required: ['i', 'verdict'] } } }, required: ['items'] }
const show = (id: number) => {
  const n = names.get(id)!
  const d = dppnOf.get(id)
  return `${n.lemma} (${n.type}; ${n.family}): ${n.meaning}${d ? `\n     DPPN: ${d.join(' | ')}` : ''}`
}
if (args.includes('--dry')) { console.log(todo.slice(0, 5).map(([a, b], k) => `${k + 1}. A: ${show(a)}\n   B: ${show(b)}`).join('\n')); process.exit(0) }

const batches: (typeof todo)[] = []
for (let i = 0; i < todo.length; i += 15) batches.push(todo.slice(i, i + 15))
await pool(batches, 4, async b => {
  const prompt = `Is A the same as B? One verdict per numbered pair.\n\n${b.map(([a, c], k) => `${k + 1}. A: ${show(a)}\n   B: ${show(c)}`).join('\n')}`
  const r = await gemini.ask<{ items: { i: number; verdict: string }[] }>('same', prompt, schema)
  for (const x of r?.items ?? []) {
    const p = b[x.i - 1]
    if (p) have.set(`${p[0]}:${p[1]}`, [String(p[0]), String(p[1]), names.get(p[0])!.lemma, names.get(p[1])!.lemma, x.verdict, 'ai'])
  }
})
fs.writeFileSync(SAME, ['dpd\tsame_as\tlemma\tlemma2\tverdict\tsrc', ...[...have.values()].sort((a, b) => +a[0] - +b[0] || +a[1] - +b[1]).map(p => p.join('\t'))].join('\n') + '\n')
const n = (v: string) => [...have.values()].filter(p => p[4] === v).length
console.log(`${SAME}: ${have.size} pairs, ${n('same')} same, ${n('different')} different, ${n('unsure')} unsure`)
console.log(gemini.usageLine())
