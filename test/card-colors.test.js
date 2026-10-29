import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_COLORS,
  READFLOW_DEFAULT_COLOR,
  cardColorName,
  cardColorValue,
  effectiveCardColor,
  isCardColorValue,
  normalizeCardColor,
  randomStickyColor,
  stepCardColor,
} from '../src/card-colors.js';

test('exposes neutral plus the five JSON Canvas presets the design approved', () => {
  assert.deepEqual(CARD_COLORS.map((color) => color.name), ['neutral', 'coral', 'yellow', 'green', 'blue', 'purple']);
  assert.deepEqual(CARD_COLORS.map((color) => color.value), [null, '1', '3', '4', '5', '6']);
  assert.equal(cardColorValue('neutral'), null);
  assert.equal(cardColorValue('blue'), '5');
  assert.equal(cardColorValue('chartreuse'), null);
  assert.equal(READFLOW_DEFAULT_COLOR, 'blue');
});

test('only the five presets count as stored values', () => {
  for (const value of ['1', '3', '4', '5', '6']) assert.equal(isCardColorValue(value), true);
  for (const value of ['2', '7', 'red', '', null, undefined, 1, {}, []]) assert.equal(isCardColorValue(value), false);
});

test('neutral persists no color at all', () => {
  assert.equal(normalizeCardColor('neutral'), null);
  assert.equal(normalizeCardColor(null), null);
  assert.equal(normalizeCardColor(undefined), null);
  assert.equal(normalizeCardColor(''), null);
});

test('normalizeCardColor accepts a semantic name or an already-valid preset', () => {
  assert.equal(normalizeCardColor('coral'), '1');
  assert.equal(normalizeCardColor('purple'), '6');
  assert.equal(normalizeCardColor('5'), '5');
  assert.equal(normalizeCardColor('2'), null);
  assert.equal(normalizeCardColor('chartreuse'), null);
  assert.equal(normalizeCardColor(3), null);
});

test('cardColorName reads a stored value back, treating anything else as neutral', () => {
  assert.equal(cardColorName('4'), 'green');
  assert.equal(cardColorName(undefined), 'neutral');
  assert.equal(cardColorName(null), 'neutral');
  assert.equal(cardColorName('999'), 'neutral');
});

test('randomStickyColor picks one of exactly the five non-neutral presets', () => {
  const seen = new Set();
  for (let i = 0; i < 600; i += 1) seen.add(randomStickyColor());
  assert.deepEqual([...seen].sort(), ['1', '3', '4', '5', '6']);
  assert.equal(seen.has(null), false);
});

test('randomStickyColor is deterministic for an injected random source', () => {
  assert.equal(randomStickyColor(() => 0), '1');
  assert.equal(randomStickyColor(() => 0.2), '3');
  assert.equal(randomStickyColor(() => 0.99), '6');
  // a random source that returns exactly 1 must not run off the end of the palette
  assert.equal(randomStickyColor(() => 1), '6');
});

test('cardColorName accepts a semantic name as well as a stored value', () => {
  assert.equal(cardColorName('coral'), 'coral');
  assert.equal(cardColorName('1'), 'coral');
  assert.equal(cardColorName('neutral'), 'neutral');
  assert.equal(cardColorName('nonsense'), 'neutral');
});

test('stepCardColor walks the palette and wraps at both ends', () => {
  assert.equal(stepCardColor('neutral', 1), 'coral');
  assert.equal(stepCardColor('purple', 1), 'neutral');
  assert.equal(stepCardColor('neutral', -1), 'purple');
  assert.equal(stepCardColor('green', 2), 'purple');
  assert.equal(stepCardColor('5', 1), 'purple');
  assert.equal(stepCardColor('blue', 6), 'blue');
});

test('effectiveCardColor falls back to the kind default without touching the node', () => {
  assert.equal(effectiveCardColor({}), 'neutral');
  assert.equal(effectiveCardColor({}, { readFlow: true }), 'blue');
  assert.equal(effectiveCardColor({ color: '4' }, { readFlow: true }), 'green');
  assert.equal(effectiveCardColor({ color: 'bogus' }, { readFlow: true }), 'blue');
  assert.equal(effectiveCardColor(undefined, { readFlow: true }), 'blue');

  const node = {};
  effectiveCardColor(node, { readFlow: true });
  assert.equal('color' in node, false);
});
