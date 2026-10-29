import { createExcerptAnchor, locateExcerpt } from './excerpt-anchor.js';
import { FileConflictError } from './markdown-repository.js';
import { stampChangedParagraphs } from './paragraph-timestamp.js';
import { toReadFlowCard } from './readflow-adapter.js';

export function renderWorkspacePreservingEditor(host, editorRoot, renderWorkspace) {
  editorRoot?.remove();
  host.replaceChildren();
  renderWorkspace();
  if (editorRoot) host.append(editorRoot);
}

export function deriveReadFlowPreview(filePath, content, frontmatter) {
  const basename = filePath.split('/').at(-1)?.replace(/\.md$/i, '') ?? '';
  return toReadFlowCard({ path: filePath, basename }, content, frontmatter);
}

export class EditorSession {
  constructor(path, repository, { now = () => new Date(), onSaved = null } = {}) {
    this.path = path;
    this.repository = repository;
    this.now = now;
    this.onSaved = onSaved;
    this.lastSavedAt = null;
    this.text = '';
    // The last text that actually reached disk; paragraph timestamps compare against it.
    this.savedText = '';
    this.mtime = 0;
    this.dirty = false;
    this.status = 'idle';
    this.error = null;
    this.saving = null;
  }

  async load() {
    const current = await this.repository.read(this.path);
    this.text = current.content;
    this.savedText = current.content;
    this.mtime = current.mtime;
    this.dirty = false;
    this.status = 'idle';
    this.error = null;
    return current;
  }

  setText(text) {
    this.text = text;
    this.dirty = true;
  }

  async save() {
    if (this.saving) return this.saving;
    if (!this.dirty) return { mtime: this.mtime };
    // One instant for the whole save: the paragraph marker and the excerpt timestamp of
    // this write must carry exactly the same value.
    const savedAt = new Date(this.now()).toISOString();
    const originalText = this.text;
    // Only a marked paragraph whose text really changed since the last successful save
    // gets a fresh updatedAt. The stamp is computed for this write, never for a no-op.
    const savingText = stampChangedParagraphs(originalText, this.savedText || originalText, () => savedAt).text;
    this.status = 'saving';
    this.saving = this.repository.save(this.path, this.mtime, savingText)
      .then(async (result) => {
        this.mtime = result.mtime;
        // The editor must hold exactly what reached disk, unless the user kept typing
        // while this save was in flight — then their text wins and the next save stamps.
        if (this.text === originalText) this.text = savingText;
        this.savedText = savingText;
        this.lastSavedAt = savedAt;
        this.dirty = this.text !== savingText;
        this.status = this.dirty ? 'saving' : 'saved';
        this.error = null;
        // A successful write is the only moment excerpt timestamps may be re-evaluated.
        // The post-save lifecycle is awaited so "save returned" really means "the board
        // timestamp write finished"; a listener failure must never fail the write itself.
        if (this.status === 'saved') {
          try {
            await this.onSaved?.({ path: this.path, content: savingText, savedAt });
          } catch {
            // Deliberately swallowed: the Markdown is already on disk.
          }
        }
        // Released only now, so a concurrent save waits for this whole lifecycle.
        this.saving = null;
        return this.dirty ? this.save() : result;
      })
      .catch((error) => {
        this.status = error instanceof FileConflictError ? 'conflict' : 'error';
        this.error = error;
        this.dirty = true;
        this.saving = null;
        throw error;
      });
    return this.saving;
  }

  async reload() {
    return this.load();
  }

  /**
   * Persists pending edits and reports whether the source is now clean. Never throws:
   * the recovery UI owns explaining a conflict or a failed write.
   */
  async flushPending() {
    if (!this.dirty) return true;
    try {
      await this.save();
    } catch {
      return false;
    }
    return !this.dirty;
  }

  async keepLocal() {
    const local = this.text;
    const current = await this.repository.read(this.path);
    this.mtime = current.mtime;
    this.text = local;
    this.dirty = true;
    return this.save();
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The editor's drag handle is the 48px-tall title bar, so a drag must always leave at least
 * this much of it on screen — otherwise the window becomes impossible to grab again.
 */
export const FLOATING_EDITOR_KEEP_VISIBLE = 48;

/** Clamps an editor's top-left so a 48px grab strip never leaves the viewport. */
export function clampEditorPosition(left, top, viewportWidth, viewportHeight, keepVisible = FLOATING_EDITOR_KEEP_VISIBLE) {
  const maxLeft = Math.max(0, viewportWidth - keepVisible);
  const maxTop = Math.max(0, viewportHeight - keepVisible);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
}

/**
 * The editor's current top-left, relative to its containing block. `style.left/top` are
 * containing-block coordinates while `getBoundingClientRect()` is viewport-relative, so a
 * positioned ancestor must be subtracted or the window jumps by the ancestor's offset.
 */
function containingBlockOffset(root) {
  const rect = root.getBoundingClientRect();
  const offsetParent = root.offsetParent;
  if (offsetParent && typeof offsetParent.getBoundingClientRect === 'function') {
    const parentRect = offsetParent.getBoundingClientRect();
    return { left: rect.left - parentRect.left, top: rect.top - parentRect.top };
  }
  return { left: rect.left, top: rect.top };
}

function viewportOf(root) {
  const view = root.ownerDocument?.defaultView;
  if (view && Number.isFinite(view.innerWidth) && Number.isFinite(view.innerHeight)) {
    return { width: view.innerWidth, height: view.innerHeight };
  }
  return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
}

/**
 * The box the editor is dragged inside, in the same coordinate space as `style.left/top`.
 * `style.left/top` are containing-block coordinates, so when the editor sits in a positioned
 * ancestor (a right-side panel, for example) the drag must clamp to that ancestor's size —
 * not the whole viewport, which would let the window slide past the panel's far edge.
 */
function containingBlockSize(root) {
  const offsetParent = root.offsetParent;
  if (offsetParent && typeof offsetParent.getBoundingClientRect === 'function') {
    const rect = offsetParent.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return { width: rect.width, height: rect.height };
  }
  return viewportOf(root);
}

/**
 * Drag controls for the floating editor. The header is looked up afresh on every
 * pointerdown — not captured at bind time — so a `render()` that replaces the header
 * never leaves the window undraggable. Callers bind the three handlers to the
 * persistent root element exactly once.
 */
export function dragController(root) {
  let drag = null;
  return {
    onPointerDown(event) {
      const header = root.querySelector('.kc-floating-header');
      if (!header || !header.contains(event.target)) return;
      if (event.target.closest('button')) return;
      const offset = containingBlockOffset(root);
      drag = { x: event.clientX, y: event.clientY, left: offset.left, top: offset.top };
      header.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event) {
      if (!drag) return;
      const bounds = containingBlockSize(root);
      const position = clampEditorPosition(
        drag.left + event.clientX - drag.x,
        drag.top + event.clientY - drag.y,
        bounds.width,
        bounds.height,
      );
      root.style.left = `${position.left}px`;
      root.style.top = `${position.top}px`;
    },
    onPointerUp() { drag = null; },
    onPointerCancel() { drag = null; },
  };
}

export class FloatingEditor {
  constructor(options) {
    this.options = options;
    this.session = new EditorSession(options.filePath, options.repository, {
      now: options.now,
      onSaved: options.onSourceSaved
        ? (info) => options.onSourceSaved({ filePath: info.path, content: info.content, savedAt: info.savedAt })
        : null,
    });
    this.editing = false;
    this.tab = 'preview';
    this.timer = null;
    this.root = null;
    this.textarea = null;
    this.pendingSelection = null;
    this.excerptWarning = null;
  }

  async open() {
    await this.session.load();
    this.applyExcerptAnchor();
    this.root = element('section', 'kc-floating-editor');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', `编辑 ${this.options.filePath}`);
    this.options.host.append(this.root);
    this.render();
    this.enableDrag();
    return this;
  }

  /**
   * When the window was opened from an excerpt sticker, relocate the quote and select it.
   * A miss never touches the file: the saved quote is shown and the reason is stated.
   */
  applyExcerptAnchor() {
    const anchor = this.options.excerptAnchor;
    if (!anchor) return;
    const located = locateExcerpt(this.session.text, anchor);
    this.excerptLocation = located;
    if (located.found) {
      this.editing = true;
      this.pendingSelection = { start: located.start, end: located.end };
    } else {
      this.excerptWarning = '原文已变化，无法自动定位';
    }
  }

  render() {
    if (!this.root) return;
    this.root.replaceChildren();
    const header = element('header', 'kc-floating-header');
    const title = element('strong', '', this.options.filePath.split('/').at(-1));
    const status = element('span', 'kc-save-status', this.statusText());
    const edit = element('button', 'mod-cta', this.editing ? '预览' : '编辑');
    edit.type = 'button';
    edit.addEventListener('click', () => this.toggleEdit());
    const close = element('button', 'clickable-icon', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭浮动窗口');
    close.addEventListener('click', () => this.close());
    header.append(title, status, edit, close);
    this.root.append(header);

    const tabs = element('nav', 'kc-editor-tabs');
    for (const [id, label] of [['preview', '预览'], ['relations', '关系'], ['properties', '属性']]) {
      const button = element('button', this.tab === id ? 'is-active' : '', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(this.tab === id));
      button.addEventListener('click', () => { this.tab = id; this.editing = false; this.render(); });
      tabs.append(button);
    }
    this.root.append(tabs);
    const body = element('div', 'kc-editor-body');
    this.root.append(body);
    if (this.tab === 'relations') this.renderRelations(body);
    else if (this.tab === 'properties') this.renderProperties(body);
    else if (this.editing) this.renderTextarea(body);
    else this.renderPreview(body);
    if (this.excerptWarning) this.renderExcerptWarning();
    if (['error', 'conflict'].includes(this.session.status)) this.renderRecovery();
  }

  renderExcerptWarning() {
    const bar = element('div', 'kc-editor-error', this.excerptWarning);
    bar.append(element('blockquote', '', this.options.excerptAnchor.quote));
    this.root.append(bar);
  }

  renderPreview(body) {
    const readFlow = this.currentReadFlow();
    if (readFlow) {
      body.append(element('h3', '', '原文摘录'), element('blockquote', '', readFlow.excerpt || '无摘录'));
      body.append(element('h3', '', '我的想法'), element('p', '', readFlow.comment || '暂无想法'));
      const source = element('button', '', '打开来源文件');
      source.type = 'button';
      source.addEventListener('click', this.options.openSource);
      body.append(source);
      return;
    }
    if (this.options.renderMarkdown) this.options.renderMarkdown(this.session.text, body, this.options.filePath);
    else body.append(element('pre', '', this.session.text));
  }

  renderTextarea(body) {
    const textarea = element('textarea', 'kc-editor-textarea');
    textarea.value = this.session.text;
    textarea.setAttribute('aria-label', 'Markdown 内容');
    textarea.addEventListener('input', () => {
      this.session.setText(textarea.value);
      this.scheduleSave();
      this.updateStatus();
    });
    textarea.addEventListener('contextmenu', (event) => this.onTextareaContextMenu(event));
    this.textarea = textarea;
    body.append(textarea);
    queueMicrotask(() => {
      textarea.focus();
      const pending = this.pendingSelection;
      this.pendingSelection = null;
      if (pending) this.selectRange(pending.start, pending.end);
    });
  }

  /** The current textarea selection as an intent, or null when it is empty/whitespace. */
  selectionIntent() {
    if (!this.textarea) return null;
    const start = Math.min(this.textarea.selectionStart, this.textarea.selectionEnd);
    const end = Math.max(this.textarea.selectionStart, this.textarea.selectionEnd);
    const quote = this.session.text.slice(start, end);
    if (!quote.trim()) return null;
    return { start, end, quote };
  }

  /** Builds the `kcExcerpt` payload for an intent, or null when the selection is unusable. */
  excerptAnchorFor(intent) {
    if (!intent) return null;
    return createExcerptAnchor({
      source: this.session.text,
      start: intent.start,
      end: intent.end,
      sourceFile: this.options.filePath,
      now: this.session.now,
    });
  }

  /**
   * The editor never edits the board; it only reports the surface and the intent. The
   * view decides what the menu contains and what a chosen action means.
   */
  onTextareaContextMenu(event) {
    // A right-click without a selection still offers the caret's paragraph actions.
    const intent = this.selectionIntent();
    event.preventDefault();
    this.options.onTextContextMenu?.({ event, intent });
  }

  /** Applies a pure transform result through the session, keeping auto-save and recovery. */
  applyTextTransform(transform) {
    if (!this.textarea) return false;
    const result = transform(this.textState());
    if (!result || result.text === this.session.text) return false;
    this.session.setText(result.text);
    this.textarea.value = result.text;
    this.scheduleSave();
    this.updateStatus();
    this.selectRange(result.start, result.end);
    return true;
  }

  textState() {
    if (!this.textarea) return { text: this.session.text, start: 0, end: 0 };
    return {
      text: this.session.text,
      start: Math.min(this.textarea.selectionStart, this.textarea.selectionEnd),
      end: Math.max(this.textarea.selectionStart, this.textarea.selectionEnd),
    };
  }

  /**
   * Called before anything that would persist a reference to this file's text. The source
   * is the single source of truth, so no excerpt may be created on top of unsaved edits.
   */
  async flushPending() {
    clearTimeout(this.timer);
    const clean = await this.session.flushPending();
    if (clean) this.updateStatus();
    else this.render();
    return clean;
  }

  selectRange(start, end) {
    if (!this.textarea) return false;
    this.textarea.focus();
    this.textarea.setSelectionRange(start, end);
    return true;
  }

  renderRelations(body) {
    const relations = this.options.relations ?? [];
    if (!relations.length) body.append(element('p', 'kc-muted', '暂无画板关系'));
    for (const relation of relations) body.append(element('div', 'kc-relation-row', relation.label || '未命名关系'));
  }

  renderProperties(body) {
    const readFlow = this.currentReadFlow();
    body.append(element('dl', 'kc-properties'));
    const list = body.firstElementChild;
    list.append(element('dt', '', '文件'), element('dd', '', this.options.filePath));
    if (readFlow?.book) list.append(element('dt', '', '书籍'), element('dd', '', readFlow.book));
    if (readFlow?.chapter) list.append(element('dt', '', '章节'), element('dd', '', readFlow.chapter));
  }

  currentReadFlow() {
    if (!this.options.readFlow) return null;
    return deriveReadFlowPreview(this.options.filePath, this.session.text, this.options.readFlowFrontmatter);
  }

  renderRecovery() {
    const bar = element('div', 'kc-editor-error', this.session.status === 'conflict' ? '文件已在外部修改，本地内容仍保留。' : `保存失败：${this.session.error?.message ?? '未知错误'}`);
    if (this.session.status === 'conflict') {
      const reload = element('button', '', '重新载入');
      reload.type = 'button';
      reload.addEventListener('click', async () => { await this.session.reload(); this.render(); });
      const keep = element('button', 'mod-cta', '保留我的内容');
      keep.type = 'button';
      keep.addEventListener('click', async () => { try { await this.session.keepLocal(); this.render(); } catch { this.render(); } });
      bar.append(reload, keep);
    } else {
      const retry = element('button', 'mod-cta', '重试');
      retry.type = 'button';
      retry.addEventListener('click', async () => { try { await this.session.save(); this.render(); } catch { this.render(); } });
      const copy = element('button', '', '复制内容');
      copy.type = 'button';
      copy.addEventListener('click', () => navigator.clipboard.writeText(this.session.text));
      bar.append(retry, copy);
    }
    this.root.append(bar);
  }

  toggleEdit() {
    if (this.tab !== 'preview') this.tab = 'preview';
    this.editing = !this.editing;
    this.render();
  }

  scheduleSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try { await this.session.save(); } catch { /* recovery UI keeps the text */ }
      this.syncTextarea();
      if (['error', 'conflict'].includes(this.session.status)) this.render();
      else this.updateStatus();
    }, 600);
  }

  /** Mirrors save-time transforms (paragraph timestamps) back into the textarea. */
  syncTextarea() {
    if (!this.textarea || this.textarea.value === this.session.text) return;
    const { selectionStart, selectionEnd } = this.textarea;
    this.textarea.value = this.session.text;
    const length = this.textarea.value.length;
    this.textarea.setSelectionRange(Math.min(selectionStart, length), Math.min(selectionEnd, length));
  }

  updateStatus() {
    const status = this.root?.querySelector('.kc-save-status');
    if (status) status.textContent = this.statusText();
  }

  statusText() {
    return ({ saving: '保存中…', saved: '已保存', conflict: '有冲突', error: '保存失败' })[this.session.status] ?? (this.session.dirty ? '未保存' : '');
  }

  enableDrag() {
    if (!this.root || this.dragBound) return;
    this.dragBound = true;
    const controller = dragController(this.root);
    this.root.addEventListener('pointerdown', (event) => controller.onPointerDown(event));
    this.root.addEventListener('pointermove', (event) => controller.onPointerMove(event));
    this.root.addEventListener('pointerup', () => controller.onPointerUp());
    this.root.addEventListener('pointercancel', () => controller.onPointerCancel());
  }

  async handleEscape() {
    if (this.editing) { this.editing = false; this.render(); return true; }
    await this.close();
    return true;
  }

  async close() {
    clearTimeout(this.timer);
    if (this.session.dirty) {
      try { await this.session.save(); } catch { this.render(); return false; }
    }
    this.root?.remove();
    this.root = null;
    this.options.onClose?.();
    return true;
  }
}
