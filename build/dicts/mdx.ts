/**
 * A reader of MDict .mdx files (format 2.0, UTF-8, zlib or uncompressed blocks, key index encrypted or not):
 * the (key, html) records, in file order. After readmdict.py (Xiaoqiang Wang).
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const rol = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0
const R = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2]
const RR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14]
const S = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12]
const SS = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8]
const F = [(x: number, y: number, z: number) => x ^ y ^ z, (x: number, y: number, z: number) => (x & y) | (~x & z),
  (x: number, y: number, z: number) => (x | ~y) ^ z, (x: number, y: number, z: number) => (x & z) | (y & ~z)]
const K = [0, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc], KK = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0]

/** RIPEMD-128 digest */
export function ripemd128(msg: Uint8Array): Uint8Array {
  const len = msg.length
  const padded = new Uint8Array(((len + 8) >> 6) * 64 + 64)
  padded.set(msg)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, (len * 8) >>> 0, true)
  dv.setUint32(padded.length - 4, Math.floor((len * 8) / 2 ** 32), true)
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476
  for (let off = 0; off < padded.length; off += 64) {
    const X = Array.from({ length: 16 }, (_, i) => dv.getUint32(off + i * 4, true))
    let a = h0, b = h1, c = h2, d = h3, aa = h0, bb = h1, cc = h2, dd = h3
    for (let j = 0; j < 64; j++) {
      const r = j >> 4
      let t = rol((a + F[r](b, c, d) + X[R[j]] + K[r]) >>> 0, S[j])
      a = d; d = c; c = b; b = t
      t = rol((aa + F[3 - r](bb, cc, dd) + X[RR[j]] + KK[r]) >>> 0, SS[j])
      aa = dd; dd = cc; cc = bb; bb = t
    }
    const t = (h1 + c + dd) >>> 0
    h1 = (h2 + d + aa) >>> 0
    h2 = (h3 + a + bb) >>> 0
    h3 = (h0 + b + cc) >>> 0
    h0 = t
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ;[h0, h1, h2, h3].forEach((h, i) => ov.setUint32(i * 4, h, true))
  return out
}

function fastDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  let prev = 0x36
  for (let i = 0; i < data.length; i++) {
    let t = ((data[i] >> 4) | (data[i] << 4)) & 0xff
    t = t ^ prev ^ (i & 0xff) ^ key[i % key.length]
    prev = data[i]
    out[i] = t
  }
  return out
}

function block(buf: Buffer): Buffer {
  const type = buf.readUInt32LE(0)
  if (type === 0) return buf.subarray(8)
  if (type === 2) return zlib.inflateSync(buf.subarray(8))
  throw new Error(`mdx: unsupported block compression ${type}`)
}

export function readMdx(file: string): { header: Record<string, string>; records: [string, string][] } {
  const b = fs.readFileSync(file)
  let p = 0
  const u64 = () => { const v = Number(b.readBigUInt64BE(p)); p += 8; return v }
  const hlen = b.readUInt32BE(0)
  const headerText = b.subarray(4, 4 + hlen).toString('utf16le')
  const header: Record<string, string> = {}
  for (const m of headerText.matchAll(/(\w+)="([^"]*)"/g)) header[m[1]] = m[2]
  if (Number(header.GeneratedByEngineVersion) < 2) throw new Error('mdx: only format 2.0 is read')
  if ((header.Encoding || 'UTF-8').toUpperCase() !== 'UTF-8') throw new Error('mdx: only UTF-8 is read')
  const encrypted = Number(header.Encrypted || 0)
  if (encrypted & 1) throw new Error('mdx: record encryption needs a registration key')
  p = 4 + hlen + 4

  // key blocks
  const numKeyBlocks = u64(); u64() // entries
  u64() // key block info, decompressed size
  const infoSize = u64(), keyBlocksSize = u64()
  p += 4 // adler32
  let info = b.subarray(p, p + infoSize)
  p += infoSize
  if (encrypted & 2) {
    const key = ripemd128(Buffer.concat([info.subarray(4, 8), Buffer.from([0x95, 0x36, 0, 0])]))
    info = Buffer.concat([info.subarray(0, 8), Buffer.from(fastDecrypt(info.subarray(8), key))])
  }
  const infoData = block(info)
  const sizes: number[] = []
  let q = 0
  for (let i = 0; i < numKeyBlocks; i++) {
    q += 8 // entries
    q += infoData.readUInt16BE(q) + 1 + 2 // first key (+ terminator)
    q += infoData.readUInt16BE(q) + 1 + 2 // last key
    sizes.push(Number(infoData.readBigUInt64BE(q)))
    q += 16 // compressed, decompressed size
  }
  const keys: { offset: number; key: string }[] = []
  let kp = p
  for (const size of sizes) {
    const kb = block(b.subarray(kp, kp + size))
    kp += size
    for (let i = 0; i < kb.length;) {
      const offset = Number(kb.readBigUInt64BE(i))
      i += 8
      const end = kb.indexOf(0, i)
      keys.push({ offset, key: kb.subarray(i, end).toString('utf8') })
      i = end + 1
    }
  }
  p += keyBlocksSize

  // record blocks
  const numRecordBlocks = u64(); u64(); u64(); u64()
  const recSizes: number[] = []
  for (let i = 0; i < numRecordBlocks; i++) { recSizes.push(u64()); u64() }
  const data = Buffer.concat(recSizes.map(size => { const r = block(b.subarray(p, p + size)); p += size; return r }))
  const records: [string, string][] = keys.map((k, i) => {
    const end = i + 1 < keys.length ? keys[i + 1].offset : data.length
    return [k.key, data.subarray(k.offset, end).toString('utf8').replace(/\0+$/, '')]
  })
  return { header, records }
}
