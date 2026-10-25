import { MarkdownRenderer, Modal, Notice, type App } from "obsidian";
import type NexNotePlugin from "../../main";
import type { KnowledgeCard } from "../../core/cards/types";
import { CARD_SCHEMA_VERSION } from "../../core/cards/types";
import type { Quote } from "../../core/citation/types";
import { normalizeQuote } from "../../core/citation/types";
import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";
import { readSelectionWithin } from "./dom";

/**
 * 知识卡片详情弹窗。
 *
 * 对应需求：
 * - 点开一条标注 → 看到解释卡片（第六项）
 * - 卡片文字可选中并引用到提问框（第七项）
 * - 卡片底部有独立聊天框（第八项）
 * - 追问可另存为子卡片，形成父子结构与分支探索（第九项）
 */
export class CardModal extends Modal {
  private readonly plugin: NexNotePlugin;
  private cardId: string;

  private titleRowEl: HTMLElement | null = null;
  private pathEl: HTMLElement | null = null;
  private questionEl: HTMLElement | null = null;
  private answerEl: HTMLElement | null = null;
  private quotesEl: HTMLElement | null = null;
  private childrenEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private transcript: ChatTranscript | null = null;
  private composer: ChatComposer | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, plugin: NexNotePlugin, cardId: string) {
    super(app);
    this.plugin = plugin;
    this.cardId = cardId;
  }

  onOpen(): void {
    this.modalEl.addClass("nexnote-card-modal");
    this.buildSkeleton();
    this.unsubscribe = this.plugin.service.subscribe(() => {
      void this.refresh();
    });
    void this.refresh();
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contentEl.empty();
  }

  private get card(): KnowledgeCard | undefined {
    return this.plugin.service.getCard(this.cardId);
  }

  private buildSkeleton(): void {
    const { contentEl } = this;
    contentEl.empty();

    const head = contentEl.createDiv({ cls: "nexnote-card-head" });
    this.pathEl = head.createDiv({ cls: "nexnote-card-path" });
    this.titleRowEl = head.createDiv({ cls: "nexnote-card-title-row" });

    this.questionEl = contentEl.createDiv({ cls: "nexnote-card-question" });
    this.answerEl = contentEl.createDiv({ cls: "nexnote-card-answer" });
    this.quotesEl = contentEl.createDiv({ cls: "nexnote-card-quotes" });
    this.childrenEl = contentEl.createDiv({ cls: "nexnote-card-children" });

    this.footerEl = contentEl.createDiv({ cls: "nexnote-card-toolbar" });

    const chat = contentEl.createDiv({ cls: "nexnote-card-chat" });
    chat.createDiv({ cls: "nexnote-card-chat-title", text: "追问这张卡片" });
    const transcriptHost = chat.createDiv({ cls: "nexnote-transcript nexnote-transcript--compact" });
    this.transcript = new ChatTranscript(transcriptHost, {
      app: this.app,
      component: this.plugin,
      sourcePath: "",
      showTimestamps: this.plugin.settings.appearance.showTimestamps,
      onQuote: (quote) => this.composer?.addQuote(quote),
    });
    const composerHost = chat.createDiv({ cls: "nexnote-composer-host" });
    this.composer = new ChatComposer(composerHost, {
      placeholder: "就这张卡片继续问…",
      onSubmit: async (text, quotes) => {
        const session = this.plugin.service.getCardSession(this.cardId);
        await this.plugin.service.send(session, text, quotes);
      },
    });
  }

  private async refresh(): Promise<void> {
    const card = this.card;
    if (!card) {
      this.close();
      return;
    }

    if (this.pathEl) {
      const chain = this.plugin.service.getCards().path(card.id);
      this.pathEl.setText(
        chain.length > 1
          ? chain
              .slice(0, -1)
              .map((node) => normalizeQuote(node.question, 24))
              .join(" › ")
          : "根卡片",
      );
    }

    this.titleRowEl?.empty();
    if (this.titleRowEl) {
      this.titleRowEl.createSpan({ cls: "nexnote-card-branch", text: card.branchLabel });
      const status = this.titleRowEl.createSpan({
        cls: `nexnote-card-status nexnote-card-status--${card.status}`,
        text: card.status === "confirmed" ? "已确认" : card.status === "archived" ? "已归档" : "草稿",
      });
      status.setAttr("title", `卡片数据结构版本 v${CARD_SCHEMA_VERSION}`);
    }

    if (this.questionEl) {
      this.questionEl.setText(card.question || "（这张卡片还没有问题）");
    }

    if (this.answerEl) {
      this.answerEl.empty();
      if (card.answer.trim()) {
        await MarkdownRenderer.render(
          this.app,
          card.answer,
          this.answerEl,
          card.anchor?.documentPath ?? "",
          this.plugin,
        );
      } else {
        this.answerEl.setText("（还没有解释内容）");
      }
    }

    if (this.quotesEl) {
      this.quotesEl.empty();
      if (card.quotes.length > 0) {
        this.quotesEl.createDiv({ cls: "nexnote-card-section-title", text: "教材原句" });
        for (const quote of card.quotes) {
          this.quotesEl.createDiv({ cls: "nexnote-card-quote", text: `「${quote}」` });
        }
      }
    }

    this.renderChildren(card);
    this.renderToolbar(card);

    if (this.transcript && this.composer) {
      this.transcript.updateOptions({
        showTimestamps: this.plugin.settings.appearance.showTimestamps,
        sourcePath: card.anchor?.documentPath ?? "",
      });
      await this.transcript.render(
        this.plugin.service.getCardSession(card.id).getTurns(),
        "对这张卡片有疑问？直接在下面追问，答案可以另存为子卡片。",
      );
    }
  }

  private renderChildren(card: KnowledgeCard): void {
    if (!this.childrenEl) {
      return;
    }
    this.childrenEl.empty();
    const children = this.plugin.service.getCards().childrenOf(card.id);
    if (children.length === 0) {
      return;
    }
    this.childrenEl.createDiv({ cls: "nexnote-card-section-title", text: "子卡片（分支）" });
    const list = this.childrenEl.createDiv({ cls: "nexnote-card-child-list" });
    for (const child of children) {
      const item = list.createDiv({ cls: "nexnote-card-child" });
      item.createSpan({ cls: "nexnote-card-child-label", text: child.branchLabel });
      item.createSpan({ cls: "nexnote-card-child-text", text: child.question });
      item.addEventListener("click", () => this.openChild(child.id));
    }
  }

  private renderToolbar(card: KnowledgeCard): void {
    if (!this.footerEl) {
      return;
    }
    this.footerEl.empty();

    const quoteSelection = this.footerEl.createEl("button", {
      cls: "nexnote-button",
      text: "引用选中文字",
      attr: { type: "button" },
    });
    quoteSelection.addEventListener("click", () => {
      const selected = readSelectionWithin(this.contentEl);
      const text = selected.trim() || card.answer;
      this.composer?.addQuote({
        text: normalizeQuote(text, 1200),
        cardId: card.id,
        sourcePath: card.anchor?.documentPath,
        page: card.anchor?.page,
      });
      new Notice(
        selected.trim() ? "已把选中的文字放入追问框" : "没有选区，已引用整段解释",
      );
    });

    const toSidebar = this.footerEl.createEl("button", {
      cls: "nexnote-button",
      text: "引用到主聊天",
      attr: { type: "button" },
    });
    toSidebar.addEventListener("click", () => {
      const selected = readSelectionWithin(this.contentEl);
      const text = selected.trim() || card.answer;
      const quote: Quote = {
        text: normalizeQuote(text, 1200),
        cardId: card.id,
        sourcePath: card.anchor?.documentPath,
        page: card.anchor?.page,
      };
      this.plugin.revealAssistant(quote);
      this.close();
    });

    const branch = this.footerEl.createEl("button", {
      cls: "nexnote-button nexnote-button--accent",
      text: "存为子卡片",
      attr: { type: "button" },
    });
    branch.addEventListener("click", () => this.saveBranch(card));

    const remove = this.footerEl.createEl("button", {
      cls: "nexnote-button nexnote-button--danger",
      text: "删除卡片",
      attr: { type: "button" },
    });
    remove.addEventListener("click", () => {
      const removed = this.plugin.service.deleteCard(card.id, true);
      new Notice(`已删除 ${removed.length} 张卡片`);
      this.close();
    });

    const icon = this.footerEl.createSpan({ cls: "nexnote-card-origin" });
    icon.setText(
      card.origin ? `${card.origin.provider} · ${card.origin.model}` : "手工创建",
    );
  }

  private saveBranch(card: KnowledgeCard): void {
    const turns = this.plugin.service.getCardSession(card.id).getTurns();
    const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
    const lastAnswer = [...turns].reverse().find((turn) => turn.role === "assistant" && !turn.failed);
    if (!lastUser && !lastAnswer) {
      new Notice("先在卡片下面追问一次，再存为子卡片。");
      return;
    }
    const child = this.plugin.service.createBranch(card.id, {
      question: lastUser?.content ?? "（未填写问题）",
      answer: lastAnswer?.content ?? "",
      quotes: card.quotes,
      status: "draft",
    });
    new Notice("已存为子卡片");
    this.openChild(child.id);
  }

  private openChild(cardId: string): void {
    this.cardId = cardId;
    void this.refresh();
  }
}
