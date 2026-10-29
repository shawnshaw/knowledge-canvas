/**
 * Selection transitions for pointer and focus events.
 *
 * Focus is the subtle one: a mouse click focuses a card after `pointerdown` already set the
 * selection, so a focus handler that always collapses to one card would silently destroy a
 * Cmd/Ctrl multi-selection or a marquee just before a batch drag. Only keyboard-visible
 * focus (`:focus-visible`) may change the selection.
 */

export function selectionAfterPointerDown(selection, id, { additive = false } = {}) {
  const next = new Set(selection ?? []);
  if (additive) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  if (next.has(id)) return next;
  return new Set([id]);
}

export function selectionAfterFocus(selection, id, { keyboardVisible = false } = {}) {
  if (!keyboardVisible) return selection instanceof Set ? selection : new Set(selection ?? []);
  return new Set([id]);
}

/** True when the element is focused through the keyboard (or the platform cannot tell). */
export function isKeyboardFocus(element, matches = (node, selector) => node.matches(selector)) {
  if (!element) return false;
  try {
    return matches(element, ':focus-visible');
  } catch {
    return false;
  }
}
