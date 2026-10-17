/** The committed name gazetteer (data/names/*.tsv, written by npm run names:gazetteer, see dev-docs/names.md). */
import fs from 'node:fs'
import path from 'node:path'

export type EntityType = 'person' | 'deity' | 'group' | 'place' | 'animal'

export interface Entity {
  slug: string
  type: EntityType
  /** DPD lemma_1 (with the homonym number) */
  lemma: string
  dpd: number
  family: string
  meaning: string
  /** the DPPN entry of a name DPD does not have ("word#hom"; dpd is 0) */
  dppn?: string
  /** DPD's count in the early texts: the prominence of a namesake */
  freq: number
  /** places: coordinates (data/names/geo.tsv) */
  lat?: number
  lon?: number
  /** 1 located, 2 probable, 3 approximate, 4 in or near the place its meaning names */
  prec?: number
}

/** how a form refers to its entities: n the name itself, c a compound or title (tissatthera), d derived (vesāliya) */
export type FormHow = 'n' | 'c' | 'd'
export interface Form { entities: Entity[]; how: FormHow; notNames: string[] }

export interface Gazetteer {
  entities: Map<string, Entity>
  forms: Map<string, Form>
}

const rows = (file: string) => fs.readFileSync(file, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'))

export function readGazetteer(dir: string): Gazetteer {
  const entities = new Map<string, Entity>()
  const forms = new Map<string, Form>()
  if (!fs.existsSync(path.join(dir, 'entities.tsv'))) return { entities, forms }
  for (const [slug, type, lemma, dpd, family, meaning, dppn, freq] of rows(path.join(dir, 'entities.tsv'))) {
    entities.set(slug, { slug, type: type as EntityType, lemma, dpd: +dpd, family, meaning: meaning ?? '', ...(dppn ? { dppn } : {}), freq: +freq || 0 })
  }
  // place coordinates (npm run names:geo): slug, lat, lon, prec, source
  if (fs.existsSync(path.join(dir, 'geo.tsv'))) {
    for (const [slug, lat, lon, prec] of rows(path.join(dir, 'geo.tsv'))) {
      const e = entities.get(slug)
      if (e && lat && lon) { e.lat = +lat; e.lon = +lon; e.prec = +prec || 3 }
    }
  }
  for (const [form, es, how, notNames] of rows(path.join(dir, 'forms.tsv'))) {
    const list = es.split(',').map(s => entities.get(s)).filter((e): e is Entity => !!e)
    if (list.length) forms.set(form, { entities: list, how: how as FormHow, notNames: notNames ? notNames.split(',') : [] })
  }
  return { entities, forms }
}

/** DPD lemma without the homonym number, capitalised as in the meanings ("name of a monastery in Sāvatthī") */
export const displayName = (e: Entity) => e.lemma.replace(/ [\d.]+$/, '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const RANK = ['chief disciples', 'great disciples', 'names of arahants', 'villages, towns and cities', 'names of countries']
const rank = (e: Entity) => {
  const i = RANK.findIndex(r => e.family.includes(r))
  return i < 0 ? RANK.length : i
}

/** a word next to a name and the DPD family sets (or DPPN nouns) it goes with: Suppiyo paribbājako, Brahmadatte
 * rajjaṃ kārente, Kassapassa bhagavato */
const TITLE_FAMILY: [RegExp, RegExp][] = [
  [/^paribbājak|^nigaṇṭh|^ājīvak|^acel/, /ascetics|wanderer|paribbājaka|ascetic|nigaṇṭha|ājīvaka/],
  [/^māṇav|^brāhmaṇ/, /Brahmans|brahmin|brahman/],
  [/^devaputt|^devat|^devarāj|^devānamind|^yakkh|^asurind|^nāgarāj|^brahm/, /deities|deva|yakkha|nāga|deity|god/],
  [/^t?ther[aāo]|^t?theraṃ|^bhikkhu$|^bhikkhuṃ|^sāmaṇer/, /monks|arahants|thera|monk|arahant|elder/],
  [/^t?ther[iī]|^bhikkhun/, /nuns|therī|nun/],
  [/^rāj|^rañ|^kumār|^devī|^rajj|^kārent|^mahārāj/, /royalty|king|queen|prince|princess/],
  [/^gahapat|^upāsak|^upāsik|^seṭṭh/, /laypeople|householder|seṭṭhi|lay|merchant/],
  // "kassapassa bhagavato": a previous Buddha (not "ānanda, tathāgato …": the genitive only)
  [/^(?:bhagavato|sammāsambuddhassa|buddhassa)$/, /previous Buddhas/],
  [/^āyasm/, /monks|arahants|nuns|great disciples|chief disciples|thera|therī|monk|nun|arahant|elder/],
]
const familyOf = (hints: string[]) => TITLE_FAMILY.find(([t]) => hints.some(h => t.test(h)))?.[1]

/**
 * The candidates of a name form, best first: of the allowed types, the homonym that fits the words next to it
 * (hints: the word before and after), whose DPD meaning names one of the other names around it (mahāvana "a forest
 * outside Vesālī" next to vesāliyaṃ), else the most prominent one. sure: the choice did not rest on prominence alone.
 */
export function rankEntities(f: Form, types: EntityType[], context: Entity[] = [], hints: string[] = []): { best: Entity | null; sure: boolean } {
  const cands = f.entities.filter(e => types.includes(e.type))
  if (cands.length <= 1) return { best: cands[0] ?? null, sure: true }
  const near = context.map(displayName)
  const fam = familyOf(hints)
  // a meaning that names a name of the passage (Brahmadatta "student of Suppiya") says more than a title's family
  const evidence = (e: Entity) => (fam && fam.test(e.family) ? 20 : 0) + (near.some(n => e.meaning.includes(n)) ? 25 : 0)
    + (context.includes(e) ? 30 : 0)
  // prominence: DPD numbers the namesakes the most prominent first (gotama 1 the Buddha's family name, kassapa 1 the
  // previous Buddha, brahmadatta 1 the king of the Jātakas); DPPN-only names after DPD's
  const hom = (e: Entity) => +(/ ([\d.]+)$/.exec(e.lemma)?.[1] ?? 1)
  const score = (e: Entity) => evidence(e) * 100 - hom(e) * 10 - rank(e) - (e.dpd ? 0 : 50)
  const sorted = [...cands].sort((a, b) => score(b) - score(a) || (a.dpd || 1e9) - (b.dpd || 1e9))
  const top = evidence(sorted[0])
  return { best: sorted[0], sure: top > 0 && evidence(sorted[1]) < top }
}

/** the entity a name form means here (rankEntities' best; hint: the word after it) */
export function pickEntity(f: Form, types: EntityType[], context: Entity[] = [], hint = ''): Entity | null {
  return rankEntities(f, types, context, [hint]).best
}
