/**
 * npm run names:eval [-- --sample 60] [--seed 1]
 *
 * Runs the setting extraction (build/names/settings.ts) on the built db/text.db and writes db/names-eval.md:
 * coverage per book (suttas / stories with a place, a teacher, an interlocutor, a subject), the most used places,
 * the suttas without a place, and a random sample with the source sentence for checking by hand.
 * DPD's sutta_info (.cache/dpd/dpd.db, when present) gives teacher / audience of 2k suttas: the interlocutors
 * found are compared with it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { corpusFromDb } from '../build/align/db-corpus'
import { paraPos } from '../build/links'
import { displayName, readGazetteer } from '../build/names/gazetteer'
import { extractSettings, type Setting } from '../build/names/settings'
import { plainText } from '../shared/markup'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string, def: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const sampleN = +arg('--sample', '60')
let seed = +arg('--seed', '1')
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

const { corpus: c, paranum } = corpusFromDb(path.join(repo, 'db/text.db'))
const g = readGazetteer(path.join(repo, 'data/names'))
const t0 = Date.now()
const settings = extractSettings(c, g, paranum)
console.log(`${settings.length} settings in ${Date.now() - t0} ms`)

const name = (slug: string) => { const e = g.entities.get(slug); return e ? displayName(e) + (/\d$/.test(e.lemma) ? ` (${e.lemma.replace(/^\S+ /, '')})` : '') : slug }
const unitTitle = (s: Setting) => s.title ?? c.nodes[s.node].title
const SUTTA = /sutt(?:a|aṃ|anta|antaṃ)$/

// coverage per book: mūla units are the sutta nodes, aṭṭhakathā units the ones with any setting
interface Cov { units: number; place: number; teacher: number; with: number; about: number; atta: number }
const cov = new Map<number, Cov>()
const covOf = (b: number) => cov.get(b) ?? (cov.set(b, { units: 0, place: 0, teacher: 0, with: 0, about: 0, atta: 0 }), cov.get(b)!)
const byUnit = new Map<string, Setting[]>()
for (const s of settings) {
  const k = `${s.book}:${s.start}:${s.end}`
  byUnit.set(k, [...(byUnit.get(k) ?? []), s])
}
const suttaNodes = c.nodes.filter(n => n.coll === 'mula' && n.kind !== 'group' && SUTTA.test(n.title.replace(/[\s.,;:]+$/, '').toLowerCase()))
const placed = new Set(settings.filter(s => s.role === 'place').map(s => s.node))
for (const n of suttaNodes) covOf(n.book).units++
const suttaSet = new Set(suttaNodes.map(n => `${n.book}:${n.start}`))
for (const rows of byUnit.values()) {
  const b = rows[0].book
  const cv = covOf(b)
  const sutta = suttaSet.has(`${b}:${rows[0].start}`)
  if (c.books[b].def.coll === 'mula' && !sutta && !rows.some(r => r.source === 'atta')) continue
  if (!sutta) cv.units++
  for (const r of new Set(rows.map(r => r.role))) cv[r]++
  if (rows.some(r => r.source === 'atta')) cv.atta++
}

// interlocutors vs DPD sutta_info dv_audience (by the mūla node title)
let dvChecked = 0, dvAgree = 0
const dvRows: string[][] = []
const dpdFile = path.join(repo, '.cache/dpd/dpd.db')
if (fs.existsSync(dpdFile)) {
  const dpd = new Database(dpdFile, { readonly: true })
  const GENERIC = /^(?:bhikkhus?|people|lay followers?|brahmins?|spirits|devas?|deities|ascetics|bhikkhunis?|buddha|monks|wanderers|householders?|kings?|nuns|.*\b(?:and|&)\b.*)$/i
  const info = (dpd.prepare("SELECT cst_sutta, dv_audience, dv_teacher FROM sutta_info WHERE dv_audience != '' AND cst_sutta != ''").all() as { cst_sutta: string; dv_audience: string; dv_teacher: string }[])
    .filter(r => !GENERIC.test(r.dv_audience.trim()) || !GENERIC.test(r.dv_teacher.trim()))
  const byTitle = new Map(info.map(r => [r.cst_sutta.toLowerCase().trim(), r]))
  for (const rows of byUnit.values()) {
    const w = rows.filter(r => r.role === 'with' || r.role === 'teacher')
    if (!w.length) continue
    const r = byTitle.get(c.nodes[w[0].node].title.toLowerCase().trim())
    if (!r) continue
    dvRows.push([c.nodes[w[0].node].key, `${r.dv_teacher} → ${r.dv_audience}`, w.map(x => `${x.role} ${name(x.entity)}`).join(', ')])
    dvChecked++
    const aud = (r.dv_audience + ' ' + r.dv_teacher).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (w.some(x => aud.includes(name(x.entity).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ \(.*$/, '').slice(0, 5)))) dvAgree++
  }
}

const placeCount = new Map<string, number>()
for (const s of settings) if (s.role === 'place' && s.ord === 0 && s.source !== 'atta') placeCount.set(s.entity, (placeCount.get(s.entity) ?? 0) + 1)

const sample: Setting[][] = []
const units = [...byUnit.values()]
for (let i = 0; i < sampleN && units.length; i++) sample.push(units.splice(Math.floor(rand() * units.length), 1)[0])

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const md: string[] = [
  '# Names: settings eval', '',
  `${settings.length} setting rows, ${byUnit.size} units; ${g.entities.size} names, ${g.forms.size} forms.`,
  dvChecked ? `Interlocutor/teacher found and DPD sutta_info names the same person: ${dvAgree} of ${dvChecked} (${pct(dvAgree, dvChecked)}).` : '', '',
  '## Coverage', '', '| book | units | place | teacher | with | about | from atta |', '|---|---|---|---|---|---|---|',
  ...[...cov.entries()].sort((a, b) => a[0] - b[0]).filter(([, v]) => v.units)
    .map(([b, v]) => `| ${c.books[b].def.id} ${c.books[b].def.title} | ${v.units} | ${v.place} (${pct(v.place, v.units)}) | ${v.teacher} | ${v.with} | ${v.about} | ${v.atta} |`), '',
  '## Places (units, own setting)', '',
  [...placeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([s, n]) => `${name(s)} ${n}`).join(' · '), '',
  '## DPD sutta_info (named teacher or audience) vs found', '',
  ...dvRows.slice(0, 40).map(r => `- ${r.join(' · ')}`), '',
  '## Sample', '',
  ...sample.flatMap(rows => {
    const s = rows[0]
    const ev = c.paras[paraPos(c, s.evBook, s.evIdx)]
    const roles = ['place', 'teacher', 'with', 'about'].map(r => [r, rows.filter(x => x.role === r).map(x => name(x.entity))] as const).filter(([, v]) => v.length)
    return [`- **${c.nodes[s.node].key}** ${unitTitle(s)} (${s.source}): ${roles.map(([r, v]) => `${r} ${v.join(', ')}`).join('; ')}`,
      `  > ${plainText(ev.text).slice(0, 300)}`]
  }), '',
  '## Mūla suttas without a place (first 150)', '',
  ...suttaNodes.filter(n => !placed.has(n.idx)).slice(0, 150).map(n => `- ${n.key} ${n.title}: ${plainText(c.paras[paraPos(c, n.book, n.start + (n.end - n.start > 1 ? 1 : 0))].text).slice(0, 120)}`),
]
fs.writeFileSync(path.join(repo, 'db/names-eval.md'), md.join('\n') + '\n')
console.log(`db/names-eval.md; mūla suttas with a place: ${suttaNodes.filter(n => placed.has(n.idx)).length} of ${suttaNodes.length}`)
