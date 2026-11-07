// Uploads an Android App Bundle to Google Play and releases it on a track (Google Play Developer API, edits):
//   node scripts/play-upload.mjs <app.aab> --notes <file> [--track production] [--fraction 0.2] [--draft] [--dry-run]
// --fraction: a staged rollout (inProgress) to that share of users; --draft: the release stays a draft in the Console;
// --dry-run: uploads and validates the edit, then deletes it (nothing is published).
// Key: the service account json in PLAY_KEY (default /Volumes/2TB/node/api-keys/play-console-api-key.json).
import { execFileSync } from 'node:child_process'
import { createSign } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

const PKG = 'app.tipitaka.main'
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const aab = args[0], notesFile = opt('--notes'), track = opt('--track') ?? 'production', fraction = opt('--fraction')
const draft = args.includes('--draft'), dryRun = args.includes('--dry-run')
if (!aab?.endsWith('.aab') || !notesFile) { console.error('usage: node scripts/play-upload.mjs <app.aab> --notes <file> [--track t] [--fraction f] [--draft] [--dry-run]'); process.exit(1) }
const notes = readFileSync(notesFile, 'utf8').trim()
if (notes.length > 500) throw new Error(`release notes are ${notes.length} characters, Play allows 500`)

const key = JSON.parse(readFileSync(process.env.PLAY_KEY ?? '/Volumes/2TB/node/api-keys/play-console-api-key.json', 'utf8'))
async function token() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: key.token_uri, iat: now, exp: now + 3600 })}`
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')}`
  const r = await fetch(key.token_uri, { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })
  const j = await r.json()
  if (!j.access_token) throw new Error('token: ' + JSON.stringify(j))
  return j.access_token
}
const tok = await token()
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`
async function call(method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 1500)}`)
  return t ? JSON.parse(t) : {}
}

const edit = await call('POST', '/edits')
let committed = false
try {
  const { defaultLanguage } = await call('GET', `/edits/${edit.id}/details`)
  // resumable upload (the bundle with the database asset pack is ~270 MB)
  const size = statSync(aab).size
  console.log(`uploading ${aab} (${(size / 1e6).toFixed(0)} MB) to edit ${edit.id}`)
  const start = await fetch(`https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/bundles?uploadType=resumable`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(size) } })
  if (!start.ok) throw new Error(`upload start ${start.status} ${await start.text()}`)
  // curl: Google answers only after processing the bundle, which takes longer than fetch's 5 minute headers timeout
  const out = execFileSync('curl', ['-sS', '-X', 'PUT', '-H', 'Content-Type: application/octet-stream', '--upload-file', aab,
    '-w', '\n%{http_code}', start.headers.get('location')], { encoding: 'utf8', maxBuffer: 1 << 24 })
  const status = Number(out.slice(out.lastIndexOf('\n') + 1)), body = out.slice(0, out.lastIndexOf('\n'))
  if (status !== 200) throw new Error(`upload ${status} ${body.slice(0, 1500)}`)
  const bundle = JSON.parse(body)
  console.log(`uploaded versionCode ${bundle.versionCode} (sha256 ${bundle.sha256?.slice(0, 12)})`)

  const release = { versionCodes: [String(bundle.versionCode)], releaseNotes: [{ language: defaultLanguage, text: notes }],
    status: draft ? 'draft' : fraction ? 'inProgress' : 'completed', ...(fraction && !draft ? { userFraction: Number(fraction) } : {}) }
  await call('PUT', `/edits/${edit.id}/tracks/${track}`, { track, releases: [release] })
  console.log(`${track}: versionCode ${bundle.versionCode} ${release.status}${release.userFraction ? ` (${release.userFraction * 100}%)` : ''}`)
  if (dryRun) {
    await call('POST', `/edits/${edit.id}:validate`)
    console.log('dry run: the edit is valid, not committed')
  } else {
    await call('POST', `/edits/${edit.id}:commit`)
    committed = true
    console.log('committed: Google reviews the release, then it goes out')
  }
} finally {
  if (!committed) await call('DELETE', `/edits/${edit.id}`).catch(() => {})
}
