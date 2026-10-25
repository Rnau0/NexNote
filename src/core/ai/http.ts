/**
 * 与运行时无关的 HTTP 抽象。
 *
 * 为什么要这一层：Obsidian 桌面端与移动端都应使用官方 `requestUrl`
 * （绕过 CORS，且行为一致），而未来的独立 Android / 鸿蒙 App 会用
 * OkHttp 或 fetch。核心层只依赖本接口，因此可以整体迁移。
 */

export type HttpMethod = "GET" | "POST";

export interface HttpRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  /** 超时毫秒数，未实现超时的适配器可以忽略 */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse>;
}
