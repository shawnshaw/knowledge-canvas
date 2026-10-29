import test from 'node:test';
import assert from 'node:assert/strict';
import { UNCHAPTERED, layoutReadFlowCandidates, readFlowChapterKey } from '../src/readflow-layout.js';

const candidate = (path, overrides = {}) => ({
  path,
  title: path,
  excerpt: '',
  comment: '',
  book: 'A书',
  chapter: '第一章',
  status: '',
  created: '2026-01-01',
  ...overrides,
});

const card = (id, file, x, y, size = { width: 320, height: 220 }) => ({ id, type: 'file', file, x, y, ...size });

test('new cards clear the union bounds of existing content', () => {
  const existing = [card('a', 'A.md', 100, 50), card('b', 'B.md', 480, 300)];
  const placements = layoutReadFlowCandidates([candidate('x.md')], existing);
  assert.deepEqual(placements[0].point, { x: 480 + 320 + 96, y: 50 });
});

test('layout never mutates the existing nodes it measures', () => {
  const existing = [card('a', 'A.md', 100, 50)];
  const snapshot = JSON.stringify(existing);
  layoutReadFlowCandidates([candidate('x.md')], existing);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('the first block starts at the origin when the board is empty', () => {
  const placements = layoutReadFlowCandidates([candidate('x.md')], []);
  assert.deepEqual(placements[0].point, { x: 0, y: 0 });
});

test('chapters become columns and books become blocks', () => {
  const list = [
    candidate('a1.md', { chapter: '第一章', created: '2026-01-01' }),
    candidate('a2.md', { chapter: '第一章', created: '2026-01-02' }),
    candidate('a3.md', { chapter: '第二章', created: '2026-01-01' }),
    candidate('b1.md', { book: 'B书', chapter: '第一章', created: '2026-01-01' }),
  ];
  const placements = layoutReadFlowCandidates(list, []);
  const point = (path) => placements.find((item) => item.candidate.path === path).point;

  assert.equal(point('a1.md').x, point('a2.md').x);
  assert.equal(point('a2.md').y - point('a1.md').y, 220 + 40);
  // the two chapters are adjacent columns, whichever side the collation puts them on
  assert.equal(Math.abs(point('a3.md').x - point('a1.md').x), 320 + 40);
  assert.equal(point('b1.md').x, 2 * 320 + 40 + 96);
  assert.equal(point('b1.md').y, 0);
});

test('orders cards by created and then by path inside a chapter', () => {
  const list = [
    candidate('later.md', { created: '2026-02-01' }),
    candidate('b.md', { created: '2026-01-01' }),
    candidate('a.md', { created: '2026-01-01' }),
  ];
  const placements = layoutReadFlowCandidates(list, []);
  assert.deepEqual(placements.map((item) => item.candidate.path), ['a.md', 'b.md', 'later.md']);
  assert.deepEqual(placements.map((item) => item.point.y), [0, 260, 520]);
});

test('a card without a chapter joins the 未分章 column', () => {
  assert.equal(UNCHAPTERED, '未分章');
  assert.equal(readFlowChapterKey({ chapter: '' }), '未分章');
  assert.equal(readFlowChapterKey({}), '未分章');
  assert.equal(readFlowChapterKey({ chapter: '财富' }), '财富');

  const placements = layoutReadFlowCandidates([
    candidate('x.md', { chapter: '' }),
    candidate('y.md', { chapter: '第一章' }),
  ], []);
  const point = (path) => placements.find((item) => item.candidate.path === path).point;
  assert.notEqual(point('x.md').x, point('y.md').x);
});

test('laying out nothing produces nothing', () => {
  assert.deepEqual(layoutReadFlowCandidates([], []), []);
});
