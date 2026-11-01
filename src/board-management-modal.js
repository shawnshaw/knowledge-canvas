import { Modal, Notice } from 'obsidian';

let nextBoardControlId = 0;

/**
 * Collects the user's intent for one board rename. It never touches the Vault: the caller
 * re-plans against the live file system and performs every file operation itself, so a
 * cancelled dialog leaves no trace and a conflicting name is refused before anything moves.
 */
export class RenameBoardModal extends Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
  }

  onOpen() {
    const { currentName, noteFolder, validate } = this.options;
    this.titleEl.setText('重命名画布');

    const form = this.contentEl.createEl('form', { cls: 'kc-input-form' });
    const group = form.createDiv({ cls: 'kc-input-field' });
    const id = `kc-board-rename-${++nextBoardControlId}`;
    const label = group.createEl('label', { text: '画布名称' });
    label.htmlFor = id;
    const input = group.createEl('input');
    input.id = id;
    input.type = 'text';
    input.value = currentName ?? '';

    let folderCheckbox = null;
    if (noteFolder) {
      const row = form.createDiv({ cls: 'kc-input-field kc-input-field--checkbox' });
      const boxId = `${id}-folder`;
      folderCheckbox = row.createEl('input');
      folderCheckbox.id = boxId;
      folderCheckbox.type = 'checkbox';
      folderCheckbox.checked = false;
      const boxLabel = row.createEl('label', { text: '同时重命名专属笔记文件夹' });
      boxLabel.htmlFor = boxId;
      form.createEl('p', { cls: 'kc-input-hint', text: `专属笔记文件夹：${noteFolder}` });
    }

    const actions = form.createDiv({ cls: 'kc-modal-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'mod-cta', text: '保存' });
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = { name: input.value, renameNoteFolder: folderCheckbox?.checked === true };
      const error = validate?.(values) ?? null;
      if (error) {
        new Notice(error);
        input.focus();
        input.select();
        return;
      }
      this.submit(values);
    });

    queueMicrotask(() => { input.focus(); input.select(); });
  }

  submit(values) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(values);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

/**
 * Confirms one board deletion. Cancelling — button, Escape, or backdrop — resolves `null`
 * and must not change any data. The note folder is only offered when the caller proved it
 * is safe to remove, and it is never ticked by default.
 */
export class DeleteBoardModal extends Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
    this.deleteNoteFolder = false;
  }

  onOpen() {
    const { name, noteFolder, folderDeletable, folderReason } = this.options;
    this.titleEl.setText(`删除画布「${name}」？`);
    this.contentEl.createEl('p', { text: '画布文件会移入废纸篓，Markdown 笔记默认保留。' });

    if (noteFolder) {
      const row = this.contentEl.createDiv({ cls: 'kc-delete-option' });
      const id = `kc-board-delete-folder-${++nextBoardControlId}`;
      const checkbox = row.createEl('input', { attr: { type: 'checkbox', id } });
      checkbox.checked = false;
      checkbox.disabled = !folderDeletable;
      checkbox.addEventListener('change', () => { this.deleteNoteFolder = checkbox.checked; });
      const label = row.createEl('label', { text: '同时删除专属笔记文件夹' });
      label.htmlFor = id;
      this.contentEl.createEl('p', { cls: 'kc-input-hint', text: `专属笔记文件夹：${noteFolder}` });
      if (!folderDeletable && folderReason) {
        const reason = this.contentEl.createEl('p', { cls: 'kc-delete-reason', text: folderReason });
        reason.id = `${id}-reason`;
        checkbox.setAttribute('aria-describedby', reason.id);
      }
    }

    const actions = this.contentEl.createDiv({ cls: 'kc-modal-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const confirm = actions.createEl('button', { cls: 'mod-warning kc-delete-confirm', text: '删除画布' });
    confirm.type = 'button';
    confirm.addEventListener('click', () => {
      if (this.settled) return;
      confirm.disabled = true;
      this.submit();
    });

    queueMicrotask(() => cancel.focus());
  }

  submit() {
    if (this.settled) return;
    this.settled = true;
    this.resolve({ deleteNoteFolder: this.deleteNoteFolder });
    this.close();
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

export function requestBoardRename(app, options) {
  return new Promise((resolve) => new RenameBoardModal(app, options, resolve).open());
}

export function requestBoardDelete(app, options) {
  return new Promise((resolve) => new DeleteBoardModal(app, options, resolve).open());
}
