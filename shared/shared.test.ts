import { describe, expect, it } from 'vitest'
import { markupToHtml, noteTexts, parseMarkup, plainText, serialize } from './markup'
import { indexedText, tokenize, tokens } from './tokenize'
import { fold, hasDiacritics, reverse, slug } from './normalize'

describe('markup', () => {
  const t = 'Evaṃ |M1.0001||V1.0001| me **sutaṃ** – ekaṃ {anubaddhā (ka. sī. pī.)} samayaṃ'
  it('parses and serializes losslessly', () => {
    expect(serialize(parseMarkup(t))).toBe(t)
    expect(parseMarkup('a **b {c **d** e} f** g')).toEqual([
      { t: 'text', s: 'a ', o: 0 },
      { t: 'bold', c: [{ t: 'text', s: 'b ', o: 4 }, { t: 'note', c: [{ t: 'text', s: 'c ', o: 7 }, { t: 'bold', c: [{ t: 'text', s: 'd', o: 11 }] }, { t: 'text', s: ' e', o: 14 }] }, { t: 'text', s: ' f', o: 17 }] },
      { t: 'text', s: ' g', o: 21 },
    ])
  })
  it('wraps spans of the markup (commentary alignment), cut at bold and note boundaries', () => {
    const t = 'Evaṃ me **sutaṃ** ekaṃ {x} samayaṃ'
    const html = markupToHtml(t, { notes: 'hidden', spans: [{ s: 5, e: 34, id: '7', cls: 'gl-atta' }, { s: 5, e: 7, id: '8', cls: 'gl-tika' }] })
    // spaces inside a range are underlined too (a quoted phrase is one line), whitespace-only pieces are not wrapped
    expect(html).toBe('Evaṃ <span class="gl gl-atta gl-tika" data-g="7 8">me</span> <b><span class="gl gl-atta" data-g="7">sutaṃ</span></b>'
      + '<span class="gl gl-atta" data-g="7"> ekaṃ </span><span class="gl gl-atta" data-g="7"> samayaṃ</span>')
  })
  it('tolerates unbalanced markers', () => {
    expect(serialize(parseMarkup('a **b'))).toBe('a **b**')
    expect(serialize(parseMarkup('a {b **c} d'))).toBe('a {b **c**} d')
    expect(serialize(parseMarkup('a | b'))).toBe('a | b')
  })
  it('plain text drops notes and page refs', () => {
    expect(plainText(t)).toBe('Evaṃ me sutaṃ – ekaṃ samayaṃ')
    expect(plainText(t, true)).toBe('Evaṃ me sutaṃ – ekaṃ (anubaddhā (ka. sī. pī.)) samayaṃ')
  })
  it('renders html with options and escapes', () => {
    expect(markupToHtml('a <b> & **c**')).toBe('a &lt;b&gt; &amp; <b>c</b>')
    expect(markupToHtml(t, { notes: 'hidden', pageRefs: '' })).toBe('Evaṃ  me <b>sutaṃ</b> – ekaṃ  samayaṃ')
    expect(markupToHtml(t, { notes: 'inline', pageRefs: 'M' })).toContain('<span class="pb" data-ed="M" data-n="1.0001">M1.0001</span>')
    expect(markupToHtml(t, { notes: 'inline' })).toContain('<span class="note" data-i="0">[anubaddhā (ka. sī. pī.)]</span>')
    expect(markupToHtml(t, { notes: 'pointer' })).toContain('<sup class="note-ptr" data-i="0"')
    expect(markupToHtml('ab', { convert: s => s.toUpperCase() })).toBe('AB')
    expect(noteTexts(t)).toEqual(['anubaddhā (ka. sī. pī.)'])
  })
})

describe('tokenize', () => {
  it('splits letters, joins apostrophes, skips notes', () => {
    expect(tokens('Evaṃ |M1.0001| me **sutaṃ** – {x y} aha’meko, 12. Bhagavā‘‘ti?')).toEqual(['evaṃ', 'me', 'sutaṃ', 'ahameko', 'bhagavāti'])
    expect(tokens('‘‘acchariyaṃ, āvuso’’')).toEqual(['acchariyaṃ', 'āvuso'])
  })
  it('offsets index the flattened text', () => {
    const text = 'Evaṃ **me** {note} sutaṃ'
    const flat = indexedText(text)
    expect(flat).toBe('Evaṃ me   sutaṃ')
    expect(tokenize(text).map(t => flat.slice(t.start, t.end))).toEqual(['Evaṃ', 'me', 'sutaṃ'])
  })
  it('normalises to NFC lower case', () => {
    expect(tokens('Dhammā')).toEqual(['dhammā'])
  })
})

describe('normalize', () => {
  it('folds diacritics', () => {
    expect(fold('Dhammā ñāṇaṃ ṭhānaṃ ḍ ḷ ṅ ī ū')).toBe('dhamma nanam thanam d l n i u')
    expect(hasDiacritics('dhamma')).toBe(false)
    expect(hasDiacritics('dhammā')).toBe(true)
    expect(reverse('dhammassa')).toBe('assammahd')
    expect(slug('Saddanītippakaraṇaṃ (padamālā)')).toBe('saddanitippakaranam-padamala')
  })
})
