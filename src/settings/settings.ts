import { PROVIDER_DESCRIPTORS, PROVIDER_ORDER, isProviderId } from "../core/ai/providers";
import type { ProviderId } from "../core/ai/types";

/**
 * 插件设置。所有字段都必须是可序列化的 JSON 值，
 * 未来 App 端可以读同一份导出文件。
 */

export const SETTINGS_SCHEMA_VERSION = 1;

export interface ProviderSettings {
  /** 例如 https://api.deepseek.com/v1 */
  baseUrl: string;
  /** 例如 deepseek-chat */
  model: string;
  /** 只存在本地 data.json，绝不进仓库 */
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatAppearanceSettings {
  /** CSS font-family 字符串；留空表示跟随 Obsidian 正文字体 */
  fontFamily: string;
  /** 聊天正文的字号（px） */
  fontSize: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 是否显示每条消息的时间 */
  showTimestamps: boolean;
}

export type AnnotationDensity = "minimal" | "balanced" | "dense";

export interface AnnotationSettings {
  /** 默认"少量精准"：minimal */
  density: AnnotationDensity;
  /** 每次分析最多生成几张候选卡片 */
  maxCardsPerPass: number;
}

export interface StorageSettings {
  /** 卡片库的 JSON 文件路径（vault 相对路径） */
  cardFilePath: string;
}

export interface NexNoteSettings {
  schemaVersion: number;
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  appearance: ChatAppearanceSettings;
  annotation: AnnotationSettings;
  storage: StorageSettings;
}

const DENSITY_CARD_LIMIT: Record<AnnotationDensity, number> = {
  minimal: 3,
  balanced: 5,
  dense: 8,
};

export function cardLimitForDensity(density: AnnotationDensity): number {
  return DENSITY_CARD_LIMIT[density] ?? 3;
}

function defaultProviderSettings(id: ProviderId): ProviderSettings {
  const descriptor = PROVIDER_DESCRIPTORS[id];
  return {
    baseUrl: descriptor.defaultBaseUrl,
    model: descriptor.defaultModel,
    apiKey: "",
    temperature: 0.3,
    maxTokens: 1200,
  };
}

export const DEFAULT_SETTINGS: NexNoteSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  activeProvider: "deepseek",
  providers: {
    deepseek: defaultProviderSettings("deepseek"),
    openai: defaultProviderSettings("openai"),
    "openai-compatible": defaultProviderSettings("openai-compatible"),
  },
  appearance: {
    fontFamily: "",
    fontSize: 15,
    lineHeight: 1.6,
    showTimestamps: false,
  },
  annotation: {
    density: "minimal",
    maxCardsPerPass: cardLimitForDensity("minimal"),
  },
  storage: {
    cardFilePath: "NexNote/cards.json",
  },
};

/** 深拷贝默认值，避免多次调用共享同一份可变对象 */
export function createDefaultSettings(): NexNoteSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as NexNoteSettings;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * 把磁盘上的（可能是旧版本、缺字段的）设置合并成完整设置。
 * 任何脏字段都退回默认值，保证升级不会让插件崩掉。
 */
export function mergeSettings(loaded: unknown): NexNoteSettings {
  const defaults = createDefaultSettings();
  if (!loaded || typeof loaded !== "object") {
    return defaults;
  }
  const raw = loaded as Record<string, unknown>;

  const activeProviderRaw = asString(raw.activeProvider, defaults.activeProvider);
  const activeProvider: ProviderId = isProviderId(activeProviderRaw)
    ? activeProviderRaw
    : defaults.activeProvider;

  const rawProviders =
    raw.providers && typeof raw.providers === "object"
      ? (raw.providers as Record<string, unknown>)
      : {};
  const providers = { ...defaults.providers };
  for (const id of PROVIDER_ORDER) {
    const entry = rawProviders[id];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    providers[id] = {
      baseUrl: asString(record.baseUrl, providers[id].baseUrl),
      model: asString(record.model, providers[id].model),
      apiKey: asString(record.apiKey, providers[id].apiKey),
      temperature: asNumber(record.temperature, providers[id].temperature, 0, 2),
      maxTokens: asNumber(record.maxTokens, providers[id].maxTokens, 128, 32000),
    };
  }

  const rawAppearance =
    raw.appearance && typeof raw.appearance === "object"
      ? (raw.appearance as Record<string, unknown>)
      : {};
  const rawAnnotation =
    raw.annotation && typeof raw.annotation === "object"
      ? (raw.annotation as Record<string, unknown>)
      : {};
  const rawStorage =
    raw.storage && typeof raw.storage === "object"
      ? (raw.storage as Record<string, unknown>)
      : {};

  const densityRaw = asString(rawAnnotation.density, defaults.annotation.density);
  const density: AnnotationDensity =
    densityRaw === "balanced" || densityRaw === "dense" ? densityRaw : "minimal";

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    activeProvider,
    providers,
    appearance: {
      fontFamily: asString(rawAppearance.fontFamily, defaults.appearance.fontFamily),
      fontSize: asNumber(rawAppearance.fontSize, defaults.appearance.fontSize, 11, 28),
      lineHeight: asNumber(rawAppearance.lineHeight, defaults.appearance.lineHeight, 1.2, 2.4),
      showTimestamps: asBoolean(
        rawAppearance.showTimestamps,
        defaults.appearance.showTimestamps,
      ),
    },
    annotation: {
      density,
      maxCardsPerPass: cardLimitForDensity(density),
    },
    storage: {
      cardFilePath:
        asString(rawStorage.cardFilePath, defaults.storage.cardFilePath).trim() ||
        defaults.storage.cardFilePath,
    },
  };
}

export function getActiveProviderSettings(settings: NexNoteSettings): ProviderSettings {
  return settings.providers[settings.activeProvider] ?? settings.providers.deepseek;
}
