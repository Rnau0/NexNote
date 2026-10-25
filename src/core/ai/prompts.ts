import type { ChatMessage } from "./types";

/**
 * 所有提示词集中在这里，便于随模型效果统一调整，
 * 也方便未来独立 App 复用同一套"教学人格"。
 */

export const ASSISTANT_SYSTEM_PROMPT = [
  "你是 NexNote 的学习助手，服务对象是正在读教材的学生。",
  "原则：",
  "1. 只讲必要的内容，先给结论，再给一两句理由；不要复述教材原文。",
  "2. 学生问的是概念就用类比＋一句话定义；问的是推导就写清每一步为什么成立。",
  "3. 不确定的地方直接说不确定，不要编造页码、公式或引用。",
  "4. 中文回答，数学公式用 $...$ 或 $$...$$ 的 LaTeX 写法。",
  "5. 默认不使用列表堆砌，除非学生明确要求步骤或对比。",
].join("\n");

export const CARD_CHAT_SYSTEM_PROMPT = [
  ASSISTANT_SYSTEM_PROMPT,
  "",
  "现在你正在回答一张「知识卡片」之下的追问。",
  "卡片的内容是教材里的一个知识点，学生会就它继续发问。",
  "回答要短（一般不超过 120 字），紧扣卡片上下文，不要重复卡片里已有的解释。",
].join("\n");

export interface KnowledgeCandidate {
  /** 这个知识点要解决的问题，写成一个学生能问出来的问句 */
  question: string;
  /** 解释：先结论、后理由，控制在 120 字以内 */
  answer: string;
  /** 教材原文中被解释的那一句，必须逐字来自原文 */
  quote: string;
  /** 0~1 的重要程度，用于默认"少量精准"的筛选 */
  importance: number;
  tags: string[];
}

export interface ExtractionInput {
  /** 教材原文（可以是一页、一段或一次框选） */
  text: string;
  /** 教材/章节标题等上下文，可为空 */
  context?: string;
  /** 期望最多给出几个候选知识点，默认 3 */
  limit?: number;
}

const EXTRACTION_INSTRUCTION = [
  "你在为一份教材做知识点标注。任务是从给定原文中挑出「真正值得解释」的内容。",
  "判断标准（按顺序）：",
  "1. 只有出现以下情况才值得标注：定义/定理的核心条件、容易误解的表述、跳步的推导、",
  "   与直觉相反的结论、本页反复出现的关键术语。",
  "2. 纯粹的名词罗列、背景介绍、例子复述、常识性说明，一律不要标注。",
  "3. 宁少勿多：没有值得解释的内容就返回空数组。",
  "4. quote 字段必须逐字取自原文（可截取短句），不得改写、不得拼接不相邻的句子。",
  "5. answer 先给结论再给理由，120 字以内，不使用项目符号。",
  "",
  "只输出一个 JSON 数组，不要输出任何其它文字、不要用代码块包裹。格式：",
  '[{"question":"...","answer":"...","quote":"...","importance":0.0,"tags":["..."]}]',
].join("\n");

export function buildKnowledgeExtractionMessages(input: ExtractionInput): ChatMessage[] {
  const limit = Math.max(1, Math.min(10, input.limit ?? 3));
  const sections: string[] = [EXTRACTION_INSTRUCTION, "", `最多输出 ${limit} 条。`];
  if (input.context && input.context.trim()) {
    sections.push("", `章节上下文：${input.context.trim()}`);
  }
  sections.push("", "教材原文：", "<<<", input.text.trim(), ">>>");
  return [
    { role: "system", content: sections.join("\n") },
    { role: "user", content: "请按要求输出 JSON 数组。" },
  ];
}

/** 从可能带代码块、前后说明文字的回复里抠出 JSON 数组 */
export function extractJsonArray(raw: string): unknown[] {
  const text = raw.trim();
  if (!text) {
    return [];
  }
  const fenced = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  const candidate = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  try {
    const parsed: unknown = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampImportance(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, num));
}

/**
 * 解析并清洗模型返回的候选知识点。
 * 任何缺字段/非字符串的条目直接丢弃——宁可少一张卡，也不留半张坏卡。
 */
export function parseKnowledgeCandidates(raw: string, limit = 3): KnowledgeCandidate[] {
  const items = extractJsonArray(raw);
  const result: KnowledgeCandidate[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const question = toText(record.question);
    const answer = toText(record.answer);
    const quote = toText(record.quote);
    if (!question || !answer) {
      continue;
    }
    const rawTags = Array.isArray(record.tags) ? record.tags : [];
    const tags = rawTags.map(toText).filter((tag) => tag.length > 0).slice(0, 6);
    result.push({
      question,
      answer,
      quote,
      importance: clampImportance(record.importance),
      tags,
    });
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

/** 卡片追问时的开场系统提示，带上卡片自身内容作为上下文 */
export function buildCardContextPrompt(card: {
  question: string;
  answer: string;
  quotes?: string[];
}): string {
  const parts = [
    CARD_CHAT_SYSTEM_PROMPT,
    "",
    `卡片问题：${card.question}`,
    `卡片解释：${card.answer}`,
  ];
  if (card.quotes && card.quotes.length > 0) {
    parts.push(`教材原句：${card.quotes.join(" / ")}`);
  }
  return parts.join("\n");
}
