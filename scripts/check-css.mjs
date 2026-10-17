/** fails when the built CSS uses features the target browsers (old Android WebViews / iOS 12) lack */
import fs from 'node:fs'
import postcss from 'postcss'
import doiuse from 'doiuse'

// layout must work from Android System WebView 64 (2018, auto updated on Android 7+) and iOS 12. The js legacy build
// still runs on WebView 53; there the layout degrades (no grid / flex gap) but stays usable.
const browsers = ['chrome >= 64', 'safari >= 12', 'ios >= 12', 'firefox >= 60']
// features that degrade gracefully (cosmetic) and are accepted
const ignore = ['css-touch-action', 'css-overscroll-behavior', 'css-text-indent', 'css-text-align-last', 'css-selection',
  'css-scrollbar', 'text-decoration', 'css-resize', 'css-appearance', 'css-sticky', 'css-unset-value', 'css-initial-value',
  'outline', 'css-font-rendering-controls', 'font-unicode-range', 'css-filters', 'css-nesting', 'css-cascade-layers', 'css-touch-action',
  'css-overflow', 'css-text-orientation', 'css3-tabsize', 'variable-fonts', 'font-family-system-ui', 'extended-system-fonts',
  'css-not-sel-list' /* tailwind space-x uses :not([hidden]) with a single argument */,
  'css-placeholder', 'mdn-text-decoration-shorthand' /* cosmetic: placeholder colour, underline/strike colour */, 'css-boxdecorationbreak', 'css-backdrop-filter', 'mdn-text-decoration-line', 'mdn-text-decoration-color',
  // cosmetic only: missing spacing between flex items, focus rings, scroll offsets of anchors, a fixed popover width
  'flexbox-gap', 'css3-cursors', 'pointer', 'css-media-interaction', 'css-focus-visible', 'css-focus-within', 'css-snappoints', 'css-math-functions', 'css-display-contents', 'multicolumn',
  // Leaflet's print styles (the map's colours when printed); the map's relief blended over the land (without blending: a
  // translucent grey layer)
  'css-color-adjust', 'css-mixblendmode', 'css3-cursors-grab']
const dir = process.argv[2] || 'web/dist/assets'
const problems = []
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.css'))) {
  const onFeatureUsage = u => {
    const css = String(u.usage)
    if (u.feature === 'css-math-functions' && !/(^|[^x])(min|max|clamp)\(/.test(css.replace(/minmax\(/g, ''))) return // grid minmax() is fine
    if (u.feature === 'css-matches-pseudo' && /:where\(/.test(css) && !/:is\(/.test(css)) return // tailwind preflight :where() rules are dropped harmlessly
    problems.push(`${f}: [${u.feature}] ${u.featureData.title} - ${css.slice(0, 120)}`)
  }
  await postcss([doiuse({ browsers, ignore, onFeatureUsage })])
    .process(fs.readFileSync(`${dir}/${f}`, 'utf-8'), { from: f })
}
const unique = [...new Set(problems.map(p => p.replace(/<css input>:\d+:\d+: /, '')))]
if (unique.length) { console.error(unique.join('\n')); process.exit(1) }
console.log('css ok for', browsers.join(', '))
