/**
 * The Pali-Sinhala dictionaries of github.com/pnfo/pali-sinhala-dictionary (submodule data/dicts/sinhala):
 * buddhadatta_dict.json [[word, meaning]] (Polwatte Buddhadatta, Pāli-Sinhala Akārādiya) and
 * sumangala_dict.json [[word, meaning, page]] (Maḍitiyawela Sumaṅgala, Pāli-Sinhala Śabdakoṣaya).
 * Headwords are Sinhala script (-> Roman), homonyms are merged, <r c1>..</r> marks the grammar; <r 0>d</r> (a symbol
 * font's letter, before the verb class of a root: d භු) is the root sign √.
 */
import fs from 'node:fs'
import path from 'node:path'
import { normalizeMeaning, sinhToRoman } from './markup'
import type { DictRow, ImportCtx, ImportResult } from './types'

export function sinhalaImporter(file: string) {
  return (ctx: ImportCtx): ImportResult => {
    const f = path.join(ctx.dataDir, 'dicts', 'sinhala', file)
    if (!fs.existsSync(f)) throw new Error(`${f} missing: run git submodule update --init`)
    const rows = (JSON.parse(fs.readFileSync(f, 'utf8')) as [string, string, number?][]).map(([w, meaning, page]): DictRow => ({
      word: sinhToRoman(w),
      meaning: normalizeMeaning(meaning.replace(/<r 0>d<\/r>/g, '<r 0>√</r>')) + (page ? ` <span class="lnum">(පි. ${page})</span>` : ''),
    })).filter(r => r.word)
    return { rows }
  }
}
