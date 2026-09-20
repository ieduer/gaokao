# 2026 语文题面三源纠错 + 答案核查 — 2026-09-19

本节只增补，不推翻下方各节；它取代其中「2026 语文题面以 GKS 单一来源为准」一条。

## 收录标准（本次新增）

站长要求：2026 年北京卷没有官方公布的试卷与答案，**同一份试卷在三处彼此独立的来源上内容一致，才认定为真题**；
答案全部是网传，必须自行核查后再决定是否采用。本次全部按此标准执行，逐科证据写进
`data/beijing-2026/manifest.json`（页面「来源与核验」栏直接渲染该文件）。

## 语文：题面三源交叉核对并纠错

旧版 2026 语文题面来自 GKS `beijing/2026` 结构化稿，而该稿只有**一个**来源（用户提供的原卷扫描件），
2026-08-15 的发布还动用了一次性 source-class 豁免。本次补齐第二、三处来源：

- 原卷扫描件（小红书／公众号「漂似鸥」流出），SHA-256 `486b6c54…1669ec`，10 页正卷 + 2 页网传参考答案；
- 微信公众号「高中语文知识学习」全卷转录（`mp.weixin.qq.com/s?__biz=Mzg5MDA2NzUzMg==&mid=2247562044`）；
- 另一独立微信公众号全卷转录（`__biz=MzU3MzMzNTczMQ==&mid=2247572405`）。

三者逐句比对后，查出线上旧版共 **69 处差异（40 处字词、29 处标点）**，且每一处都是旧版与另外两处不一致。
对争议处回到原卷扫描页逐页目视判定（PDF 页 4/1/7/19/15/2/9/3/10/5 对应正卷第 1—10 页）。已修正的实质错误包括：
`聊以即趣→稍纵即逝`、`手工艺人→手工匠人`、`为寻阳吏→为郡督邮`、`后举孝廉→后察孝廉`、`庞怀→扈怀`、
`赍而遣之→资而遣之`、`弢将袭浔阳→弢别将袭沔阳`、`共击破→共击弢`、`浔水城→浮水城`、`步走向武昌→步向武昌`、
`众情愤怒→众情愤惋`、`不预朝政→不预朝权`、`望极平田→乍望极平田`、`建章宫修建→修造`、`晋朝名将→晋朝将领`、
`以自然之理论治国之道→喻`、`开篇提出观点→亮出观点`、`素日→素习`、`也太→也忒`、`以此传讹→以讹传讹`、
`后人→后来人`、`来自哪座山→采自哪座山`、第 3 题 A 项补「的」、第 4 题 C 项 `应当分割，独立进行→应分别、独立进行`，
并删去散文误加的「赵丽宏」作者行、修正《红楼梦》注释编号。

因此 `scripts/import-beijing-2026-from-gks.mjs` **已改为默认拒绝运行**（退出码 2）：它的上游结构化稿仍是错误版本，
重跑会把 69 处修正全部退回。要重新导入必须先把修正同步回 GKS 结构化稿与 coverage 哈希，再显式设
`ALLOW_SUPERSEDED_IMPORT=1`。`scripts/validate-beijing-2026.mjs` 新增 13 条正向校验位与 4 条回退探测位，
任何一次退回都会让 `npm run check:beijing-2026` 失败。

## 语文：答案改由本会话逐题核查作答

两份网传参考答案（原卷附页、公众号转录）内容一致，但都不是官方评分标准。本会话的 Claude Opus 5 先独立作答，
再与网传答案比对：**12 道客观题与 4 组默写全部一致，主观题要点一致**，因此采用，并在每题写明核验结论。
新版本 `claude_opus_5` 成为 2026 各记录的 `ai_answer_current_version`，`openai_codex_gpt_5` 保留供对照；
`assets/js/app.js` 的 `ANSWER_VERSION_ORDER` 把它排在首位，`buildYearExam` 的版本槽位改为由该列表派生
（原先是硬编码字面量，新增版本会抛 `Cannot read properties of undefined (reading 'answers')`，本次一并修好）。
`scripts/validate-data.mjs` 的「verified source policy」同步改为：北京 2026 记录当前版本必须是 `claude_opus_5`，
且 Codex 与 Opus 5 两套答案都要齐全。

## 非语文科目不在本站

2026-09-19 曾在本站加过一个 `/2026.html`「北京卷九科真题」浏览页（八科试卷／答案页面图像）。
站长当天即判定放错站点：**gk.bdfz.net 只做语文**，其余八科（数学、英语、物理、思想政治、化学、历史、生物、地理）
移交 gks.bdfz.net，并在那里做成逐题练习 + AI 批阅。本站已把该页面、脚本、142 张图像与首页入口全部撤下，
产物白名单恢复为原来的八个文件。检索到的来源与交叉核验记录随八科一并移交 GKS，不在本仓库保留。

## 构建与产物

`scripts/build-pages.mjs` 的白名单仍是原来的八个文件；`release` 标识为 `20260920-chinese-three-source-fix`。
仓库根目录、备份与答案中间件禁止上传。

## 校验与部署

1. Node 24.18.0，`npm run build`（含 `test:progress` 12/12、`check:data` errors=0、`check:beijing-2026` ok）。
2. `node --check assets/js/app.js`、`node --check assets/js/beijing2026.js`、`git diff --check`。
3. 推送干净分支后跑 `/Users/ylsuen/CF/scripts/git-deploy-gate.sh`，不得 override。
4. 用 `.pages-output` 产物部署到 Pages 项目 `gaokao`，绑定确切 commit。
5. 回读 `/release.json`、`/2026.html`、`/data/beijing-2026/manifest.json` 与抽样页面图像。

## 本次发布前的现场基线

发布前线上 = Pages deployment **`23baf659-1f2a-45cc-9740-1d1c10a1329d`**，runtime source
`17f1f1dbda5c551333688ae36f4124bf134f4550`（见下一节「Accepted modern GK release — 2026-09-20」）。
本次发布前实测：`/release.json` 自报 `20260920-modern-restore`、`sourceCommit` 即该 commit，
八个产物哈希与该 commit 逐一相同（`data/all.json` = `81c198f7…c227cf`），`/api/question-discussions` 返回 200。
**本次回滚锚点即 `23baf659-1f2a-45cc-9740-1d1c10a1329d`**；再往前一级仍是 `f6ff92b3-78e6-4bbf-8b94-bb347a80b23c`。
回滚只还原静态产物与数据，不回滚浏览器／用户中心的学习进度。


---

# Accepted modern GK release — 2026-09-20

Production: **23baf659-1f2a-45cc-9740-1d1c10a1329d**. Runtime source: **17f1f1dbda5c551333688ae36f4124bf134f4550**, on GitHub main and `codex/gk-modern-restore-20260920`. Preview: **e15ebc83-fb88-49f9-8be0-a6ae9bc1f739**. Rollback: **f6ff92b3-78e6-4bbf-8b94-bb347a80b23c**, preserving all forward user progress. Later documentation-only commits do not change the deployed runtime identity.

This section is the current authority; every older current/pending statement below is historical. The canonical working directory remains a preserved historical branch with existing document edits; materialize exact main in a clean release worktree, never deploy those working files. Full evidence and root-cause report: `/Users/ylsuen/CF/reports/operations/gk-live-repair-20260920/REPORT.md`.

Restoration combines the byte-verified July 14 modern frontend with accepted later changes: 201 records, 612 prompts, 472 annotations, the verified 2026 26-prompt paper, three September classical-text corrections, and conservative legacy progress reads. Five ambiguous old language-use key groups remain unmapped and preserved. The actual regression began August 11 when stale main automatically replaced the dirty July release.

Pages `gaokao` serves `gk.bdfz.net`; Git build is `npm run build`, destination `.pages-output`, using Node 24.18.0. The build runs behavior/data validation and stages eight explicit static assets plus `release.json`. Never upload repository root. Direct release uses exact clean pushed source, verified target/configuration and an independent rollback anchor, previews the same static artifact, and lets Wrangler 4.116.0 compile root `functions/`. The multipart output from `pages functions build --outfile` is not a deployable JavaScript worker. Existing secrets, bindings and shared SDK/APIS contracts are unchanged.

12 behavioral tests and all data validators passed. Preview/production each matched all nine public files; root HTML comparison removed only the specifically identified Cloudflare hidden link injection. Discussion GET and a real production AI explanation passed. Modern/full-paper/historical-answer UI, ordinary reload and 401px layout were verified with no console errors. No public post or score was submitted. Fresh signed-in cross-device User Center acceptance remains unclaimed. Failed terminal publisher attempts and successful independent readbacks are retained in the report directory; never replay them.

<details>
<summary>Historical release records — superseded, not current deployment instructions</summary>

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

</details>


## Governed automatic release — 2026-09-20

Publication stays automatic on the registered production branch after the provider build gate is activated. Its exact source, live ancestry, capability paths, artifact and bootstrap evidence are bound in `.release/policies.json`; the provider pins `.release/guard.mjs` and this policy by SHA-256. Runtime identity is read from `/__release.json` after activation. The first build must preserve existing live asset fingerprints; no application data or identity flow changes are part of this control installation. Do not publish from an older or dirty checkout or run a second direct lane. Manual publication must preserve the provenance watermark and source lineage. Historical deployment IDs below remain dated evidence; latest live metadata is not accepted merely by copying it. Operational rollback of the gate restores only the recorded previous build/source settings after source validation, never a blanket old-source deploy. Workspace evidence: `/Users/ylsuen/CF/reports/operations/release-governance-auto-20260920/`.


## Publishing authority verified 2026-09-20

- Pages `gaokao`: verified production `ba438f25-c986-44e3-aefe-f5bd063ec952`, source `897ca30111e9d96adcaf7bf1aba95c1f2e936a00`, 9 artifact entries; policy `.release/policies.json`. Automatic production remains enabled through the provider-pinned guard.

These are dated release receipts, not permission to replay an old source. Current publication must use the registered exact repository/branch/target, preserve accepted production ancestry and capabilities, verify the built artifact and live baseline, then read back the actual result. A clean checkout, newer timestamp or default branch alone is insufficient. Existing project-specific acceptance gates remain binding. No second production publisher is allowed. Current source/control operations and rollback evidence: `/Users/ylsuen/CF/reports/operations/release-governance-auto-20260920/REPORT.md`; fleet routing: `/Users/ylsuen/CF/platform/release-authority.json`. Retired workflow definitions are recovery evidence only.
