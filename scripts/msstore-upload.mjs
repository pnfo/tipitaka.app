// Submits a new MSIX of Tipitaka.app to the Microsoft Store (Partner Center submission API):
//   node scripts/msstore-upload.mjs <tipitaka_app-x.y.z.msix> --notes <file> [--manual] [--dry-run]
// A new submission (a copy of the published one) gets the package (the old ones are removed) and the release notes in
// every listing, then it is committed: certification, then published right away (--manual: held until "Publish now"
// in Partner Center). --dry-run: creates and updates the submission, uploads nothing and deletes it again.
// Keys: MS_STORE_TENANT_ID, MS_STORE_CLIENT_ID, MS_STORE_CLIENT_SECRET in the environment or in MS_STORE_ENV
// (default /Volumes/2TB/node/api-keys/.env.windows).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const APP_ID = '9NLD3HJBZ9BX' // Tipitaka.app (the account also has Tipitaka.lk and Pitaka.lk)
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const msix = args[0], notesFile = opt('--notes'), manual = args.includes('--manual'), dryRun = args.includes('--dry-run')
if (!msix?.endsWith('.msix') || !notesFile || !existsSync(msix)) { console.error('usage: node scripts/msstore-upload.mjs <app.msix> --notes <file> [--manual] [--dry-run]'); process.exit(1) }
const notes = readFileSync(notesFile, 'utf8').trim()

const envFile = process.env.MS_STORE_ENV ?? '/Volumes/2TB/node/api-keys/.env.windows'
const env = { ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {}), ...process.env }
const tr = await fetch(`https://login.microsoftonline.com/${env.MS_STORE_TENANT_ID}/oauth2/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.MS_STORE_CLIENT_ID, client_secret: env.MS_STORE_CLIENT_SECRET, resource: 'https://manage.devcenter.microsoft.com' }) })
const { access_token: tok } = await tr.json()
if (!tok) throw new Error('no Partner Center token: check the MS_STORE_* keys')
const API = `https://manage.devcenter.microsoft.com/v1.0/my/applications/${APP_ID}`
async function call(method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 1500)}`)
  return t ? JSON.parse(t) : {}
}

const app = await call('GET', '')
if (app.pendingApplicationSubmission) throw new Error(`a submission is already pending (${app.pendingApplicationSubmission.id}): finish or delete it in Partner Center first`)
const sub = await call('POST', '/submissions')
console.log(`submission ${sub.id} (copy of the published one)`)
let committed = false
try {
  const fileName = basename(msix)
  for (const p of sub.applicationPackages ?? []) p.fileStatus = 'PendingDelete'
  sub.applicationPackages = [...(sub.applicationPackages ?? []), { fileName, fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' }]
  for (const l of Object.values(sub.listings ?? {})) if (l.baseListing) l.baseListing.releaseNotes = notes
  sub.targetPublishMode = manual ? 'Manual' : 'Immediate'
  await call('PUT', `/submissions/${sub.id}`, sub)
  console.log(`package ${fileName}, release notes in ${Object.keys(sub.listings ?? {}).join(', ')}, publish ${sub.targetPublishMode}`)
  if (dryRun) { console.log('dry run: not uploaded, the submission is deleted'); process.exitCode = 0 }
  else {
    // the package goes in a zip (stored: the msix is compressed) to the submission's blob, in 8 MB blocks
    const dir = mkdtempSync(join(tmpdir(), 'msstore-')), zip = join(dir, 'package.zip')
    execFileSync('zip', ['-0', '-j', '-q', zip, msix])
    const size = statSync(zip).size, BLOCK = 8 << 20, ids = [], fd = openSync(zip, 'r')
    console.log(`uploading ${(size / 1e6).toFixed(0)} MB`)
    for (let off = 0, n = 0; off < size; off += BLOCK, n++) {
      const buf = Buffer.alloc(Math.min(BLOCK, size - off)); readSync(fd, buf, 0, buf.length, off)
      const id = Buffer.from(String(n).padStart(6, '0')).toString('base64'); ids.push(id)
      for (let attempt = 1; ; attempt++) {
        const r = await fetch(`${sub.fileUploadUrl}&comp=block&blockid=${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'x-ms-version': '2021-08-06' }, body: buf })
        if (r.ok) break
        if (attempt === 3) throw new Error(`block ${n}: ${r.status} ${await r.text()}`)
      }
      if (n % 8 === 7) process.stdout.write(`  ${Math.round((off + buf.length) / size * 100)}%\n`)
    }
    closeSync(fd)
    const list = `<?xml version="1.0" encoding="utf-8"?><BlockList>${ids.map(i => `<Latest>${i}</Latest>`).join('')}</BlockList>`
    const r = await fetch(`${sub.fileUploadUrl}&comp=blocklist`, { method: 'PUT', headers: { 'x-ms-version': '2021-08-06', 'x-ms-blob-content-type': 'application/zip' }, body: list })
    if (!r.ok) throw new Error(`block list: ${r.status} ${await r.text()}`)
    rmSync(dir, { recursive: true, force: true })
    await call('POST', `/submissions/${sub.id}/commit`)
    committed = true
    // processing takes a few minutes; certification then runs for hours to days
    for (let i = 0; i < 60; i++) {
      const s = await call('GET', `/submissions/${sub.id}/status`)
      if (s.status !== 'CommitStarted') {
        console.log(`status ${s.status}`, s.statusDetails?.errors?.length ? JSON.stringify(s.statusDetails.errors) : '')
        if (/Failed/.test(s.status)) process.exitCode = 1
        break
      }
      await new Promise(res => setTimeout(res, 30000))
    }
  }
} finally {
  if (!committed) await call('DELETE', `/submissions/${sub.id}`).catch(e => console.error('could not delete the submission:', e.message))
}
