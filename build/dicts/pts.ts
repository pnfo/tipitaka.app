/**
 * PTS Pali-English Dictionary (Rhys Davids & Stede 1921-25, © Pali Text Society, CC BY-NC 3.0) in the edition of
 * Ānandajoti Bhikkhu (2025): .cache/dicts/pts/PTSPED.json ([{name, entry}], html). Abbreviations are written out,
 * references modernised (Ja VI 508), the Greek is Unicode and the OCR errors of the older digital copies are fixed.
 *
 * It has lost much of the bold of the print (roots, derived forms), which the older copy of v2 (en-pts, from the
 * Digital Pali Reader, DSAL text) still has: each entry is paired with the v2 entry (headword, homonym number) and
 * their words are aligned (lcsPairs); a word that is bold in the v2 entry becomes bold here.
 * It also undoes a mistake of the writing out of abbreviations: "pp. 57" (pages) -> "past participle 57".
 * Other words written out where the old copy has a longer word ("derc" -> "derived") are reported (expansion?).
 * Report: .cache/dicts/reports/en-pts.tsv
 */
import fs from 'node:fs'
import path from 'node:path'
import { lcsPairs } from './diff'
import { fold } from '../../shared/normalize'
import { niggahita, stripTags } from './markup'
import { PTS_ABBREVS, markRefs, type Resolver } from './refs'
import { readV2 } from './v2'
import type { DictRow, ImportCtx, ImportResult } from './types'

interface Raw { name: string; entry?: string }
export interface PtsEntry { word: string; hom: number; aliases: string[]; headRest: string; body: string }

const norm = (s: string) => niggahita(s.normalize('NFC')).toLowerCase()
/** headword key shared by both editions: "*Dassati" "a-" "ā -- 1" -> "dassati" "a" "ā" */
const headKey = (s: string) => norm(stripTags(s)).split(/[&=]/)[0].replace(/â/g, 'ā').replace(/î/g, 'ī').replace(/û/g, 'ū')
  .replace(/[*˚°\s,.;:()[\]]+/g, '').replace(/-+/g, '').replace(/\d+$/, '')

/** "<span class="Head"><b>Kalla</b><sup>01</sup> and <b>Kalya</b><sup>,,</sup> " (the </span> is sometimes missing) */
const HEAD = /^<p><span class="Head">((?:\s*(?:<b>[^<]*<\/b>|<sup>[^<]*<\/sup>|and|\((?=\s*(?:and\s*)?<b>)|(?<=<\/b>|<\/sup>)\)|,,?|\*|-|–|°)\s*)+)(?:<\/span>|\]|\s)*/

/** slips of the source's headwords: "lañcaka:", "tadaṅga.", "kolāpa)", "hirī̌mant" (a stray caron), "mana(s)" */
const HEAD_FIXES: Record<string, string> = { 'abhiniḥta': 'abhinihata' }
export const cleanHead = (w: string) => {
  const c = w.normalize('NFD').replace(/[\u0306\u030c]/g, '').normalize('NFC').replace(/\([a-z]*\)$/, '').replace(/[.:;)’]+$/, '')
  return HEAD_FIXES[c] ?? c
}

export function parsePtsEntry(x: Raw): PtsEntry | null {
  const html = (x.name + (x.entry ?? '')).replace(/<(\/?)I>/g, '<$1i>').replace(/<(\/?)SUP>/g, '<$1sup>')
  const m = HEAD.exec(html)
  if (!m) return null
  const head = m[1]
  const bolds = [...head.matchAll(/<b>([^<]*)<\/b>/g)].map(b => b[1])
  const word = cleanHead(norm(bolds[0].replace(/^[*\-–°\s]+|[\-–°\s]+$/g, '')))
  if (!word) return null
  const homM = /^<b>[^<]*<\/b>-?<sup>(\d+)<\/sup>/.exec(head.trim())
  const hom = homM ? Number(homM[1]) : 0
  const aliases = [...new Set(bolds.slice(1).map(b => cleanHead(norm(b.replace(/^[*\-–°\s]+|[\-–°\s]+$/g, '')))).filter(a => a && a !== word))]
  const headRest = aliases.length ? niggahita(head.trim().replace(/^<b>[^<]*<\/b>-?(?:<sup>[^<]*<\/sup>)?\s*/, '')).replace(/<sup>,,<\/sup>/g, '') : ''
  let body = '<p>' + html.slice(m[0].length).replace(/<\/span>/, '')
  // stray tags (Latin "<sequor>") are text
  body = body.replace(/<(\/?)(?!(?:b|i|sup|sub|br|p|span|mark)\b)([a-zA-Z]+)>/g, '&lt;$1$2&gt;').replace(/<\/?mark>/g, '')
  return { word, hom, aliases, headRest, body: greekFont(niggahita(body)).normalize('NFC') }
}

/** the wrong letters of the edition's Greek (a font mapping): ὦμοϛ ὀφϧαλμός ἆπϖτέρϖ καιϙός, and Gothic anϸar */
const GREEK_FONT: Record<string, string> = { ϛ: 'ς', ϧ: 'θ', ϑ: 'θ', ϴ: 'Θ', ϕ: 'φ', ϖ: 'ω', ϵ: 'ε', ϙ: 'ρ', ϻ: 'μ', ϸ: 'þ' }
export const greekFont = (s: string) => s.replace(/[ϛϧϑϴϕϖϵϙϻϸ]/g, c => GREEK_FONT[c])

interface Tok { t: string; raw: string; seg: number; start: number; end: number; bold: boolean }

/** the words of html with their place (text segment, offsets) and whether they are bold */
export function tokens(html: string): { segs: string[]; toks: Tok[] } {
  const segs = html.split(/(<[^>]*>)/)
  const toks: Tok[] = []
  let bold = 0
  segs.forEach((s, i) => {
    if (s.startsWith('<')) {
      if (/^<b[\s>]/i.test(s)) bold++
      else if (/^<\/b>/i.test(s)) bold = Math.max(0, bold - 1)
      return
    }
    for (const w of s.matchAll(/[\p{L}\p{M}]+/gu)) toks.push({ t: norm(w[0]), raw: w[0], seg: i, start: w.index!, end: w.index! + w[0].length, bold: bold > 0 })
  })
  return { segs, toks }
}

/** grammatical abbreviations of the PTS list (part 2 of its index page): "der." -> ["derived", "derivation"] */
export function parsePtsGrammar(indexHtml: string): Map<string, string[]> {
  const i = indexHtml.indexOf('2. General &amp; Grammatical Terms') >= 0 ? indexHtml.indexOf('2. General &amp; Grammatical Terms') : indexHtml.indexOf('2. General & Grammatical Terms')
  const out = new Map<string, string[]>()
  if (i < 0) return out
  const block = indexHtml.slice(i, indexHtml.indexOf('3. Typographical', i))
  for (const line of stripTags(block.replace(/<br\s*\/?>/g, '\n')).split('\n')) {
    const m = /^\s*([a-zA-Z]+)\.\s+(.+?)\s*$/.exec(line)
    if (m) out.set(m[1].toLowerCase(), m[2].split(/[\s,()]+/).map(w => w.toLowerCase()).filter(w => w.length > 2))
  }
  return out
}

export interface Restore { html: string; bold: number; unmatchedBold: string[]; fixes: string[]; suspects: string[] }

/** restores the bold words of the old copy (v2 html) in the new entry and undoes the wrong expansions */
export function restoreFromOld(newHtml: string, oldHtml: string, grammar: Map<string, string[]>): Restore {
  const nw = tokens(newHtml), old = tokens(oldHtml.replace(/<at>[\s\S]*?<\/at>/g, ' '))
  const pairs = lcsPairs(old.toks.map(t => t.t), nw.toks.map(t => t.t))
  const toBold = new Set<number>()
  const replace = new Map<number, { end: number; text: string }>() // token index -> replacement of the text up to end (of token end)
  const fixes: string[] = []
  const suspects: string[] = []
  const matchedOld = new Set(pairs.map(p => p[0]))
  for (const [i, j] of pairs) if (old.toks[i].bold && !nw.toks[j].bold) toBold.add(j)
  // the gaps between matches: replaced words
  const bounds: [number, number][] = [[-1, -1], ...pairs, [old.toks.length, nw.toks.length]]
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [i0, j0] = bounds[k], [i1, j1] = bounds[k + 1]
    const o = old.toks.slice(i0 + 1, i1), n = nw.toks.slice(j0 + 1, j1)
    // "pp. 57" -> "past participle 57"
    if (o.length === 1 && o[0].t === 'pp' && n.length === 2 && n[0].t === 'past' && n[1].t === 'participle' && n[0].seg === n[1].seg &&
      /^\s*\d/.test(nw.segs[n[1].seg].slice(n[1].end))) {
      replace.set(j0 + 1, { end: n[1].end, text: 'pp.' })
      fixes.push('pp.')
    } else if (o.length === 1 && n.length === 1 && fold(o[0].t) !== fold(n[0].t) && old.segs[o[0].seg][o[0].end] !== '.') {
      // "derc" -> "derived": an abbreviation written out inside a longer word (not an abbreviation: no full stop)
      for (const [abbr, words] of grammar) {
        if (o[0].t.startsWith(abbr) && o[0].t.length > abbr.length && words.includes(n[0].t)) {
          suspects.push(`${o[0].raw}->${n[0].raw}`) // mostly the old copy's abbreviations without the full stop: reported only
          break
        }
      }
    }
  }
  // rebuild the text segments: replacements, then bold runs (words joined by - or ° stay one run)
  const bySeg = new Map<number, number[]>()
  nw.toks.forEach((t, j) => { if (toBold.has(j) || replace.has(j)) (bySeg.get(t.seg) ?? bySeg.set(t.seg, []).get(t.seg)!).push(j) })
  let bold = 0
  for (const [seg, js] of bySeg) {
    const s = nw.segs[seg]
    const edits: { start: number; end: number; text: string }[] = []
    let run: { start: number; end: number } | null = null
    const flush = () => { if (run) { edits.push({ start: run.start, end: run.end, text: `<b>${s.slice(run.start, run.end)}</b>` }); bold++ }; run = null }
    for (const j of js) {
      const t = nw.toks[j]
      const r = replace.get(j)
      if (r) { flush(); edits.push({ start: t.start, end: r.end, text: r.text }); continue }
      if (run && /^[-–°]*$/.test(s.slice(run.end, t.start))) run.end = t.end
      else { flush(); run = { start: t.start, end: t.end } }
    }
    flush()
    let out = s
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
    nw.segs[seg] = out
  }
  const unmatchedBold = old.toks.filter((t, i) => t.bold && !matchedOld.has(i) && t.t.length > 1).map(t => t.raw)
  return { html: nw.segs.join(''), bold, unmatchedBold, fixes, suspects }
}

/** the v2 copy: headword key + homonym -> html */
function oldEntries(dictDir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of readV2(dictDir, 'en-pts')) {
    const hom = Number(/(\d+)$/.exec(r.word.split(/[&=]/)[0].trim())?.[1] ?? 0)
    const k = `${headKey(r.word)}|${hom}`
    out.set(k, out.has(k) ? out.get(k) + ' ' + r.meaning : r.meaning)
  }
  return out
}

/** the key of the v2 entry of a new entry: headword and homonym, the homonym the v2 copy does not number, then folded */
function findOld(old: Map<string, string>, folded: Map<string, string[]>, used: Set<string>, e: PtsEntry): string | undefined {
  const h = headKey(e.word)
  const exact = [`${h}|${e.hom}`, `${h}|0`, `${h}|1`].find(k => old.has(k) && !used.has(k))
  if (exact) return exact
  return (folded.get(`${fold(h)}|${e.hom}`) ?? folded.get(`${fold(h)}|0`) ?? []).find(k => !used.has(k))
}

const memo = new WeakMap<ImportCtx, ImportResult>()
/** the PTS of a build (the Thai translation is repaired with it) */
export function ptsOf(ctx: ImportCtx, resolve?: Resolver): ImportResult {
  if (!memo.has(ctx)) memo.set(ctx, importPts(ctx, resolve))
  return memo.get(ctx)!
}

export function importPts(ctx: ImportCtx, resolve?: Resolver): ImportResult {
  const file = path.join(ctx.cacheDir, 'pts', 'PTSPED.json')
  if (!fs.existsSync(file)) throw new Error(`${file} missing: run npm run upstream -- --dicts-only`)
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Raw[]
  const index = path.join(ctx.cacheDir, 'pts-index', 'index.htm')
  const grammar = fs.existsSync(index) ? parsePtsGrammar(fs.readFileSync(index, 'utf8')) : new Map<string, string[]>()
  const old = oldEntries(ctx.dictDir)
  const folded = new Map<string, string[]>()
  for (const k of old.keys()) {
    const [w, hom] = k.split('|')
    const fk = `${fold(w)}|${hom}`
    ;(folded.get(fk) ?? folded.set(fk, []).get(fk)!).push(k)
  }
  const usedOld = new Set<string>()
  const report: string[] = ['kind\tword\thom\tdetail']
  let bold = 0, fixes = 0, paired = 0, refs = 0
  const rows: DictRow[] = []
  const entries: PtsEntry[] = []
  for (const x of raw) {
    const e = parsePtsEntry(x)
    if (!e) continue
    // a page number in bold taken for a headword ("<b>499</b> = V 180; …"): the rest of the entry before
    const prev = entries.at(-1)
    if (/^\d+$/.test(e.word) && prev) { prev.body = prev.body.replace(/<\/p>\s*$/, '') + ` ${e.word} ${e.body.replace(/^<p>/, '')}`; continue }
    entries.push(e)
  }
  for (const e of entries) {
    let html = e.body
    const k = findOld(old, folded, usedOld, e)
    if (k) {
      usedOld.add(k)
      paired++
      const r = restoreFromOld(html, old.get(k)!, grammar)
      html = r.html
      bold += r.bold
      fixes += r.fixes.length
      for (const f of r.fixes) report.push(`fix\t${e.word}\t${e.hom}\t${f}`)
      for (const f of r.suspects) report.push(`expansion?\t${e.word}\t${e.hom}\t${f}`)
      if (r.unmatchedBold.length) report.push(`unmatched-bold\t${e.word}\t${e.hom}\t${r.unmatchedBold.join(' ')}`)
    } else report.push(`new-only\t${e.word}\t${e.hom}\t`)
    // the pages of the remaining "pp. 57" (a past participle is never followed by a number)
    html = html.replace(/past participle(\s+\d)/g, (_, d: string) => { fixes++; report.push(`fix\t${e.word}\t${e.hom}\tpp.`); return 'pp.' + d })
    if (e.headRest) html = html.replace(/^<p>/, `<p><span class="dict-head">${e.headRest}</span> `)
    const m = markRefs(html, PTS_ABBREVS, 'pts', resolve)
    refs += m.refs
    rows.push({ word: e.word, hom: e.hom, aliases: e.aliases, meaning: m.html.replace(/\s+<\/p>/g, '</p>').trim() })
  }
  for (const k of old.keys()) if (!usedOld.has(k)) report.push(`old-only\t${k.replace('|', '\t')}\t`)
  ctx.report('en-pts', report)
  ctx.log(`pts: ${rows.length} entries, ${paired} paired with the v2 copy, ${bold} bold runs restored, ${fixes} expansions undone, ${refs} references`)
  return { rows, abbrevs: PTS_ABBREVS }
}
