import { describe, expect, it } from 'vitest'
import { markRefs, THAI_ABBREVS } from './refs'
import { batches, cleanAiHtml, promptForm, splitEnglish, units, type AiJob } from './thai-ai'
import { checkThai, keptRatio } from './thai-ai-check'
import { aiMarked } from './thai-pts'

describe('Thai references (BB notation)', () => {
  const resolve = (b: string, v: number, p: number) => (b === 'Ja' && v === 1 && p === 9 ? 'jat#9' : b === 'Pp' && p === 25 ? 'pp#3' : null)
  it('marks volume/page and single volume references, links what resolves', () => {
    expect(markRefs('ตาขอ ชา.1/9 (ปจฺฉิ); วิ.2/196; สุตฺ.นิ.452; (นปุํ.) ปุํ.25', THAI_ABBREVS, 'thai', resolve).html).toBe(
      'ตาขอ <a data-ref="jat#9"><abbr data-a="ชา.">ชา.</abbr>1/9</a> (ปจฺฉิ); <abbr data-a="วิ.">วิ.</abbr>2/196; ' +
      '<abbr data-a="สุตฺ.นิ.">สุตฺ.นิ.</abbr>452; (นปุํ.) <a data-ref="pp#3"><abbr data-a="ปุํ.">ปุํ.</abbr>25</a>')
  })
  it('prefers the longer abbreviation', () => {
    expect(markRefs('ธ.อ.3/104', THAI_ABBREVS, 'thai').html).toBe('<abbr data-a="ธ.อ.">ธ.อ.</abbr>3/104')
  })
})

describe('AI jobs', () => {
  it('prompt form keeps only the text markup', () => {
    expect(promptForm('<p><span class="dict-head">and <b>Kalya</b></span> well <a data-ref="x#1"><abbr data-a="Vin">Vin</abbr> I 291</a>.</p>'))
      .toBe('and <b>Kalya</b> well Vin I 291.')
  })
  it('splits long entries before compounds', () => {
    const html = 'head ' + 'x'.repeat(50) + Array.from({ length: 6 }, (_, i) => `<br> -<b>c${i}</b> ` + 'y'.repeat(40)).join('')
    const parts = splitEnglish(html, 120)
    expect(parts.join('')).toBe(html)
    expect(parts.length).toBeGreaterThan(2)
    for (const p of parts.slice(1)) expect(p).toMatch(/^<br> -<b>/)
  })
  it('batches small units and keeps long ones alone, in parts', () => {
    const job = (id: string, n: number): AiJob => ({ id, en: [{ hom: 0, html: 'e'.repeat(n) }], th: [{ word: id, html: 'ท'.repeat(n), raw: '' }], src: id })
    const us = units([job('a', 100), job('b', 200), job('c', 2000)])
    expect(batches(us).map(b => b.map(u => u.id))).toEqual([['c'], ['a', 'b']])
    const long = units([{ id: 'k', en: [{ hom: 0, html: 'z'.repeat(9000) + '<br> -<b>q</b> ' + 'z'.repeat(9000) }], th: [], src: 'k' }])
    expect(long.map(u => u.id)).toEqual(['k#0.1', 'k#0.2'])
    expect(long[0].en[0].part).toEqual([1, 2])
  })
})

describe('AI answers', () => {
  it('keep only the allowed markup, balanced', () => {
    expect(cleanAiHtml('<p>ก <b>ข</b> <span class="ai-add">ค <i>ง</span> <a href="x">จ</a> & <br/></b><b>ฉ')).toBe('ก <b>ข</b> <span class="ai-add">ค <i>ง</i></span> จ &amp; <br><b>ฉ</b>')
  })
  it('get a tappable marker on translated passages', () => {
    expect(aiMarked('ก <span class="ai-add">ข</span>')).toBe('ก <span class="ai-add"><span class="ai-mark">AI</span>ข</span>')
  })
  it('are checked', () => {
    const bb = '(คุณ.) [เทียบ สัน. กลฺย] สบาย, มีสุขภาพดี, แข็งแรง วิ.1/291.'
    expect(keptRatio(bb, bb)).toBe(1)
    expect(keptRatio(bb, 'อื่น ๆ ทั้งหมด')).toBeLessThan(0.2)
    const c = checkThai('(คุณ.) สบาย วิ.1/291. <span class="ai-add">ฉลาด มิลินฺ.48</span>', '(adjective) well Vin I 291. clever Miln 48, 87; D I 168', bb, () => false)
    expect(c.missingRefs).toEqual(['D I 168'])
    expect(c.issues).toEqual([])
    expect(checkThai('ปติฏฺาสิ Xqeoc', 'Greek ὦμος', '', () => false).issues).toEqual(['pinthu before a vowel', 'latin Xqeoc'])
  })
})
