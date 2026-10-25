# Places and people (proper names)

Where a sutta or a commentary story was taught, by whom when not the Buddha, who came to the Buddha, and whom a
story is about; and, for a name, every sutta / story it is part of the setting of and the names met in them.
Reader: paragraph menu → *Where was this taught?* (panel tab *Setting*). Pages: `/<script>/names` and
`/<script>/names/<slug>` (slugs are public urls, see below).

## Data flow
```
DPD .cache/dpd/dpd.db ─┐
db/text.db (words) ────┴─ npm run names:gazetteer ─→ data/names/entities.tsv, forms.tsv (committed)
                                                      data/names/geo.tsv (optional: slug, lat, lon, source)
npm run build:data: build/names/settings.ts reads the formulas of the texts with the gazetteer ─→ text.db entity, setting
server/engine/names.go: ops names, entity, settings
```
The text build does not need DPD: the gazetteer is committed. Run `npm run names:gazetteer` after a DPD or an
upstream update (it reads the words of the built text.db), then `npm run build:data`.

## Gazetteer (`scripts/names-gazetteer.ts`)
* **Entities** are the DPD headwords whose `family_set` names a name type: persons (monks, nuns, arahants, great
  disciples, laypeople, Brahmans, royalty, ascetics, paccekabuddhas, previous Buddhas), deities, groups (`people`,
  `family names`: Licchavis, Sakyans), places (cities, villages, countries, rivers, monasteries, mountains, holy
  sites, heavens, hells), animals. One entity per DPD homonym (`ānanda 2` the monk, `ānanda 3` the paccekabuddhas):
  names are not merged across homonyms. DPD's separate elder headwords (`ānandatthera`) are folded into the person
  when only one homonym fits the title.
* **Slugs** are the folded lemma (`savatthi`, `ananda-2`); a written slug keeps its DPD id when DPD renumbers
  homonyms (the previous `entities.tsv` is read first).
* **Forms**: every word of the mūla and aṭṭhakathā books that DPD's `lookup` resolves to a name (`n`), a compound or
  title of a name (`c`: `tissatthera`, `jetavanamahāvihāra`, `sāvatthinidāna`, and title compounds DPD does not have:
  `soreyyattheraṃ`, `ānandaseṭṭhiṃ` (only the homonyms the title fits)), or a word derived from it (`d`: `vesāliya`
  "of Vesālī"). `not_names` lists the other DPD headwords of the form: `ānanda` "joy", `sakka` "able",
  `māṇava` "young man" make a form ambiguous.

**One name twice in DPD** (`data/names/same.tsv`, `npm run names:same`): headwords of variant spellings of one name
(nālandā / nāḷandā, mahāmoggalāna / mahāmoggallāna, payāga 1 / payāgā 1). The candidates are the names of one type that
DPD lists as variants of each other (`variant`, `var_phonetic`, `var_text`: 329 pairs); Gemini judged them from both
meanings and their linked DPPN entries (2026-10: 283 same, 46 different; 5 overruled by hand, `manual`). A group of the
same is one name: the one most named in the texts keeps the others (`same_as`), which stay in the forms with their own
homonym numbers (a word is told from its namesakes as before) and give it their mentions, settings and coordinates.
Two homonyms of one headword are never merged (DPD numbers them as different ones). A page takes the plain slug of its lemma when no other page has
it (nāḷandā: `nalanda`; the merged-away names, which have no page, move aside); the slugs of geo.tsv and of the
decisions follow such renames.

## Descriptions in the interface languages (`build/names/translations.ts`)
The meaning and category of a name in Sinhala or Thai: `data/names/i18n/<lang>/meanings.tsv` and `families.tsv`
(en, <lang>), keyed by the English text, so a rebuilt gazetteer only needs the new texts. Sinhala is tipitaka.lk's
(Gemini, reviewed there; `dev/names-si`; copy its two files over after a run there). Thai is made by
`npm run names:translate -- th` (Gemini gemini-4-argon, the same rules adapted to Thai, GEMINI_API_KEY; 2026-10: 4,024
texts, $1.70; reviewed on samples: `--sample 50 [--offset n]` prints a spread without writing). Rows are only added: a row
corrected (or deleted, to be translated again) by hand stays. The build writes table `entity_tr`; the names ops of the
engine take `lang=` and add `meaningLocal` / `familyLocal` (the English fields stay: the client's rules read them).

## Settings (`build/names/settings.ts`)
Read only from the fixed formulas, so that precision is high:

| text | formula | roles |
|---|---|---|
| mūla nidāna | *ekaṃ samayaṃ bhagavā sāvatthiyaṃ viharati jetavane …* (to the end of the sentence with the dwelling verb; *tadavasari. Tatra sudaṃ …* continues) | place (all, in order), teacher (a person named before the place: *ekaṃ samayaṃ āyasmā ānando …*) |
| Vinaya | *tena samayena buddho bhagavā vesāliyaṃ viharati …* | place |
| SN | *Sāvatthinidānaṃ.*, *Sāvatthiyaṃ jetavane.* opening a sutta; a sutta without a nidāna takes the place of the sutta before it in the saṃyutta (`inherit`) | place |
| mūla, first 3 paragraphs of a sutta | *… yena bhagavā tenupasaṅkami*, *ekamantaṃ ṭhito kho X devaputto …* | with |
| aṭṭhakathā stories | *… satthā jetavane viharanto tissattheraṃ ārabbha kathesi*, *… viharanto kathesi. Kaṃ pana ārabbha …? X*, *ayaṃ dhammadesanā kattha bhāsitāti? Sāvatthiyaṃ. Kaṃ ārabbhāti? Cakkhupālattheraṃ.* | place, about |

* A name form that is also a common word counts as a person only next to an honorific or a title (*āyasmā
  ānando*, *sakko devānamindo*, *X nāma*); a title picks the homonym (*Suppiyo paribbājako* the wanderer).
  Locative plurals of peoples are places (*sakkesu* among the Sakyans).
* Units are paragraph ranges: the sutta node in the mūla (nearest ancestor titled *…suttaṃ*, else the node), the
  story in the aṭṭhakathā (its node; Jātaka-a: the paragraphs up to the *…jātakavaṇṇanā* trailer).
* A story's setting is given to the mūla paragraphs it explains (paranum links): Dhammapada verses, Jātaka,
  Petavatthu, Vimānavatthu … (source `atta`, the commentary row is then `listed = 0`). A mūla sutta with its own
  setting keeps it.

## Quality (`npm run names:eval` → db/names-eval.md)
Built 2026-10: 7.9k setting rows; a place for DN, MN, SN, Udāna (≈ 99–100% of the suttas), every Dhammapada story
and verse, 511 Jātaka stories; teachers / interlocutors agree with the named ones in DPD `sutta_info` in 77% (most
differences are both right: DPD names the audience, we name the visitor). Hand-checked samples: no wrong place in 55 units;
interlocutors 38 of 40 (errors: homonyms, since fixed by the title rule).
Not covered: most AN suttas (no nidāna: 10–36%), Itivuttaka, commentary stories told without the formula, names
DPD does not have (many commentary people: the DPPN has 13.6k names), homonyms beyond the title rule.

## Coordinates and the map (`npm run names:geo`)
Sources pinned in `data/names/sources.lock` (downloaded into `.cache/names/`): SuttaCentral's
`additional-info/map_data.json` (places, the mahājanapadas and regions as polygons, the journeys of DN 16 and Sn 5;
SuttaCentral's own material is CC0), the `location` / `precision` tags of SuttaCentral's DPPN, and Natural Earth 10m /
50m (public domain: land, coastline, rivers, mountain ranges, country borders).
* `data/names/geo.tsv` (slug, lat, lon, prec, source) → `entity.lat/lon/prec`. A name gets SuttaCentral's point,
  else the DPPN's; homonyms (the two Mahāvanas) take the candidate nearest the place their DPD meaning names;
  spellings are aliased (nātika / ñātika = nādikā, veḷuvagāmaka = beluva); a place without one is put at the place
  its meaning or DPPN entry names ("a park in Rājagaha": prec 4). 98% of the place settings are located; the rest
  are places nobody has identified (Kimilā, Anupiyā …): no coordinates are invented.
* `web/src/assets/map/basemap.json` (~140 KB): the drawing of the map, clipped to South Asia and simplified. Rivers
  carry their Pāḷi names (Gaṅgā, Yamunā, Sarabhū, Mahī …), the Himalaya is the Himavanta, regions and rivers link to
  their name pages.
* `web/src/assets/map/relief.jpg`: Natural Earth's 1:50m shaded relief cropped to the box (macOS `sips`); draw.ts
  reprojects it row by row to Web Mercator on a canvas and blends it over the land (multiply; soft-light when dark).
* `web/src/map/draw.ts` (lazy chunk, Leaflet 1.9: works without WebGL on the old devices): no tiles are needed, so
  the map works offline in the apps. The base: the drawing, *Today* (OpenStreetMap tiles) or *Satellite* (Sentinel-2
  cloudless 2016 by EOX, CC BY 4.0), remembered per device; tile layers show their required credit, the drawing's
  sources are behind (i). The view stays inside the drawn box. The map is its own stacking context (`isolate`):
  menus open over it. Labels are in the reader's script; overlapping labels give way to the more frequent place;
  countries and districts are regions, never points. Colours follow the theme (`map.css`).
* A place without coordinates has no map (the places around it would suggest a location). The map page opens on the
  middle country, or zoomed in on `?place=`. The Setting tab follows the reading position, a tapped word's paragraph,
  or the paragraph of the menu.
* Maps: the Setting tab (the places of the sutta, the journey of DN 16 / Sn 5 with its length), the name pages (a place
  with the places of its suttas; a person: where they appear), `/<script>/map` (every place sized by its number of
  suttas, `?place=` card with the suttas taught there, `?journey=` the stages with distances in km and yojanas).

## Names the DPD does not have: the DPPN (`build/names/dppn.ts`)
The commentaries name thousands of people and places DPD does not have. `npm run names:gazetteer` reads the DPPN
(Malalasekera, revised by Ānandajoti, CC BY-SA; `.cache/dicts/dppn`): the type of an entry from the first type
word of its first sentence ("A village in Ceylon …" place, "One of the Arahants …" person, "A Yakkha" deity, "A horse"
animal; summaries of suttas, chapters and Jātakas, lists and epithets are no names), "see X" entries as spellings of X,
"X Thera" as the person X. A DPPN name is added when DPD has no name of that spelling and kind (person and deity count
as one) and one of its forms occurs in the texts: the forms are made from DPD's inflection templates by the name's
ending and type (-a masc, a place also nt; -ā fem; -ī fem / masc …) with the sandhi of the texts (-nti, -ñca,
-mpi …). Slugs keep the DPPN entry (`dppn` column `word#hom`); a DPPN name that is a common word of DPD (Loka,
Sumana) makes all its forms ambiguous.

**Links** (`data/names/dppn-links.tsv`, `npm run names:ai -- link`): for a name both dictionaries have (matched by
`linkKey`: no title, no spaces, the final vowel short, so "Vipassī Buddha" is vipassī), each DPPN entry is linked to
the DPD homonym it is about, or marked as a namesake (another one: Yasa the palace, Ānanda the banker), with the kind of
its subject. A name with one DPD and one DPPN entry of the same kind is linked without asking (`auto`); the others were
decided by Opus (`ai`, 2026-10: 2.9k entries, 1.4k linked, 1.5k namesakes; `sure` 0 for 254 whose entry says too
little); `manual` rows are kept. The gazetteer first makes the DPPN names as without the links (so every word keeps how
it is read: kind, common words), then applies them: a DPPN name about a DPD name becomes that name, a namesake keeps its
forms (`namesake` column) and one that is no name goes; the namesakes the spelling rule left out are added. Their forms,
and the DPPN spellings of linked entries, name only words DPD does not know (lumbinīvane, kosalanagaraṃ), never for a
namesake of the kind of a DPD name of its spelling (jetavanavihāro is not the Jetavana of Anurādhapura). A namesake is
never picked over the DPD names of a word (`rankEntities`; it is no "may be another" either): only an AI decision about
the word names it, or being the only candidate.

## Mentions (`build/names/mentions.ts`)
Every word of the mūla and aṭṭhakathā that is a name: `mention(para_id, s, e, entity_id, amb, src)` with the UTF-16
offsets of the word in the stored markup.
* A form that is no common word (sāvatthiyaṃ, sāriputto) is a mention (src form).
* A form that is also a common word (ānando "joy", sakko "able", tisso "three"):
  1. a decision about the very word (`data/names/decisions/<book>.jsonl`, src ai | manual: text-quote selectors like
     the alignment decisions, so they survive upstream changes; e null = no name);
  2. else the verdict about the form (`data/names/form-verdicts.tsv`: name | word | context);
  3. a form of context counts when an honorific is before it (āyasmā) or a personal title after it (thero,
     devaputto, yakkho, brāhmaṇo, māṇavo, gahapati …); "X nāma" and the vocatives (bho, āvuso, mahārāja) are
     followed by common words too often. The others wait for a decision (`npm run names:ai -- mentions`).
* Namesakes (brahmadatta 1 the Jātaka king … 5 Suppiya's student): the words next to the name (a title, rajjaṃ
  kārente, bhagavato), a meaning that names a name of the paragraph ("student of Suppiya"), else DPD's homonym order
  (the most prominent first). A choice that rested on the order alone is unsure: amb = the number of namesakes, and
  the name pages show these mentions apart ("X or a namesake") on the pages of all of them.
* `comention`: the 40 names most often mentioned in the same paragraphs (sure mentions, paragraphs with ≤ 30 names).
* The fixture db does not use the AI verdicts and decisions (tests do not change when runs add some).

AI (`npm run names:ai`, Claude Code on the plan, cached in `.cache/names/ai`): `forms` gives the verdicts (≈ 10k
forms, 40 a call with 4 sample contexts each), `mentions --books … --limit …` the decisions of the words of context
forms, `check --n 300` a stratified spot check of the accepted mentions (precision by source -> db/names-check.md).

Built 2026-10-16: 4,410 names (2,258 from the DPPN), 94.8k mentions (59.9k unambiguous forms, 24.5k by form
verdict, 9.1k by AI decision, 1.3k by rule); 10.2k form verdicts (1.6k name, 7.4k word, 1.1k context) and 21k
decisions cost 255 + 841 calls. Spot check (`check --n 400`, Sonnet as judge): a name 98%, the right name 93%
(form 99/96, verdict 96/88, ai 96/90, rule 98/85); most wrong names are namesakes.

## Server rendering (`server/ssr_pages.go`)
`/<script>/names/<slug>` (title, description with what the texts say of it, JSON-LD Place with its coordinates /
Person / Organization, an article with the suttas taught there, the names met with and the mentions per book, and
the `entity` response for the page), `/<script>/names` and `/<script>/map` (lists of the names: links for
crawlers), `/<script>/dict/<word>` (DPD and the dictionary entries, the `dict` response). Text pages give their
setting as `contentLocation` in their JSON-LD. Sitemaps: `/sitemaps/names-<script>.xml` (the names with a setting or
a sure mention), apart from the text sitemaps (50000 urls at most per file).

## Next
* After an upstream or DPD update: `names:ai -- link`, `names:gazetteer`, then `names:ai -- forms` and `-- mentions`
  ask only for what is new (links, verdicts and decisions are kept; cached calls cost nothing).
* SSR of the name pages (titles, descriptions, sitemaps); more journeys from the mentions (the Buddha's first journey
  from Bodhgayā to Isipatana, the Vinaya's travels).
