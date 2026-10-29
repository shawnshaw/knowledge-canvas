/**
 * Owns one embedded `KnowledgeCanvasView` for a ReadFlow book. The view is constructed
 * with a minimal leaf — the surface only needs `app` and a host element — and every
 * controller method delegates to the view so behaviour never forks from the full view.
 */

import { KnowledgeCanvasView } from './knowledge-canvas-view.js';
import { createEmbeddedLeaf } from './embedded-board.js';

export class EmbeddedBoardController {
  constructor(plugin, host, { boardPath, compact = true } = {}) {
    this.plugin = plugin;
    this.host = host;
    this.destroyed = false;
    this.view = new KnowledgeCanvasView(
      createEmbeddedLeaf(plugin.app, host),
      plugin,
      { embedded: true, compact, boardPath },
    );
  }

  async mount() {
    await this.view.attach();
    return this;
  }

  get boardPath() {
    return this.view.boardPath;
  }

  setBoardPath(path) {
    return this.view.setBoardPath(path);
  }

  flush() {
    return this.view.flush();
  }

  openFullView() {
    return this.view.openFullView();
  }

  handleRename(file, oldPath) {
    return this.view.handleRename(file, oldPath);
  }

  /**
   * Tears the embedded surface down. `destroyed` flips only after the view has fully
   * released its writer and flushed, so a failed teardown (an unsaved floating editor, a
   * failed flush) leaves this controller registered and retryable instead of leaking the
   * write token forever. On success it removes itself from the plugin's live set.
   */
  async destroy() {
    if (this.destroyed) return;
    await this.view.destroy();
    this.destroyed = true;
    this.plugin.embeddedControllers?.delete(this);
  }
}
