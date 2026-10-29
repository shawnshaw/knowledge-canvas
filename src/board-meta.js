/**
 * `kcMeta`: the optional top-level extension a board carries for itself.
 *
 * Version 1 only knows a per-board note folder. Older boards have no `kcMeta` and must
 * keep opening; a malformed field is rejected instead of being silently ignored, so a
 * hand-edited canvas cannot point new notes at a path we would never write.
 */

export const BOARD_META_VERSION = 1;

const ILLEGAL_CHARS = /[\\:*?"<>|]/;

/** Normalizes a user/vault path into the folder form we store; null when nothing is left. */
export function normalizeBoardNoteFolder(value) {
  const segments = String(value ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => segment.replace(ILLEGAL_CHARS, '_'));
  return segments.join('/') || null;
}

/** Builds the meta object written into a new board; throws on an empty folder. */
export function createBoardMeta({ noteFolder } = {}) {
  const folder = normalizeBoardNoteFolder(noteFolder);
  if (!folder) throw new Error('画布笔记目录不能为空');
  return { version: BOARD_META_VERSION, noteFolder: folder };
}

/** @returns null when the value is usable (or absent), otherwise a human-readable reason. */
export function validateBoardMeta(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return '画布扩展信息必须是对象';
  if (value.version !== BOARD_META_VERSION) return `不支持的画布扩展版本：${String(value.version)}`;
  if (value.noteFolder === undefined) return null;
  if (typeof value.noteFolder !== 'string' || !value.noteFolder.trim()) return '画布笔记目录必须是非空字符串';
  if (value.noteFolder.startsWith('/') || value.noteFolder.endsWith('/')) return '画布笔记目录不能以斜杠开头或结尾';
  if (value.noteFolder.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return '画布笔记目录包含非法路径片段';
  }
  if (ILLEGAL_CHARS.test(value.noteFolder)) return '画布笔记目录包含非法字符';
  return null;
}

/** The folder this board creates its sticky notes in, or null when it has none. */
export function boardNoteFolder(board) {
  const meta = board?.kcMeta;
  if (!meta || typeof meta !== 'object') return null;
  return typeof meta.noteFolder === 'string' && meta.noteFolder ? meta.noteFolder : null;
}
