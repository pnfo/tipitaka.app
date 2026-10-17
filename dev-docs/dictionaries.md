# Dictionaries

`npm run build:dict` writes `db/dict.db` from the dictionaries of `DICTS` (`build/dict.ts`). Each dictionary is read by an
importer (`build/dicts/*.ts`, default `v2.ts`: the v2 file `server-data/dicts/<code>.db`). Newer editions come from the
sources pinned in `data/dicts.lock`, which are downloaded into `.cache/dicts` by `npm run upstream -- --dicts`, and from
the `data/dicts/sinhala` submodule. The daily sync workflow moves the pins (`--dicts-latest`, `git submodule update
--remote`) and opens a PR when a source changed. The build reports are in `.cache/dicts/reports/<code>.tsv`.

## Sources and licences

| code | edition | importer | licence |
|---|---|---|---|
| en-dppn | Malalasekera, *Dictionary of Pāli Proper Names*, revised by Ānandajoti Bhikkhu (2025), `DPPN.json` of ancient-buddhist-texts.net | `dppn.ts` | CC BY-SA 4.0 |
| en-pts | Rhys Davids & Stede, *PTS Pali-English Dictionary*, edition of Ānandajoti Bhikkhu (2025), `PTSPED.json`, with the bold of the v2 copy (DPR / DSAL) | `pts.ts` | © PTS, CC BY-NC 3.0 |
| en-critical | *A Critical Pāli Dictionary* (a – kāreti), cpd.uni-koeln.de as scraped by DPD (`other-dictionaries`) | `cpd.ts` | not stated; free to search |
| en-nyanatiloka | Nyanatiloka, *Buddhist Dictionary*, as collected by DPD (1,406 entries; v2 had 893) | `nyanatiloka.ts` | © BPS, not stated |
| en-ncped | *New Concise Pali-English Dictionary* (SuttaCentral `sc-data`); replaces en-buddhadatta (settings are migrated) | `ncped.ts` | not stated |
| si-buddhadatta, si-sumangala | github.com/pnfo/pali-sinhala-dictionary (submodule) | `sinhala.ts` | — |
| th-bhumibol | v2 (from a pdf), repaired with en-pts | `thai-pts.ts` | — |
| vi-pced, ko-pced | PCED by Alobha (`.mdx`, read by `mdx.ts`): Bửu Chơn / Tịnh Sự / Giác Nguyên Pali-Vietnamese, Korean PTS translation | `pced.ts` | not stated: **opt-in** |
| others | v2 files | `v2.ts` | — |

**Opt-in** dictionaries (`optIn` in `DICTS`, `dict.opt_in`) are not part of "all dictionaries", which is the default
setting (`settings.dicts = []`). The user has to choose them in the dictionary filter. PCED stays opt-in until its
author confirms the rights.

The PDF at `ancient-buddhist-texts.net/Reference/PTS/Pali-English-Dictionary.pdf` is the 2009 dharma.org.ru extraction
of the same DSAL text as the v2 copy, so it is not used.

## Pali-Myanmar and the breakups (`build/dicts/myanmar.ts`)
* **AB (my-23-vol) and HS (my-u-hoke-sein):** already the best copies there are, the Unicode text of PCED's
  `pali-myanmar-uni.mdx` (2023; a source survey found nothing better).
* **AA (my-android):** joins segments of several sources (`text♦tag+text♦tag`: မြ the Abhidhān in an older wording,
  စိန် Hoke Sein, ချုပ်, ဝိ Visuddhārum). The app shows each segment on a line of its own with its source named. A
  lossy Zawgyi conversion of the app's data turned the stack ဍ္ဎ into ှ (ဝှတီတိ for ဝဍ္ဎတီတိ). A word with ှ gets
  ဍ္ဎ back when that makes it a DPD word form, which restores 191 words. Burmese words (with asat) are left alone.
* **Zawgyi leftovers:** in all three, `fixZawgyi` converts the leftovers of the Zawgyi font's kinzi (ၤ written after
  its consonant; ႋ ႌ ႍ kinzi with -i -ī -ṃ) to Unicode, with the signs in storage order: အကုၤရ → အင်္ကုရ,
  သချုႋင်း → သင်္ချိုင်း. That fixes 94 entries of HS, 1 of AB and about 200 of AA.
* **PCED's Hoke Sein is not used:** checked 2026-10-17, it adds nothing. Its "60,701 records" are about 51,000 entries
  stored twice (under a plain key and a diacritic key). Its 6,568 extra headwords are empty, and 215 of the other
  230 are our entries under broken spellings. That leaves 15 phrases.
* **Breakups:** these are the splits of the etymology brackets of the Abhidhān, from PCED's Pali Word Grammar
  (`pced-my` in `data/dicts.lock`): 150k words, with their gender. The v2 breakups had been scraped from the same
  brackets. Their `origin` held the whole bracket, with Burmese notes converted as if they were Pāḷi (the garbage
  under "Breakup"). They are only the fallback now.

## Meaning markup (`build/dicts/markup.ts`)
Meanings are html in a small vocabulary that `web/src/composables/dict.ts` `cleanMeaning` allows (DOMPurify; links
have no href):

* `<a data-dict="word" data-hom="2">`: a cross reference. DictView looks the word up; on the dictionary page it
  navigates, and in the panel it has a back button. The exact matches of the referring dictionary are highlighted.
* `<a data-ref="<key>#<paragraph>">`: a text reference, which opens the reader there.
* `<abbr data-a="SN">`: an abbreviation, explained by the dictionary's list (`dict_abbrev`, `Dict.abbrevs`) in a
  popover.
* `<span class="ed-add">`, `ed-mod`, `ed-orig`: Ānandajoti's additions, modernised wording and original spellings.
* Classes `sc` (small caps), `lnum` (line numbers, page notes), `gram` (grammar labels) and `dict-head` (the rest of
  a headword line).

`entry.hom` is the homonym number. Variant headwords are rows with `alias_of` (an empty meaning), so that a lookup
of the variant shows the entry once.

## Text references (`refs.ts`, `text-index.ts`)
References are marked when the abbreviation is part of a reference: `SN.v.112` (DPPN) and `S V 112` (PTS). They are
linked when the page exists in `db/text.db`. The PTS page markers `|P5.0112|` of the paragraphs follow the PTS
volumes for the books in `BOOK_FILES`: Vinaya, the four nikāyas, Jātaka (commentary), most commentaries, Miln,
Nett, Vibh, Kv and Pp. Books cited by verse or chapter (Dhp, Snp, Thag, Bv, Mhv, …) are not linked. DPPN's
"Ja 90" is linked through the Jātaka names of its headwords ("Akataññujātaka (Ja 90)") to the story of the same
name in the commentary, nearest its number when names repeat (two Tittirajātakas). The fixture build links only
into the fixture texts.

**Targets.** A page reference opens the paragraph where the page begins. When a section on that page is named like
the headword or a bold name of the reference's sentence, the link opens that section instead. Names may differ by up
to two letters for 6+ letters (DPPN's Bhadragaka is the Bhadraka sutta). The reason: the sutta a DPPN reference cites
usually begins partway down its first page, after the end of the previous one.

**Not linked.** DPPN cites MN-a in the Aluvihāra edition and AN-a, Ap-a, Bv-a, Cp-a, Thag-a (and SN-a) in the SHB
edition. Their pages are not the PTS pages of the texts, so these references show the abbreviation only.

**Measured by `npm run ref-check`** (an AI check of a random sample; Opus reads the context and the cited page,
see `db/ref-check.md`). Before these fixes, the cited thing was on the opened page for:
* PTS: 96% of links;
* BB: 94%;
* DPPN: 76%. The losses were mostly the other editions above. Some references are wrong in DPPN itself: SN.iv.228
  for the Uruvelakappa sermon is SN.v.228.

## PTS: bold restored, abbreviation slips (`pts.ts`)
Ānandajoti's edition writes out the abbreviations, modernises the references, uses Unicode Greek and fixes the OCR
errors, but it has much less bold than the print. Each entry is paired with its entry in the v2 copy (headword,
homonym, then the folded headword: 16,015 of 16,346). Their words are aligned (`diff.ts`, Myers), and a word that is
bold in the v2 copy becomes bold, giving 22,061 bold runs.

Fixes and checks:
* "past participle 57" is written back as "pp. 57" (pages, 24 cases).
* The Greek font slips of the edition are corrected: ϛ→ς, ϧ→θ, ϕ→φ, ϖ→ω, ϙ→ρ, ϻ→μ, and Gothic ϸ→þ.
* The report lists the remaining doubts:
  * `expansion?`: an abbreviation that may have been written out wrongly, e.g. "derc" → "derived".
  * `unmatched-bold`: bold words that were not placed.
  * `new-only` / `old-only`: entries that only one edition has.

## Pali-Thai repair (`thai-pts.ts`)
1. **Mechanical fixes:**
   * The private-use glyphs of the pdf fonts (U+F700–F71A → ฐ ญ ํ …).
   * นํ้า → น้ำ, and ํา → ำ in Thai words.
   * Doubled tone marks.
   * `‚…‛` → “…”.
   * A lone pinthu + nikhahit → °.
2. **Pinthu followed by a vowel** (always wrong):
   * In Thai words (which have tone marks), the pinthu is dropped.
   * In Pāli words, the repair is made only when exactly one candidate gives a word of the English PTS entry or a
     DPD word form. The candidates are a missing consonant (ปติฏฺาสิ), a vowel written before its consonant
     (เสฏฺิฐี), or a stray pinthu.
3. **Greek of the etymologies:** the Greek is garbled ("Gr. Xqeoc") or lost. It is taken from the English homonym
   with the most cognates in common, aligning the Latin-script words of both entries.
4. **Manual fixes:** `data/dict-fixes/th-bhumibol.tsv` (word, from, to) is applied last.

61 places are still left (report `gap`). Missing tone marks (เปลียน for เปลี่ยน) cannot be found this way.

## AI revision of the Pali-Thai PTS (`scripts/dict-ai.ts`, `build/dicts/thai-ai*.ts`)
The repaired BB text is revised against the English PTS 2025 by Claude on the plan usage (`claude -p`, the shared
runner `scripts/lib/claude.ts`; every call cached in `.cache/dict-ai`, runs resumable):

* **System prompt:** `data/dict-ai/th-pts-style.md`. It holds the task rules (keep BB's correct wording, correct,
  add what is missing in `<span class="ai-add">`, translate missing homonyms, put misfiled BB entries in "others"),
  the markup, Thai-script Pāḷi, and BB's grammar, etymology and reference conventions. These were mined from the
  paired entries.
* **A job is a headword:** all English homonyms with all BB entries of it, or a BB entry the English lacks.
  * Small jobs are batched (up to about 3,500 characters).
  * English entries over 12k characters go in parts cut before compounds.
  * `src` hashes the sources: when one changes, the stored result is stale and the build falls back to the repaired
    BB.
* **`npm run dict:ai -- pilot`:** a stratified sample of 60, Sonnet against Opus, judged blind by Opus →
  `db/dict-ai/pilot-r<N>.md`.
  * The gate: Sonnet's mean is at least Opus's mean minus 0.25, and its major-error rate is no more than Opus's
    plus 3 points.
  * If Sonnet fails, the prompt is revised and Sonnet runs again (rounds 1–2, against Opus's round-0 output).
  * If it still fails, Opus does the run.
* **`npm run dict:ai -- run --model <m>`:** writes `data/dict-ai/th-bhumibol.jsonl` (committed).
  * Results that fail the checks (`thai-ai-check.ts`: BB text kept, English references present, Thai-script Pāḷi
    known, no garbling) are asked again of Opus.
  * Report: `db/dict-ai/run-report.md`.
* **`npm run dict:ai -- spot`:** an Opus review of a random sample of the stored results → `db/dict-ai/spot.md`.
* **In the app:** passages translated by AI carry a small "AI" mark that explains them on tap. BB's references
  (ชา.1/9) are tap-to-explain and link into the reader (`THAI_BOOKS` in `refs.ts`).

### Pilot (2026-10-16, 60 headwords, Opus judging blind; scores 1–5, major = entries with at least one major error)
| round | prompt change | Sonnet | Opus (round 0) |
|---|---|---|---|
| 0 | first prompt | 4.06, 68% major | 4.56, 35% major |
| 1 | working method: copy BB verbatim where it is right, `ai-add` every addition, Pāḷi letter table, reference rules | 4.28, 53% | 4.53, 40% |
| 2 | check every BB gloss's meaning and spelling against the English, smaller batches | 4.32, 57% | 4.49, 40% |

**Where Sonnet stands after round 2:**
* It matches Opus on short, garbled and BB-only entries.
* Fidelity to BB is higher than Opus's (4.65 against 3.97).
* It stays behind on long and truncated entries, on accuracy and on Pāḷi spelling: it keeps more of BB's wrong glosses and
  misspellings.

The gate failed in every round, so the run uses **Opus** with the round-2 prompt. Opus's main fault in the pilot was
needless rewording of BB, which the round-1/2 rules address.

**Scale:** at pilot rates, the whole dictionary is about 2,300 Opus calls, about 20M input and 13M output tokens.
