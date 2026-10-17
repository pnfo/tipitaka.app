/** A Corpus read back from a built text.db (for the alignment scripts: no XML parsing needed). */
import Database from 'better-sqlite3'
import type { Corpus, TNode, TPara, TBook } from '../tree'
import type { ParaLink } from '../links'
import type { BookDef } from '../catalog'

export function corpusFromDb(file: string): { corpus: Corpus; paranum: ParaLink[] } {
  const db = new Database(file, { readonly: true })
  const books: TBook[] = (db.prepare('SELECT id, name, files, coll, title, root_id, para_count FROM book ORDER BY id').all() as Record<string, never>[])
    .map(b => ({ idx: b.id, def: { id: b.name, files: String(b.files).split(' '), parent: '', coll: b.coll, title: b.title } as BookDef, root: b.root_id, paraCount: b.para_count }))
  const rows = db.prepare('SELECT id, key, parent_id, book_id, kind, coll, rend, title, para_start, para_end FROM node ORDER BY id').all() as Record<string, never>[]
  const nodes: TNode[] = rows.map(r => ({ idx: r.id, key: r.key, parent: r.parent_id, title: r.title, kind: r.kind, coll: r.coll, book: r.book_id, rend: r.rend, start: r.para_start, end: r.para_end, children: [] }))
  for (const n of nodes) if (n.parent >= 0) nodes[n.parent].children.push(n.idx)
  const paras: TPara[] = (db.prepare('SELECT book_id, idx, node_id, rend, num, text FROM para ORDER BY id').all() as Record<string, never>[])
    .map(p => ({ book: p.book_id, idx: p.idx, node: p.node_id, rend: p.rend, num: p.num, text: p.text }))
  const paranum: ParaLink[] = (db.prepare("SELECT * FROM para_link WHERE source = 'paranum'").all() as Record<string, never>[])
    .map(l => ({ fromBook: l.from_book, fromIdx: l.from_idx, toBook: l.to_book, toIdx: l.to_idx, kind: l.kind, source: 'paranum', conf: l.conf }))
  db.close()
  return { corpus: { nodes, paras, books, keyToNode: new Map(nodes.map(n => [n.key, n.idx])), warnings: [] }, paranum }
}
