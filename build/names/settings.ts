/**
 * Settings: where a sutta or a commentary story was taught, who taught it when not the Buddha, who came to the
 * Buddha (the interlocutor) and whom the story is about (dev-docs/names.md). Read from the fixed formulas:
 *
 *  mūla   "ekaṃ samayaṃ bhagavā sāvatthiyaṃ viharati jetavane …"     place(s), the teacher when a disciple
 *         "tena samayena buddho bhagavā vesāliyaṃ viharati …"      (Vinaya)
 *         "Sāvatthinidānaṃ." "Sāvatthiyaṃ jetavane."               (SN: the nidāna abbreviated)
 *         SN suttas without a nidāna take the place of the sutta before them in the saṃyutta (source inherit)
 *         "… yena bhagavā tenupasaṅkami", "ekamantaṃ ṭhito kho X"  who came (the first paragraphs of a sutta)
 *  aṭṭhakathā
 *         "… imaṃ dhammadesanaṃ satthā jetavane viharanto tissattheraṃ ārabbha kathesi"   place(s), about
 *         "… viharanto kathesi. Kaṃ pana ārabbha ayaṃ kathā samuṭṭhitāti? Seṭṭhissa …"     (Jātaka)
 *         "Ayaṃ dhammadesanā kattha bhāsitāti? Sāvatthiyaṃ. Kaṃ ārabbhāti? Cakkhupālattheraṃ."
 *
 * A name form that is also a common word (ānanda "joy", sakka "able", māṇava "young man") counts as a person only
 * next to an honorific or a title: āyasmā ānando, sakko devānamindo, subho māṇavo.
 *
 * The unit of a setting is a paragraph range: a sutta node in the mūla, a story in the aṭṭhakathā (a node, or for the
 * Jātaka commentary the paragraphs up to the "…jātakavaṇṇanā" trailer). A story's setting is also given to the mūla
 * paragraphs it explains (the Dhammapada verses of a Dhammapada story), source 'atta'.
 */
import type { Corpus, TNode, TPara } from '../tree'
import type { ParaLink } from '../links'
import { paraPos } from '../links'
import { indexedText, tokenizeFlat, type Token } from '../../shared/tokenize'
import { pickEntity, type Entity, type EntityType, type Gazetteer } from './gazetteer'

export type SettingRole = 'place' | 'teacher' | 'with' | 'about'
export type SettingSource = 'nidana' | 'abbrev' | 'inherit' | 'formula' | 'qa' | 'atta'

export interface Setting {
  /** the unit: para range [start, end) of a book, and the node that names it */
  book: number
  start: number
  end: number
  node: number
  /** title of a unit that is no node (Jātaka stories) */
  title?: string
  role: SettingRole
  entity: string
  /** order of the entity in its role (Sāvatthī 0, Jetavana 1) */
  ord: number
  /** the paragraph the setting was read from */
  evBook: number
  evIdx: number
  source: SettingSource
  conf: number
  /** a commentary story whose setting was given to the mūla it explains: not listed again on the name pages */
  unlisted?: boolean
}

interface Unit { book: number; start: number; end: number; node: number; title?: string }

const PEOPLE: EntityType[] = ['person', 'deity', 'group']
const SUBJECTS = new Set(['satthā', 'bhagavā', 'buddho', 'tathāgato', 'bhagavati', 'satthari'])
const NIDANA_VERBS = new Set(['viharati', 'viharanti', 'paṭivasati', 'paṭivasanti', 'tadavasari', 'addhānamaggappaṭipanno', 'vasati'])
const COME = /^(?:ten)?upasaṅkam(?:i|iṃsu|itvā)$/
const SIT = /^(?:nisinn|ṭhit)[oāaṃ]$/
const HEADINGS = /^(?:book|chapter|title|subhead|subsubhead|nikaya|centre)$/
export const SUTTA_TITLE = /sutt(?:a|aṃ|anta|antaṃ)$/
export const HONORIFIC = new Set(['āyasmā', 'āyasmantaṃ', 'āyasmato', 'āyasmatā', 'āyasmante', 'āyasmantā', 'rājā', 'rājānaṃ', 'rañño', 'raññā'])
export const TITLE = /^(?:nāma|devaputt|devānamind|devarāj|upāsik|ther|brāhmaṇ|paribbājak|upāsak|gahapat|māṇav|yakkh|nigaṇṭh|nāṭaputt|bhikkhun|kumār|licchav|mahārāj|kosal|māgadh|vedehiputt|nāgarāj|asurind|seṭṭh|brahm|devat|devī|rāj|sakyaputt|mallaputt|moggallān|kaccān|gotam|bhāradvāj|vacchagott|aggivessan)/
const LOC_PL = /(?:esu|īsu|ūsu)$/

interface PText { flat: string; toks: Token[] }
const ptext = (p: TPara): PText => {
  const flat = indexedText(p.text)
  return { flat, toks: tokenizeFlat(flat) }
}
const gapAfter = (t: PText, i: number) => t.flat.slice(t.toks[i].end, t.toks[i + 1]?.start ?? t.flat.length)
/** a sentence ends after token i */
const endsSentence = (t: PText, i: number) => /[.?!;]/.test(gapAfter(t, i))
const endsQuestion = (t: PText, i: number) => gapAfter(t, i).includes('?')

export function extractSettings(c: Corpus, g: Gazetteer, links: ParaLink[]): Setting[] {
  const out: Setting[] = []
  const has = new Set<string>() // book:start:role
  const add = (u: Unit, role: SettingRole, es: Entity[], p: TPara, source: SettingSource, conf: number) => {
    const k = `${u.book}:${u.start}:${role}`
    if (!es.length || has.has(k)) return
    has.add(k)
    const seen = new Set<string>()
    es.filter(e => !seen.has(e.slug) && !!seen.add(e.slug)).forEach((e, ord) =>
      out.push({ ...u, role, entity: e.slug, ord, evBook: p.book, evIdx: p.idx, source, conf }))
  }

  /** the names among tokens [i, j) of the given types (compounds and titles too, not derived words) */
  const namesIn = (t: PText, i: number, j: number, types: EntityType[]): Entity[] => {
    const res: Entity[] = []
    const place = types.includes('place')
    for (let k = Math.max(0, i); k < Math.min(j, t.toks.length); k++) {
      const w = t.toks[k].w
      const f = g.forms.get(w)
      if (!f || f.how === 'd') continue
      if (!place && f.notNames.length && !HONORIFIC.has(t.toks[k - 1]?.w) && !TITLE.test(t.toks[k + 1]?.w ?? '')) continue
      // "kosalesu, sakkesu": among the Kosalans, the Sakyans
      const e = pickEntity(f, place && LOC_PL.test(w) ? [...types, 'group'] : types, res, t.toks[k + 1]?.w)
      if (e) res.push(e)
    }
    return res
  }

  const suttaUnit = (n: TNode): Unit => {
    for (let m: TNode | undefined = n; m && m.kind !== 'book' && m.kind !== 'group'; m = m.parent >= 0 ? c.nodes[m.parent] : undefined) {
      if (SUTTA_TITLE.test(m.title.replace(/[\s.,;:]+$/, '').toLowerCase())) return { book: m.book, start: m.start, end: m.end, node: m.idx }
    }
    return { book: n.book, start: n.start, end: n.end, node: n.idx }
  }

  for (const b of c.books) {
    const coll = b.def.coll
    if (coll !== 'mula' && coll !== 'atta') continue
    const base = paraPos(c, b.idx, 0)
    const para = (i: number) => c.paras[base + i]
    const jataka = coll === 'atta' && /jātaka/i.test(b.def.title)
    // Jātaka stories: from after a trailer ("…jātakavaṇṇanā paṭhamā.") or a heading to the next trailer
    const storyOf = new Int32Array(b.paraCount).fill(-1)
    const stories: Unit[] = []
    if (jataka) {
      let s = 0
      for (let i = 0; i < b.paraCount; i++) {
        const p = para(i)
        if (!HEADINGS.test(p.rend)) continue
        if (p.rend === 'centre' && /jātakavaṇṇanā/i.test(p.text)) {
          const title = p.text.replace(/\|[MVPT][\d.]+\|/g, '').replace(/\s+\S+\.$/, '').trim()
          for (let k = s; k <= i; k++) storyOf[k] = stories.length
          stories.push({ book: b.idx, start: s, end: i + 1, node: p.node, title })
        }
        s = i + 1
      }
    }
    const unitOf = (p: TPara): Unit => {
      if (coll === 'mula') return suttaUnit(c.nodes[p.node])
      if (jataka && storyOf[p.idx] >= 0) return stories[storyOf[p.idx]]
      const n = c.nodes[p.node]
      return { book: n.book, start: n.start, end: n.end, node: n.idx }
    }

    /** nidāna window: from the anchor to the end of the sentence with the dwelling verb ("tadavasari. Tatra sudaṃ
     * bhagavā icchānaṅgale viharati …" takes the next sentence too) */
    const mulaNidana = (p: TPara, t: PText, k0: number) => {
      let end = Math.min(t.toks.length, k0 + 40)
      for (let k = k0; k < end; k++) {
        if (!NIDANA_VERBS.has(t.toks[k].w)) continue
        let e = k
        while (e < end - 1 && !endsSentence(t, e)) e++
        if (t.toks[k].w === 'tadavasari' && t.toks[e + 1]?.w === 'tatra') { e++; while (e < end - 1 && !endsSentence(t, e)) e++ }
        end = e + 1
        break
      }
      const u = unitOf(p)
      const places = namesIn(t, k0, end, ['place'])
      add(u, 'place', places, p, 'nidana', 0.95)
      // the teacher: a person named before the first place ("ekaṃ samayaṃ āyasmā ānando kosambiyaṃ viharati")
      if (t.toks[k0]?.w === 'bhagavā') return
      let k1 = k0
      while (k1 < end && !NIDANA_VERBS.has(t.toks[k1].w) && !(places.length && g.forms.get(t.toks[k1].w)?.entities.includes(places[0]))) k1++
      add(u, 'teacher', namesIn(t, k0, k1, ['person', 'deity']), p, 'nidana', 0.9)
    }

    /** "Sāvatthinidānaṃ." / "Sāvatthiyaṃ." / "Rājagahe veḷuvane." opening a sutta */
    const abbrevNidana = (p: TPara, t: PText) => {
      const w0 = t.toks[0]?.w
      if (!w0) return
      if (w0.endsWith('nidānaṃ')) {
        const f = g.forms.get(w0)
        const e = f && pickEntity(f, ['place'])
        if (e) add(unitOf(p), 'place', [e], p, 'abbrev', 0.95)
        return
      }
      let e = 0
      while (e < 3 && e < t.toks.length - 1 && !endsSentence(t, e)) e++
      if (!endsSentence(t, e)) return
      const places = namesIn(t, 0, e + 1, ['place'])
      if (places.length === e + 1) add(unitOf(p), 'place', places, p, 'abbrev', 0.9)
    }

    /** who came: the names of the clause before "(ten)upasaṅkami", or after "ekamantaṃ nisinno/ṭhito kho" */
    const visitors = (u: Unit) => {
      for (let i = u.start, n = 0; i < u.end && n < 3; i++) {
        const p = para(i)
        if (HEADINGS.test(p.rend)) continue
        n++
        const t = ptext(p)
        for (let k = 0; k < t.toks.length; k++) {
          const w = t.toks[k].w
          let es: Entity[] = []
          if (COME.test(w)) {
            let s = k
            while (s > 0 && k - s < 25 && !endsSentence(t, s - 1)) s--
            es = namesIn(t, s, k, PEOPLE)
          } else if (w === 'ekamantaṃ' && SIT.test(t.toks[k + 1]?.w ?? '') && t.toks[k + 2]?.w === 'kho') {
            let e = k + 3
            while (e < t.toks.length - 1 && e < k + 10 && !endsSentence(t, e) && !/^(?:bhagavant|bhagavato|etadavoc|ajjhabhās|abhās)/.test(t.toks[e].w)) e++
            es = namesIn(t, k + 3, e, PEOPLE)
          }
          if (es.length) { add(u, 'with', es, p, 'nidana', 0.85); return }
        }
      }
    }

    const attaStory = (p: TPara, t: PText) => {
      const w = (k: number) => t.toks[k]?.w ?? ''
      const u = unitOf(p)
      for (let k = 0; k < t.toks.length; k++) {
        // "kattha bhāsitāti? Sāvatthiyaṃ. Kaṃ ārabbhāti? Cakkhupālattheraṃ."
        // (only of "this teaching": the council in the commentaries asks where other texts were taught)
        const thisTeaching = /desan/.test(w(k - 1)) || /desan/.test(w(k - 2))
        if (w(k) === 'kattha' && /^bhāsit/.test(w(k + 1)) && endsQuestion(t, k + 1) && thisTeaching) {
          let e = k + 2
          while (e < t.toks.length - 1 && !endsSentence(t, e)) e++
          add(u, 'place', namesIn(t, k + 2, e + 1, ['place']), p, 'qa', 0.95)
          continue
        }
        if (w(k) === 'kaṃ' && /^ārabbh/.test(w(k + 1)) && endsQuestion(t, k + 1) && has.has(`${u.book}:${u.start}:place`)) {
          let e = k + 2
          while (e < t.toks.length - 1 && !endsSentence(t, e)) e++
          add(u, 'about', namesIn(t, k + 2, e + 1, PEOPLE), p, 'qa', 0.9)
          continue
        }
        if (w(k) !== 'viharanto' && w(k) !== 'viharante') continue
        // back to the subject: satthā jetavane viharanto, bhagavā sāvatthiṃ upanissāya jetavane viharanto
        let s = k - 1
        while (s >= 0 && k - s <= 12 && !SUBJECTS.has(t.toks[s].w)) s--
        if (s < 0 || k - s > 12) continue
        const places = namesIn(t, s + 1, k, ['place'])
        if (!places.length) continue
        add(u, 'place', places, p, 'formula', 0.9)
        // forward to ārabbha in the same sentence, else the "Kaṃ pana ārabbha …? <answer>" that follows
        let e = k + 1
        while (e < t.toks.length && e < k + 15 && !/^ārabbh/.test(w(e)) && !endsSentence(t, e - 1)) e++
        if (/^ārabbh/.test(w(e))) add(u, 'about', namesIn(t, k + 1, e, PEOPLE), p, 'formula', 0.85)
        else {
          for (let q = e; q < Math.min(t.toks.length - 1, e + 12); q++) {
            if (w(q) !== 'kaṃ' || !(w(q + 1) === 'pana' || /^ārabbh/.test(w(q + 1)))) continue
            let a = q
            while (a < t.toks.length - 1 && !endsQuestion(t, a)) a++
            let z = a + 1
            while (z < t.toks.length - 1 && !endsSentence(t, z)) z++
            add(u, 'about', namesIn(t, a + 1, z + 1, PEOPLE), p, 'formula', 0.8)
            break
          }
        }
        return
      }
    }

    const units = new Map<number, Unit>() // mūla sutta units by start
    for (let i = 0; i < b.paraCount; i++) {
      const p = para(i)
      if (coll === 'atta') {
        if (/viharant|bhāsit|ārabbh/.test(p.text)) attaStory(p, ptext(p))
        continue
      }
      const u = unitOf(p)
      if (SUTTA_TITLE.test(c.nodes[u.node].title.replace(/[\s.,;:]+$/, '').toLowerCase())) units.set(u.start, u)
      if (HEADINGS.test(p.rend)) continue
      const t = ptext(p)
      const w = (k: number) => t.toks[k]?.w
      let found = false
      for (let k = 0; k < t.toks.length - 1 && !found; k++) {
        if (w(k) === 'ekaṃ' && w(k + 1) === 'samayaṃ') { mulaNidana(p, t, k + 2); found = true }
        else if (w(k) === 'tena' && w(k + 1) === 'samayena' && w(k + 2) === 'buddho' && w(k + 3) === 'bhagavā') { mulaNidana(p, t, k + 4); found = true }
      }
      if (!found && i - u.start <= 2) abbrevNidana(p, t)
    }
    for (const u of units.values()) visitors(u)

    // SN: a sutta without a nidāna has the place of the one before it in the saṃyutta
    if (/^s03/.test(b.def.id)) {
      const samyutta = (n: TNode) => {
        for (let m: TNode | undefined = n; m; m = m.parent >= 0 ? c.nodes[m.parent] : undefined) if (/saṃyuttaṃ$/.test(m.title)) return m.idx
        return -1
      }
      let prev: Setting[] = [], prevS = -2
      for (const u of [...units.values()].sort((x, y) => x.start - y.start)) {
        const s = samyutta(c.nodes[u.node])
        const own = has.has(`${u.book}:${u.start}:place`)
        if (own) prev = out.filter(r => r.book === u.book && r.start === u.start && r.role === 'place')
        else if (s >= 0 && s === prevS && prev.length) {
          has.add(`${u.book}:${u.start}:place`)
          for (const r of prev) out.push({ ...r, ...u, source: 'inherit', conf: 0.7 })
        }
        prevS = s
      }
    }
  }

  // a story's setting goes to the mūla paragraphs it explains
  const toMula = new Map<string, ParaLink[]>()
  for (const l of links) {
    if (l.kind !== 'mula-atta' || l.source !== 'paranum') continue
    const k = `${l.fromBook}:${l.fromIdx}`
    toMula.set(k, [...(toMula.get(k) ?? []), l])
  }
  const byUnit = new Map<string, Setting[]>()
  for (const s of out) {
    if (c.books[s.book].def.coll !== 'atta') continue
    const k = `${s.book}:${s.start}`
    byUnit.set(k, [...(byUnit.get(k) ?? []), s])
  }
  const mulaRows: Setting[] = []
  for (const rows of byUnit.values()) {
    const s0 = rows[0]
    const targets: ParaLink[] = []
    for (let i = s0.start; i < s0.end; i++) targets.push(...(toMula.get(`${s0.book}:${i}`) ?? []))
    if (!targets.length) continue
    const book = targets[0].toBook
    const idxs = targets.filter(l => l.toBook === book).map(l => l.toIdx)
    const start = Math.min(...idxs), end = Math.max(...idxs) + 1
    const node = c.paras[paraPos(c, book, start)].node
    // a sutta with its own setting keeps it
    const u = suttaUnit(c.nodes[node])
    if (has.has(`${u.book}:${u.start}:place`)) continue
    for (const r of rows) {
      mulaRows.push({ ...r, book, start, end, node, title: s0.title ?? c.nodes[s0.node].title, source: 'atta', conf: Math.round(r.conf * 95) / 100 })
      r.unlisted = true
    }
  }
  return [...out, ...mulaRows]
}
