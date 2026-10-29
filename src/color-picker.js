import { setIcon } from 'obsidian';
import { createPickerState, pickerSwatches, reducePicker } from './color-picker-state.js';

const ANCHOR_GAP = 6;
const VIEWPORT_MARGIN = 4;

/**
 * macOS-style colour popover anchored to a card. Which swatch is focused, what a key press
 * means, and whether the picker has settled all come from the pure reducer in
 * `color-picker-state.js`, so this class only translates DOM events and paints the result.
 *
 * It is appended to the view host rather than `document.body` so the plugin's scoped CSS and
 * theme tokens apply.
 */
export class CardColorPicker {
  constructor(host) {
    this.host = host;
    this.root = null;
    this.state = null;
    this.onSelect = null;
    this.restoreFocusTo = null;
    this.anchorEl = null;
  }

  get isOpen() {
    return this.root !== null;
  }

  /** Used by the view's single outside-click listener; never registers one of its own. */
  contains(target) {
    return Boolean(this.root?.contains(target));
  }

  open({ anchorEl = null, current = 'neutral', onSelect = null, restoreFocusTo = null } = {}) {
    this.close();
    this.state = createPickerState(current);
    this.anchorEl = anchorEl;
    this.onSelect = onSelect;
    this.restoreFocusTo = restoreFocusTo;
    this.root = document.createElement('div');
    this.root.className = 'kc-color-picker';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', '卡片颜色');
    this.root.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.paint();
    this.host.append(this.root);
    this.place();
    this.focusFocused();
  }

  paint() {
    if (!this.root) return;
    this.root.replaceChildren();
    for (const swatch of pickerSwatches(this.state)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kc-color-swatch';
      button.dataset.swatch = swatch.name;
      button.setAttribute('aria-label', swatch.selected ? `${swatch.name}（当前颜色）` : swatch.name);
      button.setAttribute('aria-pressed', String(swatch.selected));
      if (swatch.selected) setIcon(button, 'check');
      button.addEventListener('click', () => {
        this.dispatch({ type: 'focus', name: swatch.name });
        this.dispatch({ type: 'confirm' });
      });
      this.root.append(button);
    }
  }

  onKeyDown(event) {
    const action = {
      ArrowLeft: { type: 'move', delta: -1 },
      ArrowUp: { type: 'move', delta: -1 },
      ArrowRight: { type: 'move', delta: 1 },
      ArrowDown: { type: 'move', delta: 1 },
      Tab: { type: 'move', delta: event.shiftKey ? -1 : 1 },
      Enter: { type: 'confirm' },
      ' ': { type: 'confirm' },
      Escape: { type: 'cancel' },
    }[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.dispatch(action);
  }

  dispatch(event) {
    if (!this.state) return;
    const next = reducePicker(this.state, event);
    if (next === this.state) return;
    this.state = next;
    if (next.settled) {
      const { result } = next;
      const onSelect = this.onSelect;
      this.close();
      if (result && onSelect) onSelect(result);
      return;
    }
    this.paint();
    this.place();
    this.focusFocused();
  }

  focusFocused() {
    if (!this.root || !this.state) return;
    this.root.querySelector(`[data-swatch="${this.state.focused}"]`)?.focus();
  }

  anchorRect() {
    return this.anchorEl?.getBoundingClientRect?.() ?? this.host.getBoundingClientRect();
  }

  place() {
    if (!this.root) return;
    const hostRect = this.host.getBoundingClientRect();
    const anchorRect = this.anchorRect();
    const width = this.root.offsetWidth || 0;
    const height = this.root.offsetHeight || 0;
    let left = anchorRect.left - hostRect.left;
    let top = anchorRect.bottom - hostRect.top + ANCHOR_GAP;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, hostRect.width - width - VIEWPORT_MARGIN));
    if (top + height > hostRect.height - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, anchorRect.top - hostRect.top - height - ANCHOR_GAP);
    }
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  /** Always safe to call: closing an already closed picker is a no-op. */
  close() {
    const restore = this.restoreFocusTo;
    this.restoreFocusTo = null;
    this.onSelect = null;
    this.anchorEl = null;
    this.state = null;
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    restore?.();
  }
}
