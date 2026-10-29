import test from 'node:test';
import assert from 'node:assert/strict';
import { screenToWorld, worldToScreen, zoomAt } from '../src/viewport.js';

test('zoom keeps the world point under the cursor fixed', () => {
  const before = { x: 100, y: 80, scale: 1 };
  const anchor = { x: 400, y: 300 };
  const world = screenToWorld(anchor, before);
  const after = zoomAt(anchor, 0.25, before);
  assert.deepEqual(screenToWorld(anchor, after), world);
});

test('clamps zoom and round-trips coordinates', () => {
  const viewport = zoomAt({ x: 0, y: 0 }, 100, { x: 10, y: 20, scale: 1 });
  assert.equal(viewport.scale, 3);
  const point = { x: -12, y: 40 };
  assert.deepEqual(screenToWorld(worldToScreen(point, viewport), viewport), point);
  assert.equal(zoomAt({ x: 0, y: 0 }, -100, viewport).scale, 0.2);
});
