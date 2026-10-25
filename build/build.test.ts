import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseXml } from './xml'
import { buildCorpus, type Corpus } from './tree'
import { decodeOffsets, encodeOffsets, buildIndex } from './fts'
import { buildParaLinks } from './links'
import { validate } from './validate'
import { divKey, BOOKS, GROUPS } from './catalog'
import { FIXTURE_BOOKS } from './fixture'
import { oldFileColl } from './legacy'
import { tokens } from '../shared/tokenize'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE_XML = path.join(repo, 'e2e/fixtures/xml')

const wrap = (body: string) => `<?xml version="1.0"?><TEI.2><teiHeader></teiHeader><text><front></front><body xml:space="preserve">${body}</body></text></TEI.2>`

describe('xml parser', () => {
  it('parses paragraphs, paranum, bold, notes and page breaks', () => {
    const items = parseXml(wrap(`
<p rend="nikaya">Dīghanikāyo</p>
<div id="dn1" n="dn1" type="book"><head rend="book">Sīlakkhandhavaggapāḷi</head>
<p rend="bodytext" n="1"><hi rend="paranum">1</hi><hi rend="dot">.</hi> Evaṃ <pb ed="M" n="1.0001" /><pb ed="V" n="1.0001" /> me <hi rend="bold">sutaṃ</hi> – upagacchi <note>upagañchi (sī. syā.)</note> saddhiṃ &amp; x</p>
<pb ed="P" n="1.0002" />
<p rend="hangnum" n="2"><hi rend="paranum">2</hi><hi rend="dot">.</hi></p>
<p rend="gatha1">Manopubbaṅgamā dhammā,</p>
</div>`))
    expect(items).toEqual([
      { k: 'p', rend: 'nikaya', num: '', text: 'Dīghanikāyo', head: false },
      { k: 'div', id: 'dn1', type: 'book' },
      { k: 'p', rend: 'book', num: '', text: 'Sīlakkhandhavaggapāḷi', head: true },
      { k: 'p', rend: 'bodytext', num: '1', text: 'Evaṃ |M1.0001||V1.0001| me **sutaṃ** – upagacchi {upagañchi (sī. syā.)} saddhiṃ & x', head: false },
      // the hangnum number moves to the verse, the page break between paragraphs to the start of the next one
      { k: 'p', rend: 'gatha1', num: '2', text: '|P1.0002|Manopubbaṅgamā dhammā,', head: false },
      { k: 'end' },
    ])
  })
  it('keeps hangnum paragraphs that hold text', () => {
    const items = parseXml(wrap('<p rend="hangnum">Ka.</p>'))
    expect(items).toEqual([{ k: 'p', rend: 'hangnum', num: '', text: 'Ka.', head: false }])
  })
})

describe('catalog', () => {
  it('maps div ids to keys', () => {
    expect(divKey('dn1_1', '')).toBe('dn-1-1')
    expect(divKey('an2_1_3', 'atta-')).toBe('atta-an-2-1-3')
    expect(divKey('kn14_17', '')).toBe('kn-jat-17')
    expect(divKey('vin2', 'tika-')).toBe('tika-vp-pct')
    expect(divKey('xyz1', '')).toBeNull()
  })
  it('lists every book once with a known parent', () => {
    const files = BOOKS.flatMap(b => b.files)
    expect(new Set(files).size).toBe(files.length)
    expect(files.length).toBe(217)
    const groups = new Set(GROUPS.map(g => g.key))
    for (const b of BOOKS) expect(groups.has(b.parent), b.id).toBe(true)
  })
  it('legacy file collections', () => {
    expect(['1a1', 'aa1', '2a1', '3a1', 'fa0', '4a0', '5a1', 'ka0a', '6a1', 'pa1'].map(oldFileColl))
      .toEqual(['mula', 'mula', 'mula', 'atta', 'atta', 'atta', 'tika', 'tika', 'tika', 'anya'])
  })
})

describe('fixture corpus', () => {
  let c: Corpus
  beforeAll(() => { c = buildCorpus(FIXTURE_XML, { books: FIXTURE_BOOKS }) })

  it('has no validation errors', () => {
    expect(validate(c).errors).toEqual([])
  })
  it('keeps the published keys (url contract)', () => {
    const snap = path.join(repo, 'build/__snapshots__/fixture-keys.txt')
    const keys = c.nodes.map(n => `${n.key}\t${n.title}`).join('\n') + '\n'
    if (!fs.existsSync(snap) || process.env.UPDATE_KEYS) { fs.mkdirSync(path.dirname(snap), { recursive: true }); fs.writeFileSync(snap, keys) }
    expect(keys).toBe(fs.readFileSync(snap, 'utf8'))
  })
  it('builds the expected structure', () => {
    const n = (k: string) => c.nodes[c.keyToNode.get(k)!]
    expect(n('dn-1-1').title).toBe('1. Brahmajālasuttaṃ')
    expect(n('dn-1-1-1').title).toBe('Paribbājakakathā')
    expect(n('tika-dn-1-0').title).toBe('Ganthārambhakathāvaṇṇanā') // a div without a <head>: its first heading
    expect(n('mn-1-1-2').title).toBe('2. Sabbāsavasuttaṃ')
    expect(n('mn-1-1-2-1').title).toBe('Dassanā pahātabbāsavā') // unnumbered subhead nested under the sutta
    expect(n('kn-dhp-1').title).toBe('1. Yamakavaggo')
    expect(n('atta-kn-dhp-0').title).toBe('Ganthārambhakathā')
    expect(n('atta-kn-dhp-1').title).toBe('1. Yamakavaggo')
    expect(n('anya-vism-1').title).toBe('1. Sīlaniddeso') // volume marker "(Paṭhamo bhāgo)" is not a node
    expect(n('atta-dn-1-0').title).toBe('Ganthārambhakathā')
    // every paragraph belongs to a node of its own book, ranges are consistent
    for (const p of c.paras) expect(c.nodes[p.node].book).toBe(p.book)
    for (const node of c.nodes) if (node.kind !== 'group') expect(node.end).toBeGreaterThan(node.start)
  })
  it('links commentary paragraphs by paragraph number', () => {
    const links = buildParaLinks(c)
    const dn1 = c.nodes[c.keyToNode.get('dn-1-1')!]
    const atta = links.filter(l => l.kind === 'mula-atta' && l.toBook === dn1.book)
    expect(atta.length).toBeGreaterThan(5)
    for (const l of atta) {
      const from = c.paras.find(p => p.book === l.fromBook && p.idx === l.fromIdx)!
      const to = c.paras.find(p => p.book === l.toBook && p.idx === l.toIdx)!
      expect(/\d+/.exec(from.num)![0]).toBe(/\d+/.exec(to.num)![0])
    }
  })
  it('indexes token offsets per book', () => {
    const { paraTok, tokens: rows, postings } = buildIndex(c)
    const evam = rows.find(r => r.w === 'evaṃ')!
    expect(evam.fold).toBe('evam')
    expect(evam.rev).toBe('mave')
    const p = postings.find(x => x.token === evam.id && x.book === c.nodes[c.keyToNode.get('dn-1-1')!].book)!
    const offs = decodeOffsets(p.offsets)
    // first occurrence is the first word of paragraph 1 of DN 1
    const para = c.paras.findIndex(x => x.book === p.book && x.num === '1')
    expect(offs[0]).toBe(paraTok[para])
    expect(tokens(c.paras[para].text)[0]).toBe('evaṃ')
  })
})

describe('offset encoding', () => {
  it('round trips', () => {
    const offs = [0, 1, 5, 127, 128, 300, 16384, 2 ** 31]
    expect(decodeOffsets(encodeOffsets(offs))).toEqual(offs)
  })
})
