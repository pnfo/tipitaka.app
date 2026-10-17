import { describe, expect, it } from 'vitest'
import { countryDefaults } from './country'

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
})
