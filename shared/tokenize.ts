/**
 * Full text search tokenizer, used by the index build (build/fts.ts) and by the client to map hit offsets
 * back onto the rendered text.
 *
 * The indexed text of a paragraph is its markup flattened: bold markers and page refs are transparent,
 * variant notes {..} are replaced by a single space (not indexed). A token is a run of letters (incl.
 * combining marks); a quote/apostrophe between two letters is dropped and joins the parts
 * (aha’meko -> ahameko, as in the v2 tokenizer). Tokens are lower cased NFC.
 */
import { parseMarkup, type Seg } from './markup'

const LETTER = /[\p{L}\p{M}]/u
const JOINER = /[‘’'`]/

/** flattened indexed text (see above) */
export function indexedText(text: string): string {
  const out: string[] = []
  const walk = (segs: Seg[]) => {
    for (const s of segs) {
      if (s.t === 'text') out.push(s.s)
      else if (s.t === 'bold') walk(s.c)
      else if (s.t === 'note') out.push(' ')
    }
  }
  walk(parseMarkup(text))
  return out.join('')
}

export interface Token {
  w: string
  /** code unit offsets into indexedText() */
  start: number
  end: number
}

export function tokenizeFlat(flat: string): Token[] {
  const out: Token[] = []
  let start = -1
  let w = ''
  for (let i = 0; i <= flat.length; i++) {
    const ch = flat[i]
    if (ch !== undefined && LETTER.test(ch)) {
      if (start < 0) start = i
      w += ch
    } else if (ch !== undefined && start >= 0 && JOINER.test(ch) && joinsLetters(flat, i)) {
      // joined, the quotes are not part of the token text
    } else if (start >= 0) {
      out.push({ w: normalizeWord(w), start, end: i })
      start = -1
      w = ''
    }
  }
  return out
}

/** a run of quotes at i followed by a letter (CST writes ...’’ti) */
function joinsLetters(flat: string, i: number): boolean {
  let j = i
  while (j < flat.length && JOINER.test(flat[j])) j++
  return j < flat.length && LETTER.test(flat[j])
}

export const tokenize = (text: string): Token[] => tokenizeFlat(indexedText(text))
export const tokens = (text: string): string[] => tokenize(text).map(t => t.w)

export function normalizeWord(w: string): string {
  return w.normalize('NFC').toLowerCase()
}
