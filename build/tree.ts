/**
 * Builds the tree (groups > books > divs > headings) and the paragraph list from the parsed XML.
 *
 * Structure in the CST files is uneven: the sutta mūla books (and most DN-AN commentaries) have nested
 * <div>s, the rest only heading paragraphs (p rend = book > chapter > title > subhead > subsubhead).
 * Both are folded into one outline:
 *  - a div is a node, keyed by its id (dn1_1 -> dn-1-1), its <head> is the node title
 *  - a heading paragraph is a node nested by rank inside the current div; keyed parent-key + '-' + position
 *  - an unnumbered heading following a numbered one of the same rend becomes its child
 *    (MN: "2. Sabbāsavasuttaṃ" > "Dassanā pahātabbāsavā")
 * Paragraphs belong to the deepest open node.
 */
import path from 'node:path'
import { plainText } from '../shared/markup'
import { BOOKS, GROUPS, collPrefix, divKey, type BookDef, type Collection } from './catalog'
import { parseFile, type ParseWarning, type XmlItem } from './xml'
import { KEY_OVERRIDES } from './key-overrides'

export type NodeKind = 'group' | 'book' | 'div' | 'heading'

export interface TNode {
  idx: number
  key: string
  parent: number // -1 for the roots
  title: string
  kind: NodeKind
  coll: Collection
  book: number // -1 for groups
  rend: string
  /** para index range [start, end) within the book (start = -1 for groups) */
  start: number
  end: number
  children: number[]
}

export interface TPara {
  book: number
  idx: number
  node: number
  rend: string
  num: string
  text: string
}

export interface TBook {
  idx: number
  def: BookDef
  /** first node of the book (root) */
  root: number
  paraCount: number
}

export interface Corpus {
  nodes: TNode[]
  paras: TPara[]
  books: TBook[]
  keyToNode: Map<string, number>
  warnings: string[]
}

const HEADING_RANK: Record<string, number> = { book: 1, chapter: 2, title: 3, subhead: 4, subsubhead: 5 }
const NUMBERED_RE = /^\(?\d+(?:[-–.,]\d+)*[.)]\s/
const VOLUME_RE = /^\(.*bhāgo\)$/i // "(Paṭhamo bhāgo)" volume markers

type Entry = { node: number; rank: number; div: boolean; rend: string; numbered: boolean; virtual?: boolean }

export function buildCorpus(xmlDir: string, opts: { books?: BookDef[]; parse?: (file: string, w: ParseWarning[]) => XmlItem[] } = {}): Corpus {
  const books = opts.books ?? BOOKS
  const parse = opts.parse ?? ((f: string, w: ParseWarning[]) => parseFile(path.join(xmlDir, f), w))
  const nodes: TNode[] = []
  const paras: TPara[] = []
  const tbooks: TBook[] = []
  const keyToNode = new Map<string, number>()
  const warnings: string[] = []

  const addNode = (key: string, parent: number, title: string, kind: NodeKind, coll: Collection, book: number, rend = ''): number => {
    key = KEY_OVERRIDES[key] ?? key
    const existing = keyToNode.get(key)
    if (existing !== undefined) {
      const n = nodes[existing]
      if (n.book === book && n.parent === parent) return existing // continuation file re-opens the same div
      warnings.push(`key collision ${key} (${title}) with ${n.title}`)
      let i = 2
      while (keyToNode.has(`${key}x${i}`)) i++
      key = `${key}x${i}`
    }
    const idx = nodes.length
    nodes.push({ idx, key, parent, title, kind, coll, book, rend, start: -1, end: -1, children: [] })
    keyToNode.set(key, idx)
    if (parent >= 0) nodes[parent].children.push(idx)
    return idx
  }

  for (const g of GROUPS) {
    const coll = (g.key.split('-')[0] as Collection)
    addNode(g.key, g.parent ? keyToNode.get(g.parent)! : -1, g.title, 'group', ['mula', 'atta', 'tika', 'anya'].includes(coll) ? coll : 'mula', -1)
  }

  for (const def of books) {
    const bookIdx = tbooks.length
    const prefix = collPrefix(def.coll, def.key)
    const parentIdx = keyToNode.get(def.parent)
    if (parentIdx === undefined) throw new Error(`unknown parent ${def.parent} of ${def.id}`)
    const tb: TBook = { idx: bookIdx, def, root: -1, paraCount: 0 }
    tbooks.push(tb)
    let rootIdx = -1
    if (def.key) rootIdx = addNode(def.key, parentIdx, def.title, 'book', def.coll, bookIdx)
    tb.root = rootIdx

    let pending: TPara[] = [] // paragraphs before the first node of a div based file
    const ownerOf = (stack: Entry[]) => stack[stack.length - 1]
    const addPara = (stack: Entry[], p: Omit<TPara, 'node' | 'idx' | 'book'>) => {
      const para: TPara = { ...p, book: bookIdx, idx: tb.paraCount++, node: -1 }
      paras.push(para)
      const top = ownerOf(stack)
      if (top.virtual && lastNode < 0) pending.push(para)
      else assign(para, top.virtual ? lastNode : top.node)
    }
    let lastNode = -1
    const assign = (para: TPara, node: number) => {
      para.node = node
      lastNode = node
      if (nodes[node].start < 0) nodes[node].start = para.idx
    }
    const flushPending = (node: number) => {
      for (const p of pending) assign(p, node)
      pending = []
    }

    for (let fi = 0; fi < def.files.length; fi++) {
      const w: ParseWarning[] = []
      const items = parse(def.files[fi], w)
      for (const x of w) warnings.push(`${x.file}: ${x.msg}`)
      const base: Entry = rootIdx >= 0
        ? { node: rootIdx, rank: -1, div: true, rend: '', numbered: false }
        : { node: parentIdx, rank: -1, div: true, rend: '', numbered: false, virtual: true }
      const stack: Entry[] = [base]
      let bookHeadingSeen = false

      for (const it of items) {
        if (it.k === 'div') {
          while (stack.length > 1 && !ownerOf(stack).div) stack.pop()
          const parent = ownerOf(stack).node
          let key = divKey(it.id, prefix)
          if (!key || (rootIdx >= 0 && stack.length === 1 && key !== nodes[rootIdx].key && !key.startsWith(nodes[rootIdx].key + '-'))) {
            // div ids outside the book key (e.g. tika files keyed by title): positional key under the parent
            key = `~${nodes.length}`
          }
          const idx = addNode(key, parent, '', ownerOf(stack).virtual ? 'book' : 'div', def.coll, bookIdx, it.type)
          if (ownerOf(stack).virtual) { flushPending(idx); if (tb.root < 0) tb.root = idx }
          stack.push({ node: idx, rank: -1, div: true, rend: it.type, numbered: false })
          continue
        }
        if (it.k === 'end') {
          while (stack.length > 1) {
            const e = stack.pop()!
            if (e.div) break
          }
          continue
        }
        const title = plainText(it.text)
        if (it.head) {
          // the <head> of a div is its title; later heads are content
          const top = ownerOf(stack)
          if (!top.virtual && top.div && !nodes[top.node].title) {
            nodes[top.node].title = title
            nodes[top.node].rend = it.rend
          }
          addPara(stack, { rend: it.rend, num: it.num, text: it.text })
          continue
        }
        let rank = HEADING_RANK[it.rend]
        if (it.rend === 'book') {
          // the first book heading of a file is the title of the book root (already a node)
          if (!bookHeadingSeen) { bookHeadingSeen = true; rank = undefined as unknown as number }
        }
        if (rank === undefined || ownerOf(stack).virtual || !title || VOLUME_RE.test(title)) {
          addPara(stack, { rend: it.rend, num: it.num, text: it.text })
          continue
        }
        const numbered = NUMBERED_RE.test(title)
        let eff = rank
        while (stack.length > 1 && !ownerOf(stack).div) {
          const top = ownerOf(stack)
          if (top.rank > rank) { stack.pop(); continue }
          if (top.rank === rank) {
            if (!numbered && top.numbered && top.rend === it.rend) { eff = rank + 0.5; break }
            stack.pop(); continue
          }
          break
        }
        const parent = ownerOf(stack).node
        const idx = addNode(`~${nodes.length}`, parent, title, 'heading', def.coll, bookIdx, it.rend)
        stack.push({ node: idx, rank: eff, div: false, rend: it.rend, numbered })
        addPara(stack, { rend: it.rend, num: it.num, text: it.text })
      }
      if (pending.length) {
        warnings.push(`${def.files[fi]}: ${pending.length} paragraphs outside any node`)
        if (tb.root >= 0) flushPending(tb.root)
      }
    }
  }

  // para ranges: end = max end in the subtree
  const setEnd = (i: number): number => {
    const n = nodes[i]
    let end = -1
    for (const c of n.children) end = Math.max(end, setEnd(c))
    if (n.kind !== 'group') {
      // own paragraphs are contiguous from start until the first child
      end = Math.max(end, ownEnd.get(i) ?? -1)
      if (n.start < 0 && n.children.length) n.start = Math.min(...n.children.map(c => nodes[c].start).filter(s => s >= 0))
    }
    n.end = end
    return end
  }
  const ownEnd = new Map<number, number>()
  for (const p of paras) ownEnd.set(p.node, Math.max(ownEnd.get(p.node) ?? -1, p.idx + 1))
  for (const n of nodes) if (n.parent < 0) setEnd(n.idx)

  assignHeadingKeys(nodes, keyToNode, warnings)
  for (const n of nodes) {
    if (!n.title) n.title = n.kind === 'book' ? (tbooks[n.book]?.def.title ?? n.key) : n.key
    if (n.kind !== 'group' && n.start < 0) warnings.push(`empty node ${n.key} ${n.title}`)
  }
  return { nodes, paras, books: tbooks, keyToNode, warnings }
}

const LEADING_NUM_RE = /^\(?(\d+)/

/**
 * keys of heading nodes (and divs without a usable id), top down. In a parent:
 *  - div children keep their id based keys
 *  - numbered headings use their number ("1. Sīlaniddeso" -> -1) when the numbers are unique in the parent
 *  - unnumbered headings get "0" before the first numbered sibling (intro) or "<previous number>a, b.." after it
 *  - when the numbers repeat (numbering restarts) or no heading is numbered: positional 1..n
 */
export function assignHeadingKeys(nodes: TNode[], keyToNode: Map<string, number>, warnings: string[]) {
  const visit = (pi: number) => {
    const p = nodes[pi]
    const temp = p.children.filter(c => nodes[c].key.startsWith('~'))
    if (temp.length) {
      const used = new Set(p.children.filter(c => !nodes[c].key.startsWith('~')).map(c => nodes[c].key.slice(p.key.length + 1)))
      const nums = temp.map(c => LEADING_NUM_RE.exec(nodes[c].title)?.[1])
      const numbered = nums.filter((n): n is string => !!n)
      // longest run of unnumbered headings (each gets a letter after the previous number)
      let run = 0, maxRun = 0
      for (const n of nums) { run = n ? 0 : run + 1; maxRun = Math.max(maxRun, run) }
      const unique = numbered.length * 2 >= nums.length && maxRun <= 26 && new Set(numbered.map(n => +n)).size === numbered.length &&
        numbered.every(n => !used.has(String(+n)))
      const suffixes: string[] = []
      if (unique) {
        // intro headings before the first number: 0, 0a, 0b ..; after number N: Na, Nb ..
        let prev = ''
        let letter = 0
        for (const n of nums) {
          if (n) { prev = String(+n); letter = 0; suffixes.push(prev); continue }
          letter++
          suffixes.push(prev ? prev + String.fromCharCode(96 + letter) : letter === 1 ? '0' : '0' + String.fromCharCode(95 + letter))
        }
      } else {
        let i = 0
        for (let k = 0; k < temp.length; k++) {
          do i++; while (used.has(String(i)))
          suffixes.push(String(i))
        }
      }
      temp.forEach((c, k) => {
        let key = `${p.key}-${suffixes[k]}`
        key = KEY_OVERRIDES[key] ?? key
        if (keyToNode.has(key)) { warnings.push(`key collision ${key} ${nodes[c].title}`); key += `x${c}` }
        keyToNode.delete(nodes[c].key)
        nodes[c].key = key
        keyToNode.set(key, c)
      })
    }
    for (const c of p.children) visit(c)
  }
  for (const n of nodes) if (n.parent < 0) visit(n.idx)
}

/** DFS order of the nodes (tree order) */
export function dfsOrder(c: Corpus): number[] {
  const out: number[] = []
  const walk = (i: number) => { out.push(i); for (const ch of c.nodes[i].children) walk(ch) }
  for (const n of c.nodes) if (n.parent < 0) walk(n.idx)
  return out
}
