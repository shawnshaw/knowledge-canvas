import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isKeyboardFocus,
  selectionAfterFocus,
  selectionAfterPointerDown,
} from '../src/selection-events.js';
import { dragTargets } from '../src/selection-geometry.js';

const card = (id) => ({ id, type: 'file', file: `${id}.md`, x: 0, y: 0, width: 10, height: 10 });

test('a modifier pointerdown adds a card and a mouse focus keeps the multi-selection', () => {
  let selection = new Set(['a']);
  // pointerdown with Cmd/Ctrl
  selection = selectionAfterPointerDown(selection, 'b', { additive: true });
  assert.deepEqual([...selection].sort(), ['a', 'b']);
  // the browser then focuses the card; this must not collapse the selection
  const afterFocus = selectionAfterFocus(selection, 'b', { keyboardVisible: false });
  assert.equal(afterFocus, selection, 'mouse focus returns the same selection object');
  assert.deepEqual([...afterFocus].sort(), ['a', 'b']);
});

test('a marquee selection survives clicking one of its cards before a batch drag', () => {
  // marquee produced a two-card selection
  let selection = new Set(['a', 'b']);
  // pointerdown on an already-selected card without a modifier keeps the selection
  selection = selectionAfterPointerDown(selection, 'a', { additive: false });
  assert.deepEqual([...selection].sort(), ['a', 'b']);
  // focus follows, still not keyboard-visible
  selection = selectionAfterFocus(selection, 'a', { keyboardVisible: false });
  // the resulting drag touches every selected card exactly once
  const nodes = [card('a'), card('b')];
  assert.deepEqual(dragTargets(nodes, selection).map((node) => node.id).sort(), ['a', 'b']);
});

test('keyboard-visible focus still selects a single card', () => {
  const afterFocus = selectionAfterFocus(new Set(['a', 'b']), 'b', { keyboardVisible: true });
  assert.deepEqual([...afterFocus], ['b']);
});

test('a plain pointerdown on an unselected card replaces the selection', () => {
  assert.deepEqual([...selectionAfterPointerDown(new Set(['a', 'b']), 'c')], ['c']);
});

test('a modifier pointerdown on a selected card removes it', () => {
  assert.deepEqual([...selectionAfterPointerDown(new Set(['a', 'b']), 'a', { additive: true })], ['b']);
});

test('keyboard focus detection degrades safely', () => {
  assert.equal(isKeyboardFocus({}, () => true), true);
  assert.equal(isKeyboardFocus({}, () => false), false);
  assert.equal(isKeyboardFocus(null), false);
  assert.equal(isKeyboardFocus({}, () => { throw new Error('unsupported'); }), false);
});
