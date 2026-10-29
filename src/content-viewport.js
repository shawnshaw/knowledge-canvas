/**
 * "Show me everything": the bounds of the board's content and the viewport that fits it.
 * Group frames are deliberately excluded from the bounds — they are derived from their
 * members, so including them would only inflate the result by the frame padding.
 */

import { isCardNode, renderedNodeHeight } from './board-model.js';
import { clampScale } from './viewport.js';

export const FIT_PADDING = 64;

/** The union of every card's rendered rectangle, or null for an empty canvas. */
export function contentBounds(nodes) {
  const cards = (nodes ?? []).filter(isCardNode);
  if (!cards.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of cards) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + renderedNodeHeight(node));
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * The viewport that centres `bounds` in `{ width, height }` with `padding` screen pixels
 * around it. Returns null when there is nothing to fit or the stage has no size, so the
 * caller can leave the viewport untouched and explain why.
 */
export function fitViewport(bounds, { width, height } = {}, { padding = FIT_PADDING } = {}) {
  if (!bounds || !(width > 0) || !(height > 0)) return null;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const fitWidth = availableWidth / Math.max(bounds.width, 1);
  const fitHeight = availableHeight / Math.max(bounds.height, 1);
  // A single small card would otherwise zoom to 300% and feel like a jump-cut.
  const scale = clampScale(Math.min(fitWidth, fitHeight));
  return {
    x: (width - bounds.width * scale) / 2 - bounds.left * scale,
    y: (height - bounds.height * scale) / 2 - bounds.top * scale,
    scale,
  };
}
