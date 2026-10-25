import type { HttpClient, HttpResponse } from "./http";
import {
  AIError,
  type AIProvider,
  type ChatRequest,
  type ChatResult,
  type ChatUsage,
  type ProviderDescriptor,
} from "./types";

export interface OpenAICompatibleConfig {
  descriptor: ProviderDescriptor;
  /** 例如 https://api.deepseek.com/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/** 把用户填的 Base URL 规范化成 chat/completions 端点 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function snippet(text: string, max = 400): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function mapUsage(raw: unknown): ChatUsage | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const usage = raw as Record<string, unknown>;
  const pick = (key: string): number | undefined =>
    typeof usage[key] === "number" ? (usage[key] as number) : undefined;
  const mapped: ChatUsage = {
    promptTokens: pick("prompt_tokens"),
    completionTokens: pick("completion_tokens"),
    totalTokens: pick("total_tokens"),
  };
  return mapped.promptTokens === undefined &&
    mapped.completionTokens === undefined &&
    mapped.totalTokens === undefined
    ? undefined
    : mapped;
}

/**
 * OpenAI 兼容协议客户端（DeepSeek / OpenAI / 自建服务通用）。
 *
 * 只依赖注入进来的 HttpClient：Obsidian 端用 requestUrl 实现，
 * 未来 Android App 换成 OkHttp 即可复用同一份核心逻辑。
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly descriptor: ProviderDescriptor;

  private readonly http: HttpClient;
  private readonly config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig, http: HttpClient) {
    this.config = config;
    this.descriptor = config.descriptor;
    this.http = http;
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const endpoint = resolveChatCompletionsUrl(this.config.baseUrl);
    if (!endpoint) {
      throw new AIError("config", "尚未填写 API 地址（Base URL）。");
    }

    const apiKey = this.config.apiKey.trim();
    if (!apiKey) {
      throw new AIError("config", "尚未填写 API Key。");
    }

    const model = (request.model ?? this.config.model).trim();
    if (!model) {
      throw new AIError("config", "尚未填写模型名称，例如 deepseek-chat。");
    }

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: false,
    };

    const temperature = request.temperature ?? this.config.temperature;
    if (typeof temperature === "number" && Number.isFinite(temperature)) {
      payload.temperature = Math.min(2, Math.max(0, temperature));
    }

    const maxTokens = request.maxTokens ?? this.config.maxTokens;
    if (typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0) {
      payload.max_tokens = Math.floor(maxTokens);
    }

    let response: HttpResponse;
    try {
      response = await this.http.request({
        url: endpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        timeoutMs: request.timeoutMs ?? 120_000,
      });
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw new AIError("network", "请求 AI 服务失败，请检查网络与 API 地址。", {
        reason: error,
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AIError("auth", `API Key 无效或没有权限（HTTP ${response.status}）。`, {
        status: response.status,
        detail: snippet(response.text),
      });
    }
    if (response.status === 429) {
      throw new AIError("rate-limit", "请求被限流（HTTP 429）。", {
        status: response.status,
        detail: snippet(response.text),
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new AIError("http", `HTTP ${response.status}`, {
        status: response.status,
        detail: snippet(response.text),
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch (error) {
      throw new AIError("bad-response", "AI 服务返回的不是合法 JSON。", {
        status: response.status,
        detail: snippet(response.text),
        reason: error,
      });
    }

    const body = parsed as {
      model?: unknown;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: unknown;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new AIError("bad-response", "AI 服务返回了空内容。", {
        status: response.status,
        detail: snippet(response.text),
      });
    }

    return {
      content: content.trim(),
      model: typeof body.model === "string" ? body.model : model,
      usage: mapUsage(body.usage),
    };
  }
}

export function createOpenAICompatibleProvider(
  config: OpenAICompatibleConfig,
  http: HttpClient,
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(config, http);
}
