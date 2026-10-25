import { beforeEach, describe, expect, it } from "vitest";
import type { App, PluginManifest } from "obsidian";
import { __records } from "./stubs/obsidian";
import NexNotePlugin from "../src/main";

/**
 * 冒烟测试：用 test/stubs/obsidian.ts 替换真实模块，
 * 验证插件 onload() 真的能把视图、命令、设置页注册起来，
 * 而不是"能编译但一加载就崩"。
 */

interface FakeAdapter {
  exists: (path: string) => Promise<boolean>;
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
}

interface FakeAppOptions {
  /** 模拟移动端：没有右侧栏 */
  noRightLeaf?: boolean;
}

function createAdapter(): FakeAdapter {
  return {
    exists: async () => false,
    read: async () => "",
    write: async () => {},
    mkdir: async () => {},
  };
}

function createApp(adapter: FakeAdapter, options: FakeAppOptions = {}) {
  const leaf = {
    setViewState: async (state: { type: string }) => {
      __records.viewStates.push(state);
    },
  };
  return {
    vault: { adapter },
    workspace: {
      getLeavesOfType: (): unknown[] => [],
      getRightLeaf: () => (options.noRightLeaf ? null : leaf),
      getLeaf: () => leaf,
      revealLeaf: async (): Promise<void> => {},
      getActiveFile: () => null,
      detachLeavesOfType: (): void => {},
    },
  };
}

function createPlugin(options: FakeAppOptions = {}): NexNotePlugin {
  return new NexNotePlugin(createApp(createAdapter(), options) as unknown as App, {
    id: "nexnote",
    version: "0.1.0",
  } as unknown as PluginManifest);
}

beforeEach(() => {
  __records.views.length = 0;
  __records.commands.length = 0;
  __records.ribbonIcons.length = 0;
  __records.viewStates.length = 0;
  __records.notices.length = 0;
  __records.settingsTabs = 0;
});

describe("插件装载", () => {
  it("onload 后视图、丝带图标、命令、设置页都已注册", async () => {
    const plugin = createPlugin();

    await plugin.onload();

    expect(__records.views).toContain("nexnote-assistant");
    expect(__records.ribbonIcons).toContain("sparkles");
    expect(__records.settingsTabs).toBe(1);

    const commandIds = __records.commands.map((command) => command.id);
    expect(commandIds).toEqual(
      expect.arrayContaining([
        "open-assistant",
        "browse-cards",
        "analyze-selection",
        "create-blank-card",
        "reset-chat",
      ]),
    );
  });

  it("设置能被读入，服务层就绪且卡片库为空", async () => {
    const plugin = createPlugin();

    await plugin.onload();

    expect(plugin.settings.activeProvider).toBe("deepseek");
    expect(plugin.settings.storage.cardFilePath).toBe("NexNote/cards.json");
    expect(plugin.service).toBeDefined();
    expect(plugin.service.getCards().size).toBe(0);
    expect(plugin.service.lastLoadError).toBeNull();
  });

  it("activateAssistant 会把侧边栏视图挂到右侧栏", async () => {
    const plugin = createPlugin();
    await plugin.onload();

    await plugin.activateAssistant();

    expect(__records.viewStates).toHaveLength(1);
    expect(__records.viewStates[0].type).toBe("nexnote-assistant");
  });

  it("移动端没有右侧栏时降级到主区域标签页，而不是报错", async () => {
    const plugin = createPlugin({ noRightLeaf: true });
    await plugin.onload();

    await plugin.activateAssistant();

    expect(__records.viewStates).toHaveLength(1);
    expect(__records.viewStates[0].type).toBe("nexnote-assistant");
    expect(__records.notices).toHaveLength(0);
  });

  it("新建空白卡片并保存时写入可迁移的 JSON", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const adapter = createAdapter();
    adapter.write = async (path: string, content: string) => {
      writes.push({ path, content });
    };

    const plugin = new NexNotePlugin(createApp(adapter) as unknown as App, {
      id: "nexnote",
      version: "0.1.0",
    } as unknown as PluginManifest);
    await plugin.onload();

    const card = plugin.service.createCard({ question: "测试卡片", answer: "内容" });
    await plugin.service.save();

    expect(card.question).toBe("测试卡片");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("NexNote/cards.json");
    expect(JSON.parse(writes[0].content).cards).toHaveLength(1);
  });
});
