import { describe, expect, it } from 'vitest'
import { foldName, sameName } from './text-index'

describe('section names', () => {
  it('fold numbering, diacritics and the ending', () => {
    expect(foldName('11. Bhadrakasuttaṃ')).toBe('bhadraka')
    expect(foldName('10. Akataññujātakavaṇṇanā')).toBe('akatannu')
  })
  it('match a name of the reference to a section on the cited page', () => {
    expect(sameName('4. Amaccharīsuttaṃ', 'amaccharīsutta')).toBe(true)
    expect(sameName('12. Rāsiyasuttaṃ', 'Rāsiya')).toBe(true)
    expect(sameName('11. Bhadrakasuttaṃ', 'Bhadragaka')).toBe(true) // DPPN's spelling
    expect(sameName('10. Tapussasuttaṃ', 'Tapassu')).toBe(true)
    expect(sameName('10. Maṇicūḷakasuttaṃ', 'Bhadragaka')).toBe(false)
    expect(sameName('9. Nāgasuttaṃ', 'Ānanda')).toBe(false)
  })
})
