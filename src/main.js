import { Notice, Plugin, TFolder } from 'obsidian';
import { BOARD_FOLDER, DEFAULT_BOARD_PATH, boardPathForName, isAllowedBoardPath, listManagedBoards, listReadFlowBoards } from './board-catalog.js';
import {
  applyBoardRename,
  canManageBoard,
  isInsideFolderPath,
  rewriteFolderReferences,
  updateReadFlowBindings,
} from './board-management.js';
import { createBoard, updateFilePath } from './board-model.js';
import { createBoardMeta } from './board-meta.js';
import { BoardStore } from './board-store.js';
import { extractCanvasFileReferences } from './delete-plan.js';
import { EMBEDDED_API_VERSION, defaultReadFlowBoardPath } from './embedded-board.js';
import { ensureReadFlowBoardAt } from './readflow-ensure.js';
import { serializeByKey } from './serial-queue.js';
import { EmbeddedBoardController } from './embedded-board-controller.js';
import { destroyEmbeddedControllers, mountEmbeddedController } from './embedded-registry.js';
import { KnowledgeCanvasView, VIEW_TYPE_KNOWLEDGE_CANVAS } from './knowledge-canvas-view.js';
import { MarkdownRepository } from './markdown-repository.js';
import { toReadFlowCandidate } from './readflow-index.js';
import { normalizeNoteFolder, normalizeSettings } from './settings.js';
import { KnowledgeCanvasSettingTab } from './settings-tab.js';

export default class KnowledgeCanvasPlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings(null);
    await this.loadSettings();
    this.apiVersion = EMBEDDED_API_VERSION;
    this.repository = new MarkdownRepository(this.app.vault, this.settings.noteFolder);
    this.boardStore = new BoardStore({
      read: async (path) => this.app.vault.read(this.requireFile(path)),
      process: async (path, updater) => this.app.vault.process(this.requireFile(path), updater),
    });

    // Live embedded surfaces and ReadFlow listeners, so a setting toggle can tear them down
    // immediately instead of waiting for the next manual refresh.
    this.embeddedControllers = new Set();
    this.readFlowIntegrationListeners = new Set();
    // Concurrent first opens of the same board share one create instead of racing.
    this.readFlowEnsureQueues = new Map();
    // Renaming a board's note folder fires one Vault rename per file inside it. The view
    // that started the rename rewrites its own references as part of that lifecycle, so its
    // handler must not also queue a (refused, paused) write for every child.
    this.renameSuppressions = new Set();

    this.addSettingTab(new KnowledgeCanvasSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_KNOWLEDGE_CANVAS, (leaf) => new KnowledgeCanvasView(leaf, this));
    this.addRibbonIcon('layout-dashboard', '打开知识画板', () => this.activate());
    this.addCommand({ id: 'open-board', name: 'Open board', callback: () => this.activate() });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file.extension !== 'md') return;
      menu.addItem((item) => item.setTitle('加入知识画板').setIcon('layout-dashboard').onClick(async () => {
        const view = await this.activate();
        await view.addFile(file, { x: 160 + view.board.nodes.length * 28, y: 120 + view.board.nodes.length * 20 });
      }));
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onFileRename(file, oldPath)));
  }

  async onunload() {
    const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS).map((leaf) => leaf.view);
    try {
      // Embedded surfaces are not workspace leaves, so they must be torn down explicitly
      // or a live ReadFlow book would leak its write token across the unload.
      await Promise.all([
        ...views.map((view) => view.prepareShutdown()),
        ...[...this.embeddedControllers].map((controller) => controller.destroy()),
      ]);
      await Promise.all([this.boardStore.flush(), this.repository.flush()]);
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS);
    } catch (error) {
      new Notice(`知识画板仍有未保存内容：${error.message}`);
      throw error;
    }
  }

  async ensureBoard() {
    if (this.app.vault.getAbstractFileByPath(this.boardPath)) return;
    await this.ensureFolder(this.boardPath.split('/').slice(0, -1).join('/'));
    await this.app.vault.create(this.boardPath, JSON.stringify(createBoard(), null, 2));
  }

  async ensureFolder(path) {
    if (!path) return;
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      const folder = parts.slice(0, index).join('/');
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    }
  }

  /** Every managed board plus the legacy default, straight from the file system. */
  listBoards() {
    const paths = this.app.vault.getFiles()
      .filter((file) => file.extension === 'canvas')
      .map((file) => file.path);
    return listManagedBoards(paths);
  }

  /**
   * Every board background maintenance must sweep: managed workspaces plus ReadFlow book
   * canvases. Distinct from `listBoards()` so hiding ReadFlow boards from the switcher
   * never stops a Markdown rename from reaching them.
   */
  listMaintainedBoards() {
    const paths = this.app.vault.getFiles()
      .filter((file) => file.extension === 'canvas')
      .map((file) => file.path);
    return [...listManagedBoards(paths), ...listReadFlowBoards(paths)];
  }

  /**
   * Creates a board. With `createNoteFolder` the board also gets a canvas-local note
   * folder under the global one and records it in `kcMeta`. The folder is created before
   * the board so a failed folder creation cannot leave a half-valid board behind.
   */
  async createBoardFile(name, { createNoteFolder = false } = {}) {
    const path = boardPathForName(name);
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error(`画布已存在：${path}`);
    await this.ensureFolder(BOARD_FOLDER);
    const board = createBoard();
    if (createNoteFolder) {
      const folder = normalizeNoteFolder(`${this.settings.noteFolder}/${name}`);
      await this.repository.ensureFolder(folder);
      board.kcMeta = createBoardMeta({ noteFolder: folder });
    }
    await this.app.vault.create(path, JSON.stringify(board, null, 2));
    return path;
  }

  /** Every Vault `.canvas`, for rename/delete validation against the live file system. */
  listCanvasPaths() {
    return this.app.vault.getFiles()
      .filter((file) => file.extension === 'canvas')
      .map((file) => file.path);
  }

  /** Every Vault file, for the dedicated-folder safety analysis. */
  listFilePaths() {
    return this.app.vault.getFiles().map((file) => file.path);
  }

  /** Every Vault folder, for target-conflict checks. */
  listFolderPaths() {
    return this.app.vault.getAllLoadedFiles()
      .filter((item) => item instanceof TFolder)
      .map((folder) => folder.path)
      .filter(Boolean);
  }

  /**
   * Renames a managed board, optionally moving the note folder that belongs to it.
   *
   * The order is the one the design fixes: verify against the live Vault → rename the folder
   * → rewrite this board's metadata and references → repoint every other board that pointed
   * into the folder → rename the canvas → update settings and live surfaces. A failure after
   * the first move rolls back what moved; a rollback that also fails reports both paths
   * instead of pretending the rename succeeded.
   */
  async renameBoard(plan, { board = null, token = null } = {}) {
    const manage = canManageBoard(plan?.fromPath);
    if (!manage.allowed) throw new Error(manage.reason);
    if (!this.app.vault.getAbstractFileByPath(plan.fromPath)?.stat) throw new Error('画布不存在');
    if (this.app.vault.getAbstractFileByPath(plan.toPath)) throw new Error(`画布已存在：${plan.toPath}`);
    if (plan.noteFolder && this.app.vault.getAbstractFileByPath(plan.noteFolder.to)) {
      throw new Error(`专属笔记文件夹已存在：${plan.noteFolder.to}`);
    }

    const nextBoard = board ? applyBoardRename(board, plan) : board;
    let folderMoved = false;
    let boardSaved = false;
    // Renaming the folder renames every file inside it, and each of those fires a Vault
    // rename event. This view already rewrites its own references below, and its queue is
    // paused for the lifecycle, so its handler is muted for exactly that window.
    const suppression = plan.noteFolder && token ? { folder: plan.noteFolder.from, view: token } : null;
    if (suppression) this.renameSuppressions.add(suppression);
    try {
      if (plan.noteFolder) {
        const folder = this.app.vault.getAbstractFileByPath(plan.noteFolder.from);
        if (folder) {
          await this.app.fileManager.renameFile(folder, plan.noteFolder.to);
          folderMoved = true;
        }
      }
      if (nextBoard && nextBoard !== board) {
        await this.boardStore.save(plan.fromPath, nextBoard, { token });
        boardSaved = true;
      }
      if (folderMoved) await this.repointBoardsForFolder(plan.noteFolder, plan.fromPath);
      await this.app.fileManager.renameFile(
        this.app.vault.getAbstractFileByPath(plan.fromPath),
        plan.toPath,
      );
    } catch (error) {
      const recovery = [];
      if (boardSaved) {
        try {
          await this.boardStore.save(plan.fromPath, board, { token });
        } catch (restoreError) {
          recovery.push(`画布内容恢复失败：${restoreError.message}`);
        }
      }
      if (folderMoved) {
        try {
          await this.app.fileManager.renameFile(
            this.app.vault.getAbstractFileByPath(plan.noteFolder.to),
            plan.noteFolder.from,
          );
        } catch (restoreError) {
          recovery.push(`专属笔记文件夹已重命名为 ${plan.noteFolder.to}，恢复失败：${restoreError.message}`);
        }
      }
      throw new Error(recovery.length ? `${error.message}（${recovery.join('；')}）` : error.message);
    } finally {
      if (suppression) this.renameSuppressions.delete(suppression);
    }

    // The file is where it belongs now; nothing below may fail the rename itself.
    for (const controller of [...this.embeddedControllers]) {
      if (controller.boardPath !== plan.fromPath) continue;
      try {
        await controller.setBoardPath(plan.toPath);
      } catch (error) {
        console.error('知识画板：重命名后未能更新嵌入画板', error);
      }
    }
    const bindings = updateReadFlowBindings(this.settings.readFlowBindings, { from: plan.fromPath, to: plan.toPath });
    if (bindings.changed) this.settings.readFlowBindings = bindings.bindings;
    if (this.settings.lastBoardPath === plan.fromPath) await this.setLastBoardPath(plan.toPath);
    else await this.saveSettings();
    return { path: plan.toPath, name: plan.name, board: nextBoard, folderMoved };
  }

  /**
   * Markdown that lived in the renamed folder keeps its identity only through the paths other
   * boards store, so they follow the move instead of turning into missing cards. Open views
   * and embedded surfaces are skipped: they own their writer and receive the Vault's own
   * rename events.
   */
  async repointBoardsForFolder({ from, to }, exceptPath) {
    const openInViews = new Set();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)) {
      if (leaf.view?.boardPath) openInViews.add(leaf.view.boardPath);
    }
    for (const controller of this.embeddedControllers) openInViews.add(controller.boardPath);

    const failures = [];
    for (const board of this.listMaintainedBoards()) {
      if (board.path === exceptPath || openInViews.has(board.path) || !this.isCanvasFile(board.path)) continue;
      try {
        const data = await this.boardStore.load(board.path);
        const updated = rewriteFolderReferences(data, from, to);
        if (updated !== data) await this.boardStore.save(board.path, updated);
      } catch (error) {
        failures.push(`${board.path}：${error.message}`);
      }
    }
    if (failures.length) new Notice(`部分画布未能更新文件路径：${failures.join('；')}`);
  }

  /**
   * Trashes a managed board and, when the caller proved it safe, its note folder. The canvas
   * goes first: a folder failure must not leave the user with deleted notes and a live board.
   * A live embedded surface on that board is torn down first, or its next save would
   * recreate the file this method just deleted.
   */
  async deleteBoard(path, { deleteNoteFolder = null } = {}) {
    const manage = canManageBoard(path);
    if (!manage.allowed) throw new Error(manage.reason);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file?.stat) throw new Error('画布不存在');

    for (const controller of [...this.embeddedControllers]) {
      if (controller.boardPath !== path) continue;
      try {
        await controller.destroy();
      } catch (error) {
        throw new Error(`嵌入画板仍有未保存内容，已取消删除：${error.message}`);
      }
    }

    await this.app.fileManager.trashFile(file);

    let folder = null;
    if (deleteNoteFolder) {
      const target = this.app.vault.getAbstractFileByPath(deleteNoteFolder);
      if (target) {
        try {
          await this.app.fileManager.trashFile(target);
          folder = { path: deleteNoteFolder, ok: true };
        } catch (error) {
          folder = { path: deleteNoteFolder, ok: false, reason: error.message };
        }
      }
    }

    const bindings = updateReadFlowBindings(this.settings.readFlowBindings, { from: path, to: null });
    if (bindings.changed) this.settings.readFlowBindings = bindings.bindings;
    // Deleting a board always leaves the next open on the default board, which is recreated
    // here when it is missing: the view must never be pointed at a path it cannot load.
    await this.setLastBoardPath(DEFAULT_BOARD_PATH);
    await this.ensureBoard();

    const parts = ['画布已删除'];
    if (folder?.ok) parts.push(`专属笔记文件夹已删除：${folder.path}`);
    if (folder && !folder.ok) parts.push(`专属笔记文件夹未能删除：${folder.path}（${folder.reason}）`);
    return { path, folder, message: parts.join('；') };
  }

  async setLastBoardPath(path) {
    this.boardPath = path;
    this.settings.lastBoardPath = path;
    await this.saveSettings();
    return path;
  }

  /**
   * ReadFlow integration gate. A missing field is treated as enabled, so existing users
   * are never silently cut off before the setting exists.
   */
  isReadFlowIntegrationEnabled() {
    return this.settings?.readFlowIntegrationEnabled !== false;
  }

  /**
   * Ensures a dedicated board exists for one ReadFlow book. The board is created under
   * `Canvas/Knowledge Canvas/ReadFlow/` and seeded with the book's highlights on first
   * creation; a board that already exists gains only the highlight cards it is missing, so
   * highlights synced later still arrive without moving or overwriting anything the user
   * edited. ReadFlow never writes the `.canvas` itself — this is the only path that
   * creates or updates it.
   */
  async ensureReadFlowBoard({ bookId, title, highlightPaths, boardPath } = {}) {
    if (!this.isReadFlowIntegrationEnabled()) return null;
    const path = boardPath ?? this.resolveReadFlowBoardPath({ bookId, title });
    // Serialise per board: two openers that both see "no file yet" would otherwise each
    // run `vault.create()` for the same path and one of them would fail half-way.
    return serializeByKey(this.readFlowEnsureQueues, path, () =>
      ensureReadFlowBoardAt({
        path,
        highlightPaths,
        vault: this.app.vault,
        boardStore: this.boardStore,
        ensureFolder: (folder) => this.ensureFolder(folder),
      }),
    );
  }

  /**
   * The board a ReadFlow book should use: the user's persisted binding when it still points
   * at a real `.canvas`, otherwise the stable default path derived from the book id. A title
   * change therefore never strands the board — the id, not the title, is the key.
   */
  resolveReadFlowBoardPath({ bookId, title } = {}) {
    const binding = this.settings?.readFlowBindings?.[bookId];
    if (binding && this.isCanvasFile(binding)) return binding;
    return defaultReadFlowBoardPath({ bookId, title });
  }

  /**
   * Persists (or clears) the canvas a book is bound to. Pass `null` to restore the default
   * board for the book. The target must be an existing `.canvas`, so a stale or foreign path
   * is rejected instead of being written into settings.
   */
  async bindReadFlowBoard(bookId, boardPath) {
    if (!this.isReadFlowIntegrationEnabled()) return null;
    if (!bookId) throw new Error('ReadFlow book id is required');
    const bindings = { ...(this.settings.readFlowBindings ?? {}) };
    if (boardPath == null || boardPath === '') {
      delete bindings[bookId];
    } else {
      if (!boardPath.toLowerCase().endsWith('.canvas')) throw new Error('绑定的目标必须是 .canvas 文件');
      if (!this.isCanvasFile(boardPath)) throw new Error('目标画布不存在');
      bindings[bookId] = boardPath;
    }
    this.settings.readFlowBindings = bindings;
    await this.saveSettings();
    return boardPath == null || boardPath === '' ? null : boardPath;
  }

  /** Every Vault `.canvas`, for ReadFlow's binding picker. Read-only. */
  listCanvasFiles() {
    return this.app.vault.getFiles()
      .filter((file) => file.extension === 'canvas')
      .map((file) => file.path);
  }

  /**
   * Mounts an embedded board surface into a foreign host element.
   *
   * The controller is registered only after the mount resolves. A mount that throws is
   * destroyed here so its document listeners and writer token are released; the caller
   * receives the original error and never a half-mounted surface it cannot tear down.
   */
  async mountEmbeddedBoard(host, { boardPath, compact = true } = {}) {
    if (!this.isReadFlowIntegrationEnabled()) return null;
    if (!host || !boardPath) throw new Error('mountEmbeddedBoard requires a host element and a boardPath');
    const controller = new EmbeddedBoardController(this, host, { boardPath, compact });
    return mountEmbeddedController(this.embeddedControllers, controller);
  }

  /** Registers a callback fired whenever the ReadFlow integration toggle changes. */
  registerReadFlowIntegrationListener(listener) {
    if (typeof listener !== 'function') return () => {};
    this.readFlowIntegrationListeners.add(listener);
    return () => this.readFlowIntegrationListeners.delete(listener);
  }

  /**
   * Reacts to a ReadFlow integration toggle. Disabling tears down every live embedded
   * surface immediately and tells ReadFlow to fall back to its own knowledge view. Each
   * teardown is awaited so a surface that cannot shut down (an unsaved editor, a failed
   * flush) stays registered and retryable instead of silently leaking its write token.
   */
  async onReadFlowIntegrationChange(enabled) {
    if (!enabled) {
      const failures = await destroyEmbeddedControllers(this.embeddedControllers);
      if (failures.length) console.error('知识画板：部分嵌入面板未能关闭', failures);
    }
    for (const listener of this.readFlowIntegrationListeners) {
      try { await listener(enabled); } catch (error) { console.error('ReadFlow integration listener failed', error); }
    }
  }

  /**
   * Every Vault `.canvas`, read-only, for cross-canvas reference safety. A canvas that
   * cannot be read or understood is reported as an error so the caller stays conservative.
   * Nothing outside the current board is ever written.
   */
  async collectCanvasDocuments(currentPath, currentBoard) {
    const documents = [{ path: currentPath, board: currentBoard }];
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'canvas' || file.path === currentPath) continue;
      try {
        documents.push({ path: file.path, nodes: extractCanvasFileReferences(await this.app.vault.cachedRead(file)) });
      } catch (error) {
        documents.push({ path: file.path, error });
      }
    }
    return documents;
  }

  /**
   * Read-only scan of the Vault's Atomic Markdown. Only the Metadata Cache and the file
   * text are read; ReadFlow's plugin data, cookies, and sync state are never touched.
   * A file that cannot be read is recorded as skipped instead of blocking the batch.
   */
  async scanReadFlowCandidates() {
    // shortcut: full scan is acceptable below 5,000 atomic highlights; add a cached incremental index when a scan exceeds 1 second or files reach 5,000.
    const candidates = [];
    const skipped = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.type !== 'highlight') continue;
      try {
        const candidate = toReadFlowCandidate(file, await this.app.vault.cachedRead(file), frontmatter);
        if (candidate) candidates.push(candidate);
        else skipped.push({ path: file.path, reason: '不是 ReadFlow 摘录' });
      } catch (error) {
        skipped.push({ path: file.path, reason: error.message });
      }
    }
    return { candidates, skipped };
  }

  /** Obsidian Trash only, one file at a time, with an exact per-file outcome. */
  async trashSources(paths) {
    const results = [];
    for (const path of paths) {
      try {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) throw new Error('文件已不存在');
        await this.app.fileManager.trashFile(file);
        results.push({ path, ok: true });
      } catch (error) {
        results.push({ path, ok: false, reason: error.message });
      }
    }
    return results;
  }

  isCanvasFile(path) {
    return this.app.vault.getAbstractFileByPath(path)?.extension === 'canvas';
  }

  /**
   * A remembered board is only honoured when it is the legacy default or lives in the
   * managed folder, and when the file is still there. Anything else falls back safely.
   */
  resolveBoardPath(candidate) {
    if (candidate && isAllowedBoardPath(candidate) && this.isCanvasFile(candidate)) return candidate;
    return DEFAULT_BOARD_PATH;
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
    this.boardPath = this.resolveBoardPath(this.settings.lastBoardPath);
    return this.settings;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.repository) this.repository.setNoteFolder(this.settings.noteFolder);
    return this.settings;
  }

  requireFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file?.stat) throw new Error(`File not found: ${path}`);
    return file;
  }

  async activate() {
    await this.ensureBoard();
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_KNOWLEDGE_CANVAS, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view;
  }

  /** Re-renders every open canvas so a just-saved setting takes effect immediately. */
  refreshOpenViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)) leaf.view.render();
  }

  /**
   * Renaming a Markdown file has to fan out to every managed board, not just the
   * open one. A damaged board reports its reason without stopping the others and
   * without being overwritten.
   */
  async onFileRename(file, oldPath) {
    if (!oldPath.toLowerCase().endsWith('.md') || !file.path.toLowerCase().endsWith('.md')) return;
    const suppressed = (view) => [...this.renameSuppressions]
      .some((entry) => entry.view === view && isInsideFolderPath(oldPath, entry.folder));
    const failures = [];
    const openInViews = new Set();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)) {
      const view = leaf.view;
      openInViews.add(view.boardPath);
      if (suppressed(view)) continue;
      try { await view.handleRename(file, oldPath); }
      catch (error) { failures.push(`${view.boardPath}：${error.message}`); }
    }
    // Embedded ReadFlow surfaces own their board but are not workspace leaves; each one
    // updates its own file so the board's single writer stays intact.
    const handledByControllers = new Set();
    for (const controller of [...this.embeddedControllers]) {
      const boardPath = controller.boardPath;
      handledByControllers.add(boardPath);
      try { await controller.handleRename(file, oldPath); }
      catch (error) { failures.push(`${boardPath}：${error.message}`); }
    }
    for (const board of this.listMaintainedBoards()) {
      if (openInViews.has(board.path) || handledByControllers.has(board.path) || !this.isCanvasFile(board.path)) continue;
      try {
        const data = await this.boardStore.load(board.path);
        if (updateFilePath(data, oldPath, file.path)) await this.boardStore.save(board.path, data);
      } catch (error) {
        failures.push(`${board.path}：${error.message}`);
      }
    }
    if (failures.length) new Notice(`部分画布未能更新文件路径：${failures.join('；')}`);
  }
}
