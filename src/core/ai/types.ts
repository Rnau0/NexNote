/**
 * AI 层的公共类型。此文件不得依赖 obsidian 模块。
 */

export type ProviderId = "deepseek" | "openai" | "openai-compatible";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** 覆盖提供商默认模型 */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: ChatUsage;
}

/** 一个模型提供商的静态描述信息，供设置界面与未来 App 的引导页使用 */
export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  apiKeyUrl?: string;
  note?: string;
}

export interface AIProvider {
  readonly descriptor: ProviderDescriptor;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export type AIErrorKind =
  | "config"
  | "auth"
  | "rate-limit"
  | "network"
  | "http"
  | "bad-response"
  | "unknown";

export interface AIErrorOptions {
  status?: number;
  /** 服务端返回的原始片段，用于排查，切勿包含 API Key */
  detail?: string;
  reason?: unknown;
}

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly status?: number;
  readonly detail?: string;
  readonly reason?: unknown;

  constructor(kind: AIErrorKind, message: string, options: AIErrorOptions = {}) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
    this.status = options.status;
    this.detail = options.detail;
    this.reason = options.reason;
  }
}

/** 把错误翻译成可以展示给学习者的一句话 */
export function describeAIError(error: unknown): string {
  if (error instanceof AIError) {
    switch (error.kind) {
      case "config":
        return error.message;
      case "auth":
        return `鉴权失败：${error.message} 请到「设置 → NexNote」检查 API Key。`;
      case "rate-limit":
        return "请求过于频繁或额度用尽，请稍后再试。";
      case "network":
        return "网络不可达：请检查网络连接与 API 地址是否正确。";
      case "http":
      case "bad-response":
        return `AI 服务返回异常：${error.message}`;
      default:
        return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
