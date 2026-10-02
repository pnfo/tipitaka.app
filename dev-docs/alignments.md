# Paragraph alignments (mūla ↔ aṭṭhakathā ↔ ṭīkā)

The parallel view and the "Commentary" panel use `para_link` (text.db), built by `build/links.ts` from:

1. **CST paragraph numbers.** Commentary paragraphs in CST carry the number of the mūla paragraph they explain
   (`<hi rend="paranum">`), ṭīkā paragraphs mostly the number of the aṭṭhakathā paragraph. Inside the mirrored node
   (`atta-dn-1-1` ↔ `dn-1-1`, found on the nearest ancestor that has one) a paragraph links to the paragraph with
   the same first number. ~23k links.
2. **Alignment files** `data/alignments/*.tsv` for texts without numbers or for finer alignment - written by hand
   or with AI help:
   ```
   # from_key   from_para   to_key      to_para   source   confidence
   atta-kn-dhp-1-1   #3      kn-dhp-1    1         ai       0.8
   ```
   `para` is a paragraph number (`num`) or `#n` = the n-th paragraph inside the node. Keys + numbers survive
   upstream corrections better than paragraph indexes. Rows that no longer resolve are warnings in the build report.

`kind` is `mula-atta` or `atta-tika`; `source` is `paranum`, `manual` or `ai`. A future dev tool (similar to
open.tipitaka.lk `dev/align`) can write these files.
