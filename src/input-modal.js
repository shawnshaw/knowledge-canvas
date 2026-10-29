import { Modal, Notice } from 'obsidian';
import { createInputResult } from './input-dialog-state.js';

let nextControlId = 0;

export class InputModal extends Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.result = createInputResult(resolve);
    this.controls = new Map();
  }

  hasMultiline() {
    return this.options.fields.some((field) => field.multiline);
  }

  onOpen() {
    this.titleEl.setText(this.options.title);
    const form = this.contentEl.createEl('form', { cls: 'kc-input-form' });
    for (const field of this.options.fields) {
      const group = form.createDiv({ cls: 'kc-input-field' });
      const id = `kc-input-${++nextControlId}`;
      if (field.type === 'checkbox') {
        group.addClass('kc-input-field--checkbox');
        const control = group.createEl('input');
        control.id = id;
        control.type = 'checkbox';
        control.checked = field.value === true;
        const label = group.createEl('label', { text: field.label });
        label.htmlFor = id;
        this.controls.set(field.key, control);
        continue;
      }
      const label = group.createEl('label', { text: field.label });
      label.htmlFor = id;
      const control = group.createEl(field.multiline ? 'textarea' : 'input');
      control.id = id;
      control.value = field.value ?? '';
      if (!field.multiline) control.type = 'text';
      if (field.placeholder) control.placeholder = field.placeholder;
      this.controls.set(field.key, control);
    }

    const actions = form.createDiv({ cls: 'kc-modal-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'mod-cta', text: this.options.submitLabel ?? '确认' });
    submit.type = 'submit';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitForm();
    });
    if (this.hasMultiline()) {
      form.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          this.submitForm();
        } else if (event.target?.tagName === 'INPUT') {
          // Keep a plain Enter in the single-line title from submitting a
          // form that also has a multiline body; move to the next control.
          event.preventDefault();
          const controls = [...this.controls.values()];
          controls[controls.indexOf(event.target) + 1]?.focus();
        }
      });
    }
    queueMicrotask(() => this.controls.values().next().value?.focus());
  }

  submitForm() {
    const values = {};
    for (const [key, control] of this.controls) {
      values[key] = control.type === 'checkbox' ? control.checked === true : control.value;
    }
    const error = this.options.validate?.(values);
    if (error) { new Notice(error); return; }
    this.result.submit(values);
    this.close();
  }

  onClose() {
    this.result.cancel();
    this.contentEl.empty();
  }
}

export function requestInput(app, options) {
  return new Promise((resolve) => new InputModal(app, options, resolve).open());
}
