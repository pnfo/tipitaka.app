/**
 * The fixture corpus used by the unit, Go and e2e tests: truncated copies of a few upstream files in
 * e2e/fixtures/xml (made by `tsx build/make-fixtures.ts`, committed so tests do not need the upstream repo).
 */
import { BOOKS, type BookDef } from './catalog'

export const FIXTURE_FILES = ['s0101m.mul.xml', 's0101a.att.xml', 's0101t.tik.xml', 's0201m.mul.xml', 's0502m.mul.xml', 's0502a.att.xml', 'vin01m.mul.xml', 'e0101n.mul.xml']

export const FIXTURE_BOOKS: BookDef[] = BOOKS
  .filter(b => b.files.some(f => FIXTURE_FILES.includes(f)))
  .map(b => ({ ...b, files: b.files.filter(f => FIXTURE_FILES.includes(f)) }))
