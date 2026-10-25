/**
 * The descriptions of the names in other languages: data/names/i18n/<lang>/meanings.tsv and families.tsv (en, <lang>),
 * keyed by the English text, so that they survive rebuilds of the gazetteer (only new texts need a translation).
 * Sinhala: tipitaka.lk's (dev/names-si, Gemini, reviewed there); Thai: npm run names:translate -- th.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Entity } from './gazetteer'
import { shownFamily } from '../../shared/names'

export interface NameTexts { meaning: Map<string, string>; family: Map<string, string> }

const readTsv = (f: string) => new Map(fs.existsSync(f)
  ? fs.readFileSync(f, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t') as [string, string]).filter(([en, tr]) => en && tr)
  : [])

/** lang -> its translations (the folders of data/names/i18n) */
export function readNameTranslations(dir: string): Map<string, NameTexts> {
  const out = new Map<string, NameTexts>()
  const root = path.join(dir, 'i18n')
  if (!fs.existsSync(root)) return out
  for (const lang of fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory()).sort()) {
    const family = readTsv(path.join(root, lang, 'families.tsv'))
    // the items of a list translated as a whole ("place names; holy sites"), when the lists have as many items
    for (const [en, tr] of [...family]) {
      const e = en.split('; '), t = tr.split(/;\s*/)
      if (e.length > 1 && e.length === t.length) e.forEach((p, i) => { if (!family.has(p)) family.set(p, t[i].trim()) })
    }
    out.set(lang, { meaning: readTsv(path.join(root, lang, 'meanings.tsv')), family })
  }
  return out
}

/** the meaning and family of a name in a language ('' when there is no translation: the English is shown). A family
 *  list ("great disciples; names of arahants") without the categories that repeat the type (shared/names.ts), as a
 *  whole or item by item */
export function translateEntity(t: NameTexts, e: Entity): { meaning: string; family: string } {
  const shown = shownFamily(e.family)
  const parts = shown ? shown.split('; ') : []
  const family = t.family.get(shown) ?? (parts.length && parts.every(p => t.family.has(p)) ? parts.map(p => t.family.get(p)).join('; ') : '')
  return { meaning: t.meaning.get(e.meaning) ?? '', family }
}
