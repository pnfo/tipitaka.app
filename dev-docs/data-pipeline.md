# Data pipeline

```
npm run upstream            # .cache/tipitaka-xml at data/upstream.lock (sparse: romn/, tipitaka.org/romn/)
npm run upstream -- --dpd   # + .cache/dpd/dpd.db of data/dpd.lock
npm run upstream -- --dicts # + .cache/dicts of data/dicts.lock (git submodule update --init: data/dicts/sinhala)
npm run build:data          # db/text.db, db/build-info.json, db/build-report.md, data/nodes.tsv, data/align-coverage.tsv (~30 s)
npm run build:dict          # db/dict.db (after build:data: references link into text.db)         (~20 s)
npm run build:fixture && npm run build:dict:fixture   # e2e/fixtures/db (tests)
```

## Sources
* `romn/*.xml`: 217 TEI files, UTF-16LE. Structure is uneven: the sutta mūla books have nested `<div>`s
  (`dn1`, `dn1_1` …), the rest only heading paragraphs (`p rend=book|chapter|title|subhead|subsubhead`).
* `build/catalog.ts` lists every file once: collection (mula/atta/tika/anya), tree parent, title and the key of the
  book root (div based files derive it from the div ids). Multi-volume books (Jātaka, Apadāna, Visuddhimagga…) are
  one book with several files.

## Markup (`shared/markup.ts`, `server/markup.go`)
`**bold**`, `{variant reading}`, `|M1.0001|` page refs (M Myanmar, V VRI, P PTS, T Thai). Paragraph numbers are a
column (`num`); `hangnum` paragraphs are folded into the next verse. None of `* { } |` occur in the text (validated).

## Tree and keys (`build/tree.ts`)
Divs and heading paragraphs fold into one outline; an unnumbered heading after a numbered one of the same rend is
its child (MN: "2. Sabbāsavasuttaṃ" > "Dassanā pahātabbāsavā"); "(Paṭhamo bhāgo)" volume markers are content.
Heading keys use the heading number when numbers are unique in the parent (intros `0`, `0a`; extras `12a`),
otherwise positions. `build/key-overrides.ts` pins keys when upstream structure changes.

## Schema (`build/write-db.ts`)
```
meta(k, v)            content_hash, db_version (yyMMddHH), upstream, built_at, schema_version
book(id, name, files, coll, title, root_id, para_count, tok_count)
node(id = DFS order, key, parent_id, book_id, kind, coll, rend, title, title_fold, para_start, para_end, depth,
     child_count, prev_key, next_key, mirror_key)
para(id = book_id·2^20 + idx, book_id, idx, node_id, rend, num, text, tok)
para_link(from_book, from_idx, to_book, to_idx, kind, source, conf)     -- paranum / manual anchors + derived from glosses
gloss(id, kind, src, conf, c_book, c_idx, c_s, c_eidx, c_e, x_eidx, x_e, t_book, t_idx, t_s, t_eidx, t_e)
                      -- word level commentary alignment, see dev-docs/alignments.md
token(id, w, fold, rev)  posting(token_id, book_id, offsets: delta varints of book token offsets)
legacy(file, line, key, para)
entity(id, slug, type, name, name_fold, lemma, family, meaning, lat, lon, units)   -- proper names, see dev-docs/names.md
setting(entity_id, role, ord, book_id, para_start, para_end, node_id, title, ev_book, ev_idx, source, conf, listed)
```

## Reports and contracts
* `db/build-report.md`: counts, changed texts / added / removed keys (vs `data/nodes.tsv`), errors, warnings.
  Errors (duplicate or invalid keys, unbalanced notes, removed published keys) fail the build.
* `data/nodes.tsv` is committed: the sync PR diff shows which texts changed upstream.
* `data/legacy-map.tsv` (v2 file/line → key) was generated once from the v2 files by `tsx build/legacy.ts`.

## Dictionaries (`build/dict.ts`)
25 dictionaries (each read by an importer of `build/dicts/`: newer editions from the sources pinned in
`data/dicts.lock` and the `data/dicts/sinhala` submodule, the rest from the v2 files), v2 breakups, and a slim DPD:
headwords (meaning, grammar, construction, root, example), the lookup of 1.2M inflected forms → headwords +
deconstruction + grammar, roots. DPD is CC BY-NC-SA 4.0 (attribution in the app's About page).
Sources, editions, repairs, licences and the meaning markup: [dictionaries.md](dictionaries.md).
