/**
 * npm run build:data [-- --xml <romn dir>] [--fixture] [--out <dir>]
 * Reads the CST romn/*.xml files (default .cache/tipitaka-xml/romn, fetched by npm run upstream) and writes
 * <out>/text.db, build-info.json, keys.txt (all keys, diffed against the previous build) and build-report.md.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCorpus } from './tree'
import { buildParaLinks } from './links'
import { writeDb } from './write-db'
import { validate } from './validate'
import { buildLegacyMap } from './legacy'
import { FIXTURE_BOOKS } from './fixture'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const fixture = args.includes('--fixture')

const xmlDir = arg('--xml') ?? (fixture ? path.join(repo, 'e2e/fixtures/xml') : path.join(repo, '.cache/tipitaka-xml/romn'))
const outDir = arg('--out') ?? (fixture ? path.join(repo, 'e2e/fixtures/db') : path.join(repo, 'db'))
fs.mkdirSync(outDir, { recursive: true })

const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

const corpus = buildCorpus(xmlDir, fixture ? { books: FIXTURE_BOOKS } : {})
log(`corpus: ${corpus.books.length} books, ${corpus.nodes.length} nodes, ${corpus.paras.length} paragraphs`)

const report = validate(corpus)
const linkWarnings: string[] = []
const links = buildParaLinks(corpus, path.join(repo, 'data/alignments'), linkWarnings)
log(`links: ${links.length}`)

const legacy = fixture ? { entries: [], unmapped: [] } : buildLegacyMap(corpus, path.join(repo, 'public'))
log(`legacy map: ${legacy.entries.length} entries, ${legacy.unmapped.length} unmapped`)

const upstreamLock = path.join(repo, 'data/upstream.lock')
const upstream = fs.existsSync(upstreamLock) ? fs.readFileSync(upstreamLock, 'utf8').trim() : 'unknown'
const hash = crypto.createHash('sha256')
for (const n of corpus.nodes) hash.update(n.key + '\0' + n.title + '\n')
for (const p of corpus.paras) hash.update(p.rend + '\0' + p.num + '\0' + p.text + '\n')
const contentHash = hash.digest('hex').slice(0, 16)
const now = new Date()
const dbVersion = now.toISOString().replace(/\D/g, '').slice(2, 10) // yyMMddHH
const meta = { content_hash: contentHash, db_version: dbVersion, upstream, built_at: now.toISOString(), fixture: fixture ? '1' : '0' }

const res = writeDb(path.join(outDir, 'text.db'), corpus, links, meta, legacy.entries)
log(`text.db: ${res.tokenCount} tokens, ${res.postingCount} postings`)
fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify({ ...meta, db_version: +dbVersion }, null, 2) + '\n')

// key list + diff against the previous build (keys are urls: removed keys need an override or a redirect)
const keysFile = path.join(outDir, 'keys.txt')
const keys = corpus.nodes.map(n => n.key)
const prevKeys = fs.existsSync(keysFile) ? new Set(fs.readFileSync(keysFile, 'utf8').split('\n').filter(Boolean)) : null
const removed = prevKeys ? [...prevKeys].filter(k => !corpus.keyToNode.has(k)) : []
const added = prevKeys ? keys.filter(k => !prevKeys.has(k)) : []
fs.writeFileSync(keysFile, keys.join('\n') + '\n')

const md = [
  `# Build report`, '',
  `upstream ${upstream} · content ${contentHash} · ${now.toISOString()}`, '',
  `| books | nodes | paragraphs | tokens | links | legacy |`, `|---|---|---|---|---|---|`,
  `| ${corpus.books.length} | ${corpus.nodes.length} | ${corpus.paras.length} | ${res.tokenCount} | ${links.length} | ${legacy.entries.length} (${legacy.unmapped.length} unmapped) |`, '',
  `## Key changes`, prevKeys ? `${added.length} added, ${removed.length} removed` : 'no previous build', '',
  ...removed.slice(0, 200).map(k => `- removed \`${k}\``), ...added.slice(0, 200).map(k => `- added \`${k}\``), '',
  `## Errors (${report.errors.length})`, ...report.errors.map(e => `- ${e}`), '',
  `## Warnings (${report.warnings.length + linkWarnings.length})`, ...[...report.warnings, ...linkWarnings].slice(0, 500).map(w => `- ${w}`), '',
  `## Unmapped legacy files (${legacy.unmapped.length})`, ...legacy.unmapped.slice(0, 200).map(u => `- ${u}`), '',
].join('\n')
fs.writeFileSync(path.join(outDir, 'build-report.md'), md)
log(`report: ${report.errors.length} errors, ${report.warnings.length} warnings -> ${path.relative(repo, outDir)}/build-report.md`)
if (report.errors.length) process.exit(1)
