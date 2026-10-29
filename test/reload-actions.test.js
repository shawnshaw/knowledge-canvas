import test from 'node:test';
import assert from 'node:assert/strict';
import { RELOAD_ACTIONS, findReloadAction, resolveReloadAction, runReloadAction } from '../src/reload-actions.js';

test('exposes exactly the two reload actions the topbar menu needs', () => {
  assert.deepEqual(RELOAD_ACTIONS.map((action) => action.id), ['board', 'plugin']);
  for (const action of RELOAD_ACTIONS) {
    assert.equal(typeof action.title, 'string');
    assert.ok(action.title.length > 0);
    assert.equal(typeof action.icon, 'string');
  }
});

test('looks an action up by id', () => {
  assert.equal(findReloadAction('plugin').title, '重载插件代码');
  assert.equal(findReloadAction('nope'), null);
});

test('rejects an unknown action id instead of running nothing quietly', () => {
  const resolved = resolveReloadAction('nope');
  assert.equal(resolved.ok, false);
  assert.match(resolved.reason, /nope/);
});

test('blocks the plugin reload while the floating editor is dirty', () => {
  const resolved = resolveReloadAction('plugin', { editorDirty: true });
  assert.equal(resolved.ok, false);
  assert.match(resolved.reason, /未保存/);
});

test('the dirty-editor guard does not block reloading the board', () => {
  assert.equal(resolveReloadAction('board', { editorDirty: true }).ok, true);
  assert.equal(resolveReloadAction('plugin', { editorDirty: false }).ok, true);
  assert.equal(resolveReloadAction('plugin').ok, true);
});

test('runs only the handler for the requested action', async () => {
  const called = [];
  const handlers = {
    board: async () => { called.push('board'); },
    plugin: async () => { called.push('plugin'); },
  };
  const result = await runReloadAction('plugin', {}, handlers);
  assert.deepEqual(called, ['plugin']);
  assert.equal(result.ok, true);
  assert.equal(result.action.id, 'plugin');
});

test('turns a rejected handler into a reason instead of throwing', async () => {
  const result = await runReloadAction('board', {}, {
    board: async () => { throw new Error('画板文件损坏'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, '画板文件损坏');
});

test('turns a synchronously throwing handler into a reason too', async () => {
  const result = await runReloadAction('board', {}, {
    board: () => { throw new Error('读盘失败'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, '读盘失败');
});

test('never calls a handler when the guard already refused', async () => {
  const called = [];
  const result = await runReloadAction('plugin', { editorDirty: true }, {
    plugin: async () => { called.push('plugin'); },
  });
  assert.deepEqual(called, []);
  assert.equal(result.ok, false);
});
