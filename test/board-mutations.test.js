import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_WRITES_PAUSED, runBoardMutation, createMutationQueue } from '../src/board-mutations.js';
import {
  createBoard,
  createFileNode,
  removeFromBoard,
  setCardColor,
  setCollapsed,
  snapshotGeometry,
  updateFilePath,
} from '../src/board-model.js';
import { cancelGestureGeometry } from '../src/gesture-lifecycle.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (board) => JSON.parse(JSON.stringify(board));

function harness(initial) {
  const state = { board: initial };
  const writes = [];
  const commit = async (next) => {
    await tick(5); // a real save is asynchronous
    writes.push(clone(next));
    state.board = next;
    return true;
  };
  const deps = { read: () => state.board, commit };
  return { state, writes, deps };
}

function boardWithCard() {
  const board = createBoard();
  board.nodes.push(createFileNode('Notes/A.md', { x: 10, y: 20 }));
  board.nodes[0].kcExcerpt = { version: 1, sourceFile: 'Notes/A.md', quote: 'q', start: 0, end: 1, prefix: '', suffix: '' };
  return board;
}

test('a mutation queued during a timestamp write sees the timestamp, not a stale board', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const updatedAt = '2026-10-17T15:12:00.000Z';

  const timestamps = runBoardMutation(queue, deps, (next) => {
    next.nodes[0].kcExcerpt.updatedAt = updatedAt;
    return true;
  });

  // Queued while the timestamp save is still in flight: the clone must be taken after it.
  let seenUpdatedAt = 'not-yet';
  const color = runBoardMutation(queue, deps, (next) => {
    seenUpdatedAt = next.nodes[0].kcExcerpt.updatedAt ?? null;
    setCardColor(next, next.nodes[0].id, '1');
    return true;
  });

  await Promise.all([timestamps, color]);
  assert.equal(seenUpdatedAt, updatedAt, 'the colour change must see the timestamp');
  assert.equal(state.board.nodes[0].kcExcerpt.updatedAt, updatedAt, 'the timestamp survived');
  assert.equal(state.board.nodes[0].color, '1', 'the colour landed');
});

test('a drag patch queued behind an in-flight timestamp write keeps both changes', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const updatedAt = '2026-10-17T15:12:00.000Z';

  // The timestamp write clones and then blocks inside its asynchronous commit.
  let releaseSave;
  const slowSave = new Promise((resolve) => { releaseSave = resolve; });
  const timestamps = runBoardMutation(queue, {
    read: deps.read,
    commit: async (next) => { await slowSave; state.board = next; return true; },
  }, (next) => {
    next.nodes[0].kcExcerpt.updatedAt = updatedAt;
    return true;
  });

  // The user drags while that save is still blocked; only a patch is captured, never the
  // live object, so the timestamp commit cannot swallow the new position.
  const dragPatch = [{ id: state.board.nodes[0].id, x: 640, y: 20, width: 320, height: 220 }];
  const drag = runBoardMutation(queue, deps, (next) => {
    const node = next.nodes.find((candidate) => candidate.id === dragPatch[0].id);
    if (!node) return false;
    Object.assign(node, dragPatch[0]);
    return true;
  });

  await tick(10);
  releaseSave();
  await Promise.all([timestamps, drag]);

  assert.equal(state.board.nodes[0].x, 640, 'the drag position survived');
  assert.equal(state.board.nodes[0].kcExcerpt.updatedAt, updatedAt, 'the timestamp survived');
});

test('an edge property edit queued behind a slow save is applied by edge id', async () => {
  const { state, deps } = harness(boardWithCard());
  const board = state.board;
  board.edges.push({ id: 'e1', fromNode: board.nodes[0].id, toNode: board.nodes[0].id, fromEnd: 'none', toEnd: 'arrow', label: 'old' });
  const queue = createMutationQueue();
  let release;
  const slow = new Promise((resolve) => { release = resolve; });

  const timestamps = runBoardMutation(queue, { read: deps.read, commit: async (next) => { await slow; state.board = next; return true; } }, (next) => {
    next.nodes[0].kcExcerpt.updatedAt = 'T';
    return true;
  });
  const label = runBoardMutation(queue, deps, (next) => {
    const edge = next.edges.find((candidate) => candidate.id === 'e1');
    if (!edge) return false;
    edge.label = 'edited';
    return true;
  });

  await tick(10);
  release();
  await Promise.all([timestamps, label]);
  assert.equal(state.board.edges[0].label, 'edited');
  assert.equal(state.board.nodes[0].kcExcerpt.updatedAt, 'T');
});

test('drain waits for a task that is blocked before its commit', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const task = runBoardMutation(queue, { ...deps, before: () => gate }, (next) => { next.nodes[0].x = 99; return true; });
  await tick(5);
  assert.equal(queue.pending(), true);

  let drained = false;
  const drain = queue.idle().then(() => { drained = true; });
  await tick(10);
  assert.equal(drained, false, 'drain must not finish while a queued task is still waiting');

  release();
  await Promise.all([task, drain]);
  assert.equal(drained, true);
  assert.equal(queue.pending(), false);
  assert.equal(state.board.nodes[0].x, 99);
});

test('collapse, rename and removal all run on the latest board', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const id = state.board.nodes[0].id;

  const collapse = runBoardMutation(queue, deps, (next) => {
    setCollapsed(next, id, true);
    return true;
  });
  const rename = runBoardMutation(queue, deps, (next) => (updateFilePath(next, 'Notes/A.md', 'Notes/B.md') ? true : false));
  await Promise.all([collapse, rename]);
  assert.equal(state.board.nodes[0].collapsed, true);
  assert.equal(state.board.nodes[0].file, 'Notes/B.md');

  const remove = runBoardMutation(queue, deps, (next) => { removeFromBoard(next, new Set([id])); return true; });
  await remove;
  assert.equal(state.board.nodes.length, 0);
});

test('a mutation that aborts writes nothing and keeps the queue usable', async () => {
  const { state, writes, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const aborted = await runBoardMutation(queue, deps, () => false);
  assert.equal(aborted, false);
  assert.equal(writes.length, 0);

  const applied = await runBoardMutation(queue, deps, (next) => { next.nodes[0].y = 99; return true; });
  assert.equal(applied, true);
  assert.equal(state.board.nodes[0].y, 99);
});

test('a mutation waits for the gesture gate before reading the board', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const task = runBoardMutation(queue, { ...deps, before: () => gate }, (next) => {
    next.nodes[0].x = 500;
    return true;
  });
  await tick(10);
  assert.equal(state.board.nodes[0].x, 10, 'nothing is written while the gesture is live');

  release();
  await task;
  assert.equal(state.board.nodes[0].x, 500);
});

test('a failing save leaves the previous board installed and surfaces the error', async () => {
  const state = { board: boardWithCard() };
  const queue = createMutationQueue();
  const failing = {
    read: () => state.board,
    commit: async () => { throw new Error('disk full'); },
  };
  await assert.rejects(
    runBoardMutation(queue, failing, (next) => { next.nodes[0].x = 999; return true; }),
    /disk full/,
  );
  assert.equal(state.board.nodes[0].x, 10, 'the installed board is unchanged');
});

test('writes from separate callers are serialised in order', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const events = [];
  const first = runBoardMutation(queue, { ...deps, commit: async (next) => { events.push('a'); await tick(5); state.board = next; return true; } }, (next) => { next.nodes[0].x = 1; return true; });
  const second = runBoardMutation(queue, deps, (next) => { events.push('b'); next.nodes[0].x = 2; return true; });
  await Promise.all([first, second]);
  assert.deepEqual(events, ['a', 'b']);
  assert.equal(state.board.nodes[0].x, 2);
});

test('a rename queued behind a blocked import rewrites the imported path', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  let release;
  const slow = new Promise((resolve) => { release = resolve; });

  // The import commits (with the old path) only after the rename has been queued.
  const importing = runBoardMutation(queue, {
    read: deps.read,
    commit: async (next) => { await slow; state.board = next; return true; },
  }, (next) => {
    next.nodes.push(createFileNode('Notes/New.md', { x: 500, y: 0 }));
    return true;
  });
  const rename = runBoardMutation(queue, deps, (next) => (updateFilePath(next, 'Notes/New.md', 'Notes/Renamed.md') ? true : false));

  await tick(10);
  release();
  await Promise.all([importing, rename]);

  const files = state.board.nodes.map((node) => node.file);
  assert.equal(files.includes('Notes/Renamed.md'), true, 'the imported card follows the rename');
  assert.equal(files.includes('Notes/New.md'), false, 'no card keeps the stale path');
});

test('adding a file queued behind a removal sees the card gone and adds it again', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const id = state.board.nodes[0].id;

  const removing = runBoardMutation(queue, deps, (next) => { removeFromBoard(next, new Set([id])); return true; });
  const adding = runBoardMutation(queue, deps, (next) => {
    if (next.nodes.some((node) => node.file === 'Notes/A.md')) return false;
    next.nodes.push(createFileNode('Notes/A.md', { x: 700, y: 0 }));
    return true;
  });

  await Promise.all([removing, adding]);
  assert.equal(state.board.nodes.length, 1);
  assert.equal(state.board.nodes[0].file, 'Notes/A.md');
  assert.equal(state.board.nodes[0].x, 700, 'the add ran after the removal, not before');
});

test('a paused queue refuses new writes instead of queueing behind the drain', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const first = runBoardMutation(queue, { ...deps, before: () => gate }, (next) => { next.nodes[0].x = 1; return true; });
  // The lifecycle pause happens before the drain: an edit made during the switch/close
  // must be rejected, not left pending after idle() resolves.
  const pause = queue.pause();
  const second = runBoardMutation(queue, deps, (next) => { next.nodes[0].x = 2; return true; });
  await assert.rejects(second, (error) => error.code === BOARD_WRITES_PAUSED);

  let drained = false;
  const drain = queue.idle().then(() => { drained = true; });
  release();
  await Promise.all([first, drain]);
  assert.equal(drained, true);
  assert.equal(queue.pending(), false, 'drain must not finish with work still pending');
  assert.equal(state.board.nodes[0].x, 1, 'the refused write never landed');

  queue.resume(pause);
  await runBoardMutation(queue, deps, (next) => { next.nodes[0].x = 3; return true; });
  assert.equal(state.board.nodes[0].x, 3, 'writes resume after the lifecycle change');
});

test('overlapping lifecycle pauses hold writes until the last one resumes', async () => {
  const { state, deps } = harness(boardWithCard());
  const queue = createMutationQueue();
  const first = queue.pause();
  const second = queue.pause();

  // The first lifecycle finishes while the second is still loading or handing off.
  queue.resume(first);
  assert.equal(queue.isPaused(), true, 'the second lifecycle still owns the board');
  assert.equal(queue.pauseCount(), 1);
  await assert.rejects(
    runBoardMutation(queue, deps, (next) => { next.nodes[0].x = 5; return true; }),
    (error) => error.code === BOARD_WRITES_PAUSED,
  );
  assert.equal(state.board.nodes[0].x, 10, 'no write landed while a lifecycle was open');

  queue.resume(second);
  assert.equal(queue.isPaused(), false);
  await runBoardMutation(queue, deps, (next) => { next.nodes[0].x = 6; return true; });
  assert.equal(state.board.nodes[0].x, 6);
});

test('draining a live drag restores geometry before the gated write reads the board', async () => {
  const board = createBoard();
  board.nodes.push(createFileNode('Notes/A.md', { x: 10, y: 20 }));
  const state = { board };
  const queue = createMutationQueue();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const snapshot = snapshotGeometry(board.nodes);

  // The user is mid-drag: the live board already holds the unfinished position.
  board.nodes[0].x = 700;
  const pending = runBoardMutation(queue, {
    read: () => state.board,
    commit: async (next) => { state.board = next; return true; },
    before: () => gate,
  }, (next) => { next.nodes[0].kcExcerpt = { createdAt: 'T' }; return true; });

  // Lifecycle drain: cancel the gesture first (restore geometry), then release the gate.
  cancelGestureGeometry(state.board, { kind: 'move', nodes: snapshot });
  release();
  await pending;

  assert.equal(state.board.nodes[0].x, 10, 'the unfinished drag was not saved');
  assert.equal(state.board.nodes[0].kcExcerpt.createdAt, 'T', 'the queued write still landed');
});
