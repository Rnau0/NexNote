# NexNote 交接文档

> 交接方：DSH Web 会话（负责阶段一开发）
> 接手方：DSH TUI
> 交接时间：2026-10-25 16:55（+08:00）
> 项目路径：`E:\NexNote`

---

## 0. 30 秒了解现状

第一阶段（插件骨架 + AI 侧边栏 + 卡片模型）**已完成并验证**：构建通过、65 项测试全绿、工作区干净。
代码在 `feature/dsh-bootstrap` 分支，`main` 未被改动。

**唯一未闭环的动作是推送**：远端目前只有 `main`，本分支从未成功推送（本环境没有 Rnau0 的 GitHub 凭据，终端提示被禁用）。已按用户选择改为由用户在其本地终端执行，见 §1。

---

## 1. 仓库状态（接手前务必先看）

| 项目 | 值 |
| --- | --- |
| 本地路径 | `E:\NexNote` |
| 当前分支 | `feature/dsh-bootstrap` |
| 阶段一代码提交 | `f9609ae`（feat: 初始化 NexNote Obsidian 插件工程（阶段一）） |
| 父提交 | `8396aa6` Initial commit（= `origin/main` = `main`，未改动） |
| 工作区 | 干净，无未提交修改 |
| 远端分支 | **只有 `refs/heads/main`**，`feature/dsh-bootstrap` 尚未推送 |
| 提交身份 | `Rnau0 <Rnau0@users.noreply.github.com>`（仅 `--local`，全局配置未动） |

需要用户在有 Rnau0 凭据的终端执行（**不要** force push、不要合并 main）：

```powershell
cd E:\NexNote
git push -u origin feature/dsh-bootstrap
```

若 GitHub 上提交未归属到 Rnau0 名下，说明 noreply 邮箱未关联，可改邮箱后 `git commit --amend --reset-author --no-edit` 再推。

---

## 2. 交接约束（红线，与立项任务书一致）

- 只在 `E:\NexNote` 内改动；**不要碰 `E:\MinerU`**（Codex 的 MinerU 本地安装与产出）
- 不安装 / 不升级 Python、CUDA、PyTorch、NVIDIA 驱动
- 不改系统环境变量，不改全局 Git 配置
- **不清理 R6808 的凭据**（学校作业专用账号，与 Rnau0 分开）
- API Key、个人笔记、教材原文一律不进仓库
- 不覆盖用户的原始 PDF；插件只新增 `NexNote/cards.json`
- 不删除任何代码、项目文件或任务历史；未经确认不合并 `main`

---

## 3. 已完成功能（阶段一）

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 插件骨架 | ✅ | TypeScript + esbuild，`manifest.json` / `styles.css` / 设置页齐全 |
| AI 侧边栏 | ✅ | 右侧栏可打开、多轮对话、清空、引用原文提问 |
| 移动端兼容 | ✅ | 无右侧栏时降级到主区域标签页；Enter 换行不误发；触控目标放大 |
| 模型提供商 | ✅ | DeepSeek（默认）/ OpenAI / 任意 OpenAI 兼容 API |
| 提供商配置 | ✅ | API Key、Base URL、模型名、温度、最大输出长度 + 「测试连接」 |
| 知识卡片模型 | ✅ | 父子、分支、状态、锚点；`anchor.rects` 为 PDF 坐标预留 |
| 卡片仓储 | ✅ | 树形操作：创建/子卡/更新/级联删除/路径/子孙/变更订阅 |
| AI 服务接口 | ✅ | `AIProvider` + `HttpClient` 依赖注入，核心层不依赖 obsidian |
| 引用系统 | ✅ | 选中文字 → 引用到提问框（卡片内追问框 / 主侧栏） |
| 卡片弹窗 | ✅ | 独立追问框、存为子卡片、删除、跳转子卡片 |
| 卡片库浏览 | ✅ | 树根列表 + 子卡数量，点击进详情 |
| 知识点抽取 | ✅ | 选中文本 → AI 筛选 → 草稿卡片（默认「少量精准」3 张） |
| 存储 | ✅ | 可迁移 JSON，读坏文件不覆盖、只记录错误 |
| 构建脚本 | ✅ | `dev` / `build` / `typecheck` / `test` / `version` / `scripts/verify.sh` |
| 文档 | ✅ | README、ARCHITECTURE、DEVELOPMENT、ROADMAP |
| 测试 | ✅ | 65 项，含服务层集成测试与插件装载冒烟测试 |

阶段一任务书 14 项：13 项完成，第 14 项「推送开发分支」待用户执行。

---

## 4. 剩余任务（按优先级）

### P0 — 交接必须闭环
1. **推送 `feature/dsh-bootstrap`**（见 §1），推完在 GitHub 上确认 49 个文件都在。
2. **真机 GUI 验证**：阶段一从未在真实 Obsidian 客户端里手点过，只做了构建、单元测试与 mock 装载测试。
   验证清单见 §10.2。

### P1 — 阶段二主体（与 Codex 协作）
3. **PDF 原文虚线标注**：页码/文本块 → 屏幕坐标映射（**Codex 主导**复杂定位），在原文下方画可点击虚线，点击弹出对应卡片。
4. **Ink-Annotation 手写批注兼容层**：不迁移笔迹，只共享文档视图。
5. **圈选兜底入口**：AI 未识别时允许手写圈选后手动追问。

### P2 — 体验增强
6. **流式输出**：`AIProvider` 上增加 `streamChat(request, onDelta)`，`ChatSession` 增加增量追加；核心层结构不用改。
7. **卡片库导入/导出按钮**（JSON 本身已可手动备份）。
8. **卡片树的多层渲染**（目前只有单层子卡片列表，深树要逐层点开）。

### P3 — 长期
9. 知识画布、跨文档知识关联、导出 Anki、学习轨迹。
10. 抽取 `src/core` + `src/services` 为独立包，迁移 Android App（优先鸿蒙平板安卓兼容环境）。

---

## 5. 关键文件索引

### 入口与适配层（Obsidian 相关）

| 文件 | 作用 |
| --- | --- |
| `src/main.ts` | 插件入口：注册视图、5 条命令、丝带图标、设置页；`activateAssistant`（含移动端降级） |
| `src/platform/obsidian/AssistantView.ts` | 右侧栏 AI 助手视图 |
| `src/platform/obsidian/ChatComposer.ts` | 输入框 + 引用条 + 发送（桌面 Enter 发送 / 移动端点按钮） |
| `src/platform/obsidian/ChatTranscript.ts` | 消息渲染（两处聊天框共用） |
| `src/platform/obsidian/CardModal.ts` | 卡片详情 + 独立追问框 + 存为子卡片 |
| `src/platform/obsidian/CardBrowserModal.ts` | 卡片库总览 |
| `src/platform/obsidian/ObsidianHttpClient.ts` | 用官方 `requestUrl` 实现 `HttpClient`（绕 CORS，移动端可用） |
| `src/platform/obsidian/ObsidianTextStorage.ts` | 用 `vault.adapter` 实现 `TextStorage`，逐级建目录 |
| `src/settings/SettingsTab.ts` | 设置页（提供商 / 外观 / 标注 / 存储） |

### 核心层（**不得 import "obsidian"**）

| 文件 | 作用 |
| --- | --- |
| `src/core/ai/types.ts` | `ChatRequest` / `AIProvider` / `AIError` / `describeAIError` |
| `src/core/ai/openaiCompatible.ts` | OpenAI 兼容客户端（DeepSeek/OpenAI/自建通用） |
| `src/core/ai/providers.ts` | 内置提供商预设 |
| `src/core/ai/prompts.ts` | 全部提示词 + 候选卡片解析 |
| `src/core/cards/types.ts` | `KnowledgeCard` / `CardAnchor` / `CardCollection` |
| `src/core/cards/CardRepository.ts` | 树形仓储（唯一权威数据源） |
| `src/core/chat/ChatSession.ts` | 多轮对话状态 |
| `src/core/citation/types.ts` | 引用与提问拼装 |
| `src/core/storage/JsonStore.ts` | JSON 读写 + 损坏保护 |
| `src/services/NexNoteService.ts` | 业务编排：聊天/抽卡/持久化/变更通知 |

### 测试与配置

`test/cardRepository.test.ts`、`test/jsonStore.test.ts`、`test/ai.test.ts`、`test/citationChat.test.ts`、`test/settings.test.ts`、`test/service.test.ts`（服务层集成）、`test/pluginLoad.test.ts`（插件装载冒烟，用 `test/stubs/obsidian.ts` 替换真实模块）、`vitest.config.ts`（把 `obsidian` alias 到替身）、`esbuild.config.mjs`、`tsconfig.json`。

---

## 6. 架构约束（改代码前必读）

1. **`src/core/**` 与 `src/services/**` 不得 `import ... from "obsidian"`。**
   这是将来迁移独立 App 的前提。需要平台能力时，注入 `TextStorage` / `HttpClient` 接口。
   目前没有自动化检查，建议补一条测试（见 §10.4）。
2. 只用 Obsidian **公开 API**；不依赖 Node/Electron 专有模块，保证移动端可用。
3. 不用 `fetch` 直连 AI 服务：桌面与移动端渲染进程都有 CORS 限制，统一走 `requestUrl`。
   代价是**没有流式输出**。
4. 设置项结构变动时走 `mergeSettings` 补齐默认值；卡片结构破坏性变更时提升 `CARD_SCHEMA_VERSION` 并在 `reviveCard` 写迁移。

---

## 7. 构建与测试（本次交接实测）

环境：Windows x64，Node `v24.16.0`，npm `11.13.0`。

```bash
cd E:\NexNote
npm install --cache ./.npm-cache   # 依赖与缓存都放 E 盘，避免占满 C 盘
npm run build                      # tsc --noEmit + esbuild 生产构建
npm test                           # vitest
bash scripts/verify.sh             # 一键：typecheck → test → build
```

**本次实测结果（2026-10-25 16:54）**

| 检查 | 结果 |
| --- | --- |
| `npm run build` | 退出码 0；`tsc --noEmit` 0 错误 |
| `main.js` | 52,093 字节（压缩）；`require("obsidian")` 保持外部依赖 |
| `manifest.json` | 317 字节（v0.1.0，`minAppVersion` 1.5.0，`isDesktopOnly: false`） |
| `styles.css` | 13,111 字节 / 633 行 |
| `npm test` | 退出码 0；**7 个文件 / 65 项全部通过**（约 2 秒） |

依赖版本：`obsidian@1.14.4`、`esbuild@0.24.2`、`typescript@5.9.3`、`vitest@3.2.7`、`@types/node@22.20.5`、`builtin-modules@3.3.0`、`tslib@2.8.1`。

代码量：`src/` 3,206 行 TS，`test/` 1,155 行 TS，样式 633 行；仓库跟踪文件 49 个（不含本文件）。

---

## 8. 数据格式与存储

- 卡片库：`<vault>/NexNote/cards.json`（路径可在设置里改），普通 JSON，可直接备份/迁移
- 插件设置与 API Key：Obsidian 插件数据 `data.json`（已在 `.gitignore`）
- 结构：`{ schemaVersion, updatedAt, cards: KnowledgeCard[] }`
- 读取到损坏 JSON 时**不覆盖原文件**：记录 `lastLoadError`、以空库启动、在设置页提示
- `KnowledgeCard.anchor` 目前只填 `kind/documentPath/page/quote`；`rects` 留给 PDF 坐标层

---

## 9. 已知问题与技术债

| 问题 | 影响 | 建议 |
| --- | --- | --- |
| 分支未推送 | 远端看不到阶段一成果 | 用户执行 push |
| 未做真机 GUI 验证 | 可能有只在真实客户端才暴露的 UI/生命周期问题 | 按 §10.2 手工过一遍 |
| 无流式输出 | 长回答要等整段返回 | 阶段二评估 `streamChat` |
| 卡片库全量读写 | 上万张卡可能变慢 | 阶段三分片或换 SQLite |
| 卡片树只渲染单层 | 深树需逐层点开 | 阶段三做画布时统一解决 |
| 设置页「打开设置」用内部 API | 拿不到时降级为文字提示 | 可接受；若 Obsidian 改接口需同步 |
| `MarkdownRenderer` 的 Component 传的是 plugin（`CardModal` 内） | 渲染出的子组件生命周期挂在插件上，不随弹窗销毁 | 弹窗量大时再优化 |
| 提交身份用 noreply 邮箱 | 可能未与 GitHub 账号关联 | 推送后检查；必要时改邮箱 amend |
| `.dsh-ops-update-*.lock` | 文件工具副产物 | 已加入 `.gitignore`，无需处理 |

阶段一开发中修过的真实构建错误（供参考，勿重复踩）：新版 `obsidian` 类型里 `Modal` 不再是 `Component` 子类、`Modal.titleEl` 与自定义字段重名冲突、`DataAdapter.mkdir()` 只接受单层路径。

---

## 10. 下一步建议

### 10.1 接手第一小时
1. 读本文件 §1、§6；读 `README.md` 与 `docs/ARCHITECTURE.md`
2. 跑一次 `bash scripts/verify.sh` 确认环境一致（应全绿）
3. 确认推送状态；若未推送，请用户执行 §1 的命令

### 10.2 真机验证清单（务必做）
1. 把 `main.js` / `manifest.json` / `styles.css` 复制到 `<vault>/.obsidian/plugins/nexnote/`
2. 启用插件 → 点丝带图标 → 右侧栏应出现「NexNote AI 助手」
3. 设置页填 DeepSeek Key → 点「测试连接」→ 应提示连接成功
4. 打开一篇笔记，选中 20 字以上 → 命令面板跑「NexNote: 从选中文本生成知识卡片」→ 应生成草稿卡片并弹出详情
5. 在卡片弹窗追问一句 → 选中回答里的文字 → 点「引用到主聊天」→ 文字应出现在侧栏提问框
6. 断网或填错 Key 再试一次，确认错误提示可读、不崩溃

### 10.3 与 Codex 的接口约定
PDF 层**不要改卡片结构**，只负责把坐标写进 `anchor.rects`（`AnchorRect { x, y, width, height }`，PDF 坐标系、左上角原点）。虚线渲染读取 `card.anchor` 即可，卡片库无需迁移。

### 10.4 建议尽快补的两件小事
1. **核心层纯净性测试**：遍历 `src/core`、`src/services` 下的文件，断言不含 `from "obsidian"`，把架构约束变成测试。
2. **`npm run verify` 别名**：把 `scripts/verify.sh` 挂到 `package.json`，方便与未来 CI 共用。

---

## 11. 环境备忘

- C 盘空间紧张（约 13GB 可用），依赖与缓存都放 E 盘：`node_modules` 71M、`.npm-cache` 149M（均已 gitignore）
- 本机无 `gh` CLI；Git 凭据管理器（GCM）存在但未配置本仓库，且默认「一站一份凭据」，登录 Rnau0 会覆盖已缓存的 R6808 凭据——**不要擅自操作**
- GitHub 仓库：`https://github.com/Rnau0/NexNote.git`（公开，MIT，默认分支 `main`）

---

## 12. 交接检查清单

- [x] 所有项目文件已保存（工作区干净，无未提交修改）
- [x] Git 状态已检查（分支 `feature/dsh-bootstrap`，HEAD `f9609ae`，`main` 未动）
- [x] 构建已执行并记录（退出码 0，`main.js` 52,093 字节）
- [x] 测试已执行并记录（65/65 通过）
- [x] 已提交验证过的代码（在开发分支，未 force push、未合并 main）
- [x] `HANDOFF.md` 已创建并提交
- [x] 未删除任何代码、项目文件或历史
- [ ] **开发分支尚未推送到远端**（等用户用 Rnau0 凭据执行，见 §1）
- [ ] **真机 GUI 验证未做**（见 §10.2）

---

交接完成，DSH Web 侧停止开发。后续由 DSH TUI 接手。
