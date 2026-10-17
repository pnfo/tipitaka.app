import { describe, expect, it } from 'vitest'
import { androidSegments, fixHa, fixZawgyi, splitsOf } from './myanmar'

describe('my-android', () => {
  const known = (w: string) => ['vaḍḍhati', 'vaḍḍhana', 'ruhati'].includes(w)
  it('restores ဍ္ဎ that became ှ, only when that makes a Pāḷi word', () => {
    expect(fixHa('ကမလေ ရုဟတိ ဝှတီတိ-ရောဟိဏီ ဝှန', known)).toEqual({ text: 'ကမလေ ရုဟတိ ဝဍ္ဎတီတိ-ရောဟိဏီ ဝဍ္ဎန', fixed: 2 })
    expect(fixHa('ဝှက် မှန်', known).fixed).toBe(0) // Burmese words
  })
  it('converts the Zawgyi kinzi', () => {
    expect(fixZawgyi('(အဂ္ဂ+အကုၤရ) အဂုၤလိ-က').text).toBe('(အဂ္ဂ+အင်္ကုရ) အင်္ဂုလိ-က')
    expect(fixZawgyi('အဂ ႍ').text).toBe('အင်္ဂံ')
    expect(fixZawgyi('သချုႋင်း').text).toBe('သင်္ချိုင်း') // cemetery: the i after the medial, before the u
    expect(fixZawgyi('စကြ ႍမ').text).toBe('စင်္ကြံမ')
  })
  it('puts the source segments on lines of their own, named', () => {
    expect(androidSegments('ထီ ။ က♦မြ+ (ဣ) နွားမ။♦စိန်')).toBe(
      'ထီ ။ က <span class="lnum">(တိပိဋက ပါဠိ-မြန်မာ အဘိဓာန်)</span><br>(ဣ) နွားမ။ <span class="lnum">(ဦးဟုတ်စိန်)</span>')
  })
})

describe('breakups (PCED Pali Word Grammar)', () => {
  it('keep the splits of the word', () => {
    expect(splitsOf('rohiṇī', 'ruha+ṇī+inī. na- ṇa-pru. tamale ruhati vaḍḍhatīti rohiṇī.')).toEqual(['ruha+ṇī+inī'])
    expect(splitsOf('cūḷakammavibhaṅga', 'cūḷa+kammavibhaṅga')).toEqual(['cūḷa+kammavibhaṅga'])
    expect(splitsOf('rohiṇī', 'kamma+vipākassa+ca')).toEqual([])
  })
})
