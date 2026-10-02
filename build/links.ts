/**
 * Mūla ↔ aṭṭhakathā ↔ ṭīkā links.
 *
 *  - node level: atta-<k> mirrors <k>, tika-<k> mirrors atta-<k> (when both keys exist)
 *  - paragraph level (para_link): CST commentary paragraphs carry the paragraph number of the text they
 *    comment on. Inside the mirrored node of the nearest ancestor that has one, the paragraph with the same
 *    number (first number of a range) is the target.
 *  - data/alignments/*.tsv (manual or AI made links, see dev-docs/alignments.md) are added on top; rows that
 *    no longer resolve are reported.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Corpus, TNode } from './tree'

export type LinkKind = 'mula-atta' | 'atta-tika'
export interface ParaLink { fromBook: number; fromIdx: number; toBook: number; toIdx: number; kind: LinkKind; source: 'paranum' | 'manual' | 'ai'; conf: number }

const PREFIX_TARGET: [string, string, LinkKind][] = [['atta-', '', 'mula-atta'], ['tika2-', 'atta-', 'atta-tika'], ['tika-', 'atta-', 'atta-tika']]

/** key of the node this node comments on, if that key exists */
export function mirrorTarget(c: Corpus, key: string): { key: string; kind: LinkKind } | null {
  for (const [p, target, kind] of PREFIX_TARGET) {
    if (key.startsWith(p)) {
      const k = target + key.slice(p.length)
      return c.keyToNode.has(k) ? { key: k, kind } : null
    }
  }
  return null
}

const firstNum = (num: string) => /\d+/.exec(num)?.[0] ?? ''

export function buildParaLinks(c: Corpus, alignDir?: string, warnings: string[] = []): ParaLink[] {
  const links: ParaLink[] = []
  // per node: paranum -> para idx of the target node's range (lazy)
  const numIndex = new Map<number, Map<string, number>>()
  const indexFor = (n: TNode) => {
    let m = numIndex.get(n.idx)
    if (!m) {
      m = new Map()
      for (let i = n.start; i < n.end; i++) {
        const p = c.paras[paraPos(c, n.book, i)]
        const f = firstNum(p.num)
        if (f && !m.has(f)) m.set(f, i)
      }
      numIndex.set(n.idx, m)
    }
    return m
  }
  // nearest ancestor (or self) with a mirror target
  const targetCache = new Map<number, { node: TNode; kind: LinkKind } | null>()
  const targetOf = (ni: number): { node: TNode; kind: LinkKind } | null => {
    if (targetCache.has(ni)) return targetCache.get(ni)!
    const n = c.nodes[ni]
    const t = mirrorTarget(c, n.key)
    const res = t ? { node: c.nodes[c.keyToNode.get(t.key)!], kind: t.kind } : n.parent >= 0 && c.nodes[n.parent].kind !== 'group' ? targetOf(n.parent) : null
    targetCache.set(ni, res)
    return res
  }
  for (const p of c.paras) {
    const f = firstNum(p.num)
    if (!f || c.nodes[p.node].coll === 'mula') continue
    const t = targetOf(p.node)
    if (!t || t.node.start < 0) continue
    const toIdx = indexFor(t.node).get(f)
    if (toIdx === undefined) continue
    links.push({ fromBook: p.book, fromIdx: p.idx, toBook: t.node.book, toIdx, kind: t.kind, source: 'paranum', conf: 1 })
  }
  if (alignDir && fs.existsSync(alignDir)) links.push(...readAlignments(c, alignDir, warnings))
  return links
}

/**
 * alignment files: tab separated `from_key  from_para  to_key  to_para  [source]  [confidence]` where para is
 * the paragraph number (num) or #<n> for the n-th paragraph (1 based) inside the node. Lines starting with # are comments.
 */
export function readAlignments(c: Corpus, dir: string, warnings: string[]): ParaLink[] {
  const out: ParaLink[] = []
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.tsv')).sort()) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
    lines.forEach((line, ln) => {
      if (!line.trim() || line.startsWith('#')) return
      const [fk, fp, tk, tp, source = 'manual', conf = '1'] = line.split('\t')
      const from = resolvePara(c, fk, fp), to = resolvePara(c, tk, tp)
      if (!from || !to) { warnings.push(`${f}:${ln + 1} alignment does not resolve: ${line}`); return }
      const fc = c.nodes[c.keyToNode.get(fk)!].coll
      out.push({ fromBook: from.book, fromIdx: from.idx, toBook: to.book, toIdx: to.idx, kind: fc === 'tika' ? 'atta-tika' : 'mula-atta', source: source === 'ai' ? 'ai' : 'manual', conf: +conf || 1 })
    })
  }
  return out
}

function resolvePara(c: Corpus, key: string, para: string): { book: number; idx: number } | null {
  const ni = c.keyToNode.get(key)
  if (ni === undefined || !para) return null
  const n = c.nodes[ni]
  if (para.startsWith('#')) {
    const i = n.start + (+para.slice(1) - 1)
    return i >= n.start && i < n.end ? { book: n.book, idx: i } : null
  }
  for (let i = n.start; i < n.end; i++) if (firstNum(c.paras[paraPos(c, n.book, i)].num) === para) return { book: n.book, idx: i }
  return null
}

// position of (book, idx) in corpus.paras: books are written in order, so a prefix sum is enough
const bookOffsets = new WeakMap<Corpus, number[]>()
export function paraPos(c: Corpus, book: number, idx: number): number {
  let offs = bookOffsets.get(c)
  if (!offs) {
    offs = []
    let sum = 0
    for (const b of c.books) { offs.push(sum); sum += b.paraCount }
    bookOffsets.set(c, offs)
  }
  return offs[book] + idx
}
