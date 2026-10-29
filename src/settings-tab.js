import { Notice, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, normalizeNoteFolder, noteFolderPreview } from './settings.js';

const STATUS_CLASS = {
  exists: 'is-ok',
  create: 'is-info',
  default: 'is-muted',
};

function describe(preview) {
  const parts = [];
  if (preview.status === 'default') parts.push(`留空时使用默认目录：${DEFAULT_SETTINGS.noteFolder}`);
  else if (preview.status === 'exists') parts.push(`文件夹已存在：${preview.folder}`);
  else parts.push(`文件夹尚不存在，首次新建便利贴时会自动逐级创建：${preview.folder}`);
  if (preview.rewritten) parts.push(`（已规范化为 ${preview.folder}）`);
  return parts.join(' ');
}

export class KnowledgeCanvasSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Knowledge Canvas 设置' });

    let hintEl = null;
    const renderHint = (value) => {
      if (!hintEl) return;
      const folder = normalizeNoteFolder(value);
      const exists = Boolean(this.app.vault.getAbstractFileByPath(folder));
      const preview = noteFolderPreview(value, { exists });
      hintEl.setText(describe(preview));
      hintEl.className = `kc-setting-hint ${STATUS_CLASS[preview.status] ?? ''}`.trim();
    };

    new Setting(containerEl)
      .setName('便利贴存放文件夹')
      .setDesc('新建便利贴时生成的 Markdown 文件放在这个目录下。改完立即生效，不用重启 Obsidian。')
      .addText((text) => {
        text.setPlaceholder(DEFAULT_SETTINGS.noteFolder);
        text.setValue(this.plugin.settings.noteFolder);
        text.inputEl.addClass('kc-setting-folder-input');
        text.onChange(async (value) => {
          const folder = normalizeNoteFolder(value);
          if (folder !== this.plugin.settings.noteFolder) {
            this.plugin.settings.noteFolder = folder;
            await this.plugin.saveSettings();
          }
          renderHint(value);
        });
      })
      .addExtraButton((button) => button
        .setIcon('rotate-ccw')
        .setTooltip('恢复默认文件夹')
        .onClick(async () => {
          this.plugin.settings.noteFolder = DEFAULT_SETTINGS.noteFolder;
          await this.plugin.saveSettings();
          this.display();
        }));

    hintEl = containerEl.createDiv({ cls: 'kc-setting-hint' });
    renderHint(this.plugin.settings.noteFolder);

    new Setting(containerEl)
      .setName('启用 ReadFlow 集成')
      .setDesc('显示「导入 ReadFlow」入口，并允许 ReadFlow 为每本书嵌入独立知识画板。关闭后不删除任何已导入的数据。')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.readFlowIntegrationEnabled);
        toggle.onChange(async (value) => {
          const previous = this.plugin.settings.readFlowIntegrationEnabled;
          this.plugin.settings.readFlowIntegrationEnabled = value;
          try {
            await this.plugin.saveSettings();
            this.plugin.refreshOpenViews();
            // Tearing down embedded surfaces and notifying ReadFlow must happen here, not on
            // the next manual refresh: a disabled toggle has to stop editing immediately.
            await this.plugin.onReadFlowIntegrationChange?.(value);
          } catch (error) {
            this.plugin.settings.readFlowIntegrationEnabled = previous;
            toggle.setValue(previous);
            new Notice(`保存失败：${error.message}`);
          }
        });
      });
  }
}
