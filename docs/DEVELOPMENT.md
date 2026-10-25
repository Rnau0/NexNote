# 开发说明

## 环境要求

- Node.js ≥ 18（本项目在 Node 24 / npm 11 下开发）
- npm ≥ 9
- 一个用来调试的 Obsidian vault

## 首次安装

```bash
git clone https://github.com/Rnau0/NexNote.git
cd NexNote
npm install --cache ./.npm-cache
```

> 为什么带 `--cache`：`node_modules` 与 npm 缓存都落在 E 盘仓库内，避免占满 C 盘。
> 该目录已在 `.gitignore` 中排除。不要修改全局 npm 配置。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 监听 `src/`，自动打包出 `main.js`（内联 sourcemap） |
| `npm run build` | 先 `tsc --noEmit` 类型检查，再产出压缩后的 `main.js` |
| `npm run typecheck` | 只做类型检查 |
| `npm test` | 跑单元测试（vitest，覆盖 core 层） |
| `npm run test:watch` | 测试监听模式 |
| `npm version patch` | 同步升级 `package.json` / `manifest.json` / `versions.json` |

## 在 Obsidian 里调试

1. 把仓库根目录链接到 vault 的插件目录：

   Windows（管理员 PowerShell）：
   ```powershell
   New-Item -ItemType Junction -Path "<vault>\.obsidian\plugins\nexnote" -Target "E:\NexNote"
   ```

   macOS / Linux：
   ```bash
   ln -s /path/to/NexNote "<vault>/.obsidian/plugins/nexnote"
   ```

2. Obsidian → 设置 → 第三方插件 → 启用 NexNote
3. 改了代码后：`Ctrl/Cmd + P` → `Reload app without saving`（或装 Hot Reload 插件）

## 代码约束

- **`src/core/**` 与 `src/services/**` 不得 `import ... from "obsidian"`**
  这是将来迁移独立 App 的前提。需要 Obsidian 能力时，用接口（`TextStorage` / `HttpClient`）注入。
- 只用 Obsidian **公开 API**；不依赖 Node.js / Electron 专有模块（`fs`、`path`、`electron` 等），保证移动端可用。
- 不覆盖用户的原始文件；本插件只**新增** `NexNote/cards.json`。
- 新增依赖前先确认许可证（MIT / Apache-2.0 / BSD 可接受，GPL 需讨论）。
- 提交前跑 `npm run build && npm test`。

## 目录速查

```
src/core/ai/          提供商与提示词
src/core/cards/       卡片模型与仓储
src/core/chat/        对话会话状态
src/core/citation/    引用与提问拼装
src/core/storage/     JSON 存储抽象
src/services/         业务编排
src/platform/obsidian 视图、弹窗、requestUrl、vault 存储
src/settings/         设置结构与设置页
test/                 core 层单元测试
docs/                 架构、开发、路线图
```

## 分支与提交

- `main` 只接受评审过的合并；开发在 `feature/*` 分支上进行
- 提交信息用中文或英文均可，但要说清"改了什么、为什么"
- 未经确认不要合并到 `main`

## 常见问题

**Q：打包出来的 `main.js` 要不要提交？**
不要。`.gitignore` 已排除，Release 时单独上传。

**Q：为什么回答不是逐字出现的（无流式）？**
Obsidian 官方 `requestUrl` 不支持流式。扩展方案见 `docs/ARCHITECTURE.md`「为什么不用 fetch」。

**Q：移动端能不能装？**
可以，`manifest.json` 中 `isDesktopOnly: false`，且不依赖任何桌面专有 API。

**Q：调用报 401？**
设置页点「测试连接」看具体报错；确认 Key 与 Base URL 是否匹配（DeepSeek 的地址是 `https://api.deepseek.com/v1`）。
