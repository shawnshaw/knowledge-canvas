import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeBoardNoteFolder,
  applyBoardRename,
  boardNameFromPath,
  canManageBoard,
  isInsideFolderPath,
  planBoardRename,
  renameBoardNoteFolder,
  rewriteFolderReferences,
  updateReadFlowBindings,
} from '../src/board-management.js';
import { BOARD_FOLDER, DEFAULT_BOARD_PATH, READFLOW_BOARD_FOLDER } from '../src/board-catalog.js';

const BOARD = `${BOARD_FOLDER}/读书笔记.canvas`;

function boardWith({ kcMeta, files = [] } = {}) {
  return {
    nodes: files.map((file, index) => ({ id: `n${index}`, type: 'file', file, x: 0, y: 0, width: 320, height: 220 })),
    edges: [],
    ...(kcMeta ? { kcMeta } : {}),
  };
}

test('the default board and ReadFlow book boards are protected', () => {
  assert.equal(canManageBoard(DEFAULT_BOARD_PATH).allowed, false);
  assert.match(canManageBoard(DEFAULT_BOARD_PATH).reason, /默认画布/);

  const readFlowBoard = `${READFLOW_BOARD_FOLDER}/674073.canvas`;
  assert.equal(canManageBoard(readFlowBoard).allowed, false);
  assert.match(canManageBoard(readFlowBoard).reason, /ReadFlow/);

  assert.equal(canManageBoard('Canvas/其他.canvas').allowed, false);
  assert.equal(canManageBoard(BOARD).allowed, true);
});

test('a board name loses its folder and extension', () => {
  assert.equal(boardNameFromPath(BOARD), '读书笔记');
  assert.equal(boardNameFromPath(`${BOARD_FOLDER}/a.B.C.canvas`), 'a.B.C');
});

test('renaming keeps the canvas in the managed folder and normalizes the name', () => {
  const plan = planBoardRename({ path: BOARD, name: '  日 常  ' });
  assert.deepEqual(plan, {
    name: '日 常',
    fromPath: BOARD,
    toPath: `${BOARD_FOLDER}/日 常.canvas`,
    noteFolder: null,
  });
});

test('an existing canvas, an unchanged name and an illegal name are refused', () => {
  const occupied = `${BOARD_FOLDER}/日记.canvas`;
  assert.throws(
    () => planBoardRename({ path: BOARD, name: '日记', existingPaths: [occupied] }),
    /画布已存在/,
  );
  assert.throws(() => planBoardRename({ path: BOARD, name: '读书笔记' }), /没有变化/);
  assert.throws(() => planBoardRename({ path: BOARD, name: '  ' }), /画布名称/);
  assert.throws(() => planBoardRename({ path: BOARD, name: '..' }), /画布名称/);
});

test('the default board cannot be renamed even with a valid name', () => {
  assert.throws(() => planBoardRename({ path: DEFAULT_BOARD_PATH, name: '新名字' }), /默认画布/);
});

test('the note folder follows the canvas name only when asked', () => {
  const noteFolder = 'Inbox/Canvas/读书笔记';
  const untouched = planBoardRename({ path: BOARD, name: '日记', noteFolder });
  assert.equal(untouched.noteFolder, null);

  const moved = planBoardRename({ path: BOARD, name: '日记', noteFolder, renameNoteFolder: true });
  assert.deepEqual(moved.noteFolder, { from: noteFolder, to: 'Inbox/Canvas/日记' });
});

test('a taken note folder refuses the rename before any file moves', () => {
  assert.throws(
    () => planBoardRename({
      path: BOARD,
      name: '日记',
      noteFolder: 'Inbox/Canvas/读书笔记',
      renameNoteFolder: true,
      folderPaths: ['Inbox', 'Inbox/Canvas', 'Inbox/Canvas/日记'],
    }),
    /专属笔记文件夹已存在/,
  );
});

test('the folder rename keeps the parent directory', () => {
  assert.equal(renameBoardNoteFolder('A/B/读书笔记', '日记'), 'A/B/日记');
  assert.equal(renameBoardNoteFolder('读书笔记', '日记'), '日记');
  assert.equal(renameBoardNoteFolder('', '日记'), null);
  assert.equal(renameBoardNoteFolder(null, '日记'), null);
});

test('folder containment is prefix-based and never matches a sibling folder', () => {
  assert.equal(isInsideFolderPath('Inbox/Canvas/读书笔记/a.md', 'Inbox/Canvas/读书笔记'), true);
  assert.equal(isInsideFolderPath('Inbox/Canvas/读书笔记2/a.md', 'Inbox/Canvas/读书笔记'), false);
  assert.equal(isInsideFolderPath('a.md', ''), false);
});

test('renaming a board rewrites its own metadata and every reference in the folder', () => {
  const board = {
    ...boardWith({
      kcMeta: { version: 1, noteFolder: 'Inbox/Canvas/读书笔记' },
      files: ['Inbox/Canvas/读书笔记/一.md', 'Inbox/Canvas/别处.md'],
    }),
    edges: [],
  };
  board.nodes.push({
    id: 'ex',
    type: 'text',
    text: '',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    kcExcerpt: { sourceFile: 'Inbox/Canvas/读书笔记/二.md', quote: 'q' },
  });

  const plan = planBoardRename({ path: BOARD, name: '日记', noteFolder: 'Inbox/Canvas/读书笔记', renameNoteFolder: true });
  const next = applyBoardRename(board, plan);

  assert.equal(next.kcMeta.noteFolder, 'Inbox/Canvas/日记');
  assert.equal(next.nodes[0].file, 'Inbox/Canvas/日记/一.md');
  assert.equal(next.nodes[1].file, 'Inbox/Canvas/别处.md');
  assert.equal(next.nodes[2].kcExcerpt.sourceFile, 'Inbox/Canvas/日记/二.md');
  assert.equal(board.nodes[0].file, 'Inbox/Canvas/读书笔记/一.md', 'the original board is never mutated');
});

test('a rename that moves no folder leaves the board untouched', () => {
  const board = boardWith({ kcMeta: { version: 1, noteFolder: 'Inbox/Canvas/读书笔记' }, files: ['Inbox/Canvas/读书笔记/一.md'] });
  const plan = planBoardRename({ path: BOARD, name: '日记', noteFolder: 'Inbox/Canvas/读书笔记' });
  assert.equal(applyBoardRename(board, plan), board);
});

test('other boards only lose the references that moved', () => {
  const board = boardWith({ files: ['Inbox/Canvas/读书笔记/一.md', 'Inbox/Canvas/其他/二.md'] });
  const next = rewriteFolderReferences(board, 'Inbox/Canvas/读书笔记', 'Inbox/Canvas/日记');
  assert.equal(next.nodes[0].file, 'Inbox/Canvas/日记/一.md');
  assert.equal(next.nodes[1].file, 'Inbox/Canvas/其他/二.md');
  assert.equal(rewriteFolderReferences(board, 'Inbox/Canvas/读书笔记', 'Inbox/Canvas/读书笔记'), board);
  assert.equal(rewriteFolderReferences(board, '', 'x'), board);
});

test('an empty note folder may be deleted with its board', () => {
  const analysis = analyzeBoardNoteFolder({
    folderPath: 'Inbox/Canvas/读书笔记',
    files: [],
    folders: ['Inbox', 'Inbox/Canvas', 'Inbox/Canvas/读书笔记'],
    board: boardWith(),
  });
  assert.equal(analysis.deletable, true);
  assert.equal(analysis.reason, '');
  assert.equal(analysis.fileCount, 0);
});

test('a note folder whose Markdown is entirely referenced may be deleted', () => {
  const analysis = analyzeBoardNoteFolder({
    folderPath: 'Inbox/Canvas/读书笔记',
    files: [{ path: 'Inbox/Canvas/读书笔记/一.md' }, 'Inbox/Canvas/读书笔记/二.md'],
    folders: ['Inbox/Canvas/读书笔记'],
    board: boardWith({ files: ['Inbox/Canvas/读书笔记/一.md'] }),
  });
  // 二.md 没有被引用，所以这里必须被拦下
  assert.equal(analysis.deletable, false);
  assert.deepEqual(analysis.unreferenced, ['Inbox/Canvas/读书笔记/二.md']);

  const fullyReferenced = analyzeBoardNoteFolder({
    folderPath: 'Inbox/Canvas/读书笔记',
    files: ['Inbox/Canvas/读书笔记/一.md', 'Inbox/Canvas/读书笔记/二.md'],
    folders: ['Inbox/Canvas/读书笔记'],
    board: boardWith({ files: ['Inbox/Canvas/读书笔记/一.md', 'Inbox/Canvas/读书笔记/二.md'] }),
  });
  assert.equal(fullyReferenced.deletable, true);
  assert.equal(fullyReferenced.fileCount, 2);
});

test('an excerpt sticker also counts as a reference', () => {
  const board = boardWith();
  board.nodes.push({
    id: 'ex', type: 'text', text: '', x: 0, y: 0, width: 200, height: 100,
    kcExcerpt: { sourceFile: 'Inbox/Canvas/读书笔记/二.md', quote: 'q' },
  });
  const analysis = analyzeBoardNoteFolder({
    folderPath: 'Inbox/Canvas/读书笔记',
    files: ['Inbox/Canvas/读书笔记/二.md'],
    folders: [],
    board,
  });
  assert.equal(analysis.deletable, true);
});

test('unrelated Markdown, non-Markdown files and subfolders block the folder delete', () => {
  const board = boardWith({ files: ['Inbox/Canvas/读书笔记/一.md'] });
  const folderPath = 'Inbox/Canvas/读书笔记';

  const foreignFile = analyzeBoardNoteFolder({
    folderPath,
    files: [`${folderPath}/一.md`, `${folderPath}/图.png`],
    folders: [folderPath],
    board,
  });
  assert.equal(foreignFile.deletable, false);
  assert.match(foreignFile.reason, /非 Markdown/);

  const subfolder = analyzeBoardNoteFolder({
    folderPath,
    files: [`${folderPath}/一.md`],
    folders: [folderPath, `${folderPath}/附件`],
    board,
  });
  assert.equal(subfolder.deletable, false);
  assert.match(subfolder.reason, /子文件夹/);

  const foreignMarkdown = analyzeBoardNoteFolder({
    folderPath,
    files: [`${folderPath}/一.md`, 'Inbox/其他/二.md'],
    folders: [folderPath],
    board,
  });
  assert.equal(foreignMarkdown.deletable, true, 'outside the folder is not this board\'s business');
});

test('a board without a note folder never offers a folder delete', () => {
  const analysis = analyzeBoardNoteFolder({ folderPath: '', files: [], folders: [], board: boardWith() });
  assert.equal(analysis.deletable, false);
  assert.match(analysis.reason, /没有专属笔记文件夹/);
});

test('ReadFlow bindings follow a renamed board and are dropped with a deleted one', () => {
  const bindings = { bookA: BOARD, bookB: 'Canvas/其他.canvas' };

  const renamed = updateReadFlowBindings(bindings, { from: BOARD, to: `${BOARD_FOLDER}/日记.canvas` });
  assert.equal(renamed.changed, true);
  assert.deepEqual(renamed.bindings, { bookA: `${BOARD_FOLDER}/日记.canvas`, bookB: 'Canvas/其他.canvas' });

  const deleted = updateReadFlowBindings(bindings, { from: BOARD, to: null });
  assert.equal(deleted.changed, true);
  assert.deepEqual(deleted.bindings, { bookB: 'Canvas/其他.canvas' });

  const untouched = updateReadFlowBindings(bindings, { from: 'Canvas/别的.canvas', to: 'Canvas/x.canvas' });
  assert.equal(untouched.changed, false);
  assert.deepEqual(untouched.bindings, bindings);
  assert.deepEqual(updateReadFlowBindings(undefined, { from: BOARD }), { bindings: {}, changed: false });
});
