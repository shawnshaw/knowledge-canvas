import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputResult, normalizeBoardCreateInput, normalizeBoardNameInput, normalizeEdgeLabel, normalizeFilePath, normalizeStickyNote } from '../src/input-dialog-state.js';

test('submitting an input dialog resolves its field values', async () => {
  let settle;
  const result = new Promise((resolve) => { settle = createInputResult(resolve); });

  settle.submit({ title: '标题', body: '正文' });

  assert.deepEqual(await result, { title: '标题', body: '正文' });
});

test('cancelling an input dialog resolves null', async () => {
  let settle;
  const result = new Promise((resolve) => { settle = createInputResult(resolve); });

  settle.cancel();

  assert.equal(await result, null);
});

test('an input dialog settles only once', async () => {
  let settle;
  const result = new Promise((resolve) => { settle = createInputResult(resolve); });

  settle.cancel();
  settle.submit({ label: '不应覆盖取消结果' });

  assert.equal(await result, null);
});

test('a sticky note with a blank title cannot be submitted', () => {
  assert.equal(normalizeStickyNote({ title: '   ', body: '正文' }), null);
  assert.equal(normalizeStickyNote({ title: '', body: '正文' }), null);
  assert.equal(normalizeStickyNote({ body: '只有正文' }), null);
});

test('a sticky note title is trimmed', () => {
  assert.deepEqual(normalizeStickyNote({ title: '  复利 / 长期  ', body: '正文' }), {
    title: '复利 / 长期',
    body: '正文',
  });
});

test('a sticky note body may be empty', () => {
  assert.deepEqual(normalizeStickyNote({ title: '标题' }), { title: '标题', body: '' });
  assert.deepEqual(normalizeStickyNote({ title: ' 标题 ', body: '' }), { title: '标题', body: '' });
});

test('an empty relation label resolves to null for deletion', () => {
  assert.equal(normalizeEdgeLabel({ label: '' }), null);
  assert.equal(normalizeEdgeLabel({ label: '   ' }), null);
  assert.equal(normalizeEdgeLabel({}), null);
});

test('a relation label is trimmed and preserved when non-empty', () => {
  assert.equal(normalizeEdgeLabel({ label: '  引发了  ' }), '引发了');
});

test('a file path is trimmed on confirm and null on empty', () => {
  assert.equal(normalizeFilePath({ path: ' Inbox/Canvas/A.md ' }), 'Inbox/Canvas/A.md');
  assert.equal(normalizeFilePath({ path: '   ' }), null);
  assert.equal(normalizeFilePath({}), null);
});

test('a path dialog confirms with its value and cancels with null', async () => {
  let settle;
  const confirmed = new Promise((resolve) => { settle = createInputResult(resolve); });
  settle.submit({ path: 'Books/纳瓦尔宝典/纳瓦尔宝典.md' });
  assert.deepEqual(await confirmed, { path: 'Books/纳瓦尔宝典/纳瓦尔宝典.md' });

  let cancel;
  const cancelled = new Promise((resolve) => { cancel = createInputResult(resolve); });
  cancel.cancel();
  assert.equal(await cancelled, null);
});

test('a canvas name is trimmed, and whitespace cannot be submitted', () => {
  assert.deepEqual(normalizeBoardNameInput({ name: ' 读书 ' }), { name: '读书' });
  assert.deepEqual(normalizeBoardNameInput({ name: '读书 / 2026' }), { name: '读书 _ 2026' });
  assert.equal(normalizeBoardNameInput({ name: '   ' }), null);
  assert.equal(normalizeBoardNameInput({ name: '' }), null);
  assert.equal(normalizeBoardNameInput({}), null);
});

test('a canvas name cannot escape the managed folder', () => {
  assert.throws(() => normalizeBoardNameInput({ name: ' ../.. ' }), /name/i);
  assert.throws(() => normalizeBoardNameInput({ name: 'a/../b' }), /name/i);
});

test('the new-board checkbox is off unless it was explicitly ticked', () => {
  assert.deepEqual(normalizeBoardCreateInput({ name: '读书' }), { name: '读书', createNoteFolder: false });
  assert.deepEqual(normalizeBoardCreateInput({ name: '读书', createNoteFolder: false }), { name: '读书', createNoteFolder: false });
  assert.deepEqual(normalizeBoardCreateInput({ name: '读书', createNoteFolder: true }), { name: '读书', createNoteFolder: true });
  assert.equal(normalizeBoardCreateInput({ name: '   ', createNoteFolder: true }), null);
});
