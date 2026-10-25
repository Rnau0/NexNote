import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import type NexNotePlugin from "../../main";
import { PROVIDER_DESCRIPTORS } from "../../core/ai/providers";
import type { Quote } from "../../core/citation/types";
import { getActiveProviderSettings } from "../../settings/settings";
import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";

export const VIEW_TYPE_NEXNOTE_ASSISTANT = "nexnote-assistant";

/**
 * 右侧栏的全局 AI 助手。
 *
 * 这是第一阶段的主要可见成果：可以正常打开的侧边栏、多轮对话、
 * 引用原文后追问、以及跟随设置改变字体/字号。
 */
export class AssistantView extends ItemView {
  private readonly plugin: NexNotePlugin;
  private transcript: ChatTranscript | null = null;
  private composer: ChatComposer | null = null;
  private modelBadge: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private rendering = false;
  private pendingRefresh = false;

  constructor(leaf: WorkspaceLeaf, plugin: NexNotePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_NEXNOTE_ASSISTANT;
  }

  getDisplayText(): string {
    return "NexNote AI 助手";
  }

  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("nexnote-sidebar");

    const header = root.createDiv({ cls: "nexnote-header" });
    const title = header.createDiv({ cls: "nexnote-title" });
    const iconEl = title.createSpan({ cls: "nexnote-title-icon" });
    setIcon(iconEl, "sparkles");
    title.createSpan({ cls: "nexnote-title-text", text: "NexNote" });
    this.modelBadge = header.createDiv({ cls: "nexnote-badge" });

    const actions = header.createDiv({ cls: "nexnote-actions" });
    this.iconButton(actions, "square-pen", "开始新对话", () => {
      this.plugin.service.resetMainSession();
      void this.refresh();
    });
    this.iconButton(actions, "layers", "查看知识卡片", () => {
      this.plugin.openCardBrowser();
    });
    this.iconButton(actions, "settings", "打开 NexNote 设置", () => {
      this.plugin.openSettingsPanel();
    });

    const body = root.createDiv({ cls: "nexnote-transcript" });
    this.transcript = new ChatTranscript(body, {
      app: this.app,
      component: this,
      sourcePath: "",
      showTimestamps: this.plugin.settings.appearance.showTimestamps,
      onQuote: (quote) => this.insertQuote(quote),
    });

    const composerHost = root.createDiv({ cls: "nexnote-composer-host" });
    this.composer = new ChatComposer(composerHost, {
      placeholder: "问点什么…（可先「引用」原文）",
      onSubmit: async (text, quotes) => {
        await this.plugin.service.send(this.plugin.service.getMainSession(), text, quotes);
      },
    });

    this.applyAppearance();
    this.unsubscribe = this.plugin.service.subscribe(() => {
      void this.refresh();
    });
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** 供卡片弹窗等外部入口调用：把引用推进提问框 */
  insertQuote(quote: Quote): void {
    this.composer?.addQuote(quote);
  }

  /** 设置里的字体/字号变了以后重新应用 */
  applyAppearance(): void {
    const root = this.contentEl;
    const { fontFamily, fontSize, lineHeight } = this.plugin.settings.appearance;
    root.style.setProperty(
      "--nexnote-chat-font-family",
      fontFamily.trim() ? fontFamily : "var(--font-text)",
    );
    root.style.setProperty("--nexnote-chat-font-size", `${fontSize}px`);
    root.style.setProperty("--nexnote-chat-line-height", `${lineHeight}`);
    this.transcript?.updateOptions({
      showTimestamps: this.plugin.settings.appearance.showTimestamps,
      sourcePath: this.plugin.getActiveNotePath(),
    });
  }

  async refresh(): Promise<void> {
    if (!this.transcript || !this.composer) {
      return;
    }
    if (this.rendering) {
      // 正在渲染时又收到变更（例如助手回复紧跟在用户提问之后），记下来稍后补一次
      this.pendingRefresh = true;
      return;
    }
    this.rendering = true;
    try {
      const settings = this.plugin.settings;
      this.transcript.updateOptions({
        showTimestamps: settings.appearance.showTimestamps,
        sourcePath: this.plugin.getActiveNotePath(),
      });
      const session = this.plugin.service.getMainSession();
      await this.transcript.render(
        session.getTurns(),
        "在这里问教材里的任何问题。\n选中卡片或笔记里的文字，点「引用」就能带进提问框。",
      );
      const providerSettings = getActiveProviderSettings(settings);
      const label =
        PROVIDER_DESCRIPTORS[settings.activeProvider]?.label ?? settings.activeProvider;
      this.modelBadge?.setText(`${label} · ${providerSettings.model || "未设置模型"}`);
    } finally {
      this.rendering = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refresh();
      }
    }
  }

  private iconButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
  ): void {
    const button = parent.createEl("button", {
      cls: "nexnote-icon-button",
      attr: { type: "button", "aria-label": label, title: label },
    });
    setIcon(button, icon);
    button.addEventListener("click", () => {
      onClick();
      button.blur();
    });
  }
}
