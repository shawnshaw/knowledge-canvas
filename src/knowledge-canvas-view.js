import { FuzzySuggestModal, ItemView, MarkdownRenderer, Menu, Modal, Notice, setIcon } from 'obsidian';
import {
  cardSearchText,
  createEdge,
  createExcerptNode,
  createFileNode,
  createGroup,
  createStickyNode,
  isCardNode,
  isExcerptNode,
  isFileNode,
  isGroupNode,
  isTextNode,
  reflowGroup,
  removeFromBoard,
  renderedNodeHeight,
  restoreGeometry,
  setCardColor,
  setCollapsed,
  setEdgeRoute,
  snapshotGeometry,
  ungroup,
  updateFilePath,
} from './board-model.js';
import { READFLOW_DEFAULT_COLOR, effectiveCardColor } from './card-colors.js';
import {
  canPromoteToMarkdown,
  cardLabel,
  findCollapseTarget,
  outlineSelection,
} from './card-queries.js';
import { TOPBAR_BOARD_ACTIONS, createToolEntryState, reduceToolEntry, toolEntryView } from './canvas-tools.js';
import { applyLayoutPatch, layoutPatch } from './canvas-layout.js';
import { dragBounds, snapLines, snapRect, snapThreshold } from './canvas-snap.js';
import { boardNoteFolder } from './board-meta.js';
import { canMutateBoard } from './board-capabilities.js';
import { BOARD_WRITES_PAUSED, createMutationQueue, runBoardMutation } from './board-mutations.js';
import { createSourceSavedHandler } from './editor-bridge.js';
import { createLifecycleQueue } from './lifecycle-queue.js';
import { scanFolderFiles } from './folder-scan.js';
import { cancelGestureGeometry, isPanGesture } from './gesture-lifecycle.js';
import { isKeyboardFocus, selectionAfterFocus, selectionAfterPointerDown } from './selection-events.js';
import { layoutImportedCards, planImport } from './board-import.js';
import { CardColorPicker } from './color-picker.js';
import { contentBounds as boardContentBounds, fitViewport } from './content-viewport.js';
import { analyzeDelete, classifySelection, listRemovalTargets, planTrashTargets, revalidateTrashTargets, summarizeTrash } from './delete-plan.js';
import { requestDelete } from './delete-modal.js';
import { excerptSourcePath, excerptTextFromQuote, formatLocalTimestamp, markExcerptsUpdated, staleExcerptIds } from './excerpt-anchor.js';
import { edgePath, estimateLabelSize, labelRectAt, normalizeEdgeRoute } from './edge-geometry.js';
import { nextExcerptPoint } from './excerpt-placement.js';
import { FloatingEditor, renderWorkspacePreservingEditor } from './floating-editor.js';
import { normalizeBoardCreateInput, normalizeBoardNameInput, normalizeEdgeLabel, normalizeFilePath, normalizeStickyNote } from './input-dialog-state.js';
import { requestInput } from './input-modal.js';
import {
  BOLD_MARKER,
  CODE_MARKER,
  HEADING_LEVELS,
  HIGHLIGHT_MARKER,
  ITALIC_MARKER,
  LIST_PREFIX,
  QUOTE_PREFIX,
  setHeading,
  toggleInlineFormat,
  toggleLinePrefix,
} from './markdown-format.js';
import { projectOutline } from './outline.js';
import { addParagraphTimestamp } from './paragraph-timestamp.js';
import { applyPromotion, previewPromotion } from './relation-promotion.js';
import { RELOAD_ACTIONS, runReloadAction } from './reload-actions.js';
import {
  applyDrag,
  dragTargets,
  layoutUnits,
  marqueeSelection,
  rectFromPoints,
  selectAllIds,
} from './selection-geometry.js';
import { screenToWorld, worldToScreen, zoomAt } from './viewport.js';
import { toReadFlowCard } from './readflow-adapter.js';
import { layoutReadFlowCandidates } from './readflow-layout.js';
import { requestReadFlowImport } from './readflow-import-modal.js';

export const VIEW_TYPE_KNOWLEDGE_CANVAS = 'knowledge-canvas-view';

let nextBoardSelectId = 0;

/** Menu copy and command ids for the arrange toolkit, shared by both context menus. */
const LAYOUT_MENU_ITEMS = Object.freeze([
  ['grid', 'Grid 网格', 'layout-grid'],
  ['row', '水平排列', 'layout-list'],
  ['column', '垂直排列', 'columns-3'],
]);
const ALIGN_MENU_ITEMS = Object.freeze([
  ['align-left', '左对齐'],
  ['align-center', '水平居中'],
  ['align-right', '右对齐'],
  ['align-top', '顶部对齐'],
  ['align-middle', '垂直居中'],
  ['align-bottom', '底部对齐'],
]);
const DISTRIBUTE_MENU_ITEMS = Object.freeze([
  ['distribute-h', '水平等距分布'],
  ['distribute-v', '垂直等距分布'],
]);

function dom(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

class PromotionModal extends Modal {
  constructor(app, preview, confirm) {
    super(app);
    this.preview = preview;
    this.confirm = confirm;
  }

  onOpen() {
    this.titleEl.setText('同步为 Markdown 双链');
    this.contentEl.createEl('p', { text: '确认后才会写入以下 Markdown 文件：' });
    if (!this.preview.changes.length) this.contentEl.createEl('p', { text: '关系已存在，无需重复写入。' });
    for (const change of this.preview.changes) {
      this.contentEl.createEl('strong', { text: change.path });
      this.contentEl.createEl('pre', { text: change.append });
    }
    const actions = this.contentEl.createDiv({ cls: 'kc-modal-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'mod-cta', text: '确认写入' });
    submit.disabled = this.preview.changes.length === 0;
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      try { await this.confirm(); this.close(); new Notice('关系已同步'); }
      catch (error) { submit.disabled = false; new Notice(`写入失败：${error.message}`); }
    });
  }

  onClose() { this.contentEl.empty(); }
}

class DraftRecoveryModal extends Modal {
  constructor(app, title, body, retry) {
    super(app);
    this.draftTitle = title;
    this.body = body;
    this.retry = retry;
  }

  onOpen() {
    this.titleEl.setText('便利贴尚未创建');
    this.contentEl.createEl('p', { text: '创建失败，草稿仍保留。可重试或先复制内容。' });
    const draft = this.contentEl.createEl('textarea', { cls: 'kc-draft-recovery' });
    draft.value = `${this.draftTitle}\n\n${this.body}`;
    draft.readOnly = true;
    const actions = this.contentEl.createDiv({ cls: 'kc-modal-actions' });
    const copy = actions.createEl('button', { text: '复制内容' });
    copy.addEventListener('click', () => navigator.clipboard.writeText(draft.value));
    const retry = actions.createEl('button', { cls: 'mod-cta', text: '重试创建' });
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      try { await this.retry(); this.close(); }
      catch (error) { retry.disabled = false; new Notice(`仍无法创建：${error.message}`); }
    });
  }

  onClose() { this.contentEl.empty(); }
}

/** Vault-wide Markdown picker for "导入文件"; nothing is read, only the path is chosen. */
class MarkdownFilePicker extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('选择要加入画板的 Markdown 文件');
  }

  getItems() {
    return this.app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  }

  getItemText(file) { return file.path; }

  onChooseItem(file) { this.onChoose(file); }
}

/** Folder picker for "导入文件夹"; the import itself is recursive. */
class FolderPicker extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('选择要递归导入的文件夹');
  }

  getItems() {
    return this.app.vault.getAllLoadedFiles()
      .filter((entry) => Array.isArray(entry.children))
      .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  }

  getItemText(folder) { return folder.path; }

  onChooseItem(folder) { this.onChoose(folder); }
}

export class KnowledgeCanvasView extends ItemView {
  constructor(leaf, plugin, options = {}) {
    super(leaf);
    this.plugin = plugin;
    // The embedded surface is the same renderer mounted into a foreign element: it keeps
    // its own board path and reduced chrome, but never touches the plugin's global path.
    this.embedded = Boolean(options.embedded);
    this.compact = Boolean(options.compact);
    this.boardPath = options.boardPath ?? plugin.boardPath;
    if (options.app) this.app = options.app;
    if (options.contentEl) this.contentEl = options.contentEl;
    this._domCleanups = [];
    this.board = { nodes: [], edges: [] };
    this.viewport = { x: 80, y: 64, scale: 1 };
    this.mode = 'canvas';
    this.selected = new Set();
    this.search = '';
    this.gesture = null;
    this.editor = null;
    this.loadError = null;
    this.writerOwned = false;
    this.switching = false;
    this.boardSelect = null;
    this.boardCreateButton = null;
    this.readflowButton = null;
    this.toolEntry = createToolEntryState();
    this.toolEntryEl = null;
    this.colorPicker = null;
    // A blank left-drag is a marquee, so panning moves to space-drag or the middle button.
    this.spaceHeld = false;
    this.marqueeEl = null;
    // Snapping is a per-view-session switch, never a persisted plugin setting.
    this.snapEnabled = true;
    this.guideEls = [];
    this.importing = false;
    this.importNotice = null;
    // Board writes are serialised: clone → save → install must never interleave.
    this.boardMutations = createMutationQueue();
    // Lifecycle operations (switch/reload/retarget/hand-off/close) are serialised per view:
    // two of them interleaving can leave the path, board and writer out of sync.
    this.lifecycles = createLifecycleQueue();
    this.gestureIdle = null;
    this.gestureIdleResolve = null;
  }

  getViewType() { return VIEW_TYPE_KNOWLEDGE_CANVAS; }
  getDisplayText() { return '知识画板'; }
  getIcon() { return 'layout-dashboard'; }

  async onOpen() {
    await this.attach();
  }

  /** Shared bootstrap for the full view and the embedded surface. */
  async attach() {
    this.colorPicker = new CardColorPicker(this.contentEl);
    await this.mountBoard();
    this.render();
  }

  async mountBoard() {
    if (!this.embedded) await this.plugin.ensureBoard();
    try {
      this.board = await this.plugin.boardStore.load(this.boardPath);
      this.loadError = null;
      this.acquireBoardWriter();
    } catch (error) {
      this.loadError = error;
      this.writerOwned = false;
      new Notice(`画板加载失败：${error.message}`);
    }
    this.attachDocumentListeners();
  }

  /**
   * Claims the single-writer token for the current board. A second surface showing the same
   * `.canvas` (for example the full view opened by `openFullView`) is refused and becomes
   * read-only, so two stale snapshots can never interleave full-file saves.
   */
  acquireBoardWriter() {
    this.writerOwned = this.plugin.boardStore.acquireWriter(this.boardPath, this);
    return this.writerOwned;
  }

  /** Gives up the write token; the surface stays mounted but becomes read-only. */
  releaseBoardWriter(path = this.boardPath) {
    this.plugin.boardStore.releaseWriter(path, this);
    if (path === this.boardPath) this.writerOwned = false;
  }

  /** Registered once per surface; the embedded surface owns its own cleanup list. */
  onDomEvent(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    const cleanup = () => target.removeEventListener(type, handler, options);
    if (this.embedded) this._domCleanups.push(cleanup);
    else this.register(cleanup);
  }

  attachDocumentListeners() {
    this.onDomEvent(document, 'pointermove', (event) => this.onPointerMove(event));
    this.onDomEvent(document, 'pointerup', (event) => this.onPointerUp(event));
    // A cancelled pointer (touch interruption, window blur) must never leave a live gesture.
    this.onDomEvent(document, 'pointercancel', () => this.onPointerCancel());
    this.onDomEvent(document, 'pointerdown', (event) => this.onDocumentPointerDown(event), true);
    this.onDomEvent(document, 'keydown', (event) => {
      // Space turns a blank drag into a pan; it must not scroll the leaf or type a space.
      if (event.code === 'Space' && this.contentEl.contains(event.target) && !this.isTextEntryTarget(event.target)) {
        this.spaceHeld = true;
        if (!this.editor) event.preventDefault();
      }
      if (event.key === 'Escape' && this.contentEl.contains(event.target) && this.editor) this.editor.handleEscape();
    });
    this.onDomEvent(document, 'keyup', (event) => {
      if (event.code === 'Space') this.spaceHeld = false;
    });
  }

  /** True for a focused control that must own its own keystrokes (editor, modal, inputs). */
  isTextEntryTarget(target) {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    if (element.closest('input, textarea, select, [contenteditable="true"]')) return true;
    return Boolean(element.closest('.kc-editor'));
  }

  async onClose() {
    await this.prepareShutdown();
  }

  async prepareShutdown() {
    // Idempotent and final: once shutdown starts, later lifecycle requests are refused.
    return this.lifecycles.shutdown(() => this.performShutdown());
  }

  async performShutdown() {
    this.colorPicker?.close();
    if (this.editor && !(await this.editor.close())) throw new Error('浮动编辑器仍有未保存内容');
    // Pause first: a late edit must not queue behind the tail this drain captured. On
    // success the token is intentionally kept — the surface is closing for good.
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      await this.plugin.repository.flush();
    } catch (error) {
      // The surface is not closing after all, so it must accept writes again.
      this.boardMutations.resume(pause);
      throw error;
    }
    this.releaseBoardWriter();
  }

  /**
   * Adds a Markdown file to the board. A sticky note is a file card too, but it always starts
   * with one of the five presets; an ordinary imported file stays neutral.
   */
  async addFile(file, point = { x: 160, y: 120 }, { sticky = false, color } = {}) {
    if (!this.isWritable()) return;
    if (!file?.path?.toLowerCase().endsWith('.md')) return;
    // The "already on the board?" decision belongs to the mutator: a removal or import may
    // still be in flight, so checking the live board here would race with it.
    let existingId = null;
    await this.mutateBoard((next) => {
      const existing = next.nodes.find((node) => node.file === file.path);
      if (existing) {
        existingId = existing.id;
        return false;
      }
      next.nodes.push(sticky ? createStickyNode(file.path, point) : createFileNode(file.path, { ...point, color }));
      return true;
    }, '加入画板失败');
    if (existingId) {
      this.selected = new Set([existingId]);
      this.render();
    }
  }

  async handleRename(file, oldPath) {
    if (!this.isWritable()) return;
    // Always queued: an import may not have installed the old path yet when the Vault
    // rename arrives, and only the latest board can answer "is this path referenced?".
    await this.mutateBoard((next) => (updateFilePath(next, oldPath, file.path) ? true : false), '更新文件路径失败');
  }

  /** Opens the vault Markdown picker; a cancelled picker changes nothing. */
  importFile() {
    if (!this.isWritable() || this.importing) return;
    new MarkdownFilePicker(this.app, (file) => { void this.importMarkdownFiles([file.path]); }).open();
  }

  /** Opens the folder picker; the recursive scan happens after the choice. */
  importFolder() {
    if (!this.isWritable() || this.importing) return;
    new FolderPicker(this.app, (folder) => { void this.importFolderAt(folder.path); }).open();
  }

  /** Disables the tool-entry actions while a batch import is running. */
  setImporting(active) {
    this.importing = active;
    for (const button of this.toolEntryEl?.querySelectorAll('.kc-tools button') ?? []) button.disabled = active;
  }

  /**
   * Recursive folder import. The scan is read-only and yields between batches, so a large
   * Vault stays responsive and the progress notice can actually be painted. If nothing is
   * found, or the view is read-only, the board is untouched.
   */
  async importFolderAt(folderPath) {
    if (!this.isWritable() || this.importing) return false;
    this.setImporting(true);
    let notice = null;
    let paths;
    try {
      // Progress appears only once the scan needs a second batch, so a small folder never
      // flashes a notice it cannot justify.
      const matches = await scanFolderFiles(this.app.vault.getFiles(), folderPath, {
        onChunk: () => { if (!notice) notice = new Notice('正在扫描文件夹…', 0); },
      });
      paths = matches.map((file) => file.path);
    } catch (error) {
      new Notice(`扫描失败：${error.message}`);
      return false;
    } finally {
      notice?.hide();
      this.setImporting(false);
    }
    if (!paths.length) { new Notice('该文件夹没有 Markdown 文件'); return false; }
    return this.importMarkdownFiles(paths);
  }

  /**
   * One batch, one save, one render. Files already on the board and repeats inside the
   * batch are skipped; non-Markdown paths never become nodes. A failed save leaves the
   * board exactly as it was.
   */
  async importMarkdownFiles(paths) {
    if (!this.isWritable() || this.importing) return false;
    this.setImporting(true);
    const busy = setTimeout(() => { this.importNotice = new Notice('正在导入文件…', 0); }, 300);
    try {
      // Only board-independent filtering happens here; every existence decision is made
      // inside the mutator, against the latest board and the Vault.
      const requested = (paths ?? []).map((path) => String(path ?? '').trim()).filter((path) => /\.md$/i.test(path));
      if (!requested.length) {
        new Notice('没有新增卡片：所选内容不是 Markdown。');
        return false;
      }

      let added = 0;
      let skippedExisting = 0;
      let failed = 0;
      const done = await this.mutateBoard((next) => {
        const live = requested.filter((path) => this.app.vault.getAbstractFileByPath(path)?.extension === 'md');
        failed = requested.length - live.length;
        const plan = planImport(live, next.nodes.filter(isFileNode).map((node) => node.file));
        skippedExisting = plan.skippedExisting.length;
        if (!plan.added.length) return false;
        for (const { path, point } of layoutImportedCards(plan.added, next.nodes)) {
          next.nodes.push(createFileNode(path, point));
        }
        added = plan.added.length;
        return true;
      }, '导入失败');

      const skipped = requested.length - added;
      if (!done) {
        new Notice(`没有新增卡片：跳过 ${skipped} 个。`);
        return false;
      }
      new Notice(`已加入 ${added} 张卡片；跳过 ${skipped} 个（已存在 ${skippedExisting}，失败 ${failed}）。`);
      return true;
    } finally {
      clearTimeout(busy);
      this.importNotice?.hide();
      this.importNotice = null;
      this.setImporting(false);
    }
  }

  render() {
    const host = this.contentEl;
    renderWorkspacePreservingEditor(host, this.editor?.root, () => {
      host.addClass('knowledge-canvas-view');
      if (this.compact) host.addClass('kc-embedded');
      const shell = dom('div', 'kc-shell');
      host.append(shell);
      // The embedded surface drops the top bar and outline mode: it is a focused, per-book
      // editable canvas, and the full view remains one click away through openFullView().
      if (!this.compact) this.renderTopbar(shell);
      if (this.loadError) this.renderLoadError(shell);
      else if (this.mode === 'outline' && !this.compact) this.renderOutline(shell);
      else this.renderCanvas(shell);
      if (!this.loadError && !this.writerOwned) this.renderReadonlyBanner(shell);
    });
  }

  renderLoadError(shell) {
    const state = dom('main', 'kc-load-error');
    state.append(dom('h2', '', '画板暂时只读'));
    state.append(dom('p', '', `无法读取原画板：${this.loadError.message}`));
    state.append(dom('p', 'kc-muted', '原文件不会被覆盖。修复文件或访问权限后再重新载入。'));
    const retry = dom('button', 'mod-cta', '重新载入');
    retry.type = 'button';
    retry.addEventListener('click', () => this.reloadBoard());
    state.append(retry);
    shell.append(state);
  }

  /** Shown when another surface owns the write token, so this one cannot overwrite it. */
  renderReadonlyBanner(shell) {
    const bar = dom('div', 'kc-readonly-banner', '该画布已在全屏视图打开，当前为只读。');
    const open = dom('button', '', '打开全屏');
    open.type = 'button';
    open.addEventListener('click', () => this.openFullView());
    bar.append(open);
    shell.append(bar);
  }

  async reloadBoard({ notify = false } = {}) {
    return this.lifecycles(() => this.performReloadBoard({ notify }));
  }

  async performReloadBoard({ notify = false } = {}) {
    // Close the editor before pausing: a save in flight still needs to run its post-save
    // excerpt timestamp write, which a paused queue would refuse.
    if (this.editor && !(await this.editor.close())) {
      new Notice('浮动编辑器仍有未保存内容，已取消重载');
      return;
    }
    const pause = this.boardMutations.pause();
    try {
      // Drain the queue too: a queued write would otherwise land after the reload.
      await this.drainBoardWrites();
    } catch (error) {
      this.boardMutations.resume(pause);
      new Notice(`画板还有改动没能写入，已取消重载：${error.message}`);
      return;
    }
    try {
      const board = await this.plugin.boardStore.load(this.boardPath);
      this.board = board;
      this.loadError = null;
      this.render();
      if (notify) new Notice('画板已从磁盘重载');
    } catch (error) {
      this.loadError = error;
      new Notice(`仍无法载入画板：${error.message}`);
      this.render();
    } finally {
      this.boardMutations.resume(pause);
    }
  }

  isWritable() {
    // One decision for every mutating command; the embedded surface is read-only whenever
    // another surface owns the board or the load failed.
    if (canMutateBoard({ writerOwned: this.writerOwned, loadError: this.loadError })) return true;
    if (this.loadError) {
      new Notice('画板读取失败，修复并重新载入前不会写入原文件。');
    } else {
      new Notice('该画布已在其他视图打开，当前为只读。');
    }
    return false;
  }

  renderTopbar(shell) {
    const top = dom('header', 'kc-topbar');
    top.append(dom('strong', 'kc-board-title', '知识画板'));
    const modes = dom('div', 'kc-segmented');
    for (const [mode, label] of [['canvas', '自由画板'], ['outline', '结构大纲']]) {
      const button = dom('button', this.mode === mode ? 'is-active' : '', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(this.mode === mode));
      button.addEventListener('click', () => { this.mode = mode; this.render(); });
      modes.append(button);
    }
    const search = dom('input', 'kc-search');
    search.type = 'search';
    search.placeholder = '搜索卡片';
    search.value = this.search;
    search.setAttribute('aria-label', '搜索卡片');
    search.addEventListener('input', () => {
      this.search = search.value.toLowerCase();
      if (this.mode === 'canvas') this.applyCanvasSearch();
      else {
        const position = search.selectionStart;
        this.render();
        const replacement = this.contentEl.querySelector('.kc-search');
        replacement?.focus();
        replacement?.setSelectionRange(position, position);
      }
    });
    const reload = dom('button', 'kc-reload', '重载');
    reload.type = 'button';
    reload.setAttribute('aria-label', '重载画板或插件');
    reload.setAttribute('aria-haspopup', 'menu');
    reload.addEventListener('click', (event) => this.openReloadMenu(event));
    top.append(this.buildBoardActions(), modes, search, reload);
    shell.append(top);
  }

  /** Board cluster in the fixed order: switcher, new board, ReadFlow import. */
  buildBoardActions() {
    const group = dom('div', 'kc-board-actions');
    const builders = {
      boardSelect: () => this.buildBoardSelect(),
      newBoard: () => this.buildNewBoardButton(),
      importReadFlow: () => this.buildImportReadFlowButton(),
    };
    for (const action of TOPBAR_BOARD_ACTIONS) {
      if (action === 'importReadFlow' && !this.plugin.isReadFlowIntegrationEnabled()) continue;
      group.append(builders[action]());
    }
    return group;
  }

  buildBoardSelect() {
    const switcher = dom('div', 'kc-board-switcher');
    const id = `kc-board-select-${++nextBoardSelectId}`;
    const label = dom('label', 'kc-board-switcher-label', '画布');
    label.htmlFor = id;
    const select = dom('select', 'kc-board-select');
    select.id = id;
    select.setAttribute('aria-label', '画布');
    select.addEventListener('change', () => { this.switchBoard(select.value); });
    switcher.append(label, select);
    this.boardSelect = select;
    this.refreshBoardList();
    this.setBoardControlsDisabled(this.switching);
    return switcher;
  }

  buildNewBoardButton() {
    const create = dom('button', 'kc-board-create', '＋');
    create.type = 'button';
    create.setAttribute('aria-label', '新建画布');
    create.addEventListener('click', () => this.createBoard());
    this.boardCreateButton = create;
    return create;
  }

  /** Secondary top-bar action; it always imports into whichever board is open. */
  buildImportReadFlowButton() {
    const button = dom('button', 'kc-import-readflow', '导入 ReadFlow');
    button.type = 'button';
    button.setAttribute('aria-label', '把 ReadFlow 摘录导入当前画布');
    button.addEventListener('click', () => this.importReadFlow());
    this.readflowButton = button;
    return button;
  }

  refreshBoardList() {
    const select = this.boardSelect;
    if (!select) return;
    select.replaceChildren();
    for (const board of this.plugin.listBoards()) {
      const option = dom('option', '', board.name);
      option.value = board.path;
      select.append(option);
    }
    select.value = this.boardPath;
    if (select.value !== this.boardPath) {
      // The current board is not in the catalog (for example its file moved away);
      // keep it selectable rather than silently showing a different workspace.
      const current = dom('option', '', this.boardPath);
      current.value = this.boardPath;
      select.append(current);
      select.value = this.boardPath;
    }
  }

  setBoardControlsDisabled(disabled) {
    this.switching = disabled;
    if (this.boardSelect) this.boardSelect.disabled = disabled;
    if (this.boardCreateButton) this.boardCreateButton.disabled = disabled;
  }

  /**
   * Switching is all-or-nothing and serialised: two switches must never interleave their
   * close → drain → load → owner/path swap sequence, or a later failure could restore the
   * earlier path while keeping the newer board and writer.
   */
  async switchBoard(path) {
    return this.lifecycles(() => this.performSwitchBoard(path));
  }

  async performSwitchBoard(path) {
    if (!path || path === this.boardPath) return false;
    if (this.editor && !(await this.editor.close())) {
      this.refreshBoardList();
      return false;
    }
    const previous = { boardPath: this.boardPath, lastBoardPath: this.plugin.settings.lastBoardPath };
    this.setBoardControlsDisabled(true);
    const pause = this.boardMutations.pause();
    try {
      // Drain the mutation queue first: those tasks have not reached BoardStore yet.
      await this.drainBoardWrites();
      const next = await this.plugin.boardStore.load(path);
      await this.plugin.setLastBoardPath(path);
      this.releaseBoardWriter(this.boardPath);
      this.boardPath = path;
      this.board = next;
      this.selected.clear();
      this.search = '';
      this.loadError = null;
      this.acquireBoardWriter();
      this.render();
      return true;
    } catch (error) {
      this.plugin.boardPath = previous.boardPath;
      this.boardPath = previous.boardPath;
      this.plugin.settings.lastBoardPath = previous.lastBoardPath;
      new Notice(`切换画布失败：${error.message}`);
      this.render();
      return false;
    } finally {
      this.boardMutations.resume(pause);
      this.setBoardControlsDisabled(false);
      this.refreshBoardList();
    }
  }

  async createBoard() {
    const result = await requestInput(this.app, {
      title: '新建画布',
      submitLabel: '创建画布',
      validate: (values) => {
        try { return normalizeBoardNameInput(values) ? null : '画布名称不能为空'; }
        catch { return '画布名称不能包含 . 或 .. 路径片段'; }
      },
      fields: [
        { key: 'name', label: '画布名称', placeholder: '例如：读书笔记' },
        { key: 'createNoteFolder', label: '同时创建此画布的专属笔记文件夹', type: 'checkbox', value: false },
      ],
    });
    if (!result) return;
    const normalized = normalizeBoardCreateInput(result);
    if (!normalized) { new Notice('画布名称不能为空'); return; }
    let path;
    try {
      path = await this.plugin.createBoardFile(normalized.name, { createNoteFolder: normalized.createNoteFolder });
    } catch (error) {
      new Notice(`无法新建画布：${error.message}`);
      return;
    }
    await this.switchBoard(path);
  }

  openReloadMenu(event) {
    const menu = new Menu();
    for (const action of RELOAD_ACTIONS) {
      menu.addItem((item) => item
        .setTitle(action.title)
        .setIcon(action.icon)
        .onClick(() => this.runReload(action.id)));
    }
    menu.showAtMouseEvent(event);
  }

  async runReload(id) {
    const context = { editorDirty: Boolean(this.editor?.session?.dirty) };
    const result = await runReloadAction(id, context, {
      board: () => this.reloadBoard({ notify: true }),
      plugin: () => this.reloadPlugin(),
    });
    if (!result.ok) new Notice(`重载未执行：${result.reason}`);
  }

  async reloadPlugin() {
    const manager = this.app.plugins;
    if (!manager?.disablePlugin || !manager?.enablePlugin) throw new Error('当前 Obsidian 版本不支持应用内重载插件');
    const id = this.plugin.manifest.id;
    await manager.disablePlugin(id);
    await manager.enablePlugin(id);
    await manager.getPlugin(id)?.activate?.();
    new Notice('插件已重载');
  }

  applyCanvasSearch() {
    for (const card of this.stage?.querySelectorAll('.kc-card') ?? []) {
      const node = this.board.nodes.find((candidate) => candidate.id === card.dataset.nodeId);
      card.hidden = Boolean(this.search && !cardSearchText(node).includes(this.search));
    }
  }

  renderCanvas(shell) {
    const stage = dom('main', 'kc-stage');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', '知识画板');
    this.stage = stage;
    shell.append(stage);
    this.renderTools(stage);
    if (!this.board.nodes.length) this.renderEmpty(stage);
    const layer = dom('div', 'kc-world');
    layer.style.transform = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;
    stage.append(layer);
    this.renderGroups(layer);
    this.renderEdges(layer);
    for (const node of this.filteredNodes()) this.renderNode(layer, node);
    this.renderZoom(stage);
    stage.addEventListener('dblclick', (event) => {
      if (event.target === stage || event.target === layer) this.createSticky(screenToWorld(this.localPoint(event), this.viewport));
    });
    stage.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    stage.addEventListener('dragover', (event) => event.preventDefault());
    stage.addEventListener('drop', (event) => this.onDrop(event));
    stage.addEventListener('contextmenu', (event) => {
      if (event.target === stage || event.target === layer) this.canvasMenu(event);
    });
    stage.addEventListener('keydown', (event) => this.onKeyDown(event));
    stage.addEventListener('pointerdown', (event) => {
      if (event.target !== stage && event.target !== layer) return;
      // Space-drag and the middle button pan; a plain left-drag is a marquee.
      if (event.button === 1 || (event.button === 0 && this.spaceHeld)) {
        event.preventDefault();
        this.gesture = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, viewport: { ...this.viewport } };
        return;
      }
      if (event.button !== 0) return;
      const additive = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!additive && this.selected.size) { this.selected.clear(); this.updateSelection(); this.refreshTools(); }
      this.gesture = {
        kind: 'marquee',
        start: screenToWorld(this.localPoint(event), this.viewport),
        base: new Set(this.selected),
      };
    });
  }

  /**
   * The top-left entry: a single round button when collapsed, a capsule with the board
   * actions once expanded. Rebuilding only the entry keeps expansion cheap and, because
   * the document listener is registered once in onOpen, cannot duplicate it.
   */
  renderTools(stage) {
    const entry = dom('div', 'kc-tool-entry');
    this.toolEntryEl = entry;
    stage.append(entry);
    this.renderToolEntry();
  }

  renderToolEntry() {
    const entry = this.toolEntryEl;
    if (!entry?.isConnected) return;
    entry.replaceChildren();
    const view = toolEntryView(this.toolEntry);
    const toggle = dom('button', 'kc-tool-entry-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', view.ariaLabel);
    toggle.setAttribute('aria-expanded', view.ariaExpanded);
    setIcon(toggle, view.icon);
    toggle.addEventListener('click', () => this.setToolEntryExpanded(!this.toolEntry.expanded));
    entry.append(toggle);
    if (!view.expanded) return;

    const tools = dom('nav', 'kc-tools');
    tools.setAttribute('aria-label', '画板工具');
    for (const action of view.visibleActions) {
      const button = this.toolActionButton(action);
      if (button) tools.append(button);
    }
    tools.append(...this.groupActions());
    entry.append(tools);
  }

  /** Rebuilds only the entry, so a selection change never re-hydrates every card. */
  refreshTools() {
    this.renderToolEntry();
  }

  setToolEntryExpanded(expanded) {
    this.toolEntry = reduceToolEntry(this.toolEntry, { type: expanded ? 'expand' : 'collapse' });
    this.renderToolEntry();
  }

  /** The expanded entry's "布局" menu: the whole arrange toolkit without selecting first. */
  openLayoutMenu(event) {
    const empty = !this.selected.size;
    const menu = new Menu();
    this.appendLayoutItems(menu, { disabled: empty });
    menu.addSeparator();
    this.appendAlignItems(menu, { disabled: empty });
    menu.addSeparator();
    this.appendDistributeItems(menu, { disabled: empty || this.selected.size < 3 });
    menu.showAtMouseEvent(event);
  }

  /** Builds one expanded tool-entry action. The ReadFlow import lives in the top bar instead. */
  toolActionButton(action) {
    const builders = {
      sticky: () => {
        const sticky = dom('button', 'mod-cta', '＋ 便利贴');
        sticky.type = 'button';
        sticky.addEventListener('click', () => this.createSticky(screenToWorld({ x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 }, this.viewport)));
        return sticky;
      },
      importFile: () => {
        const button = dom('button', '', '导入文件');
        button.type = 'button';
        button.setAttribute('aria-label', '导入 Markdown 文件');
        button.disabled = this.importing;
        button.addEventListener('click', () => this.importFile());
        return button;
      },
      importFolder: () => {
        const button = dom('button', '', '导入文件夹');
        button.type = 'button';
        button.setAttribute('aria-label', '递归导入文件夹中的 Markdown');
        button.disabled = this.importing;
        button.addEventListener('click', () => this.importFolder());
        return button;
      },
      layout: () => {
        const layout = dom('button', '', '布局');
        layout.type = 'button';
        layout.setAttribute('aria-label', '布局所选卡片');
        layout.addEventListener('click', (event) => this.openLayoutMenu(event));
        return layout;
      },
    };
    return builders[action]?.() ?? null;
  }

  /** Registered once on the document, so a repaint can never stack a second listener. */
  onDocumentPointerDown(event) {
    if (this.colorPicker?.isOpen && !this.colorPicker.contains(event.target)) this.colorPicker.close();
    if (!this.toolEntry.expanded) return;
    if (this.toolEntryEl?.contains(event.target)) return;
    this.setToolEntryExpanded(false);
  }

  /** Group actions only appear when the current selection can actually use them. */
  groupActions() {
    const selection = this.board.nodes.filter((node) => this.selected.has(node.id));
    const selectedGroups = selection.filter(isGroupNode);
    const grouped = new Set(this.board.nodes.filter(isGroupNode).flatMap((group) => group.members));
    const ungroupedFiles = selection.filter((node) => !isGroupNode(node) && !grouped.has(node.id));
    const actions = [];
    if (selectedGroups.length === 0 && ungroupedFiles.length >= 2) {
      const groupButton = dom('button', '', '编组');
      groupButton.type = 'button';
      groupButton.setAttribute('aria-label', '将所选卡片编组');
      groupButton.addEventListener('click', () => this.createGroupFromSelection());
      actions.push(groupButton);
    }
    if (selectedGroups.length === 1 && this.selected.size === 1) {
      const ungroupButton = dom('button', '', '解除分组');
      ungroupButton.type = 'button';
      ungroupButton.setAttribute('aria-label', '解除分组');
      ungroupButton.addEventListener('click', () => this.ungroupSelection(selectedGroups.map((group) => group.id)));
      const deleteFrame = dom('button', '', '删除分组框');
      deleteFrame.type = 'button';
      deleteFrame.setAttribute('aria-label', '删除分组框');
      deleteFrame.addEventListener('click', () => this.removeGroup(selectedGroups[0].id));
      actions.push(ungroupButton, deleteFrame);
    } else if (selectedGroups.length > 1) {
      // Several frames can be dissolved in one command; the cards always stay.
      const ungroupButton = dom('button', '', `解除 ${selectedGroups.length} 个分组`);
      ungroupButton.type = 'button';
      ungroupButton.setAttribute('aria-label', `解除所选的 ${selectedGroups.length} 个分组`);
      ungroupButton.addEventListener('click', () => this.ungroupSelection(selectedGroups.map((group) => group.id)));
      actions.push(ungroupButton);
    }
    return actions;
  }

  renderEmpty(stage) {
    const empty = dom('section', 'kc-empty');
    empty.append(dom('h2', '', '把 Markdown 变成可组织的卡片'));
    empty.append(dom('p', '', '双击空白处新建便利贴，或把已有 Markdown 加入画板。'));
    const button = dom('button', 'mod-cta', '新建便利贴');
    button.type = 'button';
    button.addEventListener('click', () => this.createSticky({ x: 160, y: 120 }));
    empty.append(button);
    if (this.plugin.isReadFlowIntegrationEnabled()) {
      const readflow = dom('button', '', '导入 ReadFlow');
      readflow.type = 'button';
      readflow.setAttribute('aria-label', '导入 ReadFlow 摘录');
      readflow.addEventListener('click', () => this.importReadFlow());
      empty.append(readflow);
    }
    stage.append(empty);
  }

  renderNode(layer, node) {
    const collapsed = node.collapsed === true;
    const excerpt = isExcerptNode(node);
    // A bare text node is what Obsidian's own Canvas can leave behind: readable, not editable.
    const textOnly = !excerpt && isTextNode(node);
    const card = dom('article', 'kc-card');
    card.dataset.nodeId = node.id;
    card.dataset.kind = excerpt ? 'excerpt' : textOnly ? 'text' : 'note';
    card.dataset.color = effectiveCardColor(node);
    if (collapsed) card.dataset.collapsed = 'true';
    card.tabIndex = 0;
    const label = cardLabel(node);
    const ariaKind = excerpt ? '摘录' : textOnly ? '文本卡' : '笔记';
    card.setAttribute('aria-label', `${ariaKind} ${label}`);
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.style.width = `${node.width}px`;
    card.style.height = `${renderedNodeHeight(node)}px`;
    if (this.selected.has(node.id)) card.classList.add('is-selected');
    const header = dom('header', 'kc-card-header');
    const type = dom('span', 'kc-card-type', excerpt ? '摘录' : textOnly ? '文本' : '随笔');
    const title = dom('h3', '', label);
    const collapse = dom('button', 'kc-collapse', collapsed ? '▸' : '▾');
    collapse.type = 'button';
    collapse.setAttribute('aria-label', collapsed ? `展开 ${label}` : `折叠 ${label}`);
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.addEventListener('pointerdown', (event) => event.stopPropagation());
    collapse.addEventListener('click', (event) => { event.stopPropagation(); this.toggleCollapsed(node.id); });
    header.append(type, title, collapse);
    const connector = dom('button', 'kc-connector', '');
    connector.type = 'button';
    connector.setAttribute('aria-label', '拖动建立关系');
    connector.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (!this.writerOwned) return;
      this.gesture = { kind: 'connect', from: node.id };
    });
    card.append(header, connector);
    // A collapsed card keeps its connector and can still be selected, moved, connected,
    // and opened with Enter — it just never loads or renders body content.
    let body = null;
    if (!collapsed) {
      body = dom('div', 'kc-card-body', excerpt || textOnly ? '' : '加载中…');
      if (excerpt) this.fillExcerptBody(node, body);
      else if (textOnly) body.textContent = node.text;
      const resize = dom('button', 'kc-resize', '');
      resize.type = 'button';
      resize.setAttribute('aria-label', '调整卡片大小');
      resize.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        if (!this.writerOwned) return;
        this.gesture = { kind: 'resize', start: { x: event.clientX, y: event.clientY }, nodes: snapshotGeometry([node]) };
      });
      card.append(body, resize);
    }
    let openOnClick = false;
    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      // Space is the pan modifier everywhere, including over a card.
      if (this.spaceHeld) {
        event.preventDefault();
        openOnClick = false;
        this.gesture = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, viewport: { ...this.viewport } };
        return;
      }
      openOnClick = this.selected.has(node.id) && this.selected.size === 1;
      this.selected = selectionAfterPointerDown(this.selected, node.id, {
        additive: event.metaKey || event.ctrlKey || event.shiftKey,
      });
      this.updateSelection();
      if (!this.writerOwned) return;
      // A selected group brings its members with it, and a member that is also selected
      // directly is still moved only once.
      const selectedNodes = dragTargets(this.board.nodes, this.selected);
      this.gesture = {
        kind: 'move', start: screenToWorld(this.localPoint(event), this.viewport), moved: false,
        nodes: snapshotGeometry(selectedNodes),
      };
    });
    card.addEventListener('click', () => {
      if (openOnClick && !this.suppressCardOpen) this.openNode(node);
      this.suppressCardOpen = false;
    });
    // A mouse click focuses the card after pointerdown already chose the selection; only
    // keyboard-visible focus may collapse a multi-selection to a single card.
    card.addEventListener('focus', () => {
      const next = selectionAfterFocus(this.selected, node.id, { keyboardVisible: isKeyboardFocus(card) });
      if (next === this.selected) return;
      this.selected = next;
      this.updateSelection();
      this.refreshTools();
    });
    card.addEventListener('contextmenu', (event) => this.nodeMenu(event, node));
    layer.append(card);
    if (!collapsed && !excerpt && !textOnly) this.hydrateCard(node, card, type, title, body);
  }

  fillExcerptBody(node, body) {
    const anchor = node.kcExcerpt;
    const created = formatLocalTimestamp(anchor.createdAt);
    const updated = formatLocalTimestamp(anchor.updatedAt);
    const meta = [created ? `创建于 ${created}` : '', updated ? `源文更新于 ${updated}` : ''].filter(Boolean).join(' · ');
    body.replaceChildren(
      dom('blockquote', '', anchor.quote),
      dom('small', '', anchor.sourceFile),
      ...(meta ? [dom('small', 'kc-excerpt-time', meta)] : []),
    );
  }

  async hydrateCard(node, card, type, title, body) {
    try {
      const result = await this.plugin.repository.read(node.file);
      const file = result.file;
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const readFlow = toReadFlowCard(file, result.content, frontmatter);
      if (!card.isConnected) return;
      if (readFlow) {
        card.dataset.kind = 'readflow';
        // ReadFlow's blue is a render-time default: the card gets the stripe without the
        // canvas being rewritten on every paint.
        card.dataset.color = effectiveCardColor(node, { readFlow: true });
        type.textContent = 'READFLOW · 原文摘录';
        title.textContent = readFlow.title;
        body.replaceChildren(dom('blockquote', '', readFlow.excerpt), dom('small', '', [readFlow.book, readFlow.chapter].filter(Boolean).join(' · ')));
      } else {
        const plain = result.content.replace(/^---\n[\s\S]*?\n---\s*/, '').replace(/^#\s+.*\n?/, '').trim();
        body.textContent = plain.slice(0, 180) || '空白笔记';
      }
    } catch {
      card.dataset.kind = 'missing';
      type.textContent = '文件缺失';
      body.replaceChildren(dom('p', '', '源文件不存在'));
      const remove = dom('button', '', '从画板移除');
      remove.type = 'button';
      remove.addEventListener('click', () => this.removeNodes([node.id]));
      const relink = dom('button', '', '重新关联');
      relink.type = 'button';
      relink.addEventListener('click', async () => {
        const result = await requestInput(this.app, {
          title: '重新关联 Markdown 文件',
          submitLabel: '重新关联',
          fields: [{ key: 'path', label: 'Markdown 路径', value: node.file }],
        });
        if (!result) return;
        const path = normalizeFilePath(result);
        const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
        if (!file?.path?.toLowerCase().endsWith('.md')) { new Notice('未找到该 Markdown 文件'); return; }
        await this.mutateBoard((next) => {
          const target = next.nodes.find((candidate) => candidate.id === node.id);
          if (!target) return false;
          target.file = file.path;
          return true;
        }, '重新关联失败');
      });
      body.append(relink, remove);
    }
  }

  /**
   * Group frames render behind edges and cards. A frame is a plain box, so a pointer
   * over a member card hits the card (higher z-index) and only the frame's own padding
   * ring starts a whole-group drag. No resize handle and no connector by design.
   * Frames are focusable and selectable from the keyboard on the same terms as cards.
   */
  renderGroups(layer) {
    if (this.search) return;
    for (const group of this.board.nodes.filter(isGroupNode)) {
      const frame = dom('div', 'kc-group');
      frame.dataset.groupId = group.id;
      frame.tabIndex = 0;
      frame.setAttribute('role', 'group');
      frame.setAttribute('aria-label', `${group.label ? `分组框 ${group.label}` : '分组框'}，包含 ${group.members.length} 张卡片，按 Enter 或空格可选中`);
      frame.style.left = `${group.x}px`;
      frame.style.top = `${group.y}px`;
      frame.style.width = `${group.width}px`;
      frame.style.height = `${group.height}px`;
      if (this.selected.has(group.id)) frame.classList.add('is-selected');
      if (group.label) frame.append(dom('span', 'kc-group-label', group.label));
      frame.addEventListener('pointerdown', (event) => this.onGroupPointerDown(event, group));
      frame.addEventListener('focus', () => {
        // Only keyboard focus steals the selection, so mouse multi-select still works.
        const next = selectionAfterFocus(this.selected, group.id, { keyboardVisible: isKeyboardFocus(frame) });
        if (next === this.selected) return;
        this.selected = next;
        this.updateSelection();
        this.refreshTools();
      });
      frame.addEventListener('keydown', (event) => this.onGroupKeyDown(event, group));
      frame.addEventListener('contextmenu', (event) => this.groupMenu(event, group));
      layer.append(frame);
    }
  }

  onGroupPointerDown(event, group) {
    if (event.button !== 0) return;
    if (this.spaceHeld) {
      event.preventDefault();
      this.gesture = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, viewport: { ...this.viewport } };
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      if (this.selected.has(group.id)) this.selected.delete(group.id);
      else this.selected.add(group.id);
    } else if (!this.selected.has(group.id)) {
      this.selected = new Set([group.id]);
    }
    this.updateSelection();
    this.refreshTools();
    if (!this.writerOwned) return;
    // Dragging any selected frame moves every selected unit, so two selected groups do not
    // drift apart, and a frame's members are translated exactly once.
    const members = dragTargets(this.board.nodes, this.selected);
    this.gesture = {
      kind: 'group-move',
      start: screenToWorld(this.localPoint(event), this.viewport),
      moved: false,
      nodes: snapshotGeometry(members),
    };
  }

  onGroupKeyDown(event, group) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    this.selected = new Set([group.id]);
    this.updateSelection();
    this.refreshTools();
  }

  renderEdges(layer) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('kc-edges');
    svg.setAttribute('aria-label', '关系');
    svg.setAttribute('viewBox', '-10000 -10000 30000 30000');
    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    defs.innerHTML = '<marker id="kc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>';
    svg.append(defs);
    const obstacles = this.board.nodes.filter(isCardNode).map((node) => this.nodeRect(node));
    for (const edge of this.board.edges) {
      const from = this.board.nodes.find((node) => node.id === edge.fromNode);
      const to = this.board.nodes.find((node) => node.id === edge.toNode);
      if (!from || !to) continue;
      const labelSize = edge.label ? estimateLabelSize(edge.label) : undefined;
      const path = edgePath(this.nodeRect(from), this.nodeRect(to), edge.kcRoute, obstacles, labelSize);
      const group = document.createElementNS(svg.namespaceURI, 'g');
      group.dataset.edgeId = edge.id;
      group.dataset.color = edge.color ?? 'neutral';
      group.dataset.route = normalizeEdgeRoute(edge.kcRoute);
      if (this.selected.has(edge.id)) group.classList.add('is-selected');
      const line = document.createElementNS(svg.namespaceURI, 'path');
      line.setAttribute('d', path.d);
      line.classList.add('kc-edge-line');
      if (edge.fromEnd === 'arrow') line.setAttribute('marker-start', 'url(#kc-arrow)');
      if (edge.toEnd === 'arrow') line.setAttribute('marker-end', 'url(#kc-arrow)');
      if (edge.style === 'dashed') line.setAttribute('stroke-dasharray', '8 6');
      // The hit path is a separate transparent clone so the visible stroke can stay thin.
      const hit = document.createElementNS(svg.namespaceURI, 'path');
      hit.setAttribute('d', path.d);
      hit.classList.add('kc-edge-hit');
      hit.addEventListener('click', (event) => { event.stopPropagation(); this.selected = new Set([edge.id]); this.render(); });
      hit.addEventListener('dblclick', (event) => { event.stopPropagation(); this.editEdgeLabel(edge); });
      hit.addEventListener('contextmenu', (event) => this.edgeMenu(event, edge));
      group.append(line, hit);
      if (edge.label) {
        // The pill and the text sit inside the exact rectangle the collision test used, so
        // a label that cleared the cards at placement time still clears them once rendered.
        const rect = labelRectAt(path.labelPoint, labelSize);
        const label = document.createElementNS(svg.namespaceURI, 'text');
        label.setAttribute('x', String(path.labelPoint.x));
        label.setAttribute('y', String(rect.y + rect.height / 2));
        label.setAttribute('dominant-baseline', 'central');
        label.textContent = edge.label;
        label.addEventListener('dblclick', (event) => { event.stopPropagation(); this.editEdgeLabel(edge); });
        const pill = document.createElementNS(svg.namespaceURI, 'rect');
        pill.setAttribute('x', String(rect.x));
        pill.setAttribute('y', String(rect.y));
        pill.setAttribute('width', String(rect.width));
        pill.setAttribute('height', String(rect.height));
        pill.setAttribute('rx', '8');
        pill.classList.add('kc-edge-label-bg');
        group.append(pill, label);
      }
      svg.append(group);
    }
    layer.append(svg);
  }

  /** The rectangle a connector attaches to, honouring a collapsed card's rendered height. */
  nodeRect(node) {
    return { x: node.x, y: node.y, width: node.width, height: renderedNodeHeight(node) };
  }

  renderOutline(shell) {
    const main = dom('main', 'kc-outline');
    const selection = outlineSelection(this.board, this.filteredNodes());
    const outline = projectOutline(selection.nodes, selection.edges);
    const list = dom('ul', 'kc-outline-tree');
    const append = (parent, item) => {
      const li = dom('li', '');
      const button = dom('button', '', cardLabel(item.node) || '未命名');
      button.type = 'button'; button.addEventListener('click', () => this.openEditor(item.node));
      li.append(button);
      if (item.children.length) { const children = dom('ul', ''); for (const child of item.children) append(children, child); li.append(children); }
      parent.append(li);
    };
    for (const root of outline.roots) append(list, root);
    main.append(list);
    if (outline.crossReferences.length) {
      main.append(dom('h2', '', '交叉引用'));
      for (const relation of outline.crossReferences) main.append(dom('p', 'kc-cross-reference', `${this.nodeName(relation.from)} ↔ ${this.nodeName(relation.to)}`));
    }
    shell.append(main);
  }

  renderZoom(stage) {
    const controls = dom('div', 'kc-zoom');
    // The magnet is the sticky snap switch; Alt is only the temporary override.
    const magnet = dom('button', 'kc-snap-toggle');
    magnet.type = 'button';
    magnet.setAttribute('aria-label', '吸附对齐');
    magnet.title = this.snapEnabled ? '吸附对齐已开启（按住 Alt 临时关闭）' : '吸附对齐已关闭';
    magnet.classList.toggle('is-active', this.snapEnabled);
    setIcon(magnet, 'magnet');
    const syncMagnet = () => {
      magnet.setAttribute('aria-pressed', String(this.snapEnabled));
      magnet.classList.toggle('is-active', this.snapEnabled);
      magnet.title = this.snapEnabled ? '吸附对齐已开启（按住 Alt 临时关闭）' : '吸附对齐已关闭';
    };
    syncMagnet();
    magnet.addEventListener('click', () => {
      this.snapEnabled = !this.snapEnabled;
      syncMagnet();
      new Notice(this.snapEnabled ? '吸附已开启' : '吸附已关闭');
    });
    controls.append(magnet);
    const locate = dom('button', 'kc-locate');
    locate.type = 'button';
    locate.setAttribute('aria-label', '定位画布内容');
    locate.title = '定位画布内容';
    setIcon(locate, 'locate-fixed');
    locate.addEventListener('click', () => this.locateContent());
    controls.append(locate);
    for (const [label, delta] of [['−', -0.2], ['＋', 0.2]]) {
      const button = dom('button', '', label); button.type = 'button'; button.setAttribute('aria-label', delta > 0 ? '放大' : '缩小');
      button.addEventListener('click', () => { this.viewport = zoomAt({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 }, delta, this.viewport); this.render(); });
      controls.append(button);
    }
    controls.append(dom('span', '', `${Math.round(this.viewport.scale * 100)}%`));
    stage.append(controls);
  }

  /** Fits every card in view; an empty canvas says so instead of jumping nowhere. */
  locateContent() {
    if (!this.stage) return false;
    const bounds = boardContentBounds(this.board.nodes);
    const next = bounds ? fitViewport(bounds, { width: this.stage.clientWidth, height: this.stage.clientHeight }) : null;
    if (!next) { new Notice('画布暂无内容'); return false; }
    this.viewport = next;
    this.render();
    return true;
  }

  /**
   * Applies a layout to the current selection only. Nothing is written unless the board
   * save succeeds, and the live board is untouched until then.
   */
  async applyLayoutCommand(command) {
    if (!this.isWritable()) return false;
    if (!this.selected.size) { new Notice('请先选择要整理的卡片'); return false; }
    const selection = new Set(this.selected);
    if (!layoutUnits(this.board.nodes, selection).length) { new Notice('当前选择没有可整理的卡片'); return false; }
    // Clone inside the queue: a concurrent excerpt timestamp write must not be overwritten
    // by a layout computed from a board that predates it.
    return this.mutateBoard((next) => {
      const units = layoutUnits(next.nodes, selection);
      if (!units.length) return false;
      applyLayoutPatch(units, layoutPatch(units, command));
      return true;
    }, '布局失败');
  }

  fileNodes() {
    return this.board.nodes.filter((node) => !isGroupNode(node));
  }

  filteredNodes() {
    const cards = this.fileNodes();
    return this.search ? cards.filter((node) => cardSearchText(node).includes(this.search)) : cards;
  }

  localPoint(event) {
    const rect = this.stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onPointerMove(event) {
    if (!this.gesture) return;
    if (this.gesture.kind === 'move' || this.gesture.kind === 'group-move') {
      const point = screenToWorld(this.localPoint(event), this.viewport);
      const dx = point.x - this.gesture.start.x; const dy = point.y - this.gesture.start.y;
      this.gesture.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      applyDrag(this.gesture.nodes, dx, dy);
      // Alt is the temporary bypass; the magnet switch is the sticky one.
      if (this.snapEnabled && !event.altKey) this.snapGesture();
      else this.hideGuides();
      this.updateWorld();
    } else if (this.gesture.kind === 'resize') {
      const base = this.gesture.nodes[0];
      const dx = (event.clientX - this.gesture.start.x) / this.viewport.scale;
      const dy = (event.clientY - this.gesture.start.y) / this.viewport.scale;
      base.node.width = Math.max(220, base.width + dx);
      base.node.height = Math.max(140, base.height + dy);
      this.updateWorld();
    } else if (this.gesture.kind === 'marquee') {
      const point = this.localPoint(event);
      this.drawMarquee(worldToScreen(this.gesture.start, this.viewport), point);
      const rect = rectFromPoints(this.gesture.start, screenToWorld(point, this.viewport));
      this.applySelection(marqueeSelection(this.board.nodes, rect, { base: this.gesture.base }));
    } else if (this.gesture.kind === 'pan') {
      this.viewport.x = this.gesture.viewport.x + event.clientX - this.gesture.start.x;
      this.viewport.y = this.gesture.viewport.y + event.clientY - this.gesture.start.y;
      const world = this.stage?.querySelector('.kc-world');
      if (world) world.style.transform = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;
    }
  }

  onPointerUp(event) {
    if (!this.gesture) return;
    const gesture = this.gesture;
    this.gesture = null;
    this.hideGuides();
    // Board writes queued during the gesture may now observe the final geometry.
    this.releaseGestureIdle();
    if (gesture.kind === 'marquee') {
      this.clearMarquee();
      return;
    }
    if (gesture.kind === 'connect') {
      const target = event.target.closest?.('.kc-card')?.dataset.nodeId;
      if (target && target !== gesture.from) void this.createEdgeBetween(gesture.from, target);
    } else if (['move', 'resize', 'group-move'].includes(gesture.kind)) {
      this.suppressCardOpen = gesture.kind === 'move' && gesture.moved;
      this.finishGeometryGesture(gesture);
    }
  }

  /**
   * The system cancelled the pointer (touch interruption, window blur, a native drag taking
   * over). The gesture is abandoned: geometry gestures restore their snapshot, a pan
   * restores the viewport, and every transient overlay is removed. Without this a later
   * pointermove would keep moving cards and the next pointerup would save the wrong place.
   */
  onPointerCancel() {
    const gesture = this.gesture;
    this.gesture = null;
    this.releaseGestureIdle();
    this.hideGuides();
    this.clearMarquee();
    if (!gesture) return;
    const { restored } = cancelGestureGeometry(this.board, gesture);
    if (isPanGesture(gesture)) {
      this.viewport = { ...gesture.viewport };
      this.render();
      return;
    }
    if (restored) this.render();
  }

  /**
   * A member's geometry changed, so its frame has to re-wrap. The final geometry is captured
   * as an id-based patch and applied to the *latest* clone inside the queue: a save that was
   * already in flight when the drag started must not swallow the new positions.
   */
  async finishGeometryGesture(gesture) {
    if (gesture.kind !== 'group-move') this.reflowGroupsFor(new Set(gesture.nodes.map((item) => item.node.id)));
    const patch = this.geometryPatchFor(gesture.nodes);
    const done = await this.mutateBoard((next) => this.applyGeometryPatch(next, patch), '画板保存失败，已恢复拖动前的位置');
    if (!done) {
      this.restoreGeometryFrom(gesture.nodes);
      this.render();
    }
  }

  /** Final geometry of every dragged node plus any frame that reflowed around a member. */
  geometryPatchFor(items) {
    const ids = new Set((items ?? []).map((item) => item.node.id));
    for (const group of this.board.nodes.filter(isGroupNode)) {
      if (group.members.some((id) => ids.has(id))) ids.add(group.id);
    }
    const patch = [];
    for (const id of ids) {
      const node = this.board.nodes.find((candidate) => candidate.id === id);
      if (node) patch.push({ id, x: node.x, y: node.y, width: node.width, height: node.height });
    }
    return patch;
  }

  applyGeometryPatch(board, patch) {
    let changed = false;
    for (const entry of patch ?? []) {
      const node = board.nodes.find((candidate) => candidate.id === entry.id);
      if (!node) continue;
      node.x = entry.x;
      node.y = entry.y;
      node.width = entry.width;
      node.height = entry.height;
      changed = true;
    }
    return changed;
  }

  updateWorld() {
    const world = this.stage?.querySelector('.kc-world');
    if (!world) return;
    for (const element of world.querySelectorAll('.kc-card')) {
      const node = this.board.nodes.find((candidate) => candidate.id === element.dataset.nodeId);
      if (!node) continue;
      element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; element.style.width = `${node.width}px`; element.style.height = `${renderedNodeHeight(node)}px`;
    }
    for (const element of world.querySelectorAll('.kc-group')) {
      const group = this.board.nodes.find((candidate) => candidate.id === element.dataset.groupId);
      if (!group) continue;
      element.style.left = `${group.x}px`; element.style.top = `${group.y}px`; element.style.width = `${group.width}px`; element.style.height = `${group.height}px`;
    }
  }

  updateSelection() {
    for (const card of this.stage?.querySelectorAll('.kc-card') ?? []) card.classList.toggle('is-selected', this.selected.has(card.dataset.nodeId));
    for (const frame of this.stage?.querySelectorAll('.kc-group') ?? []) frame.classList.toggle('is-selected', this.selected.has(frame.dataset.groupId));
  }

  /** Applies a computed selection; only a real membership change repaints classes. */
  applySelection(next) {
    const changed = next.size !== this.selected.size || [...next].some((id) => !this.selected.has(id));
    this.selected = next;
    if (changed) {
      this.updateSelection();
      this.refreshTools();
    }
  }

  /** Draws the marquee band in stage coordinates; it is decoration only, never data. */
  drawMarquee(from, to) {
    if (!this.stage) return;
    if (!this.marqueeEl) {
      this.marqueeEl = dom('div', 'kc-marquee');
      this.marqueeEl.setAttribute('aria-hidden', 'true');
      this.stage.append(this.marqueeEl);
    }
    this.marqueeEl.style.left = `${Math.min(from.x, to.x)}px`;
    this.marqueeEl.style.top = `${Math.min(from.y, to.y)}px`;
    this.marqueeEl.style.width = `${Math.abs(to.x - from.x)}px`;
    this.marqueeEl.style.height = `${Math.abs(to.y - from.y)}px`;
  }

  clearMarquee() {
    this.marqueeEl?.remove();
    this.marqueeEl = null;
  }

  /**
   * Snaps the dragged geometry against every stationary card and frame. The offset is
   * recomputed from the pointer on every move, so leaving a snap line is drift-free.
   */
  snapGesture() {
    const items = this.gesture?.nodes ?? [];
    if (!items.length) return;
    const moving = items.map((item) => item.node);
    const movingIds = new Set(moving.map((node) => node.id));
    const result = snapRect(dragBounds(moving), snapLines(this.board.nodes, movingIds), {
      threshold: snapThreshold(this.viewport.scale),
    });
    if (result.dx || result.dy) {
      for (const item of items) {
        item.node.x += result.dx;
        item.node.y += result.dy;
      }
    }
    this.showGuides(result);
  }

  /** Alignment guides are decoration in stage coordinates and vanish with the drag. */
  showGuides({ guideX, guideY }) {
    this.hideGuides();
    if (!this.stage) return;
    const add = (position, axis) => {
      const line = dom('div', `kc-snap-guide kc-snap-guide--${axis}`);
      line.setAttribute('aria-hidden', 'true');
      if (axis === 'v') line.style.left = `${worldToScreen({ x: position, y: 0 }, this.viewport).x}px`;
      else line.style.top = `${worldToScreen({ x: 0, y: position }, this.viewport).y}px`;
      this.stage.append(line);
      this.guideEls.push(line);
    };
    if (Number.isFinite(guideX)) add(guideX, 'v');
    if (Number.isFinite(guideY)) add(guideY, 'h');
  }

  hideGuides() {
    for (const line of this.guideEls) line.remove();
    this.guideEls = [];
  }

  onWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) this.viewport = zoomAt(this.localPoint(event), -event.deltaY * 0.002, this.viewport);
    else { this.viewport.x -= event.deltaX; this.viewport.y -= event.deltaY; }
    this.render();
  }

  onDrop(event) {
    event.preventDefault();
    const transfer = event.dataTransfer;
    let raw = transfer?.getData('text/plain')?.trim() || transfer?.getData('text/uri-list')?.trim();
    try {
      const payload = JSON.parse(transfer?.getData('application/json') || '{}');
      raw ||= payload.path || payload.file?.path;
    } catch { /* unstructured drag data */ }
    raw = raw?.replace(/^\[\[|\]\]$/g, '').replace(/^file:\/\//, '');
    const path = raw?.replace(/^obsidian:\/\/open\?[^#]*file=/, '');
    let decoded = path;
    try { decoded = path ? decodeURIComponent(path) : path; } catch { decoded = path; }
    const file = decoded ? this.app.vault.getAbstractFileByPath(decoded) : null;
    if (file?.path?.endsWith('.md')) this.addFile(file, screenToWorld(this.localPoint(event), this.viewport));
    else new Notice('请通过文件菜单“加入知识画板”，或拖入 Markdown 路径。');
  }

  onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.editor) this.editor.handleEscape();
      else if (this.toolEntry.expanded) this.setToolEntryExpanded(false);
      else if (this.selected.size) { this.selected.clear(); this.updateSelection(); this.refreshTools(); }
      return;
    }
    // Select-all belongs to the canvas unless a text control is focused.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !this.isTextEntryTarget(event.target)) {
      event.preventDefault();
      this.applySelection(selectAllIds(this.board.nodes));
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selected.size) { event.preventDefault(); this.removeSelection(); }
    if (event.key === 'Enter' && this.selected.size === 1) {
      const node = this.board.nodes.find((candidate) => this.selected.has(candidate.id) && !isGroupNode(candidate));
      if (node) this.openNode(node);
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
      const node = this.board.nodes.find((candidate) => this.selected.has(candidate.id) && !isGroupNode(candidate));
      if (node) this.openEditor(node, true);
    }
  }

  async createSticky(point) {
    if (!this.isWritable()) return;
    const result = await requestInput(this.app, {
      title: '新建便利贴',
      submitLabel: '创建便利贴',
      validate: (values) => (normalizeStickyNote(values) ? null : '标题不能为空'),
      fields: [
        { key: 'title', label: '标题' },
        { key: 'body', label: '内容', multiline: true, placeholder: '可稍后在浮动窗口继续编辑' },
      ],
    });
    if (!result) return;
    const note = normalizeStickyNote(result);
    if (!note) { new Notice('标题不能为空'); return; }
    const { title, body } = note;
    const create = async () => {
      // A board-local folder wins over the plugin-wide one; importing an existing note
      // never moves it, so only new stickies are affected.
      const file = await this.plugin.repository.createNote(title, body, { folder: boardNoteFolder(this.board) ?? undefined });
      await this.addFile(file, point, { sticky: true });
      const node = this.board.nodes.find((candidate) => candidate.file === file.path);
      if (node) this.openEditor(node, true);
    };
    try { await create(); }
    catch (error) { new Notice(`创建失败：${error.message}`); new DraftRecoveryModal(this.app, title, body, create).open(); }
  }

  /** A card opens its own note; an excerpt sticker opens the note it was cut from. */
  openNode(node, edit = false) {
    // A bare canvas text node has no Markdown behind it, so there is nothing to open.
    if (isTextNode(node) && !isExcerptNode(node)) return false;
    return this.openEditor(node, edit);
  }

  async openEditor(node, edit = false) {
    if (this.editor && !(await this.editor.close())) return;
    const excerpt = isExcerptNode(node);
    const filePath = excerpt
      ? (excerptSourcePath(node.kcExcerpt) ?? node.kcExcerpt.sourceFile)
      : node.file;
    try {
      const current = await this.plugin.repository.read(filePath);
      const frontmatter = this.app.metadataCache.getFileCache(current.file)?.frontmatter ?? {};
      const readFlow = toReadFlowCard(current.file, current.content, frontmatter);
      const sourceLink = typeof frontmatter.book === 'string' ? frontmatter.book.replace(/^\[\[|\]\]$/g, '').split('|')[0] : '';
      const sourceFile = sourceLink ? this.app.metadataCache.getFirstLinkpathDest(sourceLink, current.file.path) : null;
      this.editor = new FloatingEditor({
        host: this.contentEl,
        repository: this.plugin.repository,
        filePath,
        readFlow,
        readFlowFrontmatter: readFlow ? frontmatter : null,
        excerptAnchor: excerpt ? node.kcExcerpt : null,
        relations: this.board.edges.filter((edge) => edge.fromNode === node.id || edge.toNode === node.id),
        renderMarkdown: (content, host, path) => MarkdownRenderer.render(this.app, content, host, path, this),
        openSource: () => this.app.workspace.getLeaf(false).openFile(sourceFile ?? current.file),
        onTextContextMenu: (payload) => this.openTextContextMenu(payload),
        // The handler returns the sync promise: EditorSession awaits it, so "saved" means
        // the excerpt timestamp write finished too.
        onSourceSaved: createSourceSavedHandler((info) => this.syncExcerptTimestampsOnSave(info)),
        onClose: () => { this.editor = null; },
      });
      await this.editor.open();
      if (edit) this.editor.toggleEdit();
    } catch (error) { new Notice(`无法打开：${error.message}`); }
  }

  /**
   * The menu the editor shows at the caret. A selection gets the formatting entries;
   * without one, only the paragraph timestamp remains — no selection is required.
   */
  openTextContextMenu({ event, intent }) {
    const editor = this.editor;
    if (!editor) return;
    const menu = new Menu();
    const offset = intent ? Math.min(intent.start, intent.end) : editor.textState().start;
    menu.addItem((item) => item.setTitle('添加时间戳').onClick(() => this.addTimestampAtCursor(offset)));
    if (!intent) {
      menu.showAtMouseEvent(event);
      return;
    }
    menu.addSeparator();
    const apply = (transform) => editor.applyTextTransform((state) => transform({ ...state, start: intent.start, end: intent.end }));
    menu.addItem((item) => item.setTitle('生成摘录贴纸').onClick(() => this.createExcerptFromIntent(intent)));
    menu.addSeparator();
    for (const [title, marker] of [['加粗', BOLD_MARKER], ['斜体', ITALIC_MARKER], ['高亮', HIGHLIGHT_MARKER], ['行内代码', CODE_MARKER]]) {
      menu.addItem((item) => item.setTitle(title).onClick(() => apply((state) => toggleInlineFormat(state, marker))));
    }
    menu.addSeparator();
    for (const [title, prefix] of [['引用', QUOTE_PREFIX], ['无序列表', LIST_PREFIX]]) {
      menu.addItem((item) => item.setTitle(title).onClick(() => apply((state) => toggleLinePrefix(state, prefix))));
    }
    menu.addSeparator();
    for (const level of HEADING_LEVELS) {
      const label = level === 0 ? '正文' : `H${level}`;
      menu.addItem((item) => item.setTitle(`标题：${label}`).onClick(() => apply((state) => setHeading(state, level))));
    }
    menu.showAtMouseEvent(event);
  }

  /**
   * Marks the paragraph at `offset`. The marker is written through the editor session, so
   * auto-save, conflict detection and recovery all still apply; a paragraph that already
   * has a marker is reported instead of being marked twice.
   */
  addTimestampAtCursor(offset = this.editor?.textState().start ?? 0) {
    const editor = this.editor;
    if (!editor) return false;
    if (!this.isWritable()) return false;
    const result = addParagraphTimestamp(editor.session.text, offset);
    if (!result) { new Notice('光标不在可标记的段落内'); return false; }
    if (!result.added) { new Notice('该段落已有时间戳'); return false; }
    return editor.applyTextTransform(() => ({ text: result.text, start: offset, end: offset }));
  }

  /**
   * Runs after the source Markdown saved successfully. An excerpt whose quote can still be
   * located keeps its timestamps; one that can no longer be found gets the same save-time
   * `updatedAt`. The Markdown is already on disk and is never touched here — a failed board
   * save only reports the partial success and leaves the board retryable.
   */
  async syncExcerptTimestampsOnSave({ filePath, content, savedAt } = {}) {
    if (!this.isWritable() || !savedAt) return false;
    // Runs through the same queue and reads the latest board, so a layout or import that
    // landed while the Markdown was saving is never overwritten by a stale clone.
    return this.mutateBoard((next) => {
      const staleIds = new Set(staleExcerptIds(next.nodes, filePath, content));
      if (!staleIds.size) return false;
      markExcerptsUpdated(next.nodes, staleIds, savedAt);
      return true;
    }, '正文已保存，但摘录更新时间未写入');
  }

  /**
   * Creates a sticker from the editor's selection. Nothing is written unless the board
   * save succeeds, so a failure leaves both the canvas and the source Markdown untouched.
   */
  async createExcerptFromIntent(intent) {
    if (!this.isWritable()) return false;
    // The source Markdown is the single source of truth: a sticker may only be created once
    // the editor has no unsaved changes left, so a later save failure or conflict cannot
    // leave the canvas pointing at text that never reached disk.
    if (this.editor && !(await this.editor.flushPending())) {
      new Notice('源文件还有未保存的修改，已取消创建摘录');
      return false;
    }
    const anchor = this.editor?.excerptAnchorFor(intent);
    if (!anchor) { new Notice('请先选中一段非空文本'); return false; }
    const done = await this.mutateBoard((next) => {
      const source = next.nodes.find((node) => isFileNode(node) && node.file === anchor.sourceFile) ?? null;
      const existing = next.nodes
        .filter((node) => isExcerptNode(node) && node.kcExcerpt.sourceFile === anchor.sourceFile).length;
      next.nodes.push(createExcerptNode({
        text: excerptTextFromQuote(anchor.quote),
        point: nextExcerptPoint(source, existing),
        anchor,
      }));
      return true;
    }, '创建摘录失败');
    if (done) new Notice('已生成摘录贴纸');
    return done;
  }

  /** Every layout entry the menus offer, in one place so canvas and card menus agree. */
  appendLayoutItems(menu, { disabled = false } = {}) {
    for (const [command, title, icon] of LAYOUT_MENU_ITEMS) {
      menu.addItem((item) => item
        .setTitle(title)
        .setIcon(icon)
        .setDisabled(disabled)
        .onClick(() => this.applyLayoutCommand(command)));
    }
  }

  appendAlignItems(menu, { disabled = false } = {}) {
    for (const [command, title] of ALIGN_MENU_ITEMS) {
      menu.addItem((item) => item
        .setTitle(title)
        .setDisabled(disabled)
        .onClick(() => this.applyLayoutCommand(command)));
    }
  }

  appendDistributeItems(menu, { disabled = false } = {}) {
    for (const [command, title] of DISTRIBUTE_MENU_ITEMS) {
      menu.addItem((item) => item
        .setTitle(title)
        .setDisabled(disabled)
        .onClick(() => this.applyLayoutCommand(command)));
    }
  }

  /** Right-click on blank canvas: select-all, layout and the snap switch. */
  canvasMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const hasSelection = this.selected.size > 0;
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle('全选')
      .setIcon('box-select')
      .onClick(() => this.applySelection(selectAllIds(this.board.nodes))));
    menu.addSeparator();

    // A real submenu when the Obsidian version supports one; otherwise the three layout
    // commands stay directly reachable instead of disappearing behind an inert entry.
    const layoutMenu = new Menu();
    this.appendLayoutItems(layoutMenu, { disabled: !hasSelection });
    let submenu = false;
    menu.addItem((item) => {
      item.setTitle('布局').setIcon('layout-grid');
      if (typeof item.setSubmenu === 'function') {
        item.setSubmenu(layoutMenu);
        submenu = true;
      } else {
        item.setDisabled(!hasSelection);
      }
    });
    if (!submenu) this.appendLayoutItems(menu, { disabled: !hasSelection });

    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle('吸附对齐')
      .setIcon('magnet')
      .setChecked(this.snapEnabled)
      .onClick(() => {
        this.snapEnabled = !this.snapEnabled;
        new Notice(this.snapEnabled ? '吸附已开启' : '吸附已关闭');
      }));
    menu.showAtMouseEvent(event);
  }

  /** Right-click with a multi-selection: grouping plus the full arrange toolkit. */
  multiSelectMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const selectedGroups = this.board.nodes.filter((node) => isGroupNode(node) && this.selected.has(node.id));
    const grouped = new Set(this.board.nodes.filter(isGroupNode).flatMap((group) => group.members));
    const ungrouped = this.board.nodes.filter((node) => this.selected.has(node.id) && !isGroupNode(node) && !grouped.has(node.id));
    const menu = new Menu();
    if (!selectedGroups.length && ungrouped.length >= 2) {
      menu.addItem((item) => item.setTitle('编组').setIcon('group').onClick(() => this.createGroupFromSelection()));
    }
    if (selectedGroups.length) {
      menu.addItem((item) => item
        .setTitle(selectedGroups.length > 1 ? `解除 ${selectedGroups.length} 个分组` : '解除分组')
        .onClick(() => this.ungroupSelection(selectedGroups.map((group) => group.id))));
    }
    menu.addSeparator();
    this.appendLayoutItems(menu);
    menu.addSeparator();
    this.appendAlignItems(menu);
    menu.addSeparator();
    this.appendDistributeItems(menu, { disabled: this.selected.size < 3 });
    menu.showAtMouseEvent(event);
  }

  /** Right-click on a group frame. */
  groupMenu(event, group) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selected.has(group.id)) {
      this.selected = new Set([group.id]);
      this.updateSelection();
      this.refreshTools();
    }
    if (this.selected.size > 1) { this.multiSelectMenu(event); return; }
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('解除分组').onClick(() => this.ungroupSelection([group.id])));
    menu.addItem((item) => item.setTitle('删除分组框').onClick(() => this.removeGroup(group.id)));
    menu.showAtMouseEvent(event);
  }

  /** Right-click on a card. Deletion reuses the one safe removal chain, never a bypass. */
  nodeMenu(event, node) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selected.has(node.id)) {
      this.selected = new Set([node.id]);
      this.updateSelection();
      this.refreshTools();
    }
    // A multi-selection gets the arrange toolkit, not the single-card menu.
    if (this.selected.size > 1) { this.multiSelectMenu(event); return; }
    const menu = new Menu();
    const collapseTitle = node.collapsed === true ? '展开' : '折叠';
    menu.addItem((item) => item.setTitle('颜色').setIcon('palette').onClick(() => this.openColorPicker(node)));
    menu.addSeparator();
    if (isExcerptNode(node)) {
      menu.addItem((item) => item.setTitle('回到原文').onClick(() => this.openNode(node)));
      menu.addItem((item) => item.setTitle(collapseTitle).onClick(() => this.toggleCollapsed(node.id)));
    } else if (isTextNode(node)) {
      menu.addItem((item) => item.setTitle(collapseTitle).onClick(() => this.toggleCollapsed(node.id)));
    } else {
      menu.addItem((item) => item.setTitle('预览').onClick(() => this.openEditor(node)));
      menu.addItem((item) => item.setTitle('编辑').onClick(() => this.openEditor(node, true)));
      menu.addItem((item) => item.setTitle(collapseTitle).onClick(() => this.toggleCollapsed(node.id)));
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('从画布移除').onClick(() => this.removeNodes([node.id])));
    menu.showAtMouseEvent(event);
  }

  cardElement(id) {
    return [...(this.stage?.querySelectorAll('.kc-card') ?? [])].find((card) => card.dataset.nodeId === id) ?? null;
  }

  focusCard(id) {
    this.cardElement(id)?.focus();
  }

  /** Opens the colour popover anchored to the card; the card regains focus when it closes. */
  openColorPicker(node) {
    if (!this.colorPicker) return;
    this.colorPicker.open({
      anchorEl: this.cardElement(node.id),
      current: effectiveCardColor(node),
      restoreFocusTo: () => this.focusCard(node.id),
      onSelect: (color) => this.applyCardColor(node.id, color),
    });
  }

  /**
   * Save first, install second: a failed save leaves the live board — and therefore the old
   * colour — exactly as it was, and the Notice explains why.
   */
  async applyCardColor(id, color) {
    if (!this.isWritable()) return false;
    const done = await this.mutateBoard((next) => (setCardColor(next, id, color) ? true : false), '修改颜色失败');
    this.focusCard(id);
    return done;
  }

  /** Creates a relation on the latest board; ids are re-resolved inside the mutator. */
  async createEdgeBetween(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    return this.mutateBoard((next) => {
      const from = next.nodes.find((node) => node.id === fromId);
      const to = next.nodes.find((node) => node.id === toId);
      if (!from || !to) return false;
      next.edges.push(createEdge(from, to));
      return true;
    }, '建立关系失败，已恢复原状');
  }

  /** Every relation property change is addressed by edge id, never by a live object. */
  async updateEdge(edgeId, change, failureLabel) {
    return this.mutateBoard((next) => {
      const edge = next.edges.find((candidate) => candidate.id === edgeId);
      if (!edge) return false;
      return change(edge, next) === false ? false : true;
    }, failureLabel);
  }

  async editEdgeLabel(edge) {
    const result = await requestInput(this.app, {
      title: '编辑关系名称',
      submitLabel: '保存',
      fields: [{ key: 'label', label: '关系名称（可留空）', value: edge.label ?? '' }],
    });
    if (!result) return;
    const label = normalizeEdgeLabel(result);
    await this.updateEdge(edge.id, (target) => {
      if (label) target.label = label;
      else delete target.label;
    }, '修改关系名称失败');
  }

  edgeMenu(event, edge) {
    event.preventDefault();
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('编辑关系名称').onClick(() => this.editEdgeLabel(edge)));
    for (const [title, fromEnd, toEnd] of [['单向 →', 'none', 'arrow'], ['双向 ↔', 'arrow', 'arrow'], ['无方向 —', 'none', 'none']]) {
      menu.addItem((item) => item.setTitle(title).onClick(() => {
        void this.updateEdge(edge.id, (target) => {
          target.fromEnd = fromEnd;
          target.toEnd = toEnd;
        }, '修改关系失败');
      }));
    }
    for (const [title, route] of [['曲线', 'curve'], ['直线', 'straight'], ['折线', 'elbow']]) {
      menu.addItem((item) => item
        .setTitle(`路线：${title}`)
        .setChecked(normalizeEdgeRoute(edge.kcRoute) === route)
        .onClick(() => {
          void this.updateEdge(edge.id, (target, next) => { setEdgeRoute(next, target.id, route); }, '修改关系失败');
        }));
    }
    menu.addItem((item) => item.setTitle(edge.style === 'dashed' ? '改为实线' : '改为虚线').onClick(() => {
      void this.updateEdge(edge.id, (target) => {
        target.style = target.style === 'dashed' ? 'solid' : 'dashed';
      }, '修改关系失败');
    }));
    for (const [title, color] of [['中性色', 'neutral'], ['蓝色', 'blue'], ['绿色', 'green'], ['红色', 'red']]) {
      menu.addItem((item) => item.setTitle(`线条颜色：${title}`).onClick(() => {
        void this.updateEdge(edge.id, (target) => { target.color = color; }, '修改关系失败');
      }));
    }
    // Promoting writes wikilinks into Markdown, so it only applies when both ends are real
    // notes; an excerpt sticker or a bare text card has nothing to write into. Renaming,
    // direction, line style and colour stay available for every relation.
    if (canPromoteToMarkdown(this.board, edge)) {
      if (edge.fromEnd === 'none' && edge.toEnd === 'none') {
        menu.addItem((item) => item.setTitle('以起点同步为 Markdown 双链').onClick(() => this.promote(edge, edge.fromNode)));
        menu.addItem((item) => item.setTitle('以终点同步为 Markdown 双链').onClick(() => this.promote(edge, edge.toNode)));
      } else menu.addItem((item) => item.setTitle('同步为 Markdown 双链…').onClick(() => this.promote(edge)));
    }
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle('删除关系').setIcon('trash-2');
      // Obsidian's Menu has no documented danger style: the icon carries the meaning, and the
      // class is a best-effort tint for themes that provide one.
      item.dom?.classList?.add('mod-warning');
      item.onClick(() => this.requestRemove([edge.id]));
    });
    menu.showAtMouseEvent(event);
  }

  async promote(edge, sourceNode) {
    try {
      const files = {};
      for (const id of [edge.fromNode, edge.toNode]) {
        const node = this.board.nodes.find((candidate) => candidate.id === id);
        files[id] = await this.plugin.repository.read(node.file);
      }
      const preview = previewPromotion(edge, this.board.nodes, files, sourceNode);
      new PromotionModal(this.app, preview, () => applyPromotion(preview, this.plugin.repository)).open();
    } catch (error) { new Notice(`无法生成写入预览：${error.message}`); }
  }

  removeSelection() {
    return this.requestRemove(this.selected);
  }

  removeNodes(ids) {
    this.selected = new Set(ids);
    return this.requestRemove(this.selected);
  }

  /**
   * The single entry point for Delete, Backspace, the card menu, and missing-card
   * cleanup. It never mutates anything until the confirmation resolves.
   */
  async requestRemove(ids) {
    const targetIds = ids instanceof Set ? new Set(ids) : new Set(ids ?? []);
    if (!targetIds.size) return false;
    if (!this.isWritable()) return false;
    const { nodeIds, edgeIds } = classifySelection(this.board, targetIds);
    if (!nodeIds.length && !edgeIds.length) return false;

    // A relation cannot carry a Markdown source, so it is removed without the destructive
    // confirmation and can never offer source deletion.
    if (!nodeIds.length) return this.applyRemoval({ nodeIds: [], edgeIds, filePaths: [] }, []);

    const documents = await this.plugin.collectCanvasDocuments(this.boardPath, this.board);
    const plan = analyzeDelete(this.board, targetIds, documents, {
      isMissing: (path) => !this.app.vault.getAbstractFileByPath(path),
      currentPath: this.boardPath,
    });
    const targets = planTrashTargets(plan);
    const listed = listRemovalTargets(plan);

    const answer = await requestDelete(this.app, {
      count: plan.nodeIds.length,
      names: listed.names,
      extra: listed.extra,
      trashDisabled: targets.disabled,
      trashReason: targets.reason,
    });
    if (!answer) return false;
    // The editor is closed only after the user commits, so cancelling changes nothing.
    if (this.editor && !(await this.editor.close())) return false;
    return this.applyRemoval(plan, answer.trash ? targets.paths : []);
  }

  /**
   * Removes from a clone, persists it, and only then installs it as the live board,
   * so a failed save leaves the board and the selection exactly as they were.
   */
  async applyRemoval(plan, trashPaths) {
    const removedIds = new Set([...(plan.nodeIds ?? []), ...(plan.edgeIds ?? [])]);
    const done = await this.mutateBoard((next) => {
      removeFromBoard(next, removedIds);
      return true;
    }, '移除失败');
    if (!done) return false;
    this.selected.clear();
    this.render();

    if (!plan.nodeIds?.length) {
      new Notice(`已移除 ${plan.edgeIds.length} 条关系`);
      return true;
    }
    if (!trashPaths.length) {
      new Notice(`已移除 ${plan.nodeIds.length} 项`);
      return true;
    }

    // The confirmation dialog may have been open for a while: re-scan every canvas now that
    // the card is gone. A source referenced in the meantime — or a canvas we cannot read —
    // is skipped, never trashed.
    let trashable = trashPaths;
    let blocked = [];
    try {
      const documents = await this.plugin.collectCanvasDocuments(this.boardPath, this.board);
      const recheck = revalidateTrashTargets(trashPaths, documents);
      trashable = recheck.allowed;
      blocked = recheck.blocked;
    } catch (error) {
      trashable = [];
      blocked = trashPaths.map((path) => ({ path, references: [], reason: error.message }));
    }
    if (blocked.length) {
      new Notice(`以下源文件仍被引用或无法确认，已只从画板移除：${blocked.map((item) => item.path).join('、')}`);
    }
    if (!trashable.length) {
      new Notice(`已移除 ${plan.nodeIds.length} 项；未移入废纸篓。`);
      return true;
    }
    const summary = summarizeTrash(await this.plugin.trashSources(trashable));
    new Notice(`已移除 ${plan.nodeIds.length} 项；${summary.message}`);
    return true;
  }

  /** Collapse hides the body only: height, Markdown, relations, and search are untouched. */
  async toggleCollapsed(id) {
    if (!this.isWritable()) return false;
    return this.mutateBoard((next) => {
      const target = findCollapseTarget(next, id);
      if (!target) return false;
      setCollapsed(next, id, !(target.collapsed === true));
      return true;
    }, '折叠失败');
  }

  reflowGroupsFor(nodeIds) {
    for (const group of this.board.nodes.filter(isGroupNode)) {
      if (group.members.some((id) => nodeIds.has(id))) reflowGroup(this.board, group.id);
    }
  }

  /** Groups are placed in front of their members so the frame always renders behind. */
  async createGroupFromSelection() {
    if (!this.isWritable()) return false;
    const grouped = new Set(this.board.nodes.filter(isGroupNode).flatMap((group) => group.members));
    const members = this.board.nodes.filter((node) => this.selected.has(node.id) && !isGroupNode(node) && !grouped.has(node.id));
    if (members.length < 2) return false;

    const result = await requestInput(this.app, {
      title: '编组',
      submitLabel: '创建分组',
      fields: [{ key: 'label', label: '分组名称（可留空）' }],
    });
    if (!result) return false;

    let group = null;
    let failure = null;
    const done = await this.mutateBoard((next) => {
      // Re-checked against the latest board: a card may have joined a group meanwhile.
      const grouped = new Set(next.nodes.filter(isGroupNode).flatMap((entry) => entry.members));
      const candidates = next.nodes.filter((node) => this.selected.has(node.id) && !isGroupNode(node) && !grouped.has(node.id));
      if (candidates.length < 2) return false;
      try {
        group = createGroup(candidates, result.label);
      } catch (error) {
        failure = error;
        return false;
      }
      next.nodes.unshift(group);
      return true;
    }, '编组失败');
    if (failure) new Notice(`编组失败：${failure.message}`);
    if (!done) return false;
    this.selected = new Set([group.id]);
    this.updateSelection();
    this.refreshTools();
    return true;
  }

  /**
   * Ungrouping only removes frames; cards, relations, and Markdown stay. Accepts one frame
   * or a whole multi-selection, and still commits exactly once.
   */
  async ungroupSelection(groupIds) {
    if (!this.isWritable()) return false;
    const ids = Array.isArray(groupIds) ? groupIds : [groupIds];
    if (!ids.length) return false;
    let removed = 0;
    const done = await this.mutateBoard((next) => {
      removed = 0;
      for (const id of ids) if (ungroup(next, id)) removed += 1;
      return removed > 0;
    }, '解除分组失败');
    if (!done) return false;
    this.selected = new Set();
    this.updateSelection();
    this.refreshTools();
    new Notice(removed > 1 ? `已解除 ${removed} 个分组` : '已解除分组');
    return true;
  }

  /** A group frame goes through the same confirmation and never offers source deletion. */
  removeGroup(groupId) {
    return this.requestRemove([groupId]);
  }

  /**
   * The only way to change a board. The queue guarantees that the clone is taken from the
   * latest board — never from a copy made before the queue — so a colour change, collapse,
   * grouping, excerpt or import cannot resurrect a board that predates another write.
   * A mutator returning `false` aborts without writing.
   */
  async mutateBoard(mutator, failureLabel) {
    // The board file is captured now: a queued write must target the canvas it was made
    // for, even if the surface switches boards before the task reaches the queue head.
    const boardPath = this.boardPath;
    try {
      return await runBoardMutation(this.boardMutations, {
        read: () => this.board,
        commit: (next) => this.installBoard(next, failureLabel, boardPath),
        before: () => this.whenGestureIdle(),
      }, (next) => (this.boardPath === boardPath ? mutator(next) : false));
    } catch (error) {
      if (error?.code === BOARD_WRITES_PAUSED) {
        // A lifecycle change (switch/close/hand-off) refuses new writes on purpose.
        new Notice('画板正在切换或关闭，本次修改未保存');
        return false;
      }
      throw error;
    }
  }

  /** Ends a live gesture through the same path as pointercancel (geometry restored). */
  cancelActiveGesture() {
    if (!this.gesture) return false;
    this.onPointerCancel();
    return true;
  }

  /**
   * Waits for work that is queued but has not reached BoardStore yet, then for BoardStore
   * itself. Callers that must be exclusive pause the queue first, so an edit made while the
   * drain runs is refused instead of queueing behind the captured tail.
   */
  async drainBoardWrites() {
    // A half-finished drag must be abandoned, not frozen and saved as if it were final.
    this.cancelActiveGesture();
    await this.boardMutations.idle();
    await this.plugin.boardStore.flush();
  }

  /** A board write must never observe a half-dragged board. */
  whenGestureIdle() {
    if (!this.gesture) return Promise.resolve();
    if (!this.gestureIdle) {
      this.gestureIdle = new Promise((resolve) => { this.gestureIdleResolve = resolve; });
    }
    return this.gestureIdle;
  }

  releaseGestureIdle() {
    this.gestureIdleResolve?.();
    this.gestureIdle = null;
    this.gestureIdleResolve = null;
  }

  /** Restores a snapshot; `restoreGeometry` already resolves nodes by id. */
  restoreGeometryFrom(snapshot) {
    restoreGeometry(this.board, snapshot ?? []);
  }

  /** The unqueued half of a commit; only callers already inside the mutation queue use it. */
  async installBoard(next, failureLabel, boardPath = this.boardPath) {
    try {
      await this.plugin.boardStore.save(boardPath, next, { token: this });
    } catch (error) {
      new Notice(`${failureLabel}，画板未改动：${error.message}`);
      return false;
    }
    // A write for a canvas this surface no longer shows is still valid on disk, but it must
    // not replace the board that is now on screen.
    if (this.boardPath === boardPath) {
      this.board = next;
      this.render();
    }
    return true;
  }

  /**
   * A read-only scan plus one board mutation. Cancelling the picker changes nothing,
   * and a failed save keeps the previous board and selection.
   */
  async importReadFlow() {
    if (!this.isWritable()) return false;
    if (this.readflowButton) this.readflowButton.disabled = true;
    const scanning = new Notice('正在扫描 ReadFlow 摘录…', 0);
    let scan;
    try {
      scan = await this.plugin.scanReadFlowCandidates();
    } catch (error) {
      new Notice(`扫描失败：${error.message}`);
      return false;
    } finally {
      scanning.hide();
      if (this.readflowButton) this.readflowButton.disabled = false;
    }

    const existingPaths = this.board.nodes.filter(isFileNode).map((node) => node.file);
    const answer = await requestReadFlowImport(this.app, {
      candidates: scan.candidates,
      existingPaths,
      skipped: scan.skipped,
    });
    if (!answer) return false;
    return this.applyReadFlowImport(answer.paths, scan);
  }

  async applyReadFlowImport(selectedPaths, scan) {
    const byPath = new Map(scan.candidates.map((candidate) => [candidate.path, candidate]));
    const chosen = (selectedPaths ?? []).map((path) => byPath.get(path)).filter(Boolean);
    if (!chosen.length) return false;

    let placed = 0;
    let alreadyOnBoard = 0;
    let missing = 0;
    const done = await this.mutateBoard((next) => {
      // The Vault and the board are both re-read here: a rename or removal may have landed
      // while the picker was open, and only the latest board can answer "already there?".
      const live = chosen.filter((candidate) => this.app.vault.getAbstractFileByPath(candidate.path)?.extension === 'md');
      missing = chosen.length - live.length;
      const onBoard = new Set(next.nodes.filter(isFileNode).map((node) => node.file));
      const candidates = live.filter((candidate) => !onBoard.has(candidate.path));
      alreadyOnBoard = live.length - candidates.length;
      if (!candidates.length) return false;
      const placements = layoutReadFlowCandidates(candidates, next.nodes);
      for (const { candidate, point } of placements) next.nodes.push(createFileNode(candidate.path, point));
      placed = placements.length;
      return true;
    }, '导入失败');
    if (!done) {
      new Notice(`没有新增卡片：已存在 ${alreadyOnBoard} 个，失败 ${missing} 个。`);
      return false;
    }
    new Notice(`已加入 ${placed} 张卡片；已存在 ${alreadyOnBoard} 个；跳过 ${missing + scan.skipped.length} 个。`);
    return true;
  }
  nodeName(id) {
    const node = this.board.nodes.find((candidate) => candidate.id === id);
    return node ? cardLabel(node) || id : id;
  }

  /** Re-targets this surface at another board file (embedded + openFullView reuse). */
  async setBoardPath(path) {
    if (!path || path === this.boardPath) return false;
    return this.lifecycles(() => this.performSetBoardPath(path));
  }

  async performSetBoardPath(path) {
    if (!path || path === this.boardPath) return false;
    // Close first: a pending save must finish its timestamp write before the queue pauses.
    if (this.editor && !(await this.editor.close())) return false;
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      const next = await this.plugin.boardStore.load(path);
      this.releaseBoardWriter(this.boardPath);
      this.boardPath = path;
      this.board = next;
      this.selected.clear();
      this.search = '';
      this.loadError = null;
      this.acquireBoardWriter();
      this.render();
      return true;
    } finally {
      this.boardMutations.resume(pause);
    }
  }

  /** Flushes pending board writes without closing the surface. */
  flush() {
    return this.drainBoardWrites();
  }

  /** Tears down the embedded surface: editor, board writes, listeners, and its DOM. */
  async destroy() {
    await this.prepareShutdown();
    for (const cleanup of this._domCleanups) cleanup();
    this._domCleanups = [];
    if (this.embedded) this.contentEl?.remove?.();
  }

  /** Opens the current board in a full Knowledge Canvas leaf. */
  async openFullView() {
    return this.lifecycles(() => this.performOpenFullView());
  }

  async performOpenFullView() {
    // Close the editor before the hand-off: a save in flight must finish its timestamp
    // write while this surface still owns the queue, not after it became read-only.
    if (this.editor && !(await this.editor.close())) {
      new Notice('浮动编辑器仍有未保存内容，已取消打开全屏');
      return false;
    }
    // Pause before draining: a write queued during the hand-off would otherwise target a
    // board this surface no longer owns.
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      await this.plugin.setLastBoardPath(this.boardPath);
      // Hand the write token to the full view before it mounts the same board, so the embedded
      // surface becomes read-only instead of racing the full view with a stale snapshot.
      this.releaseBoardWriter();
      this.render();
      try {
        const view = await this.plugin.activate();
        if (view && view !== this && view.setBoardPath) await view.setBoardPath(this.boardPath);
        return view;
      } catch (error) {
        // If the full view could not open, take the write token back so this surface is not
        // left needlessly read-only.
        this.acquireBoardWriter();
        this.render();
        throw error;
      }
    } finally {
      // The surface stays usable (read-only on success, writable again on failure).
      this.boardMutations.resume(pause);
    }
  }
}
