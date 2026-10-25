/**
 * 极简 JSON 存储：把"怎么存"与"存在哪"彻底分开。
 *
 * - 核心层只认识 TextStorage 接口（读一整段文本 / 写一整段文本）
 * - Obsidian 端用 vault.adapter 实现，未来 App 用文件系统或 SQLite 实现
 * - 数据一律以可迁移的 JSON 落盘，方便备份与跨端导入
 */

export interface TextStorage {
  /** 读不到（文件不存在）时应返回 null，而不是抛错 */
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
}

export type JsonStoreErrorKind = "parse" | "io";

export class JsonStoreError extends Error {
  readonly kind: JsonStoreErrorKind;
  readonly path: string;
  readonly reason?: unknown;

  constructor(kind: JsonStoreErrorKind, path: string, message: string, reason?: unknown) {
    super(message);
    this.name = "JsonStoreError";
    this.kind = kind;
    this.path = path;
    this.reason = reason;
  }
}

export interface JsonStoreOptions<T> {
  storage: TextStorage;
  path: string;
  /** 文件不存在时的初值（每次返回新对象，避免共享可变状态） */
  defaults: () => T;
  /** 解析后的校验/迁移钩子，抛错即视为数据损坏 */
  revive?: (raw: unknown) => T;
}

export class JsonStore<T> {
  private readonly storage: TextStorage;
  private readonly path: string;
  private readonly defaults: () => T;
  private readonly revive?: (raw: unknown) => T;

  constructor(options: JsonStoreOptions<T>) {
    this.storage = options.storage;
    this.path = options.path;
    this.defaults = options.defaults;
    this.revive = options.revive;
  }

  getPath(): string {
    return this.path;
  }

  async load(): Promise<T> {
    let text: string | null;
    try {
      text = await this.storage.read(this.path);
    } catch (error) {
      throw new JsonStoreError("io", this.path, `读取 ${this.path} 失败`, error);
    }
    if (text === null || text.trim() === "") {
      return this.defaults();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new JsonStoreError("parse", this.path, `${this.path} 不是合法 JSON`, error);
    }
    if (!this.revive) {
      return parsed as T;
    }
    try {
      return this.revive(parsed);
    } catch (error) {
      throw new JsonStoreError("parse", this.path, `${this.path} 结构不符合预期`, error);
    }
  }

  async save(value: T): Promise<void> {
    const serialized = JSON.stringify(value, null, 2);
    try {
      await this.storage.write(this.path, serialized);
    } catch (error) {
      throw new JsonStoreError("io", this.path, `写入 ${this.path} 失败`, error);
    }
  }
}
