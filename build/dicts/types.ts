/** dictionary importers (build/dicts/*.ts): rows for db/dict.db, see build/dict.ts */

export interface DictRow {
  /** lower case Roman headword */
  word: string
  /** canonical markup, see ./markup.ts */
  meaning: string
  /** homonym number (0: none) */
  hom?: number
  /** variant headwords: rows that show this entry (lower case Roman) */
  aliases?: string[]
}

export interface ImportResult {
  rows: DictRow[]
  /** abbreviation -> expansion, for <abbr data-a> */
  abbrevs?: Record<string, string>
}

import type { TextIndex } from './text-index'

export interface ImportCtx {
  /** server-data/dicts: the v2 dictionaries */
  dictDir: string
  /** .cache/dicts: the sources of data/dicts.lock (npm run upstream -- --dicts) */
  cacheDir: string
  /** data/ */
  dataDir: string
  /** the DPD database (.cache/dpd/dpd.db), if any */
  dpd?: string
  /** where references point in the texts (db/text.db), if built */
  text?: TextIndex
  log: (m: string) => void
  /** writes .cache/dicts/reports/<name>.tsv (rows of the build report) */
  report: (name: string, lines: string[]) => void
}

export type Importer = (ctx: ImportCtx) => ImportResult
