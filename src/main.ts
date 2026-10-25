import { Notice, Plugin, type Editor } from "obsidian";
import { AssistantView, VIEW_TYPE_NEXNOTE_ASSISTANT } from "./platform/obsidian/AssistantView";
import { CardBrowserModal } from "./platform/obsidian/CardBrowserModal";
import { CardModal } from "./platform/obsidian/CardModal";
import { ObsidianHttpClient } from "./platform/obsidian/ObsidianHttpClient";
import { ObsidianTextStorage } from "./platform/obsidian/ObsidianTextStorage";
import { NexNoteService } from "./services/NexNoteService";
import { NexNoteSettingTab } from "./settings/SettingsTab";
import { mergeSettings, type NexNoteSettings } from "./settings/settings";
import type { Quote } from "./core/citation/types";

const MIN_SELECTION_LENGTH = 20;

export default class NexNotePlugin extends Plugin {
  settings!: NexNoteSettings;
  service!: NexNoteService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.service = new NexNoteService({
      getSettings: () => this.settings,
      storage: new ObsidianTextStorage(this.app),
      http: new ObsidianHttpClient(),
    });
    await this.service.load();

    if (this.service.lastLoadError) {
      new Notice(
        `NexNote：卡片库读取失败（${this.service.lastLoadError}），已从空库启动，原文件未被覆盖。`,
        10000,
      );
    }

    this.registerView(
      VIEW_TYPE_NEXNOTE_ASSISTANT,
      (leaf) => new AssistantView(leaf, this),
    );

    this.addRibbonIcon("sparkles", "NexNote：打开 AI 助手", () => {
      void this.activateAssistant();
    });

    this.addCommand({
      id: "open-assistant",
      name: "打开 AI 助手侧边栏",
      callback: () => {
        void this.activateAssistant();
      },
    });

    this.addCommand({
      id: "browse-cards",
      name: "浏览知识卡片",
      callback: () => {
        this.openCardBrowser();
      },
    });

    this.addCommand({
      id: "analyze-selection",
      name: "从选中文本生成知识卡片",
      editorCallback: (editor: Editor) => {
        void this.analyzeSelection(editor);
      },
    });

    this.addCommand({
      id: "create-blank-card",
      name: "新建空白知识卡片",
      callback: () => {
        this.createBlankCard();
      },
    });

    this.addCommand({
      id: "reset-chat",
      name: "清空 AI 对话",
      callback: () => {
        this.service.resetMainSession();
        new Notice("已清空主对话");
      },
    });

    this.addSettingTab(new NexNoteSettingTab(this.app, this));
    this.applyAppearance();
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_NEXNOTE_ASSISTANT);
  }

  // ------------------------------------------------------------- 视图

  async activateAssistant(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_NEXNOTE_ASSISTANT)[0];
    if (!leaf) {
      // 移动端没有右侧栏（getRightLeaf 返回 null），降级到主区域新建标签页
      const target = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      if (!target) {
        new Notice("NexNote：无法打开 AI 助手，请从命令面板重试。");
        return;
      }
      leaf = target;
      await leaf.setViewState({ type: VIEW_TYPE_NEXNOTE_ASSISTANT, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  /** 从卡片弹窗把引用送到侧边栏提问框 */
  revealAssistant(quote: Quote): void {
    void this.activateAssistant().then(() => {
      const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_NEXNOTE_ASSISTANT)[0];
      const view = leaf?.view;
      if (view instanceof AssistantView) {
        view.applyAppearance();
        view.insertQuote(quote);
      }
    });
  }

  getActiveNotePath(): string {
    return this.app.workspace.getActiveFile()?.path ?? "";
  }

  // ------------------------------------------------------------- 命令实现

  openCardBrowser(): void {
    if (this.service.getCards().size === 0) {
      new Notice(
        "NexNote：还没有知识卡片。选中一段教材文字，运行命令「NexNote: 从选中文本生成知识卡片」。",
        8000,
      );
      return;
    }
    new CardBrowserModal(this.app, this).open();
  }

  async analyzeSelection(editor: Editor): Promise<void> {
    const text = editor.getSelection().trim();
    if (text.length < MIN_SELECTION_LENGTH) {
      new Notice(`NexNote：请先选中至少 ${MIN_SELECTION_LENGTH} 个字符的内容。`);
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("NexNote：请先打开一个笔记或文档。");
      return;
    }

    const progress = new Notice("NexNote：正在筛选值得解释的知识点…", 0);
    try {
      const outcome = await this.service.extractCards({
        text,
        documentPath: file.path,
        context: file.basename,
      });
      progress.hide();
      if (!outcome.ok) {
        new Notice(`NexNote：分析失败 —— ${outcome.error}`, 10000);
        return;
      }
      if (outcome.cards.length === 0) {
        new Notice("NexNote：这段内容没有必要额外解释，未生成卡片。", 6000);
        return;
      }
      new Notice(`NexNote：已生成 ${outcome.cards.length} 张候选卡片（草稿）`);
      new CardModal(this.app, this, outcome.cards[0].id).open();
    } catch (error) {
      progress.hide();
      new Notice(`NexNote：发生未预期错误 —— ${String(error)}`, 10000);
    }
  }

  createBlankCard(): void {
    const card = this.service.createCard({
      question: "新知识卡片",
      answer: "",
      status: "draft",
    });
    new CardModal(this.app, this, card.id).open();
  }

  // ------------------------------------------------------------- 设置

  async loadSettings(): Promise<void> {
    const data: unknown = await this.loadData();
    this.settings = mergeSettings(data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyAppearance();
    this.service.notifyChanged();
  }

  applyAppearance(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_NEXNOTE_ASSISTANT)) {
      const view = leaf.view;
      if (view instanceof AssistantView) {
        view.applyAppearance();
      }
    }
  }

  /** 打开设置页；拿不到内部接口时退化为文字提示 */
  openSettingsPanel(): void {
    const internal = this.app as unknown as {
      setting?: { open?: () => void; openTabById?: (id: string) => void };
    };
    try {
      if (internal.setting?.openTabById) {
        internal.setting.openTabById(this.manifest.id);
        return;
      }
      if (internal.setting?.open) {
        internal.setting.open();
        return;
      }
    } catch (error) {
      console.warn("[NexNote] 无法打开设置页：", error);
    }
    new Notice("请打开「设置 → 第三方插件 → NexNote」进行配置。");
  }
}
