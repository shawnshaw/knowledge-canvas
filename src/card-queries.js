/**
 * The card/relation queries the canvas view actually calls. They live here rather than
 * inline in the view so the exact predicates the view uses can be regression-tested —
 * a passing `board-model` test does not prove the view passed the right arguments.
 */

import { isExcerptNode, isFileNode, isGroupNode, isTextNode } from './board-model.js';
import { excerptSourcePath } from './excerpt-anchor.js';

const LABEL_LIMIT = 40;

function baseName(path) {
  return String(path ?? '').split('/').at(-1).replace(/\.md$/i, '');
}

/** A display name for any node kind; never reads a field that kind may not have. */
export function cardLabel(node) {
  if (isFileNode(node)) return baseName(node.file);
  if (isExcerptNode(node)) return baseName(excerptSourcePath(node.kcExcerpt) ?? node.kcExcerpt.sourceFile);
  if (isTextNode(node)) {
    const firstLine = String(node.text ?? '').split('\n').find((line) => line.trim());
    return (firstLine ?? '').trim().slice(0, LABEL_LIMIT) || '文本卡';
  }
  if (isGroupNode(node)) return (typeof node.label === 'string' && node.label.trim()) || '分组';
  return '';
}

/** Collapsing applies to cards only; a group frame is a container, not a card. */
export function findCollapseTarget(board, id) {
  return (board?.nodes ?? []).find((node) => node.id === id && !isGroupNode(node)) ?? null;
}

/** The frame plus every member card — file cards, excerpt stickers, and plain text alike. */
export function groupDragMembers(board, groupId) {
  const group = (board?.nodes ?? []).find((node) => node.id === groupId && isGroupNode(node));
  if (!group) return [];
  return [group, ...board.nodes.filter((node) => !isGroupNode(node) && group.members.includes(node.id))];
}

/**
 * The structural outline is a Markdown-first view, so it receives file cards only and
 * drops any relation that is not file-to-file. Excerpt stickers and plain text nodes stay
 * on the canvas without taking the mode down with them.
 */
export function outlineSelection(board, visibleNodes) {
  const nodes = (visibleNodes ?? []).filter(isFileNode);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (board?.edges ?? []).filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode));
  return { nodes, edges };
}

/** Markdown link promotion needs a real note at both ends; a sticker has nothing to write. */
export function canPromoteToMarkdown(board, edge) {
  const nodes = board?.nodes ?? [];
  const from = nodes.find((node) => node.id === edge?.fromNode);
  const to = nodes.find((node) => node.id === edge?.toNode);
  return Boolean(from && to && isFileNode(from) && isFileNode(to));
}
