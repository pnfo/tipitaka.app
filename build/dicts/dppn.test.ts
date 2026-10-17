import { describe, expect, it } from 'vitest'
import { editorMarks, fixBold, linkNames, parseDppnAbbrevs, parseDppnEntry } from './dppn'
import { markRefs } from './refs'

describe('parseDppnEntry', () => {
  it('reads the headword, homonym number and the rest of the head', () => {
    const p = parseDppnEntry({ name: '<p><span class="Head"><b>Ānanda</b> 01. <b>Ānanda Thera</b>. </span>', entry: 'One of the principal disciples. </p>' })!
    expect(p).toMatchObject({ word: 'ānanda', hom: 1, aliases: ['ānanda thera'], headRest: '<b>Ānanda Thera</b>' })
    expect(p.body).toBe('<p>One of the principal disciples. </p>')
  })
  it('keeps variants and the original spelling as aliases', () => {
    const p = parseDppnEntry({ name: '<p><span class="Head"><b>Cūḷa Ekasātaka</b>, <abbr title="Original" class="Original"><b>Cūla Ekasātaka</b></abbr>. </span>', entry: 'See <b>Ekasāṭaka</b>. </p>' })!
    expect(p.word).toBe('cūḷa ekasātaka')
    expect(p.aliases).toEqual(['cūla ekasātaka'])
    expect(parseDppnEntry({ name: '<p><span class="Head"><b>Ālambāyana</b> (<b>Ālambāna</b>, <b>Ālamba</b>). </span>', entry: 'x </p>' })!.aliases)
      .toEqual(['ālambāna', 'ālamba'])
  })
  it('skips the letter headings', () => {
    expect(parseDppnEntry({ name: '<p class="Heading3"><b>A-An</b>. </span>', entry: ' </p>' })).toBeNull()
  })
  it('fixes the malformed bold of a few heads', () => {
    expect(fixBold('<b>Akatti)</b>. ')).toBe('<b>Akatti</b>). ')
    expect(fixBold('<b>Anitthigandhakumāra (</b>3)')).toBe('<b>Anitthigandhakumāra</b> (3)')
  })
})

describe('linkNames', () => {
  const homs = new Map([['aggika bhāradvāja', new Set([1, 2])], ['sāsanavaṃsa', new Set([0])], ['akitti', new Set([0])]])
  it('links headwords, with the homonym when it exists', () => {
    expect(linkNames('to <b>Aggika Bhāradvāja</b> (2). The <b>Sāsanavaṁsa</b> (74) and <b>Nobody</b>', homs, ['x']).html).toBe(
      'to <b><a data-dict="aggika bhāradvāja" data-hom="2">Aggika Bhāradvāja</a></b> (2). The <b><a data-dict="sāsanavaṃsa">Sāsanavaṁsa</a></b> (74) and <b>Nobody</b>')
  })
  it('does not link the entry to itself', () => {
    expect(linkNames('<b>Akitti</b>', homs, ['akitti']).html).toBe('<b>Akitti</b>')
  })
})

describe('editor marks and references', () => {
  it('converts the abbr marks', () => {
    expect(editorMarks('after the <abbr title="Modified" class="Modified">Awakening</abbr> (<abbr title="Added or Corrected">potential</abbr>) <Abbr Title="Added/Modified">MN 86</Abbr>'))
      .toBe('after the <span class="ed-mod">Awakening</span> (<span class="ed-add">potential</span>) <span class="ed-add">MN 86</span>')
  })
  it('marks references, links resolvable ones and leaves links alone', () => {
    const abbrevs = parseDppnAbbrevs('<div id="Abbreviations"><p>SN=Saṁyutta Nikāya, 5 vols. (PTS). <br>\nJa=Jātaka, ed. Fausboll, 5 vols. <br>\nBarua, History. <br></p></div>')
    expect(abbrevs).toEqual({ SN: 'Saṃyutta Nikāya, 5 vols. (PTS)', Ja: 'Jātaka, ed. Fausboll, 5 vols' })
    const resolve = (b: string, v: number, p: number) => (b === 'SN' && v === 5 && p === 112 ? 'sn-5#7' : b === 'Ja' && p === 90 ? 'jat-1#2125' : null)
    expect(markRefs('SN.v.112; SN.i.3; (Ja 90) <a data-dict="x">SN.v.1</a>', abbrevs, 'dppn', resolve).html).toBe(
      '<a data-ref="sn-5#7"><abbr data-a="SN">SN</abbr>.v.112</a>; <abbr data-a="SN">SN</abbr>.i.3; (<a data-ref="jat-1#2125"><abbr data-a="Ja">Ja</abbr> 90</a>) <a data-dict="x">SN.v.1</a>')
  })
  it('pts style references need a volume for one letter books', () => {
    expect(markRefs('S I 166; A 5; Dhp 320', { S: 'Saṃyutta', A: 'Aṅguttara', Dhp: 'Dhammapada' }, 'pts').html)
      .toBe('<abbr data-a="S">S</abbr> I 166; A 5; <abbr data-a="Dhp">Dhp</abbr> 320')
  })
})
