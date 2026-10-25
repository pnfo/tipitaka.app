// Store screenshots: six features of the app, each with a caption on the brand colour, rendered from the web build
// by the server (the apps show the same UI) at the sizes of each store, tablets and desktops in landscape.
//   npm run build:web && bash scripts/build-server.sh && node scripts/store-screenshots.mjs [output…]
//   -> release/store-screenshots/<output>/<n>-<scene>.png
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'release/store-screenshots')
const PORT = 8417, BASE = `http://127.0.0.1:${PORT}`
const FONTS = pathToFileURL(join(ROOT, 'web/src/assets/fonts')).href

/** store image sizes; css: the width of the screen the app is shown at (phone, tablet or desktop layout) */
const OUTPUTS = {
  'play-phone': { w: 1080, h: 1920, css: 390 },
  'play-tablet-7': { w: 1920, h: 1200, css: 1280 },
  'play-tablet-10': { w: 2560, h: 1600, css: 1280 },
  'apple-iphone-6.9': { w: 1320, h: 2868, css: 400 },
  'apple-ipad-13': { w: 2752, h: 2064, css: 1280 },
  'apple-mac': { w: 2880, h: 1800, css: 1440, desktop: true },
  'microsoft-windows': { w: 3200, h: 1800, css: 1600, desktop: true },
}

const SCRIPTS = [['latn', 'Roman'], ['sinh', 'Sinhala'], ['deva', 'Devanagari'], ['thai', 'Thai'], ['mymr', 'Myanmar'],
  ['khmr', 'Khmer'], ['beng', 'Bengali'], ['tibt', 'Tibetan']]

const SCENES = [
  { id: 'dictionary', title: 'Tap a word to look it up', desktopTitle: 'Click a word to look it up', sub: 'The Digital Pāḷi Dictionary with grammar, and many more dictionaries' },
  { id: 'commentary', title: 'The commentary beside the text', sub: 'Mūla, aṭṭhakathā and ṭīkā, linked paragraph by paragraph' },
  { id: 'scripts', title: 'Read in 22 scripts', sub: 'Roman, Sinhala, Devanagari, Thai, Myanmar, Khmer and more' },
  { id: 'map', title: 'Where the Buddha taught', sub: 'The places, people and journeys of the suttas on a map' },
  { id: 'search', title: 'Search the whole canon', sub: 'Every word form in every collection – all offline' },
  { id: 'themes', title: 'Light, sepia and dark', sub: 'Text size, line spacing and width as you like them' },
]

let browser
async function appPage(css, cssH, { theme = 'light', script = 'latn', textSize = 18 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: css, height: cssH }, deviceScaleFactor: 3, isMobile: css < 600, hasTouch: css < 600 })
  await ctx.addInitScript(s => { // the desktop app's flag: no "get the app" links, no country lookup
    window.runtime = { BrowserOpenURL() {} }
    localStorage.setItem('tipitaka.app-settings-3', JSON.stringify(s))
  }, { theme, script, textSize, uiLang: 'en', navPinned: false }) // the menu column would take the room of the text
  return ctx.newPage()
}
async function open(page, path) {
  await page.goto(BASE + encodeURI(path), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}
async function clickWord(page, word) {
  const at = await page.evaluate(w => {
    const walker = document.createTreeWalker(document.querySelector('[data-testid=reader] .reading'), NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(w)
      if (i < 0) continue
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length)
      const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
  }, word)
  await page.mouse.click(at.x, at.y)
  await page.getByTestId('study-panel').waitFor()
  await page.waitForTimeout(800)
}
const shot = async (page, file) => { await page.screenshot({ path: file }); await page.context().close(); return file }

/** the app screen(s) of a scene: an image file, or [{label, file}] for the composites */
async function render(scene, css, cssH, dir) {
  const wide = css >= 1000
  const file = join(dir, `${scene.id}.png`)
  switch (scene.id) {
    case 'dictionary': {
      const p = await appPage(css, cssH)
      await open(p, '/latn/dn-1-1'); await clickWord(p, 'Evaṃ')
      return shot(p, file)
    }
    case 'commentary': {
      const p = await appPage(css, cssH)
      await open(p, '/latn/dn-1-1')
      await p.locator('[data-testid=reader] .reading .gl').nth(3).click()
      await p.getByTestId('study-panel').getByRole('button', { name: /Commentary/ }).click()
      await p.waitForTimeout(800)
      if (wide) { // mūla and aṭṭhakathā side by side, without the tree and the panel
        await p.getByTestId('gloss-alongside').first().click(); await p.waitForTimeout(1500)
        await p.getByTestId('panel-close').click()
        if (await p.locator('aside').first().isVisible()) await p.getByTestId('tree-toggle').click()
        await p.waitForTimeout(800)
      }
      return shot(p, file)
    }
    case 'map': {
      const p = await appPage(css, cssH)
      await open(p, '/latn/map')
      await p.getByRole('button', { name: /last journey/ }).click(); await p.waitForTimeout(2000)
      return shot(p, file)
    }
    case 'search': {
      const p = await appPage(css, cssH)
      await open(p, '/latn/search/nibbāna')
      return shot(p, file)
    }
    case 'themes': { // the same page in three themes, a third of the screen each
      const parts = []
      for (const theme of ['light', 'sepia', 'dark']) {
        const p = await appPage(css, cssH, { theme, script: 'sinh' })
        await open(p, '/sinh/kn-dhp-1')
        parts.push(await shot(p, join(dir, `themes-${theme}.png`)))
      }
      return parts.map(f => ({ file: f }))
    }
    case 'scripts': { // the first verse of the Dhammapada in each script
      const cardW = wide ? 300 : 460
      const out = []
      for (const [code, name] of SCRIPTS.slice(0, wide ? 8 : 6)) {
        const p = await appPage(cardW, 900, { script: code, textSize: 16 })
        await open(p, `/${code}/kn-dhp-1`)
        const box = await p.evaluate(() => { // the paragraphs from the number 1 to just before the number 2
          const paras = [...document.querySelectorAll('[data-testid=reader] .reading .para')]
          const start = paras.findIndex(e => e.querySelector('.num'))
          const end = paras.findIndex((e, i) => i > start && e.querySelector('.num'))
          const rs = paras.slice(start, end < 0 ? start + 4 : end).map(e => e.getBoundingClientRect())
          const top = Math.min(...rs.map(r => r.top)), bottom = Math.max(...rs.map(r => r.bottom))
          const left = Math.min(...rs.map(r => r.left)), right = Math.max(...rs.map(r => r.right))
          return { x: Math.max(0, left - 8), y: Math.max(0, top - 10 + scrollY), width: right - left + 16, height: bottom - top + 20 }
        })
        const f = join(dir, `scripts-${code}.png`)
        await p.screenshot({ path: f, clip: box, fullPage: true }); await p.context().close()
        out.push({ label: name, file: f })
      }
      return out
    }
  }
}

function frameHtml(o, scene, img) {
  const portrait = o.h > o.w
  const band = Math.round(o.h * (portrait ? 0.2 : 0.16))
  const title = Math.round(portrait ? o.w * 0.068 : o.h * 0.056), sub = Math.round(title * 0.48)
  const mx = Math.round(o.w * (portrait ? 0.07 : 0.06)), radius = Math.round(o.w * (portrait ? 0.035 : 0.012))
  const boxW = o.w - 2 * mx, boxH = o.h - band
  let body
  if (typeof img === 'string') body = `<img class="screen" src="${pathToFileURL(img).href}">`
  else if (img[0].label) { // script cards
    const cols = portrait ? 1 : 4
    body = `<div class="cards" style="grid-template-columns: repeat(${cols}, 1fr)">${img.map(c =>
      `<div class="card"><div class="label">${c.label}</div><img src="${pathToFileURL(c.file).href}"></div>`).join('')}</div>`
  } else body = `<div class="screen split">${img.map(c => `<div><img src="${pathToFileURL(c.file).href}"></div>`).join('')}</div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Serif; src: url('${FONTS}/NotoSerif-Bold.woff2'); font-weight: 700 }
    @font-face { font-family: Serif; src: url('${FONTS}/NotoSerif-Regular.woff2'); font-weight: 400 }
    html, body { margin: 0; width: ${o.w}px; height: ${o.h}px; overflow: hidden }
    body { background: radial-gradient(ellipse at 50% 0%, #a8461c 0%, #7a2e14 45%, #4f1a08 100%); font-family: Serif, Georgia, serif; position: relative }
    .caption { position: absolute; left: 0; right: 0; top: 0; height: ${band}px; display: flex; flex-direction: column; align-items: center;
      justify-content: center; text-align: center; padding: 0 ${mx}px; box-sizing: border-box }
    h1 { margin: 0; font-size: ${title}px; font-weight: 700; color: #fbe7b4; line-height: 1.15 }
    p { margin: ${Math.round(sub * 0.5)}px 0 0; font-size: ${sub}px; color: #f3d9c6; line-height: 1.3 }
    .screen { position: absolute; left: ${mx}px; top: ${band}px; width: ${boxW}px; height: ${boxH + radius}px; object-fit: cover;
      object-position: top; border-radius: ${radius}px; box-shadow: 0 ${radius}px ${radius * 3}px rgba(0,0,0,.45); background: #fbf8f3 }
    .split { display: flex; overflow: hidden }
    .split > div { flex: 1; overflow: hidden } .split img { width: 300%; height: auto; display: block }
    .split > div:nth-child(2) img { margin-left: -100% } .split > div:nth-child(3) img { margin-left: -200% }
    .cards { position: absolute; left: ${mx}px; right: ${mx}px; top: ${band}px; bottom: ${portrait ? 0 : band / 2}px; display: grid;
      gap: ${Math.round(mx * 0.35)}px; grid-auto-rows: max-content; align-content: ${portrait ? 'start' : 'safe center'} }
    .card { background: #fbf8f3; border-radius: ${Math.round(radius * 0.8)}px; overflow: hidden; box-shadow: 0 ${radius / 2}px ${radius * 2}px rgba(0,0,0,.35) }
    .card img { width: 100%; display: block }
    .label { font: 600 ${Math.round(sub * 0.75)}px system-ui, sans-serif; color: #7a2e14; padding: ${Math.round(sub * 0.5)}px ${Math.round(sub * 0.7)}px 0;
      text-transform: uppercase; letter-spacing: .06em }
  </style></head><body><div class="caption"><h1>${(o.desktop && scene.desktopTitle) || scene.title}</h1><p>${scene.sub}</p></div>${body}</body></html>`
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(OUTPUTS)
const server = spawn(join(ROOT, 'server/bin/tipitaka_app'), ['-listen', `127.0.0.1:${PORT}`, '-no-open'], { cwd: ROOT, stdio: 'ignore' })
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break } catch { /* starting */ } await new Promise(r => setTimeout(r, 200)) }
  browser = await chromium.launch()
  for (const name of want) {
    const o = OUTPUTS[name], dir = join(OUT, name), raw = join(OUT, '.raw', name)
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); mkdirSync(raw, { recursive: true })
    const portrait = o.h > o.w, mx = Math.round(o.w * (portrait ? 0.07 : 0.06)), band = Math.round(o.h * (portrait ? 0.2 : 0.16))
    const cssH = Math.round(o.css * (o.h - band) / (o.w - 2 * mx)) // the screen fills the frame below the caption
    for (const [n, scene] of SCENES.entries()) {
      const img = await render(scene, o.css, cssH, raw)
      const html = join(raw, `${scene.id}.html`); writeFileSync(html, frameHtml(o, scene, img))
      const page = await browser.newPage({ viewport: { width: o.w, height: o.h } })
      await page.goto(pathToFileURL(html).href); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200)
      await page.screenshot({ path: join(dir, `${n + 1}-${scene.id}.png`) }); await page.close()
    }
    console.log('wrote', dir)
  }
} finally {
  await browser?.close()
  server.kill()
}
