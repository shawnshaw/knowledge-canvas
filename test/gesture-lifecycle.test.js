import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, createFileNode } from '../src/board-model.js';
import { cancelGestureGeometry, isPanGesture } from '../src/gesture-lifecycle.js';
import { snapshotGeometry } from '../src/board-model.js';
import { applyDrag } from '../src/selection-geometry.js';

function setup() {
  const board = createBoard();
  board.nodes.push(createFileNode('A.md', { x: 0, y: 0 }), createFileNode('B.md', { x: 300, y: 0 }));
  return board;
}

test('a cancelled move restores every dragged node', () => {
  const board = setup();
  const items = snapshotGeometry(board.nodes);
  applyDrag(items, 50, 60);
  assert.deepEqual({ x: board.nodes[0].x, y: board.nodes[0].y }, { x: 50, y: 60 });

  const result = cancelGestureGeometry(board, { kind: 'move', nodes: items });
  assert.deepEqual(result, { kind: 'move', restored: true });
  assert.deepEqual({ x: board.nodes[0].x, y: board.nodes[0].y }, { x: 0, y: 0 });
  assert.deepEqual({ x: board.nodes[1].x, y: board.nodes[1].y }, { x: 300, y: 0 });
});

test('a cancelled resize restores the original size', () => {
  const board = setup();
  const items = snapshotGeometry([board.nodes[0]]);
  board.nodes[0].width = 900;
  board.nodes[0].height = 700;

  const result = cancelGestureGeometry(board, { kind: 'resize', nodes: items });
  assert.equal(result.restored, true);
  assert.equal(board.nodes[0].width, 320);
  assert.equal(board.nodes[0].height, 220);
});

test('a cancelled group drag restores the frame and its members', () => {
  const board = setup();
  const items = snapshotGeometry(board.nodes);
  applyDrag(items, -20, -20);
  const result = cancelGestureGeometry(board, { kind: 'group-move', nodes: items });
  assert.equal(result.restored, true);
  assert.deepEqual({ x: board.nodes[0].x, y: board.nodes[0].y }, { x: 0, y: 0 });
});

test('non-geometry gestures never touch the board', () => {
  const board = setup();
  const before = JSON.stringify(board);
  for (const kind of ['marquee', 'pan', 'connect']) {
    const result = cancelGestureGeometry(board, { kind });
    assert.deepEqual(result, { kind, restored: false });
    assert.equal(JSON.stringify(board), before);
  }
  assert.deepEqual(cancelGestureGeometry(board, null), { kind: null, restored: false });
});

test('a pan gesture is identified so the viewport can be restored separately', () => {
  assert.equal(isPanGesture({ kind: 'pan' }), true);
  assert.equal(isPanGesture({ kind: 'move' }), false);
  assert.equal(isPanGesture(null), false);
});
