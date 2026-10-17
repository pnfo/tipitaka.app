/**
 * AI help for the commentary alignment (dev-docs/alignments.md), run with Claude Code on the plan usage:
 *
 *   npm run align:ai -- spot-check [--books s0101a,s0502a] [--n 240] [--seed 1] [--apply] [--src ai]
 *       checks a stratified random sample of the deterministic glosses (--src ai: of the AI ones) -> db/align-spot-check.md
 *       (--apply stores the corrections as decisions, src ai-check)
 *   npm run align:ai -- resolve [--books …] [--limit 50] [--repair]
 *       asks for the lemmas the deterministic aligner could not place (and those whose stored decision broke)
 *       -> data/alignments/<book>.jsonl
 *   npm run align:ai -- gold [--books …] [--per-book 4] [--model opus]
 *       reference alignment for npm run align:eval: Opus searches the whole corpus (Grep / Read) for each lemma's words
 *       -> data/alignments/gold/<book>.jsonl
 *   npm run align:ai -- sections --books vin06t [--model sonnet|opus]
 *       which section of the explained text each commentary section explains -> data/alignments/<book>.sections.tsv
 *       (section anchors for the aligner, like paragraph numbers)
 *   common: --jobs 4 (parallel calls) --model sonnet --dry (print the first prompt, no calls)
 *
 * Needs db/text.db (npm run build:data) and the claude CLI (CLAUDE_BIN, else claude on PATH, else the VS Code
 * extension's binary). Every call is cached in .cache/align/ai/<hash>.json by its input, so a run can be stopped and
 * resumed, and after upstream corrections only the sections whose text changed are asked again.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Claude, pool, type AskOptions } from './lib/claude'
import { corpusFromDb } from '../build/align/db-corpus'
import { alignCommentaries, type Gloss, type SecLemma } from '../build/align'
import { NodeTexts, makeSelector, readDecisions, writeDecisions, type Decision } from '../build/align/decisions'
import { buildParaLinks, paraPos } from '../build/links'
import { foldWord, stream, words } from '../build/align/text'
import type { Corpus } from '../build/tree'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const cmd = args[0]
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const flag = (name: string) => args.includes(name)
const MODEL = arg('--model', 'sonnet')!
const JOBS = +arg('--jobs', '4')!
const DRY = flag('--dry')
const CACHE = path.join(repo, '.cache/align/ai')
const ALIGN_DIR = path.join(repo, 'data/alignments')
/** per job kind: changing a prompt changes its version (and so its cache keys) */
const PROMPT_VERSION: Record<string, number> = { check: 2, resolve: 1, gold: 1, sections: 1, search: 1 }

// ---------------- corpus ----------------
const { corpus: c } = corpusFromDb(path.join(repo, 'db/text.db'))
const anchors = buildParaLinks(c, ALIGN_DIR)
const stored = readDecisions(ALIGN_DIR)
const bookIds = arg('--books', 's0101a,s0102a,s0103a,s0502a,s0101t,s0102t,s0103t')!.split(',')
const books = c.books.filter(b => bookIds.some(id => b.def.id.startsWith(id))).map(b => b.idx)
const text = (b: number, i: number) => c.paras[paraPos(c, b, i)].text
const keyOf = (b: number, i: number) => c.nodes[c.paras[paraPos(c, b, i)].node].key
const nt = new NodeTexts(c)

/** readable text of markup with markers inserted at markup offsets */
function plain(t: string, marks: { at: number; s: string }[] = []): string {
  let out = t
  for (const m of [...marks].sort((a, b) => b.at - a.at)) out = out.slice(0, m.at) + m.s + out.slice(m.at)
  return out.replace(/\{[^}]*\}/g, '').replace(/\|[MVPT][0-9.]+\|/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
}
/** cut around the first marker */
function around(t: string, open: string, before: number, after: number): string {
  const i = t.indexOf(open)
  if (i < 0) return t.slice(0, before + after)
  const a = Math.max(0, i - before), b = Math.min(t.length, i + after)
  return (a > 0 ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : '')
}

// ---------------- claude ----------------
const SYSTEM = `You are an expert in Pāḷi and in the Theravāda commentarial literature (aṭṭhakathā, ṭīkā). You align commentaries with the texts they explain. Answer only through the requested JSON. Be precise and conservative.`
const claude = new Claude({ system: SYSTEM, cacheDir: CACHE, model: MODEL, dry: DRY, versions: PROMPT_VERSION })
const ask = <T>(kind: string, prompt: string, schema: object, o?: AskOptions) => claude.ask<T>(kind, prompt, schema, o)

// ---------------- decisions ----------------
function saveDecisions(byBook: Map<number, Decision[]>) {
  for (const [b, ds] of byBook) {
    const file = path.join(ALIGN_DIR, `${c.books[b].def.id.replace(/\.[a-z]+$/, '')}.jsonl`)
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Decision) : []
    const id = (d: Decision) => `${d.c.k}|${d.c.q}|${d.c.pre ?? ''}`
    const merged = new Map(old.map(d => [id(d), d]))
    for (const d of ds) { const o = merged.get(id(d)); if (!o || !o.src.startsWith('manual')) merged.set(id(d), d) }
    writeDecisions(file, [...merged.values()])
    console.log(`${path.relative(repo, file)}: ${ds.length} decisions (${merged.size} in the file)`)
  }
}

/** the words of a quote in a range of paragraphs: [book, para range] -> selector of the occurrence after `before` */
function findQuote(book: number, from: number, to: number, quote: string, before: string): { idx: number; s: number; idx2: number; e: number } | null {
  const ws: { f: string; s: number; e: number; idx: number }[] = []
  for (let i = from; i < to; i++) for (const w of words(text(book, i))) ws.push({ f: w.f, s: w.s, e: w.e, idx: i })
  const st = stream(ws)
  const full = foldWord(quote).replace(/[^a-z]/g, ''), pre = foldWord(before).replace(/[^a-z]/g, '')
  // the exact words, else with the last one or two letters different (an ending copied in another form)
  for (const q of [full, full.length >= 6 ? full.slice(0, -1) : '', full.length >= 8 ? full.slice(0, -2) : '']) {
    if (!q) continue
    let best: { w0: number; w1: number; score: number } | null = null
    for (let i = st.f.indexOf(q); i >= 0; i = st.f.indexOf(q, i + 1)) {
      if (st.ws[st.w[i]] !== i) continue
      const ok = !pre || st.f.slice(Math.max(0, i - pre.length), i) === pre
      const score = ok ? 0 : 1
      if (!best || score < best.score) best = { w0: st.w[i], w1: st.w[i + q.length - 1], score }
    }
    if (best) return { idx: ws[best.w0].idx, s: ws[best.w0].s, idx2: ws[best.w1].idx, e: ws[best.w1].e }
  }
  return null
}

// ---------------- spot check ----------------
type CheckVerdict = 'correct' | 'wrong-target' | 'wrong-span' | 'not-lemma' | 'unsure'
interface CheckItem { id: string; g: Gloss; stratum: string; commentary: string; target: string }
interface CheckAnswer { id: string; verdict: CheckVerdict; quote?: string; before?: string; reason: string }

const CHECK_SCHEMA = {
  type: 'object', required: ['items'],
  properties: {
    items: {
      type: 'array', items: {
        type: 'object', required: ['id', 'verdict', 'reason'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['correct', 'wrong-target', 'wrong-span', 'not-lemma', 'unsure'] },
          quote: { type: 'string', description: 'wrong-target / wrong-span: the right words, copied exactly from the shown text context' },
          before: { type: 'string', description: 'the 1-3 words just before the quote in the text context' },
          reason: { type: 'string', description: 'a few words' },
        },
      },
    },
  },
}

function checkPrompt(items: CheckItem[]): string {
  return `An automatic aligner links each lemma of a Pāḷi commentary (the words it quotes from the text it explains, printed in bold and usually followed by "ti" / "nti") to the quoted words in the explained text (mūla, or the aṭṭhakathā for a ṭīkā).

For each item: in COMMENTARY the lemma is marked ⟦…⟧; in TEXT the words the aligner chose are marked ⟦…⟧. Decide:
- correct: the marked TEXT words are the ones the lemma quotes at this place. Sandhi and inflection differences are normal (Sambahulāna-nti = sambahulānaṃ; hotī-ti = hoti). A lemma ending in "tiādi" / "…pe…" stands for a longer passage: a span starting at the right words is correct. Marks always cover whole words: when the lemma quotes a member of a compound or a word joined by sandhi (mālā in mālāgandhavilepanaṃ, ayaṃ in tatrāyaṃ), marking that whole compound / joined word is correct.
- wrong-target: the lemma quotes other words of the TEXT (e.g. another occurrence of the same word that this commentary passage explains). If the right words are in the shown TEXT, copy them exactly into "quote" and the 1-3 words before them into "before".
- wrong-span: right place, but the marked span misses or adds words; give the right words in "quote" / "before".
- not-lemma: the marked commentary words are not a quotation of this TEXT (a defined term, a gloss, a reference to another book, a heading).
- unsure: you cannot tell from the context.

${items.map(it => `ITEM ${it.id}\nCOMMENTARY: ${it.commentary}\nTEXT: ${it.target}`).join('\n\n')}`
}

function checkItem(g: Gloss, id: string, stratum: string): CheckItem {
  const ct = plain(text(g.cBook, g.cIdx), [{ at: g.cS, s: '⟦' }, { at: g.cIdx === g.cEIdx ? g.cE : text(g.cBook, g.cIdx).length, s: '⟧' }])
  const parts: string[] = []
  for (let i = g.tIdx; i <= g.tEIdx; i++) {
    const t = text(g.tBook, i)
    const marks = [...(i === g.tIdx ? [{ at: g.tS, s: '⟦' }] : []), ...(i === g.tEIdx ? [{ at: g.tE, s: '⟧' }] : [])]
    parts.push(plain(t, marks))
  }
  return { id, g, stratum, commentary: around(ct, '⟦', 250, 350), target: around(parts.join(' / '), '⟦', 400, 500) }
}

function rng(seed: number) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647 }

async function spotCheck() {
  const n = +arg('--n', '240')!
  const seed = +arg('--seed', '1')!
  const r = alignCommentaries(c, anchors, { books, decisions: stored })
  // --src ai: check the AI's own matches instead of the deterministic ones
  const src = arg('--src', 'lemma')
  const det = r.glosses.filter(g => g.src === src && g.kind !== 'mula-tika')
  // strata: book, verse / prose text, match kind, confidence band
  const strata = new Map<string, Gloss[]>()
  for (const g of det) {
    const verse = c.paras[paraPos(c, g.tBook, g.tIdx)].rend.startsWith('gatha') ? 'verse' : 'prose'
    const band = g.conf >= 0.9 ? 'hi' : g.conf >= 0.7 ? 'mid' : 'lo'
    const k = `${c.books[g.cBook].def.id} ${verse} ${g.mk} ${band}`
    const a = strata.get(k)
    if (a) a.push(g); else strata.set(k, [g])
  }
  const rand = rng(seed)
  const items: CheckItem[] = []
  for (const [k, gs] of [...strata].sort()) {
    const take = Math.min(gs.length, Math.max(4, Math.round((n * gs.length) / det.length)))
    const pool = [...gs]
    for (let i = 0; i < take; i++) {
      const j = Math.floor(rand() * pool.length)
      items.push(checkItem(pool.splice(j, 1)[0], `${items.length + 1}`, k))
    }
  }
  console.log(`spot check: ${items.length} of ${det.length} deterministic glosses in ${strata.size} strata (seed ${seed})`)
  const batches: CheckItem[][] = []
  for (let i = 0; i < items.length; i += 15) batches.push(items.slice(i, i + 15))
  const answers = (await pool(batches, JOBS, b => ask<{ items: CheckAnswer[] }>('check', checkPrompt(b), CHECK_SCHEMA))).flatMap(a => a?.items ?? [])
  if (DRY) return
  const byId = new Map(answers.map(a => [a.id, a]))
  report(items, byId, seed, det.length, new Map([...strata].map(([k, v]) => [k, v.length])))
  if (flag('--apply')) {
    const out = new Map<number, Decision[]>()
    for (const it of items) {
      const a = byId.get(it.id)
      if (!a || a.verdict === 'correct' || a.verdict === 'unsure') continue
      const g = it.g
      const cSel = makeSelector(nt, keyOf(g.cBook, g.cIdx), g.cIdx, g.cS, g.cE, g.cEIdx)
      if (!cSel) continue
      let d: Decision | null = null
      if (a.verdict === 'not-lemma') d = { c: cSel, v: 'not-lemma', conf: 0.8, src: 'ai-check', note: a.reason }
      else if (a.quote) {
        const f = findQuote(g.tBook, Math.max(0, g.tIdx - 2), g.tEIdx + 3, a.quote, a.before ?? '')
        const mSel = f && makeSelector(nt, keyOf(g.tBook, f.idx), f.idx, f.s, f.e, f.idx2)
        if (mSel) d = { c: cSel, m: mSel, v: 'match', conf: 0.8, src: 'ai-check', note: a.reason }
      }
      if (d) { const l = out.get(g.cBook) ?? []; l.push(d); out.set(g.cBook, l) }
    }
    saveDecisions(out)
  }
}

function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1]
  const z = 1.96, p = k / n, d = 1 + (z * z) / n
  const c0 = (p + (z * z) / (2 * n)) / d, w = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, c0 - w), Math.min(1, c0 + w)]
}

function report(items: CheckItem[], byId: Map<string, CheckAnswer>, seed: number, population: number, sizes: Map<string, number>) {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`
  // the sample over-represents the small strata: weight each stratum's precision by its share of all glosses
  let wsum = 0, wprec = 0
  for (const [k, size] of sizes) {
    const as = items.filter(i => i.stratum === k).map(i => byId.get(i.id)).filter(a => a && a.verdict !== 'unsure')
    if (!as.length) continue
    wsum += size
    wprec += (size * as.filter(a => a!.verdict === 'correct').length) / as.length
  }
  const row = (name: string, its: CheckItem[]) => {
    const as = its.map(i => byId.get(i.id)).filter((a): a is CheckAnswer => !!a && a.verdict !== 'unsure')
    const ok = as.filter(a => a.verdict === 'correct').length
    const [lo, hi] = wilson(ok, as.length)
    const v = (x: CheckVerdict) => as.filter(a => a.verdict === x).length
    return `| ${name} | ${its.length} | ${as.length ? pct(ok / as.length) : '-'} | ${pct(lo)}–${pct(hi)} | ${v('wrong-target')} | ${v('wrong-span')} | ${v('not-lemma')} | ${its.length - as.length} |`
  }
  const group = (f: (it: CheckItem) => string) => {
    const m = new Map<string, CheckItem[]>()
    for (const it of items) { const k = f(it); const a = m.get(k); if (a) a.push(it); else m.set(k, [it]) }
    return [...m].sort()
  }
  const head = ['| | checked | precision | 95% | wrong target | wrong span | not a lemma | unsure / no answer |', '|---|---|---|---|---|---|---|---|']
  const wrong = items.filter(i => { const a = byId.get(i.id); return a && a.verdict !== 'correct' && a.verdict !== 'unsure' })
  const md = [
    '# Alignment spot check', '',
    `${new Date().toISOString()} · ${MODEL} · seed ${seed} · ${items.length} of ${population} ${arg('--src', 'lemma') === 'ai' ? 'AI' : 'deterministic'} glosses of ${bookIds.join(', ')}`,
    `Precision = correct / judged (unsure excluded); a stratum is book · verse/prose text · match kind · confidence band.`, '',
    '## Overall', '', ...head, row('all', items), '',
    `Estimated precision of all ${population} deterministic glosses (strata weighted by size): **${pct(wprec / Math.max(1, wsum))}**`, '',
    '## By book', '', ...head, ...group(i => i.stratum.split(' ')[0]).map(([k, v]) => row(k, v)), '',
    '## By match kind and confidence', '', ...head, ...group(i => i.stratum.split(' ').slice(1).join(' ')).map(([k, v]) => row(k, v)), '',
    '## By stratum', '', ...head, ...group(i => i.stratum).map(([k, v]) => row(k, v)), '',
    `## Errors (${wrong.length})`, '',
    ...wrong.flatMap(it => {
      const a = byId.get(it.id)!
      return [`### ${it.id} · ${a.verdict} · ${it.stratum} · ${keyOf(it.g.cBook, it.g.cIdx)} → ${keyOf(it.g.tBook, it.g.tIdx)}`,
        `- commentary: ${it.commentary}`, `- text: ${it.target}`, `- ${a.reason}${a.quote ? ` → **${a.before ?? ''} ⟦${a.quote}⟧**` : ''}`, '']
    }),
    usageLine(),
  ].join('\n')
  const file = path.join(repo, arg('--src', 'lemma') === 'ai' ? 'db/align-spot-check-ai.md' : 'db/align-spot-check.md')
  fs.writeFileSync(file, md + '\n')
  console.log(`${path.relative(repo, file)}\n${row('all', items)}\nweighted precision ${pct(wprec / Math.max(1, wsum))}`)
}

// ---------------- resolve ----------------
interface ResolveAnswer { items: { id: string; verdict: 'match' | 'not-lemma' | 'none'; quote?: string; before?: string; in?: 'TEXT' | 'MULA'; conf: number }[] }
const RESOLVE_SCHEMA = {
  type: 'object', required: ['items'],
  properties: {
    items: {
      type: 'array', items: {
        type: 'object', required: ['id', 'verdict', 'conf'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['match', 'not-lemma', 'none'] },
          quote: { type: 'string', description: 'match: the quoted words, copied exactly (same spelling) from TEXT' },
          before: { type: 'string', description: 'match: the 1-3 words just before the quote in TEXT' },
          in: { type: 'string', enum: ['TEXT', 'MULA'], description: 'match: where the quote is, when a MULA text is given' },
          conf: { type: 'number', description: '0..1' },
        },
      },
    },
  },
}
const MAX_TEXT = 14000

interface Window { tb: number; ws: number; we: number }
interface ResolveJob extends Window { book: number; mula?: Window | null; lemmas: { id: string; sl: SecLemma }[]; prompt: string }

function windowText(w: Window, max: number): string {
  let out = ''
  for (let p = w.ws; p < w.we && out.length < max; p++) {
    const t = plain(text(w.tb, p))
    if (t) out += `[${p}] ${t}\n`
  }
  return out.slice(0, max)
}

function resolvePrompt(commentary: string, target: string, ids: string[], mula = ''): string {
  // (without MULA the prompt is the one of the first runs: their answers stay cached)
  const mulaPart = mula ? `

This commentary is a ṭīkā: TEXT is the aṭṭhakathā it explains. A ṭīkā also quotes the mūla, given below as MULA: a quote may be in TEXT or in MULA. For a match say which in "in" (TEXT when both have the words); "none" then means in neither.

MULA (paragraph numbers in [ ]):
${mula}` : ''
  return `Below is a passage of a Pāḷi commentary and the TEXT it explains. Some lemmas of the commentary (bold quotations of the TEXT, usually followed by "ti" / "nti") are marked ⟦L1: …⟧, ⟦L2: …⟧ … An automatic aligner could not find them in the TEXT.

For each marked lemma (${ids.join(', ')}):
- match: copy the quoted words exactly as they are written in TEXT into "quote" (only the words the lemma quotes: sandhi and inflection may differ, e.g. Sambahulāna-nti = sambahulānaṃ, hotī-ti = hoti; for a "tiādi" / "…pe…" lemma the first words of the passage), and the 1-3 words just before them in TEXT into "before". If the words occur several times, choose the occurrence this part of the commentary explains.
- not-lemma: the marked words are not a quotation of TEXT (a defined or explained term, a gloss, a reference to another text, a quotation from another text, a title).
- none: a quotation, but the quoted words are not in the shown TEXT.
Give conf (0..1) for each.

COMMENTARY:
${commentary}

TEXT (paragraph numbers in [ ]):
${target}${mulaPart}`
}

async function resolve() {
  const limit = +arg('--limit', '100000')!
  const jobs: ResolveJob[] = []
  const r = alignCommentaries(c, anchors, {
    books, decisions: stored,
    onSection: d => {
      if (d.tb < 0) return
      const open = d.lemmas.map((sl, k) => ({ sl, k })).filter(x => !d.matched[x.k])
      for (let i = 0; i < open.length; i += 20) {
        const chunk = open.slice(i, i + 20).map((x, j) => ({ id: `L${j + 1}`, sl: x.sl }))
        // commentary: the paragraphs of the lemmas with the lemmas marked, cut around them
        const byPara = new Map<number, { at: number; s: string }[]>()
        for (const { id, sl } of chunk) {
          const end = sl.p0 === sl.p1 ? sl.e : text(d.book, sl.p0).length
          const m = byPara.get(sl.p0) ?? []
          m.push({ at: sl.s, s: `⟦${id}: ` }, { at: end, s: '⟧' })
          byPara.set(sl.p0, m)
        }
        const commentary = [...byPara].sort((a, b) => a[0] - b[0]).map(([p, marks]) => {
          const t = plain(text(d.book, p), marks)
          return t.length > 1500 ? around(t, '⟦', 600, 900) : t
        }).join('\n')
        const target = windowText(d, MAX_TEXT)
        const mula = d.mula ? windowText(d.mula, 10000) : ''
        jobs.push({ book: d.book, tb: d.tb, ws: d.ws, we: d.we, mula: d.mula, lemmas: chunk, prompt: resolvePrompt(commentary, target, chunk.map(x => x.id), mula) })
      }
    },
  })
  if (flag('--repair')) for (const w of r.warnings) console.log(`broken: ${w}`)
  if (flag('--search')) return searchResolve(jobs.slice(0, limit))
  const todo = jobs.slice(0, limit)
  const lemmaCount = todo.reduce((a, j) => a + j.lemmas.length, 0)
  console.log(`resolve: ${todo.length} of ${jobs.length} jobs, ${lemmaCount} lemmas, ${(todo.reduce((a, j) => a + j.prompt.length, 0) / 1000).toFixed(0)}k chars of prompts`)
  const out = new Map<number, Decision[]>()
  let found = 0, notLemma = 0, none = 0, invalid = 0
  await pool(todo, JOBS, async job => {
    const res = await ask<ResolveAnswer>('resolve', job.prompt, RESOLVE_SCHEMA)
    const answers = res?.items ?? []
    // quotes that are not in the text: ask once more, saying which
    // the quote in the text the answer names (TEXT / MULA), else in the other one
    const locate = (a: ResolveAnswer['items'][number]) => {
      const ws: Window[] = a.in === 'MULA' && job.mula ? [job.mula, job] : job.mula ? [job, job.mula] : [job]
      for (const w of ws) { const f = a.quote ? findQuote(w.tb, w.ws, w.we, a.quote, a.before ?? '') : null; if (f) return { tb: w.tb, ...f } }
      return null
    }
    const bad = answers.filter(a => a.verdict === 'match' && !locate(a))
    if (bad.length) {
      const retry = await ask<ResolveAnswer>('resolve', `${job.prompt}\n\nNOTE: these quotes are not in TEXT as given: ${bad.map(a => `${a.id} "${a.quote ?? ''}"`).join(', ')}. ` +
        `Copy the words exactly as they are written in TEXT${job.mula ? ' or MULA' : ''} (or answer none). Answer only for ${bad.map(a => a.id).join(', ')}.`, RESOLVE_SCHEMA)
      for (const r of retry?.items ?? []) { const i = answers.findIndex(a => a.id === r.id); if (i >= 0) answers[i] = r }
    }
    for (const a of answers) {
      const l = job.lemmas.find(x => x.id === a.id)
      if (!l) continue
      const { sl } = l
      const cSel = makeSelector(nt, keyOf(job.book, sl.p0), sl.p0, sl.s, sl.e, sl.p1)
      if (!cSel) continue
      let d: Decision | null = null
      if (a.verdict === 'match' && a.quote) {
        const f = locate(a)
        const mSel = f && makeSelector(nt, keyOf(f.tb, f.idx), f.idx, f.s, f.e, f.idx2)
        if (mSel) { d = { c: cSel, m: mSel, v: 'match', conf: Math.min(0.95, a.conf), src: `ai:${MODEL}` }; found++ } else invalid++
      } else if (a.verdict === 'not-lemma') { d = { c: cSel, v: 'not-lemma', conf: a.conf, src: `ai:${MODEL}` }; notLemma++ } else none++
      if (d) { const ds = out.get(job.book) ?? []; ds.push(d); out.set(job.book, ds) }
    }
  })
  if (DRY) return
  console.log(`answers: ${found} matched, ${notLemma} not lemmas, ${none} not in the text, ${invalid} quotes not found in the text`)
  saveDecisions(out)
}

// ---------------- corpus export (for the agentic gold / section map jobs) ----------------
const CORPUS = path.join(repo, '.cache/align/corpus')

/** every book as text: one line per paragraph "number<TAB>key<TAB>text", and the same without diacritics */
function exportCorpus() {
  const stamp = path.join(CORPUS, 'stamp')
  const st = fs.statSync(path.join(repo, 'db/text.db'))
  const want = `${st.size} ${st.mtimeMs}`
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want) return
  fs.mkdirSync(CORPUS, { recursive: true })
  const index: string[] = ['file\tcollection\ttitle']
  for (const b of c.books) {
    const lines: string[] = [], folded: string[] = []
    for (let i = 0; i < b.paraCount; i++) {
      const p = c.paras[paraPos(c, b.idx, i)]
      const t = plain(p.text)
      lines.push(`${i}\t${keyOf(b.idx, i)}\t${p.num ? p.num + '. ' : ''}${t}`)
      folded.push(`${i}\t${keyOf(b.idx, i)}\t${p.num ? p.num + '. ' : ''}${t.normalize('NFD').replace(/[̀-ͯ]/g, '')}`)
    }
    fs.writeFileSync(path.join(CORPUS, `${b.def.id}.txt`), lines.join('\n') + '\n')
    fs.writeFileSync(path.join(CORPUS, `${b.def.id}.fold.txt`), folded.join('\n') + '\n')
    index.push(`${b.def.id}\t${b.def.coll}\t${b.def.title}`)
  }
  fs.writeFileSync(path.join(CORPUS, 'books.tsv'), index.join('\n') + '\n')
  fs.writeFileSync(stamp, want)
  console.log(`corpus exported to ${path.relative(repo, CORPUS)}`)
}
const bookByFile = (f: string) => c.books.find(b => b.def.id === f.replace(/^.*\//, '').replace(/(\.fold)?\.txt$/, ''))

const CORPUS_HELP = `The whole Tipiṭaka is in the current directory, one file per book; books.tsv lists them (file, collection mula / atta / tika / anya, title). Each line of a book file is: paragraph number <TAB> section key <TAB> text. The *.fold.txt files have the same lines without diacritics (ā→a, ṃ→m, ñ→n, ṭ→t, ḍ→d, ṇ→n, ḷ→l, ṅ→n), easier to search (e.g. grep -n "sambahulanam" s0101m.mul.fold.txt). An aṭṭhakathā (atta) explains the mūla; a ṭīkā (tika) explains an aṭṭhakathā (and through it the mūla) or, for some ṭīkās, a book of the añña collection.`

// ---------------- gold set (reference alignment for npm run align:eval) ----------------
const GOLD_DIR = path.join(ALIGN_DIR, 'gold')
const GOLD_BOOKS = 's0101a,s0102a,s0103a,s0502a,s0201a,s0301a,s0402a,s0513a1,s0508a1,s0505a,abh01a,abh03a,vin01a,vin02a1,s0101t,s0102t,s0201t,abh01t,vin01t1,vin11t,abh07t,s0104t'
interface GoldAnswer { items: { id: string; verdict: 'match' | 'not-lemma' | 'none'; file?: string; para?: number; quote?: string; before?: string; conf: number; note?: string }[] }
const GOLD_SCHEMA = {
  type: 'object', required: ['items'],
  properties: {
    items: {
      type: 'array', items: {
        type: 'object', required: ['id', 'verdict', 'conf'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['match', 'not-lemma', 'none'] },
          file: { type: 'string', description: 'match: the book file, e.g. s0101m.mul' },
          para: { type: 'number', description: 'match: the paragraph number (first column)' },
          quote: { type: 'string', description: 'match: the quoted words exactly as written in the file (with diacritics)' },
          before: { type: 'string', description: 'match: the 1-3 words just before the quote' },
          conf: { type: 'number' },
          note: { type: 'string' },
        },
      },
    },
  },
}

/** sections of the commentary with their lemmas marked (L1…), cut around the lemmas */
function markedCommentary(book: number, lemmas: { id: string; sl: SecLemma }[]): string {
  const byPara = new Map<number, { at: number; s: string }[]>()
  for (const { id, sl } of lemmas) {
    const end = sl.p0 === sl.p1 ? sl.e : text(book, sl.p0).length
    const m = byPara.get(sl.p0) ?? []
    m.push({ at: sl.s, s: `⟦${id}: ` }, { at: end, s: '⟧' })
    byPara.set(sl.p0, m)
  }
  return [...byPara].sort((a, b) => a[0] - b[0]).map(([p, marks]) => {
    const t = plain(text(book, p), marks)
    return t.length > 2500 ? around(t, '⟦', 1000, 1500) : t
  }).join('\n')
}

async function gold() {
  exportCorpus()
  const ids = arg('--books', GOLD_BOOKS)!.split(',')
  const gbooks = c.books.filter(b => ids.some(id => b.def.id.startsWith(id))).map(b => b.idx)
  const perBook = +arg('--per-book', '4')!
  const rand = rng(+arg('--seed', '7')!)
  const secs = new Map<number, { book: number; i0: number; tb: number; ws: number; we: number; lemmas: SecLemma[] }[]>()
  alignCommentaries(c, anchors, {
    books: gbooks,
    onSection: d => { if (d.lemmas.length >= 2) secs.set(d.book, [...(secs.get(d.book) ?? []), { book: d.book, i0: d.i0, tb: d.tb, ws: d.ws, we: d.we, lemmas: d.lemmas }]) },
  })
  const jobs: { book: number; lemmas: { id: string; sl: SecLemma }[]; prompt: string }[] = []
  for (const [book, list] of secs) {
    const pool0 = [...list]
    for (let k = 0; k < perBook && pool0.length; k++) {
      const sec = pool0.splice(Math.floor(rand() * pool0.length), 1)[0]
      let ls = sec.lemmas.map((sl, i) => ({ sl, i }))
      while (ls.length > 8) ls.splice(Math.floor(rand() * ls.length), 1)
      const lemmas = ls.map((x, j) => ({ id: `L${j + 1}`, sl: x.sl }))
      const hint = sec.tb >= 0 ? `An automatic aligner thinks this passage explains ${c.books[sec.tb].def.id} paragraphs ${sec.ws}–${sec.we - 1} (that may be wrong).` : 'The automatic aligner did not find what this passage explains.'
      const prompt = `You are making a reference ("gold") alignment of a Pāḷi commentary with the text it explains: be careful and thorough, search until you are sure.

The passage below is from ${c.books[book].def.title} (file ${c.books[book].def.id}), section ${keyOf(book, sec.i0)}. Its lemmas - the words it quotes from the text it explains, printed in bold and usually followed by "ti" / "nti" - are marked ⟦L1: …⟧, ⟦L2: …⟧ …

${CORPUS_HELP}
${hint}

For each marked lemma (${lemmas.map(l => l.id).join(', ')}) find the words it quotes at the place this passage explains (use Grep, then Read the lines around the hits to choose the right place):
- match: "file", "para" (the paragraph number in the first column), "quote" = the quoted words copied exactly from that line (whole words; sandhi and inflection may differ from the lemma: Sambahulāna-nti = sambahulānaṃ; for a "tiādi" / "…pe…" lemma the first words of the passage) and "before" = the 1-3 words just before them in that line. If the words occur several times, choose the occurrence that this part of the commentary explains.
- not-lemma: the marked words are not a quotation of the explained text (a defined or explained term, a gloss, a title, a reference to or a quotation from another text).
- none: a quotation of the explained text, but you could not find it.
Give conf (0..1) and a short note.

COMMENTARY:
${markedCommentary(book, lemmas)}`
      jobs.push({ book, lemmas, prompt })
    }
  }
  const model = arg('--model', 'opus')!
  console.log(`gold: ${jobs.length} sections, ${jobs.reduce((a, j) => a + j.lemmas.length, 0)} lemmas, ${model}`)
  const out = new Map<number, Decision[]>()
  let found = 0, notLemma = 0, none = 0, invalid = 0
  await pool(jobs, +arg('--jobs', '3')!, async job => {
    const res = await ask<GoldAnswer>('gold', job.prompt, GOLD_SCHEMA, { model, tools: ['Grep', 'Read'], cwd: CORPUS })
    for (const a of res?.items ?? []) {
      const l = job.lemmas.find(x => x.id === a.id)
      if (!l) continue
      const cSel = makeSelector(nt, keyOf(job.book, l.sl.p0), l.sl.p0, l.sl.s, l.sl.e, l.sl.p1)
      if (!cSel) continue
      let d: Decision | null = null
      if (a.verdict === 'match') {
        const tb = a.file ? bookByFile(a.file) : undefined
        const f = tb && a.quote && a.para !== undefined ? findQuote(tb.idx, Math.max(0, a.para - 2), Math.min(tb.paraCount, a.para + 3), a.quote, a.before ?? '') : null
        const mSel = f && makeSelector(nt, keyOf(tb!.idx, f.idx), f.idx, f.s, f.e, f.idx2)
        if (mSel) { d = { c: cSel, m: mSel, v: 'match', conf: a.conf, src: `gold:${model}`, note: a.note }; found++ } else invalid++
      } else {
        d = { c: cSel, v: a.verdict, conf: a.conf, src: `gold:${model}`, note: a.note }
        if (a.verdict === 'none') none++; else notLemma++
      }
      if (d) { const ds = out.get(job.book) ?? []; ds.push(d); out.set(job.book, ds) }
    }
  })
  if (DRY) return
  console.log(`gold answers: ${found} matched, ${notLemma} not lemmas, ${none} not found, ${invalid} quotes not in the given paragraph`)
  for (const [b, ds] of out) writeDecisions(path.join(GOLD_DIR, `${c.books[b].def.id.replace(/\.[a-z]+$/, '')}.jsonl`), ds)
  console.log(`-> ${path.relative(repo, GOLD_DIR)}/`)
}

// ---------------- section maps: which part of the text each commentary section explains ----------------
interface SectionAnswer { items: { from: string; to: string; conf: number }[] }
const SECTION_SCHEMA = {
  type: 'object', required: ['items'],
  properties: {
    items: {
      type: 'array', items: {
        type: 'object', required: ['from', 'to', 'conf'],
        properties: {
          from: { type: 'string', description: 'commentary section key' },
          to: { type: 'string', description: 'key of the explained section, "" if none' },
          conf: { type: 'number' },
        },
      },
    },
  },
}
/** first paragraph of a node that is not its heading, as an alignment file para (#n) */
function firstBody(key: string): string | null {
  const n = c.nodes[c.keyToNode.get(key)!]
  for (let i = n.start; i < n.end; i++) {
    if (!['book', 'chapter', 'title', 'subhead', 'subsubhead', 'nikaya'].includes(c.paras[paraPos(c, n.book, i)].rend)) return `#${i - n.start + 1}`
  }
  return null
}

async function sectionMaps() {
  const model = arg('--model', 'sonnet')!
  const ids = arg('--books')!.split(',')
  const sbooks = c.books.filter(b => ids.some(id => b.def.id.startsWith(id))).map(b => b.idx)
  const r = alignCommentaries(c, anchors, { books: sbooks })
  for (const book of sbooks) {
    const targets = r.targets.get(book) ?? []
    // commentary sections with their first lemmas; the target outline with the first words of each section
    const lemmasOf = (n: { idx: number; book: number; start: number; end: number }) => {
      const out: string[] = []
      for (let i = n.start; i < n.end && out.length < 3; i++) {
        const p = c.paras[paraPos(c, n.book, i)]
        if (p.node !== n.idx) continue
        for (const m of p.text.matchAll(/\*\*([^*]+)\*\*/g)) { out.push(plain(m[1]).slice(0, 40)); if (out.length >= 3) break }
      }
      return out
    }
    const cnodes = c.nodes.filter(n => n.book === book && n.start >= 0 && n.kind !== 'book').map(n => ({ n, ls: lemmasOf(n) })).filter(x => x.ls.length)
    const tnodes = c.nodes.filter(n => targets.includes(n.book) && n.start >= 0 && n.kind !== 'book')
    const firstWords = (n: typeof tnodes[number]) => {
      for (let i = n.start; i < n.end; i++) { const p = c.paras[paraPos(c, n.book, i)]; if (p.node === n.idx && p.rend !== n.rend) return plain(p.text).slice(0, 70) }
      return ''
    }
    const outline = tnodes.map(n => `${n.key} | ${n.title} | ${firstWords(n)}`).join('\n')
    console.log(`${c.books[book].def.id}: ${cnodes.length} sections → ${tnodes.length} sections of ${targets.map(t => c.books[t].def.id).join(', ')} (${(outline.length / 1000).toFixed(0)}k chars), ${model}`)
    const batches: (typeof cnodes)[] = []
    for (let i = 0; i < cnodes.length; i += 60) batches.push(cnodes.slice(i, i + 60))
    const rows: string[] = []
    let mapped = 0, unmapped = 0, invalid = 0
    await pool(batches, JOBS, async batch => {
      const prompt = `Map the sections of a Pāḷi commentary to the sections of the text it explains.

COMMENTARY ${c.books[book].def.title} (${c.books[book].def.id}): one line per section: key | title | the first words it quotes (its lemmas, in bold in the text)
${batch.map(x => `${x.n.key} | ${x.n.title} | ${x.ls.join(' · ')}`).join('\n')}

EXPLAINED TEXT ${targets.map(t => `${c.books[t].def.title} (${c.books[t].def.id})`).join(', ')}: one line per section: key | title | first words
${outline}

For each commentary section give the key of the section of the explained text that it explains: the most specific one whose words the lemmas quote (commentary titles usually add "-vaṇṇanā"; the order is mostly the same). "to": "" when it explains nothing in this text (an introduction, a conclusion, a digression). Give conf (0..1).`
      const res = await ask<SectionAnswer>('sections', prompt, SECTION_SCHEMA, { model })
      for (const a of res?.items ?? []) {
        if (!batch.some(x => x.n.key === a.from)) continue
        if (!a.to) { unmapped++; continue }
        const from = firstBody(a.from), to = c.keyToNode.has(a.to) ? firstBody(a.to) : null
        if (!from || !to) { invalid++; continue }
        rows.push([a.from, from, a.to, to, 'ai', a.conf.toFixed(2)].join('\t')); mapped++
      }
    })
    if (DRY) continue
    const file = path.join(ALIGN_DIR, `${c.books[book].def.id.replace(/\.[a-z]+$/, '')}.sections.tsv`)
    const order = new Map(c.nodes.map(n => [n.key, n.idx]))
    rows.sort((a, b) => order.get(a.split('\t')[0])! - order.get(b.split('\t')[0])!)
    fs.writeFileSync(file, [`# section map of ${c.books[book].def.id} (${model}): from_key from_para to_key to_para source conf`, ...rows].join('\n') + '\n')
    console.log(`${path.relative(repo, file)}: ${mapped} mapped, ${unmapped} explain nothing in the text, ${invalid} unknown keys`)
  }
}

/**
 * resolve --search: the lemmas still open after the window jobs (they quote other parts of the text, or other books)
 * are searched for in the whole corpus (Grep / Read, like the gold set) with the window as a hint
 */
async function searchResolve(jobs: ResolveJob[]) {
  exportCorpus()
  const model = arg('--model', 'sonnet')!
  console.log(`resolve --search: ${jobs.length} sections, ${jobs.reduce((a, j) => a + j.lemmas.length, 0)} lemmas, ${model}`)
  const out = new Map<number, Decision[]>()
  let found = 0, notLemma = 0, none = 0, invalid = 0
  await pool(jobs, JOBS, async job => {
    const lemmas = job.lemmas.slice(0, 10)
    const prompt = `Find what the marked lemmas of a Pāḷi commentary quote. The passage is from ${c.books[job.book].def.title} (file ${c.books[job.book].def.id}), section ${keyOf(job.book, lemmas[0].sl.p0)}. Its lemmas - quotations printed in bold, usually followed by "ti" / "nti" - are marked ⟦L1: …⟧ …; an automatic search in ${c.books[job.tb].def.id} paragraphs ${job.ws}–${job.we - 1}${job.mula ? ` and ${c.books[job.mula.tb].def.id} ${job.mula.ws}–${job.mula.we - 1}` : ''} did not find them.

${CORPUS_HELP}

For each lemma (${lemmas.map(l => l.id).join(', ')}) search the corpus (Grep in the *.fold.txt files, then Read the lines around the hits):
- match: the place the lemma quotes - preferably in the text this commentary explains, else wherever it is quoted from: "file", "para" (first column), "quote" copied exactly from that line (whole words), "before" (1-3 words before it).
- not-lemma: not a quotation (a defined or explained term, a gloss, a title, a reference by name).
- none: a quotation you cannot find.
Give conf (0..1). Be quick: a few searches per lemma.

COMMENTARY:
${markedCommentary(job.book, lemmas)}`
    const res = await ask<GoldAnswer>('search', prompt, GOLD_SCHEMA, { model, tools: ['Grep', 'Read'], cwd: CORPUS })
    for (const a of res?.items ?? []) {
      const l = lemmas.find(x => x.id === a.id)
      if (!l) continue
      const cSel = makeSelector(nt, keyOf(job.book, l.sl.p0), l.sl.p0, l.sl.s, l.sl.e, l.sl.p1)
      if (!cSel) continue
      let d: Decision | null = null
      if (a.verdict === 'match') {
        const tb = a.file ? bookByFile(a.file) : undefined
        const f = tb && a.quote && a.para !== undefined ? findQuote(tb.idx, Math.max(0, a.para - 2), Math.min(tb.paraCount, a.para + 3), a.quote, a.before ?? '') : null
        const mSel = f && tb!.idx !== job.book ? makeSelector(nt, keyOf(tb!.idx, f.idx), f.idx, f.s, f.e, f.idx2) : null
        if (mSel) { d = { c: cSel, m: mSel, v: 'match', conf: Math.min(0.9, a.conf), src: `ai:${model}:search` }; found++ } else invalid++
      } else if (a.verdict === 'not-lemma') { d = { c: cSel, v: 'not-lemma', conf: a.conf, src: `ai:${model}:search` }; notLemma++ } else none++
      if (d) { const ds = out.get(job.book) ?? []; ds.push(d); out.set(job.book, ds) }
    }
  })
  if (DRY) return
  console.log(`search answers: ${found} matched, ${notLemma} not lemmas, ${none} not found, ${invalid} invalid`)
  saveDecisions(out)
}

const usageLine = () => claude.usageLine()

if (cmd === 'spot-check') await spotCheck()
else if (cmd === 'resolve') await resolve()
else if (cmd === 'gold') await gold()
else if (cmd === 'sections') await sectionMaps()
else if (cmd === 'export') exportCorpus()
else { console.log('usage: npm run align:ai -- spot-check|resolve|gold|sections|export [--books …] [--n …] [--limit …] [--jobs 4] [--model sonnet] [--dry] [--apply] [--repair]'); process.exit(1) }
if (!DRY) console.log(usageLine())
