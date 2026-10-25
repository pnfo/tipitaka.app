/**
 * Names of the Dictionary of Pāli Proper Names (DPPN) that DPD does not have (most of the commentary's people and
 * places): their type, read from the first sentence of the entry ("A village in Ceylon …", "One of the Arahants …",
 * "Preached at Jetavana …" is a sutta, no name), and their inflected forms, made with DPD's inflection templates
 * (dpd.db inflection_templates: the endings of each case of a pattern such as "a masc").
 */
import type { EntityType } from './gazetteer'

export type DppnType = EntityType | 'other'

// the first of these words in the first sentence decides (its position, not the list order)
const KINDS: [DppnType, RegExp][] = [
  ['other', /\b(?:sutta|suttas|discourse|chapter|section|division|book|commentary|sub-commentary|poem|stanzas?|verses?|story|treatise|work|text|grammar|dictionary|vagga|list|epithet|term|title|simile|parable|question|questions|answer|the name of a sutta)\b/i],
  ['deity', /\b(?:deva|devas|devaputta|devaputtas|deity|deities|devatā|goddess|god|gods|yakkha|yakkhas|yakkhinī|yakkhiṇī|nāga|nāgas|nāgī|garuḷa|supaṇṇa|asura|asuras|gandhabba|peta|petas|petī|brahmā|spirit|sea-goddess|dryad|tree-sprite|tree-spirit|rakkhasa|rakkhasī)\b/i],
  ['animal', /\b(?:elephant|elephants|horse|horses|bull|ox|cow|dog|monkey|monkeys|bird|birds|crow|jackal|deer|fish|parrot|lion|tiger|crab|snake|serpent|peacock|goose|geese|hare|quail|vulture|boar|buffalo|ass|cat|rat|frog|owl|tortoise|turtle|partridge|antelope|swan|squirrel|mongoose|iguana|cock|hen|pigeon|heron|crane|woodpecker|ape)\b/i],
  ['group', /\b(?:clan|clans|tribe|tribes|people|peoples|family|race|sect|sects|school|schools|caste|dynasty|community|nation|inhabitants|dwellers|residents)\b/i],
  ['place', /\b(?:village|villages|town|city|cities|country|countries|district|locality|province|kingdom|region|place|mountain|mountains|hill|hills|rock|cave|forest|grove|wood|park|garden|monastery|monasteries|vihāra|pariveṇa|cetiya|shrine|thūpa|stūpa|tank|tanks|lake|pond|pool|river|rivers|ford|island|harbour|port|palace|mansion|hall|building|house|gate|market|street|road|field|plain|heaven|hell|world|sea|ocean|canal|bridge|temple|reservoir|mount|peak|valley|suburb|seaport|capital|janapada|nigama|ārāma|vimāna|dwelling|residence|abode|cell|hermitage|channel|stream|marsh|well|spring|bathing-place|realm|continent)\b/i],
  ['person', /\b(?:arahant|arahants|thera|theras|therī|therīs|monk|monks|nun|nuns|bhikkhu|bhikkhunī|king|kings|queen|prince|princess|brahmin|brahmins|brahman|householder|lay disciple|disciple|disciples|layman|laywoman|minister|general|son|daughter|wife|mother|father|brother|sister|bodhisatta|buddha|buddhas|seṭṭhi|merchant|elder|chieftain|chief|courtesan|ascetic|ascetics|wanderer|paribbājaka|teacher|pupil|novice|sāmaṇera|sāmaṇerī|physician|poet|author|man|woman|girl|boy|youth|slave|servant|potter|weaver|hunter|fisherman|barber|chaplain|treasurer|governor|viceroy|ruler|official|envoy|sage|hermit|isi|seer|warrior|soldier|charioteer|goldsmith|carpenter|cook|gardener|garland-maker|musician|dancer|robber|thief|outcaste|caṇḍāla|matron|lady|nephew|niece|grandson|granddaughter|uncle|aunt|friend|companion|attendant|follower|heretic|sophist|jaṭila|ājīvaka|nigaṇṭha|recluse|mendicant|upāsaka|upāsikā|sākiyan|sākiyans|sakyan|licchavi|mallian|koliyan|vajjian|kosalan|councillor|courtier|counsellor|adviser|priest|purohita|chamberlain|nurse|banker|trader|caravan leader|farmer|ploughman|cowherd|goatherd|shepherd|leper|beggar|millionaire)\b/i],
]
/** first sentences of the entries that are no names (summaries of suttas, lists, epithets) */
const NOT_A_NAME = /^(?:on |preached|records|same as|the same|there are|few are|just as|also called|another name for|a name (?:applied|given|for)|a conversation|mentioned in|the (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\w+teenth|\w+tieth) (?:chapter|section|division|vagga|book|sutta|part)|the (?:two|three|four|five|six|seven|eight|nine|ten) |the buddha (?:\w+s|is|was) |contains|describes|deals|gives|explains|a list|a sutta)/i
const TEXT_TITLE = /(?:sutta|suttanta|vagga|jātaka|vatthu|kathā|vaṇṇanā|ṭīkā|saṃyutta|nipāta|pañha|pāḷi|pucchā|gāthā|niddesa|vibhaṅga|khandhaka|pakaraṇa)$/

/** the type of a DPPN entry: word = its headword (lower case), sentence = the first sentence of the entry */
export function classifyDppn(word: string, sentence: string): { type: DppnType; noun: string } {
  if (/ ther[aī]$/.test(word)) return { type: 'person', noun: word.endsWith('ī') ? 'therī' : 'thera' }
  const w = word.replace(/\s+/g, '')
  if (TEXT_TITLE.test(w) || NOT_A_NAME.test(sentence.trim())) return { type: 'other', noun: '' }
  if (/\bclass of (?:devas|deities|gods|yakkhas|nāgas)\b/i.test(sentence)) return { type: 'deity', noun: 'class of devas' }
  let best: { type: DppnType; noun: string; at: number } | null = null
  for (const [type, re] of KINDS) {
    const m = re.exec(sentence)
    if (m && (!best || m.index < best.at)) best = { type, noun: m[0].toLowerCase(), at: m.index }
  }
  // an entry about someone ("He went after the Third Council to the Yona country", "She belonged to a family of
  // Kosambī"): a person, not the place or family the sentence names (a deity or an animal stays what it is)
  if (/^(?:he|she|his|her)\b/i.test(sentence.trim()) && (!best || best.type === 'place' || best.type === 'group' || best.type === 'other')) return { type: 'person', noun: 'person' }
  return best ? { type: best.type, noun: best.noun } : { type: 'other', noun: '' }
}

/** the first sentence of an entry's plain text (references like "Cv.xxxvii.185" do not end it) */
export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const m = /^(.{3,}?[^A-Z.][.;:])(?:\s+(?=[A-Z(‘“"])|$)/.exec(t)
  // without the text references that end it ("… Upatissa II. Cv.xxxvii.185.")
  return (m ? m[1] : t).replace(/\s+(?:[A-Z][A-Za-z-]*\.[ivxlcdm\d][\w.,;:\s()-]*)$/, '').slice(0, 240)
}

/** endings of a DPD inflection template: [ending, …] of all cases and numbers */
export type Templates = Map<string, { stemCut: number; endings: string[] }>

/** DPD's inflection_templates rows (pattern, data json) as endings */
export function readTemplates(rows: { pattern: string; data: string }[]): Templates {
  const out: Templates = new Map()
  for (const r of rows) {
    const data = JSON.parse(r.data) as string[][][]
    const endings = new Set<string>()
    for (const row of data.slice(1)) for (const i of [1, 3]) for (const e of row[i] ?? []) if (e) endings.add(e)
    // the pattern's own ending ("a" of "a masc") is cut from the lemma to get the stem
    out.set(r.pattern, { stemCut: r.pattern.split(' ')[0].length, endings: [...endings] })
  }
  return out
}

/** the inflection patterns a name may follow, by its ending and type (a place in -a may be masc or nt) */
export function patternsFor(base: string, type: EntityType): string[] {
  if (base.endsWith('a')) return type === 'place' ? ['a masc', 'a nt'] : ['a masc']
  if (base.endsWith('ā')) return type === 'group' ? ['ā fem', 'a masc pl'] : ['ā fem']
  if (base.endsWith('ī')) return ['ī fem', 'ī masc']
  if (base.endsWith('i')) return ['i masc', 'i fem']
  if (base.endsWith('u')) return ['u masc', 'u fem']
  if (base.endsWith('ū')) return ['ū fem', 'ū masc']
  return []
}

/** inflected forms of a base (+ the common sandhi of the texts: -ti, -ca, -pi, -va, -eva) */
export function inflect(base: string, patterns: string[], t: Templates): string[] {
  const out = new Set<string>()
  for (const p of patterns) {
    const tpl = t.get(p)
    // the base must end like the pattern ("a masc pl": samaṇabrāhmaṇā, a base in ā)
    const ending = p === 'a masc pl' ? 'ā' : p.split(' ')[0]
    if (!tpl || !base.endsWith(ending)) continue
    // "a masc pl" (samaṇabrāhmaṇā): the lemma ends in ā, the pattern in a
    const stem = p === 'a masc pl' ? base.slice(0, -1) : base.slice(0, base.length - tpl.stemCut)
    for (const e of tpl.endings) out.add(stem + e)
  }
  for (const f of [...out]) for (const s of sandhi(f)) out.add(s)
  return [...out]
}

const LONG: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū' }
export function sandhi(f: string): string[] {
  if (f.endsWith('ṃ')) { const s = f.slice(0, -1); return [s + 'nti', s + 'ñca', s + 'mpi', s + 'meva', s + 'va'] }
  const last = f.slice(-1)
  return [f.slice(0, -1) + (LONG[last] ?? last) + 'ti', f + 'ca', f + 'pi', f + 'va', f + 'eva']
}

/** the name of a headword without its title: "sunīta thera" -> sunīta, "mahā kassapa" -> mahākassapa */
export const dppnBase = (word: string) => word.replace(/ (?:thera|therī)$/, '').replace(/\s+/g, '')

/** an entry of the DPPN (no "see" reference): ref "word#hom" (~n for a headword repeated without a homonym number) */
export interface DppnEntry { word: string; hom: number; ref: string; aliases: string[]; body: string; sentence: string }

/** the entries of DPPN.json in order, and the "see" references (Akitti: see Akatti) as aliases of their target */
export function readDppnEntries(raw: { name: string; entry?: string }[], parse: (x: { name: string; entry?: string }) => { word: string; hom: number; aliases: string[]; body: string } | null,
  strip: (html: string) => string): { entries: DppnEntry[]; seeAlias: Map<string, string[]> } {
  const entries: DppnEntry[] = []
  const seeAlias = new Map<string, string[]>()
  const seen = new Map<string, number>()
  for (const x of raw) {
    const p = parse(x)
    if (!p) continue
    const body = strip(p.body)
    const sentence = firstSentence(body)
    const see = /^see\s+([^.;,(]+)/i.exec(sentence)
    if (see) {
      const target = dppnBase(see[1].trim().toLowerCase())
      seeAlias.set(target, [...(seeAlias.get(target) ?? []), dppnBase(p.word)])
      continue
    }
    const ref0 = `${p.word}#${p.hom}`
    const n = (seen.get(ref0) ?? 0) + 1
    seen.set(ref0, n)
    entries.push({ word: p.word, hom: p.hom, ref: n > 1 ? `${ref0}~${n}` : ref0, aliases: p.aliases, body, sentence })
  }
  return { entries, seeAlias }
}

/** the spelling of a name for matching DPPN and DPD names: no title, no spaces, the final vowel short, ṁ as ṃ
 *  ("Vipassī Buddha" = vipassī, "Mahā Koṭṭhita Thera" = mahākoṭṭhita) */
export function linkKey(w: string): string {
  return w.toLowerCase().replace(/ṁ/g, 'ṃ')
    .replace(/\s+(?:thera|therī|buddha|paccekabuddha|kumāra|kumārī|bhikkhu|bhikkhunī|upāsaka|upāsikā|yakkha|devaputta|nāgarāja|rājā)$/, '')
    .replace(/\s+/g, '').replace(/ā$/, 'a').replace(/ī$/, 'i').replace(/ū$/, 'u')
}

/**
 * Which DPD name a DPPN entry is about (data/names/dppn-links.tsv, scripts/names-ai.ts link): a DPD headword id, or 0
 * for another one of the same name (a namesake: its own name, never the default for a word). kind: the subject's type
 * (other: no name). src: auto (the only DPD and DPPN entry of a name, of one kind), ai, manual.
 */
export interface DppnLink { dpd: number; kind: DppnType; sure: boolean; src: string }
export const DPPN_LINKS = 'dppn-links.tsv'

export function readDppnLinks(text: string): Map<string, DppnLink> {
  const out = new Map<string, DppnLink>()
  for (const l of text.split('\n').slice(1)) {
    const [ref, dpd, , kind, sure, src] = l.split('\t')
    if (ref) out.set(ref, { dpd: dpd === 'new' ? 0 : +dpd, kind: kind as DppnType, sure: sure === '1', src })
  }
  return out
}
