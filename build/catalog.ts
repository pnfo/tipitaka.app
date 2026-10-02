/**
 * The book catalog: every upstream romn/*.xml file, its collection, its place in the tree and the key of its
 * root node. Order here is the tree order (same as the VRI tipitaka.org tree.json).
 *
 * Keys follow open.tipitaka.lk / tipitaka.lk: pitaka vp | sp | ap, nikaya dn mn sn an kn, books kn-dhp, vp-prj,
 * ap-dhs ..., commentaries prefixed atta- / tika- (and tika2- for a second ṭīkā on the same text), other texts anya-.
 * Below the book level keys are the CST div ids (dn1_1 -> dn-1-1) or positional numbers of the headings.
 * Keys are a public contract (urls): never change an existing key, add an override instead (build/tree.ts).
 */
import { slug } from '../shared/normalize'

export type Collection = 'mula' | 'atta' | 'tika' | 'anya'
export const COLLECTIONS: Collection[] = ['mula', 'atta', 'tika', 'anya']

export interface GroupDef { key: string; parent: string; title: string }
export interface BookDef {
  /** internal book id = first file without extension (stable) */
  id: string
  files: string[]
  parent: string
  coll: Collection
  title: string
  /** key of the book root node. Omitted for files whose top level <div>s define the book node(s) */
  key?: string
}

// ---------------- div ids -> keys ----------------
const VIN = ['vp-prj', 'vp-pct', 'vp-mv', 'vp-cv', 'vp-pv']
const KN: Record<string, string> = {
  kn1: 'kn-khp', kn2: 'kn-dhp', kn3: 'kn-ud', kn4: 'kn-iti', kn5: 'kn-snp', kn6: 'kn-vv', kn7: 'kn-pv', kn8: 'kn-thag',
  kn9: 'kn-thig', kn10: 'kn-ap', kn11: 'kn-thiap', kn12: 'kn-bv', kn13: 'kn-cp', kn14: 'kn-jat', kn15: 'kn-mn', kn16: 'kn-nc',
  kn17: 'kn-ps', kn18: 'kn-mil', kn19: 'kn-nett', kn20: 'kn-petk',
}
const COLL_PREFIX: Record<Collection, string> = { mula: '', atta: 'atta-', tika: 'tika-', anya: 'anya-' }

/** key of a CST div id (dn1_1, an2_1_3, kn14_17, vin1_2) in a collection, null when unknown */
export function divKey(id: string, prefix: string): string | null {
  const [root, ...rest] = id.split('_')
  let base: string | undefined
  const m = /^(dn|mn|sn|an)(\d+)$/.exec(root)
  if (m) base = `${m[1]}-${m[2]}`
  else if (/^vin\d+$/.test(root)) base = VIN[+root.slice(3) - 1]
  else base = KN[root]
  if (!base) return null
  return prefix + [base, ...rest].join('-')
}

// ---------------- groups (tree nodes without text) ----------------
export const GROUPS: GroupDef[] = [
  { key: 'mula', parent: '', title: 'Tipiṭaka (Mūla)' },
  { key: 'vp', parent: 'mula', title: 'Vinayapiṭaka' },
  { key: 'sp', parent: 'mula', title: 'Suttapiṭaka' },
  { key: 'dn', parent: 'sp', title: 'Dīghanikāya' },
  { key: 'mn', parent: 'sp', title: 'Majjhimanikāya' },
  { key: 'sn', parent: 'sp', title: 'Saṃyuttanikāya' },
  { key: 'an', parent: 'sp', title: 'Aṅguttaranikāya' },
  { key: 'kn', parent: 'sp', title: 'Khuddakanikāya' },
  { key: 'ap', parent: 'mula', title: 'Abhidhammapiṭaka' },
  { key: 'ap-yam', parent: 'ap', title: 'Yamakapāḷi' },
  { key: 'ap-pat', parent: 'ap', title: 'Paṭṭhānapāḷi' },

  { key: 'atta', parent: '', title: 'Aṭṭhakathā' },
  { key: 'atta-vp', parent: 'atta', title: 'Vinayapiṭaka (Aṭṭhakathā)' },
  { key: 'atta-sp', parent: 'atta', title: 'Suttapiṭaka (Aṭṭhakathā)' },
  { key: 'atta-dn', parent: 'atta-sp', title: 'Dīghanikāya (Aṭṭhakathā)' },
  { key: 'atta-mn', parent: 'atta-sp', title: 'Majjhimanikāya (Aṭṭhakathā)' },
  { key: 'atta-sn', parent: 'atta-sp', title: 'Saṃyuttanikāya (Aṭṭhakathā)' },
  { key: 'atta-an', parent: 'atta-sp', title: 'Aṅguttaranikāya (Aṭṭhakathā)' },
  { key: 'atta-kn', parent: 'atta-sp', title: 'Khuddakanikāya (Aṭṭhakathā)' },
  { key: 'atta-ap', parent: 'atta', title: 'Abhidhammapiṭaka (Aṭṭhakathā)' },

  { key: 'tika', parent: '', title: 'Ṭīkā' },
  { key: 'tika-vp', parent: 'tika', title: 'Vinayapiṭaka (Ṭīkā)' },
  { key: 'tika-sp', parent: 'tika', title: 'Suttapiṭaka (Ṭīkā)' },
  { key: 'tika-dn', parent: 'tika-sp', title: 'Dīghanikāya (Ṭīkā)' },
  { key: 'tika-mn', parent: 'tika-sp', title: 'Majjhimanikāya (Ṭīkā)' },
  { key: 'tika-sn', parent: 'tika-sp', title: 'Saṃyuttanikāya (Ṭīkā)' },
  { key: 'tika-an', parent: 'tika-sp', title: 'Aṅguttaranikāya (Ṭīkā)' },
  { key: 'tika-kn', parent: 'tika-sp', title: 'Khuddakanikāya (Ṭīkā)' },
  { key: 'tika-ap', parent: 'tika', title: 'Abhidhammapiṭaka (Ṭīkā)' },

  { key: 'anya', parent: '', title: 'Añña' },
  { key: 'anya-visuddhimagga', parent: 'anya', title: 'Visuddhimagga' },
  { key: 'anya-sangayana', parent: 'anya', title: 'Saṅgāyana-puccha vissajjanā' },
  { key: 'anya-ledi', parent: 'anya', title: 'Leḍī sayāḍo gantha-saṅgaho' },
  { key: 'anya-vandana', parent: 'anya', title: 'Buddha-vandanā gantha-saṅgaho' },
  { key: 'anya-vamsa', parent: 'anya', title: 'Vaṃsa-gantha-saṅgaho' },
  { key: 'anya-byakarana', parent: 'anya', title: 'Byākaraṇa gantha-saṅgaho' },
  { key: 'anya-niti', parent: 'anya', title: 'Nīti-gantha-saṅgaho' },
  { key: 'anya-pakinnaka', parent: 'anya', title: 'Pakiṇṇaka-gantha-saṅgaho' },
  { key: 'anya-sihala', parent: 'anya', title: 'Sīhaḷa-gantha-saṅgaho' },
]

// ---------------- books ----------------
type Row = [files: string, parent: string, title: string, key?: string]
const b = (coll: Collection, rows: Row[]): BookDef[] => rows.map(([files, parent, title, key]) => {
  const fs = files.split(' ')
  return { id: fs[0], files: fs.map(f => `${f}.xml`), parent, coll, title, key }
})
/** key from the title for books without a canonical abbreviation (other ṭīkā and añña texts) */
const s = (coll: Collection, title: string) => COLL_PREFIX[coll] + slug(title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[-–]\d+$/, ''))

const MULA = b('mula', [
  ['vin01m.mul', 'vp', 'Pārājikapāḷi'],
  ['vin02m1.mul', 'vp', 'Pācittiyapāḷi'],
  ['vin02m2.mul', 'vp', 'Mahāvaggapāḷi'],
  ['vin02m3.mul', 'vp', 'Cūḷavaggapāḷi'],
  ['vin02m4.mul', 'vp', 'Parivārapāḷi'],
  ['s0101m.mul', 'dn', 'Sīlakkhandhavaggapāḷi'],
  ['s0102m.mul', 'dn', 'Mahāvaggapāḷi'],
  ['s0103m.mul', 'dn', 'Pāthikavaggapāḷi'],
  ['s0201m.mul', 'mn', 'Mūlapaṇṇāsapāḷi'],
  ['s0202m.mul', 'mn', 'Majjhimapaṇṇāsapāḷi'],
  ['s0203m.mul', 'mn', 'Uparipaṇṇāsapāḷi'],
  ['s0301m.mul', 'sn', 'Sagāthāvaggapāḷi'],
  ['s0302m.mul', 'sn', 'Nidānavaggapāḷi'],
  ['s0303m.mul', 'sn', 'Khandhavaggapāḷi'],
  ['s0304m.mul', 'sn', 'Saḷāyatanavaggapāḷi'],
  ['s0305m.mul', 'sn', 'Mahāvaggapāḷi'],
  ['s0401m.mul', 'an', 'Ekakanipātapāḷi'],
  ['s0402m1.mul', 'an', 'Dukanipātapāḷi'],
  ['s0402m2.mul', 'an', 'Tikanipātapāḷi'],
  ['s0402m3.mul', 'an', 'Catukkanipātapāḷi'],
  ['s0403m1.mul', 'an', 'Pañcakanipātapāḷi'],
  ['s0403m2.mul', 'an', 'Chakkanipātapāḷi'],
  ['s0403m3.mul', 'an', 'Sattakanipātapāḷi'],
  ['s0404m1.mul', 'an', 'Aṭṭhakanipātapāḷi'],
  ['s0404m2.mul', 'an', 'Navakanipātapāḷi'],
  ['s0404m3.mul', 'an', 'Dasakanipātapāḷi'],
  ['s0404m4.mul', 'an', 'Ekādasakanipātapāḷi'],
  ['s0501m.mul', 'kn', 'Khuddakapāṭhapāḷi'],
  ['s0502m.mul', 'kn', 'Dhammapadapāḷi'],
  ['s0503m.mul', 'kn', 'Udānapāḷi'],
  ['s0504m.mul', 'kn', 'Itivuttakapāḷi'],
  ['s0505m.mul', 'kn', 'Suttanipātapāḷi'],
  ['s0506m.mul', 'kn', 'Vimānavatthupāḷi'],
  ['s0507m.mul', 'kn', 'Petavatthupāḷi'],
  ['s0508m.mul', 'kn', 'Theragāthāpāḷi'],
  ['s0509m.mul', 'kn', 'Therīgāthāpāḷi'],
  ['s0510m1.mul s0510m2.mul', 'kn', 'Apadānapāḷi'],
  ['s0511m.mul', 'kn', 'Buddhavaṃsapāḷi'],
  ['s0512m.mul', 'kn', 'Cariyāpiṭakapāḷi'],
  ['s0513m.mul s0514m.mul', 'kn', 'Jātakapāḷi'],
  ['s0515m.mul', 'kn', 'Mahāniddesapāḷi'],
  ['s0516m.mul', 'kn', 'Cūḷaniddesapāḷi'],
  ['s0517m.mul', 'kn', 'Paṭisambhidāmaggapāḷi'],
  ['s0518m.nrf', 'kn', 'Milindapañhapāḷi'],
  ['s0519m.mul', 'kn', 'Nettippakaraṇapāḷi'],
  ['s0520m.nrf', 'kn', 'Peṭakopadesapāḷi'],
  ['abh01m.mul', 'ap', 'Dhammasaṅgaṇīpāḷi', 'ap-dhs'],
  ['abh02m.mul', 'ap', 'Vibhaṅgapāḷi', 'ap-vbh'],
  ['abh03m1.mul', 'ap', 'Dhātukathāpāḷi', 'ap-dhk'],
  ['abh03m2.mul', 'ap', 'Puggalapaññattipāḷi', 'ap-pug'],
  ['abh03m3.mul', 'ap', 'Kathāvatthupāḷi', 'ap-kvu'],
  ['abh03m4.mul', 'ap-yam', 'Yamakapāḷi-1', 'ap-yam-1'],
  ['abh03m5.mul', 'ap-yam', 'Yamakapāḷi-2', 'ap-yam-2'],
  ['abh03m6.mul', 'ap-yam', 'Yamakapāḷi-3', 'ap-yam-3'],
  ['abh03m7.mul', 'ap-pat', 'Paṭṭhānapāḷi-1', 'ap-pat-1'],
  ['abh03m8.mul', 'ap-pat', 'Paṭṭhānapāḷi-2', 'ap-pat-2'],
  ['abh03m9.mul', 'ap-pat', 'Paṭṭhānapāḷi-3', 'ap-pat-3'],
  ['abh03m10.mul', 'ap-pat', 'Paṭṭhānapāḷi-4', 'ap-pat-4'],
  ['abh03m11.mul', 'ap-pat', 'Paṭṭhānapāḷi-5', 'ap-pat-5'],
])

const ATTA = b('atta', [
  ['vin01a.att', 'atta-vp', 'Pārājikakaṇḍa-aṭṭhakathā', 'atta-vp-prj'],
  ['vin02a1.att', 'atta-vp', 'Pācittiya-aṭṭhakathā', 'atta-vp-pct'],
  ['vin02a2.att', 'atta-vp', 'Mahāvagga-aṭṭhakathā', 'atta-vp-mv'],
  ['vin02a3.att', 'atta-vp', 'Cūḷavagga-aṭṭhakathā', 'atta-vp-cv'],
  ['vin02a4.att', 'atta-vp', 'Parivāra-aṭṭhakathā', 'atta-vp-pv'],
  ['s0101a.att', 'atta-dn', 'Sīlakkhandhavagga-aṭṭhakathā'],
  ['s0102a.att', 'atta-dn', 'Mahāvagga-aṭṭhakathā'],
  ['s0103a.att', 'atta-dn', 'Pāthikavagga-aṭṭhakathā'],
  ['s0201a.att', 'atta-mn', 'Mūlapaṇṇāsa-aṭṭhakathā'],
  ['s0202a.att', 'atta-mn', 'Majjhimapaṇṇāsa-aṭṭhakathā'],
  ['s0203a.att', 'atta-mn', 'Uparipaṇṇāsa-aṭṭhakathā'],
  ['s0301a.att', 'atta-sn', 'Sagāthāvagga-aṭṭhakathā'],
  ['s0302a.att', 'atta-sn', 'Nidānavagga-aṭṭhakathā'],
  ['s0303a.att', 'atta-sn', 'Khandhavagga-aṭṭhakathā'],
  ['s0304a.att', 'atta-sn', 'Saḷāyatanavagga-aṭṭhakathā'],
  ['s0305a.att', 'atta-sn', 'Mahāvagga-aṭṭhakathā'],
  ['s0401a.att', 'atta-an', 'Ekakanipāta-aṭṭhakathā'],
  ['s0402a.att', 'atta-an', 'Duka-tika-catukkanipāta-aṭṭhakathā'],
  ['s0403a.att', 'atta-an', 'Pañcaka-chakka-sattakanipāta-aṭṭhakathā'],
  ['s0404a.att', 'atta-an', 'Aṭṭhakādinipāta-aṭṭhakathā'],
  ['s0501a.att', 'atta-kn', 'Khuddakapāṭha-aṭṭhakathā', 'atta-kn-khp'],
  ['s0502a.att', 'atta-kn', 'Dhammapada-aṭṭhakathā', 'atta-kn-dhp'],
  ['s0503a.att', 'atta-kn', 'Udāna-aṭṭhakathā', 'atta-kn-ud'],
  ['s0504a.att', 'atta-kn', 'Itivuttaka-aṭṭhakathā', 'atta-kn-iti'],
  ['s0505a.att', 'atta-kn', 'Suttanipāta-aṭṭhakathā', 'atta-kn-snp'],
  ['s0506a.att', 'atta-kn', 'Vimānavatthu-aṭṭhakathā', 'atta-kn-vv'],
  ['s0507a.att', 'atta-kn', 'Petavatthu-aṭṭhakathā', 'atta-kn-pv'],
  ['s0508a1.att s0508a2.att', 'atta-kn', 'Theragāthā-aṭṭhakathā', 'atta-kn-thag'],
  ['s0509a.att', 'atta-kn', 'Therīgāthā-aṭṭhakathā', 'atta-kn-thig'],
  ['s0510a.att', 'atta-kn', 'Apadāna-aṭṭhakathā', 'atta-kn-ap'],
  ['s0511a.att', 'atta-kn', 'Buddhavaṃsa-aṭṭhakathā', 'atta-kn-bv'],
  ['s0512a.att', 'atta-kn', 'Cariyāpiṭaka-aṭṭhakathā', 'atta-kn-cp'],
  ['s0513a1.att s0513a2.att s0513a3.att s0513a4.att s0514a1.att s0514a2.att s0514a3.att', 'atta-kn', 'Jātaka-aṭṭhakathā', 'atta-kn-jat'],
  ['s0515a.att', 'atta-kn', 'Mahāniddesa-aṭṭhakathā', 'atta-kn-mn'],
  ['s0516a.att', 'atta-kn', 'Cūḷaniddesa-aṭṭhakathā', 'atta-kn-nc'],
  ['s0517a.att', 'atta-kn', 'Paṭisambhidāmagga-aṭṭhakathā', 'atta-kn-ps'],
  ['s0519a.att', 'atta-kn', 'Nettippakaraṇa-aṭṭhakathā', 'atta-kn-nett'],
  ['abh01a.att', 'atta-ap', 'Dhammasaṅgaṇi-aṭṭhakathā', 'atta-ap-dhs'],
  ['abh02a.att', 'atta-ap', 'Sammohavinodanī-aṭṭhakathā', 'atta-ap-vbh'],
  ['abh03a.att', 'atta-ap', 'Pañcapakaraṇa-aṭṭhakathā', 'atta-ap-pp'],
])

const TIKA = b('tika', [
  ['vin01t1.tik vin01t2.tik', 'tika-vp', 'Sāratthadīpanī-ṭīkā (Pārājika)', 'tika-vp-prj'],
  ['vin02t.tik', 'tika-vp', 'Sāratthadīpanī-ṭīkā (Pācittiyādi)', 'tika-vp-pct'],
  ['vin04t.nrf', 'tika-vp', 'Dvemātikāpāḷi - Kaṅkhāvitaraṇī-aṭṭhakathā'],
  ['vin05t.nrf', 'tika-vp', 'Vinayasaṅgaha-aṭṭhakathā'],
  ['vin06t.nrf', 'tika-vp', 'Vajirabuddhi-ṭīkā'],
  ['vin07t.nrf', 'tika-vp', 'Vimativinodanī-ṭīkā'],
  ['vin08t.nrf', 'tika-vp', 'Vinayālaṅkāra-ṭīkā'],
  ['vin09t.nrf', 'tika-vp', 'Kaṅkhāvitaraṇīpurāṇa-ṭīkā'],
  ['vin10t.nrf', 'tika-vp', 'Vinayavinicchaya-uttaravinicchaya'],
  ['vin11t.nrf', 'tika-vp', 'Vinayavinicchaya-ṭīkā'],
  ['vin12t.nrf', 'tika-vp', 'Pācityādiyojanāpāḷi'],
  ['vin13t.nrf', 'tika-vp', 'Khuddasikkhā-mūlasikkhā'],
  ['s0101t.tik', 'tika-dn', 'Sīlakkhandhavagga-ṭīkā'],
  ['s0102t.tik', 'tika-dn', 'Mahāvagga-ṭīkā'],
  ['s0103t.tik', 'tika-dn', 'Pāthikavagga-ṭīkā'],
  ['s0104t.nrf s0105t.nrf', 'tika-dn', 'Sīlakkhandhavagga-abhinavaṭīkā', 'tika2-dn-1'],
  ['s0201t.tik', 'tika-mn', 'Mūlapaṇṇāsa-ṭīkā'],
  ['s0202t.tik', 'tika-mn', 'Majjhimapaṇṇāsa-ṭīkā'],
  ['s0203t.tik', 'tika-mn', 'Uparipaṇṇāsa-ṭīkā'],
  ['s0301t.tik', 'tika-sn', 'Sagāthāvagga-ṭīkā'],
  ['s0302t.tik', 'tika-sn', 'Nidānavagga-ṭīkā'],
  ['s0303t.tik', 'tika-sn', 'Khandhavagga-ṭīkā'],
  ['s0304t.tik', 'tika-sn', 'Saḷāyatanavagga-ṭīkā'],
  ['s0305t.tik', 'tika-sn', 'Mahāvagga-ṭīkā'],
  ['s0401t.tik', 'tika-an', 'Ekakanipāta-ṭīkā'],
  ['s0402t.tik', 'tika-an', 'Duka-tika-catukkanipāta-ṭīkā'],
  ['s0403t.tik', 'tika-an', 'Pañcaka-chakka-sattakanipāta-ṭīkā'],
  ['s0404t.tik', 'tika-an', 'Aṭṭhakādinipāta-ṭīkā'],
  ['s0519t.tik', 'tika-kn', 'Nettippakaraṇa-ṭīkā', 'tika-kn-nett'],
  ['s0501t.nrf', 'tika-kn', 'Nettivibhāvinī', 'tika2-kn-nett'],
  ['abh01t.tik', 'tika-ap', 'Dhammasaṅgaṇī-mūlaṭīkā', 'tika-ap-dhs'],
  ['abh02t.tik', 'tika-ap', 'Vibhaṅga-mūlaṭīkā', 'tika-ap-vbh'],
  ['abh03t.tik', 'tika-ap', 'Pañcapakaraṇa-mūlaṭīkā', 'tika-ap-pp'],
  ['abh04t.nrf', 'tika-ap', 'Dhammasaṅgaṇī-anuṭīkā', 'tika2-ap-dhs'],
  ['abh05t.nrf', 'tika-ap', 'Pañcapakaraṇa-anuṭīkā', 'tika2-ap-pp'],
  ['abh06t.nrf', 'tika-ap', 'Abhidhammāvatāro-nāmarūpaparicchedo'],
  ['abh07t.nrf', 'tika-ap', 'Abhidhammatthasaṅgaho'],
  ['abh08t.nrf', 'tika-ap', 'Abhidhammāvatāra-purāṇaṭīkā'],
  ['abh09t.nrf', 'tika-ap', 'Abhidhammamātikāpāḷi'],
])

const ANYA = b('anya', [
  ['e0101n.mul e0102n.mul', 'anya-visuddhimagga', 'Visuddhimagga', 'anya-vism'],
  ['e0103n.att e0104n.att', 'anya-visuddhimagga', 'Visuddhimagga-mahāṭīkā', 'anya-vismt'],
  ['e0105n.nrf', 'anya-visuddhimagga', 'Visuddhimagga nidānakathā', 'anya-vismn'],
  ['e0901n.nrf', 'anya-sangayana', 'Dīghanikāya (pu-vi)', 'anya-puvi-dn'],
  ['e0902n.nrf', 'anya-sangayana', 'Majjhimanikāya (pu-vi)', 'anya-puvi-mn'],
  ['e0903n.nrf', 'anya-sangayana', 'Saṃyuttanikāya (pu-vi)', 'anya-puvi-sn'],
  ['e0904n.nrf', 'anya-sangayana', 'Aṅguttaranikāya (pu-vi)', 'anya-puvi-an'],
  ['e0905n.nrf', 'anya-sangayana', 'Vinayapiṭaka (pu-vi)', 'anya-puvi-vp'],
  ['e0906n.nrf', 'anya-sangayana', 'Abhidhammapiṭaka (pu-vi)', 'anya-puvi-ap'],
  ['e0907n.nrf', 'anya-sangayana', 'Aṭṭhakathā (pu-vi)', 'anya-puvi-atta'],
  ['e0201n.nrf', 'anya-ledi', 'Niruttidīpanī'],
  ['e0301n.nrf', 'anya-ledi', 'Paramatthadīpanī saṅgahamahāṭīkāpāṭha'],
  ['e0401n.nrf', 'anya-ledi', 'Anudīpanīpāṭha'],
  ['e0501n.nrf', 'anya-ledi', 'Paṭṭhānuddesa dīpanīpāṭha'],
  ['e0601n.nrf', 'anya-vandana', 'Namakkāraṭīkā'],
  ['e0602n.nrf', 'anya-vandana', 'Mahāpaṇāmapāṭha'],
  ['e0603n.nrf', 'anya-vandana', 'Lakkhaṇāto buddhathomanāgāthā'],
  ['e0604n.nrf', 'anya-vandana', 'Sutavandanā'],
  ['e0606n.nrf', 'anya-vandana', 'Kamalāñjali'],
  ['e0605n.nrf', 'anya-vandana', 'Jinālaṅkāra'],
  ['e0607n.nrf', 'anya-vandana', 'Pajjamadhu'],
  ['e0608n.nrf', 'anya-vandana', 'Buddhaguṇagāthāvalī'],
  ['e0701n.nrf', 'anya-vamsa', 'Cūḷaganthavaṃsa'],
  ['e0703n.nrf', 'anya-vamsa', 'Mahāvaṃsa'],
  ['e0702n.nrf', 'anya-vamsa', 'Sāsanavaṃsa'],
  ['e0802n.nrf', 'anya-byakarana', 'Kaccāyanabyākaraṇaṃ'],
  ['e0801n.nrf', 'anya-byakarana', 'Moggallānabyākaraṇaṃ'],
  ['e0803n.nrf', 'anya-byakarana', 'Saddanītippakaraṇaṃ (padamālā)', 'anya-saddaniti-padamala'],
  ['e0804n.nrf', 'anya-byakarana', 'Saddanītippakaraṇaṃ (dhātumālā)', 'anya-saddaniti-dhatumala'],
  ['e0805n.nrf', 'anya-byakarana', 'Padarūpasiddhi'],
  ['e0806n.nrf', 'anya-byakarana', 'Moggallānapañcikā'],
  ['e0807n.nrf', 'anya-byakarana', 'Payogasiddhipāṭha'],
  ['e0808n.nrf', 'anya-byakarana', 'Vuttodayapāṭha'],
  ['e0809n.nrf', 'anya-byakarana', 'Abhidhānappadīpikāpāṭha'],
  ['e0810n.nrf', 'anya-byakarana', 'Abhidhānappadīpikāṭīkā'],
  ['e0811n.nrf', 'anya-byakarana', 'Subodhālaṅkārapāṭha'],
  ['e0812n.nrf', 'anya-byakarana', 'Subodhālaṅkāraṭīkā'],
  ['e0813n.nrf', 'anya-byakarana', 'Bālāvatāra gaṇṭhipadatthavinicchayasāra'],
  ['e1005n.nrf', 'anya-niti', 'Lokanīti'],
  ['e1006n.nrf', 'anya-niti', 'Suttantanīti'],
  ['e1007n.nrf', 'anya-niti', 'Sūrassatinīti'],
  ['e1004n.nrf', 'anya-niti', 'Mahārahanīti'],
  ['e1003n.nrf', 'anya-niti', 'Dhammanīti'],
  ['e1001n.nrf', 'anya-niti', 'Kavidappaṇanīti'],
  ['e1002n.nrf', 'anya-niti', 'Nītimañjarī'],
  ['e1009n.nrf', 'anya-niti', 'Naradakkhadīpanī'],
  ['e1010n.nrf', 'anya-niti', 'Caturārakkhadīpanī'],
  ['e1008n.nrf', 'anya-niti', 'Cāṇakyanīti'],
  ['e1101n.nrf', 'anya-pakinnaka', 'Rasavāhinī'],
  ['e1102n.nrf', 'anya-pakinnaka', 'Sīmavisodhanīpāṭha'],
  ['e1103n.nrf', 'anya-pakinnaka', 'Vessantaragīti'],
  ['e1201n.nrf', 'anya-sihala', 'Moggallāna vuttivivaraṇapañcikā'],
  ['e1202n.nrf', 'anya-sihala', 'Thūpavaṃsa'],
  ['e1203n.nrf', 'anya-sihala', 'Dāṭhāvaṃsa'],
  ['e1204n.nrf', 'anya-sihala', 'Dhātupāṭhavilāsiniyā'],
  ['e1205n.nrf', 'anya-sihala', 'Dhātuvaṃsa'],
  ['e1206n.nrf', 'anya-sihala', 'Hatthavanagallavihāravaṃsa'],
  ['e1207n.nrf', 'anya-sihala', 'Jinacaritaya'],
  ['e1208n.nrf', 'anya-sihala', 'Jinavaṃsadīpaṃ'],
  ['e1209n.nrf', 'anya-sihala', 'Telakaṭāhagāthā'],
  ['e1210n.nrf', 'anya-sihala', 'Milidaṭīkā'],
  ['e1211n.nrf', 'anya-sihala', 'Padamañjarī'],
  ['e1212n.nrf', 'anya-sihala', 'Padasādhanaṃ'],
  ['e1213n.nrf', 'anya-sihala', 'Saddabindupakaraṇaṃ'],
  ['e1214n.nrf', 'anya-sihala', 'Kaccāyanadhātumañjusā'],
  ['e1215n.nrf', 'anya-sihala', 'Samantakūṭavaṇṇanā'],
])

export const BOOKS: BookDef[] = [...MULA, ...ATTA, ...TIKA, ...ANYA].map(bk =>
  // books without a canonical key and without top level divs get a key from the title
  bk.key || /^(s0[1-4]|vin0[12]m|s05\d\dm)/.test(bk.id) ? bk : { ...bk, key: s(bk.coll, bk.title) })

export const collPrefix = (coll: Collection, key?: string) =>
  key?.startsWith('tika2-') ? 'tika2-' : COLL_PREFIX[coll]
