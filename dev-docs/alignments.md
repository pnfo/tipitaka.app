# Commentary alignment (mūla ↔ aṭṭhakathā ↔ ṭīkā)

The reader underlines the words a commentary explains (dashed, in the commentary's colour) and the commentaries'
lemmas (in the colour of the text they quote). Tapping an underlined word shows its explanation in the Commentary tab of the study panel,
hovering highlights both sides, and linked columns scroll word by word. All of this comes from the `gloss` table
(text.db), built by `build/align/` on every `npm run build:data`; `para_link` is derived from it.

## Model
* **Lemma**: a bold run of a commentary paragraph, the quotation of the text being explained, with its sandhi tail:
  `**Sambahulāna**nti` → *sambahulānaṃ*, `**Paṭipanno hotī**ti` → *paṭipanno hoti*, `**Eva**ntiādi` ("and so on":
  the quotation stands for the passage up to the next lemma), `**A …pe… B**`. Bold runs joined only by spaces / page
  refs are one lemma, verse lines quoted in consecutive verse paragraphs are merged (`build/align/lemmas.ts`).
* **Gloss**: lemma → the quoted words of the text (mūla for the aṭṭhakathā, aṭṭhakathā for the ṭīkā), and the
  **explanation**: from the lemma to the next lemma or heading (it can span many paragraphs, so a single word can
  carry pages of commentary; passages without lemmas get nothing). ṭīkā lemmas that quote an aṭṭhakathā lemma are
  chained to its mūla words (`mula-tika`).
* Offsets are UTF-16 offsets into `para.text` of the same build; nothing positional is stored anywhere else.

## Deterministic aligner (`build/align/`, ~10 s for the corpus)
1. `text.ts` folds words (no diacritics, lower case, notes and page refs skipped) and joins them without spaces, so
   sandhi and compounds match either way ("paṭipanno hoti" in "addhānamaggappaṭipanno hoti").
2. `index.ts` cuts each commentary book into **sections** at numbered paragraphs and headings and gives each a
   **window** of the target text:
   * the paranum anchor (`para_link` of `build/links.ts`) to the next section's anchor, or the mirrored node;
   * **seed voting**: lemmas of 8+ letters that occur at most 3 times in the candidate books (same book stem
     `s0513a1` → `s0513m`, `abh03a` → `abh03m1…11`, else the same piṭaka part) vote for a paragraph; when the votes
     disagree with the paranum window, the densest cluster of votes is the window (Jātaka and other verse texts
     restart their numbers; texts without mirrors get windows at all);
   * books whose paranums disagree with the seeds more often than not: sections without seeds continue after the
     previous section's last match;
   * sections without paragraph numbers are mirrored by **title** where keys do not mirror (Paṭhamapārājikakathāvaṇṇanā →
     Paṭhamapārājikakathā, `titleKey`), and long ones are cut in pieces of 15 paragraphs, each placed by its seeds or
     after the previous piece's matches (a whole chapter of commentary does not fit one window).
   * **which books** a commentary explains: the book stem, else `build/align/books.ts` (`COMMENTS_ON`: anuṭīkās on
     mūlaṭīkās, the Vinayavinicchaya-, Abhidhammāvatāra-, Visuddhimagga-ṭīkās …, checked by the share of the
     commentary's long lemma words found in the target), else books its long lemmas vote for. `SELF_COMMENTARY`: books
     with the root text and its commentary in one file (Abhidhammatthasaṅgaha + Vibhāvinī, Khuddasikkhā + ṭīkās,
     Abhidhammamātikā + Mohavicchedanī); `NOT_COMMENTARY`: base texts in the ṭīkā collection.
3. `match.ts` finds candidates (short words must be whole words, 5–7 letters may end a compound, the inflected form
   with one or two letters less as a fallback) and picks the best **order preserving** chain over the section
   (weighted LIS): commentaries explain in order, which places repeated words (evaṃ, bhikkhave). Lemmas outside the
   chain (the commentary returns to an earlier word) get their nearest candidate with confidence × 0.6.
4. ṭīkā lemmas not found in the aṭṭhakathā window are looked for in the mūla paragraphs that window explains
   (a ṭīkā quotes the mūla too: kind `mula-tika`).
5. Stored decisions (below) replace or remove matches; extents and the ṭīkā chain are computed last.

Coverage is in the build report (`## Alignment`, per book) and `data/align-coverage.tsv` (committed: the sync PR
shows changes; a book losing more than 2 points is a warning). Corpus at 05d5d3c: aṭṭhakathā 84%, ṭīkā 64% of the
lemmas (deterministic only); after the book relations, title mirrors, pieces and the ṭīkā → mūla pass:
aṭṭhakathā 84.6%, ṭīkā 79.5%, añña commentaries 69.8%.

Pilot (DN aṭṭhakathā + ṭīkā, Dhammapada aṭṭhakathā, 2026-10-15):
* deterministic precision 92% (AI spot check of 491 glosses, strata weighted; verse 98–100%, the `trim` / `reorder`
  strata 60–80%); the spot check found the fixes now in the matcher (inflection only at word ends, earlier occurrence
  of repeated phrases, ṭīkā lemmas prefer the aṭṭhakathā's bold lemmas, a re-explained word is the one matched before);
* AI resolve of the 4312 lemmas left: 1371 matched, 1924 not quotations, 921 quoting words outside the window
  (1098 calls, 6.0M input tokens, ~32 min with 4 parallel, Sonnet); spot check of the AI matches 76% (many of the
  flagged spans are compound members the checker still counts as wrong);
* coverage with the decisions: DN aṭṭhakathā 92% (98% of the actual quotations), DN ṭīkā 86–90%, Dhammapada 84%. Most of the rest are paraphrases and references to other texts (not quotations), and ṭīkās on aññā texts
(Vinayavinicchaya-, Abhidhammāvatāra-, Abhidhammatthasaṅgaha-ṭīkā: their targets are not mūla / aṭṭhakathā books
yet - needs section maps to anya books).

## Evaluation: `npm run align:eval`
`data/alignments/gold/*.jsonl` is a reference alignment of 545 lemmas from 22 books (prose, verse, Vinaya, Abhidhamma,
ṭīkās, an añña ṭīkā), made by `npm run align:ai -- gold`: Opus with Grep / Read over the whole corpus as text
(`.cache/align/corpus`, written by `npm run align:ai -- export`) finds each lemma's words, independently of the
aligner (88 calls, ~$8 API equivalent). The rows are decisions (same selectors), so they survive upstream changes;
correct one by hand and set its `src` to `gold:manual`. `npm run align:eval [-- --no-decisions] [--books …]` scores
the aligner against it in ~20 s without AI calls (precision, recall, per book and source, the errors with context;
the next run prints the change): run it after every matcher change.

2026-10-15: deterministic precision 92.4%, recall 86.7% (F1 89.4%); with the AI decisions 92.5% / 87.9%.
2026-10-16, after the AI resolve of all Tipiṭaka commentaries (≈ 10k calls, ≈ $420 API equivalent on the plan, two
waits for the session limit): 92.3% / 90.5% (F1 91.4%). Lemmas matched or found to be no quotation: aṭṭhakathā 94.4%,
ṭīkā 95.0%. 2026-10-21, `resolve --search` (Sonnet with Grep / Read over the corpus, up to 8 lemmas per call) on the seven books
with the most lemmas outside their windows (Pārājika-, Pācittiyādi-, Vibhaṅga-ṭīkā, Jātaka, Theragāthā, Apadāna,
Suttanipāta): 5225 of ~6350 lemmas matched (verse commentaries ~95%: their misses were windows, not quotations), 950
calls, ~1.6 h, ~$57 API equivalent; spot check of the AI matches in the verse books 94%. Eval 92.4% / 91.5% (F1
91.9%); aṭṭhakathā lemmas matched 91.0%. 2026-10-21/22, --search on the remaining 43 books (≥ 30 open
lemmas): 7906 matched, 1123 not quotations, 418 not found (~$113, one wait for the session limit); spot check of
their AI matches 80% (Vinayavinicchaya-ṭīkā 63%, the others 82-94%). Eval 92.2% / 92.0% (F1 92.1%). Lemmas matched
or found to be no quotation: aṭṭhakathā 99.6%, ṭīkā 99.3%. Not run: the Abhidhānappadīpikā- and Subodhālaṅkāra-ṭīkās
(lexicon, poetics, ~7.7k lemmas) and 34 books with < 30 open lemmas. Most
remaining errors are repeated passages (refrains, question and answer) where the commentary explains another
occurrence than the one chosen.

**AI section maps** (`npm run align:ai -- sections --books …`, which section of the text each commentary section
explains, written as section anchors `<book>.sections.tsv`) were tried with Sonnet and Opus (they agree on ~90%):
they did not help - Vajirabuddhi-ṭīkā precision 91% → 82% with the Opus map - because one window per section is
coarser than the seed / title / piece windows. Not used; the command remains for books nothing else places.

## Stored decisions: `data/alignments/*.jsonl` (AI or manual)
```json
{"c":{"k":"atta-dn-1-1-1","q":"patipannohoti","pre":"metiadininamapadani","o":31},
 "m":{"k":"dn-1-1-1","q":"addhanamaggappatipannohoti","pre":"antaracanalandam","o":17},
 "v":"match","conf":0.85,"src":"ai:sonnet"}
```
`c` (lemma) and `m` (quoted words) are **text quote selectors** over the folded words of a node: `q` the words, `pre`
the words before them, `o` a word offset hint. `v`: `match`, `not-lemma` (bold text that quotes nothing: a defined
term, a reference) or `none`. `src`: `ai:<model>`, `ai-check` (spot check correction), `manual` (wins). Files are
sorted, one decision per line, so diffs review well. `data/alignments/*.tsv` are paragraph links
(`from_key from_para to_key to_para [source] [conf]`, para = number or `#n`), used as section anchors (e.g. AI
section maps for texts without mirrors).

**Upstream corrections**: positions are recomputed from the text on every build. A selector whose words are gone is
reported in the build report (warning) and its lemma is aligned like any other; one whose preceding words changed is
used and reported as drifted. `npm run align:ai -- resolve --repair` lists them and asks again only where needed:
AI calls are cached by their input (`.cache/align/ai/`), so only sections whose text changed are sent.

## AI (`scripts/align-ai.ts`, Claude Code on the plan usage)
```
npm run align:ai -- spot-check [--books s0101a,…] [--n 300] [--seed 1] [--apply]   # -> db/align-spot-check.md
npm run align:ai -- resolve    [--books …] [--limit 50] [--repair]                 # -> data/alignments/<book>.jsonl
  --jobs 4 --model sonnet --dry
```
* `spot-check` samples the deterministic glosses stratified by book × verse/prose × match kind × confidence and asks
  for a verdict (correct / wrong target / wrong span / not a lemma) in batches of 15; the report has the precision
  with a 95% interval per stratum and the errors with their contexts, to fix the matcher in code. `--apply` stores
  the corrections as `ai-check` decisions.
* `resolve` sends each section's unplaced lemmas (marked in the commentary) with the section's window of the text,
  and stores the answers whose quote is found in the window.
* Runs `claude -p --output-format json --json-schema … --tools "" --system-prompt …` (CLAUDE_BIN, `claude` on PATH or
  the VS Code extension's binary), N in parallel, retries rate limits.

## Reader (`web/src/composables/glosses.ts`)
Tapping an underlined word: the dictionary as before, the Commentary tab of the study panel shows its explanation
(with a count on the tab); an open panel stays on its tab, so reading the commentary word by word keeps it in view.
`glosses` op (`server/engine/text.go`) returns the glosses touching a paragraph range from both sides. `paraHtml`
gets the spans (`shared/markup.ts` wraps text runs at span boundaries in `<span class="gl …" data-g="ids">`).
Column sync maps the reading line through the anchors both columns have (order consistent pairs only, interpolated
between them) and falls back to paragraph links. `?align=debug` colours underlines by source and confidence
(AI blue, ṭīkā chain violet, low confidence red). Setting: "Underline the words explained in the commentaries".
