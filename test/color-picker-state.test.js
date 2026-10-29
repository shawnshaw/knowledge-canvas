import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPickerState,
  pickerSwatches,
  reducePicker,
} from '../src/color-picker-state.js';

test('the picker opens focused on the card’s current colour', () => {
  const state = createPickerState('blue');
  assert.equal(state.open, true);
  assert.equal(state.current, 'blue');
  assert.equal(state.focused, 'blue');
  assert.equal(state.settled, false);
});

test('an unknown or stored colour still opens on a valid swatch', () => {
  assert.equal(createPickerState('5').focused, 'blue');
  assert.equal(createPickerState('nonsense').focused, 'neutral');
  assert.equal(createPickerState(undefined).focused, 'neutral');
});

test('arrow navigation wraps around both ends', () => {
  let state = createPickerState('neutral');
  state = reducePicker(state, { type: 'move', delta: -1 });
  assert.equal(state.focused, 'purple');
  state = reducePicker(state, { type: 'move', delta: 1 });
  assert.equal(state.focused, 'neutral');
  state = reducePicker(state, { type: 'move', delta: 1 });
  assert.equal(state.focused, 'coral');
  // a step larger than the palette still lands inside it
  assert.equal(reducePicker(state, { type: 'move', delta: 11 }).focused, 'neutral');
  assert.equal(reducePicker(state, { type: 'move', delta: -6 }).focused, 'coral');
});

test('tabbing moves focus to a specific swatch', () => {
  const state = reducePicker(createPickerState('neutral'), { type: 'focus', name: 'green' });
  assert.equal(state.focused, 'green');
  assert.equal(state.settled, false);
  assert.equal(reducePicker(state, { type: 'focus', name: '4' }).focused, 'green');
});

test('confirming settles once with the focused colour and closes', () => {
  let state = createPickerState('neutral');
  state = reducePicker(state, { type: 'move', delta: 1 });
  state = reducePicker(state, { type: 'confirm' });
  assert.equal(state.settled, true);
  assert.equal(state.result, 'coral');
  assert.equal(state.open, false);
});

test('cancelling settles with null so nothing is written', () => {
  const state = reducePicker(createPickerState('purple'), { type: 'cancel' });
  assert.equal(state.settled, true);
  assert.equal(state.result, null);
  assert.equal(state.open, false);
});

test('a settled picker ignores everything that follows', () => {
  const settled = reducePicker(createPickerState('green'), { type: 'cancel' });
  assert.equal(reducePicker(settled, { type: 'confirm' }), settled);
  assert.equal(reducePicker(settled, { type: 'move', delta: 1 }), settled);
  assert.equal(reducePicker(settled, { type: 'focus', name: 'coral' }), settled);
});

test('an unknown event leaves the same state object alone', () => {
  const state = createPickerState('coral');
  assert.equal(reducePicker(state, { type: 'nope' }), state);
  assert.equal(reducePicker(state, undefined), state);
});

test('swatches expose focus and selection for the DOM layer', () => {
  const state = { ...createPickerState('yellow'), focused: 'purple' };
  const swatches = pickerSwatches(state);
  assert.deepEqual(swatches.map((swatch) => swatch.name), ['neutral', 'coral', 'yellow', 'green', 'blue', 'purple']);
  assert.deepEqual(swatches.map((swatch) => swatch.value), [null, '1', '3', '4', '5', '6']);
  assert.deepEqual(swatches.filter((swatch) => swatch.focused).map((swatch) => swatch.name), ['purple']);
  assert.deepEqual(swatches.filter((swatch) => swatch.selected).map((swatch) => swatch.name), ['yellow']);
});
