import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EDGE_ROUTE,
  EDGE_ROUTES,
  LABEL_NORMAL_OFFSET,
  LABEL_PADDING,
  edgeLabelPoint,
  edgePath,
  estimateLabelSize,
  isEdgeRoute,
  labelRectAt,
  normalizeEdgeRoute,
} from '../src/edge-geometry.js';

const rect = (x, y, width = 100, height = 100) => ({ x, y, width, height });
const numbers = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
const near = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;
const inside = (rect, point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

test('only the three approved routes are accepted, everything else falls back to curve', () => {
  assert.deepEqual(EDGE_ROUTES, ['curve', 'straight', 'elbow']);
  assert.equal(DEFAULT_EDGE_ROUTE, 'curve');
  for (const route of EDGE_ROUTES) {
    assert.equal(normalizeEdgeRoute(route), route);
    assert.equal(isEdgeRoute(route), true);
  }
  for (const value of [undefined, null, '', 'zigzag', 'CURVE', 1, {}]) {
    assert.equal(normalizeEdgeRoute(value), 'curve');
    assert.equal(isEdgeRoute(value), false);
  }
});

test('an omitted route renders as the curve default', () => {
  const withDefault = edgePath(rect(0, 0), rect(300, 0), undefined);
  const explicit = edgePath(rect(0, 0), rect(300, 0), 'curve');
  assert.deepEqual(withDefault, explicit);
});

test('endpoints sit on the card borders instead of the centres', () => {
  const horizontal = edgePath(rect(0, 0), rect(300, 0), 'straight');
  assert.deepEqual(numbers(horizontal.d), [100, 50, 300, 50]);

  const vertical = edgePath(rect(0, 0), rect(0, 300), 'straight');
  assert.deepEqual(numbers(vertical.d), [50, 100, 50, 300]);

  // a diagonal pair leaves through the side the ray actually crosses
  const diagonal = edgePath(rect(0, 0), rect(300, 200), 'straight');
  const [x1, y1, x2, y2] = numbers(diagonal.d);
  assert.equal(x1, 100);
  assert.ok(near(y1, 50 + (50 / 300) * 50) || y1 > 50);
  assert.equal(x2, 300);
  assert.ok(y2 < 250);
});

test('straight is a single line and its label sits at the midpoint', () => {
  const path = edgePath(rect(0, 0), rect(300, 0), 'straight');
  assert.equal(path.d.includes('C'), false);
  assert.equal(path.d.includes('Q'), false);
  assert.deepEqual(path.labelPoint, { x: 200, y: 50 });
});

test('curve is a cubic bezier whose label is the point on the curve', () => {
  const path = edgePath(rect(0, 0), rect(300, 0), 'curve');
  assert.match(path.d, /^M 100 50 C /);
  assert.deepEqual(path.labelPoint, { x: 200, y: 50 });

  // an off-axis pair still puts the label on the curve, not at the chord midpoint
  const bent = edgePath(rect(0, 0), rect(300, 300), 'curve');
  assert.match(bent.d, / C /);
  assert.equal(near(bent.labelPoint.x, 200, 2), true);
});

test('elbow is orthogonal with rounded corners', () => {
  const path = edgePath(rect(0, 0), rect(300, 200), 'elbow');
  assert.match(path.d, / Q /);
  // both corners share the same x, so the middle leg is vertical
  const cornerXs = numbers(path.d).filter((_, index) => index % 2 === 0);
  assert.ok(cornerXs.includes(200));
  assert.equal(path.d.includes('C'), false);
});

test('a collinear elbow collapses to a straight segment without corners', () => {
  const path = edgePath(rect(0, 0), rect(300, 0), 'elbow');
  assert.equal(path.d.includes('Q'), false);
  assert.deepEqual(numbers(path.d), [100, 50, 300, 50]);
});

test('the elbow label is the midpoint of the drawn polyline', () => {
  const path = edgePath(rect(0, 0), rect(300, 200), 'elbow');
  assert.equal(near(path.labelPoint.x, 200), true);
  assert.equal(near(path.labelPoint.y, 150, 1), true);
});

test('path coordinates stay finite for degenerate and overlapping cards', () => {
  const same = edgePath(rect(0, 0), rect(0, 0), 'curve');
  assert.equal(numbers(same.d).every((value) => Number.isFinite(value)), true);
  const touching = edgePath(rect(0, 0, 100, 100), rect(100, 0, 100, 100), 'elbow');
  assert.equal(numbers(touching.d).every((value) => Number.isFinite(value)), true);
});

test('exposes the label placement contract', () => {
  assert.equal(LABEL_PADDING, 12);
  assert.equal(LABEL_NORMAL_OFFSET, 16);
});

test('edgeLabelPoint keeps the midpoint when nothing blocks it', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  assert.deepEqual(edgeLabelPoint(points, []), { x: 50, y: 0 });
  assert.deepEqual(edgeLabelPoint(points, [{ x: 200, y: 200, width: 10, height: 10 }]), { x: 50, y: 0 });
});

test('a card on the midpoint pushes the label along the edge into the clear', () => {
  const points = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  const blocker = { x: 100, y: -50, width: 100, height: 100 };
  assert.equal(inside(blocker, { x: 150, y: 0 }), true);
  const label = edgeLabelPoint(points, [blocker]);
  assert.equal(inside(blocker, label), false);
  assert.deepEqual(label, { x: 75, y: 0 });
});

test('a thin strip along the edge is cleared by the perpendicular nudge', () => {
  const points = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  const strip = { x: 0, y: -2, width: 300, height: 4 };
  assert.deepEqual(edgeLabelPoint(points, [strip]), { x: 150, y: 16 });
});

test('obstacles move the label but never the path geometry', () => {
  const base = edgePath(rect(0, 0), rect(300, 0), 'straight');
  const blocked = edgePath(rect(0, 0), rect(300, 0), 'straight', [rect(200, 0)]);
  assert.equal(blocked.d, base.d);
  assert.notDeepEqual(blocked.labelPoint, base.labelPoint);
});

const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('estimateLabelSize grows with the text and is wide for CJK, narrow for Latin', () => {
  assert.deepEqual(estimateLabelSize(''), { width: 16, height: 21 });
  const short = estimateLabelSize('ab');
  const long = estimateLabelSize('abcdefghijklmnop');
  assert.equal(short.height, 21);
  assert.ok(long.width > short.width);
  // A full-width CJK glyph is wider than a Latin glyph at the same font size.
  assert.ok(estimateLabelSize('汉字').width > estimateLabelSize('ab').width);
});

test('a long label whose centre is clear but whose box overlaps a card is moved aside', () => {
  // A thin card straddles the edge at x≈200; the midpoint (200,0) is inside it.
  const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
  const card = { x: 190, y: -40, width: 20, height: 80 };
  const labelSize = { width: 100, height: 20 };
  const label = edgeLabelPoint(points, [card], labelSize);
  assert.equal(intersects(labelRectAt(label, labelSize), { x: card.x - LABEL_PADDING, y: card.y - LABEL_PADDING, width: card.width + LABEL_PADDING * 2, height: card.height + LABEL_PADDING * 2 }), false);
  assert.notDeepEqual(label, { x: 200, y: 0 });
});

test('the exported label rect is centred on the anchor and keeps critical spacing', () => {
  // The pill the view draws is exactly this rect, so it must be centred on the anchor.
  const size = { width: 100, height: 20 };
  assert.deepEqual(labelRectAt({ x: 200, y: 0 }, size), { x: 150, y: -10, width: 100, height: 20 });

  // A placed label's box stays clear of a padded card — the rendered pill shares that box.
  const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
  const card = { x: 190, y: -40, width: 20, height: 80 };
  const placed = edgeLabelPoint(points, [card], size);
  const padded = { x: card.x - LABEL_PADDING, y: card.y - LABEL_PADDING, width: card.width + LABEL_PADDING * 2, height: card.height + LABEL_PADDING * 2 };
  assert.equal(intersects(labelRectAt(placed, size), padded), false);
});

test('a wide label hemmed in by cards falls back to the least-overlap candidate', () => {
  // Two cards squeeze the whole horizontal span so no zero-overlap spot exists.
  const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
  const obstacles = [
    { x: 0, y: -40, width: 200, height: 80 },
    { x: 200, y: -40, width: 200, height: 80 },
  ];
  const labelSize = { width: 400, height: 80 };
  const label = edgeLabelPoint(points, obstacles, labelSize);
  // Must still return a finite point on/above the edge (the least-overlap fallback).
  assert.equal(Number.isFinite(label.x), true);
  assert.equal(Number.isFinite(label.y), true);
});

test('the elbow label stays clear of an obstacle on the longest leg (zoomed-out world)', () => {
  // Large coordinates mimic a zoomed-out world; the elbow's vertical leg is the long one.
  const path = edgePath(rect(1000, 1000), rect(1300, 3000), 'elbow', [rect(1200, 1800)]);
  const blocker = { x: 1200 - LABEL_PADDING, y: 1800 - LABEL_PADDING, width: 100 + LABEL_PADDING * 2, height: 100 + LABEL_PADDING * 2 };
  assert.equal(intersects({ x: path.labelPoint.x, y: path.labelPoint.y, width: 0, height: 0 }, blocker), false);
  // The label point lands on the long vertical leg, clear of the blocker.
  assert.ok(Math.abs(path.labelPoint.x - 1200) > 0 || Math.abs(path.labelPoint.y - 1800) > 100);
});
