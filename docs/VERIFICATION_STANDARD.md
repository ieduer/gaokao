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

# GK executable verification standard

1. Source: inspect exact current Pages deployment and source, published branch and clean Git state. Current baseline51d51a51/source3a365880; mainaf7ee69 is older. Use the isolated registered branch described in OPERATIONS.
2. Safe structural readback: control-plane deployment/config/uses_functions, then exact bytes for all seven allowlisted public assets. No health activation, AI, grading, notification or session-write probe. A200 response is not acceptance.
3. Contracts: Node24.18.0 `npm run test:progress`, `npm run check:beijing-2026`, `node --check assets/js/app.js`, `git diff --check`; compare immutable all.json SHA2568d5035113592a8c8676ccd0fe9e64f52abff4b5652259cf06910a4362edb9cbc and all201 existing writer keys. Do not regenerate the corpus.
4. Deploy: exact clean pushed source, `/Users/ylsuen/CF/scripts/git-deploy-gate.sh`; stage only index.html/assets/data into an absent registered artifact. Existing Wrangler Pages publisher: preview then main with exact commit and unchanged config. Seven files only. Never push oldmain into production or upload repository documents/backups. Official skip prefix prevents competing Git publication; it does not waive any test.
5. Related flows: My session/progress contracts and shared SDK unchanged. Preserve all14 baseline central records, restore9 exact current keys, leave5 legacy keys untouched. One normal view through GK UI must produce a matching central record, visible My record and correct GK category status after ordinary reload. No AI answer submission is needed. App/session contract unchanged; desktop proof is not App acceptance.
6. Restore: preserve canonical dirty preimages, existing Git object store and all forward My/browser records. Recreate only an absent registered worktree at the exact published SHA, then verify seven artifact hashes. Original GKS source-paper recovery remains separate. Do not clear localStorage to manufacture restoration evidence.
7. Rollback: immediate baseline51d51a51/source3a365880; read fresh ownership/deployment, promote existing Pages rollback, verify app659852dc/data8d503511 and preserve progress. No credential or data rollback.
8. Last verified2026-09-10:14 behavioral tests pass, same predecessor13fail/1pass; content/syntax/diff pass. Production release, ordinary authenticated flow and natural error reduction are initially pending. Append actual independent receipts to OPERATIONS and PROJECT_STATE after each stage.
