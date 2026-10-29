/**
 * What a cancelled pointer gesture must undo.
 *
 * The system can cancel a pointer at any moment (touch interruption, window blur, a
 * native drag taking over). Geometry gestures must put every touched node back exactly
 * where the drag started; marquee, pan and connect never changed the board at all.
 */

import { restoreGeometry } from './board-model.js';

export const GEOMETRY_GESTURES = Object.freeze(['move', 'resize', 'group-move']);

/**
 * Restores the snapshot for a geometry gesture.
 * @returns `{ kind, restored }` — `restored` is true only when the board was rolled back.
 */
export function cancelGestureGeometry(board, gesture) {
  if (!gesture) return { kind: null, restored: false };
  const kind = gesture.kind ?? null;
  if (!GEOMETRY_GESTURES.includes(kind)) return { kind, restored: false };
  if (!Array.isArray(gesture.nodes) || !gesture.nodes.length) return { kind, restored: false };
  restoreGeometry(board, gesture.nodes);
  return { kind, restored: true };
}

/** A pan owns the viewport, not the board; the caller restores it from the gesture. */
export function isPanGesture(gesture) {
  return gesture?.kind === 'pan';
}
