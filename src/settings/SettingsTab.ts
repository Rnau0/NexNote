import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type NexNotePlugin from "../main";
import { PROVIDER_DESCRIPTORS, PROVIDER_ORDER, isProviderId } from "../core/ai/providers";
import { getActiveProviderSettings, type AnnotationDensity } from "./settings";

export class NexNoteSettingTab extends PluginSettingTab {
  private readonly plugin: NexNotePlugin;

  constructor(app: App, plugin: NexNotePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("nexnote-settings");

    containerEl.createEl("h2", { text: "NexNote 设置" });
    containerEl.createEl("p", {
      cls: "nexnote-muted",
      text: "第一阶段：AI 助手可用，PDF 自动标注与知识画布尚未接入。",
    });

    this.renderProviderSection(containerEl);
    this.renderAppearanceSection(containerEl);
    this.renderAnnotationSection(containerEl);
    this.renderStorageSection(containerEl);
    this.renderAboutSection(containerEl);
  }

  // ------------------------------------------------------------ 提供商

  private renderProviderSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "模型提供商" });

    new Setting(containerEl)
      .setName("当前提供商")
      .setDesc("DeepSeek 为默认；其余按 OpenAI 兼容协议调用。")
      .addDropdown((dropdown) => {
        for (const id of PROVIDER_ORDER) {
          dropdown.addOption(id, PROVIDER_DESCRIPTORS[id].label);
        }
        dropdown.setValue(this.plugin.settings.activeProvider);
        dropdown.onChange(async (value) => {
          if (!isProviderId(value)) {
            return;
          }
          this.plugin.settings.activeProvider = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const providerId = this.plugin.settings.activeProvider;
    const descriptor = PROVIDER_DESCRIPTORS[providerId];
    const provider = getActiveProviderSettings(this.plugin.settings);

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("只保存在本机插件数据里（data.json），不会上传或提交到仓库。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text.setPlaceholder(providerId === "deepseek" ? "sk-..." : "按服务商要求填写");
        text.setValue(provider.apiKey);
        text.onChange(async (value) => {
          provider.apiKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("API 地址（Base URL）")
      .setDesc("会自动补 /chat/completions，例如 https://api.deepseek.com/v1")
      .addText((text) => {
        text.setPlaceholder(descriptor.defaultBaseUrl || "https://your-endpoint/v1");
        text.setValue(provider.baseUrl);
        text.onChange(async (value) => {
          provider.baseUrl = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("例如 deepseek-chat、gpt-4o-mini，或自建服务的模型 id。")
      .addText((text) => {
        text.setPlaceholder(descriptor.defaultModel || "model-id");
        text.setValue(provider.model);
        text.onChange(async (value) => {
          provider.model = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("温度")
      .setDesc("越低越稳定。学习讲解建议 0.2 ~ 0.5。")
      .addSlider((slider) => {
        slider.setLimits(0, 2, 0.1);
        slider.setValue(provider.temperature);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          provider.temperature = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("最大输出长度")
      .setDesc("单位 token，回答被截断时调大。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "128";
        text.inputEl.max = "32000";
        text.setValue(String(provider.maxTokens));
        text.onChange(async (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            provider.maxTokens = Math.min(32000, Math.max(128, Math.floor(parsed)));
            await this.plugin.saveSettings();
          }
        });
      });

    let testing = false;
    new Setting(containerEl)
      .setName("测试连接")
      .setDesc("发一条极短请求，验证 Key、地址与模型名是否可用。")
      .addButton((button) => {
        button.setButtonText("测试");
        button.onClick(async () => {
          if (testing) {
            return;
          }
          testing = true;
          button.setDisabled(true);
          button.setButtonText("测试中…");
          const result = await this.plugin.service.testConnection();
          new Notice(result.message, result.ok ? 4000 : 10000);
          button.setDisabled(false);
          button.setButtonText("测试");
          testing = false;
        });
      });

    if (descriptor.note) {
      containerEl.createEl("p", { cls: "nexnote-muted", text: descriptor.note });
    }
  }

  // ------------------------------------------------------------ 外观

  private renderAppearanceSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "聊天外观" });

    new Setting(containerEl)
      .setName("字体")
      .setDesc("CSS font-family，留空则跟随 Obsidian 正文字体。例如 Noto Serif SC, serif")
      .addText((text) => {
        text.setPlaceholder("跟随 Obsidian");
        text.setValue(this.plugin.settings.appearance.fontFamily);
        text.onChange(async (value) => {
          this.plugin.settings.appearance.fontFamily = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("字号")
      .setDesc("聊天正文的字号，单位 px。")
      .addSlider((slider) => {
        slider.setLimits(11, 28, 1);
        slider.setValue(this.plugin.settings.appearance.fontSize);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.appearance.fontSize = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("行高")
      .addSlider((slider) => {
        slider.setLimits(1.2, 2.4, 0.05);
        slider.setValue(this.plugin.settings.appearance.lineHeight);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.appearance.lineHeight = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("显示时间戳")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.appearance.showTimestamps);
        toggle.onChange(async (value) => {
          this.plugin.settings.appearance.showTimestamps = value;
          await this.plugin.saveSettings();
        });
      });
  }

  // ------------------------------------------------------------ 标注

  private renderAnnotationSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "知识标注" });

    new Setting(containerEl)
      .setName("标注密度")
      .setDesc("默认「少量精准」：只标注真正需要解释的地方。")
      .addDropdown((dropdown) => {
        dropdown.addOption("minimal", "少量精准（默认）");
        dropdown.addOption("balanced", "适中");
        dropdown.addOption("dense", "密集");
        dropdown.setValue(this.plugin.settings.annotation.density);
        dropdown.onChange(async (value) => {
          this.plugin.settings.annotation.density = value as AnnotationDensity;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("单次最多生成卡片数")
      .setDesc(`当前：${this.plugin.settings.annotation.maxCardsPerPass} 张（由密度决定）`)
      .addText((text) => {
        text.setDisabled(true);
        text.setValue(String(this.plugin.settings.annotation.maxCardsPerPass));
      });

    containerEl.createEl("p", {
      cls: "nexnote-muted",
      text: "PDF 原文虚线标注与点击弹出卡片属于第二阶段，本版本先用「选中文本生成卡片」验证数据链路。",
    });
  }

  // ------------------------------------------------------------ 数据

  private renderStorageSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "数据与存储" });

    new Setting(containerEl)
      .setName("卡片库文件")
      .setDesc("vault 内的相对路径，可迁移的 JSON。改路径后新卡片会写到新文件。")
      .addText((text) => {
        text.setPlaceholder("NexNote/cards.json");
        text.setValue(this.plugin.settings.storage.cardFilePath);
        text.onChange(async (value) => {
          this.plugin.settings.storage.cardFilePath = value.trim() || "NexNote/cards.json";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("当前卡片数量")
      .setDesc(`存储位置：${this.plugin.service.getStorePath()}`)
      .addText((text) => {
        text.setDisabled(true);
        text.setValue(String(this.plugin.service.getCards().size));
      });

    const loadError = this.plugin.service.lastLoadError;
    if (loadError) {
      containerEl.createEl("p", {
        cls: "nexnote-warning",
        text: `上次加载卡片库失败：${loadError}（已从空库启动，原文件未被覆盖）`,
      });
    }
  }

  // ------------------------------------------------------------ 关于

  private renderAboutSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "关于" });
    containerEl.createEl("p", {
      cls: "nexnote-muted",
      text: `NexNote v${this.plugin.manifest.version} · MIT License · 开源仓库 github.com/Rnau0/NexNote`,
    });
    containerEl.createEl("p", {
      cls: "nexnote-muted",
      text: "设计原则：保留教材原始排版，AI 只做增强，不替换教材。",
    });
  }
}
