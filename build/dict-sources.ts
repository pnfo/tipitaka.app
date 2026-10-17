/**
 * External dictionary sources, pinned in data/dicts.lock and downloaded into .cache/dicts/<name>/ (never committed).
 *
 *  - url sources (ancient-buddhist-texts.net): pinned by sha256; --dicts-latest accepts a changed file and moves the pin
 *  - github sources: pinned by commit; --dicts-latest moves the pin to the branch head
 * .tar.zst files are unpacked next to the download. Writes `dicts_changed` to $GITHUB_OUTPUT.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface DictSource {
  url?: string
  repo?: string; commit?: string; path?: string
  sha256?: string
  desc: string
}
export type DictLock = Record<string, DictSource>

const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '')
const sha256 = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex')
export const sourceUrl = (s: DictSource) => s.url ?? `https://raw.githubusercontent.com/${s.repo}/${s.commit}/${s.path}`
export const sourceFile = (cacheDir: string, name: string, s: DictSource) => path.join(cacheDir, name, path.basename(s.url ?? s.path!))

export function readDictLock(file: string): DictLock {
  return JSON.parse(read(file) || '{}') as DictLock
}

function headCommit(repo: string): string {
  return execFileSync('git', ['ls-remote', `https://github.com/${repo}.git`, 'HEAD'], { encoding: 'utf8' }).split('\t')[0]
}

function download(url: string, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  console.log(`downloading ${url}`)
  execFileSync('curl', ['-sSfL', '-A', 'tipitaka.app', '-o', file + '.part', url], { stdio: 'inherit' })
  fs.renameSync(file + '.part', file)
}

/** downloads (and with latest: re-pins) every source of the lock; returns whether a pin moved */
export function syncDicts(lockFile: string, cacheDir: string, latest: boolean, output: (k: string, v: string) => void = () => {}): boolean {
  const lock = readDictLock(lockFile)
  let changed = false
  for (const [name, s] of Object.entries(lock)) {
    if (latest && s.repo) {
      const head = headCommit(s.repo)
      if (head !== s.commit) { console.log(`${name}: ${s.commit} -> ${head}`); s.commit = head; s.sha256 = undefined; changed = true }
    }
    const file = sourceFile(cacheDir, name, s)
    const have = fs.existsSync(file) ? sha256(file) : ''
    if (!have || have !== s.sha256 || latest) {
      download(sourceUrl(s), file)
      const got = sha256(file)
      if (s.sha256 && got !== s.sha256) {
        if (!latest) throw new Error(`${name}: sha256 ${got} != pinned ${s.sha256} (run npm run upstream -- --dicts-latest to accept)`)
        console.log(`${name}: new content ${got}`)
        changed = true
      }
      if (!s.sha256) changed = true
      s.sha256 = got
      if (file.endsWith('.tar.zst')) execFileSync('tar', ['--zstd', '-xf', path.basename(file)], { cwd: path.dirname(file), stdio: 'inherit' })
    } else console.log(`${name} present`)
  }
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n')
  output('dicts_changed', String(changed))
  return changed
}
