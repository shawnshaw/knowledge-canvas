import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardStore } from '../src/board-store.js';
import { ensureReadFlowBoardAt } from '../src/readflow-ensure.js';
import { serializeByKey } from '../src/serial-queue.js';

/** A Vault stand-in that behaves like Obsidian's `create`: it refuses to overwrite. */
function fakeVault() {
  const files = new Map();
  return {
    files,
    getAbstractFileByPath(path) {
      return files.has(path) ? { path } : null;
    },
    async create(path, data) {
      if (files.has(path)) throw new Error(`File already exists: ${path}`);
      files.set(path, data);
    },
  };
}

function storeFor(vault) {
  return new BoardStore({
    read: async (path) => vault.files.get(path),
    process: async (path, updater) => {
      vault.files.set(path, updater(vault.files.get(path)));
    },
  });
}

const BOARD = 'Canvas/Knowledge Canvas/ReadFlow/rf-1.canvas';
const HIGHLIGHTS = ['Books/Emma/Emma.md'];

test('the first open creates the board and later opens sync it incrementally', async () => {
  const vault = fakeVault();
  const boardStore = storeFor(vault);
  const ensureFolder = async () => {};
  const open = () =>
    ensureReadFlowBoardAt({
      path: BOARD,
      highlightPaths: HIGHLIGHTS,
      vault,
      boardStore,
      ensureFolder,
    });

  const first = await open();
  assert.equal(first.created, true);
  assert.equal(vault.files.has(BOARD), true);

  const second = await open();
  assert.equal(second.created, false);
  assert.equal(second.addedCount, 0);
});

test('two concurrent first opens create the board exactly once', async () => {
  const vault = fakeVault();
  const boardStore = storeFor(vault);
  const queues = new Map();
  const ensureFolder = async () => {};
  const open = () =>
    serializeByKey(queues, BOARD, () =>
      ensureReadFlowBoardAt({
        path: BOARD,
        highlightPaths: HIGHLIGHTS,
        vault,
        boardStore,
        ensureFolder,
      }),
    );

  const [first, second] = await Promise.all([open(), open()]);
  assert.deepEqual(
    [first.created, second.created],
    [true, false],
    'exactly one opener may run the create branch',
  );
  assert.equal(vault.files.size, 1);
});

test('an incremental open syncs only the highlights that are missing', async () => {
  const vault = fakeVault();
  const boardStore = storeFor(vault);
  const ensureFolder = async () => {};
  const open = (highlightPaths) =>
    ensureReadFlowBoardAt({
      path: BOARD,
      highlightPaths,
      vault,
      boardStore,
      ensureFolder,
    });

  await open(HIGHLIGHTS);
  const synced = await open([...HIGHLIGHTS, 'Books/Emma/Emma 2.md']);
  assert.equal(synced.created, false);
  assert.equal(synced.addedCount, 1);

  const board = JSON.parse(vault.files.get(BOARD));
  assert.equal(
    board.nodes.some((node) => node.file === 'Books/Emma/Emma 2.md'),
    true,
  );
});
