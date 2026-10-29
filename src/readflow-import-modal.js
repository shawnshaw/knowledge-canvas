import { Modal } from 'obsidian';
import { filterReadFlowCandidates } from './readflow-index.js';

const EMPTY_GUIDE = '没有找到 ReadFlow 摘录。请先在 ReadFlow 设置中启用「独立摘录文件」并重新同步，然后再试。';
const FILTERS = [
  { key: 'book', label: '书籍', all: '全部书籍' },
  { key: 'chapter', label: '章节', all: '全部章节' },
  { key: 'status', label: '状态', all: '全部状态' },
];

/**
 * Filterable multi-select importer for ReadFlow Atomic Markdown. Resolves
 * `{ paths }` on confirm and `null` on cancel or Escape; it never writes anything
 * itself, so cancelling cannot change the board.
 */
export class ReadFlowImportModal extends Modal {
  constructor(app, options, resolve) {
    super(app);
    this.candidates = options.candidates ?? [];
    this.existingPaths = new Set(options.existingPaths ?? []);
    this.skipped = options.skipped ?? [];
    this.resolve = resolve;
    this.settled = false;
    this.selected = new Set();
    this.filters = { query: '', book: '', chapter: '', status: '' };
    this.listEl = null;
    this.countEl = null;
    this.submitButton = null;
  }

  onOpen() {
    this.titleEl.setText('导入 ReadFlow');
    if (!this.candidates.length) {
      this.contentEl.createEl('p', { text: EMPTY_GUIDE });
      this.renderSkipped();
      this.renderActions();
      return;
    }
    this.renderFilters();
    this.listEl = this.contentEl.createDiv({ cls: 'kc-import-list' });
    this.renderList();
    this.renderSkipped();
    this.renderActions();
  }

  renderFilters() {
    const bar = this.contentEl.createDiv({ cls: 'kc-import-filters' });
    const search = bar.createEl('input', { cls: 'kc-import-search', attr: { type: 'search' } });
    search.placeholder = '搜索摘录或想法';
    search.setAttribute('aria-label', '搜索摘录或想法');
    search.addEventListener('input', () => { this.filters.query = search.value; this.renderList(); });
    for (const filter of FILTERS) this.addFilterSelect(bar, filter);
    this.countEl = bar.createEl('span', { cls: 'kc-import-count' });
    const selectAll = bar.createEl('button', { text: '全选当前结果' });
    selectAll.type = 'button';
    selectAll.addEventListener('click', () => {
      for (const candidate of this.visible()) {
        if (!this.existingPaths.has(candidate.path)) this.selected.add(candidate.path);
      }
      this.renderList();
    });
  }

  addFilterSelect(bar, { key, label, all }) {
    const values = [...new Set(this.candidates.map((candidate) => candidate[key]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const select = bar.createEl('select', { cls: 'kc-import-filter' });
    select.setAttribute('aria-label', label);
    const anyOption = select.createEl('option', { text: all });
    anyOption.value = '';
    for (const value of values) {
      const option = select.createEl('option', { text: value });
      option.value = value;
    }
    select.addEventListener('change', () => { this.filters[key] = select.value; this.renderList(); });
  }

  visible() {
    return filterReadFlowCandidates(this.candidates, this.filters);
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.replaceChildren();
    const items = this.visible();
    if (!items.length) this.listEl.createEl('p', { cls: 'kc-muted', text: '没有符合筛选条件的摘录。' });
    for (const candidate of items) {
      const already = this.existingPaths.has(candidate.path);
      const row = this.listEl.createEl('label', { cls: already ? 'kc-import-row is-added' : 'kc-import-row' });
      const checkbox = row.createEl('input', { attr: { type: 'checkbox' } });
      checkbox.disabled = already;
      checkbox.checked = !already && this.selected.has(candidate.path);
      if (!already) {
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) this.selected.add(candidate.path);
          else this.selected.delete(candidate.path);
          this.updateCount();
        });
      }
      const text = row.createEl('span', 'kc-import-text');
      text.createEl('strong', { text: candidate.title });
      text.createEl('small', { text: [candidate.book, candidate.chapter].filter(Boolean).join(' · ') || candidate.path });
      if (already) row.createEl('span', 'kc-import-state', '已添加');
    }
    this.updateCount();
  }

  renderSkipped() {
    if (!this.skipped.length) return;
    this.contentEl.createEl('p', {
      cls: 'kc-muted',
      text: `另有 ${this.skipped.length} 个文件无法解析，已跳过：${this.skipped.map((item) => item.path).join('、')}`,
    });
  }

  updateCount() {
    if (this.countEl) this.countEl.setText(`已选 ${this.selected.size} / 共 ${this.visible().length} 个结果`);
    if (this.submitButton) this.submitButton.disabled = this.selected.size === 0;
  }

  renderActions() {
    const actions = this.contentEl.createDiv({ cls: 'kc-modal-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'mod-cta', text: '加入当前画布' });
    submit.type = 'button';
    submit.disabled = this.selected.size === 0;
    submit.addEventListener('click', () => {
      if (this.settled) return;
      this.settled = true;
      submit.disabled = true;
      this.resolve({ paths: [...this.selected] });
      this.close();
    });
    this.submitButton = submit;
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

export function requestReadFlowImport(app, options) {
  return new Promise((resolve) => new ReadFlowImportModal(app, options, resolve).open());
}
