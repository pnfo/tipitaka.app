/** the v2 dictionaries: server-data/dicts/<code>.db (headwords in Sinhala script, html meanings) */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { niggahita, normalizeMeaning, sinhToRoman } from './markup'
import type { DictRow, ImportCtx, ImportResult } from './types'

/** raw rows of a v2 dictionary (headword converted to Roman, meaning untouched); [] when the file is missing */
export function readV2(dictDir: string, code: string): { word: string; sinh: string; meaning: string }[] {
  const f = path.join(dictDir, `${code}.db`)
  if (!fs.existsSync(f)) return []
  const db = new Database(f, { readonly: true })
  const rows = db.prepare('SELECT word, meaning FROM dictionary ORDER BY rowid').all() as { word: string; meaning: string }[]
  db.close()
  return rows.map(r => ({ word: sinhToRoman(r.word), sinh: r.word, meaning: r.meaning })).filter(r => r.word)
}

export function v2Importer(code: string, opts: { roman?: boolean } = {}) {
  return (ctx: ImportCtx): ImportResult => ({
    rows: readV2(ctx.dictDir, code).map((r): DictRow => {
      const m = normalizeMeaning(r.meaning)
      return { word: r.word, meaning: opts.roman ? niggahita(m) : m }
    }),
  })
}
