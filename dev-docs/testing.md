# Testing

| command | what |
|---|---|
| `npm test` | Vitest: markup/tokenizer/normalisation, script converter goldens (writes `server/convert/golden.json` for Go), XML parser, catalog, tree + key snapshot of the fixture corpus (`build/__snapshots__/fixture-keys.txt`), paragraph links, fts offsets, web data layer (HTTP + native bridge sources, cache, SSR prefill), stores (v2 settings / bookmarks migration), highlighting |
| `cd server && go test -race ./...` | engine on the fixture dbs (tree, text, links, titles, fts semantics incl. suffix/phrase/filters/paging, dictionaries, DPD lookup, bridge JSON), HTTP API (status codes, cache headers, no `/sql-query`), SSR (title, canonical, alternates, conversion, 404s), sitemaps, legacy redirects, markup, Go converter (`server/pali-converter`) == JS goldens |
| `go test -run XXX -fuzz FuzzSSRPath .` | fuzzes url parsing / rendering |
| `TIPITAKA_DB=../../db go test -run TestFullCorpus -v ./engine/` | timings of typical and broad searches on the full corpus |
| `npm run test:e2e` | Playwright against the real Go server and fixture dbs: chromium, webkit, firefox, Pixel, iPhone, and `android-sim` (app build + simulated bridge). Reader (start position, lazy loading, script switch, `#p` targets, notes, groups, 404, bare keys), search (suggestions, combos, options, filters, wildcards, other-script input, titles), dictionary (tap lookup, DPD), settings/bookmarks/history + v2 migration, SSR without JS, API security |
| `npm run check:css` | built CSS against the target browsers |
| `npm run lint`, `npm run typecheck` | eslint, vue-tsc |

The fixture corpus is `e2e/fixtures/xml` (truncated copies of 8 upstream files, `tsx build/make-fixtures.ts`).
The fixture dict.db contains only the fixture text's words (needs `.cache/dpd`: `npm run upstream -- --dpd-only`).

Firefox may not start in sandboxed environments; CI runs it.

## Script converter against native texts
The gold standard is Pāḷi typed by native users, not VRI's script editions, which are machine transliterations.

`npx tsx scripts/converter-native.ts <script> <native text files…>` converts every native word back to Roman. When that
Roman word is a CST word but the converter spells it differently, it counts the difference, by the part that differs.

Sources used on 2026-10-17:
* **Thai:** the Siam Rath edition of the E-Tipitaka app (`download.watnapahpong.org/data/etipitaka/android/pali.zip`,
  `palinew.zip`).
* **Myanmar:** the Burmese nissaya of IAPT (`github.com/iapt-platform/digital-nissaya`, `NsyUni/028.txt`), the
  Tipiṭaka Pāḷi-Myanmar Dictionary (my-23-vol) and its headword list (pndaza, `tipitaka_abidan.db`).

With pali-converter PR #1, the differences from native text are 0.01% of tokens for Thai, 0.01% for the Myanmar
nissaya, and 0.24% for the headword list (mixed typing there).

Native counts, not VRI, decided:
* **Thai:** iṃ as ึ; e/o before ห ว ร ย น ล ม clusters (เทฺว).
* **Myanmar:** tall aa after ပ္ပ ပ္ဖ ဂ္ဃ ဝှ; ဒါ; the Sangha as သံဃ.

`scripts/converter-check.ts <dir> <files…>` compares with VRI's editions. That is only useful to find candidates (it
found the Tibetan tsheg and the broken reverse conversions).
