/**
 * Selection geometry: what the marquee catches and what moves as one unit.
 *
 * Everything here works in world coordinates, so a marquee drawn at 20% or 300% zoom
 * selects exactly the same cards as long as the caller converts the screen rectangle
 * through the current viewport first. Nothing in this module reads the DOM or the board
 * file.
 */

import { isCardNode, isGroupNode, renderedNodeHeight } from './board-model.js';

/** Normalizes two corner points into `{ left, top, right, bottom }` (top-left first). */
export function rectFromPoints(a, b) {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/** The world rectangle a node occupies on screen; collapsed cards use their rendered height. */
export function nodeWorldRect(node) {
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + renderedNodeHeight(node),
  };
}

/** Edge-touching counts as a hit, which is how every canvas marquee behaves in practice. */
export function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/**
 * The selection a marquee produces. Cards are selected on contact. A group frame is only
 * added once every one of its members is already inside the marquee, so dragging the result
 * cannot silently pull in cards the rectangle never touched.
 *
 * `base` is the selection the gesture started from (Shift/Cmd-drag is additive).
 */
export function marqueeSelection(nodes, rect, { base } = {}) {
  const selection = new Set(base ?? []);
  const cards = (nodes ?? []).filter((node) => isCardNode(node) && rectsIntersect(nodeWorldRect(node), rect));
  const hitIds = new Set(cards.map((node) => node.id));
  for (const id of hitIds) selection.add(id);
  for (const group of (nodes ?? []).filter(isGroupNode)) {
    if (!Array.isArray(group.members) || !group.members.length) continue;
    if (group.members.every((id) => hitIds.has(id))) selection.add(group.id);
  }
  return selection;
}

/** Cmd/Ctrl+A: every card and every group frame, nothing else. */
export function selectAllIds(nodes) {
  const selection = new Set();
  for (const node of nodes ?? []) {
    if (isCardNode(node) || isGroupNode(node)) selection.add(node.id);
  }
  return selection;
}

/** Cmd/Ctrl-click: add a node to the selection, or take it back out. */
export function toggleSelectedId(selection, id) {
  const next = new Set(selection ?? []);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Places every dragged snapshot at its original position plus the pointer delta. Positions
 * come from the snapshot, not the live node, so repeated moves never accumulate drift and
 * every object keeps its exact relative distance.
 */
export function applyDrag(items, dx, dy) {
  for (const item of items ?? []) {
    item.node.x = item.x + dx;
    item.node.y = item.y + dy;
  }
  return items ?? [];
}

/**
 * The nodes one drag must translate, exactly once each.
 *
 * A selected group brings its frame and every member; a member that is also selected
 * itself is still moved only once. Without this a whole-group drag would move the frame
 * while the cards stayed behind, or a marquee that caught both would double-count them.
 */
export function dragTargets(nodes, selection) {
  const ids = new Set();
  const list = nodes ?? [];
  const selected = selection instanceof Set ? selection : new Set(selection ?? []);
  const byId = new Map(list.map((node) => [node.id, node]));
  for (const id of selected) {
    const node = byId.get(id);
    if (!node) continue;
    if (isGroupNode(node)) {
      ids.add(node.id);
      for (const member of node.members ?? []) if (byId.has(member)) ids.add(member);
    } else if (isCardNode(node)) {
      ids.add(node.id);
    }
  }
  return [...ids].map((id) => byId.get(id));
}

/**
 * The units a layout command arranges. A selected group is one rectangle and carries its
 * members with it; a card that belongs to a group the user did not select is not a unit,
 * so laying out a handful of loose cards never moves cards inside an untouched frame.
 */
export function layoutUnits(nodes, selection) {
  const list = nodes ?? [];
  const selected = selection instanceof Set ? selection : new Set(selection ?? []);
  const byId = new Map(list.map((node) => [node.id, node]));
  const grouped = new Set();
  for (const group of list.filter(isGroupNode)) {
    for (const member of group.members ?? []) grouped.add(member);
  }

  const units = [];
  const covered = new Set();
  for (const id of selected) {
    const node = byId.get(id);
    if (!node || !isGroupNode(node)) continue;
    const members = (node.members ?? []).map((memberId) => byId.get(memberId)).filter(Boolean);
    units.push({ id: node.id, kind: 'group', nodes: [node, ...members] });
    covered.add(node.id);
    for (const member of members) covered.add(member.id);
  }
  for (const id of selected) {
    const node = byId.get(id);
    if (!node || !isCardNode(node) || covered.has(node.id)) continue;
    if (grouped.has(node.id)) continue;
    units.push({ id: node.id, kind: 'card', nodes: [node] });
  }
  return units;
}
