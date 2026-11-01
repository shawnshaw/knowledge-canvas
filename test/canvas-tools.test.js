import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_ENTRY_BASE_ACTIONS,
  TOPBAR_BOARD_ACTIONS,
  createToolEntryState,
  reduceToolEntry,
  toolEntryView,
} from '../src/canvas-tools.js';

test('the tool entry starts collapsed and offers no actions', () => {
  const view = toolEntryView(createToolEntryState());
  assert.equal(view.expanded, false);
  assert.equal(view.icon, 'plus');
  assert.equal(view.ariaLabel, '展开画板工具');
  assert.equal(view.ariaExpanded, 'false');
  assert.deepEqual(view.visibleActions, []);
});

test('expanding reveals the existing board actions', () => {
  const view = toolEntryView(reduceToolEntry(createToolEntryState(), { type: 'toggle' }));
  assert.equal(view.expanded, true);
  assert.equal(view.icon, 'x');
  assert.equal(view.ariaLabel, '收起画板工具');
  assert.equal(view.ariaExpanded, 'true');
  assert.deepEqual(view.visibleActions, TOOL_ENTRY_BASE_ACTIONS);
  assert.deepEqual(TOOL_ENTRY_BASE_ACTIONS, ['sticky', 'importFile', 'importFolder', 'layout']);
});

test('the tool entry no longer duplicates the ReadFlow import', () => {
  assert.equal(toolEntryView({ expanded: true }).visibleActions.includes('importReadFlow'), false);
  assert.equal(TOOL_ENTRY_BASE_ACTIONS.includes('importReadFlow'), false);
});

test('the top bar owns the ReadFlow import, immediately after New Board', () => {
  assert.deepEqual(TOPBAR_BOARD_ACTIONS, ['boardSelect', 'newBoard', 'importReadFlow', 'boardMenu']);
  assert.equal(TOPBAR_BOARD_ACTIONS.indexOf('importReadFlow'), TOPBAR_BOARD_ACTIONS.indexOf('newBoard') + 1);
});

test('board management is the last action in the top bar', () => {
  assert.equal(TOPBAR_BOARD_ACTIONS.at(-1), 'boardMenu');
});

test('toggling twice returns to the collapsed entry', () => {
  let state = reduceToolEntry(createToolEntryState(), { type: 'toggle' });
  state = reduceToolEntry(state, { type: 'toggle' });
  assert.equal(state.expanded, false);
  assert.deepEqual(toolEntryView(state).visibleActions, []);
});

test('collapse and expand are explicit, and unknown events are ignored', () => {
  assert.deepEqual(reduceToolEntry({ expanded: true }, { type: 'collapse' }), { expanded: false });
  assert.deepEqual(reduceToolEntry({ expanded: false }, { type: 'expand' }), { expanded: true });

  const state = { expanded: true };
  assert.equal(reduceToolEntry(state, { type: 'nope' }), state);
  assert.equal(reduceToolEntry(state, undefined), state);
  assert.equal(toolEntryView(undefined).expanded, false);
  assert.equal(toolEntryView(null).icon, 'plus');
});
