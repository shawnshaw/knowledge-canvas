import test from 'node:test';
import assert from 'node:assert/strict';
import { canMutateBoard } from '../src/board-capabilities.js';

test('a surface may only write when it owns the board and the load succeeded', () => {
  assert.equal(canMutateBoard({ writerOwned: true, loadError: null }), true);
  assert.equal(canMutateBoard({ writerOwned: false, loadError: null }), false);
  assert.equal(canMutateBoard({ writerOwned: true, loadError: new Error('bad json') }), false);
  assert.equal(canMutateBoard({}), false);
});

test('the read-only embedded surface reports no write capability', () => {
  // An embedded surface that lost the token to a full view is exactly this shape.
  assert.equal(canMutateBoard({ writerOwned: false, loadError: null }), false);
});
