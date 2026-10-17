import { describe, expect, it } from 'vitest'
import { classifyDppn, dppnBase, firstSentence, inflect, patternsFor, readTemplates, sandhi } from './dppn'
import { AFTER_NAME, BEFORE_NAME, confirmedByRule, wordForm, type Occurrence } from './mentions'
import { rankEntities, type Entity, type Form } from './gazetteer'

describe('DPPN names', () => {
  it('reads the type from the first sentence', () => {
    expect(classifyDppn('ekadvāra', 'A vihāra built by King Subha to the east of Anurādhapura.').type).toBe('place')
    expect(classifyDppn('raṭṭhapāla', 'A monk in the time of Padumuttara Buddha.').type).toBe('person')
    expect(classifyDppn('suciloma', 'A Yakkha.').type).toBe('deity')
    expect(classifyDppn('maṇi-akkhi', 'A Nāga king of Kalyāṇi, maternal uncle of Mahodara.').type).toBe('deity')
    expect(classifyDppn('guḷavaṇṇa', 'A horse belonging to King Kuṭakaṇṇatissa.').type).toBe('animal')
    expect(classifyDppn('sukkā', 'A class of Devas who were present at the preaching.').type).toBe('deity')
    expect(classifyDppn('sunīta thera', 'He belonged to a family of flower-scavengers in Rājagaha.').type).toBe('person')
    // texts, summaries and lists are no names
    expect(classifyDppn('dukkhasutta', 'The Buddha teaches suffering.').type).toBe('other')
    expect(classifyDppn('jīvaka', 'Preached at Jetavana to the wanderer Vacchagotta.').type).toBe('other')
    expect(classifyDppn('x', 'The second chapter of the Dukanipāta of the Aṅguttaranikāya.').type).toBe('other')
  })
  it('takes the first sentence without breaking at references', () => {
    expect(firstSentence('A tank in Ceylon, built by Upatissa II. Cv.xxxvii.185.')).toBe('A tank in Ceylon, built by Upatissa II.')
    expect(dppnBase('mahā devī')).toBe('mahādevī')
    expect(dppnBase('sunīta thera')).toBe('sunīta')
  })
  it('inflects with the DPD templates', () => {
    const t = readTemplates([
      { pattern: 'a masc', data: JSON.stringify([[[''], ['masc sg'], [''], ['masc pl'], ['']], [['nom'], ['o'], [''], ['ā'], ['']], [['acc'], ['aṃ'], [''], ['e'], ['']], [['gen'], ['assa'], [''], ['ānaṃ'], ['']]]) },
      { pattern: 'ā fem', data: JSON.stringify([[[''], ['fem sg'], [''], ['fem pl'], ['']], [['nom'], ['ā'], [''], ['āyo'], ['']], [['loc'], ['āya', 'āyaṃ'], [''], ['āsu'], ['']]]) },
    ])
    expect(patternsFor('kumbhaghosaka', 'person')).toEqual(['a masc'])
    expect(patternsFor('jetavana', 'place')).toEqual(['a masc', 'a nt'])
    const forms = inflect('kumbhaghosaka', ['a masc'], t)
    expect(forms).toEqual(expect.arrayContaining(['kumbhaghosako', 'kumbhaghosakaṃ', 'kumbhaghosakassa', 'kumbhaghosakanti', 'kumbhaghosakoti']))
    expect(inflect('sāmāvatī', ['ā fem'], t)).toEqual([]) // no ī fem template here: nothing invented
    expect(inflect('uttarā', ['ā fem'], t)).toEqual(expect.arrayContaining(['uttarā', 'uttarāyaṃ', 'uttarāyanti']))
    expect(sandhi('tissaṃ')).toEqual(expect.arrayContaining(['tissanti', 'tissañca', 'tissampi']))
  })
})

describe('mentions', () => {
  const occ = (prev: string, form: string, next: string) => ({ prev, form, next } as Occurrence)
  it('confirms ambiguous forms by an honorific or a personal title only', () => {
    expect(confirmedByRule(occ('āyasmā', 'ānando', 'bhagavantaṃ'))).toBe(true)
    expect(confirmedByRule(occ('atha', 'sakko', 'devānamindo'))).toBe(true)
    expect(confirmedByRule(occ('', 'sumano', 'thero'))).toBe(true)
    // definitions and common words after vocatives
    expect(confirmedByRule(occ('', 'loko', 'nāma'))).toBe(false)
    expect(confirmedByRule(occ('mahārāja', 'lokassa', 'dhammo'))).toBe(false)
    expect(confirmedByRule(occ('rājā', 'cakkavattī', 'sattahi'))).toBe(false)
    expect(BEFORE_NAME.has('bho')).toBe(false)
    expect(AFTER_NAME.test('brahmacariyaṃ')).toBe(false)
  })
  it('reads the word form of the markup', () => {
    const t = 'Atha kho āyasmā **ānando**’’ti |M1.0003|bhagavantaṃ'
    const s = t.indexOf('**ānando')
    expect(wordForm(t, s, t.indexOf('|M1') - 1)).toBe('ānandoti')
  })
  it('tells namesakes apart by the words next to them, else by DPD order', () => {
    const e = (slug: string, lemma: string, family: string): Entity => ({ slug, type: 'person', lemma, dpd: 1, family, meaning: '', freq: 0 })
    const king = e('brahmadatta-1', 'brahmadatta 1', 'names of royalty'), monk = e('brahmadatta-4', 'brahmadatta 4', 'names of monks; names of arahants')
    const f: Form = { entities: [monk, king], how: 'n', notNames: [] }
    expect(rankEntities(f, ['person'], [], ['bārāṇasiyaṃ', 'rajjaṃ'])).toEqual({ best: king, sure: true })
    expect(rankEntities(f, ['person'], [], ['āyasmā', 'thero'])).toEqual({ best: monk, sure: true })
    expect(rankEntities(f, ['person'], [], ['so', 'āha'])).toEqual({ best: king, sure: false })
  })
})
