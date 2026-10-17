import { describe, expect, it } from 'vitest'
import { lcsPairs } from './diff'

const lcs = (a: string, b: string) => lcsPairs([...a], [...b]).map(([i]) => a[i]).join('')

describe('lcsPairs', () => {
  it('finds a longest common subsequence', () => {
    expect(lcs('abcabba', 'cbabac').length).toBe(4)
    expect(lcs('abc', 'abc')).toBe('abc')
    expect(lcs('abc', 'xyz')).toBe('')
    expect(lcs('', 'abc')).toBe('')
    expect(lcs('the cat sat', 'the bat sat on')).toBe('the at sat')
  })
  it('returns increasing pairs of equal items', () => {
    const a = 'kitten sitting'.split(''), b = 'sitting kitten'.split('')
    const p = lcsPairs(a, b)
    for (let i = 0; i < p.length; i++) {
      expect(a[p[i][0]]).toBe(b[p[i][1]])
      if (i) expect(p[i][0] > p[i - 1][0] && p[i][1] > p[i - 1][1]).toBe(true)
    }
  })
})
