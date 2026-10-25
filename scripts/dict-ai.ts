/**
 * AI revision of the Pali-Thai PTS dictionary (BB, th-bhumibol) against the PTS 2025, on the user's Claude plan
 * (dev-docs/dictionaries.md). The system prompt is data/dict-ai/th-pts-style.md; a job is one headword
 * (build/dicts/thai-ai.ts aiJobs).
 *
 *   npm run dict:ai -- jobs [--prune]               job and size statistics (--prune: drop results of headwords gone)
 *   npm run dict:ai -- pilot [--round 0] [--n 60]   a stratified sample: translations by Sonnet (and in round 0 by
 *       Opus, kept as the reference), judged blind by Opus -> db/dict-ai/pilot-r<round>.md (the gate: Sonnet's mean
 *       score at least Opus's - 0.25, major errors at most Opus's + 3 points)
 *   npm run dict:ai -- run [--model sonnet] [--limit 100] [--only w1,w2]
 *       every job not done (or whose sources changed) -> data/dict-ai/th-bhumibol.jsonl; results that fail the checks
 *       are asked again of Opus -> db/dict-ai/run-report.md
 *   npm run dict:ai -- spot [--n 100]               Opus checks a random sample of the stored results -> db/dict-ai/spot.md
 *   npm run dict:ai -- check                        the automatic checks over all stored results (no calls) -> db/dict-ai/check-report.md
 *   npm run dict:ai -- fix [--only w1,w2] [--limit n]  Opus revises the results the checks or the spot checks found wrong, given
 *                                                   the findings; a blind A/B review keeps the better one -> db/dict-ai/fix-report.md
 *   npm run dict:ai -- compare [--n 30] [--gemini gemini-4-argon]  Gemini (GEMINI_API_KEY) translates a pilot sample;
 *                                                   Opus and Gemini each judge it blind against the stored Opus results
 *                                                   -> db/dict-ai/gemini-compare.md
 *   common: --jobs 4 (parallel calls) --dry (print the first prompts, no calls)
 *     --stop-on-limit: at the plan's session limit save what is done and stop (run again to go on), instead of waiting
 *
 * Every call is cached in .cache/dict-ai by its input: runs can be stopped and resumed. Long runs use up the plan's
 * session limit (and the user's own Claude Code use with it): the calls wait for the reset.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ptsOf } from '../build/dicts/pts'
import { englishIndex, knownPali, pairThai } from '../build/dicts/thai-pts'
import { aiJobs, aiText, batches, cleanAiHtml, LONG, readAiStore, units, writeAiStore, type AiJob, type AiResult, type Unit } from '../build/dicts/thai-ai'
import { checkThai, type ThaiCheck } from '../build/dicts/thai-ai-check'
import type { ImportCtx } from '../build/dicts/types'
import { Claude, LimitReached, pool } from './lib/claude'
import { Gemini } from './lib/gemini'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const cmd = args[0]
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const flag = (name: string) => args.includes(name)
const JOBS = +arg('--jobs', '4')!
const DRY = flag('--dry')
const OUT = path.join(repo, 'db/dict-ai')
const CACHE = path.join(repo, '.cache/dict-ai')
// the longest entries (kamma, dhamma: ~35k characters of Thai) need more than the default output limit
process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS ??= '64000'

// ---------------- jobs ----------------
const ctx: ImportCtx = {
  dictDir: path.join(repo, 'server-data/dicts'), cacheDir: path.join(repo, '.cache/dicts'), dataDir: path.join(repo, 'data'),
  dpd: path.join(repo, '.cache/dpd/dpd.db'), log: () => {}, report: () => {},
}
const english = englishIndex(ptsOf(ctx).rows)
const known = knownPali(ctx.dpd)
const { pairs } = pairThai(ctx, english, known)
const jobs = aiJobs(english, pairs)

// ---------------- translation ----------------
const STYLE = fs.readFileSync(path.join(repo, 'data/dict-ai/th-pts-style.md'), 'utf8')
const REF_TABLE = STYLE.split('\n').filter(l => /^(Ja ชา\.|Commentaries:)/.test(l)).join(' ')
const STYLE_HASH = crypto.createHash('sha1').update(STYLE).digest('hex').slice(0, 8)
const translator = (model: string) => new Claude({ system: STYLE, cacheDir: CACHE, model, dry: DRY, stopOnLimit: flag('--stop-on-limit') })
/** characters per call: Sonnet does better with fewer headwords at a time */
const batchSize = (model: string) => +arg('--batch', model === 'sonnet' ? '1800' : '3500')!

const TRANSLATE_SCHEMA = {
  type: 'object', required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'analysis', 'entries', 'others', 'notes'],
        properties: {
          id: { type: 'string' },
          analysis: { type: 'string' },
          entries: { type: 'array', items: { type: 'object', required: ['hom', 'html'], properties: { hom: { type: 'integer' }, html: { type: 'string' } } } },
          others: { type: 'array', items: { type: 'object', required: ['word', 'html'], properties: { word: { type: 'string' }, html: { type: 'string' } } } },
          notes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}
interface TranslateAnswer { items: { id: string; entries: { hom: number; html: string }[]; others?: { word: string; html: string }[]; notes: string[] }[] }
type Got = { entries: { hom: number; html: string }[]; others: { word: string; html: string }[]; notes: string[] }

function unitPrompt(u: Unit): string {
  const lines = [`=== ${u.id}`]
  if (u.en.length) {
    lines.push('ENGLISH (PTS 2025), homonyms in order:')
    for (const e of u.en) lines.push(`[${e.hom}]${e.part ? ` PART ${e.part[0]} of ${e.part[1]}: give the Thai of this part only; its BB text is a part of the BB entry below` : ''} ${e.html}`)
  } else lines.push('ENGLISH: none (BB only: correct it, add nothing; answer with hom 0)')
  lines.push('BB (current Thai):')
  if (!u.job.th.length) lines.push('none (translate)')
  u.job.th.forEach((t, i) => lines.push(`(${String.fromCharCode(97 + i)}) ${t.html}`))
  return lines.join('\n')
}

function batchPrompt(b: Unit[]): string {
  return `Revise ${b.length === 1 ? 'this headword' : `these ${b.length} headwords`}. Answer with one item per === block (its id), one entry per English homonym ([n] -> hom n).\n\n${b.map(unitPrompt).join('\n\n')}`
}

/** the Thai of the units of a batch, by unit id ([] = no answer); a unit missing from the answer is asked alone */
type Asker = { ask<T>(kind: string, prompt: string, schema: object): Promise<T | null> }
async function translate(model: string, us: Unit[], claude: Asker = translator(model)): Promise<Map<string, Got>> {
  const out = new Map<string, Got>()
  const take = (a: TranslateAnswer | null, b: Unit[]) => {
    for (const it of a?.items ?? []) {
      const u = b.find(x => x.id === it.id)
      if (!u) continue
      const want = u.en.length || 1
      if (it.entries.length !== want || it.entries.some(e => !e.html.trim())) continue
      const others = (it.others ?? []).filter(o => o.word.trim() && o.html.trim()).map(o => ({ word: o.word.trim().toLowerCase(), html: cleanAiHtml(o.html) }))
      out.set(u.id, { entries: it.entries.map((e, i) => ({ hom: u.en[i]?.hom ?? 0, html: cleanAiHtml(e.html) })), others, notes: it.notes })
    }
  }
  const bs = batches(us, batchSize(model))
  await pool(bs, JOBS, async b => take(await claude.ask<TranslateAnswer>(`th-${STYLE_HASH}`, batchPrompt(b), TRANSLATE_SCHEMA), b))
  const missing = us.filter(u => !out.has(u.id))
  if (missing.length && !DRY) await pool(missing, JOBS, async u => take(await claude.ask<TranslateAnswer>(`th-${STYLE_HASH}-alone`, batchPrompt([u]), TRANSLATE_SCHEMA), [u]))
  return out
}

/** the units of a job put together: its entries (parts joined) */
function assemble(job: AiJob, us: Unit[], got: Map<string, Got>): Got | null {
  const mine = us.filter(u => u.job === job)
  if (mine.some(u => !got.has(u.id))) return null
  const byHom = new Map<number, string[]>()
  const notes: string[] = []
  const others = new Map<string, string>() // the parts of a long entry repeat them: once
  for (const u of mine) {
    const g = got.get(u.id)!
    notes.push(...g.notes)
    for (const o of g.others) if (!others.has(o.word)) others.set(o.word, o.html)
    for (const e of g.entries) (byHom.get(e.hom) ?? byHom.set(e.hom, []).get(e.hom)!).push(e.html)
  }
  return { entries: [...byHom].map(([hom, hs]) => ({ hom, html: hs.join(' ') })), others: [...others].map(([word, html]) => ({ word, html })), notes }
}

function checkJob(job: AiJob, entries: { hom: number; html: string }[]): ThaiCheck[] {
  const bb = job.th.map(t => t.html).join(' ')
  return entries.map((e, i) => checkThai(e.html, job.en[i]?.html ?? '', bb, known)) // (kept is judged only for one homonym: failed())
}
const failed = (c: ThaiCheck, job: AiJob) => c.issues.length > 0 || c.missingRefs.length > 2 || (job.th.length > 0 && job.en.length <= 1 && c.kept < 0.6)

// ---------------- judge ----------------
const JUDGE_SYSTEM = `You are a senior reviewer of Pāḷi-Thai lexicography: you know Pāḷi, Thai and the PTS Pali-English Dictionary. You review AI revisions of พจนานุกรมบาลี-ไทย (BB), the Thai translation of the PTS dictionary, against the English PTS 2025. Be strict and specific. Answer only through the JSON.`
const judge = new Claude({ system: JUDGE_SYSTEM, cacheDir: CACHE, model: 'opus', dry: DRY })
const CATS = ['mistranslation', 'omission', 'addition', 'style-drift', 'pali-spelling', 'reference', 'formatting', 'thai-language', 'other'] as const
const JUDGE_SCHEMA = {
  type: 'object', required: ['candidates', 'better'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object', required: ['label', 'accuracy', 'completeness', 'fidelity', 'pali_refs', 'formatting', 'major', 'comment'],
        properties: {
          label: { type: 'string' },
          accuracy: { type: 'integer', minimum: 1, maximum: 5 }, completeness: { type: 'integer', minimum: 1, maximum: 5 },
          fidelity: { type: 'integer', minimum: 1, maximum: 5 }, pali_refs: { type: 'integer', minimum: 1, maximum: 5 },
          formatting: { type: 'integer', minimum: 1, maximum: 5 },
          major: { type: 'array', items: { type: 'object', required: ['category', 'what'], properties: { category: { type: 'string', enum: [...CATS] }, what: { type: 'string' } } } },
          comment: { type: 'string' },
        },
      },
    },
    better: { type: 'string' },
  },
}
interface JudgeCandidate { label: string; accuracy: number; completeness: number; fidelity: number; pali_refs: number; formatting: number; major: { category: string; what: string }[]; comment: string }
interface JudgeAnswer { candidates: JudgeCandidate[]; better: string }
const score = (c: JudgeCandidate) => (c.accuracy + c.completeness + c.fidelity + c.pali_refs + c.formatting) / 5

function judgePrompt(job: AiJob, cands: { label: string; entries: { hom: number; html: string }[]; others?: { word: string; html: string }[] }[]): string {
  return [
    `Headword: ${job.id}`,
    `ENGLISH (PTS 2025):\n${job.en.length ? job.en.map(e => `[${e.hom}] ${e.html}`).join('\n') : 'none (BB only: the revision should only correct)'}`,
    `BB (before):\n${job.th.length ? job.th.map((t, i) => `(${String.fromCharCode(97 + i)}) ${t.html}`).join('\n') : 'none (a new translation)'}`,
    ...cands.map(c => `CANDIDATE ${c.label}:\n${c.entries.map(e => `[${e.hom}] ${e.html}`).join('\n')}${c.others?.length ? `\nothers (BB entries of other words, corrected only): ${c.others.map(o => `${o.word}: ${o.html}`).join('\n')}` : ''}`),
    `The [n] before a candidate's entries and the (a), (b) before BB's are labels of this review (homonym n; BB entry a), not text of the entries. BB's book abbreviations (authoritative, whatever BB's spelling elsewhere): ${REF_TABLE}`,
    `The task given to the candidates: keep BB's correct Thai wording and style; correct garbling, Pāḷi spelling (Thai script), tone marks, references (BB's Thai notation, e.g. ชา.1/9 = Ja I 9); add what BB lacks compared with the English (senses, compounds, references, etymology), wrapped in <span class="ai-add">; translate missing homonyms; one entry per English homonym; drop no reference. BB conventions that are not errors: f./ff. after a page left out; ปุํ. = Puggalapaññatti in references; superscripts without leading zeros; BB's own notations (ธ.ส.แปล, พุ.ท., อ.ศา.) kept.`,
    `Score each candidate 1-5 on: accuracy (Thai faithful to the English and correct Pāḷi meaning), completeness (nothing of the English missing), fidelity (BB's existing wording and conventions kept; no needless rewording), pali_refs (Pāḷi spelling in Thai script, references correct and in BB notation), formatting (markup, senses, compounds, ai-add marks). List major errors (wrong meaning, lost content or references, misspelt Pāḷi that changes the word, needless rewriting of BB, invented content) with a category. Say which candidate is better (label, or "equal").`,
  ].join('\n\n')
}

// ---------------- pilot ----------------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

function pilotSample(n: number, seed: number): AiJob[] {
  const r = rng(seed)
  const pick = (xs: AiJob[], k: number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a.slice(0, k) }
  const size = (j: AiJob) => j.en.reduce((s, e) => s + aiText(e.html).length, 0)
  const thSize = (j: AiJob) => j.th.reduce((s, t) => s + aiText(t.html).length, 0)
  const paired = jobs.filter(j => j.en.length && j.th.length)
  const strata: [string, AiJob[], number][] = [
    ['short', paired.filter(j => size(j) < 600), 0.2],
    ['medium', paired.filter(j => size(j) >= 600 && size(j) < 3000), 0.2],
    ['long', paired.filter(j => size(j) >= 3000 && size(j) < LONG), 0.1],
    ['very long (parts)', paired.filter(j => size(j) >= LONG && size(j) < 20000), 0.02],
    ['truncated BB', paired.filter(j => thSize(j) < 0.5 * size(j) && size(j) > 300), 0.13],
    ['merged / missing homonyms', paired.filter(j => j.en.length !== j.th.length), 0.1],
    ['garbled BB', paired.filter(j => /ฺ(?=[ะ-ูํ็-๎])|[A-Za-z]{3,}[^\s<]*\s[ก-๙]/.test(j.th.map(t => t.html).join(' '))), 0.07],
    ['new (no BB)', jobs.filter(j => j.en.length && !j.th.length), 0.12],
    ['BB only', jobs.filter(j => !j.en.length), 0.06],
  ]
  const out: AiJob[] = [], seen = new Set<string>()
  for (const [name, xs, f] of strata) {
    let k = Math.max(1, Math.round(n * f))
    for (const j of pick(xs, xs.length)) {
      if (!k) break
      if (seen.has(j.id)) continue
      seen.add(j.id); out.push(j); k--
      ;(j as AiJob & { stratum?: string }).stratum = name
    }
  }
  return out
}

async function pilot() {
  const round = +arg('--round', '0')!
  const sample = pilotSample(+arg('--n', '60')!, +arg('--seed', '1')!)
  const us = units(sample)
  console.log(`pilot round ${round}: ${sample.length} headwords, ${us.length} units, style ${STYLE_HASH}`)
  fs.mkdirSync(OUT, { recursive: true })
  // Opus's translations of round 0 stay the reference of the later rounds (only Sonnet's prompt changes)
  const refFile = path.join(OUT, 'pilot-opus.json')
  let opus: Record<string, Got>
  if (round === 0 || !fs.existsSync(refFile)) {
    opus = Object.fromEntries(await translate('opus', us))
    if (!DRY) fs.writeFileSync(refFile, JSON.stringify(opus))
  } else opus = JSON.parse(fs.readFileSync(refFile, 'utf8'))
  const sonnet = await translate('sonnet', us)
  if (DRY) return
  const results: { job: AiJob; s: JudgeCandidate; o: JudgeCandidate; better: string; cs: ThaiCheck[]; co: ThaiCheck[]; sh: string; oh: string }[] = []
  const opusMap = new Map(Object.entries(opus))
  const r = rng(round + 7)
  await pool(sample, JOBS, async job => {
    const s = assemble(job, us, sonnet), o = assemble(job, us, opusMap)
    if (!s || !o) { console.warn(`  ${job.id}: no answer (${s ? '' : 'sonnet '}${o ? '' : 'opus'})`); return }
    const sFirst = r() < 0.5
    const cands = sFirst ? [{ label: 'X', ...s }, { label: 'Y', ...o }] : [{ label: 'X', ...o }, { label: 'Y', ...s }]
    const a = await judge.ask<JudgeAnswer>('th-judge-1', judgePrompt(job, cands), JUDGE_SCHEMA)
    if (!a) return
    const byLabel = (l: string) => a.candidates.find(c => c.label === l)!
    const [sl, ol] = sFirst ? ['X', 'Y'] : ['Y', 'X']
    if (!byLabel(sl) || !byLabel(ol)) return
    results.push({ job, s: byLabel(sl), o: byLabel(ol), better: a.better === sl ? 'sonnet' : a.better === ol ? 'opus' : 'equal',
      cs: checkJob(job, s.entries), co: checkJob(job, o.entries), sh: s.entries.map(e => e.html).join('<br>‖ '), oh: o.entries.map(e => e.html).join('<br>‖ ') })
  })
  writePilotReport(round, results)
}

function writePilotReport(round: number, results: { job: AiJob; s: JudgeCandidate; o: JudgeCandidate; better: string; cs: ThaiCheck[]; co: ThaiCheck[]; sh: string; oh: string }[]) {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const sm = mean(results.map(x => score(x.s))), om = mean(results.map(x => score(x.o)))
  const smaj = results.filter(x => x.s.major.length).length / Math.max(1, results.length), omaj = results.filter(x => x.o.major.length).length / Math.max(1, results.length)
  const pass = sm >= om - 0.25 && smaj <= omaj + 0.03
  const cats = (k: 's' | 'o') => { const c = new Map<string, number>(); for (const x of results) for (const m of x[k].major) c.set(m.category, (c.get(m.category) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1]).map(([k2, n]) => `${k2} ${n}`).join(', ') || '-' }
  const crit = (k: keyof JudgeCandidate, w: 's' | 'o') => mean(results.map(x => x[w][k] as number)).toFixed(2)
  const chk = (w: 'cs' | 'co') => { const cs = results.flatMap(x => x[w]); return `kept ${mean(cs.map(c => c.kept)).toFixed(2)}, missing refs ${cs.reduce((a, c) => a + c.missingRefs.length, 0)}, unknown Pāḷi ${cs.reduce((a, c) => a + c.unknownPali.length, 0)}, issues ${cs.reduce((a, c) => a + c.issues.length, 0)}` }
  const strata = new Map<string, number[][]>()
  for (const x of results) { const k = (x.job as AiJob & { stratum?: string }).stratum ?? '?'; (strata.get(k) ?? strata.set(k, []).get(k)!).push([score(x.s), score(x.o)]) }
  const lines = [
    `# Pilot round ${round} — Sonnet (style ${STYLE_HASH}) vs Opus (round 0), judged blind by Opus`,
    `${new Date().toISOString()} · ${results.length} headwords`,
    '',
    `**Gate: ${pass ? 'PASS — Sonnet can do the run' : 'FAIL'}** (Sonnet mean ≥ Opus − 0.25 and major-error rate ≤ Opus + 3 points)`,
    '',
    '| | Sonnet | Opus |', '|---|---|---|',
    `| mean score (1-5) | ${sm.toFixed(2)} | ${om.toFixed(2)} |`,
    `| entries with major errors | ${(smaj * 100).toFixed(0)}% | ${(omaj * 100).toFixed(0)}% |`,
    ...(['accuracy', 'completeness', 'fidelity', 'pali_refs', 'formatting'] as const).map(k => `| ${k} | ${crit(k, 's')} | ${crit(k, 'o')} |`),
    `| judged better | ${results.filter(x => x.better === 'sonnet').length} | ${results.filter(x => x.better === 'opus').length} (equal ${results.filter(x => x.better === 'equal').length}) |`,
    `| major errors by category | ${cats('s')} | ${cats('o')} |`,
    `| automatic checks | ${chk('cs')} | ${chk('co')} |`,
    '', '## By stratum', '| stratum | n | Sonnet | Opus |', '|---|---|---|---|',
    ...[...strata].map(([k, v]) => `| ${k} | ${v.length} | ${mean(v.map(x => x[0])).toFixed(2)} | ${mean(v.map(x => x[1])).toFixed(2)} |`),
    '', '## Sonnet\'s major errors (for the next prompt)',
    ...results.filter(x => x.s.major.length).flatMap(x => [`- **${x.job.id}** (${score(x.s).toFixed(1)} vs ${score(x.o).toFixed(1)}): ${x.s.major.map(m => `[${m.category}] ${m.what}`).join('; ')}`]),
    '', '## Entries', ...results.flatMap(x => [`### ${x.job.id} — Sonnet ${score(x.s).toFixed(1)} · Opus ${score(x.o).toFixed(1)} · better: ${x.better}`,
      `Sonnet: ${x.s.comment}`, '', `Opus: ${x.o.comment}`, '', `<details><summary>texts</summary>\n\nEnglish: ${x.job.en.map(e => e.html).join(' ‖ ')}\n\nBB: ${x.job.th.map(t => t.html).join(' ‖ ')}\n\nSonnet: ${x.sh}\n\nOpus: ${x.oh}\n</details>`, '']),
  ]
  const f = path.join(OUT, `pilot-r${round}.md`)
  fs.writeFileSync(f, lines.join('\n'))
  console.log(`${path.relative(repo, f)}: Sonnet ${sm.toFixed(2)} (${(smaj * 100).toFixed(0)}% major) vs Opus ${om.toFixed(2)} (${(omaj * 100).toFixed(0)}% major): ${pass ? 'PASS' : 'FAIL'}`)
}

// ---------------- run ----------------
async function run() {
  const model = arg('--model', 'sonnet')!
  const store = readAiStore(ctx.dataDir)
  const only = arg('--only')?.split(',')
  let todo = jobs.filter(j => (only ? only.includes(j.id) : store.get(j.id)?.src !== j.src))
  if (arg('--limit')) todo = todo.slice(0, +arg('--limit')!)
  const us = units(todo)
  console.log(`run: ${todo.length} of ${jobs.length} headwords (${us.length} units, ${batches(us, batchSize(model)).length} calls) with ${model}, style ${STYLE_HASH}`)
  const report: string[] = []
  let done = 0, retried = 0, failing = 0
  // in slices, so the store is saved as the run goes
  const SLICE = 400
  try {
    await runSlices()
  } catch (e) {
    if (!(e instanceof LimitReached)) throw e
    writeAiStore(ctx.dataDir, store)
    console.log(`session limit reached (${e.message}): stopped, ${store.size} headwords stored; run again to go on`)
    process.exit(0)
  }
  async function runSlices() {
  for (let i = 0; i < todo.length; i += SLICE) {
    const slice = todo.slice(i, i + SLICE)
    const su = us.filter(u => slice.includes(u.job))
    const got = await translate(model, su)
    if (DRY) return
    const retry: AiJob[] = []
    for (const job of slice) {
      const a = assemble(job, su, got)
      if (!a) { retry.push(job); continue }
      const cs = checkJob(job, a.entries)
      if (model !== 'opus' && cs.some(c => failed(c, job))) { retry.push(job); continue }
      store.set(job.id, { id: job.id, src: job.src, model, style: STYLE_HASH, entries: a.entries, others: a.others, notes: a.notes })
      done++
    }
    // what failed (or got no answer): Opus, once
    if (retry.length) {
      retried += retry.length
      const ru = units(retry)
      const got2 = await translate('opus', ru)
      for (const job of retry) {
        const a = assemble(job, ru, got2)
        if (!a) { report.push(`- ${job.id}: no answer`); failing++; continue }
        const cs = checkJob(job, a.entries)
        if (cs.some(c => failed(c, job))) { failing++; report.push(`- ${job.id}: ${cs.map(c => [...c.issues, c.missingRefs.length ? `refs missing ${c.missingRefs.join(', ')}` : '', c.kept < 0.6 ? `kept ${c.kept.toFixed(2)}` : ''].filter(Boolean).join('; ')).join(' | ')}`) }
        store.set(job.id, { id: job.id, src: job.src, model: 'opus', style: STYLE_HASH, entries: a.entries, others: a.others, notes: a.notes })
        done++
      }
    }
    writeAiStore(ctx.dataDir, store)
    console.log(`  ${Math.min(i + SLICE, todo.length)}/${todo.length} headwords, store ${store.size}`)
  }
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'run-report.md'), [`# Run ${new Date().toISOString()} (${model}, style ${STYLE_HASH})`, '',
    `${done} headwords stored, ${retried} asked again of Opus, ${failing} still failing the checks (stored, listed below)`, '', ...report].join('\n') + '\n')
  console.log(`stored ${done}, retried ${retried}, failing ${failing}`)
}

// ---------------- spot check ----------------
async function spot() {
  const store = readAiStore(ctx.dataDir)
  const r = rng(+arg('--seed', '3')!)
  let done = jobs.filter(j => store.get(j.id)?.src === j.src)
  // --kept: only the results that keep less than 60% of BB's text (were they right to rewrite it?)
  if (flag('--kept')) done = done.filter(j => j.th.length && j.en.length <= 1 && checkJob(j, store.get(j.id)!.entries).some(c => c.kept < 0.6))
  const sample = done.map(j => [r(), j] as const).sort((a, b) => a[0] - b[0]).slice(0, +arg('--n', '100')!).map(x => x[1])
  const rows: string[] = []
  const scores: number[] = []
  await pool(sample, JOBS, async job => {
    const res = store.get(job.id)!
    const a = await judge.ask<JudgeAnswer>('th-judge-1', judgePrompt(job, [{ label: 'X', entries: res.entries, others: res.others }]), JUDGE_SCHEMA)
    const c = a?.candidates[0]
    if (!c) return
    scores.push(score(c))
    rows.push(`- **${job.id}** ${score(c).toFixed(1)} (${res.model})${c.major.length ? `: ${c.major.map(m => `[${m.category}] ${m.what}`).join('; ')}` : ''}`)
  })
  if (DRY) return
  const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, flag('--kept') ? 'spot-kept.md' : 'spot.md'), [`# Spot check${flag('--kept') ? ' (results keeping < 60% of BB)' : ''} ${new Date().toISOString()}: ${scores.length} headwords, mean ${mean.toFixed(2)}`, '', ...rows.sort()].join('\n') + '\n')
  console.log(`spot check: ${scores.length}, mean ${mean.toFixed(2)}`)
}

// ---------------- check ----------------
/** the automatic checks over every stored result (no calls) -> db/dict-ai/check-report.md */
function check() {
  const store = readAiStore(ctx.dataDir)
  const rows: string[] = []
  let n = 0, fails = 0
  const counts = { issues: 0, refs: 0, kept: 0 }
  for (const job of jobs) {
    const r = store.get(job.id)
    if (!r || r.src !== job.src) continue
    n++
    const cs = checkJob(job, r.entries)
    if (!cs.some(c => failed(c, job))) continue
    fails++
    for (const c of cs) { if (c.issues.length) counts.issues++; if (c.missingRefs.length > 2) counts.refs++; if (job.th.length && job.en.length <= 1 && c.kept < 0.6) counts.kept++ }
    rows.push(`- **${job.id}** (${r.model}): ${cs.map(c => [...c.issues, c.missingRefs.length > 2 ? `refs missing: ${c.missingRefs.join(', ')}` : '',
      job.th.length && job.en.length <= 1 && c.kept < 0.6 ? `BB kept ${c.kept.toFixed(2)}` : ''].filter(Boolean).join('; ')).filter(Boolean).join(' | ')}`)
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'check-report.md'), [`# Checks of the stored results ${new Date().toISOString()}`, '',
    `${n} headwords checked, ${fails} fail a check (${counts.issues} with garbling / Latin letters, ${counts.refs} with more than 2 English references missing, ${counts.kept} keeping less than 60% of BB's text)`, '', ...rows.sort()].join('\n') + '\n')
  console.log(`checked ${n}, failing ${fails}: ${JSON.stringify(counts)} -> db/dict-ai/check-report.md`)
}

// ---------------- fix ----------------
/** what the checks find wrong in a result (Latin words are etymologies and titles: not counted) */
function checkFindings(job: AiJob, entries: { hom: number; html: string }[]): string[] {
  return checkJob(job, entries).flatMap((c, i) => {
    const at = entries.length > 1 ? ` (homonym ${entries[i].hom})` : ''
    return [
      ...c.issues.filter(x => !x.startsWith('latin')).map(x => `automatic check${at}: ${x}`),
      ...(c.missingRefs.length > 2 ? [`automatic check${at}: English references not found in the Thai: ${c.missingRefs.join(', ')}`] : []),
      ...(job.th.length && job.en.length <= 1 && c.kept < 0.6 ? [`automatic check: the revision keeps only ${Math.round(c.kept * 100)}% of BB's words. Where BB was right (wording, terms, order) its text should stay; rewrite only what is wrong or garbled, add only what is missing`] : []),
    ]
  })
}

/** the major errors of the spot checks: db/dict-ai/spot*.md lines "- **id** 4.2 (opus): [cat] what; [cat] what" */
function spotFindings(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const f of ['spot.md', 'spot-kept.md']) {
    const file = path.join(OUT, f)
    if (!fs.existsSync(file)) continue
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/^- \*\*(.+?)\*\* [\d.]+ \(\w+\): (.+)$/gm)) {
      const items = m[2].split(/; (?=\[[a-z-]+\] )/).filter(x => !x.includes('[0]')) // [0] was the review's own label
      if (items.length) out.set(m[1], [...(out.get(m[1]) ?? []), ...items.map(x => `reviewer: ${x}`)])
    }
  }
  return out
}

function fixPrompt(job: AiJob, cur: AiResult, findings: string[]): string {
  const lines = [`=== ${job.id}`]
  if (job.en.length) { lines.push('ENGLISH (PTS 2025), homonyms in order:'); for (const e of job.en) lines.push(`[${e.hom}] ${e.html}`) }
  else lines.push('ENGLISH: none (BB only: correct it, add nothing; answer with hom 0)')
  lines.push('BB (current Thai):')
  if (!job.th.length) lines.push('none (translate)')
  job.th.forEach((t, i) => lines.push(`(${String.fromCharCode(97 + i)}) ${t.html}`))
  lines.push('YOUR EARLIER REVISION:', ...cur.entries.map(e => `[${e.hom}] ${e.html}`))
  if (cur.others?.length) lines.push('its others:', ...cur.others.map(o => `${o.word}: ${o.html}`))
  lines.push('FINDINGS (from automatic checks and a reviewer; a finding can be wrong: verify each against the English, BB and your instructions):', ...findings.map(f => `- ${f}`))
  return `Improve your earlier revision of this headword. Correct what the findings rightly point out and any other error you see; keep what is right (do not rewrite for its own sake); repeat its others (corrected) when it has some. Answer with one item, one entry per English homonym ([n] -> hom n), following all your instructions.\n\n${lines.join('\n')}`
}

async function fixRun() {
  // --base <dir>: the results before the run (<dir>/dict-ai/th-bhumibol.jsonl); with --dry the cached decisions are printed
  const store = readAiStore(arg('--base') ?? ctx.dataDir)
  const spotted = spotFindings()
  const only = arg('--only')?.split(',')
  const targets: { job: AiJob; findings: string[] }[] = []
  for (const job of jobs) {
    const cur = store.get(job.id)
    if (!cur || cur.src !== job.src || (only && !only.includes(job.id))) continue
    const findings = [...checkFindings(job, cur.entries), ...(spotted.get(job.id) ?? [])]
    if (findings.length) targets.push({ job, findings })
  }
  const todo = arg('--limit') ? targets.slice(0, +arg('--limit')!) : targets
  console.log(`fix: ${todo.length} headwords (${targets.filter(t => spotted.has(t.job.id)).length} from the spot checks), style ${STYLE_HASH}`)
  const claude = translator('opus')
  const rows: string[] = []
  let kept = 0, replaced = 0, failedAnswers = 0, n = 0
  const sOld: number[] = [], sNew: number[] = []
  try {
    await pool(todo, JOBS, async ({ job, findings }) => {
      const cur = store.get(job.id)!
      const a = await claude.ask<TranslateAnswer>(`th-fix-${STYLE_HASH}`, fixPrompt(job, cur, findings), TRANSLATE_SCHEMA)
      if (DRY && !a) return
      const it = a?.items.find(x => x.id === job.id) ?? a?.items[0]
      const want = job.en.length || 1
      if (!it || it.entries.length !== want || it.entries.some(e => !e.html.trim())) { failedAnswers++; rows.push(`- **${job.id}**: no usable answer`); return }
      const next: AiResult = {
        id: job.id, src: job.src, model: 'opus', style: STYLE_HASH,
        entries: it.entries.map((e, i) => ({ hom: job.en[i]?.hom ?? 0, html: cleanAiHtml(e.html) })),
        others: (it.others ?? []).filter(o => o.word.trim() && o.html.trim()).map(o => ({ word: o.word.trim().toLowerCase(), html: cleanAiHtml(o.html) })),
        notes: [...cur.notes, ...it.notes.map(x => `fix: ${x}`)],
      }
      // blind A/B review: the order of the two depends on the headword
      const flip = crypto.createHash('sha1').update(job.id).digest()[0] & 1
      const [A, B] = flip ? [next, cur] : [cur, next]
      const j = await judge.ask<JudgeAnswer>('th-judge-ab', judgePrompt(job, [{ label: 'A', entries: A.entries, others: A.others }, { label: 'B', entries: B.entries, others: B.others }]), JUDGE_SCHEMA)
      const cs = j?.candidates
      if (!cs || cs.length < 2) { failedAnswers++; rows.push(`- **${job.id}**: no review`); return }
      const so = score(cs[flip ? 1 : 0]), sn = score(cs[flip ? 0 : 1])
      const better = j!.better.trim().toUpperCase()
      const newLabel = flip ? 'A' : 'B'
      const newIssues = checkJob(job, next.entries).some(c => c.issues.some(x => !x.startsWith('latin')))
      const take = !newIssues && (better === newLabel || (better !== (flip ? 'B' : 'A') && sn >= so))
      if (DRY) { console.log(`${job.id}\tflip ${flip}\tbetter ${better}\told ${so}\tnew ${sn}\t${take ? 'replace' : 'keep'}`); return }
      sOld.push(so); sNew.push(take ? sn : so)
      if (take) { store.set(job.id, next); replaced++ } else kept++
      const major = cs[flip ? 0 : 1].major
      rows.push(`- **${job.id}** ${so.toFixed(1)} → ${sn.toFixed(1)} ${take ? 'replaced' : 'kept'}${major.length ? ` (new: ${major.map(m => `[${m.category}] ${m.what}`).join('; ')})` : ''}`)
      if (++n % 25 === 0) { writeAiStore(ctx.dataDir, store); console.log(`  ${n}/${todo.length}: replaced ${replaced}, kept ${kept}`) }
    })
  } catch (e) {
    if (!(e instanceof LimitReached)) throw e
    writeAiStore(ctx.dataDir, store)
    console.log(`session limit reached (${e.message}): stopped after ${n}; run again to go on (the answers are cached)`)
    process.exit(0)
  }
  if (DRY) return
  writeAiStore(ctx.dataDir, store)
  const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(2)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'fix-report.md'), [`# Fix run ${new Date().toISOString()} (opus, style ${STYLE_HASH})`, '',
    `${todo.length} headwords: ${replaced} replaced by the revision, ${kept} kept, ${failedAnswers} without an answer; review score ${mean(sOld)} → ${mean(sNew)}`, '', ...rows.sort()].join('\n') + '\n')
  console.log(`replaced ${replaced}, kept ${kept}, no answer ${failedAnswers}; score ${mean(sOld)} -> ${mean(sNew)} -> db/dict-ai/fix-report.md`)
}

// ---------------- Gemini comparison ----------------
async function compare() {
  const store = readAiStore(ctx.dataDir)
  // the stored first-pass Opus results (the fix pass had a second look) of the pilot's stratified sample
  const sample = pilotSample(60, +arg('--seed', '1')!)
    .filter(j => { const r = store.get(j.id); return r?.src === j.src && !r.notes.some(x => x.startsWith('fix:')) })
    .slice(0, +arg('--n', '30')!)
  const model = arg('--gemini', 'gemini-4-argon')!
  const gem = new Gemini({ system: STYLE, cacheDir: CACHE, model, price: [2, 10] })
  const gemJudge = new Gemini({ system: JUDGE_SYSTEM, cacheDir: CACHE, model, price: [2, 10] })
  const us = units(sample)
  console.log(`compare: ${sample.length} headwords (${us.length} units), ${model} vs the stored Opus results, style ${STYLE_HASH}`)
  const t0 = Date.now()
  const got = await translate('gemini', us, gem)
  const tTranslate = (Date.now() - t0) / 1000
  if (DRY) return
  type Side = { score: number; major: { category: string; what: string }[] }
  const results: { job: AiJob; byJudge: Record<string, { g: Side; o: Side; better: string }>; cg: ThaiCheck[]; co: ThaiCheck[] }[] = []
  const noAnswer: string[] = []
  await pool(sample, JOBS, async job => {
    const g = assemble(job, us, got), o = store.get(job.id)!
    if (!g) { noAnswer.push(job.id); return }
    const gFirst = crypto.createHash('sha1').update(job.id).digest()[0] & 1
    const gc = { label: gFirst ? 'A' : 'B', entries: g.entries, others: g.others }, oc = { label: gFirst ? 'B' : 'A', entries: o.entries, others: o.others }
    const prompt = judgePrompt(job, gFirst ? [gc, oc] : [oc, gc])
    const [ja, jg] = await Promise.all([judge.ask<JudgeAnswer>('th-judge-cmp', prompt, JUDGE_SCHEMA), gemJudge.ask<JudgeAnswer>('th-judge-cmp', prompt, JUDGE_SCHEMA)])
    const byJudge: Record<string, { g: Side; o: Side; better: string }> = {}
    for (const [name, a] of [['opus', ja], ['gemini', jg]] as const) {
      const c = (l: string) => a?.candidates.find(x => x.label === l)
      const cg = c(gc.label), co = c(oc.label)
      if (!cg || !co) continue
      const b = a!.better.trim().toUpperCase()
      byJudge[name] = { g: { score: score(cg), major: cg.major }, o: { score: score(co), major: co.major }, better: b === gc.label ? 'gemini' : b === oc.label ? 'opus' : 'equal' }
    }
    results.push({ job, byJudge, cg: checkJob(job, g.entries), co: checkJob(job, o.entries) })
  })
  const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(2)
  const lines = [`# Gemini comparison ${new Date().toISOString()}`, '',
    `${results.length} headwords of the pilot sample (stratified, seed ${arg('--seed', '1')}): ${model} (same system prompt and schema, style ${STYLE_HASH}) against the stored Opus results; each pair judged blind by Opus and by ${model} (order by headword).`,
    noAnswer.length ? `No Gemini answer: ${noAnswer.join(', ')}` : '', '',
    '| judge | n | Gemini mean | Opus mean | Gemini better | Opus better | equal | Gemini major errors | Opus major errors |', '|---|---|---|---|---|---|---|---|---|']
  for (const name of ['opus', 'gemini']) {
    const rs = results.map(r => r.byJudge[name]).filter(Boolean)
    lines.push(`| ${name} | ${rs.length} | ${mean(rs.map(r => r.g.score))} | ${mean(rs.map(r => r.o.score))} | ${rs.filter(r => r.better === 'gemini').length} | ${rs.filter(r => r.better === 'opus').length} | ${rs.filter(r => r.better === 'equal').length} | ${rs.filter(r => r.g.major.length).length} | ${rs.filter(r => r.o.major.length).length} |`)
  }
  const fails = (cs: (r: typeof results[number]) => ThaiCheck[]) => results.filter(r => cs(r).some(c => failed(c, r.job))).length
  lines.push('', `Automatic checks failing: Gemini ${fails(r => r.cg)}, Opus ${fails(r => r.co)} of ${results.length}.`)
  lines.push(`Gemini translation: ${tTranslate.toFixed(0)}s wall time. ${gem.usageLine()}`, `Gemini as judge: ${gemJudge.usageLine()}`, '')
  const cats = (side: 'g' | 'o') => {
    const n = new Map<string, number>()
    for (const r of results) for (const j of Object.values(r.byJudge)) for (const m of j[side].major) n.set(m.category, (n.get(m.category) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}`).join(', ') || 'none'
  }
  lines.push(`Major error categories (both judges): Gemini: ${cats('g')}; Opus: ${cats('o')}`, '', '## Headwords', '')
  for (const r of results.sort((a, b) => a.job.id.localeCompare(b.job.id))) {
    lines.push(`- **${r.job.id}** (${(r.job as AiJob & { stratum?: string }).stratum ?? ''}): ` + Object.entries(r.byJudge).map(([n, j]) =>
      `${n} judge: Gemini ${j.g.score.toFixed(1)} / Opus ${j.o.score.toFixed(1)}, ${j.better} better`).join('; '))
    for (const [n, j] of Object.entries(r.byJudge)) for (const side of ['g', 'o'] as const) for (const m of j[side].major)
      lines.push(`  - ${n} on ${side === 'g' ? 'Gemini' : 'Opus'}: [${m.category}] ${m.what}`)
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'gemini-compare.md'), lines.join('\n') + '\n')
  console.log(lines.slice(4, 10).join('\n'))
}

// ---------------- stats ----------------
function stats() {
  const us = units(jobs), bs = batches(us)
  const store = readAiStore(ctx.dataDir)
  const chars = us.reduce((s, u) => s + u.size, 0)
  console.log(`headwords ${jobs.length}: paired ${jobs.filter(j => j.en.length && j.th.length).length}, new ${jobs.filter(j => !j.th.length).length}, BB only ${jobs.filter(j => !j.en.length).length}`)
  console.log(`units ${us.length} (parts of long entries ${us.filter(u => u.en.some(e => e.part)).length}), calls ${bs.length}, input text ${(chars / 1e6).toFixed(1)}M characters`)
  console.log(`stored ${store.size}, current ${jobs.filter(j => store.get(j.id)?.src === j.src).length}, style ${STYLE_HASH}`)
  // --prune: drop the results of headwords that are no longer jobs (a headword renamed in the sources)
  if (flag('--prune')) {
    const ids = new Set(jobs.map(j => j.id))
    const gone = [...store.keys()].filter(id => !ids.has(id))
    for (const id of gone) store.delete(id)
    writeAiStore(ctx.dataDir, store)
    console.log(`pruned ${gone.length}: ${gone.join(', ')}`)
  }
}

const t0 = Date.now()
if (cmd === 'jobs') stats()
else if (cmd === 'pilot') await pilot()
else if (cmd === 'run') await run()
else if (cmd === 'spot') await spot()
else if (cmd === 'check') check()
else if (cmd === 'fix') await fixRun()
else if (cmd === 'compare') await compare()
else { console.log('npm run dict:ai -- jobs | pilot | run | spot (see scripts/dict-ai.ts)'); process.exit(1) }
if (!DRY && cmd !== 'jobs') console.log(`${((Date.now() - t0) / 60000).toFixed(1)} min`)
