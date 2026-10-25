/**
 * 知识卡片的数据模型。此文件不得依赖 obsidian 模块：
 * 未来迁移到独立 Android App 时，卡片结构可以原样复用。
 */

export const CARD_SCHEMA_VERSION = 1;

export type CardStatus = "draft" | "confirmed" | "archived";

export type AnchorKind = "pdf" | "markdown" | "manual";

/** PDF 坐标系下的矩形（左上角原点，单位与 PDF 点值一致） */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 卡片在原文中的落点。
 *
 * 第一阶段只填写 kind/documentPath/page/quote；rects 由后续的
 * PDF 精确定位模块（Codex 负责）补充，届时无需改动本结构。
 */
export interface CardAnchor {
  kind: AnchorKind;
  documentPath: string;
  page?: number;
  /** 触发这张卡的教材原句，逐字取自原文 */
  quote: string;
  rects?: AnchorRect[];
}

/** 这张卡由哪个模型生成；手工创建的卡为 null */
export interface CardOrigin {
  provider: string;
  model: string;
}

export interface KnowledgeCard {
  id: string;
  /** 父卡 id；根卡为 null */
  parentId: string | null;
  /** 整棵树的根卡 id（根卡自身等于自己的 id） */
  rootId: string;
  /** 0 表示根卡 */
  depth: number;
  /** 分支标签，用于在树里区分同一问题的不同探索方向 */
  branchLabel: string;
  question: string;
  answer: string;
  anchor: CardAnchor | null;
  quotes: string[];
  tags: string[];
  status: CardStatus;
  origin: CardOrigin | null;
  createdAt: string;
  updatedAt: string;
}

/** 落盘格式：整个知识库就是一个可迁移的 JSON 对象 */
export interface CardCollection {
  schemaVersion: number;
  updatedAt: string;
  cards: KnowledgeCard[];
}

export interface CardInput {
  question: string;
  answer: string;
  anchor?: CardAnchor | null;
  quotes?: string[];
  tags?: string[];
  status?: CardStatus;
  origin?: CardOrigin | null;
  branchLabel?: string;
}

/** update() 允许改动的字段，id/树结构字段不可直接改 */
export type CardPatch = Partial<
  Pick<
    KnowledgeCard,
    "question" | "answer" | "anchor" | "quotes" | "tags" | "status" | "branchLabel"
  >
>;

export function emptyCollection(now: string): CardCollection {
  return { schemaVersion: CARD_SCHEMA_VERSION, updatedAt: now, cards: [] };
}
