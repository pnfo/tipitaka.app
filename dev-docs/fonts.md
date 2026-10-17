# Fonts

## Faces
Every Pāḷi script has its own family `pali-<script>` in `web/src/styles/fonts.css`. Tamil uses Noto Serif Tamil (the
variable Tamil subset of Google Fonts); its superscripts ²³⁴ come from `pali-latn` (Noto Serif / Sans faces in
`web/src/assets/fonts`, regular 400 and bold 700 as separate faces: WebView 53 does not understand weight ranges).
Text in Pāḷi gets `font-family: var(--font-text)`, which `[data-script]` sets per script. Browsers download only the
faces that are used.

The interface language has its own font: `setUiLang()` sets `html[data-ui-lang]`, and `--font-ui` starts with a
`ui-<script>` face (si → Sinhala, my → Myanmar, th → Thai, kh → Khmer, hi → Devanagari; English and Chinese use the
system font). The `ui-` faces have a `unicode-range` of their script only, so Latin text in the interface (English
dictionary meanings, numbers, "English") stays in the system font. The Pāḷi script and the interface language are
independent settings.

## Sizes across scripts
At the same font size the scripts differ a lot in size: the letters of Myanmar and Sinhala fill much more of the em
box than Thai. `scripts/measure-fonts.mjs` measures the letter height of every face (Chromium canvas, the converted
word "mana", which has no ascenders or descenders) relative to the Roman x-height, and `--write` sets the
`size-adjust` of the faces in `fonts.css`.

Pāḷi text (`pali-<script>`): halfway (geometric mean) between
- equal sizes: non-Roman letters at 1.15× the Roman x-height look the same size as Roman, and
- the sizes users know from tipitaka.app v2 (measured there: Sinhala 1.45, Myanmar 1.6, Khmer 1.21, Devanagari
  1.13, Thai 1.1 (shown at 1.5×); the other scripts used the same Noto fonts as now, i.e. their own size).

Interface text (`ui-<script>`): the v2 size, since v2's interface text was 16px in the script font while ours is
mostly 14px (×16/14; English: Times 16px in v2 ≈ system-ui 14px).

| script | own height | Pāḷi size-adjust | interface size-adjust |
|---|---|---|---|
| latn | 1.00 | 100% | |
| sinh | 1.46 | 88.2% | 113.2% |
| deva | 1.13 | 101.1% | 114.5% |
| beng | 1.14 | 100.4% | |
| guru | 1.12 | 101.4% | |
| gujr | 1.11 | 101.8% | |
| telu | 1.35 | 92.5% | |
| knda | 1.49 | 87.9% | |
| mlym | 1.02 | 106.2% | |
| taml | 1.01 | 106.5% | |
| khmr | 1.23 | 96.2% | 112.7% |
| thai | 0.73 | 153.3% | 171.3% |
| mymr | 1.63 | 83.2% | 112.2% |
| laoo | 1.23 | 96.7% | |
| lana | 1.66 | 83.3% | |
| tibt | 1.94 | 77.0% | |
| brah | 1.31 | 93.9% | |

`size-adjust` scales the glyphs and the line metrics of the face. Browsers without `size-adjust` (Chrome < 92, the
oldest Android WebViews) show the unadjusted sizes.

## Type scale of the interface
Rem based, so everything follows the text size setting (below). Pāḷi lists (tree, word forms, hit titles) 15–16px
like v2's 16px; labels, buttons and chips 14px; secondary lines (paths, descriptions) 13px; 12px only for counts and
badges. Section titles are 13px semibold (small capitals in English only, other scripts have no case).

## Text size
One text size for all scripts (`settings.textSize`, reading text in px). The interface follows it: the root font
size, which every rem size uses (tree, dictionary, menus, buttons, spacing), changes by `UI_SCALE` (3/4) of the text
size change, e.g. text 18 → 24px: interface 16 → 20px (`uiFontSize` in `web/src/stores/settings.ts`). Fixed sizes in
the components are therefore written in rem, not px.
