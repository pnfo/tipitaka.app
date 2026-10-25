/**
 * Every mention of a name in the mūla and aṭṭhakathā texts (dev-docs/names.md). A word is a mention when its form is
 * in the gazetteer (data/names/forms.tsv) and
 *  - the form is no common word (sāvatthiyaṃ, sāriputto): always, or
 *  - it is also a common word (ānando "joy", sakko "able", uttaro "higher"):
 *      a decision about this very word (data/names/decisions/<book>.jsonl, AI or manual, text-quote selectors), else
 *      the verdict about the form (data/names/form-verdicts.tsv: name | word | context, AI or manual), and for the
 *      forms of context an honorific or title next to it (āyasmā ānando, sakko devānamindo, uttaro nāma).
 * The homonym of a name (ānanda 2 the monk, 3 the paccekabuddhas) is picked by the title after it and the other names
 * of the paragraph (gazetteer.ts pickEntity); amb counts the homonyms it was picked from.
 * Offsets are UTF-16 offsets into para.text (the stored markup), so the reader can mark them.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Corpus, TPara } from '../tree'
import { paraPos } from '../links'
import { words } from '../align/text'
import { NodeTexts, resolveSelector, type Selector } from '../align/decisions'
import { normalizeWord } from '../../shared/tokenize'
import { displayName, rankEntities, type Entity, type EntityType, type Form, type Gazetteer } from './gazetteer'

export type Verdict = 'name' | 'word' | 'context'
export type MentionSource = 'form' | 'verdict' | 'rule' | 'ai' | 'manual'
export interface Mention { book: number; idx: number; s: number; e: number; entity: string; amb: number; src: MentionSource }
/** a decision about one word: the name it is (slug), or null: no name */
export interface MentionDecision { c: Selector; e: string | null; conf: number; src: string; note?: string }

const ALL: EntityType[] = ['person', 'deity', 'group', 'place', 'animal']
const PARTICLE = /^(?:kho|pana|ca|pi|hi|nāma|kira|panā|kirā|nu)$/

export function readVerdicts(dir: string): Map<string, Verdict> {
  const out = new Map<string, Verdict>()
  const f = path.join(dir, 'form-verdicts.tsv')
  if (!fs.existsSync(f)) return out
  for (const l of fs.readFileSync(f, 'utf8').split('\n').slice(1)) {
    const [form, v] = l.split('\t')
    if (form && (v === 'name' || v === 'word' || v === 'context')) out.set(form, v)
  }
  return out
}

export function readMentionDecisions(dir: string): MentionDecision[] {
  const d = path.join(dir, 'decisions')
  if (!fs.existsSync(d)) return []
  const out: MentionDecision[] = []
  for (const f of fs.readdirSync(d).filter(f => f.endsWith('.jsonl')).sort()) {
    for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) if (l.trim()) out.push(JSON.parse(l) as MentionDecision)
  }
  return out
}

/** the form of a word of the markup, as in the gazetteer (lower case, quotes and markers dropped) */
export const wordForm = (text: string, s: number, e: number) =>
  normalizeWord(text.slice(s, e).replace(/\*\*/g, '').replace(/\|[MVPT][\d.]+\|/g, '').replace(/[‘’'`]/g, ''))

export interface Occurrence { book: number; idx: number; s: number; e: number; form: string; f: Form; prev: string; next: string; next2: string }

/** the name words of the mūla and aṭṭhakathā books, in order */
export function* occurrences(c: Corpus, g: Gazetteer): Generator<Occurrence> {
  for (const b of c.books) {
    if (b.def.coll !== 'mula' && b.def.coll !== 'atta') continue
    const base = paraPos(c, b.idx, 0)
    for (let i = 0; i < b.paraCount; i++) {
      const p: TPara = c.paras[base + i]
      if (/^(?:book|chapter|title|subhead|subsubhead|nikaya)$/.test(p.rend)) continue
      const ws = words(p.text)
      const forms = ws.map(w => wordForm(p.text, w.s, w.e))
      for (let k = 0; k < ws.length; k++) {
        const f = g.forms.get(forms[k])
        if (!f || f.how === 'd') continue
        yield { book: b.idx, idx: i, s: ws[k].s, e: ws[k].e, form: forms[k], f, prev: forms[k - 1] ?? '', next: forms[k + 1] ?? '', next2: forms[k + 2] ?? '' }
      }
    }
  }
}

/** before a name: āyasmā ānando (the vocatives bho / āvuso / mahārāja and rājā are followed by common words too) */
export const BEFORE_NAME = new Set(['āyasmā', 'āyasmantaṃ', 'āyasmato', 'āyasmatā', 'āyasmante', 'āyasmantā', 'āyasmanto'])
/** after a name, a personal title: sakko devānamindo, subho māṇavo, sumano thero ("X nāma" defines words too, "deva,
 * kumāro" is a vocative and "there" a locative) */
export const AFTER_NAME = /^(?:t?ther(?:o|aṃ|assa|ena|ī|iṃ|iyā)|devaputt\w*|devadhīt\w*|devānamind\w*|devarāj\w*|yakkh(?:o|aṃ|assa|ena|inī|iniṃ|iniyā)|brāhmaṇ(?:o|aṃ|assa|ena|ī|iṃ|iyā)|paribbājak\w*|upāsak(?:o|aṃ|assa|ena)|upāsik(?:ā|aṃ|āya)|gahapat(?:i|iṃ|issa|inā|ino|ānī)|māṇav(?:o|aṃ|assa|ena|ikā)|seṭṭh(?:i|iṃ|issa|inā)|nāgarāj\w*|asurind\w*|sāmaṇer(?:o|aṃ|assa|ena)|paccekabuddh\w*)$/
/** an honorific before or a personal title after the word */
export const confirmedByRule = (o: Occurrence) => BEFORE_NAME.has(o.prev) || AFTER_NAME.test(o.next)

export interface MentionResult { mentions: Mention[]; pending: Occurrence[]; stats: Record<string, number> }

export function extractMentions(c: Corpus, g: Gazetteer, verdicts: Map<string, Verdict>, decisions: MentionDecision[]): MentionResult {
  // decisions by position (they are text-quote selectors: resolved against the current text)
  const nt = new NodeTexts(c)
  const decided = new Map<string, string | null>()
  let broken = 0
  for (const d of decisions) {
    const r = resolveSelector(nt, d.c)
    if (!r) { broken++; continue }
    const w = r.ws[r.w0]
    decided.set(`${r.book}:${w.idx}:${w.s}`, d.e)
  }
  const mentions: Mention[] = []
  const pending: Occurrence[] = []
  const stats: Record<string, number> = { form: 0, verdict: 0, rule: 0, ai: 0, word: 0, pending: 0, decidedNone: 0, brokenDecisions: broken }
  let para = '', context: Entity[] = []
  for (const o of occurrences(c, g)) {
    const pk = `${o.book}:${o.idx}`
    if (pk !== para) { para = pk; context = [] }
    let src: MentionSource | null = null
    let entity: Entity | null = null
    const dk = `${pk}:${o.s}`
    if (decided.has(dk)) {
      const slug = decided.get(dk)
      if (!slug) { stats.decidedNone++; continue }
      entity = g.entities.get(slug) ?? null
      src = 'ai'
    } else if (!o.f.notNames.length) src = 'form'
    else {
      const v = verdicts.get(o.form)
      if (v === 'word') { stats.word++; continue }
      if (v === 'name') src = 'verdict'
      else if (confirmedByRule(o)) src = 'rule'
      else { stats.pending++; pending.push(o); continue }
    }
    let sure = true
    // the words around it: "suppiyopi kho paribbājako" (the title after a particle)
    if (!entity) ({ best: entity, sure } = rankEntities(o.f, ALL, context, [o.prev, o.next, PARTICLE.test(o.next) ? o.next2 : '']))
    if (!entity) continue
    stats[src]++
    context.push(entity)
    const name = displayName(entity)
    // namesakes it was not told apart from (shown on all their pages as "may be another …")
    // (DPPN namesakes are no candidates: rankEntities never picks them, an AI decision names them)
    const amb = sure ? 0 : o.f.entities.filter(e => e !== entity && !e.namesake && e.type === entity!.type && displayName(e) === name).length
    mentions.push({ book: o.book, idx: o.idx, s: o.s, e: o.e, entity: entity.sameAs ?? entity.slug, amb, src })
  }
  return { mentions, pending, stats }
}
