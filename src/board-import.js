/**
 * File and folder import: what to add, what to skip, and where the new cards go.
 * Pure — it never reads or writes the vault, so a cancelled or failed import leaves the
 * board exactly as it was.
 */

export const IMPORT_CARD = Object.freeze({ width: 320, height: 220 });
export const IMPORT_GAP = 24;

export function isMarkdownPath(path) {
  return /\.md$/i.test(String(path ?? '').trim());
}

/** True when `path` lives at or below `folderPath`; a blank folder means the whole Vault. */
export function isInsideFolder(path, folderPath) {
  const root = String(folderPath ?? '').replace(/^\/+|\/+$/g, '');
  const value = String(path ?? '');
  return !root || value.startsWith(`${root}/`);
}

/** Every Markdown file at or below `folderPath`. A blank folder means "the whole vault". */
export function filesUnderFolder(files, folderPath) {
  return (files ?? []).filter((file) => isMarkdownPath(file?.path) && isInsideFolder(file?.path, folderPath));
}

/**
 * @returns `{ added, skippedExisting, skippedInvalid, duplicates }`.
 * A path repeated inside the same batch is reported once and added once; anything that is
 * not Markdown, and anything already on the board, never becomes a node.
 */
export function planImport(paths, existingPaths) {
  const existing = new Set(existingPaths ?? []);
  const seen = new Set();
  const duplicates = [];
  const added = [];
  const skippedExisting = [];
  const skippedInvalid = [];
  for (const raw of paths ?? []) {
    const path = String(raw ?? '').trim();
    if (!isMarkdownPath(path)) {
      skippedInvalid.push(path);
      continue;
    }
    if (seen.has(path)) {
      duplicates.push(path);
      continue;
    }
    seen.add(path);
    if (existing.has(path)) skippedExisting.push(path);
    else added.push(path);
  }
  return { added, skippedExisting, skippedInvalid, duplicates };
}

function contentRightTop(nodes) {
  let right = -Infinity;
  let top = Infinity;
  for (const node of nodes ?? []) {
    right = Math.max(right, node.x + node.width);
    top = Math.min(top, node.y);
  }
  return nodes?.length ? { right, top } : null;
}

/**
 * Deterministic grid placed to the right of everything already on the board, so an import
 * never lands on top of existing cards. The same input always produces the same layout.
 */
export function layoutImportedCards(paths, existingNodes = [], { size = IMPORT_CARD, gap = IMPORT_GAP } = {}) {
  const ordered = [...(paths ?? [])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (!ordered.length) return [];
  const bounds = contentRightTop(existingNodes);
  const baseX = bounds ? bounds.right + gap : 0;
  const baseY = bounds ? bounds.top : 0;
  const columns = Math.ceil(Math.sqrt(ordered.length));
  return ordered.map((path, index) => ({
    path,
    point: {
      x: baseX + (index % columns) * (size.width + gap),
      y: baseY + Math.floor(index / columns) * (size.height + gap),
    },
  }));
}
