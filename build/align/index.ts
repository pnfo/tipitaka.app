/**
 * Word level alignment of the commentaries ("glosses"): every lemma of an aṭṭhakathā / ṭīkā paragraph is matched
 * to the words it quotes in the mūla / aṭṭhakathā (see dev-docs/alignments.md).
 *
 *  1. sections: the commentary is cut at numbered paragraphs (paranum links) and headings. Each section gets a
 *     window of the target text: from its anchor paragraph to the next section's anchor, or the mirrored node.
 *  2. lemmas of the section (lemmas.ts) are matched in the window in order (match.ts).
 *  3. extent: the explanation of a lemma runs to the next matched lemma (or the next heading).
 *  4. ṭīkā lemmas that quote an aṭṭhakathā lemma are chained to its mūla words (kind mula-tika).
 */
import type { Corpus, TNode, TPara } from '../tree'
import { mirrorTarget, paraPos, type LinkKind, type ParaLink } from '../links'
import { extractLemmas, type Lemma } from './lemmas'
import { matchSection, type MatchKind } from './match'
import { foldWord, stream, words } from './text'
import { NodeTexts, resolveSelector, type Decision, type StoredDecision } from './decisions'
import { COMMENTS_ON, SELF_COMMENTARY, isCommentary } from './books'

export type GlossKind = LinkKind
export type GlossSource = 'lemma' | 'chain' | 'ai' | 'manual'

export interface Gloss {
  kind: GlossKind
  src: GlossSource
  mk: MatchKind | 'chain' | 'ai'
  conf: number
  /** lemma: commentary book, [cIdx, cS] .. [cEIdx, cE] (markup offsets of the bold letters) */
  cBook: number; cIdx: number; cS: number; cEIdx: number; cE: number
  /** end of the explanation: paragraph xEIdx, before offset xE */
  xEIdx: number; xE: number
  /** target words: [tIdx, tS] .. [tEIdx, tE] */
  tBook: number; tIdx: number; tS: number; tEIdx: number; tE: number
}

export interface BookStats { book: number; lemmas: number; exact: number; trim: number; reorder: number; nowindow: number; chained: number; ai: number; suppressed: number }

export interface AlignResult {
  glosses: Gloss[]; links: ParaLink[]; stats: BookStats[]; warnings: string[]
  /** the books each commentary book was aligned against */
  targets: Map<number, number[]>
}

const HEADINGS = new Set(['book', 'chapter', 'title', 'subhead', 'subsubhead', 'nikaya'])
const isHeading = (p: TPara) => HEADINGS.has(p.rend)
const isVerse = (p: TPara) => p.rend.startsWith('gatha')

interface TWord { f: string; s: number; e: number; idx: number; bold: boolean }
interface Target { book: number; ws: TWord[]; start: Int32Array; byWord?: Map<string, number[]> }
interface Vote { book: number; idx: number; w: number }
interface Cluster { book: number; lo: number; hi: number; w: number; votes: Vote[] }

export interface SecLemma { p0: number; s: number; p1: number; e: number; l: Lemma }
/** cont: a later piece of a long section without anchor (its window follows the matches of the previous piece) */
interface Section { i0: number; i1: number; tb: number; ws: number; we: number; kind: LinkKind; anchored: boolean; cont?: boolean }

export interface SectionDebug {
  book: number; i0: number; i1: number; tb: number; ws: number; we: number; anchored: boolean; lemmas: SecLemma[]; matched: boolean[]
  /** ṭīkā sections: the mūla paragraphs the aṭṭhakathā window explains */
  mula?: { tb: number; ws: number; we: number } | null
}
export interface AlignOptions {
  books?: number[]
  /** stored AI / manual decisions (data/alignments/*.jsonl) */
  decisions?: StoredDecision[]
  log?: (m: string) => void
  onSection?: (d: SectionDebug) => void
}

export function alignCommentaries(c: Corpus, paranum: ParaLink[], opt: AlignOptions = {}): AlignResult {
  const para = (book: number, idx: number) => c.paras[paraPos(c, book, idx)]
  // books with their own commentary inside: paragraph ranges of the commentary parts and of the root text parts
  const range = (key: string): [number, number] | null => { const ni = c.keyToNode.get(key); return ni === undefined ? null : [c.nodes[ni].start, c.nodes[ni].end] }
  const selfParts = new Map<number, { comm: [number, number][]; root: [number, number][] }>()
  for (const [id, parts] of Object.entries(SELF_COMMENTARY)) {
    const b = c.books.find(x => x.def.id === id)
    if (!b) continue
    selfParts.set(b.idx, {
      comm: Object.keys(parts).map(range).filter((r): r is [number, number] => !!r),
      root: [...new Set(Object.values(parts).flat())].map(range).filter((r): r is [number, number] => !!r),
    })
  }
  const inRanges = (rs: [number, number][], i: number) => rs.some(([a, z]) => i >= a && i < z)

  const anchorOf = new Map<number, ParaLink>()
  // AI section maps add anchors where the paragraph numbers give none; they do not replace them
  for (const l of paranum) {
    const k = paraPos(c, l.fromBook, l.fromIdx)
    if (l.source !== 'ai' || !anchorOf.has(k)) anchorOf.set(k, l)
  }

  // target text words per book (a few books cached: atta books are aligned against one mūla book mostly)
  const twCache = new Map<number, Target>()
  const targetWords = (book: number): Target => {
    let t = twCache.get(book)
    if (!t) {
      const ws: TWord[] = []
      const n = c.books[book].paraCount
      const start = new Int32Array(n + 1)
      for (let i = 0; i < n; i++) {
        start[i] = ws.length
        const p = para(book, i)
        const own = selfParts.get(book) // the root text only, not the commentary in the same book
        if (!isHeading(p) && (!own || !inRanges(own.comm, i))) for (const w of words(p.text)) ws.push({ f: w.f, s: w.s, e: w.e, idx: i, bold: w.b[0] })
      }
      start[n] = ws.length
      t = { book, ws, start }
      if (twCache.size >= 16) twCache.delete(twCache.keys().next().value!)
      twCache.set(book, t)
    }
    return t
  }

  // node mirrors: by key (atta-dn-1-1 → dn-1-1), else by title (titleMirrors), else the parent's
  const titleMirror = new Map<number, number>()
  const mirrorCache = new Map<number, { node: TNode; kind: LinkKind } | null>()
  const mirrorOf = (ni: number): { node: TNode; kind: LinkKind } | null => {
    if (mirrorCache.has(ni)) return mirrorCache.get(ni)!
    const n = c.nodes[ni]
    const t = mirrorTarget(c, n.key)
    let res: { node: TNode; kind: LinkKind } | null = null
    if (t) { const node = c.nodes[c.keyToNode.get(t.key)!]; if (node.start >= 0) res = { node, kind: t.kind } }
    const tm = titleMirror.get(ni)
    if (!res && tm !== undefined) res = { node: c.nodes[tm], kind: n.coll === 'atta' ? 'mula-atta' : 'atta-tika' }
    if (!res && n.parent >= 0 && c.nodes[n.parent].kind !== 'group') res = mirrorOf(n.parent)
    mirrorCache.set(ni, res)
    return res
  }

  // books containing each long word (book detection), built on first use
  let globalCache: Map<string, number[]> | null = null
  const globalIndex = () => (globalCache ??= longWordBooks(c))

  /** the mūla paragraphs explained by the aṭṭhakathā paragraphs [ws, we) of book ab (from their glosses) */
  const mulaWindow = (ab: number, ws: number, we: number): { tb: number; ws: number; we: number } | null => {
    let tb = -1, lo = Infinity, hi = -1
    for (let i = ws; i < we; i++) {
      for (const g of attaByPara.get(paraPos(c, ab, i)) ?? []) {
        if (g.kind !== 'mula-atta' || g.conf < 0.7 || (tb >= 0 && g.tBook !== tb)) continue
        tb = g.tBook; lo = Math.min(lo, g.tIdx); hi = Math.max(hi, g.tEIdx)
      }
    }
    return tb < 0 ? null : { tb, ws: Math.max(0, lo - 2), we: Math.min(c.books[tb].paraCount, hi + 3) }
  }

  const glosses: Gloss[] = []
  const stats: BookStats[] = []
  // only some books: the aṭṭhakathā books are aligned too (not reported) when a ṭīkā needs their glosses
  const wantTika = !opt.books || opt.books.some(x => c.books[x].def.coll !== 'atta')
  const reported = (book: number) => !opt.books || opt.books.includes(book)
  const commentaryBooks = c.books.filter(b => isCommentary(b.def) && (reported(b.idx) || (wantTika && b.def.coll === 'atta')))
  // aṭṭhakathā first: ṭīkā lemmas are chained through the aṭṭhakathā glosses
  commentaryBooks.sort((a, b) => (a.def.coll === b.def.coll ? a.idx - b.idx : a.def.coll === 'atta' ? -1 : b.def.coll === 'atta' ? 1 : a.idx - b.idx))
  const attaByPara = new Map<number, Gloss[]>() // paraPos of the atta lemma -> glosses

  // stored decisions by the lemma they are about: paraPos -> [word start, word end, decision]
  const warnings: string[] = []
  const nt = new NodeTexts(c)
  const byLemma = new Map<number, { s: number; e: number; d: Decision }[]>()
  const rank = (d: Decision) => (d.src.startsWith('manual') ? 2 : d.src === 'ai-check' ? 1 : 0)
  const wanted = new Set(commentaryBooks.map(b => b.idx))
  for (const { file, line, d } of opt.decisions ?? []) {
    const ni = c.keyToNode.get(d.c.k)
    if (ni !== undefined && !wanted.has(c.nodes[ni].book)) continue
    const r = resolveSelector(nt, d.c)
    if (!r) { warnings.push(`${file}:${line} lemma "${d.c.q}" not found in ${d.c.k}`); continue }
    if (!r.exact) warnings.push(`${file}:${line} lemma "${d.c.q}" in ${d.c.k} drifted (the words before it changed) - check it`)
    const w = r.ws[r.w0]
    const pos = paraPos(c, r.book, w.idx)
    const list = byLemma.get(pos) ?? []
    const same = list.find(x => x.s === w.s)
    if (same) { if (rank(d) >= rank(same.d)) same.d = d } else list.push({ s: w.s, e: w.e, d })
    byLemma.set(pos, list)
  }
  const decisionFor = (book: number, sl: SecLemma) => byLemma.get(paraPos(c, book, sl.p0))?.find(x => sl.s >= x.s && sl.s < x.e)?.d

  const targetsOf = (b: (typeof commentaryBooks)[number]) => {
    if (selfParts.has(b.idx)) return [b.idx]
    const listed = COMMENTS_ON[b.def.id]?.map(id => c.books.find(x => x.def.id === id)?.idx).filter((x): x is number => x !== undefined)
    return listed?.length ? listed : [...new Set([...candidateBooks(c, b.idx, paranum), ...votedBooks(c, b.idx, globalIndex)])]
  }
  const bookTargets = new Map(commentaryBooks.map(b => [b.idx, targetsOf(b)]))
  for (const b of commentaryBooks) {
    const own = selfParts.get(b.idx)
    const mirrors = own
      ? titleMirrors(c, b.idx, [b.idx], n => inRanges(own.comm, n.start), n => inRanges(own.root, n.start))
      : titleMirrors(c, b.idx, bookTargets.get(b.idx)!)
    for (const [k, v] of mirrors) titleMirror.set(k, v)
  }

  for (const b of commentaryBooks) {
    const st: BookStats = { book: b.idx, lemmas: 0, exact: 0, trim: 0, reorder: 0, nowindow: 0, chained: 0, ai: 0, suppressed: 0 }
    if (reported(b.idx)) stats.push(st)
    const onSection = reported(b.idx) ? opt.onSection : undefined
    const own = selfParts.get(b.idx)
    const sections = buildSections(c, b.idx, anchorOf, mirrorOf).filter(sec => !own || inRanges(own.comm, sec.i0))
    const targets = bookTargets.get(b.idx)!
    // the kind of a gloss follows the collections: aṭṭhakathā → mūla, ṭīkā → aṭṭhakathā, ṭīkā → mūla (Nettivibhāvinī);
    // commentaries on ṭīkās and añña books count as atta-tika (a commentary on a commentary)
    const kindTo = (tb: number): LinkKind => (b.def.coll === 'atta' ? 'mula-atta' : c.books[tb].def.coll === 'mula' ? 'mula-tika' : 'atta-tika')
    const bookGlosses: Gloss[] = []
    let prevSec: Section | null = null
    // where the previous section matched, and how often the paranum windows agreed with the seeds in this book
    let last: { tb: number; idx: number } | null = null
    let agree = 0, disagree = 0
    for (const sec0 of sections) {
      const lemmas = sectionLemmas(c, b.idx, sec0.i0, sec0.i1)
      st.lemmas += lemmas.length
      if (!lemmas.length) continue
      // the window: paranum / mirror, unless the distinctive lemmas of the section are clearly elsewhere
      const cl = cluster(seedVotes(lemmas, targets.map(targetWords)))
      let sec = sec0
      if (sec0.cont && !(cl && cl.w >= 2) && last) {
        // a long section without anchors moves on through the text: continue after the last match
        sec = { ...sec0, tb: last.tb, ws: Math.max(0, last.idx - 2), we: Math.min(c.books[last.tb].paraCount, last.idx + 30), kind: kindTo(last.tb) }
      } else if (sec.tb >= 0) {
        sec = { ...sec, ws: Math.max(0, sec.ws - 1), we: Math.min(c.books[sec.tb].paraCount, sec.we + 3) }
        const inP = cl ? cl.votes.filter(v => v.book === sec.tb && v.idx >= sec.ws && v.idx < sec.we).reduce((a, v) => a + v.w, 0) : 0
        if (cl && cl.w >= 2) {
          if (cl.w * 0.5 > inP) { sec = clusterSection(sec0, cl, kindTo(cl.book), c); disagree++ } else agree++
        } else if (last && disagree > agree && (last.tb !== sec.tb || sec.ws < last.idx - 5 || sec.ws > last.idx + 60)) {
          // the paranums of this book are unreliable (verse numbers restart): continue after the previous section
          sec = { ...sec0, tb: last.tb, ws: Math.max(0, last.idx - 1), we: Math.min(c.books[last.tb].paraCount, last.idx + 25), kind: kindTo(last.tb), anchored: false }
        }
      } else if (cl) sec = clusterSection(sec0, cl, kindTo(cl.book), c)
      else if (prevSec) sec = { ...prevSec, i0: sec0.i0, i1: sec0.i1, anchored: false }
      const decided = lemmas.map(sl => decisionFor(b.idx, sl))
      for (const [k, d] of decided.entries()) {
        if (!d) continue
        if (d.v !== 'match' || !d.m) { st.suppressed++; continue }
        const r = resolveSelector(nt, d.m)
        if (!r) { warnings.push(`decision for "${d.c.q}" in ${d.c.k}: "${d.m.q}" not found in ${d.m.k}`); decided[k] = undefined; continue }
        if (isHeading(para(r.book, r.ws[r.w0].idx))) { st.suppressed++; continue } // a title is named, not quoted
        if (!r.exact) warnings.push(`decision for "${d.c.q}" in ${d.c.k}: "${d.m.q}" drifted (the words before it changed) - check it`)
        st.ai++
        const sl = lemmas[k], a = r.ws[r.w0], z = r.ws[r.w1]
        bookGlosses.push({
          kind: kindTo(r.book), src: d.src.startsWith('manual') ? 'manual' : 'ai', mk: 'ai', conf: round(d.conf),
          cBook: b.idx, cIdx: sl.p0, cS: sl.s, cEIdx: sl.p1, cE: sl.e, xEIdx: sl.p1, xE: sl.e,
          tBook: r.book, tIdx: a.idx, tS: a.s, tEIdx: z.idx, tE: z.e,
        })
      }
      if (sec.tb < 0) { st.nowindow += decided.filter(d => !d).length; onSection?.({ ...sec, book: b.idx, lemmas, matched: decided.map(Boolean) }); continue }
      prevSec = sec
      const tw = targetWords(sec.tb)
      const w0 = tw.start[sec.ws], w1 = tw.start[sec.we]
      const win = tw.ws.slice(w0, w1)
      const strm = stream(win)
      const ms = matchSection(lemmas.map(x => x.l), strm)
      const debugMula = onSection && c.books[sec.tb].def.coll === 'atta' && b.def.coll !== 'atta' ? mulaWindow(sec.tb, sec.ws, sec.we) : null
      const matchedNow = ms.map((m, k) => !!m || !!decided[k])
      const lastM = ms.reduce<number>((a, m) => (m && m.kind !== 'reorder' ? Math.max(a, m.w1) : a), -1)
      if (lastM >= 0) last = { tb: sec.tb, idx: win[lastM].idx }
      // a ṭīkā also quotes the mūla directly: lemmas not in the aṭṭhakathā window are looked for in the mūla
      // paragraphs that the window's aṭṭhakathā lemmas explain
      if (c.books[sec.tb].def.coll === 'atta') {
        const open = ms.map((m, k) => (!m && !decided[k] ? k : -1)).filter(k => k >= 0)
        const mw = open.length ? mulaWindow(sec.tb, sec.ws, sec.we) : null
        if (mw) {
          const mt = targetWords(mw.tb)
          const mwin = mt.ws.slice(mt.start[mw.ws], mt.start[mw.we])
          const mm = matchSection(open.map(k => lemmas[k].l), stream(mwin))
          mm.forEach((m, j) => {
            if (!m || m.kind === 'reorder') return
            matchedNow[open[j]] = true
            st[m.kind]++
            const sl = lemmas[open[j]], a = mwin[m.w0], z = mwin[m.w1]
            bookGlosses.push({
              kind: 'mula-tika', src: 'lemma', mk: m.kind, conf: round(m.conf * 0.85),
              cBook: b.idx, cIdx: sl.p0, cS: sl.s, cEIdx: sl.p1, cE: sl.e, xEIdx: sl.p1, xE: sl.e,
              tBook: mw.tb, tIdx: a.idx, tS: a.s, tEIdx: z.idx, tE: z.e,
            })
          })
        }
      }
      onSection?.({ ...sec, book: b.idx, lemmas, matched: matchedNow, mula: debugMula })
      ms.forEach((m, k) => {
        if (!m || decided[k]) return
        st[m.kind]++
        const sl = lemmas[k]
        let end = m.w1
        if (sl.l.adi) {
          // "tiādi": up to the next matched lemma, or the end of the paragraph, within reason
          const next = ms.slice(k + 1).find(x => x && x.w0 > m.w1)
          const limit = next ? next.w0 - 1 : lastWordOfPara(win, m.w1)
          if (limit - m.w1 <= 80) end = Math.max(end, limit)
        }
        const a = win[m.w0], z = win[end]
        bookGlosses.push({
          kind: kindTo(sec.tb), src: 'lemma', mk: m.kind, conf: round(m.conf * (sec.anchored ? 1 : 0.9)),
          cBook: b.idx, cIdx: sl.p0, cS: sl.s, cEIdx: sl.p1, cE: sl.e, xEIdx: sl.p1, xE: sl.e,
          tBook: sec.tb, tIdx: a.idx, tS: a.s, tEIdx: z.idx, tE: z.e,
        })
      })
    }
    setExtents(c, b.idx, bookGlosses)
    if (b.def.coll === 'atta') for (const g of bookGlosses) push(attaByPara, paraPos(c, g.cBook, g.cIdx), g)
    else if (bookGlosses.some(g => g.kind === 'atta-tika')) {
      const chained = chainToMula(c, bookGlosses, attaByPara)
      st.chained = chained.length
      bookGlosses.push(...chained)
    }
    if (reported(b.idx)) glosses.push(...bookGlosses)
    opt.log?.(`${b.def.id}: ${st.lemmas} lemmas, ${st.exact + st.trim + st.reorder} matched`)
  }
  return { glosses, links: glossLinks(glosses), stats, warnings, targets: bookTargets }
}

/** books a commentary book can comment on: same book stem (s0513a1 -> s0513m, abh03a -> abh03m1..11), else
 * the same piṭaka part (vin04t.nrf -> vin*a), plus the targets of its paranum links */
function candidateBooks(c: Corpus, book: number, paranum: ParaLink[]): number[] {
  const id = c.books[book].def.id
  const target = c.books[book].def.coll === 'atta' ? 'mula' : 'atta'
  const of = (re: RegExp) => {
    const m = re.exec(id)
    return m ? c.books.filter(b => b.def.coll === target && b.def.id.startsWith(m[1])).map(b => b.idx) : []
  }
  let out = of(/^(s\d{4}|vin\d{2}|abh\d{2})/)
  if (!out.length) out = of(/^(s\d{2}|vin|abh)/)
  const linked = new Set(paranum.filter(l => l.fromBook === book).map(l => l.toBook))
  return [...new Set([...out, ...linked])]
}

/** a section title without numbers, diacritics and the commentary's "-vaṇṇanā" (Paṭhamapārājikakathāvaṇṇanā → paṭhamapārājikakathā) */
export function titleKey(t: string): string {
  return foldWord(t.replace(/^[\s(]*[\d.,–-]+[.)]?\s*/, '')).replace(/[^a-z]/g, '').replace(/(atthakatha)?vannana$|atthakatha$|tika$/, '').replace(/[aoem]$|am$|o$/, '')
}

/**
 * section mirrors by title, where keys do not mirror (title slug keys of the .nrf books): the commentary's nodes in
 * order, each to the next node of the target books with the same title (within the next 400 nodes)
 */
function titleMirrors(c: Corpus, book: number, targets: number[], isComm: (n: TNode) => boolean = () => true, isTarget: (n: TNode) => boolean = () => true): Map<number, number> {
  const out = new Map<number, number>()
  const tnodes = c.nodes.filter(n => targets.includes(n.book) && n.start >= 0 && n.kind !== 'book' && isTarget(n)).sort((a, b) => a.book - b.book || a.start - b.start || a.idx - b.idx)
  const tkeys = tnodes.map(n => titleKey(n.title))
  let at = 0
  for (const n of c.nodes) {
    if (n.book !== book || n.start < 0 || n.kind === 'book' || mirrorTarget(c, n.key) || !isComm(n)) continue
    const k = titleKey(n.title)
    if (k.length < 4) continue
    for (let j = at; j < tnodes.length && j < at + 400; j++) {
      if (tkeys[j] === k) { out.set(n.idx, tnodes[j].idx); at = j + 1; break }
    }
  }
  return out
}

const LONG_WORD = 10

/** the books (aṭṭhakathā, mūla, añña) in which each long word occurs */
function longWordBooks(c: Corpus): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (const b of c.books) {
    if (b.def.coll === 'tika') continue
    const base = paraPos(c, b.idx, 0)
    for (let i = 0; i < b.paraCount; i++) {
      for (const w of words(c.paras[base + i].text)) {
        if (w.f.length < LONG_WORD) continue
        const l = m.get(w.f)
        if (!l) m.set(w.f, [b.idx])
        else if (l[l.length - 1] !== b.idx) l.push(b.idx)
      }
    }
  }
  return m
}

/**
 * the books a commentary quotes, found by its long single word lemmas: each votes for the books it occurs in
 * (a word of few books weighs more). An aṭṭhakathā quotes mūla books, a ṭīkā aṭṭhakathā or añña books
 * (Vinayavinicchaya-ṭīkā → Vinayavinicchaya). Books with a good share of the votes.
 */
function votedBooks(c: Corpus, book: number, index: () => Map<string, number[]>): number[] {
  const allowed = c.books[book].def.coll === 'atta' ? new Set(['mula']) : new Set(['atta', 'anya'])
  const votes = new Map<number, number>()
  let total = 0
  const base = paraPos(c, book, 0)
  for (let i = 0; i < c.books[book].paraCount; i++) {
    const p = c.paras[base + i]
    if (isHeading(p) || !p.text.includes('**')) continue
    for (const l of extractLemmas(p.text)) {
      if (l.words.length !== 1 || l.parts.length) continue
      const bs = l.pats.map(x => index().get(x)).find(x => x)?.filter(x => allowed.has(c.books[x].def.coll))
      if (!bs?.length || bs.length > 8) continue
      for (const x of bs) votes.set(x, (votes.get(x) ?? 0) + 1 / bs.length)
      total += 1
    }
  }
  // not other commentaries (they quote the same words): those relations are in COMMENTS_ON
  return [...votes].filter(([x, v]) => v >= 20 && v >= total * 0.12 && (c.books[x].def.coll === 'atta' || !isCommentary(c.books[x].def)))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([x]) => x)
}

const MIN_SEED = 8
/** distinctive lemmas (long, at most 3 occurrences in the candidate books) vote for paragraphs of the target */
function seedVotes(lemmas: SecLemma[], targets: Target[]): Vote[] {
  const votes: Vote[] = []
  for (const { l } of lemmas) {
    if (l.parts.length || l.pats[0].length < MIN_SEED) continue
    const occ: { book: number; idx: number }[] = []
    for (const t of targets) {
      const byWord = wordIndex(t)
      if (l.words.length === 1) {
        for (const p of l.pats) for (const wi of byWord.get(p) ?? []) occ.push({ book: t.book, idx: t.ws[wi].idx })
      } else {
        for (const wi of byWord.get(l.words[0]) ?? []) {
          let f = ''
          for (let k = wi; k < t.ws.length && f.length < l.pats[0].length; k++) f += t.ws[k].f
          if (l.pats.some(p => f.startsWith(p) || (p.length >= 10 && f.startsWith(p.slice(0, -2))))) occ.push({ book: t.book, idx: t.ws[wi].idx })
        }
      }
      if (occ.length > 3) break
    }
    if (occ.length && occ.length <= 3) for (const o of occ) votes.push({ ...o, w: 1 / occ.length })
  }
  return votes
}

function wordIndex(t: Target): Map<string, number[]> {
  if (!t.byWord) {
    t.byWord = new Map()
    t.ws.forEach((w, i) => { if (w.f.length >= 2) push(t.byWord!, w.f, i) })
  }
  return t.byWord
}

const CLUSTER_SPAN = 25
/** the densest run of votes (within CLUSTER_SPAN paragraphs of one book) */
function cluster(votes: Vote[]): Cluster | null {
  if (!votes.length) return null
  votes.sort((a, b) => a.book - b.book || a.idx - b.idx)
  let best: Cluster | null = null
  let j = 0, sum = 0
  for (let i = 0; i < votes.length; i++) {
    sum += votes[i].w
    while (votes[j].book !== votes[i].book || votes[i].idx - votes[j].idx > CLUSTER_SPAN) sum -= votes[j++].w
    if (!best || sum > best.w + 1e-9) best = { book: votes[i].book, lo: votes[j].idx, hi: votes[i].idx, w: sum, votes }
  }
  return best
}

function clusterSection(sec: Section, cl: Cluster, kind: LinkKind, c: Corpus): Section {
  return { i0: sec.i0, i1: sec.i1, tb: cl.book, ws: Math.max(0, cl.lo - 2), we: Math.min(c.books[cl.book].paraCount, cl.hi + 4), kind, anchored: false }
}

const round = (x: number) => Math.round(x * 100) / 100
function push<K, V>(m: Map<K, V[]>, k: K, v: V) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]) }

function lastWordOfPara(win: TWord[], w: number): number {
  let i = w
  while (i + 1 < win.length && win[i + 1].idx === win[w].idx) i++
  return i
}

const PIECE = 15

/** commentary sections of a book and their target windows */
function buildSections(c: Corpus, book: number, anchorOf: Map<number, ParaLink>, mirrorOf: (ni: number) => { node: TNode; kind: LinkKind } | null): Section[] {
  const n = c.books[book].paraCount
  const base = paraPos(c, book, 0)
  const raw: { i0: number; i1: number; anchor?: ParaLink; node: number }[] = []
  let cur: (typeof raw)[number] | null = null
  for (let i = 0; i < n; i++) {
    const p = c.paras[base + i]
    if (isHeading(p)) { cur = null; continue }
    const a = anchorOf.get(base + i)
    if (!cur || a) { cur = { i0: i, i1: i + 1, anchor: a, node: p.node }; raw.push(cur) } else cur.i1 = i + 1
  }
  const out: Section[] = []
  const push = (sec: Section) => {
    // long sections without an anchor in pieces: one window cannot hold what a whole chapter of commentary explains
    if (sec.anchored || sec.i1 - sec.i0 <= PIECE) { out.push(sec); return }
    for (let i = sec.i0; i < sec.i1; i += PIECE) out.push({ ...sec, i0: i, i1: Math.min(sec.i1, i + PIECE), cont: i > sec.i0 })
  }
  raw.forEach((r, k) => {
    const nextAnchor = (tb: number, after: number) => {
      for (let j = k + 1; j < raw.length && j < k + 40; j++) {
        const a = raw[j].anchor
        if (a && a.toBook === tb) return a.toIdx > after ? a.toIdx : -1
      }
      return -1
    }
    const tbPara = (tb: number) => c.books[tb].paraCount
    if (r.anchor) {
      const tb = r.anchor.toBook, ws = r.anchor.toIdx
      const nx = nextAnchor(tb, ws)
      const we = nx > 0 && nx - ws <= 80 ? nx : Math.min(tbPara(tb), ws + 15)
      out.push({ i0: r.i0, i1: r.i1, tb, ws, we, kind: r.anchor.kind, anchored: true })
      return
    }
    const m = mirrorOf(r.node)
    if (!m) { push({ i0: r.i0, i1: r.i1, tb: -1, ws: 0, we: 0, kind: 'mula-atta', anchored: false }); return }
    const tb = m.node.book
    // continue from the previous anchored section when it is inside the mirrored node
    const prev = [...out].reverse().find(s => s.anchored && s.tb === tb)
    const ws = prev && prev.ws >= m.node.start && prev.ws < m.node.end ? prev.ws : m.node.start
    const nx = nextAnchor(tb, ws)
    const we = nx > 0 && nx - ws <= 80 ? nx : Math.min(m.node.end, ws + (m.node.end - m.node.start <= 150 ? 150 : 40))
    push({ i0: r.i0, i1: r.i1, tb, ws, we: Math.max(we, ws + 1), kind: m.kind, anchored: false })
  })
  return out
}

/** lemmas of paragraphs [i0, i1), verse lines that continue a bold quotation merged */
function sectionLemmas(c: Corpus, book: number, i0: number, i1: number): SecLemma[] {
  const out: SecLemma[] = []
  let prevVerseEnd: SecLemma | null = null
  for (let i = i0; i < i1; i++) {
    const p = c.paras[paraPos(c, book, i)]
    const ls = extractLemmas(p.text)
    ls.forEach((l, k) => {
      if (k === 0 && prevVerseEnd && l.atStart && isVerse(p)) {
        const m = prevVerseEnd
        m.l = { ...l, pats: l.pats.map(x => m.l.pats[0] + x), parts: [], adi: l.adi, atStart: m.l.atStart, atEnd: l.atEnd, s: m.l.s }
        m.p1 = i
        m.e = l.e
        return
      }
      out.push({ p0: i, s: l.s, p1: i, e: l.e, l })
    })
    const last = out[out.length - 1]
    prevVerseEnd = isVerse(p) && last && last.p1 === i && ls.length && ls[ls.length - 1].atEnd ? last : null
  }
  return out
}

/** the explanation of a lemma runs to the next lemma of the book (matched or not is irrelevant), or the next heading */
function setExtents(c: Corpus, book: number, gs: Gloss[]) {
  gs.sort((a, b) => a.cIdx - b.cIdx || a.cS - b.cS)
  const base = paraPos(c, book, 0)
  const n = c.books[book].paraCount
  const nextHeading = new Int32Array(n + 1)
  nextHeading[n] = n
  for (let i = n - 1; i >= 0; i--) nextHeading[i] = isHeading(c.paras[base + i]) ? i : nextHeading[i + 1]
  gs.forEach((g, k) => {
    const nh = nextHeading[g.cEIdx]
    let next: Gloss | undefined
    for (let j = k + 1; j < gs.length; j++) {
      if (gs[j].cIdx > g.cEIdx || (gs[j].cIdx === g.cEIdx && gs[j].cS >= g.cE)) { next = gs[j]; break }
    }
    if (next && next.cIdx < nh) {
      const text = c.paras[base + next.cIdx].text
      const open = boldOpen(text, next.cS)
      if (next.cIdx > g.cEIdx && /^[\s‘’'"“”–—\-|MVPT0-9.]*$/.test(text.slice(0, open))) {
        g.xEIdx = next.cIdx - 1
        g.xE = c.paras[base + g.xEIdx].text.length
      } else { g.xEIdx = next.cIdx; g.xE = open }
    } else {
      g.xEIdx = Math.max(g.cEIdx, nh - 1)
      g.xE = c.paras[base + g.xEIdx].text.length
    }
  })
}

/** offset of the ** that opens the bold run containing s (or s) */
function boldOpen(text: string, s: number): number {
  const i = text.lastIndexOf('**', s)
  return i >= 0 && s - i <= 4 ? i : s
}

/** ṭīkā glosses whose aṭṭhakathā target is an aṭṭhakathā lemma: the ṭīkā also explains that lemma's mūla words */
function chainToMula(c: Corpus, tika: Gloss[], attaByPara: Map<number, Gloss[]>): Gloss[] {
  const out: Gloss[] = []
  for (const g of tika) {
    if (g.kind !== 'atta-tika') continue
    const cands = attaByPara.get(paraPos(c, g.tBook, g.tIdx)) ?? []
    const a = cands.find(x => x.cIdx === g.tIdx && x.cS < g.tE && x.cE > g.tS && x.kind === 'mula-atta')
    if (!a) continue
    out.push({ ...g, kind: 'mula-tika', src: 'chain', mk: 'chain', conf: round(Math.min(g.conf, a.conf)), tBook: a.tBook, tIdx: a.tIdx, tS: a.tS, tEIdx: a.tEIdx, tE: a.tE })
  }
  return out
}

/** paragraph links derived from the glosses: every paragraph of a lemma's explanation -> the target paragraph */
export function glossLinks(gs: Gloss[]): ParaLink[] {
  const seen = new Set<string>()
  const out: ParaLink[] = []
  for (const g of gs) {
    if (g.src === 'chain') continue // the ṭīkā's link goes to the aṭṭhakathā
    for (let i = g.cIdx; i <= g.xEIdx; i++) {
      const k = `${g.cBook}:${i}:${g.tBook}:${g.tIdx}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ fromBook: g.cBook, fromIdx: i, toBook: g.tBook, toIdx: g.tIdx, kind: g.kind, source: 'gloss', conf: g.conf })
    }
  }
  return out
}
