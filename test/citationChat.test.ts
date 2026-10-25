import { describe, expect, it } from "vitest";
import { composeQuestion, formatQuoteBlock, normalizeQuote } from "../src/core/citation/types";
import { ChatSession } from "../src/core/chat/ChatSession";

describe("引用系统", () => {
  it("normalizeQuote 折叠空白并去掉首尾空行", () => {
    expect(normalizeQuote("  \n  r =   2GM/c² \n\n")).toBe("r = 2GM/c²");
  });

  it("超长引用被截断并加省略号", () => {
    const long = "字".repeat(30);
    const result = normalizeQuote(long, 10);
    expect(result).toHaveLength(11);
    expect(result.endsWith("…")).toBe(true);
  });

  it("formatQuoteBlock 带出处", () => {
    const block = formatQuoteBlock({ text: "r = 2GM/c²", sourcePath: "教材.pdf", page: 12 });
    expect(block).toContain("「r = 2GM/c²」");
    expect(block).toContain("教材.pdf · 第 12 页");
  });

  it("composeQuestion 把引用拼在问题前面", () => {
    const composed = composeQuestion([{ text: "史瓦西半径" }], "它怎么推出来的？");
    expect(composed.startsWith("> 「史瓦西半径」")).toBe(true);
    expect(composed.endsWith("它怎么推出来的？")).toBe(true);
  });

  it("只有引用没有问题时补一句默认提问", () => {
    expect(composeQuestion([{ text: "某段原文" }], "  ")).toContain("请解释上面这段内容");
  });

  it("没有引用时原样返回问题", () => {
    expect(composeQuestion([], " 什么是熵? ")).toBe("什么是熵?");
  });

  it("空白引用被忽略", () => {
    expect(composeQuestion([{ text: "   " }], "问题")).toBe("问题");
  });
});

describe("ChatSession", () => {
  function createSession(): ChatSession {
    let tick = 0;
    return new ChatSession({
      systemPrompt: "你是助手",
      now: () => new Date(Date.UTC(2024, 0, 1, 0, 0, tick++ * 60)),
      idFactory: (prefix) => `${prefix}_${tick}`,
    });
  }

  it("toMessages 首条是 system，之后是历史", () => {
    const session = createSession();
    session.appendUser("问题一");
    session.appendAssistant("回答一");

    const messages = session.toMessages();

    expect(messages[0]).toEqual({ role: "system", content: "你是助手" });
    expect(messages[1]).toEqual({ role: "user", content: "问题一" });
    expect(messages[2]).toEqual({ role: "assistant", content: "回答一" });
  });

  it("错误提示不进上下文", () => {
    const session = createSession();
    session.appendUser("问题");
    session.appendFailure("网络不可达");

    const messages = session.toMessages();

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("问题");
  });

  it("带引用的用户回合在发送时会展开成引用块", () => {
    const session = createSession();
    session.appendUser("为什么是平方？", [{ text: "r = 2GM/c²" }]);

    const messages = session.toMessages();

    expect(messages[1].content).toContain("> 「r = 2GM/c²」");
    expect(messages[1].content).toContain("为什么是平方？");
  });

  it("历史过长时只保留最近若干轮", () => {
    const session = new ChatSession({
      systemPrompt: "sys",
      maxHistoryTurns: 2,
      now: () => new Date(0),
    });
    session.appendUser("一");
    session.appendAssistant("答一");
    session.appendUser("二");
    session.appendAssistant("答二");
    session.appendUser("三");

    const messages = session.toMessages();

    expect(messages.map((message) => message.content)).toEqual(["sys", "答二", "三"]);
  });

  it("clear 清空全部回合", () => {
    const session = createSession();
    session.appendUser("问题");
    session.clear();
    expect(session.isEmpty()).toBe(true);
    expect(session.toMessages()).toHaveLength(1);
  });
});
