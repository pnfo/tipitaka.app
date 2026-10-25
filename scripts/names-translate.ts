/**
 * Translations of the descriptions of the names (data/names/entities.tsv: DPD meanings like "name of a town", the first
 * sentences of DPPN entries, the categories like "villages, towns and cities") for the interface languages, by Gemini
 * (scripts/lib/gemini.ts, GEMINI_API_KEY; as tipitaka.lk's Sinhala), keyed by the English text, so only new texts are sent:
 *
 *   npm run names:translate -- th [--limit 200] [--model gemini-4-argon] [--jobs 4]
 *   npm run names:translate -- th --sample 50 [--offset 7]   a spread of the texts, printed for review (nothing written)
 *
 * Writes data/names/i18n/<lang>/meanings.tsv and families.tsv (en, <lang>); rows are only added, so a row corrected by
 * hand stays. The build (build/names/translations.ts) shows them in that interface language, else the English.
 * Sinhala: tipitaka.lk's (dev/names-si, the same rules); this fills in texts that are new here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './lib/claude'
import { Gemini } from './lib/gemini'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const lang = args[0]
const arg = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const BATCH = 40

const STYLE: Record<string, string> = {
  th: `You translate short English descriptions of proper names in the Pāḷi Tipiṭaka into Thai for tipitaka.app, read by
Thai Buddhists.
Rules:
- Natural modern Thai as in Thai Buddhist writing (as in the Thai translations of the Tipiṭaka and its commentaries).
- Honorifics: the Buddha พระพุทธเจ้า (a previous Buddha: พระพุทธเจ้าพระนามว่า …), paccekabuddhas พระปัจเจกพุทธเจ้า, arahants
  พระอรหันต์, theras พระเถระ, therīs พระเถรี, monks พระภิกษุ, nuns พระภิกษุณี, with the respectful verbs (ประทับ, เสด็จ,
  ทรงแสดง, ปรินิพพาน for the Buddha; จำพรรษา, อยู่ for monks); kings พระราชา; other people, deities, animals and places
  plain forms.
- Pāḷi names: the established Thai spelling where there is one (Sāvatthī สาวัตถี, Rājagaha ราชคฤห์, Kosala โกศล, Magadha มคธ,
  Sāriputta พระสารีบุตร, Ānanda พระอานนท์, Jetavana เชตวัน), else the Pāḷi in Thai script as Thai Buddhists write it
  (Kakusandha กกุสันธะ); modern names in Thai (Ceylon ลังกา / ศรีลังกา, Rajgir ราชคีร์).
- Short descriptions say what the name is, without "name of": "name of a town" → "เมืองหนึ่ง", "name of a daemon" → "ยักษ์ตนหนึ่ง",
  "name of an arahant monk" → "พระอรหันต์รูปหนึ่ง", "An Arahant." → "พระอรหันต์รูปหนึ่ง". Lists separated by ; stay lists,
  each item short ("chief disciple" → "พระอัครสาวก").
- Drop text references such as (Mhv.x.88), (q.v.), (see …); keep the meaning exact, add nothing, no explanations: no
  titles or words the English does not have (Suppāraka สุปปารกะ, not สุปปารกบัณฑิต; Bharukaccha ภรุกัจฉะ, not ท่าเรือภรุกัจฉะ).
- Pāḷi words left in the English (yavapālaka, accharā, kinnarī, seṭṭhi) are translated by their Pāḷi meaning: yava is
  barley (ข้าวยวะ), not rice; when unsure, write the Pāḷi word in Thai script.
- Royal words (ทูล, ทรง, พระราชา's ราชาศัพท์) only for kings, royalty and the Buddha; monks ask each other อาราธนา / ขอ.
- Numbers in Arabic digits (2, 22, Upatissa II พระเจ้าอุปติสสะที่ 2), not Thai digits. Years as the English gives them,
  never converted to the Buddhist era: (247-207 B.C.) → (247-207 ปีก่อน ค.ศ.), (9-12 CE) → (ค.ศ. 9-12).
- One translation only: no alternatives ("or …"), notes, arrows or second thoughts in the text.
- A brother or sister whose age the English does not give: พี่น้อง (royal: พระภาดา, พระภคินี), not "elder or younger".
- Pāḷi quoted in the English (Gaṇadevaputtānañ-ca vimānāni) in Thai script, or left out.
- Categories (kind: category) are plural labels without "names of" and without a "DPPN:" prefix: "names of monks" →
  "พระภิกษุ", "villages, towns and cities" → "หมู่บ้าน นิคม และเมือง", "DPPN: tank" → "อ่างเก็บน้ำ".`,
  si: `You translate short English descriptions of proper names in the Pāḷi Tipiṭaka into Sinhala for tipitaka.app and
tipitaka.lk, read by Sri Lankan Buddhists.
Rules:
- Natural modern Sinhala as in Sri Lankan Buddhist writing.
- Honorifics: the Buddha, paccekabuddhas, arahants, theras, therīs, monks and nuns get the respectful forms (බුදුරජාණන් වහන්සේ,
  පසේබුදුරජාණන් වහන්සේ, රහතන් වහන්සේ, භික්ෂූන් වහන්සේ, භික්ෂුණීන් වහන්සේ, තෙරුන් වහන්සේ; verbs: වැඩ සිටි, වැඩම කළ, දේශනා කළ සේක,
  පිරිනිවන් පෑ); kings රජතුමා; other people, deities, animals and places plain forms.
- Pāḷi names in Sinhala script in their Pāḷi form (Kakusandha → කකුසන්ධ, Sāvatthī → සාවත්ථි, Magadha → මගධ, Licchavi → ලිච්ඡවි);
  modern names in Sinhala script (Ceylon → ලංකාව, Rajgir → රාජ්ගීර්).
- Short descriptions say what the name is, without "name of": "name of a town" → "නුවරකි", "name of a daemon" → "යක්ෂයෙකි",
  "name of an arahant monk" → "රහත් භික්ෂූන් වහන්සේ නමකි", "An Arahant." → "රහතන් වහන්සේ නමකි.". Lists separated by ; stay
  lists, each item short ("chief disciple" → "අගසව්").
- Drop text references such as (Mhv.x.88), (q.v.), (see …); keep the meaning exact, add nothing, no explanations.
- Categories (kind: category) are plural labels without "names of" and without a "DPPN:" prefix: "names of monks" →
  "භික්ෂූන් වහන්සේලා", "villages, towns and cities" → "ගම්, නියම්ගම් සහ නුවරවල්", "DPPN: tank" → "වැව්".`,
}
if (!STYLE[lang]) throw new Error(`npm run names:translate -- <${Object.keys(STYLE).join(' | ')}>`)

const DIR = path.join(repo, 'data/names/i18n', lang)
const files = { meaning: path.join(DIR, 'meanings.tsv'), category: path.join(DIR, 'families.tsv') }
const readTsv = (f: string) => new Map(fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t') as [string, string]) : [])
const writeTsv = (f: string, m: Map<string, string>) =>
  fs.writeFileSync(f, [`en\t${lang}`, ...[...m].sort((a, b) => a[0].localeCompare(b[0])).map(([en, tr]) => `${en}\t${tr}`)].join('\n') + '\n')

const done = { meaning: readTsv(files.meaning), category: readTsv(files.category) }
// (entities.tsv columns: slug type lemma dpd family meaning …; a family is a list "a; b": its items are translated)
const rows = fs.readFileSync(path.join(repo, 'data/names/entities.tsv'), 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'))
const todo: { i: number; kind: 'meaning' | 'category'; en: string }[] = []
const seen = new Set<string>()
const add = (kind: 'meaning' | 'category', en: string) => {
  if (!en || done[kind].has(en) || seen.has(kind + en)) return
  seen.add(kind + en)
  todo.push({ i: todo.length + 1, kind, en })
}
for (const r of rows) if (r[4] && !done.category.has(r[4])) for (const p of r[4].split('; ')) add('category', p)
for (const r of rows) add('meaning', r[5])
const sample = +arg('--sample', '0')!
// (a sample: every nth text, categories and meanings alike)
const step = Math.max(1, Math.floor(todo.length / Math.max(1, sample))), offset = +arg('--offset', '0')! % step
const work = sample ? todo.filter((_, k) => k % step === offset).slice(0, sample) : todo.slice(0, +arg('--limit', '100000')!)
console.log(`${todo.length} to translate (${done.meaning.size} meanings, ${done.category.size} categories done); sending ${work.length}`)

const gemini = new Gemini({ system: STYLE[lang], cacheDir: path.join(repo, '.cache/names/ai'), model: arg('--model', 'gemini-4-argon')!, price: [2, 10] })
const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, tr: { type: 'string' } },
  required: ['i', 'tr'] } } }, required: ['items'] }
const batches: (typeof work)[] = []
for (let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH))
if (!sample) fs.mkdirSync(DIR, { recursive: true })
let n = 0
await pool(batches, +arg('--jobs', '4')!, async b => {
  const prompt = `Translate every item. Return one {"i", "tr"} per item, the same numbers.\n\n${b.map(x => `${x.i}. (${x.kind}) ${x.en}`).join('\n')}`
  const r = await gemini.ask<{ items: { i: number; tr: string }[] }>(`translate-${lang}`, prompt, schema)
  for (const x of b) {
    const tr = r?.items.find(o => o.i === x.i)?.tr?.trim().replace(/[\t\n]+/g, ' ')
    if (!tr) continue
    n++
    if (sample) console.log(`${x.kind === 'category' ? '[cat] ' : ''}${x.en}\n    → ${tr}`)
    else done[x.kind].set(x.en, tr)
  }
  if (!sample) { writeTsv(files.meaning, done.meaning); writeTsv(files.category, done.category) } // (saved as it goes)
})
console.log(`translated ${n} of ${work.length}${n < work.length ? ' (run again for the rest)' : ''}`)
console.log(gemini.usageLine())
