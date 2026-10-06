# Analects answer review candidate

Local candidate based on pushed main `0b3258ffcc755f4dc2939b3e2e22bf43f56519d4`.
The candidate is in existing draft PR12; no release, provider generation or
learner-score change has occurred.

Seven source records carry an additive `source_review`; every prior field, model
answer, current-version selector, question ID and progress key remains exact.
The new reference appears before historical answers in category and whole-year
views. Identified conflicting historical answers remain visible with a warning.

- 2015 question15: EOL's contemporaneous question image and Xueke answer scan
  confirm alternating speakers and an open choice between the two punctuations.
  The two retained GPT answers conflict with that evidence. Both are marked.
- 2018 question13: the three replies and differentiated teaching are reviewed.
  Micro-writing question23 option3 retains its open choice,150–200 characters
  and one-of-three rule; the other two options receive no review overlay.
- 2019 question12: the image prints7 total points, not the legacy title's5.
  Deleting the negative means accepting poverty resulting from following仁;
  the retained GPT answer reverses that condition and is marked.
- 2020 question12: saying孔子 himself was not born knowing does not establish
  that no such person exists. The retained GPT addition is marked.
- 2021 question11: any two of the six qualities may be selected and explained.
- 2023 question11: all three subparts are reviewed. `chèn` means fit or correspond;
  the old `reference_answer` incorrectly calls it a noun meaning fame. Either
  reading in the final subpart is allowed when supported by the material.

At load time, an exact-match overlay corrects four printed-text defects:
2015《论语?侍坐》,2019共5分/贫与残,and2023不已知. Both the legacy and structured
material paths receive the same correction for category/year display, copy,
exposure and discussion. Each replacement preserves text length and annotation
offsets. Only topic/material fields are allowed; missing, duplicate or ambiguous
matches fail closed. Data on disk and all historical scores remain untouched.
Source limitations and warnings also accompany the discussion context.

The2019 individual scores remain unknown. The2023 image confirms10 total points
but not the existing2/2/6 allocation. Visible review notes distinguish this from
verified scoring. Original scored-paper and formal marking acceptance remain open.

These are publisher reproductions, not documents downloaded directly from the
exam authority. Source URLs, byte sizes, SHA256 values, pages and scope are in
each record. The UI states that limitation and links the exact sources. Source
files and visual-review receipts are retained in the task evidence directory:
`/Users/ylsuen/CF/reports/operations/analects-consolidation-20261004/serial7/`.

The validator binds each review to its exact question and material/annotation
context. Drift, missing evidence, invented historical versions and unapproved
source URLs fail the data gate. Ten focused tests verify those failures, all
historical fields, exact correction behavior, correct year-view mapping,
discussion context and no review leaking to adjacent questions. All201 records,
612 questions and472 annotations pass data validation. All prior data is deep-equal
to the parent after removing only `source_review`;15 source file references match
retained bytes and hashes. The expanded receipt is `gk-seven-group-validation.json`.

The exact `e0dcee540ad340901ec48112292e8c6cd19d5e21` complete `npm run build`
passed on 2026-10-06 UTC with Node 24.18.0: six recorder, twelve progress and ten
answer-review tests; 201 records/612 questions/472 annotations with zero data
errors; Beijing 2026 validation; nine explicit assets plus release.json. After
a material workspace resource change, this supersedes the earlier pre-execution
runtime-hygiene block. Logs and artifact hashes are under
`/Users/ylsuen/CF/reports/operations/analects-consolidation-20261004/serial8/`
(`gk-build-result.json`, `gk-build-artifact-manifest.json`). Real browser,
authenticated acceptance, downstream Weibian/Fuzi adoption, affected-learner
review and controlled publication remain pending. Historical `ai_answers` and
`reference_answer` fields remain recovery evidence; downstream consumers must
explicitly adopt the reviewed per-question overlay before claiming a fix.

Local rollback restores the parent commit in an isolated checkout. Preserve
all forward learner records. Publication needs the current registered release
transaction, real acceptance, and Status stored/public/RSS verification.
