import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { UI_LANGS, setUiLang, t } from './index'
import { checkTranslation, uiStrings } from './strings'

const dir = fileURLToPath(new URL('.', import.meta.url))
const strings = uiStrings(fileURLToPath(new URL('..', import.meta.url)))

describe('ui translations', () => {
  it('finds the strings of the code', () => {
    expect(strings).toContain('Settings')
    expect(strings).toContain('{0} matches in {1} texts')
  })
  for (const { code } of UI_LANGS.filter(l => l.code !== 'en')) {
    it(`${code}: every string translated, no unused keys, same placeholders`, () => {
      const tr = JSON.parse(fs.readFileSync(`${dir}/${code}.json`, 'utf8')) as Record<string, string>
      expect(checkTranslation(strings, tr)).toEqual({ missing: [], unused: [], placeholders: [] })
    })
  }
  it('translates with arguments and falls back to English', async () => {
    await setUiLang('si')
    expect(t('Settings')).not.toBe('Settings')
    expect(t('{0} matches in {1} texts', 5, 2)).toMatch(/5.*2|2.*5/)
    await setUiLang('en')
    expect(t('{0} matches in {1} texts', 5, 2)).toBe('5 matches in 2 texts')
  })
})
