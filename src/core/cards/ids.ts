/**
 * 与运行时无关的 id 生成器。
 * 优先用 crypto.randomUUID（Obsidian 桌面端与移动端均可用），
 * 并保留一个纯 JS 兜底实现，方便 Node 环境下的单元测试。
 */
export function createId(prefix: string): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const uuid = globalCrypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid.length >= 8) {
    return `${prefix}_${uuid.replace(/-/g, "").slice(0, 12)}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}
