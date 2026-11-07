// Submits an uploaded build for App Review (App Store Connect API, the key of scripts/asc.mjs):
//   node scripts/asc-release.mjs <version> --notes <file> [--platform IOS|MAC_OS] [--build <number>] [--manual] [--dry-run]
// For each platform (default both): waits for the newest processed build of <version> (or --build), creates the App
// Store version (or reuses one not yet submitted), sets What's New in its localizations, attaches the build and
// submits it; it is released when approved (--manual: you release it in App Store Connect). --dry-run: only shows
// what it would do.
import { readFileSync } from 'node:fs'
import { api } from './asc.mjs'

const APP = '6824157493'
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const version = args[0], notesFile = opt('--notes'), only = opt('--platform'), buildNo = opt('--build')
const manual = args.includes('--manual'), dryRun = args.includes('--dry-run')
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !notesFile) { console.error('usage: node scripts/asc-release.mjs <x.y.z> --notes <file> [--platform IOS|MAC_OS] [--build n] [--manual] [--dry-run]'); process.exit(1) }
const notes = readFileSync(notesFile, 'utf8').trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rel = (type, id) => ({ data: { type, id } })

async function findBuild(platform) {
  for (let i = 0; i < 60; i++) { // processing takes 5-30 minutes after the upload
    const q = `/v1/builds?filter[app]=${APP}&filter[preReleaseVersion.version]=${version}&filter[preReleaseVersion.platform]=${platform}` +
      (buildNo ? `&filter[version]=${buildNo}` : '') + '&sort=-uploadedDate&limit=1&fields[builds]=version,processingState'
    const b = (await api('GET', q)).data[0]
    if (b?.attributes.processingState === 'VALID') return b
    if (b && /FAILED|INVALID/.test(b.attributes.processingState)) throw new Error(`${platform} build ${b.attributes.version}: ${b.attributes.processingState}`)
    console.log(`${platform}: ${b ? `build ${b.attributes.version} ${b.attributes.processingState}` : 'no build yet'}, waiting`)
    await sleep(60000)
  }
  throw new Error(`${platform}: no processed build of ${version}`)
}

for (const platform of only ? [only] : ['IOS', 'MAC_OS']) {
  const build = await findBuild(platform)
  console.log(`${platform}: build ${build.attributes.version}`)
  const versions = (await api('GET', `/v1/apps/${APP}/appStoreVersions?filter[platform]=${platform}&limit=5&fields[appStoreVersions]=versionString,appStoreState`)).data
  let v = versions.find(x => x.attributes.versionString === version)
  const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED']
  if (v && !editable.includes(v.attributes.appStoreState)) { console.log(`${platform} ${version} is already ${v.attributes.appStoreState}`); continue }
  if (dryRun) { console.log(`dry run: would ${v ? 'reuse' : 'create'} ${platform} ${version}, attach build ${build.attributes.version}, submit`); continue }
  const releaseType = manual ? 'MANUAL' : 'AFTER_APPROVAL'
  if (!v) v = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform, versionString: version, releaseType },
    relationships: { app: rel('apps', APP) } } })).data
  else await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { releaseType } } })
  for (const l of (await api('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data)
    await api('PATCH', `/v1/appStoreVersionLocalizations/${l.id}`, { data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew: notes } } })
  await api('PATCH', `/v1/appStoreVersions/${v.id}/relationships/build`, rel('builds', build.id))
  // a review submission (an open one of the platform is reused), its item, then submitted
  const open = (await api('GET', `/v1/reviewSubmissions?filter[app]=${APP}&filter[platform]=${platform}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=1`)).data[0]
  const sub = open ?? (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform }, relationships: { app: rel('apps', APP) } } })).data
  const items = (await api('GET', `/v1/reviewSubmissions/${sub.id}/items?include=appStoreVersion`)).data
  for (const it of items) if (it.attributes.state === 'REJECTED') await api('PATCH', `/v1/reviewSubmissionItems/${it.id}`, { data: { type: 'reviewSubmissionItems', id: it.id, attributes: { resolved: true } } })
  if (!items.some(it => it.relationships?.appStoreVersion?.data?.id === v.id))
    await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: rel('reviewSubmissions', sub.id), appStoreVersion: rel('appStoreVersions', v.id) } } })
  await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } })
  console.log(`${platform} ${version}: submitted for review (${releaseType})`)
}
