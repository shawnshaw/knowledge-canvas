import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBEDDED_API_VERSION,
  createEmbeddedLeaf,
  defaultReadFlowBoardPath,
  reconcileReadFlowBoard,
  seedReadFlowBoard,
  syncReadFlowHighlights,
} from '../src/embedded-board.js';

test('exposes a stable API version for the embedded runtime', () => {
  assert.equal(EMBEDDED_API_VERSION, 1);
});

test('gives an embedded ItemView the host container its constructor requires', () => {
  const workspace = {};
  const app = { workspace };
  const host = {};
  const leaf = createEmbeddedLeaf(app, host);
  assert.equal(leaf.app, app);
  assert.equal(leaf.workspace, workspace);
  assert.equal(leaf.containerEl, host);
  assert.deepEqual(leaf.history.backHistory, []);
  assert.deepEqual(leaf.history.forwardHistory, []);
  assert.equal(leaf.history.owner, leaf);
});

test('maps a book to a per-book board under the ReadFlow folder', () => {
  assert.equal(
    defaultReadFlowBoardPath({ bookId: 'rf-123', title: '纳瓦尔宝典' }),
    'Canvas/Knowledge Canvas/ReadFlow/rf-123.canvas',
  );
});

test('sanitizes the book id and requires it to be non-empty', () => {
  assert.equal(
    defaultReadFlowBoardPath({ bookId: 'a/b:c', title: 'X' }),
    'Canvas/Knowledge Canvas/ReadFlow/a_b_c.canvas',
  );
  assert.throws(() => defaultReadFlowBoardPath({ bookId: '', title: 'X' }), /book id/i);
  assert.throws(() => defaultReadFlowBoardPath({ bookId: '///', title: 'X' }), /book id/i);
  assert.throws(() => defaultReadFlowBoardPath({ title: 'X' }), /book id/i);
});

test('a renamed book resolves to the same board because the title is not part of the path', () => {
  assert.equal(
    defaultReadFlowBoardPath({ bookId: 'rf-123', title: '旧书名' }),
    defaultReadFlowBoardPath({ bookId: 'rf-123', title: '新书名' }),
  );
});

test('seeds a board with one deterministic card per unique Markdown highlight', () => {
  const board = { nodes: [], edges: [] };
  seedReadFlowBoard(board, ['Books/A/hl-1.md', 'Books/A/hl-2.md', 'Books/A/hl-1.md', 'Books/A/not-md.txt']);
  assert.equal(board.nodes.length, 2);
  assert.equal(board.edges.length, 0);
  assert.ok(board.nodes.every((node) => node.type === 'file'));
  assert.deepEqual(board.nodes.map((node) => node.file), ['Books/A/hl-1.md', 'Books/A/hl-2.md']);
  // Deterministic grid: first card at origin, second one row down the first column.
  assert.deepEqual(board.nodes[0], { id: board.nodes[0].id, type: 'file', file: 'Books/A/hl-1.md', x: 0, y: 0, width: 320, height: 220 });
  assert.equal(board.nodes[1].x, 0);
  assert.equal(board.nodes[1].y, 260);
});

test('wraps the seed grid into columns instead of growing without bound', () => {
  const board = { nodes: [], edges: [] };
  seedReadFlowBoard(board, Array.from({ length: 9 }, (_, i) => `Books/hl-${i}.md`));
  assert.equal(board.nodes.length, 9);
  assert.deepEqual(board.nodes.slice(0, 8).map((node) => node.x), Array(8).fill(0));
  assert.equal(board.nodes[8].x, 360);
  assert.equal(board.nodes[8].y, 0);
});

test('syncReadFlowHighlights adds only missing cards and leaves existing ones untouched', () => {
  const board = { nodes: [], edges: [] };
  seedReadFlowBoard(board, ['Books/A/hl-1.md', 'Books/A/hl-2.md']);
  const before = JSON.parse(JSON.stringify(board.nodes));

  // New highlight + duplicates (one already on the board, one within the input).
  const added = syncReadFlowHighlights(board, [
    'Books/A/hl-1.md', // already present
    'Books/A/hl-3.md', // new
    'Books/A/hl-3.md', // input duplicate
    'Books/A/note.txt', // non-Markdown, ignored
  ]);

  assert.equal(added, 1);
  assert.equal(board.nodes.length, 3);
  assert.equal(board.nodes[2].type, 'file');
  assert.equal(board.nodes[2].file, 'Books/A/hl-3.md');
  // The original two cards are byte-for-byte unchanged (same id, position and geometry).
  assert.deepEqual(board.nodes.slice(0, 2), before);
  // The new card continues to the right of the two seeded cards (0+320 right edge, 40 gap).
  assert.equal(board.nodes[2].x, 360);
  assert.equal(board.nodes[2].y, 0);
});

test('incremental cards are placed clear of cards the user has moved', () => {
  const board = { nodes: [], edges: [] };
  seedReadFlowBoard(board, ['Books/A/hl-1.md', 'Books/A/hl-2.md']);
  // The user drags the first card far to the right and down.
  board.nodes[0].x = 1000;
  board.nodes[0].y = 500;

  const added = syncReadFlowHighlights(board, ['Books/A/hl-3.md']);
  assert.equal(added, 1);
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  assert.equal(overlaps(board.nodes[2], board.nodes[0]), false);
  assert.equal(overlaps(board.nodes[2], board.nodes[1]), false);
});

test('reconcileReadFlowBoard reports no additions when the board is already complete', () => {
  const board = { nodes: [], edges: [] };
  seedReadFlowBoard(board, ['Books/A/hl-1.md']);
  const result = reconcileReadFlowBoard(board, ['Books/A/hl-1.md']);
  assert.equal(result.created, false);
  assert.equal(result.addedCount, 0);
  assert.equal(result.board, board);
  assert.equal(board.nodes.length, 1);
});

test('reconcileReadFlowBoard creates and seeds a missing board', () => {
  const result = reconcileReadFlowBoard(null, ['Books/A/hl-1.md', 'Books/A/hl-2.md']);
  assert.equal(result.created, true);
  assert.equal(result.addedCount, 2);
  assert.deepEqual(result.board.nodes.map((node) => node.file), ['Books/A/hl-1.md', 'Books/A/hl-2.md']);
});
