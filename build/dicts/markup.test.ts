import { describe, expect, it } from 'vitest'
import { betaToGreek, normalizeMeaning } from './markup'

describe('betaToGreek', () => {
  it('converts letters, breathings, accents and final sigma', () => {
    expect(betaToGreek('de/rkomai')).toBe('δέρκομαι')
    expect(betaToGreek('e)/lutron')).toBe('ἔλυτρον')
    expect(betaToGreek('w)_mos')).toBe('ω\u0313\u0304μος'.normalize('NFC'))
    expect(betaToGreek('o)cu/s')).toBe('ὀξύς')
    expect(betaToGreek('*ku/klwy')).toBe('Κύκλωψ')
    expect(betaToGreek('*)/arhs')).toBe('Ἄρης')
    expect(betaToGreek('a), a)n')).toBe('ἀ, ἀν')
  })
})

describe('normalizeMeaning', () => {
  it('converts the v2 custom tags', () => {
    expect(normalizeMeaning('see <b><ref target="usabha">usabha</ref></b>')).toBe('see <b><a data-dict="usabha">usabha</a></b>')
    expect(normalizeMeaning('J <smallcaps>ii.</smallcaps>317')).toBe('J <span class="sc">ii.</span>317')
    expect(normalizeMeaning('Gr. <at>de/rkomai</at> to see')).toBe('Gr. δέρκομαι to see')
    expect(normalizeMeaning('see <see>karoti</see>')).toBe('see <a data-dict="karoti">karoti</a>')
    expect(normalizeMeaning('<r c1>පු</r> උරහිස')).toBe('<span class="gram">පු</span> උරහිස')
    expect(normalizeMeaning('Ja I 503,<span style="font-size: 85%;">19*</span>')).toBe('Ja I 503,<span class="lnum">19*</span>')
  })
})
