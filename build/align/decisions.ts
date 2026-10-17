/**
 * Stored alignment decisions (AI or manual): data/alignments/*.jsonl, one per line.
 *
 *   {"c":{"k":"atta-dn-1-1-1","q":"patipannohoti","pre":"metiadininamapadani","o":31},
 *    "m":{"k":"dn-1-1-1","q":"addhanamaggappatipannohoti","pre":"antaracanalandam","o":17},
 *    "v":"match","conf":0.85,"src":"ai:sonnet","job":"3f2a…"}
 *
 * c is the lemma, m the words it quotes. Both are text quote selectors over the folded words of a node (see text.ts:
 * no spaces, no diacritics): q the quoted words, pre the (up to 3) words before them, o the word offset in the node
 * as a hint. Positions are never stored, so a decision survives upstream corrections that do not touch its words;
 * one that no longer resolves is reported by the build (and its section re-run by `npm run align:ai -- --repair`).
 * v: match (use m), not-lemma / none (the bold text is no quotation / quotes nothing in the text: no gloss).
 * src: ai:<model>, ai-check (correction found by a spot check), manual. manual wins over ai.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Corpus } from '../tree'
import { paraPos } from '../links'
import { words } from './text'

export interface Selector { k: string; q: string; pre?: string; o?: number }
export type Verdict = 'match' | 'not-lemma' | 'none'
export interface Decision { c: Selector; m?: Selector; v: Verdict; conf: number; src: string; job?: string; note?: string }
export interface StoredDecision { file: string; line: number; d: Decision }

export function readDecisions(dir: string): StoredDecision[] {
  if (!fs.existsSync(dir)) return []
  const out: StoredDecision[] = []
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
      if (l.trim()) out.push({ file: f, line: i + 1, d: JSON.parse(l) as Decision })
    })
  }
  return out
}

/** a stable order for the decision files (sorted by lemma, one line each) */
export function writeDecisions(file: string, ds: Decision[]) {
  const key = (d: Decision) => `${d.c.k}\t${String(d.c.o ?? 0).padStart(7, '0')}\t${d.c.q}`
  const sorted = [...ds].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, sorted.map(d => JSON.stringify(d)).join('\n') + (sorted.length ? '\n' : ''))
}

export interface NodeWord { f: string; s: number; e: number; idx: number }
interface NodeText { book: number; ws: NodeWord[]; f: string; starts: number[] }

/** the folded words of a node's paragraphs (cached per corpus) */
export class NodeTexts {
  private cache = new Map<string, NodeText | null>()
  constructor(private c: Corpus) {}
  get(key: string): NodeText | null {
    let t = this.cache.get(key)
    if (t !== undefined) return t
    t = null
    const ni = this.c.keyToNode.get(key)
    const n = ni === undefined ? null : this.c.nodes[ni]
    if (n && n.start >= 0) {
      const ws: NodeWord[] = []
      for (let i = n.start; i < n.end; i++) for (const w of words(this.c.paras[paraPos(this.c, n.book, i)].text)) ws.push({ f: w.f, s: w.s, e: w.e, idx: i })
      const starts: number[] = []
      let f = ''
      for (const w of ws) { starts.push(f.length); f += w.f }
      t = { book: n.book, ws, f, starts }
    }
    if (this.cache.size > 2000) this.cache.clear()
    this.cache.set(key, t)
    return t
  }
}

export interface Resolved { book: number; ws: NodeWord[]; w0: number; w1: number; exact: boolean }

/**
 * finds a selector in its node: occurrences of q starting at a word, the one preceded by pre and nearest to the
 * offset hint. A q that is not found at all is null (broken).
 */
export function resolveSelector(nt: NodeTexts, sel: Selector): Resolved | null {
  const t = nt.get(sel.k)
  if (!t || !sel.q) return null
  const wordAt = (pos: number) => { let lo = 0, hi = t.starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t.starts[m] <= pos) lo = m; else hi = m - 1 } return lo }
  let best: { w0: number; w1: number; score: number; exact: boolean } | null = null
  for (let i = t.f.indexOf(sel.q); i >= 0; i = t.f.indexOf(sel.q, i + 1)) {
    const w0 = wordAt(i)
    if (t.starts[w0] !== i) continue
    const w1 = wordAt(i + sel.q.length - 1)
    const before = t.f.slice(Math.max(0, i - (sel.pre?.length ?? 0)), i)
    const preOk = !sel.pre || before === sel.pre
    const score = (preOk ? 0 : 100000) + Math.abs(w0 - (sel.o ?? w0))
    if (!best || score < best.score) best = { w0, w1, score, exact: preOk }
  }
  return best ? { book: t.book, ws: t.ws, w0: best.w0, w1: best.w1, exact: best.exact } : null
}

/** the selector of the words covering markup [s, e) of paragraph idx (in the node key) */
export function makeSelector(nt: NodeTexts, key: string, idx: number, s: number, e: number, idxEnd = idx): Selector | null {
  const t = nt.get(key)
  if (!t) return null
  const w0 = t.ws.findIndex(w => w.idx === idx && w.e > s)
  let w1 = -1
  for (let i = t.ws.length - 1; i >= 0; i--) if (t.ws[i].idx === idxEnd && t.ws[i].s < e) { w1 = i; break }
  if (w0 < 0 || w1 < w0) return null
  return { k: key, q: t.ws.slice(w0, w1 + 1).map(w => w.f).join(''), pre: t.ws.slice(Math.max(0, w0 - 3), w0).map(w => w.f).join(''), o: w0 }
}
