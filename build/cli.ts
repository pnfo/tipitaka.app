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
import { buildParaLinks, type ParaLink } from './links'
import { alignCommentaries } from './align'
import { readDecisions } from './align/decisions'
import { reportSection, updateCoverage } from './align/report'
import { writeDb } from './write-db'
import { validate } from './validate'
import { readLegacyMap } from './legacy'
import { FIXTURE_BOOKS } from './fixture'
import { readGazetteer } from './names/gazetteer'
import { readNameTranslations } from './names/translations'
import { extractSettings } from './names/settings'
import { extractMentions, readMentionDecisions, readVerdicts } from './names/mentions'

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
const anchors = buildParaLinks(corpus, path.join(repo, 'data/alignments'), linkWarnings)
// the fixture db does not use the stored decisions: tests must not change when AI runs add some
const align = alignCommentaries(corpus, anchors, { decisions: fixture ? [] : readDecisions(path.join(repo, 'data/alignments')) })
linkWarnings.push(...align.warnings)
// paragraph links: paranum / manual anchors, then the ones derived from the glosses (every explained paragraph)
const seenLinks = new Set<string>()
const links: ParaLink[] = [...anchors, ...align.links].filter(l => {
  const k = `${l.fromBook}:${l.fromIdx}:${l.toBook}:${l.toIdx}`
  return !seenLinks.has(k) && !!seenLinks.add(k)
})
log(`links: ${anchors.length} anchors, ${links.length} with glosses; ${align.glosses.length} glosses`)
if (!fixture) updateCoverage(path.join(repo, 'data/align-coverage.tsv'), corpus, align.stats, linkWarnings)

// proper names: the settings of the suttas and stories (data/names, written by npm run names:gazetteer)
const gazetteer = readGazetteer(path.join(repo, 'data/names'))
const settings = extractSettings(corpus, gazetteer, anchors)
// the mentions: the fixture db does not use the AI verdicts and decisions (tests must not change when runs add some)
const namesDir = path.join(repo, 'data/names')
const nameTexts = readNameTranslations(namesDir)
const mentioned = extractMentions(corpus, gazetteer, fixture ? new Map() : readVerdicts(namesDir), fixture ? [] : readMentionDecisions(namesDir))
log(`names: ${gazetteer.entities.size} names, ${settings.length} settings, ${mentioned.mentions.length} mentions (${mentioned.stats.pending} words undecided)`)
if (mentioned.stats.brokenDecisions) linkWarnings.push(`${mentioned.stats.brokenDecisions} name decisions (data/names/decisions) no longer resolve`)

const legacyWarnings: string[] = []
const legacy = readLegacyMap(corpus, path.join(repo, 'data/legacy-map.tsv'), legacyWarnings, fixture)
log(`legacy map: ${legacy.length} entries`)

const upstreamLock = path.join(repo, 'data/upstream.lock')
const upstream = fs.existsSync(upstreamLock) ? fs.readFileSync(upstreamLock, 'utf8').trim() : 'unknown'
const hash = crypto.createHash('sha256')
for (const n of corpus.nodes) hash.update(n.key + '\0' + n.title + '\n')
for (const p of corpus.paras) hash.update(p.rend + '\0' + p.num + '\0' + p.text + '\n')
// and everything derived that goes into the db: the links, the commentary alignment, the names (they change without the
// text: the deploy names the db by this hash, the clients version their api cache by it)
for (const l of links) hash.update(`${l.fromBook},${l.fromIdx},${l.toBook},${l.toIdx},${l.kind},${l.source}\n`)
for (const g of align.glosses) hash.update(`${g.kind},${g.src},${g.cBook},${g.cIdx},${g.cS},${g.cEIdx},${g.cE},${g.tBook},${g.tIdx},${g.tS},${g.tEIdx},${g.tE}\n`)
for (const e of gazetteer.entities.values()) hash.update(`${e.slug},${e.type},${e.lemma},${e.meaning},${e.lat ?? ''},${e.lon ?? ''},${e.prec ?? ''}\n`)
for (const [lang, t] of nameTexts) for (const [en, tr] of [...t.meaning, ...t.family]) hash.update(`${lang},${en},${tr}\n`)
for (const x of settings) hash.update(`${x.entity},${x.role},${x.book},${x.start},${x.end},${x.source}\n`)
for (const m of mentioned.mentions) hash.update(`${m.entity},${m.book},${m.idx},${m.s},${m.amb}\n`)
const contentHash = hash.digest('hex').slice(0, 16)
const now = new Date()
const dbVersion = now.toISOString().replace(/\D/g, '').slice(2, 10) // yyMMddHH
const meta = { content_hash: contentHash, db_version: dbVersion, upstream, built_at: now.toISOString(), fixture: fixture ? '1' : '0' }

const res = writeDb(path.join(outDir, 'text.db'), corpus, links, meta, legacy, align.glosses, { gazetteer, settings, mentions: mentioned.mentions, translations: nameTexts })
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
  ...reportSection(corpus, align.stats, align.glosses.length),
  `## Errors (${report.errors.length})`, ...report.errors.map(e => `- ${e}`), '',
  `## Warnings (${report.warnings.length + linkWarnings.length + legacyWarnings.length})`,
  ...[...report.warnings, ...linkWarnings, ...legacyWarnings].slice(0, 500).map(w => `- ${w}`), '',
].join('\n')
fs.writeFileSync(path.join(outDir, 'build-report.md'), md)
log(`report: ${report.errors.length} errors, ${report.warnings.length} warnings -> ${path.relative(repo, outDir)}/build-report.md`)
if (report.errors.length) process.exit(1)
