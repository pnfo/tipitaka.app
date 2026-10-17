/**
 * Builds db/dict.db from
 *  - the dictionaries of DICTS: each has an importer (build/dicts/*.ts); the default reads the v2 dictionary
 *    server-data/dicts/<code>.db (headwords in Sinhala script -> Roman). Newer editions come from the sources
 *    pinned in data/dicts.lock (.cache/dicts, `npm run upstream -- --dicts`) and the data/dicts/sinhala submodule.
 *    Meanings use the canonical markup of build/dicts/markup.ts.
 *  - the v2 breakups (server-data/db/breakups.db, Sinhala -> Roman)
 *  - a slim copy of the Digital Pāḷi Dictionary (DPD, CC BY-NC-SA 4.0, release pinned in data/dpd.lock):
 *    headwords, the inflection/deconstruction lookup and roots
 * Words are stored lower case Roman with a diacritic folded copy (shared/normalize.ts fold) for lookups.
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fold } from '../shared/normalize'
import { sinhToRoman } from './dicts/markup'
import { v2Importer } from './dicts/v2'
import { importDppn } from './dicts/dppn'
import { ptsOf } from './dicts/pts'
import { englishIndex, importThaiPts, knownPali } from './dicts/thai-pts'
import { sinhalaImporter } from './dicts/sinhala'
import { importCpd } from './dicts/cpd'
import { importNyanatiloka } from './dicts/nyanatiloka'
import { importNcped } from './dicts/ncped'
import { importPcedKo, importPcedVi } from './dicts/pced'
import { importAndroid, myanmarImporter, readGrammarBreakups } from './dicts/myanmar'
import type { ImportCtx, Importer } from './dicts/types'
import { readTextIndex } from './dicts/text-index'

export { sinhToRoman }

export interface DictInfo {
  code: string; lang: string; name: string; short: string; desc?: string; origin?: string
  /** default: the v2 dictionary server-data/dicts/<code>.db */
  importer?: Importer
  /** not used unless chosen (not part of "all dictionaries") */
  optIn?: boolean
}

/** order = display order */
export const DICTS: DictInfo[] = [
  { code: 'en-ncped', lang: 'en', name: 'New Concise', short: 'BU', desc: 'New Concise Pali-English Dictionary (Buddhadatta, revised)',
    origin: 'SuttaCentral', importer: importNcped },
  { code: 'en-nyanatiloka', lang: 'en', name: 'Nyanatiloka Buddhist', short: 'ND', desc: 'Buddhist Dictionary by Ven Nyanatiloka',
    origin: '© Buddhist Publication Society, as collected by the Digital Pāḷi Dictionary project', importer: importNyanatiloka },
  { code: 'en-pts', lang: 'en', name: 'PTS', short: 'PS', desc: 'Pali Text Society Pali-English Dictionary by T. W. Rhys Davids and W. Stede, edition of Ānandajoti Bhikkhu (2025)',
    origin: 'ancient-buddhist-texts.net, © Pali Text Society, CC BY-NC 3.0; bold restored from the Digital Pali Reader copy', importer: ctx => ptsOf(ctx, ctx.text && ((b, v, p, names) => ctx.text!.page(b, v, p, names))) },
  { code: 'en-dppn', lang: 'en', name: 'Proper Names', short: 'PN', desc: 'Dictionary of Pāli Proper Names by G. P. Malalasekera, revised by Ānandajoti Bhikkhu (2025)',
    origin: 'ancient-buddhist-texts.net, CC BY-SA 4.0', importer: importDppn },
  { code: 'en-vri', lang: 'en', name: 'VRI English', short: 'VR', desc: 'Pāḷi-English glossary of the Vipassana Research Institute', origin: 'CST4 software (VRI)' },
  { code: 'en-critical', lang: 'en', name: 'Critical PD', short: 'CR', desc: 'A Critical Pāli Dictionary (a - kāreti)',
    origin: 'cpd.uni-koeln.de, as collected by the Digital Pāḷi Dictionary project', importer: importCpd },
  { code: 'my-u-hoke-sein', lang: 'my', name: 'U Hoke Sein', short: 'HS', desc: 'Pāḷi-Myanmar Dictionary by U Hoke Sein', origin: 'PCED (Alobha)', importer: myanmarImporter('my-u-hoke-sein') },
  { code: 'my-23-vol', lang: 'my', name: 'Abhidhāna', short: 'AB', desc: 'Tipiṭaka Pāḷi-Myanmar Dictionary (Tipiṭaka Pāḷi-Myanmar Abhidhān, 23 volumes)', origin: 'PCED (Alobha)', importer: myanmarImporter('my-23-vol') },
  { code: 'my-android', lang: 'my', name: 'Android App', short: 'AA', desc: 'Pāḷi-Myanmar dictionary of the Pali Myanmar Dictionary Android app (several sources, each named)',
    origin: 'Pali Myanmar Dictionary Android app; ဍ္ဎ restored where a conversion lost it', importer: ctx => importAndroid(ctx, knownPali(ctx.dpd)) },
  { code: 'si-buddhadatta', lang: 'si', name: 'පොල්වත්තේ බුද්ධදත්ත', short: 'BU', desc: 'පොල්වත්තේ බුද්ධදත්ත හිමි, පාලි-සිංහල අකාරාදිය',
    origin: 'github.com/pnfo/pali-sinhala-dictionary', importer: sinhalaImporter('buddhadatta_dict.json') },
  { code: 'si-sumangala', lang: 'si', name: 'මඩිතියවෙල සුමඞ්ගල', short: 'MS', desc: 'මඩිතියවෙල සිරි සුමඞ්ගල හිමි, පාලි-සිංහල ශබ්දකෝෂය',
    origin: 'github.com/pnfo/pali-sinhala-dictionary', importer: sinhalaImporter('sumangala_dict.json') },
  { code: 'th-etipitaka', lang: 'th', name: 'E-Tipitaka', short: 'ET', desc: 'Pāḷi-Thai dictionary of the E-Tipitaka program', origin: 'E-Tipitaka software' },
  { code: 'th-aj-subhira', lang: 'th', name: 'สุภีร์ ทุมทอง', short: 'SU', desc: 'Pāḷi-Thai dictionary by Ajahn Subhira Thumthong', origin: 'Ven Buja' },
  { code: 'th-thaiware', lang: 'th', name: 'Thai Ware', short: 'TW', desc: 'Pāḷi-Thai dictionary of the ThaiWare Tipitaka program', origin: 'ThaiWare software' },
  { code: 'th-dhamma-cheti-1', lang: 'th', name: 'กิริยากิตก์ฉบับธรรมเจดีย์', short: 'DC1', desc: 'Participles (kitaka verb forms), Dhammacetiya edition', origin: 'a PDF' },
  { code: 'th-dhamma-cheti-2', lang: 'th', name: 'กิริยาอาขยาตฉบับธรรมเจดีย์', short: 'DC2', desc: 'Finite verbs (ākhyāta verb forms), Dhammacetiya edition', origin: 'a PDF' },
  { code: 'th-bhumibol', lang: 'th', name: 'PTS Bhumibol', short: 'BB', desc: 'Thai translation of the PTS Pali-English Dictionary (King Bhumibol edition), revised and completed with AI (Claude, 2026) from the PTS 2025 edition',
    origin: 'a PDF, repaired with the English PTS dictionary; AI-translated passages are marked',
    importer: ctx => importThaiPts(ctx, englishIndex(ptsOf(ctx).rows), knownPali(ctx.dpd), ctx.text && ((b, v, p, names) => ctx.text!.page(b, v, p, names))) },
  { code: 'ch-suttacentral', lang: 'ch', name: 'SC Chinese', short: 'SC', desc: 'Pāḷi-Chinese dictionary of SuttaCentral', origin: 'SuttaCentral' },
  { code: 'hi-vri', lang: 'hi', name: 'VRI Hindi', short: 'VR', desc: 'Pāḷi-Hindi glossary of the Vipassana Research Institute', origin: 'CST4 software (VRI)' },
  { code: 'in-suttacentral', lang: 'in', name: 'SC Indonesian', short: 'SC', desc: 'Pāḷi-Indonesian dictionary of SuttaCentral', origin: 'SuttaCentral' },
  { code: 'es-marco', lang: 'es', name: 'Marco A', short: 'ES', desc: "Buddhadatta's Concise Pāḷi-English Dictionary in Spanish, translated by Marco A.", origin: 'SuttaCentral' },
  { code: 'pt-marco', lang: 'pt', name: 'Marco A', short: 'PT', desc: "Buddhadatta's Concise Pāḷi-English Dictionary in Portuguese, translated by Marco A.", origin: 'SuttaCentral' },
  { code: 'kh-glossary', lang: 'kh', name: 'Glossary App', short: 'GA', desc: 'Pāḷi-Khmer glossary', origin: 'Pali-Khmer Glossary Windows app v1.0' },
  // PCED: the rights to the content are not stated; opt-in until they are
  { code: 'vi-pced', lang: 'vi', name: 'Pali-Việt', short: 'VI', desc: 'Bửu Chơn, Pali-Việt; Tịnh Sự, Abhidhamma; Giác Nguyên, Vinaya',
    origin: 'PCED by Alobha (github.com/palipced)', importer: importPcedVi, optIn: true },
  { code: 'ko-pced', lang: 'ko', name: '빨한 PTS 사전', short: 'KO', desc: 'Korean translation of the PTS dictionary (Seonunsa)',
    origin: 'PCED by Alobha (github.com/palipced)', importer: importPcedKo, optIn: true },
]

export const DICT_SCHEMA = `
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- opt_in: not used unless chosen (not part of "all dictionaries")
CREATE TABLE dict (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, lang TEXT NOT NULL, name TEXT NOT NULL, short TEXT NOT NULL,
  descr TEXT NOT NULL, origin TEXT NOT NULL, entries INTEGER NOT NULL, opt_in INTEGER NOT NULL);
-- word: lower case Roman, fold: diacritics removed (lookups), hom: homonym number (0: none),
-- meaning: html in the markup of build/dicts/markup.ts (sanitised on the client), '' for a variant headword whose
-- meaning is the one of entry alias_of
CREATE TABLE entry (id INTEGER PRIMARY KEY, dict_id INTEGER NOT NULL, word TEXT NOT NULL, fold TEXT NOT NULL, hom INTEGER NOT NULL,
  meaning TEXT NOT NULL, alias_of INTEGER);
CREATE INDEX entry_fold ON entry(fold);
-- the abbreviations of a dictionary (<abbr data-a="abbr">)
CREATE TABLE dict_abbrev (dict_id INTEGER NOT NULL, abbr TEXT NOT NULL, expansion TEXT NOT NULL, PRIMARY KEY (dict_id, abbr)) WITHOUT ROWID;
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

export interface DictSources {
  dictDir?: string; breakups?: string; dpd?: string
  /** .cache/dicts (data/dicts.lock sources) and data/ (submodules, fixes) */
  cacheDir?: string; dataDir?: string
  /** db/text.db: references are linked to the places they point to */
  textDb?: string
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
    const insDict = db.prepare('INSERT INTO dict VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insEntry = db.prepare('INSERT INTO entry (dict_id, word, fold, hom, meaning, alias_of) VALUES (?, ?, ?, ?, ?, ?)')
    const insAbbrev = db.prepare('INSERT OR REPLACE INTO dict_abbrev VALUES (?, ?, ?)')
    const ctx: ImportCtx = {
      dictDir: src.dictDir ?? '', cacheDir: src.cacheDir ?? '', dataDir: src.dataDir ?? '', dpd: src.dpd, log,
      text: src.textDb ? readTextIndex(src.textDb) : undefined,
      report: (name, lines) => {
        if (!src.cacheDir) return
        const dir = path.join(src.cacheDir, 'reports')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, `${name}.tsv`), lines.join('\n') + '\n')
      },
    }
    DICTS.forEach((d, i) => {
      const id = i + 1
      const res = (d.importer ?? v2Importer(d.code))(ctx)
      let n = 0
      for (const r of res.rows) {
        const words = [r.word, ...(r.aliases ?? [])].filter(Boolean)
        if (!words.some(keep)) continue
        const main = insEntry.run(id, r.word, fold(r.word), r.hom ?? 0, r.meaning, null).lastInsertRowid
        for (const a of new Set(r.aliases ?? [])) if (a && a !== r.word) insEntry.run(id, a, fold(a), r.hom ?? 0, '', main)
        n++
      }
      for (const [a, x] of Object.entries(res.abbrevs ?? {})) insAbbrev.run(id, a, x)
      insDict.run(id, d.code, d.lang, d.name, d.short, d.desc ?? '', d.origin ?? '', n, d.optIn ? 1 : 0)
      log(`dict ${d.code}: ${n}`)
    })

    // the breakups: PCED's Pali Word Grammar (clean), else the v2 breakups
    const grammar = src.cacheDir ? readGrammarBreakups(src.cacheDir) : null
    if (grammar) {
      const insB = db.prepare('INSERT INTO breakup VALUES (?, ?, ?, ?, ?)')
      let n = 0
      for (const g of grammar) {
        if (!keep(g.word)) continue
        insB.run(g.word, fold(g.word), g.type, g.parts.join(', '), JSON.stringify(g.parts.map(p => [p, 3])))
        n++
      }
      meta.breakups = 'PCED Pali Word Grammar'
      log(`breakups: ${n} (PCED Pali Word Grammar)`)
    } else if (src.breakups && fs.existsSync(src.breakups)) {
      const bdb = new Database(src.breakups, { readonly: true })
      const insB = db.prepare('INSERT INTO breakup VALUES (?, ?, ?, ?, ?)')
      const rows = bdb.prepare('SELECT word, type, origin, breakstr FROM breakup').all() as { word: string; type: string; origin: string; breakstr: string }[]
      // the v2 breakups: the splits (a+b) of the etymology brackets of the Myanmar Abhidhān (my-23-vol), with the
      // gender / word class (type). origin was the whole bracket (Burmese notes converted as if Pāḷi): only the splits
      let n = 0
      for (const r of rows) {
        const w = sinhToRoman(r.word)
        if (!keep(w)) continue
        // breakstr: [["අංස+කාසාව",3], ...] -> [["aṃsa+kāsāva",3], ...]
        const parts = (JSON.parse(r.breakstr) as [string, number][]).map(([s, t]) => [s.split('+').map(sinhToRoman).join('+'), t] as [string, number])
        if (!parts.length) continue
        insB.run(w, fold(w), r.type, [...new Set(parts.map(p => p[0]))].join(', '), JSON.stringify(parts))
        n++
      }
      bdb.close()
      log(`breakups: ${n} (of ${rows.length}; without a split: left out)`)
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
