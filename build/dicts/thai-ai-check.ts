/**
 * Checks of an AI-revised BB entry (./thai-ai.ts), deterministic:
 *  - kept: how much of BB's text is still there (character 4-grams of the Thai letters), 1 without BB text
 *  - missingRefs: references of the English (volume/page or page) whose numbers are not in the Thai
 *  - unknownPali: Thai-script Pāḷi words (with pinthu / nikhahit, or bold) that are neither a word of the English
 *    entry nor a DPD word form
 *  - issues: private use glyphs, a pinthu before a vowel, Latin letters the English does not have, an empty entry
 */
import { fold } from '../../shared/normalize'
import { romanToInt } from './refs'
import { aiText } from './thai-ai'
import { toRoman } from './thai-pts'

export interface ThaiCheck { kept: number; missingRefs: string[]; unknownPali: string[]; issues: string[] }

const grams = (s: string) => {
  const t = s.replace(/[^ก-๎]/g, '')
  const out = new Set<string>()
  for (let i = 0; i + 4 <= t.length; i++) out.add(t.slice(i, i + 4))
  return out
}

export function keptRatio(bb: string, out: string): number {
  const a = grams(bb)
  if (!a.size) return 1
  const b = grams(out)
  let n = 0
  for (const g of a) if (b.has(g)) n++
  return n / a.size
}

/** books whose Roman numeral is part of the title (Pj II = Paramatthajotikā II), not a volume */
const TITLE_NUMERAL = new Set(['Pj', 'Nidd'])

export function englishRefs(en: string): { label: string; vol: number; page: number }[] {
  // verse numbers in superscript are not part of the page (Pv I 8<sup>06</sup>)
  const text = aiText(en.replace(/<sup>[^<]*<\/sup>/g, ' '))
  return [...text.matchAll(/(?<![\p{L}-])([A-Z][\w-]*) (?:([IVXL]+) )?(\d+)/gu)].map(m => ({
    label: m[0], vol: m[2] && !TITLE_NUMERAL.has(m[1]) ? romanToInt(m[2]) : 0, page: +m[3],
  }))
}

export function checkThai(out: string, en: string, bb: string, knownRoman: (w: string) => boolean): ThaiCheck {
  const text = aiText(out)
  const numText = aiText(out.replace(/<sup>[^<]*<\/sup>/g, ' ')) // verse numbers in superscript are not part of a page
  const issues: string[] = []
  if (!text.trim()) issues.push('empty')
  if (/[-]/.test(text)) issues.push('private use glyph')
  if (/ฺ(?=[ะ-ูํ็-๎])/.test(text)) issues.push('pinthu before a vowel')
  // a vowel or tone mark, nikhahit or pinthu with no letter to sit on (°ํ for °ṃ: the word is written out)
  if (/(?<![ก-ฮะ-ฺเ-๎])[ัิ-ฺ็-๎]/.test(text)) issues.push('Thai mark without a letter')
  if (text.includes('\ufffd')) issues.push('broken character')
  const enText = aiText(en)
  const enWords = new Set((enText.match(/[\p{L}\p{M}]+/gu) ?? []).map(w => fold(w.toLowerCase())))
  // Latin letters: words of the English, of BB, and abbreviations of English words (Goth. for Gothic, Dial. for Dialogues)
  const enList = [...enWords]
  for (const w of new Set((text.match(/[\p{Script=Latin}\p{M}]+/gu) ?? []).filter(w => /[A-Za-z]{4}/.test(w)))) { // Halāyudha whole
    const f = fold(w.toLowerCase())
    if (!enWords.has(f) && !aiText(bb).includes(w) && !enList.some(e => e.startsWith(f))) issues.push(`latin ${w}`)
  }
  // references: the numbers of each English reference should be in the Thai
  const nums = new Set<string>()
  for (const m of numText.matchAll(/(\d+)\/(\d+)/g)) nums.add(`${+m[1]}/${+m[2]}`)
  for (const m of numText.matchAll(/\d+/g)) nums.add(String(+m[0]))
  const missingRefs = englishRefs(en).filter(r => !(r.vol ? nums.has(`${r.vol}/${r.page}`) : nums.has(String(r.page)))).map(r => r.label)
  // Pāḷi: Thai words with pinthu or nikhahit, and bold words
  const pali = new Set<string>()
  for (const w of text.match(/[ก-๎]+/g) ?? []) if (/[ฺํ]/.test(w)) pali.add(w)
  for (const m of out.matchAll(/<b>([^<]*)<\/b>/g)) for (const w of m[1].match(/[ก-๎]+/g) ?? []) if (w.length > 1) pali.add(w)
  const unknownPali = [...pali].filter(w => {
    const r = toRoman(w.replace(/°/g, ''))
    return r.length > 2 && !enWords.has(fold(r)) && !knownRoman(r)
  })
  return { kept: keptRatio(bb, out), missingRefs, unknownPali, issues }
}
