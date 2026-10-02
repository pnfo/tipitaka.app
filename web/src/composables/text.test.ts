import { describe, expect, it } from 'vitest'
import { convert } from '@pnfo/pali-converter'
import { markWords, paraClass, paraHtml, wordsRegex } from './text'

describe('highlighting', () => {
  it('marks whole words only, with wildcards', () => {
    const re = wordsRegex(['dhamma', 'bhik*'])
    expect(markWords('dhamma dhammassa bhikkhave', re)).toBe('\u0001dhamma\u0002 dhammassa \u0001bhikkhave\u0002')
    expect(markWords('Dhamma.', re)).toBe('\u0001Dhamma\u0002.')
    expect(wordsRegex([])).toBeNull()
  })
  it('survives script conversion and becomes <mark>', () => {
    const html = paraHtml({ i: 0, k: 'x', r: 'bodytext', n: '12', t: 'evaṃ **dhammassa** {var}' }, s => convert(s, 'sinh', 'latn'),
      { notes: 'hidden', pageRefs: '', paraNums: true, highlight: wordsRegex(['dhammassa']) })
    expect(html).toContain('<b><mark>ධම්මස්ස</mark></b>')
    expect(html).toMatch(/^<span class="num" data-num="12">/)
    expect(html).not.toContain('var')
  })
  it('classes headings', () => {
    expect(paraClass({ i: 0, k: '', r: 'chapter', t: '' })).toBe('para chapter heading')
    expect(paraClass({ i: 0, k: '', r: 'gatha1', t: '' })).toBe('para gatha1')
  })
})
