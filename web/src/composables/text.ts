/** helpers for rendering paragraphs: html, search highlights and the word under a click */
import { escapeHtml, markupToHtml, type RenderOptions, type Span } from '@shared/markup'
import type { Para } from '@/data/types'

export const HEADINGS = new Set(['book', 'chapter', 'title', 'subhead', 'subsubhead'])
const MARK_OPEN = '\u0001', MARK_CLOSE = '\u0002'

/** wraps whole words of the set in markers that survive script conversion (become <mark>) */
export function markWords(text: string, re: RegExp | null): string {
  if (!re) return text
  return text.replace(re, (_m, pre: string, w: string) => `${pre}${MARK_OPEN}${w}${MARK_CLOSE}`)
}

/** regex matching any of the (Roman, lower case) words; * is a wildcard */
export function wordsRegex(words: string[]): RegExp | null {
  const ws = words.map(w => w.trim()).filter(Boolean)
  if (!ws.length) return null
  const esc = ws.map(w => w.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\p{L}\\p{M}]*'))
  return new RegExp(`(^|[^\\p{L}\\p{M}])(${esc.join('|')})(?=[^\\p{L}\\p{M}]|$)`, 'giu')
}

export interface ParaRenderOptions extends RenderOptions { paraNums: boolean; highlight: RegExp | null }

/** spans: commentary alignment underlines (composables/glosses.ts) */
export function paraHtml(p: Para, convert: (s: string) => string, o: ParaRenderOptions, spans?: Span[]): string {
  const conv = o.highlight ? (s: string) => convert(markWords(s, o.highlight)) : convert
  let html = markupToHtml(p.t, { ...o, convert: conv, spans })
  if (o.highlight) html = html.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>')
  if (o.paraNums && p.n) html = `<span class="num" data-num="${escapeHtml(p.n)}">${escapeHtml(convert(p.n))}</span>${html}`
  return html
}

export function paraClass(p: Para): string {
  return `para ${p.r}${HEADINGS.has(p.r) ? ' heading' : ''}${p.n ? ' has-num' : ''}`
}

const isWordChar = (c: string) => {
  const code = c.charCodeAt(0)
  // surrogates: Brahmi, Chakma are outside the BMP; ZWJ/ZWNJ appear inside Sinhala/Myanmar words
  return (code >= 0xd800 && code <= 0xdfff) || code === 0x200c || code === 0x200d || /[\p{L}\p{M}]/u.test(c)
}

/** the word under a screen point (in the displayed script) and its range */
export function wordAtPoint(x: number, y: number): { word: string; range: Range } | null {
  let node: Node | null = null
  let offset = 0
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p) { node = p.offsetNode; offset = p.offset }
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y)
    if (r) { node = r.startContainer; offset = r.startOffset }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  let s = offset, e = offset
  while (s > 0 && isWordChar(text[s - 1])) s--
  while (e < text.length && isWordChar(text[e])) e++
  if (s === e) return null
  const range = document.createRange()
  range.setStart(node, s)
  range.setEnd(node, e)
  return { word: text.slice(s, e), range }
}
