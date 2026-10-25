import { describe, expect, it } from "vitest";
import { JsonStore, JsonStoreError, type TextStorage } from "../src/core/storage/JsonStore";

class MemoryStorage implements TextStorage {
  readonly files = new Map<string, string>();
  failRead = false;
  failWrite = false;

  async read(path: string): Promise<string | null> {
    if (this.failRead) {
      throw new Error("读盘失败");
    }
    return this.files.has(path) ? (this.files.get(path) as string) : null;
  }

  async write(path: string, content: string): Promise<void> {
    if (this.failWrite) {
      throw new Error("写盘失败");
    }
    this.files.set(path, content);
  }
}

interface Payload {
  schemaVersion: number;
  items: string[];
}

describe("JsonStore", () => {
  it("文件不存在时返回默认值", async () => {
    const storage = new MemoryStorage();
    const store = new JsonStore<Payload>({
      storage,
      path: "NexNote/cards.json",
      defaults: () => ({ schemaVersion: 1, items: [] }),
    });

    await expect(store.load()).resolves.toEqual({ schemaVersion: 1, items: [] });
  });

  it("保存后可以原样读回", async () => {
    const storage = new MemoryStorage();
    const store = new JsonStore<Payload>({
      storage,
      path: "NexNote/cards.json",
      defaults: () => ({ schemaVersion: 1, items: [] }),
    });

    await store.save({ schemaVersion: 1, items: ["a", "b"] });
    await expect(store.load()).resolves.toEqual({ schemaVersion: 1, items: ["a", "b"] });
    expect(storage.files.get("NexNote/cards.json")).toContain("\n"); // 带缩进，方便人读
  });

  it("JSON 损坏时抛出 parse 错误而不是覆盖原文件", async () => {
    const storage = new MemoryStorage();
    storage.files.set("cards.json", "{ 这不是 JSON");
    const store = new JsonStore<Payload>({
      storage,
      path: "cards.json",
      defaults: () => ({ schemaVersion: 1, items: [] }),
    });

    const error = await store.load().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JsonStoreError);
    expect((error as JsonStoreError).kind).toBe("parse");
    expect(storage.files.get("cards.json")).toBe("{ 这不是 JSON");
  });

  it("revive 抛错时视为数据损坏", async () => {
    const storage = new MemoryStorage();
    storage.files.set("cards.json", JSON.stringify({ schemaVersion: 1, items: "不是数组" }));
    const store = new JsonStore<Payload>({
      storage,
      path: "cards.json",
      defaults: () => ({ schemaVersion: 1, items: [] }),
      revive: (raw) => {
        const items = (raw as Payload).items;
        if (!Array.isArray(items)) {
          throw new Error("items 必须是数组");
        }
        return raw as Payload;
      },
    });

    await expect(store.load()).rejects.toBeInstanceOf(JsonStoreError);
  });

  it("读盘失败时抛出 io 错误", async () => {
    const storage = new MemoryStorage();
    storage.failRead = true;
    const store = new JsonStore<Payload>({
      storage,
      path: "cards.json",
      defaults: () => ({ schemaVersion: 1, items: [] }),
    });

    const error = await store.load().catch((caught: unknown) => caught);
    expect((error as JsonStoreError).kind).toBe("io");
  });
});
