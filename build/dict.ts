/**
 * Builds db/dict.db from
 *  - the 23 v2 dictionaries (server-data/dicts/<code>.db, headwords in Sinhala script -> converted to Roman)
 *  - the v2 breakups (server-data/db/breakups.db, Sinhala -> Roman)
 *  - a slim copy of the Digital Pāḷi Dictionary (DPD, CC BY-NC-SA 4.0, release pinned in data/dpd.lock):
 *    headwords, the inflection/deconstruction lookup and roots
 * Words are stored lower case Roman with a diacritic folded copy (shared/normalize.ts fold) for lookups.
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { convert } from '@pnfo/pali-converter'
import { fold } from '../shared/normalize'

export interface DictInfo { code: string; lang: string; name: string; short: string; desc?: string; origin?: string }

/** the v2 dictionary list (scripts/dict-client.js), order = display order */
export const DICTS: DictInfo[] = [
  { code: 'en-buddhadatta', lang: 'en', name: 'Buddhadatta Concise', short: 'BU', origin: 'Projector' },
  { code: 'en-nyanatiloka', lang: 'en', name: 'Nyanatiloka Buddhist', short: 'ND', desc: 'Buddhist Dictionary by Ven Nyanatiloka', origin: 'pced stardict' },
  { code: 'en-pts', lang: 'en', name: 'PTS', short: 'PS', desc: 'Pali Text Society Dictionary', origin: 'dpr' },
  { code: 'en-dppn', lang: 'en', name: 'Proper Names', short: 'PN', desc: 'Pali Proper Names by G P Malalasekera', origin: 'dpr' },
  { code: 'en-vri', lang: 'en', name: 'VRI English', short: 'VR', origin: 'cst windows software' },
  { code: 'en-critical', lang: 'en', name: 'Critical PD', short: 'CR', origin: 'extracted from https://cpd.uni-koeln.de/' },
  { code: 'my-u-hoke-sein', lang: 'my', name: 'U Hoke Sein', short: 'HS', origin: 'pced stardict' },
  { code: 'my-23-vol', lang: 'my', name: 'Abhidhāna', short: 'AB', origin: 'pced stardict' },
  { code: 'my-android', lang: 'my', name: 'Android App', short: 'AA', origin: 'Pali Myanmar Dictionary Android App' },
  { code: 'si-buddhadatta', lang: 'si', name: 'පොල්වත්තේ බුද්ධදත්ත', short: 'BU', desc: 'පොල්වත්තේ බුද්ධදත්ත හිමි, පාලි-සිංහල අකාරාදිය' },
  { code: 'si-sumangala', lang: 'si', name: 'මඩිතියවෙල සුමඞ්ගල', short: 'MS', desc: 'මඩිතියවෙල සිරි සුමඞ්ගල හිමි, පාලි-සිංහල ශබ්දකෝෂය' },
  { code: 'th-etipitaka', lang: 'th', name: 'E-Tipitaka', short: 'ET', origin: 'e tipitaka windows software' },
  { code: 'th-aj-subhira', lang: 'th', name: 'สุภีร์ ทุมทอง', short: 'SU', origin: 'Ven Buja' },
  { code: 'th-thaiware', lang: 'th', name: 'Thai Ware', short: 'TW', origin: 'tware windows software' },
  { code: 'th-dhamma-cheti-1', lang: 'th', name: 'กิริยากิตก์ฉบับธรรมเจดีย์', short: 'DC1', origin: 'online pdf' },
  { code: 'th-dhamma-cheti-2', lang: 'th', name: 'กิริยาอาขยาตฉบับธรรมเจดีย์', short: 'DC2', origin: 'online pdf' },
  { code: 'th-bhumibol', lang: 'th', name: 'PTS Bhumibol', short: 'BB', origin: 'online pdf' },
  { code: 'ch-suttacentral', lang: 'ch', name: 'SC Chinese', short: 'SC', desc: 'SuttaCentral Chinese Dictionary', origin: 'Projector' },
  { code: 'hi-vri', lang: 'hi', name: 'VRI Hindi', short: 'VR', origin: 'cst windows software' },
  { code: 'in-suttacentral', lang: 'in', name: 'SC Indonesian', short: 'SC', origin: 'Projector' },
  { code: 'es-marco', lang: 'es', name: 'Marco A', short: 'ES', origin: 'SuttaCentral' },
  { code: 'pt-marco', lang: 'pt', name: 'Marco A', short: 'PT', origin: 'SuttaCentral' },
  { code: 'kh-glossary', lang: 'kh', name: 'Glossary App', short: 'GA', origin: 'Pali-Khmer Glossary Windows App v1.0' },
]

export const DICT_SCHEMA = `
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE dict (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, lang TEXT NOT NULL, name TEXT NOT NULL, short TEXT NOT NULL,
  descr TEXT NOT NULL, origin TEXT NOT NULL, entries INTEGER NOT NULL);
-- word: lower case Roman, fold: diacritics removed (lookups), meaning: html (sanitised on the client)
CREATE TABLE entry (id INTEGER PRIMARY KEY, dict_id INTEGER NOT NULL, word TEXT NOT NULL, fold TEXT NOT NULL, meaning TEXT NOT NULL);
CREATE INDEX entry_fold ON entry(fold);
CREATE TABLE breakup (word TEXT NOT NULL, fold TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL, parts TEXT NOT NULL);
CREATE INDEX breakup_fold ON breakup(fold);
-- DPD (Digital Pāḷi Dictionary by Bodhirasa Bhikkhu, CC BY-NC-SA 4.0, https://www.dpdict.net/)
CREATE TABLE dpd_head (id INTEGER PRIMARY KEY, lemma TEXT NOT NULL, pos TEXT NOT NULL, grammar TEXT NOT NULL, meaning TEXT NOT NULL,
  meaning_lit TEXT NOT NULL, meaning_2 TEXT NOT NULL, construction TEXT NOT NULL, root_key TEXT NOT NULL, root_base TEXT NOT NULL,
  derived_from TEXT NOT NULL, sanskrit TEXT NOT NULL, plus_case TEXT NOT NULL, compound_type TEXT NOT NULL,
  compound_construction TEXT NOT NULL, notes TEXT NOT NULL, stem TEXT NOT NULL, pattern TEXT NOT NULL,
  example TEXT NOT NULL, source TEXT NOT NULL, sutta TEXT NOT NULL, ebt_count INTEGER NOT NULL, fold TEXT NOT NULL);
CREATE INDEX dpd_head_fold ON dpd_head(fold);
-- inflected form -> headword ids (json), deconstruction (json list), grammar (json [[lemma, pos, grammar]..])
-- exact forms as they occur in the text (clicked words); typed searches use dpd_head.fold / entry.fold
CREATE TABLE dpd_lookup (id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE, headwords TEXT NOT NULL, roots TEXT NOT NULL,
  deconstructor TEXT NOT NULL, grammar TEXT NOT NULL, spelling TEXT NOT NULL, see TEXT NOT NULL, abbrev TEXT NOT NULL);
CREATE TABLE dpd_root (root TEXT PRIMARY KEY, meaning TEXT NOT NULL, root_group INTEGER NOT NULL, sign TEXT NOT NULL,
  sanskrit_root TEXT NOT NULL, sanskrit_meaning TEXT NOT NULL) WITHOUT ROWID;
`

/** Sinhala script Pali word -> lower case Roman */
export const sinhToRoman = (w: string) => convert(w, 'latn', 'sinh').toLowerCase().trim()

export interface DictSources {
  dictDir?: string; breakups?: string; dpd?: string
  /** fixture builds: only words of this set (lower case Roman) and their folded forms */
  words?: Set<string>
}

export function buildDictDb(out: string, src: DictSources, log = (m: string) => console.log(m)) {
  const tmp = out + '.tmp'
  fs.rmSync(tmp, { force: true })
  const db = new Database(tmp)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  db.exec(DICT_SCHEMA)
  const meta: Record<string, string> = { built_at: new Date().toISOString() }
  const folds = src.words && new Set([...src.words].map(fold))
  const keep = (w: string) => !folds || folds.has(fold(w))

  db.transaction(() => {
    const insDict = db.prepare('INSERT INTO dict VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const insEntry = db.prepare('INSERT INTO entry (dict_id, word, fold, meaning) VALUES (?, ?, ?, ?)')
    DICTS.forEach((d, i) => {
      const f = src.dictDir && path.join(src.dictDir, `${d.code}.db`)
      let n = 0
      if (f && fs.existsSync(f)) {
        const sdb = new Database(f, { readonly: true })
        const rows = sdb.prepare('SELECT word, meaning FROM dictionary ORDER BY rowid').all() as { word: string; meaning: string }[]
        for (const r of rows) {
          const w = sinhToRoman(r.word)
          if (!w || !keep(w)) continue
          insEntry.run(i + 1, w, fold(w), r.meaning)
          n++
        }
        sdb.close()
      }
      insDict.run(i + 1, d.code, d.lang, d.name, d.short, d.desc ?? '', d.origin ?? '', n)
      log(`dict ${d.code}: ${n}`)
    })

    if (src.breakups && fs.existsSync(src.breakups)) {
      const bdb = new Database(src.breakups, { readonly: true })
      const insB = db.prepare('INSERT INTO breakup VALUES (?, ?, ?, ?, ?)')
      const rows = bdb.prepare('SELECT word, type, origin, breakstr FROM breakup').all() as { word: string; type: string; origin: string; breakstr: string }[]
      for (const r of rows) {
        const w = sinhToRoman(r.word)
        if (!keep(w)) continue
        // breakstr: [["අංස+කාසාව",3], ...] -> [["aṃsa+kāsāva",3], ...]
        const parts = (JSON.parse(r.breakstr) as [string, number][]).map(([s, t]) => [s.split('+').map(sinhToRoman).join('+'), t])
        insB.run(w, fold(w), r.type, r.origin.split('+').map(sinhToRoman).join('+'), JSON.stringify(parts))
      }
      bdb.close()
      log(`breakups: ${rows.length}`)
    }

    if (src.dpd && fs.existsSync(src.dpd)) {
      const ddb = new Database(src.dpd, { readonly: true })
      const info = Object.fromEntries((ddb.prepare('SELECT key, value FROM db_info').all() as { key: string; value: string }[]).map(r => [r.key, r.value]))
      meta.dpd_version = info.dpd_release_version ?? ''
      meta.dpd_license = info.license ?? ''
      meta.dpd_citation = info.citation ?? ''
      // fixture: the lookups of the fixture words and the headwords they reference
      const lookups = (ddb.prepare(`SELECT lookup_key, headwords, roots, deconstructor, grammar, spelling, see, abbrev FROM lookup
        WHERE headwords != '' OR deconstructor != '' OR roots != '' OR spelling != '' OR see != '' OR abbrev != ''`).iterate() as Iterable<Record<string, string>>)
      const headIds = new Set<number>()
      const lookupRows: Record<string, string>[] = []
      for (const r of lookups) {
        if (src.words && !src.words.has(r.lookup_key.toLowerCase())) continue
        if (src.words) for (const id of JSON.parse(r.headwords || '[]') as number[]) headIds.add(id)
        lookupRows.push(r)
      }
      const heads = (ddb.prepare(`SELECT id, lemma_1, pos, grammar, meaning_1, meaning_lit, meaning_2, construction, root_key, root_base,
        derived_from, sanskrit, plus_case, compound_type, compound_construction, notes, stem, pattern, example_1, source_1, sutta_1, ebt_count
        FROM dpd_headwords`).all() as Record<string, string | number>[]).filter(h => !src.words || headIds.has(h.id as number))
      const insH = db.prepare('INSERT INTO dpd_head VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const h of heads) {
        const lemma = String(h.lemma_1)
        insH.run(h.id, lemma, h.pos, h.grammar, h.meaning_1, h.meaning_lit, h.meaning_2, h.construction, h.root_key, h.root_base,
          h.derived_from, h.sanskrit, h.plus_case, h.compound_type, h.compound_construction, h.notes, h.stem, h.pattern,
          h.example_1, h.source_1, h.sutta_1, h.ebt_count, fold(lemma.replace(/\s+\d.*$/, '')))
      }
      log(`dpd headwords: ${heads.length}`)
      const insL = db.prepare('INSERT OR IGNORE INTO dpd_lookup (word, headwords, roots, deconstructor, grammar, spelling, see, abbrev) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      let n = 0
      for (const r of lookupRows) {
        const w = r.lookup_key.toLowerCase()
        insL.run(w, r.headwords, r.roots, r.deconstructor, r.grammar, r.spelling, r.see, r.abbrev)
        n++
      }
      log(`dpd lookup: ${n}`)
      const roots = ddb.prepare(`SELECT root, root_meaning, root_group, root_sign, sanskrit_root, sanskrit_root_meaning FROM dpd_roots`).all() as Record<string, string | number>[]
      const insR = db.prepare('INSERT OR IGNORE INTO dpd_root VALUES (?, ?, ?, ?, ?, ?)')
      for (const r of roots) insR.run(r.root, r.root_meaning, r.root_group, r.root_sign, r.sanskrit_root, r.sanskrit_root_meaning)
      log(`dpd roots: ${roots.length}`)
      ddb.close()
    }
    const insMeta = db.prepare('INSERT INTO meta VALUES (?, ?)')
    for (const [k, v] of Object.entries(meta)) insMeta.run(k, v)
  })()
  db.exec('ANALYZE')
  db.close()
  fs.renameSync(tmp, out)
  return meta
}
