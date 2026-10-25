import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cardLimitForDensity, mergeSettings } from "../src/settings/settings";

describe("设置合并与迁移", () => {
  it("空数据返回默认设置", () => {
    expect(mergeSettings(null).activeProvider).toBe("deepseek");
    expect(mergeSettings(undefined).appearance.fontSize).toBe(DEFAULT_SETTINGS.appearance.fontSize);
  });

  it("保留用户已填的字段，缺失字段用默认值补齐", () => {
    const merged = mergeSettings({
      activeProvider: "openai",
      providers: { openai: { apiKey: "sk-abc", model: "gpt-4o-mini" } },
    });

    expect(merged.activeProvider).toBe("openai");
    expect(merged.providers.openai.apiKey).toBe("sk-abc");
    expect(merged.providers.openai.baseUrl).toBe(DEFAULT_SETTINGS.providers.openai.baseUrl);
    expect(merged.providers.deepseek.apiKey).toBe("");
    expect(merged.appearance.fontSize).toBe(DEFAULT_SETTINGS.appearance.fontSize);
  });

  it("未知提供商回落到 DeepSeek", () => {
    expect(mergeSettings({ activeProvider: "别家的模型" }).activeProvider).toBe("deepseek");
  });

  it("越界数值被夹到合法区间", () => {
    const merged = mergeSettings({
      appearance: { fontSize: 200, lineHeight: 0.1 },
      providers: { deepseek: { temperature: 9, maxTokens: 1 } },
    });

    expect(merged.appearance.fontSize).toBe(28);
    expect(merged.appearance.lineHeight).toBe(1.2);
    expect(merged.providers.deepseek.temperature).toBe(2);
    expect(merged.providers.deepseek.maxTokens).toBe(128);
  });

  it("标注密度决定单次最多生成几张卡片", () => {
    expect(cardLimitForDensity("minimal")).toBe(3);
    expect(cardLimitForDensity("balanced")).toBe(5);
    expect(cardLimitForDensity("dense")).toBe(8);
    expect(mergeSettings({ annotation: { density: "dense" } }).annotation.maxCardsPerPass).toBe(8);
  });

  it("非法的密度值回落到 minimal", () => {
    expect(mergeSettings({ annotation: { density: "疯狂" } }).annotation.density).toBe("minimal");
  });

  it("空存储路径回落到默认路径", () => {
    expect(mergeSettings({ storage: { cardFilePath: "   " } }).storage.cardFilePath).toBe(
      "NexNote/cards.json",
    );
  });
});
