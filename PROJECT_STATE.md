# Project State

Last updated: 2026-08-16 PDT
Current version: production deployment `7bedc52d-feb3-42c7-a842-5fdd1188e542` from pushed commit `7fe39ca`
Current objective: publish the complete simplified-Chinese 2026 Beijing Chinese paper and every mapped question group without carrying canonical historical dirty changes
Completed work: added a hash-bound, no-reformat importer and validator in commit `31c0bd8`; added nine components and 26 selectable prompts with OpenAI Codex (GPT-5) answers in data commit `fafd4e5`; repeated import is a byte-identical no-op
Pending work: merge draft PR #10 after the operator's normal review; no production content work remains for this release
Known problems: the canonical `/Users/ylsuen/CF/gaokao` worktree contains historical unrelated dirty files and remains excluded from release
Next recommended task: preserve the isolated release worktree until PR #10 is reviewed; never deploy the canonical dirty checkout
Deployment status: live at `gk.bdfz.net`; exact live `data/all.json` SHA-256 `7e57800a6de9003f1e0f72eb9dddcd1af6faca014136c072182ece117904b54a`
Rollback anchor: promote Pages deployment `d27a87a4-625e-40d1-a9a8-45783c62d825`
Operations authority: /Users/ylsuen/CF/gaokao/docs/OPERATIONS.md
Ownership status: release owned by `20260816-clone-family-beijing-chinese-direct-release`
