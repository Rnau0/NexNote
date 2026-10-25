import { describe, expect, it } from "vitest";
import { resolveChatCompletionsUrl, OpenAICompatibleProvider } from "../src/core/ai/openaiCompatible";
import { PROVIDER_DESCRIPTORS } from "../src/core/ai/providers";
import { AIError } from "../src/core/ai/types";
import type { HttpClient, HttpRequest, HttpResponse } from "../src/core/ai/http";
import { parseKnowledgeCandidates, extractJsonArray } from "../src/core/ai/prompts";

class FakeHttp implements HttpClient {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responder: (request: HttpRequest) => HttpResponse) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.responder(request);
  }
}

function buildProvider(responder: (request: HttpRequest) => HttpResponse, overrides = {}) {
  const http = new FakeHttp(responder);
  const provider = new OpenAICompatibleProvider(
    {
      descriptor: PROVIDER_DESCRIPTORS.deepseek,
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-test",
      model: "deepseek-chat",
      ...overrides,
    },
    http,
  );
  return { http, provider };
}

const okBody = JSON.stringify({
  model: "deepseek-chat",
  choices: [{ message: { content: "  熵是混乱度的度量。  " } }],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
});

describe("resolveChatCompletionsUrl", () => {
  it("补齐 /chat/completions", () => {
    expect(resolveChatCompletionsUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });

  it("去掉多余斜杠且不重复拼接", () => {
    expect(resolveChatCompletionsUrl("https://api.deepseek.com/v1///")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(
      resolveChatCompletionsUrl("https://api.deepseek.com/v1/chat/completions"),
    ).toBe("https://api.deepseek.com/v1/chat/completions");
  });

  it("空地址返回空串", () => {
    expect(resolveChatCompletionsUrl("   ")).toBe("");
  });
});

describe("OpenAICompatibleProvider", () => {
  it("正常返回时解析内容、模型与用量", async () => {
    const { http, provider } = buildProvider(() => ({ status: 200, text: okBody }));

    const result = await provider.chat({
      messages: [{ role: "user", content: "什么是熵" }],
    });

    expect(result.content).toBe("熵是混乱度的度量。");
    expect(result.model).toBe("deepseek-chat");
    expect(result.usage?.totalTokens).toBe(18);
    expect(http.requests[0].url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(http.requests[0].headers.Authorization).toBe("Bearer sk-test");
  });

  it("缺少 API Key 时在本地就报配置错误", async () => {
    const { http, provider } = buildProvider(() => ({ status: 200, text: okBody }), {
      apiKey: "",
    });

    await expect(
      provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ kind: "config" });
    expect(http.requests).toHaveLength(0);
  });

  it("401 归类为鉴权错误", async () => {
    const { provider } = buildProvider(() => ({ status: 401, text: "unauthorized" }));

    const error = await provider
      .chat({ messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe("auth");
  });

  it("429 归类为限流", async () => {
    const { provider } = buildProvider(() => ({ status: 429, text: "too many" }));
    const error = await provider
      .chat({ messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);
    expect((error as AIError).kind).toBe("rate-limit");
  });

  it("5xx 归类为 http 错误并保留响应片段", async () => {
    const { provider } = buildProvider(() => ({ status: 500, text: "internal boom" }));
    const error = await provider
      .chat({ messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);
    expect((error as AIError).kind).toBe("http");
    expect((error as AIError).detail).toContain("internal boom");
  });

  it("返回非 JSON 时归类为 bad-response", async () => {
    const { provider } = buildProvider(() => ({ status: 200, text: "<html>oops</html>" }));
    const error = await provider
      .chat({ messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);
    expect((error as AIError).kind).toBe("bad-response");
  });

  it("空内容也视为异常，避免把空卡写进库里", async () => {
    const { provider } = buildProvider(() => ({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: "   " } }] }),
    }));
    const error = await provider
      .chat({ messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);
    expect((error as AIError).kind).toBe("bad-response");
  });

  it("把温度与最大长度夹到合法区间后发出", async () => {
    const { http, provider } = buildProvider(() => ({ status: 200, text: okBody }));
    await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      temperature: 9,
      maxTokens: 256.7,
    });

    const body = JSON.parse(http.requests[0].body ?? "{}");
    expect(body.temperature).toBe(2);
    expect(body.max_tokens).toBe(256);
    expect(body.stream).toBe(false);
  });
});

describe("候选知识点解析", () => {
  it("能从带代码块的回复里解析出卡片", () => {
    const raw = [
      "好的，结果如下：",
      "```json",
      '[{"question":"为什么？","answer":"因为这样。","quote":"原文","importance":0.9,"tags":["甲"]}]',
      "```",
    ].join("\n");

    const candidates = parseKnowledgeCandidates(raw);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].importance).toBeCloseTo(0.9);
    expect(candidates[0].tags).toEqual(["甲"]);
  });

  it("丢弃缺字段的条目", () => {
    const raw = '[{"question":"只有问题"},{"answer":"只有答案"},{"question":"q","answer":"a"}]';
    const candidates = parseKnowledgeCandidates(raw);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].question).toBe("q");
  });

  it("importance 会被夹进 0~1", () => {
    const raw = '[{"question":"q","answer":"a","importance":5}]';
    expect(parseKnowledgeCandidates(raw)[0].importance).toBe(1);
  });

  it("限制返回条数", () => {
    const raw = JSON.stringify(
      Array.from({ length: 6 }, (_, index) => ({ question: `q${index}`, answer: `a${index}` })),
    );
    expect(parseKnowledgeCandidates(raw, 2)).toHaveLength(2);
  });

  it("完全不是 JSON 时返回空数组", () => {
    expect(extractJsonArray("模型今天不想说话")).toEqual([]);
  });
});
