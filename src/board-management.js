/**
 * Board management: renaming and deleting a managed workspace canvas.
 *
 * Pure planning only — nothing here touches the Vault. The plugin performs the file
 * operations in the order these plans describe and rolls back whatever it can, while the
 * modal collects the user's intent and never writes anything itself.
 */

import { BOARD_FOLDER, DEFAULT_BOARD_PATH, isReadFlowBoardPath, normalizeBoardName } from './board-catalog.js';
import { isMarkdownPath } from './board-import.js';
import { nodeFileReferences } from './delete-plan.js';

const BOARD_EXTENSION = '.canvas';

/** How many paths a refusal names before it starts counting. */
export const FOLDER_LIST_LIMIT = 5;

/** The canvas name a managed board is shown under, without folder or extension. */
export function boardNameFromPath(path) {
  const file = String(path ?? '').split('/').at(-1) ?? '';
  return file.replace(/\.canvas$/i, '');
}

/**
 * The legacy default is the fallback every other feature assumes, and a ReadFlow book board
 * belongs to its book. Neither may be renamed or deleted from the workspace menu.
 */
export function canManageBoard(path) {
  const value = String(path ?? '');
  if (!value) return { allowed: false, reason: '没有可管理的画布' };
  if (value === DEFAULT_BOARD_PATH) return { allowed: false, reason: '默认画布不能重命名或删除' };
  if (isReadFlowBoardPath(value)) return { allowed: false, reason: 'ReadFlow 书板由 ReadFlow 管理' };
  if (!value.startsWith(`${BOARD_FOLDER}/`)) return { allowed: false, reason: `只有 ${BOARD_FOLDER} 下的画布可以重命名或删除` };
  if (!value.toLowerCase().endsWith(BOARD_EXTENSION)) return { allowed: false, reason: '目标不是画布文件' };
  return { allowed: true, reason: '' };
}

function joinSegments(segments) {
  return segments.filter((segment) => segment !== '').join('/');
}

function stripSlashes(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * The dedicated note folder after a rename: the folder name follows the canvas name and
 * the parent directory is untouched, so a board never drags its notes out of their area.
 */
export function renameBoardNoteFolder(noteFolder, name) {
  const folder = stripSlashes(noteFolder);
  if (!folder) return null;
  const segments = folder.split('/');
  return joinSegments([...segments.slice(0, -1), normalizeBoardName(name)]);
}

/** True when `path` sits at or below `folder`; an empty folder matches nothing. */
export function isInsideFolderPath(path, folder) {
  const root = stripSlashes(folder);
  return Boolean(root) && String(path ?? '').startsWith(`${root}/`);
}

function replaceFolderPrefix(path, from, to) {
  return `${stripSlashes(to)}/${String(path).slice(stripSlashes(from).length + 1)}`;
}

/**
 * Plans one rename and refuses everything that can be refused before the first Vault write.
 *
 * @param path           the board being renamed
 * @param name           the raw name the user typed
 * @param existingPaths  every `.canvas` path in the Vault
 * @param folderPaths    every folder path in the Vault
 * @param noteFolder     the board's `kcMeta.noteFolder`, or null
 * @param renameNoteFolder whether the folder follows the canvas name
 * @returns `{ name, fromPath, toPath, noteFolder: { from, to } | null }`
 */
export function planBoardRename({ path, name, existingPaths = [], folderPaths = [], noteFolder = null, renameNoteFolder = false } = {}) {
  const manage = canManageBoard(path);
  if (!manage.allowed) throw new Error(manage.reason);

  let nextName;
  try {
    nextName = normalizeBoardName(name);
  } catch {
    throw new Error('画布名称不能为空，也不能包含 . 或 .. 路径片段');
  }

  const toPath = `${BOARD_FOLDER}/${nextName}${BOARD_EXTENSION}`;
  if (toPath === path) throw new Error('画布名称没有变化');
  if ((existingPaths ?? []).includes(toPath)) throw new Error(`画布已存在：${toPath}`);

  let folderPlan = null;
  if (noteFolder && renameNoteFolder) {
    const to = renameBoardNoteFolder(noteFolder, nextName);
    if (to && to !== stripSlashes(noteFolder)) {
      if ((folderPaths ?? []).some((folder) => stripSlashes(folder) === to)) {
        throw new Error(`专属笔记文件夹已存在：${to}`);
      }
      folderPlan = { from: stripSlashes(noteFolder), to };
    }
  }

  return { name: nextName, fromPath: path, toPath, noteFolder: folderPlan };
}

/**
 * Rewrites every card that points at Markdown inside `from` so it points inside `to`.
 * Both the file card and an excerpt sticker's source are references, and a folder rename
 * moves the files they name.
 */
export function rewriteFolderReferences(board, from, to) {
  if (!board || !from || !to || stripSlashes(from) === stripSlashes(to)) return board;
  let changed = false;
  const nodes = board.nodes.map((node) => {
    const copy = { ...node };
    if (typeof copy.file === 'string' && isInsideFolderPath(copy.file, from)) {
      copy.file = replaceFolderPrefix(copy.file, from, to);
      changed = true;
    }
    if (copy.kcExcerpt && typeof copy.kcExcerpt.sourceFile === 'string' && isInsideFolderPath(copy.kcExcerpt.sourceFile, from)) {
      copy.kcExcerpt = { ...copy.kcExcerpt, sourceFile: replaceFolderPrefix(copy.kcExcerpt.sourceFile, from, to) };
      changed = true;
    }
    return copy;
  });
  return changed ? { ...board, nodes } : board;
}

/**
 * The board after its own rename: `kcMeta.noteFolder` follows the folder when it moved with
 * the canvas, and the cards follow the Markdown they name. Returns the same board when
 * nothing changed, so the caller can skip a write entirely.
 */
export function applyBoardRename(board, plan) {
  if (!board) return board;
  let next = board;
  if (plan?.noteFolder) {
    if (board.kcMeta?.noteFolder === plan.noteFolder.from) {
      next = { ...next, kcMeta: { ...board.kcMeta, noteFolder: plan.noteFolder.to } };
    }
    next = rewriteFolderReferences(next, plan.noteFolder.from, plan.noteFolder.to);
  }
  return next;
}

function listPaths(paths, limit = FOLDER_LIST_LIMIT) {
  const names = paths.slice(0, limit).map((path) => path.split('/').at(-1));
  const extra = paths.length - names.length;
  return extra > 0 ? `${names.join('、')} 等 ${paths.length} 项` : names.join('、');
}

/**
 * Whether a board's dedicated note folder may be deleted together with the board.
 *
 * Only an empty folder, or one whose Markdown is entirely referenced by this board, is safe:
 * anything else is a note the board merely happens to sit next to, and deleting it because
 * the canvas is gone would destroy work the user never asked to touch.
 *
 * @param files   `{ path }`-shaped entries, or plain paths
 * @param folders same, for every folder in the Vault
 */
export function analyzeBoardNoteFolder({ folderPath, files = [], folders = [], board } = {}) {
  const folder = stripSlashes(folderPath);
  if (!folder) return { deletable: false, reason: '该画布没有专属笔记文件夹', fileCount: 0 };

  const subfolders = folders
    .map((item) => (typeof item === 'string' ? item : item?.path))
    .filter((path) => typeof path === 'string' && path !== folder && path.startsWith(`${folder}/`));
  const inside = files
    .map((item) => (typeof item === 'string' ? item : item?.path))
    .filter((path) => typeof path === 'string' && path.startsWith(`${folder}/`));

  const referenced = new Set();
  for (const node of board?.nodes ?? []) {
    for (const reference of nodeFileReferences(node)) referenced.add(reference.file);
  }

  const foreign = inside.filter((path) => !isMarkdownPath(path));
  const unreferenced = inside.filter((path) => isMarkdownPath(path) && !referenced.has(path));

  const reasons = [];
  if (subfolders.length) reasons.push(`包含子文件夹：${listPaths(subfolders)}`);
  if (foreign.length) reasons.push(`包含非 Markdown 文件：${listPaths(foreign)}`);
  if (unreferenced.length) reasons.push(`有 Markdown 未被当前画布引用：${listPaths(unreferenced)}`);

  return {
    deletable: reasons.length === 0,
    reason: reasons.join('；'),
    fileCount: inside.length,
    subfolders,
    foreign,
    unreferenced,
  };
}

/**
 * Keeps per-book ReadFlow bindings pointing at a real board after that board moves, and
 * drops a binding whose board is gone so the book falls back to its default board instead
 * of mounting a canvas that no longer exists. `to: null` means "the board is deleted".
 */
export function updateReadFlowBindings(bindings, { from, to = null } = {}) {
  const next = {};
  let changed = false;
  for (const [bookId, path] of Object.entries(bindings ?? {})) {
    if (path !== from) {
      next[bookId] = path;
      continue;
    }
    changed = true;
    if (to) next[bookId] = to;
  }
  return { bindings: next, changed };
}
