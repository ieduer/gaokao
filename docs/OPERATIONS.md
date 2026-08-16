# AI 高考助手 operations

Owner: suen  
Lifecycle: active  
Data class: student_owned  
Runtime: Cloudflare Pages project `gaokao`, domain `gk.bdfz.net`

## Source and release authority

- Git: `ieduer/gaokao`; production before this release is deployment
  `d27a87a4-625e-40d1-a9a8-45783c62d825` from commit `af7ee69`.
- Canonical true-paper authority is GKS `coverage.json` SHA-256
  `c6171cc5bdbf4032cf940734a0a5c0e6d60e35adc7585131006036def204a593` and source scan SHA-256
  `486b6c54ca01653daf9bd2a87d8e69129cd688002a932923005a7109331669ec`.
- `scripts/import-beijing-2026-from-gks.mjs` accepts only `CN-BJ`, `zh-CN`, approved structured
  components and the exact coverage hash. It prepends the new records without reformatting old data;
  a repeated exact run is a byte-identical no-op, while drift fails closed.
- `scripts/validate-beijing-2026.mjs` requires nine components, 26 selectable prompts, complete
  OpenAI Codex (GPT-5) answers, 100% visual-review marker and exact Beijing identity.

## 2026 projection

Components: noncontinuous reading, classical Chinese, poetry, recitation, `红楼梦`, literary prose,
language use, three micro-writing choices and two long-writing choices. They represent all 22 numbered
questions while exposing 26 selectable prompts because questions 21 and 22 contain alternatives.

All public true-paper content is simplified Chinese. Internet answer keys are cross-check only; each
formal answer is labeled `OpenAI Codex（GPT-5）本任务独立作答` and model `OpenAI Codex (GPT-5)`.

No-new-capability receipt: this data-only release reuses existing Pages static delivery and introduces
no binding, schema, identity, storage, compatibility, cache, route or shared-hub contract change.

## Verification, deploy and rollback

1. Use Node 24.18.0 and run `npm run build:beijing-2026` twice; the second run must report unchanged.
2. Run `npm run check:beijing-2026`, `node --check assets/js/app.js`, and `git diff --check`.
3. Push the exact clean branch, then run `/Users/ylsuen/CF/scripts/git-deploy-gate.sh` with no override.
4. Deploy `.` to Pages project `gaokao`, production branch `main`, binding the exact commit hash.
5. Read back `data/all.json`, all nine 2026 components, model labels, root page and byte SHA-256.
6. Rollback by promoting deployment `d27a87a4-625e-40d1-a9a8-45783c62d825`.

Last verified: 2026-08-16. The normal Git gate passed without override at pushed commit
`3a3658806d5d7b19aa5d7afdf2d5751dcff879e2`; Pages production deployment
`51d51a51-db3f-4620-9c1d-bfbe813cd421` is live. `https://gk.bdfz.net/` and
`assets/js/app.js` returned HTTP 200, and the live `data/all.json` SHA-256
`8d5035113592a8c8676ccd0fe9e64f52abff4b5652259cf06910a4362edb9cbc` exactly matched the validated
release artifact. Live questions 14 and 15 contain every sub-question and no `undefined` or empty
answer. The pre-release rollback anchor remains `d27a87a4-625e-40d1-a9a8-45783c62d825`.
