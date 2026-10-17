/**
 * Where the references of the dictionaries are in the texts (db/text.db): the PTS page markers of the paragraphs
 * (|P5.0112| = volume 5, page 112) and the Jātaka stories of the commentary ("10. Akataññujātakavaṇṇanā").
 * A place is "<node key>#<paragraph index>", the address of the reader (/<script>/<key>#p<index>).
 * Only books referred to by PTS volume and page are here (not by verse or chapter: Dhp, Snp, Thag, Bv, Mhv ...).
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import { fold } from '../../shared/normalize'

/** reference book id (./refs.ts BOOKS) -> the VRI books (book.name prefixes) its PTS volumes are in */
export const BOOK_FILES: Record<string, string[]> = {
  Vin: ['vin01m', 'vin02m'], DN: ['s0101m', 's0102m', 's0103m'], MN: ['s0201m', 's0202m', 's0203m'],
  SN: ['s0301m', 's0302m', 's0303m', 's0304m', 's0305m'], AN: ['s0401m', 's0402m', 's0403m', 's0404m'],
  Ja: ['s0513a'], 'Vin-a': ['vin01a', 'vin02a'], 'DN-a': ['s0101a', 's0102a', 's0103a'], 'MN-a': ['s0201a', 's0202a', 's0203a'],
  'SN-a': ['s0301a', 's0302a', 's0303a', 's0304a', 's0305a'], 'AN-a': ['s0401a', 's0402a', 's0403a', 's0404a'],
  'Dhp-a': ['s0502a'], 'Thag-a': ['s0508a'], 'Thig-a': ['s0509a'], Ap: ['s0510m'], 'Ap-a': ['s0510a'], Ud: ['s0503m'], 'Ud-a': ['s0503a'],
  It: ['s0504m'], 'It-a': ['s0504a'], 'Vv-a': ['s0506a'], 'Pv-a': ['s0507a'], 'Bv-a': ['s0511a'], 'Cp-a': ['s0512a'], 'Khp-a': ['s0501a'],
  'Snp-a': ['s0505a'], Ps: ['s0517m'], Miln: ['s0518m'], Nett: ['s0519m'], Dhs: [], 'Dhs-a': ['abh01a'], Vibh: ['abh02m'],
  'Vibh-a': ['abh02a'], Pp: ['abh03m2'], Kv: ['abh03m3'],
}

export interface TextIndex {
  /** the place of a PTS page: book id, volume (0: a book of one volume), page; with names (the headword, names near the
   * reference), a section on that page whose title is one of them (a sutta of that name begins on the cited page) */
  page(book: string, vol: number, page: number, names?: string[]): string | null
  /** the place of a Jātaka story by its name (Akataññujātaka); with duplicate names, the one nearest its number */
  jataka(name: string, n?: number): string | null
}

const storyKey = (name: string) => fold(name).replace(/vannana$/, '').replace(/[^a-z]/g, '')
/** a section title or a name, for comparing: no numbering, diacritics, or ending like sutta / jātaka */
export const foldName = (t: string) => fold(t).replace(/^[\d\s.()-]+/, '')
  .replace(/(suttam|sutta|jatakavannana|jatakam|jataka|apadanam|apadana|vannana|vatthu|katha)$/, '').replace(/[^a-z]/g, '')
/** edit distance (small words only) */
function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t }
  }
  return d[b.length]
}
/** the same name: equal, one in the other, or (6+ letters) spelt a little differently (DPPN's Bhadragaka, Tapassu:
 * the Bhadraka, Tapussa suttas) - only a few sections begin on a page */
export const sameName = (title: string, name: string) => {
  const t = foldName(title), n = foldName(name)
  if (n.length < 4 || t.length < 4) return false
  return t === n || (n.length >= 6 && t.includes(n)) || (t.length >= 6 && n.includes(t)) || (n.length >= 6 && t.length >= 6 && distance(t, n) <= 2)
}

export function readTextIndex(textDb: string): TextIndex | undefined {
  if (!fs.existsSync(textDb)) return undefined
  const db = new Database(textDb, { readonly: true })
  const pages = new Map<string, { book: number; idx: number; place: string }>() // "<book name>|vol|page"
  const pageStarts = new Map<number, number[]>() // book id -> paragraph indexes where pages begin (sorted)
  const stories = new Map<string, { n: number; place: string }[]>()
  let storyN = 0
  const books = db.prepare('SELECT id, name FROM book').all() as { id: number; name: string }[]
  const nameOf = new Map(books.map(b => [b.id, b.name]))
  const q = db.prepare(`SELECT p.book_id, p.idx, p.text, n.key FROM para p JOIN node n ON n.id = p.node_id
    WHERE p.text LIKE '%|P%' OR p.text LIKE '%jātakavaṇṇanā' ORDER BY p.book_id, p.idx`)
  for (const r of q.iterate() as Iterable<{ book_id: number; idx: number; text: string; key: string }>) {
    const name = nameOf.get(r.book_id) ?? ''
    for (const m of r.text.matchAll(/\|P(\d+)\.(\d+)\|/g)) {
      const k = `${name}|${Number(m[1])}|${Number(m[2])}`
      if (!pages.has(k)) pages.set(k, { book: r.book_id, idx: r.idx, place: `${r.key}#${r.idx}` })
      const ps = pageStarts.get(r.book_id) ?? pageStarts.set(r.book_id, []).get(r.book_id)!
      if (ps.at(-1) !== r.idx) ps.push(r.idx)
    }
    const s = /^\s*(?:\[\d+\]\s*)?\d+\.\s*(\S+jātakavaṇṇanā)\s*$/.exec(r.text)
    if (s && name.startsWith('s0513a')) {
      storyN++
      ;(stories.get(storyKey(s[1])) ?? stories.set(storyKey(s[1]), []).get(storyKey(s[1]))!).push({ n: storyN, place: `${r.key}#${r.idx}` })
    }
  }
  // the sections (nodes) of a book by their first paragraph
  const sections = db.prepare('SELECT key, title, para_start FROM node WHERE book_id = ? AND para_start > ? AND para_start <= ? ORDER BY para_start')
  db.pragma('query_only = ON')
  const byPrefix = new Map(Object.entries(BOOK_FILES).map(([id, prefixes]) => [id, books.map(b => b.name).filter(n => prefixes.some(p => n.startsWith(p)))]))
  return {
    page: (book, vol, page, names) => {
      for (const name of byPrefix.get(book) ?? []) {
        const hit = pages.get(`${name}|${vol}|${page}`)
        if (!hit) continue
        if (names?.length) {
          // the sections that begin on this page: up to where the next page begins
          const ps = pageStarts.get(hit.book) ?? []
          const end = ps.find(i => i > hit.idx) ?? hit.idx + 30
          for (const sec of sections.all(hit.book, hit.idx, end) as { key: string; title: string; para_start: number }[]) {
            if (names.some(n => sameName(sec.title, n))) return `${sec.key}#${sec.para_start}`
          }
        }
        return hit.place
      }
      return null
    },
    jataka: (name, n) => {
      const cands = stories.get(storyKey(name)) ?? []
      if (!cands.length) return null
      return (n ? [...cands].sort((a, b) => Math.abs(a.n - n) - Math.abs(b.n - n))[0] : cands[0]).place
    },
  }
}
