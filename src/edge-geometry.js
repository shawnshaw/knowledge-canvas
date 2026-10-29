/**
 * Connector geometry. Pure maths over already-resolved rectangles: the view passes boxes that
 * already account for a collapsed card, so this module needs no board knowledge at all.
 */

export const EDGE_ROUTES = Object.freeze(['curve', 'straight', 'elbow']);
export const DEFAULT_EDGE_ROUTE = 'curve';

/** Breathing room kept between a relation label and the nearest card, in canvas units. */
export const LABEL_PADDING = 12;
/** Perpendicular nudge the label tries when the midpoint of an edge is crowded. */
export const LABEL_NORMAL_OFFSET = 16;

const MIN_BEND = 40;
const BEND_RATIO = 0.4;
const CORNER_RADIUS = 8;
const CURVE_SAMPLES = 40;
const LABEL_RATIOS = Object.freeze([0.5, 0.38, 0.62, 0.25, 0.75]);
const LABEL_NORMAL_STEPS = Object.freeze([0, 1, -1]);

export function isEdgeRoute(value) {
  return EDGE_ROUTES.includes(value);
}

/** Anything unrecognised renders as the default, which is why old files need no migration. */
export function normalizeEdgeRoute(value) {
  return isEdgeRoute(value) ? value : DEFAULT_EDGE_ROUTE;
}

function centreOf(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Where the ray from a rectangle's centre towards another point leaves the rectangle. */
function borderPoint(rect, towards) {
  const centre = centreOf(rect);
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  if (dx === 0 && dy === 0) return centre;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : (rect.width / 2) / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : (rect.height / 2) / Math.abs(dy),
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

const round = (value) => Math.round(value * 1000) / 1000;
const point = (position) => `${round(position.x)} ${round(position.y)}`;

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function towards(from, to, length) {
  const span = distance(from, to);
  if (span === 0) return { ...from };
  const ratio = Math.min(length, span / 2) / span;
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

/** Drops repeated and collinear vertices so a straight run never emits a phantom corner. */
function simplify(points) {
  const deduped = points.filter((position, index) => index === 0 || distance(points[index - 1], position) > 1e-9);
  if (deduped.length < 3) return deduped;
  const kept = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const previous = kept.at(-1);
    const corner = deduped[i];
    const next = deduped[i + 1];
    const cross = (corner.x - previous.x) * (next.y - previous.y) - (corner.y - previous.y) * (next.x - previous.x);
    if (Math.abs(cross) > 1e-9) kept.push(corner);
  }
  kept.push(deduped.at(-1));
  return kept;
}

/** The point half way along the drawn path, by arc length rather than by chord. */
function polylineMidpoint(points) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const span = distance(points[i - 1], points[i]);
    lengths.push(span);
    total += span;
  }
  let target = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const ratio = lengths[i] === 0 ? 0 : target / lengths[i];
      const start = points[i];
      const end = points[i + 1];
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    target -= lengths[i];
  }
  return { ...points[0] };
}

function roundedPolyline(vertices, radius = CORNER_RADIUS) {
  if (vertices.length < 2) return '';
  let d = `M ${point(vertices[0])}`;
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const previous = vertices[i - 1];
    const corner = vertices[i];
    const next = vertices[i + 1];
    const limit = Math.min(radius, distance(previous, corner) / 2, distance(corner, next) / 2);
    d += ` L ${point(towards(corner, previous, limit))} Q ${point(corner)} ${point(towards(corner, next, limit))}`;
  }
  return `${d} L ${point(vertices.at(-1))}`;
}

function straightPath(start, end) {
  return { d: `M ${point(start)} L ${point(end)}`, labelPoint: polylineMidpoint([start, end]), points: [start, end] };
}

function cubicAt(start, first, second, end, t) {
  const inverse = 1 - t;
  return {
    x: (inverse ** 3) * start.x + 3 * (inverse ** 2) * t * first.x + 3 * inverse * (t ** 2) * second.x + (t ** 3) * end.x,
    y: (inverse ** 3) * start.y + 3 * (inverse ** 2) * t * first.y + 3 * inverse * (t ** 2) * second.y + (t ** 3) * end.y,
  };
}

function curvePath(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const direction = (horizontal ? Math.sign(dx) : Math.sign(dy)) || 1;
  const bend = Math.max(MIN_BEND, (horizontal ? Math.abs(dx) : Math.abs(dy)) * BEND_RATIO);
  const first = horizontal
    ? { x: start.x + direction * bend, y: start.y }
    : { x: start.x, y: start.y + direction * bend };
  const second = horizontal
    ? { x: end.x - direction * bend, y: end.y }
    : { x: end.x, y: end.y - direction * bend };
  const points = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) points.push(cubicAt(start, first, second, end, i / CURVE_SAMPLES));
  return {
    d: `M ${point(start)} C ${point(first)}, ${point(second)}, ${point(end)}`,
    labelPoint: cubicAt(start, first, second, end, 0.5),
    points,
  };
}

function elbowPath(start, end) {
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const vertices = simplify(horizontal
    ? [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]
    : [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]);
  if (vertices.length < 2) return straightPath(start, end);
  return { d: roundedPolyline(vertices), labelPoint: polylineMidpoint(vertices), points: vertices };
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** The point at a given fraction of the path's arc length (0 at the start, 1 at the end). */
function pointAtRatio(points, ratio) {
  if (points.length < 2) return { ...(points[0] ?? { x: 0, y: 0 }) };
  let target = polylineLength(points) * ratio;
  for (let i = 1; i < points.length; i += 1) {
    const span = distance(points[i - 1], points[i]);
    if (target <= span || i === points.length - 1) {
      const r = span === 0 ? 0 : target / span;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * r,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * r,
      };
    }
    target -= span;
  }
  return { ...points[0] };
}

/** The segment the given arc-length ratio lands on, so a normal can be derived. */
function segmentAt(points, ratio) {
  if (points.length < 2) {
    const only = points[0] ?? { x: 0, y: 0 };
    return { start: only, end: only };
  }
  let target = polylineLength(points) * ratio;
  for (let i = 1; i < points.length; i += 1) {
    const span = distance(points[i - 1], points[i]);
    if (target <= span || i === points.length - 1) return { start: points[i - 1], end: points[i] };
    target -= span;
  }
  return { start: points[0], end: points[1] };
}

/** Shifts a path point sideways by `amount`, perpendicular to the local segment. */
function normalOffset(points, ratio, amount) {
  const position = pointAtRatio(points, ratio);
  const { start, end } = segmentAt(points, ratio);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: position.x - (dy / length) * amount, y: position.y + (dx / length) * amount };
}

function inflateRect(rect) {
  return {
    x: rect.x - LABEL_PADDING,
    y: rect.y - LABEL_PADDING,
    width: rect.width + LABEL_PADDING * 2,
    height: rect.height + LABEL_PADDING * 2,
  };
}

const FULL_WIDTH_RANGES = Object.freeze([
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f],
  [0xff00, 0xff60], [0xffe0, 0xffe6],
]);

/** Approximate advance width of a glyph, so a label's real box can be tested for overlap. */
function glyphWidth(char, fontSize) {
  const code = char.codePointAt(0);
  for (const [start, end] of FULL_WIDTH_RANGES) {
    if (code >= start && code <= end) return fontSize;
  }
  return fontSize * 0.55;
}

/**
 * Estimates the rendered size of a relation label, including the padding of its background pill.
 * Used so collision tests measure the label's actual box, not just its anchor point.
 */
export function estimateLabelSize(text, { fontSize = 13, paddingX = 8, paddingY = 4 } = {}) {
  let width = 0;
  for (const char of String(text ?? '')) width += glyphWidth(char, fontSize);
  return {
    width: Math.round(width + paddingX * 2),
    height: Math.round(fontSize + paddingY * 2),
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function overlapArea(a, b) {
  if (!rectsOverlap(a, b)) return 0;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

function maxOverlapArea(rect, rects) {
  let max = 0;
  for (const other of rects) {
    const area = overlapArea(rect, other);
    if (area > max) max = area;
  }
  return max;
}

/** Zero outside a rectangle; inside, the shortest distance back to its edge. */
function penetrationDepth(point, rect) {
  if (point.x < rect.x || point.x > rect.x + rect.width || point.y < rect.y || point.y > rect.y + rect.height) return 0;
  return Math.min(point.x - rect.x, rect.x + rect.width - point.x, point.y - rect.y, rect.y + rect.height - point.y);
}

function maxPenetration(point, rects) {
  let max = 0;
  for (const rect of rects) {
    const depth = penetrationDepth(point, rect);
    if (depth > max) max = depth;
  }
  return max;
}

/**
 * The exact rectangle a relation label occupies for a given anchor point: centred on the
 * point and sized to the label. This is the single source of truth used by BOTH the
 * collision test in `edgeLabelPoint` and the SVG pill the view renders, so the two can
 * never drift apart.
 */
export function labelRectAt(position, labelSize) {
  return {
    x: position.x - labelSize.width / 2,
    y: position.y - labelSize.height / 2,
    width: labelSize.width,
    height: labelSize.height,
  };
}

/**
 * Picks a label anchor that stays clear of the cards. The midpoint is the home position;
 * when a card covers it the anchor walks along the edge (38%/62%, then 25%/75%) and nudges
 * perpendicular, taking the first spot clear of every card. If the edge is fully hemmed in,
 * the least-overlapping candidate wins instead of hiding the label entirely.
 *
 * When `labelSize` is supplied the label's full box (not its centre point) is tested against
 * the padded cards, so a long label whose centre is clear but whose box clips a card is moved
 * aside. Without `labelSize` the historical point-based behaviour is preserved verbatim.
 */
export function edgeLabelPoint(points, obstacles = [], labelSize) {
  const padded = (obstacles ?? []).map(inflateRect);
  if (labelSize) {
    const rectAt = (position) => labelRectAt(position, labelSize);
    let best = pointAtRatio(points, 0.5);
    let bestOverlap = maxOverlapArea(rectAt(best), padded);
    if (bestOverlap === 0) return best;
    for (const ratio of LABEL_RATIOS) {
      for (const step of LABEL_NORMAL_STEPS) {
        if (ratio === 0.5 && step === 0) continue;
        const candidate = step === 0 ? pointAtRatio(points, ratio) : normalOffset(points, ratio, step * LABEL_NORMAL_OFFSET);
        const overlap = maxOverlapArea(rectAt(candidate), padded);
        if (overlap === 0) return candidate;
        if (overlap < bestOverlap) {
          bestOverlap = overlap;
          best = candidate;
        }
      }
    }
    return best;
  }
  let best = pointAtRatio(points, 0.5);
  let bestPenetration = maxPenetration(best, padded);
  if (bestPenetration === 0) return best;
  for (const ratio of LABEL_RATIOS) {
    for (const step of LABEL_NORMAL_STEPS) {
      if (ratio === 0.5 && step === 0) continue;
      const candidate = step === 0 ? pointAtRatio(points, ratio) : normalOffset(points, ratio, step * LABEL_NORMAL_OFFSET);
      const penetration = maxPenetration(candidate, padded);
      if (penetration === 0) return candidate;
      if (penetration < bestPenetration) {
        bestPenetration = penetration;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * @param from rectangle of the source card (already adjusted for a collapsed card)
 * @param to rectangle of the target card
 * @param obstacles card rectangles the relation label must stay clear of; absent means the
 * label keeps its historical midpoint so old boards render exactly as before
 * @param labelSize optional rendered label box; when present collision is tested against the
 * full label rectangle instead of a single point
 * @returns `{ d, labelPoint }` — an SVG path and the visual midpoint of that path.
 */
export function edgePath(from, to, route, obstacles, labelSize) {
  const start = borderPoint(from, centreOf(to));
  const end = borderPoint(to, centreOf(from));
  const normalized = normalizeEdgeRoute(route);
  const built = normalized === 'straight' ? straightPath(start, end)
    : normalized === 'elbow' ? elbowPath(start, end)
    : curvePath(start, end);
  if (obstacles && obstacles.length) return { d: built.d, labelPoint: edgeLabelPoint(built.points, obstacles, labelSize) };
  return { d: built.d, labelPoint: built.labelPoint };
}
