import { describe, expect, it } from "vitest";
import { CardRepository } from "../src/core/cards/CardRepository";
import type { KnowledgeCard } from "../src/core/cards/types";

function createRepository(): CardRepository {
  let counter = 0;
  let tick = 0;
  return new CardRepository({
    now: () => new Date(Date.UTC(2024, 0, 1, 0, 0, tick++)),
    idFactory: (prefix) => `${prefix}_${++counter}`,
  });
}

describe("CardRepository", () => {
  it("创建根卡片时 depth 为 0、rootId 指向自己", () => {
    const repository = createRepository();
    const card = repository.createRoot({ question: "什么是熵？", answer: "混乱度的度量。" });

    expect(card.depth).toBe(0);
    expect(card.parentId).toBeNull();
    expect(card.rootId).toBe(card.id);
    expect(card.branchLabel).toBe("起始卡");
    expect(card.status).toBe("draft");
    expect(repository.size).toBe(1);
  });

  it("子卡片继承 rootId 并递增 depth", () => {
    const repository = createRepository();
    const root = repository.createRoot({ question: "根问题", answer: "根解释" });
    const child = repository.addChild(root.id, { question: "追问一", answer: "回答一" });
    const grandChild = repository.addChild(child.id, { question: "追问二", answer: "回答二" });

    expect(child.depth).toBe(1);
    expect(child.rootId).toBe(root.id);
    expect(grandChild.depth).toBe(2);
    expect(grandChild.rootId).toBe(root.id);
    expect(repository.childrenOf(root.id).map((card) => card.id)).toEqual([child.id]);
  });

  it("path 返回从根卡到目标卡的链路", () => {
    const repository = createRepository();
    const root = repository.createRoot({ question: "根", answer: "a" });
    const child = repository.addChild(root.id, { question: "子", answer: "b" });

    expect(repository.path(child.id).map((card) => card.id)).toEqual([root.id, child.id]);
    expect(repository.path("不存在").length).toBe(0);
  });

  it("descendants 返回全部子孙（不含自身）", () => {
    const repository = createRepository();
    const root = repository.createRoot({ question: "根", answer: "a" });
    const first = repository.addChild(root.id, { question: "一", answer: "b" });
    const second = repository.addChild(root.id, { question: "二", answer: "c" });
    repository.addChild(first.id, { question: "一一", answer: "d" });

    expect(
      repository
        .descendants(root.id)
        .map((card) => card.id)
        .sort(),
    ).toEqual([first.id, second.id, repository.childrenOf(first.id)[0].id].sort());
  });

  it("级联删除会移除整棵子树", () => {
    const repository = createRepository();
    const root = repository.createRoot({ question: "根", answer: "a" });
    const child = repository.addChild(root.id, { question: "子", answer: "b" });

    const removed = repository.remove(root.id);

    expect(removed).toHaveLength(2);
    expect(repository.get(root.id)).toBeUndefined();
    expect(repository.get(child.id)).toBeUndefined();
    expect(repository.size).toBe(0);
  });

  it("非级联删除会把子卡片提升到父级", () => {
    const repository = createRepository();
    const root = repository.createRoot({ question: "根", answer: "a" });
    const middle = repository.addChild(root.id, { question: "中", answer: "b" });
    const leaf = repository.addChild(middle.id, { question: "末", answer: "c" });

    repository.remove(middle.id, { cascade: false });

    const promoted = repository.get(leaf.id);
    expect(promoted?.parentId).toBe(root.id);
    expect(promoted?.depth).toBe(1);
  });

  it("update 修改内容并刷新 updatedAt", () => {
    const repository = createRepository();
    const card = repository.createRoot({ question: "原问题", answer: "原答案" });

    const updated = repository.update(card.id, { answer: "新答案", status: "confirmed" });

    expect(updated.answer).toBe("新答案");
    expect(updated.status).toBe("confirmed");
    expect(updated.updatedAt >= card.updatedAt).toBe(true);
  });

  it("toCollection / fromCollection 可以往返", () => {
    const repository = createRepository();
    const root = repository.createRoot({
      question: "根",
      answer: "a",
      quotes: ["原文一句"],
      tags: ["热力学"],
    });
    repository.addChild(root.id, { question: "子", answer: "b" });

    const reloaded = CardRepository.fromCollection(repository.toCollection());

    expect(reloaded.size).toBe(2);
    expect(reloaded.get(root.id)?.tags).toEqual(["热力学"]);
    expect(reloaded.roots()).toHaveLength(1);
  });

  it("从磁盘读取时丢弃结构不合法的条目", () => {
    const repository = CardRepository.fromCollection({
      schemaVersion: 1,
      cards: [
        { id: "ok", question: "有效", answer: "解释" },
        { question: "缺少 id", answer: "坏数据" },
        null,
        "字符串不是卡片",
      ],
    });

    expect(repository.size).toBe(1);
    expect(repository.get("ok")?.rootId).toBe("ok");
  });

  it("变更会通知订阅者，退订后不再通知", () => {
    const repository = createRepository();
    let calls = 0;
    const unsubscribe = repository.subscribe(() => {
      calls += 1;
    });

    repository.createRoot({ question: "q", answer: "a" });
    expect(calls).toBe(1);

    unsubscribe();
    repository.createRoot({ question: "q2", answer: "a2" });
    expect(calls).toBe(1);
  });

  it("adopt 不触发变更通知（用于从磁盘恢复）", () => {
    const repository = createRepository();
    let calls = 0;
    repository.subscribe(() => {
      calls += 1;
    });
    const card: KnowledgeCard = {
      id: "restored",
      parentId: null,
      rootId: "restored",
      depth: 0,
      branchLabel: "起始卡",
      question: "恢复的卡",
      answer: "内容",
      anchor: null,
      quotes: [],
      tags: [],
      status: "draft",
      origin: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    repository.adopt(card);

    expect(repository.size).toBe(1);
    expect(calls).toBe(0);
  });
});
