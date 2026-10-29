/**
 * 插件设置：纯函数 + 常量，不依赖 obsidian，方便单测。
 */

import { DEFAULT_BOARD_PATH } from './board-catalog.js';

export const DEFAULT_SETTINGS = Object.freeze({
  noteFolder: 'Inbox/Canvas',
  lastBoardPath: DEFAULT_BOARD_PATH,
  readFlowIntegrationEnabled: true,
  readFlowBindings: {},
});

/** 文件夹名里不允许出现的字符，与 markdown-repository 的文件名清洗保持一致。 */
const ILLEGAL_FOLDER_CHARS = /[\\:*?"<>|]/g;

/**
 * 把任意用户输入规范化成一个合法的 vault 文件夹路径。
 * - 反斜杠转正斜杠
 * - 去掉首尾斜杠、折叠重复斜杠
 * - 去掉 `.` / `..` 与空段
 * - 段内非法字符替换为 `_`
 * - 结果为空时回退到默认目录
 */
export function normalizeNoteFolder(value) {
  const cleaned = String(value ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim().replace(ILLEGAL_FOLDER_CHARS, '_'))
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');
  return cleaned || DEFAULT_SETTINGS.noteFolder;
}

/**
 * Per-book ReadFlow bindings: `{ [bookId]: boardPath }`. Only non-empty string values are
 * kept, so a book whose binding was cleared falls back to its default board on next load.
 */
export function normalizeReadFlowBindings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const bindings = {};
  for (const [bookId, boardPath] of Object.entries(value)) {
    if (typeof boardPath === 'string' && boardPath.trim()) bindings[bookId] = boardPath;
  }
  return bindings;
}

/**
 * 把磁盘上的原始设置对象补齐成完整设置。
 * `lastBoardPath` 只记住上次打开项；真实清单以文件系统为准，不存第二份注册表。
 */
export function normalizeSettings(data) {
  const remembered = data?.lastBoardPath;
  return {
    noteFolder: normalizeNoteFolder(data?.noteFolder),
    lastBoardPath: typeof remembered === 'string' && remembered.trim() ? remembered.trim() : DEFAULT_BOARD_PATH,
    // ReadFlow integration is on unless the user has explicitly saved `false`; a missing
    // field (older settings) keeps existing users enabled.
    readFlowIntegrationEnabled: data?.readFlowIntegrationEnabled !== false,
    readFlowBindings: normalizeReadFlowBindings(data?.readFlowBindings),
  };
}

/**
 * 给设置界面用的预览信息。文案留给 UI 层，这里只给状态与判定依据。
 * status: 'default'（输入为空，回退默认）| 'exists'（vault 里已有该文件夹）| 'create'（将自动创建）
 */
export function noteFolderPreview(value, { exists = false } = {}) {
  const raw = String(value ?? '').trim();
  const folder = normalizeNoteFolder(raw);
  const fellBackToDefault = raw === '';
  const typed = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return {
    folder,
    status: fellBackToDefault ? 'default' : exists ? 'exists' : 'create',
    fellBackToDefault,
    rewritten: !fellBackToDefault && typed !== folder,
  };
}
