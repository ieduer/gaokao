# Project State

Last updated: 2026-08-16 PDT
Current version: clean release candidate `fafd4e5` on `agent/beijing-2026-chinese-release`
Current objective: publish the complete simplified-Chinese 2026 Beijing Chinese paper and every mapped question group without carrying canonical historical dirty changes
Completed work: added a hash-bound, no-reformat importer and validator in commit `31c0bd8`; added nine components and 26 selectable prompts with OpenAI Codex (GPT-5) answers in data commit `fafd4e5`; repeated import is a byte-identical no-op
Pending work: push the branch, open a draft PR, pass the normal Git gate, deploy Pages production, and verify the live data and browser routes
Known problems: the canonical `/Users/ylsuen/CF/gaokao` worktree contains historical unrelated dirty files and remains excluded from release
Next recommended task: deploy only this clean pushed worktree; never deploy the canonical dirty checkout
Deployment status: candidate only; production remains Pages deployment `d27a87a4-625e-40d1-a9a8-45783c62d825` from `af7ee69`
Rollback anchor: promote Pages deployment `d27a87a4-625e-40d1-a9a8-45783c62d825`
Operations authority: /Users/ylsuen/CF/gaokao/docs/OPERATIONS.md
Ownership status: release owned by `20260816-clone-family-beijing-chinese-direct-release`
