// node scripts/measure-fonts.mjs [--write] - measures the letter height of every Pāḷi script font (Chromium canvas) and
// computes its size-adjust (dev-docs/fonts.md); --write updates the size-adjust of the faces in web/src/styles/fonts.css
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { convert } from '@pnfo/pali-converter'

const CSS = 'web/src/styles/fonts.css'
const css = fs.readFileSync(CSS, 'utf8')

// letter height (px at 100px) of the fonts of tipitaka.app v2 as users know them, relative to the Roman x-height
// (measured on tipitaka.app; Thai was shown at 1.5× the text size). Scripts that v2 showed in the same font as now are
// left out: their own measurement is their v2 size.
const V2 = { sinh: 1.45, mymr: 1.6, thai: 1.1, khmr: 1.21, deva: 1.13 }
const EQUAL = 1.15 // non-Roman letters at 1.15× the Roman x-height look the same size
const MIN = 0.5, MAX = 1.6

// the regular face of every script (single faces have no font-weight)
const faces = [...css.matchAll(/@font-face \{ font-family: 'pali-([a-z]+)'; src: url\('\.\.\/assets\/fonts\/([^']+)'\)([^}]*)\}/g)]
  .filter(m => !m[3].includes('font-weight: 700')).map(m => ({ script: m[1], file: m[2] }))

const browser = await chromium.launch()
const page = await browser.newPage()
await page.route('http://fonts.local/**', route => {
  const name = path.basename(new URL(route.request().url()).pathname)
  return name.endsWith('.html') ? route.fulfill({ body: '<!doctype html>', contentType: 'text/html' })
    : route.fulfill({ body: fs.readFileSync(path.join('web/src/assets/fonts', name)) })
})
await page.goto('http://fonts.local/index.html')
await page.setContent(`<style>${faces.map(f => `@font-face { font-family: 'm-${f.script}'; src: url('http://fonts.local/${f.file}'); }`).join('\n')}</style>`)

const sample = Object.fromEntries(faces.map(f => [f.script, f.script === 'latn' ? 'mana' : convert('mana', f.script, 'latn')]))
const heights = await page.evaluate(async (sample) => {
  const out = {}
  for (const [script, text] of Object.entries(sample)) {
    await document.fonts.load(`100px 'm-${script}'`, text)
    const c = document.createElement('canvas').getContext('2d')
    c.font = `100px 'm-${script}'`
    const m = c.measureText(text)
    out[script] = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  }
  return out
}, sample)
await browser.close()

const xHeight = heights.latn
const rows = faces.map(({ script }) => {
  const own = heights[script] / xHeight // the font's letters at the same font size
  if (script === 'latn' || script === 'cyrl') return { script, own, target: 1, adjust: 1 }
  // halfway (geometric mean) between the size users know (v2) and equal sizes for all scripts
  const target = Math.sqrt((V2[script] ?? own) * EQUAL)
  return { script, own, target, adjust: Math.min(MAX, Math.max(MIN, target / own)) }
})
// interface text (ui-<script> faces): the size users know from v2, where the interface text was 16px; ours is mostly
// 14px (text-sm), which matches v2's English (Times 16px ≈ system-ui 14px x-height) but not the script fonts
const UI_V2 = 16 / 14
for (const r of rows) r.ui = V2[r.script] ? V2[r.script] / r.own * UI_V2 : undefined
console.table(rows.map(r => ({ script: r.script, 'own height': r.own.toFixed(2), target: r.target.toFixed(2), 'size-adjust': `${(r.adjust * 100).toFixed(1)}%`,
  'ui size-adjust': r.ui ? `${(r.ui * 100).toFixed(1)}%` : '' })))

if (process.argv.includes('--write')) {
  const adjust = Object.fromEntries(rows.map(r => [r.script, `${(r.adjust * 100).toFixed(1)}%`]))
  const ui = Object.fromEntries(rows.filter(r => r.ui).map(r => [r.script, `${(r.ui * 100).toFixed(1)}%`]))
  const out = css.replace(/(font-family: 'pali-([a-z]+)';[^}]*size-adjust: )[0-9.]+%/g, (m, pre, script) => adjust[script] ? pre + adjust[script] : m)
    .replace(/(font-family: 'ui-([a-z]+)';[^}]*size-adjust: )[0-9.]+%/g, (m, pre, script) => ui[script] ? pre + ui[script] : m)
  fs.writeFileSync(CSS, out)
  console.log(`updated ${CSS}`)
}
