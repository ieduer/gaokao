# Print edition (精校打印版)

One proofread, print-ready PDF per exam year, downloaded at `/papers/<year>.pdf` by signed-in readers.

- `print/src/<year>.txt` is the proofread source of a year. It was drafted once from the published bank
  (`print/tools/draft.mjs`) and is edited by hand from then on.
- `print/build.mjs` prints the sources with headless Chrome. This is a local step.
- **The repository and the static site are public, so no readable PDF is ever committed.** The build seals each
  PDF with AES-256-GCM into `papers/<year>.pdf.enc` and lists it in `data/print-papers.json`. Pages publishes the
  sealed files; `functions/papers/[[path]].js` opens one only after User Center confirms the reader's session.
  The key is the Pages production secret `PRINT_PAPERS_KEY`; the local build reads the same value from
  `GK_PRINT_PAPERS_KEY` (private store `~/.secrets.env`). A static path can be reached around the function
  (for example `/papers%2F2024.pdf.enc`), which is why only sealed bytes may sit under `papers/`.
- Each sealed PDF is bound to the printed content of its source and the stylesheet (`sourceSha256`). `%%` comment lines are
  not printed and not part of that digest, so adding or correcting a provenance note needs no re-print.
- Every `@record` line binds its section to the exact bank content it was proofread against (`bind=`).
  `npm run test:print` (part of `npm run build`) fails when the bank changes under a section, when a published
  record is neither printed nor skipped, when a sealed file does not match the manifest or was not printed from
  the current source, or when a readable PDF is tracked.

## Building

```
GK_PRINT_FONTS=<dir> GK_PRINT_PAPERS_KEY=<base64 key> node print/build.mjs --years 2024,2025   # seal + manifest
GK_PRINT_FONTS=<dir> node print/build.mjs --years 2024 --no-manifest --out <dir>               # readable preview only
```

Rebuild only the years whose source (or the stylesheet) changed: every sealing uses a fresh nonce, so a rebuilt
year always changes its sealed file. Readable PDFs go to `.print-work/pdf/` (ignored by git).

`<dir>` holds the five font files named in `print/lib/edition.mjs` (SIL OFL 1.1; not in the repository):
`NotoSerifSC[wght].ttf` and `NotoSansSC[wght].ttf` from google/fonts, instanced with
`fonttools varLib.instancer <file> wght=<n>` to `PSong-Regular.ttf` (400), `PSong-Bold.ttf` (700),
`PHei-Medium.ttf` (500), `PHei-Bold.ttf` (700), and `LXGWWenKaiGB-Regular.ttf` from lxgw/LxgwWenkaiGB v1.530.
Needs Google Chrome, `pdfinfo` and Node 24.18.0.

Changing the key: seal every year again with the new key, set the Pages secret to the same value, and release
both together (a deployment snapshots its secrets; an old deployment keeps opening its own files).

## Source markup

Line prefixes:

| Line | Meaning |
| --- | --- |
| `@year`, `@title`, `@subject` | paper header (once) |
| `@note text` | extra cover note for this year (the two standard notes are added automatically) |
| `@record <id> bind=<hash>` | start of the section printed from one bank record. Never edit this line by hand |
| `@skip <id> bind=<hash> reason=<text>` | a bank record that is deliberately not printed (duplicate entry and the like) |
| `@more <id>` | a later part of an earlier `@record`, printed at this place (one bank unit that the paper prints in two places) |
| `%% text` | comment, not printed |
| `# text` | section heading (`一、本大题共5小题，共18分。`) |
| `! text` | instruction line (`阅读下面材料，完成1—5题。`) |
| `<<< kai` … `>>>` | reading material in 楷体. `<<< poem` for verse, `<<< song` for 宋体, add `spaced` for a 断句 passage |
| `== text` | label inside a material block (`材料一`) |
| `= text` / `=- text` | centred title / centred byline |
| `\| text` | centred line (verse) |
| `-> text` | right-aligned line (source, signature) |
| `[image assets/img/x.jpg 70]` | figure, width in mm (inside a material block) |
| `~ text` | note line in small type (`注释：①…`) |
| `? choice` … `?.` | multiple-choice question; the answer box is added automatically. Options: `cols=1\|2\|4`, `nobox` |
| `? open` … `?.` | written answer; give it `[lines N]` |
| `? fill` … `?.` | answered in blanks `{=N}` inside the text |
| `? write` … `?.` | writing task; give it `[grid ROWS]` |
| `[lines N]`, `[lines N 相同点：]` | N ruled answer lines, optionally labelled |
| `[grid ROWS]`, `[grid 60 title]`, `[grid 60 heading]` | writing grid, 20 squares per row; `title` adds the choice-and-title line of a two-topic essay, `heading` only the title line |
| `\|\| a \| b \| c` | one row of a ruled table; consecutive rows form the table |
| `[space MM]`, `[pagebreak]` | vertical space; forced page break |

Inside a question, a line starting with `A．` … `G．` is an option. Two ideographic spaces (`　　`) split an option
into aligned cells (`A．故{.当}执有命者之言　　当：面对`). A line indented with two ASCII spaces after an option
continues that option on its own line. A material block and `~` notes may also sit inside a question.

Inline marks: `{.字}` 加点, `{_字句}` 横线, `{~字句}` 波浪线, `{=10}` blank 10 em wide, `{=6:①}` numbered blank,
`{+扌豕}` two components set as one character, `{^①}` superscript. Marks nest (`{_今用{.执}有命}`).

## Proofreading rules

1. **Text.** The bank text is the authority. Change a character or a punctuation mark only where the bank reading
   is plainly a transcription fault (a doubled or dropped word, a missing mark at an evident sentence boundary,
   a wrong character that makes a non-word) and, when a second transcript exists, it agrees. Otherwise keep the bank
   reading. Never improve wording, and never touch the deliberate errors of 字音、字形、病句、标点 questions.
2. **Typography.** Full-width Chinese punctuation; `——` for a dash, `……` for an ellipsis, `·` in names and titles,
   `N．` after a question number and `A．` after an option letter, `（1）` for sub-questions; no ASCII spaces
   between characters; ranges as `1—5题`.
3. **Structure.** Sections follow the original question numbers. Titles, bylines, source lines and notes use their
   prefixes. Provenance remarks from the bank (`%% note not printed`) stay comments.
4. **Marks.** Dots, underlines and wavy lines sit exactly on the characters the bank records. Where a stem refers to a
   mark that the bank does not record, leave the text unmarked and say so in a `%% todo` comment.
5. **Answer areas.** Choice: the automatic box. Written answers: `[lines N]` with N = the score for 3–6 points,
   2 for 1–2 points, 8 for 7–8 points, 10 beyond, 4 when the score is unknown; one area per sub-question.
   默写 blanks are `{=10}` (one verse line each). A short answer with a stated length of 40 characters or more, 微写作
   and 作文 use `[grid ROWS]`: ROWS = ceil(limit / 20) + 2 for an upper limit, `[grid 60 title]` for the essay.
   The original paper's own answer placeholders (`答：`, `【　】`, `（　　）` after a choice stem) are removed.
6. **Layout.** Build the year and look at every page: no heading stranded at a page foot, no option block split from
   its stem, blanks wide enough to write in.

Aids: `node print/tools/lint.mjs <year>` (mechanical checks) and
`python3 print/tools/compare.py print/src/<year>.txt <second transcript> --punct` (differences against an independent
transcript; both sides can be wrong).
