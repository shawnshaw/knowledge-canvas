import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT_PADDING, contentBounds, fitViewport } from '../src/content-viewport.js';
import { MAX_SCALE, MIN_SCALE } from '../src/viewport.js';

const card = (id, x, y, width = 100, height = 80, extra = {}) => ({ id, type: 'file', file: `${id}.md`, x, y, width, height, ...extra });
const groupNode = (id, x, y, width, height, members) => ({ id, type: 'group', x, y, width, height, members });

test('bounds cover every card and ignore group frames', () => {
  const nodes = [
    card('a', 0, 0),
    card('b', 300, 200),
    groupNode('g', -100, -100, 900, 900, ['a', 'b']),
  ];
  assert.deepEqual(contentBounds(nodes), { left: 0, top: 0, right: 400, bottom: 280, width: 400, height: 280 });
});

test('a collapsed card contributes its rendered height', () => {
  assert.equal(contentBounds([card('a', 0, 0, 100, 300, { collapsed: true })]).height, 56);
});

test('an empty canvas has no bounds, so nothing can be fitted', () => {
  assert.equal(contentBounds([]), null);
  assert.equal(contentBounds([groupNode('g', 0, 0, 100, 100, [])]), null);
  assert.equal(fitViewport(null, { width: 800, height: 600 }), null);
  assert.equal(fitViewport(contentBounds([card('a', 0, 0)]), { width: 0, height: 0 }), null);
});

test('fitting centres the content with the standard padding', () => {
  const bounds = contentBounds([card('a', 0, 0, 100, 100)]);
  const viewport = fitViewport(bounds, { width: 600, height: 400 });
  // 600-128 = 472 wide, 400-128 = 272 tall; the height is the binding constraint.
  assert.equal(viewport.scale, 2.72);
  assert.equal(viewport.x, (600 - 272) / 2);
  assert.equal(viewport.y, (400 - 272) / 2);
});

test('a single card does not exceed the maximum zoom', () => {
  const viewport = fitViewport(contentBounds([card('a', 0, 0, 10, 10)]), { width: 1000, height: 800 });
  assert.equal(viewport.scale, MAX_SCALE);
  assert.ok(viewport.scale <= 3);
});

test('huge bounds clamp to the minimum zoom instead of collapsing', () => {
  const viewport = fitViewport(contentBounds([card('a', 0, 0, 200000, 200000)]), { width: 800, height: 600 });
  assert.equal(viewport.scale, MIN_SCALE);
  assert.ok(viewport.x <= 0 && viewport.y <= 0, 'the content is centred, so it starts off-canvas');
});

test('the padding is subtracted from both axes', () => {
  const bounds = contentBounds([card('a', 0, 0, 1000, 500)]);
  const tight = fitViewport(bounds, { width: 1000, height: 600 }, { padding: 0 });
  const padded = fitViewport(bounds, { width: 1000, height: 600 }, { padding: FIT_PADDING });
  assert.ok(padded.scale < tight.scale);
  assert.equal(FIT_PADDING, 64);
});

test('the fitted viewport centres the content box exactly', () => {
  const bounds = contentBounds([card('a', 100, 100, 200, 100), card('b', 400, 300, 200, 100)]);
  const viewport = fitViewport(bounds, { width: 1000, height: 800 });
  const centreX = (bounds.left + bounds.width / 2) * viewport.scale + viewport.x;
  const centreY = (bounds.top + bounds.height / 2) * viewport.scale + viewport.y;
  assert.equal(centreX, 500);
  assert.equal(centreY, 400);
});
