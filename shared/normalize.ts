/**
 * Search normalisation (Roman script). Must match server/engine/normalize.go (shared golden vectors).
 *  - fold():   diacritic-insensitive form, so that "dhamma" finds dhammā / dhammaṃ (ā->a, ṃ->m, ñ->n, ṭ->t ...)
 *  - reverse(): reversed token, indexed so that suffix queries (*ssa) are prefix lookups
 */

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function reverse(s: string): string {
  return Array.from(s).reverse().join('')
}

/** true when the user typed diacritics (then the exact column is searched, otherwise the folded one) */
export function hasDiacritics(s: string): boolean {
  return fold(s) !== s.toLowerCase()
}

/** title slug used for keys of non canonical books (anya-*, some ṭīkā) */
export function slug(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
