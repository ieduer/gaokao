# AI 高考 · 北京真题阅读与练习

[正式站](https://gk.bdfz.net/) 收录 201 条记录、612 道小题和 472 处原文标注，支持单题型与整套阅读、逐题作答、AI 解释和本题讨论。历史题展示 Claude Opus 4.8 与 GPT-5.5 pro 两套答案；2026 北京卷展示原有核验版本的 Codex 答案及来源标签。

## 当前发布权威

运行源码 `17f1f1dbda5c551333688ae36f4124bf134f4550`，正式部署 `23baf659-1f2a-45cc-9740-1d1c10a1329d`。GitHub main 包含此版本；文件提交可以比运行版本更新。通过站点 `/release.json` 核对运行身份，完整当前状态见 [PROJECT_STATE.md](PROJECT_STATE.md)、[发布与回退](docs/OPERATIONS.md)。历史本机 canonical 分支不能直接发布。

## 构建与验证

使用 Node 24.18.0，运行 `npm run build`。此命令执行进度与身份行为测试、完整题库校验及 2026 专项校验，然后只将八个公开静态文件及 `release.json` 放入 `.pages-output`。无需安装新的依赖。

- `data/all.json` 是当前已接受题库；不能用历史备份直接覆盖。
- `scripts/validate-data.mjs`、`scripts/validate-beijing-2026.mjs` 与 `scripts/test-progress-restore.mjs` 是当前检查入口。
- `functions/api/question-discussions.js` 是既有 Pages Function，发布时必须随静态产物一起编译。普通静态服务器只能验证前端，不能证明该接口通过。
- Pages Git 构建命令为 `npm run build`，输出 `.pages-output`。直接发布也必须从干净、已推送的正确源码出发，核对正式目标、现行基线、预览验收与回退点。禁止上传 repository root。

本轮已验证预览和正式全部九个公开文件、讨论读取及一次真实 AI 解释。未发送公开讨论或评分，未声称完成新的跨设备登录进度验收。旧进度只做精确、保守读取；五组歧义键保留，不能猜测迁移。验收边界见 [VERIFICATION_STANDARD.md](docs/VERIFICATION_STANDARD.md)。
