import type { ProviderDescriptor, ProviderId } from "./types";

/**
 * 内置提供商预设。DeepSeek 为默认，其余按 OpenAI 兼容协议处理，
 * 因此任何兼容 /v1/chat/completions 的服务都可以直接填自己的地址。
 */
export const PROVIDER_DESCRIPTORS: Record<ProviderId, ProviderDescriptor> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    note: "默认提供商，价格低、中文教材理解好。",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyUrl: "https://platform.openai.com/api-keys",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI 兼容 API",
    defaultBaseUrl: "",
    defaultModel: "",
    note: "自建 / 第三方服务（如硅基流动、Ollama、vLLM），需自行填写地址与模型名。",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["deepseek", "openai", "openai-compatible"];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_ORDER as string[]).includes(value);
}

export function getProviderDescriptor(id: ProviderId): ProviderDescriptor {
  return PROVIDER_DESCRIPTORS[id] ?? PROVIDER_DESCRIPTORS.deepseek;
}
