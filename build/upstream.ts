/**
 * npm run upstream [-- --latest] [--dpd] [--dpd-latest]
 *
 * Fetches the pinned sources into .cache/ (never committed):
 *   VipassanaTech/tipitaka-xml  romn/ + tipitaka.org/romn/ at the commit in data/upstream.lock (sparse, shallow)
 *   digitalpalidictionary/dpd-db release asset dpd.db.tar.xz of the tag in data/dpd.lock (with --dpd)
 * --latest / --dpd-latest move the pins to the newest upstream commit / release first (used by the sync
 * workflow, which then builds, tests and opens a PR). Writes `xml_changed` / `dpd_changed` to $GITHUB_OUTPUT.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const XML_REPO = 'https://github.com/VipassanaTech/tipitaka-xml.git'
const DPD_API = 'https://api.github.com/repos/digitalpalidictionary/dpd-db/releases'
const cache = path.join(repo, '.cache')
const xmlDir = path.join(cache, 'tipitaka-xml')
const xmlLock = path.join(repo, 'data/upstream.lock')
const dpdLock = path.join(repo, 'data/dpd.lock')
const args = process.argv.slice(2)

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '')
function output(k: string, v: string) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
}

function syncXml(latest: boolean) {
  let sha = read(xmlLock)
  if (latest || !sha) {
    const head = execFileSync('git', ['ls-remote', XML_REPO, 'HEAD'], { encoding: 'utf8' }).split('\t')[0]
    output('xml_changed', String(head !== sha))
    console.log(head === sha ? `tipitaka-xml unchanged at ${sha}` : `tipitaka-xml ${sha || '(none)'} -> ${head}`)
    sha = head
    fs.writeFileSync(xmlLock, sha + '\n')
  }
  if (!fs.existsSync(path.join(xmlDir, '.git'))) {
    fs.mkdirSync(xmlDir, { recursive: true })
    git(xmlDir, 'init', '-q')
    git(xmlDir, 'remote', 'add', 'origin', XML_REPO)
    git(xmlDir, 'config', 'core.sparseCheckout', 'true')
    git(xmlDir, 'sparse-checkout', 'set', '--no-cone', 'romn/*', 'tipitaka.org/romn/*')
  }
  const current = fs.existsSync(path.join(xmlDir, '.git')) ? (() => { try { return git(xmlDir, 'rev-parse', 'HEAD') } catch { return '' } })() : ''
  if (current !== sha) {
    git(xmlDir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', sha)
    git(xmlDir, 'checkout', '-q', '--force', sha)
  }
  console.log(`tipitaka-xml at ${sha}: ${fs.readdirSync(path.join(xmlDir, 'romn')).length} files in romn/`)
}

async function syncDpd(latest: boolean) {
  let tag = read(dpdLock)
  if (latest || !tag) {
    const rel = await (await fetch(`${DPD_API}/latest`, { headers: { 'User-Agent': 'tipitaka.app' } })).json() as { tag_name: string }
    output('dpd_changed', String(rel.tag_name !== tag))
    console.log(rel.tag_name === tag ? `dpd unchanged at ${tag}` : `dpd ${tag || '(none)'} -> ${rel.tag_name}`)
    tag = rel.tag_name
    fs.writeFileSync(dpdLock, tag + '\n')
  }
  const dir = path.join(cache, 'dpd')
  const stamp = path.join(dir, 'tag')
  if (read(stamp) === tag && fs.existsSync(path.join(dir, 'dpd.db'))) { console.log(`dpd ${tag} present`); return }
  fs.mkdirSync(dir, { recursive: true })
  const url = `https://github.com/digitalpalidictionary/dpd-db/releases/download/${tag}/dpd.db.tar.xz`
  console.log(`downloading ${url}`)
  execFileSync('curl', ['-sSfL', '-o', path.join(dir, 'dpd.db.tar.xz'), url], { stdio: 'inherit' })
  execFileSync('tar', ['-xJf', 'dpd.db.tar.xz'], { cwd: dir, stdio: 'inherit' })
  fs.rmSync(path.join(dir, 'dpd.db.tar.xz'))
  fs.writeFileSync(stamp, tag)
}

if (!args.includes('--dpd-only')) syncXml(args.includes('--latest'))
if (args.includes('--dpd') || args.includes('--dpd-latest') || args.includes('--dpd-only')) await syncDpd(args.includes('--dpd-latest'))
