/**
 * Dictionary of Pāli Proper Names (G. P. Malalasekera 1937-38), revised by Ānandajoti Bhikkhu (2025), CC BY-SA 4.0:
 * .cache/dicts/dppn/DPPN.json ([{name, entry}], html: name = <p><span class="Head"><b>Word</b> 02. ...</span>,
 * entry = the rest of the paragraph(s)) and the list of abbreviations of its index.htm.
 *  - head: the first bold form is the headword, "02" its homonym number, the other bold forms (variants, the
 *    original spelling) are aliases; what the head says besides the headword is kept at the start of the meaning
 *  - bold names that are headwords become cross references; "Name (2)" refers to homonym 2 when it exists
 *  - the editor's marks (<abbr title="Added or Corrected" | "Modified" | "Original">) become ed-add / ed-mod / ed-orig
 *  - text references (SN.v.112, Ja 90) are marked by ./refs.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fold } from '../../shared/normalize'
import { escapeAttr, niggahita, stripTags } from './markup'
import { markRefs, type Resolver } from './refs'
import type { DictRow, ImportCtx, ImportResult } from './types'

interface Raw { name: string; entry?: string }
interface Parsed { word: string; hom: number; aliases: string[]; headRest: string; body: string }

const key = (s: string) => niggahita(stripTags(s)).replace(/[\s.,;:()]+$/g, '').replace(/^[\s(]+/, '').trim().toLowerCase().normalize('NFC')

/** "Abbr=Expansion <br>" lines of the index page's #Abbreviations block */
export function parseDppnAbbrevs(indexHtml: string): Record<string, string> {
  const i = indexHtml.indexOf('id="Abbreviations"')
  if (i < 0) return {}
  const start = indexHtml.indexOf('>', i) + 1
  const block = indexHtml.slice(start, indexHtml.indexOf('</div>', start))
  const out: Record<string, string> = {}
  for (const line of stripTags(block.replace(/<br\s*\/?>/g, '\n')).split('\n')) {
    const m = /^\s*([^=\s][^=]{0,15}?)\s*=\s*(.+?)\s*$/.exec(line)
    if (m) out[niggahita(m[1])] = niggahita(m[2].replace(/\.$/, ''))
  }
  return out
}

/** the malformed bold of a few heads: <b>Akatti)</b> -> <b>Akatti</b>), <b>Name (</b>3) -> <b>Name</b> (3) */
export function fixBold(html: string): string {
  return html.replace(/<b>([^<]*?)(\s*[()]\s*)<\/b>/g, '<b>$1</b>$2')
}

export function parseDppnEntry(x: Raw): Parsed | null {
  const name = fixBold(x.name)
  const head = /<span class="Head">([\s\S]*?)<\/span>/.exec(name)
  if (!head) return null
  const h = head[1]
  const bolds = [...h.matchAll(/<b>([\s\S]*?)<\/b>/g)]
  if (!bolds.length) return null
  const word = key(bolds[0][1])
  if (!word) return null
  // homonym number: "<b>Ānanda</b> 01."
  const after = h.slice(bolds[0].index! + bolds[0][0].length)
  const homM = /^\s*(\d{1,2})\b\.?/.exec(after)
  const hom = homM ? Number(homM[1]) : 0
  const aliases = [...new Set(bolds.slice(1).map(b => key(b[1])).filter(a => a && a !== word && !/^\d+$/.test(a)))]
  let rest = after.slice(homM ? homM[0].length : 0)
  rest = rest.replace(/^[\s.,]+/, '').replace(/[\s.]+$/, '')
  const headRest = stripTags(rest).replace(/[\s.,;:()]/g, '') ? rest : ''
  return { word, hom, aliases, headRest, body: '<p>' + name.slice(head.index! + head[0].length) + (x.entry ?? '') }
}

/** the editor's marks */
export function editorMarks(html: string): string {
  return html
    .replace(/<abbr title="Original"[^>]*>([\s\S]*?)<\/abbr>/gi, (_, t: string) => `<span class="ed-orig">${t}</span>`)
    .replace(/<abbr title="Modified"[^>]*>([\s\S]*?)<\/abbr>/gi, '<span class="ed-mod">$1</span>')
    .replace(/<abbr title="Added[^"]*"[^>]*>([\s\S]*?)<\/abbr>/gi, '<span class="ed-add">$1</span>')
}

/** bold names that are headwords -> <a data-dict> (with the homonym of "Name (2)" when the headword has it) */
export function linkNames(html: string, homs: Map<string, Set<number>>, self: string[]): { html: string; links: number } {
  let links = 0
  const out = html.replace(/<b>([^<]+)<\/b>(\s*\((\d{1,2})\))?/g, (m, name: string, paren: string | undefined, num: string | undefined) => {
    const k = key(name)
    const hs = homs.get(k) ?? homs.get(fold(k))
    if (!hs || self.includes(k)) return m
    links++
    const n = num ? Number(num) : 0
    if (n && hs.has(n)) return `<b><a data-dict="${escapeAttr(k)}" data-hom="${n}">${name}</a></b>${paren}`
    return `<b><a data-dict="${escapeAttr(k)}">${name}</a></b>${paren ?? ''}`
  })
  return { html: out, links }
}

export function importDppn(ctx: ImportCtx): ImportResult {
  const file = path.join(ctx.cacheDir, 'dppn', 'DPPN.json')
  if (!fs.existsSync(file)) throw new Error(`${file} missing: run npm run upstream -- --dicts-only`)
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Raw[]
  const index = path.join(ctx.cacheDir, 'dppn-index', 'index.htm')
  const abbrevs = fs.existsSync(index) ? parseDppnAbbrevs(fs.readFileSync(index, 'utf8')) : {}
  const parsed = raw.map(parseDppnEntry).filter((p): p is Parsed => !!p)
  // headword (and folded headword) -> homonym numbers
  const homs = new Map<string, Set<number>>()
  for (const p of parsed) {
    for (const w of [p.word, ...p.aliases]) {
      for (const k of [w, fold(w)]) {
        if (!homs.has(k)) homs.set(k, new Set())
        homs.get(k)!.add(p.hom)
      }
    }
  }
  // references: PTS pages, and Jātaka numbers through the Jātaka names of the headwords ("Akataññujātaka (Ja 90)")
  const jatakas = new Map<number, string>()
  for (const p of parsed) {
    const n = /\bJa (\d{1,3})\b/.exec(stripTags(p.headRest))
    if (n && /jātaka$/.test(p.word)) jatakas.set(Number(n[1]), p.word)
  }
  const text = ctx.text
  const resolve: Resolver | undefined = text && ((b, v, pg, names) => (b === 'Ja' && v === 0 ? (jatakas.has(pg) ? text.jataka(jatakas.get(pg)!, pg) : null) : text.page(b, v, pg, names)))
  let links = 0, refs = 0
  const rows = parsed.map((p): DictRow => {
    let body = p.body.replace(/^\s+/, '').normalize('NFC')
    if (p.headRest) body = body.replace(/^<p>|^/, m => `${m}<span class="dict-head">${p.headRest}</span> `)
    body = editorMarks(niggahita(body))
    const l = linkNames(body, homs, [p.word, ...p.aliases])
    links += l.links
    const r = markRefs(l.html, abbrevs, 'dppn', resolve && ((b, v, pg, names) => resolve(b, v, pg, [p.word, ...(names ?? [])])))
    refs += r.refs
    return { word: niggahita(p.word), hom: p.hom, aliases: p.aliases.map(niggahita), meaning: r.html.replace(/<p>\s*<\/p>/g, '').trim() }
  })
  ctx.log(`dppn: ${rows.length} entries, ${links} name links, ${refs} text references, ${Object.keys(abbrevs).length} abbreviations`)
  return { rows, abbrevs }
}
