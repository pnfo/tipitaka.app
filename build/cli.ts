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
import { readLegacyMap } from './legacy'
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

const legacyWarnings: string[] = []
const legacy = readLegacyMap(corpus, path.join(repo, 'data/legacy-map.tsv'), legacyWarnings, fixture)
log(`legacy map: ${legacy.length} entries`)

const upstreamLock = path.join(repo, 'data/upstream.lock')
const upstream = fs.existsSync(upstreamLock) ? fs.readFileSync(upstreamLock, 'utf8').trim() : 'unknown'
const hash = crypto.createHash('sha256')
for (const n of corpus.nodes) hash.update(n.key + '\0' + n.title + '\n')
for (const p of corpus.paras) hash.update(p.rend + '\0' + p.num + '\0' + p.text + '\n')
const contentHash = hash.digest('hex').slice(0, 16)
const now = new Date()
const dbVersion = now.toISOString().replace(/\D/g, '').slice(2, 10) // yyMMddHH
const meta = { content_hash: contentHash, db_version: dbVersion, upstream, built_at: now.toISOString(), fixture: fixture ? '1' : '0' }

const res = writeDb(path.join(outDir, 'text.db'), corpus, links, meta, legacy)
log(`text.db: ${res.tokenCount} tokens, ${res.postingCount} postings`)
fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify({ ...meta, db_version: +dbVersion }, null, 2) + '\n')

// data/nodes.tsv (committed): every key with a hash of its own text. The upstream sync PR diff shows which
// texts changed; removed keys break published urls and fail the build unless they get a KEY_OVERRIDES entry.
const ownHash = new Map<number, ReturnType<typeof crypto.createHash>>()
for (const p of corpus.paras) {
  let h = ownHash.get(p.node)
  if (!h) ownHash.set(p.node, (h = crypto.createHash('sha1')))
  h.update(p.rend + '\0' + p.num + '\0' + p.text + '\n')
}
const rows = corpus.nodes.map(n => `${n.key}\t${ownHash.get(n.idx)?.digest('hex').slice(0, 10) ?? '-'}\t${n.title}`)
const nodesFile = fixture ? path.join(outDir, 'nodes.tsv') : path.join(repo, 'data/nodes.tsv')
const prev = new Map<string, string>()
if (fs.existsSync(nodesFile)) for (const l of fs.readFileSync(nodesFile, 'utf8').split('\n')) { const [k, h] = l.split('\t'); if (k && !k.startsWith('#')) prev.set(k, h) }
const removed = prev.size ? [...prev.keys()].filter(k => !corpus.keyToNode.has(k)) : []
const added = prev.size ? corpus.nodes.map(n => n.key).filter(k => !prev.has(k)) : []
const changed = prev.size ? rows.map(r => r.split('\t')).filter(([k, h]) => prev.has(k) && prev.get(k) !== h).map(([k, , t]) => `${k} ${t}`) : []
fs.writeFileSync(nodesFile, ['# key, hash of the node text (without children), title - written by npm run build:data', ...rows].join('\n') + '\n')
if (removed.length && !args.includes('--allow-removed')) report.errors.push(`${removed.length} published keys were removed (add KEY_OVERRIDES or run with --allow-removed): ${removed.slice(0, 20).join(', ')}`)

const md = [
  `# Build report`, '',
  `upstream ${upstream} · content ${contentHash} · ${now.toISOString()}`, '',
  `| books | nodes | paragraphs | tokens | links | legacy |`, `|---|---|---|---|---|---|`,
  `| ${corpus.books.length} | ${corpus.nodes.length} | ${corpus.paras.length} | ${res.tokenCount} | ${links.length} | ${legacy.length} |`, '',
  `## Changes`, prev.size ? `${changed.length} texts changed, ${added.length} keys added, ${removed.length} removed` : 'no previous build', '',
  ...removed.slice(0, 100).map(k => `- removed \`${k}\``), ...added.slice(0, 100).map(k => `- added \`${k}\``),
  ...changed.slice(0, 200).map(k => `- changed ${k}`), '',
  `## Errors (${report.errors.length})`, ...report.errors.map(e => `- ${e}`), '',
  `## Warnings (${report.warnings.length + linkWarnings.length + legacyWarnings.length})`,
  ...[...report.warnings, ...linkWarnings, ...legacyWarnings].slice(0, 500).map(w => `- ${w}`), '',
].join('\n')
fs.writeFileSync(path.join(outDir, 'build-report.md'), md)
log(`report: ${report.errors.length} errors, ${report.warnings.length} warnings -> ${path.relative(repo, outDir)}/build-report.md`)
if (report.errors.length) process.exit(1)
