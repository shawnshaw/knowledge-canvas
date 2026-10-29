/**
 * Folder scanning that yields to the event loop.
 *
 * A synchronous pass over a large Vault blocks painting, so a "still scanning" notice
 * could never appear. Scanning in chunks — and yielding between them — keeps the UI
 * responsive and makes the progress state observable instead of theoretical.
 */

import { isInsideFolder, isMarkdownPath } from './board-import.js';

export const SCAN_CHUNK_SIZE = 200;

const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Every Markdown file at or below `folderPath`, scanned in batches.
 *
 * @param files       `vault.getFiles()`-shaped entries (`{ path }`).
 * @param folderPath  Folder to scan recursively; blank means the whole Vault.
 * @param onChunk     Called with `(scanned, total)` before each yield.
 * @param yieldTo     Injectable scheduler; tests pass a controlled one.
 */
export async function scanFolderFiles(files, folderPath, { chunkSize = SCAN_CHUNK_SIZE, yieldTo = defaultYield, onChunk = null } = {}) {
  const list = files ?? [];
  const size = Math.max(1, Number(chunkSize) || SCAN_CHUNK_SIZE);
  const matches = [];
  let scanned = 0;
  for (const file of list) {
    if (isMarkdownPath(file?.path) && isInsideFolder(file.path, folderPath)) matches.push(file);
    scanned += 1;
    if (scanned % size === 0) {
      onChunk?.(scanned, list.length);
      await yieldTo();
    }
  }
  return matches;
}
