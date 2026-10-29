/**
 * Visio-style edge/centre snapping. Pure: the view passes the world rectangle being
 * dragged and the lines of the objects that stay put, and receives the delta plus the
 * guide lines to draw. Thresholds are screen pixels converted through the current zoom,
 * so snapping feels the same at any scale.
 */

import { isCardNode, isGroupNode, renderedNodeHeight } from './board-model.js';

/** The snap distance in screen pixels; converted to world units by `snapThreshold`. */
export const SNAP_SCREEN_PX = 8;

export function snapThreshold(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value) || value <= 0) return SNAP_SCREEN_PX;
  return SNAP_SCREEN_PX / value;
}

function verticalLines(node) {
  return [node.x, node.x + node.width / 2, node.x + node.width];
}

function horizontalLines(node) {
  const height = renderedNodeHeight(node);
  return [node.y, node.y + height / 2, node.y + height];
}

function dedupe(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}

/**
 * Every candidate line on the board except the objects being dragged. Group frames take
 * part too: dragging a loose card next to a frame should snap to the frame's edges.
 */
export function snapLines(nodes, movingIds) {
  const moving = movingIds instanceof Set ? movingIds : new Set(movingIds ?? []);
  const xs = [];
  const ys = [];
  for (const node of nodes ?? []) {
    if (!isCardNode(node) && !isGroupNode(node)) continue;
    if (moving.has(node.id)) continue;
    xs.push(...verticalLines(node));
    ys.push(...horizontalLines(node));
  }
  return { xs: dedupe(xs), ys: dedupe(ys) };
}

function nearest(lines, candidates, threshold) {
  let best = null;
  for (const line of lines) {
    for (const candidate of candidates) {
      const delta = candidate - line;
      const distance = Math.abs(delta);
      if (distance > threshold) continue;
      if (!best
        || distance < best.distance
        || (distance === best.distance && candidate < best.candidate)
        || (distance === best.distance && candidate === best.candidate && line < best.line)) {
        best = { delta, distance, candidate, line };
      }
    }
  }
  return best;
}

/**
 * @returns `{ dx, dy, guideX, guideY }` — the offset to add to the dragged geometry and the
 * world positions of the guide lines to draw (`null` when that axis did not snap).
 * `enabled: false` is the Alt override; it always returns a zero delta.
 */
export function snapRect(rect, lines, { threshold = SNAP_SCREEN_PX, enabled = true } = {}) {
  const none = { dx: 0, dy: 0, guideX: null, guideY: null };
  if (!rect || !enabled || !(threshold > 0)) return none;
  const left = rect.left ?? rect.x;
  const top = rect.top ?? rect.y;
  const right = rect.right ?? left + rect.width;
  const bottom = rect.bottom ?? top + rect.height;
  // Each axis considers the near edge, the centre and the far edge of what is moving.
  const x = nearest([left, (left + right) / 2, right], lines?.xs ?? [], threshold);
  const y = nearest([top, (top + bottom) / 2, bottom], lines?.ys ?? [], threshold);
  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guideX: x ? x.candidate : null,
    guideY: y ? y.candidate : null,
  };
}

/** The union rectangle of the nodes being dragged; a group contributes its frame. */
export function dragBounds(nodes) {
  const list = (nodes ?? []).filter((node) => isCardNode(node) || isGroupNode(node));
  if (!list.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of list) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + renderedNodeHeight(node));
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
