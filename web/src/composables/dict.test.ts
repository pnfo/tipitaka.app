// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanMeaning, convHtml } from './dict'

describe('cleanMeaning', () => {
  it('keeps the canonical markup', () => {
    const html = 'see <a data-dict="akitti" data-hom="2">Akitti</a> <abbr data-a="SN">SN</abbr> <span class="ed-mod" data-orig="Ill">suffering</span>'
    expect(cleanMeaning(html)).toBe(html)
  })
  it('drops scripts, hrefs, styles and other attributes', () => {
    expect(cleanMeaning('<a href="javascript:x" data-dict="a" onclick="x">a</a><script>x</script><span style="color:red" data-x="1">b</span>'))
      .toBe('<a data-dict="a">a</a><span>b</span>')
  })
})

describe('convHtml', () => {
  it('converts only the text', () => {
    expect(convHtml('<b>dhamma</b> ca', s => s.toUpperCase())).toBe('<b>DHAMMA</b> CA')
  })
})
