import { requestUrl, type RequestUrlParam } from "obsidian";
import { AIError } from "../../core/ai/types";
import type { HttpClient, HttpRequest, HttpResponse } from "../../core/ai/http";

function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AIError("network", `请求超时（${Math.round(timeoutMs / 1000)} 秒）：${label}`),
      );
    }, timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 用官方 requestUrl 实现 HTTP 层。
 *
 * 为什么不用 fetch：Obsidian 桌面端与移动端的渲染进程都受 CORS 限制，
 * 而 requestUrl 由原生层发起请求，桌面端与移动端行为一致。
 * 代价是拿不到流式响应，因此第一阶段用一次性返回，流式留到后续版本。
 */
export class ObsidianHttpClient implements HttpClient {
  async request(request: HttpRequest): Promise<HttpResponse> {
    const params: RequestUrlParam = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      throw: false,
    };

    const response = await withTimeout(
      requestUrl(params),
      request.timeoutMs ?? 120_000,
      request.url,
    );

    return { status: response.status, text: response.text };
  }
}
