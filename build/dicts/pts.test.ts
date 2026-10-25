import { describe, expect, it } from 'vitest'
import { cleanHead, parsePtsEntry, restoreFromOld } from './pts'

describe('parsePtsEntry', () => {
  it('reads headword, homonym and variants', () => {
    const e = parsePtsEntry({ name: '<p><span class="Head"><b>Kalla</b><sup>01</sup> and <b>Kalya</b><sup>,,</sup> (adjective) [cf. Sanskrit kalya] well </p>' })!
    expect(e).toMatchObject({ word: 'kalla', hom: 1, aliases: ['kalya'], headRest: 'and <b>Kalya</b>' })
    expect(e.body).toBe('<p>(adjective) [cf. Sanskrit kalya] well </p>')
  })
  it('handles a missing </span>, prefix hyphens and starred forms', () => {
    expect(parsePtsEntry({ name: '<p><span class="Head"><b>Kapiṭṭha</b> and <b>Kapittha</b>,,] <br>1. the tree </p>' })).toMatchObject({ word: 'kapiṭṭha', aliases: ['kapittha'] })
    expect(parsePtsEntry({ name: '<p><span class="Head"><b>A</b>-<sup>02</sup> </span>', entry: 'negative particle </p>' })).toMatchObject({ word: 'a', hom: 2 })
    expect(parsePtsEntry({ name: '<p><span class="Head"><b>Dassati</b><sup>01</sup> *<b>Dassati</b><sup>01</sup> </span>', entry: '[x] to see </p>' }))
      .toMatchObject({ word: 'dassati', hom: 1, aliases: [] })
  })
  it('writes ṃ and escapes stray tags', () => {
    expect(parsePtsEntry({ name: '<p><span class="Head"><b>Saṁ</b> </span>', entry: 'Latin <sequor> saṁ </p>' })!.body).toBe('<p>Latin &lt;sequor&gt; saṃ </p>')
  })
})

describe('restoreFromOld', () => {
  const grammar = new Map([['der', ['derived', 'derivation']]])
  it('restores the bold of the old copy', () => {
    const r = restoreFromOld('<p>(neuter) [ati + vac, cf. Sanskrit ativāda, from ati + vad] abuse</p>',
      '(nt.) [ati + <b>vac</b>, cp. Sk. ativāda, fr. ati + <b>vad</b>] abuse', grammar)
    expect(r.html).toBe('<p>(neuter) [ati + <b>vac</b>, cf. Sanskrit ativāda, from ati + <b>vad</b>] abuse</p>')
    expect(r.bold).toBe(2)
  })
  it('keeps hyphenated words in one bold run and leaves bold text alone', () => {
    expect(restoreFromOld('<p>– past participle abhi-sitta, <b>kāya</b></p>', '-- pp. <b>abhi -- sitta</b>, <b>kāya</b>', grammar).html)
      .toBe('<p>– past participle <b>abhi-sitta</b>, <b>kāya</b></p>')
  })
  it('turns "past participle 57" back to pages', () => {
    const r = restoreFromOld('<p>Trenckner, Notes past participle 57, 61</p>', 'Trenckner, Notes pp. 57, 61', grammar)
    expect(r.html).toBe('<p>Trenckner, Notes pp. 57, 61</p>')
    expect(r.fixes).toEqual(['pp.'])
  })
  it('matches ṁ, ṃ and ŋ', () => {
    expect(restoreFromOld('<p>lokaṃ x</p>', '<b>lokaŋ</b> x', grammar).html).toBe('<p><b>lokaṃ</b> x</p>')
  })
})

describe('headword slips of the source', () => {
  it('drops trailing punctuation, stray carons and breves, and a bracketed ending', () => {
    expect(['lañcaka:', 'tadaṅga.', 'kolāpa)', 'paccākoṭita;', 'hirī̌mant', 'santā̆neti)', 'mana(s)', 'abhiniḥta'].map(cleanHead))
      .toEqual(['lañcaka', 'tadaṅga', 'kolāpa', 'paccākoṭita', 'hirīmant', 'santāneti', 'mana', 'abhinihata'])
  })
})
