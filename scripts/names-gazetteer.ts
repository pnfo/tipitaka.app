/**
 * npm run names:gazetteer
 *
 * The proper-name gazetteer (dev-docs/names.md) from DPD (.cache/dpd/dpd.db, npm run build:dict fetches it) and the
 * words of the built db/text.db (npm run build:data). Writes the committed files read by the text build:
 *   data/names/entities.tsv  one row per name: slug, type, DPD headword, family set, meaning, DPPN entry, frequency in
 *                            the early texts (DPD ebt_count: decides between namesakes). Slugs are
 *                            public urls (/names/<slug>): a slug once written keeps its DPD id (its DPPN entry) when
 *                            DPD renumbers its homonyms.
 * Names DPD does not have come from the DPPN (.cache/dicts/dppn, npm run build:dict): its people, places, deities …
 * (build/names/dppn.ts: the type from the entry's first sentence, the forms from DPD's inflection templates), when
 * one of their forms occurs in the texts.
 *   data/names/forms.tsv     every word of the mūla and aṭṭhakathā texts that can be a name: form, entity slugs,
 *                            how (n name headword, c compound or title of the name: tissatthera, jetavanamahāvihāra,
 *                            d derived word: vesāliya "of Vesālī"), and the non-name DPD headwords of the same form
 *                            (ānanda "joy"), which make the form ambiguous.
 * Run it again after a DPD or an upstream update; the build itself does not need DPD.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { slug } from '../shared/normalize'
import { parseDppnEntry } from '../build/dicts/dppn'
import { stripTags } from '../build/dicts/markup'
import { classifyDppn, dppnBase, firstSentence, inflect, patternsFor, readTemplates } from '../build/names/dppn'
import type { EntityType } from '../build/names/gazetteer'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(repo, 'data/names')
const ENTITIES = path.join(OUT, 'entities.tsv')
const FORMS = path.join(OUT, 'forms.tsv')

/** DPD family sets that make a headword a name, and the entity type */
const FAMILY_TYPE: Record<string, string> = {
  'names of monks': 'person', 'names of arahants': 'person', 'names of nuns': 'person', 'great disciples': 'person',
  'chief disciples': 'person', 'names of laypeople': 'person', 'names of Brahmans': 'person', 'names of royalty': 'person',
  'names of ascetics': 'person', 'six ascetic teachers': 'person', 'names of paccekabuddhas': 'person',
  'previous Buddhas': 'person', 'previous incarnations of the Buddha': 'person',
  'names of deities': 'deity',
  'people': 'group', 'family names': 'group',
  'villages, towns and cities': 'place', 'place names': 'place', 'names of countries': 'place', 'names of rivers': 'place',
  'names of monasteries': 'place', 'names of mountains': 'place', 'holy sites': 'place', 'names of continents': 'place',
  'names of hells': 'place', 'names of heavens': 'place',
  'names of animals': 'animal',
}
/** second members of a compound that still name the first: tissa + thera is Tissa, jetavana + mahāvihāra is Jetavana */
const SAME = new Set(['thera', 'therī', 'tthera', 'bhikkhu', 'bhikkhunī', 'upāsaka', 'upāsikā', 'rāja', 'rājā', 'rājan',
  'kumāra', 'kumārī', 'devī', 'devaputta', 'devadhītā', 'brāhmaṇa', 'paribbājaka', 'nidāna', 'nagara', 'pura', 'gāma',
  'nigama', 'vihāra', 'mahāvihāra', 'ārāma', 'raṭṭha', 'janapada', 'nadī', 'pabbata', 'seṭṭhi', 'gahapati', 'yakkha',
  'nāgarāja', 'sāmaṇera', 'vatthu'])

interface Head { id: number; lemma: string; base: string; pos: string; fam: string; cons: string; word: string; meaning: string; freq: number }
interface Entity { slug: string; type: string; lemma: string; dpd: number; fam: string; meaning: string; dppn: string; freq: number }

const dpd = new Database(path.join(repo, '.cache/dpd/dpd.db'), { readonly: true })
const heads = new Map<number, Head>()
for (const r of dpd.prepare('SELECT id, lemma_1, pos, family_set, construction, family_word, meaning_1, ebt_count FROM dpd_headwords').all() as Record<string, string & number>[]) {
  heads.set(r.id, { id: r.id, lemma: r.lemma_1, base: r.lemma_1.replace(/ [\d.]+$/, ''), pos: r.pos, fam: r.family_set ?? '',
    cons: (r.construction ?? '').split('\n')[0], word: r.family_word ?? '', meaning: r.meaning_1 ?? '', freq: +(r.ebt_count ?? 0) || 0 })
}

const typeOf = (h: Head) => {
  for (const f of h.fam.split('; ')) if (FAMILY_TYPE[f]) return FAMILY_TYPE[f]
  return null
}

// existing slugs stay with their DPD id, or their DPPN entry
const refOf = (e: { dpd: number; dppn: string }) => (e.dpd ? String(e.dpd) : `dppn:${e.dppn}`)
const prevSlug = new Map<string, string>()
if (fs.existsSync(ENTITIES)) {
  for (const l of fs.readFileSync(ENTITIES, 'utf8').split('\n').slice(1)) {
    const [s, , , dpdId, , , dppnRef] = l.split('\t')
    if (s && dpdId) prevSlug.set(refOf({ dpd: +dpdId, dppn: dppnRef ?? '' }), s)
  }
}
const used = new Set(prevSlug.values())
const newSlug = (lemma: string) => {
  const s0 = slug(lemma.replace(/\./g, '-'))
  let s = s0
  for (let i = 2; used.has(s); i++) s = `${s0}-${i}`
  used.add(s)
  return s
}

const entities: Entity[] = []
const byHead = new Map<number, Entity>()
const byBase = new Map<string, Entity[]>()
const addEntity = (h: Head, type: string) => {
  const e: Entity = { slug: prevSlug.get(String(h.id)) ?? '', type, lemma: h.lemma, dpd: h.id, fam: h.fam, meaning: h.meaning, dppn: '', freq: h.freq }
  entities.push(e)
  byHead.set(h.id, e)
  byBase.set(h.base, [...(byBase.get(h.base) ?? []), e])
}
// DPD has some elders twice: ānanda 2 and ānandatthera "Ānanda the elder". A name of the form X + thera / therī is
// X when exactly one person X fits the title (tissatthera stays: several Tissas are monks)
const ELDER: Record<string, RegExp> = { thera: /monks|arahants|great disciples/, therī: /nuns/ }
const isElder = (h: Head) => { const p = h.cons.split(' + '); return p.length === 2 && !!ELDER[p[1].trim()] }
for (const h of heads.values()) {
  const t = typeOf(h)
  if (t && !isElder(h)) addEntity(h, t)
}
const elderOf = new Map<number, Entity>()
for (const h of heads.values()) {
  const t = typeOf(h)
  if (!t || !isElder(h)) continue
  const [x, title] = h.cons.split(' + ').map(p => p.trim())
  const fits = (byBase.get(x) ?? []).filter(e => ELDER[title].test(e.fam))
  if (fits.length === 1) elderOf.set(h.id, fits[0])
  else addEntity(h, t)
}
// the words of the mūla and aṭṭhakathā books
const text = new Database(path.join(repo, 'db/text.db'), { readonly: true })
const words = text.prepare(`SELECT DISTINCT t.w FROM token t JOIN posting p ON p.token_id = t.id JOIN book b ON b.id = p.book_id
  WHERE b.coll IN ('mula', 'atta')`).pluck().all() as string[]
const corpus = new Set(words)

// DPPN names DPD does not have (a name of the same spelling and kind in DPD covers all DPPN homonyms of it)
const templates = readTemplates(dpd.prepare('SELECT pattern, data FROM inflection_templates').all() as { pattern: string; data: string }[])
const raw = JSON.parse(fs.readFileSync(path.join(repo, '.cache/dicts/dppn/DPPN.json'), 'utf8')) as { name: string; entry?: string }[]
const being = (t: string) => (t === 'deity' ? 'person' : t)
const seeAlias = new Map<string, string[]>() // "Akitti: see Akatti"
const dppnNames: { word: string; hom: number; base: string; aliases: string[]; type: EntityType; noun: string; sentence: string }[] = []
for (const x of raw) {
  const p = parseDppnEntry(x)
  if (!p) continue
  const sentence = firstSentence(stripTags(p.body))
  const see = /^see\s+([^.;,(]+)/i.exec(sentence)
  if (see) {
    const target = dppnBase(see[1].trim().toLowerCase())
    seeAlias.set(target, [...(seeAlias.get(target) ?? []), dppnBase(p.word)])
    continue
  }
  const c = classifyDppn(p.word, sentence)
  if (c.type === 'other') continue
  dppnNames.push({ word: p.word, hom: p.hom, base: dppnBase(p.word), aliases: p.aliases.map(dppnBase), type: c.type, noun: c.noun, sentence })
}
const dppnForms = new Map<string, Entity[]>()
const refSeen = new Map<string, number>()
// DPD headwords that are no names, by their lemma: a DPPN name of the same spelling is a common word too
const commonLemma = new Map<string, string>()
for (const h of heads.values()) if (!typeOf(h) && !commonLemma.has(h.base)) commonLemma.set(h.base, h.lemma)
const commonBase = new Map<string, string>()
let dppnCovered = 0
for (const d of dppnNames) {
  if ((byBase.get(d.base) ?? []).some(e => being(e.type) === being(d.type))) { dppnCovered++; continue }
  const forms = new Set<string>()
  for (const b of new Set([d.base, ...d.aliases, ...(seeAlias.get(d.base) ?? [])])) {
    for (const f of inflect(b, patternsFor(b, d.type), templates)) if (corpus.has(f)) forms.add(f)
  }
  if (!forms.size) continue
  // (a few headwords are in the DPPN twice without a homonym number: Amaragiri the place and the person)
  const ref0 = `${d.word}#${d.hom}`
  const n = (refSeen.get(ref0) ?? 0) + 1
  refSeen.set(ref0, n)
  const ref = n > 1 ? `${ref0}~${n}` : ref0
  const common = commonLemma.get(d.base)
  const e: Entity = { slug: prevSlug.get(`dppn:${ref}`) ?? '', type: d.type, lemma: d.hom ? `${d.word} ${d.hom}` : d.word, dpd: 0,
    fam: `DPPN: ${d.noun}`, meaning: d.sentence, dppn: ref, freq: 0 }
  entities.push(e)
  byBase.set(d.base, [...(byBase.get(d.base) ?? []), e])
  for (const f of forms) dppnForms.set(f, [...(dppnForms.get(f) ?? []), e])
  if (common) commonBase.set(e.slug, common)
}

// assign new slugs after the kept ones, in DPD order, then the DPPN ones
for (const e of entities.sort((a, b) => (a.dpd || 1e9) - (b.dpd || 1e9) || a.dppn.localeCompare(b.dppn))) if (!e.slug) e.slug = newSlug(e.lemma)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** how a non-name headword refers to names: compounds with a title or place word, and derived words */
const derived = new Map<number, { es: Entity[]; how: 'c' | 'd' }>()
for (const h of heads.values()) {
  if (byHead.has(h.id)) continue
  const parts = h.cons.split(' + ').map(p => p.trim())
  // rāja + kumārī "princess" is no name: the compound's meaning is empty or names the person
  const named = !h.meaning || h.meaning.startsWith('name of') || h.meaning.includes(cap(parts[0]))
  if (parts.length === 2 && SAME.has(parts[1]) && byBase.has(parts[0]) && named) derived.set(h.id, { es: byBase.get(parts[0])!, how: 'c' })
  else if (h.word && byBase.has(h.word) && (h.pos === 'adj' || parts[0] === h.word)) derived.set(h.id, { es: byBase.get(h.word)!, how: 'd' })
}

const lookup = dpd.prepare('SELECT headwords FROM lookup WHERE lookup_key = ?').pluck()

/** compound stem of a name: final long vowel shortened (uppalavaṇṇā -> uppalavaṇṇa-, udāyī -> udāyi-) */
const stem = (b: string) => b.replace(/ā$/, 'a').replace(/ī$/, 'i').replace(/ū$/, 'u')
const byStem = new Map<string, Entity[]>()
for (const [b, es] of byBase) {
  const persons = es.filter(e => e.type === 'person' || e.type === 'deity')
  // (DPPN people: their DPPN noun as family, "DPPN: thera")
  if (persons.length) byStem.set(stem(b), [...(byStem.get(stem(b)) ?? []), ...persons])
}
// soreyyattheraṃ, uppalavaṇṇattheriṃ, ānandaseṭṭhiṃ, chattapāṇiupāsakaṃ: a name stem + a title, not in DPD
// soreyyattheraṃ, uppalavaṇṇattheriṃ, ānandaseṭṭhiṃ, chattapāṇiupāsakaṃ: a name stem + a title, not in DPD. Only the
// homonyms the title fits (ānandaseṭṭhi is no monk)
const TITLES: [RegExp, RegExp][] = [
  [/^(.+?)t?ther(?:a|ā|aṃ|assa|ena|o|e|ānaṃ|ehi)$/, /monks|arahants|great disciples/],
  [/^(.+?)t?ther(?:i|ī|iṃ|iyā|iyo)$/, /nuns/],
  [/^(.+?)(?:seṭṭh(?:i|iṃ|issa|inā|ī)|upāsak(?:a|aṃ|assa|ena|o|ā)|upāsik(?:a|ā|aṃ|āya)|kuṭṭh(?:i|iṃ|issa|inā))$/, /laypeople/],
  [/^(.+?)bhikkhu(?:ṃ|no|nā)?$/, /monks/],
  [/^(.+?)(?:bhikkhun(?:ī|iṃ|iyā))$/, /nuns/],
  [/^(.+?)kumārik(?:a|ā|aṃ|āya)$/, /royalty|laypeople/],
]
// the DPPN nouns of the titles' families
const DPPN_FAM: [RegExp, RegExp][] = [[TITLES[0][1], /thera|monk|arahant|elder|bhikkhu|novice/], [TITLES[1][1], /therī|nun|bhikkhunī/],
  [TITLES[2][1], /householder|seṭṭhi|merchant|lay|banker|millionaire|leper|man|woman/], [TITLES[3][1], /monk|thera|bhikkhu/],
  [TITLES[4][1], /nun|therī/], [TITLES[5][1], /princess|daughter|girl/]]
const titled = (w: string): Entity[] => {
  for (const [re, fam] of TITLES) {
    const m = re.exec(w)
    if (m && m[1].length >= 3) return (byStem.get(m[1]) ?? []).filter(e => fam.test(e.fam) || (e.dpd === 0 && DPPN_FAM.some(([f, n]) => f === fam && n.test(e.fam))))
  }
  return []
}

const rows: string[] = []
const stats = { n: 0, c: 0, d: 0, ambiguous: 0 }
for (const w of words.sort()) {
  const hw = lookup.get(w) as string | undefined
  const ids = hw ? JSON.parse(hw) as number[] : []
  const es = new Map<string, string>()
  const other: string[] = []
  for (const id of ids) {
    const e = byHead.get(id)
    if (e) { es.set(e.slug, 'n'); continue }
    const elder = elderOf.get(id)
    if (elder) { if (!es.has(elder.slug)) es.set(elder.slug, 'c'); continue }
    const d = derived.get(id)
    if (d) { for (const x of d.es) if (!es.has(x.slug)) es.set(x.slug, d.how); continue }
    const h = heads.get(id)
    if (h) other.push(h.lemma)
  }
  for (const e of dppnForms.get(w) ?? []) {
    if (!es.has(e.slug)) es.set(e.slug, 'n')
    // a DPPN name that is a common word (Loka, Jarā, Sumana): all its forms are ambiguous
    const word = commonBase.get(e.slug)
    if (word && !other.length) other.push(word)
  }
  if (!es.size) for (const e of titled(w)) es.set(e.slug, 'c')
  if (!es.size) continue
  const how = [...es.values()].sort()[0] // n before c before d
  stats[how as 'n' | 'c' | 'd']++
  if (other.length) stats.ambiguous++
  rows.push([w, [...es.keys()].join(','), how, [...new Set(other)].join(',')].join('\t'))
}

fs.mkdirSync(OUT, { recursive: true })
const clean = (s: string) => s.replace(/[\t\n]+/g, ' ')
fs.writeFileSync(ENTITIES, ['slug\ttype\tlemma\tdpd\tfamily\tmeaning\tdppn\tfreq',
  ...entities.sort((a, b) => a.slug.localeCompare(b.slug)).map(e => [e.slug, e.type, e.lemma, e.dpd, clean(e.fam), clean(e.meaning), e.dppn, e.freq].join('\t'))].join('\n') + '\n')
fs.writeFileSync(FORMS, ['form\tentities\thow\tnot_names', ...rows].join('\n') + '\n')
const types = entities.reduce<Record<string, number>>((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {})
console.log(`DPPN: ${dppnNames.length} names, ${dppnCovered} in DPD, ${entities.filter(e => !e.dpd).length} added`)
console.log(`${entities.length} names ${JSON.stringify(types)}; ${rows.length} forms of ${words.length} words ${JSON.stringify(stats)}`)
