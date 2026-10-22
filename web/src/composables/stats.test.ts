import { describe, expect, it } from 'vitest'
import { Tally, visitFlags, weekOf } from './stats'

const r = (name: string, path: string, q?: string) => ({ name, path, params: q === undefined ? {} : { q } as Record<string, string> })

describe('usage counts (stats.ts)', () => {
  it('groups days into weeks starting on Monday, as the server does', () => {
    expect(weekOf('2026-10-19')).toBe('2026-10-19') // Monday
    expect(weekOf('2026-10-25')).toBe('2026-10-19') // Sunday
    expect(weekOf('2026-11-01')).toBe('2026-10-26')
  })
  it('flags the first visit of the day, week and month', () => {
    expect(visitFlags('', '2026-10-22', true)).toEqual({ new: true, day: true, week: true, month: true })
    expect(visitFlags('2026-10-22', '2026-10-22', false)).toEqual({ new: false, day: false, week: false, month: false })
    expect(visitFlags('2026-10-20', '2026-10-22', false)).toEqual({ new: false, day: true, week: false, month: false })
    expect(visitFlags('2026-10-18', '2026-10-22', false)).toEqual({ new: false, day: true, week: true, month: false })
    expect(visitFlags('2026-09-30', '2026-10-01', false)).toEqual({ new: false, day: true, week: false, month: true })
  })
  it('counts pages, and only the last query of a search typed letter by letter', () => {
    const t = new Tally()
    t.route(r('home', '/latn'))
    t.route(r('read', '/latn/dn-1-1'), r('home', '/latn'))
    t.route(r('read', '/latn/dn-1-2'), r('read', '/latn/dn-1-1'))
    t.route(r('read', '/latn/dn-1-2'), r('read', '/latn/dn-1-2')) // hash only
    t.route(r('search', '/latn/search/dha', 'dha'), r('read', '/latn/dn-1-2'))
    t.route(r('search', '/latn/search/dhamma', 'dhamma'), r('search', '/latn/search/dha'))
    t.route(r('search', '/latn/search/dhammo', 'dhammo'), r('search', '/latn/search/dhamma')) // a new search
    t.route(r('dict', '/latn/dict/sati', 'sati'), r('search', '/latn/search/dhammo'))
    expect(t.take()).toEqual({ pages: { home: 1, read: 2, search: 1, dict: 1 }, terms: [['search', 'dhamma'], ['search', 'dhammo'], ['dict', 'sati']] })
    expect(t.take()).toBeNull()
  })
})
