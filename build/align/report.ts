/** Alignment coverage: build report section and data/align-coverage.tsv (committed, diffed by the sync PR). */
import fs from 'node:fs'
import type { Corpus } from '../tree'
import type { BookStats } from './index'

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : '-')
const matched = (s: BookStats) => s.exact + s.trim + s.reorder + s.ai

export function coverageRows(c: Corpus, stats: BookStats[]): string[] {
  return stats.map(s => [c.books[s.book].def.id, s.lemmas, matched(s), s.exact, s.trim, s.reorder, s.ai, s.suppressed, s.chained].join('\t'))
}

/** compares with the previous coverage file, rewrites it and returns warnings for books that lost coverage */
export function updateCoverage(file: string, c: Corpus, stats: BookStats[], warnings: string[]) {
  const prev = new Map<string, number>()
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      const [id, lemmas, m] = l.split('\t')
      if (id && !id.startsWith('#') && +lemmas) prev.set(id, +m / +lemmas)
    }
  }
  for (const s of stats) {
    const id = c.books[s.book].def.id
    const before = prev.get(id)
    if (before !== undefined && s.lemmas && matched(s) / s.lemmas < before - 0.02) {
      warnings.push(`alignment coverage of ${id} dropped from ${(before * 100).toFixed(1)}% to ${pct(matched(s), s.lemmas)}%`)
    }
  }
  fs.writeFileSync(file, ['# book, lemmas, matched, exact, trim, reorder, ai/manual, not quotations, chained to mūla - written by npm run build:data', ...coverageRows(c, stats)].join('\n') + '\n')
}

export function reportSection(c: Corpus, stats: BookStats[], glossCount: number): string[] {
  const by = (coll: string) => stats.filter(s => c.books[s.book].def.coll === coll)
  const sum = (ss: BookStats[], f: (s: BookStats) => number) => ss.reduce((a, s) => a + f(s), 0)
  const line = (name: string, ss: BookStats[]) => {
    const l = sum(ss, s => s.lemmas), m = sum(ss, matched)
    return `| ${name} | ${l} | ${m} | ${pct(m, l)}% | ${sum(ss, s => s.exact)} | ${sum(ss, s => s.trim)} | ${sum(ss, s => s.reorder)} | ${sum(ss, s => s.ai)} | ${sum(ss, s => s.suppressed)} | ${sum(ss, s => s.chained)} |`
  }
  const head = ['| | lemmas | matched | % | exact | trim | reorder | ai / manual | not quotations | ṭīkā→mūla |', '|---|---|---|---|---|---|---|---|---|---|']
  return [
    `## Alignment`, `${glossCount} glosses (see dev-docs/alignments.md)`, '',
    ...head, line('aṭṭhakathā', by('atta')), line('ṭīkā', by('tika')), line('añña (Visuddhimagga-mahāṭīkā …)', by('anya')), '',
    '<details><summary>per book</summary>', '', ...head,
    ...stats.map(s => line(c.books[s.book].def.id, [s])), '', '</details>', '',
  ]
}
