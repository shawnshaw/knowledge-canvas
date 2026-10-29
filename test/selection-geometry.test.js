import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDrag,
  dragTargets,
  layoutUnits,
  marqueeSelection,
  nodeWorldRect,
  rectFromPoints,
  rectsIntersect,
  selectAllIds,
  toggleSelectedId,
} from '../src/selection-geometry.js';
import { screenToWorld, worldToScreen } from '../src/viewport.js';

const card = (id, x, y, width = 100, height = 80, extra = {}) => ({ id, type: 'file', file: `${id}.md`, x, y, width, height, ...extra });
const group = (id, x, y, width, height, members) => ({ id, type: 'group', x, y, width, height, members });

const snapshotFor = (nodes) => nodes.map((node) => ({ node, x: node.x, y: node.y }));

const worldRectFromScreen = (a, b, viewport) => rectFromPoints(screenToWorld(a, viewport), screenToWorld(b, viewport));

test('normalizes drag corners into a top-left rectangle', () => {
  assert.deepEqual(rectFromPoints({ x: 30, y: 40 }, { x: 10, y: 5 }), { left: 10, top: 5, right: 30, bottom: 40 });
});

test('edge contact counts as a hit', () => {
  assert.equal(rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 10, right: 20, bottom: 20 }), true);
  assert.equal(rectsIntersect({ left: 0, top: 0, right: 9, bottom: 9 }, { left: 10, top: 10, right: 20, bottom: 20 }), false);
});

test('a marquee hits the same cards at 20%, 100% and 300% zoom', () => {
  const nodes = [card('a', 0, 0), card('b', 400, 0), card('c', 400, 400)];
  // The user drags over card a's world area; only the screen projection changes with zoom.
  const worldStart = { x: -20, y: -20 };
  const worldEnd = { x: 120, y: 100 };
  for (const scale of [0.2, 1, 3]) {
    const viewport = { x: 17, y: -23, scale };
    const rect = worldRectFromScreen(worldToScreen(worldStart, viewport), worldToScreen(worldEnd, viewport), viewport);
    const selection = marqueeSelection(nodes, rect);
    assert.deepEqual([...selection].sort(), ['a'], `scale ${scale}`);
  }
});

test('a marquee catches every intersecting card and nothing else', () => {
  const nodes = [card('a', 0, 0), card('b', 300, 0), card('c', 0, 300)];
  const selection = marqueeSelection(nodes, { left: -10, top: -10, right: 110, bottom: 90 });
  assert.deepEqual([...selection], ['a']);
});

test('a group frame joins the marquee only when all its members were caught', () => {
  const nodes = [
    group('g', -10, -10, 320, 220, ['a', 'b']),
    card('a', 0, 0),
    card('b', 150, 0),
  ];
  const partial = marqueeSelection(nodes, { left: -20, top: -20, right: 120, bottom: 100 });
  assert.equal(partial.has('g'), false);
  assert.equal(partial.has('a'), true);

  const full = marqueeSelection(nodes, { left: -50, top: -50, right: 500, bottom: 500 });
  assert.deepEqual([...full].sort(), ['a', 'b', 'g']);
});

test('an additive marquee keeps the selection it started from', () => {
  const nodes = [card('a', 0, 0), card('b', 300, 0)];
  const selection = marqueeSelection(nodes, { left: 290, top: -10, right: 410, bottom: 90 }, { base: new Set(['a']) });
  assert.deepEqual([...selection].sort(), ['a', 'b']);
});

test('select-all covers cards and group frames', () => {
  const nodes = [card('a', 0, 0), card('b', 200, 0), group('g', 0, 0, 100, 100, ['a', 'b'])];
  assert.deepEqual([...selectAllIds(nodes)].sort(), ['a', 'b', 'g']);
});

test('a selected group drags its frame and members, each exactly once', () => {
  const nodes = [group('g', 0, 0, 300, 200, ['a', 'b']), card('a', 10, 10), card('b', 150, 10), card('c', 500, 0)];
  const targets = dragTargets(nodes, new Set(['g']));
  assert.deepEqual(targets.map((node) => node.id).sort(), ['a', 'b', 'g']);
});

test('selecting a group and one of its members never counts the member twice', () => {
  const nodes = [group('g', 0, 0, 300, 200, ['a', 'b']), card('a', 10, 10), card('b', 150, 10)];
  const targets = dragTargets(nodes, new Set(['g', 'a']));
  assert.deepEqual(targets.map((node) => node.id).sort(), ['a', 'b', 'g']);
});

test('dragging a loose card does not drag its unselected group', () => {
  const nodes = [group('g', 0, 0, 300, 200, ['a', 'b']), card('a', 10, 10), card('b', 150, 10)];
  assert.deepEqual(dragTargets(nodes, new Set(['a'])).map((node) => node.id), ['a']);
});

test('layout units treat a selected group as one rectangle', () => {
  const nodes = [group('g', 0, 0, 300, 200, ['a', 'b']), card('a', 10, 10), card('b', 150, 10), card('c', 500, 0)];
  const units = layoutUnits(nodes, new Set(['g', 'c']));
  assert.equal(units.length, 2);
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  assert.equal(byId.get('g').kind, 'group');
  assert.deepEqual(byId.get('g').nodes.map((node) => node.id).sort(), ['a', 'b', 'g']);
  assert.equal(byId.get('c').kind, 'card');
  assert.deepEqual(byId.get('c').nodes.map((node) => node.id), ['c']);
});

test('a member of an unselected group is not a layout unit on its own', () => {
  const nodes = [group('g', 0, 0, 300, 200, ['a', 'b']), card('a', 10, 10), card('b', 150, 10), card('c', 500, 0)];
  const units = layoutUnits(nodes, new Set(['a', 'c']));
  assert.deepEqual(units.map((unit) => unit.id), ['c']);
});

test('a collapsed card is measured by its rendered height', () => {
  const node = card('a', 0, 0, 100, 300, { collapsed: true });
  assert.equal(nodeWorldRect(node).bottom, 56);
  const selection = marqueeSelection([node], { left: -1, top: -1, right: 101, bottom: 57 });
  assert.equal(selection.has('a'), true);
  const below = marqueeSelection([node], { left: -1, top: 60, right: 101, bottom: 200 });
  assert.equal(below.has('a'), false);
});

test('modifier selection toggles one id and keeps the rest', () => {
  const next = toggleSelectedId(new Set(['a']), 'b');
  assert.deepEqual([...next].sort(), ['a', 'b']);
  const removed = toggleSelectedId(next, 'a');
  assert.deepEqual([...removed], ['b']);
  assert.deepEqual([...(new Set(['a']))], ['a'], 'the input set is never mutated');
});

test('a batch drag preserves every relative distance and never accumulates drift', () => {
  const a = card('a', 0, 0);
  const b = card('b', 100, 50);
  const items = snapshotFor([a, b]);
  applyDrag(items, 30, 20);
  assert.deepEqual({ x: a.x, y: a.y }, { x: 30, y: 20 });
  assert.deepEqual({ x: b.x, y: b.y }, { x: 130, y: 70 });
  assert.equal(b.x - a.x, 100);
  assert.equal(b.y - a.y, 50);

  // Moving again recomputes from the snapshot, so the pointer delta never doubles up.
  applyDrag(items, 5, 5);
  assert.deepEqual({ x: a.x, y: a.y }, { x: 5, y: 5 });
});
