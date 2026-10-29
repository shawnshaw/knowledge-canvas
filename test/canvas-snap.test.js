import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP_SCREEN_PX,
  dragBounds,
  snapLines,
  snapRect,
  snapThreshold,
} from '../src/canvas-snap.js';

const card = (id, x, y, width = 100, height = 80, extra = {}) => ({ id, type: 'file', file: `${id}.md`, x, y, width, height, ...extra });
const rect = (left, top, width = 100, height = 80) => ({ left, top, right: left + width, bottom: top + height, width, height });

test('the snap threshold is screen pixels converted through the current zoom', () => {
  assert.equal(snapThreshold(1), SNAP_SCREEN_PX);
  assert.equal(snapThreshold(0.2), 40);
  assert.equal(snapThreshold(3), SNAP_SCREEN_PX / 3);
  // A broken viewport falls back to the plain screen-pixel value instead of disabling snapping.
  assert.equal(snapThreshold(0), SNAP_SCREEN_PX);
  assert.equal(snapThreshold(Number.NaN), SNAP_SCREEN_PX);
});

test('candidate lines come from every stationary card, excluding the dragged ones', () => {
  const nodes = [card('a', 0, 0), card('b', 300, 100), { id: 'g', type: 'group', x: -10, y: -10, width: 420, height: 220, members: ['a', 'b'] }];
  const lines = snapLines(nodes, new Set(['a']));
  assert.equal(lines.xs.includes(0), false, 'the moving card must not snap to itself');
  assert.equal(lines.xs.includes(300), true);
  assert.equal(lines.xs.includes(-10), true, 'group frames are snap targets too');
  assert.equal(lines.ys.includes(100), true);
});

test('a rect snaps to the nearest line on each axis and reports the guide', () => {
  const lines = { xs: [0, 200, 500], ys: [0, 300] };
  // Near the 200 line by 5 world units; near the 300 line by 3.
  const result = snapRect(rect(195, 297), lines, { threshold: 8 });
  assert.equal(result.dx, 5);
  assert.equal(result.dy, 3);
  assert.equal(result.guideX, 200);
  assert.equal(result.guideY, 300);
});

test('a card outside the threshold is not snapped', () => {
  const result = snapRect(rect(100, 100), { xs: [0], ys: [0] }, { threshold: 8 });
  assert.deepEqual(result, { dx: 0, dy: 0, guideX: null, guideY: null });
});

test('equidistant candidates resolve to one stable choice', () => {
  // left = 100, candidates at 92 and 108 are both exactly 8 away.
  const first = snapRect(rect(100, 0), { xs: [92, 108], ys: [] }, { threshold: 8 });
  const second = snapRect(rect(100, 0), { xs: [108, 92], ys: [] }, { threshold: 8 });
  assert.equal(first.guideX, 92);
  assert.deepEqual(second, first, 'candidate order in the array must not change the result');
});

test('the nearest candidate wins when several are in range', () => {
  const result = snapRect(rect(100, 0), { xs: [95, 103], ys: [] }, { threshold: 8 });
  assert.equal(result.guideX, 103);
  assert.equal(result.dx, 3);
});

test('Alt bypass and the magnet switch both produce a zero delta', () => {
  const lines = { xs: [0], ys: [0] };
  assert.deepEqual(snapRect(rect(2, 2), lines, { threshold: 8, enabled: false }), { dx: 0, dy: 0, guideX: null, guideY: null });
  assert.equal(snapRect(rect(2, 2), lines, { threshold: 8, enabled: true }).dx, -2);
});

test('centre alignment snaps as well as the edges', () => {
  // Moving rect 0..100 has centre 50; a stationary edge at 50 snaps it without moving edges.
  const result = snapRect(rect(0, 0), { xs: [50], ys: [] }, { threshold: 8 });
  assert.equal(result.guideX, 50);
  assert.equal(result.dx, 0);
});

test('drag bounds cover more than one dragged object', () => {
  const bounds = dragBounds([card('a', 0, 0), card('b', 200, 100)]);
  assert.deepEqual(bounds, { left: 0, top: 0, right: 300, bottom: 180, width: 300, height: 180 });
  assert.equal(dragBounds([]), null);
});

test('a collapsed card contributes its rendered height to drag bounds', () => {
  const bounds = dragBounds([card('a', 0, 0, 100, 300, { collapsed: true })]);
  assert.equal(bounds.bottom, 56);
});
