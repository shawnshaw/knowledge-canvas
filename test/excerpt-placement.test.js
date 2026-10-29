import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCERPT_STEP, nextExcerptPoint } from '../src/excerpt-placement.js';

test('places the first excerpt sticker to the right of its source card', () => {
  assert.deepEqual(nextExcerptPoint({ x: 100, y: 50, width: 320 }, 0), { x: 100 + 320 + EXCERPT_STEP, y: 50 });
});

test('consecutive stickers cascade so they never fully overlap', () => {
  const points = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => nextExcerptPoint({ x: 0, y: 0, width: 320 }, n));
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, points.length);
});

test('falls back to a canvas-relative origin when the source card is gone', () => {
  assert.deepEqual(nextExcerptPoint(null, 0), { x: 160, y: 120 });
  assert.deepEqual(nextExcerptPoint(null, 1), { x: 192, y: 152 });
});

test('honours a custom step', () => {
  assert.deepEqual(nextExcerptPoint({ x: 0, y: 0, width: 100 }, 2, { step: 10 }), { x: 0 + 100 + 10 + 2 * 10, y: 20 });
});
