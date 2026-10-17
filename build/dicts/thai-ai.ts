/**
 * The AI revision of BB (th-bhumibol) against the PTS 2025 (scripts/dict-ai.ts, dev-docs/dictionaries.md):
 * one job per headword (all English homonyms + all BB entries of it, or a BB entry the English lacks),
 * the results in data/dict-ai/th-bhumibol.jsonl, applied by the build when the sources of a job are unchanged.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { stripTags } from './markup'
import type { English, ThaiPair } from './thai-pts'

export const thaiKey = (word: string) => word.replace(/[-\s\d]+$/, '')

/** an entry for the prompt: the text markup only (no links, abbreviations, classes) */
export function promptForm(html: string): string {
  return html
    .replace(/<\/?(?:a|abbr)\b[^>]*>/g, '')
    .replace(/<span class="(?:sc|lnum|gram|dict-head)">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<\/?p>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface AiJob {
  /** the headword (BB-only: the BB headword) */
  id: string
  /** English homonyms, prompt form */
  en: { hom: number; html: string }[]
  /** BB entries of the headword: repaired html (prompt form) and the raw v2 html */
  th: { word: string; html: string; raw: string }[]
  /** hash of the sources (English prompt form, raw BB): a change makes the result stale */
  src: string
}

export function aiJobs(english: English, pairs: ThaiPair[]): AiJob[] {
  const thByKey = new Map<string, ThaiPair[]>()
  for (const p of pairs) (thByKey.get(thaiKey(p.word)) ?? thByKey.set(thaiKey(p.word), []).get(thaiKey(p.word))!).push(p)
  const jobs: AiJob[] = []
  const done = new Set<string>()
  for (const r of english.rows) {
    if (done.has(r.word)) continue
    done.add(r.word)
    const en = english.rows.filter(x => x.word === r.word).map((x, i) => ({ hom: x.hom || i + 1, html: promptForm(x.meaning) }))
    const th = (thByKey.get(r.word) ?? []).map(p => ({ word: p.word, html: promptForm(p.html), raw: p.raw }))
    jobs.push(job(r.word, en, th))
  }
  for (const [k, ps] of thByKey) if (!done.has(k)) jobs.push(job(k, [], ps.map(p => ({ word: p.word, html: promptForm(p.html), raw: p.raw }))))
  return jobs
}

function job(id: string, en: AiJob['en'], th: AiJob['th']): AiJob {
  const src = crypto.createHash('sha1').update(JSON.stringify([en.map(e => e.html), th.map(t => t.raw)])).digest('hex').slice(0, 16)
  return { id, en, th, src }
}

/** a unit of work: a job, or a homonym of a job, or a part of a long homonym */
export interface Unit { id: string; job: AiJob; en: { hom: number; html: string; part?: [number, number] }[]; size: number }
export const PART = 9000, LONG = 12000, BATCH = 3500

/** a long English entry in parts, cut before its compounds (<br> -<b>…) */
export function splitEnglish(html: string, max = PART): string[] {
  const cuts = [0]
  for (const m of html.matchAll(/<br>\s*[-–]\s*<b>/g)) cuts.push(m.index!)
  const parts: string[] = []
  let start = 0
  for (let i = 1; i <= cuts.length; i++) {
    const end = i < cuts.length ? cuts[i] : html.length
    if (end - start > max && i > 1 && cuts[i - 1] > start) { parts.push(html.slice(start, cuts[i - 1])); start = cuts[i - 1] }
  }
  parts.push(html.slice(start))
  return parts
}

export function units(js: AiJob[]): Unit[] {
  const out: Unit[] = []
  for (const j of js) {
    const thSize = j.th.reduce((s, t) => s + aiText(t.html).length, 0)
    const enSize = j.en.reduce((s, e) => s + aiText(e.html).length, 0)
    if (!j.en.some(e => aiText(e.html).length > LONG)) { out.push({ id: j.id, job: j, en: j.en, size: enSize + thSize }); continue }
    for (const e of j.en) {
      const parts = aiText(e.html).length > LONG ? splitEnglish(e.html) : [e.html]
      parts.forEach((p, k) => out.push({ id: `${j.id}#${e.hom}.${k + 1}`, job: j, en: [{ hom: e.hom, html: p, part: parts.length > 1 ? [k + 1, parts.length] : undefined }], size: aiText(p).length + thSize }))
    }
  }
  return out
}

export function batches(us: Unit[], max = BATCH): Unit[][] {
  const out: Unit[][] = []
  let cur: Unit[] = [], size = 0
  for (const u of us) {
    if (u.size > max) { out.push([u]); continue }
    if (cur.length && (size + u.size > max || cur.length >= 8)) { out.push(cur); cur = []; size = 0 }
    cur.push(u)
    size += u.size
  }
  if (cur.length) out.push(cur)
  return out
}

/** a stored result: the Thai entries of a job (one per English homonym, or one for a BB-only job) */
export interface AiResult {
  id: string; src: string; model: string; style: string
  entries: { hom: number; html: string }[]
  /** BB entries of other words filed under this headword (corrected only) */
  others?: { word: string; html: string }[]
  notes: string[]
}

export const AI_STORE = (dataDir: string) => path.join(dataDir, 'dict-ai', 'th-bhumibol.jsonl')

export function readAiStore(dataDir: string): Map<string, AiResult> {
  const f = AI_STORE(dataDir)
  const out = new Map<string, AiResult>()
  if (!fs.existsSync(f)) return out
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) if (line.trim()) { const r = JSON.parse(line) as AiResult; out.set(r.id, r) }
  return out
}

export function writeAiStore(dataDir: string, results: Map<string, AiResult>) {
  const f = AI_STORE(dataDir)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  // written aside and renamed: a run stopped while writing leaves the old file whole
  fs.writeFileSync(f + '.tmp', [...results.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(r => JSON.stringify(r)).join('\n') + '\n')
  fs.renameSync(f + '.tmp', f)
}

const ALLOWED = /^<\/?(?:b|i|br|sup)>$|^<span class="ai-add">$|^<\/span>$|^<br\s*\/?>$/

/** the markup of an AI answer: only the allowed tags (others are dropped, their text kept), properly nested */
export function cleanAiHtml(html: string): string {
  const kept = html.replace(/<[^>]*>/g, t => (ALLOWED.test(t) ? t.replace(/<br\s*\/?>/, '<br>') : '')).replace(/&(?!amp;|lt;|gt;)/g, '&amp;')
  const open: string[] = []
  const out = kept.replace(/<(\/?)(b|i|sup|span)\b[^>]*>/g, (tag, close: string, name: string) => {
    if (!close) { open.push(name); return tag }
    const at = open.lastIndexOf(name)
    if (at < 0) return '' // closes nothing
    const inner = open.splice(at).reverse()
    return inner.map(t => `</${t}>`).join('') // the inner ones close first
  })
  return out + open.reverse().map(t => `</${t}>`).join('')
}

/** the plain text of an entry */
export const aiText = (html: string) => stripTags(html).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
