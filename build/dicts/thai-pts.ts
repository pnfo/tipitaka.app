/**
 * The Pali-Thai translation of the PTS dictionary (th-bhumibol, v2, extracted from a pdf) repaired:
 *  1. mechanical: the private use glyphs of the Thai pdf fonts (U+F700-F71A) -> Unicode, nikhahit + tone + aa -> tone + am
 *     (นํ้า -> น้ำ), nikhahit + aa -> am in Thai words, doubled tone marks, ‚…‛ quotes, a lone pinthu + nikhahit -> °
 *  2. with the English entry (the PTS of ./pts.ts, same headword): Pāli words that lost a consonant (pinthu followed by a
 *     vowel: ปติฏฺาสิ) are repaired when exactly one repair makes a word of the English entry (in Thai script) or else
 *     a known Pāli word form (DPD); the Greek of the etymologies, garbled into Latin letters (Gr. Xqeoc) or lost, is taken
 *     from the English entry (the homonym with the most cognates in common), aligning their Latin script words
 *  3. data/dict-fixes/th-bhumibol.tsv (word, from, to): manual fixes, applied last
 * Report: .cache/dicts/reports/th-bhumibol.tsv (what is still broken)
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { convert } from '@pnfo/pali-converter'
import { fold } from '../../shared/normalize'
import { lcsPairs } from './diff'
import { stripTags } from './markup'
import { readV2 } from './v2'
import { markRefs, THAI_ABBREVS, type Resolver } from './refs'
import { aiJobs, readAiStore, thaiKey, type AiResult } from './thai-ai'
import type { DictRow, ImportCtx, ImportResult } from './types'

/** the Thai glyph variants of the Microsoft / Adobe Thai fonts' private use area */
const PUA: Record<string, string> = {
  '': 'ฐ', '': 'ิ', '': 'ี', '': 'ึ', '': 'ื', '': '่', '': '้', '': '๊', '': '๋',
  '': '์', '': '่', '': '้', '': '๊', '': '๋', '': '์', '': 'ญ', '': 'ั', '': 'ํ',
  '': '็', '': '่', '': '้', '': '๊', '': '๋', '': '์', '': 'ุ', '': 'ู', '': 'ฺ',
}
const PINTHU = 'ฺ', NIKHAHIT = 'ํ'

/** step 1 */
export function thaiMechanical(s: string): string {
  return s
    .replace(/[-]/g, c => PUA[c])
    .replace(/ํฺํ|ํํ/g, NIKHAHIT) // doubled nikhahit (นปุํฺํ.)
    .replace(/(?<![\u0e01-\u0e2e\u0e30-\u0e39\u0e47-\u0e4e])ฺํ/g, '°') // the sign of an omitted part (เทียบ ฺํอาส = cf. °āsa)
    .replace(/ํ([่-๋])า/g, '$1ำ') // นํ้า -> น้ำ
    .replace(/[ก-๎]+/g, w => w.includes('ํา') ? w.replace(/ํา/g, w.includes(PINTHU) ? 'าํ' : 'ำ') : w)
    .replace(/([่-๋])\1+/g, '$1') // ใช้้ -> ใช้
    .replace(/([่-๋])([่-๋])/g, '$2') // two different tone marks: the later one (หม้่้อ)
    .replace(/‚/g, '“').replace(/‛/g, '”')
}

export const toThai = (roman: string) => convert(roman, 'thai', 'latn')
export const toRoman = (thai: string) => convert(thai, 'latn', 'thai').toLowerCase()

/** the places where a consonant is missing: after a pinthu, before a vowel or mark that follows a consonant
 * (เ แ โ ใ ไ are written before theirs: อกฺโกสติ is right) */
const GAP = /ฺ(?=[ะ-ูํ็-๎])/g

/** whether a known word occurs in s over the character at index at */
function coversKnown(s: string, at: number, known: Set<string>): boolean {
  for (const k of known) {
    if (k.length < 3) continue
    for (let i = s.indexOf(k); i >= 0 && i <= at; i = s.indexOf(k, i + 1)) if (i + k.length > at) return true
  }
  return false
}

/** step 2a: repairs a pinthu followed by a vowel or mark (never right). In Thai words (they have tone marks, Pāli never
 * does) the pinthu is dropped (คฺุ้มครอง). In Pāli words the repair (a missing consonant ปติฏฺาสิ, a vowel before its
 * consonant เสฏฺิฐี / วิญฺาญาเปติ, or a stray pinthu) is made when exactly one of them gives a known word: a word of
 * the English entry (known, Thai script) or a DPD word form (knownRoman). */
export function fillGaps(s: string, known: Set<string>, knownRoman: (w: string) => boolean): { html: string; fixed: number; left: string[] } {
  let fixed = 0
  const left: string[] = []
  const html = s.replace(/[\u0e01-\u0e4e]+/g, run => {
    if (!run.match(GAP)) return run
    const thai = /[่-๋์]/.test(run)
    let w = run
    for (const at of [...run.matchAll(GAP)].map(m => m.index! + 1).reverse()) { // at: after the pinthu
      if (thai) { w = w.slice(0, at - 1) + w.slice(at); fixed++; continue }
      if (at === 1) { w = w.replace(/^ฺ[\u0e31\u0e34-\u0e39\u0e47-\u0e4e]*/, ''); fixed++; continue } // no consonant: a stray glyph
      const cands = new Set<string>()
      for (let c = 0x0e01; c <= 0x0e2e; c++) cands.add(w.slice(0, at) + String.fromCharCode(c) + w.slice(at))
      cands.add(w.slice(0, at) + w.slice(at + 1)) // a vowel too many
      if (/[\u0e01-\u0e2e]/.test(w[at + 1] ?? '')) cands.add(w.slice(0, at) + w[at + 1] + w[at] + w.slice(at + 2)) // vowel before its consonant
      cands.add(w.slice(0, at - 1) + w.slice(at)) // a stray pinthu
      // spellings that read the same (อ is a vowel carrier: ญฺอา = ญา) count once: the shortest
      const pick = (ok: string[]) => new Set(ok.map(toRoman)).size === 1 ? ok.sort((a, b) => a.length - b.length)[0] : null
      const c = pick([...cands].filter(c => coversKnown(c, at, known))) ?? pick([...cands].filter(c => knownRoman(toRoman(c))))
      if (c) { w = c; fixed++ } else left.push(run)
    }
    return w
  })
  return { html, fixed, left }
}

/** abbreviations of the Thai etymologies (not cognates) */
const ETY_ABBR = new Set(['gr', 'lat', 'goth', 'ohg', 'ger', 'e', 'av', 'ags', 'lith', 'sk', 'idg', 'cp', 'oir', 'ir', 'mhg', 'nhg', 'got', 'gk', 'cf', 'see', 'and', 'also', 'q', 'v'])
const LATIN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+/g
const LATIN_GREEK = /[\p{Script=Latin}\p{Script=Greek}\p{M}]+/gu
const isGreek = (w: string) => /\p{Script=Greek}/u.test(w)
const etyNorm = (w: string) => (isGreek(w) ? w : fold(w.toLowerCase()))

/** the Latin script words of a Thai entry with their place in the html */
function latinTokens(html: string) {
  const segs = html.split(/(<[^>]*>)/)
  const toks: { t: string; seg: number; start: number; end: number }[] = []
  segs.forEach((s, i) => { if (!s.startsWith('<')) for (const m of s.matchAll(LATIN)) toks.push({ t: etyNorm(m[0]), seg: i, start: m.index!, end: m.index! + m[0].length }) })
  return { segs, toks }
}

/** how many cognates (Latin script words that are not abbreviations) two entries share: picks the English homonym */
export function cognates(th: string, en: string): number {
  const a = new Set((stripTags(th).match(LATIN) ?? []).map(etyNorm).filter(w => w.length > 2 && !ETY_ABBR.has(w)))
  let n = 0
  for (const w of new Set((stripTags(en).match(LATIN_GREEK) ?? []).map(etyNorm))) if (a.has(w)) n++
  return n
}

/** step 2b: the Greek of "Gr. <garbled or nothing>" from the English entry ("Greek ὦμος"): the Latin script words of
 * both are aligned; a gap with Thai "Gr." and English Greek words gets these (one for one when as many are garbled) */
export function etymology(th: string, en: string): { html: string; fixed: number } {
  const { segs, toks } = latinTokens(th)
  const enText = stripTags(en)
  const enToks = [...enText.matchAll(LATIN_GREEK)].map(m => ({ t: m[0], at: m.index! }))
  const pairs = lcsPairs(toks.map(t => t.t), enToks.map(t => etyNorm(t.t)))
  const edits: { seg: number; start: number; end: number; text: string }[] = []
  const bounds: [number, number][] = [[-1, -1], ...pairs, [toks.length, enToks.length]]
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [i0, j0] = bounds[k], [i1, j1] = bounds[k + 1]
    const thGap = toks.slice(i0 + 1, i1)
    const grs = thGap.filter(t => t.t === 'gr')
    if (grs.length !== 1) continue
    // the Greek words of the English gap (ἀ-μ(β)ροτ-ο is one word)
    const from = j0 >= 0 ? enToks[j0].at + enToks[j0].t.length : 0, to = j1 < enToks.length ? enToks[j1].at : enText.length
    const greek = enText.slice(from, to).match(/[\p{Script=Greek}][\p{Script=Greek}\p{M}()\-]*/gu) ?? []
    if (!greek.length) continue
    const gr = grs[0]
    const garbled: typeof thGap = []
    for (const t of thGap.slice(thGap.indexOf(gr) + 1)) { if (ETY_ABBR.has(t.t) || t.seg !== gr.seg || isGreek(t.t)) break; garbled.push(t) }
    if (garbled.length && garbled.length === greek.length) garbled.forEach((t, i) => edits.push({ seg: t.seg, start: t.start, end: t.end, text: greek[i] }))
    else if (garbled.length) edits.push({ seg: gr.seg, start: garbled[0].start, end: garbled[garbled.length - 1].end, text: greek.join(', ') })
    else if (!thGap.slice(thGap.indexOf(gr) + 1).some(t => isGreek(t.t) || /[\p{Script=Greek}]/u.test(segs[gr.seg].slice(gr.end, gr.end + 3)))) {
      const after = segs[gr.seg].slice(gr.end)
      const dot = /^\.?/.exec(after)![0].length
      edits.push({ seg: gr.seg, start: gr.end + dot, end: gr.end + dot, text: ' ' + greek.join(', ') + (/^\s*\p{L}/u.test(after.slice(dot)) ? ',' : '') })
    }
  }
  for (const e of edits.sort((a, b) => b.seg - a.seg || b.start - a.start)) segs[e.seg] = segs[e.seg].slice(0, e.start) + e.text + segs[e.seg].slice(e.end)
  return { html: segs.join(''), fixed: edits.length }
}

function manualFixes(dataDir: string): Map<string, [string, string][]> {
  const f = path.join(dataDir, 'dict-fixes', 'th-bhumibol.tsv')
  const out = new Map<string, [string, string][]>()
  if (!fs.existsSync(f)) return out
  for (const line of fs.readFileSync(f, 'utf8').split('\n').slice(1)) {
    const [word, from, to] = line.split('\t')
    if (word && from) (out.get(word) ?? out.set(word, []).get(word)!).push([from, to ?? ''])
  }
  return out
}

/** the English PTS entries and their headwords (and variants) -> row indexes, homonyms in order */
export interface English { rows: DictRow[]; byWord: Map<string, number[]> }
export function englishIndex(rows: DictRow[]): English {
  const byWord = new Map<string, number[]>()
  rows.forEach((r, i) => { for (const w of [r.word, ...(r.aliases ?? [])]) (byWord.get(w) ?? byWord.set(w, []).get(w)!).push(i) })
  return { rows, byWord }
}

/** a word form of the DPD lookup (or always false without DPD) */
export function knownPali(dpd?: string): (w: string) => boolean {
  if (!dpd || !fs.existsSync(dpd)) return () => false
  const db = new Database(dpd, { readonly: true })
  const q = db.prepare('SELECT 1 FROM lookup WHERE lookup_key = ?').pluck()
  return w => !!q.get(w)
}

/** a BB entry, repaired (steps 1-3), with the English entry it translates (row index, null: none) */
export interface ThaiPair { word: string; n: number; raw: string; html: string; en: number | null }

export function pairThai(ctx: ImportCtx, english: English, knownRoman: (w: string) => boolean) {
  const manual = manualFixes(ctx.dataDir)
  const report = ['kind\tword\tdetail']
  const stats = { gaps: 0, ety: 0, left: 0, man: 0 }
  const seen = new Map<string, number>()
  const used = new Set<number>()
  const pairs = readV2(ctx.dictDir, 'th-bhumibol').map((r): ThaiPair => {
    const key = r.word.replace(/[-\s\d]+$/, '')
    // the n-th entry of a headword translates the n-th English entry (homonyms are in the same order)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    let m = thaiMechanical(r.meaning)
    // the English homonym: the one with the most cognates in common, else the n-th
    const homs = english.byWord.get(key) ?? []
    const best = homs.map(i => [cognates(m, english.rows[i].meaning), i] as const).sort((a, b) => b[0] - a[0])[0]
    const en = best && best[0] >= 2 ? best[1] : homs[n - 1] ?? null
    if (en !== null) used.add(en)
    if (m.match(GAP)) {
      const known = new Set<string>()
      for (const w of stripTags(homs.map(i => english.rows[i].meaning).join(' ')).match(/[\p{L}\p{M}]+/gu) ?? []) if (w.length > 2) known.add(toThai(w.toLowerCase()))
      const g = fillGaps(m, known, knownRoman)
      m = g.html
      stats.gaps += g.fixed
      stats.left += g.left.length
      for (const l of g.left) report.push(`gap\t${r.word}\t${l}`)
    }
    if (en !== null) {
      const e = etymology(m, english.rows[en].meaning)
      m = e.html
      stats.ety += e.fixed
    }
    for (const [from, to] of manual.get(r.word) ?? []) if (m.includes(from)) { m = m.split(from).join(to); stats.man++ }
    if (/[-]/.test(m)) report.push(`pua\t${r.word}\t`)
    return { word: r.word, n, raw: r.meaning, html: m, en }
  })
  // English entries no BB entry translates (their headwords are not in BB at all)
  const thaiWords = new Set(pairs.map(p => p.word.replace(/[-\s\d]+$/, '')))
  const unpaired = english.rows.map((_, i) => i).filter(i => !used.has(i) && !thaiWords.has(english.rows[i].word))
  return { pairs, unpaired, report, stats }
}

/** an AI result for the dictionary: a marker the reader can tap at the start of every translated passage */
export const aiMarked = (html: string) => html.replace(/<span class="ai-add">/g, '<span class="ai-add"><span class="ai-mark">AI</span>')

export function importThaiPts(ctx: ImportCtx, english: English, knownRoman: (w: string) => boolean, resolve?: Resolver): ImportResult {
  const { pairs, report, stats } = pairThai(ctx, english, knownRoman)
  // the AI revision (scripts/dict-ai.ts): the entries of a headword whose sources did not change since
  const store = readAiStore(ctx.dataDir)
  const jobs = aiJobs(english, pairs)
  const current = new Map<string, AiResult>()
  let stale = 0
  for (const j of jobs) {
    const r = store.get(j.id)
    if (r?.src === j.src) current.set(j.id, r)
    else if (r) { stale++; report.push(`ai-stale\t${j.id}\t`) }
  }
  const refs = (html: string) => markRefs(html, THAI_ABBREVS, 'thai', resolve).html
  const rows: DictRow[] = []
  const done = new Set<string>()
  const addAi = (id: string, r: AiResult) => {
    const several = r.entries.length > 1
    for (const e of r.entries) rows.push({ word: id, hom: several ? e.hom : 0, meaning: refs(aiMarked(e.html)) })
    for (const o of r.others ?? []) rows.push({ word: o.word, meaning: refs(aiMarked(o.html)) })
    done.add(id)
  }
  for (const p of pairs) {
    const k = thaiKey(p.word)
    if (done.has(k)) continue
    const r = current.get(k)
    if (r) addAi(k, r)
    else rows.push({ word: p.word, meaning: refs(p.html) })
  }
  // headwords BB lacks
  let added = 0
  for (const [id, r] of current) if (!done.has(id)) { addAi(id, r); added++ }
  ctx.report('th-bhumibol', report)
  ctx.log(`th-bhumibol: ${rows.length} entries, ${stats.gaps} missing consonants restored (${stats.left} left), ${stats.ety} Greek etymologies, ` +
    `${stats.man} manual fixes; AI revised ${current.size} headwords (${added} new, ${stale} stale)`)
  return { rows, abbrevs: THAI_ABBREVS }
}
