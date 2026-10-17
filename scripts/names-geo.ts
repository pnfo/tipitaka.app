/**
 * npm run names:geo
 *
 * Coordinates of the places (dev-docs/names.md) and the base map of the map views, from sources pinned in
 * data/names/sources.lock (downloaded into .cache/names/):
 *  - SuttaCentral sc-data additional-info/map_data.json: places, the mahājanapadas / regions (polygons) and two
 *    journeys (DN 16, Sn 5). SuttaCentral's own material is CC0.
 *  - SuttaCentral sc-data DPPN: the <span class='location'>lat,lon</span> of place entries (with a precision).
 *  - Natural Earth 10m (public domain): coastline, rivers, mountain ranges, country borders; the 1:50m shaded relief
 *    (cropped to the box with macOS sips: web/src/assets/map/relief.jpg, reprojected in the browser by draw.ts).
 * Writes
 *  - data/names/geo.tsv: slug, lat, lon, prec (1 located, 2 probable, 3 approximate, 4 in or near the place its
 *    DPD meaning names, e.g. "name of a park in Rājagaha"), source. Read by the text build (entity.lat/lon/prec).
 *  - web/src/assets/map/basemap.json: the drawing of the map (clipped to South Asia, simplified, 3 decimals).
 * Needs data/names/entities.tsv (npm run names:gazetteer) and db/text.db (journey keys, the number of suttas of a
 * name decides between homonyms).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { syncDicts, readDictLock, sourceFile } from '../build/dict-sources'
import { fold } from '../shared/normalize'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCK = path.join(repo, 'data/names/sources.lock')
const CACHE = path.join(repo, '.cache/names')
const GEO = path.join(repo, 'data/names/geo.tsv')
const BASEMAP = path.join(repo, 'web/src/assets/map/basemap.json')

syncDicts(LOCK, CACHE, process.argv.includes('--latest'))
const lock = readDictLock(LOCK)
const src = (name: string) => JSON.parse(fs.readFileSync(sourceFile(CACHE, name, lock[name]), 'utf8'))

type LonLat = [number, number]
interface Place { slug: string; type: string; lemma: string; base: string; meaning: string; units: number }
interface Geo { lat: number; lon: number; prec: number; source: string }

// SuttaCentral writes ṁ and some names with a gloss: "Gijjhakūṭa (Vulture’s Peak)". Spellings of one place: DPD
// nātika / ñātika, SuttaCentral nādikā; veḷuvagāmaka / beluva; susumāragira / suṃsumāragira
const ALIAS: Record<string, string> = { natika: 'nadika', veluvagamaka: 'beluva', beluvagamaka: 'beluva', susumaragira: 'sumsumaragira' }
const key0 = (s: string) => fold(s.replace(/ṁ/g, 'ṃ').replace(/\(.*\)/, '').replace(/^\d+\)\s*/, '').trim()).replace(/[^a-z]/g, '')
const key = (s: string) => { const k = key0(s); return ALIAS[k] ?? k }

// the places (and the peoples: "sakkesu" is a place) of the gazetteer, with their number of suttas
const units = new Map<string, number>()
try {
  const db = new Database(path.join(repo, 'db/text.db'), { readonly: true })
  for (const r of db.prepare('SELECT slug, units FROM entity').all() as { slug: string; units: number }[]) units.set(r.slug, r.units)
  db.close()
} catch { /* first run: no entity table yet */ }
const places: Place[] = fs.readFileSync(path.join(repo, 'data/names/entities.tsv'), 'utf8').split('\n').slice(1).filter(Boolean)
  .map(l => l.split('\t')).filter(r => r[1] === 'place' || r[1] === 'group')
  .map(([slug, type, lemma, , , meaning]) => ({ slug, type, lemma, base: lemma.replace(/ [\d.]+$/, ''), meaning: meaning ?? '', units: units.get(slug) ?? 0 }))
const byKey = new Map<string, Place[]>()
for (const p of places) byKey.set(key(p.base), [...(byKey.get(key(p.base)) ?? []), p])

// candidate coordinates by name
const cands = new Map<string, (Geo & { name: string })[]>()
const addCand = (name: string, g: Geo) => { const k = key(name); cands.set(k, [...(cands.get(k) ?? []), { ...g, name }]) }
const scMap = src('sc-map') as { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, string> }[] }
const features = scMap.features
const centroid = (ring: LonLat[]): LonLat => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
for (const f of features) {
  const p = f.properties
  if (/Extraterrestrial/.test(p.layer ?? '') || f.geometry.type === 'LineString') continue
  const names = [p.define, p.name].filter(Boolean)
  if (f.geometry.type === 'Point') {
    const [lon, lat] = f.geometry.coordinates as LonLat
    const journey = /journey/.test(p.layer ?? '')
    for (const n of new Set(names.map(key))) addCand(n, { lat, lon, prec: p.icon === 'question' ? 3 : 1, source: `${journey ? 'sc-journey' : 'sc-map'}:${p.id}` })
  } else if (f.geometry.type === 'Polygon') {
    const [lon, lat] = centroid((f.geometry.coordinates as LonLat[][])[0])
    for (const n of new Set(names.map(key))) addCand(n, { lat, lon, prec: 3, source: `sc-region:${p.id}` })
  }
}
let dppnCount = 0
// DPPN locations given as a place: "Ayojjhā", "near Naḷakapāna in Kosala" (resolved after the coordinates)
const dppnNear = new Map<string, string[]>()
for (const e of src('sc-dppn') as { word: string; text: string }[]) {
  const loc = /<span class='location'>([^<]*)<\/span>/.exec(e.text)?.[1] ?? ''
  const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(loc)
  if (!m) {
    const names = [...loc.matchAll(/[A-ZĀĪŪṬḌṆḶÑṄ][\p{L}\p{M}]+/gu)].map(x => key(x[0]))
    if (names.length) dppnNear.set(key(e.word), names)
    continue
  }
  const prec = +(/<span class='precision'>(\d)<\/span>/.exec(e.text)?.[1] ?? 3)
  if (prec >= 5) continue // mythical places
  addCand(e.word, { lat: +m[1], lon: +m[2], prec: Math.min(prec, 3), source: 'sc-dppn' })
  dppnCount++
}

const geo = new Map<string, Geo>()
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6371
}
// "name of a park in Rājagaha", "a forest outside Vesālī": the places the meaning names
const PLACE_IN = /\b(?:in|near|outside|at|around|of|close to|on|by|from|between)\s+(?:the\s+)?([A-ZĀĪŪṬḌṆḶÑṄ][\p{L}\p{M}]+)/gu
const contextOf = (p: Place) => [...p.meaning.matchAll(PLACE_IN)].map(m => key(m[1]))
  .map(k => (byKey.get(k) ?? []).map(q => geo.get(q.slug)).find(Boolean)).filter((g): g is Geo => !!g)

// pass 1: names with one candidate (SuttaCentral's map before the DPPN) given to the homonym with the most suttas,
// pass 2: several candidates (mahāvana near Vesālī / Kapilavatthu): the one nearest to the place the meaning names
for (const pass of [1, 2]) {
  for (const [k, ps] of byKey) {
    const cs = cands.get(k)
    if (!cs?.length) continue
    const best = cs.filter(c => c.prec === Math.min(...cs.map(x => x.prec)))
    const sc = best.filter(c => c.source.startsWith('sc-'))
    // SuttaCentral's map, then its journey stops, then the DPPN; points less than 15 km apart are one place
    const rank = (c: Geo) => (c.source.startsWith('sc-map') ? 0 : c.source.startsWith('sc-journey') ? 1 : 2)
    const pool: typeof best = []
    for (const c of (sc.length ? sc : best).sort((a, b) => rank(a) - rank(b))) if (!pool.some(q => km(q, c) < 15)) pool.push(c)
    const free = ps.filter(p => !geo.has(p.slug)).sort((a, b) => b.units - a.units)
    if (!free.length) continue
    const distinct = pool.length
    if (pass === 1 && distinct === 1) {
      // the place homonyms share it (a river and its region keep apart: only the first place, and the peoples)
      const target = free.find(p => p.type === 'place') ?? free[0]
      geo.set(target.slug, pool[0])
      // spellings of the same place that DPD has as headwords of their own (nātika, ñātika)
      for (const v of free.filter(p => p.type === 'place' && p.base !== target.base)) geo.set(v.slug, pool[0])
      for (const g of free.filter(p => p.type === 'group')) if (g !== target) geo.set(g.slug, { ...pool[0], prec: 3 })
    } else if (pass === 2 && distinct > 1) {
      for (const p of free) {
        const ctx = contextOf(p)
        if (!ctx.length) continue
        const c = [...pool].sort((a, b) => km(a, ctx[0]) - km(b, ctx[0]))[0]
        if (km(c, ctx[0]) < 60) geo.set(p.slug, c)
      }
    }
  }
}
// pass 3: places without coordinates: "ajapālanigrodhamūla" at the ajapālanigrodha; in or near a located place
// (Kalandakanivāpa "a park in Rājagaha", the DPPN "near Naḷakapāna in Kosala")
const located = (k: string) => (byKey.get(k) ?? []).map(q => geo.get(q.slug)).find(Boolean) ?? cands.get(k)?.find(c => c.source.startsWith('sc-'))
for (let round = 0; round < 3; round++) {
  for (const p of places) {
    if (geo.has(p.slug) || p.type !== 'place') continue
    const k = key(p.base)
    const stem = /(.{4,})(?:mula|vihara|arama|cetiya)$/.exec(k)?.[1]
    const same = stem ? located(stem) : undefined
    if (same) { geo.set(p.slug, { lat: same.lat, lon: same.lon, prec: Math.max(same.prec, 2), source: `at:${stem}` }); continue }
    const near = (dppnNear.get(k) ?? []).map(located).find(Boolean)
    const ctx = near ?? contextOf(p)[0]
    if (ctx) geo.set(p.slug, { lat: ctx.lat, lon: ctx.lon, prec: 4, source: near ? 'dppn-near' : 'in' })
  }
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4
fs.writeFileSync(GEO, ['slug\tlat\tlon\tprec\tsource', ...[...geo.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  .map(([s, g]) => [s, r4(g.lat), r4(g.lon), g.prec, g.source].join('\t'))].join('\n') + '\n')
const withUnits = places.filter(p => p.type === 'place' && p.units > 0)
const missing = withUnits.filter(p => !geo.has(p.slug)).sort((a, b) => b.units - a.units)
console.log(`${geo.size} located (${dppnCount} DPPN locations); places with suttas: ${withUnits.length - missing.length} of ${withUnits.length} located`)
console.log(`not located: ${missing.slice(0, 40).map(p => `${p.slug} ${p.units}`).join(', ')}`)

// ---- the base map ------------------------------------------------------------------------------------------------
const BBOX = { w: 60, e: 98, s: 5, n: 37 }
const inBox = ([x, y]: LonLat) => x >= BBOX.w && x <= BBOX.e && y >= BBOX.s && y <= BBOX.n
const r3 = (p: LonLat): LonLat => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]

/** Douglas-Peucker */
function simplify(pts: LonLat[], tol: number): LonLat[] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0, idx = -1
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
    for (let i = a + 1; i < b; i++) {
      // (a closed ring starts and ends at the same point: the distance to that point)
      const d = len ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len : Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
      if (d > max) { max = d; idx = i }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
/** the parts of a line inside the box, simplified */
function clipLine(line: LonLat[], tol: number): LonLat[][] {
  const out: LonLat[][] = []
  let cur: LonLat[] = []
  for (const p of line) {
    if (inBox(p)) cur.push(p)
    else if (cur.length) { out.push(cur); cur = [] }
  }
  if (cur.length) out.push(cur)
  return out.map(l => simplify(l, tol).map(r3)).filter(l => l.length > 1)
}
type Geometry = { type: string; coordinates: unknown }
const lines = (g: Geometry): LonLat[][] => g.type === 'LineString' ? [g.coordinates as LonLat[]] : g.type === 'MultiLineString' ? g.coordinates as LonLat[][] : []
const rings = (g: Geometry): LonLat[][] => g.type === 'Polygon' ? [(g.coordinates as LonLat[][])[0]]
  : g.type === 'MultiPolygon' ? (g.coordinates as LonLat[][][]).map(p => p[0]) : []
type NeFeature = { geometry: Geometry | null; properties: Record<string, string | number | null> }
const ne = (name: string) => (src(name) as { features: NeFeature[] }).features.filter(f => f.geometry)

/** Sutherland-Hodgman: a ring clipped to the box */
function clipRing(ring: LonLat[]): LonLat[] {
  const edges: [(p: LonLat) => boolean, (a: LonLat, b: LonLat) => LonLat][] = [
    [p => p[0] >= BBOX.w, (a, b) => [BBOX.w, a[1] + ((b[1] - a[1]) * (BBOX.w - a[0])) / (b[0] - a[0])]],
    [p => p[0] <= BBOX.e, (a, b) => [BBOX.e, a[1] + ((b[1] - a[1]) * (BBOX.e - a[0])) / (b[0] - a[0])]],
    [p => p[1] >= BBOX.s, (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX.s - a[1])) / (b[1] - a[1]), BBOX.s]],
    [p => p[1] <= BBOX.n, (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX.n - a[1])) / (b[1] - a[1]), BBOX.n]],
  ]
  let out = ring
  for (const [inside, cut] of edges) {
    const pts = out
    out = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b) } else if (inside(a)) out.push(cut(a, b))
    }
    if (!out.length) break
  }
  return out
}
const land = ne('ne-land').flatMap(f => (f.geometry!.type === 'Polygon' ? [f.geometry!.coordinates as LonLat[][]] : f.geometry!.coordinates as LonLat[][][])
  .map(poly => simplify(clipRing(poly[0]), 0.02).map(r3)).filter(r => r.length > 3))
const coast = ne('ne-coastline').flatMap(f => lines(f.geometry!).flatMap(l => clipLine(l, 0.02)))
const borders = ne('ne-borders').flatMap(f => lines(f.geometry!).flatMap(l => clipLine(l, 0.02)))
// rivers: Pāḷi names of the great rivers (DPD slugs: their pages)
const RIVERS: Record<string, [string, string] | null> = {
  Ganges: ['Gaṅgā', 'ganga-1'], Yamuna: ['Yamunā', 'yamuna'], 'Ghäghara': ['Sarabhū', 'sarabhu'], Gandak: ['Mahī', 'mahi-2'],
  Indus: ['Sindhu', ''], Narmada: ['Nammadā', ''], 'Godävari': ['Godhāvarī', 'godhavari'],
}
const rivers: { name?: string; slug?: string; rank: number; lines: LonLat[][] }[] = []
for (const f of ne('ne-rivers')) {
  const n = String(f.properties.name ?? '')
  const rank = Number(f.properties.scalerank ?? 10)
  if (rank > 9) continue
  const ls = lines(f.geometry!).flatMap(l => clipLine(l, 0.015))
  if (!ls.length) continue
  const pali = RIVERS[n]
  rivers.push({ ...(pali ? { name: pali[0], ...(pali[1] ? { slug: pali[1] } : {}) } : {}), rank, lines: ls })
}
// Aciravatī (Rapti) is not in Natural Earth: SuttaCentral's DPPN has a point only
const MOUNTAINS: Record<string, string> = { HIMALAYAS: 'Himavanta', 'Vindhya Range': 'Viñjha' }
const mountains = ne('ne-regions').filter(f => MOUNTAINS[String(f.properties.NAME)])
  .map(f => ({ name: MOUNTAINS[String(f.properties.NAME)], rings: rings(f.geometry!).map(r => simplify(r, 0.05).map(r3)) }))

const slugOf = (name: string, types = ['place', 'group']) => {
  const ps = (byKey.get(key(name)) ?? []).filter(p => types.includes(p.type)).sort((a, b) => b.units - a.units)
  return ps[0]?.slug
}
const regions = features.filter(f => f.geometry.type === 'Polygon').map(f => {
  const p = f.properties
  const name = p.name.replace(/ṁ/g, 'ṃ').trim()
  const ring = simplify((f.geometry.coordinates as LonLat[][])[0], 0.01).map(r3)
  // every place / people of the name: the janapada Vajjī and the Vajjians
  const slugs = [...new Set([p.define, name].filter(Boolean).flatMap(n => (byKey.get(key(n!)) ?? []).filter(x => x.type === 'place' || x.type === 'group').map(x => x.slug)))]
  return { name, slugs, kind: p.layer === 'Mahajanapadas' ? 'janapada' : p.layer === 'Regions' ? 'region' : 'republic',
    color: (p as unknown as { style?: { fillColor?: string } }).style?.fillColor ?? '#999', ring, label: r3(centroid(ring)) }
})

const textDb = new Database(path.join(repo, 'db/text.db'), { readonly: true })
const keyOf = (title: string) => (textDb.prepare("SELECT key FROM node WHERE title = ? AND coll = 'mula'").pluck().get(title) as string | undefined) ?? ''
const JOURNEYS: Record<string, { id: string; title: string }> = {
  'Mahāparinibbāna journey': { id: 'mahaparinibbana', title: '3. Mahāparinibbānasuttaṃ' },
  'Pārāyanavagga journey': { id: 'parayana', title: '5. Pārāyanavaggo' },
}
const journeys = Object.entries(JOURNEYS).map(([layer, j]) => {
  const stops = features.filter(f => f.properties.layer === layer && f.geometry.type === 'Point').map(f => {
    const [lon, lat] = f.geometry.coordinates as LonLat
    const name = f.properties.name.replace(/^\d+\)\s*/, '').replace(/,.*$/, '').replace(/ṁ/g, 'ṃ').trim()
    return { name, slug: slugOf(name, ['place']), at: r3([lon, lat]) }
  })
  const line = features.find(f => f.properties.layer === layer && f.geometry.type === 'LineString')
  return { id: j.id, key: keyOf(j.title), stops, line: line ? simplify(line.geometry.coordinates as LonLat[], 0.01).map(r3) : stops.map(s => s.at) }
})
textDb.close()

// the shaded relief of the box (equirectangular, 10800 x 5400 for the world), a grey JPEG
const reliefZip = sourceFile(CACHE, 'ne-relief', lock['ne-relief'])
const reliefTif = path.join(path.dirname(reliefZip), 'SR_50M.tif')
if (!fs.existsSync(reliefTif)) execFileSync('unzip', ['-o', '-q', reliefZip, '-d', path.dirname(reliefZip)])
const px = (lon: number) => Math.round(((lon + 180) / 360) * 10800), py = (lat: number) => Math.round(((90 - lat) / 180) * 5400)
const crop = path.join(CACHE, 'relief-crop.tif')
const RELIEF = path.join(repo, 'web/src/assets/map/relief.jpg')
execFileSync('sips', ['-c', String(py(BBOX.s) - py(BBOX.n)), String(px(BBOX.e) - px(BBOX.w)), '--cropOffset', String(py(BBOX.n)), String(px(BBOX.w)),
  reliefTif, '--out', crop], { stdio: 'ignore' })
execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '60', crop, '--out', RELIEF], { stdio: 'ignore' })
console.log(`relief: ${(fs.statSync(RELIEF).size / 1024).toFixed(0)} KB`)

const basemap = { bbox: BBOX, land, coast, borders, rivers, mountains, regions, journeys,
  sources: 'SuttaCentral (CC0): places, regions, journeys · Natural Earth (public domain): coast, rivers, mountains, borders' }
fs.mkdirSync(path.dirname(BASEMAP), { recursive: true })
fs.writeFileSync(BASEMAP, JSON.stringify(basemap))
console.log(`basemap: ${(fs.statSync(BASEMAP).size / 1024).toFixed(0)} KB (${rivers.length} rivers, ${regions.length} regions, journeys ${journeys.map(j => `${j.id} ${j.key} ${j.stops.filter(s => s.slug).length}/${j.stops.length}`).join(', ')})`)
