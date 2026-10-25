/**
 * 引用系统：卡片里选中的文字要能"流"到提问框。
 * 这里只管数据结构与拼装，不碰 DOM。
 */

export interface Quote {
  /** 被选中的原文文本 */
  text: string;
  /** 出处：文档路径（vault 相对路径） */
  sourcePath?: string;
  /** 出处：页码 */
  page?: number;
  /** 出处：来自哪张卡片 */
  cardId?: string;
}

const DEFAULT_MAX_LENGTH = 1200;

/** 清洗选中文字：折叠多余空白、去掉首尾空行、限制长度 */
export function normalizeQuote(text: string, maxLength = DEFAULT_MAX_LENGTH): string {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength)}…`;
}

function describeSource(quote: Quote): string {
  const parts: string[] = [];
  if (quote.sourcePath) {
    parts.push(quote.sourcePath);
  }
  if (typeof quote.page === "number") {
    parts.push(`第 ${quote.page} 页`);
  }
  return parts.join(" · ");
}

/** 单条引用的提示词形态，例如：> 「r = 2GM/c²」（来源：教材.pdf · 第 12 页） */
export function formatQuoteBlock(quote: Quote): string {
  const text = normalizeQuote(quote.text);
  const source = describeSource(quote);
  return source ? `> 「${text}」（来源：${source}）` : `> 「${text}」`;
}

/** 把若干引用与用户问题拼成一条完整的提问内容 */
export function composeQuestion(quotes: Quote[], question: string): string {
  const body = question.trim();
  const blocks = quotes
    .filter((quote) => normalizeQuote(quote.text).length > 0)
    .map(formatQuoteBlock)
    .join("\n");
  if (!blocks) {
    return body;
  }
  if (!body) {
    return `${blocks}\n\n请解释上面这段内容。`;
  }
  return `${blocks}\n\n${body}`;
}
