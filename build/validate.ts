/**
 * Validation of the built corpus. Errors fail the build (and the upstream sync PR), warnings are listed in
 * the build report.
 */
import type { Corpus } from './tree'

const KNOWN_RENDS = new Set(['centre', 'nikaya', 'book', 'chapter', 'title', 'subhead', 'subsubhead', 'bodytext', 'gatha1', 'gatha2',
  'gatha3', 'gathalast', 'unindented', 'indent', 'hangnum', 'trailer'])
const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function validate(c: Corpus): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings = [...c.warnings]
  const seen = new Set<string>()
  for (const n of c.nodes) {
    if (seen.has(n.key)) errors.push(`duplicate key ${n.key}`)
    seen.add(n.key)
    if (!KEY_RE.test(n.key)) errors.push(`invalid key ${n.key} (${n.title})`)
    if (n.kind !== 'group' && (n.start < 0 || n.end <= n.start)) warnings.push(`node without text ${n.key} ${n.title}`)
  }
  for (const b of c.books) if (b.root < 0) errors.push(`book ${b.def.id} has no root node`)
  for (const p of c.paras) {
    if (p.node < 0) errors.push(`paragraph ${c.books[p.book].def.id}:${p.idx} without node`)
    if (!KNOWN_RENDS.has(p.rend)) warnings.push(`unknown rend ${p.rend} in ${c.books[p.book].def.id}:${p.idx}`)
    // markup characters must be balanced (they never occur in the CST text itself)
    if ((p.text.match(/\*\*/g)?.length ?? 0) % 2) warnings.push(`unbalanced bold in ${c.nodes[p.node]?.key}: ${p.text.slice(0, 80)}`)
    if ((p.text.match(/\{/g)?.length ?? 0) !== (p.text.match(/\}/g)?.length ?? 0)) errors.push(`unbalanced note in ${c.nodes[p.node]?.key}: ${p.text.slice(0, 80)}`)
    if (/[<>]/.test(p.text)) warnings.push(`html-like character in ${c.nodes[p.node]?.key}: ${p.text.slice(0, 80)}`)
  }
  return { errors, warnings }
}
