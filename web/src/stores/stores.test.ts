// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { DEFAULTS, SETTINGS_KEY, guessFromBrowser, loadSettings, migrateV2, themeClass, useSettings } from './settings'
import { BOOKMARKS_KEY, useLibrary } from './library'
import { MAX_TABS, TABS_KEY, useTabs } from './tabs'
import type { Api } from '@/data/api'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('settings', () => {
  it('maps the themes to the class of <html>; auto follows the system', () => {
    expect(themeClass('light')).toBe('')
    expect(themeClass('sepia')).toBe('theme-sepia') // not Tailwind's "sepia" filter utility
    expect(themeClass('green')).toBe('theme-green')
    expect(themeClass('dark')).toBe('dark')
    expect(themeClass('auto', true)).toBe('dark')
    expect(themeClass('auto', false)).toBe('')
  })
  it('migrates the v2 settings', () => {
    expect(migrateV2({ paliScript: 'si', uiLanguage: 'si', dictList: ['en-pts'], colorTheme: 'dark', tabViewFormat: 'columns' }))
      .toEqual({ script: 'sinh', uiLang: 'si', dicts: ['dpd', 'en-pts'], theme: 'dark', tabView: 'columns' })
    expect(migrateV2({ footnoteFormat: 'none' }).notes).toBe('hidden') // v2 "Do Not Show"
    expect(migrateV2({ footnoteFormat: 'inline' }).notes).toBe('inline')
    localStorage.setItem('settings', JSON.stringify({ paliScript: 'my' }))
    expect(loadSettings().script).toBe('mymr')
  })
  it('maps dictionaries replaced by a newer edition', () => {
    expect(migrateV2({ dictList: ['en-buddhadatta', 'en-pts'] }).dicts).toEqual(['dpd', 'en-ncped', 'en-pts'])
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ dicts: ['dpd', 'en-buddhadatta', 'en-ncped'] }))
    expect(loadSettings().dicts).toEqual(['dpd', 'en-ncped'])
  })
  it('falls back to defaults and guesses from the browser language', () => {
    expect(loadSettings()).toMatchObject({ ...DEFAULTS, ...guessFromBrowser() })
    expect(guessFromBrowser(['th-TH'])).toEqual({ script: 'thai', uiLang: 'th' })
    expect(guessFromBrowser(['fr'])).toEqual({})
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ script: 'bogus' }))
    expect(loadSettings().script).toBe('latn')
  })
  it('persists changes', async () => {
    const s = useSettings()
    s.textSize = 22
    await nextTick()
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).textSize).toBe(22)
  })
})

describe('library', () => {
  it('toggles bookmarks and keeps a bounded history', async () => {
    const lib = useLibrary()
    lib.toggleBookmark({ key: 'dn-1-1', para: 3, title: 't', path: 'p' })
    expect(lib.isBookmarked('dn-1-1')).toBe(true)
    lib.toggleBookmark({ key: 'dn-1-1', para: 3, title: 't', path: 'p' })
    expect(lib.isBookmarked('dn-1-1')).toBe(false)
    for (let i = 0; i < 50; i++) lib.visit({ key: `k${i % 45}`, title: '', path: '', para: 0 })
    expect(lib.history.length).toBe(40)
    expect(lib.history[0].key).toBe('k4')
  })
  it('imports v2 bookmarks through the legacy map', async () => {
    localStorage.setItem('bookmarks', JSON.stringify({ 'aa1,5': 1000, 'zz9,1': 2000 }))
    const api = {
      legacy: async (file: string) => { if (file === 'zz9') throw new Error('unmapped'); return { key: 'dn-1-1', para: 7 } },
      node: async () => ({ title: '1. Brahmajālasuttaṃ', bookTitle: 'Sīlakkhandhavaggapāḷi' }),
    } as unknown as Api
    const lib = useLibrary()
    expect(await lib.migrateV2(api)).toBe(1)
    expect(lib.bookmarks[0]).toMatchObject({ key: 'dn-1-1', para: 7, added: 1000 })
    expect(localStorage.getItem('bookmarks')).toBeNull()
    await nextTick()
    expect(JSON.parse(localStorage.getItem(BOOKMARKS_KEY)!)).toHaveLength(1)
  })
})

describe('tabs', () => {
  it('opens new tabs, reuses open texts, replaces in place, closes', async () => {
    const tabs = useTabs()
    tabs.open('dn-1-1', { newTab: true })
    tabs.open('dn-1-2', { newTab: true })
    expect(tabs.tabs.map(t => t.key)).toEqual(['dn-1-1', 'dn-1-2'])
    tabs.open('dn-1-1', { newTab: true, target: 30 })
    expect(tabs.tabs).toHaveLength(2)
    expect(tabs.active?.key).toBe('dn-1-1')
    expect(tabs.active?.target).toBe(30)
    tabs.open('mn-1-1-1', { newTab: false })
    expect(tabs.tabs.map(t => t.key)).toEqual(['mn-1-1-1', 'dn-1-2'])
    tabs.close(tabs.activeId)
    expect(tabs.tabs.map(t => t.key)).toEqual(['dn-1-2'])
    tabs.close(tabs.activeId) // the last tab stays
    expect(tabs.tabs).toHaveLength(1)
    for (let i = 0; i < MAX_TABS + 3; i++) tabs.open(`k${i}`, { newTab: true })
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(TABS_KEY)!).tabs).toHaveLength(MAX_TABS)
  })
  it('restores saved tabs', () => {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: [{ id: 4, key: 'a', current: 'a-1', para: 7 }, { id: 9, key: 'b', current: 'b' }], active: 9 }))
    const tabs = useTabs()
    expect(tabs.active?.key).toBe('b')
    expect(tabs.tabs[0]).toMatchObject({ current: 'a-1', para: 7 })
    expect(tabs.open('c', { newTab: true }).id).toBe(10)
  })
})
