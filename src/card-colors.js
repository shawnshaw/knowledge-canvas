/**
 * Card palette. Colours persist in the standard JSON Canvas `node.color` field: neutral
 * writes nothing at all, and the five hues use the standard preset values. V1 offers only
 * these six choices — no arbitrary RGB or hex.
 */

export const CARD_COLORS = Object.freeze([
  { name: 'neutral', value: null },
  { name: 'coral', value: '1' },
  { name: 'yellow', value: '3' },
  { name: 'green', value: '4' },
  { name: 'blue', value: '5' },
  { name: 'purple', value: '6' },
]);

const NAME_TO_VALUE = new Map(CARD_COLORS.map((color) => [color.name, color.value]));
const VALUE_TO_NAME = new Map(CARD_COLORS.filter((color) => color.value !== null).map((color) => [color.value, color.name]));
const COLOR_NAMES = Object.freeze(CARD_COLORS.map((color) => color.name));

/** Sticky notes are created with one of the five non-neutral presets. */
const STICKY_VALUES = Object.freeze(CARD_COLORS.map((color) => color.value).filter((value) => value !== null));

/** ReadFlow cards show a source stripe; without an explicit colour they show blue. */
export const READFLOW_DEFAULT_COLOR = 'blue';

export function cardColorValue(name) {
  const value = NAME_TO_VALUE.get(name);
  return value === undefined ? null : value;
}

/** True only for a stored value this plugin is allowed to read or write. */
export function isCardColorValue(value) {
  return VALUE_TO_NAME.has(value);
}

/**
 * Reads a stored value or a semantic name back as a semantic name; anything unrecognised
 * reads as neutral.
 */
export function cardColorName(value) {
  if (NAME_TO_VALUE.has(value)) return value;
  return VALUE_TO_NAME.get(value) ?? 'neutral';
}

/**
 * The value to persist for a requested colour. Accepts a semantic name or an already valid
 * preset, and resolves everything else — including neutral — to null, so a value the plugin
 * does not recognise can never reach the canvas.
 */
export function normalizeCardColor(value) {
  if (typeof value !== 'string') return null;
  if (NAME_TO_VALUE.has(value)) return NAME_TO_VALUE.get(value);
  return isCardColorValue(value) ? value : null;
}

/** Picks one of the five non-neutral presets; the random source is injectable for tests. */
export function randomStickyColor(random = Math.random) {
  const raw = Number(random());
  const scaled = Number.isFinite(raw) ? Math.floor(raw * STICKY_VALUES.length) : 0;
  const index = Math.min(STICKY_VALUES.length - 1, Math.max(0, scaled));
  return STICKY_VALUES[index];
}

/** Moves through the palette by `delta` steps, wrapping at both ends. */
export function stepCardColor(value, delta) {
  const index = COLOR_NAMES.indexOf(cardColorName(value));
  const steps = Number.isFinite(Number(delta)) ? Math.trunc(Number(delta)) : 0;
  return COLOR_NAMES[(index + (steps % COLOR_NAMES.length) + COLOR_NAMES.length) % COLOR_NAMES.length];
}

/**
 * The colour a card renders with: an explicit mark wins, otherwise the kind default applies.
 * ReadFlow's blue is a render-time default only — it is never written back to the canvas.
 */
export function effectiveCardColor(node, { readFlow = false } = {}) {
  if (isCardColorValue(node?.color)) return cardColorName(node.color);
  return readFlow ? READFLOW_DEFAULT_COLOR : 'neutral';
}
