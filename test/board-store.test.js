import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardStore } from '../src/board-store.js';

test('loads a valid board', async () => {
  const store = new BoardStore({ read: async () => '{"nodes":[],"edges":[]}', process: async () => {} });
  assert.deepEqual(await store.load('Board.canvas'), { nodes: [], edges: [] });
});

test('serializes saves so an older request cannot overwrite a newer board', async () => {
  const writes = [];
  const adapter = {
    read: async () => '{"nodes":[],"edges":[]}',
    process: async (_file, update) => { writes.push(update('{}')); },
  };
  const store = new BoardStore(adapter);
  await Promise.all([
    store.save('Board.canvas', { nodes: [{ id: 'a', type: 'file', file: 'A.md', x: 0, y: 0, width: 320, height: 220 }], edges: [] }),
    store.save('Board.canvas', { nodes: [{ id: 'b', type: 'file', file: 'B.md', x: 0, y: 0, width: 320, height: 220 }], edges: [] }),
  ]);
  assert.equal(JSON.parse(writes.at(-1)).nodes[0].id, 'b');
});

test('refuses to save an invalid board', async () => {
  const store = new BoardStore({ read: async () => '', process: async () => assert.fail('must not write') });
  await assert.rejects(store.save('Board.canvas', { nodes: [], edges: [{ id: 'e', fromNode: 'missing', toNode: 'missing' }] }), /missing node/i);
});

test('continues the queue after a failed write', async () => {
  let calls = 0;
  const store = new BoardStore({
    read: async () => '{"nodes":[],"edges":[]}',
    process: async () => { if (++calls === 1) throw new Error('disk full'); },
  });
  await assert.rejects(store.save('Board.canvas', { nodes: [], edges: [] }), /disk full/);
  await store.save('Board.canvas', { nodes: [], edges: [] });
  assert.equal(calls, 2);
});

test('blocks writes after corrupted JSON fails to load', async () => {
  let bytes = '{corrupted';
  let writes = 0;
  const store = new BoardStore({
    read: async () => bytes,
    process: async (_file, update) => { writes += 1; bytes = update(bytes); },
  });
  await assert.rejects(store.load('Board.canvas'), /invalid canvas/i);
  await assert.rejects(store.save('Board.canvas', { nodes: [], edges: [] }), /read-only/i);
  assert.equal(bytes, '{corrupted');
  assert.equal(writes, 0);
});

test('blocks writes after adapter read failure until a reload succeeds', async () => {
  let readable = false;
  let writes = 0;
  const store = new BoardStore({
    read: async () => { if (!readable) throw new Error('permission denied'); return '{"nodes":[],"edges":[]}'; },
    process: async () => { writes += 1; },
  });
  await assert.rejects(store.load('Board.canvas'), /permission denied/);
  await assert.rejects(store.save('Board.canvas', { nodes: [], edges: [] }), /read-only/i);
  readable = true;
  await store.load('Board.canvas');
  await store.save('Board.canvas', { nodes: [], edges: [] });
  assert.equal(writes, 1);
});

const fileCard = (id, file) => ({ id, type: 'file', file, x: 0, y: 0, width: 320, height: 220 });

test('a writer token owns a board and a different token is refused', () => {
  const store = new BoardStore({ read: async () => '', process: async () => {} });
  assert.equal(store.acquireWriter('Board.canvas', 'embedded'), true);
  assert.equal(store.acquireWriter('Board.canvas', 'embedded'), true); // idempotent for the same owner
  assert.equal(store.acquireWriter('Board.canvas', 'full'), false);
  assert.equal(store.isWriter('Board.canvas', 'embedded'), true);
  assert.equal(store.isWriter('Board.canvas', 'full'), false);
});

test('releasing and transferring writer ownership follows the hand-off', () => {
  const store = new BoardStore({ read: async () => '', process: async () => {} });
  store.acquireWriter('Board.canvas', 'embedded');
  assert.equal(store.transferWriter('Board.canvas', 'embedded', 'full'), true);
  assert.equal(store.isWriter('Board.canvas', 'full'), true);
  assert.equal(store.isWriter('Board.canvas', 'embedded'), false);
  store.releaseWriter('Board.canvas', 'full');
  assert.equal(store.isWriter('Board.canvas', 'full'), false);
  assert.equal(store.acquireWriter('Board.canvas', 'embedded'), true);
});

test('two views interleaving writes on one board cannot overwrite each other', async () => {
  const writes = [];
  let stored = '{"nodes":[],"edges":[]}';
  const store = new BoardStore({
    read: async () => stored,
    process: async (_file, update) => { stored = update(stored); writes.push(stored); },
  });

  // The embedded surface owns the board while it is mounted.
  assert.equal(store.acquireWriter('Board.canvas', 'embedded'), true);
  await store.save('Board.canvas', { nodes: [fileCard('a', 'A.md')], edges: [] }, { token: 'embedded' });

  // openFullView hands the writer to the full view before it loads the same board.
  assert.equal(store.transferWriter('Board.canvas', 'embedded', 'full'), true);
  await store.save('Board.canvas', { nodes: [fileCard('a', 'A.md'), fileCard('x', 'X.md')], edges: [] }, { token: 'full' });

  // A stale save from the handed-off embedded surface is refused instead of silently
  // overwriting the full view's card X with the embedded snapshot.
  await assert.rejects(
    store.save('Board.canvas', { nodes: [fileCard('a', 'A.md'), fileCard('y', 'Y.md')], edges: [] }, { token: 'embedded' }),
    /read-only/i,
  );

  const final = JSON.parse(stored);
  assert.deepEqual(final.nodes.map((node) => node.id), ['a', 'x']);
  assert.equal(writes.length, 2);
});

test('an untracked writer can still save when no owner is registered (back-compat)', async () => {
  let writes = 0;
  const store = new BoardStore({ read: async () => '{"nodes":[],"edges":[]}', process: async () => { writes += 1; } });
  await store.save('Board.canvas', { nodes: [], edges: [] }, { token: 'any' });
  assert.equal(writes, 1);
});

test('a tokenless save is refused while another surface owns the board', async () => {
  let writes = 0;
  const store = new BoardStore({ read: async () => '{"nodes":[],"edges":[]}', process: async () => { writes += 1; } });
  assert.equal(store.acquireWriter('Board.canvas', 'embedded'), true);
  // A maintenance write that forgets its token must not slip past the owner's lock.
  await assert.rejects(store.save('Board.canvas', { nodes: [], edges: [] }), /read-only/i);
  assert.equal(writes, 0);
  // The owner's own token still saves.
  await store.save('Board.canvas', { nodes: [], edges: [] }, { token: 'embedded' });
  assert.equal(writes, 1);
});
