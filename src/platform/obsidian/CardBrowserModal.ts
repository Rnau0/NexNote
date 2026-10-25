import { Modal, Notice, type App } from "obsidian";
import type NexNotePlugin from "../../main";
import { CardModal } from "./CardModal";
import { normalizeQuote } from "../../core/citation/types";

/** 卡片库总览：列出所有根卡与其分支数量 */
export class CardBrowserModal extends Modal {
  private readonly plugin: NexNotePlugin;

  constructor(app: App, plugin: NexNotePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.modalEl.addClass("nexnote-browser-modal");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "知识卡片" });

    const repository = this.plugin.service.getCards();
    const roots = repository.roots();

    if (roots.length === 0) {
      contentEl.createEl("p", {
        cls: "nexnote-muted",
        text: "还没有卡片。选中一段教材文字，运行命令「NexNote: 从选中文本生成知识卡片」即可开始。",
      });
      return;
    }

    contentEl.createEl("p", {
      cls: "nexnote-muted",
      text: `共 ${repository.size} 张卡片，${roots.length} 棵卡树。`,
    });

    const list = contentEl.createDiv({ cls: "nexnote-browser-list" });
    for (const root of roots) {
      const descendantCount = repository.descendants(root.id).length;
      const item = list.createDiv({ cls: "nexnote-browser-item" });
      const main = item.createDiv({ cls: "nexnote-browser-main" });
      main.createDiv({
        cls: "nexnote-browser-question",
        text: normalizeQuote(root.question || "（无问题）", 80),
      });
      const metaParts = [root.status === "draft" ? "草稿" : "已确认"];
      if (root.anchor?.documentPath) {
        metaParts.push(
          root.anchor.page ? `${root.anchor.documentPath} 第 ${root.anchor.page} 页` : root.anchor.documentPath,
        );
      }
      if (descendantCount > 0) {
        metaParts.push(`${descendantCount} 张子卡片`);
      }
      main.createDiv({ cls: "nexnote-browser-meta", text: metaParts.join(" · ") });

      item.addEventListener("click", () => {
        const card = repository.get(root.id);
        if (!card) {
          new Notice("卡片已不存在");
          return;
        }
        this.close();
        new CardModal(this.app, this.plugin, root.id).open();
      });
    }
  }
}
