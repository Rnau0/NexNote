import { createId } from "../cards/ids";
import { composeQuestion, type Quote } from "../citation/types";
import type { ChatMessage } from "../ai/types";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  /** 落库/展示用的正文（user 回合不含引用块，引用放在 quotes 里） */
  content: string;
  /** 仅 user 回合：这条消息引用了哪些原文 */
  quotes?: Quote[];
  createdAt: string;
  /** true 表示这是一条错误提示，不是模型回答 */
  failed?: boolean;
}

export interface ChatSessionOptions {
  /** 这个会话的系统提示词 */
  systemPrompt: string;
  /** 会话归属：主侧边栏为 "main"，卡片内追问为 "card:<id>" */
  scope?: string;
  /** 发送给模型时最多携带多少轮历史（越早的越省） */
  maxHistoryTurns?: number;
  now?: () => Date;
  idFactory?: (prefix: string) => string;
}

/**
 * 多轮对话状态。与 Obsidian 无关，可直接在测试中使用。
 *
 * 注意：这里刻意不做"流式"，因为 Obsidian 官方 requestUrl 不支持流；
 * 若将来加上流式，只需扩展 appendAssistant 的增量追加接口。
 */
export class ChatSession {
  readonly scope: string;
  readonly systemPrompt: string;

  private readonly turns: ChatTurn[] = [];
  private readonly maxHistoryTurns: number;
  private readonly now: () => Date;
  private readonly idFactory: (prefix: string) => string;

  constructor(options: ChatSessionOptions) {
    this.scope = options.scope ?? "main";
    this.systemPrompt = options.systemPrompt;
    this.maxHistoryTurns = Math.max(1, options.maxHistoryTurns ?? 12);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? createId;
  }

  get size(): number {
    return this.turns.length;
  }

  isEmpty(): boolean {
    return this.turns.length === 0;
  }

  getTurns(): readonly ChatTurn[] {
    return this.turns;
  }

  appendUser(text: string, quotes: Quote[] = []): ChatTurn {
    const turn: ChatTurn = {
      id: this.idFactory("turn"),
      role: "user",
      content: text.trim(),
      quotes: quotes.length > 0 ? quotes : undefined,
      createdAt: this.now().toISOString(),
    };
    this.turns.push(turn);
    return turn;
  }

  appendAssistant(text: string): ChatTurn {
    const turn: ChatTurn = {
      id: this.idFactory("turn"),
      role: "assistant",
      content: text.trim(),
      createdAt: this.now().toISOString(),
    };
    this.turns.push(turn);
    return turn;
  }

  appendFailure(message: string): ChatTurn {
    const turn: ChatTurn = {
      id: this.idFactory("turn"),
      role: "assistant",
      content: message,
      createdAt: this.now().toISOString(),
      failed: true,
    };
    this.turns.push(turn);
    return turn;
  }

  clear(): void {
    this.turns.length = 0;
  }

  /** 组装请求消息：系统提示 + 最近若干轮（错误提示不进入上下文） */
  toMessages(): ChatMessage[] {
    const history = this.turns.filter((turn) => !turn.failed).slice(-this.maxHistoryTurns);
    return [
      { role: "system", content: this.systemPrompt },
      ...history.map<ChatMessage>((turn) => ({
        role: turn.role,
        content:
          turn.role === "user" && turn.quotes && turn.quotes.length > 0
            ? composeQuestion(turn.quotes, turn.content)
            : turn.content,
      })),
    ];
  }
}
