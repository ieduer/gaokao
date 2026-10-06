# Analects answer review candidate

Local candidate based on pushed main `0b3258ffcc755f4dc2939b3e2e22bf43f56519d4`.
No push, release, provider generation or learner-score change has occurred.

Two source records carry an additive `source_review`; every prior field, model
answer, current-version selector, question ID and progress key remains exact.
The new reference appears before historical answers in category and whole-year
views. Identified conflicting historical answers remain visible with a warning.

- 2015 question15: EOL's contemporaneous question image and Xueke answer scan
  confirm alternating speakers and an open choice between the two punctuations.
  The two retained GPT answers conflict with that evidence. Both are marked.
- 2023 question11(1): the inspected reference PDF confirms `chèn` means fit or
  correspond. The old `reference_answer` incorrectly calls it a noun meaning fame.
  Only this subpart is reviewed; the other two are not silently classified as
  verified. Original scored-paper and official marking acceptance remain open.

These are publisher reproductions, not documents downloaded directly from the
exam authority. Source URLs, byte sizes, SHA256 values, pages and scope are in
each record. The UI states that limitation and links the exact sources. Source
files and visual-review receipts are retained in the task evidence directory:
`/Users/ylsuen/CF/reports/operations/analects-consolidation-20261004/serial7/`.

The validator binds each review to its exact question and material/annotation
context. Drift, missing evidence, invented historical versions and unapproved
source URLs fail the data gate. Seven focused tests verify those failures, all
historical fields, correct year-view mapping, and no review leaking to adjacent
questions. All201 records,612 questions and472 annotations pass data validation.

The complete build was blocked before execution by the existing runtime-hygiene
hook. It has not been replaced with an alternate build command. Real browser,
authenticated acceptance, downstream Weibian/Fuzi adoption, affected-learner
review and controlled publication remain pending. Historical `ai_answers` and
`reference_answer` fields remain recovery evidence; downstream consumers must
explicitly adopt the reviewed per-question overlay before claiming a fix.

Local rollback restores the parent commit in an isolated checkout. Preserve
all forward learner records. Publication needs the current registered release
transaction, real acceptance, and Status stored/public/RSS verification.
