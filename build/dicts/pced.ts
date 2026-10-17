/**
 * The Vietnamese and Korean dictionaries of PCED (Pali-Chinese-English Dictionary by Alobha, github.com/palipced):
 * .cache/dicts/pced-vi/pali-en-cn-viet.mdx (many dictionaries; only its three Pali-Vietnamese ones are read) and
 * .cache/dicts/pced-ko/pali-korean.mdx (a Korean translation of the PTS dictionary). A record is
 * <span style='color:blue;'>Headword</span>,meaning<br /><br /><span style='color:gray;'>source</span>; the source
 * becomes a short note. The rights to the content are not stated (see dev-docs/dictionaries.md).
 */
import fs from 'node:fs'
import path from 'node:path'
import { niggahita } from './markup'
import { readMdx } from './mdx'
import type { DictRow, ImportCtx, ImportResult } from './types'

const SOURCES: Record<string, string> = {
  'Pali Viet Dictionary': 'Bửu Chơn',
  'Pali Viet Abhidhamma Terms': 'Tịnh Sự, Abhidhamma',
  'Pali Viet Vinaya Terms': 'Giác Nguyên, Vinaya',
}

export function pcedRecord(key: string, html: string): { word: string; hom: number; meaning: string; source: string } | null {
  const head = /^\s*<span style='color:blue;'>([^<]*)<\/span>\s*[:,]?\s*/.exec(html)
  const src = /<br \/><br \/><span style='color:gray;'>([^<]*)<\/span>\s*$/.exec(html)
  const word = niggahita((head?.[1] ?? key).replace(/\s+\d+$/, '').trim()).toLowerCase()
  if (!word) return null
  let body = html.slice(head ? head[0].length : 0, src ? src.index : html.length)
  body = niggahita(body).replace(/<span style='[^']*'>/g, '<span>').replace(/<br \/>/g, '<br>').trim()
  return { word, hom: Number(/\s(\d+)$/.exec(key)?.[1] ?? 0), meaning: body, source: src?.[1].trim() ?? '' }
}

export function pcedImporter(dir: string, file: string, keep: (source: string) => string | null) {
  return (ctx: ImportCtx): ImportResult => {
    const f = path.join(ctx.cacheDir, dir, file)
    if (!fs.existsSync(f)) throw new Error(`${f} missing: run npm run upstream -- --dicts-only`)
    const rows: DictRow[] = []
    const seen = new Set<string>()
    for (const [k, v] of readMdx(f).records) {
      const r = pcedRecord(k, v)
      if (!r || !r.meaning) continue
      const note = keep(r.source)
      if (note === null || seen.has(r.word + '\n' + r.meaning)) continue // the files repeat some records
      seen.add(r.word + '\n' + r.meaning)
      rows.push({ word: r.word, hom: r.hom, meaning: note ? `${r.meaning} <span class="lnum">(${note})</span>` : r.meaning })
    }
    return { rows }
  }
}

/** the three Pali-Vietnamese dictionaries of the multi-language file */
export const importPcedVi = pcedImporter('pced-vi', 'pali-en-cn-viet.mdx', s => {
  const k = Object.keys(SOURCES).find(k => s.startsWith(k))
  return k ? SOURCES[k] : null
})
export const importPcedKo = pcedImporter('pced-ko', 'pali-korean.mdx', () => '')
