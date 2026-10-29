import { isCardColorValue, normalizeCardColor, randomStickyColor } from './card-colors.js';
import { validateBoardMeta } from './board-meta.js';
import { DEFAULT_EDGE_ROUTE, isEdgeRoute, normalizeEdgeRoute } from './edge-geometry.js';
import { validateExcerptAnchor } from './excerpt-anchor.js';

const DEFAULT_SIZE = Object.freeze({ width: 320, height: 220 });
const EDGE_ENDS = new Set(['none', 'arrow']);
const GEOMETRY_KEYS = ['x', 'y', 'width', 'height'];

/** Collapsed cards keep their stored height; only the rendered height shrinks. */
export const COLLAPSED_HEIGHT = 56;
/** Breathing room between a group frame and the outermost member edge. */
export const GROUP_PADDING = 32;
/** Excerpt stickers are shorter than a file card: they hold a quote, not a note. */
export const EXCERPT_SIZE = Object.freeze({ width: 320, height: 180 });

export function createBoard() {
  return { nodes: [], edges: [] };
}

export function isFileNode(node) {
  return node?.type === 'file';
}

export function isTextNode(node) {
  return node?.type === 'text';
}

/** An excerpt sticker is a JSON Canvas text node carrying our extension metadata. */
export function isExcerptNode(node) {
  return isTextNode(node) && typeof node.kcExcerpt === 'object' && node.kcExcerpt !== null;
}

export function isGroupNode(node) {
  return node?.type === 'group';
}

/** Everything that can be moved, connected, grouped, collapsed and deleted: file or text. */
export function isCardNode(node) {
  return isFileNode(node) || isTextNode(node);
}

export function createFileNode(file, { x, y, color } = {}) {
  if (!file.toLowerCase().endsWith('.md')) throw new Error('Canvas nodes must reference Markdown files');
  const node = { id: crypto.randomUUID(), type: 'file', file, x, y, ...DEFAULT_SIZE };
  const value = normalizeCardColor(color);
  if (value !== null) node.color = value;
  return node;
}

/**
 * A sticky note is a file card that always starts life with one of the five presets, so the
 * chosen colour is persisted with the card instead of being re-rolled on every render.
 */
export function createStickyNode(file, point, random = Math.random) {
  return createFileNode(file, { ...point, color: randomStickyColor(random) });
}

/** Applies a colour to a card; neutral removes the field. Group frames are not cards. */
export function setCardColor(board, id, color) {
  const node = board.nodes.find((item) => item.id === id && isCardNode(item));
  if (!node) return false;
  const value = normalizeCardColor(color);
  if (value === null) delete node.color;
  else node.color = value;
  return true;
}

/**
 * Excerpt stickers stay a standard JSON Canvas `text` node so Obsidian's own Canvas can
 * still render something meaningful; the reference back to the source lives in `kcExcerpt`.
 */
export function createExcerptNode({ text, point, anchor }) {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    text,
    x: point.x,
    y: point.y,
    ...EXCERPT_SIZE,
    kcExcerpt: anchor,
  };
}

/** Lowercased haystack a search query is matched against. */
export function cardSearchText(node) {
  if (isFileNode(node)) return String(node.file ?? '').toLowerCase();
  if (isExcerptNode(node)) return `${node.kcExcerpt.quote} ${node.kcExcerpt.sourceFile}`.toLowerCase();
  if (isTextNode(node)) return String(node.text ?? '').toLowerCase();
  return '';
}

export function createEdge(from, to, options = {}) {
  return {
    id: crypto.randomUUID(),
    fromNode: from.id,
    toNode: to.id,
    fromEnd: options.fromEnd ?? 'none',
    toEnd: options.toEnd ?? 'arrow',
    ...(options.label ? { label: options.label } : {}),
  };
}

/** Applies a route to a relation; the default is stored as no field at all. */
export function setEdgeRoute(board, id, route) {
  const edge = board.edges.find((item) => item.id === id);
  if (!edge) return false;
  const value = normalizeEdgeRoute(route);
  if (value === DEFAULT_EDGE_ROUTE) delete edge.kcRoute;
  else edge.kcRoute = value;
  return true;
}

/** Renaming a note updates both the card reference and every excerpt pointing at it. */
export function updateFilePath(board, oldPath, newPath) {
  let changed = false;
  for (const node of board.nodes) {
    if (node.file === oldPath) { node.file = newPath; changed = true; }
    if (node.kcExcerpt?.sourceFile === oldPath) { node.kcExcerpt.sourceFile = newPath; changed = true; }
  }
  return changed;
}

export function renderedNodeHeight(node) {
  return isCardNode(node) && node.collapsed === true ? COLLAPSED_HEIGHT : node.height;
}

export function setCollapsed(board, id, collapsed) {
  const node = board.nodes.find((item) => item.id === id && isCardNode(item));
  if (!node) return false;
  if (collapsed) node.collapsed = true;
  else delete node.collapsed;
  for (const group of board.nodes.filter((item) => isGroupNode(item) && item.members.includes(id))) reflowGroup(board, group.id);
  return true;
}

function memberBounds(members) {
  const left = Math.min(...members.map((node) => node.x));
  const top = Math.min(...members.map((node) => node.y));
  const right = Math.max(...members.map((node) => node.x + node.width));
  const bottom = Math.max(...members.map((node) => node.y + renderedNodeHeight(node)));
  return { left, top, right, bottom };
}

export function createGroup(nodes, label) {
  const members = nodes.filter(isCardNode);
  if (members.length < 2) throw new Error('A group needs at least two cards');
  const { left, top, right, bottom } = memberBounds(members);
  const trimmed = String(label ?? '').trim();
  return {
    id: crypto.randomUUID(),
    type: 'group',
    ...(trimmed ? { label: trimmed } : {}),
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2,
    members: members.map((node) => node.id),
  };
}

export function reflowGroup(board, groupId) {
  const group = board.nodes.find((node) => node.id === groupId && isGroupNode(node));
  if (!group) return false;
  const members = board.nodes.filter((node) => isCardNode(node) && group.members.includes(node.id));
  if (!members.length) return false;
  const { left, top, right, bottom } = memberBounds(members);
  group.x = left - GROUP_PADDING;
  group.y = top - GROUP_PADDING;
  group.width = right - left + GROUP_PADDING * 2;
  group.height = bottom - top + GROUP_PADDING * 2;
  return true;
}

/**
 * Records the geometry of every node a live drag can touch, so a failed save can put
 * the canvas back exactly as it was instead of leaving it half-moved.
 */
export function snapshotGeometry(nodes) {
  return nodes.map((node) => ({ node, x: node.x, y: node.y, width: node.width, height: node.height }));
}

/**
 * Restores a snapshot and re-derives any group frame that contains a restored card.
 * A frame that was itself part of the snapshot is restored directly and is not
 * recomputed, so a whole-group drag cannot drift.
 */
export function restoreGeometry(board, snapshot) {
  const directlyRestored = new Set();
  for (const entry of snapshot) {
    // Resolve by id: a queued write may have installed a fresh board object, and mutating
    // the snapshot's old node reference would silently restore nothing.
    const node = board.nodes.find((candidate) => candidate.id === entry.node.id);
    if (!node) continue;
    node.x = entry.x;
    node.y = entry.y;
    node.width = entry.width;
    node.height = entry.height;
    directlyRestored.add(node.id);
  }
  for (const group of board.nodes.filter(isGroupNode)) {
    if (directlyRestored.has(group.id)) continue;
    if (group.members.some((id) => directlyRestored.has(id))) reflowGroup(board, group.id);
  }
  return directlyRestored;
}

export function moveGroup(board, groupId, dx, dy) {
  const group = board.nodes.find((node) => node.id === groupId && isGroupNode(node));
  if (!group) return false;
  group.x += dx;
  group.y += dy;
  for (const node of board.nodes) {
    if (isCardNode(node) && group.members.includes(node.id)) {
      node.x += dx;
      node.y += dy;
    }
  }
  return true;
}

export function ungroup(board, groupId) {
  const index = board.nodes.findIndex((node) => node.id === groupId && isGroupNode(node));
  if (index < 0) return false;
  board.nodes.splice(index, 1);
  return true;
}

export function removeFromBoard(board, ids) {
  const removedNodes = new Set(board.nodes.filter((node) => ids.has(node.id)).map((node) => node.id));
  const kept = board.nodes.filter((node) => !removedNodes.has(node.id));
  const dropped = new Set();
  for (const node of kept) {
    if (!isGroupNode(node) || !Array.isArray(node.members)) continue;
    node.members = node.members.filter((id) => !removedNodes.has(id));
    if (node.members.length < 2) dropped.add(node.id);
  }
  board.nodes = kept.filter((node) => !dropped.has(node.id));
  board.edges = board.edges.filter((edge) => !ids.has(edge.id)
    && !removedNodes.has(edge.fromNode) && !removedNodes.has(edge.toNode)
    && !dropped.has(edge.fromNode) && !dropped.has(edge.toNode));
}

function hasValidGeometry(node) {
  return GEOMETRY_KEYS.every((key) => typeof node[key] === 'number' && Number.isFinite(node[key]))
    && node.width > 0 && node.height > 0;
}

export function parseBoard(raw) {
  let board;
  try {
    board = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('Invalid canvas document');
  }
  if (!board || !Array.isArray(board.nodes) || !Array.isArray(board.edges)) throw new Error('Invalid canvas document');
  // A board without kcMeta is a normal legacy board; a malformed one is refused rather
  // than silently ignored, so new notes never end up in a path we would not have written.
  const metaReason = validateBoardMeta(board.kcMeta);
  if (metaReason) throw new Error(`画布扩展信息无效：${metaReason}`);

  const ids = new Set();
  const cards = new Set();
  for (const node of board.nodes) {
    if (!node?.id || ids.has(node.id)) throw new Error('Invalid or duplicate node id');
    if (!hasValidGeometry(node)) throw new Error('Canvas nodes need finite positive geometry');
    ids.add(node.id);
    if (node.type === 'file') {
      if (typeof node.file !== 'string' || !node.file.toLowerCase().endsWith('.md')) {
        throw new Error('Canvas nodes must reference Markdown files');
      }
    } else if (node.type === 'text') {
      if (typeof node.text !== 'string') throw new Error('Canvas text nodes need a text field');
      // A text node without our metadata is what Obsidian's own Canvas leaves behind, so it
      // is accepted as a read-only card. Only metadata we wrote ourselves must be well formed.
      if (node.kcExcerpt !== undefined) {
        const reason = validateExcerptAnchor(node.kcExcerpt);
        if (reason) throw new Error(`摘录贴纸数据无效：${reason}`);
      }
    } else if (node.type === 'group') {
      if (node.label !== undefined && typeof node.label !== 'string') throw new Error('Invalid group label');
    } else {
      throw new Error('Unsupported canvas node type');
    }
    if (isCardNode(node)) {
      if (node.collapsed !== undefined && typeof node.collapsed !== 'boolean') throw new Error('Invalid collapsed flag');
      // A hand-edited null reads as neutral rather than locking the board; we never write one.
      if (node.color !== undefined && node.color !== null && !isCardColorValue(node.color)) {
        throw new Error('Unsupported canvas node color');
      }
      cards.add(node.id);
    }
  }

  const grouped = new Set();
  for (const node of board.nodes) {
    if (node.type !== 'group') continue;
    if (!Array.isArray(node.members)) throw new Error('Group nodes need a members list');
    const seen = new Set();
    for (const member of node.members) {
      if (!cards.has(member)) throw new Error('Group members must reference cards on this canvas');
      if (seen.has(member)) throw new Error('Duplicate group member');
      if (grouped.has(member)) throw new Error('A card belongs to more than one group');
      seen.add(member);
      grouped.add(member);
    }
  }

  for (const edge of board.edges) {
    if (!edge?.id || !ids.has(edge.fromNode) || !ids.has(edge.toNode)) throw new Error('Edge references missing node');
    if (!cards.has(edge.fromNode) || !cards.has(edge.toNode)) throw new Error('Edges can only connect cards');
    if (!EDGE_ENDS.has(edge.fromEnd ?? 'none') || !EDGE_ENDS.has(edge.toEnd ?? 'none')) throw new Error('Unsupported edge end');
    // A hand-edited null reads as the default route rather than locking the board.
    if (edge.kcRoute !== undefined && edge.kcRoute !== null && !isEdgeRoute(edge.kcRoute)) {
      throw new Error('Unsupported edge route');
    }
  }
  return board;
}
