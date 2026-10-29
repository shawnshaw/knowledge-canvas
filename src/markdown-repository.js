import { normalizeNoteFolder } from './settings.js';

export class FileConflictError extends Error {
  constructor(path, expectedMtime, actualMtime) {
    super(`Markdown file changed outside the editor: ${path}`);
    this.name = 'FileConflictError';
    this.path = path;
    this.expectedMtime = expectedMtime;
    this.actualMtime = actualMtime;
  }
}

export class MarkdownRepository {
  constructor(vault, noteFolder = 'Inbox/Canvas', now = () => new Date()) {
    this.vault = vault;
    this.now = now;
    this.queues = new Map();
    this.setNoteFolder(noteFolder);
  }

  /** 切换新建便利贴的存放目录，立即生效。返回规范化后的路径。 */
  setNoteFolder(noteFolder) {
    this.noteFolder = normalizeNoteFolder(noteFolder);
    return this.noteFolder;
  }

  /**
   * Creates a note in `options.folder` when given, otherwise in the plugin's note folder.
   * The folder is a per-call argument on purpose: two boards open at once must never leak
   * their canvas-local folder into each other through shared repository state.
   */
  async createNote(title, body = '', { folder } = {}) {
    const target = normalizeNoteFolder(folder ?? this.noteFolder);
    await this.ensureFolder(target);
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
    let path = `${target}/${safeTitle}.md`;
    let suffix = 2;
    while (this.vault.getAbstractFileByPath(path)) path = `${target}/${safeTitle} - ${suffix++}.md`;
    const content = `---\ntype: canvas-note\ncreated: ${this.now().toISOString()}\n---\n\n# ${title.trim() || '未命名'}\n\n${body}`.trimEnd() + '\n';
    return this.vault.create(path, content);
  }

  async ensureFolder(path) {
    if (!path) return;
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      const folder = parts.slice(0, index).join('/');
      if (!this.vault.getAbstractFileByPath(folder)) await this.vault.createFolder(folder);
    }
  }

  async read(fileOrPath) {
    const file = this.resolve(fileOrPath);
    return { file, content: await this.vault.read(file), mtime: file.stat.mtime };
  }

  async save(fileOrPath, expectedMtime, content) {
    const path = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.path;
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const file = this.resolve(path);
      if (file.stat.mtime !== expectedMtime) throw new FileConflictError(path, expectedMtime, file.stat.mtime);
      await this.vault.modify(file, content);
      return { mtime: file.stat.mtime };
    });
    this.queues.set(path, next);
    next.finally(() => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    }).catch(() => {});
    return next;
  }

  resolve(fileOrPath) {
    const file = typeof fileOrPath === 'string' ? this.vault.getAbstractFileByPath(fileOrPath) : fileOrPath;
    if (!file || !file.path?.toLowerCase().endsWith('.md') || !file.stat) throw new Error(`Markdown file not found: ${typeof fileOrPath === 'string' ? fileOrPath : ''}`);
    return file;
  }

  async flush() {
    await Promise.all([...this.queues.values()]);
  }
}
