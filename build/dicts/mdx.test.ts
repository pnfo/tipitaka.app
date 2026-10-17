import { describe, expect, it } from 'vitest'
import { ripemd128 } from './mdx'

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

describe('ripemd128', () => {
  it('matches the test vectors', () => {
    expect(hex(ripemd128(new Uint8Array()))).toBe('cdf26213a150dc3ecb610f18f6b38b46')
    expect(hex(ripemd128(Buffer.from('abc')))).toBe('c14a12199c66e4ba84636b0f69144c77')
    expect(hex(ripemd128(Buffer.from('abcdefghijklmnopqrstuvwxyz')))).toBe('fd2aa607f71dc8f510714922b371834e')
    expect(hex(ripemd128(Buffer.from('1234567890'.repeat(8))))).toBe('3f45ef194732c2dbb2c4a2c769795fa3')
  })
})
