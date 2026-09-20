# Modern GK restoration — 2026-09-20

This section supersedes all dated current-version and seven-file static-only claims below.
Target: Pages `gaokao`, `gk.bdfz.net`. Candidate restores the exact July 14 modern frontend from retained commit `4a37c5c`; July production `eff09c31` HTML/CSS/JS were re-fetched and match exactly before integration. The actual regression began on August 11 at `d27a87a4`, when a deploy-gate-only push to stale main replaced an uncommitted modern release. August and September updates inherited the obsolete frontend.

Candidate combines all 201 structured records/612 prompts/472 annotations with the accepted 2026 nine-component/26-prompt projection, all three September 16 classical-text corrections in legacy and structured fields, the original per-question discussion Function, and conservative read-only legacy progress hydration. Five ambiguous historical language-use key groups remain unmapped; original local and central records are preserved. No new score, completion or AI provenance is inferred.

Source authority: the clean pushed `codex/gk-modern-restore-20260920` candidate, then synchronized main after preview acceptance. Never deploy canonical historical checkout. Required checks: `npm run test:progress`, `npm run check:data`, `npm run check:beijing-2026`, JS syntax and diff checks, fixed Node 24.18.0/Wrangler 4.116.0. Build only via `scripts/build-pages.mjs` into an explicit artifact; compile existing Functions, include only listed runtime assets plus release.json/_worker.js/_routes.json. Repository root, backups and answer intermediates are forbidden upload targets.

Pre-change production and rollback: `f6ff92b3-78e6-4bbf-8b94-bb347a80b23c`, source `ea528c3`; preserve all forward browser/User Center history. Production secrets/bindings/routes remain unchanged. The restored discussion endpoint reuses existing GitHub/Discourse secrets; verify read paths without posting messages. This is a GK leaf restoration; no shared SDK, APIS, identity schema, clone renderer or other consumer is changed.

Live release is pending until the receipt below is appended. Evidence and root impact card: `/Users/ylsuen/CF/reports/operations/gk-live-repair-20260920/`. Runtime source/build: one registered `/private/tmp/cf-task-gk-live-repair-20260920` root, under 100 MiB; Node/Wrangler reused, no install; 1 GiB budget/25 GiB reserve. Owner this task; temporary derivatives removed at closeout after source push. Durable evidence retained through review 2026-10-20.

<!-- gk-progress-current:start -->
# Accepted GK normal progress flow — 2026-09-10 01:31Z

Current production: **Pages `f6ff92b3-78e6-4bbf-8b94-bb347a80b23c`**, runtime source **`ea528c388e8728736265f7da2d3b07680b54dcae`**, published branch `codex/gk-progress-restore-20260910`. Immediate rollback: **`51d51a51-db3f-4620-9c1d-bfbe813cd421` / `3a3658806d5d7b19aa5d7afdf2d5751dcff879e2`**. Preserve all forward browser/My progress. Preview `d004494a-25a0-4697-8f88-5e50dcb1067b` and production publisher calls are terminal; never replay either.

The actual signed-in browser restored nine current-corpus records into their correct categories, starting from an empty local cache without clearing it. All fourteen old central records stayed byte-exact. One ordinary 2026 noncontinuous-reading view at **01:28:16.983Z** wrote exactly once through the existing SDK: `in_progress`,25%, matching central item hash. Both pages were ordinarily reloaded; GK then had ten category records and My fifteen records. My's normal records UI showed the new reading, GK showed2026noncontinuous as reading,2026classical as unread and2025classical as reading. No AI request, answer submission, grading, duplicate view or synthetic completion occurred. Do not replay `question-2026-feilian-2026-feilian`.

All seven preview assets match exactly. Six non-HTML production assets match exactly; the whole HTML matches after removing one precisely identified Cloudflare AI Labyrinth hidden nofollow link solely for comparison. The hidden URL was never followed and no security setting changed. Configuration and `uses_functions:false` remain unchanged. Raw failed HTML comparison and the subsequent exact review are both retained.

Evidence directory: `/Users/ylsuen/CF/_meta/reports/operations/.my-architecture-serial7-20260909/`:
- `gk-progress-real-owner-acceptance.json`, ownerbaseline/hydrated/after snapshots, normal-owner-read, source/My UI-after-reload prove the actual flow and old-history preservation.
- `gk-progress-production-deployment.json`, preview-readback and production-readback-reviewed locate live/source/rollback and all seven artifact hashes.
- `gk-progress-current.log`:14passes; predecessor-regression:13fail/1pass. Unchanged-writer-contract binds seven unchanged write/AI functions; all201corpus keys and data SHA8d503511 remain intact.
- First passive window through01:29:44 is complete at ABR1 but has only17returned events and no matching owner write terminal. It does not negate the matching product and central receipts; it also does not prove natural error reduction. Telemetry availability/attribution remains open.

**Remaining independent gaps:** natural error reduction; five old central keys without an exact current-corpus mapping (preserved, not migrated); real completed-state restoration and AI/answer workflows (this owner baseline has only in-progress records; completed-state handling passed behavioral tests only). Generic progress remains `record_only`, with no qualified-credit claim. Original My/fleet objectives remain open.

Published runtime files changed only`assets/js/app.js`; package/test and three operations documents accompany it. Exact source branch is clean/published; canonical old app remains a historical checkout with additive current documentation. Complete prior canonical dirty document bytes are retained in E7 `gk-canonical-state-preimage.txt` and `gk-canonical-operations-preimage.txt`; do not overwrite or discard that work. New verification standard is executable from the published branch. Hot evidence has review2026-09-16; task-created runtime derivatives remain owned by the root until exact manifest cleanup.

The following sections retain the pre-release specification and historical deployment journal. Current live/rollback and acceptance facts in this section take precedence.
<!-- gk-progress-current:end -->

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

# Project State

Last updated: 2026-08-16 PDT
Current version: production deployment `51d51a51-db3f-4620-9c1d-bfbe813cd421` from pushed commit `3a36588`
Current objective: publish the complete simplified-Chinese 2026 Beijing Chinese paper and every mapped question group without carrying canonical historical dirty changes
Completed work: added a hash-bound, no-reformat importer and validator in commit `31c0bd8`; added nine components and 26 selectable prompts with OpenAI Codex (GPT-5) answers in data commit `fafd4e5`; fixed grouped questions 14 and 15 plus fail-closed validation in `3a36588`; repeated import is a byte-identical no-op
Pending work: merge draft PR #10 after the operator's normal review; no production content work remains for this release
Known problems: the canonical `/Users/ylsuen/CF/gaokao` worktree contains historical unrelated dirty files and remains excluded from release
Next recommended task: preserve the isolated release worktree until PR #10 is reviewed; never deploy the canonical dirty checkout
Deployment status: live at `gk.bdfz.net`; exact live `data/all.json` SHA-256 `8d5035113592a8c8676ccd0fe9e64f52abff4b5652259cf06910a4362edb9cbc`
Rollback anchor: promote Pages deployment `d27a87a4-625e-40d1-a9a8-45783c62d825`
Operations authority: /Users/ylsuen/CF/gaokao/docs/OPERATIONS.md
Ownership status: release owned by `20260816-clone-family-beijing-chinese-direct-release`
