import { describe, expect, it } from 'vitest'
import { glossSpans, increasingChain, mapY, type Anchors } from './glosses'
import type { Gloss } from '@/data/types'

const anchors = (list: [number, number[]][]): Anchors => {
  const byId = new Map<number, number>()
  for (const [y, ids] of list) for (const g of ids) if (!byId.has(g)) byId.set(g, y)
  return { ys: list.map(x => x[0]), ids: list.map(x => x[1]), byId, height: 10000 }
}

describe('gloss spans', () => {
  it('cuts spans over several paragraphs at the paragraph ends', () => {
    const g = { g: 5, side: 't', i: 3, s: 10, ei: 5, e: 4, kind: 'mula-atta', src: 'lemma', conf: 1 } as Gloss
    const m = glossSpans([g])
    expect(m.get(3)![0]).toMatchObject({ s: 10, id: '5', cls: 'gl-atta gl-src-lemma' })
    expect(m.get(4)![0].s).toBe(0)
    expect(m.get(5)![0]).toMatchObject({ s: 0, e: 4 })
  })
})

describe('column sync', () => {
  it('interpolates between the anchors both columns have', () => {
    const src = anchors([[0, [1]], [100, [2]], [200, [3]]])
    const dst = anchors([[50, [1]], [450, [2]], [500, [3]]])
    expect(mapY(src, dst, 50)).toBe(250)
    expect(mapY(src, dst, 150)).toBe(475)
  })
  it('ignores anchors out of order (a word explained again elsewhere)', () => {
    const src = anchors([[0, [1]], [100, [2]], [200, [3]], [300, [4]]])
    const dst = anchors([[0, [1]], [9000, [2]], [200, [3]], [300, [4]]])
    expect(mapY(src, dst, 150)).toBe(150)
    expect(increasingChain([[0, 0], [1, 9], [2, 2], [3, 3]])).toEqual([[0, 0], [2, 2], [3, 3]])
  })
  it('has no position without common anchors', () => {
    expect(mapY(anchors([[0, [1]]]), anchors([[0, [2]]]), 10)).toBeNull()
  })
})
