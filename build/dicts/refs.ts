/**
 * Text references in dictionary meanings: the work abbreviation becomes <abbr data-a> (explained by the dictionary's
 * list of abbreviations) and, when the reference can be opened in the reader (resolve), <a data-ref="<book> <vol> <page>">
 * (PTS volume and page) or <a data-ref="Ja <n>"> (Jātaka number).
 *   dppn style: SN.v.112, Ja.i.377-9, DN-a.ii.480, Dhp-a.iii.142f
 *   pts style:  S V 112, Ja I 377, Sv II 480, Dhp-a III 142
 * Only abbreviations that are part of a reference are marked.
 */

/** the books references to which can be opened (./text-index.ts BOOK_FILES) and their abbreviations in DPPN and in
 * the PTS dictionary (2025 edition). Books referred to by verse or chapter are not here, nor the commentaries DPPN cites
 * in other editions than the PTS (SHB, Aluvihāra: MN-a, SN-a, AN-a, Thag-a, Ap-a, Bv-a, Cp-a; db/ref-check.md). */
export const BOOKS: { id: string; dppn: string[]; pts: string[] }[] = [
  { id: 'Vin', dppn: ['Vin'], pts: ['Vin'] }, { id: 'DN', dppn: ['DN'], pts: ['D'] }, { id: 'MN', dppn: ['MN'], pts: ['M'] },
  { id: 'SN', dppn: ['SN'], pts: ['S'] }, { id: 'AN', dppn: ['AN'], pts: ['A'] }, { id: 'Ja', dppn: ['Ja'], pts: ['Ja', 'J'] },
  { id: 'Vin-a', dppn: ['Vin-a'], pts: ['Sp'] }, { id: 'DN-a', dppn: ['DN-a'], pts: ['Sv'] }, { id: 'MN-a', dppn: [], pts: [] },
  { id: 'SN-a', dppn: [], pts: ['Spk'] }, { id: 'AN-a', dppn: [], pts: ['Mp'] }, { id: 'Dhp-a', dppn: ['Dhp-a'], pts: ['Dhp-a'] },
  { id: 'Thag-a', dppn: [], pts: [] }, { id: 'Thig-a', dppn: ['Thig-a', 'Thīg-a'], pts: ['Thig-a'] },
  { id: 'Ap', dppn: ['Ap'], pts: [] }, { id: 'Ap-a', dppn: [], pts: [] }, { id: 'Ud', dppn: ['Ud'], pts: ['Ud'] },
  { id: 'Ud-a', dppn: ['Ud-a'], pts: [] }, { id: 'It', dppn: ['Iti'], pts: ['It'] }, { id: 'It-a', dppn: ['Iti-a'], pts: [] },
  { id: 'Vv-a', dppn: ['Vv-a'], pts: ['Vv-a'] }, { id: 'Pv-a', dppn: ['Pv-a'], pts: ['Pv-a'] }, { id: 'Bv-a', dppn: [], pts: [] },
  { id: 'Cp-a', dppn: [], pts: [] }, { id: 'Khp-a', dppn: ['Khp-a'], pts: [] }, { id: 'Snp-a', dppn: ['Snp-a'], pts: [] },
  { id: 'Miln', dppn: ['Mil'], pts: ['Miln'] }, { id: 'Nett', dppn: [], pts: ['Nett'] }, { id: 'Dhs-a', dppn: ['Dhs-a'], pts: ['As'] },
  { id: 'Vibh', dppn: [], pts: ['Vibh'] }, { id: 'Vibh-a', dppn: ['Vibh-a'], pts: ['Vibh-a'] }, { id: 'Pp', dppn: [], pts: ['Pp'] },
  { id: 'Kv', dppn: ['Kv'], pts: ['Kv'] },
]

/** abbreviations of the PTS dictionary (2025 edition) that its list of abbreviations does not have */
export const PTS_ABBREVS: Record<string, string> = {
  'Pv-a': 'Petavatthu commentary', 'Vv-a': 'Vimānavatthu commentary', 'Thig-a': 'Therīgāthā commentary', 'Dhp-a': 'Dhammapada commentary',
  'Vibh-a': 'Sammohavinodanī, Vibhaṅga commentary', 'Pp-a': 'Puggalapaññatti commentary', Snp: 'Suttanipāta', Dhp: 'Dhammapada',
  Ja: 'Jātaka', Sv: 'Sumaṅgalavilāsinī, Dīgha Nikāya commentary', Sp: 'Samantapāsādikā, Vinaya commentary', Spk: 'Sāratthappakāsinī, Saṃyutta Nikāya commentary',
  Mp: 'Manorathapūraṇī, Aṅguttara Nikāya commentary', Pj: 'Paramatthajotikā (Khuddakapāṭha and Suttanipāta commentary)', Nidd: 'Niddesa',
  It: 'Itivuttaka', Pp: 'Puggalapaññatti', Thag: 'Theragāthā', Thig: 'Therīgāthā', As: 'Atthasālinī, Dhammasaṅgaṇi commentary',
  Saddh: 'Saddhammopāyana', Mhv: 'Mahāvaṃsa', Vibh: 'Vibhaṅga', Khp: 'Khuddakapāṭha', Kv: 'Kathāvatthu', Abh: 'Abhidhānappadīpikā',
  BMPE: 'A Buddhist Manual of Psychological Ethics (Dhammasaṅgaṇi translation)', Tikap: 'Tikapaṭṭhāna', Dukap: 'Dukapaṭṭhāna',
  Jm: 'Jātakamālā', Mhbv: 'Mahābodhivaṃsa', Cpd: 'Compendium of Philosophy', Mil: 'Milindapañha', Miln: 'Milindapañha',
  Vism: 'Visuddhimagga', Dhs: 'Dhammasaṅgaṇi', Nett: 'Nettipakaraṇa', Ud: 'Udāna', Vin: 'Vinaya', Divy: 'Divyāvadāna', Mvu: 'Mahāvastu',
  A: 'Aṅguttara Nikāya', D: 'Dīgha Nikāya', M: 'Majjhima Nikāya', S: 'Saṃyutta Nikāya', Pv: 'Petavatthu', Vv: 'Vimānavatthu',
  Bv: 'Buddhavaṃsa', Cp: 'Cariyāpiṭaka', Ap: 'Apadāna', JPTS: 'Journal of the Pali Text Society', JRAS: 'Journal of the Royal Asiatic Society',
}

/** BB's (Pali-Thai PTS) book abbreviations: the book id of BOOKS (references that can be opened) and the title */
export const THAI_BOOKS: Record<string, [string | null, string]> = {
  'ชา.': ['Ja', 'ชาดก (อรรถกถา), Jātaka'], 'วิ.': ['Vin', 'วินัยปิฎก, Vinaya'], 'ที.': ['DN', 'ทีฆนิกาย, Dīgha Nikāya'],
  'ม.': ['MN', 'มัชฌิมนิกาย, Majjhima Nikāya'], 'สํ.': ['SN', 'สังยุตตนิกาย, Saṃyutta Nikāya'], 'องฺ.': ['AN', 'อังคุตตรนิกาย, Aṅguttara Nikāya'],
  'ขุ.': [null, 'ขุททกปาฐะ, Khuddakapāṭha'], 'ธ.': [null, 'ธรรมบท, Dhammapada'], 'อุทาน.': ['Ud', 'อุทาน, Udāna'], 'อิติ.': ['It', 'อิติวุตตกะ, Itivuttaka'],
  'สุตฺ.นิ.': [null, 'สุตตนิบาต, Suttanipāta'], 'วิมาน.': [null, 'วิมานวัตถุ, Vimānavatthu'], 'เปต.': [null, 'เปตวัตถุ, Petavatthu'],
  'เถร.': [null, 'เถรคาถา, Theragāthā'], 'เถรี.': [null, 'เถรีคาถา, Therīgāthā'], 'อ.ทา.': ['Ap', 'อปทาน, Apadāna'], 'พุ.': [null, 'พุทธวงศ์, Buddhavaṃsa'],
  'จ.ปิ.': [null, 'จริยาปิฎก, Cariyāpiṭaka'], 'มหา.นิ.': [null, 'มหานิทเทส, Mahāniddesa'], 'จุลฺ.นิ.': [null, 'จูฬนิทเทส, Cūḷaniddesa'],
  'ปฏิ.ส.': [null, 'ปฏิสัมภิทามรรค, Paṭisambhidāmagga'], 'มิลินฺ.': ['Miln', 'มิลินทปัญหา, Milindapañha'], 'เน.ป.': ['Nett', 'เนตติปกรณ์, Nettipakaraṇa'],
  'ธ.ส.': [null, 'ธัมมสังคณี, Dhammasaṅgaṇī'], 'วิภงฺค.': ['Vibh', 'วิภังค์, Vibhaṅga'], 'กถา.': ['Kv', 'กถาวัตถุ, Kathāvatthu'],
  'ปุํ.': ['Pp', 'ปุคคลบัญญัติ, Puggalapaññatti'], 'ติ.ป.': [null, 'ติกปัฏฐาน, Tikapaṭṭhāna'], 'ทุ.ป.': [null, 'ทุกปัฏฐาน, Dukapaṭṭhāna'],
  'วิ.ม.': [null, 'วิสุทธิมรรค, Visuddhimagga'], 'ม.วํ.': [null, 'มหาวงศ์, Mahāvaṃsa'], 'ที.วํ.': [null, 'ทีปวงศ์, Dīpavaṃsa'], 'ม.ว.': [null, 'มหาวัสตุ, Mahāvastu'],
  'ทิวฺ.': [null, 'ทิวยาวทาน, Divyāvadāna'], 'ชา.มา.': [null, 'ชาดกมาลา, Jātakamālā'], 'ล.วิ.': [null, 'ลลิตวิสตระ, Lalitavistara'],
  'สทฺ.ปา.': [null, 'สัทธัมโมปายนะ, Saddhammopāyana'], 'อภิธา.': [null, 'อภิธานัปปทีปิกา, Abhidhānappadīpikā'], 'มหา.วํ.': [null, 'มหาโพธิวงศ์, Mahābodhivaṃsa'],
  'ที.อ.': ['DN-a', 'อรรถกถาทีฆนิกาย (สุมังคลวิลาสินี)'], 'ม.อ.': ['MN-a', 'อรรถกถามัชฌิมนิกาย (ปปัญจสูทนี)'], 'สํ.อ.': ['SN-a', 'อรรถกถาสังยุตตนิกาย (สารัตถปกาสินี)'],
  'องฺ.อ.': ['AN-a', 'อรรถกถาอังคุตตรนิกาย (มโนรถปูรณี)'], 'วิ.อ.': ['Vin-a', 'อรรถกถาวินัย (สมันตปาสาทิกา)'], 'ขุ.อ.': ['Khp-a', 'อรรถกถาขุททกปาฐะ (ปรมัตถโชติกา)'],
  'สุตฺ.นิ.อ.': ['Snp-a', 'อรรถกถาสุตตนิบาต (ปรมัตถโชติกา)'], 'ธ.อ.': ['Dhp-a', 'อรรถกถาธรรมบท'], 'อุทาน.อ.': ['Ud-a', 'อรรถกถาอุทาน'],
  'อิติ.อ.': ['It-a', 'อรรถกถาอิติวุตตกะ'], 'วิมาน.อ.': ['Vv-a', 'อรรถกถาวิมานวัตถุ'], 'เปต.อ.': ['Pv-a', 'อรรถกถาเปตวัตถุ'], 'เถร.อ.': ['Thag-a', 'อรรถกถาเถรคาถา'],
  'เถรี.อ.': ['Thig-a', 'อรรถกถาเถรีคาถา'], 'ธ.ส.อ.': ['Dhs-a', 'อรรถกถาธัมมสังคณี (อัฏฐสาลินี)'], 'วิภงฺค.อ.': ['Vibh-a', 'อรรถกถาวิภังค์ (สัมโมหวิโนทนี)'],
  'ปุํ.อ.': [null, 'อรรถกถาปุคคลบัญญัติ'], 'เน.ป.อ.': [null, 'อรรถกถาเนตติ'],
}
export const THAI_ABBREVS: Record<string, string> = Object.fromEntries(Object.entries(THAI_BOOKS).map(([a, [, title]]) => [a, title]))

export type RefStyle = 'dppn' | 'pts' | 'thai'
/** the place in the texts (<key>#<paragraph>) of a reference: book id, volume (0: none), page or (Ja, volume 0) Jātaka number */
export type Resolver = (book: string, vol: number, page: number, names?: string[]) => string | null

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }
export function romanToInt(r: string): number {
  let n = 0
  const s = r.toLowerCase()
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]], next = ROMAN[s[i + 1]] ?? 0
    if (!v) return 0
    n += v < next ? -v : v
  }
  return n
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const bookOf = new Map<string, string>()
for (const b of BOOKS) for (const style of ['dppn', 'pts'] as const) for (const a of b[style]) bookOf.set(`${style}:${a}`, b.id)

function refRegex(abbrevs: string[], style: RefStyle): RegExp {
  const alt = [...abbrevs].sort((a, b) => b.length - a.length).map(esc).join('|')
  // BB: ชา.1/9 (volume/page), สุตฺ.นิ.452 (page or verse of a book of one volume)
  if (style === 'thai') return new RegExp(`(?<![\u0e01-\u0e4e.])(${alt}) ?(?:(\\d+)/)?(\\d+)`, 'gu')
  return style === 'dppn'
    // abbr . vol . page   |  abbr . page   (the volume is lower case roman; vv. = verses)
    ? new RegExp(`(?<![\\p{L}\\d-])(${alt})\\.(?:([ivxlc]+)\\.)?(\\d+)`, 'gu')
    // abbr VOL page  |  abbr page ; one letter books always have a volume
    : new RegExp(`(?<![\\p{L}\\d-])(${alt}) (?:([IVXL]+) )?(\\d+)`, 'gu')
}

/** marks the references in the text of html (outside tags and links) */
export function markRefs(html: string, abbrevs: Record<string, string>, style: RefStyle, resolve?: Resolver): { html: string; refs: number } {
  const keys = Object.keys(abbrevs)
  if (!keys.length) return { html, refs: 0 }
  const re = refRegex(keys, style)
  let refs = 0
  let inLink = 0
  let done = '' // the html before the current segment
  /** the names a reference may be for: the bold words of its sentence */
  const namesBefore = (upTo: string) => [...(upTo.split(/[.;]\s/).pop() ?? '').matchAll(/<b>(?:<a [^>]*>)?([^<]+)/g)].map(x => x[1])
  const out = html.split(/(<[^>]*>)/).map(seg => {
    const before = done
    done += seg
    if (seg.startsWith('<')) {
      if (/^<a[\s>]/.test(seg)) inLink++
      else if (seg === '</a>') inLink = Math.max(0, inLink - 1)
      return seg
    }
    if (inLink) return seg
    seg = seg.replace(re, (m, abbr: string, vol: string | undefined, page: string, offset: number) => {
      if (style === 'pts' && abbr.length === 1 && !vol) return m // "A 5": not a reference
      refs++
      const tag = `<abbr data-a="${abbr}">${abbr}</abbr>${m.slice(abbr.length)}`
      const book = style === 'thai' ? THAI_BOOKS[abbr]?.[0] : bookOf.get(`${style}:${abbr}`)
      const v = vol ? (style === 'thai' ? Number(vol) : romanToInt(vol)) : 0
      // a book of one volume in BB's notation is page only; the Jātaka by volume/page is the commentary
      const place = book && !(style === 'thai' && book === 'Ja' && !v) ? resolve?.(book, v, Number(page), namesBefore(before + seg.slice(0, offset))) : null
      return place ? `<a data-ref="${place}">${tag}</a>` : tag
    })
    // Jātaka numbers of the DPPN editor's additions: "Ja 90"
    if (style === 'dppn') {
      seg = seg.replace(/(?<![\p{L}\d-])Ja (\d{1,3})(?!\d)/gu, (m, n: string) => {
        refs++
        const place = resolve?.('Ja', 0, Number(n))
        return place ? `<a data-ref="${place}"><abbr data-a="Ja">Ja</abbr> ${n}</a>` : `<abbr data-a="Ja">Ja</abbr> ${n}`
      })
    }
    return seg
  }).join('')
  return { html: out, refs }
}
