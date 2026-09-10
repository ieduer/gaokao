# GK progress restoration release — 2026-09-10

Owner: suen; executor: codex-my-architecture-serial7. Purpose: `20260910-gk-progress-restore`.

Current production is Pages `51d51a51-db3f-4620-9c1d-bfbe813cd421`, source `3a3658806d5d7b19aa5d7afdf2d5751dcff879e2`. This candidate is not yet published or accepted. The exact source authority is the existing `ieduer/gaokao` object store, branch `codex/gk-progress-restore-20260910`, based on published deployment documentation `c9444a4`. Git main `af7ee69` is older than production; do not deploy it. Canonical path: `/Users/ylsuen/CF/sites/exam/gaokao`; owned release worktree: `/private/tmp/cf-task-20260909-my-architecture-serial7/gk-progress-recovery`.

The live app read protected progress before checking the session, parsed year-first keys as category `question`, did not recognize the central `completed` state, and displayed another category's same-year status. The candidate uses the existing session API before reads, resolves exact currently published keys, merges completed progress without downgrading old records, and scopes each year button to its actual category. Ordinary focus retries restoration after login; concurrent restoration shares one operation. Finite diagnostic outcomes expose no question text, identity, custom key or raw error. Existing writes and the shared SDK are unchanged.

Validation: 14 behavioral tests pass; the same predecessor comparison has 1 pass and 13 failures. Node 24.18.0 syntax, existing Beijing validator (9 components / 26 prompts) and Git whitespace checks pass. All 201 question records and their keys are unchanged. `data/all.json` remains SHA256 `8d5035113592a8c8676ccd0fe9e64f52abff4b5652259cf06910a4362edb9cbc`. No content importer, AI request, grading, schema, credential or notification mutation was performed.

The owner baseline is 0 local records and 14 central records, all in progress; 9 match currently published keys. Five legacy keys do not match the current corpus and remain intact in My; no inferred alias, migration or deletion is authorized by this repair. Historic coverage is a separate unresolved issue. Initial restore must preserve every central record and restore the nine known categories; a new ordinary question view must be visible in My and after both pages reload. Tests and static responses are not this acceptance. Natural error reduction remains separate.

## Source, runtime and rollback

The current Pages deployment reports `uses_functions:false`. The July resource index's question-discussions function claim is stale for this live version. Production configuration SHA256 is `aedab1fae4fbbe80bde8c53264fde25b016be6ed2a6a642f9ecbcb02ca6eb92d`; no setting or binding change belongs to this release.

Use only the existing static artifact publisher: after a clean pushed commit and the normal workspace Git gate, stage `index.html`, `assets/` and `data/` into an absent registered directory. Exactly seven public files are allowed. Never upload the repository root, documents, tests, backups or task evidence. Use a named preview with the exact commit, verify all seven bytes and unchanged configuration, then publish the same artifact to Pages `gaokao` branch `main`. Source and documentation pushes use official `[CF-Pages-Skip]` commit prefixes to keep Git integration from deploying the repository root; tests and the Git gate still run. No competing publisher or project configuration change.

Immediate rollback for this purpose is Pages `51d51a51-db3f-4620-9c1d-bfbe813cd421` / source `3a3658806d5d7b19aa5d7afdf2d5751dcff879e2`, after fresh current deployment and ownership readback. Promote that existing Pages deployment using the account's Pages rollback operation; read back the old app SHA256 `659852dc4e9fcb7b6e3075f3addafcb1c55bc246de34e0bdfdd1e20dd409f45c` and unchanged data hash. Preserve all forward My and browser records; Pages rollback is not data restore. Older July / pre-August anchors below are historical.

## Resource location and restore

Active Git source and `data/all.json` are `retain_hot`. An absent registered worktree can be recreated from the existing object store with `git -C /Users/ylsuen/CF/sites/exam/gaokao worktree add --detach <ABSENT_REGISTERED_PATH> <EXACT_PUBLISHED_COMMIT>`; verify the published commit, seven artifact hashes and content validator before release. This recovers derived site source, not original GKS exam scans. No source/evidence deletion or complete original-paper restore is claimed.

Task evidence: `/Users/ylsuen/CF/_meta/reports/operations/.my-architecture-serial7-20260909/gk-progress-*`, including control preflight, baseline, legacy shape, test logs, specification and published-key map. E7 is `retain_hot`, review 2026-09-16. The task manifest is `/Users/ylsuen/CF/reports/private/runtime-artifact-manifests/20260909-my-architecture-serial7.json`; disposable worktree/artifact/runtime belong to the root until exact cleanup. Pre-existing canonical dirty documents have complete preimages in E7 and are preserved.

No-new-capability receipt: existing Pages static delivery and existing My browser API only. No shared session, SDK, App, nav, AI, schema, score, data or resource contract changes. Node is pinned at 24.18.0 in `.nvmrc` and engines. Changed flow participants are GK and My; all other source references and clone families remain unchanged. Real GK restoration and error reduction require independent evidence.

Official publisher authority: https://developers.cloudflare.com/pages/get-started/direct-upload/ and https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message .

---

The following deployment journal is historical. Current release and rollback facts above take precedence.

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
