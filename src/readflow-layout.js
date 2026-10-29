/**
 * Deterministic placement for newly imported ReadFlow cards. Pure: it measures the
 * existing board but never modifies it or the candidates it is given.
 */

export const READFLOW_CARD = Object.freeze({ width: 320, height: 220 });
export const READFLOW_GAP = 40;
export const READFLOW_BOOK_GAP = 96;
export const UNCHAPTERED = '未分章';

export function readFlowChapterKey(candidate) {
  return candidate.chapter || UNCHAPTERED;
}

/** Only the right edge and the top edge matter: new content goes to the right of it. */
export function contentBounds(nodes) {
  let right = -Infinity;
  let top = Infinity;
  for (const node of nodes) {
    right = Math.max(right, node.x + node.width);
    top = Math.min(top, node.y);
  }
  return { right, top };
}

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const left = String(a.created ?? '');
    const right = String(b.created ?? '');
    if (left !== right) return left < right ? -1 : 1;
    return String(a.path).localeCompare(String(b.path), 'zh-CN');
  });
}

function groupByBook(candidates) {
  const books = new Map();
  for (const candidate of sortCandidates(candidates)) {
    const book = candidate.book || '';
    if (!books.has(book)) books.set(book, new Map());
    const chapter = readFlowChapterKey(candidate);
    const chapters = books.get(book);
    if (!chapters.has(chapter)) chapters.set(chapter, []);
    chapters.get(chapter).push(candidate);
  }
  return books;
}

/**
 * @returns `{ candidate, point }[]` — one entry per card, in placement order.
 * Books are blocks laid out left to right; chapters are columns inside a book;
 * cards stack down a column. Existing cards and groups are left untouched.
 */
export function layoutReadFlowCandidates(candidates, existingNodes = [], { size = READFLOW_CARD } = {}) {
  const books = groupByBook(candidates ?? []);
  if (!books.size) return [];

  const hasExisting = existingNodes.length > 0;
  const bounds = hasExisting ? contentBounds(existingNodes) : null;
  const baseY = hasExisting ? bounds.top : 0;
  let bookX = hasExisting ? bounds.right + READFLOW_BOOK_GAP : 0;

  const placements = [];
  for (const book of [...books.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
    const chapters = books.get(book);
    let columnX = bookX;
    for (const chapter of [...chapters.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
      chapters.get(chapter).forEach((candidate, index) => {
        placements.push({ candidate, point: { x: columnX, y: baseY + index * (size.height + READFLOW_GAP) } });
      });
      columnX += size.width + READFLOW_GAP;
    }
    // columnX now sits one gap past the last column; rewind it and add the book gap.
    bookX = columnX - READFLOW_GAP + READFLOW_BOOK_GAP;
  }
  return placements;
}
