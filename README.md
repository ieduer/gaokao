# AI 高考 · 北京真题阅读与练习

北京高考语文真题（2002–2026 + 样卷，共 201 条记录、612 道小题）在线阅读、作答、AI 解析与对话辅导。

## 功能一览

- **当前题优先**：页面首先完整显示当前题干和作答要求，再按需展开与本题相关的材料；题号条只负责定位，不再重复塞入整张题卡。
- **明确的两种练习方式**：抽屉内分为「单题型」和「整套试卷」。年份数据不足时标为「已收录题目」，不会冒充完整试卷。
- **稳定切换**：整套模式按真实题型顺序拼卷；切到原题型后，同一道原题继续使用相同的本地答案、AI 对话、User Center 进度键和讨论键。
- **原文标注**：古文 / 诗词 / 论语 / 红楼梦 / 散文中的加点字、画线句和关键句随当前题显示；只加载当前大题的材料，避免整卷材料挤占首屏。
- **AI 答案**：每道小题都有离线答案；历史题目展示 Claude Opus 4.8 与 GPT-5.5 pro，2026 北京卷展示已核验的 OpenAI Codex（GPT-5）答案。
- **跟 AI 继续聊**：每道题独立对话上下文，AI 拿到 试卷 / 文本 / 当前题目 / 标注片段 / 用户已写答案 / AI 已给答案 / 历史对话 全套上下文，可以让 AI 解释「为什么这样答」「这句话怎么翻译」「我的答案能得几分」。
- **本题讨论**：每道题绑定一个 GitHub issue；右侧栏显示该题 issue 正文和评论。匿名提交通过 Pages Function 代发，用户可选填用户名。
- **批改模式**：点 "让 AI 批改" 时 AI 会逐项打分、列得分点、列失分点、给改写示范。
- **纯黑白界面**：只使用黑、白和中性灰，通过字号、留白、细线和反白选中态建立层级。
- **复制功能**：题目、原文片段、AI 答案、用户答案、整套对话、整套试卷题目均可一键复制。
- **进度同步**：用 `https://my.bdfz.net/site-auth.js` 暴露的 `BdfzIdentity` 同步已读 / 已做 / 用户答案文本 / 对话存档 / 最近阅读位置。
- **移动端与平板**：≤ 820px 使用单列作答流，材料默认收起；题库抽屉、题号条和操作按钮均保留触控尺寸。

## 数据 & 脚本

```
data/
  all.json                       # 唯一题库；带 ai_answers / ai_answer_versions / annotations 字段
  all.backup-2026-04-28.json     # 重写前的备份；如需回滚直接覆盖即可
  all.pre-gpt55-migration-2026-04-29.json  # GPT-5.5 pro 答案版本迁移前备份
  all.pre-gpt55-independent-2026-04-29.json # 2025 整卷独立 GPT 答案重写前备份
  all.pre-full-regenerate-2026-05-05.json   # 2026-05-05 全题重新生成前备份
  ai-generation-log.json         # 每次 AI 生成脚本运行的日志和失败清单
scripts/
  migrate-data.mjs               # 给每条记录加 id / typeLabel / materials / questions
  migrate-answer-versions.mjs    # 修正答案键，写入 Claude/GPT 双版本答案
  patch-2025-gpt55-independent.mjs # 只覆盖 2025 整卷 GPT-5.5 pro 独立答案
  validate-data.mjs              # 校验题目、答案版本、annotation anchor
  generate-content.mjs           # 调 apis.bdfz.net 给所有题目生成 ai_answers + annotations
  fix-annotation-qindex.mjs      # 把 AI 误用的"高考题号"重新映射到结构化 qIndex
  data/STCharacters.txt          # OpenCC 简→繁字典（用于 anchor 简繁回退匹配）
  data/TSCharacters.txt          # OpenCC 繁→简字典
  lib/cc-convert.mjs             # 简繁转换辅助
functions/
  api/question-discussions.js    # 本题讨论：GitHub Issues 读取 / 匿名提交代理
```

### 运行

```bash
# 本地开发
/Users/ylsuen/.venv/bin/python -m http.server 8765 --directory .
# 或
npx serve .

# 本题讨论匿名提交需要配置 Pages production secret
printf '%s' '<FINE_GRAINED_GITHUB_TOKEN_WITH_ISSUES_READ_WRITE>' \
  | npx wrangler pages secret put GITHUB_TOKEN --project-name gaokao

# 本题讨论同步到 forum.rdfzer.com/c/25-category/25 需要配置 Discourse API key
npx wrangler pages secret put DISCOURSE_API_KEY --project-name gaokao
# 可选：默认以 system 发帖；如需指定发帖用户，配置 DISCOURSE_API_USERNAME
npx wrangler pages secret put DISCOURSE_API_USERNAME --project-name gaokao

# 重新生成 AI 答案 / 标注（已经跑过一次了，幂等可重跑）
node scripts/migrate-data.mjs                      # 字段结构归一（idempotent）
node scripts/migrate-answer-versions.mjs           # 答案版本迁移（idempotent）
node scripts/patch-2025-gpt55-independent.mjs      # 2025 整卷独立 GPT-5.5 pro 答案；不读 Claude 文本
node scripts/validate-data.mjs                     # 数据完整性校验
node scripts/generate-content.mjs --concurrency=4  # 跑所有缺失项
node scripts/generate-content.mjs --only=guwen --force  # 强制重跑某题型
node scripts/generate-content.mjs --id=2025-guwen --force # 只重跑指定 record id
node scripts/fix-annotation-qindex.mjs             # 跑过 generate 之后再跑这个，把 AI 用错的题号修正
```

`generate-content.mjs` 选项：
- `--only=guwen,shici` 只处理指定题型
- `--id=2025-guwen,2025-shici` 只处理指定 record id
- `--force` 强制重新生成（默认跳过已有答案的）
- `--concurrency=N` 并发数（默认 3，建议 2–4）
- `--limit=N` 只跑前 N 条
- `--dry-run` 不写盘，只看输出

## 数据结构（每条记录）

```jsonc
{
  "id": "2024-guwen",                  // 稳定 ID
  "year": 2024,
  "key": "guwen",
  "typeLabel": "古文",                 // 中文显示标签
  "topic": "二、本大题共5小题…",
  "annotation": "(取材于《墨子.非命》)…",  // 试卷里的脚注
  "materials": [                       // 结构化原文段落
    { "key": "material2", "label": "材料2", "text": "子墨子言曰:…" }
  ],
  "questions": [                       // 结构化小题（qIndex 是稳定的 1..N）
    { "qIndex": 1, "id": "q1", "text": "6.下列…", "score": 3 }
  ],
  "annotations": [                     // 原文中要标注的位置
    {
      "qIndex": 1,                     // 关联到第几小题
      "type": "dot",                   // dot=加点字, underline=画线句, wave=关键句, highlight=重点词
      "material": "material2",         // 在哪段材料
      "start": 130, "end": 131,        // 在该材料中的字符偏移
      "anchor": "当",                  // 命中的字面文本（用于校验和高亮）
      "rationale": "题目 1 A 选项考查…"  // 工具提示用
    }
  ],
  "ai_answer_current_version": "gpt_5_5_pro",
  "ai_answer_version_labels": {
    "claude_opus_4_8": "Claude Opus 4.8版本答案",
    "gpt_5_5_pro": "GPT-5.5 pro 版本答案"
  },
  "ai_answer_versions": {              // 双版本答案；旧答案不丢
    "claude_opus_4_8": {
      "label": "Claude Opus 4.8版本答案",
      "answers": { "1": "..." }
    },
    "gpt_5_5_pro": {
      "label": "GPT-5.5 pro 版本答案",
      "answers": { "1": "..." }
    }
  },
  "ai_answers": {                      // 当前前端读取字段，指向 GPT-5.5 pro 版本
    "1": "答案：A\n\n解析：…",
    "2": "…"
  },
  "ai_generated_at": "2026-04-28T…",
  "ai_generator_version": "v1",

  // 兼容字段，前端不展示，只用于回滚 / 调试
  "material1": null, "material2": "…", "material3": null,
  "question1": "6.下列…", "question2": "…", "question3": "…",
  "reference_answer": "…",             // 原参考答案（保留备份，前端不显示）
  "_legacyReferenceAnswer": "…"        // 与 reference_answer 同源；前端不显示
}
```

## 用户数据 / 偏好的存储位置

| 内容 | localStorage 键 | 远端 (BdfzIdentity API) |
| --- | --- | --- |
| 已读 / 已做进度 | `gk_progress` | `syncProgress` itemKey=`paper-{id}` |
| 用户答案文本 | `gk:answer:{id}#{qIndex}` | `syncProgress` itemKey=`answer-{id}-q{qIndex}`（meta.text 存全文） |
| 对话历史 | `gk:chat:{id}#{qIndex}` | `recordConversation` sessionKey=`gk-{id}-q{qIndex}` |
| 最近阅读 | `gk_last_position` | `recordEvent` `gk-last-position` |

整套模式中的答案和对话始终换算回原始 `{recordId}#{qIndex}`，因此切回单题型时不会产生两份状态。

## 验证标注是否正确

```bash
python3 - <<'PY'
import json
d = json.load(open('data/all.json'))
for r in d:
    if r['key'] not in ('guwen','shici','lunyu','honglou'): continue
    valid = {q['qIndex'] for q in r['questions']}
    bad = [a for a in r['annotations'] if a['qIndex'] not in valid]
    if bad: print(r['id'], '⚠', len(bad), 'orphan annotations')
PY
```

跑 `fix-annotation-qindex.mjs` 之后这个脚本应该不会输出任何 `⚠`。

## Verification standard

1. **Source of truth**：本目录是 `gk.bdfz.net` 的部署源；Cloudflare Pages 项目名为 `gaokao`，生产分支为 `main`。
2. **Health probe**：`curl -fsS https://gk.bdfz.net/`、`curl -fsS https://gk.bdfz.net/data/all.json` 和 `curl -fsS https://gk.bdfz.net/api/question-discussions?recordId=2025-feilian&qIndex=1` 均须返回成功状态。
3. **Contract check**：运行 `node scripts/validate-data.mjs`、`node --check assets/js/app.js`；浏览器分别验证单题型、完整年份、不完整年份、上一题／下一题、答案跨模式保持、AI 答案、AI 对话及讨论懒加载。
4. **Deploy command and forbidden actions**：先把 `index.html`、`assets/`、`functions/`、`data/all.json` 放入干净暂存目录，部署预览分支并验收，再把同一暂存目录部署到 `main`。禁止从仓库根目录直接上传，避免把备份、日志、答案中间文件或本地工具目录暴露到站点。
5. **Dependency regression**：检查 `https://my.bdfz.net/site-auth.js`、`https://apis.bdfz.net/health`、Pulse 的 `/api/meta` 与 `/api/range` 中 `gk` 覆盖，以及 Companion 的 `SERVICES` 中 `gk.bdfz.net` 入口。此站是叶项目；不得改变 User Center、APIS、导航或 Companion 的共享契约。
6. **Backup / restore**：部署前保存部署文件归档及 SHA-256，并记录当前生产 deployment ID。源码恢复应从归档解包到独立目录后按文件核对，不在脏工作树上执行覆盖式 Git 回退。
7. **Rollback**：优先在 Cloudflare Pages 把上一个已验证的 production deployment 提升为生产；或从部署前归档建立干净暂存目录后重新部署。回滚后重跑第 2、3、5 项。
8. **Last verified**：2026-07-14 11:43 UTC；生产 deployment `eff09c31-f570-47a8-b128-d51963ac6c92`。数据、语法、桌面 / 平板 / 手机、整套 / 单题型切换、AI 对话、公开讨论、User Center、Pulse 与 Companion 入口均已验证。

## AI 答案版本

当前数据层有两个答案版本：

1. `Claude Opus 4.8版本答案`：保存在 `ai_answer_versions.claude_opus_4_8.answers`；旧 4.7 数据保留在迁移备份中，不进入当前展示。
2. `GPT-5.5 pro 版本答案`：保存在 `ai_answer_versions.gpt_5_5_pro.answers`；`ai_answers` 同步指向这一版本以兼容现有前端。当前验证器确认 194 条记录 / 591 道小题均有两个答案版本；生成 prompt 只包含题干、材料和原注，不包含旧 AI 答案。旧数据备份见 `data/all.pre-full-regenerate-2026-05-05.json`。

历史生成脚本 `scripts/generate-content.mjs` 仍保留，用于必要时重跑答案 / annotation 生成。它通过唯一共享 Gemini 网关 `https://apis.bdfz.net/` 发送结构化 prompt：

```
[系统设定 — 资深语文老师角色]
[年份 / 题型 / topic]
[材料 1 / 材料 2 / 材料 3 + 注释]
[题目 1..N（含分值）]
[输出要求 — 严格 JSON：ai_answers + annotations]
```

AI 返回 JSON 之后脚本：
1. 用 `JSON.parse` + `\`\`\`json\`\`\`` 围栏抽取兼容多种返回格式；
2. 把模型可能误用的卷面题号重新映射为结构化 `qIndex`，并把新答案同步写入 `ai_answer_versions.gpt_5_5_pro.answers` 与 `ai_answers`；
3. 对每条 annotation 用 `String#indexOf` 在指定 material 中定位，定位失败时按"去掉星号 → 去掉空白 → 去掉首尾标点 → 简繁互转"四种回退依次尝试；
4. 仍定位不到的 anchor 写入 `ai-generation-log.json` 的 `failures` 字段方便人工补救。

生成脚本支持按题型、记录和缺失项断点续跑；重跑前必须先备份 `data/all.json`。

## 技术栈

- **前端**：纯 HTML + CSS + 原生 ES Modules，无打包步骤（部署到任何静态主机皆可）。
- **后端**：复用 `apis.bdfz.net`（AI）和 `my.bdfz.net`（用户系统）；本题讨论使用 Cloudflare Pages Function 访问 `https://github.com/ieduer/gaokao/issues`。
- **资产**：正文优先使用系统中文衬线字体，界面不依赖装饰性背景图。

## 授权

© Suen
