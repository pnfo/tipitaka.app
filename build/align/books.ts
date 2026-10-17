/**
 * Which books comment on which, where the book ids do not tell (stems: s0101a.att → s0101m.mul, s0101t.tik →
 * s0101a.att). Checked against the books the commentaries' long lemma words occur in (votedBooks in index.ts):
 * e.g. 47% of the Vinayavinicchaya-ṭīkā's distinctive lemmas are in vin10t.nrf, 67% of the Pañcapakaraṇa-anuṭīkā's in
 * abh03t.tik. The CST ṭīkā collection also holds base texts (Vinayavinicchaya, Abhidhammāvatāra, Abhidhammatthasaṅgaha)
 * (those are not aligned) and books with their own commentary inside (SELF_COMMENTARY).
 */
export const COMMENTS_ON: Record<string, string[]> = {
  'vin04t.nrf': ['vin01m.mul', 'vin02m1.mul'], // Kaṅkhāvitaraṇī on the Pātimokkha (the sikkhāpadas of the vibhaṅgas)
  'vin08t.nrf': ['vin05t.nrf'], // Vinayālaṅkāra-ṭīkā on the Vinayasaṅgaha
  'vin09t.nrf': ['vin04t.nrf'], // Kaṅkhāvitaraṇī-purāṇaṭīkā
  'vin11t.nrf': ['vin10t.nrf'], // Vinayavinicchaya-ṭīkā
  's0501t.nrf': ['s0519m.mul', 's0519a.att'], // Nettivibhāvinī on the Netti
  'abh04t.nrf': ['abh01t.tik'], // Dhammasaṅgaṇī-anuṭīkā on the mūlaṭīkā
  'abh05t.nrf': ['abh03t.tik'], // Pañcapakaraṇa-anuṭīkā
  'abh08t.nrf': ['abh06t.nrf'], // Abhidhammāvatāra-purāṇaṭīkā
  'e0103n.att': ['e0101n.mul'], // Visuddhimagga-mahāṭīkā
  'e0301n.nrf': ['abh07t.nrf'], // Paramatthadīpanī on the Abhidhammatthasaṅgaha
  'e0810n.nrf': ['e0809n.nrf'], // Abhidhānappadīpikā-ṭīkā
  'e0812n.nrf': ['e0811n.nrf'], // Subodhālaṅkāra-ṭīkā
}

/** books of the ṭīkā collection that are not commentaries */
export const NOT_COMMENTARY = new Set(['vin10t.nrf', 'abh06t.nrf'])

/**
 * books with a root text and its commentary in one file: commentary part (node key) → the parts it explains.
 * Only the commentary parts are aligned, against the root text parts of the same book.
 */
export const SELF_COMMENTARY: Record<string, Record<string, string[]>> = {
  // Abhidhammatthasaṅgaha and the Abhidhammatthavibhāvinī-ṭīkā
  'abh07t.nrf': { 'tika-abhidhammatthasangaho-9a': ['0', '0a', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `tika-abhidhammatthasangaho-${k}`) },
  // Khuddasikkhā with its purāṇa- and abhinavaṭīkā, Mūlasikkhā with its ṭīkā
  'vin13t.nrf': {
    'tika-khuddasikkha-mulasikkha-2': ['tika-khuddasikkha-mulasikkha-1'],
    'tika-khuddasikkha-mulasikkha-3': ['tika-khuddasikkha-mulasikkha-1'],
    'tika-khuddasikkha-mulasikkha-5': ['tika-khuddasikkha-mulasikkha-4'],
  },
  // Abhidhammamātikā and the Mohavicchedanī
  'abh09t.nrf': { 'tika-abhidhammamatikapali-7a': ['1', '2', '3', '4', '5', '6', '7'].map(k => `tika-abhidhammamatikapali-${k}`) },
}

export const isCommentary = (def: { id: string; coll: string }) =>
  (def.coll === 'atta' || def.coll === 'tika' || def.id in COMMENTS_ON) && !NOT_COMMENTARY.has(def.id)
