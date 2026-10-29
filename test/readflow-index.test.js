import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterReadFlowCandidates, partitionReadFlowCandidates, toReadFlowCandidate } from '../src/readflow-index.js';

const fixture = await readFile(new URL('./fixtures/readflow-highlight.md', import.meta.url), 'utf8');
const file = { path: 'ReadFlow/hl-1.md', basename: '纳瓦尔摘录' };

const candidate = (path, overrides = {}) => ({
  path,
  title: path,
  excerpt: '复利',
  comment: '',
  book: '纳瓦尔宝典',
  chapter: '财富',
  status: '',
  created: '2026-01-01',
  ...overrides,
});

test('only Atomic Markdown becomes an import candidate', () => {
  const result = toReadFlowCandidate(file, fixture, {
    type: 'highlight', chapter: '财富', status: 'unread', created: '2026-01-02',
  });
  assert.deepEqual(result, {
    path: 'ReadFlow/hl-1.md',
    title: '真正的财富不是用时间换钱。',
    excerpt: '真正的财富不是用时间换钱。',
    comment: '长期合作也会产生复利。',
    book: '纳瓦尔宝典',
    chapter: '财富',
    status: 'unread',
    created: '2026-01-02',
  });
  assert.equal(toReadFlowCandidate(file, '# 普通笔记', { type: 'note' }), null);
  assert.equal(toReadFlowCandidate(file, '没有 frontmatter 的摘录', {}), null);
});

test('search matches the excerpt and the comment, case-insensitively', () => {
  const list = [
    candidate('a.md', { excerpt: 'Time is the friend of Compound interest' }),
    candidate('b.md', { excerpt: '无关', comment: '看 COMPOUND 这一句' }),
    candidate('c.md', { excerpt: '完全无关', comment: '也无关' }),
  ];
  assert.deepEqual(filterReadFlowCandidates(list, { query: 'compound' }).map((item) => item.path), ['a.md', 'b.md']);
  assert.deepEqual(filterReadFlowCandidates(list, { query: '  ' }).map((item) => item.path), ['a.md', 'b.md', 'c.md']);
});

test('book, chapter, and status filters compare exactly', () => {
  const list = [
    candidate('a.md', { book: '纳瓦尔宝典', chapter: '财富', status: 'unread' }),
    candidate('b.md', { book: '纳瓦尔宝典', chapter: '幸福', status: 'done' }),
    candidate('c.md', { book: '宝典', chapter: '财富', status: 'unread' }),
  ];
  assert.deepEqual(filterReadFlowCandidates(list, { book: '纳瓦尔宝典' }).map((item) => item.path), ['a.md', 'b.md']);
  assert.deepEqual(filterReadFlowCandidates(list, { chapter: '财富' }).map((item) => item.path), ['a.md', 'c.md']);
  assert.deepEqual(filterReadFlowCandidates(list, { status: 'unread' }).map((item) => item.path), ['a.md', 'c.md']);
  assert.deepEqual(
    filterReadFlowCandidates(list, { book: '纳瓦尔宝典', chapter: '财富', status: 'unread' }).map((item) => item.path),
    ['a.md'],
  );
});

test('partition marks files already on this board and collapses batch duplicates', () => {
  const list = [candidate('a.md'), candidate('b.md'), candidate('a.md'), candidate('c.md')];
  const result = partitionReadFlowCandidates(list, ['b.md']);
  assert.deepEqual(result.added.map((item) => item.path), ['a.md', 'c.md']);
  assert.deepEqual(result.alreadyOnBoard.map((item) => item.path), ['b.md']);
});
