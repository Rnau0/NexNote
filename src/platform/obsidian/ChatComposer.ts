import { Platform } from "obsidian";
import type { Quote } from "../../core/citation/types";
import { normalizeQuote } from "../../core/citation/types";
import { autoGrow } from "./dom";

export interface ComposerOptions {
  placeholder: string;
  onSubmit: (text: string, quotes: Quote[]) => void | Promise<void>;
}

/**
 * 输入框 + 引用条 + 发送按钮。
 *
 * 移动端行为差异：移动端把 Enter 当换行（避免误发），必须点「发送」；
 * 桌面端 Enter 直接发送、Shift+Enter 换行。
 */
export class ChatComposer {
  readonly el: HTMLElement;

  private readonly options: ComposerOptions;
  private readonly quotesEl: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private quotes: Quote[] = [];
  private busy = false;

  constructor(host: HTMLElement, options: ComposerOptions) {
    this.options = options;
    this.el = host.createDiv({ cls: "nexnote-composer" });
    this.quotesEl = this.el.createDiv({ cls: "nexnote-quotes" });

    const row = this.el.createDiv({ cls: "nexnote-composer-row" });
    this.textarea = row.createEl("textarea", {
      cls: "nexnote-composer-input",
      attr: {
        rows: "2",
        placeholder: options.placeholder,
        "aria-label": "输入问题",
      },
    });
    this.sendButton = row.createEl("button", {
      cls: "nexnote-send",
      text: "发送",
      attr: { type: "button" },
    });
    this.el.createDiv({
      cls: "nexnote-composer-hint",
      text: Platform.isMobile ? "点「发送」提交" : "Enter 发送 · Shift+Enter 换行",
    });

    this.textarea.addEventListener("input", () => {
      autoGrow(this.textarea);
      this.syncButton();
    });
    this.textarea.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }
      if (Platform.isMobile) {
        return;
      }
      event.preventDefault();
      void this.submit();
    });
    this.sendButton.addEventListener("click", () => {
      void this.submit();
    });

    this.renderQuotes();
    this.syncButton();
  }

  focus(): void {
    this.textarea.focus();
  }

  setBusy(busy: boolean, label = "思考中…"): void {
    this.busy = busy;
    this.sendButton.setText(busy ? label : "发送");
    this.textarea.disabled = busy;
    this.syncButton();
  }

  setPlaceholder(text: string): void {
    this.textarea.placeholder = text;
  }

  addQuote(quote: Quote): void {
    const normalized = normalizeQuote(quote.text, 1200);
    if (!normalized) {
      return;
    }
    this.quotes.push({ ...quote, text: normalized });
    this.renderQuotes();
    this.focus();
  }

  clear(): void {
    this.textarea.value = "";
    this.quotes = [];
    this.renderQuotes();
    autoGrow(this.textarea);
    this.syncButton();
  }

  private renderQuotes(): void {
    this.quotesEl.empty();
    if (this.quotes.length === 0) {
      this.quotesEl.addClass("is-hidden");
      return;
    }
    this.quotesEl.removeClass("is-hidden");
    this.quotes.forEach((quote, index) => {
      const chip = this.quotesEl.createDiv({ cls: "nexnote-quote-chip" });
      chip.createSpan({
        cls: "nexnote-quote-chip-text",
        text: `「${normalizeQuote(quote.text, 60)}」`,
      });
      const remove = chip.createEl("button", {
        cls: "nexnote-quote-chip-remove",
        text: "×",
        attr: { type: "button", "aria-label": "移除这条引用" },
      });
      remove.addEventListener("click", () => {
        this.quotes.splice(index, 1);
        this.renderQuotes();
        this.syncButton();
      });
    });
  }

  private syncButton(): void {
    const hasContent = this.textarea.value.trim().length > 0 || this.quotes.length > 0;
    this.sendButton.disabled = this.busy || !hasContent;
  }

  private async submit(): Promise<void> {
    if (this.busy) {
      return;
    }
    const text = this.textarea.value.trim();
    if (!text && this.quotes.length === 0) {
      return;
    }
    const quotes = [...this.quotes];
    this.clear();
    this.setBusy(true);
    try {
      await this.options.onSubmit(text, quotes);
    } finally {
      this.setBusy(false);
      this.focus();
    }
  }
}
