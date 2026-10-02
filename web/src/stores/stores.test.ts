// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { DEFAULTS, SETTINGS_KEY, guessFromBrowser, loadSettings, migrateV2, useSettings } from './settings'
import { BOOKMARKS_KEY, useLibrary } from './library'
import type { Api } from '@/data/api'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('settings', () => {
  it('migrates the v2 settings', () => {
    expect(migrateV2({ paliScript: 'si', uiLanguage: 'si', dictList: ['en-pts'], colorTheme: 'dark' }))
      .toEqual({ script: 'sinh', uiLang: 'si', dicts: ['dpd', 'en-pts'], theme: 'dark' })
    localStorage.setItem('settings', JSON.stringify({ paliScript: 'my' }))
    expect(loadSettings().script).toBe('mymr')
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
