import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoard,
  createFileNode,
  createGroup,
  isGroupNode,
  parseBoard,
  restoreGeometry,
  snapshotGeometry,
  ungroup,
} from '../src/board-model.js';
import { applyLayoutPatch, layoutPatch } from '../src/canvas-layout.js';
import { snapLines, snapRect, snapThreshold, dragBounds } from '../src/canvas-snap.js';
import { fitViewport, contentBounds } from '../src/content-viewport.js';
import { filesUnderFolder, layoutImportedCards, planImport } from '../src/board-import.js';
import { createBoardMeta, boardNoteFolder } from '../src/board-meta.js';
import { addParagraphTimestamp, stampChangedParagraphs } from '../src/paragraph-timestamp.js';
import { applyDrag, dragTargets, layoutUnits, marqueeSelection, selectAllIds } from '../src/selection-geometry.js';

const node = (path, x, y) => createFileNode(path, { x, y });

function boardWithFourCards() {
  const board = createBoard();
  board.nodes.push(node('Notes/A.md', 0, 0), node('Notes/B.md', 500, 0), node('Notes/C.md', 0, 400), node('Notes/D.md', 500, 400));
  return board;
}

test('select, arrange, drag and group a whole canvas without double moves', () => {
  const board = boardWithFourCards();
  const all = marqueeSelection(board.nodes, { left: -50, top: -50, right: 1000, bottom: 1000 });
  assert.deepEqual([...all].sort(), board.nodes.map((entry) => entry.id).sort());

  // Grid the whole selection.
  const units = layoutUnits(board.nodes, all);
  applyLayoutPatch(units, layoutPatch(units, 'grid'));
  const xs = board.nodes.map((entry) => entry.x);
  const ys = board.nodes.map((entry) => entry.y);
  assert.equal(new Set(xs).size, 2);
  assert.equal(new Set(ys).size, 2);

  // Drag the selection and check relative distances are preserved exactly.
  const before = new Map(board.nodes.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
  const items = snapshotGeometry(dragTargets(board.nodes, all));
  applyDrag(items, 40, 30);
  for (const entry of board.nodes) {
    assert.equal(entry.x, before.get(entry.id).x + 40);
    assert.equal(entry.y, before.get(entry.id).y + 30);
  }

  // Group two cards, then drag the frame: frame and members move, members once.
  const [first, second] = board.nodes;
  const group = createGroup([first, second], '读书');
  board.nodes.unshift(group);
  const groupItems = snapshotGeometry(dragTargets(board.nodes, new Set([group.id])));
  applyDrag(groupItems, 15, 15);
  assert.equal(dragTargets(board.nodes, new Set([group.id, first.id])).length, 3);
  ungroup(board, group.id);
  assert.equal(board.nodes.some((entry) => isGroupNode(entry)), false);
  assert.ok(first.x > 0 && second.x > 0, 'cards survive ungrouping');
});

test('a failed save restores every dragged node and its group frame', () => {
  const board = boardWithFourCards();
  const [a, b] = board.nodes;
  const group = createGroup([a, b], '');
  board.nodes.unshift(group);
  const snapshot = snapshotGeometry(dragTargets(board.nodes, new Set([group.id])));
  const original = { group: { x: group.x, y: group.y }, a: { x: a.x, y: a.y } };
  applyDrag(snapshot, 100, 100);
  assert.notDeepEqual({ x: a.x, y: a.y }, original.a);

  restoreGeometry(board, snapshot);
  assert.deepEqual({ x: a.x, y: a.y }, original.a);
  assert.deepEqual({ x: group.x, y: group.y }, original.group);
});

test('snapping measures in screen pixels and stays stable across zoom levels', () => {
  const board = boardWithFourCards();
  const moving = board.nodes[0];
  const lines = snapLines(board.nodes, new Set([moving.id]));
  const rect = { left: moving.x + 6, top: moving.y, width: moving.width, height: moving.height };
  // A 6-world-unit gap is inside 8 screen px at 100% and at 20% (where 8px = 40 world)…
  assert.notEqual(snapRect(rect, lines, { threshold: snapThreshold(1) }).dx, 0);
  assert.notEqual(snapRect(rect, lines, { threshold: snapThreshold(0.2) }).dx, 0);
  // …but at 300% the same gap is 18 screen px, far outside the 8px threshold.
  assert.equal(snapRect(rect, lines, { threshold: snapThreshold(3) }).dx, 0);
  assert.ok(dragBounds([moving]).width > 0);
});

test('importing a folder only adds unseen Markdown, laid out to the right', () => {
  const board = boardWithFourCards();
  const vault = [
    { path: 'Books/A.md', extension: 'md' },
    { path: 'Books/Sub/B.md', extension: 'md' },
    { path: 'Books/Sub/pic.png', extension: 'png' },
  ];
  const paths = filesUnderFolder(vault, 'Books').map((file) => file.path);
  const existing = board.nodes.map((entry) => entry.file);
  const plan = planImport(paths, [...existing, 'Books/A.md']);
  assert.deepEqual(plan.added, ['Books/Sub/B.md']);

  const placements = layoutImportedCards(plan.added, board.nodes);
  for (const { path, point } of placements) board.nodes.push(createFileNode(path, point));
  const bounds = contentBounds(board.nodes);
  assert.ok(placements.every(({ point }) => point.x >= bounds.left));

  const roundTrip = parseBoard(JSON.stringify(board));
  assert.equal(roundTrip.nodes.length, board.nodes.length);
});

test('a board-local note folder round-trips through kcMeta and beats the global one', () => {
  const board = createBoard();
  board.kcMeta = createBoardMeta({ noteFolder: 'Inbox/Canvas/读书' });
  const parsed = parseBoard(JSON.stringify(board));
  assert.equal(boardNoteFolder(parsed), 'Inbox/Canvas/读书');

  const legacy = parseBoard(JSON.stringify(createBoard()));
  assert.equal(boardNoteFolder(legacy), null, 'old boards keep the global folder');
});

test('timestamps survive a realistic edit-and-save cycle', () => {
  const original = '第一段。\n\n第二段。';
  const created = addParagraphTimestamp(original, 0, () => new Date('2026-10-17T14:30:00.000Z'));
  assert.equal(created.added, true);

  const noOp = stampChangedParagraphs(created.text, created.text, () => new Date('2026-10-17T15:00:00.000Z'));
  assert.equal(noOp.updated, 0);

  const edited = created.text.replace('第一段。', '第一段改写。');
  const stamped = stampChangedParagraphs(edited, created.text, () => new Date('2026-10-17T15:12:00.000Z'));
  assert.equal(stamped.updated, 1);
  assert.match(stamped.text, /"createdAt":"2026-10-17T14:30:00.000Z","updatedAt":"2026-10-17T15:12:00.000Z"/);
});

test('locating content fits every card and refuses an empty board', () => {
  const board = boardWithFourCards();
  const viewport = fitViewport(contentBounds(board.nodes), { width: 800, height: 600 });
  assert.ok(viewport.scale >= 0.2 && viewport.scale <= 3);
  assert.equal(fitViewport(contentBounds([]), { width: 800, height: 600 }), null);
});

test('select-all covers cards and frames without touching relations', () => {
  const board = boardWithFourCards();
  const group = createGroup([board.nodes[0], board.nodes[1]], '');
  board.nodes.unshift(group);
  assert.equal(selectAllIds(board.nodes).size, 5);
  assert.equal(selectAllIds(board.nodes).has('missing'), false);
});
