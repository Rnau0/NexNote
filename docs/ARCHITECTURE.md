# 架构说明

## 一句话

把"能迁移到未来 App 的部分"全部关在 `src/core` 与 `src/services` 里，
把"只能在 Obsidian 里跑的部分"全部关在 `src/platform/obsidian` 里。

## 分层

```
        ┌─────────────────────────────────────────────┐
        │  main.ts（插件入口 / 命令 / 设置页注册）      │
        └───────────────┬─────────────────────────────┘
                        │
        ┌───────────────▼─────────────────────────────┐
        │  platform/obsidian（视图、弹窗、requestUrl）  │  ← 只有这里能 import "obsidian"
        └───────────────┬─────────────────────────────┘
                        │ 依赖注入
        ┌───────────────▼─────────────────────────────┐
        │  services/NexNoteService（业务编排）          │  ← 不 import "obsidian"
        └───────────────┬─────────────────────────────┘
                        │
        ┌───────────────▼─────────────────────────────┐
        │  core（ai / cards / chat / citation / storage）│  ← 纯 TS，可在 Node 与 App 里跑
        └─────────────────────────────────────────────┘
```

### core

| 模块 | 职责 | 关键导出 |
| --- | --- | --- |
| `core/ai/http.ts` | HTTP 抽象（`HttpClient`） | `HttpRequest` / `HttpResponse` / `HttpClient` |
| `core/ai/types.ts` | 消息、请求、错误模型 | `ChatRequest` / `AIProvider` / `AIError` |
| `core/ai/openaiCompatible.ts` | OpenAI 兼容协议客户端 | `OpenAICompatibleProvider` |
| `core/ai/providers.ts` | 内置提供商预设 | `PROVIDER_DESCRIPTORS` |
| `core/ai/prompts.ts` | 全部提示词与候选卡片解析 | `buildKnowledgeExtractionMessages` / `parseKnowledgeCandidates` |
| `core/cards/*` | 卡片模型与树形仓储 | `KnowledgeCard` / `CardRepository` |
| `core/chat/ChatSession.ts` | 多轮对话状态 | `ChatSession` / `ChatTurn` |
| `core/citation/types.ts` | 引用与提问拼装 | `Quote` / `composeQuestion` |
| `core/storage/JsonStore.ts` | JSON 读写与损坏保护 | `TextStorage` / `JsonStore` |

`CardRepository` 是卡片数据的**唯一权威来源**：内存树 + 变更事件。
它不碰磁盘（由 `JsonStore` 负责）、不碰 DOM（由视图负责），因此可以直接在 Node 里做单元测试。

### services

`NexNoteService` 把下面这些东西粘起来：

- `getSettings()` → 当前设置
- `TextStorage` → 落盘实现（Obsidian 端是 vault 适配器）
- `HttpClient` → 网络实现（Obsidian 端是 `requestUrl`）

它对外暴露：聊天发送、卡片增删改、知识点抽取、连接测试、变更订阅。
因为它是构造函数注入，未来换成 Android 的 OkHttp / 文件系统实现即可复用。

### platform/obsidian

| 文件 | 说明 |
| --- | --- |
| `ObsidianTextStorage` | 用 `vault.adapter` 实现 `TextStorage`，自动建目录 |
| `ObsidianHttpClient` | 用官方 `requestUrl` 实现 `HttpClient`（绕开 CORS，移动端可用） |
| `AssistantView` | 右侧栏 AI 助手 |
| `ChatTranscript` / `ChatComposer` | 侧边栏与卡片内共用的对话渲染与输入组件 |
| `CardModal` | 卡片详情、独立追问框、存为子卡片 |
| `CardBrowserModal` | 卡片库总览 |
| `dom.ts` | 选区读取、输入框自适应等小工具 |

## 为什么不用 fetch

Obsidian 桌面端与移动端的渲染进程都受 CORS 限制；`requestUrl` 由原生层发请求，
两端行为一致，是官方推荐做法。代价是**拿不到流式响应**。

如果后续要做流式：在 `AIProvider` 上增加 `streamChat(request, onDelta)`，
`ObsidianHttpClient` 之外再实现一个 `StreamingHttpClient`（桌面端可用 fetch 实现，
移动端视 Obsidian 版本而定），`ChatSession` 增加增量追加接口。核心层不用改结构。

## 数据格式

`<vault>/NexNote/cards.json`：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "cards": [
    {
      "id": "card_ab12cd34ef56",
      "parentId": null,
      "rootId": "card_ab12cd34ef56",
      "depth": 0,
      "branchLabel": "起始卡",
      "question": "为什么史瓦西半径与质量成正比？",
      "answer": "……",
      "anchor": { "kind": "pdf", "documentPath": "教材.pdf", "page": 12, "quote": "r = 2GM/c²" },
      "quotes": ["r = 2GM/c²"],
      "tags": ["广义相对论"],
      "status": "draft",
      "origin": { "provider": "deepseek", "model": "deepseek-chat" },
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

- 只增不改字段时**不需要**动 `schemaVersion`，读取端会补齐缺失字段
- 需要破坏性变更时提升 `CARD_SCHEMA_VERSION`，在 `reviveCard` 里写迁移
- 读坏文件时**不覆盖原文件**：服务层会记录 `lastLoadError`、以空库启动并在设置页提示

`anchor.rects` 已为 PDF 坐标定位预留，第二阶段由 PDF 模块填充，卡片结构无需变动。

## 扩展点

| 需求 | 改哪里 |
| --- | --- |
| 新增 AI 提供商 | `core/ai/providers.ts` 加一项预设；协议未变无需改客户端 |
| 换存储后端 | 实现 `TextStorage` |
| 换网络实现（App） | 实现 `HttpClient` |
| PDF 虚线标注 | 新增 `platform/obsidian` 下的 PDF 视图组件，读 `card.anchor.rects` 画线 |
| 手写批注兼容 | 新增独立适配模块，与卡片层通过 `anchor` 解耦 |
