import { describe, expect, it, beforeAll } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractLemmas } from './lemmas'
import { matchSection } from './match'
import { stream, words } from './text'
import { alignCommentaries, titleKey, type AlignResult } from './index'
import { isCommentary } from './books'
import { buildCorpus, type Corpus } from '../tree'
import { buildParaLinks, paraPos } from '../links'
import { FIXTURE_BOOKS } from '../fixture'
import { NodeTexts, makeSelector, resolveSelector, type StoredDecision } from './decisions'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('words', () => {
  it('folds, skips notes and page refs, keeps markup offsets and bold flags', () => {
    const t = 'Evaṃ |M1.0001| me **sutaṃ** {sutaṃ (ka.)} bhāsita’’nti'
    const ws = words(t)
    expect(ws.map(w => w.f)).toEqual(['evam', 'me', 'sutam', 'bhasitanti'])
    expect(t.slice(ws[2].s, ws[2].e)).toBe('sutaṃ')
    expect(ws[2].b.every(Boolean)).toBe(true)
    expect(ws[0].b.some(Boolean)).toBe(false)
  })
  it('streams words without spaces', () => {
    const st = stream(words('addhānamaggappaṭipanno hoti'))
    expect(st.f).toBe('addhanamaggappatipannohoti')
    expect(st.ws).toEqual([0, 22])
  })
})

describe('lemmas', () => {
  const pats = (t: string) => extractLemmas(t).map(l => l.pats)
  it('restores the sandhi form from the tail', () => {
    expect(pats('**Sambahulāna**nti bahukānaṃ.')).toEqual([['sambahulanam', 'sambahulana']])
    expect(pats('**Paṭipanno hotī**ti ettha **paṭī**ti upasaggapadaṃ')).toEqual([['patipannohoti'], ['pati']])
    expect(pats('**Accharāyogganti** accharāpaharaṇamattampi')).toEqual([['accharayogganti', 'accharayoggam']])
    expect(pats('Tattha **samaya**saddo')).toEqual([['samaya']])
  })
  it('marks tiādi and …pe… lemmas', () => {
    const [a] = extractLemmas('**Evaṃ me suta**ntiādimāha')
    expect(a.adi).toBe(true)
    const [b] = extractLemmas('**Ekaṃ samayaṃ …pe… viharatī**ti')
    expect(b.parts).toEqual(['ekamsamayam', 'viharati'])
  })
  it('joins bold runs separated by page refs and keeps comma separated lemmas apart', () => {
    expect(pats('**Manopubbaṅgamā** |V1.0003||P1.0003| **dhammā, manoseṭṭhā manomayā;**')).toEqual([['manopubbangamadhammamanosetthamanomaya']])
    expect(pats('**rūpaṃ**, **vedanā**ti')).toEqual([['rupam'], ['vedana']])
  })
  it('keeps the markup offsets of the bold letters', () => {
    const t = 'Tattha **eva**nti nipātapadaṃ.'
    const [l] = extractLemmas(t)
    expect(t.slice(l.s, l.e)).toBe('eva')
  })
})

describe('matching', () => {
  it('uses the order of the lemmas for repeated words', () => {
    const target = 'Evaṃ me sutaṃ – ekaṃ samayaṃ bhagavā. Evaṃ vutte bhikkhū. Atha kho evaṃ cintesi'
    const st = stream(words(target))
    const ls = extractLemmas('**Ekaṃ samaya**nti. **Bhagavā**ti. **Evaṃ vutte**ti. **Eva**nti')
    const ms = matchSection(ls, st)
    const ws = words(target)
    expect(ms.map(m => m && ws.slice(m.w0, m.w1 + 1).map(w => w.f).join(' '))).toEqual(['ekam samayam', 'bhagava', 'evam vutte', 'evam'])
    // the last "evaṃ" comes after "evaṃ vutte"
    expect(ms[3]!.w0).toBeGreaterThan(ms[2]!.w0)
  })
  it('places a word the section explains again at its first match', () => {
    const target = 'Evaṃ me sutaṃ. Evaṃ vutte. Ekaṃ samayaṃ'
    const ms = matchSection(extractLemmas('**Eva**nti nipāto. **Me**ti. **Suta**nti. **Ekaṃ samaya**nti. Tathā **eva**nti ākāro.'), stream(words(target)))
    expect(ms[4]).toMatchObject({ w0: ms[0]!.w0, kind: 'reorder' })
  })
  it('does not match short words inside other words', () => {
    const ms = matchSection(extractLemmas('**Attho**ti hetuphalaṃ'), stream(words('haṭṭho udaggo')))
    expect(ms).toEqual([null])
  })
})

describe('fixture alignment', () => {
  let c: Corpus
  let r: AlignResult
  beforeAll(() => {
    c = buildCorpus(path.join(repo, 'e2e/fixtures/xml'), { books: FIXTURE_BOOKS })
    r = alignCommentaries(c, buildParaLinks(c))
  })
  const text = (b: number, i: number) => c.paras[paraPos(c, b, i)].text
  const key = (b: number, i: number) => c.nodes[c.paras[paraPos(c, b, i)].node].key
  const find = (lemma: string, kind = 'mula-atta') => r.glosses.find(g => g.kind === kind && text(g.cBook, g.cIdx).slice(g.cS, g.cE) === lemma)

  it('links the lemmas of DN 1 to the quoted words', () => {
    const g = find('Sambahulāna')!
    expect(text(g.tBook, g.tIdx).slice(g.tS, g.tE)).toBe('sambahulānaṃ')
    expect(key(g.tBook, g.tIdx)).toBe('dn-1-1-1')
    const p = find('Paṭipanno hotī')!
    expect(text(p.tBook, p.tIdx).slice(p.tS, p.tE)).toBe('addhānamaggappaṭipanno hoti')
  })
  it('gives each lemma the explanation up to the next lemma', () => {
    const g = find('eva')!
    const ex = text(g.cBook, g.cIdx).slice(g.cS, g.xEIdx === g.cIdx ? g.xE : undefined)
    expect(ex).toBe('eva**nti nipātapadaṃ. ')
  })
  it('matches Dhammapada verses quoted over several lines', () => {
    const g = r.glosses.find(x => x.kind === 'mula-atta' && key(x.cBook, x.cIdx).startsWith('atta-kn-dhp') && text(x.cBook, x.cIdx).slice(x.cS).startsWith('‘‘Manopubbaṅgamā') === false && text(x.cBook, x.cIdx).slice(x.cS).startsWith('Manopubbaṅgamā'))!
    expect(g.cEIdx).toBeGreaterThan(g.cIdx)
    expect(g.tEIdx - g.tIdx).toBe(2)
    expect(key(g.tBook, g.tIdx)).toBe('kn-dhp-1')
  })
  it('aligns the ṭīkā to the aṭṭhakathā and chains it to the mūla', () => {
    expect(r.glosses.some(g => g.kind === 'atta-tika')).toBe(true)
    const ch = r.glosses.filter(g => g.kind === 'mula-tika')
    expect(ch.length).toBeGreaterThan(20)
    for (const g of ch) expect(c.books[g.tBook].def.coll).toBe('mula')
  })
  it('derives paragraph links for unnumbered commentary paragraphs', () => {
    const unnumbered = r.links.filter(l => !c.paras[paraPos(c, l.fromBook, l.fromIdx)].num)
    expect(unnumbered.length).toBeGreaterThan(100)
  })
  it('matches most lemmas', () => {
    const atta = r.stats.filter(s => c.books[s.book].def.coll === 'atta')
    const lemmas = atta.reduce((a, s) => a + s.lemmas, 0), m = atta.reduce((a, s) => a + s.exact + s.trim + s.reorder, 0)
    expect(m / lemmas).toBeGreaterThan(0.75)
  })
})

describe('stored decisions', () => {
  let c: Corpus
  beforeAll(() => { c = buildCorpus(path.join(repo, 'e2e/fixtures/xml'), { books: FIXTURE_BOOKS }) })
  const para = (key: string, re: RegExp) => {
    const n = c.nodes[c.keyToNode.get(key)!]
    for (let i = n.start; i < n.end; i++) {
      const p = c.paras[paraPos(c, n.book, i)]
      const m = re.exec(p.text)
      if (m) return { p, s: m.index, e: m.index + m[0].length }
    }
    throw new Error(`${re} not in ${key}`)
  }

  it('selectors survive edits elsewhere and break when their words change', () => {
    const { p, s, e } = para('dn-1-1-1', /sambahulānaṃ bhikkhūnaṃ/)
    const sel = makeSelector(new NodeTexts(c), 'dn-1-1-1', p.idx, s, e)!
    expect(sel.q).toBe('sambahulanambhikkhunam')
    const n = c.nodes[c.keyToNode.get('dn-1-1-1')!]
    const first = c.paras[paraPos(c, n.book, n.start + 1)]
    const orig = first.text, origP = p.text
    try {
      first.text = 'Upstream inserted words here. ' + orig // offsets and word positions shift
      const r = resolveSelector(new NodeTexts(c), sel)!
      expect(r.exact).toBe(true)
      expect(p.text.slice(r.ws[r.w0].s, r.ws[r.w1].e)).toBe('sambahulānaṃ bhikkhūnaṃ')
      // a correction inside the quote: gone (null), or only another occurrence with other words before it (drifted)
      p.text = p.text.replace('sambahulānaṃ bhikkhūnaṃ', 'sambahulānaṃ samaṇānaṃ')
      const r2 = resolveSelector(new NodeTexts(c), sel)
      expect(r2 === null || (!r2.exact && r2.ws[r2.w0].idx !== p.idx)).toBe(true)
    } finally { first.text = orig; p.text = origP }
  })

  it('a decision replaces or removes the match of its lemma', () => {
    const nt = new NodeTexts(c)
    const lemma = para('atta-dn-1-1-1', /Sambahulāna/)
    const target = para('dn-1-1-1', /maṇḍalamāḷe/)
    const decisions: StoredDecision[] = [{
      file: 't.jsonl', line: 1,
      d: { c: makeSelector(nt, 'atta-dn-1-1-1', lemma.p.idx, lemma.s, lemma.e)!, m: makeSelector(nt, 'dn-1-1-1', target.p.idx, target.s, target.e)!, v: 'match', conf: 0.8, src: 'manual' },
    }]
    const r = alignCommentaries(c, buildParaLinks(c), { decisions })
    const g = r.glosses.find(x => x.kind === 'mula-atta' && x.cIdx === lemma.p.idx && x.cS === lemma.s)!
    expect(g.src).toBe('manual')
    expect(c.paras[paraPos(c, g.tBook, g.tIdx)].text.slice(g.tS, g.tE)).toBe('maṇḍalamāḷe')
    decisions[0].d = { ...decisions[0].d, v: 'not-lemma', m: undefined }
    const r2 = alignCommentaries(c, buildParaLinks(c), { decisions })
    expect(r2.glosses.some(x => x.kind === 'mula-atta' && x.cIdx === lemma.p.idx && x.cS === lemma.s)).toBe(false)
    expect(r2.warnings).toEqual([])
  })
})

describe('books and sections', () => {
  it('maps section titles of a commentary to the explained text', () => {
    expect(titleKey('Paṭhamapārājikakathāvaṇṇanā')).toBe(titleKey('Paṭhamapārājikakathā'))
    expect(titleKey('Cetasikaniddesavaṇṇanā')).toBe(titleKey('Cetasikaniddeso'))
    expect(titleKey('1. Brahmajālasuttavaṇṇanā')).toBe(titleKey('1. Brahmajālasuttaṃ'))
    expect(titleKey('Dutiyapārājikakathā')).not.toBe(titleKey('Paṭhamapārājikakathā'))
  })
  it('knows base texts and commentaries outside the aṭṭhakathā / ṭīkā collections', () => {
    expect(isCommentary({ id: 'vin11t.nrf', coll: 'tika' })).toBe(true)
    expect(isCommentary({ id: 'vin10t.nrf', coll: 'tika' })).toBe(false) // Vinayavinicchaya itself
    expect(isCommentary({ id: 'e0103n.att', coll: 'anya' })).toBe(true) // Visuddhimagga-mahāṭīkā
    expect(isCommentary({ id: 'e0101n.mul', coll: 'anya' })).toBe(false)
  })
})
