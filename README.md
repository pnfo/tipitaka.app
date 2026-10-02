# Tipiṭaka.app – Chaṭṭha Saṅgāyana Tipiṭaka

The Pāḷi Tipiṭaka with aṭṭhakathā, ṭīkā and other texts (VRI Chaṭṭha Saṅgāyana edition) in 22 scripts, with
full text search, title search, tap-to-lookup dictionaries (Digital Pāḷi Dictionary and 23 others) and a
mūla / commentary parallel view. The same code runs the website (https://tipitaka.app), the desktop apps and the
Android app (iOS ready).

* Texts: [VipassanaTech/tipitaka-xml](https://github.com/VipassanaTech/tipitaka-xml), synchronised automatically
  (daily workflow → pull request with the changed texts).
* Script conversion: [@pnfo/pali-converter](https://github.com/pnfo/pali-converter) (shared with open.tipitaka.lk).
* Dictionary: [DPD](https://www.dpdict.net/) by Bodhirasa Bhikkhu (CC BY-NC-SA 4.0) and the v2 dictionaries.

## Quick start
Requirements: Node 22+, Go 1.26+ with a C compiler (cgo sqlite).
```bash
npm ci
npm run upstream -- --dpd   # fetch the pinned VRI xml and DPD into .cache/
npm run build:data          # db/text.db   (~20 s)
npm run build:dict          # db/dict.db   (~20 s)
npm run build:web && npm run build:server
server/bin/tipitaka_app -root-path .        # http://localhost:8402
npm run dev                                  # vite dev server on :5155, proxies /api to :8402
```
On macOS, if cgo linking fails with `tapi error`, `source scripts/go-env.sh` first.

## Tests
```bash
npm test                      # vitest (shared, build, web)
npm run test:go               # go engine + server on the fixture dbs (npm run build:fixture && npm run build:dict:fixture)
npm run test:e2e              # playwright: desktop + mobile browsers + android bridge simulation
npm run lint && npm run typecheck && npm run check:css
```

## Documentation
* [dev-docs/architecture.md](dev-docs/architecture.md) – design, key and url scheme, source map
* [dev-docs/data-pipeline.md](dev-docs/data-pipeline.md) – XML → text.db, schema, keys, reports
* [dev-docs/native-bridge.md](dev-docs/native-bridge.md) – Android / iOS apps (gomobile engine + WebView)
* [dev-docs/testing.md](dev-docs/testing.md), [dev-docs/deploy.md](dev-docs/deploy.md), [dev-docs/alignments.md](dev-docs/alignments.md)

v2 (jQuery) is in the git history before the `v3` branch.
