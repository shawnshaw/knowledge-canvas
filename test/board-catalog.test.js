import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_FOLDER,
  DEFAULT_BOARD_PATH,
  READFLOW_BOARD_FOLDER,
  boardPathForName,
  isReadFlowBoardPath,
  listManagedBoards,
  listReadFlowBoards,
  normalizeBoardName,
} from '../src/board-catalog.js';

test('keeps the legacy board as the default entry', () => {
  assert.equal(DEFAULT_BOARD_PATH, 'Canvas/知识画板.canvas');
  assert.equal(BOARD_FOLDER, 'Canvas/Knowledge Canvas');
});

test('lists the legacy default plus only managed boards', () => {
  const paths = [
    'Canvas/知识画板.canvas',
    'Canvas/Other.canvas',
    'Canvas/Knowledge Canvas/读书.canvas',
    'Notes/NotABoard.md',
  ];
  assert.deepEqual(listManagedBoards(paths).map((item) => item.path), [
    'Canvas/知识画板.canvas',
    'Canvas/Knowledge Canvas/读书.canvas',
  ]);
});

test('marks the legacy board as the default and sorts the rest by name', () => {
  const boards = listManagedBoards([
    'Canvas/Knowledge Canvas/乙.canvas',
    'Canvas/Knowledge Canvas/甲.canvas',
  ]);
  assert.equal(boards[0].path, DEFAULT_BOARD_PATH);
  assert.equal(boards[0].isDefault, true);
  assert.deepEqual(boards.slice(1).map((item) => item.name), ['甲', '乙']);
  assert.deepEqual(boards.slice(1).map((item) => item.isDefault), [false, false]);
});

test('always offers the legacy default even before it exists on disk', () => {
  assert.deepEqual(listManagedBoards([]).map((item) => item.path), [DEFAULT_BOARD_PATH]);
});

test('normalizes names without allowing traversal', () => {
  assert.equal(boardPathForName(' 读书 / 2026 '), 'Canvas/Knowledge Canvas/读书 _ 2026.canvas');
  assert.equal(normalizeBoardName('  读书  '), '读书');
  assert.throws(() => normalizeBoardName(' ../.. '), /name/i);
  assert.throws(() => normalizeBoardName('a/../b'), /name/i);
  assert.throws(() => normalizeBoardName('   '), /name/i);
  assert.throws(() => normalizeBoardName('.'), /name/i);
});

test('replaces characters that are illegal in vault file names', () => {
  assert.equal(normalizeBoardName('a:b*c?d"e<f>g|h\\i'), 'a_b_c_d_e_f_g_h_i');
  assert.equal(boardPathForName('读书').startsWith(`${BOARD_FOLDER}/`), true);
});

test('ReadFlow book canvases are recognised and kept out of the switcher', () => {
  assert.equal(READFLOW_BOARD_FOLDER, 'Canvas/Knowledge Canvas/ReadFlow');
  assert.equal(isReadFlowBoardPath('Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas'), true);
  assert.equal(isReadFlowBoardPath('Canvas/Knowledge Canvas/ReadFlowExtra.canvas'), false);
  assert.equal(isReadFlowBoardPath('Canvas/Knowledge Canvas/读书.canvas'), false);

  const paths = [
    'Canvas/知识画板.canvas',
    'Canvas/Knowledge Canvas/读书.canvas',
    'Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas',
  ];
  assert.deepEqual(listManagedBoards(paths).map((item) => item.path), [
    'Canvas/知识画板.canvas',
    'Canvas/Knowledge Canvas/读书.canvas',
  ]);
});

test('rename maintenance reaches ReadFlow canvases that the switcher hides', () => {
  const paths = [
    'Canvas/知识画板.canvas',
    'Canvas/Knowledge Canvas/读书.canvas',
    'Canvas/Knowledge Canvas/ReadFlow/rf-2-另一本.canvas',
    'Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas',
  ];
  assert.deepEqual(listReadFlowBoards(paths).map((item) => item.path), [
    'Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas',
    'Canvas/Knowledge Canvas/ReadFlow/rf-2-另一本.canvas',
  ]);
  // The switcher and the maintenance sweep together cover every managed canvas.
  const maintained = new Set(
    [...listManagedBoards(paths), ...listReadFlowBoards(paths)].map((item) => item.path),
  );
  assert.ok(maintained.has('Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas'));
  assert.ok(maintained.has('Canvas/Knowledge Canvas/读书.canvas'));
  assert.ok(maintained.has(DEFAULT_BOARD_PATH));
});
