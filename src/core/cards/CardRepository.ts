import { createId } from "./ids";
import {
  CARD_SCHEMA_VERSION,
  type CardAnchor,
  type CardCollection,
  type CardInput,
  type CardPatch,
  type CardStatus,
  type KnowledgeCard,
} from "./types";

export type CardChangeListener = () => void;

export interface CardRepositoryOptions {
  now?: () => Date;
  idFactory?: (prefix: string) => string;
}

const VALID_STATUS: CardStatus[] = ["draft", "confirmed", "archived"];

function toIso(date: Date): string {
  return date.toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function reviveAnchor(value: unknown): CardAnchor | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const documentPath = typeof raw.documentPath === "string" ? raw.documentPath : "";
  const quote = typeof raw.quote === "string" ? raw.quote : "";
  if (!documentPath && !quote) {
    return null;
  }
  const kind = raw.kind === "pdf" || raw.kind === "markdown" ? raw.kind : "manual";
  const anchor: CardAnchor = { kind, documentPath, quote };
  if (typeof raw.page === "number" && Number.isFinite(raw.page)) {
    anchor.page = raw.page;
  }
  return anchor;
}

/** 从磁盘读回来的单条卡片：字段缺失或类型不对就整条丢弃 */
export function reviveCard(value: unknown): KnowledgeCard | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) {
    return null;
  }
  const now = new Date().toISOString();
  const parentId = typeof raw.parentId === "string" ? raw.parentId : null;
  const depth = typeof raw.depth === "number" && raw.depth >= 0 ? Math.floor(raw.depth) : 0;
  const status = VALID_STATUS.includes(raw.status as CardStatus)
    ? (raw.status as CardStatus)
    : "draft";
  return {
    id,
    parentId,
    rootId: typeof raw.rootId === "string" && raw.rootId ? raw.rootId : id,
    depth,
    branchLabel: typeof raw.branchLabel === "string" ? raw.branchLabel : depth === 0 ? "起始卡" : "分支",
    question: typeof raw.question === "string" ? raw.question : "",
    answer: typeof raw.answer === "string" ? raw.answer : "",
    anchor: reviveAnchor(raw.anchor),
    quotes: asStringArray(raw.quotes),
    tags: asStringArray(raw.tags),
    status,
    origin:
      raw.origin && typeof raw.origin === "object"
        ? {
            provider: String((raw.origin as Record<string, unknown>).provider ?? ""),
            model: String((raw.origin as Record<string, unknown>).model ?? ""),
          }
        : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

/**
 * 卡片的唯一权威来源：内存中的树 + 变更事件。
 *
 * 存储、UI、AI 都通过它读写；它自己不碰磁盘、不碰 DOM，
 * 因此可以在 Node 里直接跑单元测试，也能被未来的 App 复用。
 */
export class CardRepository {
  private readonly cards = new Map<string, KnowledgeCard>();
  private readonly listeners = new Set<CardChangeListener>();
  private readonly now: () => Date;
  private readonly idFactory: (prefix: string) => string;

  constructor(options: CardRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? createId;
  }

  static fromCollection(
    collection: unknown,
    options: CardRepositoryOptions = {},
  ): CardRepository {
    const repository = new CardRepository(options);
    const rawCards =
      collection && typeof collection === "object"
        ? (collection as { cards?: unknown }).cards
        : undefined;
    if (Array.isArray(rawCards)) {
      for (const raw of rawCards) {
        const card = reviveCard(raw);
        if (card && !repository.cards.has(card.id)) {
          repository.cards.set(card.id, card);
        }
      }
    }
    return repository;
  }

  toCollection(): CardCollection {
    return {
      schemaVersion: CARD_SCHEMA_VERSION,
      updatedAt: toIso(this.now()),
      cards: this.all(),
    };
  }

  get size(): number {
    return this.cards.size;
  }

  get(id: string): KnowledgeCard | undefined {
    return this.cards.get(id);
  }

  all(): KnowledgeCard[] {
    return [...this.cards.values()];
  }

  roots(): KnowledgeCard[] {
    return this.all()
      .filter((card) => card.parentId === null || !this.cards.has(card.parentId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  childrenOf(parentId: string): KnowledgeCard[] {
    return this.all()
      .filter((card) => card.parentId === parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** 从根卡到这张卡的路径，用于面包屑与"父子卡片"导航 */
  path(id: string): KnowledgeCard[] {
    const chain: KnowledgeCard[] = [];
    let current = this.cards.get(id);
    const guard = new Set<string>();
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      chain.unshift(current);
      current = current.parentId ? this.cards.get(current.parentId) : undefined;
    }
    return chain;
  }

  /** 某张卡的全部子孙（不含自身），用于级联删除与树视图 */
  descendants(id: string): KnowledgeCard[] {
    const result: KnowledgeCard[] = [];
    const queue = [...this.childrenOf(id)];
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      result.push(next);
      queue.push(...this.childrenOf(next.id));
    }
    return result;
  }

  listByDocument(documentPath: string): KnowledgeCard[] {
    return this.all().filter((card) => card.anchor?.documentPath === documentPath);
  }

  /** 直接植入一张已存在的卡片（从磁盘恢复时用），不触发变更事件 */
  adopt(card: KnowledgeCard): void {
    this.cards.set(card.id, card);
  }

  createRoot(input: CardInput): KnowledgeCard {
    const timestamp = toIso(this.now());
    const card: KnowledgeCard = {
      id: this.idFactory("card"),
      parentId: null,
      rootId: "",
      depth: 0,
      branchLabel: input.branchLabel ?? "起始卡",
      question: input.question.trim(),
      answer: input.answer.trim(),
      anchor: input.anchor ?? null,
      quotes: input.quotes ?? [],
      tags: input.tags ?? [],
      status: input.status ?? "draft",
      origin: input.origin ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    card.rootId = card.id;
    this.cards.set(card.id, card);
    this.notify();
    return card;
  }

  addChild(parentId: string, input: CardInput): KnowledgeCard {
    const parent = this.cards.get(parentId);
    if (!parent) {
      throw new Error(`找不到父卡片：${parentId}`);
    }
    const timestamp = toIso(this.now());
    const siblings = this.childrenOf(parentId).length;
    const card: KnowledgeCard = {
      id: this.idFactory("card"),
      parentId: parent.id,
      rootId: parent.rootId,
      depth: parent.depth + 1,
      branchLabel: input.branchLabel ?? `分支 ${siblings + 1}`,
      question: input.question.trim(),
      answer: input.answer.trim(),
      anchor: input.anchor ?? parent.anchor,
      quotes: input.quotes ?? [],
      tags: input.tags ?? [],
      status: input.status ?? "draft",
      origin: input.origin ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.cards.set(card.id, card);
    this.notify();
    return card;
  }

  update(id: string, patch: CardPatch): KnowledgeCard {
    const card = this.cards.get(id);
    if (!card) {
      throw new Error(`找不到卡片：${id}`);
    }
    const next: KnowledgeCard = { ...card };
    if (patch.question !== undefined) {
      next.question = patch.question.trim();
    }
    if (patch.answer !== undefined) {
      next.answer = patch.answer.trim();
    }
    if (patch.anchor !== undefined) {
      next.anchor = patch.anchor;
    }
    if (patch.quotes !== undefined) {
      next.quotes = patch.quotes;
    }
    if (patch.tags !== undefined) {
      next.tags = patch.tags;
    }
    if (patch.status !== undefined && VALID_STATUS.includes(patch.status)) {
      next.status = patch.status;
    }
    if (patch.branchLabel !== undefined) {
      next.branchLabel = patch.branchLabel;
    }
    next.updatedAt = toIso(this.now());
    this.cards.set(id, next);
    this.notify();
    return next;
  }

  /**
   * 删除卡片。cascade = true 时连同全部子孙一起删除（默认），
   * 否则把子卡提升为父卡的子节点，避免出现孤儿。
   */
  remove(id: string, options: { cascade?: boolean } = {}): string[] {
    const card = this.cards.get(id);
    if (!card) {
      return [];
    }
    const cascade = options.cascade ?? true;
    const removed: string[] = [];
    if (cascade) {
      for (const child of this.descendants(id)) {
        this.cards.delete(child.id);
        removed.push(child.id);
      }
    } else {
      for (const child of this.childrenOf(id)) {
        this.cards.set(child.id, {
          ...child,
          parentId: card.parentId,
          depth: Math.max(0, child.depth - 1),
          rootId: card.rootId,
        });
      }
    }
    this.cards.delete(id);
    removed.push(id);
    this.notify();
    return removed;
  }

  subscribe(listener: CardChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[NexNote] 卡片变更监听器抛错：", error);
      }
    }
  }
}
