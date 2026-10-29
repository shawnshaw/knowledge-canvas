/**
 * Embedded board runtime — pure path and seeding helpers. The controller that mounts the
 * actual view lives in `embedded-board-controller.js` so this module stays free of any
 * `obsidian` import and remains unit-testable.
 */

import { READFLOW_BOARD_FOLDER } from './board-catalog.js';
import { createBoard, createFileNode } from './board-model.js';
import { READFLOW_CARD, contentBounds } from './readflow-layout.js';

export const EMBEDDED_API_VERSION = 1;

/** ItemView requires its leaf to expose the container it builds its own content area in. */
export function createEmbeddedLeaf(app, host) {
  const leaf = {
    app,
    workspace: app.workspace,
    containerEl: host,
    history: { backHistory: [], forwardHistory: [] },
  };
  leaf.history.owner = leaf;
  return leaf;
}

/** Re-exported so the embedded runtime's path contract stays importable from one place. */
export { READFLOW_BOARD_FOLDER };

/** The seed grid wraps after this many rows so a large book stays readable. */
const SEED_COLUMNS = 8;
const SEED_GAP = 40;

const ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/g;

/**
 * Stable default board path for a book. The path is derived from the book id only, so a
 * book renamed later still resolves to the same board instead of stranding its old canvas
 * under a stale title.
 */
export function defaultReadFlowBoardPath({ bookId } = {}) {
  const id = String(bookId ?? '').trim().replace(ILLEGAL_PATH_CHARS, '_');
  if (!/[^_]/.test(id)) throw new Error('ReadFlow book id is required');
  return `${READFLOW_BOARD_FOLDER}/${id}.canvas`;
}

/**
 * Populates a freshly created board with the book's highlight files. Pure and deterministic:
 * duplicates collapse, non-Markdown paths are ignored, and cards land on a stable grid.
 */
export function seedReadFlowBoard(board, highlightPaths) {
  const paths = [...new Set((highlightPaths ?? []).filter((path) => typeof path === 'string' && path.toLowerCase().endsWith('.md')))];
  let index = 0;
  for (const path of paths) {
    const column = Math.floor(index / SEED_COLUMNS);
    const row = index % SEED_COLUMNS;
    board.nodes.push(createFileNode(path, {
      x: column * (READFLOW_CARD.width + SEED_GAP),
      y: row * (READFLOW_CARD.height + SEED_GAP),
    }));
    index += 1;
  }
  return board;
}

/**
 * Adds the highlight files an existing board is missing. Duplicates — both within the input
 * and against cards already present — are ignored, no existing card is moved or overwritten,
 * and new cards continue to the right of the board's current content bounds, so they never
 * land on a card or group the user rearranged. Returns the number of cards actually added.
 */
export function syncReadFlowHighlights(board, highlightPaths) {
  const existing = new Set(
    board.nodes.filter((node) => node.type === 'file').map((node) => node.file),
  );
  const paths = [...new Set(
    (highlightPaths ?? []).filter((path) => typeof path === 'string' && path.toLowerCase().endsWith('.md')),
  )];
  const missing = paths.filter((path) => !existing.has(path));
  if (!missing.length) return 0;
  const hasExisting = board.nodes.length > 0;
  const bounds = hasExisting ? contentBounds(board.nodes) : { right: 0, top: 0 };
  const baseX = hasExisting ? bounds.right + SEED_GAP : 0;
  const baseY = hasExisting ? bounds.top : 0;
  let index = 0;
  for (const path of missing) {
    const column = Math.floor(index / SEED_COLUMNS);
    const row = index % SEED_COLUMNS;
    board.nodes.push(createFileNode(path, {
      x: baseX + column * (READFLOW_CARD.width + SEED_GAP),
      y: baseY + row * (READFLOW_CARD.height + SEED_GAP),
    }));
    index += 1;
  }
  return missing.length;
}

/**
 * Brings a board in line with the book's current highlights. A missing board is seeded from
 * scratch; an existing board only gains the cards it lacks, so anything the user edited stays
 * exactly where it is. Returns the reconciled board, whether it was created, and the count of
 * highlight cards added.
 */
export function reconcileReadFlowBoard(board, highlightPaths) {
  if (!board) {
    const fresh = createBoard();
    seedReadFlowBoard(fresh, highlightPaths);
    return { board: fresh, created: true, addedCount: fresh.nodes.length };
  }
  const addedCount = syncReadFlowHighlights(board, highlightPaths);
  return { board, created: false, addedCount };
}
