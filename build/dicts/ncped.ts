/**
 * New Concise Pali-English Dictionary (SuttaCentral; Buddhadatta's Concise Pali-English Dictionary, revised):
 * .cache/dicts/ncped/pli2en_ncped.json [{entry, grammar, definition (string | string[]), xr (string | string[])} |
 * {entry, homonyms: [{grammar, definition, xr}]}]. Cross references (xr) become links.
 */
import fs from 'node:fs'
import path from 'node:path'
import { escapeAttr, niggahita } from './markup'
import type { DictRow, ImportCtx, ImportResult } from './types'

interface Sense { grammar?: string; definition?: string | string[]; xr?: string | string[] }
interface Raw extends Sense { entry: string; homonyms?: Sense[] }

const text = (s: string) => niggahita(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const list = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x])

export function ncpedMeaning(s: Sense): string {
  const parts: string[] = []
  if (s.grammar) parts.push(`<i>${text(s.grammar)}</i>`)
  const defs = list(s.definition)
  if (defs.length === 1) parts.push(text(defs[0]))
  else if (defs.length) parts.push(defs.map((d, i) => `<b>${i + 1}.</b> ${text(d)}`).join(' '))
  const xr = list(s.xr)
  if (xr.length) parts.push(`(see ${xr.map(w => `<a data-dict="${escapeAttr(niggahita(w))}">${text(w)}</a>`).join(', ')})`)
  return parts.join(' ')
}

export function importNcped(ctx: ImportCtx): ImportResult {
  const f = path.join(ctx.cacheDir, 'ncped', 'pli2en_ncped.json')
  if (!fs.existsSync(f)) throw new Error(`${f} missing: run npm run upstream -- --dicts-only`)
  const rows: DictRow[] = []
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8')) as Raw[]) {
    const word = niggahita(r.entry.trim()).toLowerCase()
    if (!word) continue
    if (r.homonyms) r.homonyms.forEach((h, i) => rows.push({ word, hom: i + 1, meaning: ncpedMeaning(h) }))
    else rows.push({ word, meaning: ncpedMeaning(r) })
  }
  return { rows }
}
