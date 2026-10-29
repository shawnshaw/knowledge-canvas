/**
 * Where a freshly created excerpt sticker lands. Kept pure so the "never fully
 * overlapping" rule is testable without a DOM.
 */

/** Distance from the source card, and the diagonal step between consecutive stickers. */
export const EXCERPT_STEP = 32;
/** How many steps before the horizontal stagger wraps back to the card edge. */
const STAGGER = 4;

/**
 * @param sourceNode the file card the excerpt came from, or null when it is not on the board
 * @param existingCount how many excerpts from the same source already sit on the board
 */
export function nextExcerptPoint(sourceNode, existingCount, { step = EXCERPT_STEP } = {}) {
  const baseX = sourceNode ? sourceNode.x + sourceNode.width + step : 160;
  const baseY = sourceNode ? sourceNode.y : 120;
  const index = Math.max(0, Number(existingCount) || 0);
  return { x: baseX + (index % STAGGER) * step, y: baseY + index * step };
}
