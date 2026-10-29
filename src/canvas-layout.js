/**
 * Layout commands over layout units (see `selection-geometry.layoutUnits`).
 *
 * Pure: it reads each unit's current rectangle and returns the new top-left for every
 * unit. The caller applies the delta to every node of the unit, so a group frame moves
 * together with its members and nothing is written until the caller saves once.
 */

import { renderedNodeHeight } from './board-model.js';

export const CANVAS_LAYOUT_GAP = 24;

export const LAYOUT_COMMANDS = Object.freeze([
  'grid',
  'row',
  'column',
  'align-left',
  'align-center',
  'align-right',
  'align-top',
  'align-middle',
  'align-bottom',
  'distribute-h',
  'distribute-v',
]);

export function isLayoutCommand(value) {
  return LAYOUT_COMMANDS.includes(value);
}

/** The rectangle a unit occupies: a group uses its frame, a card its rendered box. */
export function unitRect(unit) {
  const node = unit?.nodes?.[0];
  if (!node) return null;
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + renderedNodeHeight(node),
    width: node.width,
    height: renderedNodeHeight(node),
  };
}

const byLeft = (a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top;
const byTop = (a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left;

function measured(units) {
  return (units ?? [])
    .map((unit) => ({ unit, rect: unitRect(unit) }))
    .filter((entry) => entry.rect);
}

function bounds(entries) {
  return {
    left: Math.min(...entries.map((entry) => entry.rect.left)),
    top: Math.min(...entries.map((entry) => entry.rect.top)),
    right: Math.max(...entries.map((entry) => entry.rect.right)),
    bottom: Math.max(...entries.map((entry) => entry.rect.bottom)),
  };
}

/**
 * @returns `[{ id, x, y }]` — the new top-left of every unit, in the order they were given.
 * Units the command cannot move keep their current position, so applying the patch is
 * always safe.
 */
export function layoutPatch(units, command, { gap = CANVAS_LAYOUT_GAP } = {}) {
  const entries = measured(units);
  const positions = new Map(entries.map(({ unit, rect }) => [unit.id, { x: rect.left, y: rect.top }]));
  if (!entries.length || !isLayoutCommand(command)) return [...positions].map(([id, point]) => ({ id, ...point }));

  const box = bounds(entries);
  const move = (id, x, y) => positions.set(id, { x, y });

  if (command === 'grid') {
    const ordered = [...entries].sort(byTop);
    const columns = Math.ceil(Math.sqrt(ordered.length));
    const cellWidth = Math.max(...ordered.map((entry) => entry.rect.width)) + gap;
    const cellHeight = Math.max(...ordered.map((entry) => entry.rect.height)) + gap;
    ordered.forEach((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      move(entry.unit.id, box.left + column * cellWidth, box.top + row * cellHeight);
    });
  } else if (command === 'row') {
    let x = box.left;
    for (const entry of [...entries].sort(byLeft)) {
      move(entry.unit.id, x, box.top);
      x += entry.rect.width + gap;
    }
  } else if (command === 'column') {
    let y = box.top;
    for (const entry of [...entries].sort(byTop)) {
      move(entry.unit.id, box.left, y);
      y += entry.rect.height + gap;
    }
  } else if (command.startsWith('align-')) {
    for (const entry of entries) {
      const { rect } = entry;
      if (command === 'align-left') move(entry.unit.id, box.left, rect.top);
      else if (command === 'align-right') move(entry.unit.id, box.right - rect.width, rect.top);
      else if (command === 'align-center') move(entry.unit.id, (box.left + box.right) / 2 - rect.width / 2, rect.top);
      else if (command === 'align-top') move(entry.unit.id, rect.left, box.top);
      else if (command === 'align-bottom') move(entry.unit.id, rect.left, box.bottom - rect.height);
      else if (command === 'align-middle') move(entry.unit.id, rect.left, (box.top + box.bottom) / 2 - rect.height / 2);
    }
  } else if (command === 'distribute-h' && entries.length >= 3) {
    const ordered = [...entries].sort(byLeft);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const span = last.rect.right - first.rect.left;
    const totalWidth = ordered.reduce((sum, entry) => sum + entry.rect.width, 0);
    const step = (span - totalWidth) / (ordered.length - 1);
    let x = first.rect.left;
    for (const entry of ordered) {
      move(entry.unit.id, x, entry.rect.top);
      x += entry.rect.width + step;
    }
  } else if (command === 'distribute-v' && entries.length >= 3) {
    const ordered = [...entries].sort(byTop);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const span = last.rect.bottom - first.rect.top;
    const totalHeight = ordered.reduce((sum, entry) => sum + entry.rect.height, 0);
    const step = (span - totalHeight) / (ordered.length - 1);
    let y = first.rect.top;
    for (const entry of ordered) {
      move(entry.unit.id, entry.rect.left, y);
      y += entry.rect.height + step;
    }
  }

  return (units ?? []).map((unit) => ({ id: unit.id, ...(positions.get(unit.id) ?? { x: 0, y: 0 }) }));
}

/**
 * Applies a patch to a board clone. Every node of a unit receives the same delta, so a
 * group frame and its cards keep their relative layout exactly.
 */
export function applyLayoutPatch(units, patch) {
  const byId = new Map((units ?? []).map((unit) => [unit.id, unit]));
  for (const { id, x, y } of patch ?? []) {
    const unit = byId.get(id);
    if (!unit) continue;
    const anchor = unit.nodes[0];
    if (!anchor) continue;
    const dx = x - anchor.x;
    const dy = y - anchor.y;
    if (dx === 0 && dy === 0) continue;
    for (const node of unit.nodes) {
      node.x += dx;
      node.y += dy;
    }
  }
  return units ?? [];
}
