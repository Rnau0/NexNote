# NexNote

面向学习场景的开源 AI 笔记插件：**保留教材原始排版**，在原文之上叠加 AI 知识标注与层级知识卡片。

当前形态是 Obsidian 插件；核心逻辑（AI 调用、卡片模型、引用系统、存储格式）与 Obsidian 适配层完全分离，以便未来迁移为独立 Android App（优先适配鸿蒙平板的安卓兼容环境）。

> 设计原则：**AI 增强学习体验，而不是替换教材。**
> 教材的公式、图片、页码、排版一律保留原样，插件只在需要解释的地方加一层轻量标注。

> 📌 **交接中**：当前开发状态、剩余任务与下一步建议见 [HANDOFF.md](HANDOFF.md)。

---

## 现在能做什么（v0.1.0 · 第一阶段）

- ✅ 右侧栏 **全局 AI 助手**，支持多轮追问
- ✅ **DeepSeek / OpenAI / 任意 OpenAI 兼容 API** 可切换，API Key、Base URL、模型名、温度、最大输出长度均可配置
- ✅ 设置页 **「测试连接」** 一键验证 Key 与地址
- ✅ **选中教材文字 → 生成知识卡片**（草稿），卡片含问题、解释、原文引用、标签、重要度
- ✅ 知识卡片 **父子结构**：卡片底部独立聊天框追问，可把追问「存为子卡片」形成分支
- ✅ **选中卡片里的文字 → 引用到提问框**（卡片内追问框 或 主侧栏聊天框）
- ✅ 卡片库以**可迁移 JSON** 保存在 vault 内，可跨端备份
- ✅ 聊天**字体、字号、行高、时间戳**可自定义
- ✅ 桌面端 / **移动端（含安卓、鸿蒙安卓兼容环境）** 均适配

暂未实现（见 [docs/ROADMAP.md](docs/ROADMAP.md)）：

- ⛔ PDF 原文下方的可点击虚线标注与坐标定位（第二阶段，与 Codex 协作）
- ⛔ Ink-Annotation 手写批注兼容层
- ⛔ 知识画布与跨文档知识关联
- ⛔ 流式输出（Obsidian `requestUrl` 不支持流，已在架构中预留扩展点）

---

## 安装

### 桌面端（Windows / macOS / Linux）

1. 从本仓库 Releases 下载 `main.js`、`manifest.json`、`styles.css`（或自行 `npm run build` 生成）
2. 在你的 vault 里建目录：`<你的仓库>/.obsidian/plugins/nexnote/`
3. 把上述三个文件放进去
4. Obsidian → 设置 → 第三方插件 → 关闭「安全模式」→ 刷新已安装插件 → 启用 **NexNote**
5. 点左侧丝带图标（✨）或按 `Ctrl/Cmd + P` 搜索「NexNote: 打开 AI 助手侧边栏」
6. 设置 → 第三方插件 → NexNote → 填入 DeepSeek API Key → 点「测试连接」

### 安卓 / 鸿蒙平板

插件本身声明了 `isDesktopOnly: false`，可在移动端运行。推荐流程：

1. 在桌面端把 `nexnote` 插件目录（`main.js` / `manifest.json` / `styles.css`）同步到移动端同一 vault 的 `.obsidian/plugins/nexnote/`（用 Obsidian Sync、Syncthing 或手动拷贝均可）
2. 移动端 Obsidian → 设置 → 第三方插件 → 启用 **NexNote**
3. 右侧栏可拉出 AI 助手；也可以把 `NexNote` 命令加到工具栏
4. 移动端注意：输入框内 Enter 是换行，**点「发送」提交**
5. 鸿蒙平板：通过 HarmonyOS 的安卓兼容层安装 Obsidian 安卓版即可；插件不依赖 Electron / Node，只用 Obsidian 公开 API 与 `requestUrl`，不涉及原生模块

> 注意：本插件不包含任何 PDF 渲染内核。PDF 阅读依赖你已安装的 PDF 阅读插件（如 PDF++ / Annotator），NexNote 只负责知识标注与卡片层。

---

## 开发

```bash
git clone https://github.com/Rnau0/NexNote.git
cd NexNote
npm install            # 建议指定 --cache 到 E 盘，避免占满系统盘
npm run dev            # 监听 src/ 变化，实时打包 main.js
npm run build          # 类型检查 + 生产构建
npm test               # 单元测试（vitest）
```

开发模式下把仓库根目录软链/拷贝到 vault 的 `.obsidian/plugins/nexnote/`，Obsidian 里开启插件并「重新加载」即可看到改动。

更细的开发说明见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

---

## 架构一览

```
src/
├─ core/                  # 纯 TypeScript，不依赖 obsidian，可直接搬去 App
│  ├─ ai/                 # 提供商抽象、OpenAI 兼容客户端、提示词
│  ├─ cards/              # 知识卡片模型 + 树形仓储（父子/分支/级联删除）
│  ├─ chat/               # 多轮对话状态
│  ├─ citation/           # 引用与提问拼装
│  └─ storage/            # 通用 JSON 存储抽象
├─ settings/              # 设置结构与设置页
├─ services/              # 业务编排（把 core 与适配层接起来）
├─ platform/obsidian/     # Obsidian 适配层：视图、弹窗、requestUrl、vault 存储
└─ main.ts                # 插件入口：注册视图/命令/设置页
```

关键约束：**`src/core/**` 与 `src/services/**` 内不得 `import ... from "obsidian"`**。
这条约束是未来迁移独立 App 的前提，改动时请守住。

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 数据与隐私

- 卡片库默认写在 `<vault>/NexNote/cards.json`，是一个普通 JSON 文件
- API Key 只存在 Obsidian 插件数据 `data.json`（已被 `.gitignore` 排除）
- 仓库不包含、也不应包含任何教材 PDF、个人笔记或密钥
- 插件不采集遥测；网络请求只发往你自己配置的 AI 端点

---

## 路线图

| 阶段 | 目标 |
| --- | --- |
| 一（已完成） | 插件骨架、AI 侧边栏、提供商配置、卡片模型与引用系统、构建与测试 |
| 二 | PDF 坐标定位与原文虚线标注、Ink-Annotation 手写兼容、点击卡片联动 |
| 三 | 知识画布、跨文档知识关联、独立 Android App 迁移 |

详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

---

## 协作分工

- **DSH Agent**：插件工程、UI、AI API、数据结构、测试、文档、常规修复
- **Codex**：PDF 复杂坐标定位、移动端兼容难题、关键代码审查

两边都只在各自目录内改动（`E:\NexNote` / `E:\MinerU`），互不越界。

---

## License

MIT，见 [LICENSE](LICENSE)。
