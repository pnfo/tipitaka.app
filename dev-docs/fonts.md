# Fonts

## Faces
Every Pāḷi script has its own family `pali-<script>` in `web/src/styles/fonts.css` (Noto Serif / Sans faces in
`web/src/assets/fonts`, regular 400 and bold 700 as separate faces: WebView 53 does not understand weight ranges).
Text in Pāḷi gets `font-family: var(--font-text)`, which `[data-script]` sets per script. Browsers download only the
faces that are used.

The interface language has its own font: `setUiLang()` sets `html[data-ui-lang]`, and `--font-ui` uses the face of the
language's script (si → `pali-sinh`, my → `pali-mymr`, th → `pali-thai`, kh → `pali-khmr`, hi → `pali-deva`;
English and Chinese use the system font). The Pāḷi script and the interface language are independent settings.

## Equal sizes across scripts
At the same font size the scripts look very different in size: Sinhala and Myanmar letters fill much more of the
em box than Thai. So every face has a `size-adjust` that brings it to the same visual size:

1. Measure, in Chromium with the faces loaded, the height of the letter bodies of `convert('mana', script)` (canvas
   `measureText`, `actualBoundingBoxAscent + actualBoundingBoxDescent`; no ascenders or descenders in this word) at
   100px, and the x-height of Noto Serif (55.6px).
2. `size-adjust = 55.6 / h`, plus 15% for non-Roman scripts (their letters carry more detail than a Roman x-height
   and are hard to read at exactly the same height), clamped to 50%–145%.

| script | size-adjust | | script | size-adjust |
|---|---|---|---|---|
| latn | 100% | | knda | 77.3% |
| sinh | 78.6% | | mlym | 112.8% |
| deva | 102% | | khmr | 93.8% |
| beng | 100.9% | | thai | 145% |
| guru | 102.8% | | mymr | 70.6% |
| gujr | 103.6% | | laoo | 93.5% |
| telu | 85.5% | | lana | 69.4% |
| brah | 88.1% | | tibt | 59.3% |

`size-adjust` scales the glyphs and the line metrics of the face, so it applies everywhere the face is used:
reading text, search inputs, dictionary entries and interface text in that language. Browsers without
`size-adjust` (Chrome < 92, the oldest Android WebViews) show the unadjusted sizes.

## Text size
One text size for all scripts (`settings.textSize`, reading text in px). The interface follows it: the root font
size, which every rem size uses (tree, dictionary, menus, buttons, spacing), changes by `UI_SCALE` (3/4) of the text
size change, e.g. text 18 → 24px: interface 16 → 20px (`uiFontSize` in `web/src/stores/settings.ts`). Fixed sizes in
the components are therefore written in rem, not px.

## Conversion from Roman
Pāḷi has no ai / au diphthongs, but the converter reads Roman "ai", "au" as the Sanskrit diphthongs (ෛ ෞ, and
"undefined" in Thai, Myanmar, Khmer). `fromRoman()` (shared/scripts.ts) and `convert.Convert` (Go) keep the two vowels
apart: sauddesaṃ → සඋද්දෙසං, सउद्देसं as in the VRI Devanagari text.
