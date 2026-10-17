/**
 * Commentary alignment in the reader (glosses, see dev-docs/alignments.md): the dashed underlines of the words a
 * commentary explains (and of the commentary's lemmas), and the anchors that keep linked columns in step.
 */
import type { Span } from '@shared/markup'
import type { Gloss, LinkKind } from '@/data/types'

/** the collection of the commentary / of the commented text of a gloss kind */
export const commentaryColl = (k: LinkKind) => (k === 'mula-atta' ? 'atta' : 'tika')
export const textColl = (k: LinkKind) => (k === 'atta-tika' ? 'atta' : 'mula')

const LOW_CONF = 0.7

/** spans per paragraph of this text (a span over several paragraphs is cut at the paragraph ends) */
export function glossSpans(glosses: Gloss[]): Map<number, Span[]> {
  const out = new Map<number, Span[]>()
  for (const g of glosses) {
    const cls = [g.side === 't' ? `gl-${commentaryColl(g.kind)}` : `gl-lemma gl-to-${textColl(g.kind)}`, `gl-src-${g.src}`]
    if (g.conf < LOW_CONF) cls.push('gl-lo')
    for (let i = g.i; i <= g.ei; i++) {
      const sp: Span = { s: i === g.i ? g.s : 0, e: i === g.ei ? g.e : Number.MAX_SAFE_INTEGER, id: String(g.g), cls: cls.join(' ') }
      const a = out.get(i)
      if (a) a.push(sp)
      else out.set(i, [sp])
    }
  }
  return out
}

/** gloss ids of the underline at an element (data-g of the closest .gl) */
export function glossIdsAt(el: Element | null): number[] {
  const gl = el?.closest('.gl') as HTMLElement | null
  return gl?.dataset.g ? gl.dataset.g.split(' ').map(Number) : []
}

/** where a commentary's explanation starts: the ** that opens the lemma (or the lemma itself) */
export function lemmaOpen(text: string, s: number): number {
  const i = text.lastIndexOf('**', s)
  return i >= 0 && s - i <= 4 ? i : s
}

// ---------------- column sync ----------------

/** positions (content y of a scroll container) of the underlines of a column, by gloss id */
export interface Anchors { ys: number[]; ids: number[][]; byId: Map<number, number>; height: number }

export function collectAnchors(root: HTMLElement): Anchors {
  const top = root.getBoundingClientRect().top - root.scrollTop
  const ys: number[] = [], ids: number[][] = []
  const byId = new Map<number, number>()
  let lastY = -1
  // low confidence matches (often the commentary returning to an earlier word) are not used as anchors
  root.querySelectorAll<HTMLElement>('.gl[data-g]:not(.gl-lo)').forEach(el => {
    const y = Math.round(el.getBoundingClientRect().top - top)
    const gs = el.dataset.g!.split(' ').map(Number)
    for (const g of gs) if (!byId.has(g)) byId.set(g, y)
    if (y === lastY) ids[ids.length - 1].push(...gs)
    else { ys.push(y); ids.push(gs); lastY = y }
  })
  return { ys, ids, byId, height: root.scrollHeight }
}

/**
 * The y in the other column that corresponds to y in this one: interpolated between the nearest anchors before
 * and after y that both columns have. Only anchor pairs in the same order in both columns are used (a word the
 * commentary explains again elsewhere would pull the other column away). null when there are none (fall back to
 * paragraph links).
 */
export function mapY(src: Anchors, dst: Anchors, y: number): number | null {
  const pairAt = (k: number): [number, number] | null => {
    for (const g of src.ids[k]) { const d = dst.byId.get(g); if (d !== undefined) return [src.ys[k], d] }
    return null
  }
  // last anchor at or above y
  let lo = 0, hi = src.ys.length - 1, k = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (src.ys[m] <= y) { k = m; lo = m + 1 } else hi = m - 1 }
  const pairs: [number, number][] = []
  // no distance limit: a verse's explanation can be a story of many screens, the mūla moves slowly through it
  for (let j = k, n = 0; j >= 0 && n < 8 && k - j < 3000; j--) { const p = pairAt(j); if (p) { pairs.unshift(p); n++ } }
  for (let j = k + 1, n = 0; j < src.ys.length && n < 8 && j - k < 3000; j++) { const p = pairAt(j); if (p) { pairs.push(p); n++ } }
  const chain = increasingChain(pairs)
  const before = [...chain].reverse().find(p => p[0] <= y) ?? null
  const after = chain.find(p => p[0] > y) ?? null
  if (before && after && after[0] > before[0]) return before[1] + ((y - before[0]) / (after[0] - before[0])) * (after[1] - before[1])
  if (before && y - before[0] < 1500) return before[1] + (y - before[0])
  if (after && after[0] - y < 1500) return after[1] - (after[0] - y)
  return null
}

/** the longest run of pairs (sorted by the first value) whose second values do not decrease */
export function increasingChain(pairs: [number, number][]): [number, number][] {
  const n = pairs.length
  const len = new Array<number>(n).fill(1), prev = new Array<number>(n).fill(-1)
  let best = -1
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) if (pairs[j][1] <= pairs[i][1] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j }
    if (best < 0 || len[i] > len[best]) best = i
  }
  const out: [number, number][] = []
  for (let i = best; i >= 0; i = prev[i]) out.unshift(pairs[i])
  return out
}
