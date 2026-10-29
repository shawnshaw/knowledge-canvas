/**
 * Managed canvas discovery. Pure path/name logic; the plugin owns the Vault calls.
 */

/** The board that shipped before workspaces existed. Never migrated, never rewritten. */
export const DEFAULT_BOARD_PATH = 'Canvas/知识画板.canvas';
/** Every board the user creates from now on lives here. */
export const BOARD_FOLDER = 'Canvas/Knowledge Canvas';
/** ReadFlow boards live one level down so they never pollute the workspace switcher. */
export const READFLOW_BOARD_FOLDER = `${BOARD_FOLDER}/ReadFlow`;

const BOARD_EXTENSION = '.canvas';
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * Turns free text into a vault-safe canvas name.
 * Slashes become underscores; `.`/`..` segments and blank names are rejected
 * because they would let a name escape the managed folder.
 */
export function normalizeBoardName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Invalid canvas name');
  if (raw.split('/').some((segment) => {
    const trimmed = segment.trim();
    return trimmed === '' || trimmed === '.' || trimmed === '..';
  })) throw new Error('Invalid canvas name');
  const name = raw.replace(ILLEGAL_NAME_CHARS, '_').trim();
  if (!name || name === '.' || name === '..') throw new Error('Invalid canvas name');
  return name;
}

export function boardPathForName(name) {
  return `${BOARD_FOLDER}/${normalizeBoardName(name)}${BOARD_EXTENSION}`;
}

function boardNameFromPath(path) {
  return path.slice(BOARD_FOLDER.length + 1, -BOARD_EXTENSION.length);
}

function isManagedBoardPath(path) {
  return typeof path === 'string'
    && path.startsWith(`${BOARD_FOLDER}/`)
    && path.toLowerCase().endsWith(BOARD_EXTENSION);
}

/** True for a ReadFlow book canvas, which must stay out of the workspace switcher. */
export function isReadFlowBoardPath(path) {
  return typeof path === 'string'
    && path.startsWith(`${READFLOW_BOARD_FOLDER}/`)
    && path.toLowerCase().endsWith(BOARD_EXTENSION);
}

/**
 * The legacy default first, then every `.canvas` directly under the managed folder.
 * Other Vault canvases and ReadFlow book boards are deliberately excluded so the switcher
 * stays a workspace list; ReadFlow boards stay reachable through ReadFlow and openFullView.
 */
export function listManagedBoards(paths) {
  const names = (paths ?? [])
    .filter(isManagedBoardPath)
    .filter((path) => !isReadFlowBoardPath(path))
    .map(boardNameFromPath)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return [
    { name: '知识画板', path: DEFAULT_BOARD_PATH, isDefault: true },
    ...names.map((name) => ({ name, path: `${BOARD_FOLDER}/${name}${BOARD_EXTENSION}`, isDefault: false })),
  ];
}

/**
 * Every ReadFlow book canvas, straight from the file system. Kept separate from
 * `listManagedBoards` so the workspace switcher stays clean while background maintenance
 * (for example Markdown rename fan-out) still reaches these files.
 */
export function listReadFlowBoards(paths) {
  return (paths ?? [])
    .filter(isReadFlowBoardPath)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((path) => ({
      name: path.split('/').at(-1).replace(/\.canvas$/i, ''),
      path,
      isDefault: false,
      readFlow: true,
    }));
}

/** A remembered board is only honoured for the legacy default or the managed folder. */
export function isAllowedBoardPath(path) {
  return path === DEFAULT_BOARD_PATH || isManagedBoardPath(path);
}
