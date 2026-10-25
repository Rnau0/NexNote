import { CardRepository } from "../core/cards/CardRepository";
import type { KnowledgeCard } from "../core/cards/types";
import { JsonStore, JsonStoreError, type TextStorage } from "../core/storage/JsonStore";
import type { HttpClient } from "../core/ai/http";
import { createOpenAICompatibleProvider } from "../core/ai/openaiCompatible";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildCardContextPrompt,
  buildKnowledgeExtractionMessages,
  parseKnowledgeCandidates,
} from "../core/ai/prompts";
import { PROVIDER_DESCRIPTORS } from "../core/ai/providers";
import { ChatSession } from "../core/chat/ChatSession";
import { describeAIError, type AIProvider, type ChatUsage } from "../core/ai/types";
import { cardLimitForDensity, getActiveProviderSettings } from "../settings/settings";
import type { NexNoteSettings } from "../settings/settings";
import type { Quote } from "../core/citation/types";
import { emptyCollection, type CardCollection } from "../core/cards/types";

export interface NexNoteServiceOptions {
  getSettings: () => NexNoteSettings;
  storage: TextStorage;
  http: HttpClient;
  now?: () => Date;
}

export interface ChatOutcome {
  ok: boolean;
  error?: string;
  usage?: ChatUsage;
}

export interface ExtractionInput {
  text: string;
  documentPath: string;
  page?: number;
  context?: string;
}

export interface ExtractionOutcome {
  ok: boolean;
  cards: KnowledgeCard[];
  error?: string;
  raw?: string;
}

const PERSIST_DEBOUNCE_MS = 400;

/**
 * 业务编排层：把纯核心（卡片、聊天、提示词）与运行时适配（存储、HTTP）粘起来。
 *
 * 这一层依然不依赖 obsidian 模块 —— main.ts 负责把 Obsidian 的实现注入进来，
 * 因此同一个服务可以原样跑在未来的 Android App 里。
 */
export class NexNoteService {
  private readonly options: NexNoteServiceOptions;
  private readonly repository: CardRepository;
  private readonly mainSession: ChatSession;
  private readonly cardSessions = new Map<string, ChatSession>();
  private readonly listeners = new Set<() => void>();

  private store: JsonStore<CardCollection>;
  private storePath = "";
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrating = false;

  lastLoadError: string | null = null;

  constructor(options: NexNoteServiceOptions) {
    this.options = options;
    this.repository = new CardRepository({ now: options.now });
    this.mainSession = new ChatSession({
      scope: "main",
      systemPrompt: ASSISTANT_SYSTEM_PROMPT,
      now: options.now,
    });
    this.store = this.createStore(options.getSettings().storage.cardFilePath);
    this.repository.subscribe(() => {
      if (!this.hydrating) {
        this.schedulePersist();
      }
    });
  }

  // ---------------------------------------------------------------- 存储

  private createStore(path: string): JsonStore<CardCollection> {
    this.storePath = path;
    return new JsonStore<CardCollection>({
      storage: this.options.storage,
      path,
      defaults: () => {
        const now = (this.options.now?.() ?? new Date()).toISOString();
        return emptyCollection(now);
      },
      revive: (raw) => {
        const collection = CardRepository.fromCollection(raw, { now: this.options.now }).toCollection();
        return collection;
      },
    });
  }

  /** 设置里的存储路径变了就换一个 store */
  private ensureStore(): JsonStore<CardCollection> {
    const path = this.options.getSettings().storage.cardFilePath;
    if (path !== this.storePath) {
      this.store = this.createStore(path);
    }
    return this.store;
  }

  getStorePath(): string {
    return this.storePath;
  }

  async load(): Promise<void> {
    this.lastLoadError = null;
    const store = this.ensureStore();
    this.hydrating = true;
    try {
      const collection = await store.load();
      const loaded = CardRepository.fromCollection(collection, { now: this.options.now });
      for (const card of loaded.all()) {
        this.repository.adopt(card);
      }
    } catch (error) {
      this.lastLoadError =
        error instanceof JsonStoreError ? error.message : describeAIError(error);
      this.emit();
      return;
    } finally {
      this.hydrating = false;
    }
    this.emit();
  }

  async save(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.ensureStore().save(this.repository.toCollection());
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.save().catch((error) => {
        console.error("[NexNote] 保存卡片失败：", error);
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------- 卡片

  getCards(): CardRepository {
    return this.repository;
  }

  getCard(id: string): KnowledgeCard | undefined {
    return this.repository.get(id);
  }

  createCard(input: Parameters<CardRepository["createRoot"]>[0]): KnowledgeCard {
    const card = this.repository.createRoot(input);
    this.emit();
    return card;
  }

  createBranch(parentId: string, input: Parameters<CardRepository["addChild"]>[1]): KnowledgeCard {
    const card = this.repository.addChild(parentId, input);
    this.invalidateCardSession(card.id);
    this.emit();
    return card;
  }

  updateCard(id: string, patch: Parameters<CardRepository["update"]>[1]): KnowledgeCard {
    const card = this.repository.update(id, patch);
    this.invalidateCardSession(id);
    this.emit();
    return card;
  }

  deleteCard(id: string, cascade = true): string[] {
    const removed = this.repository.remove(id, { cascade });
    for (const cardId of removed) {
      this.cardSessions.delete(cardId);
    }
    this.emit();
    return removed;
  }

  // ---------------------------------------------------------------- 聊天

  getMainSession(): ChatSession {
    return this.mainSession;
  }

  getCardSession(cardId: string): ChatSession {
    const existing = this.cardSessions.get(cardId);
    if (existing) {
      return existing;
    }
    const card = this.repository.get(cardId);
    const session = new ChatSession({
      scope: `card:${cardId}`,
      systemPrompt: card
        ? buildCardContextPrompt({
            question: card.question,
            answer: card.answer,
            quotes: card.quotes,
          })
        : ASSISTANT_SYSTEM_PROMPT,
      now: this.options.now,
    });
    this.cardSessions.set(cardId, session);
    return session;
  }

  invalidateCardSession(cardId: string): void {
    this.cardSessions.delete(cardId);
  }

  resetMainSession(): void {
    this.mainSession.clear();
    this.emit();
  }

  createProvider(): AIProvider {
    const settings = this.options.getSettings();
    const providerSettings = getActiveProviderSettings(settings);
    const descriptor =
      PROVIDER_DESCRIPTORS[settings.activeProvider] ?? PROVIDER_DESCRIPTORS.deepseek;
    return createOpenAICompatibleProvider(
      {
        descriptor,
        baseUrl: providerSettings.baseUrl,
        apiKey: providerSettings.apiKey,
        model: providerSettings.model,
        temperature: providerSettings.temperature,
        maxTokens: providerSettings.maxTokens,
      },
      this.options.http,
    );
  }

  async send(session: ChatSession, text: string, quotes: Quote[] = []): Promise<ChatOutcome> {
    const trimmed = text.trim();
    if (!trimmed && quotes.length === 0) {
      return { ok: false, error: "请先输入问题。" };
    }
    session.appendUser(trimmed, quotes);
    this.emit();
    try {
      const provider = this.createProvider();
      const result = await provider.chat({ messages: session.toMessages() });
      session.appendAssistant(result.content);
      this.emit();
      return { ok: true, usage: result.usage };
    } catch (error) {
      const message = describeAIError(error);
      session.appendFailure(message);
      this.emit();
      return { ok: false, error: message };
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const provider = this.createProvider();
      const result = await provider.chat({
        messages: [
          {
            role: "user",
            content: "这是一次连通性测试。请只回复两个字：可用。",
          },
        ],
        maxTokens: 16,
        temperature: 0,
        timeoutMs: 30_000,
      });
      return { ok: true, message: `连接成功（${result.model}）：${result.content.slice(0, 40)}` };
    } catch (error) {
      return { ok: false, message: describeAIError(error) };
    }
  }

  // ---------------------------------------------------------------- 知识点抽取

  async extractCards(input: ExtractionInput): Promise<ExtractionOutcome> {
    const settings = this.options.getSettings();
    const limit = cardLimitForDensity(settings.annotation.density);
    const provider = this.createProvider();
    try {
      const result = await provider.chat({
        messages: buildKnowledgeExtractionMessages({
          text: input.text,
          context: input.context,
          limit,
        }),
        temperature: 0.2,
      });
      const candidates = parseKnowledgeCandidates(result.content, limit);
      const kind = input.documentPath.toLowerCase().endsWith(".pdf") ? "pdf" : "markdown";
      const created = candidates.map((candidate) =>
        this.repository.createRoot({
          question: candidate.question,
          answer: candidate.answer,
          anchor: {
            kind,
            documentPath: input.documentPath,
            page: input.page,
            quote: candidate.quote,
          },
          quotes: candidate.quote ? [candidate.quote] : [],
          tags: candidate.tags,
          status: "draft",
          origin: { provider: provider.descriptor.id, model: result.model },
        }),
      );
      await this.save();
      this.emit();
      return { ok: true, cards: created, raw: result.content };
    } catch (error) {
      return {
        ok: false,
        cards: [],
        error: describeAIError(error),
      };
    }
  }

  // ---------------------------------------------------------------- 变更通知

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 外部（例如设置页）改动后主动通知各视图刷新 */
  notifyChanged(): void {
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[NexNote] 监听器抛错：", error);
      }
    }
  }
}
