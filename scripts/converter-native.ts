/**
 * Checks the Pāḷi script converter against text written by native users of a script (not VRI's transliterations):
 * every word of the native text is converted back to Roman (that undoes the spelling conventions); when the Roman word
 * is a word of the CST texts but the converter writes it differently, the native spelling and ours are counted, by the
 * part that differs (weighted by how often the word occurs in the native text).
 *
 *   npx tsx scripts/converter-native.ts <script> <native text files...>   (CST Roman vocabulary from .cache/tipitaka-xml/romn)
 */
import fs from 'node:fs'
import path from 'node:path'
import { convert } from '@pnfo/pali-converter'

const [script, ...files] = process.argv.slice(2)
const RANGE: Record<string, RegExp> = {
  mymr: /[က-႟]+/g, thai: /[ก-๎]+/g, sinh: /[඀-෿‍]+/g, khmr: /[ក-៿]+/g, laoo: /[຀-໿]+/g,
}
const re = RANGE[script]
if (!re) throw new Error(`script ${script}: add its range`)

// the Roman vocabulary of the CST texts
const vocab = new Set<string>()
const romn = '.cache/tipitaka-xml/romn'
for (const f of fs.readdirSync(romn)) {
  const xml = fs.readFileSync(path.join(romn, f)).toString('utf16le')
  for (const w of xml.replace(/<[^>]+>/g, ' ').split(/[\s.,;:!?‘’“”'"()–\-\[\]…]+/)) if (/^[\p{L}\p{M}]+$/u.test(w)) vocab.add(w.toLowerCase())
}

const native = new Map<string, number>()
for (const f of files) {
  const buf = fs.readFileSync(f)
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8')
  for (const w of text.normalize('NFC').match(re) ?? []) native.set(w, (native.get(w) ?? 0) + 1)
}

let tokens = 0, pali = 0, same = 0, differ = 0
const diffs = new Map<string, { n: number; words: number; ex: string }>()
for (const [w, n] of native) {
  tokens += n
  const roman = convert(w, 'latn', script).toLowerCase()
  if (!vocab.has(roman)) continue // not a Pāḷi word of the texts (a Burmese / Thai word, or another spelling)
  pali += n
  const ours = convert(roman, script, 'latn').normalize('NFC')
  if (ours === w) { same += n; continue }
  differ += n
  let a = 0
  while (a < ours.length && a < w.length && ours[a] === w[a]) a++
  let b = 0
  while (b < ours.length - a && b < w.length - a && ours.at(-1 - b) === w.at(-1 - b)) b++
  const k = `${ours.slice(Math.max(0, a - 1), ours.length - b)} → ${w.slice(Math.max(0, a - 1), w.length - b)}`
  const d = diffs.get(k) ?? { n: 0, words: 0, ex: `${roman}: ours ${ours} / native ${w}` }
  d.n += n
  d.words++
  diffs.set(k, d)
}
console.log(`${script}: ${native.size} native words (${tokens} tokens); ${pali} tokens are CST Pāḷi words: ${same} spelt as ours, ${differ} not (${((100 * differ) / Math.max(1, pali)).toFixed(2)}%)`)
for (const [k, d] of [...diffs].sort((x, y) => y[1].n - x[1].n).slice(0, 25)) console.log(`  ${d.n}× (${d.words} words) ours→native ${JSON.stringify(k)}   e.g. ${d.ex}`)
