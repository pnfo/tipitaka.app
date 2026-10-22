import { describe, expect, it } from 'vitest'
import { countryDefaults, isPersonsBrowser } from './country'

const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch

describe('country defaults (first visit)', () => {
  it('maps the listed countries to a script and an interface language', async () => {
    expect(await countryDefaults(answer({ country: 'LK' }))).toEqual({ script: 'sinh', uiLang: 'si' })
    expect(await countryDefaults(answer({ country: 'IN' }))).toEqual({ script: 'deva', uiLang: 'hi' })
    expect(await countryDefaults(answer({ country: 'MM' }))).toEqual({ script: 'mymr', uiLang: 'my' })
    expect(await countryDefaults(answer({ country: 'TH' }))).toEqual({ script: 'thai', uiLang: 'th' })
    expect(await countryDefaults(answer({ country: 'CN' }))).toEqual({ script: 'latn', uiLang: 'ch' })
  })
  it('keeps the browser guess elsewhere and when the lookup fails', async () => {
    expect(await countryDefaults(answer({ country: 'US' }))).toBeNull()
    expect(await countryDefaults(answer({}, false))).toBeNull()
    expect(await countryDefaults((async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
    const never = (() => new Promise(() => {})) as unknown as typeof fetch
    expect(await countryDefaults(never, 20)).toBeNull()
  })
  it('does not ask for crawlers or without a working localStorage', () => {
    const mem = () => { const m = new Map<string, string>(); return { setItem: (k: string, v: string) => void m.set(k, v), getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) } }
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
    expect(isPersonsBrowser(chrome, mem())).toBe(true)
    expect(isPersonsBrowser('Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', mem())).toBe(false)
    expect(isPersonsBrowser('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/141.0 Safari/537.36', mem())).toBe(false)
    expect(isPersonsBrowser('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36', mem())).toBe(false)
    expect(isPersonsBrowser(chrome, null)).toBe(false)
    expect(isPersonsBrowser(chrome, { setItem: () => { throw new Error('quota') }, getItem: () => null, removeItem: () => {} })).toBe(false)
    expect(isPersonsBrowser(chrome, { setItem: () => {}, getItem: () => null, removeItem: () => {} })).toBe(false) // not kept
  })
})
