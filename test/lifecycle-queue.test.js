import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycleQueue } from '../src/lifecycle-queue.js';
import { createMutationQueue } from '../src/board-mutations.js';
import { createSourceSavedHandler } from '../src/editor-bridge.js';
import { EditorSession } from '../src/floating-editor.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function createSurface(initial) {
  const state = { boardPath: initial, board: initial, writer: initial };
  const switchTo = (path, { delay = 0, fail = false } = {}) => async () => {
    const previous = { boardPath: state.boardPath, board: state.board, writer: state.writer };
    await tick(delay);
    if (fail) {
      Object.assign(state, previous);
      return false;
    }
    state.boardPath = path;
    state.board = path;
    state.writer = path;
    return true;
  };
  return { state, switchTo };
}

test('lifecycle tasks run one at a time in submission order', async () => {
  const queue = createLifecycleQueue();
  const events = [];
  const first = queue(async () => { events.push('a:start'); await tick(20); events.push('a:end'); });
  const second = queue(async () => { events.push('b:start'); events.push('b:end'); });
  await Promise.all([first, second]);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
});

test('a failing lifecycle does not block the next one', async () => {
  const queue = createLifecycleQueue();
  const failed = queue(async () => { throw new Error('activate failed'); });
  const next = queue(async () => 'ok');
  await assert.rejects(failed, /activate failed/);
  assert.equal(await next, 'ok');
});

test('a slow failed switch cannot corrupt a later successful switch', async () => {
  const surface = createSurface('A');
  const queue = createLifecycleQueue();

  // Both switches start from A. B is slow and fails; C is fast and succeeds. Without
  // serialisation C would land first and then B's rollback would restore the path to A
  // while the board and writer still pointed at C.
  const b = queue(surface.switchTo('B', { delay: 20, fail: true }));
  const c = queue(surface.switchTo('C', { delay: 1 }));

  await Promise.all([b, c]);
  assert.deepEqual(surface.state, { boardPath: 'C', board: 'C', writer: 'C' });
});

test('a lifecycle that closes the editor first still writes the excerpt timestamp', async () => {
  const mutations = createMutationQueue();
  const lifecycles = createLifecycleQueue();
  const board = { nodes: [{ id: 'e1', kcExcerpt: { createdAt: 'C', quote: 'q' } }], edges: [] };
  const disk = { 'A.md': 'old' };

  let releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  const repository = {
    read: async () => ({ content: '甲。', mtime: 1 }),
    save: async (_path, _mtime, content) => {
      await gate; // the Markdown write is still in flight when the lifecycle starts
      disk['A.md'] = content;
      return { mtime: 2 };
    },
  };
  const sync = () => mutations(async () => {
    board.nodes[0].kcExcerpt.updatedAt = '2026-10-18T09:00:00.000Z';
    return true;
  });
  const session = new EditorSession('A.md', repository, { onSaved: createSourceSavedHandler(sync) });
  await session.load();
  session.setText('甲改。');
  const saving = session.save();

  // Lifecycle order: settle the editor (which awaits the post-save timestamp write) and
  // only then pause the board queue.
  const reload = lifecycles(async () => {
    await session.save();
    const pause = mutations.pause();
    await mutations.idle();
    mutations.resume(pause);
  });

  await tick(10);
  releaseSave();
  await Promise.all([saving, reload]);

  assert.equal(disk['A.md'].includes('甲改'), true, 'the Markdown change reached disk');
  assert.equal(board.nodes[0].kcExcerpt.updatedAt, '2026-10-18T09:00:00.000Z', 'the timestamp landed too');
});

test('a switch submitted after shutdown starts never runs', async () => {
  const queue = createLifecycleQueue();
  const events = [];
  let settingsWritten = 0;
  let writerAcquired = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const shutdown = queue.shutdown(async () => {
    events.push('shutdown:start');
    await gate;
    events.push('shutdown:end');
  });
  const lateSwitch = queue(async () => {
    events.push('switch:ran');
    settingsWritten += 1;
    writerAcquired += 1;
    return true;
  });

  assert.equal(await lateSwitch, false, 'a late lifecycle is refused');
  release();
  await shutdown;
  assert.deepEqual(events, ['shutdown:start', 'shutdown:end']);
  assert.equal(settingsWritten, 0, 'no settings write from a disposed view');
  assert.equal(writerAcquired, 0, 'no writer re-acquired from a disposed view');
  assert.equal(queue.isClosing(), true);
});

test('a lifecycle accepted before shutdown finishes first, then shutdown runs', async () => {
  const queue = createLifecycleQueue();
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const first = queue(async () => { events.push('first:start'); await gate; events.push('first:end'); });
  const pendingSwitch = queue(async () => { events.push('switch:ran'); return true; });
  const shutdown = queue.shutdown(async () => { events.push('shutdown'); });

  release();
  await Promise.all([first, pendingSwitch, shutdown]);
  // FIFO: work accepted before shutdown is not abandoned mid-flight; after it, refused.
  assert.deepEqual(events, ['first:start', 'first:end', 'switch:ran', 'shutdown']);
  assert.equal(queue.isClosing(), true);
  assert.equal(await queue(async () => { events.push('late'); return true; }), false);
});

test('shutdown is idempotent and joins the same promise', async () => {
  const queue = createLifecycleQueue();
  let runs = 0;
  const first = queue.shutdown(async () => { runs += 1; });
  const second = queue.shutdown(async () => { runs += 1; });
  assert.equal(first, second);
  await first;
  assert.equal(runs, 1);
});

test('a failed shutdown reopens the queue', async () => {
  const queue = createLifecycleQueue();
  const failed = queue.shutdown(async () => { throw new Error('editor still dirty'); });
  await assert.rejects(failed, /editor still dirty/);
  assert.equal(queue.isClosing(), false);
  assert.equal(await queue(async () => 'ok'), 'ok');
});
