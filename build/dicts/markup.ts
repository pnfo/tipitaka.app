/**
 * The canonical markup of dictionary meanings (db/dict.db entry.meaning), rendered by web/src/components/DictView.vue:
 *   b i em strong u br p hr sup sub ul ol li blockquote table tr td
 *   <a data-dict="word" data-hom="2">     cross reference: looks the word up (homonym number optional)
 *   <a data-ref="SN 5 112">               text reference: opens the text (build/pts-books.ts, server ref op)
 *   <abbr data-a="SN">                    abbreviation: the dictionary's list (dict_abbrev) explains it
 *   <span class="ed-add">                 editor's addition or correction (Ānandajoti's revisions)
 *   <span class="ed-mod" data-orig="..">  editor's modernised wording (original wording, if known)
 *   <span class="sc">  small caps   <span class="lnum">  CPD line number   <span class="gram">  grammar label
 * normalizeMeaning converts the custom tags of the v2 dictionaries to it.
 */
import { convert } from '@pnfo/pali-converter'

/** Sinhala script Pali word -> lower case Roman */
export const sinhToRoman = (w: string) => convert(w, 'latn', 'sinh').toLowerCase().trim()

export const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
export const stripTags = (html: string) => html.replace(/<[^>]*>/g, '')
/** the niggahita of the VRI texts: ṁ / ŋ -> ṃ */
export const niggahita = (s: string) => s.replace(/ṁ/g, 'ṃ').replace(/Ṁ/g, 'Ṃ').replace(/ŋ/g, 'ṃ')

const BETA: Record<string, string> = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', v: 'ϝ', z: 'ζ', h: 'η', q: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', c: 'ξ',
  o: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', u: 'υ', f: 'φ', x: 'χ', y: 'ψ', w: 'ω',
}
const BETA_MARK: Record<string, string> = { ')': '̓', '(': '̔', '/': '́', '\\': '̀', '=': '͂', '|': 'ͅ', '+': '̈', _: '̄' }

/** Greek in Beta Code (the DSAL / DPR PTS dictionary's <at> tag): w)_mos -> ὦμος */
export function betaToGreek(beta: string): string {
  let out = ''
  let upper = false
  let pending = '' // breathings / accents written before a capital (*)/arhs)
  for (let i = 0; i < beta.length; i++) {
    const ch = beta[i]
    if (ch === '*') { upper = true; continue }
    const mark = BETA_MARK[ch]
    if (mark && (upper || /[\p{L}\p{M}]$/u.test(out))) {
      if (upper) pending += mark
      else out += mark
      continue
    }
    const g = BETA[ch.toLowerCase()]
    if (g) {
      out += (upper ? g.toUpperCase() : g) + pending
      upper = false
      pending = ''
    } else out += ch
  }
  // final sigma
  return out.replace(/σ(?![\p{L}\p{M}])/gu, 'ς').normalize('NFC')
}

/** the custom tags and inline styles of the v2 dictionaries -> canonical markup */
export function normalizeMeaning(html: string): string {
  return html
    .replace(/<at>(.*?)<\/at>/g, (_, b: string) => betaToGreek(b))
    .replace(/<smallcaps>/g, '<span class="sc">').replace(/<\/smallcaps>/g, '</span>')
    .replace(/<ref target="([^"]*)">/g, (_, w: string) => `<a data-dict="${escapeAttr(w)}">`).replace(/<\/ref>/g, '</a>')
    .replace(/<see>(.*?)<\/see>/g, (_, w: string) => `<a data-dict="${escapeAttr(stripTags(w))}">${w}</a>`)
    .replace(/<r (?:c1|\d)>(.*?)<\/r>/g, '<span class="gram">$1</span>')
    .replace(/<span style="font-size: ?85%;?">/g, '<span class="lnum">')
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
}
