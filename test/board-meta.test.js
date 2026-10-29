import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_META_VERSION,
  boardNoteFolder,
  createBoardMeta,
  normalizeBoardNoteFolder,
  validateBoardMeta,
} from '../src/board-meta.js';

test('a note folder is normalized into a vault-safe path', () => {
  assert.equal(normalizeBoardNoteFolder('  Inbox/Canvas/读书 笔记  '), 'Inbox/Canvas/读书 笔记');
  assert.equal(normalizeBoardNoteFolder('Inbox//Canvas/'), 'Inbox/Canvas');
  assert.equal(normalizeBoardNoteFolder('Inbox/../Canvas'), 'Inbox/Canvas');
  assert.equal(normalizeBoardNoteFolder('Inbox/画布:名'), 'Inbox/画布_名');
  assert.equal(normalizeBoardNoteFolder(''), null);
});

test('creating meta records the normalized folder and the version', () => {
  assert.deepEqual(createBoardMeta({ noteFolder: 'Inbox/Canvas/读书' }), {
    version: BOARD_META_VERSION,
    noteFolder: 'Inbox/Canvas/读书',
  });
  assert.throws(() => createBoardMeta({ noteFolder: '   ' }), /不能为空/);
});

test('a board without kcMeta is a normal legacy board', () => {
  assert.equal(validateBoardMeta(undefined), null);
  assert.equal(validateBoardMeta(null), null);
  assert.equal(boardNoteFolder({ nodes: [], edges: [] }), null);
});

test('valid meta is accepted with or without a note folder', () => {
  assert.equal(validateBoardMeta({ version: 1, noteFolder: 'Inbox/Canvas/书' }), null);
  assert.equal(validateBoardMeta({ version: 1 }), null);
});

test('malformed meta is rejected instead of being ignored', () => {
  assert.match(validateBoardMeta([]), /对象/);
  assert.match(validateBoardMeta('meta'), /对象/);
  assert.match(validateBoardMeta({ version: 2 }), /不支持的画布扩展版本/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: '' }), /非空字符串/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: 42 }), /非空字符串/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: '/Inbox' }), /斜杠/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: 'Inbox/' }), /斜杠/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: 'Inbox/../Canvas' }), /非法路径片段/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: 'Inbox//Canvas' }), /非法路径片段/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: 'Inbox/画布:名' }), /非法字符/);
  assert.match(validateBoardMeta({ version: 1, noteFolder: 'Inbox\\Canvas' }), /非法字符/);
});

test('boardNoteFolder reads only a present, non-empty folder', () => {
  assert.equal(boardNoteFolder({ kcMeta: { version: 1, noteFolder: 'Inbox/Canvas/书' } }), 'Inbox/Canvas/书');
  assert.equal(boardNoteFolder({ kcMeta: { version: 1 } }), null);
  assert.equal(boardNoteFolder({ kcMeta: null }), null);
});
