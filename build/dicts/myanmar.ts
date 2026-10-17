/**
 * The Pali-Myanmar dictionaries.
 *  - my-android (v2, the Pali Myanmar Dictionary Android app): an entry is segments of several source dictionaries,
 *    "text♦tag+text♦tag" (မြ the Tipiṭaka Abhidhān, စိန် U Hoke Sein, ချုပ်, ဝိ Visuddhārum). The segments are put on
 *    lines of their own with the source named. Its text went through a lossy Zawgyi conversion that turned the Pāḷi
 *    stack ဍ္ဎ (ḍḍh) into the medial ha ှ (ဝှတီတိ for ဝဍ္ဎတီတိ): a word with ှ becomes ဍ္ဎ when that makes it a DPD
 *    word form and it was not one (Burmese words, with asat ်, are left alone).
 *  - the breakups: the Pali Word Grammar of PCED (.cache/dicts/pced-my/pali-myanmar-uni.mdx), the clean source of
 *    the etymology brackets the v2 breakups were taken from: word, gender / word class, the splits (a+b) in Roman.
 */
import fs from 'node:fs'
import path from 'node:path'
import { convert } from '@pnfo/pali-converter'
import { readMdx } from './mdx'
import { readV2 } from './v2'
import type { DictRow, ImportCtx, ImportResult } from './types'

const SOURCES: Record<string, string> = { 'မြ': 'တိပိဋက ပါဠိ-မြန်မာ အဘိဓာန်', 'စိန်': 'ဦးဟုတ်စိန်', 'ဝိ': 'ဝိသုဒ္ဓါရုံ', 'ဝိသုဒ္ဓါရုံ': 'ဝိသုဒ္ဓါရုံ' }

/** a Myanmar-script word that may be Pāḷi -> is it a word form (also before the quotation ti / iti) */
function knownMy(word: string, knownRoman: (w: string) => boolean): boolean {
  const r = convert(word, 'latn', 'mymr').toLowerCase()
  return knownRoman(r) || knownRoman(r.replace(/īti$/, 'i')) || knownRoman(r.replace(/ti$/, '')) || knownRoman(r.replace(/(?<=[aiu])ti$/, ''))
}

/** ှ that stands for ဍ္ဎ */
export function fixHa(text: string, knownRoman: (w: string) => boolean): { text: string; fixed: number } {
  let fixed = 0
  const out = text.replace(/[က-႟]*ှ[က-႟]*/g, w => {
    if (w.includes('်') || knownMy(w, knownRoman)) return w
    const c = w.replace(/ှ/g, 'ဍ္ဎ')
    if (!knownMy(c, knownRoman)) return w
    fixed++
    return c
  })
  return { text: out, fixed }
}

/** the kinzi of the Zawgyi font left in the Unicode text: ၤ after its consonant (and vowels), ႋ ႌ ႍ kinzi with -i -ī -ṃ
 * (အကုၤရ -> အင်္ကုရ aṅkura, အဂုၤလိ -> အင်္ဂုလိ) */
export function fixZawgyi(text: string): { text: string; fixed: number } {
  let fixed = 0
  const out = text.replace(/([\u1000-\u1021\u103F])((?:[\u102B-\u103E] ?)*?) ?([\u1064\u108B-\u108D])/g, (_, c: string, marks: string, k: string) => {
    fixed++
    const signs = [...marks.replace(/ /g, '') + (({ '\u108B': 'ိ', '\u108C': 'ီ', '\u108D': 'ံ' } as Record<string, string>)[k] ?? '')]
    return `င်္${c}${signs.sort((x, y) => MARK_ORDER.indexOf(x) - MARK_ORDER.indexOf(y)).join('')}`
  })
  return { text: out, fixed }
}
/** the storage order of the signs after a consonant: medials, e, upper vowels, lower vowels, ai, ṃ, dot, asat, visarga */
const MARK_ORDER = '\u103B\u103C\u103D\u103E\u1031\u102D\u102E\u1032\u102F\u1030\u102B\u102C\u1036\u1037\u103A\u1038'

/** a Myanmar dictionary of v2 with the Zawgyi leftovers converted */
export function myanmarImporter(code: string) {
  return (ctx: ImportCtx): ImportResult => {
    let fixed = 0
    const rows = readV2(ctx.dictDir, code).map((r): DictRow => { const z = fixZawgyi(r.meaning); fixed += z.fixed; return { word: r.word, meaning: z.text } })
    if (fixed) ctx.log(`${code}: ${fixed} Zawgyi kinzi converted`)
    return { rows }
  }
}

/** "text♦tag+text♦tag" -> the segments, each on its own line with its source */
export function androidSegments(meaning: string): string {
  const segs = [...meaning.matchAll(/([\s\S]*?)♦([^+♦]+?)(?:\+|$)/g)].map(m => [m[1].trim(), m[2].trim()] as const).filter(([t]) => t)
  if (!segs.length) return meaning
  return segs.map(([t, tag]) => `${t} <span class="lnum">(${SOURCES[tag] ?? tag})</span>`).join('<br>')
}

export function importAndroid(ctx: ImportCtx, knownRoman: (w: string) => boolean): ImportResult {
  let fixed = 0
  const rows = readV2(ctx.dictDir, 'my-android').map((r): DictRow => {
    const z = fixZawgyi(r.meaning)
    const f = fixHa(z.text, knownRoman)
    fixed += f.fixed + z.fixed
    return { word: r.word, meaning: androidSegments(f.text) }
  })
  ctx.log(`my-android: ${rows.length} entries, ${fixed} words with ဍ္ဎ or a Zawgyi kinzi restored`)
  return { rows }
}

export interface GrammarBreakup { word: string; type: string; parts: string[] }

/** the splits of an etymology bracket that are this word's: same first letter, or same last letter and length */
export function splitsOf(word: string, bracket: string): string[] {
  const out: string[] = []
  for (const m of bracket.matchAll(/[a-zāīūṃṅñṭḍṇḷ√]+(?:\+[a-zāīūṃṅñṭḍṇḷ]+)+/g)) {
    const s = m[0].replace(/√/g, '')
    const flat = s.replace(/\+/g, '')
    let sim = 0
    if (s[0] === word[0]) sim++
    if (s.at(-1) === word.at(-1) || s.at(-1) === 'a') sim++
    if (flat.length >= word.length - 1 && flat.length < 2 * word.length) sim++
    if (sim >= 2 && !out.includes(s)) out.push(s)
  }
  return out
}

/** PCED's Pali Word Grammar: "rohiṇī(thī)<br> ရောဟိဏီ(ထီ)<br> «ruha+ṇī+inī. …]" */
export function readGrammarBreakups(cacheDir: string): GrammarBreakup[] | null {
  const f = path.join(cacheDir, 'pced-my', 'pali-myanmar-uni.mdx')
  if (!fs.existsSync(f)) return null
  const out = new Map<string, GrammarBreakup>() // the file repeats records
  for (const [, html] of readMdx(f).records) {
    if (!html.includes('Pali Word Grammar')) continue
    // "word(type)<br>  မြန်မာ(type)<br>  [roman bracket]" ("«" opens the bracket when it has notes)
    const head = /:\s*([^(<\s]+)(?:\(([^)]*)\))?<br>/.exec(html)
    const bracket = /<br>\s*[[«]([^\]]*\+[^\]]*)\]/.exec(html)
    if (!head || !bracket) continue
    const word = head[1].normalize('NFC').toLowerCase()
    const parts = splitsOf(word, bracket[1].normalize('NFC').toLowerCase())
    const key = `${word}|${parts.join(',')}`
    if (parts.length && !out.has(key)) out.set(key, { word, type: (head[2] ?? '').trim(), parts })
  }
  return [...out.values()]
}
