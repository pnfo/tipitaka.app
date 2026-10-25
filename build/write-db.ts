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
import type { Gloss } from './align'
import { displayName, type Gazetteer } from './names/gazetteer'
import { translateEntity, type NameTexts } from './names/translations'
import type { Setting } from './names/settings'
import type { Mention } from './names/mentions'

export const SCHEMA_VERSION = 2
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
-- word level commentary alignment (build/align): the lemma [c_idx:c_s, c_eidx:c_e) of a commentary paragraph quotes
-- the words [t_idx:t_s, t_eidx:t_e) of the text it comments on; its explanation runs to [x_eidx:x_e).
-- Offsets are UTF-16 code unit offsets into para.text. kind mula-atta | atta-tika | mula-tika (ṭīkā via the aṭṭhakathā)
CREATE TABLE gloss (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, src TEXT NOT NULL, conf REAL NOT NULL,
  c_book INTEGER NOT NULL, c_idx INTEGER NOT NULL, c_s INTEGER NOT NULL, c_eidx INTEGER NOT NULL, c_e INTEGER NOT NULL,
  x_eidx INTEGER NOT NULL, x_e INTEGER NOT NULL,
  t_book INTEGER NOT NULL, t_idx INTEGER NOT NULL, t_s INTEGER NOT NULL, t_eidx INTEGER NOT NULL, t_e INTEGER NOT NULL);
CREATE INDEX gloss_c ON gloss(c_book, c_idx);
CREATE INDEX gloss_t ON gloss(t_book, t_idx);
-- fts tokens: w exact (lower case), fold = diacritics removed, rev = reverse(fold) for suffix queries.
-- Lookups go through fold/rev ranges; diacritic sensitive queries filter on w afterwards.
CREATE TABLE token (id INTEGER PRIMARY KEY, w TEXT NOT NULL, fold TEXT NOT NULL, rev TEXT NOT NULL, freq INTEGER NOT NULL, books INTEGER NOT NULL);
CREATE INDEX token_fold ON token(fold);
CREATE INDEX token_rev ON token(rev);
CREATE TABLE posting (token_id INTEGER NOT NULL, book_id INTEGER NOT NULL, offsets BLOB NOT NULL, PRIMARY KEY (token_id, book_id)) WITHOUT ROWID;
-- v2 locations: file id + line (1 based, 0 = the file) -> key and para index (see build/legacy.ts)
CREATE TABLE legacy (file TEXT NOT NULL, line INTEGER NOT NULL, key TEXT NOT NULL, para INTEGER NOT NULL, PRIMARY KEY (file, line)) WITHOUT ROWID;
-- proper names (build/names, dev-docs/names.md): the DPD name headwords. type person | deity | group | place | animal;
-- units = the suttas / stories with a setting of the name, mentions = its sure mentions; lat/lon of places (NULL when unknown), prec 1 located,
-- 2 probable, 3 approximate, 4 in or near the place its meaning names (data/names/geo.tsv)
CREATE TABLE entity (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, type TEXT NOT NULL, name TEXT NOT NULL, name_fold TEXT NOT NULL,
  lemma TEXT NOT NULL, family TEXT NOT NULL, meaning TEXT NOT NULL, lat REAL, lon REAL, prec INTEGER, units INTEGER NOT NULL,
  mentions INTEGER NOT NULL);
CREATE INDEX entity_fold ON entity(name_fold);
-- the setting of a unit (a sutta or a story: para range [para_start, para_end) of a book, named by node_id or title):
-- role place | teacher | with | about, ord = order in the role; read from paragraph ev_idx of book ev_book.
-- source nidana | abbrev | inherit | formula | qa | atta (a commentary story's setting given to the mūla it explains).
-- listed = 0: the commentary story whose setting the mūla has (source atta): not listed again on the name pages
CREATE TABLE setting (
  entity_id INTEGER NOT NULL, role TEXT NOT NULL, ord INTEGER NOT NULL, book_id INTEGER NOT NULL, para_start INTEGER NOT NULL,
  para_end INTEGER NOT NULL, node_id INTEGER NOT NULL, title TEXT NOT NULL, ev_book INTEGER NOT NULL, ev_idx INTEGER NOT NULL,
  source TEXT NOT NULL, conf REAL NOT NULL, listed INTEGER NOT NULL);
CREATE INDEX setting_entity ON setting(entity_id);
CREATE INDEX setting_unit ON setting(book_id, para_start);
-- the mentions of the names (build/names/mentions.ts): the word [s, e) of paragraph para_id (UTF-16 offsets into
-- para.text); amb = the number of namesakes it was not told apart from (0: sure); src form | verdict | rule | ai
CREATE TABLE mention (para_id INTEGER NOT NULL, s INTEGER NOT NULL, e INTEGER NOT NULL, entity_id INTEGER NOT NULL, amb INTEGER NOT NULL,
  src TEXT NOT NULL, PRIMARY KEY (para_id, s)) WITHOUT ROWID;
CREATE INDEX mention_entity ON mention(entity_id, para_id);
-- the names most often mentioned in the same paragraphs as a name (sure mentions; the 40 most frequent)
CREATE TABLE comention (entity_id INTEGER NOT NULL, other_id INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (entity_id, other_id)) WITHOUT ROWID;
-- the meaning and family of the names in the interface languages (build/names/translations.ts; '' = the English)
CREATE TABLE entity_tr (entity_id INTEGER NOT NULL, lang TEXT NOT NULL, meaning TEXT NOT NULL, family TEXT NOT NULL, PRIMARY KEY (lang, entity_id)) WITHOUT ROWID;
`

export interface WriteResult { nodeIds: Map<number, number>; tokenCount: number; postingCount: number; linkCount: number }

export interface Names { gazetteer: Gazetteer; settings: Setting[]; mentions: Mention[]; translations?: Map<string, NameTexts> }

export function writeDb(file: string, c: Corpus, links: ParaLink[], meta: Record<string, string>, legacy: LegacyEntry[] = [], glosses: Gloss[] = [],
  names?: Names): WriteResult {
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

    const insGloss = db.prepare('INSERT INTO gloss VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const sorted = [...glosses].sort((a, b) => a.cBook - b.cBook || a.cIdx - b.cIdx || a.cS - b.cS || a.kind.localeCompare(b.kind))
    sorted.forEach((g, i) => insGloss.run(i + 1, g.kind, g.src, g.conf, g.cBook, g.cIdx, g.cS, g.cEIdx, g.cE, g.xEIdx, g.xE, g.tBook, g.tIdx, g.tS, g.tEIdx, g.tE))

    const insTok = db.prepare('INSERT INTO token VALUES (?, ?, ?, ?, ?, ?)')
    for (const t of tokens) insTok.run(t.id, t.w, t.fold, t.rev, t.freq, t.books)
    const insPost = db.prepare('INSERT INTO posting VALUES (?, ?, ?)')
    for (const p of postings) insPost.run(p.token, p.book, p.offsets)

    const insLegacy = db.prepare('INSERT OR IGNORE INTO legacy VALUES (?, ?, ?, ?)')
    for (const l of legacy) insLegacy.run(l.file, l.line, l.key, l.para)

    if (names) writeNames(db, names, nodeIds)
  })
  tx()
  db.exec('ANALYZE')
  db.close()
  // VACUUM INTO is not needed: the db is written once in order
  fs.renameSync(tmp, file)
  return { nodeIds, tokenCount: tokens.length, postingCount: postings.length, linkCount: links.length }
}

function writeNames(db: Database.Database, { gazetteer: g, settings, mentions, translations }: Names, nodeIds: Map<number, number>) {
  const mentionCount = new Map<string, number>()
  // (sure mentions: an unsure one may be a namesake)
  for (const m of mentions) if (!m.amb) mentionCount.set(m.entity, (mentionCount.get(m.entity) ?? 0) + 1)
  const units = new Map<string, Set<string>>()
  for (const s of settings) {
    if (s.unlisted) continue
    const u = units.get(s.entity) ?? new Set()
    units.set(s.entity, u.add(`${s.book}:${s.start}`))
  }
  const ids = new Map<string, number>()
  const insEntity = db.prepare('INSERT INTO entity VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  // (a name spelled differently is no page: its mentions and settings are the other one's)
  for (const e of [...g.entities.values()].filter(e => !e.sameAs).sort((a, b) => a.slug.localeCompare(b.slug))) {
    ids.set(e.slug, ids.size + 1)
    const name = displayName(e)
    insEntity.run(ids.size, e.slug, e.type, name, fold(name), e.lemma, e.family, e.meaning, e.lat ?? null, e.lon ?? null, e.prec ?? null, units.get(e.slug)?.size ?? 0,
      mentionCount.get(e.slug) ?? 0)
  }
  const insTr = db.prepare('INSERT INTO entity_tr VALUES (?, ?, ?, ?)')
  for (const [lang, t] of translations ?? []) {
    for (const e of g.entities.values()) {
      if (e.sameAs) continue
      const tr = translateEntity(t, e)
      if (tr.meaning || tr.family) insTr.run(ids.get(e.slug), lang, tr.meaning, tr.family)
    }
  }
  const insSetting = db.prepare('INSERT INTO setting VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const sorted = [...settings].sort((a, b) => a.book - b.book || a.start - b.start || a.role.localeCompare(b.role) || a.ord - b.ord)
  for (const s of sorted) {
    insSetting.run(ids.get(s.entity), s.role, s.ord, s.book, s.start, s.end, nodeIds.get(s.node), s.title ?? '', s.evBook, s.evIdx, s.source, s.conf, s.unlisted ? 0 : 1)
  }

  const insMention = db.prepare('INSERT OR IGNORE INTO mention VALUES (?, ?, ?, ?, ?, ?)')
  for (const m of mentions) insMention.run(paraId(m.book, m.idx), m.s, m.e, ids.get(m.entity), m.amb, m.src)
  // names of the same paragraphs (sure mentions)
  const byPara = new Map<number, Set<number>>()
  for (const m of mentions) {
    if (m.amb) continue
    const k = paraId(m.book, m.idx)
    const set = byPara.get(k) ?? new Set()
    byPara.set(k, set.add(ids.get(m.entity)!))
  }
  const pairs = new Map<number, Map<number, number>>()
  for (const set of byPara.values()) {
    if (set.size < 2 || set.size > 30) continue // long lists of names say little about each other
    for (const a of set) {
      const m = pairs.get(a) ?? new Map<number, number>()
      pairs.set(a, m)
      for (const b of set) if (a !== b) m.set(b, (m.get(b) ?? 0) + 1)
    }
  }
  const insCo = db.prepare('INSERT INTO comention VALUES (?, ?, ?)')
  for (const [a, m] of pairs) for (const [b, n] of [...m].sort((x, y) => y[1] - x[1]).slice(0, 40)) if (n > 1) insCo.run(a, b, n)
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
