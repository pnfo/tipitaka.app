/**
 * Commentary lemmas: the bold quotations of the text being explained (**Sambahulāna**nti bahukānaṃ,
 * **Paṭipanno hotī**ti ettha **paṭī**ti upasaggapadaṃ).
 *
 * A lemma is a run of bold words. Bold runs separated only by spaces, quotes, dashes or page refs are one lemma
 * (verse lines). The sandhi tail after the bold is used to restore the quoted form:
 *   X**nti  -> Xṃ  (sambahulāna-nti = sambahulānaṃ)       X**ti -> X  (hotī-ti = hoti; vowel length is folded away)
 *   **Xnti** / **Xti** (tail inside the bold) -> both X and Xṃ / X are tried
 *   X**tiādi / ntiādi  -> "and so on": the target extends to the next lemma
 *   **A …pe… B**       -> two parts, the target runs from A to B
 * Patterns are folded (see text.ts) and joined without spaces.
 */
import { words, type Word } from './text'

export interface Lemma {
  /** markup offsets of the first and after the last bold letter (in the paragraph where they occur) */
  s: number
  e: number
  /** patterns to search, best first */
  pats: string[]
  /** folded bold words (seed lookups) */
  words: string[]
  /** phrases of the bold run split at punctuation (patterns), when there is more than one */
  segs: string[]
  /** parts of a …pe… lemma (each a pattern), else empty */
  parts: string[]
  /** "tiādi": the quotation stands for a longer passage */
  adi: boolean
  /** the words of the lemma end the paragraph (only tail / punctuation after it) and start it - for verse merging */
  atStart: boolean
  atEnd: boolean
}

const GAP_OK = /^[\s‘’'"“”–—\-]*$/
const PE_RE = /…\s*pe\s*…|\.\.\.\s*pe\s*\.\.\./

const stripGap = (g: string) => g.replace(/\*\*/g, '').replace(/\|[MVPT][0-9.]+\|/g, '')

/** lemmas of one paragraph, in text order */
export function extractLemmas(text: string, ws: Word[] = words(text)): Lemma[] {
  const out: Lemma[] = []
  let i = 0
  while (i < ws.length) {
    if (!ws[i].b.some(Boolean)) { i++; continue }
    let j = i
    while (j + 1 < ws.length && ws[j].b[ws[j].b.length - 1] && ws[j + 1].b[0]) {
      const gap = text.slice(ws[j].e, ws[j + 1].s)
      if (gap.includes('**') && !GAP_OK.test(stripGap(gap))) break
      j++
    }
    const l = makeLemma(text, ws, i, j)
    if (l) out.push(l)
    i = j + 1
  }
  return out
}

function makeLemma(text: string, ws: Word[], i: number, j: number): Lemma | null {
  const first = ws[i], last = ws[j]
  const fb = first.b.indexOf(true)
  const lb = last.b.lastIndexOf(true)
  const s = first.o[fb], e = last.o[lb] + 1
  const raw = text.slice(s, e)
  // folded bold part of each word (the first may start, the last end inside the word)
  const parts: string[][] = [[]]
  for (let k = i; k <= j; k++) {
    const w = ws[k]
    const from = k === i ? fb : 0
    const to = k === j ? lb + 1 : w.f.length
    const f = w.f.slice(from, to)
    if (f === 'pe' && PE_RE.test(text.slice(ws[k - 1]?.e ?? w.s, ws[k + 1]?.s ?? w.e))) { parts.push([]); continue }
    parts[parts.length - 1].push(f)
  }
  const segs: string[] = ['']
  for (let k = i; k <= j; k++) {
    if (k > i && /[,.;:?!]/.test(text.slice(ws[k - 1].e, ws[k].s).replace(/\|[MVPT][0-9.]+\|/g, ''))) segs.push('')
    segs[segs.length - 1] += ws[k].f.slice(k === i ? fb : 0, k === j ? lb + 1 : ws[k].f.length)
  }
  const tail = last.f.slice(lb + 1)
  const core = parts[0].join('')
  if (core.length < 2) return null
  let pats: string[]
  let adi = false
  const lastPart = parts[parts.length - 1].join('')
  const withTail = (c: string): string[] => {
    // "and so on" inside the bold: **ye keci kusalā dhammātiādinā**
    const inner = /^(.{4,}?)(n?ti)?adi(na|ni|nam|su|m)?$/.exec(c)
    if (!tail && inner && /tiadi/.test(c)) { adi = true; c = inner[1]; return inner[2] === 'nti' ? [c + 'm', c] : [c] }
    if (tail.startsWith('nti')) { adi = tail.startsWith('ntiadi'); return [c + 'm', c] }
    if (tail.startsWith('ti')) { adi = tail.startsWith('tiadi'); return [c] }
    if (tail) return [c] // compound: **samaya**saddo
    if (c.endsWith('nti') && c.length > 5) return [c, c.slice(0, -3) + 'm']
    if (c.endsWith('ti') && c.length > 4) return [c, c.slice(0, -2)]
    return [c]
  }
  if (parts.length > 1) {
    pats = [core]
    const lp = withTail(lastPart)
    return { s, e, pats, words: parts.flat(), segs: [], parts: [core, ...lp.slice(0, 1)], adi: true, atStart: atStart(text, s), atEnd: atEnd(text, e, ws, j) }
  }
  pats = withTail(core)
  if (!adi && PE_RE.test(raw)) adi = true
  return { s, e, pats, words: parts[0], segs: segs.length > 1 ? segs : [], parts: [], adi, atStart: atStart(text, s), atEnd: atEnd(text, e, ws, j) }
}

const atStart = (text: string, s: number) => GAP_OK.test(stripGap(text.slice(0, s)))
// only the tail of the last word and punctuation follow
const atEnd = (_text: string, _e: number, ws: Word[], j: number) => j === ws.length - 1
