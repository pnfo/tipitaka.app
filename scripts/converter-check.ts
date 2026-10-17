/**
 * Checks the Pāḷi script converter (@pnfo/pali-converter) against VRI's own transliterations: the tipitaka-xml
 * repository has every text in 14 scripts besides Roman. For each text, the Roman words are converted and compared
 * with VRI's words at the same place (paragraphs with as many words on both sides); the differences are grouped by
 * the smallest differing part.
 *
 *   npx tsx scripts/converter-check.ts <dir with <script>-<file>.xml> [files...]   (Roman from .cache/tipitaka-xml/romn)
 * VRI's choices are not always the only right ones (conventions differ): the report is for review.
 */
import fs from 'node:fs'
import path from 'node:path'
import { convert } from '@pnfo/pali-converter'

const [dir, ...files] = process.argv.slice(2)
const SCRIPTS = ['mymr', 'sinh', 'deva', 'thai', 'khmr', 'beng', 'cyrl', 'gujr', 'guru', 'knda', 'mlym', 'taml', 'telu', 'tibt']

/** the words of the paragraphs of a VRI xml file (notes and page markers left out) */
function paragraphs(file: string): string[][] {
  const buf = fs.readFileSync(file)
  const xml = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8')
  return [...xml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]
    .replace(/<note>[\s\S]*?<\/note>/g, ' ').replace(/<pb\b[^>]*\/>/g, ' ').replace(/<hi rend="paranum">[\s\S]*?<\/hi>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
    .split(/\s+/).map(w => w.replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '')).filter(w => /\p{L}/u.test(w)))
}

const romn = (f: string) => path.join('.cache/tipitaka-xml/romn', f)
for (const sc of SCRIPTS) {
  let words = 0, wrong = 0, skipped = 0
  const diffs = new Map<string, { n: number; ex: string }>()
  for (const f of files) {
    const vf = path.join(dir, `${sc}-${f}`)
    if (!fs.existsSync(vf)) continue
    const r = paragraphs(romn(f)), v = paragraphs(vf)
    if (r.length !== v.length) { console.warn(`${sc} ${f}: ${r.length} vs ${v.length} paragraphs`); continue }
    r.forEach((rp, i) => {
      const vp = v[i]
      if (rp.length !== vp.length) { skipped += rp.length; return }
      rp.forEach((w, j) => {
        words++
        const ours = convert(w.toLowerCase(), sc, 'latn'), theirs = vp[j]
        if (ours === theirs) return
        wrong++
        let a = 0
        while (a < ours.length && a < theirs.length && ours[a] === theirs[a]) a++
        let b = 0
        while (b < ours.length - a && b < theirs.length - a && ours.at(-1 - b) === theirs.at(-1 - b)) b++
        const k = `${ours.slice(a, ours.length - b)} → ${theirs.slice(a, theirs.length - b)}`
        const d = diffs.get(k) ?? { n: 0, ex: `${w}: ${ours} / ${theirs}` }
        d.n++
        diffs.set(k, d)
      })
    })
  }
  const top = [...diffs].sort((x, y) => y[1].n - x[1].n).slice(0, 12)
  console.log(`\n== ${sc}: ${words} words compared (${skipped} in paragraphs that differ), ${wrong} different (${((100 * wrong) / Math.max(1, words)).toFixed(2)}%)`)
  for (const [k, d] of top) console.log(`  ${d.n}× ours→VRI ${JSON.stringify(k)}   e.g. ${d.ex}`)
}
