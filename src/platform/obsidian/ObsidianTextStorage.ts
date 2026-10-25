import { normalizePath, type App, type DataAdapter } from "obsidian";
import type { TextStorage } from "../../core/storage/JsonStore";

/** 逐级创建目录：官方 DataAdapter.mkdir 只接受单层路径 */
async function ensureFolderExists(adapter: DataAdapter, folder: string): Promise<void> {
  const segments = folder.split("/").filter((segment) => segment.length > 0);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (!(await adapter.exists(current))) {
      await adapter.mkdir(current);
    }
  }
}

/**
 * 用 Obsidian 的 vault.adapter 实现核心层的 TextStorage。
 *
 * 选 vault 内文件而不是插件 data.json 的原因：
 * - 数据跟着仓库走，桌面端与移动端天然同步；
 * - 就是一个普通 JSON 文件，用户可以直接备份、导出、迁移到未来的 App。
 */
export class ObsidianTextStorage implements TextStorage {
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  async read(path: string): Promise<string | null> {
    const adapter = this.app.vault.adapter;
    const target = normalizePath(path);
    if (!(await adapter.exists(target))) {
      return null;
    }
    return adapter.read(target);
  }

  async write(path: string, content: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    const target = normalizePath(path);
    const slash = target.lastIndexOf("/");
    if (slash > 0) {
      await ensureFolderExists(adapter, target.slice(0, slash));
    }
    await adapter.write(target, content);
  }
}
