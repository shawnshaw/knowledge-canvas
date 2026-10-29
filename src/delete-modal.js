import { Modal } from 'obsidian';

let nextDeleteControlId = 0;

/**
 * One confirmation for every removal entry point. Cancelling — button, Escape, or
 * backdrop — resolves `null` and must not change any data. Confirming resolves
 * `{ trash }`, where `trash` is false unless the user ticked the opt-in checkbox.
 */
export class DeleteCardsModal extends Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
    this.trash = false;
  }

  onOpen() {
    const { count, names, extra, trashDisabled, trashReason } = this.options;
    this.titleEl.setText(`移除 ${count} 张便利贴？`);
    this.contentEl.createEl('p', { text: '只会移除当前画板中的所选卡片和它们的连线，Markdown 源文件默认保留。' });

    const list = this.contentEl.createEl('ul', { cls: 'kc-delete-list' });
    for (const name of names) list.createEl('li', { text: name });
    if (extra > 0) list.createEl('li', { text: `以及另外 ${extra} 个文件` });

    const row = this.contentEl.createDiv({ cls: 'kc-delete-option' });
    const checkboxId = `kc-delete-trash-${++nextDeleteControlId}`;
    const checkbox = row.createEl('input', { attr: { type: 'checkbox', id: checkboxId } });
    checkbox.checked = false;
    checkbox.disabled = Boolean(trashDisabled);
    checkbox.addEventListener('change', () => { this.trash = checkbox.checked; });
    const label = row.createEl('label', { text: '同时将 Markdown 源文件移入废纸篓' });
    label.htmlFor = checkboxId;

    if (trashDisabled && trashReason) {
      const reason = this.contentEl.createEl('p', { cls: 'kc-delete-reason', text: trashReason });
      reason.id = `${checkboxId}-reason`;
      checkbox.setAttribute('aria-describedby', reason.id);
    }

    const actions = this.contentEl.createDiv({ cls: 'kc-modal-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const confirm = actions.createEl('button', { cls: 'mod-warning kc-delete-confirm', text: '移除' });
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
    this.resolve({ trash: this.trash });
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

export function requestDelete(app, options) {
  return new Promise((resolve) => new DeleteCardsModal(app, options, resolve).open());
}
