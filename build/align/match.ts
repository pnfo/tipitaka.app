/**
 * Finds the lemmas of a commentary section in the text it comments on (a window of the target text).
 *
 * Each lemma gets candidate positions in the folded window stream, then the best order preserving choice is
 * made over the whole section (a weighted longest increasing subsequence): commentaries explain the text in
 * order, which disambiguates repeated words (evaṃ, bhikkhave, ca). Lemmas left out of that chain (the commentary
 * returns to an earlier word) get their candidate nearest the previous match, with a lower confidence.
 */
import type { Lemma } from './lemmas'
import type { Stream } from './text'

export type MatchKind = 'exact' | 'trim' | 'reorder'

export interface Match {
  /** first and last word (inclusive) of the window */
  w0: number
  w1: number
  /** char position in the stream, for ordering */
  pos: number
  q: number
  conf: number
  kind: MatchKind
  /** number of candidates (1 = unique) */
  n: number
}

interface Cand { pos: number; end: number; q: number; kind: MatchKind }

const MAX_CANDS = 200

/** startB / endB: the match starts / ends a word; before / after: letters of its word before / after it */
type Need = (startB: boolean, endB: boolean, before: number, after: number) => boolean

function occurrences(st: Stream, pat: string, need: Need, q: number, kind: MatchKind, out: Cand[]) {
  if (!pat) return
  let i = st.f.indexOf(pat)
  while (i >= 0 && out.length < MAX_CANDS) {
    const end = i + pat.length
    const startB = st.ws[st.w[i]] === i
    const endB = end === st.f.length || st.w[end] !== st.w[end - 1]
    const wordEnd = st.w[end - 1] + 1 < st.ws.length ? st.ws[st.w[end - 1] + 1] : st.f.length
    // a ṭīkā quotes the aṭṭhakathā's own lemmas (bold) rather than the same words in its explanation
    const bonus = (startB ? 0.05 : 0) + (endB ? 0.05 : 0) + (st.bold?.[st.w[i]] ? 0.15 : 0)
    if (need(startB, endB, i - st.ws[st.w[i]], wordEnd - end)) out.push({ pos: i, end, q: q + bonus, kind })
    i = st.f.indexOf(pat, i + 1)
  }
}

/**
 * short patterns must be whole words, medium ones start a word or end one as the last member of a compound
 * (not attho in haṭṭho), long ones may be anywhere
 */
const needFor = (len: number): Need =>
  len <= 4 ? (a, b) => a && b : len <= 7 ? (a, b, before) => a || (b && before >= 3) : () => true

/** the rest of a word after a short lemma that sandhi joined to the next word (idha + āvuso = idhāvuso, tañca, sopi) */
const SANDHI_REST = new Set(['vuso', 'pi', 'ca', 'hi', 'va', 'eva', 'yeva', 'pana'])

export function candidates(l: Lemma, st: Stream): Cand[] {
  const out: Cand[] = []
  if (l.parts.length > 1) {
    const firsts: Cand[] = [], lasts: Cand[] = []
    occurrences(st, l.parts[0], needFor(l.parts[0].length), 1, 'exact', firsts)
    occurrences(st, l.parts[l.parts.length - 1], needFor(l.parts[l.parts.length - 1].length), 1, 'exact', lasts)
    for (const a of firsts) {
      const b = lasts.find(x => x.pos > a.pos && x.pos - a.end < 4000)
      out.push(b ? { pos: a.pos, end: b.end, q: (a.q + b.q) / 2, kind: 'exact' } : { ...a, q: a.q * 0.8 })
    }
    return out
  }
  l.pats.forEach((p, k) => occurrences(st, p, needFor(p.length), k === 0 ? 1 : 0.9, 'exact', out))
  if (out.length) return dedupe(out)
  // a short word joined by sandhi to a particle or āvuso
  const short = l.pats[l.pats.length - 1]
  if (short.length >= 2 && short.length <= 4) {
    const joined: Cand[] = []
    occurrences(st, short, (a, _b, _before, after) => a && after > 0 && after <= 4, 0.85, 'exact', joined)
    const rest = (c: Cand) => st.f.slice(c.end, st.ws[st.w[c.pos] + 1] ?? st.f.length)
    const ok = joined.filter(c => SANDHI_REST.has(rest(c)))
    if (ok.length) return dedupe(ok)
  }
  // inflected forms (verse commentaries quote and gloss the stem): drop one or two final letters; the word must
  // start there and differ only by an ending (not the stem of a longer compound: pubbenivāsa in pubbenivāsānussati)
  const p = l.pats[l.pats.length - 1]
  const inflected: Need = (a, _b, _before, after) => a && after <= 4
  if (p.length >= 5) occurrences(st, p.slice(0, -1), inflected, 0.7, 'trim', out)
  if (!out.length && p.length >= 7) occurrences(st, p.slice(0, -2), inflected, 0.6, 'trim', out)
  // a bold run of several phrases (ekāyano, ekassa): its first phrase
  if (!out.length && l.segs.length > 1 && l.segs[0].length >= 5) occurrences(st, l.segs[0], needFor(l.segs[0].length), 0.6, 'trim', out)
  return dedupe(out)
}

function dedupe(cs: Cand[]): Cand[] {
  const by = new Map<number, Cand>()
  for (const c of cs) { const o = by.get(c.pos); if (!o || o.q < c.q) by.set(c.pos, c) }
  return [...by.values()].sort((a, b) => a.pos - b.pos)
}

/** matches of a section's lemmas in the window stream (null = not found) */
export function matchSection(lemmas: Lemma[], st: Stream): (Match | null)[] {
  const cands = lemmas.map(l => candidates(l, st))
  // weighted LIS over (lemma order, position): Fenwick tree of prefix maxima over the compressed positions
  const positions = [...new Set(cands.flat().map(c => c.pos))].sort((a, b) => a - b)
  const rank = new Map(positions.map((p, i) => [p, i + 1]))
  const n = positions.length
  const treeVal = new Float64Array(n + 1)
  const treeArg = new Int32Array(n + 1).fill(-1)
  const query = (r: number): [number, number] => {
    let v = 0, a = -1
    for (let i = r; i > 0; i -= i & -i) if (treeVal[i] > v) { v = treeVal[i]; a = treeArg[i] }
    return [v, a]
  }
  const update = (r: number, v: number, a: number) => {
    for (let i = r; i <= n; i += i & -i) if (treeVal[i] < v) { treeVal[i] = v; treeArg[i] = a }
  }
  // node: lemma index, cand index, back pointer
  const nodes: { l: number; c: number; back: number }[] = []
  let best = 0, bestNode = -1
  cands.forEach((cs, li) => {
    // a unique, long candidate weighs more than one of many short ones
    // earlier occurrences win among equally good chains: a commentary explains a repeated phrase where it first occurs
    const w = (c: Cand) => c.q * (cs.length === 1 ? 1.2 : 1) * Math.min(1.5, 0.6 + lemmas[li].pats[0].length / 20) - (0.04 * c.pos) / Math.max(1, st.f.length)
    const pending = cs.map((c, ci) => {
      const r = rank.get(c.pos)!
      // the same position as an earlier lemma (a part of it explained again) costs a little: later words win ties
      const [vs, as] = query(r - 1)
      const [ve, ae] = query(r)
      const [v, a] = vs >= ve - 0.05 ? [vs, as] : [ve - 0.05, ae]
      return { r, v: v + w(c), node: { l: li, c: ci, back: a } }
    })
    for (const p of pending) {
      nodes.push(p.node)
      const id = nodes.length - 1
      update(p.r, p.v, id)
      if (p.v > best) { best = p.v; bestNode = id }
    }
  })
  const res: (Match | null)[] = lemmas.map(() => null)
  const toMatch = (c: Cand, cs: Cand[], kind: MatchKind, f = 1): Match => ({
    w0: st.w[c.pos], w1: st.w[c.end - 1], pos: c.pos, q: c.q, n: cs.length, kind,
    conf: Math.min(1, c.q * (cs.length === 1 ? 1 : 0.9) * f),
  })
  for (let id = bestNode; id >= 0; id = nodes[id].back) {
    const { l, c } = nodes[id]
    res[l] = toMatch(cands[l][c], cands[l], cands[l][c].kind)
  }
  // lemmas outside the chain: the commentary goes back to an earlier word, or explains a part of the previous lemma.
  // A word the section already matched is the same word again (evanti … evanti … explains the one "evaṃ").
  const byPat = new Map<string, Match>()
  res.forEach((m, li) => { if (m && !byPat.has(lemmas[li].pats[0])) byPat.set(lemmas[li].pats[0], m) })
  let prevPos = 0
  res.forEach((m, li) => {
    if (m) { prevPos = m.pos; return }
    const again = byPat.get(lemmas[li].pats[0])
    if (again) { res[li] = { ...again, kind: 'reorder', conf: Math.min(again.conf, 0.7) }; return }
    const cs = cands[li]
    const len = lemmas[li].pats[0].length
    // out of order matches of short words must be whole words (Attho is not in haṭṭho)
    const ok = cs.filter(c => len >= 8 || (st.ws[st.w[c.pos]] === c.pos && (c.end === st.f.length || st.w[c.end] !== st.w[c.end - 1])))
    if (!ok.length || (ok.length > 1 && len < 5)) return
    const c = ok.reduce((a, b) => (Math.abs(b.pos - prevPos) < Math.abs(a.pos - prevPos) ? b : a))
    res[li] = toMatch(c, cs, 'reorder', 0.6)
  })
  return res
}
