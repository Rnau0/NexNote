import { describe, expect, it } from "vitest";
import { NexNoteService } from "../src/services/NexNoteService";
import { mergeSettings } from "../src/settings/settings";
import type { TextStorage } from "../src/core/storage/JsonStore";
import type { HttpClient, HttpRequest, HttpResponse } from "../src/core/ai/http";

class MemoryStorage implements TextStorage {
  readonly files = new Map<string, string>();

  async read(path: string): Promise<string | null> {
    return this.files.has(path) ? (this.files.get(path) as string) : null;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}

class StubHttp implements HttpClient {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly reply: (request: HttpRequest) => HttpResponse) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.reply(request);
  }
}

function chatReply(content: string): HttpResponse {
  return {
    status: 200,
    text: JSON.stringify({ model: "deepseek-chat", choices: [{ message: { content } }] }),
  };
}

function createService(http: HttpClient, storage: TextStorage, settingsOverrides: Record<string, unknown> = {}) {
  const settings = mergeSettings({
    activeProvider: "deepseek",
    providers: { deepseek: { apiKey: "sk-test", model: "deepseek-chat" } },
    ...settingsOverrides,
  });
  return new NexNoteService({
    getSettings: () => settings,
    storage,
    http,
    now: () => new Date("2024-01-01T00:00:00.000Z"),
  });
}

describe("NexNoteService 集成", () => {
  it("空库启动时没有卡片也不报错", async () => {
    const service = createService(new StubHttp(() => chatReply("ok")), new MemoryStorage());

    await service.load();

    expect(service.lastLoadError).toBeNull();
    expect(service.getCards().size).toBe(0);
  });

  it("聊天成功后追加一问一答两轮", async () => {
    const http = new StubHttp(() => chatReply("熵是系统混乱程度的度量。"));
    const service = createService(http, new MemoryStorage());
    await service.load();

    const outcome = await service.send(service.getMainSession(), "什么是熵？");

    expect(outcome.ok).toBe(true);
    const turns = service.getMainSession().getTurns();
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe("user");
    expect(turns[1].content).toContain("混乱程度");
    expect(http.requests[0].url).toBe("https://api.deepseek.com/v1/chat/completions");
  });

  it("聊天失败时记录一条错误提示，而不是抛异常", async () => {
    const service = createService(
      new StubHttp(() => ({ status: 401, text: "unauthorized" })),
      new MemoryStorage(),
    );
    await service.load();

    const outcome = await service.send(service.getMainSession(), "你好");

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("API Key");
    const turns = service.getMainSession().getTurns();
    expect(turns).toHaveLength(2);
    expect(turns[1].failed).toBe(true);
    // 错误提示不应进入下一轮的上下文
    expect(service.getMainSession().toMessages()).toHaveLength(2);
  });

  it("从选中文本生成草稿卡片，并写入 JSON 文件", async () => {
    const storage = new MemoryStorage();
    const http = new StubHttp(() =>
      chatReply(
        JSON.stringify([
          {
            question: "为什么半径与质量成正比？",
            answer: "因为史瓦西半径由逃逸速度等于光速推出。",
            quote: "r = 2GM/c²",
            importance: 0.9,
            tags: ["广义相对论"],
          },
        ]),
      ),
    );
    const service = createService(http, storage);
    await service.load();

    const outcome = await service.extractCards({
      text: "史瓦西半径 r = 2GM/c²，其中 G 为引力常数……",
      documentPath: "教材/相对论.pdf",
      page: 12,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.cards).toHaveLength(1);

    const card = outcome.cards[0];
    expect(card.status).toBe("draft");
    expect(card.anchor?.kind).toBe("pdf");
    expect(card.anchor?.page).toBe(12);
    expect(card.origin?.provider).toBe("deepseek");
    expect(card.quotes).toEqual(["r = 2GM/c²"]);

    const written = storage.files.get("NexNote/cards.json");
    expect(written).toBeTruthy();
    expect(JSON.parse(written as string).cards).toHaveLength(1);
  });

  it("重新加载后卡片与父子结构都能恢复", async () => {
    const storage = new MemoryStorage();
    const first = createService(new StubHttp(() => chatReply("答复")), storage);
    await first.load();
    const root = first.createCard({ question: "根卡片", answer: "根解释" });
    const child = first.createBranch(root.id, { question: "追问", answer: "回答" });
    await first.save();

    const second = createService(new StubHttp(() => chatReply("答复")), storage);
    await second.load();

    expect(second.getCards().size).toBe(2);
    expect(second.getCard(root.id)?.question).toBe("根卡片");
    expect(second.getCard(child.id)?.parentId).toBe(root.id);
    expect(second.getCards().descendants(root.id)).toHaveLength(1);
  });

  it("卡片库损坏时不会覆盖原文件，只记录错误", async () => {
    const storage = new MemoryStorage();
    storage.files.set("NexNote/cards.json", "{ 坏掉的 JSON");
    const service = createService(new StubHttp(() => chatReply("ok")), storage);

    await service.load();

    expect(service.lastLoadError).toBeTruthy();
    expect(service.getCards().size).toBe(0);
    expect(storage.files.get("NexNote/cards.json")).toBe("{ 坏掉的 JSON");
  });

  it("删除父卡片会级联删掉子卡片", async () => {
    const service = createService(new StubHttp(() => chatReply("ok")), new MemoryStorage());
    await service.load();
    const root = service.createCard({ question: "根", answer: "a" });
    service.createBranch(root.id, { question: "子", answer: "b" });

    const removed = service.deleteCard(root.id, true);

    expect(removed).toHaveLength(2);
    expect(service.getCards().size).toBe(0);
  });

  it("测试连接失败时返回可读的中文提示", async () => {
    const service = createService(
      new StubHttp(() => ({ status: 200, text: "<html>不是 JSON</html>" })),
      new MemoryStorage(),
    );
    await service.load();

    const result = await service.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("AI 服务返回");
  });

  it("没有填 API Key 时在本地拦截，不发起网络请求", async () => {
    const http = new StubHttp(() => chatReply("ok"));
    const service = createService(http, new MemoryStorage(), {
      providers: { deepseek: { apiKey: "", model: "deepseek-chat" } },
    });
    await service.load();

    const outcome = await service.send(service.getMainSession(), "在吗");

    expect(outcome.ok).toBe(false);
    expect(http.requests).toHaveLength(0);
  });
});
