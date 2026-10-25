import { MarkdownRenderer, type App, type Component } from "obsidian";
import type { ChatTurn } from "../../core/chat/ChatSession";
import type { Quote } from "../../core/citation/types";
import { normalizeQuote } from "../../core/citation/types";
import { formatTime, readSelectionWithin } from "./dom";

export interface TranscriptOptions {
  app: App;
  component: Component;
  sourcePath: string;
  showTimestamps: boolean;
  /** 用户点了某段回答上的「引用」 */
  onQuote: (quote: Quote) => void;
}

/**
 * 聊天气泡列表。侧边栏与卡片内追问共用同一个渲染器，
 * 保证两处观感一致（需求：主页面右侧全局聊天框 + 卡片底部独立聊天框）。
 */
export class ChatTranscript {
  private readonly el: HTMLElement;
  private options: TranscriptOptions;
  private renderToken = 0;

  constructor(container: HTMLElement, options: TranscriptOptions) {
    this.el = container;
    this.options = options;
  }

  updateOptions(patch: Partial<TranscriptOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  scrollToBottom(): void {
    this.el.scrollTop = this.el.scrollHeight;
  }

  async render(turns: readonly ChatTurn[], emptyHint = ""): Promise<void> {
    const token = ++this.renderToken;
    this.el.empty();

    if (turns.length === 0 && emptyHint) {
      const empty = this.el.createDiv({ cls: "nexnote-empty" });
      empty.createDiv({ cls: "nexnote-empty-title", text: "NexNote" });
      empty.createDiv({ cls: "nexnote-empty-body", text: emptyHint });
      return;
    }

    for (const turn of turns) {
      if (token !== this.renderToken) {
        return;
      }
      const bubble = this.el.createDiv({
        cls: `nexnote-msg nexnote-msg--${turn.role}${turn.failed ? " nexnote-msg--failed" : ""}`,
      });

      if (turn.quotes && turn.quotes.length > 0) {
        const quoteWrap = bubble.createDiv({ cls: "nexnote-msg-quotes" });
        for (const quote of turn.quotes) {
          quoteWrap.createDiv({
            cls: "nexnote-quote",
            text: `「${normalizeQuote(quote.text, 140)}」`,
          });
        }
      }

      const body = bubble.createDiv({ cls: "nexnote-msg-body" });
      if (turn.role === "assistant" && !turn.failed) {
        await MarkdownRenderer.render(
          this.options.app,
          turn.content,
          body,
          this.options.sourcePath,
          this.options.component,
        );
      } else {
        body.setText(turn.content);
      }

      if (token !== this.renderToken) {
        return;
      }

      const showTools = turn.role === "assistant" && !turn.failed;
      const showTime = this.options.showTimestamps;
      if (showTools || showTime) {
        const meta = bubble.createDiv({ cls: "nexnote-msg-meta" });
        if (showTime) {
          meta.createSpan({ cls: "nexnote-msg-time", text: formatTime(turn.createdAt) });
        }
        if (showTools) {
          const quoteButton = meta.createEl("button", {
            cls: "nexnote-link-button",
            text: "引用",
            attr: { type: "button", "aria-label": "把选中的文字引用到提问框" },
          });
          quoteButton.addEventListener("click", () => {
            const selected = readSelectionWithin(bubble);
            const text = selected.trim() ? selected : turn.content;
            this.options.onQuote({
              text: normalizeQuote(text, 1200),
              cardId: undefined,
            });
          });
        }
      }
    }

    if (token === this.renderToken) {
      this.scrollToBottom();
    }
  }
}
