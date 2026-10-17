import { describe, expect, it } from 'vitest'
import { cognates, etymology, fillGaps, thaiMechanical } from './thai-pts'
import { greekFont } from './pts'

describe('thaiMechanical', () => {
  it('maps the private use glyphs', () => {
    expect(thaiMechanical('โกฏฺาส ปํฺา ตุ')).toBe('โกฏฺฐาส ปํฺญา ตุํ')
  })
  it('orders nikhahit, tone and aa', () => {
    expect(thaiMechanical('นํ้ามัน กําไร มนฺตฺราณํา')).toBe('น้ำมัน กำไร มนฺตฺราณาํ')
  })
  it('drops doubled marks and fixes quotes and the omission sign', () => {
    expect(thaiMechanical('ใช้้ นปุฺํ. ‚มาน‛ (เทียบ ฺํอาส ใน')).toBe('ใช้ นปุํ. “มาน” (เทียบ °อาส ใน')
  })
})

describe('fillGaps', () => {
  const none = () => false
  it('restores a missing consonant from the English entry', () => {
    expect(fillGaps('<b>ปติฏฺาสิ</b>', new Set(['ปติฏฺฐาสิ']), none).html).toBe('<b>ปติฏฺฐาสิ</b>')
  })
  it('moves a vowel written before its consonant', () => {
    expect(fillGaps('เสฏฺิฐี', new Set(['เสฏฺฐี']), none).html).toBe('เสฏฺฐี')
  })
  it('uses known word forms and keeps leading vowels', () => {
    expect(fillGaps('ปญฺญฺา อกฺโกสติ', new Set(), w => w === 'paññā').html).toBe('ปญฺญา อกฺโกสติ')
  })
  it('drops the pinthu of Thai words and stray glyphs', () => {
    expect(fillGaps('คฺุ้มครอง ฺิวิ', new Set(), none).html).toBe('คุ้มครอง วิ')
  })
  it('leaves what it can not decide', () => {
    const r = fillGaps('กฺาข', new Set(), none)
    expect(r.html).toBe('กฺาข')
    expect(r.left).toEqual(['กฺาข'])
  })
})

describe('etymology', () => {
  it('replaces garbled Greek one for one', () => {
    const en = '[Vedic ṛkṣa = Greek ἄρκτος, Latin ursus, Cymric arth] a bear'
    expect(etymology('[เวท.ฤกฺษ = Gr. apktoc. ursus, Cymr. arth] หมี', en).html).toBe('[เวท.ฤกฺษ = Gr. ἄρκτος. ursus, Cymr. arth] หมี')
  })
  it('puts back lost Greek', () => {
    const en = 'Avesta aśta, Greek ὸκτώ, Latin octo, Gothic ahtau'
    expect(etymology('Av. asta, Gr. Lat. Octo, Goth. ahtau', en).html).toBe('Av. asta, Gr. ὸκτώ, Lat. Octo, Goth. ahtau')
  })
  it('picks the homonym by cognates', () => {
    expect(cognates('Av. asta, Gr. Lat. Octo, Goth. ahtau', 'Avesta aśta, Greek ὸκτώ, Latin octo, Gothic ahtau')).toBeGreaterThanOrEqual(3)
    expect(cognates('Av. asta', 'see attha')).toBe(0)
  })
})

describe('greekFont', () => {
  it('fixes the letters of the PTS edition', () => {
    expect(greekFont('ὦμοϛ ὀφϧαλμός καιϙός anϸar')).toBe('ὦμος ὀφθαλμός καιρός anþar')
  })
})
