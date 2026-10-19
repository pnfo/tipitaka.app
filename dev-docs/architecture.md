# Architecture (v3)

```
VipassanaTech/tipitaka-xml romn/*.xml  (pinned: data/upstream.lock)      DPD dpd.db (pinned: data/dpd.lock)
        │ npm run upstream → .cache/                                          │ + server-data/dicts/*.db, breakups.db
        │ npm run build:data (build/, Node + better-sqlite3)                  │ npm run build:dict
        ▼                                                                     ▼
db/text.db  book, node (tree), para (Roman markup), para_link, token/posting (fts), legacy,      db/dict.db
            entity/setting (places and people, dev-docs/names.md)
        │
server/engine (Go)  tree · text · links · titles · fts · dict/DPD lookup · legacy · names   — JSON in, JSON out (Call / QueryJSON)
  ├── server/       website + desktop app: GET /api/<op>, SSR, sitemaps, robots, v2 link redirects, static web/dist
  └── server/mobile gomobile bind → Android AAR / iOS xcframework (the apps run the same engine next to the dbs)
web/  Vue 3 + TypeScript + Pinia + vue-router + Tailwind 3.4 (+ @pnfo/pali-converter, DOMPurify, unhead)
shared/  pure TS used by build, web and tests: markup, tokenizer, normalisation, scripts
```

## Key decisions
* **Roman is the stored script.** Upstream romn/ and DPD are Roman; every other script is converted on display with
  `@pnfo/pali-converter` (the same library as open.tipitaka.lk, pinned to a GitHub commit). Roman is shown as stored
  (the converter would lower-case proper names). The server converts for SSR with the Go port of the same library
  (the submodule `server/pali-converter`, github.com/pnfo/pali-converter: tables generated from its `index.js`, 1.8M
  conversions checked against the JS there; `scripts/check-converter.mjs`: same `index.js` as the npm package;
  `server/convert` golden tests JS == Go). It replaced running the JS in goja: ~300 ms a page there, ~5 ms in Go.
* **One engine, everywhere.** Full text search must run next to the data (`*na*` touches ~20k words / 3M offsets), so
  instead of Go + Java (+ Swift) ports the Go engine is compiled into the apps with gomobile. Only small results cross
  the network or the JS bridge. The API is a fixed set of operations (`server/engine/call.go`); no client SQL
  (v2's `/sql-query` ran arbitrary SQL).
* **FTS keeps the v2 semantics** (prefix by default, `*`/`?` wildcards anywhere incl. suffix `*ssa` and infix `*na*`,
  distance/order/phrase, results grouped by word combination) on a token/posting index: GLOB on the folded token
  (`dhamma` ≈ `dhammā`) or on the reversed folded token for suffixes, offsets delta-varint encoded per book.
* **Keys** follow open.tipitaka.lk: `dn-1-1`, `mn-1-1-1`, `kn-dhp-1`, `atta-dn-1-1`, `tika-…`, `anya-vism-1`. From the CST
  div ids where present, otherwise from heading numbers ("1. Sīlaniddeso" → `-1`, intros `-0`), positional only when
  numbers repeat. `data/nodes.tsv` (committed) is the key contract: removed keys fail the build.
* **URLs** `/<script>/<key>` (22 scripts, each an indexable page with hreflang `pi-<Script>` alternates);
  `/<key>` redirects to the saved script; `/<script>/search|titles|dict/<q>`, `/bookmarks`, `/settings`, `/about`.
  Paragraph anchors `#p<idx>`. v2 links `?a=<file>-<line>-<script>` redirect through the legacy map
  (`data/legacy-map.tsv`). History routing on the web/desktop, hash routing in the apps.
* **SSR-lite** (`server/ssr.go`): title, description, canonical, alternates, JSON-LD, `<article id="ssr">` with the
  text and `<script id="ssr-data">` with the API responses (pre-fills the client cache: `op|sorted params`).
* **Reader**: a book is one stream of paragraphs; it opens at the node (or `#p`), loads more when scrolling down,
  earlier text on request. The url follows the heading at the top of the view. Tapping a word looks it up (DPD
  inflection/deconstruction + other dictionaries) - no per-word spans, the word is found with caret hit testing.
* **Tabs (v2 tab views)**: open texts are tabs (`web/src/stores/tabs.ts`, saved in localStorage); the setting
  *Single / Tabs / Columns* decides whether links open a new tab and whether the tabs are shown side by side.
  The url always shows the active tab. "Open alongside" opens the commentary (or mūla) of the current text as a
  column; linked columns scroll together through `para_link`: CST commentary paragraphs carry the paragraph number
  of the text they explain (`build/links.ts`), plus optional manual/AI alignment files (`data/alignments/*.tsv`,
  see `dev-docs/alignments.md`).
* **Full text search UI (v2 layout)**: the matched word forms (combinations) with frequencies, and for the selected
  form the texts (suttas/chapters: `fts` groups, section headings roll up) with hit counts, each expandable to its
  hits in context (`fts` with `group`). Search box: type switch text / titles / dictionary, font of the typed script.
* **Old devices**: Tailwind 3.4, legacy JS build for Chrome 53 / iOS 12; layout checked for WebView 64+
  (`npm run check:css`).

## Source map
| area | files |
|---|---|
| sources | `build/upstream.ts`, `data/*.lock` |
| data build | `build/xml.ts` (TEI parser), `catalog.ts` (books, groups, key rules), `tree.ts` (outline + keys), `links.ts`, `fts.ts`, `write-db.ts`, `legacy.ts`, `validate.ts`, `cli.ts`, `dict.ts` |
| engine | `server/engine/*.go` (`call.go` is the API) |
| server | `server/main.go`, `api.go`, `ssr.go`, `markup.go`, `static.go`, `convert/` |
| apps | `server/mobile/mobile.go`, `web/src/data/api.ts` (NativeSource), `dev-docs/native-bridge.md` |
| web | `web/src/views/Reader.vue`, `components/TextColumn.vue`, `StudyPanel.vue`, `DictView.vue`, `views/Search.vue` |
