/**
 * 测试用的 obsidian 模块替身。
 *
 * 真实的 `obsidian` 包只有类型声明、没有运行时入口，因此不能直接 import。
 * 这里提供最小可用的类与函数，让 UI 相关模块能在 Node 里被装载；
 * 只用于 test/pluginLoad.test.ts，不参与打包。
 */

export const __records = {
  views: [] as string[],
  commands: [] as Array<{ id: string; name: string }>,
  ribbonIcons: [] as string[],
  settingsTabs: 0,
  viewStates: [] as Array<{ type: string }>,
  notices: [] as string[],
};

export class Component {
  load(): void {}
  onload(): void {}
  unload(): void {}
  onunload(): void {}
  addChild<T>(child: T): T {
    return child;
  }
}

export class Plugin extends Component {
  app: unknown;
  manifest: unknown;

  constructor(app: unknown, manifest: unknown) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<unknown> {
    return null;
  }

  async saveData(): Promise<void> {}

  addRibbonIcon(icon: string): unknown {
    __records.ribbonIcons.push(icon);
    return {};
  }

  addCommand(command: { id: string; name: string }): unknown {
    __records.commands.push({ id: command.id, name: command.name });
    return {};
  }

  registerView(type: string): void {
    __records.views.push(type);
  }

  addSettingTab(): void {
    __records.settingsTabs += 1;
  }

  registerEvent(): void {}
}

export class ItemView extends Component {
  app: unknown;
  leaf: unknown;
  contentEl: Record<string, unknown>;
  containerEl: Record<string, unknown>;

  constructor(leaf: unknown) {
    super();
    this.leaf = leaf;
    this.app = {};
    this.contentEl = {};
    this.containerEl = {};
  }

  getViewType(): string {
    return "";
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return "";
  }

  async onOpen(): Promise<void> {}

  async onClose(): Promise<void> {}
}

export class Modal {
  app: unknown;
  contentEl: Record<string, unknown> = {};
  modalEl: Record<string, unknown> = {};

  constructor(app: unknown) {
    this.app = app;
  }

  open(): void {}

  close(): void {}

  onOpen(): void {}

  onClose(): void {}
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: Record<string, unknown> = {};

  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
  }

  display(): void {}
}

export class Setting {
  constructor(_container: unknown) {}

  setName(): this {
    return this;
  }

  setDesc(): this {
    return this;
  }

  setHeading(): this {
    return this;
  }

  addText(): this {
    return this;
  }

  addDropdown(): this {
    return this;
  }

  addSlider(): this {
    return this;
  }

  addToggle(): this {
    return this;
  }

  addButton(): this {
    return this;
  }
}

export class Notice {
  constructor(message: unknown, _duration?: number) {
    __records.notices.push(String(message));
  }

  hide(): void {}
}

export class MarkdownRenderer {
  static async render(): Promise<void> {}
}

export const Platform = { isMobile: false, isDesktop: true };

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function setIcon(): void {}

export async function requestUrl(): Promise<{ status: number; text: string }> {
  return { status: 200, text: "{}" };
}
