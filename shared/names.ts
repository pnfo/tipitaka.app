/**
 * The categories (DPD family sets, DPPN nouns) of a name that only say its type again ("place names" of a place,
 * "names of deities" of a deity): not shown next to the type (web name pages; build/names/translations.ts).
 */
const GENERIC = new Set(['place names', 'DPPN: place', 'DPPN: person', 'names of deities', 'DPPN: deity', 'DPPN: deities',
  'people', 'DPPN: people', 'DPPN: group', 'names of animals', 'DPPN: animal'])

/** the family list without the categories that repeat the type */
export const shownFamily = (family = '') => family.split('; ').filter(p => p && !GENERIC.has(p)).join('; ')
