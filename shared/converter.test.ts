/** Script conversion goldens: the JS converter output for every script, also checked by the Go SSR
 * converter (server/convert/convert_test.go reads golden.json written here). */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convert } from '@pnfo/pali-converter'
import { SCRIPTS } from './scripts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INPUTS = [
  'Evaṃ me sutaṃ – ekaṃ samayaṃ bhagavā antarā ca rājagahaṃ antarā ca nāḷandaṃ addhānamaggappaṭipanno hoti.',
  'Namo tassa bhagavato arahato sammāsambuddhassa',
  '1. Brahmajālasuttaṃ',
  '‘‘acchariyaṃ, āvuso, abbhutaṃ, āvuso’’ti? ñāṇadassanaṃ, paṭiccasamuppādo, khandhā, iddhi, saṅgha, upagañchi (sī. syā. kaṃ. pī.)',
  'Manopubbaṅgamā dhammā, manoseṭṭhā manomayā; 1-12.',
]

describe('converter', () => {
  it('converts to every script and writes the goldens for Go', () => {
    const golden = INPUTS.map(input => ({ in: input, out: Object.fromEntries(SCRIPTS.filter(s => s.code !== 'latn').map(s => [s.code, convert(input, s.code, 'latn')])) }))
    for (const g of golden) for (const [code, out] of Object.entries(g.out)) expect(out, code).not.toBe(g.in)
    fs.writeFileSync(path.join(repo, 'server/convert/golden.json'), JSON.stringify(golden, null, 1) + '\n')
  })
  it('round trips Sinhala', () => {
    for (const input of INPUTS) {
      const sinh = convert(input, 'sinh', 'latn')
      expect(convert(convert(sinh, 'latn', 'sinh'), 'sinh', 'latn')).toBe(sinh)
    }
  })
})
