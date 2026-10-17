/**
 * Buddhist Dictionary, Ven. Nyanatiloka (© BPS), as collected by the DPD project: .cache/dicts/nyanatiloka/nyanatiloka.json
 * [{word, definition_html}]. Headwords are written the old way (abbhokāsik'anga) and without the dots of ṭ ḍ ṇ ḷ
 * (akanittha): the headword becomes the spelling of the texts - the v2 copy's headword (pced stardict, 893 words) or a
 * DPD headword that folds the same, when there is one - and the old spelling an alias.
 */
import Database from 'better-sqlite3'
import { fold } from '../../shared/normalize'
import { readV2 } from './v2'
import fs from 'node:fs'
import path from 'node:path'
import { escapeAttr, niggahita } from './markup'
import type { DictRow, ImportCtx, ImportResult } from './types'

export const textSpelling = (w: string) => niggahita(w).replace(/['’]/g, '').replace(/n(?=[gk])/g, 'ṅ')

/** folded word -> the spelling of the texts (null: several) */
function spellings(ctx: ImportCtx): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const add = (w: string, force = false) => {
    const k = fold(w)
    if (force || !out.has(k)) out.set(k, w)
    else if (out.get(k) !== w) out.set(k, null)
  }
  if (ctx.dpd && fs.existsSync(ctx.dpd)) {
    const db = new Database(ctx.dpd, { readonly: true })
    for (const l of db.prepare('SELECT lemma_1 FROM dpd_headwords').pluck().iterate() as Iterable<string>) add(l.replace(/\s+\d.*$/, '').toLowerCase())
    db.close()
  }
  for (const r of readV2(ctx.dictDir, 'en-nyanatiloka')) add(r.word, true) // the v2 copy wins
  return out
}

export function importNyanatiloka(ctx: ImportCtx): ImportResult {
  const f = path.join(ctx.cacheDir, 'nyanatiloka', 'nyanatiloka.json')
  if (!fs.existsSync(f)) throw new Error(`${f} missing: run npm run upstream -- --dicts-only`)
  const spell = spellings(ctx)
  const rows = (JSON.parse(fs.readFileSync(f, 'utf8')) as { word: string; definition_html: string }[]).map((r): DictRow => {
    const old = niggahita(r.word.trim().replace(/[,.;:]+$/, '')).toLowerCase()
    const word = spell.get(fold(textSpelling(old))) ?? textSpelling(old)
    let m = niggahita(r.definition_html).replace(/\s*\n\s*/g, ' ').trim()
    // the definition goes on from the headword: "<p>, contemplation of: ..." / "<p>: 'living in the open air' ..."
    m = m.replace(/^<p>\s*:\s*/, '<p>').replace(/^<p>\s*([,(])/, `<p><b>${escapeAttr(r.word)}</b>$1`)
    // cross references: "(dhutanga, q.v.)"
    m = m.replace(/<i>([^<]+)<\/i>(,? q\.v\.)/g, (_, w: string, qv: string) => `<i><a data-dict="${escapeAttr(textSpelling(w.trim()).toLowerCase())}">${w}</a></i>${qv}`)
    return { word, meaning: m, aliases: old !== word ? [old] : [] }
  })
  return { rows }
}
