import { markdownReference } from './excerpt-anchor.js';

/**
 * Pure removal preview. Nothing here touches the Vault or the board it is given:
 * it decides what *would* happen so the destructive step can be explicit.
 */

/**
 * Every Markdown reference a single canvas node carries, normalized and de-duplicated.
 * A file card points at its note through `file`; an excerpt sticker points at the note it
 * was cut from through `kcExcerpt.sourceFile`. Both have to guard their source, and a node
 * carrying both must not be allowed to hide one behind the other — picking the first match
 * would silently drop the other reference and re-enable Trash for a file still in use.
 *
 * The representation carries no `type`, so a document built by extraction and a full board
 * node normalize to the same values.
 */
export function nodeFileReferences(node) {
  if (!node || typeof node !== 'object') return [];
  const id = typeof node.id === 'string' ? node.id : '';
  const paths = new Set();
  for (const value of [node.file, node.kcExcerpt?.sourceFile]) {
    const path = markdownReference(value);
    if (path) paths.add(path);
  }
  return [...paths].map((file) => ({ id, file }));
}

function documentNodes(document) {
  if (Array.isArray(document?.board?.nodes)) return document.board.nodes;
  if (Array.isArray(document?.nodes)) return document.nodes;
  return null;
}

/**
 * Reads the `type: file` references out of any Vault canvas, tolerating node types
 * this plugin does not model (text, link). Throws only when the document cannot be
 * understood at all, which is what makes a plan uncertain.
 */
export function extractCanvasFileReferences(raw) {
  let document;
  try {
    document = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('画布无法解析');
  }
  if (!document || !Array.isArray(document.nodes)) throw new Error('画布无法解析');
  return document.nodes.flatMap(nodeFileReferences);
}

/**
 * A selection can hold board nodes and relations at the same time. They live in
 * separate collections and only nodes can ever carry a Markdown source.
 */
export function classifySelection(board, selectedIds) {
  const nodeIds = board.nodes.filter((node) => selectedIds.has(node.id)).map((node) => node.id);
  const edgeIds = board.edges.filter((edge) => selectedIds.has(edge.id)).map((edge) => edge.id);
  return { nodeIds, edgeIds };
}

/**
 * @param board current board (not mutated)
 * @param selectedIds ids the user is removing from this board
 * @param canvasDocuments every Vault canvas as `{ path, board|nodes }` or `{ path, error }`
 * @returns `{ nodeIds, edgeIds, filePaths, blockedTrash, missingPaths, uncertain }`
 */
export function analyzeDelete(board, selectedIds, canvasDocuments = [], { isMissing = () => false, currentPath = '' } = {}) {
  const { nodeIds, edgeIds } = classifySelection(board, selectedIds);
  const removedIds = new Set(nodeIds);
  const selected = board.nodes.filter((node) => removedIds.has(node.id));
  const filePaths = [...new Set(selected.map((node) => node.file).filter((file) => typeof file === 'string'))];

  const uncertain = [];
  const references = new Map();
  for (const document of canvasDocuments ?? []) {
    if (document?.error) {
      uncertain.push({ path: document.path, reason: String(document.error.message ?? document.error) });
      continue;
    }
    const nodes = documentNodes(document);
    if (!nodes) {
      uncertain.push({ path: document.path, reason: '画布无法解析' });
      continue;
    }
    const isCurrentCanvas = document.board === board || (currentPath !== '' && document.path === currentPath);
    for (const node of nodes) {
      for (const reference of nodeFileReferences(node)) {
        if (isCurrentCanvas && removedIds.has(reference.id)) continue;
        if (!references.has(reference.file)) references.set(reference.file, new Set());
        references.get(reference.file).add(document.path);
      }
    }
  }

  const blockedTrash = [];
  const missingPaths = [];
  for (const path of filePaths) {
    if (isMissing(path)) {
      missingPaths.push(path);
      continue;
    }
    const refs = [...(references.get(path) ?? [])].sort();
    if (refs.length) blockedTrash.push({ path, references: refs });
  }
  return { nodeIds, edgeIds, filePaths, blockedTrash, missingPaths, uncertain };
}

/**
 * Whether the opt-in "move the Markdown sources to the Trash" checkbox can be offered.
 * Anything that cannot be proven safe disables it; board-only removal stays available.
 */
export function planTrashTargets(plan) {
  const missing = new Set(plan.missingPaths);
  const paths = plan.filePaths.filter((path) => !missing.has(path));
  const reasons = [];
  if (plan.uncertain.length) {
    reasons.push(`有画布无法读取或解析：${plan.uncertain.map((item) => item.path).join('、')}`);
  }
  if (plan.blockedTrash.length) {
    reasons.push(`源文件仍被其他卡片或画布引用：${plan.blockedTrash
      .map((item) => `${item.path}（${item.references.join('、')}）`)
      .join('；')}`);
  }
  if (!paths.length && !reasons.length) reasons.push('没有可移入废纸篓的源文件');
  return { paths, disabled: reasons.length > 0, reason: reasons.join('；') };
}

/** At most `limit` file names are listed in the confirmation; the rest are counted. */
export const DELETE_LIST_LIMIT = 5;

/**
 * Re-checks planned Trash targets against a scan taken *after* the confirmation dialog.
 * Another canvas may have referenced one of these files while the dialog was open, and a
 * canvas that cannot be read makes every target uncertain. Only `allowed` may be trashed.
 *
 * @returns `{ allowed, blocked: [{ path, references, reason }], uncertain }`
 */
export function revalidateTrashTargets(paths, canvasDocuments = []) {
  const targets = [...new Set(paths ?? [])];
  const references = new Map();
  const uncertain = [];
  for (const document of canvasDocuments ?? []) {
    if (document?.error) {
      uncertain.push({ path: document.path, reason: String(document.error.message ?? document.error) });
      continue;
    }
    const nodes = documentNodes(document);
    if (!nodes) {
      uncertain.push({ path: document.path, reason: '画布无法解析' });
      continue;
    }
    for (const node of nodes) {
      for (const reference of nodeFileReferences(node)) {
        if (!references.has(reference.file)) references.set(reference.file, new Set());
        references.get(reference.file).add(document.path);
      }
    }
  }
  const allowed = [];
  const blocked = [];
  for (const path of targets) {
    const refs = [...(references.get(path) ?? [])].sort();
    if (refs.length) blocked.push({ path, references: refs, reason: 'referenced' });
    else if (uncertain.length) blocked.push({ path, references: uncertain.map((item) => item.path), reason: 'uncertain' });
    else allowed.push(path);
  }
  return { allowed, blocked, uncertain };
}

export function listRemovalTargets(plan, limit = DELETE_LIST_LIMIT) {
  const names = plan.filePaths.slice(0, limit);
  return { names, extra: Math.max(0, plan.filePaths.length - names.length) };
}

/** Exact per-file outcome of the Trash pass, so a partial failure is never silent. */
export function summarizeTrash(results) {
  const deleted = results.filter((result) => result.ok).map((result) => result.path);
  const failed = results
    .filter((result) => !result.ok)
    .map((result) => ({ path: result.path, reason: String(result.reason ?? '') }));
  const parts = [];
  if (deleted.length) parts.push(`源文件已移入废纸篓：${deleted.join('、')}`);
  if (failed.length) parts.push(`未能移入废纸篓：${failed.map((item) => `${item.path}（${item.reason}）`).join('；')}`);
  return { deleted, failed, message: parts.join('；') };
}
