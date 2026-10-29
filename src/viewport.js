/** The one zoom range: wheel, buttons and fit-to-content all clamp to it. */
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

export function clampScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function screenToWorld(point, viewport) {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}

export function worldToScreen(point, viewport) {
  return { x: point.x * viewport.scale + viewport.x, y: point.y * viewport.scale + viewport.y };
}

export function zoomAt(anchor, delta, viewport) {
  const world = screenToWorld(anchor, viewport);
  const scale = clampScale(viewport.scale * (1 + delta));
  return { x: anchor.x - world.x * scale, y: anchor.y - world.y * scale, scale };
}
