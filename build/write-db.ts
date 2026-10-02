/**
 * Writes db/text.db (schema below, documented in dev-docs/data-pipeline.md). All queries are in
 * server/engine; every SQL feature used must exist in SQLite 3.9 (Android 7 system sqlite is not used - the
 * engine bundles its own - but keep it simple).
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import { fold } from '../shared/normalize'
import { buildIndex } from './fts'
import { mirrorTarget, type ParaLink } from './links'
import { dfsOrder, type Corpus } from './tree'
import type { LegacyEntry } from './legacy'

export const SCHEMA_VERSION = 1
export const PARA_ID_SHIFT = 1 << 20
export const paraId = (book: number, idx: number) => book * PARA_ID_SHIFT + idx

export const SCHEMA = `
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE book (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, files TEXT NOT NULL, coll TEXT NOT NULL, title TEXT NOT NULL,
  root_id INTEGER NOT NULL, para_count INTEGER NOT NULL, tok_count INTEGER NOT NULL);
-- tree, id = DFS order. parent_id/book_id are -1 when absent. para range [para_start, para_end) of the book
CREATE TABLE node (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, parent_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
  kind TEXT NOT NULL, coll TEXT NOT NULL, rend TEXT NOT NULL, title TEXT NOT NULL, title_fold TEXT NOT NULL,
  para_start INTEGER NOT NULL, para_end INTEGER NOT NULL, depth INTEGER NOT NULL, child_count INTEGER NOT NULL,
  prev_key TEXT NOT NULL, next_key TEXT NOT NULL, mirror_key TEXT NOT NULL);
CREATE INDEX node_parent ON node(parent_id);
CREATE INDEX node_book ON node(book_id, para_start);
-- id = book_id * 2^20 + idx (a range of a book is a rowid range)
CREATE TABLE para (
  id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, idx INTEGER NOT NULL, node_id INTEGER NOT NULL, rend TEXT NOT NULL,
  num TEXT NOT NULL, text TEXT NOT NULL, tok INTEGER NOT NULL);
CREATE TABLE para_link (
  from_book INTEGER NOT NULL, from_idx INTEGER NOT NULL, to_book INTEGER NOT NULL, to_idx INTEGER NOT NULL,
  kind TEXT NOT NULL, source TEXT NOT NULL, conf REAL NOT NULL);
CREATE INDEX para_link_from ON para_link(from_book, from_idx);
CREATE INDEX para_link_to ON para_link(to_book, to_idx);
-- fts tokens: w exact (lower case), fold = diacritics removed, rev = reverse(fold) for suffix queries.
-- Lookups go through fold/rev ranges; diacritic sensitive queries filter on w afterwards.
CREATE TABLE token (id INTEGER PRIMARY KEY, w TEXT NOT NULL, fold TEXT NOT NULL, rev TEXT NOT NULL, freq INTEGER NOT NULL, books INTEGER NOT NULL);
CREATE INDEX token_fold ON token(fold);
CREATE INDEX token_rev ON token(rev);
CREATE TABLE posting (token_id INTEGER NOT NULL, book_id INTEGER NOT NULL, offsets BLOB NOT NULL, PRIMARY KEY (token_id, book_id)) WITHOUT ROWID;
-- v2 locations: file id + line (1 based, 0 = the file) -> key and para index (see build/legacy.ts)
CREATE TABLE legacy (file TEXT NOT NULL, line INTEGER NOT NULL, key TEXT NOT NULL, para INTEGER NOT NULL, PRIMARY KEY (file, line)) WITHOUT ROWID;
`

export interface WriteResult { nodeIds: Map<number, number>; tokenCount: number; postingCount: number; linkCount: number }

export function writeDb(file: string, c: Corpus, links: ParaLink[], meta: Record<string, string>, legacy: LegacyEntry[] = []): WriteResult {
  const tmp = file + '.tmp'
  fs.rmSync(tmp, { force: true })
  const db = new Database(tmp)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  db.pragma('page_size = 4096')
  db.exec(SCHEMA)

  const order = dfsOrder(c)
  const nodeIds = new Map<number, number>() // corpus idx -> db id
  order.forEach((ci, i) => nodeIds.set(ci, i))
  const { paraTok, bookTok, tokens, postings } = buildIndex(c)

  const tx = db.transaction(() => {
    const insMeta = db.prepare('INSERT INTO meta VALUES (?, ?)')
    for (const [k, v] of Object.entries({ ...meta, schema_version: String(SCHEMA_VERSION) })) insMeta.run(k, v)

    const insBook = db.prepare('INSERT INTO book VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const b of c.books) insBook.run(b.idx, b.def.id, b.def.files.join(' '), b.def.coll, b.def.title, nodeIds.get(b.root) ?? -1, b.paraCount, bookTok.get(b.idx) ?? 0)

    const insNode = db.prepare('INSERT INTO node VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const depth = (i: number): number => (c.nodes[i].parent < 0 ? 0 : 1 + depth(c.nodes[i].parent))
    for (const ci of order) {
      const n = c.nodes[ci]
      const { prev, next } = siblings(c, ci)
      insNode.run(nodeIds.get(ci), n.key, n.parent < 0 ? -1 : nodeIds.get(n.parent), n.book, n.kind, n.coll, n.rend, n.title, fold(n.title),
        n.start, n.end, depth(ci), n.children.length, prev, next, mirrorTarget(c, n.key)?.key ?? '')
    }

    const insPara = db.prepare('INSERT INTO para VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    c.paras.forEach((p, i) => {
      if (p.idx >= PARA_ID_SHIFT) throw new Error(`book ${p.book} has too many paragraphs`)
      insPara.run(paraId(p.book, p.idx), p.book, p.idx, nodeIds.get(p.node), p.rend, p.num, p.text, paraTok[i])
    })

    const insLink = db.prepare('INSERT INTO para_link VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const l of links) insLink.run(l.fromBook, l.fromIdx, l.toBook, l.toIdx, l.kind, l.source, l.conf)

    const insTok = db.prepare('INSERT INTO token VALUES (?, ?, ?, ?, ?, ?)')
    for (const t of tokens) insTok.run(t.id, t.w, t.fold, t.rev, t.freq, t.books)
    const insPost = db.prepare('INSERT INTO posting VALUES (?, ?, ?)')
    for (const p of postings) insPost.run(p.token, p.book, p.offsets)

    const insLegacy = db.prepare('INSERT OR IGNORE INTO legacy VALUES (?, ?, ?, ?)')
    for (const l of legacy) insLegacy.run(l.file, l.line, l.key, l.para)
  })
  tx()
  db.exec('ANALYZE')
  db.close()
  // VACUUM INTO is not needed: the db is written once in order
  fs.renameSync(tmp, file)
  return { nodeIds, tokenCount: tokens.length, postingCount: postings.length, linkCount: links.length }
}

/** reading order neighbours: next sibling, else the next sibling of the closest ancestor (not crossing books' groups) */
function siblings(c: Corpus, ci: number): { prev: string; next: string } {
  const n = c.nodes[ci]
  if (n.parent < 0) return { prev: '', next: '' }
  const sib = c.nodes[n.parent].children
  const i = sib.indexOf(ci)
  const prev = i > 0 ? c.nodes[sib[i - 1]].key : ''
  let next = i + 1 < sib.length ? c.nodes[sib[i + 1]].key : ''
  if (!next) {
    let p = n.parent
    while (!next && p >= 0 && c.nodes[p].parent >= 0) {
      const ps = c.nodes[c.nodes[p].parent].children
      const j = ps.indexOf(p)
      if (j + 1 < ps.length) next = c.nodes[ps[j + 1]].key
      p = c.nodes[p].parent
    }
  }
  return { prev: prev || (c.nodes[n.parent].kind !== 'group' ? c.nodes[n.parent].key : ''), next }
}
