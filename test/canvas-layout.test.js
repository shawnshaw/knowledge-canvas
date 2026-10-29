import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_LAYOUT_GAP,
  applyLayoutPatch,
  isLayoutCommand,
  layoutPatch,
  unitRect,
} from '../src/canvas-layout.js';
import { layoutUnits } from '../src/selection-geometry.js';

const card = (id, x, y, width = 100, height = 80, extra = {}) => ({ id, type: 'file', file: `${id}.md`, x, y, width, height, ...extra });
const groupNode = (id, x, y, width, height, members) => ({ id, type: 'group', x, y, width, height, members });

const unitFor = (node) => ({ id: node.id, kind: 'card', nodes: [node] });
const positions = (patch) => Object.fromEntries(patch.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));

test('only the documented layout commands are accepted', () => {
  assert.equal(isLayoutCommand('grid'), true);
  assert.equal(isLayoutCommand('align-center'), true);
  assert.equal(isLayoutCommand('nuke'), false);
});

test('grid lays units out in reading order with uniform spacing', () => {
  const units = [
    unitFor(card('a', 0, 0)),
    unitFor(card('b', 500, 0)),
    unitFor(card('c', 0, 500)),
    unitFor(card('d', 500, 500)),
  ];
  const patch = positions(layoutPatch(units, 'grid', { gap: 20 }));
  assert.deepEqual(patch.a, { x: 0, y: 0 });
  assert.deepEqual(patch.b, { x: 120, y: 0 });
  assert.deepEqual(patch.c, { x: 0, y: 100 });
  assert.deepEqual(patch.d, { x: 120, y: 100 });
});

test('row places every unit on one line in left-to-right order', () => {
  const units = [unitFor(card('b', 400, 50)), unitFor(card('a', 0, 0))];
  const patch = positions(layoutPatch(units, 'row'));
  assert.deepEqual(patch.a, { x: 0, y: 0 });
  assert.deepEqual(patch.b, { x: 100 + CANVAS_LAYOUT_GAP, y: 0 });
});

test('column places every unit in one column in top-to-bottom order', () => {
  const units = [unitFor(card('b', 50, 400)), unitFor(card('a', 0, 0))];
  const patch = positions(layoutPatch(units, 'column'));
  assert.deepEqual(patch.a, { x: 0, y: 0 });
  assert.deepEqual(patch.b, { x: 0, y: 80 + CANVAS_LAYOUT_GAP });
});

test('the three horizontal alignments line units up on their bounding box', () => {
  const units = [unitFor(card('a', 0, 0)), unitFor(card('b', 200, 120))];
  assert.deepEqual(positions(layoutPatch(units, 'align-left')).b, { x: 0, y: 120 });
  assert.deepEqual(positions(layoutPatch(units, 'align-right')).a, { x: 200, y: 0 });
  // Bounding box spans 0..300, centre 150; a is 100 wide, b is 100 wide.
  assert.deepEqual(positions(layoutPatch(units, 'align-center')).a, { x: 100, y: 0 });
  assert.deepEqual(positions(layoutPatch(units, 'align-center')).b, { x: 100, y: 120 });
});

test('the three vertical alignments line units up on their bounding box', () => {
  const units = [unitFor(card('a', 0, 0)), unitFor(card('b', 300, 200))];
  assert.deepEqual(positions(layoutPatch(units, 'align-top')).b, { x: 300, y: 0 });
  assert.deepEqual(positions(layoutPatch(units, 'align-bottom')).a, { x: 0, y: 200 });
  // Bounding box spans 0..280, centre 140; both are 80 tall.
  assert.deepEqual(positions(layoutPatch(units, 'align-middle')).a, { x: 0, y: 100 });
  assert.deepEqual(positions(layoutPatch(units, 'align-middle')).b, { x: 300, y: 100 });
});

test('horizontal distribution keeps the outer units and equalizes the gaps', () => {
  const units = [unitFor(card('a', 0, 0)), unitFor(card('b', 150, 0)), unitFor(card('c', 400, 0))];
  // Span 0..500, widths 300 total, two gaps of 100.
  const patch = positions(layoutPatch(units, 'distribute-h'));
  assert.deepEqual(patch, { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 400, y: 0 } });
});

test('vertical distribution keeps the outer units and equalizes the gaps', () => {
  const units = [unitFor(card('a', 0, 0)), unitFor(card('b', 0, 150)), unitFor(card('c', 0, 400))];
  const patch = positions(layoutPatch(units, 'distribute-v'));
  assert.deepEqual(patch, { a: { x: 0, y: 0 }, b: { x: 0, y: 200 }, c: { x: 0, y: 400 } });
});

test('distribution leaves two units alone', () => {
  const units = [unitFor(card('a', 0, 0)), unitFor(card('b', 300, 0))];
  assert.deepEqual(positions(layoutPatch(units, 'distribute-h')), { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } });
});

test('a collapsed card takes part in layout at its rendered height', () => {
  const collapsed = card('a', 0, 0, 100, 300, { collapsed: true });
  assert.equal(unitRect(unitFor(collapsed)).height, 56);
  const patch = positions(layoutPatch([unitFor(collapsed), unitFor(card('b', 0, 400))], 'column'));
  assert.equal(patch.b.y, 56 + CANVAS_LAYOUT_GAP);
});

test('a group unit moves its frame and members by the same delta', () => {
  const group = groupNode('g', -32, -32, 364, 264, ['a', 'b']);
  const a = card('a', 0, 0);
  const b = card('b', 200, 0);
  const groupUnit = { id: 'g', kind: 'group', nodes: [group, a, b] };
  const loose = card('c', -500, 0);
  const units = [unitFor(loose), groupUnit];

  const patch = layoutPatch(units, 'row');
  applyLayoutPatch(units, patch);

  // c sits at -500; the group is placed one card + gap to its right, so -376. The row
  // aligns tops to the bounding box, which the taller group frame defines (-32).
  assert.deepEqual({ x: loose.x, y: loose.y }, { x: -500, y: -32 });
  assert.deepEqual({ x: group.x, y: group.y }, { x: -376, y: -32 });
  // Frame and members all moved by exactly the same horizontal delta.
  assert.deepEqual({ x: a.x, y: a.y }, { x: -344, y: 0 });
  assert.deepEqual({ x: b.x, y: b.y }, { x: -144, y: 0 });
});

test('layout units come from the real selection rules', () => {
  const nodes = [groupNode('g', 0, 0, 300, 200, ['a', 'b']), card('a', 10, 10), card('b', 150, 10), card('c', 500, 0)];
  const units = layoutUnits(nodes, new Set(['g', 'c']));
  const patch = positions(layoutPatch(units, 'row'));
  assert.deepEqual(Object.keys(patch).sort(), ['c', 'g']);
});
