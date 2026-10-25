import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileHelp } from '../../help'
import { UI_LANGS } from '@/i18n'

const dir = fileURLToPath(new URL('.', import.meta.url))
const read = (lang: string) => fs.readFileSync(`${dir}/${lang}.md`, 'utf8')
const ids = (html: string) => [...html.matchAll(/<h\d id="([^"]+)"/g)].map(m => m[1])
const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]).sort()

describe('help', () => {
  const en = compileHelp(read('en'))
  it('compiles: sections, icons, links', () => {
    expect(en.version).toBeGreaterThan(0)
    expect(en.toc.map(s => s.id)).toContain('v2')
    expect(en.html).toContain('<h2 id="search">')
    expect(en.html).toContain('class="help-icon"')
    expect(en.html).not.toMatch(/\{#|:[a-z-]+:(?![/\d])/)
  })
  it('links to sections and pages that exist', () => {
    for (const l of links(en.html)) {
      if (l.startsWith('#')) expect(ids(en.html)).toContain(l.slice(1))
      else if (l.startsWith('/')) expect(l).toMatch(/^\/(bookmarks|names|map|convert|settings|about)?$/)
    }
  })
  it('throws on an unknown icon', () => {
    expect(() => compileHelp('tap :no-such-icon:')).toThrow(/no-such-icon/)
  })
  // the ? links of the app point to the sections: every translation has the same ones
  for (const { code } of UI_LANGS.filter(l => l.code !== 'en' && fs.existsSync(`${dir}/${l.code}.md`))) {
    it(`${code}: same sections and links as the English`, () => {
      const tr = compileHelp(read(code))
      expect(ids(tr.html)).toEqual(ids(en.html))
      expect(links(tr.html)).toEqual(links(en.html))
      expect(tr.version).toBeGreaterThan(0)
    })
  }
})
