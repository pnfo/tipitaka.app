/**
 * Legacy map: v2 tipitaka.app locations (public/text/<fileId>.txt, Sinhala, line numbers 1 based) -> new keys.
 * Used for old share links (?a=<fileId>-<line>-<script>) and bookmark migration ("fileId,line").
 *
 * Every heading line of an old file (cha / tit / sub / ssh / boo) is matched against the new nodes of the same
 * collection by normalised Roman title, walking both lists in order (the old files were made from an older CST
 * edition of the same texts). A line maps to the entry of the closest preceding heading line of its file.
 */
import fs from 'node:fs'
import path from 'node:path'
import { convert } from '@pnfo/pali-converter'
import { fold } from '../shared/normalize'
import { dfsOrder, type Corpus } from './tree'
import type { Collection } from './catalog'

export interface LegacyEntry { file: string; line: number; key: string; para: number }

const HEADING_TYPES = new Set(['boo', 'cha', 'tit', 'sub', 'ssh'])
const norm = (s: string) => fold(s).replace(/[^a-z]/g, '')
const romanize = (sinh: string) => norm(convert(sinh.replace(/<[^>]*>/g, ''), 'latn', 'sinh'))

export function oldFileColl(fileId: string): Collection {
  const c = fileId[0]
  if ('1abcde2'.includes(c)) return 'mula'
  if ('3fghij4'.includes(c)) return 'atta'
  if ('5klmno6'.includes(c)) return 'tika'
  return 'anya'
}

/** old file ids in tree order (public/json/full-tree.json) */
export function oldFileOrder(tree: unknown[]): string[] {
  const out: string[] = []
  const walk = (n: Record<string, unknown>) => {
    for (const k of ['fm', 'fa', 'ft', 'fta', 'fe']) if (typeof n[k] === 'string') out.push(n[k] as string)
    for (const ch of (n.c as Record<string, unknown>[] | undefined) ?? []) walk(ch)
  }
  for (const n of tree as Record<string, unknown>[]) walk(n)
  // tree order groups m/a/t per leaf; process each collection in its own order
  return out
}

export function buildLegacyMap(c: Corpus, publicDir: string): { entries: LegacyEntry[]; unmapped: string[] } {
  const treeFile = path.join(publicDir, 'json/full-tree.json')
  const textDir = path.join(publicDir, 'text')
  if (!fs.existsSync(treeFile) || !fs.existsSync(textDir)) return { entries: [], unmapped: [] }
  const order = oldFileOrder(JSON.parse(fs.readFileSync(treeFile, 'utf8')))

  // new nodes per collection in tree order
  const perColl = new Map<Collection, { key: string; title: string; start: number }[]>()
  for (const ci of dfsOrder(c)) {
    const n = c.nodes[ci]
    if (n.kind === 'group') continue
    if (!perColl.has(n.coll)) perColl.set(n.coll, [])
    perColl.get(n.coll)!.push({ key: n.key, title: norm(n.title.replace(/^[\d\s.()-]+/, '')), start: n.start })
  }
  const used = new Set<string>()
  const ptr = new Map<Collection, number>()
  const entries: LegacyEntry[] = []
  const unmapped: string[] = []

  for (const fileId of order) {
    const f = path.join(textDir, `${fileId}.txt`)
    if (!fs.existsSync(f)) continue
    const coll = oldFileColl(fileId)
    const list = perColl.get(coll) ?? []
    const lines = fs.readFileSync(f, 'utf8').split('\r\n')
    let headings = 0
    lines.forEach((line, i) => {
      const parts = line.split(':')
      if (!HEADING_TYPES.has(parts[0])) return
      headings++
      const title = romanize(parts.slice(parts.length > 2 && /^\d/.test(parts[1]) ? 2 : 1).join(':'))
      if (!title) return
      const p = ptr.get(coll) ?? 0
      let found = -1
      for (let j = p; j < Math.min(list.length, p + 4000); j++) if (list[j].title === title && !used.has(list[j].key)) { found = j; break }
      if (found < 0) for (let j = 0; j < list.length; j++) if (list[j].title === title && !used.has(list[j].key)) { found = j; break }
      if (found < 0) return
      const n = list[found]
      used.add(n.key)
      ptr.set(coll, found + 1)
      entries.push({ file: fileId, line: i + 1, key: n.key, para: n.start })
    })
    // the file itself maps to its first matched heading
    const first = entries.find(e => e.file === fileId)
    if (first) entries.push({ file: fileId, line: 0, key: first.key, para: first.para })
    else unmapped.push(`${fileId} (${headings} headings, ${lines[0]?.slice(0, 40)})`)
  }
  return { entries, unmapped }
}
