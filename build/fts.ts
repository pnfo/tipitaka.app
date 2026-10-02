/**
 * Full text index: one row per distinct token, one posting per (token, book) with the token offsets of the
 * book (offset = position in the book's token stream, para.tok is the offset of the paragraph's first token).
 * Offsets are delta + varint encoded (decoded in server/engine/fts.go). This keeps the v2 semantics
 * (prefix/suffix/infix wildcards on the token list, then phrase/order/distance matching on the offsets),
 * which SQLite FTS does not support (no leading wildcards).
 */
import { tokens } from '../shared/tokenize'
import { fold, reverse } from '../shared/normalize'
import type { Corpus } from './tree'

export interface TokenRow { id: number; w: string; fold: string; rev: string; freq: number; books: number }
export interface Posting { token: number; book: number; offsets: Buffer }

export function encodeOffsets(offs: number[]): Buffer {
  const bytes: number[] = []
  let prev = 0
  for (const o of offs) {
    let d = o - prev
    prev = o
    while (d >= 0x80) { bytes.push((d & 0x7f) | 0x80); d = Math.floor(d / 128) }
    bytes.push(d)
  }
  return Buffer.from(bytes)
}

export function decodeOffsets(b: Uint8Array): number[] {
  const out: number[] = []
  let prev = 0, cur = 0, shift = 0
  for (const x of b) {
    cur += (x & 0x7f) * 2 ** shift
    if (x & 0x80) shift += 7
    else { prev += cur; out.push(prev); cur = 0; shift = 0 }
  }
  return out
}

/** sets para tok offsets (returned per para index of corpus.paras) and builds the token/posting rows */
export function buildIndex(c: Corpus): { paraTok: Int32Array; bookTok: Map<number, number>; tokens: TokenRow[]; postings: Posting[] } {
  const paraTok = new Int32Array(c.paras.length)
  const tokenIds = new Map<string, number>()
  const rows: TokenRow[] = []
  // token id -> book -> offsets
  const occ: Map<number, number[]>[] = []
  const counters = new Map<number, number>()
  c.paras.forEach((p, i) => {
    const start = counters.get(p.book) ?? 0
    paraTok[i] = start
    const ws = tokens(p.text)
    ws.forEach((w, k) => {
      let id = tokenIds.get(w)
      if (id === undefined) {
        id = rows.length + 1
        tokenIds.set(w, id)
        const f = fold(w)
        rows.push({ id, w, fold: f, rev: reverse(f), freq: 0, books: 0 })
        occ.push(new Map())
      }
      rows[id - 1].freq++
      const m = occ[id - 1]
      let arr = m.get(p.book)
      if (!arr) m.set(p.book, (arr = []))
      arr.push(start + k)
    })
    counters.set(p.book, start + ws.length)
  })
  const postings: Posting[] = []
  occ.forEach((m, i) => {
    rows[i].books = m.size
    for (const [book, offs] of m) postings.push({ token: i + 1, book, offsets: encodeOffsets(offs) })
  })
  return { paraTok, bookTok: counters, tokens: rows, postings }
}
