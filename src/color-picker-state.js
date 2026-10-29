/**
 * Pure state for the macOS-style colour popover. The reducer owns focus movement, the
 * one-time settle, and what "cancel" means, so the DOM layer only translates events and
 * paints the result.
 */

import { CARD_COLORS, cardColorName, stepCardColor } from './card-colors.js';

export function createPickerState(current = 'neutral') {
  const name = cardColorName(current);
  return { open: true, current: name, focused: name, settled: false, result: null };
}

/** A settled picker ignores every later event, so confirm/cancel can never fire twice. */
export function reducePicker(state, event) {
  if (state.settled) return state;
  switch (event?.type) {
    case 'move':
      return { ...state, focused: stepCardColor(state.focused, event.delta) };
    case 'focus':
      return { ...state, focused: cardColorName(event.name) };
    case 'confirm':
      return { ...state, open: false, settled: true, result: state.focused };
    case 'cancel':
      return { ...state, open: false, settled: true, result: null };
    default:
      return state;
  }
}

/** What the DOM needs per swatch: which one is focused, and which one is already applied. */
export function pickerSwatches(state) {
  return CARD_COLORS.map((color) => ({
    name: color.name,
    value: color.value,
    focused: color.name === state?.focused,
    selected: color.name === state?.current,
  }));
}
