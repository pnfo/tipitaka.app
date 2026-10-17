/**
 * Words of a paragraph's stored markup with their markup offsets, for the commentary aligner.
 *
 * Same word rules as the fts tokenizer (shared/tokenize.ts): bold markers and page refs are transparent, variant
 * notes break words and are skipped, a quote between two letters joins them (bhāsita’’nti -> bhāsitanti).
 * Every folded character keeps its markup offset, so a match inside the folded text maps back to the markup.
 */

const LETTER = /[\p{L}\p{M}]/u
const JOINER = /[‘’'`]/
const PB_RE = /^\|[MVPT][0-9.]+\|/

export interface Word {
  /** markup offsets of the first letter and after the last letter */
  s: number
  e: number
  /** folded form: lower case, no diacritics (ā->a, ṃ->m, ñ->n, ḷ->l) */
  f: string
  /** markup offset of every character of f */
  o: number[]
  /** bold flag of every character of f */
  b: boolean[]
}

const foldCache = new Map<string, string>()
/** folded form of one character (one char for the precomposed Pāḷi letters, '' for lone combining marks) */
export function foldChar(c: string): string {
  let f = foldCache.get(c)
  if (f === undefined) {
    f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    foldCache.set(c, f)
  }
  return f
}

export const foldWord = (w: string) => Array.from(w).map(foldChar).join('')

/** the words of a paragraph (notes skipped) */
export function words(text: string): Word[] {
  const out: Word[] = []
  let cur: Word | null = null
  let bold = false
  let note = 0
  const end = (i: number) => {
    if (cur) { cur.e = i; if (cur.f) out.push(cur) }
    cur = null
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '*' && text[i + 1] === '*') { bold = !bold; i++; continue }
    if (ch === '{') { end(lastEnd(cur, i)); note++; continue }
    if (ch === '}') { if (note) note--; continue }
    if (note) continue
    if (ch === '|') {
      const m = PB_RE.exec(text.slice(i))
      if (m) { i += m[0].length - 1; continue }
    }
    if (LETTER.test(ch)) {
      if (!cur) cur = { s: i, e: i, f: '', o: [], b: [] }
      const f = foldChar(ch)
      for (const c of f) { cur.f += c; cur.o.push(i); cur.b.push(bold) }
      cur.e = i + 1
    } else if (cur && JOINER.test(ch) && joins(text, i)) {
      // joined, quotes are not part of the word
    } else end(lastEnd(cur, i))
  }
  end(lastEnd(cur, text.length))
  return out
}

// a word ends after its last letter (not after transparent markers that followed it)
const lastEnd = (w: Word | null, i: number) => (w ? w.e : i)

/** quotes at i followed by a letter (markers in between are transparent) */
function joins(text: string, i: number): boolean {
  let j = i
  while (j < text.length && JOINER.test(text[j])) j++
  return j < text.length && LETTER.test(text[j])
}

/**
 * A run of words as one folded string without spaces (sandhi and compounds are written either way:
 * "paṭipanno hoti" matches "addhānamaggappaṭipanno hoti"), with the position of every char.
 */
export interface Stream {
  /** folded text without spaces */
  f: string
  /** word index (into the stream's word list) of every char of f */
  w: number[]
  /** char offset in f where each word starts */
  ws: number[]
  /** per word: printed in bold (a lemma of the commented text: what a ṭīkā usually quotes) */
  bold?: Uint8Array
}

export function stream(ws: { f: string; bold?: boolean }[]): Stream {
  let f = ''
  const w: number[] = []
  const starts: number[] = []
  ws.forEach((x, i) => {
    starts.push(f.length)
    f += x.f
    for (let k = 0; k < x.f.length; k++) w.push(i)
  })
  const bold = ws.some(x => x.bold) ? Uint8Array.from(ws, x => (x.bold ? 1 : 0)) : undefined
  return { f, w, ws: starts, bold }
}
