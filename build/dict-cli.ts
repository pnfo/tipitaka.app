/**
 * npm run build:dict [-- --fixture] [--dpd <dpd.db>]
 * Writes db/dict.db (or e2e/fixtures/db/dict.db with --fixture: the first rows of every source).
 * DPD: .cache/dpd/dpd.db, downloaded by `npm run upstream -- --dpd` (release in data/dpd.lock).
 * Dictionary sources: .cache/dicts, downloaded by `npm run upstream -- --dicts` (data/dicts.lock), and the
 * data/dicts/sinhala submodule (git submodule update --init). Build reports go to .cache/dicts/reports.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { buildDictDb } from './dict'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const fixture = args.includes('--fixture')
const outDir = fixture ? path.join(repo, 'e2e/fixtures/db') : path.join(repo, 'db')
fs.mkdirSync(outDir, { recursive: true })

const t0 = Date.now()
const meta = buildDictDb(path.join(outDir, 'dict.db'), {
  dictDir: path.join(repo, 'server-data/dicts'),
  cacheDir: path.join(repo, '.cache/dicts'),
  dataDir: path.join(repo, 'data'),
  textDb: path.join(outDir, 'text.db'),
  breakups: path.join(repo, 'server-data/db/breakups.db'),
  dpd: arg('--dpd') ?? path.join(repo, '.cache/dpd/dpd.db'),
  words: fixture ? fixtureWords() : undefined,
}, m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`))
console.log('dict.db written', meta)

function fixtureWords(): Set<string> {
  const db = new Database(path.join(outDir, 'text.db'), { readonly: true }) // npm run build:fixture first
  const words = new Set((db.prepare('SELECT w FROM token').all() as { w: string }[]).map(r => r.w))
  db.close()
  return words
}
