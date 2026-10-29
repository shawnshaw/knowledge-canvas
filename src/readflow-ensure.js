import { reconcileReadFlowBoard } from './embedded-board.js';

/**
 * Ensures the ReadFlow board at `path` reflects `highlightPaths`: the first open creates
 * the file, later opens sync new highlights incrementally.
 *
 * Callers serialise this per path (see `serializeByKey`). Without that, two openers that
 * both observe "no file yet" would each run `vault.create()` for the same path and one of
 * them would fail after already locking the book's canvas.
 */
export async function ensureReadFlowBoardAt({ path, highlightPaths, vault, boardStore, ensureFolder }) {
  await ensureFolder(path.split('/').slice(0, -1).join('/'));
  const existing = vault.getAbstractFileByPath(path);
  const current = existing ? await boardStore.load(path) : null;
  const result = reconcileReadFlowBoard(current, highlightPaths);
  if (result.created) {
    await vault.create(path, JSON.stringify(result.board, null, 2));
  } else if (result.addedCount > 0) {
    await boardStore.save(path, result.board);
  }
  return { boardPath: path, created: result.created, addedCount: result.addedCount };
}
