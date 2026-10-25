// App icons for the stores and the site: a gold Dhamma wheel on robe maroon (the site's primary colour).
//   node scripts/make-icons.mjs            -> server/packaging/icons/{mac,android,windows,store}/…, the iOS
//                                             icon in apple/iOS/Assets.xcassets, the web icons in web/public
//   node scripts/make-icons.mjs --preview  -> server/packaging/icons/preview.png (all shapes, several sizes)
// The wheel has 24 spokes (the 24 conditions of the Paṭṭhāna, as on the old icon) at large sizes, 12 at
// middle sizes and 8 at the smallest, where 24 thin spokes would blur into a disc.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'server/packaging/icons')

const spokesFor = px => (px >= 180 ? 24 : px >= 64 ? 12 : 8)

const defs = `
  <radialGradient id="bg" cx="50%" cy="40%" r="75%">
    <stop offset="0" stop-color="#a8461c"/><stop offset="0.55" stop-color="#7a2e14"/><stop offset="1" stop-color="#4f1a08"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffc766" stop-opacity="0.32"/><stop offset="1" stop-color="#ffc766" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="-400" y1="-400" x2="400" y2="400">
    <stop offset="0" stop-color="#fff0b8"/><stop offset="0.35" stop-color="#f4c35a"/>
    <stop offset="0.7" stop-color="#dc9a2e"/><stop offset="1" stop-color="#b8741a"/>
  </linearGradient>
  <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#2a0b02" flood-opacity="0.55"/>
  </filter>
  <filter id="tile" x="-10%" y="-10%" width="120%" height="125%">
    <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/>
  </filter>`

const ring = (r1, r2) => `M${r1} 0A${r1} ${r1} 0 1 0 ${-r1} 0A${r1} ${r1} 0 1 0 ${r1} 0Z` +
  `M${r2} 0A${r2} ${r2} 0 1 0 ${-r2} 0A${r2} ${r2} 0 1 0 ${r2} 0Z`

/** the wheel, centred on 0,0, outer radius 400 */
function wheel(n, fill = 'url(#gold)') {
  const step = 360 / n
  const parts = []
  if (n === 24) {
    parts.push(`<path fill-rule="evenodd" d="${ring(400, 356)}"/>`)
    for (let i = 0; i < n; i++) { // beads inside the rim, between the spokes
      const a = ((i + 0.5) * step - 90) * Math.PI / 180
      parts.push(`<circle cx="${(338 * Math.cos(a)).toFixed(1)}" cy="${(338 * Math.sin(a)).toFixed(1)}" r="10"/>`)
    }
    const spoke = 'M-3 -96Q-13 -170 -11 -190Q-7 -280 -3 -360L3 -360Q7 -280 11 -190Q13 -170 3 -96Z'
    for (let i = 0; i < n; i++) parts.push(`<path d="${spoke}" transform="rotate(${i * step})"/>`)
    parts.push(`<path fill-rule="evenodd" d="${ring(100, 84)}"/>`, '<circle r="62"/>')
  } else {
    const rim = n === 12 ? 340 : 296, w = n === 12 ? 22 : 54
    parts.push(`<path fill-rule="evenodd" d="${ring(400, rim)}"/>`)
    const spoke = `M${-w * 0.45} -110L${-w} -${rim - 30}L${-w * 0.7} -${rim + 4}L${w * 0.7} -${rim + 4}L${w} -${rim - 30}L${w * 0.45} -110Z`
    for (let i = 0; i < n; i++) parts.push(`<path d="${spoke}" transform="rotate(${i * step})"/>`)
    parts.push(n === 12 ? `<path fill-rule="evenodd" d="${ring(128, 104)}"/><circle r="78"/>` : '<circle r="150"/>')
  }
  return `<g fill="${fill}">${parts.join('')}</g>`
}

/**
 * shape: square (iOS, Play, adaptive background), mac (Apple's macOS grid: 824 tile on 1024 with a shadow),
 * rounded (Windows, Android legacy, web), circle (Android round), foreground (Android adaptive, transparent),
 * mono (Android themed icon).
 */
function svg(shape, px) {
  const n = spokesFor(px)
  const W = (s, t = 'translate(512 512)') => `<g transform="${t} scale(${s})" filter="url(#lift)">${wheel(n)}</g>`
  const bg = (attrs, extra = '') => `<${attrs} fill="url(#bg)"${extra}/>`
  const glow = '<circle cx="512" cy="512" r="470" fill="url(#glow)"/>'
  let body
  switch (shape) {
    case 'square': body = bg('rect width="1024" height="1024"') + glow + W(0.98); break
    case 'mac': body = `<g filter="url(#tile)">${bg('rect x="100" y="100" width="824" height="824" rx="185"')}</g>` +
      `<circle cx="512" cy="512" r="380" fill="url(#glow)"/>` + W(0.8); break
    case 'rounded': body = bg('rect x="24" y="24" width="976" height="976" rx="216"') + glow + W(n === 24 ? 1.02 : 1.06); break
    case 'circle': body = bg('circle cx="512" cy="512" r="500"') + glow + W(0.96); break
    case 'foreground': body = W(0.74); break // the 66/108 safe zone is a radius of 313
    case 'mono': body = `<g transform="translate(512 512) scale(0.74)">${wheel(n, '#fff')}</g>`; break
    default: throw new Error(shape)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${px}" height="${px}"><defs>${defs}</defs>${body}</svg>`
}

/** Google Play feature graphic (1024x500); with w, h the same design centred on a larger canvas (og:image) */
function featureGraphic(w = 1024, h = 500) {
  const k = w / 1024, dy = (h - 500 * k) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}
    <radialGradient id="bgw" cx="30%" cy="45%" r="90%"><stop offset="0" stop-color="#a8461c"/><stop offset="0.5" stop-color="#7a2e14"/><stop offset="1" stop-color="#4f1a08"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bgw)"/><g transform="translate(0 ${dy}) scale(${k})"><circle cx="250" cy="250" r="230" fill="url(#glow)"/>
    <g transform="translate(250 250) scale(0.45)" filter="url(#lift)">${wheel(24)}</g>
    <text x="490" y="235" font-family="'Noto Serif', Georgia, serif" font-size="74" fill="#fbe7b4">Tipiṭaka.app</text>
    <text x="494" y="300" font-family="'Noto Sans', 'Helvetica Neue', sans-serif" font-size="27" fill="#f3d9c6" opacity="0.92">Pāḷi texts · commentaries · dictionaries</text>
    <text x="494" y="342" font-family="'Noto Sans', 'Helvetica Neue', sans-serif" font-size="27" fill="#f3d9c6" opacity="0.92">in 22 scripts, offline</text></g></svg>`
}

let page
async function render(svgText, w, h, file, opaque = false) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText}</body></html>`)
  mkdirSync(dirname(file), { recursive: true })
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } })
  if (opaque) execFileSync('magick', [file, '-background', '#7a2e14', '-alpha', 'remove', '-alpha', 'off', file])
}
const icon = (shape, px, file, opaque) => render(svg(shape, px), px, px, join(OUT, file), opaque)

const browser = await chromium.launch()
page = await browser.newPage()

if (process.argv.includes('--preview')) {
  const shapes = ['mac', 'square', 'rounded', 'circle', 'foreground', 'mono']
  const sizes = [512, 128, 64, 32, 16]
  const cells = shapes.map(s => `<div style="display:flex;align-items:flex-end;gap:16px;margin:8px 0">${sizes.map(p => svg(s, p)).join('')}</div>`)
  const html = `<div style="padding:16px;background:#e9e4dd;width:max-content">${cells.join('')}
    <div style="margin-top:8px">${featureGraphic()}</div></div>`
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.setContent(`<html><body style="margin:0">${html}</body></html>`)
  await page.locator('div').first().screenshot({ path: join(OUT, 'preview.png') })
  console.log('wrote', join(OUT, 'preview.png'))
  await browser.close()
  process.exit(0)
}

rmSync(OUT, { recursive: true, force: true })

// macOS: the .iconset for iconutil (scripts/build-desktop.sh)
for (const s of [16, 32, 128, 256, 512]) {
  await icon('mac', s, `mac/AppIcon.iconset/icon_${s}x${s}.png`)
  await icon('mac', s * 2, `mac/AppIcon.iconset/icon_${s}x${s}@2x.png`)
}
// iOS: one 1024 icon, opaque, square (the system rounds the corners)
await render(svg('square', 1024), 1024, 1024, join(ROOT, 'apple/iOS/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'), true)

// Android: legacy (API 24-25), round, adaptive layers (API 26+), themed (API 33+), Play Store
const dpi = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, k] of Object.entries(dpi)) {
  await icon('rounded', 48 * k, `android/mipmap-${d}/ic_launcher.png`)
  await icon('circle', 48 * k, `android/mipmap-${d}/ic_launcher_round.png`)
  await icon('foreground', 108 * k, `android/mipmap-${d}/ic_launcher_foreground.png`)
  await icon('mono', 108 * k, `android/mipmap-${d}/ic_launcher_monochrome.png`)
}
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  mkdirSync(join(OUT, 'android/mipmap-anydpi-v26'), { recursive: true })
  writeFileSync(join(OUT, `android/mipmap-anydpi-v26/${name}.xml`), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`)
}
mkdirSync(join(OUT, 'android/values'), { recursive: true })
writeFileSync(join(OUT, 'android/values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#7A2E14</color>
</resources>
`)
await icon('square', 512, 'android/play-store-512.png', true)
await render(featureGraphic(), 1024, 500, join(OUT, 'store/play-feature-graphic.png'), true)

// Windows (MSIX, AppxManifest.xml names the plain files; no resources.pri, so no scale-qualified variants)
await icon('rounded', 44, 'windows/Square44x44Logo.png')
await icon('rounded', 150, 'windows/Square150x150Logo.png')
await icon('rounded', 50, 'windows/StoreLogo.png')
for (const s of [16, 24, 32, 48, 64, 256]) await icon('rounded', s, `windows/ico/${s}.png`)
execFileSync('magick', [16, 24, 32, 48, 64, 256].map(s => join(OUT, `windows/ico/${s}.png`)).concat(join(OUT, 'windows/app.ico')))
rmSync(join(OUT, 'windows/ico'), { recursive: true })
await icon('rounded', 300, 'store/microsoft-store-300.png')
await icon('square', 1080, 'store/microsoft-box-art-1080.png', true) // Store listing: 1:1 box art

// web (written to web/public): favicon, home screen icons, the round header logo
const WEB = join(ROOT, 'web/public')
const web = (shape, px, file, opaque) => render(svg(shape, px), px, px, join(WEB, file), opaque)
for (const s of [16, 32, 48]) await web('rounded', s, `fav-${s}.png`)
execFileSync('magick', [16, 32, 48].map(s => join(WEB, `fav-${s}.png`)).concat(join(WEB, 'favicon.ico')))
for (const s of [16, 32, 48]) rmSync(join(WEB, `fav-${s}.png`))
await web('square', 180, 'images/apple-touch-icon.png', true)
await web('rounded', 192, 'images/icon-192.png')
await web('rounded', 512, 'images/icon-512.png')
await web('square', 512, 'images/icon-maskable-512.png', true)
await web('circle', 96, 'images/app-icon.png')
await render(featureGraphic(1200, 630), 1200, 630, join(WEB, 'images/og.png'), true)

await browser.close()
console.log('wrote', OUT)
