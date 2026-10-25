import { describe, expect, it } from 'vitest'
import { classifyDppn, dppnBase, firstSentence, inflect, patternsFor, readTemplates, sandhi } from './dppn'
import { AFTER_NAME, BEFORE_NAME, confirmedByRule, wordForm, type Occurrence } from './mentions'
import { rankEntities, type Entity, type Form } from './gazetteer'
import { translateEntity } from './translations'
import { shownFamily } from '../../shared/names'

describe('DPPN names', () => {
  it('reads the type from the first sentence', () => {
    expect(classifyDppn('ekadvāra', 'A vihāra built by King Subha to the east of Anurādhapura.').type).toBe('place')
    expect(classifyDppn('raṭṭhapāla', 'A monk in the time of Padumuttara Buddha.').type).toBe('person')
    expect(classifyDppn('suciloma', 'A Yakkha.').type).toBe('deity')
    expect(classifyDppn('maṇi-akkhi', 'A Nāga king of Kalyāṇi, maternal uncle of Mahodara.').type).toBe('deity')
    expect(classifyDppn('guḷavaṇṇa', 'A horse belonging to King Kuṭakaṇṇatissa.').type).toBe('animal')
    expect(classifyDppn('sukkā', 'A class of Devas who were present at the preaching.').type).toBe('deity')
    expect(classifyDppn('sunīta thera', 'He belonged to a family of flower-scavengers in Rājagaha.').type).toBe('person')
    // the place or family an entry about someone names is not its type
    expect(classifyDppn('mahā rakkhita', 'He went after the Third Council to the Yona country, and there preached.').type).toBe('person')
    expect(classifyDppn('dhammā', 'She belonged to a respectable family in Sāvatthī.').type).toBe('person')
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
  it('a DPPN namesake is never picked over the DPD names (only an AI decision names it)', () => {
    const yasa: Entity = { slug: 'yasa', type: 'person', lemma: 'yasa', dpd: 1, family: 'names of monks', meaning: 'name of an arahant monk', freq: 9 }
    const palace: Entity = { slug: 'yasa-7', type: 'place', lemma: 'yasa 7', dpd: 0, family: 'DPPN: palace', meaning: 'A palace occupied by Kassapa Buddha.', freq: 0, namesake: true }
    const slave: Entity = { slug: 'punna-3-2', type: 'person', lemma: 'puṇṇa 3', dpd: 0, family: 'DPPN: slave', meaning: 'Slave of Meṇḍaka.', freq: 0, namesake: true }
    const kassapa: Entity = { slug: 'kassapa-1', type: 'person', lemma: 'kassapa 1', dpd: 2, family: 'previous Buddhas', meaning: '', freq: 0 }
    const mendaka: Entity = { slug: 'mendaka', type: 'person', lemma: 'meṇḍaka', dpd: 3, family: 'names of laypeople', meaning: '', freq: 0 }
    const all = ['person', 'place'] as Entity['type'][]
    expect(rankEntities({ entities: [yasa, palace], how: 'n', notNames: [] }, all, [kassapa]).best).toBe(yasa)
    expect(rankEntities({ entities: [yasa, slave], how: 'n', notNames: [] }, all, [mendaka]).best).toBe(yasa)
    const banker: Entity = { slug: 'ananda-10', type: 'person', lemma: 'ānanda 10', dpd: 0, family: 'DPPN: seṭṭhi', meaning: 'A banker of Sāvatthī.', freq: 0, namesake: true }
    expect(rankEntities({ entities: [yasa, banker], how: 'n', notNames: [] }, all, [], ['seṭṭhi'])).toEqual({ best: yasa, sure: false })
    expect(rankEntities({ entities: [banker], how: 'n', notNames: [] }, all).best).toBe(banker) // the only one
  })
  it('shows no category that repeats the type, in every language', () => {
    expect(shownFamily('place names; holy sites')).toBe('holy sites')
    expect(shownFamily('names of deities')).toBe('')
    const t = { meaning: new Map(), family: new Map([['place names; holy sites', 'ස්ථාන; පූජනීය ස්ථාන']]) }
    // (the items of a list translated as a whole, as readNameTranslations learns them)
    t.family.set('holy sites', 'පූජනීය ස්ථාන')
    const e: Entity = { slug: 'payaga-1', type: 'place', lemma: 'payāga 1', dpd: 1, family: 'place names; holy sites', meaning: '', freq: 0 }
    expect(translateEntity(t, e).family).toBe('පූජනීය ස්ථාන')
  })
})
