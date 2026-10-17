/**
 * Critical Pāli Dictionary (a - kāreti; cpd.uni-koeln.de), as scraped and cleaned by the DPD project:
 * .cache/dicts/cpd/cpd_clean.db entries(headword, html <article><sup>2</sup><h2><b>a-</b></h2>, ...</article>).
 * The line breaks of the print (<br/> inside sentences, words hyphenated at the end of a line) are joined; the
 * line numbers of references (<span class="smalltext">) become lnum.
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { niggahita } from './markup'
import type { DictRow, ImportCtx, ImportResult } from './types'

export function cpdHtml(html: string): string {
  return niggahita(html)
    .replace(/<\?xml[^>]*\?>/, '').replace(/<\/?article[^>]*>/g, '')
    .replace(/^\s*(?:<sup>\d+<\/sup>)?\s*(√?)\s*<h2>([\s\S]*?)<\/h2>/, '$1$2') // the headword as printed (a-kata-hattha, √akkh)
    .replace(/<span class="smalltext">/g, '<span class="lnum">')
    .replace(/<span class="(?:italic)">/g, '<span class="i">').replace(/<span class="smallcaps">/g, '<span class="sc">')
    .replace(/<\/?(?:h[2-4]|section|div|caption)[^>]*>/g, m => (m.startsWith('</') ? '' : '<br>'))
    .replace(/<img[^>]*>/g, '')
    // print line breaks: kept before a new section (—) or sense (1.), joined elsewhere
    .replace(/<br\s*\/?>(?=\s*(?:<[ib]>)?\s*(?:—|\d+\.|[a-z]\)))/g, '<br>')
    .replace(/(\p{L})-<br\s*\/>/gu, '$1-')
    .replace(/\s*<br\s*\/>\s*/g, ' ')
    .replace(/^[\s,]+/, '').trim()
}

export function importCpd(ctx: ImportCtx): ImportResult {
  const f = path.join(ctx.cacheDir, 'cpd', 'cpd_clean.db')
  if (!fs.existsSync(f)) throw new Error(`${f} missing: run npm run upstream -- --dicts-only`)
  const db = new Database(f, { readonly: true })
  const rows = (db.prepare("SELECT headword, html FROM entries WHERE html != '' ORDER BY id").all() as { headword: string; html: string }[])
    .map((r): DictRow => {
      const hom = Number(/^\s*(?:<\?xml[^>]*\?>)?\s*<article[^>]*>\s*<sup>(\d+)<\/sup>/.exec(r.html)?.[1] ?? 0)
      const meaning = cpdHtml(r.html)
      return { word: niggahita(r.headword.replace(/^√/, '')).toLowerCase(), hom, meaning }
    }).filter(r => r.word && r.meaning)
  db.close()
  return { rows }
}
