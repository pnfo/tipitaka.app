/**
 * tsx build/make-fixtures.ts - writes truncated copies of the fixture files (build/fixture.ts) to
 * e2e/fixtures/xml (UTF-16LE like upstream). The parser tolerates unclosed divs at the end.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readUtf16 } from './xml'
import { FIXTURE_FILES } from './fixture'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = process.argv[2] ?? path.join(repo, '.cache/tipitaka-xml/romn')
const out = path.join(repo, 'e2e/fixtures/xml')
const LIMITS: Record<string, number> = { 's0101m.mul.xml': 400, 's0101a.att.xml': 700, 's0101t.tik.xml': 500, 's0502m.mul.xml': 2000 }

fs.mkdirSync(out, { recursive: true })
for (const f of FIXTURE_FILES) {
  const xml = readUtf16(path.join(src, f))
  const limit = LIMITS[f] ?? 250
  let pos = 0
  for (let n = 0; n < limit; n++) {
    const i = xml.indexOf('</p>', pos)
    if (i < 0) { pos = xml.length; break }
    pos = i + 4
  }
  const cut = pos >= xml.length ? xml : xml.slice(0, pos) + '\r\n</body></text></TEI.2>\r\n'
  fs.writeFileSync(path.join(out, f), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(cut, 'utf16le')]))
  console.log(f, cut.length)
}
